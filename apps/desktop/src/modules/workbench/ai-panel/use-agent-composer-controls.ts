import { useMemo } from "react";

import type {
  AgentModelCatalogSnapshot,
  AgentPermissionPolicySnapshot
} from "../../../shared/agent";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import { agentModelsToModelOptions } from "../agent-session-view-model";
import type {
  ComposerModelControls,
  ComposerPermissionModeControls
} from "./lyra-agents/core/types";

export const useAgentComposerControls = ({
  desktopApi,
  modelState,
  modelBusy,
  permissionPolicy,
  permissionPolicyBusy,
  switchModel,
  refreshModels,
  openModelSettings,
  updateReasoningEffort,
  updateVerbosity,
  updateServiceTier,
  switchPermissionMode
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly modelState: AgentModelCatalogSnapshot | null;
  readonly modelBusy: "refresh" | "switch" | null;
  readonly permissionPolicy: AgentPermissionPolicySnapshot | null;
  readonly permissionPolicyBusy: boolean;
  readonly switchModel: ComposerModelControls["switchModel"];
  readonly refreshModels: ComposerModelControls["refreshModels"];
  readonly openModelSettings: ComposerModelControls["openModelSettings"];
  readonly updateReasoningEffort: ComposerModelControls["updateReasoningEffort"];
  readonly updateVerbosity: ComposerModelControls["updateVerbosity"];
  readonly updateServiceTier: ComposerModelControls["updateServiceTier"];
  readonly switchPermissionMode: ComposerPermissionModeControls["switchMode"];
}): {
  readonly modelControls: ComposerModelControls | null;
  readonly permissionModeControls: ComposerPermissionModeControls | null;
} => {
  const modelControls = useMemo<ComposerModelControls | null>(() => {
    if (modelState === null) return null;
    return {
      currentModel: modelState.currentModel,
      currentProvider: modelState.currentProvider,
      models: agentModelsToModelOptions(modelState),
      reasoningEffort: {
        current: modelState.reasoningEffort.current ?? null,
        options: [...modelState.reasoningEffort.options],
        supported: modelState.reasoningEffort.supported
      },
      verbosity: {
        current: modelState.verbosity.current ?? null,
        options: [...modelState.verbosity.options],
        supported: modelState.verbosity.supported
      },
      serviceTier: {
        current: modelState.serviceTier.current ?? null,
        options: [...modelState.serviceTier.options],
        supported: modelState.serviceTier.supported
      },
      isRefreshing: modelBusy === "refresh",
      isSwitching: modelBusy === "switch",
      switchModel,
      refreshModels,
      openModelSettings,
      updateReasoningEffort,
      updateVerbosity,
      updateServiceTier
    };
  }, [
    modelBusy,
    modelState,
    openModelSettings,
    refreshModels,
    switchModel,
    updateReasoningEffort,
    updateServiceTier,
    updateVerbosity
  ]);

  const permissionModeControls = useMemo<ComposerPermissionModeControls | null>(() => {
    if (desktopApi?.agent === undefined) return null;
    return {
      currentMode: permissionPolicy?.mode ?? "approval",
      isSwitching: permissionPolicyBusy,
      warning: permissionPolicy?.warning ?? null,
      configPath: permissionPolicy?.configPath ?? null,
      switchMode: switchPermissionMode
    };
  }, [
    desktopApi,
    permissionPolicy,
    permissionPolicyBusy,
    switchPermissionMode
  ]);

  return {
    modelControls,
    permissionModeControls
  };
};
