import { nativeRecoveryLabels, type NativeRecoveryLabels } from "../../shared/native-recovery-labels";
import { BrowserWindow, ipcMain } from "electron";
import { createHash, verify } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";

import {
  LANGUAGE_PACK_CATALOG_SCHEMA_VERSION,
  LANGUAGE_PACK_REGISTRY_SCHEMA_VERSION,
  NATIVE_CONTEXT_MENU_EN_US_TRANSLATIONS,
  OFFICIAL_LANGUAGE_PACKS_API_URL,
  OFFICIAL_LANGUAGE_PACKS_PUBLIC_KEY,
  OFFICIAL_LANGUAGE_PACKS_RELEASE_URL,
  type InstalledLanguagePack,
  type LanguagePackCatalogResponse,
  type LanguagePackChangeEvent,
  type OfficialLanguagePackCatalog,
  type OfficialLanguagePackCatalogEntry
} from "../../shared/language-packs";
import {
  browserContextMenuLabels,
  type BrowserContextMenuLabels
} from "../../shared/browser-context-menu-labels";
import { LYRA_CHANNELS } from "../../shared/desktop-bridge";
import { EN_US_DICTIONARY } from "../../shared/i18n/en-US";
import { readJsonFile, writeFileAtomic } from "../persistence";

const REGISTRY_FILE_NAME = "registry.v1.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const ASSET_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/iu;
const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;
const MIN_TRANSLATION_COVERAGE = 0.8;

type StoredInstalledLanguagePack = InstalledLanguagePack & {
  readonly file: string;
};

type LanguagePackRegistry = {
  readonly schemaVersion: typeof LANGUAGE_PACK_REGISTRY_SCHEMA_VERSION;
  readonly lastSuccessfulCheckAt?: string;
  readonly catalog?: OfficialLanguagePackCatalog;
  readonly installed: Readonly<Record<string, StoredInstalledLanguagePack>>;
};

type CatalogDownload = {
  readonly catalog: OfficialLanguagePackCatalog;
  readonly raw: Buffer;
};

type FetchResponse = {
  readonly ok: boolean;
  readonly status: number;
  readonly text: () => Promise<string>;
  readonly arrayBuffer: () => Promise<ArrayBuffer>;
};

type FetchRequest = {
  readonly headers?: Readonly<Record<string, string>>;
};

type FetchLike = (url: string, request?: FetchRequest) => Promise<FetchResponse>;

const sha256 = (value: string | Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

const stableEntries = (values: Readonly<Record<string, string>>): readonly [string, string][] =>
  Object.entries(values).sort(([left], [right]) => left.localeCompare(right));

export const languagePackKeysetHash = (values: Readonly<Record<string, string>>): string =>
  sha256(stableEntries(values).map(([key]) => key).join("\n"));

export const languagePackContentHash = (values: Readonly<Record<string, string>>): string =>
  sha256(JSON.stringify(stableEntries(values)));

const EXPECTED_TRANSLATIONS: Readonly<Record<string, string>> = {
  ...EN_US_DICTIONARY,
  ...NATIVE_CONTEXT_MENU_EN_US_TRANSLATIONS
};
const EXPECTED_KEYS = new Set(Object.keys(EXPECTED_TRANSLATIONS));
const EXPECTED_KEYSET_HASH = languagePackKeysetHash(EXPECTED_TRANSLATIONS);
const EXPECTED_SOURCE_CONTENT_HASH = languagePackContentHash(EXPECTED_TRANSLATIONS);

const normalizeLocale = (value: unknown): string | null => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    const locale = Intl.getCanonicalLocales(value.trim())[0] ?? null;
    return locale === value.trim() ? locale : null;
  } catch {
    return null;
  }
};

const normalizeString = (value: unknown): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const normalizeAssetName = (value: unknown): string | null => {
  const asset = normalizeString(value);
  return asset !== null && ASSET_NAME_PATTERN.test(asset) ? asset : null;
};

const normalizeSha256 = (value: unknown): string | null => {
  const digest = normalizeString(value)?.toLowerCase() ?? null;
  return digest !== null && SHA256_PATTERN.test(digest) ? digest : null;
};

const normalizeVersion = (value: unknown): string | null => {
  const version = normalizeString(value);
  return version !== null && VERSION_PATTERN.test(version) ? version : null;
};

const isPlainStringMap = (value: unknown): value is Record<string, string> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "string");
};

const interpolationTokens = (value: string): readonly string[] =>
  Array.from(value.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g), (match) => match[1]!)
    .sort();

const compatibleWithApp = (minimumVersion: string, appVersion: string): boolean => {
  const parse = (value: string): readonly number[] | null => {
    const match = /^(\d+)\.(\d+)\.(\d+)/u.exec(value);
    return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const minimum = parse(minimumVersion);
  const current = parse(appVersion);
  if (minimum === null || current === null) {
    return false;
  }
  for (let index = 0; index < minimum.length; index += 1) {
    const left = current[index] ?? 0;
    const right = minimum[index] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  return true;
};

const isNewerVersion = (candidate: string, current: string): boolean => {
  const toParts = (value: string): readonly number[] =>
    value.split(/[.+-]/u).slice(0, 3).map((part) => Number(part) || 0);
  const candidateParts = toParts(candidate);
  const currentParts = toParts(current);
  for (let index = 0; index < 3; index += 1) {
    const left = candidateParts[index] ?? 0;
    const right = currentParts[index] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  return false;
};

const normalizeCatalogEntry = (value: unknown): OfficialLanguagePackCatalogEntry | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const locale = normalizeLocale(raw.locale);
  const nativeName = normalizeString(raw.nativeName);
  const englishName = normalizeString(raw.englishName);
  const version = normalizeVersion(raw.version);
  const minAppVersion = normalizeVersion(raw.minAppVersion);
  const sourceContentHash = normalizeSha256(raw.sourceContentHash);
  const keysetHash = normalizeSha256(raw.keysetHash);
  const digest = normalizeSha256(raw.sha256);
  const asset = normalizeAssetName(raw.asset);
  const signature = normalizeAssetName(raw.signature);
  if (
    locale === null
    || (raw.direction !== undefined && raw.direction !== "ltr" && raw.direction !== "rtl")
    || nativeName === null
    || englishName === null
    || version === null
    || minAppVersion === null
    || sourceContentHash === null
    || keysetHash === null
    || digest === null
    || asset === null
    || signature === null
    || Array.isArray(raw.aliases) === false
    || raw.aliases.some((alias) => normalizeString(alias) === null)
  ) {
    return null;
  }
  return {
    locale,
    ...(raw.direction === "ltr" || raw.direction === "rtl" ? { direction: raw.direction } : {}),
    nativeName,
    englishName,
    aliases: raw.aliases.map((alias) => String(alias).trim()),
    version,
    minAppVersion,
    sourceContentHash,
    keysetHash,
    sha256: digest,
    asset,
    signature
  };
};

export const validateOfficialLanguagePackCatalog = (
  value: unknown,
  appVersion: string
): OfficialLanguagePackCatalog => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("language pack catalog must be an object");
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== LANGUAGE_PACK_CATALOG_SCHEMA_VERSION) {
    throw new Error("unsupported language pack catalog schema");
  }
  const generatedAt = normalizeString(raw.generatedAt);
  if (generatedAt === null || Number.isNaN(Date.parse(generatedAt))) {
    throw new Error("language pack catalog generatedAt is invalid");
  }
  if (Array.isArray(raw.packs) === false) {
    throw new Error("language pack catalog packs is invalid");
  }
  const packs = raw.packs.map(normalizeCatalogEntry);
  if (packs.some((entry) => entry === null)) {
    throw new Error("language pack catalog contains an invalid package entry");
  }
  const validPacks = packs as OfficialLanguagePackCatalogEntry[];
  const seenLocales = new Set<string>();
  for (const entry of validPacks) {
    if (seenLocales.has(entry.locale)) {
      throw new Error(`language pack catalog repeats ${entry.locale}`);
    }
    if (compatibleWithApp(entry.minAppVersion, appVersion) === false) {
      throw new Error(`${entry.locale} requires Lyra ${entry.minAppVersion} or newer`);
    }
    if (
      entry.keysetHash !== EXPECTED_KEYSET_HASH
      || entry.sourceContentHash !== EXPECTED_SOURCE_CONTENT_HASH
    ) {
      throw new Error(`${entry.locale} does not match this Lyra translation source`);
    }
    seenLocales.add(entry.locale);
  }
  return {
    schemaVersion: LANGUAGE_PACK_CATALOG_SCHEMA_VERSION,
    generatedAt,
    packs: validPacks
  };
};

export const validateOfficialLanguagePackBundle = (
  locale: string,
  bundle: unknown,
  metadata: Pick<OfficialLanguagePackCatalogEntry, "keysetHash" | "sourceContentHash">
): Record<string, string> => {
  if (normalizeLocale(locale) === null || isPlainStringMap(bundle) === false) {
    throw new Error("language pack is not a flat string map");
  }
  const keys = Object.keys(bundle);
  if (keys.length !== EXPECTED_KEYS.size || keys.some((key) => EXPECTED_KEYS.has(key) === false)) {
    throw new Error("language pack keyset does not match the app");
  }
  if (
    metadata.keysetHash !== EXPECTED_KEYSET_HASH
    || metadata.sourceContentHash !== EXPECTED_SOURCE_CONTENT_HASH
  ) {
    throw new Error("language pack metadata does not match the app");
  }
  for (const key of keys) {
    const source = EXPECTED_TRANSLATIONS[key];
    const translation = bundle[key];
    if (source === undefined || translation === undefined) {
      throw new Error(`language pack is missing ${key}`);
    }
    if (interpolationTokens(source).join(",") !== interpolationTokens(translation).join(",")) {
      throw new Error(`language pack interpolation mismatch for ${key}`);
    }
  }
  for (const key of keys) {
    if (key.endsWith("_one")) {
      const baseKey = key.slice(0, -"_one".length);
      const otherKey = `${baseKey}_other`;
      if (EXPECTED_KEYS.has(baseKey) && bundle[otherKey] === undefined) {
        throw new Error(`language pack plural form is missing ${otherKey}`);
      }
    }
  }
  const translatedCount = keys.filter((key) => bundle[key] !== EXPECTED_TRANSLATIONS[key]).length;
  if (translatedCount / keys.length < MIN_TRANSLATION_COVERAGE) {
    throw new Error("language pack translation coverage is too low");
  }
  return { ...bundle };
};

export const validateComponentLanguagePackBundle = (
  locale: string,
  bundle: unknown
): Record<string, string> => {
  if (normalizeLocale(locale) === null || isPlainStringMap(bundle) === false) {
    throw new Error("component language pack is not a flat string map");
  }
  const keys = Object.keys(bundle);
  if (keys.length !== EXPECTED_KEYS.size || keys.some((key) => !EXPECTED_KEYS.has(key))) {
    throw new Error("component language pack keyset does not match the app");
  }
  for (const key of keys) {
    const source = EXPECTED_TRANSLATIONS[key];
    const translation = bundle[key];
    if (source === undefined || translation === undefined) {
      throw new Error(`component language pack is missing ${key}`);
    }
    if (interpolationTokens(source).join(",") !== interpolationTokens(translation).join(",")) {
      throw new Error(`component language pack interpolation mismatch for ${key}`);
    }
  }
  return { ...bundle };
};

const initialRegistry = (): LanguagePackRegistry => ({
  schemaVersion: LANGUAGE_PACK_REGISTRY_SCHEMA_VERSION,
  installed: {}
});

const normalizeStoredInstalled = (value: unknown): StoredInstalledLanguagePack | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const locale = normalizeLocale(raw.locale);
  const version = normalizeVersion(raw.version);
  const installedAt = normalizeString(raw.installedAt);
  const updatedAt = normalizeString(raw.updatedAt);
  const sourceContentHash = normalizeSha256(raw.sourceContentHash);
  const keysetHash = normalizeSha256(raw.keysetHash);
  const digest = normalizeSha256(raw.sha256);
  const file = normalizeAssetName(raw.file);
  if (
    locale === null
    || version === null
    || installedAt === null
    || updatedAt === null
    || sourceContentHash === null
    || keysetHash === null
    || digest === null
    || file === null
  ) {
    return null;
  }
  return {
    locale,
    version,
    installedAt,
    updatedAt,
    sourceContentHash,
    keysetHash,
    sha256: digest,
    file
  };
};

const normalizeRegistry = (value: unknown, appVersion: string): LanguagePackRegistry => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return initialRegistry();
  }
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== LANGUAGE_PACK_REGISTRY_SCHEMA_VERSION) {
    return initialRegistry();
  }
  const installed: Record<string, StoredInstalledLanguagePack> = {};
  if (typeof raw.installed === "object" && raw.installed !== null && Array.isArray(raw.installed) === false) {
    for (const item of Object.values(raw.installed)) {
      const normalized = normalizeStoredInstalled(item);
      if (normalized !== null) {
        installed[normalized.locale] = normalized;
      }
    }
  }
  let catalog: OfficialLanguagePackCatalog | undefined;
  try {
    catalog = raw.catalog === undefined
      ? undefined
      : validateOfficialLanguagePackCatalog(raw.catalog, appVersion);
  } catch {
    catalog = undefined;
  }
  const lastSuccessfulCheckAt = normalizeString(raw.lastSuccessfulCheckAt);
  return {
    schemaVersion: LANGUAGE_PACK_REGISTRY_SCHEMA_VERSION,
    ...(lastSuccessfulCheckAt === null ? {} : { lastSuccessfulCheckAt }),
    ...(catalog === undefined ? {} : { catalog }),
    installed
  };
};

const publicInstalled = (record: StoredInstalledLanguagePack): InstalledLanguagePack => ({
  locale: record.locale,
  ...(record.direction === undefined ? {} : { direction: record.direction }),
  version: record.version,
  installedAt: record.installedAt,
  updatedAt: record.updatedAt,
  sourceContentHash: record.sourceContentHash,
  keysetHash: record.keysetHash,
  sha256: record.sha256
});

const releaseAssetUrl = (asset: string): string =>
  `${OFFICIAL_LANGUAGE_PACKS_RELEASE_URL}/source-${EXPECTED_SOURCE_CONTENT_HASH}/${encodeURIComponent(asset)}`;
const releaseApiUrl = `${OFFICIAL_LANGUAGE_PACKS_API_URL}/tags/source-${EXPECTED_SOURCE_CONTENT_HASH}`;
const releaseAssetApiPrefix = `${OFFICIAL_LANGUAGE_PACKS_API_URL}/assets/`;

const decodeBase64Signature = (value: string): Buffer => {
  const signature = Buffer.from(value.trim(), "base64");
  if (signature.length !== 64) {
    throw new Error("language pack signature is invalid");
  }
  return signature;
};

const verifySignature = (payload: Buffer, signature: string, publicKey: string): void => {
  if (verify(null, payload, publicKey, decodeBase64Signature(signature)) === false) {
    throw new Error("language pack signature verification failed");
  }
};

const FETCH_TIMEOUT_MS = 5_000;

const fetchBytes = async (
  fetcher: FetchLike,
  url: string,
  request?: FetchRequest
): Promise<Buffer> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`language pack request timed out (${FETCH_TIMEOUT_MS}ms)`));
      }, FETCH_TIMEOUT_MS);
    });
    const response = await Promise.race([fetcher(url, request), timeout]);
    if (response.ok === false) {
      throw new Error(`language pack request failed (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

export type LanguagePacksIpcBridge = {
  readonly resolveNativeRecoveryLabels: (locale: string) => NativeRecoveryLabels;
  readonly dispose: () => void;
  readonly readTextDirections: () => Promise<Readonly<Record<string, "ltr" | "rtl">>>;
  readonly readManagedBundles: () => Promise<Readonly<Record<string, Record<string, string>>>>;
  readonly reloadComponentBundles: () => Promise<void>;
  readonly resolveBrowserContextMenuLabels: (locale: string) => BrowserContextMenuLabels;
};

export const createLanguagePacksIpcBridge = ({
  storageRoot,
  appVersion,
  fetcher = fetch as unknown as FetchLike,
  getWindows = () => BrowserWindow.getAllWindows(),
  publicKey = OFFICIAL_LANGUAGE_PACKS_PUBLIC_KEY,
  startBackgroundChecks = true,
  readComponentBundles = async () => ({})
}: {
  readonly storageRoot: string;
  readonly appVersion: string;
  readonly fetcher?: FetchLike;
  readonly getWindows?: () => readonly BrowserWindow[];
  readonly publicKey?: string;
  readonly startBackgroundChecks?: boolean;
  readonly readComponentBundles?: () => Promise<
    Readonly<Record<string, Record<string, string>>>
  >;
}): LanguagePacksIpcBridge => {
  const registryPath = path.join(storageRoot, REGISTRY_FILE_NAME);
  const packsPath = path.join(storageRoot, "packs");
  const inFlightInstalls = new Map<string, Promise<InstalledLanguagePack>>();
  let componentBundleCache: Readonly<Record<string, Record<string, string>>> = {};
  let managedBundleCache: Readonly<Record<string, Record<string, string>>> = {};
  let lastError: string | undefined;
  let scheduledCheck: ReturnType<typeof setTimeout> | null = null;
  let releaseAssetUrlsPromise: Promise<ReadonlyMap<string, string>> | null = null;

  const readReleaseAssetUrls = (): Promise<ReadonlyMap<string, string>> => {
    if (releaseAssetUrlsPromise !== null) {
      return releaseAssetUrlsPromise;
    }
    releaseAssetUrlsPromise = (async () => {
      const response = await fetcher(releaseApiUrl, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Lyra"
        }
      });
      if (response.ok === false) {
        throw new Error(`language pack release API request failed (${response.status})`);
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(await response.text()) as unknown;
      } catch {
        throw new Error("language pack release API response is invalid");
      }
      if (typeof parsed !== "object" || parsed === null || !("assets" in parsed)
        || !Array.isArray(parsed.assets)) {
        throw new Error("language pack release API assets are invalid");
      }
      const urls = new Map<string, string>();
      for (const candidate of parsed.assets) {
        if (typeof candidate !== "object" || candidate === null) {
          continue;
        }
        const name = "name" in candidate ? normalizeAssetName(candidate.name) : null;
        const url = "url" in candidate ? normalizeString(candidate.url) : null;
        if (name !== null && url !== null && url.startsWith(releaseAssetApiPrefix)) {
          urls.set(name, url);
        }
      }
      return urls;
    })().catch((error: unknown) => {
      releaseAssetUrlsPromise = null;
      throw error;
    });
    return releaseAssetUrlsPromise;
  };

  const fetchReleaseAsset = async (asset: string): Promise<Buffer> => {
    let apiError: unknown;
    try {
      const apiUrl = (await readReleaseAssetUrls()).get(asset);
      if (apiUrl === undefined) {
        throw new Error(`language pack release is missing ${asset}`);
      }
      return await fetchBytes(fetcher, apiUrl, {
        headers: {
          Accept: "application/octet-stream",
          "User-Agent": "Lyra"
        }
      });
    } catch (error) {
      apiError = error;
    }
    try {
      return await fetchBytes(fetcher, releaseAssetUrl(asset));
    } catch (directError) {
      const apiMessage = apiError instanceof Error ? apiError.message : String(apiError);
      const directMessage = directError instanceof Error ? directError.message : String(directError);
      throw new Error(`language pack download failed (API: ${apiMessage}; direct: ${directMessage})`);
    }
  };

  const emit = (event: LanguagePackChangeEvent): void => {
    for (const window of getWindows()) {
      if (window.isDestroyed() === false) {
        window.webContents.send(LYRA_CHANNELS.languagePacksChanged, event);
      }
    }
  };

  const readRegistry = async (): Promise<LanguagePackRegistry> =>
    normalizeRegistry(await readJsonFile(registryPath, "lyra-language-packs"), appVersion);

  const writeRegistry = async (registry: LanguagePackRegistry): Promise<void> => {
    await writeFileAtomic(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  };

  const listCatalog = async (): Promise<LanguagePackCatalogResponse> => {
    const registry = await readRegistry();
    const hasCatalog = registry.catalog !== undefined;
    return {
      packs: registry.catalog?.packs ?? [],
      status: hasCatalog ? (lastError === undefined ? "ready" : "stale") : "unavailable",
      ...(registry.lastSuccessfulCheckAt === undefined
        ? {}
        : { lastSuccessfulCheckAt: registry.lastSuccessfulCheckAt }),
      ...(lastError === undefined ? {} : { error: lastError })
    };
  };

  const downloadCatalog = async (): Promise<CatalogDownload> => {
    const [rawCatalog, rawSignature] = await Promise.all([
      fetchReleaseAsset("catalog.json"),
      fetchReleaseAsset("catalog.json.sig")
    ]);
    verifySignature(rawCatalog, rawSignature.toString("utf8"), publicKey);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawCatalog.toString("utf8")) as unknown;
    } catch {
      throw new Error("language pack catalog JSON is invalid");
    }
    return {
      catalog: validateOfficialLanguagePackCatalog(parsed, appVersion),
      raw: rawCatalog
    };
  };

  const writeInstalledBundle = async (
    registry: LanguagePackRegistry,
    entry: OfficialLanguagePackCatalogEntry,
    rawBundle: Buffer,
    bundle: Record<string, string>
  ): Promise<InstalledLanguagePack> => {
    const now = new Date().toISOString();
    const existing = registry.installed[entry.locale];
    const file = `${entry.locale}-${entry.version}.json`;
    await writeFileAtomic(path.join(packsPath, file), rawBundle.toString("utf8"));
    const installed: StoredInstalledLanguagePack = {
      locale: entry.locale,
      ...(entry.direction === undefined ? {} : { direction: entry.direction }),
      version: entry.version,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      sourceContentHash: entry.sourceContentHash,
      keysetHash: entry.keysetHash,
      sha256: entry.sha256,
      file
    };
    const nextRegistry: LanguagePackRegistry = {
      ...registry,
      installed: {
        ...registry.installed,
        [entry.locale]: installed
      }
    };
    await writeRegistry(nextRegistry);
    managedBundleCache = {
      ...managedBundleCache,
      [entry.locale]: bundle
    };
    return publicInstalled(installed);
  };

  const downloadAndInstall = async (
    registry: LanguagePackRegistry,
    entry: OfficialLanguagePackCatalogEntry
  ): Promise<InstalledLanguagePack> => {
    const [rawBundle, rawSignature] = await Promise.all([
      fetchReleaseAsset(entry.asset),
      fetchReleaseAsset(entry.signature)
    ]);
    if (sha256(rawBundle) !== entry.sha256) {
      throw new Error(`${entry.locale} SHA-256 verification failed`);
    }
    verifySignature(rawBundle, rawSignature.toString("utf8"), publicKey);
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBundle.toString("utf8")) as unknown;
    } catch {
      throw new Error(`${entry.locale} package JSON is invalid`);
    }
    const bundle = validateOfficialLanguagePackBundle(entry.locale, parsed, entry);
    return await writeInstalledBundle(registry, entry, rawBundle, bundle);
  };

  const refreshCatalog = async (): Promise<LanguagePackRegistry> => {
    const download = await downloadCatalog();
    const current = await readRegistry();
    const next: LanguagePackRegistry = {
      ...current,
      catalog: download.catalog,
      lastSuccessfulCheckAt: new Date().toISOString()
    };
    await writeRegistry(next);
    lastError = undefined;
    emit({ kind: "catalog" });
    return next;
  };

  const install = async (requestedLocale: string): Promise<InstalledLanguagePack> => {
    const locale = normalizeLocale(requestedLocale);
    if (locale === null) {
      throw new Error("language pack locale is invalid");
    }
    const running = inFlightInstalls.get(locale);
    if (running !== undefined) {
      return await running;
    }
    const task = (async () => {
      let registry: LanguagePackRegistry;
      try {
        registry = await refreshCatalog();
      } catch (error) {
        registry = await readRegistry();
        if (registry.catalog === undefined) {
          const message = error instanceof Error ? error.message : String(error);
          lastError = message;
          emit({ kind: "error", locales: [locale], error: message });
          throw error;
        }
      }
      const entry = registry.catalog?.packs.find((candidate) => candidate.locale === locale);
      if (entry === undefined) {
        throw new Error(`${locale} is not an official language pack`);
      }
      const installed = await downloadAndInstall(registry, entry);
      lastError = undefined;
      emit({ kind: "installed", locales: [locale] });
      return installed;
    })();
    inFlightInstalls.set(locale, task);
    try {
      return await task;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      lastError = message;
      emit({ kind: "error", locales: [locale], error: message });
      throw error;
    } finally {
      inFlightInstalls.delete(locale);
    }
  };

  const uninstall = async (requestedLocale: string): Promise<void> => {
    const locale = normalizeLocale(requestedLocale);
    if (locale === null) {
      throw new Error("language pack locale is invalid");
    }
    const registry = await readRegistry();
    const installed = registry.installed[locale];
    if (installed === undefined) {
      return;
    }
    const { [locale]: _removed, ...remaining } = registry.installed;
    await writeRegistry({
      ...registry,
      installed: remaining
    });
    await rm(path.join(packsPath, installed.file), { force: true });
    const { [locale]: _bundle, ...remainingBundles } = managedBundleCache;
    managedBundleCache = remainingBundles;
    emit({ kind: "uninstalled", locales: [locale] });
  };

  const checkForUpdates = async (): Promise<LanguagePackCatalogResponse> => {
    let registry: LanguagePackRegistry;
    try {
      registry = await refreshCatalog();
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      emit({ kind: "error", error: lastError });
      scheduleNextCheck(await readRegistry());
      return await listCatalog();
    }
    const updatedLocales: string[] = [];
    for (const installed of Object.values(registry.installed)) {
      const entry = registry.catalog?.packs.find((candidate) => candidate.locale === installed.locale);
      if (entry === undefined || isNewerVersion(entry.version, installed.version) === false) {
        continue;
      }
      try {
        await downloadAndInstall(registry, entry);
        updatedLocales.push(entry.locale);
        registry = await readRegistry();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        emit({ kind: "error", locales: [entry.locale], error: lastError });
      }
    }
    if (updatedLocales.length > 0) {
      emit({ kind: "updated", locales: updatedLocales });
    }
    scheduleNextCheck(registry);
    return await listCatalog();
  };

  const scheduleNextCheck = (registry: LanguagePackRegistry): void => {
    if (scheduledCheck !== null) {
      clearTimeout(scheduledCheck);
    }
    const lastCheck = registry.lastSuccessfulCheckAt === undefined
      ? 0
      : Date.parse(registry.lastSuccessfulCheckAt);
    const delay = Number.isFinite(lastCheck)
      ? Math.max(0, lastCheck + CHECK_INTERVAL_MS - Date.now())
      : 0;
    scheduledCheck = setTimeout(() => {
      void checkForUpdates();
    }, delay);
  };

  const readStoredBundles = async (): Promise<Readonly<Record<string, Record<string, string>>>> => {
    const registry = await readRegistry();
    const bundles: Record<string, Record<string, string>> = {};
    const invalid: StoredInstalledLanguagePack[] = [];
    for (const installed of Object.values(registry.installed)) {
      try {
        const raw = await readFile(path.join(packsPath, installed.file));
        if (sha256(raw) !== installed.sha256) {
          continue;
        }
        const parsed = JSON.parse(raw.toString("utf8")) as unknown;
        bundles[installed.locale] = validateOfficialLanguagePackBundle(installed.locale, parsed, installed);
      } catch {
        invalid.push(installed);
      }
    }
    if (invalid.length > 0) {
      const nextInstalled = { ...registry.installed };
      for (const installed of invalid) {
        delete nextInstalled[installed.locale];
      }
      await writeRegistry({
        ...registry,
        installed: nextInstalled
      });
      await Promise.all(
        invalid.map(async (installed) => {
          await rm(path.join(packsPath, installed.file), { force: true }).catch(() => undefined);
        })
      );
      emit({ kind: "uninstalled", locales: invalid.map((installed) => installed.locale) });
    }
    managedBundleCache = bundles;
    return bundles;
  };

  const reloadComponentBundles = async (): Promise<void> => {
    const next = await readComponentBundles();
    componentBundleCache = Object.fromEntries(
      Object.entries(next).map(([locale, bundle]) => [locale, { ...bundle }])
    );
    emit({
      kind: "updated",
      locales: Object.keys(componentBundleCache).sort()
    });
  };

  // ponytail: readManagedBundles reads component bundles directly without
  // calling reloadComponentBundles — the latter emits a change event that
  // triggers the renderer's onChanged → reloadDesktopLanguageBundles →
  // readLanguageBundles IPC → readManagedBundles loop (infinite IPC cycle).
  const readManagedBundles = async (): Promise<
    Readonly<Record<string, Record<string, string>>>
  > => {
    const next = await readComponentBundles();
    componentBundleCache = Object.fromEntries(
      Object.entries(next).map(([locale, bundle]) => [locale, { ...bundle }])
    );
    const stored = await readStoredBundles();
    return {
      ...componentBundleCache,
      ...stored
    };
  };

  ipcMain.handle(LYRA_CHANNELS.languagePacksListCatalog, async (): Promise<LanguagePackCatalogResponse> =>
    await listCatalog()
  );
  ipcMain.handle(
    LYRA_CHANNELS.languagePacksListInstalled,
    async (): Promise<readonly InstalledLanguagePack[]> => {
      const registry = await readRegistry();
      return Object.values(registry.installed)
        .map(publicInstalled)
        .sort((left, right) => left.locale.localeCompare(right.locale));
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.languagePacksInstall,
    async (_event, locale: unknown): Promise<InstalledLanguagePack> => {
      if (typeof locale !== "string") {
        throw new Error("language pack locale is invalid");
      }
      return await install(locale);
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.languagePacksUninstall,
    async (_event, locale: unknown): Promise<void> => {
      if (typeof locale !== "string") {
        throw new Error("language pack locale is invalid");
      }
      await uninstall(locale);
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.languagePacksCheckForUpdates,
    async (): Promise<LanguagePackCatalogResponse> => await checkForUpdates()
  );

  if (startBackgroundChecks) {
    void readManagedBundles().catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
      emit({ kind: "error", error: lastError });
    });
    void readRegistry()
      .then(scheduleNextCheck)
      .catch((error) => {
        lastError = error instanceof Error ? error.message : String(error);
        emit({ kind: "error", error: lastError });
      });
    void checkForUpdates();
  }

  return {
    readTextDirections: async () => {
      const registry = await readRegistry();
      return Object.fromEntries(Object.values(registry.installed)
        .filter((pack) => pack.direction !== undefined)
        .map((pack) => [pack.locale, pack.direction as "ltr" | "rtl"]));
    },
    readManagedBundles,
    reloadComponentBundles,
    resolveNativeRecoveryLabels: (locale: string) => nativeRecoveryLabels(managedBundleCache[locale] ?? componentBundleCache[locale]),
    resolveBrowserContextMenuLabels: (locale: string): BrowserContextMenuLabels =>
      browserContextMenuLabels(
        locale,
        managedBundleCache[locale] ?? componentBundleCache[locale]
      ),
    dispose: () => {
      if (scheduledCheck !== null) {
        clearTimeout(scheduledCheck);
      }
      ipcMain.removeHandler(LYRA_CHANNELS.languagePacksListCatalog);
      ipcMain.removeHandler(LYRA_CHANNELS.languagePacksListInstalled);
      ipcMain.removeHandler(LYRA_CHANNELS.languagePacksInstall);
      ipcMain.removeHandler(LYRA_CHANNELS.languagePacksUninstall);
      ipcMain.removeHandler(LYRA_CHANNELS.languagePacksCheckForUpdates);
    }
  };
};
