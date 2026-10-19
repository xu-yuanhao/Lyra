import {
  useCallback,
  useMemo,
  useRef
} from "react";

import type { DownloadManagerTask } from "../../../shared/download-manager";
import type {
  FileManagerAppState,
  FileManagerModel,
  UseFileManagerModelOptions
} from "./types";
import { useFileManagerContextMenusController } from "./context-menus";
import { useFileManagerDownloadsController } from "./downloads-controller";
import { useFileManagerFileActionsController } from "./file-actions-controller";
import { useFileManagerLocationController } from "./location-controller";
import { useFileManagerStateStore } from "./state-store";

export const useFileManagerModel = ({
  desktopApi,
  contextMenuModel,
  labels,
  onMetaChange,
  onOpenTerminal
}: UseFileManagerModelOptions): FileManagerModel => {
  const downloadTasksRef = useRef<readonly DownloadManagerTask[]>([]);
  const downloadStatusRef = useRef<FileManagerAppState["downloadStatus"]>("idle");
  const downloadErrorMessageRef = useRef<string | undefined>(undefined);
  const platform = desktopApi?.appMeta.platform ?? null;

  const getDownloadDefaults = useCallback(() => ({
    tasks: downloadTasksRef.current,
    status: downloadStatusRef.current,
    errorMessage: downloadErrorMessageRef.current
  }), [
    downloadErrorMessageRef,
    downloadStatusRef,
    downloadTasksRef
  ]);

  const unsubscribeDirectory = useCallback((subscriptionId: string | undefined) => {
    if (subscriptionId === undefined) {
      return;
    }
    void desktopApi?.files.unsubscribeDirectory?.(subscriptionId).catch(() => undefined);
  }, [desktopApi]);

  const handleStateRemoved = useCallback((state: FileManagerAppState) => {
    unsubscribeDirectory(state.directorySubscriptionId);
  }, [unsubscribeDirectory]);

  const store = useFileManagerStateStore({
    labels,
    getDownloadDefaults,
    onMetaChange,
    onStateRemoved: handleStateRemoved
  });

  const unsubscribeDirectoryForInstance = useCallback((instanceId: string) => {
    unsubscribeDirectory(store.statesRef.current[instanceId]?.directorySubscriptionId);
  }, [store.statesRef, unsubscribeDirectory]);

  const downloads = useFileManagerDownloadsController({
    desktopApi,
    labels,
    store,
    refs: {
      tasksRef: downloadTasksRef,
      statusRef: downloadStatusRef,
      errorMessageRef: downloadErrorMessageRef
    },
    unsubscribeDirectoryForInstance
  });

  const locations = useFileManagerLocationController({
    desktopApi,
    labels,
    platform,
    store,
    loadDownloads: downloads.loadDownloads,
    onMetaChange,
    unsubscribeDirectory,
    unsubscribeDirectoryForInstance
  });

  const fileActions = useFileManagerFileActionsController({
    desktopApi,
    platform,
    store,
    loadHome: locations.loadHome,
    loadDirectory: locations.loadDirectory,
    loadTrash: locations.loadTrash,
    refresh: locations.refresh
  });

  const contextMenus = useFileManagerContextMenusController({
    desktopApi,
    contextMenuModel,
    labels,
    platform,
    store,
    loadDirectory: locations.loadDirectory,
    openLocation: locations.openLocation,
    loadTrash: locations.loadTrash,
    refresh: locations.refresh,
    writeFavoritesForState: locations.writeFavoritesForState,
    isFavoritePath: locations.isFavoritePath,
    toggleFavoriteForLocation: locations.toggleFavoriteForLocation,
    toggleCurrentDirectoryFavorite: locations.toggleCurrentDirectoryFavorite,
    ejectDisk: fileActions.ejectDisk,
    ejectDevice: fileActions.ejectDevice,
    mountDevice: fileActions.mountDevice,
    selectEntry: fileActions.selectEntry,
    selectTrashEntry: fileActions.selectTrashEntry,
    beginCreateDraft: fileActions.beginCreateDraft,
    emptyTrash: fileActions.emptyTrash,
    ...(onOpenTerminal === undefined ? {} : { onOpenTerminal })
  });

  const {
    subscribe,
    createInstance,
    getState,
    ensureInstance,
    syncExternalInstances,
    syncTabInstances
  } = store;
  const {
    loadHome,
    loadDirectory,
    loadTrash,
    goBack,
    goForward,
    goUp,
    refresh,
    toggleCurrentDirectoryFavorite
  } = locations;
  const {
    loadDownloads,
    updateDownloadUrlDraft,
    submitDownloadUrlDraft,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    setDownloadPriority,
    pauseAllDownloads,
    resumeAllDownloads,
    cancelAllDownloads,
    openDownloadedFile,
    revealDownloadedFile
  } = downloads;
  const {
    setPresentationMode,
    selectEntry,
    selectTrashEntry,
    beginCreateDraft,
    updateCreateDraft,
    cancelCreateDraft,
    commitCreateDraft,
    moveSelectionToTrash,
    restoreSelectionFromTrash,
    emptyTrash
  } = fileActions;
  const {
    openDiskContextMenu,
    openDeviceContextMenu,
    openEntryContextMenu,
    openFavoriteContextMenu,
    openLocationContextMenu,
    openRecentLocationContextMenu,
    openTrashEntryContextMenu,
    openDirectoryContextMenu,
    openTrashContextMenu
  } = contextMenus;

  return useMemo<FileManagerModel>(() => ({
    subscribe,
    createInstance,
    getState,
    ensureInstance,
    syncExternalInstances,
    syncTabInstances,
    openHome: loadHome,
    openDirectory: loadDirectory,
    openTrash: loadTrash,
    openDownloads: loadDownloads,
    goBack,
    goForward,
    goUp,
    refresh,
    setPresentationMode,
    selectEntry,
    selectTrashEntry,
    beginCreateDraft,
    updateCreateDraft,
    cancelCreateDraft,
    commitCreateDraft,
    moveSelectionToTrash,
    restoreSelectionFromTrash,
    emptyTrash,
    updateDownloadUrlDraft,
    submitDownloadUrlDraft,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    retryDownload,
    removeDownload,
    setDownloadPriority,
    pauseAllDownloads,
    resumeAllDownloads,
    cancelAllDownloads,
    openDownloadedFile,
    revealDownloadedFile,
    toggleCurrentDirectoryFavorite,
    openDiskContextMenu,
    openDeviceContextMenu,
    openEntryContextMenu,
    openFavoriteContextMenu,
    openLocationContextMenu,
    openRecentLocationContextMenu,
    openTrashEntryContextMenu,
    openDirectoryContextMenu,
    openTrashContextMenu
  }), [
    beginCreateDraft,
    cancelAllDownloads,
    cancelCreateDraft,
    cancelDownload,
    commitCreateDraft,
    createInstance,
    emptyTrash,
    ensureInstance,
    getState,
    goBack,
    goForward,
    goUp,
    loadDirectory,
    loadDownloads,
    loadHome,
    loadTrash,
    moveSelectionToTrash,
    openDeviceContextMenu,
    openDirectoryContextMenu,
    openDiskContextMenu,
    openDownloadedFile,
    openEntryContextMenu,
    openFavoriteContextMenu,
    openLocationContextMenu,
    openRecentLocationContextMenu,
    openTrashContextMenu,
    openTrashEntryContextMenu,
    pauseAllDownloads,
    pauseDownload,
    refresh,
    removeDownload,
    resumeAllDownloads,
    resumeDownload,
    restoreSelectionFromTrash,
    retryDownload,
    revealDownloadedFile,
    selectEntry,
    selectTrashEntry,
    setDownloadPriority,
    setPresentationMode,
    subscribe,
    submitDownloadUrlDraft,
    syncExternalInstances,
    syncTabInstances,
    toggleCurrentDirectoryFavorite,
    updateCreateDraft,
    updateDownloadUrlDraft
  ]);
};
