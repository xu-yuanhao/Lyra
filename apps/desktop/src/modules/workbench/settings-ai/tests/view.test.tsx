import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { SettingsAiMcpView, SettingsAiModelsView, SettingsAiSkillsView } from "../view";
import type { GlobalDialogOpenRequest } from "../../global-dialog";
import type {
  SettingsAiLabels,
  SettingsAiModel,
} from "../types";

const labels: SettingsAiLabels = {
  categoryLabel: "AI",
  profilesTitle: "Profiles",
  modelsTitle: "Models",
  modelsSearchPlaceholder: "Add or search models",
  modelsEmptyTitle: "No models available",
  modelsEmptyDescription: "Connect a provider first.",
  modelsCurrentLabel: "Current model",
  modelsAddModel: "Add Model",
  modelsViewAll: "View All Models",
  modelsProviderTitle: "Choose a provider to discover models.",
  modelsDiscoverModels: "Discover Models",
  modelsCustomModel: "Custom Model",
  modelsCustomModelPlaceholder: "model-id",
  modelsAddCustomModel: "Add",
  modelsDisableAll: "Disable All",
  modelsEnableAll: "Enable All",
  modelsManualEntryTitle: "Model IDs",
  modelsManualEntryDescription: "Advanced manual model entry is only needed when discovery is unavailable.",
  modelsDiscoverEmptyDescription: "No models were discovered. Check the provider credentials, then try again.",
  modelsDeleteLabel: "Delete model",
  modelsDeleteConfirmTitle: "Delete model?",
  modelsDeleteConfirmDescription: "Remove {model} from this provider.",
  modelsDeleteProviderDescription: "Remove {model} from Lyra, including its saved login and model list.",
  modelsDeleteConfirmAction: "Delete model",
  skillsTitle: "Skills",
  skillsSearchPlaceholder: "Paste a GitHub URL or local path, or search skills",
  skillsAddSkill: "Add",
  skillsEmptyTitle: "No skills available",
  skillsEmptyDescription: "Install a skill first.",
  skillsSearching: "Searching skills...",
  skillsLoadingMore: "Loading more skills...",
  skillsUninstall: "Uninstall",
  skillsActive: "Enabled",
  skillsInactive: "Disabled",
  skillsPermissionsLabel: "Permissions: ",
  skillsToolsLabel: "Tools: ",
  skillsResourceRootLabel: "Resources: ",
  skillsPromptLabel: "Prompt: ",
  mcpTitle: "MCP",
  mcpSearchPlaceholder: "Paste config",
  mcpAddServer: "Add",
  mcpEmptyTitle: "No MCP servers",
  mcpEmptyDescription: "Paste an MCP config.",
  mcpToolsLabel: "Tools: ",
  mcpConnected: "Connected",
  mcpDisconnected: "Disconnected",
  mcpFailed: "Failed",
  mcpEdit: "Edit",
  mcpRemove: "Remove",
  mcpSave: "Save",
  mcpNameLabel: "Name",
  mcpTransportLabel: "Transport",
  mcpCommandLabel: "Command",
  mcpArgsLabel: "Arguments",
  mcpUrlLabel: "URL",
  mcpEnvLabel: "Environment",
  mcpHeadersLabel: "Headers",
  providerTitle: "Provider",
  connectionTitle: "Connection",
  additionalFieldsTitle: "Additional fields",
  addProfile: "Add profile",
  editProfile: "Edit profile",
  saveProfile: "Save profile",
  deleteProfile: "Delete profile",
  cancel: "Cancel",
  profileNameLabel: "Profile name",
  profileNamePlaceholder: "Team OpenAI",
  urlLabel: "Base URL",
  urlPlaceholder: "https://api.example.com/v1",
  keyLabel: "API key",
  keyPlaceholder: "Paste API key",
  modelLabel: "Model",
  mainModelLabel: "Main model",
  modelModeAllLabel: "All",
  modelModeCustomLabel: "Custom",
  modelPlaceholder: "gpt-5",
  modelsHelp: "Main model first, extra models below.",
  headersLabel: "Headers",
  headersPlaceholder: "X-Header: value",
  emptyTitle: "No AI profile yet",
  emptyDescription: "Create a profile to use runtime models.",
  recommendedSection: "Recommended",
  allSection: "Local",
  customSection: "Custom",
  secretConfigured: "Key configured",
  secretMissing: "Key missing",
  noDiscoveredModels: "No models found",
  advancedSettingsLabel: "Advanced settings",
  selectProviderLabel: "Select provider",
  deleteProfileConfirmTitle: "Delete profile",
  deleteProfileConfirmDescription: "Delete this profile?",
  configFileTitle: "Lyra Agent config file",
  configFileDescription: "Open the real Lyra Agent config.",
  openConfigFile: "Open Config",
  refreshAgent: "Refresh",
  agentConfigAriaLabel: "Lyra Agent config",
  providerAutoFallback: "auto",
  defaultModelFallback: "Lyra Agent default model",
  customProviderFallback: "custom provider",
  accountsTitle: "Lyra Agent Accounts",
  accountsAriaLabel: "Lyra Agent accounts",
  noDefaultProvider: "No default provider",
  noDefaultModel: "No default model",
  accountsEmptyTitle: "No Lyra Agent accounts configured",
  accountsEmptyDescription: "Use the provider profile editor below to add an API key.",
  accountConfigured: "configured",
  accountNotConfigured: "not configured",
  accountDefault: "default",
  apiKeyProviderTitle: "Add API Key Provider",
  apiKeyProviderDescription: "Save an API key provider.",
  localProviderTitle: "Local Models",
  localProviderDescription: "Connect to local model servers.",
  saveAndDiscoverModels: "Save & Discover Models",
  localModelsLabel: "Model IDs",
  localModelsPlaceholder: "llama3.2:latest",
  localCapabilitiesTitle: "Default model capabilities",
  localSupportsImageInput: "Image input",
  localSupportsToolCalling: "Tool calling",
  localSupportsStreaming: "Streaming",
  removeAccount: "Remove account",
  providerProfileTitle: "Lyra Agent Provider Profile",
  authHeaderLabel: "Auth Header",
  promptExperimentsTitle: "Prompt delivery",
  promptExperimentsDescription: "Experimental prompt token controls.",
  leanPromptDeliveryLabel: "Lean prompt delivery",
  statefulPromptContractLabel: "OpenAI Responses stateful prompt contract",
  runtimeUnavailable: "Lyra Agent runtime bridge is unavailable.",
  fileEditorUnavailable: "Workbench file editor is unavailable.",
  configPathUnavailable: "Lyra Agent config path is unavailable.",
  sectionAgent: "Lyra Agent",
  sectionSessions: "Sessions",
  memoryConfigTitle: "Memory",
  memoryConfigDescription: "Memory configuration",
  memoryConfigPlaceholder: "{}",
  memoryConfigLoad: "Load memory",
  memoryConfigSave: "Save memory",
  memoryConfigStatusIdle: "Idle",
  memoryConfigStatusLoaded: "Loaded",
  memoryConfigStatusSaved: "Saved",
  memoryConfigStatusInvalidJson: "Invalid JSON",
  modelDetailsSection: "Model details",
  modelIdTitle: "Model ID",
  contextWindowTitle: "Context window",
  contextWindowDescription: "Leave empty to use the value detected from the provider or capability catalog.",
  contextWindowAuto: "Auto",
  advancedProtocolSection: "Advanced protocol compatibility",
  reasoningReplayFieldTitle: "Reasoning replay field",
  reasoningReplayFieldAriaLabel: "Reasoning replay field",
  assistantReasoningFieldTitle: "Assistant reasoning field",
  assistantReasoningFieldAriaLabel: "Assistant reasoning field requirement",
  assistantReasoningDetected: "Detected requirement: {value}",
  capabilityDetected: "Detected: {value}",
  capabilityExecutableYes: "Executable: yes",
  capabilityExecutableNo: "Executable: no",
  capabilitySource: "Source: {value}",
  capabilityConflictingEvidence: "Conflicting evidence",
  setDefault: "Set default",
  capabilityGroupAgent: "Agent capabilities",
  capabilityGroupInput: "Input modalities",
  capabilityGroupOutput: "Output modalities",
  capabilityGroupOperations: "Model operations",
  capabilityFeatureToolCalling: "Tool calling",
  capabilityFeatureToolChoice: "Tool choice",
  capabilityFeatureStreaming: "Streaming",
  capabilityFeatureStructuredOutput: "Structured output",
  capabilityFeatureReasoning: "Reasoning",
  capabilityFeatureReasoningEffort: "Reasoning effort",
  capabilityFeatureTemperature: "Temperature",
  capabilityInputText: "Text",
  capabilityInputImage: "Images",
  capabilityInputAudio: "Audio",
  capabilityInputVideo: "Video",
  capabilityInputPdf: "PDF",
  capabilityOutputText: "Text",
  capabilityOutputImage: "Images",
  capabilityOutputAudio: "Audio",
  capabilityOutputVideo: "Video",
  capabilityOperationLanguage: "Language",
  capabilityOperationImageGeneration: "Image generation",
  capabilityOperationSpeechGeneration: "Speech generation",
  capabilityOperationTranscription: "Transcription",
  capabilityOperationVideoGeneration: "Video generation",
  overrideAuto: "Auto",
  overrideSupported: "Supported",
  overrideUnsupported: "Unsupported",
  replayNone: "None",
  requirementAuto: "Auto",
  requirementRequired: "Required",
  requirementNotRequired: "Not required",
};

const mimoRoute = (
  id: string,
  label: string,
  description: string,
  defaultBaseUrl: string,
  protocol: "openai" | "anthropic"
) => ({
  id,
  providerId: "mimo",
  protocolId: protocol === "openai" ? "openai_chat_completions" : "anthropic_messages",
  protocolFamily: protocol === "openai" ? "openai-compatible" : "anthropic_messages",
  label,
  description,
  defaultBaseUrl,
  apiMethod: protocol === "openai" ? "chatCompletions" : "messages",
  authKind: protocol === "openai" ? "bearer_or_header" : "api-key",
  runtimeSupported: true,
  modelDiscoverySupported: true,
  customHeadersSupported: true,
  localBackend: null,
  catalogSection: "hosted",
  quickSetupSupported: id === "mimo" || id === "mimo_anthropic",
} as const);

const mimoRoutes = [
  mimoRoute("mimo", "MiMo OpenAI", "MiMo pay-as-you-go OpenAI-compatible endpoint.", "https://api.xiaomimimo.com/v1", "openai"),
  mimoRoute("mimo_anthropic", "MiMo Anthropic", "MiMo pay-as-you-go Anthropic-compatible endpoint.", "https://api.xiaomimimo.com/anthropic/v1", "anthropic"),
  mimoRoute("mimo_token_plan_cn", "MiMo Token Plan (CN, OpenAI)", "MiMo Token Plan China OpenAI-compatible endpoint.", "https://token-plan-cn.xiaomimimo.com/v1", "openai"),
  mimoRoute("mimo_anthropic_token_plan_cn", "MiMo Token Plan (CN, Anthropic)", "MiMo Token Plan China Anthropic-compatible endpoint.", "https://token-plan-cn.xiaomimimo.com/anthropic/v1", "anthropic"),
  mimoRoute("mimo_token_plan_sgp", "MiMo Token Plan (SGP, OpenAI)", "MiMo Token Plan Singapore OpenAI-compatible endpoint.", "https://token-plan-sgp.xiaomimimo.com/v1", "openai"),
  mimoRoute("mimo_anthropic_token_plan_sgp", "MiMo Token Plan (SGP, Anthropic)", "MiMo Token Plan Singapore Anthropic-compatible endpoint.", "https://token-plan-sgp.xiaomimimo.com/anthropic/v1", "anthropic"),
  mimoRoute("mimo_token_plan_ams", "MiMo Token Plan (AMS, OpenAI)", "MiMo Token Plan Europe OpenAI-compatible endpoint.", "https://token-plan-ams.xiaomimimo.com/v1", "openai"),
  mimoRoute("mimo_anthropic_token_plan_ams", "MiMo Token Plan (AMS, Anthropic)", "MiMo Token Plan Europe Anthropic-compatible endpoint.", "https://token-plan-ams.xiaomimimo.com/anthropic/v1", "anthropic"),
] as const;

const createModel = (overrides: Partial<SettingsAiModel> = {}): SettingsAiModel => ({
  isSaving: false,
  errorMessage: null,
  profiles: [
    {
      id: "mimo_token_plan",
      label: "MiMo Token Plan",
      routeId: "mimo_token_plan",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
      defaultModel: "mimo-v2.5-pro",
      configured: true,
      authHeader: "api-key",
      modelCount: 1,
      capabilities: {
        supportsImageInput: true,
        supportsToolCalling: true,
        supportsStreaming: true,
      },
    },
    {
      id: "openai-compatible",
      label: "Custom OpenAI-Compatible",
      routeId: "custom_openai_compatible",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      baseUrl: "https://api.example.com/v1",
      defaultModel: "gpt-5",
      configured: true,
      authHeader: null,
      modelCount: 1,
      capabilities: {
        supportsImageInput: true,
        supportsToolCalling: true,
        supportsStreaming: true,
      },
    },
  ],
  quickSetupRoutes: [
    ...mimoRoutes,
    {
      id: "openai",
      providerId: "openai",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      label: "OpenAI",
      description: "OpenAI hosted route.",
      defaultBaseUrl: "https://api.openai.com/v1",
      apiMethod: "chatCompletions",
      authKind: "bearer",
      runtimeSupported: true,
      modelDiscoverySupported: true,
      customHeadersSupported: false,
      localBackend: null,
      catalogSection: "hosted",
      quickSetupSupported: true,
    },
    {
      id: "glm",
      providerId: "zhipu",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      label: "GLM",
      description: "Zhipu GLM OpenAI-compatible endpoint.",
      defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
      apiMethod: "chatCompletions",
      authKind: "bearer",
      runtimeSupported: true,
      modelDiscoverySupported: true,
      customHeadersSupported: false,
      localBackend: null,
      catalogSection: "hosted",
      quickSetupSupported: true,
    },
    {
      id: "nvidia",
      providerId: "nvidia",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      label: "NVIDIA NIM",
      description: "NVIDIA NIM OpenAI-compatible endpoint.",
      defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
      apiMethod: "chatCompletions",
      authKind: "bearer",
      runtimeSupported: true,
      modelDiscoverySupported: true,
      customHeadersSupported: false,
      localBackend: null,
      catalogSection: "hosted",
      quickSetupSupported: true,
    },
    {
      id: "custom_openai_compatible",
      providerId: "custom_openai_compatible",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      label: "Custom OpenAI-Compatible",
      description: "Manual OpenAI-compatible endpoint.",
      defaultBaseUrl: null,
      apiMethod: "chatCompletions",
      authKind: "bearer_or_header",
      runtimeSupported: true,
      modelDiscoverySupported: false,
      customHeadersSupported: true,
      localBackend: null,
      catalogSection: "custom",
      quickSetupSupported: true,
    },
  ],
  localRoutes: [
    {
      id: "lmstudio",
      providerId: "lmstudio",
      protocolId: "openai_chat_completions",
      protocolFamily: "openai-compatible",
      label: "LM Studio",
      description: "Local LM Studio route.",
      defaultBaseUrl: "http://127.0.0.1:1234/v1",
      apiMethod: "chatCompletions",
      authKind: "none_or_header",
      runtimeSupported: true,
      modelDiscoverySupported: true,
      customHeadersSupported: true,
      localBackend: "lmstudio",
      catalogSection: "local",
      quickSetupSupported: false,
    },
  ],
  defaultProfileId: "mimo_token_plan",
  agentConfig: {
    agentHome: "/Users/petehsu/.lyra/modules/agent",
    configPath: "/Users/petehsu/.lyra/modules/agent/state.json",
    config: {
      provider: {
        defaultProvider: "mimo_token_plan",
        defaultModel: "mimo-v2.5-pro",
      },
      providers: {
        mimo_token_plan: {
          label: "MiMo Token Plan",
          routeId: "mimo_token_plan",
          protocolId: "openai_chat_completions",
          protocolFamily: "openai-compatible",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          authHeader: "api-key",
          defaultModel: "mimo-v2.5-pro",
          models: [{ id: "mimo-v2.5-pro" }],
        },
        "openai-compatible": {
          label: "Custom OpenAI-Compatible",
          routeId: "custom_openai_compatible",
          protocolId: "openai_chat_completions",
          protocolFamily: "openai-compatible",
          baseUrl: "https://api.example.com/v1",
          defaultModel: "gpt-5",
          models: [{ id: "gpt-5" }],
        },
      },
      promptDelivery: {
        mode: "full",
        leanExperimental: false,
        openaiResponsesStatefulPromptContract: false,
      },
    },
    commands: [
      {
        name: "/account",
        help: "Manage accounts",
        autocomplete: true,
        remoteOnly: false,
      },
      {
        name: "/model",
        help: "Switch model",
        autocomplete: true,
        remoteOnly: false,
      },
    ],
  },
  agentAccounts: {
    defaultProvider: "mimo_token_plan",
    defaultModel: "mimo-v2.5-pro",
    authStatus: {},
    accounts: [],
  },
  agentProviderCatalog: {
    schemaVersion: "2026-06-14",
    defaultProvider: "mimo_token_plan",
    defaultModel: "mimo-v2.5-pro",
    protocols: [
      {
        id: "openai_chat_completions",
        family: "openai-compatible",
        label: "OpenAI Chat Completions",
        transport: "http",
        runtimeSupported: true,
        streamingSupported: true,
        toolCallingSupported: true,
      },
    ],
    routes: [
      ...mimoRoutes,
      {
        id: "openai",
        providerId: "openai",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "OpenAI",
        description: "OpenAI hosted route.",
        defaultBaseUrl: "https://api.openai.com/v1",
        apiMethod: "chatCompletions",
        authKind: "bearer",
        runtimeSupported: true,
        modelDiscoverySupported: true,
        customHeadersSupported: false,
        localBackend: null,
        catalogSection: "hosted",
        quickSetupSupported: true,
      },
      {
        id: "glm",
        providerId: "zhipu",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "GLM",
        description: "Zhipu GLM OpenAI-compatible endpoint.",
        defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
        apiMethod: "chatCompletions",
        authKind: "bearer",
        runtimeSupported: true,
        modelDiscoverySupported: true,
        customHeadersSupported: false,
        localBackend: null,
        catalogSection: "hosted",
        quickSetupSupported: true,
      },
      {
        id: "nvidia",
        providerId: "nvidia",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "NVIDIA NIM",
        description: "NVIDIA NIM OpenAI-compatible endpoint.",
        defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
        apiMethod: "chatCompletions",
        authKind: "bearer",
        runtimeSupported: true,
        modelDiscoverySupported: true,
        customHeadersSupported: false,
        localBackend: null,
        catalogSection: "hosted",
        quickSetupSupported: true,
      },
      {
        id: "custom_openai_compatible",
        providerId: "custom_openai_compatible",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "Custom OpenAI-Compatible",
        description: "Manual OpenAI-compatible endpoint.",
        defaultBaseUrl: null,
        apiMethod: "chatCompletions",
        authKind: "bearer_or_header",
        runtimeSupported: true,
        modelDiscoverySupported: false,
        customHeadersSupported: true,
        localBackend: null,
        catalogSection: "custom",
        quickSetupSupported: true,
      },
      {
        id: "lmstudio",
        providerId: "lmstudio",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "LM Studio",
        description: "Local LM Studio route.",
        defaultBaseUrl: "http://127.0.0.1:1234/v1",
        apiMethod: "chatCompletions",
        authKind: "none_or_header",
        runtimeSupported: true,
        modelDiscoverySupported: true,
        customHeadersSupported: true,
        localBackend: "lmstudio",
        catalogSection: "local",
        quickSetupSupported: false,
      },
    ],
    profiles: [],
  },
  agentModelCatalog: {
    sessionId: null,
    currentModel: "mimo-v2.5-pro",
    currentProvider: "mimo_token_plan",
    defaultModel: "mimo-v2.5-pro",
    defaultProvider: "mimo_token_plan",
    models: [
      {
        id: "mimo_token_plan:mimo-v2.5-pro",
        label: "mimo-v2.5-pro",
        model: "mimo-v2.5-pro",
        provider: "mimo_token_plan",
        providerId: "mimo_token_plan",
        providerKey: "mimo_token_plan",
        providerLabel: "MiMo Token Plan",
        apiMethod: "chatCompletions",
        detail: "OpenAI-compatible",
        contextWindow: null,
        supportsImageInput: true,
        supportsToolCalling: true,
        available: true,
        enabled: true,
      },
      {
        id: "openai-compatible:gpt-5",
        label: "gpt-5",
        model: "gpt-5",
        provider: "custom_openai_compatible",
        providerId: "custom_openai_compatible",
        providerKey: "openai-compatible",
        providerLabel: "Custom OpenAI-Compatible",
        apiMethod: "chatCompletions",
        detail: "Manual endpoint",
        contextWindow: null,
        supportsImageInput: true,
        supportsToolCalling: true,
        available: true,
        enabled: true,
      },
    ],
    routes: [],
    reasoningEffort: { current: null, options: [], supported: true },
    verbosity: { current: null, options: [], supported: true },
    serviceTier: { current: null, options: [], supported: true },
  },
  agentSkillCatalog: {
    skills: [],
    store: {
      indexUrl: "lyra://skills/dynamic",
      index: null,
      lastError: null,
    },
  },
  setDefaultProfile: vi.fn(),
  refreshAgent: vi.fn(),
  openAgentConfigFile: vi.fn(),
  updateAgentConfig: vi.fn(),
  saveAgentProviderProfile: vi.fn(),
  refreshAgentModels: vi.fn(),
  refreshAgentModelCatalog: vi.fn(),
  setAgentModelEnabled: vi.fn(),
  deleteAgentModel: vi.fn(),
  switchAgentModel: vi.fn(),
  refreshAgentSkills: vi.fn(),
  refreshAgentSkillStore: vi.fn(),
  updateAgentSkillStoreConfig: vi.fn(),
  activateAgentSkill: vi.fn(),
  deactivateAgentSkill: vi.fn(),
  installAgentSkillFromLocal: vi.fn(),
  installAgentSkillFromGit: vi.fn(),
  installAgentSkillFromStore: vi.fn(),
  uninstallAgentSkill: vi.fn(),
  switchAgentAccount: vi.fn(),
  removeAgentAccount: vi.fn(),
  ...overrides,
});

describe("Settings AI views", () => {
  test("renders installed skills and toggles activation", () => {
    const activateAgentSkill = vi.fn();
    const uninstallAgentSkill = vi.fn();
    const model = createModel({
      activateAgentSkill,
      uninstallAgentSkill,
      agentSkillCatalog: {
        skills: [
          {
            id: "review-skill",
            name: "Review Skill",
            version: "1.0.0",
            description: "Review code",
            promptExcerpt: "Use the review checklist.",
            promptHash: "hash",
            permissions: ["files.read"],
            toolPaths: ["/tools/file/read"],
            active: false,
            source: { kind: "local", path: "/tmp/review-skill" },
            packagePath: "/tmp/review-skill",
            promptPath: "/tmp/review-skill/SKILL.md",
            resourceRoot: "/tmp/review-skill",
            sourceFingerprint: "fingerprint",
            installedAt: "2026-07-02T00:00:00Z",
            updatedAt: "2026-07-02T00:00:00Z",
            lastError: null,
          },
        ],
        store: {
          indexUrl: "lyra://skills/dynamic",
          index: null,
          lastError: null,
        },
      },
    });

    render(<SettingsAiSkillsView labels={labels} model={model} />);

    expect(screen.getByText("Review Skill")).toBeInTheDocument();
    const card = screen.getByText("Review Skill").closest(".lyra-settings-ai-skill-card");
    const actions = card?.querySelector(".lyra-settings-ai-skill-actions");
    expect(actions?.firstElementChild).toHaveAttribute("aria-label", "Uninstall: Review Skill");
    expect(actions?.lastElementChild).toHaveAttribute("role", "switch");

    fireEvent.click(screen.getByRole("switch", { name: "Review Skill" }));
    expect(activateAgentSkill).toHaveBeenCalledWith({ skillId: "review-skill" });
    fireEvent.click(screen.getByRole("button", { name: "Uninstall: Review Skill" }));
    expect(uninstallAgentSkill).toHaveBeenCalledWith({ skillId: "review-skill" });
  });

  test("edits MCP server details from the server row", () => {
    const upsertAgentMcpServer = vi.fn();
    const model = createModel({
      upsertAgentMcpServer,
      agentMcpCatalog: {
        storageRoot: "/tmp/mcp",
        servers: [
          {
            id: "git",
            name: "Git MCP",
            transport: {
              kind: "stdio",
              command: "uvx",
              args: ["mcp-server-git"],
              env: { GIT_TOKEN: "<configured>" },
            },
            enabled: true,
            state: "connected",
            toolCount: 1,
            tools: [],
            lastError: null,
            createdAt: "2026-07-02T00:00:00Z",
            updatedAt: "2026-07-02T00:00:00Z",
          },
        ],
      },
    });

    render(<SettingsAiMcpView labels={labels} model={model} />);

    const card = screen.getByText("Git MCP").closest(".lyra-settings-ai-skill-card");
    const actions = card?.querySelector(".lyra-settings-ai-skill-actions");
    expect(actions?.firstElementChild).toHaveAttribute("aria-label", "Edit: Git MCP");
    expect(actions?.children.item(1)).toHaveAttribute("aria-label", "Remove: Git MCP");
    expect(actions?.lastElementChild).toHaveAttribute("role", "switch");

    fireEvent.click(screen.getByRole("button", { name: "Edit: Git MCP" }));
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Git Tools" },
    });
    fireEvent.change(screen.getByLabelText("Arguments"), {
      target: { value: "mcp-server-git --repository /repo" },
    });
    fireEvent.change(screen.getByLabelText("Environment"), {
      target: { value: "GIT_TOKEN=<configured>\nDEBUG=1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(upsertAgentMcpServer).toHaveBeenCalledWith({
      serverId: "git",
      name: "Git Tools",
      command: "uvx",
      args: "mcp-server-git --repository /repo",
      env: "GIT_TOKEN=<configured>\nDEBUG=1",
      envVars: [],
      cwd: null,
      startupTimeoutMs: null,
      toolTimeoutMs: null,
      enabled: true,
    });
  });

  test("lists store skills and installs from the switch", () => {
    const installAgentSkillFromStore = vi.fn();
    const model = createModel({
      installAgentSkillFromStore,
      agentSkillCatalog: {
        skills: [],
        store: {
          indexUrl: "lyra://skills/dynamic",
          index: {
            version: 1,
            updatedAt: "2026-07-02T00:00:00Z",
            skills: [
              {
                id: "store-skill",
                name: "Store Skill",
                version: "1.0.0",
                description: "From Lyra Store",
                source: {
                  kind: "store",
                  skillId: "store-skill",
                  indexUrl: "lyra://skills/dynamic",
                },
                permissions: ["files.read"],
                toolPaths: ["/tools/skills/list"],
              },
            ],
          },
          lastError: null,
        },
      },
    });

    render(<SettingsAiSkillsView labels={labels} model={model} />);

    expect(screen.getByText("Store Skill")).toBeInTheDocument();
    expect(screen.queryByDisplayValue(/raw\.githubusercontent\.com/u)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Store Skill" }));

    expect(installAgentSkillFromStore).toHaveBeenCalledWith({ skillId: "store-skill" });
  });

  test("adds skills from a single GitHub tree input", () => {
    const installAgentSkillFromGit = vi.fn();
    const model = createModel({ installAgentSkillFromGit });

    render(<SettingsAiSkillsView labels={labels} model={model} />);

    fireEvent.change(screen.getByLabelText("Skills"), {
      target: { value: "https://github.com/acme/skill-pack/tree/main/skills/review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(installAgentSkillFromGit).toHaveBeenCalledWith({
      url: "https://github.com/acme/skill-pack.git",
      ref: "main",
      subdir: "skills/review",
    });
  });

  test("adds skills from a local path input", () => {
    const installAgentSkillFromLocal = vi.fn();
    const model = createModel({ installAgentSkillFromLocal });

    render(<SettingsAiSkillsView labels={labels} model={model} />);

    fireEvent.change(screen.getByLabelText("Skills"), {
      target: { value: "/Users/petehsu/skills/review" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(installAgentSkillFromLocal).toHaveBeenCalledWith({
      sourcePath: "/Users/petehsu/skills/review",
    });
  });

  test("renders models as a separate settings page and toggles model enablement", () => {
    const setAgentModelEnabled = vi.fn();
    const model = createModel({
      setAgentModelEnabled,
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    // 服务商分组列表：初始看到服务商名，不直接看到模型
    expect(screen.getByLabelText("Models")).toHaveValue("");
    expect(screen.getByText("MiMo Token Plan")).toBeInTheDocument();
    expect(screen.getByText("Custom OpenAI-Compatible")).toBeInTheDocument();
    expect(screen.queryByText("mimo-v2.5-pro")).not.toBeInTheDocument();
    expect(screen.queryByText("gpt-5")).not.toBeInTheDocument();

    // 点击进入 "Custom OpenAI-Compatible" 子页面
    fireEvent.click(screen.getByText("Custom OpenAI-Compatible"));

    expect(screen.getByText("gpt-5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "gpt-5" }));

    expect(setAgentModelEnabled).toHaveBeenCalledWith({
      model: "gpt-5",
      provider: "openai-compatible",
      enabled: false,
    });
  });

  test("opens model capability details and updates only that model", () => {
    const updateAgentModelCapabilities = vi.fn();
    const baseModel = createModel();
    const model = createModel({
      agentModelCatalog: {
        ...baseModel.agentModelCatalog!,
        models: baseModel.agentModelCatalog!.models.map((entry) => entry.model === "gpt-5"
          ? {
              ...entry,
              capabilities: {
                detected: { "feature.toolCalling": "unsupported" as const },
                overrides: { "feature.toolCalling": "auto" as const },
                effective: { "feature.toolCalling": false },
                evidence: {
                  "feature.toolCalling": {
                    source: "models.dev",
                    sourceUrl: "https://models.dev/example",
                    observedAt: "2026-08-30T00:00:00Z",
                    conflict: false,
                  },
                },
                runtimeConflict: null,
                contextWindowOverride: null,
                reasoningReplayFieldOverride: null,
                assistantReasoningFieldRequiredOverride: null,
              },
            }
          : entry),
      },
      updateAgentModelCapabilities,
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByText("Custom OpenAI-Compatible"));
    fireEvent.click(screen.getByText("gpt-5"));

    expect(screen.getByText("Agent capabilities")).toBeInTheDocument();
    expect(screen.getByText(/Detected: unsupported/u)).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/models\.dev\/example/u)).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText("Context window"), {
      target: { value: "128000" },
    });
    expect(updateAgentModelCapabilities).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "gpt-5",
      contextWindowOverride: 128000,
    });
  });

  test("confirms before deleting a configured model", () => {
    const deleteAgentModel = vi.fn();
    const openDialog = vi.fn((request: GlobalDialogOpenRequest) => {
      void request;
    });
    const model = createModel({ deleteAgentModel });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={openDialog} />);

    // 先进入 "Custom OpenAI-Compatible" 子页面才能看到 gpt-5 的删除按钮
    fireEvent.click(screen.getByText("Custom OpenAI-Compatible"));

    fireEvent.click(screen.getByRole("button", { name: "Delete model: gpt-5" }));

    expect(deleteAgentModel).not.toHaveBeenCalled();
    expect(openDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: "Delete model?",
      description: "Remove gpt-5 from this provider.",
    }));

    const request = openDialog.mock.calls[0]?.[0];
    const deleteAction = request?.actions?.find((action) => action.id === "delete");
    expect(deleteAction).toMatchObject({
      label: "Delete model",
      tone: "danger",
    });

    deleteAction?.onSelect?.({});

    expect(deleteAgentModel).toHaveBeenCalledWith({
      provider: "openai-compatible",
      model: "gpt-5",
    });
  });

  test("adds a preset provider from the Models page without exposing base URL", async () => {
    const discoveredCatalog = {
      ...createModel().agentModelCatalog!,
      models: [
        ...createModel().agentModelCatalog!.models,
        {
          id: "openai:gpt-5.1",
          label: "gpt-5.1",
          model: "gpt-5.1",
          provider: "openai",
          providerId: "openai",
          providerKey: "openai",
          providerLabel: "OpenAI",
          apiMethod: "chatCompletions",
          detail: "OpenAI",
          contextWindow: null,
          supportsImageInput: true,
          supportsToolCalling: true,
          available: true,
          enabled: true,
        },
      ],
    };
    const saveAgentProviderProfile = vi.fn(async () => undefined);
    const saveAndDiscoverAgentProviderProfile = vi.fn(async () => discoveredCatalog);
    const model = createModel({
      saveAgentProviderProfile,
      saveAndDiscoverAgentProviderProfile,
    });

    const { rerender } = render(
      <SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));

    expect(screen.getByRole("textbox", { name: "Select provider" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Models" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^OpenAI\b/u })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "opena" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^OpenAI\b/u }));
    expect(screen.queryByLabelText("Base URL")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-openai" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Discover Models/ }));

    await waitFor(() => {
      expect(saveAndDiscoverAgentProviderProfile).toHaveBeenCalledWith({
        profileName: "openai",
        routeId: "openai",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-openai",
        defaultModel: null,
        auth: "bearer",
        authHeader: null,
        setDefault: false,
      });
    });
    expect(saveAgentProviderProfile).not.toHaveBeenCalled();
    expect(await screen.findByText("gpt-5.1")).toBeInTheDocument();
    await act(async () => {
      rerender(
        <SettingsAiModelsView
          labels={labels}
          model={{
            ...model,
            agentProviderCatalog: {
              ...model.agentProviderCatalog!,
              routes: model.agentProviderCatalog!.routes.map((route) => ({ ...route })),
            },
          }}
          openDialog={vi.fn()}
        />
      );
    });
    expect(screen.getByText("gpt-5.1")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "gpt-5.1" })).toBeChecked();
    expect(screen.queryByRole("button", { name: "Disable All" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));

    await waitFor(() => {
      expect(saveAgentProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
        profileName: "openai",
        routeId: "openai",
        models: [
          {
            id: "gpt-5.1",
            enabled: true,
          },
        ],
      }));
    });
  });

  test("keeps discovered models when the saved profile reloads into the catalog", async () => {
    const baseModel = createModel();
    const discoveredCatalog = {
      ...baseModel.agentModelCatalog!,
      models: [
        ...baseModel.agentModelCatalog!.models,
        {
          id: "openai:gpt-5.1",
          label: "gpt-5.1",
          model: "gpt-5.1",
          provider: "openai",
          providerId: "openai",
          providerKey: "openai",
          providerLabel: "OpenAI",
          apiMethod: "chatCompletions",
          detail: "OpenAI",
          contextWindow: null,
          supportsImageInput: true,
          supportsToolCalling: true,
          available: true,
          enabled: true,
        },
      ],
    };
    const saveAndDiscoverAgentProviderProfile = vi.fn(async () => discoveredCatalog);
    const model = createModel({ saveAndDiscoverAgentProviderProfile });

    const { rerender } = render(
      <SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />
    );

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "opena" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^OpenAI\b/u }));
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-openai" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Discover Models/ }));

    expect(await screen.findByText("gpt-5.1")).toBeInTheDocument();

    // The service awaits refreshAgent() after discovery, so the freshly saved
    // profile arrives through props a moment later.
    const reloadedConfig = baseModel.agentConfig!.config as {
      readonly providers?: Record<string, unknown>;
    };
    await act(async () => {
      rerender(
        <SettingsAiModelsView
          labels={labels}
          model={{
            ...model,
            agentConfig: {
              ...baseModel.agentConfig!,
              config: {
                ...reloadedConfig,
                providers: {
                  ...reloadedConfig.providers,
                  openai: {
                    label: "OpenAI",
                    routeId: "openai",
                    protocolId: "openai_chat_completions",
                    protocolFamily: "openai-compatible",
                    baseUrl: "https://api.openai.com/v1",
                    authHeader: null,
                    defaultModel: "gpt-5.1",
                    models: [{ id: "gpt-5.1" }],
                  },
                },
              },
            },
            agentProviderCatalog: {
              ...baseModel.agentProviderCatalog!,
              profiles: [
                ...baseModel.profiles,
                {
                  id: "openai",
                  label: "OpenAI",
                  routeId: "openai",
                  protocolId: "openai_chat_completions",
                  protocolFamily: "openai-compatible",
                  baseUrl: "https://api.openai.com/v1",
                  defaultModel: "gpt-5.1",
                  configured: true,
                  authHeader: null,
                  modelCount: 1,
                  capabilities: {
                    supportsImageInput: true,
                    supportsToolCalling: true,
                    supportsStreaming: true,
                  },
                },
              ],
            },
          }}
          openDialog={vi.fn()}
        />
      );
    });

    expect(screen.getByText("gpt-5.1")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "gpt-5.1" })).toBeChecked();
  });

  test("searches providers with Chinese aliases and cancels from the Add Model button", () => {
    const baseModel = createModel();
    const ollamaRoute = {
      id: "ollama",
      providerId: "ollama",
      protocolId: "ollama_chat",
      protocolFamily: "ollama_chat",
      label: "Ollama",
      description: "Local Ollama native chat route.",
      defaultBaseUrl: "http://127.0.0.1:11434",
      apiMethod: "chat",
      authKind: "none_or_header",
      runtimeSupported: true,
      modelDiscoverySupported: true,
      customHeadersSupported: true,
      localBackend: "ollama",
      catalogSection: "local",
      quickSetupSupported: false,
    } as const;
    const model = createModel({
      localRoutes: [
        ...baseModel.localRoutes,
        ollamaRoute,
      ],
      agentProviderCatalog: {
        ...baseModel.agentProviderCatalog!,
        routes: [
          ...baseModel.agentProviderCatalog!.routes,
          ollamaRoute,
        ],
      },
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "自定义搜索" },
    });

    expect(screen.getByRole("button", { name: /Custom OpenAI-Compatible/ })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "智谱" },
    });

    expect(screen.getByRole("button", { name: /^GLM\b/u })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "英伟达" },
    });

    expect(screen.getByRole("button", { name: /^NVIDIA NIM\b/u })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "羊驼" },
    });

    expect(screen.getByRole("button", { name: /^Ollama\b/u })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Select provider")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Models")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Model/ })).toBeInTheDocument();
  });

  test("shows separate OpenCode Zen and Go API routes in Add Model", () => {
    const opencodeRoutes = [
      {
        id: "opencode_zen",
        providerId: "opencode_zen",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "OpenCode Zen",
        description: "OpenCode pay-as-you-go API with automatic per-model protocol routing.",
        defaultBaseUrl: "https://opencode.ai/zen/v1",
        apiMethod: "modelDependent",
        authKind: "bearer",
        runtimeSupported: true,
        modelDiscoverySupported: true,
        customHeadersSupported: false,
        localBackend: null,
        catalogSection: "hosted",
        quickSetupSupported: true,
      },
      {
        id: "opencode_go",
        providerId: "opencode_go",
        protocolId: "openai_chat_completions",
        protocolFamily: "openai-compatible",
        label: "OpenCode Go",
        description: "OpenCode subscription API with automatic per-model protocol routing.",
        defaultBaseUrl: "https://opencode.ai/zen/go/v1",
        apiMethod: "modelDependent",
        authKind: "bearer",
        runtimeSupported: true,
        modelDiscoverySupported: true,
        customHeadersSupported: false,
        localBackend: null,
        catalogSection: "hosted",
        quickSetupSupported: true,
      },
    ] as const;
    const model = createModel({
      quickSetupRoutes: [...createModel().quickSetupRoutes, ...opencodeRoutes],
      agentProviderCatalog: {
        ...createModel().agentProviderCatalog!,
        routes: [...createModel().agentProviderCatalog!.routes, ...opencodeRoutes],
      },
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "opencode" },
    });

    expect(screen.getByRole("button", { name: /OpenCode Zen/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OpenCode Go/ })).toBeInTheDocument();
  });

  test("shows every MiMo protocol and region when searching Xiaomi", () => {
    const model = createModel();

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "xiaomi" },
    });

    expect(screen.getByRole("button", { name: /^MiMo OpenAI\b/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^MiMo Anthropic\b/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MiMo Token Plan \(CN, OpenAI\)/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MiMo Token Plan \(CN, Anthropic\)/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MiMo Token Plan \(SGP, OpenAI\)/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MiMo Token Plan \(SGP, Anthropic\)/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MiMo Token Plan \(AMS, OpenAI\)/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MiMo Token Plan \(AMS, Anthropic\)/u })).toBeInTheDocument();
  });

  test("shows custom provider connection fields and saves discovered model enablement", async () => {
    const discoveredCatalog = {
      ...createModel().agentModelCatalog!,
      models: [
        {
          id: "openai-compatible:mimo-v2.5-pro",
          label: "mimo-v2.5-pro",
          model: "mimo-v2.5-pro",
          provider: "custom_openai_compatible",
          providerId: "custom_openai_compatible",
          providerKey: "openai-compatible",
          providerLabel: "Custom OpenAI-Compatible",
          apiMethod: "chatCompletions",
          detail: "Manual endpoint",
          contextWindow: null,
          supportsImageInput: true,
          supportsToolCalling: true,
          available: true,
          enabled: true,
        },
        {
          id: "openai-compatible:mimo-v2.5-vision",
          label: "mimo-v2.5-vision",
          model: "mimo-v2.5-vision",
          provider: "custom_openai_compatible",
          providerId: "custom_openai_compatible",
          providerKey: "openai-compatible",
          providerLabel: "Custom OpenAI-Compatible",
          apiMethod: "chatCompletions",
          detail: "Manual endpoint",
          contextWindow: null,
          supportsImageInput: true,
          supportsToolCalling: true,
          available: true,
          enabled: true,
        },
      ],
    };
    const saveAgentProviderProfile = vi.fn(async () => undefined);
    const refreshAgentModels = vi.fn(async () => discoveredCatalog);
    const model = createModel({
      saveAgentProviderProfile,
      refreshAgentModels,
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Custom OpenAI-Compatible/ }));
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://api.xiaomimimo.com/v1" },
    });
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-secret-value" },
    });
    expect(screen.queryByLabelText("Auth Header")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Model IDs")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Image input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Discover Models/ }));

    expect(await screen.findByText("mimo-v2.5-pro")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "mimo-v2.5-vision" })).toBeChecked();
    fireEvent.click(screen.getByRole("switch", { name: "mimo-v2.5-vision" }));
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));

    await waitFor(() => {
      expect(saveAgentProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
        profileName: "openai-compatible",
        routeId: "custom_openai_compatible",
        baseUrl: "https://api.xiaomimimo.com/v1",
        apiKey: "sk-secret-value",
        defaultModel: "mimo-v2.5-pro",
        auth: "bearer",
        authHeader: null,
        setDefault: false,
        models: [
          {
            id: "mimo-v2.5-pro",
            enabled: true,
          },
          {
            id: "mimo-v2.5-vision",
            enabled: false,
          },
        ],
      }));
    });
    expect(refreshAgentModels).toHaveBeenCalledWith("openai-compatible", {
      listOnly: true
    });
  });

  test("does not reuse the built-in OpenCode profile for a new custom provider", async () => {
    const baseModel = createModel();
    const saveAgentProviderProfile = vi.fn(async () => undefined);
    const opencodeModel = {
      id: "opencode-free:big-pickle",
      label: "Big Pickle",
      model: "big-pickle",
      provider: "opencode-free",
      providerId: "opencode-free",
      providerKey: "opencode-free",
      providerLabel: "OpenCode Free",
      routeId: "custom_openai_compatible",
      apiMethod: "chatCompletions",
      detail: "https://opencode.ai/zen/v1",
      contextWindow: null,
      supportsImageInput: false,
      supportsToolCalling: true,
      available: true,
      enabled: true,
      free: true,
      sourceLabel: "OpenCode",
    } as const;
    const model = createModel({
      profiles: [
        {
          id: "opencode-free",
          label: "OpenCode Free",
          routeId: "custom_openai_compatible",
          protocolId: "openai_chat_completions",
          protocolFamily: "openai-compatible",
          baseUrl: "https://opencode.ai/zen/v1",
          defaultModel: "big-pickle",
          configured: true,
          authHeader: null,
          modelCount: 8,
          capabilities: {
            supportsImageInput: false,
            supportsToolCalling: true,
            supportsStreaming: true,
          },
        },
      ],
      agentModelCatalog: {
        ...baseModel.agentModelCatalog!,
        models: [opencodeModel],
      },
      saveAgentProviderProfile,
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Custom OpenAI-Compatible/ }));

    expect(screen.getByLabelText("Base URL")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://private.example.com/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Custom Model" }));
    fireEvent.change(screen.getByLabelText("Custom Model"), {
      target: { value: "private-model" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));

    await waitFor(() => {
      expect(saveAgentProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
        profileName: "custom_openai_compatible",
        routeId: "custom_openai_compatible",
        baseUrl: "https://private.example.com/v1",
        models: [{ id: "private-model", enabled: true }],
      }));
    });
  });

  test("does not include built-in OpenCode models in custom discovery", async () => {
    const baseModel = createModel();
    const customEntry = {
      ...baseModel.agentModelCatalog!.models[1]!,
      id: "custom_openai_compatible:deepseek-default",
      label: "deepseek-default",
      model: "deepseek-default",
      provider: "custom_openai_compatible",
      providerId: "custom_openai_compatible",
      providerKey: "custom_openai_compatible",
      routeId: "custom_openai_compatible",
    };
    const openCodeEntry = {
      ...customEntry,
      id: "opencode-free:big-pickle",
      label: "Big Pickle",
      model: "big-pickle",
      provider: "opencode-free",
      providerId: "opencode-free",
      providerKey: "opencode-free",
      providerLabel: "OpenCode Free",
      free: true,
      sourceLabel: "OpenCode",
    };
    const refreshAgentModels = vi.fn(async () => ({
      ...baseModel.agentModelCatalog!,
      models: [openCodeEntry, customEntry],
    }));
    const model = createModel({ refreshAgentModels });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Custom OpenAI-Compatible/ }));
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "http://23.95.18.10:22217/v1" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Discover Models/ }));

    expect(await screen.findByText("deepseek-default")).toBeInTheDocument();
    expect(screen.queryByText("Big Pickle")).not.toBeInTheDocument();
  });

  test("adds a custom model beside discovery and saves it as enabled", async () => {
    const saveAgentProviderProfile = vi.fn(async () => undefined);
    const model = createModel({
      saveAgentProviderProfile,
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "custom" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Custom OpenAI-Compatible/ }));
    fireEvent.change(screen.getByLabelText("Base URL"), {
      target: { value: "https://api.pioneer.ai" },
    });
    fireEvent.change(screen.getByLabelText("API key"), {
      target: { value: "sk-secret-value" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Custom Model" }));
    fireEvent.change(screen.getByLabelText("Custom Model"), {
      target: { value: "claude-sonnet-4-6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "claude-sonnet-4-6" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));

    await waitFor(() => {
      expect(saveAgentProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
        profileName: "openai-compatible",
        routeId: "custom_openai_compatible",
        baseUrl: "https://api.pioneer.ai",
        apiKey: "sk-secret-value",
        defaultModel: "claude-sonnet-4-6",
        models: [
          {
            id: "claude-sonnet-4-6",
            enabled: true,
          },
        ],
      }));
    });
  });

  test("shows a disable-all action only after discovering more than three models", async () => {
    const discoveredCatalog = {
      ...createModel().agentModelCatalog!,
      models: Array.from({ length: 4 }, (_, index) => ({
        id: `openai:gpt-test-${index + 1}`,
        label: `gpt-test-${index + 1}`,
        model: `gpt-test-${index + 1}`,
        provider: "openai",
        providerId: "openai",
        providerKey: "openai",
        providerLabel: "OpenAI",
        apiMethod: "chatCompletions",
        detail: "OpenAI",
        contextWindow: null,
        supportsImageInput: true,
        supportsToolCalling: true,
        available: true,
        enabled: true,
      })),
    };
    const refreshAgentModels = vi.fn(async () => discoveredCatalog);
    const model = createModel({
      refreshAgentModels,
      saveAgentProviderProfile: vi.fn(async () => undefined),
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "openai" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^OpenAI\b/u }));
    fireEvent.click(screen.getByRole("button", { name: /Discover Models/ }));

    expect(await screen.findByText("gpt-test-4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Disable All" }));

    expect(screen.getByRole("switch", { name: "gpt-test-1" })).not.toBeChecked();
    expect(screen.getByRole("switch", { name: "gpt-test-4" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Enable All" })).toBeInTheDocument();
  });

  test("models page starts in provider search mode and stays quiet when no models are configured", () => {
    const model = createModel({
      profiles: [],
      agentModelCatalog: {
        sessionId: null,
        currentModel: "gpt-5-mini",
        currentProvider: "openai",
        defaultModel: "gpt-5-mini",
        defaultProvider: "openai",
        models: [],
        routes: [],
        reasoningEffort: { current: null, options: [], supported: true },
        verbosity: { current: null, options: [], supported: true },
        serviceTier: { current: null, options: [], supported: true },
      },
      defaultProfileId: "openai",
      agentConfig: {
        agentHome: "/Users/petehsu/.lyra/modules/agent",
        configPath: "/Users/petehsu/.lyra/modules/agent/state.json",
        config: {
          provider: {
            defaultProvider: "openai",
            defaultModel: "gpt-5-mini",
          },
          providers: {},
          roles: {},
          promptDelivery: {
            mode: "full",
            leanExperimental: false,
            openaiResponsesStatefulPromptContract: false,
          },
        },
        commands: [],
      },
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    expect(screen.getByLabelText("Select provider")).toBeInTheDocument();
    expect(screen.queryByLabelText("Models")).not.toBeInTheDocument();
    expect(screen.queryByText("No models available")).not.toBeInTheDocument();
    expect(screen.queryByText("Connect a provider first.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "definitely-not-a-provider" },
    });

    expect(screen.queryByText("No AI profile yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Create a profile to use runtime models.")).not.toBeInTheDocument();
  });

  test("add model mode does not render an empty list before provider results exist", () => {
    const model = createModel();

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));

    expect(screen.getByLabelText("Select provider")).toBeInTheDocument();
    expect(screen.queryByText("No AI profile yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Create a profile to use runtime models.")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select provider"), {
      target: { value: "definitely-not-a-provider" },
    });

    expect(screen.queryByText("No AI profile yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Create a profile to use runtime models.")).not.toBeInTheDocument();
  });

  test("models page shows the first nine models before expanding all", () => {
    const model = createModel({
      agentModelCatalog: {
        ...createModel().agentModelCatalog!,
        models: Array.from({ length: 12 }, (_, index) => ({
          id: `openai:model-${index + 1}`,
          label: `model-${index + 1}`,
          model: `model-${index + 1}`,
          provider: "openai",
          providerId: "openai",
          providerKey: "openai",
          providerLabel: "OpenAI",
          apiMethod: "chatCompletions",
          detail: "OpenAI",
          contextWindow: null,
          supportsImageInput: true,
          supportsToolCalling: true,
          available: true,
          enabled: true,
        })),
      },
    });

    render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);

    // 初始看到服务商行，不直接看到模型
    const providerRow = screen.getByText("OpenAI", { selector: ".lyra-app-object-row-title" });
    expect(providerRow).toBeInTheDocument();
    expect(screen.queryByText("model-1")).not.toBeInTheDocument();

    // 点击进入服务商子页面
    fireEvent.click(providerRow);

    expect(screen.getByText("model-1")).toBeInTheDocument();
    expect(screen.getByText("model-9")).toBeInTheDocument();
    expect(screen.queryByText("model-10")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View All Models" }));

    expect(screen.getByText("model-10")).toBeInTheDocument();
    expect(screen.getByText("model-12")).toBeInTheDocument();
  });

});


test("MiMo discovery updates the visible route and saves the same profile without restoring the wrong endpoint", async () => {
  const base = createModel();
  const adjustment = {
    profileId: "mimo_token_plan_sgp", fromRouteId: "mimo_token_plan_sgp",
    fromLabel: "MiMo Token Plan (SGP, OpenAI)", toRouteId: "mimo",
    toLabel: "MiMo OpenAI", baseUrl: "https://api.xiaomimimo.com/v1",
  };
  const catalog = {
    ...base.agentModelCatalog!, routeAdjustment: adjustment,
    models: [...base.agentModelCatalog!.models, {
      ...base.agentModelCatalog!.models[0]!, id: "mimo_token_plan_sgp:mimo-new",
      model: "mimo-new", label: "mimo-new", provider: adjustment.profileId,
      providerId: adjustment.profileId, providerKey: adjustment.profileId,
      providerLabel: adjustment.toLabel, available: true,
    }],
  };
  const saveAgentProviderProfile = vi.fn(async (_request: unknown) => undefined);
  const saveAndDiscoverAgentProviderProfile = vi.fn(async () => catalog);
  const model = createModel({
    saveAgentProviderProfile, saveAndDiscoverAgentProviderProfile,
    // A different account already uses the target route. Never overwrite it.
    profiles: [...base.profiles, {
      ...base.profiles[0]!, id: "other-mimo-account", routeId: "mimo", label: "Other account",
    }],
  });
  const { rerender } = render(<SettingsAiModelsView labels={labels} model={model} openDialog={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
  fireEvent.change(screen.getByLabelText("Select provider"), { target: { value: "MiMo" } });
  fireEvent.click(screen.getByRole("button", { name: /MiMo Token Plan \(SGP, OpenAI\)/ }));
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test-only" } });
  fireEvent.click(screen.getByRole("button", { name: /Discover Models/ }));
  expect(await screen.findByRole("switch", { name: "mimo-new" })).toBeChecked();
  expect(screen.getByLabelText("Select provider")).toHaveValue("MiMo OpenAI");
  // A refreshed catalog must not clear the discovered selection or lose the profile ID.
  rerender(<SettingsAiModelsView labels={labels} model={{ ...model, agentModelCatalog: catalog }} openDialog={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
  await waitFor(() => expect(saveAgentProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
    profileName: adjustment.profileId, routeId: "mimo", baseUrl: adjustment.baseUrl,
    models: [{ id: "mimo-new", enabled: true }],
  })));
  expect(saveAgentProviderProfile.mock.calls[0]?.[0]).not.toHaveProperty("apiKey");
});


test.each([true, false])("saving a MiMo key directly verifies the selected profile (success=%s)", async (success) => {
  const base = createModel();
  const saveAgentProviderProfile = vi.fn(async () => undefined);
  const refreshAgentModelCatalog = vi.fn(async () => undefined);
  const saveAndDiscoverAgentProviderProfile = vi.fn(async () => success ? base.agentModelCatalog! : null);
  render(<SettingsAiModelsView labels={labels} openDialog={vi.fn()} model={createModel({
    saveAgentProviderProfile, refreshAgentModelCatalog, saveAndDiscoverAgentProviderProfile,
  })} />);
  fireEvent.click(screen.getByRole("button", { name: /Add Model/ }));
  fireEvent.change(screen.getByLabelText("Select provider"), { target: { value: "MiMo" } });
  fireEvent.click(screen.getByRole("button", { name: /MiMo Token Plan \(SGP, OpenAI\)/ }));
  fireEvent.change(screen.getByLabelText("API key"), { target: { value: "sk-test-only" } });
  fireEvent.click(screen.getByRole("button", { name: /Save profile/ }));
  await waitFor(() => expect(saveAndDiscoverAgentProviderProfile).toHaveBeenCalledWith(expect.objectContaining({
    profileName: "mimo_token_plan_sgp", routeId: "mimo_token_plan_sgp", apiKey: "sk-test-only",
  })));
  expect(saveAgentProviderProfile).not.toHaveBeenCalled();
  expect(refreshAgentModelCatalog).not.toHaveBeenCalled();
  if (success) {
    await waitFor(() => expect(screen.queryByLabelText("API key")).not.toBeInTheDocument());
  } else {
    expect(screen.getByLabelText("API key")).toHaveValue("sk-test-only");
  }
});
