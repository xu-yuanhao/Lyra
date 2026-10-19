import { contextBridge, ipcRenderer, webUtils } from "electron";

import {
  LYRA_CHANNELS,
  isBrowserShellEvent,
  isLyraBrowserEvent,
  type AgentBrowserFollowModeSnapshot,
  type AgentBrowserFollowModeUpdateRequest,
  type AgentBrowserPreviewSnapshot,
  type AgentBrowserPreviewPromoteRequest,
  type AgentActCacheSnapshot,
  type AgentActCacheUpdateRequest,
  type AgentClarificationRespondRequest,
  type AgentGitDiffRequest,
  type AgentGitDiffResponse,
  type AgentGitFileRequest,
  type AgentGitMutationResponse,
  type AgentGitStatusRequest,
  type AgentGitStatusSnapshot,
  type AgentImageAttachmentMaterializeRequest,
  type AgentImageAttachmentMaterializeResponse,
  type AgentMemoryAuditResponse,
  type AgentMemorySharedSearchRequest,
  type AgentMemorySharedUpdateRequest,
  type AgentMemorySnapshot,
  type AgentPermissionPolicySetModeRequest,
  type AgentPermissionPolicySnapshot,
  type AgentPermissionRespondRequest,
  type AgentPrivateTerminalCloseRequest,
  type AgentPrivateTerminalListRequest,
  type AgentPrivateTerminalSnapshot,
  type AgentPlanReviseRequest,
  type AgentProjectPlanDeleteRequest,
  type AgentProjectPlanDeleteResponse,
  type AgentProjectPlanListRequest,
  type AgentProjectPlanListResponse,
  type AgentProjectPlanReadRequest,
  type AgentProjectPlanReadResponse,
  type AgentProjectTodoReadRequest,
  type AgentProjectTodoReadResponse,
  type AgentPlanReviewRespondRequest,
  type AgentMessageResolveRequest,
  type AgentMessageResolveResponse,
  type AgentRollbackPreviewResponse,
  type AgentRollbackRequest,
  type AgentRollbackRestoreResponse,
  type AgentRuntimeEvent,
  type AgentSessionArchiveRequest,
  type AgentSessionBindProjectRequest,
  type AgentSessionCreateRequest,
  type AgentTemporarySessionCreateRequest,
  type AgentSessionDeleteRequest,
  type AgentSessionDeleteResponse,
  type AgentSessionReadRequest,
  type AgentSessionRenameRequest,
  type AgentSessionSaveRequest,
  type AgentSessionSnapshot,
  type AgentTurnCancelRequest,
  type AgentTurnCancelResponse,
  type AgentTurnSendRequest,
  type AgentTurnSendResponse,
  type AppMetaPayload,
  type AppUpdateStatus,
  type ProductAnnouncement,
  type AuthProfile,
  type AuthProfileUpdate,
  type AuthLocalIdentity,
  type AuthSnapshot,
  type AgentAccountLoginCompleteRequest,
  type AgentAccountLoginCompleteResponse,
  type AgentAccountLoginRequest,
  type AgentAccountLoginStartRequest,
  type AgentAccountLoginStartResponse,
  type AgentAccountRequest,
  type AgentAccountsSnapshot,
  type AgentConfigSnapshot,
  type AgentProviderCatalogSnapshot,
  type AgentConfigUpdateRequest,
  type AgentLoginProviderCatalogSnapshot,
  type AgentModelDeleteRequest,
  type AgentModelEnableRequest,
  type AgentModelCapabilitiesUpdateRequest,
  type AgentModelRefreshRequest,
  type AgentModelCatalogRequest,
  type AgentModelCatalogSnapshot,
  type AgentModelSwitchRequest,
  type AgentImportDetectRequest,
  type AgentImportDetection,
  type AgentImportPreferences,
  type AgentImportPreferencesUpdateRequest,
  type AgentImportSourcesResponse,
  type AgentImportSyncRequest,
  type AgentImportSyncResponse,
  type AgentMcpListResponse,
  type AgentMcpServerMutationResponse,
  type AgentMcpServerRemoveResponse,
  type AgentMcpServerRequest,
  type AgentMcpServerUpsertRequest,
  type AgentMcpToolDiscoverRequest,
  type AgentMcpToolDiscoverResponse,
  type AgentProviderOptionsUpdateRequest,
  type AgentProviderProfileSaveRequest,
  type AgentProviderIconResolveRequest,
  type AgentProviderIconResolveResponse,
  type AgentPokeRequest,
  type AgentPokeResponse,
  type AgentSessionSummary,
  type AgentSessionListRequest,
  type AgentSessionListResponse,
  type AgentProtocolContract,
  type AgentSkillActivationRequest,
  type AgentSkillInspectRequest,
  type AgentSkillInspectResponse,
  type AgentSkillInstallFromGitRequest,
  type AgentSkillInstallFromLocalRequest,
  type AgentSkillInstallFromStoreRequest,
  type AgentSkillMutationResponse,
  type AgentSkillRefreshStoreRequest,
  type AgentSkillsListResponse,
  type AgentSkillStoreResponse,
  type AgentSkillUninstallRequest,
  type AgentSkillUninstallResponse,
  type DownloadManagerBatchRequest,
  type DownloadManagerEnqueueRequest,
  type DownloadManagerEvent,
  type DownloadManagerSetPriorityRequest,
  type DownloadManagerSettings,
  type DownloadManagerSnapshot,
  type DownloadManagerTask,
  type DownloadManagerTaskRequest,
  type DownloadManagerUpdateSettingsRequest,
  type LinuxCompatReadConfigResponse,
  type LinuxCompatReadStatusResponse,
  type LinuxCompatRestartRequest,
  type LinuxCompatRestartResponse,
  type LinuxCompatUpdateConfigRequest,
  type LinuxCompatUpdateConfigResponse,
  type LspCompletionRequest,
  type LspCompletionResult,
  type LspDocumentRequest,
  type LspHoverResult,
  type LspLocation,
  type LspPositionRequest,
  type LspRuntimeEvent,
  type TerminalCloseRequest,
  type TerminalCreateRequest,
  type TerminalCwdChangedEvent,
  type TerminalDataAckRequest,
  type TerminalDataEvent,
  type TerminalErrorEvent,
  type TerminalEvent,
  type TerminalExitEvent,
  type TerminalPermissionEvaluateRequest,
  type TerminalPermissionEvaluateResponse,
  type TerminalPermissionRespondRequest,
  type TerminalPermissionRespondResponse,
  type TerminalProcessesReadRequest,
  type TerminalProcessesReadResponse,
  type TerminalProcessSignalRequest,
  type TerminalProcessSignalResponse,
  type TerminalReadRequest,
  type TerminalReadResponse,
  type TerminalReloadPromptRequest,
  type TerminalReloadPromptResult,
  type TerminalRendererAttachRequest,
  type TerminalRendererAttachResponse,
  type TerminalRendererDetachRequest,
  type TerminalResizeRequest,
  type TerminalSessionSnapshot,
  type TerminalWriteRequest,
  type SearchResolveWebEngineRequest,
  type SearchResolveWebEngineResponse,
  type SystemNotificationAccessRequestResult,
  type SystemNotificationActivation,
  type SystemNotificationOpenSettingsResult,
  type SystemNotificationPermission,
  type SystemNotificationShowRequest,
  type SystemNotificationShowResult,
  type SystemNotificationStatus,
  type ImageViewerCloseSessionRequest,
  type ImageViewerEvent,
  type ImageViewerOpenRequest,
  type OfficeApplyRequest,
  type OfficeApplyResult,
  type OfficePreviewRequest,
  type OfficePreviewResult,
  type OfficeReadRequest,
  type OfficeReadResult,
  type SqliteInspectRequest,
  type SqliteInspectResult,
  type ImageViewerOpenResult,
  type ImageViewerReadTileRequest,
  type ImageViewerTileResponse,
  type IdentityIconSnapshot,
  type LoginManagerClearSiteRequest,
  type LoginManagerClearSiteResponse,
  type LoginManagerDeleteCredentialRequest,
  type LoginManagerEvent,
  type LoginManagerFillCredentialRequest,
  type LoginManagerFillCredentialResponse,
  type LoginManagerRevealCredentialRequest,
  type LoginManagerRevealCredentialResponse,
  type LoginManagerSnapshot,
  type LoginManagerUpdateSessionRequest,
  type LyraSensitiveValueDeleteRequest,
  type LyraSensitiveStorageStatus,
  type LyraSensitiveValueRevealRequest,
  type LyraSensitiveValueRevealResponse,
  type LyraSensitiveValueStoreRequest,
  type LyraSensitiveValueStoreResponse,
  type UiuxInstallFromGitRequest,
  type UiuxInstallFromLocalRequest,
  type UiuxInstallFromNpmRequest,
  type UiuxListPacksResponse,
  type UiuxPackRuntime,
  type UiuxRequestActivationRequest,
  type UiuxRequestActivationResponse,
  type UiuxResolveRuntimeRequest,
  type UiuxSetTrustStateRequest,
  type UiuxUninstallRequest,
  type UiuxUninstallResponse,
  type SoftwareCapabilitiesQueryRequest,
  type SoftwareCapabilitiesQueryResult,
  type InstalledUiuxPack,
  type BrowserImportProfilesResponse,
  type BrowserImportResult,
  type BrowserImportRunRequest,
  type BrowserShellEvent,
  type LyraBrowserEvent,
  type WorkbenchBrowserEvent,
  type WorkbenchBrowserExecutePageContextActionRequest,
  type BrowserSessionSnapshot,
  type BrowserStorageStateRef,
  type WorkbenchBrowserChromePopoverRequest,
  type WorkbenchBrowserClearSiteDataRequest,
  type WorkbenchBrowserClearSiteDataResult,
  type WorkbenchBrowserSetElementPickerModeRequest,
  type WorkbenchBrowserLayoutSnapshot,
  type WorkbenchBrowserNavigateRequest,
  type WorkbenchBrowserNavigateResult,
  type WorkbenchObservationQueryRequest,
  type WorkbenchObservationQueryResult,
  type WorkbenchVisualCaptureRequest,
  type WorkbenchVisualCaptureResult,
  type WorkbenchBrowserPageRuntimeState,
  type WorkbenchBrowserReadPageStateRequest,
  type WorkbenchBrowserSearchInPageRequest,
  type WorkbenchBrowserSearchInPageResult,
  type WorkbenchBrowserStorageStateRequest,
  type WorkbenchBrowserTopologySnapshot,
  type WorkbenchStateChangeEvent,
  type WorkbenchStateKey,
  type WorkbenchStateSnapshot,
  type ProjectIdentityResolveRequest,
  type ProjectIdentitySnapshot,
  type LyraDesktopApi,
  type DetectedEditor,
  type OpenInEditorRequest
} from "../shared/desktop-bridge";
import type {
  AgentUserGateIdRequest,
  AgentUserGateListRequest,
  AgentUserGateListResponse,
  AgentUserGateResolveRequest
} from "../shared/agent";
import type {
  InstalledLanguagePack,
  LanguagePackCatalogResponse,
  LanguagePackChangeEvent
} from "../shared/language-packs";
import type {
  FileManagerCreateFileRequest,
  FileManagerCreateFolderRequest,
  FileManagerDirectoryMutationResponse,
  FileManagerDirectoryPatch,
  FileManagerEjectDeviceRequest,
  FileManagerEjectDeviceResult,
  FileManagerFavoritesPayload,
  FileReadResult,
  FileReadTextRequest,
  FileSearchTextRequest,
  FileSearchTextResult,
  FileStatRequest,
  FileStatResult,
  FileManagerMountDeviceRequest,
  FileManagerMountDeviceResult,
  FileManagerMoveToTrashRequest,
  FileManagerReadDirectoryRequest,
  FileManagerReadDirectoryResponse,
  FileManagerReadHomeResponse,
  FileManagerReadTrashResponse,
  FileManagerRecentLocationsPayload,
  FileManagerRestoreFromTrashRequest,
  FileManagerSelectedAttachment,
  FileManagerSubscribeDirectoryRequest,
  FileManagerSubscribeDirectoryResponse,
  FileWriteResult,
  FileWriteTextRequest
} from "../shared/file-manager";
import { createAgentUsageBridgeApi, createComponentsBridgeApi, createLocationBridgeApi,
  createPersonaConsentBridgeApi, createProductUninstallBridgeApi, createShellBridgeApi } from "./bridges";

const fallbackMeta: AppMetaPayload = {
  version: "0.1.0-preview.1",
  platform: process.platform,
  arch: process.arch,
  windowMaterialMode: "opaque",
  isPackaged: false,
  ...(process.env.LYRA_INSTALLER_MODE === "1" ? { forceInstaller: true as const } : {}),
  ...(process.env.LYRA_UNINSTALLER_MODE === "1" ? { forceUninstaller: true as const } : {}),
  userName: process.env.USER ?? process.env.USERNAME,
  locale: Intl.DateTimeFormat().resolvedOptions().locale,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
};

const WORKBENCH_STATE_KEYS: readonly WorkbenchStateKey[] = [
  "preferences",
  "workspace-tabs",
  "browser-session",
  "browser-history",
  "ai-panel-tabs",
  "terminal-dock",
  "notifications",
  "layout",
  "location"
];

const createEmptyWorkbenchStateSnapshot = (): Record<WorkbenchStateKey, string | null> => ({
  preferences: null,
  "workspace-tabs": null,
  "browser-session": null,
  "browser-history": null,
  "ai-panel-tabs": null,
  "terminal-dock": null,
  notifications: null,
  layout: null,
  location: null
});

const normalizeWorkbenchStateSnapshot = (value: unknown): Record<WorkbenchStateKey, string | null> => {
  const snapshot = createEmptyWorkbenchStateSnapshot();
  if (value === null || typeof value !== "object") {
    return snapshot;
  }
  const record = value as Partial<Record<WorkbenchStateKey, unknown>>;
  for (const key of WORKBENCH_STATE_KEYS) {
    const entry = record[key];
    snapshot[key] = typeof entry === "string" ? entry : null;
  }
  return snapshot;
};

const readWorkbenchStateBootstrapSnapshot = (): Record<WorkbenchStateKey, string | null> => {
  try {
    return normalizeWorkbenchStateSnapshot(
      ipcRenderer.sendSync(LYRA_CHANNELS.workbenchStateBootstrapSnapshot) as WorkbenchStateSnapshot
    );
  } catch (_error) {
    return createEmptyWorkbenchStateSnapshot();
  }
};

const workbenchStateCache = readWorkbenchStateBootstrapSnapshot();

const readBrowserNotificationPermission = (): SystemNotificationPermission => {
  if (typeof window === "undefined" || typeof window.Notification === "undefined") {
    return "unsupported";
  }
  const permission = window.Notification.permission;
  return permission === "granted" || permission === "denied" || permission === "default"
    ? permission
    : "unknown";
};

const withBrowserNotificationPermission = (
  status: SystemNotificationStatus,
  permission: SystemNotificationPermission = readBrowserNotificationPermission()
): SystemNotificationStatus => ({
  ...status,
  permission: status.supported ? permission : "unsupported",
  canNotify: status.supported && permission === "granted"
});

const requestBrowserNotificationPermission = async (): Promise<SystemNotificationPermission> => {
  if (typeof window === "undefined" || typeof window.Notification === "undefined") {
    return "unsupported";
  }
  if (window.Notification.permission === "granted" || window.Notification.permission === "denied") {
    return window.Notification.permission;
  }
  try {
    return await window.Notification.requestPermission();
  } catch (_error) {
    return readBrowserNotificationPermission();
  }
};

const terminalDataListeners = new Set<(event: TerminalDataEvent) => void>();
const terminalExitListeners = new Set<(event: TerminalExitEvent) => void>();
const terminalErrorListeners = new Set<(event: TerminalErrorEvent) => void>();
const terminalCwdChangedListeners = new Set<(event: TerminalCwdChangedEvent) => void>();
let terminalEventBridgeReady = false;
let terminalDataPortRequested = false;
let terminalDataPort: MessagePort | null = null;
const workbenchBrowserEventListeners = new Set<(event: WorkbenchBrowserEvent) => void>();
let workbenchBrowserEventBridgeReady = false;
const loginManagerEventListeners = new Set<(event: LoginManagerEvent) => void>();
let loginManagerEventBridgeReady = false;
const systemNotificationActivationListeners = new Set<(
  event: SystemNotificationActivation
) => void>();
let systemNotificationActivationBridgeReady = false;
const imageViewerEventListeners = new Set<(event: ImageViewerEvent) => void>();
let imageViewerEventBridgeReady = false;
const directoryPatchListeners = new Set<(patch: FileManagerDirectoryPatch) => void>();
let directoryPatchBridgeReady = false;
const downloadEventListeners = new Set<(event: DownloadManagerEvent) => void>();
let downloadEventBridgeReady = false;
const lspEventListeners = new Set<(event: LspRuntimeEvent) => void>();
let lspEventBridgeReady = false;
const agentEventListeners = new Set<(event: AgentRuntimeEvent) => void>();
let agentEventBridgeReady = false;
let workbenchObservationHandler:
  | ((
      request: WorkbenchObservationQueryRequest
    ) => Promise<WorkbenchObservationQueryResult> | WorkbenchObservationQueryResult)
  | null = null;
let workbenchObservationBridgeReady = false;
let softwareCapabilitiesHandler:
  | ((
      request: SoftwareCapabilitiesQueryRequest
    ) => Promise<SoftwareCapabilitiesQueryResult> | SoftwareCapabilitiesQueryResult)
  | null = null;
let softwareCapabilitiesBridgeReady = false;

const ensureTerminalEventBridge = (): void => {
  if (terminalEventBridgeReady) {
    return;
  }
  terminalEventBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.terminalDataPort,
    (event: Electron.IpcRendererEvent): void => {
      const port = event.ports[0];
      if (port === undefined) {
        return;
      }
      terminalDataPort?.close();
      terminalDataPort = port;
      terminalDataPort.onmessage = (messageEvent: MessageEvent<TerminalDataEvent>) => {
        const payload = messageEvent.data;
        if (payload === null || typeof payload !== "object" || payload.kind !== "data") {
          return;
        }
        for (const listener of terminalDataListeners) {
          listener(payload);
        }
      };
      terminalDataPort.start();
    }
  );

  ipcRenderer.on(
    LYRA_CHANNELS.terminalEvent,
    (_event: Electron.IpcRendererEvent, payload: TerminalEvent): void => {
      if (payload === null || typeof payload !== "object" || !("kind" in payload)) {
        return;
      }

      if (payload.kind === "data") {
        for (const listener of terminalDataListeners) {
          listener(payload);
        }
        return;
      }

      if (payload.kind === "exit") {
        for (const listener of terminalExitListeners) {
          listener(payload);
        }
        return;
      }

      if (payload.kind === "error") {
        for (const listener of terminalErrorListeners) {
          listener(payload);
        }
        return;
      }

      if (payload.kind === "cwdChanged") {
        for (const listener of terminalCwdChangedListeners) {
          listener(payload);
        }
      }
    }
  );
};

const ensureTerminalDataPort = (): void => {
  ensureTerminalEventBridge();
  if (terminalDataPortRequested) {
    return;
  }
  terminalDataPortRequested = true;
  void ipcRenderer.invoke(LYRA_CHANNELS.terminalConnectDataPort).catch((_error) => {
    terminalDataPortRequested = false;
  });
};

const writeTerminalFast = (request: TerminalWriteRequest): boolean => {
  ensureTerminalDataPort();
  if (terminalDataPort === null) {
    return false;
  }
  try {
    terminalDataPort.postMessage({
      kind: "input",
      request
    });
    return true;
  } catch (_error) {
    return false;
  }
};

const ensureAgentEventBridge = (): void => {
  if (agentEventBridgeReady) {
    return;
  }
  agentEventBridgeReady = true;
  ipcRenderer.on(
    LYRA_CHANNELS.agentEvent,
    (_event: Electron.IpcRendererEvent, payload: AgentRuntimeEvent): void => {
      if (payload === null || typeof payload !== "object" || !("kind" in payload)) {
        return;
      }
      for (const listener of agentEventListeners) {
        listener(payload);
      }
    }
  );
};

const ensureWorkbenchBrowserEventBridge = (): void => {
  if (workbenchBrowserEventBridgeReady) {
    return;
  }
  workbenchBrowserEventBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.workbenchBrowserEvent,
    (_event: Electron.IpcRendererEvent, payload: WorkbenchBrowserEvent): void => {
      if (payload === null || typeof payload !== "object" || typeof payload.kind !== "string") {
        return;
      }
      for (const listener of workbenchBrowserEventListeners) {
        listener(payload);
      }
    }
  );
};

const subscribeWorkbenchBrowserEvent = (
  listener: (event: WorkbenchBrowserEvent) => void
): (() => void) => {
  ensureWorkbenchBrowserEventBridge();
  workbenchBrowserEventListeners.add(listener);
  return () => {
    workbenchBrowserEventListeners.delete(listener);
  };
};

const ensureLoginManagerEventBridge = (): void => {
  if (loginManagerEventBridgeReady) {
    return;
  }
  loginManagerEventBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.loginManagerEvent,
    (_event: Electron.IpcRendererEvent, payload: LoginManagerEvent): void => {
      if (payload === null || typeof payload !== "object" || payload.kind !== "snapshot") {
        return;
      }
      for (const listener of loginManagerEventListeners) {
        listener(payload);
      }
    }
  );
};

const ensureSystemNotificationActivationBridge = (): void => {
  if (systemNotificationActivationBridgeReady) {
    return;
  }
  systemNotificationActivationBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.systemNotificationsActivated,
    (_event: Electron.IpcRendererEvent, payload: SystemNotificationActivation): void => {
      if (
        payload === null
        || typeof payload !== "object"
        || typeof payload.notificationId !== "string"
        || typeof payload.actionId !== "string"
        || typeof payload.activatedAt !== "number"
      ) {
        return;
      }
      for (const listener of systemNotificationActivationListeners) {
        listener(payload);
      }
    }
  );
};

const ensureImageViewerEventBridge = (): void => {
  if (imageViewerEventBridgeReady) {
    return;
  }
  imageViewerEventBridgeReady = true;
  ipcRenderer.on(
    LYRA_CHANNELS.imageViewerEvent,
    (_event: Electron.IpcRendererEvent, payload: ImageViewerEvent): void => {
      for (const listener of imageViewerEventListeners) {
        listener(payload);
      }
    }
  );
};

const ensureDirectoryPatchBridge = (): void => {
  if (directoryPatchBridgeReady) {
    return;
  }
  directoryPatchBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.filesDirectoryPatch,
    (_event: Electron.IpcRendererEvent, payload: FileManagerDirectoryPatch): void => {
      if (
        payload === null
        || typeof payload !== "object"
        || typeof payload.subscriptionId !== "string"
        || typeof payload.kind !== "string"
      ) {
        return;
      }
      for (const listener of directoryPatchListeners) {
        listener(payload);
      }
    }
  );
};

const ensureDownloadEventBridge = (): void => {
  if (downloadEventBridgeReady) {
    return;
  }
  downloadEventBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.downloadsEvent,
    (_event: Electron.IpcRendererEvent, payload: DownloadManagerEvent): void => {
      if (payload === null || typeof payload !== "object" || typeof payload.kind !== "string") {
        return;
      }
      for (const listener of downloadEventListeners) {
        listener(payload);
      }
    }
  );
};

const ensureLspEventBridge = (): void => {
  if (lspEventBridgeReady) {
    return;
  }
  lspEventBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.lspEvent,
    (_event: Electron.IpcRendererEvent, payload: LspRuntimeEvent): void => {
      if (payload === null || typeof payload !== "object" || !("kind" in payload)) {
        return;
      }
      for (const listener of lspEventListeners) {
        listener(payload);
      }
    }
  );
};

const ensureWorkbenchObservationBridge = (): void => {
  if (workbenchObservationBridgeReady) {
    return;
  }
  workbenchObservationBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.workbenchObservationQuery,
    (_event: Electron.IpcRendererEvent, payload: WorkbenchObservationQueryRequest): void => {
      const handler = workbenchObservationHandler;
      if (handler === null) {
        void ipcRenderer.invoke(LYRA_CHANNELS.workbenchObservationQueryResult, {
          requestId: payload.requestId,
          ok: false,
          error: {
            code: "renderer_bridge_unavailable",
            message: "Renderer workbench observation handler is not registered."
          }
        } satisfies WorkbenchObservationQueryResult);
        return;
      }

      void Promise.resolve(handler(payload))
        .catch((error: unknown): WorkbenchObservationQueryResult => ({
          requestId: payload.requestId,
          ok: false,
          error: {
            code: "renderer_bridge_unavailable",
            message: error instanceof Error ? error.message : String(error)
          }
        }))
        .then((result) =>
          ipcRenderer.invoke(LYRA_CHANNELS.workbenchObservationQueryResult, result)
        );
    }
  );
};

const ensureSoftwareCapabilitiesBridge = (): void => {
  if (softwareCapabilitiesBridgeReady) {
    return;
  }
  softwareCapabilitiesBridgeReady = true;

  ipcRenderer.on(
    LYRA_CHANNELS.softwareCapabilitiesQuery,
    (_event: Electron.IpcRendererEvent, payload: SoftwareCapabilitiesQueryRequest): void => {
      const handler = softwareCapabilitiesHandler;
      if (handler === null) {
        void ipcRenderer.invoke(LYRA_CHANNELS.softwareCapabilitiesQueryResult, {
          requestId: payload.requestId,
          ok: false,
          error: {
            code: "renderer_bridge_unavailable",
            message: "Renderer software capability handler is not registered."
          }
        } satisfies SoftwareCapabilitiesQueryResult);
        return;
      }

      void Promise.resolve(handler(payload))
        .catch((error: unknown): SoftwareCapabilitiesQueryResult => ({
          requestId: payload.requestId,
          ok: false,
          error: {
            code: "renderer_bridge_unavailable",
            message: error instanceof Error ? error.message : String(error)
          }
        }))
        .then((result) =>
          ipcRenderer.invoke(LYRA_CHANNELS.softwareCapabilitiesQueryResult, result)
        );
    }
  );
};

const readAppMeta = (): AppMetaPayload => {
  try {
    return ipcRenderer.sendSync(LYRA_CHANNELS.readAppMetaSync) as AppMetaPayload;
  } catch (_error) {
    return fallbackMeta;
  }
};

const isWorkbenchStateKey = (value: unknown): value is WorkbenchStateKey =>
  WORKBENCH_STATE_KEYS.includes(value as WorkbenchStateKey);

const normalizeWorkbenchStateChangeEvent = (value: unknown): WorkbenchStateChangeEvent | null => {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const event = value as {
    readonly key?: unknown;
    readonly json?: unknown;
  };
  if (isWorkbenchStateKey(event.key) === false) {
    return null;
  }
  return {
    key: event.key,
    json: typeof event.json === "string" ? event.json : null
  };
};

ipcRenderer.on(LYRA_CHANNELS.workbenchStateChanged, (_event, payload: unknown) => {
  const event = normalizeWorkbenchStateChangeEvent(payload);
  if (event === null) {
    return;
  }
  workbenchStateCache[event.key] = event.json;
});

const readCachedWorkbenchState = (key: WorkbenchStateKey): string | null =>
  workbenchStateCache[key] ?? null;

const readWorkbenchState = async (key: WorkbenchStateKey): Promise<string | null> => {
  const value = await ipcRenderer.invoke(LYRA_CHANNELS.workbenchStateRead, { key }) as string | null;
  workbenchStateCache[key] = typeof value === "string" ? value : null;
  return workbenchStateCache[key];
};

const writeWorkbenchState = async (key: WorkbenchStateKey, json: string): Promise<void> => {
  workbenchStateCache[key] = json;
  await ipcRenderer.invoke(LYRA_CHANNELS.workbenchStateWrite, { key, json });
};

const removeWorkbenchState = async (key: WorkbenchStateKey): Promise<void> => {
  workbenchStateCache[key] = null;
  await ipcRenderer.invoke(LYRA_CHANNELS.workbenchStateRemove, { key });
};

const createLyraDesktopApi = (): LyraDesktopApi => ({
  ...createShellBridgeApi(),
  appMeta: readAppMeta(),
  openExternal: (url: string) => ipcRenderer.invoke(LYRA_CHANNELS.openExternal, url),
  detectEditors: () => ipcRenderer.invoke(LYRA_CHANNELS.detectEditors) as Promise<DetectedEditor[]>,
  openInEditor: (request: OpenInEditorRequest) => ipcRenderer.invoke(LYRA_CHANNELS.openInEditor, request) as Promise<boolean>,
  revealInFolder: (path: string) => ipcRenderer.invoke(LYRA_CHANNELS.revealInFolder, path) as Promise<boolean>,
  identity: {
    readUserIcon: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.identityReadUserIcon) as Promise<IdentityIconSnapshot | null>,
    resolveProjectIdentity: (request: ProjectIdentityResolveRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.identityResolveProject, request) as Promise<ProjectIdentitySnapshot | null>
  },
  systemNotifications: {
    readStatus: () =>
      (ipcRenderer.invoke(
        LYRA_CHANNELS.systemNotificationsReadStatus
      ) as Promise<SystemNotificationStatus>).then((status) =>
        withBrowserNotificationPermission(status)
      ),
    requestAccess: async () => {
      const hostStatus = await ipcRenderer.invoke(
        LYRA_CHANNELS.systemNotificationsReadStatus
      ) as SystemNotificationStatus;
      if (hostStatus.supported === false) {
        return {
          ...withBrowserNotificationPermission(hostStatus, "unsupported"),
          openedSettings: false
        } satisfies SystemNotificationAccessRequestResult;
      }
      const permission = await requestBrowserNotificationPermission();
      const openedSettings =
        permission === "granted"
          ? false
          : (await ipcRenderer.invoke(
              LYRA_CHANNELS.systemNotificationsOpenSettings
            ) as SystemNotificationOpenSettingsResult).opened;
      return {
        ...withBrowserNotificationPermission(hostStatus, permission),
        openedSettings
      } satisfies SystemNotificationAccessRequestResult;
    },
    openSettings: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.systemNotificationsOpenSettings
      ) as Promise<SystemNotificationOpenSettingsResult>,
    show: (request: SystemNotificationShowRequest) => {
      if (readBrowserNotificationPermission() !== "granted") {
        return Promise.resolve({
          status: "skipped",
          reason: "permission"
        } satisfies SystemNotificationShowResult);
      }
      return ipcRenderer.invoke(
        LYRA_CHANNELS.systemNotificationsShow,
        request
      ) as Promise<SystemNotificationShowResult>;
    },
    onActivated: (listener: (event: SystemNotificationActivation) => void) => {
      ensureSystemNotificationActivationBridge();
      systemNotificationActivationListeners.add(listener);
      return () => {
        systemNotificationActivationListeners.delete(listener);
      };
    }
  },
  productAnnouncements: {
    read: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.productAnnouncementsRead) as Promise<readonly ProductAnnouncement[]>,
    onChanged: (listener: (items: readonly ProductAnnouncement[]) => void) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: readonly ProductAnnouncement[]
      ) => listener(payload);
      ipcRenderer.on(LYRA_CHANNELS.productAnnouncementsChanged, wrappedListener);
      return () => {
        ipcRenderer.removeListener(LYRA_CHANNELS.productAnnouncementsChanged, wrappedListener);
      };
    }
  },
  appUpdate: {
    readStatus: () => ipcRenderer.invoke(LYRA_CHANNELS.appUpdateReadStatus) as Promise<AppUpdateStatus>,
    check: () => ipcRenderer.invoke(LYRA_CHANNELS.appUpdateCheck) as Promise<AppUpdateStatus>,
    download: () => ipcRenderer.invoke(LYRA_CHANNELS.appUpdateDownload) as Promise<AppUpdateStatus>,
    install: () => ipcRenderer.invoke(LYRA_CHANNELS.appUpdateInstall) as Promise<void>,
    onStatusChanged: (listener: (status: AppUpdateStatus) => void) => {
      const wrappedListener = (_event: Electron.IpcRendererEvent, payload: AppUpdateStatus) => listener(payload);
      ipcRenderer.on(LYRA_CHANNELS.appUpdateStatusChanged, wrappedListener);
      return () => { ipcRenderer.removeListener(LYRA_CHANNELS.appUpdateStatusChanged, wrappedListener); };
    }
  },
  linuxCompat: {
    readStatus: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.linuxCompatReadStatus) as Promise<LinuxCompatReadStatusResponse>,
    readConfig: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.linuxCompatReadConfig) as Promise<LinuxCompatReadConfigResponse>,
    updateConfig: (request: LinuxCompatUpdateConfigRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.linuxCompatUpdateConfig,
        request
      ) as Promise<LinuxCompatUpdateConfigResponse>,
    requestRestart: (request?: LinuxCompatRestartRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.linuxCompatRestart,
        request
      ) as Promise<LinuxCompatRestartResponse>
  },
  search: {
    resolveWebSearchEngine: (request: SearchResolveWebEngineRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.resolveWebSearchEngine,
        request
      ) as Promise<SearchResolveWebEngineResponse>
  },
  files: {
    readHome: () => ipcRenderer.invoke(LYRA_CHANNELS.filesReadHome) as Promise<FileManagerReadHomeResponse>,
    readDirectory: (request: FileManagerReadDirectoryRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesReadDirectory, request) as Promise<FileManagerReadDirectoryResponse>,
    subscribeDirectory: (request: FileManagerSubscribeDirectoryRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.filesSubscribeDirectory,
        request
      ) as Promise<FileManagerSubscribeDirectoryResponse>,
    unsubscribeDirectory: async (subscriptionId: string) => {
      await ipcRenderer.invoke(LYRA_CHANNELS.filesUnsubscribeDirectory, { subscriptionId });
    },
    onDirectoryPatch: (listener: (patch: FileManagerDirectoryPatch) => void) => {
      ensureDirectoryPatchBridge();
      directoryPatchListeners.add(listener);
      return () => {
        directoryPatchListeners.delete(listener);
      };
    },
    readTrash: () => ipcRenderer.invoke(LYRA_CHANNELS.filesReadTrash) as Promise<FileManagerReadTrashResponse>,
    createFile: (request: FileManagerCreateFileRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesCreateFile, request) as Promise<FileManagerDirectoryMutationResponse>,
    createFolder: (request: FileManagerCreateFolderRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesCreateFolder, request) as Promise<FileManagerDirectoryMutationResponse>,
    moveToTrash: (request: FileManagerMoveToTrashRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesMoveToTrash, request) as Promise<void>,
    restoreFromTrash: (request: FileManagerRestoreFromTrashRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesRestoreFromTrash, request) as Promise<void>,
    emptyTrash: () => ipcRenderer.invoke(LYRA_CHANNELS.filesEmptyTrash) as Promise<void>,
    mountDevice: (request: FileManagerMountDeviceRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesMountDevice, request) as Promise<FileManagerMountDeviceResult>,
    ejectDevice: (request: FileManagerEjectDeviceRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesEjectDevice, request) as Promise<FileManagerEjectDeviceResult>,
    readFavorites: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesReadFavorites) as Promise<FileManagerFavoritesPayload>,
    writeFavorites: (payload: FileManagerFavoritesPayload) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesWriteFavorites, payload) as Promise<FileManagerFavoritesPayload>,
    readRecentLocations: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesReadRecentLocations) as Promise<FileManagerRecentLocationsPayload>,
    writeRecentLocations: (payload: FileManagerRecentLocationsPayload) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesWriteRecentLocations, payload) as Promise<FileManagerRecentLocationsPayload>,
    readTextFile: (request: FileReadTextRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesReadTextFile, request) as Promise<FileReadResult>,
    writeTextFile: (request: FileWriteTextRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesWriteTextFile, request) as Promise<FileWriteResult>,
    statFile: (request: FileStatRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesStatFile, request) as Promise<FileStatResult>,
    searchText: (request: FileSearchTextRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesSearchText, request) as Promise<FileSearchTextResult>,
    selectAttachments: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesSelectAttachments) as Promise<readonly FileManagerSelectedAttachment[]>,
    selectDirectories: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.filesSelectDirectories) as Promise<readonly FileManagerSelectedAttachment[]>
  },
  downloads: {
    list: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsList) as Promise<DownloadManagerSnapshot>,
    enqueue: (request: DownloadManagerEnqueueRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsEnqueue, request) as Promise<DownloadManagerSnapshot>,
    pause: (request: DownloadManagerTaskRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsPause, request) as Promise<DownloadManagerTask | null>,
    resume: (request: DownloadManagerTaskRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsResume, request) as Promise<DownloadManagerTask | null>,
    cancel: (request: DownloadManagerTaskRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsCancel, request) as Promise<DownloadManagerTask | null>,
    retry: (request: DownloadManagerTaskRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsRetry, request) as Promise<DownloadManagerTask | null>,
    remove: async (request: DownloadManagerTaskRequest) => {
      await ipcRenderer.invoke(LYRA_CHANNELS.downloadsRemove, request);
    },
    setPriority: (request: DownloadManagerSetPriorityRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsSetPriority, request) as Promise<DownloadManagerTask | null>,
    pauseAll: (request?: DownloadManagerBatchRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsPauseAll, request) as Promise<DownloadManagerSnapshot>,
    resumeAll: (request?: DownloadManagerBatchRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsResumeAll, request) as Promise<DownloadManagerSnapshot>,
    cancelAll: (request?: DownloadManagerBatchRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsCancelAll, request) as Promise<DownloadManagerSnapshot>,
    readSettings: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsReadSettings) as Promise<DownloadManagerSettings>,
    updateSettings: (request: DownloadManagerUpdateSettingsRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsUpdateSettings, request) as Promise<DownloadManagerSettings>,
    openFile: (request: DownloadManagerTaskRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsOpenFile, request) as Promise<boolean>,
    revealFile: (request: DownloadManagerTaskRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.downloadsRevealFile, request) as Promise<boolean>,
    onEvent: (listener: (event: DownloadManagerEvent) => void) => {
      ensureDownloadEventBridge();
      downloadEventListeners.add(listener);
      return () => {
        downloadEventListeners.delete(listener);
      };
    }
  },
  imageViewer: {
    openImage: (request: ImageViewerOpenRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.imageViewerOpenImage, request) as Promise<ImageViewerOpenResult>,
    readTile: (request: ImageViewerReadTileRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.imageViewerReadTile, request) as Promise<ImageViewerTileResponse>,
    closeSession: async (request: ImageViewerCloseSessionRequest) => {
      await ipcRenderer.invoke(LYRA_CHANNELS.imageViewerCloseSession, request);
    },
    onEvent: (listener: (event: ImageViewerEvent) => void) => {
      ensureImageViewerEventBridge();
      imageViewerEventListeners.add(listener);
      return () => {
        imageViewerEventListeners.delete(listener);
      };
    }
  },
  office: {
    preview: (request: OfficePreviewRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.officePreview, request) as Promise<OfficePreviewResult>,
    read: (request: OfficeReadRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.officeRead, request) as Promise<OfficeReadResult>,
    apply: (request: OfficeApplyRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.officeApply, request) as Promise<OfficeApplyResult>
  },
  sqlite: {
    inspect: (request: SqliteInspectRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.sqliteInspect, request) as Promise<SqliteInspectResult>
  },
  browserShell: {
    syncTopology: (snapshot: WorkbenchBrowserTopologySnapshot): void => {
      ipcRenderer.send(LYRA_CHANNELS.workbenchBrowserSyncTopology, snapshot);
    },
    syncLayout: (snapshot: WorkbenchBrowserLayoutSnapshot): void => {
      ipcRenderer.send(LYRA_CHANNELS.workbenchBrowserSyncLayout, snapshot);
    },
    setChromePopover: (request: WorkbenchBrowserChromePopoverRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserSetChromePopover,
        request
      ) as Promise<void>,
    setModalOcclusion: (request: { readonly active: boolean }) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserSetModalOcclusion,
        request
      ) as Promise<void>,
    onEvent: (listener: (event: BrowserShellEvent) => void) =>
      subscribeWorkbenchBrowserEvent((event) => {
        if (isBrowserShellEvent(event)) {
          listener(event);
        }
      })
  },
  browser: {
    navigate: (request: WorkbenchBrowserNavigateRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.workbenchBrowserNavigate, request) as Promise<WorkbenchBrowserNavigateResult>,
    goBack: (request: { readonly tabId: string }) =>
      ipcRenderer.invoke(LYRA_CHANNELS.workbenchBrowserGoBack, request) as Promise<void>,
    goForward: (request: { readonly tabId: string }) =>
      ipcRenderer.invoke(LYRA_CHANNELS.workbenchBrowserGoForward, request) as Promise<void>,
    reload: (request: { readonly tabId: string; readonly ignoreCache?: boolean }) =>
      ipcRenderer.invoke(LYRA_CHANNELS.workbenchBrowserReload, request) as Promise<void>,
    stop: (request: { readonly tabId: string }) =>
      ipcRenderer.invoke(LYRA_CHANNELS.workbenchBrowserStop, request) as Promise<void>,
    readPageState: (request?: WorkbenchBrowserReadPageStateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserReadPageState,
        request ?? {}
      ) as Promise<WorkbenchBrowserPageRuntimeState | null>,
    readSessionSnapshot: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserReadSessionSnapshot
      ) as Promise<BrowserSessionSnapshot | null>,
    readStorageState: (request?: WorkbenchBrowserStorageStateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserReadStorageState,
        request ?? {}
      ) as Promise<BrowserStorageStateRef>,
    clearSiteData: (request: WorkbenchBrowserClearSiteDataRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserClearSiteData,
        request
      ) as Promise<WorkbenchBrowserClearSiteDataResult>,
    searchInPage: (request: WorkbenchBrowserSearchInPageRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserSearchInPage,
        request
      ) as Promise<WorkbenchBrowserSearchInPageResult>,
    setElementPickerMode: (request: WorkbenchBrowserSetElementPickerModeRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserSetElementPickerMode,
        request
      ) as Promise<void>,
    capturePage: (request?: WorkbenchVisualCaptureRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserCapturePage,
        request ?? {}
      ) as Promise<WorkbenchVisualCaptureResult>,
    captureWindow: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserCaptureWindow
      ) as Promise<WorkbenchVisualCaptureResult>,
    executePageContextAction: (request: WorkbenchBrowserExecutePageContextActionRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.workbenchBrowserExecutePageContextAction,
        request
      ) as Promise<void>,
    readActivePageDragCitation: () =>
      ipcRenderer.sendSync(
        LYRA_CHANNELS.workbenchBrowserReadActivePageDragCitation
      ) as import("../shared/workbench-browser").PageDragCitationPayload | null,
    consumePageDragCitation: () => {
      ipcRenderer.send(LYRA_CHANNELS.workbenchBrowserConsumePageDragCitation);
    },
    onEvent: (listener: (event: LyraBrowserEvent) => void) =>
      subscribeWorkbenchBrowserEvent((event) => {
        if (isLyraBrowserEvent(event)) {
          listener(event);
        }
      })
  },
  loginManager: {
    list: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.loginManagerList) as Promise<LoginManagerSnapshot>,
    setCredentialCaptureEnabled: (enabled: boolean) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.loginManagerSetCredentialCaptureEnabled,
        enabled
      ) as Promise<LoginManagerSnapshot>,
    updateSession: (request: LoginManagerUpdateSessionRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.loginManagerUpdateSession,
        request
      ) as Promise<LoginManagerSnapshot>,
    deleteCredential: (request: LoginManagerDeleteCredentialRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.loginManagerDeleteCredential,
        request
      ) as Promise<LoginManagerSnapshot>,
    revealCredential: (request: LoginManagerRevealCredentialRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.loginManagerRevealCredential,
        request
      ) as Promise<LoginManagerRevealCredentialResponse>,
    fillCredential: (request: LoginManagerFillCredentialRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.loginManagerFillCredential,
        request
      ) as Promise<LoginManagerFillCredentialResponse>,
    clearSite: (request: LoginManagerClearSiteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.loginManagerClearSite,
        request
      ) as Promise<LoginManagerClearSiteResponse>,
    onEvent: (listener: (event: LoginManagerEvent) => void) => {
      ensureLoginManagerEventBridge();
      loginManagerEventListeners.add(listener);
      return () => {
        loginManagerEventListeners.delete(listener);
      };
    }
  },
  browserImport: {
    listProfiles: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.browserImportListProfiles
      ) as Promise<BrowserImportProfilesResponse>,
    run: (request: BrowserImportRunRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.browserImportRun,
        request
      ) as Promise<BrowserImportResult>
  },
  sensitiveValues: {
    readStatus: () => ipcRenderer.invoke(LYRA_CHANNELS.sensitiveValuesReadStatus) as Promise<LyraSensitiveStorageStatus>,
    onStatusChanged: (listener: (status: LyraSensitiveStorageStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: LyraSensitiveStorageStatus): void => listener(status);
      ipcRenderer.on(LYRA_CHANNELS.sensitiveValuesStatusChanged, handler);
      return () => { ipcRenderer.removeListener(LYRA_CHANNELS.sensitiveValuesStatusChanged, handler); };
    },
    store: async (
      request: LyraSensitiveValueStoreRequest
    ): Promise<LyraSensitiveValueStoreResponse> =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.sensitiveValuesStore,
        request
      ) as Promise<LyraSensitiveValueStoreResponse>,
    revealToUser: async (
      request: LyraSensitiveValueRevealRequest
    ): Promise<LyraSensitiveValueRevealResponse> =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.sensitiveValuesRevealToUser,
        request
      ) as Promise<LyraSensitiveValueRevealResponse>,
    delete: async (
      request: LyraSensitiveValueDeleteRequest
    ): Promise<{ readonly deleted: boolean }> =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.sensitiveValuesDelete,
        request
      ) as Promise<{ readonly deleted: boolean }>
  },
  lsp: {
    openDocument: (request: LspDocumentRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspOpenDocument, request) as Promise<void>,
    changeDocument: (request: LspDocumentRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspChangeDocument, request) as Promise<void>,
    saveDocument: (request: LspDocumentRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspSaveDocument, request) as Promise<void>,
    closeDocument: (request: LspDocumentRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspCloseDocument, request) as Promise<void>,
    completion: (request: LspCompletionRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspCompletion, request) as Promise<LspCompletionResult>,
    hover: (request: LspPositionRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspHover, request) as Promise<LspHoverResult | null>,
    gotoDefinition: (request: LspPositionRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspGotoDefinition, request) as Promise<readonly LspLocation[]>,
    findReferences: (request: LspPositionRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspFindReferences, request) as Promise<readonly LspLocation[]>,
    inspectTypeScriptConfig: (request: { readonly filePath: string; readonly content: string }) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspInspectTypeScriptConfig, request) as Promise<void>,
    inspectProjectProblems: (request: { readonly rootPath: string }) =>
      ipcRenderer.invoke(LYRA_CHANNELS.lspInspectProjectProblems, request) as Promise<void>,
    onEvent: (listener: (event: LspRuntimeEvent) => void) => {
      ensureLspEventBridge();
      lspEventListeners.add(listener);
      return () => {
        lspEventListeners.delete(listener);
      };
    }
  },
  terminal: {
    createSession: (request: TerminalCreateRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalCreateSession, request) as Promise<TerminalSessionSnapshot>,
    attachRenderer: (request: TerminalRendererAttachRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalAttachRenderer, request) as Promise<TerminalRendererAttachResponse>,
    detachRenderer: (request: TerminalRendererDetachRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalDetachRenderer, request) as Promise<void>,
    ackData: (request: TerminalDataAckRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalAckData, request) as Promise<void>,
    reloadPrompt: (request: TerminalReloadPromptRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalReloadPrompt, request) as Promise<TerminalReloadPromptResult>,
    writeFast: (request: TerminalWriteRequest) => writeTerminalFast(request),
    write: (request: TerminalWriteRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalWriteSession, request) as Promise<void>,
    read: (request: TerminalReadRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalReadSession, request) as Promise<TerminalReadResponse>,
    evaluatePermission: (request: TerminalPermissionEvaluateRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalPermissionsEvaluate, request) as Promise<
        TerminalPermissionEvaluateResponse
      >,
    respondPermission: (request: TerminalPermissionRespondRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalPermissionsRespond, request) as Promise<
        TerminalPermissionRespondResponse
      >,
    readProcesses: (request: TerminalProcessesReadRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalProcessesRead, request) as Promise<
        TerminalProcessesReadResponse
      >,
    signalProcess: (request: TerminalProcessSignalRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalProcessesSignal, request) as Promise<
        TerminalProcessSignalResponse
      >,
    resize: (request: TerminalResizeRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalResizeSession, request) as Promise<void>,
    closeSession: (request: TerminalCloseRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.terminalCloseSession, request) as Promise<void>,
    onData: (listener: (event: TerminalDataEvent) => void) => {
      ensureTerminalDataPort();
      terminalDataListeners.add(listener);
      return () => {
        terminalDataListeners.delete(listener);
      };
    },
    onExit: (listener: (event: TerminalExitEvent) => void) => {
      ensureTerminalEventBridge();
      terminalExitListeners.add(listener);
      return () => {
        terminalExitListeners.delete(listener);
      };
    },
    onError: (listener: (event: TerminalErrorEvent) => void) => {
      ensureTerminalEventBridge();
      terminalErrorListeners.add(listener);
      return () => {
        terminalErrorListeners.delete(listener);
      };
    },
    onCwdChanged: (listener: (event: TerminalCwdChangedEvent) => void) => {
      ensureTerminalEventBridge();
      terminalCwdChangedListeners.add(listener);
      return () => {
        terminalCwdChangedListeners.delete(listener);
      };
    }
  },
  agent: {
    ...createPersonaConsentBridgeApi(),
    ...createAgentUsageBridgeApi(),
    createSession: (request?: AgentSessionCreateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionCreate,
        request ?? {}
      ) as Promise<AgentSessionSnapshot>,
    createTemporarySession: (request: AgentTemporarySessionCreateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionCreateTemporary,
        request
      ) as Promise<AgentSessionSnapshot>,
    readSession: (request?: AgentSessionReadRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionRead,
        request ?? {}
      ) as Promise<AgentSessionSnapshot>,
    listSessions: (request?: AgentSessionListRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionList,
        request ?? {}
      ) as Promise<AgentSessionListResponse>,
    saveSession: (request: AgentSessionSaveRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionSave,
        request
      ) as Promise<AgentSessionSummary>,
    unsaveSession: (request: AgentSessionDeleteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionUnsave,
        request
      ) as Promise<AgentSessionSummary>,
    renameSession: (request: AgentSessionRenameRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionRename,
        request
      ) as Promise<AgentSessionSummary>,
    archiveSession: (request: AgentSessionArchiveRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionArchive,
        request
      ) as Promise<AgentSessionSummary>,
    deleteSession: (request: AgentSessionDeleteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionDelete,
        request
      ) as Promise<AgentSessionDeleteResponse>,
    bindProject: (request: AgentSessionBindProjectRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSessionBindProject,
        request
      ) as Promise<AgentSessionSnapshot>,
    startTurn: (request: AgentTurnSendRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTurnStart,
        request
      ) as Promise<AgentTurnSendResponse>,
    sendTurn: (request: AgentTurnSendRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTurnSend,
        request
      ) as Promise<AgentTurnSendResponse>,
    resumeTurn: (request: AgentTurnSendRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTurnResume,
        request
      ) as Promise<AgentTurnSendResponse>,
    cancelTurn: (request: AgentTurnCancelRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTurnCancel,
        request
      ) as Promise<AgentTurnCancelResponse>,
    readMemorySnapshot: (request?: AgentSessionReadRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMemorySnapshot,
        request ?? {}
      ) as Promise<AgentMemorySnapshot>,
    readMemoryAudit: (request?: AgentSessionReadRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMemoryAudit,
        request ?? {}
      ) as Promise<AgentMemoryAuditResponse>,
    runMemoryRecovery: (request?: AgentSessionReadRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMemoryRecoverRun,
        request ?? {}
      ) as Promise<unknown>,
    searchSharedMemory: (request?: AgentMemorySharedSearchRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMemorySharedSearch,
        request ?? {}
      ) as Promise<{ readonly records: readonly unknown[] }>,
    updateSharedMemory: (request: AgentMemorySharedUpdateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMemorySharedUpdate,
        request
      ) as Promise<unknown>,
    previewRollback: (request: AgentRollbackRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentRollbackPreview,
        request
      ) as Promise<AgentRollbackPreviewResponse>,
    restoreRollback: (request: AgentRollbackRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentRollbackRestore,
        request
      ) as Promise<AgentRollbackRestoreResponse>,
    resolveMessage: (request: AgentMessageResolveRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMessageResolve,
        request
      ) as Promise<AgentMessageResolveResponse>,
    readGitStatus: (request: AgentGitStatusRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentGitStatus,
        request
      ) as Promise<AgentGitStatusSnapshot>,
    readGitDiff: (request: AgentGitDiffRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentGitDiff,
        request
      ) as Promise<AgentGitDiffResponse>,
    stageGitFile: (request: AgentGitFileRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentGitStage,
        request
      ) as Promise<AgentGitMutationResponse>,
    unstageGitFile: (request: AgentGitFileRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentGitUnstage,
        request
      ) as Promise<AgentGitMutationResponse>,
    discardGitFile: (request: AgentGitFileRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentGitDiscard,
        request
      ) as Promise<AgentGitMutationResponse>,
    respondClarification: (request: AgentClarificationRespondRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentClarificationRespond, request) as Promise<unknown>,
    respondPermission: (request: AgentPermissionRespondRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentPermissionRespond, request) as Promise<unknown>,
    listUserGates: (request?: AgentUserGateListRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentUserGateList,
        request ?? {}
      ) as Promise<AgentUserGateListResponse>,
    resolveUserGate: (request: AgentUserGateResolveRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentUserGateResolve, request) as Promise<unknown>,
    cancelUserGate: (request: AgentUserGateIdRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentUserGateCancel, request) as Promise<unknown>,
    touchUserGateActivity: (request: AgentUserGateIdRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentUserGateTouchActivity, request) as Promise<unknown>,
    autoResolveUserGate: (request: AgentUserGateIdRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentUserGateAutoResolve, request) as Promise<unknown>,
    listProjectPlans: (request: AgentProjectPlanListRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPlanList,
        request
      ) as Promise<AgentProjectPlanListResponse>,
    readProjectPlan: (request: AgentProjectPlanReadRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPlanRead,
        request
      ) as Promise<AgentProjectPlanReadResponse>,
    deleteProjectPlan: (request: AgentProjectPlanDeleteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPlanDelete,
        request
      ) as Promise<AgentProjectPlanDeleteResponse>,
    revisePlan: (request: AgentPlanReviseRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPlanRevise,
        request
      ) as Promise<AgentSessionSnapshot>,
    respondPlanReview: (request: AgentPlanReviewRespondRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPlanReviewRespond,
        request
      ) as Promise<AgentSessionSnapshot>,
    readProjectTodo: (request: AgentProjectTodoReadRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTodoReadProject,
        request
      ) as Promise<AgentProjectTodoReadResponse>,
    readPermissionPolicy: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPermissionPolicyRead
      ) as Promise<AgentPermissionPolicySnapshot>,
    setPermissionPolicyMode: (request: AgentPermissionPolicySetModeRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPermissionPolicySetMode,
        request
      ) as Promise<AgentPermissionPolicySnapshot>,
    validateElevationPassword: (request: { password: string }) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentElevationValidate,
        request
      ) as Promise<{ readonly valid: boolean; readonly exitCode?: number; readonly stderr?: string }>,
    setElevationSecret: (request: { secret: string }) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentElevationSetSecret,
        request
      ) as Promise<{ readonly stored: boolean }>,
    clearElevationSecret: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentElevationClear
      ) as Promise<{ readonly cleared: boolean }>,
    readAgentConfig: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentConfigRead) as Promise<AgentConfigSnapshot>,
    readAgentProviderCatalog: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentProviderCatalogRead
      ) as Promise<AgentProviderCatalogSnapshot>,
    updateAgentConfig: (request: AgentConfigUpdateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentConfigUpdate,
        request
      ) as Promise<AgentConfigSnapshot>,
    saveAgentProviderProfile: (request: AgentProviderProfileSaveRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentProviderProfileSave,
        request
      ) as Promise<AgentConfigSnapshot>,
    saveAndDiscoverAgentProviderProfile: (request: AgentProviderProfileSaveRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentProviderProfileSaveAndDiscover,
        request
      ) as Promise<AgentModelCatalogSnapshot>,
    resolveProviderIcon: (request: AgentProviderIconResolveRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentProviderIconResolve,
        request
      ) as Promise<AgentProviderIconResolveResponse>,
    listAgentModels: (request?: AgentModelCatalogRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentModelsList,
        request ?? {}
      ) as Promise<AgentModelCatalogSnapshot>,
    switchAgentModel: (request: AgentModelSwitchRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentModelSwitch,
        request
      ) as Promise<AgentModelCatalogSnapshot>,
    setAgentModelEnabled: (request: AgentModelEnableRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentModelEnable,
        request
      ) as Promise<AgentModelCatalogSnapshot>,
    updateAgentModelCapabilities: (request: AgentModelCapabilitiesUpdateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentModelCapabilitiesUpdate,
        request
      ) as Promise<AgentModelCatalogSnapshot>,
    deleteAgentModel: (request: AgentModelDeleteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentModelDelete,
        request
      ) as Promise<AgentModelCatalogSnapshot>,
    refreshAgentModels: (request?: AgentModelRefreshRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentModelRefresh,
        request ?? {}
      ) as Promise<AgentModelCatalogSnapshot>,
    updateAgentProviderOptions: (request: AgentProviderOptionsUpdateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentProviderOptionsUpdate,
        request
      ) as Promise<AgentModelCatalogSnapshot>,
    listProjects: () => ipcRenderer.invoke(LYRA_CHANNELS.agentProjectsList),
    registerProject: (request) => ipcRenderer.invoke(LYRA_CHANNELS.agentProjectsRegister, request),
    getProjectSettings: (request) => ipcRenderer.invoke(LYRA_CHANNELS.agentProjectsSettings, request),
    setProjectOverride: (request) => ipcRenderer.invoke(LYRA_CHANNELS.agentProjectsSetOverride, request),
    setMcpEnabled: (request) => ipcRenderer.invoke(LYRA_CHANNELS.agentMcpSetEnabled, request),
    listAgentSkills: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentSkillsList) as Promise<AgentSkillsListResponse>,
    inspectAgentSkill: (request: AgentSkillInspectRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillInspect,
        request
      ) as Promise<AgentSkillInspectResponse>,
    activateAgentSkill: (request: AgentSkillActivationRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillActivate,
        request
      ) as Promise<AgentSkillMutationResponse>,
    deactivateAgentSkill: (request: AgentSkillActivationRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillDeactivate,
        request
      ) as Promise<AgentSkillMutationResponse>,
    installAgentSkillFromLocal: (request: AgentSkillInstallFromLocalRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillInstallFromLocal,
        request
      ) as Promise<AgentSkillMutationResponse>,
    installAgentSkillFromGit: (request: AgentSkillInstallFromGitRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillInstallFromGit,
        request
      ) as Promise<AgentSkillMutationResponse>,
    installAgentSkillFromStore: (request: AgentSkillInstallFromStoreRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillInstallFromStore,
        request
      ) as Promise<AgentSkillMutationResponse>,
    uninstallAgentSkill: (request: AgentSkillUninstallRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillUninstall,
        request
      ) as Promise<AgentSkillUninstallResponse>,
    refreshAgentSkillStore: (request?: AgentSkillRefreshStoreRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillRefreshStore,
        request ?? {}
      ) as Promise<AgentSkillStoreResponse>,
    updateAgentSkillStoreConfig: (request: AgentSkillRefreshStoreRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentSkillUpdateStoreConfig,
        request
      ) as Promise<AgentSkillStoreResponse>,
    listMcpServers: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentMcpList) as Promise<AgentMcpListResponse>,
    upsertMcpServer: (request: AgentMcpServerUpsertRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMcpUpsert,
        request
      ) as Promise<AgentMcpServerMutationResponse>,
    removeMcpServer: (request: AgentMcpServerRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMcpRemove,
        request
      ) as Promise<AgentMcpServerRemoveResponse>,
    connectMcpServer: (request: AgentMcpServerRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMcpConnect,
        request
      ) as Promise<AgentMcpServerMutationResponse>,
    disconnectMcpServer: (request: AgentMcpServerRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMcpDisconnect,
        request
      ) as Promise<AgentMcpServerMutationResponse>,
    reloadMcpServer: (request: AgentMcpServerRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMcpReload,
        request
      ) as Promise<AgentMcpServerMutationResponse>,
    discoverMcpTools: (request?: AgentMcpToolDiscoverRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentMcpDiscoverTools,
        request ?? {}
      ) as Promise<AgentMcpToolDiscoverResponse>,
    listImportSources: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentImportListSources) as Promise<AgentImportSourcesResponse>,
    getImportPreferences: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentImportGetPreferences) as Promise<AgentImportPreferences>,
    setImportPreferences: (request: AgentImportPreferencesUpdateRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentImportSetPreferences, request) as Promise<AgentImportPreferences>,
    detectImport: (request: AgentImportDetectRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentImportDetect, request) as Promise<AgentImportDetection>,
    syncImport: (request: AgentImportSyncRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentImportSync, request) as Promise<AgentImportSyncResponse>,
    triggerPoke: (request?: AgentPokeRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentPokeTrigger,
        request ?? {}
      ) as Promise<AgentPokeResponse>,
    listAccounts: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.agentAccountsList) as Promise<AgentAccountsSnapshot>,
    loginAccount: (request: AgentAccountLoginRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentAccountsLogin,
        request
      ) as Promise<AgentAccountsSnapshot>,
    listLoginProviders: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentAccountsLoginProviders
      ) as Promise<AgentLoginProviderCatalogSnapshot>,
    startAccountLogin: (request: AgentAccountLoginStartRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentAccountsLoginStart,
        request
      ) as Promise<AgentAccountLoginStartResponse>,
    completeAccountLogin: (request: AgentAccountLoginCompleteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentAccountsLoginComplete,
        request
      ) as Promise<AgentAccountLoginCompleteResponse>,
    switchAccount: (request: AgentAccountRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentAccountsSwitch,
        request
      ) as Promise<AgentAccountsSnapshot>,
    removeAccount: (request: AgentAccountRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentAccountsRemove,
        request
      ) as Promise<AgentAccountsSnapshot>,
    readBrowserFollowMode: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentBrowserFollowRead
      ) as Promise<AgentBrowserFollowModeSnapshot>,
    updateBrowserFollowMode: (request: AgentBrowserFollowModeUpdateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentBrowserFollowUpdate,
        request
      ) as Promise<AgentBrowserFollowModeSnapshot>,
    readAgentBrowserPreview: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentBrowserPreviewRead
      ) as Promise<readonly AgentBrowserPreviewSnapshot[]>,
    promoteAgentBrowserPreview: (request: AgentBrowserPreviewPromoteRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentBrowserPreviewPromote,
        request
      ) as Promise<void>,
    dismissAgentBrowserPreview: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentBrowserPreviewDismiss
      ) as Promise<void>,
    readActCache: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentActCacheRead
      ) as Promise<AgentActCacheSnapshot>,
    updateActCache: (request: AgentActCacheUpdateRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentActCacheUpdate,
        request
      ) as Promise<AgentActCacheSnapshot>,
    materializeImageAttachment: (request: AgentImageAttachmentMaterializeRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentImageAttachmentMaterialize,
        request
      ) as Promise<AgentImageAttachmentMaterializeResponse>,
    onEvent: (listener: (event: AgentRuntimeEvent) => void) => {
      ensureAgentEventBridge();
      agentEventListeners.add(listener);
      return () => {
        agentEventListeners.delete(listener);
      };
    },
    listPrivateTerminals: (request: AgentPrivateTerminalListRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTerminalListPrivate,
        request
      ) as Promise<readonly AgentPrivateTerminalSnapshot[]>,
    closePrivateTerminal: (request: AgentPrivateTerminalCloseRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentTerminalClosePrivate,
        request
      ) as Promise<void>,
    readProtocolContract: () =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.agentProtocolContract
      ) as Promise<AgentProtocolContract>,
  },
  workbenchObservation: {
    registerHandler: (handler) => {
      ensureWorkbenchObservationBridge();
      workbenchObservationHandler = handler;
      return () => {
        if (workbenchObservationHandler === handler) {
          workbenchObservationHandler = null;
        }
      };
    }
  },
  softwareCapabilities: {
    publish: (software) => ipcRenderer.invoke(LYRA_CHANNELS.softwareCapabilitiesSnapshot, software) as Promise<void>,
    registerHandler: (handler) => {
      ensureSoftwareCapabilitiesBridge();
      softwareCapabilitiesHandler = handler;
      return () => {
        if (softwareCapabilitiesHandler === handler) {
          softwareCapabilitiesHandler = null;
        }
      };
    }
  },
  uiux: {
    listPacks: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxListPacks) as Promise<UiuxListPacksResponse>,
    installFromLocal: (request: UiuxInstallFromLocalRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxInstallFromLocal, request) as Promise<InstalledUiuxPack>,
    installFromGit: (request: UiuxInstallFromGitRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxInstallFromGit, request) as Promise<InstalledUiuxPack>,
    installFromNpm: (request: UiuxInstallFromNpmRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxInstallFromNpm, request) as Promise<InstalledUiuxPack>,
    setTrustState: (request: UiuxSetTrustStateRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxSetTrustState, request) as Promise<InstalledUiuxPack>,
    uninstall: (request: UiuxUninstallRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxUninstall, request) as Promise<UiuxUninstallResponse>,
    requestActivation: (request: UiuxRequestActivationRequest) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.uiuxRequestActivation,
        request
      ) as Promise<UiuxRequestActivationResponse>,
    resolveRuntime: (request: UiuxResolveRuntimeRequest) =>
      ipcRenderer.invoke(LYRA_CHANNELS.uiuxResolveRuntime, request) as Promise<UiuxPackRuntime | null>
  },
  ...createLocationBridgeApi(),
  workbenchState: {
    readCached: readCachedWorkbenchState,
    read: readWorkbenchState,
    write: writeWorkbenchState,
    remove: removeWorkbenchState,
    onDidChange: (listener: (event: WorkbenchStateChangeEvent) => void) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: unknown
      ): void => {
        const event = normalizeWorkbenchStateChangeEvent(payload);
        if (event === null) {
          return;
        }
        listener(event);
      };
      ipcRenderer.on(LYRA_CHANNELS.workbenchStateChanged, wrappedListener);
      return () => {
        ipcRenderer.removeListener(LYRA_CHANNELS.workbenchStateChanged, wrappedListener);
      };
    }
  },
  i18n: {
    readLocalBundles: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.i18nReadLocalBundles) as Promise<
        Readonly<Record<string, Record<string, string>>>
      >,
    readLanguageBundles: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.i18nReadLanguageBundles) as Promise<{
        readonly managed: Readonly<Record<string, Record<string, string>>>;
        readonly local: Readonly<Record<string, Record<string, string>>>;
      }>
  },
  languagePacks: {
    listCatalog: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.languagePacksListCatalog) as Promise<LanguagePackCatalogResponse>,
    listInstalled: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.languagePacksListInstalled) as Promise<
        readonly InstalledLanguagePack[]
      >,
    install: (locale: string) =>
      ipcRenderer.invoke(LYRA_CHANNELS.languagePacksInstall, locale) as Promise<InstalledLanguagePack>,
    uninstall: (locale: string) =>
      ipcRenderer.invoke(LYRA_CHANNELS.languagePacksUninstall, locale) as Promise<void>,
    checkForUpdates: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.languagePacksCheckForUpdates) as Promise<LanguagePackCatalogResponse>,
    onChanged: (listener: (event: LanguagePackChangeEvent) => void) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: LanguagePackChangeEvent
      ): void => {
        listener(payload);
      };
      ipcRenderer.on(LYRA_CHANNELS.languagePacksChanged, wrappedListener);
      return () => {
        ipcRenderer.removeListener(LYRA_CHANNELS.languagePacksChanged, wrappedListener);
      };
    }
  },
  ...createComponentsBridgeApi(),
  ...createProductUninstallBridgeApi(),
  auth: {
    getSession: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.authGetSession) as Promise<AuthSnapshot>,
    getLocalIdentity: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.authGetLocalIdentity) as Promise<AuthLocalIdentity>,
    startGoogleLogin: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.authStartGoogleLogin) as Promise<{
        readonly started: boolean;
        readonly authorizationUrl: string;
      }>,
    updateProfile: (update: AuthProfileUpdate) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.authUpdateProfile,
        update
      ) as Promise<AuthProfile>,
    deleteAccount: (confirmation: string) =>
      ipcRenderer.invoke(
        LYRA_CHANNELS.authDeleteAccount,
        confirmation
      ) as Promise<void>,
    logout: () =>
      ipcRenderer.invoke(LYRA_CHANNELS.authLogout) as Promise<void>,
    onChanged: (listener: (snapshot: AuthSnapshot) => void) => {
      const wrappedListener = (
        _event: Electron.IpcRendererEvent,
        payload: AuthSnapshot
      ): void => {
        listener(payload);
      };
      ipcRenderer.on(LYRA_CHANNELS.authEvent, wrappedListener);
      return () => {
        ipcRenderer.removeListener(LYRA_CHANNELS.authEvent, wrappedListener);
      };
    }
  }
});

contextBridge.exposeInMainWorld("lyraDesktop", createLyraDesktopApi());
contextBridge.exposeInMainWorld("lyraElectron", Object.freeze({
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file).trim();
    } catch {
      return "";
    }
  }
}));
