use super::*;

pub(crate) async fn execute_todo_tool_adapter(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    tool_name: &str,
    display_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
) -> Value {
    execute_native_tool_adapter(
        session_id,
        turn_id,
        cancellation,
        tool_call_id,
        tool_name,
        display_name,
        action,
        arguments,
        started_at,
    )
    .await
}

pub(crate) fn tool_todo_read(session_id: &str) -> NativeToolResult {
    let todos = state()
        .lock()
        .map_err(|_| {
            NativeToolFailure::new(
                "runtime_state_unavailable",
                "agent runtime state lock failed",
                "Retry the tool call.",
            )
        })
        .and_then(|state| {
            let host_id = state
                .sessions
                .get(session_id)
                .map(|session| todo_host_session_id(session_id, &session.snapshot))
                .unwrap_or_else(|| session_id.to_string());
            Ok(state
                .sessions
                .get(&host_id)
                .and_then(|session| {
                    session
                        .snapshot
                        .pointer("/projectTodo/todos")
                        .or_else(|| session.snapshot.get("todos"))
                })
                .cloned()
                .unwrap_or_else(|| json!([])))
        })?;
    Ok(NativeToolSuccess {
        content: format!(
            "Current todos:\n{}\n\nThis path is read-only. To change status, call native todo_update, todo_write, or todo_finish.",
            serde_json::to_string_pretty(&todos).unwrap_or_default()
        ),
        raw: json!({ "todos": todos }),
        recommended_next_action: None,
    })
}

pub(crate) fn tool_todo_write(session_id: &str, turn_id: &str, input: &Value) -> NativeToolResult {
    let todos = input
        .get("todos")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "todos array is required",
                "Retry with a typed todos array.",
            )
        })?
        .iter()
        .enumerate()
        .map(|(index, todo)| normalize_todo_item(index, todo))
        .collect::<Result<Vec<_>, _>>()?;
    if todos.is_empty() {
        return Err(NativeToolFailure::new(
            "empty_todo_list",
            "todo_write requires a complete non-empty todo list.",
            "Retry with every ordered step needed to complete the approved plan.",
        ));
    }
    let (callback, project_todo, host_id) = {
        let mut state = state().lock().map_err(|_| {
            NativeToolFailure::new(
                "runtime_state_unavailable",
                "agent runtime state lock failed",
                "Retry the tool call.",
            )
        })?;
        let root = state.root.clone();
        let host_id = {
            let session = state.sessions.get(session_id).ok_or_else(|| {
                NativeToolFailure::new(
                    "session_not_found",
                    format!("session not found: {session_id}"),
                    "Retry in an active session.",
                )
            })?;
            todo_host_session_id(session_id, &session.snapshot)
        };
        let session = state.sessions.get_mut(&host_id).ok_or_else(|| {
            NativeToolFailure::new(
                "session_not_found",
                format!("session not found: {host_id}"),
                "Retry in an active session.",
            )
        })?;
        let plan_phase = session
            .snapshot
            .pointer("/plan/phase")
            .and_then(Value::as_str)
            .map(str::to_string);
        let has_project_todo = session
            .snapshot
            .get("projectTodo")
            .is_some_and(Value::is_object);
        session.snapshot["todos"] = Value::Array(todos.clone());
        if session.snapshot.get("plan").is_some_and(Value::is_object)
            && matches!(
                plan_phase.as_deref(),
                Some(PLAN_PHASE_PLANNING | PLAN_PHASE_REVIEWING)
            )
        {
            session.snapshot["plan"]["todos"] = Value::Array(todos.clone());
        }
        let project_todo = if plan_accepts_live_todos(plan_phase.as_deref(), has_project_todo)
            && let Some(plan_id) = session
                .snapshot
                .pointer("/plan/activePlanId")
                .and_then(Value::as_str)
                .map(str::to_string)
        {
            let version_id = session
                .snapshot
                .pointer("/plan/activeVersionId")
                .and_then(Value::as_str)
                .unwrap_or(&plan_id)
                .to_string();
            let project_todo = project_todo_snapshot(
                session
                    .snapshot
                    .pointer("/projectTodo/todoListId")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("todo-list-{}", Uuid::new_v4())),
                plan_id,
                version_id,
                "running",
                todos.clone(),
                None,
            );
            session.snapshot["projectTodo"] = project_todo.clone();
            session.snapshot["plan"]["phase"] =
                Value::String(PLAN_PHASE_EXECUTING_TODO.to_string());
            let scope = plan_scope_from_session(session);
            if let Some(plan) = session.snapshot.get("plan") {
                persist_plan_snapshot(&root, &host_id, &scope, plan)
                    .map_err(native_failure_from_runtime)?;
            }
            persist_project_todo_snapshot(&root, &scope, &project_todo)
                .map_err(native_failure_from_runtime)?;
            Some(project_todo)
        } else {
            None
        };
        touch_session(session);
        let callback = event_callback();
        state.save_state().map_err(|error| {
            NativeToolFailure::new(
                "write_failed",
                format!("failed to persist todos: {error}"),
                "Retry after checking runtime storage.",
            )
        })?;
        (callback, project_todo, host_id)
    };
    emit_with_callback(
        &callback,
        json!({
            "kind": "todoUpdated",
            "sessionId": host_id,
            "turnId": turn_id,
            "todos": todos,
        }),
    );
    if let Some(project_todo) = project_todo.clone() {
        emit_with_callback(
            &callback,
            json!({
                "kind": "projectTodoUpdated",
                "sessionId": host_id,
                "turnId": turn_id,
                "todo": project_todo,
            }),
        );
    }
    Ok(NativeToolSuccess {
        content: format!("Updated {} todos.", todos.len()),
        raw: json!({ "todos": todos, "projectTodo": project_todo }),
        recommended_next_action: Some(
            "Continue executing the next pending todo or mark completed items when done."
                .to_string(),
        ),
    })
}

pub(crate) fn tool_todo_update(session_id: &str, turn_id: &str, input: &Value) -> NativeToolResult {
    let todo_id = input
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "todo id is required",
                "Retry with the id of the todo to update.",
            )
        })?
        .to_string();
    let raw_status = input
        .get("status")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "todo status is required",
                "Retry with a supported todo status.",
            )
        })?;
    if !matches!(
        raw_status,
        "pending"
            | "in_progress"
            | "completed"
            | "cancelled"
            | "failed"
            | "skipped"
            | "running"
            | "active"
            | "done"
            | "complete"
            | "skip"
    ) {
        return Err(NativeToolFailure::new(
            "bad_request",
            format!("unsupported todo status: {raw_status}"),
            "Use pending, in_progress, completed, failed, skipped, or cancelled.",
        ));
    }
    let status = normalize_todo_status(raw_status);
    let note = input
        .get("note")
        .or_else(|| input.get("summary"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let evidence = input
        .get("evidence")
        .and_then(Value::as_str)
        .map(str::to_string);
    let evidence_ids = evidence_ids(input, "evidenceIds");
    let failure_reason = input
        .get("failureReason")
        .or_else(|| input.get("failure_reason"))
        .and_then(Value::as_str)
        .map(str::to_string);
    if matches!(status.as_str(), "failed" | "skipped")
        && failure_reason
            .as_deref()
            .is_none_or(|value| value.trim().is_empty())
    {
        return Err(NativeToolFailure::new(
            "todo_failure_reason_required",
            "A failed or skipped todo requires a concrete failure reason.",
            "Retry with failureReason describing the blocker or failed verification.",
        ));
    }
    update_project_todo(session_id, turn_id, |todos, _project_todo| {
        let resolved_id = resolve_todo_id(todos, todo_id.as_str())?;
        let mut found = false;
        for todo in todos.iter_mut() {
            if todo.get("id").and_then(Value::as_str) != Some(resolved_id.as_str()) {
                if status == "in_progress"
                    && todo.get("status").and_then(Value::as_str) == Some("in_progress")
                    && let Some(object) = todo.as_object_mut()
                {
                    object.insert("status".to_string(), Value::String("pending".to_string()));
                }
                continue;
            }
            found = true;
            if let Some(object) = todo.as_object_mut() {
                object.insert("status".to_string(), Value::String(status.clone()));
                if let Some(note) = note.clone() {
                    object.insert("note".to_string(), Value::String(note));
                }
                if let Some(evidence) = evidence.clone() {
                    object.insert("evidence".to_string(), Value::String(evidence));
                }
                if !evidence_ids.is_empty() {
                    object.insert(
                        "evidenceIds".to_string(),
                        Value::Array(evidence_ids.iter().cloned().map(Value::String).collect()),
                    );
                }
                if let Some(failure_reason) = failure_reason.clone() {
                    object.insert("failureReason".to_string(), Value::String(failure_reason));
                }
            }
        }
        if !found {
            return Err(todo_not_found_error(&todo_id, todos));
        }
        Ok((todo_list_status(todos), note))
    })
}

pub(crate) fn tool_todo_finish(session_id: &str, turn_id: &str, input: &Value) -> NativeToolResult {
    let status = input
        .get("status")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|status| matches!(*status, "completed" | "failed" | "cancelled"))
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "todo_finish requires status completed, failed, or cancelled",
                "Retry with the Goal's real terminal status.",
            )
        })?
        .to_string();
    let summary = input
        .get("summary")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|summary| !summary.is_empty())
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "todo_finish requires a non-empty summary",
                "Retry with a concise summary of the Goal's real outcome.",
            )
        })?
        .to_string();
    let design_finding_dispositions = input
        .get("designFindingDispositions")
        .or_else(|| input.get("design_finding_dispositions"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    update_project_todo(session_id, turn_id, |todos, project_todo| {
        // codex's update_goal(Complete) does NOT hard-require all sub-items
        // terminal. Auto-skip leftover non-terminal todos instead of blocking,
        // so the model can close a goal when remaining items are no longer
        // relevant or were handled implicitly.
        if status == "completed" {
            for todo in todos.iter_mut() {
                let is_terminal = matches!(
                    todo.get("status").and_then(Value::as_str),
                    Some("completed" | "failed" | "skipped" | "cancelled")
                );
                if !is_terminal {
                    if let Some(object) = todo.as_object_mut() {
                        object.insert("status".to_string(), Value::String("skipped".to_string()));
                        object.insert(
                            "failureReason".to_string(),
                            Value::String(
                                "Auto-skipped when the Goal was marked completed via todo_finish."
                                    .to_string(),
                            ),
                        );
                    }
                }
            }
        }
        project_todo["designFindingDispositions"] =
            Value::Array(design_finding_dispositions.clone());
        Ok((status.clone(), Some(summary.clone())))
    })
}

fn update_project_todo(
    session_id: &str,
    turn_id: &str,
    update: impl FnOnce(
        &mut Vec<Value>,
        &mut Value,
    ) -> Result<(String, Option<String>), NativeToolFailure>,
) -> NativeToolResult {
    let (callback, project_todo, todos, host_id) = {
        let mut state = state().lock().map_err(|_| {
            NativeToolFailure::new(
                "runtime_state_unavailable",
                "agent runtime state lock failed",
                "Retry the todo tool call.",
            )
        })?;
        let root = state.root.clone();
        let host_id = {
            let session = state.sessions.get(session_id).ok_or_else(|| {
                NativeToolFailure::new(
                    "session_not_found",
                    format!("session not found: {session_id}"),
                    "Retry in an active session.",
                )
            })?;
            todo_host_session_id(session_id, &session.snapshot)
        };
        let session = state.sessions.get_mut(&host_id).ok_or_else(|| {
            NativeToolFailure::new(
                "session_not_found",
                format!("session not found: {host_id}"),
                "Retry in an active session.",
            )
        })?;
        let mut project_todo = session
            .snapshot
            .get("projectTodo")
            .filter(|value| value.is_object())
            .cloned()
            .ok_or_else(|| {
                NativeToolFailure::new(
                    "todo_list_not_started",
                    "No project todo list exists.",
                    "Attach todos on the Plan before approval, or call todo_write during execution.",
                )
            })?;
        let mut todos = project_todo
            .get("todos")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let (status, summary) = update(&mut todos, &mut project_todo)?;
        project_todo["todos"] = Value::Array(todos.clone());
        project_todo["status"] = Value::String(status.clone());
        project_todo["currentIndex"] = json!(current_todo_index(&todos));
        if let Some(summary) = summary.clone() {
            project_todo["summary"] = Value::String(summary);
        }
        session.snapshot["todos"] = Value::Array(todos.clone());
        session.snapshot["projectTodo"] = project_todo.clone();
        let scope = plan_scope_from_session(session);
        if let Some(plan) = session.snapshot.get("plan") {
            persist_plan_snapshot(&root, &host_id, &scope, plan)
                .map_err(native_failure_from_runtime)?;
        }
        persist_project_todo_snapshot(&root, &scope, &project_todo)
            .map_err(native_failure_from_runtime)?;
        touch_session(session);
        let callback = event_callback();
        state.save_state().map_err(|error| {
            NativeToolFailure::new(
                "write_failed",
                format!("failed to persist todos: {error}"),
                "Retry after checking runtime storage.",
            )
        })?;
        (callback, project_todo, todos, host_id)
    };
    emit_with_callback(
        &callback,
        json!({
            "kind": "todoUpdated",
            "sessionId": host_id,
            "turnId": turn_id,
            "todos": todos,
        }),
    );
    emit_with_callback(
        &callback,
        json!({
            "kind": "projectTodoUpdated",
            "sessionId": host_id,
            "turnId": turn_id,
            "todo": project_todo,
        }),
    );
    Ok(NativeToolSuccess {
        content: "Updated project todo state.".to_string(),
        raw: json!({ "todos": todos, "projectTodo": project_todo }),
        recommended_next_action: Some("Continue executing the approved todo list.".to_string()),
    })
}

pub(crate) fn normalize_todo_item(index: usize, value: &Value) -> Result<Value, NativeToolFailure> {
    let content = value
        .get("content")
        .or_else(|| value.get("title"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "todo content is required",
                "Retry with non-empty content for every todo.",
            )
        })?;
    let status = value
        .get("status")
        .and_then(Value::as_str)
        .unwrap_or("pending")
        .trim();
    let status = normalize_todo_status(status);
    let blocked_by = value
        .get("blockedBy")
        .or_else(|| value.get("blocked_by"))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(|value| Value::String(value.to_string()))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    Ok(json!({
        "id": value
            .get("id")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("todo-{}", index + 1)),
        "content": content,
        "status": status,
        "priority": value
            .get("priority")
            .and_then(Value::as_str)
            .unwrap_or("normal"),
        "blockedBy": blocked_by,
        "note": value.get("note").or_else(|| value.get("summary")).cloned().unwrap_or(Value::Null),
        "evidence": value.get("evidence").cloned().unwrap_or(Value::Null),
        "evidenceIds": value.get("evidenceIds").or_else(|| value.get("evidence_ids")).cloned().unwrap_or_else(|| json!([])),
        "failureReason": value.get("failureReason").or_else(|| value.get("failure_reason")).cloned().unwrap_or(Value::Null),
    }))
}

fn evidence_ids(input: &Value, key: &str) -> Vec<String> {
    let mut ids = input
        .get(key)
        .or_else(|| input.get("evidence_ids"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    ids.sort();
    ids.dedup();
    ids
}

fn normalize_todo_status(status: &str) -> String {
    match status {
        "pending" | "in_progress" | "completed" | "cancelled" | "failed" | "skipped" => {
            status.to_string()
        }
        "running" | "active" => "in_progress".to_string(),
        "done" | "complete" => "completed".to_string(),
        "skip" => "skipped".to_string(),
        _ => "pending".to_string(),
    }
}

fn plan_accepts_live_todos(plan_phase: Option<&str>, has_project_todo: bool) -> bool {
    has_project_todo
        || matches!(
            plan_phase,
            Some(PLAN_PHASE_TODO_REQUIRED | PLAN_PHASE_EXECUTING | PLAN_PHASE_EXECUTING_TODO)
        )
}

pub(crate) fn parse_optional_todo_list(
    input: &Value,
) -> Result<Option<Vec<Value>>, NativeToolFailure> {
    let Some(value) = input.get("todos") else {
        return Ok(None);
    };
    let items = value.as_array().ok_or_else(|| {
        NativeToolFailure::new(
            "bad_request",
            "todos must be an array",
            "Retry with a typed todos array, or omit todos.",
        )
    })?;
    let todos = items
        .iter()
        .enumerate()
        .map(|(index, todo)| normalize_todo_item(index, todo))
        .collect::<Result<Vec<_>, _>>()?;
    Ok(Some(todos))
}

pub(crate) fn attach_draft_todos(session: &mut NativeSession, todos: Vec<Value>) {
    let value = Value::Array(todos);
    session.snapshot["todos"] = value.clone();
    if session.snapshot.get("plan").is_some_and(Value::is_object) {
        session.snapshot["plan"]["todos"] = value;
    }
}

pub(crate) fn collect_draft_todos(session: &NativeSession) -> Vec<Value> {
    if let Some(items) = session
        .snapshot
        .pointer("/plan/todos")
        .and_then(Value::as_array)
    {
        return normalize_todo_values(items);
    }
    if let Some(items) = session
        .snapshot
        .get("todos")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty())
    {
        return normalize_todo_values(items);
    }
    session
        .snapshot
        .pointer("/plan/markdown")
        .and_then(Value::as_str)
        .map(todos_from_markdown_checkboxes)
        .unwrap_or_default()
}

fn normalize_todo_values(items: &[Value]) -> Vec<Value> {
    items
        .iter()
        .enumerate()
        .filter_map(|(index, todo)| normalize_todo_item(index, todo).ok())
        .collect()
}

pub(crate) fn todos_from_markdown_checkboxes(markdown: &str) -> Vec<Value> {
    let mut todos = Vec::new();
    for line in markdown.lines() {
        let Some((done, content)) = markdown_checkbox_line(line) else {
            continue;
        };
        if content.is_empty() {
            continue;
        }
        let status = if done { "completed" } else { "pending" };
        if let Ok(item) = normalize_todo_item(
            todos.len(),
            &json!({ "content": content, "status": status }),
        ) {
            todos.push(item);
        }
    }
    todos
}

fn markdown_checkbox_line(line: &str) -> Option<(bool, &str)> {
    let rest = trim_markdown_list_prefix(line.trim())?;
    let (done, rest) = if let Some(rest) = rest.strip_prefix("[ ]") {
        (false, rest)
    } else if let Some(rest) = rest
        .strip_prefix("[x]")
        .or_else(|| rest.strip_prefix("[X]"))
    {
        (true, rest)
    } else {
        return None;
    };
    Some((done, rest.trim()))
}

fn trim_markdown_list_prefix(line: &str) -> Option<&str> {
    if let Some(rest) = line.strip_prefix("- ").or_else(|| line.strip_prefix("* ")) {
        return Some(rest);
    }
    let digits = line
        .chars()
        .take_while(|character| character.is_ascii_digit())
        .count();
    if digits > 0
        && line
            .get(digits..)
            .is_some_and(|rest| rest.starts_with(". "))
    {
        return Some(&line[digits + 2..]);
    }
    None
}

fn ensure_host_todo_in_progress(todos: &mut [Value]) {
    if todos
        .iter()
        .any(|todo| todo.get("status").and_then(Value::as_str) == Some("in_progress"))
    {
        return;
    }
    if let Some(todo) = todos
        .iter_mut()
        .find(|todo| todo.get("status").and_then(Value::as_str) == Some("pending"))
        && let Some(object) = todo.as_object_mut()
    {
        object.insert(
            "status".to_string(),
            Value::String("in_progress".to_string()),
        );
    }
}

pub(crate) fn activate_plan_todos(
    session: &mut NativeSession,
    root: &Path,
) -> AgentRuntimeResult<Option<Value>> {
    let mut todos = collect_draft_todos(session);
    if todos.is_empty() {
        return Ok(None);
    }
    ensure_host_todo_in_progress(&mut todos);
    let plan_id = session
        .snapshot
        .pointer("/plan/activePlanId")
        .and_then(Value::as_str)
        .ok_or_else(|| AgentRuntimeError::Core("activePlanId is required".to_string()))?
        .to_string();
    let version_id = session
        .snapshot
        .pointer("/plan/activeVersionId")
        .and_then(Value::as_str)
        .unwrap_or(&plan_id)
        .to_string();
    let todo_list_id = session
        .snapshot
        .pointer("/projectTodo/todoListId")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("todo-list-{}", Uuid::new_v4()));
    let project_todo = project_todo_snapshot(
        todo_list_id,
        plan_id,
        version_id,
        "running",
        todos.clone(),
        None,
    );
    session.snapshot["todos"] = Value::Array(todos.clone());
    session.snapshot["projectTodo"] = project_todo.clone();
    if session.snapshot.get("plan").is_some_and(Value::is_object) {
        session.snapshot["plan"]["todos"] = Value::Array(todos);
    }
    let scope = plan_scope_from_session(session);
    // todo_lists.plan_id FK requires the plan row first.
    if let Some(plan) = session.snapshot.get("plan") {
        persist_plan_snapshot(root, &session.id, &scope, plan)?;
    }
    persist_project_todo_snapshot(root, &scope, &project_todo)?;
    Ok(Some(project_todo))
}

pub(crate) fn migrate_legacy_todo_required_phase(
    session: &mut NativeSession,
    root: &Path,
) -> AgentRuntimeResult<bool> {
    if session
        .snapshot
        .pointer("/plan/phase")
        .and_then(Value::as_str)
        != Some(PLAN_PHASE_TODO_REQUIRED)
    {
        return Ok(false);
    }
    let project_todo = activate_plan_todos(session, root)?;
    let phase = if project_todo.is_some() {
        PLAN_PHASE_EXECUTING_TODO
    } else {
        PLAN_PHASE_EXECUTING
    };
    if session.snapshot.get("plan").is_some_and(Value::is_object) {
        session.snapshot["plan"]["phase"] = Value::String(phase.to_string());
        let scope = plan_scope_from_session(session);
        let plan = session.snapshot["plan"].clone();
        persist_plan_snapshot(root, &session.id, &scope, &plan)?;
    }
    Ok(project_todo.is_some())
}

fn project_todo_snapshot(
    todo_list_id: String,
    plan_id: String,
    version_id: String,
    status: &str,
    todos: Vec<Value>,
    summary: Option<String>,
) -> Value {
    json!({
        "todoListId": todo_list_id,
        "planId": plan_id,
        "versionId": version_id,
        "status": status,
        "currentIndex": current_todo_index(&todos),
        "todos": todos,
        "summary": summary,
    })
}

pub(crate) fn emit_project_todo_events(host_id: &str, snapshot: &Value) {
    let callback = event_callback();
    let todos = snapshot
        .pointer("/projectTodo/todos")
        .or_else(|| snapshot.get("todos"))
        .cloned()
        .unwrap_or_else(|| json!([]));
    emit_with_callback(
        &callback,
        json!({
            "kind": "todoUpdated",
            "sessionId": host_id,
            "todos": todos,
        }),
    );
    if let Some(project_todo) = snapshot
        .get("projectTodo")
        .filter(|value| value.is_object())
    {
        emit_with_callback(
            &callback,
            json!({
                "kind": "projectTodoUpdated",
                "sessionId": host_id,
                "todo": project_todo,
            }),
        );
    }
}

fn current_todo_index(todos: &[Value]) -> usize {
    todos
        .iter()
        .position(|todo| todo.get("status").and_then(Value::as_str) == Some("in_progress"))
        .or_else(|| {
            todos.iter().position(|todo| {
                !matches!(
                    todo.get("status").and_then(Value::as_str),
                    Some("completed" | "skipped" | "cancelled")
                )
            })
        })
        .unwrap_or_default()
}

fn todo_list_status(todos: &[Value]) -> String {
    let _ = todos;
    "running".to_string()
}

fn current_todo_ids(todos: &[Value]) -> Vec<String> {
    todos
        .iter()
        .filter_map(|todo| todo.get("id").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

fn format_todo_id_list(ids: &[String]) -> String {
    if ids.is_empty() {
        "(none)".to_string()
    } else {
        ids.join(", ")
    }
}

fn todo_not_found_error(requested: &str, todos: &[Value]) -> NativeToolFailure {
    let ids = current_todo_ids(todos);
    NativeToolFailure::new(
        "todo_not_found",
        format!(
            "todo not found: {requested}. Current ids: {}",
            format_todo_id_list(&ids)
        ),
        "Retry todo_update with an exact id from the current list.",
    )
}

fn resolve_todo_id(todos: &[Value], requested: &str) -> Result<String, NativeToolFailure> {
    let ids = current_todo_ids(todos);
    if ids.iter().any(|id| id == requested) {
        return Ok(requested.to_string());
    }
    let prefix_matches: Vec<&String> = ids.iter().filter(|id| id.starts_with(requested)).collect();
    match prefix_matches.as_slice() {
        [unique] => return Ok((*unique).clone()),
        [] => {}
        matches => {
            return Err(NativeToolFailure::new(
                "todo_not_found",
                format!(
                    "todo id {requested} is ambiguous; matches {}. Current ids: {}",
                    matches
                        .iter()
                        .map(|id| id.as_str())
                        .collect::<Vec<_>>()
                        .join(", "),
                    format_todo_id_list(&ids)
                ),
                "Retry todo_update with a unique id from the current list.",
            ));
        }
    }
    let infix_matches: Vec<&String> = ids.iter().filter(|id| id.contains(requested)).collect();
    match infix_matches.as_slice() {
        [unique] => Ok((*unique).clone()),
        [] => Err(todo_not_found_error(requested, todos)),
        matches => Err(NativeToolFailure::new(
            "todo_not_found",
            format!(
                "todo id {requested} is ambiguous; matches {}. Current ids: {}",
                matches
                    .iter()
                    .map(|id| id.as_str())
                    .collect::<Vec<_>>()
                    .join(", "),
                format_todo_id_list(&ids)
            ),
            "Retry todo_update with a unique id from the current list.",
        )),
    }
}

fn native_failure_from_runtime(error: AgentRuntimeError) -> NativeToolFailure {
    NativeToolFailure::new(
        "project_todo_store_failed",
        error.to_string(),
        "Retry after checking Lyra local storage.",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn todos(ids: &[&str]) -> Vec<Value> {
        ids.iter()
            .map(|id| json!({ "id": id, "content": id, "status": "pending" }))
            .collect()
    }

    #[test]
    fn todo_id_resolves_unique_prefix() {
        let items = todos(&["build-html", "verify-site"]);
        assert_eq!(resolve_todo_id(&items, "verify").unwrap(), "verify-site");
        assert_eq!(
            resolve_todo_id(&items, "verify-site").unwrap(),
            "verify-site"
        );
    }

    #[test]
    fn todo_id_resolves_unique_infix() {
        let items = todos(&["t1-research", "t5-js", "t6-verify-render", "t7-verify-a11y"]);
        assert_eq!(
            resolve_todo_id(&items, "verify-render").unwrap(),
            "t6-verify-render"
        );
        let missing = resolve_todo_id(&items, "t5-verify").expect_err("invented id");
        assert!(missing.message.contains("t5-js"));
        assert!(missing.message.contains("t6-verify-render"));
    }

    #[test]
    fn markdown_checkboxes_promote_to_todos() {
        let todos = todos_from_markdown_checkboxes(
            "# Plan\n\n- [ ] Build html\n- [x] Skip done\n1. [ ] Verify render\n\n- Not a todo\n",
        );
        assert_eq!(todos.len(), 3);
        assert_eq!(todos[0]["content"], "Build html");
        assert_eq!(todos[0]["status"], "pending");
        assert_eq!(todos[1]["status"], "completed");
        assert_eq!(todos[2]["content"], "Verify render");
    }

    #[test]
    fn markdown_without_checkboxes_does_not_invent_todos() {
        let todos = todos_from_markdown_checkboxes("# Plan\n\n- Build runtime support\n");
        assert!(todos.is_empty());
    }

    #[test]
    fn collect_draft_todos_honors_explicit_empty_over_checkboxes() {
        let mut session = new_session(Some("empty todos".to_string()), None, "normal");
        session.snapshot["plan"] = json!({
            "markdown": "- [ ] Invented\n",
            "todos": []
        });
        assert!(collect_draft_todos(&session).is_empty());
    }

    #[test]
    fn collect_draft_todos_promotes_checkboxes_when_todos_omitted() {
        let mut session = new_session(Some("checkbox todos".to_string()), None, "normal");
        session.snapshot["plan"] = json!({
            "markdown": "- [ ] Build html\n"
        });
        let todos = collect_draft_todos(&session);
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0]["content"], "Build html");
    }

    #[test]
    fn ensure_host_todo_in_progress_marks_the_first_pending_item() {
        let mut todos = vec![
            json!({ "id": "host", "content": "host work", "status": "pending" }),
            json!({ "id": "next", "content": "later work", "status": "pending" }),
        ];
        ensure_host_todo_in_progress(&mut todos);
        assert_eq!(todos[0]["status"], "in_progress");
        assert_eq!(todos[1]["status"], "pending");
    }

    #[test]
    fn todo_id_rejects_ambiguous_or_missing_prefix() {
        let items = todos(&["verify-html", "verify-site", "build-css"]);
        let ambiguous = resolve_todo_id(&items, "verify").expect_err("ambiguous");
        assert_eq!(ambiguous.code, "todo_not_found");
        assert!(ambiguous.message.contains("verify-html"));
        assert!(ambiguous.message.contains("verify-site"));
        let missing = resolve_todo_id(&items, "ship").expect_err("missing");
        assert!(missing.message.contains("build-css"));
        assert!(missing.message.contains("Current ids"));
    }
}
