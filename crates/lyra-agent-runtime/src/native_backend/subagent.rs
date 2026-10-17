use super::*;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex as IdleMutex, Once, OnceLock};
#[cfg(not(test))]
use std::thread;
use tokio::sync::Notify;

pub(crate) const SUBAGENT_SESSION_KIND: &str = "subagent";
pub(crate) const SUBAGENT_ROSTER_POKE_MARKER: &str = "__lyra_subagent_roster_poke__";
pub(crate) const SUBAGENT_CONTINUE_PROMPT: &str = "Continue your assigned task.";
const RUNTIME_INTERRUPT_CONTINUING: &str = "Runtime interrupted this worker and is continuing it.";
const RUNTIME_INTERRUPT_STOPPED: &str = "Runtime interrupted this worker.";
const EXPLORE_DENIED_TOOLS: &[&str] = &[
    AGENT_SPAWN_MODEL_TOOL,
    "write_file",
    "edit_file",
    "apply_patch",
    "todo_write",
    "todo_update",
    "todo_finish",
    "plan_begin",
    "plan_write",
    "plan_finalize",
    "plan_revise",
    "update_plan",
    "file_write",
    "file_edit",
    "file_strict_edit",
    "file_multiedit",
];

static SESSION_IDLE: OnceLock<IdleMutex<HashMap<String, Arc<Notify>>>> = OnceLock::new();

fn session_idle_notifies() -> &'static IdleMutex<HashMap<String, Arc<Notify>>> {
    SESSION_IDLE.get_or_init(|| IdleMutex::new(HashMap::new()))
}

pub(crate) fn notify_session_idle(session_id: &str) {
    if let Ok(map) = session_idle_notifies().lock()
        && let Some(notify) = map.get(session_id)
    {
        notify.notify_waiters();
    }
}

fn session_idle_notify(session_id: &str) -> Arc<Notify> {
    let mut map = session_idle_notifies()
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    map.entry(session_id.to_string())
        .or_insert_with(|| Arc::new(Notify::new()))
        .clone()
}

pub(crate) fn sanitize_session_snapshot(snapshot: &mut Value) {
    if let Some(object) = snapshot.as_object_mut() {
        object.remove("agentMode");
        object.remove("oma");
        object.remove("modeContexts");
    }
}

pub(crate) fn is_subagent_snapshot(snapshot: &Value) -> bool {
    snapshot.get("sessionKind").and_then(Value::as_str) == Some(SUBAGENT_SESSION_KIND)
}

pub(crate) fn is_subagent_session_id(session_id: &str) -> bool {
    state()
        .lock()
        .ok()
        .and_then(|state| {
            state
                .sessions
                .get(session_id)
                .map(|session| session.snapshot.clone())
        })
        .is_some_and(|snapshot| is_subagent_snapshot(&snapshot))
}

pub(crate) fn parent_session_id_of(snapshot: &Value) -> Option<String> {
    snapshot
        .get("parentSessionId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn todo_host_session_id(session_id: &str, snapshot: &Value) -> String {
    parent_session_id_of(snapshot).unwrap_or_else(|| session_id.to_string())
}

pub(crate) fn should_list_session(session: &NativeSession) -> bool {
    !session.ephemeral && !is_deleted(&session.snapshot) && !is_subagent_snapshot(&session.snapshot)
}

pub(crate) fn subagent_type_of(snapshot: &Value) -> Option<String> {
    snapshot
        .pointer("/subagent/type")
        .and_then(Value::as_str)
        .map(str::to_string)
}

pub(crate) fn agent_spawn_model_tool(working_dir: Option<&str>) -> Value {
    let types = available_subagent_types(working_dir);
    function_tool(
        AGENT_SPAWN_MODEL_TOOL,
        "Launch a new agent to handle a slice that would flood this conversation. Use for a large tree, a multi-doc repo, several open pages, independent parallel slices, or a second pair of eyes. Do not use for a known file path, a specific class name, or a search inside two or three files — call read/grep/glob directly. Two places in play does not force two workers, but a large tree or documentation site is not a lead-session survey: spawn for those slices (one worker or several by module/page/doc). The lead's own next job must be different — comparison, synthesis, bugs, a reference project, or a small remaining slice — not a second pass over a worker's tree or page. Each spawn must name a slice no live worker is covering. Each invocation starts fresh unless you pass a live subagent_id to resume; write a self-contained prompt (paths, constraints, expected output). Never write \"based on your findings\". Launch independent workers in one message. Depth is 1: a child cannot spawn another agent. The tool path is /tools/agent/spawn.",
        json!({
            "type": "object",
            "properties": {
                "description": {
                    "type": "string",
                    "description": "Short 3-5 word label shown in the tool card."
                },
                "prompt": {
                    "type": "string",
                    "description": "Complete task for the child. It cannot see this conversation."
                },
                "subagent_type": {
                    "type": "string",
                    "description": format!("Agent type. Built-in: {}. Project types come from .lyra/agents/*.md.", types.join(", "))
                },
                "run_in_background": {
                    "type": "boolean",
                    "description": "Defaults to true: return the child id immediately and keep working in this conversation. Set false only when the next step is blocked on that one worker's report. You will be notified when a background worker finishes."
                },
                "subagent_id": {
                    "type": "string",
                    "description": "Resume an existing child of this session. Omit this field to start a new agent. Do not pass null or the string \"null\"."
                },
                "stop": {
                    "type": "boolean",
                    "description": "If true, interrupt the child identified by subagent_id."
                }
            },
            "required": ["description", "prompt"]
        }),
    )
}

pub(crate) fn filter_tools_for_session(snapshot: &Value, tools: Vec<Value>) -> Vec<Value> {
    if !is_subagent_snapshot(snapshot) {
        return tools;
    }
    let deny_spawn = true;
    let explore = subagent_type_of(snapshot).as_deref() == Some("explore");
    tools
        .into_iter()
        .filter(|tool| {
            let name = tool
                .pointer("/function/name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if deny_spawn && name == AGENT_SPAWN_MODEL_TOOL {
                return false;
            }
            if explore && EXPLORE_DENIED_TOOLS.contains(&name) {
                return false;
            }
            true
        })
        .collect()
}

pub(crate) fn subagent_system_prefix(snapshot: &Value) -> Option<String> {
    if !is_subagent_snapshot(snapshot) {
        return None;
    }
    let kind = subagent_type_of(snapshot).unwrap_or_else(|| "generalPurpose".to_string());
    let custom = snapshot
        .pointer("/subagent/customPrompt")
        .and_then(Value::as_str)
        .unwrap_or("");
    let custom_block = if custom.is_empty() {
        String::new()
    } else {
        format!("\n\nProject worker instructions:\n{custom}")
    };
    Some(format!(
        "You are a Lyra {kind} worker. You cannot see the parent conversation. \
The prompt you received is the entire brief. Do not spawn another Agent. \
Return a concise final answer when the work is done.{custom_block}"
    ))
}

fn available_subagent_types(working_dir: Option<&str>) -> Vec<String> {
    let mut types = vec!["explore".to_string(), "generalPurpose".to_string()];
    types.extend(
        load_custom_agent_types(working_dir)
            .into_iter()
            .map(|(name, _)| name),
    );
    types
}

fn load_custom_agent_types(working_dir: Option<&str>) -> Vec<(String, String)> {
    let Some(root) = working_dir.filter(|value| !value.is_empty()) else {
        return Vec::new();
    };
    let dir = PathBuf::from(root).join(".lyra").join("agents");
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut agents = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        if let Some(agent) = parse_custom_agent(&text) {
            agents.push(agent);
        }
    }
    agents.sort_by(|left, right| left.0.cmp(&right.0));
    agents
}

fn parse_custom_agent(text: &str) -> Option<(String, String)> {
    let trimmed = text.trim();
    if !trimmed.starts_with("---") {
        return None;
    }
    let rest = trimmed.strip_prefix("---")?;
    let (front, body) = rest.split_once("\n---")?;
    let mut name = None;
    for line in front.lines() {
        let (key, value) = line.split_once(':')?;
        if key.trim() == "name" {
            name = Some(value.trim().trim_matches('"').to_string());
        }
    }
    let name = name.filter(|value| !value.is_empty())?;
    Some((name, body.trim().to_string()))
}

pub(crate) async fn tool_agent(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    if is_subagent_session_id(session_id) {
        return Err(NativeToolFailure::new(
            "nested_agent_denied",
            "Child agents cannot spawn another agent.",
            "Finish the assigned work directly.",
        ));
    }
    if input.get("stop").and_then(Value::as_bool) == Some(true) {
        let child_id = string_opt(input, "subagent_id").ok_or_else(|| {
            NativeToolFailure::new(
                "missing_subagent_id",
                "stop requires subagent_id.",
                "Pass the child session id to interrupt.",
            )
        })?;
        interrupt_subagent(&child_id)?;
        return Ok(NativeToolSuccess {
            content: format!("Interrupted {child_id}."),
            raw: json!({ "subagentId": child_id, "status": "cancelled" }),
            recommended_next_action: None,
        });
    }
    let description = string_opt(input, "description").unwrap_or_else(|| "subagent".to_string());
    let prompt = string_opt(input, "prompt")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            NativeToolFailure::new(
                "missing_prompt",
                "Agent requires a self-contained prompt.",
                "Write the full task. The child cannot see this conversation.",
            )
        })?;
    let requested_type =
        string_opt(input, "subagent_type").unwrap_or_else(|| "generalPurpose".to_string());
    let background = input
        .get("run_in_background")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    let resume_id = string_opt(input, "subagent_id");
    let (child_id, working_dir, child_snapshot, subagent_record) = {
        let mut state = state().lock().map_err(|_| {
            NativeToolFailure::new(
                "runtime_state_unavailable",
                "agent runtime state lock failed",
                "Retry the Agent tool call.",
            )
        })?;
        let working_dir = {
            let parent = state.sessions.get(session_id).ok_or_else(|| {
                NativeToolFailure::new(
                    "session_not_found",
                    format!("session not found: {session_id}"),
                    "Retry in an active session.",
                )
            })?;
            if is_subagent_snapshot(&parent.snapshot) {
                return Err(NativeToolFailure::new(
                    "nested_agent_denied",
                    "Agent depth is 1.",
                    "Do the work in this session.",
                ));
            }
            parent
                .snapshot
                .get("workingDir")
                .and_then(Value::as_str)
                .map(str::to_string)
        };
        let allowed = available_subagent_types(working_dir.as_deref());
        if !allowed.iter().any(|name| name == &requested_type) {
            return Err(NativeToolFailure::new(
                "unknown_subagent_type",
                format!("Unknown subagent_type: {requested_type}"),
                format!("Use one of: {}", allowed.join(", ")),
            ));
        }
        let child_id = if let Some(existing) = resume_id.as_ref() {
            let child = state.sessions.get(existing.as_str()).ok_or_else(|| {
                NativeToolFailure::new(
                    "subagent_not_found",
                    format!("subagent not found: {existing}"),
                    "Spawn a new agent or pass a live subagent_id.",
                )
            })?;
            if parent_session_id_of(&child.snapshot).as_deref() != Some(session_id) {
                return Err(NativeToolFailure::new(
                    "subagent_not_found",
                    format!("subagent not found: {existing}"),
                    "Pass a child of this session.",
                ));
            }
            existing.clone()
        } else {
            let mut child = new_session(
                Some(description.clone()),
                working_dir.clone(),
                SUBAGENT_SESSION_KIND,
            );
            child.snapshot["workingDirIsHome"] = state
                .sessions
                .get(session_id)
                .and_then(|parent| parent.snapshot.get("workingDirIsHome"))
                .cloned()
                .unwrap_or(json!(false));
            let child_id = child.id.clone();
            child.snapshot["parentSessionId"] = json!(session_id);
            child.snapshot["subagent"] = json!({
                "type": requested_type,
                "origin": "spawn",
                "parentTurnId": turn_id,
                "parentToolCallId": tool_call_id,
                "background": background,
                "description": description,
            });
            if let Some(custom) = load_custom_agent_types(working_dir.as_deref())
                .into_iter()
                .find(|(name, _)| name == &requested_type)
            {
                child.snapshot["subagent"]["customPrompt"] = json!(custom.1);
            }
            remember_child(
                &mut state,
                session_id,
                &child_id,
                &description,
                &requested_type,
            );
            state.sessions.insert(child_id.clone(), child);
            state.save_state().map_err(|error| {
                NativeToolFailure::new(
                    "write_failed",
                    format!("failed to persist subagent: {error}"),
                    "Retry after checking runtime storage.",
                )
            })?;
            child_id
        };
        if let Some(child) = state.sessions.get_mut(&child_id) {
            child.snapshot["subagent"]["parentToolCallId"] = json!(tool_call_id);
            child.snapshot["subagent"]["parentTurnId"] = json!(turn_id);
            child.snapshot["subagent"]["background"] = json!(background);
            touch_session(child);
        }
        let child_snapshot = state
            .sessions
            .get(&child_id)
            .map(|session| session.snapshot.clone());
        let subagent_record = state
            .sessions
            .get(session_id)
            .and_then(|session| session.snapshot.get("subagents"))
            .and_then(Value::as_array)
            .and_then(|children| {
                children
                    .iter()
                    .find(|child| {
                        child.get("id").and_then(Value::as_str) == Some(child_id.as_str())
                    })
                    .cloned()
            });
        (child_id, working_dir, child_snapshot, subagent_record)
    };
    if let Some(snapshot) = child_snapshot {
        emit_with_callback(
            &event_callback(),
            json!({ "kind": "sessionSnapshot", "snapshot": snapshot }),
        );
    }
    if let Some(subagent) = subagent_record {
        emit_with_callback(
            &event_callback(),
            json!({
                "kind": "subagentStarted",
                "sessionId": session_id,
                "subagent": subagent,
            }),
        );
    }
    announce_running_subagent(
        session_id,
        turn_id,
        tool_call_id,
        input,
        &child_id,
        &description,
        background,
    );

    let send = send_turn(json!({
        "sessionId": child_id,
        "text": prompt,
        "uiHidden": false
    }))
    .map_err(|error| {
        NativeToolFailure::new(
            "spawn_failed",
            error.to_string(),
            "Retry the Agent tool call.",
        )
    })?;
    if background {
        track_background_child(session_id, turn_id, &child_id);
        return Ok(NativeToolSuccess {
            content: format!(
                "Started {description} ({requested_type}) in the background. subagent_id={child_id}"
            ),
            raw: json!({
                "subagentId": child_id,
                "status": "running",
                "background": true,
                "stillRunning": true,
                "turn": send,
                "workingDir": working_dir,
            }),
            recommended_next_action: Some(format!(
                "\"{description}\" is already running. Do not redo its files. Do not use ps, pgrep, git status, or its output file to decide whether it stopped. You will be notified when it finishes. Do not fabricate its result. If the remaining work overlaps those files, stop; otherwise do the non-overlapping slice. After it finishes, verify and todo_update any host todo it covered."
            )),
        });
    }

    let parent_cancellation = super::session_runtime::cancellation_token(turn_id);
    if wait_until_session_idle(&child_id, parent_cancellation.as_ref()).await {
        return Err(NativeToolFailure::cancelled(
            CANCEL_REASON_TURN_CANCELLED,
            "Agent spawn was cancelled while waiting for the subagent.",
            "Stop this tool call and continue only after a new user turn.",
        )
        .with_detail(json!({ "subagentId": child_id, "cancelledWhile": "waiting_for_subagent" })));
    }
    let (raw_status, text) = last_child_outcome(&child_id);
    let status = parent_index_status(&raw_status).to_string();
    emit_subagent_finished(session_id, turn_id, &child_id, &status, &text);
    Ok(NativeToolSuccess {
        content: if text.trim().is_empty() {
            format!("Agent {description} finished with status {status}.")
        } else {
            text
        },
        raw: json!({
            "subagentId": child_id,
            "status": status,
            "background": false,
            "workingDir": working_dir,
        }),
        recommended_next_action: None,
    })
}

fn announce_running_subagent(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
    child_id: &str,
    description: &str,
    background: bool,
) {
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_call_id,
            AGENT_SPAWN_MODEL_TOOL,
            description,
            "running",
            input.clone(),
            Some(json!({
                "content": "",
                "raw": {
                    "subagentId": child_id,
                    "status": "running",
                    "background": background
                }
            })),
            &now(),
            None,
        ),
        "toolUpdated",
    );
}

fn assistant_visible_text(message: &Value) -> String {
    let direct = message
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    if !direct.is_empty() {
        return direct.to_string();
    }
    message
        .get("blocks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn child_progress_from_snapshot(snapshot: &Value) -> String {
    snapshot
        .get("messages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|message| message.get("role").and_then(Value::as_str) == Some("assistant"))
        .filter(|message| {
            message
                .pointer("/metadata/isApiError")
                .and_then(Value::as_bool)
                != Some(true)
        })
        .map(assistant_visible_text)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
        .chars()
        .take(8_000)
        .collect()
}

fn child_progress_text(child_id: &str) -> String {
    let Ok(state) = state().lock() else {
        return String::new();
    };
    let Some(child) = state.sessions.get(child_id) else {
        return String::new();
    };
    child_progress_from_snapshot(&child.snapshot)
}

pub(crate) fn background_subagent_child_id(tool: &Value) -> Option<&str> {
    tool.pointer("/output/raw/subagentId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
}

pub(crate) fn is_background_subagent_card(tool: &Value) -> bool {
    tool.get("status").and_then(Value::as_str) == Some("running")
        && tool
            .pointer("/output/raw/background")
            .and_then(Value::as_bool)
            == Some(true)
        && background_subagent_child_id(tool).is_some()
}

/// Shape-only keep for a single-session pass. Child liveness is checked in
/// `reap_dead_background_workers` once every session is in the map.
pub(crate) fn is_live_background_subagent_tool(tool: &Value) -> bool {
    tool.get("status").and_then(Value::as_str) == Some("running")
        && background_subagent_child_id(tool).is_some()
        && tool
            .pointer("/output/raw/background")
            .and_then(Value::as_bool)
            == Some(true)
}

pub(crate) fn is_background_subagent_session(snapshot: &Value) -> bool {
    is_subagent_snapshot(snapshot)
        && snapshot
            .pointer("/subagent/background")
            .and_then(Value::as_bool)
            == Some(true)
}

pub(crate) fn child_session_is_live(session: &NativeSession) -> bool {
    session.snapshot.get("turnStatus").and_then(Value::as_str) == Some("running")
        || session
            .snapshot
            .get("activeTurnId")
            .and_then(Value::as_str)
            .is_some()
}

pub(crate) fn mirror_child_progress(child_id: &str, text: &str) {
    let collected = child_progress_text(child_id);
    let body = if collected.is_empty() {
        text.trim().to_string()
    } else {
        collected
    };
    if body.is_empty() {
        return;
    }
    publish_parent_subagent_tool(child_id, "running", &body);
}

fn parent_subagent_binding(child_id: &str) -> Option<(String, String, String, bool)> {
    let state = state().lock().ok()?;
    let child = state.sessions.get(child_id)?;
    let parent_id = parent_session_id_of(&child.snapshot)?;
    let tool_call_id = child
        .snapshot
        .pointer("/subagent/parentToolCallId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?
        .to_string();
    let description = child
        .snapshot
        .pointer("/subagent/description")
        .and_then(Value::as_str)
        .unwrap_or("Agent")
        .to_string();
    let background = child
        .snapshot
        .pointer("/subagent/background")
        .and_then(Value::as_bool)
        == Some(true);
    Some((parent_id, tool_call_id, description, background))
}

fn publish_parent_subagent_tool(child_id: &str, status: &str, text: &str) {
    let Some((parent_id, tool_call_id, description, background)) =
        parent_subagent_binding(child_id)
    else {
        return;
    };
    let ui_status = if status == "running" {
        "running"
    } else {
        "completed"
    };
    let event_kind = if ui_status == "running" {
        "toolUpdated"
    } else {
        "toolFinished"
    };
    let finished_at = if ui_status == "running" {
        None
    } else {
        Some(now())
    };
    let callback = event_callback();
    let tool = {
        let Ok(mut state) = state().lock() else {
            return;
        };
        let Some(parent) = state.sessions.get_mut(&parent_id) else {
            return;
        };
        let (started_at, input) = parent
            .snapshot
            .get("tools")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|tool| tool.get("id").and_then(Value::as_str) == Some(tool_call_id.as_str()))
            .map(|tool| {
                (
                    tool.get("startedAt")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    tool.get("input").cloned().unwrap_or(json!({})),
                )
            })
            .unwrap_or_else(|| (String::new(), json!({})));
        let started_at = if started_at.is_empty() {
            now()
        } else {
            started_at
        };
        let tool = tool_activity(
            &tool_call_id,
            AGENT_SPAWN_MODEL_TOOL,
            &description,
            ui_status,
            input,
            Some(json!({
                "content": text,
                "raw": {
                    "subagentId": child_id,
                    "status": status,
                    "background": background
                }
            })),
            &started_at,
            finished_at,
        );
        super::activity::upsert_tool(&mut parent.snapshot, tool.clone());
        touch_session(parent);
        let _ = state.save_state();
        tool
    };
    emit_with_callback(
        &callback,
        json!({
            "kind": event_kind,
            "sessionId": parent_id,
            "tool": tool,
        }),
    );
}

pub(crate) const WORKER_REPORT_MAX_CHARS: usize = 32_000;

fn xml_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

pub(crate) fn clip_worker_report(text: &str) -> String {
    tool_protocol::clip_chars_head_tail(
        text,
        WORKER_REPORT_MAX_CHARS,
        "[Worker report truncated; middle omitted.]",
    )
}

pub(crate) fn format_worker_completion_envelope(
    child_id: &str,
    description: &str,
    status: &str,
    report: &str,
) -> String {
    let body = clip_worker_report(report);
    format!(
        "A background worker finished. This is that worker's report, not a member request. Fold it into the original request together with every other finished worker and any distinct work done here. Do not hunt other surfaces for the report. Do not re-survey a slice a worker already covered.\n\n<lyra-worker-result subagent_id=\"{}\" description=\"{}\" status=\"{}\">\n{body}\n</lyra-worker-result>",
        xml_attr(child_id),
        xml_attr(description),
        xml_attr(status)
    )
}

fn worker_completion_already_delivered(parent: &NativeSession, child_id: &str) -> bool {
    parent
        .snapshot
        .get("subagents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|child| child.get("id").and_then(Value::as_str) == Some(child_id))
        .and_then(|child| child.get("completionDelivered").and_then(Value::as_bool))
        == Some(true)
}

fn mark_worker_completion_delivered(parent: &mut NativeSession, child_id: &str) {
    let Some(children) = parent
        .snapshot
        .get_mut("subagents")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    for child in children {
        if child.get("id").and_then(Value::as_str) == Some(child_id) {
            child["completionDelivered"] = json!(true);
        }
    }
}

pub(crate) fn append_worker_completion_envelope(
    parent_id: &str,
    child_id: &str,
    description: &str,
    status: &str,
    report: &str,
) -> Option<Value> {
    let text = format_worker_completion_envelope(child_id, description, status, report);
    let mut message = json!({
        "id": format!("message-{}", Uuid::new_v4()),
        "role": "system",
        "text": text,
        "createdAt": now(),
        "metadata": {
            "kind": "subagent-completion",
            "uiHidden": true,
            "subagentId": child_id,
        }
    });
    let created_at = message
        .get("createdAt")
        .and_then(Value::as_str)
        .map(str::to_string);
    super::pinned_context::stamp_message_timestamps(&mut message, created_at.as_deref());
    let callback = event_callback();
    {
        let Ok(mut state) = state().lock() else {
            return None;
        };
        let Some(parent) = state.sessions.get_mut(parent_id) else {
            return None;
        };
        if worker_completion_already_delivered(parent, child_id) {
            return None;
        }
        push_session_message(parent, message.clone());
        mark_worker_completion_delivered(parent, child_id);
        touch_session(parent);
        let _ = state.save_state();
    }
    emit_with_callback(
        &callback,
        json!({
            "kind": "messageCommitted",
            "sessionId": parent_id,
            "message": message
        }),
    );
    Some(message)
}

fn poke_parent_after_background_subagent(
    parent_id: &str,
    child_id: &str,
    status: &str,
    text: &str,
) {
    let Some((_, _, description, background)) = parent_subagent_binding(child_id) else {
        return;
    };
    if !background {
        return;
    }
    append_worker_completion_envelope(parent_id, child_id, &description, status, text);
    poke_parent_roster(parent_id);
}

pub(crate) fn remember_child(
    state: &mut NativeRuntimeState,
    parent_id: &str,
    child_id: &str,
    description: &str,
    subagent_type: &str,
) {
    let Some(parent) = state.sessions.get_mut(parent_id) else {
        return;
    };
    let mut children = parent
        .snapshot
        .get("subagents")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    children.push(json!({
        "id": child_id,
        "description": description,
        "type": subagent_type,
        "origin": "spawn",
        "status": "running",
    }));
    parent.snapshot["subagents"] = Value::Array(children);
    touch_session(parent);
}

fn track_background_child(parent_id: &str, parent_turn_id: &str, child_id: &str) {
    let parent_id = parent_id.to_string();
    let parent_turn_id = parent_turn_id.to_string();
    let child_id = child_id.to_string();
    super::turn_engine::runtime().spawn(async move {
        wait_until_session_idle(&child_id, None).await;
        let (raw_status, text) = last_child_outcome(&child_id);
        let status = parent_index_status(&raw_status).to_string();
        emit_subagent_finished(&parent_id, &parent_turn_id, &child_id, &status, &text);
    });
}

fn emit_subagent_finished(
    parent_id: &str,
    turn_id: &str,
    child_id: &str,
    status: &str,
    text: &str,
) {
    mark_child_status(parent_id, child_id, status);
    publish_parent_subagent_tool(child_id, status, text);
    emit_with_callback(
        &event_callback(),
        json!({
            "kind": "subagentFinished",
            "sessionId": parent_id,
            "turnId": turn_id,
            "subagentId": child_id,
            "status": status,
            "text": text,
        }),
    );
    poke_parent_after_background_subagent(parent_id, child_id, status, text);
}

fn child_roster_status<'a>(parent: &'a NativeSession, child_id: &str) -> Option<&'a str> {
    parent
        .snapshot
        .get("subagents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .find(|child| child.get("id").and_then(Value::as_str) == Some(child_id))
        .and_then(|child| child.get("status").and_then(Value::as_str))
}

fn roster_claims_inflight(status: Option<&str>) -> bool {
    matches!(status, Some("running" | "continuing"))
}

pub(crate) fn mark_child_status_on_parent(
    parent: &mut NativeSession,
    child_id: &str,
    status: &str,
) -> bool {
    let Some(children) = parent
        .snapshot
        .get_mut("subagents")
        .and_then(Value::as_array_mut)
    else {
        return false;
    };
    let mut changed = false;
    for child in children {
        if child.get("id").and_then(Value::as_str) == Some(child_id)
            && child.get("status").and_then(Value::as_str) != Some(status)
        {
            child["status"] = json!(status);
            changed = true;
        }
    }
    if changed {
        touch_session(parent);
    }
    changed
}

pub(crate) fn mark_child_status(parent_id: &str, child_id: &str, status: &str) {
    if let Ok(mut state) = state().lock()
        && let Some(parent) = state.sessions.get_mut(parent_id)
    {
        if mark_child_status_on_parent(parent, child_id, status) {
            let _ = state.save_state();
        }
    }
}

#[derive(Clone, Debug, Default)]
pub(crate) struct StartupBackgroundRecovery {
    pub continue_child_ids: Vec<String>,
    pub poke_parent_ids: Vec<String>,
    pub live_waiters: Vec<(String, String, String)>,
}

impl StartupBackgroundRecovery {
    pub(crate) fn is_empty(&self) -> bool {
        self.continue_child_ids.is_empty()
            && self.poke_parent_ids.is_empty()
            && self.live_waiters.is_empty()
    }
}

static PENDING_STARTUP_RECOVERY: OnceLock<std::sync::Mutex<Option<StartupBackgroundRecovery>>> =
    OnceLock::new();
static STARTUP_RECOVERY_SPAWN: Once = Once::new();

fn pending_startup_recovery() -> &'static std::sync::Mutex<Option<StartupBackgroundRecovery>> {
    PENDING_STARTUP_RECOVERY.get_or_init(|| std::sync::Mutex::new(None))
}

pub(crate) fn stage_startup_background_recovery(recovery: StartupBackgroundRecovery) {
    if let Ok(mut slot) = pending_startup_recovery().lock() {
        *slot = Some(recovery);
    }
}

pub(crate) fn spawn_startup_background_recovery_if_needed() {
    STARTUP_RECOVERY_SPAWN.call_once(|| {
        let recovery = pending_startup_recovery()
            .lock()
            .ok()
            .and_then(|mut slot| slot.take())
            .unwrap_or_default();
        if recovery.is_empty() {
            return;
        }
        #[cfg(not(test))]
        thread::spawn(move || apply_startup_background_recovery(recovery));
        #[cfg(test)]
        {
            let _ = recovery;
        }
    });
}

fn interrupted_agent_card_content(progress: &str, continuing: bool) -> String {
    let suffix = if continuing {
        RUNTIME_INTERRUPT_CONTINUING
    } else {
        RUNTIME_INTERRUPT_STOPPED
    };
    if progress.trim().is_empty() {
        suffix.to_string()
    } else {
        format!("{progress}\n\n{suffix}")
    }
}

fn settle_dead_background_agent_card(
    parent: &mut NativeSession,
    child_id: &str,
    progress: &str,
    continuing: bool,
) -> bool {
    let finished_at = now();
    let Some(tools) = parent
        .snapshot
        .get_mut("tools")
        .and_then(Value::as_array_mut)
    else {
        return false;
    };
    let mut changed = false;
    for tool in tools.iter_mut() {
        if background_subagent_child_id(tool) != Some(child_id) {
            continue;
        }
        if tool.get("status").and_then(Value::as_str) != Some("running") {
            continue;
        }
        let content = interrupted_agent_card_content(progress, continuing);
        tool["status"] = json!("cancelled");
        tool["finishedAt"] = json!(finished_at.clone());
        let mut raw = tool
            .pointer("/output/raw")
            .cloned()
            .unwrap_or_else(|| json!({}));
        if let Some(object) = raw.as_object_mut() {
            object.insert("subagentId".to_string(), json!(child_id));
            object.insert("background".to_string(), json!(true));
            object.insert("status".to_string(), json!("interrupted"));
        }
        tool["output"] = json!({
            "content": content,
            "raw": raw
        });
        changed = true;
    }
    if changed {
        touch_session(parent);
    }
    changed
}

pub(crate) fn reap_dead_background_workers(
    sessions: &mut HashMap<String, NativeSession>,
    startup_cancelled_background_children: &[String],
) -> StartupBackgroundRecovery {
    let live_ids: HashSet<String> = sessions
        .iter()
        .filter(|(_, session)| child_session_is_live(session))
        .map(|(id, _)| id.clone())
        .collect();
    let continue_set: HashSet<String> = startup_cancelled_background_children
        .iter()
        .filter(|id| sessions.contains_key(*id))
        .cloned()
        .collect();
    let progress_by_child: HashMap<String, String> = sessions
        .iter()
        .filter(|(_, session)| is_subagent_snapshot(&session.snapshot))
        .map(|(id, session)| (id.clone(), child_progress_from_snapshot(&session.snapshot)))
        .collect();

    let mut poke_parent_ids = HashSet::new();
    let parent_ids: Vec<String> = sessions
        .iter()
        .filter(|(_, session)| !is_subagent_snapshot(&session.snapshot))
        .map(|(id, _)| id.clone())
        .collect();

    for parent_id in parent_ids {
        let Some(parent) = sessions.get_mut(&parent_id) else {
            continue;
        };
        let child_ids: HashSet<String> = parent
            .snapshot
            .get("tools")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(background_subagent_child_id)
            .map(str::to_string)
            .chain(
                parent
                    .snapshot
                    .get("subagents")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|child| child.get("id").and_then(Value::as_str))
                    .map(str::to_string),
            )
            .collect();
        let mut parent_changed = false;
        for child_id in child_ids {
            if live_ids.contains(&child_id) {
                continue;
            }
            let continuing = continue_set.contains(&child_id);
            let progress = progress_by_child
                .get(&child_id)
                .cloned()
                .unwrap_or_default();
            if continuing {
                let card_changed =
                    settle_dead_background_agent_card(parent, &child_id, &progress, true);
                let roster_changed = mark_child_status_on_parent(parent, &child_id, "interrupted");
                if card_changed || roster_changed {
                    parent_changed = true;
                }
                poke_parent_ids.insert(parent_id.clone());
                continue;
            }
            let claims_inflight = roster_claims_inflight(child_roster_status(parent, &child_id));
            let card_changed =
                settle_dead_background_agent_card(parent, &child_id, &progress, false);
            let roster_changed = if claims_inflight {
                mark_child_status_on_parent(parent, &child_id, "cancelled")
            } else {
                false
            };
            if card_changed || roster_changed {
                parent_changed = true;
            }
        }
        if parent_changed {
            touch_session(parent);
        }
    }

    let live_waiters = sessions
        .iter()
        .filter(|(_, session)| {
            is_background_subagent_session(&session.snapshot) && child_session_is_live(session)
        })
        .filter_map(|(child_id, session)| {
            let parent_id = parent_session_id_of(&session.snapshot)?;
            let parent_turn_id = session
                .snapshot
                .pointer("/subagent/parentTurnId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            Some((parent_id, parent_turn_id, child_id.clone()))
        })
        .collect();

    let mut continue_child_ids: Vec<String> = continue_set.into_iter().collect();
    continue_child_ids.sort();
    let mut poke_parent_ids: Vec<String> = poke_parent_ids.into_iter().collect();
    poke_parent_ids.sort();
    StartupBackgroundRecovery {
        continue_child_ids,
        poke_parent_ids,
        live_waiters,
    }
}

pub(crate) fn poke_parent_roster(parent_id: &str) {
    match resume_idle_turn(parent_id) {
        Ok(result) if result.get("sent") == Some(&Value::Bool(false)) => {
            super::poke::enqueue_idle_session_poke(
                parent_id,
                SUBAGENT_ROSTER_POKE_MARKER.to_string(),
            );
        }
        _ => {}
    }
}

#[cfg_attr(test, allow(dead_code))]
pub(crate) fn apply_startup_background_recovery(recovery: StartupBackgroundRecovery) {
    for (parent_id, parent_turn_id, child_id) in &recovery.live_waiters {
        track_background_child(parent_id, parent_turn_id, child_id);
    }
    let mut poke_parents: HashSet<String> = recovery.poke_parent_ids.into_iter().collect();
    for child_id in recovery.continue_child_ids {
        let binding = parent_subagent_binding(&child_id);
        let sent = match send_turn(json!({
            "sessionId": child_id,
            "text": SUBAGENT_CONTINUE_PROMPT,
            "uiHidden": true,
            "goalContinuation": true,
            "onlyIfIdle": true
        })) {
            Ok(result) if result.get("sent") == Some(&Value::Bool(false)) => false,
            Ok(_) => true,
            Err(_) => false,
        };
        if let Some((parent_id, _, _, _)) = binding {
            if sent {
                mark_child_status(&parent_id, &child_id, "continuing");
                let parent_turn_id = state()
                    .lock()
                    .ok()
                    .and_then(|state| {
                        state.sessions.get(&child_id).and_then(|session| {
                            session
                                .snapshot
                                .pointer("/subagent/parentTurnId")
                                .and_then(Value::as_str)
                                .map(str::to_string)
                        })
                    })
                    .unwrap_or_default();
                track_background_child(&parent_id, &parent_turn_id, &child_id);
            }
            poke_parents.insert(parent_id);
        }
    }
    let mut poke_parents: Vec<String> = poke_parents.into_iter().collect();
    poke_parents.sort();
    for parent_id in poke_parents {
        poke_parent_roster(&parent_id);
    }
}

fn interrupt_subagent(child_id: &str) -> Result<(), NativeToolFailure> {
    let turn_id = state()
        .lock()
        .ok()
        .and_then(|state| {
            state.sessions.get(child_id).and_then(|session| {
                session
                    .snapshot
                    .get("activeTurnId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
        })
        .ok_or_else(|| {
            NativeToolFailure::new(
                "subagent_idle",
                format!("{child_id} is not running."),
                "Nothing to interrupt.",
            )
        })?;
    super::session_runtime::request_turn_cancellation(&turn_id);
    Ok(())
}

/// Waits until the child session goes idle. Returns true when the wait was
/// aborted by `cancellation` (the parent turn ended) instead of the child
/// finishing.
pub(crate) async fn wait_until_session_idle(
    session_id: &str,
    cancellation: Option<&tokio_util::sync::CancellationToken>,
) -> bool {
    let notify = session_idle_notify(session_id);
    loop {
        let running = state()
            .lock()
            .ok()
            .and_then(|state| state.sessions.get(session_id).cloned())
            .is_some_and(|session| {
                session.snapshot.get("turnStatus").and_then(Value::as_str) == Some("running")
                    || session
                        .snapshot
                        .get("activeTurnId")
                        .and_then(Value::as_str)
                        .is_some()
            });
        if !running {
            return false;
        }
        tokio::select! {
            _ = notify.notified() => {}
            _ = tokio::time::sleep(Duration::from_millis(200)) => {}
            _ = async {
                match cancellation {
                    Some(token) => token.cancelled().await,
                    None => std::future::pending::<()>().await,
                }
            } => {
                return true;
            }
        }
    }
}

fn parent_index_status(raw: &str) -> &str {
    match raw {
        "cancelled" | "cancelled_by_user" | "interrupted" => "cancelled",
        "running" => "running",
        _ => "idle",
    }
}

fn last_child_outcome(child_id: &str) -> (String, String) {
    let Some(session) = state()
        .lock()
        .ok()
        .and_then(|state| state.sessions.get(child_id).cloned())
    else {
        return ("missing".to_string(), String::new());
    };
    let status = session
        .snapshot
        .get("turnStatus")
        .and_then(Value::as_str)
        .unwrap_or("idle")
        .to_string();
    let text = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .rev()
        .find(|message| message.get("role").and_then(Value::as_str) == Some("assistant"))
        .and_then(|message| message.get("text").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string();
    (status, text)
}

pub(crate) fn snapshot_has_running_workers(snapshot: &Value) -> bool {
    snapshot
        .get("subagents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .any(|child| {
            matches!(
                child.get("status").and_then(Value::as_str),
                Some("running" | "continuing")
            )
        })
}

fn path_mentioned_in(haystack: &str, relative_path: &str) -> bool {
    let relative_lower = relative_path.replace('\\', "/").to_lowercase();
    let file_name = Path::new(relative_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(relative_path)
        .to_lowercase();
    let haystack = haystack.to_lowercase();
    (!relative_lower.is_empty() && haystack.contains(&relative_lower))
        || (!file_name.is_empty() && haystack.contains(&file_name))
}

pub(crate) fn owned_by_running_worker(snapshot: &Value, relative_path: &str) -> Option<String> {
    owned_by_running_worker_with_prompts(snapshot, relative_path, &[])
}

fn owned_by_running_worker_with_prompts(
    snapshot: &Value,
    relative_path: &str,
    extra_prompts: &[(String, String)],
) -> Option<String> {
    for child in snapshot
        .get("subagents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if child.get("status").and_then(Value::as_str) != Some("running") {
            continue;
        }
        let child_id = child.get("id").and_then(Value::as_str).unwrap_or("");
        let description = child
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let mut haystacks = vec![description.to_string()];
        if let Some((_, prompt)) = extra_prompts.iter().find(|(id, _)| id == child_id) {
            haystacks.push(prompt.clone());
        }
        if haystacks
            .iter()
            .any(|text| path_mentioned_in(text, relative_path))
        {
            return Some(if description.is_empty() {
                child_id.to_string()
            } else {
                description.to_string()
            });
        }
    }
    None
}

pub(crate) fn reject_if_running_worker_owns_path(
    session_id: &str,
    relative_path: &str,
) -> Result<(), NativeToolFailure> {
    if is_subagent_session_id(session_id) {
        return Ok(());
    }
    let (snapshot, extra_prompts) = {
        let Ok(state) = state().lock() else {
            return Ok(());
        };
        let Some(parent) = state.sessions.get(session_id) else {
            return Ok(());
        };
        let snapshot = parent.snapshot.clone();
        let extra_prompts = snapshot
            .get("subagents")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter(|child| child.get("status").and_then(Value::as_str) == Some("running"))
            .filter_map(|child| {
                let id = child.get("id").and_then(Value::as_str)?;
                let prompt = state.sessions.get(id).map(|session| {
                    latest_user_text(
                        session
                            .snapshot
                            .get("messages")
                            .and_then(Value::as_array)
                            .map(|items| items.as_slice())
                            .unwrap_or(&[]),
                    )
                })?;
                Some((id.to_string(), prompt))
            })
            .collect::<Vec<_>>();
        (snapshot, extra_prompts)
    };
    if let Some(owner) =
        owned_by_running_worker_with_prompts(&snapshot, relative_path, &extra_prompts)
    {
        return Err(NativeToolFailure::new(
            "worker_owns_file",
            format!("A running worker ({owner}) owns {relative_path}."),
            "Do not overwrite a live worker's output file. Write a different remaining artifact, or wait until that worker finishes.",
        ));
    }
    Ok(())
}

pub(crate) fn goal_incomplete_for_session<'a>(
    _snapshot: &Value,
    todos: &'a [Value],
) -> Vec<&'a Value> {
    todos
        .iter()
        .filter(|todo| {
            matches!(
                todo.get("status").and_then(Value::as_str),
                Some("pending" | "in_progress")
            )
        })
        .collect()
}

pub(crate) fn delete_child_sessions(state: &mut NativeRuntimeState, parent_id: &str) {
    let child_ids = state
        .sessions
        .values()
        .filter(|session| parent_session_id_of(&session.snapshot).as_deref() == Some(parent_id))
        .map(|session| session.id.clone())
        .collect::<Vec<_>>();
    for child_id in child_ids {
        state.sessions.remove(&child_id);
        let _ = delete_session_store(&state.root, &child_id);
    }
}
