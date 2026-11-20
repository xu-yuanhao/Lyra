# Workbench chrome contributions

Audience: Internal
Status: Active
Last verified: 2026-09-20

Lyra Workbench chrome (tab toolbar context, address band, AI composer meta row) follows a VS Code–like model: **Shell owns DOM**, app modules contribute **serializable descriptors** and **commands**, not arbitrary React trees.

## Contribution points

| Slot | DOM region | Scope |
|------|------------|--------|
| `toolbarContext` | `.lyra-browser-tabs-toolbar-context` | `workspaceTab` |
| `navigation` | Address / omnibox band | `workspaceTab` |
| `composerMeta` | `.lyra-agents-project-meta-row` | `aiSession` |

Global `AppShellTitlebar` window controls remain Core-owned in v1.

## Host API

- `lyra.core.chrome.set` — `{ scope, slot, ownerId, contribution }`
- `lyra.core.chrome.clear` — `{ scope, slot, ownerId }`
- `lyra.core.chrome.read` — `{ scope, slot }`
- `lyra.core.workspace.resolve-tab` — `{ instanceId }` → `{ tabId }`. Resolves
  the tab whose `appInstanceId` matches, or the host tab Core recorded when it
  mounted the instance inside a tab (Settings → Logins uses this, since the
  Logins instance is not itself a workspace tab).
- Event: `lyra.core.chrome-changed`

Types live in `@lyra/app-runtime` (`WorkbenchChromeScopeV1`, `WorkbenchChromeContributionV1`, …).

Actions render as icon buttons by default. `display: "text"` renders the
compact label button the address band uses for page-local switches, and
`active: true` marks the selected member of that switch. Use it for a section
switch a page would otherwise draw in its own body; keep icon actions for
commands.

## Module SDK

First-party packages use `useFirstPartyWorkbenchChrome(ownerId, build, deps)` from `@lyra/first-party-app-kit`. Modules must **not** call `useWorkbenchTitlebarContribution` (separate React root).

Notifications (`lyra.notifications`), Credentials (`lyra.credentials`),
and Downloads (`lyra.downloads`) are complete independent apps. Files remains
a preview route served by Core `FileManagerSurface`.

- **Surface copy** for Notifications ships in `@lyra/app-notifications`
  (`src/l10n`) and follows Host `presentation.locale`. It does not read Core
  language-pack keys such as `notification.center*`. Core chrome that is not
  the center page (topbar, clear-all confirm, publisher titles) still uses Core
  `t()`.
- **Inbox** stays a Core platform service. Publishers call `lyra.core.notify`
  (or Core `publishNotification`). Core persists at most 200 items under
  workbench-state key `notifications` and drives the topbar badge plus OS
  notifications. The center page only reads and mutates through
  `lyra.core.notifications.*`. A missing or damaged bundle shows the generic
  unavailable/repair empty state, not a second Core notification UI.
  Uninstalling `lyra.notifications` removes the center page and does not drop
  the inbox, badge, or OS notifications.
- **Surface copy** for Credentials ships in `@lyra/app-credentials`
  (`src/l10n`) and follows Host `presentation.locale`. Settings keeps the
  sidebar label `Logins` via Core `t("loginManager.title")`. The page itself
  does not read Core `loginManager.*` surface keys.
- **Vault** stays a Core platform service. Capture, fill, encrypted storage,
  and IPC remain in `apps/desktop/src/main/login-manager`. The settings Logins
  page only reads and mutates through `lyra.core.credentials.*`. A missing or
  damaged bundle shows the generic unavailable/repair empty state, not a second
  Core login list. Uninstalling `lyra.credentials` removes that settings page
  and does not drop the vault, browser fill, or capture toggle.
- **Surface copy** for Downloads ships in `@lyra/app-downloads` (`src/l10n`)
  and follows Host `presentation.locale`. Files keeps the sidebar label
  `Download Manager` via Core `t()`, and Settings keeps Downloads preferences
  as Core chrome. The Files download-task page does not read Core
  `files.download*` surface keys.
- **Engine** stays a Core platform service. aria2, the queue, open file, and
  reveal remain in Core. The Files Downloads page only reads and mutates
  through `lyra.core.downloads.*`. A missing or damaged bundle shows the
  generic unavailable/repair empty state, not a second Core task list.
  Uninstalling `lyra.downloads` removes that Files page and does not drop the
  queue, engine, or Settings preferences.

## Trust

Same boundary as `LyraHostBus`: activated installed modules, command IDs owned by `ownerId` prefix.

## Forbidden in v1

- Injecting React nodes into Shell chrome from app bundles
- Tab-strip DOM from modules (tabs stay on `workspace-tabs` model)

Navigation overrides for the active workspace tab are read via `useWorkspaceTabNavigationChrome` (`titlebar-navigation-chrome.ts`); when no module contributes `navigation`, Shell keeps the existing `useTitlebarNavigationModel` path unchanged.

See `apps/desktop/src/modules/workbench/shell/workbench-chrome-bus.ts` for merge/cleanup semantics.
