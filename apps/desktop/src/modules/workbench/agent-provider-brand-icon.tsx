import {
  Alibaba,
  Anthropic,
  Azure,
  Baidu,
  Bedrock,
  ByteDance,
  Claude,
  DeepSeek,
  Doubao,
  Gemini,
  Google,
  Groq,
  LmStudio,
  Mistral,
  Moonshot,
  Ollama,
  OpenAI,
  OpenRouter,
  Perplexity,
  Qwen,
  Rwkv,
  SenseNova,
  SiliconCloud,
  Spark,
  Stepfun,
  Wenxin,
  XAI,
  Xuanyuan,
  Yi,
  Zhipu,
  type IconType
} from "@lyra/icons/brands";
import { useEffect, useState } from "react";
import type { SVGProps } from "react";

import openCodeIconUrl from "@renderer/assets/provider-icons/opencode.svg";
import { getDesktopApi } from "./shell/service";

type AgentProviderBrandIconProps = {
  readonly baseUrl?: string | null | undefined;
  readonly className?: string;
  readonly label?: string | null | undefined;
  readonly modelId?: string | null | undefined;
  readonly resolveSiteIcon?: boolean;
  readonly provider?: string | null | undefined;
  readonly providerId?: string | null | undefined;
  readonly routeId?: string | null | undefined;
  readonly imageUrl?: string | null | undefined;
  readonly size?: number;
};

type BrandMatcher = {
  readonly icon: AgentProviderBrandIconSource;
  readonly match: readonly string[];
};

type SpecialBrand = "mimo" | "opencode";

type AgentProviderBrandIconSource = IconType & {
  readonly BrandColor?: IconType;
  readonly Color?: IconType;
  readonly colorPrimary?: string;
};

type BrandLuma = "dark" | "light" | "unknown";
const XIAOMI_MIMO_NAME = "XiaomiMiMo";

// Mirrors the XiaomiMiMo Mono icon from @lobehub/icons 5.x. The current desktop
// app is React 18, while that package line declares React 19 peers.
const XiaomiMiMoIcon = ({
  size = 16,
  ...props
}: SVGProps<SVGSVGElement> & { readonly size?: number | string }) => (
  <svg
    fill="currentColor"
    fillRule="evenodd"
    height={size}
    viewBox="0 0 24 24"
    width={size}
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <title>{XIAOMI_MIMO_NAME}</title>
    <path d="M.958 15.936a.459.459 0 01.459.44v2.729a.46.46 0 01-.918 0v-2.729a.459.459 0 01.459-.44zm4.814-2.035a.46.46 0 01.553.45v4.754a.458.458 0 11-.918 0V15.48L3.74 17.202a.462.462 0 01-.655.016.462.462 0 01-.065-.082L.628 14.67a.459.459 0 01.658-.637l2.124 2.187 2.127-2.188a.46.46 0 01.235-.13zm2.068.004a.46.46 0 01.458.445v4.755a.46.46 0 01-.458.458.459.459 0 01-.458-.458V14.35a.459.459 0 01.458-.445zm1.973 2.014a.46.46 0 01.46.457v2.729a.46.46 0 01-.784.324.46.46 0 01-.134-.324v-2.729a.46.46 0 01.458-.458zm.002-2.045a.458.458 0 01.328.157l2.127 2.19 2.125-2.19a.459.459 0 01.784.318v4.756a.46.46 0 01-.455.458.46.46 0 01-.458-.458V15.48l-1.667 1.723a.46.46 0 01-.65.008l-.005-.005c0-.002-.002-.002-.004-.003l-2.455-2.534a.46.46 0 01-.008-.667.461.461 0 01.338-.128zm6.797 1.206a.46.46 0 01.53.651A1.966 1.966 0 0019.81 18.4a.462.462 0 01.623.18.46.46 0 01-.181.624 2.863 2.863 0 01-1.38.353l-.142-.004a2.88 2.88 0 01-2.393-4.263.461.461 0 01.274-.21zm.864-.931a2.884 2.884 0 013.915 3.914.46.46 0 01-.402.24l-.057-.004a.458.458 0 01-.164-.055.46.46 0 01-.182-.622 1.967 1.967 0 00-2.669-2.67.459.459 0 11-.441-.803zM9.59 6.368c1.481 0 1.696 1.202 1.696 1.654v2.648h-.917v-.432c-.26.346-.792.535-1.36.535-.133 0-1.289-.03-1.384-1.136-.082-.932.675-1.61 2.053-1.61h.691c0-.563-.367-.886-.983-.886-.44.013-.864.174-1.2.458l-.36-.664c.484-.379 1.012-.567 1.764-.567zm4.427.1c1.263 0 2.082.97 2.083 2.15 0 1.181-.824 2.154-2.083 2.154-1.26 0-2.084-.972-2.084-2.152 0-1.18.82-2.153 2.084-2.153zm6.801.015c.68 0 1.202.465 1.197 1.548v2.642H21.1V8.29c0-.312-.002-.98-.63-.98s-.628.667-.628.838v2.524h-.89V8.148c0-.17-.001-.838-.63-.838-.628 0-.628.668-.628.98v2.383h-.917v-4.03h.917V7a1.22 1.22 0 01.947-.516c.398 0 .76.193.982.686a1.321 1.321 0 011.195-.686zm-18.093.872l1.457-1.772H5.32L3.311 8.07l2.14 2.602H4.24L2.725 8.796 1.21 10.672H0L2.138 8.07.13 5.583h1.138l1.458 1.772zm4.149 3.317h-.916V6.644h.916v4.028zm16.99 0h-.916V6.644h.916v4.028zM9.925 8.71c-1.055 0-1.359.412-1.326.742.032.329.324.537.757.537a1.013 1.013 0 001.014-.968l.002-.31h-.447zM14.018 7.3c-.663 0-1.184.487-1.184 1.32 0 .832.52 1.32 1.184 1.32.662 0 1.182-.49 1.182-1.32 0-.832-.52-1.32-1.182-1.32zM6.417 5.001a.568.568 0 01.587.582.588.588 0 01-1.175 0A.57.57 0 016.417 5zm16.991 0a.57.57 0 01.592.582.588.588 0 01-1.174 0 .57.57 0 01.357-.542.572.572 0 01.225-.04z" />
  </svg>
);

const BRAND_MATCHERS: readonly BrandMatcher[] = [
  { icon: OpenAI, match: ["openai", "gpt", "chatgpt"] },
  { icon: Anthropic, match: ["anthropic"] },
  { icon: Claude, match: ["claude"] },
  { icon: Gemini, match: ["gemini", "vertex"] },
  { icon: Google, match: ["google"] },
  { icon: Ollama, match: ["ollama"] },
  { icon: LmStudio, match: ["lmstudio", "lm-studio", "lm studio"] },
  { icon: Bedrock, match: ["bedrock", "aws"] },
  { icon: Azure, match: ["azure"] },
  { icon: OpenRouter, match: ["openrouter", "open-router"] },
  { icon: DeepSeek, match: ["deepseek", "deep-seek"] },
  { icon: Qwen, match: ["qwen", "tongyi"] },
  { icon: Alibaba, match: ["alibaba", "aliyun", "bailian", "百炼", "通义"] },
  { icon: Baidu, match: ["baidu", "百度"] },
  { icon: Wenxin, match: ["wenxin", "文心"] },
  { icon: Moonshot, match: ["moonshot", "kimi", "月之暗面"] },
  { icon: Mistral, match: ["mistral"] },
  { icon: Groq, match: ["groq"] },
  { icon: Perplexity, match: ["perplexity", "sonar"] },
  { icon: SiliconCloud, match: ["siliconcloud", "silicon-cloud", "硅基"] },
  { icon: ByteDance, match: ["bytedance", "byte-dance", "字节"] },
  { icon: Doubao, match: ["doubao", "豆包", "volcengine", "火山"] },
  { icon: Zhipu, match: ["zhipu", "glm", "智谱"] },
  { icon: Spark, match: ["spark", "讯飞", "iflytek"] },
  { icon: Rwkv, match: ["rwkv"] },
  { icon: SenseNova, match: ["sensenova", "sense nova", "商汤"] },
  { icon: Stepfun, match: ["stepfun", "step", "阶跃"] },
  { icon: Xuanyuan, match: ["xuanyuan", "轩辕", "度小满"] },
  { icon: Yi, match: ["yi", "01ai", "01.ai", "零一", "零一万物"] },
  { icon: XAI, match: ["xai", "grok"] },
];

const SPECIAL_BRAND_MATCHERS: readonly {
  readonly brand: SpecialBrand;
  readonly match: readonly string[];
}[] = [
  { brand: "opencode", match: ["opencode"] },
  { brand: "mimo", match: ["mimo", "xiaomi", "xiaomimimo", "小米"] },
];

const normalize = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[\s._-]+/gu, "");

const getSearchText = ({
  label,
  modelId,
  provider,
  providerId,
  routeId
}: AgentProviderBrandIconProps): string => [
  providerId,
  provider,
  routeId,
  label,
  modelId,
].flatMap((value) => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length === 0 ? [] : [trimmed, normalize(trimmed)];
}).join(" ");

const getInitials = (label: string | null | undefined): string => {
  const trimmed = label?.trim() ?? "";
  if (trimmed.length === 0) {
    return "AI";
  }
  const asciiWords = trimmed.match(/[A-Za-z0-9]+/gu);
  if (asciiWords !== null && asciiWords.length > 0) {
    return asciiWords
      .slice(0, 2)
      .map((word) => word.at(0) ?? "")
      .join("")
      .toLocaleUpperCase();
  }
  return [...trimmed].slice(0, 2).join("");
};

const isCustomProvider = ({
  provider,
  providerId,
  routeId
}: Pick<AgentProviderBrandIconProps, "provider" | "providerId" | "routeId">): boolean =>
  [provider, providerId, routeId].some((value) =>
    value?.toLocaleLowerCase().includes("custom") === true
  );

export const resolveAgentProviderBrandIcon = (
  props: AgentProviderBrandIconProps
): AgentProviderBrandIconSource | null => {
  const searchText = getSearchText(props);
  const tokens = searchText.split(/\s+/u).map(normalize).filter((value) => value.length > 0);
  return BRAND_MATCHERS.find((matcher) =>
    matcher.match.some((keyword) => {
      const needle = normalize(keyword);
      if (needle.length === 0) {
        return false;
      }
      // Short keys like "yi" must be whole tokens so "bai" does not inherit 零一.
      if (needle.length <= 2) {
        return tokens.includes(needle);
      }
      return searchText.includes(needle);
    })
  )?.icon ?? null;
};

const resolveSpecialBrand = (props: AgentProviderBrandIconProps): SpecialBrand | null => {
  const searchText = getSearchText(props);
  return SPECIAL_BRAND_MATCHERS.find((matcher) =>
    matcher.match.some((keyword) => searchText.includes(normalize(keyword)))
  )?.brand ?? null;
};

const resolveRenderableBrandIcon = (Icon: AgentProviderBrandIconSource): IconType =>
  Icon.BrandColor ?? Icon.Color ?? Icon;

const resolveMonoBrandColor = (Icon: AgentProviderBrandIconSource): string | undefined => {
  if (Icon.BrandColor !== undefined || Icon.Color !== undefined) {
    return undefined;
  }
  const color = Icon.colorPrimary?.trim();
  return color === undefined || color.length === 0 ? undefined : color;
};

const resolveBrandLuma = (color: string | undefined): BrandLuma => {
  const match = color?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu);
  if (match === null || match === undefined) {
    return "unknown";
  }
  const hex = match[1] ?? "";
  const normalized = hex.length === 3
    ? [...hex].map((value) => `${value}${value}`).join("")
    : hex;
  const [red, green, blue] = [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255
  );
  const luma = 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
  return luma < 0.5 ? "dark" : "light";
};

export const AgentProviderBrandIcon = ({
  baseUrl,
  className,
  label,
  modelId,
  resolveSiteIcon = false,
  provider,
  providerId,
  routeId,
  imageUrl,
  size = 16,
}: AgentProviderBrandIconProps) => {
  const [siteIconUrl, setSiteIconUrl] = useState<string | null>(null);
  const customProvider = isCustomProvider({ provider, providerId, routeId });
  const shouldResolveSiteIcon = customProvider || resolveSiteIcon;
  const specialBrand = resolveSpecialBrand({
    label,
    modelId,
    provider,
    providerId,
    routeId,
  });
  useEffect(() => {
    setSiteIconUrl(null);
    if (
      !shouldResolveSiteIcon
      || (baseUrl?.trim() ?? "").length === 0
    ) {
      return;
    }
    let cancelled = false;
    void getDesktopApi()?.agent?.resolveProviderIcon({ baseUrl: baseUrl! })
      .then((response) => {
        if (!cancelled) {
          setSiteIconUrl(response.iconUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSiteIconUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [baseUrl, shouldResolveSiteIcon]);
  const modelIcon = customProvider && (modelId?.trim() ?? "").length > 0
    ? resolveAgentProviderBrandIcon({ modelId })
    : null;
  const Icon = modelIcon ?? resolveAgentProviderBrandIcon({
    label,
    modelId,
    provider,
    providerId,
    routeId,
  });
  const classNames = ["lyra-agent-provider-brand-icon", className ?? ""].filter(Boolean).join(" ");
  const accountImage = imageUrl?.trim() ?? "";
  if (accountImage.length > 0) {
    return (
      <span className={classNames} title={label ?? provider ?? providerId ?? undefined}>
        <img
          alt=""
          aria-hidden="true"
          className="lyra-agent-provider-brand-icon-image lyra-agent-provider-brand-icon-avatar"
          src={accountImage}
        />
      </span>
    );
  }

  if (shouldResolveSiteIcon && siteIconUrl !== null) {
    return (
      <span className={classNames} title={label ?? provider ?? providerId ?? undefined}>
        <img
          alt=""
          aria-hidden="true"
          className="lyra-agent-provider-brand-icon-image"
          onError={() => setSiteIconUrl(null)}
          src={siteIconUrl}
        />
      </span>
    );
  }

  if (specialBrand === "opencode") {
    return (
      <span className={classNames} title={label ?? provider ?? providerId ?? undefined}>
        <img
          alt=""
          aria-hidden="true"
          className="lyra-agent-provider-brand-icon-image"
          src={openCodeIconUrl}
        />
      </span>
    );
  }

  if (specialBrand === "mimo") {
    return (
      <span className={classNames} title={label ?? provider ?? providerId ?? undefined}>
        <XiaomiMiMoIcon size={size} aria-hidden="true" focusable="false" />
      </span>
    );
  }

  if (Icon !== null) {
    const RenderIcon = resolveRenderableBrandIcon(Icon);
    const monoBrandColor = resolveMonoBrandColor(Icon);
    return (
      <span
        className={classNames}
        data-lyra-brand-luma={resolveBrandLuma(monoBrandColor)}
        title={label ?? provider ?? providerId ?? undefined}
      >
        <RenderIcon
          size={size}
          aria-hidden="true"
          focusable="false"
          style={monoBrandColor === undefined ? undefined : { color: monoBrandColor }}
        />
      </span>
    );
  }

  return (
    <span className={classNames} title={label ?? provider ?? providerId ?? undefined}>
      <span className="lyra-agent-provider-brand-icon-initials" aria-hidden="true">
        {getInitials(label ?? provider ?? providerId ?? modelId)}
      </span>
    </span>
  );
};
