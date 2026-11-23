import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { LyraDesktopApi } from "../../../../shared/desktop-bridge";
import type { FileManagerEntry, FileManagerDirectoryPatch } from "../../../../shared/file-manager";
import type { FileEditorModel } from "../../file-editor";
import type { ImageViewerLabels, ImageViewerModel } from "../../image-viewer/types";
import {
  applyWorkspaceDiagnostics,
  resetWorkspaceProblemsStore
} from "../../bottom-aux/problems";
import {
  WorkbenchTitlebarContextProvider,
  WorkbenchTitlebarContextSlot,
  WorkbenchTitlebarScopeProvider
} from "../../shell/titlebar-context";
import type { AgentProjectTreeAppState, AgentProjectTreeLabels } from "../types";
import { useAgentProjectTreeModel } from "../service";
import {
  clearFileManagerEntryDragPayload,
  readFileManagerEntryDragPayload
} from "../../file-manager/drag-transfer";
import { AgentProjectTreeSurface, applyPatchToEntries, isHydrationOnlyDirectoryPatch } from "../view";

const labels: AgentProjectTreeLabels = {
  title: "Project Tree",
  open: "Open Project Tree",
  openSourceControl: "Open Source Control",
  refresh: "Refresh tree",
  loading: "Loading...",
  emptyDirectory: "Empty directory",
  unavailable: "File system API unavailable",
  selectFileTitle: "Select a file",
  selectFileDescription: "Choose a file",
  newFile: "New File",
  newFolder: "New Folder",
  revealInFolder: "Open Containing Folder",
  openInImagePreview: "Open in Image Preview",
  openInTerminal: "Open in Terminal",
  copyPath: "Copy Path",
  copyRelativePath: "Copy Relative Path",
  moveToTrash: "Move to Trash",
  createFileTitle: "New File",
  createFolderTitle: "New Folder",
  createFilePlaceholder: "Enter file name",
  createFolderPlaceholder: "Enter folder name",
  createConfirm: "Create",
  cancelAction: "Cancel",
  deleteConfirmTitle: "Move to Trash?",
  deleteConfirmDescription: "{name} will be moved to Trash.",
  deleteConfirmAction: "Move to Trash"
};

const fileEditorLabels = {
  loading: "Loading",
  unsupported: "Unsupported",
  unavailable: "Unavailable",
  readOnly: "Read only",
  conflict: "Conflict",
  retry: "Retry",
  save: "Save",
  openDiff: "Open diff",
  closeDiff: "Close diff"
};

const createState = (overrides: Partial<AgentProjectTreeAppState> = {}): AgentProjectTreeAppState => ({
  instanceId: "agent-project-tree-session-1",
  agentSessionId: "session-1",
  rootPath: "/Users/petehsu/Documents/Lyra",
  title: "Lyra",
  selectedPath: null,
  selectedFilePath: null,
  editorInstanceId: null,
  editorTabs: [],
  expandedPaths: ["/Users/petehsu/Documents/Lyra"],
  ...overrides
});

const imageViewerLabels: ImageViewerLabels = {
  loading: "Loading",
  unavailable: "Unavailable",
  unsupported: "Unsupported",
  retry: "Retry",
  fit: "Fit",
  actualSize: "Actual size",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  reset: "Reset",
  rotateLeft: "Rotate left",
  rotateRight: "Rotate right",
  background: "Background",
  previous: "Previous",
  next: "Next",
  nativeTiles: "Native tiles",
  sourceOnly: "Original source",
  metadata: "Metadata"
};

const createImageViewerModel = (): ImageViewerModel => ({
  createInstance: vi.fn(),
  findInstanceByPath: vi.fn(() => null),
  getState: vi.fn(() => null),
  ensureInstance: vi.fn(),
  syncTabInstances: vi.fn(),
  syncExternalInstances: vi.fn(),
  subscribe: vi.fn(() => () => undefined),
  openImage: vi.fn().mockResolvedValue(undefined),
  openAdjacent: vi.fn().mockResolvedValue(undefined),
  readTile: vi.fn().mockRejectedValue(new Error("unexpected tile read")),
  setViewport: vi.fn(),
  resetViewport: vi.fn(),
  touchInstance: vi.fn()
});

const createFileEditorModel = (): FileEditorModel => ({
  createInstance: vi.fn(),
  findInstanceByPath: vi.fn(() => null),
  getState: vi.fn(() => null),
  ensureInstance: vi.fn(),
  syncExternalInstances: vi.fn(),
  syncTabInstances: vi.fn(),
  openFile: vi.fn().mockResolvedValue(undefined),
  hydrateIfNeeded: vi.fn().mockResolvedValue(undefined),
  touchInstance: vi.fn(),
  revealLocation: vi.fn(),
  clearRevealLocation: vi.fn(),
  setContent: vi.fn(),
  applyExternalContent: vi.fn(),
  save: vi.fn().mockResolvedValue(undefined),
  statFile: vi.fn().mockResolvedValue(null),
  requestCompletion: vi.fn().mockResolvedValue([]),
  requestHover: vi.fn().mockResolvedValue(null),
  requestDefinition: vi.fn().mockResolvedValue([]),
  requestReferences: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn(() => () => undefined),
  subscribeLspEvents: vi.fn(() => () => undefined)
});

const createTreeModel = () => ({
  getState: vi.fn(() => createState()),
  ensureInstance: vi.fn(),
  syncTabInstances: vi.fn(),
  revealPath: vi.fn(),
  openFile: vi.fn().mockResolvedValue(undefined),
  activateEditorTab: vi.fn(),
  closeEditorTab: vi.fn(),
  pinEditorTab: vi.fn(),
  toggleDirectory: vi.fn(),
  updateRoot: vi.fn()
});

const createDesktopApi = () => {
  const readDirectory = vi.fn(async () => ({
    location: {
      id: "root",
      title: "Lyra",
      kind: "directory" as const,
      path: "/Users/petehsu/Documents/Lyra"
    },
    entries: [
      {
        id: "src",
        name: "src",
        path: "/Users/petehsu/Documents/Lyra/src",
        kind: "directory" as const,
        isHidden: false,
        folderState: "non-empty" as const
      },
      {
        id: "package",
        name: "package.json",
        path: "/Users/petehsu/Documents/Lyra/package.json",
        kind: "file" as const,
        extension: "json",
        isHidden: false
      },
      {
        id: "photo",
        name: "photo.png",
        path: "/Users/petehsu/Documents/Lyra/photo.png",
        kind: "file" as const,
        extension: "png",
        isHidden: false
      }
    ]
  }));
  return {
    api: {
      files: { readDirectory }
    } as unknown as LyraDesktopApi,
    readDirectory
  };
};

afterEach(() => {
  resetWorkspaceProblemsStore();
});

describe("AgentProjectTreeSurface", () => {
  test("loads the bound project root and opens files through the embedded editor model", async () => {
    const { api, readDirectory } = createDesktopApi();
    const onOpenGitPanel = vi.fn();
    const model = createTreeModel();
    const { container } = render(
      <WorkbenchTitlebarContextProvider activeScopeId="agent-project-tree-scope">
        <WorkbenchTitlebarScopeProvider scopeId="agent-project-tree-scope">
          <AgentProjectTreeSurface
            desktopApi={api}
            labels={labels}
            state={createState()}
            model={model}
            fileEditorModel={createFileEditorModel()}
            fileEditorLabels={fileEditorLabels}
            imageViewerModel={createImageViewerModel()}
            imageViewerLabels={imageViewerLabels}
            themeSignature="test"
            onOpenGitPanel={onOpenGitPanel}
          />
        </WorkbenchTitlebarScopeProvider>
        <WorkbenchTitlebarContextSlot />
      </WorkbenchTitlebarContextProvider>
    );

    expect(screen.getByRole("button", { name: "Refresh tree" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Source Control" }));
    expect(onOpenGitPanel).toHaveBeenCalledWith({
      sessionId: "session-1",
      workingDir: "/Users/petehsu/Documents/Lyra"
    });
    expect(container.querySelectorAll(".lyra-agent-project-tree-root-row")).toHaveLength(1);
    expect(container.querySelector(".lyra-agent-project-tree-root-refresh")).toBeNull();
    expect(container.querySelector(".lyra-agent-project-tree-header")).toBeNull();
    expect(await screen.findByText("package.json")).toBeInTheDocument();
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(readDirectory).toHaveBeenCalledWith({ path: "/Users/petehsu/Documents/Lyra" });

    fireEvent.click(screen.getByRole("button", { name: /package\.json/u }));
    await waitFor(() => {
      expect(model.openFile).toHaveBeenCalledWith(
        "agent-project-tree-session-1",
        "/Users/petehsu/Documents/Lyra/package.json"
      );
    });
  });

  test("drags a project tree file with the same attachment payload as the file manager", async () => {
    clearFileManagerEntryDragPayload();
    const { api } = createDesktopApi();
    render(
      <AgentProjectTreeSurface
        desktopApi={api}
        labels={labels}
        state={createState()}
        model={createTreeModel()}
        fileEditorModel={createFileEditorModel()}
        fileEditorLabels={fileEditorLabels}
        imageViewerModel={createImageViewerModel()}
        imageViewerLabels={imageViewerLabels}
        themeSignature="test"
      />
    );

    const row = await screen.findByRole("button", {
      name: "/Users/petehsu/Documents/Lyra/package.json"
    });
    const dataTransfer = {
      setData: vi.fn(),
      setDragImage: vi.fn(),
      effectAllowed: "none",
      getData: () => "",
      types: []
    };
    fireEvent.dragStart(row, { dataTransfer });
    expect(readFileManagerEntryDragPayload(dataTransfer as unknown as DataTransfer)).toMatchObject({
      name: "package.json",
      kind: "file",
      source: "directory",
      path: "/Users/petehsu/Documents/Lyra/package.json"
    });
    fireEvent.dragEnd(row);
    expect(readFileManagerEntryDragPayload(dataTransfer as unknown as DataTransfer)).toBeNull();
  });

  test("does not expose project rebinding inside the session project tree", async () => {
    const { api } = createDesktopApi();
    const model = createTreeModel();
    render(
      <AgentProjectTreeSurface
        desktopApi={api}
        labels={labels}
        state={createState()}
        model={model}
        fileEditorModel={createFileEditorModel()}
        fileEditorLabels={fileEditorLabels}
        imageViewerModel={createImageViewerModel()}
        imageViewerLabels={imageViewerLabels}
        themeSignature="test"
      />
    );

    expect(await screen.findByText("package.json")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Change bound project" })).not.toBeInTheDocument();
    expect(model.updateRoot).not.toHaveBeenCalled();
  });

  test("shows explorer actions on a file context menu and omits trash on the root", async () => {
    const { api } = createDesktopApi();
    const model = createTreeModel();
    const { container } = render(
      <AgentProjectTreeSurface
        desktopApi={api}
        labels={labels}
        state={createState()}
        model={model}
        fileEditorModel={createFileEditorModel()}
        fileEditorLabels={fileEditorLabels}
        imageViewerModel={createImageViewerModel()}
        imageViewerLabels={imageViewerLabels}
        themeSignature="test"
        openDialog={vi.fn()}
        onOpenFile={vi.fn()}
        onOpenTerminal={vi.fn()}
      />
    );

    expect(await screen.findByText("package.json")).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("button", { name: /package\.json/u }));
    expect(screen.getByRole("menuitem", { name: "New File" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open Containing Folder" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Open in Terminal" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Path" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Copy Relative Path" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Move to Trash" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Open in Image Preview" })).toBeNull();

    fireEvent.contextMenu(screen.getByRole("button", { name: /photo\.png/u }));
    expect(screen.getByRole("menuitem", { name: "Open in Image Preview" })).toBeInTheDocument();

    fireEvent.contextMenu(container.querySelector(".lyra-agent-project-tree-root-row") as HTMLElement);
    expect(screen.getByRole("menuitem", { name: "New Folder" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Move to Trash" })).toBeNull();
  });

  test("highlights the open file and shows editor tabs above the code pane", async () => {
    const { api } = createDesktopApi();
    const model = createTreeModel();
    render(
      <AgentProjectTreeSurface
        desktopApi={api}
        labels={labels}
        state={createState({
          selectedPath: "/Users/petehsu/Documents/Lyra/package.json",
          selectedFilePath: "/Users/petehsu/Documents/Lyra/package.json",
          editorInstanceId: "editor-package",
          editorTabs: [{
            editorInstanceId: "editor-package",
            filePath: "/Users/petehsu/Documents/Lyra/package.json",
            preview: true
          }]
        })}
        model={model}
        fileEditorModel={createFileEditorModel()}
        fileEditorLabels={fileEditorLabels}
        imageViewerModel={createImageViewerModel()}
        imageViewerLabels={imageViewerLabels}
        themeSignature="test"
      />
    );

    const row = await screen.findByRole("button", { name: /package\.json/u });
    expect(row).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("tab", { name: "package.json" })).toBeInTheDocument();
  });

  test("shows the office preview in the tree pane for a spreadsheet", async () => {
    const { api } = createDesktopApi();
    render(
      <AgentProjectTreeSurface
        desktopApi={api}
        labels={labels}
        state={createState({
          selectedPath: "/Users/petehsu/Documents/Lyra/book.xlsx",
          selectedFilePath: "/Users/petehsu/Documents/Lyra/book.xlsx",
          editorInstanceId: "editor-book",
          editorTabs: [{
            editorInstanceId: "editor-book",
            filePath: "/Users/petehsu/Documents/Lyra/book.xlsx",
            preview: true
          }]
        })}
        model={createTreeModel()}
        fileEditorModel={createFileEditorModel()}
        fileEditorLabels={fileEditorLabels}
        imageViewerModel={createImageViewerModel()}
        imageViewerLabels={imageViewerLabels}
        themeSignature="test"
      />
    );

    const surface = await screen.findByLabelText("office-viewer-surface");
    expect(surface).toHaveTextContent("book.xlsx");
    expect(screen.queryByText("The current file encoding is not supported for editing.")).toBeNull();
  });

  test("shows the sqlite preview in the tree pane for a database", async () => {
    const { api } = createDesktopApi();
    render(
      <AgentProjectTreeSurface
        desktopApi={api}
        labels={labels}
        state={createState({
          selectedPath: "/Users/petehsu/Documents/Lyra/notes.sqlite",
          selectedFilePath: "/Users/petehsu/Documents/Lyra/notes.sqlite",
          editorInstanceId: "editor-sqlite",
          editorTabs: [{
            editorInstanceId: "editor-sqlite",
            filePath: "/Users/petehsu/Documents/Lyra/notes.sqlite",
            preview: true
          }]
        })}
        model={createTreeModel()}
        fileEditorModel={createFileEditorModel()}
        fileEditorLabels={fileEditorLabels}
        imageViewerModel={createImageViewerModel()}
        imageViewerLabels={imageViewerLabels}
        themeSignature="test"
      />
    );

    const surface = await screen.findByLabelText("sqlite-viewer-surface");
    expect(surface).toHaveTextContent("notes.sqlite");
    expect(screen.queryByText("The current file encoding is not supported for editing.")).toBeNull();
  });
});

describe("useAgentProjectTreeModel", () => {
  test("reveals a project path by selecting it and expanding its ancestors", () => {
    const fileEditorModel = createFileEditorModel();
    const imageViewerModel = createImageViewerModel();
    const onMetaChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentProjectTreeModel({ fileEditorModel, imageViewerModel, onMetaChange })
    );

    act(() => {
      result.current.ensureInstance("tree-1", {
        agentSessionId: "session-1",
        rootPath: "/project",
        title: "project"
      });
    });

    act(() => {
      result.current.revealPath("tree-1", "/project/src/components");
    });

    const state = result.current.getState("tree-1");
    expect(state?.selectedPath).toBe("/project/src/components");
    expect(state?.selectedFilePath).toBeNull();
    expect(state?.editorInstanceId).toBeNull();
    expect(state?.expandedPaths).toEqual([
      "/project",
      "/project/src",
      "/project/src/components"
    ]);
    expect(fileEditorModel.openFile).not.toHaveBeenCalled();
    expect(imageViewerModel.openImage).not.toHaveBeenCalled();
  });

  test("keeps embedded file editor instances outside normal file-editor tabs", async () => {
    const fileEditorModel = createFileEditorModel();
    const imageViewerModel = createImageViewerModel();
    const onMetaChange = vi.fn();
    const { result } = renderHook(() =>
      useAgentProjectTreeModel({ fileEditorModel, imageViewerModel, onMetaChange })
    );

    act(() => {
      result.current.ensureInstance("tree-1", {
        agentSessionId: "session-1",
        rootPath: "/project",
        title: "project"
      });
    });

    await act(async () => {
      await result.current.openFile("tree-1", "/project/src/package.json", { line: 12 });
    });

    const editorInstanceId = result.current.getState("tree-1")?.editorInstanceId;
    expect(editorInstanceId).toMatch(/^agent-project-tree-editor-tree-1-[0-9a-f]+$/u);
    expect(result.current.getState("tree-1")?.editorTabs).toEqual([
      {
        editorInstanceId,
        filePath: "/project/src/package.json",
        preview: true
      }
    ]);
    expect(fileEditorModel.ensureInstance).toHaveBeenCalledWith(
      editorInstanceId,
      {
        filePath: "/project/src/package.json",
        fileSessionId: "agent-project-tree:session-1"
      }
    );
    expect(fileEditorModel.openFile).toHaveBeenCalledWith(
      editorInstanceId,
      "/project/src/package.json"
    );
    expect(fileEditorModel.revealLocation).toHaveBeenCalledWith(
      editorInstanceId,
      { line: 12 }
    );
    expect(result.current.getState("tree-1")?.selectedPath).toBe("/project/src/package.json");
    expect(result.current.getState("tree-1")?.expandedPaths).toEqual([
      "/project",
      "/project/src"
    ]);
    expect(fileEditorModel.syncExternalInstances).toHaveBeenLastCalledWith([
      editorInstanceId
    ]);
    expect(imageViewerModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
    expect(imageViewerModel.openImage).not.toHaveBeenCalled();

    act(() => {
      result.current.syncTabInstances([]);
    });
    expect(fileEditorModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
    expect(imageViewerModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
  });

  test("opens raster images through the image viewer instead of the file editor", async () => {
    const fileEditorModel = createFileEditorModel();
    const imageViewerModel = createImageViewerModel();
    const { result } = renderHook(() =>
      useAgentProjectTreeModel({
        fileEditorModel,
        imageViewerModel,
        onMetaChange: vi.fn()
      })
    );

    act(() => {
      result.current.ensureInstance("tree-1", {
        agentSessionId: "session-1",
        rootPath: "/project",
        title: "project"
      });
    });

    await act(async () => {
      await result.current.openFile("tree-1", "/project/photo.png");
    });

    const editorInstanceId = result.current.getState("tree-1")?.editorInstanceId;
    expect(fileEditorModel.openFile).not.toHaveBeenCalled();
    expect(fileEditorModel.ensureInstance).not.toHaveBeenCalled();
    expect(imageViewerModel.ensureInstance).toHaveBeenCalledWith(editorInstanceId, {
      filePath: "/project/photo.png"
    });
    expect(imageViewerModel.openImage).toHaveBeenCalledWith(editorInstanceId, "/project/photo.png");
    expect(imageViewerModel.syncExternalInstances).toHaveBeenLastCalledWith([editorInstanceId]);
    expect(fileEditorModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
  });

  test("opens a spreadsheet in the tree pane instead of the file editor", async () => {
    const fileEditorModel = createFileEditorModel();
    const imageViewerModel = createImageViewerModel();
    const { result } = renderHook(() =>
      useAgentProjectTreeModel({
        fileEditorModel,
        imageViewerModel,
        onMetaChange: vi.fn()
      })
    );

    act(() => {
      result.current.ensureInstance("tree-1", {
        agentSessionId: "session-1",
        rootPath: "/project",
        title: "project"
      });
    });

    await act(async () => {
      await result.current.openFile("tree-1", "/project/book.xlsx");
    });

    expect(result.current.getState("tree-1")?.selectedFilePath).toBe("/project/book.xlsx");
    expect(fileEditorModel.openFile).not.toHaveBeenCalled();
    expect(fileEditorModel.ensureInstance).not.toHaveBeenCalled();
    expect(imageViewerModel.openImage).not.toHaveBeenCalled();
    expect(fileEditorModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
    expect(imageViewerModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
  });

  test("opens a sqlite database in the tree pane instead of the file editor", async () => {
    const fileEditorModel = createFileEditorModel();
    const imageViewerModel = createImageViewerModel();
    const { result } = renderHook(() =>
      useAgentProjectTreeModel({
        fileEditorModel,
        imageViewerModel,
        onMetaChange: vi.fn()
      })
    );

    act(() => {
      result.current.ensureInstance("tree-1", {
        agentSessionId: "session-1",
        rootPath: "/project",
        title: "project"
      });
    });

    await act(async () => {
      await result.current.openFile("tree-1", "/project/notes.db");
    });

    expect(result.current.getState("tree-1")?.selectedFilePath).toBe("/project/notes.db");
    expect(fileEditorModel.openFile).not.toHaveBeenCalled();
    expect(fileEditorModel.ensureInstance).not.toHaveBeenCalled();
    expect(imageViewerModel.openImage).not.toHaveBeenCalled();
    expect(fileEditorModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
  });

  test("opens svg through the file editor so the tree keeps a code view", async () => {
    const fileEditorModel = createFileEditorModel();
    const imageViewerModel = createImageViewerModel();
    const { result } = renderHook(() =>
      useAgentProjectTreeModel({
        fileEditorModel,
        imageViewerModel,
        onMetaChange: vi.fn()
      })
    );

    act(() => {
      result.current.ensureInstance("tree-1", {
        agentSessionId: "session-1",
        rootPath: "/project",
        title: "project"
      });
    });

    await act(async () => {
      await result.current.openFile("tree-1", "/project/logo.svg");
    });

    const editorInstanceId = result.current.getState("tree-1")?.editorInstanceId;
    expect(imageViewerModel.openImage).not.toHaveBeenCalled();
    expect(fileEditorModel.ensureInstance).toHaveBeenCalledWith(editorInstanceId, {
      filePath: "/project/logo.svg",
      fileSessionId: "agent-project-tree:session-1"
    });
    expect(fileEditorModel.openFile).toHaveBeenCalledWith(editorInstanceId, "/project/logo.svg");
    expect(fileEditorModel.syncExternalInstances).toHaveBeenLastCalledWith([editorInstanceId]);
    expect(imageViewerModel.syncExternalInstances).toHaveBeenLastCalledWith([]);
  });

  test("turns the Problems titlebar icon red when this project has diagnostics", async () => {
    const listenerRef: { current: ((event: { readonly kind: string; readonly filePath?: string; readonly diagnostics?: readonly unknown[] }) => void) | null } = {
      current: null
    };
    const readDirectory = vi.fn(async () => ({
      location: {
        id: "root",
        title: "Lyra",
        kind: "directory" as const,
        path: "/Users/petehsu/Documents/Lyra"
      },
      entries: []
    }));
    const api = {
      files: { readDirectory },
      lsp: {
        onEvent: (callback: (event: never) => void) => {
          listenerRef.current = callback as typeof listenerRef.current;
          return () => {
            listenerRef.current = null;
          };
        }
      }
    } as unknown as LyraDesktopApi;
    render(
      <WorkbenchTitlebarContextProvider activeScopeId="agent-project-tree-scope">
        <WorkbenchTitlebarScopeProvider scopeId="agent-project-tree-scope">
          <AgentProjectTreeSurface
            desktopApi={api}
            labels={{ ...labels, openProblems: "Problems" }}
            state={createState()}
            model={createTreeModel()}
            fileEditorModel={createFileEditorModel()}
            fileEditorLabels={fileEditorLabels}
            imageViewerModel={createImageViewerModel()}
            imageViewerLabels={imageViewerLabels}
            themeSignature="test"
            onOpenProblems={vi.fn()}
          />
        </WorkbenchTitlebarScopeProvider>
        <WorkbenchTitlebarContextSlot />
      </WorkbenchTitlebarContextProvider>
    );

    const button = screen.getByRole("button", { name: "Problems" });
    expect(button.classList.contains("lyra-titlebar-problems-active")).toBe(false);

    await waitFor(() => {
      expect(listenerRef.current).not.toBeNull();
    });
    act(() => {
      listenerRef.current?.({
        kind: "diagnostics",
        filePath: "/Users/petehsu/Documents/Lyra/apps/desktop/tsconfig.json",
        diagnostics: [{
          filePath: "/Users/petehsu/Documents/Lyra/apps/desktop/tsconfig.json",
          severity: 1,
          message: "Option 'baseUrl' is deprecated",
          startLine: 12,
          startCharacter: 4,
          endLine: 12,
          endCharacter: 13
        }]
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Problems" })).toHaveClass("lyra-titlebar-problems-active");
    });
  });

  test("turns the Problems titlebar icon red from diagnostics collected before the tree mounted", () => {
    applyWorkspaceDiagnostics("/Users/petehsu/Documents/Lyra/apps/desktop/tsconfig.json", [{
      filePath: "/Users/petehsu/Documents/Lyra/apps/desktop/tsconfig.json",
      severity: 1,
      message: "Option 'baseUrl' is deprecated",
      startLine: 12,
      startCharacter: 4,
      endLine: 12,
      endCharacter: 13
    }]);
    render(
      <WorkbenchTitlebarContextProvider activeScopeId="agent-project-tree-scope">
        <WorkbenchTitlebarScopeProvider scopeId="agent-project-tree-scope">
          <AgentProjectTreeSurface
            desktopApi={createDesktopApi().api}
            labels={{ ...labels, openProblems: "Problems" }}
            state={createState()}
            model={createTreeModel()}
            fileEditorModel={createFileEditorModel()}
            fileEditorLabels={fileEditorLabels}
            imageViewerModel={createImageViewerModel()}
            imageViewerLabels={imageViewerLabels}
            themeSignature="test"
            onOpenProblems={vi.fn()}
          />
        </WorkbenchTitlebarScopeProvider>
        <WorkbenchTitlebarContextSlot />
      </WorkbenchTitlebarContextProvider>
    );
    expect(screen.getByRole("button", { name: "Problems" })).toHaveClass("lyra-titlebar-problems-active");
  });
});

describe("applyPatchToEntries", () => {
  const baseEntries: FileManagerEntry[] = [
    { id: "a", name: "a.ts", path: "/p/a.ts", kind: "file", extension: "ts", isHidden: false },
    { id: "d", name: "dir", path: "/p/dir", kind: "directory", isHidden: false, folderState: "non-empty" }
  ];

  const makePatch = (overrides: Partial<FileManagerDirectoryPatch>): FileManagerDirectoryPatch => ({
    subscriptionId: "sub-1",
    directoryPath: "/p",
    generation: 1,
    kind: "create",
    ...overrides
  });

  test("adds a new entry on create", () => {
    const newEntry: FileManagerEntry = {
      id: "b", name: "b.ts", path: "/p/b.ts", kind: "file", extension: "ts", isHidden: false
    };
    const result = applyPatchToEntries(baseEntries, makePatch({ kind: "create", entry: newEntry }));
    expect(result.some((e) => e.path === "/p/b.ts")).toBe(true);
  });

  test("removes an entry on remove", () => {
    const result = applyPatchToEntries(baseEntries, makePatch({ kind: "remove", path: "/p/a.ts" }));
    expect(result.some((e) => e.path === "/p/a.ts")).toBe(false);
  });

  test("moves an entry on rename", () => {
    const movedEntry: FileManagerEntry = {
      id: "a", name: "a-renamed.ts", path: "/p/a-renamed.ts", kind: "file", extension: "ts", isHidden: false
    };
    const result = applyPatchToEntries(baseEntries, makePatch({
      kind: "rename", oldPath: "/p/a.ts", entry: movedEntry
    }));
    expect(result.some((e) => e.path === "/p/a.ts")).toBe(false);
    expect(result.some((e) => e.path === "/p/a-renamed.ts")).toBe(true);
  });

  test("replaces entries on reset", () => {
    const resetEntries: FileManagerEntry[] = [
      { id: "x", name: "x.ts", path: "/p/x.ts", kind: "file", extension: "ts", isHidden: false }
    ];
    const snapshot: NonNullable<FileManagerDirectoryPatch["snapshot"]> = {
      location: {
        id: "/p",
        title: "p",
        kind: "directory",
        path: "/p"
      },
      entries: resetEntries,
      generation: 2
    };
    const result = applyPatchToEntries(baseEntries, makePatch({
      kind: "reset",
      snapshot
    }));
    expect(result.length).toBe(1);
    expect(result[0]?.path).toBe("/p/x.ts");
  });

  test("treats folder_state hydration as identity-only", () => {
    const hydrated: FileManagerEntry = {
      id: "d",
      name: "dir",
      path: "/p/dir",
      kind: "directory",
      isHidden: false,
      folderState: "empty",
      hydrationState: "complete"
    };
    expect(isHydrationOnlyDirectoryPatch(baseEntries, makePatch({
      kind: "update",
      entry: hydrated
    }))).toBe(true);
  });
});
