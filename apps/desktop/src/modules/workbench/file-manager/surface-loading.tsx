import {
  FM_DISK_CARD_CLASS,
  FM_DISK_FOOTER_CLASS,
  FM_DISK_META_CLASS,
  FM_DISK_METER_CLASS,
  FM_DISK_SUMMARY_BODY_CLASS,
  FM_DISK_SUMMARY_CLASS,
  FM_DISK_SUMMARY_ICON_CLASS,
  FM_HOME_CARD_CLASS,
  FM_HOME_GRID_CLASS,
  FM_HOST_CARD_CLASS,
  FM_HOST_COPY_CLASS,
  FM_HOST_FACTS_CLASS,
  FM_HOST_IDENTITY_CLASS,
  FM_LARGE_GRID_CLASS,
  FM_LARGE_TILE_BODY_CLASS,
  FM_LARGE_TILE_CLASS,
  FM_LARGE_TILE_PREVIEW_CLASS,
  FM_LARGE_TILE_TITLE_CLASS,
  FM_LIST_CELL_PRIMARY_CLASS,
  FM_LIST_GRID_CLASS,
  FM_LIST_SHELL_CLASS,
  FM_PAGE_CLASS,
  FM_SECTION_HEADER_CLASS,
  APP_CONTENT_COLUMN_CLASS,
  APP_CONTENT_COLUMN_WIDE_CLASS,
  APP_SECTION_CLASS,
  APP_SECTION_TITLE_CLASS,
  APP_GROUP_CLASS,
} from "./surface-classes";
import type {
  FileManagerSkeletonSlots,
  FileManagerSurfaceRenderModel
} from "./surface-model";

const SKELETON_HOST_ICON = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] size-[var(--lyra-control-h-40)] rounded-[var(--lyra-radius-8)]";
const SKELETON_HOST_NAME = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[min(42%,var(--lyra-unit-180))] h-[var(--lyra-text-line-22)]";
const SKELETON_HOST_OS = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[min(58%,var(--lyra-unit-240))] h-[var(--lyra-text-line-16)]";
const SKELETON_HOST_FACT = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-full h-[var(--lyra-control-h-28)]";
const SKELETON_ICON_16 = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] size-[var(--lyra-icon-size-16)]";
const SKELETON_LINE_16 = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[65%] h-[var(--lyra-text-line-16)]";
const SKELETON_LINE_14 = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[82%] h-[var(--lyra-text-line-14)]";
const SKELETON_DISK_ICON = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] size-[var(--lyra-control-h-28)] rounded-[var(--lyra-radius-8)]";
const SKELETON_DISK_METER = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-full h-[var(--lyra-space-4)] rounded-[var(--lyra-radius-pill)]";
const SKELETON_DISK_KIND = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[var(--lyra-space-56)] h-[var(--lyra-text-line-16)] rounded-[var(--lyra-radius-pill)]";
const SKELETON_LARGE_PREVIEW = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-full h-full rounded-[var(--lyra-radius-8)]";
const SKELETON_LARGE_TITLE = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[70%] h-[var(--lyra-text-line-16)]";
const SKELETON_LARGE_SUBTITLE = "lyra-skeleton-block block rounded-[var(--lyra-radius-6)] bg-[var(--lyra-app-muted-bg)] w-[52%] h-[var(--lyra-text-line-16)]";

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
      <div className={`${APP_CONTENT_COLUMN_CLASS} lyra-file-manager-skeleton-home`} aria-label="file-manager-loading-skeleton">
        <article className={`${FM_HOST_CARD_CLASS} lyra-file-manager-host-card-skeleton pointer-events-none`}>
          <div className={FM_HOST_IDENTITY_CLASS}>
            <span className={SKELETON_HOST_ICON} />
            <div className={FM_HOST_COPY_CLASS}>
              <span className={SKELETON_HOST_NAME} />
              <span className={SKELETON_HOST_OS} />
            </div>
          </div>
          <div className={FM_HOST_FACTS_CLASS}>
            <span className={SKELETON_HOST_FACT} />
            <span className={SKELETON_HOST_FACT} />
          </div>
        </article>

        <section className={`${APP_SECTION_CLASS} lyra-file-manager-skeleton-home-section`}>
          <header className={`${APP_SECTION_TITLE_CLASS} lyra-file-manager-skeleton-home-header ${FM_SECTION_HEADER_CLASS}`}>
            <span className={SKELETON_ICON_16} />
            <span className={SKELETON_LINE_16} />
          </header>
          <div className={`${APP_GROUP_CLASS} lyra-app-row-list ${FM_HOME_GRID_CLASS}`}>
            {slots.deviceSlots.map((cardId) => (
              <article
                key={`devices-card-${cardId}`}
                className={`${FM_HOME_CARD_CLASS} lyra-file-manager-home-card-skeleton ${FM_DISK_CARD_CLASS} lyra-file-manager-disk-card-skeleton pointer-events-none`}
              >
                <div className={FM_DISK_SUMMARY_CLASS}>
                  <div className={FM_DISK_SUMMARY_ICON_CLASS}>
                    <span className={SKELETON_DISK_ICON} />
                  </div>
                  <div className={FM_DISK_SUMMARY_BODY_CLASS}>
                    <span className={SKELETON_LINE_16} />
                    <span className={SKELETON_LINE_14} />
                  </div>
                </div>
                <div className={FM_DISK_METER_CLASS}>
                  <span className={SKELETON_DISK_METER} />
                </div>
                <div className={FM_DISK_META_CLASS}>
                  <span className={SKELETON_LINE_14} />
                  <span className={`${SKELETON_LINE_14} w-[58%]`} />
                </div>
                <div className={FM_DISK_FOOTER_CLASS}>
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
      <div className={`${APP_CONTENT_COLUMN_CLASS} ${APP_CONTENT_COLUMN_WIDE_CLASS} lyra-file-manager-list-shell ${FM_PAGE_CLASS} ${FM_LIST_SHELL_CLASS}`} aria-label="file-manager-loading-skeleton">
        <div className={`${APP_GROUP_CLASS} ${FM_LARGE_GRID_CLASS}`}>
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
    <div className={`${APP_CONTENT_COLUMN_CLASS} ${APP_CONTENT_COLUMN_WIDE_CLASS} lyra-file-manager-list-shell ${FM_PAGE_CLASS} ${FM_LIST_SHELL_CLASS}`} aria-label="file-manager-loading-skeleton">
      <div className={`${APP_GROUP_CLASS} lyra-app-row-list ${FM_LIST_GRID_CLASS} lyra-file-manager-list-grid-skeleton pointer-events-none`}>
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
