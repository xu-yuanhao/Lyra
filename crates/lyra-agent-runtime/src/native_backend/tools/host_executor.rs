use super::*;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum BrowserActionEffect {
    Observe,
    Navigate,
    EditDraft,
    SubmitExternal,
    Authorize,
    Purchase,
    Delete,
    Upload,
    Download,
    Communicate,
}

#[derive(Clone, Debug)]
pub(crate) struct BrowserActionEffectFailure {
    pub(crate) code: &'static str,
    pub(crate) message: String,
    pub(crate) detail: Value,
}

fn browser_action_requires_effect(display_name: &str, action: &str) -> bool {
    matches!(
        (display_name, action),
        (
            "lyra_lumen",
            "act"
                | "vact"
                | "type"
                | "press"
                | "submit"
                | "navigate"
                | "reload"
                | "elevate"
                | "upload"
                | "drag"
                | "dialog"
        ) | ("lyra_ax", "act" | "press")
    )
}

fn effect_name(effect: BrowserActionEffect) -> &'static str {
    match effect {
        BrowserActionEffect::Observe => "observe",
        BrowserActionEffect::Navigate => "navigate",
        BrowserActionEffect::EditDraft => "editDraft",
        BrowserActionEffect::SubmitExternal => "submitExternal",
        BrowserActionEffect::Authorize => "authorize",
        BrowserActionEffect::Purchase => "purchase",
        BrowserActionEffect::Delete => "delete",
        BrowserActionEffect::Upload => "upload",
        BrowserActionEffect::Download => "download",
        BrowserActionEffect::Communicate => "communicate",
    }
}

fn declared_browser_action_effect(input: &Value) -> Option<BrowserActionEffect> {
    match input.get("effect").and_then(Value::as_str) {
        Some("observe") => Some(BrowserActionEffect::Observe),
        Some("navigate") => Some(BrowserActionEffect::Navigate),
        Some("editDraft") => Some(BrowserActionEffect::EditDraft),
        Some("submitExternal") => Some(BrowserActionEffect::SubmitExternal),
        Some("authorize") => Some(BrowserActionEffect::Authorize),
        Some("purchase") => Some(BrowserActionEffect::Purchase),
        Some("delete") => Some(BrowserActionEffect::Delete),
        Some("upload") => Some(BrowserActionEffect::Upload),
        Some("download") => Some(BrowserActionEffect::Download),
        Some("communicate") => Some(BrowserActionEffect::Communicate),
        _ => None,
    }
}

fn is_submission_effect(effect: BrowserActionEffect) -> bool {
    matches!(
        effect,
        BrowserActionEffect::Communicate
            | BrowserActionEffect::SubmitExternal
            | BrowserActionEffect::Authorize
            | BrowserActionEffect::Purchase
            | BrowserActionEffect::Delete
            | BrowserActionEffect::Upload
            | BrowserActionEffect::Download
    )
}

fn keep_mutating_effect(
    declared: Option<BrowserActionEffect>,
    fallback: BrowserActionEffect,
) -> BrowserActionEffect {
    match declared {
        Some(effect) if effect != BrowserActionEffect::Observe => effect,
        _ => fallback,
    }
}

pub(crate) fn write_browser_action_effect(input: &mut Value, effect: BrowserActionEffect) {
    if let Some(object) = input.as_object_mut() {
        object.insert(
            "effect".to_string(),
            Value::String(effect_name(effect).to_string()),
        );
    }
}

fn browser_press_is_observational(input: &Value) -> bool {
    let key = input.get("key").and_then(Value::as_str).unwrap_or_default();
    let normalized = key.to_ascii_lowercase();
    let mut parts: Vec<&str> = normalized.split('+').collect();
    let base = parts.pop().unwrap_or_default();
    let selection_modifiers = parts.iter().all(|part| {
        matches!(
            *part,
            "shift" | "control" | "ctrl" | "meta" | "command" | "cmd" | "super"
        )
    });
    selection_modifiers
        && matches!(
            base,
            "arrowup"
                | "up"
                | "arrowdown"
                | "down"
                | "arrowleft"
                | "left"
                | "arrowright"
                | "right"
                | "home"
                | "end"
                | "pageup"
                | "pagedown"
        )
        || base == "tab" && parts.iter().all(|part| *part == "shift")
        || matches!(base, "escape" | "esc") && parts.is_empty()
}

pub(crate) fn validate_browser_action_effect(
    display_name: &str,
    action: &str,
    input: &Value,
) -> Result<Option<BrowserActionEffect>, BrowserActionEffectFailure> {
    if !browser_action_requires_effect(display_name, action) {
        return Ok(None);
    }
    // The action is the operation. A parallel effect field is only kept when it
    // names a real consequence of that same action (a click that purchases).
    // A missing or contradictory declaration is replaced, not rejected.
    let declared = declared_browser_action_effect(input);
    let interaction = input
        .get("interaction")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let effect = match (display_name, action) {
        ("lyra_lumen", "upload") => BrowserActionEffect::Upload,
        ("lyra_lumen", "navigate" | "reload") => BrowserActionEffect::Navigate,
        ("lyra_lumen", "elevate") => BrowserActionEffect::Authorize,
        ("lyra_lumen", "type") => {
            if input
                .get("thenClick")
                .and_then(Value::as_str)
                .is_some_and(|target| !target.trim().is_empty())
            {
                declared
                    .filter(|effect| is_submission_effect(*effect))
                    .unwrap_or(BrowserActionEffect::Communicate)
            } else {
                BrowserActionEffect::EditDraft
            }
        }
        ("lyra_lumen", "submit") => declared
            .filter(|effect| is_submission_effect(*effect))
            .unwrap_or(BrowserActionEffect::SubmitExternal),
        ("lyra_lumen", "dialog") => {
            keep_mutating_effect(declared, BrowserActionEffect::Communicate)
        }
        ("lyra_lumen", "act") => {
            // Fail closed on contradictions (codex never rewrites a
            // mismatching declaration): hover inspects only under observe,
            // and a mutating gesture requires a mutating declaration.
            if interaction == "hover" {
                match declared {
                    Some(effect) if effect != BrowserActionEffect::Observe => {
                        return Err(BrowserActionEffectFailure {
                            code: "invalid_browser_action",
                            message: format!(
                                "{} does not match the hover gesture; declare observe for inspection or use a mutating gesture.",
                                effect_name(effect)
                            ),
                            detail: json!({
                                "action": action,
                                "declared": effect_name(effect),
                                "interaction": interaction,
                            }),
                        });
                    }
                    _ => BrowserActionEffect::Observe,
                }
            } else {
                match declared {
                    Some(BrowserActionEffect::Observe) => {
                        return Err(BrowserActionEffectFailure {
                            code: "invalid_browser_action",
                            message: "observe cannot activate: hover inspects without clicking, and a mutating gesture requires a mutating effect.".to_string(),
                            detail: json!({ "action": action, "interaction": interaction }),
                        });
                    }
                    _ => keep_mutating_effect(declared, BrowserActionEffect::EditDraft),
                }
            }
        }
        ("lyra_lumen", "vact") => {
            if let Some(steps) = input.get("steps").and_then(Value::as_array) {
                if steps.is_empty() || steps.len() > 16 {
                    return Err(BrowserActionEffectFailure {
                        code: "invalid_browser_action",
                        message: "Browser action sequence is not a valid operation.".to_string(),
                        detail: json!({ "action": action, "steps": steps.len() }),
                    });
                }
                let mut mutating = false;
                for step in steps {
                    let gesture = step
                        .get("interaction")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    if !matches!(
                        gesture,
                        "click"
                            | "doubleClick"
                            | "rightClick"
                            | "hover"
                            | "drag"
                            | "scroll"
                            | "type"
                            | "press"
                    ) {
                        return Err(BrowserActionEffectFailure {
                            code: "invalid_browser_action",
                            message: "Browser action sequence is not a valid operation."
                                .to_string(),
                            detail: json!({ "action": action, "interaction": gesture }),
                        });
                    }
                    if !matches!(gesture, "hover" | "scroll") {
                        mutating = true;
                    }
                }
                if mutating {
                    keep_mutating_effect(declared, BrowserActionEffect::EditDraft)
                } else {
                    BrowserActionEffect::Observe
                }
            } else if matches!(interaction, "hover" | "scroll") {
                BrowserActionEffect::Observe
            } else {
                keep_mutating_effect(declared, BrowserActionEffect::EditDraft)
            }
        }
        ("lyra_ax", "act") => {
            if matches!(interaction, "hover" | "focus") {
                BrowserActionEffect::Observe
            } else {
                keep_mutating_effect(declared, BrowserActionEffect::EditDraft)
            }
        }
        ("lyra_lumen" | "lyra_ax", "press") => {
            if browser_press_is_observational(input) {
                match declared {
                    Some(BrowserActionEffect::Observe | BrowserActionEffect::EditDraft) => {
                        declared.unwrap_or(BrowserActionEffect::Observe)
                    }
                    _ => BrowserActionEffect::Observe,
                }
            } else {
                keep_mutating_effect(declared, BrowserActionEffect::EditDraft)
            }
        }
        _ => keep_mutating_effect(declared, BrowserActionEffect::EditDraft),
    };
    Ok(Some(effect))
}

pub(crate) async fn execute_host_tool_adapter(
    session_id: &str,
    turn_id: &str,
    dispatcher: &Option<Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    host_method: &str,
    display_name: &str,
    action: &str,
    input: Value,
    started_at: &str,
) -> Value {
    let mut input = attach_runtime_cancellation(
        input,
        session_id,
        turn_id,
        tool_call_id,
        display_name,
        action,
    );
    strip_untrusted_ax_authorization(display_name, action, &mut input);
    default_lumen_type_effect(display_name, action, &mut input);
    default_browser_interaction(display_name, action, &mut input);
    let (mut input, timeout_ms) = apply_tool_timeout_policy(input, display_name, action);
    let mut policy_decision = None;
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_call_id,
            display_name,
            &tool_label(display_name, action),
            "running",
            input.clone(),
            None,
            started_at,
            None,
        ),
        "toolStarted",
    );
    match validate_browser_action_effect(display_name, action, &input) {
        Ok(effect) => {
            if let Some(effect) = effect {
                write_browser_action_effect(&mut input, effect);
            }
        }
        Err(failure) => {
            let output = json!({
                "content": failure.message,
                "error": {
                    "code": failure.code,
                    "message": failure.message,
                    "detail": failure.detail,
                },
            });
            record_tool_activity(
                session_id,
                turn_id,
                tool_activity(
                    tool_call_id,
                    display_name,
                    &tool_label(display_name, action),
                    "failed",
                    input,
                    Some(output.clone()),
                    started_at,
                    Some(now()),
                ),
                "toolFinished",
            );
            return output;
        }
    };
    if let Some(risk) = permission_risk(display_name, action, &input)
        && evaluate_permission_policy(display_name, action, Some(&risk), &input)
            == PermissionPolicyDecision::Deny
    {
        let output = attach_policy_decision_to_output(
            json!({
                "content": "This tool call was denied by the local Lyra Agent permission policy.",
                "error": {
                    "code": "permissionPolicyDenied",
                    "message": "The local permission policy denied this tool request.",
                }
            }),
            Some(policy_denial_decision(display_name, action, &input, &risk)),
        );
        record_tool_activity(
            session_id,
            turn_id,
            tool_activity(
                tool_call_id,
                display_name,
                &tool_label(display_name, action),
                "failed",
                input,
                Some(output.clone()),
                started_at,
                Some(now()),
            ),
            "toolFinished",
        );
        return output;
    }
    if let Some(permission) = permission_request_for_tool(
        session_id,
        turn_id,
        tool_call_id,
        display_name,
        action,
        &input,
    ) {
        let permission_record = permission.clone();
        if cancellation.is_cancelled() {
            return cancelled_tool_output(
                CANCEL_REASON_PERMISSION_WAIT,
                "Lyra tool call was cancelled before permission was resolved.",
                "Ask the user again in a new turn if the action is still needed.",
                None,
            );
        }
        match wait_for_permission_with_cancellation_async(permission, cancellation).await {
            Ok(true) => {
                policy_decision = Some(policy_decision_from_permission(
                    &permission_record,
                    "approved",
                ));
                inject_trusted_ax_authorization(
                    display_name,
                    action,
                    &mut input,
                    tool_call_id,
                    Some(&permission_record),
                );
            }
            Ok(false) => {
                let output = attach_policy_decision_to_output(
                    json!({
                        "content": "Permission denied by the user. Do not execute this tool call; choose a safer alternative or explain what cannot proceed.",
                        "error": {
                            "code": "permissionDenied",
                            "message": "The user denied this tool request.",
                        }
                    }),
                    Some(policy_decision_from_permission(
                        &permission_record,
                        "denied",
                    )),
                );
                record_tool_activity(
                    session_id,
                    turn_id,
                    tool_activity(
                        tool_call_id,
                        display_name,
                        &tool_label(display_name, action),
                        "failed",
                        input,
                        Some(output.clone()),
                        started_at,
                        Some(now()),
                    ),
                    "toolFinished",
                );
                return output;
            }
            Err(error) => {
                let cancelled = permission_wait_was_cancelled(&error);
                let output = if cancelled {
                    cancelled_tool_output(
                        CANCEL_REASON_PERMISSION_WAIT,
                        "Lyra tool call was cancelled before permission was resolved.",
                        "Ask the user again in a new turn if the action is still needed.",
                        None,
                    )
                } else {
                    tool_failure_output(
                        "permission_request_failed",
                        &format!("Permission request failed: {error}"),
                        "Stop this tool call and wait for user input before retrying.",
                        None,
                    )
                };
                record_tool_activity(
                    session_id,
                    turn_id,
                    tool_activity(
                        tool_call_id,
                        display_name,
                        &tool_label(display_name, action),
                        if cancelled { "cancelled" } else { "failed" },
                        input,
                        Some(output.clone()),
                        started_at,
                        Some(now()),
                    ),
                    "toolFinished",
                );
                return output;
            }
        }
    } else if policy_record_required(display_name, action, &input) {
        policy_decision = Some(auto_approval_policy_decision(display_name, action, &input));
        inject_trusted_ax_authorization(display_name, action, &mut input, tool_call_id, None);
    }
    if cancellation.is_cancelled() {
        let output = cancelled_tool_output(
            CANCEL_REASON_TURN_CANCELLED,
            "Lyra tool call was cancelled.",
            "Stop this tool call and continue only after a new user turn.",
            None,
        );
        record_tool_activity(
            session_id,
            turn_id,
            tool_activity(
                tool_call_id,
                display_name,
                &tool_label(display_name, action),
                "cancelled",
                input,
                Some(output.clone()),
                started_at,
                Some(now()),
            ),
            "toolFinished",
        );
        return output;
    }
    let raw_result = async {
        let dispatcher = dispatcher
            .as_ref()
            .ok_or_else(|| "Lyra host capability bridge is not available".to_string())?;
        let _concurrency_guard = if display_name == "lyra_lumen" || display_name == "lyra_ax" {
            loop {
                if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
                    return Err("cancelled".to_string());
                }
                if let Ok(acquired) = BrowserConcurrencyGuard::try_acquire() {
                    break Some(acquired);
                }
                tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            }
        } else {
            None
        };
        invoke_host_capability_with_timeout_async(
            dispatcher.clone(),
            host_method.to_string(),
            input.clone(),
            timeout_ms,
        )
        .await
    }
    .await;
    if cancellation.is_cancelled() {
        let output = cancelled_tool_output(
            CANCEL_REASON_TURN_CANCELLED,
            "Lyra tool call was cancelled.",
            "Stop this tool call and continue only after a new user turn.",
            None,
        );
        record_tool_activity(
            session_id,
            turn_id,
            tool_activity(
                tool_call_id,
                display_name,
                &tool_label(display_name, action),
                "cancelled",
                input,
                Some(output.clone()),
                started_at,
                Some(now()),
            ),
            "toolFinished",
        );
        return output;
    }
    let (status, output, finished_input) = match raw_result {
        Ok(mut value) => {
            let user_action_resolution = resolve_host_needs_user_action(
                session_id,
                turn_id,
                tool_call_id,
                cancellation,
                display_name,
                action,
                &input,
                &value,
                dispatcher.as_ref(),
            )
            .await;
            if let Some(resolution) = user_action_resolution.as_ref()
                && let Some(object) = value.as_object_mut()
            {
                object.insert("userActionResolution".to_string(), resolution.clone());
            }
            attach_lumen_screenshot_artifact(
                session_id,
                turn_id,
                tool_call_id,
                display_name,
                action,
                &mut value,
            );
            attach_workbench_visual_evidence_artifact(
                session_id,
                turn_id,
                tool_call_id,
                display_name,
                action,
                &mut value,
            );
            attach_lumen_page_artifact(
                session_id,
                turn_id,
                tool_call_id,
                display_name,
                action,
                &mut value,
            );
            let activity_input = resolved_tool_activity_input(input.clone(), &value);
            let raw = attach_host_log_artifact(
                session_id,
                turn_id,
                tool_call_id,
                display_name,
                action,
                redacted_tool_raw_output(display_name, action, value.clone()),
            );
            let raw = attach_policy_decision_to_raw(raw, policy_decision.clone());
            let status = if value.get("status").and_then(Value::as_str) == Some("uncertain")
                || value.get("outcome").and_then(Value::as_str) == Some("uncertain")
            {
                "uncertain"
            } else if value.get("status").and_then(Value::as_str) == Some("blocked")
                || value.get("browserBlocked").and_then(Value::as_bool) == Some(true)
            {
                "failed"
            } else if value
                .pointer("/userActionResolution/decision")
                .and_then(Value::as_str)
                == Some("continue_agent")
            {
                "uncertain"
            } else if value.get("ok").and_then(Value::as_bool) == Some(false)
                || value.get("error").is_some_and(|value| !value.is_null())
            {
                "failed"
            } else {
                "completed"
            };
            let mut content = format_tool_output(display_name, action, &value);
            if let Some(resolution) = user_action_resolution.as_ref() {
                content.push_str("\n\n");
                content.push_str(&format_user_action_resolution(resolution));
            }
            (
                status,
                json!({
                    "content": content,
                    "raw": raw,
                }),
                activity_input,
            )
        }
        Err(error) => {
            // The browser concurrency guard reports turn-end as a bare
            // "cancelled" string; keep it in the cancellation contract
            // instead of masking it as a host failure.
            if error == "cancelled" {
                let output = cancelled_tool_output(
                    CANCEL_REASON_TURN_SUPERSEDED,
                    "This tool call was cancelled because its turn is no longer active.",
                    "Stop this tool call and continue only after a new user turn.",
                    None,
                );
                ("cancelled", output, input)
            } else {
                // Timeout failures keep their dedicated error contract so callers
                // can distinguish an elapsed budget from a generic host failure.
                let timed_out = timeouts::is_timeout_error(&error);
                let mut output = json!({
                    "content": format!("Lyra tool failed: {error}"),
                    "error": {
                        "code": if timed_out { "timeout" } else { "host_capability_failed" },
                        "message": error,
                    },
                });
                if timed_out {
                    output["notRunReason"] = json!("timeout");
                }
                ("failed", output, input.clone())
            }
        }
    };
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_call_id,
            display_name,
            &tool_label(display_name, action),
            status,
            finished_input,
            Some(output.clone()),
            started_at,
            Some(now()),
        ),
        "toolFinished",
    );
    output
}

pub(crate) fn host_adapter_arguments(arguments: Value, action: &str) -> Value {
    let mut input = arguments.as_object().cloned().unwrap_or_default();
    input.insert("action".to_string(), Value::String(action.to_string()));
    Value::Object(input)
}

pub(crate) fn host_call_arguments(display_name: &str, arguments: Value, action: &str) -> Value {
    // computer_act's catalog operation is "act". The model's action (focus,
    // press, scroll) is the gesture the host executes.
    if display_name == "lyra_computer" {
        return arguments;
    }
    host_adapter_arguments(arguments, action)
}

// Resolve only an omitted gesture. The action, not a second effect field,
// decides whether the call is observation or a mutation.
fn default_browser_interaction(display_name: &str, action: &str, input: &mut Value) {
    if !matches!(
        (display_name, action),
        ("lyra_lumen", "act" | "vact") | ("lyra_ax", "act")
    ) {
        return;
    }
    let Some(object) = input.as_object_mut() else {
        return;
    };
    if !object.contains_key("interaction") {
        // Effect describes a consequence, never a gesture. Legacy omitted
        // gestures mean click; observe consequently fails validation instead
        // of silently becoming an unrelated hover.
        let gesture = "click";
        object.insert("interaction".into(), json!(gesture));
    }
}

fn default_lumen_type_effect(display_name: &str, action: &str, input: &mut Value) {
    if display_name != "lyra_lumen" || action != "type" {
        return;
    }
    // A compound operation includes a real click. Keep that effect all the
    // way through validation and permission checks; only the host's fill
    // substep is an editDraft.
    if input
        .get("thenClick")
        .and_then(Value::as_str)
        .is_some_and(|target| !target.trim().is_empty())
    {
        return;
    }
    if let Some(object) = input.as_object_mut() {
        object.entry("effect").or_insert_with(|| json!("editDraft"));
    }
}

#[cfg(test)]
#[test]
fn browser_type_submit_does_not_downgrade_the_click_before_policy() {
    for effect in [
        "communicate",
        "submitExternal",
        "purchase",
        "delete",
        "authorize",
    ] {
        let mut input = json!({"thenClick":"lumen:submit", "effect":effect});
        default_lumen_type_effect("lyra_lumen", "type", &mut input);
        assert_eq!(input["effect"], effect);
        assert!(
            validate_browser_action_effect("lyra_lumen", "type", &input)
                .unwrap()
                .is_some()
        );
    }
    for effect in ["observe", "editDraft", "navigate", "click"] {
        let input = json!({"thenClick":"lumen:submit", "effect":effect});
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "type", &input).unwrap(),
            Some(BrowserActionEffect::Communicate)
        );
    }
    let mut missing = json!({"thenClick":"lumen:submit"});
    default_lumen_type_effect("lyra_lumen", "type", &mut missing);
    assert_eq!(
        validate_browser_action_effect("lyra_lumen", "type", &missing).unwrap(),
        Some(BrowserActionEffect::Communicate)
    );
}

fn strip_untrusted_ax_authorization(display_name: &str, action: &str, input: &mut Value) {
    if !matches!((display_name, action), ("lyra_ax", "act" | "press")) {
        return;
    }
    let Some(object) = input.as_object_mut() else {
        return;
    };
    object.remove("authorized");
    object.remove("axAuthorization");
}

fn inject_trusted_ax_authorization(
    display_name: &str,
    action: &str,
    input: &mut Value,
    tool_call_id: &str,
    permission: Option<&PermissionRequest>,
) {
    if !matches!((display_name, action), ("lyra_ax", "act" | "press")) {
        return;
    }
    let Some(object) = input.as_object_mut() else {
        return;
    };
    let Some(ax_ref) = object.get("axRef").and_then(Value::as_str) else {
        return;
    };
    let mut authorization = Map::new();
    authorization.insert(
        "kind".to_string(),
        Value::String("lyra_ax_one_time".to_string()),
    );
    authorization.insert("action".to_string(), Value::String(action.to_string()));
    authorization.insert("axRef".to_string(), Value::String(ax_ref.to_string()));
    authorization.insert(
        "toolCallId".to_string(),
        Value::String(tool_call_id.to_string()),
    );
    if let Some(permission) = permission {
        authorization.insert(
            "permissionRequestId".to_string(),
            Value::String(permission.id.clone()),
        );
    }
    authorization.insert("issuedAt".to_string(), Value::String(now()));
    authorization.insert(
        "expiresAt".to_string(),
        Value::Number((Utc::now().timestamp_millis() + 120_000).into()),
    );
    if let Some(tab_id) = object.get("tabId").and_then(Value::as_str) {
        authorization.insert("tabId".to_string(), Value::String(tab_id.to_string()));
    }
    if let Some(target_mode) = object.get("targetMode").and_then(Value::as_str)
        && matches!(target_mode, "live" | "isolated")
    {
        authorization.insert(
            "targetMode".to_string(),
            Value::String(target_mode.to_string()),
        );
    }
    object.insert("axAuthorization".to_string(), Value::Object(authorization));
}

pub(crate) fn browser_host_adapter_arguments(
    arguments: Value,
    action: &str,
    runtime: ToolExecutionRuntime,
) -> Value {
    let mut input = host_adapter_arguments(arguments, action);
    if matches!(action, "see" | "vact")
        && let Some(object) = input.as_object_mut()
    {
        object
            .entry("modelSupportsImageInput".to_string())
            .or_insert(Value::Bool(runtime.supports_image_input));
    }
    input
}

pub(crate) fn software_capability_adapter_arguments(
    arguments: Value,
    software_id: &str,
    action_id: &str,
) -> Value {
    let original_args = arguments
        .pointer("/toolOperation/args")
        .cloned()
        .unwrap_or_else(|| strip_tool_fs_metadata(arguments.clone()));
    let reason = original_args
        .get("reason")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string);
    let mut payload = serde_json::Map::new();
    payload.insert(
        "softwareId".to_string(),
        Value::String(software_id.to_string()),
    );
    payload.insert("actionId".to_string(), Value::String(action_id.to_string()));
    payload.insert(
        "capabilityId".to_string(),
        Value::String(action_id.to_string()),
    );
    payload.insert("input".to_string(), original_args);
    if let Some(reason) = reason {
        payload.insert("reason".to_string(), Value::String(reason));
    }
    for key in ["toolPath", "domain", "operation", "toolOperation"] {
        if let Some(value) = arguments.get(key).cloned() {
            payload.insert(key.to_string(), value);
        }
    }
    Value::Object(payload)
}

pub(crate) fn strip_tool_fs_metadata(arguments: Value) -> Value {
    let mut input = arguments.as_object().cloned().unwrap_or_default();
    for key in ["toolPath", "domain", "operation", "toolOperation", "action"] {
        input.remove(key);
    }
    Value::Object(input)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn visual_sequences_cannot_hide_mutation_inside_observation() {
        let mut request = json!({"interaction":"sequence","effect":"observe","steps":[
            {"interaction":"hover","mark":"1"},{"interaction":"click","mark":"2"}
        ]});
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "vact", &request).unwrap(),
            Some(BrowserActionEffect::EditDraft)
        );
        request["effect"] = json!("editDraft");
        assert!(validate_browser_action_effect("lyra_lumen", "vact", &request).is_ok());
        request["steps"][1]["interaction"] = json!("invented");
        assert!(validate_browser_action_effect("lyra_lumen", "vact", &request).is_err());
    }

    #[test]
    fn action_assigns_effect_when_the_declaration_disagrees() {
        // lyra_lumen act fails closed: a declaration that contradicts the
        // gesture is rejected, never rewritten (codex semantics).
        for (declared_effect, interaction) in [
            ("observe", Some("click")),
            ("observe", None),
            ("delete", Some("hover")),
        ] {
            let mut input = json!({"effect": declared_effect});
            if let Some(interaction) = interaction {
                input["interaction"] = json!(interaction);
            }
            assert!(
                validate_browser_action_effect("lyra_lumen", "act", &input).is_err(),
                "contradictory act declaration must be rejected: {input}"
            );
        }
        // vact and the accessibility act keep the rewrite semantics: a
        // mutation hidden behind an observe declaration is reclassified as a
        // mutating effect so it still passes the mutating permission gate.
        for (display, action) in [("lyra_lumen", "vact"), ("lyra_ax", "act")] {
            let mut click = json!({"interaction":"click","effect":"observe"});
            default_browser_interaction(display, action, &mut click);
            assert_eq!(
                validate_browser_action_effect(display, action, &click).unwrap(),
                Some(BrowserActionEffect::EditDraft)
            );
            let mut hover = json!({"interaction":"hover","effect":"delete"});
            default_browser_interaction(display, action, &mut hover);
            assert_eq!(
                validate_browser_action_effect(display, action, &hover).unwrap(),
                Some(BrowserActionEffect::Observe)
            );
        }
        let mut omitted = json!({"effect":"observe"});
        default_browser_interaction("lyra_lumen", "vact", &mut omitted);
        assert_eq!(omitted["interaction"], "click");
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "vact", &omitted).unwrap(),
            Some(BrowserActionEffect::EditDraft)
        );
        let mut typed = json!({"effect":"observe"});
        default_lumen_type_effect("lyra_lumen", "type", &mut typed);
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "type", &typed).unwrap(),
            Some(BrowserActionEffect::EditDraft)
        );
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "elevate", &json!({"effect":"observe"}))
                .unwrap(),
            Some(BrowserActionEffect::Authorize)
        );
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "drag", &json!({"effect":"observe"}))
                .unwrap(),
            Some(BrowserActionEffect::EditDraft)
        );
        assert_eq!(
            validate_browser_action_effect("lyra_lumen", "dialog", &json!({})).unwrap(),
            Some(BrowserActionEffect::Communicate)
        );
    }
}

#[test]
fn browser_selection_keys_allow_draft_navigation_but_never_downgrade_submit_keys() {
    for key in [
        "ArrowUp",
        "Shift+ArrowLeft",
        "Shift+Left",
        "shift+left",
        "CTRL+HOME",
        "super+right",
        "esc",
        "SHIFT+TAB",
    ] {
        for effect in ["observe", "editDraft"] {
            assert!(
                validate_browser_action_effect(
                    "lyra_lumen",
                    "press",
                    &json!({"key": key, "effect": effect})
                )
                .is_ok()
            );
        }
    }
    for key in [
        "Enter",
        "Control+Enter",
        "Control+b",
        "Backspace",
        "Alt+ArrowLeft",
        "alt+left",
        "ctrl+tab",
        "shift+escape",
        "return",
        "SPACE",
    ] {
        assert_eq!(
            validate_browser_action_effect(
                "lyra_lumen",
                "press",
                &json!({"key": key, "effect": "observe"})
            )
            .unwrap(),
            Some(BrowserActionEffect::EditDraft)
        );
    }
    assert!(
        validate_browser_action_effect(
            "lyra_lumen",
            "press",
            &json!({"key": "Control+Enter", "effect": "communicate"})
        )
        .is_ok()
    );
}

#[test]
fn computer_act_keeps_the_model_action() {
    let kept = host_call_arguments(
        "lyra_computer",
        json!({"action": "focus", "name": "v2rayN"}),
        "act",
    );
    assert_eq!(kept["action"], "focus");
    let replaced = host_call_arguments("lyra_lumen", json!({"interaction": "click"}), "act");
    assert_eq!(replaced["action"], "act");
    assert_eq!(replaced["interaction"], "click");
}
