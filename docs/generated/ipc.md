# Generated Desktop IPC index

Audience: Internal
Status: Generated
Last verified: 2026-07-28

> Generated file. Do not edit by hand.
>
> Sources: `apps/desktop/src/shared/desktop-bridge.ts`.
> Regenerate with `node docs/scripts/generate-inventories.mjs`.

This is a private Electron/preload inventory, not an extension API.

Total channels: **309**.

## Groups

| Group | Count |
| --- | ---: |
| `agent` | 106 |
| `app` | 4 |
| `app-update` | 5 |
| `auth` | 7 |
| `browser-import` | 2 |
| `components` | 13 |
| `downloads` | 16 |
| `files` | 23 |
| `i18n` | 2 |
| `identity` | 2 |
| `image-viewer` | 4 |
| `language-packs` | 6 |
| `linux-compat` | 4 |
| `location` | 3 |
| `login-manager` | 8 |
| `lsp` | 11 |
| `office` | 3 |
| `persona` | 4 |
| `product-announcements` | 2 |
| `screenshot-preview` | 3 |
| `search` | 1 |
| `sensitive-values` | 5 |
| `shell` | 13 |
| `software-capabilities` | 3 |
| `sqlite` | 1 |
| `system-notifications` | 4 |
| `terminal` | 16 |
| `uiux` | 8 |
| `workbench-browser` | 23 |
| `workbench-observation` | 2 |
| `workbench-state` | 5 |

## Channels

| Shared key | Channel | Group |
| --- | --- | --- |
| `agentAccountsList` | `lyra:agent/accounts/list` | `agent` |
| `agentAccountsLogin` | `lyra:agent/accounts/login` | `agent` |
| `agentAccountsLoginComplete` | `lyra:agent/accounts/login-complete` | `agent` |
| `agentAccountsLoginProviders` | `lyra:agent/accounts/login-providers` | `agent` |
| `agentAccountsLoginStart` | `lyra:agent/accounts/login-start` | `agent` |
| `agentAccountsRemove` | `lyra:agent/accounts/remove` | `agent` |
| `agentAccountsSwitch` | `lyra:agent/accounts/switch` | `agent` |
| `agentActCacheRead` | `lyra:agent/act-cache/read` | `agent` |
| `agentActCacheUpdate` | `lyra:agent/act-cache/update` | `agent` |
| `agentPokeTrigger` | `lyra:agent/action/poke` | `agent` |
| `agentBrowserFollowRead` | `lyra:agent/browser-follow/read` | `agent` |
| `agentBrowserFollowUpdate` | `lyra:agent/browser-follow/update` | `agent` |
| `agentBrowserPreviewDismiss` | `lyra:agent/browser-preview/dismiss` | `agent` |
| `agentBrowserPreviewPromote` | `lyra:agent/browser-preview/promote` | `agent` |
| `agentBrowserPreviewRead` | `lyra:agent/browser-preview/read` | `agent` |
| `agentClarificationRespond` | `lyra:agent/clarification/respond` | `agent` |
| `agentConfigRead` | `lyra:agent/config/read` | `agent` |
| `agentConfigUpdate` | `lyra:agent/config/update` | `agent` |
| `agentElevationClear` | `lyra:agent/elevation/clear` | `agent` |
| `agentElevationSetSecret` | `lyra:agent/elevation/set-secret` | `agent` |
| `agentElevationValidate` | `lyra:agent/elevation/validate` | `agent` |
| `agentEvent` | `lyra:agent/event` | `agent` |
| `agentGitDiff` | `lyra:agent/git/diff` | `agent` |
| `agentGitDiscard` | `lyra:agent/git/discard` | `agent` |
| `agentGitStage` | `lyra:agent/git/stage` | `agent` |
| `agentGitStatus` | `lyra:agent/git/status` | `agent` |
| `agentGitUnstage` | `lyra:agent/git/unstage` | `agent` |
| `agentImageAttachmentMaterialize` | `lyra:agent/image-attachment/materialize` | `agent` |
| `agentImportDetect` | `lyra:agent/import/detect` | `agent` |
| `agentImportGetPreferences` | `lyra:agent/import/get-preferences` | `agent` |
| `agentImportListSources` | `lyra:agent/import/list-sources` | `agent` |
| `agentImportSetPreferences` | `lyra:agent/import/set-preferences` | `agent` |
| `agentImportSync` | `lyra:agent/import/sync` | `agent` |
| `agentMcpConnect` | `lyra:agent/mcp/connect` | `agent` |
| `agentMcpDisconnect` | `lyra:agent/mcp/disconnect` | `agent` |
| `agentMcpDiscoverTools` | `lyra:agent/mcp/discover-tools` | `agent` |
| `agentMcpList` | `lyra:agent/mcp/list` | `agent` |
| `agentMcpReload` | `lyra:agent/mcp/reload` | `agent` |
| `agentMcpRemove` | `lyra:agent/mcp/remove` | `agent` |
| `agentMcpSetEnabled` | `lyra:agent/mcp/set-enabled` | `agent` |
| `agentMcpUpsert` | `lyra:agent/mcp/upsert` | `agent` |
| `agentMemoryAudit` | `lyra:agent/memory/audit` | `agent` |
| `agentMemoryRecoverRun` | `lyra:agent/memory/recover/run` | `agent` |
| `agentMemorySharedSearch` | `lyra:agent/memory/shared/search` | `agent` |
| `agentMemorySharedUpdate` | `lyra:agent/memory/shared/update` | `agent` |
| `agentMemorySnapshot` | `lyra:agent/memory/snapshot` | `agent` |
| `agentMessageResolve` | `lyra:agent/message/resolve` | `agent` |
| `agentModelDelete` | `lyra:agent/models/delete` | `agent` |
| `agentModelEnable` | `lyra:agent/models/enable` | `agent` |
| `agentModelsList` | `lyra:agent/models/list` | `agent` |
| `agentModelRefresh` | `lyra:agent/models/refresh` | `agent` |
| `agentModelSwitch` | `lyra:agent/models/switch` | `agent` |
| `agentModelCapabilitiesUpdate` | `lyra:agent/models/update-capabilities` | `agent` |
| `agentPermissionPolicyRead` | `lyra:agent/permission-policy/read` | `agent` |
| `agentPermissionPolicySetMode` | `lyra:agent/permission-policy/set-mode` | `agent` |
| `agentPermissionRespond` | `lyra:agent/permission/respond` | `agent` |
| `agentPlanDelete` | `lyra:agent/plan/delete` | `agent` |
| `agentPlanList` | `lyra:agent/plan/list` | `agent` |
| `agentPlanRead` | `lyra:agent/plan/read` | `agent` |
| `agentPlanReviewRespond` | `lyra:agent/plan/review/respond` | `agent` |
| `agentPlanRevise` | `lyra:agent/plan/revise` | `agent` |
| `agentProjectsList` | `lyra:agent/projects/list` | `agent` |
| `agentProjectsRegister` | `lyra:agent/projects/register` | `agent` |
| `agentProjectsSetOverride` | `lyra:agent/projects/set-override` | `agent` |
| `agentProjectsSettings` | `lyra:agent/projects/settings` | `agent` |
| `agentProtocolContract` | `lyra:agent/protocol/contract` | `agent` |
| `agentProviderCatalogRead` | `lyra:agent/provider/catalog/read` | `agent` |
| `agentProviderIconResolve` | `lyra:agent/provider/icon/resolve` | `agent` |
| `agentProviderOptionsUpdate` | `lyra:agent/provider/options/update` | `agent` |
| `agentProviderProfileSave` | `lyra:agent/provider/profile/save` | `agent` |
| `agentProviderProfileSaveAndDiscover` | `lyra:agent/provider/profile/save-and-discover` | `agent` |
| `agentRollbackPreview` | `lyra:agent/rollback/preview` | `agent` |
| `agentRollbackRestore` | `lyra:agent/rollback/restore` | `agent` |
| `agentSessionArchive` | `lyra:agent/session/archive` | `agent` |
| `agentSessionBindProject` | `lyra:agent/session/bind-project` | `agent` |
| `agentSessionCreate` | `lyra:agent/session/create` | `agent` |
| `agentSessionCreateTemporary` | `lyra:agent/session/create-temporary` | `agent` |
| `agentSessionDelete` | `lyra:agent/session/delete` | `agent` |
| `agentSessionList` | `lyra:agent/session/list` | `agent` |
| `agentSessionRead` | `lyra:agent/session/read` | `agent` |
| `agentSessionRename` | `lyra:agent/session/rename` | `agent` |
| `agentSessionSave` | `lyra:agent/session/save` | `agent` |
| `agentSessionUnsave` | `lyra:agent/session/unsave` | `agent` |
| `agentSkillActivate` | `lyra:agent/skills/activate` | `agent` |
| `agentSkillDeactivate` | `lyra:agent/skills/deactivate` | `agent` |
| `agentSkillInspect` | `lyra:agent/skills/inspect` | `agent` |
| `agentSkillInstallFromGit` | `lyra:agent/skills/install-from-git` | `agent` |
| `agentSkillInstallFromLocal` | `lyra:agent/skills/install-from-local` | `agent` |
| `agentSkillInstallFromStore` | `lyra:agent/skills/install-from-store` | `agent` |
| `agentSkillsList` | `lyra:agent/skills/list` | `agent` |
| `agentSkillRefreshStore` | `lyra:agent/skills/refresh-store` | `agent` |
| `agentSkillUninstall` | `lyra:agent/skills/uninstall` | `agent` |
| `agentSkillUpdateStoreConfig` | `lyra:agent/skills/update-store-config` | `agent` |
| `agentTerminalClosePrivate` | `lyra:agent/terminal/close-private` | `agent` |
| `agentTerminalListPrivate` | `lyra:agent/terminal/list-private` | `agent` |
| `agentTodoReadProject` | `lyra:agent/todo/read-project` | `agent` |
| `agentTurnCancel` | `lyra:agent/turn/cancel` | `agent` |
| `agentTurnResume` | `lyra:agent/turn/resume` | `agent` |
| `agentTurnSend` | `lyra:agent/turn/send` | `agent` |
| `agentTurnStart` | `lyra:agent/turn/start` | `agent` |
| `agentUsageRead` | `lyra:agent/usage/read` | `agent` |
| `agentUserGateAutoResolve` | `lyra:agent/user-gate/auto-resolve` | `agent` |
| `agentUserGateCancel` | `lyra:agent/user-gate/cancel` | `agent` |
| `agentUserGateList` | `lyra:agent/user-gate/list` | `agent` |
| `agentUserGateResolve` | `lyra:agent/user-gate/resolve` | `agent` |
| `agentUserGateTouchActivity` | `lyra:agent/user-gate/touch-activity` | `agent` |
| `appRegisterUninstall` | `lyra:app/register-uninstall` | `app` |
| `appUninstallOpen` | `lyra:app/uninstall-open` | `app` |
| `appUninstallProduct` | `lyra:app/uninstall-product` | `app` |
| `appUninstallProgress` | `lyra:app/uninstall-progress` | `app` |
| `appUpdateCheck` | `lyra:app-update/check` | `app-update` |
| `appUpdateDownload` | `lyra:app-update/download` | `app-update` |
| `appUpdateInstall` | `lyra:app-update/install` | `app-update` |
| `appUpdateReadStatus` | `lyra:app-update/read-status` | `app-update` |
| `appUpdateStatusChanged` | `lyra:app-update/status-changed` | `app-update` |
| `authDeleteAccount` | `lyra:auth/delete-account` | `auth` |
| `authEvent` | `lyra:auth/event` | `auth` |
| `authGetLocalIdentity` | `lyra:auth/get-local-identity` | `auth` |
| `authGetSession` | `lyra:auth/get-session` | `auth` |
| `authLogout` | `lyra:auth/logout` | `auth` |
| `authStartGoogleLogin` | `lyra:auth/start-google-login` | `auth` |
| `authUpdateProfile` | `lyra:auth/update-profile` | `auth` |
| `browserImportListProfiles` | `lyra:browser-import/list-profiles` | `browser-import` |
| `browserImportRun` | `lyra:browser-import/run` | `browser-import` |
| `componentsActivate` | `lyra:components/activate` | `components` |
| `componentsAssessActivation` | `lyra:components/assess-activation` | `components` |
| `componentsCancelUpdate` | `lyra:components/cancel-update` | `components` |
| `componentsApplyCore` | `lyra:components/core-projection/apply` | `components` |
| `componentsCoreProjectionStatus` | `lyra:components/core-projection/status` | `components` |
| `componentsInstallFromDirectory` | `lyra:components/install-from-directory` | `components` |
| `componentsList` | `lyra:components/list` | `components` |
| `componentsPurgeStagedUpdate` | `lyra:components/purge-staged-update` | `components` |
| `componentsResolveAppModule` | `lyra:components/resolve-app-module` | `components` |
| `componentsRollback` | `lyra:components/rollback` | `components` |
| `componentsStageUpdate` | `lyra:components/stage-update` | `components` |
| `componentsUninstallVersion` | `lyra:components/uninstall-version` | `components` |
| `componentsUpdateProgress` | `lyra:components/update-progress` | `components` |
| `downloadsCancel` | `lyra:downloads/cancel` | `downloads` |
| `downloadsCancelAll` | `lyra:downloads/cancel-all` | `downloads` |
| `downloadsEnqueue` | `lyra:downloads/enqueue` | `downloads` |
| `downloadsEvent` | `lyra:downloads/event` | `downloads` |
| `downloadsList` | `lyra:downloads/list` | `downloads` |
| `downloadsOpenFile` | `lyra:downloads/open-file` | `downloads` |
| `downloadsPause` | `lyra:downloads/pause` | `downloads` |
| `downloadsPauseAll` | `lyra:downloads/pause-all` | `downloads` |
| `downloadsRemove` | `lyra:downloads/remove` | `downloads` |
| `downloadsResume` | `lyra:downloads/resume` | `downloads` |
| `downloadsResumeAll` | `lyra:downloads/resume-all` | `downloads` |
| `downloadsRetry` | `lyra:downloads/retry` | `downloads` |
| `downloadsRevealFile` | `lyra:downloads/reveal-file` | `downloads` |
| `downloadsSetPriority` | `lyra:downloads/set-priority` | `downloads` |
| `downloadsReadSettings` | `lyra:downloads/settings/read` | `downloads` |
| `downloadsUpdateSettings` | `lyra:downloads/settings/update` | `downloads` |
| `filesCreateFile` | `lyra:files/create-file` | `files` |
| `filesCreateFolder` | `lyra:files/create-folder` | `files` |
| `filesDirectoryPatch` | `lyra:files/directory-patch` | `files` |
| `filesEjectDevice` | `lyra:files/eject-device` | `files` |
| `filesEmptyTrash` | `lyra:files/empty-trash` | `files` |
| `filesMountDevice` | `lyra:files/mount-device` | `files` |
| `filesMoveToTrash` | `lyra:files/move-to-trash` | `files` |
| `filesReadDirectory` | `lyra:files/read-directory` | `files` |
| `filesReadFavorites` | `lyra:files/read-favorites` | `files` |
| `filesReadHome` | `lyra:files/read-home` | `files` |
| `filesReadRecentLocations` | `lyra:files/read-recent-locations` | `files` |
| `filesReadTextFile` | `lyra:files/read-text-file` | `files` |
| `filesReadTrash` | `lyra:files/read-trash` | `files` |
| `filesRestoreFromTrash` | `lyra:files/restore-from-trash` | `files` |
| `filesSearchText` | `lyra:files/search-text` | `files` |
| `filesSelectAttachments` | `lyra:files/select-attachments` | `files` |
| `filesSelectDirectories` | `lyra:files/select-directories` | `files` |
| `filesStatFile` | `lyra:files/stat-file` | `files` |
| `filesSubscribeDirectory` | `lyra:files/subscribe-directory` | `files` |
| `filesUnsubscribeDirectory` | `lyra:files/unsubscribe-directory` | `files` |
| `filesWriteFavorites` | `lyra:files/write-favorites` | `files` |
| `filesWriteRecentLocations` | `lyra:files/write-recent-locations` | `files` |
| `filesWriteTextFile` | `lyra:files/write-text-file` | `files` |
| `i18nReadLanguageBundles` | `lyra:i18n/read-language-bundles` | `i18n` |
| `i18nReadLocalBundles` | `lyra:i18n/read-local-bundles` | `i18n` |
| `identityReadUserIcon` | `lyra:identity/read-user-icon` | `identity` |
| `identityResolveProject` | `lyra:identity/resolve-project` | `identity` |
| `imageViewerCloseSession` | `lyra:image-viewer/close-session` | `image-viewer` |
| `imageViewerEvent` | `lyra:image-viewer/event` | `image-viewer` |
| `imageViewerOpenImage` | `lyra:image-viewer/open-image` | `image-viewer` |
| `imageViewerReadTile` | `lyra:image-viewer/read-tile` | `image-viewer` |
| `languagePacksChanged` | `lyra:language-packs/changed` | `language-packs` |
| `languagePacksCheckForUpdates` | `lyra:language-packs/check-for-updates` | `language-packs` |
| `languagePacksInstall` | `lyra:language-packs/install` | `language-packs` |
| `languagePacksListCatalog` | `lyra:language-packs/list-catalog` | `language-packs` |
| `languagePacksListInstalled` | `lyra:language-packs/list-installed` | `language-packs` |
| `languagePacksUninstall` | `lyra:language-packs/uninstall` | `language-packs` |
| `linuxCompatReadConfig` | `lyra:linux-compat/read-config` | `linux-compat` |
| `linuxCompatReadStatus` | `lyra:linux-compat/read-status` | `linux-compat` |
| `linuxCompatRestart` | `lyra:linux-compat/restart` | `linux-compat` |
| `linuxCompatUpdateConfig` | `lyra:linux-compat/update-config` | `linux-compat` |
| `locationOpenSystemSettings` | `lyra:location/open-system-settings` | `location` |
| `locationReadHostCandidates` | `lyra:location/read-host-candidates` | `location` |
| `locationReverseGeocodeCandidates` | `lyra:location/reverse-geocode-candidates` | `location` |
| `loginManagerClearSite` | `lyra:login-manager/clear-site` | `login-manager` |
| `loginManagerDeleteCredential` | `lyra:login-manager/delete-credential` | `login-manager` |
| `loginManagerEvent` | `lyra:login-manager/event` | `login-manager` |
| `loginManagerFillCredential` | `lyra:login-manager/fill-credential` | `login-manager` |
| `loginManagerList` | `lyra:login-manager/list` | `login-manager` |
| `loginManagerRevealCredential` | `lyra:login-manager/reveal-credential` | `login-manager` |
| `loginManagerSetCredentialCaptureEnabled` | `lyra:login-manager/set-credential-capture-enabled` | `login-manager` |
| `loginManagerUpdateSession` | `lyra:login-manager/update-session` | `login-manager` |
| `lspChangeDocument` | `lyra:lsp/change-document` | `lsp` |
| `lspCloseDocument` | `lyra:lsp/close-document` | `lsp` |
| `lspCompletion` | `lyra:lsp/completion` | `lsp` |
| `lspEvent` | `lyra:lsp/event` | `lsp` |
| `lspFindReferences` | `lyra:lsp/find-references` | `lsp` |
| `lspGotoDefinition` | `lyra:lsp/goto-definition` | `lsp` |
| `lspHover` | `lyra:lsp/hover` | `lsp` |
| `lspInspectProjectProblems` | `lyra:lsp/inspect-project-problems` | `lsp` |
| `lspInspectTypeScriptConfig` | `lyra:lsp/inspect-typescript-config` | `lsp` |
| `lspOpenDocument` | `lyra:lsp/open-document` | `lsp` |
| `lspSaveDocument` | `lyra:lsp/save-document` | `lsp` |
| `officeApply` | `lyra:office/apply` | `office` |
| `officePreview` | `lyra:office/preview` | `office` |
| `officeRead` | `lyra:office/read` | `office` |
| `personaConsentRead` | `lyra:persona/consent/read` | `persona` |
| `personaConsentWrite` | `lyra:persona/consent/write` | `persona` |
| `personaRefresh` | `lyra:persona/refresh` | `persona` |
| `personaStatus` | `lyra:persona/status` | `persona` |
| `productAnnouncementsChanged` | `lyra:product-announcements/changed` | `product-announcements` |
| `productAnnouncementsRead` | `lyra:product-announcements/read` | `product-announcements` |
| `screenshotPreviewDismiss` | `lyra:screenshot-preview/dismiss` | `screenshot-preview` |
| `screenshotPreviewEvent` | `lyra:screenshot-preview/event` | `screenshot-preview` |
| `screenshotPreviewPresent` | `lyra:screenshot-preview/present` | `screenshot-preview` |
| `resolveWebSearchEngine` | `lyra:search/resolve-web-engine` | `search` |
| `sensitiveValuesDelete` | `lyra:sensitive-values/delete` | `sensitive-values` |
| `sensitiveValuesReadStatus` | `lyra:sensitive-values/read-status` | `sensitive-values` |
| `sensitiveValuesRevealToUser` | `lyra:sensitive-values/reveal-to-user` | `sensitive-values` |
| `sensitiveValuesStatusChanged` | `lyra:sensitive-values/status-changed` | `sensitive-values` |
| `sensitiveValuesStore` | `lyra:sensitive-values/store` | `sensitive-values` |
| `readAppMeta` | `lyra:shell/app/meta` | `shell` |
| `readAppMetaSync` | `lyra:shell/app/meta-sync` | `shell` |
| `detectEditors` | `lyra:shell/detect-editors` | `shell` |
| `openExternal` | `lyra:shell/open-external` | `shell` |
| `openInEditor` | `lyra:shell/open-in-editor` | `shell` |
| `revealInFolder` | `lyra:shell/reveal-in-folder` | `shell` |
| `closeWindow` | `lyra:shell/window/close` | `shell` |
| `minimizeWindow` | `lyra:shell/window/minimize` | `shell` |
| `readWindowTheme` | `lyra:shell/window/read-theme` | `shell` |
| `setWindowThemeSource` | `lyra:shell/window/set-theme-source` | `shell` |
| `windowStateChanged` | `lyra:shell/window/state-changed` | `shell` |
| `windowThemeChanged` | `lyra:shell/window/theme-changed` | `shell` |
| `toggleWindowMaximize` | `lyra:shell/window/toggle-maximize` | `shell` |
| `softwareCapabilitiesQuery` | `lyra:software-capabilities/query` | `software-capabilities` |
| `softwareCapabilitiesQueryResult` | `lyra:software-capabilities/query-result` | `software-capabilities` |
| `softwareCapabilitiesSnapshot` | `lyra:software-capabilities/snapshot` | `software-capabilities` |
| `sqliteInspect` | `lyra:sqlite/inspect` | `sqlite` |
| `systemNotificationsActivated` | `lyra:system-notifications/activated` | `system-notifications` |
| `systemNotificationsOpenSettings` | `lyra:system-notifications/open-settings` | `system-notifications` |
| `systemNotificationsReadStatus` | `lyra:system-notifications/read-status` | `system-notifications` |
| `systemNotificationsShow` | `lyra:system-notifications/show` | `system-notifications` |
| `terminalAckData` | `lyra:terminal/ack-data` | `terminal` |
| `terminalAttachRenderer` | `lyra:terminal/attach-renderer` | `terminal` |
| `terminalCloseSession` | `lyra:terminal/close-session` | `terminal` |
| `terminalConnectDataPort` | `lyra:terminal/connect-data-port` | `terminal` |
| `terminalCreateSession` | `lyra:terminal/create-session` | `terminal` |
| `terminalDataPort` | `lyra:terminal/data-port` | `terminal` |
| `terminalDetachRenderer` | `lyra:terminal/detach-renderer` | `terminal` |
| `terminalEvent` | `lyra:terminal/event` | `terminal` |
| `terminalPermissionsEvaluate` | `lyra:terminal/permissions/evaluate` | `terminal` |
| `terminalPermissionsRespond` | `lyra:terminal/permissions/respond` | `terminal` |
| `terminalProcessesRead` | `lyra:terminal/processes/read` | `terminal` |
| `terminalProcessesSignal` | `lyra:terminal/processes/signal` | `terminal` |
| `terminalReadSession` | `lyra:terminal/read-session` | `terminal` |
| `terminalReloadPrompt` | `lyra:terminal/reload-prompt` | `terminal` |
| `terminalResizeSession` | `lyra:terminal/resize-session` | `terminal` |
| `terminalWriteSession` | `lyra:terminal/write-session` | `terminal` |
| `uiuxInstallFromGit` | `lyra:uiux/install-from-git` | `uiux` |
| `uiuxInstallFromLocal` | `lyra:uiux/install-from-local` | `uiux` |
| `uiuxInstallFromNpm` | `lyra:uiux/install-from-npm` | `uiux` |
| `uiuxListPacks` | `lyra:uiux/list-packs` | `uiux` |
| `uiuxRequestActivation` | `lyra:uiux/request-activation` | `uiux` |
| `uiuxResolveRuntime` | `lyra:uiux/resolve-runtime` | `uiux` |
| `uiuxSetTrustState` | `lyra:uiux/set-trust-state` | `uiux` |
| `uiuxUninstall` | `lyra:uiux/uninstall` | `uiux` |
| `workbenchBrowserCapturePage` | `lyra:workbench-browser/capture-page` | `workbench-browser` |
| `workbenchBrowserCaptureWindow` | `lyra:workbench-browser/capture-window` | `workbench-browser` |
| `workbenchBrowserClearSiteData` | `lyra:workbench-browser/clear-site-data` | `workbench-browser` |
| `workbenchBrowserConsumePageDragCitation` | `lyra:workbench-browser/consume-page-drag-citation` | `workbench-browser` |
| `workbenchBrowserEvent` | `lyra:workbench-browser/event` | `workbench-browser` |
| `workbenchBrowserExecutePageContextAction` | `lyra:workbench-browser/execute-page-context-action` | `workbench-browser` |
| `workbenchBrowserGoBack` | `lyra:workbench-browser/go-back` | `workbench-browser` |
| `workbenchBrowserGoForward` | `lyra:workbench-browser/go-forward` | `workbench-browser` |
| `workbenchBrowserNavigate` | `lyra:workbench-browser/navigate` | `workbench-browser` |
| `workbenchBrowserPageDragCitation` | `lyra:workbench-browser/page-drag-citation` | `workbench-browser` |
| `workbenchBrowserReadActivePageDragCitation` | `lyra:workbench-browser/read-active-page-drag-citation` | `workbench-browser` |
| `workbenchBrowserReadPageState` | `lyra:workbench-browser/read-page-state` | `workbench-browser` |
| `workbenchBrowserReadSessionSnapshot` | `lyra:workbench-browser/read-session-snapshot` | `workbench-browser` |
| `workbenchBrowserReadStorageState` | `lyra:workbench-browser/read-storage-state` | `workbench-browser` |
| `workbenchBrowserReload` | `lyra:workbench-browser/reload` | `workbench-browser` |
| `workbenchBrowserResolvePageTabId` | `lyra:workbench-browser/resolve-page-tab-id` | `workbench-browser` |
| `workbenchBrowserSearchInPage` | `lyra:workbench-browser/search-in-page` | `workbench-browser` |
| `workbenchBrowserSetChromePopover` | `lyra:workbench-browser/set-chrome-popover` | `workbench-browser` |
| `workbenchBrowserSetElementPickerMode` | `lyra:workbench-browser/set-element-picker-mode` | `workbench-browser` |
| `workbenchBrowserSetModalOcclusion` | `lyra:workbench-browser/set-modal-occlusion` | `workbench-browser` |
| `workbenchBrowserStop` | `lyra:workbench-browser/stop` | `workbench-browser` |
| `workbenchBrowserSyncLayout` | `lyra:workbench-browser/sync-layout` | `workbench-browser` |
| `workbenchBrowserSyncTopology` | `lyra:workbench-browser/sync-topology` | `workbench-browser` |
| `workbenchObservationQuery` | `lyra:workbench-observation/query` | `workbench-observation` |
| `workbenchObservationQueryResult` | `lyra:workbench-observation/query-result` | `workbench-observation` |
| `workbenchStateBootstrapSnapshot` | `lyra:workbench-state/bootstrap-snapshot` | `workbench-state` |
| `workbenchStateChanged` | `lyra:workbench-state/changed` | `workbench-state` |
| `workbenchStateRead` | `lyra:workbench-state/read` | `workbench-state` |
| `workbenchStateRemove` | `lyra:workbench-state/remove` | `workbench-state` |
| `workbenchStateWrite` | `lyra:workbench-state/write` | `workbench-state` |
