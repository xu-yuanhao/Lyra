import type {
  FileManagerDevice,
  FileManagerDisk,
  FileManagerDiskKind,
  FileManagerEntry,
  FileManagerFavorite,
  FileManagerLocation,
  FileManagerRecentLocation,
  FileManagerTrashEntry
} from "../../../shared/file-manager";
import { resolveFileManagerOsBrandAsset } from "./disk-brand-assets";
import type { DownloadManagerTask } from "../../../shared/download-manager";
import { isImageViewerSupportedPath } from "../image-viewer";
import { optionalFileManagerPath } from "./location-utils";
import { findSelectedEntry, isPathFavorite } from "./state-model";
import type {
  FileManagerAppState,
  FileManagerChooserMode,
  FileManagerSurfaceLabels
} from "./types";

export type FileManagerSkeletonMetrics = {
  readonly favoritesCount: number;
  readonly locationsCount: number;
  readonly devicesCount: number;
  readonly recentCount: number;
  readonly directoryEntriesCount: number;
  readonly trashEntriesCount: number;
};

export type FileManagerSkeletonSlots = {
  readonly favoriteSlots: readonly number[];
  readonly locationSlots: readonly number[];
  readonly deviceSlots: readonly number[];
  readonly recentSlots: readonly number[];
  readonly directoryListSlots: readonly number[];
  readonly trashListSlots: readonly number[];
  readonly directoryLargeSlots: readonly number[];
  readonly trashLargeSlots: readonly number[];
};

export type FileManagerBreadcrumbPart = {
  readonly id: string;
  readonly title: string;
  readonly path: string;
};

export type FileManagerBreadcrumbModel =
  | {
      readonly kind: "home";
    }
  | {
      readonly kind: "favorites";
    }
  | {
      readonly kind: "downloads";
      readonly title: string;
    }
  | {
      readonly kind: "trash";
      readonly title: string;
    }
  | {
      readonly kind: "path";
      readonly parts: readonly FileManagerBreadcrumbPart[];
    }
  | {
      readonly kind: "current";
      readonly title: string;
    };

export type FileManagerToolbarModel = {
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly canGoUp: boolean;
  readonly isLargeMode: boolean;
  readonly favoriteActive: boolean;
  readonly favoriteDisabled: boolean;
  readonly canCreateDraft: boolean;
  readonly canMoveSelectionToTrash: boolean;
  readonly canRestoreSelectionFromTrash: boolean;
  readonly canEmptyTrash: boolean;
};

export type FileManagerSidebarFavoriteItem = {
  readonly favorite: FileManagerFavorite;
  readonly active: boolean;
};

export type FileManagerSidebarLocationItem = {
  readonly location: FileManagerLocation;
  readonly active: boolean;
};

export type FileManagerSidebarRecentItem = {
  readonly recent: FileManagerRecentLocation;
  readonly active: boolean;
};

export type FileManagerSidebarModel = {
  readonly homeActive: boolean;
  readonly favoritesActive: boolean;
  readonly downloadsActive: boolean;
  readonly favorites: readonly FileManagerSidebarFavoriteItem[];
  readonly locations: readonly FileManagerSidebarLocationItem[];
  readonly recents: readonly FileManagerSidebarRecentItem[];
};

export type FileManagerDiskUsageTone = "healthy" | "warning" | "danger";

export type FileManagerHomeDiskItem = {
  readonly disk: FileManagerDisk;
  readonly usagePercent: number;
  readonly usageTone: FileManagerDiskUsageTone;
  readonly usageLabel: string;
  readonly availableLabel: string;
};

export type FileManagerHomeDeviceItem = {
  readonly device: FileManagerDevice;
  readonly totalBytesLabel: string | null;
};

export type FileManagerHomeHostModel = {
  readonly name: string;
  readonly osName: string;
  readonly architecture: string;
  readonly cpuBrand: string;
  readonly memoryUsagePercent: number;
  readonly memoryUsageTone: FileManagerDiskUsageTone;
  readonly memoryLabel: string;
  readonly memoryAvailableLabel: string;
};

export type FileManagerHomeModel = {
  readonly host: FileManagerHomeHostModel | null;
  readonly locations: readonly FileManagerLocation[];
  readonly disks: readonly FileManagerHomeDiskItem[];
  readonly devices: readonly FileManagerHomeDeviceItem[];
  readonly recentLocations: readonly FileManagerRecentLocation[];
  readonly isRecentEmpty: boolean;
};

export type FileManagerFavoritesModel = {
  readonly favorites: readonly FileManagerFavorite[];
  readonly isEmpty: boolean;
};

export type FileManagerDirectoryEntryItem = {
  readonly entry: FileManagerEntry;
  readonly active: boolean;
};

export type FileManagerTrashEntryItem = {
  readonly entry: FileManagerTrashEntry;
  readonly active: boolean;
};

export type FileManagerDirectoryModel = {
  readonly createDraft: FileManagerAppState["createDraft"];
  readonly entries: readonly FileManagerDirectoryEntryItem[];
  readonly isEmpty: boolean;
};

export type FileManagerTrashModel = {
  readonly entries: readonly FileManagerTrashEntryItem[];
  readonly isEmpty: boolean;
};

export type FileManagerDownloadsModel = {
  readonly tasks: readonly DownloadManagerTask[];
  readonly status: FileManagerAppState["downloadStatus"];
  readonly urlDraft: string;
  readonly errorMessage: string | undefined;
  readonly isEmpty: boolean;
};

export type FileManagerBodyModel =
  | {
      readonly kind: "loading";
      readonly skeletonSlots: FileManagerSkeletonSlots;
    }
  | {
      readonly kind: "error";
      readonly message: string | undefined;
    }
  | {
      readonly kind: "home";
      readonly home: FileManagerHomeModel;
    }
  | {
      readonly kind: "favorites";
      readonly favorites: FileManagerFavoritesModel;
    }
  | {
      readonly kind: "directory";
      readonly directory: FileManagerDirectoryModel;
    }
  | {
      readonly kind: "trash";
      readonly trash: FileManagerTrashModel;
    }
  | {
      readonly kind: "downloads";
      readonly downloads: FileManagerDownloadsModel;
    }
  | {
      readonly kind: "none";
    };

export type FileManagerChooserBarModel =
  | {
      readonly kind: "ai-project-bind" | "downloads-directory" | "ai-image-attach" | "ai-file-attach";
      readonly promptLabel: string;
      readonly confirmLabel: string;
      readonly path: string | null;
      readonly selectionPlaceholder: string;
      readonly canConfirm: boolean;
    }
  | null;

export type FileManagerSurfacePageKind = FileManagerAppState["viewKind"] | "favorites";

export type FileManagerSurfaceRenderModel = {
  readonly viewKind: FileManagerSurfacePageKind;
  readonly presentationMode: FileManagerAppState["presentationMode"];
  readonly breadcrumb: FileManagerBreadcrumbModel;
  readonly toolbar: FileManagerToolbarModel;
  readonly sidebar: FileManagerSidebarModel;
  readonly osBrandUrl: string | null;
  readonly body: FileManagerBodyModel;
  readonly chooserBar: FileManagerChooserBarModel;
  readonly breadcrumbs: readonly FileManagerBreadcrumbPart[];
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly canGoUp: boolean;
  readonly favoriteActive: boolean;
  readonly canConfirmCurrentDirectory: boolean;
  readonly isLargeMode: boolean;
  readonly canRenderBodyContent: boolean;
  readonly loadingSkeletonMetrics: FileManagerSkeletonMetrics;
};

const FILE_MANAGER_HOME_FAVORITES_DEFAULT = 4;
const FILE_MANAGER_HOME_LOCATIONS_DEFAULT = 4;
const FILE_MANAGER_HOME_DEVICES_DEFAULT = 3;
const FILE_MANAGER_HOME_RECENT_DEFAULT = 4;
const FILE_MANAGER_SIDEBAR_RECENT_LIMIT = 6;
const FILE_MANAGER_DIRECTORY_LIST_DEFAULT = 12;
const FILE_MANAGER_TRASH_LIST_DEFAULT = 8;
const FILE_MANAGER_DIRECTORY_LARGE_DEFAULT = 10;
const FILE_MANAGER_TRASH_LARGE_DEFAULT = 8;

const clampSkeletonCount = (
  value: number,
  minimum: number,
  maximum: number
): number => Math.min(maximum, Math.max(minimum, value));

const deriveSkeletonCount = (
  observed: number,
  fallback: number,
  minimum: number,
  maximum: number
): number => {
  if (observed <= 0) {
    return fallback;
  }
  return clampSkeletonCount(observed, minimum, maximum);
};

const createSkeletonSlots = (count: number): readonly number[] =>
  Array.from({ length: count }, (_value, index) => index);

export const splitFileManagerBreadcrumbs = (path: string): readonly FileManagerBreadcrumbPart[] => {
  const normalized = path.replace(/\\/g, "/");
  const driveMatch = normalized.match(/^[A-Za-z]:/);
  const drivePrefix = driveMatch?.[0] ?? "";
  const withoutDrive = drivePrefix.length > 0 ? normalized.slice(drivePrefix.length) : normalized;
  const segments = withoutDrive.split("/").filter((segment) => segment.length > 0);

  const breadcrumbs: FileManagerBreadcrumbPart[] = [];
  let current = drivePrefix;

  if (drivePrefix.length > 0) {
    breadcrumbs.push({
      id: drivePrefix,
      title: drivePrefix,
      path: drivePrefix + "/"
    });
    current = `${drivePrefix}/`;
  } else if (normalized.startsWith("/")) {
    breadcrumbs.push({
      id: "root",
      title: "/",
      path: "/"
    });
    current = "/";
  }

  for (const segment of segments) {
    current = current === "/" || current.endsWith("/") ? `${current}${segment}` : `${current}/${segment}`;
    breadcrumbs.push({
      id: current,
      title: segment,
      path: current
    });
  }

  return breadcrumbs;
};

export const isFileManagerActiveLocation = (
  state: FileManagerAppState,
  location: Pick<FileManagerLocation, "id" | "path" | "specialId">
): boolean => {
  const currentLocation = state.currentLocation;
  if (currentLocation === null || state.viewKind === "home") {
    return false;
  }

  const locationSpecialId = typeof location.specialId === "string" ? location.specialId : undefined;
  const currentSpecialId = typeof currentLocation.specialId === "string"
    ? currentLocation.specialId
    : undefined;
  if (
    locationSpecialId !== undefined &&
    currentSpecialId !== undefined &&
    locationSpecialId === currentSpecialId
  ) {
    return true;
  }

  const locationPath = optionalFileManagerPath(location.path);
  const currentPath = optionalFileManagerPath(currentLocation.path);
  if (
    locationPath !== undefined &&
    currentPath !== undefined &&
    locationPath === currentPath
  ) {
    return true;
  }

  return location.id === currentLocation.id;
};

export const isFileManagerActiveFavorite = (
  state: FileManagerAppState,
  favorite: Pick<FileManagerFavorite, "kind" | "path">
): boolean => {
  if (isPathFavorite(favorite) === false) {
    return false;
  }
  const currentPath = state.currentLocation?.path;
  if (currentPath === undefined) {
    return false;
  }

  return favorite.path === currentPath;
};

const isCurrentFavorite = (state: FileManagerAppState): boolean => {
  if (state.currentLocation?.path === undefined) {
    return false;
  }
  return state.favorites.some((item) =>
    isPathFavorite(item) && item.path === state.currentLocation?.path
  );
};

export const formatFileManagerDiskBytes = (value: number): string => {
  if (value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const precision = size >= 100 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
};

export const formatFileManagerDiskUsage = (disk: FileManagerDisk): string =>
  `${Math.round(disk.usageRatio * 100)}% · ${formatFileManagerDiskBytes(disk.usedBytes)} / ${formatFileManagerDiskBytes(disk.totalBytes)}`;

export const getFileManagerDiskUsageTone = (
  usageRatio: number
): FileManagerDiskUsageTone => {
  if (usageRatio >= 0.9) {
    return "danger";
  }

  if (usageRatio >= 0.7) {
    return "warning";
  }

  return "healthy";
};

export const formatOptionalFileManagerDiskBytes = (
  value: number | undefined
): string | null =>
  value === undefined ? null : formatFileManagerDiskBytes(value);

export const resolveFileManagerDiskKindLabel = (
  diskKind: FileManagerDiskKind,
  labels: Pick<
    FileManagerSurfaceLabels,
    "diskKindSystem" | "diskKindLocal" | "diskKindRemovable" | "diskKindExternal"
  >
): string => {
  switch (diskKind) {
    case "system":
      return labels.diskKindSystem;
    case "local":
      return labels.diskKindLocal;
    case "removable":
      return labels.diskKindRemovable;
    default:
      return labels.diskKindExternal;
  }
};

export const deriveFileManagerSkeletonSlots = (
  metrics: FileManagerSkeletonMetrics
): FileManagerSkeletonSlots => ({
  favoriteSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.favoritesCount, FILE_MANAGER_HOME_FAVORITES_DEFAULT, 2, 8)
  ),
  locationSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.locationsCount, FILE_MANAGER_HOME_LOCATIONS_DEFAULT, 3, 8)
  ),
  deviceSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.devicesCount, FILE_MANAGER_HOME_DEVICES_DEFAULT, 2, 6)
  ),
  recentSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.recentCount, FILE_MANAGER_HOME_RECENT_DEFAULT, 2, 10)
  ),
  directoryListSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.directoryEntriesCount, FILE_MANAGER_DIRECTORY_LIST_DEFAULT, 6, 24)
  ),
  trashListSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.trashEntriesCount, FILE_MANAGER_TRASH_LIST_DEFAULT, 4, 16)
  ),
  directoryLargeSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.directoryEntriesCount, FILE_MANAGER_DIRECTORY_LARGE_DEFAULT, 6, 18)
  ),
  trashLargeSlots: createSkeletonSlots(
    deriveSkeletonCount(metrics.trashEntriesCount, FILE_MANAGER_TRASH_LARGE_DEFAULT, 4, 14)
  )
});

const deriveLoadingSkeletonMetrics = (
  state: FileManagerAppState
): FileManagerSkeletonMetrics => ({
  favoritesCount: state.favorites.length,
  locationsCount: state.systemLocations.length,
  devicesCount: state.disks.length + state.devices.length,
  recentCount: state.recentLocations.length,
  directoryEntriesCount: state.entries.length,
  trashEntriesCount: state.trashEntries.length
});

const deriveHomeHostModel = (
  hostInfo: FileManagerAppState["hostInfo"]
): FileManagerHomeHostModel | null => {
  if (hostInfo == null) {
    return null;
  }

  const total = Math.max(0, hostInfo.memoryTotalBytes);
  const used = Math.max(0, Math.min(total, hostInfo.memoryUsedBytes));
  const usageRatio = total > 0 ? used / total : 0;

  return {
    name: hostInfo.name,
    osName: hostInfo.osName,
    architecture: hostInfo.architecture,
    cpuBrand: hostInfo.cpuBrand,
    memoryUsagePercent: Math.max(0, Math.min(100, Math.round(usageRatio * 100))),
    memoryUsageTone: getFileManagerDiskUsageTone(usageRatio),
    memoryLabel: `${formatFileManagerDiskBytes(used)} / ${formatFileManagerDiskBytes(total)}`,
    memoryAvailableLabel: formatFileManagerDiskBytes(Math.max(0, total - used))
  };
};

const deriveSidebarRecents = (
  state: FileManagerAppState,
  pageKind: FileManagerSurfacePageKind
): readonly FileManagerSidebarRecentItem[] => {
  const listedPaths = new Set(
    state.systemLocations.flatMap((location) => {
      const path = optionalFileManagerPath(location.path);
      return path === undefined ? [] : [path];
    })
  );
  const recents: FileManagerSidebarRecentItem[] = [];

  for (const recent of state.recentLocations) {
    if (listedPaths.has(recent.path)) {
      continue;
    }
    recents.push({
      recent,
      active:
        pageKind !== "home"
        && pageKind !== "favorites"
        && pageKind !== "downloads"
        && state.currentLocation?.path === recent.path
    });
    if (recents.length === FILE_MANAGER_SIDEBAR_RECENT_LIMIT) {
      break;
    }
  }

  return recents;
};

const deriveBreadcrumbModel = (
  state: FileManagerAppState,
  breadcrumbs: readonly FileManagerBreadcrumbPart[],
  pageKind: FileManagerSurfacePageKind
): FileManagerBreadcrumbModel => {
  if (pageKind === "favorites") {
    return { kind: "favorites" };
  }
  if (pageKind === "downloads") {
    return {
      kind: "downloads",
      title: state.currentLocation?.title ?? ""
    };
  }
  if (state.viewKind === "home") {
    return { kind: "home" };
  }
  if (state.viewKind === "trash") {
    return {
      kind: "trash",
      title: state.currentLocation?.title ?? ""
    };
  }
  if (breadcrumbs.length > 0) {
    return {
      kind: "path",
      parts: breadcrumbs
    };
  }
  return {
    kind: "current",
    title: state.currentLocation?.title ?? ""
  };
};

const deriveBodyModel = (
  state: FileManagerAppState,
  pageKind: FileManagerSurfacePageKind,
  showLoadingSkeleton: boolean,
  loadingSkeletonMetrics: FileManagerSkeletonMetrics,
  canRenderBodyContent: boolean
): FileManagerBodyModel => {
  if (showLoadingSkeleton) {
    return {
      kind: "loading",
      skeletonSlots: deriveFileManagerSkeletonSlots(loadingSkeletonMetrics)
    };
  }

  if (state.status === "error") {
    return {
      kind: "error",
      message: state.errorMessage
    };
  }

  if (!canRenderBodyContent) {
    return { kind: "none" };
  }

  if (pageKind === "favorites") {
    return {
      kind: "favorites",
      favorites: {
        favorites: state.favorites,
        isEmpty: state.favorites.length === 0
      }
    };
  }

  if (state.viewKind === "home") {
    return {
      kind: "home",
      home: {
        host: deriveHomeHostModel(state.hostInfo),
        locations: state.systemLocations,
        disks: state.disks.map((disk) => ({
          disk,
          usagePercent: Math.max(0, Math.min(100, Math.round(disk.usageRatio * 100))),
          usageTone: getFileManagerDiskUsageTone(disk.usageRatio),
          usageLabel: formatFileManagerDiskUsage(disk),
          availableLabel: formatFileManagerDiskBytes(disk.availableBytes)
        })),
        devices: state.devices.map((device) => ({
          device,
          totalBytesLabel: formatOptionalFileManagerDiskBytes(device.totalBytes)
        })),
        recentLocations: state.recentLocations,
        isRecentEmpty: state.recentLocations.length === 0
      }
    };
  }

  if (state.viewKind === "directory") {
    return {
      kind: "directory",
      directory: {
        createDraft: state.createDraft,
        entries: state.entries.map((entry) => ({
          entry,
          active: state.selectedEntryIds.includes(entry.id)
        })),
        isEmpty: state.entries.length === 0
      }
    };
  }

  if (state.viewKind === "downloads") {
    return {
      kind: "downloads",
      downloads: {
        tasks: state.downloadTasks,
        status: state.downloadStatus,
        urlDraft: state.downloadUrlDraft,
        errorMessage: state.downloadErrorMessage,
        isEmpty: state.downloadTasks.length === 0
      }
    };
  }

  return {
    kind: "trash",
    trash: {
      entries: state.trashEntries.map((entry) => ({
        entry,
        active: entry.id === state.selectedTrashEntryId
      })),
      isEmpty: state.trashEntries.length === 0
    }
  };
};

export const deriveFileManagerSurfaceModel = (
  state: FileManagerAppState,
  chooser: FileManagerChooserMode | null | undefined,
  showLoadingSkeleton: boolean,
  pageKind: FileManagerSurfacePageKind = state.viewKind
): FileManagerSurfaceRenderModel => {
  const breadcrumbs = state.currentLocation?.path
    ? splitFileManagerBreadcrumbs(state.currentLocation.path)
    : [];
  const loadingSkeletonMetrics = deriveLoadingSkeletonMetrics(state);
  const canGoBack = state.historyIndex > 0;
  const canGoForward =
    state.historyIndex >= 0 && state.historyIndex < state.history.length - 1;
  const canGoUp = pageKind === "favorites" || pageKind === "downloads" ? false : state.parentPath !== undefined;
  const favoriteActive = isCurrentFavorite(state);
  const selectedFileEntry = findSelectedEntry(state);
  const selectedImagePath =
    selectedFileEntry?.kind === "file"
    && isImageViewerSupportedPath(selectedFileEntry.path)
      ? selectedFileEntry.path.trim()
      : "";
  const selectedFilePath =
    selectedFileEntry?.kind === "file"
      ? selectedFileEntry.path.trim()
      : "";
  const canConfirmCurrentDirectory =
    (chooser?.kind === "ai-project-bind" || chooser?.kind === "downloads-directory")
    && state.viewKind === "directory"
    && typeof state.currentLocation?.path === "string"
    && state.currentLocation.path.trim().length > 0;
  const canConfirmSelectedImage =
    chooser?.kind === "ai-image-attach"
    && state.viewKind === "directory"
    && selectedImagePath.length > 0;
  const canConfirmSelectedFile =
    chooser?.kind === "ai-file-attach"
    && state.viewKind === "directory"
    && selectedFilePath.length > 0;
  const isLargeMode = state.presentationMode === "large";
  const canRenderBodyContent =
    state.status !== "error" &&
    (state.status !== "loading" || showLoadingSkeleton === false);

  return {
    viewKind: pageKind,
    presentationMode: state.presentationMode,
    breadcrumb: deriveBreadcrumbModel(state, breadcrumbs, pageKind),
    toolbar: {
      canGoBack,
      canGoForward,
      canGoUp,
      isLargeMode,
      favoriteActive,
      favoriteDisabled: pageKind === "favorites" || pageKind === "downloads" || state.currentLocation?.path === undefined,
      canCreateDraft: pageKind === "directory",
      canMoveSelectionToTrash:
        pageKind === "directory" && state.selectedEntryIds.length > 0,
      canRestoreSelectionFromTrash:
        pageKind === "trash" && state.selectedTrashEntryId !== undefined,
      canEmptyTrash: pageKind === "trash" && state.trashEntries.length > 0
    },
    sidebar: {
      homeActive: pageKind === "home",
      favoritesActive: pageKind === "favorites",
      downloadsActive: pageKind === "downloads",
      favorites: state.favorites.map((favorite) => ({
        favorite,
        active: pageKind !== "favorites" && isFileManagerActiveFavorite(state, favorite)
      })),
      locations: state.systemLocations.map((location) => ({
        location,
        active: pageKind !== "home"
          && pageKind !== "favorites"
          && pageKind !== "downloads"
          && isFileManagerActiveLocation(state, location)
      })),
      recents: deriveSidebarRecents(state, pageKind)
    },
    osBrandUrl: resolveFileManagerOsBrandAsset(state.disks)?.url ?? null,
    body: deriveBodyModel(
      state,
      pageKind,
      showLoadingSkeleton,
      loadingSkeletonMetrics,
      canRenderBodyContent
    ),
    chooserBar:
      chooser?.kind === "ai-project-bind" || chooser?.kind === "downloads-directory"
        ? {
            kind: chooser.kind,
            promptLabel: chooser.promptLabel,
            confirmLabel: chooser.confirmLabel,
            path: canConfirmCurrentDirectory ? state.currentLocation?.path ?? null : null,
            selectionPlaceholder: chooser.selectPlaceholder,
            canConfirm: canConfirmCurrentDirectory
          }
        : chooser?.kind === "ai-image-attach"
          ? {
              kind: "ai-image-attach",
              promptLabel: chooser.promptLabel,
              confirmLabel: chooser.confirmLabel,
              path: canConfirmSelectedImage ? selectedImagePath : null,
              selectionPlaceholder: chooser.selectPlaceholder,
              canConfirm: canConfirmSelectedImage
            }
          : chooser?.kind === "ai-file-attach"
            ? {
                kind: "ai-file-attach",
                promptLabel: chooser.promptLabel,
                confirmLabel: chooser.confirmLabel,
                path: canConfirmSelectedFile ? selectedFilePath : null,
                selectionPlaceholder: chooser.selectPlaceholder,
                canConfirm: canConfirmSelectedFile
              }
            : null,
    breadcrumbs,
    canGoBack,
    canGoForward,
    canGoUp,
    favoriteActive,
    canConfirmCurrentDirectory,
    isLargeMode,
    canRenderBodyContent,
    loadingSkeletonMetrics
  };
};
