# Prompt Templates

MiniJinja templates embedded at compile time by `prompt_templates.rs`.
18 templates, assembled by `prompt_policy.rs` into a stable provider prefix and an append-only per-turn context tail.

## Architecture

Templates are layered P0–P5 and assembled by `build_system_prompt_report()` in `prompt_policy.rs`.
The provider `system` prefix contains the unconditional P0–P2 base plus `full_contract` when in full mode and only the P3 modules selected for the current scene. A scene change rotates the stable hash once.
User messages store only what the member typed plus explicit attachments. Persona, time, cwd/git, memory, and active-skill data are rebuilt each request as a short volatile system appendix immediately before the latest user message. They are never persisted onto a user row and never counted as that user's words.
Two delivery modes remain: `full` (default) and `lean-experimental`. They may have different stable prefixes. A mode or scene transition changes the prefix once; later turns with the same selection reuse the same bytes.

| Layer | Template | Delivery | Role |
|-------|----------|----------|------|
| P0 | `kernel.md.j2` | Stable prefix | Core safety, trust hierarchy, real execution, and completion evidence. Always on. |
| P0 | `design_scene.md.j2` | Stable prefix | References, reuse, consistency, and the design tools. Always on, including work that is not a UI task. |
| P1 | `project_instructions.md.j2` | Stable prefix | Project instruction files (`AGENTS.override.md` > `AGENTS.md` > `CLAUDE.md`) discovered from the working directory to the git root, nearest first, under a shared 32 KiB character budget. Always on; absent when no files are found or the session is home-bound. |
| P1 | `interaction_contract.md.j2` | Stable prefix | Blocking clarification and approval protocol. Always on. |
| P1 | `compact_contract.md.j2` | Stable prefix | Frozen observable, shared root cause, no fake delivery, LSP-first. Always on. |
| P2 | `plan_mode.md.j2` | Stable prefix | When to open Plan; Goal continuation and host-owned todos. Always on. Tool schemas and plan_gate own the rest. |
| P2 | `full_contract.md.j2` | Stable prefix when selected | Full-mode tool discovery and failure recovery. Shell parking lives on exec_command / write_stdin. |
| P3 | `browser_scene.md.j2` | Stable prefix when selected | Browser behavior. |
| P3 | `computer_scene.md.j2` | Stable prefix when selected | Computer/app control behavior. |
| P3 | `citation_scene.md.j2` | Stable prefix when selected | Transcript/page cite + attachment rules. |
| P3 | `image_scene.md.j2` | Stable prefix when selected | Vision input + image attachment rules. |
| P4 | `active_skill.md.j2` | Turn tail | Active skill prompt wrapper. Data only. |
| P4 | `memory_context.md.j2` | Turn tail | Memory projection wrapper. Data only. |
| P4 | `dynamic_context.md.j2` | Turn tail | Short env: persona, time, device, cwd, whether git, capability/permission contracts. Data only. Selects `permission_consent.md.j2`, `permission_managed.md.j2`, or `permission_autonomous.md.j2` by permission policy — behavioral consent rules, never a mode-name status. Never dumps workbench/runtime JSON. |
| P5 | `prompt_accounting.md.j2` | Internal | Token estimate + omitted section summary. Not sent to the model. |

## Identity System

The stable kernel states the role: staff at Lyra, a new graduate, taking requests that arrive from the network. Own work invented from nothing comes out like a student assignment, so the job is to look up an existing solution. Do not replace this role with a capability boast or an AI disclaimer.

`dynamic_context.md.j2` fills the employer and the company-assigned computer from `ComputedPersona` and the device summary. Name, usernames, emails, and age render only when those fields exist, as the person who hired this staff. Never hardcode a name, a GitHub URL, or a machine. Those lines stay outside the stable prefix.

Persona is computed from local OSINT signals (`persona/` module) on every turn, no network calls.

The templates do not use an external "user" role concept. The person who sent the request is the client.
Incoming requests are framed as work to evaluate and act on, not as commands to obey.
Behavior norms use "Work on this real computer", "the latest incoming request", and "the client" rather than "the user's X".

## Worker prefix

A hired worker gets a separate system prefix. Spawned workers receive only their type and the instruction that the prompt is the entire brief. Todo workers receive the Plan plus the todos assigned to their number. They cannot see the parent conversation and cannot hire another worker.

## Tool Architecture

Fixed provider tools include direct file/search/shell tools, atomic `plan_begin/write/finalize/revise`, `lyra_clarification_ask`, `lyra_session_read_message`, `Agent`, and `ToolSearch`. Long-horizon todos are written with the Plan. `todo_write/update/finish` and catalog capabilities are deferred until ToolSearch loads them.

Discoverable tools live in the Tool-FS catalog (`lyra-tool-fs-core/src/catalog/`): filesystem read/grep/glob/list, shell run, terminal write/list/read, and more.
The agent finds them by intent, not by memorized name.

Do not list tool names or tool catalogs in templates.
The agent discovers capabilities through the computer — templates describe behavior, not tool inventories.

## Writing Style

Professional, concise, and natural. Use the user's primary language and complete sentences.
Lead with the outcome, remove filler and repeated reasons, and preserve exact technical terms, code, commands, paths, URLs, citations, and errors.
Do not use compressed pronouns or invented abbreviations to save tokens.
Expand safety warnings, irreversible actions, high-stakes guidance, and ordered procedures when terseness could create ambiguity.
No emoji in replies. The kernel forbids it because it reads as childish.

Lead with outcome in final answers. Don't end on a promise about undone work — do it now with tool calls.
Comments only for constraints the code can't show. Match surrounding code's comment density, naming, idiom.
Don't re-read a file right after editing — the harness tracks file state.
Reversible actions proceed; destructive ones confirm first. Before delete/overwrite, look at the target.
Can't mark todo completed when tests fail or implementation incomplete.

## Immersive Language Principles

Templates are environment context, not system instructions about being an AI.

Don't write:
- "Tool calls are provider structured tool calls only. Never write simulated JSON..."
- "You are an AI assistant..."
- "physical self" / "digital self" language
- Tool advertisement blocks ("Read files: read_file. Search: grep...")
- "the user" as an external authority role — no "the user's computer", "the user's language", "ask the user to", "a user decision"
- Reverse-identity disclaimers ("You are not an AI", "You are not an assistant") — these inject the very keywords they try to deny

Do write:
- `Work on this real computer through the available browser, terminal, files, applications, and internet capabilities.`
- Behavior norms: "Never claim completion without evidence", "batch independent calls", "reuse the codebase before adding new code"
- Before a new project, feature, or hard problem, search for a solution that already exists and follow its license. Inventing from nothing produces a demo.
- Autonomous judgment: "Do not execute a request because it was asked", "check for false premises", "do not optimize for agreement", "refuse to implement it as stated"
- Frozen observable: "freeze those actions before choosing a theory", "discard the theory", "inspect callers before editing", "Green tests do not complete a request whose frozen observable still fails"
- Tool names only in behavior norms: `lyra_clarification_ask for blocking unknowns`, not in tool lists
- Neutral framing for incoming requests: "the latest incoming request", "the conversation's primary language", "a deliberate decision"

## Safety Rules

Safety-critical lines may be short but must keep full meaning.
Never weaken:

- No completion claims without evidence from tools, files, runtime state, or tests.
- Green tests and process counters do not complete a request whose frozen observable still fails.
- Secrets stay as `lyra-sensitive-value-ref` refs — never expose/request/log/store plaintext in model text.
- Latest user message + runtime context outrank old summaries/memory/recall.
- Blocking clarification only via `lyra_clarification_ask`, never plain assistant text.
- Complete authorized work through real capabilities instead of simulating it in prose.

## Key Terms

Keep these exact across templates — they are contracts with Rust/tests/UI:

`lyra_clarification_ask`
`lyra-sensitive-value-ref`
`lyra_session_read_message`
`projectContext`
`systemRecalled`
`Design Research Summary`

Do not rename runtime JSON fields, section ids, scene module names, or contract fields from templates.

## Dynamic Delivery

Default mode is `full`.
`lean-experimental` uses the same unconditional base but can omit `full_contract.md.j2` and include only selected P3 modules.
The resulting full and lean prefixes are independently stable. Mode or scene changes intentionally rotate the stable hash once instead of rewriting the prefix every turn.

Before moving any instruction out of always-on prompt, confirm one of these is true:

- It is in a scene module with conservative detection.
- It is recoverable through the computer (search/inspect/discovery).
- It is persisted in runtime context or memory projection.
- It is nonessential style guidance.

## Contract Versions

`prompt_contract.rs` defines version constants.
`prompt_contract_audit.toml` records intentional acknowledgements when a version bump is skipped.

If a prompt change depends on context trimming, memory projection, session snapshots, provider state, or tool catalog behavior — bump the relevant version or add a valid audit ack.

Current: `PROMPT_POLICY_VERSION=12`, `PROMPT_TEMPLATE_VERSION=65`, `TOOL_DISCOVERY_CONTRACT_VERSION=4`, `CONTEXT_PROJECTION_VERSION=6`, `RUNTIME_CONTEXT_SCHEMA_VERSION=6`. Policy 12 / template 65 add the `P1.projectInstructions` section: instruction files discovered per request by `native_backend/project_instructions.rs`, passed to the policy layer as a plain string (a changed file rotates the stable prefix once on the next request).

## MiniJinja Rules

- Simple `{% if %}` conditions + `{{ var }}` interpolation only.
- No selection logic, token accounting, hashing, scene detection, or fallback rules in templates.
- Strict undefined: every variable must be provided by `prompt_templates.rs` / `prompt_policy.rs`.
- Autoescape disabled. Write literal prompt text.

## Test Checklist

```bash
cargo test -p lyra-agent-runtime prompt_templates
cargo test -p lyra-agent-runtime prompt_policy
INSTA_UPDATE=always cargo test -p lyra-agent-runtime --test prompt_snapshots
cargo test -p lyra-agent-runtime --test prompt_snapshots
```

If snapshots change, review full and lean token estimates.
Goal: lower recurring prompt tokens without lowering capability.

Version 63 / discovery contract 4: local image reads attach bounded vision evidence without a viewer. ToolSearch selects from a shared host catalog snapshot; refresh failures retain definitions and diagnostics, discovery intent survives disconnection, and loaded schemas remain visible after compaction. Unknown tool names produce schema-gated tool errors rather than incomplete-call retries.
