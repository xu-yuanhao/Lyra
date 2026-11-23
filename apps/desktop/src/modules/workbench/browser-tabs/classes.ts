// Tailwind class constants for browser tab strip chrome migrated from shell.scss.
// Hook classes (lyra-*) are preserved for runtime selectors, tests, and variants.

import { RESIZE_BLUR_DISABLE_CLASS, RESIZE_TRANSITION_DISABLE_CLASS } from "../shell/classes";

export const BROWSER_TABS_CLASS =
  `lyra-browser-tabs relative min-h-0 grid overflow-hidden ` +
  `[--lyra-browser-toolbar-bg:var(--lyra-app-material-toolbar-bg)] ` +
  `[--lyra-tabstrip-bg:var(--lyra-app-material-toolbar-bg)] ` +
  `[--lyra-tabstrip-line:color-mix(in_srgb,var(--lyra-app-border-strong)_58%,transparent)] ` +
  `[--lyra-tabstrip-active-bg:var(--lyra-app-row-active-bg)] ` +
  `[--lyra-tabstrip-hover-bg:var(--lyra-app-row-hover-bg)] ` +
  `[--lyra-tab-shape-active-fill:var(--lyra-tabstrip-active-bg)] ` +
  `[--lyra-tab-content-margin:var(--lyra-unit-9)] ` +
  `[--lyra-browser-tab-control-h:var(--lyra-tab-control-h)] ` +
  `[--lyra-browser-tab-active-control-h:var(--lyra-tab-control-h)] ` +
  `[--lyra-browser-tab-control-y:calc((var(--lyra-size-browser-tab-h)_-_var(--lyra-browser-tab-control-h))_/_2)] ` +
  `[--lyra-browser-tabs-toolbar-h:var(--lyra-shell-titlebar-nav-h)] ` +
  `bg-[var(--lyra-tabstrip-bg)] ` +
  `[backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] ` +
  `[-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] ` +
  `before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[var(--lyra-unit-0-5)] before:bg-[var(--lyra-tabstrip-line)] before:pointer-events-none before:z-[1] ` +
  `[:root[data-lyra-window-material="native"]_&]:[--lyra-tabstrip-line:color-mix(in_srgb,var(--lyra-app-border)_54%,transparent)] ` +
  `[:root[data-lyra-window-material="native"]_&]:[--lyra-tabstrip-active-bg:color-mix(in_srgb,var(--lyra-app-row-active-bg)_96%,var(--lyra-app-material-toolbar-bg)_4%)] ` +
  `[:root[data-lyra-window-material="native"]_&]:[--lyra-tabstrip-hover-bg:color-mix(in_srgb,var(--lyra-app-row-hover-bg)_72%,transparent)] ` +
  RESIZE_BLUR_DISABLE_CLASS;

export const BROWSER_TABS_GRID_CLASS =
  "grid-cols-[var(--lyra-size-browser-nav-slot)_var(--lyra-size-browser-nav-slot)_var(--lyra-size-browser-nav-slot)_minmax(0,1fr)]";

export const BROWSER_TABS_WITH_NAVIGATION_CLASS =
  "lyra-browser-tabs-with-navigation min-h-[calc(var(--lyra-size-browser-tab-h)_+_var(--lyra-browser-tabs-toolbar-h))] grid-cols-[minmax(0,1fr)] grid-rows-[var(--lyra-browser-tabs-toolbar-h)_var(--lyra-size-browser-tab-h)] overflow-visible";

export const BROWSER_TABS_TERMINAL_DROP_CLASS =
  "lyra-browser-tabs-terminal-drop-target after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:z-0 after:[border:var(--lyra-stroke-hairline)_dashed_color-mix(in_srgb,var(--lyra-app-border)_38%,var(--lyra-text-secondary)_48%)] after:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_18%,transparent)] after:shadow-none";

export const BROWSER_TABS_SPLIT_DROP_CLASS =
  "lyra-browser-tabs-split-drop-active after:content-[''] after:absolute after:inset-0 after:pointer-events-none after:z-0 after:[border:var(--lyra-stroke-hairline)_dashed_color-mix(in_srgb,var(--lyra-app-border)_38%,var(--lyra-text-secondary)_48%)] after:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_14%,transparent)]";

export const BROWSER_TABS_REORDER_CLASS =
  "lyra-browser-tabs-reorder-active [background-image:linear-gradient(to_bottom,color-mix(in_srgb,var(--lyra-text-primary)_64%,transparent),color-mix(in_srgb,var(--lyra-text-primary)_64%,transparent))] [background-repeat:no-repeat] [background-size:var(--lyra-unit-1-5)_100%] [background-position:var(--lyra-browser-drop-indicator-x,0)_0]";

export const BROWSER_CHROME_SURFACE_CLASS = "lyra-browser-chrome-surface contents";

export const BROWSER_NAV_BUTTON_CLASS =
  "lyra-browser-nav-button box-border self-center justify-self-center mb-[var(--lyra-space-3)] w-[var(--lyra-size-icon-button-w)] h-[var(--lyra-size-icon-button-h)] border-0 bg-transparent text-[var(--lyra-text-muted)] opacity-[0.56] cursor-pointer relative z-[2] grid place-items-center transition-[color_var(--lyra-transition-fast),opacity_var(--lyra-transition-fast)] hover:bg-transparent hover:opacity-100 hover:text-[var(--lyra-text-primary)] [&.lyra-app-icon-button:hover:not(:disabled)]:bg-transparent [&.lyra-app-icon-button:hover:not(:disabled)]:border-transparent disabled:opacity-[var(--lyra-opacity-disabled)] disabled:text-[var(--lyra-text-muted)] disabled:cursor-default disabled:pointer-events-none [.lyra-browser-tabs-toolbar_&]:mb-0 motion-reduce:transition-none";

export const BROWSER_TABS_TOOLBAR_CLASS =
  `lyra-browser-tabs-toolbar col-start-1 row-start-1 min-w-0 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-8)] px-[var(--lyra-space-8)] bg-[var(--lyra-browser-toolbar-bg)] border-b-0 relative z-[3] ` +
  `[backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] ` +
  `[-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] ` +
  RESIZE_BLUR_DISABLE_CLASS;

export const BROWSER_TABS_TOOLBAR_CONTROLS_CLASS =
  "lyra-browser-tabs-toolbar-controls min-w-0 grid grid-cols-[var(--lyra-size-browser-nav-slot)_var(--lyra-size-browser-nav-slot)] items-center justify-start";

export const BROWSER_TABS_NAVIGATION_CLASS =
  "lyra-browser-tabs-navigation min-w-0 w-full self-center justify-self-stretch relative z-[var(--lyra-z-sticky-header)]";

export const BROWSER_TABS_TOOLBAR_CONTEXT_CLASS =
  "lyra-browser-tabs-toolbar-context min-w-0 w-auto h-full flex items-center justify-end overflow-hidden";

export const BROWSER_TAB_STRIP_CLASS =
  "lyra-tab-strip lyra-browser-tab-strip min-w-0 flex items-stretch col-start-4 pl-[var(--lyra-space-3)] overflow-hidden [-ms-overflow-style:none] [scrollbar-width:none] relative z-[2] [&::-webkit-scrollbar]:hidden [.lyra-browser-tabs-with-navigation_&]:col-start-1 [.lyra-browser-tabs-with-navigation_&]:row-start-2 [.lyra-browser-tabs-with-navigation_&]:z-[4]";

export const BROWSER_TAB_LIST_CLASS =
  "lyra-browser-tab-list min-w-0 [flex:1_1_auto] w-auto h-full flex items-stretch overflow-x-auto relative z-[2] [mask-image:linear-gradient(90deg,black_0%,black_calc(100%_-_var(--lyra-space-24)),transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,black_0%,black_calc(100%_-_var(--lyra-space-24)),transparent_100%)] [&::-webkit-scrollbar]:hidden";

export const BROWSER_TAB_ITEM_CLASS =
  "lyra-browser-tab-item box-border [flex:1_1_9.75rem] w-auto min-w-[3.75rem] max-w-[9.75rem] h-[var(--lyra-browser-tab-control-h)] mt-[var(--lyra-browser-tab-control-y)] mb-0 ml-0 px-[var(--lyra-space-2)] grid grid-cols-[minmax(0,1fr)_var(--lyra-tab-close-size)] border-0 rounded-[var(--lyra-radius-8)] bg-transparent relative z-[2] isolate transition-[opacity_var(--lyra-transition-fast),background-color_var(--lyra-transition-fast)] " +
  `[.lyra-browser-tabs_&]:mt-[var(--lyra-browser-tab-control-y)] [.lyra-browser-tabs_&]:mb-[var(--lyra-browser-tab-control-y)] ` +
  `[&.lyra-tab-item-active]:bg-[var(--lyra-tab-shape-active-fill)] [&.lyra-tab-item-active]:z-[5] ` +
  `[&.lyra-browser-tab-item-active]:bg-[var(--lyra-tab-shape-active-fill)] [&.lyra-browser-tab-item-active]:z-[5] ` +
  `[&.lyra-browser-tab-item-split-group-active]:bg-[var(--lyra-tab-shape-active-fill)] [&.lyra-browser-tab-item-split-group-active]:z-[5] ` +
  `[&.lyra-browser-tab-item-split-joined-next]:rounded-tr-none [&.lyra-browser-tab-item-split-joined-next]:rounded-br-none ` +
  `[.lyra-browser-tab-item-split-group-active_+_&]:rounded-tl-none [.lyra-browser-tab-item-split-group-active_+_&]:rounded-bl-none ` +
  `[.lyra-browser-tabs_&.lyra-tab-item-active]:h-[var(--lyra-browser-tab-active-control-h)] ` +
  `[.lyra-browser-tabs_&.lyra-browser-tab-item-active]:h-[var(--lyra-browser-tab-active-control-h)] ` +
  `[.lyra-browser-tabs_&.lyra-browser-tab-item-split-group-active]:h-[var(--lyra-browser-tab-active-control-h)] ` +
  `[.lyra-browser-tab-strip-sorting_&:not(.lyra-browser-tab-item-dragging)]:transition-[opacity_var(--lyra-transition-fast),transform_var(--lyra-motion-fast)] ` +
  `[@media(hover:hover)]:[&:not(.lyra-tab-item-active):not(.lyra-browser-tab-item-split-group-active):hover]:z-[4] ` +
  `[@media(hover:hover)]:[&:not(.lyra-tab-item-active):not(.lyra-browser-tab-item-split-group-active):hover]:bg-[var(--lyra-tabstrip-hover-bg)] ` +
  `[&.lyra-ui-button-ghost:hover:not(:disabled):not(.lyra-tab-item-active):not(.lyra-browser-tab-item-split-group-active)]:bg-transparent ` +
  `[&.lyra-ui-button:active:not(:disabled)]:[transform:none] ` +
  `[&.lyra-browser-tab-item-dragging]:z-[6] [&.lyra-browser-tab-item-dragging]:opacity-0 [&.lyra-browser-tab-item-dragging]:transition-none ` +
  `[&.lyra-browser-tab-item-split-group-dragging]:z-[6] [&.lyra-browser-tab-item-split-group-dragging]:opacity-[0.92] [&.lyra-browser-tab-item-split-group-dragging]:[transform:translateY(var(--lyra-optical-icon-y-nudge))] ` +
  `[&.lyra-browser-tab-item-split-target]:after:content-[''] [&.lyra-browser-tab-item-split-target]:after:absolute [&.lyra-browser-tab-item-split-target]:after:inset-[var(--lyra-space-2)] [&.lyra-browser-tab-item-split-target]:after:rounded-[var(--lyra-radius-6)] [&.lyra-browser-tab-item-split-target]:after:[border:var(--lyra-stroke-hairline)_solid_color-mix(in_srgb,var(--lyra-app-border)_38%,var(--lyra-text-secondary)_48%)] [&.lyra-browser-tab-item-split-target]:after:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_14%,transparent)] [&.lyra-browser-tab-item-split-target]:after:pointer-events-none [&.lyra-browser-tab-item-split-target]:after:z-[3] ` +
  `motion-reduce:transition-none`;

export const BROWSER_TAB_MAIN_CLASS =
  "lyra-browser-tab-main min-w-0 w-full h-full inline-flex items-center gap-[var(--lyra-tab-gap)] px-[var(--lyra-space-4)] border-0 rounded-[inherit] bg-transparent text-[var(--lyra-text-secondary)] cursor-pointer font-[inherit] text-left relative z-[2] " +
  `[&.lyra-ui-button:hover:not(:disabled)]:bg-transparent [&.lyra-ui-button:hover:not(:disabled)]:shadow-none [&.lyra-ui-button:hover:not(:disabled)]:[transform:none] ` +
  `[&.lyra-ui-button:focus-visible]:bg-transparent [&.lyra-ui-button:focus-visible]:shadow-none [&.lyra-ui-button:focus-visible]:[transform:none] ` +
  `[&.lyra-ui-button:active:not(:disabled)]:bg-transparent [&.lyra-ui-button:active:not(:disabled)]:shadow-none [&.lyra-ui-button:active:not(:disabled)]:[transform:none] ` +
  `[.lyra-browser-tab-item-drag-enabled_&]:cursor-grab ` +
  `[.lyra-browser-tab-item-drag-enabled:active_&]:cursor-grabbing ` +
  `[.lyra-browser-tab-item-split-group-active:not(.lyra-tab-item-active)_&]:text-[var(--lyra-text-muted)] ` +
  `[.lyra-browser-tab-item-active_&]:text-[var(--lyra-text-primary)]`;

export const BROWSER_TAB_ICON_CLASS =
  "lyra-browser-tab-icon w-[var(--lyra-icon-size-14)] h-[var(--lyra-icon-size-14)] flex-none inline-flex items-center justify-center text-[var(--lyra-text-muted)] " +
  `[.lyra-browser-tab-item-split-group-active:not(.lyra-tab-item-active)_&]:text-[var(--lyra-text-muted)] ` +
  `[.lyra-browser-tab-item-split-group-active:not(.lyra-tab-item-active)_&]:opacity-[0.55] ` +
  `[.lyra-browser-tab-item-active_&]:text-[var(--lyra-text-primary)] ` +
  `[.lyra-browser-tab-item-active_&]:opacity-100`;

export const BROWSER_TAB_ICON_SVG_CLASS = "lyra-browser-tab-icon-svg w-[var(--lyra-space-14)] h-[var(--lyra-space-14)]";

export const BROWSER_TAB_FAVICON_CLASS =
  "lyra-browser-tab-favicon w-[var(--lyra-space-14)] h-[var(--lyra-space-14)] rounded-[var(--lyra-radius-4)] object-cover block data-[failed=true]:hidden";

export const BROWSER_TAB_TERMINAL_ICON_CLASS =
  "lyra-browser-tab-terminal-icon w-[var(--lyra-space-14)] h-[var(--lyra-space-14)]";

export const BROWSER_TAB_APP_IDENTITY_ICON_CLASS =
  "lyra-browser-tab-app-identity-icon w-[var(--lyra-space-14)] h-[var(--lyra-space-14)]";

export const BROWSER_TAB_LYRA_LOGO_CLASS =
  "lyra-browser-tab-lyra-logo [--lyra-app-logo-size:var(--lyra-space-14)] w-[var(--lyra-space-14)] h-[var(--lyra-space-14)] text-current";

export const BROWSER_TAB_FAVICON_FALLBACK_CLASS =
  "lyra-browser-tab-favicon-fallback hidden [.lyra-browser-tab-favicon[data-failed=true]+&]:inline-flex";

export const BROWSER_TAB_TITLE_CLASS =
  "lyra-browser-tab-title transition-[color_var(--lyra-transition-fast)] " +
  `[.lyra-browser-tab-item-agent-active_&]:text-[color-mix(in_srgb,var(--lyra-text-primary)_82%,var(--lyra-text-accent)_18%)] ` +
  `[.lyra-browser-tab-item:hover_&]:text-[var(--lyra-text-primary)] ` +
  `[.lyra-browser-tab-item:focus-within_&]:text-[var(--lyra-text-primary)] ` +
  `[.lyra-browser-tab-item-split-group-active:not(.lyra-tab-item-active):hover_&]:text-[var(--lyra-text-muted)] ` +
  `[.lyra-browser-tab-item-split-group-active:not(.lyra-tab-item-active):focus-within_&]:text-[var(--lyra-text-muted)] ` +
  `[.lyra-browser-tab-item-split-group-active:not(.lyra-tab-item-active)_&]:text-[var(--lyra-text-muted)] ` +
  `[.lyra-browser-tab-item-active_&]:text-[var(--lyra-text-primary)] ` +
  `motion-reduce:transition-none`;

export const BROWSER_TAB_CLOSE_CLASS =
  "lyra-browser-tab-close border-0 bg-transparent text-[var(--lyra-text-muted)] opacity-0 pointer-events-none w-full h-full p-0 grid place-items-center leading-[var(--lyra-text-line-flat)] relative z-[2] transition-[opacity_var(--lyra-motion-fast)] " +
  `[.lyra-browser-tab-item:hover_&]:opacity-100 [.lyra-browser-tab-item:hover_&]:pointer-events-auto ` +
  `[.lyra-browser-tab-item:has(:focus-visible)_&]:opacity-100 [.lyra-browser-tab-item:has(:focus-visible)_&]:pointer-events-auto ` +
  `[&:hover]:bg-transparent [&:hover]:text-[var(--lyra-status-error)] ` +
  `[&.lyra-app-icon-button:hover:not(:disabled)]:bg-transparent [&.lyra-app-icon-button:hover:not(:disabled)]:text-[var(--lyra-status-error)] ` +
  `[&.lyra-app-icon-button:active:not(:disabled)]:[transform:none] ` +
  `motion-reduce:transition-none`;

export const BROWSER_TAB_ADD_CLASS =
  "lyra-tab-add lyra-browser-tab-add box-border self-start w-[var(--lyra-size-browser-nav-slot)] min-w-[var(--lyra-size-browser-nav-slot)] h-[var(--lyra-browser-tab-control-h)] mt-[var(--lyra-space-3)] p-0 border-0 rounded-[var(--lyra-radius-pill)] bg-transparent text-[color-mix(in_srgb,var(--lyra-text-muted)_72%,transparent)] opacity-100 cursor-pointer relative flex-none z-[var(--lyra-z-sticky-rail)] grid place-items-center isolate leading-[var(--lyra-text-line-flat)] transition-[color_var(--lyra-transition-fast),opacity_var(--lyra-transition-fast)] before:content-[''] before:hidden [&>svg]:relative [&>svg]:z-[1] hover:bg-transparent hover:text-[var(--lyra-text-primary)] [&.lyra-app-icon-button:hover:not(:disabled)]:bg-transparent [&.lyra-app-icon-button:hover:not(:disabled)]:border-transparent [.lyra-browser-tabs_&]:mt-[var(--lyra-browser-tab-control-y)] [.lyra-browser-tabs_&]:mb-[var(--lyra-browser-tab-control-y)] motion-reduce:transition-none";

export const BROWSER_TAB_RIGHT_DRAG_PREVIEW_SHELL_CLASS =
  "lyra-browser-tab-right-drag-preview-shell fixed left-0 top-0 inline-block pointer-events-none z-[var(--lyra-z-drag-float)]";

export const BROWSER_TAB_RIGHT_DRAG_PREVIEW_TAB_CLASS =
  "lyra-browser-tab-right-drag-preview-tab [box-shadow:0_var(--lyra-space-10)_var(--lyra-unit-26)_color-mix(in_srgb,var(--lyra-text-primary)_24%,transparent),0_0_0_var(--lyra-space-1)_color-mix(in_srgb,var(--lyra-app-border)_38%,transparent)]";

export const BROWSER_TAB_RIGHT_DRAG_PREVIEW_MAIN_CLASS =
  "lyra-browser-tab-right-drag-preview-main cursor-grabbing";

export const BROWSER_TAB_RIGHT_DRAG_PREVIEW_CLOSE_CLASS =
  "lyra-browser-tab-right-drag-preview-close opacity-100";
