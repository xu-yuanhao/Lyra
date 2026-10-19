import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { CLASSIC_WORKBENCH_INTERACTION_POLICIES } from "../../interaction-policy";
import {
  createSearchTabWithId,
  createTerminalTabWithId
} from "../../workspace-tabs/tab-factory";
import type { WorkspaceTabsModel } from "../../workspace-tabs";
import type { TerminalWorkspaceActions } from "../use-terminal-workspace-actions";
import { useWorkbenchWorkspaceTabsProps } from "../use-workbench-workspace-tabs-props";

const testConfig = {
  homeTabTitle: "Home",
  settingsTabTitle: "Settings",
  homeSearchAddress: "lyra://search",
  maxSearchTitleLength: 12
};

const createTabsModel = (): WorkspaceTabsModel => {
  const firstTab = createSearchTabWithId("browser-tab-1", testConfig);
  const secondTab = createSearchTabWithId("browser-tab-2", testConfig);

  return {
    tabs: [firstTab, secondTab],
    activeTabId: firstTab.id,
    activeTab: firstTab,
    splitGroupTabIds: [],
    focusedSplitTabId: null,
    setActiveTab: vi.fn(),
    reorderTab: vi.fn(),
    splitTabWithTarget: vi.fn(),
    replaceSplitGroup: vi.fn(),
    detachTabFromSplit: vi.fn(),
    isTabInSplit: vi.fn(() => false),
    getVisibleWorkspaceLayout: vi.fn(() => ({
      mode: "single" as const,
      activeTabId: firstTab.id,
      visibleTabIds: [firstTab.id],
      splitGroupTabIds: [],
      focusedSplitTabId: null
    })),
    snapshotWorkspaceSession: vi.fn(() => ({
      schemaVersion: 1 as const,
      tabs: [firstTab, secondTab],
      activeTabId: firstTab.id,
      splitGroupTabIds: [],
      focusedSplitTabId: null
    })),
    restoreWorkspaceSession: vi.fn(),
    openNewTab: vi.fn(),
    openSettingsTab: vi.fn(),
    openTerminalTab: vi.fn(),
    openAppTab: vi.fn(),
    updateAppTabMeta: vi.fn(),
    closeTerminalTab: vi.fn(),
    openPageInNewTab: vi.fn(),
    closeTab: vi.fn(),
    updatePageMeta: vi.fn(),
    syncPageRuntimeState: vi.fn(),
    openWebSearchTabs: vi.fn(() => [firstTab.id]),
    navigateResolvedInput: vi.fn(() => firstTab.id),
    updateActiveInput: vi.fn(),
    commitActiveInput: vi.fn()
  };
};

const createTerminalWorkspaceActions = (): TerminalWorkspaceActions => ({
  openTerminalTabInWorkspace: vi.fn(),
  openTerminalTabInDock: vi.fn(),
  closeTerminalTabEverywhere: vi.fn(),
  openDockTabContextMenu: vi.fn(),
  onWorkspaceTabContextMenu: vi.fn(),
  onBrowserTabClose: vi.fn()
});

describe("useWorkbenchWorkspaceTabsProps", () => {
  test("builds adapter props and routes workspace tab actions", () => {
    const tabsModel = createTabsModel();
    const terminalWorkspaceActions = createTerminalWorkspaceActions();
    const openNewTab = vi.fn();
    const onGoBack = vi.fn();
    const onGoForward = vi.fn();

    const { result } = renderHook(() => {
      return {
        props: useWorkbenchWorkspaceTabsProps({
          tabsModel,
          canGoBack: true,
          canGoForward: false,
          labels: {
            goBackLabel: "Back",
            goForwardLabel: "Forward",
            openNewTabLabel: "New tab",
            closeTabLabel: "Close tab"
          },
          splitTriggerMode: "ctrl_left_drag",
          interactionPolicy: CLASSIC_WORKBENCH_INTERACTION_POLICIES.workspaceTabs,
          terminalWorkspaceActions,
          workbenchActions: { openNewTab },
          onGoBack,
          onGoForward
        })
      };
    });

    expect(result.current.props.canGoBack).toBe(true);
    expect(result.current.props.canGoForward).toBe(false);

    result.current.props.onGoBack();
    result.current.props.onGoForward();
    result.current.props.onActivateTab("browser-tab-2");
    result.current.props.onCloseTab("browser-tab-1");
    result.current.props.onOpenNewTab();
    result.current.props.onReorderTabs?.("browser-tab-1", 2);
    result.current.props.onSplitTabs?.("browser-tab-2", "browser-tab-1");
    result.current.props.onDetachTabFromSplit?.("browser-tab-2");
    result.current.props.onDropTerminalDockTab?.({
      terminalTabId: "terminal-tab-1",
      targetIndex: 3
    });

    expect(onGoBack).toHaveBeenCalledTimes(1);
    expect(onGoForward).toHaveBeenCalledTimes(1);
    expect(tabsModel.setActiveTab).toHaveBeenCalledWith("browser-tab-2");
    expect(terminalWorkspaceActions.onBrowserTabClose).toHaveBeenCalledWith(
      "browser-tab-1"
    );
    expect(openNewTab).toHaveBeenCalledTimes(1);
    expect(tabsModel.reorderTab).toHaveBeenCalledWith("browser-tab-1", 2);
    expect(tabsModel.splitTabWithTarget).toHaveBeenCalledWith(
      "browser-tab-2",
      "browser-tab-1"
    );
    expect(tabsModel.detachTabFromSplit).toHaveBeenCalledWith("browser-tab-2");
    expect(terminalWorkspaceActions.openTerminalTabInWorkspace).toHaveBeenCalledWith(
      "terminal-tab-1",
      3
    );
  });

  test("only opens workspace tab context menus for terminal tabs", () => {
    const tabsModel = createTabsModel();
    const terminalWorkspaceActions = createTerminalWorkspaceActions();
    const searchTab = createSearchTabWithId("browser-tab-1", testConfig);
    const terminalTab = createTerminalTabWithId(
      "browser-tab-3",
      "terminal-tab-1",
      "Terminal"
    );

    const { result } = renderHook(() => {
      return useWorkbenchWorkspaceTabsProps({
        tabsModel,
        canGoBack: false,
        canGoForward: false,
        labels: {
          goBackLabel: "Back",
          goForwardLabel: "Forward",
          openNewTabLabel: "New tab",
          closeTabLabel: "Close tab"
        },
        splitTriggerMode: "ctrl_left_drag",
        interactionPolicy: CLASSIC_WORKBENCH_INTERACTION_POLICIES.workspaceTabs,
        terminalWorkspaceActions,
        workbenchActions: { openNewTab: vi.fn() },
        onGoBack: vi.fn(),
        onGoForward: vi.fn()
      });
    });

    expect(result.current.canGoBack).toBe(false);
    expect(result.current.canGoForward).toBe(false);

    result.current.onTabContextMenu?.(searchTab, 10, 20);
    expect(terminalWorkspaceActions.onWorkspaceTabContextMenu).not.toHaveBeenCalled();

    result.current.onTabContextMenu?.(terminalTab, 30, 40);
    expect(terminalWorkspaceActions.onWorkspaceTabContextMenu).toHaveBeenCalledWith(
      "browser-tab-3",
      30,
      40
    );
  });
});
