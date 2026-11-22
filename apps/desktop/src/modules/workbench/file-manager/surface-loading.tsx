import {
  FM_LARGE_GRID_CLASS,
  FM_LARGE_TILE_BODY_CLASS,
  FM_LARGE_TILE_CLASS,
  FM_LARGE_TILE_PREVIEW_CLASS,
  FM_LARGE_TILE_TITLE_CLASS,
  FM_LIST_CELL_PRIMARY_CLASS,
  FM_LIST_GRID_CLASS
} from "./surface-classes";
import type {
  FileManagerSkeletonSlots,
  FileManagerSurfaceRenderModel
} from "./surface-model";

const SKELETON_HOST_ICON = "lyra-skeleton-block size-[var(--lyra-control-h-40)] rounded-[var(--lyra-radius-8)]";
const SKELETON_HOST_NAME = "lyra-skeleton-block w-[min(42%,var(--lyra-unit-180))] h-[var(--lyra-text-line-22)]";
const SKELETON_HOST_OS = "lyra-skeleton-block w-[min(58%,var(--lyra-unit-240))] h-[var(--lyra-text-line-16)]";
const SKELETON_HOST_FACT = "lyra-skeleton-block w-full h-[var(--lyra-control-h-28)]";
const SKELETON_ICON_16 = "lyra-skeleton-block size-[var(--lyra-icon-size-16)]";
const SKELETON_LINE_16 = "lyra-skeleton-block w-[65%] h-[var(--lyra-text-line-16)]";
const SKELETON_LINE_14 = "lyra-skeleton-block w-[82%] h-[var(--lyra-text-line-14)]";
const SKELETON_DISK_ICON = "lyra-skeleton-block size-[var(--lyra-control-h-28)] rounded-[var(--lyra-radius-8)]";
const SKELETON_DISK_METER = "lyra-skeleton-block w-full h-[var(--lyra-space-4)] rounded-[var(--lyra-radius-pill)]";
const SKELETON_DISK_KIND = "lyra-skeleton-block w-[var(--lyra-space-56)] h-[var(--lyra-text-line-16)] rounded-[var(--lyra-radius-pill)]";
const SKELETON_LARGE_PREVIEW = "lyra-skeleton-block w-full h-full rounded-[var(--lyra-radius-8)]";
const SKELETON_LARGE_TITLE = "lyra-skeleton-block w-[70%] h-[var(--lyra-text-line-16)]";
const SKELETON_LARGE_SUBTITLE = "lyra-skeleton-block w-[52%] h-[var(--lyra-text-line-16)]";

export const FileManagerLoadingSkeleton = ({
  viewKind,
  presentationMode,
  slots
}: {
  readonly viewKind: FileManagerSurfaceRenderModel["viewKind"];
  readonly presentationMode: FileManagerSurfaceRenderModel["presentationMode"];
  readonly slots: FileManagerSkeletonSlots;
}) => {
  if (viewKind === "home") {
    return (
      <div className="lyra-app-content-column lyra-file-manager-skeleton-home" aria-label="file-manager-loading-skeleton">
        <article className="lyra-file-manager-host-card lyra-file-manager-host-card-skeleton pointer-events-none">
          <div className="lyra-file-manager-host-identity">
            <span className={SKELETON_HOST_ICON} />
            <div className="lyra-file-manager-host-copy">
              <span className={SKELETON_HOST_NAME} />
              <span className={SKELETON_HOST_OS} />
            </div>
          </div>
          <div className="lyra-file-manager-host-facts">
            <span className={SKELETON_HOST_FACT} />
            <span className={SKELETON_HOST_FACT} />
          </div>
        </article>

        <section className="lyra-app-section lyra-file-manager-skeleton-home-section">
          <header className="lyra-app-section-title lyra-file-manager-skeleton-home-header">
            <span className={SKELETON_ICON_16} />
            <span className={SKELETON_LINE_16} />
          </header>
          <div className="lyra-app-group lyra-app-row-list lyra-file-manager-home-grid">
            {slots.deviceSlots.map((cardId) => (
              <article
                key={`devices-card-${cardId}`}
                className="lyra-file-manager-home-card lyra-file-manager-home-card-skeleton lyra-file-manager-disk-card lyra-file-manager-disk-card-skeleton pointer-events-none"
              >
                <div className="lyra-file-manager-disk-summary">
                  <div className="lyra-file-manager-disk-summary-icon">
                    <span className={SKELETON_DISK_ICON} />
                  </div>
                  <div className="lyra-file-manager-disk-summary-body">
                    <span className={SKELETON_LINE_16} />
                    <span className={SKELETON_LINE_14} />
                  </div>
                </div>
                <div className="lyra-file-manager-disk-meter">
                  <span className={SKELETON_DISK_METER} />
                </div>
                <div className="lyra-file-manager-disk-meta">
                  <span className={SKELETON_LINE_14} />
                  <span className={`${SKELETON_LINE_14} w-[58%]`} />
                </div>
                <div className="lyra-file-manager-disk-footer">
                  <span className={SKELETON_DISK_KIND} />
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (presentationMode === "large") {
    const tiles = viewKind === "trash" ? slots.trashLargeSlots : slots.directoryLargeSlots;
    return (
      <div className="lyra-app-content-column lyra-app-content-column-wide lyra-file-manager-list-shell" aria-label="file-manager-loading-skeleton">
        <div className={`lyra-app-group ${FM_LARGE_GRID_CLASS}`}>
          {tiles.map((tileId) => (
            <article
              key={`fm-large-skeleton-tile-${tileId}`}
              className={`${FM_LARGE_TILE_CLASS} lyra-file-manager-large-tile-skeleton pointer-events-none`}
            >
              <div className={FM_LARGE_TILE_PREVIEW_CLASS}>
                <span className={SKELETON_LARGE_PREVIEW} />
              </div>
              <div className={FM_LARGE_TILE_BODY_CLASS}>
                <span className={SKELETON_LARGE_TITLE} />
                {viewKind === "trash" ? (
                  <span className={SKELETON_LARGE_SUBTITLE} />
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    );
  }

  const rows = viewKind === "trash" ? slots.trashListSlots : slots.directoryListSlots;

  return (
    <div className="lyra-app-content-column lyra-app-content-column-wide lyra-file-manager-list-shell" aria-label="file-manager-loading-skeleton">
      <div className={`lyra-app-group lyra-app-row-list ${FM_LIST_GRID_CLASS} lyra-file-manager-list-grid-skeleton pointer-events-none`}>
        {rows.map((rowId) => (
          <article
            key={`fm-list-skeleton-row-${rowId}`}
            className="lyra-file-manager-list-row lyra-file-manager-list-row-skeleton text-transparent"
          >
            <div className={FM_LIST_CELL_PRIMARY_CLASS}>
              <span className={SKELETON_ICON_16} />
              <span className={SKELETON_LINE_16} />
            </div>
            {viewKind === "trash" ? (
              <span className={`${SKELETON_LINE_14} mt-[var(--lyra-space-4)] ml-[var(--lyra-space-24)]`} />
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
};
