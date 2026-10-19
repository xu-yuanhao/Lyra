import { AppEmptyState, AppList, AppObjectRow } from "@renderer/ui/components";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { FileManagerSelectionMode } from "./types";
import {
  renderFileManagerEntryIcon
} from "./icon-registry";
import { OverflowMarqueeText } from "./overflow-marquee";
import {
  FileManagerDraftInput,
  FileManagerLargeEntryTile
} from "./surface-entry-tiles";
import { preventContextMenuDefaults } from "./surface-view-events";
import type { FileManagerSurfaceChromeProps } from "./surface-view-types";

const resolveSelectionMode = (
  event: ReactMouseEvent
): FileManagerSelectionMode => {
  if (event.shiftKey) {
    return "range";
  }
  return event.metaKey || event.ctrlKey ? "toggle" : "replace";
};

export const FileManagerDirectoryContent = ({
  renderModel,
  labels,
  actions
}: FileManagerSurfaceChromeProps) => {
  if (renderModel.body.kind !== "directory") {
    return null;
  }
  const directory = renderModel.body.directory;
  if (renderModel.toolbar.isLargeMode) {
    return (
      <div className="lyra-app-content-column lyra-app-content-column-wide lyra-file-manager-list-shell">
        <div className="lyra-app-group lyra-file-manager-large-grid">
          {directory.createDraft === undefined ? null : (
            <FileManagerDraftInput
              draft={directory.createDraft}
              labels={labels}
              actions={actions}
              variant="large"
            />
          )}

          {directory.isEmpty ? (
            <AppEmptyState className="lyra-file-manager-empty-state" title={labels.emptyDirectory} />
          ) : directory.entries.map(({ entry, active }) => (
            <FileManagerLargeEntryTile
              key={entry.id}
              entry={entry}
              isActive={active}
              onSelect={(event) => {
                actions.onSelectEntry(entry.id, resolveSelectionMode(event));
              }}
              onOpen={() => {
                actions.onOpenEntry(entry);
              }}
              onContextMenu={(event) => {
                preventContextMenuDefaults(event);
                actions.onEntryContextMenu(entry.id, event.clientX, event.clientY);
              }}
              onDragStart={(event) => {
                actions.onDirectoryEntryDragStart(event, entry);
              }}
              onDragEnd={actions.onEntryDragEnd}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="lyra-app-content-column lyra-app-content-column-wide lyra-file-manager-list-shell">
      <AppList className="lyra-app-group lyra-file-manager-list-grid">
        {directory.createDraft === undefined ? null : (
          <FileManagerDraftInput
            draft={directory.createDraft}
            labels={labels}
            actions={actions}
            variant="list"
          />
        )}

        {directory.isEmpty ? (
          <AppEmptyState
            className="lyra-file-manager-empty-state"
            title={labels.emptyDirectory}
          />
        ) : directory.entries.map(({ entry, active }) => (
          <AppObjectRow
            key={entry.id}
            className="lyra-file-manager-list-row"
            active={active}
            data-lyra-allow-web-drag="true"
            draggable
            onClick={(event) => {
              actions.onSelectEntry(entry.id, resolveSelectionMode(event));
            }}
            onDoubleClick={() => {
              actions.onOpenEntry(entry);
            }}
            onContextMenu={(event) => {
              preventContextMenuDefaults(event);
              actions.onEntryContextMenu(entry.id, event.clientX, event.clientY);
            }}
            onDragStart={(event) => {
              actions.onDirectoryEntryDragStart(event, entry);
            }}
            onDragEnd={actions.onEntryDragEnd}
            icon={renderFileManagerEntryIcon(entry)}
            title={(
              <OverflowMarqueeText
                text={entry.name}
                active={active}
                className="lyra-file-manager-list-name"
              />
            )}
          />
        ))}
      </AppList>
    </div>
  );
};
