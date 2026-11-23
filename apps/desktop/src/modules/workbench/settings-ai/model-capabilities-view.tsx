import {
  APP_STATUS_MESSAGE_BOXED_CLASS,
  AppButton,
  AppInput,
  AppSelect,
  AppSettingsRow,
  AppSettingsSection,
  AppStatusMessage,
  AppSubPageBack,
} from "@renderer/ui/components";
import type {
  AgentCapabilityOverride,
  AgentModelCapabilityKey,
  AgentModelEntry,
  AgentReasoningReplayField,
} from "../../../shared/desktop-bridge";
import type { SettingsAiLabels, SettingsAiModel } from "./types";

export type { SettingsAiLabels, SettingsAiModel } from "./types";
import {
  AI_ERROR_CLASS,
  AI_INPUT_CLASS,
  AI_SELECT_CLASS,
  AI_ACCOUNT_AVATAR_CLASS,
  AI_DISCOVERED_MODELS_CLASS,
  AI_DISCOVERED_TOOLBAR_CLASS,
  AI_MODEL_ACTIONS_CLASS,
  AI_MODEL_FLOW_CLASS,
  AI_MODEL_LIST_ROWS_CLASS,
  AI_MODEL_LIST_SURFACE_CLASS,
  AI_MODEL_OPTION_CLASS,
  AI_MODEL_OPTION_CURRENT_CLASS,
  AI_MODEL_OPTION_STATIC_CLASS,
  AI_PROVIDER_SEARCH_RESULTS_CLASS,
  AI_PROVIDER_SEARCH_STEP_CLASS,
  AI_PROVIDER_TAB_ACTIVE_CLASS,
  AI_PROVIDER_TAB_CLASS,
  AI_ROW_ACTION_CLASS,
  AI_ROW_DELETE_CLASS,
  AI_VIEW_ALL_MODELS_CLASS,
} from "./classes";

export type SettingsAiRenderedModelEntry = Pick<
  AgentModelEntry,
  | "available"
  | "detail"
  | "id"
  | "label"
  | "model"
  | "provider"
  | "providerId"
  | "providerKey"
  | "providerLabel"
  | "accountEmail"
  | "accountName"
  | "accountAvatarUrl"
  | "routeId"
  | "protocolId"
  | "protocolFamily"
  | "enabled"
  | "capabilities"
  | "contextWindow"
  | "reasoningReplayField"
  | "requiresReasoningFieldOnAssistantMessages"
>;

export const uniqueModelIds = (...groups: readonly string[][]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const group of groups) {
    for (const id of group) {
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result;
};

const formatLabel = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );

const MODEL_CAPABILITY_GROUPS: readonly {
  readonly titleKey: keyof SettingsAiLabels;
  readonly entries: readonly {
    readonly key: AgentModelCapabilityKey;
    readonly labelKey: keyof SettingsAiLabels;
  }[];
}[] = [
  {
    titleKey: "capabilityGroupAgent",
    entries: [
      { key: "feature.toolCalling", labelKey: "capabilityFeatureToolCalling" },
      { key: "feature.toolChoice", labelKey: "capabilityFeatureToolChoice" },
      { key: "feature.streaming", labelKey: "capabilityFeatureStreaming" },
      { key: "feature.structuredOutput", labelKey: "capabilityFeatureStructuredOutput" },
      { key: "feature.reasoning", labelKey: "capabilityFeatureReasoning" },
      { key: "feature.reasoningEffort", labelKey: "capabilityFeatureReasoningEffort" },
      { key: "feature.temperature", labelKey: "capabilityFeatureTemperature" },
    ],
  },
  {
    titleKey: "capabilityGroupInput",
    entries: [
      { key: "input.text", labelKey: "capabilityInputText" },
      { key: "input.image", labelKey: "capabilityInputImage" },
      { key: "input.audio", labelKey: "capabilityInputAudio" },
      { key: "input.video", labelKey: "capabilityInputVideo" },
      { key: "input.pdf", labelKey: "capabilityInputPdf" },
    ],
  },
  {
    titleKey: "capabilityGroupOutput",
    entries: [
      { key: "output.text", labelKey: "capabilityOutputText" },
      { key: "output.image", labelKey: "capabilityOutputImage" },
      { key: "output.audio", labelKey: "capabilityOutputAudio" },
      { key: "output.video", labelKey: "capabilityOutputVideo" },
    ],
  },
  {
    titleKey: "capabilityGroupOperations",
    entries: [
      { key: "operation.language", labelKey: "capabilityOperationLanguage" },
      { key: "operation.imageGeneration", labelKey: "capabilityOperationImageGeneration" },
      { key: "operation.speechGeneration", labelKey: "capabilityOperationSpeechGeneration" },
      { key: "operation.transcription", labelKey: "capabilityOperationTranscription" },
      { key: "operation.videoGeneration", labelKey: "capabilityOperationVideoGeneration" },
    ],
  },
];

const CAPABILITY_OVERRIDE_OPTIONS: readonly {
  readonly labelKey: keyof SettingsAiLabels;
  readonly value: AgentCapabilityOverride;
}[] = [
  { labelKey: "overrideAuto", value: "auto" },
  { labelKey: "overrideSupported", value: "supported" },
  { labelKey: "overrideUnsupported", value: "unsupported" },
];

const REASONING_REPLAY_OPTIONS: readonly {
  readonly labelKey?: keyof SettingsAiLabels;
  readonly label?: string;
  readonly value: AgentReasoningReplayField;
}[] = [
  { labelKey: "overrideAuto", value: "auto" },
  { labelKey: "replayNone", value: "none" },
  { label: "reasoning", value: "reasoning" },
  { label: "reasoning_content", value: "reasoning_content" },
  { label: "reasoning_details", value: "reasoning_details" },
];

type AssistantReasoningRequirement = "auto" | "required" | "notRequired";
const ASSISTANT_REASONING_REQUIREMENT_OPTIONS: readonly {
  readonly labelKey: keyof SettingsAiLabels;
  readonly value: AssistantReasoningRequirement;
}[] = [
  { labelKey: "requirementAuto", value: "auto" },
  { labelKey: "requirementRequired", value: "required" },
  { labelKey: "requirementNotRequired", value: "notRequired" },
];

const localizeOptions = <T,>(
  options: readonly {
    readonly labelKey?: keyof SettingsAiLabels;
    readonly label?: string;
    readonly value: T;
  }[],
  labels: SettingsAiLabels
): { readonly label: string; readonly value: T }[] =>
  options.map((option) => ({
    value: option.value,
    label: option.labelKey === undefined
      ? option.label ?? String(option.value)
      : labels[option.labelKey],
  }));

type SettingsAiModelCapabilitiesViewProps = {
  readonly entry: SettingsAiRenderedModelEntry;
  readonly labels: SettingsAiLabels;
  readonly model: Pick<SettingsAiModel, "updateAgentModelCapabilities">;
  readonly onBack: () => void;
  readonly provider: string;
};

export const SettingsAiModelCapabilitiesView = ({
  entry,
  labels,
  model,
  onBack,
  provider,
}: SettingsAiModelCapabilitiesViewProps) => {
  const update = (
    values: Omit<
      Parameters<NonNullable<SettingsAiModel["updateAgentModelCapabilities"]>>[0],
      "provider" | "model"
    >
  ): void => {
    if (provider.length === 0) return;
    void model.updateAgentModelCapabilities?.({
      provider,
      model: entry.model,
      ...values,
    });
  };

  return (
    <div className={`${AI_MODEL_FLOW_CLASS} lyra-settings-ai-models-surface SETTINGS_PROVIDER_DRILL_IN_CLASS`}>
      <AppSubPageBack
        label={entry.providerLabel ?? entry.providerKey ?? labels.modelsTitle}
        onClick={onBack}
      />
      {entry.capabilities?.runtimeConflict == null ? null : (
        <AppStatusMessage className={`${AI_ERROR_CLASS} ${APP_STATUS_MESSAGE_BOXED_CLASS}`} tone="error" role="alert">
          {entry.capabilities.runtimeConflict}
        </AppStatusMessage>
      )}
      <AppSettingsSection label={labels.modelDetailsSection}>
        <AppSettingsRow title={labels.modelIdTitle} description={entry.model} />
        <AppSettingsRow
          title={labels.contextWindowTitle}
          description={labels.contextWindowDescription}
          control={(
            <AppInput
              key={`${entry.id}:${entry.capabilities?.contextWindowOverride ?? "auto"}`}
              className={AI_INPUT_CLASS}
              type="number"
              min={1}
              defaultValue={entry.capabilities?.contextWindowOverride ?? ""}
              placeholder={entry.contextWindow?.toString() ?? labels.contextWindowAuto}
              aria-label={labels.contextWindowTitle}
              onBlur={(event) => {
                const parsed = Number.parseInt(event.currentTarget.value, 10);
                update({ contextWindowOverride: Number.isFinite(parsed) && parsed > 0 ? parsed : null });
              }}
            />
          )}
        />
      </AppSettingsSection>
      <AppSettingsSection label={labels.advancedProtocolSection}>
        <AppSettingsRow
          title={labels.reasoningReplayFieldTitle}
          description={formatLabel(labels.capabilityDetected, {
            value: entry.reasoningReplayField ?? "auto",
          })}
          control={(
            <AppSelect<AgentReasoningReplayField>
              ariaLabel={labels.reasoningReplayFieldAriaLabel}
              className={AI_SELECT_CLASS}
              value={entry.capabilities?.reasoningReplayFieldOverride ?? "auto"}
              options={localizeOptions(REASONING_REPLAY_OPTIONS, labels)}
              onValueChange={(value) => {
                update({ reasoningReplayFieldOverride: value === "auto" ? null : value });
              }}
            />
          )}
        />
        <AppSettingsRow
          title={labels.assistantReasoningFieldTitle}
          description={formatLabel(labels.assistantReasoningDetected, {
            value: entry.requiresReasoningFieldOnAssistantMessages == null
              ? "unknown"
              : entry.requiresReasoningFieldOnAssistantMessages
                ? "required"
                : "not required",
          })}
          control={(
            <AppSelect<AssistantReasoningRequirement>
              ariaLabel={labels.assistantReasoningFieldAriaLabel}
              className={AI_SELECT_CLASS}
              value={entry.capabilities?.assistantReasoningFieldRequiredOverride == null
                ? "auto"
                : entry.capabilities.assistantReasoningFieldRequiredOverride
                  ? "required"
                  : "notRequired"}
              options={localizeOptions(ASSISTANT_REASONING_REQUIREMENT_OPTIONS, labels)}
              onValueChange={(value) => {
                update({
                  assistantReasoningFieldRequiredOverride: value === "auto"
                    ? null
                    : value === "required",
                });
              }}
            />
          )}
        />
      </AppSettingsSection>
      {MODEL_CAPABILITY_GROUPS.map((group) => (
        <AppSettingsSection key={group.titleKey} label={labels[group.titleKey]}>
          {group.entries.map(({ key, labelKey }) => {
            const detected = entry.capabilities?.detected?.[key] ?? "unknown";
            const override = entry.capabilities?.overrides?.[key] ?? "auto";
            const effective = entry.capabilities?.effective?.[key] === true;
            const evidence = entry.capabilities?.evidence?.[key];
            const defaultOperation = key === "operation.imageGeneration"
              ? "imageGeneration"
              : key === "operation.speechGeneration"
                ? "speechGeneration"
                : key === "operation.transcription"
                  ? "transcription"
                  : key === "operation.videoGeneration"
                    ? "videoGeneration"
                    : null;
            return (
              <AppSettingsRow
                key={key}
                title={labels[labelKey]}
                description={[
                  formatLabel(labels.capabilityDetected, { value: detected }),
                  effective ? labels.capabilityExecutableYes : labels.capabilityExecutableNo,
                  evidence?.source === undefined
                    ? null
                    : formatLabel(labels.capabilitySource, { value: evidence.source }),
                  evidence?.conflict === true ? labels.capabilityConflictingEvidence : null,
                  evidence?.sourceUrl ?? null,
                  evidence?.observedAt ?? null,
                  evidence?.detail ?? null,
                ].filter((value): value is string => value !== null).join(" · ")}
                control={(
                  <span className={AI_MODEL_ACTIONS_CLASS}>
                    <AppSelect<AgentCapabilityOverride>
                      ariaLabel={labels[labelKey]}
                      className={AI_SELECT_CLASS}
                      value={override}
                      options={localizeOptions(CAPABILITY_OVERRIDE_OPTIONS, labels)}
                      onValueChange={(value) => {
                        update({ overrides: { [key]: value } });
                      }}
                    />
                    {defaultOperation !== null && effective ? (
                      <AppButton
                        variant="secondary"
                        size="sm"
                        onClick={() => update({ setDefaultForOperation: defaultOperation })}
                      >
                        {labels.setDefault}
                      </AppButton>
                    ) : null}
                  </span>
                )}
              />
            );
          })}
        </AppSettingsSection>
      ))}
    </div>
  );
};
