import {
  useCallback,
  useMemo
} from "react";

import { ContextMenuHost } from "../context-menu";
import { GlobalDialogHost } from "../global-dialog";
import { useWorkbenchSystemNotificationActivation } from "./use-workbench-system-notifications";
import { useWorkbenchEditorReviewModel } from "./use-workbench-editor-review-model";
import { useTitlebarElementPickerModel } from "./use-titlebar-element-picker-model";
import { useTitlebarNavigationModel } from "./use-titlebar-navigation-model";
import { useWorkspaceSurfaceRouterProps } from "./use-workspace-surface-router-props";
import { useWorkbenchWorkspaceTabsProps } from "./use-workbench-workspace-tabs-props";
import { useWorkbenchAiLaunchProps } from "./use-workbench-ai-launch-props";
import { useWorkbenchEmptyAppTabGuards } from "./use-workbench-empty-app-tab-guards";
import { useWorkbenchShellSlots } from "./use-workbench-shell-slots";
import { useWorkbenchShellAdapterProps } from "./use-workbench-shell-adapter-props";
import {
  WorkbenchChromeNavigationControl,
  WorkbenchChromeToolbarContextSlot,
  WorkbenchTitlebarContextProvider
} from "./workbench-chrome-ui";
import { TitlebarElementPickerButton } from "./titlebar-element-picker-button";
import { AgentBrowserActivityOverlay } from "./agent-browser-activity-overlay";
import { AGENT_PROJECT_TREE_APP_ID } from "../agent-project-tree";
import { useProjectTreeOmniboxSearch } from "../agent-project-tree/use-omnibox-search";
import {
  clearDockProblemsSelection,
  closeDockProblemsTab,
  openDockProblemsTab,
  selectDockProblemsTab,
  useDockProblems
} from "../bottom-aux/dock-problems";
import type { FileEditorRevealLocation } from "../file-editor";
import { promoteAgentBrowserPreviewTab } from "../ai-panel/lyra-agents/hooks/agent-browser-preview-workspace";

type WorkbenchShellStageProps = Record<string, any>;

export const WorkbenchShellStage = ({
  activeBrowserTabId,
  activeFileEditorState,
  activeFileManagerState,
  activePageRuntimeState,
  activeTab,
  activeTabPageKind,
  agentHistoryLocateRequest,
  agentHistoryRefreshRequestKey,
  agentHistoryBrowserPreviewTabId,
  agentPlanBoardModel,
  agentSubagentModel,
  agentProjectTreeModel,
  aiSessionTabsModel,
  beginBrowserLayoutAnimationSync,
  browserAgentVisualState,
  browserHistoryEntries,
  browserSearchModel,
  contextMenuModel,
  desktopApi,
  fileEditorModel,
  fileManagerModel,
  globalDialogModel,
  historyAppSuggestionLabels,
  imageViewerModel,
  isFullScreen,
  isMaximized,
  labels,
  locale,
  notificationModel,
  notificationNavigation,
  onGoBack,
  onGoForward,
  onOpenAgentGit,
  onOpenAgentSubagent,
  onOpenFileFromManager,
  onReload,
  onRevealPathInFileManager,
  onRootDragStartCapture,
  openDirectoryFromNavigation,
  openSettingsSectionFromCapability,
  pageNavigationState,
  parkedAgentBrowserPages,
  panelLayoutModel,
  preferencesModel,
  refreshBrowserHistoryEntries,
  registerPageHost,
  resolveActiveEditorWorkItem,
  resolveFileManagerChooser,
  resolvedThemeId,
  rootClassName,
  rootRef,
  rootStyle,
  searchSettingsFacade,
  setAgentHistoryLocateRequest,
  setAgentHistoryBrowserPreviewPage,
  setAgentHistoryRefreshRequestKey,
  settingsSurfaceProps,
  sidebarAiSurfaceProps,
  softwareCapabilities,
  t,
  tabsModel,
  terminalIdentityByTabId,
  terminalModel,
  terminalWorkspaceActions,
  uiRuntime,
  visibleWorkspaceLayout,
  workbenchActions,
  workbenchChromeLabels,
  workspaceAppIdentityByTabId,
  composerCitationSinkRef,
  onRunTerminalCommand
}: WorkbenchShellStageProps) => {
  const {
    editorReviewItems,
    activeEditorReviewIndex,
    resolveActiveEditorWorkItem: resolveEditorWorkItem,
    onGoToPreviousEditorWorkItem,
    onGoToNextEditorWorkItem,
    onAcceptAllEditorWorkItems,
    onAcceptEditorWorkItem,
    onRejectEditorWorkItem,
    onUndoEditorWorkItem
  } = useWorkbenchEditorReviewModel({
    desktopApi,
    onOpenFileFromManager
  });
  const titlebarNavigation = useTitlebarNavigationModel({
    desktopApi,
    activeTab,
    activePageRuntimeState,
    activeFileEditorState,
    activeFileManagerState,
    tabsModel,
    searchEngines: searchSettingsFacade.integratedSearchEngines,
    autoSearchEngines: searchSettingsFacade.activeSearchEngines,
    omniboxNonBrowserSubmitTarget:
      preferencesModel.preferences.omniboxNonBrowserSubmitTarget,
    placeholder: t("navigation.titlebarPlaceholder"),
    ariaLabel: t("navigation.titlebarAriaLabel"),
    submitLabel: t("navigation.submitAction"),
    reloadLabel: t("navigation.reloadAction"),
    addFavoriteLabel: labels.fileManager.addFavorite,
    removeFavoriteLabel: labels.fileManager.removeFavorite,
    onReload,
    historyAppPlaceholder: labels.agentSessionHistory.searchPlaceholder,
    historyAppSuggestionLabels,
    onHistoryAppReload: () => {
      refreshBrowserHistoryEntries();
      setAgentHistoryRefreshRequestKey((current: number) => current + 1);
    },
    onHistoryAppSuggestionSelect: (target: unknown) => {
      setAgentHistoryLocateRequest((current: { requestKey?: number } | null) => ({
        requestKey: (current?.requestKey ?? 0) + 1,
        target
      }));
    },
    onOpenFilePath: (path: string) => onOpenFileFromManager(path),
    onOpenDirectoryPath: openDirectoryFromNavigation,
    onRunTerminalCommand
  });
  const activeProjectTreeInstanceId =
    activeTab?.pageKind === "app" && activeTab.appId === AGENT_PROJECT_TREE_APP_ID
      ? activeTab.appInstanceId
      : undefined;
  const activeProjectTreeRoot = activeProjectTreeInstanceId === undefined
    ? null
    : agentProjectTreeModel.getState(activeProjectTreeInstanceId)?.rootPath
      ?? activeTab?.filePath
      ?? null;
  useProjectTreeOmniboxSearch({
    desktopApi,
    instanceId: activeProjectTreeInstanceId,
    rootPath: activeProjectTreeRoot,
    query: titlebarNavigation.value
  });
  const titlebarElementPicker = useTitlebarElementPickerModel({
    desktopApi,
    activeTab,
    enableLabel: t("navigation.elementPickerEnable"),
    disableLabel: t("navigation.elementPickerDisable"),
    activeLabel: t("navigation.elementPickerActive"),
    inspectLabel: t("navigation.elementPickerInspect"),
    layoutLabel: t("navigation.elementPickerLayout")
  });
  const aiLaunchProps = useWorkbenchAiLaunchProps(t);
  const sidebarAiSurfacePropsWithFileOpen = sidebarAiSurfaceProps === null ? null : {
    ...sidebarAiSurfaceProps,
    composerCitationSinkRef,
    onSetActiveBrowserTab: (tabId: string): boolean => {
      if (promoteAgentBrowserPreviewTab(tabId)) {
        return true;
      }
      if (tabsModel.tabs.some((tab: { readonly id: string }) => tab.id === tabId)) {
        tabsModel.setActiveTab(tabId);
        return true;
      }
      return false;
    },
    activeSessionTabId: aiSessionTabsModel.activeTabId,
    activeSessionId: aiSessionTabsModel.activeSessionId,
    sessionTabs: aiSessionTabsModel.tabs,
    onActiveSessionChange: aiSessionTabsModel.activateSession,
    onActivateSessionTab: aiSessionTabsModel.activateSession,
    onCloseSessionTab: aiSessionTabsModel.closeSession,
    onReorderSessionTabs: aiSessionTabsModel.reorderSessionTabs,
    onCreateDraftSessionTab: aiSessionTabsModel.createDraftSession,
    onCreateSessionTab: aiSessionTabsModel.createSession,
    onMissingSession: aiSessionTabsModel.removeSession,
    onUpdateDraftWorkingDir: aiSessionTabsModel.setDraftWorkingDir,
    onSessionSnapshotChange: aiSessionTabsModel.upsertSnapshot
  };
  useWorkbenchEmptyAppTabGuards({
    tabsModel,
    notificationCount: notificationModel.notifications.length
  });

  const {
    onOpenNotificationCenter,
    onOpenNotificationPreview,
    onOpenNotificationSource,
    onRequestClearNotifications
  } = notificationNavigation;

  useWorkbenchSystemNotificationActivation({
    desktopApi,
    notificationModel,
    onOpenNotificationCenter,
    onOpenNotificationSource
  });

  const onOpenAgentSession = useCallback((sessionId: string): void => {
    const trimmedSessionId = sessionId.trim();
    if (trimmedSessionId.length === 0) {
      return;
    }
    aiSessionTabsModel.openSession(trimmedSessionId);
    if (!panelLayoutModel.isLeftPanelVisible) {
      beginBrowserLayoutAnimationSync();
      panelLayoutModel.toggleLeftPanel();
    }
  }, [
    aiSessionTabsModel,
    beginBrowserLayoutAnimationSync,
    panelLayoutModel
  ]);
  const onCreateProjectSession = useCallback((workingDir: string): void => {
    const trimmedWorkingDir = workingDir.trim();
    aiSessionTabsModel.createDraftSession(
      trimmedWorkingDir.length === 0
        ? {}
        : { workingDir: trimmedWorkingDir }
    );
    if (!panelLayoutModel.isLeftPanelVisible) {
      beginBrowserLayoutAnimationSync();
      panelLayoutModel.toggleLeftPanel();
    }
  }, [
    aiSessionTabsModel,
    beginBrowserLayoutAnimationSync,
    panelLayoutModel
  ]);
  const onOpenFavoriteFromFileManager = useCallback((favorite: {
    readonly kind?: string;
    readonly url?: string;
    readonly path: string;
    readonly title: string;
    readonly sessionId?: string;
  }): void => {
    if (favorite.kind === "web") {
      const url = (favorite.url ?? favorite.path).trim();
      if (url.length > 0) {
        tabsModel.openPageInNewTab(url, favorite.title);
      }
      return;
    }
    if (favorite.kind === "agent-session") {
      onOpenAgentSession(favorite.sessionId ?? favorite.path.replace(/^agent-session:/u, ""));
    }
  }, [onOpenAgentSession, tabsModel]);

  const dockProblems = useDockProblems();
  const onOpenProjectProblems = useCallback((request: {
    readonly instanceId: string;
    readonly title: string;
    readonly rootPath: string;
  }): void => {
    openDockProblemsTab(request);
    if (!panelLayoutModel.isBottomPanelVisible) {
      panelLayoutModel.toggleBottomPanel();
    }
  }, [panelLayoutModel]);

  const workspaceSurfaceProps = useWorkspaceSurfaceRouterProps({
    activeTab,
    activePageRuntimeState,
    tabsModel,
    browserSearchModel,
    searchEngines: searchSettingsFacade.integratedSearchEngines,
    autoSearchEngines: searchSettingsFacade.activeSearchEngines,
    engineById: searchSettingsFacade.engineById,
    onPageHostChange: registerPageHost,
    terminalModel,
    desktopApi,
    resolvedThemeId,
    fileManagerModel,
    resolveFileManagerChooser,
    fileEditorModel,
    imageViewerModel,
    agentProjectTreeModel,
    agentPlanBoardModel,
    agentSubagentModel,
    activeEditorReviewIndex,
    editorReviewItems,
    resolveActiveEditorWorkItem: resolveActiveEditorWorkItem ?? resolveEditorWorkItem,
    onGoToPreviousEditorWorkItem,
    onGoToNextEditorWorkItem,
    onAcceptAllEditorWorkItems,
    onAcceptEditorWorkItem,
    onRejectEditorWorkItem,
    onUndoEditorWorkItem,
    preferencesModel,
    settings: settingsSurfaceProps,
    onOpenSettingsSection: openSettingsSectionFromCapability,
    labels,
    softwareCapabilities,
    onOpenFileFromManager,
    onOpenFavoriteFromFileManager,
    onRevealPathInFileManager,
    onOpenAgentGit,
    onOpenProjectProblems,
    onOpenAgentSubagent,
    agentSessionHistory: {
      labels: labels.agentSessionHistory,
      activeSessionId: aiSessionTabsModel.activeSessionId,
      onOpenSession: onOpenAgentSession,
      onCreateProjectSession,
      onSessionDeleted: aiSessionTabsModel.removeSession,
      openDialog: globalDialogModel.openDialog,
      query: activeTab?.pageKind === "app" && activeTab.appId === "agent-session-history"
        ? activeTab.inputValue
        : "",
      refreshRequestKey: agentHistoryRefreshRequestKey,
      locateRequest: agentHistoryLocateRequest,
      browserHistory: browserHistoryEntries,
      browserHistoryPreviewPageId: agentHistoryBrowserPreviewTabId,
      onBrowserHistoryPreviewChange: setAgentHistoryBrowserPreviewPage,
      onBrowserHistoryPreviewHostChange: registerPageHost,
      onOpenBrowserHistoryEntry: (entry: { url: string; title: string }) => {
        tabsModel.openPageInNewTab(entry.url, entry.title);
      },
      locale
    }
  });
  const isMac = desktopApi?.appMeta.platform === "darwin";
  const workbenchPresentationState = useMemo(
    () => ({
      isMac,
      isMaximized,
      isFullScreen,
      isAiPanelVisible: panelLayoutModel.isLeftPanelVisible,
      isTerminalPanelVisible: panelLayoutModel.isBottomPanelVisible,
      terminalPanelSide: panelLayoutModel.terminalPanelSide
    }),
    [
      isMac,
      isFullScreen,
      isMaximized,
      panelLayoutModel
    ]
  );
  const AiPanelAdapter = uiRuntime.adapters.aiPanel;
  const ShellAdapter = uiRuntime.adapters.shell;
  const TerminalDockAdapter = uiRuntime.adapters.terminalDock;
  const WorkspaceSurfaceAdapter = uiRuntime.adapters.workspaceSurface;
  const WorkspaceTabsAdapter = uiRuntime.adapters.workspaceTabs;
  const workspaceTabsLabels = useMemo(
    () => ({
      goBackLabel: t("browser.goBack"),
      goForwardLabel: t("browser.goForward"),
      openNewTabLabel: t("browser.openNewTab"),
      closeTabLabel: t("browser.closeTab")
    }),
    [t]
  );
  const fileManagerNavigationInstanceId =
    activeTab?.pageKind === "app" && activeTab.appId === "file-manager"
      ? activeTab.appInstanceId
      : undefined;
  const navigationCanGoBack = fileManagerNavigationInstanceId === undefined
    ? pageNavigationState.canGoBack
    : (activeFileManagerState?.historyIndex ?? 0) > 0;
  const navigationCanGoForward = fileManagerNavigationInstanceId === undefined
    ? pageNavigationState.canGoForward
    : activeFileManagerState !== null
      && activeFileManagerState !== undefined
      && activeFileManagerState.historyIndex >= 0
      && activeFileManagerState.historyIndex < activeFileManagerState.history.length - 1;
  const navigationGoBack = useCallback((): void => {
    if (fileManagerNavigationInstanceId === undefined) {
      onGoBack();
      return;
    }
    void fileManagerModel.goBack(fileManagerNavigationInstanceId);
  }, [fileManagerModel, fileManagerNavigationInstanceId, onGoBack]);
  const navigationGoForward = useCallback((): void => {
    if (fileManagerNavigationInstanceId === undefined) {
      onGoForward();
      return;
    }
    void fileManagerModel.goForward(fileManagerNavigationInstanceId);
  }, [fileManagerModel, fileManagerNavigationInstanceId, onGoForward]);
  const workspaceTabsProps = useWorkbenchWorkspaceTabsProps({
    tabsModel,
    terminalIdentityByTabId,
    workspaceAppIdentityByTabId,
    canGoBack: navigationCanGoBack,
    canGoForward: navigationCanGoForward,
    labels: workspaceTabsLabels,
    splitTriggerMode: preferencesModel.preferences.splitTriggerMode,
    interactionPolicy: uiRuntime.interactions.workspaceTabs,
    terminalWorkspaceActions,
    workbenchActions,
    onGoBack: navigationGoBack,
    onGoForward: navigationGoForward
  });
  const notificationTopbarProps = useMemo(
    () => ({
      labels: labels.notificationTopbar,
      notificationCount: notificationModel.notifications.length,
      unreadCount: notificationModel.unreadCount,
      preview: notificationModel.topbarPreview,
      onOpenCenter: onOpenNotificationCenter,
      onOpenPreview: onOpenNotificationPreview
    }),
    [
      labels.notificationTopbar,
      notificationModel.notifications.length,
      notificationModel.topbarPreview,
      notificationModel.unreadCount,
      onOpenNotificationCenter,
      onOpenNotificationPreview
    ]
  );
  const onOpenBottomAuxFile = useCallback(
    (
      filePath: string,
      location?: FileEditorRevealLocation,
      treeInstanceId?: string
    ) => {
      const treeTab = tabsModel.tabs.find(
        (tab: { readonly pageKind: string; readonly appId?: string; readonly appInstanceId?: string; readonly id: string }) =>
          tab.pageKind === "app" &&
          tab.appId === AGENT_PROJECT_TREE_APP_ID &&
          tab.appInstanceId !== undefined &&
          (treeInstanceId === undefined || tab.appInstanceId === treeInstanceId)
      );
      if (treeTab?.appInstanceId !== undefined) {
        void agentProjectTreeModel.openFile(treeTab.appInstanceId, filePath, location);
        tabsModel.setActiveTab(treeTab.id);
        return;
      }
      onOpenFileFromManager(filePath, location);
    },
    [agentProjectTreeModel, onOpenFileFromManager, tabsModel]
  );
  const workbenchChromeSlots = useWorkbenchShellSlots({
    titlebarNavigation: null,
    titlebarContext: null,
    leftPanel: sidebarAiSurfacePropsWithFileOpen === null ? null : (
      <AiPanelAdapter {...sidebarAiSurfacePropsWithFileOpen} />
    ),
    workspace: (
      <>
        <WorkspaceSurfaceAdapter
          {...workspaceSurfaceProps}
          surfaceAdapters={uiRuntime.adapters.surfaces}
        />
        <AgentBrowserActivityOverlay
          state={browserAgentVisualState}
        />
      </>
    ),
    browserTabs: (
      <WorkspaceTabsAdapter
        {...workspaceTabsProps}
        agentActiveTabId={browserAgentVisualState.active ? browserAgentVisualState.tabId : null}
        toolbarContextControl={
          <WorkbenchChromeToolbarContextSlot
            activeTabId={activeTab?.id ?? null}
          />
        }
        navigationControl={
          <WorkbenchChromeNavigationControl
            activeTabId={activeTab?.id ?? null}
            {...titlebarNavigation}
            activeBrowserTabId={activeBrowserTabId}
            browserChromePopoverBridge={desktopApi?.browserShell}
            trailingControl={
              titlebarElementPicker.visible ? (
                <TitlebarElementPickerButton
                  active={titlebarElementPicker.enabled}
                  mode={titlebarElementPicker.mode}
                  ariaLabel={titlebarElementPicker.ariaLabel}
                  activeDescription={titlebarElementPicker.activeDescription}
                  onToggle={titlebarElementPicker.onToggle}
                />
              ) : undefined
            }
          />
        }
      />
    ),
    terminalPanel: (
      <TerminalDockAdapter
        desktopApi={desktopApi}
        labels={labels.terminal}
        themeSignature={[
          resolvedThemeId,
          desktopApi?.appMeta.windowMaterialMode ?? "opaque",
          preferencesModel.preferences.windowMaterialEnabled ? "material" : "solid"
        ].join(":")}
        uiThemeId={resolvedThemeId}
        model={terminalModel}
        terminalIdentityByTabId={terminalIdentityByTabId}
        terminalPanelSide={panelLayoutModel.terminalPanelSide}
        onRequestCloseTab={terminalWorkspaceActions.closeTerminalTabEverywhere}
        onRequestTabContextMenu={(request: { tabId: string; anchorX: number; anchorY: number }) => {
          terminalWorkspaceActions.openDockTabContextMenu(
            request.tabId,
            request.anchorX,
            request.anchorY
          );
        }}
        onToggleTerminalPanelSide={workbenchActions.toggleTerminalPanelSide}
        onDropWorkspaceTerminalTab={terminalWorkspaceActions.openTerminalTabInDock}
        problems={{
          tabs: dockProblems.tabs,
          activeId: dockProblems.activeId,
          labels: {
            list: labels.bottomAux.problems,
            empty: labels.bottomAux.problemsEmpty
          },
          onSelectTab: selectDockProblemsTab,
          onCloseTab: closeDockProblemsTab,
          onClearSelection: clearDockProblemsSelection,
          onOpenFile: onOpenBottomAuxFile
        }}
      />
    ),
    overlays: (
      <>
        {(Array.isArray(parkedAgentBrowserPages) ? parkedAgentBrowserPages : [])
          .filter((page: { readonly tabId: string }) =>
            tabsModel.tabs.some((tab: { readonly id: string }) => tab.id === page.tabId) === false
          )
          .map((page: { readonly tabId: string }) => (
            <div
              key={page.tabId}
              ref={(element) => {
                registerPageHost(page.tabId, element);
              }}
              className="lyra-agent-browser-parked-page-host"
              data-browser-page-host="true"
              data-tab-id={page.tabId}
              aria-hidden="true"
            />
          ))}
        <ContextMenuHost
          state={contextMenuModel.state}
          onClose={contextMenuModel.closeMenu}
          onSelectItem={contextMenuModel.selectItem}
        />
        <GlobalDialogHost
          state={globalDialogModel.state}
          onClose={globalDialogModel.closeDialog}
          onSelectAction={globalDialogModel.selectAction}
        />
      </>
    )
  });
  const shellAdapterProps = useWorkbenchShellAdapterProps({
    rootRef,
    rootClassName,
    rootStyle,
    uiRuntime,
    actions: workbenchActions,
    labels: workbenchChromeLabels,
    presentationState: workbenchPresentationState,
    isMac,
    panelLayoutModel,
    slots: workbenchChromeSlots,
    notificationTopbar: notificationTopbarProps,
    aiLaunch: aiLaunchProps,
    onRootDragStartCapture
  });

  return (
    <WorkbenchTitlebarContextProvider activeScopeId={visibleWorkspaceLayout.mode === "split" ? visibleWorkspaceLayout.focusedSplitTabId : visibleWorkspaceLayout.activeTabId}>
      <ShellAdapter {...shellAdapterProps} />
    </WorkbenchTitlebarContextProvider>
  );
};
