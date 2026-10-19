import {
  FilePlus2,
  FolderPlus,
  FolderUp,
  HardDriveDownload,
  RefreshCw,
  RotateCcw,
  SquareTerminal,
  Star,
  StarOff,
  Trash2,
  Unplug
} from "@lyra/icons";
import { useCallback } from "react";

import type {
  FileManagerDevice,
  FileManagerDisk,
  FileManagerFavorite,
  FileManagerLocation,
  FileManagerRecentLocation
} from "../../../shared/file-manager";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type {
  ContextMenuItem,
  ContextMenuModel
} from "../context-menu";
import type {
  FileManagerAppState,
  FileManagerSelectionMode,
  FileManagerSurfaceLabels
} from "./types";
import { isSameLocationPath } from "./location-utils";
import {
  canFavoriteLocation,
  isDirectoryLocation,
  isPathFavorite
} from "./state-model";
import type { FileManagerStateStore } from "./state-store";

export type FileManagerContextMenusController = {
  readonly openDiskContextMenu: (
    instanceId: string,
    disk: FileManagerDisk,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly openDeviceContextMenu: (
    instanceId: string,
    device: FileManagerDevice,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly openEntryContextMenu: (instanceId: string, entryId: string, anchorX: number, anchorY: number) => void;
  readonly openFavoriteContextMenu: (
    instanceId: string,
    favorite: FileManagerFavorite,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly openLocationContextMenu: (
    instanceId: string,
    location: FileManagerLocation,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly openRecentLocationContextMenu: (
    instanceId: string,
    recent: FileManagerRecentLocation,
    anchorX: number,
    anchorY: number
  ) => void;
  readonly openTrashEntryContextMenu: (instanceId: string, entryId: string, anchorX: number, anchorY: number) => void;
  readonly openDirectoryContextMenu: (instanceId: string, anchorX: number, anchorY: number) => void;
  readonly openTrashContextMenu: (instanceId: string, anchorX: number, anchorY: number) => void;
};

export const useFileManagerContextMenusController = ({
  desktopApi,
  contextMenuModel,
  labels,
  platform,
  store,
  loadDirectory,
  openLocation,
  loadTrash,
  refresh,
  writeFavoritesForState,
  isFavoritePath,
  toggleFavoriteForLocation,
  toggleCurrentDirectoryFavorite,
  ejectDisk,
  ejectDevice,
  mountDevice,
  selectEntry,
  selectTrashEntry,
  beginCreateDraft,
  emptyTrash,
  onOpenTerminal
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly contextMenuModel: ContextMenuModel;
  readonly labels: FileManagerSurfaceLabels;
  readonly platform: NodeJS.Platform | null;
  readonly store: FileManagerStateStore;
  readonly loadDirectory: (instanceId: string, path: string, addToHistory?: boolean) => Promise<void>;
  readonly openLocation: (
    instanceId: string,
    location: FileManagerLocation,
    addToHistory?: boolean
  ) => Promise<void>;
  readonly loadTrash: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly refresh: (instanceId: string) => Promise<void>;
  readonly writeFavoritesForState: FileManagerStateFavoriteWriter;
  readonly isFavoritePath: (
    favorites: readonly FileManagerFavorite[],
    path: string | undefined
  ) => boolean;
  readonly toggleFavoriteForLocation: (
    instanceId: string,
    location: {
      readonly title: string;
      readonly path?: string;
      readonly specialId?: string;
    }
  ) => Promise<void>;
  readonly toggleCurrentDirectoryFavorite: (instanceId: string) => Promise<void>;
  readonly ejectDisk: (instanceId: string, disk: FileManagerDisk) => Promise<void>;
  readonly ejectDevice: (instanceId: string, device: FileManagerDevice) => Promise<void>;
  readonly mountDevice: (instanceId: string, device: FileManagerDevice) => Promise<void>;
  readonly selectEntry: (
    instanceId: string,
    entryId: string,
    mode?: FileManagerSelectionMode
  ) => void;
  readonly selectTrashEntry: (instanceId: string, entryId: string) => void;
  readonly beginCreateDraft: (instanceId: string, kind: "file" | "directory") => void;
  readonly emptyTrash: (instanceId: string) => Promise<void>;
  readonly onOpenTerminal?: (cwd: string) => void;
}): FileManagerContextMenusController => {
  const { statesRef } = store;

  const openFavoriteContextMenu = useCallback(
    (instanceId: string, favorite: FileManagerFavorite, anchorX: number, anchorY: number) => {
      const items: ContextMenuItem[] = [];
      if (isPathFavorite(favorite)) {
        items.push({
          id: `open-favorite-${favorite.id}`,
          label: labels.contextOpen,
          icon: <FolderUp size={14} />,
          onSelect: () => {
            void loadDirectory(instanceId, favorite.path);
          }
        });
      }
      items.push({
        id: `remove-favorite-${favorite.id}`,
        label: labels.removeFavorite,
        icon: <StarOff size={14} />,
        onSelect: () => {
          const state = statesRef.current[instanceId];
          if (state === undefined) {
            return;
          }
          void writeFavoritesForState(state, (currentFavorites) =>
            currentFavorites.filter((item) => item.id !== favorite.id)
          );
        }
      });
      contextMenuModel.openMenu({
        anchorX,
        anchorY,
        items
      });
    },
    [contextMenuModel, labels.contextOpen, labels.removeFavorite, loadDirectory, statesRef, writeFavoritesForState]
  );

  const openLocationContextMenu = useCallback(
    (instanceId: string, location: FileManagerLocation, anchorX: number, anchorY: number) => {
      const state = statesRef.current[instanceId];
      const items: ContextMenuItem[] = [
        {
          id: `open-location-${location.id}`,
          label: labels.contextOpen,
          icon: <FolderUp size={14} />,
          onSelect: () => {
            void openLocation(instanceId, location);
          }
        }
      ];

      if (state !== undefined && canFavoriteLocation(location)) {
        const favoriteActive = isFavoritePath(state.favorites, location.path);
        items.push({
          id: `toggle-location-favorite-${location.id}`,
          label: favoriteActive ? labels.removeFavorite : labels.addFavorite,
          icon: favoriteActive ? <StarOff size={14} /> : <Star size={14} />,
          onSelect: () => {
            void toggleFavoriteForLocation(instanceId, location);
          }
        });
      }

      contextMenuModel.openMenu({
        anchorX,
        anchorY,
        items
      });
    },
    [
      contextMenuModel,
      isFavoritePath,
      labels.addFavorite,
      labels.contextOpen,
      labels.removeFavorite,
      openLocation,
      statesRef,
      toggleFavoriteForLocation
    ]
  );

  const openRecentLocationContextMenu = useCallback(
    (instanceId: string, recent: FileManagerRecentLocation, anchorX: number, anchorY: number) => {
      const location: FileManagerLocation = {
        id: recent.id,
        title: recent.title,
        kind: "directory",
        path: recent.path
      };
      openLocationContextMenu(instanceId, location, anchorX, anchorY);
    },
    [openLocationContextMenu]
  );

  const openDiskContextMenu = useCallback((instanceId: string, disk: FileManagerDisk, anchorX: number, anchorY: number) => {
    const items: ContextMenuItem[] = [
      {
        id: `open-disk-${disk.id}`,
        label: labels.contextOpen,
        icon: <FolderUp size={14} />,
        onSelect: () => {
          void loadDirectory(instanceId, disk.mountPath);
        }
      }
    ];

    if (disk.canEject) {
      items.push({
        id: `eject-disk-${disk.id}`,
        label: labels.contextEjectDevice,
        icon: <Unplug size={14} />,
        onSelect: () => {
          void ejectDisk(instanceId, disk);
        }
      });
    }

    contextMenuModel.openMenu({
      anchorX,
      anchorY,
      items
    });
  }, [contextMenuModel, ejectDisk, labels.contextEjectDevice, labels.contextOpen, loadDirectory]);

  const openDeviceContextMenu = useCallback((instanceId: string, device: FileManagerDevice, anchorX: number, anchorY: number) => {
    const items: ContextMenuItem[] = [];

    if (device.canMount) {
      items.push({
        id: `mount-device-${device.id}`,
        label: labels.contextMountDevice,
        icon: <HardDriveDownload size={14} />,
        onSelect: () => {
          void mountDevice(instanceId, device);
        }
      });
    }

    if (device.canEject) {
      items.push({
        id: `eject-device-${device.id}`,
        label: labels.contextEjectDevice,
        icon: <Unplug size={14} />,
        onSelect: () => {
          void ejectDevice(instanceId, device);
        }
      });
    }

    if (items.length === 0) {
      return;
    }

    contextMenuModel.openMenu({
      anchorX,
      anchorY,
      items
    });
  }, [contextMenuModel, ejectDevice, labels.contextEjectDevice, labels.contextMountDevice, mountDevice]);

  const openEntryContextMenu = useCallback((instanceId: string, entryId: string, anchorX: number, anchorY: number) => {
    const state = statesRef.current[instanceId];
    const entry = state?.entries.find((item) => item.id === entryId);
    if (entry === undefined) {
      return;
    }
    const selectedIds = state?.selectedEntryIds ?? [];
    const preservesSelection = selectedIds.includes(entryId);
    if (!preservesSelection) {
      selectEntry(instanceId, entryId);
    }
    const trashTargets = preservesSelection && state !== undefined
      ? state.entries.filter((item) => selectedIds.includes(item.id))
      : [entry];
    contextMenuModel.openMenu({
      anchorX,
      anchorY,
      items: [
        ...(entry.kind === "directory"
          ? [{
              id: `open-${entry.id}`,
              label: labels.contextOpen,
              icon: <FolderUp size={14} />,
              onSelect: () => {
                void loadDirectory(instanceId, entry.path);
              }
            }]
          : []),
        ...(entry.kind === "directory" && onOpenTerminal !== undefined
          ? [{
              id: `terminal-${entry.id}`,
              label: labels.contextOpenInTerminal,
              icon: <SquareTerminal size={14} />,
              onSelect: () => {
                onOpenTerminal(entry.path);
              }
            }]
          : []),
        ...(entry.kind === "directory"
          ? [{
              id: `favorite-${entry.id}`,
              label: isFavoritePath(state?.favorites ?? [], entry.path)
                ? labels.removeFavorite
                : labels.addFavorite,
              icon: isFavoritePath(state?.favorites ?? [], entry.path)
                ? <StarOff size={14} />
                : <Star size={14} />,
              onSelect: () => {
                void toggleFavoriteForLocation(instanceId, {
                  title: entry.name,
                  path: entry.path
                });
              }
            }]
          : []),
        {
          id: `trash-${entry.id}`,
          label: labels.contextMoveToTrash,
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            if (desktopApi === null) {
              return;
            }
            void desktopApi.files.moveToTrash({
              paths: trashTargets.map((target) => target.path)
            }).then(() => refresh(instanceId));
          }
        }
      ]
    });
  }, [
    contextMenuModel,
    desktopApi,
    isFavoritePath,
    labels.addFavorite,
    labels.contextMoveToTrash,
    labels.contextOpen,
    labels.contextOpenInTerminal,
    labels.removeFavorite,
    loadDirectory,
    onOpenTerminal,
    refresh,
    selectEntry,
    statesRef,
    toggleFavoriteForLocation
  ]);

  const openTrashEntryContextMenu = useCallback((instanceId: string, entryId: string, anchorX: number, anchorY: number) => {
    const state = statesRef.current[instanceId];
    const entry = state?.trashEntries.find((item) => item.id === entryId);
    if (entry === undefined) {
      return;
    }
    selectTrashEntry(instanceId, entryId);
    contextMenuModel.openMenu({
      anchorX,
      anchorY,
      items: [
        {
          id: `restore-${entry.id}`,
          label: labels.contextRestore,
          icon: <RotateCcw size={14} />,
          onSelect: () => {
            if (desktopApi === null) {
              return;
            }
            void desktopApi.files.restoreFromTrash({ itemIds: [entry.id] }).then(() => loadTrash(instanceId, false));
          }
        },
        {
          id: `empty-trash-${entry.id}`,
          label: labels.contextEmptyTrash,
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            if (desktopApi === null) {
              return;
            }
            void desktopApi.files.emptyTrash().then(() => loadTrash(instanceId, false));
          }
        }
      ]
    });
  }, [contextMenuModel, desktopApi, labels.contextEmptyTrash, labels.contextRestore, loadTrash, selectTrashEntry, statesRef]);

  const openTrashContextMenu = useCallback((instanceId: string, anchorX: number, anchorY: number) => {
    contextMenuModel.openMenu({
      anchorX,
      anchorY,
      items: [
        {
          id: `refresh-trash-${instanceId}`,
          label: labels.refresh,
          icon: <RefreshCw size={14} />,
          onSelect: () => {
            void loadTrash(instanceId, false);
          }
        },
        {
          id: `empty-trash-${instanceId}`,
          label: labels.contextEmptyTrash,
          icon: <Trash2 size={14} />,
          danger: true,
          onSelect: () => {
            void emptyTrash(instanceId);
          }
        }
      ]
    });
  }, [contextMenuModel, emptyTrash, labels.contextEmptyTrash, labels.refresh, loadTrash]);

  const openDirectoryContextMenu = useCallback((instanceId: string, anchorX: number, anchorY: number) => {
    const currentPath = statesRef.current[instanceId]?.currentLocation?.path;
    contextMenuModel.openMenu({
      anchorX,
      anchorY,
      items: [
        {
          id: `new-folder-${instanceId}`,
          label: labels.newFolder,
          icon: <FolderPlus size={14} />,
          onSelect: () => {
            beginCreateDraft(instanceId, "directory");
          }
        },
        {
          id: `new-file-${instanceId}`,
          label: labels.newFile,
          icon: <FilePlus2 size={14} />,
          onSelect: () => {
            beginCreateDraft(instanceId, "file");
          }
        },
        ...(onOpenTerminal !== undefined && currentPath !== undefined
          ? [{
              id: `terminal-${instanceId}`,
              label: labels.contextOpenInTerminal,
              icon: <SquareTerminal size={14} />,
              onSelect: () => {
                onOpenTerminal(currentPath);
              }
            }]
          : []),
        {
          id: `refresh-${instanceId}`,
          label: labels.refresh,
          icon: <RefreshCw size={14} />,
          onSelect: () => {
            void refresh(instanceId);
          }
        },
        {
          id: `toggle-favorite-${instanceId}`,
          label: (() => {
            const state = statesRef.current[instanceId];
            const currentLocation = state?.currentLocation ?? null;
            if (state === undefined || currentLocation === null || isDirectoryLocation(currentLocation) === false) {
              return labels.addFavorite;
            }
            return isFavoritePath(state.favorites, currentLocation.path)
              ? labels.removeFavorite
              : labels.addFavorite;
          })(),
          icon: (() => {
            const state = statesRef.current[instanceId];
            const currentLocation = state?.currentLocation ?? null;
            if (state === undefined || currentLocation === null || isDirectoryLocation(currentLocation) === false) {
              return <Star size={14} />;
            }
            return isFavoritePath(state.favorites, currentLocation.path)
              ? <StarOff size={14} />
              : <Star size={14} />;
          })(),
          disabled: (() => {
            const state = statesRef.current[instanceId];
            return isDirectoryLocation(state?.currentLocation ?? null) === false;
          })(),
          onSelect: () => {
            void toggleCurrentDirectoryFavorite(instanceId);
          }
        }
      ]
    });
  }, [
    beginCreateDraft,
    contextMenuModel,
    isFavoritePath,
    labels.addFavorite,
    labels.newFile,
    labels.newFolder,
    labels.contextOpenInTerminal,
    labels.refresh,
    labels.removeFavorite,
    onOpenTerminal,
    refresh,
    statesRef,
    toggleCurrentDirectoryFavorite
  ]);

  return {
    openDiskContextMenu,
    openDeviceContextMenu,
    openEntryContextMenu,
    openFavoriteContextMenu,
    openLocationContextMenu,
    openRecentLocationContextMenu,
    openTrashEntryContextMenu,
    openDirectoryContextMenu,
    openTrashContextMenu
  };
};

type FileManagerStateFavoriteWriter = (
  state: FileManagerAppState,
  updater: (current: readonly FileManagerFavorite[]) => readonly FileManagerFavorite[]
) => Promise<void>;
