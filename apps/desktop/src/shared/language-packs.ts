export const LANGUAGE_PACK_CATALOG_SCHEMA_VERSION = 1 as const;
export const LANGUAGE_PACK_REGISTRY_SCHEMA_VERSION = 1 as const;
export const OFFICIAL_LANGUAGE_PACKS_REPOSITORY = "petehsu/Lyra-Language-Packs" as const;
export const OFFICIAL_LANGUAGE_PACKS_RELEASE_URL =
  "https://github.com/petehsu/Lyra-Language-Packs/releases/download" as const;
export const OFFICIAL_LANGUAGE_PACKS_API_URL =
  "https://api.github.com/repos/petehsu/Lyra-Language-Packs/releases" as const;
export const REQUIRED_OFFICIAL_LANGUAGE_PACK_LOCALES = ["zh-CN"] as const;

// Only the public half is shipped with Lyra. The matching private key lives in
// the language-pack repository's GitHub Actions secret.
export const OFFICIAL_LANGUAGE_PACKS_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAJelwEGMnQVbTfNRBXseVrwponsRVqz1lEK8pQOyLe4g=
-----END PUBLIC KEY-----`;

export const NATIVE_CONTEXT_MENU_TRANSLATION_KEYS = {
  back: "nativeMenu.back",
  forward: "nativeMenu.forward",
  reload: "nativeMenu.reload",
  copy: "nativeMenu.copy",
  cut: "nativeMenu.cut",
  paste: "nativeMenu.paste",
  copyLink: "nativeMenu.copyLink",
  openLinkInNewTab: "nativeMenu.openLinkInNewTab",
  citeSelection: "nativeMenu.citeSelection",
  citeLink: "nativeMenu.citeLink",
  citePage: "nativeMenu.citePage"
} as const;

export type LanguagePackNativeMenuKey = keyof typeof NATIVE_CONTEXT_MENU_TRANSLATION_KEYS;

export const NATIVE_CONTEXT_MENU_EN_US_TRANSLATIONS: Record<
  (typeof NATIVE_CONTEXT_MENU_TRANSLATION_KEYS)[LanguagePackNativeMenuKey],
  string
> = {
  "nativeMenu.back": "Back",
  "nativeMenu.forward": "Forward",
  "nativeMenu.reload": "Reload",
  "nativeMenu.copy": "Copy",
  "nativeMenu.cut": "Cut",
  "nativeMenu.paste": "Paste",
  "nativeMenu.copyLink": "Copy link",
  "nativeMenu.openLinkInNewTab": "Open link in new tab",
  "nativeMenu.citeSelection": "Cite selection to AI",
  "nativeMenu.citeLink": "Cite link to AI",
  "nativeMenu.citePage": "Cite page to AI"
};

export type OfficialLanguagePackCatalogEntry = {
  readonly locale: string;
  readonly direction?: "ltr" | "rtl";
  readonly nativeName: string;
  readonly englishName: string;
  readonly aliases: readonly string[];
  readonly version: string;
  readonly minAppVersion: string;
  readonly sourceContentHash: string;
  readonly keysetHash: string;
  readonly sha256: string;
  readonly asset: string;
  readonly signature: string;
};

export type OfficialLanguagePackCatalog = {
  readonly schemaVersion: typeof LANGUAGE_PACK_CATALOG_SCHEMA_VERSION;
  readonly generatedAt: string;
  readonly packs: readonly OfficialLanguagePackCatalogEntry[];
};

export type LanguagePackCatalogResponse = {
  readonly packs: readonly OfficialLanguagePackCatalogEntry[];
  readonly status: "ready" | "stale" | "unavailable";
  readonly lastSuccessfulCheckAt?: string;
  readonly error?: string;
};

export type InstalledLanguagePack = {
  readonly locale: string;
  readonly direction?: "ltr" | "rtl";
  readonly version: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly sourceContentHash: string;
  readonly keysetHash: string;
  readonly sha256: string;
};

export type LanguagePackChangeEvent = {
  readonly kind: "catalog" | "installed" | "uninstalled" | "updated" | "error";
  readonly locales?: readonly string[];
  readonly error?: string;
};
