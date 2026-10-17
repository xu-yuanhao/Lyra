use super::*;

pub(crate) fn create_session(payload: Value) -> AgentRuntimeResult<Value> {
    let title = string_opt(&payload, "title");
    let working_dir = string_opt(&payload, "workingDir")
        .filter(|path| !path.trim().is_empty())
        .map(|path| projects::normalized_path(&path))
        .transpose()?;
    let session = new_session(title, working_dir, "normal");
    projects::register_snapshot(&session.snapshot)?;
    let session_id = session.id.clone();
    let (root, session, callback) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        state.active_session_id = Some(session.id.clone());
        state.sessions.insert(session.id.clone(), session);
        state.save_state()?;
        let session =
            state.sessions.get(&session_id).cloned().ok_or_else(|| {
                AgentRuntimeError::Core(format!("session not found: {session_id}"))
            })?;
        (state.root.clone(), session, event_callback())
    };
    flush_state()?;
    let mut snapshot = session.snapshot.clone();
    snapshot["ledger"] = record_session_created(&root, &session);
    emit_with_callback(
        &callback,
        json!({ "kind": "sessionSnapshot", "snapshot": snapshot }),
    );
    spawn_project_lsp_warmup(&snapshot);
    Ok(snapshot)
}

pub(crate) fn read_cli_follow(payload: Value) -> AgentRuntimeResult<Value> {
    let session_id = string_opt(&payload, "sessionId");
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let id = state.resolve_session_id(session_id)?;
    let session = state
        .sessions
        .get(&id)
        .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
    Ok(session
        .snapshot
        .get("cli")
        .and_then(|cli| cli.get("follow"))
        .cloned()
        .unwrap_or_else(|| {
            json!({
                "sessionId": id,
                "enabled": false,
                "terminalSessionId": Value::Null,
                "terminalPaneId": Value::Null,
                "terminalTabId": Value::Null
            })
        }))
}

pub(crate) fn update_cli_follow(payload: Value) -> AgentRuntimeResult<Value> {
    let session_id = string_opt(&payload, "sessionId");
    let enabled = payload
        .get("enabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let terminal_session_id = string_opt(&payload, "terminalSessionId");
    let terminal_pane_id = string_opt(&payload, "terminalPaneId");
    let terminal_tab_id = string_opt(&payload, "terminalTabId");
    let (id, snapshot, callback) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let id = state.resolve_session_id(session_id)?;
        let session = state
            .sessions
            .get_mut(&id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
        let follow = json!({
            "sessionId": id,
            "enabled": enabled,
            "terminalSessionId": terminal_session_id,
            "terminalPaneId": terminal_pane_id,
            "terminalTabId": terminal_tab_id
        });
        let snapshot = session.snapshot.as_object_mut().ok_or_else(|| {
            AgentRuntimeError::Core("session snapshot is not an object".to_string())
        })?;
        let cli = snapshot.entry("cli").or_insert_with(|| json!({}));
        if !cli.is_object() {
            *cli = json!({});
        }
        cli.as_object_mut()
            .expect("cli snapshot object")
            .insert("follow".to_string(), follow);
        touch_session(session);
        let snapshot = session.snapshot.clone();
        let callback = event_callback();
        state.save_state()?;
        (id, snapshot, callback)
    };
    emit_with_callback(
        &callback,
        json!({ "kind": "sessionSnapshot", "snapshot": snapshot }),
    );
    read_cli_follow(json!({ "sessionId": id }))
}

pub(crate) fn new_session(
    title: Option<String>,
    working_dir: Option<String>,
    kind: &str,
) -> NativeSession {
    let id = format!("session-{}", Uuid::new_v4());
    let created_at = now();
    // Untitled sessions carry a null title. The runtime must not pick a
    // display language — the frontend renders its localized placeholder
    // (aiPanel.defaultSessionTitle) for null/empty titles.
    let title = title
        .filter(|value| !value.trim().is_empty())
        .map(Value::String)
        .unwrap_or(Value::Null);
    // Every session is bound to a working directory. When the caller does not
    // specify one (the user sent a message without choosing a project), default
    // to the user's home directory rather than leaving the session unbound. The
    // `workingDirIsHome` flag lets the UI label the binding "Home" instead of
    // showing the home folder's basename (the OS username).
    let requested_dir = working_dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let working_dir_is_home = requested_dir.is_none();
    let working_dir = requested_dir.unwrap_or_else(home_working_dir);
    let project_bound = !working_dir.trim().is_empty();
    let mut snapshot = json!({
        "id": id,
        "title": title,
        "sessionKind": kind,
        "workingDir": working_dir,
        "projectBound": project_bound,
        "workingDirIsHome": working_dir_is_home,
        "messages": [],
        "tools": [],
        "todos": [],

        "turnStatus": "idle",
        "activeTurnId": Value::Null,
        "follow": { "running": false, "activity": Value::Null },
        "sessionResilience": {
            "blockedBrowser": Value::Null,
            "updatedAt": Value::Null
        },
        "taskMilestones": [],
        "updatedAt": created_at,
        "memory": Value::Null
    });
    NativeSession {
        id,
        snapshot,
        created_at,
        saved: false,
        save_label: None,
        archived: false,
        custom_title: None,
        short_name: None,
        runtime_turns: Vec::new(),
        rollback_checkpoints: Vec::new(),
        file_read_state: HashMap::new(),
        provider_protocol_log: vec![],
        dirty: true,
        dialog_dirty_from: Some(0),
        persisted_dialog_len: 0,
        dialog_loaded: true,
        ephemeral: false,
        stream_journal_sequence: 0,
    }
}

/// Build an ephemeral session seeded with the parent session's active plan and
/// todo context. Ephemeral sessions back the temporary plan-chat capsule: they
/// are never persisted, never listed, never active, and discarded on close.
/// `seeding` is the initial user/system message that embeds the plan context
/// and the temp-chat role instructions.
fn new_ephemeral_session(
    working_dir: Option<String>,
    parent_session_id: &str,
    seeding: Value,
) -> NativeSession {
    let id = format!("session-{}", Uuid::new_v4());
    let created_at = now();
    let requested_dir = working_dir
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let working_dir_is_home = requested_dir.is_none();
    let working_dir = requested_dir.unwrap_or_else(home_working_dir);
    let project_bound = !working_dir.trim().is_empty();
    let snapshot = json!({
        "id": id,
        "title": "Plan chat",
        "sessionKind": "temporary",
        "workingDir": working_dir,
        "projectBound": project_bound,
        "workingDirIsHome": working_dir_is_home,
        "parentSessionId": parent_session_id,
        "ephemeral": true,
        "messages": [seeding],
        "tools": [],
        "todos": [],
        "turnStatus": "idle",
        "activeTurnId": Value::Null,
        "follow": { "running": false, "activity": Value::Null },
        "sessionResilience": {
            "blockedBrowser": Value::Null,
            "updatedAt": Value::Null
        },
        "taskMilestones": [],
        "updatedAt": created_at,
        "memory": Value::Null
    });
    NativeSession {
        id,
        snapshot,
        created_at,
        saved: false,
        save_label: None,
        archived: false,
        custom_title: None,
        short_name: None,
        runtime_turns: Vec::new(),
        rollback_checkpoints: Vec::new(),
        file_read_state: HashMap::new(),
        provider_protocol_log: vec![],
        dirty: false,
        dialog_dirty_from: None,
        persisted_dialog_len: 1,
        dialog_loaded: true,
        ephemeral: true,
        stream_journal_sequence: 0,
    }
}

/// Build the seed message for a temporary plan-chat session. It embeds the
/// parent session's active plan markdown, annotations, title, and todo so the
/// temp agent can discuss/explain/propose changes without re-reading state, and
/// constrains it to discussion only (no execution tools).
fn temp_chat_seed_message(plan: &Value, todo: &Value) -> Value {
    let title = plan.get("title").and_then(Value::as_str).unwrap_or("");
    let markdown = plan
        .get("markdown")
        .and_then(Value::as_str)
        .unwrap_or("(empty plan)");
    let annotations = plan
        .get("annotations")
        .filter(|value| value.is_array())
        .cloned()
        .unwrap_or_else(|| Value::Array(Vec::new()));
    let todo_json = if todo.is_null() {
        "(no todo list yet)".to_string()
    } else {
        serde_json::to_string_pretty(todo).unwrap_or_else(|_| "(todo)".to_string())
    };
    let body = format!(
        "You are a temporary plan-discussion assistant. The user is reviewing the plan below \
inside the Lyra Plan Board and wants to discuss it before deciding.\n\n\
Rules:\n\
- Explain, answer questions, and propose improvements to the plan.\n\
- Do NOT execute the task. Do NOT call execution tools (apply_patch, edit_file, write_file, \
exec_command mutations, browser/terminal mutations).\n\
- Keep replies concise and grounded in the plan text.\n\
- If the user wants a change applied to the plan, emit the revised plan Markdown in a fenced \
```plan block so the UI can offer \"apply to plan\".\n\n\
Plan title: {title}\n\n\
Plan Markdown:\n\
```plan\n{markdown}\n```\n\n\
Annotations:\n{annotations}\n\n\
Current todo:\n{todo_json}"
    );
    json!({
        "messageId": format!("msg-{}", Uuid::new_v4()),
        "role": "user",
        "kind": "note",
        "text": body,
        "createdAt": now(),
        "uiHidden": false
    })
}

/// `agent.session.createTemporary` — create an ephemeral, plan-chat session
/// seeded with the parent session's active plan/todo. Returns the new session
/// snapshot. The session is not persisted, not listed, and not made active.
pub(crate) fn create_temporary_session(payload: Value) -> AgentRuntimeResult<Value> {
    let parent_session_id = string_opt(&payload, "parentSessionId")
        .ok_or_else(|| AgentRuntimeError::Core("parentSessionId is required".to_string()))?;
    let (session, callback) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let parent = state.sessions.get(&parent_session_id).ok_or_else(|| {
            AgentRuntimeError::Core(format!("session not found: {parent_session_id}"))
        })?;
        let working_dir = parent
            .snapshot
            .get("workingDir")
            .and_then(Value::as_str)
            .map(str::to_string);
        let plan = parent
            .snapshot
            .get("plan")
            .filter(|value| value.is_object())
            .cloned()
            .unwrap_or_else(|| json!({ "title": "", "markdown": "" }));
        let todo = parent
            .snapshot
            .get("projectTodo")
            .cloned()
            .unwrap_or(Value::Null);
        let seed = temp_chat_seed_message(&plan, &todo);
        let mut session = new_ephemeral_session(working_dir, &parent_session_id, seed);
        session.snapshot["workingDirIsHome"] = parent
            .snapshot
            .get("workingDirIsHome")
            .cloned()
            .unwrap_or(json!(false));
        let snapshot = session.snapshot.clone();
        // Insert but deliberately do NOT set active_session_id and do NOT
        // save_state — ephemeral sessions are in-memory only.
        state.sessions.insert(session.id.clone(), session);
        (snapshot, event_callback())
    };
    emit_with_callback(
        &callback,
        json!({ "kind": "sessionSnapshot", "snapshot": session.clone() }),
    );
    Ok(session)
}

// Resolve the user's home directory across platforms, falling back to the
// process working directory if the home directory cannot be determined.
pub(crate) fn home_working_dir() -> String {
    dirs::home_dir()
        .map(|path| path.display().to_string())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(current_working_dir)
}

pub(crate) fn current_working_dir() -> String {
    env::current_dir()
        .map(|path| path.display().to_string())
        .unwrap_or_else(|_| ".".to_string())
}

pub(crate) fn read_session(payload: Value) -> AgentRuntimeResult<Value> {
    let requested_session_id = string_opt(&payload, "sessionId");
    let runtime_root = runtime_root();
    let (root, id, snapshot) = match state().try_lock() {
        Ok(mut state) => {
            let root = state.root.clone();
            let id = state.resolve_session_id(requested_session_id)?;
            state.ensure_dialog(&id)?;
            let session = state
                .sessions
                .get(&id)
                .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
            (root, id, session.snapshot.clone())
        }
        Err(std::sync::TryLockError::WouldBlock) => {
            // ponytail: Prefer a short retry over disk. A turn holds the lock
            // per token; disk used to return an empty created session and made
            // child inspectors look stuck until the final persist. Do not
            // blocking-lock here — the mutex is not reentrant.
            let mut recovered = None;
            for _ in 0..25 {
                std::thread::sleep(std::time::Duration::from_millis(2));
                match state().try_lock() {
                    Ok(mut state) => {
                        let root = state.root.clone();
                        let id = state.resolve_session_id(requested_session_id.clone())?;
                        state.ensure_dialog(&id)?;
                        let session = state.sessions.get(&id).ok_or_else(|| {
                            AgentRuntimeError::Core(format!("session not found: {id}"))
                        })?;
                        recovered = Some((root, id, session.snapshot.clone()));
                        break;
                    }
                    Err(std::sync::TryLockError::WouldBlock) => continue,
                    Err(std::sync::TryLockError::Poisoned(_)) => {
                        return Err(AgentRuntimeError::Core(
                            "agent runtime state lock failed".to_string(),
                        ));
                    }
                }
            }
            match recovered {
                Some(value) => value,
                None => read_session_snapshot_from_disk(&runtime_root, requested_session_id)?,
            }
        }
        Err(std::sync::TryLockError::Poisoned(_)) => {
            return Err(AgentRuntimeError::Core(
                "agent runtime state lock failed".to_string(),
            ));
        }
    };
    let mut snapshot = snapshot;
    snapshot["memoryCandidates"] = json!(
        list_memory_candidates(&root, Some("pending"), 20)?
            .iter()
            .map(memory_candidate_json)
            .collect::<Vec<_>>()
    );
    snapshot["proactiveEvents"] = json!(
        list_proactive_events(&root, Some("pending"), 20)?
            .iter()
            .filter(|event| event.session_id.as_deref().is_none_or(|value| value == id))
            .map(proactive_event_json)
            .collect::<Vec<_>>()
    );
    snapshot["ledger"] = session_ledger_summary(&root, &id);
    Ok(snapshot)
}

// Wire-bound read windows. Reference shape (codex pages of 25-100, opencode
// 50-200, ZCode tail window of 60 rows): the initial view is a fixed tail
// window, and the response fits its transport frame BY CONSTRUCTION — fixed
// per-item caps × fixed window counts have a computable worst case. None of
// the reference projects shrinks payload content at runtime to fit a budget;
// over-budget is a named, fail-closed rejection (the lyrad wire guard).
// Worst case at full windows:
//   200 × (16KiB text + ~1KiB blocks) + 200 × (8KiB preview + 2KiB input)
//   ≈ 5.4MiB < SESSION_RESPONSE_BYTE_BUDGET (6MiB) < the client's 8MiB frame cap.
const SESSION_MESSAGE_WINDOW: usize = 200;
const SESSION_TOOL_WINDOW: usize = 200;
const SESSION_MESSAGE_TEXT_MAX_BYTES: usize = 16 * 1024;
const SESSION_TOOL_OUTPUT_PREVIEW_MAX_BYTES: usize = 8 * 1024;
const SESSION_TOOL_INPUT_MAX_BYTES: usize = 2 * 1024;

/// Renderer-facing session projection. The persisted session remains complete,
/// while initial IPC reads stay bounded even for very long-running tasks.
pub(crate) fn read_session_window(payload: Value) -> AgentRuntimeResult<Value> {
    let message_limit = payload
        .get("messageLimit")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(SESSION_MESSAGE_WINDOW)
        .clamp(1, SESSION_MESSAGE_WINDOW);
    let output_preview_bytes = payload
        .get("toolOutputPreviewChars")
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(SESSION_TOOL_OUTPUT_PREVIEW_MAX_BYTES)
        .clamp(256, SESSION_TOOL_OUTPUT_PREVIEW_MAX_BYTES);
    let mut snapshot = read_session(payload)?;
    project_session_window(&mut snapshot, message_limit, output_preview_bytes);
    Ok(snapshot)
}

// Caps are byte-based: a char cap lets CJK text triple its wire cost
// (3 bytes per char), which is exactly how a "32K chars" session grew to
// 7.9MB on the wire. Truncation lands on a char boundary.
fn truncate_bytes(value: &str, max_bytes: usize) -> String {
    if value.len() <= max_bytes {
        return value.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…[truncated {} bytes]", &value[..end], value.len() - end)
}

fn cap_message_text(message: &mut Value, max_bytes: usize) {
    let Some(Value::String(text)) = message.get_mut("text") else {
        return;
    };
    if text.len() > max_bytes {
        *text = truncate_bytes(text, max_bytes);
    }
}

// Provider replay state is runtime-internal resume data: it is persisted in
// session state and protocol checkpoints, and no renderer code reads these
// keys. No reference project ships protocol state inside UI messages (codex
// records rollout items separately; ZCode ships windowed UI rows), so the UI
// projection drops it — one turn's replay copy (full transcript + protocol
// steps) cannot dominate the read window's wire cost.
const RUNTIME_INTERNAL_METADATA_KEYS: &[&str] = &[
    "providerProtocol",
    "providerTranscript",
    "openaiResponsesReplay",
];

fn strip_runtime_internal_metadata(message: &mut Value) {
    let Some(metadata) = message.get_mut("metadata").and_then(Value::as_object_mut) else {
        return;
    };
    for key in RUNTIME_INTERNAL_METADATA_KEYS {
        metadata.remove(*key);
    }
}

fn cap_tool_input_strings(value: &mut Value, max_bytes: usize) {
    match value {
        Value::String(text) => {
            if text.len() > max_bytes {
                *text = truncate_bytes(text, max_bytes);
            }
        }
        Value::Array(items) => {
            for item in items {
                cap_tool_input_strings(item, max_bytes);
            }
        }
        Value::Object(map) => {
            for (_, item) in map.iter_mut() {
                cap_tool_input_strings(item, max_bytes);
            }
        }
        _ => {}
    }
}

fn compact_tool_outputs(snapshot: &mut Value, output_preview_bytes: usize) {
    if let Some(tools) = snapshot.get_mut("tools").and_then(Value::as_array_mut) {
        for tool in tools {
            let artifact_refs = tool.get("artifactRefs").cloned().unwrap_or(Value::Null);
            let Some(output) = tool.get_mut("output") else {
                continue;
            };
            let Ok(serialized) = serde_json::to_string(output) else {
                continue;
            };
            if serialized.len() <= output_preview_bytes {
                continue;
            }
            let mut preview_end = output_preview_bytes.min(serialized.len());
            while preview_end > 0 && !serialized.is_char_boundary(preview_end) {
                preview_end -= 1;
            }
            *output = json!({
                "preview": &serialized[..preview_end],
                "truncated": true,
                "originalBytes": serialized.len(),
                "artifactRefs": artifact_refs,
            });
        }
    }
}

fn project_session_window(snapshot: &mut Value, message_limit: usize, output_preview_bytes: usize) {
    if let Some(messages) = snapshot.get_mut("messages").and_then(Value::as_array_mut) {
        let total = messages.len();
        let omitted = total.saturating_sub(message_limit);
        if omitted > 0 {
            messages.drain(..omitted);
        }
        snapshot["messageWindow"] = json!({
            "start": omitted,
            "count": messages.len(),
            "total": total,
            "hasEarlier": omitted > 0,
        });
    }

    if let Some(tools) = snapshot.get_mut("tools").and_then(Value::as_array_mut) {
        let total = tools.len();
        let omitted = total.saturating_sub(SESSION_TOOL_WINDOW);
        if omitted > 0 {
            tools.drain(..omitted);
        }
        snapshot["toolsWindow"] = json!({
            "start": omitted,
            "count": tools.len(),
            "total": total,
            "hasEarlier": omitted > 0,
        });
    }

    if let Some(messages) = snapshot.get_mut("messages").and_then(Value::as_array_mut) {
        for message in messages.iter_mut() {
            strip_runtime_internal_metadata(message);
            cap_message_text(message, SESSION_MESSAGE_TEXT_MAX_BYTES);
        }
    }
    if let Some(tools) = snapshot.get_mut("tools").and_then(Value::as_array_mut) {
        for tool in tools.iter_mut() {
            if let Some(input) = tool.get_mut("input") {
                cap_tool_input_strings(input, SESSION_TOOL_INPUT_MAX_BYTES);
            }
        }
    }
    compact_tool_outputs(
        snapshot,
        output_preview_bytes.min(SESSION_TOOL_OUTPUT_PREVIEW_MAX_BYTES),
    );

    // No budget loop: windows and per-item byte caps above bound the response
    // by construction (see the constants). If a pathological snapshot still
    // exceeds the budget, the lyrad wire guard rejects that one request with
    // RUNTIME_RESPONSE_TOO_LARGE — the reference behavior (claw-code
    // RequestBodySizeExceeded, ZCode fail-closed) is to fail loudly, never to
    // silently mangle content.
}

/// Compatibility escape hatch for opening one full tool result on demand.
/// Unlike `read_session`, this never transfers the rest of the session.
pub(crate) fn read_session_tool_artifact(payload: Value) -> AgentRuntimeResult<Value> {
    let tool_id = string_opt(&payload, "toolId")
        .ok_or_else(|| AgentRuntimeError::Core("toolId is required".to_string()))?;
    let snapshot = read_session(json!({ "sessionId": string_opt(&payload, "sessionId") }))?;
    snapshot
        .get("tools")
        .and_then(Value::as_array)
        .and_then(|tools| {
            tools
                .iter()
                .find(|tool| tool.get("id").and_then(Value::as_str) == Some(tool_id.as_str()))
        })
        .map(|tool| {
            json!({
                "sessionId": snapshot.get("id").cloned().unwrap_or(Value::Null),
                "toolId": tool_id,
                "output": tool.get("output").cloned().unwrap_or(Value::Null),
                "artifactRefs": tool.get("artifactRefs").cloned().unwrap_or(Value::Null),
            })
        })
        .ok_or_else(|| AgentRuntimeError::Core(format!("tool not found: {tool_id}")))
}

#[cfg(test)]
mod session_window_tests {
    use super::*;

    // The worst case the windows and per-item byte caps can produce must stay
    // under this budget (and under the client's 8MiB frame cap); the lyrad
    // wire guard rejects anything above its own 7MiB cap as a named failure.
    const SESSION_RESPONSE_BYTE_BUDGET: usize = 6 * 1024 * 1024;

    #[test]
    fn keeps_only_the_requested_message_tail_and_compacts_large_tool_output() {
        let mut snapshot = json!({
            "messages": [
                { "id": "one" },
                { "id": "two" },
                { "id": "three" }
            ],
            "tools": [{
                "id": "tool-1",
                "output": { "content": "x".repeat(500) },
                "artifactRefs": [{ "id": "artifact-1" }]
            }]
        });

        project_session_window(&mut snapshot, 2, 256);

        assert_eq!(snapshot["messages"][0]["id"], "two");
        assert_eq!(snapshot["messageWindow"]["start"], 1);
        assert_eq!(snapshot["messageWindow"]["total"], 3);
        assert_eq!(snapshot["tools"][0]["output"]["truncated"], true);
        assert_eq!(
            snapshot["tools"][0]["output"]["artifactRefs"][0]["id"],
            "artifact-1"
        );
    }

    #[test]
    fn tool_tail_window_keeps_the_most_recent_calls() {
        let mut snapshot = json!({
            "messages": [],
            "tools": (0..450)
                .map(|index| json!({ "id": format!("tool-{index}"), "output": { "content": "ok" } }))
                .collect::<Vec<_>>()
        });

        project_session_window(&mut snapshot, 500, 16_384);

        let tools = snapshot["tools"].as_array().unwrap();
        assert_eq!(tools.len(), SESSION_TOOL_WINDOW);
        assert_eq!(
            tools[0]["id"],
            format!("tool-{}", 450 - SESSION_TOOL_WINDOW)
        );
        assert_eq!(snapshot["toolsWindow"]["total"], 450);
        assert_eq!(snapshot["toolsWindow"]["hasEarlier"], true);
    }

    #[test]
    fn giant_message_text_and_tool_input_echoes_are_capped_by_bytes() {
        // "汉" is 3 bytes in UTF-8: a char-based cap lets CJK text triple its
        // wire cost, which is how a "32K chars" session reached 7.9MB.
        let cjk = "汉".repeat(100_000);
        let mut snapshot = json!({
            "messages": [{ "id": "one", "text": cjk }],
            "tools": [{
                "id": "tool-1",
                "input": { "command": "y".repeat(50_000) },
                "output": { "content": "ok" }
            }]
        });

        project_session_window(
            &mut snapshot,
            SESSION_MESSAGE_WINDOW,
            SESSION_TOOL_OUTPUT_PREVIEW_MAX_BYTES,
        );

        let text = snapshot["messages"][0]["text"].as_str().unwrap();
        assert!(text.len() <= SESSION_MESSAGE_TEXT_MAX_BYTES + 40);
        assert!(text.contains("[truncated"));
        let input = snapshot["tools"][0]["input"]["command"].as_str().unwrap();
        assert!(input.len() <= SESSION_TOOL_INPUT_MAX_BYTES + 40);
    }

    #[test]
    fn response_fits_the_budget_by_construction_at_full_windows() {
        // Regression (two layers): (1) an >8MB readWindow frame used to
        // destroy the whole runtime connection on startup; (2) the
        // shrink-to-fit loop that replaced it silently exited when its first
        // step was a no-op (huge message texts, small tool outputs) and
        // shipped 7.9MB anyway. Reference projects (codex/opencode/ZCode)
        // bound by construction instead: fixed per-item caps × fixed window
        // counts with a computable worst case — no runtime shrink loop.
        let mut snapshot = json!({
            "messages": (0..500)
                .map(|index| json!({
                    "id": format!("msg-{index}"),
                    "text": "汉".repeat(20_000),
                    "blocks": [{ "type": "tool", "toolId": format!("tool-{index}") }]
                }))
                .collect::<Vec<_>>(),
            "tools": (0..600)
                .map(|index| json!({
                    "id": format!("tool-{index}"),
                    "input": { "command": "y".repeat(30_000) },
                    "output": { "content": "o".repeat(30_000) },
                    "artifactRefs": [{ "id": format!("artifact-{index}") }]
                }))
                .collect::<Vec<_>>()
        });

        project_session_window(
            &mut snapshot,
            SESSION_MESSAGE_WINDOW,
            SESSION_TOOL_OUTPUT_PREVIEW_MAX_BYTES,
        );

        let bytes = serde_json::to_vec(&snapshot).unwrap().len();
        assert!(
            bytes <= SESSION_RESPONSE_BYTE_BUDGET,
            "projected response is {bytes} bytes, above the budget"
        );
        let messages = snapshot["messages"].as_array().unwrap();
        assert_eq!(messages.len(), SESSION_MESSAGE_WINDOW);
        assert_eq!(messages[messages.len() - 1]["id"], "msg-499");
        let tools = snapshot["tools"].as_array().unwrap();
        assert_eq!(tools.len(), SESSION_TOOL_WINDOW);
    }

    #[test]
    fn ui_projection_drops_runtime_internal_replay_metadata() {
        // metadata.providerTranscript carried a full recorded provider
        // conversation (including base64 captures) inside every turn's
        // session message; it is resume state the renderer never reads. The
        // projection drops it instead of paying its wire cost — old sessions
        // with fat metadata become readable without any migration.
        let mut snapshot = json!({
            "messages": [{
                "id": "msg-1",
                "text": "done",
                "metadata": {
                    "providerProtocol": { "version": 2, "assistant": { "content": "x".repeat(200_000) } },
                    "providerTranscript": [{ "role": "tool", "content": "y".repeat(200_000) }],
                    "openaiResponsesReplay": [{ "type": "reasoning", "content": "z" }],
                    "transcriptCitations": [{ "id": "cite-1" }]
                }
            }]
        });

        project_session_window(&mut snapshot, 10, 4_096);

        let metadata = &snapshot["messages"][0]["metadata"];
        assert!(metadata.get("providerProtocol").is_none());
        assert!(metadata.get("providerTranscript").is_none());
        assert!(metadata.get("openaiResponsesReplay").is_none());
        assert_eq!(metadata["transcriptCitations"][0]["id"], "cite-1");
    }
}

fn read_session_snapshot_from_disk(
    root: &Path,
    requested_session_id: Option<String>,
) -> AgentRuntimeResult<(PathBuf, String, Value)> {
    let id = resolve_session_id_from_disk(root, requested_session_id)?;
    let session = load_session(root, &id)?
        .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
    Ok((root.to_path_buf(), id, session.snapshot))
}

fn resolve_session_id_from_disk(
    root: &Path,
    requested_session_id: Option<String>,
) -> AgentRuntimeResult<String> {
    match requested_session_id.as_deref() {
        Some("active") | None => read_json::<NativeStateFile>(&root.join("state.json"))
            .and_then(|state| state.active_session_id)
            .or_else(|| latest_session_id_from_disk(root).ok().flatten())
            .ok_or_else(|| {
                AgentRuntimeError::Core(
                    "session unavailable while agent runtime state is busy".to_string(),
                )
            }),
        Some(id) => Ok(id.to_string()),
    }
}

fn latest_session_id_from_disk(root: &Path) -> AgentRuntimeResult<Option<String>> {
    let mut sessions = Vec::new();
    for session_id in list_session_ids(root)? {
        if let Some(session) = load_session(root, &session_id)? {
            let updated = session
                .snapshot
                .get("updatedAt")
                .and_then(Value::as_str)
                .unwrap_or(&session.created_at)
                .to_string();
            sessions.push((updated, session_id));
        }
    }
    sessions.sort_by(|left, right| right.0.cmp(&left.0));
    Ok(sessions
        .into_iter()
        .next()
        .map(|(_, session_id)| session_id))
}

pub(crate) fn list_sessions(payload: Value) -> AgentRuntimeResult<Value> {
    let limit = payload
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(100)
        .min(500) as usize;
    let root = runtime_root();
    // ponytail: list is an index read. OpenCode session.list / Codex thread/list
    // never hydrate transcripts. Calling state() here used to get_or_init(load)
    // every sqlite blob before the history pane could paint.
    let mut sessions = match try_state() {
        Some(mutex) => match mutex.try_lock() {
            Ok(state) => {
                let mut summaries = state
                    .sessions
                    .values()
                    .filter(|session| should_list_session(session))
                    .map(session_summary)
                    .collect::<Vec<_>>();
                for diagnostic in &state.tool_runtime_migration_diagnostics {
                    if diagnostic.get("kind").and_then(Value::as_str)
                        == Some("session-database-load")
                        && let Some(id) = diagnostic.get("sessionId").and_then(Value::as_str)
                        && !state.sessions.contains_key(id)
                        && session_db_path(&root, id).is_file()
                    {
                        summaries.push(session_database_error_summary(
                            &root,
                            id,
                            diagnostic
                                .get("error")
                                .and_then(Value::as_str)
                                .unwrap_or("Unable to load session database"),
                        ));
                    }
                }
                summaries
            }
            Err(std::sync::TryLockError::WouldBlock) => list_session_summaries_from_meta(&root),
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err(AgentRuntimeError::Core(
                    "agent runtime state lock failed".to_string(),
                ));
            }
        },
        None => list_session_summaries_from_meta(&root),
    };
    sessions.sort_by(|left, right| {
        right
            .get("updatedAt")
            .and_then(Value::as_str)
            .cmp(&left.get("updatedAt").and_then(Value::as_str))
    });
    sessions.truncate(limit);
    Ok(json!({
        "sessionsDir": root.join("sessions").display().to_string(),
        "sessions": sessions,
    }))
}

pub(crate) fn set_saved(payload: Value, saved: bool) -> AgentRuntimeResult<Value> {
    let id = required_session_id(&payload)?;
    mutate_session(&id, |session| {
        session.saved = saved;
        session.save_label = if saved {
            string_opt(&payload, "label").or_else(|| Some("Saved".to_string()))
        } else {
            None
        };
        session.archived = false;
        touch_session(session);
        Ok(session_summary(session))
    })
}

pub(crate) fn rename_session(payload: Value) -> AgentRuntimeResult<Value> {
    let id = required_session_id(&payload)?;
    let title = string_opt(&payload, "title").unwrap_or_else(|| DEFAULT_SESSION_TITLE.to_string());
    mutate_session(&id, |session| {
        session.custom_title = Some(title.clone());
        set_string(&mut session.snapshot, "title", title);
        touch_session(session);
        Ok(session_summary(session))
    })
}

pub(crate) fn archive_session(payload: Value) -> AgentRuntimeResult<Value> {
    let id = required_session_id(&payload)?;
    let archived = payload
        .get("archived")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    mutate_session(&id, |session| {
        session.archived = archived;
        touch_session(session);
        Ok(session_summary(session))
    })
}

pub(crate) fn delete_session(payload: Value) -> AgentRuntimeResult<Value> {
    let id = required_session_id(&payload)?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    delete_child_sessions(&mut state, &id);
    state.sessions.remove(&id);
    if state.active_session_id.as_deref() == Some(&id) {
        state.active_session_id = None;
    }
    let _ = delete_session_store(&state.root, &id);
    state.save_state()?;
    Ok(json!({ "sessionId": id, "deleted": true }))
}

pub(crate) fn bind_project(payload: Value) -> AgentRuntimeResult<Value> {
    let id = payload
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::to_string);
    let working_dir = string_opt(&payload, "workingDir")
        .ok_or_else(|| AgentRuntimeError::Core("workingDir is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let id = state.resolve_session_id(id)?;
    let session = state
        .sessions
        .get_mut(&id)
        .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
    // Re-binding a session to a different project is intentionally not supported:
    // a session's accumulated tool history, file-read state, and rollback
    // checkpoints are all relative to its original root, so switching roots would
    // silently desynchronize them. Once a session is bound to a *real* project the
    // binding is permanent. A home-defaulted session (projectBound=true but
    // workingDirIsHome=true) may still be bound to a real project exactly once.
    // The UI removes the change-project affordance; this is the matching guard.
    let project_bound = session
        .snapshot
        .get("projectBound")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let is_home = session
        .snapshot
        .get("workingDirIsHome")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if project_bound && !is_home {
        return Err(AgentRuntimeError::Core(
            "session is already bound to a project and cannot be rebound".to_string(),
        ));
    }
    let working_dir = projects::normalized_path(&working_dir)?;
    projects::register_snapshot(&json!({ "workingDir": working_dir, "workingDirIsHome": false }))?;
    set_string(&mut session.snapshot, "workingDir", working_dir.clone());
    set_bool(&mut session.snapshot, "projectBound", true);
    set_bool(&mut session.snapshot, "workingDirIsHome", false);
    touch_session(session);
    let snapshot = session.snapshot.clone();
    state.save_state()?;
    drop(state);
    spawn_project_lsp_warmup(&snapshot);
    Ok(snapshot)
}

fn spawn_project_lsp_warmup(snapshot: &Value) {
    let is_home = snapshot
        .get("workingDirIsHome")
        .and_then(Value::as_bool)
        .unwrap_or(true);
    if is_home {
        return;
    }
    let Some(project_root) = snapshot
        .get("workingDir")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
    else {
        return;
    };
    std::thread::spawn(move || {
        let _ = lyra_lsp_core::warmup_project_servers(&project_root);
    });
}
