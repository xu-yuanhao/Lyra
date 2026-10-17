import { cancelBrowserOperations } from "../workbench-browser/agent-operation-context";
import type { BrowserWindow } from "electron";

import { LYRA_CHANNELS } from "../../shared/desktop-bridge";
import type {
  AgentPokeResponse,
  AgentRuntimeEvent,
  AgentSessionSnapshot
} from "../../shared/agent";
import type {
  TerminalEvent,
  TerminalMemoryCorrelation
} from "../../shared/desktop-bridge";
import {
  createBackpressuredEventSender,
  estimateSerializedBytes
} from "../events/backpressure";
import type { LyraRuntimeClient } from "../runtime-client";
import { sendToWindow } from "../web-contents-ipc";
import type { WorkbenchBrowserIpcBridge } from "../workbench-browser/service";
import { isRecord } from "./host-payload";
import {
  clearAgentCursorThought,
  rememberAgentCursorThought
} from "../workbench-browser/agent-cursor-thought";

const AGENT_RUNTIME_EVENT_NAME = "agent.runtime";
const TERMINAL_RUNTIME_EVENT_NAME = "terminal.runtime";
// Keep every agent event behind one frame-sized queue. Sending deltas directly
// lets a fast native producer monopolize Electron IPC and starve renderer
// paints; the queue still preserves ordering while merging adjacent chunks.
const AGENT_EVENT_THROTTLE_MS = 16;
const AGENT_EVENT_MAX_QUEUE_SIZE = 512;

// Non-running sessionSnapshot events carry the runtime's whole in-memory
// session — every message, every full tool output — and are emitted at every
// permission/clarification/plan/memory boundary, so a permission-heavy run
// re-shipped the entire transcript per boundary. The transcript the renderer
// can serve comes from the windowed read path anyway (last 200 messages,
// 8KB output previews — sessions.rs read_session_window), so the publisher
// windows the payload to the same shape instead of reshipping O(session)
// deep copies. Reference shape: ZCode truncates its snapshot at the publisher
// (snapshotTailWindowRows); opencode ships no snapshot at all and lets the
// client refetch a window.
//
// Caps mirror sessions.rs and are byte-based with fixed counts, so the worst
// case is computable and fits the runtime client's 8MB frame cap by
// construction (200 × (16KiB text + ~1KiB blocks) + 200 × (8KiB preview)
// ≈ 5MiB). No runtime shrink-to-fit loop: none of the reference projects
// (codex/opencode/ZCode/pi/claw-code) adapts payload content to a budget —
// they bound per item and fail closed on the rare overflow.
const SESSION_SNAPSHOT_WINDOW_MESSAGES = 200;
const SESSION_SNAPSHOT_TOOL_OUTPUT_CAP_BYTES = 8 * 1024;
const SESSION_SNAPSHOT_MESSAGE_TEXT_CAP_BYTES = 16 * 1024;

const textEncoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: false });

// One UTF-16 code unit encodes to at most 3 UTF-8 bytes, so a cheap length
// check can prove "under the cap" without encoding; otherwise measure.
const exceedsUtf8Bytes = (value: string, maxBytes: number): boolean => {
  if (value.length <= Math.floor(maxBytes / 3)) {
    return false;
  }
  return textEncoder.encode(value).length > maxBytes;
};

const truncateUtf8Bytes = (value: string, maxBytes: number): string => {
  const bytes = textEncoder.encode(value).subarray(0, maxBytes);
  return `${utf8Decoder.decode(bytes)}…[truncated ${textEncoder.encode(value).length - bytes.length} bytes]`;
};

const capToolOutputContent = (
  tools: AgentSessionSnapshot["tools"]
): AgentSessionSnapshot["tools"] => {
  let changed = false;
  const capped = (tools ?? []).map((tool) => {
    const output = tool.output;
    if (!isRecord(output)) {
      return tool;
    }
    const content = output.content;
    if (typeof content !== "string" || !exceedsUtf8Bytes(content, SESSION_SNAPSHOT_TOOL_OUTPUT_CAP_BYTES)) {
      return tool;
    }
    changed = true;
    return {
      ...tool,
      output: {
        ...output,
        content: truncateUtf8Bytes(content, SESSION_SNAPSHOT_TOOL_OUTPUT_CAP_BYTES)
      }
    };
  });
  return changed ? capped : tools;
};

const capMessageText = (
  messages: AgentSessionSnapshot["messages"]
): AgentSessionSnapshot["messages"] => {
  let changed = false;
  const capped = (messages ?? []).map((message) => {
    const text = message.text;
    if (
      typeof text !== "string"
      || !exceedsUtf8Bytes(text, SESSION_SNAPSHOT_MESSAGE_TEXT_CAP_BYTES)
    ) {
      return message;
    }
    changed = true;
    return {
      ...message,
      text: truncateUtf8Bytes(text, SESSION_SNAPSHOT_MESSAGE_TEXT_CAP_BYTES)
    };
  });
  return changed ? capped : messages;
};

// Provider replay state (providerProtocol / providerTranscript /
// openaiResponsesReplay) is runtime-internal resume data: the runtime persists
// it in session state and protocol checkpoints, and no renderer code reads
// these keys. Drop it on the event path the same way the runtime's windowed
// read (sessions.rs read_session_window) does, so one turn's replay copy
// (transcript + protocol steps, including base64 captures) cannot ride into
// the renderer inside message metadata.
const RUNTIME_INTERNAL_METADATA_KEYS = new Set([
  "providerProtocol",
  "providerTranscript",
  "openaiResponsesReplay"
]);

const stripMessageMetadata = (
  messages: AgentSessionSnapshot["messages"]
): AgentSessionSnapshot["messages"] => {
  let changed = false;
  const stripped = (messages ?? []).map((message) => {
    const metadata = message.metadata;
    if (!isRecord(metadata)) {
      return message;
    }
    const entries = Object.entries(metadata).filter(
      ([key]) => !RUNTIME_INTERNAL_METADATA_KEYS.has(key)
    );
    if (entries.length === Object.keys(metadata).length) {
      return message;
    }
    changed = true;
    return { ...message, metadata: Object.fromEntries(entries) };
  });
  return changed ? stripped : messages;
};

export const windowSessionSnapshot = (snapshot: AgentSessionSnapshot): AgentSessionSnapshot => {
  const messages = Array.isArray(snapshot.messages) ? snapshot.messages : [];
  const tools = Array.isArray(snapshot.tools) ? snapshot.tools : [];
  const retainedMessages = messages.length > SESSION_SNAPSHOT_WINDOW_MESSAGES
    ? messages.slice(-SESSION_SNAPSHOT_WINDOW_MESSAGES)
    : messages;

  const referencedToolIds = new Set<string>();
  for (const message of retainedMessages) {
    for (const block of message.blocks ?? []) {
      if (block.type === "tool" && typeof block.toolId === "string") {
        referencedToolIds.add(block.toolId);
      }
    }
  }

  let toolsBounded = false;
  const retainedTools = tools.filter((tool) => {
    if (referencedToolIds.has(tool.id) || tool.status === "running") {
      return true;
    }
    // Background subagent updates can stay addressable before their tool
    // block is linked into a message; dropping them would hide live state.
    const raw = tool.output;
    return isRecord(raw) && raw.background === true;
  });
  if (retainedTools.length !== tools.length) {
    toolsBounded = true;
  }

  const cappedTools = capToolOutputContent(retainedTools);
  const strippedMessages = stripMessageMetadata(retainedMessages);
  const cappedMessages = capMessageText(strippedMessages);
  const messagesBounded = cappedMessages !== strippedMessages || strippedMessages !== retainedMessages;

  if (
    retainedMessages.length === messages.length
    && !toolsBounded
    && !messagesBounded
    && cappedTools === retainedTools
  ) {
    return snapshot;
  }
  return {
    ...snapshot,
    messages: cappedMessages,
    tools: cappedTools
  };
};

type RequestRuntime = <T>(method: string, payload?: object) => Promise<T>;

const readTerminalRuntimeCorrelationString = (
  event: TerminalEvent,
  key: keyof TerminalMemoryCorrelation
): string | undefined => {
  if (event.kind !== "commandCompleted") {
    return undefined;
  }
  const correlation = event.command.correlation;
  if (!isRecord(correlation)) {
    return undefined;
  }
  const value = correlation[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

export const agentRuntimeEventKey = (event: AgentRuntimeEvent): string | null => {
  if (event.kind === "sessionSnapshot") {
    return `sessionSnapshot:${event.snapshot.id}`;
  }
  if (event.kind === "messageDelta") {
    return [
      "messageDelta",
      event.sessionId,
      event.messageId,
      event.blockId ?? "",
      event.replace === true ? "replace" : "append"
    ].join(":");
  }
  if (event.kind === "messageReasoningDelta") {
    return [
      "messageReasoningDelta",
      event.sessionId,
      event.messageId,
      event.blockId ?? ""
    ].join(":");
  }
  // messageCommitted is emitted on placeholder creation and on every tool
  // start. Coalescing by sessionId:messageId collapses the intermediate
  // commits into the latest one — the final message object is what matters,
  // not the intermediate placeholders.
  if (event.kind === "messageCommitted") {
    return `messageCommitted:${event.sessionId}:${event.message.id}`;
  }
  if (event.kind === "toolUpdated") {
    return `toolUpdated:${event.sessionId}:${event.turnId}:${event.tool.id}`;
  }
  if (event.kind === "turnStateChanged") {
    return `turnStateChanged:${event.sessionId}:${event.turnId}`;
  }
  if (event.kind === "followStateChanged") {
    return `followStateChanged:${event.sessionId}`;
  }
  if (event.kind === "browserActivityChanged") {
    return `browserActivityChanged:${event.sessionId}:${event.turnId}`;
  }
  if (event.kind === "todoUpdated") {
    return `todoUpdated:${event.sessionId}`;
  }
  return null;
};

export const mergeAgentRuntimeEvent = (
  current: AgentRuntimeEvent,
  incoming: AgentRuntimeEvent
): AgentRuntimeEvent => {
  if (current.kind === "messageDelta" && incoming.kind === "messageDelta") {
    if (incoming.replace === true) {
      return incoming;
    }
    const firstEmittedAtMs =
      current.firstEmittedAtMs ?? current.emittedAtMs ?? incoming.firstEmittedAtMs ?? incoming.emittedAtMs;
    const emittedAtMs = incoming.emittedAtMs ?? current.emittedAtMs;
    return {
      ...current,
      delta: `${current.delta}${incoming.delta}`,
      ...(firstEmittedAtMs === undefined ? {} : { firstEmittedAtMs }),
      ...(emittedAtMs === undefined ? {} : { emittedAtMs }),
      sourceChunkCount: (current.sourceChunkCount ?? 1) + (incoming.sourceChunkCount ?? 1)
    };
  }
  if (
    current.kind === "messageReasoningDelta" &&
    incoming.kind === "messageReasoningDelta"
  ) {
    const firstEmittedAtMs =
      current.firstEmittedAtMs ?? current.emittedAtMs ?? incoming.firstEmittedAtMs ?? incoming.emittedAtMs;
    const emittedAtMs = incoming.emittedAtMs ?? current.emittedAtMs;
    return {
      ...current,
      delta: `${current.delta}${incoming.delta}`,
      ...(firstEmittedAtMs === undefined ? {} : { firstEmittedAtMs }),
      ...(emittedAtMs === undefined ? {} : { emittedAtMs }),
      sourceChunkCount: (current.sourceChunkCount ?? 1) + (incoming.sourceChunkCount ?? 1)
    };
  }
  return incoming;
};

export const createRuntimeEventForwarder = ({
  runtimeClient,
  requestRuntime,
  getWindow,
  getBrowserBridge
}: {
  readonly runtimeClient: LyraRuntimeClient;
  readonly requestRuntime: RequestRuntime;
  readonly getWindow: () => BrowserWindow | null;
  readonly getBrowserBridge: () => WorkbenchBrowserIpcBridge | null;
}): { readonly dispose: () => void } => {
  const sendToRenderer = (event: AgentRuntimeEvent): void => {
    sendToWindow(getWindow(), LYRA_CHANNELS.agentEvent, event);
  };

  const handleTerminalRuntimeEvent = (payload: unknown): void => {
    const event = payload as TerminalEvent;
    if (event.kind !== "commandCompleted") {
      return;
    }
    const agentSessionId = readTerminalRuntimeCorrelationString(event, "agentSessionId");
    if (agentSessionId === undefined) {
      return;
    }
    const runtimeTurnId = readTerminalRuntimeCorrelationString(event, "runtimeTurnId");
    const commandText = event.command.commandText;
    void requestRuntime<AgentPokeResponse>("agent.action.poke", {
      sessionId: agentSessionId,
      reason: "terminal_command_completed",
      terminal: {
        sessionId: event.sessionId,
        commandId: event.commandId,
        status: event.command.status,
        exitCode: event.command.exitCode ?? null,
        ...(typeof commandText === "string" && commandText.length > 0
          ? { commandText }
          : {}),
        ...(runtimeTurnId === undefined ? {} : { runtimeTurnId }),
        commandSummaryPath: event.command.commandSummaryPath,
        commandOutputTextPath: event.command.commandOutputTextPath
      }
    }).catch((error) => {
      console.warn("[lyra-agent] terminal command completion poke failed:", error);
    });
  };

  const eventSender = createBackpressuredEventSender<AgentRuntimeEvent>({
    name: "agent.event",
    intervalMs: AGENT_EVENT_THROTTLE_MS,
    maxQueueSize: AGENT_EVENT_MAX_QUEUE_SIZE,
    leading: false,
    keyFor: agentRuntimeEventKey,
    merge: mergeAgentRuntimeEvent,
    // Merge only adjacent chunks. This preserves the true order when a stream
    // switches between reasoning, visible text and tool events within a frame.
    coalesceMode: "consecutive",
    estimateBytes: estimateSerializedBytes,
    send: sendToRenderer,
    onError: (error) => {
      console.warn(`[lyra-agent] failed to send throttled event: ${String(error)}`);
    }
  });

  const unsubscribe = runtimeClient.subscribe((eventName, payload) => {
    if (eventName === TERMINAL_RUNTIME_EVENT_NAME) {
      handleTerminalRuntimeEvent(payload);
      return;
    }
    if (eventName !== AGENT_RUNTIME_EVENT_NAME) {
      return;
    }
    const event = payload as AgentRuntimeEvent;
    if (
      event.kind === "sessionSnapshot"
      && event.snapshot.turnStatus === "running"
    ) {
      // Live state is already projected by deltas and focused structural
      // events. Forwarding a full, growing snapshot for every mutation was the
      // dominant Rust -> Electron traffic source and retained duplicate trees.
      return;
    }
    const forwardEvent = event.kind === "sessionSnapshot"
      ? { ...event, snapshot: windowSessionSnapshot(event.snapshot) }
      : event;
    if (event.kind === "messageReasoningDelta") {
      rememberAgentCursorThought(event.blockId ?? "", event.delta);
    } else if (
      event.kind === "messageDelta"
      || event.kind === "messageCommitted"
      || event.kind === "toolStarted"
    ) {
      clearAgentCursorThought();
    }
    if (event.kind === "turnFinished" || event.kind === "turnFailed" || event.kind === "turnInterrupted") {
      cancelBrowserOperations(event.turnId);
      clearAgentCursorThought();
    }
    const browser = getBrowserBridge();
    if (browser !== null) {
      if (event.kind === "turnFinished") {
        browser.finishAgentFollowSessions({
          turnId: event.turnId,
          status: event.status === "cancelled" ? "cancelled" : "completed",
          reason: event.status
        });
      } else if (event.kind === "turnFailed") {
        browser.finishAgentFollowSessions({
          turnId: event.turnId,
          status: "failed",
          reason: event.message
        });
      } else if (event.kind === "turnInterrupted") {
        browser.finishAgentFollowSessions({
          turnId: event.turnId,
          status: "interrupted",
          reason: event.reason
        });
      }
    }
    eventSender.enqueue(forwardEvent);
  });

  return {
    dispose: () => {
      unsubscribe();
      eventSender.dispose();
    }
  };
};
