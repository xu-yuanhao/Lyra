# Generated module index

Audience: Internal
Status: Generated
Last verified: 2026-07-28

> Generated file. Do not edit by hand.
>
> Sources: `Cargo.toml`, `apps/*/package.json`, `services/*/package.json`, `packages/*/package.json`, `web/*/package.json`, `apps/desktop/src/main`, `apps/desktop/src/modules/workbench`.
> Regenerate with `node docs/scripts/generate-inventories.mjs`.

This index lists build workspaces and first-level Desktop ownership modules.
It does not define a public package API.

## Rust workspace (24)

| Package | Location |
| --- | --- |
| `lyra-accessibility-napi` | `crates/lyra-accessibility-napi` |
| `lyra-agent-api` | `crates/lyra-agent-api` |
| `lyra-agent-kernel` | `crates/lyra-agent-kernel` |
| `lyra-agent-plugins` | `crates/lyra-agent-plugins` |
| `lyra-agent-reader` | `crates/lyra-agent-reader` |
| `lyra-agent-runtime` | `crates/lyra-agent-runtime` |
| `lyra-bootstrap-core` | `crates/lyra-bootstrap-core` |
| `lyra-bootstrap-installer` | `crates/lyra-bootstrap-installer` |
| `lyra-cli` | `crates/lyra-cli` |
| `lyra-computer-use-core` | `crates/lyra-computer-use-core` |
| `lyra-docs-core` | `crates/lyra-docs-core` |
| `lyra-docs-napi` | `crates/lyra-docs-napi` |
| `lyra-download-core` | `crates/lyra-download-core` |
| `lyra-files-core` | `crates/lyra-files-core` |
| `lyra-files-napi` | `crates/lyra-files-napi` |
| `lyra-image-core` | `crates/lyra-image-core` |
| `lyra-image-napi` | `crates/lyra-image-napi` |
| `lyra-lsp-core` | `crates/lyra-lsp-core` |
| `lyra-process-lifecycle-core` | `crates/lyra-process-lifecycle-core` |
| `lyra-runtime-protocol` | `crates/lyra-runtime-protocol` |
| `lyra-terminal-core` | `crates/lyra-terminal-core` |
| `lyra-tool-fs-core` | `crates/lyra-tool-fs-core` |
| `lyra-wasi-host` | `crates/lyra-wasi-host` |
| `lyrad` | `crates/lyrad` |

## JavaScript workspaces (21)

| Package | Location | Private |
| --- | --- | --- |
| `@lyra/desktop` | `apps/desktop` | yes |
| `@lyra/app-agent` | `apps/lyra-agent` | yes |
| `@lyra/app-browser` | `apps/lyra-browser` | yes |
| `@lyra/app-credentials` | `apps/lyra-credentials` | yes |
| `@lyra/app-downloads` | `apps/lyra-downloads` | yes |
| `@lyra/app-editor` | `apps/lyra-editor` | yes |
| `@lyra/app-files` | `apps/lyra-files` | yes |
| `@lyra/app-images` | `apps/lyra-images` | yes |
| `@lyra/app-notifications` | `apps/lyra-notifications` | yes |
| `@lyra/app-office` | `apps/lyra-office` | yes |
| `@lyra/app-terminal` | `apps/lyra-terminal` | yes |
| `@lyra/app-runtime` | `packages/app-runtime` | yes |
| `@lyra/first-party-app-kit` | `packages/first-party-app-kit` | yes |
| `@lyra/icons` | `packages/icons` | yes |
| `@lyra/markdown-render` | `packages/markdown-render` | yes |
| `@lyra/office-render` | `packages/office-render` | yes |
| `@lyra/workbench-ui-runtime` | `packages/workbench-ui-runtime` | yes |
| `@lyra/browser-automation` | `services/browser-automation` | yes |
| `@lyra/control-plane` | `services/control-plane` | yes |
| `@lyra/docs-web` | `web/docs` | yes |
| `@lyra/site` | `web/site` | yes |

## Electron main service directories (40)

`accessibility`, `agent`, `auth`, `auto-update`, `browser-import`, `component-update`, `components`, `documents`, `download-manager`, `events`, `files`, `identity`, `image-viewer`, `language-packs`, `linux-compat`, `location`, `login-manager`, `lsp`, `office`, `persona`, `product-announcements`, `product-uninstall`, `runtime`, `runtime-update`, `screenshot-preview`, `search`, `sensitive-values`, `shared-process`, `shell`, `sqlite`, `storage`, `system-notifications`, `terminal`, `tests`, `third-party-apps`, `uiux-packs`, `workbench-browser`, `workbench-documents`, `workbench-observation`, `workbench-state`

## Workbench business modules (51)

`activity-dock`, `agent-git`, `agent-plan-board`, `agent-project-tree`, `agent-session-history`, `agent-session-view-model`, `agent-subagent`, `ai-panel`, `bottom-aux`, `brand`, `browser-history`, `browser-search`, `browser-tabs`, `config`, `context-menu`, `file-editor`, `file-manager`, `file-preview`, `gateway`, `global-dialog`, `i18n`, `identity`, `image-viewer`, `interaction-policy`, `layout`, `login-manager`, `notifications`, `observation`, `office-viewer`, `preferences`, `settings-ai`, `settings-downloads`, `settings-import`, `settings-projects`, `shell`, `sidebar`, `software-capabilities`, `software-store`, `sqlite-viewer`, `state-storage`, `syntax`, `tabs`, `terminal-dock`, `terminal-profiles`, `text-metrics`, `theme`, `ui-platform`, `ui-primitives`, `ui-style`, `workspace-apps`, `workspace-tabs`
