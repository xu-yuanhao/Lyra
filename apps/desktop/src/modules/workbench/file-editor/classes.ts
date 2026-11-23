import { NATIVE_BG_TRANSPARENT_CLASS } from "@renderer/material-classes";

export const FE_SURFACE_BASE_CLASS =
  `lyra-file-editor-surface grid h-full min-h-0 w-full min-w-0 grid-rows-[minmax(0,1fr)] bg-[var(--lyra-app-panel-bg)] ${NATIVE_BG_TRANSPARENT_CLASS}`;
export const FE_SURFACE_AI_WORKSPACE_CLASS =
  "lyra-file-editor-surface-ai-workspace bg-[linear-gradient(180deg,color-mix(in_srgb,var(--lyra-app-surface-bg)_90%,transparent)_0%,color-mix(in_srgb,var(--lyra-app-panel-bg)_100%,transparent)_100%)]";
export const FE_SURFACE_AI_MINIATURE_CLASS =
  "lyra-file-editor-surface-ai-miniature bg-[linear-gradient(180deg,color-mix(in_srgb,var(--lyra-app-surface-bg)_92%,transparent)_0%,color-mix(in_srgb,var(--lyra-app-panel-bg)_94%,transparent)_100%)] [&_.lyra-file-editor-body]:overflow-hidden [&_.lyra-file-editor-host]:h-full [&_.lyra-file-editor-diff-host]:h-full";
export const FE_HOST_CLASS =
  "lyra-file-editor-host col-start-1 row-start-1 h-full w-full min-h-0 min-w-0";
export const FE_HOST_HIDDEN_CLASS = "lyra-file-editor-host-hidden invisible";
export const FE_DIFF_HOST_CLASS =
  "lyra-file-editor-diff-host col-start-1 row-start-1 h-full w-full min-h-0 min-w-0";
export const FE_DIFF_HOST_HIDDEN_CLASS = "lyra-file-editor-diff-host-hidden hidden";
export const FE_EMPTY_STATE_CLASS = "lyra-file-editor-empty-state h-full min-h-0";
export const FE_BODY_CLASS =
  "lyra-file-editor-body relative grid min-h-0 min-w-0 overflow-hidden";
export const FE_UNIFIED_DIFF_CLASS =
  "lyra-file-editor-unified-diff col-start-1 row-start-1 flex h-full min-h-0 min-w-0 flex-col [&_.lyra-agents-diff-viewport]:min-h-0 [&_.lyra-agents-diff-viewport]:flex-1";
export const FE_AI_WORK_DELTA_CLASS =
  'lyra-file-editor-ai-work-delta inline-flex h-[var(--lyra-space-20)] min-w-0 items-center gap-[var(--lyra-space-4)] rounded-[var(--lyra-radius-pill)] border border-[var(--lyra-stroke-hairline)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_34%,transparent)] px-[var(--lyra-space-8)] font-[family-name:JetBrains_Mono,Fira_Code,Cascadia_Code,monospace] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-flat)]';
export const FE_AI_WORK_DELTA_ADDED_CLASS =
  "lyra-file-editor-ai-work-delta-added text-[var(--lyra-text-secondary)]";
export const FE_AI_WORK_DELTA_REMOVED_CLASS =
  "lyra-file-editor-ai-work-delta-removed text-[color-mix(in_srgb,var(--lyra-terminal-red)_88%,var(--lyra-text-primary)_12%)]";
