use super::*;

fn permission_wait_timeout() -> Option<Duration> {
    std::env::var("LYRA_PERMISSION_WAIT_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(Duration::from_millis)
}

pub(crate) fn permission_request_for_tool(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    display_name: &str,
    action: &str,
    input: &Value,
) -> Option<PermissionRequest> {
    if input
        .pointer("/toolOperation/permissionMode")
        .and_then(Value::as_str)
        .is_some_and(|value| value.trim().replace('-', "_") == "full_access")
        || input
            .get("permissionGranted")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        return None;
    }
    let risk = permission_risk(display_name, action, input)?;
    match evaluate_permission_policy_for_session(
        session_id,
        display_name,
        action,
        Some(&risk),
        input,
    ) {
        PermissionPolicyDecision::Allow => return None,
        PermissionPolicyDecision::Ask => {}
        PermissionPolicyDecision::Deny => {}
    }
    let summary = permission_summary(display_name, action, input);
    let title = match risk.as_str() {
        "shell" => "Run shell command",
        "file" => "Modify workspace files",
        "workspace_escape" => "Access path outside project workspace",
        "network" => "Use network or browser action",
        "sensitive" => "Use browser login state",
        "media.upload" => "Send media to an AI provider",
        "media.generation" => "Generate media with an AI provider",
        _ => "Use high-risk Lyra capability",
    }
    .to_string();
    let why = if risk == "sensitive" {
        "The requested browser action would use the user's existing Lyra browser login state in an isolated background page."
    } else if risk == "workspace_escape" {
        "The requested path is outside the bound project workspace. Lyra can access it after approval."
    } else if risk == "media.upload" {
        "The requested media file will be read from this computer and sent to the configured AI provider."
    } else if risk == "media.generation" {
        "The requested operation calls an external media model and may incur provider charges."
    } else {
        "The requested tool can change external state or perform a high-risk action."
    };
    Some(PermissionRequest {
        id: format!("permission-{}", Uuid::new_v4()),
        session_id: session_id.to_string(),
        turn_id: turn_id.to_string(),
        tool_call_id: tool_call_id.to_string(),
        action: action.to_string(),
        risk,
        summary: summary.clone(),
        why: why.to_string(),
        title,
        detail: summary,
        status: "pending".to_string(),
        allowed: None,
        created_at: now(),
        responded_at: None,
    })
}

fn requests_live_login_state(input: &Value) -> bool {
    input
        .get("useLiveLoginState")
        .and_then(Value::as_bool)
        .unwrap_or(false)
        || input
            .get("authState")
            .and_then(Value::as_str)
            .is_some_and(|value| value == "borrowLiveLogin")
}

pub(crate) fn permission_risk(display_name: &str, action: &str, input: &Value) -> Option<String> {
    if matches!(display_name, "lyra_lumen") && requests_live_login_state(input) {
        return Some("sensitive".to_string());
    }
    if input
        .get("permissionRequired")
        .or_else(|| input.get("requiresPermission"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        return Some(
            input
                .get("permissionRisk")
                .and_then(Value::as_str)
                .unwrap_or("dangerous")
                .to_string(),
        );
    }
    if matches!(display_name, "lyra_lumen" | "lyra_ax")
        && let Some(effect) = input.get("effect").and_then(Value::as_str)
    {
        return match effect {
            "observe" => None,
            "navigate" => Some("network".to_string()),
            "editDraft" => Some("browser.edit_draft".to_string()),
            "submitExternal" => Some("browser.submit_external".to_string()),
            "authorize" => Some("browser.authorize".to_string()),
            "purchase" => Some("browser.purchase".to_string()),
            "delete" => Some("browser.delete".to_string()),
            "upload" => Some("browser.upload".to_string()),
            "download" => Some("browser.download".to_string()),
            "communicate" => Some("browser.communicate".to_string()),
            _ => Some("browser.unknown_effect".to_string()),
        };
    }
    if display_name == "terminal" && action == "create" {
        return input
            .get("command")
            .and_then(Value::as_str)
            .filter(|command| !command.trim().is_empty())
            .map(|_| "shell".to_string());
    }
    if display_name == "terminal" && terminal_action_is_read_only(action) {
        return None;
    }
    if display_name == "terminal" && terminal_action_requires_policy(action) {
        return Some("shell".to_string());
    }
    if matches!(
        (display_name, action),
        ("file", "read")
            | ("file", "list")
            | ("file", "glob")
            | ("search", "project")
            | ("code", "search_text")
            | ("code", "search_symbol")
            | ("code", "graph_expand")
            | ("lsp", "query")
            | ("todo", "read")
            | ("workbench", "list_tabs")
            | ("workbench", "read_workspace")
            | ("workbench", "read_tab")
            | ("workbench", "capture_visual_evidence")
            | ("workbench", "list_terminals")
            | ("workbench", "extract_tab_text")
            | ("software", "list_capabilities")
            | ("software", "inspect_capability")
            | ("software", "read_state")
            | ("lyra_lumen", "map")
            | ("lyra_lumen", "read")
            | ("lyra_lumen", "find")
            | ("lyra_lumen", "locate")
            | ("lyra_lumen", "see")
            | ("lyra_lumen", "scroll")
            | ("lyra_lumen", "scroll_to_target")
            | ("lyra_lumen", "ensure_visible")
            | ("lyra_lumen", "wait")
            | ("lyra_lumen", "read_until")
            | ("lyra_lumen", "reveal")
            | ("lyra_lumen", "focus_scan")
            | ("lyra_lumen", "follow_audit")
            | ("lyra_lumen", "explain_target")
            | ("lyra_lumen", "audit")
            | ("lyra_ax", "map")
            | ("lyra_ax", "query")
            | ("lyra_ax", "explain")
            | ("lyra_ax", "focus")
    ) {
        return None;
    }
    // File mutations must raise a permission request exactly like the tool-fs
    // catalog's "file" risk class: write-path tools are never auto-allowed.
    if matches!(
        (display_name, action),
        (
            "file",
            "write" | "edit" | "strict_edit" | "multiedit" | "apply_patch"
        )
    ) {
        return Some("file".to_string());
    }
    if matches!(
        (display_name, action),
        ("software", "invoke_capability")
            | ("lyra_lumen", "act")
            | ("lyra_lumen", "vact")
            | ("lyra_lumen", "type")
            | ("lyra_lumen", "press")
            | ("lyra_lumen", "submit")
            | ("lyra_lumen", "navigate")
            | ("lyra_lumen", "reload")
            | ("lyra_lumen", "detect_qr")
            | ("lyra_lumen", "elevate")
            | ("lyra_ax", "act")
            | ("lyra_ax", "press")
    ) {
        return Some(if action == "navigate" {
            "network".to_string()
        } else {
            "dangerous".to_string()
        });
    }
    None
}

pub(crate) fn permission_summary(display_name: &str, action: &str, input: &Value) -> String {
    if display_name == "terminal" {
        return terminal_permission_summary(action, input);
    }
    let mut detail = format!("{display_name}.{action}");
    for key in [
        "path",
        "filePath",
        "workspaceRoot",
        "outsideWorkspacePath",
        "command",
        "url",
        "softwareId",
        "capabilityId",
        "actionId",
        "tabId",
        "targetMode",
        "authState",
        "sessionId",
        "terminalTabId",
        "paneId",
        "target",
        "text",
        "captureId",
        "axRef",
        "reason",
        "effect",
        "destinationUrl",
        "providerId",
        "modelId",
        "voice",
        "formAction",
        "formMethod",
        "controlKind",
    ] {
        if let Some(value) = input.get(key).and_then(Value::as_str)
            && !value.trim().is_empty()
        {
            detail.push_str(&format!(" {key}={value}"));
        }
    }
    detail
}

fn terminal_permission_summary(action: &str, input: &Value) -> String {
    let mut detail = format!("terminal.{action}");
    for key in [
        "sessionId",
        "terminalTabId",
        "paneId",
        "target",
        "mode",
        "command",
        "semanticAction",
        "operation",
        "signal",
        "pid",
        "regionId",
        "attachmentId",
        "cols",
        "rows",
        "reason",
    ] {
        if let Some(value) = input.get(key) {
            if let Some(text) = value.as_str().filter(|value| !value.trim().is_empty()) {
                detail.push_str(&format!(" {key}={text}"));
            } else if value.is_number() || value.is_boolean() {
                detail.push_str(&format!(" {key}={value}"));
            }
        }
    }
    if let Some(text) = input.get("text").and_then(Value::as_str) {
        detail.push_str(&format!(" textBytes={}", text.len()));
    }
    if let Some(data) = input.get("data").and_then(Value::as_str) {
        detail.push_str(&format!(" dataBytes={}", data.len()));
    }
    if let Some(keys) = input.get("keys").and_then(Value::as_array) {
        let labels = keys
            .iter()
            .filter_map(Value::as_str)
            .take(16)
            .collect::<Vec<_>>();
        if !labels.is_empty() {
            detail.push_str(&format!(" keys={}", labels.join(",")));
        }
    }
    detail
}

pub(crate) async fn wait_for_permission_with_cancellation_async(
    request: PermissionRequest,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<bool> {
    wait_for_permission_internal_async(request, Some(cancellation)).await
}

#[cfg(test)]
pub(crate) fn wait_for_permission_with_timeout_for_tests(
    request: PermissionRequest,
    cancellation: &CancellationToken,
    timeout: Duration,
) -> AgentRuntimeResult<bool> {
    super::turn_engine::block_on(wait_for_permission_internal_with_timeout_async(
        request,
        Some(cancellation),
        Some(timeout),
    ))
}

async fn wait_for_permission_internal_async(
    request: PermissionRequest,
    cancellation: Option<&CancellationToken>,
) -> AgentRuntimeResult<bool> {
    wait_for_permission_internal_with_timeout_async(
        request,
        cancellation,
        permission_wait_timeout(),
    )
    .await
}

async fn wait_for_permission_internal_with_timeout_async(
    request: PermissionRequest,
    cancellation: Option<&CancellationToken>,
    timeout: Option<Duration>,
) -> AgentRuntimeResult<bool> {
    let mut request = request;
    let request_id = request.id.clone();
    let turn_id = request.turn_id.clone();
    let _deadline_pause = super::session_runtime::pause_turn_activity(&turn_id);
    let (callback, events, session_id) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let callback = event_callback();
        let session_id = state
            .sessions
            .get(&request.session_id)
            .and_then(|session| parent_session_id_of(&session.snapshot))
            .filter(|parent_session_id| state.sessions.contains_key(parent_session_id))
            .unwrap_or_else(|| request.session_id.clone());
        request.session_id = session_id.clone();
        if let Some(session) = state.sessions.get_mut(&session_id) {
            set_runtime_turn_state(
                session,
                &turn_id,
                "waiting_for_permission",
                Some("permission_request"),
            );
            session.snapshot["turnStatus"] = Value::String("running".to_string());
            session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
            session.snapshot["follow"] =
                json!({ "running": true, "activity": "Waiting for permission" });
            touch_session(session);
        }
        state
            .pending_permissions
            .insert(request_id.clone(), request.clone());
        state.save_state()?;
        let mut events = vec![
            json!({
                "kind": "permissionRequested",
                "sessionId": session_id,
                "permissionId": request_id,
                "title": request.title,
                "detail": request.detail,
                "action": request.action,
                "risk": request.risk,
                "summary": request.summary,
                "why": request.why,
                "toolCallId": request.tool_call_id,
                "turnId": turn_id,
            }),
            json!({
                "kind": "turnStateChanged",
                "sessionId": session_id,
                "turnId": turn_id,
                "state": "waiting_for_permission",
                "reason": "permission_request",
            }),
        ];
        events.push(super::user_gate::record_open(
            super::user_gate::UserGateKind::Permission,
            &request_id,
            &session_id,
            &turn_id,
            json!({
                "title": request.title,
                "detail": request.detail,
                "action": request.action,
                "risk": request.risk,
                "summary": request.summary,
                "why": request.why,
                "toolCallId": request.tool_call_id,
            }),
        ));
        (callback, events, session_id)
    };
    for event in events {
        emit_with_callback(&callback, event);
    }

    wait_for_permission_decision_with_timeout_async(
        &session_id,
        &turn_id,
        &request_id,
        cancellation,
        timeout,
    )
    .await
}

async fn wait_for_permission_decision_with_timeout_async(
    session_id: &str,
    turn_id: &str,
    request_id: &str,
    cancellation: Option<&CancellationToken>,
    timeout: Option<Duration>,
) -> AgentRuntimeResult<bool> {
    // Event-driven wait: park on a oneshot channel that respond_permission /
    // turn cancellation fires. Pending state stays the source of truth, so a
    // response that landed before this waiter registered is caught by the
    // double-checks below instead of being lost.
    let receiver = super::waiters::register(request_id, turn_id);
    if let Ok(mut state) = state().lock()
        && let Some(allowed) = state
            .pending_permissions
            .get(request_id)
            .and_then(|request| request.allowed)
    {
        super::waiters::unregister(request_id);
        state.pending_permissions.remove(request_id);
        state.save_state()?;
        return Ok(allowed);
    }
    if cancellation.is_some_and(|cancellation| cancellation.is_cancelled())
        || turn_was_cancelled(session_id, turn_id)
    {
        super::waiters::unregister(request_id);
        remove_pending_permission(request_id)?;
        return Err(AgentRuntimeError::Cancelled);
    }
    let _deadline_pause = super::session_runtime::pause_turn_activity(turn_id);
    let cancellation_owned = cancellation.cloned();
    match super::waiters::wait_with_cancellation_async(receiver, timeout, cancellation_owned).await
    {
        Some(super::waiters::WaitSignal::PermissionDecision(allowed)) => {
            remove_pending_permission(request_id)?;
            Ok(allowed)
        }
        Some(super::waiters::WaitSignal::Cancelled) => {
            remove_pending_permission(request_id)?;
            Err(AgentRuntimeError::Cancelled)
        }
        Some(super::waiters::WaitSignal::ClarificationAnswered) | None => {
            super::waiters::unregister(request_id);
            // Post-timeout double-check: the decision may have been recorded
            // in pending state without a live waiter (e.g. across a restart).
            if let Ok(mut state) = state().lock()
                && let Some(allowed) = state
                    .pending_permissions
                    .get(request_id)
                    .and_then(|request| request.allowed)
            {
                state.pending_permissions.remove(request_id);
                state.save_state()?;
                return Ok(allowed);
            }
            remove_pending_permission(request_id)?;
            if cancellation.is_some_and(|cancellation| cancellation.is_cancelled())
                || turn_was_cancelled(session_id, turn_id)
            {
                return Err(AgentRuntimeError::Cancelled);
            }
            Err(AgentRuntimeError::Core(
                "permission request timed out".to_string(),
            ))
        }
    }
}

fn remove_pending_permission(request_id: &str) -> AgentRuntimeResult<()> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    state.pending_permissions.remove(request_id);
    state.save_state()?;
    drop(state);
    super::user_gate::drop_live(request_id);
    Ok(())
}

pub(crate) fn respond_permission(payload: Value) -> AgentRuntimeResult<Value> {
    let session_id = required_session_id(&payload)?;
    let permission_id = string_opt(&payload, "permissionId")
        .ok_or_else(|| AgentRuntimeError::Core("permissionId is required".to_string()))?;
    let allowed = payload
        .get("allowed")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let resolve_source = super::user_gate::permission_resolve_source(&payload);
    let (callback, events, response) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let callback = event_callback();
        let request = state
            .pending_permissions
            .get_mut(&permission_id)
            .filter(|request| request.session_id == session_id)
            .ok_or_else(|| {
                AgentRuntimeError::Core(format!("permission request not found: {permission_id}"))
            })?;
        request.allowed = Some(allowed);
        request.status = if allowed { "allowed" } else { "denied" }.to_string();
        request.responded_at = Some(now());
        let turn_id = request.turn_id.clone();
        let tool_call_id = request.tool_call_id.clone();
        if let Some(session) = state.sessions.get_mut(&session_id) {
            set_runtime_turn_state(
                session,
                &turn_id,
                "waiting_for_tool",
                Some("permission_response"),
            );
            session.snapshot["turnStatus"] = Value::String("running".to_string());
            session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
            session.snapshot["follow"] = json!({
                "running": true,
                "activity": if allowed { "Permission approved" } else { "Permission denied" }
            });
            touch_session(session);
        }
        state.save_state()?;
        let events = vec![
            json!({
                "kind": "turnStateChanged",
                "sessionId": session_id,
                "turnId": turn_id,
                "state": "waiting_for_tool",
                "reason": if allowed { "permission_allowed" } else { "permission_denied" },
            }),
            super::user_gate::resolved_event(
                &session_id,
                &permission_id,
                super::user_gate::UserGateKind::Permission,
                &resolve_source,
            ),
        ];
        let response = json!({
            "sessionId": session_id,
            "permissionId": permission_id,
            "toolCallId": tool_call_id,
            "turnId": turn_id,
            "allowed": allowed,
            "resolveSource": resolve_source,
            "status": if allowed { "resumed" } else { "denied" },
        });
        (callback, events, response)
    };
    for event in events {
        emit_with_callback(&callback, event);
    }
    // Wake the parked turn worker after state + events are committed, so the
    // resumed turn always observes the recorded decision.
    super::waiters::resolve(
        &permission_id,
        super::waiters::WaitSignal::PermissionDecision(allowed),
    );
    super::user_gate::on_resolved(
        &permission_id,
        &response
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        super::user_gate::UserGateKind::Permission,
        &resolve_source,
    );
    Ok(response)
}
