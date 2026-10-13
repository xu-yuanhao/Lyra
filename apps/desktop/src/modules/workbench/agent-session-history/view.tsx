import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent
} from "react";
import {
  AppButton,
  AppEmptyState,
  AppIconButton,
  AppLoadingState,
  AppObjectRow,
  AppStatusMessage,
  AppToolbarButton,
  AppTooltip
} from "@renderer/ui/components";
import {
  Archive,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Folder,
  GitBranch,
  Pencil,
  Pin,
  Plus,
  Star,
  StarOff,
  Trash2
} from "@lyra/icons";

import { applyAgentRuntimeEventToSnapshot } from "../agent-session-view-model";
import { BrailleSpinner } from "../ai-panel/lyra-agents/components/BrailleSpinner";
import { MessageCitationText } from "../ai-panel/lyra-agents/features/chat/MessageCitationText";
import { inlineReferenceLabel } from "../ai-panel/lyra-agents/features/chat/message-citation";
import type {
  AgentGitStatusSnapshot,
  AgentRuntimeEvent,
  AgentSessionSummary
} from "../../../shared/desktop-bridge";
import { t } from "@workbench/i18n";
import type { FileManagerFavorite } from "../../../shared/file-manager";
import {
  filterBrowserHistoryEntries,
  type BrowserHistoryEntry
} from "../browser-history/service";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import { ContextMenuHost, useContextMenuModel } from "../context-menu";
import {
  AgentSessionPreviewPane,
  projectFolderNameFromPath
} from "./agent-session-preview-pane";
import type {
  AgentSessionHistoryCategory,
  AgentSessionHistoryPreviewState,
  AgentSessionHistoryState,
  AgentSessionHistorySurfaceProps
} from "./types";

const EMPTY_STATE: AgentSessionHistoryState = {
  sessionsDir: null,
  sessions: []
};

const EMPTY_PREVIEW_STATE: AgentSessionHistoryPreviewState = {
  sessionId: null,
  snapshot: null
};

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

type ProjectSessionGroup = {
  readonly id: string;
  readonly name: string;
  readonly path: string;
  readonly sessions: readonly AgentSessionSummary[];
};

const RECENT_SESSION_GROUP_ID = "__recent__";

const groupProjectSessions = (
  sessions: readonly AgentSessionSummary[],
  recentGroupName: string
): readonly ProjectSessionGroup[] => {
  const groups = new Map<string, AgentSessionSummary[]>();
  sessions.forEach((session) => {
    const workingDir = session.workingDir?.trim();
    const groupId = workingDir === undefined || workingDir.length === 0
      ? RECENT_SESSION_GROUP_ID
      : workingDir;
    const group = groups.get(groupId);
    if (group === undefined) {
      groups.set(groupId, [session]);
    } else {
      group.push(session);
    }
  });

  return Array.from(groups.entries()).map(([path, groupSessions]) => {
    const isRecentGroup = path === RECENT_SESSION_GROUP_ID;
    return {
      id: path,
      name: isRecentGroup ? recentGroupName : projectFolderNameFromPath(path),
      path: isRecentGroup ? recentGroupName : path,
      sessions: groupSessions
    };
  });
};

const sessionSearchText = (session: AgentSessionSummary): string =>
  normalize([
    session.title,
    session.customTitle,
    session.saveLabel,
    session.shortName
  ].filter(Boolean).join(" "));

const filterSessions = (
  sessions: readonly AgentSessionSummary[],
  query: string
): readonly AgentSessionSummary[] => {
  const normalizedQuery = normalize(query);
  if (normalizedQuery.length === 0) {
    return sessions;
  }
  return sessions.filter((session) => sessionSearchText(session).includes(normalizedQuery));
};

const hostnameFromUrl = (value: string): string => {
  try {
    return new URL(value).hostname.replace(/^www\./u, "");
  } catch (_error) {
    return value;
  }
};

const fallbackFaviconUrlFromEntry = (entry: BrowserHistoryEntry): string | undefined => {
  try {
    return new URL("/favicon.ico", entry.url).href;
  } catch (_error) {
    return undefined;
  }
};

const faviconFallbackLabel = (entry: BrowserHistoryEntry): string => {
  const label = hostnameFromUrl(entry.url).trim();
  return (label[0] ?? "?").toLocaleUpperCase();
};

const sessionFavoriteId = (sessionId: string): string => `agent-session:${sessionId}`;

const displayHomeRelativePath = (value: string): string => {
  const normalized = value.trim();
  const homePrefix = normalized.match(/^(\/Users\/[^/]+|\/home\/[^/]+)/u)?.[1];
  if (homePrefix === undefined) {
    return normalized;
  }
  const rest = normalized.slice(homePrefix.length);
  return rest.length === 0 ? "~" : `~${rest}`;
};

const formatCompactSessionAge = (value: string, now = Date.now()): string => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }
  const elapsedMs = Math.max(0, now - timestamp);
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
};

const sessionAgeSource = (session: AgentSessionSummary): string =>
  session.lastActiveAt?.trim() || session.updatedAt;

const sessionRawTitle = (session: AgentSessionSummary): string =>
  session.customTitle?.trim() || session.title;

const sessionDisplayTitle = (session: AgentSessionSummary): string =>
  inlineReferenceLabel(
    sessionRawTitle(session),
    session.transcriptCitations ?? [],
    session.pageCitations ?? [],
    session.inlineImages ?? [],
    session.fileAttachments ?? []
  );

const runningIdsFromSessions = (sessions: readonly AgentSessionSummary[]): ReadonlySet<string> =>
  new Set(sessions.filter((session) => session.status === "running").map((session) => session.id));

const runtimeEventSessionId = (event: AgentRuntimeEvent): string | null => {
  if (event.kind === "sessionSnapshot") {
    return event.snapshot.id;
  }
  if ("sessionId" in event) {
    return event.sessionId;
  }
  return null;
};

const runtimeEventIsRunning = (event: AgentRuntimeEvent): boolean | null => {
  if (event.kind === "sessionSnapshot") {
    return event.snapshot.turnStatus === "running";
  }
  if (event.kind === "turnStarted" || event.kind === "turnRecovered") {
    return true;
  }
  if (
    event.kind === "turnFinished"
    || event.kind === "turnCompleted"
    || event.kind === "turnFailed"
    || event.kind === "turnInterrupted"
  ) {
    return false;
  }
  if (event.kind === "turnStateChanged") {
    const state = event.state as string;
    return state !== "completed"
      && state !== "cancelled"
      && state !== "cancelled_by_user"
      && state !== "interrupted";
  }
  return null;
};

const sessionToFavorite = (session: AgentSessionSummary): FileManagerFavorite => {
  const workingDir = session.workingDir?.trim();
  return {
    id: sessionFavoriteId(session.id),
    title: sessionDisplayTitle(session),
    path: sessionFavoriteId(session.id),
    kind: "agent-session",
    sessionId: session.id,
    ...(workingDir === undefined || workingDir.length === 0 ? {} : { workingDir })
  };
};

const BrowserHistoryFavicon = ({ entry }: { readonly entry: BrowserHistoryEntry }) => {
  const [failed, setFailed] = useState(false);
  const faviconUrl = entry.faviconUrl?.trim() || fallbackFaviconUrlFromEntry(entry);

  useEffect(() => {
    setFailed(false);
  }, [faviconUrl]);

  if (faviconUrl !== undefined && faviconUrl.length > 0 && !failed) {
    return (
      <img
        src={faviconUrl}
        alt=""
        aria-hidden="true"
        className="lyra-agent-history-site-favicon"
        loading="eager"
        decoding="async"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="lyra-agent-history-site-favicon-fallback" aria-hidden="true">
      {faviconFallbackLabel(entry)}
    </span>
  );
};

const isRowActivationKey = (event: KeyboardEvent<HTMLElement>): boolean =>
  event.key === "Enter" || event.key === " ";

const SessionRow = ({
  session,
  labels,
  active,
  selected,
  opening,
  busy,
  running,
  gitStatus,
  onPreview,
  onOpen,
  onContextMenu,
  onToggleSaved,
  onDelete
}: {
  readonly session: AgentSessionSummary;
  readonly labels: AgentSessionHistorySurfaceProps["labels"];
  readonly active: boolean;
  readonly selected: boolean;
  readonly opening: boolean;
  readonly running: boolean;
  readonly busy: boolean;
  readonly gitStatus: AgentGitStatusSnapshot | null | undefined;
  readonly onPreview: (sessionId: string) => void;
  readonly onOpen: (sessionId: string) => void;
  readonly onContextMenu: (event: MouseEvent<HTMLElement>, session: AgentSessionSummary) => void;
  readonly onToggleSaved: (session: AgentSessionSummary) => void;
  readonly onDelete: (session: AgentSessionSummary) => void;
}) => {
  // Preview reads must not disable the button between pointer-down and click.
  const disabled = busy;
  const rawTitle = sessionRawTitle(session);
  const title = sessionDisplayTitle(session);
  const workingDir = session.workingDir?.trim() ?? "";
  const age = formatCompactSessionAge(sessionAgeSource(session));
  const branch = gitStatus?.isRepository === true ? gitStatus.branch?.trim() ?? "" : "";

  const handleActivate = () => {
    if (!disabled) {
      onOpen(session.id);
    }
  };

  const handlePreview = () => {
    if (!disabled) {
      onPreview(session.id);
    }
  };

  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    onContextMenu(event, session);
  };

  return (
    <AppTooltip
      side="right"
      align="start"
      delayDuration={160}
      contentClassName="lyra-agent-history-session-card"
      content={(
        <div className="lyra-agent-history-session-card-body">
          <div className="lyra-agent-history-session-card-title">
            <MessageCitationText
              text={rawTitle}
              transcriptCitations={session.transcriptCitations ?? []}
              pageCitations={session.pageCitations ?? []}
              inlineImages={session.inlineImages ?? []}
              fileAttachments={session.fileAttachments ?? []}
            />
          </div>
          {branch.length === 0 ? null : (
            <div className="lyra-agent-history-session-card-line">
              <GitBranch size={12} aria-hidden="true" />
              <span>{branch}</span>
            </div>
          )}
          {workingDir.length === 0 ? null : (
            <div className="lyra-agent-history-session-card-line">
              <Folder size={12} aria-hidden="true" />
              <span>{displayHomeRelativePath(workingDir)}</span>
            </div>
          )}
          {age.length === 0 ? null : (
            <div className="lyra-agent-history-session-card-age">{age}</div>
          )}
          {session.loadError && <div role="alert">{session.loadError}</div>}
        </div>
      )}
    >
      <AppObjectRow
        as="div"
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled ? "true" : undefined}
        aria-busy={running || opening ? "true" : undefined}
        aria-label={`${labels.openInAiPanel}: ${title}`}
        className={
          [
            "lyra-app-sidebar-row",
            "lyra-agent-history-row",
            "lyra-agent-history-session-row",
            active ? "lyra-app-sidebar-row-active lyra-agent-history-row-active" : "",
            selected ? "lyra-app-sidebar-row-selected lyra-agent-history-row-selected" : "",
            running ? "lyra-agent-history-session-row-running" : ""
          ].filter(Boolean).join(" ")
        }
        active={active || selected}
        icon={(
          <span className="lyra-agent-history-session-status" aria-hidden="true">
            {running ? <BrailleSpinner /> : null}
          </span>
        )}
        onClick={handleActivate}
        onMouseEnter={handlePreview}
        onFocus={(event) => {
          if (event.target === event.currentTarget) handlePreview();
        }}
        onContextMenu={handleContextMenu}
        onKeyDown={(event) => {
          if (isRowActivationKey(event)) {
            event.preventDefault();
            handleActivate();
          }
        }}
        title={(
          <MessageCitationText
            text={rawTitle}
            transcriptCitations={session.transcriptCitations ?? []}
            pageCitations={session.pageCitations ?? []}
            inlineImages={session.inlineImages ?? []}
            fileAttachments={session.fileAttachments ?? []}
          />
        )}
        actions={(
          <>
            {age.length === 0 ? null : (
              <span className="lyra-app-sidebar-row-age lyra-agent-history-row-age">{age}</span>
            )}
            <AppIconButton
              className="lyra-app-sidebar-row-action lyra-agent-history-row-action"
              aria-label={`${session.saved ? labels.unsaved : labels.saved}: ${title}`}
              title={session.saved ? labels.unsaved : labels.saved}
              active={session.saved}
              disabled={disabled}
              onClick={() => onToggleSaved(session)}
            >
              <Pin size={14} aria-hidden="true" />
            </AppIconButton>
            <AppIconButton
              className="lyra-app-sidebar-row-action lyra-agent-history-row-action"
              tone="danger"
              aria-label={`${labels.delete}: ${title}`}
              title={labels.delete}
              disabled={disabled}
              onClick={() => onDelete(session)}
            >
              <Trash2 size={14} aria-hidden="true" />
            </AppIconButton>
          </>
        )}
      />
    </AppTooltip>
  );
};

const ProjectGroupHeader = ({
  group,
  collapsed,
  canCreateSession,
  onToggle,
  onCreateSession
}: {
  readonly group: ProjectSessionGroup;
  readonly collapsed: boolean;
  readonly canCreateSession: boolean;
  readonly onToggle: () => void;
  readonly onCreateSession: () => void;
}) => (
  <div className="lyra-app-sidebar-group lyra-agent-history-project-group-header">
    <AppButton
      variant="ghost"
      size="sm"
      className="lyra-app-sidebar-group-toggle lyra-agent-history-project-group-toggle"
      aria-expanded={!collapsed}
      title={group.path}
      onClick={onToggle}
      onPointerUp={(event) => {
        event.currentTarget.blur();
      }}
    >
      <span
        className="lyra-agent-project-tree-icon-slot has-twist"
        aria-hidden="true"
      >
        <span className="lyra-agent-project-tree-entry-icon">
          <Folder size={13} />
        </span>
        <span className="lyra-agent-project-tree-twist">
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </span>
      </span>
      <span className="lyra-app-sidebar-group-name lyra-agent-history-project-group-name">{group.name}</span>
    </AppButton>
    {canCreateSession ? (
      <AppIconButton
        className="lyra-agent-history-project-group-new"
        aria-label={t("header.newSession")}
        title={t("header.newSession")}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onCreateSession();
          event.currentTarget.blur();
        }}
      >
        <Plus size={14} aria-hidden="true" />
      </AppIconButton>
    ) : null}
  </div>
);

const BrowserHistoryRow = ({
  entry,
  labels,
  selected,
  onPreview,
  onOpen
}: {
  readonly entry: BrowserHistoryEntry;
  readonly labels: AgentSessionHistorySurfaceProps["labels"];
  readonly selected: boolean;
  readonly onPreview: (entry: BrowserHistoryEntry) => void;
  readonly onOpen: (entry: BrowserHistoryEntry) => void;
}) => {
  const handleActivate = () => {
    onPreview(entry);
  };

  return (
    <AppObjectRow
      as="div"
      role="button"
      tabIndex={0}
      aria-label={`${labels.categoryBrowserHistory}: ${entry.title}`}
      className={
        [
          "lyra-app-sidebar-row",
          "lyra-agent-history-row",
          "lyra-agent-history-web-row",
          selected ? "lyra-app-sidebar-row-selected lyra-agent-history-row-selected" : ""
        ].filter(Boolean).join(" ")
      }
      active={selected}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (isRowActivationKey(event)) {
          event.preventDefault();
          handleActivate();
        }
      }}
      icon={<BrowserHistoryFavicon entry={entry} />}
      title={<span title={entry.title}>{entry.title}</span>}
      actions={(
        <AppIconButton
          className="lyra-app-sidebar-row-action lyra-agent-history-row-action"
          aria-label={`${labels.openBrowserHistoryEntry}: ${entry.url}`}
          title={labels.openBrowserHistoryEntry}
          onClick={() => onOpen(entry)}
        >
          <ExternalLink size={14} aria-hidden="true" />
        </AppIconButton>
      )}
    />
  );
};

const BrowserHistoryPreviewPane = ({
  entry,
  labels,
  previewPageId,
  onPreviewHostChange
}: {
  readonly entry: BrowserHistoryEntry | null;
  readonly labels: AgentSessionHistorySurfaceProps["labels"];
  readonly previewPageId?: string;
  readonly onPreviewHostChange?: (tabId: string, element: HTMLElement | null) => void;
}) => {
  const handlePreviewHostRef = useCallback((element: HTMLElement | null): void => {
    if (previewPageId === undefined) {
      return;
    }
    onPreviewHostChange?.(previewPageId, element);
  }, [onPreviewHostChange, previewPageId]);

  if (entry === null) {
    return (
      <aside className="lyra-agent-history-preview" aria-label={labels.categoryBrowserHistory}>
        <AppEmptyState
          className="lyra-agent-history-preview-empty"
          title={labels.browserHistoryEmptyTitle}
        />
      </aside>
    );
  }

  return (
    <aside className="lyra-agent-history-preview" aria-label={labels.categoryBrowserHistory}>
      <div
        ref={handlePreviewHostRef}
        className="lyra-agent-history-web-page-host"
        aria-label={entry.title}
        data-browser-page-host="true"
        data-tab-id={previewPageId}
      />
    </aside>
  );
};

export const AgentSessionHistorySurface = ({
  desktopApi,
  labels,
  activeSessionId = null,
  query = "",
  refreshRequestKey = 0,
  locateRequest = null,
  browserHistory = [],
  browserHistoryPreviewPageId,
  onBrowserHistoryPreviewChange,
  onBrowserHistoryPreviewHostChange,
  onOpenSession,
  onCreateProjectSession,
  onSessionDeleted,
  onOpenBrowserHistoryEntry,
  openDialog
}: AgentSessionHistorySurfaceProps) => {
  const [state, setState] = useState<AgentSessionHistoryState>(EMPTY_STATE);
  const [category, setCategory] = useState<AgentSessionHistoryCategory>("sessions");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [openingSessionId, setOpeningSessionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<AgentSessionHistoryPreviewState>(EMPTY_PREVIEW_STATE);
  const [selectedBrowserHistoryEntryId, setSelectedBrowserHistoryEntryId] = useState<string | null>(null);
  const [collapsedProjectGroupIds, setCollapsedProjectGroupIds] = useState<ReadonlySet<string>>(() => new Set());
  const [operationSessionId, setOperationSessionId] = useState<string | null>(null);
  const [runningSessionIds, setRunningSessionIds] = useState<ReadonlySet<string>>(() => new Set());
  const [gitByWorkingDir, setGitByWorkingDir] = useState<
    Readonly<Record<string, AgentGitStatusSnapshot | null>>
  >({});
  const gitByWorkingDirRef = useRef(gitByWorkingDir);
  const gitInflightRef = useRef(new Set<string>());
  const contextMenu = useContextMenuModel();
  const refreshRequestKeyRef = useRef(refreshRequestKey);
  const locateRequestKeyRef = useRef(0);

  const loadSessions = useCallback(async (): Promise<void> => {
    if (desktopApi?.agent === undefined) {
      setState(EMPTY_STATE);
      setRunningSessionIds(new Set());
      setErrorMessage(labels.runtimeUnavailable);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const response = await desktopApi.agent.listSessions({ limit: 500 });
      setState({
        sessionsDir: response.sessionsDir,
        sessions: response.sessions
      });
      setRunningSessionIds(runningIdsFromSessions(response.sessions));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [desktopApi, labels.runtimeUnavailable]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (refreshRequestKeyRef.current === refreshRequestKey) {
      return;
    }
    refreshRequestKeyRef.current = refreshRequestKey;
    void loadSessions();
  }, [loadSessions, refreshRequestKey]);

  useEffect(() => {
    const agentApi = desktopApi?.agent;
    if (agentApi === undefined) return undefined;
    return agentApi.onEvent((event) => {
      const sessionId = runtimeEventSessionId(event);
      const running = runtimeEventIsRunning(event);
      if (sessionId !== null && running !== null) {
        setRunningSessionIds((current) => {
          const isRunning = current.has(sessionId);
          if (isRunning === running) {
            return current;
          }
          const next = new Set(current);
          if (running) {
            next.add(sessionId);
          } else {
            next.delete(sessionId);
          }
          return next;
        });
      }
      setPreview((current) => {
        if (current.snapshot === null) return current;
        if (event.kind === "sessionSnapshot") {
          if (event.snapshot.id !== current.sessionId) return current;
          return {
            sessionId: event.snapshot.id,
            snapshot: event.snapshot
          };
        }
        if ("sessionId" in event && event.sessionId !== current.sessionId) {
          return current;
        }
        return {
          ...current,
          snapshot: applyAgentRuntimeEventToSnapshot(current.snapshot, event)
        };
      });
    });
  }, [desktopApi]);

  const categorySessions = useMemo(() => ({
    sessions: state.sessions.filter((session) => !session.archived),
    "archived-sessions": state.sessions.filter((session) => session.archived)
  }), [state.sessions]);
  const selectedSessions = category === "browser-history"
    ? []
    : categorySessions[category];
  const filteredSessions = useMemo(
    () => filterSessions(selectedSessions, query),
    [query, selectedSessions]
  );
  const filteredBrowserHistory = useMemo(
    () => filterBrowserHistoryEntries(browserHistory, query),
    [browserHistory, query]
  );
  const projectSessionGroups = useMemo(
    () => groupProjectSessions(filteredSessions, labels.groupRecent),
    [filteredSessions, labels.groupRecent]
  );

  useEffect(() => {
    if (category !== "browser-history") {
      return;
    }
    setSelectedBrowserHistoryEntryId((current) => {
      if (current !== null && filteredBrowserHistory.some((entry) => entry.id === current)) {
        return current;
      }
      return filteredBrowserHistory[0]?.id ?? null;
    });
  }, [category, filteredBrowserHistory]);

  useEffect(() => {
    if (selectedBrowserHistoryEntryId === null) {
      return;
    }
    if (browserHistory.some((entry) => entry.id === selectedBrowserHistoryEntryId)) {
      return;
    }
    setSelectedBrowserHistoryEntryId(null);
  }, [browserHistory, selectedBrowserHistoryEntryId]);

  useEffect(() => {
    if (loading) {
      return;
    }
    setPreview((current) => {
      if (current.sessionId === null) {
        return current;
      }
      if (category === "browser-history") {
        return EMPTY_PREVIEW_STATE;
      }
      return selectedSessions.some((session) => session.id === current.sessionId)
        ? current
        : EMPTY_PREVIEW_STATE;
    });
  }, [category, loading, selectedSessions]);

  gitByWorkingDirRef.current = gitByWorkingDir;

  const loadGitStatus = useCallback((workingDir: string): void => {
    const trimmed = workingDir.trim();
    if (trimmed.length === 0 || gitInflightRef.current.has(trimmed)) {
      return;
    }
    if (Object.prototype.hasOwnProperty.call(gitByWorkingDirRef.current, trimmed)) {
      return;
    }
    const readGitStatus = desktopApi?.agent?.readGitStatus;
    if (typeof readGitStatus !== "function") {
      return;
    }
    gitInflightRef.current.add(trimmed);
    void readGitStatus({ workingDir: trimmed })
      .then((snapshot) => {
        setGitByWorkingDir((current) => ({ ...current, [trimmed]: snapshot }));
      })
      .catch(() => {
        setGitByWorkingDir((current) => ({ ...current, [trimmed]: null }));
      })
      .finally(() => {
        gitInflightRef.current.delete(trimmed);
      });
  }, [desktopApi]);

  const categoryOptions = useMemo(() => [
    {
      id: "sessions" as const,
      label: labels.categorySessions,
      count: categorySessions.sessions.length
    },
    {
      id: "archived-sessions" as const,
      label: labels.categoryArchivedSessions,
      count: categorySessions["archived-sessions"].length
    },
    {
      id: "browser-history" as const,
      label: labels.categoryBrowserHistory,
      count: browserHistory.length
    }
  ], [
    browserHistory.length,
    categorySessions,
    labels.categoryArchivedSessions,
    labels.categoryBrowserHistory,
    labels.categorySessions
  ]);

  useWorkbenchTitlebarContribution(useMemo(() => ({
    ariaLabel: labels.categoryFilter,
    controls: (
      <div
        className="lyra-titlebar-context-group lyra-history-titlebar-categories"
        aria-label={labels.categoryFilter}
      >
        {categoryOptions.map((option) => (
          <AppToolbarButton
            key={option.id}
            type="button"
            className={
              category === option.id
                ? "lyra-titlebar-context-text-button lyra-titlebar-context-button-active lyra-history-titlebar-category"
                : "lyra-titlebar-context-text-button lyra-history-titlebar-category"
            }
            active={category === option.id}
            aria-pressed={category === option.id}
            onClick={() => setCategory(option.id)}
          >
            <span>{option.label}</span>
            <span className="lyra-history-titlebar-category-count">{option.count}</span>
          </AppToolbarButton>
        ))}
      </div>
    )
  }), [category, categoryOptions, labels.categoryFilter]));

  const previewSession = useCallback(async (sessionId: string): Promise<void> => {
    if (desktopApi?.agent === undefined) {
      setErrorMessage(labels.runtimeUnavailable);
      return;
    }
    const workingDir = state.sessions.find((session) => session.id === sessionId)?.workingDir?.trim();
    if (workingDir !== undefined && workingDir.length > 0) {
      loadGitStatus(workingDir);
    }
    setOpeningSessionId(sessionId);
    setPreview((current) => ({
      sessionId,
      snapshot: current.sessionId === sessionId ? current.snapshot : null
    }));
    try {
      const snapshot = await desktopApi.agent.readSession({ sessionId });
      setPreview((current) =>
        current.sessionId === sessionId
          ? { sessionId, snapshot }
          : current
      );
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOpeningSessionId(null);
    }
  }, [desktopApi, labels.runtimeUnavailable, loadGitStatus, state.sessions]);

  useEffect(() => {
    if (locateRequest === null || locateRequest.requestKey === locateRequestKeyRef.current) {
      return;
    }
    locateRequestKeyRef.current = locateRequest.requestKey;
    if (locateRequest.target.kind === "session") {
      const locateCategory =
        (locateRequest.target.category as string) === "project-sessions"
          ? "sessions"
          : locateRequest.target.category;
      setCategory(locateCategory);
      void previewSession(locateRequest.target.sessionId);
      return;
    }
    setCategory("browser-history");
    setSelectedBrowserHistoryEntryId(locateRequest.target.entryId);
  }, [locateRequest, previewSession]);

  const openInAiPanel = useCallback(async (sessionId: string): Promise<void> => {
    await onOpenSession(sessionId);
  }, [onOpenSession]);

  const toggleProjectGroup = useCallback((groupId: string): void => {
    setCollapsedProjectGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const refreshAfterMutation = useCallback(async (): Promise<void> => {
    await loadSessions();
  }, [loadSessions]);

  const runSessionAction = useCallback(async (
    sessionId: string,
    action: () => Promise<void>
  ): Promise<void> => {
    setOperationSessionId(sessionId);
    try {
      await action();
      await refreshAfterMutation();
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setOperationSessionId(null);
    }
  }, [refreshAfterMutation]);

  const toggleSaved = useCallback((session: AgentSessionSummary): void => {
    const agentApi = desktopApi?.agent;
    if (agentApi === undefined) {
      setErrorMessage(labels.runtimeUnavailable);
      return;
    }
    void runSessionAction(session.id, async () => {
      if (session.saved) {
        await agentApi.unsaveSession({ sessionId: session.id });
        const payload = await desktopApi?.files?.readFavorites();
        if (payload !== undefined) {
          await desktopApi?.files?.writeFavorites({
            favorites: payload.favorites.filter((favorite) =>
              favorite.kind !== "agent-session" || favorite.sessionId !== session.id
            )
          });
        }
      } else {
        await agentApi.saveSession({ sessionId: session.id, label: null });
        const payload = await desktopApi?.files?.readFavorites();
        if (payload !== undefined) {
          const nextFavorite = sessionToFavorite(session);
          await desktopApi?.files?.writeFavorites({
            favorites: [
              nextFavorite,
              ...payload.favorites.filter((favorite) =>
                favorite.id !== nextFavorite.id
                && (favorite.kind !== "agent-session" || favorite.sessionId !== session.id)
              )
            ]
          });
        }
      }
    });
  }, [desktopApi, labels.runtimeUnavailable, runSessionAction]);

  const toggleArchived = useCallback((session: AgentSessionSummary): void => {
    const agentApi = desktopApi?.agent;
    if (agentApi === undefined) {
      setErrorMessage(labels.runtimeUnavailable);
      return;
    }
    void runSessionAction(session.id, async () => {
      await agentApi.archiveSession({
        sessionId: session.id,
        archived: !session.archived
      });
    });
  }, [desktopApi, labels.runtimeUnavailable, runSessionAction]);

  const submitRename = useCallback(async (
    session: AgentSessionSummary,
    title: string | null
  ): Promise<void> => {
    const agentApi = desktopApi?.agent;
    if (agentApi === undefined) {
      setErrorMessage(labels.runtimeUnavailable);
      return;
    }
    const sessionId = session.id;
    await runSessionAction(sessionId, async () => {
      await agentApi.renameSession({ sessionId, title });
      const payload = await desktopApi?.files?.readFavorites();
      if (payload !== undefined) {
        const nextTitle = title?.trim();
        await desktopApi?.files?.writeFavorites({
          favorites: payload.favorites.map((favorite) =>
            favorite.kind === "agent-session" && favorite.sessionId === sessionId
              ? { ...favorite, title: nextTitle === undefined || nextTitle.length === 0 ? sessionDisplayTitle(session) : nextTitle }
              : favorite
          )
        });
      }
    });
  }, [desktopApi, labels.runtimeUnavailable, runSessionAction]);

  const openRenameDialog = useCallback((session: AgentSessionSummary): void => {
    openDialog({
      title: labels.renameTitle,
      source: {
        title: labels.title,
        subtitle: sessionDisplayTitle(session),
        iconLabel: "AI",
        iconTone: "accent"
      },
      input: {
        id: `rename-${session.id}`,
        label: labels.renamePlaceholder,
        value: sessionDisplayTitle(session),
        placeholder: labels.renamePlaceholder,
        submitActionId: "save"
      },
      actions: [
        {
          id: "clear",
          label: labels.clearRename,
          onSelect: () => {
            void submitRename(session, null);
          }
        },
        {
          id: "cancel",
          label: labels.cancelAction
        },
        {
          id: "save",
          label: labels.saveRename,
          tone: "primary",
          onSelect: ({ inputValue }) => {
            const nextTitle = inputValue?.trim() ?? "";
            void submitRename(session, nextTitle.length === 0 ? null : nextTitle);
          }
        }
      ]
    });
  }, [
    labels.cancelAction,
    labels.clearRename,
    labels.renamePlaceholder,
    labels.renameTitle,
    labels.saveRename,
    labels.title,
    openDialog,
    submitRename
  ]);

  const confirmDelete = useCallback(async (session: AgentSessionSummary): Promise<void> => {
    const agentApi = desktopApi?.agent;
    if (agentApi === undefined) {
      setErrorMessage(labels.runtimeUnavailable);
      return;
    }
    const sessionId = session.id;
    await runSessionAction(sessionId, async () => {
      await agentApi.deleteSession({ sessionId });
      const payload = await desktopApi?.files?.readFavorites();
      if (payload !== undefined) {
        await desktopApi?.files?.writeFavorites({
          favorites: payload.favorites.filter((favorite) =>
            favorite.kind !== "agent-session" || favorite.sessionId !== sessionId
          )
        });
      }
      setPreview((current) =>
        current.sessionId === sessionId ? EMPTY_PREVIEW_STATE : current
      );
      await onSessionDeleted?.(sessionId);
    });
  }, [
    desktopApi,
    labels.runtimeUnavailable,
    onSessionDeleted,
    runSessionAction
  ]);

  const openDeleteDialog = useCallback((session: AgentSessionSummary): void => {
    openDialog({
      title: labels.deleteConfirmTitle,
      description: labels.deleteConfirmDescription,
      source: {
        title: labels.title,
        subtitle: sessionDisplayTitle(session),
        iconLabel: "AI",
        iconTone: "danger"
      },
      actions: [
        {
          id: "cancel",
          label: labels.cancelAction
        },
        {
          id: "delete",
          label: labels.deleteConfirmAction,
          tone: "danger",
          onSelect: () => {
            void confirmDelete(session);
          }
        }
      ]
    });
  }, [
    confirmDelete,
    labels.cancelAction,
    labels.deleteConfirmAction,
    labels.deleteConfirmDescription,
    labels.deleteConfirmTitle,
    labels.title,
    openDialog
  ]);

  const openBrowserHistoryEntry = useCallback((entry: BrowserHistoryEntry): void => {
    void onOpenBrowserHistoryEntry?.(entry);
  }, [onOpenBrowserHistoryEntry]);

  const openSessionContextMenu = useCallback((
    event: MouseEvent<HTMLElement>,
    session: AgentSessionSummary
  ): void => {
    const disabled = operationSessionId === session.id;
    contextMenu.openMenu({
      anchorX: event.clientX,
      anchorY: event.clientY,
      items: [
        {
          id: "save",
          label: session.saved ? labels.unsaved : labels.saved,
          icon: session.saved ? <StarOff size={14} aria-hidden="true" /> : <Star size={14} aria-hidden="true" />,
          disabled,
          onSelect: () => toggleSaved(session)
        },
        {
          id: "archive",
          label: session.archived ? labels.unarchive : labels.archive,
          icon: <Archive size={14} aria-hidden="true" />,
          disabled,
          onSelect: () => toggleArchived(session)
        },
        {
          id: "rename",
          label: labels.rename,
          icon: <Pencil size={14} aria-hidden="true" />,
          disabled,
          onSelect: () => openRenameDialog(session)
        }
      ]
    });
  }, [
    contextMenu,
    labels.archive,
    labels.rename,
    labels.saved,
    labels.unarchive,
    labels.unsaved,
    openRenameDialog,
    operationSessionId,
    toggleArchived,
    toggleSaved
  ]);

  const isBrowserHistoryCategory = category === "browser-history";
  const selectedBrowserHistoryEntry =
    selectedBrowserHistoryEntryId === null
      ? null
      : filteredBrowserHistory.find((entry) => entry.id === selectedBrowserHistoryEntryId) ?? null;

  const renderSessionRow = (session: AgentSessionSummary) => {
    const workingDir = session.workingDir?.trim() ?? "";
    return (
    <SessionRow
      key={session.id}
      session={session}
      labels={labels}
      active={activeSessionId === session.id}
      selected={preview.sessionId === session.id}
      opening={openingSessionId === session.id}
      busy={operationSessionId === session.id}
      running={session.status === "running" || runningSessionIds.has(session.id)}
      gitStatus={workingDir.length === 0 ? undefined : gitByWorkingDir[workingDir]}
      onPreview={(sessionId) => {
        void previewSession(sessionId);
      }}
      onOpen={(sessionId) => {
        void openInAiPanel(sessionId);
      }}
      onContextMenu={openSessionContextMenu}
      onToggleSaved={toggleSaved}
      onDelete={openDeleteDialog}
    />
    );
  };

  useEffect(() => () => {
    onBrowserHistoryPreviewChange?.(null);
  }, [onBrowserHistoryPreviewChange]);

  useEffect(() => {
    if (
      browserHistoryPreviewPageId === undefined
      || isBrowserHistoryCategory === false
      || selectedBrowserHistoryEntry === null
    ) {
      onBrowserHistoryPreviewChange?.(null);
      return;
    }
    onBrowserHistoryPreviewChange?.({
      tabId: browserHistoryPreviewPageId,
      url: selectedBrowserHistoryEntry.url,
      title: selectedBrowserHistoryEntry.title
    });
  }, [
    browserHistoryPreviewPageId,
    isBrowserHistoryCategory,
    onBrowserHistoryPreviewChange,
    selectedBrowserHistoryEntry
  ]);

  const isLoading = !isBrowserHistoryCategory && loading;
  const hasRows = isBrowserHistoryCategory
    ? filteredBrowserHistory.length > 0
    : filteredSessions.length > 0;
  const emptyTitle = isBrowserHistoryCategory
    ? labels.browserHistoryEmptyTitle
    : labels.emptyTitle;
  return (
    <>
      <ContextMenuHost
        state={contextMenu.state}
        onClose={contextMenu.closeMenu}
        onSelectItem={contextMenu.selectItem}
      />
      <section className="lyra-agent-history" aria-label={labels.title}>
      {errorMessage === null ? null : (
        <AppStatusMessage className="lyra-agent-history-error" role="status" tone="error">
          <strong>{labels.errorTitle}</strong>
          <span>{errorMessage}</span>
        </AppStatusMessage>
      )}

      <section className="lyra-app-sidebar-split lyra-agent-history-split">
        <section className="lyra-app-sidebar-nav lyra-agent-history-list" aria-busy={isLoading}>
          <div className="lyra-app-sidebar-nav-list lyra-agent-history-list-content">
            {isLoading ? (
              <AppLoadingState className="lyra-agent-history-state" title={labels.loading} />
            ) : hasRows === false ? (
              <AppEmptyState
                className="lyra-agent-history-state"
                title={emptyTitle}
              />
            ) : isBrowserHistoryCategory ? (
              <div className="lyra-agent-history-group-list">
                {filteredBrowserHistory.map((entry) => (
                  <BrowserHistoryRow
                    key={entry.id}
                    entry={entry}
                    labels={labels}
                    selected={selectedBrowserHistoryEntryId === entry.id}
                    onPreview={(nextEntry) => setSelectedBrowserHistoryEntryId(nextEntry.id)}
                    onOpen={openBrowserHistoryEntry}
                  />
                ))}
              </div>
            ) : category === "sessions" ? (
              <div className="lyra-agent-history-group-list">
                {projectSessionGroups.map((group) => {
                  const collapsed = collapsedProjectGroupIds.has(group.id);
                  return (
                    <section
                      key={group.id}
                      className="lyra-agent-history-project-group"
                    >
                      <ProjectGroupHeader
                        group={group}
                        collapsed={collapsed}
                        canCreateSession={
                          onCreateProjectSession !== undefined
                          && group.id !== RECENT_SESSION_GROUP_ID
                        }
                        onToggle={() => toggleProjectGroup(group.id)}
                        onCreateSession={() => {
                          onCreateProjectSession?.(group.id);
                        }}
                      />
                      {collapsed ? null : (
                        <div className="lyra-agent-history-project-group-sessions">
                          {group.sessions.map(renderSessionRow)}
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="lyra-agent-history-group-list">
                {filteredSessions.map(renderSessionRow)}
              </div>
            )}
          </div>
        </section>
        {isBrowserHistoryCategory ? (
          <BrowserHistoryPreviewPane
            entry={selectedBrowserHistoryEntry}
            labels={labels}
            {...(browserHistoryPreviewPageId === undefined
              ? {}
              : { previewPageId: browserHistoryPreviewPageId })}
            {...(onBrowserHistoryPreviewHostChange === undefined
              ? {}
              : { onPreviewHostChange: onBrowserHistoryPreviewHostChange })}
          />
        ) : (
          <AgentSessionPreviewPane
            snapshot={preview.snapshot}
            labels={labels}
            loading={openingSessionId !== null && preview.sessionId === openingSessionId}
          />
        )}
      </section>
      </section>
    </>
  );
};
