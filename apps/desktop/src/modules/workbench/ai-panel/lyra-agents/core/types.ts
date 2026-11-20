// ============================================================================
// Lyra Agents — Core Domain Types
// ============================================================================
//
// This file is the single source of truth for all domain models the UI
// consumes. It is framework-agnostic and contains no React types so it can
// be reused from a server-side rendering pipeline or type-checked from
// external data providers.

import type {
  AgentMessageWebLink,
  AgentPageCitation,
  AgentTranscriptCitation
} from "../../../../../shared/agent";
import type { AgentFileAttachment } from "../features/chat/composer-file";
import type { LyraSensitiveValueRef } from "../../../../../shared/desktop-bridge";

export type ToolStatus = "running" | "suspended" | "success" | "warning" | "error";

export type ToolKind =
  | "read"
  | "edit"
  | "search"
  | "shell"
  | "terminal"
  | "web"
  | "workbench"
  | "thought"
  | "plan"
  | "task"
  | "create";

export interface ToolCall {
  id: string;
  kind: ToolKind;
  title: string;
  status: ToolStatus;
  toolName?: string;
  toolPath?: string;
  domain?: string;
  operation?: string;
  activityKind?: string;
  rendererHint?: string;
  details?: ToolDetails;
  traceId?: string;
  trace?: readonly unknown[];
  artifactRefs?: readonly unknown[];
  artifactTargets?: readonly ToolActionTarget[];
  artifactPreviews?: readonly ToolArtifactPreview[];
  changes?: readonly unknown[];
  failureReason?: string;
  subagentId?: string | null;
  background?: boolean;
}

export type ToolDetails =
  | { type: "edit"; file: string; additions: number; deletions: number; hunks: DiffHunk[] }
  | { type: "read"; file: string; range?: string; preview?: string }
  | { type: "search"; query: string; results: SearchResult[] }
  | { type: "shell"; command: string; output: string; exitCode: number }
  | {
      type: "terminal";
      action: string;
      target: "private" | "ui" | "list";
      output: string;
      cursor?: string;
      sessionId?: string;
      terminalTabId?: string;
      paneId?: string;
      command?: string;
      wrote?: string;
      reason?: "output" | "exit" | "timeout";
      running: boolean;
      exitCode: number | null;
      truncated: boolean;
      screen?: Readonly<Record<string, unknown>>;
      memory?: Readonly<Record<string, unknown>>;
      readHint?: Readonly<Record<string, unknown>>;
      artifacts?: ToolActionTarget[];
    }
  | {
      type: "web";
      url: string;
      summary?: string;
      screenshot?: string | undefined;
      query?: string;
      results?: WebResult[];
      title?: string;
      fetchedBytes?: number;
    }
  | {
      type: "workbench";
      action: string;
      label: string;
      tabs?: WorkbenchTabSummary[];
      tab?: WorkbenchTabSummary;
      excerpt?: string;
      text?: string;
    }
  | {
      type: "lumen";
      action: string;
      targetMode: string;
      peek: ToolPeek;
      text?: string;
      screenshot?: string | undefined;
      screenshotImage?: AgentImageAttachment | undefined;
      targets?: ToolActionTarget[];
    }
  | {
      type: "software";
      action: string;
      softwareId?: string;
      actionId?: string;
      text?: string;
      targets?: ToolActionTarget[];
    }
  | { type: "task"; tasks: TodoTask[] }
  | { type: "text"; body: string }
  | { type: "ask"; question: string; answer: string };

export interface ToolPeek {
  chips: string[];
  excerpt?: string;
  thumbnail?: {
    src: string;
    alt: string;
  };
}

export interface SearchResult {
  file: string;
  line: number;
  text: string;
}

export interface WebResult {
  title: string;
  url: string;
  snippet?: string;
}

export interface WorkbenchTabSummary {
  title: string;
  tabId: string;
  kind: string;
  observationKind?: string;
  flags: string[];
  url?: string;
  excerpt?: string;
}

export interface DiffHunk {
  startLine: number;
  lines: DiffLine[];
}

export interface DiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

export interface TodoTask {
  title: string;
  status: "pending" | "running" | "done";
}

export interface AgentImageAttachment {
  id: string;
  mediaType: string;
  /** Empty when the attachment is stored by filesystem path in `source`. */
  data?: string;
  label?: string | null;
  source?: string | null;
  width?: number | null;
  height?: number | null;
  workspaceTabId?: string | null;
  workspaceTabTitle?: string | null;
  workspaceTabPageKind?: string | null;
  workspaceTabAddress?: string | null;
}

export interface ToolActionTarget {
  kind: "url" | "file" | "secret";
  label: string;
  value: string;
  mediaType?: string;
  width?: number | null;
  height?: number | null;
  secretRef?: LyraSensitiveValueRef;
}

export interface ToolArtifactPreview {
  label: string;
  text: string;
  kind?: string;
  path?: string;
  bytes?: number;
  truncated?: boolean;
}

export type GroupStatus = "running" | "suspended" | "done";

export interface ToolGroup {
  id: string;
  status: GroupStatus;
  label: string;
  hint?: string;
  calls: ToolCall[];
  currentCallId?: string;
}

export type MessageBlock =
  | {
      type: "text";
      id: string;
      body: string;
      /** Native runtime block id used by streaming deltas; null selects the newest emerging block. */
      sourceBlockId?: string | null;
      /**
       * Snapshot message that owns the stream store. Consecutive agent
       * messages are drawn as one bubble, but deltas stay on the later id.
       */
      sourceMessageId?: string;
    }
  | { type: "image"; id: string; image: AgentImageAttachment }
  | { type: "tools"; id: string; group: ToolGroup }
  | { type: "thinking"; id: string; body: string; status: "running" | "done"; sourceMessageId?: string };

export interface ChatMessage {
  webLinks?: readonly AgentMessageWebLink[];
  id: string;
  author: "user" | "agent";
  /** Current model response within this turn; its stream survives bubble coalescing. */
  streamingMessageId?: string;
  blocks: MessageBlock[];
  isApiError?: boolean;
  /** Resolved transcript citations attached to a sent user message. */
  transcriptCitations?: readonly AgentTranscriptCitation[];
  /** Resolved page citations attached to a sent user message. */
  pageCitations?: readonly AgentPageCitation[];
  /** Inline image attachments referenced by ⟦image:id⟧ markers in message text. */
  inlineImages?: readonly AgentImageAttachment[];
  /** Inline file attachments referenced by ⟦file:id⟧ markers in message text. */
  fileAttachments?: readonly AgentFileAttachment[];
  /** Real elapsed work duration for the assistant process folded before the final summary. */
  workDurationMs?: number;
  time?: string;
  rollback?: {
    available: boolean;
    anchorId?: string | null;
    checkpointAt?: string | null;
    unavailableReason?: string | null;
  } | null;
}

export interface ModelOption {
  id: string;
  label: string;
  model: string;
  provider?: string | null;
  providerId?: string | null;
  providerKey?: string | null;
  detail?: string | null;
  available: boolean;
  enabled: boolean;
  selected?: boolean;
  contextWindow?: number | null;
  accountEmail?: string | null;
  accountName?: string | null;
  accountAvatarUrl?: string | null;
}

export interface ProviderOptionControl {
  current?: string | null;
  options: string[];
  supported: boolean;
}

export interface ComposerModelControls {
  currentModel: string;
  currentProvider: string;
  models: ModelOption[];
  reasoningEffort: ProviderOptionControl;
  verbosity: ProviderOptionControl;
  serviceTier: ProviderOptionControl;
  isRefreshing: boolean;
  isSwitching: boolean;
  switchModel(modelId: string): Promise<void>;
  refreshModels(): Promise<void>;
  openModelSettings(): Promise<void>;
  updateReasoningEffort(value: string): Promise<void>;
  updateVerbosity(value: string): Promise<void>;
  updateServiceTier(value: string): Promise<void>;
}

export type ComposerPermissionMode = "approval" | "full_auto" | "autonomous" | "custom";

export interface ComposerPermissionModeControls {
  currentMode: ComposerPermissionMode;
  isSwitching: boolean;
  warning?: string | null;
  configPath?: string | null;
  switchMode(mode: Exclude<ComposerPermissionMode, "custom">): Promise<void>;
}

// Session-level state surfaced through the data provider ------------------

export interface TodoItem {
  id: string;
  title: string;
  status: "pending" | "running" | "done";
}

export interface DiffFileEntry {
  file: string;
  additions: number;
  deletions: number;
}

export interface DecisionOption {
  value: string;
  label: string;
  description?: string | null;
  displayLabel?: string;
  displayDescription?: string | null;
}

export interface DecisionQuestion {
  id: string;
  question: string;
  displayQuestion?: string;
  options: DecisionOption[];
  allowCustomAnswer?: boolean;
  detail?: string | null;
  displayDetail?: string | null;
  sessionId: string;
}

export interface PermissionRequest {
  id: string;
  type: "shell" | "file" | "network" | "dangerous";
  title: string;
  detail: string;
  sessionId: string;
}

export interface SessionMeta {
  id?: string | null;
  title: string;
  project: string;
  workingDir: string | null;
  projectBound: boolean;
  /** True when the session is bound to the user's home directory by default. */
  workingDirIsHome: boolean;
  totalAdditions: number;
  totalDeletions: number;
  tokenEstimate?: number | null;
}
