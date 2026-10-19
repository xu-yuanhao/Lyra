import { describe, expect, test } from "vitest";

import type { FileManagerAppState } from "../types";
import type { FileManagerLocation } from "../../../../shared/file-manager";
import {
  deriveFileManagerSurfaceModel,
  formatFileManagerDiskBytes,
  getFileManagerDiskUsageTone,
  isFileManagerActiveFavorite,
  isFileManagerActiveLocation,
  splitFileManagerBreadcrumbs
} from "../surface-model";

const createState = (overrides: Partial<FileManagerAppState> = {}): FileManagerAppState => ({
  instanceId: "fm-1",
  status: "ready",
  viewKind: "directory",
  presentationMode: "list",
  currentLocation: {
    id: "tmp",
    title: "tmp",
    kind: "directory",
    path: "/Users/petehsu/Documents/Lyra"
  },
  parentPath: "/Users/petehsu/Documents",
  history: ["/Users/petehsu", "/Users/petehsu/Documents/Lyra"],
  historyIndex: 1,
  favorites: [
    {
      id: "favorite-1",
      title: "Lyra",
      kind: "directory",
      path: "/Users/petehsu/Documents/Lyra"
    }
  ],
  systemLocations: [],
  recentLocations: [],
  disks: [],
  devices: [],
  entries: [],
  trashEntries: [],
  downloadTasks: [],
  downloadStatus: "ready",
  downloadUrlDraft: "",
  downloadErrorMessage: undefined,
  selectedEntryIds: [],
  selectionAnchorId: undefined,
  ...overrides
} as FileManagerAppState);

describe("splitFileManagerBreadcrumbs", () => {
  test("splits posix paths into stable breadcrumb parts", () => {
    expect(splitFileManagerBreadcrumbs("/Users/petehsu/Documents")).toEqual([
      { id: "root", title: "/", path: "/" },
      { id: "/Users", title: "Users", path: "/Users" },
      { id: "/Users/petehsu", title: "petehsu", path: "/Users/petehsu" },
      {
        id: "/Users/petehsu/Documents",
        title: "Documents",
        path: "/Users/petehsu/Documents"
      }
    ]);
  });
});

describe("deriveFileManagerSurfaceModel", () => {
  test("derives navigation, favorite, chooser, and skeleton state", () => {
    const model = deriveFileManagerSurfaceModel(
      createState({
        entries: [
          {
            id: "entry-1",
            name: "app.ts",
            kind: "file",
            path: "/Users/petehsu/Documents/Lyra/app.ts",
            isHidden: false
          }
        ]
      }),
      {
        kind: "ai-project-bind",
        confirmLabel: "Bind",
        promptLabel: "Bind project",
        selectPlaceholder: "Open a directory",
        onConfirm: () => undefined
      },
      false
    );

    expect(model.canGoBack).toBe(true);
    expect(model.canGoForward).toBe(false);
    expect(model.canGoUp).toBe(true);
    expect(model.favoriteActive).toBe(true);
    expect(model.canConfirmCurrentDirectory).toBe(true);
    expect(model.canRenderBodyContent).toBe(true);
    expect(model.loadingSkeletonMetrics.directoryEntriesCount).toBe(1);
    expect(model.toolbar.canMoveSelectionToTrash).toBe(false);
    expect(model.sidebar.favorites[0]?.active).toBe(true);
    expect(model.body.kind).toBe("directory");
  });

  test("home sidebar survives lyrad optional paths serialized as null", () => {
    const model = deriveFileManagerSurfaceModel(
      createState({
        viewKind: "home",
        currentLocation: {
          id: "home",
          title: "This PC",
          kind: "home",
          specialId: "home",
          // Simulates a serialized payload where an optional path arrived as null.
          path: null
        } as unknown as FileManagerLocation,
        systemLocations: [
          {
            id: "special:home",
            title: "Home",
            kind: "special",
            path: "/home/petehsu",
            specialId: "home"
          },
          {
            id: "special:trash",
            title: "Trash",
            kind: "trash",
            specialId: "trash",
            path: null
          } as unknown as FileManagerLocation
        ]
      }),
      null,
      false
    );

    expect(model.sidebar.locations).toHaveLength(2);
    expect(model.sidebar.recents).toEqual([]);
    expect(model.body.kind).toBe("home");
  });

  test("derives toolbar state for trash views", () => {
    const model = deriveFileManagerSurfaceModel(
      createState({
        viewKind: "trash",
        currentLocation: {
          id: "trash",
          title: "Trash",
          kind: "trash",
          specialId: "trash"
        },
        selectedTrashEntryId: "trash-1",
        trashEntries: [
          {
            id: "trash-1",
            name: "old.txt",
            kind: "file",
            isHidden: false
          }
        ]
      }),
      null,
      false
    );

    expect(model.toolbar.canCreateDraft).toBe(false);
    expect(model.toolbar.canRestoreSelectionFromTrash).toBe(true);
    expect(model.toolbar.canEmptyTrash).toBe(true);
    expect(model.body.kind).toBe("trash");
    expect(model.body.kind === "trash" ? model.body.trash.entries[0]?.active : false).toBe(true);
  });

  test("derives download manager body and disables file toolbar actions", () => {
    const model = deriveFileManagerSurfaceModel(
      createState({
        viewKind: "downloads",
        currentLocation: {
          id: "download-manager",
          title: "Download Manager",
          kind: "special",
          specialId: "downloadManager"
        },
        parentPath: undefined,
        downloadUrlDraft: "https://example.com/file.zip",
        downloadTasks: [
          {
            id: "download-1",
            url: "https://example.com/file.zip",
            fileName: "file.zip",
            savePath: "/tmp/file.zip",
            directory: "/tmp",
            protocol: "https",
            source: "manual",
            state: "queued",
            receivedBytes: 0,
            totalBytes: 0,
            speedBytesPerSecond: 0,
            priority: "normal",
            connectionsRequested: 1,
            connectionsActive: 0,
            canResume: false,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:00.000Z"
          }
        ]
      }),
      null,
      false
    );

    expect(model.toolbar.canCreateDraft).toBe(false);
    expect(model.toolbar.favoriteDisabled).toBe(true);
    expect(model.sidebar.downloadsActive).toBe(true);
    expect(model.body.kind).toBe("downloads");
    expect(model.body.kind === "downloads" ? model.body.downloads.urlDraft : "").toBe("https://example.com/file.zip");
  });

  test("derives home disk, device, and recent render state", () => {
    const model = deriveFileManagerSurfaceModel(
      createState({
        viewKind: "home",
        currentLocation: {
          id: "home",
          title: "Files",
          kind: "home"
        },
        disks: [
          {
            id: "disk-1",
            title: "System",
            mountPath: "/",
            fileSystem: "apfs",
            kind: "system",
            totalBytes: 100,
            availableBytes: 10,
            usedBytes: 90,
            usageRatio: 0.9,
            isRemovable: false,
            canEject: false
          }
        ],
        devices: [
          {
            id: "device-1",
            title: "USB",
            devicePath: "/dev/disk2",
            kind: "removable",
            totalBytes: 2048,
            isRemovable: true,
            canMount: true,
            canEject: true
          }
        ],
        recentLocations: [
          {
            id: "recent-1",
            title: "Lyra",
            path: "/Users/petehsu/Documents/Lyra",
            lastOpenedAt: "2026-04-27T00:00:00.000Z"
          }
        ]
      }),
      null,
      false
    );

    expect(model.body.kind).toBe("home");
    if (model.body.kind !== "home") {
      return;
    }
    expect(model.body.home.disks[0]).toMatchObject({
      usagePercent: 90,
      usageTone: "danger",
      usageLabel: "90% · 90 B / 100 B",
      availableLabel: "10 B"
    });
    expect(model.body.home.devices[0]?.totalBytesLabel).toBe("2.0 KB");
    expect(model.body.home.isRecentEmpty).toBe(false);
  });

  test("derives loading skeleton slots from previous content sizes", () => {
    const model = deriveFileManagerSurfaceModel(
      createState({
        status: "loading",
        entries: Array.from({ length: 30 }, (_value, index) => ({
          id: `entry-${index}`,
          name: `entry-${index}.txt`,
          kind: "file",
          path: `/tmp/entry-${index}.txt`,
          isHidden: false
        }))
      }),
      null,
      true
    );

    expect(model.body.kind).toBe("loading");
    if (model.body.kind !== "loading") {
      return;
    }
    expect(model.body.skeletonSlots.directoryListSlots).toHaveLength(24);
    expect(model.canRenderBodyContent).toBe(false);
  });
});

describe("file-manager surface helpers", () => {
  test("formats disk bytes and usage tones", () => {
    expect(formatFileManagerDiskBytes(0)).toBe("0 B");
    expect(formatFileManagerDiskBytes(1536)).toBe("1.5 KB");
    expect(getFileManagerDiskUsageTone(0.69)).toBe("healthy");
    expect(getFileManagerDiskUsageTone(0.7)).toBe("warning");
    expect(getFileManagerDiskUsageTone(0.9)).toBe("danger");
  });

  test("detects active locations by special id, path, or id", () => {
    const state = createState({
      currentLocation: {
        id: "documents",
        title: "Documents",
        kind: "special",
        path: "/Users/petehsu/Documents",
        specialId: "documents"
      }
    });

    expect(isFileManagerActiveLocation(state, {
      id: "other",
      specialId: "documents"
    })).toBe(true);
    expect(isFileManagerActiveLocation(state, {
      id: "other",
      path: "/Users/petehsu/Documents"
    })).toBe(true);
    expect(isFileManagerActiveFavorite(state, {
      path: "/Users/petehsu/Documents"
    })).toBe(true);
  });
});
