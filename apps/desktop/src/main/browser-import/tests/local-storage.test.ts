import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

type Entry = [string, string];

/** The storage a hidden session serves, keyed by origin. */
type OriginSession = { readonly storage: Map<string, Entry[]> };

/**
 * Stands in for the two kinds of Chromium session the importer opens: a copied
 * profile holding the source entries, and Lyra's own browser profile receiving
 * them. Reads and writes go through the same expressions the real module
 * evaluates, so the fake only has to serve storage per origin.
 *
 * It also stands in for Chromium's networking. A navigation only becomes a page
 * because the importer intercepts it and serves a blank document; anything that
 * would have left the machine is recorded instead of sent.
 */
const electronMock = vi.hoisted(() => {
  const sessions = new Map<string, OriginSession>();
  const windows: Array<{ isDestroyed: () => boolean }> = [];
  const state = {
    sessions,
    windows,
    /** http(s) URLs the importer tried to fetch for real; this must stay empty. */
    networkLoads: [] as string[],
    /** CDP methods sent, in order. */
    cdpCommands: [] as string[],
    /** Base64 bodies served in place of every site. */
    servedDocuments: [] as string[],
    /** Requests interception paused and never answered. */
    unansweredRequests: [] as string[],
    seed: null as ((session: OriginSession) => void) | null,
    reset: () => {
      sessions.clear();
      windows.length = 0;
      state.networkLoads.length = 0;
      state.cdpCommands.length = 0;
      state.servedDocuments.length = 0;
      state.unansweredRequests.length = 0;
      state.seed = null;
    }
  };
  return state;
});

vi.mock("electron", () => {
  class FakeWebContents {
    origin = "about:blank";
    private fetchEnabled = false;
    private attached = false;
    private requestCount = 0;
    private readonly pausedOrigins = new Map<string, string>();
    private readonly messageHandlers = new Set<
      (event: unknown, method: string, params: unknown) => void
    >();

    constructor(private readonly target: OriginSession) {}

    readonly debugger = {
      isAttached: (): boolean => this.attached,
      attach: (): void => {
        this.attached = true;
      },
      detach: (): void => {
        this.attached = false;
      },
      on: (_event: string, handler: (event: unknown, method: string, params: unknown) => void) => {
        this.messageHandlers.add(handler);
      },
      off: (_event: string, handler: (event: unknown, method: string, params: unknown) => void) => {
        this.messageHandlers.delete(handler);
      },
      sendCommand: (method: string, params: Record<string, unknown> = {}): Promise<unknown> => {
        electronMock.cdpCommands.push(method);
        if (method === "Fetch.enable") {
          this.fetchEnabled = true;
          return Promise.resolve({});
        }
        const requestId = typeof params.requestId === "string" ? params.requestId : null;
        if (requestId !== null) {
          const index = electronMock.unansweredRequests.indexOf(requestId);
          if (index >= 0) {
            electronMock.unansweredRequests.splice(index, 1);
          }
          if (method === "Fetch.fulfillRequest") {
            // The blank document only becomes this origin's page because the
            // importer answered the request asking for it.
            this.origin = this.pausedOrigins.get(requestId) ?? this.origin;
            electronMock.servedDocuments.push(String(params.body));
          }
          this.pausedOrigins.delete(requestId);
        }
        return Promise.resolve({});
      }
    };

    setAudioMuted(): void {}

    setWindowOpenHandler(): () => void {
      return () => {};
    }

    stop(): void {}

    async loadURL(url: string): Promise<void> {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        this.origin = parsed.origin;
        return;
      }
      if (!this.fetchEnabled) {
        electronMock.networkLoads.push(url);
        throw new Error(`ERR_INTERNET_DISCONNECTED: ${url}`);
      }
      this.pause(parsed.origin, "Document");
      // Chromium asks for a page's favicon once it has a document; it must be
      // aborted rather than fetched.
      this.pause(parsed.origin, "Other");
    }

    async executeJavaScript(expression: string): Promise<unknown> {
      if (expression.includes("Object.entries(localStorage)")) {
        return JSON.stringify({
          origin: this.origin,
          entries: this.target.storage.get(this.origin) ?? []
        });
      }
      const literal = /JSON\.parse\((".*")\)/su.exec(expression);
      if (literal === null) {
        throw new Error("unexpected expression");
      }
      const record = JSON.parse(JSON.parse(literal[1]!)) as {
        origin: string;
        entries: Entry[];
      };
      if (this.origin !== record.origin) {
        return -1;
      }
      this.target.storage.set(record.origin, record.entries);
      return record.entries.length;
    }

    private pause(origin: string, resourceType: string): void {
      this.requestCount += 1;
      const requestId = `request-${this.requestCount}`;
      this.pausedOrigins.set(requestId, origin);
      electronMock.unansweredRequests.push(requestId);
      for (const handler of this.messageHandlers) {
        handler({}, "Fetch.requestPaused", { requestId, resourceType });
      }
    }
  }

  class FakeBrowserWindow {
    readonly webContents: FakeWebContents;
    private destroyed = false;

    constructor(options: { readonly webPreferences?: { readonly session?: OriginSession } }) {
      this.webContents = new FakeWebContents(
        options.webPreferences?.session ?? { storage: new Map() }
      );
      electronMock.windows.push(this);
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    loadURL(url: string): Promise<void> {
      return this.webContents.loadURL(url);
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  return {
    BrowserWindow: FakeBrowserWindow,
    session: {
      fromPath: (path: string): OriginSession => {
        const existing = electronMock.sessions.get(path);
        if (existing !== undefined) {
          return existing;
        }
        const created: OriginSession = { storage: new Map() };
        electronMock.sessions.set(path, created);
        electronMock.seed?.(created);
        return created;
      }
    }
  };
});

const { discoverChromiumLocalStorageOrigins, importProfileLocalStorage } = await import(
  "../local-storage"
);

type FakeSession = OriginSession & {
  flushCalls: number;
  flushStorageData: () => void;
};

/** Lyra's own browser profile, as the importer sees it. */
const createTargetSession = (): FakeSession => ({
  storage: new Map(),
  flushCalls: 0,
  flushStorageData(this: FakeSession) {
    this.flushCalls += 1;
  }
});

const temporaryPaths: string[] = [];

const createTempPath = (prefix: string): string => {
  const path = mkdtempSync(join(tmpdir(), prefix));
  temporaryPaths.push(path);
  return path;
};

/** A Chromium profile whose Local Storage LevelDB advertises these origins. */
const createChromiumProfile = (origins: readonly string[]): string => {
  const profilePath = createTempPath("lyra-browser-profile-");
  const levelDbPath = join(profilePath, "Local Storage", "leveldb");
  mkdirSync(levelDbPath, { recursive: true });
  writeFileSync(
    join(levelDbPath, "000001.log"),
    Buffer.concat(origins.map((origin) => Buffer.from(`META:${origin}\u0000`, "latin1")))
  );
  return profilePath;
};

beforeEach(() => {
  electronMock.reset();
});

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("discoverChromiumLocalStorageOrigins", () => {
  test("reads only valid origin metadata out of the LevelDB files", async () => {
    const profilePath = createTempPath("lyra-local-storage-scan-");
    const levelDbPath = join(profilePath, "Local Storage", "leveldb");
    mkdirSync(levelDbPath, { recursive: true });
    writeFileSync(
      join(levelDbPath, "000005.ldb"),
      Buffer.concat([
        Buffer.from("META:https://example.com", "latin1"),
        Buffer.from([0, 1, 255, 7]),
        Buffer.from("META:http://localhost:5173", "latin1"),
        Buffer.from("META:chrome-extension://cbnaodkpfinfiipjblikofhlhlcickei", "latin1"),
        Buffer.from("META:https://example.com", "latin1"),
        Buffer.from("META:not-a-url", "latin1")
      ])
    );

    expect(await discoverChromiumLocalStorageOrigins(join(profilePath, "Local Storage"))).toEqual([
      "http://localhost:5173",
      "https://example.com"
    ]);
  });

  test("returns nothing when the profile has no LevelDB directory", async () => {
    const profilePath = createTempPath("lyra-local-storage-empty-");
    expect(await discoverChromiumLocalStorageOrigins(join(profilePath, "Local Storage"))).toEqual(
      []
    );
  });
});

describe("importProfileLocalStorage", () => {
  test("copies every readable origin into the target session", async () => {
    const profilePath = createChromiumProfile([
      "https://example.com",
      "https://other.example",
      "https://empty.example"
    ]);
    electronMock.seed = (session) => {
      session.storage.set("https://example.com", [
        ["token", "abc"],
        ["theme", "dark"]
      ]);
      session.storage.set("https://other.example", [["flag", "1"]]);
    };
    const target = createTargetSession();

    const stats = await importProfileLocalStorage({ profilePath, session: target as never });

    expect(stats).toEqual({
      originsImported: 2,
      entriesImported: 3,
      originsSkipped: 1,
      originsFailed: 0
    });
    expect(target.storage.get("https://example.com")).toEqual([
      ["token", "abc"],
      ["theme", "dark"]
    ]);
    expect(target.storage.get("https://other.example")).toEqual([["flag", "1"]]);
    expect(target.flushCalls).toBe(1);
    // The copied profile's window and the writing window are both released.
    expect(electronMock.windows.map((window) => window.isDestroyed())).toEqual([true, true]);
  });

  test("keeps entries of sites that are down or that bounce the frame elsewhere", async () => {
    // None of these sites is reachable or stays on its own origin in reality;
    // the entries still come across, because the site is never asked for them.
    const profilePath = createChromiumProfile([
      "https://example.com",
      "https://offline.example",
      "https://login-wall.example"
    ]);
    electronMock.seed = (session) => {
      session.storage.set("https://example.com", [["token", "abc"]]);
      session.storage.set("https://offline.example", [["draft", "keep"]]);
      session.storage.set("https://login-wall.example", [["session", "stale"]]);
    };
    const target = createTargetSession();

    const stats = await importProfileLocalStorage({ profilePath, session: target as never });

    expect(stats).toEqual({
      originsImported: 3,
      entriesImported: 3,
      originsSkipped: 0,
      originsFailed: 0
    });
    expect(target.storage.get("https://offline.example")).toEqual([["draft", "keep"]]);
    expect(target.storage.get("https://login-wall.example")).toEqual([["session", "stale"]]);
  });

  test("answers navigations with a local blank document and drops everything else", async () => {
    const profilePath = createChromiumProfile(["https://example.com"]);
    electronMock.seed = (session) => {
      session.storage.set("https://example.com", [["token", "abc"]]);
    };
    const target = createTargetSession();

    await importProfileLocalStorage({ profilePath, session: target as never });

    // One interception per hidden window: the copied source profile, then
    // Lyra's own profile.
    expect(electronMock.cdpCommands.filter((command) => command === "Fetch.enable")).toHaveLength(2);
    expect(electronMock.servedDocuments).toHaveLength(2);
    for (const body of electronMock.servedDocuments) {
      expect(Buffer.from(body, "base64").toString("utf8")).toContain("<!doctype html>");
    }
    // Each page's favicon request was refused, so nothing was left waiting.
    expect(electronMock.cdpCommands.filter((command) => command === "Fetch.failRequest")).toHaveLength(
      2
    );
    expect(electronMock.unansweredRequests).toEqual([]);
    // The point of the whole exercise: no site was contacted.
    expect(electronMock.networkLoads).toEqual([]);
  });

  test("does nothing when the profile has no website storage", async () => {
    const profilePath = createTempPath("lyra-browser-profile-empty-");
    const target = createTargetSession();

    const stats = await importProfileLocalStorage({ profilePath, session: target as never });

    expect(stats).toEqual({
      originsImported: 0,
      entriesImported: 0,
      originsSkipped: 0,
      originsFailed: 0
    });
    expect(electronMock.windows).toHaveLength(0);
    expect(electronMock.cdpCommands).toEqual([]);
    expect(target.flushCalls).toBe(0);
  });
});
