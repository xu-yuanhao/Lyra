import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";

import { LYRA_CHANNELS } from "../../shared/desktop-bridge";
import type {
  FileManagerCreateFileRequest,
  FileManagerCreateFolderRequest,
  FileManagerDirectorySnapshot,
  FileManagerEntry,
  FileManagerEjectDeviceRequest,
  FileManagerFavoritesPayload,
  FileManagerDirectoryPatch,
  FileReadResult,
  FileReadTextRequest,
  FileSearchTextRequest,
  FileStatRequest,
  FileManagerMountDeviceRequest,
  FileManagerMoveToTrashRequest,
  FileManagerReadDirectoryRequest,
  FileManagerReadDirectoryResponse,
  FileManagerReadTrashResponse,
  FileManagerRecentLocationsPayload,
  FileManagerRestoreFromTrashRequest,
  FileManagerSubscribeDirectoryResponse,
  FileManagerTrashEntry,
  FileWriteTextRequest
} from "../../shared/file-manager";
import {
  createBackpressuredEventSender,
  estimateSerializedBytes
} from "../events/backpressure";
import { sendToWebContents } from "../web-contents-ipc";
import type { LyraRuntimeClient } from "../runtime-client";

const DIRECTORY_PATCH_THROTTLE_MS = 75;
const DIRECTORY_PATCH_MAX_QUEUE_SIZE = 1024;
const FILES_DIRECTORY_PATCH_EVENT = "files.directoryPatch";
const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".avif",
  ".tiff",
  ".tif",
  ".heic",
  ".heif"
]);

type FilePreviewUrlFactory = (filePath: string, mimeType?: string | null) => string;

const normalizePath = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("path is required");
  }
  return trimmed;
};

const normalizeName = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error("name is required");
  }
  return trimmed;
};

const normalizeDirectoryRequest = (
  payload: FileManagerReadDirectoryRequest
): FileManagerReadDirectoryRequest => ({
  path: normalizePath(payload.path)
});

const normalizeUnsubscribeDirectoryRequest = (
  payload: { readonly subscriptionId?: string }
): { readonly subscriptionId: string } => {
  const subscriptionId = payload.subscriptionId?.trim() ?? "";
  if (subscriptionId.length === 0) {
    throw new Error("subscriptionId is required");
  }
  return { subscriptionId };
};

const normalizeCreateFileRequest = (
  payload: FileManagerCreateFileRequest
): FileManagerCreateFileRequest => ({
  parentPath: normalizePath(payload.parentPath),
  name: normalizeName(payload.name)
});

const normalizeCreateFolderRequest = (
  payload: FileManagerCreateFolderRequest
): FileManagerCreateFolderRequest => ({
  parentPath: normalizePath(payload.parentPath),
  name: normalizeName(payload.name)
});

const normalizeMoveToTrashRequest = (
  payload: FileManagerMoveToTrashRequest
): FileManagerMoveToTrashRequest => ({
  paths: payload.paths.map((entry) => normalizePath(entry))
});

const normalizeRestoreFromTrashRequest = (
  payload: FileManagerRestoreFromTrashRequest
): FileManagerRestoreFromTrashRequest => ({
  itemIds: payload.itemIds.map((entry) => normalizePath(entry))
});

const normalizeEjectDeviceRequest = (
  payload: FileManagerEjectDeviceRequest
): FileManagerEjectDeviceRequest => {
  const devicePath =
    typeof payload.devicePath === "string" && payload.devicePath.trim().length > 0
      ? normalizePath(payload.devicePath)
      : null;

  return {
    mountPath: normalizePath(payload.mountPath),
    kind: payload.kind,
    ...(devicePath === null ? {} : { devicePath })
  };
};

const normalizeMountDeviceRequest = (
  payload: FileManagerMountDeviceRequest
): FileManagerMountDeviceRequest => ({
  devicePath: normalizePath(payload.devicePath),
  kind: payload.kind
});

const normalizeFavoritesPayload = (
  payload: FileManagerFavoritesPayload
): FileManagerFavoritesPayload => ({
  favorites: payload.favorites.map((item) => ({
    ...item,
    title: normalizeName(item.title),
    path: normalizePath(item.path)
  }))
});

const normalizeRecentPayload = (
  payload: FileManagerRecentLocationsPayload
): FileManagerRecentLocationsPayload => ({
  recentLocations: payload.recentLocations.map((item) => ({
    ...item,
    title: normalizeName(item.title),
    path: normalizePath(item.path),
    lastOpenedAt: item.lastOpenedAt.trim().length > 0 ? item.lastOpenedAt.trim() : new Date().toISOString()
  }))
});

const normalizeReadTextRequest = (
  payload: FileReadTextRequest
): FileReadTextRequest => ({
  path: normalizePath(payload.path)
});

const isVirtualToolPath = (filePath: string): boolean =>
  filePath === "/tools" || filePath.startsWith("/tools/");

const isPreviewableImagePath = (filePath: string): boolean =>
  PREVIEWABLE_IMAGE_EXTENSIONS.has(extname(filePath).toLowerCase());

const withEntryPreviewUrl = (
  entry: FileManagerEntry,
  createPreviewUrl: FilePreviewUrlFactory
): FileManagerEntry => {
  if (entry.kind !== "file" || isPreviewableImagePath(entry.path) === false) {
    return entry;
  }
  return {
    ...entry,
    previewUrl: createPreviewUrl(entry.path)
  };
};

const withTrashEntryPreviewUrl = (
  entry: FileManagerTrashEntry,
  createPreviewUrl: FilePreviewUrlFactory
): FileManagerTrashEntry => {
  const previewPath = entry.trashedPath ?? entry.originalPath;
  if (entry.kind !== "file" || previewPath === undefined || isPreviewableImagePath(previewPath) === false) {
    return entry;
  }
  return {
    ...entry,
    previewUrl: createPreviewUrl(previewPath)
  };
};

const withDirectoryPreviewUrls = (
  response: FileManagerReadDirectoryResponse,
  createPreviewUrl: FilePreviewUrlFactory
): FileManagerReadDirectoryResponse => ({
  ...response,
  entries: response.entries.map((entry) => withEntryPreviewUrl(entry, createPreviewUrl))
});

const withDirectorySnapshotPreviewUrls = (
  snapshot: FileManagerDirectorySnapshot,
  createPreviewUrl: FilePreviewUrlFactory
): FileManagerDirectorySnapshot => ({
  ...withDirectoryPreviewUrls(snapshot, createPreviewUrl),
  generation: snapshot.generation
});

// The Rust wire struct (lyra-files-core wire.rs FileManagerDirectoryPatch) has
// Option fields without skip_serializing_if, so absent fields arrive as explicit
// `null` instead of the `undefined` this shared type promises. Normalize at the
// send boundary so every consumer (preview transforms, renderer state models)
// sees the declared contract.
const normalizeDirectoryPatch = (
  patch: FileManagerDirectoryPatch
): FileManagerDirectoryPatch => ({
  subscriptionId: patch.subscriptionId,
  directoryPath: patch.directoryPath,
  generation: patch.generation,
  kind: patch.kind,
  ...(patch.entry == null ? {} : { entry: patch.entry }),
  ...(patch.path == null ? {} : { path: patch.path }),
  ...(patch.oldPath == null ? {} : { oldPath: patch.oldPath }),
  ...(patch.newPath == null ? {} : { newPath: patch.newPath }),
  ...(patch.snapshot == null ? {} : { snapshot: patch.snapshot }),
  ...(patch.errorMessage == null ? {} : { errorMessage: patch.errorMessage })
});

const withDirectoryPatchPreviewUrl = (
  patch: FileManagerDirectoryPatch,
  createPreviewUrl: FilePreviewUrlFactory
): FileManagerDirectoryPatch => ({
  ...patch,
  ...(patch.entry === undefined ? {} : { entry: withEntryPreviewUrl(patch.entry, createPreviewUrl) }),
  ...(patch.snapshot === undefined
    ? {}
    : { snapshot: withDirectorySnapshotPreviewUrls(patch.snapshot, createPreviewUrl) })
});

const withTrashPreviewUrls = (
  response: FileManagerReadTrashResponse,
  createPreviewUrl: FilePreviewUrlFactory
): FileManagerReadTrashResponse => ({
  ...response,
  entries: response.entries.map((entry) => withTrashEntryPreviewUrl(entry, createPreviewUrl))
});

const unsupportedReadResult = (
  filePath: string,
  reason: string,
  sizeBytes = 0
): FileReadResult => ({
  kind: "unsupported",
  path: filePath,
  reason,
  readOnly: true,
  sizeBytes
});

const safeReadTextFile = async (
  readText: (request: FileReadTextRequest) => Promise<FileReadResult>,
  payload: FileReadTextRequest
): Promise<FileReadResult> => {
  const request = normalizeReadTextRequest(payload);
  if (isVirtualToolPath(request.path)) {
    return unsupportedReadResult(request.path, "virtual-tool-path");
  }
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(request.path);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT"
      || (error as NodeJS.ErrnoException).code === "ENOTDIR"
    ) {
      return unsupportedReadResult(request.path, "not-found");
    }
    throw error;
  }
  if (!stats.isFile()) {
    return unsupportedReadResult(request.path, "not-file", stats.size);
  }
  try {
    return await readText(request);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return unsupportedReadResult(request.path, "not-found");
    }
    throw error;
  }
};

const isDirectoryPatch = (value: unknown): value is FileManagerDirectoryPatch =>
  typeof value === "object"
  && value !== null
  && typeof (value as FileManagerDirectoryPatch).subscriptionId === "string";

const normalizeWriteTextRequest = (
  payload: FileWriteTextRequest
): FileWriteTextRequest => {
  const encoding = payload.encoding;
  if (
    encoding !== undefined &&
    encoding !== "utf8" &&
    encoding !== "utf8-bom"
  ) {
    throw new Error("encoding is unsupported");
  }
  const expectedRevision =
    typeof payload.expectedRevision === "string" &&
    payload.expectedRevision.trim().length > 0
      ? payload.expectedRevision.trim()
      : undefined;

  return {
    path: normalizePath(payload.path),
    content:
      typeof payload.content === "string"
        ? payload.content
        : String(payload.content ?? ""),
    ...(expectedRevision === undefined
      ? {}
      : { expectedRevision }),
    ...(encoding === undefined ? {} : { encoding })
  };
};

const normalizeStatRequest = (
  payload: FileStatRequest
): FileStatRequest => ({
  path: normalizePath(payload.path)
});

export type FilesIpcBridge = {
  readonly dispose: () => void;
};

export const createFilesIpcBridge = ({
  storageRoot,
  runtimeClient,
  createPreviewUrl: createPreviewUrlOption
}: {
  readonly storageRoot: string;
  readonly runtimeClient: LyraRuntimeClient;
  readonly createPreviewUrl?: FilePreviewUrlFactory;
}): FilesIpcBridge => {
  const createPreviewUrl = createPreviewUrlOption ?? ((filePath: string) =>
    `lyra-file://preview?path=${encodeURIComponent(filePath)}`);
  const request = <T>(method: string, payload: unknown): Promise<T> =>
    runtimeClient.request<T>(method, payload);
  const subscriptionsByWebContents = new Map<number, Set<string>>();

  const directoryPatchSender = createBackpressuredEventSender<FileManagerDirectoryPatch>({
    name: "files.directoryPatch",
    intervalMs: DIRECTORY_PATCH_THROTTLE_MS,
    maxQueueSize: DIRECTORY_PATCH_MAX_QUEUE_SIZE,
    leading: false,
    estimateBytes: estimateSerializedBytes,
    send: (rawPatch) => {
      const patch = normalizeDirectoryPatch(rawPatch);
      for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) {
          continue;
        }
        const subscriptions = subscriptionsByWebContents.get(window.webContents.id);
        if (subscriptions === undefined || subscriptions.has(patch.subscriptionId) === false) {
          continue;
        }
        sendToWebContents(
          window.webContents,
          LYRA_CHANNELS.filesDirectoryPatch,
          withDirectoryPatchPreviewUrl(patch, createPreviewUrl)
        );
      }
    },
    onError: (error) => {
      console.warn(`[lyra-files] failed to send throttled directory patch: ${String(error)}`);
    }
  });

  const hookedDirectorySenders = new Set<number>();

  const dropDirectorySubscriptions = (webContentsId: number): void => {
    hookedDirectorySenders.delete(webContentsId);
    const subscriptions = subscriptionsByWebContents.get(webContentsId);
    if (subscriptions === undefined) {
      return;
    }
    subscriptionsByWebContents.delete(webContentsId);
    for (const id of subscriptions) {
      void request("files.unsubscribe_directory", { subscriptionId: id }).catch(() => {
        // Best effort cleanup for closing or crashed renderer processes.
      });
    }
  };

  const trackDirectorySubscription = (
    event: IpcMainInvokeEvent,
    subscriptionId: string
  ): void => {
    const webContentsId = event.sender.id;
    const current = subscriptionsByWebContents.get(webContentsId) ?? new Set<string>();
    current.add(subscriptionId);
    subscriptionsByWebContents.set(webContentsId, current);
    if (hookedDirectorySenders.has(webContentsId) === false) {
      hookedDirectorySenders.add(webContentsId);
      event.sender.once("destroyed", () => {
        dropDirectorySubscriptions(webContentsId);
      });
      event.sender.once("render-process-gone", () => {
        dropDirectorySubscriptions(webContentsId);
      });
    }
  };

  const untrackDirectorySubscription = (
    event: IpcMainInvokeEvent,
    subscriptionId: string
  ): void => {
    const subscriptions = subscriptionsByWebContents.get(event.sender.id);
    if (subscriptions !== undefined) {
      subscriptions.delete(subscriptionId);
      if (subscriptions.size === 0) {
        subscriptionsByWebContents.delete(event.sender.id);
      }
    }
  };

  const unsubscribeRuntimeEvents = runtimeClient.subscribe((eventName, payload) => {
    if (eventName !== FILES_DIRECTORY_PATCH_EVENT || isDirectoryPatch(payload) === false) {
      return;
    }
    directoryPatchSender.enqueue(payload);
  });

  const handlers: Array<readonly [string, (_event: IpcMainInvokeEvent, payload?: unknown) => unknown]> = [
    [
      LYRA_CHANNELS.filesReadHome,
      async () => request("files.read_home", { storageRoot })
    ],
    [
      LYRA_CHANNELS.filesReadDirectory,
      async (_event, payload) =>
        withDirectoryPreviewUrls(
          await request(
            "files.read_directory",
            normalizeDirectoryRequest(payload as FileManagerReadDirectoryRequest)
          ),
          createPreviewUrl
        )
    ],
    [
      LYRA_CHANNELS.filesSubscribeDirectory,
      async (event, payload) => {
        const response = await request<FileManagerSubscribeDirectoryResponse>(
          "files.subscribe_directory",
          normalizeDirectoryRequest(payload as FileManagerReadDirectoryRequest)
        );
        trackDirectorySubscription(event, response.subscriptionId);
        return {
          ...response,
          snapshot: withDirectorySnapshotPreviewUrls(response.snapshot, createPreviewUrl)
        };
      }
    ],
    [
      LYRA_CHANNELS.filesUnsubscribeDirectory,
      async (event, payload) => {
        const unsubscribeRequest = normalizeUnsubscribeDirectoryRequest(
          payload as { readonly subscriptionId?: string }
        );
        await request("files.unsubscribe_directory", unsubscribeRequest);
        untrackDirectorySubscription(event, unsubscribeRequest.subscriptionId);
      }
    ],
    [
      LYRA_CHANNELS.filesReadTrash,
      async () =>
        withTrashPreviewUrls(
          await request("files.read_trash", { storageRoot }),
          createPreviewUrl
        )
    ],
    [
      LYRA_CHANNELS.filesCreateFile,
      async (_event, payload) =>
        request("files.create_file", normalizeCreateFileRequest(payload as FileManagerCreateFileRequest))
    ],
    [
      LYRA_CHANNELS.filesCreateFolder,
      async (_event, payload) =>
        request(
          "files.create_folder",
          normalizeCreateFolderRequest(payload as FileManagerCreateFolderRequest)
        )
    ],
    [
      LYRA_CHANNELS.filesMoveToTrash,
      async (_event, payload) =>
        request("files.move_to_trash", {
          ...normalizeMoveToTrashRequest(payload as FileManagerMoveToTrashRequest),
          storageRoot
        })
    ],
    [
      LYRA_CHANNELS.filesRestoreFromTrash,
      async (_event, payload) =>
        request("files.restore_from_trash", {
          ...normalizeRestoreFromTrashRequest(payload as FileManagerRestoreFromTrashRequest),
          storageRoot
        })
    ],
    [
      LYRA_CHANNELS.filesEmptyTrash,
      async () => request("files.empty_trash", { storageRoot })
    ],
    [
      LYRA_CHANNELS.filesMountDevice,
      async (_event, payload) =>
        request(
          "files.mount_device",
          normalizeMountDeviceRequest(payload as FileManagerMountDeviceRequest)
        )
    ],
    [
      LYRA_CHANNELS.filesEjectDevice,
      async (_event, payload) =>
        request(
          "files.eject_device",
          normalizeEjectDeviceRequest(payload as FileManagerEjectDeviceRequest)
        )
    ],
    [
      LYRA_CHANNELS.filesReadFavorites,
      async () => request("files.read_favorites", { storageRoot })
    ],
    [
      LYRA_CHANNELS.filesWriteFavorites,
      async (_event, payload) =>
        request("files.write_favorites", {
          storageRoot,
          ...normalizeFavoritesPayload(payload as FileManagerFavoritesPayload)
        })
    ],
    [
      LYRA_CHANNELS.filesReadRecentLocations,
      async () => request("files.read_recent_locations", { storageRoot })
    ],
    [
      LYRA_CHANNELS.filesWriteRecentLocations,
      async (_event, payload) =>
        request("files.write_recent_locations", {
          storageRoot,
          ...normalizeRecentPayload(payload as FileManagerRecentLocationsPayload)
        })
    ],
    [
      LYRA_CHANNELS.filesReadTextFile,
      async (_event, payload) =>
        safeReadTextFile(
          (readRequest) => request("files.read_text", readRequest),
          payload as FileReadTextRequest
        )
    ],
    [
      LYRA_CHANNELS.filesWriteTextFile,
      async (_event, payload) =>
        request("files.write_text", normalizeWriteTextRequest(payload as FileWriteTextRequest))
    ],
    [
      LYRA_CHANNELS.filesStatFile,
      async (_event, payload) =>
        request("files.stat", normalizeStatRequest(payload as FileStatRequest))
    ],
    [
      LYRA_CHANNELS.filesSearchText,
      async (_event, payload) =>
        request("files.search_text", payload as FileSearchTextRequest)
    ],
    [
      LYRA_CHANNELS.filesSelectAttachments,
      async () => {
        const result = await dialog.showOpenDialog({
          properties: ["openFile", "multiSelections"]
        });
        if (result.canceled) {
          return [];
        }
        return result.filePaths.map((filePath) => ({
          name: basename(filePath),
          path: filePath,
          kind: "file" as const
        }));
      }
    ],
    [
      LYRA_CHANNELS.filesSelectDirectories,
      async () => {
        const result = await dialog.showOpenDialog({
          properties: ["openDirectory", "multiSelections"]
        });
        if (result.canceled) {
          return [];
        }
        return result.filePaths.map((filePath) => ({
          name: basename(filePath),
          path: filePath,
          kind: "directory" as const
        }));
      }
    ]
  ];

  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, handler);
  }

  return {
    dispose: () => {
      unsubscribeRuntimeEvents();
      for (const [channel] of handlers) {
        ipcMain.removeHandler(channel);
      }
      directoryPatchSender.dispose();
      subscriptionsByWebContents.clear();
    }
  };
};
