import { describe, expect, test, vi } from "vitest";

import type { WorkbenchObservationQueryRequest, WorkbenchObservationQueryResult } from "../../../../shared/workbench-observation";
import type { WorkspaceTabsModel } from "../../workspace-tabs";
import type { TerminalDockModel } from "../../terminal-dock/types";
import { attachWorkbenchObservationBridge } from "../service";
import type { WorkbenchObservationDependencies } from "../types";

const createTabsModel = (): WorkspaceTabsModel & {
  readonly _state: {
    tabs: Array<{ id: string; title: string; pageKind: "search"; inputValue: string; displayAddress: string }>;
    activeTabId: string;
    splitGroupTabIds: string[];
    focusedSplitTabId: string | null;
  };
} => {
  const state = {
    tabs: [
      {
        id: "tab-a",
        title: "Tab A",
        pageKind: "search" as const,
        inputValue: "",
        displayAddress: ""
      },
      {
        id: "tab-b",
        title: "Tab B",
        pageKind: "search" as const,
        inputValue: "",
        displayAddress: ""
      },
      {
        id: "tab-c",
        title: "Tab C",
        pageKind: "search" as const,
        inputValue: "",
        displayAddress: ""
      }
    ],
    activeTabId: "tab-a",
    splitGroupTabIds: [] as string[],
    focusedSplitTabId: null as string | null
  };

  return {
    _state: state,
    tabs: state.tabs,
    activeTabId: state.activeTabId,
    activeTab: state.tabs[0],
    get splitGroupTabIds() {
      return state.splitGroupTabIds;
    },
    get focusedSplitTabId() {
      return state.focusedSplitTabId;
    },
    setActiveTab: vi.fn((tabId: string) => {
      state.activeTabId = tabId;
      if (state.splitGroupTabIds.includes(tabId)) {
        state.focusedSplitTabId = tabId;
      }
    }),
    reorderTab: vi.fn((tabId: string, targetIndex: number) => {
      const fromIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      if (fromIndex < 0) return;
      const moving = state.tabs[fromIndex]!;
      const without = state.tabs.filter((tab) => tab.id !== tabId);
      without.splice(Math.min(targetIndex, without.length), 0, moving);
      state.tabs = without;
    }),
    splitTabWithTarget: vi.fn((sourceTabId: string, targetTabId: string) => {
      state.splitGroupTabIds = [sourceTabId, targetTabId];
      state.activeTabId = sourceTabId;
      state.focusedSplitTabId = sourceTabId;
    }),
    detachTabFromSplit: vi.fn((tabId: string) => {
      state.splitGroupTabIds = state.splitGroupTabIds.filter((id) => id !== tabId);
      if (state.splitGroupTabIds.length <= 1) {
        state.splitGroupTabIds = [];
        state.focusedSplitTabId = null;
      }
    }),
    closeTab: vi.fn((tabId: string) => {
      state.tabs = state.tabs.filter((tab) => tab.id !== tabId);
      if (state.activeTabId === tabId) {
        state.activeTabId = state.tabs[0]?.id ?? "tab-a";
      }
      state.splitGroupTabIds = state.splitGroupTabIds.filter((id) => id !== tabId);
    }),
    closeTerminalTab: vi.fn(),
    openTerminalTab: vi.fn(),
    getVisibleWorkspaceLayout: () => ({
      mode: state.splitGroupTabIds.length >= 2 ? "split" as const : "single" as const,
      activeTabId: state.activeTabId,
      visibleTabIds:
        state.splitGroupTabIds.length >= 2
          ? state.splitGroupTabIds
          : [state.activeTabId],
      splitGroupTabIds: state.splitGroupTabIds,
      focusedSplitTabId:
        state.splitGroupTabIds.length >= 2
          ? state.focusedSplitTabId ?? state.splitGroupTabIds[0]!
          : state.activeTabId
    })
  } as unknown as WorkspaceTabsModel & { readonly _state: typeof state };
};

const createDependencies = (tabsModel: WorkspaceTabsModel): WorkbenchObservationDependencies => ({
  desktopApi: null,
  tabsModel,
  fileEditorModel: {} as never,
  fileManagerModel: {} as never,
  imageViewerModel: {} as never,
  terminalModel: {
    state: { tabs: [], activeTabId: null },
    findTab: () => null,
    getTabPanes: () => [],
    closeTab: vi.fn(),
    closePane: vi.fn(),
    focusPane: vi.fn(),
    moveTabToWorkspace: vi.fn(),
    moveTabToDock: vi.fn(),
    openTabWithPlacement: vi.fn(),
    splitTabWithOptions: vi.fn()
  } as unknown as TerminalDockModel
});

const createBridge = (tabsModel: WorkspaceTabsModel) => {
  type ObservationHandler = (
    request: WorkbenchObservationQueryRequest
  ) => Promise<WorkbenchObservationQueryResult> | WorkbenchObservationQueryResult;
  const registered: { current: ObservationHandler | null } = { current: null };
  attachWorkbenchObservationBridge({
    ...createDependencies(tabsModel),
    desktopApi: {
      workbenchObservation: {
        registerHandler: (nextHandler: ObservationHandler) => {
          registered.current = nextHandler;
          return () => undefined;
        }
      }
    } as never
  });
  const handler = registered.current;
  if (handler === null) {
    throw new Error("bridge handler was not registered");
  }
  return async (request: WorkbenchObservationQueryRequest) => handler(request);
};

describe("workbench observation tab control bridge", () => {
  test("reorders, splits, detaches, and closes tabs", async () => {
    const tabsModel = createTabsModel();
    const bridge = createBridge(tabsModel);

    const reorder = await bridge({
      requestId: "req-reorder",
      method: "workbench.tab.reorder_local",
      payload: { tabId: "tab-c", targetIndex: 0 }
    });
    expect(reorder.ok).toBe(true);
    expect(tabsModel.reorderTab).toHaveBeenCalledWith("tab-c", 0);

    const split = await bridge({
      requestId: "req-split",
      method: "workbench.tab.split_local",
      payload: { sourceTabId: "tab-a", targetTabId: "tab-b" }
    });
    expect(split.ok).toBe(true);
    expect(tabsModel.splitTabWithTarget).toHaveBeenCalledWith("tab-a", "tab-b");
    expect(split.result).toMatchObject({
      sourceTabId: "tab-a",
      targetTabId: "tab-b",
      layout: {
        layoutMode: "split",
        splitGroupTabIds: ["tab-a", "tab-b"],
        focusedSplitTabId: "tab-a"
      },
      receipt: expect.stringContaining("post-mutation")
    });

    const detach = await bridge({
      requestId: "req-detach",
      method: "workbench.tab.detach_split_local",
      payload: { tabId: "tab-b" }
    });
    expect(detach.ok).toBe(true);
    expect(tabsModel.detachTabFromSplit).toHaveBeenCalledWith("tab-b");

    const close = await bridge({
      requestId: "req-close",
      method: "workbench.tab.close_local",
      payload: { tabId: "tab-c" }
    });
    expect(close.ok).toBe(true);
    expect(tabsModel.closeTab).toHaveBeenCalledWith("tab-c");
    expect(close.result).toMatchObject({
      tabId: "tab-c",
      closed: true,
      activeTabId: "tab-a",
      receipt: expect.stringContaining("Closed tab")
    });
  });

  test("closes a listed embedded browser tab that is not a workspace tab", async () => {
    const tabsModel = createTabsModel();
    const closeEmbeddedBrowserTab = vi.fn(() => true);
    type ObservationHandler = (
      request: WorkbenchObservationQueryRequest
    ) => Promise<WorkbenchObservationQueryResult> | WorkbenchObservationQueryResult;
    const registered: { current: ObservationHandler | null } = { current: null };
    attachWorkbenchObservationBridge({
      ...createDependencies(tabsModel),
      embeddedBrowserPages: [{
        tabId: "browser-agent-1",
        address: "https://example.com",
        titleHint: "Example"
      }],
      closeEmbeddedBrowserTab,
      desktopApi: {
        workbenchObservation: {
          registerHandler: (nextHandler: ObservationHandler) => {
            registered.current = nextHandler;
            return () => undefined;
          }
        }
      } as never
    });
    const handler = registered.current;
    if (handler === null) {
      throw new Error("bridge handler was not registered");
    }
    const closed = await handler({
      requestId: "req-embedded-close",
      method: "workbench.tab.close_local",
      payload: { tabId: "browser-agent-1" }
    });
    expect(closeEmbeddedBrowserTab).toHaveBeenCalledWith("browser-agent-1");
    expect(closed).toMatchObject({
      ok: true,
      result: {
        tabId: "browser-agent-1",
        closed: true
      }
    });
    expect(tabsModel.closeTab).not.toHaveBeenCalled();
  });
});
