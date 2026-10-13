import type { Session } from "electron";

import type {
  BrowserRecoveryAnchor,
  BrowserSessionSnapshot,
  BrowserSessionTabSnapshot,
  BrowserSiteStorageAvailability,
  BrowserStorageStateRef,
  WorkbenchBrowserLayoutSnapshot,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserRecoveryFailure,
  WorkbenchBrowserTopologySnapshot
} from "../../../shared/desktop-bridge";
import type { LyraPerformanceResourceDescriptor } from "../../../shared/performance-kernel";
import {
  WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
  WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
  createBrowserStorageStateRef,
  sanitizeBrowserPageRestoreState,
  sanitizeBrowserSessionSnapshot
} from "../../../shared/workbench-browser";
import type { LyraPerformanceResourceScheduler } from "../../performance";
import type { WorkbenchBrowserPublishEvent } from "../types";
import {
  BROWSER_SESSION_SNAPSHOT_WRITE_DELAY_MS,
  BROWSER_SESSION_STATE_KEY,
  DEFAULT_PAGE_TITLE,
  normalizeAddress,
  normalizeString,
  normalizeWebOrigin,
  resolveBrowserCoreKey,
  runtimeStateEquals
} from "./normalizers";
import type { BrowserPageEntry, BrowserPageTombstone } from "./types";

export const createBrowserSessionRuntime = ({
  workbenchState,
  entries,
  tombstones,
  hasActiveLiveAgentBrowserTask,
  hasUserInputDirtyTab,
  publishEvent,
  performanceScheduler,
  readTopology,
  readLayoutSnapshot,
  liveElectronSession
}: {
  readonly workbenchState: {
    readonly readState: (key: typeof BROWSER_SESSION_STATE_KEY) => string | null;
    readonly writeState: (key: typeof BROWSER_SESSION_STATE_KEY, json: string) => void;
  } | undefined;
  readonly entries: Map<string, BrowserPageEntry>;
  readonly tombstones: Map<string, BrowserPageTombstone>;
  readonly hasActiveLiveAgentBrowserTask: (tabId: string) => boolean;
  readonly hasUserInputDirtyTab: (tabId: string) => boolean;
  readonly publishEvent: WorkbenchBrowserPublishEvent;
  readonly performanceScheduler?: LyraPerformanceResourceScheduler | undefined;
  readonly readTopology: () => WorkbenchBrowserTopologySnapshot;
  readonly readLayoutSnapshot: () => WorkbenchBrowserLayoutSnapshot;
  readonly liveElectronSession: () => Session;
}) => {
let persistedBrowserSessionSnapshot: BrowserSessionSnapshot | null = (() => {
  const raw = workbenchState?.readState(BROWSER_SESSION_STATE_KEY) ?? null;
  if (raw === null) {
    return null;
  }
  try {
    return sanitizeBrowserSessionSnapshot(JSON.parse(raw));
  } catch (_error) {
    return null;
  }
})();
let lastBrowserSessionSnapshotJson =
  persistedBrowserSessionSnapshot === null
    ? null
    : JSON.stringify(persistedBrowserSessionSnapshot);
let disposed = false;
let browserSessionSnapshotWriteTimer: ReturnType<typeof setTimeout> | null = null;

const persistedTabSnapshot = (tabId: string): BrowserSessionTabSnapshot | null =>
  persistedBrowserSessionSnapshot?.tabs.find((tab) => tab.tabId === tabId) ?? null;

const sessionStoragePath = (electronSession: Session): string | null => {
  try {
    return electronSession.getStoragePath();
  } catch (_error) {
    return null;
  }
};

const storageStateFromSites = (
  sites: readonly BrowserSiteStorageAvailability[]
): BrowserStorageStateRef => {
  const cookieCount = sites.reduce((total, site) => total + site.cookieCount, 0);
  const hasLocalStorage = sites.some((site) => site.localStorage === "available");
  const hasSessionStorage = sites.some((site) => site.sessionStorage === "available");
  const hasIndexedDB = sites.some((site) => site.indexedDB === "available");
  return {
    ...createBrowserStorageStateRef({
      profileMode: "live",
      profilePartition: WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
      chromiumStoragePath: sessionStoragePath(liveElectronSession()),
      sites
    }),
    cookies: {
      availability: cookieCount > 0 ? "available" : "unknown",
      manifestOnly: true,
      count: cookieCount
    },
    localStorage: {
      availability: hasLocalStorage ? "available" : "unknown",
      manifestOnly: true
    },
    sessionStorage: {
      availability: hasSessionStorage ? "available" : "unknown",
      manifestOnly: true
    },
    indexedDB: {
      availability: hasIndexedDB ? "available" : "unknown",
      manifestOnly: true
    },
    cacheStorage: {
      availability: "unknown",
      manifestOnly: true
    }
  };
};

const authStateFromStorage = (
  storage: BrowserSiteStorageAvailability | undefined
): BrowserRecoveryAnchor["authState"] => {
  if (storage === undefined) {
    return "unknown";
  }
  if (storage.cookieCount > 0) {
    return "possibly_logged_in";
  }
  if (
    storage.localStorage === "available" ||
    storage.sessionStorage === "available" ||
    storage.indexedDB === "available"
  ) {
    return "possibly_logged_in";
  }
  return "unknown";
};

const buildRecoveryAnchor = (
  tab: BrowserSessionTabSnapshot | null
): BrowserRecoveryAnchor | undefined => {
  if (tab === null) {
    return undefined;
  }
  const siteOrigin = normalizeWebOrigin(tab.address) ?? undefined;
  const activeTargetRef =
    tab.restoreState.activeElement?.targetRef ??
    tab.restoreState.targetRegistry?.activeTargetRef;
  return {
    schemaVersion: WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    tabId: tab.tabId,
    address: tab.address,
    title: tab.title,
    ...(activeTargetRef === undefined ? {} : { targetRef: activeTargetRef }),
    ...(tab.restoreState.textHash === undefined ? {} : { textHash: tab.restoreState.textHash }),
    storageStateRef: {
      profilePartition: tab.profilePartition,
      ...(siteOrigin === undefined ? {} : { siteOrigin })
    },
    authState: authStateFromStorage(tab.restoreState.storage),
    capturedAt: tab.restoreState.capturedAt
  };
};

const tabSnapshotFromRuntime = (
  runtime: WorkbenchBrowserPageRuntimeState,
  fallbackAddress: string,
  fallbackTitle: string | null,
  recoveryFailure?: WorkbenchBrowserRecoveryFailure
): BrowserSessionTabSnapshot | null => {
  const restoreState =
    runtime.restoreState ??
    persistedTabSnapshot(runtime.tabId)?.restoreState ??
    sanitizeBrowserPageRestoreState({
      capturedAt: Date.now(),
      loadState: runtime.isLoading ? "loading" : "idle"
    });
  if (restoreState === undefined) {
    return null;
  }
  return {
    tabId: runtime.tabId,
    address: normalizeAddress(runtime.address) ?? normalizeAddress(fallbackAddress) ?? "about:blank",
    title: normalizeString(runtime.title) ?? fallbackTitle ?? DEFAULT_PAGE_TITLE,
    ...(runtime.faviconUrl === undefined ? {} : { faviconUrl: runtime.faviconUrl }),
    isActive: runtime.isActive,
    ...(runtime.lifecycleState === undefined ? {} : { lifecycleState: runtime.lifecycleState }),
    canGoBack: runtime.canGoBack,
    canGoForward: runtime.canGoForward,
    profilePartition: WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
    restoreState,
    ...(recoveryFailure === undefined ? {} : { recoveryFailure })
  };
};

const buildBrowserSessionSnapshot = (): BrowserSessionSnapshot | null => {
  const topology = readTopology();
  if (topology.pages.length === 0 && persistedBrowserSessionSnapshot !== null) {
    return persistedBrowserSessionSnapshot;
  }
  const tabs: BrowserSessionTabSnapshot[] = [];
  for (const page of topology.pages) {
    const entry = entries.get(page.tabId);
    const tombstone = tombstones.get(page.tabId);
    const persisted = persistedTabSnapshot(page.tabId);
    const snapshot =
      entry !== undefined
        ? tabSnapshotFromRuntime(entry.runtime, entry.requestedAddress, entry.titleHint)
        : tombstone !== undefined
          ? tabSnapshotFromRuntime(
              tombstone.runtime,
              tombstone.requestedAddress,
              tombstone.titleHint,
              tombstone.recoveryFailure
            )
          : persisted !== null
            ? {
                ...persisted,
                isActive: page.isActive,
                address: page.address,
                title: page.titleHint ?? persisted.title
              }
            : null;
    if (snapshot !== null) {
      tabs.push(snapshot);
    }
  }
  if (tabs.length === 0) {
    return null;
  }
  const activeTabId =
    topology.activeTabId !== null && tabs.some((tab) => tab.tabId === topology.activeTabId)
      ? topology.activeTabId
      : tabs.find((tab) => tab.isActive)?.tabId ?? tabs[0]?.tabId ?? null;
  const storageSites = tabs
    .map((tab) => tab.restoreState.storage)
    .filter((site): site is BrowserSiteStorageAvailability => site !== undefined);
  const activeTab = activeTabId === null
    ? null
    : tabs.find((tab) => tab.tabId === activeTabId) ?? null;
  const recoveryAnchor = buildRecoveryAnchor(activeTab);
  return {
    schemaVersion: WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: `browser-session-${Date.now()}`,
    capturedAt: Date.now(),
    activeTabId,
    layout: readLayoutSnapshot(),
    tabs,
    storageState: storageStateFromSites(storageSites),
    ...(recoveryAnchor === undefined ? {} : { recoveryAnchor }),
    migrations: persistedBrowserSessionSnapshot?.migrations ?? []
  };
};

const persistBrowserSessionSnapshot = (): BrowserSessionSnapshot | null => {
  if (disposed) return persistedBrowserSessionSnapshot;
  if (browserSessionSnapshotWriteTimer !== null) {
    clearTimeout(browserSessionSnapshotWriteTimer);
    browserSessionSnapshotWriteTimer = null;
  }
  const snapshot = buildBrowserSessionSnapshot();
  persistedBrowserSessionSnapshot = snapshot;
  if (snapshot === null || workbenchState === undefined) {
    return snapshot;
  }
  const json = JSON.stringify(snapshot);
  if (json === lastBrowserSessionSnapshotJson) {
    return snapshot;
  }
  lastBrowserSessionSnapshotJson = json;
  workbenchState.writeState(BROWSER_SESSION_STATE_KEY, json);
  return snapshot;
};

const scheduleBrowserSessionSnapshotWrite = (delayMs = BROWSER_SESSION_SNAPSHOT_WRITE_DELAY_MS): void => {
  if (disposed || workbenchState === undefined) {
    return;
  }
  if (browserSessionSnapshotWriteTimer !== null) {
    clearTimeout(browserSessionSnapshotWriteTimer);
  }
  browserSessionSnapshotWriteTimer = setTimeout(() => {
    browserSessionSnapshotWriteTimer = null;
    persistBrowserSessionSnapshot();
  }, Math.max(0, delayMs));
};

const toPerformanceLifecycle = (
  lifecycle: WorkbenchBrowserPageRuntimeState["lifecycleState"]
): LyraPerformanceResourceDescriptor["lifecycle"] => {
  switch (lifecycle) {
    case "foreground":
      return "foreground";
    case "visible":
      return "visible";
    case "hot-hidden":
      return "hotHidden";
    case "tombstoned":
      return "tombstoned";
    case "restoring":
      return "restoring";
    default:
      return "hotHidden";
  }
};

const readWebContentsProcessId = (entry: BrowserPageEntry | undefined): number | undefined => {
  if (entry === undefined || entry.webContents.isDestroyed()) {
    return undefined;
  }
  try {
    const processId = entry.webContents.getOSProcessId();
    return Number.isFinite(processId) && processId > 0 ? processId : undefined;
  } catch {
    return undefined;
  }
};

const toPerformanceBrowserResource = (
  runtime: WorkbenchBrowserPageRuntimeState,
  entry?: BrowserPageEntry
): LyraPerformanceResourceDescriptor => {
  const formDraft = runtime.restoreState?.formDraft;
  const storage = runtime.restoreState?.storage;
  const historyEntryCount = runtime.restoreState?.history?.entries.length ?? 0;
  const processId = readWebContentsProcessId(entry);
  const webContentsId =
    entry === undefined || entry.webContents.isDestroyed()
      ? undefined
      : entry.webContents.id;
  return {
    resourceId: `browserPage:${runtime.tabId}`,
    kind: "browserPage",
    coreKey: runtime.coreKey ?? resolveBrowserCoreKey(runtime.address),
    stateKey: runtime.stateKey ?? `web-state:${runtime.tabId}`,
    lifecycle: toPerformanceLifecycle(runtime.lifecycleState),
    visible: runtime.isVisible,
    active: runtime.isActive,
    signals: {
      hasUserInput: hasUserInputDirtyTab(runtime.tabId),
      hasFormDraft: (formDraft?.editedFieldCount ?? 0) > 0,
      hasAgentControl: hasActiveLiveAgentBrowserTask(runtime.tabId),
      hasDivergentHistory: historyEntryCount > 1,
      isLoading: runtime.isLoading,
      isFullscreen: runtime.isHtmlFullscreen,
      unknown: runtime.recoveryFailure !== undefined
    },
    isolation: {
      containsSensitiveInput: (formDraft?.passwordFieldCount ?? 0) > 0,
      authenticatedSession: (storage?.cookieCount ?? 0) > 0,
      crossOriginState: storage?.localStorage === "available"
        || storage?.indexedDB === "available"
        || storage?.sessionStorage === "available"
    },
    ...(processId === undefined ? {} : { processId }),
    ...(webContentsId === undefined ? {} : { webContentsId }),
    sharedSignature: runtime.address,
    updatedAt: runtime.updatedAt
  };
};

const syncPerformanceRuntimeState = (
  runtime: WorkbenchBrowserPageRuntimeState,
  entry?: BrowserPageEntry
): void => {
  performanceScheduler?.updateResource(toPerformanceBrowserResource(runtime, entry));
};

const updateRuntimeState = (
  entry: BrowserPageEntry,
  patch: Partial<WorkbenchBrowserPageRuntimeState>
): void => {
  if (entry.isDestroyed) {
    return;
  }
  const nextRuntime: WorkbenchBrowserPageRuntimeState = {
    ...entry.runtime,
    ...patch,
    updatedAt: Date.now()
  };
  if (runtimeStateEquals(entry.runtime, nextRuntime)) {
    return;
  }
  entry.runtime = nextRuntime;
  syncPerformanceRuntimeState(nextRuntime, entry);
  publishEvent({
    kind: "page-runtime-state",
    page: nextRuntime
  });
  scheduleBrowserSessionSnapshotWrite();
};

const publishRuntimeState = (runtime: WorkbenchBrowserPageRuntimeState): void => {
  syncPerformanceRuntimeState(runtime);
  publishEvent({
    kind: "page-runtime-state",
    page: runtime
  });
  scheduleBrowserSessionSnapshotWrite();
};

const navigationHistorySnapshot = (
  entry: BrowserPageEntry
): NonNullable<WorkbenchBrowserPageRuntimeState["restoreState"]>["history"] | undefined => {
  try {
    const entries = entry.webContents.navigationHistory
      .getAllEntries()
      .map((historyEntry) => {
        const url = normalizeAddress(historyEntry.url);
        if (url === null) {
          return null;
        }
        return {
          url,
          title: normalizeString(historyEntry.title) ?? url,
          ...(entry.runtime.faviconUrl === undefined || url !== entry.runtime.address
            ? {}
            : { faviconUrl: entry.runtime.faviconUrl }),
          timestamp: Date.now()
        };
      })
      .filter((historyEntry): historyEntry is NonNullable<
        NonNullable<WorkbenchBrowserPageRuntimeState["restoreState"]>["history"]
      >["entries"][number] => historyEntry !== null);
    if (entries.length === 0) {
      return undefined;
    }
    const currentIndex = Math.max(
      0,
      Math.min(entries.length - 1, entry.webContents.navigationHistory.getActiveIndex())
    );
    return {
      entries,
      currentIndex
    };
  } catch (_error) {
    return entry.runtime.restoreState?.history;
  }
};

const readPageStorageAvailability = async (
  entry: BrowserPageEntry
): Promise<BrowserSiteStorageAvailability | undefined> => {
  const origin = normalizeWebOrigin(entry.runtime.address);
  if (origin === null || entry.webContents.isDestroyed()) {
    return undefined;
  }
  const cookieCount = await entry.webContents.session.cookies
    .get({ url: origin })
    .then((cookies) => cookies.length)
    .catch(() => 0);
  const availability = await entry.webContents.executeJavaScript(`
    (async () => {
      const result = {
        localStorage: "unknown",
        sessionStorage: "unknown",
        indexedDB: "unknown"
      };
      try {
        result.localStorage = window.localStorage && window.localStorage.length > 0
          ? "available"
          : "unavailable";
      } catch (_error) {
        result.localStorage = "unavailable";
      }
      try {
        result.sessionStorage = window.sessionStorage && window.sessionStorage.length > 0
          ? "available"
          : "unavailable";
      } catch (_error) {
        result.sessionStorage = "unavailable";
      }
      try {
        if (typeof indexedDB?.databases === "function") {
          const databases = await indexedDB.databases();
          result.indexedDB = Array.isArray(databases) && databases.length > 0
            ? "available"
            : "unavailable";
        }
      } catch (_error) {
        result.indexedDB = "unknown";
      }
      return result;
    })()
  `, true)
    .catch(() => ({})) as Record<string, unknown>;
  const toAvailability = (value: unknown): BrowserSiteStorageAvailability["localStorage"] =>
    value === "available" || value === "unavailable" || value === "unknown"
      ? value
      : "unknown";
  return {
    origin,
    cookieCount,
    localStorage: toAvailability(availability.localStorage),
    sessionStorage: toAvailability(availability.sessionStorage),
    indexedDB: toAvailability(availability.indexedDB),
    capturedAt: Date.now()
  };
};


  const dispose = (): void => {
    if (disposed) return;
    if (browserSessionSnapshotWriteTimer !== null) {
      clearTimeout(browserSessionSnapshotWriteTimer);
      browserSessionSnapshotWriteTimer = null;
    }
    // Capture while entries and topology still exist; enqueue before the
    // application waits for the workbench state's disk-write barrier.
    persistBrowserSessionSnapshot();
    disposed = true;
  };

  return {
    dispose,
    hasActiveLiveAgentBrowserTask,
    navigationHistorySnapshot,
    persistBrowserSessionSnapshot,
    persistedTabSnapshot,
    publishRuntimeState,
    readPageStorageAvailability,
    scheduleBrowserSessionSnapshotWrite,
    sessionStoragePath,
    syncPerformanceRuntimeState,
    updateRuntimeState
  };
};
