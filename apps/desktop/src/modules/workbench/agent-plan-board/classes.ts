export const APB_TEMP_CHAT_CLASS =
  "lyra-agent-plan-board-temp-chat relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-[var(--lyra-text-primary)]";
export const APB_TEMP_CHAT_BODY_CLASS =
  "lyra-agent-plan-board-temp-chat-body flex min-h-0 flex-1 flex-col gap-[var(--lyra-space-12)] overflow-y-auto overflow-x-hidden px-[var(--lyra-space-14)] pt-[var(--lyra-space-16)] pb-[calc(var(--lyra-space-64)+var(--lyra-space-64)+var(--lyra-space-24))] [mask-image:linear-gradient(to_bottom,black_0%,black_calc(100%-var(--lyra-space-48)),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,black_0%,black_calc(100%-var(--lyra-space-48)),transparent_100%)]";
const APB_TEMP_CHAT_MESSAGE_BASE =
  "lyra-agent-plan-board-temp-chat-message max-w-full break-words font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-comfortable)] text-[var(--lyra-text-primary)] [&_.lyra-agents-markdown-document>:first-child]:mt-0 [&_.lyra-agents-markdown-document>:last-child]:mb-0";
export const APB_TEMP_CHAT_MESSAGE_CLASS = (role: string) =>
  `${APB_TEMP_CHAT_MESSAGE_BASE} is-${role} ${
    role === "user"
      ? "max-w-[86%] self-end rounded-[var(--lyra-radius-12)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_64%,transparent)] bg-[var(--lyra-app-surface-strong-bg)] px-[var(--lyra-space-10)] py-[var(--lyra-space-6)]"
      : role === "note"
        ? "self-center text-[var(--lyra-text-muted,var(--lyra-text-secondary))] text-[length:var(--lyra-text-size-caption)]"
        : "self-stretch"
  }`;
export const APB_TEMP_CHAT_BUSY_CLASS =
  "lyra-agent-plan-board-temp-chat-busy font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-secondary)]";
export const APB_TEMP_CHAT_ERROR_CLASS =
  "lyra-agent-plan-board-temp-chat-error text-[length:var(--lyra-text-size-12)]";
export const APB_TEMP_CHAT_COMPOSER_WRAP_CLASS =
  "lyra-agent-plan-board-temp-chat-composer-wrap absolute inset-x-0 bottom-0 w-full max-w-none px-[var(--lyra-space-12)] pt-[var(--lyra-space-16)] pb-[var(--lyra-space-12)]";

export const APB_BOARD_CLASS =
  "lyra-agent-plan-board relative flex h-full min-h-0 flex-col overflow-hidden bg-[var(--lyra-app-surface-bg)] text-[var(--lyra-text-primary)]";
export const APB_TITLEBAR_CLASS =
  "lyra-agent-plan-board-titlebar inline-flex min-w-0 items-center gap-[var(--lyra-space-8)]";
export const APB_TITLEBAR_META_CLASS =
  "lyra-agent-plan-board-titlebar-meta text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)]";
export const APB_ERROR_CLASS = "lyra-agent-plan-board-error m-[var(--lyra-space-12)] text-[length:var(--lyra-text-size-12)]";
export const APB_MAIN_CLASS =
  "lyra-agent-plan-board-main flex flex-col pt-[var(--lyra-space-12)]";
export const APB_MAIN_HAS_TODO_CLASS = APB_MAIN_CLASS + " has-todo";
const APB_SECTION_BASE = "border-0 bg-transparent rounded-none";
export const APB_PLAN_SECTION_CLASS =
  `lyra-agent-plan-board-plan p-0 ${APB_SECTION_BASE} [&>h2]:hidden`;
export const APB_TODO_SECTION_CLASS =
  `lyra-agent-plan-board-todo mx-[var(--lyra-space-24)] mb-[var(--lyra-space-24)] pt-[var(--lyra-space-16)] border-t border-[var(--lyra-stroke-thin)] border-[var(--lyra-divider-soft)] ${APB_SECTION_BASE} [&>h2]:mb-[var(--lyra-space-10)] [&>h2]:flex [&>h2]:items-baseline [&>h2]:gap-[var(--lyra-space-6)] [&>h2]:p-0 [&>h2]:text-[var(--lyra-text-muted)] [&>h2]:text-[length:var(--lyra-text-size-caption)] [&>h2]:font-semibold [&>h2]:leading-[var(--lyra-text-line-caption)]`;
export const APB_TODO_COUNT_CLASS =
  "lyra-agent-plan-board-todo-count tabular-nums";
export const APB_TODO_LIST_CLASS =
  "lyra-agent-plan-board-todo-list grid gap-[var(--lyra-space-2)] p-0";
const APB_TODO_ITEM_BASE =
  "lyra-agent-plan-board-todo-item grid grid-cols-[var(--lyra-icon-size-16)_minmax(0,1fr)_auto] items-start gap-[var(--lyra-space-8)] rounded-[var(--lyra-radius-6)] bg-transparent px-0 py-[var(--lyra-space-4)] text-[var(--lyra-text-secondary)] hover:bg-[var(--lyra-app-row-hover-bg)]";
export const APB_TODO_ITEM_CLASS = (status: string, isCurrent: boolean) => {
  const active = status === "is-current" || status === "is-running" || isCurrent;
  const extra =
    status === "is-done"
      ? " is-done"
      : status === "is-running"
        ? " is-running"
        : status === "is-failed"
          ? " is-failed"
          : status === "is-muted"
            ? " is-muted"
            : " is-pending";
  const current = isCurrent ? " is-current" : "";
  return `${APB_TODO_ITEM_BASE}${extra}${current} ${active ? "bg-[var(--lyra-app-row-active-bg)] text-[var(--lyra-text-primary)]" : "text-[var(--lyra-text-secondary)]"}`;
};
export const APB_TODO_ICON_CLASS =
  "lyra-agent-plan-board-todo-icon inline-flex mt-[0.15em] text-[var(--lyra-text-muted)] [[class*='is-running']>&]:text-[var(--lyra-text-accent)] [[class*='is-done']>&]:text-[var(--lyra-status-success)] [[class*='is-failed']>&]:text-[var(--lyra-status-error)]";
export const APB_TODO_CONTENT_CLASS =
  "lyra-agent-plan-board-todo-content break-anywhere text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-body)] [[class*='is-done']>&]:text-[var(--lyra-text-muted)] [[class*='is-done']>&]:line-through";
export const APB_TODO_META_CLASS =
  "lyra-agent-plan-board-todo-meta inline-flex items-center gap-[var(--lyra-space-6)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)]";
export const APB_TODO_STATUS_CLASS = "lyra-agent-plan-board-todo-status";
export const APB_INLINE_ACTIONS_CLASS = "lyra-agent-plan-board-inline-actions";
export const APB_BADGE_SET_ASIDE_CLASS =
  "lyra-agent-plan-board-badge is-set-aside rounded-[var(--lyra-radius-pill)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-text-accent)_32%,transparent)] bg-[color-mix(in_srgb,var(--lyra-text-accent)_18%,transparent)] px-[var(--lyra-space-6)] text-[var(--lyra-text-accent)]";
export const APB_RESUME_BTN_CLASS = "lyra-agent-plan-board-resume-btn gap-[var(--lyra-space-6)]";
export const APB_MARKDOWN_CLASS =
  "lyra-agent-plan-board-markdown w-full px-[var(--lyra-space-24)] pb-[var(--lyra-space-24)] leading-[var(--lyra-text-line-loose)] [.has-todo_&]:pb-[var(--lyra-space-8)] [&>:first-child]:mt-0 [&>:first-child_:where(h1,h2,h3,h4,h5,p,ul,ol,pre):first-child]:mt-0 [&_h2]:mt-[var(--lyra-space-20)] [&_h2]:mb-[var(--lyra-space-8)] [&_h3]:mt-[var(--lyra-space-20)] [&_h3]:mb-[var(--lyra-space-8)] [&_h4]:mt-[var(--lyra-space-20)] [&_h4]:mb-[var(--lyra-space-8)] [&_h5]:mt-[var(--lyra-space-20)] [&_h5]:mb-[var(--lyra-space-8)] [&_h2]:leading-[var(--lyra-text-line-tight)] [&_h3]:leading-[var(--lyra-text-line-tight)] [&_h4]:leading-[var(--lyra-text-line-tight)] [&_h5]:leading-[var(--lyra-text-line-tight)] [&_p]:my-[var(--lyra-space-8)] [&_p]:text-[var(--lyra-text-secondary)] [&_pre]:overflow-auto [&_pre]:rounded-[var(--lyra-radius-10)] [&_pre]:border [&_pre]:border-[var(--lyra-stroke-thin)] [&_pre]:border-[color-mix(in_srgb,var(--lyra-app-border)_40%,transparent)] [&_pre]:bg-[color-mix(in_srgb,var(--lyra-app-surface-bg)_88%,black_12%)] [&_pre]:p-[var(--lyra-space-12)]";
export const APB_LINE_CLASS =
  "lyra-agent-plan-board-line group/line relative mx-0 my-[var(--lyra-space-4)] rounded-[var(--lyra-radius-8)] px-[var(--lyra-space-4)] py-[var(--lyra-space-2)] hover:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_52%,transparent)] focus-within:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_52%,transparent)]";
export const APB_LINE_CONTENT_CLASS = "lyra-agent-plan-board-line-content min-w-0";
export const APB_LINE_ACTIONS_CLASS =
  "lyra-agent-plan-board-line-actions pointer-events-none absolute top-[var(--lyra-space-2)] right-[var(--lyra-space-4)] inline-flex gap-[var(--lyra-space-4)] invisible -translate-y-[var(--lyra-space-2)] opacity-0 transition-[opacity,transform,visibility] duration-[var(--lyra-motion-fast)] [transition-duration:var(--lyra-motion-fast),var(--lyra-motion-fast),120ms] group-hover/line:visible group-hover/line:pointer-events-auto group-hover/line:translate-y-0 group-hover/line:opacity-100 focus-within:visible focus-within:pointer-events-auto focus-within:translate-y-0 focus-within:opacity-100";
export const APB_LINE_ICON_BTN_CLASS =
  "lyra-agent-plan-board-line-icon-btn inline-flex size-[var(--lyra-unit-26)] cursor-pointer items-center justify-center rounded-[var(--lyra-radius-pill)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_58%,transparent)] bg-[var(--lyra-app-popover-bg)] p-0 text-[var(--lyra-text-secondary)] shadow-[var(--lyra-shadow-elevated-md)] hover:border-[color-mix(in_srgb,var(--lyra-text-accent)_38%,var(--lyra-app-border))] hover:text-[var(--lyra-text-primary)] disabled:cursor-default disabled:opacity-[var(--lyra-opacity-disabled)]";
export const APB_LINE_EDITOR_CLASS =
  "lyra-agent-plan-board-line-editor mx-[var(--lyra-space-4)] my-[var(--lyra-space-4)] flex items-center gap-[var(--lyra-space-6)]";
export const APB_LINE_INPUT_CLASS =
  "lyra-agent-plan-board-line-input min-w-0 flex-1 h-[var(--lyra-space-30)] rounded-[var(--lyra-radius-8)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-text-accent)_42%,var(--lyra-app-border))] bg-[var(--lyra-app-surface-bg)] px-[var(--lyra-space-10)] py-0 text-[var(--lyra-text-primary)] outline-none";
export const APB_LINE_TEXTAREA_CLASS =
  "lyra-agent-plan-board-line-textarea h-auto resize-y py-[var(--lyra-space-6)] px-[var(--lyra-space-10)] leading-[var(--lyra-text-line-comfortable)] font-[family-name:var(--lyra-font-mono,monospace)]";
export const APB_RICH_CLASS = "lyra-agent-plan-board-rich my-[var(--lyra-space-6)] text-[var(--lyra-text-secondary)]";
export const APB_INLINE_MARKDOWN_CLASS =
  "lyra-agent-plan-board-inline-markdown min-w-0 [&>:first-child]:m-0 [&_p]:m-0";
export const APB_LINE_NOTES_CLASS =
  "lyra-agent-plan-board-line-notes mx-0 my-[var(--lyra-space-5)] mb-[var(--lyra-space-2)] flex flex-col gap-[var(--lyra-space-5)]";
export const APB_LINE_NOTE_CLASS = (kind: string) =>
  `lyra-agent-plan-board-line-note is-${kind} w-fit max-w-full rounded-[var(--lyra-radius-8)] border-l-[var(--lyra-stroke-strong)] border-l-[color-mix(in_srgb,var(--lyra-text-accent)_54%,transparent)] bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_62%,transparent)] px-[var(--lyra-space-8)] py-[var(--lyra-space-5)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-normal)]${kind === "edit" ? " border-l-[color-mix(in_srgb,var(--lyra-status-success)_58%,var(--lyra-text-accent))]" : ""}`;
export const APB_LIST_ROW_CLASS =
  "lyra-agent-plan-board-list-row mx-0 my-[var(--lyra-space-6)] grid grid-cols-[var(--lyra-space-24)_minmax(0,1fr)] gap-[var(--lyra-space-4)] text-[var(--lyra-text-secondary)]";
export const APB_LIST_MARKER_CLASS = "lyra-agent-plan-board-list-marker text-[var(--lyra-text-muted)]";
export const APB_WORKSPACE_CLASS =
  "lyra-agent-plan-board-workspace grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] overflow-hidden max-[720px]:grid-cols-[minmax(0,1fr)] max-[720px]:grid-rows-[minmax(0,1fr)_minmax(var(--lyra-unit-240),42%)] has-chat:grid-cols-[minmax(0,1fr)_minmax(0,var(--lyra-unit-360))]";
export const APB_WORKSPACE_DOCUMENT_CLASS =
  "lyra-agent-plan-board-workspace-document min-h-0 min-w-0 overflow-auto [&>.lyra-agent-plan-board-empty]:p-[var(--lyra-space-20)]";
export const APB_EMPTY_CLASS = "lyra-agent-plan-board-empty";
export const APB_CHAT_RAIL_CLASS =
  "lyra-agent-plan-board-chat-rail lyra-agents-host flex h-full max-h-full w-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-[var(--lyra-stroke-thin)] border-[var(--lyra-app-border)] bg-[var(--lyra-app-surface-bg)] max-[720px]:border-l-0 max-[720px]:border-t max-[720px]:border-[var(--lyra-stroke-thin)] max-[720px]:border-[var(--lyra-app-border)]";
export const APB_CHAT_HEADER_CLASS =
  "lyra-agent-plan-board-chat-header flex min-h-[var(--lyra-shell-titlebar-nav-h)] min-w-0 flex-none items-center justify-between gap-[var(--lyra-space-8)] border-b border-[var(--lyra-stroke-thin)] border-[var(--lyra-app-border)] px-[var(--lyra-space-10)]";
export const APB_CHAT_TITLE_CLASS =
  "lyra-agent-plan-board-chat-title min-w-0 truncate text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] font-medium leading-[var(--lyra-text-line-flat)]";
export const APB_CHAT_MENU_TRIGGER_CLASS =
  "lyra-agent-plan-board-chat-menu-trigger lyra-ui-button h-[var(--lyra-agents-composer-toolbar-control-size)] max-w-[min(100%,var(--lyra-unit-220))] min-w-0 gap-[var(--lyra-space-4)] px-[var(--lyra-space-8)] text-[var(--lyra-text-secondary)]";
export const APB_CHAT_MENU_CURRENT_CLASS =
  "lyra-agent-plan-board-chat-menu-current min-w-0 truncate";
export const APB_CHAT_MENU_CLASS =
  "lyra-agent-plan-board-chat-menu min-w-[var(--lyra-unit-220)] max-w-[var(--lyra-unit-320)]";
export const APB_CHAT_MENU_PLAN_CLASS =
  "lyra-agent-plan-board-chat-menu-plan relative min-w-0 group/menu-plan";
export const APB_CHAT_MENU_PLAN_OPEN_CLASS =
  "lyra-agent-plan-board-chat-menu-plan-open lyra-ui-menu-item pr-[calc(var(--lyra-control-h-compact)+var(--lyra-space-6))]";
export const APB_CHAT_MENU_DELETE_CLASS =
  "lyra-agent-plan-board-chat-menu-delete lyra-app-icon-button pointer-events-none absolute top-1/2 right-[var(--lyra-space-4)] z-[1] size-[var(--lyra-control-h-24)] -translate-y-1/2 opacity-0 group-hover/menu-plan:pointer-events-auto group-hover/menu-plan:opacity-100 group-focus-within/menu-plan:pointer-events-auto group-focus-within/menu-plan:opacity-100";
export const APB_PLAN_CHECK_CLASS = (selected: boolean) =>
  `lyra-agent-plan-board-plan-check ${selected ? "is-selected opacity-100" : "opacity-0"}`;
