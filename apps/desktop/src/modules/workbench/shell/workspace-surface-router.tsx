import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { AppButton, AppEmptyState } from "@renderer/ui/components";

import type { SearchEngineDefinition } from "../browser-search/types";
import type { BrowserSettingsSurfaceProps } from "../browser-tabs/settings-surface";
import {
  type FileManagerChooserMode,
  type FileManagerModel,
  type FileManagerSurfaceLabels
} from "../file-manager";
import type { FileManagerFavorite } from "../../../shared/file-manager";
import {
  type FileEditorChangeReviewItem,
  type FileEditorLabels,
  type FileEditorModel
} from "../file-editor";
import type { ImageViewerLabels, ImageViewerModel } from "../image-viewer";
import type { AgentSessionHistorySurfaceProps } from "../agent-session-history";
import type {
  AgentProjectTreeLabels,
  AgentProjectTreeModel
} from "../agent-project-tree";
import type {
  AgentPlanBoardLabels,
  AgentPlanBoardModel
} from "../agent-plan-board";
import type {
  AgentSubagentLabels,
  AgentSubagentModel,
  AgentSubagentOpenRequest
} from "../agent-subagent";
import type { AgentGitLabels } from "../agent-git";
import { SoftwareStoreSurface, type SoftwareStoreSurfaceProps } from "../software-store";
import type { WorkbenchSplitThreePaneLayout } from "../preferences";
import type { TerminalDockLabels, TerminalDockModel } from "../terminal-dock/types";
import type { WorkbenchSurfaceAdapters } from "../ui-platform/surface-types";
import type { WorkspaceTab, WorkspaceTabsModel } from "../workspace-tabs/types";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type { WorkbenchBrowserPageRuntimeState } from "../../../shared/workbench-browser";
import type { BrowserSearchModel } from "../browser-search";
import {
  createWorkspaceSurfaceRenderModel,
  type WorkspaceSurfaceRenderModel
} from "./workspace-surface-render-model";
import { WorkbenchTitlebarScopeProvider } from "./titlebar-context";
import {
  WORKSPACE_SPLIT_CLASS,
  WORKSPACE_SPLIT_COUNT_2_CLASS,
  WORKSPACE_SPLIT_COUNT_3_CLASS,
  WORKSPACE_SPLIT_COUNT_4_CLASS,
  WORKSPACE_SPLIT_PANE_BASE_CLASS,
  WORKSPACE_SPLIT_PANE_ACTIVE_CLASS,
  WORKSPACE_SURFACE_KEEPALIVE_CLASS,
  WORKSPACE_SURFACE_SINGLE_CLASS,
  WORKSPACE_SURFACE_SPLIT_CLASS,
  workspaceSplitPaneGridClass
} from "./classes";
import { isFileEditorAppId } from "../workspace-apps";
import { DynamicWorkspaceAppSurface } from "./dynamic-workspace-app-surface";
import { OfficeViewerSurface } from "../office-viewer/view";
import { SqliteViewerSurface } from "../sqlite-viewer/view";

export type WorkspaceSurfaceSettingsProps = BrowserSettingsSurfaceProps;

export type WorkspaceSurfaceI18nProps = {
  readonly searchPlaceholder: string;
  readonly searchActionLabel: string;
  readonly resultsHeading: string;
  readonly resultsNoResults: string;
  readonly resultsEngineError: string;
  readonly resultsOfficial: string;
  readonly resultsOfficialHomepage: string;
  readonly resultsOfficialSubsite: string;
  readonly resultsOfficialDocs: string;
  readonly resultsOfficialLogin: string;
  readonly resultsOfficialDownload: string;
  readonly resultsOfficialSupport: string;
  readonly resultsSourceFilter: string;
  readonly resultsAllTab: string;
  readonly resultsAutoTab: string;
  readonly resultsWebTab: string;
  readonly channelIdle: string;
  readonly channelLoading: string;
  readonly channelReady: string;
  readonly channelError: string;
};

export type WorkspaceSurfaceRouterProps = {
  readonly surfaceAdapters: WorkbenchSurfaceAdapters;
  readonly activeTab: WorkspaceTab | undefined;
  readonly activePageRuntimeState: WorkbenchBrowserPageRuntimeState | null;
  readonly tabsModel: WorkspaceTabsModel;
  readonly logoUrl: string;
  readonly browserSearchModel: BrowserSearchModel;
  readonly searchEngines: readonly SearchEngineDefinition[];
  readonly autoSearchEngines: readonly SearchEngineDefinition[];
  readonly engineById: ReadonlyMap<string, SearchEngineDefinition>;
  readonly onOpenSearchResult: (url: string, title: string) => void;
  readonly onPageHostChange: (tabId: string, element: HTMLElement | null) => void;
  readonly terminalModel: TerminalDockModel;
  readonly desktopApi: LyraDesktopApi | null;
  readonly terminalLabels: TerminalDockLabels;
  readonly resolvedThemeId: string;
  readonly fileManagerModel: FileManagerModel;
  readonly fileManagerLabels: FileManagerSurfaceLabels;
  readonly resolveFileManagerChooser?: (instanceId: string) => FileManagerChooserMode | null;
  readonly fileEditorModel: FileEditorModel;
  readonly fileEditorLabels: FileEditorLabels;
  readonly imageViewerModel: ImageViewerModel;
  readonly imageViewerLabels: ImageViewerLabels;
  readonly agentProjectTreeModel: AgentProjectTreeModel;
  readonly agentProjectTreeLabels: AgentProjectTreeLabels;
  readonly agentPlanBoardModel: AgentPlanBoardModel;
  readonly agentPlanBoardLabels: AgentPlanBoardLabels;
  readonly agentSubagentModel: AgentSubagentModel;
  readonly agentSubagentLabels: AgentSubagentLabels;
  readonly onOpenAgentSubagent?: (request: AgentSubagentOpenRequest) => void;
  readonly agentGitLabels: AgentGitLabels;
  readonly onOpenAgentGit: (request: {
    readonly sessionId: string;
    readonly workingDir: string;
  }) => Promise<void> | void;
  readonly onOpenProjectProblems?: (request: {
    readonly instanceId: string;
    readonly title: string;
    readonly rootPath: string;
  }) => void;
  readonly fileEditorReview?: {
    readonly editorWorkAcceptLabel: string;
    readonly editorWorkRejectLabel: string;
    readonly editorWorkUndoLabel: string;
    readonly editorWorkPrevLabel: string;
    readonly editorWorkNextLabel: string;
    readonly editorWorkAcceptAllLabel: string;
    readonly canGoToPreviousEditorWorkItem: boolean;
    readonly canGoToNextEditorWorkItem: boolean;
    readonly canAcceptAllEditorWorkItems: boolean;
    readonly resolveActiveEditorWorkItem: (filePath: string) => FileEditorChangeReviewItem | undefined;
    readonly onGoToPreviousEditorWorkItem: () => void;
    readonly onGoToNextEditorWorkItem: () => void;
    readonly onAcceptAllEditorWorkItems: () => void;
    readonly onAcceptEditorWorkItem: (item: FileEditorChangeReviewItem) => void;
    readonly onRejectEditorWorkItem: (item: FileEditorChangeReviewItem) => void;
    readonly onUndoEditorWorkItem: (item: FileEditorChangeReviewItem) => void;
  };
  readonly onOpenFileFromManager: (filePath: string) => void;
  readonly onOpenFavoriteFromFileManager?: (favorite: FileManagerFavorite) => void;
  readonly onRevealPathInFileManager: (filePath: string) => void;
  readonly splitThreePaneLayout: WorkbenchSplitThreePaneLayout;
  readonly settings: WorkspaceSurfaceSettingsProps;
  readonly searchResultsSourceFilter: "all" | "web";
  readonly onSearchResultsSourceFilterChange: (value: "all" | "web") => void;
  readonly i18n: WorkspaceSurfaceI18nProps;
  readonly agentSessionHistory: {
    readonly labels: AgentSessionHistorySurfaceProps["labels"];
    readonly activeSessionId: string | null;
    readonly onOpenSession: AgentSessionHistorySurfaceProps["onOpenSession"];
    readonly onCreateProjectSession?: AgentSessionHistorySurfaceProps["onCreateProjectSession"];
    readonly onSessionDeleted?: AgentSessionHistorySurfaceProps["onSessionDeleted"];
    readonly openDialog: AgentSessionHistorySurfaceProps["openDialog"];
    readonly query: AgentSessionHistorySurfaceProps["query"];
    readonly refreshRequestKey: AgentSessionHistorySurfaceProps["refreshRequestKey"];
    readonly locateRequest: AgentSessionHistorySurfaceProps["locateRequest"];
    readonly browserHistory: AgentSessionHistorySurfaceProps["browserHistory"];
    readonly browserHistoryPreviewPageId: AgentSessionHistorySurfaceProps["browserHistoryPreviewPageId"];
    readonly onBrowserHistoryPreviewChange: AgentSessionHistorySurfaceProps["onBrowserHistoryPreviewChange"];
    readonly onBrowserHistoryPreviewHostChange: AgentSessionHistorySurfaceProps["onBrowserHistoryPreviewHostChange"];
    readonly onOpenBrowserHistoryEntry: AgentSessionHistorySurfaceProps["onOpenBrowserHistoryEntry"];
    readonly locale?: AgentSessionHistorySurfaceProps["locale"];
  };
  readonly softwareStore: SoftwareStoreSurfaceProps;
};

/** Max number of tab surfaces kept alive (mounted but hidden) for instant switching. */
const MAX_KEPT_ALIVE_TABS = 6;

type ScrollOffset = {
  readonly element: HTMLElement;
  readonly top: number;
  readonly left: number;
};

// Page-index restore is lossy: the slide touching the top edge is often the
// previous one, so scrolling back to that index jumps a page. Pixels round-trip.
const SCROLLPORT_SELECTOR = "[data-scroller], .lyra-agents-chat-scroll, .lyra-agent-history-preview-chat";

const snapshotScrollOffsets = (root: HTMLElement): readonly ScrollOffset[] => {
  const offsets: ScrollOffset[] = [];
  const visit = (element: HTMLElement) => {
    if (element.scrollTop === 0 && element.scrollLeft === 0) {
      return;
    }
    offsets.push({
      element,
      top: element.scrollTop,
      left: element.scrollLeft
    });
  };
  visit(root);
  root.querySelectorAll<HTMLElement>(SCROLLPORT_SELECTOR).forEach(visit);
  return offsets;
};

const restoreScrollOffsets = (offsets: readonly ScrollOffset[]) => {
  for (const offset of offsets) {
    if (offset.element.isConnected === false) {
      continue;
    }
    if (offset.element.scrollTop !== offset.top) {
      offset.element.scrollTop = offset.top;
    }
    if (offset.element.scrollLeft !== offset.left) {
      offset.element.scrollLeft = offset.left;
    }
  }
};

// One slot per tab for the lifetime of the keepalive entry. Moving a tab
// between a hidden list and a visible sibling remounts it, so slide position
// and table selection start over. Hiding is a flag on this same slot.
const KeepAliveSurface = ({
  hidden,
  children
}: {
  readonly hidden: boolean;
  readonly children: ReactNode;
}) => {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const scrollOffsetsRef = useRef<readonly ScrollOffset[]>([]);
  useLayoutEffect(() => {
    const node = slotRef.current;
    if (node === null) {
      return undefined;
    }
    if (hidden) {
      node.setAttribute("inert", "");
      scrollOffsetsRef.current = snapshotScrollOffsets(node);
      return undefined;
    }
    node.removeAttribute("inert");
    const offsets = scrollOffsetsRef.current;
    restoreScrollOffsets(offsets);
    // Resize observers run after this layout effect and rewrite scroll from a
    // page index. Put the pixels back after that.
    const frame = requestAnimationFrame(() => {
      restoreScrollOffsets(offsets);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [hidden]);
  return (
    <div
      ref={slotRef}
      className={WORKSPACE_SURFACE_KEEPALIVE_CLASS}
      data-lyra-surface-hidden={hidden ? "true" : undefined}
      aria-hidden={hidden ? true : undefined}
    >
      {children}
    </div>
  );
};

// ponytail: file-editor tabs use a separate persistent surface (below) so
// they are excluded from the keepalive pool. Switching between file-editor
// tabs swaps the monaco model (setModel) instead of creating new editors.
const isFileEditorTab = (tab: WorkspaceTab): boolean =>
  tab.appId !== undefined && isFileEditorAppId(tab.appId);

const renderSurfaceModel = (
  model: WorkspaceSurfaceRenderModel,
  surfaceAdapters: WorkbenchSurfaceAdapters,
  desktopApi: LyraDesktopApi | null
): ReactNode => {
  switch (model.kind) {
    case "searchHome": {
      const Adapter = surfaceAdapters.searchHome;
      return <Adapter {...model.props} />;
    }
    case "searchResults": {
      const Adapter = surfaceAdapters.searchResults;
      return <Adapter {...model.props} />;
    }
    case "browserPage": {
      const Adapter = surfaceAdapters.browserPage;
      return <Adapter {...model.props} />;
    }
    case "settings": {
      const Adapter = surfaceAdapters.settings;
      return <Adapter {...model.props} />;
    }
    case "terminalWorkspace": {
      const Adapter = surfaceAdapters.terminalWorkspace;
      return <Adapter {...model.props} />;
    }
    case "fileManager": {
      const Adapter = surfaceAdapters.fileManager;
      return <Adapter {...model.props} />;
    }
    case "fileEditor": {
      const Adapter = surfaceAdapters.fileEditor;
      return <Adapter {...model.props} />;
    }
    case "imageViewer": {
      const Adapter = surfaceAdapters.imageViewer;
      return <Adapter {...model.props} />;
    }
    case "agentProjectTree": {
      const Adapter = surfaceAdapters.agentProjectTree;
      return <Adapter {...model.props} />;
    }
    case "agentPlanBoard": {
      const Adapter = surfaceAdapters.agentPlanBoard;
      return <Adapter {...model.props} />;
    }
    case "agentSubagent": {
      const Adapter = surfaceAdapters.agentSubagent;
      return <Adapter {...model.props} />;
    }
    case "agentGit": {
      const Adapter = surfaceAdapters.agentGit;
      return <Adapter {...model.props} />;
    }
    case "agentSessionHistory": {
      const Adapter = surfaceAdapters.agentSessionHistory;
      return <Adapter {...model.props} />;
    }
    case "softwareStore":
      return <SoftwareStoreSurface {...model.props} />;
    case "dynamicApp":
      return <DynamicWorkspaceAppSurface {...model} />;
    case "officeViewer":
      return (
        <OfficeViewerSurface
          desktopApi={desktopApi}
          filePath={model.filePath}
          title={model.title}
        />
      );
    case "sqliteViewer":
      return (
        <SqliteViewerSurface
          key={model.filePath}
          desktopApi={desktopApi}
          filePath={model.filePath}
          title={model.title}
        />
      );
    case "unavailableApp":
      return (
        <AppEmptyState
          title={model.title}
          description={model.description}
          actions={<AppButton variant="secondary" size="sm" onClick={model.onRepair}>{model.repairLabel}</AppButton>}
        />
      );
    case "empty":
      return null;
    default:
      return null;
  }
};

export const WorkspaceSurfaceRouter = ({
  surfaceAdapters,
  activeTab,
  tabsModel,
  splitThreePaneLayout,
  ...renderContext
}: WorkspaceSurfaceRouterProps) => {
  const renderTabSurface = (tab: WorkspaceTab): ReactNode => {
    const model = createWorkspaceSurfaceRenderModel(tab, {
      ...renderContext,
      tabsModel
    });
    return (
      <WorkbenchTitlebarScopeProvider scopeId={tab.id}>
        {renderSurfaceModel(model, surfaceAdapters, renderContext.desktopApi)}
      </WorkbenchTitlebarScopeProvider>
    );
  };

  const visibleLayout = tabsModel.getVisibleWorkspaceLayout();
  const tabById = new Map(tabsModel.tabs.map((tab) => [tab.id, tab] as const));

  // --- LRU keepalive for single-mode tab switching ---
  // Track the order in which tabs were activated so we can keep the most
  // recently used ones mounted (display:none) and evict the stalest.
  const lruRef = useRef<readonly string[]>([]);
  const lastFileEditorTabIdRef = useRef<string | undefined>(undefined);
  const activeId = activeTab?.id ?? visibleLayout.activeTabId;

  // Update LRU during render: move activeId to the end (most recently used).
  if (activeId.length > 0) {
    const current = lruRef.current;
    if (current[current.length - 1] !== activeId) {
      lruRef.current = [...current.filter((id) => id !== activeId), activeId];
    }
  }

  // Compute which tabs to keep alive: filter closed tabs and file-editor
  // tabs (file-editor uses a persistent single-instance surface), cap to MAX.
  // Always union the active non-editor tab so LRU eviction cannot hide it.
  const keptAliveTabIds = useMemo(() => {
    const existing = new Set(tabsModel.tabs.map((tab) => tab.id));
    const lru = lruRef.current.filter((id) => {
      if (!existing.has(id)) return false;
      const tab = tabById.get(id);
      return tab !== undefined && !isFileEditorTab(tab);
    });
    const capped = lru.slice(-MAX_KEPT_ALIVE_TABS);
    const activeTabForPool = tabById.get(activeId);
    if (
      activeId.length === 0
      || existing.has(activeId) === false
      || activeTabForPool === undefined
      || isFileEditorTab(activeTabForPool)
      || capped.includes(activeId)
    ) {
      return capped;
    }
    return [...capped, activeId].slice(-MAX_KEPT_ALIVE_TABS);
  }, [activeId, tabsModel.tabs]);

  if (visibleLayout.mode === "split") {
    const paneCount = visibleLayout.visibleTabIds.length;
    const splitClassName = [
      WORKSPACE_SPLIT_CLASS,
      `lyra-workspace-split-count-${paneCount}`,
      `lyra-workspace-split-layout-${splitThreePaneLayout}`,
      paneCount === 2
        ? WORKSPACE_SPLIT_COUNT_2_CLASS
        : paneCount === 3
          ? WORKSPACE_SPLIT_COUNT_3_CLASS
          : WORKSPACE_SPLIT_COUNT_4_CLASS
    ].join(" ");
    return (
      <div className={WORKSPACE_SURFACE_SPLIT_CLASS}>
        <div className={splitClassName} aria-label="workspace-split-layout">
          {visibleLayout.visibleTabIds.map((tabId, index) => {
            const tab = tabById.get(tabId);
            if (tab === undefined) {
              return null;
            }
            const paneClassName = [
              `lyra-workspace-split-pane-${index + 1}`,
              WORKSPACE_SPLIT_PANE_BASE_CLASS,
              workspaceSplitPaneGridClass(splitThreePaneLayout, index, paneCount),
              tab.id === visibleLayout.focusedSplitTabId
                ? WORKSPACE_SPLIT_PANE_ACTIVE_CLASS
                : ""
            ]
              .filter((value) => value.length > 0)
              .join(" ");

            return (
              <section
                key={tab.id}
                className={paneClassName}
                onMouseDown={() => {
                  tabsModel.setActiveTab(tab.id);
                }}
              >
                {renderTabSurface(tab)}
              </section>
            );
          })}
        </div>
      </div>
    );
  }

  const targetTab = activeTab ?? tabById.get(visibleLayout.activeTabId);

  // --- Persistent file-editor surface (single-instance) ---
  // A single FileEditorSurface (key="file-editor-persistent") is always
  // mounted when a file-editor tab exists. Switching between file-editor
  // tabs updates the state prop, triggering a model swap in
  // useFileEditorRuntime rather than a full create/dispose cycle.
  const activeFileEditorTab =
    targetTab !== undefined && isFileEditorTab(targetTab) ? targetTab : undefined;
  if (activeFileEditorTab !== undefined) {
    lastFileEditorTabIdRef.current = activeFileEditorTab.id;
  }
  const persistentFileEditorTab =
    lastFileEditorTabIdRef.current !== undefined
      ? tabById.get(lastFileEditorTabIdRef.current)
      : undefined;
  const shouldRenderPersistentEditor =
    persistentFileEditorTab !== undefined && isFileEditorTab(persistentFileEditorTab);
  if (!shouldRenderPersistentEditor && lastFileEditorTabIdRef.current !== undefined) {
    lastFileEditorTabIdRef.current = undefined;
  }

  const visibleNonEditorTab =
    targetTab !== undefined && isFileEditorTab(targetTab) === false
      ? targetTab
      : undefined;
  const singleTabIds = visibleNonEditorTab !== undefined
    && keptAliveTabIds.includes(visibleNonEditorTab.id) === false
    ? [...keptAliveTabIds, visibleNonEditorTab.id]
    : keptAliveTabIds;

  return (
    <div className={WORKSPACE_SURFACE_SINGLE_CLASS}>
      {singleTabIds.map((tabId) => {
        const tab = tabById.get(tabId);
        if (tab === undefined) return null;
        return (
          <KeepAliveSurface key={tabId} hidden={tabId !== visibleNonEditorTab?.id}>
            {renderTabSurface(tab)}
          </KeepAliveSurface>
        );
      })}
      {shouldRenderPersistentEditor && persistentFileEditorTab !== undefined && (
        <KeepAliveSurface
          key="file-editor-persistent"
          hidden={activeFileEditorTab === undefined}
        >
          {renderTabSurface(persistentFileEditorTab)}
        </KeepAliveSurface>
      )}
    </div>
  );
};
