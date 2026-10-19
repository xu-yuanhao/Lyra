import type { NativeRecoveryLabels } from "../../shared/native-recovery-labels";
import {
  session as electronSessionApi,
  type BrowserWindow,
  type Session,
  type WebContents
} from "electron";
import type {
  BrowserSessionSnapshot,
  BrowserSiteStorageAvailability,
  BrowserStorageStateRef,
  WorkbenchBrowserChromePopoverRequest,
  WorkbenchBrowserClearSiteDataRequest,
  WorkbenchBrowserClearSiteDataResult,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserStorageStateRequest,
  WorkbenchLumenFollowAudit
} from "../../shared/desktop-bridge";
import {
  WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION,
  WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
  createBrowserStorageStateRef,
  sanitizeBrowserPageRestoreState
} from "../../shared/workbench-browser";
import { createWorkbenchBrowserElementPickerController } from "./element-picker/controller";
import type {
  WorkbenchBrowserAgentModeRequest,
  WorkbenchBrowserAgentTargetMode,
  WorkbenchBrowserElementPickerController,
  WorkbenchBrowserOsAxAdapter,
  WorkbenchBrowserPublishEvent,
  WorkbenchBrowserViewManager
} from "./types";

import type {
  BrowserAgentPageTarget,
  BrowserAgentShadowEntry,
  BrowserPageEntry
} from "./view-manager-runtime/types";
import { createChromePopoverRuntime } from "./view-manager-runtime/chrome-popover-runtime";
import { createBrowserSessionRuntime } from "./view-manager-runtime/session-runtime";
import { createPageFindRuntime } from "./view-manager-runtime/page-find-runtime";
import { liveAgentTarget } from "./view-manager-runtime/agent-target-runtime";
import { createWebContentsLoadWaiter } from "./view-manager-runtime/web-contents-load-waiter";
import { createCdpDiagnosticsController } from "./view-manager-runtime/cdp-diagnostics-controller";
import { createSharedControlController } from "./view-manager-runtime/shared-control-controller";
import { createSnapshotProvider } from "./view-manager-runtime/snapshot-provider";
import { createAgentShadowController } from "./view-manager-runtime/agent-shadow-controller";
import { createWorkbenchBrowserAgentController } from "./view-manager-runtime/agent-controller";
import { createBrowserHealthWatchdog } from "./view-manager-runtime/browser-health-watchdog";
import { createRestoreTombstoneController } from "./view-manager-runtime/restore-tombstone-controller";
import { createLayoutController } from "./view-manager-runtime/layout-controller";
import { createPageRegistryController } from "./view-manager-runtime/page-registry-controller";
import {
  BROWSER_SESSION_SNAPSHOT_WRITE_DELAY_MS,
  BROWSER_SESSION_STATE_KEY,
  normalizeString,
  normalizeWebOrigin,
} from "./view-manager-runtime/normalizers";
import type { WorkbenchStateKey } from "../../shared/desktop-bridge";
import {
  browserContextMenuLabels,
  type BrowserContextMenuLabels
} from "../../shared/browser-context-menu-labels";
import { readBrowserContextMenuLocaleFromPreferences } from "./view-manager-runtime/page-context-menu-native";
import { createWorkspaceFocusIsolation } from "./workspace-focus-isolation";

export const createWorkbenchBrowserViewManager = ({
  getWindow,
  publishEvent,
  osAxAdapter,
  workbenchState,
  onWebContentsCreated,
  getActCacheEnabled,
  resolveBrowserContextMenuLabels,
  resolveNativeRecoveryLabels
}: {
  readonly getWindow: () => BrowserWindow | null;
  readonly publishEvent: WorkbenchBrowserPublishEvent;
  readonly osAxAdapter?: WorkbenchBrowserOsAxAdapter;
  readonly workbenchState?: {
    readonly readState: (key: WorkbenchStateKey) => string | null;
    readonly writeState: (key: typeof BROWSER_SESSION_STATE_KEY, json: string) => void;
  };
  readonly onWebContentsCreated?: (tabId: string, webContents: WebContents) => () => void;
  // ActCache toggle (mirrors browserFollowMode). When true, the AX controller
  // may replay cached axActOnNode results for repeatable NL→axRef mappings.
  readonly getActCacheEnabled?: () => boolean;
  readonly resolveBrowserContextMenuLabels?: (locale: string) => BrowserContextMenuLabels;
  readonly resolveNativeRecoveryLabels?: (locale: string) => NativeRecoveryLabels;
}): WorkbenchBrowserViewManager => {
  const liveElectronSession = (): Session =>
    electronSessionApi.fromPartition(WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION);

  const isolatedElectronSession = (): Session =>
    electronSessionApi.fromPartition(WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION);

  const browserHealthWatchdog = createBrowserHealthWatchdog();
  const webContentsLoadWaiter = createWebContentsLoadWaiter();
  const cancelPendingAgentPageLoad = webContentsLoadWaiter.cancelPendingLoad;
  const waitForAgentPageLoad = webContentsLoadWaiter.waitForLoad;
  const waitForAgentPageReload = webContentsLoadWaiter.waitForReload;
  let agentShadowController: ReturnType<typeof createAgentShadowController>;
  let agentController: ReturnType<typeof createWorkbenchBrowserAgentController>;
  let chromePopoverRuntime: ReturnType<typeof createChromePopoverRuntime>;

  let elementPickerController: WorkbenchBrowserElementPickerController;
  let layoutController: ReturnType<typeof createLayoutController>;
  let snapshotProvider: ReturnType<typeof createSnapshotProvider>;
  let restoreTombstoneController: ReturnType<typeof createRestoreTombstoneController>;
  let browserSessionRuntime: ReturnType<typeof createBrowserSessionRuntime>;
  const resolveBrowserAgentTarget = (
    tabId: string,
    request: WorkbenchBrowserAgentModeRequest | WorkbenchBrowserAgentTargetMode | undefined,
    timeoutMs: number | undefined
  ): Promise<BrowserAgentPageTarget> =>
    agentShadowController.resolveBrowserAgentTarget(tabId, request, timeoutMs);
  const invalidateBrowserAgentTargets = (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode,
    reason: "navigation" | "frameReload" = "navigation"
  ): void => {
    browserHealthWatchdog.onDomCacheInvalidated(tabId, reason);
    agentController.invalidateBrowserAgentTargets(tabId, targetMode, reason);
  };
  const scheduleBrowserTargetRegistryWarmup = (
    entry: BrowserPageEntry,
    restoreState: NonNullable<WorkbenchBrowserPageRuntimeState["restoreState"]>
  ): void => {
    agentController.scheduleBrowserTargetRegistryWarmup(entry, restoreState);
  };
  const readAgentFollowFinalPageState = (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ): WorkbenchLumenFollowAudit["finalPageState"] =>
    agentController.readAgentFollowFinalPageState(tabId, targetMode);
  const destroyBrowserAgentShadow = (tabId: string): void => {
    agentShadowController.destroyBrowserAgentShadow(tabId);
  };
  const readBrowserAgentShadow = (tabId: string): BrowserAgentShadowEntry | undefined =>
    agentShadowController.readShadow(tabId);
  const cdpDiagnostics = createCdpDiagnosticsController({
    resolveBrowserAgentTarget: async (tabId, request, timeoutMs) =>
      await resolveBrowserAgentTarget(tabId, request, timeoutMs)
  });
  const {
    auditAgentPageDiagnostics,
    disposeCdpAuditSession,
    disposeDebuggerSession,
    hasActiveDebuggerClients,
    openDebuggerSessionForTarget,
    readPageDiagnostics,
    recordPageDiagnostic,
    startCdpAuditSessionForEntry
  } = cdpDiagnostics;
  const focusIsolation = createWorkspaceFocusIsolation();
  const pageRegistry = createPageRegistryController({
    getWindow,
    publishEvent,
    onWebContentsCreated,
    syncTopologySnapshot: (snapshot) => layoutController.syncTopology(snapshot),
    syncLayoutSnapshot: (snapshot) => layoutController.syncLayout(snapshot),
    applyLayout: () => layoutController.applyLayout(),
    findLayout: (tabId) => layoutController.findLayout(tabId),
    canMaterializePage: (spec) => layoutController.canMaterializePage(spec),
    getActiveOrFocusedTabId: () => layoutController.getActiveOrFocusedTabId(),
    detachEntryView: (entry) => layoutController.detachEntryView(entry),
    readTombstone: (tabId) => restoreTombstoneController.readTombstone(tabId),
    listTombstoneTabIds: () => restoreTombstoneController.listTombstoneTabIds(),
    consumeTombstone: (tabId) => restoreTombstoneController.consumeTombstone(tabId),
    updateDormantTombstone: (spec) => restoreTombstoneController.updateDormantTombstone(spec),
    deleteTombstone: (tabId) => restoreTombstoneController.deleteTombstone(tabId),
    hasTombstone: (tabId) => restoreTombstoneController.hasTombstone(tabId),
    readTombstoneRuntime: (tabId) => restoreTombstoneController.readTombstoneRuntime(tabId),
    persistedTabSnapshot: (tabId) => browserSessionRuntime.persistedTabSnapshot(tabId),
    scheduleBrowserSessionSnapshotWrite: (delayMs) =>
      browserSessionRuntime.scheduleBrowserSessionSnapshotWrite(delayMs),
    updateRuntimeState: (entry, patch) => browserSessionRuntime.updateRuntimeState(entry, patch),
    publishRuntimeState: (runtime) => browserSessionRuntime.publishRuntimeState(runtime),
    cancelPendingAgentPageLoad,
    captureBrowserRestoreState: (entry) => restoreTombstoneController.captureBrowserRestoreState(entry),
    restoreNavigationHistory: (entry, restoreState) =>
      restoreTombstoneController.restoreNavigationHistory(entry, restoreState),
    handlePageLoadStopped: (entry) => restoreTombstoneController.handlePageLoadStopped(entry),
    markPendingRestoreValidation: (tabId, restoreState) =>
      restoreTombstoneController.markPendingRestoreValidation(tabId, restoreState),
    clearTabSnapshot: (tabId) => snapshotProvider.clearTab(tabId),
    destroyBrowserAgentShadow: (tabId) => destroyBrowserAgentShadow(tabId),
    disposeCdpAuditSession,
    disposeDebuggerSession,
    invalidateBrowserAgentTargets: (tabId, targetMode, reason) =>
      invalidateBrowserAgentTargets(tabId, targetMode, reason),
    hideChromePopover: (entry) => chromePopoverRuntime.hideChromePopover(entry),
    hideTransientChromePopover: (entry) => chromePopoverRuntime.hideTransientChromePopover(entry),
    handleElementPickerPageClosed: (tabId) => elementPickerController.handlePageClosed(tabId),
    handleElementPickerPageNavigated: (tabId) => elementPickerController.handlePageNavigated(tabId),
    handleElementPickerConsoleMessage: (tabId, message) =>
      elementPickerController.handleConsoleMessage(tabId, message),
    handleElementPickerActiveTabChanged: (tabId) =>
      elementPickerController.handleActiveTabChanged(tabId),
    setElementPickerMode: (request) => elementPickerController.setMode(request),
    recordPageDiagnostic,
    handleSharedControlInput: (tabId, inputType, event) =>
      handleSharedControlInput(tabId, inputType, event),
    clearUserInputDirty: (tabId) => clearUserInputDirty(tabId),
    markUserInputDirty: (tabId) => markUserInputDirty(tabId),
    openDebuggerSessionForTarget,
    readBrowserContextMenuLabels: () => {
      const locale = readBrowserContextMenuLocaleFromPreferences(
        workbenchState?.readState("preferences") ?? null
      );
      return resolveBrowserContextMenuLabels?.(locale) ?? browserContextMenuLabels(locale);
    },
    readNativeRecoveryLabels: resolveNativeRecoveryLabels === undefined ? undefined : () =>
      resolveNativeRecoveryLabels(readBrowserContextMenuLocaleFromPreferences(workbenchState?.readState("preferences") ?? null)),
    onBrowserHealthPopup: (tabId, url) => browserHealthWatchdog.onPopupRequested(tabId, url),
    onBrowserHealthCrash: (tabId) => browserHealthWatchdog.onCrash(tabId),
    onBrowserHealthNavigationFailed: (tabId, message) =>
      browserHealthWatchdog.onNavigationFailed(tabId, message),
    onBrowserHealthDownload: (tabId, url) => browserHealthWatchdog.onDownloadStarted(tabId, url),
    onBrowserHealthTabClosed: (tabId) => browserHealthWatchdog.clearTab(tabId)
  });
  const { entries } = pageRegistry;
  agentShadowController = createAgentShadowController({
    getWindow,
    getEntry: (tabId) => pageRegistry.getEntry(tabId),
    ensureLiveEntry: (tabId) => pageRegistry.ensureAgentEntry(tabId),
    liveElectronSession,
    isolatedElectronSession,
    cancelPendingAgentPageLoad,
    waitForAgentPageLoad,
    disposeCdpAuditSession,
    disposeDebuggerSession,
    invalidateBrowserAgentTargets: (tabId, targetMode, reason) =>
      invalidateBrowserAgentTargets(tabId, targetMode, reason)
  });
  const sharedControlController = createSharedControlController({
    publishEvent,
    entries,
    getLiveEntry: (tabId) => entries.get(tabId),
    readAgentFollowFinalPageState: (tabId, targetMode) =>
      readAgentFollowFinalPageState(tabId, targetMode)
  });
  const {
    assertSharedControlCanContinue,
    clearUserInputDirty,
    finishAgentFollowSessions,
    handleSharedControlInput,
    hasActiveLiveAgentBrowserTask,
    hasUserInputDirty,
    markSyntheticInput,
    markUserInputDirty,
    publishBrowserAgentActivity,
    readAgentFollowAudit,
    recordFollowAction,
    resolveSharedControlDecision,
    sendAgentInputEvent
  } = sharedControlController;
  const topologyKeepAlive = {
    isPageKeepAlive: (_tabId: string): boolean => false
  };
  restoreTombstoneController = createRestoreTombstoneController({
    entries,
    readPageStorageAvailability: async (entry) => await readPageStorageAvailability(entry),
    navigationHistorySnapshot: (entry) => navigationHistorySnapshot(entry),
    updateRuntimeState: (entry, patch) => updateRuntimeState(entry, patch),
    publishRuntimeState: (runtime) => publishRuntimeState(runtime),
    scheduleBrowserSessionSnapshotWrite: (delayMs) => scheduleBrowserSessionSnapshotWrite(delayMs),
    hasActiveLiveAgentBrowserTask: (tabId) =>
      hasActiveLiveAgentBrowserTask(tabId) || topologyKeepAlive.isPageKeepAlive(tabId),
    hasActiveDebuggerClients,
    disposeCdpAuditSession,
    destroyEntry: (entry, emitClosedEvent) => pageRegistry.destroyEntry(entry, emitClosedEvent),
    deleteEntry: (tabId) => {
      pageRegistry.deleteEntry(tabId);
    },
    scheduleBrowserTargetRegistryWarmup: (entry, restoreState) =>
      scheduleBrowserTargetRegistryWarmup(entry, restoreState)
  });
  const {
    cancelTombstoneTimer,
    rememberBrowserRestoreState,
    scheduleTombstone,
    evictExcessHiddenPages,
    tombstones
  } = restoreTombstoneController;
  const overlayReattachHooks = {
    reattachChromePopover: (): void => {}
  };
  layoutController = createLayoutController({
    getWindow,
    entries,
    updateRuntimeState: (entry, patch) => updateRuntimeState(entry, patch),
    disposeCdpAuditSession,
    startCdpAuditSessionForEntry,
    syncFocusIsolation: (window, visibleEntries) => {
      void focusIsolation.sync(window, visibleEntries.map(entry => ({
        webContents: entry.webContents,
        acquire: () => openDebuggerSessionForTarget(liveAgentTarget(entry))
      })));
    },
    cancelTombstoneTimer,
    scheduleTombstone,
    evictExcessHiddenPages,
    bumpLiveViewBoundsEpoch: (tabId) => bumpLiveViewBoundsEpoch(tabId),
    reattachVisiblePopover: () => {
      overlayReattachHooks.reattachChromePopover();
    }
  });
  const {
    applyLayout,
    findLayout,
    getActiveOrFocusedTabId,
    readLayoutSnapshot,
    readTopology,
    setModalOcclusionActive
  } = layoutController;
  topologyKeepAlive.isPageKeepAlive = (tabId) => {
    const page = readTopology().pages.find((item) => item.tabId === tabId);
    return page?.isVisible === true;
  };

  browserSessionRuntime = createBrowserSessionRuntime({
    workbenchState,
    entries,
    tombstones,
    hasActiveLiveAgentBrowserTask,
    publishEvent,
    readTopology,
    readLayoutSnapshot,
    liveElectronSession
  });

  const persistBrowserSessionSnapshot = (): BrowserSessionSnapshot | null =>
    browserSessionRuntime.persistBrowserSessionSnapshot();
  const scheduleBrowserSessionSnapshotWrite = (delayMs = BROWSER_SESSION_SNAPSHOT_WRITE_DELAY_MS): void => {
    browserSessionRuntime.scheduleBrowserSessionSnapshotWrite(delayMs);
  };
  const readPageStorageAvailability = async (
    entry: BrowserPageEntry
  ): Promise<BrowserSiteStorageAvailability | undefined> =>
    await browserSessionRuntime.readPageStorageAvailability(entry);
  const sessionStoragePath = (electronSession: Session): string | null =>
    browserSessionRuntime.sessionStoragePath(electronSession);
  const updateRuntimeState = (
    entry: BrowserPageEntry,
    patch: Partial<WorkbenchBrowserPageRuntimeState>
  ): void => {
    browserSessionRuntime.updateRuntimeState(entry, patch);
  };
  const publishRuntimeState = (runtime: WorkbenchBrowserPageRuntimeState): void => {
    browserSessionRuntime.publishRuntimeState(runtime);
  };
  const navigationHistorySnapshot = (
    entry: BrowserPageEntry
  ): NonNullable<WorkbenchBrowserPageRuntimeState["restoreState"]>["history"] | undefined =>
    browserSessionRuntime.navigationHistorySnapshot(entry);
  const setChromePopover = async (request: WorkbenchBrowserChromePopoverRequest): Promise<void> => {
    await chromePopoverRuntime.setChromePopover(request);
  };
  const bumpLiveViewBoundsEpoch = (tabId: string): number => {
    return snapshotProvider.bumpLiveViewBoundsEpoch(tabId);
  };

  elementPickerController =
    createWorkbenchBrowserElementPickerController({
      host: {
        publishEvent,
        listFrames: (tabId) => {
          return pageRegistry.listFrames(tabId);
        },
        executeFrameScript: async (
          tabId,
          request: {
            readonly script: string;
            readonly frameTreeNodeId?: number;
            readonly userGesture?: boolean;
            readonly timeoutMs?: number;
          }
        ) => {
          return await pageRegistry.executeFrameScript(tabId, request);
        }
      }
    });

  snapshotProvider = createSnapshotProvider({
    entries,
    requireEntry: pageRegistry.requireEntry,
    navigateInEntry: pageRegistry.navigateInEntry,
    getActiveOrFocusedTabId,
    openTabForUrl: async (url: string) => {
      const opened = await pageRegistry.navigate({ address: url, newTab: true });
      const tabId = typeof opened.tabId === "string" ? opened.tabId.trim() : "";
      if (tabId.length === 0) {
        throw new Error("Could not open a browser tab to render this URL");
      }
      return pageRegistry.requireEntry(tabId);
    },
    waitForPageLoad: waitForAgentPageLoad,
    openDebuggerSession: pageRegistry.openDebuggerSession,
    readAxNodes: async (tabId, timeoutMs) => (
      await agentController.axMapAgentPage(tabId, {
        targetMode: "live",
        strategy: "document",
        includeText: true,
        timeoutMs
      })
    ).nodes,
    readLiveViewBounds: (tabId, target) => {
      const entry = target.liveEntry ?? entries.get(tabId);
      return entry?.view.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 };
    },
    readIsolatedViewBounds: (tabId) => {
      const shadow = readBrowserAgentShadow(tabId);
      try {
        return shadow?.window.getContentBounds() ?? { x: 0, y: 0, width: 1, height: 1 };
      } catch {
        return { x: 0, y: 0, width: 1, height: 1 };
      }
    }
  });
  const {
    capturePage,
    captureTargetPage,
    createVisualFrame,
    cssPointFromVisualFrame,
    extractPageText,
    readAgentViewportState,
    readPageDomSummary,
    readRenderedSnapshot,
    readVisualFrame,
    rememberVisualFrame,
    visualStaleResult
  } = snapshotProvider;

  const pageFindRuntime = createPageFindRuntime({
    requireEntry: pageRegistry.requireEntry,
    getActiveOrFocusedTabId
  });
  const {
    clearSearchInPageOverlay,
    performSearchInPage,
    searchInPage
  } = pageFindRuntime;

  chromePopoverRuntime = createChromePopoverRuntime({
    overlayView: layoutController.overlayView,
    getWindow,
    entries,
    publishEvent,
    findLayout,
    requireEntry: pageRegistry.requireEntry,
    getActiveOrFocusedTabId,
    clearSearchInPageOverlay
  });
  overlayReattachHooks.reattachChromePopover = () => {
    chromePopoverRuntime.reattachVisiblePopover();
  };

  agentController = createWorkbenchBrowserAgentController({
    entries,
    prepareAgentPage: pageRegistry.prepareAgentPage,
    rememberBrowserRestoreState,
    requireEntry: pageRegistry.requireEntry,
    findFrameInWebContents: pageRegistry.findFrameInWebContents,
    resolveBrowserAgentTarget,
    navigateInEntry: pageRegistry.navigateInEntry,
    waitForAgentPageLoad,
    waitForAgentPageReload,
    openDebuggerSessionForTarget,
    ...(osAxAdapter === undefined ? {} : { osAxAdapter }),
    readPageDiagnostics,
    recordPageDiagnostic,
    consumeBrowserHealthAlerts: (tabId) => browserHealthWatchdog.consumeAlerts(tabId),
    onBrowserHealthCaptcha: (tabId, label) => browserHealthWatchdog.onCaptchaDetected(tabId, label),
    onBrowserHealthPermission: (tabId, kind) => browserHealthWatchdog.onPermissionPrompt(tabId, kind),
    publishEvent,
    updateRuntimeState,
    publishBrowserAgentActivity,
    recordFollowAction,
    sendAgentInputEvent,
    assertSharedControlCanContinue,
    markSyntheticInput,
    performSearchInPage,
    captureTargetPage,
    createVisualFrame,
    rememberVisualFrame,
    readVisualFrame,
    visualStaleResult,
    cssPointFromVisualFrame,
    readAgentViewportState,
    readBrowserAgentShadow,
    ...(getActCacheEnabled === undefined ? {} : { getActCacheEnabled })
  });
  const {
    actOnAgentElement,
    actOnAgentPoint,
    actOnAgentVisualPoint,
    actOnAgentVisualScene,
    describeAgentScene,
    captureVisualScene,
    axMapAgentPage,
    axQueryAgentSnapshot,
    axActOnNode,
    axFocusAgentPage,
    axPressAgentKey,
    axExplainNode,
    axResolveAxRefBbox,
    captureAgentPage,
    readAgentPreviewPage,
    detectAgentPageQr,
    completeElevationSession,
    elevateAgentPage,
    explainAgentTargetRef,
    findAgentPage,
    focusAgentPage,
    locateAgentPage,
    navigateAgentPage,
    reloadAgentPage,
    observeAgentPage,
    planAgentPage,
    pressAgentKey,
    readAgentPage,
    replayWorkflowOnPage,
    scrollAgentPage,
    showAgentActivity,
    uploadAgentFiles,
    dragAgentElement,
    handleAgentDialog,
    peekAgentDialog,
    typeIntoAgentElement
  } = agentController;

  const readSessionSnapshot = (): BrowserSessionSnapshot | null => persistBrowserSessionSnapshot();

  const readStorageState = async (
    request?: WorkbenchBrowserStorageStateRequest
  ): Promise<BrowserStorageStateRef> => {
    const profileMode = request?.profileMode === "isolated" ? "isolated" : "live";
    const targetTabId = normalizeString(request?.tabId) ?? getActiveOrFocusedTabId();
    const entry = targetTabId === null ? null : entries.get(targetTabId) ?? null;
    const origin = normalizeWebOrigin(request?.origin) ?? (
      entry === null ? null : normalizeWebOrigin(entry.runtime.address)
    );
    const electronSession = profileMode === "isolated"
      ? isolatedElectronSession()
      : (entry?.webContents.session ?? liveElectronSession());
    const site = origin === null || entry === null
      ? undefined
      : await readPageStorageAvailability(entry);
    const cookieCount = origin === null
      ? undefined
      : await electronSession.cookies
          .get({ url: origin })
          .then((cookies) => cookies.length)
          .catch(() => undefined);
    const sites = site === undefined
      ? []
      : [{
          ...site,
          ...(cookieCount === undefined ? {} : { cookieCount })
        }];
    return {
      ...createBrowserStorageStateRef({
        profileMode,
        profilePartition:
          profileMode === "isolated"
            ? WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION
            : WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
        chromiumStoragePath: sessionStoragePath(electronSession),
        sites
      }),
      cookies: {
        availability:
          cookieCount === undefined
            ? "unknown"
            : cookieCount > 0 ? "available" : "unavailable",
        manifestOnly: true,
        ...(cookieCount === undefined ? {} : { count: cookieCount })
      },
      localStorage: {
        availability: site?.localStorage ?? "unknown",
        manifestOnly: true
      },
      sessionStorage: {
        availability: site?.sessionStorage ?? "unknown",
        manifestOnly: true
      },
      indexedDB: {
        availability: site?.indexedDB ?? "unknown",
        manifestOnly: true
      },
      cacheStorage: {
        availability: "unknown",
        manifestOnly: true
      }
    };
  };

  const clearSiteData = async (
    request: WorkbenchBrowserClearSiteDataRequest
  ): Promise<WorkbenchBrowserClearSiteDataResult> => {
    const targetTabId = normalizeString(request?.tabId) ?? getActiveOrFocusedTabId();
    const targetEntry = targetTabId === null ? null : entries.get(targetTabId) ?? null;
    const origin =
      normalizeWebOrigin(request?.origin) ??
      (targetEntry === null ? null : normalizeWebOrigin(targetEntry.runtime.address));
    if (origin === null) {
      throw new Error("origin or tabId is required");
    }
    const modes = request?.profileMode === "live"
      ? ["live"] as const
      : request?.profileMode === "isolated"
        ? ["isolated"] as const
        : ["live", "isolated"] as const;
    const sessions = modes.map((mode) => (
      mode === "isolated" ? isolatedElectronSession() : liveElectronSession()
    ));
    let cookiesRemoved = 0;
    let storageCleared = false;
    for (const electronSession of sessions) {
      const cookies = await electronSession.cookies.get({ url: origin }).catch(() => []);
      for (const cookie of cookies) {
        await electronSession.cookies.remove(origin, cookie.name)
          .then(() => {
            cookiesRemoved += 1;
          })
          .catch(() => undefined);
      }
      await electronSession.clearStorageData({
        origin,
        storages: [
          "cookies",
          "localstorage",
          "indexdb",
          "cachestorage",
          "serviceworkers"
        ]
      }).then(() => {
        storageCleared = true;
      }).catch(() => undefined);
    }
    const clearedStorage: BrowserSiteStorageAvailability = {
      origin,
      cookieCount: 0,
      localStorage: "unavailable",
      sessionStorage: "unavailable",
      indexedDB: "unavailable",
      capturedAt: Date.now()
    };
    for (const entry of entries.values()) {
      if (normalizeWebOrigin(entry.runtime.address) !== origin) {
        continue;
      }
      invalidateBrowserAgentTargets(entry.tabId, "live", "navigation");
      invalidateBrowserAgentTargets(entry.tabId, "isolated", "navigation");
      const restoreState = sanitizeBrowserPageRestoreState({
        ...(entry.runtime.restoreState ?? { capturedAt: Date.now() }),
        storage: clearedStorage,
        targetRegistry: {
          warmed: false,
          capturedAt: Date.now()
        },
        capturedAt: Date.now()
      });
      if (restoreState !== undefined) {
        rememberBrowserRestoreState(entry.tabId, restoreState);
        updateRuntimeState(entry, { restoreState });
      }
    }
    const snapshot = persistBrowserSessionSnapshot();
    return {
      ok: true,
      origin,
      profilePartitions: modes.map((mode) => (
        mode === "isolated"
          ? WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION
          : WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION
      )),
      cookiesRemoved,
      storageCleared,
      snapshot
    };
  };

  return {
    dispose: () => {
      browserSessionRuntime.dispose();
      void focusIsolation.dispose();
      void elementPickerController.dispose();
      cdpDiagnostics.dispose();
      restoreTombstoneController.dispose();
      pageRegistry.dispose();
      agentShadowController.dispose();
      sharedControlController.dispose();
      agentController.dispose();
      chromePopoverRuntime.dispose();
      layoutController.dispose();
    },
    syncTopology: pageRegistry.syncTopology,
    syncLayout: pageRegistry.syncLayout,
    navigate: pageRegistry.navigate,
    goBack: pageRegistry.goBack,
    goForward: pageRegistry.goForward,
    reload: pageRegistry.reload,
    runPageContextAction: pageRegistry.runPageContextAction,
    stop: pageRegistry.stop,
    readPageState: pageRegistry.readPageState,
    readSessionSnapshot,
    readStorageState,
    clearSiteData,
    setElementPickerMode: pageRegistry.setElementPickerMode,
    readActiveTabId: () => getActiveOrFocusedTabId(),
    listFrames: pageRegistry.listFrames,
    probeFrameDom: pageRegistry.probeFrameDom,
    executeFrameScript: pageRegistry.executeFrameScript,
    dispatchNativeInput: pageRegistry.dispatchNativeInput,
    openDebuggerSession: pageRegistry.openDebuggerSession,
    fetchWithTabSession: pageRegistry.fetchWithTabSession,
    readPageDomSummary,
    extractPageText,
    capturePage,
    captureVisiblePageLayers: async () => {
      const layers: Array<{
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
        readonly imageBase64: string;
      }> = [];
      for (const entry of entries.values()) {
        const layout = entry.layout;
        if (
          entry.isDestroyed
          || entry.webContents.isDestroyed()
          || layout === undefined
          || layout === null
          || layout.visible !== true
        ) {
          continue;
        }
        const image = await entry.webContents.capturePage();
        layers.push({
          x: layout.x,
          y: layout.y,
          width: layout.width,
          height: layout.height,
          imageBase64: image.toPNG().toString("base64")
        });
      }
      return layers;
    },
    readRenderedSnapshot,
    searchInPage,
    setChromePopover,
    resolveFrameGlobalBounds: pageRegistry.resolveFrameGlobalBounds,
    resolvePageDragContextFromWebContents: pageRegistry.resolvePageDragContextFromWebContents,
    reapplyLayout: () => {
      applyLayout();
    },
    setModalOcclusionActive,
    toggleDevToolsForActivePage: pageRegistry.toggleDevToolsForActivePage,
    observeAgentPage,
    planAgentPage,
    actOnAgentElement,
    actOnAgentPoint,
    actOnAgentVisualPoint,
    actOnAgentVisualScene,
    describeAgentScene,
    captureVisualScene,
    axMapAgentPage,
    axQueryAgentSnapshot,
    axActOnNode,
    axFocusAgentPage,
    axPressAgentKey,
    axExplainNode,
    axResolveAxRefBbox,
    focusAgentPage,
    scrollAgentPage,
    uploadAgentFiles,
    dragAgentElement,
    handleAgentDialog,
    peekAgentDialog,
    typeIntoAgentElement,
    pressAgentKey,
    navigateAgentPage,
    reloadAgentPage,
    readAgentPage,
    replayWorkflowOnPage,
    findAgentPage,
    locateAgentPage,
    captureAgentPage,
    readAgentPreviewPage,
    detectAgentPageQr,
    showAgentActivity,
    readAgentFollowAudit,
    finishAgentFollowSessions,
    explainAgentTargetRef,
    auditAgentPageDiagnostics,
    elevateAgentPage,
    completeElevationSession,
    resolveSharedControlDecision,
    verifyAgentActionOutcome: agentController.verifyAgentActionOutcome,
    destroyBrowserAgentShadow
  };
};
