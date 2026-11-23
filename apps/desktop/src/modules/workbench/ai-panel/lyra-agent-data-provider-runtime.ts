import type { MutableRefObject } from "react";

import type {
  AgentPlanSnapshot,
  AgentProjectTodoSnapshot,
  AgentRuntimeEvent,
  AgentSessionCreateRequest,
  AgentSessionSnapshot
} from "../../../shared/agent";
import type { GlobalDialogModel } from "../global-dialog";
import type { TerminalDockTab } from "../terminal-dock/types";
import type { WorkspaceTab } from "../workspace-tabs/types";
import type {
  DecisionOption,
  PermissionRequest
} from "./lyra-agents/core/types";
import type { ComposerCitationSink } from "../shell/use-browser-page-context-menu";
import { t, type I18nKey } from "@workbench/i18n";
import {
  applyAgentRuntimeEventToSnapshot,
  mergeRunningSessionSnapshot,
  normalizeAgentSessionSnapshot
} from "../agent-session-view-model";

export type FileRevealLocation = {
  readonly line: number;
  readonly endLine?: number;
};

export type WorkbenchPathTarget = {
  readonly path: string;
  readonly location?: FileRevealLocation | undefined;
};

export type LyraAgentDataProviderState = {
  readonly session: AgentSessionSnapshot | null;
  readonly error: string | null;
  readonly loading: boolean;
};

export type LyraAgentDataProviderAction =
  | { readonly type: "loading" }
  | { readonly type: "empty" }
  | { readonly type: "snapshot"; readonly snapshot: AgentSessionSnapshot }
  | { readonly type: "replaceSnapshot"; readonly snapshot: AgentSessionSnapshot }
  | { readonly type: "prependSnapshot"; readonly snapshot: AgentSessionSnapshot }
  | { readonly type: "event"; readonly event: AgentRuntimeEvent }
  | { readonly type: "error"; readonly message: string };

export type LyraAgentDataProviderCallbacks = {
  readonly onActiveSessionChange?: ((sessionId: string) => void) | undefined;
  readonly onSessionSnapshotChange?: ((snapshot: AgentSessionSnapshot) => void) | undefined;
  readonly onCreateDraftSessionTab?: ((request: AgentSessionCreateRequest) => void) | undefined;
  readonly onCreateSessionTab?: ((
    request: AgentSessionCreateRequest
  ) => Promise<AgentSessionSnapshot> | AgentSessionSnapshot) | undefined;
  readonly onMissingSession?: ((sessionId: string) => void) | undefined;
  readonly onRequestProjectBind?: ((currentPath?: string) => Promise<string | null>) | undefined;
  readonly onUpdateDraftWorkingDir?: ((workingDir: string) => void) | undefined;
  readonly onOpenProjectTree?: ((request: {
    readonly sessionId: string;
    readonly workingDir: string;
  }) => Promise<void> | void) | undefined;
  readonly onOpenPlanBoard?: ((request: {
    readonly sessionId: string;
    readonly plan: AgentPlanSnapshot;
    readonly projectTodo?: AgentProjectTodoSnapshot | null;
  }) => Promise<void> | void) | undefined;
  readonly onOpenProjectPlanManager?: ((request: {
    readonly sessionId: string;
    readonly workingDir: string;
    readonly view?: "plan" | "todo" | "both";
  }) => Promise<void> | void) | undefined;
  readonly onOpenAgentGit?: ((request: {
    readonly sessionId: string;
    readonly workingDir: string;
  }) => void) | undefined;
  readonly onOpenSubagent?: ((request: import("../agent-subagent").AgentSubagentOpenRequest) => void) | undefined;
  readonly onRevealProjectPath?: ((request: {
    readonly sessionId: string;
    readonly workingDir: string;
    readonly path: string;
    readonly location?: FileRevealLocation;
    readonly mode: "reveal" | "open-file";
  }) => Promise<void> | void) | undefined;
  readonly onOpenModelSettings?: (() => Promise<void> | void) | undefined;
  readonly onOpenUrlInWorkbench?: ((request: {
    readonly url: string;
    readonly title?: string;
  }) => Promise<void> | void) | undefined;
  readonly onOpenFile?: ((
    filePath: string,
    location?: FileRevealLocation,
    options?: { readonly siblingPaths?: readonly string[] }
  ) => void) | undefined;
  readonly onRevealPathInWorkbench?: ((filePath: string) => Promise<void> | void) | undefined;
  readonly onOpenTerminalLiveSession?: ((request: {
    readonly sessionId?: string | null;
    readonly terminalTabId?: string | null;
    readonly paneId?: string | null;
  }) => Promise<void> | void) | undefined;
  readonly openDialog?: GlobalDialogModel["openDialog"] | undefined;
  readonly composerCitationSinkRef?: MutableRefObject<ComposerCitationSink | null> | undefined;
  readonly onSetActiveBrowserTab?: ((tabId: string) => boolean) | undefined;
  readonly resolveActiveWorkspaceTab?: (() => WorkspaceTab | undefined) | undefined;
  readonly onPickFileFromFileManager?: (() => Promise<string | null>) | undefined;
  readonly listWorkspaceTabs?: (() => readonly WorkspaceTab[]) | undefined;
  readonly listTerminalTabs?: (() => readonly TerminalDockTab[]) | undefined;
  readonly getTerminalTabPanes?: ((tabId: string) => readonly import("../terminal-dock/types").TerminalDockPane[]) | undefined;
  readonly onCloseTerminalTab?: ((tabId: string) => void) | undefined;
  readonly onFocusTerminalTabInDock?: ((tabId: string) => void) | undefined;
  readonly aiRichRenderingEnabled?: boolean | undefined;
};

const isAbsoluteOrHomePath = (filePath: string): boolean =>
  /^(?:\/|~\/|[A-Za-z]:[\\/]|file:\/\/)/u.test(filePath);

const resolveSessionRelativePath = (
  filePath: string,
  workingDir: string | null | undefined
): string => {
  const trimmed = filePath.trim();
  const base = workingDir?.trim() ?? "";
  const hasAbsoluteBase = base.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(base);
  if (trimmed.length === 0 || isAbsoluteOrHomePath(trimmed) || !hasAbsoluteBase || base === "/") {
    return trimmed;
  }
  const parts: string[] = [];
  for (const part of `${base.replace(/\/+$/u, "")}/${trimmed}`.replaceAll("\\", "/").split("/")) {
    if (part.length === 0 || part === ".") {
      continue;
    }
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return base.startsWith("/") ? `/${parts.join("/")}` : parts.join("/");
};

const inferHomePathFromWorkingDir = (
  workingDir: string | null | undefined
): string | null => {
  const normalized = (workingDir ?? "").trim().replaceAll("\\", "/");
  const match = normalized.match(/^\/(?:Users|home)\/[^/]+(?=\/|$)/u);
  return match?.[0] ?? null;
};

export const parseWorkbenchPathTarget = (
  filePath: string,
  workingDir: string | null | undefined
): WorkbenchPathTarget | null => {
  let cleanedPath = filePath.trim();
  if (cleanedPath.length === 0) {
    return null;
  }
  if (cleanedPath.startsWith("file:///")) {
    cleanedPath = `/${cleanedPath.slice(8)}`;
  } else if (cleanedPath.startsWith("file://")) {
    cleanedPath = `/${cleanedPath.slice(7)}`;
  }
  if (cleanedPath.startsWith("~/")) {
    const homePath = inferHomePathFromWorkingDir(workingDir);
    if (homePath !== null) {
      cleanedPath = `${homePath}${cleanedPath.slice(1)}`;
    }
  }

  let line: number | undefined;
  let endLine: number | undefined;
  const hashMatch = cleanedPath.match(/#L(\d+)(?:-L(\d+))?$/u);
  if (hashMatch !== null) {
    line = Number.parseInt(hashMatch[1]!, 10);
    if (hashMatch[2] !== undefined) {
      endLine = Number.parseInt(hashMatch[2], 10);
    }
    cleanedPath = cleanedPath.replace(/#L\d+(?:-L\d+)?$/u, "");
  }
  const colonMatch = cleanedPath.match(/:(\d+)(?::(\d+))?$/u);
  if (colonMatch !== null) {
    line = Number.parseInt(colonMatch[1]!, 10);
    cleanedPath = cleanedPath.replace(/:\d+(?::\d+)?$/u, "");
  }
  const path = resolveSessionRelativePath(cleanedPath, workingDir).trim();
  if (path.length === 0) {
    return null;
  }
  const location = line === undefined
    ? undefined
    : (endLine === undefined ? { line } : { line, endLine });
  return { path, location };
};

const normalizeProjectPathBoundary = (value: string): string =>
  value.trim().replace(/\\/g, "/").replace(/\/+$/u, "");

export const isPathInsideProjectRoot = (
  filePath: string,
  rootPath: string
): boolean => {
  const normalizedPath = normalizeProjectPathBoundary(filePath);
  const normalizedRoot = normalizeProjectPathBoundary(rootPath);
  if (normalizedPath.length === 0 || normalizedRoot.length === 0 || normalizedRoot === "/") {
    return false;
  }
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
};

export const imageUrlSource = (
  source: string | null | undefined
): string | null => {
  const trimmed = source?.trim() ?? "";
  if (trimmed.length === 0) {
    return null;
  }
  if (/^www\./iu.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^localhost(?::\d+)?(?:\/|$)/iu.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return /^https?:\/\//iu.test(trimmed) ? trimmed : null;
};

export const initialLyraAgentDataProviderState: LyraAgentDataProviderState = {
  session: null,
  error: null,
  loading: true
};

const applyEvent = (
  state: LyraAgentDataProviderState,
  event: AgentRuntimeEvent
): LyraAgentDataProviderState => {
  if (event.kind === "sessionSnapshot") {
    if (state.session !== null && event.snapshot.id !== state.session.id) {
      return state;
    }
    const session = state.session === null
      ? normalizeAgentSessionSnapshot(event.snapshot)
      : mergeRunningSessionSnapshot(state.session, event.snapshot);
    return {
      ...state,
      session,
      loading: false,
      error: null
    };
  }
  if (state.session !== null && "sessionId" in event && event.sessionId !== state.session.id) {
    return state;
  }
  if (state.session === null) {
    return state;
  }
  return {
    ...state,
    session: applyAgentRuntimeEventToSnapshot(state.session, event),
    ...(event.kind === "turnFailed" ? { error: null } : {})
  };
};

export const translateI18nKey = (
  key: string | null | undefined
): string | undefined => {
  const normalized = key?.trim();
  return normalized ? t(normalized as I18nKey) : undefined;
};

const normalizeOptionalText = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isCustomOptionLabel = (label: string): boolean => {
  const trimmed = label.trim();
  const normalized = trimmed.toLowerCase();
  return (
    normalized === "other"
    || normalized === "custom"
    || normalized === "something else"
    || trimmed === "其他"
    || trimmed === "其它"
    || trimmed === "自定义"
  );
};

export const normalizeClarificationOptions = (
  options: readonly (
    | string
    | {
        readonly value?: string | null;
        readonly label: string;
        readonly description?: string | null;
        readonly i18nKey?: string | null;
        readonly descriptionI18nKey?: string | null;
      }
  )[]
): DecisionOption[] => {
  const normalized: DecisionOption[] = [];
  for (const option of options) {
    const label = (typeof option === "string" ? option : option.label).trim();
    const description =
      typeof option === "string" ? null : normalizeOptionalText(option.description ?? null);
    if (label.length === 0 || isCustomOptionLabel(label)) continue;
    const value = (typeof option === "string" ? label : option.value?.trim()) || label;
    if (normalized.some((existing) => existing.value === value)) continue;
    const item: DecisionOption = { value, label, description };
    if (typeof option !== "string") {
      const displayLabel = translateI18nKey(option.i18nKey);
      const displayDescription = translateI18nKey(option.descriptionI18nKey);
      if (displayLabel !== undefined) item.displayLabel = displayLabel;
      if (displayDescription !== undefined) item.displayDescription = displayDescription;
    }
    normalized.push(item);
  }
  return normalized;
};

/** Prepend an older page, deduped by id; returns the same array when nothing is new. */
const mergeEarlierById = <T extends { readonly id: string }>(
  earlier: readonly T[],
  current: readonly T[]
): readonly T[] => {
  if (earlier.length === 0) return current;
  const known = new Set(current.map((item) => item.id));
  const additions = earlier.filter((item) => !known.has(item.id));
  return additions.length === 0 ? current : [...additions, ...current];
};

export const lyraAgentDataProviderReducer = (
  state: LyraAgentDataProviderState,
  action: LyraAgentDataProviderAction
): LyraAgentDataProviderState => {
  if (action.type === "loading") {
    return { ...state, loading: true, error: null };
  }
  if (action.type === "empty") {
    return { session: null, error: null, loading: false };
  }
  if (action.type === "snapshot") {
    const session = state.session !== null && state.session.id === action.snapshot.id
      ? mergeRunningSessionSnapshot(state.session, action.snapshot)
      : normalizeAgentSessionSnapshot(action.snapshot);
    return {
      ...state,
      session,
      loading: false,
      error: null
    };
  }
  if (action.type === "replaceSnapshot") {
    return {
      ...state,
      session: normalizeAgentSessionSnapshot(action.snapshot),
      loading: false,
      error: null
    };
  }
  if (action.type === "prependSnapshot") {
    // History paging (rows/range shape): merge an older page in front of the
    // loaded window. Dedupe by id so an overlapping page (or a runtime that
    // fell back to the tail) can never duplicate rows; everything outside the
    // row window stays owned by the live session.
    const current = state.session;
    if (current === null || current.id !== action.snapshot.id) {
      return state;
    }
    const messages = mergeEarlierById(action.snapshot.messages, current.messages);
    if (messages === current.messages) {
      return state;
    }
    const messageWindow = action.snapshot.messageWindow ?? current.messageWindow;
    return {
      ...state,
      session: {
        ...current,
        messages,
        tools: mergeEarlierById(action.snapshot.tools, current.tools),
        ...(messageWindow === undefined ? {} : { messageWindow })
      }
    };
  }
  if (action.type === "event") {
    return applyEvent(state, action.event);
  }
  return { ...state, loading: false, error: action.message };
};

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export const isMissingSessionError = (error: unknown): boolean => {
  const message = toErrorMessage(error).toLowerCase();
  return (
    message.includes("not found")
    || message.includes("missing")
    || message.includes("deleted")
    || message.includes("no such file")
    || message.includes("enoent")
  );
};

export const runtimeEventSessionId = (
  event: AgentRuntimeEvent
): string | null => {
  if ("sessionId" in event) return event.sessionId;
  if (event.kind === "sessionSnapshot") return event.snapshot.id;
  return null;
};

export const classifyPermissionRequest = (
  title: string,
  detail: string
): PermissionRequest["type"] => {
  const text = `${title} ${detail}`.toLowerCase();
  if (/\b(shell|bash|command|terminal|exec)\b/.test(text)) return "shell";
  if (/\b(file|write|read|delete|patch|edit|workspace)\b/.test(text)) return "file";
  if (/\b(http|https|network|browser|web|url)\b/.test(text)) return "network";
  return "dangerous";
};

export const upsertById = <T extends { readonly id: string }>(
  items: readonly T[],
  item: T
): T[] => {
  const index = items.findIndex((existing) => existing.id === item.id);
  if (index === -1) return [...items, item];
  return items.map((existing, existingIndex) => (existingIndex === index ? item : existing));
};
