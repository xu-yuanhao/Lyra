import { randomUUID } from "node:crypto";

import type {
  TerminalCreateRequest,
  TerminalMemoryActor,
  TerminalMemoryCorrelation,
  TerminalReadResponse,
  TerminalSessionSnapshot
} from "../../shared/desktop-bridge";
import type { WorkbenchTerminalPaneDescriptor } from "../../shared/workbench-observation";
import type { TerminalIpcBridge } from "../terminal/types";
import type { WorkbenchObservationService } from "../workbench-observation/types";
import type { AgentHostCapabilityHandlers } from "./host-payload";
import {
  normalizePayload,
  readClampedOptionalNumber,
  readOptionalStringArrayField,
  readOptionalStringField,
  readRuntimeSessionId,
  readRuntimeToolCallId,
  readRuntimeTurnId
} from "./host-payload";

export const createTerminalToolHost = ({
  terminalBridge,
  getWorkbenchObservationService
}: {
  readonly terminalBridge: TerminalIpcBridge;
  readonly getWorkbenchObservationService: () => WorkbenchObservationService | null;
}): {
  readonly handlers: AgentHostCapabilityHandlers;
  readonly closePrivateTerminalsForSession: (agentSessionId: string) => Promise<void>;
  readonly listPrivateTerminalsForSession: (agentSessionId: string) => readonly {
    readonly sessionId: string;
    readonly title: string;
    readonly cwd?: string;
    readonly mode: "shell" | "command";
    readonly command?: string;
    readonly createdAt: string;
  }[];
  readonly closePrivateTerminalSession: (agentSessionId: string, terminalSessionId: string) => Promise<void>;
  readonly dispose: () => void;
} => {
  type TerminalTargetPreference = "auto" | "private" | "ui";
  type TerminalToolTarget = {
    readonly type: "private" | "ui";
    readonly sessionId: string;
    readonly terminalTabId?: string;
    readonly paneId?: string;
    readonly title?: string;
    readonly cwd?: string;
    readonly placement?: "dock" | "workspace";
    readonly sourceAgentSessionId?: string;
  };
  type PrivateTerminalEntry = {
    readonly type: "private";
    readonly agentSessionId: string;
    readonly sessionId: string;
    readonly title: string;
    readonly cwd?: string;
    readonly mode: "shell" | "command";
    readonly command?: string;
    readonly createdAt: string;
    lastUsedAt: string;
    cursor?: string;
  };
  const privateTerminalsByAgentSession = new Map<string, Map<string, PrivateTerminalEntry>>();
  const cursorByTerminalSessionId = new Map<string, string>();
  const screenCursorByTerminalSessionId = new Map<string, string>();


  const createAgentTerminalMemoryContext = (
    payload: Record<string, unknown>,
    agentSessionId: string,
    terminalToolName: string,
    options: {
      readonly target?: TerminalToolTarget;
      readonly cwd?: string;
      readonly commandId?: string;
      readonly inputId?: string;
    } = {}
  ): {
    readonly actor: TerminalMemoryActor;
    readonly correlation: TerminalMemoryCorrelation;
  } => {
    const runtimeTurnId = readRuntimeTurnId(payload);
    const toolCallId = readRuntimeToolCallId(payload);
    const cwd = options.cwd ?? options.target?.cwd;
    return {
      actor: {
        kind: "agent",
        agentSessionId,
        ...(runtimeTurnId === undefined ? {} : { runtimeTurnId }),
        ...(toolCallId === undefined ? {} : { toolCallId })
      },
      correlation: {
        agentSessionId,
        ...(runtimeTurnId === undefined ? {} : { runtimeTurnId }),
        ...(toolCallId === undefined ? {} : { toolCallId }),
        terminalToolName,
        ...(options.commandId === undefined ? {} : { commandId: options.commandId }),
        ...(options.inputId === undefined ? {} : { inputId: options.inputId }),
        ...(options.target?.terminalTabId === undefined
          ? {}
          : { terminalTabId: options.target.terminalTabId }),
        ...(options.target?.paneId === undefined ? {} : { paneId: options.target.paneId }),
        ...(cwd === undefined ? {} : { cwd })
      }
    };
  };

  const readTerminalTargetPreference = (
    payload: Record<string, unknown>
  ): TerminalTargetPreference => {
    const value = payload.target;
    if (value === "private" || value === "ui") {
      return value;
    }
    return "auto";
  };

  const readOptionalTerminalId = (
    payload: Record<string, unknown>,
    fieldName: "sessionId" | "terminalTabId" | "paneId"
  ): string | undefined => {
    const value = payload[fieldName];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  };


  const readTerminalCommand = (payload: Record<string, unknown>): string | undefined =>
    readOptionalStringField(payload, "command");

  const readTerminalMode = (
    payload: Record<string, unknown>,
    command: string | undefined
  ): "shell" | "command" => {
    if (command !== undefined) {
      return "command";
    }
    return payload.mode === "command" ? "command" : "shell";
  };

  const targetFromPrivateEntry = (entry: PrivateTerminalEntry): TerminalToolTarget => ({
    type: "private",
    sessionId: entry.sessionId,
    title: entry.title,
    ...(entry.cwd === undefined ? {} : { cwd: entry.cwd })
  });

  const targetFromUiPane = (pane: WorkbenchTerminalPaneDescriptor): TerminalToolTarget => ({
    type: "ui",
    sessionId: pane.sessionId,
    terminalTabId: pane.terminalTabId,
    paneId: pane.paneId,
    title: pane.title,
    placement: pane.placement,
    ...(pane.sourceAgentSessionId === undefined
      ? {}
      : { sourceAgentSessionId: pane.sourceAgentSessionId }),
    ...(pane.currentCwd !== undefined || pane.cwd !== undefined
      ? { cwd: pane.currentCwd ?? pane.cwd }
      : {})
  });

  const privateTerminalMapForSession = (
    agentSessionId: string
  ): Map<string, PrivateTerminalEntry> => {
    const existing = privateTerminalsByAgentSession.get(agentSessionId);
    if (existing !== undefined) {
      return existing;
    }
    const created = new Map<string, PrivateTerminalEntry>();
    privateTerminalsByAgentSession.set(agentSessionId, created);
    return created;
  };

  const findPrivateTerminalEntry = (
    sessionId: string,
    preferredAgentSessionId?: string
  ): PrivateTerminalEntry | null => {
    if (preferredAgentSessionId !== undefined) {
      const preferred = privateTerminalsByAgentSession
        .get(preferredAgentSessionId)
        ?.get(sessionId);
      if (preferred !== undefined) {
        return preferred;
      }
    }
    for (const terminals of privateTerminalsByAgentSession.values()) {
      const entry = terminals.get(sessionId);
      if (entry !== undefined) {
        return entry;
      }
    }
    return null;
  };

  const latestPrivateTerminalEntry = (agentSessionId: string): PrivateTerminalEntry | null => {
    const terminals = privateTerminalsByAgentSession.get(agentSessionId);
    if (terminals === undefined || terminals.size === 0) {
      return null;
    }
    return [...terminals.values()].sort((left, right) =>
      right.lastUsedAt.localeCompare(left.lastUsedAt)
    )[0] ?? null;
  };

  const rememberTerminalCursor = (target: TerminalToolTarget, cursor: string): void => {
    cursorByTerminalSessionId.set(target.sessionId, cursor);
    if (target.type !== "private") {
      return;
    }
    const entry = findPrivateTerminalEntry(target.sessionId);
    if (entry !== null) {
      entry.cursor = cursor;
      entry.lastUsedAt = new Date().toISOString();
    }
  };

  const isSessionNotFoundError = (error: unknown): boolean =>
    error instanceof Error && /session not found/i.test(error.message);

  const waitForTerminalSessionReady = async (
    sessionId: string,
    timeoutMs = 3_000
  ): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    let lastError: unknown = null;
    while (Date.now() <= deadline) {
      try {
        await terminalBridge.readObservation({
          sessionId,
          cursor: "0",
          maxBytes: 1,
          waitMs: 25
        });
        return;
      } catch (error) {
        lastError = error;
        if (!isSessionNotFoundError(error)) {
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(
      lastError instanceof Error
        ? `Terminal session did not become ready: ${lastError.message}`
        : "Terminal session did not become ready."
    );
  };

  const createPrivateTerminal = async (
    agentSessionId: string,
    payload: Record<string, unknown>
  ): Promise<{
    readonly target: TerminalToolTarget;
    readonly snapshot: TerminalSessionSnapshot;
  }> => {
    const command = readTerminalCommand(payload);
    const mode = readTerminalMode(payload, command);
    if (mode === "command" && command === undefined) {
      throw new Error("terminal_create mode=command requires command");
    }
    const cols = readClampedOptionalNumber(payload, "cols", 80, 1, 300);
    const rows = readClampedOptionalNumber(payload, "rows", 24, 1, 300);
    const title =
      readOptionalStringField(payload, "title")
      ?? (command === undefined ? "Agent Terminal" : command.slice(0, 80));
    const cwd = readOptionalStringField(payload, "cwd");
    const sessionId = `agent-terminal-${agentSessionId}-${randomUUID()}`;
    const commandId = command === undefined ? undefined : `terminal-command-${randomUUID()}`;
    const memoryContext = createAgentTerminalMemoryContext(payload, agentSessionId, "terminal.create", {
      ...(cwd === undefined ? {} : { cwd }),
      ...(commandId === undefined ? {} : { commandId })
    });
    const request: TerminalCreateRequest = {
      sessionId,
      title,
      cols,
      rows,
      source: "agent",
      mode,
      persist: false,
      actor: memoryContext.actor,
      correlation: memoryContext.correlation,
      ...(cwd === undefined ? {} : { cwd }),
      ...(command === undefined ? {} : { command })
    };
    const snapshot = await terminalBridge.createSession(request);
    const now = new Date().toISOString();
    const entry: PrivateTerminalEntry = {
      type: "private",
      agentSessionId,
      sessionId: snapshot.sessionId,
      title: snapshot.title,
      mode,
      createdAt: now,
      lastUsedAt: now,
      ...(snapshot.cwd === undefined ? {} : { cwd: snapshot.cwd }),
      ...(command === undefined ? {} : { command })
    };
    privateTerminalMapForSession(agentSessionId).set(snapshot.sessionId, entry);
    return {
      target: targetFromPrivateEntry(entry),
      snapshot
    };
  };

  const resolvePrivateTerminal = async (
    agentSessionId: string,
    payload: Record<string, unknown>,
    createIfMissing: boolean
  ): Promise<TerminalToolTarget> => {
    const requestedSessionId = readOptionalTerminalId(payload, "sessionId");
    if (requestedSessionId !== undefined) {
      const entry = findPrivateTerminalEntry(requestedSessionId, agentSessionId);
      if (entry === null) {
        const current = latestPrivateTerminalEntry(agentSessionId);
        throw new Error(`Private terminal session not found: ${requestedSessionId}. `
          + (current ? `This task's current terminal sessionId is ${current.sessionId}. ` : "This task has no private terminal yet. ")
          + "Omit sessionId to reuse/create this task's terminal; use createNew=true without sessionId for a new one. Never invent session IDs.");
      }
      entry.lastUsedAt = new Date().toISOString();
      return targetFromPrivateEntry(entry);
    }
    const existing = latestPrivateTerminalEntry(agentSessionId);
    if (existing !== null && payload.createNew !== true) {
      existing.lastUsedAt = new Date().toISOString();
      return targetFromPrivateEntry(existing);
    }
    if (!createIfMissing) {
      throw new Error(
        "No private Agent terminal exists. Start one with write_stdin (omit sessionId) or terminal.write with createNew."
      );
    }
    return (await createPrivateTerminal(agentSessionId, payload)).target;
  };

  const resolveUiTerminal = async (
    agentSessionId: string,
    payload: Record<string, unknown>,
    openIfMissing: boolean,
    options: {
      readonly fallbackToActiveWhenOnlySessionId?: boolean;
    } = {}
  ): Promise<TerminalToolTarget> => {
    const service = getWorkbenchObservationService();
    if (service === null) {
      throw new Error("Workbench terminal capability is not available");
    }
    const requestedSessionId = readOptionalTerminalId(payload, "sessionId");
    const requestedTerminalTabId = readOptionalTerminalId(payload, "terminalTabId");
    const requestedPaneId = readOptionalTerminalId(payload, "paneId");
    const listedRaw = await service.listTerminalPanes({});
    const listed = {
      active: listedRaw.active,
      panes: listedRaw.panes
    };
    const explicitTarget =
      requestedSessionId !== undefined
      || requestedTerminalTabId !== undefined
      || requestedPaneId !== undefined;
    let pane =
      listed.panes.find((entry) => (
        (requestedSessionId === undefined || entry.sessionId === requestedSessionId)
        && (requestedTerminalTabId === undefined || entry.terminalTabId === requestedTerminalTabId)
        && (requestedPaneId === undefined || entry.paneId === requestedPaneId)
      ))
      ?? null;
    const canFallbackToActive =
      options.fallbackToActiveWhenOnlySessionId === true
      && requestedSessionId !== undefined
      && requestedTerminalTabId === undefined
      && requestedPaneId === undefined;
    if (pane === null && explicitTarget && !canFallbackToActive) {
      throw new Error("Requested UI terminal pane was not found.");
    }
    if (pane === null) {
      pane = listed.active;
    }
    if (pane === null && openIfMissing) {
      const title = readOptionalStringField(payload, "title");
      const cwd = readOptionalStringField(payload, "cwd");
      pane = await service.openTerminalPane({
        placement: "dock",
        title: title ?? "Agent Terminal",
        sourceAgentSessionId: agentSessionId,
        ...(cwd === undefined ? {} : { cwd })
      });
      await waitForTerminalSessionReady(pane.sessionId);
    }
    if (pane === null) {
      throw new Error("No UI terminal pane is available. Call terminal_create first.");
    }
    try {
      const focused = await service.focusTerminalPane({
        terminalTabId: pane.terminalTabId,
        paneId: pane.paneId
      });
      pane = focused;
    } catch {
      // Focus is best-effort; the runtime session can still be controlled by id.
    }
    return targetFromUiPane(pane);
  };

  const resolveTerminalTarget = async (
    agentSessionId: string,
    payload: Record<string, unknown>,
    options: {
      readonly privateCreateIfMissing: boolean;
      readonly uiOpenIfMissing: boolean;
    }
  ): Promise<TerminalToolTarget> => {
    const preference = readTerminalTargetPreference(payload);
    const requestedSessionId = readOptionalTerminalId(payload, "sessionId");
    const hasUiRef =
      readOptionalTerminalId(payload, "terminalTabId") !== undefined
      || readOptionalTerminalId(payload, "paneId") !== undefined;
    if (preference === "ui" || hasUiRef) {
      return await resolveUiTerminal(agentSessionId, payload, options.uiOpenIfMissing, {
        fallbackToActiveWhenOnlySessionId: false
      });
    }
    if (requestedSessionId !== undefined) {
      const privateEntry = findPrivateTerminalEntry(requestedSessionId, agentSessionId);
      if (privateEntry !== null) {
        privateEntry.lastUsedAt = new Date().toISOString();
        return targetFromPrivateEntry(privateEntry);
      }
      const service = getWorkbenchObservationService();
      if (service !== null && typeof service.listTerminalPanes === "function") {
        try {
          return await resolveUiTerminal(agentSessionId, payload, false);
        } catch (error) {
          if (!(error instanceof Error) || !error.message.startsWith("Requested UI terminal pane was not found")) {
            throw error;
          }
        }
      }
    }
    return await resolvePrivateTerminal(
      agentSessionId,
      payload,
      options.privateCreateIfMissing
    );
  };

  const hasExplicitTerminalTarget = (payload: Record<string, unknown>): boolean =>
    readOptionalTerminalId(payload, "sessionId") !== undefined
    || readOptionalTerminalId(payload, "terminalTabId") !== undefined
    || readOptionalTerminalId(payload, "paneId") !== undefined;

  const readTerminalRunningState = async (
    target: TerminalToolTarget
  ): Promise<boolean | null> => {
    try {
      const response = await terminalBridge.readObservation({
        sessionId: target.sessionId,
        maxBytes: 1,
        waitMs: 0
      });
      return response.running;
    } catch (error) {
      if (isSessionNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  };

  const openReplacementUiTerminal = async (
    agentSessionId: string,
    payload: Record<string, unknown>
  ): Promise<TerminalToolTarget> => {
    const service = getWorkbenchObservationService();
    if (service === null) {
      throw new Error("Workbench terminal capability is not available");
    }
    const title = readOptionalStringField(payload, "title");
    const cwd = readOptionalStringField(payload, "cwd");
    const pane = await service.openTerminalPane({
      placement: "dock",
      title: title ?? "Agent Terminal",
      sourceAgentSessionId: agentSessionId,
      ...(cwd === undefined ? {} : { cwd })
    });
    await waitForTerminalSessionReady(pane.sessionId);
    try {
      const focused = await service.focusTerminalPane({
        terminalTabId: pane.terminalTabId,
        paneId: pane.paneId
      });
      return targetFromUiPane(focused);
    } catch {
      return targetFromUiPane(pane);
    }
  };

  const ensureWritableTerminalTarget = async (
    agentSessionId: string,
    payload: Record<string, unknown>,
    target: TerminalToolTarget,
    targetPreference: TerminalTargetPreference
  ): Promise<TerminalToolTarget> => {
    const running = await readTerminalRunningState(target);
    if (running !== false) {
      return target;
    }
    const explicitTarget = hasExplicitTerminalTarget(payload);
    if (explicitTarget) {
      throw new Error(
        `terminal_session_not_running: ${target.sessionId} is stopped. Call terminal_create or choose a running terminal before writing input.`
      );
    }
    if (target.type === "ui") {
      if (targetPreference === "ui") {
        return await openReplacementUiTerminal(agentSessionId, payload);
      }
    } else if (targetPreference !== "ui") {
      privateTerminalsByAgentSession.get(agentSessionId)?.delete(target.sessionId);
      return (await createPrivateTerminal(agentSessionId, payload)).target;
    }
    throw new Error(
      `terminal_session_not_running: ${target.sessionId} is stopped. Call terminal_create or choose a running terminal before writing input.`
    );
  };

  const terminalInlineOutputByteLimit = 16_000;

  const truncateUtf8 = (value: string, maxBytes: number): string => {
    let bytes = 0;
    let result = "";
    for (const char of value) {
      const charBytes = Buffer.byteLength(char, "utf8");
      if (bytes + charBytes > maxBytes) {
        break;
      }
      bytes += charBytes;
      result += char;
    }
    return result;
  };

  const truncateUtf8Tail = (value: string, maxBytes: number): string => {
    const chars = Array.from(value);
    let bytes = 0;
    let start = chars.length;
    while (start > 0) {
      const char = chars[start - 1];
      if (char === undefined) {
        break;
      }
      const charBytes = Buffer.byteLength(char, "utf8");
      if (bytes + charBytes > maxBytes) {
        break;
      }
      bytes += charBytes;
      start -= 1;
    }
    return chars.slice(start).join("");
  };

  const projectTerminalOutput = (
    response: TerminalReadResponse
  ): {
    readonly output: string;
    readonly truncated: boolean;
  } => {
    if (Buffer.byteLength(response.output, "utf8") <= terminalInlineOutputByteLimit) {
      return { output: response.output, truncated: false };
    }
    const outputPath = response.memory?.outputTextPath;
    const suffix = outputPath === undefined
      ? "\n\n[Terminal output projected for model context; read the terminal memory artifact for the full output.]"
      : `\n\n[Terminal output projected for model context; full output is cached at ${outputPath}.]`;
    return {
      output: `${truncateUtf8(response.output, terminalInlineOutputByteLimit)}${suffix}`,
      truncated: true
    };
  };

  const terminalToolResult = (
    target: TerminalToolTarget,
    response: TerminalReadResponse,
    extra: Record<string, unknown> = {}
  ) => {
    rememberTerminalCursor(target, response.cursor);
    const projected = projectTerminalOutput(response);
    // A foreground command that dies between the write and the read-back (bind
    // conflict, bad flag, crash) otherwise looks identical to success: the
    // traceback scrolls by in `output` and the exit code hides in a JSON field
    // the model skips. Surface non-zero exits in the text the model reads —
    // reference shape: codex prefixes every exec result with "Exit code: N".
    const output = response.running === false
      && typeof response.exitCode === "number"
      && response.exitCode !== 0
      ? `${projected.output}\n[process exited with code ${response.exitCode}]`
      : projected.output;
    const responseMemory = response.memory ?? undefined;
    const memory = responseMemory === undefined
      ? undefined
      : {
        ...responseMemory,
        truncatedByProjection: responseMemory.truncatedByProjection || projected.truncated
      };
    const readHint = terminalReadHintFromMemory(memory);
    return {
      target,
      sessionId: target.sessionId,
      ...(target.terminalTabId === undefined ? {} : { terminalTabId: target.terminalTabId }),
      ...(target.paneId === undefined ? {} : { paneId: target.paneId }),
      cursor: response.cursor,
      output,
      running: response.running,
      exitCode: response.exitCode,
      lifecycle: response.lifecycle,
      truncated: response.truncated || projected.truncated,
      ...(memory === undefined ? {} : { memory }),
      ...(readHint === undefined ? {} : { readHint }),
      ...extra
    };
  };

  const terminalReadHintFromMemory = (memory: TerminalReadResponse["memory"] | undefined) => {
    if (memory === undefined) {
      return undefined;
    }
    return {
      message:
        "Full terminal artifacts are cached on disk. Use file_read on the listed paths, or code_search_text for focused retrieval.",
      outputTextPath: memory.outputTextPath,
      rawOutputPath: memory.rawOutputPath,
      outputSummaryPath: memory.outputSummaryPath,
      lineIndexPath: memory.lineIndexPath,
      errorIndexPath: memory.errorIndexPath,
      eventLogPath: memory.eventLogPath,
      summaryPath: memory.summaryPath,
      uiTimelinePath: memory.uiTimelinePath,
      commandsPath: memory.commandsPath,
      processesPath: memory.processesPath,
      attachmentsPath: memory.attachmentsPath,
      screenDiffsPath: memory.screenDiffsPath
    };
  };

  const readTerminalOutput = async (
    target: TerminalToolTarget,
    payload: Record<string, unknown>,
    waitMs: number
  ): Promise<TerminalReadResponse> => {
    const tailBytes = typeof payload.tailBytes === "number"
      && Number.isFinite(payload.tailBytes)
      ? Math.min(262_144, Math.max(1, Math.trunc(payload.tailBytes)))
      : undefined;
    if (tailBytes !== undefined) {
      const end = await terminalBridge.readObservation({
        sessionId: target.sessionId,
        cursor: String(Number.MAX_SAFE_INTEGER),
        maxBytes: 1,
        waitMs: 0
      });
      let endCursor: bigint;
      try {
        endCursor = BigInt(end.cursor);
      } catch {
        throw new Error("terminal.read returned a non-numeric cursor.");
      }
      const overlapBytes = 4;
      const readBytes = Math.min(262_144, tailBytes + overlapBytes);
      const readWidth = BigInt(readBytes);
      const startCursor = (endCursor > readWidth ? endCursor - readWidth : 0n).toString();
      const response = await terminalBridge.readObservation({
        sessionId: target.sessionId,
        cursor: startCursor,
        maxBytes: readBytes,
        waitMs
      });
      return {
        ...response,
        output: truncateUtf8Tail(response.output, tailBytes),
        truncated: response.truncated || endCursor > BigInt(tailBytes)
      };
    }
    const cursor =
      readOptionalStringField(payload, "cursor")
      ?? cursorByTerminalSessionId.get(target.sessionId);
    return await terminalBridge.readObservation({
      sessionId: target.sessionId,
      ...(cursor === undefined ? {} : { cursor }),
      maxBytes: readClampedOptionalNumber(payload, "maxBytes", 16_000, 1, 262_144),
      waitMs
    });
  };

  const readTerminalEofCursor = async (sessionId: string): Promise<string | undefined> => {
    try {
      const response = await terminalBridge.readObservation({
        sessionId,
        cursor: String(Number.MAX_SAFE_INTEGER),
        maxBytes: 1,
        waitMs: 0
      });
      return response.cursor;
    } catch {
      return undefined;
    }
  };

  const closePrivateTerminalsForSession = async (agentSessionId: string): Promise<void> => {
    const terminals = privateTerminalsByAgentSession.get(agentSessionId);
    if (terminals === undefined) {
      return;
    }
    privateTerminalsByAgentSession.delete(agentSessionId);
    await Promise.all(
      [...terminals.keys()].map(async (sessionId) => {
        cursorByTerminalSessionId.delete(sessionId);
        screenCursorByTerminalSessionId.delete(sessionId);
        try {
          await terminalBridge.closeSession({
            sessionId,
            actor: { kind: "system" },
            correlation: {
              agentSessionId,
              terminalToolName: "terminal.closePrivateSession"
            }
          });
        } catch (error) {
          if (!isSessionNotFoundError(error)) {
            console.warn(`[lyra-agent] failed to close private terminal ${sessionId}:`, error);
          }
        }
      })
    );
  };

  const listPrivateTerminalsForSession = (agentSessionId: string): readonly {
    readonly sessionId: string;
    readonly title: string;
    readonly cwd?: string;
    readonly mode: "shell" | "command";
    readonly command?: string;
    readonly createdAt: string;
  }[] => {
    const terminals = privateTerminalsByAgentSession.get(agentSessionId);
    if (terminals === undefined) return [];
    return [...terminals.values()].map((entry) => ({
      sessionId: entry.sessionId,
      title: entry.title,
      ...(entry.cwd === undefined ? {} : { cwd: entry.cwd }),
      mode: entry.mode,
      ...(entry.command === undefined ? {} : { command: entry.command }),
      createdAt: entry.createdAt
    }));
  };

  const closePrivateTerminalSession = async (
    agentSessionId: string,
    terminalSessionId: string
  ): Promise<void> => {
    const terminals = privateTerminalsByAgentSession.get(agentSessionId);
    if (terminals === undefined) return;
    const entry = terminals.get(terminalSessionId);
    if (entry === undefined) return;
    terminals.delete(terminalSessionId);
    cursorByTerminalSessionId.delete(terminalSessionId);
    screenCursorByTerminalSessionId.delete(terminalSessionId);
    try {
      await terminalBridge.closeSession({
        sessionId: terminalSessionId,
        actor: { kind: "system" },
        correlation: {
          agentSessionId,
          terminalToolName: "terminal.closePrivateSession"
        }
      });
    } catch (error) {
      if (!isSessionNotFoundError(error)) {
        console.warn(`[lyra-agent] failed to close private terminal ${terminalSessionId}:`, error);
      }
    }
  };


  const terminalHandlers: AgentHostCapabilityHandlers = {
    "terminal.list": async (payload) => {
      const request = normalizePayload(payload);
      const agentSessionId = readRuntimeSessionId(request);
      const privateTerminals = [
        ...(privateTerminalsByAgentSession.get(agentSessionId)?.values() ?? [])
      ].map((entry) => ({
        ...targetFromPrivateEntry(entry),
        mode: entry.mode,
        createdAt: entry.createdAt,
        lastUsedAt: entry.lastUsedAt,
        ...(entry.cursor === undefined ? {} : { cursor: entry.cursor }),
        ...(entry.command === undefined ? {} : { command: entry.command })
      }));
      let uiTerminals: readonly WorkbenchTerminalPaneDescriptor[] = [];
      try {
        uiTerminals = (await getWorkbenchObservationService()?.listTerminalPanes({}))?.panes ?? [];
      } catch {
        uiTerminals = [];
      }
      const terminals = [
        ...privateTerminals,
        ...uiTerminals.map((pane) => targetFromUiPane(pane))
      ];
      return {
        target: {
          type: "list",
          preferred: "private"
        },
        terminals,
        cursor: "",
        output: terminals.length === 0 ? "No terminal sessions are available." : "",
        running: false,
        exitCode: null,
        truncated: false
      };
    },
    "terminal.read": async (payload) => {
      const request = normalizePayload(payload);
      const target = await resolveTerminalTarget(readRuntimeSessionId(request), request, {
        privateCreateIfMissing: false,
        uiOpenIfMissing: false
      });
      const response = await readTerminalOutput(target, request, 0);
      return terminalToolResult(target, response);
    },
    "terminal.write": async (payload) => {
      const request = normalizePayload(payload);
      const agentSessionId = readRuntimeSessionId(request);
      const targetPreference = readTerminalTargetPreference(request);
      const createNew = request.createNew === true;
      const namedUiTarget =
        readOptionalTerminalId(request, "sessionId") !== undefined
        || readOptionalTerminalId(request, "terminalTabId") !== undefined
        || readOptionalTerminalId(request, "paneId") !== undefined;
      let target = await resolveTerminalTarget(agentSessionId, request, {
        privateCreateIfMissing:
          targetPreference === "private"
          || createNew
          || targetPreference !== "ui",
        uiOpenIfMissing: targetPreference === "ui"
      });
      if (
        target.type === "ui"
        && target.sourceAgentSessionId !== agentSessionId
      ) {
        if (namedUiTarget) {
          throw new Error(
            "That terminal belongs to the user. Omit sessionId, terminalTabId, and paneId so write_stdin uses this task's private terminal."
          );
        }
        target = await resolvePrivateTerminal(agentSessionId, request, true);
      }
      target = await ensureWritableTerminalTarget(
        agentSessionId,
        request,
        target,
        targetPreference
      );
      const data = typeof request.data === "string" ? request.data : undefined;
      const text = typeof request.text === "string" ? request.text : undefined;
      const keys = Array.isArray(request.keys)
        ? request.keys.filter((key): key is string => typeof key === "string")
        : undefined;
      if (data === undefined && text === undefined && (keys === undefined || keys.length === 0)) {
        throw new Error("terminal_write requires data, text, or keys");
      }
      if ((data !== undefined || text !== undefined) && !(data ?? text)?.length
        && !keys?.length && request.appendNewline !== true) {
        return terminalToolResult(target, await readTerminalOutput(target, request, 250), {wrote:"0 bytes (read only)"});
      }
      const commandText = request.appendNewline === true && keys === undefined
        ? text ?? data
        : undefined;
      const commandId = commandText !== undefined && commandText.trim().length > 0
        ? `terminal-command-${randomUUID()}`
        : undefined;
      const commandStartCursor = commandId === undefined
        ? undefined
        : await readTerminalEofCursor(target.sessionId);
      if (commandStartCursor !== undefined) {
        cursorByTerminalSessionId.set(target.sessionId, commandStartCursor);
      }
      const memoryContext = createAgentTerminalMemoryContext(
        request,
        readRuntimeSessionId(request),
        "terminal.write",
        {
          target,
          inputId: `terminal-input-${randomUUID()}`,
          ...(commandId === undefined ? {} : { commandId })
        }
      );
      await terminalBridge.write({
        sessionId: target.sessionId,
        source: "agent",
        actor: memoryContext.actor,
        correlation: memoryContext.correlation,
        ...(data === undefined ? {} : { data }),
        ...(text === undefined ? {} : { text }),
        ...(keys === undefined ? {} : { keys }),
        ...(typeof request.appendNewline === "boolean"
          ? { appendNewline: request.appendNewline }
          : {})
      });
      const cursor = commandStartCursor ?? cursorByTerminalSessionId.get(target.sessionId);
      const response = await terminalBridge.readObservation({
        sessionId: target.sessionId,
        ...(cursor === undefined ? {} : { cursor }),
        maxBytes: readClampedOptionalNumber(request, "maxBytes", 16_000, 1, 262_144),
        waitMs: 250
      });
      return terminalToolResult(target, response, {
        wrote:
          data !== undefined
            ? `${data.length} bytes`
            : text !== undefined
              ? text
              : keys?.join(", ")
      });
    },
  };



  return {
    handlers: terminalHandlers,
    closePrivateTerminalsForSession,
    listPrivateTerminalsForSession,
    closePrivateTerminalSession,
    dispose: () => {
      for (const agentSessionId of [...privateTerminalsByAgentSession.keys()]) {
        void closePrivateTerminalsForSession(agentSessionId);
      }
    }
  };
};
