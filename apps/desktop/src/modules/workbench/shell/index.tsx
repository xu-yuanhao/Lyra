import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent
} from "react";

import { WORKBENCH_CONFIG } from "../config";
import { useContextMenuModel } from "../context-menu";
import { useGlobalDialogModel } from "../global-dialog";
import { createTranslator, useWorkbenchLocaleSnapshot } from "../i18n";
import { useWorkbenchNotificationModel } from "../notifications";
import { useWorkbenchPreferencesModel } from "../preferences";
import { useTerminalDockModel, useTerminalSessionRestore } from "../terminal-dock";
import { isAgentSessionHistoryAppId } from "../workspace-apps";
import { useWorkspaceTabsModel } from "../workspace-tabs";
import { useWorkbenchUiRuntime } from "../ui-platform";
import { cx } from "../ui-primitives";
import {
  getDesktopApi,
  syncCssVarsToDocumentRoot,
  syncDocumentThemeTone,
  syncWindowThemeSource
} from "./service";

import { useBrowserSearchModel } from "../browser-search";
import {
  useBrowserPageContextMenu,
  type ComposerCitationSink
} from "./use-browser-page-context-menu";
import { usePageDragCitationBridge } from "./use-page-drag-citation-bridge";
import { readBrowserHistoryEntries } from "../browser-history/service";
import { useWorkbenchAiSessionTabs } from "../ai-panel/session-tabs";
import { useAgentPlanBoardModel } from "../agent-plan-board";
import { useAgentSubagentModel } from "../agent-subagent";
import type { BrowserSettingsCategoryFocusRequest } from "../browser-tabs/settings-surface";
import {
  type AgentSessionHistoryBrowserPreviewPage,
  type AgentSessionHistoryLocateRequest
} from "../agent-session-history";
import { useBrowserLayoutAnimationSync } from "./use-browser-layout-animation-sync";
import { useDownloadNotifications } from "./use-download-notifications";
import { useLspNotifications } from "./use-lsp-notifications";
import { useWorkspaceProblemScan } from "./use-workspace-problem-scan";
import { useWorkbenchActiveAppContext } from "./use-workbench-active-app-context";
import { useWorkbenchAppRestoration } from "./use-workbench-app-restoration";
import { useWorkbenchBrowserRuntime, type EmbeddedBrowserPageDescriptor } from "./use-workbench-browser-runtime";
import {
  destroyAgentBrowserPreviewWatch,
  promoteAgentBrowserPreviewTab,
  registerAgentBrowserPreviewWorkspace
} from "../ai-panel/lyra-agents/hooks/agent-browser-preview-workspace";
import {
  createWorkbenchChromeLabels,
  useWorkbenchActionApi
} from "./use-workbench-action-api";
import { applyPanelLayoutCssVars } from "./panel-layout-shell-vars";
import { usePanelLayoutModel } from "./use-panel-layout";
import { useOpenTerminalLiveSession } from "./use-open-terminal-live-session";
import { useSoftwareStoreBuiltinAppOpener } from "./use-software-store-builtin-app-opener";
import { useScrollbarVisibilityGuard } from "./use-scrollbar-visibility-guard";
import { useTerminalWorkspaceActions } from "./use-terminal-workspace-actions";
import { useTerminalIdentityProjection } from "./use-terminal-identity-projection";
import { useWorkspaceAppIdentityProjection } from "./use-workspace-app-identity-projection";
import { useWorkbenchFileAppModels } from "./use-workbench-file-app-models";
import { useWorkbenchFileActions } from "./use-workbench-file-actions";
import { useWorkbenchJsReplSetting } from "./use-workbench-js-repl-setting";
import { useWorkbenchLabels } from "./use-workbench-labels";
import { useWorkbenchLinuxCompatNotice } from "./use-workbench-linux-compat-notice";
import { useWorkbenchCredentialStorageNotifications } from "./use-workbench-credential-storage-notifications";
import { useWorkbenchObservationBridge } from "./use-workbench-observation-bridge";
import { useWorkbenchFileAttachChooser } from "./use-workbench-file-attach-chooser";
import { useWorkbenchDirectoryChooser } from "./use-workbench-directory-chooser";
import { useWorkbenchSearchSettings } from "./use-workbench-search-settings";
import { useWorkbenchAgentAppOpeners } from "./use-workbench-agent-app-openers";
import { useAgentProtocolContractCheck } from "./use-agent-protocol-contract-check";
import { useWorkbenchSettingsSurfaceProps } from "./use-workbench-settings-surface-props";
import { useWorkbenchSidebarAiSurfaceProps } from "./use-workbench-sidebar-ai-surface-props";
import { useSoftwareCapabilitiesRegistry } from "../software-capabilities";
import { buildProviderRouteNotification, useWorkbenchProviderFaultNotifications } from "./use-workbench-provider-fault-notifications";
import { useWorkbenchAppUpdateNotifications } from "./use-workbench-app-update-notifications";
import { useWorkbenchProductAnnouncements } from "./use-workbench-product-announcements";
import {
  useWorkbenchSystemNotificationPermissionGuard,
  useWorkbenchSystemNotificationPublisher
} from "./use-workbench-system-notifications";
import { useWorkbenchThemeRuntime } from "./use-workbench-theme-runtime";
import { useWorkbenchWindowState } from "./use-workbench-window-state";
import {
  useFilesFavoriteOpener,
  useWorkspaceAgentCommandBus,
  useWorkspaceCoreCommandBus
} from "./workspace-command-buses";
import { useWorkbenchNotificationNavigation } from "./use-workbench-notification-navigation";
import {
  normalizeUiFontSizePx,
  resolveMaterialThemeVars,
  type WorkbenchThemeVars
} from "../theme";
import { createInitialWorkbenchPreferences, createWorkbenchBrowserTabsConfig } from "./workbench-shell-defaults";
import { WorkbenchShellStage } from "./workbench-shell-stage";

const WORKBENCH_BROWSER_LAYOUT_ANIMATION_MS = 260;
const WORKBENCH_BROWSER_LAYOUT_ANIMATION_SYNC_INTERVAL_MS = 33;
const AGENT_HISTORY_BROWSER_PREVIEW_TAB_ID = "lyra-agent-history-browser-preview";

type WorkbenchShellProps = {
  readonly onSignedOut?: () => void;
};

export const WorkbenchShell = ({ onSignedOut = () => undefined }: WorkbenchShellProps) => {
  const desktopApi = getDesktopApi();
  useAgentProtocolContractCheck(desktopApi);

  const preferencesModel = useWorkbenchPreferencesModel(createInitialWorkbenchPreferences());
  const { locale, revision: localeRevision } = useWorkbenchLocaleSnapshot();
  const { jsReplEnabled, updateJsReplSetting } = useWorkbenchJsReplSetting(desktopApi);
  const [settingsFocusRequest, setSettingsFocusRequest] =
    useState<BrowserSettingsCategoryFocusRequest | null>(null);

  const { isMaximized, isFullScreen } = useWorkbenchWindowState(desktopApi);
  const aiSessionTabsModel = useWorkbenchAiSessionTabs(desktopApi);
  const [agentHistoryRefreshRequestKey, setAgentHistoryRefreshRequestKey] = useState(0);
  const [agentHistoryLocateRequest, setAgentHistoryLocateRequest] =
    useState<AgentSessionHistoryLocateRequest | null>(null);
  const [agentHistoryBrowserPreviewPage, setAgentHistoryBrowserPreviewPage] =
    useState<AgentSessionHistoryBrowserPreviewPage | null>(null);
  const [parkedAgentBrowserPages, setParkedAgentBrowserPages] = useState<
    readonly EmbeddedBrowserPageDescriptor[]
  >([]);
  const [browserHistoryEntries, setBrowserHistoryEntries] = useState(() =>
    readBrowserHistoryEntries()
  );

  const t = useMemo(
    () => createTranslator(locale),
    // Language bundles arrive asynchronously. Rebuild derived chrome labels
    // when resources change even if the selected language stays the same.
    [locale, localeRevision]
  );
  const labels = useWorkbenchLabels(t);
  const rootRef = useRef<HTMLElement | null>(null);
  const browserTabsConfig = useMemo(() => createWorkbenchBrowserTabsConfig(t), [t]);
  const browserTabsOptions = useMemo(() => ({
    splitOverflowPolicy: preferencesModel.preferences.splitOverflowPolicy,
    onCommitPageNavigation: (request: { readonly tabId: string; readonly address: string }) =>
      void desktopApi?.browser.navigate({
        tabId: request.tabId,
        address: request.address
      })
  }), [desktopApi, preferencesModel.preferences.splitOverflowPolicy]);
  const tabsModel = useWorkspaceTabsModel(browserTabsConfig, browserTabsOptions);
  const tabsModelRef = useRef(tabsModel);
  tabsModelRef.current = tabsModel;
  const parkedAgentBrowserPagesRef = useRef(parkedAgentBrowserPages);
  parkedAgentBrowserPagesRef.current = parkedAgentBrowserPages;
  useEffect(() => {
    return registerAgentBrowserPreviewWorkspace({
      parkTabIfWatched: (tabId, tab) => {
        const page: EmbeddedBrowserPageDescriptor = {
          tabId,
          address: tab.displayAddress,
          ...(tab.title.length === 0 ? {} : { titleHint: tab.title })
        };
        parkedAgentBrowserPagesRef.current = [
          ...parkedAgentBrowserPagesRef.current.filter((entry) => entry.tabId !== tabId),
          page
        ];
        setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
        return true;
      },
      ensureParked: (page) => {
        parkedAgentBrowserPagesRef.current = [
          ...parkedAgentBrowserPagesRef.current.filter((entry) => entry.tabId !== page.tabId),
          page
        ];
        setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
      },
      promoteOrActivate: (tabId) => {
        const tabs = tabsModelRef.current;
        const parked = parkedAgentBrowserPagesRef.current.find((entry) => entry.tabId === tabId);
        const unpark = (): void => {
          if (parked === undefined) {
            return;
          }
          parkedAgentBrowserPagesRef.current = parkedAgentBrowserPagesRef.current.filter(
            (entry) => entry.tabId !== tabId
          );
          setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
        };
        if (tabs.tabs.some((tab) => tab.id === tabId)) {
          tabs.setActiveTab(tabId);
          unpark();
          return true;
        }
        if (parked === undefined) {
          return false;
        }
        const opened = tabs.openPageInNewTab(
          parked.address,
          parked.titleHint,
          { tabId }
        );
        if (opened === null) {
          return false;
        }
        unpark();
        return true;
      },
      destroyWatch: (tabIds) => {
        const idSet = new Set(tabIds);
        parkedAgentBrowserPagesRef.current = parkedAgentBrowserPagesRef.current.filter(
          (entry) => idSet.has(entry.tabId) === false
        );
        setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
        for (const tabId of tabIds) {
          if (tabsModelRef.current.tabs.some((tab) => tab.id === tabId)) {
            tabsModelRef.current.closeTab(tabId);
          }
        }
      }
    });
  }, []);
  const activeTab = tabsModel.activeTab;
  const activeTabPageKind = activeTab?.pageKind ?? "search";
  const activePageTabId = activeTab?.pageKind === "page" ? activeTab.id : "";
  const activeBrowserTabId = activeTab?.pageKind === "page" ? activeTab.id : null;
  const visibleWorkspaceLayout = tabsModel.getVisibleWorkspaceLayout();
  const terminalModel = useTerminalDockModel();
  const onOpenTerminalAtDirectory = useCallback((cwd: string): void => {
    const normalizedCwd = cwd.trim();
    if (normalizedCwd.length === 0) {
      return;
    }
    const slashIndex = Math.max(normalizedCwd.lastIndexOf("/"), normalizedCwd.lastIndexOf("\\"));
    const title = slashIndex >= 0 ? normalizedCwd.slice(slashIndex + 1) || normalizedCwd : normalizedCwd;
    const { tab } = terminalModel.openTabWithPlacement({
      placement: "workspace",
      cwd: normalizedCwd,
      title
    });
    tabsModel.openTerminalTab(tab.id, tab.title);
  }, [tabsModel, terminalModel]);
  useTerminalSessionRestore({
    desktopApi,
    terminalModel
  });
  const terminalIdentityByTabId = useTerminalIdentityProjection({
    desktopApi,
    terminalModel,
    aiSessionTabs: aiSessionTabsModel.tabs
  });
  const workspaceAppIdentityByTabId = useWorkspaceAppIdentityProjection({
    desktopApi,
    tabs: tabsModel.tabs
  });
  const contextMenuModel = useContextMenuModel();
  const composerCitationSinkRef = useRef<ComposerCitationSink | null>(null);
  const panelLayoutModel = usePanelLayoutModel(rootRef);
  const {
themeVars,
resolvedThemeId,
  } = useWorkbenchThemeRuntime(
    preferencesModel.preferences.theme,
  );
  const previousThemeVarsRef = useRef(themeVars);
  const [isThemeTransitioning, setIsThemeTransitioning] = useState(false);

  useEffect(() => {
    const previousThemeVars = previousThemeVarsRef.current;
    if (previousThemeVars === themeVars) {
      return;
    }

    const root = rootRef.current;
    if (root !== null) {
      root.style.setProperty(
        "--lyra-theme-transition-from-bg",
        previousThemeVars["--lyra-app-bg"] ?? "transparent"
      );
    }
    previousThemeVarsRef.current = themeVars;
    setIsThemeTransitioning(true);
    const timer = window.setTimeout(() => {
      setIsThemeTransitioning(false);
    }, 440);
    return () => {
      window.clearTimeout(timer);
    };
  }, [themeVars]);

  const workbenchChromeLabels = useMemo(
    () => createWorkbenchChromeLabels(t),
    [t]
  );
  const historyAppSuggestionLabels = useMemo(() => ({
    sessions: labels.agentSessionHistory.categorySessions,
    archivedSessions: labels.agentSessionHistory.categoryArchivedSessions,
    browserHistory: labels.agentSessionHistory.categoryBrowserHistory
  }), [labels.agentSessionHistory]);
  const refreshBrowserHistoryEntries = useCallback((): void => {
    setBrowserHistoryEntries(readBrowserHistoryEntries());
  }, []);
  const agentSessionHistoryTabVisible = useMemo(
    () => visibleWorkspaceLayout.visibleTabIds.some((tabId) => {
      const tab = tabsModel.tabs.find((candidate) => candidate.id === tabId);
      return tab?.pageKind === "app"
        && tab.appId !== undefined
        && isAgentSessionHistoryAppId(tab.appId);
    }),
    [tabsModel.tabs, visibleWorkspaceLayout.visibleTabIds]
  );
  const embeddedBrowserPages = useMemo(
    () => {
      const historyPages = agentHistoryBrowserPreviewPage === null
        || agentSessionHistoryTabVisible === false
        ? []
        : [
            {
              tabId: agentHistoryBrowserPreviewPage.tabId,
              address: agentHistoryBrowserPreviewPage.url,
              titleHint: agentHistoryBrowserPreviewPage.title
            }
          ];
      const byId = new Map<string, EmbeddedBrowserPageDescriptor>();
      for (const page of parkedAgentBrowserPages) {
        byId.set(page.tabId, page);
      }
      for (const page of historyPages) {
        byId.set(page.tabId, page);
      }
      return [...byId.values()];
    },
    [agentHistoryBrowserPreviewPage, agentSessionHistoryTabVisible, parkedAgentBrowserPages]
  );
  useEffect(() => {
    if (agentSessionHistoryTabVisible || agentHistoryBrowserPreviewPage === null) {
      return;
    }
    setAgentHistoryBrowserPreviewPage(null);
  }, [agentHistoryBrowserPreviewPage, agentSessionHistoryTabVisible]);
  const {
    activePageRuntimeState,
    browserAgentVisualState,
    pageNavigationState,
    registerPageHost,
    scheduleBrowserLayoutSync,
    onGoBack,
    onGoForward,
    onReload
  } = useWorkbenchBrowserRuntime({
    desktopApi,
    tabsModel,
    activeBrowserTabId,
    activePageTabId,
    visibleWorkspaceLayout,
    embeddedBrowserPages,
    onBrowserHistoryChange: refreshBrowserHistoryEntries
  });
  const beginBrowserLayoutAnimationSync = useBrowserLayoutAnimationSync({
    panelLayoutModel,
    scheduleBrowserLayoutSync,
    animationDurationMs: WORKBENCH_BROWSER_LAYOUT_ANIMATION_MS,
    animationSyncIntervalMs: WORKBENCH_BROWSER_LAYOUT_ANIMATION_SYNC_INTERVAL_MS
  });
  const searchSettingsFacade = useWorkbenchSearchSettings(preferencesModel.preferences);
  const notificationModel = useWorkbenchNotificationModel();
  const publishNotification = useWorkbenchSystemNotificationPublisher({
    desktopApi,
    notificationModel,
    preferences: preferencesModel.preferences,
    t
  });
  useWorkbenchAppUpdateNotifications({ desktopApi, publishNotification, t });
  useWorkbenchCredentialStorageNotifications({ desktopApi, publishNotification, t });
  useWorkbenchProviderFaultNotifications({
    desktopApi,
    notificationModel,
    publishNotification,
    t
  });
  useDownloadNotifications({
    desktopApi,
    publishNotification,
    t
  });
  useLspNotifications({
    desktopApi,
    publishNotification,
    t
  });
  useWorkspaceProblemScan({
    desktopApi,
    sessionTabs: aiSessionTabsModel.tabs,
    workspaceTabs: tabsModel.tabs
  });
  useWorkbenchProductAnnouncements({
    desktopApi,
    notificationModel,
    locale,
    t
  });
  const browserSearchModel = useBrowserSearchModel({
    desktopApi,
    tabsModel,
    searchSettings: searchSettingsFacade.browserSearchSettings
  });
  useBrowserPageContextMenu({
    desktopApi,
    composerCitationSinkRef
  });
  usePageDragCitationBridge({ desktopApi });
  const terminalWorkspaceActions = useTerminalWorkspaceActions({
    desktopApi,
    tabsModel,
    terminalModel,
    contextMenuModel,
    t
  });
  const openSettingsSectionFromCapability = useCallback((categoryId: BrowserSettingsCategoryFocusRequest["categoryId"]): void => {
    setSettingsFocusRequest((current) => ({
      categoryId,
      requestId: (current?.requestId ?? 0) + 1
    }));
    tabsModel.openSettingsTab();
  }, [tabsModel]);
  const {
    fileManagerModel,
    fileEditorModel,
    imageViewerModel,
    agentProjectTreeModel
  } = useWorkbenchFileAppModels({
    desktopApi,
    contextMenuModel,
    fileManagerLabels: labels.fileManager,
    tabsModel,
    onOpenTerminal: onOpenTerminalAtDirectory
  });
  const agentPlanBoardModel = useAgentPlanBoardModel({
    desktopApi,
    onMetaChange: tabsModel.updateAppTabMeta
  });
  const agentSubagentModel = useAgentSubagentModel({
    onMetaChange: tabsModel.updateAppTabMeta
  });
  const softwareCapabilities = useSoftwareCapabilitiesRegistry({
    desktopApi,
    labels: labels.softwareStore,
    activeUiPackId: preferencesModel.preferences.uiPackId,
    tabsModel,
    fileManagerModel,
    imageViewerModel,
    terminalModel,
    onOpenSettingsSection: openSettingsSectionFromCapability
  });
  const onOpenSoftwareStoreBuiltinApp = useSoftwareStoreBuiltinAppOpener({
    fileManagerModel,
    labels,
    onOpenSettingsSection: openSettingsSectionFromCapability,
    tabsModel
  });
  const uiRuntime = useWorkbenchUiRuntime(
    preferencesModel.preferences.uiPackId,
    desktopApi,
    softwareCapabilities.createUiPackCapabilities
  );
  const workbenchActions = useWorkbenchActionApi({
    desktopApi,
    tabsModel,
    fileManagerModel,
    panelLayoutModel,
    onBeforePanelLayoutAnimation: beginBrowserLayoutAnimationSync,
    docsEntryAddress: WORKBENCH_CONFIG.browser.docsEntryAddress,
    docsTabTitle: t("docs.tabTitle"),
    agentSessionHistoryTitle: t("agentHistory.tabTitle"),
    onOpenSoftwareStore: () => {
      openSettingsSectionFromCapability("softwareStore");
    },
    onOpenLoginManager: () => {
      openSettingsSectionFromCapability("loginManager");
    },
    locale,
    resolvedThemeId
  });
  const closeEmbeddedBrowserTab = useCallback((tabId: string): boolean => {
    const parked = parkedAgentBrowserPagesRef.current.some((entry) => entry.tabId === tabId);
    if (!parked) {
      return false;
    }
    destroyAgentBrowserPreviewWatch([tabId]);
    return true;
  }, []);
  useWorkbenchObservationBridge({
    desktopApi,
    tabsModel,
    fileEditorModel,
    fileManagerModel,
    imageViewerModel,
    terminalModel,
    embeddedBrowserPages: parkedAgentBrowserPages,
    activateEmbeddedBrowserTab: promoteAgentBrowserPreviewTab,
    closeEmbeddedBrowserTab
  });
  useWorkbenchSystemNotificationPermissionGuard({
    desktopApi,
    preferencesModel
  });
  const globalDialogDefaults = useMemo(
    () => ({
      copyActionLabel: t("dialog.copyAction"),
      copiedActionLabel: t("dialog.copiedAction")
    }),
    [t]
  );
  const globalDialogModel = useGlobalDialogModel(globalDialogDefaults);
  const {
    onOpenFileFromManager,
    onRevealPathInFileManager,
    openDirectoryFromNavigation
  } = useWorkbenchFileActions({
    desktopApi,
    activeTab,
    tabsModel,
    fileManagerModel,
    fileEditorModel,
    imageViewerModel
  });
  const notificationNavigation = useWorkbenchNotificationNavigation({
    tabsModel,
    fileManagerModel,
    fileEditorModel,
    notificationModel,
    openDialog: globalDialogModel.openDialog,
    t
  });
  const onOpenFilesFavorite = useFilesFavoriteOpener({
    openAgentSession: aiSessionTabsModel.openSession,
    openPage: tabsModel.openPageInNewTab,
    isLeftPanelVisible: panelLayoutModel.isLeftPanelVisible,
    beginPanelAnimation: beginBrowserLayoutAnimationSync,
    toggleLeftPanel: panelLayoutModel.toggleLeftPanel
  });
  useWorkspaceCoreCommandBus({
    tabsModel,
    notificationModel,
    imageViewerModel,
    fileManagerModel,
    fileEditorModel,
    terminalModel,
    locale,
    resolvedThemeId,
    onOpenFile: onOpenFileFromManager,
    onOpenFilesFavorite,
    onOpenNotificationSource: notificationNavigation.onOpenNotificationSource,
    onRequestClearNotifications: notificationNavigation.onRequestClearNotifications
  });
  useWorkspaceAgentCommandBus({
    tabsModel,
    agentProjectTreeModel,
    agentPlanBoardModel
  });
  const onOpenAgentConfigFile = useCallback((filePath: string): void => {
    onOpenFileFromManager(filePath, undefined, { forceReloadIfOpen: true });
  }, [onOpenFileFromManager]);
  const {
    activeFileManagerState,
    activeFileEditorState,
    settingsAiModel
  } = useWorkbenchActiveAppContext({
    activeTab,
    desktopApi,
    fileManagerModel,
    fileEditorModel,
    labels,
    onOpenAgentConfigFile,
    onOpenSite: tabsModel.openPageInNewTab,
    onProviderRouteAdjusted: (adjustment) => {
      publishNotification(buildProviderRouteNotification(adjustment, t));
    },
  });
  const selectProjectDirectory = useCallback(async (): Promise<string | null> => {
    const api = desktopApi;
    if (api === null) {
      return null;
    }
    const directories = await api.files.selectDirectories();
    if (directories.length === 0) {
      return null;
    }
    return directories[0]?.path ?? null;
  }, [desktopApi]);
  const { requestDirectory: requestDownloadDirectory, resolveFileManagerChooser: resolveDownloadsDirectoryChooser } =
    useWorkbenchDirectoryChooser({
      fileManagerModel,
      tabsModel,
      chooserKind: "downloads-directory",
      confirmLabel: t("settings.downloadsChooseDirectory"),
      promptLabel: t("settings.downloadsDefaultDirectory"),
      selectPlaceholder: labels.fileManager.chooserSelectAnyDirectoryPlaceholder,
      selectDirectory: selectProjectDirectory
    });
  const chooseDownloadDirectory = useCallback(
    (): Promise<string | null> => requestDownloadDirectory(),
    [requestDownloadDirectory]
  );
  const settingsSurfaceProps = useWorkbenchSettingsSurfaceProps({
    labels,
    desktopApi,
    preferencesModel,
    settingsAiModel,
    softwareCapabilities,
    jsReplEnabled,
    focusCategoryRequest: settingsFocusRequest,
    openDialog: globalDialogModel.openDialog,
    publishNotification,
    onOpenSoftwareStoreBuiltinApp,
    onOpenSettingsSection: openSettingsSectionFromCapability,
    onChooseDownloadDirectory: chooseDownloadDirectory,
    onOpenDocs: workbenchActions.openDocs,
    onJsReplChange: updateJsReplSetting,
    onSignedOut
  });
  useWorkbenchLinuxCompatNotice({
    desktopApi,
    labels,
    openDialog: globalDialogModel.openDialog,
    publishNotification
  });
  const { requestDirectory: requestProjectBind, resolveFileManagerChooser: resolveProjectBindChooser } =
    useWorkbenchDirectoryChooser({
      fileManagerModel,
      tabsModel,
      chooserKind: "ai-project-bind",
      confirmLabel: t("ai.bindProjectConfirm"),
      promptLabel: t("ai.bindProjectLabel"),
      selectPlaceholder: labels.fileManager.chooserSelectDirectoryPlaceholder,
      selectDirectory: selectProjectDirectory
    });
  const { requestFileAttach, resolveFileManagerChooser: resolveFileAttachChooser } =
    useWorkbenchFileAttachChooser({
      fileManagerModel,
      tabsModel,
      confirmLabel: t("ai.attachFileConfirm"),
      promptLabel: t("ai.attachFileLabel"),
      selectPlaceholder: t("ai.attachFileSelectPlaceholder")
    });
  const resolveFileManagerChooser = useCallback(
    (instanceId: string) =>
      resolveProjectBindChooser(instanceId)
      ?? resolveDownloadsDirectoryChooser(instanceId)
      ?? resolveFileAttachChooser(instanceId),
    [resolveDownloadsDirectoryChooser, resolveFileAttachChooser, resolveProjectBindChooser]
  );
  const listWorkspaceTabs = useCallback(() => tabsModel.tabs, [tabsModel.tabs]);
  const listTerminalTabs = useCallback(
    () => [...terminalModel.dockTabs, ...terminalModel.workspaceTabs],
    [terminalModel.dockTabs, terminalModel.workspaceTabs]
  );
  const {
    onOpenAgentProjectTree,
    onOpenAgentGit,
    onOpenAgentPlanBoard,
    onOpenAgentProjectPlanManager,
    onRevealAgentProjectPath,
    onOpenAgentSubagent
  } = useWorkbenchAgentAppOpeners({
    desktopApi,
    tabsModel,
    agentProjectTreeModel,
    agentPlanBoardModel,
    agentSubagentModel
  });
  const onOpenAgentModelSettings = useCallback((): void => {
    setSettingsFocusRequest((current) => ({
      categoryId: "models",
      requestId: (current?.requestId ?? 0) + 1
    }));
    tabsModel.openSettingsTab();
  }, [tabsModel]);
  const onOpenAgentUrlInWorkbench = useCallback((request: {
    readonly url: string;
    readonly title?: string;
  }): void => {
    tabsModel.openPageInNewTab(request.url, request.title ?? request.url);
  }, [tabsModel]);
  const onRunTerminalCommand = useCallback((command: string): void => {
    const trimmed = command.trim();
    if (trimmed.length === 0) {
      return;
    }
    const { tab } = terminalModel.openTabWithPlacement({
      placement: "workspace",
      title: trimmed,
      mode: "command",
      command: trimmed
    });
    tabsModel.openTerminalTab(tab.id, tab.title);
  }, [tabsModel, terminalModel]);
  const onOpenTerminalLiveSession = useOpenTerminalLiveSession({
    terminalModel,
    terminalWorkspaceActions
  });
  const onFocusTerminalTabInDock = useCallback((tabId: string): void => {
    terminalModel.setActiveTab(tabId);
    if (!panelLayoutModel.isBottomPanelVisible) {
      panelLayoutModel.toggleBottomPanel();
    }
  }, [terminalModel, panelLayoutModel]);
  const sidebarAiSurfaceProps = useWorkbenchSidebarAiSurfaceProps({
    desktopApi,
    preferences: preferencesModel.preferences,
    settingsAiModel,
    aiPanelSide: panelLayoutModel.aiPanelSide,
    onToggleAiPanelSide: () => {
      beginBrowserLayoutAnimationSync();
      panelLayoutModel.toggleAiPanelSide();
    },
    onRequestProjectBind: requestProjectBind,
    onOpenProjectTree: onOpenAgentProjectTree,
    onOpenPlanBoard: onOpenAgentPlanBoard,
    onOpenSubagent: onOpenAgentSubagent,
    onOpenAgentGit,
    onOpenProjectPlanManager: onOpenAgentProjectPlanManager,
    onRevealProjectPath: onRevealAgentProjectPath,
    onOpenModelSettings: onOpenAgentModelSettings,
    onOpenUrlInWorkbench: onOpenAgentUrlInWorkbench,
    onOpenTerminalLiveSession,
    onOpenFile: onOpenFileFromManager,
    onRevealPathInWorkbench: onRevealPathInFileManager,
    resolveActiveWorkspaceTab: () => tabsModel.activeTab,
    onPickFileFromFileManager: requestFileAttach,
    listWorkspaceTabs,
    listTerminalTabs,
    getTerminalTabPanes: terminalModel.getTabPanes,
    onCloseTerminalTab: terminalWorkspaceActions.closeTerminalTabEverywhere,
    onFocusTerminalTabInDock,
    openDialog: globalDialogModel.openDialog,
    t
  });
  useScrollbarVisibilityGuard(rootRef);

  const onRootDragStartCapture = useCallback((event: ReactDragEvent<HTMLElement>) => {
    if (uiRuntime.interactions.workbenchDrag.shouldPreventDragStart(event.target)) {
      event.preventDefault();
    }
  }, [uiRuntime.interactions.workbenchDrag]);

  const windowMaterialMode = desktopApi?.appMeta.windowMaterialMode ?? "opaque";
  const materialThemeEnabled =
    windowMaterialMode === "native"
    && preferencesModel.preferences.windowMaterialEnabled;
  const rootVars = useMemo(
    () => {
      const mergedThemeVars: WorkbenchThemeVars = { ...themeVars };
      for (const [name, value] of Object.entries(uiRuntime.vars)) {
        if (value !== undefined) {
          mergedThemeVars[name as keyof WorkbenchThemeVars] = value;
        }
      }
      return {
        ...resolveMaterialThemeVars(
          mergedThemeVars,
          materialThemeEnabled,
          resolvedThemeId.endsWith("-dark") ? "dark" : "light"
        ),
        "--lyra-ui-font-size": `${normalizeUiFontSizePx(preferencesModel.preferences.uiFontSizePx)}px`
      };
    },
    [
      materialThemeEnabled,
      preferencesModel.preferences.uiFontSizePx,
      resolvedThemeId,
      themeVars,
      uiRuntime.vars
    ]
  );
  const rootStyle = rootVars as CSSProperties;

  useLayoutEffect(() => {
    applyPanelLayoutCssVars(rootRef.current, panelLayoutModel.cssVars);
  }, [panelLayoutModel.cssVars]);

  useEffect(() => {
    syncCssVarsToDocumentRoot(rootVars);
    syncWindowThemeSource(desktopApi, preferencesModel.preferences.theme);
    syncDocumentThemeTone(resolvedThemeId);
    document.documentElement.dataset.lyraWindowMaterial = windowMaterialMode;
    document.documentElement.dataset.lyraMaterialEnabled =
      preferencesModel.preferences.windowMaterialEnabled ? "true" : "false";
  }, [
    desktopApi,
    preferencesModel.preferences.theme,
    preferencesModel.preferences.windowMaterialEnabled,
    resolvedThemeId,
    rootVars
  ]);

  useWorkbenchAppRestoration({
    activeTab,
    tabsModel,
    fileManagerModel,
    fileEditorModel,
    imageViewerModel,
    agentProjectTreeModel,
    agentSubagentModel
  });

  const rootClassName = cx(
    "lyra-root",
    uiRuntime.rootClassName,
    isThemeTransitioning && "lyra-theme-transition",
    isFullScreen && "lyra-root-fullscreen",
    globalDialogModel.state.isOpen && "lyra-root-modal-open"
  );

  return (
    <WorkbenchShellStage
      activeBrowserTabId={activeBrowserTabId}
      activeFileEditorState={activeFileEditorState}
      activeFileManagerState={activeFileManagerState}
      activePageRuntimeState={activePageRuntimeState}
      activeTab={activeTab}
      activeTabPageKind={activeTabPageKind}
      agentHistoryLocateRequest={agentHistoryLocateRequest}
      agentHistoryRefreshRequestKey={agentHistoryRefreshRequestKey}
      agentHistoryBrowserPreviewTabId={AGENT_HISTORY_BROWSER_PREVIEW_TAB_ID}
      agentPlanBoardModel={agentPlanBoardModel}
      agentSubagentModel={agentSubagentModel}
      agentProjectTreeModel={agentProjectTreeModel}
      aiSessionTabsModel={aiSessionTabsModel}
      beginBrowserLayoutAnimationSync={beginBrowserLayoutAnimationSync}
      browserAgentVisualState={browserAgentVisualState}
      browserHistoryEntries={browserHistoryEntries}
      browserSearchModel={browserSearchModel}
      composerCitationSinkRef={composerCitationSinkRef}
      contextMenuModel={contextMenuModel}
      desktopApi={desktopApi}
      fileEditorModel={fileEditorModel}
      fileManagerModel={fileManagerModel}
      globalDialogModel={globalDialogModel}
      historyAppSuggestionLabels={historyAppSuggestionLabels}
      imageViewerModel={imageViewerModel}
      isFullScreen={isFullScreen}
      isMaximized={isMaximized}
      labels={labels}
      locale={locale}
      notificationModel={notificationModel}
      notificationNavigation={notificationNavigation}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
      onOpenAgentGit={onOpenAgentGit}
      onOpenAgentSubagent={onOpenAgentSubagent}
      onOpenFileFromManager={onOpenFileFromManager}
      onReload={onReload}
      onRevealPathInFileManager={onRevealPathInFileManager}
      onRootDragStartCapture={onRootDragStartCapture}
      onRunTerminalCommand={onRunTerminalCommand}
      openDirectoryFromNavigation={openDirectoryFromNavigation}
      openSettingsSectionFromCapability={openSettingsSectionFromCapability}
      pageNavigationState={pageNavigationState}
      parkedAgentBrowserPages={parkedAgentBrowserPages}
      panelLayoutModel={panelLayoutModel}
      preferencesModel={preferencesModel}
      refreshBrowserHistoryEntries={refreshBrowserHistoryEntries}
      registerPageHost={registerPageHost}
      resolveFileManagerChooser={resolveFileManagerChooser}
      resolvedThemeId={resolvedThemeId}
      rootClassName={rootClassName}
      rootRef={rootRef}
      rootStyle={rootStyle}
      searchSettingsFacade={searchSettingsFacade}
      setAgentHistoryBrowserPreviewPage={setAgentHistoryBrowserPreviewPage}
      setAgentHistoryLocateRequest={setAgentHistoryLocateRequest}
      setAgentHistoryRefreshRequestKey={setAgentHistoryRefreshRequestKey}
      settingsSurfaceProps={settingsSurfaceProps}
      sidebarAiSurfaceProps={sidebarAiSurfaceProps}
      softwareCapabilities={softwareCapabilities}
      t={t}
      tabsModel={tabsModel}
      terminalIdentityByTabId={terminalIdentityByTabId}
      terminalModel={terminalModel}
      terminalWorkspaceActions={terminalWorkspaceActions}
      uiRuntime={uiRuntime}
      visibleWorkspaceLayout={visibleWorkspaceLayout}
      workbenchActions={workbenchActions}
      workbenchChromeLabels={workbenchChromeLabels}
      workspaceAppIdentityByTabId={workspaceAppIdentityByTabId}
    />
  );
};
