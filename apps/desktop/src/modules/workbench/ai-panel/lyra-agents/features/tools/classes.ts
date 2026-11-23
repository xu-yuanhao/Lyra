export const TOOL_GROUP_CLASS =
  "lyra-agents-tool-group flex flex-col gap-[var(--lyra-space-2)] relative [&.lyra-agents-mode-done_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-success)] [&.lyra-agents-mode-error_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-error)] [&.lyra-agents-mode-warning_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-warning)] [&.lyra-agents-mode-running_.lyra-agents-tool-group-lead]:text-[var(--lyra-text-secondary)] [&.lyra-agents-mode-suspended_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-warning)]";
export const TOOL_GROUP_HEAD_CLASS =
  "lyra-agents-tool-group-head inline-flex items-center gap-[var(--lyra-space-6)] py-[var(--lyra-space-2)] bg-transparent border-0 text-[var(--lyra-text-secondary)] cursor-pointer font-[inherit] text-left self-start [&:hover_.lyra-agents-tool-group-label]:text-[var(--lyra-text-primary)] [&:hover_.lyra-agents-chevron-slot]:opacity-100 [&:focus-visible_.lyra-agents-chevron-slot]:opacity-100 [&:hover_.lyra-agents-tool-group-lead]:opacity-0 [&:focus-visible_.lyra-agents-tool-group-lead]:opacity-0 [&.lyra-ui-button]:h-auto [&.lyra-ui-button]:min-h-0 [&.lyra-ui-button]:px-0 [&.lyra-ui-button]:border-transparent [&.lyra-ui-button]:rounded-none [&.lyra-ui-button]:bg-transparent [&.lyra-ui-button]:shadow-none [&.lyra-ui-button]:transform-none [&.lyra-ui-button:hover:not(:disabled)]:bg-transparent [&.lyra-ui-button:hover:not(:disabled)]:border-transparent [&.lyra-ui-button:hover:not(:disabled)]:shadow-none [&.lyra-ui-button:hover:not(:disabled)]:transform-none [&.lyra-ui-button:active:not(:disabled)]:bg-transparent [&.lyra-ui-button:active:not(:disabled)]:border-transparent [&.lyra-ui-button:active:not(:disabled)]:shadow-none [&.lyra-ui-button:active:not(:disabled)]:transform-none [&.lyra-ui-button:focus-visible]:shadow-none [&.lyra-ui-button:focus-visible]:outline-[length:var(--lyra-stroke-strong)] [&.lyra-ui-button:focus-visible]:outline-[var(--lyra-app-focus)] [&.lyra-ui-button:focus-visible]:outline-offset-[var(--lyra-space-2)]";
export const TOOL_GROUP_LABEL_CLASS =
  "lyra-agents-tool-group-label min-w-0 text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-secondary)] transition-[color_var(--lyra-motion-fast)]";
export const TOOL_GROUP_HINT_CLASS =
  "lyra-agents-tool-group-hint font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-status-success)] ml-[var(--lyra-space-4)]";
export const THINKING_BODY_CLASS = "lyra-agents-thinking-body py-[var(--lyra-space-3)]";
export const INLINE_STATS_CLASS =
  "lyra-agents-inline-stats font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] inline-flex gap-[var(--lyra-space-6)] ml-[var(--lyra-space-4)]";
export const CHEVRON_SLOT_CLASS =
  "lyra-agents-chevron-slot absolute inset-0 flex items-center justify-center text-[var(--lyra-text-muted)] opacity-0 transition-[opacity_var(--lyra-motion-fast)]";
export const TOOL_GROUP_LEAD_CLASS =
  "lyra-agents-tool-group-lead absolute inset-0 flex items-center justify-center text-[var(--lyra-text-secondary)] transition-[opacity_var(--lyra-motion-fast)]";
export const TOOL_GROUP_ICON_SLOT_CLASS =
  "lyra-agents-tool-group-icon-slot relative w-[var(--lyra-space-16)] h-[var(--lyra-space-16)] shrink-0";
export const TOOL_GROUP_CURRENT_ICON_CLASS =
  "lyra-agents-tool-group-current-icon inline-flex items-center text-[var(--lyra-text-muted)]";
export const TOOL_GROUP_BODY_CLASS = "lyra-agents-tool-group-body";
export const toolCallStatusIconClass = (status: string): string => {
  if (status === "suspended" || status === "warning") return "[&_.lyra-agents-icon-swap-tool]:text-[var(--lyra-status-warning)]";
  if (status === "error") return "[&_.lyra-agents-icon-swap-tool]:text-[var(--lyra-status-error)]";
  return "";
};
