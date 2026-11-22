// Shared Tailwind class strings for file-manager list/grid surfaces.
// Kept as constants so every emission site renders identical metrics.

export const FM_LIST_GRID_CLASS =
  "lyra-file-manager-list-grid grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-0 p-[var(--lyra-space-6)] border border-[var(--lyra-app-border)] rounded-[var(--lyra-radius-10)] bg-[var(--lyra-app-surface-bg)] [--lyra-app-row-list-row-min-height:var(--lyra-app-sidebar-row-h)]";

export const FM_LARGE_GRID_CLASS =
  "lyra-file-manager-large-grid grid min-w-0 grid-cols-[repeat(auto-fill,minmax(var(--lyra-unit-132),1fr))] content-start gap-[var(--lyra-space-6)] p-[var(--lyra-space-6)] border border-[var(--lyra-app-border)] rounded-[var(--lyra-radius-10)] bg-[var(--lyra-app-surface-bg)]";

export const FM_LIST_ROW_CLASS =
  "lyra-file-manager-list-row min-h-[var(--lyra-app-sidebar-row-h)] grid-cols-[var(--lyra-control-h-28)_minmax(0,1fr)_auto_auto] gap-x-[var(--lyra-space-8)] rounded-[var(--lyra-radius-6)] border-transparent bg-transparent px-[var(--lyra-space-8)] py-0 text-[var(--lyra-text-secondary)] [content-visibility:auto] [contain-intrinsic-size:var(--lyra-app-sidebar-row-h)] enabled:hover:text-[var(--lyra-text-primary)] enabled:hover:bg-[var(--lyra-app-row-hover-bg)] data-[active=true]:text-[var(--lyra-text-primary)] data-[active=true]:bg-[var(--lyra-app-row-active-bg)] [&_.lyra-app-object-row-icon]:size-[var(--lyra-control-h-28)] [&_.lyra-app-object-row-icon]:bg-transparent [&_.lyra-app-object-row-icon]:text-current [&_.lyra-app-object-row-icon]:shadow-none [&_.lyra-app-object-row-title]:text-inherit [&_.lyra-app-object-row-title]:text-[length:var(--lyra-text-size-body)] [&_.lyra-app-object-row-title]:font-medium [&_.lyra-app-object-row-title]:leading-[var(--lyra-text-line-18)]";

export const FM_LIST_ROW_DRAFT_CLASS =
  "lyra-file-manager-list-row lyra-file-manager-list-row-draft grid min-h-[var(--lyra-app-sidebar-row-h)] grid-cols-[minmax(0,1fr)] content-start gap-x-[var(--lyra-space-8)] rounded-[var(--lyra-radius-6)] border border-transparent bg-[var(--lyra-app-row-active-bg)] px-[var(--lyra-space-8)] py-0 text-[var(--lyra-text-primary)] [content-visibility:auto] [contain-intrinsic-size:var(--lyra-app-sidebar-row-h)]";

export const FM_LIST_CELL_PRIMARY_CLASS =
  "lyra-file-manager-list-cell-primary inline-flex w-full min-w-0 items-center gap-[var(--lyra-space-8)] [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap";

export const FM_LIST_CELL_PRIMARY_DRAFT_CLASS =
  "lyra-file-manager-list-cell-primary-draft [&_.lyra-file-manager-create-input]:flex-1 [&_.lyra-file-manager-create-actions]:ml-auto";

export const FM_LIST_NAME_CLASS = "lyra-file-manager-list-name min-w-0";

export const FM_LARGE_TILE_CLASS =
  "lyra-file-manager-large-tile min-h-[var(--lyra-unit-150)] h-auto w-full grid content-start justify-items-stretch justify-center gap-[var(--lyra-space-6)] border border-transparent bg-transparent p-[var(--lyra-space-8)] text-left whitespace-normal text-[var(--lyra-text-secondary)] rounded-[var(--lyra-radius-8)] transition-[background-color,border-color,color] duration-[var(--lyra-motion-fast)] [content-visibility:auto] [contain-intrinsic-size:var(--lyra-unit-150)] enabled:hover:text-[var(--lyra-text-primary)] enabled:hover:bg-[var(--lyra-app-row-hover-bg)] data-[active=true]:text-[var(--lyra-text-primary)] data-[active=true]:bg-[var(--lyra-app-row-active-bg)]";

export const FM_LARGE_TILE_DRAFT_CLASS =
  "lyra-file-manager-large-tile lyra-file-manager-large-tile-draft grid min-h-[var(--lyra-unit-150)] content-start justify-items-stretch gap-[var(--lyra-space-6)] border border-transparent bg-[var(--lyra-app-row-active-bg)] p-[var(--lyra-space-8)] text-left whitespace-normal text-[var(--lyra-text-secondary)] rounded-[var(--lyra-radius-8)] [content-visibility:auto] [contain-intrinsic-size:var(--lyra-unit-150)]";

export const FM_LARGE_TILE_PREVIEW_CLASS =
  "lyra-file-manager-large-tile-preview grid aspect-square w-full place-items-center overflow-hidden rounded-[var(--lyra-radius-8)] bg-[var(--lyra-app-input-bg)] [&_*]:pointer-events-none [&_.lyra-file-manager-icon-shell]:size-[72%] [&_.lyra-file-manager-icon-shell]:shrink-0 [&_.lyra-file-manager-icon-shell_svg]:size-full [&_.lyra-file-manager-icon-shell_svg]:[stroke-width:1.25]";

export const FM_LARGE_TILE_IMAGE_CLASS =
  "lyra-file-manager-large-tile-image block h-full w-full rounded-[inherit] object-contain";

export const FM_LARGE_TILE_BODY_CLASS =
  "lyra-file-manager-large-tile-body grid min-w-0 gap-[var(--lyra-space-4)]";

export const FM_LARGE_TILE_TITLE_CLASS =
  "lyra-file-manager-large-tile-title text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-16)] font-semibold text-inherit";
