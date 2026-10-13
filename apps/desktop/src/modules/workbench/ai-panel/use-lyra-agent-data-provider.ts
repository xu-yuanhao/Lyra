import { isOlderSessionSnapshot } from "../agent-session-view-model/runtime-reducer";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from "react";

import {
  AGENT_FOLLOW_ACTIVITY_CONNECTING,
  type AgentModelCatalogSnapshot,
  type AgentFileCitation,
  type AgentPageCitation,
  type AgentPermissionPolicySnapshot,
  type AgentPlanReviewRespondAction,
  type AgentPlanSnapshot,
  type AgentRuntimeEvent,
  type AgentSessionCreateRequest,
  type AgentSessionSnapshot,
  type AgentTranscriptCitation
} from "../../../shared/agent";
import type {
  LyraDesktopApi,
  LyraSensitiveValueRef
} from "../../../shared/desktop-bridge";
import { isLyraSensitiveValueRef } from "../../../shared/sensitive-value";
import type { SettingsAiModel } from "../settings-ai";
import type {
  AgentImageAttachment,
  ChatMessage,
  DecisionQuestion,
  DiffFileEntry,
  PermissionRequest
} from "./lyra-agents/core/types";
import { t, useWorkbenchLocale } from "@workbench/i18n";
import {
  createDataProviderValue,
  type CreateDataProviderValueInput
} from "./lyra-agents/data/createDataProviderValue";
import {
  applyAgentRuntimeEventToSnapshot,
  agentSessionToChatMessages,
  agentSessionToSessionMeta,
  agentSessionToTodos,
  agentSessionMetaWithDraftWorkingDir
} from "../agent-session-view-model";
import { getStreamStore } from "../agent-session-view-model/stream-store";
import type { CitationScrollTarget } from "./lyra-agents/data/DataProvider";
import {
  type ComposerInsertableCitation
} from "./lyra-agents/features/chat/message-citation";
import {
  buildFileAttachmentFromPath,
  type AgentFileAttachment
} from "./lyra-agents/features/chat/composer-file";
import {
  buildImageTurnPayloadEntry,
  hasMaterializableImageData,
  inlineImageMarkerIds,
  validateImageTurnCommit
} from "./lyra-agents/features/chat/composer-image";
import type { ComposerSegment } from "./lyra-agents/features/chat/message-citation";
import { composerWebLinks } from "./lyra-agents/features/chat/message-web-links";
import {
  fetchRemoteImageData,
  localPathFromImageSource,
  readImageAttachmentFromPath
} from "./lyra-agents/features/chat/read-image-attachment";
import { isImageViewerSupportedPath } from "../image-viewer";
import { navigateToPageCitation as navigateToPageCitationInWorkbench } from "./lyra-agents/features/chat/scroll-to-page-citation";
import { resolveAiPanelDragAttachAction } from "./lyra-agents/features/chat/ai-panel-drag-attach";
import { buildTerminalTabPageCitation, readTerminalCitationOutput } from "./lyra-agents/features/chat/terminal-tab-citation";
import { buildWorkspaceTabPageCitation } from "./lyra-agents/features/chat/workspace-tab-citation";
import {
  classifyPermissionRequest,
  imageUrlSource,
  initialLyraAgentDataProviderState,
  isMissingSessionError,
  isPathInsideProjectRoot,
  lyraAgentDataProviderReducer,
  normalizeClarificationOptions,
  parseWorkbenchPathTarget,
  runtimeEventSessionId,
  toErrorMessage,
  translateI18nKey,
  upsertById,
  type LyraAgentDataProviderCallbacks,
  type WorkbenchPathTarget
} from "./lyra-agent-data-provider-runtime";
import { useAgentCitationControls } from "./use-agent-citation-controls";
import { useAgentComposerControls } from "./use-agent-composer-controls";

const SESSION_SNAPSHOT_CACHE_LIMIT = 24;
// Close-lock keeps the X under the cursor, so a click burst activates every
// neighbor in turn. Loading each transcript + model catalog freezes the app.
const SESSION_SWITCH_DEBOUNCE_MS = 100;

export const useLyraAgentDataProvider = (
  desktopApi: LyraDesktopApi | null,
  settingsAiModel?: SettingsAiModel,
  activeSessionId?: string | null,
  activeDraftWorkingDir?: string | null,
  deferInitialSessionCreation = false,
  callbacks: LyraAgentDataProviderCallbacks = {}
): {
  readonly data: ReturnType<typeof createDataProviderValue>;
  readonly followRunning: boolean;
  readonly followActivity: string | null;
  readonly error: string | null;
  readonly cancel: () => Promise<void>;
} => {
  const {
    onActiveSessionChange,
    onSessionSnapshotChange,
    onCreateDraftSessionTab,
    onCreateSessionTab,
    onMissingSession,
    onRequestProjectBind,
    onUpdateDraftWorkingDir,
    onOpenProjectTree,
    onOpenPlanBoard,
    onOpenProjectPlanManager,
    onOpenAgentGit,
    onOpenSubagent,
    onRevealProjectPath,
    onOpenModelSettings,
    onOpenUrlInWorkbench,
    onOpenFile,
    onRevealPathInWorkbench,
    onOpenTerminalLiveSession,
    openDialog,
    composerCitationSinkRef,
    onSetActiveBrowserTab,
    resolveActiveWorkspaceTab,
    onPickFileFromFileManager,
    listWorkspaceTabs,
    listTerminalTabs,
    getTerminalTabPanes,
    onCloseTerminalTab,
    onFocusTerminalTabInDock,
    aiRichRenderingEnabled = true
  } = callbacks;
  const locale = useWorkbenchLocale();

  const [state, dispatch] = useReducer(
    lyraAgentDataProviderReducer,
    initialLyraAgentDataProviderState
  );
  const [modelState, setModelState] = useState<AgentModelCatalogSnapshot | null>(null);
  const [modelBusy, setModelBusy] = useState<"refresh" | "switch" | null>(null);
  const [permissionPolicy, setPermissionPolicy] = useState<AgentPermissionPolicySnapshot | null>(null);
  const [permissionPolicyBusy, setPermissionPolicyBusy] = useState(false);
  const [pendingClarifications, setPendingClarifications] = useState<DecisionQuestion[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionRequest[]>([]);
  const [pendingPlanReview, setPendingPlanReview] = useState<(AgentPlanSnapshot & { sessionId: string }) | null>(null);
  const [pendingCitation, setPendingCitation] = useState<ComposerInsertableCitation | null>(null);
  const [pendingCitationNonce, setPendingCitationNonce] = useState(0);
  const [pendingImages, setPendingImages] = useState<readonly AgentImageAttachment[]>([]);
  const [pendingImagesNonce, setPendingImagesNonce] = useState(0);
  const [pendingFiles, setPendingFiles] = useState<readonly AgentFileAttachment[]>([]);
  const [pendingFilesNonce, setPendingFilesNonce] = useState(0);
  const [citationHighlightMessageId, setCitationHighlightMessageId] = useState<string | null>(null);
  const [citationScrollTarget, setCitationScrollTarget] = useState<CitationScrollTarget | null>(null);
  const currentSessionIdRef = useRef<string | null>(activeSessionId ?? null);
  const streamingOwnersRef = useRef(new Map<string, string>());
  const handleRuntimeEventRef = useRef<(event: AgentRuntimeEvent) => void>(() => undefined);
  const materializedImagePathsRef = useRef<Map<string, string>>(new Map());
  // Session snapshot cache — LRU. Keep enough entries that a typical
  // multi-tab strip can switch without a cold refetch. Map iteration
  // order = insertion order; delete+set on every access moves the entry
  // to the end, so the first key is the least-recently-used.
  const sessionCacheRef = useRef<Map<string, AgentSessionSnapshot>>(new Map());
  // LRU cache helpers — close over the ref, identity doesn't matter.
  const cacheGet = (id: string): AgentSessionSnapshot | undefined => {
    const cache = sessionCacheRef.current;
    const value = cache.get(id);
    if (value !== undefined) {
      cache.delete(id);
      cache.set(id, value);
    }
    return value;
  };
  const cachePut = (id: string, value: AgentSessionSnapshot): void => {
    const cache = sessionCacheRef.current;
    cache.delete(id);
    cache.set(id, value);
    if (cache.size <= SESSION_SNAPSHOT_CACHE_LIMIT) return;
    for (const key of cache.keys()) {
      if (key === id || key === currentSessionIdRef.current) continue;
      cache.delete(key);
      if (cache.size <= SESSION_SNAPSHOT_CACHE_LIMIT) break;
    }
  };
  // Deduplicates in-flight backing session creation if send is clicked twice
  // before the first createSession IPC returns.
  const backingSessionPromiseRef = useRef<Promise<AgentSessionSnapshot> | null>(null);
  const modelConfigSignature = useMemo(() => {
    const config = settingsAiModel?.agentConfig?.config as {
      provider?: unknown;
      providers?: unknown;
    } | undefined;
    return JSON.stringify({
      provider: config?.provider ?? null,
      providers: config?.providers ?? null,
      accountsDefaultProvider: settingsAiModel?.agentAccounts?.defaultProvider ?? null,
      accountsDefaultModel: settingsAiModel?.agentAccounts?.defaultModel ?? null
    });
  }, [settingsAiModel?.agentAccounts, settingsAiModel?.agentConfig]);

  useEffect(() => {
    currentSessionIdRef.current = state.session?.id ?? null;
  }, [state.session?.id]);

  // Keep cache in sync — every session state change writes to cache.
  // During streaming this runs per-token but cachePut is O(1) and causes no re-render.
  useEffect(() => {
    if (state.session !== null) {
      cachePut(state.session.id, state.session);
    }
  }, [state.session]);

  handleRuntimeEventRef.current = (event: AgentRuntimeEvent) => {
    const eventSessionId = runtimeEventSessionId(event);
    if (event.kind === "sessionSnapshot") {
      const current = state.session?.id === event.snapshot.id ? state.session : cacheGet(event.snapshot.id);
      if (current !== undefined && current !== null && isOlderSessionSnapshot(current, event.snapshot)) return;
    }
    // Interactive events (clarifications, permissions, plan reviews, and
    // turn-end events that clear them) must pass through regardless of which
    // tab is active — otherwise a request from a background session is
    // silently dropped and the agent waits until its clarification times out.
    const isCrossSessionEvent =
      event.kind === "clarificationRequested" ||
      event.kind === "permissionRequested" ||
      event.kind === "planReviewRequested" ||
      event.kind === "userGateRequested" ||
      event.kind === "clarificationResolved" ||
      event.kind === "userGateResolved" ||
      event.kind === "turnFinished" ||
      event.kind === "turnFailed" ||
      event.kind === "turnInterrupted";

    // Streaming text/reasoning deltas go to the external StreamStore, not
    // through the React reducer. The store accumulates chunks at O(1) and
    // commits on a 16ms timer, decoupling delta arrival rate from React
    // render rate. This eliminates the per-delta O(n²) string concatenation
    // and messages.map rebuild that previously caused stalls on long messages.
    const streamStore = getStreamStore();
    if (event.kind === "messageDelta") {
      if (eventSessionId !== null) streamingOwnersRef.current.set(event.messageId, eventSessionId);
      const startsStreamBlock = streamStore.appendDelta(
        event.messageId,
        event.blockId,
        event.delta,
        event.replace === true
      );
      // The external store owns the growing string, but React still needs a
      // lightweight structural shell for a newly-created text block. Project
      // only its first delta; subsequent chunks stay off the session reducer.
      // This matters when a tool block is already present: without the shell
      // there is no StreamingText subscriber to paint the store content.
      if (
        startsStreamBlock &&
        (eventSessionId === null || currentSessionIdRef.current === eventSessionId)
      ) {
        dispatch({ type: "event", event });
      }
      // Background session: also update the cached snapshot so tab switch
      // shows accumulated text. Foreground: the StreamStore drives the view.
      if (eventSessionId !== null && currentSessionIdRef.current !== eventSessionId) {
        const cached = cacheGet(eventSessionId);
        if (cached !== undefined) {
          cachePut(eventSessionId, applyAgentRuntimeEventToSnapshot(cached, event));
        }
      }
      return;
    }
    if (event.kind === "messageReasoningDelta") {
      streamStore.appendReasoningDelta(event.messageId, event.delta);
      if (eventSessionId !== null && currentSessionIdRef.current !== eventSessionId) {
        const cached = cacheGet(eventSessionId);
        if (cached !== undefined) {
          cachePut(eventSessionId, applyAgentRuntimeEventToSnapshot(cached, event));
        }
      }
      return;
    }
    if (event.kind === "turnFinished" || event.kind === "turnFailed" || event.kind === "turnInterrupted" || event.kind === "turnCompleted") {
      streamStore.flush();
      for (const [messageId, owner] of streamingOwnersRef.current) {
        if (owner !== event.sessionId) continue;
        for (const block of streamStore.getTextBlocks(messageId)) {
          if (block.text.length === 0) continue;
          const deltaEvent: AgentRuntimeEvent = { kind: "messageDelta", sessionId: event.sessionId,
            messageId, ...(block.blockId === null ? {} : { blockId: block.blockId }), delta: block.text, replace: true };
          if (currentSessionIdRef.current === event.sessionId) dispatch({ type: "event", event: deltaEvent });
          else {
            const cached = cacheGet(event.sessionId);
            if (cached !== undefined) cachePut(event.sessionId, applyAgentRuntimeEventToSnapshot(cached, deltaEvent));
          }
        }
        streamStore.reset(messageId);
        streamingOwnersRef.current.delete(messageId);
      }
    }
    if (event.kind === "toolStarted") {
      const messageId = event.messageId;
      if (typeof messageId === "string" && messageId.length > 0) {
        streamStore.sealReasoning(messageId);
      }
    }
    // The event queue preserves chronological order. A committed snapshot is
    // authoritative regardless of length; subsequent deltas start a new suffix.
    if (event.kind === "messageCommitted") {
      streamStore.reconcileMessage(event.message);
      streamingOwnersRef.current.set(event.message.id, event.sessionId);
    } else if (event.kind === "sessionSnapshot") {
      for (const message of event.snapshot.messages) {
        streamStore.reset(message.id);
        streamingOwnersRef.current.delete(message.id);
      }
    }

    if (eventSessionId !== null && !isCrossSessionEvent && currentSessionIdRef.current !== eventSessionId) {
      // Background session: apply structural events (tool, turn, etc.) to
      // cached snapshot so tab switch has the latest state. Deltas were
      // already handled above via the StreamStore + cache update.
      const cached = cacheGet(eventSessionId);
      if (cached !== undefined) {
        cachePut(
          eventSessionId,
          applyAgentRuntimeEventToSnapshot(cached, event)
        );
      }
      return;
    }
    if (event.kind === "clarificationRequested") {
      const question: DecisionQuestion = {
        id: event.clarificationId,
        question: event.question,
        options: normalizeClarificationOptions(event.options ?? []),
        allowCustomAnswer: event.allowCustomAnswer,
        detail: event.detail ?? null,
        sessionId: event.sessionId
      };
      const displayQuestion = translateI18nKey(event.i18nKey);
      const displayDetail = translateI18nKey(event.detailI18nKey);
      if (displayQuestion !== undefined) question.displayQuestion = displayQuestion;
      if (displayDetail !== undefined) question.displayDetail = displayDetail;
      setPendingClarifications((items) =>
        upsertById(items, question)
      );
    } else if (event.kind === "permissionRequested") {
      setPendingPermissions((items) =>
        upsertById(items, {
          id: event.permissionId,
          type: classifyPermissionRequest(event.title, event.detail),
          title: event.title,
          detail: event.detail,
          sessionId: event.sessionId
        })
      );
    } else if (event.kind === "planReviewRequested") {
      setPendingPlanReview({
        ...event.plan,
        sessionId: event.sessionId
      });
    } else if (event.kind === "clarificationResolved") {
      setPendingClarifications((items) =>
        items.filter((item) => item.id !== event.clarificationId)
      );
    } else if (event.kind === "userGateResolved") {
      if (event.gateKind === "clarification") {
        setPendingClarifications((items) =>
          items.filter((item) => item.id !== event.gateId)
        );
      } else if (event.gateKind === "permission") {
        setPendingPermissions((items) =>
          items.filter((item) => item.id !== event.gateId)
        );
      } else if (event.gateKind === "plan_review") {
        setPendingPlanReview((current) =>
          current !== null && current.sessionId === event.sessionId ? null : current
        );
      }
    } else if (
      event.kind === "turnFinished" ||
      event.kind === "turnFailed" ||
      event.kind === "turnInterrupted"
    ) {
      // Only clear pending items belonging to the session whose turn ended;
      // other sessions may still have live interactive requests.
      setPendingClarifications((items) =>
        items.filter((item) => item.sessionId !== event.sessionId)
      );
      setPendingPermissions((items) =>
        items.filter((item) => item.sessionId !== event.sessionId)
      );
      setPendingPlanReview((current) =>
        current !== null && current.sessionId === event.sessionId ? null : current
      );
    }
    dispatch({ type: "event", event });
    if (
      (event.kind === "turnFinished"
        || event.kind === "turnFailed"
        || event.kind === "turnInterrupted")
      && currentSessionIdRef.current === event.sessionId
    ) {
      void desktopApi?.agent?.readSession({ sessionId: event.sessionId })
        .then((snapshot) => {
          if (currentSessionIdRef.current === snapshot.id) {
            dispatch({ type: "snapshot", snapshot });
          }
        })
        .catch(() => undefined);
    }
  };

  useEffect(() => {
    if (desktopApi?.agent === undefined) {
      dispatch({ type: "error", message: t("runtime.desktopBridgeUnavailable") });
      return;
    }
    return desktopApi.agent.onEvent((event) => {
      handleRuntimeEventRef.current(event);
    });
  }, [desktopApi]);

  const hasCompletedInitialSessionLoadRef = useRef(false);

  useEffect(() => {
    if (desktopApi?.agent === undefined) {
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const agentApi = desktopApi.agent;
    const requestedSessionId = activeSessionId ?? null;

    const load = (): void => {
      if (disposed) return;
      getStreamStore().clear();
      currentSessionIdRef.current = requestedSessionId;

      if (requestedSessionId === null && deferInitialSessionCreation) {
        // Catalog is process-wide. Clearing it here hid composer chrome on draft tabs.
        dispatch({ type: "empty" });
        return;
      }

      // If we have a cached snapshot, render immediately — no loading flash.
      const cachedSnapshot = requestedSessionId !== null
        ? cacheGet(requestedSessionId)
        : undefined;
      if (cachedSnapshot !== undefined) {
        dispatch({ type: "snapshot", snapshot: cachedSnapshot });
      } else {
        dispatch({ type: "loading" });
      }

      // Fetch fresh snapshot in background (even from cache, to catch updates).
      // Removed listSessions existence check — readSession failure handles missing sessions.
      const initialSession = requestedSessionId === null
        ? agentApi.createSession({ title: t("aiPanel.defaultSessionTitle") })
        : agentApi.readSession({ sessionId: requestedSessionId });

      void initialSession
        .then((snapshot) => {
          if (disposed) return;
          currentSessionIdRef.current = snapshot.id;
          dispatch({ type: "snapshot", snapshot });
        })
        .catch((error: unknown) => {
          if (disposed) return;
          if (requestedSessionId !== null && isMissingSessionError(error)) {
            onMissingSession?.(requestedSessionId);
            dispatch({ type: "empty" });
            return;
          }
          dispatch({ type: "error", message: toErrorMessage(error) });
        });
    };

    const isDraftEmpty = requestedSessionId === null && deferInitialSessionCreation;
    const delay = !isDraftEmpty && hasCompletedInitialSessionLoadRef.current
      ? SESSION_SWITCH_DEBOUNCE_MS
      : 0;
    if (!isDraftEmpty) {
      hasCompletedInitialSessionLoadRef.current = true;
    }
    if (delay === 0) {
      load();
    } else {
      timer = setTimeout(load, delay);
    }

    return () => {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [activeSessionId, deferInitialSessionCreation, desktopApi, locale, onMissingSession]);

  useEffect(() => {
    if (
      desktopApi?.agent === undefined
      || typeof desktopApi.agent.readPermissionPolicy !== "function"
    ) {
      setPermissionPolicy(null);
      return;
    }
    const agent = desktopApi.agent;
    const sensitiveValues = desktopApi.sensitiveValues;
    let disposed = false;
    void agent.readPermissionPolicy()
      .then(async (snapshot) => {
        if (disposed) return;
        setPermissionPolicy(snapshot);

        // 启动时恢复：full_auto 模式且有 credential ref → 从 safeStorage 解密 → 注入 Rust
        const ref = snapshot.elevationCredentialRef;
        if (
          (snapshot.effectiveMode === "full_auto" || snapshot.effectiveMode === "autonomous")
          && ref !== undefined
          && ref !== null
          && sensitiveValues !== undefined
          && isLyraSensitiveValueRef(ref)
        ) {
          try {
            const { value } = await sensitiveValues.revealToUser({ ref });
            if (!disposed && value.length > 0) {
              await agent.setElevationSecret({ secret: value });
            }
          } catch {
            // safeStorage 解密失败（OS 密钥变更等）— 静默降级，下次 sudo 会报权限错误
          }
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
    };
  }, [desktopApi]);

  useEffect(() => {
    if (desktopApi?.agent === undefined) return;
    let disposed = false;
    void desktopApi.agent.listAgentModels()
      .then((response) => {
        if (!disposed) setModelState(response);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          console.warn("[lyra-agent] listAgentModels failed", error);
        }
      });
    return () => {
      disposed = true;
    };
  }, [desktopApi, modelConfigSignature]);

  useEffect(() => {
    if (state.session === null) return;
    onActiveSessionChange?.(state.session.id);
  }, [onActiveSessionChange, state.session?.id]);

  // The tab strip only consumes session metadata. Streaming deltas replace the
  // session object many times per second; forwarding each replacement to the
  // shell made the entire workbench re-render for every token.
  useEffect(() => {
    if (state.session === null) return;
    onSessionSnapshotChange?.(state.session);
  }, [
    onSessionSnapshotChange,
    state.session?.id,
    state.session?.title,
    state.session?.turnStatus,
    state.session?.workingDir,
    state.session?.projectBound,
    state.session?.workingDirIsHome
  ]);

  useEffect(() => {
    if (!activeDraftWorkingDir || !desktopApi?.agent?.registerProject) return;
    void desktopApi.agent.registerProject({ workingDir: activeDraftWorkingDir }).catch((error: unknown) => {
      dispatch({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
  }, [activeDraftWorkingDir, desktopApi]);

  const resolvedSessionId = state.session?.id ?? activeSessionId ?? null;

  const createSessionRequest = useCallback((): AgentSessionCreateRequest => {
    const workingDir = activeDraftWorkingDir?.trim() ?? "";
    return workingDir.length > 0
      ? { title: t("aiPanel.defaultSessionTitle"), workingDir }
      : { title: t("aiPanel.defaultSessionTitle") };
  }, [activeDraftWorkingDir]);

  const ensureBackingSession = useCallback(async (): Promise<AgentSessionSnapshot | null> => {
    if (desktopApi?.agent === undefined) return null;
    if (state.session !== null) return state.session;
    // If create is already in flight (double-send), await the same promise.
    if (backingSessionPromiseRef.current !== null) {
      return backingSessionPromiseRef.current;
    }
    const request = createSessionRequest();
    const createPromise = Promise.resolve(
      onCreateSessionTab === undefined
        ? desktopApi.agent.createSession(request)
        : onCreateSessionTab(request)
    );
    const promise = createPromise.then((snapshot) => {
      currentSessionIdRef.current = snapshot.id;
      dispatch({ type: "snapshot", snapshot });
      return snapshot;
    });
    backingSessionPromiseRef.current = promise;
    promise.finally(() => { backingSessionPromiseRef.current = null; });
    return promise;
  }, [createSessionRequest, desktopApi, onCreateSessionTab, state.session]);

  const sendMessage = useCallback(async (
    text: string,
    images: readonly AgentImageAttachment[] = [],
    citations: readonly AgentTranscriptCitation[] = [],
    pageCitations: readonly AgentPageCitation[] = [],
    fileCitations: readonly AgentFileCitation[] = [],
    segments: readonly ComposerSegment[] = []
  ): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    const trimmed = text.trim();
    if (
      trimmed.length === 0
      && images.length === 0
      && citations.length === 0
      && pageCitations.length === 0
      && fileCitations.length === 0
    ) {
      return;
    }
    const session = await ensureBackingSession();
    if (session === null) return;

    const commitError = validateImageTurnCommit(trimmed, images, segments);
    if (commitError !== null) {
      throw new Error(commitError);
    }

    const materializeImageAttachment = desktopApi.agent?.materializeImageAttachment;
    const preparedImages = images.length === 0
      ? []
      : await Promise.all(images.map(async (image) =>
          buildImageTurnPayloadEntry(image, materializeImageAttachment)
        ));

    if (inlineImageMarkerIds(trimmed).length > 0 && preparedImages.length === 0) {
      throw new Error(
        "Image markers are present but no image attachments could be committed. Remove and re-attach the image."
      );
    }

    await desktopApi.agent.sendTurn({
      sessionId: session.id,
      text: trimmed,
      webLinks: composerWebLinks(segments, trimmed),
      ...(preparedImages.length === 0 ? {} : { images: preparedImages }),
      ...(citations.length === 0 ? {} : { citations }),
      ...(pageCitations.length === 0 ? {} : { pageCitations }),
      ...(fileCitations.length === 0 ? {} : { fileCitations })
    });
  }, [desktopApi, ensureBackingSession]);

  const {
    addCitationToComposer,
    addPageCitationToComposer,
    reportCitationScrollFinished,
    scrollToMessage
  } = useAgentCitationControls({
    session: state.session,
    composerCitationSinkRef,
    setPendingCitation,
    setPendingCitationNonce,
    setCitationScrollTarget,
    setCitationHighlightMessageId
  });

  const workspaceTabsForComposer = useMemo(
    () => listWorkspaceTabs?.() ?? [],
    [listWorkspaceTabs]
  );
  const terminalTabsForComposer = useMemo(
    () => listTerminalTabs?.() ?? [],
    [listTerminalTabs]
  );

  const attachDragPayloadToComposer = useCallback(async (dataTransfer: DataTransfer): Promise<boolean> => {
    const action = await resolveAiPanelDragAttachAction(
      dataTransfer,
      listWorkspaceTabs?.() ?? [],
      listTerminalTabs?.() ?? []
    );
    if (action === null) {
      return false;
    }
    if (action.kind === "workspace-tab") {
      addPageCitationToComposer(buildWorkspaceTabPageCitation(action.tab));
      return true;
    }
    if (action.kind === "page-citation") {
      addPageCitationToComposer(action.citation);
      return true;
    }
    if (action.kind === "terminal-tab") {
      const panes = getTerminalTabPanes?.(action.tab.id) ?? [];
      const activePane = panes.find((pane) => pane.id === action.tab.activePaneId) ?? panes[0];
      const output = await readTerminalCitationOutput(
        desktopApi === null ? undefined : (request) => desktopApi.terminal.read(request),
        activePane?.sessionId
      );
      addPageCitationToComposer(buildTerminalTabPageCitation(action.tab, workspaceTabsForComposer, output));
      return true;
    }
    if (action.kind === "file") {
      setPendingFiles([action.file]);
      setPendingFilesNonce((value) => value + 1);
      return true;
    }
    if (action.kind === "files") {
      setPendingFiles(action.files);
      setPendingFilesNonce((value) => value + 1);
      return true;
    }
    setPendingImages(action.images);
    setPendingImagesNonce((value) => value + 1);
    return true;
  }, [addPageCitationToComposer, desktopApi, getTerminalTabPanes, listTerminalTabs, listWorkspaceTabs, workspaceTabsForComposer]);

  const navigateToPageCitation = useCallback(async (citation: AgentPageCitation): Promise<void> => {
    const navigationOptions = onOpenTerminalLiveSession === undefined
      ? {}
      : {
          onOpenTerminalLiveSession: (request: {
            readonly terminalTabId?: string | null;
          }) => onOpenTerminalLiveSession(request)
        };
    await navigateToPageCitationInWorkbench(
      desktopApi,
      onSetActiveBrowserTab ?? (() => undefined),
      citation,
      {
        ...navigationOptions,
        onOpenExternalPageUrl: async (url, title) => {
          const trimmedUrl = url.trim();
          if (trimmedUrl.length === 0) {
            return;
          }
          await onOpenUrlInWorkbench?.({
            url: trimmedUrl,
            ...(title === undefined ? {} : { title })
          });
        }
      }
    );
  }, [desktopApi, onOpenTerminalLiveSession, onOpenUrlInWorkbench, onSetActiveBrowserTab]);

  const captureWorkspaceScreenshot = useCallback(async (): Promise<AgentImageAttachment | null> => {
    if (desktopApi === null) return null;
    const activeTab = resolveActiveWorkspaceTab?.();
    if (activeTab === undefined) {
      return null;
    }
    const workspaceContext = {
      workspaceTabId: activeTab.id,
      workspaceTabTitle: activeTab.title,
      workspaceTabPageKind: activeTab.pageKind,
      workspaceTabAddress: activeTab.displayAddress
    };
    const capture = activeTab.pageKind === "page"
      ? await desktopApi.browser.capturePage({ tabId: activeTab.id })
      : await desktopApi.browser.captureWindow();
    return {
      id: "workspace-screenshot-" + Date.now().toString(36),
      mediaType: capture.mimeType,
      data: capture.imageBase64,
      label: activeTab.title.trim() || t("lyra-agents-message.workspaceScreenshot"),
      source: "workspace-screenshot",
      width: capture.width,
      height: capture.height,
      ...workspaceContext
    };
  }, [desktopApi, locale, resolveActiveWorkspaceTab]);

  const pickFileFromFileManager = useCallback(async (): Promise<
    | { readonly kind: "image"; readonly attachment: AgentImageAttachment }
    | { readonly kind: "file"; readonly attachment: AgentFileCitation }
    | null
  > => {
    if (onPickFileFromFileManager === undefined) {
      return null;
    }
    const filePath = await onPickFileFromFileManager();
    if (filePath === null) {
      return null;
    }
    if (isImageViewerSupportedPath(filePath)) {
      const image = await readImageAttachmentFromPath(filePath);
      if (image === null) {
        return null;
      }
      return { kind: "image", attachment: image };
    }
    const file = buildFileAttachmentFromPath(filePath);
    if (file === null) {
      return null;
    }
    return { kind: "file", attachment: file };
  }, [onPickFileFromFileManager]);

  const captureWindowScreenshot = useCallback(async (): Promise<AgentImageAttachment | null> => {
    if (desktopApi === null) return null;
    const capture = await desktopApi.browser.captureWindow();
    return {
      id: "window-screenshot-" + Date.now().toString(36),
      mediaType: capture.mimeType,
      data: capture.imageBase64,
      label: t("lyra-agents-message.windowScreenshot"),
      source: "window-screenshot",
      width: capture.width,
      height: capture.height
    };
  }, [desktopApi, locale]);

  const cancel = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    const sessionId = resolvedSessionId;
    if (sessionId === null) return;
    await desktopApi.agent.cancelTurn({ sessionId });
  }, [desktopApi, resolvedSessionId]);

  const confirmFullAutoMode = useCallback(async (): Promise<boolean> => {
    const description = t("permissionPolicy.fullAutoWarningDescription");
    if (openDialog === undefined) {
      return window.confirm(description);
    }
    return new Promise<boolean>((resolve) => {
      openDialog({
        title: t("permissionPolicy.fullAutoWarningTitle"),
        description,
        source: {
          title: "Lyra Agent",
          subtitle: t("permissionPolicy.dialogSourceSubtitle"),
          iconLabel: "LA",
          iconTone: "default"
        },
        actions: [
          {
            id: "cancel",
            label: t("permissionPolicy.cancel"),
            onSelect: () => resolve(false)
          },
          {
            id: "continue",
            label: t("permissionPolicy.continue"),
            tone: "danger",
            onSelect: () => resolve(true)
          }
        ]
      });
    });
  }, [locale, openDialog]);

  const confirmAutonomousMode = useCallback(async (): Promise<boolean> => {
    const description = t("permissionPolicy.autonomousWarningDescription");
    if (openDialog === undefined) {
      return window.confirm(description);
    }
    return new Promise<boolean>((resolve) => {
      openDialog({
        title: t("permissionPolicy.autonomousWarningTitle"),
        description,
        source: {
          title: "Lyra Agent",
          subtitle: t("permissionPolicy.dialogSourceSubtitle"),
          iconLabel: "LA",
          iconTone: "danger"
        },
        actions: [
          {
            id: "cancel",
            label: t("permissionPolicy.cancel"),
            onSelect: () => resolve(false)
          },
          {
            id: "continue",
            label: t("permissionPolicy.continue"),
            tone: "danger",
            onSelect: () => resolve(true)
          }
        ]
      });
    });
  }, [locale, openDialog]);

  const requestAdminPassword = useCallback(async (): Promise<string | null> => {
    const description = t("permissionPolicy.adminCredentialDescription");
    if (openDialog === undefined) {
      const value = window.prompt(description);
      return value !== null && value.length > 0 ? value : null;
    }
    return new Promise<string | null>((resolve) => {
      openDialog({
        title: t("permissionPolicy.adminCredentialTitle"),
        description,
        source: {
          title: "Lyra Agent",
          subtitle: t("permissionPolicy.sensitiveValueSubtitle"),
          iconLabel: "KEY",
          iconTone: "accent"
        },
        input: {
          id: "admin-password",
          label: t("permissionPolicy.adminPasswordLabel"),
          type: "password",
          submitActionId: "save"
        },
        actions: [
          {
            id: "cancel",
            label: t("permissionPolicy.cancel"),
            onSelect: () => resolve(null)
          },
          {
            id: "save",
            label: t("permissionPolicy.saveAndEnable"),
            tone: "danger",
            onSelect: ({ inputValue }) => {
              const password = inputValue ?? "";
              resolve(password.length > 0 ? password : null);
            }
          }
        ]
      });
    });
  }, [locale, openDialog]);

  const showPasswordInvalid = useCallback(async (): Promise<void> => {
    const description = t("permissionPolicy.passwordInvalidDescription");
    if (openDialog === undefined) {
      window.alert(description);
      return;
    }
    return new Promise<void>((resolve) => {
      openDialog({
        title: t("permissionPolicy.passwordInvalidTitle"),
        description,
        source: {
          title: "Lyra Agent",
          subtitle: t("permissionPolicy.dialogSourceSubtitle"),
          iconLabel: "LA",
          iconTone: "danger"
        },
        actions: [
          {
            id: "ok",
            label: t("permissionPolicy.passwordInvalidAck"),
            onSelect: () => resolve()
          }
        ]
      });
    });
  }, [locale, openDialog]);

  const confirmDisableFullAuto = useCallback(async (
    hasCredential: boolean
  ): Promise<"delete" | "keep" | "cancel"> => {
    if (!hasCredential) return "keep";
    const description = t("permissionPolicy.deleteCredentialDescription");
    if (openDialog === undefined) {
      return window.confirm(description) ? "delete" : "cancel";
    }
    return new Promise<"delete" | "keep" | "cancel">((resolve) => {
      openDialog({
        title: t("permissionPolicy.deleteCredentialTitle"),
        description,
        source: {
          title: "Lyra Agent",
          subtitle: t("permissionPolicy.dialogSourceSubtitle"),
          iconLabel: "LA",
          iconTone: "danger"
        },
        actions: [
          {
            id: "cancel",
            label: t("permissionPolicy.cancel"),
            onSelect: () => resolve("cancel")
          },
          {
            id: "keep",
            label: t("permissionPolicy.keepAndDisable"),
            onSelect: () => resolve("keep")
          },
          {
            id: "delete",
            label: t("permissionPolicy.deleteAndDisable"),
            tone: "danger",
            onSelect: () => resolve("delete")
          }
        ]
      });
    });
  }, [locale, openDialog]);

  const switchPermissionMode = useCallback(async (
    mode: "approval" | "full_auto" | "autonomous"
  ): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    const agent = desktopApi.agent;
    const sensitiveValues = desktopApi.sensitiveValues;
    const currentMode = permissionPolicy?.mode ?? "approval";
    if (mode === currentMode) return;

    if (mode === "approval") {
      const existingRef = permissionPolicy?.elevationCredentialRef;
      const hasCredential = existingRef !== undefined && existingRef !== null;
      const choice = await confirmDisableFullAuto(hasCredential);
      if (choice === "cancel") return;
      setPermissionPolicyBusy(true);
      try {
        if (choice === "delete") {
          await agent.clearElevationSecret();
          if (sensitiveValues !== undefined && isLyraSensitiveValueRef(existingRef)) {
            await sensitiveValues.delete({ ref: existingRef });
          }
        } else if (desktopApi?.appMeta?.platform === "win32") {
          await agent.clearElevationSecret();
        }
        setPermissionPolicy(await agent.setPermissionPolicyMode({ mode }));
      } finally {
        setPermissionPolicyBusy(false);
      }
      return;
    }

    const confirmed = mode === "autonomous"
      ? await confirmAutonomousMode()
      : await confirmFullAutoMode();
    if (!confirmed) return;

    const alreadyElevated = currentMode === "full_auto" || currentMode === "autonomous";
    const existingRef = permissionPolicy?.elevationCredentialRef;
    const hasCredential = existingRef !== undefined && existingRef !== null;
    const isWindows = desktopApi?.appMeta?.platform === "win32";
    if (alreadyElevated && (hasCredential || isWindows)) {
      setPermissionPolicyBusy(true);
      try {
        setPermissionPolicy(await agent.setPermissionPolicyMode({
          mode,
          ...(hasCredential ? { elevationCredentialRef: existingRef } : {})
        }));
      } finally {
        setPermissionPolicyBusy(false);
      }
      return;
    }

    if (isWindows) {
      setPermissionPolicyBusy(true);
      try {
        const validation = await agent.validateElevationPassword({ password: "windows-uac" });
        if (!validation.valid) {
          await showPasswordInvalid();
          return;
        }
        setPermissionPolicy(await agent.setPermissionPolicyMode({ mode }));
      } finally {
        setPermissionPolicyBusy(false);
      }
      return;
    }

    if (sensitiveValues === undefined) return;
    const password = await requestAdminPassword();
    if (password === null) return;
    setPermissionPolicyBusy(true);
    try {
      const validation = await agent.validateElevationPassword({ password });
      if (!validation.valid) {
        await showPasswordInvalid();
        return;
      }
      const credential = await sensitiveValues.store({
        owner: "system",
        valueKind: "credential",
        label: t("permissionPolicy.adminCredentialLabel"),
        description: t("permissionPolicy.adminCredentialStorageDescription"),
        value: password,
        capabilities: ["list_metadata", "use", "reveal_to_user"]
      });
      await agent.setElevationSecret({ secret: password });
      setPermissionPolicy(await agent.setPermissionPolicyMode({
        mode,
        elevationCredentialRef: credential.ref
      }));
    } finally {
      setPermissionPolicyBusy(false);
    }
  }, [
    confirmAutonomousMode,
    confirmDisableFullAuto,
    confirmFullAutoMode,
    desktopApi,
    locale,
    permissionPolicy?.elevationCredentialRef,
    permissionPolicy?.mode,
    requestAdminPassword,
    showPasswordInvalid
  ]);

  const previewRollback = useCallback(async (messageId: string) => {
    if (desktopApi?.agent === undefined || state.session === null) {
      return {
        sessionId: "",
        messageId,
        available: false,
        removedMessageCount: 0,
        changedFiles: [],
        unavailableReason: "No active agent session."
      };
    }
    return desktopApi.agent.previewRollback({
      sessionId: state.session.id,
      messageId
    });
  }, [desktopApi, state.session]);

  const rollbackMessage = useCallback(async (messageId: string): Promise<void> => {
    if (desktopApi?.agent === undefined || state.session === null) return;
    const response = await desktopApi.agent.restoreRollback({
      sessionId: state.session.id,
      messageId,
      mode: "taskAndWorkspace"
    });
    // Rollback is intentionally destructive to the visible timeline. A normal
    // snapshot merge preserves local streaming messages, so use a replacement
    // action here to remove the rolled-back conversation entries as well.
    dispatch({ type: "replaceSnapshot", snapshot: response.snapshot });
  }, [desktopApi, state.session]);

  const createSessionNow = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    if (onCreateDraftSessionTab !== undefined) {
      onCreateDraftSessionTab({ title: t("aiPanel.defaultSessionTitle") });
      dispatch({ type: "empty" });
      return;
    }
    const request = createSessionRequest();
    dispatch({ type: "loading" });
    try {
      const snapshot = await (
        onCreateSessionTab === undefined
          ? desktopApi.agent.createSession(request)
          : onCreateSessionTab(request)
      );
      dispatch({ type: "snapshot", snapshot });
    } catch (error: unknown) {
      dispatch({ type: "error", message: toErrorMessage(error) });
    }
  }, [
    createSessionRequest,
    desktopApi,
    onCreateDraftSessionTab,
    onCreateSessionTab
  ]);

  const createSession = useCallback(async (): Promise<void> => {
    await createSessionNow();
  }, [createSessionNow]);

  const bindProject = useCallback(async (workingDir?: string): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    // A session bound to a real project is permanent (runtime rejects rebinds); a
    // home-defaulted session may still be bound once. Otherwise stash on the draft
    // tab (bound for real when the first message creates the session).
    if (state.session?.projectBound === true && state.session.workingDirIsHome !== true) return;
    const chosen = workingDir?.trim() ?? "";
    const selectedPath = chosen.length > 0
      ? chosen
      : onRequestProjectBind === undefined
        ? null
        : await onRequestProjectBind(activeDraftWorkingDir ?? undefined);
    if (selectedPath === null || selectedPath.trim().length === 0) return;
    const registered = await desktopApi.agent.registerProject({ workingDir: selectedPath });
    if (state.session === null) {
      onUpdateDraftWorkingDir?.(registered.project.path);
      return;
    }
    const snapshot = await desktopApi.agent.bindProject({
      sessionId: state.session.id,
      workingDir: selectedPath
    });
    dispatch({ type: "snapshot", snapshot });
  }, [
    activeDraftWorkingDir,
    desktopApi,
    onRequestProjectBind,
    onUpdateDraftWorkingDir,
    state.session
  ]);

  const openProjectTree = useCallback(async (): Promise<void> => {
    if (
      state.session?.projectBound !== true ||
      typeof state.session.workingDir !== "string" ||
      state.session.workingDir.trim().length === 0
    ) {
      return;
    }
    await onOpenProjectTree?.({
      sessionId: state.session.id,
      workingDir: state.session.workingDir
    });
  }, [
    onOpenProjectTree,
    state.session?.id,
    state.session?.projectBound,
    state.session?.workingDir
  ]);

  const submitDecisions = useCallback(async (answers: Record<string, string>) => {
    if (desktopApi?.agent === undefined) return;
    const entries = Object.entries(answers)
      .map(([id, answer]) => [id, answer.trim()] as const)
      .filter(([, answer]) => answer.length > 0);
    for (const [id, answer] of entries) {
      const question = pendingClarifications.find((item) => item.id === id);
      if (question === undefined) continue;
      const option = question.options.find((candidate) => candidate.value === answer);
      const selectedOption = option?.label ?? null;
      const selectedOptionValue = option?.value ?? null;
      await desktopApi.agent.respondClarification({
        sessionId: question.sessionId,
        clarificationId: id,
        answer: option?.label ?? answer,
        selectedOption,
        selectedOptionValue
      });
      setPendingClarifications((items) => items.filter((item) => item.id !== id));
    }
  }, [desktopApi, pendingClarifications]);

  const approvePermission = useCallback(async (id: string) => {
    if (desktopApi?.agent === undefined) return;
    const permission = pendingPermissions.find((item) => item.id === id);
    if (permission === undefined) return;
    await desktopApi.agent.respondPermission({
      sessionId: permission.sessionId,
      permissionId: id,
      allowed: true
    });
    setPendingPermissions((items) => items.filter((item) => item.id !== id));
  }, [desktopApi, pendingPermissions]);

  const denyPermission = useCallback(async (id: string) => {
    if (desktopApi?.agent === undefined) return;
    const permission = pendingPermissions.find((item) => item.id === id);
    if (permission === undefined) return;
    await desktopApi.agent.respondPermission({
      sessionId: permission.sessionId,
      permissionId: id,
      allowed: false
    });
    setPendingPermissions((items) => items.filter((item) => item.id !== id));
  }, [desktopApi, pendingPermissions]);

  const openPlanReview = useCallback(async (plan: AgentPlanSnapshot & { sessionId?: string }): Promise<void> => {
    const sessionId = plan.sessionId ?? state.session?.id;
    if (sessionId === undefined) return;
    await onOpenPlanBoard?.({
      sessionId,
      plan,
      projectTodo: state.session?.projectTodo ?? null
    });
  }, [onOpenPlanBoard, state.session]);

  const openProjectTodo = useCallback(async (): Promise<void> => {
    if (state.session?.plan === null || state.session?.plan === undefined) return;
    await onOpenPlanBoard?.({
      sessionId: state.session.id,
      plan: state.session.plan,
      projectTodo: state.session.projectTodo ?? null
    });
  }, [onOpenPlanBoard, state.session]);

  const openProjectPlanManager = useCallback(async (
    view: "plan" | "todo" | "both" = "both"
  ): Promise<void> => {
    if (
      state.session?.projectBound !== true ||
      state.session.workingDirIsHome === true ||
      typeof state.session.workingDir !== "string" ||
      state.session.workingDir.trim().length === 0
    ) {
      return;
    }
    await onOpenProjectPlanManager?.({
      sessionId: state.session.id,
      workingDir: state.session.workingDir,
      view
    });
  }, [
    onOpenProjectPlanManager,
    state.session?.id,
    state.session?.projectBound,
    state.session?.workingDir,
    state.session?.workingDirIsHome
  ]);

  const openProjectGit = useCallback(async (): Promise<void> => {
    if (
      state.session?.id === undefined ||
      typeof state.session.workingDir !== "string" ||
      state.session.workingDir.trim().length === 0
    ) {
      return;
    }
    onOpenAgentGit?.({
      sessionId: state.session.id,
      workingDir: state.session.workingDir
    });
  }, [
    onOpenAgentGit,
    state.session?.id,
    state.session?.workingDir
  ]);

  const respondPlanReview = useCallback(async (
    action: AgentPlanReviewRespondAction,
    feedback?: string | null
  ): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    // ponytail: planReview prop 有 fallback 逻辑（line 2085）——pendingPlanReview
    // 为 null 时从 session 快照 plan.phase==="reviewing" 渲染面板。此处需同步 fallback，
    // 否则按钮可见但点击 return early → 无反应。
    const plan = pendingPlanReview ?? (
      state.session?.plan?.phase === "reviewing" ? state.session.plan : null
    );
    if (plan === null) return;
    const sessionId = pendingPlanReview?.sessionId ?? state.session?.id;
    if (sessionId === undefined) return;
    const snapshot = await desktopApi.agent.respondPlanReview({
      sessionId,
      action,
      feedback: feedback ?? null
    });
    setPendingPlanReview(null);
    dispatch({ type: "snapshot", snapshot });
  }, [desktopApi, pendingPlanReview, state.session]);

  const currentSessionId = resolvedSessionId;

  const switchModel = useCallback(async (modelId: string): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    // ponytail: modelId 是复合 uid `${provider}:${model}`（见 provider_config.rs catalog id）。
    // 必须先在 catalog 里命中条目，再取它的 bare `model`/`provider` 发给后端。
    // 若 find 失败（快照陈旧），绝不能把复合 uid 当 model 名发出——会路由到错误端点。
    const selectedModel = modelState?.models.find((model) => model.id === modelId);
    if (selectedModel === undefined) return;
    const model = (selectedModel.model ?? "").trim();
    const provider = (
      selectedModel.providerKey
      ?? selectedModel.providerId
      ?? selectedModel.provider
      ?? ""
    ).trim();
    if (model.length === 0) return;
    setModelBusy("switch");
    try {
      setModelState(await desktopApi.agent.switchAgentModel({
        sessionId: currentSessionId,
        model,
        provider: provider.length === 0 ? null : provider
      }));
    } finally {
      setModelBusy(null);
    }
  }, [currentSessionId, desktopApi, modelState?.models]);

  const refreshModels = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    setModelBusy("refresh");
    try {
      setModelState(await desktopApi.agent.refreshAgentModels({ sessionId: currentSessionId }));
    } finally {
      setModelBusy(null);
    }
  }, [currentSessionId, desktopApi]);

  const openModelSettings = useCallback(async (): Promise<void> => {
    await onOpenModelSettings?.();
  }, [onOpenModelSettings]);

  const openUrlInWorkbench = useCallback(async (url: string, title?: string): Promise<void> => {
    const trimmedUrl = url.trim();
    if (trimmedUrl.length === 0) return;
    await onOpenUrlInWorkbench?.({
      url: trimmedUrl,
      ...(title === undefined ? {} : { title })
    });
  }, [onOpenUrlInWorkbench]);

  const routeProjectPathIfBound = useCallback(async (
    target: WorkbenchPathTarget,
    mode: "reveal" | "open-file"
  ): Promise<boolean> => {
    const session = state.session;
    if (
      onRevealProjectPath === undefined ||
      session?.projectBound !== true ||
      session.workingDirIsHome === true
    ) {
      return false;
    }
    const sessionId = session.id.trim();
    const workingDir = session.workingDir.trim();
    if (
      sessionId.length === 0 ||
      workingDir.length === 0 ||
      !isPathInsideProjectRoot(target.path, workingDir)
    ) {
      return false;
    }
    await onRevealProjectPath({
      sessionId,
      workingDir,
      path: target.path,
      mode,
      ...(mode === "open-file" && target.location !== undefined
        ? { location: target.location }
        : {})
    });
    return true;
  }, [
    onRevealProjectPath,
    state.session
  ]);

  const openFileInWorkbench = useCallback(async (
    filePath: string,
    options?: { readonly siblingPaths?: readonly string[] }
  ): Promise<void> => {
    const target = parseWorkbenchPathTarget(filePath, state.session?.workingDir);
    if (target === null) return;
    if (await routeProjectPathIfBound(target, "open-file")) {
      return;
    }
    if (options?.siblingPaths !== undefined && options.siblingPaths.length > 1) {
      onOpenFile?.(target.path, target.location, { siblingPaths: options.siblingPaths });
      return;
    }
    onOpenFile?.(target.path, target.location);
  }, [
    onOpenFile,
    routeProjectPathIfBound,
    state.session?.workingDir
  ]);

  const revealPathInWorkbench = useCallback(async (filePath: string): Promise<void> => {
    const target = parseWorkbenchPathTarget(filePath, state.session?.workingDir);
    if (target === null) return;
    if (await routeProjectPathIfBound(target, "reveal")) {
      return;
    }
    await onRevealPathInWorkbench?.(target.path);
  }, [
    onRevealPathInWorkbench,
    routeProjectPathIfBound,
    state.session?.workingDir
  ]);

  const openInFileManager = useCallback(async (path: string): Promise<void> => {
    const trimmed = path.trim();
    if (trimmed.length === 0) return;
    await onRevealPathInWorkbench?.(trimmed);
  }, [onRevealPathInWorkbench]);

  const openTerminalLiveSession = useCallback(async (request: {
    readonly sessionId?: string | null;
    readonly terminalTabId?: string | null;
    readonly paneId?: string | null;
  }): Promise<void> => {
    await onOpenTerminalLiveSession?.(request);
  }, [onOpenTerminalLiveSession]);

  const canOpenImageInWorkbench = useCallback((image: AgentImageAttachment): boolean => {
    if (localPathFromImageSource(image.source) !== null) {
      return onOpenFile !== undefined;
    }
    if (imageUrlSource(image.source) !== null) {
      return onOpenFile !== undefined && desktopApi?.agent?.materializeImageAttachment !== undefined;
    }
    return (
      onOpenFile !== undefined &&
      desktopApi?.agent?.materializeImageAttachment !== undefined &&
      hasMaterializableImageData(image)
    );
  }, [desktopApi, onOpenFile]);

  const resolveImageFilePath = useCallback(async (image: AgentImageAttachment): Promise<string | null> => {
    const localPath = localPathFromImageSource(image.source);
    if (localPath !== null) {
      const target = parseWorkbenchPathTarget(localPath, state.session?.workingDir);
      return target?.path ?? localPath;
    }

    const sourceUrl = imageUrlSource(image.source);
    if (sourceUrl !== null) {
      const cacheKey = `url:${sourceUrl}`;
      const cachedPath = materializedImagePathsRef.current.get(cacheKey);
      if (cachedPath !== undefined) {
        return cachedPath;
      }
      const materializeImageAttachment = desktopApi?.agent?.materializeImageAttachment;
      if (materializeImageAttachment === undefined) {
        return null;
      }
      const fetched = await fetchRemoteImageData(sourceUrl);
      if (fetched === null) {
        return null;
      }
      const result = await materializeImageAttachment({
        id: image.id,
        mediaType: fetched.mediaType,
        data: fetched.data,
        label: image.label ?? null
      });
      materializedImagePathsRef.current.set(cacheKey, result.path);
      return result.path;
    }

    if (!hasMaterializableImageData(image)) {
      return null;
    }

    const cacheKey = `${image.id}:${image.mediaType}:${(image.data ?? "").length}:${image.label ?? ""}`;
    const cachedPath = materializedImagePathsRef.current.get(cacheKey);
    if (cachedPath !== undefined) {
      return cachedPath;
    }

    const materializeImageAttachment = desktopApi?.agent?.materializeImageAttachment;
    if (materializeImageAttachment === undefined) {
      return null;
    }

    const result = await materializeImageAttachment({
      id: image.id,
      mediaType: image.mediaType,
      data: image.data ?? "",
      label: image.label ?? null
    });
    materializedImagePathsRef.current.set(cacheKey, result.path);
    return result.path;
  }, [desktopApi, state.session?.workingDir]);

  const openImageInWorkbench = useCallback(async (
    image: AgentImageAttachment,
    options?: { readonly group?: readonly AgentImageAttachment[]; readonly index?: number }
  ): Promise<void> => {
    const group = options?.group !== undefined && options.group.length > 0
      ? options.group
      : [image];
    const paths: string[] = [];
    let focusPath: string | null = null;
    for (const item of group) {
      const path = await resolveImageFilePath(item);
      if (path === null) {
        continue;
      }
      paths.push(path);
      if (item.id === image.id) {
        focusPath = path;
      }
    }
    if (focusPath === null) {
      focusPath = await resolveImageFilePath(image);
    }
    if (focusPath === null) {
      return;
    }
    if (paths.length > 1) {
      await openFileInWorkbench(focusPath, { siblingPaths: paths });
      return;
    }
    await openFileInWorkbench(focusPath);
  }, [openFileInWorkbench, resolveImageFilePath]);

  const revealSensitiveValueToUser = useCallback(async (
    ref: LyraSensitiveValueRef
  ): Promise<string> => {
    if (desktopApi?.sensitiveValues !== undefined) {
      return (await desktopApi.sensitiveValues.revealToUser({
        ref,
        reason: "user-ai-panel"
      })).value;
    }
    if (
      ref.owner === "login-manager"
      && ref.ownerRef.kind === "login-manager-credential"
      && desktopApi?.loginManager !== undefined
    ) {
      return (await desktopApi.loginManager.revealCredential({
        credentialId: ref.ownerRef.credentialId,
        reason: "user-ai-panel"
      })).password;
    }
    throw new Error("Sensitive value bridge is unavailable.");
  }, [desktopApi]);

  const updateReasoningEffort = useCallback(async (value: string): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    setModelBusy("switch");
    try {
      setModelState(await desktopApi.agent.updateAgentProviderOptions({
        sessionId: currentSessionId,
        reasoningEffort: value
      }));
    } finally {
      setModelBusy(null);
    }
  }, [currentSessionId, desktopApi]);

  const updateServiceTier = useCallback(async (value: string): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    setModelBusy("switch");
    try {
      setModelState(await desktopApi.agent.updateAgentProviderOptions({
        sessionId: currentSessionId,
        serviceTier: value
      }));
    } finally {
      setModelBusy(null);
    }
  }, [currentSessionId, desktopApi]);

  const updateVerbosity = useCallback(async (value: string): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    setModelBusy("switch");
    try {
      setModelState(await desktopApi.agent.updateAgentProviderOptions({
        sessionId: currentSessionId,
        verbosity: value
      }));
    } finally {
      setModelBusy(null);
    }
  }, [currentSessionId, desktopApi]);

  const pokeTodos = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined) return;
    await desktopApi.agent.triggerPoke({ sessionId: currentSessionId });
  }, [currentSessionId, desktopApi]);

  const submitSessionRename = useCallback(async (title: string | null): Promise<void> => {
    if (desktopApi?.agent === undefined || currentSessionId === null) return;
    await desktopApi.agent.renameSession({ sessionId: currentSessionId, title });
    const snapshot = await desktopApi.agent.readSession({ sessionId: currentSessionId });
    dispatch({ type: "snapshot", snapshot });
    onSessionSnapshotChange?.(snapshot);
  }, [currentSessionId, desktopApi, onSessionSnapshotChange]);

  const renameSession = useCallback((): void => {
    if (openDialog === undefined || currentSessionId === null) return;
    const sessionTitle = state.session?.title ?? "Lyra Agent";
    openDialog({
      title: t("header.renameTitle"),
      source: {
        title: "Lyra Agent",
        subtitle: sessionTitle,
        iconLabel: "LA",
        iconTone: "accent"
      },
      input: {
        id: `rename-${currentSessionId}`,
        label: t("header.renamePlaceholder"),
        value: sessionTitle,
        placeholder: t("header.renamePlaceholder"),
        submitActionId: "save"
      },
      actions: [
        {
          id: "clear",
          label: t("header.clearRename"),
          onSelect: () => {
            void submitSessionRename(null);
          }
        },
        {
          id: "cancel",
          label: t("header.cancelAction")
        },
        {
          id: "save",
          label: t("header.saveRename"),
          tone: "primary",
          onSelect: ({ inputValue }) => {
            const nextTitle = inputValue?.trim() ?? "";
            void submitSessionRename(nextTitle.length === 0 ? null : nextTitle);
          }
        }
      ]
    });
  }, [currentSessionId, openDialog, state.session?.title, submitSessionRename]);

  const archiveSession = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined || currentSessionId === null) return;
    await desktopApi.agent.archiveSession({
      sessionId: currentSessionId,
      archived: true
    });
    onMissingSession?.(currentSessionId);
  }, [currentSessionId, desktopApi, onMissingSession]);

  const confirmDeleteSession = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined || currentSessionId === null) return;
    await desktopApi.agent.deleteSession({ sessionId: currentSessionId });
    onMissingSession?.(currentSessionId);
  }, [currentSessionId, desktopApi, onMissingSession]);

  const deleteSession = useCallback((): void => {
    if (openDialog === undefined || currentSessionId === null) return;
    const sessionTitle = state.session?.title ?? "Lyra Agent";
    openDialog({
      title: t("header.deleteConfirmTitle"),
      description: t("header.deleteConfirmDescription"),
      source: {
        title: "Lyra Agent",
        subtitle: sessionTitle,
        iconLabel: "LA",
        iconTone: "danger"
      },
      actions: [
        {
          id: "cancel",
          label: t("header.cancelAction")
        },
        {
          id: "delete",
          label: t("header.deleteConfirmAction"),
          tone: "danger",
          onSelect: () => {
            void confirmDeleteSession();
          }
        }
      ]
    });
  }, [confirmDeleteSession, currentSessionId, openDialog, state.session?.title]);

  const {
    modelControls,
    permissionModeControls,
    loadEarlierMessages
  } = useAgentComposerControls({
    desktopApi,
    modelState,
    modelBusy,
    permissionPolicy,
    permissionPolicyBusy,
    switchModel,
    refreshModels,
    openModelSettings,
    updateReasoningEffort,
    updateVerbosity,
    updateServiceTier,
    switchPermissionMode
  });

  const openSubagent = useCallback((subagentId: string, title?: string): void => {
    const parentSessionId = state.session?.id?.trim() ?? "";
    const id = subagentId.trim();
    if (parentSessionId.length === 0 || id.length === 0 || onOpenSubagent === undefined) {
      return;
    }
    const label = title?.trim() ?? "";
    onOpenSubagent({
      parentSessionId,
      subagentId: id,
      ...(label.length > 0 ? { title: label } : {})
    });
  }, [onOpenSubagent, state.session?.id]);

  const data = useMemo(() => {
    const messageSession = state.session;
    const totalMessageCount = messageSession?.messages.length ?? 0;
    const chatMessages = agentSessionToChatMessages(messageSession);
    const turnRunning = state.session?.follow.running ?? state.loading;
    const lastChatMessage = chatMessages.at(-1);
    // While a turn is running but the agent has not yet emitted its own message
    // (the "connecting" window before the first token), append an empty pending
    // agent placeholder so the activity indicator renders directly below the
    // latest user message. Without it the indicator either vanishes (the very
    // first message of a session) or attaches to the previous agent message
    // above the user's new message (subsequent messages).
    const messages: ChatMessage[] =
      turnRunning &&
      (lastChatMessage === undefined || lastChatMessage.author === "user")
        ? [
            ...chatMessages,
            {
              id: "lyra-agent-connecting",
              author: "agent",
              blocks: [
                {
                  type: "text",
                  id: "lyra-agent-connecting-text",
                  body: ""
                }
              ]
            }
          ]
        : chatMessages;
    const input: CreateDataProviderValueInput = {
      session: agentSessionMetaWithDraftWorkingDir(agentSessionToSessionMeta(state.session), state.session === null ? activeDraftWorkingDir : null),
      messages,
      messageWindow: {
        visibleCount: totalMessageCount,
        hiddenBefore: 0,
        totalCount: totalMessageCount,
        canLoadEarlier: false
      },
      todos: agentSessionToTodos(state.session),
      projectTodo: state.session?.projectTodo ?? null,
      diffFiles: [] satisfies DiffFileEntry[],
      decisions: pendingClarifications.slice(0, 1),
      permissions: pendingPermissions,
      planReview: pendingPlanReview ?? (
        state.session?.plan?.phase === "reviewing" ? state.session.plan : null
      ),
      modelControls,
      permissionModeControls,
      openSubagent,
      openModelSettings,
      aiRichRenderingEnabled,
      setActiveBrowserTab: (tabId) => onSetActiveBrowserTab?.(tabId) === true,
      openUrlInWorkbench,
      openFileInWorkbench,
      revealPathInWorkbench,
      openInFileManager,
      openPlanReview,
      openProjectTodo,
      openProjectPlanManager,
      openProjectGit,
      respondPlanReview,
      openTerminalLiveSession,
      openImageInWorkbench,
      canOpenImageInWorkbench,
      revealSensitiveValueToUser,
      sendMessage,
      addCitationToComposer,
      addPageCitationToComposer,
      attachDragPayloadToComposer,
      pendingCitation,
      pendingCitationNonce,
      pendingImages,
      pendingImagesNonce,
      pendingFiles,
      pendingFilesNonce,
      navigateToPageCitation,
      scrollToMessage,
      citationScrollTarget,
      reportCitationScrollFinished,
      citationHighlightMessageId,
      loadEarlierMessages,
      captureWorkspaceScreenshot,
      captureWindowScreenshot,
      pickFileFromFileManager,
      workspaceTabs: workspaceTabsForComposer,
      terminalTabs: terminalTabsForComposer,
      ...(getTerminalTabPanes === undefined ? {} : { getTerminalTabPanes }),
      ...(onCloseTerminalTab === undefined ? {} : { closeTerminalTab: onCloseTerminalTab }),
      ...(onFocusTerminalTabInDock === undefined ? {} : { focusTerminalTabInDock: onFocusTerminalTabInDock }),
      cancelTurn: cancel,
      previewRollback,
      rollbackMessage,
      createSession,
      bindProject,
      openProjectTree,
      pokeTodos,
      renameSession,
      archiveSession,
      deleteSession,
      submitDecisions,
      approvePermission,
      denyPermission,
      isMock: false,
      isTurnRunning: turnRunning,
      followActivity:
        state.session?.follow.activity ??
        (state.loading ? AGENT_FOLLOW_ACTIVITY_CONNECTING : null)
    };
    return createDataProviderValue(input);
  }, [
    approvePermission,
    bindProject,
    cancel,
    captureWorkspaceScreenshot,
    captureWindowScreenshot,
    pickFileFromFileManager,
    workspaceTabsForComposer,
    terminalTabsForComposer,
    getTerminalTabPanes,
    onCloseTerminalTab,
    onFocusTerminalTabInDock,
    createSession,
    desktopApi,
    denyPermission,
    onSetActiveBrowserTab,
    openModelSettings,
    openUrlInWorkbench,
    openFileInWorkbench,
    openPlanReview,
    openProjectTodo,
    openProjectPlanManager,
    openProjectGit,
    revealPathInWorkbench,
    openInFileManager,
    respondPlanReview,
    openTerminalLiveSession,
    openImageInWorkbench,
    canOpenImageInWorkbench,
    revealSensitiveValueToUser,
    openProjectTree,
    addCitationToComposer,
    addPageCitationToComposer,
    attachDragPayloadToComposer,
    pendingCitation,
    pendingCitationNonce,
    pendingImages,
    pendingImagesNonce,
    pendingFiles,
    pendingFilesNonce,
    navigateToPageCitation,
    scrollToMessage,
    citationScrollTarget,
    reportCitationScrollFinished,
    citationHighlightMessageId,
    loadEarlierMessages,
    modelControls,
    permissionModeControls,
    aiRichRenderingEnabled,
    pendingClarifications,
    pendingPermissions,
    pendingPlanReview,
    previewRollback,
    rollbackMessage,
    sendMessage,
    openSubagent,
    activeDraftWorkingDir,
    state.session,
    state.loading,
    renameSession,
    archiveSession,
    deleteSession,
    pokeTodos,
    submitDecisions,
    onOpenFile,
    locale
  ]);

  return {
    data,
    followRunning: state.session?.follow.running ?? state.loading,
    followActivity:
      state.session?.follow.activity ??
      (state.loading ? AGENT_FOLLOW_ACTIVITY_CONNECTING : null),
    error: state.error,
    cancel
  };
};
