// Shared Tailwind class strings for file-manager list/grid surfaces.
// Kept as constants so every emission site renders identical metrics.

export const FM_SURFACE_CLASS =
  "lyra-file-manager-surface grid h-full w-full min-h-0 min-w-0 grid-rows-[minmax(0,1fr)_auto] bg-[var(--lyra-app-material-panel-bg)] [backdrop-filter:var(--lyra-app-material-blur-md)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-md)_var(--lyra-app-material-saturate)]";

export const FM_LAYOUT_CLASS =
  "lyra-file-manager-layout grid min-h-0 min-w-0 grid-cols-[var(--lyra-app-sidebar-rail-w)_minmax(0,1fr)]";

export const FM_CONTENT_CLASS =
  "lyra-file-manager-content relative grid min-h-0 min-w-0 overflow-hidden bg-transparent [--lyra-app-content-padding-block-start:var(--lyra-space-28)] [--lyra-app-content-padding-block-end:var(--lyra-page-pad-block-end)] [--lyra-app-content-padding-inline:var(--lyra-page-pad-inline)] [--lyra-app-content-gap:var(--lyra-space-18)]";

export const FM_CONTENT_SCROLL_CLASS =
  "lyra-file-manager-content-scroll col-start-1 row-start-1 min-h-0 min-w-0 overflow-auto";

export const FM_PAGE_CLASS =
  "w-[min(100%,var(--lyra-unit-10000))] max-w-[max(calc(var(--lyra-unit-720)_+_var(--lyra-unit-280)),calc(100%_-_var(--lyra-space-64)_*_2))] mx-auto p-[var(--lyra-space-20)_var(--lyra-space-24)_var(--lyra-space-28)]";

export const FM_PAGE_GRID_CLASS = "min-h-full min-w-0 grid content-start gap-[var(--lyra-space-18)]";
export const FM_LIST_SHELL_CLASS = "min-h-full min-w-0 grid";
export const FM_SECTION_GAP_CLASS = "grid min-w-0 gap-[var(--lyra-space-10)]";

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

export const FM_SECTION_HEADER_CLASS =
  "inline-flex min-w-0 items-center gap-[var(--lyra-space-8)] px-[var(--lyra-space-4)] text-[var(--lyra-text-secondary)]";

export const FM_SECTION_TITLE_CLASS =
  "m-0 text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-body)] font-semibold leading-[var(--lyra-text-line-18)]";

export const FM_HOME_GRID_CLASS =
  "lyra-file-manager-home-grid grid min-w-0 grid-cols-[minmax(0,1fr)] gap-[var(--lyra-space-2)]";

export const FM_FAVORITES_LIST_CLASS =
  "lyra-file-manager-favorites-list grid min-w-0 gap-[var(--lyra-space-2)] p-[var(--lyra-space-6)] border border-[var(--lyra-app-border)] rounded-[var(--lyra-radius-10)] bg-[var(--lyra-app-surface-bg)]";

export const FM_HOST_CARD_CLASS =
  "lyra-file-manager-host-card grid min-w-0 gap-[var(--lyra-space-12)] border border-[var(--lyra-app-border)] bg-[var(--lyra-app-surface-bg)] px-[var(--lyra-space-12)] py-[var(--lyra-space-14)] rounded-[var(--lyra-radius-10)]";

export const FM_HOST_IDENTITY_CLASS =
  "lyra-file-manager-host-identity grid min-w-0 grid-cols-[var(--lyra-control-h-40)_minmax(0,1fr)] items-center gap-[var(--lyra-space-12)] [&_.lyra-file-manager-icon-shell]:size-[var(--lyra-control-h-40)] [&_.lyra-file-manager-icon-shell_svg]:size-[var(--lyra-icon-size-20)]";

export const FM_HOST_COPY_CLASS = "lyra-file-manager-host-copy grid min-w-0 gap-[var(--lyra-space-2)]";

export const FM_HOST_NAME_CLASS =
  "lyra-file-manager-host-name m-0 overflow-hidden text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-16)] font-semibold leading-[var(--lyra-text-line-22)] text-ellipsis whitespace-nowrap";

export const FM_HOST_OS_CLASS =
  "lyra-file-manager-host-os m-0 overflow-hidden text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-16)] text-ellipsis whitespace-nowrap";

export const FM_HOST_FACTS_CLASS = "lyra-file-manager-host-facts m-0 grid gap-[var(--lyra-space-10)]";

export const FM_HOST_FACT_CLASS =
  "lyra-file-manager-host-fact grid min-w-0 gap-[var(--lyra-space-4)] [&_dt]:m-0 [&_dt]:text-[var(--lyra-text-secondary)] [&_dt]:text-[length:var(--lyra-text-size-caption)] [&_dt]:font-semibold [&_dt]:leading-[var(--lyra-text-line-16)] [&_dd]:m-0 [&_dd]:text-[var(--lyra-text-primary)] [&_dd]:text-[length:var(--lyra-text-size-body)] [&_dd]:leading-[var(--lyra-text-line-18)]";

const FM_CARD_ROW_BASE =
  "min-h-[var(--lyra-control-h-40)] border-transparent bg-transparent px-[var(--lyra-space-10)] py-[var(--lyra-space-8)] [content-visibility:auto] [contain-intrinsic-size:var(--lyra-control-h-40)] enabled:hover:bg-[var(--lyra-app-row-hover-bg)] [&_.lyra-app-object-row-title]:text-[var(--lyra-text-primary)] [&_.lyra-app-object-row-title]:text-[length:var(--lyra-text-size-body)] [&_.lyra-app-object-row-title]:font-semibold [&_.lyra-app-object-row-title]:leading-[var(--lyra-text-line-18)] [&_.lyra-app-object-row-description]:text-[var(--lyra-text-muted)]";

export const FM_HOME_CARD_CLASS = `lyra-file-manager-home-card ${FM_CARD_ROW_BASE}`;
export const FM_FAVORITE_ROW_CLASS = `lyra-file-manager-favorite-row ${FM_CARD_ROW_BASE}`;

export const FM_DISK_CARD_CLASS =
  "lyra-file-manager-disk-card min-h-[calc(var(--lyra-control-h-52)_+_var(--lyra-space-8))] items-center [&_.lyra-app-object-row-description]:whitespace-normal [&_.lyra-app-object-row-icon]:size-[var(--lyra-control-h-28)]";

export const FM_DEVICE_CARD_CLASS = "lyra-file-manager-device-card cursor-default";

export const FM_DISK_DESCRIPTION_CLASS = "lyra-file-manager-disk-description grid min-w-0 gap-[var(--lyra-space-4)]";
export const FM_DISK_SUMMARY_CLASS =
  "lyra-file-manager-disk-summary grid w-full min-w-0 grid-cols-[var(--lyra-control-h-40)_minmax(0,1fr)] items-start gap-[var(--lyra-space-12)]";
export const FM_DISK_SUMMARY_ICON_CLASS =
  "lyra-file-manager-disk-summary-icon grid size-[var(--lyra-control-h-40)] place-items-center";
export const FM_DISK_SUMMARY_BODY_CLASS = "lyra-file-manager-disk-summary-body grid min-w-0 gap-[var(--lyra-space-4)]";

export const FM_DISK_PATH_CLASS =
  "lyra-file-manager-disk-path min-w-0 overflow-hidden text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-16)] text-ellipsis whitespace-nowrap";

export const FM_DISK_METER_CLASS =
  "lyra-file-manager-disk-meter block h-[var(--lyra-space-8)] w-full overflow-hidden rounded-[var(--lyra-radius-pill)] bg-[color-mix(in_srgb,var(--lyra-text-primary)_18%,var(--lyra-app-input-bg))]";

export const FM_DISK_METER_FILL_CLASS = "lyra-file-manager-disk-meter-fill block h-full rounded-[inherit]";

export const FM_DISK_METER_TONE_CLASS: Record<string, string> = {
  healthy: "bg-[var(--lyra-app-primary-button)]",
  warning: "bg-[var(--lyra-status-warning)]",
  danger: "bg-[var(--lyra-status-error)]"
};

export const FM_DISK_META_CLASS =
  "lyra-file-manager-disk-meta flex min-w-0 flex-wrap gap-x-[var(--lyra-space-8)] gap-y-[var(--lyra-space-4)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-16)]";

export const FM_DISK_FOOTER_CLASS = "lyra-file-manager-disk-footer flex min-w-0 items-center gap-[var(--lyra-space-8)]";

export const FM_DISK_KIND_CLASS =
  "lyra-file-manager-disk-kind ml-auto shrink-0 rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-app-muted-bg)] px-[var(--lyra-space-6)] py-[var(--lyra-space-2)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-caption)] font-semibold leading-[var(--lyra-text-line-14)]";
