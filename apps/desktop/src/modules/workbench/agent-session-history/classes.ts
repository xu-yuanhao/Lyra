export const HISTORY_CLASS =
  "lyra-agent-history min-w-0 min-h-0 h-full flex flex-col text-[var(--lyra-text-primary)] bg-[var(--lyra-app-panel-bg)]";
export const HISTORY_TITLEBAR_CATEGORIES_CLASS =
  "lyra-history-titlebar-categories gap-[var(--lyra-space-2)] p-[var(--lyra-space-2)] border border-[color-mix(in_srgb,var(--lyra-app-border)_64%,transparent)] border-[var(--lyra-stroke-thin)] rounded-[var(--lyra-radius-8)] bg-[var(--lyra-app-input-bg)]";
export const HISTORY_TITLEBAR_CATEGORY_CLASS =
  "lyra-history-titlebar-category gap-[var(--lyra-space-6)] max-[720px]:px-[var(--lyra-space-6)] [&.lyra-titlebar-context-button-active]:text-[var(--lyra-text-primary)] [&.lyra-titlebar-context-button-active]:bg-[var(--lyra-app-row-active-bg)]";
export const HISTORY_TITLEBAR_CATEGORY_COUNT_CLASS =
  "lyra-history-titlebar-category-count text-[var(--lyra-text-muted)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-caption)] opacity-[var(--lyra-opacity-lifted)] max-[720px]:hidden";
export const HISTORY_ERROR_CLASS =
  "lyra-agent-history-error items-center mt-[var(--lyra-space-10)] mx-[var(--lyra-space-12)] [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap";
export const HISTORY_SPLIT_CLASS =
  "lyra-agent-history-split w-full flex-1 min-h-0 grid grid-cols-[var(--lyra-app-sidebar-rail-w)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] max-[860px]:grid-cols-1 max-[860px]:grid-rows-[minmax(var(--lyra-unit-260),48vh)_minmax(var(--lyra-unit-260),1fr)]";
export const HISTORY_LIST_CLASS =
  "lyra-agent-history-list min-w-0 min-h-0 max-[860px]:border-b max-[860px]:border-[var(--lyra-app-border)] max-[860px]:border-[var(--lyra-stroke-thin)] max-[860px]:border-r-0";
export const HISTORY_LIST_CONTENT_CLASS =
  "lyra-agent-history-list-content min-w-0 min-h-0 flex-1 overflow-y-auto content-start";
export const HISTORY_STATE_CLASS = "lyra-agent-history-state min-h-0 flex-1";
export const HISTORY_GROUP_LIST_CLASS =
  "lyra-agent-history-group-list min-w-0 grid content-start gap-[var(--lyra-app-sidebar-row-gap)]";
export const HISTORY_PROJECT_GROUP_CLASS =
  "lyra-agent-history-project-group min-w-0 grid content-start gap-0";
export const HISTORY_PROJECT_GROUP_NEW_CLASS =
  "lyra-agent-history-project-group-new w-[var(--lyra-control-h-24)] h-[var(--lyra-control-h-24)] m-0 opacity-0 pointer-events-none max-[720px]:inline-flex max-[720px]:opacity-100 max-[720px]:visible max-[720px]:pointer-events-auto";
export const HISTORY_PROJECT_GROUP_SESSIONS_CLASS =
  "lyra-agent-history-project-group-sessions min-w-0 grid content-start gap-0";
export const HISTORY_SITE_FAVICON_CLASS =
  "lyra-agent-history-site-favicon w-[var(--lyra-app-sidebar-icon-size)] h-[var(--lyra-app-sidebar-icon-size)] inline-flex items-center justify-center rounded-[var(--lyra-radius-4)] object-contain";
export const HISTORY_SITE_FAVICON_FALLBACK_CLASS =
  "lyra-agent-history-site-favicon-fallback w-[var(--lyra-app-sidebar-icon-size)] h-[var(--lyra-app-sidebar-icon-size)] inline-flex items-center justify-center rounded-[var(--lyra-radius-4)] text-[var(--lyra-text-secondary)] bg-[var(--lyra-app-input-bg)] text-[length:var(--lyra-text-size-caption)] font-bold";
export const HISTORY_SESSION_STATUS_CLASS =
  "lyra-agent-history-session-status w-[var(--lyra-app-sidebar-icon-size)] h-[var(--lyra-app-sidebar-icon-size)] inline-flex items-center justify-center [&_.lyra-agents-braille-spinner]:text-[length:var(--lyra-text-size-12)] [&_.lyra-agents-braille-spinner]:leading-[var(--lyra-text-line-flat)]";
export const HISTORY_ROW_ACTION_CLASS =
  "lyra-agent-history-row-action [&:hover:not(:disabled)]:text-[var(--lyra-text-primary)] [&[data-active=true]]:text-[var(--lyra-text-primary)]";
export const HISTORY_SESSION_CARD_CLASS =
  "lyra-agent-history-session-card max-w-[min(var(--lyra-unit-280),calc(100vw_-_var(--lyra-space-24)))] p-[var(--lyra-space-8)_var(--lyra-space-10)] [&.lyra-ui-tooltip-content]:max-w-[min(var(--lyra-unit-280),calc(100vw_-_var(--lyra-space-24)))] [&.lyra-ui-tooltip-content]:p-[var(--lyra-space-8)_var(--lyra-space-10)]";
export const HISTORY_SESSION_CARD_BODY_CLASS =
  "lyra-agent-history-session-card-body min-w-0 grid gap-[var(--lyra-space-4)]";
export const HISTORY_SESSION_CARD_TITLE_CLASS =
  "lyra-agent-history-session-card-title min-w-0 text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-body)] font-semibold leading-[var(--lyra-text-line-18)] [overflow-wrap:anywhere]";
export const HISTORY_SESSION_CARD_LINE_CLASS =
  "lyra-agent-history-session-card-line min-w-0 grid grid-cols-[var(--lyra-icon-size-12)_minmax(0,1fr)] items-center gap-[var(--lyra-space-6)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-18)] [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap";
export const HISTORY_SESSION_CARD_AGE_CLASS =
  "lyra-agent-history-session-card-age text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] tabular-nums";
export const HISTORY_PREVIEW_CLASS =
  "lyra-agent-history-preview min-w-0 min-h-0 flex flex-col overflow-hidden bg-[var(--lyra-app-panel-bg)]";
export const HISTORY_PREVIEW_CHAT_CLASS =
  "lyra-agent-history-preview-chat p-0 [mask-image:none] [-webkit-mask-image:none]";
export const HISTORY_PREVIEW_CHAT_INNER_CLASS =
  "lyra-agent-history-preview-chat-inner w-full max-w-[max(var(--lyra-unit-860),calc(100%_-_var(--lyra-space-64)*2))] mx-auto p-[var(--lyra-space-24)] max-[720px]:p-[var(--lyra-space-16)]";
export const HISTORY_PREVIEW_EMPTY_INLINE_CLASS =
  "lyra-agent-history-preview-empty-inline flex-none min-h-[var(--lyra-unit-180)]";
export const HISTORY_PREVIEW_STATE_CLASS = "lyra-agent-history-preview-state min-h-0 flex-1";
export const HISTORY_PREVIEW_EMPTY_CLASS = "lyra-agent-history-preview-empty min-h-0 flex-1";
export const HISTORY_WEB_PAGE_HOST_CLASS =
  "lyra-agent-history-web-page-host relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[var(--lyra-app-panel-bg)]";
export const HISTORY_PROJECT_GROUP_HEADER_CLASS =
  "lyra-agent-history-project-group-header [&:hover_.lyra-agent-history-project-group-new]:opacity-100 [&:hover_.lyra-agent-history-project-group-new]:pointer-events-auto [&:has(.lyra-agent-history-project-group-new:focus-visible)]:text-[var(--lyra-text-primary)] [&:has(.lyra-agent-history-project-group-new:focus-visible)]:bg-[var(--lyra-app-row-hover-bg)]";
