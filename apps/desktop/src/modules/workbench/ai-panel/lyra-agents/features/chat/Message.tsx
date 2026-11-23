import { Check, ChevronDown, ChevronUp, Copy, Link2, Undo2 } from "@lyra/icons";
import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import {
  AGENT_FOLLOW_ACTIVITY_CONNECTING,
  type AgentRollbackPreviewResponse,
  type AgentRuntimeTurnState
} from "../../../../../../shared/agent";
import { writeClipboardText } from "../../../../../../shared/clipboard";
import type { ChatMessage, MessageBlock, ToolCall, ToolDetails, ToolGroup } from "../../core/types";
import { useData } from "../../data/DataProvider";
import { ToolGroupBlock, type ThinkingEntry, type ToolGroupActivityEntry } from "../tools/ToolGroup";
import { ChangedFilesCard } from "./ChangedFilesCard";
import { collectChangedFiles, isActiveTurnMessage } from "./changed-files";
import { BrailleSpinner } from "../../components/BrailleSpinner";
import { ToolExecutionIndicator } from "../../components/Icons";
import { ClickableImage, imagePreviewSource } from "../rich-text/ActionTargets";
import { ChatMediaLayout, mediaImageFromAttachment } from "../media";
import type { MediaToken } from "../media/layout";
import { StreamingText } from "../rich-text/StreamingText";
import { useStreamingMessageReasoning, useStreamingReasoningOpen } from "../rich-text/use-streaming-message-text";
import { formatMessage, t } from "@workbench/i18n";
import { toolGroupLabel } from "@workbench/agent-session-view-model/tool-view-model";
import { AppButton } from "@renderer/ui/components";
import { MESSAGE_CITATION_TARGET_CLASS, COLLAPSE_CLASS,
  COLLAPSE_INNER_CLASS,
  MESSAGE_CONTENT_USER_CLASS
} from "./classes";
import { MessageCitationText } from "./MessageCitationText";
import { MessageTextBlock } from "./message-text-block";
import { withStreamingReasoning } from "./message-activity-blocks";

/** Local activity is separate from the lifecycle of the whole turn. */
export function isAgentMessageWorking(message: ChatMessage): boolean {
  return message.blocks.some(
    (b) => (b.type === "tools" && b.group.status === "running")
      || (b.type === "thinking" && b.status === "running")
  );
}

export function isEmptyPendingAgentMessage(message: ChatMessage): boolean {
  return (
    message.author === "agent" &&
    message.blocks.length > 0 &&
    message.blocks.every((b) => b.type === "text" && b.body.trim().length === 0)
  );
}

export function shouldShowAgentActivityIndicator(message: ChatMessage): boolean {
  return (
    message.author === "agent" &&
    (isEmptyPendingAgentMessage(message) || isAgentMessageWorking(message))
  );
}

export function resolveAgentActivityHostMessageId(
  messages: readonly ChatMessage[],
  isTurnRunning: boolean
): string | null {
  if (!isTurnRunning) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.author === "user") break;
    if (message?.author === "agent") return message.id;
  }
  return null;
}

const normalizeFollowActivity = (
  activity: string | null | undefined
): AgentRuntimeTurnState | null => {
  if (activity === null || activity === undefined || activity.trim().length === 0) {
    return null;
  }
  const normalized = activity.trim().toLowerCase().replace(/\s+/g, "_");
  switch (normalized) {
    case "calling_model":
    case "streaming_model":
    case "waiting_for_tool":
    case "retrying_provider":
      return normalized;
    default:
      return null;
  }
};

export const isRecognizedFollowActivity = (
  activity: string | null | undefined
): boolean => activity === AGENT_FOLLOW_ACTIVITY_CONNECTING || normalizeFollowActivity(activity) !== null;

const usesServiceStatusDots = (activity: string | null | undefined): boolean =>
  activity === AGENT_FOLLOW_ACTIVITY_CONNECTING ||
  normalizeFollowActivity(activity) === "retrying_provider";

const activateButtonKey = (
  event: KeyboardEvent<HTMLElement>,
  action: () => void
): void => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  event.preventDefault();
  action();
};

type AgentMessageProps = {
  message: ChatMessage;
  showActivityIndicator: boolean;
  activityIndicatorMessage: ChatMessage | null;
  isTurnRunning: boolean;
  isActiveTurnRunning: boolean;
  followActivity: string | null | undefined;
  highlightCitationTarget?: boolean;
  onContextMenu?: (event: MouseEvent<HTMLElement>, message: ChatMessage) => void;
  onCiteMessage?: () => void;
};

const rollbackEqual = (
  left: ChatMessage["rollback"] | undefined,
  right: ChatMessage["rollback"] | undefined
): boolean => {
  if (left === right) return true;
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right;
  }
  return left.available === right.available &&
    left.anchorId === right.anchorId &&
    left.checkpointAt === right.checkpointAt &&
    left.unavailableReason === right.unavailableReason;
};

const diffLinesEqual = (
  left: readonly { kind: string; text: string }[],
  right: readonly { kind: string; text: string }[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a?.kind !== b?.kind || a?.text !== b?.text) return false;
  }
  return true;
};

const diffHunksEqual = (
  left: readonly { startLine: number; lines: readonly { kind: string; text: string }[] }[],
  right: readonly { startLine: number; lines: readonly { kind: string; text: string }[] }[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a?.startLine !== b?.startLine) return false;
    if (!diffLinesEqual(a?.lines ?? [], b?.lines ?? [])) return false;
  }
  return true;
};

const searchResultsEqual = (
  left: readonly { file: string; line: number; text: string }[],
  right: readonly { file: string; line: number; text: string }[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a?.file !== b?.file || a?.line !== b?.line || a?.text !== b?.text) {
      return false;
    }
  }
  return true;
};

const webResultsEqual = (
  left: readonly { title: string; url: string; snippet?: string }[] | undefined,
  right: readonly { title: string; url: string; snippet?: string }[] | undefined
): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a?.title !== b?.title || a?.url !== b?.url || a?.snippet !== b?.snippet) {
      return false;
    }
  }
  return true;
};

const stringArraysEqual = (
  left: readonly string[],
  right: readonly string[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
};

const workbenchTabsEqual = (
  left: readonly { title: string; tabId: string; kind: string; flags: readonly string[]; url?: string; excerpt?: string }[] | undefined,
  right: readonly { title: string; tabId: string; kind: string; flags: readonly string[]; url?: string; excerpt?: string }[] | undefined
): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a?.title !== b?.title ||
      a?.tabId !== b?.tabId ||
      a?.kind !== b?.kind ||
      a?.url !== b?.url ||
      a?.excerpt !== b?.excerpt ||
      a === undefined ||
      b === undefined ||
      !stringArraysEqual(a.flags, b.flags)
    ) {
      return false;
    }
  }
  return true;
};

const unknownArrayEqual = (
  left: readonly unknown[] | undefined,
  right: readonly unknown[] | undefined
): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!unknownValueEqual(left[index], right[index])) return false;
  }
  return true;
};

const unknownRecordEqual = (
  left: Record<string, unknown>,
  right: Record<string, unknown>
): boolean => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) return false;
    if (!unknownValueEqual(left[key], right[key])) return false;
  }
  return true;
};

function unknownValueEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === null || right === null) return left === right;
  if (typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) &&
      Array.isArray(right) &&
      unknownArrayEqual(left, right);
  }
  if (typeof left === "object" && typeof right === "object") {
    return unknownRecordEqual(
      left as Record<string, unknown>,
      right as Record<string, unknown>
    );
  }
  return false;
}

const isContextCompressionBlock = (block: MessageBlock): boolean =>
  block.type === "tools"
  && block.group.calls.length > 0
  && block.group.calls.every((call) => call.toolName === "context_compress");

const splitContextCompressionTail = (
  blocks: readonly MessageBlock[]
): { readonly head: MessageBlock[]; readonly tail: MessageBlock[] } => {
  let end = blocks.length;
  while (end > 0 && isContextCompressionBlock(blocks[end - 1]!)) {
    end -= 1;
  }
  return {
    head: blocks.slice(0, end),
    tail: blocks.slice(end)
  };
};

const resolveFinalSummaryBlockId = (message: ChatMessage): string | null => {
  if (message.isApiError === true || isAgentMessageWorking(message)) return null;
  const lastBlock = message.blocks.at(-1);
  if (lastBlock?.type !== "text" || lastBlock.body.trim().length === 0) return null;
  const precedingBlocks = message.blocks.slice(0, -1);
  if (!precedingBlocks.some((block) => block.type === "tools")) return null;
  return lastBlock.id;
};

const formatProcessDuration = (durationMs: number | undefined): string | null => {
  if (durationMs === undefined || !Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  const seconds = Math.max(1, Math.round(durationMs / 1000));
  if (seconds < 60) {
    return formatMessage("lyra-agents-message.durationSeconds", { count: seconds });
  }
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return formatMessage("lyra-agents-message.durationMinutes", { count: minutes });
  }
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) {
    return formatMessage("lyra-agents-message.durationHours", { count: hours });
  }
  return formatMessage("lyra-agents-message.durationDays", {
    count: Math.max(1, Math.round(hours / 24))
  });
};

const taskItemsEqual = (
  left: readonly { title: string; status: string }[],
  right: readonly { title: string; status: string }[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a?.title !== b?.title || a?.status !== b?.status) return false;
  }
  return true;
};

const toolDetailsEqual = (left: ToolDetails | undefined, right: ToolDetails | undefined): boolean => {
  if (left === right) return true;
  if (left === undefined || right === undefined) return left === right;
  if (left.type !== right.type) return false;

  switch (left.type) {
    case "edit":
      return right.type === "edit" &&
        left.file === right.file &&
        left.additions === right.additions &&
        left.deletions === right.deletions &&
        diffHunksEqual(left.hunks, right.hunks);
    case "read":
      return right.type === "read" &&
        left.file === right.file &&
        left.range === right.range &&
        left.preview === right.preview;
    case "search":
      return right.type === "search" &&
        left.query === right.query &&
        searchResultsEqual(left.results, right.results);
    case "shell":
      return right.type === "shell" &&
        left.command === right.command &&
        left.output === right.output &&
        left.exitCode === right.exitCode;
    case "terminal":
      return right.type === "terminal" &&
        left.action === right.action &&
        left.target === right.target &&
        left.output === right.output &&
        left.cursor === right.cursor &&
        left.sessionId === right.sessionId &&
        left.terminalTabId === right.terminalTabId &&
        left.paneId === right.paneId &&
        left.command === right.command &&
        left.wrote === right.wrote &&
        left.reason === right.reason &&
        left.running === right.running &&
        left.exitCode === right.exitCode &&
        left.truncated === right.truncated;
    case "web":
      return right.type === "web" &&
        left.url === right.url &&
        left.summary === right.summary &&
        left.screenshot === right.screenshot &&
        left.query === right.query &&
        left.title === right.title &&
        left.fetchedBytes === right.fetchedBytes &&
        webResultsEqual(left.results, right.results);
    case "workbench":
      return right.type === "workbench" &&
        left.action === right.action &&
        left.label === right.label &&
        left.excerpt === right.excerpt &&
        left.text === right.text &&
        workbenchTabsEqual(left.tabs, right.tabs) &&
        workbenchTabsEqual(left.tab === undefined ? undefined : [left.tab], right.tab === undefined ? undefined : [right.tab]);
    case "lumen":
      return right.type === "lumen" &&
        left.action === right.action &&
        left.targetMode === right.targetMode &&
        left.text === right.text &&
        left.screenshot === right.screenshot &&
        left.peek.excerpt === right.peek.excerpt &&
        stringArraysEqual(left.peek.chips, right.peek.chips) &&
        unknownValueEqual(left.peek.thumbnail, right.peek.thumbnail) &&
        unknownArrayEqual(left.targets, right.targets);
    case "software":
      return right.type === "software" &&
        left.action === right.action &&
        left.softwareId === right.softwareId &&
        left.actionId === right.actionId &&
        left.text === right.text &&
        unknownArrayEqual(left.targets, right.targets);
    case "task":
      return right.type === "task" && taskItemsEqual(left.tasks, right.tasks);
    case "text":
      return right.type === "text" && left.body === right.body;
    case "ask":
      return right.type === "ask" &&
        left.question === right.question &&
        left.answer === right.answer;
    default:
      return false;
  }
};

const toolCallsEqual = (
  left: readonly ToolCall[],
  right: readonly ToolCall[]
): boolean => {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (
      a?.id !== b?.id ||
      a?.kind !== b?.kind ||
      a?.title !== b?.title ||
      a?.status !== b?.status ||
      a?.traceId !== b?.traceId ||
      a?.failureReason !== b?.failureReason ||
      !toolDetailsEqual(a?.details, b?.details) ||
      !unknownArrayEqual(a?.trace, b?.trace) ||
      !unknownArrayEqual(a?.artifactRefs, b?.artifactRefs) ||
      !unknownArrayEqual(a?.artifactTargets, b?.artifactTargets) ||
      !unknownArrayEqual(a?.artifactPreviews, b?.artifactPreviews) ||
      !unknownArrayEqual(a?.changes, b?.changes)
    ) {
      return false;
    }
  }
  return true;
};

const toolGroupEqual = (left: ToolGroup, right: ToolGroup): boolean => {
  if (left === right) return true;
  return left.id === right.id &&
    left.status === right.status &&
    left.label === right.label &&
    left.hint === right.hint &&
    left.currentCallId === right.currentCallId &&
    toolCallsEqual(left.calls, right.calls);
};

const mergeToolGroups = (left: ToolGroup, right: ToolGroup): ToolGroup => {
  const callsById = new Map<string, ToolCall>();
  for (const call of [...left.calls, ...right.calls]) {
    callsById.set(call.id, call);
  }
  const calls = [...callsById.values()];
  const running = calls.find((call) => call.status === "running");
  const suspended = calls.find((call) => call.status === "suspended");
  const active = running ?? suspended;
  const { currentCallId: _currentCallId, ...base } = left;
  return {
    ...base,
    status: running !== undefined ? "running" : suspended !== undefined ? "suspended" : "done",
    label: toolGroupLabel(calls, left.label),
    hint: active === undefined
      ? formatMessage("tool.events", { count: calls.length })
      : running !== undefined ? t("tool.running") : t("tool.waitingForUserAction"),
    ...(active === undefined ? {} : { currentCallId: active.id }),
    calls
  };
};

const thinkingActivityGroup = (entry: ThinkingEntry): ToolGroup => ({
  id: `${entry.id}-activity`,
  status: entry.status === "running" ? "running" : "done",
  label: entry.status === "running"
    ? t("lyra-agents-message.thinkingInProgress")
    : t("tool.agentActivity"),
  ...(entry.status === "running" ? { hint: t("tool.running") } : {}),
  calls: []
});

const mergeActivityGroups = (left: ToolGroup, right: ToolGroup): ToolGroup => {
  const merged = mergeToolGroups(left, right);
  if (left.status === "done" && right.status === "done") return merged;
  const running = merged.calls.find((call) => call.status === "running");
  const suspended = merged.calls.find((call) => call.status === "suspended");
  const active = running ?? suspended;
  const activeLabel = right.status !== "done" ? right.label : left.label;
  const status = left.status === "running" || right.status === "running"
    ? "running"
    : "suspended";
  const { currentCallId: _currentCallId, ...base } = merged;
  return {
    ...base,
    status,
    label: toolGroupLabel(merged.calls, activeLabel),
    hint: status === "running" ? t("tool.running") : t("tool.waitingForUserAction"),
    ...(active === undefined ? {} : { currentCallId: active.id })
  };
};

const blocksToMediaTokens = (blocks: readonly MessageBlock[]): MediaToken[] => {
  const tokens: MediaToken[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      tokens.push({
        type: "text",
        id: block.id,
        text: block.body,
        ...(block.sourceBlockId === undefined ? {} : { sourceBlockId: block.sourceBlockId })
      });
    } else if (block.type === "image") {
      tokens.push({
        type: "image",
        id: block.id,
        image: mediaImageFromAttachment(block.image)
      });
    }
  }
  return tokens;
};

const messageBlockEqual = (left: MessageBlock, right: MessageBlock): boolean => {
  if (left === right) return true;
  if (left.type !== right.type || left.id !== right.id) return false;
  switch (left.type) {
    case "text":
      return right.type === "text" &&
        left.body === right.body &&
        left.sourceBlockId === right.sourceBlockId &&
        left.sourceMessageId === right.sourceMessageId;
    case "image":
      return right.type === "image" &&
        left.image.id === right.image.id &&
        left.image.mediaType === right.image.mediaType &&
        left.image.data === right.image.data &&
        left.image.label === right.image.label &&
        left.image.source === right.image.source &&
        left.image.width === right.image.width &&
        left.image.height === right.image.height &&
        left.image.workspaceTabId === right.image.workspaceTabId &&
        left.image.workspaceTabTitle === right.image.workspaceTabTitle &&
        left.image.workspaceTabPageKind === right.image.workspaceTabPageKind &&
        left.image.workspaceTabAddress === right.image.workspaceTabAddress;
    case "tools":
      return right.type === "tools" && toolGroupEqual(left.group, right.group);
    case "thinking":
      return right.type === "thinking" &&
        left.sourceMessageId === right.sourceMessageId &&
        left.body === right.body &&
        left.status === right.status;
    default:
      return false;
  }
};

const chatMessageEqual = (
  left: ChatMessage | null,
  right: ChatMessage | null
): boolean => {
  if (left === right) return true;
  if (left === null || right === null) return left === right;
  if (
    left.id !== right.id ||
    left.streamingMessageId !== right.streamingMessageId ||
    left.author !== right.author ||
    left.isApiError !== right.isApiError ||
    left.time !== right.time ||
    left.workDurationMs !== right.workDurationMs ||
    left.blocks.length !== right.blocks.length ||
    !rollbackEqual(left.rollback, right.rollback)
  ) {
    return false;
  }
  for (let index = 0; index < left.blocks.length; index += 1) {
    const a = left.blocks[index];
    const b = right.blocks[index];
    if (a === undefined || b === undefined || !messageBlockEqual(a, b)) {
      return false;
    }
  }
  return true;
};

// Agent streaming is the chat render hot path. Avoid JSON.stringify here:
// it allocates and gets more expensive with every generated token.
const agentMessagePropsAreEqual = (prev: AgentMessageProps, next: AgentMessageProps): boolean => {
  if (prev.showActivityIndicator !== next.showActivityIndicator) return false;
  if (prev.isTurnRunning !== next.isTurnRunning) return false;
  if (prev.isActiveTurnRunning !== next.isActiveTurnRunning) return false;
  if (prev.followActivity !== next.followActivity) return false;
  if (prev.highlightCitationTarget !== next.highlightCitationTarget) return false;
  if (prev.onContextMenu !== next.onContextMenu) return false;
  if (prev.onCiteMessage !== next.onCiteMessage) return false;
  return chatMessageEqual(prev.activityIndicatorMessage, next.activityIndicatorMessage) &&
    chatMessageEqual(prev.message, next.message);
};

export const ServiceStatusDots = () => (
  <span className="lyra-agents-service-status-dots" aria-hidden="true">
    <span />
    <span />
    <span />
  </span>
);

function activeToolCall(message: ChatMessage) {
  for (const block of message.blocks) {
    if (block.type !== "tools" || block.group.status !== "running") continue;
    return block.group.currentCallId === undefined
      ? null
      : block.group.calls.find((call) => call.id === block.group.currentCallId) ?? null;
  }
  return null;
}

export function messageActivityIndicator(
  message: ChatMessage,
  followActivity: string | null | undefined
) {
  const toolCall = activeToolCall(message);
  if (toolCall?.kind === "thought") return <BrailleSpinner />;

  const activity = normalizeFollowActivity(followActivity);
  if (activity === "waiting_for_tool" || toolCall !== null) {
    return <ToolExecutionIndicator />;
  }
  if (activity === "streaming_model") return <BrailleSpinner />;
  if (usesServiceStatusDots(followActivity)) return <ServiceStatusDots />;
  return <BrailleSpinner />;
}

const COPY_FEEDBACK_DURATION_MS = 1_200;

const MessageCopyAction = ({ message }: { message: ChatMessage }) => {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const label = copied
    ? t("dialog.copiedAction")
    : t("lyra-agents-message.copy");

  const handleCopy = () => {
    const text = message.blocks
      .filter((block) => block.type === "text")
      .map((block) => (block as { body: string }).body)
      .join("\n\n");
    void writeClipboardText(text).then((didCopy) => {
      if (!didCopy) return;
      setCopied(true);
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, COPY_FEEDBACK_DURATION_MS);
    });
  };

  useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    []
  );

  return (
    <span
      className="lyra-agents-time-copy"
      onClick={handleCopy}
      onKeyDown={(event) => activateButtonKey(event, handleCopy)}
      role="button"
      tabIndex={0}
      aria-label={label}
      title={label}
    >
      {copied ? (
        <Check size={12} strokeWidth={2} aria-hidden="true" />
      ) : (
        <Copy size={12} strokeWidth={2} aria-hidden="true" />
      )}
    </span>
  );
};

const USER_BUBBLE_COLLAPSE_LINE_COUNT = 10;
// Chat column is wide enough that a wrapped line is about this many characters.
// ponytail: counting lines avoids scrollHeight, which would lay out history the
// content-visibility rule is there to skip.
const USER_BUBBLE_APPROX_CHARS_PER_LINE = 72;

const userBubbleExceedsCollapsedLines = (blocks: readonly MessageBlock[]): boolean => {
  let lines = 1;
  let column = 0;
  let seenText = false;
  for (const block of blocks) {
    if (block.type !== "text") continue;
    if (seenText) {
      lines += 1;
      column = 0;
      if (lines > USER_BUBBLE_COLLAPSE_LINE_COUNT) return true;
    }
    seenText = true;
    const text = block.body;
    for (let index = 0; index < text.length; index += 1) {
      if (text.charCodeAt(index) === 10) {
        lines += 1;
        column = 0;
      } else {
        column += 1;
        if (column > USER_BUBBLE_APPROX_CHARS_PER_LINE) {
          lines += 1;
          column = 1;
        }
      }
      if (lines > USER_BUBBLE_COLLAPSE_LINE_COUNT) return true;
    }
  }
  return false;
};

const messageBlocksToMediaTokens = (blocks: readonly MessageBlock[]): MediaToken[] => {
  const tokens: MediaToken[] = [];
  for (const block of blocks) {
    if (block.type === "text") {
      tokens.push({
        type: "text",
        id: block.id,
        text: block.body,
        ...(block.sourceBlockId === undefined ? {} : { sourceBlockId: block.sourceBlockId })
      });
    } else if (block.type === "image") {
      tokens.push({
        type: "image",
        id: block.id,
        image: mediaImageFromAttachment(block.image)
      });
    }
  }
  return tokens;
};

export function Message({
  message,
  showActivityIndicator = true,
  activityIndicatorMessage = null,
  highlightCitationTarget = false,
  onContextMenu,
  onCiteMessage
}: {
  message: ChatMessage;
  showActivityIndicator?: boolean;
  activityIndicatorMessage?: ChatMessage | null;
  highlightCitationTarget?: boolean;
  onContextMenu?: (event: MouseEvent<HTMLElement>, message: ChatMessage) => void;
  onCiteMessage?: () => void;
}) {
  const {
    previewRollback,
    rollbackMessage,
    messages,
    isTurnRunning,
    followActivity,
    scrollToMessage,
    navigateToPageCitation,
    openUrlInWorkbench,
    openImageInWorkbench,
    canOpenImageInWorkbench,
    openFileInWorkbench,
    session
  } = useData();
  const [rollbackPreview, setRollbackPreview] = useState<AgentRollbackPreviewResponse | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);
  const [rollbackError, setRollbackError] = useState<string | null>(null);
  const [userBubbleExpanded, setUserBubbleExpanded] = useState(false);
  const userBubbleOverflowing = message.author === "user"
    && userBubbleExceedsCollapsedLines(message.blocks);

  const canRollback =
    message.rollback?.available === true &&
    message.author === "user" &&
    !isTurnRunning &&
    !rollbackBusy;

  const unavailableRollbackReason =
    isTurnRunning
      ? t("lyra-agents-message.rollbackCancelRunning")
      : message.rollback?.unavailableReason ?? t("lyra-agents-message.rollbackUnavailable");

  const openRollbackConfirm = async () => {
    if (!canRollback) {
      setRollbackError(unavailableRollbackReason);
      return;
    }
    setRollbackBusy(true);
    setRollbackError(null);
    try {
      const preview = await previewRollback(message.id);
      if (!preview.available) {
        setRollbackError(preview.unavailableReason ?? t("lyra-agents-message.rollbackUnavailable"));
        setRollbackPreview(null);
        return;
      }
      setRollbackPreview(preview);
    } catch (error) {
      setRollbackError(error instanceof Error ? error.message : String(error));
    } finally {
      setRollbackBusy(false);
    }
  };

  const confirmRollback = async () => {
    setRollbackBusy(true);
    setRollbackError(null);
    try {
      await rollbackMessage(message.id);
      setRollbackPreview(null);
    } catch (error) {
      setRollbackError(error instanceof Error ? error.message : String(error));
    } finally {
      setRollbackBusy(false);
    }
  };

  if (message.author === "user") {
    return (
      <div
        className="lyra-agents-message lyra-agents-message-user"
        data-message-id={message.id}
      >
        <div className={MESSAGE_CONTENT_USER_CLASS}>
          <div
            className={`lyra-agents-message-bubble select-text${highlightCitationTarget ? ` ${MESSAGE_CITATION_TARGET_CLASS} rounded-[var(--lyra-radius-12)]` : ""}${userBubbleOverflowing && !userBubbleExpanded ? " lyra-agents-message-bubble-collapsed" : ""}`}
            onContextMenu={(event) => onContextMenu?.(event, message)}
          >
            {(() => {
              const renderUserTextBlock = (b: Extract<MessageBlock, { type: "text" }>) => {
                const transcriptCitations = message.transcriptCitations ?? [];
                const pageCitations = message.pageCitations ?? [];
                const inlineImages = message.inlineImages ?? [];
                const fileAttachments = message.fileAttachments ?? [];
                return (
                  <p
                    key={b.id}
                    className="lyra-agents-message-text select-text"
                    data-message-block-id={b.id}
                  >
                    <MessageCitationText
                      text={b.body}
                      webLinks={message.webLinks}
                      onWebLinkClick={(url) => { void openUrlInWorkbench(url); }}
                      transcriptCitations={transcriptCitations}
                      pageCitations={pageCitations}
                      inlineImages={inlineImages}
                      fileAttachments={fileAttachments}
                      onTranscriptCitationClick={(citation) => {
                        void scrollToMessage(citation.messageId, {
                          blockId: citation.blockId ?? null,
                          startOffset: citation.startOffset ?? null
                        });
                      }}
                      onPageCitationClick={(citation) => {
                        void navigateToPageCitation(citation);
                      }}
                      onImageAttachmentClick={(image) => {
                        if (!canOpenImageInWorkbench(image)) {
                          return;
                        }
                        void openImageInWorkbench(image);
                      }}
                      onFileAttachmentClick={(file) => {
                        void openFileInWorkbench(file.path);
                      }}
                    />
                  </p>
                );
              };
              const userMediaBlocks = message.blocks.filter(
                (block): block is Extract<MessageBlock, { type: "text" } | { type: "image" }> =>
                  block.type === "text" || block.type === "image"
              );
              if (userMediaBlocks.some((block) => block.type === "image")) {
                return (
                  <ChatMediaLayout
                    tokens={messageBlocksToMediaTokens(userMediaBlocks)}
                    renderText={(segment) => {
                      const textId = segment.type === "side-flow" ? segment.textId : segment.id;
                      const block = userMediaBlocks.find((candidate) => candidate.id === textId);
                      if (block?.type === "text") {
                        return renderUserTextBlock(block);
                      }
                      return (
                        <p className="lyra-agents-message-text select-text">{segment.text}</p>
                      );
                    }}
                  />
                );
              }
              return userMediaBlocks.map((block) =>
                block.type === "text" ? renderUserTextBlock(block) : null
              );
            })()}
          </div>
          {(message.time || userBubbleOverflowing) && (
            <span className="lyra-agents-message-time lyra-agents-message-time-user">
              <span className="lyra-agents-time-text">{message.time}</span>
              <span className="lyra-agents-time-actions">
                <MessageCopyAction message={message} />
                {onCiteMessage === undefined ? null : (
                  <span
                    className="lyra-agents-time-copy"
                    onClick={onCiteMessage}
                    onKeyDown={(event) => activateButtonKey(event, onCiteMessage)}
                    role="button"
                    tabIndex={0}
                    aria-label={t("lyra-agents-message.citeMessage")}
                    title={t("lyra-agents-message.citeMessage")}
                  >
                    <Link2 size={12} strokeWidth={2} />
                  </span>
                )}
                {message.rollback?.available === true ? (
                  <span
                    className="lyra-agents-time-copy"
                    onClick={openRollbackConfirm}
                    onKeyDown={(event) => activateButtonKey(event, openRollbackConfirm)}
                    role="button"
                    tabIndex={canRollback ? 0 : -1}
                    aria-disabled={!canRollback}
                    aria-label={t("lyra-agents-message.undoMessage")}
                    title={canRollback ? t("lyra-agents-message.rollbackTitle") : unavailableRollbackReason}
                  >
                    <Undo2 size={12} strokeWidth={2} />
                  </span>
                ) : null}
                {userBubbleOverflowing ? (
                  <span
                    className="lyra-agents-time-copy"
                    onClick={() => setUserBubbleExpanded((open) => !open)}
                    onKeyDown={(event) => activateButtonKey(event, () => setUserBubbleExpanded((open) => !open))}
                    role="button"
                    tabIndex={0}
                    aria-expanded={userBubbleExpanded}
                    aria-label={userBubbleExpanded ? t("lyra-agents-message.collapse") : t("lyra-agents-message.expand")}
                    title={userBubbleExpanded ? t("lyra-agents-message.collapse") : t("lyra-agents-message.expand")}
                  >
                    {userBubbleExpanded ? <ChevronUp size={12} strokeWidth={2} /> : <ChevronDown size={12} strokeWidth={2} />}
                  </span>
                ) : null}
              </span>
            </span>
          )}
          {(rollbackPreview !== null || rollbackError !== null) && (
            <div className="lyra-agents-message-rollback-popover" role="dialog" aria-label={t("lyra-agents-message.rollbackConfirm")}>
              {rollbackPreview !== null ? (
                <>
                  <div className="lyra-agents-message-rollback-title">{t("lyra-agents-message.rollbackTitle")}</div>
                  <div className="lyra-agents-message-rollback-body">
                    {formatMessage("lyra-agents-message.rollbackBody", {
                      messages: rollbackPreview.removedMessageCount,
                      files: rollbackPreview.changedFiles.length
                    })}
                  </div>
                  {rollbackPreview.changedFiles.length > 0 ? (
                    <div className="lyra-agents-message-rollback-files">
                      {rollbackPreview.changedFiles.slice(0, 4).map((file) => (
                        <span key={file.path}>{file.path}</span>
                      ))}
                      {rollbackPreview.changedFiles.length > 4 ? (
                        <span>
                          {formatMessage("lyra-agents-message.rollbackMoreFiles", {
                            count: rollbackPreview.changedFiles.length - 4
                          })}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="lyra-agents-message-rollback-actions">
                    <AppButton variant="ghost" size="sm" type="button" onClick={() => setRollbackPreview(null)} disabled={rollbackBusy}>
                      {t("lyra-agents-message.rollbackCancel")}
                    </AppButton>
                    <AppButton variant="ghost" size="sm" type="button" onClick={confirmRollback} disabled={rollbackBusy}>
                      {rollbackBusy ? t("lyra-agents-message.rollbackBusy") : t("lyra-agents-message.rollbackAction")}
                    </AppButton>
                  </div>
                </>
              ) : (
                <>
                  <div className="lyra-agents-message-rollback-title">{t("lyra-agents-message.rollbackErrorTitle")}</div>
                  <div className="lyra-agents-message-rollback-body">{rollbackError}</div>
                  <div className="lyra-agents-message-rollback-actions">
                    <AppButton variant="ghost" size="sm" type="button" onClick={() => setRollbackError(null)}>{t("lyra-agents-message.rollbackClose")}</AppButton>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <AgentMessage
      message={message}
      showActivityIndicator={showActivityIndicator}
      activityIndicatorMessage={activityIndicatorMessage}
      isTurnRunning={isTurnRunning}
      isActiveTurnRunning={isTurnRunning && isActiveTurnMessage(messages, message.id)}
      followActivity={followActivity}
      {...(highlightCitationTarget ? { highlightCitationTarget } : {})}
      {...(onContextMenu === undefined ? {} : { onContextMenu })}
      {...(onCiteMessage === undefined ? {} : { onCiteMessage })}
    />
  );
}

// Agent-message rendering is the hot path during streaming: the chat list rebuilds
// every ChatMessage object on every token, so this body is memoized with a
// content-based equality check. Unchanged earlier messages produce structurally
// identical props each token and are skipped; only the actively-streaming message
// (whose blocks change) re-renders.
const AgentMessage = memo(function AgentMessage({
  message,
  showActivityIndicator,
  activityIndicatorMessage,
  isTurnRunning,
  isActiveTurnRunning,
  followActivity,
  highlightCitationTarget = false,
  onContextMenu,
  onCiteMessage
}: AgentMessageProps) {
  const { session } = useData();
  const isLiveTurnMessage = isActiveTurnRunning;
  const streamingTextActive = isLiveTurnMessage;
  const streamingMessageId = message.streamingMessageId ?? message.id;
  const liveReasoning = useStreamingMessageReasoning(
    streamingMessageId,
    showActivityIndicator && streamingTextActive
  );
  const reasoningChannelOpen = useStreamingReasoningOpen(
    streamingMessageId,
    showActivityIndicator && streamingTextActive
  );
  const displayBlocks = withStreamingReasoning(message, liveReasoning, reasoningChannelOpen);
  const hasLiveReasoning = displayBlocks !== message.blocks;
  const activitySource = activityIndicatorMessage ?? message;
  const textBlocks = displayBlocks.filter((b) => b.type === "text");
  const lastTextId = textBlocks.at(-1)?.id ?? null;
  const { head: compressionHead, tail: compressionTail } = splitContextCompressionTail(displayBlocks);
  const runningCompression = compressionTail.filter(
    (block) => block.type === "tools" && block.group.status === "running"
  );
  const finishedCompression = compressionTail.filter(
    (block) => !(block.type === "tools" && block.group.status === "running")
  );
  const headLast = compressionHead.at(-1);
  const summaryBlocks = headLast?.type === "text"
    ? [...compressionHead.slice(0, -1), ...finishedCompression, headLast]
    : [...compressionHead, ...finishedCompression];
  const finalSummaryBlockId = isActiveTurnRunning
    ? null
    : resolveFinalSummaryBlockId({ ...message, blocks: summaryBlocks });
  const preSummaryBlocks = finalSummaryBlockId === null
    ? []
    : summaryBlocks.filter((block) => block.id !== finalSummaryBlockId);
  const [preSummaryOpen, setPreSummaryOpen] = useState(false);
  const processDuration = formatProcessDuration(message.workDurationMs);
  const processFoldLabel = processDuration === null
    ? t("lyra-agents-message.processFold")
    : formatMessage("lyra-agents-message.processWorked", { duration: processDuration });
  const isEmptyPendingAgent = isEmptyPendingAgentMessage(message) && !hasLiveReasoning;
  const hasTextBlocks = textBlocks.some((b) => b.body.trim().length > 0);
  const hasImages = displayBlocks.some((b) => b.type === "image");
  const showRespondingStatus =
    showActivityIndicator &&
    isActiveTurnRunning;

  if (isEmptyPendingAgent && !showActivityIndicator && !isTurnRunning) {
    return null;
  }

  const renderAgentBlock = (b: MessageBlock) => {
    if (b.type === "text") {
      // Only stream text that is actively being written (trailing text
      // block). Avoid re-animating earlier narration when a new tool
      // round starts. NOTE: we intentionally do NOT require the last
      // block overall to be text — when a tool block lands after the
      // current sentence (`[text, tool]`), the last *text* block is
      // still being streamed and must keep updating, otherwise it freezes
      // until the tool finishes.
      const isLastText = b.id === lastTextId;
      const shouldStream = streamingTextActive && isLastText;
      return (
        <MessageTextBlock key={b.id} message={message} block={b} streaming={shouldStream} />
      );
    }
    if (b.type === "image") {
      const src = imagePreviewSource(b.image, session.workingDir);
      return (
        <figure key={b.id} className="lyra-agents-message-image lyra-agents-message-image-agent select-text">
          <ClickableImage
            src={src}
            image={b.image}
            alt={b.image.label ?? t("lyra-agents-message.imageAttachment")}
          />
          {b.image.label !== undefined && b.image.label !== null ? (
            <figcaption>{b.image.label}</figcaption>
          ) : null}
        </figure>
      );
    }
    if (b.type === "tools") {
      return <ToolGroupBlock key={b.id} group={b.group} />;
    }
    return null;
  };

  const groupBlocksForRender = (blocks: readonly MessageBlock[]): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let currentActivity: {
      key: string;
      group: ToolGroup;
      entries: ToolGroupActivityEntry[];
    } | null = null;
    const appendActivityEntries = (entries: readonly ToolGroupActivityEntry[]) => {
      if (currentActivity === null) return;
      for (const entry of entries) {
        const existingIndex = currentActivity.entries.findIndex(
          (candidate) => candidate.type === entry.type && candidate.id === entry.id
        );
        if (existingIndex === -1) {
          currentActivity.entries.push(entry);
        } else {
          currentActivity.entries[existingIndex] = entry;
        }
      }
    };
    const appendActivity = (
      key: string,
      group: ToolGroup,
      entries: readonly ToolGroupActivityEntry[]
    ) => {
      if (currentActivity === null) {
        currentActivity = { key, group, entries: [] };
      } else {
        currentActivity.group = mergeActivityGroups(currentActivity.group, group);
      }
      appendActivityEntries(entries);
    };
    const flushActivity = () => {
      if (currentActivity === null) return;
      nodes.push(
        <ToolGroupBlock
          key={currentActivity.key}
          group={currentActivity.group}
          activityEntries={currentActivity.entries}
        />
      );
      currentActivity = null;
    };
    let mediaRun: MessageBlock[] = [];
    const flushMedia = () => {
      if (mediaRun.length === 0) return;
      const run = mediaRun;
      mediaRun = [];
      if (!run.some((block) => block.type === "image")) {
        for (const block of run) {
          nodes.push(renderAgentBlock(block));
        }
        return;
      }
      nodes.push(
        <ChatMediaLayout
          key={run.map((block) => block.id).join(":")}
          tokens={messageBlocksToMediaTokens(run)}
          renderText={(segment) => {
            const textId = segment.type === "side-flow" ? segment.textId : segment.id;
            const block = run.find((candidate) => candidate.id === textId);
            if (block !== undefined) {
              return renderAgentBlock(block);
            }
            return (
              <div className="lyra-agents-message-text-block select-text">
                <StreamingText
                  content={segment.text}
                  streaming={false}
                  messageId={message.id}
                  blockId={segment.sourceBlockId ?? null}
                />
              </div>
            );
          }}
        />
      );
    };
    for (const block of blocks) {
      if (block.type === "thinking") {
        flushMedia();
        const entry: ThinkingEntry = { id: block.id, body: block.body, status: block.status };
        appendActivity(block.id, thinkingActivityGroup(entry), [{
          type: "thinking",
          id: entry.id,
          entry
        }]);
      } else if (block.type === "tools") {
        flushMedia();
        if (isContextCompressionBlock(block)) {
          flushActivity();
        }
        appendActivity(
          block.id,
          block.group,
          block.group.calls.map((call) => ({ type: "tool", id: call.id, call }))
        );
      } else {
        flushActivity();
        mediaRun.push(block);
      }
    }
    flushMedia();
    flushActivity();
    return nodes;
  };

  const renderedBlocks = finalSummaryBlockId === null
    ? groupBlocksForRender(displayBlocks)
    : (
        <>
          <div className={`lyra-agents-message-process-fold ${preSummaryOpen ? "open" : ""}`}>
            <AppButton
              variant="ghost"
              size="sm"
              type="button"
              className="lyra-agents-message-process-fold-head"
              onClick={() => setPreSummaryOpen((open) => !open)}
              aria-expanded={preSummaryOpen}
            >
              <span className="lyra-agents-message-process-fold-line" aria-hidden="true" />
              <span className="lyra-agents-message-process-fold-label">{processFoldLabel}</span>
              <span className="lyra-agents-message-process-fold-line" aria-hidden="true" />
            </AppButton>
            <div className={COLLAPSE_CLASS} data-open={preSummaryOpen}>
              <div className={COLLAPSE_INNER_CLASS}>
                {preSummaryOpen ? (
                  <div className="lyra-agents-message-process-fold-body">
                    {groupBlocksForRender(preSummaryBlocks)}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          {summaryBlocks
            .filter((block) => block.id === finalSummaryBlockId)
            .map(renderAgentBlock)}
          {groupBlocksForRender(runningCompression)}
        </>
      );

  return (
    <div
      className={`lyra-agents-message lyra-agents-message-agent${message.isApiError === true ? " lyra-agents-message-agent-error" : ""}`}
      data-message-id={message.id}
    >
      <div
        className={`lyra-agents-message-body${highlightCitationTarget ? " " + MESSAGE_CITATION_TARGET_CLASS + " rounded-[var(--lyra-radius-8)]" : ""}`}
        onContextMenu={(event) => onContextMenu?.(event, message)}
      >
        {renderedBlocks}
        {isActiveTurnRunning ? null : (
          <ChangedFilesCard files={collectChangedFiles(message)} />
        )}
        {showRespondingStatus ? (
          <span className="lyra-agents-message-time lyra-agents-message-time-agent" aria-label={t("lyra-agents-message.agentResponding")}>
            {messageActivityIndicator(activitySource, followActivity)}
          </span>
        ) : (!isLiveTurnMessage && message.time && (hasTextBlocks || hasImages)) ? (
          <span className="lyra-agents-message-time lyra-agents-message-time-agent">
            <span className="lyra-agents-time-text">{message.time}</span>
            <span className="lyra-agents-time-actions">
              <MessageCopyAction message={message} />
              {onCiteMessage === undefined ? null : (
                <span
                  className="lyra-agents-time-copy"
                  onClick={onCiteMessage}
                  onKeyDown={(event) => activateButtonKey(event, onCiteMessage)}
                  role="button"
                  tabIndex={0}
                  aria-label={t("lyra-agents-message.citeMessage")}
                  title={t("lyra-agents-message.citeMessage")}
                >
                  <Link2 size={12} strokeWidth={2} />
                </span>
              )}
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}, agentMessagePropsAreEqual);
