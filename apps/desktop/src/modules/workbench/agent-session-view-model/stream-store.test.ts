import { afterEach, describe, expect, it, vi } from "vitest";

import { STREAM_COMMIT_MS, StreamStore } from "./stream-store";

describe("StreamStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("timer-batches deltas delivered in one IPC flush", () => {
    vi.useFakeTimers();
    const store = new StreamStore();
    const subscriber = vi.fn();
    store.subscribe("message-1", subscriber);

    store.appendDelta("message-1", "text-1", "hel");
    store.appendDelta("message-1", "text-1", "lo");

    expect(subscriber).not.toHaveBeenCalled();
    vi.advanceTimersByTime(STREAM_COMMIT_MS);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(store.getBlockText("message-1", "text-1")).toBe("hello");
  });

  it("keeps tool-separated text blocks isolated", () => {
    const store = new StreamStore();
    store.appendDelta("message-1", "text-before-tool", "Before");
    store.appendDelta("message-1", "text-after-tool", "After");
    store.flush();

    expect(store.getBlockText("message-1", "text-before-tool")).toBe("Before");
    expect(store.getBlockText("message-1", "text-after-tool")).toBe("After");
    expect(store.getMessageText("message-1")).toBe("BeforeAfter");
  });

  it("reports only the first delta for each structural text block", () => {
    const store = new StreamStore();

    expect(store.appendDelta("message-1", null, "first")).toBe(true);
    expect(store.appendDelta("message-1", null, " second")).toBe(false);
    expect(store.appendDelta("message-1", "text-2", "after tool")).toBe(true);
    expect(store.appendDelta("message-1", "text-2", " continued")).toBe(false);
  });

  it("lets a synthetic pending UI block follow the newest native text block", () => {
    const store = new StreamStore();
    store.appendDelta("message-1", "text-2", "Live");
    store.flush();

    expect(store.getBlockText("message-1", null)).toBe("Live");

    store.appendDelta("message-1", "text-3", "After tool");
    store.flush();
    expect(store.getBlockText("message-1", null)).toBe("After tool");
  });

  it("merges only new chunks across successive delivery batches", () => {
    const store = new StreamStore();
    store.appendDelta("message-1", "text-1", "first");
    store.flush();
    store.appendDelta("message-1", "text-1", " second");
    store.flush();

    expect(store.getMessageText("message-1")).toBe("first second");
    expect(store.getBlockText("message-1", "text-1")).toBe("first second");
  });

  it("creates and replaces a block when the first event is a replacement", () => {
    const store = new StreamStore();
    store.appendDelta("message-1", "text-1", "stale");
    store.flush();
    store.appendDelta("message-1", "text-1", "fresh", true);
    store.flush();

    expect(store.getBlockText("message-1", "text-1")).toBe("fresh");
    expect(store.blockReplacesFallback("message-1", "text-1")).toBe(true);
    expect(store.getBlockReplacementRevision("message-1", "text-1")).toBe(1);
  });

  it("closes the reasoning channel on visible text without dropping reasoning", () => {
    vi.useFakeTimers();
    const store = new StreamStore();
    store.appendReasoningDelta("message-1", "think");
    vi.advanceTimersByTime(STREAM_COMMIT_MS);
    expect(store.isReasoningLive("message-1")).toBe(true);

    store.appendDelta("message-1", "text-1", "answer");
    vi.advanceTimersByTime(STREAM_COMMIT_MS);

    expect(store.isReasoningLive("message-1")).toBe(false);
    expect(store.getMessageReasoning("message-1")).toBe("think");
    expect(store.getBlockText("message-1", "text-1")).toBe("answer");
  });

  it("seals live reasoning on tool start and notifies subscribers", () => {
    vi.useFakeTimers();
    const store = new StreamStore();
    const subscriber = vi.fn();
    store.subscribe("message-1", subscriber);
    store.appendReasoningDelta("message-1", "think");
    vi.advanceTimersByTime(STREAM_COMMIT_MS);
    subscriber.mockClear();

    store.sealReasoning("message-1");

    expect(store.isReasoningLive("message-1")).toBe(false);
    expect(store.getMessageReasoning("message-1")).toBe("think");
    expect(subscriber).toHaveBeenCalledTimes(1);
  });
});

describe("authoritative message commits", () => {
  it("replaces a longer live stream and appends subsequent deltas to the new baseline", () => {
    const store = new StreamStore();
    store.appendDelta("reply", "text-0", "obsolete longer reply");
    store.flush();
    store.reconcileMessage({ id: "reply", role: "assistant", text: "final", createdAt: "now",
      blocks: [{ id: "text-0", type: "text", text: "final" }] });
    expect(store.getBlockText("reply", "text-0")).toBe("final");
    store.appendDelta("reply", "text-0", " continuation");
    store.flush();
    expect(store.getBlockText("reply", "text-0")).toBe("final continuation");
    store.clear();
  });
});
