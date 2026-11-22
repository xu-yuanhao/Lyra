import { Check, X } from "@lyra/icons";
import type {
  DragEvent as ReactDragEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent
} from "react";

import { AppButton, AppIconButton, AppInput } from "@renderer/ui/components";

import type {
  FileManagerEntry,
  FileManagerTrashEntry
} from "../../../shared/file-manager";
import {
  renderFileManagerEntryIcon,
  renderFileManagerLocationIcon
} from "./icon-registry";
import { OverflowMarqueeText } from "./overflow-marquee";
import {
  FM_LARGE_TILE_BODY_CLASS,
  FM_LARGE_TILE_CLASS,
  FM_LARGE_TILE_DRAFT_CLASS,
  FM_LARGE_TILE_IMAGE_CLASS,
  FM_LARGE_TILE_PREVIEW_CLASS,
  FM_LARGE_TILE_TITLE_CLASS,
  FM_LIST_CELL_PRIMARY_CLASS,
  FM_LIST_CELL_PRIMARY_DRAFT_CLASS,
  FM_LIST_ROW_DRAFT_CLASS
} from "./surface-classes";
import { FileManagerImagePreview, isPreviewableImageEntry } from "./preview";
import type { FileManagerSurfaceActions } from "./surface-view-types";
import type {
  FileManagerAppState,
  FileManagerSurfaceLabels
} from "./types";

export const FileManagerDraftInput = ({
  draft,
  labels,
  actions,
  variant
}: {
  readonly draft: NonNullable<FileManagerAppState["createDraft"]>;
  readonly labels: FileManagerSurfaceLabels;
  readonly actions: FileManagerSurfaceActions;
  readonly variant: "list" | "large";
}) => {
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      event.preventDefault();
      actions.onCommitCreateDraft();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      actions.onCancelCreateDraft();
    }
  };
  const icon =
    draft.kind === "directory"
      ? renderFileManagerLocationIcon({ id: "draft", title: "", kind: "directory", path: "" })
      : renderFileManagerEntryIcon({ id: "draft", name: "", path: "", kind: "file", isHidden: false });
  const input = (
    <AppInput
      className="lyra-file-manager-create-input"
      value={draft.value}
      placeholder={
        draft.kind === "directory"
          ? labels.createPlaceholderDirectory
          : labels.createPlaceholderFile
      }
      autoFocus
      onChange={(event) => {
        actions.onDraftValueChange(event.target.value);
      }}
      onKeyDown={onKeyDown}
    />
  );
  const actionButtons = (
    <div className="lyra-file-manager-create-actions">
      <AppIconButton
        className="lyra-file-manager-create-button"
        aria-label={labels.createConfirm}
        onClick={actions.onCommitCreateDraft}
      >
        <Check size={14} aria-hidden="true" />
      </AppIconButton>
      <AppIconButton
        className="lyra-file-manager-create-button"
        aria-label={labels.createCancel}
        onClick={actions.onCancelCreateDraft}
      >
        <X size={14} aria-hidden="true" />
      </AppIconButton>
    </div>
  );

  if (variant === "large") {
    return (
      <div className={FM_LARGE_TILE_DRAFT_CLASS}>
        <div className={FM_LARGE_TILE_PREVIEW_CLASS}>{icon}</div>
        <div className={FM_LARGE_TILE_BODY_CLASS}>
          {input}
          {actionButtons}
        </div>
      </div>
    );
  }

  return (
    <div className={FM_LIST_ROW_DRAFT_CLASS}>
      <div className={`${FM_LIST_CELL_PRIMARY_CLASS} ${FM_LIST_CELL_PRIMARY_DRAFT_CLASS}`}>
        {icon}
        {input}
        {actionButtons}
      </div>
    </div>
  );
};

export const FileManagerLargeEntryTile = ({
  entry,
  isActive,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragEnd
}: {
  entry: FileManagerEntry;
  readonly isActive: boolean;
  readonly onSelect: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  readonly onOpen: () => void;
  readonly onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  readonly onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  readonly onDragEnd: () => void;
}) => (
  <AppButton
    variant="ghost"
    className={isActive ? `${FM_LARGE_TILE_CLASS} lyra-file-manager-large-tile-active` : FM_LARGE_TILE_CLASS}
    data-active={isActive ? "true" : undefined}
    data-lyra-allow-web-drag="true"
    draggable
    onClick={onSelect}
    onDoubleClick={onOpen}
    onContextMenu={onContextMenu}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
  >
    <div className={FM_LARGE_TILE_PREVIEW_CLASS}>
      {isPreviewableImageEntry(entry) ? (
        <FileManagerImagePreview
          entry={entry}
          className={FM_LARGE_TILE_IMAGE_CLASS}
        />
      ) : renderFileManagerEntryIcon(entry)}
    </div>
    <div className={FM_LARGE_TILE_BODY_CLASS}>
      <OverflowMarqueeText
        text={entry.name}
        active={isActive}
        className={FM_LARGE_TILE_TITLE_CLASS}
      />
    </div>
  </AppButton>
);

export const FileManagerLargeTrashTile = ({
  entry,
  isActive,
  onSelect,
  onContextMenu,
  onDragStart,
  onDragEnd
}: {
  readonly entry: FileManagerTrashEntry;
  readonly isActive: boolean;
  readonly onSelect: () => void;
  readonly onContextMenu: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  readonly onDragStart: (event: ReactDragEvent<HTMLButtonElement>) => void;
  readonly onDragEnd: () => void;
}) => (
  <AppButton
    variant="ghost"
    className={isActive ? `${FM_LARGE_TILE_CLASS} lyra-file-manager-large-tile-active` : FM_LARGE_TILE_CLASS}
    data-active={isActive ? "true" : undefined}
    data-lyra-allow-web-drag="true"
    draggable
    onClick={onSelect}
    onContextMenu={onContextMenu}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
  >
    <div className={FM_LARGE_TILE_PREVIEW_CLASS}>
      {isPreviewableImageEntry(entry) ? (
        <FileManagerImagePreview
          entry={entry}
          className={FM_LARGE_TILE_IMAGE_CLASS}
        />
      ) : renderFileManagerEntryIcon(entry)}
    </div>
    <div className={FM_LARGE_TILE_BODY_CLASS}>
      <OverflowMarqueeText
        text={entry.name}
        active={isActive}
        className={FM_LARGE_TILE_TITLE_CLASS}
      />
    </div>
  </AppButton>
);
