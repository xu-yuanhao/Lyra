// Tailwind class constants for workbench shell chrome migrated from shell.scss.
// Hook classes (lyra-*) are preserved for runtime selectors, tests, and variants.

export const NO_DRAG_CLASS = "[-webkit-app-region:no-drag]";

export const SHELL_MODAL_DIM_CLASS =
  "[.lyra-root-modal-open_&]:[filter:blur(var(--lyra-space-16))_saturate(1.08)] [.lyra-root-modal-open_&]:opacity-[var(--lyra-opacity-icon-dim)] [.lyra-root-modal-open_&]:pointer-events-none";

export const SHELL_ROOT_SURFACE_CLASS =
  "w-full h-full min-h-0 relative grid grid-rows-[var(--lyra-size-titlebar-h)_minmax(0,1fr)] bg-[var(--lyra-app-material-shell-bg)] [backdrop-filter:var(--lyra-app-material-blur-lg)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-lg)_var(--lyra-app-material-saturate)] overflow-hidden select-none [-webkit-user-drag:none] [&_*]:[-webkit-user-drag:none] [&_.lyra-allow-web-drag]:[-webkit-user-drag:element] [&_.lyra-allow-web-drag_*]:[-webkit-user-drag:element] [&_input]:select-text [&_textarea]:select-text [&_[contenteditable=true]]:select-text [&_.lyra-allow-select]:select-text [&_.lyra-allow-select_*]:select-text [&_.lyra-terminal-host]:select-text [&_.lyra-terminal-host_*]:select-text [&_.xterm]:select-text [&_.xterm_*]:select-text";

export const TITLEBAR_BASE_CLASS =
  "lyra-titlebar min-h-0 grid items-center gap-[var(--lyra-space-10)] px-[var(--lyra-space-10)] relative bg-[var(--lyra-app-material-toolbar-bg)] [backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] [border-bottom:var(--lyra-stroke-hairline)_solid_var(--lyra-divider-faint)] [-webkit-app-region:drag] [transition:filter_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)] max-[980px]:px-[var(--lyra-space-8)]";

export const TITLEBAR_GRID_WITH_NAV =
  "grid-cols-[minmax(var(--lyra-unit-200),2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] max-[980px]:grid-cols-[1fr_minmax(0,1fr)]";

export const TITLEBAR_GRID_WITH_NAV_MAC =
  "grid-cols-[auto_minmax(var(--lyra-unit-200),2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] pl-[var(--lyra-space-8)] max-[980px]:grid-cols-[1fr_minmax(0,1fr)]";

export const TITLEBAR_GRID_NO_NAV =
  "grid-cols-[minmax(0,1fr)_minmax(var(--lyra-unit-220),var(--lyra-unit-280))_auto] max-[980px]:grid-cols-[minmax(0,1fr)]";

export const TITLEBAR_GRID_NO_NAV_MAC =
  "grid-cols-[auto_minmax(0,1fr)_minmax(var(--lyra-unit-220),var(--lyra-unit-280))_auto] pl-[var(--lyra-space-8)] max-[980px]:grid-cols-[minmax(0,1fr)]";

export const TITLEBAR_TRAFFIC_SPACER_CLASS =
  "w-[var(--lyra-unit-70)] min-w-[var(--lyra-unit-70)] h-full pointer-events-none max-[980px]:hidden";

export const TITLEBAR_FILL_CLASS =
  "min-w-0 w-full h-full max-[980px]:hidden";

export const WINDOW_CONTROLS_CLASS =
  "lyra-window-controls inline-flex items-center gap-[var(--lyra-space-6)] justify-self-end min-w-0 max-[980px]:hidden";

export const MAIN_BASE_CLASS =
  "lyra-main w-full h-full min-w-0 min-h-0 grid grid-rows-[minmax(0,1fr)] bg-transparent overflow-hidden [transition:grid-template-columns_var(--lyra-motion-panel-layout),grid-template-rows_var(--lyra-motion-panel-layout),filter_var(--lyra-transition-fast),opacity_var(--lyra-transition-fast)] motion-reduce:transition-none max-[980px]:grid-cols-[1fr] max-[980px]:grid-rows-[var(--left-panel-mobile-height,var(--lyra-unit-180))_0_minmax(0,1fr)]";

export const MAIN_GRID_AI_LEFT =
  "grid-cols-[var(--left-width,var(--lyra-unit-260))_0_minmax(0,1fr)]";

export const MAIN_GRID_AI_RIGHT =
  "grid-cols-[minmax(0,1fr)_0_var(--left-width,var(--lyra-unit-260))]";

export const PANEL_BASE_CLASS =
  "lyra-panel min-w-0 min-h-0 overflow-hidden relative";

export const PANEL_LEFT_CLASS =
  "lyra-panel-left col-start-1 row-start-1 bg-[var(--lyra-app-material-sidebar-bg)] [backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] flex flex-col overflow-hidden p-0 max-[980px]:col-auto [.lyra-main-ai-panel-right_&]:col-start-3 max-[980px]:[.lyra-main-ai-panel-right_&.lyra-panel-left]:col-auto";

export const PANEL_LEFT_HIDDEN_CLASS =
  "lyra-panel-left-hidden pointer-events-none invisible [transition:visibility_0s_linear_var(--lyra-motion-panel-layout-duration)] motion-reduce:transition-none";

export const PANEL_CONTENT_BASE_CLASS =
  "min-w-0 min-h-0 absolute top-0 left-0 flex-none [transform:translate3d(0,0,0)] [backface-visibility:hidden]";

export const PANEL_LEFT_CONTENT_CLASS =
  `lyra-panel-content lyra-panel-left-content ${PANEL_CONTENT_BASE_CLASS} w-[var(--left-panel-content-width,var(--lyra-unit-260))] h-full [.lyra-main-ai-panel-right_&]:right-0 [.lyra-main-ai-panel-right_&]:left-auto max-[980px]:w-full max-[980px]:h-[var(--left-panel-content-mobile-height,var(--lyra-unit-180))]`;

export const CENTER_STACK_CLASS =
  "lyra-center-stack w-full h-full min-w-0 min-h-0 grid overflow-hidden col-start-3 row-start-1 [transition:grid-template-rows_var(--lyra-motion-panel-layout)] motion-reduce:transition-none max-[980px]:col-auto [.lyra-main-ai-panel-right_&]:col-start-1 max-[980px]:[.lyra-main-ai-panel-right_&.lyra-center-stack]:col-auto";

export const CENTER_STACK_TERMINAL_TOP_CLASS =
  "grid-rows-[var(--bottom-height,var(--lyra-unit-180))_0_minmax(0,1fr)] max-[980px]:grid-rows-[var(--bottom-height,var(--lyra-unit-160))_0_minmax(0,1fr)]";

export const CENTER_STACK_TERMINAL_BOTTOM_CLASS =
  "grid-rows-[minmax(0,1fr)_0_var(--bottom-height,var(--lyra-unit-180))] max-[980px]:grid-rows-[minmax(0,1fr)_0_var(--bottom-height,var(--lyra-unit-160))]";

export const WORKSPACE_CLASS =
  "lyra-workspace [--lyra-browser-tabs-toolbar-h:var(--lyra-shell-titlebar-nav-h)] [--lyra-agent-browser-beam:color-mix(in_srgb,var(--lyra-text-accent)_76%,var(--lyra-text-primary)_24%)] w-full h-full bg-[var(--lyra-app-material-panel-bg)] grid grid-rows-[minmax(0,1fr)_var(--lyra-size-browser-tab-h)] overflow-hidden relative has-[>.lyra-browser-tabs-with-navigation]:grid-rows-[minmax(0,1fr)_calc(var(--lyra-browser-tabs-toolbar-h)_+_var(--lyra-size-browser-tab-h))] [&>.lyra-browser-tabs]:row-start-2";

export const WORKSPACE_SURFACE_BASE_CLASS =
  "relative w-full h-full min-w-0 min-h-0 overflow-hidden row-start-1";

export const WORKSPACE_SURFACE_SINGLE_CLASS = `lyra-workspace-surface-single ${WORKSPACE_SURFACE_BASE_CLASS}`;

export const WORKSPACE_SURFACE_SPLIT_CLASS = `lyra-workspace-surface-split ${WORKSPACE_SURFACE_BASE_CLASS}`;

export const WORKSPACE_SURFACE_KEEPALIVE_CLASS =
  "lyra-workspace-surface-keepalive absolute inset-0 z-[1] min-w-0 min-h-0 grid overflow-hidden [data-lyra-surface-hidden=true]:invisible [data-lyra-surface-hidden=true]:pointer-events-none [data-lyra-surface-hidden=true]:z-0 [&>*]:min-w-0 [&>*]:min-h-0";

export const WORKSPACE_SPLIT_CLASS =
  "lyra-workspace-split w-full h-full min-w-0 min-h-0 grid gap-[var(--lyra-space-1)] bg-[color-mix(in_srgb,var(--lyra-app-border)_34%,transparent)]";

export const WORKSPACE_SPLIT_COUNT_2_CLASS = "grid-cols-2 grid-rows-[minmax(0,1fr)]";

export const WORKSPACE_SPLIT_COUNT_3_CLASS = "grid-cols-2 grid-rows-2";

export const WORKSPACE_SPLIT_COUNT_4_CLASS = "grid-cols-2 grid-rows-2";

// ponytail: class strings must stay literal so Tailwind's static scanner
// discovers them; keep this table fully spelled out, no interpolation.
const SPLIT3_PANE_GRID: Record<string, readonly [string, string, string]> = {
  top_two_bottom_one: [
    "[grid-column:1] [grid-row:1]",
    "[grid-column:2] [grid-row:1]",
    "[grid-column:1_/_span_2] [grid-row:2]"
  ],
  top_one_bottom_two: [
    "[grid-column:1_/_span_2] [grid-row:1]",
    "[grid-column:1] [grid-row:2]",
    "[grid-column:2] [grid-row:2]"
  ],
  left_two_right_one: [
    "[grid-column:1] [grid-row:1]",
    "[grid-column:1] [grid-row:2]",
    "[grid-column:2] [grid-row:1_/_span_2]"
  ],
  left_one_right_two: [
    "[grid-column:1] [grid-row:1_/_span_2]",
    "[grid-column:2] [grid-row:1]",
    "[grid-column:2] [grid-row:2]"
  ],
  adaptive: [
    "[grid-column:1] [grid-row:1] max-[1180px]:[grid-column:1] max-[1180px]:[grid-row:1]",
    "[grid-column:1] [grid-row:2] max-[1180px]:[grid-column:2] max-[1180px]:[grid-row:1]",
    "[grid-column:2] [grid-row:1_/_span_2] max-[1180px]:[grid-column:1_/_span_2] max-[1180px]:[grid-row:2]"
  ]
};

export const workspaceSplitPaneGridClass = (
  layout: string,
  index: number,
  paneCount: number
): string => {
  if (paneCount !== 3) {
    return "";
  }
  return SPLIT3_PANE_GRID[layout]?.[index] ?? "";
};

export const WORKSPACE_SPLIT_PANE_BASE_CLASS =
  "lyra-workspace-split-pane min-w-0 min-h-0 overflow-hidden bg-[var(--lyra-app-material-panel-bg)] [border:var(--lyra-stroke-hairline)_solid_transparent] [&.lyra-workspace-split-pane-active]:[border-color:color-mix(in_srgb,var(--lyra-app-border)_38%,var(--lyra-text-secondary)_48%)]";

export const WORKSPACE_SPLIT_PANE_ACTIVE_CLASS = "lyra-workspace-split-pane-active";

export const RESIZER_BASE_CLASS =
  "lyra-resizer relative z-[4] [--lyra-resizer-line:color-mix(in_srgb,var(--lyra-app-border)_32%,transparent)] after:content-[''] after:absolute after:[transition:background_var(--lyra-motion-fast)] hover:[--lyra-resizer-line:color-mix(in_srgb,var(--lyra-app-border)_44%,var(--lyra-text-secondary)_18%)]";

export const RESIZER_HIDDEN_CLASS = "lyra-resizer-hidden pointer-events-none invisible";

export const RESIZER_VERTICAL_CLASS =
  "lyra-resizer-vertical min-h-0 col-start-2 row-start-1 max-[980px]:col-auto after:top-0 after:bottom-0 after:left-[calc(var(--lyra-space-3)*-1)] after:w-[var(--lyra-space-6)] after:cursor-col-resize after:bg-[linear-gradient(90deg,transparent_0,transparent_var(--lyra-unit-2-5),var(--lyra-resizer-line)_var(--lyra-unit-2-5),var(--lyra-resizer-line)_var(--lyra-unit-3-5),transparent_var(--lyra-unit-3-5),transparent_100%)] [.lyra-main-ai-panel-right_&]:after:left-0 [.lyra-main-ai-panel-right_&]:after:bg-[linear-gradient(90deg,var(--lyra-resizer-line)_0,var(--lyra-resizer-line)_var(--lyra-space-1),transparent_var(--lyra-space-1),transparent_100%)] max-[980px]:after:cursor-row-resize max-[980px]:after:left-0 max-[980px]:after:right-0 max-[980px]:after:top-[calc(var(--lyra-space-3)*-1)] max-[980px]:after:bottom-auto max-[980px]:after:w-auto max-[980px]:after:h-[var(--lyra-space-6)] max-[980px]:after:bg-[linear-gradient(180deg,transparent_0,transparent_var(--lyra-space-2),var(--lyra-resizer-line)_var(--lyra-space-2),var(--lyra-resizer-line)_var(--lyra-space-4),transparent_var(--lyra-space-4),transparent_100%)]";

export const RESIZER_HORIZONTAL_CLASS =
  "lyra-resizer-horizontal min-w-0 [.lyra-center-stack-terminal-top_>&]:row-start-2 [.lyra-center-stack-terminal-bottom_>&]:row-start-2 [.lyra-center-stack-terminal-top_>&]:after:left-0 [.lyra-center-stack-terminal-top_>&]:after:right-0 [.lyra-center-stack-terminal-top_>&]:after:top-[calc(var(--lyra-space-6)*-1)] [.lyra-center-stack-terminal-top_>&]:after:h-[var(--lyra-space-6)] [.lyra-center-stack-terminal-top_>&]:after:cursor-row-resize [.lyra-center-stack-terminal-top_>&]:after:bg-[linear-gradient(180deg,transparent_0,transparent_var(--lyra-space-5),var(--lyra-resizer-line)_var(--lyra-space-5),var(--lyra-resizer-line)_100%,transparent_100%)] [.lyra-center-stack-terminal-bottom_>&]:after:left-0 [.lyra-center-stack-terminal-bottom_>&]:after:right-0 [.lyra-center-stack-terminal-bottom_>&]:after:top-0 [.lyra-center-stack-terminal-bottom_>&]:after:h-[var(--lyra-space-6)] [.lyra-center-stack-terminal-bottom_>&]:after:cursor-row-resize [.lyra-center-stack-terminal-bottom_>&]:after:bg-[linear-gradient(180deg,var(--lyra-resizer-line)_0,var(--lyra-resizer-line)_var(--lyra-space-1),transparent_var(--lyra-space-1),transparent_100%)]";

export const AGENT_BROWSER_OVERLAY_CLASS =
  "lyra-agent-browser-activity-overlay [--lyra-agent-browser-glow:color-mix(in_srgb,var(--lyra-status-warning)_62%,var(--lyra-text-accent)_38%)] [--lyra-agent-browser-glow-soft:color-mix(in_srgb,var(--lyra-agent-browser-glow)_24%,transparent)] [--lyra-agent-browser-glow-strong:color-mix(in_srgb,var(--lyra-agent-browser-glow)_42%,transparent)] absolute inset-0 pointer-events-none opacity-0 z-[var(--lyra-z-agent-overlay)] [transition:opacity_var(--lyra-transition-fast)] data-[active=true]:opacity-100 motion-reduce:transition-none";

export const AGENT_BROWSER_PAGE_GLOW_CLASS =
  "lyra-agent-browser-page-glow absolute inset-0 pointer-events-none z-[1] opacity-[var(--lyra-opacity-icon-dim)] [box-shadow:inset_0_0_var(--lyra-space-64)_var(--lyra-space-24)_var(--lyra-agent-browser-glow-soft),inset_0_0_var(--lyra-space-40)_var(--lyra-space-14)_var(--lyra-agent-browser-glow-strong)] animate-[lyra-agent-browser-page-glow-pulse_2.8s_var(--lyra-ease-standard)_infinite] motion-reduce:animate-none motion-reduce:transition-none";

export const TITLEBAR_NAVIGATION_CLASS =
  `lyra-titlebar-navigation w-full min-w-0 justify-self-stretch h-[var(--lyra-shell-titlebar-nav-h)] relative z-[var(--lyra-z-sticky-header)] flex items-center gap-[var(--lyra-space-4)] ${NO_DRAG_CLASS}`;

export const TITLEBAR_NAVIGATION_FORM_CLASS = "flex-1 min-w-0 h-full relative";

export const TITLEBAR_NAVIGATION_EXTERNAL_ACTIONS_CLASS =
  "lyra-titlebar-navigation-external-actions flex-none inline-flex items-center gap-[var(--lyra-space-4)]";

const TITLEBAR_NAV_SHELL_BASE =
  "w-full min-w-0 min-h-[var(--lyra-shell-titlebar-nav-h)] max-h-[var(--lyra-shell-titlebar-nav-h)] flex flex-col p-0 [border:var(--lyra-stroke-hairline)_solid_var(--lyra-app-input-border)] rounded-[var(--lyra-radius-4)] bg-[var(--lyra-app-input-bg)] absolute left-0 right-0 bottom-0 overflow-hidden [transition:border-color_var(--lyra-transition-fast),box-shadow_var(--lyra-transition-fast),background-color_var(--lyra-transition-fast)] hover:[border-color:var(--lyra-app-input-focus-border)] hover:bg-[var(--lyra-app-input-hover-bg)] focus-within:[border-color:var(--lyra-app-input-focus-border)] focus-within:bg-[var(--lyra-app-input-hover-bg)]";

export const TITLEBAR_NAVIGATION_SHELL_CLASS = `lyra-titlebar-navigation-shell ${TITLEBAR_NAV_SHELL_BASE}`;

export const TITLEBAR_NAVIGATION_SHELL_CONTEXTUAL_CLASS =
  "lyra-titlebar-navigation-shell-contextual";

export const TITLEBAR_NAVIGATION_ROW_CLASS =
  "w-full min-h-[var(--lyra-shell-titlebar-nav-h)] grid grid-cols-[minmax(0,1fr)] items-center gap-0 relative flex-none basis-[var(--lyra-shell-titlebar-nav-h)]";

export const TITLEBAR_NAVIGATION_INPUT_CLASS =
  "lyra-titlebar-navigation-input box-border min-w-0 w-full h-[calc(var(--lyra-shell-titlebar-nav-h)_-_var(--lyra-space-2))] border-0 bg-transparent text-[var(--lyra-text-primary)] font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-comfortable)] outline-none pl-[var(--lyra-space-8)] pr-0 placeholder:text-[var(--lyra-text-muted)] [.lyra-titlebar-navigation-shell[data-primary-action=submit]_&]:pr-[var(--lyra-shell-titlebar-nav-h)] [.lyra-titlebar-navigation-shell[data-mode=page-find]_&]:pr-[calc(var(--lyra-shell-titlebar-nav-h)*3_+_var(--lyra-space-48))] [.lyra-titlebar-navigation-shell-contextual_&]:text-[var(--lyra-text-secondary)] [&.lyra-ui-input]:focus-visible:shadow-none";

export const TITLEBAR_NAVIGATION_ACTIONS_CLASS =
  "absolute top-1/2 right-0 inline-flex items-center -translate-y-1/2";

export const TITLEBAR_NAVIGATION_ACTION_CLASS =
  "lyra-titlebar-navigation-action w-[var(--lyra-shell-titlebar-nav-h)] h-[var(--lyra-shell-titlebar-nav-h)] border-0 rounded-full bg-transparent text-[var(--lyra-text-muted)] inline-flex items-center justify-center cursor-pointer [transition:color_var(--lyra-transition-fast),opacity_var(--lyra-transition-fast)] hover:text-[var(--lyra-text-primary)] hover:bg-transparent hover:opacity-100 aria-pressed:text-[var(--lyra-text-accent)] data-[active=true]:text-[var(--lyra-text-accent)] [&.lyra-titlebar-navigation-action-reloading_svg]:animate-[lyra-app-spin_var(--lyra-motion-spin-duration)_var(--lyra-ease-standard)_infinite]";

export const TITLEBAR_NAVIGATION_ACTION_RELOADING_CLASS =
  "lyra-titlebar-navigation-action-reloading";

export const TITLEBAR_NAVIGATION_FAVORITE_ACTION_CLASS =
  "lyra-titlebar-navigation-favorite-action";

export const TITLEBAR_PAGE_FIND_COUNTER_CLASS =
  "lyra-titlebar-page-find-counter min-w-[var(--lyra-space-48)] h-[var(--lyra-shell-titlebar-nav-h)] inline-flex items-center justify-center text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-caption)] tabular-nums whitespace-nowrap";

export const OMNIBOX_SUGGESTION_PANEL_CLASS =
  "lyra-omnibox-suggestion-panel box-border w-full max-h-[var(--lyra-unit-240)] overflow-x-hidden overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--lyra-scrollbar-thumb-idle)_transparent] pt-[var(--lyra-space-6)] pb-[var(--lyra-space-3)] list-none m-0 text-left bg-[var(--lyra-app-popover-bg)] [border:var(--lyra-stroke-hairline)_solid_var(--lyra-app-border)] rounded-[var(--lyra-radius-8)] shadow-[var(--lyra-shadow-elevated-md)] z-[var(--lyra-z-dialog)] [&::-webkit-scrollbar]:w-[var(--lyra-space-10)] [&::-webkit-scrollbar]:h-[var(--lyra-space-10)] [&::-webkit-scrollbar]:bg-transparent [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-[var(--lyra-scrollbar-thumb-idle)] [&::-webkit-scrollbar-thumb]:[border:var(--lyra-stroke-strong)_solid_transparent] [&::-webkit-scrollbar-thumb]:bg-clip-padding [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-[var(--lyra-scrollbar-thumb-hover)]";

export const SUGGESTION_ITEM_CLASS =
  "lyra-suggestion-item flex items-center justify-between gap-[var(--lyra-space-10)] min-w-0 py-[var(--lyra-unit-7)] px-[var(--lyra-space-12)] text-[var(--lyra-text-primary)] cursor-pointer [transition:background-color_var(--lyra-transition-fast),color_var(--lyra-transition-fast)] hover:bg-[var(--lyra-app-row-hover-bg)] hover:text-[var(--lyra-text-primary)] [&.is-selected]:bg-[var(--lyra-app-row-active-bg)] [&.is-selected]:hover:bg-[var(--lyra-app-row-active-bg)] [&_svg]:text-[var(--lyra-text-muted)] [&:hover_.lyra-suggestion-left_svg]:text-[var(--lyra-text-accent)] [&.is-selected_.lyra-suggestion-left_svg]:text-[var(--lyra-text-accent)] [&:hover_.lyra-suggestion-type-badge]:opacity-95 [&.is-selected_.lyra-suggestion-type-badge]:opacity-95";

export const SUGGESTION_LEFT_CLASS =
  "lyra-suggestion-left flex items-center gap-[var(--lyra-space-10)] min-w-0 flex-1";

export const SUGGESTION_TEXT_CLASS =
  "lyra-suggestion-text min-w-0 text-[length:var(--lyra-text-size-caption)] font-[family-name:var(--lyra-font-ui)] whitespace-nowrap overflow-hidden text-ellipsis text-[var(--lyra-text-primary)] [&_mark]:[color:inherit] [&_mark]:bg-[color-mix(in_srgb,var(--lyra-status-warning)_42%,transparent)] [&_mark]:rounded-[var(--lyra-radius-4)] [&_mark]:px-[var(--lyra-space-1)]";

export const SUGGESTION_TYPE_BADGE_CLASS =
  "lyra-suggestion-type-badge text-[length:var(--lyra-text-size-caption)] font-bold uppercase text-[var(--lyra-text-muted)] tracking-[0.04em] opacity-68 flex-none";

export const FIND_RESULT_INDEX_CLASS =
  "lyra-find-result-index w-[calc(var(--lyra-space-28)_+_var(--lyra-space-6))] flex-none basis-[calc(var(--lyra-space-28)_+_var(--lyra-space-6))] text-[var(--lyra-text-muted)] tabular-nums";

export const FIND_EMPTY_CLASS =
  "lyra-find-empty list-none text-[var(--lyra-text-muted)] py-[var(--lyra-unit-7)] px-[var(--lyra-space-12)] text-[length:var(--lyra-text-size-caption)]";

export const FIND_TRUNCATED_CLASS =
  "lyra-find-truncated list-none text-[var(--lyra-text-muted)] pt-[var(--lyra-space-3)] px-[var(--lyra-space-12)] pb-[var(--lyra-space-6)] text-[length:var(--lyra-text-size-caption)]";

const TITLEBAR_CONTEXT_BUTTON_BASE =
  "h-[var(--lyra-size-icon-button-h)] border-0 rounded-[var(--lyra-radius-6)] bg-transparent text-[var(--lyra-text-secondary)] inline-flex items-center justify-center gap-[var(--lyra-space-5)] cursor-pointer opacity-[var(--lyra-opacity-icon-dim)] [transition:color_var(--lyra-transition-fast),opacity_var(--lyra-transition-fast)] enabled:hover:bg-transparent enabled:hover:text-[var(--lyra-text-primary)] enabled:hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-[var(--lyra-opacity-disabled)] [&.lyra-titlebar-context-button-active]:text-[var(--lyra-text-primary)] [&.lyra-titlebar-context-button-active]:opacity-100 [&.lyra-titlebar-context-danger]:text-[var(--lyra-window-close-hover-bg)] [&.lyra-titlebar-problems-active]:text-[var(--lyra-status-error)] [&.lyra-titlebar-problems-active]:opacity-100";

export const TITLEBAR_CONTEXT_CLASS =
  "lyra-titlebar-context w-full min-w-0 h-full flex items-center overflow-hidden justify-self-stretch [&_button]:[-webkit-app-region:no-drag] [&_input]:[-webkit-app-region:no-drag] [&_select]:[-webkit-app-region:no-drag] [&_textarea]:[-webkit-app-region:no-drag] [&_a]:[-webkit-app-region:no-drag] [&_[role=button]]:[-webkit-app-region:no-drag] [&_[role=menuitem]]:[-webkit-app-region:no-drag] [&_[tabindex]]:[-webkit-app-region:no-drag]";

export const TITLEBAR_CONTEXT_EMPTY_CLASS = "lyra-titlebar-context-empty pointer-events-none";

export const TITLEBAR_CONTEXT_SCROLL_CLASS =
  "lyra-titlebar-context-scroll max-w-full min-w-0 inline-flex items-center gap-[var(--lyra-space-8)] overflow-x-auto overflow-y-hidden [scrollbar-width:none] whitespace-nowrap [&::-webkit-scrollbar]:hidden";

export const TITLEBAR_CONTEXT_PART_CLASS =
  "min-w-0 inline-flex items-center gap-[var(--lyra-space-6)] flex-none";

export const TITLEBAR_CONTEXT_LEADING_CLASS = `lyra-titlebar-context-leading ${TITLEBAR_CONTEXT_PART_CLASS}`;

export const TITLEBAR_CONTEXT_META_CLASS = `lyra-titlebar-context-meta ${TITLEBAR_CONTEXT_PART_CLASS}`;

export const TITLEBAR_CONTEXT_CONTROLS_CLASS = `lyra-titlebar-context-controls ${TITLEBAR_CONTEXT_PART_CLASS}`;

export const TITLEBAR_CONTEXT_GROUP_CLASS = `lyra-titlebar-context-group ${TITLEBAR_CONTEXT_PART_CLASS}`;

export const TITLEBAR_CONTEXT_TEXT_CLASS =
  "lyra-titlebar-context-text text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-flat)] inline-flex items-center gap-[var(--lyra-space-4)] min-w-0";

export const TITLEBAR_CONTEXT_CHIP_CLASS =
  "lyra-titlebar-context-chip text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-flat)] inline-flex items-center gap-[var(--lyra-space-4)] min-h-[var(--lyra-size-icon-button-h)] max-w-[var(--lyra-unit-180)] overflow-hidden text-ellipsis";

export const TITLEBAR_CONTEXT_ICON_BUTTON_CLASS =
  `lyra-titlebar-context-icon-button min-w-[var(--lyra-size-icon-button-w)] px-[var(--lyra-space-4)] ${TITLEBAR_CONTEXT_BUTTON_BASE}`;

export const TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS =
  `lyra-titlebar-context-text-button w-auto min-w-0 px-[var(--lyra-space-6)] text-[length:var(--lyra-text-size-caption)] ${TITLEBAR_CONTEXT_BUTTON_BASE}`;
