export const WORKBENCH_RENDERER_CRASH_LOOP_WINDOW_MS = 15_000;
export const WORKBENCH_RENDERER_CRASH_LOOP_MAX = 3;

const LINUX_STARTUP_FAILURE_REASONS = new Set([
  "crashed",
  "oom",
  "launch-failed",
  "integrity-failure"
]);

export const isIgnoredRendererGoneReason = (reason: string): boolean =>
  reason === "clean-exit";

export const isLinuxRendererStartupFailureReason = (reason: string): boolean =>
  LINUX_STARTUP_FAILURE_REASONS.has(reason);

export const shouldLinuxStartupRelaunch = (input: {
  readonly didFinishLoad: boolean;
  readonly isDevelopmentMode: boolean;
  readonly linuxCompatEnabled: boolean;
  readonly linuxRecoveryActive: boolean;
  readonly reason: string;
}): boolean =>
  input.didFinishLoad === false
  && input.isDevelopmentMode === false
  && input.linuxCompatEnabled
  && input.linuxRecoveryActive === false
  && isLinuxRendererStartupFailureReason(input.reason);

export const createRendererReloadLimiter = (
  now: () => number = Date.now
): { readonly shouldReload: () => boolean } => {
  const crashAtMs: number[] = [];
  return {
    shouldReload: () => {
      const current = now();
      while (
        crashAtMs.length > 0
        && current - crashAtMs[0]! >= WORKBENCH_RENDERER_CRASH_LOOP_WINDOW_MS
      ) {
        crashAtMs.shift();
      }
      crashAtMs.push(current);
      return crashAtMs.length <= WORKBENCH_RENDERER_CRASH_LOOP_MAX;
    }
  };
};

export const createRendererRecoveryController = (host: {
  readonly isUnavailable: () => boolean;
  readonly tryStartupRelaunch: (details: { reason: string; exitCode: number }) => boolean;
  readonly reload: () => void;
  readonly chooseRecovery: () => Promise<"reopen" | "close">;
  readonly reopen: () => void;
  readonly close: () => void;
  readonly report: (message: string) => void;
}) => {
  const limiter = createRendererReloadLimiter();
  let disposed = false;
  let dialogOpen = false;
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const unavailable = () => disposed || host.isUnavailable();
  return {
    handle: (details: { reason: string; exitCode: number }): void => {
      if (unavailable() || isIgnoredRendererGoneReason(details.reason) || dialogOpen) return;
      if (host.tryStartupRelaunch(details)) return;
      if (limiter.shouldReload()) {
        if (reloadTimer !== undefined) clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
          reloadTimer = undefined;
          if (!unavailable()) host.reload();
        }, 0);
        return;
      }
      if (reloadTimer !== undefined) clearTimeout(reloadTimer);
      reloadTimer = undefined;
      dialogOpen = true;
      host.report(`Renderer crash loop: ${details.reason} (${details.exitCode})`);
      void host.chooseRecovery().then((choice) => {
        if (unavailable()) return;
        if (choice === "reopen") host.reopen();
        else host.close();
      }).catch((error: unknown) => {
        host.report(`Renderer recovery dialog failed: ${String(error)}`);
        if (!unavailable()) host.reopen();
      }).finally(() => { dialogOpen = false; });
    },
    dispose: (): void => {
      disposed = true;
      if (reloadTimer !== undefined) clearTimeout(reloadTimer);
    }
  };
};
