import { act, renderHook, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";

import type {
  AgentModelCatalogSnapshot,
  AgentRuntimeEvent,
  AgentSessionSnapshot
} from "../../../../shared/agent";
import type { LyraDesktopApi } from "../../../../shared/desktop-bridge";
import { getLocale, setLocale, type Locale } from "../../i18n";
import type { GlobalDialogOpenRequest } from "../../global-dialog";
import { getStreamStore } from "../../agent-session-view-model/stream-store";
import { useLyraAgentDataProvider } from "../use-lyra-agent-data-provider";

const emptyModelCatalog = (): AgentModelCatalogSnapshot => ({
  sessionId: null,
  currentModel: "mimo-v2.5-pro",
  currentProvider: "mimo",
  defaultModel: "mimo-v2.5-pro",
  defaultProvider: "mimo",
  models: [],
  routes: [],
  reasoningEffort: {
    current: null,
    options: [],
    supported: false
  },
  verbosity: {
    current: null,
    options: [],
    supported: false
  },
  serviceTier: {
    current: null,
    options: [],
    supported: false
  }
});

const createSnapshot = (
  overrides: Partial<AgentSessionSnapshot> = {}
): AgentSessionSnapshot => ({
  id: "session-1",
  title: "新会话",
  sessionKind: "normal",
  workingDir: "/Users/petehsu/Documents/Lyra",
  projectBound: true,
  workingDirIsHome: false,
  messages: [],
  tools: [],
  todos: [],
  turnStatus: "idle",
  activeTurnId: null,
  follow: { running: false, activity: null },
  updatedAt: "2026-05-13T00:00:00.000Z",
  ...overrides
});

const createDesktopApi = (snapshot: AgentSessionSnapshot): LyraDesktopApi => ({
  agent: {
    onEvent: vi.fn((_: (event: AgentRuntimeEvent) => void) => () => undefined),
    createSession: vi.fn(async () => snapshot),
    readSession: vi.fn(async () => snapshot),
    listSessions: vi.fn(async () => ({
      sessionsDir: "/tmp/lyra-agent-runtime/sessions",
      sessions: [{ id: snapshot.id }]
    })),
    listAgentModels: vi.fn(async () => emptyModelCatalog()),
    readBrowserFollowMode: vi.fn(async () => ({ enabled: false })),
    updateBrowserFollowMode: vi.fn(async () => ({ enabled: false })),
    readActCache: vi.fn(async () => ({ enabled: false })),
    updateActCache: vi.fn(async () => ({ enabled: false }))
  }
} as unknown as LyraDesktopApi);

describe("useLyraAgentDataProvider", () => {
  let originalLocale: Locale;

  beforeAll(() => {
    originalLocale = getLocale();
    setLocale("en-US");
  });

  afterAll(() => {
    setLocale(originalLocale);
  });

  test("shorter final commits win and a failed turn retains all deltas without a refetch", async () => {
    const snapshot = createSnapshot({ turnStatus: "running", activeTurnId: "turn", follow: { running: true, activity: "streaming_model" } });
    let listener: ((event: AgentRuntimeEvent) => void) | undefined;
    const api = createDesktopApi(snapshot);
    vi.mocked(api.agent!.onEvent).mockImplementation((next) => { listener = next; return () => {}; });
    const { result } = renderHook(() => useLyraAgentDataProvider(api, undefined, snapshot.id));
    await waitFor(() => expect(api.agent!.onEvent).toHaveBeenCalled());
    await waitFor(() => expect(api.agent!.readSession).toHaveBeenCalled());
    vi.mocked(api.agent!.readSession).mockRejectedValue(new Error("offline"));
    act(() => {
      listener?.({ kind: "messageDelta", sessionId: snapshot.id, messageId: "partial-regression", blockId: "text-0", delta: "first " });
      listener?.({ kind: "messageDelta", sessionId: snapshot.id, messageId: "partial-regression", blockId: "text-0", delta: "second " });
      listener?.({ kind: "messageDelta", sessionId: snapshot.id, messageId: "partial-regression", blockId: "text-0", delta: "third" });
      listener?.({ kind: "turnFailed", sessionId: snapshot.id, turnId: "turn", message: "offline" });
    });
    await waitFor(() => expect(result.current.data.messages.at(-1)?.blocks[0]).toMatchObject({ type: "text", body: "first second third" }));
    act(() => {
      listener?.({ kind: "messageDelta", sessionId: snapshot.id, messageId: "final-regression", blockId: "text-0", delta: "old long unfiltered text" });
      listener?.({ kind: "messageCommitted", sessionId: snapshot.id, message: {
        id: "final-regression", role: "assistant", createdAt: "now", text: "final",
        blocks: [{ id: "text-0", type: "text", text: "final" }]
      } });
    });
    await waitFor(() => expect(result.current.data.messages.at(-1)?.blocks[0]).toMatchObject({ type: "text", body: "final" }));
    expect(getStreamStore().getBlockText("final-regression", "text-0")).toBe("final");
  });

  test("does not resync shell session metadata for streaming text deltas", async () => {
    // Reset the global streamStore to ensure test isolation (it's a singleton).
    getStreamStore().reset("message-1");
    const snapshot = createSnapshot({
      turnStatus: "running",
      activeTurnId: "turn-1",
      follow: { running: true, activity: "calling_model" },
      messages: [{
        id: "message-1",
        role: "assistant",
        text: "Hel",
        createdAt: "2026-05-13T00:00:00.000Z"
      }]
    });
    let listener: ((event: AgentRuntimeEvent) => void) | null = null;
    const desktopApi = createDesktopApi(snapshot);
    vi.mocked(desktopApi.agent!.onEvent).mockImplementation((next) => {
      listener = next;
      return () => {
        listener = null;
      };
    });
    const onActiveSessionChange = vi.fn();
    const onSessionSnapshotChange = vi.fn();

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        snapshot.id,
        null,
        true,
        { onActiveSessionChange, onSessionSnapshotChange }
      )
    );

    await waitFor(() => {
      expect(result.current.data.messages.at(-1)?.blocks[0]).toMatchObject({
        type: "text",
        body: "Hel"
      });
      expect(onActiveSessionChange).toHaveBeenCalledTimes(1);
      expect(onSessionSnapshotChange).toHaveBeenCalledTimes(1);
    });

    act(() => {
      listener?.({
        kind: "messageDelta",
        sessionId: snapshot.id,
        messageId: "message-1",
        blockId: null,
        delta: "lo"
      });
    });

    // Deltas now go to the external StreamStore (O(1) push, RAF commit),
    // not through the React reducer. The reducer's message text is not
    // updated per-delta — it updates on messageCommitted. The streamStore
    // holds the accumulated text for the streaming view.
    await waitFor(() => {
      expect(onActiveSessionChange).toHaveBeenCalledTimes(1);
      expect(onSessionSnapshotChange).toHaveBeenCalledTimes(1);
    });
    // The streamStore should have accumulated the delta.
    const store = getStreamStore();
    store.flush();
    expect(store.getMessageText("message-1")).toBe("lo");
  });

  test("reports a missing persisted session when readSession rejects", async () => {
    const onMissingSession = vi.fn();
    const readSession = vi.fn<
      (request: { readonly sessionId: string }) => Promise<AgentSessionSnapshot>
    >(async () => {
      throw new Error("session not found");
    });
    const desktopApi = {
      agent: {
        onEvent: vi.fn((_: (event: AgentRuntimeEvent) => void) => () => undefined),
        createSession: vi.fn(),
        readSession,
        listSessions: vi.fn(async () => ({
          sessionsDir: "/tmp/lyra-agent-runtime/sessions",
          sessions: []
        })),
        listAgentModels: vi.fn(async () => emptyModelCatalog()),
        readBrowserFollowMode: vi.fn(async () => ({ enabled: false })),
        updateBrowserFollowMode: vi.fn(async () => ({ enabled: false })),
        readActCache: vi.fn(async () => ({ enabled: false })),
        updateActCache: vi.fn(async () => ({ enabled: false }))
      }
    } as unknown as LyraDesktopApi;

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        "session-stale",
        null,
        true,
        { onMissingSession }
      )
    );

    await waitFor(() => {
      expect(onMissingSession).toHaveBeenCalledWith("session-stale");
    });

    expect(readSession).toHaveBeenCalledWith({ sessionId: "session-stale" });
    expect(result.current.error).toBeNull();
  });

  test("routes bound project file opens through the project tree", async () => {
    const onOpenFile = vi.fn();
    const onRevealProjectPath = vi.fn();
    const desktopApi = createDesktopApi(createSnapshot());

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        "session-1",
        null,
        true,
        { onOpenFile, onRevealProjectPath }
      )
    );

    await waitFor(() => {
      expect(result.current.data.session.id).toBe("session-1");
    });

    await act(async () => {
      await result.current.data.openFileInWorkbench("src/App.tsx:42");
    });

    expect(onRevealProjectPath).toHaveBeenCalledWith({
      sessionId: "session-1",
      workingDir: "/Users/petehsu/Documents/Lyra",
      path: "/Users/petehsu/Documents/Lyra/src/App.tsx",
      location: { line: 42 },
      mode: "open-file"
    });
    expect(onOpenFile).not.toHaveBeenCalled();
  });

  test("routes bound project path reveals through the project tree", async () => {
    const onRevealPathInWorkbench = vi.fn();
    const onRevealProjectPath = vi.fn();
    const desktopApi = createDesktopApi(createSnapshot());

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        "session-1",
        null,
        true,
        { onRevealPathInWorkbench, onRevealProjectPath }
      )
    );

    await waitFor(() => {
      expect(result.current.data.session.id).toBe("session-1");
    });

    await act(async () => {
      await result.current.data.revealPathInWorkbench("src/components");
    });

    expect(onRevealProjectPath).toHaveBeenCalledWith({
      sessionId: "session-1",
      workingDir: "/Users/petehsu/Documents/Lyra",
      path: "/Users/petehsu/Documents/Lyra/src/components",
      mode: "reveal"
    });
    expect(onRevealPathInWorkbench).not.toHaveBeenCalled();
  });

  test("reveals unbound paths in the file manager", async () => {
    const onRevealPathInWorkbench = vi.fn();
    const onRevealProjectPath = vi.fn();
    const desktopApi = createDesktopApi(createSnapshot({
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: false
    }));

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        "session-1",
        null,
        true,
        { onRevealPathInWorkbench, onRevealProjectPath }
      )
    );

    await waitFor(() => {
      expect(result.current.data.session.id).toBe("session-1");
    });

    await act(async () => {
      await result.current.data.revealPathInWorkbench("src/components");
    });

    expect(onRevealPathInWorkbench).toHaveBeenCalledWith(
      "/Users/petehsu/Documents/Lyra/src/components"
    );
    expect(onRevealProjectPath).not.toHaveBeenCalled();
  });

  test("creates a new session without a mode switch", async () => {
    const snapshot = createSnapshot();
    const desktopApi = createDesktopApi(snapshot);
    const openDialog = vi.fn<(request: GlobalDialogOpenRequest) => void>();

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        snapshot.id,
        null,
        true,
        { openDialog }
      )
    );

    await waitFor(() => {
      expect(result.current.data.session.id).toBe(snapshot.id);
    });

    await act(async () => {
      await result.current.data.createSession();
    });

    expect(openDialog).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(vi.mocked(desktopApi.agent!.createSession)).toHaveBeenCalledWith({
        title: "New session"
      });
    });
  });

  test("opens a subagent inspector from the current session", async () => {
    const onOpenSubagent = vi.fn();
    const desktopApi = createDesktopApi(createSnapshot());

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        "session-1",
        null,
        true,
        { onOpenSubagent }
      )
    );

    await waitFor(() => {
      expect(result.current.data.session.id).toBe("session-1");
    });

    act(() => {
      result.current.data.openSubagent("worker-9");
    });

    expect(onOpenSubagent).toHaveBeenCalledWith({
      parentSessionId: "session-1",
      subagentId: "worker-9"
    });
  });

  test("forwards a worker title into the inspector opener", async () => {
    const onOpenSubagent = vi.fn();
    const desktopApi = createDesktopApi(createSnapshot());

    const { result } = renderHook(() =>
      useLyraAgentDataProvider(
        desktopApi,
        undefined,
        "session-1",
        null,
        true,
        { onOpenSubagent }
      )
    );

    await waitFor(() => {
      expect(result.current.data.session.id).toBe("session-1");
    });

    act(() => {
      result.current.data.openSubagent("worker-9", "Explore docs");
    });

    expect(onOpenSubagent).toHaveBeenCalledWith({
      parentSessionId: "session-1",
      subagentId: "worker-9",
      title: "Explore docs"
    });
  });

  test("keeps a single runtime event subscription across session switches", async () => {
    const first = createSnapshot({ id: "session-1", title: "One" });
    const second = createSnapshot({ id: "session-2", title: "Two" });
    const desktopApi = createDesktopApi(first);
    vi.mocked(desktopApi.agent!.readSession).mockImplementation(async (request) => {
      const sessionId = request?.sessionId ?? "";
      return sessionId === second.id ? second : first;
    });

    const { rerender } = renderHook(
      ({ sessionId }) => useLyraAgentDataProvider(
        desktopApi,
        undefined,
        sessionId,
        null,
        true
      ),
      { initialProps: { sessionId: first.id } }
    );

    await waitFor(() => {
      expect(desktopApi.agent?.readSession).toHaveBeenCalledWith({ sessionId: first.id });
    });
    const subscriptionCount = vi.mocked(desktopApi.agent!.onEvent).mock.calls.length;
    expect(subscriptionCount).toBeGreaterThan(0);

    rerender({ sessionId: second.id });

    await waitFor(() => {
      expect(desktopApi.agent?.readSession).toHaveBeenCalledWith({ sessionId: second.id });
    });
    expect(desktopApi.agent?.onEvent).toHaveBeenCalledTimes(subscriptionCount);
  });

  test("coalesces a rapid session-close burst into one snapshot load", async () => {
    const first = createSnapshot({ id: "session-1", title: "One" });
    const last = createSnapshot({ id: "session-4", title: "Four" });
    const desktopApi = createDesktopApi(first);
    vi.mocked(desktopApi.agent!.readSession).mockImplementation(async (request) => {
      const sessionId = request?.sessionId ?? "";
      if (sessionId === last.id) return last;
      return createSnapshot({ id: sessionId, title: sessionId });
    });

    const { rerender } = renderHook(
      ({ sessionId }) => useLyraAgentDataProvider(
        desktopApi,
        undefined,
        sessionId,
        null,
        true
      ),
      { initialProps: { sessionId: first.id } }
    );

    await waitFor(() => {
      expect(desktopApi.agent?.readSession).toHaveBeenCalledWith({ sessionId: first.id });
    });
    const catalogCallsAfterMount = vi.mocked(desktopApi.agent!.listAgentModels).mock.calls.length;

    act(() => {
      rerender({ sessionId: "session-2" });
      rerender({ sessionId: "session-3" });
      rerender({ sessionId: last.id });
    });

    expect(desktopApi.agent?.readSession).not.toHaveBeenCalledWith({ sessionId: "session-2" });
    expect(desktopApi.agent?.readSession).not.toHaveBeenCalledWith({ sessionId: "session-3" });

    await waitFor(() => {
      expect(desktopApi.agent?.readSession).toHaveBeenCalledWith({ sessionId: last.id });
    });
    expect(desktopApi.agent?.readSession).not.toHaveBeenCalledWith({ sessionId: "session-2" });
    expect(desktopApi.agent?.readSession).not.toHaveBeenCalledWith({ sessionId: "session-3" });
    expect(vi.mocked(desktopApi.agent!.listAgentModels).mock.calls.length).toBe(catalogCallsAfterMount);
  });

  test("keeps the model catalog when switching to a deferred draft session", async () => {
    const snapshot = createSnapshot();
    const desktopApi = createDesktopApi(snapshot);
    const { result, rerender } = renderHook(
      ({ sessionId }) => useLyraAgentDataProvider(
        desktopApi,
        undefined,
        sessionId,
        null,
        true
      ),
      { initialProps: { sessionId: snapshot.id as string | null } }
    );

    await waitFor(() => {
      expect(result.current.data.modelControls).not.toBeNull();
    });
    const catalogCallsAfterMount = vi.mocked(desktopApi.agent!.listAgentModels).mock.calls.length;

    rerender({ sessionId: null });

    expect(result.current.data.modelControls).not.toBeNull();
    expect(result.current.data.permissionModeControls).not.toBeNull();
    expect(vi.mocked(desktopApi.agent!.listAgentModels).mock.calls.length).toBe(catalogCallsAfterMount);
  });
});
