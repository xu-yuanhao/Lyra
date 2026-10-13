use super::*;
use crate::persona::ComputedPersona;

mod persona;
pub(crate) use persona::computed_persona_for_turn;

fn browser_snapshot_active_tab(snapshot: &Value) -> Option<&Value> {
    let active_tab_id = snapshot.get("activeTabId").and_then(Value::as_str)?;
    snapshot
        .get("tabs")
        .and_then(Value::as_array)?
        .iter()
        .find(|tab| tab.get("tabId").and_then(Value::as_str) == Some(active_tab_id))
}

fn compact_browser_storage_state(snapshot: &Value) -> Value {
    let Some(storage) = snapshot
        .get("storageState")
        .filter(|value| value.is_object())
    else {
        return Value::Null;
    };
    let sites = storage
        .get("sites")
        .and_then(Value::as_array)
        .map(|items| items.iter().take(8).cloned().collect::<Vec<_>>())
        .unwrap_or_default();
    json!({
        "schemaVersion": storage.get("schemaVersion").cloned().unwrap_or(Value::Null),
        "profileId": storage.get("profileId").cloned().unwrap_or(Value::Null),
        "profileMode": storage.get("profileMode").cloned().unwrap_or(Value::Null),
        "profilePartition": storage.get("profilePartition").cloned().unwrap_or(Value::Null),
        "persistence": storage.get("persistence").cloned().unwrap_or(Value::Null),
        "cookies": storage.get("cookies").cloned().unwrap_or(Value::Null),
        "localStorage": storage.get("localStorage").cloned().unwrap_or(Value::Null),
        "indexedDB": storage.get("indexedDB").cloned().unwrap_or(Value::Null),
        "sessionStorage": storage.get("sessionStorage").cloned().unwrap_or(Value::Null),
        "cacheStorage": storage.get("cacheStorage").cloned().unwrap_or(Value::Null),
        "relationship": storage.get("relationship").cloned().unwrap_or(Value::Null),
        "sites": sites,
        "privacy": {
            "cookieValues": "not_exposed",
            "storageValues": "not_exposed",
            "sensitiveValues": "metadata_only"
        }
    })
}

fn compact_recovery_browser_tab_ref(tab: &Value) -> Value {
    let restore = tab.get("restoreState").unwrap_or(&Value::Null);
    json!({
        "tabId": tab.get("tabId").cloned().unwrap_or(Value::Null),
        "profilePartition": tab.get("profilePartition").cloned().unwrap_or(Value::Null),
        "lifecycleState": tab.get("lifecycleState").cloned().unwrap_or(Value::Null),
        "recoveryFailure": tab.get("recoveryFailure").cloned().unwrap_or(Value::Null),
        "restoreState": {
            "scrollX": restore.get("scrollX").cloned().unwrap_or(Value::Null),
            "scrollY": restore.get("scrollY").cloned().unwrap_or(Value::Null),
            "viewport": restore.get("viewport").cloned().unwrap_or(Value::Null),
            "loadState": restore.get("loadState").cloned().unwrap_or(Value::Null),
            "textHash": restore.get("textHash").cloned().unwrap_or(Value::Null),
            "capturedAt": restore.get("capturedAt").cloned().unwrap_or(Value::Null)
        }
    })
}

fn compact_browser_recovery_anchor(snapshot: &Value) -> Value {
    let Some(anchor) = snapshot
        .get("recoveryAnchor")
        .filter(|value| value.is_object())
    else {
        return Value::Null;
    };
    let storage_state_ref = anchor
        .get("storageStateRef")
        .filter(|value| value.is_object())
        .map(|storage| {
            json!({
                "profilePartition": storage.get("profilePartition").cloned().unwrap_or(Value::Null),
                "siteOrigin": storage.get("siteOrigin").cloned().unwrap_or(Value::Null)
            })
        })
        .unwrap_or(Value::Null);
    json!({
        "schemaVersion": anchor.get("schemaVersion").cloned().unwrap_or(Value::Null),
        "tabId": anchor.get("tabId").cloned().unwrap_or(Value::Null),
        "targetRef": anchor.get("targetRef").cloned().unwrap_or(Value::Null),
        "textHash": anchor.get("textHash").cloned().unwrap_or(Value::Null),
        "storageStateRef": storage_state_ref,
        "authState": anchor.get("authState").cloned().unwrap_or(Value::Null),
        "capturedAt": anchor.get("capturedAt").cloned().unwrap_or(Value::Null),
        "redaction": {
            "address": "not_in_runtime_context",
            "title": "not_in_runtime_context",
            "historyEntry": "not_in_runtime_context",
            "reason": "browser recovery data is not current-page evidence"
        }
    })
}

fn browser_recovery_failures(snapshot: &Value) -> Vec<Value> {
    snapshot
        .get("tabs")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tab| {
            let failure = tab.get("recoveryFailure")?.clone();
            Some(json!({
                "tabId": tab.get("tabId").cloned().unwrap_or(Value::Null),
                "failure": failure
            }))
        })
        .collect()
}

fn compact_browser_recovery_context(snapshot: Value) -> Value {
    if snapshot.is_null() {
        return json!({
            "hostCapabilityAvailable": true,
            "snapshotAvailable": false,
            "message": "No BrowserSessionSnapshot has been captured yet."
        });
    }
    let prior_active_tab = browser_snapshot_active_tab(&snapshot)
        .map(compact_recovery_browser_tab_ref)
        .unwrap_or(Value::Null);
    json!({
        "hostCapabilityAvailable": true,
        "snapshotAvailable": true,
        "recoverySnapshotOnly": true,
        "currentPageEvidence": "none_from_browser_recovery",
        "modelInstruction": "Do not describe browserRecovery as the user's current visible page. Use workbench.listTabs, workbench.readTab, or Lumen/browser tool results for current browser claims.",
        "schemaVersion": snapshot.get("schemaVersion").cloned().unwrap_or(Value::Null),
        "snapshotId": snapshot.get("snapshotId").cloned().unwrap_or(Value::Null),
        "capturedAt": snapshot.get("capturedAt").cloned().unwrap_or(Value::Null),
        "activeTabId": snapshot.get("activeTabId").cloned().unwrap_or(Value::Null),
        "activeTab": Value::Null,
        "priorActiveTab": prior_active_tab,
        "recoveryAnchor": compact_browser_recovery_anchor(&snapshot),
        "storageState": compact_browser_storage_state(&snapshot),
        "recoveryFailures": browser_recovery_failures(&snapshot),
        "privacy": {
            "cookieValues": "not_exposed",
            "storageValues": "not_exposed",
            "formDraftValues": "redacted_metadata_only",
            "modelMayReadAuthState": "logged_in_or_requires_user_metadata_only"
        }
    })
}

pub(crate) fn read_turn_host_context(dispatcher: Option<&Arc<HostCapabilityDispatcher>>) -> Value {
    dispatcher
        .and_then(|dispatcher| {
            invoke_host_capability_with_timeout(
                dispatcher.clone(),
                "agent.readTurnContext".to_string(),
                json!({}),
                DEFAULT_HOST_TOOL_TIMEOUT_MS,
            )
            .ok()
        })
        .unwrap_or_else(|| json!({}))
}

pub(crate) fn build_runtime_context(
    host: &Value,
    memory_records: &[LongTermMemoryRecord],
    capabilities: &ModelCapabilityProfile,
) -> Value {
    let workbench = host
        .get("workbench")
        .cloned()
        .unwrap_or_else(|| json!({"hostCapabilityAvailable": false}));
    let mut software = host
        .get("software")
        .cloned()
        .unwrap_or_else(|| json!({"hostCapabilityAvailable": false, "software": []}));
    // Prompt metadata uses the same catalog, without a second schema copy.
    if let Some(entries) = software.get_mut("software").and_then(Value::as_array_mut) {
        for entry in entries {
            if let Some(actions) = entry.get_mut("actions").and_then(Value::as_array_mut) {
                for action in actions {
                    if let Some(object) = action.as_object_mut() {
                        object.remove("inputSchema");
                        object.remove("outputSchema");
                    }
                }
            }
        }
    }
    let memory = memory_records
        .iter()
        .rev()
        .take(12)
        .map(|record| {
            json!({
                "id": record.id,
                "scope": record.scope,
                "category": record.category,
                "fact": record.fact,
                "status": record.status,
                "content": record.content,
                "confidence": record.confidence,
                "sourceType": record.source_type,
                "updatedAt": record.updated_at,
                "priority": record.priority,
                "lastAccessedAt": record.last_accessed_at,
                "accessCount": record.access_count,
            })
        })
        .collect::<Vec<_>>();
    json!({
        "identity": "agent",
        "workbench": workbench,
        "browserRecovery": host.get("browserRecovery").filter(|value| !value.is_null()).cloned()
            .map(compact_browser_recovery_context).unwrap_or_else(|| json!({"snapshotAvailable": false})),
        "browserModePolicy": {
            "defaultTargetMode": "live",
            "followControl": "visible Follow cursor is controlled by the user's real Follow toggle, not by targetMode",
            "isolatedAuthState": "isolated pages use a separate profile unless a tool explicitly requests authState=borrowLiveLogin and the user grants permission",
            "modeEvidence": "Lumen results include browserMode with targetMode, visibleFollow, authState, reason, and profilePartition"
        },
        "software": software,
        "memory": memory,
        "tools": if capabilities.supports_tool_calling { model_tool_names() } else { Vec::new() },
        "interactionContract": interaction_contract_runtime_context(),
        "network": network_runtime_context(),
        "permissionOperatingContract": permission_operating_contract_text(),
        "sensitiveValues": {
            "refKind": "lyra-sensitive-value-ref",
            "ownership": "user_owned",
            "modelVisibility": "metadata_only",
            "plaintextVisibility": "user_reveal_only",
            "rule": "Use refs as model-opaque ownership handles. Never request or emit plaintext secrets in model-visible content."
        },
        "elevation": elevation_context_block(),
        "shell": shell_context_block(),
        "capabilities": {
            "supportsImageInput": capabilities.supports_image_input,
            "supportsToolCalling": capabilities.supports_tool_calling,
            "supportsStreaming": capabilities.supports_streaming,
            "contextWindow": capabilities.context_window,
        },
    })
}

pub(crate) fn interaction_contract_runtime_context() -> Value {
    json!({
        "blockingMemberInput": "structured_interaction_only",
        "clarificationTool": LYRA_CLARIFICATION_ASK_TOOL,
        "plainAssistantQuestions": "non_blocking_final_text",
        "sameTurnResume": true,
        "policy": "If member input is required to continue, call the structured clarification tool. If safe assumption works, state it and continue."
    })
}

pub(crate) fn infer_tool_filesystem_scene(
    session_kind: Option<&str>,
    working_dir: Option<&str>,
    active_skills: &HashSet<String>,
    workbench: &Value,
) -> String {
    let working_dir_value = working_dir
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let active_tab_kind = active_workbench_tab_signal(workbench);
    let signals = lyra_tool_fs_core::ToolSceneSignals {
        session_kind: session_kind
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        project_bound: working_dir_value.is_some(),
        working_dir: working_dir_value.clone(),
        git_repo: working_dir_is_git_repo(working_dir),
        active_tab_kind: active_tab_kind.clone(),
        focused_tab_kind: active_tab_kind,
        terminal_active: workbench_terminal_active(workbench),
        browser_active: workbench_browser_active(workbench),
        editor_active: false,
        software_active: false,
        active_skills: active_skills.iter().cloned().collect(),
        ..lyra_tool_fs_core::ToolSceneSignals::default()
    };
    lyra_tool_fs_core::infer_scene(&signals)
        .as_str()
        .to_string()
}

pub(crate) fn tool_filesystem_runtime_context(
    scene: &str,
    session_id: Option<&str>,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
) -> Value {
    let root = session_id.and_then(|id| projects::session_root(id).ok().flatten());
    json!({
        "scene": scene,
        "internalRegistry": true,
        "rootSummary": tools::tool_fs::root_summary_for_scene(scene, dispatcher, root.as_deref()),
        "manifestSources": tools::tool_fs::runtime_manifest_source_summary(dispatcher, root.as_deref()),
    })
}

fn active_workbench_tab_signal(workbench: &Value) -> Option<String> {
    let active_tab = active_workbench_tab(workbench)?;
    [
        "observationKind",
        "pageKind",
        "kind",
        "tabKind",
        "surfaceKind",
    ]
    .into_iter()
    .find_map(|field| {
        active_tab
            .get(field)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
    })
}

fn active_workbench_tab(workbench: &Value) -> Option<&Value> {
    if let Some(tab) = workbench.get("activeTab").filter(|value| value.is_object()) {
        return Some(tab);
    }
    let active_id = workbench
        .get("activeTabId")
        .or_else(|| workbench.get("focusedTabId"))
        .and_then(Value::as_str)?;
    workbench
        .get("tabs")
        .and_then(Value::as_array)?
        .iter()
        .find(|tab| {
            tab.get("id")
                .or_else(|| tab.get("tabId"))
                .and_then(Value::as_str)
                == Some(active_id)
        })
}

fn workbench_terminal_active(workbench: &Value) -> bool {
    active_workbench_tab_signal(workbench).is_some_and(|signal| signal == "terminal")
        || workbench
            .get("terminal")
            .and_then(|terminal| terminal.get("active"))
            .is_some_and(|value| !value.is_null())
}

fn workbench_browser_active(workbench: &Value) -> bool {
    let Some(active_tab) = active_workbench_tab(workbench) else {
        return false;
    };
    if active_workbench_tab_signal(workbench).is_some_and(|signal| {
        matches!(
            signal.as_str(),
            "page" | "search" | "results" | "search-home" | "search-results"
        )
    }) {
        return true;
    }
    let page_kind = active_tab
        .get("pageKind")
        .or_else(|| active_tab.get("kind"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    let observation_kind = active_tab
        .get("observationKind")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let address = active_tab
        .get("url")
        .or_else(|| active_tab.get("displayAddress"))
        .or_else(|| active_tab.get("address"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    page_kind == "page"
        || observation_kind == "page"
        || address.starts_with("http://")
        || address.starts_with("https://")
}

pub(crate) fn working_dir_is_git_repo(working_dir: Option<&str>) -> bool {
    let Some(working_dir) = working_dir.map(str::trim).filter(|value| !value.is_empty()) else {
        return false;
    };
    Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(working_dir)
        .output()
        .ok()
        .is_some_and(|output| output.status.success())
}

pub(crate) fn build_system_prompt_report(
    runtime_context: &Value,
    persona: &PersonaContext,
    active_skill_prompt: &str,
    memory_prompt: &str,
    previous_runtime_contract: Option<Value>,
    previous_prompt_hash: Option<String>,
    context_trimmed: bool,
    recent_tool_failure_count: usize,
    recent_tool_mismatch_count: usize,
    consecutive_tool_failure_count: usize,
    user_correction_detected: bool,
    delivery_mode: Option<prompt_policy::PromptDeliveryMode>,
    computed_persona: Option<ComputedPersona>,
    first_used_at: Option<&str>,
) -> prompt_policy::PromptBuildReport {
    prompt_policy::build_system_prompt_report(&PromptPolicyInput {
        runtime_context: runtime_context.clone(),
        persona: persona.clone(),
        active_skill_prompt: active_skill_prompt.to_string(),
        memory_prompt: memory_prompt.to_string(),
        accounting: PromptAccounting {
            system_budget: 1200,
            tools_budget: 800,
            memory_budget: 600,
            history_budget: 0,
            artifact_budget: 0,
        },
        delivery_mode,
        previous_runtime_contract,
        previous_prompt_hash,
        context_trimmed,
        recent_tool_failure_count,
        recent_tool_mismatch_count,
        consecutive_tool_failure_count,
        user_correction_detected,
        computed_persona,
        first_used_at: first_used_at.map(str::to_string),
    })
}

pub(crate) fn model_tools() -> Vec<Value> {
    use std::sync::OnceLock;
    static TOOLS: OnceLock<Vec<Value>> = OnceLock::new();
    TOOLS
        .get_or_init(|| {
            tools::tool_search::assemble_provider_tools(&json!({}), None, Some(128_000))
        })
        .clone()
}

fn todo_item_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": { "type": "string" },
            "content": { "type": "string" },
            "title": { "type": "string" },
            "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "failed", "skipped", "cancelled"] },
            "priority": { "type": "string" },
            "blockedBy": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["content"]
    })
}

pub(crate) fn plan_model_tools() -> Vec<Value> {
    vec![
        function_tool(
            tools::PLAN_BEGIN_MODEL_TOOL,
            "Start Plan Mode before any mutation when success is not a single closed action. Inspect first, then write the complete product Plan. Skip this call for a closed short task such as deleting a named file, searching a known error, or editing a known location. Inventing an artifact, drawing, or feature is not a closed short task even when the result is one file.",
            json!({
                "type": "object",
                "properties": {
                    "title": { "type": "string", "description": "Short human-readable plan title." },
                    "reason": { "type": "string", "description": "Optional reason for planning." },
                    "scope": { "type": "string", "description": "Optional product scope. Describe the full product, not a this-turn cut." }
                },
                "required": ["title"]
            }),
        ),
        function_tool(
            tools::PLAN_WRITE_MODEL_TOOL,
            "Append to or replace the active Plan Markdown draft. For long-horizon or partitionable work, pass the complete todos array in this same call so approval can execute it. Omit todos when remaining work is one sequential sitting.",
            json!({
                "type": "object",
                "properties": {
                    "planId": { "type": "string", "description": "Optional active plan id. Defaults to the current draft." },
                    "markdownDelta": { "type": "string", "description": "Markdown to append, or the full replacement when replace=true." },
                    "replace": { "type": "boolean", "description": "Replace the current draft instead of appending. Default false." },
                    "todos": {
                        "type": "array",
                        "description": "Optional complete executable Todo list written with the Plan. Approval promotes this list; do not rewrite it after approval.",
                        "items": todo_item_schema()
                    }
                },
                "required": ["markdownDelta"]
            }),
        ),
        function_tool(
            tools::PLAN_FINALIZE_MODEL_TOOL,
            "Finalize the non-empty active Plan for user review. May include todos if they were not already written with plan_write.",
            json!({
                "type": "object",
                "properties": {
                    "planId": { "type": "string", "description": "Optional active plan id. Defaults to the current draft." },
                    "summary": { "type": "string", "description": "Optional short summary shown in the review panel." },
                    "todos": {
                        "type": "array",
                        "description": "Optional complete executable Todo list if it was not already written with the Plan.",
                        "items": todo_item_schema()
                    }
                }
            }),
        ),
        function_tool(
            tools::PLAN_REVISE_MODEL_TOOL,
            "Revise the active Plan after user edits, annotations, or Plan Chat feedback.",
            json!({
                "type": "object",
                "properties": {
                    "planId": { "type": "string", "description": "Optional active plan id. Defaults to the current draft." },
                    "markdown": { "type": "string", "description": "Optional full revised Markdown." },
                    "annotations": {
                        "type": "array",
                        "description": "Optional line or block annotations from user feedback.",
                        "items": { "type": "object" }
                    }
                }
            }),
        ),
    ]
}

pub(crate) fn todo_model_tools() -> Vec<Value> {
    let todo_item = todo_item_schema();
    let evidence_ids = json!({
        "type": "array",
        "description": "Legacy optional activity ids retained for compatibility. They do not control Todo state transitions.",
        "items": { "type": "string" }
    });
    let design_dispositions = json!({
        "type": "array",
        "description": "Optional retained or ignored design finding dispositions recorded with the Goal. They do not block completion.",
        "items": {
            "type": "object",
            "properties": {
                "ruleId": { "type": "string" },
                "disposition": { "type": "string", "enum": ["retained", "ignored"] },
                "rationale": { "type": "string" },
                "evidenceIds": evidence_ids.clone()
            },
            "required": ["ruleId", "disposition"],
            "additionalProperties": false
        }
    });
    vec![
        function_tool(
            tools::TODO_WRITE_MODEL_TOOL,
            "Create or replace the executable Todo list. Write it with the Plan for long-horizon work. After approval the Plan list is already live — use this only for sessions without a Plan, or if the work itself changed.",
            json!({
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "Complete ordered Todo list. Prefer writing it with the Plan; after approval prefer todo_update for status changes.",
                        "items": todo_item
                    }
                },
                "required": ["todos"]
            }),
        ),
        function_tool(
            tools::TODO_UPDATE_MODEL_TOOL,
            "Update one Todo using an exact current id. Mark failed or skipped items with a concrete failureReason.",
            json!({
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "Todo id to update." },
                    "status": {
                        "type": "string",
                        "enum": ["pending", "in_progress", "completed", "failed", "skipped", "cancelled"]
                    },
                    "note": { "type": "string", "description": "Optional progress note." },
                    "evidence": { "type": "string", "description": "Optional concise explanation retained in Todo history." },
                    "failureReason": { "type": "string", "description": "Required by Runtime for failed or skipped status." }
                },
                "required": ["id", "status"]
            }),
        ),
        function_tool(
            tools::TODO_FINISH_MODEL_TOOL,
            "Finish the native Goal after every Todo has a real terminal status.",
            json!({
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "enum": ["completed", "failed", "cancelled"]
                    },
                    "summary": { "type": "string", "description": "Summary of the Goal's real terminal outcome." },
                    "designFindingDispositions": design_dispositions
                },
                "required": ["status", "summary"]
            }),
        ),
    ]
}

pub(crate) fn codex_code_model_tools() -> Vec<Value> {
    vec![
        function_tool(
            tools::READ_FILE_MODEL_TOOL,
            "Read a local text file or image directly. PNG/JPEG/WebP/GIF images become model vision input without opening a browser or Image Viewer; images are bounded to 2048 pixels and animations show their first frame. For text, invalid or truncated UTF-8 bytes are replaced. This tool rejects directories and other binary formats; use glob for directories and grep for text search.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative or absolute path to a text file or image, including downloaded/generated images. Do not pass a directory such as ."
                    },
                    "startLine": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Optional 1-based first line in the original file. Beyond EOF returns an explicit error; use the reported nextLine to continue a truncated read."
                    },
                    "endLine": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Optional 1-based last line, inclusive. Must be greater than or equal to startLine when both are supplied."
                    },
                    "maxBytes": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Optional maximum bytes returned after locating the requested line range. Complete lines are preferred; oversized partial lines are explicitly reported."
                    },
                    "encoding": {
                        "type": "string",
                        "enum": ["utf-8", "lossy-utf8"],
                        "description": "Accepted for compatibility. Invalid UTF-8 bytes are always replaced."
                    }
                },
                "required": ["path"]
            }),
        ),
        function_tool(
            tools::GLOB_MODEL_TOOL,
            "Find existing files recursively by name/path pattern. Use the narrowest relevant root and pattern. This is not needed to create a new file at a known path; do not scan the home directory just to prepare a test file.",
            json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Glob pattern such as *, **/*.rs, or src/**/mod.rs."
                    },
                    "root": {
                        "type": "string",
                        "description": "Directory to search. Defaults to the workspace root."
                    },
                    "includeHidden": {
                        "type": "boolean",
                        "description": "Include hidden files and directories. Default false."
                    },
                    "limit": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 2000,
                        "description": "Maximum matches returned."
                    }
                },
                "required": ["pattern"]
            }),
        ),
        function_tool(
            tools::GREP_MODEL_TOOL,
            "Search file contents with ripgrep. Use this for literal or regex text search.",
            json!({
                "type": "object",
                "properties": {
                    "pattern": {
                        "type": "string",
                        "description": "Ripgrep regular expression."
                    },
                    "path": {
                        "type": "string",
                        "description": "File or directory to search. Defaults to the workspace root."
                    },
                    "glob": {
                        "type": "string",
                        "description": "Optional ripgrep file glob such as *.rs."
                    },
                    "caseInsensitive": {
                        "type": "boolean",
                        "description": "Use case-insensitive matching. Default false."
                    },
                    "contextLines": {
                        "type": "integer",
                        "minimum": 0,
                        "maximum": 10,
                        "description": "Context lines around each match."
                    },
                    "maxResults": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 2000,
                        "description": "Maximum matching lines returned."
                    }
                },
                "required": ["pattern"]
            }),
        ),
        function_tool(
            tools::EXEC_COMMAND_MODEL_TOOL,
            "Execute a command that exits on its own — repository inspection, tests, builds, git, and validation. timeout_ms is required: your prediction of how long this should take, not a kill timer. This call occupies the turn up to two minutes; a prediction over ten minutes parks after a start check. The process keeps running within this turn and Lyra notifies you when it exits; unfinished foreground commands are stopped when this turn ends — do not poll. Do not use this for dev servers or watchers — start those with write_stdin. File mutations should use edit_file or write_file.",
            json!({
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Shell command to execute. The field name is command."
                    },
                    "workdir": {
                        "type": "string",
                        "description": "Optional working directory. Defaults to the bound workspace root."
                    },
                    "timeout_ms": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Required. Your prediction of how long this command should take, in milliseconds. Not a kill timer. Occupies this turn up to two minutes, or parks immediately when the prediction is over ten minutes. You are notified when it later exits."
                    },
                    "sensitiveEnv": {
                        "type": "object",
                        "description": "Optional environment bindings: LYRA_SECRET_* names to lyra-sensitive-value-ref objects from secure storage. Values are resolved only in the process host, never in the command text. Use a credential helper/stdin consumer; never expand into a URL or write to a file.",
                        "additionalProperties": { "type": "object" }
                    },
                    "max_output_tokens": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Optional approximate stdout/stderr token budget."
                    }
                },
                "required": ["command", "timeout_ms"]
            }),
        ),
        function_tool(
            tools::WRITE_STDIN_MODEL_TOOL,
            "Write characters to a terminal session. Omit sessionId to reuse this task's private terminal or create one if missing. To create another, omit sessionId and set createNew=true. Use only sessionId values returned by terminal results, never placeholders. Start long-running processes (dev servers, watchers) here. One-shot commands that exit must use exec_command.",
            json!({
                "type": "object",
                "properties": {
                    "sessionId": {
                        "type": "string",
                        "description": "Existing ID returned by a terminal result. Omit to reuse/create this task's terminal; never invent an ID."
                    },
                    "createNew": {
                        "type": "boolean",
                        "description": "Create a new private terminal instead of reusing the current one. Omit sessionId when true."
                    },
                    "chars": {
                        "type": "string",
                        "description": "Characters to send."
                    },
                    "appendNewline": {
                        "type": "boolean",
                        "description": "Append a newline after chars. Default false."
                    }
                },
                "required": ["chars"]
            }),
        ),
        function_tool(
            tools::EDIT_FILE_MODEL_TOOL,
            "Make targeted edits to an existing file. Preferred tool for modifying code: send only the regions you change as old_text/new_text pairs, never the whole file. old_text is matched against the current file (whitespace/indentation differences are tolerated and the replacement keeps the file's indentation); it must be unique unless replace_all is set. Do not send another edit only to repair indentation. Apply several edits to the same file in one call via the edits array.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative path of the file to edit. A leading ~/ is expanded to the user home directory; other tilde variants (~user, ~+, ~-) are rejected."
                    },
                    "edits": {
                        "type": "array",
                        "description": "Ordered edits applied to the file. Each later edit sees the result of the earlier ones.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "old_text": { "type": "string", "description": "Exact text to find in the current file (a few surrounding lines for uniqueness)." },
                                "new_text": { "type": "string", "description": "Replacement text." },
                                "replace_all": { "type": "boolean", "description": "Replace every occurrence instead of requiring a unique match. Default false." }
                            },
                            "required": ["old_text", "new_text"]
                        }
                    }
                },
                "required": ["path", "edits"]
            }),
        ),
        function_tool(
            tools::WRITE_FILE_MODEL_TOOL,
            "Create a new file, or overwrite a file in full, with its complete contents. Use this for brand-new files and for large generated artifacts (HTML, CSS, bundles) — there is no size limit, so send the whole file in one call rather than a patch. To change part of an existing file, prefer edit_file. An existing file is replaced. Pass overwrite=false to fail instead of replacing it.",
            json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path relative to the bound workspace root. Do not prefix the workspace folder name itself: if the root is /Users/me/project, use src/a.ts, not project/src/a.ts. Parent directories are created as needed. A leading ~/ is expanded to the user home directory; other tilde variants (~user, ~+, ~-) are rejected."
                    },
                    "content": {
                        "type": "string",
                        "description": "Full contents of the file."
                    },
                    "overwrite": {
                        "type": "boolean",
                        "description": "Replace an existing file. Default true. Pass false to fail if the file already exists."
                    }
                },
                "required": ["path", "content"]
            }),
        ),
    ]
}

pub(crate) fn clarification_ask_model_tool() -> Value {
    function_tool(
        LYRA_CLARIFICATION_ASK_TOOL,
        "Structured blocking member question through the decision panel. Use only when progress genuinely needs a member decision that is not already available through this session or Lyra's tools. Never use this to wait for a member to finish work already possible through the browser, terminal, computer, or internet — continue that work instead. Plain assistant text questions are non-blocking final text and never pause/resume the turn. Prefer safe assumptions when enough.",
        json!({
            "type": "object",
            "properties": {
                "question": {
                    "type": "string",
                    "description": "Concise question shown in the blocking decision panel."
                },
                "options": {
                    "type": "array",
                    "description": "Optional choices. Use 2-4 objects for clear mutually exclusive decisions; omit or leave empty for free-form answers.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {
                                "type": "string",
                                "description": "Short option label."
                            },
                            "description": {
                                "type": "string",
                                "description": "Optional explanation of the tradeoff."
                            }
                        },
                        "required": ["label"],
                        "additionalProperties": false
                    },
                    "default": []
                },
                "allowCustomAnswer": {
                    "type": "boolean",
                    "description": "Whether the member can type a custom answer.",
                    "default": true
                },
                "detail": {
                    "type": "string",
                    "description": "Optional short supporting detail."
                }
            },
            "required": ["question"]
        }),
    )
}

pub(crate) fn session_read_message_model_tool() -> Value {
    function_tool(
        LYRA_SESSION_READ_MESSAGE_TOOL,
        "Read the canonical full text of a prior session message. Accepts either messageId (from a lyra-transcript-cite block) or messageOrdinal (0-based index into the session message array).",
        json!({
            "type": "object",
            "properties": {
                "messageId": {
                    "type": "string",
                    "description": "Stable message id from a lyra-transcript-cite block."
                },
                "messageOrdinal": {
                    "type": "integer",
                    "description": "0-based index into the session message array. Use when you don't have a messageId."
                },
                "blockId": {
                    "type": "string",
                    "description": "Optional text block id when the cite targets one block."
                },
                "startOffset": {
                    "type": "integer",
                    "description": "Optional UTF-16 start offset inside the cited block."
                },
                "endOffset": {
                    "type": "integer",
                    "description": "Optional UTF-16 end offset inside the cited block."
                },
                "includeToolBlocks": {
                    "type": "boolean",
                    "description": "Include tool-only blocks as summaries when the cited message has no text."
                }
            }
        }),
    )
}

pub(crate) fn function_tool(name: &str, description: &str, parameters: Value) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": close_object_schema(parameters),
        }
    })
}

pub(crate) fn close_object_schema(mut schema: Value) -> Value {
    if let Some(object) = schema.as_object_mut() {
        object
            .entry("additionalProperties")
            .or_insert(Value::Bool(false));
    }
    schema
}

pub(crate) fn model_tool_names() -> Vec<String> {
    let mut names = Vec::new();
    names.push(LYRA_CLARIFICATION_ASK_TOOL.to_string());
    names.push(tools::PLAN_BEGIN_MODEL_TOOL.to_string());
    names.push(tools::PLAN_WRITE_MODEL_TOOL.to_string());
    names.push(tools::PLAN_FINALIZE_MODEL_TOOL.to_string());
    names.push(tools::PLAN_REVISE_MODEL_TOOL.to_string());
    names.push(tools::AGENT_SPAWN_MODEL_TOOL.to_string());
    names.push(tools::READ_FILE_MODEL_TOOL.to_string());
    names.push(tools::GLOB_MODEL_TOOL.to_string());
    names.push(tools::GREP_MODEL_TOOL.to_string());
    names.push(tools::EXEC_COMMAND_MODEL_TOOL.to_string());
    names.push(tools::WRITE_STDIN_MODEL_TOOL.to_string());
    names.push(tools::EDIT_FILE_MODEL_TOOL.to_string());
    names.push(tools::WRITE_FILE_MODEL_TOOL.to_string());
    names.push(tools::tool_search::TOOL_SEARCH_TOOL_NAME.to_string());
    names.push(LYRA_SESSION_READ_MESSAGE_TOOL.to_string());
    names
}
