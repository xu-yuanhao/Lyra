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
