import { createMainWindowLifecycle } from "./main-window-lifecycle";
import { createBoundedShutdown } from "./bounded-shutdown";
import { nativeRecoveryLabels } from "../shared/native-recovery-labels";
import { readBrowserContextMenuLocaleFromPreferences } from "./workbench-browser/view-manager-runtime/page-context-menu-native";
import {
  app,
  BrowserWindow,
  dialog,
  Menu,
  nativeTheme,
  net,
  session,
  type WebContents,
  type MenuItemConstructorOptions,
  ipcMain,
  powerSaveBlocker,
  powerMonitor,
  protocol
} from "electron";
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { hostname, userInfo, platform, homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

import {
  LYRA_APP_NAME,
  LYRA_APP_USER_MODEL_ID,
  resolveLyraAppIcon,
  resolveLyraAppIconPath,
  type LyraAppIconVariant
} from "./app-identity";
import { configureBrowserIdentityCompatibility } from "./browser-identity-compat";
import { registerWindowTheme } from "./window-theme";
import { loadAccessibilityNativeBindings } from "./accessibility";
import { createAutoUpdateService } from "./auto-update/service";
import {
  LYRA_APP_MODULE_SCHEME,
  createModularRuntimeHost
} from "./modular-runtime-host";
import { loadDocsNativeBindings } from "./documents/native-loader";
import { registerEditorIpcHandlers } from "./editor-ipc";
import { createAgentIpcBridge } from "./agent";
import { createAuthIpcBridge, type AuthIpcBridge } from "./auth/service";
import { readActCacheEnabled } from "./agent/act-cache-toggle";
import { createReapplyLayoutScheduler } from "./schedule-reapply-layout";
import {
  createRendererRecoveryController,
  shouldLinuxStartupRelaunch
} from "./workbench-renderer-recovery";
import { createDownloadManagerIpcBridge } from "./download-manager";
import { createFilesIpcBridge } from "./files";
import { createLocationIpcBridge } from "./location";
import { createLspIpcBridge } from "./lsp";
import {
  createLanguagePacksIpcBridge,
  type LanguagePacksIpcBridge
} from "./language-packs";
import { createLinuxCompatBridge } from "./linux-compat";
import { configureLinuxSecretStore } from "./sensitive-values/linux-secret-store";
import {
  createLyraPerformanceResourceScheduler,
  createLyraWorkspaceSurfacePerformanceSync
} from "./performance";
import { resolveCurrentDesktopTarget } from "./platform-target";
import { createSearchIpcBridge } from "./search";
import { createStorageBackedIpcBridges } from "./storage-backed-bridges";
import {
  createLyraFileAccessController,
} from "./security";
import { createScreenshotPreviewIpcBridge } from "./screenshot-preview/service";
import { resolveScreenshotPreviewStoreDir } from "./screenshot-preview/temp-image-store";
import { createProductAnnouncementsIpcBridge } from "./product-announcements/service";
import { createSystemNotificationsIpcBridge } from "./system-notifications/service";
import {
  applyElectronStoragePaths,
  ensureLyraStorageRoots,
  resolveLyraStorageRoots
} from "./storage";
import { registerMainWindowRenderer } from "./process-roles";
import { logProcessRoleSample } from "./process-role-sampler";
import { traceRendererCpu } from "./renderer-cpu-trace";
import {
  notifyOpenUninstaller,
  readForceUninstaller,
  registerHostUninstallEntry,
  registerProductUninstallIpc
} from "./product-uninstall";
import { createTerminalIpcBridge } from "./terminal";
import {
  createWorkbenchBrowserIpcBridge,
  type WorkbenchBrowserIpcBridge
} from "./workbench-browser/service";
import {
  applyLyraBrowserLaunchEnvToProcess,
  bindOpenInWorkbench,
  dismissLyraBrowserFallback,
  isHttpUrl,
  isLyraAuthCallbackUrl as isLyraAuthDeepLink,
  openHttpInLyraBrowser,
  readHttpUrlFromLyraOpenProtocol,
  readOpenHttpUrlFromArgs
} from "./open-in-workbench";
import {
  LYRA_UIUX_PACK_SCHEME,
  createUiuxPacksIpcBridge
} from "./uiux-packs";
import {
  applyLyraWindowMaterial,
  resolveLyraWindowMaterial,
  resolveOpaqueWindowBackground,
  resolveThemeSourceFromPreferencesJson,
  type LyraWindowMaterialMode
} from "./window-material";
import { createWorkbenchObservationRendererClient } from "./workbench-observation/local-tabs";
import { createWorkbenchObservationService } from "./workbench-observation/service";
import type { WorkbenchObservationService } from "./workbench-observation/types";
import { createWorkbenchDocumentsService } from "./workbench-documents/service";
import { createWorkbenchStateIpcBridge } from "./workbench-state";
import {
  LYRA_CHANNELS,
  type AppMetaPayload,
  type LinuxCompatReadConfigResponse,
  type LinuxCompatRestartRequest,
  type LinuxCompatRestartResponse,
  type LinuxCompatUpdateConfigRequest,
  type LinuxCompatUpdateConfigResponse,
  type WindowStatePayload
} from "../shared/desktop-bridge";

const currentDir = dirname(fileURLToPath(import.meta.url));
const LYRA_FILE_SCHEME = "lyra-file";
protocol.registerSchemesAsPrivileged([
  {
    scheme: LYRA_FILE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  },
  {
    scheme: LYRA_APP_MODULE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true
    }
  },
  {
    scheme: LYRA_UIUX_PACK_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow: BrowserWindow | null = null;
let disposeTerminalBridge: (() => void) | null = null;
let disposeAgentBridge: (() => void) | null = null;
let disposeAuthBridge: (() => void) | null = null;
let disposeFilesBridge: (() => void) | null = null;
let disposeDownloadManagerBridge: (() => void) | null = null;
let disposeImageViewerBridge: (() => void) | null = null;
let disposeOfficeBridge: (() => void) | null = null;
let disposeSqliteBridge: (() => void) | null = null;
let disposeIdentityBridge: (() => void) | null = null;
let disposeLoginManagerBridge: (() => void) | null = null;
let disposeLocationBridge: (() => void) | null = null;
let disposeLspBridge: (() => void) | null = null;
let disposeWorkbenchBrowserBridge: (() => void) | null = null;
let disposeWorkbenchStateBridge: (() => void) | null = null;
let flushWorkbenchStateBridge: (() => Promise<void>) | null = null;
let disposeUiuxPacksBridge: (() => void) | null = null;
let disposeLanguagePacksBridge: (() => void) | null = null;
let disposeComponentsBridge: (() => void) | null = null;
let disposeRuntimeClient: (() => void) | null = null;
let disposeSearchBridge: (() => void) | null = null;
let disposeSensitiveValuesBridge: (() => void) | null = null;
let disposeWorkbenchObservationRendererClient: (() => void) | null = null;
let disposeWorkbenchObservationService: (() => void) | null = null;
let disposeWorkbenchDocumentsService: (() => void) | null = null;
let disposePowerSaveBlocker: (() => void) | null = null;
let disposeLyraDockIconThemeSync: (() => void) | null = null;
let disposeSystemNotificationsBridge: (() => void) | null = null;
let disposeProductAnnouncementsBridge: (() => void) | null = null;
let disposeScreenshotPreviewBridge: (() => void) | null = null;
let disposeWorkspaceSurfacePerformanceSync: (() => void) | null = null;
let disposeAutoUpdateService: (() => void) | null = null;
let workbenchAppQuitting = false;
let workbenchBrowserBridge: WorkbenchBrowserIpcBridge | null = null;
let languagePacksBridge: LanguagePacksIpcBridge | null = null;
let readRecoveryPreferences: () => string | null = () => null;
let authBridge: AuthIpcBridge | null = null;
let pendingAuthCallbackUrl: string | null = null;
let workbenchObservationService: WorkbenchObservationService | null = null;
let windowMaterialDecision = resolveLyraWindowMaterial({
  platform: process.platform,
  env: process.env
});
let activeWindowMaterialMode: LyraWindowMaterialMode = windowMaterialDecision.mode;

const LYRA_MAC_WINDOW_BUTTON_POSITION = { x: 10, y: 9 } as const;
/** Matches `--lyra-shell-titlebar-h` (34px) in renderer tokens. */
const LYRA_MAC_TITLEBAR_OVERLAY_HEIGHT = 34;

const storageRoots = resolveLyraStorageRoots({
  executablePath: process.execPath,
  isPackaged: app.isPackaged,
  platform: process.platform,
  env: process.env
});
ensureLyraStorageRoots(storageRoots);
applyElectronStoragePaths(storageRoots);
const lyraFileAccess = createLyraFileAccessController([
  join(storageRoots.modules.identity, "identity-icons"),
  join(storageRoots.modules.loginManager, "favicons"),
  join(storageRoots.modules.agent, "provider-icons"),
  storageRoots.modules.imageViewer,
  resolveScreenshotPreviewStoreDir(),
  homedir(),
  tmpdir()
]);

const focusExistingMainWindow = (): void => {
  if (mainWindow === null || mainWindow.isDestroyed()) {
    return;
  }
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.show();
  mainWindow.focus();
};

const isLyraAuthCallbackUrl = (value: string): boolean => isLyraAuthDeepLink(value);

const readAuthCallbackUrl = (args: readonly string[]): string | undefined =>
  args.find((value) => isLyraAuthCallbackUrl(value));

let lastAuthCallbackUrl = "";

const dispatchAuthCallbackUrl = (value: string): void => {
  if (!isLyraAuthCallbackUrl(value)) {
    return;
  }
  if (value === lastAuthCallbackUrl) {
    return;
  }
  lastAuthCallbackUrl = value;
  dismissLyraBrowserFallback();
  pendingAuthCallbackUrl = value;
  if (authBridge === null) {
    return;
  }
  const callbackUrl = pendingAuthCallbackUrl;
  pendingAuthCallbackUrl = null;
  void authBridge.handleCallback(callbackUrl).catch((error: unknown) => {
    console.error(`[lyra-auth] callback failed: ${String(error)}`);
  });
};

const singleInstanceLockAcquired = app.requestSingleInstanceLock();
if (!singleInstanceLockAcquired) {
  console.warn("[lyra-electron] another Lyra instance is already using this profile; exiting");
  app.exit(0);
  process.exit(0);
}

app.on("open-url", (event, url) => {
  event.preventDefault();
  if (isLyraAuthCallbackUrl(url)) {
    dispatchAuthCallbackUrl(url);
    return;
  }
  const nested = readHttpUrlFromLyraOpenProtocol(url);
  if (nested !== undefined) {
    openHttpInLyraBrowser(nested);
    return;
  }
  if (isHttpUrl(url)) {
    openHttpInLyraBrowser(url);
  }
});

app.on("second-instance", (_event, commandLine) => {
  if (readForceUninstaller(commandLine, process.env)) {
    notifyOpenUninstaller(() => mainWindow);
    focusExistingMainWindow();
    return;
  }
  const callbackUrl = readAuthCallbackUrl(commandLine);
  if (callbackUrl !== undefined) {
    dispatchAuthCallbackUrl(callbackUrl);
    focusExistingMainWindow();
  }
  const openUrl = readOpenHttpUrlFromArgs(commandLine);
  if (openUrl !== undefined) {
    openHttpInLyraBrowser(openUrl);
    return;
  }
  if (callbackUrl === undefined) {
    focusExistingMainWindow();
  }
});

const linuxCompatBridge = createLinuxCompatBridge({
  platform: process.platform,
  argv: process.argv,
  env: process.env,
  storageRoot: storageRoots.modules.linuxCompat
});

linuxCompatBridge.applyToProcessEnv();
linuxCompatBridge.applyToElectronApp(app);
configureLinuxSecretStore(app);
configureBrowserIdentityCompatibility(app);

if (linuxCompatBridge.status.enabled) {
  const status = linuxCompatBridge.status;
  console.info(
    `[lyra-linux] profile=${status.profile} backend=${status.backend} gpu=${status.gpuMode} safeMode=${status.safeMode} profileSource=${status.profileSource} backendSource=${status.backendSource} gpuSource=${status.gpuSource}`
  );
  for (const warning of status.warnings) {
    console.warn(`[lyra-linux] warning ${warning.code}: ${warning.message}`);
  }
}

app.on("child-process-gone", (_event, details) => {
  linuxCompatBridge.recordChildProcessGone(details);
  if (details.type !== "GPU") {
    return;
  }
  const window = mainWindow;
  if (window === null || window.isDestroyed() || window.webContents.isDestroyed()) {
    return;
  }
  window.webContents.invalidate();
  workbenchBrowserBridge?.reapplyLayout();
});

const isDevelopmentMode = (): boolean =>
  typeof process.env.ELECTRON_RENDERER_URL === "string"
  && process.env.ELECTRON_RENDERER_URL.length > 0;

const createMacApplicationMenuTemplate = (): MenuItemConstructorOptions[] => [
  {
    label: LYRA_APP_NAME,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" }
    ]
  },
  {
    role: "editMenu",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" }
    ]
  },
  ...(isDevelopmentMode()
    ? [{
        role: "viewMenu" as const,
        submenu: [
          { role: "toggleDevTools" as const }
        ]
      }]
    : []),
  {
    role: "windowMenu"
  }
];

const configureApplicationMenu = (): void => {
  if (process.platform === "darwin") {
    Menu.setApplicationMenu(Menu.buildFromTemplate(createMacApplicationMenuTemplate()));
    return;
  }
  Menu.setApplicationMenu(null);
};

const readMacWindowFullScreenState = (window: BrowserWindow): boolean => {
  if (pendingMacFullScreenTarget !== null) {
    return pendingMacFullScreenTarget;
  }
  return window.isFullScreen();
};

const toWindowState = (window: BrowserWindow): WindowStatePayload => ({
  isFocused: window.isFocused(),
  isMaximized: window.isMaximized(),
  isFullScreen:
    process.platform === "darwin"
      ? readMacWindowFullScreenState(window)
      : window.isFullScreen()
});

const readAppMetaPayload = (): AppMetaPayload => {
  let userName: string | undefined;
  try {
    userName = userInfo().username;
  } catch (_error) {
    userName = process.env.USER ?? process.env.USERNAME;
  }
  const desktopTarget = resolveCurrentDesktopTarget();
  return {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    windowMaterialMode: activeWindowMaterialMode,
    desktopTargetId: desktopTarget.id,
    desktopSupportTier: desktopTarget.supportTier,
    linuxLibc: desktopTarget.libc,
    isPackaged: app.isPackaged,
    ...(process.env.LYRA_INSTALLER_MODE === "1" ? { forceInstaller: true } : {}),
    ...(readForceUninstaller(process.argv, process.env) ? { forceUninstaller: true } : {}),
    componentInstallRoot: storageRoots.componentInstallRoot,
    ...(userName === undefined || userName.trim().length === 0
      ? {}
      : { userName: userName.trim() }),
    hostName: hostname(),
    locale: app.getLocale(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };
};

const publishWindowState = (window: BrowserWindow): void => {
  window.webContents.send(LYRA_CHANNELS.windowStateChanged, toWindowState(window));
};

const applyMacWindowButtonPosition = (window: BrowserWindow): void => {
  if (process.platform !== "darwin" || window.isDestroyed()) {
    return;
  }
  window.setWindowButtonVisibility(true);
  window.setWindowButtonPosition(LYRA_MAC_WINDOW_BUTTON_POSITION);
};

const isWindowFullScreen = (window: BrowserWindow): boolean =>
  process.platform === "darwin"
    ? readMacWindowFullScreenState(window)
    : window.isFullScreen();

const FULLSCREEN_LAYOUT_SETTLE_MS = 650;
const FULLSCREEN_LAYOUT_MAX_WAIT_MS = 1500;

let fullscreenLayoutTransitionActive = false;
let fullscreenLayoutSettleTimer: ReturnType<typeof setTimeout> | null = null;
let fullscreenLayoutTransitionStartedAt = 0;
let lastKnownWindowFullScreenState = false;
let pendingMacFullScreenTarget: boolean | null = null;
const fullscreenLayoutFlushes = new Set<() => void>();

const clearFullscreenLayoutSettleTimer = (): void => {
  if (fullscreenLayoutSettleTimer !== null) {
    clearTimeout(fullscreenLayoutSettleTimer);
    fullscreenLayoutSettleTimer = null;
  }
};

const completeFullscreenLayoutTransition = (window: BrowserWindow): void => {
  fullscreenLayoutTransitionActive = false;
  fullscreenLayoutTransitionStartedAt = 0;
  pendingMacFullScreenTarget = null;
  if (window.isDestroyed()) {
    fullscreenLayoutFlushes.clear();
    return;
  }
  lastKnownWindowFullScreenState = isWindowFullScreen(window);
  publishWindowState(window);
  const flushes = Array.from(fullscreenLayoutFlushes);
  fullscreenLayoutFlushes.clear();
  if (flushes.length > 0) {
    for (const flush of flushes) {
      flush();
    }
    return;
  }
  workbenchBrowserBridge?.reapplyLayout();
  if (process.platform === "darwin") {
    applyMacWindowButtonPosition(window);
    setTimeout(() => applyMacWindowButtonPosition(window), 120);
  }
};

const settleFullscreenLayout = (window: BrowserWindow): void => {
  clearFullscreenLayoutSettleTimer();
  if (fullscreenLayoutTransitionStartedAt === 0) {
    fullscreenLayoutTransitionStartedAt = Date.now();
  }
  const elapsed = Date.now() - fullscreenLayoutTransitionStartedAt;
  const delay = Math.max(
    0,
    Math.min(FULLSCREEN_LAYOUT_SETTLE_MS, FULLSCREEN_LAYOUT_MAX_WAIT_MS - elapsed)
  );
  if (delay === 0) {
    completeFullscreenLayoutTransition(window);
    return;
  }
  fullscreenLayoutSettleTimer = setTimeout(() => {
    fullscreenLayoutSettleTimer = null;
    completeFullscreenLayoutTransition(window);
  }, delay);
};

const beginFullscreenLayoutTransition = (window: BrowserWindow): void => {
  fullscreenLayoutTransitionActive = true;
  if (fullscreenLayoutTransitionStartedAt === 0) {
    fullscreenLayoutTransitionStartedAt = Date.now();
  }
  publishWindowState(window);
  settleFullscreenLayout(window);
};

const syncFullscreenStateFromWindow = (window: BrowserWindow): boolean => {
  if (pendingMacFullScreenTarget !== null) {
    return false;
  }
  const actualFullScreenState = isWindowFullScreen(window);
  if (actualFullScreenState === lastKnownWindowFullScreenState) {
    return false;
  }
  lastKnownWindowFullScreenState = actualFullScreenState;
  beginFullscreenLayoutTransition(window);
  return true;
};

const setMacWindowFullScreen = (window: BrowserWindow, nextFullScreenState: boolean): void => {
  if (process.platform !== "darwin") {
    window.setFullScreen(nextFullScreenState);
    return;
  }
  // Cherry Studio / VS Code (nativeFullScreen default) / Zed all use native
  // setFullScreen on macOS so the Dock and menu bar are hidden. Avoid
  // setSimpleFullScreen with titleBarStyle: 'hidden' (VS Code #63291).
  pendingMacFullScreenTarget = nextFullScreenState;
  beginFullscreenLayoutTransition(window);
  if (nextFullScreenState && window.isMaximized()) {
    window.unmaximize();
  }
  window.setFullScreen(nextFullScreenState);
  window.webContents.focus();
  applyMacWindowButtonPosition(window);
  setTimeout(() => applyMacWindowButtonPosition(window), 120);
  setTimeout(() => applyMacWindowButtonPosition(window), 400);
};

const requestWorkbenchLayoutReapply = (window: BrowserWindow): void => {
  if (process.platform === "darwin") {
    if (syncFullscreenStateFromWindow(window)) {
      return;
    }
    if (fullscreenLayoutTransitionActive) {
      settleFullscreenLayout(window);
      return;
    }
  }
  workbenchBrowserBridge?.reapplyLayout();
};

const deferWorkbenchBrowserLayoutSync = (flush: () => void): boolean => {
  if (process.platform !== "darwin") {
    return false;
  }
  const window = mainWindow;
  if (window === null || window.isDestroyed()) {
    return false;
  }
  syncFullscreenStateFromWindow(window);
  if (!fullscreenLayoutTransitionActive) {
    return false;
  }
  fullscreenLayoutFlushes.add(flush);
  settleFullscreenLayout(window);
  return true;
};

const isDevToolsToggleInput = (input: Electron.Input): boolean => {
  const key = input.key.toLowerCase();
  return (
    key === "f12"
    || (
      key === "i"
      && (
        (input.control && input.shift)
        || (input.meta && input.alt)
        || (input.meta && input.shift)
      )
    )
  );
};

const isReloadInput = (input: Electron.Input): boolean => {
  const key = input.key.toLowerCase();
  if (key === "f5") {
    return true;
  }
  if (key !== "r") {
    return false;
  }
  return (input.control || input.meta) && input.alt !== true;
};

const toggleDevToolsForContents = (contents: WebContents): void => {
  if (contents.isDevToolsOpened()) {
    contents.closeDevTools();
    return;
  }
  contents.openDevTools({ mode: "detach" });
};

const toggleDevToolsForPreferredTarget = (contents: WebContents): void => {
  if (mainWindow !== null && contents.id === mainWindow.webContents.id) {
    if (workbenchBrowserBridge?.toggleDevToolsForActivePage() === true) {
      return;
    }
  }
  toggleDevToolsForContents(contents);
};

const reloadActiveWorkbenchPage = (ignoreCache: boolean): boolean => {
  const tabId = workbenchBrowserBridge?.readActiveTabId() ?? null;
  if (tabId === null) {
    return false;
  }
  workbenchBrowserBridge?.reload(tabId, ignoreCache);
  return true;
};

const registerWorkbenchInputShortcuts = (): void => {
  app.on("web-contents-created", (_event, contents: WebContents) => {
    contents.on("before-input-event", (event, input) => {
      if (isReloadInput(input)) {
        event.preventDefault();
        reloadActiveWorkbenchPage(input.shift === true);
        return;
      }
      if (isDevelopmentMode() && isDevToolsToggleInput(input)) {
        event.preventDefault();
        toggleDevToolsForPreferredTarget(contents);
      }
    });
  });
};

const registerLyraFileProtocol = (): void => {
  protocol.handle(LYRA_FILE_SCHEME, async (request) => {
    const resolved = await lyraFileAccess.resolveRequest(request.url);
    if (resolved === null) {
      return new Response(new Uint8Array(), {
        status: 403
      });
    }
    try {
      const response = await net.fetch(pathToFileURL(resolved.path).toString(), { headers: request.headers });
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...Object.fromEntries(response.headers),
          "content-type": resolved.contentType,
          "cache-control": "private, max-age=30"
        }
      });
    } catch (_error) {
      return new Response(new Uint8Array(), {
        status: 404
      });
    }
  });
};

const attachDevelopmentLogging = (window: BrowserWindow): void => {
  if (!isDevelopmentMode()) {
    return;
  }

  window.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    console.error(
      `[lyra-debug] did-fail-load code=${errorCode} url=${validatedUrl} description=${errorDescription}`
    );
  });

  window.webContents.on("render-process-gone", (_event, details) => {
    console.error(
      `[lyra-debug] render-process-gone reason=${details.reason} exitCode=${details.exitCode}`
    );
  });

  window.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (sourceId.startsWith("devtools://")) {
      return;
    }
    console.info(
      `[lyra-renderer:${level}] ${sourceId}:${line} ${message}`
    );
  });

  window.webContents.once("did-finish-load", () => {
    window.setTitle(LYRA_APP_NAME);
    traceRendererCpu(window);

    setTimeout(() => {
      void window.webContents
        .executeJavaScript(
          `(() => {
            const pick = (selector) => {
              const node = document.querySelector(selector);
              if (!(node instanceof HTMLElement)) {
                return null;
              }
              const rect = node.getBoundingClientRect();
              return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                childCount: node.childElementCount
              };
            };

            const activeTab = document.querySelector(".lyra-browser-tab-item-active");
            const readStyles = (selector) => {
              const node = document.querySelector(selector);
              if (!(node instanceof HTMLElement)) {
                return null;
              }
              const styles = window.getComputedStyle(node);
              const rect = node.getBoundingClientRect();
              return {
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                display: styles.display,
                visibility: styles.visibility,
                opacity: styles.opacity,
                transform: styles.transform,
                position: styles.position,
                zIndex: styles.zIndex,
                color: styles.color,
                backgroundColor: styles.backgroundColor,
                borderColor: styles.borderColor
              };
            };

            const centerNode = document.elementFromPoint(
              Math.round(window.innerWidth / 2),
              Math.round(window.innerHeight / 2)
            );
            const centerElement = centerNode instanceof HTMLElement ? centerNode : null;

            return {
              readyState: document.readyState,
              title: document.title,
              root: pick(".lyra-root"),
              main: pick(".lyra-main"),
              centerStack: pick(".lyra-center-stack"),
              workspace: pick(".lyra-workspace"),
              searchShell: pick(".lyra-workspace-browser-shell"),
              searchPill: readStyles(".lyra-workspace-browser-shell .lyra-browser-pill"),
              searchInput: readStyles(".lyra-workspace-browser-shell .lyra-browser-pill input"),
              resultsShell: pick(".lyra-results-shell"),
              pageShell: pick(".lyra-page-shell"),
              fileManagerSurface: pick(".lyra-file-manager-surface"),
              browserTabs: pick(".lyra-browser-tabs"),
              workspaceStyles: readStyles(".lyra-workspace"),
              centerElementClass:
                centerElement === null
                  ? null
                  : centerElement.className,
              activeTabText: activeTab instanceof HTMLElement ? activeTab.innerText.trim() : null,
              bodyTextLength: document.body.innerText.length,
              bodyTextSample: document.body.innerText.slice(0, 120)
            };
          })()`,
          true
        )
        .then((snapshot) => {
          console.info(`[lyra-debug] renderer snapshot ${JSON.stringify(snapshot)}`);
        })
        .catch((error: unknown) => {
          console.error(`[lyra-debug] snapshot failed ${String(error)}`);
        });

      void window.webContents
        .capturePage()
        .then((image) => {
          const outputDir = join(process.cwd(), ".tmp");
          mkdirSync(outputDir, { recursive: true });
          const outputPath = join(outputDir, "lyra-desktop-startup.png");
          const png = image.toPNG();
          writeFileSync(outputPath, png);
          const size = image.getSize();
          console.info(
            `[lyra-debug] startup screenshot saved to ${outputPath} bytes=${png.byteLength} size=${size.width}x${size.height}`
          );
        })
        .catch((error: unknown) => {
          console.error(`[lyra-debug] capturePage failed ${String(error)}`);
        });
    }, 1200);
  });
};

const readPreventSleepEnabledPreference = (
  rawPreferencesJson: string | null,
): boolean => {
  if (typeof rawPreferencesJson !== "string" || rawPreferencesJson.trim().length === 0) {
    return true;
  }
  try {
    const parsed = JSON.parse(rawPreferencesJson) as { readonly preventSleepEnabled?: unknown };
    return typeof parsed.preventSleepEnabled === "boolean"
      ? parsed.preventSleepEnabled
      : true;
  } catch {
    return true;
  }
};

const configureGeolocationPermissionHandler = (): (() => void) => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission !== "geolocation") {
      callback(false);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission !== "geolocation") {
      return false;
    }
    return true;
  });

  return () => {
    session.defaultSession.setPermissionRequestHandler(null);
    session.defaultSession.setPermissionCheckHandler(null);
  };
};

const createPowerSaveBlockerController = (): {
  readonly setEnabled: (enabled: boolean) => void;
  readonly dispose: () => void;
} => {
  let blockerId: number | null = null;

  const stop = (): void => {
    if (blockerId === null) {
      return;
    }
    if (powerSaveBlocker.isStarted(blockerId)) {
      powerSaveBlocker.stop(blockerId);
    }
    blockerId = null;
  };

  return {
    setEnabled: (enabled) => {
      if (!enabled) {
        stop();
        return;
      }
      if (blockerId !== null && powerSaveBlocker.isStarted(blockerId)) {
        return;
      }
      blockerId = powerSaveBlocker.start("prevent-display-sleep");
    },
    dispose: stop
  };
};

const loadRendererInDevelopment = (window: BrowserWindow, rendererUrl: string): void => {
  const maxAttempts = 60;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRetry = (): void => {
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const onFailLoad = (
    _event: Electron.Event,
    errorCode: number,
    _errorDescription: string,
    validatedUrl: string
  ): void => {
    if (validatedUrl !== rendererUrl || errorCode !== -102 || attempt >= maxAttempts) {
      return;
    }
    clearRetry();
    retryTimer = setTimeout(tryLoad, 500);
  };

  const cleanup = (): void => {
    clearRetry();
    window.webContents.off("did-fail-load", onFailLoad);
  };

  const tryLoad = (): void => {
    attempt += 1;
    void window.loadURL(rendererUrl);
  };

  window.webContents.on("did-fail-load", onFailLoad);
  window.webContents.once("did-finish-load", cleanup);
  window.once("closed", cleanup);
  window.webContents.once("destroyed", cleanup);
  tryLoad();
};

const showWindowWhenRendererPainted = (window: BrowserWindow): void => {
  let shown = false;
  const show = (): void => {
    if (shown || window.isDestroyed()) {
      return;
    }
    shown = true;
    window.show();
  };
  window.once("ready-to-show", show);
  window.webContents.once("did-finish-load", show);
};

const createMainWindow = (): BrowserWindow => {
  const isMac = process.platform === "darwin";
  const iconPath = resolveLyraAppIconPath();
  windowMaterialDecision = resolveLyraWindowMaterial({
    platform: process.platform,
    env: process.env,
    prefersDark: nativeTheme.shouldUseDarkColors
  });
  const window = new BrowserWindow({
    title: LYRA_APP_NAME,
    width: 1460,
    height: 920,
    minWidth: 1160,
    minHeight: 720,
    fullscreenable: true,
    frame: isMac,
    // Electron 43+ paints native rounded corners for frameless windows on
    // Linux (8px CSD). Keep enabled so Ubuntu Wayland/X11 matches macOS/Win.
    roundedCorners: true,
    ...(isMac
      ? {
          acceptFirstMouse: true,
          trafficLightPosition: LYRA_MAC_WINDOW_BUTTON_POSITION,
          titleBarOverlay: {
            height: LYRA_MAC_TITLEBAR_OVERLAY_HEIGHT
          }
        }
      : {}),
    ...windowMaterialDecision.options,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: isMac ? "hidden" : "default",
    ...(iconPath === null ? {} : { icon: iconPath }),
    webPreferences: {
      preload: join(currentDir, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      disableHtmlFullscreenWindowResize: true,
      // VS Code agents window: keep the Chromium surface alive when occluded.
      backgroundThrottling: false
    }
  });
  activeWindowMaterialMode = applyLyraWindowMaterial(window, windowMaterialDecision);
  applyMacWindowButtonPosition(window);
  showWindowWhenRendererPainted(window);

  const rendererUrl = process.env.ELECTRON_RENDERER_URL;
  if (typeof rendererUrl === "string" && rendererUrl.length > 0) {
    if (isDevelopmentMode()) {
      loadRendererInDevelopment(window, rendererUrl);
    } else {
      void window.loadURL(rendererUrl);
    }
  } else {
    void window.loadFile(join(currentDir, "../renderer/index.html"));
  }

  let didFinishLoad = false;
  let recoveryRestartRequested = false;
  attachDevelopmentLogging(window);
  window.webContents.once("did-finish-load", () => {
    didFinishLoad = true;
    linuxCompatBridge.markWindowReady();
    registerMainWindowRenderer(window.webContents.getOSProcessId());
    logProcessRoleSample();
  });
  const rendererRecovery = createRendererRecoveryController({
    isUnavailable: () => workbenchAppQuitting || window.isDestroyed() || window.webContents.isDestroyed(),
    tryStartupRelaunch: (details) => {
      if (recoveryRestartRequested || !shouldLinuxStartupRelaunch({
        didFinishLoad, isDevelopmentMode: isDevelopmentMode(),
        linuxCompatEnabled: linuxCompatBridge.status.enabled,
        linuxRecoveryActive: linuxCompatBridge.status.recovery.active, reason: details.reason
      })) return false;
      recoveryRestartRequested = true;
      linuxCompatBridge.requestRestart(app, { recovery: true, reason: `renderer-startup-${details.reason}-${details.exitCode}` });
      return true;
    },
    reload: () => window.webContents.reload(),
    chooseRecovery: async () => {
      const locale = readBrowserContextMenuLocaleFromPreferences(readRecoveryPreferences());
      const labels = languagePacksBridge?.resolveNativeRecoveryLabels(locale) ?? nativeRecoveryLabels();
      const { response } = await dialog.showMessageBox(window, {
        type: "warning", message: labels.windowTitle, detail: labels.windowDescription,
        buttons: [labels.reopenWindow, labels.closeWindow], defaultId: 0, cancelId: 1, noLink: true
      });
      return response === 0 ? "reopen" : "close";
    },
    reopen: () => mainWindowLifecycle.reopen(window),
    close: () => {
      workbenchBrowserBridge?.readSessionSnapshot();
      window.destroy();
    },
    report: (message) => console.error(`[lyra] ${message}`)
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    linuxCompatBridge.recordRendererGone(details);
    rendererRecovery.handle(details);
  });

  const recoverOccludedPaint = (): void => {
    if (window.isDestroyed() || window.webContents.isDestroyed()) {
      return;
    }
    window.webContents.invalidate();
    requestWorkbenchLayoutReapply(window);
  };
  window.on("show", recoverOccludedPaint);
  window.on("restore", recoverOccludedPaint);
  powerMonitor.on("resume", recoverOccludedPaint);
  window.on("focus", () => {
    applyMacWindowButtonPosition(window);
    publishWindowState(window);
    requestWorkbenchLayoutReapply(window);
  });
  window.on("blur", () => publishWindowState(window));
  window.on("maximize", () => {
    publishWindowState(window);
    requestWorkbenchLayoutReapply(window);
  });
  window.on("unmaximize", () => {
    publishWindowState(window);
    requestWorkbenchLayoutReapply(window);
  });
  window.on("enter-full-screen", () => {
    lastKnownWindowFullScreenState = true;
    if (pendingMacFullScreenTarget === null) {
      beginFullscreenLayoutTransition(window);
    }
    applyMacWindowButtonPosition(window);
    publishWindowState(window);
    settleFullscreenLayout(window);
    setTimeout(() => applyMacWindowButtonPosition(window), 400);
  });
  window.on("leave-full-screen", () => {
    lastKnownWindowFullScreenState = false;
    pendingMacFullScreenTarget = null;
    if (fullscreenLayoutTransitionActive === false) {
      beginFullscreenLayoutTransition(window);
    }
    applyMacWindowButtonPosition(window);
    publishWindowState(window);
    settleFullscreenLayout(window);
    setTimeout(() => applyMacWindowButtonPosition(window), 400);
  });
  window.on("enter-html-full-screen", () => {
    publishWindowState(window);
    requestWorkbenchLayoutReapply(window);
  });
  window.on("leave-html-full-screen", () => {
    publishWindowState(window);
    requestWorkbenchLayoutReapply(window);
  });
  window.on("resize", createReapplyLayoutScheduler(window, () => {
    requestWorkbenchLayoutReapply(window);
  }));
  window.on("close", () => {
    workbenchBrowserBridge?.readSessionSnapshot();
  });
  window.on("closed", () => {
    rendererRecovery.dispose();
    powerMonitor.off("resume", recoverOccludedPaint);
    clearFullscreenLayoutSettleTimer();
  });

  return window;
};

const mainWindowLifecycle = createMainWindowLifecycle({
  isQuitting: () => workbenchAppQuitting,
  create: () => {
    workbenchBrowserBridge?.readSessionSnapshot();
    return createMainWindow();
  },
  publish: (window) => {
    mainWindow = window;
    if (window !== null) publishWindowState(window);
  },
  onClosed: () => { if (process.platform !== "darwin" && !workbenchAppQuitting) app.quit(); }
});

const resolveSystemAppIconVariant = (): LyraAppIconVariant =>
  nativeTheme.shouldUseDarkColors ? "dark" : "light";

const installLyraDockIconThemeSync = (): (() => void) | null => {
  if (process.platform !== "darwin") {
    return null;
  }

  const syncDockIcon = (): void => {
    const appIcon = resolveLyraAppIcon(resolveSystemAppIconVariant());
    if (appIcon !== null && app.dock !== undefined) {
      app.dock.setIcon(appIcon);
    }
  };

  syncDockIcon();
  nativeTheme.on("updated", syncDockIcon);
  return () => {
    nativeTheme.off("updated", syncDockIcon);
  };
};

const registerIpcHandlers = async (): Promise<void> => {
  applyLyraBrowserLaunchEnvToProcess(app.getPath("userData"), {
    ...(app.isPackaged ? {} : { electronAppPath: app.getAppPath() })
  });
  const storageBackedBridges = createStorageBackedIpcBridges({
    fileManagerStorageRoot: storageRoots.modules.fileManager,
    imageViewerStorageRoot: storageRoots.modules.imageViewer,
    identityStorageRoot: storageRoots.modules.identity,
    loginManagerStorageRoot: storageRoots.modules.loginManager,
    createPreviewUrl: lyraFileAccess.createPreviewUrl,
    addAllowedRoot: lyraFileAccess.addAllowedRoot,
    getWindow: () => mainWindow
  });
  disposeImageViewerBridge = storageBackedBridges.imageViewer.dispose;
  disposeOfficeBridge = storageBackedBridges.office.dispose;
  disposeSqliteBridge = storageBackedBridges.sqlite.dispose;
  disposeIdentityBridge = storageBackedBridges.identity.dispose;
  const loginManagerBridge = storageBackedBridges.loginManager;
  disposeLoginManagerBridge = loginManagerBridge.dispose;
  const sensitiveValuesBridge = storageBackedBridges.sensitiveValues;
  disposeSensitiveValuesBridge = sensitiveValuesBridge.dispose;
  const modularRuntimeHost = await createModularRuntimeHost({
    storageRoots,
    resourcesPath: process.resourcesPath,
    sharedProcessModulePath: join(currentDir, "shared-process.cjs"),
    isPackaged: app.isPackaged,
    requestQuit: () => app.quit()
  });
  const runtimeClient = modularRuntimeHost.runtimeClient;
  disposeRuntimeClient = modularRuntimeHost.disposeRuntime;
  const performanceScheduler = createLyraPerformanceResourceScheduler(runtimeClient);
  const registerRuntimePerformanceResource = (
    resourceId: string,
    kind: "agentTask" | "downloadTask" | "lspTask" | "searchTask" | "terminalPane"
  ): void => {
    performanceScheduler.registerResource({
      resourceId,
      kind,
      coreKey: resourceId,
      stateKey: resourceId,
      lifecycle: "keptAlive",
      visible: false,
      active: false,
      sharedSignature: resourceId
    });
  };
  registerRuntimePerformanceResource("terminal:runtime", "terminalPane");
  registerRuntimePerformanceResource("download:runtime", "downloadTask");
  registerRuntimePerformanceResource("lsp:runtime", "lspTask");
  registerRuntimePerformanceResource("search:runtime", "searchTask");
  registerRuntimePerformanceResource("agent:runtime", "agentTask");
  const filesBridge = createFilesIpcBridge({
    storageRoot: storageRoots.modules.fileManager,
    runtimeClient,
    createPreviewUrl: lyraFileAccess.createPreviewUrl
  });
  disposeFilesBridge = filesBridge.dispose;
  console.info("[lyra-files] runtime attached");
  const downloadManagerBridge = createDownloadManagerIpcBridge({
    storageRoot: storageRoots.modules.downloadManager,
    runtimeClient,
    getWindow: () => mainWindow
  });
  disposeDownloadManagerBridge = downloadManagerBridge.dispose;
  const terminalBridge = createTerminalIpcBridge(
    storageRoots.modules.terminal,
    runtimeClient,
    () => mainWindow
  );
  console.info(`[lyra-terminal] runtime attached: ${terminalBridge.loadResult.loadedFrom}`);
  disposeTerminalBridge = terminalBridge.dispose;

  const searchBridge = createSearchIpcBridge();
  disposeSearchBridge = searchBridge.dispose;

  const lspBridge = createLspIpcBridge(
    runtimeClient,
    () => mainWindow,
    {
      allowRustAnalyzerFallback: app.isPackaged === false,
      withRustAnalyzerResource: modularRuntimeHost.withRustAnalyzerResource
    }
  );
  console.info(`[lyra-lsp] runtime attached: ${lspBridge.loadResult.loadedFrom}`);
  disposeLspBridge = lspBridge.dispose;

  const workbenchStateBridge = await createWorkbenchStateIpcBridge(
    storageRoots.modules.workbenchState
  );
  disposeWorkbenchStateBridge = workbenchStateBridge.dispose;
  readRecoveryPreferences = () => workbenchStateBridge.readState("preferences");
  nativeTheme.themeSource = resolveThemeSourceFromPreferencesJson(
    workbenchStateBridge.readState("preferences")
  );
  flushWorkbenchStateBridge = workbenchStateBridge.flush;
  languagePacksBridge = createLanguagePacksIpcBridge({
    storageRoot: join(storageRoots.lyraRoot, "language-packs"),
    appVersion: app.getVersion(),
    readComponentBundles: modularRuntimeHost.readLanguageResourceBundles
  });
  disposeLanguagePacksBridge = languagePacksBridge.dispose;
  const componentServices = await modularRuntimeHost.registerComponentServices({
    reloadLanguageResources: languagePacksBridge.reloadComponentBundles
  });
  disposeComponentsBridge = componentServices.dispose;
  disposeAutoUpdateService = createAutoUpdateService(
    app,
    () => mainWindow,
    undefined,
    componentServices.appUpdater
  );
  authBridge = createAuthIpcBridge({
    getWindow: () => mainWindow
  });
  disposeAuthBridge = authBridge.dispose;

  const agentBridge = createAgentIpcBridge({
    runtimeClient,
    storageRoot: storageRoots.modules.agent,
    loginManagerStorageRoot: storageRoots.modules.loginManager,
    terminalBridge,
    getWindow: () => mainWindow,
    getBrowserBridge: () => workbenchBrowserBridge,
    getWorkbenchObservationService: () => workbenchObservationService,
    workbenchState: workbenchStateBridge,
    addAllowedPreviewRoot: lyraFileAccess.addAllowedRoot,
    resolveSensitiveValueForFill: sensitiveValuesBridge.resolveForAgentFill,
    storeSensitiveValue: sensitiveValuesBridge.store
  });
  disposeAgentBridge = agentBridge.dispose;
  const disposeGeolocationPermissionHandler = configureGeolocationPermissionHandler();
  const locationBridge = createLocationIpcBridge({
    getWebContents: () => {
      if (mainWindow !== null && mainWindow.isDestroyed() === false) {
        return mainWindow.webContents;
      }
      return null;
    }
  });
  disposeLocationBridge = () => {
    disposeGeolocationPermissionHandler();
    locationBridge.dispose();
  };
  const accessibilityNativeLoadResult = loadAccessibilityNativeBindings();
  if (accessibilityNativeLoadResult.ok) {
    console.info(`[lyra-accessibility] native loaded from ${accessibilityNativeLoadResult.loadedFrom}`);
  } else {
    console.warn(`[lyra-accessibility] native unavailable: ${accessibilityNativeLoadResult.errorMessage}`);
  }
  const workspaceSurfacePerformanceSync = createLyraWorkspaceSurfacePerformanceSync({
    workbenchState: workbenchStateBridge,
    performanceScheduler
  });
  disposeWorkspaceSurfacePerformanceSync = workspaceSurfacePerformanceSync.dispose;
  workbenchBrowserBridge = createWorkbenchBrowserIpcBridge({
    getWindow: () => mainWindow,
    downloadManager: downloadManagerBridge,
    loginManager: loginManagerBridge,
    accessibilityNative: accessibilityNativeLoadResult,
    workbenchState: workbenchStateBridge,
    performanceScheduler,
    deferLayoutSync: deferWorkbenchBrowserLayoutSync,
    getActCacheEnabled: readActCacheEnabled,
    resolveBrowserContextMenuLabels: languagePacksBridge.resolveBrowserContextMenuLabels,
    resolveNativeRecoveryLabels: languagePacksBridge.resolveNativeRecoveryLabels
  });
  disposeWorkbenchBrowserBridge = workbenchBrowserBridge.dispose;
  bindOpenInWorkbench({
    publishOpenTab: (url) => {
      const window = mainWindow;
      if (window === null || window.isDestroyed()) {
        return;
      }
      window.webContents.send(LYRA_CHANNELS.workbenchBrowserEvent, {
        kind: "request-open-tab",
        address: url
      });
    },
    focusMainWindow: focusExistingMainWindow,
    getMainWindow: () => mainWindow,
    onAuthCallback: dispatchAuthCallbackUrl
  });
  const uiuxPacksBridge = createUiuxPacksIpcBridge({
    storageRoot: storageRoots.modules.uiuxPacks,
    workbenchStateBridge
  });
  disposeUiuxPacksBridge = uiuxPacksBridge.dispose;
  const systemNotificationsBridge = createSystemNotificationsIpcBridge({
    getWindow: () => mainWindow,
    iconPath: resolveLyraAppIconPath(),
    appUserModelId: LYRA_APP_USER_MODEL_ID
  });
  disposeSystemNotificationsBridge = systemNotificationsBridge.dispose;
  const productAnnouncementsBridge = createProductAnnouncementsIpcBridge({
    getWindow: () => mainWindow
  });
  disposeProductAnnouncementsBridge = productAnnouncementsBridge.dispose;
  const screenshotPreviewBridge = createScreenshotPreviewIpcBridge({
    getWindow: () => mainWindow
  });
  disposeScreenshotPreviewBridge = screenshotPreviewBridge.dispose;
  const powerSaveBlockerController = createPowerSaveBlockerController();
  powerSaveBlockerController.setEnabled(
    readPreventSleepEnabledPreference(workbenchStateBridge.readState("preferences"))
  );
  const unsubscribeWorkbenchPreferenceState = workbenchStateBridge.subscribe((event) => {
    if (event.key !== "preferences") {
      return;
    }
    powerSaveBlockerController.setEnabled(readPreventSleepEnabledPreference(event.json));
  });
  disposePowerSaveBlocker = () => {
    unsubscribeWorkbenchPreferenceState();
    powerSaveBlockerController.dispose();
  };
  const docsNativeLoadResult = loadDocsNativeBindings();
  if (docsNativeLoadResult.ok === false) {
    throw new Error(
      `docs native unavailable: ${docsNativeLoadResult.errorMessage}\ntried paths:\n${docsNativeLoadResult.triedPaths.join("\n")}`
    );
  }
  console.info(`[lyra-docs] native loaded from ${docsNativeLoadResult.loadedFrom}`);
  const workbenchDocumentsService = createWorkbenchDocumentsService({
    browserBridge: workbenchBrowserBridge,
    docsNativeBindings: docsNativeLoadResult.bindings
  });
  disposeWorkbenchDocumentsService = workbenchDocumentsService.dispose;
  const workbenchObservationRendererClient = createWorkbenchObservationRendererClient({
    getWindow: () => mainWindow
  });
  disposeWorkbenchObservationRendererClient = workbenchObservationRendererClient.dispose;
  workbenchObservationService = createWorkbenchObservationService({
    browserBridge: workbenchBrowserBridge,
    documentsService: workbenchDocumentsService,
    rendererClient: workbenchObservationRendererClient,
    terminalBridge
  });
  disposeWorkbenchObservationService = () => {
    workbenchObservationService?.dispose();
    workbenchObservationService = null;
  };

  ipcMain.handle(LYRA_CHANNELS.minimizeWindow, () => {
    const window = mainWindow;
    if (window === null || window.isDestroyed()) {
      return;
    }
    if (process.platform === "darwin" && isWindowFullScreen(window)) {
      setMacWindowFullScreen(window, false);
      setTimeout(() => {
        if (!window.isDestroyed()) {
          window.minimize();
        }
      }, 120);
      return;
    }
    window.minimize();
  });

  ipcMain.handle(LYRA_CHANNELS.toggleWindowMaximize, () => {
    if (mainWindow === null) {
      return;
    }
    if (process.platform === "darwin") {
      const nextFullScreenState = !isWindowFullScreen(mainWindow);
      setMacWindowFullScreen(mainWindow, nextFullScreenState);
      return;
    }
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
      return;
    }
    mainWindow.maximize();
  });

  ipcMain.handle(LYRA_CHANNELS.closeWindow, () => {
    mainWindow?.close();
  });

  const disposeWindowTheme = registerWindowTheme(
    () => mainWindow,
    (dark) => {
      if (
        activeWindowMaterialMode === "opaque"
        && mainWindow !== null
        && mainWindow.isDestroyed() === false
      ) {
        mainWindow.setBackgroundColor(
          resolveOpaqueWindowBackground(dark)
        );
      }
    }
  );
  app.once("will-quit", disposeWindowTheme);

  ipcMain.handle(LYRA_CHANNELS.readAppMeta, (): AppMetaPayload => readAppMetaPayload());

  ipcMain.on(LYRA_CHANNELS.readAppMetaSync, (event) => {
    event.returnValue = readAppMetaPayload();
  });

  registerProductUninstallIpc({
    app,
    ipcMain,
    getWindow: () => mainWindow,
    roots: storageRoots
  });

  registerEditorIpcHandlers();

  ipcMain.handle(
    LYRA_CHANNELS.linuxCompatReadStatus,
    () => linuxCompatBridge.status
  );

  ipcMain.handle(
    LYRA_CHANNELS.linuxCompatReadConfig,
    (): LinuxCompatReadConfigResponse => linuxCompatBridge.readConfig()
  );

  ipcMain.handle(
    LYRA_CHANNELS.linuxCompatUpdateConfig,
    (_event, request: LinuxCompatUpdateConfigRequest): LinuxCompatUpdateConfigResponse =>
      linuxCompatBridge.updateConfig(request)
  );

  ipcMain.handle(
    LYRA_CHANNELS.linuxCompatRestart,
    (_event, request?: LinuxCompatRestartRequest): LinuxCompatRestartResponse =>
      linuxCompatBridge.requestRestart(app, request)
  );

  const readLocalLanguageBundles = (): Readonly<Record<string, Record<string, string>>> => {
    const localesDir = join(homedir(), ".lyra", "locales");
    if (!existsSync(localesDir)) return {};
    const bundles: Record<string, Record<string, string>> = {};
    for (const file of readdirSync(localesDir)) {
      if (!file.endsWith(".json")) continue;
      const fileLocale = file.slice(0, -".json".length);
      try {
        const locale = Intl.getCanonicalLocales(fileLocale)[0];
        const parsed = JSON.parse(readFileSync(join(localesDir, file), "utf-8"));
        if (locale !== undefined && typeof parsed === "object" && parsed !== null) {
          const bundle: Record<string, string> = {};
          for (const [key, value] of Object.entries(parsed)) {
            if (typeof value === "string") {
              bundle[key] = value;
            }
          }
          if (Object.keys(bundle).length > 0) {
            bundles[locale] = bundle;
          }
        }
      } catch {
        // A malformed locale or bundle must not block the remaining packs.
      }
    }
    return bundles;
  };

  ipcMain.handle(LYRA_CHANNELS.i18nReadLocalBundles, readLocalLanguageBundles);
  ipcMain.handle(
    LYRA_CHANNELS.i18nReadLanguageBundles,
    async (): Promise<{
      readonly directions: Readonly<Record<string, "ltr" | "rtl">>;
      readonly managed: Readonly<Record<string, Record<string, string>>>;
      readonly local: Readonly<Record<string, Record<string, string>>>;
    }> => ({
      directions: await languagePacksBridge?.readTextDirections() ?? {},
      managed: await languagePacksBridge?.readManagedBundles() ?? {},
      local: readLocalLanguageBundles()
    })
  );

};

app.setName(LYRA_APP_NAME);
if (app.isPackaged) {
  app.setAsDefaultProtocolClient("lyra");
} else if (process.argv[1] !== undefined) {
  app.setAsDefaultProtocolClient("lyra", process.execPath, [resolve(process.argv[1])]);
}
if (process.platform === "win32") {
  app.setAppUserModelId(LYRA_APP_USER_MODEL_ID);
}
process.title = LYRA_APP_NAME;

app.whenReady().then(async () => {
  configureApplicationMenu();
  registerWorkbenchInputShortcuts();
  app.once("gpu-info-update", () => {
    void linuxCompatBridge.captureGpuSnapshot(app);
  });
  const appIconPath = resolveLyraAppIconPath();
  app.setAboutPanelOptions({
    applicationName: LYRA_APP_NAME,
    applicationVersion: app.getVersion(),
    version: app.getVersion(),
    ...(appIconPath === null ? {} : { iconPath: appIconPath })
  });
  disposeLyraDockIconThemeSync = installLyraDockIconThemeSync();
  registerLyraFileProtocol();
  linuxCompatBridge.persistStatusSnapshot(storageRoots.modules.linuxCompat);
  await registerIpcHandlers();
  if (!readForceUninstaller(process.argv, process.env)) {
    void registerHostUninstallEntry(app);
  }
  mainWindowLifecycle.open();
  const processRoleSample = setInterval(logProcessRoleSample, 60_000);
  app.once("before-quit", () => {
    clearInterval(processRoleSample);
  });
  const initialCallbackUrl = readAuthCallbackUrl(process.argv);
  if (initialCallbackUrl !== undefined) {
    dispatchAuthCallbackUrl(initialCallbackUrl);
  }
  const initialOpenUrl = readOpenHttpUrlFromArgs(process.argv);
  if (initialOpenUrl !== undefined) {
    openHttpInLyraBrowser(initialOpenUrl);
  }
  if (pendingAuthCallbackUrl !== null && authBridge !== null) {
    const callbackUrl = pendingAuthCallbackUrl;
    pendingAuthCallbackUrl = null;
    void authBridge.handleCallback(callbackUrl).catch((error: unknown) => {
      console.error(`[lyra-auth] callback failed: ${String(error)}`);
    });
  }

  app.on("activate", () => mainWindowLifecycle.activate());
}).catch((error: unknown) => {
  console.error(`[lyra-main] startup failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin") {
    return;
  }
  app.quit();
});

app.on("before-quit", () => {
  workbenchAppQuitting = true;
  if (disposeAuthBridge !== null) {
    disposeAuthBridge();
    disposeAuthBridge = null;
    authBridge = null;
  }
  if (disposeFilesBridge !== null) {
    disposeFilesBridge();
    disposeFilesBridge = null;
  }
  if (disposeDownloadManagerBridge !== null) {
    disposeDownloadManagerBridge();
    disposeDownloadManagerBridge = null;
  }
  if (disposeImageViewerBridge !== null) {
    disposeImageViewerBridge();
    disposeImageViewerBridge = null;
  }
  if (disposeOfficeBridge !== null) {
    disposeOfficeBridge();
    disposeOfficeBridge = null;
  }
  if (disposeSqliteBridge !== null) {
    disposeSqliteBridge();
    disposeSqliteBridge = null;
  }
  if (disposeIdentityBridge !== null) {
    disposeIdentityBridge();
    disposeIdentityBridge = null;
  }
  if (disposeSensitiveValuesBridge !== null) {
    disposeSensitiveValuesBridge();
    disposeSensitiveValuesBridge = null;
  }
  if (disposeLoginManagerBridge !== null) {
    disposeLoginManagerBridge();
    disposeLoginManagerBridge = null;
  }
  if (disposeLocationBridge !== null) {
    disposeLocationBridge();
    disposeLocationBridge = null;
  }
  if (disposeTerminalBridge !== null) {
    disposeTerminalBridge();
    disposeTerminalBridge = null;
  }
  if (disposeAgentBridge !== null) {
    disposeAgentBridge();
    disposeAgentBridge = null;
  }
  if (disposeLspBridge !== null) {
    disposeLspBridge();
    disposeLspBridge = null;
  }
  if (disposeWorkbenchBrowserBridge !== null) {
    disposeWorkbenchBrowserBridge();
    disposeWorkbenchBrowserBridge = null;
  }
  if (disposeWorkspaceSurfacePerformanceSync !== null) {
    disposeWorkspaceSurfacePerformanceSync();
    disposeWorkspaceSurfacePerformanceSync = null;
  }
  if (disposeWorkbenchObservationRendererClient !== null) {
    disposeWorkbenchObservationRendererClient();
    disposeWorkbenchObservationRendererClient = null;
  }
  if (disposeWorkbenchObservationService !== null) {
    disposeWorkbenchObservationService();
    disposeWorkbenchObservationService = null;
  }
  if (disposeWorkbenchDocumentsService !== null) {
    disposeWorkbenchDocumentsService();
    disposeWorkbenchDocumentsService = null;
  }
  if (disposePowerSaveBlocker !== null) {
    disposePowerSaveBlocker();
    disposePowerSaveBlocker = null;
  }
  if (disposeLyraDockIconThemeSync !== null) {
    disposeLyraDockIconThemeSync();
    disposeLyraDockIconThemeSync = null;
  }
  if (disposeAutoUpdateService !== null) {
    disposeAutoUpdateService();
    disposeAutoUpdateService = null;
  }
  if (disposeScreenshotPreviewBridge !== null) {
    disposeScreenshotPreviewBridge();
    disposeScreenshotPreviewBridge = null;
  }
  if (disposeSystemNotificationsBridge !== null) {
    disposeSystemNotificationsBridge();
    disposeSystemNotificationsBridge = null;
  }
  if (disposeProductAnnouncementsBridge !== null) {
    disposeProductAnnouncementsBridge();
    disposeProductAnnouncementsBridge = null;
  }
  workbenchBrowserBridge = null;
  if (disposeUiuxPacksBridge !== null) {
    disposeUiuxPacksBridge();
    disposeUiuxPacksBridge = null;
  }
  if (disposeLanguagePacksBridge !== null) {
    disposeLanguagePacksBridge();
    disposeLanguagePacksBridge = null;
    languagePacksBridge = null;
  }
  if (disposeComponentsBridge !== null) {
    disposeComponentsBridge();
    disposeComponentsBridge = null;
  }
  // Workbench state bridge is flushed + disposed in will-quit to ensure
  // pending disk writes complete before the process exits.
  if (disposeSearchBridge !== null) {
    disposeSearchBridge();
    disposeSearchBridge = null;
  }
  if (disposeRuntimeClient !== null) {
    disposeRuntimeClient();
    disposeRuntimeClient = null;
  }
});

const stateShutdown = createBoundedShutdown({
  flush: async () => { await flushWorkbenchStateBridge?.(); },
  dispose: () => { disposeWorkbenchStateBridge?.(); disposeWorkbenchStateBridge = null; },
  exit: () => app.exit(0),
  reportFailure: (error) => console.error(`[lyra] state shutdown failed: ${String(error)}`)
});
app.on("will-quit", (event) => {
  if (flushWorkbenchStateBridge === null) return;
  event.preventDefault();
  void stateShutdown.run();
});
