import type { ComponentProps } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  WorkbenchTitlebarContextProvider,
  WorkbenchTitlebarContextSlot,
  WorkbenchTitlebarScopeProvider
} from "../../shell/titlebar-context";
import type { FileManagerAppState, FileManagerModel, FileManagerSurfaceLabels } from "../types";
import type {
  LyraDesktopApi
} from "../../../../shared/desktop-bridge";
import { FileManagerSurface } from "../view";

const labels: FileManagerSurfaceLabels = {
  title: "Files",
  locationHome: "Home",
  locationDesktop: "Desktop",
  locationDocuments: "Documents",
  locationDownloads: "Downloads",
  locationPictures: "Pictures",
  locationVideos: "Videos",
  downloadManagerTitle: "Download Manager",
  locationTrash: "Trash",
  homeSectionFavorites: "Favorites",
  homeSectionLocations: "Locations",
  homeSectionDevices: "Devices",
  homeSectionRecent: "Recent",
  navigationBack: "Back",
  navigationForward: "Forward",
  navigationUp: "Up",
  refresh: "Refresh",
  addFavorite: "Add favorite",
  removeFavorite: "Remove favorite",
  newFolder: "New folder",
  newFile: "New file",
  delete: "Delete",
  restore: "Restore",
  emptyTrash: "Empty trash",
  noRecentLocations: "No recent",
  emptyDirectory: "Empty directory",
  emptyTrashState: "Empty trash state",
  noFavorites: "No favorites",
  emptyDownloads: "No downloads",
  loading: "Loading",
  unavailable: "Unavailable",
  diskAvailable: "available",
  diskKindSystem: "System disk",
  diskKindLocal: "Local disk",
  diskKindRemovable: "Removable disk",
  diskKindExternal: "External disk",
  deviceUnmounted: "Unmounted",
  nameColumn: "Name",
  locationColumn: "Location",
  originalLocationColumn: "Original location",
  createPlaceholderFile: "File name",
  createPlaceholderDirectory: "Folder name",
  createConfirm: "Confirm",
  createCancel: "Cancel",
  contextOpen: "Open",
  contextOpenInTerminal: "Open in Terminal",
  contextMountDevice: "Mount device",
  contextMoveToTrash: "Move to trash",
  contextRestore: "Restore",
  contextEmptyTrash: "Empty trash",
  contextEjectDevice: "Eject",
  viewList: "List view",
  viewLarge: "Large view",
  downloadAddUrl: "Add download",
  downloadUrlPlaceholder: "Paste URL",
  downloadOpenFile: "Open file",
  downloadRevealFile: "Reveal file",
  downloadPause: "Pause",
  downloadResume: "Resume",
  downloadCancel: "Cancel",
  downloadRetry: "Retry",
  downloadRemove: "Remove",
  downloadPauseAll: "Pause all",
  downloadResumeAll: "Resume all",
  downloadCancelAll: "Cancel all",
  downloadPriority: "Priority",
  downloadPriorityLow: "Low",
  downloadPriorityNormal: "Normal",
  downloadPriorityHigh: "High",
  downloadStateQueued: "Queued",
  downloadStateDownloading: "Downloading",
  downloadStatePaused: "Paused",
  downloadStateCompleted: "Completed",
  downloadStateFailed: "Failed",
  downloadStateCanceled: "Canceled",
  downloadSourceBrowser: "Browser",
  downloadSourceManual: "Manual",
  downloadConnections: "{count} connections",
  downloadUnknownSize: "Unknown",
  downloadSpeedIdle: "Idle",
  downloadDurationSeconds: "{seconds}s",
  downloadDurationMinutes: "{minutes}m {seconds}s",
  downloadDurationHours: "{hours}h {minutes}m",
  downloadEta: "{duration} left",
  chooserBindProjectLabel: "Bind project",
  chooserSelectDirectoryPlaceholder: "Open a directory to bind",
  chooserSelectAnyDirectoryPlaceholder: "Open a directory to select it"
};

const createState = (overrides: Partial<FileManagerAppState> = {}): FileManagerAppState => ({
  instanceId: "fm-1",
  status: "ready",
  viewKind: "directory",
  presentationMode: "list",
  title: "Files",
  iconKey: "file-manager-directory",
  currentLocation: {
    id: "project",
    title: "Project",
    kind: "directory",
    path: "/tmp/project"
  },
  parentPath: "/tmp",
  history: [
    {
      id: "tmp",
      title: "tmp",
      kind: "directory",
      path: "/tmp"
    },
    {
      id: "project",
      title: "Project",
      kind: "directory",
      path: "/tmp/project"
    }
  ],
  historyIndex: 1,
  systemLocations: [
    {
      id: "trash",
      title: "Trash",
      kind: "trash",
      specialId: "trash"
    }
  ],
  favorites: [],
  recentLocations: [],
  disks: [],
  devices: [],
  entries: [
    {
      id: "dir-1",
      name: "src",
      kind: "directory",
      path: "/tmp/project/src",
      folderState: "non-empty",
      isHidden: false
    },
    {
      id: "file-1",
      name: "README.md",
      kind: "file",
      path: "/tmp/project/README.md",
      isHidden: false
    }
  ],
  trashEntries: [],
  downloadTasks: [],
  downloadStatus: "ready",
  downloadUrlDraft: "",
  downloadErrorMessage: undefined,
  directorySubscriptionId: undefined,
  directoryGeneration: undefined,
  selectedEntryIds: ["file-1"],
  selectionAnchorId: "file-1",
  selectedTrashEntryId: undefined,
  createDraft: undefined,
  errorMessage: undefined,
  ...overrides
});

const createModel = (): FileManagerModel => ({
  subscribe: vi.fn(() => () => undefined),
  createInstance: vi.fn(),
  getState: vi.fn(),
  ensureInstance: vi.fn(),
  syncExternalInstances: vi.fn(),
  syncTabInstances: vi.fn(),
  openHome: vi.fn().mockResolvedValue(undefined),
  openDirectory: vi.fn().mockResolvedValue(undefined),
  openTrash: vi.fn().mockResolvedValue(undefined),
  openDownloads: vi.fn().mockResolvedValue(undefined),
  goBack: vi.fn().mockResolvedValue(undefined),
  goForward: vi.fn().mockResolvedValue(undefined),
  goUp: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn().mockResolvedValue(undefined),
  setPresentationMode: vi.fn(),
  selectEntry: vi.fn(),
  selectTrashEntry: vi.fn(),
  beginCreateDraft: vi.fn(),
  updateCreateDraft: vi.fn(),
  cancelCreateDraft: vi.fn(),
  commitCreateDraft: vi.fn().mockResolvedValue(undefined),
  moveSelectionToTrash: vi.fn().mockResolvedValue(undefined),
  restoreSelectionFromTrash: vi.fn().mockResolvedValue(undefined),
  emptyTrash: vi.fn().mockResolvedValue(undefined),
  updateDownloadUrlDraft: vi.fn(),
  submitDownloadUrlDraft: vi.fn().mockResolvedValue(undefined),
  pauseDownload: vi.fn().mockResolvedValue(undefined),
  resumeDownload: vi.fn().mockResolvedValue(undefined),
  cancelDownload: vi.fn().mockResolvedValue(undefined),
  retryDownload: vi.fn().mockResolvedValue(undefined),
  removeDownload: vi.fn().mockResolvedValue(undefined),
  setDownloadPriority: vi.fn().mockResolvedValue(undefined),
  pauseAllDownloads: vi.fn().mockResolvedValue(undefined),
  resumeAllDownloads: vi.fn().mockResolvedValue(undefined),
  cancelAllDownloads: vi.fn().mockResolvedValue(undefined),
  openDownloadedFile: vi.fn().mockResolvedValue(undefined),
  revealDownloadedFile: vi.fn().mockResolvedValue(undefined),
  toggleCurrentDirectoryFavorite: vi.fn().mockResolvedValue(undefined),
  openEntryContextMenu: vi.fn(),
  openFavoriteContextMenu: vi.fn(),
  openLocationContextMenu: vi.fn(),
  openRecentLocationContextMenu: vi.fn(),
  openDiskContextMenu: vi.fn(),
  openDeviceContextMenu: vi.fn(),
  openTrashEntryContextMenu: vi.fn(),
  openDirectoryContextMenu: vi.fn(),
  openTrashContextMenu: vi.fn()
});

const downloadsSlot = {
  title: "Download Manager",
  repairLabel: "Repair module",
  description: "This module is unavailable.",
  startFailedDescription: "This module failed to start.",
  onRepair: vi.fn()
};

const renderFileManagerSurface = (
  props: Omit<ComponentProps<typeof FileManagerSurface>, "downloadsSlot">
) => {
  const scopeId = "file-manager-test";
  return render(
    <WorkbenchTitlebarContextProvider activeScopeId={scopeId}>
      <WorkbenchTitlebarScopeProvider scopeId={scopeId}>
        <FileManagerSurface downloadsSlot={downloadsSlot} {...props} />
      </WorkbenchTitlebarScopeProvider>
      <WorkbenchTitlebarContextSlot />
    </WorkbenchTitlebarContextProvider>
  );
};

describe("FileManagerSurface", () => {
  test("routes toolbar actions through the file manager model", () => {
    const model = createModel();
    renderFileManagerSurface({
      state: createState(),
      labels,
      model,
      onOpenFile: vi.fn()
    });

    fireEvent.click(screen.getByLabelText("Up"));
    fireEvent.click(screen.getByLabelText("Large view"));
    fireEvent.click(screen.getByLabelText("New file"));
    fireEvent.click(screen.getByLabelText("Delete"));

    expect(model.goUp).toHaveBeenCalledWith("fm-1");
    expect(model.setPresentationMode).toHaveBeenCalledWith("fm-1", "large");
    expect(model.beginCreateDraft).toHaveBeenCalledWith("fm-1", "file");
    expect(model.moveSelectionToTrash).toHaveBeenCalledWith("fm-1");
  });

  test("opens files and directories from directory rows", () => {
    const model = createModel();
    const onOpenFile = vi.fn();
    renderFileManagerSurface({
      state: createState(),
      labels,
      model,
      onOpenFile
    });

    fireEvent.doubleClick(screen.getByText("README.md").closest("button")!);
    fireEvent.doubleClick(screen.getByText("src").closest("button")!);

    expect(onOpenFile).toHaveBeenCalledWith("/tmp/project/README.md");
    expect(model.openDirectory).toHaveBeenCalledWith("fm-1", "/tmp/project/src");
  });

  test("routes special trash locations and chooser confirmation", () => {
    const model = createModel();
    const onConfirm = vi.fn();
    renderFileManagerSurface({
      state: createState(),
      labels,
      model,
      onOpenFile: vi.fn(),
      chooser: {
        kind: "ai-project-bind",
        confirmLabel: "Bind",
        promptLabel: "Bind project",
        selectPlaceholder: "Open a directory",
        onConfirm
      }
    });

    fireEvent.click(screen.getByText("Trash"));
    fireEvent.click(screen.getByRole("button", { name: "Bind" }));

    expect(model.openTrash).toHaveBeenCalledWith("fm-1");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("opens the download manager from the file manager sidebar", () => {
    const model = createModel();
    renderFileManagerSurface({
      state: createState(),
      labels,
      model,
      onOpenFile: vi.fn()
    });

    fireEvent.click(screen.getByText("Download Manager"));

    expect(model.openDownloads).toHaveBeenCalledWith("fm-1");
  });

  test("renders Downloads as a complete-module files slot, not a Core list", () => {
    const model = createModel();
    renderFileManagerSurface({
      state: createState({
        viewKind: "downloads",
        title: "Download Manager",
        iconKey: "file-manager-download-manager",
        currentLocation: {
          id: "download-manager",
          title: "Download Manager",
          kind: "special",
          specialId: "downloadManager"
        },
        parentPath: undefined,
        entries: [],
        selectedEntryIds: [],
        selectionAnchorId: undefined,
        downloadUrlDraft: "https://example.com/build.zip",
        downloadTasks: [
          {
            id: "download-1",
            url: "https://example.com/build.zip",
            fileName: "build.zip",
            savePath: "/tmp/build.zip",
            directory: "/tmp",
            protocol: "https",
            source: "manual",
            state: "downloading",
            receivedBytes: 512,
            totalBytes: 1024,
            speedBytesPerSecond: 256,
            estimatedRemainingMs: 120_000,
            priority: "normal",
            connectionsRequested: 1,
            connectionsActive: 1,
            canResume: true,
            createdAt: "2026-05-04T00:00:00.000Z",
            updatedAt: "2026-05-04T00:00:01.000Z"
          }
        ]
      }),
      labels,
      model,
      onOpenFile: vi.fn()
    });

    expect(document.querySelector(".lyra-file-manager-download-list")).toBeNull();
    expect(screen.queryByPlaceholderText("Paste URL")).toBeNull();
    expect(screen.getByText("This module is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Repair module" })).toBeInTheDocument();
  });

  test("shows a directory-selection placeholder before chooser confirmation is available", () => {
    const model = createModel();
    renderFileManagerSurface({
      state: createState({
        viewKind: "home",
        currentLocation: null,
        parentPath: undefined,
        entries: [],
        selectedEntryIds: [],
        selectionAnchorId: undefined
      }),
      labels,
      model,
      onOpenFile: vi.fn(),
      chooser: {
        kind: "ai-project-bind",
        confirmLabel: "Bind",
        promptLabel: "Bind project",
        selectPlaceholder: "Open a directory to bind",
        onConfirm: vi.fn()
      }
    });

    expect(screen.getByText("Open a directory to bind")).toBeInTheDocument();
    expect(screen.queryByText("Unavailable")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bind" })).toBeDisabled();
  });

  test("routes create draft input edits and keyboard decisions", () => {
    const model = createModel();
    renderFileManagerSurface({
      state: createState({
        createDraft: {
          kind: "file",
          value: "notes.md"
        }
      }),
      labels,
      model,
      onOpenFile: vi.fn()
    });

    const input = screen.getByPlaceholderText("File name");

    fireEvent.change(input, { target: { value: "plan.md" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(model.updateCreateDraft).toHaveBeenCalledWith("fm-1", "plan.md");
    expect(model.commitCreateDraft).toHaveBeenCalledWith("fm-1");
    expect(model.cancelCreateDraft).toHaveBeenCalledWith("fm-1");
  });
});
