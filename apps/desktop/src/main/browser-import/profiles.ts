import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import type {
  BrowserImportBrowserId,
  BrowserImportFamily,
  BrowserImportProfile
} from "../../shared/browser-import";

/**
 * Every detected browser profile becomes one row in import settings, so a
 * browser with three profiles shows up three times.
 *
 * ponytail: only Chromium-family and Firefox layouts are covered. Arc, Opera,
 * LibreWolf, Waterfox and Zen keep different on-disk layouts; add their user
 * data dirs to this table when a real user needs one. Windows App-Bound (`v20`)
 * cookies are not decryptable here yet; those rows import what they can and
 * report the rest as skipped.
 */

type BrowserImportPathContext = {
  readonly platform: NodeJS.Platform;
  readonly homeDir: string;
  readonly env: NodeJS.ProcessEnv;
};

type BrowserBrand = {
  readonly id: BrowserImportBrowserId;
  readonly label: string;
  readonly family: BrowserImportFamily;
  /** Every user data directory worth probing, in detection order. */
  readonly userDataDirs: (context: BrowserImportPathContext) => readonly string[];
  /** Linux keyring `application` attribute; Chromium brands only. */
  readonly keyringApplication?: string;
  /** macOS keychain service holding the cookie encryption secret. */
  readonly safeStorageService?: string;
};

const platformRoot = (context: BrowserImportPathContext): string => {
  if (context.platform === "darwin") {
    return join(context.homeDir, "Library", "Application Support");
  }
  if (context.platform === "win32") {
    return context.env.LOCALAPPDATA ?? join(context.homeDir, "AppData", "Local");
  }
  return context.env.XDG_CONFIG_HOME ?? join(context.homeDir, ".config");
};

const mozillaRoot = (context: BrowserImportPathContext): string => {
  if (context.platform === "darwin") {
    return join(context.homeDir, "Library", "Application Support", "Firefox");
  }
  if (context.platform === "win32") {
    return join(
      context.env.APPDATA ?? join(context.homeDir, "AppData", "Roaming"),
      "Mozilla",
      "Firefox"
    );
  }
  return join(context.homeDir, ".mozilla", "firefox");
};

/** Standard Chromium container plus Snap/Flatpak containers that sit under the home dir. */
const chromiumDirs = (
  relativePath: (context: BrowserImportPathContext) => string,
  sandboxedRelativePaths: readonly string[] = []
) => (context: BrowserImportPathContext): readonly string[] => [
  join(platformRoot(context), relativePath(context)),
  ...sandboxedRelativePaths.map((path) => join(context.homeDir, path))
];

const firefoxDirs = (context: BrowserImportPathContext): readonly string[] => [
  mozillaRoot(context),
  join(context.homeDir, "snap/firefox/common/.mozilla/firefox"),
  join(context.homeDir, ".var/app/org.mozilla.firefox/.mozilla/firefox")
];

const windowsUserData = (product: readonly string[]) => (context: BrowserImportPathContext) =>
  join(...product, "User Data");

const BROWSER_BRANDS: readonly BrowserBrand[] = [
  {
    id: "chrome",
    label: "Chrome",
    family: "chromium",
    keyringApplication: "chrome",
    safeStorageService: "Chrome Safe Storage",
    userDataDirs: chromiumDirs(
      (context) =>
        context.platform === "win32"
          ? windowsUserData(["Google", "Chrome"])(context)
          : context.platform === "darwin"
            ? join("Google", "Chrome")
            : "google-chrome",
      [".var/app/com.google.Chrome/config/google-chrome"]
    )
  },
  {
    id: "chrome-beta",
    label: "Chrome Beta",
    family: "chromium",
    keyringApplication: "chrome",
    safeStorageService: "Chrome Safe Storage",
    userDataDirs: chromiumDirs((context) =>
      context.platform === "win32"
        ? windowsUserData(["Google", "Chrome Beta"])(context)
        : context.platform === "darwin"
          ? join("Google", "Chrome Beta")
          : "google-chrome-beta"
    )
  },
  {
    id: "chrome-dev",
    label: "Chrome Dev",
    family: "chromium",
    keyringApplication: "chrome",
    safeStorageService: "Chrome Safe Storage",
    userDataDirs: chromiumDirs((context) =>
      context.platform === "win32"
        ? windowsUserData(["Google", "Chrome Dev"])(context)
        : context.platform === "darwin"
          ? join("Google", "Chrome Dev")
          : "google-chrome-unstable"
    )
  },
  {
    id: "chrome-canary",
    label: "Chrome Canary",
    family: "chromium",
    keyringApplication: "chrome",
    safeStorageService: "Chrome Safe Storage",
    userDataDirs: chromiumDirs((context) =>
      context.platform === "win32"
        ? windowsUserData(["Google", "Chrome SxS"])(context)
        : context.platform === "darwin"
          ? join("Google", "Chrome Canary")
          : "google-chrome-canary"
    )
  },
  {
    id: "chromium",
    label: "Chromium",
    family: "chromium",
    keyringApplication: "chromium",
    safeStorageService: "Chromium Safe Storage",
    userDataDirs: chromiumDirs(() => "chromium", [
      "snap/chromium/common/chromium",
      ".var/app/org.chromium.Chromium/config/chromium"
    ])
  },
  {
    id: "brave",
    label: "Brave",
    family: "chromium",
    keyringApplication: "brave",
    safeStorageService: "Brave Safe Storage",
    userDataDirs: chromiumDirs(() => join("BraveSoftware", "Brave-Browser"), [
      ".var/app/com.brave.Browser/config/BraveSoftware/Brave-Browser"
    ])
  },
  {
    id: "edge",
    label: "Edge",
    family: "chromium",
    keyringApplication: "microsoft-edge",
    safeStorageService: "Microsoft Edge Safe Storage",
    userDataDirs: chromiumDirs(
      (context) =>
        context.platform === "win32"
          ? windowsUserData(["Microsoft", "Edge"])(context)
          : context.platform === "darwin"
            ? "Microsoft Edge"
            : "microsoft-edge",
      [".var/app/com.microsoft.Edge/config/microsoft-edge"]
    )
  },
  {
    id: "vivaldi",
    label: "Vivaldi",
    family: "chromium",
    keyringApplication: "vivaldi",
    safeStorageService: "Vivaldi Safe Storage",
    userDataDirs: chromiumDirs(() => "vivaldi", [
      ".var/app/com.vivaldi.Vivaldi/config/vivaldi"
    ])
  },
  {
    id: "firefox",
    label: "Firefox",
    family: "firefox",
    userDataDirs: firefoxDirs
  }
];

export type BrowserImportDetectionOptions = {
  readonly platform?: NodeJS.Platform;
  readonly homeDir?: string;
  readonly env?: NodeJS.ProcessEnv;
};

const resolveContext = (options: BrowserImportDetectionOptions): BrowserImportPathContext => ({
  platform: options.platform ?? process.platform,
  homeDir: options.homeDir ?? homedir(),
  env: options.env ?? process.env
});

export const browserBrandSafeStorageService = (
  browser: BrowserImportBrowserId
): string | undefined =>
  BROWSER_BRANDS.find((brand) => brand.id === browser)?.safeStorageService;

export const browserBrandKeyringApplication = (
  browser: BrowserImportBrowserId
): string | undefined =>
  BROWSER_BRANDS.find((brand) => brand.id === browser)?.keyringApplication;

const PROFILE_DIRECTORY_PATTERN = /^(?:Default|Profile \d+)$/;

const pathExists = async (path: string): Promise<boolean> =>
  stat(path).then(
    (entry) => entry.isDirectory(),
    () => false
  );

const fileExists = async (path: string): Promise<boolean> =>
  stat(path).then(
    (entry) => entry.isFile(),
    () => false
  );

const readString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

type LocalStateProfileEntry = {
  readonly name?: unknown;
  readonly user_name?: unknown;
  readonly avatar_icon?: unknown;
  readonly gaia_picture_file_name?: unknown;
  readonly account_info?: readonly { readonly email?: unknown }[];
};

type ChromiumLocalState = {
  readonly profile?: {
    readonly info_cache?: Record<string, LocalStateProfileEntry>;
    readonly last_used?: unknown;
  };
};

const readLocalState = async (userDataDir: string): Promise<ChromiumLocalState> => {
  try {
    const parsed = JSON.parse(await readFile(join(userDataDir, "Local State"), "utf8")) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as ChromiumLocalState : {};
  } catch {
    // A missing or half-written Local State still leaves the profile directories.
    return {};
  }
};

const AVATAR_MEDIA_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

/** ponytail: 4 MiB ceiling — a browser-written picture is far smaller, and the cap
 * keeps a hand-edited Local State from pushing an arbitrary file through IPC. */
const AVATAR_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Reads the account picture Chromium cached in the profile directory. Only file
 * names that Local State points at are read, so a name carrying a path segment
 * or a non-image extension is ignored rather than followed off the profile.
 */
const readAvatarDataUrl = async (
  profilePath: string,
  fileNames: readonly unknown[]
): Promise<string | undefined> => {
  for (const fileName of fileNames) {
    const name = readString(fileName);
    if (name === undefined || basename(name) !== name) {
      continue;
    }
    const mediaType = AVATAR_MEDIA_TYPES[name.split(".").at(-1)?.toLocaleLowerCase() ?? ""];
    if (mediaType === undefined) {
      continue;
    }
    try {
      const contents = await readFile(join(profilePath, name));
      if (contents.byteLength > 0 && contents.byteLength <= AVATAR_MAX_BYTES) {
        return `data:${mediaType};base64,${contents.toString("base64")}`;
      }
    } catch {
      // A profile whose picture was never downloaded simply has no avatar.
    }
  }
  return undefined;
};

export const chromiumCookieDatabasePath = async (profilePath: string): Promise<string | null> => {
  for (const candidate of [join(profilePath, "Network", "Cookies"), join(profilePath, "Cookies")]) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }
  return null;
};

const listChromiumProfiles = async (
  brand: BrowserBrand,
  userDataDir: string
): Promise<readonly BrowserImportProfile[]> => {
  const localState = await readLocalState(userDataDir);
  const infoCache = localState.profile?.info_cache ?? {};
  const lastUsed = readString(localState.profile?.last_used);
  const directories = new Set<string>(Object.keys(infoCache));
  try {
    for (const entry of await readdir(userDataDir, { withFileTypes: true })) {
      if (entry.isDirectory() && PROFILE_DIRECTORY_PATTERN.test(entry.name)) {
        directories.add(entry.name);
      }
    }
  } catch {
    return [];
  }

  const profiles: BrowserImportProfile[] = [];
  for (const directory of [...directories].sort((left, right) => left.localeCompare(right))) {
    const profilePath = join(userDataDir, directory);
    if (!(await pathExists(profilePath))) {
      continue;
    }
    // A profile with no cookie database has nothing to import, and listing it
    // would only promise a login transfer that cannot happen.
    if ((await chromiumCookieDatabasePath(profilePath)) === null) {
      continue;
    }
    const info = infoCache[directory];
    const accountEmail = readString(info?.user_name)
      ?? readString(info?.account_info?.[0]?.email);
    const avatarDataUrl = await readAvatarDataUrl(profilePath, [
      info?.gaia_picture_file_name,
      info?.avatar_icon
    ]);
    profiles.push({
      id: profilePath,
      browser: brand.id,
      browserLabel: brand.label,
      family: brand.family,
      profileName: readString(info?.name) ?? directory,
      ...(accountEmail === undefined ? {} : { accountEmail }),
      ...(avatarDataUrl === undefined ? {} : { avatarDataUrl }),
      profilePath,
      isDefault: directory === "Default",
      lastUsed: lastUsed === directory
    });
  }
  return profiles;
};

type FirefoxProfileEntry = {
  readonly name: string;
  readonly path: string;
  readonly isDefault: boolean;
};

const firefoxEntryFromSection = (section: Readonly<Record<string, string>>): FirefoxProfileEntry => ({
  name: section.name ?? "",
  path: section.path ?? "",
  isDefault: section.default === "1"
});

export const parseFirefoxProfilesIni = (text: string): readonly FirefoxProfileEntry[] => {
  const entries: FirefoxProfileEntry[] = [];
  let current: Record<string, string> | null = null;
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }
    if (line.startsWith("[")) {
      if (current !== null) {
        entries.push(firefoxEntryFromSection(current));
      }
      current = line.endsWith("]") && line.startsWith("[Profile") ? {} : null;
      continue;
    }
    if (current === null) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator > 0) {
      current[line.slice(0, separator).trim().toLowerCase()] = line.slice(separator + 1).trim();
    }
  }
  if (current !== null) {
    entries.push(firefoxEntryFromSection(current));
  }
  return entries.filter((entry) => entry.path.length > 0);
};

const listFirefoxProfiles = async (
  brand: BrowserBrand,
  userDataDir: string
): Promise<readonly BrowserImportProfile[]> => {
  let ini: string;
  try {
    ini = await readFile(join(userDataDir, "profiles.ini"), "utf8");
  } catch {
    return [];
  }
  const profiles: BrowserImportProfile[] = [];
  for (const entry of parseFirefoxProfilesIni(ini)) {
    const profilePath = entry.path.startsWith("/") ? entry.path : resolve(userDataDir, entry.path);
    if (!(await pathExists(profilePath))) {
      continue;
    }
    if (!(await fileExists(join(profilePath, "cookies.sqlite")))) {
      continue;
    }
    profiles.push({
      id: profilePath,
      browser: brand.id,
      browserLabel: brand.label,
      family: brand.family,
      profileName: entry.name.length > 0 ? entry.name : relative(userDataDir, profilePath),
      profilePath,
      isDefault: entry.isDefault,
      lastUsed: entry.isDefault
    });
  }
  return profiles;
};

/**
 * Detects one entry per browser profile that holds an importable cookie database.
 */
export const listBrowserImportProfiles = async (
  options: BrowserImportDetectionOptions = {}
): Promise<readonly BrowserImportProfile[]> => {
  const context = resolveContext(options);
  const profiles: BrowserImportProfile[] = [];
  for (const brand of BROWSER_BRANDS) {
    for (const userDataDir of brand.userDataDirs(context)) {
      if (!(await pathExists(userDataDir))) {
        continue;
      }
      profiles.push(
        ...brand.family === "firefox"
          ? await listFirefoxProfiles(brand, userDataDir)
          : await listChromiumProfiles(brand, userDataDir)
      );
    }
  }
  return profiles;
};

export type ResolvedBrowserImportProfile = {
  readonly profile: BrowserImportProfile;
  readonly cookieDatabasePath: string;
};

/** Resolves a renderer-supplied profile id against fresh detection results. */
export const resolveBrowserImportProfile = async (
  profileId: string,
  options: BrowserImportDetectionOptions = {}
): Promise<ResolvedBrowserImportProfile | null> => {
  const profiles = await listBrowserImportProfiles(options);
  const profile = profiles.find((entry) => entry.id === profileId);
  if (profile === undefined) {
    return null;
  }
  const cookieDatabasePath = profile.family === "firefox"
    ? join(profile.profilePath, "cookies.sqlite")
    : await chromiumCookieDatabasePath(profile.profilePath);
  return cookieDatabasePath === null ? null : { profile, cookieDatabasePath };
};
