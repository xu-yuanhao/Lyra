export const TREE_SURFACE_CLASS =
  "lyra-agent-project-tree-surface min-w-0 min-h-0 w-full h-full overflow-hidden grid grid-cols-[var(--lyra-app-sidebar-rail-w)_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] bg-[var(--lyra-app-panel-bg)] text-[var(--lyra-text-primary)] max-[720px]:grid-cols-1 max-[720px]:grid-rows-[minmax(var(--lyra-unit-180),38vh)_minmax(0,1fr)]";
export const TREE_SIDEBAR_CLASS =
  "lyra-agent-project-tree-sidebar relative flex min-w-[var(--lyra-app-sidebar-rail-min-w)] flex-col min-h-0 overflow-hidden border-r border-[color-mix(in_srgb,var(--lyra-app-border)_48%,transparent)] border-[var(--lyra-stroke-hairline)] bg-[var(--lyra-app-material-sidebar-bg)] backdrop-blur-[var(--lyra-app-material-blur-sm)] backdrop-saturate-[var(--lyra-app-material-saturate)] max-[720px]:border-r-0 max-[720px]:border-b max-[720px]:border-[var(--lyra-divider-faint)]";
export const TREE_ROOT_ROW_CLASS =
  "lyra-agent-project-tree-root-row relative [&[data-lyra-allow-web-drag=true]]:[-webkit-user-drag:element] [&[data-lyra-allow-web-drag=true]_*]:[-webkit-user-drag:none] [&.lyra-app-object-row-title]:font-medium";
export const TREE_ROW_CLASS =
  "lyra-agent-project-tree-row relative [&[data-lyra-allow-web-drag=true]]:[-webkit-user-drag:element] [&[data-lyra-allow-web-drag=true]_*]:[-webkit-user-drag:none]";
export const TREE_LABEL_CLASS =
  "lyra-agent-project-tree-label flex items-center gap-[var(--lyra-space-6)] min-w-0 w-full";
export const TREE_ICON_SLOT_CLASS =
  "lyra-agent-project-tree-icon-slot relative inline-flex items-center justify-center w-[var(--lyra-app-sidebar-icon-size)] h-[var(--lyra-app-sidebar-icon-size)] flex-[0_0_var(--lyra-app-sidebar-icon-size)] [&_.lyra-file-manager-icon-shell]:w-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-file-manager-icon-shell]:h-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-file-manager-icon-shell]:flex-basis-[var(--lyra-app-sidebar-icon-size)]";
export const TREE_ENTRY_ICON_CLASS =
  "lyra-agent-project-tree-entry-icon absolute inset-0 inline-flex items-center justify-center transition-[opacity_var(--lyra-motion-fast)] opacity-100";
export const TREE_TWIST_CLASS =
  "lyra-agent-project-tree-twist absolute inset-0 inline-flex items-center justify-center transition-[opacity_var(--lyra-motion-fast)] text-[var(--lyra-text-muted)] opacity-0";
export const TREE_NAME_CLASS =
  "lyra-agent-project-tree-name min-w-0 overflow-hidden text-clip whitespace-nowrap";
export const TREE_SEARCH_HIT_CLASS =
  "lyra-agent-project-tree-search-hit grid-cols-[var(--lyra-control-h-28)_minmax(0,1fr)_auto] [&_.lyra-app-object-row-icon]:w-[var(--lyra-control-h-28)] [&_.lyra-app-object-row-icon]:justify-end";
export const TREE_SEARCH_LINE_CLASS =
  "lyra-agent-project-tree-search-line text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] tabular-nums leading-[var(--lyra-text-line-18)]";
export const TREE_LIST_CLASS =
  "lyra-agent-project-tree-list flex-1 min-h-0 overflow-x-hidden overflow-y-scroll p-[var(--lyra-space-2)_0_var(--lyra-space-8)]";
export const TREE_VIRTUAL_CLASS = "lyra-agent-project-tree-virtual relative w-full";
export const TREE_VIRTUAL_WINDOW_CLASS =
  "lyra-agent-project-tree-virtual-window absolute left-0 right-0";
export const TREE_NODE_CLASS =
  "lyra-agent-project-tree-node h-[var(--lyra-app-sidebar-row-h)] min-h-[var(--lyra-app-sidebar-row-h)] max-h-[var(--lyra-app-sidebar-row-h)] overflow-hidden [contain:layout_paint]";
export const TREE_INLINE_STATE_CLASS =
  "lyra-agent-project-tree-inline-state box-border w-full h-full min-h-0 flex-none flex flex-row items-center gap-[var(--lyra-space-8)] m-0 p-0 border-0 rounded-none text-[var(--lyra-text-muted)] [--lyra-app-state-logo-size:var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-icon]:w-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-icon]:h-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-icon]:m-0 [&_.lyra-app-state-icon]:flex-[0_0_var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-logo]:w-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-logo]:h-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-logo]:m-0 [&_.lyra-app-state-logo]:flex-[0_0_var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-status-message-icon]:w-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-status-message-icon]:h-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-status-message-icon]:m-0 [&_.lyra-app-status-message-icon]:flex-[0_0_var(--lyra-app-sidebar-icon-size)] [&_.lyra-app-state-copy]:min-w-0 [&_.lyra-app-status-message-content]:min-w-0 [&_.lyra-app-state-title]:overflow-hidden [&_.lyra-app-state-title]:text-[var(--lyra-text-muted)] [&_.lyra-app-state-title]:text-[length:var(--lyra-text-size-body)] [&_.lyra-app-state-title]:font-medium [&_.lyra-app-state-title]:leading-[var(--lyra-text-line-18)] [&_.lyra-app-state-title]:text-clip [&_.lyra-app-state-title]:whitespace-nowrap [&.lyra-app-status-message]:items-center [&.lyra-app-status-message]:text-[length:var(--lyra-text-size-body)] [&.lyra-app-status-message]:leading-[var(--lyra-text-line-18)]";
export const TREE_ERROR_CLASS =
  "lyra-agent-project-tree-error m-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-12)]";
export const TREE_EDITOR_CLASS =
  "lyra-agent-project-tree-editor min-w-0 min-h-0 overflow-hidden flex flex-col bg-[var(--lyra-app-panel-bg)] [&_.lyra-file-editor-surface]:flex-[1_1_0] [&_.lyra-file-editor-surface]:w-full [&_.lyra-file-editor-surface]:min-h-0 [&_.lyra-file-editor-surface]:h-auto [&_.lyra-image-viewer-surface]:flex-[1_1_0] [&_.lyra-image-viewer-surface]:w-full [&_.lyra-image-viewer-surface]:min-h-0 [&_.lyra-image-viewer-surface]:h-auto [&_[data-lyra-component=lyra.office]]:flex-[1_1_0] [&_[data-lyra-component=lyra.office]]:w-full [&_[data-lyra-component=lyra.office]]:min-h-0 [&_[data-lyra-component=lyra.office]]:h-auto [&_[data-lyra-component=lyra.sqlite]]:flex-[1_1_0] [&_[data-lyra-component=lyra.sqlite]]:w-full [&_[data-lyra-component=lyra.sqlite]]:min-h-0 [&_[data-lyra-component=lyra.sqlite]]:h-auto";
export const TREE_EDITOR_TABS_CLASS =
  "lyra-agent-project-tree-editor-tabs flex-[0_0_auto] flex items-stretch min-w-0 overflow-x-auto overflow-y-hidden h-[var(--lyra-tab-control-h)] border-b border-[var(--lyra-divider-faint)] border-[var(--lyra-stroke-hairline)] bg-[color-mix(in_srgb,var(--lyra-app-surface-bg)_88%,var(--lyra-app-panel-bg)_12%)]";
export const TREE_EDITOR_TAB_CLASS =
  "lyra-agent-project-tree-editor-tab flex-[0_1_auto] min-w-[var(--lyra-unit-72)] max-w-[var(--lyra-unit-180)] h-full";
export const TREE_EDITOR_TAB_MAIN_CLASS =
  "lyra-agent-project-tree-editor-tab-main min-w-0 justify-start [&.lyra-agent-project-tree-editor-tab-preview_&]:italic";
export const TREE_EDITOR_SURFACE_HOST_CLASS =
  "lyra-agent-project-tree-editor-surface-host flex-[1_1_0] min-w-0 min-h-0 flex flex-col";
export const TREE_EMPTY_CLASS = "lyra-agent-project-tree-empty flex-[1_1_0] min-h-0";
export const TREE_TWIST_HOVER_RULES =
  "[&:hover:not(:disabled)_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-entry-icon]:opacity-0 [&:focus-visible_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-entry-icon]:opacity-0 [&:hover:not(:disabled)_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-twist]:opacity-100 [&:focus-visible_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-twist]:opacity-100";
export const TREE_EDITOR_TAB_PREVIEW_CLASS = "lyra-agent-project-tree-editor-tab-preview";
