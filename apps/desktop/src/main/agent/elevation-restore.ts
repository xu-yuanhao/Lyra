import { isLyraSensitiveValueRef } from "../../shared/sensitive-value";

// The elevation secret lives in the runtime process's memory and is lost on
// every runtime restart by design. The previous restore was a fire-once React
// mount effect that swallowed failures silently — when it lost the race the
// agent hit "sudo: a password is required" and improvised its own plumbing
// from the sensitive-values catalog (10 source-reading calls in
// session-fbdca3f1). Re-injection now runs in the main process at every turn
// start: named failures, no user interaction needed (the stored credential
// resolves host-side), and the model-visible pending_unlock context block
// covers the residual window.
export type ElevationRestoreOutcome =
  | "injected"
  | "already_available"
  | "not_applicable"
  | "failed";

export type RevealSensitiveValue = (ref: unknown) => Promise<{ readonly value: string }>;

export const ensureElevationSecretInjected = async ({
  requestRuntime,
  revealSensitiveValue,
  warn = (message: string): void => {
    console.warn(message);
  }
}: {
  readonly requestRuntime: <T>(method: string, payload?: object) => Promise<T>;
  readonly revealSensitiveValue: RevealSensitiveValue;
  readonly warn?: (message: string) => void;
}): Promise<ElevationRestoreOutcome> => {
  try {
    const policy = await requestRuntime<{
      readonly effectiveMode?: string;
      readonly elevationCredentialRef?: unknown;
    }>("agent.permissionPolicy.read");
    const elevated =
      policy.effectiveMode === "full_auto" || policy.effectiveMode === "autonomous";
    if (!elevated || !isLyraSensitiveValueRef(policy.elevationCredentialRef)) {
      return "not_applicable";
    }
    const status = await requestRuntime<{ readonly available: boolean }>(
      "agent.elevation.status"
    );
    if (status.available === true) {
      return "already_available";
    }
    const revealed = await revealSensitiveValue(policy.elevationCredentialRef);
    if (revealed.value.length === 0) {
      warn("[lyra-agent] elevation restore failed: stored credential decrypted to an empty value");
      return "failed";
    }
    await requestRuntime("agent.elevation.setSecret", { secret: revealed.value });
    return "injected";
  } catch (error) {
    warn(
      "[lyra-agent] elevation restore failed: "
      + (error instanceof Error ? error.message : String(error))
      + " — sudo commands will fail until the unlock succeeds"
    );
    return "failed";
  }
};
