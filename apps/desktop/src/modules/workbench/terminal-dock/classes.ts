export const TD_VARS_CLASS =
  "[--lyra-terminal-stage-bg:var(--lyra-app-panel-bg)] [--lyra-terminal-tabstrip-bg:var(--lyra-app-material-sidebar-bg)] [--lyra-terminal-tabstrip-line:color-mix(in_srgb,var(--lyra-app-border)_62%,transparent)] [--lyra-terminal-tabstrip-hover-bg:var(--lyra-app-row-hover-bg)] [--lyra-terminal-tabstrip-active-bg:var(--lyra-app-row-active-bg)]";
export const TD_PANEL_BOTTOM_CLASS =
  "lyra-panel-bottom overflow-hidden bg-[var(--lyra-app-panel-bg)]";
export const TD_PANEL_BOTTOM_HIDDEN_CLASS = "lyra-panel-bottom-hidden";
export const TD_PANEL_BOTTOM_CONTENT_CLASS = "lyra-panel-content lyra-panel-bottom-content";
export const TD_BOTTOM_AUX_INACTIVE_CLASS =
  "lyra-bottom-aux-terminal-inactive invisible pointer-events-none z-0";
export const TD_DOCK_CLASS =
  `lyra-terminal-dock ${TD_VARS_CLASS} relative grid h-full min-h-0 grid-cols-[var(--lyra-unit-152)_minmax(0,1fr)] bg-[var(--lyra-terminal-stage-bg)] max-[720px]:grid-cols-[var(--lyra-unit-120)_minmax(0,1fr)]`;
export const TD_DOCK_DROP_TARGET_CLASS =
  "lyra-terminal-dock-workspace-drop-target after:pointer-events-none after:absolute after:inset-0 after:content-[''] after:border after:border-dashed after:border-[color-mix(in_srgb,var(--lyra-app-border)_38%,var(--lyra-text-secondary)_48%)] after:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_16%,transparent)]";
export const TD_SIDE_CLASS =
  `lyra-terminal-side ${TD_VARS_CLASS} relative grid min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-[var(--lyra-terminal-tabstrip-bg)] [backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-[var(--lyra-unit-0-5)] after:bg-[var(--lyra-terminal-tabstrip-line)] after:z-[1]`;
export const TD_TABS_DROP_END_CLASS =
  "lyra-terminal-tabs-drop-end after:pointer-events-none after:absolute after:content-[''] after:bottom-[var(--lyra-space-4)] after:left-[var(--lyra-space-8)] after:right-[var(--lyra-space-8)] after:h-[var(--lyra-stroke-strong)] after:rounded-[var(--lyra-radius-pill)] after:bg-[color-mix(in_srgb,var(--lyra-text-secondary)_64%,transparent)]";
export const TD_TABS_CLASS =
  "lyra-terminal-tabs relative grid min-h-0 min-w-0 content-start gap-[var(--lyra-space-2)] overflow-y-auto overflow-x-hidden bg-transparent p-[var(--lyra-space-6)] after:pointer-events-none after:absolute";
export const TD_TAB_DROP_BEFORE_CLASS =
  "lyra-terminal-tab-drop-target-before before:pointer-events-none before:absolute before:content-[''] before:-top-[var(--lyra-space-2)] before:right-[var(--lyra-space-6)] before:left-[var(--lyra-space-6)] before:h-[var(--lyra-stroke-strong)] before:rounded-[var(--lyra-radius-pill)] before:bg-[color-mix(in_srgb,var(--lyra-text-secondary)_64%,transparent)]";
export const TD_TAB_CLASS =
  "lyra-terminal-tab relative z-[2] grid h-[var(--lyra-tab-control-h)] min-h-[var(--lyra-tab-control-h)] min-w-0 grid-cols-[minmax(0,1fr)_var(--lyra-tab-close-size)] rounded-[var(--lyra-radius-8)] border-0 bg-transparent text-[var(--lyra-text-secondary)] hover:bg-[var(--lyra-terminal-tabstrip-hover-bg)] before:pointer-events-none before:absolute";
export const TD_TAB_ACTIVE_CLASS =
  "lyra-terminal-tab-active z-[2] bg-[var(--lyra-terminal-tabstrip-active-bg)] text-[var(--lyra-text-primary)] shadow-none";
export const TD_TAB_MAIN_CLASS =
  "lyra-tab-main lyra-terminal-tab-main flex h-full min-w-0 w-full cursor-grab items-center justify-start gap-[var(--lyra-space-6)] rounded-[inherit] border-0 bg-transparent px-[var(--lyra-space-8)] py-0 text-left text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-body)] font-medium leading-[var(--lyra-text-line-18)] active:cursor-grabbing hover:bg-transparent focus-visible:bg-transparent";
export const TD_TAB_ICON_CLASS =
  "lyra-terminal-tab-icon inline-flex size-[var(--lyra-icon-size-14)] shrink-0 items-center justify-center text-[var(--lyra-text-muted)] [.lyra-terminal-tab-active_&]:text-[var(--lyra-text-primary)]";
export const TD_TAB_ICON_IMAGE_CLASS = "lyra-terminal-tab-icon-image rounded-[var(--lyra-radius-4)]";
export const TD_TAB_TITLE_CLASS = "lyra-tab-title lyra-terminal-tab-title min-w-0";
export const TD_TAB_BADGE_CLASS =
  "lyra-terminal-tab-badge inline-flex size-[var(--lyra-space-14)] shrink-0 items-center justify-center text-[var(--lyra-text-muted)]";
export const TD_TAB_CLOSE_CLASS =
  "lyra-tab-close lyra-terminal-tab-close grid size-[var(--lyra-tab-close-size)] place-items-center self-center justify-self-center border-0 bg-transparent p-0 text-[var(--lyra-text-muted)] opacity-0 transition-opacity duration-[var(--lyra-transition-fast)] leading-[var(--lyra-text-line-flat)] hover:bg-transparent hover:text-[var(--lyra-status-error)] [.lyra-terminal-tab:hover_&]:opacity-100 [.lyra-terminal-tab:has(:focus-visible)_&]:opacity-100 [&_svg]:block";
export const TD_TAB_LYRA_LOGO_CLASS =
  "lyra-terminal-tab-lyra-logo size-[var(--lyra-icon-size-14)] text-inherit [--lyra-app-logo-size:var(--lyra-icon-size-14)]";
export const TD_TOOLBAR_ACTIONS_CLASS =
  "lyra-terminal-toolbar-actions relative grid h-[var(--lyra-shell-terminal-tabbar-h)] grid-cols-[repeat(4,var(--lyra-shell-terminal-tabbar-h))] content-start items-center justify-start gap-[var(--lyra-space-4)] bg-transparent px-[var(--lyra-space-2)] before:absolute before:top-0 before:right-[var(--lyra-space-8)] before:left-[var(--lyra-space-8)] before:h-[var(--lyra-stroke-thin)] before:bg-[color-mix(in_srgb,var(--lyra-terminal-tabstrip-line)_76%,transparent)] [&_.lyra-app-icon-button]:size-[var(--lyra-shell-terminal-tabbar-h)] [&_.lyra-app-icon-button]:justify-self-center";
export const TD_STAGE_CLASS =
  "lyra-terminal-stage grid min-h-0 min-w-0 bg-[var(--lyra-terminal-stage-bg)] [&>*]:col-start-1 [&>*]:row-start-1 [&>*]:min-h-0 [&>*]:min-w-0";
export const TD_EMPTY_CLASS =
  "lyra-terminal-empty grid h-full w-full place-items-center text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-body)]";
export const TD_WORKSPACE_SURFACE_CLASS =
  `lyra-terminal-workspace-surface ${TD_VARS_CLASS} h-full min-h-0 w-full overflow-hidden bg-[var(--lyra-terminal-stage-bg)] [contain:layout_paint]`;
export const TD_PANES_CLASS =
  "lyra-terminal-panes flex h-full min-h-0 min-w-0 gap-0 overflow-hidden";
export const TD_PANES_HORIZONTAL_CLASS =
  "lyra-terminal-panes-horizontal flex-col [&_.lyra-terminal-pane]:border-r-0 [&_.lyra-terminal-pane:not(:last-child)]:border-b [&_.lyra-terminal-pane:not(:last-child)]:border-[var(--lyra-divider-strong)]";
export const TD_PANES_VERTICAL_CLASS =
  "lyra-terminal-panes-vertical flex-row [&_.lyra-terminal-pane:last-child]:border-r-0";
export const TD_PANE_CLASS =
  "lyra-terminal-pane relative block h-full min-h-0 min-w-0 flex-[1_1_auto] border-r border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)] bg-[var(--lyra-terminal-bg)]";
export const TD_PANE_ACTIVE_CLASS = "lyra-terminal-pane-active bg-[var(--lyra-terminal-bg)]";
export const TD_PANE_BODY_CLASS =
  "lyra-terminal-pane-body absolute inset-0 min-h-0 min-w-0 overflow-hidden bg-[var(--lyra-terminal-bg)] [.lyra-terminal-pane-active_&]:shadow-[inset_0_0_0_var(--lyra-stroke-thin)_color-mix(in_srgb,var(--lyra-app-border-strong)_58%,transparent)]";
export const TD_PANE_CLOSE_CLASS =
  "lyra-terminal-pane-close absolute top-[var(--lyra-space-6)] right-[var(--lyra-space-6)] z-[2] grid size-[var(--lyra-control-h-24)] place-items-center border-0 bg-[color-mix(in_srgb,var(--lyra-terminal-bg)_82%,transparent)] text-[var(--lyra-text-muted)] opacity-0 transition-[opacity,color] duration-[var(--lyra-transition-fast)] hover:bg-[color-mix(in_srgb,var(--lyra-terminal-bg)_72%,var(--lyra-app-row-hover-bg))] hover:text-[var(--lyra-status-error)] [.lyra-terminal-pane:hover_&]:opacity-100 [.lyra-terminal-pane:focus-within_&]:opacity-100 [.lyra-terminal-pane-active_&]:opacity-100";
export const TD_HOST_CLASS =
  "lyra-terminal-host absolute inset-0 box-border bg-[var(--lyra-terminal-bg)] p-0";
export const TD_STATUS_CLASS =
  "lyra-terminal-status absolute right-[var(--lyra-space-8)] bottom-[var(--lyra-space-8)] left-[var(--lyra-space-8)] rounded-[var(--lyra-radius-8)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-status-error)_30%,var(--lyra-app-border))] bg-[var(--lyra-app-popover-bg)] px-[var(--lyra-space-8)] py-[var(--lyra-space-6)] text-[var(--lyra-status-error)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] shadow-[var(--lyra-shadow-elevated-sm)]";
