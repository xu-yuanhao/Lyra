import type { ReactNode } from "react";

import { AppBadge, AppEmptyState, AppObjectRow } from "@renderer/ui/components";
import { MessageCitationText } from "../ai-panel/lyra-agents/features/chat/MessageCitationText";

import {
  renderFileManagerAppIcon,
  renderFileManagerDiskIcon,
  renderFileManagerFavoriteIcon,
  renderFileManagerSectionIcon
} from "./icon-registry";
import {
  resolveFileManagerDiskKindLabel
} from "./surface-model";
import {
  FM_DISK_CARD_CLASS,
  FM_DISK_DESCRIPTION_CLASS,
  FM_DISK_KIND_CLASS,
  FM_DISK_META_CLASS,
  FM_DISK_METER_CLASS,
  FM_DISK_METER_FILL_CLASS,
  FM_DISK_METER_TONE_CLASS,
  FM_DISK_PATH_CLASS,
  FM_EMPTY_STATE_CLASS,
  FM_DEVICE_CARD_CLASS,
  FM_FAVORITE_ROW_CLASS,
  FM_FAVORITES_LIST_CLASS,
  FM_HOME_CARD_CLASS,
  FM_HOME_GRID_CLASS,
  FM_PAGE_CLASS,
  FM_PAGE_GRID_CLASS,
  FM_SECTION_GAP_CLASS,
  FM_HOST_CARD_CLASS,
  FM_HOST_COPY_CLASS,
  FM_HOST_FACTS_CLASS,
  FM_HOST_FACT_CLASS,
  FM_HOST_IDENTITY_CLASS,
  FM_HOST_NAME_CLASS,
  FM_HOST_OS_CLASS,
  FM_SECTION_HEADER_CLASS,
  FM_SECTION_TITLE_CLASS,
  APP_CONTENT_COLUMN_CLASS,
  APP_SECTION_CLASS,
  APP_SECTION_TITLE_CLASS,
  APP_GROUP_CLASS,
} from "./surface-classes";
import { preventContextMenuDefaults } from "./surface-view-events";
import type { FileManagerSurfaceChromeProps } from "./surface-view-types";

const HomeSection = ({
  title,
  children,
  section
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly section: "devices";
}) => (
  <section className={`${APP_SECTION_CLASS} lyra-file-manager-home-section ${FM_SECTION_GAP_CLASS}`}>
    <header className={`${APP_SECTION_TITLE_CLASS} lyra-file-manager-home-section-header ${FM_SECTION_HEADER_CLASS}`}>
      {renderFileManagerSectionIcon(section)}
      <h3 className={FM_SECTION_TITLE_CLASS}>{title}</h3>
    </header>
    <div className={`${APP_GROUP_CLASS} lyra-app-row-list ${FM_HOME_GRID_CLASS}`}>{children}</div>
  </section>
);

export const FileManagerHomeContent = ({
  renderModel,
  labels,
  actions
}: FileManagerSurfaceChromeProps) => {
  if (renderModel.body.kind !== "home") {
    return null;
  }
  const home = renderModel.body.home;
  const host = home.host;
  const hostOs = host === null
    ? ""
    : [host.osName, host.architecture]
      .filter((value) => typeof value === "string" && value.length > 0)
      .join(" · ");
  const hasDevices = home.disks.length > 0 || home.devices.length > 0;

  return (
    <div className={`${APP_CONTENT_COLUMN_CLASS} lyra-file-manager-home ${FM_PAGE_CLASS} ${FM_PAGE_GRID_CLASS}`}>
      {host === null ? null : (
        <article className={FM_HOST_CARD_CLASS}>
          <div className={FM_HOST_IDENTITY_CLASS}>
            {renderFileManagerAppIcon("file-manager-home")}
            <div className={FM_HOST_COPY_CLASS}>
              <h2 className={FM_HOST_NAME_CLASS}>{host.name}</h2>
              {hostOs.length === 0 ? null : (
                <p className={FM_HOST_OS_CLASS}>{hostOs}</p>
              )}
            </div>
          </div>
          <dl className={FM_HOST_FACTS_CLASS}>
            {typeof host.cpuBrand === "string" && host.cpuBrand.length > 0 ? (
              <div className={FM_HOST_FACT_CLASS}>
                <dt>{labels.hostProcessor}</dt>
                <dd>{host.cpuBrand}</dd>
              </div>
            ) : null}
            <div className={FM_HOST_FACT_CLASS}>
              <dt>{labels.hostMemory}</dt>
              <dd>
                <span className={FM_DISK_DESCRIPTION_CLASS}>
                  <span className={FM_DISK_METER_CLASS} aria-hidden="true">
                    <span
                      className={`${FM_DISK_METER_FILL_CLASS} ${FM_DISK_METER_TONE_CLASS[host.memoryUsageTone] ?? FM_DISK_METER_TONE_CLASS.healthy}`}
                      style={{ width: `${host.memoryUsagePercent}%` }}
                    />
                  </span>
                  <span className={FM_DISK_META_CLASS}>
                    <span>{host.memoryLabel}</span>
                    <span>
                      {labels.diskAvailable} {host.memoryAvailableLabel}
                    </span>
                  </span>
                </span>
              </dd>
            </div>
          </dl>
        </article>
      )}

      {hasDevices === false ? null : (
      <HomeSection title={labels.homeSectionDevices} section="devices">
        {home.disks.map((item) => (
          <AppObjectRow
            key={item.disk.id}
            className={`${FM_HOME_CARD_CLASS} ${FM_DISK_CARD_CLASS}`}
            onClick={() => {
              actions.onOpenDisk(item.disk);
            }}
            onContextMenu={(event) => {
              preventContextMenuDefaults(event);
              actions.onDiskContextMenu(item.disk, event.clientX, event.clientY);
            }}
            icon={renderFileManagerDiskIcon(item.disk)}
            title={item.disk.title}
            meta={(
              <AppBadge className={FM_DISK_KIND_CLASS}>
                {resolveFileManagerDiskKindLabel(item.disk.kind, labels)}
              </AppBadge>
            )}
            description={(
              <span className={FM_DISK_DESCRIPTION_CLASS}>
                <span className={FM_DISK_PATH_CLASS}>{item.disk.mountPath}</span>
                <span className={FM_DISK_METER_CLASS} aria-hidden="true">
                  <span
                    className={`${FM_DISK_METER_FILL_CLASS} ${FM_DISK_METER_TONE_CLASS[item.usageTone] ?? FM_DISK_METER_TONE_CLASS.healthy}`}
                    style={{ width: `${item.usagePercent}%` }}
                  />
                </span>
                <span className={FM_DISK_META_CLASS}>
                  <span>{item.usageLabel}</span>
                  <span>
                    {labels.diskAvailable} {item.availableLabel}
                  </span>
                </span>
              </span>
            )}
          />
        ))}

        {home.devices.map((item) => (
          <AppObjectRow
            as="div"
            key={item.device.id}
            className={`${FM_HOME_CARD_CLASS} ${FM_DISK_CARD_CLASS} ${FM_DEVICE_CARD_CLASS}`}
            onContextMenu={(event) => {
              preventContextMenuDefaults(event);
              if (item.device.canMount === false && item.device.canEject === false) {
                return;
              }
              actions.onDeviceContextMenu(item.device, event.clientX, event.clientY);
            }}
            icon={renderFileManagerDiskIcon(item.device)}
            title={item.device.title}
            meta={(
              <AppBadge className={FM_DISK_KIND_CLASS}>
                {resolveFileManagerDiskKindLabel(item.device.kind, labels)}
              </AppBadge>
            )}
            description={(
              <span className={FM_DISK_DESCRIPTION_CLASS}>
                <span className={FM_DISK_PATH_CLASS}>
                  {item.device.displayPath ?? item.device.devicePath}
                </span>
                <span className={FM_DISK_META_CLASS}>
                  <span>{labels.deviceUnmounted}</span>
                  {item.totalBytesLabel === null ? null : <span>{item.totalBytesLabel}</span>}
                </span>
              </span>
            )}
          />
        ))}
      </HomeSection>
      )}
    </div>
  );
};

export const FileManagerFavoritesContent = ({
  renderModel,
  labels,
  actions
}: FileManagerSurfaceChromeProps) => {
  if (renderModel.body.kind !== "favorites") {
    return null;
  }

  const favorites = renderModel.body.favorites;

  return (
    <div className={`${APP_CONTENT_COLUMN_CLASS} lyra-file-manager-favorites-page ${FM_PAGE_CLASS} ${FM_PAGE_GRID_CLASS}`}>
      <header className={`${APP_SECTION_TITLE_CLASS} lyra-file-manager-favorites-header ${FM_SECTION_HEADER_CLASS}`}>
        {renderFileManagerSectionIcon("favorites")}
        <h3 className={FM_SECTION_TITLE_CLASS}>{labels.homeSectionFavorites}</h3>
      </header>
      {favorites.isEmpty ? (
        <AppEmptyState className={FM_EMPTY_STATE_CLASS} title={labels.noFavorites} />
      ) : (
        <div className={`${APP_GROUP_CLASS} lyra-app-row-list ${FM_FAVORITES_LIST_CLASS}`}>
          {favorites.favorites.map((favorite) => (
            <AppObjectRow
              key={favorite.id}
              className={FM_FAVORITE_ROW_CLASS}
              onClick={() => {
                actions.onOpenFavorite(favorite);
              }}
              onContextMenu={(event) => {
                preventContextMenuDefaults(event);
                actions.onFavoriteContextMenu(favorite, event.clientX, event.clientY);
              }}
              icon={renderFileManagerFavoriteIcon(favorite)}
              title={<MessageCitationText text={favorite.title} />}
              description={
                favorite.kind === "web"
                  ? favorite.url ?? favorite.path
                  : favorite.kind === "agent-session"
                    ? favorite.workingDir ?? favorite.sessionId ?? favorite.path
                    : favorite.path
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
