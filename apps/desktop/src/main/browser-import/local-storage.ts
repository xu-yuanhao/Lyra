import { cp, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BrowserWindow, session as electronSession, type Session } from "electron";

import type {
  BrowserImportIssue,
  BrowserImportLocalStorageStats
} from "../../shared/browser-import";

/**
 * Copies one Chromium profile's website storage into Lyra's own browser profile.
 *
 * Two things force the shape of this file. First, localStorage cannot be read
 * off disk: it lives in a LevelDB whose blocks may be Snappy-compressed, so the
 * values are only reachable through a Chromium page context. Second, the values
 * must be written through the same kind of page context. Lyra is Chromium, so
 * it stands in for the browser helper other importers shell out to: the copied
 * LevelDB becomes the storage root of a hidden session, each origin in it is
 * opened as a page, and its entries are read straight out of that page.
 *
 * Opening that page never touches the network. A document has to exist at the
 * origin for its storage to be addressable, but nothing about the site itself
 * is needed to reach it, so every navigation is intercepted and answered with a
 * local blank document instead. A site that is down, that bounces the frame to
 * a login page or that redirects elsewhere therefore still contributes the
 * entries it holds, and the import makes no requests to the user's accounts.
 */

/**
 * Upper bounds so one profile cannot hold the import open indefinitely. Origins
 * are opened locally, so the phase budget below rather than the origin count is
 * what bounds the run.
 */
const MAX_ORIGINS = 1_000;
const MAX_LEVELDB_FILE_BYTES = 64 * 1024 * 1024;
const MAX_ORIGIN_ENTRY_BYTES = 4 * 1024 * 1024;
const NAVIGATION_TIMEOUT_MS = 10_000;
const PHASE_BUDGET_MS = 120_000;

const ORIGIN_PATTERN =
  /META:(https?:\/\/(?:\[[0-9a-fA-F:]+\]|[A-Za-z0-9.-]+)(?::\d{1,5})?)/gu;

/** Stands in for every site a navigation asks for, so none of them is fetched. */
const BLANK_DOCUMENT_BASE64 = Buffer.from("<!doctype html><meta charset=utf-8>").toString("base64");

export type LocalStorageImportStats = BrowserImportLocalStorageStats & {
  readonly issue?: BrowserImportIssue;
};

type OriginRecord = {
  readonly origin: string;
  readonly entries: readonly (readonly [string, string])[];
};

const emptyStats = (issue?: BrowserImportIssue): LocalStorageImportStats => ({
  originsImported: 0,
  entriesImported: 0,
  originsSkipped: 0,
  originsFailed: 0,
  ...(issue === undefined ? {} : { issue })
});

const isEntry = (value: unknown): value is [string, string] =>
  Array.isArray(value) &&
  value.length === 2 &&
  typeof value[0] === "string" &&
  typeof value[1] === "string";

/**
 * Reads the `META:<origin>` keys LevelDB keeps beside the entries. Only origins
 * are extracted here; values are read later through a page context.
 */
export const discoverChromiumLocalStorageOrigins = async (
  localStoragePath: string
): Promise<readonly string[]> => {
  const levelDbPath = join(localStoragePath, "leveldb");
  const files = await readdir(levelDbPath, { withFileTypes: true }).catch(() => []);
  const origins = new Set<string>();
  for (const file of files) {
    if (!file.isFile()) {
      continue;
    }
    const filePath = join(levelDbPath, file.name);
    const size = await stat(filePath).then(
      (entry) => entry.size,
      () => 0
    );
    if (size === 0 || size > MAX_LEVELDB_FILE_BYTES) {
      continue;
    }
    const content = await readFile(filePath).catch(() => null);
    if (content === null) {
      continue;
    }
    for (const match of content.toString("latin1").matchAll(ORIGIN_PATTERN)) {
      const candidate = match[1];
      if (candidate === undefined) {
        continue;
      }
      try {
        const url = new URL(candidate);
        if (url.origin === candidate) {
          origins.add(candidate);
        }
      } catch {
        // Log history and binary neighbours form candidates that are not URLs.
      }
    }
  }
  return [...origins].sort();
};

/**
 * Answers every navigation this window makes with a local blank document, so
 * the origin exists as a page without the site itself ever being requested. The
 * page it stands in for has no subresources; anything else the renderer asks
 * for is aborted rather than fetched.
 */
const serveBlankDocuments = async (window: BrowserWindow): Promise<() => void> => {
  const { debugger: debuggerApi } = window.webContents;
  if (!debuggerApi.isAttached()) {
    debuggerApi.attach("1.3");
  }
  const send = (method: string, commandParams: Record<string, unknown>): void => {
    // A navigation abandoned by the load timeout below leaves its command in
    // flight; that rejection is not this function's to report.
    void (debuggerApi.sendCommand(method, commandParams) as Promise<unknown>).catch(
      () => undefined
    );
  };
  const handleMessage = (_event: Electron.Event, method: string, params: unknown): void => {
    if (method !== "Fetch.requestPaused") {
      return;
    }
    const { requestId, resourceType } = params as {
      readonly requestId?: unknown;
      readonly resourceType?: unknown;
    };
    if (typeof requestId !== "string") {
      return;
    }
    if (resourceType === "Document") {
      send("Fetch.fulfillRequest", {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "Content-Type", value: "text/html; charset=utf-8" },
          { name: "Cache-Control", value: "no-store" }
        ],
        body: BLANK_DOCUMENT_BASE64
      });
      return;
    }
    send("Fetch.failRequest", { requestId, errorReason: "Aborted" });
  };
  debuggerApi.on("message", handleMessage);
  await debuggerApi.sendCommand("Fetch.enable", {
    patterns: [{ urlPattern: "http*", requestStage: "Request" }]
  });
  return () => {
    debuggerApi.off("message", handleMessage);
    if (debuggerApi.isAttached()) {
      debuggerApi.detach();
    }
  };
};

const withHiddenWindow = async <T>(
  targetSession: Session,
  run: (window: BrowserWindow) => Promise<T>
): Promise<T> => {
  const window = new BrowserWindow({
    show: false,
    width: 400,
    height: 300,
    webPreferences: {
      session: targetSession,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  window.webContents.setAudioMuted(true);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  let stopServingBlankDocuments = (): void => {};
  try {
    // No `about:blank` warm-up: the debugger attaches to the first document this
    // window opens, so the origins below are intercepted from the start anyway.
    stopServingBlankDocuments = await serveBlankDocuments(window);
    return await run(window);
  } finally {
    stopServingBlankDocuments();
    if (!window.isDestroyed()) {
      window.destroy();
    }
  }
};

/**
 * Opens the origin as a page so the frame owns its storage. The navigation is
 * answered locally (see `serveBlankDocuments`), so the timeout here guards
 * against a wedged renderer rather than against a slow or unreachable site.
 */
const loadOrigin = (window: BrowserWindow, origin: string): Promise<void> => {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      window.webContents.stop();
      resolve();
    }, NAVIGATION_TIMEOUT_MS);
  });
  return Promise.race([window.loadURL(origin).catch(() => undefined), timeout]).finally(() => {
    if (timer !== null) {
      clearTimeout(timer);
    }
  });
};

const readOrigin = async (window: BrowserWindow, origin: string): Promise<OriginRecord | null> => {
  await loadOrigin(window, origin);
  const raw = await window.webContents
    .executeJavaScript(
      "JSON.stringify({ origin: location.origin, entries: Object.entries(localStorage) })"
    )
    .catch(() => null);
  if (typeof raw !== "string") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return null;
  }
  const record = parsed as { origin?: unknown; entries?: unknown };
  // The frame could have drifted off the origin we asked for; its entries must
  // not be attributed to that origin.
  if (record.origin !== origin || !Array.isArray(record.entries)) {
    return null;
  }
  return { origin, entries: record.entries.filter(isEntry) };
};

/** Writes the entries back through a page of the same origin; `-1` means the frame had drifted. */
const writeOrigin = async (window: BrowserWindow, record: OriginRecord): Promise<number> => {
  await loadOrigin(window, record.origin);
  const payload = JSON.stringify(JSON.stringify(record));
  const written = await window.webContents
    .executeJavaScript(
      `(() => {
        const payload = JSON.parse(${payload});
        if (location.origin !== payload.origin) return -1;
        for (const [key, value] of payload.entries) localStorage.setItem(key, value);
        return payload.entries.length;
      })()`
    )
    .catch(() => -1);
  return typeof written === "number" ? written : -1;
};

export const importProfileLocalStorage = async (options: {
  readonly profilePath: string;
  readonly session: Session;
}): Promise<LocalStorageImportStats> => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "lyra-browser-import-storage-")).catch(
    () => null
  );
  if (temporaryRoot === null) {
    return emptyStats("local_storage_unavailable");
  }
  const localStoragePath = join(temporaryRoot, "Local Storage");
  try {
    // The source browser may be running and rewriting LevelDB, so the tree is
    // copied first, exactly like the cookie database.
    await cp(join(options.profilePath, "Local Storage"), localStoragePath, {
      recursive: true,
      force: true
    }).catch(() => undefined);
    const discovered = await discoverChromiumLocalStorageOrigins(localStoragePath);
    const origins = discovered.slice(0, MAX_ORIGINS);
    const stats = {
      ...emptyStats(),
      originsSkipped: discovered.length - origins.length
    };
    if (origins.length === 0) {
      return stats;
    }

    const deadline = Date.now() + PHASE_BUDGET_MS;
    const records = await withHiddenWindow(electronSession.fromPath(temporaryRoot), async (window) => {
      const collected: OriginRecord[] = [];
      for (const [index, origin] of origins.entries()) {
        if (Date.now() > deadline) {
          stats.originsSkipped += origins.length - index;
          break;
        }
        const record = await readOrigin(window, origin);
        if (record === null) {
          stats.originsFailed += 1;
          continue;
        }
        if (record.entries.length === 0) {
          stats.originsSkipped += 1;
          continue;
        }
        if (Buffer.byteLength(JSON.stringify(record)) > MAX_ORIGIN_ENTRY_BYTES) {
          stats.originsSkipped += 1;
          continue;
        }
        collected.push(record);
      }
      return collected;
    });

    if (records.length > 0) {
      await withHiddenWindow(options.session, async (window) => {
        for (const record of records) {
          const written = await writeOrigin(window, record);
          if (written < 0) {
            stats.originsFailed += 1;
            continue;
          }
          stats.originsImported += 1;
          stats.entriesImported += written;
        }
      });
      options.session.flushStorageData();
    }

    console.info("[lyra-browser-import] localStorage imported", {
      discoveredOrigins: discovered.length,
      originsImported: stats.originsImported,
      entriesImported: stats.entriesImported,
      originsSkipped: stats.originsSkipped,
      originsFailed: stats.originsFailed
    });
    return stats;
  } catch (error) {
    console.info("[lyra-browser-import] localStorage import failed", {
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
    return emptyStats("local_storage_unavailable");
  } finally {
    // Chromium may still be flushing the copied storage after its window closes.
    await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(
      () => undefined
    );
  }
};
