import type {
  FileManagerDevice,
  FileManagerEntry,
  FileManagerFavorite,
  FileManagerDisk,
  FileManagerHostInfo,
  FileManagerLocation,
  FileManagerRecentLocation,
  FileManagerTrashEntry,
  FileManagerViewKind
} from "../../../shared/file-manager";
import type {
  DownloadManagerPriority,
  DownloadManagerTask
} from "../../../shared/download-manager";
import type { ContextMenuModel } from "../context-menu";
import type {
  LyraDesktopApi,
} from "../../../shared/desktop-bridge";

export type FileManagerAppId = "file-manager";

export type FileManagerAppIconKey =
  | "file-manager-home"
  | "file-manager-directory-empty"
  | "file-manager-directory-non-empty"
  | "file-manager-directory"
  | "file-manager-download-manager"
  | "file-manager-trash";

export type FileManagerCreateDraftKind = "file" | "directory";

export type FileManagerCreateDraft = {
  readonly kind: FileManagerCreateDraftKind;
  readonly value: string;
};

export type FileManagerStatus = "idle" | "loading" | "ready" | "error";
export type FileManagerDownloadStatus = "idle" | "loading" | "ready" | "error";

export type FileManagerPresentationMode = "list" | "large";

export type FileManagerAppState = {
  readonly instanceId: string;
  readonly status: FileManagerStatus;
  readonly viewKind: FileManagerViewKind;
  readonly presentationMode: FileManagerPresentationMode;
  readonly title: string;
  readonly iconKey: FileManagerAppIconKey;
  readonly currentLocation: FileManagerLocation | null;
  readonly parentPath: string | undefined;
  readonly history: readonly FileManagerLocation[];
  readonly historyIndex: number;
  readonly systemLocations: readonly FileManagerLocation[];
  readonly favorites: readonly FileManagerFavorite[];
  readonly recentLocations: readonly FileManagerRecentLocation[];
  readonly hostInfo?: FileManagerHostInfo | null;
  readonly disks: readonly FileManagerDisk[];
  readonly devices: readonly FileManagerDevice[];
  readonly entries: readonly FileManagerEntry[];
  readonly trashEntries: readonly FileManagerTrashEntry[];
  readonly downloadTasks: readonly DownloadManagerTask[];
  readonly downloadStatus: FileManagerDownloadStatus;
  readonly downloadUrlDraft: string;
  readonly downloadErrorMessage: string | undefined;
  readonly directorySubscriptionId: string | undefined;
  readonly directoryGeneration: number | undefined;
  readonly selectedEntryId: string | undefined;
  readonly selectedTrashEntryId: string | undefined;
  readonly createDraft: FileManagerCreateDraft | undefined;
  readonly errorMessage: string | undefined;
};

export type FileManagerSurfaceLabels = {
  readonly title: string;
  readonly locationHome: string;
  readonly locationDesktop: string;
  readonly locationDocuments: string;
  readonly locationDownloads: string;
  readonly locationPictures: string;
  readonly locationVideos: string;
  readonly downloadManagerTitle: string;
  readonly locationTrash: string;
  readonly homeSectionFavorites: string;
  readonly homeSectionLocations: string;
  readonly homeSectionDevices: string;
  readonly homeSectionRecent: string;
  readonly hostProcessor?: string;
  readonly hostMemory?: string;
  readonly navigationBack: string;
  readonly navigationForward: string;
  readonly navigationUp: string;
  readonly refresh: string;
  readonly addFavorite: string;
  readonly removeFavorite: string;
  readonly newFolder: string;
  readonly newFile: string;
  readonly delete: string;
  readonly restore: string;
  readonly emptyTrash: string;
  readonly noRecentLocations: string;
  readonly emptyDirectory: string;
  readonly emptyTrashState: string;
  readonly noFavorites: string;
  readonly emptyDownloads: string;
  readonly loading: string;
  readonly unavailable: string;
  readonly diskAvailable: string;
  readonly diskKindSystem: string;
  readonly diskKindLocal: string;
  readonly diskKindRemovable: string;
  readonly diskKindExternal: string;
  readonly deviceUnmounted: string;
  readonly nameColumn: string;
  readonly locationColumn: string;
  readonly originalLocationColumn: string;
  readonly createPlaceholderFile: string;
  readonly createPlaceholderDirectory: string;
  readonly createConfirm: string;
  readonly createCancel: string;
  readonly contextOpen: string;
  readonly contextMountDevice: string;
  readonly contextMoveToTrash: string;
  readonly contextRestore: string;
  readonly contextEmptyTrash: string;
  readonly contextEjectDevice: string;
  readonly viewList: string;
  readonly viewLarge: string;
  readonly downloadAddUrl: string;
  readonly downloadUrlPlaceholder: string;
  readonly downloadOpenFile: string;
  readonly downloadRevealFile: string;
  readonly downloadPause: string;
  readonly downloadResume: string;
  readonly downloadCancel: string;
  readonly downloadRetry: string;
  readonly downloadRemove: string;
  readonly downloadPauseAll: string;
  readonly downloadResumeAll: string;
  readonly downloadCancelAll: string;
  readonly downloadPriority: string;
  readonly downloadPriorityLow: string;
  readonly downloadPriorityNormal: string;
  readonly downloadPriorityHigh: string;
  readonly downloadStateQueued: string;
  readonly downloadStateDownloading: string;
  readonly downloadStatePaused: string;
  readonly downloadStateCompleted: string;
  readonly downloadStateFailed: string;
  readonly downloadStateCanceled: string;
  readonly downloadSourceBrowser: string;
  readonly downloadSourceManual: string;
  readonly downloadConnections: string;
  readonly downloadUnknownSize: string;
  readonly downloadSpeedIdle: string;
  readonly downloadDurationSeconds: string;
  readonly downloadDurationMinutes: string;
  readonly downloadDurationHours: string;
  readonly downloadEta: string;
  readonly chooserBindProjectLabel: string;
  readonly chooserSelectDirectoryPlaceholder: string;
  readonly chooserSelectAnyDirectoryPlaceholder: string;
};

export type FileManagerChooserMode =
  | {
      readonly kind: "ai-project-bind";
      readonly confirmLabel: string;
      readonly promptLabel: string;
      readonly selectPlaceholder: string;
      readonly onConfirm: () => void;
    }
  | {
      readonly kind: "downloads-directory";
      readonly confirmLabel: string;
      readonly promptLabel: string;
      readonly selectPlaceholder: string;
      readonly onConfirm: () => void;
    }
  | {
      readonly kind: "ai-image-attach";
      readonly confirmLabel: string;
      readonly promptLabel: string;
      readonly selectPlaceholder: string;
      readonly onConfirm: () => void;
    }
  | {
      readonly kind: "ai-file-attach";
      readonly confirmLabel: string;
      readonly promptLabel: string;
      readonly selectPlaceholder: string;
      readonly onConfirm: () => void;
    };

export type FileManagerModel = {
  /**
   * Observes Core-owned state changes without exposing the renderer store to an
   * independently shipped application. The returned function releases the
   * subscription.
   */
  readonly subscribe: (
    listener: (changedInstanceIds: readonly string[]) => void
  ) => () => void;
  readonly createInstance: () => {
    readonly appId: FileManagerAppId;
    readonly appInstanceId: string;
    readonly title: string;
    readonly iconKey: FileManagerAppIconKey;
  };
  readonly getState: (instanceId: string) => FileManagerAppState | null;
  readonly ensureInstance: (instanceId: string) => void;
  readonly syncExternalInstances: (instanceIds: readonly string[]) => void;
  readonly syncTabInstances: (instanceIds: readonly string[]) => void;
  readonly openHome: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly openDirectory: (instanceId: string, path: string, addToHistory?: boolean) => Promise<void>;
  readonly openTrash: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly openDownloads: (instanceId: string, addToHistory?: boolean) => Promise<void>;
  readonly goBack: (instanceId: string) => Promise<void>;
  readonly goForward: (instanceId: string) => Promise<void>;
  readonly goUp: (instanceId: string) => Promise<void>;
  readonly refresh: (instanceId: string) => Promise<void>;
  readonly setPresentationMode: (instanceId: string, mode: FileManagerPresentationMode) => void;
  readonly selectEntry: (instanceId: string, entryId: string) => void;
  readonly selectTrashEntry: (instanceId: string, entryId: string) => void;
  readonly beginCreateDraft: (instanceId: string, kind: FileManagerCreateDraftKind) => void;
  readonly updateCreateDraft: (instanceId: string, value: string) => void;
  readonly cancelCreateDraft: (instanceId: string) => void;
  readonly commitCreateDraft: (instanceId: string) => Promise<void>;
  readonly moveSelectionToTrash: (instanceId: string) => Promise<void>;
  readonly restoreSelectionFromTrash: (instanceId: string) => Promise<void>;
  readonly emptyTrash: (instanceId: string) => Promise<void>;
  readonly updateDownloadUrlDraft: (instanceId: string, value: string) => void;
  readonly submitDownloadUrlDraft: (instanceId: string) => Promise<void>;
  readonly pauseDownload: (taskId: string) => Promise<void>;
  readonly resumeDownload: (taskId: string) => Promise<void>;
  readonly cancelDownload: (taskId: string) => Promise<void>;
  readonly retryDownload: (taskId: string) => Promise<void>;
  readonly removeDownload: (taskId: string) => Promise<void>;
  readonly setDownloadPriority: (taskId: string, priority: DownloadManagerPriority) => Promise<void>;
  readonly pauseAllDownloads: () => Promise<void>;
  readonly resumeAllDownloads: () => Promise<void>;
  readonly cancelAllDownloads: () => Promise<void>;
  readonly openDownloadedFile: (taskId: string) => Promise<void>;
  readonly revealDownloadedFile: (taskId: string) => Promise<void>;
  readonly toggleCurrentDirectoryFavorite: (instanceId: string) => Promise<void>;
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
  readonly openTrashEntryContextMenu: (instanceId: string, entryId: string, anchorX: number, anchorY: number) => void;
  readonly openDirectoryContextMenu: (instanceId: string, anchorX: number, anchorY: number) => void;
  readonly openTrashContextMenu: (instanceId: string, anchorX: number, anchorY: number) => void;
};

export type UseFileManagerModelOptions = {
  readonly desktopApi: LyraDesktopApi | null;
  readonly contextMenuModel: ContextMenuModel;
  readonly labels: FileManagerSurfaceLabels;
  readonly onMetaChange: (request: {
    readonly appId: FileManagerAppId;
    readonly appInstanceId: string;
    readonly title: string;
    readonly iconKey: FileManagerAppIconKey;
    readonly filePath?: string;
  }) => void;
};
