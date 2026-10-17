use super::*;

mod browser_order;
mod context_budget;
mod progress_guard;
mod progress_guard_synthesis;
mod recovery;
mod tool_catalog_revision;
mod tool_result_group;
mod visual_history;
pub(crate) use progress_guard::*;
pub(crate) use progress_guard_synthesis::*;
pub(crate) use recovery::provider_protocol_step;
use recovery::*;
use tool_catalog_revision::*;
use tool_result_group::seal_tool_result_groups;

#[cfg(test)]
pub(crate) fn run_model_loop(
    session_id: &str,
    turn_id: &str,
    request: ModelRequest,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelLoopResult> {
    super::turn_engine::block_on(run_model_loop_with_ui_commit_async(
        session_id,
        turn_id,
        request,
        cancellation,
        true,
    ))
}

pub(crate) async fn run_model_loop_async(
    session_id: &str,
    turn_id: &str,
    request: ModelRequest,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelLoopResult> {
    run_model_loop_with_ui_commit_async(session_id, turn_id, request, cancellation, true).await
}

pub(crate) async fn run_model_loop_without_ui_commit_async(
    session_id: &str,
    turn_id: &str,
    request: ModelRequest,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelLoopResult> {
    run_model_loop_with_ui_commit_async(session_id, turn_id, request, cancellation, false).await
}

pub(crate) async fn run_model_loop_with_ui_commit_async(
    session_id: &str,
    turn_id: &str,
    mut request: ModelRequest,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelLoopResult> {
    let mut messages = request.messages.clone();
    visual_history::compact(&mut messages);
    let original_tool_choice = request.tool_choice.clone();
    if request.context_trimmed
        || !request.evidence_refs.is_empty()
        || !request.input_downgrades.is_empty()
    {
        emit_context_trimmed(
            session_id,
            json!({
                "reason": "provider_context_prepared",
                "estimatedTokens": request.token_estimate,
                "trimmed": request.context_trimmed,
                "inputDowngrades": request.input_downgrades,
                "evidenceRefs": request.evidence_refs,
            }),
        );
    }
    let mut retried_after_context_error = false;
    let mut retried_after_image_input_error = false;
    let mut retried_after_media_input_error = false;
    let mut retried_after_tool_calling_error = false;
    // One shared budget for every "model behavior needs correcting" retry
    // (reasoning-only, terminal-empty, truncated tool call, protocol leak,
    // missing tool call). Request-layer transient retries and capability
    // downgrades keep their own budgets; corrections do not multiply.
    let mut model_correction_retries = 0_u8;
    let mut transient_provider_retries = 0_u8;
    let mut continuation_retries = 0_u8;
    let mut truncated_prefix: Option<String> = None;
    let mut progress_guard = ModelLoopProgressGuard::default();
    let mut provider_transcript = Vec::new();
    let mut provider_protocol_transcript_cursor = 0_usize;
    let mut provider_replay_items = Vec::new();
    let mut observations = ModelLoopObservations::default();
    let mut retried_without_prompt_cache = false;
    let mut retried_without_previous_response = false;
    let mut tool_choice_recovery_active = false;
    let mut attempt_local_overlay_start = None;
    let mut tool_catalog_revision = current_tool_catalog_revision(session_id);
    let steer_projection_options = crate::context_builder::ProviderContextOptions {
        provider_id: Some(request.provider.id.clone()),
        route_id: Some(request.provider.route_id.clone()),
        model: Some(request.model.clone()),
        ..Default::default()
    };
    loop {
        if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
            return Err(AgentRuntimeError::Cancelled);
        }
        // Boundary 1: inject steers queued while the previous round was in
        // flight. Appended after the stateful cursor they are new input, so
        // the provider sees [... tool results, steer] and the turn continues
        // without losing its middle state or re-paying the cache prefix.
        let pending_steers =
            crate::native_backend::session_runtime::take_pending_steers(session_id);
        if !pending_steers.is_empty() {
            let transcript =
                crate::native_backend::session_runtime::session_transcript_snapshot(session_id);
            for steer in &pending_steers {
                for wire_message in crate::context_builder::project_steer_user_message(
                    steer,
                    &transcript,
                    &steer_projection_options,
                ) {
                    messages.push(wire_message);
                }
            }
        }
        emit_turn_state(
            session_id,
            turn_id,
            if request.capabilities.supports_streaming {
                "streaming_model"
            } else {
                "calling_model"
            },
            "provider_request_started",
        );
        if attempt_local_overlay_start.is_none()
            && context_budget::compact(session_id, turn_id, &request, &mut messages)
        {
            reset_stateful_responses(&mut messages);
        }
        seal_tool_result_groups(&mut messages);
        let early_tools = streaming_tools::StreamingTools::new(
            session_id,
            turn_id,
            &request,
            cancellation,
            &progress_guard.tool_loop_detector,
        );
        let attempt_result = early_tools
            .scope(call_model_once_for_loop_async(
                session_id,
                turn_id,
                &request.provider,
                &request.model,
                &messages,
                &request.tools,
                &request.tool_choice,
                &request.capabilities,
                cancellation,
                commit_assistant_text,
            ))
            .await;
        clear_attempt_local_overlay(&mut messages, &mut attempt_local_overlay_start);
        let reply = match attempt_result {
            Ok(reply) => {
                early_tools.validate_reply(&reply)?;
                transient_provider_retries = 0;
                super::session_runtime::record_progress(turn_id);
                observations.observe(&reply);
                checkpoint_model_loop_observations(session_id, turn_id, &observations, &messages);
                reply
            }
            Err(error)
                if !retried_without_prompt_cache
                    && rejected_provider_parameter(
                        &error,
                        &[
                            "prompt_cache_key",
                            "prompt_cache_options",
                            "prompt_cache_breakpoint",
                            "cache_control",
                            "cachepoint",
                        ],
                    )
                    .is_some() =>
            {
                retried_without_prompt_cache = true;
                let parameter = rejected_provider_parameter(
                    &error,
                    &[
                        "prompt_cache_key",
                        "prompt_cache_options",
                        "prompt_cache_breakpoint",
                        "cache_control",
                        "cachepoint",
                    ],
                )
                .unwrap_or("prompt_cache");
                mark_prompt_cache_rejected(&request.provider, &request.model);
                disable_prompt_cache(&mut messages);
                observations.warning(
                    "prompt_cache_parameter_rejected",
                    parameter,
                    &error.to_string(),
                );
                checkpoint_model_loop_observations(session_id, turn_id, &observations, &messages);
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_prompt_cache_disabled_retry",
                    1,
                    &error.to_string(),
                );
                continue;
            }
            Err(error)
                if !retried_without_previous_response
                    && rejected_provider_parameter(&error, &["previous_response_id"]).is_some() =>
            {
                retried_without_previous_response = true;
                disable_stateful_responses(&mut messages);
                observations.warning(
                    "stateful_response_cursor_rejected",
                    "previous_response_id",
                    &error.to_string(),
                );
                checkpoint_model_loop_observations(session_id, turn_id, &observations, &messages);
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_stateful_cursor_full_replay_retry",
                    1,
                    &error.to_string(),
                );
                continue;
            }
            Err(error)
                if !retried_after_tool_calling_error
                    && providers::model_capabilities::is_tool_calling_unsupported_error(&error) =>
            {
                retried_after_tool_calling_error = true;
                let evidence = error.to_string();
                providers::model_capabilities::remember_runtime_rejection(
                    &request.provider.id,
                    &request.model,
                    providers::model_capabilities::FEATURE_TOOL_CALLING,
                    &evidence,
                );
                request.capabilities.supports_tool_calling = false;
                request.capabilities.supports_tool_choice = false;
                request.tools.clear();
                request.tool_choice = ModelToolChoice::None;
                reset_stateful_responses(&mut messages);
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "tool-calling-downgrade",
                    "The active model/provider rejected tool calling. Retry this request as a text-only model. Do not claim that external actions or tools were executed.".to_string(),
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_tool_calling_downgrade_retry",
                    1,
                    &evidence,
                );
                continue;
            }
            Err(error)
                if !retried_after_image_input_error
                    && providers::model_capabilities::is_image_input_unsupported_error(&error) =>
            {
                retried_after_image_input_error = true;
                let evidence = error.to_string();
                providers::model_capabilities::remember_runtime_rejection(
                    &request.provider.id,
                    &request.model,
                    providers::model_capabilities::INPUT_IMAGE,
                    &evidence,
                );
                request.capabilities.supports_image_input = false;
                let (stripped, downgrades) =
                    providers::model_capabilities::strip_images_from_provider_messages(messages);
                messages = stripped;
                reset_stateful_responses(&mut messages);
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "image-input-downgrade",
                    format!(
                        "Structured input downgrade report: {}\nThe active model/provider rejected image input. Lyra marked it as non-vision and will retry without images. Prefer semantic browser mapping/action for this endpoint.",
                        serde_json::to_string(&downgrades).unwrap_or_else(|_| "[]".to_string())
                    ),
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_image_input_downgrade_retry",
                    1,
                    &evidence,
                );
                continue;
            }
            Err(error)
                if !retried_after_media_input_error
                    && providers::model_capabilities::unsupported_media_input_capability(
                        &error,
                    )
                    .is_some() =>
            {
                retried_after_media_input_error = true;
                let evidence = error.to_string();
                let capability =
                    providers::model_capabilities::unsupported_media_input_capability(&error)
                        .expect("guarded media capability");
                providers::model_capabilities::remember_runtime_rejection(
                    &request.provider.id,
                    &request.model,
                    capability,
                    &evidence,
                );
                let (stripped, downgrades) =
                    providers::model_capabilities::strip_media_from_provider_messages(
                        messages, capability,
                    );
                messages = stripped;
                reset_stateful_responses(&mut messages);
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "media-input-downgrade",
                    format!(
                        "Structured input downgrade report: {}\nThe active model/provider rejected {capability}. Retry once without that direct media input. Use an explicitly exposed extraction or transcription tool when appropriate; otherwise explain the limitation.",
                        serde_json::to_string(&downgrades).unwrap_or_else(|_| "[]".to_string())
                    ),
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_media_input_downgrade_retry",
                    1,
                    &evidence,
                );
                continue;
            }
            Err(error)
                if !retried_after_context_error
                    && matches!(
                        error,
                        AgentRuntimeError::ProviderFailure {
                            failure: ProviderFailure {
                                category: ProviderFailureCategory::ContextLimit,
                                ..
                            }
                        }
                    ) =>
            {
                retried_after_context_error = true;
                messages =
                    compact_messages_for_retry(messages, request.capabilities.context_window);
                reset_stateful_responses(&mut messages);
                emit_context_trimmed(
                    session_id,
                    json!({
                        "reason": "provider_context_length_error_retry",
                        "retry": true,
                    }),
                );
                continue;
            }
            Err(error)
                if model_correction_retries < max_model_correction_retry()
                    && matches!(
                        error,
                        AgentRuntimeError::ProviderProtocol {
                            kind: ProviderProtocolFailureKind::ReasoningOnlyResponse,
                            ..
                        }
                    ) =>
            {
                model_correction_retries += 1;
                clear_failed_assistant_draft(session_id, turn_id);
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "reasoning-only-recovery",
                    "Finish the current response now. Return normal assistant text, or emit a complete structured tool call if a tool is required. Do not return reasoning alone.",
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_reasoning_only_retry",
                    model_correction_retries,
                    &error.to_string(),
                );
                continue;
            }
            Err(error)
                if model_correction_retries < max_model_correction_retry()
                    && matches!(
                        error,
                        AgentRuntimeError::ProviderProtocol {
                            kind: ProviderProtocolFailureKind::EmptyAssistantResponse,
                            ..
                        }
                    ) =>
            {
                model_correction_retries += 1;
                clear_failed_assistant_draft(session_id, turn_id);
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "terminal-empty-recovery",
                    "The previous response ended without assistant text or a tool call. Complete the same request now with normal assistant text or one complete structured tool call.",
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_terminal_empty_retry",
                    model_correction_retries,
                    &error.to_string(),
                );
                continue;
            }
            Err(error)
                if model_correction_retries < max_model_correction_retry()
                    && (is_textual_protocol_leak_error(&error)
                        || is_tool_payload_leak_error(&error)) =>
            {
                model_correction_retries += 1;
                clear_failed_assistant_draft(session_id, turn_id);
                let textual = is_textual_protocol_leak_error(&error);
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    if textual {
                        "protocol-correction"
                    } else {
                        "tool-protocol-correction"
                    },
                    if textual {
                        protocol_leak_corrective_prompt()
                    } else {
                        tool_protocol::TOOL_OUTPUT_ECHO_CORRECTIVE_PROMPT
                    },
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    if textual {
                        "provider_textual_protocol_leak_retry"
                    } else {
                        "provider_tool_payload_leak_retry"
                    },
                    model_correction_retries,
                    &error.to_string(),
                );
                continue;
            }
            Err(error)
                if model_correction_retries < max_model_correction_retry()
                    && is_missing_tool_call_reply_error(&error) =>
            {
                model_correction_retries += 1;
                clear_failed_assistant_draft(session_id, turn_id);
                if !request.tools.is_empty() {
                    request.tool_choice = if request.capabilities.supports_tool_choice {
                        ModelToolChoice::Required
                    } else {
                        ModelToolChoice::Auto
                    };
                    tool_choice_recovery_active = true;
                }
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "missing-tool-correction",
                    no_tools_used_corrective_prompt(!request.tools.is_empty()),
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_missing_tool_call_retry",
                    model_correction_retries,
                    &error.to_string(),
                );
                continue;
            }
            Err(error)
                if providers::routes::mimo::is_mimo_route(&request.provider.route_id)
                    && providers::mimo_faults::parse_mimo_fault_from_error(&error).is_some_and(
                        |fault| providers::mimo_faults::is_mimo_notify_and_fail_fault(&fault),
                    ) =>
            {
                let fault =
                    providers::mimo_faults::parse_mimo_fault_from_error(&error).expect("fault");
                emit_provider_fault(
                    session_id,
                    turn_id,
                    &request.provider.id,
                    &request.model,
                    &fault,
                );
                return Err(error);
            }
            Err(error)
                if transient_provider_retries < MAX_TRANSIENT_PROVIDER_RETRIES
                    && (is_retryable_provider_error(&error)
                        || (providers::routes::mimo::is_mimo_route(
                            &request.provider.route_id,
                        ) && providers::mimo_faults::parse_mimo_fault_from_error(&error)
                            .is_some_and(|fault| {
                                providers::mimo_faults::is_mimo_backoff_fault(&fault)
                            }))) =>
            {
                // 429/5xx (and route-specific backoff faults): replay this same
                // request after backoff. Do not append a "please continue" user
                // turn; transcript stays as it was. Once the budget is exhausted
                // the error surfaces and the turn fails.
                transient_provider_retries += 1;
                emit_provider_retry(
                    session_id,
                    turn_id,
                    if providers::routes::mimo::is_mimo_route(&request.provider.route_id)
                        && providers::mimo_faults::parse_mimo_fault_from_error(&error).is_some_and(
                            |fault| providers::mimo_faults::is_mimo_backoff_fault(&fault),
                        )
                    {
                        "mimo_provider_backoff_retry"
                    } else {
                        "provider_transient_error_retry"
                    },
                    transient_provider_retries,
                    &error.to_string(),
                );
                wait_for_provider_retry(
                    provider_retry_delay(transient_provider_retries, Some(&error)),
                    cancellation,
                )
                .await?;
                continue;
            }
            Err(error)
                if providers::routes::mimo::is_mimo_route(&request.provider.route_id)
                    && providers::mimo_faults::parse_mimo_fault_from_error(&error).is_some_and(
                        |fault| providers::mimo_faults::should_notify_for_mimo_fault(&fault, true),
                    ) =>
            {
                // Transient budget exhausted: surface the route fault before the
                // turn fails so the UI shows the provider-side reason.
                let fault =
                    providers::mimo_faults::parse_mimo_fault_from_error(&error).expect("fault");
                emit_provider_fault(
                    session_id,
                    turn_id,
                    &request.provider.id,
                    &request.model,
                    &fault,
                );
                return Err(error);
            }
            Err(AgentRuntimeError::ProviderProtocol { kind, detail }) => {
                clear_failed_assistant_draft(session_id, turn_id);
                return Err(AgentRuntimeError::ProviderProtocol {
                    kind,
                    detail: format!(
                        "provider `{}` model `{}` exhausted recovery for `{kind}`: {detail}",
                        request.provider.id, request.model,
                    ),
                });
            }
            Err(AgentRuntimeError::ProviderTransport { kind, detail }) => {
                clear_failed_assistant_draft(session_id, turn_id);
                return Err(AgentRuntimeError::ProviderTransport {
                    kind,
                    detail: format!(
                        "provider `{}` model `{}` exhausted transport recovery: {detail}",
                        request.provider.id, request.model,
                    ),
                });
            }
            Err(error) => {
                clear_failed_assistant_draft(session_id, turn_id);
                return Err(error);
            }
        };
        let reply_response_id = reply.response_meta.response_id.clone();
        let attempt_outcome = classify_attempt_outcome(&reply);
        let recovery_action = recovery_action_for_attempt(
            attempt_outcome,
            model_correction_retries,
            continuation_retries,
        );
        if matches!(
            attempt_outcome,
            AttemptOutcome::Refusal | AttemptOutcome::ContentFilter
        ) {
            if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                let _ = remove_assistant_message(session_id, message_id);
            } else {
                clear_failed_assistant_draft(session_id, turn_id);
            }
            return Err(AgentRuntimeError::ProviderProtocol {
                kind: ProviderProtocolFailureKind::ContentBlocked,
                detail: format!(
                    "provider `{}` model `{}` stopped the response with `{}`",
                    request.provider.id,
                    request.model,
                    reply
                        .raw_stop_reason
                        .as_deref()
                        .unwrap_or(reply.stop_signal.label()),
                ),
            });
        }
        if attempt_outcome == AttemptOutcome::MaxTokensWithToolCalls {
            if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                let _ = remove_assistant_message(session_id, message_id);
            } else {
                clear_failed_assistant_draft(session_id, turn_id);
            }
            if matches!(
                recovery_action,
                RecoveryAction::Fail(ProviderProtocolFailureKind::IncompleteToolCall)
            ) {
                return Err(AgentRuntimeError::ProviderProtocol {
                    kind: ProviderProtocolFailureKind::IncompleteToolCall,
                    detail: format!(
                        "provider `{}` model `{}` repeatedly returned tool calls truncated by `{}`; no tool was executed",
                        request.provider.id,
                        request.model,
                        reply.raw_stop_reason.as_deref().unwrap_or("max_tokens"),
                    ),
                });
            }
            model_correction_retries += 1;
            append_truncated_tool_call_recovery(
                &mut messages,
                &mut attempt_local_overlay_start,
                &reply,
            );
            emit_provider_retry(
                session_id,
                turn_id,
                "provider_truncated_tool_call_retry",
                model_correction_retries,
                "tool calls were returned with max_tokens; no tool executed",
            );
            continue;
        }
        if reply.tool_calls.is_empty() {
            // A missing tool call is retryable only when the provider's native
            // stop signal says it intended tool use. Visible prose is never
            // classified to infer intent.
            let wants_tool_retry = !request.tools.is_empty()
                && recovery_action == RecoveryAction::RetryMissingToolCall;
            if wants_tool_retry {
                model_correction_retries += 1;
                if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                    let _ = remove_assistant_message(session_id, message_id);
                } else {
                    clear_failed_assistant_draft(session_id, turn_id);
                }
                let input_start = messages.len();
                advance_stateful_responses(
                    &mut messages,
                    reply_response_id.as_deref(),
                    input_start,
                );
                request.tool_choice = if request.capabilities.supports_tool_choice {
                    ModelToolChoice::Required
                } else {
                    ModelToolChoice::Auto
                };
                tool_choice_recovery_active = true;
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "missing-tool-correction",
                    no_tools_used_corrective_prompt(!request.tools.is_empty()),
                );
                emit_provider_retry(
                    session_id,
                    turn_id,
                    "provider_missing_tool_call_retry",
                    model_correction_retries,
                    "assistant promised tool use without structured tool_call",
                );
                continue;
            }
            if attempt_outcome == AttemptOutcome::ToolUseWithoutCall {
                return Err(AgentRuntimeError::ProviderProtocol {
                    kind: ProviderProtocolFailureKind::IncompleteToolCall,
                    detail: format!(
                        "provider `{}` model `{}` stopped for tool use without one complete structured tool call",
                        request.provider.id, request.model,
                    ),
                });
            }
            if reply
                .content
                .as_ref()
                .is_none_or(|text| text.trim().is_empty())
            {
                if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                    let _ = remove_assistant_message(session_id, message_id);
                } else {
                    clear_failed_assistant_draft(session_id, turn_id);
                }
                if matches!(
                    recovery_action,
                    RecoveryAction::Fail(ProviderProtocolFailureKind::ContentBlocked)
                ) {
                    return Err(AgentRuntimeError::ProviderProtocol {
                        kind: ProviderProtocolFailureKind::ContentBlocked,
                        detail: format!(
                            "provider `{}` model `{}` stopped the response with `{}`",
                            request.provider.id,
                            request.model,
                            reply
                                .raw_stop_reason
                                .as_deref()
                                .unwrap_or(reply.stop_signal.label()),
                        ),
                    });
                }
                if recovery_action == RecoveryAction::RetryReasoningOnly {
                    model_correction_retries += 1;
                    let input_start = messages.len();
                    advance_stateful_responses(
                        &mut messages,
                        reply_response_id.as_deref(),
                        input_start,
                    );
                    append_attempt_local_context_update(
                        &mut messages,
                        &mut attempt_local_overlay_start,
                        "reasoning-only-recovery",
                        "Finish the current response now. Return normal assistant text, or emit a complete structured tool call if a tool is required. Do not return reasoning alone.",
                    );
                    emit_provider_retry(
                        session_id,
                        turn_id,
                        "provider_reasoning_only_retry",
                        model_correction_retries,
                        "provider returned reasoning without final assistant text or tool call",
                    );
                    continue;
                }
                if recovery_action == RecoveryAction::RetryTerminalEmpty {
                    model_correction_retries += 1;
                    let input_start = messages.len();
                    advance_stateful_responses(
                        &mut messages,
                        reply_response_id.as_deref(),
                        input_start,
                    );
                    append_attempt_local_context_update(
                        &mut messages,
                        &mut attempt_local_overlay_start,
                        "terminal-empty-recovery",
                        "The previous response ended without assistant text or a tool call. Complete the same request now with normal assistant text or one complete structured tool call.",
                    );
                    emit_provider_retry(
                        session_id,
                        turn_id,
                        "provider_terminal_empty_retry",
                        model_correction_retries,
                        "assistant reply contained no visible text or tool call",
                    );
                    continue;
                }
                let reasoning_only = attempt_outcome == AttemptOutcome::ReasoningOnly;
                return Err(AgentRuntimeError::ProviderProtocol {
                    kind: match recovery_action {
                        RecoveryAction::Fail(kind) => kind,
                        _ if reasoning_only => ProviderProtocolFailureKind::ReasoningOnlyResponse,
                        _ => ProviderProtocolFailureKind::EmptyAssistantResponse,
                    },
                    detail: format!(
                        "provider `{}` model `{}` returned {} twice (stop reason: `{}`)",
                        request.provider.id,
                        request.model,
                        if reasoning_only {
                            "reasoning without final assistant text or tool call"
                        } else {
                            "no assistant text or tool call"
                        },
                        reply.raw_stop_reason.as_deref().unwrap_or("unknown"),
                    ),
                });
            }
            if let Err(failure) =
                super::tools::validate_final_response_for_session(session_id, turn_id)
            {
                if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                    let _ = remove_assistant_message(session_id, message_id);
                } else {
                    clear_failed_assistant_draft(session_id, turn_id);
                }
                if super::tools::is_completion_gate_failure(&failure.code) {
                    let blocked = super::tools::record_completion_blocked_for_session(
                        session_id, turn_id, &failure,
                    );
                    let result = ModelLoopResult::final_text(format!(
                        "Completion is blocked: {} {}",
                        failure.message, failure.recommended_next_action
                    ))
                    .with_metadata(json!({ "completionBlocked": blocked }));
                    return Ok(with_model_loop_observations(
                        result,
                        &observations,
                        &messages,
                        false,
                    ));
                }
                return Err(AgentRuntimeError::Core(format!(
                    "{}: {}",
                    failure.code, failure.message
                )));
            }
            let this_segment = reply.content.clone().unwrap_or_default();
            let response_replay_items = if reply.provider_replay_protocol.as_deref()
                == Some(openai_responses::PROTOCOL_ID)
            {
                retained_provider_replay_items(&reply.provider_replay_items, &[])
            } else {
                Vec::new()
            };
            if !response_replay_items.is_empty() {
                provider_replay_items.extend(response_replay_items.clone());
            }
            if recovery_action == RecoveryAction::ContinueVisibleText
                && !this_segment.trim().is_empty()
            {
                model_correction_retries = 0;
                continuation_retries += 1;
                let mut accumulated = truncated_prefix.take().unwrap_or_default();
                accumulated.push_str(&this_segment);
                truncated_prefix = Some(accumulated);
                let has_response_replay = !response_replay_items.is_empty();
                if has_response_replay {
                    messages.extend(response_replay_items);
                }
                let mut segment_assistant = json!({
                    "role": "assistant",
                    "content": this_segment,
                });
                if has_response_replay {
                    segment_assistant["openaiResponsesShadow"] = Value::Bool(true);
                }
                attach_assistant_replay(&mut segment_assistant, &reply);
                messages.push(segment_assistant.clone());
                provider_transcript.push(segment_assistant);
                let auxiliary_messages = take_provider_protocol_auxiliary_messages(
                    &provider_transcript,
                    &mut provider_protocol_transcript_cursor,
                );
                // Continuation segments have no surviving UI message; the step
                // stays unanchored until finish_turn commits the final text.
                crate::native_backend::turns::upsert_provider_protocol_log_entry(
                    session_id,
                    turn_id,
                    None,
                    provider_protocol_step(
                        &request,
                        turn_id,
                        &reply,
                        &[],
                        "complete",
                        Vec::new(),
                        auxiliary_messages,
                    ),
                )?;
                let input_start = messages.len();
                advance_stateful_responses(
                    &mut messages,
                    reply_response_id.as_deref(),
                    input_start,
                );
                if let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty()) {
                    let _ = remove_assistant_message(session_id, message_id);
                } else {
                    clear_failed_assistant_draft(session_id, turn_id);
                }
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
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
            let had_truncated_prefix = truncated_prefix.is_some();
            let mut final_text = match truncated_prefix.take() {
                Some(mut prefix) => {
                    prefix.push_str(&this_segment);
                    prefix
                }
                None => this_segment.clone(),
            };
            let continuation_exhausted =
                reply.stop_signal == TurnStopSignal::MaxTokens && had_truncated_prefix;
            if continuation_exhausted {
                if !final_text.ends_with('\n') {
                    final_text.push_str("\n\n");
                }
                final_text.push_str(MAX_TOKENS_EXHAUSTED_VISIBLE_NOTE);
            }
            if had_truncated_prefix
                && let Some(message_id) = reply.ui_message_id.as_ref().filter(|id| !id.is_empty())
            {
                let _ = remove_assistant_message(session_id, message_id);
            }
            let mut final_assistant = json!({
                "role": "assistant",
                "content": this_segment,
            });
            attach_assistant_replay(&mut final_assistant, &reply);
            provider_transcript.push(final_assistant);
            let auxiliary_messages = take_provider_protocol_auxiliary_messages(
                &provider_transcript,
                &mut provider_protocol_transcript_cursor,
            );
            let mut final_protocol_step = provider_protocol_step(
                &request,
                turn_id,
                &reply,
                &[],
                "complete",
                Vec::new(),
                auxiliary_messages,
            );
            if !had_truncated_prefix {
                final_protocol_step["assistant"]["content"] = Value::String(final_text.clone());
            }
            // A truncated prefix means the streamed draft was removed and
            // finish_turn commits a fresh message — leave the step unanchored
            // so it is backfilled to that message id.
            crate::native_backend::turns::upsert_provider_protocol_log_entry(
                session_id,
                turn_id,
                reply
                    .ui_message_id
                    .as_deref()
                    .filter(|id| !id.trim().is_empty())
                    .filter(|_| !had_truncated_prefix),
                final_protocol_step,
            )?;
            let mut result = ModelLoopResult::final_text(final_text)
                .with_ui_text_committed(reply.ui_message_id.is_some() && !had_truncated_prefix)
                .with_final_message_id(
                    (!had_truncated_prefix)
                        .then(|| reply.ui_message_id.clone())
                        .flatten(),
                );
            if continuation_exhausted {
                result = result.with_merged_metadata(json!({
                    "providerContinuation": {
                        "truncated": true,
                        "continuationExhausted": true,
                        "continuationRetries": continuation_retries,
                        "maxContinuationRetries": MAX_CONTINUATION_RETRIES,
                    }
                }));
            }
            // Boundary 2: "anything else?" — a steer that arrived while the
            // final response was streaming would otherwise strand in the
            // inbox until finish_turn. The finalize path records the final
            // reply only in the provider transcript, so continuing requires
            // handing it to the wire too: the model must see its own prior
            // reply before the steered follow-up. Same shape as the
            // max-tokens continuation above.
            let pending_steers =
                crate::native_backend::session_runtime::take_pending_steers(session_id);
            if !pending_steers.is_empty() {
                if let Some(final_assistant) = provider_transcript.last().cloned() {
                    messages.push(final_assistant);
                }
                let input_start = messages.len();
                advance_stateful_responses(
                    &mut messages,
                    reply_response_id.as_deref(),
                    input_start,
                );
                let transcript =
                    crate::native_backend::session_runtime::session_transcript_snapshot(session_id);
                for steer in &pending_steers {
                    for wire_message in crate::context_builder::project_steer_user_message(
                        steer,
                        &transcript,
                        &steer_projection_options,
                    ) {
                        messages.push(wire_message);
                    }
                }
                continue;
            }
            return Ok(with_model_loop_observations(
                result,
                &observations,
                &messages,
                true,
            ));
        }

        let tool_calls = reply.tool_calls.clone();
        let stop_after_plan_finalize = tool_calls.iter().position(|call| {
            call.name == PLAN_FINALIZE_MODEL_TOOL
                || (call.name == UPDATE_PLAN_MODEL_TOOL
                    && call.arguments.get("action").and_then(Value::as_str) == Some("finalize"))
        });
        let response_replay_items =
            if reply.provider_replay_protocol.as_deref() == Some(openai_responses::PROTOCOL_ID) {
                retained_provider_replay_items(&reply.provider_replay_items, &tool_calls)
            } else {
                Vec::new()
            };
        if !response_replay_items.is_empty() {
            provider_replay_items.extend(response_replay_items.clone());
            messages.extend(response_replay_items.clone());
        }
        let assistant_content = reply.content.clone().unwrap_or_default();
        let assistant_tool_calls = tool_calls
            .iter()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": "function",
                    "function": {
                        "name": call.name,
                        "arguments": serde_json::to_string(&call.arguments).unwrap_or_else(|_| "{}".to_string())
                    }
                })
            })
            .collect::<Vec<_>>();
        let mut assistant_message = json!({
            "role": "assistant",
            "content": assistant_content,
            "tool_calls": assistant_tool_calls,
        });
        if !response_replay_items.is_empty() {
            assistant_message["openaiResponsesShadow"] = Value::Bool(true);
        }
        attach_assistant_replay(&mut assistant_message, &reply);
        messages.push(assistant_message.clone());
        provider_transcript.push(assistant_message);
        let tool_step_message_id = reply.ui_message_id.clone();
        let auxiliary_messages = take_provider_protocol_auxiliary_messages(
            &provider_transcript,
            &mut provider_protocol_transcript_cursor,
        );
        let mut tool_protocol_step = provider_protocol_step(
            &request,
            turn_id,
            &reply,
            &tool_calls,
            "awaitingToolResults",
            Vec::new(),
            auxiliary_messages,
        );
        persist_tool_protocol_checkpoint(
            session_id,
            turn_id,
            tool_step_message_id.as_deref(),
            &tool_protocol_step,
        )?;
        let input_start = messages.len();
        advance_stateful_responses(&mut messages, reply_response_id.as_deref(), input_start);

        let mut provider_tool_results = Vec::new();
        let mut browser_tool_calls = Vec::new();
        let mut browser_tool_outputs = Vec::new();
        if !tool_calls.is_empty() {
            if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
                return Err(AgentRuntimeError::Cancelled);
            }
            emit_turn_state(session_id, turn_id, "waiting_for_tool", "tool_call_started");
            let runtime = ToolExecutionRuntime::from_model_capabilities(&request.capabilities);
            let dispatcher = &request.host_dispatcher;
            let request_tools = request.tools.clone();
            let browser_paused = progress_guard.browser_automation_paused;
            // Pre-check: block calls that have been looping with identical failing args.
            let loop_blocks: Vec<Option<String>> = tool_calls
                .iter()
                .map(|call| {
                    match progress_guard
                        .tool_loop_detector
                        .pre_check(&call.name, &call.arguments)
                    {
                        tool_loop_detector::LoopDetectorAction::Block(msg) => Some(msg),
                        _ => None,
                    }
                })
                .collect();
            // All tools in one model batch are supervised by the shared Tokio
            // runtime under one absolute deadline. Blocking tool bodies stay on
            // the blocking pool, while timeout/cancellation orchestration remains
            // async and cannot multiply the deadline by the number of tools.
            let mut early_results = tool_calls
                .iter()
                .map(|call| early_tools.take(call))
                .collect::<AgentRuntimeResult<Vec<_>>>()?;
            let mut outputs: Vec<Value> = if tool_calls.len() > 1
                && stop_after_plan_finalize.is_none()
            {
                let join_timeout = tool_join_deadline();
                let thread_session_id = session_id.to_string();
                let thread_turn_id = turn_id.to_string();
                let thread_dispatcher = dispatcher.clone();
                let thread_cancellation = cancellation.clone();
                let mut browser_order = browser_order::BrowserBatchOrder::default();
                let tasks = tool_calls
                    .iter()
                    .enumerate()
                    .map(|(idx, call)| {
                    let browser_turn = browser_order.reserve(tool_protocol::is_browser_tool_name(&call.name));
                    let early = early_results[idx].take();
                    let call = call.clone();
                    let loop_block = loop_blocks[idx].clone();
                    let session_id = thread_session_id.clone();
                    let turn_id = thread_turn_id.clone();
                    let dispatcher = thread_dispatcher.clone();
                    let cancellation = thread_cancellation.clone();
                    let request_tools = request_tools.clone();
                    Box::pin(async move {
                        let _browser_turn = browser_turn.enter().await;
                        let result = if let Some(early) = early { early.result().await
                        } else if let Some(block_msg) = loop_block {
                            json!({
                                "content": block_msg,
                                "error": {
                                    "code": "tool_loop_blocked",
                                    "message": block_msg,
                                },
                                "truncated": false,
                                "recommendedNextAction": "Use a different tool or different arguments.",
                            })
                        } else if browser_paused
                            && tool_protocol::is_browser_tool_name(&call.name)
                        {
                            json!({
                                "content": tool_protocol::BROWSER_BLOCKED_CORRECTIVE_PROMPT,
                                "raw": {
                                    "ok": false,
                                    "status": "blocked",
                                    "browserBlocked": true,
                                    "skipped": true,
                                    "reason": "browser_automation_paused",
                                }
                            })
                        } else if let Some(hint) = schema_not_sent_if_needed(
                            &call.name,
                            &request_tools,
                            dispatcher.as_ref(),
                        ) {
                            hint
                        } else {
                            execute_model_tool_with_runtime(
                                &session_id,
                                &turn_id,
                                &dispatcher,
                                &cancellation,
                                runtime,
                                call,
                            )
                            .await
                        };
                        result
                    }) as Pin<Box<dyn Future<Output = Value> + Send + 'static>>
                })
                .collect::<Vec<_>>();
                let mut completed_tool_results = vec![None; tool_calls.len()];
                let results = super::turn_engine::run_batch_for_turn_with_completion(
                    tasks,
                    join_timeout,
                    turn_id,
                    |index, output| {
                        let call = &tool_calls[index];
                        let cancelled = tool_output_cancelled(output);
                        let failed = !cancelled && tool_output_failed(output);
                        let (content, _) =
                            provider_visible_tool_result_content(output, &call.id, 24_000);
                        completed_tool_results[index] = Some(json!({
                            "toolCallId": call.id,
                            "content": content,
                            "status": if cancelled {
                                "cancelled"
                            } else if failed {
                                "failed"
                            } else {
                                "completed"
                            },
                        }));
                        tool_protocol_step["toolResults"] = Value::Array(
                            completed_tool_results
                                .iter()
                                .filter_map(Clone::clone)
                                .collect(),
                        );
                        persist_tool_protocol_checkpoint(
                            session_id,
                            turn_id,
                            tool_step_message_id.as_deref(),
                            &tool_protocol_step,
                        )
                    },
                )
                .await?;
                results
                    .into_iter()
                    .enumerate()
                    .map(|(index, result)| match result {
                        Ok(output) => output,
                        Err(super::turn_engine::BlockingTaskFailure::Timeout) => {
                            let output = json!({
                                "content": "Lyra tool execution timed out.",
                                "error": {
                                    "code": "tool_join_timeout",
                                    "message": "Tool did not complete before the batch deadline.",
                                },
                                "truncated": false,
                                "recommendedNextAction": "Retry the tool call in a new turn or use a different approach.",
                            });
                            if let Some(call) = tool_calls.get(index) {
                                crate::native_backend::activity::settle_tool_join_timeout(
                                    session_id,
                                    turn_id,
                                    call,
                                    &output,
                                );
                            }
                            output
                        }
                        Err(super::turn_engine::BlockingTaskFailure::Panic) => json!({
                            "content": "Lyra tool execution failed.",
                            "error": {
                                "code": "tool_worker_panicked",
                                "message": "Tool worker panicked.",
                            },
                            "truncated": false,
                            "recommendedNextAction": "Retry the tool call or use a different approach.",
                        }),
                    })
                    .collect()
            } else {
                let mut sequential_outputs = Vec::with_capacity(tool_calls.len());
                for (idx, call) in tool_calls.iter().enumerate() {
                    let output = if let Some(early) = early_results[idx].take() {
                        early.result().await
                    } else if let Some(block_msg) = &loop_blocks[idx] {
                        json!({
                            "content": block_msg,
                            "error": {
                                "code": "tool_loop_blocked",
                                "message": block_msg,
                            },
                            "truncated": false,
                            "recommendedNextAction": "Use a different tool or different arguments.",
                        })
                    } else if browser_paused && tool_protocol::is_browser_tool_name(&call.name) {
                        json!({
                            "content": tool_protocol::BROWSER_BLOCKED_CORRECTIVE_PROMPT,
                            "raw": {
                                "ok": false,
                                "status": "blocked",
                                "browserBlocked": true,
                                "skipped": true,
                                "reason": "browser_automation_paused",
                            }
                        })
                    } else if let Some(hint) =
                        schema_not_sent_if_needed(&call.name, &request_tools, dispatcher.as_ref())
                    {
                        hint
                    } else {
                        // Sequential path: a panic inside a tool must not tear
                        // down the whole turn (the batch path already converts
                        // JoinError panics into per-tool errors above). Run the
                        // tool as a supervised task and map panics to the same
                        // per-tool error JSON.
                        let task_session = session_id.to_string();
                        let task_turn = turn_id.to_string();
                        let task_dispatcher = dispatcher.clone();
                        let task_cancellation = cancellation.clone();
                        let task_call = call.clone();
                        let join = tokio::spawn(async move {
                            execute_model_tool_with_runtime(
                                &task_session,
                                &task_turn,
                                &task_dispatcher,
                                &task_cancellation,
                                runtime,
                                task_call,
                            )
                            .await
                        });
                        match tokio::time::timeout(tool_join_deadline(), join).await {
                            Ok(Ok(output)) => output,
                            Ok(Err(join_error)) if join_error.is_panic() => json!({
                                "content": "Lyra tool execution failed.",
                                "error": {
                                    "code": "tool_worker_panicked",
                                    "message": "Tool worker panicked.",
                                },
                                "truncated": false,
                                "recommendedNextAction": "Retry the tool call or use a different approach.",
                            }),
                            Ok(Err(join_error)) => json!({
                                "content": "Lyra tool task was cancelled.",
                                "error": {
                                    "code": "tool_task_cancelled",
                                    "message": join_error.to_string(),
                                },
                                "truncated": false,
                                "recommendedNextAction": "Retry the tool call or use a different approach.",
                            }),
                            Err(_) => {
                                let output = json!({
                                    "content": "Lyra tool execution timed out.",
                                    "error": {
                                        "code": "tool_join_timeout",
                                        "message": "Tool did not complete before the join deadline.",
                                    },
                                    "truncated": false,
                                    "recommendedNextAction": "Retry the tool call in a new turn or use a different approach.",
                                });
                                crate::native_backend::activity::settle_tool_join_timeout(
                                    session_id, turn_id, call, &output,
                                );
                                output
                            }
                        }
                    };
                    let cancelled = tool_output_cancelled(&output);
                    let failed = !cancelled && tool_output_failed(&output);
                    let (content, _) =
                        provider_visible_tool_result_content(&output, &call.id, 24_000);
                    if let Some(results) = tool_protocol_step
                        .get_mut("toolResults")
                        .and_then(Value::as_array_mut)
                    {
                        results.push(json!({
                            "toolCallId": call.id,
                            "content": content,
                            "status": if cancelled {
                                "cancelled"
                            } else if failed {
                                "failed"
                            } else {
                                "completed"
                            },
                        }));
                    }
                    persist_tool_protocol_checkpoint(
                        session_id,
                        turn_id,
                        tool_step_message_id.as_deref(),
                        &tool_protocol_step,
                    )?;
                    sequential_outputs.push(output);
                }
                sequential_outputs
            };
            super::session_runtime::record_progress(turn_id);
            let tool_call_ids: Vec<String> = tool_calls.iter().map(|c| c.id.clone()).collect();
            tools::enforce_turn_tool_budget(session_id, turn_id, &mut outputs, &tool_call_ids);
            let clarification_completed =
                completed_successful_tool_call(&tool_calls, &outputs, LYRA_CLARIFICATION_ASK_TOOL);
            let plan_finalize_completed = stop_after_plan_finalize.is_some()
                && tool_calls.iter().zip(outputs.iter()).any(|(call, output)| {
                    (call.name == PLAN_FINALIZE_MODEL_TOOL
                        || (call.name == UPDATE_PLAN_MODEL_TOOL
                            && call.arguments.get("action").and_then(Value::as_str)
                                == Some("finalize")))
                        && output.pointer("/raw/phase").and_then(Value::as_str)
                            == Some(PLAN_PHASE_REVIEWING)
                });
            tool_protocol_step["toolResults"] = json!([]);
            let mut pending_image_messages = Vec::new();
            for (call, mut output) in tool_calls.iter().zip(outputs.into_iter()) {
                let image_content = prepare_tool_image_delivery(&mut output, &request.capabilities);
                let cancelled = tool_output_cancelled(&output);
                let failed = !cancelled && tool_output_failed(&output);
                let (mut content, evidence_ref) =
                    provider_visible_tool_result_content(&output, &call.id, 24_000);
                let progress_content = content.clone();
                // Observe tool call result with the generic loop detector
                match progress_guard
                    .tool_loop_detector
                    .observe(&call.name, &call.arguments, failed)
                {
                    tool_loop_detector::LoopDetectorAction::Warn(msg) => {
                        content = format!("{content}\n\n---\n⚠ {msg}");
                    }
                    tool_loop_detector::LoopDetectorAction::Block(msg) => {
                        content = format!("{msg}\n\n{FAILED_TOOL_ACTIVITY_LABEL}: {}", call.id);
                    }
                    tool_loop_detector::LoopDetectorAction::Continue => {}
                }
                provider_tool_results.push(progress_content);
                if tool_protocol::is_browser_tool_name(&call.name) {
                    progress_guard.browser_tools_used_this_turn = progress_guard
                        .browser_tools_used_this_turn
                        .saturating_add(1);
                }
                if let Some(parsed) =
                    browser_loop_detector::parse_browser_tool_call(&call.name, &call.arguments)
                {
                    browser_tool_calls.push(parsed);
                    browser_tool_outputs.push(output.clone());
                }
                if tool_protocol::is_browser_tool_blocked_output(&output) {
                    progress_guard.browser_automation_paused = true;
                }
                if let Some(evidence_ref) = evidence_ref {
                    emit_context_trimmed(
                        session_id,
                        json!({
                            "reason": "tool_output_truncated_for_provider",
                            "evidenceRef": evidence_ref,
                        }),
                    );
                }
                let mut tool_message = json!({
                    "role": "tool",
                    "tool_call_id": call.id,
                    "name": call.name,
                    "content": content.clone(),
                    "lyraToolStatus": if cancelled {
                        "cancelled"
                    } else if failed {
                        "failed"
                    } else {
                        "completed"
                    },
                    "lyraToolFailure": output.get("error")
                        .or_else(|| output.pointer("/raw/error"))
                        .cloned()
                        .unwrap_or(Value::Null),
                });
                crate::native_backend::tools::tool_search::record_browser_follow_tools(
                    session_id, &call.name,
                );
                if call.name == TOOL_SEARCH_TOOL_NAME {
                    if let Some(matches) = output.pointer("/raw/matches") {
                        tool_message["lyraDiscoveredTools"] = matches.clone();
                    }
                }
                if !provider_replay_items.is_empty() {
                    tool_message["openaiResponsesShadow"] = Value::Bool(true);
                    let output_item =
                        openai_responses::function_call_output_item(&call.id, content.clone());
                    provider_replay_items.push(output_item.clone());
                    messages.push(output_item);
                }
                messages.push(tool_message.clone());
                provider_transcript.push(tool_message);
                if let Some(results) = tool_protocol_step
                    .get_mut("toolResults")
                    .and_then(Value::as_array_mut)
                {
                    results.push(json!({
                        "toolCallId": call.id,
                        "content": content.clone(),
                        "status": if failed { "failed" } else { "completed" },
                    }));
                }
                persist_tool_protocol_checkpoint(
                    session_id,
                    turn_id,
                    tool_step_message_id.as_deref(),
                    &tool_protocol_step,
                )?;
                if let Some(content) = image_content {
                    pending_image_messages.push(visual_history::image_message(
                        content,
                        &call.arguments,
                        &output,
                    ));
                }
            }
            for image_message in pending_image_messages {
                messages.push(image_message.clone());
                provider_transcript.push(image_message);
            }
            visual_history::compact(&mut messages);
            tool_protocol_step["status"] = json!("complete");
            tool_protocol_step["auxiliaryMessagesAfterToolResults"] =
                Value::Array(take_provider_protocol_auxiliary_messages(
                    &provider_transcript,
                    &mut provider_protocol_transcript_cursor,
                ));
            persist_tool_protocol_checkpoint(
                session_id,
                turn_id,
                tool_step_message_id.as_deref(),
                &tool_protocol_step,
            )?;
            if request.tools.is_empty() {
                // The tool-calling downgrade may have emptied the tool list;
                // replaying a tool choice alongside no tools would 400.
                request.tool_choice = ModelToolChoice::None;
            } else {
                // Ordinary browser/file actions cannot change the installed
                // software registry. Rebuild only on discovery changes or an
                // explicit capability/configuration operation.
                if current_tool_catalog_revision(session_id) != tool_catalog_revision
                    || tool_calls.iter().any(tool_can_change_catalog)
                {
                    let _timing = super::session_runtime::LocalPhaseTimer::start(
                        session_id,
                        turn_id,
                        "toolCatalogRefresh",
                    );
                    persist_discovered_snapshot(session_id, request.host_dispatcher.as_ref());
                    let snapshot = state().lock().ok().and_then(|state| {
                        state
                            .sessions
                            .get(session_id)
                            .map(|session| session.snapshot.clone())
                    });
                    if let Some(snapshot) = snapshot {
                        request.tools = assemble_provider_tools(
                            &snapshot,
                            request.host_dispatcher.as_ref(),
                            request.capabilities.context_window,
                        );
                        request.tools = filter_tools_for_session(&snapshot, request.tools);
                    }
                    tool_catalog_revision = current_tool_catalog_revision(session_id);
                }
                if clarification_completed {
                    request.tool_choice = ModelToolChoice::Auto;
                } else if tool_choice_recovery_active {
                    request.tool_choice = original_tool_choice.clone();
                }
            }
            tool_choice_recovery_active = false;
            model_correction_retries = 0;
            crate::native_backend::turns::clear_active_ui_message_id(session_id, turn_id);
            emit_turn_state(
                session_id,
                turn_id,
                if request.capabilities.supports_streaming {
                    "streaming_model"
                } else {
                    "calling_model"
                },
                "tool_results_ready",
            );
            if plan_finalize_completed {
                let result = ModelLoopResult {
                    final_text: None,
                    final_message_id: None,
                    metadata: Some(json!({
                        "planReview": {
                            "requested": true,
                            "stoppedAfterFinalize": true,
                        }
                    })),
                    ui_text_committed: false,
                };
                return Ok(with_model_loop_observations(
                    result,
                    &observations,
                    &messages,
                    false,
                ));
            }
        }

        if let Some(nudge) = progress_guard
            .browser_loop_detector
            .observe_browser_tools(&browser_tool_calls, &browser_tool_outputs)
        {
            append_attempt_local_context_update(
                &mut messages,
                &mut attempt_local_overlay_start,
                "browser-loop-correction",
                nudge,
            );
        }
        if progress_guard.browser_automation_paused {
            append_attempt_local_context_update(
                &mut messages,
                &mut attempt_local_overlay_start,
                "browser-blocked-correction",
                tool_protocol::BROWSER_BLOCKED_CORRECTIVE_PROMPT,
            );
        }

        match progress_guard.observe_tool_round(&tool_calls, &provider_tool_results) {
            ModelLoopProgressAction::Continue => {}
            ModelLoopProgressAction::Warn {
                reason,
                observed_occurrences,
            } => {
                emit_tool_progress_guard_event(
                    session_id,
                    turn_id,
                    "toolProgressGuardWarning",
                    reason,
                    observed_occurrences,
                );
                // The only remaining mid-turn warning is the domain-specific
                // browser outcome review; the generic repeated-round warning
                // was removed (no reference project has that form).
                append_attempt_local_context_update(
                    &mut messages,
                    &mut attempt_local_overlay_start,
                    "progress-guard-warning",
                    "Browser outcome review: several observation/diagnosis rounds followed the last delivered input. Compare the user's requested end state with the current page and evidence already gathered. If the goal is established, give the final answer now; dismissing a result overlay or explaining its CSS is not required unless the user asked. If a fact is still missing, name that specific discrepancy and take one focused observation or source check. A failed cleanup click does not undo a verified outcome. Do not declare success from quiet pixels, a stale status line or source alone. Further source inspection remains available when it answers a new, task-relevant question.",
                );
            }
            ModelLoopProgressAction::Synthesize {
                reason,
                observed_occurrences,
            } => {
                return synthesize_after_progress_guard_async(
                    session_id,
                    turn_id,
                    &request,
                    messages,
                    observations,
                    cancellation,
                    reason,
                    observed_occurrences,
                    commit_assistant_text,
                )
                .await;
            }
        }
    }
}
