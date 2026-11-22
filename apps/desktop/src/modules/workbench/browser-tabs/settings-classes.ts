// Shared Tailwind class strings for the settings surface.
// Kept as constants so every emission site renders identical metrics.

export const ST_SURFACE_CLASS =
  "lyra-settings-surface h-full w-full min-h-0 overflow-hidden text-[var(--lyra-text-primary)] bg-[var(--lyra-settings-bg)] [--lyra-settings-bg:var(--lyra-app-material-panel-bg)] [--lyra-settings-shell-bg:transparent] [--lyra-settings-sidebar-bg:var(--lyra-app-material-sidebar-bg)] [--lyra-settings-panel-bg:var(--lyra-app-material-panel-bg)] [--lyra-settings-card-bg:var(--lyra-app-surface-strong-bg)] [--lyra-settings-card-strong-bg:var(--lyra-app-surface-strong-bg)] [--lyra-settings-row-bg:var(--lyra-app-row-bg)] [--lyra-settings-row-hover-bg:var(--lyra-app-row-hover-bg)] [--lyra-settings-row-active-bg:var(--lyra-app-row-active-bg)] [--lyra-settings-row-active-border:var(--lyra-app-row-active-border)] [--lyra-settings-input-bg:var(--lyra-app-input-bg)] [--lyra-settings-input-hover-bg:var(--lyra-app-input-hover-bg)] [--lyra-settings-input-focus-bg:var(--lyra-app-input-focus-bg)] [--lyra-settings-input-border:var(--lyra-app-input-border)] [--lyra-settings-input-focus-border:var(--lyra-app-input-focus-border)] [--lyra-settings-input-placeholder:var(--lyra-app-input-placeholder)] [--lyra-settings-muted-bg:var(--lyra-app-muted-bg)] [--lyra-settings-border:var(--lyra-app-border)] [--lyra-settings-border-strong:var(--lyra-app-border-strong)] [--lyra-settings-focus:var(--lyra-app-focus)] [--lyra-settings-danger:var(--lyra-status-error)] [--lyra-settings-switch-on:var(--lyra-app-switch-on)] [--lyra-settings-primary-button:var(--lyra-app-primary-button)] [--lyra-settings-primary-button-fg:var(--lyra-app-primary-button-fg)] [--lyra-settings-radius-card:var(--lyra-radius-10)] [--lyra-settings-radius-control:var(--lyra-radius-8)] [--lyra-settings-shadow-card:none] [--primary:var(--lyra-settings-primary-button)] [--primary-foreground:var(--lyra-settings-primary-button-fg)] [--accent:var(--lyra-settings-row-hover-bg)] [--accent-foreground:var(--lyra-text-primary)] [--ring:var(--lyra-settings-focus)]";

export const ST_SHELL_CLASS =
  "lyra-settings-shell grid h-full min-h-0 w-full grid-cols-[var(--lyra-app-sidebar-rail-w)_minmax(0,1fr)] bg-[var(--lyra-settings-shell-bg)] [backdrop-filter:var(--lyra-app-material-blur-md)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-md)_var(--lyra-app-material-saturate)]";

export const ST_NAV_CLASS =
  "lyra-settings-nav grid min-h-0 grid-rows-[minmax(0,1fr)_auto] content-stretch gap-[var(--lyra-app-sidebar-rail-gap)] overflow-hidden border-r border-[var(--lyra-settings-border)] bg-[var(--lyra-settings-sidebar-bg)] px-[var(--lyra-app-sidebar-rail-pad-x)] py-[var(--lyra-app-sidebar-rail-pad-y)] [backdrop-filter:var(--lyra-app-material-blur-md)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-md)_var(--lyra-app-material-saturate)] [--lyra-settings-row-hover-bg:var(--lyra-app-row-hover-bg)] [--lyra-settings-row-active-bg:var(--lyra-app-row-active-bg)]";

export const ST_NAV_LIST_CLASS =
  "lyra-settings-nav-list grid min-h-0 content-start gap-[var(--lyra-app-sidebar-row-gap)] overflow-auto";

const ST_NAV_RULE_BEFORE =
  "[&::before]:absolute [&::before]:top-0 [&::before]:left-[var(--lyra-space-12)] [&::before]:right-[var(--lyra-space-12)] [&::before]:h-[var(--lyra-stroke-thin)] [&::before]:bg-[color-mix(in_srgb,var(--lyra-settings-border)_42%,transparent)] [&::before]:content-['']";

export const ST_NAV_ACTIONS_CLASS = `lyra-settings-nav-actions relative grid gap-[var(--lyra-space-4)] pt-[var(--lyra-space-10)] ${ST_NAV_RULE_BEFORE}`;
export const ST_NAV_DOCS_CLASS = `lyra-settings-nav-docs relative mt-[var(--lyra-space-6)] pt-[var(--lyra-space-10)] ${ST_NAV_RULE_BEFORE}`;

export const ST_NAV_ITEM_CLASS =
  "lyra-settings-nav-item relative inline-flex min-h-[var(--lyra-app-sidebar-row-h)] w-full items-center justify-start gap-[var(--lyra-space-8)] border-0 bg-transparent px-[var(--lyra-app-sidebar-row-pad-x)] py-0 text-left font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-body)] font-medium text-[var(--lyra-text-secondary)] rounded-[var(--lyra-app-sidebar-row-radius)] transition-[background-color,border-color,color,box-shadow] duration-[var(--lyra-motion-fast)] enabled:hover:text-[var(--lyra-text-primary)] enabled:hover:bg-[var(--lyra-settings-row-hover-bg)]";

export const ST_NAV_ITEM_ACTIVE_CLASS =
  "lyra-settings-nav-item-active font-medium text-[var(--lyra-text-primary)] bg-[var(--lyra-settings-row-active-bg)] [&::before]:hidden";

export const ST_NAV_ICON_CLASS =
  "lyra-settings-nav-icon size-[var(--lyra-app-sidebar-icon-size)] shrink-0 text-current opacity-[var(--lyra-opacity-icon-dim)] [stroke-width:1.7] [.lyra-settings-nav-item:hover_&]:opacity-[var(--lyra-opacity-lifted)] [.lyra-settings-nav-item-active_&]:opacity-[var(--lyra-opacity-lifted)]";

export const ST_NAV_JUMP_LABEL_CLASS =
  "lyra-settings-nav-jump-label inline-flex min-w-0 items-center gap-[var(--lyra-space-3)]";

export const ST_NAV_JUMP_ICON_CLASS =
  "lyra-settings-nav-jump-icon size-[var(--lyra-icon-size-12)] text-[var(--lyra-text-muted)] opacity-[0.84] [stroke-width:1.8] transition-[opacity,color,transform] duration-[var(--lyra-motion-fast)] [.lyra-settings-nav-item-jump:hover_&]:text-[var(--lyra-text-secondary)] [.lyra-settings-nav-item-jump:hover_&]:opacity-100 [.lyra-settings-nav-item-jump:hover_&]:translate-x-[var(--lyra-unit-0-5)] [.lyra-settings-nav-item-jump:hover_&]:-translate-y-[var(--lyra-unit-0-5)]";

export const ST_ACCOUNT_CLASS =
  "lyra-settings-account grid min-w-0 grid-cols-[minmax(0,1fr)_var(--lyra-control-h-28)] items-center gap-[var(--lyra-space-8)] rounded-[var(--lyra-app-sidebar-row-radius)] px-[var(--lyra-space-4)] py-[var(--lyra-space-6)] text-[var(--lyra-text-secondary)] hover:bg-[var(--lyra-settings-row-hover-bg)]";

export const ST_ACCOUNT_ACTIVE_CLASS = "lyra-settings-account-active bg-[var(--lyra-settings-row-active-bg)]";

export const ST_ACCOUNT_IDENTITY_CLASS =
  "lyra-settings-account-identity grid min-h-[var(--lyra-control-h-28)] cursor-pointer grid-cols-[var(--lyra-control-h-28)_minmax(0,1fr)] items-center gap-[var(--lyra-space-8)] border-0 bg-transparent p-0 text-left text-inherit focus-visible:rounded-[var(--lyra-app-sidebar-row-radius)] focus-visible:[box-shadow:0_0_0_var(--lyra-stroke-thin)_var(--lyra-settings-focus)]";

export const ST_ACCOUNT_AVATAR_CLASS =
  "lyra-settings-account-avatar size-[var(--lyra-control-h-28)] rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-settings-row-active-bg)] text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-12)] font-semibold [&_.lyra-identity-icon-image]:rounded-[inherit]";

export const ST_ACCOUNT_LOCAL_LOGO_CLASS = "lyra-settings-account-local-logo size-[var(--lyra-icon-size-16)]";

export const ST_ACCOUNT_NAME_CLASS =
  "lyra-settings-account-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-body)] font-medium";

export const ST_ACCOUNT_ACTION_CLASS =
  "lyra-settings-account-action size-[var(--lyra-control-h-28)] min-h-[var(--lyra-control-h-28)] min-w-[var(--lyra-control-h-28)] p-0 text-[var(--lyra-text-muted)] enabled:hover:text-[var(--lyra-text-primary)]";

export const ST_MAIN_CLASS =
  "lyra-settings-main min-h-0 min-w-0 overflow-auto bg-[var(--lyra-settings-panel-bg)] px-[var(--lyra-page-pad-inline)] pt-[var(--lyra-page-pad-block-start)] pb-[var(--lyra-page-pad-block-end)] [backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)]";

export const ST_CATEGORY_CLASS =
  "lyra-settings-category mx-auto grid min-w-0 w-[min(100%,max(var(--lyra-unit-690),calc(100%_-_var(--lyra-space-64)_*_2)))] scroll-mt-[var(--lyra-space-8)] gap-[var(--lyra-space-22)] [&>div]:min-w-0";

export const ST_CATEGORY_ACCOUNT_CLASS = "lyra-settings-category-account w-[min(100%,var(--lyra-unit-860))]";

export const ST_CATEGORY_HEADER_CLASS =
  "lyra-settings-category-header flex min-h-[var(--lyra-control-h-36)] min-w-0 items-center [&_h2]:m-0 [&_h2]:text-[var(--lyra-text-primary)] [&_h2]:text-[length:var(--lyra-text-size-title-md)] [&_h2]:font-semibold [&_h2]:leading-[var(--lyra-text-line-title)]";

const AC_PANEL_CHROME =
  "min-w-0 rounded-[var(--lyra-settings-radius-card)] border border-[var(--lyra-stroke-thin)] border-[var(--lyra-settings-border)] bg-[color-mix(in_srgb,var(--lyra-settings-card-bg)_96%,transparent)]";

export const AC_PANEL_CLASS =
  `lyra-account-panel ${AC_PANEL_CHROME} p-[var(--lyra-space-18)] [&_h3]:m-0 [&_h3]:text-[var(--lyra-text-primary)] [&_h3]:text-[length:var(--lyra-text-size-body)] [&_h3]:font-semibold`;

export const AC_PANEL_HEADER_CLASS =
  "lyra-account-panel-header mb-[var(--lyra-space-18)] flex items-center justify-between gap-[var(--lyra-space-16)] [&>div:first-child]:grid [&>div:first-child]:gap-[var(--lyra-space-3)] [&_span]:text-[length:var(--lyra-text-size-caption)]";

export const AC_SUMMARY_GRID_CLASS = `lyra-account-summary-grid grid min-w-0 grid-cols-5 overflow-hidden ${AC_PANEL_CHROME}`;

export const AC_SUMMARY_ITEM_CLASS =
  "lyra-account-summary-item grid min-w-0 gap-[var(--lyra-space-4)] px-[var(--lyra-space-10)] py-[var(--lyra-space-16)] text-center [&+&]:border-l [&+&]:border-[var(--lyra-stroke-thin)] [&+&]:border-[var(--lyra-settings-border)] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_strong]:text-[var(--lyra-text-primary)] [&_strong]:text-[length:var(--lyra-text-size-title-md)] [&_strong]:font-semibold [&_span]:text-[var(--lyra-text-muted)] [&_span]:text-[length:var(--lyra-text-size-caption)]";

export const AC_PROFILE_CLASS =
  "lyra-account-profile grid min-w-0 grid-cols-[var(--lyra-unit-80)_minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-18)] px-[var(--lyra-space-4)] pb-[var(--lyra-space-20)] pt-[var(--lyra-space-8)]";

export const AC_PROFILE_AVATAR_CLASS =
  "lyra-account-profile-avatar size-[var(--lyra-unit-80)] rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-settings-row-active-bg)] text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-24)] font-semibold [&_.lyra-identity-icon-image]:rounded-[inherit]";

export const AC_PROFILE_COPY_CLASS =
  "lyra-account-profile-copy min-w-0 [&_h3]:m-0 [&_h3]:text-[var(--lyra-text-primary)] [&_h3]:text-[length:var(--lyra-text-size-title-md)] [&_h3]:font-semibold [&_p]:my-[var(--lyra-space-4)] [&_p]:text-[var(--lyra-text-muted)] [&_span]:text-[var(--lyra-text-muted)] [&_span]:text-[length:var(--lyra-text-size-caption)]";

export const AC_PROFILE_ACTIONS_CLASS = "lyra-account-profile-actions inline-flex items-center gap-[var(--lyra-space-4)]";

export const AC_EDIT_FORM_CLASS =
  "lyra-account-edit-form grid gap-[var(--lyra-space-14)] [&_label]:grid [&_label]:gap-[var(--lyra-space-6)] [&_label]:text-[var(--lyra-text-secondary)] [&_label]:text-[length:var(--lyra-text-size-body)] [&_small]:text-[var(--lyra-text-muted)] [&_small]:text-[length:var(--lyra-text-size-caption)] [&_small]:leading-[var(--lyra-text-line-body)]";

export const AC_COVERAGE_NOTE_CLASS =
  "lyra-account-coverage-note mt-[var(--lyra-space-14)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-body)]";

export const AC_EDIT_ACTIONS_CLASS = "lyra-account-edit-actions flex justify-end gap-[var(--lyra-space-8)]";

export const AC_INLINE_ERROR_CLASS = "lyra-account-inline-error text-[length:var(--lyra-text-size-caption)]";

export const AC_LOADING_CLASS = `lyra-account-loading ${AC_PANEL_CHROME} p-[var(--lyra-space-18)]`;
export const AC_EMPTY_CLASS = `lyra-account-empty ${AC_PANEL_CHROME} p-[var(--lyra-space-18)]`;

export const AC_ERROR_CLASS =
  "lyra-account-error flex items-center justify-between gap-[var(--lyra-space-12)] [&_p]:m-0 [&_p]:text-[var(--lyra-text-secondary)]";

export const AC_CHART_TABS_CLASS = "lyra-account-chart-tabs flex gap-[var(--lyra-space-3)]";
export const AC_CHART_TAB_ACTIVE_CLASS =
  "lyra-account-chart-tab-active text-[var(--lyra-text-primary)] bg-[var(--lyra-settings-row-active-bg)]";

export const AC_HEATMAP_REGION_CLASS = "lyra-account-heatmap-region relative min-w-0";
export const AC_HEATMAP_SCROLL_CLASS = "lyra-account-heatmap-scroll min-w-0 overflow-x-auto pb-[var(--lyra-space-4)]";
export const AC_HEATMAP_CONTENT_CLASS = "lyra-account-heatmap-content w-max min-w-full";

export const AC_HEATMAP_MONTHS_CLASS =
  "lyra-account-heatmap-months relative mx-[calc(var(--lyra-icon-size-12)/2)] mb-[var(--lyra-space-4)] h-[var(--lyra-space-18)] whitespace-nowrap text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-space-18)] [&>span]:absolute [&>span]:top-0 [&>span]:-translate-x-1/2 [&>span:first-child]:translate-x-0";

export const AC_HEATMAP_CLASS =
  "lyra-account-heatmap grid w-max min-w-full grid-flow-col grid-rows-[repeat(7,var(--lyra-icon-size-12))] auto-cols-[var(--lyra-icon-size-12)] justify-between gap-[var(--lyra-space-3)]";

export const AC_HEATMAP_CELL_CLASS =
  "lyra-account-heatmap-cell size-[var(--lyra-icon-size-12)] cursor-default rounded-[var(--lyra-radius-6)] bg-[var(--lyra-settings-muted-bg)]";
export const AC_HEATMAP_CELL_EMPTY_CLASS = "lyra-account-heatmap-cell-empty invisible";

const AC_HEATMAP_LEVEL_BG = [
  "",
  "bg-[color-mix(in_srgb,var(--lyra-settings-primary-button)_24%,var(--lyra-settings-muted-bg))]",
  "bg-[color-mix(in_srgb,var(--lyra-settings-primary-button)_42%,var(--lyra-settings-muted-bg))]",
  "bg-[color-mix(in_srgb,var(--lyra-settings-primary-button)_60%,var(--lyra-settings-muted-bg))]",
  "bg-[color-mix(in_srgb,var(--lyra-settings-primary-button)_78%,var(--lyra-settings-muted-bg))]",
  "bg-[var(--lyra-settings-primary-button)]"
] as const;

export const acHeatmapLevelClass = (level: number): string =>
  `lyra-account-heatmap-level-${level} ${AC_HEATMAP_LEVEL_BG[level] ?? ""}`;

export const AC_HEATMAP_TOOLTIP_CLASS =
  "lyra-account-heatmap-tooltip pointer-events-none absolute z-[4] max-w-[var(--lyra-unit-260)] -translate-x-1/2 -translate-y-[calc(100%+var(--lyra-space-8))] whitespace-nowrap rounded-[var(--lyra-settings-radius-control)] border border-[var(--lyra-stroke-thin)] border-[var(--lyra-settings-border-strong)] bg-[var(--lyra-settings-panel-bg)] px-[var(--lyra-space-10)] py-[var(--lyra-space-6)] text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] [box-shadow:var(--lyra-shadow-elevated-sm)]";

export const AC_WEEK_CHART_CLASS =
  "lyra-account-week-chart flex h-[var(--lyra-unit-112)] items-end gap-[var(--lyra-space-3)] overflow-hidden";
export const AC_WEEK_BAR_CLASS =
  "lyra-account-week-bar min-w-[var(--lyra-space-6)] flex-1 rounded-t-[var(--lyra-radius-6)] bg-[var(--lyra-settings-primary-button)] opacity-[var(--lyra-opacity-lifted)]";

export const AC_DETAIL_GRID_CLASS = "lyra-account-detail-grid grid min-w-0 grid-cols-2 gap-[var(--lyra-space-18)]";

export const AC_STAT_LIST_CLASS =
  "lyra-account-stat-list mt-[var(--lyra-space-14)] grid gap-[var(--lyra-space-10)] [&_div]:flex [&_div]:min-w-0 [&_div]:items-center [&_div]:justify-between [&_div]:gap-[var(--lyra-space-12)] [&_dt]:text-[var(--lyra-text-secondary)] [&_dd]:m-0 [&_dd]:text-[var(--lyra-text-primary)] [&_dd]:tabular-nums";

export const AC_MUTED_CLASS = "lyra-account-muted text-[var(--lyra-text-muted)]";

export const AC_MODEL_LIST_CLASS =
  "lyra-account-model-list mt-[var(--lyra-space-14)] grid list-none gap-[var(--lyra-space-12)] p-0 [&_li]:flex [&_li]:min-w-0 [&_li]:items-center [&_li]:justify-between [&_li]:gap-[var(--lyra-space-12)] [&_li>span:first-child]:grid [&_li>span:first-child]:min-w-0 [&_li>span:first-child]:gap-[var(--lyra-space-2)] [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_small]:text-[var(--lyra-text-muted)] [&_small]:text-[length:var(--lyra-text-size-caption)] [&_li>span:last-child]:text-[var(--lyra-text-muted)] [&_li>span:last-child]:text-[length:var(--lyra-text-size-caption)]";
