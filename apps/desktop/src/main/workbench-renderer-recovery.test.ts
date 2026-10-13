import { describe, expect, test } from "vitest";

import {
  createRendererReloadLimiter,
  isIgnoredRendererGoneReason,
  shouldLinuxStartupRelaunch,
  WORKBENCH_RENDERER_CRASH_LOOP_MAX
} from "./workbench-renderer-recovery";

describe("workbench renderer recovery policy", () => {
  test("ignores a clean renderer exit", () => {
    expect(isIgnoredRendererGoneReason("clean-exit")).toBe(true);
    expect(isIgnoredRendererGoneReason("crashed")).toBe(false);
  });

  test("keeps linux first-paint relaunch only before load in packaged mode", () => {
    expect(
      shouldLinuxStartupRelaunch({
        didFinishLoad: false,
        isDevelopmentMode: false,
        linuxCompatEnabled: true,
        linuxRecoveryActive: false,
        reason: "crashed"
      })
    ).toBe(true);
    expect(
      shouldLinuxStartupRelaunch({
        didFinishLoad: true,
        isDevelopmentMode: false,
        linuxCompatEnabled: true,
        linuxRecoveryActive: false,
        reason: "crashed"
      })
    ).toBe(false);
    expect(
      shouldLinuxStartupRelaunch({
        didFinishLoad: false,
        isDevelopmentMode: true,
        linuxCompatEnabled: true,
        linuxRecoveryActive: false,
        reason: "crashed"
      })
    ).toBe(false);
  });

  test("stops reloading after a crash loop", () => {
    let now = 1_000;
    const limiter = createRendererReloadLimiter(() => now);
    for (let index = 0; index < WORKBENCH_RENDERER_CRASH_LOOP_MAX; index += 1) {
      expect(limiter.shouldReload()).toBe(true);
      now += 1;
    }
    expect(limiter.shouldReload()).toBe(false);
  });
});

import { vi } from "vitest";
import { createRendererRecoveryController } from "./workbench-renderer-recovery";
test("a crash loop requests recovery outside the dead renderer and honors reopen", async () => {
  vi.useFakeTimers();
  try {
    const reload = vi.fn(); const reopen = vi.fn(); const chooseRecovery = vi.fn(async () => "reopen" as const);
    const controller = createRendererRecoveryController({ isUnavailable: () => false, tryStartupRelaunch: () => false,
      reload, chooseRecovery, reopen, close: vi.fn(), report: vi.fn() });
    for (let index = 0; index < 3; index++) {
      controller.handle({ reason: "crashed", exitCode: 1 }); await vi.advanceTimersByTimeAsync(0);
    }
    controller.handle({ reason: "oom", exitCode: 2 }); await vi.runAllTimersAsync();
    expect(reload).toHaveBeenCalledTimes(3); expect(chooseRecovery).toHaveBeenCalledOnce(); expect(reopen).toHaveBeenCalledOnce();
    controller.dispose();
  } finally { vi.useRealTimers(); }
});

test("additional crashes do not stack recovery dialogs and close is an explicit choice", async () => {
  vi.useFakeTimers();
  try {
    let choose!: (choice: "reopen" | "close") => void;
    const close = vi.fn(); const reopen = vi.fn();
    const chooseRecovery = vi.fn(() => new Promise<"reopen" | "close">(resolve => { choose = resolve; }));
    const controller = createRendererRecoveryController({ isUnavailable: () => false, tryStartupRelaunch: () => false,
      reload: vi.fn(), chooseRecovery, reopen, close, report: vi.fn() });
    for (let index = 0; index < 5; index++) { controller.handle({ reason: "crashed", exitCode: 1 }); await vi.advanceTimersByTimeAsync(0); }
    expect(chooseRecovery).toHaveBeenCalledOnce(); choose("close"); await vi.runAllTimersAsync();
    expect(close).toHaveBeenCalledOnce(); expect(reopen).not.toHaveBeenCalled(); controller.dispose();
  } finally { vi.useRealTimers(); }
});
