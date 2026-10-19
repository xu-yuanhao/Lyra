# Generated Host command index

Audience: Internal
Status: Generated
Last verified: 2026-07-28

> Generated file. Do not edit by hand.
>
> Sources: `apps/desktop/src/modules/workbench/workspace-apps/host-api.ts`.
> Regenerate with `node docs/scripts/generate-inventories.mjs`.

First-party page Host. Not the socket protocol and not Electron IPC.

Commands: **79**. Events: **9**.

## Commands

| Key | Command |
| --- | --- |
| `readPresentation` | `lyra.core.presentation.read` |
| `openResource` | `lyra.core.open-resource` |
| `navigate` | `lyra.core.navigate` |
| `openNestedApp` | `lyra.core.open-nested-app` |
| `openSettings` | `lyra.core.open-settings` |
| `notify` | `lyra.core.notify` |
| `executeCommand` | `lyra.core.execute-command` |
| `readNotifications` | `lyra.core.notifications.read` |
| `selectNotification` | `lyra.core.notifications.select` |
| `markAllNotificationsRead` | `lyra.core.notifications.mark-all-read` |
| `openNotificationSource` | `lyra.core.notifications.open-source` |
| `openNotificationLink` | `lyra.core.notifications.open-link` |
| `requestClearNotifications` | `lyra.core.notifications.request-clear` |
| `readImage` | `lyra.core.images.read` |
| `openImage` | `lyra.core.images.open` |
| `openAdjacentImage` | `lyra.core.images.open-adjacent` |
| `setImageViewport` | `lyra.core.images.set-viewport` |
| `resetImageViewport` | `lyra.core.images.reset-viewport` |
| `previewOffice` | `lyra.core.office.preview` |
| `readFiles` | `lyra.core.files.read` |
| `openFilesHome` | `lyra.core.files.open-home` |
| `openFilesDirectory` | `lyra.core.files.open-directory` |
| `openFilesTrash` | `lyra.core.files.open-trash` |
| `openFilesDownloads` | `lyra.core.files.open-downloads` |
| `openFilesFavorite` | `lyra.core.files.open-favorite` |
| `navigateFiles` | `lyra.core.files.navigate` |
| `setFilesPresentation` | `lyra.core.files.set-presentation` |
| `selectFilesEntry` | `lyra.core.files.select-entry` |
| `selectFilesTrashEntry` | `lyra.core.files.select-trash-entry` |
| `createFilesEntry` | `lyra.core.files.create-entry` |
| `moveFilesSelectionToTrash` | `lyra.core.files.move-selection-to-trash` |
| `restoreFilesSelection` | `lyra.core.files.restore-selection` |
| `emptyFilesTrash` | `lyra.core.files.empty-trash` |
| `toggleFilesFavorite` | `lyra.core.files.toggle-favorite` |
| `readEditor` | `lyra.core.editor.read` |
| `openEditor` | `lyra.core.editor.open` |
| `setEditorContent` | `lyra.core.editor.set-content` |
| `saveEditor` | `lyra.core.editor.save` |
| `statEditorFile` | `lyra.core.editor.stat` |
| `requestEditorCompletion` | `lyra.core.editor.complete` |
| `readBrowser` | `lyra.core.browser.read` |
| `navigateBrowser` | `lyra.core.browser.navigate` |
| `activateBrowserTab` | `lyra.core.browser.activate-tab` |
| `openBrowserTab` | `lyra.core.browser.open-tab` |
| `closeBrowserTab` | `lyra.core.browser.close-tab` |
| `goBackBrowser` | `lyra.core.browser.go-back` |
| `goForwardBrowser` | `lyra.core.browser.go-forward` |
| `reloadBrowser` | `lyra.core.browser.reload` |
| `readTerminal` | `lyra.core.terminal.read` |
| `createTerminal` | `lyra.core.terminal.create` |
| `focusTerminalPane` | `lyra.core.terminal.focus-pane` |
| `closeTerminalPane` | `lyra.core.terminal.close-pane` |
| `readTerminalSession` | `lyra.core.terminal.read-session` |
| `writeTerminalSession` | `lyra.core.terminal.write-session` |
| `readDownloads` | `lyra.core.downloads.read` |
| `enqueueDownload` | `lyra.core.downloads.enqueue` |
| `pauseDownload` | `lyra.core.downloads.pause` |
| `resumeDownload` | `lyra.core.downloads.resume` |
| `cancelDownload` | `lyra.core.downloads.cancel` |
| `retryDownload` | `lyra.core.downloads.retry` |
| `removeDownload` | `lyra.core.downloads.remove` |
| `pauseAllDownloads` | `lyra.core.downloads.pause-all` |
| `resumeAllDownloads` | `lyra.core.downloads.resume-all` |
| `cancelAllDownloads` | `lyra.core.downloads.cancel-all` |
| `openDownloadedFile` | `lyra.core.downloads.open-file` |
| `revealDownloadedFile` | `lyra.core.downloads.reveal-file` |
| `setDownloadPriority` | `lyra.core.downloads.set-priority` |
| `readCredentials` | `lyra.core.credentials.read` |
| `deleteCredential` | `lyra.core.credentials.delete` |
| `revealCredential` | `lyra.core.credentials.reveal` |
| `copyCredential` | `lyra.core.credentials.copy` |
| `fillCredential` | `lyra.core.credentials.fill` |
| `clearCredentialSite` | `lyra.core.credentials.clear-site` |
| `updateCredentialSession` | `lyra.core.credentials.update-session` |
| `setCredentialCaptureEnabled` | `lyra.core.credentials.set-capture-enabled` |
| `chromeSet` | `lyra.core.chrome.set` |
| `chromeClear` | `lyra.core.chrome.clear` |
| `chromeRead` | `lyra.core.chrome.read` |
| `workspaceResolveTab` | `lyra.core.workspace.resolve-tab` |

## Events

| Key | Event |
| --- | --- |
| `chromeChanged` | `lyra.core.chrome-changed` |
| `notificationsChanged` | `lyra.core.notifications-changed` |
| `filesChanged` | `lyra.core.files-changed` |
| `browserChanged` | `lyra.core.browser-changed` |
| `terminalChanged` | `lyra.core.terminal-changed` |
| `downloadsChanged` | `lyra.core.downloads-changed` |
| `credentialsChanged` | `lyra.core.credentials-changed` |
| `themeChanged` | `lyra.core.theme-changed` |
| `localeChanged` | `lyra.core.locale-changed` |
