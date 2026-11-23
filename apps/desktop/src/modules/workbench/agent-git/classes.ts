export const GIT_SURFACE_CLASS =
  "lyra-agent-git-surface min-w-0 min-h-0 w-full h-full grid grid-cols-[var(--lyra-app-sidebar-rail-w)_minmax(0,1fr)] bg-[var(--lyra-app-panel-bg)] text-[var(--lyra-text-primary)] max-[720px]:grid-cols-1 max-[720px]:grid-rows-[minmax(var(--lyra-unit-180),38vh)_minmax(0,1fr)]";
export const GIT_SIDEBAR_CLASS =
  "lyra-agent-git-sidebar relative min-w-[var(--lyra-app-sidebar-rail-min-w)] min-h-0 flex flex-col border-r border-[color-mix(in_srgb,var(--lyra-app-border)_48%,transparent)] border-[var(--lyra-stroke-hairline)] bg-[var(--lyra-app-material-sidebar-bg)] backdrop-blur-[var(--lyra-app-material-blur-sm)] backdrop-saturate-[var(--lyra-app-material-saturate)] max-[720px]:border-r-0 max-[720px]:border-b max-[720px]:border-[var(--lyra-divider-faint)]";
export const GIT_EMPTY_SIDEBAR_CLASS = "lyra-agent-git-empty-sidebar flex-[1_1_auto] min-h-0";
export const GIT_LIST_CLASS =
  "lyra-agent-git-list flex-1 min-h-0 overflow-x-hidden overflow-y-scroll p-[var(--lyra-space-2)_0_var(--lyra-space-8)]";
export const GIT_VIRTUAL_CLASS = "lyra-agent-git-virtual relative w-full";
export const GIT_VIRTUAL_WINDOW_CLASS = "lyra-agent-git-virtual-window absolute left-0 right-0 [&_.lyra-agent-git-row]:h-[var(--lyra-app-sidebar-row-h)] [&_.lyra-agent-git-row]:min-h-[var(--lyra-app-sidebar-row-h)] [&_.lyra-agent-git-row]:max-h-[var(--lyra-app-sidebar-row-h)] [&_.lyra-agent-git-row]:overflow-hidden";
export const GIT_ICON_BUTTON_CLASS = "lyra-agent-git-icon-button text-[var(--lyra-text-muted)]";
const GIT_STATUS_BASE =
  "lyra-agent-git-status inline-flex items-center justify-center w-[var(--lyra-app-sidebar-icon-size)] h-[var(--lyra-app-sidebar-icon-size)] flex-[0_0_var(--lyra-app-sidebar-icon-size)] rounded-none text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] font-bold";
const GIT_STATUS_GREEN = "text-[color-mix(in_srgb,var(--lyra-terminal-green)_85%,var(--lyra-text-primary)_15%)]";
const GIT_STATUS_YELLOW = "text-[color-mix(in_srgb,var(--lyra-terminal-yellow)_82%,var(--lyra-text-primary)_18%)]";
const GIT_STATUS_RED = "text-[color-mix(in_srgb,var(--lyra-terminal-red)_86%,var(--lyra-text-primary)_14%)]";
export const gitStatusClass = (status: string): string => {
  const hook = `lyra-agent-git-status-${status}`;
  if (status === "added" || status === "untracked") return `${GIT_STATUS_BASE} ${GIT_STATUS_GREEN} ${hook}`;
  if (["modified", "renamed", "copied", "typeChanged"].includes(status)) return `${GIT_STATUS_BASE} ${GIT_STATUS_YELLOW} ${hook}`;
  if (status === "deleted" || status === "conflicted") return `${GIT_STATUS_BASE} ${GIT_STATUS_RED} ${hook}`;
  return `${GIT_STATUS_BASE} ${hook}`;
};
export const GIT_NAME_CLASS = "lyra-agent-git-name font-normal";
export const GIT_DIR_CLASS =
  "lyra-agent-git-dir min-w-0 overflow-hidden text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] font-normal text-ellipsis whitespace-nowrap";
export const GIT_MAIN_CLASS =
  "lyra-agent-git-main min-w-0 min-h-0 flex flex-col bg-[var(--lyra-app-panel-bg)]";
export const GIT_INLINE_STATE_CLASS =
  "lyra-agent-git-inline-state h-auto flex-none p-[var(--lyra-space-8)_var(--lyra-space-12)]";
export const GIT_DIFF_CLASS =
  "lyra-agent-git-diff min-w-0 min-h-0 h-full flex flex-col [&_.lyra-agents-diff-viewport]:flex-1 [&_.lyra-agents-diff-viewport]:min-h-0";
export const DIFF_VIEWPORT_FILL_CLASS = "lyra-agents-diff-viewport-fill h-full max-h-none";
export const GIT_ROW_CLASS =
  "lyra-agent-git-row [&_.lyra-app-object-row-description]:hidden";
export const GIT_ROW_SELECTED_CLASS = "lyra-agent-git-row-selected before:content-none";
