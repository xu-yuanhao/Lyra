import type {
  CSSProperties,
  ComponentProps,
  DragEventHandler,
  ReactNode,
  RefObject
} from "react";
import {
  Folder,
  History,
  Minus,
  PanelBottom,
  PanelTop,
  Settings2,
  Square,
  X
} from "@lyra/icons";

import { WorkbenchNotificationTopbar } from "../notifications";
import type { WorkbenchUiRuntime } from "../ui-platform";
import {
  AppToolbarButton,
  AppWindowButton
} from "@renderer/ui/components";
import {
  AppShell,
  AppShellMain,
  AppShellTitlebar,
  AppShellWorkspace
} from "@renderer/ui/layout";
import { cx, PanelHost, PanelResizer } from "../ui-primitives";
import {
  CENTER_STACK_CLASS,
  CENTER_STACK_TERMINAL_BOTTOM_CLASS,
  CENTER_STACK_TERMINAL_TOP_CLASS,
  MAIN_BASE_CLASS,
  MAIN_GRID_AI_LEFT,
  MAIN_GRID_AI_RIGHT,
  NO_DRAG_CLASS,
  SHELL_MODAL_DIM_CLASS,
  TITLEBAR_BASE_CLASS,
  TITLEBAR_FILL_CLASS,
  TITLEBAR_GRID_NO_NAV,
  TITLEBAR_GRID_NO_NAV_MAC,
  TITLEBAR_GRID_WITH_NAV,
  TITLEBAR_GRID_WITH_NAV_MAC,
  TITLEBAR_TRAFFIC_SPACER_CLASS,
  WINDOW_CONTROLS_CLASS,
  WORKSPACE_CLASS
} from "./classes";
import { TitlebarAiLaunchPill } from "./titlebar-ai-launch-pill";
import type {
  WorkbenchActionApi,
  WorkbenchChromeLabels,
  WorkbenchPresentationState
} from "./use-workbench-action-api";
import type { PanelLayoutModel } from "./use-panel-layout";

export type WorkbenchChromeLayoutState = Pick<
  PanelLayoutModel,
  | "aiPanelSide"
  | "terminalPanelSide"
  | "isLeftPanelVisible"
  | "isBottomPanelVisible"
>;

export type WorkbenchChromeLayoutActions = Pick<
  PanelLayoutModel,
  | "onLeftResizeMouseDown"
  | "onBottomResizeMouseDown"
>;

export type WorkbenchChromeSlots = {
  readonly titlebarNavigation: ReactNode;
  readonly titlebarContext: ReactNode;
  readonly leftPanel: ReactNode;
  readonly workspace: ReactNode;
  readonly browserTabs: ReactNode;
  readonly terminalPanel: ReactNode;
  readonly overlays: ReactNode;
};

export type WorkbenchShellAdapterProps = {
  readonly rootRef: RefObject<HTMLElement>;
  readonly rootClassName: string;
  readonly rootStyle: CSSProperties;
  readonly uiRuntime: WorkbenchUiRuntime;
  readonly actions: WorkbenchActionApi;
  readonly labels: WorkbenchChromeLabels;
  readonly presentationState: WorkbenchPresentationState;
  readonly isMac: boolean;
  readonly layout: WorkbenchChromeLayoutState;
  readonly layoutActions: WorkbenchChromeLayoutActions;
  readonly slots: WorkbenchChromeSlots;
  readonly notificationTopbar: ComponentProps<typeof WorkbenchNotificationTopbar>;
  readonly aiLaunch: {
    readonly logoUrl: string;
    readonly prefix: string;
    readonly verbs: readonly string[];
  };
  readonly onRootDragStartCapture: DragEventHandler<HTMLElement>;
};

export type WorkbenchChromeProps = WorkbenchShellAdapterProps;

const WorkbenchTitlebarActions = ({
  actions,
  labels,
  presentationState,
  notificationTopbar,
  aiLaunch
}: Pick<
  WorkbenchShellAdapterProps,
  "actions" | "labels" | "presentationState" | "notificationTopbar" | "aiLaunch"
>) => (
  <>
    <WorkbenchNotificationTopbar {...notificationTopbar} />
    <AppToolbarButton
      aria-label={labels.openAgentSessionHistory}
      title={labels.openAgentSessionHistory}
      onClick={actions.openAgentSessionHistory}
    >
      <History size={14} aria-hidden="true" />
    </AppToolbarButton>
    <AppToolbarButton
      aria-label={labels.toggleTerminalPanel}
      title={labels.toggleTerminalPanel}
      active={presentationState.isTerminalPanelVisible}
      onClick={actions.toggleTerminalPanel}
    >
      {presentationState.terminalPanelSide === "top" ? (
        <PanelTop size={14} aria-hidden="true" />
      ) : (
        <PanelBottom size={14} aria-hidden="true" />
      )}
    </AppToolbarButton>
    <AppToolbarButton
      aria-label={labels.openSettings}
      title={labels.openSettings}
      onClick={actions.openSettings}
    >
      <Settings2 size={14} aria-hidden="true" />
    </AppToolbarButton>
    <AppToolbarButton
      aria-label={labels.openFiles}
      title={labels.openFiles}
      onClick={actions.openFileManager}
    >
      <Folder size={14} aria-hidden="true" />
    </AppToolbarButton>
    <TitlebarAiLaunchPill
      isOpen={presentationState.isAiPanelVisible}
      onToggle={actions.toggleAiPanel}
      logoUrl={aiLaunch.logoUrl}
      prefix={aiLaunch.prefix}
      verbs={aiLaunch.verbs}
      ariaLabel={labels.toggleAiPanel}
    />
    {presentationState.isMac ? null : (
      <>
        <AppWindowButton
          action="minimize"
          aria-label={labels.minimizeWindow}
          title={labels.minimizeWindow}
          onClick={actions.minimizeWindow}
        >
          <Minus size={14} aria-hidden="true" />
        </AppWindowButton>
        <AppWindowButton
          action="maximize"
          aria-label={labels.toggleMaximizeWindow}
          title={labels.toggleMaximizeWindow}
          active={presentationState.isMaximized}
          onClick={actions.toggleMaximizeWindow}
        >
          <Square
            size={11}
            fill={presentationState.isMaximized ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </AppWindowButton>
        <AppWindowButton
          action="close"
          aria-label={labels.closeWindow}
          title={labels.closeWindow}
          onClick={actions.closeWindow}
        >
          <X size={14} aria-hidden="true" />
        </AppWindowButton>
      </>
    )}
  </>
);

export const WorkbenchChrome = ({
  rootRef,
  rootClassName,
  rootStyle,
  uiRuntime,
  actions,
  labels,
  presentationState,
  isMac,
  layout,
  layoutActions,
  slots,
  notificationTopbar,
  aiLaunch,
  onRootDragStartCapture
}: WorkbenchShellAdapterProps) => (
  <AppShell
    {...uiRuntime.rootAttributes}
    ref={rootRef}
    className={rootClassName}
    style={rootStyle}
    onDragStartCapture={onRootDragStartCapture}
  >
    <AppShellTitlebar
      className={cx(
        TITLEBAR_BASE_CLASS,
        SHELL_MODAL_DIM_CLASS,
        isMac
          ? slots.titlebarNavigation === null
            ? TITLEBAR_GRID_NO_NAV_MAC
            : TITLEBAR_GRID_WITH_NAV_MAC
          : slots.titlebarNavigation === null
            ? TITLEBAR_GRID_NO_NAV
            : TITLEBAR_GRID_WITH_NAV,
        isMac && "lyra-titlebar-macos",
        slots.titlebarNavigation === null && "lyra-titlebar-no-navigation"
      )}
    >
      {isMac ? (
        <div
          className={cx("lyra-titlebar-traffic-spacer", TITLEBAR_TRAFFIC_SPACER_CLASS)}
          aria-hidden="true"
        />
      ) : null}
      {slots.titlebarNavigation}
      {slots.titlebarContext}
      <div className={cx("lyra-titlebar-fill", TITLEBAR_FILL_CLASS)} aria-hidden="true" />
      <div className={cx("lyra-no-drag", NO_DRAG_CLASS, WINDOW_CONTROLS_CLASS)}>
        <WorkbenchTitlebarActions
          actions={actions}
          labels={labels}
          presentationState={presentationState}
          notificationTopbar={notificationTopbar}
          aiLaunch={aiLaunch}
        />
      </div>
    </AppShellTitlebar>

    <AppShellMain
      className={cx(
        MAIN_BASE_CLASS,
        SHELL_MODAL_DIM_CLASS,
        layout.aiPanelSide === "right"
          ? cx("lyra-main-ai-panel-right", MAIN_GRID_AI_RIGHT)
          : cx("lyra-main-ai-panel-left", MAIN_GRID_AI_LEFT)
      )}
    >
      <PanelHost
        placement="left"
        visible={layout.isLeftPanelVisible}
        ariaLabel="left-panel"
      >
        {slots.leftPanel}
      </PanelHost>
      <PanelResizer
        orientation="vertical"
        visible={layout.isLeftPanelVisible}
        ariaLabel="left-resizer"
        onMouseDown={layoutActions.onLeftResizeMouseDown}
      />

      <section
        className={cx(
          CENTER_STACK_CLASS,
          layout.terminalPanelSide === "top"
            ? cx("lyra-center-stack-terminal-top", CENTER_STACK_TERMINAL_TOP_CLASS)
            : cx("lyra-center-stack-terminal-bottom", CENTER_STACK_TERMINAL_BOTTOM_CLASS)
        )}
      >
        <AppShellWorkspace className={WORKSPACE_CLASS} aria-label="workspace">
          {slots.workspace}
          {slots.browserTabs}
        </AppShellWorkspace>

        <PanelResizer
          orientation="horizontal"
          visible={layout.isBottomPanelVisible}
          ariaLabel="bottom-resizer"
          onMouseDown={layoutActions.onBottomResizeMouseDown}
        />
        <PanelHost
          placement="bottom"
          visible={layout.isBottomPanelVisible}
          ariaLabel="bottom-panel"
        >
          {slots.terminalPanel}
        </PanelHost>
      </section>
    </AppShellMain>

    {slots.overlays}
  </AppShell>
);
