import { describe, expect, test } from "vitest";

import { ensureElevationSecretInjected } from "../elevation-restore";

const adminRef = {
  kind: "lyra-sensitive-value-ref",
  id: "system:opaque:credential-1",
  owner: "system",
  ownerRef: { kind: "opaque", owner: "sensitive-values", valueId: "credential-1" },
  valueKind: "credential",
  label: "Lyra Agent administrator credential",
  displayHint: "••••••••",
  ownership: "user_owned",
  modelVisibility: "metadata_only",
  plaintextVisibility: "user_reveal_only",
  capabilities: ["list_metadata", "use", "reveal_to_user"]
};

const createDeps = ({
  policy = { effectiveMode: "autonomous", elevationCredentialRef: adminRef },
  status = { available: false },
  revealed = { value: "hunter2" },
  policyError
}: {
  policy?: { effectiveMode?: string; elevationCredentialRef?: unknown };
  status?: { readonly available: boolean };
  revealed?: { readonly value: string };
  policyError?: Error;
} = {}) => {
  const calls: string[] = [];
  const requestRuntime = async <T,>(method: string, payload?: object): Promise<T> => {
    calls.push([method, JSON.stringify(payload ?? {})].join(" "));
    if (policyError !== undefined && method === "agent.permissionPolicy.read") {
      throw policyError;
    }
    if (method === "agent.permissionPolicy.read") return policy as T;
    if (method === "agent.elevation.status") return status as T;
    if (method === "agent.elevation.setSecret") return { stored: true } as T;
    throw new Error(`unexpected method: ${method}`);
  };
  const warnings: string[] = [];
  const revealSensitiveValue = async (ref: unknown) => {
    calls.push(`reveal:${JSON.stringify(ref)}`);
    return revealed;
  };
  return {
    calls,
    warnings,
    requestRuntime,
    revealSensitiveValue,
    warn: (message: string) => {
      warnings.push(message);
    }
  };
};

describe("ensureElevationSecretInjected", () => {
  test("reveals the stored credential and injects the secret when unavailable", async () => {
    const deps = createDeps();
    const outcome = await ensureElevationSecretInjected(deps);

    expect(outcome).toBe("injected");
    expect(deps.calls.some((call) => call.startsWith("reveal:"))).toBe(true);
    expect(deps.calls).toContainEqual(
      expect.stringContaining('agent.elevation.setSecret {"secret":"hunter2"}')
    );
    expect(deps.warnings).toEqual([]);
  });

  test("does not reveal when the secret is already available", async () => {
    const deps = createDeps({ status: { available: true } });
    const outcome = await ensureElevationSecretInjected(deps);

    expect(outcome).toBe("already_available");
    expect(deps.calls.some((call) => call.startsWith("reveal:"))).toBe(false);
  });

  test("skips entirely outside elevated modes", async () => {
    const deps = createDeps({ policy: { effectiveMode: "approval", elevationCredentialRef: adminRef } });
    const outcome = await ensureElevationSecretInjected(deps);

    expect(outcome).toBe("not_applicable");
    expect(deps.calls).toEqual(["agent.permissionPolicy.read {}"]);
  });

  test("warns with a named message instead of throwing when the unlock fails", async () => {
    const deps = createDeps({ policyError: new Error("safeStorage decrypt failed") });
    const outcome = await ensureElevationSecretInjected(deps);

    expect(outcome).toBe("failed");
    expect(deps.warnings[0]).toContain("elevation restore failed");
    expect(deps.warnings[0]).toContain("safeStorage decrypt failed");
  });
});
