import { describe, expect, test } from "vitest";

import { composerModelTriggerLabel } from "../Composer";
import type { ModelOption } from "../../../core/types";

const modelOption = (overrides: Partial<ModelOption>): ModelOption => ({
  id: "test:model",
  label: "test/model",
  model: "model",
  available: true,
  enabled: true,
  ...overrides
});

describe("composerModelTriggerLabel", () => {
  test("strips a provider alias prefix from a bare-model label", () => {
    expect(
      composerModelTriggerLabel(modelOption({
        model: "beam-free",
        label: "opencode-zen-free/beam-free",
        providerId: "opencode-zen-free"
      }))
    ).toBe("beam-free");
  });

  test("strips the first segment of a provider-qualified model id", () => {
    expect(
      composerModelTriggerLabel(modelOption({
        model: "opencode-zen-free/beam-free",
        label: "opencode-zen-free/beam-free",
        providerId: "opencode"
      }))
    ).toBe("beam-free");
  });

  test("strips a workbuddy-style provider-qualified id", () => {
    expect(
      composerModelTriggerLabel(modelOption({
        model: "workbuddy/deepseek-v4-pro",
        label: "workbuddy/deepseek-v4-pro",
        providerId: "workbuddy"
      }))
    ).toBe("deepseek-v4-pro");
  });

  test("matches provider aliases case-insensitively", () => {
    expect(
      composerModelTriggerLabel(modelOption({
        model: "deepseek-v4-pro",
        label: "Workbuddy/deepseek-v4-pro",
        providerId: "WORKBUDDY"
      }))
    ).toBe("deepseek-v4-pro");
  });

  test("keeps a label equal to the bare model name", () => {
    expect(
      composerModelTriggerLabel(modelOption({
        model: "beam-free",
        label: "beam-free",
        providerId: "opencode-zen-free"
      }))
    ).toBe("beam-free");
  });

  test("keeps labels without a known provider prefix", () => {
    expect(
      composerModelTriggerLabel(modelOption({
        model: "gpt-4o",
        label: "GPT 4o/mini",
        providerId: "openai"
      }))
    ).toBe("GPT 4o/mini");
  });
});
