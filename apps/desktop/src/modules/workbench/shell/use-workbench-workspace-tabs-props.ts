import { useCallback, useMemo } from "react";

import type { BrowserTabStripProps } from "../browser-tabs/tab-strip";
import type { ResolvedIdentityIcon } from "../identity";
import type { WorkbenchSplitTriggerMode } from "../preferences";
import type { WorkspaceTabsInteractionPolicy } from "../interaction-policy";
import type { WorkspaceTab, WorkspaceTabsModel } from "../workspace-tabs";
import type { TerminalWorkspaceActions } from "./use-terminal-workspace-actions";
import type { WorkbenchActionApi } from "./use-workbench-action-api";

export type WorkbenchWorkspaceTabsLabels = {
  readonly goBackLabel: string;
  readonly goForwardLabel: string;
  readonly openNewTabLabel: string;
  readonly closeTabLabel: string;
};

type UseWorkbenchWorkspaceTabsPropsArgs = {
  readonly tabsModel: WorkspaceTabsModel;
  readonly terminalIdentityByTabId?: Readonly<Record<string, ResolvedIdentityIcon>>;
  readonly workspaceAppIdentityByTabId?: Readonly<Record<string, ResolvedIdentityIcon>>;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly labels: WorkbenchWorkspaceTabsLabels;
  readonly splitTriggerMode: WorkbenchSplitTriggerMode;
  readonly interactionPolicy: WorkspaceTabsInteractionPolicy;
  readonly terminalWorkspaceActions: TerminalWorkspaceActions;
  readonly workbenchActions: Pick<WorkbenchActionApi, "openNewTab">;
  readonly onGoBack: () => void;
  readonly onGoForward: () => void;
};

export const useWorkbenchWorkspaceTabsProps = ({
  tabsModel,
  terminalIdentityByTabId,
  workspaceAppIdentityByTabId,
  canGoBack,
  canGoForward,
  labels,
  splitTriggerMode,
  interactionPolicy,
  terminalWorkspaceActions,
  workbenchActions,
  onGoBack,
  onGoForward
}: UseWorkbenchWorkspaceTabsPropsArgs): BrowserTabStripProps => {
  const onTabContextMenu = useCallback(
    (tab: WorkspaceTab, anchorX: number, anchorY: number): void => {
      if (tab.pageKind !== "terminal") {
        return;
      }
      terminalWorkspaceActions.onWorkspaceTabContextMenu(tab.id, anchorX, anchorY);
    },
    [terminalWorkspaceActions]
  );

  const onDropTerminalDockTab = useCallback(
    (request: { readonly terminalTabId: string; readonly targetIndex: number }): void => {
      terminalWorkspaceActions.openTerminalTabInWorkspace(
        request.terminalTabId,
        request.targetIndex
      );
    },
    [terminalWorkspaceActions]
  );

  return useMemo(
    () => ({
      tabs: tabsModel.tabs,
      ...(terminalIdentityByTabId === undefined ? {} : { terminalIdentityByTabId }),
      ...(workspaceAppIdentityByTabId === undefined ? {} : { workspaceAppIdentityByTabId }),
      splitGroupTabIds: tabsModel.splitGroupTabIds,
      activeTabId: tabsModel.activeTabId,
      goBackLabel: labels.goBackLabel,
      goForwardLabel: labels.goForwardLabel,
      canGoBack,
      canGoForward,
      openNewTabLabel: labels.openNewTabLabel,
      closeTabLabel: labels.closeTabLabel,
      splitTriggerMode,
      interactionPolicy,
      isTabInSplit: tabsModel.isTabInSplit,
      onGoBack,
      onGoForward,
      onTabContextMenu,
      onActivateTab: tabsModel.setActiveTab,
      onCloseTab: terminalWorkspaceActions.onBrowserTabClose,
      onOpenNewTab: workbenchActions.openNewTab,
      onDropTerminalDockTab,
      onReorderTabs: tabsModel.reorderTab,
      onSplitTabs: tabsModel.splitTabWithTarget,
      onDetachTabFromSplit: tabsModel.detachTabFromSplit
    }),
    [
      canGoBack,
      canGoForward,
      interactionPolicy,
      labels,
      onDropTerminalDockTab,
      onGoBack,
      onGoForward,
      onTabContextMenu,
      splitTriggerMode,
      tabsModel,
      terminalIdentityByTabId,
      terminalWorkspaceActions.onBrowserTabClose,
      workspaceAppIdentityByTabId,
      workbenchActions.openNewTab
    ]
  );
};
