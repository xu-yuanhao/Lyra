import { configureBrowserSensitiveBoundary } from "../sensitive-values/browser-boundary";
import { desktopCapturer, screen, type BrowserWindow } from "electron";

import type { LyraRuntimeClient } from "../runtime-client";
import type { TerminalIpcBridge } from "../terminal/types";
import type { WorkbenchBrowserIpcBridge } from "../workbench-browser/service";
import type { WorkbenchObservationService } from "../workbench-observation/types";
import { createAgentIpcRouter } from "./agent-ipc-router";
import { rememberAgentBrowserPreviewTarget } from "./agent-browser-preview-target";
import { createAxToolHost } from "./ax-tool-host";
import { createComputerToolHost } from "./computer-tool-host";
import { createFavoritesToolHost } from "./favorites-tool-host";
import { createLumenToolHost } from "./lumen-tool-host";
import { createRuntimeEventForwarder } from "./runtime-event-forwarder";
import { ensureElevationSecretInjected } from "./elevation-restore";
import { createSoftwareCapabilityHost } from "./software-capability-host";
import { createTurnContextHost } from "./turn-context-host";
import { createTerminalToolHost } from "./terminal-tool-host";
import { createHostPersonaContextHandlers } from "./host-persona-context";
import { createWorkbenchObservationAdapter } from "./workbench-observation-adapter";
import { startLumenEvidenceSweeper } from "./artifact-materializer";
import {
  captureWaylandPortalScreenshot,
  pickDesktopCaptureSource,
  waylandSession
} from "./desktop-capture";
import type { WorkbenchStateIpcBridge } from "../workbench-state/service";
import { isLyraSensitiveValueRef, type LyraSensitiveValueRef } from "../../shared/sensitive-value";
import type {
  LyraSensitiveValueStoreRequest,
  LyraSensitiveValueStoreResponse
} from "../../shared/desktop-bridge";
import type { AgentRuntimeEvent } from "../../shared/agent";
import type { AgentHostCapabilityHandlers } from "./host-payload";
import {
  AGENT_HOST_CAPABILITY_METHODS,
  assertAgentHostCapabilityHandlers,
  isRecord
} from "./host-payload";
import { grantBrowserAuthorizeAct } from "../open-in-workbench";

export type AgentIpcBridge = {
  readonly dispose: () => void;
};

export const createAgentIpcBridge = ({
  runtimeClient,
  storageRoot,
  loginManagerStorageRoot,
  terminalBridge,
  getWindow,
  getBrowserBridge,
  getWorkbenchObservationService,
  workbenchState,
  resolveSensitiveValueForFill,
  revealSensitiveValue,
  storeSensitiveValue,
  addAllowedPreviewRoot
}: {
  readonly runtimeClient: LyraRuntimeClient;
  readonly storageRoot: string;
  readonly loginManagerStorageRoot?: string;
  readonly terminalBridge: TerminalIpcBridge;
  readonly getWindow: () => BrowserWindow | null;
  readonly getBrowserBridge: () => WorkbenchBrowserIpcBridge | null;
  readonly getWorkbenchObservationService: () => WorkbenchObservationService | null;
  readonly workbenchState: WorkbenchStateIpcBridge;
  readonly resolveSensitiveValueForFill?: (
    ref: LyraSensitiveValueRef
  ) => Promise<string>;
  readonly revealSensitiveValue?: (
    ref: LyraSensitiveValueRef
  ) => Promise<{ readonly value: string }>;
  readonly storeSensitiveValue?: (
    request: LyraSensitiveValueStoreRequest
  ) => Promise<LyraSensitiveValueStoreResponse>;
  readonly addAllowedPreviewRoot?: (rootPath: string) => void;
}): AgentIpcBridge => {
  const requestRuntime = async <T>(method: string, payload: object = {}): Promise<T> =>
    runtimeClient.request<T>(method, payload);

  // Re-inject the elevation secret at every turn start. The in-memory secret
  // is lost on runtime restarts by design; restoring here (main process,
  // named failures) replaces the old fire-once renderer mount effect whose
  // silent failure made the agent improvise its own sudo plumbing.
  const unsubscribeElevationRestore =
    revealSensitiveValue === undefined
      ? null
      : runtimeClient.subscribe((eventName, payload) => {
        if (eventName !== "agent.runtime") {
          return;
        }
        const event = payload as AgentRuntimeEvent;
        if (event.kind !== "turnStarted") {
          return;
        }
        void ensureElevationSecretInjected({
          requestRuntime,
          revealSensitiveValue: (ref) => revealSensitiveValue(ref as LyraSensitiveValueRef)
        });
      });

  const runtimeEventForwarder = createRuntimeEventForwarder({
    runtimeClient,
    requestRuntime,
    getWindow,
    getBrowserBridge
  });

  const workbenchObservationAdapter = createWorkbenchObservationAdapter({
    getWorkbenchObservationService,
    getBrowserBridge,
    getWindow
  });
  const tabResolver = {
    ...workbenchObservationAdapter,
    resolveBrowserAgentTabId: async (
      payload: unknown,
      targetMode: "isolated" | "live"
    ): Promise<string> => {
      const tabId = await workbenchObservationAdapter.resolveBrowserAgentTabId(
        payload,
        targetMode
      );
      rememberAgentBrowserPreviewTarget({ tabId, targetMode });
      return tabId;
    }
  };

  const terminalToolHost = createTerminalToolHost({
    terminalBridge,
    getWorkbenchObservationService
  });

  if (storeSensitiveValue) configureBrowserSensitiveBoundary(storeSensitiveValue);

  const lumenToolHost = createLumenToolHost({
    getBrowserBridge,
    tabResolver,
    storageRoot,
    ...(loginManagerStorageRoot === undefined ? {} : { loginManagerStorageRoot }),
    ...(resolveSensitiveValueForFill === undefined
      ? {}
      : { resolveSensitiveValueForFill })
  });

  startLumenEvidenceSweeper(storageRoot);

  const axToolHost = createAxToolHost({
    getBrowserBridge,
    tabResolver
  });

  const softwareCapabilityHost = createSoftwareCapabilityHost({ getWindow });
  const favoritesToolHost = createFavoritesToolHost({ storageRoot });

  const computerToolHost = createComputerToolHost({
    ...(resolveSensitiveValueForFill === undefined
      ? {}
      : { resolveSensitiveValueForFill }),
    visualFallback: {
      storageRoot,
      // Level-3 desktop capture. Wayland uses the Screenshot portal; X11 uses
      // Electron desktopCapturer. Lives in the platform-bridge layer so the
      // host stays a pure marshaller.
      captureScreen: async (scope) => {
        if (waylandSession()) {
          return await captureWaylandPortalScreenshot();
        }
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.size;
        const scale = display.scaleFactor || 1;
        const thumbnailSize = {
          width: Math.round(width * scale),
          height: Math.round(height * scale)
        };
        const lyraWindow = getWindow();
        const preferredTitle =
          scope === "focused-window"
          && lyraWindow !== null
          && lyraWindow.isDestroyed() === false
          && lyraWindow.isFocused()
            ? lyraWindow.getTitle()
            : null;
        const types = scope === "screen" ? (["screen"] as const) : (["window"] as const);
        let sources: Awaited<ReturnType<typeof desktopCapturer.getSources>> = [];
        try {
          sources = await desktopCapturer.getSources({
            types: [...types],
            thumbnailSize
          });
        } catch {
          sources = [];
        }
        if (scope !== "screen" && sources.length === 0) {
          try {
            sources = await desktopCapturer.getSources({
              types: ["screen"],
              thumbnailSize
            });
          } catch {
            sources = [];
          }
        }
        const source = pickDesktopCaptureSource(sources, scope, preferredTitle);
        if (source === undefined || source.thumbnail.isEmpty()) {
          return null;
        }
        const image = source.thumbnail;
        const size = image.getSize();
        return {
          imageBase64: image.toPNG().toString("base64"),
          mimeType: "image/png",
          width: size.width,
          height: size.height
        };
      }
    }
  });

  const hostCapabilityHandlers: AgentHostCapabilityHandlers = {
    ...workbenchObservationAdapter.handlers,
    ...lumenToolHost.handlers,
    ...axToolHost.handlers,
    ...computerToolHost.handlers,
    ...terminalToolHost.handlers,
    ...softwareCapabilityHost.handlers,
    ...favoritesToolHost.handlers,
    ...createHostPersonaContextHandlers(workbenchState),
    "agent.readTurnContext": createTurnContextHost({
      getWindow, getWorkbenchObservationService, getBrowserBridge, workbenchState,
      software: softwareCapabilityHost
    }),
    "mcp.oauth.openAuthorizationUrl": async (payload: unknown) => {
      if (!isRecord(payload) || typeof payload.url !== "string") {
        throw new Error("MCP authorization URL is required");
      }
      const authorizationUrl = new URL(payload.url);
      if (authorizationUrl.protocol !== "https:" && authorizationUrl.protocol !== "http:") {
        throw new Error("MCP authorization URL must use HTTP or HTTPS");
      }
      const browser = getBrowserBridge();
      if (browser === null) {
        throw new Error("Lyra browser is unavailable for MCP authorization");
      }
      grantBrowserAuthorizeAct(authorizationUrl.toString());
      return browser.navigate({
        address: authorizationUrl.toString(),
        newTab: true,
        title: "MCP authorization"
      });
    },
    ...(storeSensitiveValue === undefined
      ? {}
      : {
          "sensitiveValues.storeForAgentUse": async (payload: unknown) => {
            if (!isRecord(payload) || typeof payload.value !== "string" || typeof payload.label !== "string") {
              throw new Error("sensitive value and label are required");
            }
            return storeSensitiveValue({
              label: payload.label,
              value: payload.value,
              capabilities: ["list_metadata", "use"],
              ...(payload.owner === "ai-provider" || payload.owner === "external"
                ? { owner: payload.owner }
                : {}),
              ...(payload.valueKind === "api_key" || payload.valueKind === "token"
                ? { valueKind: payload.valueKind }
                : {}),
              ...(typeof payload.description === "string" ? { description: payload.description } : {})
            });
          }
        }),
    ...(resolveSensitiveValueForFill === undefined
      ? {}
      : {
          "sensitiveValues.resolveForAgentUse": async (payload: unknown) => {
            if (!isRecord(payload) || !isLyraSensitiveValueRef(payload.ref)) {
              throw new Error("sensitive value ref is required");
            }
            return {
              value: await resolveSensitiveValueForFill(payload.ref)
            };
          }
        })
  };

  assertAgentHostCapabilityHandlers(hostCapabilityHandlers);
  for (const method of AGENT_HOST_CAPABILITY_METHODS) {
    const handler = hostCapabilityHandlers[method];
    if (handler === undefined) {
      continue;
    }
    runtimeClient.registerRequestHandler(method, handler);
  }

  const ipcRouter = createAgentIpcRouter({
    requestRuntime,
    storageRoot,
    getBrowserBridge,
    ...(storeSensitiveValue === undefined ? {} : { storeSensitiveValue }),
    ...(addAllowedPreviewRoot === undefined ? {} : { addAllowedPreviewRoot }),
    closePrivateTerminalsForSession: terminalToolHost.closePrivateTerminalsForSession,
    listPrivateTerminalsForSession: terminalToolHost.listPrivateTerminalsForSession,
    closePrivateTerminalSession: terminalToolHost.closePrivateTerminalSession
  });

  return {
    dispose: () => {
      unsubscribeElevationRestore?.();
      runtimeEventForwarder.dispose();
      softwareCapabilityHost.dispose();
      terminalToolHost.dispose();
      ipcRouter.dispose();
      for (const method of AGENT_HOST_CAPABILITY_METHODS) {
        if (hostCapabilityHandlers[method] === undefined) {
          continue;
        }
        runtimeClient.unregisterRequestHandler(method);
      }
    }
  };
};
