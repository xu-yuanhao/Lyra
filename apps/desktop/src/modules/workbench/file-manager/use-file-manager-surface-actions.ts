import {
  type DragEvent as ReactDragEvent,
  type MutableRefObject,
  useMemo
} from "react";

import {
  clearFileManagerEntryDragPayload,
  type FileManagerEntryDragPayload,
  writeFileManagerEntryDragPayload
} from "./drag-transfer";
import { resolveFileManagerEntryIconKind } from "./entry-icon-classifier";
import type {
  FileManagerEntry,
  FileManagerFavorite,
  FileManagerTrashEntry
} from "../../../shared/file-manager";
import { optionalFileManagerPath } from "./location-utils";
import { deriveFileManagerSurfaceModel } from "./surface-model";
import type { FileManagerSurfaceActions } from "./surface-view";
import type {
  FileManagerAppState,
  FileManagerChooserMode,
  FileManagerModel
} from "./types";

type FileManagerRenderModel = ReturnType<typeof deriveFileManagerSurfaceModel>;

const toDirectoryEntryDragPayload = (
  entry: FileManagerEntry
): FileManagerEntryDragPayload => ({
  name: entry.name,
  kind: entry.kind,
  source: "directory",
  path: entry.path,
  iconKind: resolveFileManagerEntryIconKind(entry)
});

const toTrashEntryDragPayload = (
  entry: FileManagerTrashEntry
): FileManagerEntryDragPayload => ({
  name: entry.name,
  kind: entry.kind,
  source: "trash",
  iconKind: resolveFileManagerEntryIconKind(entry),
  ...(entry.trashedPath === undefined ? {} : { path: entry.trashedPath })
});

const createFileManagerDragPreview = (
  documentRef: Document,
  label: string
): HTMLDivElement => {
  const preview = documentRef.createElement("div");
  preview.className = "lyra-file-manager-drag-preview";
  preview.textContent = label;
  documentRef.body.append(preview);
  return preview;
};

export const useFileManagerSurfaceActions = ({
  state,
  model,
  onOpenFile,
  onOpenFavorite,
  chooser,
  renderModel,
  setPageKindOverride,
  dragPreviewRef
}: {
  readonly state: FileManagerAppState | null;
  readonly model: FileManagerModel;
  readonly onOpenFile: (filePath: string) => void;
  readonly onOpenFavorite?: (favorite: FileManagerFavorite) => void;
  readonly chooser?: FileManagerChooserMode | null;
  readonly renderModel: FileManagerRenderModel | null;
  readonly setPageKindOverride: (value: "favorites" | null) => void;
  readonly dragPreviewRef: MutableRefObject<HTMLElement | null>;
}): FileManagerSurfaceActions | null =>
  useMemo(() => {
    if (state === null || renderModel === null) {
      return null;
    }

    const instanceId = state.instanceId;
    const viewKind = state.viewKind;
    const chooserCanConfirm = renderModel.chooserBar?.canConfirm === true;
    const chooserOnConfirm = chooser?.onConfirm;

    const clearEntryDragPreview = (): void => {
      const currentPreview = dragPreviewRef.current;
      if (currentPreview === null) {
        return;
      }
      dragPreviewRef.current = null;
      currentPreview.remove();
    };

    const applyEntryDragImage = (
      event: ReactDragEvent<HTMLButtonElement>,
      label: string
    ): void => {
      clearEntryDragPreview();
      const preview = createFileManagerDragPreview(
        event.currentTarget.ownerDocument,
        label
      );
      dragPreviewRef.current = preview;
      event.dataTransfer.setDragImage(preview, 14, 12);
    };

    return {
      onGoBack: () => {
        setPageKindOverride(null);
        void model.goBack(instanceId);
      },
      onGoForward: () => {
        setPageKindOverride(null);
        void model.goForward(instanceId);
      },
      onGoUp: () => {
        setPageKindOverride(null);
        void model.goUp(instanceId);
      },
      onRefresh: () => {
        void model.refresh(instanceId);
      },
      onOpenBreadcrumb: (path) => {
        setPageKindOverride(null);
        void model.openDirectory(instanceId, path);
      },
      onSetPresentationMode: (mode) => {
        model.setPresentationMode(instanceId, mode);
      },
      onToggleFavorite: () => {
        void model.toggleCurrentDirectoryFavorite(instanceId);
      },
      onBeginCreateDraft: (kind) => {
        model.beginCreateDraft(instanceId, kind);
      },
      onMoveSelectionToTrash: () => {
        void model.moveSelectionToTrash(instanceId);
      },
      onRestoreSelectionFromTrash: () => {
        void model.restoreSelectionFromTrash(instanceId);
      },
      onEmptyTrash: () => {
        void model.emptyTrash(instanceId);
      },
      onOpenHome: () => {
        setPageKindOverride(null);
        void model.openHome(instanceId);
      },
      onOpenFavorites: () => {
        setPageKindOverride("favorites");
        void model.openHome(instanceId, false);
      },
      onOpenDownloads: () => {
        setPageKindOverride(null);
        void model.openDownloads(instanceId);
      },
      onOpenLocation: (location) => {
        setPageKindOverride(null);
        if (location.specialId === "trash") {
          void model.openTrash(instanceId);
          return;
        }
        if (location.specialId === "downloadManager") {
          void model.openDownloads(instanceId);
          return;
        }
        const path = optionalFileManagerPath(location.path);
        if (path !== undefined) {
          void model.openDirectory(instanceId, path);
        }
      },
      onOpenDirectoryPath: (path) => {
        setPageKindOverride(null);
        void model.openDirectory(instanceId, path);
      },
      onOpenDisk: (disk) => {
        setPageKindOverride(null);
        void model.openDirectory(instanceId, disk.mountPath);
      },
      onOpenRecentLocation: (recent) => {
        setPageKindOverride(null);
        void model.openDirectory(instanceId, recent.path);
      },
      onOpenFavorite: (favorite) => {
        if (favorite.kind === "web" || favorite.kind === "agent-session") {
          onOpenFavorite?.(favorite);
          return;
        }
        setPageKindOverride(null);
        void model.openDirectory(instanceId, favorite.path);
      },
      onFavoriteContextMenu: (favorite, anchorX, anchorY) => {
        model.openFavoriteContextMenu(instanceId, favorite, anchorX, anchorY);
      },
      onLocationContextMenu: (location, anchorX, anchorY) => {
        model.openLocationContextMenu(instanceId, location, anchorX, anchorY);
      },
      onDiskContextMenu: (disk, anchorX, anchorY) => {
        model.openDiskContextMenu(instanceId, disk, anchorX, anchorY);
      },
      onDeviceContextMenu: (device, anchorX, anchorY) => {
        model.openDeviceContextMenu(instanceId, device, anchorX, anchorY);
      },
      onRecentLocationContextMenu: (recent, anchorX, anchorY) => {
        model.openRecentLocationContextMenu(instanceId, recent, anchorX, anchorY);
      },
      onContentContextMenu: (anchorX, anchorY) => {
        if (viewKind === "directory") {
          model.openDirectoryContextMenu(instanceId, anchorX, anchorY);
          return;
        }
        if (viewKind === "trash") {
          model.openTrashContextMenu(instanceId, anchorX, anchorY);
        }
      },
      onDraftValueChange: (value) => {
        model.updateCreateDraft(instanceId, value);
      },
      onCommitCreateDraft: () => {
        void model.commitCreateDraft(instanceId);
      },
      onCancelCreateDraft: () => {
        model.cancelCreateDraft(instanceId);
      },
      onSelectEntry: (entryId, mode) => {
        model.selectEntry(instanceId, entryId, mode);
      },
      onOpenEntry: (entry) => {
        if (entry.kind === "directory") {
          setPageKindOverride(null);
          void model.openDirectory(instanceId, entry.path);
          return;
        }
        onOpenFile(entry.path);
      },
      onEntryContextMenu: (entryId, anchorX, anchorY) => {
        model.openEntryContextMenu(instanceId, entryId, anchorX, anchorY);
      },
      onDirectoryEntryDragStart: (event, entry) => {
        applyEntryDragImage(event, entry.name);
        writeFileManagerEntryDragPayload(
          event.dataTransfer,
          toDirectoryEntryDragPayload(entry)
        );
      },
      onSelectTrashEntry: (entryId) => {
        model.selectTrashEntry(instanceId, entryId);
      },
      onTrashEntryContextMenu: (entryId, anchorX, anchorY) => {
        model.openTrashEntryContextMenu(instanceId, entryId, anchorX, anchorY);
      },
      onTrashEntryDragStart: (event, entry) => {
        applyEntryDragImage(event, entry.name);
        writeFileManagerEntryDragPayload(
          event.dataTransfer,
          toTrashEntryDragPayload(entry)
        );
      },
      onEntryDragEnd: () => {
        clearEntryDragPreview();
        clearFileManagerEntryDragPayload();
      },
      onConfirmChooser: () => {
        if (!chooserCanConfirm) {
          return;
        }
        chooserOnConfirm?.();
      },
      onDownloadUrlDraftChange: (value) => {
        model.updateDownloadUrlDraft(instanceId, value);
      },
      onSubmitDownloadUrlDraft: () => {
        void model.submitDownloadUrlDraft(instanceId);
      },
      onPauseDownload: (taskId) => {
        void model.pauseDownload(taskId);
      },
      onResumeDownload: (taskId) => {
        void model.resumeDownload(taskId);
      },
      onCancelDownload: (taskId) => {
        void model.cancelDownload(taskId);
      },
      onRetryDownload: (taskId) => {
        void model.retryDownload(taskId);
      },
      onRemoveDownload: (taskId) => {
        void model.removeDownload(taskId);
      },
      onSetDownloadPriority: (taskId, priority) => {
        void model.setDownloadPriority(taskId, priority);
      },
      onPauseAllDownloads: () => {
        void model.pauseAllDownloads();
      },
      onResumeAllDownloads: () => {
        void model.resumeAllDownloads();
      },
      onCancelAllDownloads: () => {
        void model.cancelAllDownloads();
      },
      onOpenDownloadedFile: (taskId) => {
        void model.openDownloadedFile(taskId);
      },
      onRevealDownloadedFile: (taskId) => {
        void model.revealDownloadedFile(taskId);
      }
    };
  }, [
    chooser?.onConfirm,
    dragPreviewRef,
    model,
    onOpenFile,
    onOpenFavorite,
    renderModel,
    setPageKindOverride,
    state
  ]);
