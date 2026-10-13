import { afterEach, expect, test, vi } from "vitest";
import { createBoundedShutdown } from "./bounded-shutdown";
afterEach(() => vi.useRealTimers());
test("queued state is flushed before disposal and exit, even for repeated quit events", async () => {
  const order: string[] = []; let finish!: () => void;
  const shutdown = createBoundedShutdown({ flush: () => new Promise<void>(resolve => { finish = resolve; order.push("flush"); }),
    dispose: () => order.push("dispose"), exit: () => order.push("exit"), reportFailure: vi.fn() });
  const first = shutdown.run(); const second = shutdown.run();
  await Promise.resolve(); expect(order).toEqual(["flush"]); expect(first).toBe(second);
  finish(); await first; expect(order).toEqual(["flush", "dispose", "exit"]);
});
test("a hung flush has a deadline and cannot trap quit", async () => {
  vi.useFakeTimers(); const exit = vi.fn(); const reportFailure = vi.fn();
  const shutdown = createBoundedShutdown({ flush: () => new Promise(() => {}), dispose: vi.fn(), exit, reportFailure, timeoutMs: 5000 });
  const pending = shutdown.run(); await vi.advanceTimersByTimeAsync(5000); await pending;
  expect(exit).toHaveBeenCalledOnce(); expect(reportFailure).toHaveBeenCalledOnce();
});
test("failed writes still dispose and exit instead of becoming an unhandled rejection", async () => {
  const exit = vi.fn(); const reportFailure = vi.fn();
  await createBoundedShutdown({ flush: async () => { throw new Error("disk failed"); }, dispose: vi.fn(), exit, reportFailure }).run();
  expect(reportFailure).toHaveBeenCalledOnce(); expect(exit).toHaveBeenCalledOnce();
});
