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
} from "./file-manager";
import type { ProductAnnouncement } from "./product-announcements";
import type { DownloadManagerApi } from "./download-manager";
import type { BrowserShellApi } from "./browser-shell-api";
import type { LyraBrowserRendererApi } from "./lyra-browser-api";
import type {
  ImageViewerCloseSessionRequest,
  ImageViewerEvent,
  ImageViewerOpenRequest,
  ImageViewerOpenResult,
  ImageViewerReadTileRequest,
  ImageViewerTileResponse
} from "./image-viewer";
import type { TerminalThemePresetId } from "./terminal-theme";
import type {
  InstalledLanguagePack,
  LanguagePackCatalogResponse,
  LanguagePackChangeEvent
} from "./language-packs";
import type { ComponentKindV1 } from "@lyra/app-runtime";
import type {
  AuthApi,
  AuthLocalIdentity,
  AuthProfile,
  AuthProfileUpdate,
  AuthSnapshot,
  AuthUser
} from "./auth";
import type {
  BrowserSessionSnapshot,
  BrowserStorageStateRef,
  WorkbenchBrowserChromePopoverRequest,
  WorkbenchBrowserClearSiteDataRequest,
  WorkbenchBrowserClearSiteDataResult,
  WorkbenchBrowserElementPickerAppearance,
  WorkbenchBrowserElementPickerDisableCause,
  WorkbenchBrowserElementPickerMode,
  WorkbenchBrowserElementPickerOwner,
  WorkbenchBrowserElementPickerPhase,
  WorkbenchBrowserElementPickerState,
  WorkbenchBrowserFindLabels,
  WorkbenchBrowserAgentElevationCompletionResult,
  WorkbenchBrowserAgentElevationResult,
  WorkbenchBrowserAgentActivityEvent,
  WorkbenchBrowserAuthChallengeSignal,
  WorkbenchBrowserElevationSession,
  WorkbenchBrowserPageDiagnosticsResult,
  WorkbenchBrowserPageRestoreState,
  WorkbenchBrowserOmniboxLabels,
  WorkbenchBrowserSharedControlEvent,
  WorkbenchBrowserSharedControlStateEvent,
  WorkbenchLumenActivityEvent,
  WorkbenchLumenFollowAction,
  WorkbenchLumenFollowAudit,
  WorkbenchLumenFollowFrame,
  WorkbenchLumenFollowSessionStatus,
  WorkbenchLumenStaleTarget,
  WorkbenchLumenTargetCandidate,
  WorkbenchLumenTargetExplanation,
  WorkbenchLumenTargetKind,
  WorkbenchLumenTargetRef,
  WorkbenchLumenTargetStaleReason,
  WorkbenchBrowserEvent,
  WorkbenchBrowserExecutePageContextActionRequest,
  WorkbenchBrowserHoveredElementInfo,
  WorkbenchBrowserLayoutSnapshot,
  WorkbenchBrowserNavigateRequest,
  WorkbenchBrowserNavigateResult,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserReadPageStateRequest,
  WorkbenchBrowserSearchInPageRequest,
  WorkbenchBrowserSearchInPageResult,
  WorkbenchBrowserSetElementPickerModeRequest,
  WorkbenchBrowserStorageStateRequest,
  WorkbenchBrowserTopologySnapshot,
  PageDragCitationPayload
} from "./workbench-browser";
import type {
  WorkbenchObservationQueryRequest,
  WorkbenchObservationQueryResult,
  WorkbenchVisualCaptureRequest,
  WorkbenchVisualCaptureResult
} from "./workbench-observation";
import type {
  InstalledUiuxPack,
  UiuxInstallFromGitRequest,
  UiuxInstallFromLocalRequest,
  UiuxInstallFromNpmRequest,
  UiuxListPacksResponse,
  UiuxPackRuntime,
  UiuxRequestActivationRequest,
  UiuxRequestActivationResponse,
  UiuxResolveRuntimeRequest,
  UiuxSetTrustStateRequest,
  UiuxUninstallRequest,
  UiuxUninstallResponse
} from "./uiux-packs";
import type {
  LyraSoftwareManifest,
  SoftwareCapabilitiesQueryRequest,
  SoftwareCapabilitiesQueryResult
} from "./software-capabilities";
import type {
  LoginManagerApi
} from "./login-manager";
import type {
  LyraSensitiveValueApi
} from "./sensitive-value";
import type { AgentApi } from "./agent";

export type { ProductAnnouncement };

export type {
  AgentApi,
  AgentActCacheSnapshot,
  AgentActCacheUpdateRequest,
  AgentBrowserFollowModeSnapshot,
  AgentBrowserFollowModeUpdateRequest,
  AgentBrowserPreviewSnapshot,
  AgentBrowserPreviewPromoteRequest,
  AgentClarificationRespondRequest,
  AgentFollowState,
  AgentGitChangedFile,
  AgentGitDiffRequest,
  AgentGitDiffResponse,
  AgentGitDiffScope,
  AgentGitFileRequest,
  AgentGitFileStatus,
  AgentGitMutationResponse,
  AgentGitStatusRequest,
  AgentGitStatusSnapshot,
  AgentGitStatusSummary,
  AgentImageAttachmentMaterializeRequest,
  AgentImageAttachmentMaterializeResponse,
  AgentImageInput,
  AgentMemoryAuditResponse,
  AgentMemorySharedSearchRequest,
  AgentMemorySharedUpdateRequest,
  AgentMemorySnapshot,
  AgentMessage,
  AgentMessageResolveRequest,
  AgentMessageResolveResponse,
  AgentPermissionRespondRequest,
  AgentPrivateTerminalCloseRequest,
  AgentPrivateTerminalListRequest,
  AgentPrivateTerminalSnapshot,
  AgentPlanAnnotation,
  AgentPlanPhase,
  AgentPlanReviseRequest,
  AgentPlanReviewRespondAction,
  AgentPlanReviewRespondRequest,
  AgentPlanReviewSnapshot,
  AgentPlanReviewStatus,
  AgentPlanSnapshot,
  AgentPlanVersionSnapshot,
  AgentProjectPlanDeleteRequest,
  AgentProjectPlanDeleteResponse,
  AgentProjectPlanListRequest,
  AgentProjectPlanListResponse,
  AgentProjectPlanReadRequest,
  AgentProjectPlanReadResponse,
  AgentProjectPlanRecord,
  AgentProjectPlanSummary,
  AgentProjectTodoSnapshot,
  AgentProjectTodoStatus,
  AgentProjectTodoReadRequest,
  AgentProjectTodoReadResponse,
  AgentRollbackPreviewResponse,
  AgentRollbackRequest,
  AgentRollbackRestoreResponse,
  AgentRole,
  AgentRuntimeEvent,
  AgentSessionArchiveRequest,
  AgentSessionBindProjectRequest,
  AgentSessionCreateRequest,
  AgentTemporarySessionCreateRequest,
  AgentSessionDeleteRequest,
  AgentSessionDeleteResponse,
  AgentSessionReadRequest,
  AgentSessionRenameRequest,
  AgentSessionSaveRequest,
  AgentSessionSnapshot,
  AgentSessionKind,
  AgentTodoItem,
  AgentToolActivity,
  AgentToolStatus,
  AgentTurnCancelRequest,
  AgentTurnCancelResponse,
  AgentTurnSendRequest,
  AgentTurnSendResponse,
  AgentConfigSnapshot,
  AgentConfigUpdateRequest,
  AgentAccountLoginCompleteRequest,
  AgentAccountLoginCompleteResponse,
  AgentAccountLoginRequest,
  AgentAccountLoginStartRequest,
  AgentAccountLoginStartResponse,
  AgentAccountRequest,
  AgentAccountSnapshot,
  AgentAccountsSnapshot,
  AgentLoginProviderSnapshot,
  AgentLoginProviderCatalogSnapshot,
  AgentModelEntry,
  AgentCapabilityOverride,
  AgentModelCapabilityKey,
  AgentReasoningReplayField,
  AgentModelDeleteRequest,
  AgentModelEnableRequest,
  AgentModelCapabilitiesUpdateRequest,
  AgentModelRefreshRequest,
  AgentModelRoute,
  AgentModelCatalogRequest,
  AgentModelCatalogSnapshot,
  AgentModelSwitchRequest,
  AgentMcpListResponse,
  AgentImportDetectRequest,
  AgentImportDetection,
  AgentImportPreferences,
  AgentImportPreferencesUpdateRequest,
  AgentImportSourcesResponse,
  AgentImportSyncRequest,
  AgentImportSyncResponse,
  AgentMcpServerMutationResponse,
  AgentMcpServerRemoveResponse,
  AgentMcpServerRequest,
  AgentMcpServerUpsertRequest,
  AgentMcpToolDiscoverRequest,
  AgentMcpToolDiscoverResponse,
  AgentMcpServer,
  AgentMcpToolInfo,
  AgentMcpTransport,
  AgentProviderCapabilitySummary,
  AgentProviderCatalogProfile,
  AgentProviderCatalogSnapshot,
  AgentPermissionPolicySetModeRequest,
  AgentPermissionPolicySnapshot,
  AgentProviderOptionState,
  AgentProviderProtocolEntry,
  AgentProviderOptionsUpdateRequest,
  AgentProviderProfileSaveRequest,
  AgentProviderIconResolveRequest,
  AgentProviderIconResolveResponse,
  AgentProviderRouteEntry,
  AgentPokeRequest,
  AgentPokeResponse,
  AgentRegisteredCommand,
  AgentSessionSummary,
  AgentSessionListRequest,
  AgentSessionListResponse,
  AgentUsageDailyBucket,
  AgentUsageStats,
  AgentUsageStatsRequest,
  AgentUsageTopModel,
  AgentProtocolContract,
  AgentInstalledSkill,
  AgentSkillActivationRequest,
  AgentSkillInspectRequest,
  AgentSkillInspectResponse,
  AgentSkillInstallFromGitRequest,
  AgentSkillInstallFromLocalRequest,
  AgentSkillInstallFromStoreRequest,
  AgentSkillManifest,
  AgentSkillMutationResponse,
  AgentSkillRefreshStoreRequest,
  AgentSkillsListResponse,
  AgentSkillSource,
  AgentSkillStoreEntry,
  AgentSkillStoreIndex,
  AgentSkillStoreResponse,
  AgentSkillStoreSnapshot,
  AgentSkillUninstallRequest,
  AgentSkillUninstallResponse,
  EXPECTED_PROTOCOL_VERSION
} from "./agent";
export type {
  ImageViewerCloseSessionRequest,
  ImageViewerEvent,
  ImageViewerLevel,
  ImageViewerOpenRequest,
  ImageViewerOpenResult,
  ImageViewerReadTileRequest,
  ImageViewerTileResponse
} from "./image-viewer";
export type {
  DownloadManagerApi,
  DownloadManagerBatchRequest,
  DownloadManagerEnqueueRequest,
  DownloadManagerEvent,
  DownloadManagerPriority,
  DownloadManagerSetPriorityRequest,
  DownloadManagerSettings,
  DownloadManagerSnapshot,
  DownloadManagerTask,
  DownloadManagerTaskRequest,
  DownloadManagerTaskSource,
  DownloadManagerTaskState,
  DownloadManagerUpdateSettingsRequest
} from "./download-manager";
export type {
  LyraPerformanceActivitySignals,
  LyraPerformanceDecisionKind,
  LyraPerformanceIsolationFlags,
  LyraPerformanceKernelEvent,
  LyraPerformanceResourceDescriptor,
  LyraPerformanceResourceKind,
  LyraPerformanceResourceLifecycle
} from "./performance-kernel";
export type {
  BrowserActiveElementRef,
  BrowserElementBounds,
  BrowserFormDraftFieldMetadata,
  BrowserFormDraftMetadata,
  BrowserNavigationHistory,
  BrowserNavigationHistoryEntry,
  BrowserPageLoadState,
  BrowserRecoveryAnchor,
  BrowserSessionSnapshot,
  BrowserSessionTabSnapshot,
  BrowserSiteStorageAvailability,
  BrowserStorageAvailability,
  BrowserStorageScopeManifest,
  BrowserStorageStateRef,
  BrowserTargetRegistryManifest,
  BrowserViewportState,
  WorkbenchBrowserCertificateInfo,
  WorkbenchBrowserChromePopoverRequest,
  WorkbenchBrowserChromeSecurityPopoverPayload,
  WorkbenchBrowserClearSiteDataRequest,
  WorkbenchBrowserClearSiteDataResult,
  WorkbenchBrowserClientRect,
  WorkbenchBrowserElementPickerAppearance,
  WorkbenchBrowserElementPickerDisableCause,
  WorkbenchBrowserElementPickerMode,
  WorkbenchBrowserElementPickerOwner,
  WorkbenchBrowserElementPickerPhase,
  WorkbenchBrowserElementPickerState,
  WorkbenchBrowserAgentElevationCompletionResult,
  WorkbenchBrowserAgentElevationResult,
  WorkbenchBrowserAuthChallengeSignal,
  WorkbenchBrowserElevationSession,
  WorkbenchBrowserAgentActivityEvent,
  WorkbenchBrowserPageDiagnosticEntry,
  WorkbenchBrowserPageDiagnosticsResult,
  WorkbenchBrowserPageRestoreState,
  WorkbenchBrowserProfileMode,
  WorkbenchBrowserRecoveryFailure,
  WorkbenchBrowserRecoveryFailureReason,
  WorkbenchBrowserSecurityLevel,
  WorkbenchBrowserSecurityLabels,
  WorkbenchBrowserSecurityLocale,
  WorkbenchBrowserSharedControlEvent,
  WorkbenchBrowserSharedControlStateEvent,
  WorkbenchLumenActivityEvent,
  WorkbenchLumenFollowAction,
  WorkbenchLumenFollowAudit,
  WorkbenchLumenFollowFrame,
  WorkbenchLumenFollowSessionStatus,
  WorkbenchLumenStaleTarget,
  WorkbenchLumenTargetCandidate,
  WorkbenchLumenTargetExplanation,
  WorkbenchLumenTargetKind,
  WorkbenchLumenTargetRef,
  WorkbenchLumenTargetStaleReason,
  WorkbenchBrowserEvent,
  WorkbenchBrowserExecutePageContextActionRequest,
  WorkbenchBrowserHoveredElementInfo,
  WorkbenchBrowserLayoutCoordinateSpace,
  WorkbenchBrowserLayoutSnapshot,
  WorkbenchBrowserNavigateRequest,
  WorkbenchBrowserNavigateResult,
  WorkbenchBrowserPageLayout,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserPageSpec,
  WorkbenchBrowserReadPageStateRequest,
  WorkbenchBrowserSearchInPageMatch,
  WorkbenchBrowserSearchInPageRequest,
  WorkbenchBrowserSearchInPageResult,
  WorkbenchBrowserSetElementPickerModeRequest,
  WorkbenchBrowserStorageStateRequest,
  WorkbenchBrowserTopologySnapshot,
  WorkbenchBrowserWebThemePalette,
  WorkbenchBrowserWebThemeSnapshot
} from "./workbench-browser";
export type {
  BrowserTabObservation,
  FileEditorObservation,
  FileManagerObservation,
  ImageViewerObservation,
  SearchHomeObservation,
  SearchResultsObservation,
  TerminalObservation,
  WorkbenchObservedTabDescriptor,
  WorkbenchObservationDetail,
  WorkbenchObservationError,
  WorkbenchObservationErrorCode,
  WorkbenchObservationKind,
  WorkbenchObservationPageKind,
  WorkbenchObservationQueryRequest,
  WorkbenchObservationQueryResult,
  WorkbenchTabObservation,
  WorkbenchTabObservationResult,
  WorkbenchTabReadRequest,
  WorkbenchTabsListRequest,
  WorkbenchTabsListResult,
  WorkbenchTerminalCloseRequest,
  WorkbenchTerminalCloseResult,
  WorkbenchTerminalFocusRequest,
  WorkbenchTerminalFocusResult,
  WorkbenchTerminalListRequest,
  WorkbenchTerminalListResult,
  WorkbenchTerminalOpenRequest,
  WorkbenchTerminalOpenResult,
  WorkbenchTerminalPaneDescriptor,
  WorkbenchTerminalPlacement,
  WorkbenchVisualCaptureRequest,
  WorkbenchVisualCaptureResult,
  WorkbenchWorkspaceReadRequest,
  WorkbenchWorkspaceSnapshot
} from "./workbench-observation";
export type {
  LyraCapabilityRisk,
  LyraSoftwareActionContext,
  LyraSoftwareActionHandler,
  LyraSoftwareActionManifest,
  LyraSoftwareCapabilitiesContext,
  LyraSoftwareManifest,
  SoftwareCapabilitiesQueryRequest,
  SoftwareCapabilitiesQueryResult,
  SoftwareInspectCapabilityRequest,
  SoftwareInspectCapabilityResponse,
  SoftwareInvokeCapabilityRequest,
  SoftwareInvokeCapabilityResponse,
  SoftwareListCapabilitiesRequest,
  SoftwareListCapabilitiesResponse,
  SoftwareReadStateRequest,
  SoftwareReadStateResponse
} from "./software-capabilities";
export type {
  LoginManagerApi,
  LoginManagerAuthMethod,
  LoginManagerAuthMethodKind,
  LoginManagerClearSiteRequest,
  LoginManagerClearSiteResponse,
  LoginManagerCredential,
  LoginManagerDeleteCredentialRequest,
  LoginManagerEvent,
  LoginManagerFactSource,
  LoginManagerFillCredentialRequest,
  LoginManagerFillCredentialResponse,
  LoginManagerRevealCredentialRequest,
  LoginManagerRevealCredentialResponse,
  LoginManagerSession,
  LoginManagerSessionSignals,
  LoginManagerSessionStatus,
  LoginManagerSnapshot,
  LoginManagerUpdateSessionRequest
} from "./login-manager";
export type {
  LyraSensitiveValueApi,
  LyraSensitiveStorageStatus,
  LyraSensitiveValueCapability,
  LyraSensitiveValueDeleteRequest,
  LyraSensitiveValueKind,
  LyraSensitiveValueOwner,
  LyraSensitiveValueOwnerRef,
  LyraSensitiveValueOwnership,
  LyraSensitiveValuePlaintextVisibility,
  LyraSensitiveValueRef,
  LyraSensitiveValueRevealRequest,
  LyraSensitiveValueRevealResponse,
  LyraSensitiveValueStoreRequest,
  LyraSensitiveValueStoreResponse
} from "./sensitive-value";
export type {
  BuiltinUiuxPackSummary,
  InstalledUiuxPack,
  UiuxInstallFromGitRequest,
  UiuxInstallFromLocalRequest,
  UiuxInstallFromNpmRequest,
  UiuxListPacksResponse,
  UiuxPackManifest,
  UiuxPackRuntime,
  UiuxPackSource,
  UiuxPackTrustState,
  UiuxRequestActivationRequest,
  UiuxRequestActivationResponse,
  UiuxResolveRuntimeRequest,
  UiuxSetTrustStateRequest,
  UiuxUninstallRequest,
  UiuxUninstallResponse
} from "./uiux-packs";

export const LYRA_CHANNELS = {
  minimizeWindow: "lyra:shell/window/minimize",
  toggleWindowMaximize: "lyra:shell/window/toggle-maximize",
  closeWindow: "lyra:shell/window/close",
  setWindowThemeSource: "lyra:shell/window/set-theme-source",
  readWindowTheme: "lyra:shell/window/read-theme",
  windowThemeChanged: "lyra:shell/window/theme-changed",
  readAppMeta: "lyra:shell/app/meta",
  readAppMetaSync: "lyra:shell/app/meta-sync",
  openExternal: "lyra:shell/open-external",
  detectEditors: "lyra:shell/detect-editors",
  openInEditor: "lyra:shell/open-in-editor",
  revealInFolder: "lyra:shell/reveal-in-folder",
  identityReadUserIcon: "lyra:identity/read-user-icon",
  identityResolveProject: "lyra:identity/resolve-project",
  systemNotificationsReadStatus: "lyra:system-notifications/read-status",
  systemNotificationsShow: "lyra:system-notifications/show",
  systemNotificationsOpenSettings: "lyra:system-notifications/open-settings",
  systemNotificationsActivated: "lyra:system-notifications/activated",
  productAnnouncementsRead: "lyra:product-announcements/read",
  productAnnouncementsChanged: "lyra:product-announcements/changed",
  appUpdateReadStatus: "lyra:app-update/read-status",
  appUpdateCheck: "lyra:app-update/check",
  appUpdateDownload: "lyra:app-update/download",
  appUpdateInstall: "lyra:app-update/install",
  appUpdateStatusChanged: "lyra:app-update/status-changed",
  linuxCompatReadStatus: "lyra:linux-compat/read-status",
  linuxCompatReadConfig: "lyra:linux-compat/read-config",
  linuxCompatUpdateConfig: "lyra:linux-compat/update-config",
  linuxCompatRestart: "lyra:linux-compat/restart",
  windowStateChanged: "lyra:shell/window/state-changed",
  resolveWebSearchEngine: "lyra:search/resolve-web-engine",
  filesReadHome: "lyra:files/read-home",
  filesReadDirectory: "lyra:files/read-directory",
  filesSubscribeDirectory: "lyra:files/subscribe-directory",
  filesUnsubscribeDirectory: "lyra:files/unsubscribe-directory",
  filesDirectoryPatch: "lyra:files/directory-patch",
  filesReadTrash: "lyra:files/read-trash",
  filesCreateFile: "lyra:files/create-file",
  filesCreateFolder: "lyra:files/create-folder",
  filesMoveToTrash: "lyra:files/move-to-trash",
  filesRestoreFromTrash: "lyra:files/restore-from-trash",
  filesEmptyTrash: "lyra:files/empty-trash",
  filesMountDevice: "lyra:files/mount-device",
  filesEjectDevice: "lyra:files/eject-device",
  filesReadFavorites: "lyra:files/read-favorites",
  filesWriteFavorites: "lyra:files/write-favorites",
  filesReadRecentLocations: "lyra:files/read-recent-locations",
  filesWriteRecentLocations: "lyra:files/write-recent-locations",
  filesReadTextFile: "lyra:files/read-text-file",
  filesWriteTextFile: "lyra:files/write-text-file",
  filesStatFile: "lyra:files/stat-file",
  filesSearchText: "lyra:files/search-text",
  filesSelectAttachments: "lyra:files/select-attachments",
  filesSelectDirectories: "lyra:files/select-directories",
  downloadsList: "lyra:downloads/list",
  downloadsEnqueue: "lyra:downloads/enqueue",
  downloadsPause: "lyra:downloads/pause",
  downloadsResume: "lyra:downloads/resume",
  downloadsCancel: "lyra:downloads/cancel",
  downloadsRetry: "lyra:downloads/retry",
  downloadsRemove: "lyra:downloads/remove",
  downloadsSetPriority: "lyra:downloads/set-priority",
  downloadsPauseAll: "lyra:downloads/pause-all",
  downloadsResumeAll: "lyra:downloads/resume-all",
  downloadsCancelAll: "lyra:downloads/cancel-all",
  downloadsReadSettings: "lyra:downloads/settings/read",
  downloadsUpdateSettings: "lyra:downloads/settings/update",
  downloadsOpenFile: "lyra:downloads/open-file",
  downloadsRevealFile: "lyra:downloads/reveal-file",
  downloadsEvent: "lyra:downloads/event",
  officePreview: "lyra:office/preview",
  officeRead: "lyra:office/read",
  officeApply: "lyra:office/apply",
  sqliteInspect: "lyra:sqlite/inspect",
  imageViewerOpenImage: "lyra:image-viewer/open-image",
  imageViewerReadTile: "lyra:image-viewer/read-tile",
  imageViewerCloseSession: "lyra:image-viewer/close-session",
  imageViewerEvent: "lyra:image-viewer/event",
  // Browser Shell API: layout / topology / popover / visibility
  workbenchBrowserSyncTopology: "lyra:workbench-browser/sync-topology",
  workbenchBrowserSyncLayout: "lyra:workbench-browser/sync-layout",
  workbenchBrowserSetChromePopover: "lyra:workbench-browser/set-chrome-popover",
  workbenchBrowserSetModalOcclusion: "lyra:workbench-browser/set-modal-occlusion",
  // Browser Engine API (lyra-browser-api): navigate / tab / cookies / capture
  workbenchBrowserNavigate: "lyra:workbench-browser/navigate",
  workbenchBrowserGoBack: "lyra:workbench-browser/go-back",
  workbenchBrowserGoForward: "lyra:workbench-browser/go-forward",
  workbenchBrowserReload: "lyra:workbench-browser/reload",
  workbenchBrowserStop: "lyra:workbench-browser/stop",
  workbenchBrowserReadPageState: "lyra:workbench-browser/read-page-state",
  workbenchBrowserReadSessionSnapshot: "lyra:workbench-browser/read-session-snapshot",
  workbenchBrowserReadStorageState: "lyra:workbench-browser/read-storage-state",
  workbenchBrowserClearSiteData: "lyra:workbench-browser/clear-site-data",
  workbenchBrowserSearchInPage: "lyra:workbench-browser/search-in-page",
  workbenchBrowserSetElementPickerMode: "lyra:workbench-browser/set-element-picker-mode",
  workbenchBrowserCapturePage: "lyra:workbench-browser/capture-page",
  workbenchBrowserCaptureWindow: "lyra:workbench-browser/capture-window",
  workbenchBrowserExecutePageContextAction: "lyra:workbench-browser/execute-page-context-action",
  workbenchBrowserEvent: "lyra:workbench-browser/event",
  workbenchBrowserPageDragCitation: "lyra:workbench-browser/page-drag-citation",
  workbenchBrowserReadActivePageDragCitation:
    "lyra:workbench-browser/read-active-page-drag-citation",
  workbenchBrowserConsumePageDragCitation:
    "lyra:workbench-browser/consume-page-drag-citation",
  workbenchBrowserResolvePageTabId: "lyra:workbench-browser/resolve-page-tab-id",
  loginManagerList: "lyra:login-manager/list",
  loginManagerSetCredentialCaptureEnabled:
    "lyra:login-manager/set-credential-capture-enabled",
  loginManagerUpdateSession: "lyra:login-manager/update-session",
  loginManagerDeleteCredential: "lyra:login-manager/delete-credential",
  loginManagerRevealCredential: "lyra:login-manager/reveal-credential",
  loginManagerFillCredential: "lyra:login-manager/fill-credential",
  loginManagerClearSite: "lyra:login-manager/clear-site",
  loginManagerEvent: "lyra:login-manager/event",
  sensitiveValuesRevealToUser: "lyra:sensitive-values/reveal-to-user",
  sensitiveValuesStore: "lyra:sensitive-values/store",
  sensitiveValuesDelete: "lyra:sensitive-values/delete",
  sensitiveValuesReadStatus: "lyra:sensitive-values/read-status",
  sensitiveValuesStatusChanged: "lyra:sensitive-values/status-changed",
  agentElevationValidate: "lyra:agent/elevation/validate",
  agentElevationSetSecret: "lyra:agent/elevation/set-secret",
  agentElevationClear: "lyra:agent/elevation/clear",
  lspOpenDocument: "lyra:lsp/open-document",
  lspChangeDocument: "lyra:lsp/change-document",
  lspSaveDocument: "lyra:lsp/save-document",
  lspCloseDocument: "lyra:lsp/close-document",
  lspCompletion: "lyra:lsp/completion",
  lspHover: "lyra:lsp/hover",
  lspGotoDefinition: "lyra:lsp/goto-definition",
  lspFindReferences: "lyra:lsp/find-references",
  lspInspectTypeScriptConfig: "lyra:lsp/inspect-typescript-config",
  lspInspectProjectProblems: "lyra:lsp/inspect-project-problems",
  lspEvent: "lyra:lsp/event",
  terminalCreateSession: "lyra:terminal/create-session",
  terminalConnectDataPort: "lyra:terminal/connect-data-port",
  terminalDataPort: "lyra:terminal/data-port",
  terminalAttachRenderer: "lyra:terminal/attach-renderer",
  terminalDetachRenderer: "lyra:terminal/detach-renderer",
  terminalAckData: "lyra:terminal/ack-data",
  terminalReloadPrompt: "lyra:terminal/reload-prompt",
  terminalWriteSession: "lyra:terminal/write-session",
  terminalReadSession: "lyra:terminal/read-session",
  terminalPermissionsEvaluate: "lyra:terminal/permissions/evaluate",
  terminalPermissionsRespond: "lyra:terminal/permissions/respond",
  terminalProcessesRead: "lyra:terminal/processes/read",
  terminalProcessesSignal: "lyra:terminal/processes/signal",
  terminalResizeSession: "lyra:terminal/resize-session",
  terminalCloseSession: "lyra:terminal/close-session",
  terminalEvent: "lyra:terminal/event",
  agentSessionCreate: "lyra:agent/session/create",
  agentSessionCreateTemporary: "lyra:agent/session/create-temporary",
  agentSessionRead: "lyra:agent/session/read",
  agentSessionList: "lyra:agent/session/list",
  agentUsageRead: "lyra:agent/usage/read",
  agentSessionSave: "lyra:agent/session/save",
  agentSessionUnsave: "lyra:agent/session/unsave",
  agentSessionRename: "lyra:agent/session/rename",
  agentSessionArchive: "lyra:agent/session/archive",
  agentSessionDelete: "lyra:agent/session/delete",
  agentSessionBindProject: "lyra:agent/session/bind-project",
  agentTerminalListPrivate: "lyra:agent/terminal/list-private",
  agentTerminalClosePrivate: "lyra:agent/terminal/close-private",
  agentImageAttachmentMaterialize: "lyra:agent/image-attachment/materialize",
  agentBrowserFollowRead: "lyra:agent/browser-follow/read",
  agentBrowserFollowUpdate: "lyra:agent/browser-follow/update",
  agentBrowserPreviewRead: "lyra:agent/browser-preview/read",
  agentBrowserPreviewPromote: "lyra:agent/browser-preview/promote",
  agentBrowserPreviewDismiss: "lyra:agent/browser-preview/dismiss",
  agentActCacheRead: "lyra:agent/act-cache/read",
  agentActCacheUpdate: "lyra:agent/act-cache/update",
  agentTurnStart: "lyra:agent/turn/start",
  agentTurnSend: "lyra:agent/turn/send",
  agentTurnResume: "lyra:agent/turn/resume",
  agentTurnCancel: "lyra:agent/turn/cancel",
  agentMemorySnapshot: "lyra:agent/memory/snapshot",
  agentMemoryAudit: "lyra:agent/memory/audit",
  agentMemoryRecoverRun: "lyra:agent/memory/recover/run",
  agentMemorySharedSearch: "lyra:agent/memory/shared/search",
  agentMemorySharedUpdate: "lyra:agent/memory/shared/update",
  agentRollbackPreview: "lyra:agent/rollback/preview",
  agentRollbackRestore: "lyra:agent/rollback/restore",
  agentMessageResolve: "lyra:agent/message/resolve",
  agentGitStatus: "lyra:agent/git/status",
  agentGitDiff: "lyra:agent/git/diff",
  agentGitStage: "lyra:agent/git/stage",
  agentGitUnstage: "lyra:agent/git/unstage",
  agentGitDiscard: "lyra:agent/git/discard",
  agentPlanList: "lyra:agent/plan/list",
  agentPlanRead: "lyra:agent/plan/read",
  agentPlanDelete: "lyra:agent/plan/delete",
  agentPlanRevise: "lyra:agent/plan/revise",
  agentPlanReviewRespond: "lyra:agent/plan/review/respond",
  agentTodoReadProject: "lyra:agent/todo/read-project",
  agentClarificationRespond: "lyra:agent/clarification/respond",
  agentPermissionRespond: "lyra:agent/permission/respond",
  agentUserGateList: "lyra:agent/user-gate/list",
  agentUserGateResolve: "lyra:agent/user-gate/resolve",
  agentUserGateCancel: "lyra:agent/user-gate/cancel",
  agentUserGateTouchActivity: "lyra:agent/user-gate/touch-activity",
  agentUserGateAutoResolve: "lyra:agent/user-gate/auto-resolve",
  agentPermissionPolicyRead: "lyra:agent/permission-policy/read",
  agentPermissionPolicySetMode: "lyra:agent/permission-policy/set-mode",
  agentConfigRead: "lyra:agent/config/read",
  agentProviderCatalogRead: "lyra:agent/provider/catalog/read",
  agentConfigUpdate: "lyra:agent/config/update",
  agentProviderProfileSave: "lyra:agent/provider/profile/save",
  agentProviderProfileSaveAndDiscover: "lyra:agent/provider/profile/save-and-discover",
  agentProviderIconResolve: "lyra:agent/provider/icon/resolve",
  agentModelsList: "lyra:agent/models/list",
  agentModelSwitch: "lyra:agent/models/switch",
  agentModelEnable: "lyra:agent/models/enable",
  agentModelCapabilitiesUpdate: "lyra:agent/models/update-capabilities",
  agentModelDelete: "lyra:agent/models/delete",
  agentModelRefresh: "lyra:agent/models/refresh",
  agentProviderOptionsUpdate: "lyra:agent/provider/options/update",
  agentProjectsList: "lyra:agent/projects/list",
  agentProjectsRegister: "lyra:agent/projects/register",
  agentProjectsSettings: "lyra:agent/projects/settings",
  agentProjectsSetOverride: "lyra:agent/projects/set-override",
  agentMcpSetEnabled: "lyra:agent/mcp/set-enabled",
  agentSkillsList: "lyra:agent/skills/list",
  agentSkillInspect: "lyra:agent/skills/inspect",
  agentSkillActivate: "lyra:agent/skills/activate",
  agentSkillDeactivate: "lyra:agent/skills/deactivate",
  agentSkillInstallFromLocal: "lyra:agent/skills/install-from-local",
  agentSkillInstallFromGit: "lyra:agent/skills/install-from-git",
  agentSkillInstallFromStore: "lyra:agent/skills/install-from-store",
  agentSkillUninstall: "lyra:agent/skills/uninstall",
  agentSkillRefreshStore: "lyra:agent/skills/refresh-store",
  agentSkillUpdateStoreConfig: "lyra:agent/skills/update-store-config",
  agentMcpList: "lyra:agent/mcp/list",
  agentMcpUpsert: "lyra:agent/mcp/upsert",
  agentMcpRemove: "lyra:agent/mcp/remove",
  agentMcpConnect: "lyra:agent/mcp/connect",
  agentMcpDisconnect: "lyra:agent/mcp/disconnect",
  agentMcpReload: "lyra:agent/mcp/reload",
  agentMcpDiscoverTools: "lyra:agent/mcp/discover-tools",
  agentImportListSources: "lyra:agent/import/list-sources",
  agentImportGetPreferences: "lyra:agent/import/get-preferences",
  agentImportSetPreferences: "lyra:agent/import/set-preferences",
  agentImportDetect: "lyra:agent/import/detect",
  agentImportSync: "lyra:agent/import/sync",
  agentPokeTrigger: "lyra:agent/action/poke",
  agentAccountsList: "lyra:agent/accounts/list",
  agentAccountsLogin: "lyra:agent/accounts/login",
  agentAccountsLoginProviders: "lyra:agent/accounts/login-providers",
  agentAccountsLoginStart: "lyra:agent/accounts/login-start",
  agentAccountsLoginComplete: "lyra:agent/accounts/login-complete",
  agentAccountsSwitch: "lyra:agent/accounts/switch",
  agentAccountsRemove: "lyra:agent/accounts/remove",
  agentEvent: "lyra:agent/event",
  agentProtocolContract: "lyra:agent/protocol/contract",
  personaConsentRead: "lyra:persona/consent/read",
  personaConsentWrite: "lyra:persona/consent/write",
  personaRefresh: "lyra:persona/refresh",
  personaStatus: "lyra:persona/status",
  workbenchObservationQuery: "lyra:workbench-observation/query",
  workbenchObservationQueryResult: "lyra:workbench-observation/query-result",
  softwareCapabilitiesQuery: "lyra:software-capabilities/query",
  softwareCapabilitiesQueryResult: "lyra:software-capabilities/query-result",
  softwareCapabilitiesSnapshot: "lyra:software-capabilities/snapshot",
  uiuxListPacks: "lyra:uiux/list-packs",
  uiuxInstallFromLocal: "lyra:uiux/install-from-local",
  uiuxInstallFromGit: "lyra:uiux/install-from-git",
  uiuxInstallFromNpm: "lyra:uiux/install-from-npm",
  uiuxSetTrustState: "lyra:uiux/set-trust-state",
  uiuxUninstall: "lyra:uiux/uninstall",
  uiuxRequestActivation: "lyra:uiux/request-activation",
  uiuxResolveRuntime: "lyra:uiux/resolve-runtime",
  workbenchStateBootstrapSnapshot: "lyra:workbench-state/bootstrap-snapshot",
  workbenchStateRead: "lyra:workbench-state/read",
  workbenchStateWrite: "lyra:workbench-state/write",
  workbenchStateRemove: "lyra:workbench-state/remove",
  workbenchStateChanged: "lyra:workbench-state/changed",
  locationReadHostCandidates: "lyra:location/read-host-candidates",
  locationOpenSystemSettings: "lyra:location/open-system-settings",
  locationReverseGeocodeCandidates: "lyra:location/reverse-geocode-candidates",
  screenshotPreviewPresent: "lyra:screenshot-preview/present",
  screenshotPreviewDismiss: "lyra:screenshot-preview/dismiss",
  screenshotPreviewEvent: "lyra:screenshot-preview/event",
  i18nReadLocalBundles: "lyra:i18n/read-local-bundles",
  i18nReadLanguageBundles: "lyra:i18n/read-language-bundles",
  languagePacksListCatalog: "lyra:language-packs/list-catalog",
  languagePacksListInstalled: "lyra:language-packs/list-installed",
  languagePacksInstall: "lyra:language-packs/install",
  languagePacksUninstall: "lyra:language-packs/uninstall",
  languagePacksCheckForUpdates: "lyra:language-packs/check-for-updates",
  languagePacksChanged: "lyra:language-packs/changed",
  componentsList: "lyra:components/list",
  componentsResolveAppModule: "lyra:components/resolve-app-module",
  componentsInstallFromDirectory: "lyra:components/install-from-directory",
  componentsAssessActivation: "lyra:components/assess-activation",
  componentsActivate: "lyra:components/activate",
  componentsRollback: "lyra:components/rollback",
  componentsUninstallVersion: "lyra:components/uninstall-version",
  componentsStageUpdate: "lyra:components/stage-update",
  componentsCancelUpdate: "lyra:components/cancel-update",
  componentsPurgeStagedUpdate: "lyra:components/purge-staged-update",
  componentsUpdateProgress: "lyra:components/update-progress",
  componentsCoreProjectionStatus: "lyra:components/core-projection/status",
  componentsApplyCore: "lyra:components/core-projection/apply",
  appUninstallProduct: "lyra:app/uninstall-product",
  appUninstallProgress: "lyra:app/uninstall-progress",
  appUninstallOpen: "lyra:app/uninstall-open",
  appRegisterUninstall: "lyra:app/register-uninstall",
  authGetSession: "lyra:auth/get-session",
  authGetLocalIdentity: "lyra:auth/get-local-identity",
  authStartGoogleLogin: "lyra:auth/start-google-login",
  authUpdateProfile: "lyra:auth/update-profile",
  authDeleteAccount: "lyra:auth/delete-account",
  authLogout: "lyra:auth/logout",
  authEvent: "lyra:auth/event",
} as const;

export type WindowStatePayload = {
  readonly isMaximized: boolean;
  readonly isFullScreen?: boolean;
  readonly isFocused: boolean;
};

export type WindowThemePayload = {
  readonly source: "system" | "light" | "dark";
  readonly shouldUseDarkColors: boolean;
};

export type AppMetaPayload = {
  readonly version: string;
  readonly platform: NodeJS.Platform;
  readonly arch?: NodeJS.Architecture | undefined;
  readonly windowMaterialMode?: "native" | "opaque" | undefined;
  readonly desktopTargetId?: string | undefined;
  readonly desktopSupportTier?: "tier1" | "tier2" | "unsupported" | undefined;
  readonly linuxLibc?: "glibc" | "musl" | "unknown" | null | undefined;
  readonly isPackaged: boolean;
  readonly forceInstaller?: boolean;
  readonly forceUninstaller?: boolean;
  readonly componentInstallRoot?: string;
  readonly userName?: string | undefined;
  readonly hostName?: string | undefined;
  readonly locale?: string | undefined;
  readonly timeZone?: string | undefined;
};

export type SystemNotificationMode = "off" | "background" | "all";
export type SystemNotificationClickBehavior = "open_center" | "open_source";
export type SystemNotificationLevel = "info" | "success" | "warning" | "error";
export type SystemNotificationActionId = "open-center" | "open-source" | "mark-read";
export type SystemNotificationPermission =
  | "granted"
  | "denied"
  | "default"
  | "unsupported"
  | "unknown";

export type SystemNotificationAction = {
  readonly id: SystemNotificationActionId;
  readonly title: string;
};

export type AppUpdateStatus = {
  readonly state: "unsupported" | "idle" | "checking" | "available" | "downloading" | "ready" | "error";
  readonly currentVersion: string;
  readonly availableVersion?: string;
  readonly releaseNotes?: string;
  readonly progress?: number;
  readonly error?: string;
};

export type AppUpdateApi = {
  readonly readStatus: () => Promise<AppUpdateStatus>;
  readonly check: () => Promise<AppUpdateStatus>;
  readonly download: () => Promise<AppUpdateStatus>;
  readonly install: () => Promise<void>;
  readonly onStatusChanged: (listener: (status: AppUpdateStatus) => void) => () => void;
};

export type ProductAnnouncementsApi = {
  readonly read: () => Promise<readonly ProductAnnouncement[]>;
  readonly onChanged: (listener: (items: readonly ProductAnnouncement[]) => void) => () => void;
};

export type SystemNotificationShowRequest = {
  readonly id: string;
  readonly title: string;
  readonly body?: string;
  readonly sourceTitle?: string;
  readonly level: SystemNotificationLevel;
  readonly mode: SystemNotificationMode;
  readonly clickBehavior: SystemNotificationClickBehavior;
  readonly actionsEnabled: boolean;
  readonly actions?: readonly SystemNotificationAction[];
};

export type SystemNotificationShowResult =
  | {
      readonly status: "shown";
      readonly notificationId: string;
    }
  | {
      readonly status: "skipped";
      readonly reason: "disabled" | "foreground" | "unsupported" | "invalid" | "permission";
    }
  | {
      readonly status: "failed";
      readonly reason: "show-error";
      readonly message: string;
    };

export type SystemNotificationStatus = {
  readonly platform: NodeJS.Platform;
  readonly supported: boolean;
  readonly permission: SystemNotificationPermission;
  readonly canNotify: boolean;
  readonly canOpenSettings: boolean;
  readonly appUserModelId?: string;
  readonly actionSupport: "native" | "windows-toast" | "none";
};

export type SystemNotificationAccessRequestResult = SystemNotificationStatus & {
  readonly openedSettings: boolean;
};

export type SystemNotificationOpenSettingsResult = {
  readonly opened: boolean;
  readonly target?: string;
  readonly reason?: "unsupported-platform" | "open-failed";
};

export type SystemNotificationActivation = {
  readonly notificationId: string;
  readonly actionId: SystemNotificationActionId;
  readonly activatedAt: number;
};

export type LinuxGraphicsBackend = "wayland" | "x11";

export type LinuxGpuMode = "hardware" | "software";

export type LinuxCompatProfile = "reliable" | "native" | "performance";

export type LinuxPackageType =
  | "appimage"
  | "deb"
  | "dev"
  | "flatpak"
  | "rpm"
  | "snap"
  | "tar"
  | "unknown";

export type LinuxGpuVendor =
  | "amd"
  | "intel"
  | "nvidia"
  | "software"
  | "virtio"
  | "unknown";

export type LinuxSessionType = "wayland" | "x11" | "unknown";

export type LinuxStrategySource = "auto" | "cli" | "config" | "env" | "history" | "recovery";

export type LinuxCompatWarning = {
  readonly code:
    | "both-display-servers-detected"
    | "gpu-compat-fallback"
    | "missing-display-server"
    | "previous-launch-failed"
    | "recovery-mode"
    | "session-env-mismatch"
    | "unknown-session"
    | "unknown-desktop";
  readonly message: string;
};

export type LinuxCompatConfig = {
  readonly version: 1;
  readonly profile: LinuxCompatProfile;
  readonly updatedAt: string;
};

export type LinuxGpuFacts = {
  readonly vendor: LinuxGpuVendor;
  readonly deviceCount: number;
  readonly hasDiscreteGpu: boolean;
  readonly driverHint: string | null;
  readonly hardwareAccelerationEnabled: boolean | null;
  readonly featureStatus: Readonly<Record<string, unknown>> | null;
};

export type LinuxEnvironmentFacts = {
  readonly sessionType: LinuxSessionType;
  readonly architecture: NodeJS.Architecture;
  readonly kernelRelease: string;
  readonly libc: "glibc" | "musl" | "unknown" | null;
  readonly desktop: string;
  readonly desktopRaw: string;
  readonly distributionId: string | null;
  readonly distributionVersion: string | null;
  readonly distributionLike: readonly string[];
  readonly packageType: LinuxPackageType;
  readonly waylandDisplay: string | null;
  readonly x11Display: string | null;
  readonly isContainer: boolean;
  readonly isRoot: boolean;
  readonly gpu: LinuxGpuFacts;
};

export type LinuxCompatRecoveryStatus = {
  readonly active: boolean;
  readonly autoRestarted: boolean;
  readonly launchId: string;
  readonly previousFailureReason: string | null;
};

export type LinuxCompatReadStatusResponse = {
  readonly platform: NodeJS.Platform;
  readonly enabled: boolean;
  readonly profile: LinuxCompatProfile;
  readonly recommendedProfile: LinuxCompatProfile;
  readonly safeMode: boolean;
  readonly backend: LinuxGraphicsBackend;
  readonly gpuMode: LinuxGpuMode;
  readonly profileSource: LinuxStrategySource;
  readonly backendSource: LinuxStrategySource;
  readonly gpuSource: LinuxStrategySource;
  readonly warnings: readonly LinuxCompatWarning[];
  readonly notes: readonly string[];
  readonly appliedEnv: Readonly<Record<string, string>>;
  readonly appliedSwitches: Readonly<Record<string, string>>;
  readonly facts: LinuxEnvironmentFacts;
  readonly recovery: LinuxCompatRecoveryStatus;
  readonly generatedAt: string;
};

export type LinuxCompatReadConfigResponse = LinuxCompatConfig;

export type LinuxCompatUpdateConfigRequest = {
  readonly profile: LinuxCompatProfile;
};

export type LinuxCompatUpdateConfigResponse = {
  readonly ok: boolean;
  readonly config?: LinuxCompatConfig;
  readonly error?: string;
};

export type LinuxCompatRestartRequest = {
  readonly recovery?: boolean;
  readonly reason?: string;
};

export type LinuxCompatRestartResponse = {
  readonly ok: boolean;
  readonly error?: string;
};

export type SearchAggregateEngine = {
  readonly id: string;
  readonly label: string;
  readonly accentColor: string;
  readonly endpoint?: string;
  readonly searchUrlTemplate?: string;
  readonly probeUrlTemplate?: string;
  readonly enabledByDefault?: boolean;
};

export type SearchWebEngineDefinition = SearchAggregateEngine & {
  readonly searchUrlTemplate: string;
};

export type SearchResolveWebEngineRequest = {
  readonly query: string;
  readonly engines: readonly SearchWebEngineDefinition[];
  readonly locale: string;
  readonly timeoutMs?: number;
};

export type SearchResolveWebEngineResponse = {
  readonly engine: SearchWebEngineDefinition;
  readonly searchUrl: string;
  readonly fallbackUsed: boolean;
  readonly latencyMs?: number;
};

export type SearchOfficialCategory =
  | "official_homepage"
  | "official_subsite"
  | "official_docs"
  | "official_login"
  | "official_download"
  | "official_support";

export type SearchAggregateResult = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly displayUrl: string;
  readonly snippet: string;
  readonly sourceEngineIds: readonly string[];
  readonly isOfficialResult?: boolean;
  readonly officialCategory?: SearchOfficialCategory;
};

export type SearchAggregateEngineBucket = {
  readonly engine: SearchAggregateEngine;
  readonly results: readonly SearchAggregateResult[];
  readonly error?: string;
  readonly latencyMs?: number;
};

export type SearchAggregateRequest = {
  readonly query: string;
  readonly limitPerEngine: number;
  readonly engines: readonly SearchAggregateEngine[];
};

export type SearchAggregateResponse = {
  readonly query: string;
  readonly blendedResults: readonly SearchAggregateResult[];
  readonly engineBuckets: readonly SearchAggregateEngineBucket[];
  readonly fetchedAt: string;
  readonly elapsedMs: number;
};

export type TerminalSessionId = string;

export type TerminalCommandSource = "user" | "agent" | "system";
export type TerminalSessionMode = "command" | "shell";

export type TerminalLifecycleProjection = {
  readonly sessionId: TerminalSessionId;
  readonly state:
    | "running"
    | "waiting"
    | "completed"
    | "failed"
    | "cancelled"
    | "inputSent"
    | "runtimeUnavailable"
    | "unknown"
    | string;
  readonly phase: string;
  readonly reason?: string | null;
  readonly terminalRunning: boolean;
  readonly commandId?: string | null;
  readonly commandStatus?: string | null;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly source?: TerminalCommandSource | string | null;
  readonly mode?: TerminalSessionMode | string | null;
  readonly currentCwd?: string | null;
  readonly waiting: boolean;
  readonly background: boolean;
};

export type TerminalMemoryActor = {
  readonly kind:
    | "human_user"
    | "agent"
    | "subagent"
    | "terminal_kernel"
    | "process"
    | "system"
    | "permission";
  readonly displayName?: string | null;
  readonly agentSessionId?: string | null;
  readonly runtimeTurnId?: string | null;
  readonly toolCallId?: string | null;
  readonly processId?: number | null;
  readonly processName?: string | null;
};

export type TerminalMemoryCorrelation = {
  readonly agentSessionId?: string | null;
  readonly runtimeTurnId?: string | null;
  readonly parentRuntimeTurnId?: string | null;
  readonly toolCallId?: string | null;
  readonly terminalToolName?: string | null;
  readonly commandId?: string | null;
  readonly inputId?: string | null;
  readonly outputArtifactId?: string | null;
  readonly permissionId?: string | null;
  readonly uiWindowId?: string | null;
  readonly terminalTabId?: string | null;
  readonly paneId?: string | null;
  readonly workbenchTabId?: string | null;
  readonly projectRoot?: string | null;
  readonly cwd?: string | null;
};

export type TerminalMemoryMetadata = {
  readonly sessionRootPath?: string;
  readonly eventLogPath: string;
  readonly summaryPath: string;
  readonly uiTimelinePath: string;
  readonly outputTextPath: string;
  readonly rawOutputPath: string;
  readonly outputSummaryPath?: string;
  readonly lineIndexPath: string;
  readonly errorIndexPath: string;
  readonly commandsPath: string;
  readonly commandArtifactsRootPath?: string;
  readonly permissionsPath?: string;
  readonly processesPath?: string;
  readonly attachmentsPath?: string;
  readonly screenDiffsPath?: string;
  readonly retentionManifestPath?: string;
  readonly repairLogPath?: string;
  readonly indexManifestPath?: string;
  readonly terminalSessionsIndexPath?: string;
  readonly terminalEventsIndexPath?: string;
  readonly terminalCommandsIndexPath?: string;
  readonly terminalOutputArtifactsIndexPath?: string;
  readonly terminalPermissionsIndexPath?: string;
  readonly agentTerminalLinksIndexPath?: string;
  readonly outputCompactionPath?: string;
  readonly outputRedactionsPath?: string;
  readonly restoration?: {
    readonly metadataRestorable: boolean;
    readonly historyReadable: boolean;
    readonly screenReplayable: boolean;
    readonly ptyRestorable: boolean;
    readonly ptyRecreatable?: boolean;
    readonly liveProcessRestorable?: boolean;
    readonly liveProcessReconnectable?: boolean;
    readonly reconnectRequiresLivePtyHost?: boolean;
    readonly reason?: string;
  };
  readonly eventSeqRange?: {
    readonly start: number;
    readonly end: number;
  } | null;
  readonly outputByteRange: {
    readonly start: number;
    readonly end: number;
  };
  readonly estimatedTokens: number;
  readonly projectionRecommendation?: "inline" | "cache" | "summary" | string;
  readonly lineCount?: number;
  readonly errorCount?: number;
  readonly latestOutputPreview?: string;
  readonly truncatedByProjection: boolean;
  readonly searchHints?: Readonly<Record<string, unknown>>;
};

export type TerminalPermissionRisk =
  | "none"
  | "low"
  | "shell"
  | "dangerous"
  | "sensitive"
  | string;

export type TerminalPermissionDecision =
  | "allow"
  | "deny"
  | "needsApproval"
  | "expired"
  | "revoked"
  | string;

export type TerminalPermissionScope = {
  readonly kind:
    | "oneShot"
    | "session"
    | "commandPattern"
    | "cwd"
    | "toolCall"
    | "agentSession"
    | "timeLimited"
    | string;
  readonly summary?: string;
  readonly expiresAt?: string | null;
  readonly commandPattern?: string | null;
  readonly cwd?: string | null;
  readonly agentSessionId?: string | null;
  readonly runtimeTurnId?: string | null;
  readonly toolCallId?: string | null;
};

export type TerminalSemanticInputAction =
  | "runCommand"
  | "submitInput"
  | "pasteText"
  | "pressKeys"
  | "sendSignal"
  | "resize"
  | string;

export type TerminalPermissionEvaluateRequest = {
  readonly sessionId: TerminalSessionId;
  readonly action: TerminalSemanticInputAction;
  readonly inputId?: string;
  readonly commandId?: string;
  readonly risk?: TerminalPermissionRisk;
  readonly title?: string;
  readonly summary?: string;
  readonly detail?: string;
  readonly redactedPreview?: string;
  readonly scope?: TerminalPermissionScope;
  readonly actor: TerminalMemoryActor;
  readonly correlation: TerminalMemoryCorrelation;
};

export type TerminalPermissionEvaluateResponse = {
  readonly sessionId: TerminalSessionId;
  readonly permissionId: string;
  readonly decision: TerminalPermissionDecision;
  readonly risk: TerminalPermissionRisk;
  readonly scope?: TerminalPermissionScope;
  readonly reason?: string;
  readonly expiresAt?: string | null;
  readonly memory?: TerminalMemoryMetadata;
};

export type TerminalPermissionRespondRequest = {
  readonly sessionId: TerminalSessionId;
  readonly permissionId: string;
  readonly decision: "allow" | "deny";
  readonly scope?: TerminalPermissionScope;
  readonly reason?: string;
  readonly expiresAt?: string | null;
  readonly actor: TerminalMemoryActor;
  readonly correlation: TerminalMemoryCorrelation;
};

export type TerminalPermissionRespondResponse = {
  readonly sessionId: TerminalSessionId;
  readonly permissionId: string;
  readonly decision: TerminalPermissionDecision;
  readonly scope?: TerminalPermissionScope;
  readonly expiresAt?: string | null;
  readonly memory?: TerminalMemoryMetadata;
};

export type TerminalProcessSnapshot = {
  readonly pid: number;
  readonly parentPid?: number | null;
  readonly foreground?: boolean;
  readonly commandId?: string | null;
  readonly name?: string | null;
  readonly commandLine?: string | null;
  readonly cwd?: string | null;
  readonly running: boolean;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly children?: readonly TerminalProcessSnapshot[];
};

export type TerminalProcessesReadRequest = {
  readonly sessionId: TerminalSessionId;
  readonly pid?: number;
  readonly includeTree?: boolean;
  readonly includeCommand?: boolean;
  readonly actor?: TerminalMemoryActor;
  readonly correlation?: TerminalMemoryCorrelation;
};

export type TerminalProcessesReadResponse = {
  readonly sessionId: TerminalSessionId;
  readonly pid?: number | null;
  readonly foregroundPid?: number | null;
  readonly running: boolean;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  readonly limited?: boolean;
  readonly processes: readonly TerminalProcessSnapshot[];
  readonly memory?: TerminalMemoryMetadata;
  readonly lifecycle?: TerminalLifecycleProjection;
};

export type TerminalProcessSignalRequest = {
  readonly sessionId: TerminalSessionId;
  readonly pid?: number;
  readonly signal: string;
  readonly reason?: string;
  readonly actor: TerminalMemoryActor;
  readonly correlation: TerminalMemoryCorrelation;
};

export type TerminalProcessSignalResponse = {
  readonly sessionId: TerminalSessionId;
  readonly pid?: number | null;
  readonly signal: string;
  readonly status: "sent" | "needsApproval" | "denied" | "notImplemented" | string;
  readonly inputId?: string | null;
  readonly permissionId?: string | null;
  readonly memory?: TerminalMemoryMetadata;
};

export type TerminalCreateRequest = {
  readonly sessionId?: TerminalSessionId;
  readonly title?: string;
  readonly cwd?: string;
  readonly sourceAgentSessionId?: string;
  readonly shell?: string;
  readonly env?: readonly TerminalShellLaunchEnvPair[];
  readonly mode?: TerminalSessionMode;
  readonly command?: string;
  readonly persist?: boolean;
  readonly terminalThemePreset?: TerminalThemePresetId;
  readonly uiThemeId?: string;
  readonly cols: number;
  readonly rows: number;
  readonly source: TerminalCommandSource;
  readonly actor?: TerminalMemoryActor;
  readonly correlation?: TerminalMemoryCorrelation;
};

export type TerminalShellLaunchEnvPair = {
  readonly key: string;
  readonly value: string;
};

export type TerminalShellLaunchPlanRequest = {
  readonly shell: string;
};

export type TerminalShellLaunchPlanResponse = {
  readonly shell: string;
  readonly args: readonly string[];
  readonly env: readonly TerminalShellLaunchEnvPair[];
  readonly integrationEnabled: boolean;
  readonly integrationFamily?: string | null;
  readonly integrationScriptAsset?: string | null;
};

export type TerminalSessionSnapshot = {
  readonly sessionId: TerminalSessionId;
  readonly title: string;
  readonly cwd?: string;
  readonly currentCwd?: string;
  readonly shell: string;
  readonly cols: number;
  readonly rows: number;
  readonly createdAt: string;
  readonly source?: TerminalCommandSource;
  readonly mode?: TerminalSessionMode;
  readonly command?: string;
  readonly persist?: boolean;
  readonly running?: boolean;
  readonly exitCode?: number | null;
};

export type TerminalWriteRequest = {
  readonly sessionId: TerminalSessionId;
  readonly data?: string;
  readonly text?: string;
  readonly keys?: readonly string[];
  readonly appendNewline?: boolean;
  readonly source: TerminalCommandSource;
  readonly actor?: TerminalMemoryActor;
  readonly correlation?: TerminalMemoryCorrelation;
};

export type TerminalReadRequest = {
  readonly sessionId: TerminalSessionId;
  /** UTF-8 byte offset into session-output.txt encoded as a string cursor token. */
  readonly cursor?: string;
  readonly maxBytes?: number;
  readonly waitMs?: number;
};

export type TerminalReadResponse = {
  readonly sessionId: TerminalSessionId;
  readonly cursor: string;
  readonly output: string;
  readonly running: boolean;
  readonly exitCode: number | null;
  readonly truncated: boolean;
  readonly source: TerminalCommandSource;
  readonly mode: TerminalSessionMode;
  readonly memory?: TerminalMemoryMetadata;
  readonly reason?: "output" | "exit" | "timeout";
  readonly lifecycle?: TerminalLifecycleProjection;
};

export type TerminalResizeRequest = {
  readonly sessionId: TerminalSessionId;
  readonly cols: number;
  readonly rows: number;
  readonly actor?: TerminalMemoryActor;
  readonly correlation?: TerminalMemoryCorrelation;
};

export type TerminalCloseRequest = {
  readonly sessionId: TerminalSessionId;
  readonly actor?: TerminalMemoryActor;
  readonly correlation?: TerminalMemoryCorrelation;
};

export type TerminalRendererAttachRequest = {
  readonly sessionId: TerminalSessionId;
};

export type TerminalRendererAttachResponse = {
  readonly sessionId: TerminalSessionId;
  readonly attached: boolean;
};

export type TerminalRendererDetachRequest = {
  readonly sessionId: TerminalSessionId;
};

export type TerminalDataAckRequest = {
  readonly sessionId: TerminalSessionId;
  readonly dataSeq: number;
  readonly byteLength: number;
};

export type TerminalReloadPromptRequest = {
  readonly sessionId: TerminalSessionId;
  readonly terminalThemePreset?: TerminalThemePresetId;
  readonly uiThemeId?: string;
  readonly source: TerminalCommandSource;
};

export type TerminalReloadPromptResult = {
  readonly applied: boolean;
  readonly deferred: boolean;
  readonly reason?: string;
};

export type TerminalDataEvent = {
  readonly kind: "data";
  readonly sessionId: TerminalSessionId;
  readonly data: string;
  readonly dataSeq?: number;
  readonly byteLength?: number;
};

export type TerminalExitEvent = {
  readonly kind: "exit";
  readonly sessionId: TerminalSessionId;
  readonly exitCode: number;
};

export type TerminalErrorEvent = {
  readonly kind: "error";
  readonly sessionId: TerminalSessionId;
  readonly error: string;
};

export type TerminalCwdChangedEvent = {
  readonly kind: "cwdChanged";
  readonly sessionId: TerminalSessionId;
  readonly cwd: string;
  readonly currentCwd: string;
  readonly source?: TerminalCommandSource | string | null;
  readonly mode?: TerminalSessionMode | string | null;
};

export type TerminalCommandCompletedRuntimeEvent = {
  readonly kind: "commandCompleted";
  readonly sessionId: TerminalSessionId;
  readonly commandId: string;
  readonly exitCode?: number | null;
  readonly source?: TerminalCommandSource;
  readonly mode?: TerminalSessionMode;
  readonly command: {
    readonly terminalSessionId: TerminalSessionId;
    readonly commandId: string;
    readonly commandText?: string | null;
    readonly status: "completed" | "failed" | "cancelled" | string;
    readonly exitCode?: number | null;
    readonly signal?: string | null;
    readonly actor?: TerminalMemoryActor | Readonly<Record<string, unknown>>;
    readonly correlation?: TerminalMemoryCorrelation | Readonly<Record<string, unknown>>;
    readonly outputTextRange?: { readonly start: number; readonly end: number };
    readonly rawOutputRange?: { readonly start: number; readonly end: number };
    readonly artifactRootPath?: string;
    readonly commandMetaPath?: string;
    readonly commandOutputTextPath?: string;
    readonly commandRawOutputPath?: string;
    readonly commandEventsPath?: string;
    readonly commandSummaryPath?: string;
    readonly completedAt?: string;
  };
};

export type TerminalEvent =
  | TerminalDataEvent
  | TerminalExitEvent
  | TerminalErrorEvent
  | TerminalCwdChangedEvent
  | TerminalCommandCompletedRuntimeEvent;

export type LspLanguageId = string;

export type LspDocumentRequest = {
  readonly sessionId: string;
  readonly filePath: string;
  readonly languageId: LspLanguageId;
  readonly content: string;
  readonly version: number;
  readonly projectRoot?: string;
};

export type LspCompletionRequest = {
  readonly sessionId: string;
  readonly filePath: string;
  readonly languageId: LspLanguageId;
  readonly line: number;
  readonly column: number;
  readonly version: number;
  readonly projectRoot?: string;
};

export type LspCompletionItem = {
  readonly label: string;
  readonly insertText?: string;
  readonly detail?: string;
  readonly documentation?: string;
  readonly kind?: number;
  readonly sortText?: string;
  readonly filterText?: string;
};

export type LspPositionRequest = {
  readonly filePath: string;
  readonly languageId: LspLanguageId;
  readonly line: number;
  readonly column: number;
  readonly projectRoot?: string;
};

export type LspLocation = {
  readonly filePath: string;
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
};

export type LspHoverResult = {
  readonly contents: string;
  readonly startLine?: number;
  readonly startCharacter?: number;
  readonly endLine?: number;
  readonly endCharacter?: number;
};

export type LspDiagnostic = {
  readonly filePath: string;
  readonly severity: number;
  readonly message: string;
  readonly source?: string;
  readonly code?: string;
  readonly startLine: number;
  readonly startCharacter: number;
  readonly endLine: number;
  readonly endCharacter: number;
};

export type LspCompletionResult = {
  readonly items: readonly LspCompletionItem[];
  readonly isIncomplete: boolean;
};

export type LspRuntimeEvent = {
  readonly kind: "server-status" | "error" | "diagnostics" | "acquire";
  readonly sessionId?: string;
  readonly filePath?: string;
  readonly languageId?: LspLanguageId;
  readonly projectRoot?: string;
  readonly status?: string;
  readonly message?: string;
  readonly serverId?: string;
  readonly diagnostics?: readonly LspDiagnostic[];
  readonly acquireId?: string;
  readonly receivedBytes?: number;
  readonly totalBytes?: number;
};

export type WindowControlsApi = {
  readonly minimize: () => Promise<void>;
  readonly toggleMaximize: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly setThemeSource?: (source: "system" | "light" | "dark") => Promise<void>;
  readonly readTheme?: () => Promise<WindowThemePayload>;
  readonly onThemeChange?: (listener: (theme: WindowThemePayload) => void) => () => void;
};

export type ShellEventsApi = {
  readonly onWindowStateChange: (
    listener: (payload: WindowStatePayload) => void
  ) => () => void;
};

export type SystemNotificationsApi = {
  readonly readStatus: () => Promise<SystemNotificationStatus>;
  readonly requestAccess: () => Promise<SystemNotificationAccessRequestResult>;
  readonly openSettings: () => Promise<SystemNotificationOpenSettingsResult>;
  readonly show: (
    request: SystemNotificationShowRequest
  ) => Promise<SystemNotificationShowResult>;
  readonly onActivated: (
    listener: (event: SystemNotificationActivation) => void
  ) => () => void;
};

export type SearchApi = {
  readonly resolveWebSearchEngine: (
    request: SearchResolveWebEngineRequest
  ) => Promise<SearchResolveWebEngineResponse>;
};

export type LinuxCompatApi = {
  readonly readStatus: () => Promise<LinuxCompatReadStatusResponse>;
  readonly readConfig: () => Promise<LinuxCompatReadConfigResponse>;
  readonly updateConfig: (
    request: LinuxCompatUpdateConfigRequest
  ) => Promise<LinuxCompatUpdateConfigResponse>;
  readonly requestRestart: (
    request?: LinuxCompatRestartRequest
  ) => Promise<LinuxCompatRestartResponse>;
};

export type FilesApi = {
  readonly readHome: () => Promise<FileManagerReadHomeResponse>;
  readonly readDirectory: (request: FileManagerReadDirectoryRequest) => Promise<FileManagerReadDirectoryResponse>;
  readonly subscribeDirectory?: (
    request: FileManagerSubscribeDirectoryRequest
  ) => Promise<FileManagerSubscribeDirectoryResponse>;
  readonly unsubscribeDirectory?: (subscriptionId: string) => Promise<void>;
  readonly onDirectoryPatch?: (listener: (patch: FileManagerDirectoryPatch) => void) => () => void;
  readonly readTrash: () => Promise<FileManagerReadTrashResponse>;
  readonly createFile: (request: FileManagerCreateFileRequest) => Promise<FileManagerDirectoryMutationResponse>;
  readonly createFolder: (request: FileManagerCreateFolderRequest) => Promise<FileManagerDirectoryMutationResponse>;
  readonly moveToTrash: (request: FileManagerMoveToTrashRequest) => Promise<void>;
  readonly restoreFromTrash: (request: FileManagerRestoreFromTrashRequest) => Promise<void>;
  readonly emptyTrash: () => Promise<void>;
  readonly mountDevice: (request: FileManagerMountDeviceRequest) => Promise<FileManagerMountDeviceResult>;
  readonly ejectDevice: (request: FileManagerEjectDeviceRequest) => Promise<FileManagerEjectDeviceResult>;
  readonly readFavorites: () => Promise<FileManagerFavoritesPayload>;
  readonly writeFavorites: (payload: FileManagerFavoritesPayload) => Promise<FileManagerFavoritesPayload>;
  readonly readRecentLocations: () => Promise<FileManagerRecentLocationsPayload>;
  readonly writeRecentLocations: (
    payload: FileManagerRecentLocationsPayload
  ) => Promise<FileManagerRecentLocationsPayload>;
  readonly readTextFile: (request: FileReadTextRequest) => Promise<FileReadResult>;
  readonly writeTextFile: (request: FileWriteTextRequest) => Promise<FileWriteResult>;
  readonly statFile: (request: FileStatRequest) => Promise<FileStatResult>;
  readonly searchText: (request: FileSearchTextRequest) => Promise<FileSearchTextResult>;
  readonly selectAttachments: () => Promise<readonly FileManagerSelectedAttachment[]>;
  readonly selectDirectories: () => Promise<readonly FileManagerSelectedAttachment[]>;
};

export type { BrowserShellApi, BrowserShellEvent, BrowserShellMethod } from "./browser-shell-api";
export {
  isBrowserShellEvent,
  BROWSER_SHELL_EVENT_KINDS,
  BROWSER_SHELL_LAYOUT_COORDINATE_SPACE,
  BROWSER_SHELL_LAYOUT_ORIGIN,
  BROWSER_SHELL_LAYOUT_UNIT,
  BROWSER_SHELL_METHODS,
  toWorkbenchLayoutBounds
} from "./browser-shell-api";
export {
  EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT,
  WORKBENCH_BROWSER_LAYOUT_COORDINATE_SPACE,
  WORKBENCH_BROWSER_LAYOUT_ORIGIN,
  WORKBENCH_BROWSER_LAYOUT_UNIT
} from "./workbench-browser";
export type {
  LyraBrowserApi,
  LyraBrowserCdpApi,
  LyraBrowserCdpEvent,
  LyraBrowserCdpSession,
  LyraBrowserEvent,
  LyraBrowserRendererApi,
  LyraBrowserRendererMethod
} from "./lyra-browser-api";
export {
  isLyraBrowserEvent,
  LYRA_BROWSER_CDP_PROTOCOL_VERSION,
  LYRA_BROWSER_HOST_ONLY_METHODS,
  LYRA_BROWSER_RENDERER_METHODS
} from "./lyra-browser-api";
export {
  isLyraBrowserServiceComponentId,
  isLyraBrowserServiceName,
  LYRA_BROWSER_SERVICE_API,
  LYRA_BROWSER_SERVICE_CDP_INSPECTOR,
  LYRA_BROWSER_SERVICE_CDP_PROTOCOL_VERSION,
  LYRA_BROWSER_SERVICE_ELECTRON_ADAPTER,
  LYRA_BROWSER_SERVICE_EXCLUDED_COMPONENT_IDS,
  LYRA_BROWSER_SERVICE_NAME,
  LYRA_BROWSER_SERVICE_SPAWN_POLICY,
  LYRA_BROWSER_SERVICE_TRANSPORT
} from "./lyra-browser-service";
export {
  isLyraCoreApiDesktopKey,
  isLyraOsShellAdapterId,
  isLyraOsShellDesktopKey,
  LYRA_CORE_API_DAEMON_METHOD_PREFIXES,
  LYRA_CORE_API_DESKTOP_KEYS,
  LYRA_DAEMON_EXTRA_METHOD_PREFIXES,
  LYRA_DAEMON_METHOD_PREFIXES,
  LYRA_OS_SHELL_ADAPTER_IDS,
  LYRA_OS_SHELL_DESKTOP_KEYS,
  LYRA_OS_SHELL_ELECTRON_ADAPTERS,
  LYRA_OS_SHELL_FORBIDDEN_DAEMON_PREFIXES
} from "./core-api-os-shell";
export type {
  LyraCoreApiDesktopKey,
  LyraOsShellAdapterId,
  LyraOsShellDesktopKey
} from "./core-api-os-shell";

export type OfficePreviewRequest = {
  readonly path: string;
};

export type OfficePreviewResult = {
  readonly format: "pdf" | "docx" | "xlsx" | "pptx";
  readonly title: string;
  readonly sourceUrl: string;
  readonly byteLength: number;
};

export type OfficeReadRequest = {
  readonly path: string;
};

export type OfficeDocxBlock = {
  readonly index: number;
  readonly type: string;
  readonly preview: string;
};

export type OfficeDocxComment = {
  readonly id: string;
  readonly text: string;
  readonly author?: string;
  readonly parentId?: string;
  readonly blockIndex?: number;
};

export type OfficeDocxNote = {
  readonly kind: "footnote" | "endnote";
  readonly id: string;
  readonly text: string;
  readonly blockIndex?: number;
};

export type OfficeDocxHeaderFooter = {
  readonly header: string;
  readonly footer: string;
  readonly headerFirst: string | null;
  readonly footerFirst: string | null;
  readonly headerEven: string | null;
  readonly footerEven: string | null;
};

export type OfficeDocxRevision = {
  readonly id: string;
  readonly type: string;
  readonly blockIndex: number;
  readonly text: string;
  readonly author: string;
  readonly date?: string;
  readonly change?: string;
};

export type OfficeDocxStyle = {
  readonly styleId: string;
  readonly name: string;
  readonly type: string;
  readonly headingLevel?: number;
};

export type OfficeDocxSection = {
  readonly index: number;
  readonly firstBlock: number;
  readonly lastBlock: number;
  readonly summary: string;
};

export type OfficeXlsxCell = {
  readonly address: string;
  readonly value: string | number | boolean | null;
  readonly formula?: string;
};

export type OfficeXlsxSheet = {
  readonly name: string;
  readonly cells: readonly OfficeXlsxCell[];
};

export type OfficeXlsxChart = {
  readonly path: string;
  readonly sheet: string | null;
};

export type OfficeXlsxName = {
  readonly name: string;
  readonly ref: string;
};

export type OfficeXlsxCheck = {
  readonly code: "formula_error";
  readonly sheet: string;
  readonly address: string;
  readonly message: string;
};

export type OfficePptxBox = {
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
};

export type OfficePptxElement = {
  readonly id: string;
  readonly type: string;
  readonly preview: string;
  readonly x: number;
  readonly y: number;
  readonly cx: number;
  readonly cy: number;
};

export type OfficePptxIssue = {
  readonly code: string;
  readonly el: string;
  readonly message: string;
  readonly suggest?: {
    readonly op: "setTransform";
    readonly target: { readonly slide: number | string; readonly el: string };
    readonly box: OfficePptxBox;
    readonly rotDeg?: number;
  };
};

export type OfficePptxSlide = {
  readonly index: number;
  readonly notes?: string;
  readonly elements: readonly OfficePptxElement[];
  readonly issues: readonly OfficePptxIssue[];
};

export type OfficeReadResult =
  | {
    readonly format: "docx";
    readonly blocks: readonly OfficeDocxBlock[];
    readonly comments: readonly OfficeDocxComment[];
    readonly notes: readonly OfficeDocxNote[];
    readonly headerFooter: OfficeDocxHeaderFooter;
    readonly revisions: readonly OfficeDocxRevision[];
    readonly sections: readonly OfficeDocxSection[];
    readonly styles: readonly OfficeDocxStyle[];
  }
  | {
    readonly format: "xlsx";
    readonly truncated: boolean;
    readonly sheets: readonly OfficeXlsxSheet[];
    readonly charts: readonly OfficeXlsxChart[];
    readonly names: readonly OfficeXlsxName[];
    readonly checks?: readonly OfficeXlsxCheck[];
  }
  | {
    readonly format: "pptx";
    readonly slides: readonly OfficePptxSlide[];
  };

export type OfficeApplyRequest = {
  readonly path: string;
  readonly ops: readonly unknown[];
};

export type OfficeApplyResult = {
  readonly format: "docx" | "xlsx" | "pptx";
  readonly applied: number;
  readonly written: boolean;
};

export type OfficeApi = {
  readonly preview: (request: OfficePreviewRequest) => Promise<OfficePreviewResult>;
  readonly read: (request: OfficeReadRequest) => Promise<OfficeReadResult>;
  readonly apply: (request: OfficeApplyRequest) => Promise<OfficeApplyResult>;
};

export type SqliteInspectRequest = {
  readonly path: string;
  readonly table?: string;
};

export type SqliteCell = string | number | null;

export type SqliteInspectResult = {
  readonly tables: readonly { readonly name: string }[];
  readonly table: string | null;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqliteCell[])[];
  readonly truncated: boolean;
};

export type SqliteApi = {
  readonly inspect: (request: SqliteInspectRequest) => Promise<SqliteInspectResult>;
};

export type ImageViewerApi = {
  readonly openImage: (request: ImageViewerOpenRequest) => Promise<ImageViewerOpenResult>;
  readonly readTile: (request: ImageViewerReadTileRequest) => Promise<ImageViewerTileResponse>;
  readonly closeSession: (request: ImageViewerCloseSessionRequest) => Promise<void>;
  readonly onEvent: (listener: (event: ImageViewerEvent) => void) => () => void;
};

export type TerminalApi = {
  readonly createSession: (request: TerminalCreateRequest) => Promise<TerminalSessionSnapshot>;
  readonly attachRenderer?: (request: TerminalRendererAttachRequest) => Promise<TerminalRendererAttachResponse>;
  readonly detachRenderer?: (request: TerminalRendererDetachRequest) => Promise<void>;
  readonly ackData?: (request: TerminalDataAckRequest) => Promise<void>;
  readonly reloadPrompt: (request: TerminalReloadPromptRequest) => Promise<TerminalReloadPromptResult>;
  readonly writeFast?: (request: TerminalWriteRequest) => boolean;
  readonly write: (request: TerminalWriteRequest) => Promise<void>;
  readonly read: (request: TerminalReadRequest) => Promise<TerminalReadResponse>;
  readonly evaluatePermission?: (
    request: TerminalPermissionEvaluateRequest
  ) => Promise<TerminalPermissionEvaluateResponse>;
  readonly respondPermission?: (
    request: TerminalPermissionRespondRequest
  ) => Promise<TerminalPermissionRespondResponse>;
  readonly readProcesses?: (
    request: TerminalProcessesReadRequest
  ) => Promise<TerminalProcessesReadResponse>;
  readonly signalProcess?: (
    request: TerminalProcessSignalRequest
  ) => Promise<TerminalProcessSignalResponse>;
  readonly resize: (request: TerminalResizeRequest) => Promise<void>;
  readonly closeSession: (request: TerminalCloseRequest) => Promise<void>;
  readonly onData: (listener: (event: TerminalDataEvent) => void) => () => void;
  readonly onExit: (listener: (event: TerminalExitEvent) => void) => () => void;
  readonly onError: (listener: (event: TerminalErrorEvent) => void) => () => void;
  readonly onCwdChanged?: (listener: (event: TerminalCwdChangedEvent) => void) => () => void;
};

export type LspInspectTypeScriptConfigRequest = {
  readonly filePath: string;
  readonly content: string;
};

export type LspInspectProjectProblemsRequest = {
  readonly rootPath: string;
};

export type LspApi = {
  readonly openDocument: (request: LspDocumentRequest) => Promise<void>;
  readonly changeDocument: (request: LspDocumentRequest) => Promise<void>;
  readonly saveDocument: (request: LspDocumentRequest) => Promise<void>;
  readonly closeDocument: (request: LspDocumentRequest) => Promise<void>;
  readonly completion: (request: LspCompletionRequest) => Promise<LspCompletionResult>;
  readonly hover: (request: LspPositionRequest) => Promise<LspHoverResult | null>;
  readonly gotoDefinition: (request: LspPositionRequest) => Promise<readonly LspLocation[]>;
  readonly findReferences: (request: LspPositionRequest) => Promise<readonly LspLocation[]>;
  readonly inspectTypeScriptConfig?: (
    request: LspInspectTypeScriptConfigRequest
  ) => Promise<void>;
  readonly inspectProjectProblems?: (
    request: LspInspectProjectProblemsRequest
  ) => Promise<void>;
  readonly onEvent: (listener: (event: LspRuntimeEvent) => void) => () => void;
};

export type WorkbenchStateKey =
  | "preferences"
  | "workspace-tabs"
  | "browser-session"
  | "browser-history"
  | "ai-panel-tabs"
  | "terminal-dock"
  | "notifications"
  | "layout"
  | "location";

export type WorkbenchStateSnapshot = Readonly<Record<WorkbenchStateKey, string | null>>;

export type WorkbenchStateChangeEvent = {
  readonly key: WorkbenchStateKey;
  readonly json: string | null;
};

export type WorkbenchStateApi = {
  readonly readCached: (key: WorkbenchStateKey) => string | null;
  readonly read: (key: WorkbenchStateKey) => Promise<string | null>;
  readonly write: (key: WorkbenchStateKey, json: string) => Promise<void>;
  readonly remove: (key: WorkbenchStateKey) => Promise<void>;
  readonly onDidChange: (listener: (event: WorkbenchStateChangeEvent) => void) => () => void;
};

export type IdentityIconSnapshot = {
  readonly url: string;
  readonly source: "user" | "project";
  readonly label?: string;
  readonly path?: string;
  readonly updatedAt?: string;
};

export type ProjectIdentityResolveRequest = {
  readonly path: string;
};

export type ProjectIdentitySnapshot = {
  readonly rootPath: string;
  readonly name: string;
  readonly logo?: IdentityIconSnapshot | null;
};

export type IdentityApi = {
  readonly readUserIcon: () => Promise<IdentityIconSnapshot | null>;
  readonly resolveProjectIdentity: (
    request: ProjectIdentityResolveRequest
  ) => Promise<ProjectIdentitySnapshot | null>;
};

export type LocationCandidateSource = "browser" | "os" | "ip";

export type LocationCandidateStatus = "ok" | "unsupported" | "error";

export type LocationCandidate = {
  readonly id: string;
  readonly source: LocationCandidateSource;
  readonly status: LocationCandidateStatus;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly accuracyMeters?: number;
  readonly capturedAt: string;
  readonly label?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
};

export type LocationResolvedAddress = {
  readonly displayName: string;
  readonly precision:
    | "poi"
    | "house"
    | "road"
    | "neighbourhood"
    | "district"
    | "city"
    | "region"
    | "country"
    | "coordinate";
  readonly attribution?: string;
};

export type LocationResolvedCandidate = LocationCandidate & {
  readonly resolvedAddress?: LocationResolvedAddress;
};

export type LocationHostCandidatesRequest = {
  readonly locale?: string;
};

export type LocationHostCandidatesResponse = {
  readonly candidates: readonly LocationCandidate[];
};

export type LocationReverseGeocodeRequest = {
  readonly locale?: string;
  readonly candidates: readonly LocationCandidate[];
};

export type LocationReverseGeocodeResponse = {
  readonly candidates: readonly LocationResolvedCandidate[];
};

export type LocationApi = {
  readonly readHostCandidates: (
    request?: LocationHostCandidatesRequest
  ) => Promise<LocationHostCandidatesResponse>;
  readonly openSystemSettings: () => Promise<boolean>;
  readonly reverseGeocodeCandidates: (
    request: LocationReverseGeocodeRequest
  ) => Promise<LocationReverseGeocodeResponse>;
};

export type ScreenshotPreviewPresentRequest = {
  readonly imageBase64: string;
  readonly mimeType?: "image/png" | "image/jpeg";
  readonly label?: string;
  readonly source?: string;
  readonly width?: number;
  readonly height?: number;
  readonly workspaceTabId?: string;
  readonly workspaceTabTitle?: string;
  readonly workspaceTabPageKind?: string;
  readonly workspaceTabAddress?: string;
};

export type ScreenshotPreviewEvent =
  | {
      readonly kind: "presented";
      readonly previewId: string;
    }
  | {
      readonly kind: "dismissed";
      readonly previewId: string;
    }
  | {
      readonly kind: "drag-started";
      readonly previewId: string;
    };

export type ScreenshotPreviewApi = {
  readonly present: (
    request: ScreenshotPreviewPresentRequest
  ) => Promise<{ readonly previewId: string | null }>;
  readonly dismiss: () => Promise<void>;
  readonly onEvent: (listener: (event: ScreenshotPreviewEvent) => void) => () => void;
};

export type WorkbenchObservationBridgeApi = {
  readonly registerHandler: (
    handler: (
      request: WorkbenchObservationQueryRequest
    ) => Promise<WorkbenchObservationQueryResult> | WorkbenchObservationQueryResult
  ) => () => void;
};

export type SoftwareCapabilitiesBridgeApi = {
  readonly publish: (software: readonly LyraSoftwareManifest[]) => Promise<void>;
  readonly registerHandler: (
    handler: (
      request: SoftwareCapabilitiesQueryRequest
    ) => Promise<SoftwareCapabilitiesQueryResult> | SoftwareCapabilitiesQueryResult
  ) => () => void;
};

export type UiuxPacksApi = {
  readonly listPacks: () => Promise<UiuxListPacksResponse>;
  readonly installFromLocal: (request: UiuxInstallFromLocalRequest) => Promise<InstalledUiuxPack>;
  readonly installFromGit: (request: UiuxInstallFromGitRequest) => Promise<InstalledUiuxPack>;
  readonly installFromNpm: (request: UiuxInstallFromNpmRequest) => Promise<InstalledUiuxPack>;
  readonly setTrustState: (request: UiuxSetTrustStateRequest) => Promise<InstalledUiuxPack>;
  readonly uninstall: (request: UiuxUninstallRequest) => Promise<UiuxUninstallResponse>;
  readonly requestActivation: (
    request: UiuxRequestActivationRequest
  ) => Promise<UiuxRequestActivationResponse>;
  readonly resolveRuntime: (request: UiuxResolveRuntimeRequest) => Promise<UiuxPackRuntime | null>;
};

export type DetectedEditor = { id: string; label: string; icon?: string };
export type OpenInEditorRequest = { editorId: string; path: string };

export type I18nApi = {
  readonly readLocalBundles: () => Promise<Readonly<Record<string, Record<string, string>>>>;
  readonly readLanguageBundles: () => Promise<{
    readonly directions?: Readonly<Record<string, "ltr" | "rtl">>;
    readonly managed: Readonly<Record<string, Record<string, string>>>;
    readonly local: Readonly<Record<string, Record<string, string>>>;
  }>;
};

export type LanguagePacksApi = {
  readonly listCatalog: () => Promise<LanguagePackCatalogResponse>;
  readonly listInstalled: () => Promise<readonly InstalledLanguagePack[]>;
  readonly install: (locale: string) => Promise<InstalledLanguagePack>;
  readonly uninstall: (locale: string) => Promise<void>;
  readonly checkForUpdates: () => Promise<LanguagePackCatalogResponse>;
  readonly onChanged: (listener: (event: LanguagePackChangeEvent) => void) => () => void;
};

export type ComponentVersionSummary = {
  readonly version: string;
  readonly installedAt: string;
  readonly target: string;
};

export type ComponentSummary = {
  readonly componentId: string;
  readonly kind: ComponentKindV1;
  readonly active?: string;
  readonly previous?: string;
  readonly pending?: string;
  readonly versions: readonly ComponentVersionSummary[];
};

export type CoreProjectionStatus = {
  readonly state: "idle" | "pending" | "spawned" | "completed" | "failed";
  readonly componentId: "lyra.core";
  readonly pendingVersion?: string;
  readonly requestId?: string;
  readonly error?: string;
  readonly relaunched?: boolean;
};

export type ComponentActivationResponse = ComponentSummary & {
  readonly status?: "activated" | "restart-required";
  readonly restartRequired?: boolean;
  readonly coreProjection?: CoreProjectionStatus;
};

export type ComponentInstallFromDirectoryRequest = {
  readonly path: string;
};

export type ComponentResolveAppModuleRequest = {
  readonly componentId: string;
  readonly version: string;
};

export type ComponentAppModuleRuntime = ComponentResolveAppModuleRequest & {
  readonly entryUrl: string;
  readonly permissions: readonly string[];
};

export type ComponentVersionRequest = {
  readonly componentId: string;
  readonly version: string;
};

export type ComponentActivationRisk =
  | "publisher-change"
  | "permission-increase"
  | "host-api-major-change"
  | "component-major-change"
  | "data-migration"
  | "execution-class-change";

export type ComponentActivationAssessment = {
  readonly componentId: string;
  readonly activeVersion?: string;
  readonly pendingVersion: string;
  readonly reasons: readonly ComponentActivationRisk[];
  readonly addedPermissions: readonly string[];
  readonly requiresConfirmation: boolean;
};

export type ComponentActivateRequest = {
  readonly componentId: string;
  readonly confirmedReasons: readonly ComponentActivationRisk[];
};

export type ComponentUpdateChannel = "stable" | "preview";

export type ComponentStageUpdateRequest = {
  readonly channel: ComponentUpdateChannel;
  readonly releaseVersion?: string;
  readonly proxy?: string;
};

export type ComponentUpdateProgress = {
  readonly phase: "catalog" | "bom" | "download" | "verify" | "install" | "complete" | "cleanup";
  readonly componentId?: string;
  readonly completed: number;
  readonly total: number;
  readonly completedComponents: number;
  readonly totalComponents: number;
};

export type ComponentUpdateReport = {
  readonly releaseVersion: string;
  readonly catalogSequence: number;
  readonly target: string;
  readonly installedComponents: readonly string[];
  readonly repairedComponents: readonly string[];
  readonly stagedComponents: readonly string[];
  readonly deferredComponents: readonly string[];
};

export type ComponentLatestCheckReport = {
  readonly componentId: string;
  readonly version: string;
  readonly catalogSequence: number;
  readonly target: string;
};

export type ComponentLatestStageRequest = {
  readonly channel: ComponentUpdateChannel;
  readonly componentId: string;
  readonly proxy?: string;
};

export type ComponentsApi = {
  readonly list: () => Promise<readonly ComponentSummary[]>;
  readonly resolveAppModule: (
    request: ComponentResolveAppModuleRequest
  ) => Promise<ComponentAppModuleRuntime>;
  /** Internal first-party/dev entry; third-party installation UI remains disabled. */
  readonly installFromDirectory: (
    request: ComponentInstallFromDirectoryRequest
  ) => Promise<ComponentSummary>;
  readonly assessActivation: (componentId: string) => Promise<ComponentActivationAssessment>;
  readonly activate: (request: ComponentActivateRequest) => Promise<ComponentActivationResponse>;
  readonly rollback: (componentId: string) => Promise<ComponentSummary>;
  readonly uninstallVersion: (request: ComponentVersionRequest) => Promise<void>;
  readonly stageUpdate: (request: ComponentStageUpdateRequest) => Promise<ComponentUpdateReport>;
  readonly cancelUpdate: () => Promise<void>;
  readonly purgeStagedUpdate: () => Promise<void>;
  readonly readCoreProjectionStatus: () => Promise<CoreProjectionStatus>;
  readonly applyCore: (request: ComponentActivateRequest) => Promise<CoreProjectionStatus>;
  readonly onUpdateProgress: (listener: (progress: ComponentUpdateProgress) => void) => () => void;
};

export type ProductUninstallProgress = {
  readonly phase: "files" | "shortcuts" | "registry" | "complete";
  readonly completed: number;
  readonly total: number;
  readonly label?: string;
};

export type ProductUninstallApi = {
  readonly run: (request: { readonly removeUserData: boolean }) => Promise<void>;
  readonly onProgress: (listener: (progress: ProductUninstallProgress) => void) => () => void;
  readonly onOpenRequested: (listener: () => void) => () => void;
  readonly registerEntry: () => Promise<void>;
};

export type {
  AuthApi,
  AuthLocalIdentity,
  AuthProfile,
  AuthProfileUpdate,
  AuthSnapshot,
  AuthUser
};

export type LyraDesktopApi = {
  readonly windowControls: WindowControlsApi;
  readonly appMeta: AppMetaPayload;
  readonly shellEvents: ShellEventsApi;
  readonly screenshotPreview: ScreenshotPreviewApi;
  readonly openExternal: (url: string) => Promise<boolean>;
  readonly detectEditors: () => Promise<DetectedEditor[]>;
  readonly openInEditor: (request: OpenInEditorRequest) => Promise<boolean>;
  readonly revealInFolder: (path: string) => Promise<boolean>;
  readonly identity?: IdentityApi;
  readonly systemNotifications?: SystemNotificationsApi;
  readonly productAnnouncements?: ProductAnnouncementsApi;
  readonly appUpdate?: AppUpdateApi;
  readonly linuxCompat: LinuxCompatApi;
  readonly search: SearchApi;
  readonly files: FilesApi;
  readonly downloads?: DownloadManagerApi;
  readonly imageViewer?: ImageViewerApi;
  readonly office?: OfficeApi;
  readonly sqlite?: SqliteApi;
  readonly browserShell: BrowserShellApi;
  readonly browser: LyraBrowserRendererApi;
  readonly loginManager?: LoginManagerApi;
  readonly sensitiveValues?: LyraSensitiveValueApi;
  readonly lsp: LspApi;
  readonly terminal: TerminalApi;
  readonly agent?: AgentApi;
  readonly workbenchObservation: WorkbenchObservationBridgeApi;
  readonly softwareCapabilities?: SoftwareCapabilitiesBridgeApi;
  readonly uiux: UiuxPacksApi;
  readonly workbenchState: WorkbenchStateApi;
  readonly location?: LocationApi;
  readonly i18n: I18nApi;
  readonly languagePacks: LanguagePacksApi;
  readonly components: ComponentsApi;
  readonly productUninstall: ProductUninstallApi;
  readonly auth?: AuthApi;
};
