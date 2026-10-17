import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type {
  AgentRuntimeEvent,
  AgentSessionSnapshot
} from "../../../../shared/desktop-bridge";
import type { LyraDesktopApi } from "../../../../shared/desktop-bridge";
import type { SettingsAiModel } from "../../settings-ai";
import {
  changeI18nLocale,
  setWorkbenchLocale,
  WorkbenchI18nProvider
} from "../../i18n";
import type { AiPanelSessionTab } from "../session-tabs";
import { AiPanelSurface } from "../view";

const snapshot: AgentSessionSnapshot = {
  id: "session-1",
  title: "新会话",
  sessionKind: "normal",
  workingDir: "/",
  projectBound: false,
  messages: [],
  tools: [],
  todos: [],
  turnStatus: "idle",
  activeTurnId: null,
  follow: { running: false, activity: null },
  updatedAt: "2026-05-13T00:00:00.000Z"
};

const findToolGroupHead = async (): Promise<HTMLElement> =>
  waitFor(() => {
    const head = document.querySelector(".lyra-agents-tool-group-head");
    if (!(head instanceof HTMLElement)) throw new Error("Expected tool group head");
    return head;
  });

beforeEach(async () => {
  setWorkbenchLocale("en-US");
  await changeI18nLocale("en-US");
});

const renderWithWorkbenchI18n = (ui: ReactElement) =>
  render(<WorkbenchI18nProvider>{ui}</WorkbenchI18nProvider>);

const projectBoundSnapshot: AgentSessionSnapshot = {
  ...snapshot,
  workingDir: "/Users/petehsu/Documents/Lyra",
  projectBound: true,
  workingDirIsHome: false
};

const snapshotWithConversation: AgentSessionSnapshot = {
  ...snapshot,
  messages: [{
    id: "message-user-1",
    role: "user",
    text: "Plan this project",
    createdAt: "2026-05-13T00:00:01.000Z"
  }]
};

const snapshotWithMessageCount = (count: number): AgentSessionSnapshot => ({
  ...snapshot,
  messages: Array.from({ length: count }, (_, index) => ({
    id: `message-${index + 1}`,
    role: "user" as const,
    text: `Message ${index + 1}`,
    createdAt: `2026-05-13T00:${String(index).padStart(2, "0")}:00.000Z`
  }))
});

const memoryUpdated = (
  timelineProjection: NonNullable<AgentSessionSnapshot["memory"]>["timelineProjection"] = []
): NonNullable<AgentSessionSnapshot["memory"]> => ({
  session: {
    sessionId: "session-1",
    title: "新会话",
    workingDir: "/",
    providerKey: null,
    model: null,
    status: "idle",
    schemaVersion: 1,
    createdAtMs: 1_747_094_400_000,
    createdAtIso: "2026-05-13T00:00:00.000Z",
    updatedAtMs: 1_747_094_400_000,
    updatedAtIso: "2026-05-13T00:00:00.000Z"
  },
  runtimeTurns: [],
  timelineProjection,
  activeTodos: [],
  activeBrowserTargets: [],
  activeClarification: null,
  status: "idle",
  providerLabel: null,
  modelLabel: null
});

const agentModels = {
  sessionId: "session-1",
  currentModel: "mimo-v2.5-pro",
  currentProvider: "mimo-token-plan",
  defaultModel: "mimo-v2.5-pro",
  defaultProvider: "mimo-token-plan",
  models: [
    {
      id: "mimo-token-plan:mimo-v2.5-pro",
      label: "mimo-v2.5-pro · MiMo",
      model: "mimo-v2.5-pro",
      provider: "MiMo",
      providerId: "mimo-token-plan",
      providerLabel: "MiMo",
      providerKey: "mimo-token-plan",
      apiMethod: "openai-compatible",
      detail: "configured",
      supportsImageInput: true,
      supportsToolCalling: true,
      available: true,
      enabled: true,
      selected: true
    },
    {
      id: "openai:gpt-5",
      label: "gpt-5 · OpenAI",
      model: "gpt-5",
      provider: "OpenAI",
      providerId: "openai",
      providerLabel: "OpenAI",
      providerKey: "openai",
      apiMethod: "openai",
      detail: "configured",
      supportsImageInput: true,
      supportsToolCalling: true,
      available: true,
      enabled: true
    },
    {
      id: "missing:unconfigured-model",
      label: "unconfigured-model · Missing",
      model: "unconfigured-model",
      provider: "Missing",
      providerId: "missing",
      providerLabel: "Missing",
      providerKey: "missing",
      apiMethod: "openai",
      detail: "not configured",
      supportsImageInput: false,
      supportsToolCalling: false,
      available: false,
      enabled: true
    }
  ],
  routes: [],
  reasoningEffort: {
    current: "low",
    options: ["none", "low", "medium", "high"],
    supported: true
  },
  verbosity: {
    current: "medium",
    options: ["low", "medium", "high"],
    supported: true
  },
  serviceTier: {
    current: "priority",
    options: ["priority", "flex"],
    supported: true
  }
};

const sessionSummaryFromSnapshot = (entry: AgentSessionSnapshot) => ({
  id: entry.id,
  title: entry.title,
  status: entry.turnStatus,
  providerKey: null,
  providerLabel: null,
  model: null,
  messageCount: entry.messages.length,
  createdAt: entry.updatedAt,
  updatedAt: entry.updatedAt,
  lastActiveAt: entry.updatedAt,
  saved: false,
  saveLabel: null,
  archived: false,
  customTitle: null,
  workingDir: entry.workingDir
});

const createDesktopApi = () => {
  let listener: ((event: AgentRuntimeEvent) => void) | null = null;
  let readSnapshot = snapshot;
  let modelsResponse = agentModels;
  const createSession = vi.fn(async () => readSnapshot);
  const listSessions = vi.fn(async () => ({
    sessionsDir: "/tmp/lyra/agent/sessions",
    sessions: [
      sessionSummaryFromSnapshot(readSnapshot),
      sessionSummaryFromSnapshot({
        ...snapshot,
        id: "session-2",
        title: "Background plan",
        turnStatus: "running"
      })
    ].filter((session, index, sessions) =>
      sessions.findIndex((candidate) => candidate.id === session.id) === index
    )
  }));
  const triggerPoke = vi.fn(async () => ({
    sessionId: "session-1",
    turnId: "turn-poke",
    status: "running" as const,
    sent: true,
    incompleteTodoCount: 1
  }));
  const previewRollback = vi.fn(async (request: { messageId: string; sessionId: string }) => ({
    sessionId: request.sessionId,
    messageId: request.messageId,
    available: true,
    checkpointAt: "2026-05-13T00:00:00.000Z",
    removedMessageCount: 2,
    changedFiles: [{ path: "src/file.ts" }],
    unavailableReason: null
  }));
  const restoreRollback = vi.fn(async (request: { messageId: string; sessionId: string }) => ({
    sessionId: request.sessionId,
    messageId: request.messageId,
    removedMessageCount: 2,
    restoredFileCount: 1
  }));
  const bindProject = vi.fn(async () => ({
    ...snapshot,
    workingDir: "/Users/petehsu/Documents/Lyra",
    projectBound: true
  }));
  const materializeImageAttachment = vi.fn(async () => ({
    path: "/Users/petehsu/.lyra/modules/agent/message-images/agent-output.png"
  }));
  const revealSensitiveValue = vi.fn(async () => ({
    refId: "login-manager:credential-password:credential-example",
    value: "super-secret-password"
  }));
  const readBrowserFollowMode = vi.fn(async () => ({
    enabled: false
  }));
  const updateBrowserFollowMode = vi.fn(async () => ({
    enabled: false
  }));
  const api = {
    agent: {
      createSession,
      listSessions,
      readSession: vi.fn(async () => readSnapshot),
      sendTurn: vi.fn(async () => ({
        sessionId: "session-1",
        turnId: "turn-1",
        status: "running" as const
      })),
      cancelTurn: vi.fn(async () => ({
        sessionId: "session-1",
        status: "cancelling" as const
      })),
      respondClarification: vi.fn(async () => undefined),
      respondPermission: vi.fn(async () => undefined),
      previewRollback,
      restoreRollback,
      bindProject,
      registerProject: vi.fn(async (request: { workingDir: string }) => ({
        project: {
          id: "project-lyra",
          path: request.workingDir,
          name: "Lyra",
          lastUsedAt: "2026-05-13T00:00:00.000Z",
          available: true
        }
      })),
      listAgentModels: vi.fn(async () => modelsResponse),
      switchAgentModel: vi.fn(async () => modelsResponse),
      refreshAgentModels: vi.fn(async () => modelsResponse),
      updateAgentProviderOptions: vi.fn(async () => modelsResponse),
      triggerPoke,
      readBrowserFollowMode,
      updateBrowserFollowMode,
      materializeImageAttachment,
      onEvent: vi.fn((next: (event: AgentRuntimeEvent) => void) => {
        listener = next;
        return () => {
          listener = null;
        };
      })
    },
    sensitiveValues: {
      revealToUser: revealSensitiveValue
    },
  } as unknown as LyraDesktopApi;
  return {
    api,
    createSession,
    triggerPoke,
    bindProject,
    materializeImageAttachment,
    revealSensitiveValue,
    readBrowserFollowMode,
    updateBrowserFollowMode,
    emit: (event: AgentRuntimeEvent) => {
      listener?.(event);
    },
    setReadSnapshot: (nextSnapshot: AgentSessionSnapshot) => {
      readSnapshot = nextSnapshot;
    },
    setModelsResponse: (nextModels: typeof agentModels) => {
      modelsResponse = nextModels;
    }
  };
};

const renderPanel = (
  desktopApi: LyraDesktopApi,
  onRequestProjectBind?: (currentPath?: string) => Promise<string | null>,
  onOpenProjectTree?: (request: {
    readonly sessionId: string;
    readonly workingDir: string;
  }) => Promise<void> | void,
  locale: "zh-CN" | "en-US" = "en-US",
  onOpenModelSettings?: () => Promise<void> | void,
  onOpenUrlInWorkbench?: (request: {
    readonly url: string;
    readonly title?: string;
  }) => Promise<void> | void,
  onOpenFile?: (
    filePath: string,
    location?: { readonly line: number; readonly endLine?: number }
  ) => void
) =>
  {
    setWorkbenchLocale(locale);
    void changeI18nLocale(locale);
    return renderWithWorkbenchI18n(
      <AiPanelSurface
        variant="sidebar"
        desktopApi={desktopApi}
        {...(onRequestProjectBind === undefined ? {} : { onRequestProjectBind })}
        {...(onOpenProjectTree === undefined ? {} : { onOpenProjectTree })}
        {...(onOpenModelSettings === undefined ? {} : { onOpenModelSettings })}
        {...(onOpenUrlInWorkbench === undefined ? {} : { onOpenUrlInWorkbench })}
        {...(onOpenFile === undefined ? {} : { onOpenFile })}
        title="Agent"
        emptyThreadLabel="No messages"
      />
    );
  };

const settingsAiModel = {
  profiles: [],
  defaultProfileId: null,
  agentConfig: {
    config: {
      provider: {
        default_provider: "mimo-token-plan",
        default_model: "mimo-v2.5-pro"
      }
    },
    commands: []
  }
} as unknown as SettingsAiModel;

const expandCollapsedToolGroups = (): void => {
  for (const head of document.querySelectorAll<HTMLButtonElement>(".lyra-agents-message-process-fold-head")) {
    if (head.getAttribute("aria-expanded") === "false") {
      fireEvent.click(head);
    }
  }
  for (const head of document.querySelectorAll<HTMLButtonElement>(".lyra-agents-tool-group-head")) {
    if (head.getAttribute("aria-expanded") === "false") {
      fireEvent.click(head);
    }
  }
};

const renderPanelWithSettings = (desktopApi: LyraDesktopApi) =>
  renderWithWorkbenchI18n(
    <AiPanelSurface
      variant="sidebar"
      desktopApi={desktopApi}
      settingsAiModel={settingsAiModel}
      title="Agent"
      emptyThreadLabel="No messages"
    />
  );

const openModelControlsMenu = async () => {
  const user = userEvent.setup();
  const trigger = await screen.findByLabelText("Models");
  await user.click(trigger);
};

const openModelParameterSubmenu = async (name: RegExp) => {
  const subTrigger = await screen.findByRole("menuitem", { name });
  act(() => {
    fireEvent.mouseEnter(subTrigger);
    fireEvent.pointerMove(subTrigger);
    subTrigger.focus();
    fireEvent.keyDown(subTrigger, { key: "ArrowRight" });
  });
  return subTrigger;
};

const openButtonMenu = async (label: string) => {
  const trigger = await screen.findByLabelText(label);
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
};

const enterComposerText = (text: string) => {
  const editor = screen.getByRole("textbox", { name: "Send a message to Lyra" });
  editor.textContent = text;
  fireEvent.input(editor);
};

describe("AiPanelSurface", () => {
  test("opens long sessions with only the recent message window rendered", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot(snapshotWithMessageCount(55));

    renderPanel(api);

    expect(await screen.findByText("Message 55")).toBeInTheDocument();
    expect(screen.queryByText("Message 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Show earlier")).not.toBeInTheDocument();
  });

  test("follows the selected Chinese locale for Agent chrome", async () => {
    const { api } = createDesktopApi();
    renderPanel(api, undefined, undefined, "zh-CN");

    await screen.findByText("新会话");
    expect(screen.getByRole("textbox", { name: "给Lyra发送消息" })).toBeInTheDocument();
    expect(screen.getByLabelText("更多")).toBeInTheDocument();
    expect(await screen.findByLabelText("模型控制")).toBeInTheDocument();
    expect(screen.queryByLabelText("刷新模型列表")).not.toBeInTheDocument();
  });

  test("updates mounted Agent chrome from the workbench locale store", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    expect(await screen.findByRole("textbox", { name: "Send a message to Lyra" }))
      .toBeInTheDocument();

    act(() => {
      setWorkbenchLocale("zh-CN");
    });

    expect(await screen.findByRole("textbox", { name: "给Lyra发送消息" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("更多")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("zh-CN");
  });

  test("does not show a Follow Agent toggle in the composer", async () => {
    const { api, readBrowserFollowMode, updateBrowserFollowMode } = createDesktopApi();
    renderPanel(api);

    expect(await screen.findByRole("textbox", { name: "Send a message to Lyra" }))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Follow Agent")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Unfollow Agent")).not.toBeInTheDocument();
    expect(readBrowserFollowMode).not.toHaveBeenCalled();
    expect(updateBrowserFollowMode).not.toHaveBeenCalled();
  });

  test("sends composer text through the Agent provider", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    await screen.findByText("新会话");
    enterComposerText("Build the slice");
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(api.agent?.sendTurn).toHaveBeenCalledWith({
        sessionId: "session-1",
        text: "Build the slice",
        webLinks: []
      });
    });
  });

  test("keeps newly appended user messages visible when memory projection is stale", async () => {
    const { api, emit, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [{
        id: "message-old-user",
        role: "user",
        text: "First request",
        createdAt: "2026-05-13T00:00:01.000Z"
      }],
      memory: memoryUpdated([{
        eventId: "message-old-user",
        runtimeTurnId: "turn-old",
        kind: "user_message",
        role: "user",
        payloadJson: { text: "First request" },
        createdAtMs: 1_747_094_401_000,
        createdAtIso: "2026-05-13T00:00:01.000Z"
      }])
    });
    renderPanel(api);

    expect(await screen.findByText("First request")).toBeInTheDocument();

    act(() => {
      emit({
        kind: "messageCommitted",
        sessionId: "session-1",
        message: {
          id: "message-new-user",
          role: "user",
          text: "Second request",
          createdAt: "2026-05-13T00:00:05.000Z"
        }
      });
    });

    expect(await screen.findByText("Second request")).toBeInTheDocument();
  });

  test("renders orphan tool records in chronological position instead of at the end", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "message-user-1",
          role: "user",
          text: "Find the file",
          createdAt: "2026-05-13T00:00:01.000Z"
        },
        {
          id: "message-agent-1",
          role: "assistant",
          text: "I found it.",
          createdAt: "2026-05-13T00:00:04.000Z"
        },
        {
          id: "message-user-2",
          role: "user",
          text: "Open it next",
          createdAt: "2026-05-13T00:00:05.000Z"
        }
      ],
      tools: [
        {
          id: "tool-search",
          name: "search.files",
          label: "Searching workspace",
          status: "running",
          input: { query: "target.png" },
          startedAt: "2026-05-13T00:00:02.000Z"
        },
        {
          id: "tool-search",
          name: "search.files",
          label: "Searched workspace",
          status: "completed",
          input: { query: "target.png" },
          output: { content: "target.png" },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:03.000Z"
        }
      ]
    });
    renderPanel(api);

    await screen.findByText("I found it.");
    expandCollapsedToolGroups();
    const tool = screen.getByText("Searched workspace");
    const agentText = screen.getByText("I found it.");
    const nextUserText = screen.getByText("Open it next");

    expect(tool.compareDocumentPosition(agentText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(agentText.compareDocumentPosition(nextUserText) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Running...")).not.toBeInTheDocument();
  });

  test("keeps an Agent responding indicator visible while the turn is cancellable", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [{
        id: "message-agent-1",
        role: "assistant",
        text: "I am checking the page.",
        blocks: [{
          type: "text",
          id: "text-0",
          text: "I am checking the page."
        }],
        createdAt: "2026-05-13T00:00:01.000Z"
      }],
      turnStatus: "running",
      activeTurnId: "turn-1",
      follow: { running: true, activity: "calling_model" }
    });
    renderPanel(api);

    expect(await screen.findByText("I am checking the page.")).toBeInTheDocument();
    expect(screen.getByLabelText("Pause")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent is responding")).toBeInTheDocument();
  });

  test("renders only one Agent responding indicator for a running timeline", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "message-user-1",
          role: "user",
          text: "Find the official video",
          createdAt: "2026-05-13T00:00:01.000Z"
        },
        {
          id: "message-assistant-tools",
          role: "assistant",
          text: "",
          blocks: [
            {
              type: "tool",
              id: "tool-tool-read-browser",
              toolId: "tool-read-browser"
            }
          ],
          createdAt: "2026-05-13T00:00:02.000Z"
        }
      ],
      tools: [
        {
          id: "tool-read-browser",
          name: "workbench.read_tab",
          label: "Read browser text",
          status: "running",
          input: {},
          output: null,
          startedAt: "2026-05-13T00:00:02.000Z"
        }
      ],
      turnStatus: "running",
      activeTurnId: "turn-1",
      follow: { running: true, activity: "Reading" }
    });
    renderPanel(api);

    expect(await screen.findByLabelText("Pause")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Agent is responding")).toHaveLength(1);
  });

  test("uses the composer primary button for pause only while running with no draft", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      follow: { running: true, activity: "Streaming" },
      turnStatus: "running"
    });
    renderPanel(api);

    await screen.findByText("新会话");
    fireEvent.click(await screen.findByLabelText("Pause"));
    await waitFor(() => {
      expect(api.agent?.cancelTurn).toHaveBeenCalledWith({ sessionId: "session-1" });
    });

    enterComposerText("Queue this while running");
    expect(screen.queryByLabelText("Pause")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(api.agent?.sendTurn).toHaveBeenCalledWith({
        sessionId: "session-1",
        text: "Queue this while running",
        webLinks: []
      });
    });
  });

  test("does not send Lyra provider profile state with the Agent turn", async () => {
    const { api } = createDesktopApi();
    renderPanelWithSettings(api);

    await screen.findByText("新会话");
    enterComposerText("Use the configured model");
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(api.agent?.sendTurn).toHaveBeenCalledWith({
        sessionId: "session-1",
        text: "Use the configured model",
        webLinks: []
      });
    });
  });

  test("renders message times in 24-hour format", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "user-time",
          role: "user",
          text: "time check",
          createdAt: "2026-05-13T20:43:00"
        },
        {
          id: "agent-time",
          role: "assistant",
          text: "done",
          createdAt: "2026-05-13T20:44:00"
        }
      ]
    });
    renderPanel(api, undefined, undefined, "zh-CN");

    expect(await screen.findByText("time check")).toBeInTheDocument();
    const rendered = document.body.textContent ?? "";
    expect(rendered).toContain("20:43");
    expect(rendered).toContain("20:44");
    expect(rendered).not.toMatch(/\b(?:AM|PM)\b/u);
  });

  test("switches models from the composer toolbar through the Lyra Agent bridge", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    await openModelControlsMenu();
    expect(screen.queryByRole("menuitem", { name: "unconfigured-model · Missing" }))
      .not.toBeInTheDocument();
    // Model rows carry a per-row reasoning submenu; picking an effort on a
    // different row is what switches to that model.
    await openModelParameterSubmenu(/gpt-5 · OpenAI/u);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Medium" }));

    await waitFor(() => {
      expect(api.agent?.switchAgentModel).toHaveBeenCalledWith({
        sessionId: "session-1",
        model: "gpt-5",
        provider: "openai"
      });
    });
  });

  test("changes reasoning effort from the model menu row submenu", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    await openModelControlsMenu();
    await openModelParameterSubmenu(/mimo-v2\.5-pro · MiMo/u);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Medium" }));

    await waitFor(() => {
      expect(api.agent?.updateAgentProviderOptions).toHaveBeenCalledWith({
        sessionId: "session-1",
        reasoningEffort: "medium"
      });
    });
  });

  test("keeps model runtime parameters inside inline model parameter buttons", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    await openModelControlsMenu();
    await openModelParameterSubmenu(/Verbosity/i);
    fireEvent.click(await screen.findByRole("menuitem", { name: "high" }));

    await waitFor(() => {
      expect(api.agent?.updateAgentProviderOptions).toHaveBeenCalledWith({
        sessionId: "session-1",
        verbosity: "high"
      });
    });

    await openModelControlsMenu();
    await openModelParameterSubmenu(/Fast mode/i);
    fireEvent.click(await screen.findByRole("menuitem", { name: "flex" }));

    await waitFor(() => {
      expect(api.agent?.updateAgentProviderOptions).toHaveBeenCalledWith({
        sessionId: "session-1",
        serviceTier: "flex"
      });
    });
  });

  test("closes the composer attachment menu when clicking outside", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    fireEvent.click(await screen.findByLabelText("Attach"));
    expect(await screen.findByRole("menuitem", { name: "Add file" }))
      .toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("menuitem", { name: "Add file" }))
        .not.toBeInTheDocument();
    });
  });

  test("shows a model settings reminder instead of a fallback model when none are configured", async () => {
    const { api, setModelsResponse } = createDesktopApi();
    const openModelSettings = vi.fn();
    setModelsResponse({
      ...agentModels,
      currentModel: "claude-sonnet-4-6",
      currentProvider: "Anthropic",
      defaultModel: "",
      defaultProvider: "",
      models: []
    });
    renderPanel(api, undefined, undefined, "en-US", openModelSettings);

    const configureButton = await screen.findByRole("button", { name: "Configure model" });
    expect(screen.queryByText(/claude-sonnet-4-6/u)).not.toBeInTheDocument();
    fireEvent.click(configureButton);

    expect(openModelSettings).toHaveBeenCalled();
  });

  test("keeps composer permission and model-settings chrome when the catalog fails to load", async () => {
    const { api } = createDesktopApi();
    const openModelSettings = vi.fn();
    vi.mocked(api.agent!.listAgentModels).mockRejectedValue(new Error("disk full"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      renderPanel(api, undefined, undefined, "en-US", openModelSettings);

      expect(await screen.findByRole("button", { name: "Configure model" })).toBeInTheDocument();
      expect(await screen.findByLabelText("Perm mode")).toBeInTheDocument();
      expect(screen.queryByLabelText("Models")).not.toBeInTheDocument();
    } finally {
      warn.mockRestore();
    }
  });

  test("reloads composer model controls after Lyra Agent settings change", async () => {
    const { api, setModelsResponse } = createDesktopApi();
    const openModelSettings = vi.fn();
    setModelsResponse({
      ...agentModels,
      currentModel: "claude-sonnet-4-6",
      currentProvider: "Anthropic",
      defaultModel: "",
      defaultProvider: "",
      models: []
    });
    const initialSettings = {
      ...settingsAiModel,
      agentConfig: {
        config: {
          provider: {
            default_provider: null,
            default_model: null
          },
          providers: {}
        },
        commands: []
      }
    } as unknown as SettingsAiModel;
    const configuredSettings = {
      ...settingsAiModel,
      agentConfig: {
        config: {
          provider: {
            default_provider: "mimo-token-plan",
            default_model: "mimo-v2.5-pro"
          },
          providers: {
            "mimo-token-plan": {
              base_url: "https://token-plan-sgp.xiaomimimo.com/v1",
              default_model: "mimo-v2.5-pro",
              models: [{ id: "mimo-v2.5-pro" }]
            }
          }
        },
        commands: []
      },
      agentAccounts: {
        defaultProvider: "mimo-token-plan",
        defaultModel: "mimo-v2.5-pro",
        authStatus: {},
        accounts: []
      }
    } as unknown as SettingsAiModel;

    const { rerender } = renderWithWorkbenchI18n(
      <AiPanelSurface
        variant="sidebar"
        desktopApi={api}
        settingsAiModel={initialSettings}
        onOpenModelSettings={openModelSettings}
        title="Agent"
        emptyThreadLabel="No messages"
      />
    );

    expect(await screen.findByRole("button", { name: "Configure model" })).toBeInTheDocument();
    setModelsResponse(agentModels);
    rerender(
      <WorkbenchI18nProvider>
        <AiPanelSurface
          variant="sidebar"
          desktopApi={api}
          settingsAiModel={configuredSettings}
          onOpenModelSettings={openModelSettings}
          title="Agent"
          emptyThreadLabel="No messages"
        />
      </WorkbenchI18nProvider>
    );

    await waitFor(() => {
      expect(api.agent?.listAgentModels).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByLabelText("Models")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configure model" })).not.toBeInTheDocument();
  });

  test("binds a home-defaulted backing session to a real project from the chip", async () => {
    const { api, bindProject, setReadSnapshot } = createDesktopApi();
    const requestProjectBind = vi.fn(async () => "/Users/petehsu/Documents/Lyra");
    // A backing session exists but is bound to Home by default, so the chip
    // (labelled "Home") still binds it to a real project.
    setReadSnapshot({
      ...snapshotWithConversation,
      workingDir: "/Users/petehsu",
      projectBound: true,
      workingDirIsHome: true
    });
    renderPanel(api, requestProjectBind);

    const chip = await screen.findByLabelText("Home");
    expect(chip).not.toBeDisabled();
    fireEvent.keyDown(chip, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "New project" }));

    await waitFor(() => {
      expect(requestProjectBind).toHaveBeenCalled();
      expect(bindProject).toHaveBeenCalledWith({
        sessionId: "session-1",
        workingDir: "/Users/petehsu/Documents/Lyra"
      });
    });
  });

  test("opens the bound project tree from the composer project chip", async () => {
    const { api, bindProject, setReadSnapshot } = createDesktopApi();
    const requestProjectBind = vi.fn(async () => "/Users/petehsu/Documents/Other");
    const openProjectTree = vi.fn();
    setReadSnapshot({
      ...snapshot,
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true,
      workingDirIsHome: false
    });
    renderPanel(api, requestProjectBind, openProjectTree);

    const projectChip = await screen.findByLabelText("Lyra");
    expect(projectChip).not.toBeDisabled();
    fireEvent.keyDown(projectChip, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Project Tree" }));

    await waitFor(() => {
      expect(openProjectTree).toHaveBeenCalledWith({
        sessionId: "session-1",
        workingDir: "/Users/petehsu/Documents/Lyra"
      });
    });
    expect(requestProjectBind).not.toHaveBeenCalled();
    expect(bindProject).not.toHaveBeenCalled();
  });

  test("new sessions do not inherit the current bound project directory", async () => {
    const { api, createSession, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshotWithConversation,
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true
    });
    renderPanel(api);

    await screen.findByRole("button", { name: "New session" });
    fireEvent.click(await screen.findByRole("button", { name: "New session" }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({
        title: "New session"
      });
    });
  });

  test("keeps project tree out of the header while a project is bound", async () => {
    const { api, bindProject, setReadSnapshot } = createDesktopApi();
    const requestProjectBind = vi.fn(async () => "/Users/petehsu/Documents/Other");
    const openProjectTree = vi.fn();
    setReadSnapshot({
      ...snapshot,
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true,
      follow: { running: true, activity: "Streaming" },
      turnStatus: "running"
    });
    renderPanel(api, requestProjectBind, openProjectTree);

    await screen.findByLabelText("More");
    expect(screen.queryByRole("button", { name: "Open Project Tree" })).not.toBeInTheDocument();
    expect(openProjectTree).not.toHaveBeenCalled();
    expect(requestProjectBind).not.toHaveBeenCalled();
    expect(bindProject).not.toHaveBeenCalled();
  });

  test("does not render removed prompt shortcut menu items", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot(projectBoundSnapshot);
    renderPanel(api);

    await screen.findByText("新会话");
    await openButtonMenu("More");
    expect(screen.queryByRole("menuitem", { name: "Improve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Refactor" })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Rename" })).toBeInTheDocument();
  });

  test("disables the more menu on an empty draft session", async () => {
    const { api } = createDesktopApi();
    renderWithWorkbenchI18n(
      <AiPanelSurface
        variant="sidebar"
        desktopApi={api}
        activeSessionTabId="draft-1"
        activeSessionId={null}
        sessionTabs={[{
          tabId: "draft-1",
          sessionId: null,
          title: "新会话",
          lastKnownStatus: null
        }]}
        title="Agent"
        emptyThreadLabel="No messages"
      />
    );

    const moreButton = await screen.findByLabelText("More");
    expect(moreButton).toBeDisabled();
    expect(moreButton).toHaveAttribute("title", "No actions for an empty session");
  });

  test("does not derive todos from arbitrary tool output", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      tools: [
        {
          id: "lyra-lumen-tool",
          name: "lyra_lumen",
          label: "Lyra Lumen",
          status: "completed",
          input: { action: "inspect" },
          output: {
            content: JSON.stringify({
              todos: [{ content: "fake todo from JSON output", status: "pending" }],
              items: [
                { text: "请叫我徐总" },
                { text: "视频生成" },
                { text: "图像生成" }
              ],
              mainTextExcerpt: "快速 视频生成 图像生成 深入研究"
            })
          },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:02.500Z"
        },
        {
          id: "dom-tool",
          name: "read_dom",
          label: "Read DOM",
          status: "completed",
          input: {},
          output: {
            content: "<button>fake todo from DOM text</button>"
          },
          startedAt: "2026-05-13T00:00:03.000Z",
          finishedAt: "2026-05-13T00:00:03.500Z"
        },
        {
          id: "file-tool",
          name: "read",
          label: "Read",
          status: "completed",
          input: {},
          output: {
            content: "todo-output.json\nfake todo from file name"
          },
          startedAt: "2026-05-13T00:00:04.000Z",
          finishedAt: "2026-05-13T00:00:04.500Z"
        }
      ]
    });
    renderPanel(api);

    await screen.findByText("新会话");
    expect(screen.queryByText("请叫我徐总")).not.toBeInTheDocument();
    expect(screen.queryByText("fake todo from JSON output")).not.toBeInTheDocument();
    expect(screen.queryByText("fake todo from DOM text")).not.toBeInTheDocument();
    expect(screen.queryByText("fake todo from file name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Continue unfinished todos")).not.toBeInTheDocument();
  });

  test("does not use memory activeTodos as the TodoBar source", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const memory = memoryUpdated();
    setReadSnapshot({
      ...snapshot,
      memory: {
        ...memory,
        activeTodos: [{
          id: "memory-todo",
          content: "memory-only todo",
          status: "pending",
          priority: "normal"
        }]
      },
      todos: []
    });
    renderPanel(api);

    await screen.findByText("新会话");
    expect(screen.queryByText("memory-only todo")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Continue unfinished todos")).not.toBeInTheDocument();
  });

  test("keeps Lyra Lumen evidence inside level-3 tool details", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "lyra-lumen-map",
        name: "lyra_lumen",
        label: "Ran",
        status: "completed",
        input: { action: "map", target: "isolated", strategy: "picker" },
        output: {
          content: [
            "Observation obs-1 (picker) for Example - https://example.com",
            "[1] button: \"Search\" [click] at (10,20) 80x24",
            "[2] textbox: \"Email\" [type] at (10,60) 180x28"
          ].join("\n"),
          error: null
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(api);

    const groupHead = await findToolGroupHead();
    expect(groupHead).not.toHaveTextContent("2 elements");
    expect(groupHead).not.toHaveTextContent("example.com");
    expect(groupHead).not.toHaveTextContent("1 button Search");

    fireEvent.click(groupHead);

    const callHead = (await screen.findByText("Mapped browser elements")).closest(".lyra-agents-tool-call-head");
    if (callHead === null) throw new Error("Expected tool call head");
    expect(callHead).not.toHaveTextContent("2 elements");
    expect(callHead).not.toHaveTextContent("example.com");
    expect(callHead).not.toHaveTextContent("1 button Search");

    const call = callHead.closest(".lyra-agents-tool-call");
    if (call === null) throw new Error("Expected tool call row");
    expect(call.querySelector(".lyra-agents-tool-call-body")).toBeNull();

    fireEvent.click(callHead);

    await waitFor(() => {
      expect(call.querySelector(".lyra-agents-tool-call-body")).not.toBeNull();
    });
    expect(screen.queryByText("2 elements")).not.toBeInTheDocument();
    expect(screen.queryByText("example.com")).not.toBeInTheDocument();
    expect(screen.getByText(/\[1\] button: "Search"/u).closest(".lyra-agents-tool-call-body")).not.toBeNull();
  });

  test("keeps Lyra Lumen typed text out of tool evidence", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "lyra-lumen-type",
        name: "lyra_lumen",
        label: "Ran",
        status: "completed",
        input: {
          action: "type",
          target: "isolated",
          element_id: 9,
          text: "secret-value"
        },
        output: {
          content: "Typed into element 9 with Chromium virtual keyboard.",
          error: null
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(api);

    const groupHead = await findToolGroupHead();
    expect(groupHead).not.toHaveTextContent("12 chars");
    expect(groupHead).not.toHaveTextContent("element 9");

    fireEvent.click(groupHead);

    const callHead = (await screen.findByText("Typed in browser")).closest(".lyra-agents-tool-call-head");
    if (callHead === null) throw new Error("Expected tool call head");
    expect(callHead).not.toHaveTextContent("12 chars");
    expect(callHead).not.toHaveTextContent("element 9");

    const call = callHead.closest(".lyra-agents-tool-call");
    if (call === null) throw new Error("Expected tool call row");
    expect(call.querySelector(".lyra-agents-tool-call-body")).toBeNull();

    fireEvent.click(callHead);

    await waitFor(() => {
      expect(call.querySelector(".lyra-agents-tool-call-body")).not.toBeNull();
    });
    expect(screen.queryByText("12 chars")).not.toBeInTheDocument();
    expect(screen.queryByText("element 9")).not.toBeInTheDocument();
    expect(screen.getByText(/Typed into element 9/u).closest(".lyra-agents-tool-call-body")).not.toBeNull();
    expect(screen.queryByText("secret-value")).not.toBeInTheDocument();
  });

  test("opens Lyra Lumen image artifacts in the Workbench image viewer", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const onOpenFile = vi.fn();
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "lyra-lumen-see",
        name: "lyra_lumen",
        label: "Ran",
        status: "completed",
        input: {
          action: "see",
          targetMode: "isolated"
        },
        output: {
          content:
            "Captured Lyra Lumen visual evidence lumen-see-1 (320x180) at /Users/petehsu/.lyra/lumen-evidence/lumen-see-1.png.",
          raw: {
            imageArtifact: {
              id: "lumen-see-1",
              kind: "image",
              mediaType: "image/png",
              path: "/Users/petehsu/.lyra/lumen-evidence/lumen-see-1.png",
              width: 320,
              height: 180,
              openTarget: {
                kind: "file",
                path: "/Users/petehsu/.lyra/lumen-evidence/lumen-see-1.png"
              }
            }
          },
          error: null
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      undefined,
      onOpenFile
    );

    fireEvent.click(await findToolGroupHead());
    fireEvent.click(await screen.findByText("Captured browser snapshot"));
    const previews = await screen.findAllByAltText("Lyra Lumen snapshot");
    // The image artifact and open target resolve to the same path, so the
    // renderer deliberately deduplicates them into one preview.
    expect(previews).toHaveLength(1);
    for (const preview of previews) {
      expect(preview).toHaveAttribute(
        "src",
        "lyra-file://preview?path=%2FUsers%2Fpetehsu%2F.lyra%2Flumen-evidence%2Flumen-see-1.png&contentType=image%2Fpng"
      );
    }
    expect(screen.queryByRole("button", { name: "Open image" })).toBeNull();
    fireEvent.click(await screen.findByTitle("Open image in Workbench"));
    await waitFor(() => {
      expect(onOpenFile).toHaveBeenCalledWith(
        "/Users/petehsu/.lyra/lumen-evidence/lumen-see-1.png",
        undefined
      );
    });
  });

  test("renders software open targets only when tool output provides explicit targets", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const onOpenFile = vi.fn();
    setReadSnapshot({
      ...snapshot,
      tools: [
        {
          id: "software-open-target",
          name: "software_invoke_capability",
          label: "Ran",
          status: "completed",
          input: {
            action: "invoke_capability",
            softwareId: "file-manager",
            actionId: "file-manager.revealPath"
          },
          output: {
            content: "Invoked file-manager/file-manager.revealPath\n/Users/tester/Pictures/chart.png",
            raw: {
              softwareId: "file-manager",
              actionId: "file-manager.revealPath",
              output: {
                opened: true,
                path: "/Users/tester/Pictures/chart.png",
                openTarget: {
                  kind: "file",
                  path: "/Users/tester/Pictures/chart.png"
                }
              }
            },
            error: null
          },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:02.500Z"
        },
        {
          id: "software-no-target",
          name: "software_invoke_capability",
          label: "Ran",
          status: "completed",
          input: {
            action: "invoke_capability",
            softwareId: "terminal",
            actionId: "terminal.readVisibleBuffer"
          },
          output: {
            content: "Terminal mentioned /Users/tester/Pictures/not-a-button.png",
            raw: {
              softwareId: "terminal",
              actionId: "terminal.readVisibleBuffer",
              output: {
                activeOutput: "/Users/tester/Pictures/not-a-button.png"
              }
            },
            error: null
          },
          startedAt: "2026-05-13T00:00:03.000Z",
          finishedAt: "2026-05-13T00:00:03.500Z"
        }
      ]
    });
    renderPanel(api, undefined, undefined, "en-US", undefined, undefined, onOpenFile);

    fireEvent.click(await findToolGroupHead());
    fireEvent.click((await screen.findAllByText("file-manager.revealPath"))[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "chart.png" }));
    await waitFor(() => {
      expect(onOpenFile).toHaveBeenCalledWith("/Users/tester/Pictures/chart.png", undefined);
    });

    fireEvent.click((await screen.findAllByText("terminal.readVisibleBuffer"))[0]!);
    expect(screen.queryByRole("button", { name: /not-a-button/u })).not.toBeInTheDocument();
  });


  test("renders sensitive value refs as user-owned buttons without exposing plaintext to Agent text", async () => {
    const { api, setReadSnapshot, revealSensitiveValue } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "software-secret-target",
        name: "software_invoke_capability",
        label: "Ran",
        status: "completed",
        input: {
          action: "invoke_capability",
          softwareId: "login-manager",
          actionId: "login-manager.readState"
        },
        output: {
          content: "Read Login Manager state. Password values are represented as model-opaque refs.",
          raw: {
            softwareId: "login-manager",
            actionId: "login-manager.readState",
            output: {
              credentials: [{
                id: "credential-example",
                hostname: "example.com",
                username: "alice@example.com",
                hasPassword: true,
                passwordRef: {
                  kind: "lyra-sensitive-value-ref",
                  id: "login-manager:credential-password:credential-example",
                  owner: "login-manager",
                  valueKind: "password",
                  ownership: "user_owned",
                  label: "Password for alice@example.com",
                  description: "Saved password for example.com",
                  displayHint: "••••••••",
                  ownerRef: {
                    kind: "login-manager-credential",
                    credentialId: "credential-example",
                    origin: "https://example.com",
                    username: "alice@example.com"
                  },
                  capabilities: [
                    "list_metadata",
                    "use",
                    "fill",
                    "reveal_to_user",
                    "copy_to_clipboard"
                  ],
                  modelVisibility: "metadata_only",
                  plaintextVisibility: "user_reveal_only"
                }
              }]
            }
          },
          error: null
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(api);

    fireEvent.click(await findToolGroupHead());
    fireEvent.click((await screen.findAllByText("login-manager.readState"))[0]!);
    expect(screen.queryByText("super-secret-password")).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Password for alice@example.com" }));
    expect(await screen.findByRole("button", { name: "super-secret-password" })).toBeInTheDocument();
    expect(revealSensitiveValue).toHaveBeenCalledWith({
      ref: expect.objectContaining({
        id: "login-manager:credential-password:credential-example",
        owner: "login-manager",
        modelVisibility: "metadata_only"
      }),
      reason: "user-ai-panel"
    });
  });

  test("renders web search results as clickable Workbench links", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const openUrlInWorkbench = vi.fn(async () => undefined);
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "tool-websearch",
        name: "websearch",
        label: "Web search",
        status: "completed",
        input: { query: "OpenAI latest new models 2025 2026" },
        output: {
          content: [
            "Search results for: OpenAI latest new models 2025 2026",
            "",
            "1. **OpenAI Research | Release**",
            "   https://openai.com/research/index/release/",
            "   OpenAI introduces GPT-Rosalind, a frontier reasoning model built for scientific work.",
            "",
            "2. **OpenAI Models - 33 Releases & Benchmarks**",
            "   https://aireleasetracker.com/company/openai",
            "   Every AI model released by OpenAI, with release dates and benchmarks.",
            ""
          ].join("\n")
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      openUrlInWorkbench
    );

    fireEvent.click(await findToolGroupHead());
    fireEvent.click(await screen.findByText("Web search"));

    expect(screen.getByText("OpenAI latest new models 2025 2026")).toBeInTheDocument();
    expect(screen.getByText("openai.com")).toBeInTheDocument();
    expect(screen.queryByText(/^Search results for:/u)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "OpenAI Research | Release" }));

    expect(openUrlInWorkbench).toHaveBeenCalledWith({
      url: "https://openai.com/research/index/release/",
      title: "OpenAI Research | Release"
    });
  });

  test("renders fetched web pages as compact clickable Workbench links", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const openUrlInWorkbench = vi.fn(async () => undefined);
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "tool-webfetch",
        name: "webfetch",
        label: "Browsed",
        status: "completed",
        input: {
          format: "markdown",
          url: "https://www.cnbc.com/2026/04/23/openai-announces-latest-artificial-intelligence-model.html"
        },
        output: {
          content: [
            "Fetched https://www.cnbc.com/2026/04/23/openai-announces-latest-artificial-intelligence-model.html (9895 bytes)",
            "",
            "- OpenAI announces GPT-5.5, its latest artificial intelligence model",
            "- [Skip Navigation](#MainContent)Markets",
            "- [Pre-Markets](/pre-markets/)",
            "- [U.S. Markets](/us-markets/)"
          ].join("\n")
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      openUrlInWorkbench
    );

    fireEvent.click(await findToolGroupHead());
    fireEvent.click(await screen.findByText("Browsed"));

    const urlButton = await screen.findByRole("button", {
      name: /https:\/\/www\.cnbc\.com\/2026\/04\/23\/openai-announces/u
    });
    expect(screen.getByText("OpenAI announces GPT-5.5, its latest artificial intelligence model"))
      .toBeInTheDocument();
    expect(screen.queryByText(/^Fetched https:/u)).not.toBeInTheDocument();

    fireEvent.click(urlButton);

    expect(openUrlInWorkbench).toHaveBeenCalledWith({
      url: "https://www.cnbc.com/2026/04/23/openai-announces-latest-artificial-intelligence-model.html",
      title: "OpenAI announces GPT-5.5, its latest artificial intelligence model"
    });
  });

  test("renders Workbench tab tool output as structured clickable rows", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const openUrlInWorkbench = vi.fn(async () => undefined);
    setReadSnapshot({
      ...snapshot,
      tools: [{
        id: "tool-workbench-tabs",
        name: "workbench",
        label: "Ran",
        status: "completed",
        input: { action: "list_tabs", scope: "visible" },
        output: {
          content: [
            "- 豆包 - 字节跳动旗下 AI 智能助手 [browser-tab-10] page (page) flags=active,visible,focused | https://www.doubao.com/chat/2084714018988034",
            "- Lyra Agents [browser-tab-11] page (page) flags=visible | http://localhost:5173/"
          ].join("\n")
        },
        startedAt: "2026-05-13T00:00:02.000Z",
        finishedAt: "2026-05-13T00:00:02.500Z"
      }]
    });
    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      openUrlInWorkbench
    );

    fireEvent.click(await findToolGroupHead());
    fireEvent.click(await screen.findByRole("button", { name: "Workbench tabs" }));

    expect(screen.getByText("豆包 - 字节跳动旗下 AI 智能助手")).toBeInTheDocument();
    expect(screen.getByText("Lyra Agents")).toBeInTheDocument();
    expect(screen.queryByText("browser-tab-10")).not.toBeInTheDocument();
    expect(screen.queryByText(/flags=/u)).not.toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", {
      name: /豆包 - 字节跳动旗下 AI 智能助手/u
    }));

    expect(openUrlInWorkbench).toHaveBeenCalledWith({
      url: "https://www.doubao.com/chat/2084714018988034",
      title: "豆包 - 字节跳动旗下 AI 智能助手"
    });
  });

  test("opens assistant output URLs and file paths in the Workbench", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const openUrlInWorkbench = vi.fn(async () => undefined);
    const onOpenFile = vi.fn();
    setReadSnapshot({
      ...snapshot,
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true,
      messages: [{
        id: "message-agent-links",
        role: "assistant",
        text: "Read https://example.com/docs and `apps/desktop/src/main/index.ts:12`.",
        createdAt: "2026-05-13T00:00:02.000Z"
      }]
    });
    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      openUrlInWorkbench,
      onOpenFile
    );

    // Website links render as citation chips whose accessible name is the
    // shortened host/path label.
    fireEvent.click(await screen.findByRole("link", { name: "example.com/docs" }));
    await waitFor(() => {
      expect(openUrlInWorkbench).toHaveBeenCalledWith({
        url: "https://example.com/docs",
        title: "example.com/docs"
      });
    });

    fireEvent.click(await screen.findByText("apps/desktop/src/main/index.ts:12"));
    await waitFor(() => {
      expect(onOpenFile).toHaveBeenCalledWith(
        "/Users/petehsu/Documents/Lyra/apps/desktop/src/main/index.ts",
        expect.objectContaining({ line: 12 })
      );
    });
  });

  test("opens tool output file paths and materialized images in the Workbench", async () => {
    const { api, setReadSnapshot, materializeImageAttachment } = createDesktopApi();
    const onOpenFile = vi.fn();
    setReadSnapshot({
      ...snapshot,
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true,
      messages: [{
        id: "message-agent-image",
        role: "assistant",
        text: "",
        blocks: [{
          type: "image",
          id: "image-block-1",
          mediaType: "image/png",
          data: "iVBORw0KGgo=",
          label: "agent output image",
          source: "inline-data-url"
        }],
        createdAt: "2026-05-13T00:00:02.000Z"
      }],
      tools: [{
        id: "tool-shell-paths",
        name: "shell",
        label: "Ran",
        status: "completed",
        input: { command: "cat apps/desktop/src/main/index.ts" },
        output: {
          content: "See apps/desktop/src/main/index.ts:24 for startup.",
          artifactRefs: [{
            path: "/Users/petehsu/Documents/Lyra/apps/desktop/src/main/index.ts"
          }]
        },
        startedAt: "2026-05-13T00:00:03.000Z",
        finishedAt: "2026-05-13T00:00:03.500Z"
      }]
    });
    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      undefined,
      onOpenFile
    );

    fireEvent.click(await findToolGroupHead());
    fireEvent.click(await screen.findByText("shell"));
    // Tool output paths are only clickable when the tool carries explicit
    // artifact refs; the button uses the generic "Open artifact" label.
    fireEvent.click(await screen.findByRole("button", { name: "Open artifact 1" }));
    await waitFor(() => {
      expect(onOpenFile).toHaveBeenCalledWith(
        "/Users/petehsu/Documents/Lyra/apps/desktop/src/main/index.ts",
        undefined
      );
    });

    fireEvent.click(screen.getByTitle("Open image in Workbench"));
    await waitFor(() => {
      expect(materializeImageAttachment).toHaveBeenCalledWith({
        id: "image-block-1",
        mediaType: "image/png",
        data: "iVBORw0KGgo=",
        label: "agent output image"
      });
    });
    await waitFor(() => {
      expect(onOpenFile).toHaveBeenCalledWith(
        "/Users/petehsu/.lyra/modules/agent/message-images/agent-output.png",
        undefined
      );
    });
  });

  test("only shows image Workbench actions when an image has an open route", async () => {
    const { api, setReadSnapshot, materializeImageAttachment } = createDesktopApi();
    const onOpenFile = vi.fn();
    setReadSnapshot({
      ...snapshot,
      messages: [{
        id: "message-agent-unopenable-image",
        role: "assistant",
        text: "",
        blocks: [{
          type: "image",
          id: "image-block-empty",
          mediaType: "image/png",
          data: "",
          label: "empty inline image",
          source: "inline-data-url"
        }],
        createdAt: "2026-05-13T00:00:02.000Z"
      }]
    });

    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      undefined,
      onOpenFile
    );

    await screen.findByText("empty inline image");
    expect(screen.queryByTitle("Open image in Workbench")).toBeNull();
    expect(materializeImageAttachment).not.toHaveBeenCalled();
  });

  test("opens image attachments from local and remote sources without inline data", async () => {
    const { api, setReadSnapshot, materializeImageAttachment } = createDesktopApi();
    const openUrlInWorkbench = vi.fn(async () => undefined);
    const onOpenFile = vi.fn();
    setReadSnapshot({
      ...snapshot,
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true,
      messages: [{
        id: "message-agent-source-images",
        role: "assistant",
        text: "",
        blocks: [
          {
            type: "image",
            id: "image-block-local-source",
            mediaType: "image/png",
            data: "",
            label: "local image source",
            source: "apps/desktop/.tmp/agent-output.png"
          },
          {
            type: "image",
            id: "image-block-remote-source",
            mediaType: "image/png",
            data: "",
            label: "remote image source",
            source: "https://example.com/agent-output.png"
          }
        ],
        createdAt: "2026-05-13T00:00:02.000Z"
      }]
    });

    const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => pngBytes.buffer
    } as unknown as Response);

    renderPanel(
      api,
      undefined,
      undefined,
      "en-US",
      undefined,
      openUrlInWorkbench,
      onOpenFile
    );

    const openButtons = await screen.findAllByTitle("Open image in Workbench");
    expect(openButtons).toHaveLength(2);

    fireEvent.click(openButtons[0]!);
    await waitFor(() => {
      expect(materializeImageAttachment).toHaveBeenCalled();
      expect(onOpenFile).toHaveBeenCalledWith(
        "/Users/petehsu/Documents/Lyra/apps/desktop/.tmp/agent-output.png",
        undefined,
        expect.objectContaining({
          siblingPaths: [
            "/Users/petehsu/Documents/Lyra/apps/desktop/.tmp/agent-output.png",
            "/Users/petehsu/.lyra/modules/agent/message-images/agent-output.png"
          ]
        })
      );
    });
    expect(openUrlInWorkbench).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test("no longer renders a todo poke button or inline todo title in the panel chrome", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api);

    await screen.findByText("新会话");
    act(() => {
      emit({
        kind: "todoUpdated",
        sessionId: "session-1",
        todos: [{
          id: "todo-event-1",
          content: "continue from core todo event",
          status: "in_progress",
          priority: "medium",
          blockedBy: []
        }]
      });
    });

    // The todo UI is now a fact-driven capsule above the composer that opens the
    // todo board on click. It no longer hangs a poke button from a header pill,
    // nor inlines the current todo's title into the panel chrome.
    await screen.findByText("新会话");
    expect(screen.queryByLabelText("Continue unfinished todos")).not.toBeInTheDocument();
    expect(screen.queryByText("continue from core todo event")).not.toBeInTheDocument();
  });

  test("creates a new Lyra Agent session from the panel header", async () => {
    const { api, createSession, setReadSnapshot } = createDesktopApi();
    setReadSnapshot(snapshotWithConversation);
    renderPanel(api);

    await waitFor(() => {
      expect(screen.getByText("新会话")).toBeInTheDocument();
    });
    createSession.mockResolvedValueOnce({
      ...snapshot,
      id: "session-2",
      title: "Fresh Lyra Agent",
      updatedAt: "2026-05-13T00:01:00.000Z"
    });
    fireEvent.click(await screen.findByRole("button", { name: "New session" }));

    await waitFor(() => {
      expect(createSession).toHaveBeenCalledWith({
        title: "New session"
      });
    });
    expect(await screen.findByText("Fresh Lyra Agent")).toBeInTheDocument();
  });

  test("renders multiple session tabs and switches without cancelling background work", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const onActivateSessionTab = vi.fn();
    const onCloseSessionTab = vi.fn();
    setReadSnapshot({
      ...snapshot,
      title: "Primary Chat"
    });

    function Harness() {
      const [activeSessionId, setActiveSessionId] = useState("session-1");
      return (
        <AiPanelSurface
          variant="sidebar"
          desktopApi={api}
          activeSessionId={activeSessionId}
          sessionTabs={[
            {
              tabId: "session-1",
              sessionId: "session-1",
              title: "Primary Chat",
              lastKnownStatus: "idle"
            },
            {
              tabId: "session-2",
              sessionId: "session-2",
              title: "Background plan",
              lastKnownStatus: "running"
            }
          ]}
          onActivateSessionTab={(sessionId) => {
            onActivateSessionTab(sessionId);
            setActiveSessionId(sessionId);
          }}
          onCloseSessionTab={onCloseSessionTab}
          title="Agent"
          emptyThreadLabel="No messages"
        />
      );
    }

    const { container } = renderWithWorkbenchI18n(<Harness />);

    expect(await screen.findByRole("tab", { name: "Primary Chat" }))
      .toHaveAttribute("aria-selected", "true");
    const backgroundTab = screen.getByRole("tab", { name: "Background plan" });
    expect(backgroundTab.closest(".lyra-agents-session-tab-item"))
      .toHaveClass("lyra-agents-session-tab-item-running");

    fireEvent.click(backgroundTab);

    await waitFor(() => {
      expect(onActivateSessionTab).toHaveBeenCalledWith("session-2");
      expect(api.agent?.readSession).toHaveBeenCalledWith({ sessionId: "session-2" });
    });
    expect(api.agent?.cancelTurn).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "Background plan" }))
      .toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByLabelText("Close session tab: Background plan"));
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });
    });
    expect(onCloseSessionTab).toHaveBeenCalledWith("session-2");
    expect(api.agent?.cancelTurn).not.toHaveBeenCalled();
    expect(container.querySelector(".lyra-agents-session-tab-title")).not.toBeNull();
  });

  test("creates an unbound session through the tab button", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const onCreateSessionTab = vi.fn(async (request) => ({
      ...snapshot,
      id: "session-2",
      title: "Bound follow-up",
      workingDir: request.workingDir ?? "/",
      projectBound: typeof request.workingDir === "string",
      updatedAt: "2026-05-13T00:01:00.000Z"
    }));
    setReadSnapshot({
      ...snapshot,
      title: "Bound project chat",
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true
    });

    function Harness() {
      const [activeSessionId, setActiveSessionId] = useState("session-1");
      const [tabs, setTabs] = useState<AiPanelSessionTab[]>([
        {
          tabId: "session-1",
          sessionId: "session-1",
          title: "Bound project chat",
          lastKnownStatus: "idle"
        }
      ]);
      return (
        <AiPanelSurface
          variant="sidebar"
          desktopApi={api}
          activeSessionId={activeSessionId}
          sessionTabs={tabs}
          onCreateSessionTab={async (request) => {
            const next = await onCreateSessionTab(request);
            setTabs((current) => [
              ...current,
              {
                tabId: next.id,
                sessionId: next.id,
                title: next.title,
                lastKnownStatus: next.turnStatus
              }
            ]);
            setActiveSessionId(next.id);
            return next;
          }}
          title="Agent"
          emptyThreadLabel="No messages"
        />
      );
    }

    renderWithWorkbenchI18n(<Harness />);

    await screen.findByRole("button", { name: "New session" });
    fireEvent.click(await screen.findByRole("button", { name: "New session" }));

    await waitFor(() => {
      expect(onCreateSessionTab).toHaveBeenCalledWith({
        title: "New session"
      });
    });
    expect(await screen.findByRole("tab", { name: "Bound follow-up" }))
      .toHaveAttribute("aria-selected", "true");
  });

  test("keeps model selection and sending on a newly created session", async () => {
    const { api, createSession, setReadSnapshot } = createDesktopApi();
    const onCreateSessionTab = vi.fn(async (request) => ({
      ...snapshot,
      id: "session-2",
      title: request.title ?? "新会话",
      workingDir: request.workingDir ?? "/",
      projectBound: typeof request.workingDir === "string",
      updatedAt: "2026-05-13T00:01:00.000Z"
    }));
    setReadSnapshot({
      ...snapshot,
      title: "Bound project chat",
      workingDir: "/Users/petehsu/Documents/Lyra",
      projectBound: true
    });

    function Harness() {
      const [activeSessionId, setActiveSessionId] = useState<string | null>("session-1");
      const [tabs, setTabs] = useState<AiPanelSessionTab[]>([
        {
          tabId: "session-1",
          sessionId: "session-1",
          title: "Bound project chat",
          lastKnownStatus: "idle"
        }
      ]);
      return (
        <AiPanelSurface
          variant="sidebar"
          desktopApi={api}
          activeSessionId={activeSessionId}
          sessionTabs={tabs}
          onCreateSessionTab={async (request) => {
            const next = await onCreateSessionTab(request);
            setReadSnapshot(next);
            setTabs((current) => [
              ...current,
              {
                tabId: next.id,
                sessionId: next.id,
                title: next.title,
                lastKnownStatus: next.turnStatus
              }
            ]);
            setActiveSessionId(next.id);
            return next;
          }}
          title="Agent"
          emptyThreadLabel="No messages"
        />
      );
    }

    renderWithWorkbenchI18n(<Harness />);

    await screen.findByRole("button", { name: "New session" });
    fireEvent.click(await screen.findByRole("button", { name: "New session" }));

    expect(createSession).not.toHaveBeenCalled();
    expect(await screen.findByRole("tab", { name: "New session" }))
      .toHaveAttribute("aria-selected", "true");

    await openModelControlsMenu();
    await openModelParameterSubmenu(/gpt-5 · OpenAI/u);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Medium" }));

    await waitFor(() => {
      expect(api.agent?.switchAgentModel).toHaveBeenCalledWith({
        sessionId: "session-2",
        model: "gpt-5",
        provider: "openai"
      });
    });

    enterComposerText("Start for real");
    fireEvent.click(screen.getByLabelText("Send"));

    await waitFor(() => {
      expect(onCreateSessionTab).toHaveBeenCalledWith({
        title: "New session"
      });
      expect(api.agent?.sendTurn).toHaveBeenCalledWith({
        sessionId: "session-2",
        text: "Start for real",
        webLinks: []
      });
    });

    await openModelControlsMenu();
    await openModelParameterSubmenu(/gpt-5 · OpenAI/u);
    fireEvent.click(await screen.findByRole("menuitem", { name: "Medium" }));

    await waitFor(() => {
      expect(api.agent?.switchAgentModel).toHaveBeenLastCalledWith({
        sessionId: "session-2",
        model: "gpt-5",
        provider: "openai"
      });
    });
  });

  test("keeps long session tab titles isolated from tab controls", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const longTitle = "A very long investigation title that should stay inside the tab label and never collide with controls";
    setReadSnapshot({
      ...snapshot,
      title: longTitle
    });

    renderWithWorkbenchI18n(
      <AiPanelSurface
        variant="sidebar"
        desktopApi={api}
        activeSessionId="session-1"
        sessionTabs={[
          {
            tabId: "session-1",
            sessionId: "session-1",
            title: longTitle,
            lastKnownStatus: "idle"
          }
        ]}
        title="Agent"
        emptyThreadLabel="No messages"
      />
    );

    const tab = await screen.findByRole("tab", { name: longTitle });
    expect(tab).toHaveAttribute("title", longTitle);
    expect(tab.querySelector(".lyra-agents-session-tab-title")).not.toBeNull();
    expect(screen.getByLabelText(`Close session tab: ${longTitle}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New session" })).toBeInTheDocument();
  });

  test("keeps cramped session tabs readable by squeezing to equal widths", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const rect = (width: number, height = 34): DOMRect => ({
      x: 0,
      y: 0,
      left: 0,
      right: width,
      top: 0,
      bottom: height,
      width,
      height,
      toJSON: () => ({})
    } as DOMRect);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
        if (this.classList.contains("lyra-agents-session-tab-strip")) {
          return rect(172);
        }
        if (this.classList.contains("lyra-agents-session-tab-add")) {
          return rect(32, 30);
        }
        return rect(0);
      });

    try {
      setReadSnapshot({
        ...snapshot,
        title: "Session 1"
      });

      const { container } = renderWithWorkbenchI18n(
        <AiPanelSurface
          variant="sidebar"
          desktopApi={api}
          activeSessionId="session-1"
          sessionTabs={[
            {
              tabId: "session-1",
              sessionId: "session-1",
              title: "Session 1",
              lastKnownStatus: "idle"
            },
            {
              tabId: "session-2",
              sessionId: "session-2",
              title: "Session 2",
              lastKnownStatus: "idle"
            },
            {
              tabId: "session-3",
              sessionId: "session-3",
              title: "Session 3",
              lastKnownStatus: "idle"
            },
            {
              tabId: "session-4",
              sessionId: "session-4",
              title: "Session 4",
              lastKnownStatus: "idle"
            }
          ]}
          title="Agent"
          emptyThreadLabel="No messages"
        />
      );

      await screen.findByRole("tab", { name: "Session 1" });
      expect(container.querySelector(".lyra-agents-session-tab-list-spacer")).toBeNull();
      expect(
        container.querySelector(".lyra-agents-session-tab-item-active")?.getAttribute("style") ?? ""
      ).not.toContain("translate3d");
      expect(container.querySelector(".lyra-agents-session-tab-item-active")
        ?.querySelector(".lyra-agents-session-tab-title"))
        .toHaveTextContent("Session 1");
      expect(container.querySelector("[data-ai-session-tab-id='session-2'] .lyra-agents-session-tab-title"))
        .toHaveTextContent("Session 2");
      const newSession = screen.getByLabelText("New session");
      expect(newSession).toHaveClass("lyra-agents-session-tab-add");
      expect(container.querySelector(".lyra-agents-session-tab-strip")).toContainElement(newSession);
      expect(newSession.closest(".lyra-agents-header-right")).toBeNull();
    } finally {
      rectSpy.mockRestore();
    }
  });

  test("keeps many session tabs inside the strip without horizontal scrolling", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    const rect = (width: number, height = 34): DOMRect => ({
      x: 0,
      y: 0,
      left: 0,
      right: width,
      top: 0,
      bottom: height,
      width,
      height,
      toJSON: () => ({})
    } as DOMRect);
    const rectSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function getBoundingClientRectMock(this: HTMLElement) {
        if (this.classList.contains("lyra-agents-session-tab-strip")) {
          return rect(220);
        }
        if (this.classList.contains("lyra-agents-session-tab-list")) {
          return rect(188);
        }
        if (this.classList.contains("lyra-agents-session-tab-add")) {
          return rect(32, 30);
        }
        return rect(0);
      });

    try {
      setReadSnapshot({
        ...snapshot,
        id: "session-8",
        title: "Session 8"
      });

      const { container } = renderWithWorkbenchI18n(
        <AiPanelSurface
          variant="sidebar"
          desktopApi={api}
          activeSessionId="session-8"
          sessionTabs={Array.from({ length: 8 }, (_, index) => {
            const id = `session-${index + 1}`;
            return {
              tabId: id,
              sessionId: id,
              title: `Session ${index + 1}`,
              lastKnownStatus: "idle" as const
            };
          })}
          title="Agent"
          emptyThreadLabel="No messages"
        />
      );

      await screen.findByRole("tab", { name: "Session 8" });
      expect(container.querySelector(".lyra-agents-session-tab-list-spacer")).toBeNull();
      expect(
        container.querySelector(".lyra-agents-session-tab-item-active")?.getAttribute("style") ?? ""
      ).not.toContain("translate3d");
      expect(container.querySelector(".lyra-agents-session-tab-strip")).toContainElement(
        screen.getByLabelText("New session")
      );
    } finally {
      rectSpy.mockRestore();
    }
  });

  test("keeps the new session tab button available while the current session is empty", async () => {
    const { api } = createDesktopApi();
    renderPanel(api);

    await waitFor(() => {
      expect(screen.getByText("新会话")).toBeInTheDocument();
    });
    const newSession = screen.getByLabelText("New session");
    expect(newSession).toHaveClass("lyra-agents-session-tab-add");
    expect(newSession.closest(".lyra-agents-header-right")).toBeNull();
  });

  test("keeps creating empty draft tabs from the plus button", async () => {
    const { api, createSession } = createDesktopApi();
    const onCreateDraftSessionTab = vi.fn();
    renderWithWorkbenchI18n(
      <AiPanelSurface
        variant="sidebar"
        desktopApi={api}
        activeSessionTabId="draft-1"
        activeSessionId={null}
        sessionTabs={[{
          tabId: "draft-1",
          sessionId: null,
          title: "新会话",
          lastKnownStatus: null
        }]}
        onCreateDraftSessionTab={onCreateDraftSessionTab}
        title="Agent"
        emptyThreadLabel="No messages"
      />
    );

    const add = await screen.findByLabelText("New session");
    fireEvent.click(add);
    fireEvent.click(add);

    expect(onCreateDraftSessionTab).toHaveBeenCalledTimes(2);
    expect(onCreateDraftSessionTab).toHaveBeenCalledWith({ title: "New session" });
    expect(createSession).not.toHaveBeenCalled();
  });

  test("renders streaming messages, tool activity, and pause", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api);

    await waitFor(() => {
      expect(screen.getByText("新会话")).toBeInTheDocument();
    });
    act(() => {
      emit({
        kind: "messageCommitted",
        sessionId: "session-1",
        message: {
          id: "message-1",
          role: "assistant",
          text: "",
          createdAt: "2026-05-13T00:00:01.000Z"
        }
      });
      emit({
        kind: "messageDelta",
        sessionId: "session-1",
        messageId: "message-1",
        delta: "Streaming response"
      });
      emit({
        kind: "toolStarted",
        sessionId: "session-1",
        tool: {
          id: "tool-1",
          name: "search.files",
          label: "Searching workspace",
          status: "running",
          input: {},
          startedAt: "2026-05-13T00:00:02.000Z"
        }
      });
      emit({
        kind: "followStateChanged",
        sessionId: "session-1",
        follow: { running: true, activity: "Searching" }
      });
    });

    expect(await screen.findByText("Streaming response")).toBeInTheDocument();
    expect(screen.queryByText("2026-05-13T00:00:01.000Z")).not.toBeInTheDocument();
    expandCollapsedToolGroups();
    expect(screen.getAllByText("Searching workspace").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText("Pause"));
    await waitFor(() => {
      expect(api.agent?.cancelTurn).toHaveBeenCalledWith({ sessionId: "session-1" });
    });
  });

  test("renders structured clarification events as a blocking question panel", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api);

    await screen.findByText("新会话");
    act(() => {
      emit({
        kind: "clarificationRequested",
        sessionId: "session-1",
        clarificationId: "clar-1",
        question: "Which output style should I use?",
        options: [
          { label: "Detailed", description: "Include reasoning and implementation notes." },
          { label: "Brief", description: "Only include the final answer." },
          "Other"
        ],
        allowCustomAnswer: false,
        detail: "Needed before generating the final document."
      });
      emit({
        kind: "clarificationRequested",
        sessionId: "session-1",
        clarificationId: "clar-2",
        question: "Which tone should I use?",
        options: ["Direct", "Friendly"],
        allowCustomAnswer: true,
        detail: null
      });
    });

    expect(await screen.findByText("Which output style should I use?")).toBeInTheDocument();
    expect(screen.queryByText("Which tone should I use?")).not.toBeInTheDocument();
    expect(screen.getByText("Needed before generating the final document.")).toBeInTheDocument();
    expect(screen.getByLabelText("Only include the final answer.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Other" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Answer the question above first" }))
      .toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: /Brief/u }));

    await waitFor(() => {
      expect(api.agent?.respondClarification).toHaveBeenCalledWith({
        sessionId: "session-1",
        clarificationId: "clar-1",
        answer: "Brief",
        selectedOption: "Brief",
        selectedOptionValue: "Brief"
      });
    });
    expect(screen.queryByText("Which output style should I use?")).not.toBeInTheDocument();
    expect(await screen.findByText("Which tone should I use?")).toBeInTheDocument();
  });

  test("localizes shared-control clarification while submitting original option value", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api, undefined, undefined, "zh-CN");

    await screen.findByText("新会话");
    act(() => {
      emit({
        kind: "clarificationRequested",
        sessionId: "session-1",
        clarificationId: "clar-live",
        question: "The user interrupted Lyra Agent control of the live browser tab. Who should control it now?",
        i18nKey: "decision.sharedControl.question",
        options: [
          {
            label: "Continue Agent",
            i18nKey: "decision.sharedControl.continueAgent",
            description: "Resume Lyra Agent control from the latest browser recovery anchor.",
            descriptionI18nKey: "decision.sharedControl.continueAgent.description"
          },
          {
            label: "Take Over",
            i18nKey: "decision.sharedControl.takeOver",
            description: "Leave the visible tab under user control until the user explicitly authorizes Agent again.",
            descriptionI18nKey: "decision.sharedControl.takeOver.description"
          }
        ],
        allowCustomAnswer: false,
        detail: "ControlHandoffEvent was emitted by live browser input arbitration.",
        detailI18nKey: "decision.sharedControl.detail"
      });
    });

    expect(await screen.findByText("用户中断了 Lyra Agent 对当前浏览器标签的控制，现在由谁控制？")).toBeInTheDocument();
    expect(screen.getByText("检测到用户正在操作当前浏览器，Agent 控制已暂停。")).toBeInTheDocument();
    fireEvent.click(screen.getByText("继续 Agent"));

    await waitFor(() => {
      expect(api.agent?.respondClarification).toHaveBeenCalledWith({
        sessionId: "session-1",
        clarificationId: "clar-live",
        answer: "Continue Agent",
        selectedOption: "Continue Agent",
        selectedOptionValue: "Continue Agent"
      });
    });
  });

  test("does not turn plain assistant questions into a blocking question panel", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api);

    await screen.findByText("新会话");
    const text = "好的，制作一个公司/产品介绍官网！在开始之前，我需要了解几个关键信息：\n\n"
      + "**1. 公司/产品名称是什么？**\n\n"
      + "**2. 主要业务/产品是什么？**";
    act(() => {
      emit({
        kind: "messageCommitted",
        sessionId: "session-1",
        message: {
          id: "assistant-plain-question",
          role: "assistant",
          text,
          createdAt: "2026-05-13T00:00:03.000Z"
        }
      });
    });

    expect(await screen.findByText(/公司\/产品名称是什么/u)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Answer the question above first")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Send a message to Lyra" }))
      .toHaveAttribute("aria-disabled", "false");
    expect(api.agent?.respondClarification).not.toHaveBeenCalled();
  });

  test("renders permission events through the separate permission panel", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api);

    await screen.findByText("新会话");
    act(() => {
      emit({
        kind: "permissionRequested",
        sessionId: "session-1",
        permissionId: "perm-1",
        title: "Run shell command",
        detail: "npm test"
      });
    });

    expect(await screen.findByText("Run shell command")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Allow"));

    await waitFor(() => {
      expect(api.agent?.respondPermission).toHaveBeenCalledWith({
        sessionId: "session-1",
        permissionId: "perm-1",
        allowed: true
      });
    });
  });

  test("renders turn errors inline after the session snapshot refreshes", async () => {
    const { api, emit, setReadSnapshot } = createDesktopApi();
    const runningSnapshot: AgentSessionSnapshot = {
      ...snapshot,
      messages: [
        {
          id: "user-failed",
          role: "user",
          text: "What can you do?",
          createdAt: "2026-05-13T00:00:01.000Z"
        }
      ],
      turnStatus: "running",
      activeTurnId: "turn-failed",
      follow: { running: true, activity: "Thinking" }
    };
    const errorMessage = "provider request timed out";
    const finishedSnapshot: AgentSessionSnapshot = {
      ...runningSnapshot,
      messages: [
        ...runningSnapshot.messages,
        {
          id: "assistant-error",
          role: "assistant",
          text: errorMessage,
          metadata: { isApiError: true },
          createdAt: "2026-05-13T00:00:02.000Z"
        }
      ],
      turnStatus: "idle",
      activeTurnId: null,
      follow: { running: false, activity: null }
    };
    setReadSnapshot(runningSnapshot);
    renderPanel(api);

    expect(await screen.findByText("What can you do?")).toBeInTheDocument();
    setReadSnapshot(finishedSnapshot);
    act(() => {
      emit({
        kind: "messageCommitted",
        sessionId: "session-1",
        message: finishedSnapshot.messages[1]!
      });
      emit({
        kind: "turnFinished",
        sessionId: "session-1",
        turnId: "turn-failed",
        status: "finished"
      });
    });

    expect(screen.queryByText("The turn failed: provider request timed out")).not.toBeInTheDocument();
    expect(screen.queryByText("This turn did not complete. You can send your message again."))
      .not.toBeInTheDocument();
    expect(screen.queryByText("Retry this turn")).not.toBeInTheDocument();
    // The settled snapshot replaces the list wholesale (authoritative
    // refetch), which swaps the streamed message node for the refetched one;
    // findByText can resolve on the transient detached node. Retry until the
    // message is actually in the document.
    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument();
    });
  });

  test("renders Lyra Agent tool transcript as tool UI instead of user result bubbles", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "user-message",
          role: "user",
          text: "show my desktop",
          createdAt: "2026-05-13T00:00:01.000Z"
        },
        {
          id: "assistant-message",
          role: "assistant",
          text: "I found two files.",
          createdAt: "2026-05-13T00:00:03.000Z"
        }
      ],
      tools: [
        {
          id: "tool-1",
          name: "ls",
          label: "Read",
          status: "completed",
          input: { path: "/Users/petehsu/Desktop" },
          output: { content: "file-a\nfile-b", error: null },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:02.500Z"
        }
      ],
      turnStatus: "idle"
    });
    renderPanel(api);

    expect(await screen.findByText("I found two files.")).toBeInTheDocument();
    expandCollapsedToolGroups();
    expect(screen.getByText("Read")).toBeInTheDocument();
    expect(screen.queryByText(/\[tool:/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/\[result:/u)).not.toBeInTheDocument();
  });

  test("renders legacy empty assistant tool messages as tool UI", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "user-message",
          role: "user",
          text: "inspect desktop",
          createdAt: "2026-05-13T00:00:01.000Z"
        },
        {
          id: "assistant-tools-1",
          role: "assistant",
          text: "",
          blocks: [
            {
              type: "tool",
              id: "tool-tool-1",
              tool_id: "tool-1"
            }
          ] as unknown as NonNullable<AgentSessionSnapshot["messages"][number]["blocks"]>,
          createdAt: "2026-05-13T00:00:02.000Z"
        },
        {
          id: "assistant-tools-2",
          role: "assistant",
          text: "",
          createdAt: "2026-05-13T00:00:04.000Z"
        },
        {
          id: "assistant-final",
          role: "assistant",
          text: "Your desktop has several project folders and screenshots.",
          createdAt: "2026-05-13T00:00:05.000Z"
        }
      ],
      tools: [
        {
          id: "tool-1",
          name: "ls",
          label: "Read users",
          status: "completed",
          input: { path: "/Users" },
          output: { content: "petehsu", error: null },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:02.500Z"
        },
        {
          id: "tool-2",
          name: "bash",
          label: "Run whoami",
          status: "completed",
          input: { command: "whoami" },
          output: { content: "petehsu", error: null },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:02.500Z"
        },
        {
          id: "tool-3",
          name: "ls",
          label: "Read desktop",
          status: "completed",
          input: { path: "/Users/petehsu/Desktop" },
          output: { content: "Lyra", error: null },
          startedAt: "2026-05-13T00:00:04.000Z",
          finishedAt: "2026-05-13T00:00:04.500Z"
        }
      ],
      turnStatus: "idle"
    });
    renderPanel(api);

    await screen.findByText("Your desktop has several project folders and screenshots.");
    expandCollapsedToolGroups();
    const firstTool = screen.getByText("Read users");
    const secondTool = screen.getByText("Run whoami");
    const thirdTool = screen.getByText("Read desktop");
    const finalText = screen.getByText("Your desktop has several project folders and screenshots.");
    expect(screen.queryByText("No response text received.")).not.toBeInTheDocument();
    expect(firstTool).toBeInTheDocument();
    expect(secondTool).toBeInTheDocument();
    expect(Boolean(thirdTool.compareDocumentPosition(finalText) & Node.DOCUMENT_POSITION_FOLLOWING))
      .toBe(true);
  });

  test("renders assistant text before and after tools while hiding only placeholders", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "user-message",
          role: "user",
          text: "inspect desktop",
          createdAt: "2026-05-13T00:00:01.000Z"
        },
        {
          id: "assistant-message",
          role: "assistant",
          text: "Let me inspect your desktop.\nI found a few folders.",
          blocks: [
            {
              type: "text",
              id: "text-0",
              text: "Let me inspect your desktop."
            },
            {
              type: "tool",
              id: "tool-tool-1",
              toolId: "tool-1"
            },
            {
              type: "text",
              id: "text-1",
              text: "I found a few folders."
            }
          ],
          createdAt: "2026-05-13T00:00:03.000Z"
        }
      ],
      tools: [
        {
          id: "tool-1",
          name: "ls",
          label: "Read",
          status: "completed",
          input: { path: "/Users/petehsu/Desktop" },
          output: { content: "Projects\nScreenshots", error: null },
          startedAt: "2026-05-13T00:00:02.000Z",
          finishedAt: "2026-05-13T00:00:02.500Z"
        }
      ],
      turnStatus: "idle"
    });
    renderPanel(api);

    await screen.findByText("I found a few folders.");
    expandCollapsedToolGroups();
    const tool = screen.getByText("Read");
    const intro = screen.getByText("Let me inspect your desktop.");
    const outro = screen.getByText("I found a few folders.");
    expect(Boolean(intro.compareDocumentPosition(tool) & Node.DOCUMENT_POSITION_FOLLOWING))
      .toBe(true);
    expect(Boolean(tool.compareDocumentPosition(outro) & Node.DOCUMENT_POSITION_FOLLOWING))
      .toBe(true);
  });

  test("does not expose assistant ellipsis text when it only leads into a tool call", async () => {
    const { api, setReadSnapshot } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "assistant-tool-step",
          role: "assistant",
          text: "...",
          blocks: [
            {
              type: "text",
              id: "text-0",
              text: "..."
            },
            {
              type: "tool",
              id: "tool-tool-1",
              toolId: "tool-1"
            }
          ],
          createdAt: "2026-05-13T00:00:03.000Z"
        }
      ],
      tools: [
        {
          id: "tool-1",
          name: "lyra_lumen",
          label: "Map page",
          status: "completed",
          input: { action: "map" },
          output: { content: "Observation", error: null },
          startedAt: "2026-05-13T00:00:03.000Z",
          finishedAt: "2026-05-13T00:00:03.500Z"
        }
      ],
      turnStatus: "idle"
    });
    renderPanel(api);

    expect(await findToolGroupHead()).toBeInTheDocument();
    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  test("rolls back files and conversation from the user message undo action", async () => {
    const { api, setReadSnapshot, emit } = createDesktopApi();
    setReadSnapshot({
      ...snapshot,
      messages: [
        {
          id: "keep-message",
          role: "user",
          text: "keep this context",
          createdAt: "2026-05-13T00:00:00.000Z"
        },
        {
          id: "rollback-message",
          role: "user",
          text: "change files",
          createdAt: "2026-05-13T00:00:01.000Z",
          rollback: {
            available: true,
            anchorId: "anchor-1",
            checkpointAt: "2026-05-13T00:00:00.000Z"
          }
        },
        {
          id: "agent-after",
          role: "assistant",
          text: "files changed",
          createdAt: "2026-05-13T00:00:02.000Z"
        }
      ]
    });
    renderPanel(api, undefined, undefined, "zh-CN");

    expect(await screen.findByText("change files")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("撤回消息"));

    expect(await screen.findByText("撤销文件和对话")).toBeInTheDocument();
    expect(screen.getByText(/将移除 2 条消息并恢复 1 个文件/u)).toBeInTheDocument();
    expect(api.agent?.previewRollback).toHaveBeenCalledWith({
      sessionId: "session-1",
      messageId: "rollback-message"
    });

    fireEvent.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => {
      expect(api.agent?.restoreRollback).toHaveBeenCalledWith({
        sessionId: "session-1",
        messageId: "rollback-message",
        mode: "taskAndWorkspace"
      });
    });
    act(() => {
      emit({
        kind: "rollbackFinished",
        sessionId: "session-1",
        messageId: "rollback-message",
        removedMessageCount: 2,
        removedToolCount: 0,
        restoredFileCount: 1
      });
    });
    expect(screen.getByText("keep this context")).toBeInTheDocument();
    expect(screen.queryByText("change files")).not.toBeInTheDocument();
    expect(screen.queryByText("files changed")).not.toBeInTheDocument();
  });

  test("does not leave a finished empty assistant response as an ellipsis", async () => {
    const { api, emit, setReadSnapshot } = createDesktopApi();
    renderPanel(api);

    await waitFor(() => {
      expect(screen.getByText("新会话")).toBeInTheDocument();
    });
    setReadSnapshot({
      ...snapshot,
      messages: [{
        id: "message-empty",
        role: "assistant",
        text: "",
        createdAt: "2026-05-13T00:00:01.000Z"
      }],
      turnStatus: "idle"
    });
    act(() => {
      emit({
        kind: "messageCommitted",
        sessionId: "session-1",
        message: {
          id: "message-empty",
          role: "assistant",
          text: "",
          createdAt: "2026-05-13T00:00:01.000Z"
        }
      });
      emit({
        kind: "turnFinished",
        sessionId: "session-1",
        turnId: "turn-1",
        status: "finished"
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("No response text received.")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  test("refreshes the final session snapshot when a turn finishes", async () => {
    const { api, emit, setReadSnapshot } = createDesktopApi();
    renderPanel(api);

    await waitFor(() => {
      expect(screen.getByText("新会话")).toBeInTheDocument();
    });
    act(() => {
      emit({
        kind: "messageCommitted",
        sessionId: "session-1",
        message: {
          id: "message-refresh",
          role: "assistant",
          text: "",
          createdAt: "2026-05-13T00:00:01.000Z"
        }
      });
    });
    setReadSnapshot({
      ...snapshot,
      messages: [{
        id: "message-refresh",
        role: "assistant",
        text: "Recovered final response",
        createdAt: "2026-05-13T00:00:01.000Z"
      }],
      turnStatus: "idle"
    });
    act(() => {
      emit({
        kind: "turnFinished",
        sessionId: "session-1",
        turnId: "turn-1",
        status: "finished"
      });
    });

    expect(await screen.findByText("Recovered final response")).toBeInTheDocument();
  });

  test("ignores finished events from non-active agent sessions", async () => {
    const { api, emit } = createDesktopApi();
    renderPanel(api);

    await waitFor(() => {
      expect(screen.getByText("新会话")).toBeInTheDocument();
    });
    act(() => {
      emit({
        kind: "sessionSnapshot",
        snapshot: {
          ...snapshot,
          id: "other-session",
          title: "Other Session",
          sessionKind: "normal"
        }
      });
      emit({
        kind: "turnFinished",
        sessionId: "other-session",
        turnId: "turn-other",
        status: "finished"
      });
    });

    expect(api.agent?.readSession).not.toHaveBeenCalledWith({
      sessionId: "other-session"
    });
    expect(screen.queryByText("Other Session")).not.toBeInTheDocument();
    expect(screen.getByText("新会话")).toBeInTheDocument();
  });
});
