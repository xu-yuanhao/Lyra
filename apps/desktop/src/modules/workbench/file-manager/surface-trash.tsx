import { AppEmptyState, AppList, AppObjectRow } from "@renderer/ui/components";

import {
  renderFileManagerEntryIcon
} from "./icon-registry";
import { OverflowMarqueeText } from "./overflow-marquee";
import {
  FileManagerLargeTrashTile
} from "./surface-entry-tiles";
import {
  FM_EMPTY_STATE_CLASS,
  FM_LARGE_GRID_CLASS,
  FM_LIST_GRID_CLASS,
  FM_LIST_NAME_CLASS,
  FM_LIST_ROW_CLASS,
  FM_LIST_SHELL_CLASS,
  FM_PAGE_CLASS,
  APP_CONTENT_COLUMN_CLASS,
  APP_CONTENT_COLUMN_WIDE_CLASS,
  APP_GROUP_CLASS,
} from "./surface-classes";
import { preventContextMenuDefaults } from "./surface-view-events";
import type { FileManagerSurfaceChromeProps } from "./surface-view-types";

export const FileManagerTrashContent = ({
  renderModel,
  labels,
  actions
}: FileManagerSurfaceChromeProps) => {
  if (renderModel.body.kind !== "trash") {
    return null;
  }
  const trash = renderModel.body.trash;
  if (renderModel.toolbar.isLargeMode) {
    return (
      <div className={`${APP_CONTENT_COLUMN_CLASS} ${APP_CONTENT_COLUMN_WIDE_CLASS} lyra-file-manager-list-shell ${FM_PAGE_CLASS} ${FM_LIST_SHELL_CLASS}`}>
        <div className={`${APP_GROUP_CLASS} ${FM_LARGE_GRID_CLASS}`}>
          {trash.isEmpty ? (
            <AppEmptyState className={FM_EMPTY_STATE_CLASS} title={labels.emptyTrashState} />
          ) : trash.entries.map(({ entry, active }) => (
            <FileManagerLargeTrashTile
              key={entry.id}
              entry={entry}
              isActive={active}
              onSelect={() => {
                actions.onSelectTrashEntry(entry.id);
              }}
              onContextMenu={(event) => {
                preventContextMenuDefaults(event);
                actions.onTrashEntryContextMenu(entry.id, event.clientX, event.clientY);
              }}
              onDragStart={(event) => {
                actions.onTrashEntryDragStart(event, entry);
              }}
              onDragEnd={actions.onEntryDragEnd}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`${APP_CONTENT_COLUMN_CLASS} ${APP_CONTENT_COLUMN_WIDE_CLASS} lyra-file-manager-list-shell ${FM_PAGE_CLASS} ${FM_LIST_SHELL_CLASS}`}>
      <AppList className={FM_LIST_GRID_CLASS}>
        {trash.isEmpty ? (
          <AppEmptyState
            className={FM_EMPTY_STATE_CLASS}
            title={labels.emptyTrashState}
          />
        ) : trash.entries.map(({ entry, active }) => (
          <AppObjectRow
            key={entry.id}
            className={FM_LIST_ROW_CLASS}
            active={active}
            data-lyra-allow-web-drag="true"
            draggable
            onClick={() => {
              actions.onSelectTrashEntry(entry.id);
            }}
            onContextMenu={(event) => {
              preventContextMenuDefaults(event);
              actions.onTrashEntryContextMenu(entry.id, event.clientX, event.clientY);
            }}
            onDragStart={(event) => {
              actions.onTrashEntryDragStart(event, entry);
            }}
            onDragEnd={actions.onEntryDragEnd}
            icon={renderFileManagerEntryIcon(entry)}
            title={(
              <OverflowMarqueeText
                text={entry.name}
                active={active}
                className={FM_LIST_NAME_CLASS}
              />
            )}
          />
        ))}
      </AppList>
    </div>
  );
};
