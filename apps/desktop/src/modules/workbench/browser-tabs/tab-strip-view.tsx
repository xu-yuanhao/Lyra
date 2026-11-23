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
  AppButton,
  AppIconButton
} from "@renderer/ui/components";
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
import type { BrowserTabStripProps } from "./tab-strip-types";
import type { BrowserTabStripRuntime } from "./use-browser-tab-strip-runtime";

type BrowserTabStripViewProps = Pick<
  BrowserTabStripProps,
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
  <Globe size={14} className="lyra-browser-tab-icon-svg" />
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
    return <Settings2 size={14} className="lyra-browser-tab-icon-svg" />;
  }

  if (tab.pageKind === "results") {
    return <Search size={14} className="lyra-browser-tab-icon-svg" />;
  }

  if (tab.pageKind === "search") {
    return <House size={14} className="lyra-browser-tab-icon-svg" />;
  }

  if (tab.pageKind === "terminal") {
    const icon = tab.terminalTabId === undefined
      ? undefined
      : terminalIdentityByTabId?.[tab.terminalTabId];
    return (
      <IdentityIconView
        className="lyra-browser-tab-terminal-icon"
        imageClassName="lyra-browser-tab-favicon"
        iconUrl={icon?.url ?? null}
        label={icon?.label}
        fallback={
          icon?.renderHint === "lyra-logo"
            ? <LyraLogo className="lyra-browser-tab-lyra-logo" alt="" />
            : <SquareTerminal size={14} className="lyra-browser-tab-icon-svg" />
        }
      />
    );
  }

  if (tab.pageKind === "app" && tab.appId !== undefined && tab.appIconKey !== undefined) {
    const appIcon = workspaceAppIdentityByTabId?.[tab.id];
    if (isAgentProjectTreeAppId(tab.appId)) {
      return (
        <IdentityIconView
          className="lyra-browser-tab-app-identity-icon"
          imageClassName="lyra-browser-tab-favicon"
          iconUrl={appIcon?.url ?? null}
          label={appIcon?.label}
          fallback={
            appIcon?.renderHint === "lyra-logo"
              ? <LyraLogo className="lyra-browser-tab-lyra-logo" alt="" />
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
          className="lyra-browser-tab-favicon"
          loading="eager"
          decoding="async"
          onLoad={handleFaviconLoad}
          onError={handleFaviconError}
        />
        <span className="lyra-browser-tab-favicon-fallback">
          <BrowserTabDefaultIcon />
        </span>
      </>
    );
  }

  return <BrowserTabDefaultIcon />;
};

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
      className="lyra-browser-nav-button"
      aria-label={goBackLabel}
      disabled={!canGoBack}
      onClick={onGoBack}
    >
      <ChevronLeft size={14} />
    </AppIconButton>
    <AppIconButton
      className="lyra-browser-nav-button"
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
    <div className="lyra-browser-tabs-toolbar">
      <div className="lyra-browser-tabs-toolbar-controls">
        {navigationButtons}
      </div>
      <div className="lyra-browser-tabs-navigation">
        {navigationControl}
      </div>
      <div className="lyra-browser-tabs-toolbar-context">
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
        <div className="lyra-browser-tab-list">
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
              <AppButton
                variant="ghost"
                size="sm"
                className={tabModel.tabMainClassName}
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
                onClick={() => {
                  onActivateTab(tabModel.tab.id);
                }}
              >
                <span className="lyra-browser-tab-icon" aria-hidden="true">
                  <BrowserTabIcon
                    tab={tabModel.tab}
                    terminalIdentityByTabId={terminalIdentityByTabId}
                    workspaceAppIdentityByTabId={workspaceAppIdentityByTabId}
                  />
                </span>
                <span className={`${APP_TAB_TITLE_CLASS} lyra-browser-tab-title`}>{tabModel.tab.title}</span>
              </AppButton>
              {tabModel.showClose ? (
                <AppIconButton
                  className={`${APP_TAB_CLOSE_CLASS} lyra-browser-tab-close`}
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
        </div>
        <AppIconButton
          className="lyra-tab-add lyra-browser-tab-add"
          aria-label={openNewTabLabel}
          onClick={onOpenNewTab}
        >
          <Plus size={14} />
        </AppIconButton>
      </div>
      {renderModel.preview !== null ? (
        <div
          className="lyra-browser-tab-right-drag-preview-shell"
          style={renderModel.preview.shellStyle}
          aria-hidden="true"
        >
          <div
            className={renderModel.preview.tabClassName}
            style={renderModel.preview.tabStyle}
          >
            <span className={renderModel.preview.mainClassName}>
              <span className="lyra-browser-tab-icon" aria-hidden="true">
                <BrowserTabIcon
                  tab={renderModel.preview.tab}
                  terminalIdentityByTabId={terminalIdentityByTabId}
                  workspaceAppIdentityByTabId={workspaceAppIdentityByTabId}
                />
              </span>
              <span className={`${APP_TAB_TITLE_CLASS} lyra-browser-tab-title`}>{renderModel.preview.tab.title}</span>
            </span>
            <AppIconButton
              className={`${APP_TAB_CLOSE_CLASS} lyra-browser-tab-close lyra-browser-tab-right-drag-preview-close`}
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
        hasNavigationControl && "lyra-browser-tabs-with-navigation"
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
