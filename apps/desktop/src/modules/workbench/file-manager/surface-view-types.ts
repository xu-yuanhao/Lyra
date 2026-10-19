import type { DragEvent as ReactDragEvent } from "react";

import type {
  FileManagerDevice,
  FileManagerDisk,
  FileManagerEntry,
  FileManagerFavorite,
  FileManagerLocation,
  FileManagerRecentLocation,
  FileManagerTrashEntry
} from "../../../shared/file-manager";
import type { DownloadManagerPriority } from "../../../shared/download-manager";
import type { FileManagerSurfaceRenderModel } from "./surface-model";
import type {
  FileManagerCreateDraftKind,
  FileManagerPresentationMode,
  FileManagerSelectionMode,
  FileManagerSurfaceLabels
} from "./types";

export type FileManagerSurfaceActions = {
  readonly onGoBack: () => void;
  readonly onGoForward: () => void;
  readonly onGoUp: () => void;
  readonly onRefresh: () => void;
  readonly onOpenBreadcrumb: (path: string) => void;
  readonly onSetPresentationMode: (mode: FileManagerPresentationMode) => void;
  readonly onToggleFavorite: () => void;
  readonly onBeginCreateDraft: (kind: FileManagerCreateDraftKind) => void;
  readonly onMoveSelectionToTrash: () => void;
  readonly onRestoreSelectionFromTrash: () => void;
  readonly onEmptyTrash: () => void;
  readonly onOpenHome: () => void;
  readonly onOpenFavorites: () => void;
  readonly onOpenDownloads: () => void;
  readonly onOpenLocation: (location: FileManagerLocation) => void;
  readonly onOpenDirectoryPath: (path: string) => void;
  readonly onOpenDisk: (disk: FileManagerDisk) => void;
  readonly onOpenRecentLocation: (recent: FileManagerRecentLocation) => void;
  readonly onOpenFavorite: (favorite: FileManagerFavorite) => void;
  readonly onFavoriteContextMenu: (
    favorite: FileManagerFavorite,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onLocationContextMenu: (
    location: FileManagerLocation,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onDiskContextMenu: (
    disk: FileManagerDisk,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onDeviceContextMenu: (
    device: FileManagerDevice,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onRecentLocationContextMenu: (
    recent: FileManagerRecentLocation,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onContentContextMenu: (anchorX: number, anchorY: number) => void;
  readonly onDraftValueChange: (value: string) => void;
  readonly onCommitCreateDraft: () => void;
  readonly onCancelCreateDraft: () => void;
  readonly onSelectEntry: (entryId: string, mode?: FileManagerSelectionMode) => void;
  readonly onOpenEntry: (entry: FileManagerEntry) => void;
  readonly onEntryContextMenu: (
    entryId: string,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onDirectoryEntryDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    entry: FileManagerEntry
  ) => void;
  readonly onSelectTrashEntry: (entryId: string) => void;
  readonly onTrashEntryContextMenu: (
    entryId: string,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly onTrashEntryDragStart: (
    event: ReactDragEvent<HTMLButtonElement>,
    entry: FileManagerTrashEntry
  ) => void;
  readonly onEntryDragEnd: () => void;
  readonly onConfirmChooser: () => void;
  readonly onDownloadUrlDraftChange: (value: string) => void;
  readonly onSubmitDownloadUrlDraft: () => void;
  readonly onPauseDownload: (taskId: string) => void;
  readonly onResumeDownload: (taskId: string) => void;
  readonly onCancelDownload: (taskId: string) => void;
  readonly onRetryDownload: (taskId: string) => void;
  readonly onRemoveDownload: (taskId: string) => void;
  readonly onSetDownloadPriority: (taskId: string, priority: DownloadManagerPriority) => void;
  readonly onPauseAllDownloads: () => void;
  readonly onResumeAllDownloads: () => void;
  readonly onCancelAllDownloads: () => void;
  readonly onOpenDownloadedFile: (taskId: string) => void;
  readonly onRevealDownloadedFile: (taskId: string) => void;
};

export type FileManagerDownloadsSlotLabels = {
  readonly title: string;
  readonly repairLabel: string;
  readonly description: string;
  readonly startFailedDescription: string;
  readonly onRepair: () => void;
};

export type FileManagerSurfaceChromeProps = {
  readonly renderModel: FileManagerSurfaceRenderModel;
  readonly labels: FileManagerSurfaceLabels;
  readonly actions: FileManagerSurfaceActions;
};

export type FileManagerSurfaceViewProps = FileManagerSurfaceChromeProps & {
  readonly instanceId: string;
  readonly downloadsSlot: FileManagerDownloadsSlotLabels;
};
