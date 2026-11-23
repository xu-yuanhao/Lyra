import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent,
  type ReactNode
} from "react";
import { ChevronDown, ChevronRight, CircleAlert, FolderOpen, GitBranch, RefreshCw } from "@lyra/icons";

import {
  AppEmptyState,
  AppLoadingState,
  AppObjectRow,
  AppStatusMessage,
  AppToolbarButton
} from "@renderer/ui/components";
import type { FileManagerEntry, FileManagerDirectoryPatch } from "../../../shared/file-manager";
import { ContextMenuHost, useContextMenuModel } from "../context-menu";
import { FileEditorSurface, type FileEditorLabels, type FileEditorModel } from "../file-editor";
import { renderFileManagerEntryIcon } from "../file-manager";
import {
  TREE_EDITOR_CLASS,
  TREE_EDITOR_SURFACE_HOST_CLASS,
  TREE_EMPTY_CLASS,
  TREE_ENTRY_ICON_CLASS,
  TREE_ICON_SLOT_CLASS,
  TREE_INLINE_STATE_CLASS,
  TREE_LIST_CLASS,
  TREE_NAME_CLASS,
  TREE_NODE_CLASS,
  TREE_ROOT_ROW_CLASS,
  TREE_ROW_CLASS,
  TREE_SEARCH_HIT_CLASS,
  TREE_SEARCH_LINE_CLASS,
  TREE_SIDEBAR_CLASS,
  TREE_SURFACE_CLASS,
  TREE_TWIST_CLASS,
  TREE_TWIST_HOVER_RULES,
  TREE_VIRTUAL_CLASS,
  TREE_VIRTUAL_WINDOW_CLASS,
  TREE_ERROR_CLASS
} from "./classes";
import {
  clearFileManagerEntryDragPayload,
  writeFileManagerEntryDragPayload
} from "../file-manager/drag-transfer";
import { FM_DRAG_PREVIEW_CLASS } from "../file-manager/surface-classes";
import { FilePreviewModeButton } from "../file-preview/view-mode-button";
import { useWorkspaceProblemsActive } from "../bottom-aux/problems";
import { useEditorChromeVisible } from "../file-preview/use-region-active";
import { isRasterImageViewerPath } from "../image-viewer/path-utils";
import { OfficeViewerSurface } from "../office-viewer/view";
import { SqliteViewerSurface } from "../sqlite-viewer/view";
import { isOfficeDocumentPath, officeTitleFromPath } from "../../../shared/office-documents";
import { isSqliteDocumentPath } from "../../../shared/sqlite-documents";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type { ImageViewerLabels, ImageViewerModel } from "../image-viewer/types";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import { useAgentProjectTreeContextMenu } from "./context-menu";
import { AgentProjectTreeEditorTabStrip } from "./editor-tab-strip";
import type { AgentProjectTreeSurfaceProps } from "./types";
import {
  flattenVisibleRows,
  prepareEntries,
  PROJECT_TREE_ROW_HEIGHT_PX,
  PROJECT_TREE_ROW_OVERSCAN,
  windowFixedRows,
  windowVisibleRows,
  type DirectoryStateMap,
  type VisibleTreeRow
} from "./visible-rows";
import {
  flattenFileSearchRows,
  toggleProjectTreeFileSearchGroup,
  useProjectTreeFileSearch,
  type ProjectTreeSearchRow
} from "./file-search";

const ImageViewerSurfaceLazy = lazy(async () => {
  const module = await import("../image-viewer/view");
  return { default: module.ImageViewerSurface };
});

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const applyPatchToEntries = (
  entries: readonly FileManagerEntry[],
  patch: FileManagerDirectoryPatch
): readonly FileManagerEntry[] => {
  if (patch.kind === "reset") {
    return patch.snapshot?.entries ?? entries;
  }
  if (patch.kind === "remove") {
    const removePath = patch.path ?? patch.oldPath;
    if (removePath === undefined) return entries;
    return entries.filter((entry) => entry.path !== removePath);
  }
  if (patch.kind === "rename") {
    if (patch.oldPath === undefined || patch.entry === undefined) return entries;
    return prepareEntries([
      ...entries.filter((entry) => entry.path !== patch.oldPath),
      patch.entry
    ]);
  }
  if (patch.entry === undefined) return entries;
  const next = entries.filter((entry) => entry.path !== patch.entry!.path);
  next.push(patch.entry);
  return prepareEntries(next);
};

export const isHydrationOnlyDirectoryPatch = (
  entries: readonly FileManagerEntry[],
  patch: FileManagerDirectoryPatch
): boolean => {
  if (patch.kind !== "update" || patch.entry === undefined) {
    return false;
  }
  const current = entries.find((entry) => entry.path === patch.entry!.path);
  if (current === undefined) {
    return false;
  }
  return (
    current.name === patch.entry.name &&
    current.kind === patch.entry.kind &&
    current.isHidden === patch.entry.isHidden
  );
};

const indentStyle = (depth: number, extra: "8" | "24"): { readonly paddingLeft: string } => ({
  paddingLeft: `calc(var(--lyra-unit-8) * ${Math.max(depth, 0)} + var(--lyra-unit-${extra}))`
});

const renderTreeIconSlot = (icon: ReactNode, twist?: ReactNode): ReactNode => (
  <span className={`${TREE_ICON_SLOT_CLASS}${twist === undefined ? "" : " has-twist"}`} aria-hidden="true">
    <span className={TREE_ENTRY_ICON_CLASS}>{icon}</span>
    {twist === undefined ? null : (
      <span className={TREE_TWIST_CLASS}>{twist}</span>
    )}
  </span>
);

const AgentProjectTreeTitlebarBridge = ({
  labels,
  title,
  filePath,
  onOpenGitPanel,
  onOpenProblems,
  problemsActive,
  onRefresh
}: {
  readonly labels: AgentProjectTreeSurfaceProps["labels"];
  readonly title: string;
  readonly filePath: string | null;
  readonly onOpenGitPanel?: () => void;
  readonly onOpenProblems?: () => void;
  readonly problemsActive?: boolean;
  readonly onRefresh: () => void;
}) => {
  const problemsLabel = labels.openProblems ?? "Problems";
  const contribution = useMemo(
    () => ({
      ariaLabel: labels.title,
      leading: (
        <span className="lyra-titlebar-context-text" title={title}>
          <FolderOpen size={12} aria-hidden="true" />
          <span>{title}</span>
        </span>
      ),
      controls: (
        <>
          <FilePreviewModeButton filePath={filePath} />
          {onOpenGitPanel === undefined ? null : (
            <AppToolbarButton
              type="button"
              className="lyra-titlebar-context-icon-button"
              aria-label={labels.openSourceControl}
              title={labels.openSourceControl}
              onClick={onOpenGitPanel}
            >
              <GitBranch size={14} />
            </AppToolbarButton>
          )}
          {onOpenProblems === undefined ? null : (
            <AppToolbarButton
              type="button"
              className={
                problemsActive
                  ? "lyra-titlebar-context-icon-button lyra-titlebar-problems-active"
                  : "lyra-titlebar-context-icon-button"
              }
              aria-label={problemsLabel}
              title={problemsLabel}
              onClick={onOpenProblems}
            >
              <CircleAlert size={14} />
            </AppToolbarButton>
          )}
          <AppToolbarButton
            type="button"
            className="lyra-titlebar-context-icon-button"
            aria-label={labels.refresh}
            title={labels.refresh}
            onClick={onRefresh}
          >
            <RefreshCw size={14} />
          </AppToolbarButton>
        </>
      )
    }),
    [
      filePath,
      labels.openSourceControl,
      labels.refresh,
      labels.title,
      onOpenGitPanel,
      onOpenProblems,
      onRefresh,
      problemsActive,
      problemsLabel,
      title
    ]
  );
  useWorkbenchTitlebarContribution(contribution);
  return null;
};

let treeDragPreview: HTMLElement | null = null;

const clearTreeDragPreview = (): void => {
  treeDragPreview?.remove();
  treeDragPreview = null;
};

const startTreeEntryDrag = (
  event: ReactDragEvent<HTMLButtonElement>,
  entry: { readonly name: string; readonly kind: "file" | "directory"; readonly path: string }
): void => {
  clearTreeDragPreview();
  const preview = event.currentTarget.ownerDocument.createElement("div");
  preview.className = FM_DRAG_PREVIEW_CLASS;
  preview.textContent = entry.name;
  event.currentTarget.ownerDocument.body.append(preview);
  treeDragPreview = preview;
  event.dataTransfer.setDragImage(preview, 14, 12);
  writeFileManagerEntryDragPayload(event.dataTransfer, {
    name: entry.name,
    kind: entry.kind,
    source: "directory",
    path: entry.path
  });
};

const endTreeEntryDrag = (): void => {
  clearTreeDragPreview();
  clearFileManagerEntryDragPayload();
};

type TreeEntryRowProps = {
  readonly entry: FileManagerEntry;
  readonly depth: number;
  readonly expanded: boolean;
  readonly selected: boolean;
  readonly onToggleDirectory: (path: string) => void;
  readonly onOpenFile: (path: string, options?: { readonly pinned?: boolean }) => void;
  readonly onContextMenu: (event: MouseEvent<HTMLElement>, path: string, kind: "file" | "directory") => void;
};

const TreeEntryRow = memo(({
  entry,
  depth,
  expanded,
  selected,
  onToggleDirectory,
  onOpenFile,
  onContextMenu
}: TreeEntryRowProps) => (
  <AppObjectRow
    className={`lyra-app-sidebar-row ${TREE_ROW_CLASS} ${TREE_TWIST_HOVER_RULES}`}
    active={selected}
    style={indentStyle(depth, "8")}
    aria-expanded={entry.kind === "directory" ? expanded : undefined}
    aria-label={entry.path}
    icon={renderTreeIconSlot(
      renderFileManagerEntryIcon(entry),
      entry.kind === "directory"
        ? expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
        : undefined
    )}
    title={(
      <span className={TREE_NAME_CLASS} title={entry.name}>{entry.name}</span>
    )}
    data-lyra-allow-web-drag="true"
    draggable
    onDragStart={(event) => {
      startTreeEntryDrag(event, entry);
    }}
    onDragEnd={endTreeEntryDrag}
    onClick={(event) => {
      if (entry.kind === "directory") {
        onToggleDirectory(entry.path);
        return;
      }
      onOpenFile(entry.path, {
        pinned: event.metaKey || event.ctrlKey || event.button === 1
      });
    }}
    onDoubleClick={() => {
      if (entry.kind === "file") {
        onOpenFile(entry.path, { pinned: true });
      }
    }}
    onAuxClick={(event) => {
      if (entry.kind !== "file" || event.button !== 1) {
        return;
      }
      event.preventDefault();
      onOpenFile(entry.path, { pinned: true });
    }}
    onContextMenu={(event) => {
      onContextMenu(event, entry.path, entry.kind);
    }}
  />
));

const SearchFileRow = memo(({
  row,
  onToggle
}: {
  readonly row: Extract<ProjectTreeSearchRow, { kind: "file" }>;
  readonly onToggle: (filePath: string) => void;
}) => (
  <AppObjectRow
    className={`lyra-app-sidebar-row ${TREE_ROW_CLASS} ${TREE_TWIST_HOVER_RULES}`}
    style={indentStyle(1, "8")}
    aria-expanded={row.expanded}
    aria-label={row.filePath}
    icon={renderTreeIconSlot(
      renderFileManagerEntryIcon(row.entry),
      row.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
    )}
    title={(
      <span className={TREE_NAME_CLASS} title={row.relativePath}>{row.relativePath}</span>
    )}
    data-lyra-allow-web-drag="true"
    draggable
    onDragStart={(event) => {
      startTreeEntryDrag(event, row.entry);
    }}
    onDragEnd={endTreeEntryDrag}
    onClick={() => {
      onToggle(row.filePath);
    }}
  />
));

const SearchHitRow = memo(({
  hit,
  onOpen
}: {
  readonly hit: Extract<ProjectTreeSearchRow, { kind: "hit" }>["hit"];
  readonly onOpen: (filePath: string, line: number, column: number) => void;
}) => (
  <AppObjectRow
    className={`lyra-app-sidebar-row ${TREE_ROW_CLASS} ${TREE_SEARCH_HIT_CLASS}`}
    style={indentStyle(1, "8")}
    aria-label={`${hit.filePath}:${hit.line}`}
    icon={<span className={TREE_SEARCH_LINE_CLASS}>{hit.line}</span>}
    title={(
      <span className={TREE_NAME_CLASS} title={hit.preview}>{hit.preview}</span>
    )}
    onClick={() => {
      onOpen(hit.filePath, hit.line, hit.column);
    }}
  />
));

const renderStatusRow = (
  row: Exclude<VisibleTreeRow, { kind: "entry" }>,
  labels: AgentProjectTreeSurfaceProps["labels"]
): ReactNode => {
  if (row.kind === "loading") {
    return (
      <AppLoadingState
        className={TREE_INLINE_STATE_CLASS}
        align="start"
        density="compact"
        title={labels.loading}
        style={indentStyle(row.depth, "8")}
      />
    );
  }
  if (row.kind === "error") {
    return (
      <AppStatusMessage
        className={TREE_INLINE_STATE_CLASS}
        tone="error"
        style={indentStyle(row.depth, "8")}
      >
        {row.errorMessage}
      </AppStatusMessage>
    );
  }
  return (
    <AppEmptyState
      className={TREE_INLINE_STATE_CLASS}
      align="start"
      density="compact"
      title={labels.emptyDirectory}
      style={indentStyle(row.depth, "8")}
    />
  );
};

const AgentProjectTreeEditorPane = memo(({
  treeInstanceId,
  editorInstanceId,
  editorTabs,
  emptyTitle,
  fileEditorLabels,
  fileEditorModel,
  imageViewerLabels,
  imageViewerModel,
  desktopApi,
  themeSignature,
  model
}: {
  readonly treeInstanceId: string;
  readonly editorInstanceId: string | null;
  readonly editorTabs: AgentProjectTreeSurfaceProps["state"]["editorTabs"];
  readonly emptyTitle: string;
  readonly fileEditorLabels: FileEditorLabels;
  readonly fileEditorModel: FileEditorModel;
  readonly imageViewerLabels: ImageViewerLabels;
  readonly imageViewerModel: ImageViewerModel;
  readonly desktopApi: LyraDesktopApi | null;
  readonly themeSignature: string;
  readonly model: AgentProjectTreeSurfaceProps["model"];
}) => {
  const paneRef = useRef<HTMLElement | null>(null);
  const chromeVisible = useEditorChromeVisible(paneRef);
  const activeTab = editorTabs.find((tab) => tab.editorInstanceId === editorInstanceId);
  const imageViewerFile = activeTab !== undefined && isRasterImageViewerPath(activeTab.filePath);
  const officeFile = activeTab !== undefined && isOfficeDocumentPath(activeTab.filePath);
  const sqliteFile = activeTab !== undefined && isSqliteDocumentPath(activeTab.filePath);
  const fileEditorState = useSyncExternalStore(
    fileEditorModel.subscribe,
    () => imageViewerFile || officeFile || sqliteFile || editorInstanceId === null ? null : fileEditorModel.getState(editorInstanceId),
    () => imageViewerFile || officeFile || sqliteFile || editorInstanceId === null ? null : fileEditorModel.getState(editorInstanceId)
  );
  const imageViewerState = useSyncExternalStore(
    imageViewerModel.subscribe,
    () => imageViewerFile === false || editorInstanceId === null
      ? null
      : imageViewerModel.getState(editorInstanceId),
    () => imageViewerFile === false || editorInstanceId === null
      ? null
      : imageViewerModel.getState(editorInstanceId)
  );

  useEffect(() => {
    if (fileEditorState?.isDirty !== true || editorInstanceId === null) {
      return;
    }
    model.pinEditorTab(treeInstanceId, editorInstanceId);
  }, [editorInstanceId, fileEditorState?.isDirty, model, treeInstanceId]);

  return (
    <main ref={paneRef} className={TREE_EDITOR_CLASS}>
      {chromeVisible ? (
        <AgentProjectTreeEditorTabStrip
          tabs={editorTabs}
          activeEditorInstanceId={editorInstanceId}
          onActivate={(nextId) => {
            model.activateEditorTab(treeInstanceId, nextId);
          }}
          onClose={(nextId) => {
            model.closeEditorTab(treeInstanceId, nextId);
          }}
          onPin={(nextId) => {
            model.pinEditorTab(treeInstanceId, nextId);
          }}
        />
      ) : null}
      {fileEditorState === null && imageViewerState === null && !officeFile && !sqliteFile ? (
        <AppEmptyState
          className={TREE_EMPTY_CLASS}
          title={emptyTitle}
        />
      ) : (
        <div className={TREE_EDITOR_SURFACE_HOST_CLASS}>
          {sqliteFile && activeTab !== undefined ? (
            <SqliteViewerSurface
              key={activeTab.filePath}
              desktopApi={desktopApi}
              filePath={activeTab.filePath}
            />
          ) : officeFile && activeTab !== undefined ? (
            <OfficeViewerSurface
              desktopApi={desktopApi}
              filePath={activeTab.filePath}
              title={officeTitleFromPath(activeTab.filePath)}
            />
          ) : imageViewerState === null ? (
            <FileEditorSurface
              state={fileEditorState}
              labels={fileEditorLabels}
              themeSignature={themeSignature}
              model={fileEditorModel}
              surfaceVariant="full"
              controlMode="human_takeover"
              contributeTitlebar={false}
            />
          ) : (
            <Suspense fallback={<AppLoadingState density="compact" title={imageViewerLabels.loading} />}>
              <ImageViewerSurfaceLazy
                state={imageViewerState}
                labels={imageViewerLabels}
                model={imageViewerModel}
                themeSignature={themeSignature}
                contributeTitlebar={false}
                fileEditorModel={fileEditorModel}
                fileEditorLabels={fileEditorLabels}
              />
            </Suspense>
          )}
        </div>
      )}
    </main>
  );
});

const AgentProjectTreeSidebar = ({
  desktopApi,
  labels,
  state,
  model,
  openDialog,
  onOpenFile,
  onOpenTerminal,
  onOpenGitPanel,
  onOpenProblems
}: AgentProjectTreeSurfaceProps) => {
  const [directoryStates, setDirectoryStates] = useState<DirectoryStateMap>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewport, setViewport] = useState({ height: 0, start: 0 });
  const listRef = useRef<HTMLDivElement | null>(null);
  const expandedPaths = useMemo(
    () => new Set(state.expandedPaths),
    [state.expandedPaths]
  );
  const fileSearch = useProjectTreeFileSearch(state.instanceId);
  const problemsActive = useWorkspaceProblemsActive(desktopApi, state.rootPath);

  const subByPathRef = useRef<Map<string, { subscriptionId: string; generation: number }>>(new Map());
  const pathBySubIdRef = useRef<Map<string, string>>(new Map());
  const directoryStatesRef = useRef(directoryStates);
  const inflightLoadsRef = useRef(new Set<string>());
  directoryStatesRef.current = directoryStates;

  const setDirectoryState = useCallback((
    path: string,
    next: DirectoryStateMap[string]
  ): void => {
    if (next === undefined) {
      return;
    }
    setDirectoryStates((current) => ({
      ...current,
      [path]: next
    }));
  }, []);

  const unsubscribePath = useCallback((path: string): void => {
    const sub = subByPathRef.current.get(path);
    if (sub === undefined) return;
    subByPathRef.current.delete(path);
    pathBySubIdRef.current.delete(sub.subscriptionId);
    void desktopApi?.files?.unsubscribeDirectory?.(sub.subscriptionId);
  }, [desktopApi?.files]);

  const loadDirectory = useCallback((path: string): void => {
    const existing = directoryStatesRef.current[path];
    if (existing?.status === "ready" || inflightLoadsRef.current.has(path)) {
      return;
    }
    if (desktopApi?.files === undefined) {
      setDirectoryState(path, {
        status: "error",
        entries: [],
        errorMessage: labels.unavailable
      });
      return;
    }

    inflightLoadsRef.current.add(path);
    setDirectoryState(path, {
      status: "loading",
      entries: existing?.entries ?? [],
      errorMessage: null
    });
    const files = desktopApi.files;
    const useSubscribe = typeof files.subscribeDirectory === "function";

    const load = useSubscribe
      ? files.subscribeDirectory!({ path }).then((response) => ({
          entries: response.snapshot.entries,
          subscriptionId: response.subscriptionId,
          generation: response.snapshot.generation
        }))
      : files.readDirectory({ path }).then((response) => ({
          entries: response.entries,
          subscriptionId: undefined as string | undefined,
          generation: undefined as number | undefined
        }));

    void load
      .then((result) => {
        if (result.subscriptionId !== undefined) {
          subByPathRef.current.set(path, {
            subscriptionId: result.subscriptionId,
            generation: result.generation ?? 0
          });
          pathBySubIdRef.current.set(result.subscriptionId, path);
        }
        setDirectoryState(path, {
          status: "ready",
          entries: result.entries,
          errorMessage: null
        });
      })
      .catch((error: unknown) => {
        setDirectoryState(path, {
          status: "error",
          entries: [],
          errorMessage: toErrorMessage(error)
        });
      })
      .finally(() => {
        inflightLoadsRef.current.delete(path);
      });
  }, [desktopApi?.files, labels.unavailable, setDirectoryState]);

  useEffect(() => {
    if (desktopApi?.files?.onDirectoryPatch === undefined) return undefined;
    let frame = 0;
    const pending = new Map<string, FileManagerDirectoryPatch[]>();
    const flush = (): void => {
      frame = 0;
      const batches = [...pending.entries()];
      pending.clear();
      setDirectoryStates((current) => {
        let next = current;
        let changed = false;
        for (const [path, patches] of batches) {
          const node = next[path];
          if (node === undefined || node.status !== "ready") continue;
          let entries = node.entries;
          for (const patch of patches) {
            if (isHydrationOnlyDirectoryPatch(entries, patch)) {
              continue;
            }
            entries = applyPatchToEntries(entries, patch);
          }
          if (entries === node.entries) continue;
          if (!changed) {
            next = { ...current };
            changed = true;
          }
          next[path] = { ...node, entries };
        }
        return next;
      });
    };
    const unsubscribe = desktopApi.files.onDirectoryPatch((patch: FileManagerDirectoryPatch) => {
      const path = pathBySubIdRef.current.get(patch.subscriptionId);
      if (path === undefined) return;
      const sub = subByPathRef.current.get(path);
      if (sub === undefined || patch.generation < sub.generation) return;
      subByPathRef.current.set(path, { subscriptionId: sub.subscriptionId, generation: patch.generation });
      const queued = pending.get(path) ?? [];
      queued.push(patch);
      pending.set(path, queued);
      if (frame === 0) {
        frame = requestAnimationFrame(flush);
      }
    });
    return () => {
      unsubscribe();
      if (frame !== 0) {
        cancelAnimationFrame(frame);
      }
    };
  }, [desktopApi?.files]);

  useEffect(() => {
    return () => {
      for (const path of subByPathRef.current.keys()) {
        const sub = subByPathRef.current.get(path);
        if (sub !== undefined) {
          void desktopApi?.files?.unsubscribeDirectory?.(sub.subscriptionId);
        }
      }
      subByPathRef.current.clear();
      pathBySubIdRef.current.clear();
    };
  }, [desktopApi?.files, state.rootPath]);

  useEffect(() => {
    setDirectoryStates({});
    directoryStatesRef.current = {};
    inflightLoadsRef.current.clear();
    setActionError(null);
    subByPathRef.current.clear();
    pathBySubIdRef.current.clear();
    loadDirectory(state.rootPath);
  }, [loadDirectory, refreshKey, state.rootPath]);

  useEffect(() => {
    for (const path of expandedPaths) {
      if (path === state.rootPath || directoryStates[path] !== undefined) {
        continue;
      }
      const listedAsDirectory = Object.values(directoryStates).some((node) =>
        node?.status === "ready" &&
        node.entries.some((entry) => entry.kind === "directory" && entry.path === path)
      );
      if (listedAsDirectory) {
        loadDirectory(path);
      }
    }
  }, [directoryStates, expandedPaths, loadDirectory, state.rootPath]);

  useEffect(() => {
    const element = listRef.current;
    if (element === null) return undefined;
    const update = (): void => {
      const height = element.clientHeight;
      const start = height <= 0
        ? 0
        : Math.max(
            0,
            Math.floor(element.scrollTop / PROJECT_TREE_ROW_HEIGHT_PX) - PROJECT_TREE_ROW_OVERSCAN
          );
      setViewport((current) => {
        if (current.height === height && current.start === start) {
          return current;
        }
        return { height, start };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [state.rootPath]);

  useEffect(() => {
    if (fileSearch === null) {
      return;
    }
    setViewport((current) => (
      current.start === 0 ? current : { ...current, start: 0 }
    ));
    const list = listRef.current;
    if (list !== null) {
      list.scrollTop = 0;
    }
  }, [fileSearch?.query]);

  const onOpenTreeFile = useCallback((
    path: string,
    options?: { readonly pinned?: boolean }
  ): void => {
    setActionError(null);
    const open = options?.pinned === true
      ? model.openFile(state.instanceId, path, undefined, { pinned: true })
      : model.openFile(state.instanceId, path);
    void open.catch((error: unknown) => {
      setActionError(toErrorMessage(error));
    });
  }, [model, state.instanceId]);

  const onOpenSearchHit = useCallback((
    path: string,
    line: number,
    column: number
  ): void => {
    setActionError(null);
    void model.openFile(state.instanceId, path, { line, column }).catch((error: unknown) => {
      setActionError(toErrorMessage(error));
    });
  }, [model, state.instanceId]);

  const onToggleSearchGroup = useCallback((filePath: string): void => {
    toggleProjectTreeFileSearchGroup(state.instanceId, filePath);
  }, [state.instanceId]);

  const onToggleDirectory = useCallback((path: string): void => {
    model.toggleDirectory(state.instanceId, path);
    if (directoryStatesRef.current[path] === undefined) {
      loadDirectory(path);
    }
  }, [loadDirectory, model, state.instanceId]);

  const onRefresh = useCallback((): void => {
    setRefreshKey((value) => value + 1);
  }, []);

  const contextMenu = useContextMenuModel();
  const openEntryContextMenu = useAgentProjectTreeContextMenu({
    desktopApi,
    labels,
    rootPath: state.rootPath,
    instanceId: state.instanceId,
    model,
    contextMenu,
    ...(openDialog === undefined ? {} : { openDialog }),
    ...(onOpenFile === undefined ? {} : { onOpenFile }),
    ...(onOpenTerminal === undefined ? {} : { onOpenTerminal }),
    onError: setActionError,
    loadDirectory
  });

  const onRowContextMenu = useCallback((
    event: MouseEvent<HTMLElement>,
    path: string,
    kind: "file" | "directory"
  ): void => {
    const name = path === state.rootPath
      ? state.title
      : path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
    openEntryContextMenu(event, { path, name, kind });
  }, [openEntryContextMenu, state.rootPath, state.title]);

  const onOpenSourceControl = useMemo(() => {
    if (onOpenGitPanel === undefined) {
      return undefined;
    }
    return (): void => {
      void onOpenGitPanel({
        sessionId: state.agentSessionId,
        workingDir: state.rootPath
      });
    };
  }, [onOpenGitPanel, state.agentSessionId, state.rootPath]);

  const onOpenProblemsPanel = useMemo(() => {
    if (onOpenProblems === undefined) {
      return undefined;
    }
    return (): void => {
      onOpenProblems({
        instanceId: state.instanceId,
        title: state.title,
        rootPath: state.rootPath
      });
    };
  }, [onOpenProblems, state.instanceId, state.rootPath, state.title]);

  const visibleRows = useMemo(() => {
    if (fileSearch !== null || !expandedPaths.has(state.rootPath)) {
      return [];
    }
    return flattenVisibleRows({
      rootPath: state.rootPath,
      expandedPaths,
      directoryStates
    });
  }, [directoryStates, expandedPaths, fileSearch, state.rootPath]);

  const searchRows = useMemo(
    () => fileSearch === null ? null : flattenFileSearchRows(fileSearch, state.rootPath),
    [fileSearch, state.rootPath]
  );

  const windowed = useMemo(
    () => windowVisibleRows({
      rows: visibleRows,
      viewportHeight: viewport.height,
      start: viewport.start
    }),
    [visibleRows, viewport.height, viewport.start]
  );

  const windowedSearch = useMemo(
    () => searchRows === null
      ? null
      : windowFixedRows({
        rows: searchRows,
        viewportHeight: viewport.height,
        start: viewport.start
      }),
    [searchRows, viewport.height, viewport.start]
  );

  const treeRows = windowed.rows.map((row) => {
    const content = row.kind === "entry"
      ? (
        <TreeEntryRow
          entry={row.entry}
          depth={row.depth}
          expanded={row.entry.kind === "directory" && expandedPaths.has(row.entry.path)}
          selected={row.entry.path === state.selectedFilePath || (
            state.selectedFilePath === null &&
            state.selectedPath === row.entry.path
          )}
          onToggleDirectory={onToggleDirectory}
          onOpenFile={onOpenTreeFile}
          onContextMenu={onRowContextMenu}
        />
      )
      : renderStatusRow(row, labels);
    return (
      <div
        key={row.key}
        className={TREE_NODE_CLASS}
        style={windowed.virtualized ? { height: "var(--lyra-app-sidebar-row-h)" } : undefined}
      >
        {content}
      </div>
    );
  });

  const searchListRows = windowedSearch === null
    ? []
    : windowedSearch.rows.map((row) => {
      const content = row.kind === "file"
        ? (
          <SearchFileRow row={row} onToggle={onToggleSearchGroup} />
        )
        : row.kind === "hit"
          ? (
            <SearchHitRow hit={row.hit} onOpen={onOpenSearchHit} />
          )
          : row.kind === "loading"
            ? (
              <AppLoadingState
                className={TREE_INLINE_STATE_CLASS}
                align="start"
                density="compact"
                title={labels.searchSearching ?? labels.loading}
                style={indentStyle(1, "8")}
              />
            )
            : (
              <AppEmptyState
                className={TREE_INLINE_STATE_CLASS}
                align="start"
                density="compact"
                title={labels.searchEmpty ?? labels.emptyDirectory}
                style={indentStyle(1, "8")}
              />
            );
      return (
        <div
          key={row.key}
          className={TREE_NODE_CLASS}
          style={windowedSearch.virtualized ? { height: "var(--lyra-app-sidebar-row-h)" } : undefined}
        >
          {content}
        </div>
      );
    });

  const activeWindow = windowedSearch ?? windowed;
  const activeRows = windowedSearch === null ? treeRows : searchListRows;
  const listBody = activeWindow.virtualized
    ? (
      <div
        className={TREE_VIRTUAL_CLASS}
        style={{ height: activeWindow.totalHeight } as CSSProperties}
      >
        <div
          className={TREE_VIRTUAL_WINDOW_CLASS}
          style={{ transform: `translateY(${activeWindow.offsetY}px)` } as CSSProperties}
        >
          {activeRows}
        </div>
      </div>
    )
    : activeRows;

  return (
    <>
      <ContextMenuHost
        state={contextMenu.state}
        onClose={contextMenu.closeMenu}
        onSelectItem={contextMenu.selectItem}
      />
      <AgentProjectTreeTitlebarBridge
        labels={labels}
        title={state.title}
        filePath={state.selectedFilePath}
        onRefresh={onRefresh}
        {...(onOpenSourceControl === undefined
          ? {}
          : { onOpenGitPanel: onOpenSourceControl })}
        {...(onOpenProblemsPanel === undefined
          ? {}
          : { onOpenProblems: onOpenProblemsPanel, problemsActive })}
      />
      <aside className={TREE_SIDEBAR_CLASS}>
        <AppObjectRow
          className={`lyra-app-sidebar-row ${TREE_ROOT_ROW_CLASS} ${TREE_TWIST_HOVER_RULES}`}
          active={state.selectedPath === state.rootPath}
          aria-expanded={fileSearch !== null || expandedPaths.has(state.rootPath)}
          aria-label={state.rootPath}
          icon={renderTreeIconSlot(
            <FolderOpen size={14} aria-hidden="true" />,
            fileSearch !== null || expandedPaths.has(state.rootPath)
              ? <ChevronDown size={13} />
              : <ChevronRight size={13} />
          )}
          title={(
            <span className={TREE_NAME_CLASS}>{state.title}</span>
          )}
          data-lyra-allow-web-drag="true"
          draggable
          onDragStart={(event) => {
            startTreeEntryDrag(event, {
              name: state.title,
              kind: "directory",
              path: state.rootPath
            });
          }}
          onDragEnd={endTreeEntryDrag}
          onClick={() => {
            if (fileSearch !== null) {
              return;
            }
            model.toggleDirectory(state.instanceId, state.rootPath);
            if (directoryStatesRef.current[state.rootPath] === undefined) {
              loadDirectory(state.rootPath);
            }
          }}
          onContextMenu={(event) => {
            onRowContextMenu(event, state.rootPath, "directory");
          }}
        />
        <div
          ref={listRef}
          className={TREE_LIST_CLASS}
          role={fileSearch === null ? "tree" : "list"}
          aria-label={labels.title}
        >
          {listBody}
        </div>
        {actionError === null ? null : (
          <AppStatusMessage className={TREE_ERROR_CLASS} tone="error" role="status">
            {actionError}
          </AppStatusMessage>
        )}
      </aside>
    </>
  );
};

export const AgentProjectTreeSurface = (props: AgentProjectTreeSurfaceProps) => (
  <section className={`lyra-app-sidebar-split ${TREE_SURFACE_CLASS}`} aria-label={props.labels.title}>
    <AgentProjectTreeSidebar {...props} />
    <AgentProjectTreeEditorPane
      treeInstanceId={props.state.instanceId}
      editorInstanceId={props.state.editorInstanceId}
      editorTabs={props.state.editorTabs}
      emptyTitle={props.labels.selectFileTitle}
      fileEditorLabels={props.fileEditorLabels}
      fileEditorModel={props.fileEditorModel}
      imageViewerLabels={props.imageViewerLabels}
      imageViewerModel={props.imageViewerModel}
      desktopApi={props.desktopApi}
      themeSignature={props.themeSignature}
      model={props.model}
    />
  </section>
);
