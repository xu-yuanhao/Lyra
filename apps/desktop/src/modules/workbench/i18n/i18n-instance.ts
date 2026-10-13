import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { EN_US_DICTIONARY } from "../../../shared/i18n/en-US";
import {
  getWorkbenchLocale,
  refreshWorkbenchLocale,
  registerWorkbenchTextDirections,
  registerWorkbenchLocales
} from "./locale-state";
import { createStaticBundleSource, createPseudoLocaleSource } from "./translation-source";
import type { WorkbenchLocale } from "./types";

export const I18N_FALLBACK = "en-US" as const;

const isDev = import.meta.env?.DEV ?? false;
// ponytail: pseudo locale 门控 — 生产环境不设 LYRA_PSEUDO_LOCALE，不影响运行时
const pseudoLocaleEnabled = import.meta.env?.LYRA_PSEUDO_LOCALE === "true";

// ponytail: 核心翻译源 — StaticBundleSource 同步加载内置字典
// 未来异步 source（LocalFile/Remote/PluginBundle）在 pack 激活时通过 addResourceBundle 合并
const coreSource = createStaticBundleSource("core", {
  "en-US": EN_US_DICTIONARY,
});

// ponytail: pseudo locale source — 包装 en-US bundle 做伪本地化变换，仅在 env 门控开启时加载
const pseudoBundle = pseudoLocaleEnabled
  ? createPseudoLocaleSource("pseudo", EN_US_DICTIONARY).loadBundle("pseudo")
  : null;

// ponytail: 单 translation namespace；英语是唯一内置资源，其他语言由签名语言包提供。
void i18n.use(initReactI18next).init({
  resources: {
    "en-US": { translation: coreSource.loadBundle("en-US") },
    ...(pseudoBundle ? { pseudo: { translation: pseudoBundle } } : {}),
  },
  lng: getWorkbenchLocale(),
  fallbackLng: I18N_FALLBACK,
  defaultNS: "translation",
  ns: ["translation"],
  // ponytail: 字典使用 {name} 单括号插值（非 i18next 默认 {{name}}），需显式覆盖 prefix/suffix
  interpolation: { escapeValue: false, prefix: "{", suffix: "}" },
  // ponytail: plural 后缀 _one/_other — i18next 按 count 自动选择，pluralSeparator 默认 "_"
  // ponytail: 只加载当前语言，避免 missingKeys 噪音
  load: "currentOnly",
  // ponytail: 生产环境不触发 saveMissing，开发环境 warn 便于排查
  saveMissing: isDev,
  missingKeyHandler: (
    _lngs: readonly string[],
    _ns: string,
    key: string,
  ): void => {
    console.warn(`[i18n] missing key: ${key}`);
  },
  // ponytail: 生产环境关闭 React suspend；远程语言包通过 IPC 异步注入。
  react: { useSuspense: false },
});

export const changeI18nLocale = (locale: WorkbenchLocale) => i18n.changeLanguage(locale);
export default i18n;

type DesktopLanguageBundleApi = {
  readonly i18n?: {
    readonly readLocalBundles?: () => Promise<Readonly<Record<string, Record<string, string>>>>;
    readonly readLanguageBundles?: () => Promise<{
      readonly directions?: Readonly<Record<string, "ltr" | "rtl">>;
      readonly managed: Readonly<Record<string, Record<string, string>>>;
      readonly local: Readonly<Record<string, Record<string, string>>>;
    }>;
  };
  readonly languagePacks?: {
    readonly onChanged?: (listener: () => void) => () => void;
  };
};

const reloadDesktopLanguageBundles = async (): Promise<void> => {
  try {
    const api = (globalThis as unknown as { lyraDesktop?: DesktopLanguageBundleApi }).lyraDesktop;
    const snapshot = await api?.i18n?.readLanguageBundles?.();
    registerWorkbenchTextDirections(snapshot?.directions ?? {});
    const managed = snapshot?.managed ?? {};
    const local = snapshot?.local ?? await api?.i18n?.readLocalBundles?.() ?? {};
    const locales = new Set([...Object.keys(managed), ...Object.keys(local)]);
    if (locales.size === 0) {
      return;
    }
    registerWorkbenchLocales(Array.from(locales));
    for (const locale of locales) {
      i18n.removeResourceBundle(locale, "translation");
      const managedBundle = managed[locale];
      const localBundle = local[locale];
      if (managedBundle !== undefined) {
        i18n.addResourceBundle(locale, "translation", managedBundle, true, true);
      }
      // Local files are user-owned overrides. They remain separate on disk and
      // intentionally win only at renderer merge time.
      if (localBundle !== undefined) {
        i18n.addResourceBundle(locale, "translation", localBundle, true, true);
      }
    }
    refreshWorkbenchLocale();
  } catch {
    // IPC is optional in tests and non-desktop renderers; English remains available.
  }
};

// Managed packages and user-local bundles arrive asynchronously after first
// paint. The main process sends a revision event whenever a verified package
// changes, so the selected locale can update without an app restart.
void reloadDesktopLanguageBundles();
const desktopApi = (globalThis as unknown as { lyraDesktop?: DesktopLanguageBundleApi }).lyraDesktop;
desktopApi?.languagePacks?.onChanged?.(() => {
  void reloadDesktopLanguageBundles();
});
