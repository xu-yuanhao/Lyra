import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  GitBranch,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw
} from "@lyra/icons";

import {
  AppEmptyState,
  AppErrorState,
  AppIconButton,
  AppLoadingState,
  AppObjectRow,
  AppStatusMessage,
  AppToolbarButton
} from "@renderer/ui/components";
import type {
  AgentGitChangedFile,
  AgentGitDiffScope,
  AgentGitStatusSnapshot
} from "../../../shared/desktop-bridge";
import { VirtualizedDiffView } from "../ai-panel/lyra-agents/features/tools/VirtualizedDiffView";
import type { DiffHunk } from "../ai-panel/lyra-agents/core/types";
import { parseUnifiedDiff } from "../agent-session-view-model/tool-parsing/diff";
import {
  PROJECT_TREE_ROW_HEIGHT_PX,
  PROJECT_TREE_ROW_OVERSCAN,
  windowFixedRows
} from "../agent-project-tree/visible-rows";
import { ContextMenuHost, useContextMenuModel, type ContextMenuItem } from "../context-menu";
import {
  GIT_DIFF_CLASS,
  GIT_DIR_CLASS,
  GIT_EMPTY_SIDEBAR_CLASS,
  GIT_ICON_BUTTON_CLASS,
  GIT_INLINE_STATE_CLASS,
  GIT_LIST_CLASS,
  GIT_MAIN_CLASS,
  GIT_NAME_CLASS,
  GIT_ROW_CLASS,
  GIT_ROW_SELECTED_CLASS,
  GIT_SIDEBAR_CLASS,
  GIT_SURFACE_CLASS,
  GIT_VIRTUAL_CLASS,
  GIT_VIRTUAL_WINDOW_CLASS,
  gitStatusClass
} from "./classes";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import type {
  AgentGitDiffState,
  AgentGitLabels,
  AgentGitStatusState,
  AgentGitSurfaceProps
} from "./types";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const joinClassNames = (...values: Array<string | false | null | undefined>): string =>
  values.filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");

const statusLabel = (status: AgentGitChangedFile["status"]): string => {
  switch (status) {
    case "added":
      return "A";
    case "copied":
      return "C";
    case "deleted":
      return "D";
    case "renamed":
      return "R";
    case "typeChanged":
      return "T";
    case "untracked":
      return "U";
    case "conflicted":
      return "!";
    case "modified":
    default:
      return "M";
  }
};

const branchLabel = (snapshot: AgentGitStatusSnapshot | null, fallback: string): string => {
  if (snapshot?.branch !== undefined && snapshot.branch !== null && snapshot.branch.trim().length > 0) {
    return snapshot.branch;
  }
  return fallback;
};

const gitStatusLine = (
  snapshot: AgentGitStatusSnapshot,
  labels: AgentGitLabels
): string =>
  `${snapshot.summary.changed} ${labels.changes} · ${snapshot.summary.staged} ${labels.staged} · ${snapshot.summary.untracked} ${labels.untracked}`;

const splitGitPath = (
  path: string
): { readonly name: string; readonly directory: string } => {
  const normalized = path.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  if (slash === -1) {
    return { name: normalized, directory: "" };
  }
  return {
    name: normalized.slice(slash + 1),
    directory: normalized.slice(0, slash)
  };
};

const AgentGitTitlebarBridge = ({
  labels,
  snapshot,
  title,
  selectedPath,
  onRefresh
}: {
  readonly labels: AgentGitLabels;
  readonly snapshot: AgentGitStatusSnapshot | null;
  readonly title: string;
  readonly selectedPath: string | null;
  readonly onRefresh: () => void;
}) => {
  const contribution = useMemo(
    () => ({
      ariaLabel: labels.title,
      leading: (
        <span className="lyra-titlebar-context-text" title={title}>
          <GitBranch size={12} aria-hidden="true" />
          <span>{branchLabel(snapshot, title)}</span>
        </span>
      ),
      meta: snapshot?.isRepository === true ? (
        <>
          <span className="lyra-titlebar-context-text">
            {gitStatusLine(snapshot, labels)}
          </span>
          {snapshot.ahead > 0 || snapshot.behind > 0 ? (
            <span className="lyra-titlebar-context-text">
              ↑{snapshot.ahead} ↓{snapshot.behind}
            </span>
          ) : null}
          {selectedPath === null ? null : (
            <span className="lyra-titlebar-context-text" title={selectedPath}>
              {selectedPath}
            </span>
          )}
        </>
      ) : undefined,
      controls: (
        <AppToolbarButton
          type="button"
          className="lyra-titlebar-context-icon-button"
          aria-label={labels.refresh}
          title={labels.refresh}
          onClick={onRefresh}
        >
          <RefreshCw size={14} />
        </AppToolbarButton>
      )
    }),
    [labels, onRefresh, selectedPath, snapshot, title]
  );
  useWorkbenchTitlebarContribution(contribution);
  return null;
};

const statusScope = (file: AgentGitChangedFile): AgentGitDiffScope =>
  file.unstaged || file.untracked ? "unstaged" : "staged";

const GIT_LIST_VIEWPORT_FALLBACK_PX = 600;

const gitDiffHunks = (text: string): readonly DiffHunk[] => {
  const parsed = parseUnifiedDiff(text);
  if (parsed.hunks.length > 0) {
    return parsed.hunks;
  }
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines.length === 1 && lines[0] === "") {
    return [];
  }
  return [{
    startLine: 1,
    lines: lines.map((line) => {
      if (line.startsWith("+") && line.startsWith("+++") === false) {
        return { kind: "add", text: line.slice(1) };
      }
      if (line.startsWith("-") && line.startsWith("---") === false) {
        return { kind: "del", text: line.slice(1) };
      }
      return { kind: "ctx", text: line };
    })
  }];
};

const GitFileRow = memo(({
  file,
  labels,
  selected,
  busy,
  onSelect,
  onStage,
  onUnstage,
  onDiscard,
  onContextMenu
}: {
  readonly file: AgentGitChangedFile;
  readonly labels: AgentGitLabels;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly onSelect: (file: AgentGitChangedFile) => void;
  readonly onStage: (file: AgentGitChangedFile) => void;
  readonly onUnstage: (file: AgentGitChangedFile) => void;
  readonly onDiscard: (file: AgentGitChangedFile) => void;
  readonly onContextMenu: (file: AgentGitChangedFile, anchorX: number, anchorY: number) => void;
}) => {
  const { name, directory } = splitGitPath(file.path);
  return (
    <AppObjectRow
      as="div"
      role="button"
      tabIndex={0}
      className={joinClassNames(
        "lyra-app-sidebar-row",
        GIT_ROW_CLASS,
  GIT_ROW_SELECTED_CLASS,
        selected && `lyra-app-sidebar-row-selected ${GIT_ROW_SELECTED_CLASS}`
      )}
      active={selected}
      icon={(
        <span className={gitStatusClass(file.status)}>
          {statusLabel(file.status)}
        </span>
      )}
      title={(
        <span className={GIT_NAME_CLASS} title={file.path}>
          {name}
        </span>
      )}
      meta={directory.length === 0 ? undefined : (
        <span className={GIT_DIR_CLASS} title={file.path}>
          {directory}
        </span>
      )}
      aria-label={file.path}
      actions={(
        <>
          {file.unstaged || file.untracked ? (
            <AppIconButton
              className={`lyra-app-sidebar-row-action ${GIT_ICON_BUTTON_CLASS}`}
              aria-label={`${labels.stage}: ${file.path}`}
              title={labels.stage}
              disabled={busy}
              onClick={() => onStage(file)}
            >
              <Plus size={14} aria-hidden="true" />
            </AppIconButton>
          ) : null}
          {file.staged ? (
            <AppIconButton
              className={`lyra-app-sidebar-row-action ${GIT_ICON_BUTTON_CLASS}`}
              aria-label={`${labels.unstage}: ${file.path}`}
              title={labels.unstage}
              disabled={busy}
              onClick={() => onUnstage(file)}
            >
              <Minus size={14} aria-hidden="true" />
            </AppIconButton>
          ) : null}
          <AppIconButton
            className={`lyra-app-sidebar-row-action ${GIT_ICON_BUTTON_CLASS}`}
            tone="danger"
            aria-label={`${labels.discard}: ${file.path}`}
            title={labels.discard}
            disabled={busy}
            onClick={() => onDiscard(file)}
          >
            <RotateCcw size={14} aria-hidden="true" />
          </AppIconButton>
        </>
      )}
      onClick={() => onSelect(file)}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu(file, event.clientX, event.clientY);
      }}
    />
  );
});
GitFileRow.displayName = "GitFileRow";

const DiffPane = ({
  labels,
  diffState
}: {
  readonly labels: AgentGitLabels;
  readonly diffState: AgentGitDiffState;
}) => {
  if (diffState.kind === "empty") {
    return (
      <AppEmptyState
        className="lyra-agent-git-empty"
        title={labels.selectFileTitle}
      />
    );
  }
  if (diffState.kind === "loading") {
    return <AppLoadingState className="lyra-agent-git-diff-state" title={labels.loading} />;
  }
  if (diffState.kind === "error") {
    return <AppErrorState className="lyra-agent-git-diff-state" title={diffState.message} />;
  }
  if (diffState.diff.isBinary) {
    return <AppEmptyState className="lyra-agent-git-diff-state" title={labels.binaryDiff} />;
  }
  if (diffState.diff.diff.trim().length === 0) {
    return <AppEmptyState className="lyra-agent-git-diff-state" title={labels.noDiff} />;
  }
  const hunks = gitDiffHunks(diffState.diff.diff);
  if (hunks.length === 0) {
    return <AppEmptyState className="lyra-agent-git-diff-state" title={labels.noDiff} />;
  }
  return (
    <section className={GIT_DIFF_CLASS} aria-label={diffState.file.path}>
      <VirtualizedDiffView fill hunks={hunks} />
    </section>
  );
};

export const AgentGitSurface = ({
  desktopApi,
  labels,
  rootPath,
  title
}: AgentGitSurfaceProps) => {
  const contextMenu = useContextMenuModel();
  const [statusState, setStatusState] = useState<AgentGitStatusState>({
    kind: "loading",
    snapshot: null
  });
  const [diffState, setDiffState] = useState<AgentGitDiffState>({ kind: "empty" });
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [viewport, setViewport] = useState({
    height: GIT_LIST_VIEWPORT_FALLBACK_PX,
    start: 0
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const snapshot = statusState.snapshot;

  const loadStatus = useCallback(async (): Promise<AgentGitStatusSnapshot | null> => {
    if (desktopApi?.agent === undefined) {
      const message = labels.unavailable;
      setStatusState((current) => ({
        kind: "error",
        snapshot: current.snapshot,
        message
      }));
      return null;
    }
    setStatusState((current) =>
      current.snapshot === null
        ? { kind: "loading", snapshot: null }
        : current
    );
    try {
      const next = await desktopApi.agent.readGitStatus({ workingDir: rootPath });
      setStatusState({ kind: "ready", snapshot: next });
      return next;
    } catch (error: unknown) {
      setStatusState((current) => ({
        kind: "error",
        snapshot: current.snapshot,
        message: toErrorMessage(error)
      }));
      return null;
    }
  }, [desktopApi, labels.unavailable, rootPath]);

  useEffect(() => {
    setDiffState({ kind: "empty" });
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const element = listRef.current;
    if (element === null) {
      return undefined;
    }
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
        return { height: height > 0 ? height : GIT_LIST_VIEWPORT_FALLBACK_PX, start };
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
  }, [rootPath, snapshot?.entries.length]);

  const loadDiff = useCallback(async (file: AgentGitChangedFile): Promise<void> => {
    if (desktopApi?.agent === undefined) {
      setDiffState({
        kind: "error",
        file,
        message: labels.unavailable
      });
      return;
    }
    setDiffState({ kind: "loading", file });
    try {
      const diff = await desktopApi.agent.readGitDiff({
        workingDir: rootPath,
        path: file.path,
        scope: statusScope(file)
      });
      setDiffState({ kind: "ready", file, diff });
    } catch (error: unknown) {
      setDiffState({
        kind: "error",
        file,
        message: toErrorMessage(error)
      });
    }
  }, [desktopApi, labels.unavailable, rootPath]);

  const applyMutation = useCallback(async (
    file: AgentGitChangedFile,
    mutation: "stage" | "unstage" | "discard"
  ): Promise<void> => {
    if (desktopApi?.agent === undefined || busyPath !== null) {
      return;
    }
    if (mutation === "discard" && window.confirm(labels.discardConfirm.replace("{path}", file.path)) === false) {
      return;
    }
    setBusyPath(file.path);
    try {
      const request = { workingDir: rootPath, path: file.path };
      const response = mutation === "stage"
        ? await desktopApi.agent.stageGitFile(request)
        : mutation === "unstage"
          ? await desktopApi.agent.unstageGitFile(request)
          : await desktopApi.agent.discardGitFile(request);
      setStatusState({ kind: "ready", snapshot: response.snapshot });
      const refreshedFile = response.snapshot.entries.find((entry) => entry.path === file.path);
      if (refreshedFile === undefined) {
        setDiffState({ kind: "empty" });
      } else {
        await loadDiff(refreshedFile);
      }
    } catch (error: unknown) {
      setStatusState((current) => ({
        kind: "error",
        snapshot: current.snapshot,
        message: toErrorMessage(error)
      }));
    } finally {
      setBusyPath(null);
    }
  }, [busyPath, desktopApi, labels.discardConfirm, loadDiff, rootPath]);

  const onRefresh = useCallback(() => {
    void loadStatus();
  }, [loadStatus]);

  const openFileMenu = useCallback((file: AgentGitChangedFile, anchorX: number, anchorY: number): void => {
    const items: ContextMenuItem[] = [];
    if (file.unstaged || file.untracked) {
      items.push({
        id: "stage",
        label: labels.stage,
        onSelect: () => {
          void applyMutation(file, "stage");
        }
      });
    }
    if (file.staged) {
      items.push({
        id: "unstage",
        label: labels.unstage,
        onSelect: () => {
          void applyMutation(file, "unstage");
        }
      });
    }
    items.push({
      id: "discard",
      label: labels.discard,
      danger: true,
      onSelect: () => {
        void applyMutation(file, "discard");
      }
    });
    contextMenu.openMenu({ anchorX, anchorY, items });
  }, [applyMutation, contextMenu, labels.discard, labels.stage, labels.unstage]);

  const entries = snapshot?.entries ?? [];
  const selectedPath =
    diffState.kind === "empty" ? null : diffState.file.path;
  const windowed = useMemo(
    () => windowFixedRows({
      rows: entries,
      viewportHeight: viewport.height,
      start: viewport.start
    }),
    [entries, viewport.height, viewport.start]
  );
  const onSelectFile = useCallback((nextFile: AgentGitChangedFile): void => {
    void loadDiff(nextFile);
  }, [loadDiff]);
  const onStageFile = useCallback((nextFile: AgentGitChangedFile): void => {
    void applyMutation(nextFile, "stage");
  }, [applyMutation]);
  const onUnstageFile = useCallback((nextFile: AgentGitChangedFile): void => {
    void applyMutation(nextFile, "unstage");
  }, [applyMutation]);
  const onDiscardFile = useCallback((nextFile: AgentGitChangedFile): void => {
    void applyMutation(nextFile, "discard");
  }, [applyMutation]);
  const fileRows = windowed.rows.map((file) => (
    <GitFileRow
      key={file.path}
      file={file}
      labels={labels}
      selected={selectedPath === file.path}
      busy={busyPath === file.path}
      onSelect={onSelectFile}
      onStage={onStageFile}
      onUnstage={onUnstageFile}
      onDiscard={onDiscardFile}
      onContextMenu={openFileMenu}
    />
  ));
  const listBody = windowed.virtualized ? (
    <div
      className={GIT_VIRTUAL_CLASS}
      style={{ height: windowed.totalHeight } as CSSProperties}
    >
      <div
        className={GIT_VIRTUAL_WINDOW_CLASS}
        style={{ transform: `translateY(${windowed.offsetY}px)` } as CSSProperties}
      >
        {fileRows}
      </div>
    </div>
  ) : fileRows;

  return (
    <section className={`lyra-app-sidebar-split ${GIT_SURFACE_CLASS}`} aria-label={labels.title}>
      <ContextMenuHost
        state={contextMenu.state}
        onClose={contextMenu.closeMenu}
        onSelectItem={contextMenu.selectItem}
      />
      <AgentGitTitlebarBridge
        labels={labels}
        snapshot={snapshot}
        title={title}
        selectedPath={selectedPath}
        onRefresh={onRefresh}
      />
      <aside className={GIT_SIDEBAR_CLASS}>
        {snapshot === null && statusState.kind === "loading" ? (
          <AppLoadingState
            className={`lyra-agent-git-empty ${GIT_EMPTY_SIDEBAR_CLASS}`}
            title={labels.loading}
          />
        ) : snapshot === null && statusState.kind === "error" ? (
          <AppErrorState
            className={`lyra-agent-git-empty ${GIT_EMPTY_SIDEBAR_CLASS}`}
            title={statusState.message}
          />
        ) : snapshot?.isRepository === false ? (
          <AppErrorState
            className={`lyra-agent-git-empty ${GIT_EMPTY_SIDEBAR_CLASS}`}
            title={labels.notRepositoryTitle}
            description={snapshot.message ?? labels.notRepositoryDescription}
          />
        ) : entries.length === 0 ? (
          <AppEmptyState
            className={`lyra-agent-git-empty ${GIT_EMPTY_SIDEBAR_CLASS}`}
            title={labels.emptyTitle}
          />
        ) : (
          <div ref={listRef} className={GIT_LIST_CLASS} aria-label={labels.changes}>
            {listBody}
          </div>
        )}
        {statusState.kind === "error" && snapshot !== null ? (
          <AppStatusMessage className={GIT_INLINE_STATE_CLASS} tone="error">
            {statusState.message}
          </AppStatusMessage>
        ) : null}
      </aside>
      <main className={GIT_MAIN_CLASS}>
        <DiffPane labels={labels} diffState={diffState} />
      </main>
    </section>
  );
};
