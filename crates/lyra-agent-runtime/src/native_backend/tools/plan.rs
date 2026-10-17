use super::*;

pub(crate) async fn execute_plan_tool_adapter(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    tool_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
) -> Value {
    let mut input = native_tool_input(action, arguments);
    if let Some(object) = input.as_object_mut() {
        object.insert(
            "toolPath".to_string(),
            Value::String(format!("/tools/plan/{action}")),
        );
        object.insert("domain".to_string(), Value::String("plan".to_string()));
    }
    record_plan_activity(
        session_id,
        turn_id,
        tool_call_id,
        tool_name,
        "running",
        input.clone(),
        None,
        started_at,
        None,
    );
    if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
        let output = cancelled_tool_output(
            CANCEL_REASON_TURN_CANCELLED,
            "Plan tool call was cancelled.",
            "Stop this tool call and continue only after a new user turn.",
            None,
        );
        record_plan_activity(
            session_id,
            turn_id,
            tool_call_id,
            tool_name,
            "cancelled",
            input,
            Some(output.clone()),
            started_at,
            Some(now()),
        );
        return output;
    }

    let result = match action {
        "begin" => tool_plan_begin(session_id, turn_id, &input),
        "write" => tool_plan_write(session_id, turn_id, &input),
        "finalize" => tool_plan_finalize(session_id, turn_id, &input),
        "revise" => tool_plan_revise(session_id, turn_id, &input),
        _ => Err(NativeToolFailure::new(
            "tool_not_found",
            format!("Unknown plan tool action: {action}"),
            "Use plan_begin, plan_write, plan_finalize, or plan_revise.",
        )),
    };
    let (status, output) = match result {
        Ok(success) => {
            let output = budgeted_tool_output(
                session_id,
                turn_id,
                tool_call_id,
                success.content,
                success.raw,
                success.recommended_next_action,
            );
            ("completed", output)
        }
        Err(error) => (
            "failed",
            tool_failure_output(
                &error.code,
                &error.message,
                &error.recommended_next_action,
                error.detail,
            ),
        ),
    };
    record_plan_activity(
        session_id,
        turn_id,
        tool_call_id,
        tool_name,
        status,
        input,
        Some(output.clone()),
        started_at,
        Some(now()),
    );
    output
}

pub(crate) fn plan_gate_model_tool(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    tool_name: &str,
    arguments: Value,
    started_at: &str,
) -> Option<Value> {
    let gate_state = active_plan_gate_state(session_id)?;
    let phase = gate_state.phase;
    let mutation_tool = matches!(
        tool_name,
        "apply_patch" | WRITE_FILE_MODEL_TOOL | EDIT_FILE_MODEL_TOOL
    );
    let blocked =
        mutation_tool && matches!(phase.as_str(), PLAN_PHASE_PLANNING | PLAN_PHASE_REVIEWING);
    if !blocked {
        return None;
    }
    let output = tool_failure_output(
        plan_gate_error_code(&phase),
        &format!("Plan mode is in phase `{phase}`; mutation tool `{tool_name}` is blocked."),
        plan_gate_recommended_action(&phase),
        Some(json!({
            "phase": phase,
            "blockedTool": tool_name,
            "activityKind": "plan",
            "rendererHint": "plan",
        })),
    );
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_call_id,
            tool_name,
            tool_name,
            "failed",
            arguments,
            Some(output.clone()),
            started_at,
            Some(now()),
        ),
        "toolFinished",
    );
    Some(output)
}

pub(crate) fn validate_plan_mutation_for_session(
    session_id: &str,
    tool_name: &str,
) -> Result<(), NativeToolFailure> {
    let Some(gate_state) = active_plan_gate_state(session_id) else {
        return Ok(());
    };
    let phase = gate_state.phase;
    let blocked = matches!(phase.as_str(), PLAN_PHASE_PLANNING | PLAN_PHASE_REVIEWING);
    if blocked {
        return Err(NativeToolFailure::new(
            plan_gate_error_code(&phase),
            format!("Plan mode is in phase `{phase}`; mutation tool `{tool_name}` is blocked."),
            plan_gate_recommended_action(&phase),
        )
        .with_detail(json!({
            "phase": phase,
            "blockedTool": tool_name,
            "activityKind": "plan",
            "rendererHint": "plan",
        })));
    }
    Ok(())
}

#[derive(Debug)]
struct PlanGateState {
    phase: String,
}

fn active_plan_gate_state(session_id: &str) -> Option<PlanGateState> {
    let state = state().lock().ok()?;
    let session = state.sessions.get(session_id)?;
    let phase = session
        .snapshot
        .pointer("/plan/phase")
        .and_then(Value::as_str)
        .map(str::to_string)?;
    Some(PlanGateState { phase })
}

fn plan_gate_error_code(phase: &str) -> &'static str {
    match phase {
        PLAN_PHASE_EXECUTING_TODO => "todo_in_progress_required_before_execution",
        PLAN_PHASE_REVIEWING => "plan_review_required_before_execution",
        _ => "plan_required_before_execution",
    }
}

fn plan_gate_recommended_action(phase: &str) -> &'static str {
    match phase {
        PLAN_PHASE_EXECUTING_TODO => {
            "Mark the current approved todo as in_progress before changing project files. Inspection, search, and read-only shell stay allowed."
        }
        PLAN_PHASE_REVIEWING => {
            "Wait for the user to approve, reject, or request revision before executing mutation tools."
        }
        PLAN_PHASE_PLANNING => {
            "Inspect with read, search, shell, and browser. Write or finalize the Plan. Do not change project files until the Plan is approved."
        }
        _ => "Inspect freely, then write or finalize the Plan before changing project files.",
    }
}

fn record_plan_activity(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    tool_name: &str,
    status: &str,
    input: Value,
    output: Option<Value>,
    started_at: &str,
    finished_at: Option<String>,
) {
    let mut activity = tool_activity(
        tool_call_id,
        tool_name,
        plan_tool_label(tool_name),
        status,
        input,
        output,
        started_at,
        finished_at,
    );
    if let Some(object) = activity.as_object_mut() {
        object.insert(
            "activityKind".to_string(),
            Value::String("plan".to_string()),
        );
        object.insert(
            "rendererHint".to_string(),
            Value::String("plan".to_string()),
        );
        object.insert("domain".to_string(), Value::String("plan".to_string()));
    }
    let event_kind = if status == "running" {
        "toolStarted"
    } else {
        "toolFinished"
    };
    record_tool_activity(session_id, turn_id, activity, event_kind);
}

fn plan_tool_label(tool_name: &str) -> &'static str {
    match tool_name {
        PLAN_BEGIN_MODEL_TOOL => "Starting plan",
        PLAN_WRITE_MODEL_TOOL => "Writing plan",
        PLAN_FINALIZE_MODEL_TOOL => "Finalizing plan",
        PLAN_REVISE_MODEL_TOOL => "Revising plan",
        _ => "Planning",
    }
}

pub(crate) fn tool_plan_begin(session_id: &str, turn_id: &str, input: &Value) -> NativeToolResult {
    let title = string_field(input, "title")?;
    let reason = optional_string_field(input, "reason");
    let scope = optional_string_field(input, "scope");
    let (callback, plan) = update_session_plan(session_id, |session, root| {
        if session
            .snapshot
            .pointer("/plan/phase")
            .and_then(Value::as_str)
            == Some(PLAN_PHASE_PLANNING)
        {
            return current_plan(session);
        }
        let plan_id = format!("plan-{}", Uuid::new_v4());
        let version_id = format!("plan-version-{}", Uuid::new_v4());
        let scope_info = plan_scope_from_session(session);
        let design_context = session
            .snapshot
            .get("activeDesignContext")
            .filter(|context| context.is_object())
            .map(|context| {
                json!({
                    "brand": context.get("brand").cloned().unwrap_or(Value::Null),
                    "documentHash": context.get("documentHash").cloned().unwrap_or(Value::Null),
                })
            })
            .unwrap_or(Value::Null);
        let plan = json!({
            "activePlanId": plan_id,
            "activeVersionId": version_id,
            "projectKey": scope_info.project_key,
            "title": title,
            "phase": PLAN_PHASE_PLANNING,
            "markdown": "",
            "annotations": [],
            "review": {
                "status": "none",
                "summary": Value::Null
            },
            "reason": reason,
            "scope": scope,
            "designContext": design_context,
            "deliveryIntent": "production",
        });
        session.snapshot["plan"] = plan.clone();
        touch_session(session);
        persist_plan_snapshot(root, session_id, &scope_info, &plan)
            .map_err(native_failure_from_runtime)?;
        Ok(plan)
    })?;
    emit_plan_events(&callback, session_id, turn_id, plan.clone(), None);
    Ok(NativeToolSuccess {
        content: format!(
            "Started plan: {}",
            plan.get("title").and_then(Value::as_str).unwrap_or("Plan")
        ),
        raw: plan_raw(
            &plan,
            plan.get("markdown")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "",
            "",
        ),
        recommended_next_action: Some(
            "Write the plan with plan_write before finalizing.".to_string(),
        ),
    })
}

pub(crate) fn tool_plan_write(session_id: &str, turn_id: &str, input: &Value) -> NativeToolResult {
    let delta = input
        .get("markdownDelta")
        .or_else(|| input.get("markdown"))
        .and_then(Value::as_str)
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "markdownDelta is required",
                "Retry with markdownDelta containing plan Markdown.",
            )
        })?
        .to_string();
    let replace = input
        .get("replace")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let (callback, (plan, diff)) = update_session_plan(session_id, |session, root| {
        let mut plan = match current_plan(session) {
            Ok(plan) => plan,
            Err(_) => {
                let scope_info = plan_scope_from_session(session);
                json!({
                    "activePlanId": format!("plan-{}", Uuid::new_v4()),
                    "activeVersionId": format!("plan-version-{}", Uuid::new_v4()),
                    "projectKey": scope_info.project_key,
                    "title": "Plan",
                    "phase": PLAN_PHASE_PLANNING,
                    "markdown": "",
                    "annotations": [],
                    "review": {
                        "status": "none",
                        "summary": Value::Null
                    },
                    "reason": "Agent started writing a plan without an explicit plan_begin call.",
                    "scope": Value::Null,
                    "designContext": session.snapshot.get("activeDesignContext").cloned().unwrap_or(Value::Null),
                })
            }
        };
        let old = plan
            .get("markdown")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let updated = if replace {
            delta.clone()
        } else {
            format!("{old}{delta}")
        };
        let version_id = plan
            .get("activeVersionId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("plan-version-{}", Uuid::new_v4()));
        plan["activeVersionId"] = Value::String(version_id);
        plan["phase"] = Value::String(PLAN_PHASE_PLANNING.to_string());
        plan["markdown"] = Value::String(updated.clone());
        plan["review"] = json!({ "status": "none", "summary": Value::Null });
        let scope_info = plan_scope_from_session(session);
        session.snapshot["plan"] = plan.clone();
        apply_plan_todo_input(session, input, &updated)?;
        plan = session.snapshot.get("plan").cloned().unwrap_or(plan);
        touch_session(session);
        persist_plan_snapshot(root, session_id, &scope_info, &plan)
            .map_err(native_failure_from_runtime)?;
        Ok((
            plan,
            crate::native_backend::tools::diff_text("Plan.md", &old, &updated),
        ))
    })?;
    emit_plan_events(&callback, session_id, turn_id, plan.clone(), None);
    Ok(NativeToolSuccess {
        content: "Updated plan draft.".to_string(),
        raw: plan_raw(
            &plan,
            plan.get("markdown")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            &diff,
            "modified",
        ),
        recommended_next_action: Some(
            "Continue writing or finalize the plan for review.".to_string(),
        ),
    })
}

pub(crate) fn tool_plan_finalize(
    session_id: &str,
    turn_id: &str,
    input: &Value,
) -> NativeToolResult {
    let summary = optional_string_field(input, "summary");
    let (callback, plan) = update_session_plan(session_id, |session, root| {
        let mut plan = current_plan(session)?;
        let markdown = plan
            .get("markdown")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .trim()
            .to_string();
        if markdown.is_empty() {
            return Err(NativeToolFailure::new(
                "empty_plan",
                "Cannot finalize an empty plan.",
                "Call plan_write with a complete Markdown plan first.",
            ));
        }
        plan["deliveryIntent"] = Value::String("production".to_string());
        if let Some(summary) = summary.clone() {
            plan["review"] = json!({ "status": "pending", "summary": summary });
        } else {
            plan["review"] = json!({ "status": "pending", "summary": Value::Null });
        }
        plan["phase"] = Value::String(PLAN_PHASE_REVIEWING.to_string());
        let scope_info = plan_scope_from_session(session);
        session.snapshot["plan"] = plan.clone();
        apply_plan_todo_input(session, input, &markdown)?;
        plan = session.snapshot.get("plan").cloned().unwrap_or(plan);
        touch_session(session);
        persist_plan_snapshot(root, session_id, &scope_info, &plan)
            .map_err(native_failure_from_runtime)?;
        Ok(plan)
    })?;
    let review_event = Some(json!({
        "kind": "planReviewRequested",
        "sessionId": session_id,
        "turnId": turn_id,
        "planId": plan.get("activePlanId").cloned().unwrap_or(Value::Null),
        "versionId": plan.get("activeVersionId").cloned().unwrap_or(Value::Null),
        "title": plan.get("title").cloned().unwrap_or(Value::String("Plan".to_string())),
        "summary": summary,
    }));
    emit_plan_events(&callback, session_id, turn_id, plan.clone(), review_event);
    Ok(NativeToolSuccess {
        content: "Plan finalized for review.".to_string(),
        raw: plan_raw(
            &plan,
            plan.get("markdown")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            "",
            "finalized",
        ),
        recommended_next_action: Some(
            "Wait for the user to approve, reject, or request revision.".to_string(),
        ),
    })
}

fn tool_plan_revise(session_id: &str, turn_id: &str, input: &Value) -> NativeToolResult {
    let markdown = input
        .get("markdown")
        .and_then(Value::as_str)
        .map(str::to_string);
    let annotations = input
        .get("annotations")
        .filter(|value| value.is_array())
        .cloned();
    let (callback, (plan, diff)) = update_session_plan(session_id, |session, root| {
        let mut plan = current_plan(session)?;
        let old = plan
            .get("markdown")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let updated = markdown.clone().unwrap_or_else(|| old.clone());
        plan["activeVersionId"] = Value::String(format!("plan-version-{}", Uuid::new_v4()));
        plan["markdown"] = Value::String(updated.clone());
        if let Some(annotations) = annotations.clone() {
            plan["annotations"] = annotations;
        }
        plan["phase"] = Value::String(PLAN_PHASE_PLANNING.to_string());
        plan["review"] = json!({ "status": "changed", "summary": Value::Null });
        let scope_info = plan_scope_from_session(session);
        session.snapshot["plan"] = plan.clone();
        touch_session(session);
        persist_plan_snapshot(root, session_id, &scope_info, &plan)
            .map_err(native_failure_from_runtime)?;
        Ok((
            plan,
            crate::native_backend::tools::diff_text("Plan.md", &old, &updated),
        ))
    })?;
    emit_plan_events(&callback, session_id, turn_id, plan.clone(), None);
    Ok(NativeToolSuccess {
        content: "Revised plan draft.".to_string(),
        raw: plan_raw(
            &plan,
            plan.get("markdown")
                .and_then(Value::as_str)
                .unwrap_or_default(),
            &diff,
            "modified",
        ),
        recommended_next_action: Some("Finalize the revised plan when ready.".to_string()),
    })
}

fn update_session_plan<T>(
    session_id: &str,
    f: impl FnOnce(&mut NativeSession, &Path) -> Result<T, NativeToolFailure>,
) -> Result<(Option<Arc<EventCallback>>, T), NativeToolFailure> {
    let mut state = state().lock().map_err(|_| {
        NativeToolFailure::new(
            "runtime_state_unavailable",
            "agent runtime state lock failed",
            "Retry the plan tool call.",
        )
    })?;
    let root = state.root.clone();
    let session = state.sessions.get_mut(session_id).ok_or_else(|| {
        NativeToolFailure::new(
            "session_not_found",
            format!("session not found: {session_id}"),
            "Retry in an active session.",
        )
    })?;
    let result = f(session, &root)?;
    let callback = event_callback();
    state.save_state().map_err(|error| {
        NativeToolFailure::new(
            "write_failed",
            format!("failed to persist plan state: {error}"),
            "Retry after checking runtime storage.",
        )
    })?;
    Ok((callback, result))
}

fn emit_plan_events(
    callback: &Option<Arc<EventCallback>>,
    session_id: &str,
    turn_id: &str,
    plan: Value,
    review_event: Option<Value>,
) {
    emit_with_callback(
        callback,
        json!({
            "kind": "planUpdated",
            "sessionId": session_id,
            "turnId": turn_id,
            "plan": plan.clone(),
        }),
    );
    if let Some(todos) = plan
        .get("todos")
        .filter(|value| value.as_array().is_some_and(|items| !items.is_empty()))
    {
        emit_with_callback(
            callback,
            json!({
                "kind": "todoUpdated",
                "sessionId": session_id,
                "turnId": turn_id,
                "todos": todos,
            }),
        );
    }
    if let Some(mut event) = review_event {
        event["sessionId"] = json!(session_id);
        event["plan"] = plan.clone();
        emit_with_callback(callback, event);
        emit_with_callback(
            callback,
            super::super::user_gate::record_open(
                super::super::user_gate::UserGateKind::PlanReview,
                &super::super::user_gate::plan_review_gate_id(session_id),
                session_id,
                turn_id,
                plan,
            ),
        );
    }
}

fn apply_plan_todo_input(
    session: &mut NativeSession,
    input: &Value,
    markdown: &str,
) -> Result<(), NativeToolFailure> {
    match parse_optional_todo_list(input)? {
        Some(todos) => attach_draft_todos(session, todos),
        None => {
            let has_draft = session
                .snapshot
                .pointer("/plan/todos")
                .and_then(Value::as_array)
                .is_some_and(|todos| !todos.is_empty());
            if !has_draft {
                let from_markdown = todos_from_markdown_checkboxes(markdown);
                if !from_markdown.is_empty() {
                    attach_draft_todos(session, from_markdown);
                }
            }
        }
    }
    Ok(())
}

fn current_plan(session: &NativeSession) -> Result<Value, NativeToolFailure> {
    session
        .snapshot
        .get("plan")
        .filter(|value| value.is_object())
        .cloned()
        .ok_or_else(|| {
            NativeToolFailure::new(
                "plan_not_started",
                "No active plan draft exists.",
                "Call plan_begin before writing or finalizing a plan.",
            )
        })
}

fn plan_raw(plan: &Value, markdown: &str, diff: &str, status: &str) -> Value {
    json!({
        "planId": plan.get("activePlanId").cloned().unwrap_or(Value::Null),
        "versionId": plan.get("activeVersionId").cloned().unwrap_or(Value::Null),
        "projectKey": plan.get("projectKey").cloned().unwrap_or(Value::Null),
        "phase": plan.get("phase").cloned().unwrap_or(Value::Null),
        "markdown": markdown,
        "diff": diff,
        "changedFiles": [{
            "path": "Plan.md",
            "status": status,
        }],
        "activityKind": "plan",
        "rendererHint": "plan",
    })
}

fn string_field(input: &Value, key: &str) -> Result<String, NativeToolFailure> {
    optional_string_field(input, key).ok_or_else(|| {
        NativeToolFailure::new(
            "bad_request",
            format!("{key} is required"),
            format!("Retry with a non-empty {key}."),
        )
    })
}

fn optional_string_field(input: &Value, key: &str) -> Option<String> {
    input
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn native_failure_from_runtime(error: AgentRuntimeError) -> NativeToolFailure {
    NativeToolFailure::new(
        "plan_store_failed",
        error.to_string(),
        "Retry after checking Lyra local storage.",
    )
}
