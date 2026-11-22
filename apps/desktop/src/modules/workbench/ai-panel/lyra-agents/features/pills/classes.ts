const PILLS_SHELL =
  "relative flex max-w-[var(--lyra-unit-420)] flex-col overflow-hidden rounded-b-[var(--lyra-radius-14)] border border-[var(--lyra-stroke-thin)] border-t-0 border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] bg-[var(--lyra-effect-glass-subtle)] shadow-none transition-[background,border-color] duration-[var(--lyra-motion-fast-duration)] [transition-timing-function:var(--lyra-ease-fast),var(--lyra-motion-standard)]";
const PILLS_COLLAPSE =
  "grid grid-rows-[0fr] transition-[grid-template-rows] duration-[var(--lyra-motion-panel-layout-duration)] [transition-timing-function:var(--lyra-ease-tick)] data-[open=true]:grid-rows-[1fr]";
const PILLS_COLLAPSE_INNER =
  "min-h-0 overflow-hidden opacity-0 -translate-y-[var(--lyra-space-4)] transition-[opacity,transform] duration-[var(--lyra-motion-standard-duration),var(--lyra-motion-fast-duration)] [transition-timing-function:var(--lyra-ease-fast),var(--lyra-ease-fast)] [transition-delay:40ms,40ms] data-[open=true]:translate-y-0 [[data-open=true]>&]:opacity-100";
const PILLS_BODY =
  "max-h-[var(--lyra-unit-220)] overflow-y-auto px-[var(--lyra-space-12)] pt-[var(--lyra-space-4)] pb-[var(--lyra-space-10)] [scrollbar-width:thin] [scrollbar-color:transparent_transparent] hover:[scrollbar-color:var(--lyra-effect-scrollbar-soft)_transparent] [mask-image:linear-gradient(to_bottom,transparent_0%,black_var(--lyra-space-12),black_calc(100%-var(--lyra-space-12)),transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,black_var(--lyra-space-12),black_calc(100%-var(--lyra-space-12)),transparent_100%)] [&::-webkit-scrollbar]:w-[var(--lyra-space-5)] [&::-webkit-scrollbar-thumb]:rounded-[var(--lyra-radius-4)] [&::-webkit-scrollbar-thumb]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-[var(--lyra-effect-scrollbar-soft)]";

export const DS_PILL_CLASS = "lyra-agents-diff-stats-pill " + PILLS_SHELL;
export const DS_PILL_HEAD_CLASS =
  "lyra-agents-diff-stats-pill-head flex h-[var(--lyra-space-36)] cursor-pointer items-center gap-[var(--lyra-space-8)] whitespace-nowrap border-0 bg-transparent px-[var(--lyra-space-12)] py-0 text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-body)] [font:inherit]";
export const DS_SUMMARY_CLASS =
  "lyra-agents-diff-stats-summary flex gap-[var(--lyra-space-6)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)]";
export const DS_COUNT_CLASS = "lyra-agents-diff-stats-count text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-12)]";
export const DS_COLLAPSE_CLASS = `lyra-agents-diff-stats-collapse ${PILLS_COLLAPSE}`;
export const DS_COLLAPSE_INNER_CLASS = `lyra-agents-diff-stats-collapse-inner ${PILLS_COLLAPSE_INNER}`;
export const DS_BODY_CLASS = `lyra-agents-diff-stats-body ${PILLS_BODY}`;
export const DS_LIST_CLASS =
  "lyra-agents-diff-stats-list m-0 flex min-w-[var(--lyra-unit-240)] list-none flex-col gap-[var(--lyra-space-3)] p-0";
export const DS_ITEM_CLASS =
  "lyra-agents-diff-stats-item flex items-center gap-[var(--lyra-space-8)] py-[var(--lyra-space-3)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-body)] [[data-open=true]_&]:opacity-0 [[data-open=true]_&]:animate-[stagger-in_var(--lyra-motion-panel-layout-duration)_var(--lyra-ease-standard)_both] [[data-open=true]_&]:[animation-delay:calc(var(--stagger-index,0)*35ms+80ms)] [[data-open=false]_&]:animate-none [[data-open=false]_&]:opacity-100";
export const DS_FILE_ICON_CLASS =
  "lyra-agents-diff-stats-file-icon flex shrink-0 items-center text-[var(--lyra-text-muted)]";
export const DS_FILENAME_CLASS =
  "lyra-agents-diff-stats-filename flex-1 truncate font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)]";
export const DS_FILE_NUMS_CLASS =
  "lyra-agents-diff-stats-file-nums flex shrink-0 gap-[var(--lyra-space-5)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)]";
export const PILLS_RAIL_CLASS = "lyra-agents-pills-rail";
