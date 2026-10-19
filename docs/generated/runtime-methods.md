# Generated runtime method index

Audience: Internal
Status: Generated
Last verified: 2026-07-28

> Generated file. Do not edit by hand.
>
> Sources: `crates/lyra-runtime-protocol/src/methods.rs`, `crates/lyrad/src/router.rs`, `crates/lyrad/src/handlers.rs`, `crates/lyra-files-core/src/json.rs`, `crates/lyra-runtime-protocol/src/lib.rs`.
> Regenerate with `node docs/scripts/generate-inventories.mjs`.

Socket families are the waist. This list is extracted from the family table
plus quoted method names in the daemon and core crates. It is not a public SDK.

Families: **8**. Concrete methods found in source: **71**.

## Families

- `runtime.*`
- `agent.*`
- `terminal.*`
- `download.*`
- `lsp.*`
- `search.*`
- `files.*`
- `performance.*`

## Methods

- `agent.exec.run`
- `agent.import.v2`
- `agent.turn`
- `download.cancel`
- `download.cancel_all`
- `download.enqueue`
- `download.list`
- `download.pause`
- `download.pause_all`
- `download.remove`
- `download.resume`
- `download.resume_all`
- `download.retry`
- `download.set_priority`
- `download.settings.read`
- `download.settings.update`
- `files.collect_workbench_paths`
- `files.create_file`
- `files.create_folder`
- `files.directoryPatch`
- `files.eject_device`
- `files.empty_trash`
- `files.list`
- `files.mount_device`
- `files.move_to_trash`
- `files.probe_workbench_path`
- `files.read_directory`
- `files.read_favorites`
- `files.read_home`
- `files.read_recent_locations`
- `files.read_text`
- `files.read_trash`
- `files.restore_from_trash`
- `files.search_text`
- `files.stat`
- `files.subscribe_directory`
- `files.unsubscribe_directory`
- `files.write_favorites`
- `files.write_recent_locations`
- `files.write_text`
- `lsp.completion`
- `lsp.diagnostics`
- `lsp.document_symbols`
- `lsp.documents.change`
- `lsp.documents.close`
- `lsp.documents.open`
- `lsp.documents.save`
- `lsp.ensure`
- `lsp.find_references`
- `lsp.goto_definition`
- `lsp.hover`
- `lsp.upsert`
- `runtime.handshake`
- `runtime.host.requests`
- `runtime.identity`
- `runtime.reload`
- `search.site.stream.cancel`
- `search.site.stream.read`
- `search.site.stream.start`
- `terminal.notReal`
- `terminal.permissions.evaluate`
- `terminal.permissions.respond`
- `terminal.processes.read`
- `terminal.processes.signal`
- `terminal.session.create`
- `terminal.sessions.close`
- `terminal.sessions.create`
- `terminal.sessions.read`
- `terminal.sessions.resize`
- `terminal.sessions.write`
- `terminal.shell.launchPlan`
