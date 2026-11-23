export const TOOL_GROUP_CLASS =
  "lyra-agents-tool-group flex flex-col gap-[var(--lyra-space-2)] relative [&.lyra-agents-mode-done_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-success)] [&.lyra-agents-mode-error_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-error)] [&.lyra-agents-mode-warning_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-warning)] [&.lyra-agents-mode-running_.lyra-agents-tool-group-lead]:text-[var(--lyra-text-secondary)] [&.lyra-agents-mode-suspended_.lyra-agents-tool-group-lead]:text-[var(--lyra-status-warning)]";
export const TOOL_GROUP_HEAD_CLASS =
  "lyra-agents-tool-group-head inline-flex items-center gap-[var(--lyra-space-6)] py-[var(--lyra-space-2)] bg-transparent border-0 text-[var(--lyra-text-secondary)] cursor-pointer font-[inherit] text-left self-start select-none [&:hover_.lyra-agents-tool-group-label]:text-[var(--lyra-text-primary)] [&:hover_.lyra-agents-chevron-slot]:opacity-100 [&:focus-visible_.lyra-agents-chevron-slot]:opacity-100 [&:hover_.lyra-agents-tool-group-lead]:opacity-0 [&:focus-visible_.lyra-agents-tool-group-lead]:opacity-0 [&.lyra-ui-button]:h-auto [&.lyra-ui-button]:min-h-0 [&.lyra-ui-button]:px-0 [&.lyra-ui-button]:border-transparent [&.lyra-ui-button]:rounded-none [&.lyra-ui-button]:bg-transparent [&.lyra-ui-button]:shadow-none [&.lyra-ui-button]:transform-none [&.lyra-ui-button:hover:not(:disabled)]:bg-transparent [&.lyra-ui-button:hover:not(:disabled)]:border-transparent [&.lyra-ui-button:hover:not(:disabled)]:shadow-none [&.lyra-ui-button:hover:not(:disabled)]:transform-none [&.lyra-ui-button:active:not(:disabled)]:bg-transparent [&.lyra-ui-button:active:not(:disabled)]:border-transparent [&.lyra-ui-button:active:not(:disabled)]:shadow-none [&.lyra-ui-button:active:not(:disabled)]:transform-none [&.lyra-ui-button:focus-visible]:shadow-none [&.lyra-ui-button:focus-visible]:outline-[length:var(--lyra-stroke-strong)] [&.lyra-ui-button:focus-visible]:outline-[var(--lyra-app-focus)] [&.lyra-ui-button:focus-visible]:outline-offset-[var(--lyra-space-2)]";
export const TOOL_GROUP_LABEL_CLASS =
  "lyra-agents-tool-group-label min-w-0 text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-secondary)] transition-[color_var(--lyra-motion-fast)]";
export const TOOL_GROUP_HINT_CLASS =
  "lyra-agents-tool-group-hint font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-status-success)] ml-[var(--lyra-space-4)]";
export const THINKING_BODY_CLASS = "lyra-agents-thinking-body py-[var(--lyra-space-3)] block w-full min-w-0 max-w-full m-0 p-0 border-0 bg-transparent shadow-none font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] font-normal leading-[var(--lyra-text-line-comfortable)] text-[var(--lyra-text-secondary)] whitespace-pre-wrap break-words";
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
export const TOOL_GROUP_BODY_CLASS = "lyra-agents-tool-group-body flex flex-col pl-[var(--lyra-space-22)] mt-[var(--lyra-space-2)]";
export const toolCallStatusIconClass = (status: string): string => {
  if (status === "suspended" || status === "warning") return "[&_.lyra-agents-icon-swap-tool]:text-[var(--lyra-status-warning)]";
  if (status === "error") return "[&_.lyra-agents-icon-swap-tool]:text-[var(--lyra-status-error)]";
  return "";
};
export const STAGGER_ITEM_CLASS =
  "lyra-agents-stagger-item opacity-0 animate-[stagger-in_var(--lyra-motion-panel-layout-duration)_var(--lyra-ease-standard)_both] [animation-delay:calc(var(--stagger-index,0)*55ms+90ms)] [.lyra-agents-collapse[data-open=false]_&]:animate-none [.lyra-agents-collapse[data-open=false]_&]:opacity-100 motion-reduce:animate-none motion-reduce:opacity-100";
export const TOOL_CALL_CLASS =
  "lyra-agents-tool-call flex flex-col relative";
export const TOOL_CALL_HEAD_ROW_CLASS =
  "lyra-agents-tool-call-head-row inline-flex items-center gap-[var(--lyra-space-8)] py-[var(--lyra-space-3)] max-w-full self-start [&:hover_.lyra-agents-tool-call-title]:text-[var(--lyra-text-primary)] [&:hover_.lyra-agents-icon-swap]:text-[var(--lyra-text-secondary)] [&.has-details:hover_.lyra-agents-icon-swap-tool]:opacity-0 [&.has-details:has(:focus-visible)_.lyra-agents-icon-swap-tool]:opacity-0 [&.has-details:hover_.lyra-agents-icon-swap-chevron]:opacity-100 [&.has-details:has(:focus-visible)_.lyra-agents-icon-swap-chevron]:opacity-100";
export const TOOL_CALL_TWIST_CLASS =
  "lyra-agents-tool-call-twist w-[var(--lyra-space-16)] h-[var(--lyra-space-16)] min-w-[var(--lyra-space-16)] min-h-[var(--lyra-space-16)] p-0";
export const TOOL_CALL_HEAD_CLASS =
  "lyra-agents-tool-call-head inline-flex items-center gap-[var(--lyra-space-8)] p-0 bg-transparent border-0 text-[var(--lyra-text-secondary)] cursor-pointer font-[inherit] text-left min-w-0 max-w-full disabled:cursor-default [&:not(:disabled):hover_.lyra-agents-tool-call-title]:text-[var(--lyra-text-primary)] select-none";
export const ICON_SWAP_CLASS =
  "lyra-agents-icon-swap relative w-[var(--lyra-space-16)] h-[var(--lyra-space-16)] inline-flex items-center justify-center text-[var(--lyra-text-muted)] shrink-0";
export const ICON_SWAP_TOOL_CLASS =
  "lyra-agents-icon-swap-tool absolute inset-0 flex items-center justify-center transition-[opacity_var(--lyra-motion-fast)] opacity-100";
export const ICON_SWAP_CHEVRON_CLASS =
  "lyra-agents-icon-swap-chevron absolute inset-0 flex items-center justify-center transition-[opacity_var(--lyra-motion-fast)] opacity-0";
export const TOOL_CALL_HEAD_LABEL_CLASS =
  "lyra-agents-tool-call-head-label inline-flex items-center gap-[var(--lyra-space-8)] min-w-0 flex-1 flex-nowrap overflow-hidden";
export const TOOL_CALL_TITLE_CLASS =
  "lyra-agents-tool-call-title min-w-0 font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-secondary)] transition-[color_var(--lyra-motion-fast)] whitespace-nowrap overflow-hidden text-ellipsis shrink-0";
export const TOOL_CALL_TARGET_CLASS =
  "lyra-agents-tool-call-target inline-flex items-center gap-[var(--lyra-space-6)] min-w-0 p-0 border-0 bg-transparent font-[family-name:var(--lyra-font-mono)] cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis transition-[color_var(--lyra-motion-fast)] text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-secondary)] hover:text-[var(--lyra-text-primary)] focus-visible:outline-[length:var(--lyra-stroke-strong)] focus-visible:outline-[var(--lyra-app-focus)] focus-visible:outline-offset-[var(--lyra-space-2)] focus-visible:rounded-[var(--lyra-radius-4)]";
export const TOOL_CALL_FILE_ICON_CLASS =
  "lyra-agents-tool-call-file-icon inline-flex items-center text-[var(--lyra-text-muted)] shrink-0";
export const TOOL_CALL_TARGET_NAME_CLASS =
  "lyra-agents-tool-call-target-name min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
export const TOOL_PEEK_CLASS =
  "lyra-agents-tool-peek inline-flex items-center gap-[var(--lyra-space-4)] min-w-0 max-w-full flex-wrap";
export const TOOL_PEEK_CHIP_CLASS =
  "lyra-agents-tool-peek-chip inline-flex items-center h-[var(--lyra-space-18)] max-w-[var(--lyra-unit-160)] px-[var(--lyra-space-6)] border border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] border-[var(--lyra-stroke-thin)] rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-row-hover-bg)] text-[var(--lyra-text-secondary)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-20)] overflow-hidden text-ellipsis whitespace-nowrap";
export const TOOL_PEEK_EXCERPT_CLASS =
  "lyra-agents-tool-peek-excerpt inline-block max-w-[min(var(--lyra-unit-360),100%)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-20)] overflow-hidden text-ellipsis whitespace-nowrap";
export const TOOL_PEEK_THUMB_CLASS =
  "lyra-agents-tool-peek-thumb w-[var(--lyra-unit-42)] h-[var(--lyra-space-24)] object-cover border border-[color-mix(in_srgb,var(--lyra-app-border)_64%,transparent)] border-[var(--lyra-stroke-thin)] rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-row-hover-bg)]";
export const TOOL_CALL_BODY_CLASS =
  "lyra-agents-tool-call-body self-stretch w-auto min-w-0 my-[var(--lyra-space-4)] ml-[var(--lyra-space-24)] mb-[var(--lyra-space-8)] py-[var(--lyra-space-10)] px-[var(--lyra-space-12)] max-h-[var(--lyra-unit-260)] overflow-auto overscroll-contain font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-comfortable)] text-[var(--lyra-text-secondary)] bg-[var(--card)] border border-[var(--border)] border-[var(--lyra-stroke-thin)] rounded-[var(--lyra-radius-8)]";
export const TOOL_MONO_TEXT_CLASS =
  "block w-full min-w-0 max-w-full m-0 p-0 border-0 bg-transparent shadow-none font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] font-normal leading-[var(--lyra-text-line-comfortable)] text-[var(--lyra-text-secondary)] whitespace-pre-wrap break-words select-text";
export const TOOL_RESULT_LINE_CLASS = `lyra-agents-tool-result-line ${TOOL_MONO_TEXT_CLASS}`;
export const TOOL_RESULT_ITEM_CLASS =
  "lyra-agents-tool-result-item flex flex-col gap-[var(--lyra-space-2)] w-full min-w-0";
export const TOOL_RESULT_META_CLASS =
  "lyra-agents-tool-result-meta m-0 text-[var(--lyra-text-muted)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-normal)] break-words";
export const TOOL_CALL_BODY_DESCENDANT_CLASS =
  "[&_.lyra-agents-info-block]:w-full [&_.lyra-agents-info-block]:min-w-0 [&_.lyra-agents-info-block]:gap-[var(--lyra-space-4)] [&_.lyra-agents-info-block]:text-[length:var(--lyra-text-size-12)] [&_.lyra-agents-task-card]:w-full [&_.lyra-agents-task-card]:min-w-0 [&_.lyra-agents-task-card]:gap-[var(--lyra-space-4)] [&_.lyra-agents-task-card]:text-[length:var(--lyra-text-size-12)] [&_.lyra-agents-ask-card]:w-full [&_.lyra-agents-ask-card]:min-w-0 [&_.lyra-agents-ask-card]:gap-[var(--lyra-space-4)] [&_.lyra-agents-ask-card]:text-[length:var(--lyra-text-size-12)] [&_.lyra-agents-tool-result-list]:flex [&_.lyra-agents-tool-result-list]:flex-col [&_.lyra-agents-tool-result-list]:gap-[var(--lyra-space-2)] [&_.lyra-agents-tool-result-list]:w-full [&_.lyra-agents-tool-result-list]:min-w-0 [&_.lyra-agents-tool-result-list]:m-0 [&_.lyra-agents-tool-result-list]:p-0 [&_.lyra-agents-tool-result-list]:list-none [&_.lyra-agents-search-results]:flex [&_.lyra-agents-search-results]:flex-col [&_.lyra-agents-search-results]:gap-[var(--lyra-space-2)] [&_.lyra-agents-search-results]:w-full [&_.lyra-agents-search-results]:min-w-0 [&_.lyra-agents-search-results]:m-0 [&_.lyra-agents-search-results]:p-0 [&_.lyra-agents-search-results]:list-none [&_.lyra-agents-web-results]:flex [&_.lyra-agents-web-results]:flex-col [&_.lyra-agents-web-results]:gap-[var(--lyra-space-2)] [&_.lyra-agents-web-results]:w-full [&_.lyra-agents-web-results]:min-w-0 [&_.lyra-agents-web-results]:m-0 [&_.lyra-agents-web-results]:p-0 [&_.lyra-agents-web-results]:list-none [&_.lyra-agents-workbench-tab-list]:flex [&_.lyra-agents-workbench-tab-list]:flex-col [&_.lyra-agents-workbench-tab-list]:gap-[var(--lyra-space-2)] [&_.lyra-agents-workbench-tab-list]:w-full [&_.lyra-agents-workbench-tab-list]:min-w-0 [&_.lyra-agents-workbench-tab-list]:m-0 [&_.lyra-agents-workbench-tab-list]:p-0 [&_.lyra-agents-workbench-tab-list]:list-none [&_.lyra-agents-task-list]:flex [&_.lyra-agents-task-list]:flex-col [&_.lyra-agents-task-list]:gap-[var(--lyra-space-2)] [&_.lyra-agents-task-list]:w-full [&_.lyra-agents-task-list]:min-w-0 [&_.lyra-agents-task-list]:m-0 [&_.lyra-agents-task-list]:p-0 [&_.lyra-agents-task-list]:list-none [&_.lyra-ui-button]:h-auto [&_.lyra-ui-button]:min-h-0 [&_.lyra-ui-button]:justify-start [&_.lyra-ui-button]:px-0 [&_.lyra-ui-button]:border-transparent [&_.lyra-ui-button]:rounded-none [&_.lyra-ui-button]:bg-transparent [&_.lyra-ui-button]:shadow-none [&_.lyra-ui-button]:transform-none [&_.lyra-ui-button]:text-left [&_.lyra-ui-button]:font-[inherit] [&_.lyra-ui-button]:text-[inherit] [&_.lyra-ui-button:hover:not(:disabled)]:bg-transparent [&_.lyra-ui-button:hover:not(:disabled)]:text-[var(--lyra-text-primary)] [&_.lyra-ui-button:active:not(:disabled)]:bg-transparent [&_.lyra-ui-button:active:not(:disabled)]:text-[var(--lyra-text-primary)] [&_.lyra-agents-tool-action-targets]:flex [&_.lyra-agents-tool-action-targets]:flex-col [&_.lyra-agents-tool-action-targets]:flex-nowrap [&_.lyra-agents-tool-action-targets]:gap-[var(--lyra-space-2)] [&_.lyra-agents-tool-action-targets]:m-0 [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:w-full [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:min-h-0 [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:p-0 [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:border-0 [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:rounded-none [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:bg-transparent [&_.lyra-agents-tool-action-targets_.lyra-agents-action-text-link]:font-normal [&_.lyra-agents-tool-artifact-preview_pre]:p-0 [&_.lyra-agents-tool-artifact-preview_pre]:rounded-none [&_.lyra-agents-tool-artifact-preview_pre]:bg-transparent [&_.lyra-agents-tool-artifact-preview_pre]:text-[length:var(--lyra-text-size-12)] [&_.lyra-agents-tool-artifact-preview_pre]:leading-[var(--lyra-text-line-comfortable)] [&_.lyra-syntax-source]:p-0 [&_.lyra-syntax-source]:rounded-none [&_.lyra-syntax-source]:bg-transparent [&_.lyra-syntax-source]:text-[length:var(--lyra-text-size-12)] [&_.lyra-syntax-source]:leading-[var(--lyra-text-line-comfortable)] [&_.lyra-syntax-source]:block [&_.lyra-syntax-source]:w-full [&_.lyra-syntax-source]:min-w-0 [&_.lyra-syntax-source]:m-0 [&_.lyra-syntax-source]:whitespace-pre-wrap [&_.lyra-syntax-source]:break-words";
export const TOOL_ARTIFACTS_CLASS =
  "lyra-agents-tool-artifacts grid gap-[var(--lyra-space-8)] min-w-0";
export const TOOL_ARTIFACT_PREVIEW_LIST_CLASS =
  "lyra-agents-tool-artifact-preview-list grid gap-[var(--lyra-space-6)] min-w-0";
export const TOOL_ARTIFACT_PREVIEW_CLASS =
  "lyra-agents-tool-artifact-preview grid gap-[var(--lyra-space-4)] min-w-0 [&_pre]:m-0 [&_pre]:py-[var(--lyra-unit-7)] [&_pre]:px-[var(--lyra-space-8)] [&_pre]:rounded-[var(--lyra-radius-6)] [&_pre]:bg-[color-mix(in_srgb,var(--lyra-app-surface-strong-bg)_92%,var(--lyra-app-surface-bg)_8%)] [&_pre]:text-[var(--lyra-text-secondary)] [&_pre]:font-[family-name:var(--lyra-font-mono)] [&_pre]:text-[length:var(--lyra-text-size-caption)] [&_pre]:leading-[var(--lyra-text-line-16)] [&_pre]:overflow-auto [&_pre]:whitespace-pre-wrap [&_pre]:break-words";
export const TOOL_ARTIFACT_PREVIEW_HEAD_CLASS =
  "lyra-agents-tool-artifact-preview-head flex items-center gap-[var(--lyra-space-6)] min-w-0 text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-20)] [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap";
export const TOOL_ARTIFACT_MEDIA_CLASS =
  "lyra-agents-tool-artifact-media block w-full max-h-[var(--lyra-unit-360)] rounded-[var(--lyra-radius-8)] bg-[var(--lyra-app-surface-strong-bg)] object-contain";
export const TOOL_ARTIFACT_AUDIO_CLASS =
  "lyra-agents-tool-artifact-audio block w-full";
export const FOLD_LINE_CLASS =
  "lyra-agents-fold-line absolute z-[2] block w-[var(--lyra-space-16)] h-auto min-w-0 min-h-0 top-[var(--lyra-space-24)] bottom-[var(--lyra-space-6)] p-0 border-0 rounded-none bg-transparent shadow-none transform-none cursor-pointer before:content-[''] before:absolute before:top-[var(--lyra-space-1)] before:bottom-[var(--lyra-space-1)] before:left-1/2 before:w-[var(--lyra-unit-0-5)] before:-translate-x-1/2 before:scale-x-50 before:origin-center before:rounded-[var(--lyra-radius-pill)] before:bg-[color-mix(in_srgb,var(--lyra-app-border)_64%,transparent)] hover:bg-transparent hover:border-transparent hover:shadow-none hover:transform-none focus-visible:bg-transparent focus-visible:border-transparent focus-visible:shadow-none focus-visible:transform-none active:bg-transparent active:border-transparent active:shadow-none active:transform-none hover:before:bg-[var(--lyra-effect-glass-hover)] focus-visible:before:bg-[var(--lyra-effect-glass-hover)]";
export const INFO_BLOCK_CLASS =
  "lyra-agents-info-block flex flex-col gap-[var(--lyra-space-4)] w-full min-w-0 text-[length:var(--lyra-text-size-12)]";
export const INFO_LINE_CLASS =
  "lyra-agents-info-line flex items-center gap-[var(--lyra-space-8)] flex-wrap text-[var(--lyra-text-secondary)]";
export const INFO_STRONG_CLASS =
  "lyra-agents-info-strong font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-secondary)]";
export const INFO_DIM_CLASS =
  "lyra-agents-info-dim font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-muted)]";
export const SEARCH_PATH_BUTTON_CLASS =
  "lyra-agents-search-path-button flex-[0_1_auto] min-w-0 border-0 p-0 bg-transparent text-left cursor-pointer hover:text-[var(--lyra-text-accent)] focus-visible:text-[var(--lyra-text-accent)] focus-visible:outline-[length:var(--lyra-stroke-strong)] focus-visible:outline-[var(--lyra-app-focus)] focus-visible:outline-offset-[var(--lyra-space-2)] focus-visible:rounded-[var(--lyra-radius-6)]";
export const SEARCH_ROW_CLASS =
  "lyra-agents-search-row flex flex-wrap gap-[var(--lyra-space-8)] w-full min-w-0";
export const SEARCH_TEXT_CLASS =
  "lyra-agents-search-text min-w-0 flex-[1_1_12rem] text-[var(--lyra-text-secondary)] whitespace-pre-wrap break-words";
export const TOOL_SCREENSHOT_CONTAINER_CLASS = "lyra-agents-tool-screenshot-container mt-[var(--lyra-space-4)]";
export const TOOL_SCREENSHOT_IMG_CLASS =
  "lyra-agents-tool-screenshot-img rounded-[var(--lyra-radius-8)] [&_img]:border [&_img]:border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] [&_img]:border-[var(--lyra-stroke-thin)]";
export const SHELL_COMMAND_CLASS =
  "lyra-agents-shell-command flex flex-nowrap items-start gap-[var(--lyra-space-8)] w-full min-w-0 font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-comfortable)] text-[var(--lyra-text-secondary)] [&_.lyra-syntax-source]:flex-[1_1_auto] [&_.lyra-syntax-source]:w-auto select-text";
export const SHELL_PROMPT_CLASS =
  "lyra-agents-shell-prompt flex-[0_0_auto] text-[var(--lyra-syntax-tag)] select-none";
export const SHELL_EXIT_CLASS = "lyra-agents-shell-exit m-0 text-[var(--lyra-text-muted)]";
