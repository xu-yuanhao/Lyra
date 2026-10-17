use super::*;

fn clarification_wait_timeout() -> Option<Duration> {
    std::env::var("LYRA_CLARIFICATION_WAIT_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(Duration::from_millis)
}

/// Remove a pending clarification unconditionally (cancel/timeout cleanup).
/// Without this, a late answer can hit stale state and revive an already-finished turn.
fn remove_pending_clarification(request_id: &str) {
    if let Ok(mut state) = state().lock() {
        if state.pending_clarifications.remove(request_id).is_some() {
            let _ = state.save_state();
        }
    }
    super::user_gate::drop_live(request_id);
}

/// Take the answered clarification out of pending state, if present.
fn take_answered_clarification(
    request_id: &str,
) -> AgentRuntimeResult<Option<ClarificationRequest>> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let answered = state
        .pending_clarifications
        .get(request_id)
        .filter(|request| request.answer.is_some())
        .cloned();
    if answered.is_some() {
        state.pending_clarifications.remove(request_id);
        state.save_state()?;
    }
    Ok(answered)
}

pub(crate) async fn wait_for_clarification_async(
    request: ClarificationRequest,
) -> AgentRuntimeResult<ClarificationRequest> {
    let mut request = request;
    let request_id = request.id.clone();
    let turn_id = request.turn_id.clone();
    let _deadline_pause = super::session_runtime::pause_turn_activity(&turn_id);
    // Register the wake-up before the pending request becomes visible to
    // responders, so an instant answer can never slip between insert and wait.
    let receiver = super::waiters::register(&request_id, &turn_id);
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
        let mut suspended_tool = None;
        if let Some(session) = state.sessions.get_mut(&session_id) {
            set_runtime_turn_state(
                session,
                &turn_id,
                "waiting_for_user",
                Some("clarification_request"),
            );
            session.snapshot["turnStatus"] = Value::String("running".to_string());
            session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
            session.snapshot["follow"] = json!({ "running": true, "activity": "Waiting for user" });
            if let Some(tool) = session
                .snapshot
                .get_mut("tools")
                .and_then(Value::as_array_mut)
                .and_then(|tools| {
                    tools.iter_mut().find(|tool| {
                        tool.get("id").and_then(Value::as_str)
                            == Some(request.tool_call_id.as_str())
                    })
                })
            {
                tool["status"] = Value::String("suspended_user_action".to_string());
                suspended_tool = Some(tool.clone());
            }
            touch_session(session);
        }
        state
            .pending_clarifications
            .insert(request_id.clone(), request.clone());
        state.save_state()?;
        let mut events = vec![
            json!({
                "kind": "clarificationRequested",
                "sessionId": session_id,
                "clarificationId": request_id,
                "question": request.question,
                "i18nKey": request.i18n_key,
                "options": request.options,
                "allowCustomAnswer": request.allow_custom_answer,
                "detail": request.detail,
                "detailI18nKey": request.detail_i18n_key,
                "toolCallId": request.tool_call_id,
                "turnId": turn_id,
            }),
            json!({
                "kind": "turnStateChanged",
                "sessionId": session_id,
                "turnId": turn_id,
                "state": "waiting_for_user",
                "reason": "clarification_request",
            }),
        ];
        if let Some(tool) = suspended_tool {
            events.push(json!({
                "kind": "toolUpdated",
                "sessionId": session_id,
                "turnId": turn_id,
                "tool": tool,
            }));
        }
        events.push(super::user_gate::record_open(
            super::user_gate::UserGateKind::Clarification,
            &request_id,
            &session_id,
            &turn_id,
            json!({
                "question": request.question,
                "i18nKey": request.i18n_key,
                "options": request.options,
                "allowCustomAnswer": request.allow_custom_answer,
                "detail": request.detail,
                "detailI18nKey": request.detail_i18n_key,
                "toolCallId": request.tool_call_id,
            }),
        ));
        (callback, events, session_id)
    };
    for event in events {
        emit_with_callback(&callback, event);
    }

    // Event-driven wait: respond_clarification / turn cancellation fires the
    // channel. Pending state remains the source of truth; double-check it
    // around the park so no answer can be lost to a registration race.
    if turn_was_cancelled(&session_id, &turn_id) {
        super::waiters::unregister(&request_id);
        remove_pending_clarification(&request_id);
        return Err(AgentRuntimeError::Cancelled);
    }
    match super::waiters::wait_async(receiver, clarification_wait_timeout()).await {
        Some(super::waiters::WaitSignal::ClarificationAnswered) => {
            take_answered_clarification(&request_id)?.ok_or_else(|| {
                AgentRuntimeError::Core(format!(
                    "clarification response missing for request: {request_id}"
                ))
            })
        }
        Some(super::waiters::WaitSignal::Cancelled) => {
            remove_pending_clarification(&request_id);
            Err(AgentRuntimeError::Cancelled)
        }
        Some(super::waiters::WaitSignal::PermissionDecision(_)) | None => {
            super::waiters::unregister(&request_id);
            if let Some(answered) = take_answered_clarification(&request_id)? {
                return Ok(answered);
            }
            // Timeout or spurious wake: clean up the pending entry so a late
            // answer can never revive this already-ended turn.
            remove_pending_clarification(&request_id);
            if turn_was_cancelled(&session_id, &turn_id) {
                return Err(AgentRuntimeError::Cancelled);
            }
            Err(AgentRuntimeError::Core(
                "clarification request timed out".to_string(),
            ))
        }
    }
}

pub(crate) fn respond_clarification(payload: Value) -> AgentRuntimeResult<Value> {
    let session_id = required_session_id(&payload)?;
    let clarification_id = string_opt(&payload, "clarificationId")
        .ok_or_else(|| AgentRuntimeError::Core("clarificationId is required".to_string()))?;
    let answer = string_opt(&payload, "answer")
        .ok_or_else(|| AgentRuntimeError::Core("answer is required".to_string()))?;
    let selected_option = string_opt(&payload, "selectedOption");
    let selected_option_value = string_opt(&payload, "selectedOptionValue");
    let resolve_source = super::user_gate::clarification_resolve_source(&payload);
    let (callback, events, response) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let callback = event_callback();
        let request = state
            .pending_clarifications
            .get_mut(&clarification_id)
            .filter(|request| request.session_id == session_id)
            .ok_or_else(|| {
                AgentRuntimeError::Core(format!(
                    "clarification request not found: {clarification_id}"
                ))
            })?;
        request.answer = Some(answer.clone());
        request.selected_option = selected_option_value
            .clone()
            .or_else(|| selected_option.clone());
        request.status = "answered".to_string();
        request.responded_at = Some(now());
        let turn_id = request.turn_id.clone();
        let tool_call_id = request.tool_call_id.clone();
        let mut resumed_tool = None;
        if let Some(session) = state.sessions.get_mut(&session_id) {
            set_runtime_turn_state(session, &turn_id, "waiting_for_tool", None);
            session.snapshot["turnStatus"] = Value::String("running".to_string());
            session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
            session.snapshot["follow"] =
                json!({ "running": true, "activity": "Clarification answered" });
            if let Some(tool) = session
                .snapshot
                .get_mut("tools")
                .and_then(Value::as_array_mut)
                .and_then(|tools| {
                    tools.iter_mut().find(|tool| {
                        tool.get("id").and_then(Value::as_str) == Some(tool_call_id.as_str())
                    })
                })
                && tool.get("status").and_then(Value::as_str) == Some("suspended_user_action")
            {
                tool["status"] = Value::String("running".to_string());
                resumed_tool = Some(tool.clone());
            }
            touch_session(session);
        }
        state.save_state()?;
        let mut events = vec![
            json!({
                "kind": "clarificationResolved",
                "sessionId": session_id,
                "clarificationId": clarification_id
            }),
            super::user_gate::resolved_event(
                &session_id,
                &clarification_id,
                super::user_gate::UserGateKind::Clarification,
                &resolve_source,
            ),
            json!({
                "kind": "turnStateChanged",
                "sessionId": session_id,
                "turnId": turn_id,
                "state": "waiting_for_tool",
                "reason": "clarification_answered",
            }),
        ];
        if let Some(tool) = resumed_tool {
            events.push(json!({
                "kind": "toolUpdated",
                "sessionId": session_id,
                "turnId": turn_id,
                "tool": tool,
            }));
        }
        let response = json!({
            "sessionId": session_id,
            "clarificationId": clarification_id,
            "turnId": turn_id,
            "answer": answer,
            "selectedOption": selected_option,
            "selectedOptionValue": selected_option_value,
            "resolveSource": resolve_source,
            "status": "resumed",
        });
        (callback, events, response)
    };
    for event in events {
        emit_with_callback(&callback, event);
    }
    // Wake the parked turn worker after state + events are committed, so the
    // resumed turn always finds the recorded answer.
    super::waiters::resolve(
        &clarification_id,
        super::waiters::WaitSignal::ClarificationAnswered,
    );
    super::user_gate::on_resolved(
        &clarification_id,
        &response
            .get("sessionId")
            .and_then(Value::as_str)
            .unwrap_or_default(),
        super::user_gate::UserGateKind::Clarification,
        &resolve_source,
    );
    Ok(response)
}
