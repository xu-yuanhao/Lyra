import { beforeEach, describe, expect, test, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => unknown;
  const handlers = new Map<string, Handler>();
  return {
    handlers,
    ipcMain: {
      handle: vi.fn((channel: string, handler: Handler) => {
        handlers.set(channel, handler);
      }),
      removeHandler: vi.fn((channel: string) => {
        handlers.delete(channel);
      })
    }
  };
});

vi.mock("electron", () => ({
  ipcMain: electronMock.ipcMain
}));

import { LYRA_CHANNELS } from "../../../shared/desktop-bridge";
import type { LyraRuntimeClient } from "../../runtime-client";
import type { WorkbenchObservationService } from "../../workbench-observation/types";
import { createAgentIpcBridge } from "../service";
import { createWorkbenchStateMock } from "./workbench-state-mock";
import {
  TERMINAL_AGENT_TOOL_NAMES,
  mapTerminalAgentTool,
  terminalPermissionRisk
} from "../terminal-tools";

const terminalToolNames = [
  "terminal_list",
  "terminal_read",
  "terminal_write"
] as const;

const createRuntimeClient = (registered: Map<string, (payload: unknown) => unknown>) => ({
  request: vi.fn(),
  subscribe: vi.fn(() => vi.fn()),
  registerRequestHandler: vi.fn((method: string, handler: (payload: unknown) => unknown) => {
    registered.set(method, handler);
  }),
  unregisterRequestHandler: vi.fn()
}) as unknown as LyraRuntimeClient;

const createTerminalBridgeMock = (overrides: Record<string, unknown> = {}) => ({
  loadResult: { loadedFrom: "test" },
  createSession: vi.fn(async (request: { readonly sessionId?: string }) => ({
    sessionId: request.sessionId ?? "private-terminal-1",
    title: "Agent Terminal",
    shell: "/bin/zsh",
    cols: 80,
    rows: 24,
    createdAt: "1000",
    source: "agent",
    mode: "shell",
    persist: false,
    running: true,
    exitCode: null
  })),
  reloadPrompt: vi.fn(),
  write: vi.fn(),
  readObservation: vi.fn(async (request: { readonly sessionId: string }) => ({
    sessionId: request.sessionId,
    cursor: "12",
    output: "ready",
    running: true,
    exitCode: null,
    truncated: false,
    source: "agent",
    mode: "shell"
  })),
  evaluatePermission: vi.fn(),
  respondPermission: vi.fn(),
  readProcesses: vi.fn(async (request: { readonly sessionId: string }) => ({
    sessionId: request.sessionId,
    pid: 42,
    foregroundPid: 42,
    running: true,
    exitCode: null,
    signal: null,
    processes: [{ pid: 42, foreground: true, running: true, name: "zsh" }]
  })),
  signalProcess: vi.fn(async (request: { readonly sessionId: string; readonly signal: string }) => ({
    sessionId: request.sessionId,
    pid: 42,
    signal: request.signal,
    status: "sent",
    inputId: "input-signal"
  })),
  resize: vi.fn(),
  closeSession: vi.fn(),
  dispose: vi.fn(),
  ...overrides
});

describe("terminal agent tools", () => {
  beforeEach(() => {
    electronMock.handlers.clear();
    electronMock.ipcMain.handle.mockClear();
    electronMock.ipcMain.removeHandler.mockClear();
  });

  test("mapping covers every terminal model tool", () => {
    expect(TERMINAL_AGENT_TOOL_NAMES).toEqual([...terminalToolNames]);

    for (const name of terminalToolNames) {
      const mapped = mapTerminalAgentTool(name, {
        sessionId: "terminal-1",
        runtimeCancellation: {
          sessionId: "agent-1",
          turnId: "turn-1",
          toolCallId: "tool-1"
        }
      });
      expect(mapped).not.toBeNull();
      expect(mapped?.displayName).toBe("terminal");
      expect(mapped?.payload.action).toBe(mapped?.action);
      expect(mapped?.payload.runtimeCancellation).toEqual({
        sessionId: "agent-1",
        turnId: "turn-1",
        toolCallId: "tool-1"
      });
    }
  });

  test("permission classifier separates read-only and mutating actions", () => {
    for (const action of ["list", "read"]) {
      expect(terminalPermissionRisk(action, {})).toBe("none");
    }

    expect(terminalPermissionRisk("write", { command: "npm test" })).toBe("shell");
    expect(terminalPermissionRisk("unknown", {})).toBe("dangerous");
  });

  test("empty terminal writes poll output without sending a key or starting a command",async()=>{
    const registered=new Map<string,(payload:unknown)=>unknown>();
    const terminalBridge=createTerminalBridgeMock();
    const bridge=createAgentIpcBridge({runtimeClient:createRuntimeClient(registered),storageRoot:"/tmp/lyra-agent-test",
      terminalBridge:terminalBridge as never,getWindow:()=>null,getBrowserBridge:()=>null,
      getWorkbenchObservationService:()=>({openTerminalPane:vi.fn()}) as never,workbenchState:createWorkbenchStateMock()});
    await registered.get("terminal.write")?.({data:"",runtimeCancellation:{sessionId:"poll-task",turnId:"poll-turn"}});
    expect(terminalBridge.write).not.toHaveBeenCalled();expect(terminalBridge.readObservation).toHaveBeenCalled();
    bridge.dispose();
  });

  test("an invented ID reports only this task's terminal and never writes elsewhere",async()=>{
    const registered=new Map<string,(payload:unknown)=>unknown>();
    const terminalBridge=createTerminalBridgeMock();
    const bridge=createAgentIpcBridge({runtimeClient:createRuntimeClient(registered),storageRoot:"/tmp/lyra-agent-test",
      terminalBridge:terminalBridge as never,getWindow:()=>null,getBrowserBridge:()=>null,
      getWorkbenchObservationService:()=>({openTerminalPane:vi.fn()}) as never,workbenchState:createWorkbenchStateMock()});
    await registered.get("terminal.write")?.({data:"",runtimeCancellation:{sessionId:"own-task",turnId:"turn"}});
    terminalBridge.write.mockClear();
    await expect(registered.get("terminal.write")?.({data:"must not run",sessionId:"__new__",runtimeCancellation:{sessionId:"own-task"}})).rejects.toThrow(/current terminal sessionId.*Omit sessionId/);
    await expect(registered.get("terminal.write")?.({data:"must not run",sessionId:"__new__",runtimeCancellation:{sessionId:"foreign-task"}})).rejects.toThrow(/no private terminal yet/);
    expect(terminalBridge.write).not.toHaveBeenCalled();bridge.dispose();
  });

  test("host handlers route tools through one terminal target resolver", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const terminalBridge = createTerminalBridgeMock();
    const bridge = createAgentIpcBridge({
      runtimeClient: createRuntimeClient(registered),
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => ({ openTerminalPane: vi.fn() }) as never,
      workbenchState: createWorkbenchStateMock()
    });

    // terminal.write auto-creates a private session for the default auto target
    const writeResult = await registered.get("terminal.write")?.({
      data: "echo ok",
      appendNewline: true,
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-write" }
    }) as { readonly target?: { readonly sessionId?: string } };
    const privateSessionId = writeResult?.target?.sessionId ?? "private-terminal-1";

    await expect(registered.get("terminal.read")?.({
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-read" }
    })).resolves.toMatchObject({ sessionId: privateSessionId });

    expect(terminalBridge.write).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: privateSessionId
    }));

    bridge.dispose();
  });

  test("a foreground command that dies immediately surfaces its exit code in the output text", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const terminalBridge = createTerminalBridgeMock({
      readObservation: vi.fn(async (request: { readonly sessionId: string }) => ({
        sessionId: request.sessionId,
        cursor: "40",
        output: "Traceback (most recent call last): ...\nOSError: [Errno 98] Address already in use",
        running: false,
        exitCode: 1,
        truncated: false,
        source: "agent",
        mode: "shell"
      }))
    });
    const bridge = createAgentIpcBridge({
      runtimeClient: createRuntimeClient(registered),
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => ({ openTerminalPane: vi.fn() }) as never,
      workbenchState: createWorkbenchStateMock()
    });

    const result = await registered.get("terminal.write")?.({
      data: "python3 -m http.server 8765",
      appendNewline: true,
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-bind" }
    }) as { readonly output: string };

    expect(result.output).toContain("Address already in use");
    expect(result.output).toContain("[process exited with code 1]");

    bridge.dispose();
  });

  test("createNew starts a second private terminal instead of reusing", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const terminalBridge = createTerminalBridgeMock();
    const bridge = createAgentIpcBridge({
      runtimeClient: createRuntimeClient(registered),
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => ({ openTerminalPane: vi.fn() }) as never,
      workbenchState: createWorkbenchStateMock()
    });

    const first = await registered.get("terminal.write")?.({
      data: "echo first",
      appendNewline: true,
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-write-1" }
    }) as { readonly target?: { readonly sessionId?: string } };
    const second = await registered.get("terminal.write")?.({
      data: "npm run dev",
      appendNewline: true,
      createNew: true,
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-2", toolCallId: "tool-write-2" }
    }) as { readonly target?: { readonly sessionId?: string } };

    expect(first.target?.sessionId).toBeTruthy();
    expect(second.target?.sessionId).toBeTruthy();
    expect(second.target?.sessionId).not.toBe(first.target?.sessionId);
    expect(terminalBridge.createSession).toHaveBeenCalledTimes(2);

    bridge.dispose();
  });

  test("explicit private createNew starts a private terminal", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const terminalBridge = createTerminalBridgeMock();
    const bridge = createAgentIpcBridge({
      runtimeClient: createRuntimeClient(registered),
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => ({
        listTerminalPanes: vi.fn(async () => ({ active: null, panes: [] })),
        openTerminalPane: vi.fn()
      }) as never,
      workbenchState: createWorkbenchStateMock()
    });

    expect(
      electronMock.handlers.get(LYRA_CHANNELS.agentBrowserFollowUpdate)?.({}, { enabled: true })
    ).toEqual({ enabled: false });

    await expect(registered.get("terminal.write")?.({
      text: "python3 -m http.server 8888",
      appendNewline: true,
      target: "private",
      createNew: true,
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-write" }
    })).resolves.toMatchObject({
      target: {
        type: "private",
        sessionId: expect.stringContaining("agent-terminal-agent-1-")
      }
    });
    expect(terminalBridge.createSession).toHaveBeenCalledWith(expect.objectContaining({
      source: "agent",
      mode: "shell"
    }));

    bridge.dispose();
  });

  test("explicit ui target uses the visible Workbench terminal pane", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const terminalBridge = createTerminalBridgeMock();
    const terminalPane = {
      terminalTabId: "terminal-tab-1",
      paneId: "pane-1",
      sessionId: "ui-terminal-1",
      title: "UI Terminal",
      placement: "dock" as const
    };
    const observationService = {
      listTerminalPanes: vi.fn(async () => ({
        active: terminalPane,
        panes: [terminalPane]
      })),
      focusTerminalPane: vi.fn(async () => terminalPane)
    } as unknown as WorkbenchObservationService;
    const bridge = createAgentIpcBridge({
      runtimeClient: createRuntimeClient(registered),
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => observationService,
      workbenchState: createWorkbenchStateMock()
    });

    await expect(registered.get("terminal.read")?.({
      target: "ui",
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-read" }
    })).resolves.toMatchObject({
      target: {
        type: "ui",
        sessionId: "ui-terminal-1",
        terminalTabId: "terminal-tab-1",
        paneId: "pane-1"
      }
    });
    expect(observationService.listTerminalPanes).toHaveBeenCalledWith({});
    expect(observationService.focusTerminalPane).toHaveBeenCalledWith({
      terminalTabId: "terminal-tab-1",
      paneId: "pane-1"
    });
    expect(terminalBridge.readObservation).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "ui-terminal-1",
      maxBytes: 16_000,
      waitMs: 0
    }));

    bridge.dispose();
  });

  test("tail reads sample the current terminal output window", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const readObservation = vi.fn(async (request: {
      readonly sessionId: string;
      readonly cursor?: string;
    }) => ({
      sessionId: request.sessionId,
      cursor: request.cursor === String(Number.MAX_SAFE_INTEGER) ? "20000" : "20000",
      output: request.cursor === "3996" ? "latest output" : "",
      running: true,
      exitCode: null,
      truncated: false,
      source: "user",
      mode: "shell"
    }));
    const terminalBridge = createTerminalBridgeMock({ readObservation });
    const terminalPane = {
      terminalTabId: "terminal-tab-1",
      paneId: "pane-1",
      sessionId: "ui-terminal-1",
      title: "UI Terminal",
      placement: "dock" as const
    };
    const observationService = {
      listTerminalPanes: vi.fn(async () => ({
        active: terminalPane,
        panes: [terminalPane]
      })),
      focusTerminalPane: vi.fn(async () => terminalPane)
    } as unknown as WorkbenchObservationService;
    const bridge = createAgentIpcBridge({
      runtimeClient: createRuntimeClient(registered),
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => observationService,
      workbenchState: createWorkbenchStateMock()
    });

    await expect(registered.get("terminal.read")?.({
      target: "ui",
      terminalTabId: "terminal-tab-1",
      tailBytes: 16_000,
      runtimeCancellation: { sessionId: "agent-1" }
    })).resolves.toMatchObject({
      sessionId: "ui-terminal-1",
      output: "latest output"
    });
    expect(readObservation).toHaveBeenNthCalledWith(1, {
      sessionId: "ui-terminal-1",
      cursor: String(Number.MAX_SAFE_INTEGER),
      maxBytes: 1,
      waitMs: 0
    });
    expect(readObservation).toHaveBeenNthCalledWith(2, {
      sessionId: "ui-terminal-1",
      cursor: "3996",
      maxBytes: 16_004,
      waitMs: 0
    });

    bridge.dispose();
  });

  test("CLI follow keeps terminal tools private for inline CLI mirroring", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const runtimeClient = createRuntimeClient(registered);
    vi.mocked(runtimeClient.request).mockImplementation(async (method: string) => {
      if (method === "agent.cli.follow.read") {
        return {
          enabled: true,
          terminalSessionId: "cli-terminal-1",
          terminalTabId: "cli-tab-1",
          terminalPaneId: "cli-pane-1"
        };
      }
      return {};
    });
    const terminalBridge = createTerminalBridgeMock();
    const cliPane = {
      terminalTabId: "cli-tab-1",
      paneId: "cli-pane-1",
      sessionId: "cli-terminal-1",
      title: "Lyra",
      placement: "dock" as const
    };
    const observationService = {
      listTerminalPanes: vi.fn(async () => ({
        active: cliPane,
        panes: [cliPane]
      })),
      openTerminalPane: vi.fn(),
      focusTerminalPane: vi.fn()
    } as unknown as WorkbenchObservationService;
    const bridge = createAgentIpcBridge({
      runtimeClient,
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => observationService,
      workbenchState: createWorkbenchStateMock()
    });

    await expect(registered.get("terminal.write")?.({
      data: "npm test",
      appendNewline: true,
      runtimeCancellation: { sessionId: "agent-1", turnId: "turn-1", toolCallId: "tool-write" }
    })).resolves.toMatchObject({
      target: {
        type: "private",
        sessionId: expect.stringContaining("agent-terminal-agent-1-")
      }
    });
    expect(terminalBridge.createSession).toHaveBeenCalledWith(expect.objectContaining({
      source: "agent",
      mode: "shell"
    }));
    expect(terminalBridge.write).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: expect.stringContaining("agent-terminal-agent-1-"),
      data: "npm test",
      appendNewline: true,
      source: "agent"
    }));

    bridge.dispose();
  });

  test("write_stdin addresses an agent-owned workbench pane and refuses a user pane", async () => {
    const registered = new Map<string, (payload: unknown) => unknown>();
    const runtimeClient = createRuntimeClient(registered);
    const terminalBridge = createTerminalBridgeMock();
    const owned = {
      terminalTabId: "tab-own",
      paneId: "pane-own",
      sessionId: "session-own",
      title: "Agent",
      placement: "dock" as const,
      sourceAgentSessionId: "agent-1"
    };
    const userPane = {
      terminalTabId: "tab-user",
      paneId: "pane-user",
      sessionId: "session-user",
      title: "User",
      placement: "dock" as const
    };
    const observationService = {
      listTerminalPanes: vi.fn(async () => ({
        active: userPane,
        panes: [userPane, owned]
      })),
      focusTerminalPane: vi.fn(async (request: { readonly paneId?: string }) =>
        request.paneId === owned.paneId ? owned : userPane
      )
    } as unknown as WorkbenchObservationService;
    const bridge = createAgentIpcBridge({
      runtimeClient,
      storageRoot: "/tmp/lyra-agent-test",
      terminalBridge: terminalBridge as never,
      getWindow: () => null,
      getBrowserBridge: () => null,
      getWorkbenchObservationService: () => observationService,
      workbenchState: createWorkbenchStateMock()
    });

    await expect(registered.get("terminal.write")?.({
      data: "echo LYRA-OWN-OK",
      appendNewline: true,
      sessionId: "session-own",
      runtimeCancellation: { sessionId: "agent-1" }
    })).resolves.toMatchObject({
      target: {
        type: "ui",
        sessionId: "session-own"
      }
    });
    expect(terminalBridge.write).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-own",
      data: "echo LYRA-OWN-OK"
    }));

    terminalBridge.write.mockClear();
    await expect(registered.get("terminal.write")?.({
      data: "echo NO",
      sessionId: "session-user",
      runtimeCancellation: { sessionId: "agent-1" }
    })).rejects.toThrow(/belongs to the user/);
    expect(terminalBridge.write).not.toHaveBeenCalled();

    bridge.dispose();
  });
});
