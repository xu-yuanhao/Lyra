import { createDecipheriv, pbkdf2Sync } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Session } from "electron";

import type { BrowserImportBrowserId, BrowserImportIssue } from "../../shared/browser-import";
import { browserBrandKeyringApplication, browserBrandSafeStorageService } from "./profiles";
import { readLinuxKeyringSecret, readMacSafeStorageSecret } from "./secrets";

// createRequire keeps the node: protocol intact through the bundler (see sqlite/inspect.ts).
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as typeof import("node:sqlite");

type CookieDetails = Parameters<Session["cookies"]["set"]>[0];
/** `CookiesSetDetails["sameSite"]` is optional, so the concrete union is used for returns. */
type CookieSameSite = NonNullable<CookieDetails["sameSite"]>;

const WRITE_CONCURRENCY = 32;
/** Chrome stores expiration in microseconds since 1601-01-01, past Number.MAX_SAFE_INTEGER. */
const CHROMIUM_EPOCH_OFFSET_MICROSECONDS = 11_644_473_600_000_000n;
/** Chromium caps persistent cookies at 400 days; session cookies need some lifetime to survive a restart. */
const SESSION_COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export type CookieImportStats = {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
  readonly issue?: BrowserImportIssue;
};

type ChromiumCookieRow = {
  readonly host_key: string;
  readonly name: string;
  readonly path: string;
  readonly expires_utc: bigint;
  readonly is_secure: bigint;
  readonly is_httponly: bigint;
  readonly samesite: bigint;
  readonly value: string;
  readonly encrypted_value: Uint8Array;
};

type FirefoxCookieRow = {
  readonly name: string;
  readonly value: string;
  readonly host: string;
  readonly path: string;
  readonly expiry: number;
  readonly isSecure: number;
  readonly isHttpOnly: number;
  readonly sameSite: number;
};

const snapshotDatabase = async (
  sourcePath: string
): Promise<{ readonly path: string; readonly dispose: () => Promise<void> }> => {
  const directory = await mkdtemp(join(tmpdir(), "lyra-browser-import-"));
  const snapshotPath = join(directory, "cookies.sqlite");
  await copyFile(sourcePath, snapshotPath);
  // ponytail: copy the write-ahead log so committed rows are visible; SQLite
  // rebuilds the shared-memory file, which must never be copied from a live
  // browser. Upgrade path: node:sqlite `backup()` once it is available in the
  // Electron runtime, which reads a consistent snapshot without file copies.
  await copyFile(`${sourcePath}-wal`, `${snapshotPath}-wal`).catch(() => undefined);
  return {
    path: snapshotPath,
    dispose: () => rm(directory, { recursive: true, force: true })
  };
};

const chromiumExpirationSeconds = (expiresUtc: bigint, importedAtSeconds: number): number =>
  expiresUtc === 0n
    ? importedAtSeconds + SESSION_COOKIE_MAX_AGE_SECONDS
    : Number((expiresUtc - CHROMIUM_EPOCH_OFFSET_MICROSECONDS) / 1_000_000n);

const chromiumSameSite = (value: bigint): CookieSameSite => {
  if (value === 0n) return "no_restriction";
  if (value === 1n) return "lax";
  if (value === 2n) return "strict";
  return "unspecified";
};

const cookieDetailsFromChromium = (
  row: ChromiumCookieRow,
  value: string,
  importedAtSeconds: number
): CookieDetails => {
  const host = row.host_key.replace(/^\./u, "");
  const secure = row.is_secure === 1n;
  const path = row.path.length > 0 ? row.path : "/";
  return {
    url: `${secure ? "https" : "http"}://${host}${path}`,
    name: row.name,
    value,
    ...(row.host_key.startsWith(".") ? { domain: row.host_key } : {}),
    path,
    secure,
    httpOnly: row.is_httponly === 1n,
    sameSite: chromiumSameSite(row.samesite),
    expirationDate: chromiumExpirationSeconds(row.expires_utc, importedAtSeconds)
  };
};

const firefoxSameSite = (value: number): CookieSameSite => {
  if (value === 0) return "no_restriction";
  if (value === 1) return "lax";
  if (value === 2) return "strict";
  return "unspecified";
};

const cookieDetailsFromFirefox = (
  row: FirefoxCookieRow,
  importedAtSeconds: number
): CookieDetails => {
  const host = row.host.replace(/^\./u, "");
  const secure = row.isSecure === 1;
  const path = row.path.length > 0 ? row.path : "/";
  return {
    url: `${secure ? "https" : "http"}://${host}${path}`,
    name: row.name,
    value: row.value,
    ...(row.host.startsWith(".") ? { domain: row.host } : {}),
    path,
    secure,
    httpOnly: row.isHttpOnly === 1,
    sameSite: firefoxSameSite(row.sameSite),
    expirationDate:
      row.expiry <= 0 ? importedAtSeconds + SESSION_COOKIE_MAX_AGE_SECONDS : row.expiry
  };
};

const deriveCookieKey = (secret: string, iterations: number): Buffer =>
  pbkdf2Sync(secret, "saltysalt", iterations, 16, "sha1");

/**
 * `v10` is the fallback password and `v11` the keyring/system one; the caller
 * picks the key from the prefix, so both versions decrypt the same way here.
 * Anything else (`v20`, Windows app-bound) is not decryptable in process.
 */
const SUPPORTED_CHROMIUM_PREFIXES: readonly string[] = ["v10", "v11"];

const decryptChromiumValue = (
  encrypted: Uint8Array,
  key: Buffer,
  schemaVersion: number
): string => {
  const buffer = Buffer.from(encrypted);
  if (SUPPORTED_CHROMIUM_PREFIXES.includes(buffer.subarray(0, 3).toString("ascii")) === false) {
    throw new Error("unsupported_chromium_cookie_prefix");
  }
  const decipher = createDecipheriv("aes-128-cbc", key, Buffer.alloc(16, 0x20));
  const decrypted = Buffer.concat([decipher.update(buffer.subarray(3)), decipher.final()]);
  try {
    // Cookie schema 24+ prefixes the plaintext with SHA-256(host_key).
    const payload = schemaVersion >= 24 && decrypted.length >= 32
      ? decrypted.subarray(32)
      : decrypted;
    return payload.toString("utf8");
  } finally {
    decrypted.fill(0);
  }
};

type ChromiumKeySet = {
  readonly basic: Buffer | null;
  readonly keyring: Buffer | null;
};

const resolveChromiumKeys = async (
  browser: BrowserImportBrowserId,
  platform: NodeJS.Platform
): Promise<ChromiumKeySet> => {
  if (platform === "linux") {
    const application = browserBrandKeyringApplication(browser);
    const keyringSecret = application === undefined
      ? null
      : await readLinuxKeyringSecret(application);
    return {
      basic: deriveCookieKey("peanuts", 1),
      keyring: keyringSecret === null ? null : deriveCookieKey(keyringSecret, 1)
    };
  }
  if (platform === "darwin") {
    const service = browserBrandSafeStorageService(browser);
    const secret = service === undefined ? null : await readMacSafeStorageSecret(service);
    return { basic: secret === null ? null : deriveCookieKey(secret, 1003), keyring: null };
  }
  // Windows encrypts with DPAPI (v10) or App-Bound (v20); neither is readable here.
  return { basic: null, keyring: null };
};

const readChromiumCookieRows = (
  snapshotPath: string
): { readonly rows: readonly ChromiumCookieRow[]; readonly schemaVersion: number } => {
  const database = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    const versionRow = database.prepare("SELECT value FROM meta WHERE key = 'version'").get() as
      | { value?: string }
      | undefined;
    const statement = database.prepare(
      "SELECT host_key, name, path, expires_utc, is_secure, is_httponly, samesite, value, encrypted_value FROM cookies"
    );
    statement.setReadBigInts(true);
    return {
      rows: statement.all() as unknown as readonly ChromiumCookieRow[],
      schemaVersion: Number(versionRow?.value ?? 0)
    };
  } finally {
    database.close();
  }
};

const readFirefoxCookieRows = (snapshotPath: string): readonly FirefoxCookieRow[] => {
  const database = new DatabaseSync(snapshotPath, { readOnly: true });
  try {
    return database
      .prepare("SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite FROM moz_cookies")
      .all() as unknown as readonly FirefoxCookieRow[];
  } finally {
    database.close();
  }
};

const writeCookies = async (
  session: Session,
  details: readonly CookieDetails[]
): Promise<{ readonly imported: number; readonly failed: number }> => {
  let imported = 0;
  let failed = 0;
  for (let offset = 0; offset < details.length; offset += WRITE_CONCURRENCY) {
    const batch = details.slice(offset, offset + WRITE_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((entry) => session.cookies.set(entry))
    );
    for (const result of results) {
      if (result.status === "fulfilled") {
        imported += 1;
      } else {
        failed += 1;
      }
    }
  }
  await session.cookies.flushStore().catch(() => undefined);
  return { imported, failed };
};

const emptyStats = (issue?: BrowserImportIssue): CookieImportStats => ({
  imported: 0,
  skipped: 0,
  failed: 0,
  ...(issue === undefined ? {} : { issue })
});

const importChromiumCookies = async (
  session: Session,
  cookieDatabasePath: string,
  browser: BrowserImportBrowserId,
  platform: NodeJS.Platform
): Promise<CookieImportStats> => {
  const snapshot = await snapshotDatabase(cookieDatabasePath);
  try {
    const { rows, schemaVersion } = readChromiumCookieRows(snapshot.path);
    const keys = await resolveChromiumKeys(browser, platform);
    const importedAtSeconds = Math.floor(Date.now() / 1000);
    const details: CookieDetails[] = [];
    let skipped = 0;
    let keyringProtected = false;
    let platformProtected = false;
    for (const row of rows) {
      if (row.value.length > 0) {
        details.push(cookieDetailsFromChromium(row, row.value, importedAtSeconds));
        continue;
      }
      if (row.encrypted_value.byteLength === 0) {
        skipped += 1;
        continue;
      }
      const prefix = Buffer.from(row.encrypted_value).subarray(0, 3).toString("ascii");
      const key = prefix === "v10" ? keys.basic : prefix === "v11" ? keys.keyring : null;
      if (key === null) {
        skipped += 1;
        if (platform === "win32") {
          platformProtected = true;
        } else {
          keyringProtected = true;
        }
        continue;
      }
      try {
        details.push(
          cookieDetailsFromChromium(row, decryptChromiumValue(row.encrypted_value, key, schemaVersion), importedAtSeconds)
        );
      } catch {
        skipped += 1;
      }
    }
    const written = await writeCookies(session, details);
    console.info("[lyra-browser-import] chromium cookies imported", {
      browser,
      sourceCount: rows.length,
      importedCount: written.imported,
      skippedCount: skipped,
      failedCount: written.failed
    });
    return {
      imported: written.imported,
      skipped,
      failed: written.failed,
      ...(platformProtected
        ? { issue: "windows_app_bound_unsupported" as const }
        : keyringProtected
          ? { issue: "system_keyring_unavailable" as const }
          : {})
    };
  } finally {
    await snapshot.dispose().catch(() => undefined);
  }
};

const importFirefoxCookies = async (
  session: Session,
  cookieDatabasePath: string
): Promise<CookieImportStats> => {
  const snapshot = await snapshotDatabase(cookieDatabasePath);
  try {
    const rows = readFirefoxCookieRows(snapshot.path);
    const importedAtSeconds = Math.floor(Date.now() / 1000);
    const details = rows
      .filter((row) => row.name.length > 0 && row.host.length > 0)
      .map((row) => cookieDetailsFromFirefox(row, importedAtSeconds));
    const written = await writeCookies(session, details);
    console.info("[lyra-browser-import] firefox cookies imported", {
      sourceCount: rows.length,
      importedCount: written.imported,
      failedCount: written.failed
    });
    return { imported: written.imported, skipped: 0, failed: written.failed };
  } finally {
    await snapshot.dispose().catch(() => undefined);
  }
};

/**
 * Copies one browser profile's cookies into a target Electron session so the
 * sites the user is signed into there are signed in inside Lyra.
 *
 * Only counts and a stable issue code leave this function; cookie values stay in
 * this process.
 */
export const importProfileCookies = async (options: {
  readonly browser: BrowserImportBrowserId;
  readonly family: "chromium" | "firefox";
  readonly cookieDatabasePath: string;
  readonly platform?: NodeJS.Platform;
  readonly session: Session;
}): Promise<CookieImportStats> => {
  try {
    return options.family === "firefox"
      ? await importFirefoxCookies(options.session, options.cookieDatabasePath)
      : await importChromiumCookies(
          options.session,
          options.cookieDatabasePath,
          options.browser,
          options.platform ?? process.platform
        );
  } catch (error) {
    console.info("[lyra-browser-import] cookie import failed", {
      browser: options.browser,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return emptyStats("import_failed");
  }
};
