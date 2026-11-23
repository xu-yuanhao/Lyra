import {
  CircleAlert,
  PanelBottom,
  PanelTop,
  Pin,
  Plus,
  SplitSquareHorizontal,
  SplitSquareVertical,
  SquareTerminal,
  Star,
  X
} from "@lyra/icons";
import {
  useCallback,
  useState,
  type DragEvent as ReactDragEvent
} from "react";
import "xterm/css/xterm.css";

import {
  clearTerminalTabDragPayload,
  readTerminalTabDragPayload,
  setTerminalTabDragImage,
  writeTerminalTabDragPayload
} from "./drag-transfer";
import { TerminalPaneSurface } from "./pane-surface";
import type { TerminalDockProps } from "./types";
import { IdentityIconView, type ResolvedIdentityIcon } from "../identity";
import { LyraLogo } from "@renderer/ui/app";
import { APP_TAB_ITEM_CLASS, AppIconButton, Tabs, TabsList, TabsTrigger } from "@renderer/ui/components";
import { cn } from "@renderer/ui/utils";
import { isMiddleClick } from "../ui-primitives";
import { ProblemsList } from "../bottom-aux/problems-list";
import { filterDiagnosticsForRoot, useWorkspaceProblems } from "../bottom-aux/problems";
import {
  TD_BOTTOM_AUX_INACTIVE_CLASS,
  TD_DOCK_CLASS,
  TD_DOCK_DROP_TARGET_CLASS,
  TD_SIDE_CLASS,
  TD_TABS_CLASS,
  TD_TABS_DROP_END_CLASS,
  TD_TAB_CLASS,
  TD_TAB_DROP_BEFORE_CLASS,
  TD_TAB_ACTIVE_CLASS,
  TD_TAB_TRIGGER_CLASS,
  TD_TAB_ICON_CLASS,
  TD_TAB_ICON_IMAGE_CLASS,
  TD_TAB_TITLE_CLASS,
  TD_TAB_BADGE_CLASS,
  TD_TAB_CLOSE_CLASS,
  TD_TAB_LYRA_LOGO_CLASS,
  TD_TOOLBAR_ACTIONS_CLASS,
  TD_STAGE_CLASS,
  TD_EMPTY_CLASS,
  TD_PANES_CLASS,
  TD_PANES_HORIZONTAL_CLASS,
  TD_PANES_VERTICAL_CLASS,
} from "./classes";

const terminalTabDisplayTitles = (
  tabs: readonly { readonly id: string; readonly title: string }[]
): Readonly<Record<string, string>> => {
  const totals = new Map<string, number>();
  for (const tab of tabs) {
    totals.set(tab.title, (totals.get(tab.title) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  const titles: Record<string, string> = {};
  for (const tab of tabs) {
    const nextSeen = (seen.get(tab.title) ?? 0) + 1;
    seen.set(tab.title, nextSeen);
    titles[tab.id] =
      (totals.get(tab.title) ?? 0) > 1 && nextSeen > 1
        ? `${tab.title} ${nextSeen}`
        : tab.title;
  }
  return titles;
};

const TerminalTabIcon = ({
  icon
}: {
  readonly icon?: ResolvedIdentityIcon | undefined;
}) => (
  <IdentityIconView
    className={TD_TAB_ICON_CLASS}
    imageClassName={TD_TAB_ICON_IMAGE_CLASS}
    iconUrl={icon?.url ?? null}
    label={icon?.label}
    fallback={
      icon?.renderHint === "lyra-logo"
        ? <LyraLogo className={TD_TAB_LYRA_LOGO_CLASS} alt="" />
        : <SquareTerminal size={13} />
    }
  />
);

export const TerminalDock = ({
  desktopApi,
  labels,
  themeSignature,
  uiThemeId,
  model,
  terminalIdentityByTabId = {},
  terminalPanelSide,
  onRequestCloseTab,
  onRequestTabContextMenu,
  onToggleTerminalPanelSide,
  onDropWorkspaceTerminalTab,
  problems
}: TerminalDockProps) => {
  const activeDockTab = model.activeDockTab;
  const problemsTabs = problems?.tabs ?? [];
  const activeProblemsTab = problemsTabs.find((tab) => tab.id === problems?.activeId);
  const problemsActive = activeProblemsTab !== undefined;
  const displayTitleByTabId = terminalTabDisplayTitles([...model.dockTabs, ...problemsTabs]);
  const diagnostics = useWorkspaceProblems(desktopApi);
  const visibleProblems = activeProblemsTab === undefined
    ? []
    : filterDiagnosticsForRoot(diagnostics, activeProblemsTab.rootPath);
  const [isWorkspaceDropActive, setIsWorkspaceDropActive] = useState(false);
  const [dockDropIndex, setDockDropIndex] = useState<number | null>(null);

  const clearDragUiState = useCallback((): void => {
    setIsWorkspaceDropActive(false);
    setDockDropIndex(null);
  }, []);

  const resolveDockDropIndex = useCallback(
    (event: ReactDragEvent<HTMLElement>): number => {
      const host = event.currentTarget;
      const tabsHost = host.querySelector<HTMLElement>(".lyra-terminal-tabs");
      if (tabsHost === null) {
        return model.dockTabs.length;
      }

      const tabsRect = tabsHost.getBoundingClientRect();
      const inTabsArea =
        event.clientX >= tabsRect.left &&
        event.clientX <= tabsRect.right &&
        event.clientY >= tabsRect.top &&
        event.clientY <= tabsRect.bottom;
      if (inTabsArea === false) {
        return model.dockTabs.length;
      }

      const tabElements = Array.from(
        tabsHost.querySelectorAll<HTMLElement>(".lyra-terminal-tab[data-lyra-terminal-tab-id]")
      );
      if (tabElements.length === 0) {
        return 0;
      }

      for (let index = 0; index < tabElements.length; index += 1) {
        const tabElement = tabElements[index];
        if (tabElement === undefined) {
          continue;
        }
        const rect = tabElement.getBoundingClientRect();
        if (event.clientY < rect.top + rect.height / 2) {
          return index;
        }
      }

      return tabElements.length;
    },
    [model.dockTabs.length]
  );

  const onDockTabDragStart = useCallback(
    (event: ReactDragEvent<HTMLElement>, tabId: string): void => {
      writeTerminalTabDragPayload(event.dataTransfer, {
        source: "dock",
        tabId
      });
      setTerminalTabDragImage(
        event.dataTransfer,
        event.currentTarget,
        event.clientX,
        event.clientY
      );
    },
    []
  );

  const onWorkspaceDragOver = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      const payload = readTerminalTabDragPayload(event.dataTransfer);
      if (payload === null) {
        clearDragUiState();
        return;
      }
      const nextDropIndex = resolveDockDropIndex(event);
      if (payload.source === "workspace") {
        if (onDropWorkspaceTerminalTab === undefined) {
          clearDragUiState();
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDockDropIndex(nextDropIndex);
        if (isWorkspaceDropActive === false) {
          setIsWorkspaceDropActive(true);
        }
        return;
      }
      if (payload.source === "dock") {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDockDropIndex(nextDropIndex);
        if (isWorkspaceDropActive) {
          setIsWorkspaceDropActive(false);
        }
        return;
      }

      clearDragUiState();
    },
    [
      clearDragUiState,
      isWorkspaceDropActive,
      onDropWorkspaceTerminalTab,
      resolveDockDropIndex
    ]
  );

  const onWorkspaceDragLeave = useCallback((event: ReactDragEvent<HTMLElement>) => {
    const currentTarget = event.currentTarget;
    if (currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    clearDragUiState();
  }, [clearDragUiState]);

  const onWorkspaceDrop = useCallback(
    (event: ReactDragEvent<HTMLElement>) => {
      const dropIndex = resolveDockDropIndex(event);
      const payload = readTerminalTabDragPayload(event.dataTransfer);
      clearDragUiState();
      clearTerminalTabDragPayload();
      if (payload === null) {
        return;
      }
      event.preventDefault();
      if (payload.source === "workspace") {
        if (onDropWorkspaceTerminalTab === undefined) {
          return;
        }
        onDropWorkspaceTerminalTab(payload.tabId, dropIndex);
        return;
      }
      if (payload.source === "dock") {
        model.reorderDockTab(payload.tabId, dropIndex);
      }
    },
    [
      clearDragUiState,
      model,
      onDropWorkspaceTerminalTab,
      resolveDockDropIndex
    ]
  );

  return (
    <section
      className={cn(
        TD_DOCK_CLASS,
        isWorkspaceDropActive && TD_DOCK_DROP_TARGET_CLASS
      )}
      aria-label="terminal-dock"
      onDragOverCapture={onWorkspaceDragOver}
      onDragEnterCapture={onWorkspaceDragOver}
      onDragLeaveCapture={onWorkspaceDragLeave}
      onDropCapture={onWorkspaceDrop}
    >
      <aside className={TD_SIDE_CLASS} aria-label="terminal-tabs-side">
        <nav
          className={cn(
            TD_TABS_CLASS,
            dockDropIndex !== null && dockDropIndex >= model.dockTabs.length
              && TD_TABS_DROP_END_CLASS
          )}
          aria-label="terminal-tabs"
        >
          <Tabs
            className="contents"
            orientation="vertical"
            value={problemsActive ? "" : activeDockTab?.id ?? ""}
            onValueChange={(tabId) => {
              problems?.onClearSelection();
              model.setActiveTab(tabId);
            }}
          >
            <TabsList className="contents" aria-label="terminal-tabs">
              {model.dockTabs.map((tab, index) => (
                <div
                  key={tab.id}
                  className={cn(
                    APP_TAB_ITEM_CLASS,
                    TD_TAB_CLASS,
                    "lyra-allow-web-drag",
                    problemsActive === false && tab.id === activeDockTab?.id && "lyra-tab-item-active",
                    problemsActive === false && tab.id === activeDockTab?.id && TD_TAB_ACTIVE_CLASS,
                    dockDropIndex !== null && dockDropIndex === index
                      && TD_TAB_DROP_BEFORE_CLASS
                  )}
                  data-lyra-tab-id={tab.id}
                  data-lyra-terminal-tab-id={tab.id}
                  data-lyra-allow-web-drag="true"
                  draggable
                  onMouseDown={(event) => {
                    if (isMiddleClick(event)) {
                      event.preventDefault();
                      onRequestCloseTab(tab.id);
                    }
                  }}
                  onAuxClick={(event) => {
                    if (isMiddleClick(event)) {
                      event.preventDefault();
                      onRequestCloseTab(tab.id);
                    }
                  }}
                  onDragStart={(event: ReactDragEvent<HTMLDivElement>) => {
                    onDockTabDragStart(event, tab.id);
                  }}
                  onDragEnd={() => {
                    clearTerminalTabDragPayload();
                    clearDragUiState();
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onRequestTabContextMenu({
                      tabId: tab.id,
                      anchorX: event.clientX,
                      anchorY: event.clientY
                    });
                  }}
                >
                  <TabsTrigger
                    className={TD_TAB_TRIGGER_CLASS}
                    value={tab.id}
                    aria-label={displayTitleByTabId[tab.id] ?? tab.title}
                    data-lyra-allow-web-drag="true"
                    draggable
                    onDragStart={(event: ReactDragEvent<HTMLButtonElement>) => {
                      onDockTabDragStart(event, tab.id);
                    }}
                    onDragEnd={() => {
                      clearTerminalTabDragPayload();
                      clearDragUiState();
                    }}
                    onDoubleClick={() => {
                      const nextTitle = window.prompt(labels.renameTab, tab.title);
                      if (nextTitle !== null) {
                        model.renameTab(tab.id, nextTitle);
                      }
                    }}
                  >
                    <TerminalTabIcon icon={terminalIdentityByTabId[tab.id]} />
                    <span className={TD_TAB_TITLE_CLASS}>{displayTitleByTabId[tab.id] ?? tab.title}</span>
                    {tab.pinned ? (
                      <span className={TD_TAB_BADGE_CLASS} title={labels.unpinTab} aria-hidden="true">
                        <Pin size={10} />
                      </span>
                    ) : null}
                    {tab.favorite ? (
                      <span className={TD_TAB_BADGE_CLASS} title={labels.unfavoriteTab} aria-hidden="true">
                        <Star size={10} />
                      </span>
                    ) : null}
                  </TabsTrigger>
                  <AppIconButton
                    className={TD_TAB_CLOSE_CLASS}
                    aria-label={labels.closeTab}
                    title={labels.closeTab}
                    onClick={() => {
                      onRequestCloseTab(tab.id);
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                  </AppIconButton>
                </div>
              ))}
            </TabsList>
          </Tabs>
          <Tabs
            className="contents"
            orientation="vertical"
            value={problems?.activeId ?? ""}
            onValueChange={(tabId) => {
              problems?.onSelectTab(tabId);
            }}
          >
            <TabsList className="contents" aria-label={problems?.labels.list ?? "problems-tabs"}>
              {problemsTabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    APP_TAB_ITEM_CLASS,
                    TD_TAB_CLASS,
                    tab.id === problems?.activeId && "lyra-tab-item-active",
                    tab.id === problems?.activeId && TD_TAB_ACTIVE_CLASS
                  )}
                  data-lyra-problems-tab-id={tab.id}
                  onMouseDown={(event) => {
                    if (isMiddleClick(event)) {
                      event.preventDefault();
                      problems?.onCloseTab(tab.id);
                    }
                  }}
                  onAuxClick={(event) => {
                    if (isMiddleClick(event)) {
                      event.preventDefault();
                      problems?.onCloseTab(tab.id);
                    }
                  }}
                >
                  <TabsTrigger
                    className={TD_TAB_TRIGGER_CLASS}
                    value={tab.id}
                    aria-label={displayTitleByTabId[tab.id] ?? tab.title}
                  >
                    <span className={TD_TAB_ICON_CLASS} aria-hidden="true">
                      <CircleAlert size={13} />
                    </span>
                    <span className={TD_TAB_TITLE_CLASS}>{displayTitleByTabId[tab.id] ?? tab.title}</span>
                  </TabsTrigger>
                  <AppIconButton
                    className={TD_TAB_CLOSE_CLASS}
                    aria-label={labels.closeTab}
                    title={labels.closeTab}
                    onClick={() => {
                      problems?.onCloseTab(tab.id);
                    }}
                  >
                    <X size={12} aria-hidden="true" />
                  </AppIconButton>
                </div>
              ))}
            </TabsList>
          </Tabs>
        </nav>
        <div className={TD_TOOLBAR_ACTIONS_CLASS}>
          <AppIconButton
            aria-label={labels.newTab}
            title={labels.newTab}
            onClick={() => {
              problems?.onClearSelection();
              model.openTab();
            }}
          >
            <Plus size={14} aria-hidden="true" />
          </AppIconButton>
          <AppIconButton
            aria-label={labels.splitHorizontal}
            disabled={activeDockTab === null || problemsActive}
            onClick={() => {
              model.splitActivePane("horizontal");
            }}
          >
            <SplitSquareVertical size={14} aria-hidden="true" />
          </AppIconButton>
          <AppIconButton
            aria-label={labels.splitVertical}
            disabled={activeDockTab === null || problemsActive}
            onClick={() => {
              model.splitActivePane("vertical");
            }}
          >
            <SplitSquareHorizontal size={14} aria-hidden="true" />
          </AppIconButton>
          <AppIconButton
            aria-label={
              terminalPanelSide === "top"
                ? labels.moveTerminalToBottom
                : labels.moveTerminalToTop
            }
            onClick={onToggleTerminalPanelSide}
          >
            {terminalPanelSide === "top" ? (
              <PanelBottom size={14} aria-hidden="true" />
            ) : (
              <PanelTop size={14} aria-hidden="true" />
            )}
          </AppIconButton>
        </div>
      </aside>

      <section className={TD_STAGE_CLASS}>
        {activeDockTab === null ? (
          <section className={TD_EMPTY_CLASS} />
        ) : (
          <section
            className={cn(
              activeDockTab.orientation === "vertical"
                ? `${TD_PANES_CLASS} ${TD_PANES_VERTICAL_CLASS}`
                : `${TD_PANES_CLASS} ${TD_PANES_HORIZONTAL_CLASS}`,
              problemsActive && TD_BOTTOM_AUX_INACTIVE_CLASS
            )}
            aria-hidden={problemsActive}
          >
            {model.activeDockPanes.map((pane) => (
              <TerminalPaneSurface
                key={pane.id}
                pane={pane}
                terminalTabId={activeDockTab.id}
                active={pane.id === activeDockTab.activePaneId}
                desktopApi={desktopApi}
                labels={labels}
                themeSignature={themeSignature}
                uiThemeId={uiThemeId}
                canClose={model.activeDockPanes.length > 1}
                onClose={() => {
                  model.closePane(activeDockTab.id, pane.id);
                }}
                onFocus={() => {
                  model.focusPane(activeDockTab.id, pane.id);
                }}
              />
            ))}
          </section>
        )}
        {activeProblemsTab === undefined || problems === undefined ? null : (
          <ProblemsList
            items={visibleProblems}
            rootPath={activeProblemsTab.rootPath}
            emptyLabel={problems.labels.empty}
            listLabel={problems.labels.list}
            onOpenFile={(filePath, location) => {
              problems.onOpenFile(filePath, location, activeProblemsTab.instanceId);
            }}
          />
        )}
      </section>
    </section>
  );
};
