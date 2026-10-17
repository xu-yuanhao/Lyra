import { desktopCapturer, nativeImage, screen, type BrowserWindow } from "electron";

import type {
  WorkbenchBrowserClearSiteDataRequest,
  WorkbenchBrowserStorageStateRequest
} from "../../shared/desktop-bridge";
import type {
  WorkbenchObservedTabDescriptor,
  WorkbenchTabExtractTextRequest,
  WorkbenchTabReadRequest,
  WorkbenchTabsListResult,
  WorkbenchVisualCaptureResult,
  WorkbenchWorkspaceReadRequest
} from "../../shared/workbench-observation";
import type { WorkbenchBrowserIpcBridge } from "../workbench-browser/service";
import { WORKBENCH_BROWSER_AGENT_STANDALONE_TAB_ID } from "../workbench-browser/types";
import type { WorkbenchObservationService } from "../workbench-observation/types";
import type { AgentHostCapabilityHandlers } from "./host-payload";
import {
  normalizePayload,
  readClampedOptionalNumber,
  readRuntimeSessionId,
  runHostCapabilityWithTimeout,
  isRecord
} from "./host-payload";
import { pickDesktopCaptureSource, waylandSession } from "./desktop-capture";
import { paintWorkspaceLayers } from "./workspace-capture-blit";
import { resolveVisualEvidenceTarget } from "./visual-evidence-target";

export const readTabId = (payload: unknown): string | null => {
  const value = normalizePayload(payload).tabId;
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const resolveWorkbenchTabId = (
  requestedTabId: string,
  tabs: readonly WorkbenchObservedTabDescriptor[]
): string | null => {
  const exact = tabs.find((tab) => tab.tabId === requestedTabId);
  if (exact !== undefined) {
    return exact.tabId;
  }

  const suffix = `-${requestedTabId}`;
  const suffixMatches = tabs.filter((tab) => tab.tabId.endsWith(suffix));
  if (suffixMatches.length === 1) {
    return suffixMatches[0]?.tabId ?? null;
  }

  const browserTabId = `browser-tab-${requestedTabId}`;
  const browserMatch = tabs.find((tab) => tab.tabId === browserTabId);
  return browserMatch?.tabId ?? null;
};

export const describeWorkbenchTabKind = (tab: WorkbenchObservedTabDescriptor): string =>
  tab.observationKind ?? tab.appId ?? tab.pageKind;

const isBrowserPageTab = (tab: WorkbenchObservedTabDescriptor): boolean =>
  tab.pageKind === "page" || tab.observationKind === "page";

const findActiveWorkbenchTab = (
  tabs: readonly WorkbenchObservedTabDescriptor[],
  activeTabId: string | null
): WorkbenchObservedTabDescriptor | null =>
  tabs.find((tab) => tab.tabId === activeTabId)
  ?? tabs.find((tab) => tab.active)
  ?? null;

const findDefaultWorkbenchReadTab = (
  tabs: readonly WorkbenchObservedTabDescriptor[],
  activeTabId: string | null
): WorkbenchObservedTabDescriptor | null =>
  tabs.find((tab) => tab.focusedPane)
  ?? findActiveWorkbenchTab(tabs, activeTabId)
  ?? tabs.find((tab) => tab.visible)
  ?? tabs[0]
  ?? null;

const createTabSummaryObservation = (
  tab: WorkbenchObservedTabDescriptor,
  reason: string
) => ({
  tab,
  observation: {
    kind: "tab-summary",
    title: tab.title,
    pageKind: tab.pageKind,
    ...(tab.appId === undefined ? {} : { appId: tab.appId }),
    active: tab.active,
    visible: tab.visible,
    focusedPane: tab.focusedPane,
    observable: tab.observable,
    reason
  }
});

export class NonBrowserWorkbenchTabError extends Error {
  readonly tab: WorkbenchObservedTabDescriptor;

  constructor(tab: WorkbenchObservedTabDescriptor) {
    super(
      `Browser action requires a browser page tab. Use workbench.read_tab for ${describeWorkbenchTabKind(tab)} tabs.`
    );
    this.name = "NonBrowserWorkbenchTabError";
    this.tab = tab;
  }
}

export type WorkbenchBrowserTabResolver = {
  readonly resolveBrowserAgentTabId: (
    payload: unknown,
    targetMode: "isolated" | "live"
  ) => Promise<string>;
  readonly readWorkbenchTabWithSummaryFallback: (payload: unknown) => Promise<unknown>;
  readonly listBrowserPageTabs?: () => Promise<readonly WorkbenchObservedTabDescriptor[]>;
  readonly describeWorkbenchTabKind: (tab: WorkbenchObservedTabDescriptor) => string;
  readonly activateWorkbenchTab?: (tabId: string) => Promise<void>;
};

const captureFromWindowPixels = async (
  window: BrowserWindow,
  captureLayers?: () => Promise<readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly imageBase64: string;
  }[]>
): Promise<WorkbenchVisualCaptureResult> => {
  const shell = await window.webContents.capturePage();
  const shellSize = shell.getSize();
  const content = window.getContentBounds();
  const layers = captureLayers === undefined ? [] : await captureLayers();
  const scaleX = shellSize.width / Math.max(1, content.width);
  const scaleY = shellSize.height / Math.max(1, content.height);
  const painted = paintWorkspaceLayers(
    shell.toBitmap(),
    shellSize.width,
    shellSize.height,
    content.width,
    content.height,
    layers.map((layer) => {
      const page = nativeImage.createFromBuffer(Buffer.from(layer.imageBase64, "base64"));
      const slotWidth = Math.max(1, Math.round(layer.width * scaleX));
      const slotHeight = Math.max(1, Math.round(layer.height * scaleY));
      const fitted = page.resize({ width: slotWidth, height: slotHeight });
      return {
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        bitmap: fitted.toBitmap(),
        bitmapWidth: slotWidth,
        bitmapHeight: slotHeight
      };
    })
  );
  const image = nativeImage.createFromBitmap(painted, {
    width: shellSize.width,
    height: shellSize.height
  });
  const size = image.getSize();
  return {
    tabId: "lyra-workspace-window",
    mimeType: "image/png",
    imageBase64: image.toPNG().toString("base64"),
    width: size.width,
    height: size.height,
    visibleOnly: true
  };
};

const captureLyraWorkspaceWindow = async (
  getWindow: () => BrowserWindow | null,
  captureLayers?: () => Promise<readonly {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly imageBase64: string;
  }[]>
): Promise<WorkbenchVisualCaptureResult> => {
  const window = getWindow();
  if (window === null || window.isDestroyed()) {
    throw new Error("renderer_bridge_unavailable");
  }
  const scale = screen.getPrimaryDisplay().scaleFactor || 1;
  const [width, height] = window.getSize() as [number, number];
  // Wayland's portal treats a D-Bus name as a PipeWire address and can freeze
  // the process. Capture our own pixels instead of asking for a window list.
  if (waylandSession() === false) try {
    const sources = await desktopCapturer.getSources({
      types: ["window"],
      thumbnailSize: {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
      }
    });
    const source = pickDesktopCaptureSource(sources, "focused-window", window.getTitle());
    if (source !== undefined && source.thumbnail.isEmpty() === false) {
      const image = source.thumbnail;
      const size = image.getSize();
      return {
        tabId: "lyra-workspace-window",
        mimeType: "image/png",
        imageBase64: image.toPNG().toString("base64"),
        width: size.width,
        height: size.height,
        visibleOnly: true
      };
    }
  } catch {
    // Wayland does not hand Electron a window list. The gin binding then
    // throws "argument at index 2, conversion failure" instead of an empty list.
  }
  return await captureFromWindowPixels(window, captureLayers);
};

export const createWorkbenchObservationAdapter = ({
  getWorkbenchObservationService,
  getBrowserBridge,
  getWindow
}: {
  readonly getWorkbenchObservationService: () => WorkbenchObservationService | null;
  readonly getBrowserBridge: () => WorkbenchBrowserIpcBridge | null;
  readonly getWindow: () => BrowserWindow | null;
}): WorkbenchBrowserTabResolver & { readonly handlers: AgentHostCapabilityHandlers } => {
  const normalizeWorkbenchTabPayload = async (
    payload: unknown,
    service: WorkbenchObservationService
  ): Promise<Record<string, unknown>> => {
    const request = normalizePayload(payload);
    const requestedTabId = readTabId(request);
    if (requestedTabId === null) {
      return request;
    }
    const listed = await service.listTabs({ scope: "all", includeUnsupported: true });
    const resolvedTabId = resolveWorkbenchTabId(requestedTabId, listed.tabs);
    return {
      ...request,
      tabId: resolvedTabId ?? requestedTabId
    };
  };

  const normalizeWorkbenchReadPayload = async (
    payload: unknown,
    service: WorkbenchObservationService
  ): Promise<Record<string, unknown>> => {
    const request = await normalizeWorkbenchTabPayload(payload, service);
    if (readTabId(request) !== null) {
      return request;
    }
    const listed = await service.listTabs({ scope: "all", includeUnsupported: true });
    const tab = findDefaultWorkbenchReadTab(listed.tabs, listed.activeTabId);
    if (tab === null) {
      throw new Error("No active Workbench tab is available");
    }
    return {
      ...request,
      tabId: tab.tabId
    };
  };

  const readWorkbenchTabWithSummaryFallback = async (
    payload: unknown
  ): Promise<unknown> => {
    const service = getWorkbenchObservationService();
    if (service === null) {
      throw new Error("Workbench observation capability is not available");
    }
    const request = await normalizeWorkbenchReadPayload(payload, service) as WorkbenchTabReadRequest;
    try {
      return await service.readTab(request);
    } catch (error) {
      const code =
        isRecord(error) && typeof error.code === "string" ? error.code : undefined;
      if (code !== "unsupported_tab_kind") {
        throw error;
      }
      const tabId = readTabId(request);
      if (tabId === null) {
        throw error;
      }
      const listed = await service.listTabs({ scope: "all", includeUnsupported: true });
      const tab = listed.tabs.find((entry) => entry.tabId === tabId);
      if (tab === undefined) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      return createTabSummaryObservation(tab, message);
    }
  };

  const livePageExists = (tabId: string): boolean => {
    const browser = getBrowserBridge();
    if (browser === null || typeof browser.readPageState !== "function") {
      return false;
    }
    return browser.readPageState({ tabId }) !== null;
  };

  const resolveBrowserPageTabId = async (payload: unknown): Promise<string> => {
    const browser = getBrowserBridge();
    if (!browser) throw new Error("Browser capability is not available");

    const explicitTabId = readTabId(payload);
    const observationService = getWorkbenchObservationService();
    const listed = observationService === null
      ? null
      : await observationService.listTabs({
        scope: "all",
        includeUnsupported: true
      });

    if (explicitTabId !== null) {
      if (listed !== null) {
        const resolvedExplicitTabId = resolveWorkbenchTabId(explicitTabId, listed.tabs);
        const targetTab =
          listed.tabs.find((tab) => tab.tabId === resolvedExplicitTabId) ?? null;
        if (targetTab !== null && !isBrowserPageTab(targetTab)) {
          throw new NonBrowserWorkbenchTabError(targetTab);
        }
        if (targetTab !== null) {
          return targetTab.tabId;
        }
      }
      if (livePageExists(explicitTabId)) {
        return explicitTabId;
      }
      throw new Error(`Unknown Workbench tab: ${explicitTabId}`);
    }

    if (listed !== null) {
      const activeWorkspaceTab = findActiveWorkbenchTab(listed.tabs, listed.activeTabId);
      if (activeWorkspaceTab !== null && isBrowserPageTab(activeWorkspaceTab)) {
        return activeWorkspaceTab.tabId;
      }
      const pageTab =
        listed.tabs.find((tab) => isBrowserPageTab(tab) && tab.focusedPane)
        ?? listed.tabs.find((tab) => isBrowserPageTab(tab) && tab.visible)
        ?? listed.tabs.find((tab) => isBrowserPageTab(tab))
        ?? null;
      if (pageTab !== null) {
        return pageTab.tabId;
      }
      if (activeWorkspaceTab !== null) {
        throw new NonBrowserWorkbenchTabError(activeWorkspaceTab);
      }
    }

    return browser.readActiveTabId() ?? "";
  };

  const resolveBrowserAgentTabId = async (
    payload: unknown,
    targetMode: "isolated" | "live"
  ): Promise<string> => {
    if (targetMode === "live" || readTabId(payload) !== null) {
      return await resolveBrowserPageTabId(payload);
    }
    try {
      const tabId = await resolveBrowserPageTabId(payload);
      return tabId.length > 0 ? tabId : WORKBENCH_BROWSER_AGENT_STANDALONE_TAB_ID;
    } catch (error) {
      if (error instanceof NonBrowserWorkbenchTabError) {
        return WORKBENCH_BROWSER_AGENT_STANDALONE_TAB_ID;
      }
      throw error;
    }
  };

  const listBrowserPageTabs = async (): Promise<readonly WorkbenchObservedTabDescriptor[]> => {
    const service = getWorkbenchObservationService();
    if (service === null) {
      return [];
    }
    const listed = await service.listTabs({ scope: "all", includeUnsupported: true });
    return listed.tabs.filter(isBrowserPageTab);
  };

  const activateWorkbenchTab = async (tabId: string): Promise<void> => {
    const service = getWorkbenchObservationService();
    if (service === null) {
      throw new Error("Workbench observation capability is not available");
    }
    await service.activateTab({ tabId });
  };

  const workbenchHandlers: AgentHostCapabilityHandlers = {
    "workbench.listTabs": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = normalizePayload(payload);
      return await service.listTabs({
        scope:
          request.scope === "visible" || request.scope === "active" || request.scope === "all"
            ? request.scope
            : "all",
        includeUnsupported: request.includeUnsupported !== false
      });
    },
    "workbench.readTab": readWorkbenchTabWithSummaryFallback,
    "workbench.activateTab": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = await normalizeWorkbenchTabPayload(payload, service);
      const tabId = readTabId(request);
      if (tabId === null) {
        throw new Error("tabId must be a non-empty string");
      }
      return await service.activateTab({ tabId });
    },
    "workbench.closeTab": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = await normalizeWorkbenchTabPayload(payload, service);
      const tabId = readTabId(request);
      if (tabId === null) {
        throw new Error("tabId must be a non-empty string");
      }
      return await service.closeTab({ tabId });
    },
    "workbench.reorderTab": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = await normalizeWorkbenchTabPayload(payload, service);
      const tabId = readTabId(request);
      if (tabId === null) {
        throw new Error("tabId must be a non-empty string");
      }
      const targetIndex = readClampedOptionalNumber(request, "targetIndex", 0, 0, 10_000);
      return await service.reorderTab({ tabId, targetIndex });
    },
    "workbench.splitTabs": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = normalizePayload(payload);
      const sourceTabId = readTabId({ tabId: request.sourceTabId });
      const targetTabId = readTabId({ tabId: request.targetTabId });
      if (sourceTabId === null || targetTabId === null) {
        throw new Error("sourceTabId and targetTabId must be non-empty strings");
      }
      const listed = await service.listTabs({ scope: "all", includeUnsupported: true });
      const resolvedSource = resolveWorkbenchTabId(sourceTabId, listed.tabs) ?? sourceTabId;
      const resolvedTarget = resolveWorkbenchTabId(targetTabId, listed.tabs) ?? targetTabId;
      return await service.splitTabs({
        sourceTabId: resolvedSource,
        targetTabId: resolvedTarget
      });
    },
    "workbench.detachSplit": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = await normalizeWorkbenchTabPayload(payload, service);
      const tabId = readTabId(request);
      if (tabId === null) {
        throw new Error("tabId must be a non-empty string");
      }
      return await service.detachSplit({ tabId });
    },
    "workbench.listTerminals": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      return await service.listTerminalPanes({});
    },
    "workbench.openTerminal": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = normalizePayload(payload);
      const placement = request.placement === "workspace" || request.placement === "dock"
        ? request.placement
        : undefined;
      const splitDirection = request.splitDirection === "vertical" || request.splitDirection === "horizontal"
        ? request.splitDirection
        : undefined;
      return await service.openTerminalPane({
        ...(placement === undefined ? {} : { placement }),
        ...(typeof request.title === "string" ? { title: request.title } : {}),
        ...(typeof request.cwd === "string" ? { cwd: request.cwd } : {}),
        ...(typeof request.terminalTabId === "string" ? { terminalTabId: request.terminalTabId } : {}),
        ...(typeof request.paneId === "string" ? { paneId: request.paneId } : {}),
        ...(splitDirection === undefined ? {} : { splitDirection }),
        sourceAgentSessionId: readRuntimeSessionId(request)
      });
    },
    "workbench.focusTerminal": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      return await service.focusTerminalPane(normalizePayload(payload));
    },
    "workbench.closeTerminal": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      return await service.closeTerminalPane(normalizePayload(payload));
    },
    "workbench.moveTerminal": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      const request = normalizePayload(payload);
      const terminalTabId =
        typeof request.terminalTabId === "string" && request.terminalTabId.trim().length > 0
          ? request.terminalTabId.trim()
          : null;
      if (terminalTabId === null) {
        throw new Error("terminalTabId must be a non-empty string");
      }
      const placement = request.placement === "workspace" ? "workspace" : "dock";
      const targetIndex =
        typeof request.targetIndex === "number" && Number.isFinite(request.targetIndex)
          ? Math.max(0, Math.trunc(request.targetIndex))
          : undefined;
      return await service.moveTerminalTab({
        terminalTabId,
        placement,
        ...(targetIndex === undefined ? {} : { targetIndex })
      });
    },
    "workbench.readWorkspace": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      return await service.readWorkspace(
        normalizePayload(payload) as WorkbenchWorkspaceReadRequest
      );
    },
    "workbench.captureVisualEvidence": async (payload) => {
      const request = normalizePayload(payload);
      const service = getWorkbenchObservationService();
      const listed: WorkbenchTabsListResult = service === null
        ? {
          activeTabId: null,
          visibleTabIds: [],
          layout: { layoutMode: "single", splitGroupTabIds: [], focusedSplitTabId: null },
          tabs: []
        }
        : await service.listTabs({ scope: "all", includeUnsupported: true });
      const target = resolveVisualEvidenceTarget(request, listed);
      if (target.mode === "unresolved_tab") {
        throw new Error(
          `Stale tab reference: tabId "${target.requestedTabId}" does not match any current workbench tab. Take a fresh snapshot with workbench.listTabs and retry with a listed tabId. Current tab ids: ${
            listed.tabs.map((tab) => tab.tabId).join(", ") || "(none)"
          }`
        );
      }
      const capture = target.mode === "active_tab"
        ? await (async () => {
          if (service === null) {
            throw new Error("Workbench observation capability is not available");
          }
          return await service.captureVisual({ tabId: target.tabId });
        })()
        : await captureLyraWorkspaceWindow(
          getWindow,
          getBrowserBridge()?.captureVisiblePageLayers
        );
      return {
        ok: true,
        kind: "workbenchVisualEvidence",
        scope: target.mode,
        capture,
        mimeType: capture.mimeType,
        width: capture.width,
        height: capture.height,
        visibleOnly: capture.visibleOnly,
        message: `Captured ${target.mode === "active_tab" ? "active workbench tab" : "visible workspace window"} visual evidence.`
      };
    },
    "workbench.extractTabText": async (payload) => {
      const service = getWorkbenchObservationService();
      if (service === null) {
        throw new Error("Workbench observation capability is not available");
      }
      return await service.extractTabText(
        await normalizeWorkbenchReadPayload(payload, service) as WorkbenchTabExtractTextRequest
      );
    },
    "workbench.browser.readSessionSnapshot": () => {
      const browser = getBrowserBridge();
      if (!browser) throw new Error("Browser session recovery capability is not available");
      return browser.readSessionSnapshot();
    },
    "workbench.browser.readRenderedSnapshot": async (payload: unknown): Promise<unknown> => {
      const browser = getBrowserBridge();
      if (!browser) throw new Error("Browser capability is not available");
      const request = normalizePayload(payload);
      const requestedTimeoutMs = readClampedOptionalNumber(request, "timeoutMs", 20_000, 250, 120_000);
      return await runHostCapabilityWithTimeout(
        "workbench.browser.readRenderedSnapshot",
        Math.min(124_000, requestedTimeoutMs + 4_000),
        () => browser.readRenderedSnapshot(request)
      );
    },
    "workbench.browser.readStorageState": async (payload: unknown) => {
      const browser = getBrowserBridge();
      if (!browser) throw new Error("Browser storage state capability is not available");
      return await browser.readStorageState(
        normalizePayload(payload) as WorkbenchBrowserStorageStateRequest
      );
    },
    "workbench.browser.clearSiteData": async (payload: unknown) => {
      const browser = getBrowserBridge();
      if (!browser) throw new Error("Browser storage clear capability is not available");
      return await browser.clearSiteData(
        normalizePayload(payload) as WorkbenchBrowserClearSiteDataRequest
      );
    },
    "agent.readSpatiotemporalContext": async () => {
      const service = getWorkbenchObservationService();
      const win = getWindow();
      const result: {
        windowWidth?: number;
        windowHeight?: number;
        layoutMode?: string;
        paneCount?: number;
        activeTabTitle?: string;
        activeTabAddress?: string;
        activeTabKind?: string;
        visibleTabCount?: number;
      } = {};
      // Window dimensions
      if (win !== null) {
        try {
          const bounds = win.getContentBounds();
          result.windowWidth = bounds.width;
          result.windowHeight = bounds.height;
        } catch {
          // ignore
        }
      }
      // Workspace layout + active tab
      if (service !== null) {
        try {
          const listed = await service.listTabs({ scope: "all", includeUnsupported: true });
          result.layoutMode = listed.layout?.layoutMode ?? "single";
          result.paneCount = listed.visibleTabIds.length;
          result.visibleTabCount = listed.tabs.length;
          const activeTab = findActiveWorkbenchTab(listed.tabs, listed.activeTabId);
          if (activeTab !== null) {
            result.activeTabTitle = activeTab.title;
            result.activeTabKind = activeTab.observationKind ?? activeTab.pageKind;
            if (activeTab.displayAddress !== undefined) {
              result.activeTabAddress = activeTab.displayAddress;
            }
          }
        } catch {
          // ignore — degrade to window-only
        }
      }
      return result;
    }
  };

  return {
    handlers: workbenchHandlers,
    resolveBrowserAgentTabId,
    readWorkbenchTabWithSummaryFallback,
    listBrowserPageTabs,
    describeWorkbenchTabKind,
    activateWorkbenchTab
  };
};
