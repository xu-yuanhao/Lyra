use super::*;

pub(crate) async fn synthesize_after_progress_guard_async(
    session_id: &str,
    turn_id: &str,
    request: &ModelRequest,
    mut messages: Vec<Value>,
    mut observations: ModelLoopObservations,
    cancellation: &CancellationToken,
    reason: &str,
    observed_occurrences: usize,
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelLoopResult> {
    let mut attempt_local_overlay_start = None;
    emit_tool_progress_guard_event(
        session_id,
        turn_id,
        "toolProgressGuardTriggered",
        reason,
        observed_occurrences,
    );
    append_attempt_local_context_update(
        &mut messages,
        &mut attempt_local_overlay_start,
        "progress-guard-final-synthesis",
        PROGRESS_GUARD_FINAL_SYNTHESIS_PROMPT,
    );
    emit_turn_state(
        session_id,
        turn_id,
        if request.capabilities.supports_streaming {
            "streaming_model"
        } else {
            "calling_model"
        },
        "tool_progress_guard_final_synthesis",
    );
    let clarification_tools = progress_guard_clarification_tools(request);
    let (reply, final_text) = call_progress_guard_reply_async(
        session_id,
        turn_id,
        request,
        &mut messages,
        &clarification_tools,
        &ModelToolChoice::Auto,
        cancellation,
        commit_assistant_text,
        &mut observations,
        &mut attempt_local_overlay_start,
    )
    .await?;
    let protocol_id = provider_protocol_id(request);
    let openai_responses_protocol = protocol_id == openai_responses::PROTOCOL_ID;
    if reply.tool_calls.is_empty() {
        let response_replay_items = openai_responses_protocol
            .then(|| retained_provider_replay_items(&reply.provider_replay_items, &[]))
            .unwrap_or_default();
        let mut assistant_message = json!({
            "role": "assistant",
            "content": reply.content.clone().unwrap_or_default(),
        });
        if !response_replay_items.is_empty() {
            assistant_message["openaiResponsesShadow"] = Value::Bool(true);
        }
        attach_assistant_replay(&mut assistant_message, &reply);
        let final_protocol_step = provider_protocol_step(
            request,
            turn_id,
            &reply,
            &[],
            "complete",
            Vec::new(),
            Vec::new(),
        );
        crate::native_backend::turns::upsert_provider_protocol_log_entry(
            session_id,
            turn_id,
            reply
                .ui_message_id
                .as_deref()
                .filter(|id| !id.trim().is_empty()),
            final_protocol_step,
        )?;
        let result = ModelLoopResult::final_text(final_text)
            .with_ui_text_committed(reply.ui_message_id.is_some())
            .with_final_message_id(reply.ui_message_id.clone());
        return Ok(with_model_loop_observations(
            result,
            &observations,
            &messages,
            true,
        ));
    }
    if reply.tool_calls.len() != 1
        || reply
            .tool_calls
            .first()
            .is_none_or(|call| call.name != LYRA_CLARIFICATION_ASK_TOOL)
    {
        if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
            let _ = remove_assistant_message(session_id, message_id);
        } else {
            clear_failed_assistant_draft(session_id, turn_id);
        }
        return Err(AgentRuntimeError::Core(
            "provider requested non-clarification tools during progress-guard synthesis"
                .to_string(),
        ));
    }
    let reply_response_id = reply.response_meta.response_id.clone();
    let tool_call = reply
        .tool_calls
        .first()
        .expect("checked clarification call")
        .clone();
    let response_replay_items = openai_responses_protocol
        .then(|| {
            retained_provider_replay_items(
                &reply.provider_replay_items,
                std::slice::from_ref(&tool_call),
            )
        })
        .unwrap_or_default();
    if !response_replay_items.is_empty() {
        messages.extend(response_replay_items.clone());
    }
    let assistant_content = reply.content.clone().unwrap_or_default();
    let assistant_message = json!({
        "role": "assistant",
        "content": assistant_content,
        "tool_calls": [{
            "id": tool_call.id,
            "type": "function",
            "function": {
                "name": tool_call.name,
                "arguments": serde_json::to_string(&tool_call.arguments)
                    .unwrap_or_else(|_| "{}".to_string())
            }
        }],
    });
    let mut assistant_message = assistant_message;
    if !response_replay_items.is_empty() {
        assistant_message["openaiResponsesShadow"] = Value::Bool(true);
    }
    attach_assistant_replay(&mut assistant_message, &reply);
    messages.push(assistant_message.clone());
    let tool_step_message_id = reply.ui_message_id.clone();
    let mut tool_protocol_step = provider_protocol_step(
        request,
        turn_id,
        &reply,
        std::slice::from_ref(&tool_call),
        "awaitingToolResults",
        Vec::new(),
        Vec::new(),
    );
    persist_tool_protocol_checkpoint(
        session_id,
        turn_id,
        tool_step_message_id.as_deref(),
        &tool_protocol_step,
    )?;
    let input_start = messages.len();
    advance_stateful_responses(&mut messages, reply_response_id.as_deref(), input_start);
    emit_turn_state(
        session_id,
        turn_id,
        "waiting_for_tool",
        "progress_guard_clarification_started",
    );
    let output = execute_model_tool_with_runtime(
        session_id,
        turn_id,
        &request.host_dispatcher,
        cancellation,
        ToolExecutionRuntime::from_model_capabilities(&request.capabilities),
        tool_call.clone(),
    )
    .await;
    let (content, _) = provider_visible_tool_result_content(&output, &tool_call.id, 24_000);
    let mut tool_message = json!({
        "role": "tool",
        "tool_call_id": tool_call.id,
        "content": content,
        "lyraToolStatus": if tool_output_failed(&output) {
            "failed"
        } else {
            "completed"
        },
        "lyraToolFailure": output.get("error")
            .or_else(|| output.pointer("/raw/error"))
            .cloned()
            .unwrap_or(Value::Null),
    });
    if openai_responses_protocol {
        tool_message["openaiResponsesShadow"] = Value::Bool(true);
        let output_item =
            openai_responses::function_call_output_item(&tool_call.id, content.clone());
        messages.push(output_item);
    }
    messages.push(tool_message.clone());
    tool_protocol_step["toolResults"] = json!([{
        "toolCallId": tool_call.id,
        "content": content,
        "status": if tool_output_failed(&output) {
            "failed"
        } else {
            "completed"
        },
    }]);
    persist_tool_protocol_checkpoint(
        session_id,
        turn_id,
        tool_step_message_id.as_deref(),
        &tool_protocol_step,
    )?;
    append_attempt_local_context_update(
        &mut messages,
        &mut attempt_local_overlay_start,
        "progress-guard-clarification-complete",
        "Member answered structured clarification. Produce final answer now from gathered evidence and member decision. Do not call more tools.",
    );
    tool_protocol_step["status"] = json!("complete");
    persist_tool_protocol_checkpoint(
        session_id,
        turn_id,
        tool_step_message_id.as_deref(),
        &tool_protocol_step,
    )?;
    crate::native_backend::turns::clear_active_ui_message_id(session_id, turn_id);
    emit_turn_state(
        session_id,
        turn_id,
        if request.capabilities.supports_streaming {
            "streaming_model"
        } else {
            "calling_model"
        },
        "tool_progress_guard_after_clarification",
    );
    let no_tools = Vec::new();
    let (final_reply, final_text) = call_progress_guard_reply_async(
        session_id,
        turn_id,
        request,
        &mut messages,
        &no_tools,
        &ModelToolChoice::None,
        cancellation,
        commit_assistant_text,
        &mut observations,
        &mut attempt_local_overlay_start,
    )
    .await?;
    if !final_reply.tool_calls.is_empty() {
        if let Some(message_id) = final_reply
            .ui_message_id
            .as_ref()
            .filter(|id| !id.is_empty())
        {
            let _ = remove_assistant_message(session_id, message_id);
        } else {
            clear_failed_assistant_draft(session_id, turn_id);
        }
        return Err(AgentRuntimeError::Core(
            "provider requested tools after progress-guard clarification".to_string(),
        ));
    }
    let response_replay_items = openai_responses_protocol
        .then(|| retained_provider_replay_items(&final_reply.provider_replay_items, &[]))
        .unwrap_or_default();
    let mut final_assistant = json!({
        "role": "assistant",
        "content": final_reply.content.clone().unwrap_or_default(),
    });
    if !response_replay_items.is_empty() {
        final_assistant["openaiResponsesShadow"] = Value::Bool(true);
    }
    attach_assistant_replay(&mut final_assistant, &final_reply);
    let final_protocol_step = provider_protocol_step(
        request,
        turn_id,
        &final_reply,
        &[],
        "complete",
        Vec::new(),
        Vec::new(),
    );
    crate::native_backend::turns::upsert_provider_protocol_log_entry(
        session_id,
        turn_id,
        final_reply
            .ui_message_id
            .as_deref()
            .filter(|id| !id.trim().is_empty()),
        final_protocol_step,
    )?;
    let result = ModelLoopResult::final_text(final_text)
        .with_ui_text_committed(final_reply.ui_message_id.is_some())
        .with_final_message_id(final_reply.ui_message_id.clone());
    Ok(with_model_loop_observations(
        result,
        &observations,
        &messages,
        true,
    ))
}

async fn call_progress_guard_reply_async(
    session_id: &str,
    turn_id: &str,
    request: &ModelRequest,
    messages: &mut Vec<Value>,
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
    observations: &mut ModelLoopObservations,
    attempt_local_overlay_start: &mut Option<usize>,
) -> AgentRuntimeResult<(ModelReply, String)> {
    // One shared correction budget, mirroring the main model loop. When no
    // tools are declared a missing-tool call cannot be corrected, so that
    // action fails instead of consuming the budget.
    let mut model_correction_retries = 0_u8;
    let mut continuation_retries = 0_u8;
    let mut truncated_prefix = String::new();
    let mut effective_tool_choice = tool_choice.clone();
    loop {
        seal_tool_result_groups(messages);
        let attempt_result = call_model_once_for_loop_async(
            session_id,
            turn_id,
            &request.provider,
            &request.model,
            messages,
            tools,
            &effective_tool_choice,
            &request.capabilities,
            cancellation,
            commit_assistant_text,
        )
        .await;
        clear_attempt_local_overlay(messages, attempt_local_overlay_start);
        let mut reply = attempt_result?;
        observations.observe(&reply);
        checkpoint_model_loop_observations(session_id, turn_id, observations, messages);
        let outcome = classify_attempt_outcome(&reply);
        let action = if tools.is_empty() && outcome == AttemptOutcome::ToolUseWithoutCall {
            RecoveryAction::Fail(ProviderProtocolFailureKind::IncompleteToolCall)
        } else {
            recovery_action_for_attempt(outcome, model_correction_retries, continuation_retries)
        };
        if action == RecoveryAction::ContinueVisibleText {
            continuation_retries += 1;
            let segment = reply.content.clone().unwrap_or_default();
            truncated_prefix.push_str(&segment);
            let response_replay_items = if reply.provider_replay_protocol.as_deref()
                == Some(openai_responses::PROTOCOL_ID)
            {
                retained_provider_replay_items(&reply.provider_replay_items, &[])
            } else {
                Vec::new()
            };
            if !response_replay_items.is_empty() {
                messages.extend(response_replay_items);
            }
            let mut assistant = json!({ "role": "assistant", "content": segment });
            attach_assistant_replay(&mut assistant, &reply);
            messages.push(assistant);
            // Continuation segments have no surviving UI message; the step
            // stays unanchored until finish_turn commits the final text.
            crate::native_backend::turns::upsert_provider_protocol_log_entry(
                session_id,
                turn_id,
                None,
                provider_protocol_step(
                    request,
                    turn_id,
                    &reply,
                    &[],
                    "complete",
                    Vec::new(),
                    Vec::new(),
                ),
            )?;
            let input_start = messages.len();
            advance_stateful_responses(
                messages,
                reply.response_meta.response_id.as_deref(),
                input_start,
            );
            if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                let _ = remove_assistant_message(session_id, message_id);
            } else {
                clear_failed_assistant_draft(session_id, turn_id);
            }
            append_attempt_local_context_update(
                messages,
                attempt_local_overlay_start,
                "max-tokens-continuation",
                MAX_TOKENS_CONTINUATION_PROMPT,
            );
            emit_provider_retry(
                session_id,
                turn_id,
                "provider_max_tokens_continuation_retry",
                continuation_retries,
                "model output truncated by max_tokens; continuing",
            );
            continue;
        }
        if action == RecoveryAction::RetryIncompleteToolCall {
            model_correction_retries += 1;
            if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                let _ = remove_assistant_message(session_id, message_id);
            } else {
                clear_failed_assistant_draft(session_id, turn_id);
            }
            append_truncated_tool_call_recovery(messages, attempt_local_overlay_start, &reply);
            emit_provider_retry(
                session_id,
                turn_id,
                "provider_truncated_tool_call_retry",
                model_correction_retries,
                "tool calls were returned with max_tokens; no tool executed",
            );
            continue;
        }
        if action == RecoveryAction::RetryMissingToolCall {
            model_correction_retries += 1;
            if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                let _ = remove_assistant_message(session_id, message_id);
            } else {
                clear_failed_assistant_draft(session_id, turn_id);
            }
            let input_start = messages.len();
            advance_stateful_responses(
                messages,
                reply.response_meta.response_id.as_deref(),
                input_start,
            );
            effective_tool_choice = if request.capabilities.supports_tool_choice {
                ModelToolChoice::Required
            } else {
                ModelToolChoice::Auto
            };
            append_attempt_local_context_update(
                messages,
                attempt_local_overlay_start,
                "missing-tool-correction",
                no_tools_used_corrective_prompt(true),
            );
            emit_provider_retry(
                session_id,
                turn_id,
                "provider_missing_tool_call_retry",
                model_correction_retries,
                "provider stopped for tool use without a complete structured tool call",
            );
            continue;
        }
        let (recovery_kind, retry_reason, retry_message, retry_prompt, retry_count) = match action {
            RecoveryAction::RetryReasoningOnly => {
                model_correction_retries += 1;
                (
                    "reasoning-only-recovery",
                    "provider_reasoning_only_retry",
                    "provider returned reasoning without final assistant text or tool call",
                    "Finish the current response now. Return normal assistant text, or emit a complete structured tool call if a tool is required. Do not return reasoning alone.",
                    model_correction_retries,
                )
            }
            RecoveryAction::RetryTerminalEmpty => {
                model_correction_retries += 1;
                (
                    "terminal-empty-recovery",
                    "provider_terminal_empty_retry",
                    "assistant reply contained no visible text or tool call",
                    "The previous response ended without assistant text or a tool call. Complete the same request now with normal assistant text or one complete structured tool call.",
                    model_correction_retries,
                )
            }
            RecoveryAction::Fail(kind) => {
                if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                    let _ = remove_assistant_message(session_id, message_id);
                } else {
                    clear_failed_assistant_draft(session_id, turn_id);
                }
                return Err(AgentRuntimeError::ProviderProtocol {
                    kind,
                    detail: format!(
                        "provider `{}` model `{}` returned unusable progress-guard synthesis (outcome: `{:?}`, stop reason: `{}`)",
                        request.provider.id,
                        request.model,
                        outcome,
                        reply.raw_stop_reason.as_deref().unwrap_or("unknown"),
                    ),
                });
            }
            RecoveryAction::Accept => {
                if !truncated_prefix.is_empty() && reply.tool_calls.is_empty() {
                    truncated_prefix.push_str(reply.content.as_deref().unwrap_or_default());
                    if outcome == AttemptOutcome::MaxTokensWithText {
                        if !truncated_prefix.ends_with('\n') {
                            truncated_prefix.push_str("\n\n");
                        }
                        truncated_prefix.push_str(MAX_TOKENS_EXHAUSTED_VISIBLE_NOTE);
                        observations.warning(
                            "provider_continuation_exhausted",
                            "max_tokens",
                            "progress-guard synthesis exhausted bounded continuation retries",
                        );
                    }
                    if let Some(message_id) =
                        reply.ui_message_id.as_ref().filter(|id| !id.is_empty())
                    {
                        let _ = remove_assistant_message(session_id, message_id);
                    } else {
                        clear_failed_assistant_draft(session_id, turn_id);
                    }
                    reply.ui_message_id = None;
                    return Ok((reply, std::mem::take(&mut truncated_prefix)));
                }
                let text = reply.content.clone().unwrap_or_default();
                return Ok((reply, text));
            }
            RecoveryAction::ContinueVisibleText => {
                unreachable!("handled before semantic recovery")
            }
            RecoveryAction::RetryIncompleteToolCall | RecoveryAction::RetryMissingToolCall => {
                unreachable!("handled before semantic recovery")
            }
        };
        if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
            let _ = remove_assistant_message(session_id, message_id);
        } else {
            clear_failed_assistant_draft(session_id, turn_id);
        }
        let input_start = messages.len();
        advance_stateful_responses(
            messages,
            reply.response_meta.response_id.as_deref(),
            input_start,
        );
        append_attempt_local_context_update(
            messages,
            attempt_local_overlay_start,
            recovery_kind,
            retry_prompt,
        );
        emit_provider_retry(
            session_id,
            turn_id,
            retry_reason,
            retry_count,
            retry_message,
        );
    }
}

pub(crate) fn progress_guard_clarification_tools(request: &ModelRequest) -> Vec<Value> {
    if !request.capabilities.supports_tool_calling {
        return Vec::new();
    }
    request
        .tools
        .iter()
        .filter(|tool| {
            tool.pointer("/function/name").and_then(Value::as_str)
                == Some(LYRA_CLARIFICATION_ASK_TOOL)
        })
        .cloned()
        .collect()
}

pub(crate) fn prepare_tool_image_delivery(
    output: &mut Value,
    capabilities: &ModelCapabilityProfile,
) -> Option<Value> {
    output.pointer("/raw/providerImage")?;
    if let Some(content) = provider_image_message_from_tool_output(output, capabilities) {
        return Some(content);
    }
    let (code, message) = if capabilities.supports_image_input {
        (
            "image_attachment_failed",
            "The image could not be attached to model context. No image was delivered; do not claim to have viewed it. Read the source image again.",
        )
    } else {
        (
            "image_input_unsupported",
            "The active model does not support image input. No image was delivered. Ask for a vision-capable model to inspect this image; opening a desktop viewer does not add vision support.",
        )
    };
    output["error"] = json!({"code":code,"message":message});
    output["content"] = json!(message);
    output["status"] = json!("failed");
    output["ok"] = json!(false);
    None
}

pub(crate) fn provider_image_message_from_tool_output(
    output: &Value,
    capabilities: &ModelCapabilityProfile,
) -> Option<Value> {
    if !capabilities.supports_image_input {
        return None;
    }
    let image = output.pointer("/raw/providerImage")?;
    let path = image.get("path").and_then(Value::as_str)?;
    let artifact = resolve_lyra_artifact_path(path).ok().flatten()?;
    let metadata = fs::metadata(&artifact.absolute).ok()?;
    if metadata.len() == 0 || metadata.len() > MAX_PROVIDER_IMAGE_TOOL_BYTES {
        return None;
    }
    let bytes = fs::read(&artifact.absolute).ok()?;
    let data_url = format!(
        "data:{};base64,{}",
        artifact.media_type,
        BASE64_STANDARD.encode(bytes)
    );
    Some(json!([
        {
            "type": "text",
            "text": format!(
                "Lyra attached artifact image {} ({}, {} bytes) as model vision evidence for the previous tool result.",
                artifact.artifact_id,
                artifact.media_type,
                metadata.len()
            )
        },
        {
            "type": "image_url",
            "image_url": { "url": data_url }
        }
    ]))
}

pub(crate) fn emit_tool_progress_guard_event(
    session_id: &str,
    turn_id: &str,
    event_type: &str,
    reason: &str,
    observed_occurrences: usize,
) {
    emit_provider_protocol_event(
        session_id,
        turn_id,
        json!({
            "type": event_type,
            "reason": reason,
            "observedOccurrences": observed_occurrences,
        }),
    );
}

pub(crate) fn emit_provider_retry(
    session_id: &str,
    turn_id: &str,
    reason: &str,
    attempt: u8,
    message: &str,
) {
    super::session_runtime::set_last_provider_attempt_recovery(session_id, turn_id, reason);
    emit_turn_state(session_id, turn_id, "retrying_provider", reason);
    emit_provider_protocol_event(
        session_id,
        turn_id,
        json!({
            "type": "retry",
            "reason": reason,
            "attempt": attempt,
            "message": message,
        }),
    );
    emit_context_trimmed(
        session_id,
        json!({
            "reason": reason,
            "attempt": attempt,
            "message": message,
            "retry": true,
        }),
    );
}

/// Classify a `reqwest::Error` into a transport category using reqwest's typed
/// predicates — never its message text — so the category stays correct across
/// reqwest versions and wording changes.
pub(crate) fn classify_reqwest_transport(error: &reqwest::Error) -> ProviderTransportKind {
    if error.is_connect() {
        ProviderTransportKind::Connect
    } else if error.is_timeout() {
        ProviderTransportKind::Timeout
    } else if error.is_decode() || error.is_body() {
        ProviderTransportKind::StreamInterrupted
    } else {
        ProviderTransportKind::Other
    }
}

/// Build a typed transport error from a failed request. A `reqwest` send/read
/// failure is always a transport failure (HTTP error *responses* never fail
/// these calls — they are inspected via the status code instead).
pub(crate) fn reqwest_transport_error(error: reqwest::Error) -> AgentRuntimeError {
    use std::error::Error;
    let kind = classify_reqwest_transport(&error);
    let error = error.without_url();
    let mut causes = vec![error.to_string()];
    let mut source = error.source();
    while let Some(cause) = source {
        let text = cause.to_string();
        if causes.last() != Some(&text) {
            causes.push(text);
        }
        if causes.len() >= 8 {
            break;
        }
        source = cause.source();
    }
    // Proxies and nested errors can also contain credential-bearing URLs.
    let urls = regex::Regex::new(r#"https?://[^\s\"<>]+"#).expect("static URL pattern");
    let detail = urls
        .replace_all(&causes.join(": "), "[endpoint]")
        .into_owned();
    AgentRuntimeError::ProviderTransport { kind, detail }
}

/// Classify a failure that occurs while reading lines from the streamed SSE
/// response body. Such a read fails mid-stream when the provider drops the
/// connection or the body transfer/decoding is interrupted; reqwest surfaces it
/// as an I/O error wrapping a `reqwest::Error`. Recover the typed reqwest
/// category when present; otherwise a body read failure is by construction a
/// stream interruption.
pub(crate) fn streaming_body_read_error(error: std::io::Error) -> AgentRuntimeError {
    let kind = error
        .get_ref()
        .and_then(|inner| inner.downcast_ref::<reqwest::Error>())
        .map(classify_reqwest_transport)
        .unwrap_or(ProviderTransportKind::StreamInterrupted);
    AgentRuntimeError::ProviderTransport {
        kind,
        detail: format!("provider streaming response body read failed: {error}"),
    }
}

/// A provider transport failure is identified by the typed error variant, not by
/// matching on the error's message text.
pub(crate) fn is_provider_transport_error(error: &AgentRuntimeError) -> bool {
    matches!(error, AgentRuntimeError::ProviderTransport { .. })
}

#[cfg(test)]
pub(crate) fn is_provider_configuration_error(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                category: ProviderFailureCategory::Configuration
                    | ProviderFailureCategory::Authentication
                    | ProviderFailureCategory::Authorization,
                ..
            }
        }
    )
}

#[cfg(test)]
mod image_delivery_tests {
    use super::*;

    #[test]
    fn unsupported_or_missing_image_is_an_explicit_tool_failure() {
        let mut capabilities = ModelCapabilityProfile {
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_tool_choice: false,
            context_window: Some(128_000),
        };
        let original = json!({"content":"Read image successfully", "raw":{"providerImage":{
            "path":"/tmp/not-a-lyra-artifact.png", "mediaType":"image/png"
        }}});
        let mut output = original.clone();
        assert!(prepare_tool_image_delivery(&mut output, &capabilities).is_none());
        assert_eq!(output["error"]["code"], "image_input_unsupported");
        assert_eq!(output["status"], "failed");
        assert!(
            output["content"]
                .as_str()
                .unwrap()
                .contains("No image was delivered")
        );
        capabilities.supports_image_input = true;
        let mut output = original;
        assert!(prepare_tool_image_delivery(&mut output, &capabilities).is_none());
        assert_eq!(output["error"]["code"], "image_attachment_failed");
    }
}
