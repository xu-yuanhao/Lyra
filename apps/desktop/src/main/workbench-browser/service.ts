import type { NativeRecoveryLabels } from "../../shared/native-recovery-labels";
import { ipcMain, type BrowserWindow } from "electron";

import {
  LYRA_CHANNELS,
  type BrowserSessionSnapshot,
  type BrowserStorageStateRef,
  type WorkbenchBrowserChromePopoverRequest,
  type WorkbenchBrowserClearSiteDataRequest,
  type WorkbenchBrowserClearSiteDataResult,
  type WorkbenchBrowserEvent,
  type WorkbenchBrowserLayoutSnapshot,
  type WorkbenchBrowserNavigateRequest,
  type WorkbenchBrowserNavigateResult,
  type WorkbenchBrowserPageRuntimeState,
  type WorkbenchBrowserReadPageStateRequest,
  type WorkbenchBrowserSearchInPageRequest,
  type WorkbenchBrowserSearchInPageResult,
  type WorkbenchBrowserSetElementPickerModeRequest,
  type WorkbenchBrowserStorageStateRequest,
  type WorkbenchBrowserTopologySnapshot
} from "../../shared/desktop-bridge";
import type {
  WorkbenchTabExtractTextResult,
  WorkbenchVisualCaptureResult
} from "../../shared/workbench-observation";
import type {
  BrowserDomSummaryReadOptions,
  BrowserTextExtractOptions
} from "../workbench-observation/browser/types";
import type { DownloadManagerIpcBridge } from "../download-manager";
import type { AccessibilityNativeLoadResult } from "../accessibility";
import type { LoginManagerIpcBridge } from "../login-manager";
import type { LyraPerformanceResourceScheduler } from "../performance";
import type { WorkbenchStateIpcBridge } from "../workbench-state";
import type { WorkbenchObservationBrowserDomSummary } from "../workbench-observation/types";
import type { BrowserContextMenuLabels } from "../../shared/browser-context-menu-labels";
import { setWorkbenchShellReady } from "../open-in-workbench";
import {
  normalizePageDragCitationPayload,
  type PageDragCitationPayload
} from "../../modules/workbench/browser-tabs/page-drag-transfer";
import { registerBrowserPageFramePreload } from "./register-browser-page-frame-preload";
import { createWorkbenchBrowserViewManager } from "./view-manager";
import type {
  WorkbenchBrowserAgentActionResult,
  WorkbenchBrowserAgentFindResult,
  WorkbenchBrowserAgentFocusDirection,
  WorkbenchBrowserAgentFocusResult,
  WorkbenchBrowserAgentInteraction,
  WorkbenchBrowserAgentMapScope,
  WorkbenchBrowserAgentVisualInteraction,
  WorkbenchBrowserAgentVisualStaleResult,
  WorkbenchBrowserAgentLocateResult,
  WorkbenchBrowserAgentObservation,
  WorkbenchBrowserAgentObserveStrategy,
  WorkbenchBrowserAgentPoint,
  WorkbenchBrowserAgentScrollBlock,
  WorkbenchBrowserAgentScrollDirection,
  WorkbenchBrowserAgentScrollResult,
  WorkbenchBrowserAgentTargetMode,
  WorkbenchBrowserAgentVerification,
  WorkbenchBrowserDebuggerSession,
  WorkbenchBrowserFrameDescriptor,
  WorkbenchBrowserFrameDomProbeResult,
  WorkbenchBrowserFrameGlobalBounds,
  WorkbenchBrowserNativeInputEvent,
  WorkbenchBrowserOsAxAdapter,
  WorkbenchBrowserSessionFetchRequest,
  WorkbenchBrowserSessionFetchResult,
  WorkbenchBrowserViewManager
} from "./types";

const publishEvent = (
  getWindow: () => BrowserWindow | null,
  event: WorkbenchBrowserEvent
): void => {
  const window = getWindow();
  if (window === null || window.isDestroyed()) {
    return;
  }
  window.webContents.send(LYRA_CHANNELS.workbenchBrowserEvent, event);
};

const createOsAxAdapter = (
  loadResult: AccessibilityNativeLoadResult | undefined
): WorkbenchBrowserOsAxAdapter | undefined => {
  if (loadResult === undefined || loadResult.ok === false) {
    return undefined;
  }
  const { bindings, loadedFrom } = loadResult;
  return {
    loadedFrom,
    readTree: ({ maxNodes }) => JSON.parse(bindings.readOsAxTreeJson(JSON.stringify({ maxNodes }))),
    actOnNode: ({ osPath, interaction }) =>
      JSON.parse(bindings.actOnOsAxNodeJson(JSON.stringify({ osPath, interaction })))
  };
};

export type WorkbenchBrowserIpcBridge = {
  readonly dispose: () => void;
  readonly syncTopology: (snapshot: WorkbenchBrowserTopologySnapshot) => void;
  readonly syncLayout: (snapshot: WorkbenchBrowserLayoutSnapshot) => void;
  readonly navigate: (
    request: WorkbenchBrowserNavigateRequest
  ) => Promise<WorkbenchBrowserNavigateResult>;
  readonly goBack: (tabId: string) => void;
  readonly goForward: (tabId: string) => void;
  readonly reload: (tabId: string, ignoreCache?: boolean) => void;
  readonly runPageContextAction: (
    request: import("../../shared/workbench-browser").WorkbenchBrowserExecutePageContextActionRequest
  ) => void;
  readonly stop: (tabId: string) => void;
  readonly readPageState: (
    request?: WorkbenchBrowserReadPageStateRequest
  ) => WorkbenchBrowserPageRuntimeState | null;
  readonly readSessionSnapshot: () => BrowserSessionSnapshot | null;
  readonly readStorageState: (
    request?: WorkbenchBrowserStorageStateRequest
  ) => Promise<BrowserStorageStateRef>;
  readonly clearSiteData: (
    request: WorkbenchBrowserClearSiteDataRequest
  ) => Promise<WorkbenchBrowserClearSiteDataResult>;
  readonly searchInPage: (
    request: WorkbenchBrowserSearchInPageRequest
  ) => Promise<WorkbenchBrowserSearchInPageResult>;
  readonly setChromePopover: (
    request: WorkbenchBrowserChromePopoverRequest
  ) => Promise<void>;
  readonly setElementPickerMode: (
    request: WorkbenchBrowserSetElementPickerModeRequest
  ) => Promise<void>;
  readonly readActiveTabId: () => string | null;
  readonly listFrames: (tabId: string) => readonly WorkbenchBrowserFrameDescriptor[];
  readonly probeFrameDom: (
    tabId: string,
    frameTreeNodeId: number,
    options?: { readonly maxChars?: number }
  ) => Promise<WorkbenchBrowserFrameDomProbeResult>;
  readonly executeFrameScript: (
    tabId: string,
    request: {
      readonly script: string;
      readonly frameTreeNodeId?: number;
      readonly userGesture?: boolean;
      readonly timeoutMs?: number;
    }
  ) => Promise<unknown>;
  readonly dispatchNativeInput: (
    tabId: string,
    events: readonly WorkbenchBrowserNativeInputEvent[]
  ) => Promise<void>;
  readonly openDebuggerSession: (tabId: string) => Promise<WorkbenchBrowserDebuggerSession>;
  readonly fetchWithTabSession: (
    tabId: string,
    request: WorkbenchBrowserSessionFetchRequest
  ) => Promise<WorkbenchBrowserSessionFetchResult>;
  readonly readPageDomSummary: (
    tabId: string,
    options?: BrowserDomSummaryReadOptions
  ) => Promise<WorkbenchObservationBrowserDomSummary>;
  readonly extractPageText: (
    tabId: string,
    options?: BrowserTextExtractOptions
  ) => Promise<WorkbenchTabExtractTextResult>;
  readonly capturePage: (tabId: string) => Promise<WorkbenchVisualCaptureResult>;
  readonly captureVisiblePageLayers?: () => Promise<readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly imageBase64: string;
  }[]>;
  readonly readRenderedSnapshot: (payload: unknown) => Promise<unknown>;
  readonly resolveFrameGlobalBounds: (
    tabId: string,
    frameTreeNodeId: number
  ) => Promise<WorkbenchBrowserFrameGlobalBounds | null>;
  readonly reapplyLayout: () => void;
  readonly setModalOcclusionActive: (active: boolean) => void;
  readonly toggleDevToolsForActivePage: () => boolean;
  readonly observeAgentPage: (
    tabId: string,
    request?: {
      readonly strategy?: WorkbenchBrowserAgentObserveStrategy;
      readonly mapScope?: WorkbenchBrowserAgentMapScope;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly suppressActivity?: boolean;
    }
  ) => Promise<WorkbenchBrowserAgentObservation>;
  readonly findAgentPage: (
    tabId: string,
    request: WorkbenchBrowserSearchInPageRequest & {
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly authState?: "none" | "borrowLiveLogin";
      readonly useLiveLoginState?: boolean;
    }
  ) => Promise<WorkbenchBrowserAgentFindResult>;
  readonly locateAgentPage: (
    tabId: string,
    request: {
      readonly query: string;
      readonly matchMode?: "exact" | "semantic";
      readonly autoMap?: boolean;
      readonly nearbyLimit?: number;
      readonly reveal?: boolean;
      readonly caseSensitive?: boolean;
      readonly maxMatches?: number;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly authState?: "none" | "borrowLiveLogin";
      readonly useLiveLoginState?: boolean;
    }
  ) => Promise<WorkbenchBrowserAgentLocateResult>;
  readonly actOnAgentElement: (
    tabId: string,
    request: {
      readonly elementId?: number;
      readonly targetRef?: string;
      readonly effect?: import("./types").BrowserActionEffect;
      readonly awaitResponse?: boolean;
      readonly interaction: WorkbenchBrowserAgentInteraction;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly verification?: WorkbenchBrowserAgentVerification;
      readonly settle?: boolean;
      readonly optionLabel?: string;
      readonly selectValue?: string;
      readonly selectValues?: readonly string[];
      readonly optionQuery?: string;
      readonly optionOffset?: number;
      readonly workflowId?: string;
      readonly cacheMode?: import("./types").WorkbenchBrowserWorkflowCacheMode;
    }
  ) => Promise<WorkbenchBrowserAgentActionResult>;
  readonly planAgentPage: (
    tabId: string,
    request: {
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly anchorText?: string;
      readonly roles?: readonly string[];
      readonly labelIncludes?: readonly string[];
      readonly maxCandidates?: number;
      readonly timeoutMs?: number;
      readonly settle?: boolean;
    }
  ) => Promise<import("./types").WorkbenchBrowserAgentPlanResult>;
  readonly replayWorkflowOnPage: (
    tabId: string,
    request: {
      readonly workflowId: string;
      readonly effect?: import("./types").BrowserActionEffect;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
    }
  ) => Promise<WorkbenchBrowserAgentActionResult>;
  readonly verifyAgentActionOutcome: WorkbenchBrowserViewManager["verifyAgentActionOutcome"];
  readonly actOnAgentPoint: (
    tabId: string,
    request: {
      readonly point: WorkbenchBrowserAgentPoint;
      readonly effect?: import("./types").BrowserActionEffect;
      readonly interaction: WorkbenchBrowserAgentInteraction;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly verification?: WorkbenchBrowserAgentVerification;
    }
  ) => Promise<WorkbenchBrowserAgentActionResult>;
  readonly actOnAgentVisualPoint: (
    tabId: string,
    request: {
      readonly captureId: string;
      readonly point: WorkbenchBrowserAgentPoint;
      readonly effect?: import("./types").BrowserActionEffect;
      readonly interaction: WorkbenchBrowserAgentVisualInteraction;
      readonly to?: WorkbenchBrowserAgentPoint;
      readonly scrollDy?: number;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly verification?: WorkbenchBrowserAgentVerification;
    }
  ) => Promise<
    | WorkbenchBrowserAgentActionResult
    | WorkbenchBrowserAgentScrollResult
    | WorkbenchBrowserAgentVisualStaleResult
  >;
  readonly focusAgentPage: (
    tabId: string,
    request: {
      readonly direction: WorkbenchBrowserAgentFocusDirection;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly steps?: number;
      readonly restoreFocus?: boolean;
      readonly timeoutMs?: number;
    }
  ) => Promise<WorkbenchBrowserAgentFocusResult>;
  readonly scrollAgentPage: (
    tabId: string,
    request: {
      readonly direction?: WorkbenchBrowserAgentScrollDirection;
      readonly amount?: number;
      readonly pages?: number;
      readonly block?: WorkbenchBrowserAgentScrollBlock;
      readonly behavior?: "instant" | "smooth";
      readonly elementId?: number;
      readonly targetRef?: string;
      readonly point?: WorkbenchBrowserAgentPoint;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly autoMap?: boolean;
      readonly timeoutMs?: number;
      readonly reason?: "explicit_scroll" | "ensure_visible";
    }
  ) => Promise<WorkbenchBrowserAgentScrollResult>;
  readonly dragAgentElement: (tabId: string, request: import("./view-manager-runtime/surface-drag").BrowserDragRequest) => Promise<Record<string, unknown>>;
  readonly handleAgentDialog: (tabId:string,request:import("./view-manager-runtime/agent-native-dialog").NativeDialogRequest) => Promise<Record<string,unknown>>;
  readonly peekAgentDialog: (tabId:string,mode:"live"|"isolated") => Record<string,unknown> | undefined;
  readonly uploadAgentFiles: (tabId: string, request: import("./view-manager-runtime/agent-file-input").BrowserUploadRequest) => Promise<Record<string, unknown>>;
  readonly typeIntoAgentElement: (
    tabId: string,
    request: {
      readonly elementId?: number;
      readonly targetRef?: string;
      readonly effect?: import("./types").BrowserActionEffect;
      readonly text: string;
      readonly clear?: boolean;
      readonly fields?: readonly {
        readonly targetRef: string;
        readonly text: string;
        readonly clear?: boolean;
      }[];
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly verification?: WorkbenchBrowserAgentVerification;
      readonly sensitiveFill?: boolean;
    }
  ) => Promise<WorkbenchBrowserAgentActionResult>;
  readonly pressAgentKey: (
    tabId: string,
    request: {
      readonly key: string;
      readonly repeat?: number;
      readonly selectText?: string;
      readonly occurrence?: number;
      readonly effect?: import("./types").BrowserActionEffect;
      readonly awaitResponse?: boolean;
      readonly elementId?: number;
      readonly targetRef?: string;
      readonly targetMode?: WorkbenchBrowserAgentTargetMode;
      readonly timeoutMs?: number;
      readonly verification?: WorkbenchBrowserAgentVerification;
    }
  ) => Promise<WorkbenchBrowserAgentActionResult>;
  readonly axMapAgentPage: WorkbenchBrowserViewManager["axMapAgentPage"];
  readonly axQueryAgentSnapshot: WorkbenchBrowserViewManager["axQueryAgentSnapshot"];
  readonly axActOnNode: WorkbenchBrowserViewManager["axActOnNode"];
  readonly axFocusAgentPage: WorkbenchBrowserViewManager["axFocusAgentPage"];
  readonly axPressAgentKey: WorkbenchBrowserViewManager["axPressAgentKey"];
  readonly axExplainNode: WorkbenchBrowserViewManager["axExplainNode"];
  readonly axResolveAxRefBbox: WorkbenchBrowserViewManager["axResolveAxRefBbox"];
  readonly navigateAgentPage: WorkbenchBrowserViewManager["navigateAgentPage"];
  readonly reloadAgentPage: WorkbenchBrowserViewManager["reloadAgentPage"];
  readonly readAgentPage: WorkbenchBrowserViewManager["readAgentPage"];
  readonly describeAgentScene: WorkbenchBrowserViewManager["describeAgentScene"];
  readonly captureVisualScene: WorkbenchBrowserViewManager["captureVisualScene"];
  readonly actOnAgentVisualScene: WorkbenchBrowserViewManager["actOnAgentVisualScene"];
  readonly captureAgentPage: WorkbenchBrowserViewManager["captureAgentPage"];
  readonly readAgentPreviewPage: WorkbenchBrowserViewManager["readAgentPreviewPage"];
  readonly destroyBrowserAgentShadow: WorkbenchBrowserViewManager["destroyBrowserAgentShadow"];
  readonly detectAgentPageQr: WorkbenchBrowserViewManager["detectAgentPageQr"];
  readonly showAgentActivity: WorkbenchBrowserViewManager["showAgentActivity"];
  readonly readAgentFollowAudit: WorkbenchBrowserViewManager["readAgentFollowAudit"];
  readonly finishAgentFollowSessions: WorkbenchBrowserViewManager["finishAgentFollowSessions"];
  readonly explainAgentTargetRef: WorkbenchBrowserViewManager["explainAgentTargetRef"];
  readonly auditAgentPageDiagnostics: WorkbenchBrowserViewManager["auditAgentPageDiagnostics"];
  readonly elevateAgentPage: WorkbenchBrowserViewManager["elevateAgentPage"];
  readonly completeElevationSession: WorkbenchBrowserViewManager["completeElevationSession"];
  readonly resolveSharedControlDecision: WorkbenchBrowserViewManager["resolveSharedControlDecision"];
};

export const createWorkbenchBrowserIpcBridge = ({
  getWindow,
  downloadManager,
  loginManager,
  accessibilityNative,
  workbenchState,
  performanceScheduler,
  deferLayoutSync,
  getActCacheEnabled,
  resolveBrowserContextMenuLabels,
  resolveNativeRecoveryLabels
}: {
  readonly getWindow: () => BrowserWindow | null;
  readonly downloadManager?: DownloadManagerIpcBridge;
  readonly loginManager?: Pick<LoginManagerIpcBridge, "attachWebContents">;
  readonly accessibilityNative?: AccessibilityNativeLoadResult;
  readonly workbenchState?: Pick<WorkbenchStateIpcBridge, "readState" | "writeState">;
  readonly performanceScheduler?: LyraPerformanceResourceScheduler;
  readonly deferLayoutSync?: (flush: () => void) => boolean;
  // ActCache toggle (mirrors browserFollowMode). Forwarded to the view manager
  // and on to the AX controller so it can replay cached axActOnNode results.
  readonly getActCacheEnabled?: () => boolean;
  readonly resolveBrowserContextMenuLabels?: (locale: string) => BrowserContextMenuLabels;
  readonly resolveNativeRecoveryLabels?: (locale: string) => NativeRecoveryLabels;
}): WorkbenchBrowserIpcBridge => {
  registerBrowserPageFramePreload();
  const osAxAdapter = createOsAxAdapter(accessibilityNative);
  const manager: WorkbenchBrowserViewManager = createWorkbenchBrowserViewManager({
    getWindow,
    publishEvent: (event) => publishEvent(getWindow, event),
    ...(osAxAdapter === undefined ? {} : { osAxAdapter }),
    ...(workbenchState === undefined ? {} : { workbenchState }),
    ...(performanceScheduler === undefined ? {} : { performanceScheduler }),
    ...(getActCacheEnabled === undefined ? {} : { getActCacheEnabled }),
    ...(resolveBrowserContextMenuLabels === undefined ? {} : { resolveBrowserContextMenuLabels }),
    ...(resolveNativeRecoveryLabels === undefined ? {} : { resolveNativeRecoveryLabels }),
    ...(
      downloadManager === undefined && loginManager === undefined
        ? {}
        : {
            onWebContentsCreated: (tabId, webContents) => {
              const disposers = [
                downloadManager?.attachWebContents(tabId, webContents),
                loginManager?.attachWebContents(tabId, webContents)
              ].filter((dispose): dispose is () => void => typeof dispose === "function");
              return () => {
                for (const dispose of disposers) {
                  dispose();
                }
              };
            }
          }
    )
  });

  let pendingTopologySnapshot: WorkbenchBrowserTopologySnapshot | null = null;
  let pendingLayoutSnapshot: WorkbenchBrowserLayoutSnapshot | null = null;
  let lastTopologySnapshotKey: string | null = null;
  let lastLayoutSnapshotKey: string | null = null;
  let chromeFlushScheduled = false;
  let chromeBridgeDisposed = false;
  const flushBrowserChromeSync = (): void => {
    chromeFlushScheduled = false;
    if (chromeBridgeDisposed) {
      return;
    }
    const topology = pendingTopologySnapshot;
    pendingTopologySnapshot = null;
    const layout = pendingLayoutSnapshot;
    pendingLayoutSnapshot = null;
    if (topology !== null) {
      manager.syncTopology(topology);
    }
    if (layout !== null) {
      manager.syncLayout(layout);
    }
  };
  const scheduleBrowserChromeFlush = (): void => {
    if (deferLayoutSync?.(flushBrowserChromeSync) === true) {
      return;
    }
    if (chromeFlushScheduled) {
      return;
    }
    chromeFlushScheduled = true;
    setImmediate(flushBrowserChromeSync);
  };
  const syncTopology = (snapshot: WorkbenchBrowserTopologySnapshot): void => {
    const snapshotKey = JSON.stringify(snapshot);
    if (snapshotKey === lastTopologySnapshotKey) {
      return;
    }
    lastTopologySnapshotKey = snapshotKey;
    pendingTopologySnapshot = snapshot;
    scheduleBrowserChromeFlush();
  };
  const syncLayout = (snapshot: WorkbenchBrowserLayoutSnapshot): void => {
    const snapshotKey = JSON.stringify(snapshot);
    if (snapshotKey === lastLayoutSnapshotKey) {
      return;
    }
    lastLayoutSnapshotKey = snapshotKey;
    pendingLayoutSnapshot = snapshot;
    scheduleBrowserChromeFlush();
  };

  ipcMain.on(LYRA_CHANNELS.workbenchBrowserSyncTopology, (_event, snapshot: unknown) => {
    setWorkbenchShellReady(true);
    syncTopology(snapshot as WorkbenchBrowserTopologySnapshot);
  });
  ipcMain.on(LYRA_CHANNELS.workbenchBrowserSyncLayout, (_event, snapshot: unknown) => {
    syncLayout(snapshot as WorkbenchBrowserLayoutSnapshot);
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserNavigate, async (_event, request: unknown) => {
    return await manager.navigate(request as WorkbenchBrowserNavigateRequest);
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserGoBack, (_event, request: { readonly tabId?: unknown }) => {
    if (typeof request?.tabId === "string") {
      manager.goBack(request.tabId);
    }
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserGoForward, (_event, request: { readonly tabId?: unknown }) => {
    if (typeof request?.tabId === "string") {
      manager.goForward(request.tabId);
    }
  });
  ipcMain.handle(
    LYRA_CHANNELS.workbenchBrowserReload,
    (_event, request: { readonly tabId?: unknown; readonly ignoreCache?: unknown }) => {
      if (typeof request?.tabId === "string") {
        manager.reload(request.tabId, request.ignoreCache === true);
      }
    }
  );
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserStop, (_event, request: { readonly tabId?: unknown }) => {
    if (typeof request?.tabId === "string") {
      manager.stop(request.tabId);
    }
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserReadPageState, (_event, request?: unknown) => {
    return manager.readPageState(request as WorkbenchBrowserReadPageStateRequest | undefined);
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserReadSessionSnapshot, () => {
    return manager.readSessionSnapshot();
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserReadStorageState, async (_event, request?: unknown) => {
    return await manager.readStorageState(request as WorkbenchBrowserStorageStateRequest | undefined);
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserClearSiteData, async (_event, request: unknown) => {
    return await manager.clearSiteData(request as WorkbenchBrowserClearSiteDataRequest);
  });
  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserSearchInPage, async (_event, request: unknown) => {
    return await manager.searchInPage(request as WorkbenchBrowserSearchInPageRequest);
  });
  ipcMain.handle(
    LYRA_CHANNELS.workbenchBrowserSetChromePopover,
    async (_event, request: unknown) => {
      await manager.setChromePopover(request as WorkbenchBrowserChromePopoverRequest);
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.workbenchBrowserSetElementPickerMode,
    async (_event, request: unknown) => {
      await manager.setElementPickerMode(request as WorkbenchBrowserSetElementPickerModeRequest);
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.workbenchBrowserSetModalOcclusion,
    (_event, request: { readonly active?: unknown }) => {
      manager.setModalOcclusionActive(request?.active === true);
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.workbenchBrowserCapturePage,
    async (_event, request: { readonly tabId?: unknown } | undefined) => {
      const tabId = typeof request?.tabId === "string" ? request.tabId : manager.readActiveTabId();
      if (tabId === null) {
        throw new Error("tab_not_found");
      }
      return await manager.capturePage(tabId);
    }
  );
  ipcMain.handle(
    LYRA_CHANNELS.workbenchBrowserExecutePageContextAction,
    (_event, request: unknown) => {
      manager.runPageContextAction(
        request as import("../../shared/workbench-browser").WorkbenchBrowserExecutePageContextActionRequest
      );
    }
  );
  let activePageDragCitationPayload: PageDragCitationPayload | null = null;

  const publishActivePageDragCitation = (payload: PageDragCitationPayload | null): void => {
    if (payload === null) {
      activePageDragCitationPayload = null;
      publishEvent(getWindow, { kind: "page-drag-citation-clear" });
      return;
    }
    activePageDragCitationPayload = payload;
    publishEvent(getWindow, {
      kind: "page-drag-citation-active",
      payload
    });
  };

  const handlePageDragCitation = (
    event: Electron.IpcMainEvent,
    message: { readonly phase?: unknown; readonly payload?: unknown }
  ): void => {
    if (message?.phase === "end") {
      return;
    }
    if (message?.phase !== "begin") {
      return;
    }
    const pageContext = manager.resolvePageDragContextFromWebContents(event.sender);
    const rawPayload =
      typeof message.payload === "object" && message.payload !== null
        ? message.payload as Record<string, unknown>
        : {};
    const payload = normalizePageDragCitationPayload({
      tabId: rawPayload.tabId ?? pageContext?.tabId,
      pageUrl: rawPayload.pageUrl ?? pageContext?.pageUrl,
      pageTitle: rawPayload.pageTitle ?? pageContext?.pageTitle,
      frameUrl: rawPayload.frameUrl,
      selectionText: rawPayload.selectionText,
      linkUrl: rawPayload.linkUrl,
      linkText: rawPayload.linkText,
      srcUrl: rawPayload.srcUrl,
      mediaType: rawPayload.mediaType,
      elementTag: rawPayload.elementTag,
      elementSelector: rawPayload.elementSelector,
      elementId: rawPayload.elementId,
      elementRole: rawPayload.elementRole,
      elementAriaLabel: rawPayload.elementAriaLabel
    });
    if (payload === null) {
      return;
    }
    publishActivePageDragCitation(payload);
  };
  ipcMain.on(LYRA_CHANNELS.workbenchBrowserPageDragCitation, handlePageDragCitation);
  ipcMain.on(LYRA_CHANNELS.workbenchBrowserResolvePageTabId, (event) => {
    event.returnValue = manager.resolvePageDragContextFromWebContents(event.sender)?.tabId ?? null;
  });
  ipcMain.on(LYRA_CHANNELS.workbenchBrowserReadActivePageDragCitation, (event) => {
    event.returnValue = activePageDragCitationPayload;
  });
  ipcMain.on(LYRA_CHANNELS.workbenchBrowserConsumePageDragCitation, () => {
    publishActivePageDragCitation(null);
  });

  ipcMain.handle(LYRA_CHANNELS.workbenchBrowserCaptureWindow, async () => {
    const window = getWindow();
    if (window === null || window.isDestroyed()) {
      throw new Error("renderer_bridge_unavailable");
    }
    const image = await window.webContents.capturePage();
    const size = image.getSize();
    return {
      tabId: "lyra-window",
      mimeType: "image/png",
      imageBase64: image.toPNG().toString("base64"),
      width: size.width,
      height: size.height,
      visibleOnly: true
    } satisfies WorkbenchVisualCaptureResult;
  });

  return {
    dispose: () => {
      chromeBridgeDisposed = true;
      pendingTopologySnapshot = null;
      pendingLayoutSnapshot = null;
      ipcMain.removeAllListeners(LYRA_CHANNELS.workbenchBrowserSyncTopology);
      ipcMain.removeAllListeners(LYRA_CHANNELS.workbenchBrowserSyncLayout);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserNavigate);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserGoBack);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserGoForward);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserReload);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserStop);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserReadPageState);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserReadSessionSnapshot);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserReadStorageState);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserClearSiteData);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserSearchInPage);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserSetChromePopover);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserSetElementPickerMode);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserSetModalOcclusion);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserCapturePage);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserCaptureWindow);
      ipcMain.removeHandler(LYRA_CHANNELS.workbenchBrowserExecutePageContextAction);
      ipcMain.removeListener(LYRA_CHANNELS.workbenchBrowserPageDragCitation, handlePageDragCitation);
      ipcMain.removeAllListeners(LYRA_CHANNELS.workbenchBrowserReadActivePageDragCitation);
      ipcMain.removeAllListeners(LYRA_CHANNELS.workbenchBrowserConsumePageDragCitation);
      ipcMain.removeAllListeners(LYRA_CHANNELS.workbenchBrowserResolvePageTabId);
      manager.dispose();
    },
    syncTopology,
    syncLayout,
    navigate: manager.navigate,
    goBack: manager.goBack,
    goForward: manager.goForward,
    reload: manager.reload,
    runPageContextAction: manager.runPageContextAction,
    stop: manager.stop,
    readPageState: manager.readPageState,
    readSessionSnapshot: manager.readSessionSnapshot,
    readStorageState: manager.readStorageState,
    clearSiteData: manager.clearSiteData,
    searchInPage: manager.searchInPage,
    setChromePopover: manager.setChromePopover,
    setElementPickerMode: manager.setElementPickerMode,
    readActiveTabId: manager.readActiveTabId,
    listFrames: manager.listFrames,
    probeFrameDom: manager.probeFrameDom,
    executeFrameScript: manager.executeFrameScript,
    dispatchNativeInput: manager.dispatchNativeInput,
    openDebuggerSession: manager.openDebuggerSession,
    fetchWithTabSession: manager.fetchWithTabSession,
    readPageDomSummary: manager.readPageDomSummary,
    extractPageText: manager.extractPageText,
    capturePage: manager.capturePage,
    captureVisiblePageLayers: manager.captureVisiblePageLayers,
    readRenderedSnapshot: manager.readRenderedSnapshot,
    resolveFrameGlobalBounds: manager.resolveFrameGlobalBounds,
    reapplyLayout: manager.reapplyLayout,
    setModalOcclusionActive: manager.setModalOcclusionActive,
    toggleDevToolsForActivePage: manager.toggleDevToolsForActivePage,
    observeAgentPage: manager.observeAgentPage,
    axMapAgentPage: manager.axMapAgentPage,
    axQueryAgentSnapshot: manager.axQueryAgentSnapshot,
    axActOnNode: manager.axActOnNode,
    axFocusAgentPage: manager.axFocusAgentPage,
    axPressAgentKey: manager.axPressAgentKey,
    axExplainNode: manager.axExplainNode,
    axResolveAxRefBbox: manager.axResolveAxRefBbox,
    actOnAgentElement: manager.actOnAgentElement,
    planAgentPage: manager.planAgentPage,
    replayWorkflowOnPage: manager.replayWorkflowOnPage,
    actOnAgentPoint: manager.actOnAgentPoint,
    actOnAgentVisualPoint: manager.actOnAgentVisualPoint,
    focusAgentPage: manager.focusAgentPage,
    scrollAgentPage: manager.scrollAgentPage,
    uploadAgentFiles: manager.uploadAgentFiles,
    dragAgentElement: manager.dragAgentElement,
    handleAgentDialog: manager.handleAgentDialog,
    peekAgentDialog: manager.peekAgentDialog,
    typeIntoAgentElement: manager.typeIntoAgentElement,
    pressAgentKey: manager.pressAgentKey,
    navigateAgentPage: manager.navigateAgentPage,
    reloadAgentPage: manager.reloadAgentPage,
    readAgentPage: manager.readAgentPage,
    findAgentPage: manager.findAgentPage,
    locateAgentPage: manager.locateAgentPage,
    captureAgentPage: manager.captureAgentPage,
    describeAgentScene: manager.describeAgentScene,
    captureVisualScene: manager.captureVisualScene,
    actOnAgentVisualScene: manager.actOnAgentVisualScene,
    readAgentPreviewPage: manager.readAgentPreviewPage,
    destroyBrowserAgentShadow: manager.destroyBrowserAgentShadow,
    detectAgentPageQr: manager.detectAgentPageQr,
    showAgentActivity: manager.showAgentActivity,
    readAgentFollowAudit: manager.readAgentFollowAudit,
    finishAgentFollowSessions: manager.finishAgentFollowSessions,
    explainAgentTargetRef: manager.explainAgentTargetRef,
    auditAgentPageDiagnostics: manager.auditAgentPageDiagnostics,
    elevateAgentPage: manager.elevateAgentPage,
    completeElevationSession: manager.completeElevationSession,
    resolveSharedControlDecision: manager.resolveSharedControlDecision,
    verifyAgentActionOutcome: manager.verifyAgentActionOutcome
  };
};
