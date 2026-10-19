import type {
  FileManagerDirectoryPatch,
  FileManagerDirectorySnapshot,
  FileManagerEntry,
  FileManagerFavorite,
  FileManagerLocation,
  FileManagerReadDirectoryResponse,
  FileManagerReadHomeResponse,
  FileManagerReadTrashResponse,
  FileManagerRecentLocation,
  FileManagerTrashEntry
} from "../../../shared/file-manager";
import type { DownloadManagerTask } from "../../../shared/download-manager";
import type {
  FileManagerAppState,
  FileManagerSurfaceLabels
} from "./types";
import {
  normalizeFileManagerLocation,
  optionalFileManagerPath,
  resolveLocationTitle,
  withResolvedLocationTitle
} from "./location-utils";

const MAX_RECENT_LOCATIONS = 12;

export const createId = (prefix: string): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
};

export const createInitialState = (
  instanceId: string,
  labels: FileManagerSurfaceLabels,
  downloads?: {
    readonly tasks: readonly DownloadManagerTask[];
    readonly status: FileManagerAppState["downloadStatus"];
    readonly errorMessage: string | undefined;
  }
): FileManagerAppState => ({
  instanceId,
  status: "idle",
  viewKind: "home",
  presentationMode: "list",
  title: labels.title,
  iconKey: "file-manager-home",
  currentLocation: null,
  parentPath: undefined,
  history: [],
  historyIndex: -1,
  systemLocations: [],
  favorites: [],
  recentLocations: [],
  hostInfo: null,
  disks: [],
  devices: [],
  entries: [],
  trashEntries: [],
  downloadTasks: downloads?.tasks ?? [],
  downloadStatus: downloads?.status ?? "idle",
  downloadUrlDraft: "",
  downloadErrorMessage: downloads?.errorMessage,
  directorySubscriptionId: undefined,
  directoryGeneration: undefined,
  selectedEntryIds: [],
  selectionAnchorId: undefined,
  selectedTrashEntryId: undefined,
  createDraft: undefined,
  errorMessage: undefined
});

export const deriveDirectoryIconKey = (entries: readonly FileManagerEntry[]) =>
  entries.some((entry) => entry.name.length > 0)
    ? "file-manager-directory-non-empty"
    : "file-manager-directory-empty";

export const resolveFavorites = (
  favorites: readonly FileManagerFavorite[],
  labels: FileManagerSurfaceLabels
): readonly FileManagerFavorite[] =>
  favorites.map((favorite) =>
    isPathFavorite(favorite)
      ? withResolvedLocationTitle(favorite, labels)
      : favorite
  );

export const isPathFavorite = (
  favorite: Pick<FileManagerFavorite, "kind">
): boolean => favorite.kind !== "web" && favorite.kind !== "agent-session";

export const resolveRecentLocations = (
  recentLocations: readonly FileManagerRecentLocation[],
  labels: FileManagerSurfaceLabels
): readonly FileManagerRecentLocation[] =>
  recentLocations.map((recent) => withResolvedLocationTitle(recent, labels));

export const resolveSystemLocations = (
  systemLocations: readonly FileManagerLocation[],
  labels: FileManagerSurfaceLabels
): readonly FileManagerLocation[] =>
  systemLocations.map((location) =>
    withResolvedLocationTitle(normalizeFileManagerLocation(location), labels)
  );

export const withHistory = (
  state: FileManagerAppState,
  location: FileManagerLocation,
  addToHistory: boolean
): Pick<FileManagerAppState, "history" | "historyIndex"> => {
  if (addToHistory === false) {
    return {
      history: state.history,
      historyIndex: state.historyIndex
    };
  }

  const head = state.history.slice(0, state.historyIndex + 1);
  const last = head[head.length - 1];
  if (last?.id === location.id) {
    return {
      history: head,
      historyIndex: head.length - 1
    };
  }

  const nextHistory = [...head, location];
  return {
    history: nextHistory,
    historyIndex: nextHistory.length - 1
  };
};

export const mergeRecentLocations = (
  current: readonly FileManagerRecentLocation[],
  location: FileManagerLocation
): readonly FileManagerRecentLocation[] => {
  const path = optionalFileManagerPath(location.path);
  if (path === undefined) {
    return current;
  }

  const nextItem: FileManagerRecentLocation = {
    id: location.id,
    title: location.title,
    path,
    lastOpenedAt: new Date().toISOString()
  };

  const deduped = current.filter((item) => item.path !== nextItem.path);
  return [nextItem, ...deduped].slice(0, MAX_RECENT_LOCATIONS);
};

export const findSelectedEntry = (
  state: FileManagerAppState
): FileManagerEntry | null => {
  const selectedEntryId = state.selectedEntryIds[state.selectedEntryIds.length - 1];
  if (selectedEntryId === undefined) {
    return null;
  }
  return state.entries.find((entry) => entry.id === selectedEntryId) ?? null;
};

export const findSelectedEntries = (
  state: FileManagerAppState
): readonly FileManagerEntry[] =>
  state.selectedEntryIds.flatMap((entryId) => {
    const entry = state.entries.find((item) => item.id === entryId);
    return entry === undefined ? [] : [entry];
  });

export const findSelectedTrashEntry = (
  state: FileManagerAppState
): FileManagerTrashEntry | null => {
  if (state.selectedTrashEntryId === undefined) {
    return null;
  }
  return state.trashEntries.find((entry) => entry.id === state.selectedTrashEntryId) ?? null;
};

const compareDirectoryEntries = (
  left: FileManagerEntry,
  right: FileManagerEntry
): number => {
  if (left.kind === "directory" && right.kind === "file") {
    return -1;
  }
  if (left.kind === "file" && right.kind === "directory") {
    return 1;
  }
  return left.name.toLowerCase().localeCompare(right.name.toLowerCase());
};

export const sortDirectoryEntries = (
  entries: readonly FileManagerEntry[]
): readonly FileManagerEntry[] => [...entries].sort(compareDirectoryEntries);

export const upsertDirectoryEntry = (
  entries: readonly FileManagerEntry[],
  entry: FileManagerEntry
): readonly FileManagerEntry[] => {
  const next = entries.filter((item) => item.path !== entry.path);
  next.push(entry);
  return sortDirectoryEntries(next);
};

export const directoryResponseFromSnapshot = (
  snapshot: FileManagerDirectorySnapshot
): FileManagerReadDirectoryResponse => ({
  location: snapshot.location,
  ...(snapshot.parentPath === undefined ? {} : { parentPath: snapshot.parentPath }),
  entries: snapshot.entries
});

export const isDirectoryLocation = (location: FileManagerLocation | null): boolean =>
  location?.kind === "directory"
  || (location?.kind === "special" && optionalFileManagerPath(location.path) !== undefined);

export const canFavoriteLocation = (location: {
  readonly path?: string | null;
  readonly specialId?: string | null;
}): location is { readonly path: string; readonly specialId?: string } =>
  optionalFileManagerPath(location.path) !== undefined && location.specialId !== "trash";

export const normalizeComparablePath = (
  value: string,
  platform: NodeJS.Platform | null
): string => {
  const normalized = value.replaceAll("\\", "/");
  return platform === "win32" || platform === "darwin"
    ? normalized.toLowerCase()
    : normalized;
};

export const isPathInsideMount = (
  candidatePath: string | undefined,
  mountPath: string,
  platform: NodeJS.Platform | null
): boolean => {
  if (candidatePath === undefined) {
    return false;
  }

  const normalizedCandidate = normalizeComparablePath(candidatePath, platform);
  const normalizedMount = normalizeComparablePath(mountPath, platform);
  return normalizedCandidate === normalizedMount
    || normalizedCandidate.startsWith(`${normalizedMount}/`);
};

export const buildHomeState = (
  current: FileManagerAppState,
  payload: FileManagerReadHomeResponse,
  labels: FileManagerSurfaceLabels,
  addToHistory: boolean
): FileManagerAppState => {
  const location = normalizeFileManagerLocation(payload.location);
  return {
    ...current,
    status: "ready",
    viewKind: "home",
    title: labels.title,
    iconKey: "file-manager-home",
    currentLocation: location,
    ...withHistory(current, location, addToHistory),
    systemLocations: resolveSystemLocations(payload.systemLocations, labels),
    favorites: resolveFavorites(payload.favorites, labels),
    recentLocations: resolveRecentLocations(payload.recentLocations, labels),
    hostInfo: payload.hostInfo ?? null,
    disks: payload.disks,
    devices: payload.devices,
    entries: [],
    trashEntries: [],
    directorySubscriptionId: undefined,
    directoryGeneration: undefined,
    selectedEntryIds: [],
    selectionAnchorId: undefined,
    selectedTrashEntryId: undefined,
    createDraft: undefined,
    errorMessage: undefined
  };
};

export const buildDirectoryState = (
  current: FileManagerAppState,
  payload: FileManagerReadDirectoryResponse,
  labels: FileManagerSurfaceLabels,
  addToHistory: boolean,
  realtime?: {
    readonly subscriptionId?: string;
    readonly generation?: number;
  }
): FileManagerAppState => ({
  ...current,
  status: "ready",
  viewKind: "directory",
  title: resolveLocationTitle(payload.location, labels),
  iconKey: deriveDirectoryIconKey(payload.entries),
  currentLocation: withResolvedLocationTitle(payload.location, labels),
  parentPath: payload.parentPath,
  ...withHistory(current, payload.location, addToHistory),
  entries: sortDirectoryEntries(payload.entries),
  disks: [],
  devices: [],
  trashEntries: [],
  directorySubscriptionId: realtime?.subscriptionId,
  directoryGeneration: realtime?.generation,
  selectedEntryIds: [],
  selectionAnchorId: undefined,
  selectedTrashEntryId: undefined,
  createDraft: undefined,
  errorMessage: undefined
});

export const buildTrashState = (
  current: FileManagerAppState,
  payload: FileManagerReadTrashResponse,
  labels: FileManagerSurfaceLabels,
  addToHistory: boolean
): FileManagerAppState => ({
  ...current,
  status: "ready",
  viewKind: "trash",
  title: resolveLocationTitle(payload.location, labels),
  iconKey: "file-manager-trash",
  currentLocation: withResolvedLocationTitle(payload.location, labels),
  parentPath: undefined,
  ...withHistory(current, payload.location, addToHistory),
  entries: [],
  disks: [],
  devices: [],
  trashEntries: payload.entries,
  directorySubscriptionId: undefined,
  directoryGeneration: undefined,
  selectedEntryIds: [],
  selectionAnchorId: undefined,
  selectedTrashEntryId: undefined,
  createDraft: undefined,
  errorMessage: undefined
});

export const buildDownloadsState = (
  current: FileManagerAppState,
  labels: FileManagerSurfaceLabels,
  addToHistory: boolean
): FileManagerAppState => {
  const location: FileManagerLocation = {
    id: "download-manager",
    title: labels.downloadManagerTitle,
    kind: "special",
    specialId: "downloadManager"
  };
  return {
    ...current,
    status: "ready",
    viewKind: "downloads",
    title: labels.downloadManagerTitle,
    iconKey: "file-manager-download-manager",
    currentLocation: location,
    parentPath: undefined,
    ...withHistory(current, location, addToHistory),
    entries: [],
    disks: [],
    devices: [],
    trashEntries: [],
    directorySubscriptionId: undefined,
    directoryGeneration: undefined,
    selectedEntryIds: [],
    selectionAnchorId: undefined,
    selectedTrashEntryId: undefined,
    createDraft: undefined,
    errorMessage: undefined
  };
};

export const applyDirectoryPatchToState = (
  state: FileManagerAppState,
  patch: FileManagerDirectoryPatch,
  labels: FileManagerSurfaceLabels
): FileManagerAppState => {
  if (
    state.viewKind !== "directory"
    || state.directorySubscriptionId !== patch.subscriptionId
    || (
      state.directoryGeneration !== undefined
      && patch.generation < state.directoryGeneration
    )
  ) {
    return state;
  }

  if (patch.kind === "reset") {
    if (patch.snapshot === undefined) {
      return {
        ...state,
        status: patch.errorMessage === undefined ? state.status : "error",
        directoryGeneration: patch.generation,
        errorMessage: patch.errorMessage
      };
    }
    return {
      ...buildDirectoryState(
        state,
        directoryResponseFromSnapshot(patch.snapshot),
        labels,
        false,
        {
          subscriptionId: state.directorySubscriptionId,
          generation: patch.snapshot.generation
        }
      ),
      history: state.history,
      historyIndex: state.historyIndex
    };
  }

  if (patch.kind === "remove") {
    const removePath = patch.path ?? patch.oldPath;
    if (removePath === undefined) {
      return state;
    }
    const entries = state.entries.filter((entry) => entry.path !== removePath);
    const removedIds = new Set(
      state.entries.filter((entry) => entry.path === removePath).map((entry) => entry.id)
    );
    return {
      ...state,
      status: "ready",
      entries,
      iconKey: deriveDirectoryIconKey(entries),
      directoryGeneration: patch.generation,
      selectedEntryIds: state.selectedEntryIds.filter((id) => !removedIds.has(id)),
      selectionAnchorId:
        state.selectionAnchorId !== undefined && removedIds.has(state.selectionAnchorId)
          ? undefined
          : state.selectionAnchorId,
      errorMessage: undefined
    };
  }

  if (patch.kind === "rename") {
    const removePath = patch.oldPath;
    const entry = patch.entry;
    if (removePath === undefined || entry === undefined) {
      return state;
    }
    const entries = upsertDirectoryEntry(
      state.entries.filter((item) => item.path !== removePath),
      entry
    );
    const renamedId = state.entries.find((item) => item.path === removePath)?.id;
    return {
      ...state,
      status: "ready",
      entries,
      iconKey: deriveDirectoryIconKey(entries),
      directoryGeneration: patch.generation,
      selectedEntryIds: state.selectedEntryIds.map((id) =>
        id === renamedId ? entry.id : id
      ),
      selectionAnchorId:
        state.selectionAnchorId === renamedId ? entry.id : state.selectionAnchorId,
      errorMessage: undefined
    };
  }

  if (patch.entry === undefined) {
    return state;
  }

  const entries = upsertDirectoryEntry(state.entries, patch.entry);
  return {
    ...state,
    status: "ready",
    entries,
    iconKey: deriveDirectoryIconKey(entries),
    directoryGeneration: patch.generation,
    errorMessage: undefined
  };
};
