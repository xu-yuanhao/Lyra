import { useCallback } from "react";

import type {
  FileManagerDevice,
  FileManagerDisk
} from "../../../shared/file-manager";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type { FileManagerPresentationMode, FileManagerSelectionMode } from "./types";
import {
  findSelectedEntries,
  findSelectedTrashEntry,
  isPathInsideMount
} from "./state-model";
import type { FileManagerStateStore } from "./state-store";

export type FileManagerFileActionsController = {
  readonly setPresentationMode: (instanceId: string, mode: FileManagerPresentationMode) => void;
  readonly selectEntry: (
    instanceId: string,
    entryId: string,
    mode?: FileManagerSelectionMode
  ) => void;
  readonly selectTrashEntry: (instanceId: string, entryId: string) => void;
  readonly beginCreateDraft: (instanceId: string, kind: "file" | "directory") => void;
  readonly updateCreateDraft: (instanceId: string, value: string) => void;
  readonly cancelCreateDraft: (instanceId: string) => void;
  readonly commitCreateDraft: (instanceId: string) => Promise<void>;
  readonly moveSelectionToTrash: (instanceId: string) => Promise<void>;
  readonly restoreSelectionFromTrash: (instanceId: string) => Promise<void>;
  readonly emptyTrash: (instanceId: string) => Promise<void>;
  readonly ejectDisk: (instanceId: string, disk: FileManagerDisk) => Promise<void>;
  readonly ejectDevice: (instanceId: string, device: FileManagerDevice) => Promise<void>;
  readonly mountDevice: (instanceId: string, device: FileManagerDevice) => Promise<void>;
};

export const useFileManagerFileActionsController = ({
  desktopApi,
  platform,
  store,
  loadHome,
  loadDirectory,
  loadTrash,
  refresh
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly platform: NodeJS.Platform | null;
  readonly store: FileManagerStateStore;
  readonly loadHome: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly loadDirectory: (instanceId: string, path: string, addToHistory?: boolean) => Promise<void>;
  readonly loadTrash: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly refresh: (instanceId: string) => Promise<void>;
}): FileManagerFileActionsController => {
  const {
    statesRef,
    patchState
  } = store;

  const setPresentationMode = useCallback((instanceId: string, mode: FileManagerPresentationMode) => {
    patchState(instanceId, (state) => ({
      ...state,
      presentationMode: mode
    }));
  }, [patchState]);

  const selectEntry = useCallback((
    instanceId: string,
    entryId: string,
    mode: FileManagerSelectionMode = "replace"
  ) => {
    patchState(instanceId, (state) => {
      const clickedIndex = state.entries.findIndex((entry) => entry.id === entryId);
      if (clickedIndex < 0) {
        return state;
      }

      if (mode === "toggle") {
        const selected = state.selectedEntryIds.includes(entryId);
        return {
          ...state,
          selectedEntryIds: selected
            ? state.selectedEntryIds.filter((id) => id !== entryId)
            : [...state.selectedEntryIds, entryId],
          selectionAnchorId: entryId,
          selectedTrashEntryId: undefined
        };
      }

      if (mode === "range" && state.selectionAnchorId !== undefined) {
        const anchorIndex = state.entries.findIndex(
          (entry) => entry.id === state.selectionAnchorId
        );
        if (anchorIndex >= 0) {
          const start = Math.min(anchorIndex, clickedIndex);
          const end = Math.max(anchorIndex, clickedIndex);
          return {
            ...state,
            selectedEntryIds: state.entries
              .slice(start, end + 1)
              .map((entry) => entry.id),
            selectedTrashEntryId: undefined
          };
        }
      }

      return {
        ...state,
        selectedEntryIds: [entryId],
        selectionAnchorId: entryId,
        selectedTrashEntryId: undefined
      };
    });
  }, [patchState]);

  const selectTrashEntry = useCallback((instanceId: string, entryId: string) => {
    patchState(instanceId, (state) => ({
      ...state,
      selectedTrashEntryId: entryId,
      selectedEntryIds: [],
      selectionAnchorId: undefined
    }));
  }, [patchState]);

  const beginCreateDraft = useCallback((instanceId: string, kind: "file" | "directory") => {
    patchState(instanceId, (state) => ({
      ...state,
      createDraft: {
        kind,
        value: ""
      }
    }));
  }, [patchState]);

  const updateCreateDraft = useCallback((instanceId: string, value: string) => {
    patchState(instanceId, (state) => {
      if (state.createDraft === undefined) {
        return state;
      }
      return {
        ...state,
        createDraft: {
          ...state.createDraft,
          value
        }
      };
    });
  }, [patchState]);

  const cancelCreateDraft = useCallback((instanceId: string) => {
    patchState(instanceId, (state) => ({
      ...state,
      createDraft: undefined
    }));
  }, [patchState]);

  const commitCreateDraft = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    if (desktopApi === null || state?.createDraft === undefined || state.currentLocation?.path === undefined) {
      return;
    }

    const name = state.createDraft.value.trim();
    if (name.length === 0) {
      return;
    }

    if (state.createDraft.kind === "directory") {
      await desktopApi.files.createFolder({
        parentPath: state.currentLocation.path,
        name
      });
    } else {
      await desktopApi.files.createFile({
        parentPath: state.currentLocation.path,
        name
      });
    }

    await loadDirectory(instanceId, state.currentLocation.path, false);
  }, [desktopApi, loadDirectory, statesRef]);

  const moveSelectionToTrash = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    const targets = state === undefined ? [] : findSelectedEntries(state);
    if (desktopApi === null || targets.length === 0) {
      return;
    }

    await desktopApi.files.moveToTrash({ paths: targets.map((target) => target.path) });
    await refresh(instanceId);
  }, [desktopApi, refresh, statesRef]);

  const restoreSelectionFromTrash = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    const target = state === undefined ? null : findSelectedTrashEntry(state);
    if (desktopApi === null || target === null) {
      return;
    }

    await desktopApi.files.restoreFromTrash({ itemIds: [target.id] });
    await loadTrash(instanceId, false);
  }, [desktopApi, loadTrash, statesRef]);

  const emptyTrash = useCallback(async (instanceId: string) => {
    if (desktopApi === null) {
      return;
    }
    await desktopApi.files.emptyTrash();
    await loadTrash(instanceId, false);
  }, [desktopApi, loadTrash]);

  const refreshAfterDeviceEject = useCallback(async (mountPath: string) => {
    const snapshot = Object.values(statesRef.current);
    await Promise.all(
      snapshot.map(async (state) => {
        if (state.viewKind === "home") {
          await loadHome(state.instanceId, false);
          return;
        }

        if (isPathInsideMount(state.currentLocation?.path, mountPath, platform)) {
          await loadHome(state.instanceId, false);
        }
      })
    );
  }, [loadHome, platform, statesRef]);

  const ejectDisk = useCallback(async (instanceId: string, disk: FileManagerDisk) => {
    if (desktopApi === null || disk.canEject === false) {
      return;
    }

    const request = {
      mountPath: disk.mountPath,
      kind: disk.kind
    } as const;
    await desktopApi.files.ejectDevice(
      disk.devicePath === undefined
        ? request
        : {
            ...request,
            devicePath: disk.devicePath
          }
    );
    await refreshAfterDeviceEject(disk.mountPath);

    const currentState = statesRef.current[instanceId];
    if (currentState !== undefined && currentState.viewKind !== "home") {
      await loadHome(instanceId, false);
    }
  }, [desktopApi, loadHome, refreshAfterDeviceEject, statesRef]);

  const ejectDevice = useCallback(async (instanceId: string, device: FileManagerDevice) => {
    if (desktopApi === null || device.canEject === false) {
      return;
    }

    await desktopApi.files.ejectDevice({
      mountPath: device.devicePath,
      devicePath: device.devicePath,
      kind: device.kind
    });
    await refreshAfterDeviceEject(device.devicePath);

    const currentState = statesRef.current[instanceId];
    if (currentState !== undefined && currentState.viewKind !== "home") {
      await loadHome(instanceId, false);
    }
  }, [desktopApi, loadHome, refreshAfterDeviceEject, statesRef]);

  const mountDevice = useCallback(async (instanceId: string, device: FileManagerDevice) => {
    if (desktopApi === null || device.canMount === false) {
      return;
    }

    const result = await desktopApi.files.mountDevice({
      devicePath: device.devicePath,
      kind: device.kind
    });
    await loadHome(instanceId, false);

    if (result.mountPath !== undefined && result.mountPath.length > 0) {
      await loadDirectory(instanceId, result.mountPath, false);
    }
  }, [desktopApi, loadDirectory, loadHome]);

  return {
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
    ejectDisk,
    ejectDevice,
    mountDevice
  };
};
