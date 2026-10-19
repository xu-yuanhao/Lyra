import {
  BrowserWindow,
  shell,
  type Session,
  type WebContents
} from "electron";

import {
  WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION
} from "../../../shared/workbench-browser";
import { WORKBENCH_BROWSER_AGENT_STANDALONE_TAB_ID } from "../types";
import type {
  WorkbenchBrowserAgentModeReason,
  WorkbenchBrowserAgentModeRequest,
  WorkbenchBrowserAgentTargetMode
} from "../types";
import {
  defaultBrowserMode,
  liveAgentTarget,
  normalizeBrowserAgentModeRequest,
  wantsLiveLoginState
} from "./agent-target-runtime";
import { isSafeExternalUrl } from "../../security";
import { attachLyraInternalNavigationGuard, consumeLyraInternalUrl, grantBrowserAuthorizeAct } from "../../open-in-workbench";
import {
  isSupportedWebUrl,
  normalizeAddress,
  normalizeExecuteScriptTimeoutMs,
  normalizeString,
  normalizeWebOrigin,
  runFrameScriptWithTimeout
} from "./normalizers";
import type {
  BrowserAgentLoginBorrowResult,
  BrowserAgentPageTarget,
  BrowserAgentShadowEntry,
  BrowserPageEntry
} from "./types";

type AgentShadowControllerHost = {
  readonly getWindow: () => BrowserWindow | null;
  readonly getEntry: (tabId: string) => BrowserPageEntry | undefined;
  readonly ensureLiveEntry?: (tabId: string) => BrowserPageEntry | undefined;
  readonly liveElectronSession: () => Session;
  readonly isolatedElectronSession: () => Session;
  readonly cancelPendingAgentPageLoad: (webContents: WebContents) => void;
  readonly waitForAgentPageLoad: (
    webContents: WebContents,
    url: string,
    timeoutMs: number,
    options?: { readonly waitForReady?: boolean }
  ) => Promise<void>;
  readonly disposeCdpAuditSession: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ) => void;
  readonly disposeDebuggerSession: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ) => void;
  readonly invalidateBrowserAgentTargets: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode,
    reason?: "navigation" | "frameReload"
  ) => void;
};

export const createAgentShadowController = ({
  getWindow,
  getEntry,
  ensureLiveEntry,
  liveElectronSession,
  isolatedElectronSession,
  cancelPendingAgentPageLoad,
  waitForAgentPageLoad,
  disposeCdpAuditSession,
  disposeDebuggerSession,
  invalidateBrowserAgentTargets
}: AgentShadowControllerHost) => {
  const browserAgentShadows = new Map<string, BrowserAgentShadowEntry>();

  const destroyBrowserAgentShadow = (tabId: string): void => {
    const shadow = browserAgentShadows.get(tabId);
    if (shadow === undefined) {
      return;
    }
    browserAgentShadows.delete(tabId);
    disposeCdpAuditSession(tabId, shadow.targetMode);
    disposeDebuggerSession(tabId, shadow.targetMode);
    if (shadow.webContents.isDestroyed() === false) {
      cancelPendingAgentPageLoad(shadow.webContents);
      shadow.webContents.close({ waitForBeforeUnload: false });
    }
    if (shadow.window.isDestroyed() === false) {
      shadow.window.destroy();
    }
  };

  const wireShadowWebContents = (
    shadow: BrowserAgentShadowEntry,
    webContents: WebContents
  ): void => {
    webContents.setWindowOpenHandler(({ url }) => {
      if (consumeLyraInternalUrl(url)) {
        return { action: "deny" };
      }
      if (isSupportedWebUrl(url)) {
        grantBrowserAuthorizeAct(url, shadow.tabId);
        void waitForAgentPageLoad(webContents, url, 8_000, { waitForReady: true }).then(() => {
          shadow.address = normalizeAddress(webContents.getURL()) ?? url;
          shadow.title = normalizeString(webContents.getTitle()) ?? shadow.address;
          shadow.detached = true;
        });
      } else if (isSafeExternalUrl(url)) {
        void shell.openExternal(url).catch(() => undefined);
      }
      return { action: "deny" };
    });
    attachLyraInternalNavigationGuard(webContents);
    webContents.on("page-title-updated", (_event, title) => {
      shadow.title = normalizeString(title) ?? shadow.address;
    });
    webContents.on("page-favicon-updated", (_event, favicons) => {
      const faviconUrl = favicons.find((item) => item.trim().length > 0);
      if (faviconUrl !== undefined) {
        shadow.faviconUrl = faviconUrl;
      }
    });
    webContents.on("did-start-loading", () => {
      shadow.isLoading = true;
    });
    webContents.on("did-stop-loading", () => {
      shadow.isLoading = false;
      shadow.address = normalizeAddress(webContents.getURL()) ?? shadow.address;
      shadow.title = normalizeString(webContents.getTitle()) ?? shadow.title;
    });
    webContents.on("did-navigate", (_event, url) => {
      grantBrowserAuthorizeAct(url, shadow.tabId);
      shadow.address = normalizeAddress(url) ?? shadow.address;
      shadow.faviconUrl = undefined;
      invalidateBrowserAgentTargets(shadow.tabId, shadow.targetMode, "navigation");
    });
    webContents.on("did-navigate-in-page", (_event, url) => {
      grantBrowserAuthorizeAct(url, shadow.tabId);
      shadow.address = normalizeAddress(url) ?? shadow.address;
      invalidateBrowserAgentTargets(shadow.tabId, shadow.targetMode, "navigation");
    });
    webContents.on("did-frame-navigate", (_event, _url, _code, _status, isMainFrame) => {
      if (!isMainFrame) {
        invalidateBrowserAgentTargets(shadow.tabId, shadow.targetMode, "frameReload");
      }
    });
    webContents.on("frame-created", () => {
      invalidateBrowserAgentTargets(shadow.tabId, shadow.targetMode, "frameReload");
    });
  };

  const createBrowserAgentShadow = (source: BrowserPageEntry): BrowserAgentShadowEntry => {
    const width = Math.max(480, Math.round(source.layout?.width ?? 1366));
    const height = Math.max(360, Math.round(source.layout?.height ?? 900));
    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      paintWhenInitiallyHidden: true,
      width,
      height,
      webPreferences: {
        // Offscreen automation window: the agent drives this page while it is
        // hidden, so Chromium must not clamp its timers.
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        partition: WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION,
        offscreen: true,
        sandbox: true,
        spellcheck: true
      }
    });
    window.setMenuBarVisibility(false);
    const { webContents } = window;
    const shadow: BrowserAgentShadowEntry = {
      tabId: source.tabId,
      sourceTabId: source.tabId,
      window,
      webContents,
      targetMode: "isolated",
      browserMode: defaultBrowserMode("isolated"),
      address: "about:blank",
      title: "Lyra Lumen",
      isLoading: false,
      detached: false
    };
    wireShadowWebContents(shadow, webContents);
    window.on("closed", () => {
      browserAgentShadows.delete(shadow.tabId);
    });
    browserAgentShadows.set(source.tabId, shadow);
    return shadow;
  };

  const createStandaloneBrowserAgentShadow = (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode = "isolated"
  ): BrowserAgentShadowEntry => {
    const windowBounds = getWindow()?.getContentBounds();
    const width = Math.max(480, Math.round(windowBounds?.width ?? 1366));
    const height = Math.max(360, Math.round(windowBounds?.height ?? 900));
    const window = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      paintWhenInitiallyHidden: true,
      width,
      height,
      webPreferences: {
        // Offscreen automation window: the agent drives this page while it is
        // hidden, so Chromium must not clamp its timers.
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        partition: WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION,
        offscreen: true,
        sandbox: true,
        spellcheck: true
      }
    });
    window.setMenuBarVisibility(false);
    const { webContents } = window;
    const shadow: BrowserAgentShadowEntry = {
      tabId,
      sourceTabId: tabId,
      window,
      webContents,
      targetMode,
      browserMode: defaultBrowserMode(targetMode),
      address: "about:blank",
      title: "Lyra Lumen",
      isLoading: false,
      detached: true
    };
    wireShadowWebContents(shadow, webContents);
    window.on("closed", () => {
      browserAgentShadows.delete(shadow.tabId);
    });
    browserAgentShadows.set(tabId, shadow);
    return shadow;
  };

  const ensureBrowserAgentShadow = async (
    source: BrowserPageEntry,
    timeoutMs: number | undefined
  ): Promise<BrowserAgentShadowEntry> => {
    const shadow = browserAgentShadows.get(source.tabId) ?? createBrowserAgentShadow(source);
    const sourceAddress = normalizeAddress(source.webContents.getURL()) ?? source.runtime.address;
    const shouldSyncFromSource =
      shadow.detached === false
      && normalizeAddress(shadow.webContents.getURL()) !== sourceAddress;
    if (shouldSyncFromSource) {
      await waitForAgentPageLoad(shadow.webContents, sourceAddress, timeoutMs ?? 8_000, {
        waitForReady: true
      });
      shadow.address = normalizeAddress(shadow.webContents.getURL()) ?? sourceAddress;
      shadow.title = normalizeString(shadow.webContents.getTitle()) ?? source.runtime.title;
      const sourceFavicon = normalizeString(source.runtime.faviconUrl);
      if (sourceFavicon !== null) {
        shadow.faviconUrl = sourceFavicon;
      }
    }
    return shadow;
  };

  const readLiveLocalStorageEntries = async (
    source: BrowserPageEntry,
    origin: string,
    timeoutMs: number | undefined
  ): Promise<readonly [string, string][]> => {
    if (normalizeWebOrigin(source.webContents.getURL()) !== origin) {
      return [];
    }
    try {
      const entries = await runFrameScriptWithTimeout(
        () => source.webContents.executeJavaScript(`
          (() => {
            try {
              return Object.entries(window.localStorage || {})
                .slice(0, 500)
                .map(([key, value]) => [String(key), String(value)]);
            } catch (_error) {
              return [];
            }
          })()
        `, true),
        normalizeExecuteScriptTimeoutMs(timeoutMs, 2_000)
      );
      return Array.isArray(entries)
        ? entries
            .map((entry) => {
              if (!Array.isArray(entry) || entry.length < 2) {
                return null;
              }
              const [key, value] = entry;
              return typeof key === "string" && typeof value === "string"
                ? [key, value] as [string, string]
                : null;
            })
            .filter((entry): entry is [string, string] => entry !== null)
        : [];
    } catch {
      return [];
    }
  };

  const writeIsolatedLocalStorageEntries = async (
    shadow: BrowserAgentShadowEntry,
    origin: string,
    entries: readonly [string, string][],
    timeoutMs: number | undefined
  ): Promise<number> => {
    if (entries.length === 0 || normalizeWebOrigin(shadow.webContents.getURL()) !== origin) {
      return 0;
    }
    try {
      const written = await runFrameScriptWithTimeout(
        () => shadow.webContents.executeJavaScript(`
          ((entries) => {
            let written = 0;
            try {
              for (const [key, value] of entries) {
                window.localStorage.setItem(String(key), String(value));
                written += 1;
              }
            } catch (_error) {
              return written;
            }
            return written;
          })(${JSON.stringify(entries)})
        `, true),
        normalizeExecuteScriptTimeoutMs(timeoutMs, 2_000)
      );
      return typeof written === "number" && Number.isFinite(written)
        ? Math.max(0, Math.round(written))
        : 0;
    } catch {
      return 0;
    }
  };

  const copyLiveLoginStateToIsolated = async (
    source: BrowserPageEntry | undefined,
    shadow: BrowserAgentShadowEntry,
    timeoutMs: number | undefined
  ): Promise<BrowserAgentLoginBorrowResult> => {
    if (source === undefined || source.isDestroyed || source.webContents.isDestroyed()) {
      return {
        borrowed: false,
        coverage: [],
        unavailableReason: "live_source_tab_unavailable"
      };
    }
    const sourceOrigin =
      normalizeWebOrigin(source.webContents.getURL()) ?? normalizeWebOrigin(source.runtime.address);
    if (sourceOrigin === null) {
      return {
        borrowed: false,
        coverage: [],
        unavailableReason: "live_source_origin_unavailable"
      };
    }
    const liveSession = source.webContents.session ?? liveElectronSession();
    const isolatedSession = isolatedElectronSession();
    const cookies = await liveSession.cookies.get({ url: sourceOrigin }).catch(() => []);
    let copiedCookies = 0;
    for (const cookie of cookies) {
      const details: Parameters<Session["cookies"]["set"]>[0] = {
        url: sourceOrigin,
        name: cookie.name,
        value: cookie.value
      };
      if (cookie.domain !== undefined && cookie.domain.length > 0) details.domain = cookie.domain;
      if (cookie.path !== undefined && cookie.path.length > 0) details.path = cookie.path;
      if (cookie.secure !== undefined) details.secure = cookie.secure;
      if (cookie.httpOnly !== undefined) details.httpOnly = cookie.httpOnly;
      if (cookie.expirationDate !== undefined) details.expirationDate = cookie.expirationDate;
      if (cookie.sameSite !== undefined && cookie.sameSite !== "unspecified") {
        details.sameSite = cookie.sameSite;
      }
      await isolatedSession.cookies.set(details)
        .then(() => {
          copiedCookies += 1;
        })
        .catch(() => undefined);
    }
    const localStorageEntries = await readLiveLocalStorageEntries(source, sourceOrigin, timeoutMs);
    const copiedLocalStorage = await writeIsolatedLocalStorageEntries(
      shadow,
      sourceOrigin,
      localStorageEntries,
      timeoutMs
    );
    const coverage: ("cookies" | "localStorage")[] = [];
    if (copiedCookies > 0) coverage.push("cookies");
    if (copiedLocalStorage > 0) coverage.push("localStorage");
    return {
      borrowed: coverage.length > 0,
      sourceOrigin,
      cookieCount: copiedCookies,
      localStorageItemCount: copiedLocalStorage,
      coverage,
      ...(coverage.length === 0 ? { unavailableReason: "no_live_login_state_found" } : {})
    };
  };

  const resolveBrowserAgentTarget = async (
    tabId: string,
    request: WorkbenchBrowserAgentModeRequest | WorkbenchBrowserAgentTargetMode | undefined,
    timeoutMs: number | undefined
  ): Promise<BrowserAgentPageTarget> => {
    const modeRequest = normalizeBrowserAgentModeRequest(request);
    const requestedTargetMode = modeRequest.targetMode;
    const visibleFollow =
      requestedTargetMode === "isolated"
        ? false
        : modeRequest.visibleFollow !== false;
    if (requestedTargetMode === "live") {
      const liveEntry = getEntry(tabId) ?? ensureLiveEntry?.(tabId);
      if (liveEntry !== undefined && liveEntry.isDestroyed === false && !liveEntry.webContents.isDestroyed()) {
        return liveAgentTarget(
          liveEntry,
          defaultBrowserMode("live", "explicit_live", visibleFollow)
        );
      }
      const existingShadow = browserAgentShadows.get(tabId);
      if (existingShadow !== undefined && existingShadow.targetMode === "live" && !existingShadow.webContents.isDestroyed()) {
        existingShadow.browserMode = defaultBrowserMode("live", "explicit_live", visibleFollow);
        return existingShadow;
      }
      if (existingShadow !== undefined) {
        destroyBrowserAgentShadow(tabId);
      }
      throw new Error(`Live browser page is not materialized: ${tabId || "(missing-tab-id)"}`);
    }
    const entry = getEntry(tabId);
    if (requestedTargetMode === undefined && entry !== undefined && entry.isDestroyed === false && !entry.webContents.isDestroyed()) {
      return liveAgentTarget(
        entry,
        defaultBrowserMode("live", "default_current_visible_browser", visibleFollow)
      );
    }
    let loginBorrow: BrowserAgentLoginBorrowResult | undefined;
    const reason: WorkbenchBrowserAgentModeReason = requestedTargetMode === "isolated"
      ? "explicit_isolated"
      : "explicit_isolated";
    let target: BrowserAgentShadowEntry;
    if (entry !== undefined && entry.isDestroyed === false && !entry.webContents.isDestroyed()) {
      target = await ensureBrowserAgentShadow(entry, timeoutMs);
      if (wantsLiveLoginState(modeRequest)) {
        loginBorrow = await copyLiveLoginStateToIsolated(entry, target, timeoutMs);
      }
    } else {
      target = browserAgentShadows.get(tabId)
        ?? createStandaloneBrowserAgentShadow(tabId || WORKBENCH_BROWSER_AGENT_STANDALONE_TAB_ID);
      if (wantsLiveLoginState(modeRequest)) {
        loginBorrow = {
          borrowed: false,
          coverage: [],
          unavailableReason: "live_source_tab_unavailable"
        };
      }
    }
    target.browserMode = defaultBrowserMode("isolated", reason, false, loginBorrow);
    return target;
  };

  const readShadow = (tabId: string): BrowserAgentShadowEntry | undefined =>
    browserAgentShadows.get(tabId);

  const dispose = (): void => {
    for (const tabId of [...browserAgentShadows.keys()]) {
      destroyBrowserAgentShadow(tabId);
    }
  };

  return {
    destroyBrowserAgentShadow,
    dispose,
    readShadow,
    resolveBrowserAgentTarget
  };
};
