import { browserAgentOperationContext } from "../agent-operation-context";
import type { WebContents } from "electron";

import type {
  WorkbenchBrowserSharedControlEvent,
  WorkbenchBrowserSharedControlStateEvent,
  WorkbenchLumenFollowAudit
} from "../../../shared/desktop-bridge";
import {
  buildAgentCursorOverlayScript,
  buildAgentCursorThoughtScript,
  type BrowserAgentCursorOverlayAction,
  type BrowserAgentCursorOverlayPhase
} from "../agent-cursor-overlay";
import { readAgentCursorThought, registerAgentCursorThoughtPaint } from "../agent-cursor-thought";
import { compactFollowSession } from "../lumen-follow-audit";
import {
  createIdleSharedControlSnapshot,
  isCriticalBrowserAgentAction,
  isSharedControlPaused,
  transitionSharedControlForAgentAction,
  transitionSharedControlForDecision,
  transitionSharedControlForUserInput,
  transitionSharedControlToAwaitingDecision,
  transitionSharedControlToIdle,
  type SharedControlDecision,
  type SharedControlInputType,
  type SharedControlSnapshot
} from "../shared-control";
import type {
  WorkbenchBrowserAgentInteraction,
  WorkbenchBrowserAgentTargetMode,
  WorkbenchBrowserPublishEvent
} from "../types";
import {
  MAX_BROWSER_AGENT_FOLLOW_ACTIONS,
  MAX_BROWSER_AGENT_FOLLOW_FRAMES
} from "./normalizers";
import {
  SharedControlInterruptionError,
  type BrowserAgentFollowSession,
  type BrowserAgentPageTarget,
  type BrowserPageEntry
} from "./types";

type SharedControlControllerHost = {
  readonly publishEvent: WorkbenchBrowserPublishEvent;
  readonly entries?: Map<string, BrowserPageEntry>;
  readonly getLiveEntry: (tabId: string) => BrowserPageEntry | undefined;
  readonly readAgentFollowFinalPageState: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ) => WorkbenchLumenFollowAudit["finalPageState"];
};

export const createSharedControlController = ({
  publishEvent,
  entries,
  getLiveEntry,
  readAgentFollowFinalPageState
}: SharedControlControllerHost) => {
  const followSessions = new Map<string, BrowserAgentFollowSession>();
  const taskTurnsByPage = new Map<string, Set<string>>();
  const agentSyntheticInputUntil = new Map<string, number>();
  const userInputDirtyTabs = new Set<string>();
  const sharedControlStates = new Map<string, SharedControlSnapshot>();
  const sharedControlTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const lastControlHandoffByTabId = new Map<string, WorkbenchBrowserSharedControlEvent>();
  let cursorThoughtTabId: string | null = null;

  registerAgentCursorThoughtPaint((thought) => {
    if (cursorThoughtTabId === null) return;
    const entry = getLiveEntry(cursorThoughtTabId);
    if (entry === undefined || entry.webContents.isDestroyed()) return;
    void entry.webContents.executeJavaScript(buildAgentCursorThoughtScript(thought), true).catch(() => undefined);
  });

  const followSessionKey = (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ): string => `${targetMode}:${tabId}`;

  const ensureFollowSession = (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ): BrowserAgentFollowSession => {
    const key = followSessionKey(tabId, targetMode);
    const existing = followSessions.get(key);
    if (existing !== undefined && existing.endedAt === null) {
      return existing;
    }
    const created: BrowserAgentFollowSession = {
      sessionId: `follow-${tabId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      turnId: null,
      tabId,
      targetMode,
      startedAt: Date.now(),
      endedAt: null,
      updatedAt: Date.now(),
      status: "running",
      reason: null,
      totalActions: 0,
      interruptedCount: 0,
      actions: [],
      frames: []
    };
    followSessions.set(key, created);
    return created;
  };

  const sharedControlForTab = (
    tabId: string,
    sessionId: string
  ): SharedControlSnapshot => {
    const existing = sharedControlStates.get(tabId);
    if (existing !== undefined) {
      if (existing.sessionId === sessionId) {
        return existing;
      }
      const retargeted = { ...existing, sessionId };
      sharedControlStates.set(tabId, retargeted);
      return retargeted;
    }
    const created = createIdleSharedControlSnapshot(tabId, sessionId);
    sharedControlStates.set(tabId, created);
    return created;
  };

  const publishSharedControlStateTransition = (
    transition: {
      readonly snapshot: SharedControlSnapshot;
      readonly previousState: SharedControlSnapshot["state"];
      readonly changed: boolean;
    },
    reason: WorkbenchBrowserSharedControlStateEvent["reason"]
  ): void => {
    if (!transition.changed) {
      return;
    }
    publishEvent({
      kind: "browser-shared-control-state",
      tabId: transition.snapshot.tabId,
      targetMode: "live",
      sessionId: transition.snapshot.sessionId,
      state: transition.snapshot.state,
      previousState: transition.previousState,
      at: transition.snapshot.updatedAt,
      ...(transition.snapshot.action === undefined ? {} : { action: transition.snapshot.action }),
      ...(transition.snapshot.interaction === undefined
        ? {}
        : { interaction: transition.snapshot.interaction }),
      criticalInput: transition.snapshot.criticalInput,
      reason
    });
  };

  const applySharedControlTransition = (
    transition: {
      readonly snapshot: SharedControlSnapshot;
      readonly previousState: SharedControlSnapshot["state"];
      readonly changed: boolean;
    },
    reason: WorkbenchBrowserSharedControlStateEvent["reason"]
  ): SharedControlSnapshot => {
    sharedControlStates.set(transition.snapshot.tabId, transition.snapshot);
    publishSharedControlStateTransition(transition, reason);
    return transition.snapshot;
  };

  const scheduleSharedControlIdle = (tabId: string, durationMs: number): void => {
    const existing = sharedControlTimers.get(tabId);
    if (existing !== undefined) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      sharedControlTimers.delete(tabId);
      const current = sharedControlStates.get(tabId);
      if (current === undefined || isSharedControlPaused(current)) {
        return;
      }
      applySharedControlTransition(transitionSharedControlToIdle(current), "timer");
    }, Math.max(600, Math.min(8_000, durationMs)));
    sharedControlTimers.set(tabId, timer);
  };

  const latestFollowAction = (
    session: BrowserAgentFollowSession
  ): BrowserAgentFollowSession["actions"][number] | null =>
    session.actions.length === 0 ? null : session.actions[session.actions.length - 1] ?? null;

  const summarizeFollowAction = (
    action: BrowserAgentCursorOverlayAction,
    request: {
      readonly interaction?: WorkbenchBrowserAgentInteraction;
      readonly cursorPhase?: BrowserAgentCursorOverlayPhase;
      readonly inputActive: boolean;
      readonly result?: "success" | "failure" | "interrupted";
    }
  ): string => {
    const result = request.result === undefined || request.result === "success"
      ? ""
      : ` ${request.result}`;
    if (action === "act") {
      return `${request.interaction ?? "click"}${request.cursorPhase === undefined ? "" : `:${request.cursorPhase}`}${result}`;
    }
    if (action === "type") {
      return `type${request.inputActive ? ":input" : ""}${result}`;
    }
    if (action === "press") {
      return `press${request.inputActive ? ":key" : ""}${result}`;
    }
    return `${action}${result}`;
  };

  const followFrameEvent = (
    action: BrowserAgentCursorOverlayAction,
    result?: "success" | "failure" | "interrupted"
  ): "cursor" | "input" | "wait" | "navigation" | "interrupt" => {
    if (result === "interrupted") return "interrupt";
    if (action === "wait" || action === "read" || action === "observe" || action === "capture") return "wait";
    if (action === "navigate") return "navigation";
    if (action === "act") return "cursor";
    return "input";
  };

  const recordFollowAction = (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode,
    action: BrowserAgentCursorOverlayAction,
    request: {
      readonly visibleFollow?: boolean;
      readonly interaction?: WorkbenchBrowserAgentInteraction;
      readonly cursorPhase?: BrowserAgentCursorOverlayPhase;
      readonly inputActive: boolean;
      readonly cursor?: { readonly x: number; readonly y: number };
      readonly result?: "success" | "failure" | "interrupted";
      readonly sharedControlState?: SharedControlSnapshot["state"];
      readonly criticalInput?: boolean;
      readonly redacted?: boolean;
    }
  ): BrowserAgentFollowSession | null => {
    const task = browserAgentOperationContext.getStore();
    if (targetMode === "live" && task?.turnId) {
      const turns = taskTurnsByPage.get(tabId) ?? new Set<string>();
      turns.add(task.turnId); taskTurnsByPage.set(tabId, turns);
    }
    if (request.visibleFollow !== true) return null;
    const session = ensureFollowSession(tabId, targetMode);
    if (task?.turnId) session.turnId = task.turnId;
    const at = Date.now();
    session.updatedAt = at;
    session.totalActions += 1;
    if (request.result === "failure") {
      session.status = "failed";
      session.reason = "browser operation failed";
    } else if (request.result === "interrupted") {
      session.status = "interrupted";
      session.reason = "user input interrupted browser follow";
    } else if (session.status !== "interrupted" && session.status !== "failed") {
      session.status = "running";
      session.reason = null;
    }
    const actionId = `follow-action-${session.totalActions}`;
    session.actions.push({
      id: actionId,
      at,
      tabId,
      targetMode,
      action,
      ...(request.interaction === undefined ? {} : { interaction: request.interaction }),
      ...(request.cursorPhase === undefined ? {} : { cursorPhase: request.cursorPhase }),
      inputActive: request.inputActive,
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      ...(request.result === undefined ? {} : { result: request.result }),
      summary: summarizeFollowAction(action, request),
      ...(request.sharedControlState === undefined
        ? {}
        : { sharedControlState: request.sharedControlState }),
      ...(request.criticalInput === undefined ? {} : { criticalInput: request.criticalInput }),
      ...(request.redacted === undefined ? {} : { redacted: request.redacted })
    });
    session.frames.push({
      id: `follow-frame-${session.totalActions}`,
      at,
      actionId,
      tabId,
      targetMode,
      ...(request.cursor === undefined ? {} : { cursor: request.cursor }),
      ...(request.cursorPhase === undefined ? {} : { cursorPhase: request.cursorPhase }),
      event: followFrameEvent(action, request.result)
    });
    if (session.actions.length > MAX_BROWSER_AGENT_FOLLOW_ACTIONS) {
      session.actions.splice(0, session.actions.length - MAX_BROWSER_AGENT_FOLLOW_ACTIONS);
    }
    if (session.frames.length > MAX_BROWSER_AGENT_FOLLOW_FRAMES) {
      session.frames.splice(0, session.frames.length - MAX_BROWSER_AGENT_FOLLOW_FRAMES);
    }
    return session;
  };

  const markSyntheticInput = (tabId: string): void => {
    agentSyntheticInputUntil.set(tabId, Date.now() + 350);
  };

  const isSyntheticInput = (tabId: string): boolean =>
    (agentSyntheticInputUntil.get(tabId) ?? 0) >= Date.now();

  const buildSharedControlHandoff = (
    tabId: string,
    session: BrowserAgentFollowSession,
    snapshot: SharedControlSnapshot,
    inputType: SharedControlInputType,
    physicalInputPrevented: boolean,
    at = Date.now()
  ): WorkbenchBrowserSharedControlEvent => {
    const lastAction = latestFollowAction(session);
    return {
      kind: "browser-shared-control-interrupted",
      tabId,
      targetMode: "live",
      sessionId: session.sessionId,
      inputType,
      at,
      ...(lastAction?.action === undefined ? {} : { action: lastAction.action }),
      ...(lastAction?.interaction === undefined ? {} : { interaction: lastAction.interaction }),
      ...(lastAction?.id === undefined ? {} : { followActionId: lastAction.id }),
      criticalInput: snapshot.criticalInput,
      physicalInputPrevented,
      sharedControlState:
        snapshot.state === "awaiting_user_decision"
          ? "awaiting_user_decision"
          : "user_interrupted",
      browserRecoveryAnchor: {
        tabId,
        targetMode: "live",
        ...(lastAction?.id === undefined ? {} : { followActionId: lastAction.id })
      }
    };
  };

  const assertSharedControlCanContinue = (tabId: string): void => {
    const snapshot = sharedControlStates.get(tabId);
    if (snapshot === undefined || !isSharedControlPaused(snapshot)) {
      return;
    }
    const session = followSessions.get(followSessionKey(tabId, "live"))
      ?? ensureFollowSession(tabId, "live");
    const handoff =
      lastControlHandoffByTabId.get(tabId)
      ?? buildSharedControlHandoff(
        tabId,
        session,
        snapshot,
        snapshot.inputType ?? "keyboard",
        snapshot.criticalInput
      );
    throw new SharedControlInterruptionError(handoff);
  };

  const handleSharedControlInput = (
    tabId: string,
    inputType: SharedControlInputType,
    event?: { readonly preventDefault?: () => void }
  ): void => {
    const session = followSessions.get(followSessionKey(tabId, "live"));
    if (session === undefined || session.status !== "running") {
      return;
    }
    const current = sharedControlForTab(tabId, session.sessionId);
    const transition = transitionSharedControlForUserInput(current, {
      inputType,
      synthetic: isSyntheticInput(tabId)
    });
    if (!transition.interrupted) {
      return;
    }
    if (transition.preventPhysicalInput) {
      event?.preventDefault?.();
    }
    session.interruptedCount += 1;
    session.updatedAt = Date.now();
    session.status = "interrupted";
    session.reason = "user input interrupted browser follow";
    recordFollowAction(tabId, "live", inputType === "keyboard" ? "press" : "act", {
      visibleFollow: true,
      inputActive: true,
      result: "interrupted",
      sharedControlState: "user_interrupted",
      criticalInput: transition.snapshot.criticalInput,
      redacted: inputType === "keyboard"
    });
    const interruptedSnapshot = applySharedControlTransition(transition, "user_input");
    const handoff = buildSharedControlHandoff(
      tabId,
      session,
      interruptedSnapshot,
      inputType,
      transition.preventPhysicalInput,
      interruptedSnapshot.interruptedAt ?? Date.now()
    );
    lastControlHandoffByTabId.set(tabId, handoff);
    publishEvent(handoff);
    const awaiting = transitionSharedControlToAwaitingDecision(interruptedSnapshot);
    const awaitingSnapshot = applySharedControlTransition(awaiting, "awaiting_decision");
    if (awaiting.changed) {
      lastControlHandoffByTabId.set(tabId, {
        ...handoff,
        sharedControlState: "awaiting_user_decision",
        at: awaitingSnapshot.updatedAt
      });
    }
  };

  const sendAgentInputEvent = (
    target: BrowserAgentPageTarget,
    event: Parameters<WebContents["sendInputEvent"]>[0]
  ): void => {
    if (target.targetMode === "live") {
      assertSharedControlCanContinue(target.tabId);
    }
    markSyntheticInput(target.tabId);
    target.webContents.sendInputEvent(event);
  };

  const publishBrowserAgentActivity = async ({
    tabId,
    targetMode,
    action,
    interaction,
    cursorPhase = "idle",
    inputActive = false,
    visibleFollow = false,
    durationMs = inputActive ? 1_800 : 1_250,
    hold = true,
    cursor,
    points
  }: {
    readonly tabId: string;
    readonly targetMode: WorkbenchBrowserAgentTargetMode;
    readonly action: BrowserAgentCursorOverlayAction;
    readonly interaction?: WorkbenchBrowserAgentInteraction;
    readonly cursorPhase?: BrowserAgentCursorOverlayPhase;
    readonly inputActive?: boolean;
    readonly visibleFollow?: boolean;
    readonly durationMs?: number;
    readonly hold?: boolean;
    readonly cursor?: { readonly x: number; readonly y: number };
    readonly points?: readonly { readonly x: number; readonly y: number }[];
  }): Promise<void> => {
    const criticalInput = isCriticalBrowserAgentAction(action, interaction);
    let sharedControlState: SharedControlSnapshot["state"] | undefined;
    if (targetMode === "live" && visibleFollow) {
      const session = ensureFollowSession(tabId, targetMode);
      const current = sharedControlForTab(tabId, session.sessionId);
      const transition = transitionSharedControlForAgentAction(current, {
        action,
        ...(interaction === undefined ? {} : { interaction }),
        criticalInput
      });
      if (transition.blocked) {
        assertSharedControlCanContinue(tabId);
      }
      sharedControlState = applySharedControlTransition(transition, "agent_action").state;
      scheduleSharedControlIdle(tabId, durationMs);
    }
    const followSession = recordFollowAction(tabId, targetMode, action, {
      visibleFollow,
      ...(interaction === undefined ? {} : { interaction }),
      cursorPhase,
      inputActive,
      ...(cursor === undefined ? {} : { cursor }),
      ...(sharedControlState === undefined ? {} : { sharedControlState }),
      criticalInput,
      redacted: action === "type" || action === "press"
    });
    if (followSession === null) {
      return Promise.resolve();
    }
    const followAction = followSession.actions[followSession.actions.length - 1];
    let painted: Promise<unknown> = Promise.resolve();
    if (targetMode === "live" && visibleFollow) {
      cursorThoughtTabId = tabId;
      const entry = getLiveEntry(tabId);
      if (entry !== undefined && entry.webContents.isDestroyed() === false) {
        painted = entry.webContents.executeJavaScript(
          buildAgentCursorOverlayScript({
            action,
            phase: cursorPhase,
            durationMs: hold ? Math.max(durationMs, 60_000) : durationMs,
            hold,
            thought: readAgentCursorThought(),
            ...(cursor === undefined ? {} : { cursor }),
            ...(points === undefined ? {} : { points })
          }),
          true
        ).catch((error: unknown) => {
          console.warn(
            `[lyra-browser] agent cursor overlay failed tab=${tabId} action=${action} error=${String(error)}`
          );
        });
      }
    }
    publishEvent({
      kind: "lumen-browser-activity",
      source: "lyra_lumen",
      tabId,
      targetMode,
      action,
      ...(interaction === undefined ? {} : { interaction }),
      visibleFollow,
      sessionId: followSession.sessionId,
      actionId: followAction?.id ?? "follow-action-unknown",
      cursorPhase,
      inputActive,
      durationMs,
      ...(sharedControlState === undefined ? {} : { sharedControlState }),
      criticalInput,
      redacted: action === "type" || action === "press",
      ...(cursor === undefined ? {} : { cursor })
    });
    await painted;
  };

  const hasActiveLiveAgentBrowserTask = (tabId: string): boolean => {
    if (taskTurnsByPage.get(tabId)?.size) return true;
    for (const session of followSessions.values()) {
      if (
        session.tabId === tabId
        && session.targetMode === "live"
        // An operation failure does not end the task or release its page.
        && session.endedAt === null
      ) {
        return true;
      }
    }
    return false;
  };

  const markUserInputDirty = (tabId: string): void => {
    userInputDirtyTabs.add(tabId);
  };

  const clearUserInputDirty = (tabId: string): void => {
    userInputDirtyTabs.delete(tabId);
  };

  const hasUserInputDirty = (tabId: string): boolean =>
    userInputDirtyTabs.has(tabId);

  const readAgentFollowAudit = async (
    tabId: string,
    request?: {
      readonly sessionId?: string;
      readonly turnId?: string;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly maxActions?: number;
      readonly includeFrames?: boolean;
    }
  ): Promise<WorkbenchLumenFollowAudit> => {
    const requestedTargetMode = request?.targetMode ?? "live";
    const session = request?.sessionId === undefined
      ? followSessions.get(followSessionKey(tabId, requestedTargetMode)) ?? null
      : [...followSessions.values()].find((entry) => entry.sessionId === request.sessionId) ?? null;
    const targetMode = session?.targetMode ?? requestedTargetMode;
    if (session !== null && session.turnId === null && request?.turnId !== undefined) {
      session.turnId = request.turnId;
    }
    const maxActions = Math.max(1, Math.min(400, Math.round(request?.maxActions ?? 80)));
    const finalPageState = readAgentFollowFinalPageState(tabId, targetMode);
    const compact = compactFollowSession({
      actions: session?.actions ?? [],
      interruptedCount: session?.interruptedCount ?? 0,
      finalPageState
    }, { maxActions });
    const frames = request?.includeFrames === true ? session?.frames.slice(-maxActions * 2) ?? [] : undefined;
    return {
      ok: true,
      kind: "lyraLumenFollowAudit",
      tabId,
      targetMode,
      sessionId: session?.sessionId ?? null,
      turnId: session?.turnId ?? request?.turnId ?? null,
      startedAt: session?.startedAt ?? null,
      endedAt: session?.endedAt ?? null,
      updatedAt: session?.updatedAt ?? null,
      status: session?.status ?? null,
      reason: session?.reason ?? null,
      totalActions: session?.totalActions ?? 0,
      actions: compact.actions,
      ...(frames === undefined ? {} : { frames }),
      finalPageState,
      compactSummary: compact.compactSummary,
      compactText: compact.compactText,
      chunks: compact.chunks
    };
  };

  const finishAgentFollowSessions = (
    request: {
      readonly turnId?: string;
      readonly status: "completed" | "cancelled" | "failed" | "interrupted";
      readonly reason?: string;
    }
  ): void => {
    const endedAt = Date.now();
    const endedPageOwners = new Set<string>();
    for (const [tabId, turns] of taskTurnsByPage) {
      if (request.turnId) turns.delete(request.turnId); else turns.clear();
      if (!turns.size) { taskTurnsByPage.delete(tabId); endedPageOwners.add(tabId); }
    }
    for (const session of followSessions.values()) {
      if (session.endedAt !== null) {
        continue;
      }
      if (taskTurnsByPage.get(session.tabId)?.size) continue;
      if (request.turnId !== undefined && session.turnId !== null && session.turnId !== request.turnId
        && !endedPageOwners.has(session.tabId)) continue;
      if (session.turnId === null && request.turnId !== undefined) {
        session.turnId = request.turnId;
      }
      session.status = request.status;
      session.endedAt = endedAt;
      session.updatedAt = endedAt;
      session.reason = request.reason ?? null;
    }
    // Pages the agent drove run unthrottled. Once no task owns them, hand them
    // back to Chromium's background throttling.
    for (const entry of entries?.values() ?? []) {
      if (
        entry.isDestroyed
        || entry.webContents.isDestroyed()
        || hasActiveLiveAgentBrowserTask(entry.tabId)
      ) {
        continue;
      }
      entry.webContents.setBackgroundThrottling(true);
    }
  };

  const resolveSharedControlDecision = async (
    tabId: string,
    request: {
      readonly decision: "continue_agent" | "user_takeover" | "use_isolated" | "cancel_task";
    }
  ): Promise<{
    readonly ok: true;
    readonly tabId: string;
    readonly decision: "continue_agent" | "user_takeover" | "use_isolated" | "cancel_task";
  }> => {
    const session = ensureFollowSession(tabId, "live");
    const current = sharedControlForTab(tabId, session.sessionId);
    if (request.decision !== "continue_agent") {
      const pausedSnapshot: SharedControlSnapshot = {
        ...current,
        state: "awaiting_user_decision",
        criticalInput: false,
        updatedAt: Date.now()
      };
      applySharedControlTransition(
        {
          snapshot: pausedSnapshot,
          previousState: current.state,
          changed: current.state !== pausedSnapshot.state
        },
        "decision"
      );
      session.status = request.decision === "cancel_task" ? "cancelled" : "interrupted";
      session.reason = request.decision;
      return {
        ok: true,
        tabId,
        decision: request.decision
      };
    }
    const transition = transitionSharedControlForDecision(
      current,
      request.decision as SharedControlDecision
    );
    applySharedControlTransition(transition, "decision");
    lastControlHandoffByTabId.delete(tabId);
    session.status = "running";
    session.reason = null;
    scheduleSharedControlIdle(tabId, 900);
    return {
      ok: true,
      tabId,
      decision: request.decision
    };
  };

  const dispose = (): void => {
    followSessions.clear();
    taskTurnsByPage.clear();
    agentSyntheticInputUntil.clear();
    userInputDirtyTabs.clear();
    for (const timer of sharedControlTimers.values()) {
      clearTimeout(timer);
    }
    sharedControlTimers.clear();
    sharedControlStates.clear();
    lastControlHandoffByTabId.clear();
  };

  return {
    assertSharedControlCanContinue,
    clearUserInputDirty,
    dispose,
    ensureFollowSession,
    finishAgentFollowSessions,
    handleSharedControlInput,
    hasActiveLiveAgentBrowserTask,
    hasUserInputDirty,
    markSyntheticInput,
    markUserInputDirty,
    publishBrowserAgentActivity,
    readAgentFollowAudit,
    recordFollowAction,
    resolveSharedControlDecision,
    sendAgentInputEvent
  };
};
