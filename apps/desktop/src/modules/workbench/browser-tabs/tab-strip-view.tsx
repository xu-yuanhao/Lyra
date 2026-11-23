import {
  ChevronLeft,
  ChevronRight,
  Globe,
  House,
  Plus,
  Search,
  Settings2,
  SquareTerminal,
  X
} from "@lyra/icons";
import {
  type SyntheticEvent
} from "react";

import {
  APP_TAB_CLOSE_CLASS,
  APP_TAB_TITLE_CLASS,
  AppIconButton,
  Tabs,
  TabsList,
  TabsTrigger
} from "@renderer/ui/components";
import { cn } from "@renderer/ui/utils";
import { LyraLogo } from "@renderer/ui/app";
import { IdentityIconView } from "../identity";
import {
  cx,
  handleChromeTabCloseClick,
  handleChromeTabClosePointerDown,
  isChromeTabCloseTarget,
  isMiddleClick,
  type ChromeTabCloseGestureEvent
} from "../ui-primitives";
import { isAgentProjectTreeAppId, renderWorkspaceAppIcon } from "../workspace-apps";
import type { WorkspaceTab } from "../workspace-tabs/types";
import { BrowserChromeSurface } from "./browser-chrome-surface";
import type { BrowserTabStripRenderModel } from "./tab-strip-render-model";
import {
  BROWSER_NAV_BUTTON_CLASS,
  BROWSER_TAB_ADD_CLASS,
  BROWSER_TAB_APP_IDENTITY_ICON_CLASS,
  BROWSER_TAB_CLOSE_CLASS,
  BROWSER_TAB_FAVICON_CLASS,
  BROWSER_TAB_FAVICON_FALLBACK_CLASS,
  BROWSER_TAB_ICON_CLASS,
  BROWSER_TAB_ICON_SVG_CLASS,
  BROWSER_TAB_LIST_CLASS,
  BROWSER_TAB_LYRA_LOGO_CLASS,
  BROWSER_TAB_RIGHT_DRAG_PREVIEW_CLOSE_CLASS,
  BROWSER_TAB_RIGHT_DRAG_PREVIEW_MAIN_CLASS,
  BROWSER_TAB_RIGHT_DRAG_PREVIEW_SHELL_CLASS,
  BROWSER_TAB_RIGHT_DRAG_PREVIEW_TAB_CLASS,
  BROWSER_TAB_TERMINAL_ICON_CLASS,
  BROWSER_TAB_TITLE_CLASS,
  BROWSER_TABS_GRID_CLASS,
  BROWSER_TABS_NAVIGATION_CLASS,
  BROWSER_TABS_TOOLBAR_CLASS,
  BROWSER_TABS_TOOLBAR_CONTEXT_CLASS,
  BROWSER_TABS_TOOLBAR_CONTROLS_CLASS,
  BROWSER_TABS_WITH_NAVIGATION_CLASS
} from "./classes";
import type { BrowserTabStripProps } from "./tab-strip-types";
import type { BrowserTabStripRuntime } from "./use-browser-tab-strip-runtime";

type BrowserTabStripViewProps = Pick<
  BrowserTabStripProps,
  | "activeTabId"
  | "goBackLabel"
  | "goForwardLabel"
  | "canGoBack"
  | "canGoForward"
  | "openNewTabLabel"
  | "terminalIdentityByTabId"
  | "workspaceAppIdentityByTabId"
  | "navigationControl"
  | "toolbarContextControl"
  | "onGoBack"
  | "onGoForward"
  | "onActivateTab"
  | "onOpenNewTab"
> & {
  readonly onClearTabCloseLock: () => void;
  readonly onCloseTab: (
    tabId: string,
    event: ChromeTabCloseGestureEvent
  ) => void;
  readonly renderModel: BrowserTabStripRenderModel;
  readonly runtime: BrowserTabStripRuntime;
};

type BrowserTabStripControlsProps = Pick<
  BrowserTabStripViewProps,
  | "goBackLabel"
  | "goForwardLabel"
  | "canGoBack"
  | "canGoForward"
  | "onGoBack"
  | "onGoForward"
>;

const BrowserTabDefaultIcon = () => (
  <Globe size={14} className={BROWSER_TAB_ICON_SVG_CLASS} />
);

const handleFaviconLoad = (event: SyntheticEvent<HTMLImageElement>) => {
  delete event.currentTarget.dataset.failed;
};

const handleFaviconError = (event: SyntheticEvent<HTMLImageElement>) => {
  event.currentTarget.dataset.failed = "true";
};

const BrowserTabIcon = ({
  tab,
  terminalIdentityByTabId,
  workspaceAppIdentityByTabId
}: {
  readonly tab: WorkspaceTab;
  readonly terminalIdentityByTabId?: BrowserTabStripProps["terminalIdentityByTabId"];
  readonly workspaceAppIdentityByTabId?: BrowserTabStripProps["workspaceAppIdentityByTabId"];
}) => {
  const faviconUrl = tab.faviconUrl?.trim();

  if (tab.pageKind === "settings") {
    return <Settings2 size={14} className={BROWSER_TAB_ICON_SVG_CLASS} />;
  }

  if (tab.pageKind === "results") {
    return <Search size={14} className={BROWSER_TAB_ICON_SVG_CLASS} />;
  }

  if (tab.pageKind === "search") {
    return <House size={14} className={BROWSER_TAB_ICON_SVG_CLASS} />;
  }

  if (tab.pageKind === "terminal") {
    const icon = tab.terminalTabId === undefined
      ? undefined
      : terminalIdentityByTabId?.[tab.terminalTabId];
    return (
      <IdentityIconView
        className={BROWSER_TAB_TERMINAL_ICON_CLASS}
        imageClassName={BROWSER_TAB_FAVICON_CLASS}
        iconUrl={icon?.url ?? null}
        label={icon?.label}
        fallback={
          icon?.renderHint === "lyra-logo"
            ? <LyraLogo className={BROWSER_TAB_LYRA_LOGO_CLASS} alt="" />
            : <SquareTerminal size={14} className={BROWSER_TAB_ICON_SVG_CLASS} />
        }
      />
    );
  }

  if (tab.pageKind === "app" && tab.appId !== undefined && tab.appIconKey !== undefined) {
    const appIcon = workspaceAppIdentityByTabId?.[tab.id];
    if (isAgentProjectTreeAppId(tab.appId)) {
      return (
        <IdentityIconView
          className={BROWSER_TAB_APP_IDENTITY_ICON_CLASS}
          imageClassName={BROWSER_TAB_FAVICON_CLASS}
          iconUrl={appIcon?.url ?? null}
          label={appIcon?.label}
          fallback={
            appIcon?.renderHint === "lyra-logo"
              ? <LyraLogo className={BROWSER_TAB_LYRA_LOGO_CLASS} alt="" />
              : renderWorkspaceAppIcon(tab.appId, tab.appIconKey)
          }
        />
      );
    }
    return renderWorkspaceAppIcon(tab.appId, tab.appIconKey);
  }

  if (faviconUrl !== undefined && faviconUrl.length > 0) {
    return (
      <>
        <img
          src={faviconUrl}
          alt=""
          className={BROWSER_TAB_FAVICON_CLASS}
          loading="eager"
          decoding="async"
          onLoad={handleFaviconLoad}
          onError={handleFaviconError}
        />
        <span className={BROWSER_TAB_FAVICON_FALLBACK_CLASS}>
          <BrowserTabDefaultIcon />
        </span>
      </>
    );
  }

  return <BrowserTabDefaultIcon />;
};

const BROWSER_TAB_TRIGGER_CLASS = cn(
  "flex-none justify-start py-0",
  "data-[state=active]:bg-transparent data-[state=active]:text-inherit",
  "group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-0"
);

const BROWSER_TAB_LIST_OVERRIDE_CLASS = cn(
  BROWSER_TAB_LIST_CLASS,
  "min-w-0 flex-1 items-stretch justify-start gap-0 p-0 text-inherit h-full!"
);

const BrowserTabStripControls = ({
  goBackLabel,
  goForwardLabel,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward
}: BrowserTabStripControlsProps) => (
  <>
    <AppIconButton
      className={BROWSER_NAV_BUTTON_CLASS}
      aria-label={goBackLabel}
      disabled={!canGoBack}
      onClick={onGoBack}
    >
      <ChevronLeft size={14} />
    </AppIconButton>
    <AppIconButton
      className={BROWSER_NAV_BUTTON_CLASS}
      aria-label={goForwardLabel}
      disabled={!canGoForward}
      onClick={onGoForward}
    >
      <ChevronRight size={14} />
    </AppIconButton>
  </>
);

export const BrowserTabStripView = ({
  renderModel,
  runtime,
  activeTabId,
  goBackLabel,
  goForwardLabel,
  canGoBack,
  canGoForward,
  openNewTabLabel,
  terminalIdentityByTabId,
  workspaceAppIdentityByTabId,
  navigationControl,
  toolbarContextControl,
  onGoBack,
  onGoForward,
  onActivateTab,
  onCloseTab,
  onClearTabCloseLock,
  onOpenNewTab
}: BrowserTabStripViewProps) => {
  const hasNavigationControl =
    navigationControl !== undefined && navigationControl !== null;
  const navigationButtons = (
    <BrowserTabStripControls
      goBackLabel={goBackLabel}
      goForwardLabel={goForwardLabel}
      canGoBack={canGoBack}
      canGoForward={canGoForward}
      onGoBack={onGoBack}
      onGoForward={onGoForward}
    />
  );

  const toolbar = hasNavigationControl ? (
    <div className={BROWSER_TABS_TOOLBAR_CLASS}>
      <div className={BROWSER_TABS_TOOLBAR_CONTROLS_CLASS}>
        {navigationButtons}
      </div>
      <div className={BROWSER_TABS_NAVIGATION_CLASS}>
        {navigationControl}
      </div>
      <div className={BROWSER_TABS_TOOLBAR_CONTEXT_CLASS}>
        {toolbarContextControl}
      </div>
    </div>
  ) : navigationButtons;

  const closeTabFromPointer = (
    tabId: string,
    event: ChromeTabCloseGestureEvent
  ): void => {
    onCloseTab(tabId, event);
  };

  const tabStrip = (
    <>
      <div
        className={renderModel.stripClassName}
        onPointerLeave={onClearTabCloseLock}
      >
        <Tabs
          className="contents"
          value={activeTabId}
          onValueChange={(value) => {
            onActivateTab(value);
          }}
        >
        <TabsList
          variant="line"
          className={BROWSER_TAB_LIST_OVERRIDE_CLASS}
        >
          {renderModel.tabs.map((tabModel) => (
            <div
              key={tabModel.tab.id}
              className={tabModel.tabClassName}
              style={tabModel.tabStyle}
              data-lyra-tab-id={tabModel.tab.id}
              data-agent-active={tabModel.isAgentActive ? "true" : "false"}
              data-lyra-allow-web-drag="true"
              draggable
              onMouseDown={(event) => {
                if (isMiddleClick(event)) {
                  event.preventDefault();
                  if (tabModel.showClose) {
                    closeTabFromPointer(tabModel.tab.id, event);
                  }
                  return;
                }
                runtime.onTabItemMouseDown(event, tabModel.tab.id);
              }}
              onMouseUp={(event) => {
                runtime.onTabItemMouseUp(event, tabModel.tab);
              }}
              onAuxClick={(event) => {
                if (isMiddleClick(event) && tabModel.showClose) {
                  event.preventDefault();
                  closeTabFromPointer(tabModel.tab.id, event);
                }
              }}
              onDragStart={(event) => {
                if (isChromeTabCloseTarget(event.target)) {
                  event.preventDefault();
                  return;
                }
                runtime.onWorkspaceTabDragStart(event, tabModel.tab);
              }}
              onDragEnd={runtime.onTabDragEnd}
              onContextMenu={runtime.onTabItemContextMenu}
            >
              <TabsTrigger
                className={cn(tabModel.tabMainClassName, BROWSER_TAB_TRIGGER_CLASS)}
                value={tabModel.tab.id}
                aria-label={tabModel.tab.title}
                title={tabModel.tab.title}
                data-lyra-allow-web-drag="true"
                draggable
                onMouseDown={(event) => {
                  if (isMiddleClick(event)) {
                    event.preventDefault();
                    return;
                  }
                  runtime.onTabItemMouseDown(event, tabModel.tab.id);
                }}
                onDragStart={(event) => {
                  if (isChromeTabCloseTarget(event.target)) {
                    event.preventDefault();
                    return;
                  }
                  runtime.onWorkspaceTabDragStart(event, tabModel.tab);
                }}
                onDragEnd={runtime.onTabDragEnd}
              >
                <span className={BROWSER_TAB_ICON_CLASS} aria-hidden="true">
                  <BrowserTabIcon
                    tab={tabModel.tab}
                    terminalIdentityByTabId={terminalIdentityByTabId}
                    workspaceAppIdentityByTabId={workspaceAppIdentityByTabId}
                  />
                </span>
                <span className={`${APP_TAB_TITLE_CLASS} ${BROWSER_TAB_TITLE_CLASS}`}>{tabModel.tab.title}</span>
              </TabsTrigger>
              {tabModel.showClose ? (
                <AppIconButton
                  className={`${APP_TAB_CLOSE_CLASS} ${BROWSER_TAB_CLOSE_CLASS}`}
                  aria-label={tabModel.closeLabel}
                  draggable={false}
                  onPointerDown={(event) => {
                    handleChromeTabClosePointerDown(event, (closeEvent) => {
                      closeTabFromPointer(tabModel.tab.id, closeEvent);
                    });
                  }}
                  onMouseDown={(event) => {
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    handleChromeTabCloseClick(event, (closeEvent) => {
                      closeTabFromPointer(tabModel.tab.id, closeEvent);
                    });
                  }}
                >
                  <X size={12} />
                </AppIconButton>
              ) : null}
            </div>
          ))}
        </TabsList>
        </Tabs>
        <AppIconButton
          className={BROWSER_TAB_ADD_CLASS}
          aria-label={openNewTabLabel}
          onClick={onOpenNewTab}
        >
          <Plus size={14} />
        </AppIconButton>
      </div>
      {renderModel.preview !== null ? (
        <div
          className={BROWSER_TAB_RIGHT_DRAG_PREVIEW_SHELL_CLASS}
          style={renderModel.preview.shellStyle}
          aria-hidden="true"
        >
          <div
            className={`${renderModel.preview.tabClassName} ${BROWSER_TAB_RIGHT_DRAG_PREVIEW_TAB_CLASS}`}
            style={renderModel.preview.tabStyle}
          >
            <span className={`${renderModel.preview.mainClassName} ${BROWSER_TAB_RIGHT_DRAG_PREVIEW_MAIN_CLASS}`}>
              <span className={BROWSER_TAB_ICON_CLASS} aria-hidden="true">
                <BrowserTabIcon
                  tab={renderModel.preview.tab}
                  terminalIdentityByTabId={terminalIdentityByTabId}
                  workspaceAppIdentityByTabId={workspaceAppIdentityByTabId}
                />
              </span>
              <span className={`${APP_TAB_TITLE_CLASS} ${BROWSER_TAB_TITLE_CLASS}`}>{renderModel.preview.tab.title}</span>
            </span>
            <AppIconButton
              className={`${APP_TAB_CLOSE_CLASS} ${BROWSER_TAB_CLOSE_CLASS} ${BROWSER_TAB_RIGHT_DRAG_PREVIEW_CLOSE_CLASS}`}
              tabIndex={-1}
              aria-hidden="true"
            >
              <X size={12} />
            </AppIconButton>
          </div>
        </div>
      ) : null}
    </>
  );

  return (
    <nav
      ref={runtime.navRef}
      className={cx(
        renderModel.navClassName,
        hasNavigationControl ? BROWSER_TABS_WITH_NAVIGATION_CLASS : BROWSER_TABS_GRID_CLASS
      )}
      style={renderModel.navStyle}
      aria-label="browser-tabs"
      onDragOver={runtime.onTabBarDragOver}
      onDragEnter={runtime.onTabBarDragOver}
      onDragLeave={runtime.onTabBarDragLeave}
      onDrop={runtime.onTabBarDrop}
    >
      <BrowserChromeSurface toolbar={toolbar} tabStrip={tabStrip} />
    </nav>
  );
};
