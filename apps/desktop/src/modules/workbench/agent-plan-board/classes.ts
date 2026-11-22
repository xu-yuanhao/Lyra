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
