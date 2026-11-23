import { Plus, X } from "@lyra/icons";
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";

import {
  AppButton,
  AppIconButton,
  AppPanel,
  AppStatusMessage
} from "@renderer/ui/components";
import { LyraLogo } from "@renderer/ui/app";
import { cn } from "@renderer/ui/utils";
import { IdentityIconView, useSessionIdentityIcon } from "../identity";
import { LyraAgentsApp } from "./lyra-agents/LyraAgentsApp";
import { t, formatMessage } from "@workbench/i18n";
import { useData } from "./lyra-agents/data/DataProvider";
import { HeaderControls } from "./lyra-agents/features/header/Header";
import { MessageCitationText } from "./lyra-agents/features/chat/MessageCitationText";
import {
  inlineContentMarkersToDisplayText,
  inlineReferenceRecords
} from "./lyra-agents/features/chat/message-citation";
import type { AiPanelSessionTabReferences } from "./session-tabs";
import type { AiPanelSessionTab } from "./session-tabs";
import type { AiPanelSurfaceProps } from "./types";
import { useLyraAgentDataProvider } from "./use-lyra-agent-data-provider";
import {
  handleChromeTabCloseClick,
  handleChromeTabClosePointerDown,
  isMiddleClick,
  useChromeTabStripCloseLock
} from "../ui-primitives";
import {
  AGENTS_HEADER_CLASS,
  AGENTS_HOST_CLASS,
  AI_PANEL_ERROR_CLASS,
  AI_PANEL_SHELL_CLASS,
  SESSION_TAB_ADD_CLASS,
  SESSION_TAB_CLOSE_CLASS,
  SESSION_TAB_ICON_CLASS,
  SESSION_TAB_ITEM_ACTIVE_CLASS,
  SESSION_TAB_ITEM_CLASS,
  SESSION_TAB_ITEM_DRAGGING_CLASS,
  SESSION_TAB_LIST_CLASS,
  SESSION_TAB_LOGO_CLASS,
  SESSION_TAB_MAIN_CLASS,
  SESSION_TAB_STRIP_CLASS,
  SESSION_TAB_TITLE_CLASS,
  SESSION_TABS_HEADER_CLASS
} from "./classes";

const AI_SESSION_TAB_DRAG_THRESHOLD_PX = 4;
const AI_SESSION_TAB_FLEX_MIN_PX = 60;

const EMPTY_TAB_REFERENCES: AiPanelSessionTabReferences = {
  inlineImages: [],
  fileAttachments: [],
  pageCitations: [],
  transcriptCitations: []
};

type AiSessionTabDragState = {
  readonly tabId: string;
  readonly pointerId: number;
  readonly startClientX: number;
  readonly originIndex: number;
  readonly tabWidth: number;
  readonly lastTargetIndex: number;
  readonly moved: boolean;
};

type AiSessionTabDragVisualState = {
  readonly tabId: string;
  readonly dx: number;
};

const SessionTabIdentityIcon = ({
  desktopApi,
  workingDir
}: {
  readonly desktopApi: AiPanelSurfaceProps["desktopApi"];
  readonly workingDir?: string | null;
}) => {
  const icon = useSessionIdentityIcon(desktopApi, workingDir);
  return (
    <IdentityIconView
      className={SESSION_TAB_ICON_CLASS}
      imageClassName="lyra-agents-session-tab-image"
      iconUrl={icon.url}
      label={icon.label}
      fallback={<LyraLogo className={SESSION_TAB_LOGO_CLASS} alt="" />}
    />
  );
};

const AiPanelTabsHeader = ({
  desktopApi,
  tabs,
  activeSessionTabId,
  activeSessionId,
  onActivateSessionTab,
  onCloseSessionTab,
  onReorderSessionTabs,
  aiPanelSide,
  onToggleAiPanelSide,
  movePanelToLeftLabel,
  movePanelToRightLabel
}: {
  readonly desktopApi: AiPanelSurfaceProps["desktopApi"];
  readonly tabs: readonly AiPanelSessionTab[];
  readonly activeSessionTabId: string | null;
  readonly activeSessionId: string | null;
  readonly onActivateSessionTab?: (sessionId: string) => void;
  readonly onCloseSessionTab?: (sessionId: string) => void;
  readonly onReorderSessionTabs?: (sourceTabId: string, targetTabId: string) => void;
  readonly aiPanelSide?: AiPanelSurfaceProps["aiPanelSide"];
  readonly onToggleAiPanelSide?: () => void;
  readonly movePanelToLeftLabel?: string;
  readonly movePanelToRightLabel?: string;
}) => {
  const { session, messages, isTurnRunning, createSession } = useData();
  const rememberedReferences = useRef(new Map<string, AiPanelSessionTabReferences>());
  const dragRef = useRef<AiSessionTabDragState | null>(null);
  const suppressNextClickRef = useRef<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragVisual, setDragVisual] = useState<AiSessionTabDragVisualState | null>(null);
  const currentSessionId = session.id?.trim() || null;
  if (currentSessionId !== null) {
    const liveReferences = inlineReferenceRecords(messages);
    if (
      liveReferences.inlineImages.length > 0
      || liveReferences.fileAttachments.length > 0
      || liveReferences.pageCitations.length > 0
      || liveReferences.transcriptCitations.length > 0
    ) {
      rememberedReferences.current.set(currentSessionId, {
        transcriptCitations: liveReferences.transcriptCitations,
        pageCitations: liveReferences.pageCitations,
        fileAttachments: liveReferences.fileAttachments,
        inlineImages: liveReferences.inlineImages.map((image) => ({
          id: image.id,
          mediaType: image.mediaType,
          label: image.label ?? null,
          source: image.source ?? null
        }))
      });
    }
  }
  const effectiveActiveTabId =
    activeSessionTabId
    ?? tabs.find((tab) => tab.sessionId === activeSessionId)?.tabId
    ?? currentSessionId
    ?? (tabs.length === 0 ? "__local-draft" : null);
  const currentTab: AiPanelSessionTab | null =
    currentSessionId === null
      ? null
      : ({
          tabId: currentSessionId,
          sessionId: currentSessionId,
          title: session.title,
          lastKnownStatus: isTurnRunning ? "running" : null,
          workingDir: session.workingDir,
          projectBound: session.projectBound,
          workingDirIsHome: session.workingDirIsHome
        } satisfies AiPanelSessionTab);
  const visibleTabs =
    currentTab !== null && tabs.some((tab) => tab.sessionId === currentTab.sessionId) === false
      ? [...tabs, currentTab]
      : tabs.length > 0
        ? tabs
        : [{
            tabId: "__local-draft",
            sessionId: null,
            title: t("aiPanel.defaultSessionTitle"),
            lastKnownStatus: null
          } satisfies AiPanelSessionTab];
  const closeLock = useChromeTabStripCloseLock({
    tabCount: visibleTabs.length,
    onCloseTab: (tabId) => {
      onCloseSessionTab?.(tabId);
    }
  });

  const onTabPointerDown = useCallback((
    tab: AiPanelSessionTab,
    index: number,
    event: ReactPointerEvent<HTMLElement>
  ): void => {
    if (event.button !== 0 || onReorderSessionTabs === undefined) return;
    const tabWidth = Math.max(event.currentTarget.offsetWidth, AI_SESSION_TAB_FLEX_MIN_PX);
    dragRef.current = {
      tabId: tab.tabId,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      originIndex: index,
      tabWidth,
      lastTargetIndex: index,
      moved: false
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [onReorderSessionTabs]);

  const onTabPointerMove = useCallback((
    event: ReactPointerEvent<HTMLElement>
  ): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startClientX;
    if (!drag.moved && Math.abs(deltaX) < AI_SESSION_TAB_DRAG_THRESHOLD_PX) return;
    setDraggingTabId(drag.tabId);
    setDragVisual({ tabId: drag.tabId, dx: deltaX });
    event.preventDefault();
    const steps = Math.round(deltaX / drag.tabWidth);
    const destinationIndex = Math.min(
      visibleTabs.length - 1,
      Math.max(0, drag.originIndex + steps)
    );
    dragRef.current = {
      ...drag,
      moved: true,
      lastTargetIndex: destinationIndex
    };
  }, [visibleTabs.length]);

  const onTabPointerUp = useCallback((
    event: ReactPointerEvent<HTMLElement>
  ): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingTabId(null);
    setDragVisual(null);
    if (drag.moved) {
      const destination = visibleTabs[drag.lastTargetIndex];
      if (destination !== undefined && destination.tabId !== drag.tabId) {
        onReorderSessionTabs?.(drag.tabId, destination.tabId);
      }
      suppressNextClickRef.current = drag.tabId;
      window.setTimeout(() => {
        if (suppressNextClickRef.current === drag.tabId) {
          suppressNextClickRef.current = null;
        }
      }, 0);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, [onReorderSessionTabs, visibleTabs]);

  return (
    <header
      className={`${AGENTS_HEADER_CLASS} ${SESSION_TABS_HEADER_CLASS} select-none`}
      onPointerLeave={closeLock.onClearCloseLock}
    >
      <div
        className={cn(
          "lyra-tab-strip",
          SESSION_TAB_STRIP_CLASS,
          dragVisual !== null && `${SESSION_TAB_STRIP_CLASS} lyra-agents-session-tab-strip-sorting`,
          closeLock.closeLockedTabWidth !== null && "lyra-tab-strip-close-lock"
        )}
        role="tablist"
        aria-label={t("aiPanel.sessionTabsAriaLabel")}
      >
        <div className={SESSION_TAB_LIST_CLASS}>
          {visibleTabs.map((tab, index) => {
            const active = tab.tabId === effectiveActiveTabId;
            const hasCurrentSnapshot =
              tab.sessionId !== null && tab.sessionId === currentSessionId;
            const rawTitle = hasCurrentSnapshot
              ? session.title.trim() || tab.title
              : tab.title.trim();
            const records = hasCurrentSnapshot
              ? inlineReferenceRecords(messages)
              : tab.references
                ?? (tab.sessionId === null
                  ? undefined
                  : rememberedReferences.current.get(tab.sessionId))
                ?? EMPTY_TAB_REFERENCES;
            const title = inlineContentMarkersToDisplayText(
              rawTitle,
              records.transcriptCitations,
              records.pageCitations,
              records.inlineImages,
              records.fileAttachments
            ).trim() || t("aiPanel.defaultSessionTitle");
            const running = hasCurrentSnapshot ? isTurnRunning : tab.lastKnownStatus === "running";
            const workingDir = hasCurrentSnapshot
              ? session.workingDir
              : tab.workingDir ?? tab.draftWorkingDir ?? null;
            const tabStyle = dragVisual?.tabId === tab.tabId
              ? { transform: `translate3d(${Math.round(dragVisual.dx)}px, 0, 0)` }
              : undefined;
            return (
              <div
                key={tab.tabId}
                className={cn(
                  "lyra-tab-item",
                  SESSION_TAB_ITEM_CLASS,
                  active && "lyra-tab-item-active",
                  active && SESSION_TAB_ITEM_ACTIVE_CLASS,
                  running && "lyra-agents-session-tab-item-running",
                  draggingTabId === tab.tabId && SESSION_TAB_ITEM_DRAGGING_CLASS
                )}
                style={tabStyle}
                data-lyra-tab-id={tab.tabId}
                data-ai-session-tab-id={tab.tabId}
                onPointerMove={onTabPointerMove}
                onPointerUp={onTabPointerUp}
                onPointerCancel={onTabPointerUp}
                onMouseDown={(event) => {
                  if (isMiddleClick(event)) {
                    event.preventDefault();
                    closeLock.onCloseTab(tab.tabId, event);
                  }
                }}
                onAuxClick={(event) => {
                  if (isMiddleClick(event)) {
                    event.preventDefault();
                    closeLock.onCloseTab(tab.tabId, event);
                  }
                }}
              >
                <AppButton
                  className={`lyra-tab-main ${SESSION_TAB_MAIN_CLASS}`}
                  variant="ghost"
                  size="sm"
                  role="tab"
                  aria-selected={active}
                  aria-label={title}
                  title={title}
                  draggable={false}
                  onPointerDown={(event) => {
                    if (event.button === 1) {
                      event.preventDefault();
                      return;
                    }
                    onTabPointerDown(tab, index, event);
                  }}
                  onClick={() => {
                    if (suppressNextClickRef.current === tab.tabId) {
                      suppressNextClickRef.current = null;
                      return;
                    }
                    onActivateSessionTab?.(tab.tabId);
                  }}
                >
                  <SessionTabIdentityIcon desktopApi={desktopApi} workingDir={workingDir} />
                  <span className={`lyra-tab-title ${SESSION_TAB_TITLE_CLASS}`}>
                    <MessageCitationText
                      text={rawTitle.trim().length > 0 ? rawTitle : title}
                      transcriptCitations={records.transcriptCitations}
                      pageCitations={records.pageCitations}
                      inlineImages={records.inlineImages}
                      fileAttachments={records.fileAttachments}
                    />
                  </span>
                </AppButton>
                <AppIconButton
                  className={`lyra-tab-close ${SESSION_TAB_CLOSE_CLASS}`}
                  aria-label={formatMessage("aiPanel.closeSessionTabAriaLabel", { title })}
                  title={formatMessage("aiPanel.closeSessionTabAriaLabel", { title })}
                  onPointerDown={(event) => {
                    handleChromeTabClosePointerDown(event, (closeEvent) => {
                      closeLock.onCloseTab(tab.tabId, closeEvent);
                    });
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    handleChromeTabCloseClick(event, (closeEvent) => {
                      closeLock.onCloseTab(tab.tabId, closeEvent);
                    });
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </AppIconButton>
              </div>
            );
          })}
        </div>
        <AppIconButton
          className={`lyra-tab-add ${SESSION_TAB_ADD_CLASS}`}
          aria-label={t("header.newSession")}
          title={t("header.newSession")}
          onClick={() => {
            void createSession();
          }}
        >
          <Plus size={14} aria-hidden="true" />
        </AppIconButton>
      </div>
      <HeaderControls
        showNewSessionButton={false}
        {...(aiPanelSide === undefined ? {} : { aiPanelSide })}
        {...(onToggleAiPanelSide === undefined ? {} : { onToggleAiPanelSide })}
        {...(movePanelToLeftLabel === undefined ? {} : { movePanelToLeftLabel })}
        {...(movePanelToRightLabel === undefined ? {} : { movePanelToRightLabel })}
      />
    </header>
  );
};

export const AiPanelSurface = ({
  variant: _variant,
  desktopApi,
  settingsAiModel,
  activeSessionTabId = null,
  activeSessionId = null,
  onActiveSessionChange,
  sessionTabs = [],
  onActivateSessionTab,
  onCloseSessionTab,
  onReorderSessionTabs,
  onCreateDraftSessionTab,
  onCreateSessionTab,
  onMissingSession,
  onSessionSnapshotChange,
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
  onOpenTerminalLiveSession,
  onOpenFile,
  onRevealPathInWorkbench,
  openDialog,
  title,
  aiPanelSide,
  onToggleAiPanelSide,
  movePanelToLeftLabel,
  movePanelToRightLabel,
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
}: AiPanelSurfaceProps) => {
  const activeTab =
    sessionTabs.find((tab) => tab.tabId === activeSessionTabId)
    ?? sessionTabs.find((tab) => tab.sessionId === activeSessionId)
    ?? null;
  const activeDraftTabId = activeTab?.sessionId === null ? activeTab.tabId : null;
  const updateActiveDraftWorkingDir = useCallback(
    (workingDir: string): void => {
      if (activeDraftTabId === null) return;
      onUpdateDraftWorkingDir?.(activeDraftTabId, workingDir);
    },
    [activeDraftTabId, onUpdateDraftWorkingDir]
  );
  const provider = useLyraAgentDataProvider(
    desktopApi,
    settingsAiModel,
    activeSessionId,
    activeTab?.sessionId === null ? activeTab.draftWorkingDir ?? null : null,
    sessionTabs.length > 0,
    {
      onActiveSessionChange,
      onSessionSnapshotChange,
      onCreateDraftSessionTab,
      onCreateSessionTab,
      onMissingSession,
      onRequestProjectBind,
      onUpdateDraftWorkingDir: updateActiveDraftWorkingDir,
      onOpenProjectTree,
      onOpenPlanBoard,
      onOpenProjectPlanManager,
      ...(onOpenAgentGit === undefined ? {} : { onOpenAgentGit }),
      ...(onOpenSubagent === undefined ? {} : { onOpenSubagent }),
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
      aiRichRenderingEnabled
    }
  );

  return (
    <AppPanel placement="right" className={AI_PANEL_SHELL_CLASS} aria-label={title}>
      {provider.error === null ? null : (
        <AppStatusMessage className={AI_PANEL_ERROR_CLASS} role="status" tone="error">
          {provider.error}
        </AppStatusMessage>
      )}
      <div className={AGENTS_HOST_CLASS}>
        <LyraAgentsApp
          data={provider.data}
          desktopApi={desktopApi}
          headerSlot={
            <AiPanelTabsHeader
              desktopApi={desktopApi}
              tabs={sessionTabs}
              activeSessionTabId={activeSessionTabId ?? null}
              activeSessionId={activeSessionId}
              {...(onActivateSessionTab === undefined ? {} : { onActivateSessionTab })}
              {...(onCloseSessionTab === undefined ? {} : { onCloseSessionTab })}
              {...(onReorderSessionTabs === undefined ? {} : { onReorderSessionTabs })}
              {...(aiPanelSide === undefined ? {} : { aiPanelSide })}
              {...(onToggleAiPanelSide === undefined ? {} : { onToggleAiPanelSide })}
              {...(movePanelToLeftLabel === undefined ? {} : { movePanelToLeftLabel })}
              {...(movePanelToRightLabel === undefined ? {} : { movePanelToRightLabel })}
            />
          }
        />
      </div>
    </AppPanel>
  );
};
