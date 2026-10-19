import {
  useCallback,
  useEffect
} from "react";

import type {
  FileManagerFavorite,
  FileManagerLocation,
  FileManagerRecentLocation
} from "../../../shared/file-manager";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type {
  FileManagerAppIconKey,
  FileManagerAppState,
  FileManagerSurfaceLabels
} from "./types";
import { isSameLocationPath, optionalFileManagerPath, fileManagerTabFilePath } from "./location-utils";
import {
  applyDirectoryPatchToState,
  buildDirectoryState,
  buildHomeState,
  buildTrashState,
  canFavoriteLocation,
  createId,
  directoryResponseFromSnapshot,
  isDirectoryLocation,
  isPathFavorite,
  mergeRecentLocations,
  resolveFavorites
} from "./state-model";
import type { FileManagerStateStore } from "./state-store";

type FileManagerAppMeta = {
  readonly appId: "file-manager";
  readonly appInstanceId: string;
  readonly title: string;
  readonly iconKey: FileManagerAppIconKey;
  readonly filePath: string;
};

export type FileManagerLocationController = {
  readonly loadHome: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly loadDirectory: (instanceId: string, path: string, addToHistory?: boolean) => Promise<void>;
  readonly loadTrash: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly openLocation: (
    instanceId: string,
    location: FileManagerLocation,
    addToHistory?: boolean
  ) => Promise<void>;
  readonly goBack: (instanceId: string) => Promise<void>;
  readonly goForward: (instanceId: string) => Promise<void>;
  readonly goUp: (instanceId: string) => Promise<void>;
  readonly refresh: (instanceId: string) => Promise<void>;
  readonly isFavoritePath: (
    favorites: readonly FileManagerFavorite[],
    path: string | undefined
  ) => boolean;
  readonly writeFavoritesForState: (
    state: FileManagerAppState,
    updater: (current: readonly FileManagerFavorite[]) => readonly FileManagerFavorite[]
  ) => Promise<void>;
  readonly toggleFavoriteForLocation: (
    instanceId: string,
    location: {
      readonly title: string;
      readonly path?: string;
      readonly specialId?: string;
    }
  ) => Promise<void>;
  readonly toggleCurrentDirectoryFavorite: (instanceId: string) => Promise<void>;
};

export const useFileManagerLocationController = ({
  desktopApi,
  labels,
  platform,
  store,
  loadDownloads,
  onMetaChange,
  unsubscribeDirectory,
  unsubscribeDirectoryForInstance
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly labels: FileManagerSurfaceLabels;
  readonly platform: NodeJS.Platform | null;
  readonly store: FileManagerStateStore;
  readonly loadDownloads: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly onMetaChange: (request: FileManagerAppMeta) => void;
  readonly unsubscribeDirectory: (subscriptionId: string | undefined) => void;
  readonly unsubscribeDirectoryForInstance: (instanceId: string) => void;
}): FileManagerLocationController => {
  const {
    statesRef,
    createState,
    updateStates,
    patchState,
    replaceState
  } = store;

  useEffect(() => {
    if (desktopApi?.files.onDirectoryPatch === undefined) {
      return undefined;
    }
    return desktopApi.files.onDirectoryPatch((patch) => {
      updateStates((current) => {
        const match = Object.entries(current).find(
          ([, state]) => state.directorySubscriptionId === patch.subscriptionId
        );
        if (match === undefined) {
          return current;
        }
        const [instanceId, state] = match;
        const nextState = applyDirectoryPatchToState(state, patch, labels);
        if (nextState === state) {
          return current;
        }
        onMetaChange({
          appId: "file-manager",
          appInstanceId: instanceId,
          title: nextState.title,
          iconKey: nextState.iconKey,
          filePath: fileManagerTabFilePath(nextState)
        });
        return {
          ...current,
          [instanceId]: nextState
        };
      });
    });
  }, [desktopApi, labels, onMetaChange, updateStates]);

  useEffect(
    () => () => {
      for (const state of Object.values(statesRef.current)) {
        unsubscribeDirectory(state.directorySubscriptionId);
      }
    },
    [statesRef, unsubscribeDirectory]
  );

  const isFavoritePath = useCallback(
    (favorites: readonly FileManagerFavorite[], path: string | undefined) => {
      if (path === undefined) {
        return false;
      }

      return favorites.some((item) =>
        isPathFavorite(item) && isSameLocationPath(item.path, path, platform)
      );
    },
    [platform]
  );

  const broadcastFavorites = useCallback((favorites: readonly FileManagerFavorite[]) => {
    updateStates((current) => Object.fromEntries(
      Object.entries(current).map(([instanceId, state]) => [instanceId, { ...state, favorites }])
    ));
  }, [updateStates]);

  const broadcastRecentLocations = useCallback((recentLocations: readonly FileManagerRecentLocation[]) => {
    updateStates((current) => Object.fromEntries(
      Object.entries(current).map(([instanceId, state]) => [instanceId, { ...state, recentLocations }])
    ));
  }, [updateStates]);

  const writeFavoritesForState = useCallback(
    async (
      state: FileManagerAppState,
      updater: (current: readonly FileManagerFavorite[]) => readonly FileManagerFavorite[]
    ) => {
      if (desktopApi === null) {
        return;
      }

      const nextFavorites = resolveFavorites(updater(state.favorites), labels);
      await desktopApi.files.writeFavorites({ favorites: nextFavorites });
      broadcastFavorites(nextFavorites);
    },
    [broadcastFavorites, desktopApi, labels]
  );

  const loadHome = useCallback(async (instanceId: string, addToHistory = true) => {
    if (desktopApi === null) {
      replaceState(instanceId, {
        ...createState(instanceId),
        status: "error",
        errorMessage: labels.unavailable
      });
      return;
    }

    unsubscribeDirectoryForInstance(instanceId);
    patchState(instanceId, (state) => ({ ...state, status: "loading", errorMessage: undefined }));
    try {
      const payload = await desktopApi.files.readHome();
      const current = statesRef.current[instanceId] ?? createState(instanceId);
      replaceState(instanceId, buildHomeState(current, payload, labels, addToHistory));
    } catch (error) {
      patchState(instanceId, (state) => ({
        ...state,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [
    createState,
    desktopApi,
    labels,
    patchState,
    replaceState,
    statesRef,
    unsubscribeDirectoryForInstance
  ]);

  const loadDirectory = useCallback(async (instanceId: string, path: string, addToHistory = true) => {
    if (desktopApi === null) {
      replaceState(instanceId, {
        ...createState(instanceId),
        status: "error",
        errorMessage: labels.unavailable
      });
      return;
    }

    unsubscribeDirectoryForInstance(instanceId);
    patchState(instanceId, (state) => ({ ...state, status: "loading", errorMessage: undefined }));
    try {
      const subscription = await desktopApi.files.subscribeDirectory?.({ path });
      const payload = subscription === undefined
        ? await desktopApi.files.readDirectory({ path })
        : directoryResponseFromSnapshot(subscription.snapshot);
      const current = statesRef.current[instanceId] ?? createState(instanceId);
      const nextState = buildDirectoryState(
        current,
        payload,
        labels,
        addToHistory,
        subscription === undefined
          ? undefined
          : {
              subscriptionId: subscription.subscriptionId,
              generation: subscription.snapshot.generation
            }
      );
      replaceState(instanceId, nextState);

      const nextRecentLocations = mergeRecentLocations(current.recentLocations, payload.location);
      void desktopApi.files.writeRecentLocations({ recentLocations: nextRecentLocations })
        .then((payload) => {
          broadcastRecentLocations(payload.recentLocations);
        })
        .catch(() => undefined);
    } catch (error) {
      patchState(instanceId, (state) => ({
        ...state,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [
    broadcastRecentLocations,
    createState,
    desktopApi,
    labels,
    patchState,
    replaceState,
    statesRef,
    unsubscribeDirectoryForInstance
  ]);

  const loadTrash = useCallback(async (instanceId: string, addToHistory = true) => {
    if (desktopApi === null) {
      replaceState(instanceId, {
        ...createState(instanceId),
        status: "error",
        errorMessage: labels.unavailable
      });
      return;
    }

    unsubscribeDirectoryForInstance(instanceId);
    patchState(instanceId, (state) => ({ ...state, status: "loading", errorMessage: undefined }));
    try {
      const payload = await desktopApi.files.readTrash();
      const current = statesRef.current[instanceId] ?? createState(instanceId);
      replaceState(instanceId, buildTrashState(current, payload, labels, addToHistory));
    } catch (error) {
      patchState(instanceId, (state) => ({
        ...state,
        status: "error",
        errorMessage: error instanceof Error ? error.message : String(error)
      }));
    }
  }, [
    createState,
    desktopApi,
    labels,
    patchState,
    replaceState,
    statesRef,
    unsubscribeDirectoryForInstance
  ]);

  const openLocation = useCallback(async (instanceId: string, location: FileManagerLocation, addToHistory = true) => {
    if (location.kind === "home") {
      await loadHome(instanceId, addToHistory);
      return;
    }
    if (location.kind === "trash" || location.specialId === "trash") {
      await loadTrash(instanceId, addToHistory);
      return;
    }
    if (location.specialId === "downloadManager") {
      await loadDownloads(instanceId, addToHistory);
      return;
    }
    const path = optionalFileManagerPath(location.path);
    if (path !== undefined) {
      await loadDirectory(instanceId, path, addToHistory);
    }
  }, [loadDirectory, loadDownloads, loadHome, loadTrash]);

  const goBack = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    if (state === undefined || state.historyIndex <= 0) {
      return;
    }
    const target = state.history[state.historyIndex - 1];
    if (target === undefined) {
      return;
    }
    patchState(instanceId, (current) => ({ ...current, historyIndex: current.historyIndex - 1 }));
    await openLocation(instanceId, target, false);
  }, [openLocation, patchState, statesRef]);

  const goForward = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    if (state === undefined || state.historyIndex >= state.history.length - 1) {
      return;
    }
    const target = state.history[state.historyIndex + 1];
    if (target === undefined) {
      return;
    }
    patchState(instanceId, (current) => ({ ...current, historyIndex: current.historyIndex + 1 }));
    await openLocation(instanceId, target, false);
  }, [openLocation, patchState, statesRef]);

  const goUp = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    if (state?.parentPath === undefined) {
      return;
    }
    await loadDirectory(instanceId, state.parentPath);
  }, [loadDirectory, statesRef]);

  const refresh = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    if (state?.viewKind === "downloads") {
      await loadDownloads(instanceId, false);
      return;
    }
    if (state === undefined || state.currentLocation === null) {
      await loadHome(instanceId, false);
      return;
    }
    await openLocation(instanceId, state.currentLocation, false);
  }, [loadDownloads, loadHome, openLocation, statesRef]);

  const toggleFavoriteForLocation = useCallback(
    async (
      instanceId: string,
      location: {
        readonly title: string;
        readonly path?: string;
        readonly specialId?: string;
      }
    ) => {
      const initialState = statesRef.current[instanceId];
      if (initialState === undefined || canFavoriteLocation(location) === false) {
        return;
      }

      const state = statesRef.current[instanceId] ?? initialState;
      await writeFavoritesForState(state, (currentFavorites) => {
        const exists = isFavoritePath(currentFavorites, location.path);
        if (exists) {
          return currentFavorites.filter((item) =>
            isPathFavorite(item) === false
            || isSameLocationPath(item.path, location.path, platform) === false
          );
        }

        const nextFavorite: FileManagerFavorite =
          location.specialId !== undefined
            ? {
                id: createId("favorite"),
                title: location.title,
                path: location.path,
                kind: "path",
                specialId:
                  location.specialId as Exclude<
                    FileManagerFavorite["specialId"],
                    undefined
                  >
              }
            : {
                id: createId("favorite"),
                title: location.title,
                path: location.path,
                kind: "path"
              };

        return [
          nextFavorite,
          ...currentFavorites
        ];
      });
    },
    [isFavoritePath, platform, statesRef, writeFavoritesForState]
  );

  const toggleCurrentDirectoryFavorite = useCallback(async (instanceId: string) => {
    const state = statesRef.current[instanceId];
    const currentLocation = state?.currentLocation ?? null;
    if (state === undefined || currentLocation === null || isDirectoryLocation(currentLocation) === false) {
      return;
    }
    await toggleFavoriteForLocation(instanceId, currentLocation);
  }, [statesRef, toggleFavoriteForLocation]);

  return {
    loadHome,
    loadDirectory,
    loadTrash,
    openLocation,
    goBack,
    goForward,
    goUp,
    refresh,
    isFavoritePath,
    writeFavoritesForState,
    toggleFavoriteForLocation,
    toggleCurrentDirectoryFavorite
  };
};
