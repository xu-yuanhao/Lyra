import { describe, expect, test } from "vitest";

import type { AgentRuntimeEvent, AgentSessionSnapshot, AgentToolActivity } from "../../../shared/agent";
import {
  agentRuntimeEventKey,
  mergeAgentRuntimeEvent,
  windowSessionSnapshot
} from "../runtime-event-forwarder";

const messageDelta = (
  delta: string,
  extra: Partial<Extract<AgentRuntimeEvent, { kind: "messageDelta" }>> = {}
): AgentRuntimeEvent => ({
  kind: "messageDelta",
  sessionId: "session-1",
  messageId: "message-1",
  blockId: "text-0",
  delta,
  ...extra
});

describe("mergeAgentRuntimeEvent", () => {
  test("concatenates streamed deltas", () => {
    const merged = mergeAgentRuntimeEvent(messageDelta("Hel"), messageDelta("lo"));
    expect(merged.kind).toBe("messageDelta");
    if (merged.kind === "messageDelta") {
      expect(merged.delta).toBe("Hello");
    }
  });

  test("coalesces reasoning chunks without losing native timing evidence", () => {
    const merged = mergeAgentRuntimeEvent(
      {
        kind: "messageReasoningDelta",
        sessionId: "session-1",
        messageId: "message-1",
        blockId: "thinking-0",
        delta: "think ",
        emittedAtMs: 100,
        sourceChunkCount: 1
      },
      {
        kind: "messageReasoningDelta",
        sessionId: "session-1",
        messageId: "message-1",
        blockId: "thinking-0",
        delta: "again",
        emittedAtMs: 108,
        sourceChunkCount: 1
      }
    );

    expect(merged).toMatchObject({
      kind: "messageReasoningDelta",
      delta: "think again",
      firstEmittedAtMs: 100,
      emittedAtMs: 108,
      sourceChunkCount: 2
    });
  });

  test("replace deltas override entirely", () => {
    const first = messageDelta("stale");
    const second = messageDelta("fresh", { replace: true });
    const merged = mergeAgentRuntimeEvent(first, second);
    expect(merged.kind).toBe("messageDelta");
    if (merged.kind === "messageDelta") {
      expect(merged.delta).toBe("fresh");
    }
  });

  test("uses one latest-wins key for a session snapshot", () => {
    const event = {
      kind: "sessionSnapshot",
      snapshot: { id: "session-1" }
    } as AgentRuntimeEvent;

    expect(agentRuntimeEventKey(event)).toBe("sessionSnapshot:session-1");
  });
});

const snapshotWith = (overrides: Partial<AgentSessionSnapshot>): AgentSessionSnapshot => ({
  id: "session-1",
  title: "Session",
  sessionKind: "normal",
  workingDir: "/tmp",
  projectBound: false,
  messages: [],
  tools: [],
  todos: [],
  turnStatus: "idle",
  activeTurnId: null,
  follow: { running: false, activity: null },
  updatedAt: "2026-06-05T00:00:00.000Z",
  revision: "1",
  ...overrides
} as AgentSessionSnapshot);

describe("windowSessionSnapshot", () => {
  const toolWithContent = (id: string, content: string, status: AgentToolActivity["status"] = "completed") => ({
    id,
    name: "exec_command",
    label: "Run command",
    status,
    input: {},
    startedAt: "2026-06-05T00:00:01.000Z",
    output: { content }
  });

  const toolMessage = (toolId: string) => ({
    id: "message-1",
    role: "assistant" as const,
    text: "",
    createdAt: "2026-06-05T00:00:01.000Z",
    blocks: [{ type: "tool" as const, id: `tool-${toolId}`, toolId }]
  });

  test("truncates the message tail to the windowed read shape", () => {
    const messages = Array.from({ length: 600 }, (_, index) => ({
      id: `message-${index}`,
      role: "user" as const,
      text: String(index),
      createdAt: "2026-06-05T00:00:01.000Z"
    }));
    const snapshot = windowSessionSnapshot(snapshotWith({ messages }));

    expect(snapshot.messages).toHaveLength(200);
    expect(snapshot.messages[0]?.id).toBe("message-400");
  });

  test("keeps tools referenced by retained messages, running tools, and background subagent updates", () => {
    const messages = [toolMessage("tool-1")];
    const snapshot = windowSessionSnapshot(snapshotWith({
      messages,
      tools: [
        toolWithContent("tool-1", "referenced"),
        toolWithContent("tool-2", "outside the window"),
        toolWithContent("tool-3", "still running", "running"),
        {
          id: "tool-4",
          name: "Agent",
          label: "Agent",
          status: "running",
          input: {},
          startedAt: "2026-06-05T00:00:01.000Z",
          output: { raw: { background: true, subagentId: "subagent-1" } }
        }
      ]
    }));

    expect(snapshot.tools.map((tool) => tool.id)).toEqual(["tool-1", "tool-3", "tool-4"]);
  });

  test("caps oversized tool output content at the windowed read preview cap", () => {
    const big = "x".repeat(20_000);
    const snapshot = windowSessionSnapshot(snapshotWith({
      messages: [toolMessage("tool-1")],
      tools: [toolWithContent("tool-1", big)]
    }));

    const output = snapshot.tools[0]?.output as { content: string };
    expect(output.content.length).toBeLessThan(20_000);
    expect(output.content).toContain("…[truncated");
  });

  test("caps CJK message text by bytes, not characters", () => {
    // "汉" is 3 bytes in UTF-8: a char-based cap would let CJK text triple
    // its wire cost — exactly how a 7.9MB snapshot reached the wire guard.
    const messages = Array.from({ length: 300 }, (_, index) => ({
      id: `message-${index}`,
      role: "user" as const,
      text: "汉".repeat(20_000),
      createdAt: "2026-06-05T00:00:01.000Z"
    }));
    const snapshot = windowSessionSnapshot(snapshotWith({ messages }));

    const last = snapshot.messages?.at(-1) as { text: string };
    expect(Buffer.byteLength(last.text, "utf8")).toBeLessThanOrEqual(16 * 1024 + 80);
    expect(last.text).toContain("…[truncated");
  });

  test("returns the snapshot untouched when it is already bounded", () => {
    const snapshot = snapshotWith({});
    expect(windowSessionSnapshot(snapshot)).toBe(snapshot);
  });

  test("drops runtime-internal replay metadata from messages", () => {
    // providerProtocol/providerTranscript/openaiResponsesReplay are resume
    // state the runtime keeps in session state; a single turn's copy (with a
    // base64 capture) made one message's metadata 1.6MB and blew past the
    // read-window frame cap. No renderer code reads these keys.
    const snapshot = windowSessionSnapshot(snapshotWith({
      messages: [{
        id: "message-1",
        role: "assistant",
        text: "done",
        createdAt: "2026-06-05T00:00:01.000Z",
        metadata: {
          providerProtocol: { version: 2 },
          providerTranscript: [{ role: "tool", content: "x".repeat(1_000_000) }],
          openaiResponsesReplay: [{ type: "reasoning" }],
          transcriptCitations: [{ id: "cite-1" }]
        }
      }]
    }));

    const metadata = (snapshot.messages?.[0] as { metadata?: Record<string, unknown> }).metadata;
    expect(metadata).toEqual({ transcriptCitations: [{ id: "cite-1" }] });
  });

  test("stays inside the frame budget by construction at full windows", () => {
    // Regression (two layers): (1) an oversized snapshot destroyed the whole
    // runtime connection; (2) the shrink-to-fit loop that replaced it
    // silently exited when its first step was a no-op and shipped 7.9MB
    // anyway. Reference projects bound per item with fixed caps instead.
    const messages = Array.from({ length: 500 }, (_, index) => ({
      id: `message-${index}`,
      role: "user" as const,
      text: "汉".repeat(20_000),
      createdAt: "2026-06-05T00:00:01.000Z",
      blocks: [{ type: "tool" as const, id: `block-${index}`, toolId: `tool-${index}` }]
    }));
    const tools = Array.from({ length: 500 }, (_, index) =>
      toolWithContent(`tool-${index}`, "o".repeat(30_000))
    );
    const snapshot = windowSessionSnapshot(snapshotWith({ messages, tools }));

    expect(snapshot.messages).toHaveLength(200);
    expect(snapshot.messages?.at(-1)?.id).toBe("message-499");
    expect(Buffer.byteLength(JSON.stringify(snapshot), "utf8")).toBeLessThanOrEqual(6 * 1024 * 1024);
  });
});
