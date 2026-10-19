import { ChevronRight, Pencil, Plus, RefreshCw, Save, Trash2 } from "@lyra/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type DragEvent as ReactDragEvent,
} from "react";

import {
  AppButton,
  AppIconButton,
  AppInput,
  AppObjectRow,
  AppSearchField,
  AppSelect,
  AppStatusMessage,
  AppSubPageBack,
  AppSwitch,
  AppTextarea
} from "@renderer/ui/components";
import type {
  AgentInstalledSkill,
  AgentMcpServer,
  AgentModelEntry,
  AgentProviderRouteEntry,
  AgentSkillStoreEntry,
} from "../../../shared/desktop-bridge";
import type { AgentProviderRouteAdjustment } from "../../../shared/agent";
import { AgentProviderBrandIcon } from "../agent-provider-brand-icon";
import { SubscriptionRouteLogin } from "./subscription-accounts";
import type { GlobalDialogModel } from "../global-dialog";
import { resolveElectronFilePath } from "@workbench/shell/electron-file-path";
import {
  SettingsAiModelCapabilitiesView,
  uniqueModelIds,
  type SettingsAiLabels,
  type SettingsAiModel,
  type SettingsAiRenderedModelEntry,
} from "./model-capabilities-view";
import {
  fuzzyScore,
  mcpDraftReady,
  mcpTransportText,
  useSettingsAiMcpViewModel,
  type McpEditDraft,
} from "./use-settings-ai-mcp-view-model";

type SettingsAiViewProps = {
  readonly labels: SettingsAiLabels;
  readonly model: SettingsAiModel;
};

type SettingsAiModelsViewProps = SettingsAiViewProps & {
  readonly openDialog: GlobalDialogModel["openDialog"];
};

type SettingsAiSkillsViewProps = SettingsAiViewProps;
type SettingsAiMcpViewProps = SettingsAiViewProps;
type McpTransportKind = AgentMcpServer["transport"]["kind"];

const MODEL_PREVIEW_LIMIT = 9;
const SKILL_PAGE_SIZE = 24;

const formatLabel = (template: string, values: Record<string, string | number>): string =>
  template.replace(/\{(\w+)\}/gu, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  );

type AgentConfigShape = {
  readonly provider?: {
    readonly defaultProvider?: string | null;
    readonly defaultModel?: string | null;
  };
  readonly providers?: Record<string, {
    readonly label?: string | null;
    readonly routeId?: string | null;
    readonly protocolId?: string | null;
    readonly protocolFamily?: string | null;
    readonly baseUrl?: string | null;
    readonly authHeader?: string | null;
    readonly defaultModel?: string | null;
    readonly models?: readonly {
      readonly id?: string;
      readonly supportsImageInput?: boolean;
      readonly supportsToolCalling?: boolean;
      readonly supportsStreaming?: boolean;
      readonly enabled?: boolean;
    }[];
  }>;
};

const asAgentConfig = (value: unknown): AgentConfigShape =>
  (value ?? {}) as AgentConfigShape;

type SettingsAiInputFieldProps = Omit<ComponentPropsWithoutRef<typeof AppInput>, "className" | "onChange" | "value"> & {
  readonly className?: string;
  readonly inputClassName?: string;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
};

const SettingsAiInputField = ({
  className,
  inputClassName,
  label,
  onValueChange,
  value,
  ...inputProps
}: SettingsAiInputFieldProps) => (
  <label className={["lyra-settings-ai-field", className ?? ""].filter(Boolean).join(" ")}>
    <span>{label}</span>
    <AppInput
      className={["lyra-settings-ai-input", inputClassName ?? ""].filter(Boolean).join(" ")}
      value={value}
      onChange={(event) => setValueFromEvent(event.target.value, onValueChange)}
      {...inputProps}
    />
  </label>
);

type SettingsAiTextareaFieldProps = Omit<ComponentPropsWithoutRef<typeof AppTextarea>, "className" | "onChange" | "value"> & {
  readonly className?: string;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly textareaClassName?: string;
  readonly value: string;
};

const SettingsAiTextareaField = ({
  className,
  label,
  onValueChange,
  textareaClassName,
  value,
  ...textareaProps
}: SettingsAiTextareaFieldProps) => (
  <label className={["lyra-settings-ai-field", className ?? ""].filter(Boolean).join(" ")}>
    <span>{label}</span>
    <AppTextarea
      className={["lyra-settings-ai-input lyra-settings-ai-input-multiline", textareaClassName ?? ""].filter(Boolean).join(" ")}
      value={value}
      onChange={(event) => setValueFromEvent(event.target.value, onValueChange)}
      {...textareaProps}
    />
  </label>
);

const setValueFromEvent = (
  value: string,
  onValueChange: (value: string) => void
): void => {
  onValueChange(value);
};

const normalizeProviderSearchText = (value: string): string =>
  value.trim().toLocaleLowerCase().replaceAll(/[\s._:/-]+/gu, "");

const PROVIDER_ROUTE_ALIASES: readonly {
  readonly match: (route: AgentProviderRouteEntry) => boolean;
  readonly values: readonly string[];
}[] = [
  {
    match: (route) => route.catalogSection === "custom" || route.id.includes("custom"),
    values: [
      "custom",
      "custom provider",
      "custom openai compatible",
      "openai compatible",
      "compatible",
      "manual endpoint",
      "自定义",
      "自定义服务商",
      "自定义提供方",
      "自定义模型",
      "自定义搜索",
      "自定义接口",
      "自定义端点",
      "兼容",
      "兼容 openai",
      "openai 兼容",
      "手动",
      "手动端点",
      "手动添加",
    ],
  },
  {
    match: (route) => route.catalogSection === "local" || route.localBackend !== null,
    values: [
      "local",
      "local model",
      "local provider",
      "本地",
      "本地模型",
      "本地服务",
      "本地服务商",
      "本地接口",
      "局域网",
    ],
  },
  {
    match: (route) => route.providerId.includes("ollama") || route.id.includes("ollama"),
    values: ["ollama", "llama", "llama3", "llama.cpp", "羊驼", "本地羊驼", "奥拉马"],
  },
  {
    match: (route) => route.providerId.includes("llama") || route.id.includes("llama"),
    values: ["llama", "llama.cpp", "羊驼", "本地推理"],
  },
  {
    match: (route) => route.providerId.includes("lmstudio") || route.id.includes("lmstudio"),
    values: ["lmstudio", "lm studio", "studio", "工作室", "本地工作室"],
  },
  {
    match: (route) => route.providerId.includes("vllm") || route.id.includes("vllm"),
    values: ["vllm", "v llm", "本地部署", "推理服务"],
  },
  {
    match: (route) => route.providerId === "mimo" || route.id.includes("mimo"),
    values: [
      "mimo",
      "xiaomi",
      "xiaomi mimo",
      "xiaomimimo",
      "mi mo",
      "小米",
      "小米 mimo",
      "小米模型",
      "小米妙想",
    ],
  },
  {
    match: (route) => route.providerId === "openai" || route.id.includes("openai"),
    values: ["openai", "chatgpt", "gpt", "开放人工智能", "开放ai"],
  },
  {
    match: (route) => route.providerId.includes("openrouter") || route.id.includes("openrouter"),
    values: ["openrouter", "open router", "router", "模型路由", "开放路由"],
  },
  {
    match: (route) => route.providerId.includes("google") || route.label.toLocaleLowerCase().includes("gemini"),
    values: ["google", "gemini", "谷歌", "双子", "谷歌模型"],
  },
  {
    match: (route) => route.providerId.includes("anthropic") || route.label.toLocaleLowerCase().includes("claude"),
    values: ["anthropic", "claude", "克劳德"],
  },
  {
    match: (route) => route.providerId.includes("qwen") || route.label.toLocaleLowerCase().includes("qwen"),
    values: ["qwen", "tongyi", "通义", "千问", "阿里"],
  },
  {
    match: (route) => route.providerId.includes("deepseek") || route.label.toLocaleLowerCase().includes("deepseek"),
    values: ["deepseek", "deep seek", "深度求索", "深度搜索"],
  },
  {
    match: (route) => route.providerId.includes("zhipu") || route.label.toLocaleLowerCase().includes("glm"),
    values: ["glm", "zai", "z.ai", "zhipu", "bigmodel", "智谱", "智谱ai", "智谱 ai"],
  },
  {
    match: (route) => route.providerId.includes("moonshot") || route.label.toLocaleLowerCase().includes("kimi"),
    values: ["moonshot", "kimi", "月之暗面", "月之暗面 kimi"],
  },
  {
    match: (route) => route.providerId.includes("nvidia") || route.label.toLocaleLowerCase().includes("nvidia"),
    values: ["nvidia", "nim", "nvidia nim", "英伟达"],
  },
  {
    match: (route) => route.providerId === "amd" || route.label.toLocaleLowerCase().includes("radeon"),
    values: ["amd", "radeon", "radeon cloud", "token factory", "超威"],
  },
  {
    match: (route) => route.providerId === "bai" || route.label.toLocaleLowerCase().includes("b.ai"),
    values: ["bai", "b.ai", "b ai"],
  },
  {
    match: (route) => route.providerId === "atria" || route.label.toLocaleLowerCase().includes("atria"),
    values: ["atria", "atria asi", "dawn", "internlm", "书生"],
  },
  {
    match: (route) => route.providerId === "intern",
    values: ["intern", "internlm", "inkstone", "tokenplan", "书生", "书生端砚", "端砚", "墨点"],
  },
  {
    match: (route) => route.providerId === "poolside" || route.label.toLocaleLowerCase().includes("poolside") || route.label.toLocaleLowerCase().includes("laguna"),
    values: ["poolside", "laguna", "laguna s"],
  },
  {
    match: (route) => route.providerId.includes("bedrock") || route.label.toLocaleLowerCase().includes("bedrock"),
    values: ["bedrock", "aws", "amazon", "亚马逊", "云模型"],
  },
  {
    match: (route) => route.providerId.includes("baidu") || route.label.toLocaleLowerCase().includes("wenxin"),
    values: ["baidu", "wenxin", "文心", "百度", "百度文心"],
  },
  {
    match: (route) => route.providerId.includes("doubao") || route.providerId.includes("volcengine"),
    values: ["doubao", "volcengine", "豆包", "火山", "火山引擎"],
  },
  {
    match: (route) => route.providerId.includes("spark") || route.providerId.includes("iflytek"),
    values: ["spark", "iflytek", "讯飞", "星火", "讯飞星火"],
  },
  {
    match: (route) => route.providerId.includes("stepfun") || route.label.toLocaleLowerCase().includes("stepfun"),
    values: ["stepfun", "step", "阶跃", "阶跃星辰"],
  },
  {
    match: (route) => route.providerId.includes("sensenova") || route.label.toLocaleLowerCase().includes("sensenova"),
    values: ["sensenova", "sense nova", "商汤", "商汤日日新"],
  },
  {
    match: (route) => route.providerId.includes("yi") || route.label.toLocaleLowerCase().includes("01.ai"),
    values: ["yi", "01ai", "01.ai", "零一", "零一万物"],
  },
  {
    match: (route) => route.providerId.includes("xuanyuan") || route.label.toLocaleLowerCase().includes("xuanyuan"),
    values: ["xuanyuan", "轩辕", "度小满"],
  },
  {
    match: (route) => route.catalogSection === "subscription" || route.authKind.startsWith("subscription"),
    values: ["subscription", "订阅", "账号", "登录"],
  },
  {
    match: (route) => route.id === "claude_subscription" || route.label.toLocaleLowerCase().includes("claude"),
    values: ["claude", "anthropic", "克劳德"],
  },
  {
    match: (route) => route.id === "chatgpt_codex",
    values: ["chatgpt", "codex", "openai", "gpt"],
  },
  {
    match: (route) => route.id.startsWith("github_copilot"),
    values: ["copilot", "github"],
  },
  {
    match: (route) => route.id === "gemini_code_assist",
    values: ["gemini", "google", "code assist"],
  },
  {
    match: (route) => route.id === "grok_build" || route.id === "xai_oauth",
    values: ["grok", "xai", "grok build"],
  },
  {
    match: (route) => route.id === "qwen_portal",
    values: ["qwen", "通义", "千问"],
  },
];

const providerRouteSearchValues = (route: AgentProviderRouteEntry): readonly string[] =>
  [
    route.label,
    route.description,
    route.providerId,
    route.id,
    route.protocolId,
    route.protocolFamily,
    route.catalogSection,
    route.defaultBaseUrl,
    ...PROVIDER_ROUTE_ALIASES.flatMap((entry) => entry.match(route) ? entry.values : []),
  ].flatMap((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length === 0 ? [] : [trimmed];
  });

const providerRouteScore = (route: AgentProviderRouteEntry, query: string, index: number): number => {
  const normalizedQuery = normalizeProviderSearchText(query);
  if (normalizedQuery.length === 0) {
    return 120 - index;
  }

  return providerRouteSearchValues(route).reduce((bestScore, value) => {
    const normalizedValue = normalizeProviderSearchText(value);
    if (normalizedValue.length === 0) {
      return bestScore;
    }
    let score = fuzzyScore(normalizedValue, normalizedQuery);
    if (normalizedValue === normalizedQuery) {
      score += 1000;
    } else if (normalizedValue.startsWith(normalizedQuery)) {
      score += 760;
    } else {
      const containsAt = normalizedValue.indexOf(normalizedQuery);
      if (containsAt >= 0) {
        score += 520 - Math.min(containsAt, 80);
      }
      const queryContainsAt = normalizedQuery.indexOf(normalizedValue);
      if (normalizedValue.length >= 2 && queryContainsAt >= 0) {
        score += 420 - Math.min(queryContainsAt, 80);
      }
    }
    return Math.max(bestScore, score);
  }, Number.NEGATIVE_INFINITY);
};

const modelProviderKeys = (entry: SettingsAiRenderedModelEntry): readonly string[] =>
  [
    entry.providerKey,
    entry.provider,
    entry.providerId,
  ].flatMap((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length === 0 ? [] : [trimmed];
  });

type AgentProviderConfigShape = NonNullable<AgentConfigShape["providers"]>[string];

const configForModelEntry = (
  entry: SettingsAiRenderedModelEntry,
  config: AgentConfigShape
): AgentProviderConfigShape | null => {
  const providers = config.providers ?? {};
  return modelProviderKeys(entry)
    .map((key) => providers[key])
    .find((provider): provider is AgentProviderConfigShape => provider !== undefined)
    ?? null;
};

const modelMatchesSelectedProvider = (
  entry: AgentModelEntry,
  profileName: string
): boolean => {
  const providerKeys = [
    entry.providerKey,
    entry.provider,
    entry.providerId,
  ].map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return providerKeys.some((value) => value === profileName);
};

const modelEntryIdentity = (entry: AgentModelEntry): string =>
  [
    entry.providerKey,
    entry.provider,
    entry.providerId,
    entry.routeId,
    entry.model,
  ].map((value) => value?.trim() ?? "").join("\u0000");

const modelIdsFromEntries = (entries: readonly AgentModelEntry[]): string[] =>
  uniqueModelIds([
    ...entries
      .map((entry) => entry.model.trim())
      .filter((id) => id.length > 0),
  ]);

const discoveredModelIdsFromCatalog = (
  entries: readonly AgentModelEntry[],
  profileName: string,
  previousEntries: readonly AgentModelEntry[]
): string[] => {
  const matchedEntries = entries.filter((entry) =>
    !entry.free && modelMatchesSelectedProvider(entry, profileName)
  );
  if (matchedEntries.length > 0) {
    return modelIdsFromEntries(matchedEntries);
  }

  const previousKeys = new Set(previousEntries.map(modelEntryIdentity));
  return modelIdsFromEntries(
    entries.filter((entry) =>
      !entry.free && !previousKeys.has(modelEntryIdentity(entry))
    )
  );
};

const isCurrentModelEntry = (
  entry: SettingsAiRenderedModelEntry,
  model: SettingsAiModel,
  config: AgentConfigShape
): boolean => {
  const catalog = model.agentModelCatalog ?? null;
  const currentModel =
    catalog?.currentModel
    ?? catalog?.defaultModel
    ?? config.provider?.defaultModel
    ?? "";
  if (entry.model !== currentModel) {
    return false;
  }

  const currentProvider =
    catalog?.currentProvider
    ?? catalog?.defaultProvider
    ?? model.defaultProfileId
    ?? config.provider?.defaultProvider
    ?? "";
  if (currentProvider.length === 0) {
    return true;
  }
  return modelProviderKeys(entry).includes(currentProvider);
};

const formatSettingsAiLabel = (
  template: string,
  replacements: Record<string, string>
): string =>
  Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, value),
    template
  );

const skillSearchText = (skill: AgentInstalledSkill | AgentSkillStoreEntry): string =>
  [
    skill.id,
    skill.name,
    skill.version ?? "",
    skill.description ?? "",
    "sourceRegistry" in skill ? skill.sourceRegistry ?? "" : "",
    ...(skill.permissions ?? []),
    ...(skill.toolPaths ?? []),
  ].join(" ").toLocaleLowerCase();

const compareSkillName = (
  left: AgentInstalledSkill | AgentSkillStoreEntry,
  right: AgentInstalledSkill | AgentSkillStoreEntry,
): number => left.name.localeCompare(right.name);

const filterAndSortSkills = <T extends AgentInstalledSkill | AgentSkillStoreEntry>(
  skills: readonly T[],
  query: string,
): T[] => {
  if (query.length === 0) return [...skills];
  return skills
    .map((skill) => ({ skill, score: fuzzyScore(skillSearchText(skill), query) }))
    .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
    .sort((left, right) => right.score - left.score || compareSkillName(left.skill, right.skill))
    .map((entry) => entry.skill);
};

const installedStoreSkillIds = (skills: readonly AgentInstalledSkill[]): ReadonlySet<string> =>
  new Set(skills.flatMap((skill) => {
    if (skill.source.kind === "store") {
      return [skill.id, skill.source.skillId];
    }
    return [skill.id];
  }));

const shouldRefreshSkillSearch = (query: string): boolean => {
  const input = query.trim();
  if (input.length === 0) return true;
  if (input.length < 2) return false;
  return !(
    input.startsWith("/") ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("file:") ||
    input.startsWith("git@") ||
    /^https?:\/\//iu.test(input)
  );
};

const renderSkillMeta = (
  labels: SettingsAiLabels,
  permissions: readonly string[],
  toolPaths: readonly string[]
) => (
  <div className="lyra-settings-ai-skill-meta">
    {permissions.length === 0 ? null : (
      <span>
        <strong>{labels.skillsPermissionsLabel}</strong>
        {permissions.join(", ")}
      </span>
    )}
    {toolPaths.length === 0 ? null : (
      <span>
        <strong>{labels.skillsToolsLabel}</strong>
        {toolPaths.join(", ")}
      </span>
    )}
  </div>
);

type ParsedSkillInstallInput =
  | {
    readonly kind: "git";
    readonly ref: string | null;
    readonly subdir: string | null;
    readonly url: string;
  }
  | {
    readonly kind: "local";
    readonly sourcePath: string;
  };

const decodeSkillPathPart = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const trimNullable = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? null : trimmed;
};

const skillUrlParam = (url: URL, key: string): string | null => {
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = hash.includes("=") ? new URLSearchParams(hash) : null;
  return trimNullable(url.searchParams.get(key) ?? hashParams?.get(key) ?? null);
};

const stripSkillUrlMetadata = (url: URL): string => {
  const clone = new URL(url.href);
  clone.search = "";
  clone.hash = "";
  return clone.toString();
};

const parseSkillInstallInput = (value: string): ParsedSkillInstallInput | null => {
  const input = value.trim().replace(/^['"]|['"]$/gu, "");
  if (input.length === 0) return null;

  if (/^[\w.-]+\/[\w.-]+$/u.test(input)) {
    const parts = input.split("/");
    const owner = parts[0] ?? "";
    const repo = parts[1] ?? "";
    return {
      kind: "git",
      url: `https://github.com/${owner}/${repo.replace(/\.git$/u, "")}.git`,
      ref: null,
      subdir: null,
    };
  }

  const urlInput = input.startsWith("github.com/") ? `https://${input}` : input;
  try {
    const url = new URL(urlInput);
    if (url.protocol === "file:") {
      return {
        kind: "local",
        sourcePath: decodeSkillPathPart(url.pathname),
      };
    }
    if (url.hostname === "github.com" || url.hostname.endsWith(".github.com")) {
      const parts = url.pathname.split("/").filter(Boolean).map(decodeSkillPathPart);
      const owner = parts[0] ?? "";
      const repo = (parts[1] ?? "").replace(/\.git$/u, "");
      if (owner.length > 0 && repo.length > 0) {
        const sourceIndex = parts.findIndex((part) => part === "tree" || part === "blob");
        const ref = sourceIndex >= 0
          ? trimNullable(parts[sourceIndex + 1])
          : skillUrlParam(url, "ref");
        const subdirParts = sourceIndex >= 0 ? parts.slice(sourceIndex + 2) : [];
        if (subdirParts.at(-1)?.toLocaleLowerCase() === "skill.md") {
          subdirParts.pop();
        }
        const subdir = sourceIndex >= 0
          ? trimNullable(subdirParts.join("/"))
          : skillUrlParam(url, "subdir") ?? skillUrlParam(url, "path");
        return {
          kind: "git",
          url: `https://github.com/${owner}/${repo}.git`,
          ref,
          subdir,
        };
      }
    }

    return {
      kind: "git",
      url: stripSkillUrlMetadata(url),
      ref: skillUrlParam(url, "ref"),
      subdir: skillUrlParam(url, "subdir") ?? skillUrlParam(url, "path"),
    };
  } catch {
    if (/^(git@|ssh:\/\/|git:\/\/)/iu.test(input) || /\.git(?:$|[?#/])/iu.test(input)) {
      return {
        kind: "git",
        url: input,
        ref: null,
        subdir: null,
      };
    }
  }

  return {
    kind: "local",
    sourcePath: input,
  };
};

type SettingsAiSkillCardProps = {
  readonly labels: SettingsAiLabels;
  readonly onToggle: (skill: AgentInstalledSkill, active: boolean) => void;
  readonly onUninstall: (skill: AgentInstalledSkill) => void;
  readonly pending: boolean;
  readonly skill: AgentInstalledSkill;
};

const SettingsAiSkillCard = ({
  labels,
  onToggle,
  onUninstall,
  pending,
  skill,
}: SettingsAiSkillCardProps) => (
  <div className="lyra-settings-ai-skill-card" data-pending={pending ? "true" : undefined}>
    <div className="lyra-settings-ai-skill-main">
      <div className="lyra-settings-ai-skill-title-row">
        <div>
          <h3>{skill.name}</h3>
          <p>{skill.id} · {skill.version}</p>
        </div>
      </div>
      {skill.description.length === 0 ? null : (
        <p className="lyra-settings-ai-skill-description">{skill.description}</p>
      )}
      {skill.source.kind === "local" ? <p className="lyra-settings-ai-skill-description">{skill.source.path}</p> : null}
      {renderSkillMeta(labels, skill.permissions, skill.toolPaths)}
    </div>
    <div className="lyra-settings-ai-skill-actions">
      <AppIconButton
        aria-label={`${labels.skillsUninstall}: ${skill.name}`}
        title={labels.skillsUninstall}
        tone="danger"
        className="lyra-settings-ai-row-delete"
        onClick={() => {
          onUninstall(skill);
        }}
      >
        <Trash2 size={14} aria-hidden="true" />
      </AppIconButton>
      <AppSwitch
        checked={skill.active}
        aria-label={skill.name}
        onCheckedChange={(active) => {
          onToggle(skill, active);
        }}
      />
    </div>
  </div>
);

type SettingsAiStoreSkillCardProps = {
  readonly entry: AgentSkillStoreEntry;
  readonly labels: SettingsAiLabels;
  readonly onInstall: (entry: AgentSkillStoreEntry) => void;
  readonly pending: boolean;
};

const SettingsAiStoreSkillCard = ({
  entry,
  labels,
  onInstall,
  pending,
}: SettingsAiStoreSkillCardProps) => (
  <div className="lyra-settings-ai-skill-card" data-pending={pending ? "true" : undefined}>
    <div className="lyra-settings-ai-skill-main">
      <div className="lyra-settings-ai-skill-title-row">
        <div>
          <h3>{entry.name}</h3>
          <p>
            {[entry.sourceRegistry ?? entry.id, entry.version ?? ""].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      {entry.description === undefined || entry.description.length === 0 ? null : (
        <p className="lyra-settings-ai-skill-description">{entry.description}</p>
      )}
      {renderSkillMeta(labels, entry.permissions ?? [], entry.toolPaths ?? [])}
    </div>
    <div className="lyra-settings-ai-skill-actions">
      <AppSwitch
        checked={false}
        aria-label={entry.name}
        onCheckedChange={(checked) => {
          if (!checked) return;
          onInstall(entry);
        }}
      />
    </div>
  </div>
);

const mcpStateLabel = (labels: SettingsAiLabels, state: string): string => {
  if (state === "connected") return labels.mcpConnected;
  if (state === "failed") return labels.mcpFailed;
  return labels.mcpDisconnected;
};

type SettingsAiMcpServerCardProps = {
  readonly labels: SettingsAiLabels;
  readonly onEdit: (server: AgentMcpServer) => void;
  readonly onRemove: (server: AgentMcpServer) => void;
  readonly onToggle: (server: AgentMcpServer, active: boolean) => void;
  readonly pending: boolean;
  readonly server: AgentMcpServer;
};

const SettingsAiMcpServerCard = ({
  labels,
  onEdit,
  onRemove,
  onToggle,
  pending,
  server,
}: SettingsAiMcpServerCardProps) => {
  const active = server.enabled;
  const baseUrl = server.transport.kind === "stdio" ? null : server.transport.url;
  const toolCount = server.toolCount ?? server.tools?.length ?? 0;
  return (
    <div className="lyra-settings-ai-skill-card" data-pending={pending ? "true" : undefined}>
      <div className="lyra-settings-ai-skill-main">
        <div className="lyra-settings-ai-skill-title-row">
          <div className="lyra-settings-ai-mcp-title">
            <span className="lyra-settings-ai-mcp-icon" aria-hidden="true">
              <AgentProviderBrandIcon
                baseUrl={baseUrl}
                label={server.name}
                modelId={mcpTransportText(server)}
                provider={server.id}
                providerId={server.id}
                resolveSiteIcon={baseUrl !== null}
                size={16}
              />
            </span>
            <span>
              <h3>{server.name}</h3>
              <p>{server.id} · {mcpStateLabel(labels, server.state)}{server.sourceLabel ? ` · ${server.sourceLabel}` : ""}</p>
            </span>
          </div>
        </div>
        <p className="lyra-settings-ai-skill-description">{mcpTransportText(server)}</p>
        <div className="lyra-settings-ai-skill-meta">
          <span><strong>{labels.mcpToolsLabel}</strong>{toolCount}</span>
          {server.lastError === undefined || server.lastError === null || server.lastError.length === 0 ? null : (
            <span>{server.lastError}</span>
          )}
        </div>
      </div>
      <div className="lyra-settings-ai-skill-actions">
        <AppIconButton
          aria-label={`${labels.mcpEdit}: ${server.name}`}
          title={labels.mcpEdit}
          className="lyra-settings-ai-row-action"
          onClick={() => {
            onEdit(server);
          }}
        >
          <Pencil size={14} aria-hidden="true" />
        </AppIconButton>
        <AppIconButton
          aria-label={`${labels.mcpRemove}: ${server.name}`}
          title={labels.mcpRemove}
          tone="danger"
          className="lyra-settings-ai-row-delete"
          onClick={() => {
            onRemove(server);
          }}
        >
          <Trash2 size={14} aria-hidden="true" />
        </AppIconButton>
        <AppSwitch
          checked={active}
          aria-label={server.name}
          onCheckedChange={(checked) => {
            onToggle(server, checked);
          }}
        />
      </div>
    </div>
  );
};

type SettingsAiMcpEditorProps = {
  readonly draft: McpEditDraft;
  readonly labels: SettingsAiLabels;
  readonly onCancel: () => void;
  readonly onDraftChange: (draft: McpEditDraft) => void;
  readonly onSave: () => void;
};

const SettingsAiMcpEditor = ({
  draft,
  labels,
  onCancel,
  onDraftChange,
  onSave,
}: SettingsAiMcpEditorProps) => {
  const setDraftValue = <K extends keyof McpEditDraft>(key: K, value: McpEditDraft[K]) => {
    onDraftChange({ ...draft, [key]: value });
  };
  const transportOptions = useMemo(() => ([
    { label: "stdio", value: "stdio" },
    { label: "HTTP", value: "http" },
    { label: "SSE", value: "sse" },
  ] as const), []);

  return (
    <form
      className="lyra-settings-ai-mcp-editor"
      onSubmit={(event) => {
        event.preventDefault();
        if (mcpDraftReady(draft)) {
          onSave();
        }
      }}
    >
      <div className="lyra-settings-ai-mcp-editor-grid">
        <SettingsAiInputField
          label={labels.mcpNameLabel}
          value={draft.name}
          onValueChange={(value) => setDraftValue("name", value)}
        />
        <label className="lyra-settings-ai-field">
          <span>{labels.mcpTransportLabel}</span>
          <AppSelect<McpTransportKind>
            ariaLabel={labels.mcpTransportLabel}
            className="lyra-settings-ai-select"
            value={draft.transport}
            options={transportOptions}
            onValueChange={(value) => setDraftValue("transport", value)}
          />
        </label>
        {draft.transport === "stdio" ? (
          <>
            <SettingsAiInputField
              label={labels.mcpCommandLabel}
              value={draft.command}
              onValueChange={(value) => setDraftValue("command", value)}
            />
            <SettingsAiInputField
              label={labels.mcpArgsLabel}
              value={draft.args}
              onValueChange={(value) => setDraftValue("args", value)}
            />
            <SettingsAiTextareaField
              label={labels.mcpEnvLabel}
              value={draft.env}
              onValueChange={(value) => setDraftValue("env", value)}
              rows={3}
            />
          </>
        ) : (
          <>
            <SettingsAiInputField
              label={labels.mcpUrlLabel}
              value={draft.url}
              onValueChange={(value) => setDraftValue("url", value)}
            />
            <SettingsAiTextareaField
              label={labels.mcpHeadersLabel}
              value={draft.headers}
              onValueChange={(value) => setDraftValue("headers", value)}
              rows={3}
            />
          </>
        )}
      </div>
      <div className="lyra-settings-ai-mcp-editor-actions">
        <AppButton type="button" variant="ghost" size="sm" onClick={onCancel}>
          {labels.cancel}
        </AppButton>
        <AppButton
          type="submit"
          variant="default"
          size="sm"
          disabled={!mcpDraftReady(draft)}
        >
          <Save size={14} aria-hidden="true" />
          {labels.mcpSave}
        </AppButton>
      </div>
    </form>
  );
};

export const SettingsAiMcpView = ({ labels, model }: SettingsAiMcpViewProps) => {
  const {
    addServer,
    cancelEditServer,
    editServer,
    editingDraft,
    editingServerId,
    filteredServers,
    pendingIds,
    query,
    removeServer,
    saveEditedServer,
    servers,
    setEditingDraft,
    setQuery,
    toggleServer,
  } = useSettingsAiMcpViewModel(model);

  return (
    <section className="lyra-settings-ai-stack lyra-settings-ai-skills-page">
      <div className="lyra-settings-ai-models-panel">
        <form
          className="lyra-settings-ai-page-header"
          onSubmit={(event) => {
            event.preventDefault();
            addServer();
          }}
        >
          <AppSearchField
            ariaLabel={labels.mcpTitle}
            className="lyra-settings-ai-model-search"
            placeholder={labels.mcpSearchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <AppButton
            type="submit"
            variant="default"
            size="sm"
            className="lyra-settings-ai-action lyra-settings-ai-action-primary"
            disabled={query.trim().length === 0}
          >
            {labels.mcpAddServer}
          </AppButton>
        </form>

        {model.errorMessage === null ? null : (
          <AppStatusMessage className="lyra-settings-ai-error" tone="error" role="alert">
            {model.errorMessage}
          </AppStatusMessage>
        )}

        {filteredServers.length === 0 ? (
          <div className="lyra-settings-ai-empty-panel" role="status">
            <strong>{servers.length === 0 ? labels.mcpEmptyTitle : labels.mcpDisconnected}</strong>
            <span>{labels.mcpEmptyDescription}</span>
          </div>
        ) : (
          <div className="lyra-settings-ai-skill-list">
            {filteredServers.map((server) => (
              <div className="lyra-settings-ai-mcp-item" key={server.id}>
                <SettingsAiMcpServerCard
                  labels={labels}
                  onEdit={editServer}
                  onRemove={removeServer}
                  onToggle={toggleServer}
                  pending={pendingIds.has(`server:${server.id}`)}
                  server={server}
                />
                {editingServerId === server.id && editingDraft !== null ? (
                  <SettingsAiMcpEditor
                    draft={editingDraft}
                    labels={labels}
                    onCancel={cancelEditServer}
                    onDraftChange={setEditingDraft}
                    onSave={() => saveEditedServer(server)}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export const SettingsAiSkillsView = ({ labels, model }: SettingsAiSkillsViewProps) => {
  const [query, setQuery] = useState("");
  const [visibleSkillLimit, setVisibleSkillLimit] = useState(SKILL_PAGE_SIZE);
  const [isSearchingSkills, setIsSearchingSkills] = useState(false);
  const [isLoadingMoreSkills, setIsLoadingMoreSkills] = useState(false);
  const [pendingSkillIds, setPendingSkillIds] = useState<ReadonlySet<string>>(() => new Set());
  const [skillDropActive, setSkillDropActive] = useState(false);
  const searchSequenceRef = useRef(0);
  const skillDropDepthRef = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const catalog = model.agentSkillCatalog ?? null;
  const skills = catalog?.skills ?? [];
  const store = catalog?.store ?? null;
  const installedSkillIds = useMemo(() => installedStoreSkillIds(skills), [skills]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const refreshSkillStore = model.refreshAgentSkillStore;

  const runSkillOperation = useCallback(async (
    pendingId: string,
    operation: () => Promise<void> | void,
  ): Promise<void> => {
    setPendingSkillIds((current) => new Set(current).add(pendingId));
    try {
      await operation();
    } finally {
      setPendingSkillIds((current) => {
        const next = new Set(current);
        next.delete(pendingId);
        return next;
      });
    }
  }, []);

  const installSkillValue = useCallback(async (value: string): Promise<void> => {
    const parsed = parseSkillInstallInput(value);
    if (parsed === null) return;
    setQuery(value);
    await runSkillOperation("input", async () => {
      if (parsed.kind === "git") {
        await model.installAgentSkillFromGit?.({
          url: parsed.url,
          ref: parsed.ref,
          subdir: parsed.subdir,
        });
      } else {
        await model.installAgentSkillFromLocal?.({ sourcePath: parsed.sourcePath });
      }
      setQuery("");
    });
  }, [
    model.installAgentSkillFromGit,
    model.installAgentSkillFromLocal,
    runSkillOperation,
  ]);

  useEffect(() => {
    setVisibleSkillLimit(SKILL_PAGE_SIZE);
    if (!shouldRefreshSkillSearch(query) || refreshSkillStore === undefined) {
      setIsSearchingSkills(false);
      return;
    }
    const sequence = searchSequenceRef.current + 1;
    searchSequenceRef.current = sequence;
    setIsSearchingSkills(true);
    const timer = window.setTimeout(() => {
      void refreshSkillStore({ query: query.trim(), offset: 0, append: false })
        .finally(() => {
          if (searchSequenceRef.current === sequence) {
            setIsSearchingSkills(false);
          }
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, refreshSkillStore]);

  const filteredSkills = filterAndSortSkills(skills, normalizedQuery);
  const storeSkills = store?.index?.skills ?? [];
  const filteredStoreSkills = filterAndSortSkills(storeSkills, normalizedQuery);
  const allVisibleStoreSkills = filteredStoreSkills.filter((entry) => !installedSkillIds.has(entry.id));
  const visibleStoreSkills = allVisibleStoreSkills.slice(0, visibleSkillLimit);
  const hasVisibleSkills = filteredSkills.length > 0 || visibleStoreSkills.length > 0;
  const hasMoreLocalStoreSkills = allVisibleStoreSkills.length > visibleStoreSkills.length;
  const hasMoreRemoteStoreSkills = store?.index?.hasMore === true;

  const loadMoreSkills = useCallback(async (): Promise<void> => {
    if (isLoadingMoreSkills) return;
    if (hasMoreLocalStoreSkills) {
      setVisibleSkillLimit((current) => current + SKILL_PAGE_SIZE);
      return;
    }
    if (!hasMoreRemoteStoreSkills || refreshSkillStore === undefined || !shouldRefreshSkillSearch(query)) {
      return;
    }
    setIsLoadingMoreSkills(true);
    try {
      await refreshSkillStore({
        query: query.trim(),
        offset: storeSkills.length,
        append: true,
      });
    } finally {
      setIsLoadingMoreSkills(false);
    }
  }, [
    hasMoreLocalStoreSkills,
    hasMoreRemoteStoreSkills,
    isLoadingMoreSkills,
    query,
    refreshSkillStore,
    storeSkills.length,
  ]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (target === null || !hasVisibleSkills || (!hasMoreLocalStoreSkills && !hasMoreRemoteStoreSkills)) {
      return;
    }
    if (typeof window.IntersectionObserver !== "function") {
      return;
    }
    const observer = new window.IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        void loadMoreSkills();
      }
    }, { rootMargin: "160px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMoreLocalStoreSkills, hasMoreRemoteStoreSkills, hasVisibleSkills, loadMoreSkills]);

  const installSkillInput = (): void => {
    void installSkillValue(query);
  };

  const toggleInstalledSkill = useCallback((skill: AgentInstalledSkill, active: boolean): void => {
    void runSkillOperation(`skill:${skill.id}`, async () => {
      if (active) {
        await model.activateAgentSkill?.({ skillId: skill.id });
      } else {
        await model.deactivateAgentSkill?.({ skillId: skill.id });
      }
    });
  }, [model.activateAgentSkill, model.deactivateAgentSkill, runSkillOperation]);

  const uninstallInstalledSkill = useCallback((skill: AgentInstalledSkill): void => {
    void runSkillOperation(`skill:${skill.id}`, async () => {
      await model.uninstallAgentSkill?.({ skillId: skill.id });
    });
  }, [model.uninstallAgentSkill, runSkillOperation]);

  const installStoreSkill = useCallback((entry: AgentSkillStoreEntry): void => {
    void runSkillOperation(`store:${entry.id}`, async () => {
      await model.installAgentSkillFromStore?.({ skillId: entry.id });
    });
  }, [model.installAgentSkillFromStore, runSkillOperation]);

  const resolveDroppedSkillInput = (event: ReactDragEvent<HTMLElement>): string | null => {
    for (const file of Array.from(event.dataTransfer.files)) {
      const path = resolveElectronFilePath(file);
      if (path !== null) return path;
    }
    return (event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain")).trim() || null;
  };

  const skillDragLooksInstallable = (event: ReactDragEvent<HTMLElement>): boolean =>
    event.dataTransfer.files.length > 0
    || Array.from(event.dataTransfer.types).includes("text/uri-list")
    || Array.from(event.dataTransfer.types).includes("text/plain");

  const handleSkillDragEnter = (event: ReactDragEvent<HTMLFormElement>): void => {
    if (!skillDragLooksInstallable(event)) return;
    event.preventDefault();
    skillDropDepthRef.current += 1;
    setSkillDropActive(true);
  };

  const handleSkillDragOver = (event: ReactDragEvent<HTMLFormElement>): void => {
    if (!skillDragLooksInstallable(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setSkillDropActive(true);
  };

  const handleSkillDragLeave = (event: ReactDragEvent<HTMLFormElement>): void => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) return;
    skillDropDepthRef.current = Math.max(0, skillDropDepthRef.current - 1);
    if (skillDropDepthRef.current === 0) {
      setSkillDropActive(false);
    }
  };

  const handleSkillDrop = (event: ReactDragEvent<HTMLFormElement>): void => {
    if (!skillDragLooksInstallable(event)) return;
    event.preventDefault();
    skillDropDepthRef.current = 0;
    setSkillDropActive(false);
    const input = resolveDroppedSkillInput(event);
    if (input !== null) {
      void installSkillValue(input);
    }
  };

  return (
    <section className="lyra-settings-ai-stack lyra-settings-ai-skills-page">
      <div className="lyra-settings-ai-models-panel">
        <form
          className="lyra-settings-ai-page-header"
          data-drop-active={skillDropActive ? "true" : undefined}
          onDragEnter={handleSkillDragEnter}
          onDragOver={handleSkillDragOver}
          onDragLeave={handleSkillDragLeave}
          onDrop={handleSkillDrop}
          onSubmit={(event) => {
            event.preventDefault();
            installSkillInput();
          }}
        >
          <AppSearchField
            ariaLabel={labels.skillsTitle}
            className="lyra-settings-ai-model-search"
            placeholder={labels.skillsSearchPlaceholder}
            value={query}
            onValueChange={setQuery}
          />
          <AppButton
            type="submit"
            variant="default"
            size="sm"
            className="lyra-settings-ai-action lyra-settings-ai-action-primary"
            disabled={query.trim().length === 0 || pendingSkillIds.has("input")}
          >
            {labels.skillsAddSkill}
          </AppButton>
        </form>

        {model.errorMessage === null ? null : (
          <AppStatusMessage className="lyra-settings-ai-error" tone="error" role="alert">
            {model.errorMessage}
          </AppStatusMessage>
        )}

        {isSearchingSkills && !hasVisibleSkills ? (
          <div className="lyra-settings-ai-empty-panel" role="status">
            <span>{labels.skillsEmptyDescription}</span>
          </div>
        ) : !hasVisibleSkills ? (
          <div className="lyra-settings-ai-empty-panel" role="status">
            <strong>{labels.skillsEmptyTitle}</strong>
            <span>{store?.lastError ?? labels.skillsEmptyDescription}</span>
          </div>
        ) : (
          <div className="lyra-settings-ai-skill-list">

            {filteredSkills.map((skill) => (
              <SettingsAiSkillCard
                key={skill.id}
                labels={labels}
                onToggle={toggleInstalledSkill}
                onUninstall={uninstallInstalledSkill}
                pending={pendingSkillIds.has(`skill:${skill.id}`)}
                skill={skill}
              />
            ))}
            {visibleStoreSkills.map((entry) => (
              <SettingsAiStoreSkillCard
                key={entry.id}
                entry={entry}
                labels={labels}
                onInstall={installStoreSkill}
                pending={pendingSkillIds.has(`store:${entry.id}`)}
              />
            ))}
            <div ref={loadMoreRef} className="lyra-settings-ai-skill-load-more" aria-hidden="true" />
            {isLoadingMoreSkills ? (
              <div className="lyra-settings-ai-skill-status" role="status">
                {labels.skillsLoadingMore}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
};

export const SettingsAiModelsView = ({ labels, model, openDialog }: SettingsAiModelsViewProps) => {
  const [query, setQuery] = useState("");
  const [showAllModels, setShowAllModels] = useState(false);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const [drilledProviderKey, setDrilledProviderKey] = useState<string | null>(null);
  const [drilledModelId, setDrilledModelId] = useState<string | null>(null);
  const [providerQuery, setProviderQuery] = useState("");
  const [selectedProviderRouteId, setSelectedProviderRouteId] = useState("");
  const [routeAdjustment, setRouteAdjustment] = useState<AgentProviderRouteAdjustment | null>(null);
  const [providerBaseUrl, setProviderBaseUrl] = useState("");
  const [providerApiKey, setProviderApiKey] = useState("");
  const [discoveredModelIds, setDiscoveredModelIds] = useState<readonly string[]>([]);
  const [isAddingCustomModel, setIsAddingCustomModel] = useState(false);
  const [customModelId, setCustomModelId] = useState("");
  const [disabledDiscoveredModelIds, setDisabledDiscoveredModelIds] = useState<ReadonlySet<string>>(
    () => new Set<string>()
  );
  const [isDiscoveringModels, setIsDiscoveringModels] = useState(false);
  const [discoveryReturnedEmpty, setDiscoveryReturnedEmpty] = useState(false);
  const config = asAgentConfig(model.agentConfig?.config);
  const providerRoutes = useMemo<readonly AgentProviderRouteEntry[]>(() => {
    const sourceRoutes = model.agentProviderCatalog?.routes ?? [
      ...model.quickSetupRoutes,
      ...model.localRoutes,
    ];
    const seen = new Set<string>();
    return sourceRoutes.filter((route) => {
      if (!route.runtimeSupported || seen.has(route.id)) {
        return false;
      }
      seen.add(route.id);
      return true;
    });
  }, [
    model.agentProviderCatalog?.routes,
    model.localRoutes,
    model.quickSetupRoutes,
  ]);
  const selectedProviderRoute =
    providerRoutes.find((route) => route.id === (routeAdjustment?.toRouteId ?? selectedProviderRouteId))
    ?? null;
  const hasSelectedProviderRoute = selectedProviderRoute !== null;
  const selectedProviderRouteDefaultBaseUrl = selectedProviderRoute?.defaultBaseUrl ?? null;
  const builtInFreeProviderKeys = useMemo(() => new Set(
    (model.agentModelCatalog?.models ?? [])
      .filter((entry) => entry.free)
      .flatMap((entry) => modelProviderKeys(entry)),
  ), [model.agentModelCatalog?.models]);
  const selectedProviderProfile = selectedProviderRoute === null
    ? null
    : model.profiles.find((profile) =>
      (routeAdjustment ? profile.id === routeAdjustment.profileId : profile.routeId === selectedProviderRoute.id)
      && !builtInFreeProviderKeys.has(profile.id)
    ) ?? null;
  const selectedProviderProfileId = routeAdjustment?.profileId ?? selectedProviderProfile?.id ?? selectedProviderRoute?.id ?? "";
  const selectedProviderConfig = selectedProviderProfileId.length === 0
    ? null
    : config.providers?.[selectedProviderProfileId] ?? null;
  const selectedRouteNeedsUrl = selectedProviderRoute === null
    ? false
    : selectedProviderRoute.defaultBaseUrl === null
      || selectedProviderRoute.catalogSection === "custom"
      || selectedProviderRoute.localBackend !== null
      || (selectedProviderRoute.defaultBaseUrl?.includes("YOUR_") ?? false)
      || (selectedProviderRoute.defaultBaseUrl?.includes("ACCOUNT.") ?? false);
  const selectedRouteAllowsAuth = selectedProviderRoute === null
    ? false
    : !selectedProviderRoute.authKind.startsWith("none")
      && (
        !selectedProviderRoute.authKind.startsWith("subscription")
        || selectedProviderRoute.authKind.includes("or-key")
      );
  const renderedModels = useMemo<readonly SettingsAiRenderedModelEntry[]>(() =>
    (model.agentModelCatalog?.models ?? [])
      .filter((entry) => entry.available),
  [model.agentModelCatalog?.models]);
  const hasConfiguredModels = renderedModels.length > 0;

  // 按 providerKey 聚合成服务商分组，供服务商列表视图使用
  const providerGroups = useMemo(() => {
    const groups = new Map<string, {
      readonly key: string;
      readonly label: string;
      readonly entries: SettingsAiRenderedModelEntry[];
    }>();
    for (const entry of renderedModels) {
      const key = modelProviderKeys(entry)[0] ?? entry.routeId ?? entry.id;
      const existing = groups.get(key);
      if (existing !== undefined) {
        existing.entries.push(entry);
      } else {
        groups.set(key, {
          key,
          label: entry.providerLabel ?? entry.providerKey ?? entry.provider ?? key,
          entries: [entry],
        });
      }
    }
    return [...groups.values()];
  }, [renderedModels]);

  const isProviderSearchMode = isAddingModel || !hasConfiguredModels;
  const activeSearchValue = isProviderSearchMode ? providerQuery : query;
  const activeSearchLabel = isProviderSearchMode ? labels.selectProviderLabel : labels.modelsTitle;
  const activeSearchPlaceholder = isProviderSearchMode ? labels.selectProviderLabel : labels.modelsSearchPlaceholder;
  const activeSearchLeading = isProviderSearchMode && selectedProviderRoute !== null ? (
    <AgentProviderBrandIcon
      baseUrl={providerBaseUrl || selectedProviderRoute.defaultBaseUrl}
      label={selectedProviderRoute.label}
      providerId={selectedProviderRoute.providerId}
      routeId={selectedProviderRoute.id}
    />
  ) : undefined;
  const filteredModels = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) {
      return renderedModels;
    }
    return renderedModels.filter((entry) =>
      [
        entry.label,
        entry.model,
        entry.providerLabel ?? "",
        entry.providerKey ?? "",
        entry.detail ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    );
  }, [query, renderedModels]);
  const visibleModels = showAllModels
    ? filteredModels
    : filteredModels.slice(0, MODEL_PREVIEW_LIMIT);
  const canShowAllModels = !showAllModels && filteredModels.length > MODEL_PREVIEW_LIMIT;

  // 服务商列表态：按搜索词过滤服务商分组
  const filteredProviderGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return providerGroups;
    return providerGroups.filter((group) =>
      group.label.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [providerGroups, query]);

  // 子页面态：当前钻入的服务商分组
  const drilledProviderGroup = useMemo(
    () => providerGroups.find((group) => group.key === drilledProviderKey) ?? null,
    [drilledProviderKey, providerGroups],
  );
  const drilledModelEntries = useMemo(() => {
    if (drilledProviderGroup === null) return [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return drilledProviderGroup.entries;
    return drilledProviderGroup.entries.filter((entry) =>
      [entry.label, entry.model, entry.detail ?? ""].some((value) =>
        value.toLocaleLowerCase().includes(normalizedQuery),
      ),
    );
  }, [drilledProviderGroup, query]);
  const drilledModel = useMemo(
    () => drilledProviderGroup?.entries.find((entry) => entry.id === drilledModelId) ?? null,
    [drilledModelId, drilledProviderGroup],
  );
  const visibleDrilledModels = showAllModels
    ? drilledModelEntries
    : drilledModelEntries.slice(0, MODEL_PREVIEW_LIMIT);
  const canShowAllDrilledModels =
    !showAllModels && drilledModelEntries.length > MODEL_PREVIEW_LIMIT;

  // 批量切换某服务商下所有模型的 enabled 状态
  const setProviderGroupEnabled = (group: { readonly entries: readonly SettingsAiRenderedModelEntry[] }, enabled: boolean): void => {
    for (const entry of group.entries) {
      if (entry.enabled !== enabled) {
        setModelEnabled(entry, enabled);
      }
    }
  };
  const confirmDeleteProviderGroup = (group: { readonly key: string; readonly label: string; readonly entries: readonly SettingsAiRenderedModelEntry[] }): void => {
    openDialog({
      title: labels.modelsDeleteConfirmTitle,
      description: formatSettingsAiLabel(labels.modelsDeleteProviderDescription, {
        model: group.label,
      }),
      source: {
        title: group.label,
        subtitle: `${group.entries.length} ${labels.modelsTitle}`,
        iconLabel: "AI",
        iconTone: "danger",
      },
      actions: [
        { id: "cancel", label: labels.cancel },
        {
          id: "delete",
          label: labels.modelsDeleteConfirmAction,
          tone: "danger",
          onSelect: () => {
            void model.deleteAgentModel?.({ provider: group.key, scope: "provider" });
          },
        },
      ],
    });
  };

  const providerRouteMatches = useMemo(() => {
    if (providerQuery.trim().length === 0) {
      return [...providerRoutes].sort((left, right) => left.label.localeCompare(right.label));
    }
    const ranked = providerRoutes
      .map((route, index) => ({
        route,
        score: providerRouteScore(route, providerQuery, index),
      }))
      .filter((entry) => entry.score > Number.NEGATIVE_INFINITY)
      .sort((a, b) => b.score - a.score || a.route.label.localeCompare(b.route.label));
    return ranked.map((entry) => entry.route);
  }, [providerQuery, providerRoutes]);
  const updateActiveSearch = (nextValue: string): void => {
    if (isProviderSearchMode) {
      setProviderQuery(nextValue);
      if (selectedProviderRoute !== null) {
        setSelectedProviderRouteId("");
        setRouteAdjustment(null);
        setDiscoveredModelIds([]);
        setIsAddingCustomModel(false);
        setCustomModelId("");
        setDisabledDiscoveredModelIds(new Set());
        setIsDiscoveringModels(false);
        setDiscoveryReturnedEmpty(false);
      }
      return;
    }
    setQuery(nextValue);
  };
  const discoveredModelEntries = useMemo(() =>
    discoveredModelIds.map((id) => ({
      id,
      enabled: !disabledDiscoveredModelIds.has(id),
    })),
  [disabledDiscoveredModelIds, discoveredModelIds]);
  const shouldShowDisableAllDiscoveredModels = discoveredModelIds.length > 3;
  const allDiscoveredModelsDisabled =
    discoveredModelIds.length > 0
    && discoveredModelIds.every((id) => disabledDiscoveredModelIds.has(id));

  useEffect(() => {
    if (!hasSelectedProviderRoute) {
      return;
    }
    // Discovery already saved this profile. Keep its identity and discovered
    // models when the verified route differs from the initial selection.
    if (routeAdjustment) {
      setProviderBaseUrl(routeAdjustment.baseUrl);
      setProviderApiKey("");
      return;
    }
    setProviderBaseUrl(
      selectedProviderProfile?.baseUrl
      ?? selectedProviderConfig?.baseUrl
      ?? selectedProviderRouteDefaultBaseUrl
      ?? ""
    );
    setProviderApiKey("");
  }, [
    hasSelectedProviderRoute,
    selectedProviderConfig?.baseUrl,
    selectedProviderProfile?.baseUrl,
    selectedProviderRouteDefaultBaseUrl,
    routeAdjustment,
  ]);

  // ponytail: 只按服务商选择重置发现态。上面的 effect 依赖 profile/baseUrl，
  // Discover 保存后 refreshAgent 会让这些依赖变化，若在其中重置就会把刚发现的
  // 模型清空（表现为首次 Discover 闪一下消失，需要再点一次）。
  useEffect(() => {
    if (selectedProviderRouteId.length === 0) {
      return;
    }
    setDiscoveredModelIds([]);
    setIsAddingCustomModel(false);
    setCustomModelId("");
    setDisabledDiscoveredModelIds(new Set());
    setIsDiscoveringModels(false);
    setDiscoveryReturnedEmpty(false);
  }, [selectedProviderRouteId]);

  const setModelEnabled = (entry: SettingsAiRenderedModelEntry, enabled: boolean): void => {
    const provider = modelProviderKeys(entry)[0] ?? "";
    if (provider.length === 0) {
      return;
    }
    void model.setAgentModelEnabled?.({
      provider,
      model: entry.model,
      enabled,
    });
  };
  const confirmDeleteModel = (entry: SettingsAiRenderedModelEntry): void => {
    const provider = modelProviderKeys(entry)[0] ?? "";
    if (provider.length === 0) {
      return;
    }
    openDialog({
      title: labels.modelsDeleteConfirmTitle,
      description: formatSettingsAiLabel(labels.modelsDeleteConfirmDescription, {
        model: entry.label,
      }),
      source: {
        title: entry.label,
        subtitle: [
          entry.providerLabel ?? provider,
          entry.detail ?? "",
        ].filter((value) => value.length > 0).join(" · "),
        iconLabel: "AI",
        iconTone: "danger",
      },
      actions: [
        {
          id: "cancel",
          label: labels.cancel,
        },
        {
          id: "delete",
          label: labels.modelsDeleteConfirmAction,
          tone: "danger",
          onSelect: () => {
            void model.deleteAgentModel?.({
              provider,
              model: entry.model,
            });
          },
        },
      ],
    });
  };
  const getProviderProfileName = (): string => {
    if (selectedProviderRoute === null) {
      return "";
    }
    return selectedProviderProfileId.length === 0
      ? selectedProviderRoute.id
      : selectedProviderProfileId;
  };
  const buildProviderSaveRequest = (
    models?: readonly { readonly id: string; readonly enabled: boolean }[]
  ) => {
    if (selectedProviderRoute === null) {
      return null;
    }
    const profileName = getProviderProfileName();
    const baseUrl = selectedRouteNeedsUrl
      ? providerBaseUrl.trim()
      : routeAdjustment?.baseUrl ?? selectedProviderRoute.defaultBaseUrl ?? providerBaseUrl.trim();
    const apiKey = providerApiKey.trim();
    const hasNewSecret = apiKey.length > 0;

    return {
      profileName,
      routeId: selectedProviderRoute.id,
      baseUrl,
      ...(hasNewSecret ? { apiKey } : {}),
      defaultModel:
        models?.find((entry) => entry.enabled)?.id
        ?? models?.[0]?.id
        ?? selectedProviderConfig?.defaultModel
        ?? null,
      auth: hasNewSecret ? "bearer" : "none",
      authHeader: null,
      setDefault: (model.agentModelCatalog?.models.length ?? 0) === 0,
      ...(models === undefined ? {} : { models }),
    } as const;
  };
  const discoverProviderModels = (): void => {
    const profileName = getProviderProfileName();
    const saveRequest = buildProviderSaveRequest();
    if (saveRequest === null) {
      return;
    }
    const previousModelEntries = [...(model.agentModelCatalog?.models ?? [])];
    setIsDiscoveringModels(true);
    setDiscoveryReturnedEmpty(false);
    void (async () => {
      try {
        const catalog = model.saveAndDiscoverAgentProviderProfile !== undefined
          ? await model.saveAndDiscoverAgentProviderProfile(saveRequest)
          : await (async () => {
            await model.saveAgentProviderProfile?.(saveRequest);
            return model.refreshAgentModels?.(profileName, { listOnly: true }) ?? null;
          })();
        if (catalog == null) {
          return;
        }
        if (catalog?.routeAdjustment) {
          setRouteAdjustment(catalog.routeAdjustment);
          setProviderQuery(catalog.routeAdjustment.toLabel);
        }
        const discoveredIds = discoveredModelIdsFromCatalog(
          catalog?.models ?? [],
          profileName,
          previousModelEntries
        );
        setDiscoveredModelIds(discoveredIds);
        setDisabledDiscoveredModelIds(new Set());
        setDiscoveryReturnedEmpty(discoveredIds.length === 0);
      } finally {
        setIsDiscoveringModels(false);
      }
    })();
  };
  const saveDiscoveredProvider = (): void => {
    const saveRequest = buildProviderSaveRequest(
      discoveredModelEntries.length > 0 ? discoveredModelEntries : undefined
    );
    if (saveRequest === null || selectedProviderRoute === null) {
      return;
    }
    const discoverOnSave = selectedProviderRoute.modelDiscoverySupported
      && discoveredModelEntries.length === 0
      && model.saveAndDiscoverAgentProviderProfile !== undefined;
    void (async () => {
      if (discoverOnSave) {
        const catalog = await model.saveAndDiscoverAgentProviderProfile?.(saveRequest);
        if (catalog === null || catalog === undefined) return;
      } else {
        await model.saveAgentProviderProfile?.(saveRequest);
        await model.refreshAgentModels?.(saveRequest.profileName, { listOnly: true });
      }
      setIsAddingModel(false);
      setSelectedProviderRouteId("");
      setRouteAdjustment(null);
      setProviderQuery("");
      setDiscoveredModelIds([]);
      setIsAddingCustomModel(false);
      setCustomModelId("");
      setDisabledDiscoveredModelIds(new Set());
    })();
  };
  const addCustomModel = (): void => {
    const id = customModelId.trim();
    if (id.length === 0) {
      return;
    }
    const mergedEntries = uniqueModelIds([...discoveredModelIds, id]).map((modelId) => ({
      id: modelId,
      enabled: !disabledDiscoveredModelIds.has(modelId),
    }));
    setDiscoveredModelIds((current) => uniqueModelIds([...current, id]));
    setDisabledDiscoveredModelIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setCustomModelId("");
    setIsAddingCustomModel(false);
    setDiscoveryReturnedEmpty(false);
    // ponytail: 立即持久化自定义模型到后端 profile，避免取消后丢失。
    // Discover 已写入 profile.models，这里用合并后的 entries 覆盖保存。
    // 若未 Discover（profile.models 为空），同样写入单条自定义模型。
    const saveRequest = buildProviderSaveRequest(mergedEntries);
    if (saveRequest !== null) {
      void model.saveAgentProviderProfile?.(saveRequest).then(() =>
        model.refreshAgentModels?.(saveRequest.profileName, { listOnly: true })
      );
    }
  };
  const toggleDiscoveredModel = (id: string, enabled: boolean): void => {
    setDisabledDiscoveredModelIds((current) => {
      const next = new Set(current);
      if (enabled) {
        next.delete(id);
        return next;
      }
      next.add(id);
      return next;
    });
  };
  const toggleAllDiscoveredModels = (): void => {
    setDisabledDiscoveredModelIds(
      allDiscoveredModelsDisabled
        ? new Set()
        : new Set(discoveredModelIds)
    );
  };
  return (
    <section className="lyra-settings-ai-stack lyra-settings-ai-models-page">
      <div className="lyra-settings-ai-models-panel">
        <div className="lyra-settings-ai-page-header">
          <AppSearchField
            ariaLabel={activeSearchLabel}
            className="lyra-settings-ai-model-search"
            leading={activeSearchLeading}
            placeholder={activeSearchPlaceholder}
            value={activeSearchValue}
            onValueChange={updateActiveSearch}
          />
          <AppButton
            variant={isAddingModel ? "outline" : "default"}
            size="sm"
            className={[
              "lyra-settings-ai-action",
              isAddingModel ? "" : "lyra-settings-ai-action-primary",
            ].filter(Boolean).join(" ")}
            disabled={model.isSaving || providerRoutes.length === 0}
            onClick={() => {
              setIsAddingModel((value) => {
                const nextValue = !value;
                setProviderQuery("");
                setSelectedProviderRouteId("");
                setRouteAdjustment(null);
                if (!nextValue && !hasConfiguredModels) {
                  setQuery("");
                }
                const hadDiscovery = discoveredModelIds.length > 0;
                setDiscoveredModelIds([]);
                setIsAddingCustomModel(false);
                setCustomModelId("");
                setDisabledDiscoveredModelIds(new Set());
                setIsDiscoveringModels(false);
                setDiscoveryReturnedEmpty(false);
                // ponytail: 取消时若有 Discover 副作用（后端 profile 已写入模型），
                // 触发 refreshAgentModelCatalog 同步前端，避免设置页与选择器
                // 显示陈旧状态。Discover 本身已持久化，取消不回滚，只消除显示矛盾。
                if (!nextValue && hadDiscovery) {
                  void model.refreshAgentModelCatalog?.();
                }
                return nextValue;
              });
            }}
          >
            {isAddingModel ? labels.cancel : labels.modelsAddModel}
          </AppButton>
        </div>

        {model.errorMessage === null ? null : (
          <AppStatusMessage className="lyra-settings-ai-error" tone="error" role="alert">
            {model.errorMessage}
          </AppStatusMessage>
        )}

        {isProviderSearchMode && (providerRouteMatches.length > 0 || selectedProviderRoute !== null) ? (
          <div className="lyra-settings-ai-model-flow lyra-settings-ai-add-model">
            <div className="lyra-settings-ai-provider-search-step">
              {selectedProviderRoute !== null || providerRouteMatches.length === 0 ? null : (
                <div className="lyra-software-store-item-list lyra-settings-ai-provider-search-results">
                  {providerRouteMatches.map((route) => (
                    <AppObjectRow
                      key={route.id}
                      className={[
                        "lyra-settings-ai-provider-tab",
                        selectedProviderRouteId === route.id ? "lyra-settings-ai-provider-tab-active" : "",
                      ].filter(Boolean).join(" ")}
                      active={selectedProviderRouteId === route.id}
                      disabled={model.isSaving}
                      icon={(
                        <AgentProviderBrandIcon
                          label={route.label}
                          providerId={route.providerId}
                          routeId={route.id}
                        />
                      )}
                      title={route.label}
                      description={route.description}
                      onClick={() => {
                        setSelectedProviderRouteId(route.id);
                        setRouteAdjustment(null);
                        setProviderQuery(route.label);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {selectedProviderRoute === null ? null : (
              <>
                <div className="lyra-settings-ai-form lyra-settings-ai-model-provider-form">
                  {selectedRouteNeedsUrl ? (
                    <SettingsAiInputField
                      label={labels.urlLabel}
                      type="text"
                      placeholder={selectedProviderRoute.defaultBaseUrl ?? labels.urlPlaceholder}
                      value={providerBaseUrl}
                      onValueChange={setProviderBaseUrl}
                    />
                  ) : null}
                  {selectedProviderRoute.authKind.startsWith("subscription") ? (
                    <SubscriptionRouteLogin
                      routeId={selectedProviderRoute.id}
                      baseUrl={providerBaseUrl}
                      onConnected={(catalog) => {
                        const previousModelEntries = [...(model.agentModelCatalog?.models ?? [])];
                        const applyCatalog = (next: NonNullable<typeof catalog>) => {
                          model.adoptAgentModelCatalog?.(next);
                          const ids = discoveredModelIdsFromCatalog(
                            next.models,
                            selectedProviderRoute.id,
                            previousModelEntries,
                          );
                          setDiscoveredModelIds(ids);
                          setDisabledDiscoveredModelIds(new Set());
                          setDiscoveryReturnedEmpty(ids.length === 0);
                        };
                        if (catalog != null) {
                          applyCatalog(catalog);
                          return;
                        }
                        void model.refreshAgentModels?.(selectedProviderRoute.id, { listOnly: true })
                          .then((next) => {
                            if (next != null) applyCatalog(next);
                          });
                      }}
                    />
                  ) : null}
                  {selectedRouteAllowsAuth ? (
                    <SettingsAiInputField
                      label={labels.keyLabel}
                      type="password"
                      autoComplete="off"
                      placeholder={labels.keyPlaceholder}
                      value={providerApiKey}
                      onValueChange={setProviderApiKey}
                    />
                  ) : null}
                  <div className="lyra-settings-ai-field lyra-settings-ai-field-action lyra-settings-ai-model-discovery-actions">
                    <span className="lyra-settings-ai-model-discovery-action-row">
                      <AppButton
                        variant="default"
                        size="sm"
                        className="lyra-settings-ai-action lyra-settings-ai-action-primary"
                        disabled={model.isSaving || isDiscoveringModels}
                        onClick={saveDiscoveredProvider}
                      >
                        <Save size={14} aria-hidden="true" />
                        {labels.saveProfile}
                      </AppButton>
                      <AppButton
                        variant="outline"
                        size="sm"
                        className="lyra-settings-ai-action"
                        disabled={model.isSaving || isDiscoveringModels}
                        onClick={discoverProviderModels}
                      >
                        <RefreshCw size={14} aria-hidden="true" />
                        {labels.modelsDiscoverModels}
                      </AppButton>
                      <AppButton
                        variant="outline"
                        size="sm"
                        className="lyra-settings-ai-action"
                        disabled={model.isSaving || isDiscoveringModels}
                        onClick={() => {
                          setIsAddingCustomModel((value) => !value);
                          setCustomModelId("");
                        }}
                      >
                        <Plus size={14} aria-hidden="true" />
                        {labels.modelsCustomModel}
                      </AppButton>
                    </span>
                  </div>
                </div>

                {discoveryReturnedEmpty ? (
                  <AppStatusMessage className="lyra-settings-ai-error" tone="neutral">
                    {labels.modelsDiscoverEmptyDescription}
                  </AppStatusMessage>
                ) : null}

                {isAddingCustomModel ? (
                  <div className="lyra-settings-ai-custom-model-row">
                    <AppInput
                      className="lyra-settings-ai-input"
                      aria-label={labels.modelsCustomModel}
                      placeholder={labels.modelsCustomModelPlaceholder}
                      value={customModelId}
                      onChange={(event) => {
                        setCustomModelId(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          addCustomModel();
                        }
                      }}
                    />
                    <AppButton
                      variant="outline"
                      size="sm"
                      className="lyra-settings-ai-action"
                      disabled={customModelId.trim().length === 0}
                      onClick={addCustomModel}
                    >
                      {labels.modelsAddCustomModel}
                    </AppButton>
                  </div>
                ) : null}

                {discoveredModelIds.length === 0 ? null : (
                  <div className="lyra-settings-ai-discovered-models">
                    {shouldShowDisableAllDiscoveredModels ? (
                      <div className="lyra-settings-ai-discovered-models-toolbar">
                        <AppButton
                          variant="ghost"
                          size="sm"
                          className="lyra-settings-ai-view-all-models"
                          disabled={model.isSaving}
                          onClick={toggleAllDiscoveredModels}
                        >
                          {allDiscoveredModelsDisabled ? labels.modelsEnableAll : labels.modelsDisableAll}
                        </AppButton>
                      </div>
                    ) : null}
                    <div className="lyra-software-store-item-list lyra-settings-ai-model-list-surface lyra-settings-ai-model-list-rows">
                      {discoveredModelIds.map((id) => {
                        const signedIn = renderedModels.find((entry) => entry.routeId === selectedProviderRoute.id);
                        return (
                        <AppObjectRow
                          key={id}
                          as="div"
                          role="listitem"
                          active={false}
                          className="lyra-settings-ai-model-option lyra-settings-ai-model-option-static"
                          icon={(
                            <AgentProviderBrandIcon
                              baseUrl={providerBaseUrl || selectedProviderRoute.defaultBaseUrl}
                              imageUrl={signedIn?.accountAvatarUrl}
                              label={signedIn?.accountEmail ?? selectedProviderRoute.label}
                              modelId={id}
                              providerId={selectedProviderRoute.providerId}
                              routeId={selectedProviderRoute.id}
                            />
                          )}
                          title={id}
                          description={signedIn?.accountEmail ?? selectedProviderRoute.label}
                          actions={(
                            <AppSwitch
                              checked={!disabledDiscoveredModelIds.has(id)}
                              disabled={model.isSaving}
                              aria-label={id}
                              onCheckedChange={(checked) => {
                                toggleDiscoveredModel(id, checked);
                              }}
                            />
                          )}
                        />
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : null}

        {!isAddingModel && drilledProviderGroup === null ? (
          <div className="lyra-settings-ai-model-flow lyra-settings-ai-models-surface">
            <div className="lyra-software-store-item-list lyra-settings-ai-model-list-surface lyra-settings-ai-model-list-rows">
              {hasConfiguredModels ? filteredProviderGroups.map((group) => {
                const allEnabled = group.entries.length > 0 && group.entries.every((entry) => entry.enabled);
                const someEnabled = group.entries.some((entry) => entry.enabled);
                const firstEntry = group.entries[0] ?? null;
                const providerConfig = firstEntry === null ? null : configForModelEntry(firstEntry, config);

                return (
                  <AppObjectRow
                    key={group.key}
                    as="div"
                    role="listitem"
                    active={false}
                    className="lyra-settings-ai-model-option lyra-settings-ai-provider-group-row"
                    icon={(
                      <AgentProviderBrandIcon
                        baseUrl={providerConfig?.baseUrl ?? null}
                        imageUrl={firstEntry?.accountAvatarUrl}
                        label={firstEntry?.accountName ?? firstEntry?.accountEmail ?? group.label}
                        providerId={firstEntry?.providerId}
                        routeId={firstEntry?.routeId}
                      />
                    )}
                    title={group.label}
                    description={firstEntry?.accountEmail ?? firstEntry?.accountName ?? `${group.entries.length} ${labels.modelsTitle}`}
                    onClick={() => {
                      setDrilledProviderKey(group.key);
                      setQuery("");
                      setShowAllModels(false);
                    }}
                    actions={(
                      <span className="lyra-settings-ai-model-actions">
                        <AppIconButton
                          aria-label={`${labels.modelsDeleteLabel}: ${group.label}`}
                          title={labels.modelsDeleteLabel}
                          tone="danger"
                          className="lyra-settings-ai-row-delete"
                          disabled={model.isSaving}
                          onClick={(event) => {
                            event.stopPropagation();
                            confirmDeleteProviderGroup(group);
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </AppIconButton>
                        <AppSwitch
                          checked={allEnabled}
                          aria-label={group.label}
                          onCheckedChange={(checked) => {
                            setProviderGroupEnabled(group, checked);
                          }}
                        />
                      </span>
                    )}
                  />
                );
              })
              : null}
            </div>
          </div>
        ) : null}

        {hasConfiguredModels && !isAddingModel && drilledProviderGroup !== null && drilledModel === null ? (
          <div className="lyra-settings-ai-model-flow lyra-settings-ai-models-surface lyra-settings-ai-provider-drill-in">
            <AppSubPageBack
              label={labels.modelsTitle}
              onClick={() => {
                setDrilledProviderKey(null);
                setDrilledModelId(null);
                setQuery("");
                setShowAllModels(false);
              }}
            />
            <div className="lyra-software-store-item-list lyra-settings-ai-model-list-surface lyra-settings-ai-model-list-rows">
              {visibleDrilledModels.map((entry) => {
                const active = isCurrentModelEntry(entry, model, config);
                const disabled = model.isSaving || !entry.available;
                const managedCatalog = providerRoutes.some((route) =>
                  route.id === entry.routeId
                  && (route.catalogSection === "subscription" || route.authKind.startsWith("subscription")));
                const providerConfig = configForModelEntry(entry, config);
                const description = [
                  entry.accountEmail ?? entry.accountName ?? entry.providerLabel ?? entry.providerKey ?? entry.provider ?? labels.noDefaultProvider,
                  entry.detail ?? "",
                  ...([
                    ["operation.imageGeneration", "Image generation"],
                    ["operation.speechGeneration", "Speech generation"],
                    ["operation.transcription", "Transcription"],
                    ["operation.videoGeneration", "Video generation"],
                  ] as const).filter(([key]) => entry.capabilities?.effective?.[key] === true)
                    .map(([, label]) => label),
                ].filter((value) => value.length > 0).join(" · ");

                return (
                  <AppObjectRow
                    key={entry.id}
                    as="div"
                    role="listitem"
                    active={false}
                    aria-disabled={disabled ? "true" : undefined}
                    className={[
                      "lyra-settings-ai-model-option",
                      active ? "lyra-settings-ai-model-option-current" : "",
                    ].filter(Boolean).join(" ")}
                    icon={(
                      <AgentProviderBrandIcon
                        baseUrl={providerConfig?.baseUrl ?? null}
                        imageUrl={entry.accountAvatarUrl}
                        label={entry.accountName ?? entry.accountEmail ?? entry.providerLabel ?? entry.label}
                        modelId={entry.model}
                        provider={entry.provider}
                        providerId={entry.providerId}
                        routeId={entry.routeId}
                      />
                    )}
                    title={entry.label}
                    description={description}
                    meta={active
                      ? labels.modelsCurrentLabel
                      : entry.capabilities?.runtimeConflict == null
                        ? undefined
                        : "Capability conflict"}
                    onClick={() => {
                      setDrilledModelId(entry.id);
                      setQuery("");
                    }}
                    actions={(
                      <span className="lyra-settings-ai-model-actions">
                        {managedCatalog ? null : (
                        <AppIconButton
                          aria-label={`${labels.modelsDeleteLabel}: ${entry.label}`}
                          title={labels.modelsDeleteLabel}
                          tone="danger"
                          className="lyra-settings-ai-row-delete"
                          disabled={disabled}
                          onClick={(event) => {
                            event.stopPropagation();
                            confirmDeleteModel(entry);
                          }}
                        >
                          <Trash2 size={14} aria-hidden="true" />
                        </AppIconButton>
                        )}
                        <AppSwitch
                          checked={entry.enabled}
                          disabled={disabled}
                          aria-label={entry.label}
                          onCheckedChange={(checked) => {
                            setModelEnabled(entry, checked);
                          }}
                        />
                      </span>
                    )}
                  />
                );
              })}
              {canShowAllDrilledModels ? (
                <AppButton
                  variant="ghost"
                  size="sm"
                  className="lyra-settings-ai-view-all-models"
                  onClick={() => {
                    setShowAllModels(true);
                  }}
                >
                  {labels.modelsViewAll}
                </AppButton>
              ) : null}
            </div>
          </div>
        ) : null}

        {hasConfiguredModels && !isAddingModel && drilledProviderGroup !== null && drilledModel !== null ? (
          <SettingsAiModelCapabilitiesView
            entry={drilledModel}
            labels={labels}
            model={model}
            provider={modelProviderKeys(drilledModel)[0] ?? ""}
            onBack={() => {
              setDrilledModelId(null);
              setQuery("");
            }}
          />
        ) : null}
      </div>
    </section>
  );
};
