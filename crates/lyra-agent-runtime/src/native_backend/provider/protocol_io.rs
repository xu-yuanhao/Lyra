use super::*;

fn apply_opencode_identity(
    builder: reqwest::blocking::RequestBuilder,
    provider: &NativeProviderProfile,
    session_id: &str,
    request_id: &str,
) -> reqwest::blocking::RequestBuilder {
    providers::routes::opencode::apply_identity_headers(builder, provider, session_id, request_id)
}

fn apply_opencode_identity_async(
    builder: reqwest::RequestBuilder,
    provider: &NativeProviderProfile,
    session_id: &str,
    request_id: &str,
) -> reqwest::RequestBuilder {
    providers::routes::opencode::apply_identity_headers_async(
        builder, provider, session_id, request_id,
    )
}

#[cfg(test)]
pub(crate) fn call_model_once(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    capabilities: &ModelCapabilityProfile,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelReply> {
    call_model_once_inner(
        session_id,
        turn_id,
        provider,
        model,
        messages,
        tools,
        &ModelToolChoice::Auto,
        capabilities,
        cancellation,
        true,
    )
}

pub(crate) async fn call_model_once_for_loop_async(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    capabilities: &ModelCapabilityProfile,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    let result = tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(AgentRuntimeError::Cancelled),
        result = call_model_once_inner_async(
            session_id, turn_id, provider, model, messages, tools, tool_choice,
            capabilities, cancellation, commit_assistant_text,
        ) => result,
    };
    result.map_err(|mut error| {
        if let AgentRuntimeError::ProviderFailure { failure } = &mut error
            && failure.provider_id.is_empty()
        {
            failure.provider_id = provider.id.clone();
            failure.route_id = provider.route_id.clone();
        }
        error
    })
}

fn record_physical_provider_attempt(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    streaming: bool,
    started_at: Instant,
    request_started_at: Option<Instant>,
    committed_any: Option<bool>,
    result: &AgentRuntimeResult<ModelReply>,
) {
    let protocol_id = providers::wire_protocol::protocol_id_for(
        provider,
        providers::wire_protocol::api_npm_for(provider, model).as_deref(),
    );
    let (
        outcome,
        raw_stop_reason,
        stop_signal,
        visible_chars,
        reasoning_chars,
        tool_call_count,
        usage,
        error_category,
    ) = match result {
        Ok(reply) => {
            let visible_chars = reply.content.as_deref().unwrap_or_default().chars().count();
            let reasoning_chars = reply
                .reasoning_content
                .as_deref()
                .unwrap_or_default()
                .chars()
                .count();
            let outcome = if reply.stop_signal == TurnStopSignal::ContentFilter {
                "content_filter"
            } else if reply.stop_signal == TurnStopSignal::Refusal {
                "refusal"
            } else if reply.stop_signal == TurnStopSignal::MaxTokens && !reply.tool_calls.is_empty()
            {
                "truncated_tool_call"
            } else if !reply.tool_calls.is_empty() {
                "tool_use"
            } else if visible_chars > 0 {
                if reply.stop_signal == TurnStopSignal::MaxTokens {
                    "visible_max_tokens"
                } else {
                    "visible_final"
                }
            } else if reasoning_chars > 0 {
                "reasoning_only"
            } else {
                "terminal_empty"
            };
            (
                outcome,
                reply.raw_stop_reason.clone(),
                reply.stop_signal.label(),
                visible_chars,
                reasoning_chars,
                reply.tool_calls.len(),
                json!({
                    "inputTotal": reply.response_meta.usage.input_total_tokens,
                    "inputUncached": reply.response_meta.usage.input_uncached_tokens,
                    "cacheRead": reply.response_meta.usage.cache_read_input_tokens,
                    "cacheWrite": reply.response_meta.usage.cache_write_input_tokens,
                    "output": reply.response_meta.usage.output_tokens,
                    "reasoning": reply.response_meta.usage.reasoning_tokens,
                }),
                Value::Null,
            )
        }
        Err(error) => (
            match error {
                AgentRuntimeError::ProviderTransport { .. } => "transport_error",
                AgentRuntimeError::ProviderProtocol { .. } => "protocol_error",
                AgentRuntimeError::ProviderFailure { .. } => "provider_error",
                AgentRuntimeError::Cancelled => "cancelled",
                _ => "runtime_error",
            },
            None,
            "unknown",
            0,
            0,
            0,
            Value::Null,
            Value::String(
                match error {
                    AgentRuntimeError::ProviderTransport { .. } => "transport",
                    AgentRuntimeError::ProviderProtocol { .. } => "protocol",
                    AgentRuntimeError::ProviderFailure { .. } => "provider",
                    AgentRuntimeError::Cancelled => "cancelled",
                    _ => "runtime",
                }
                .to_string(),
            ),
        ),
    };
    let finished_at = Instant::now();
    let milliseconds = |duration: Duration| duration.as_millis().min(u64::MAX as u128) as u64;
    super::session_runtime::append_turn_provider_attempt(
        session_id,
        turn_id,
        json!({
            "attemptId": format!("attempt-{}", Uuid::new_v4()),
            "providerId": provider.id,
            "routeId": provider.route_id,
            "protocolId": protocol_id,
            "model": model,
            "streaming": streaming,
            "rawStopReason": raw_stop_reason,
            "stopSignal": stop_signal,
            "outcome": outcome,
            "visibleChars": visible_chars,
            "reasoningChars": reasoning_chars,
            "toolCallCount": tool_call_count,
            "usage": usage,
            "latencyMs": milliseconds(finished_at.duration_since(started_at)),
            // Queue time includes adaptive rate-limit cooldown. Request time
            // starts after admission; it still includes transport and parsing.
            "schedulerWaitMs": milliseconds(request_started_at.unwrap_or(finished_at).duration_since(started_at)),
            "requestDurationMs": request_started_at.map(|started| milliseconds(finished_at.duration_since(started))),
            "committedBefore": committed_any == Some(true),
            "recoveryAction": Value::Null,
            "errorCategory": error_category,
            // Persist the structured failure class even when recovery succeeds.
            // Do not copy raw error text, URLs, headers or request content here.
            "transportKind": match result {
                Err(AgentRuntimeError::ProviderTransport { kind, .. }) => Some(kind.to_string()),
                _ => None,
            },
        }),
    );
}

pub(crate) fn provider_response_error_text(
    provider: &NativeProviderProfile,
    status: reqwest::StatusCode,
    body_text: &str,
    retry_after_ms: Option<u64>,
) -> AgentRuntimeError {
    let body = serde_json::from_str::<Value>(body_text).ok();
    let provider_code = body
        .as_ref()
        .and_then(provider_error_code)
        .map(str::to_string);
    let provider_type = body
        .as_ref()
        .and_then(provider_error_type)
        .map(str::to_string);
    let message = body
        .as_ref()
        .and_then(provider_error_message)
        .unwrap_or_else(|| {
            let preview = provider_body_preview(body_text);
            if preview.is_empty() {
                format!("provider returned HTTP {}", status.as_u16())
            } else {
                preview
            }
        });
    AgentRuntimeError::ProviderFailure {
        failure: ProviderFailure {
            provider_id: provider.id.clone(),
            route_id: provider.route_id.clone(),
            http_status: Some(status.as_u16()),
            category: classify_provider_failure(
                Some(status.as_u16()),
                provider_code.as_deref(),
                provider_type.as_deref(),
                Some(message.as_str()),
            ),
            provider_code,
            provider_type,
            retry_after_ms,
            message,
            body_preview: Some(provider_body_preview(body_text)).filter(|value| !value.is_empty()),
        },
    }
}

pub(crate) fn provider_body_preview(body_text: &str) -> String {
    const MAX_PREVIEW_CHARS: usize = 512;
    let compact = body_text.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() <= MAX_PREVIEW_CHARS {
        return compact;
    }
    let preview = compact.chars().take(MAX_PREVIEW_CHARS).collect::<String>();
    format!("{preview}...")
}

pub(crate) fn provider_error_code(body: &Value) -> Option<&str> {
    body.pointer("/error/code")
        .or_else(|| body.get("code"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub(crate) fn provider_error_type(body: &Value) -> Option<&str> {
    body.pointer("/error/type")
        .or_else(|| body.get("type"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub(crate) fn provider_error_message(body: &Value) -> Option<String> {
    body.pointer("/error/message")
        .or_else(|| body.get("message"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn classify_provider_failure(
    http_status: Option<u16>,
    provider_code: Option<&str>,
    provider_type: Option<&str>,
    message: Option<&str>,
) -> ProviderFailureCategory {
    let stable_id = provider_code
        .or(provider_type)
        .map(|value| value.trim().to_ascii_lowercase());
    match stable_id.as_deref() {
        Some(
            "context_length_exceeded" | "context_window_exceeded" | "max_context_length_exceeded",
        ) => return ProviderFailureCategory::ContextLimit,
        Some(
            "image_input_unsupported"
            | "unsupported_image_input"
            | "unsupported_multimodal_input"
            | "vision_not_supported"
            | "tool_calling_unsupported"
            | "unsupported_tool_calling"
            | "tools_not_supported"
            | "function_calling_unsupported"
            | "audio_input_unsupported"
            | "unsupported_audio_input"
            | "video_input_unsupported"
            | "unsupported_video_input"
            | "pdf_input_unsupported"
            | "unsupported_pdf_input",
        ) => return ProviderFailureCategory::Capability,
        Some("content_filter" | "content_policy_violation" | "safety_violation") => {
            return ProviderFailureCategory::ContentPolicy;
        }
        Some("invalid_api_key" | "authentication_error") => {
            return ProviderFailureCategory::Authentication;
        }
        Some("permission_denied" | "access_denied") => {
            return ProviderFailureCategory::Authorization;
        }
        Some("rate_limit_exceeded" | "rate_limited") => {
            return ProviderFailureCategory::RateLimit;
        }
        Some("upstream_error" | "upstream_request_failed") => {
            return ProviderFailureCategory::Server;
        }
        _ => {}
    }
    // pi-style message inspection: some providers (e.g. opencode-free /
    // DeepSeek) wrap upstream transient failures as HTTP 400
    // invalid_request_error. "Upstream request failed" is not a client
    // error — it's the upstream model/gateway failing — so reclassify
    // as Server (retryable) instead of InvalidRequest (terminal).
    if matches!(http_status, Some(400 | 409 | 422))
        && is_upstream_failure_message(message.unwrap_or(""))
    {
        return ProviderFailureCategory::Server;
    }
    // Message-based capability detection: some providers return generic 400/422
    // without a specific provider_code. Check message for capability keywords.
    if matches!(http_status, Some(400 | 422)) {
        let lower = message.unwrap_or("").to_ascii_lowercase();
        if lower.contains("image")
            || lower.contains("vision")
            || lower.contains("multimodal")
            || lower.contains("tool calling is not supported")
            || lower.contains("tool use is not supported")
            || lower.contains("does not support tool calling")
            || lower.contains("does not support tools")
            || lower.contains("audio input is not supported")
            || lower.contains("does not support audio")
            || lower.contains("video input is not supported")
            || lower.contains("does not support video")
            || lower.contains("pdf input is not supported")
            || lower.contains("does not support pdf")
        {
            return ProviderFailureCategory::Capability;
        }
    }
    match http_status {
        Some(400 | 409 | 422) => ProviderFailureCategory::InvalidRequest,
        Some(401) => ProviderFailureCategory::Authentication,
        Some(402) => ProviderFailureCategory::Quota,
        Some(403) => ProviderFailureCategory::Authorization,
        Some(404) => ProviderFailureCategory::NotFound,
        Some(421) => ProviderFailureCategory::ContentPolicy,
        Some(429) => ProviderFailureCategory::RateLimit,
        Some(408 | 500..=599) => ProviderFailureCategory::Server,
        _ => ProviderFailureCategory::Unknown,
    }
}

/// Detect transient upstream failures masquerading as 4xx errors. Mirrors
/// pi's `RETRYABLE_PROVIDER_ERROR_PATTERN` approach — regex-free, matching
/// on lowercased message substrings.
pub(crate) fn is_upstream_failure_message(message: &str) -> bool {
    let lower = message.to_ascii_lowercase();
    lower.contains("upstream")
        || lower.contains("inference request failed")
        || lower.contains("provider returned error")
        || lower.contains("connection refused")
        || lower.contains("connection reset")
        || lower.contains("reset before headers")
}

#[cfg(test)]
mod classify_provider_failure_tests {
    use super::*;

    #[test]
    fn atria_upstream_error_422_is_server_not_invalid_request() {
        assert_eq!(
            classify_provider_failure(
                Some(422),
                Some("upstream_error"),
                Some("atria_api_error"),
                Some("Inference request failed.")
            ),
            ProviderFailureCategory::Server
        );
    }
}

pub(crate) fn provider_response_error_from_response(
    provider: &NativeProviderProfile,
    status: reqwest::StatusCode,
    response: reqwest::blocking::Response,
) -> AgentRuntimeError {
    let retry_after = retry_after_milliseconds(response.headers());
    let body = response
        .text()
        .unwrap_or_else(|error| format!("failed to read provider error body: {error}"));
    provider_response_error_text(provider, status, &body, retry_after)
}

/// Async counterpart for the streaming hot path.
pub(crate) async fn provider_response_error_from_response_async(
    provider: &NativeProviderProfile,
    status: reqwest::StatusCode,
    response: reqwest::Response,
) -> AgentRuntimeError {
    let retry_after = retry_after_milliseconds(response.headers());
    let body = response
        .text()
        .await
        .unwrap_or_else(|error| format!("failed to read provider error body: {error}"));
    provider_response_error_text(provider, status, &body, retry_after)
}

pub(crate) fn read_provider_json_body(
    provider: &NativeProviderProfile,
    status: reqwest::StatusCode,
    response: reqwest::blocking::Response,
) -> AgentRuntimeResult<Value> {
    let retry_after = retry_after_milliseconds(response.headers());
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let body_text = response.text().map_err(|error| AgentRuntimeError::ProviderTransport {
        kind: classify_reqwest_transport(&error),
        detail: format!(
            "failed to read provider response body for route `{}`: status {}, content-type {}, error: {}",
            provider.route_id,
            status.as_u16(),
            content_type,
            error
        ),
    })?;
    if !status.is_success() {
        return Err(provider_response_error_text(
            provider,
            status,
            &body_text,
            retry_after,
        ));
    }
    serde_json::from_str::<Value>(&body_text).map_err(|error| {
        let preview = provider_body_preview(&body_text);
        AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                provider_id: provider.id.clone(),
                route_id: provider.route_id.clone(),
                http_status: Some(status.as_u16()),
                provider_code: None,
                provider_type: None,
                retry_after_ms: None,
                category: ProviderFailureCategory::MalformedResponse,
                message: format!(
                    "provider response JSON decode failed for content-type {content_type}: {error}"
                ),
                body_preview: Some(preview).filter(|value| !value.is_empty()),
            },
        }
    })
}

/// Async counterpart — uses `.bytes().await` instead of blocking `.text()`.
pub(crate) async fn read_provider_json_body_async(
    provider: &NativeProviderProfile,
    status: reqwest::StatusCode,
    response: reqwest::Response,
) -> AgentRuntimeResult<Value> {
    let retry_after = retry_after_milliseconds(response.headers());
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("unknown")
        .to_string();
    let body_bytes = response.bytes().await.map_err(|error| {
        AgentRuntimeError::ProviderTransport {
            kind: classify_reqwest_transport(&error),
            detail: format!(
                "failed to read provider response body for route `{}`: status {}, content-type {}, error: {}",
                provider.route_id,
                status.as_u16(),
                content_type,
                error
            ),
        }
    })?;
    let body_text = String::from_utf8_lossy(&body_bytes);
    if !status.is_success() {
        return Err(provider_response_error_text(
            provider,
            status,
            &body_text,
            retry_after,
        ));
    }
    serde_json::from_slice::<Value>(&body_bytes).map_err(|error| {
        let preview = provider_body_preview(&body_text);
        AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                provider_id: provider.id.clone(),
                route_id: provider.route_id.clone(),
                http_status: Some(status.as_u16()),
                provider_code: None,
                provider_type: None,
                retry_after_ms: None,
                category: ProviderFailureCategory::MalformedResponse,
                message: format!(
                    "provider response JSON decode failed for content-type {content_type}: {error}"
                ),
                body_preview: Some(preview).filter(|value| !value.is_empty()),
            },
        }
    })
}

#[cfg(test)]
pub(crate) fn call_model_once_inner(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    capabilities: &ModelCapabilityProfile,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    if capabilities.supports_streaming {
        let mut stream_transport_retries: u8 = 0;
        let mut stream_fallback_attempted = false;
        let mut last_stream_transport_error: Option<AgentRuntimeError> = None;
        loop {
            let mut committed_any: Option<bool> = None;
            match scheduled_provider_request(session_id, provider, model, cancellation, || {
                crate::native_backend::turn_engine::block_on(call_model_once_streaming_inner_async(
                    session_id,
                    turn_id,
                    provider,
                    model,
                    messages,
                    tools,
                    tool_choice,
                    cancellation,
                    commit_assistant_text,
                    &mut committed_any,
                ))
            }) {
                Ok(reply) => return Ok(reply),
                Err(error) if is_provider_transport_error(&error) => {
                    // Safe to replay the whole streaming turn only when the
                    // route's parser confirms nothing was committed before the
                    // failure (`Some(false)`). `None` means the parser doesn't
                    // report commit state (dedicated protocols) and `Some(true)`
                    // means a partial assistant/tool delta already landed — both
                    // stay conservative: no replay, fail the turn (the original
                    // behavior), because replaying would duplicate or corrupt
                    // the committed timeline.
                    let safe_to_retry = committed_any == Some(false)
                        && stream_transport_retries < transport_retry_limit(&error);
                    // Non-streaming fallback (Claude Code pattern): when the
                    // streaming turn failed and nothing was committed, retry the
                    // SAME turn non-streaming once. Non-streaming has no partial
                    // SSE state to corrupt, so it is safe as long as the stream
                    // didn't already commit an increment — `committed_any ==
                    // Some(true)` must never fall back (the non-streaming reply
                    // would re-emit the full assistant text, duplicating the
                    // committed delta).
                    let can_fallback = !connection_establishment_failed(&error)
                        && !stream_fallback_attempted
                        && committed_any == Some(false);
                    emit_provider_protocol_event(
                        session_id,
                        turn_id,
                        json!({
                            "type": "stream_transport_error",
                            "routeId": provider.route_id,
                            "streaming": true,
                            "fallbackAttempted": !safe_to_retry && can_fallback,
                            "safeRetryAttempted": safe_to_retry,
                            "committedBefore": committed_any == Some(true),
                            "message": error.to_string(),
                        }),
                    );
                    if safe_to_retry {
                        stream_transport_retries += 1;
                        emit_provider_retry(
                            session_id,
                            turn_id,
                            "stream_transport_safe_retry",
                            stream_transport_retries,
                            "streaming transport failed before any committed increment; replaying the turn",
                        );
                        sleep_before_provider_retry(stream_transport_retries, cancellation)?;
                        continue;
                    }
                    if can_fallback {
                        stream_fallback_attempted = true;
                        last_stream_transport_error = Some(error);
                        emit_provider_retry(
                            session_id,
                            turn_id,
                            "stream_transport_fallback_to_non_streaming",
                            1,
                            "streaming transport failed; retrying the turn non-streaming",
                        );
                        sleep_before_provider_retry(MAX_STREAM_TRANSPORT_RETRIES, cancellation)?;
                        break; // fall through to the non-streaming path below
                    }
                    // Committed partial state — cannot replay or fall back.
                    // Finalize any tool left running so the next round doesn't
                    // see "[Tool did not finish ...]" for this aborted attempt.
                    let _finish_ok = finish_running_tools_for_failed_turn(session_id, turn_id);
                    if connection_establishment_failed(&error) {
                        return Err(error);
                    }
                    return Err(AgentRuntimeError::Core(format!(
                        "provider streaming transport failed for route `{}`; non-streaming fallback was not attempted because replaying a partially-read SSE turn can duplicate or corrupt assistant/tool state: {}",
                        provider.route_id, error
                    )));
                }
                Err(error) => {
                    // Any error that fails the turn (not just transport errors)
                    // must finalize running tools so they aren't left "running"
                    // for the next round.
                    finish_running_tools_for_failed_turn(session_id, turn_id);
                    return Err(error);
                }
            }
        }
        // Reached only via the transport fallback. Semantic outcomes such as
        // reasoning-only or terminal-empty are returned to the model loop and
        // never trigger an implicit stream -> non-stream resample here.
        if stream_fallback_attempted {
            let mut reply = match scheduled_provider_request(
                session_id,
                provider,
                model,
                cancellation,
                || {
                    call_model_once_non_streaming_checked(
                        session_id,
                        turn_id,
                        provider,
                        model,
                        messages,
                        tools,
                        tool_choice,
                        cancellation,
                    )
                },
            ) {
                Ok(reply) => reply,
                Err(non_streaming_error) => {
                    // Before failing the turn, finalize any tool left running by
                    // the aborted streaming attempt so it isn't reported to the
                    // next round as "[Tool did not finish ...]".
                    finish_running_tools_for_failed_turn(session_id, turn_id);
                    let streaming_error = last_stream_transport_error
                        .map(|e| e.to_string())
                        .unwrap_or_default();
                    return Err(AgentRuntimeError::Core(format!(
                        "provider streaming transport failed for route `{}` and non-streaming fallback also failed; streaming error: {}; non-streaming error: {}",
                        provider.route_id, streaming_error, non_streaming_error
                    )));
                }
            };
            normalize_model_reply_protocol(&mut reply, tools)?;
            if commit_assistant_text {
                crate::native_backend::turns::commit_visible_assistant_reply(
                    session_id, turn_id, &mut reply, &None,
                );
            }
            return Ok(reply);
        }
    }
    let mut reply = scheduled_provider_request(session_id, provider, model, cancellation, || {
        call_model_once_non_streaming_checked(
            session_id,
            turn_id,
            provider,
            model,
            messages,
            tools,
            tool_choice,
            cancellation,
        )
    })?;
    normalize_model_reply_protocol(&mut reply, tools)?;
    if commit_assistant_text {
        crate::native_backend::turns::commit_visible_assistant_reply(
            session_id, turn_id, &mut reply, &None,
        );
    }
    Ok(reply)
}

pub(crate) async fn call_model_once_inner_async(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    capabilities: &ModelCapabilityProfile,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    if capabilities.supports_streaming {
        let mut stream_transport_retries: u8 = 0;
        let mut stream_fallback_attempted = false;
        // zed/codex "keep partial + continue" guard: when a streaming transport
        // error fires AND a partial assistant delta was already committed to
        // the transcript (committed_any == Some(true)), the legacy dead-fail
        // branch returned the verbose "non-streaming fallback was not attempted
        // because replaying a partially-read SSE turn can duplicate or corrupt
        // assistant/tool state" and finalized the turn. Mature agents (zed
        // thread.rs:3020-3053, codex turn.rs:1356-1362) instead RETAIN the
        // committed partial as history and append a user-role continuation
        // marker ("Continue where you left off") so the next attempt asks the
        // model to pick up after the committed prefix — the provider never sees
        // a duplicate. We do that once via a non-streaming replay; dedication:
        // streaming would again risk a second partial commit. If the continue
        // also fails, we still finalize the original transport error.
        loop {
            let previous_message_id = active_ui_message_id(session_id, turn_id);
            let mut committed_any: Option<bool> = None;
            let attempt_started_at = Instant::now();
            let mut request_started_at = None;
            let attempt_result =
                scheduled_provider_request_async(session_id, provider, model, cancellation, || {
                    request_started_at = Some(Instant::now());
                    call_model_once_streaming_inner_async(
                        session_id,
                        turn_id,
                        provider,
                        model,
                        messages,
                        tools,
                        tool_choice,
                        cancellation,
                        commit_assistant_text,
                        &mut committed_any,
                    )
                })
                .await;
            if committed_any.is_none() {
                committed_any = Some(super::continuation::StreamContinuation::has_progress(
                    session_id,
                    turn_id,
                    previous_message_id.as_deref(),
                ));
            }
            let attempt_result = if attempt_result.is_err() && committed_any == Some(true) {
                super::continuation::StreamContinuation::mark_partial(session_id, turn_id);
                attempt_result.map_err(|error| {
                    if is_retryable_provider_error(&error) {
                        AgentRuntimeError::ProviderTransport {
                            kind: ProviderTransportKind::StreamInterrupted,
                            detail: format!(
                                "provider interrupted an already committed stream: {error}"
                            ),
                        }
                    } else {
                        error
                    }
                })
            } else {
                attempt_result
            };
            record_physical_provider_attempt(
                session_id,
                turn_id,
                provider,
                model,
                true,
                attempt_started_at,
                request_started_at,
                committed_any,
                &attempt_result,
            );
            match attempt_result {
                Ok(reply) => return Ok(reply),
                Err(error) if is_provider_transport_error(&error) => {
                    let safe_to_retry = committed_any == Some(false)
                        && stream_transport_retries < transport_retry_limit(&error);
                    let can_fallback = !connection_establishment_failed(&error)
                        && !stream_fallback_attempted
                        && committed_any == Some(false);
                    emit_provider_protocol_event(
                        session_id,
                        turn_id,
                        json!({
                            "type": "stream_transport_error",
                            "routeId": provider.route_id,
                            "streaming": true,
                            "fallbackAttempted": !safe_to_retry && can_fallback,
                            "safeRetryAttempted": safe_to_retry,
                            "committedBefore": committed_any == Some(true),
                            "message": error.to_string(),
                        }),
                    );
                    if safe_to_retry {
                        super::session_runtime::set_last_provider_attempt_recovery(
                            session_id,
                            turn_id,
                            "stream_transport_safe_retry",
                        );
                        stream_transport_retries += 1;
                        emit_provider_retry(
                            session_id,
                            turn_id,
                            "stream_transport_safe_retry",
                            stream_transport_retries,
                            "streaming transport failed before any committed increment; replaying the turn",
                        );
                        sleep_before_provider_retry_async(stream_transport_retries, cancellation)
                            .await?;
                        continue;
                    }
                    if can_fallback {
                        super::session_runtime::set_last_provider_attempt_recovery(
                            session_id,
                            turn_id,
                            "stream_transport_fallback_to_non_streaming",
                        );
                        stream_fallback_attempted = true;
                        emit_provider_retry(
                            session_id,
                            turn_id,
                            "stream_transport_fallback_to_non_streaming",
                            1,
                            "streaming transport failed; retrying the turn non-streaming",
                        );
                        sleep_before_provider_retry_async(
                            MAX_STREAM_TRANSPORT_RETRIES,
                            cancellation,
                        )
                        .await?;
                        break;
                    }
                    let _finish_ok = finish_running_tools_for_failed_turn(session_id, turn_id);
                    if connection_establishment_failed(&error) {
                        return Err(error);
                    }
                    // A committed flag may witness reasoning or a tool preview.
                    // Continue only when this attempt recorded actual visible text.
                    if let Some(continuation) = (committed_any == Some(true))
                        .then(|| {
                            super::continuation::StreamContinuation::capture(
                                session_id,
                                turn_id,
                                previous_message_id.as_deref(),
                            )
                        })
                        .flatten()
                    {
                        super::session_runtime::set_last_provider_attempt_recovery(
                            session_id,
                            turn_id,
                            "stream_transport_keep_continue_after_partial",
                        );
                        emit_provider_retry(
                            session_id,
                            turn_id,
                            "stream_transport_keep_continue_after_partial",
                            1,
                            "streaming transport failed after partial commit; retaining committed prefix and asking the model to continue",
                        );
                        sleep_before_provider_retry_async(
                            MAX_STREAM_TRANSPORT_RETRIES,
                            cancellation,
                        )
                        .await?;

                        let attempt_started_at = Instant::now();

                        let mut request_started_at = None;
                        let messages_with_continue = continuation.request_messages(messages);
                        let attempt_result = scheduled_provider_request_async(
                            session_id,
                            provider,
                            model,
                            cancellation,
                            || {
                                request_started_at = Some(Instant::now());
                                call_model_once_non_streaming_checked_async(
                                    session_id,
                                    turn_id,
                                    provider,
                                    model,
                                    &messages_with_continue,
                                    tools,
                                    tool_choice,
                                    cancellation,
                                )
                            },
                        )
                        .await;
                        record_physical_provider_attempt(
                            session_id,
                            turn_id,
                            provider,
                            model,
                            false,
                            attempt_started_at,
                            request_started_at,
                            None,
                            &attempt_result,
                        );
                        let mut attempt_result = match attempt_result {
                            Ok(mut reply) => {
                                match normalize_model_reply_protocol(&mut reply, tools) {
                                    Ok(()) => Ok(reply),
                                    Err(error) => Err(error),
                                }
                            }
                            Err(e) => Err(e),
                        };
                        if let Ok(reply) = attempt_result.as_mut() {
                            continuation.finish(
                                session_id,
                                turn_id,
                                reply,
                                commit_assistant_text,
                            )?;
                        }
                        match attempt_result {
                            Ok(reply) => return Ok(reply),
                            Err(continuation_error) => {
                                return Err(AgentRuntimeError::ProviderTransport {
                                    kind: ProviderTransportKind::StreamInterrupted,
                                    detail: format!(
                                        "provider streaming transport failed; committed prefix was preserved, but continuation failed: {continuation_error}"
                                    ),
                                });
                            }
                        }
                    }
                    return Err(error);
                }
                Err(error) => {
                    finish_running_tools_for_failed_turn(session_id, turn_id);
                    return Err(error);
                }
            }
        }
        if stream_fallback_attempted {
            let attempt_started_at = Instant::now();
            let mut request_started_at = None;
            let mut attempt_result =
                scheduled_provider_request_async(session_id, provider, model, cancellation, || {
                    request_started_at = Some(Instant::now());
                    call_model_once_non_streaming_checked_async(
                        session_id,
                        turn_id,
                        provider,
                        model,
                        messages,
                        tools,
                        tool_choice,
                        cancellation,
                    )
                })
                .await;
            if let Ok(reply) = attempt_result.as_mut()
                && let Err(error) = normalize_model_reply_protocol(reply, tools)
            {
                attempt_result = Err(error);
            }
            record_physical_provider_attempt(
                session_id,
                turn_id,
                provider,
                model,
                false,
                attempt_started_at,
                request_started_at,
                None,
                &attempt_result,
            );
            let mut reply = match attempt_result {
                Ok(reply) => reply,
                Err(non_streaming_error) => {
                    finish_running_tools_for_failed_turn(session_id, turn_id);
                    return Err(non_streaming_error);
                }
            };
            if commit_assistant_text {
                crate::native_backend::turns::commit_visible_assistant_reply(
                    session_id, turn_id, &mut reply, &None,
                );
            }
            return Ok(reply);
        }
    }
    let attempt_started_at = Instant::now();
    let mut request_started_at = None;
    let mut attempt_result =
        scheduled_provider_request_async(session_id, provider, model, cancellation, || {
            request_started_at = Some(Instant::now());
            call_model_once_non_streaming_checked_async(
                session_id,
                turn_id,
                provider,
                model,
                messages,
                tools,
                tool_choice,
                cancellation,
            )
        })
        .await;
    if let Ok(reply) = attempt_result.as_mut()
        && let Err(error) = normalize_model_reply_protocol(reply, tools)
    {
        attempt_result = Err(error);
    }
    record_physical_provider_attempt(
        session_id,
        turn_id,
        provider,
        model,
        false,
        attempt_started_at,
        request_started_at,
        None,
        &attempt_result,
    );
    let mut reply = attempt_result?;
    if commit_assistant_text {
        crate::native_backend::turns::commit_visible_assistant_reply(
            session_id, turn_id, &mut reply, &None,
        );
    }
    Ok(reply)
}

#[cfg(test)]
pub(crate) fn scheduled_provider_request(
    session_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    cancellation: &CancellationToken,
    request: impl FnOnce() -> AgentRuntimeResult<ModelReply>,
) -> AgentRuntimeResult<ModelReply> {
    let permit = super::turn_engine::block_on(acquire_provider_request_permit(
        provider,
        model,
        session_id,
        cancellation,
    ))?;
    let result = request();
    release_provider_request_permit(permit, &result);
    result
}

/// Async version of `scheduled_provider_request` — permit acquisition is
/// natively async (Notify + tokio::time::sleep), no spawn_blocking needed.
pub(crate) async fn scheduled_provider_request_async<F, Fut>(
    session_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    cancellation: &CancellationToken,
    request: F,
) -> AgentRuntimeResult<ModelReply>
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future<Output = AgentRuntimeResult<ModelReply>>,
{
    let permit = acquire_provider_request_permit(provider, model, session_id, cancellation).await?;
    let result = request().await;
    release_provider_request_permit(permit, &result);
    result
}

/// Finalize any tool still in `running` status for this turn as `failed`, so a
/// transport-aborted streaming attempt doesn't leak into the next round as
/// "[Tool did not finish; omitting output from provider context.]" — the
/// tool is reported as a clean failure instead. Best-effort: a state-lock
/// failure is swallowed because the caller is already on an error path.
/// Returns `true` if the state lock was acquired (regardless of whether any
/// tool was actually finalized).
pub(crate) fn finish_running_tools_for_failed_turn(session_id: &str, turn_id: &str) -> bool {
    let mut state = match crate::native_backend::state::state().lock() {
        Ok(state) => state,
        Err(_) => return false,
    };
    let Some(session) = state.sessions.get_mut(session_id) else {
        return true;
    };
    crate::native_backend::activity::finish_running_tools_for_turn(
        session,
        turn_id,
        "failed",
        json!({
            "error": "provider streaming transport failed before this tool could finish",
            "reason": "transport_failure",
        }),
    );
    true
}

/// Async non-streaming request — mirrors the sync `call_model_once_non_streaming_with_choice`
/// using async `reqwest` so cancellation also releases the HTTP request.
pub(crate) async fn call_model_once_non_streaming_with_choice_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    session_id: &str,
    request_id: &str,
) -> AgentRuntimeResult<ModelReply> {
    if route_uses_aws_bedrock_converse(provider)? {
        let response = build_aws_bedrock_converse_request_async(
            provider,
            model,
            messages,
            tools,
            tool_choice,
        )?
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let body = read_provider_json_body_async(provider, response.status(), response).await?;
        let mut reply = aws_bedrock_converse::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_openai_responses(provider, model)? {
        let response = apply_opencode_identity_async(
            build_openai_responses_request_async(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                false,
            )?,
            provider,
            session_id,
            request_id,
        )
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body_async(provider, status, response).await?;
        let mut reply = openai_responses::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_anthropic_messages(provider, model)? {
        let response = apply_opencode_identity_async(
            build_anthropic_messages_request_async(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                false,
            )?,
            provider,
            session_id,
            request_id,
        )
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body_async(provider, status, response).await?;
        let mut reply = anthropic_messages::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_gemini_generate_content(provider, model)? {
        let response = apply_opencode_identity_async(
            build_gemini_generate_content_request_async(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                false,
            )?,
            provider,
            session_id,
            request_id,
        )
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body_async(provider, status, response).await?;
        let mut reply = gemini_generate_content::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_ollama_chat(provider)? {
        let response =
            build_ollama_chat_request_async(provider, model, messages, tools, tool_choice, false)?
                .send()
                .await
                .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body_async(provider, status, response).await?;
        let mut reply = ollama_chat::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    let response = apply_opencode_identity_async(
        build_openai_compatible_request_async(
            provider,
            model,
            messages,
            tools,
            tool_choice,
            false,
        )?,
        provider,
        session_id,
        request_id,
    )
    .send()
    .await
    .map_err(reqwest_transport_error)?;
    let status = response.status();
    let body = read_provider_json_body_async(provider, status, response).await?;
    parse_openai_chat_non_streaming_reply(&body, tools)
}

/// Parse an OpenAI Chat Completion non-streaming response body into a `ModelReply`.
/// Shared between sync and async non-streaming paths.
pub(crate) fn parse_openai_chat_non_streaming_reply(
    body: &Value,
    tools: &[Value],
) -> AgentRuntimeResult<ModelReply> {
    let message = body.pointer("/choices/0/message").ok_or_else(|| {
        AgentRuntimeError::Core("provider returned no assistant message".to_string())
    })?;
    let raw_content = openai_chat::message_content(message.get("content"));
    let reasoning_replay = openai_chat::reasoning_replay_items(message);
    let mut reasoning = openai_chat::message_reasoning_text(message);
    let content = raw_content.map(|text| {
        let scrubbed = openai_chat::scrub_think_blocks(&text);
        if !scrubbed.reasoning.trim().is_empty() {
            match reasoning.as_mut() {
                Some(existing) => existing.push_str(&scrubbed.reasoning),
                None => reasoning = Some(scrubbed.reasoning.clone()),
            }
        }
        scrubbed.visible
    });
    let allowed_tool_names = openai_chat::tool_name_set(tools);
    let raw_tool_calls = message
        .get("tool_calls")
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .unwrap_or_default();
    let tool_calls = raw_tool_calls
        .iter()
        .enumerate()
        .filter_map(|(index, item)| openai_chat::parse_tool_call(item, &allowed_tool_names, index))
        .collect::<Vec<_>>();
    let raw_stop_reason = body
        .pointer("/choices/0/finish_reason")
        .and_then(Value::as_str)
        .map(str::to_string);
    let mut stop_signal = TurnStopSignal::from_raw(raw_stop_reason.as_deref());
    if message
        .get("refusal")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
    {
        stop_signal = TurnStopSignal::Refusal;
    }
    if raw_tool_calls.len() != tool_calls.len() {
        return Err(AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::IncompleteToolCall,
            detail: "provider returned an incomplete or unknown tool call".to_string(),
        });
    }
    if stop_signal != TurnStopSignal::MaxTokens {
        openai_chat::validate_tool_call_arguments(&tool_calls)?;
    }
    if content.as_ref().is_none_or(|value| value.trim().is_empty())
        && tool_calls.is_empty()
        && stop_signal == TurnStopSignal::ToolUse
    {
        return Err(AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::IncompleteToolCall,
            detail: "provider finished with tool_calls but returned no complete tool call"
                .to_string(),
        });
    }
    Ok(ModelReply {
        content,
        reasoning_content: reasoning,
        tool_calls,
        ui_message_id: None,
        raw_stop_reason,
        provider_replay_protocol: Some(openai_chat::PROTOCOL_ID.to_string()),
        provider_replay_items: reasoning_replay,
        response_meta: openai_chat_response_meta(body),
        stop_signal,
    })
}

pub(crate) fn openai_chat_response_meta(body: &Value) -> ProviderResponseMeta {
    let usage = body.get("usage").unwrap_or(&Value::Null);
    let input_total_tokens = usage
        .get("prompt_tokens")
        .or_else(|| usage.get("input_tokens"))
        .and_then(Value::as_u64);
    let cache_read_input_tokens = usage
        .pointer("/prompt_tokens_details/cached_tokens")
        .or_else(|| usage.pointer("/input_tokens_details/cached_tokens"))
        .or_else(|| usage.get("cache_read_input_tokens"))
        .or_else(|| usage.get("prompt_cache_hit_tokens"))
        .and_then(Value::as_u64);
    let cache_write_input_tokens = usage
        .pointer("/prompt_tokens_details/cache_write_tokens")
        .or_else(|| usage.pointer("/input_tokens_details/cache_write_tokens"))
        .or_else(|| usage.get("cache_write_input_tokens"))
        .or_else(|| usage.get("cache_creation_input_tokens"))
        .and_then(Value::as_u64);
    ProviderResponseMeta {
        response_id: body
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string),
        usage: ProviderTokenUsage {
            input_total_tokens,
            input_uncached_tokens: input_total_tokens.map(|total| {
                total
                    .saturating_sub(cache_read_input_tokens.unwrap_or(0))
                    .saturating_sub(cache_write_input_tokens.unwrap_or(0))
            }),
            cache_read_input_tokens,
            cache_write_input_tokens,
            output_tokens: usage
                .get("completion_tokens")
                .or_else(|| usage.get("output_tokens"))
                .and_then(Value::as_u64),
            reasoning_tokens: usage
                .pointer("/completion_tokens_details/reasoning_tokens")
                .or_else(|| usage.pointer("/output_tokens_details/reasoning_tokens"))
                .or_else(|| usage.get("reasoning_tokens"))
                .and_then(Value::as_u64),
        },
    }
}

pub(crate) fn call_model_once_non_streaming(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
) -> AgentRuntimeResult<ModelReply> {
    call_model_once_non_streaming_with_choice(
        provider,
        model,
        messages,
        tools,
        &ModelToolChoice::Auto,
        "",
        "",
    )
}

pub(crate) fn call_model_once_non_streaming_with_choice(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    session_id: &str,
    request_id: &str,
) -> AgentRuntimeResult<ModelReply> {
    if providers::subscription::is_special_transport(&provider.route_id) {
        let text = providers::subscription::special_text(provider, model, messages, tools)?;
        return Ok(ModelReply {
            content: Some(text),
            reasoning_content: None,
            tool_calls: Vec::new(),
            ui_message_id: None,
            raw_stop_reason: Some("stop".to_string()),
            provider_replay_protocol: None,
            provider_replay_items: Vec::new(),
            response_meta: ProviderResponseMeta::default(),
            stop_signal: TurnStopSignal::EndTurn,
        });
    }
    if route_uses_openai_responses(provider, model)? {
        let response = apply_opencode_identity(
            build_openai_responses_request(provider, model, messages, tools, tool_choice, false)?,
            provider,
            session_id,
            request_id,
        )
        .send()
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body(provider, status, response)?;
        let mut reply = openai_responses::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_anthropic_messages(provider, model)? {
        let response = apply_opencode_identity(
            build_anthropic_messages_request(provider, model, messages, tools, tool_choice, false)?,
            provider,
            session_id,
            request_id,
        )
        .send()
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body(provider, status, response)?;
        let mut reply = anthropic_messages::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_gemini_generate_content(provider, model)? {
        let response = apply_opencode_identity(
            build_gemini_generate_content_request(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                false,
            )?,
            provider,
            session_id,
            request_id,
        )
        .send()
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body(provider, status, response)?;
        let mut reply = gemini_generate_content::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_aws_bedrock_converse(provider)? {
        let response =
            build_aws_bedrock_converse_request(provider, model, messages, tools, tool_choice)?
                .send()
                .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body(provider, status, response)?;
        let mut reply = aws_bedrock_converse::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_ollama_chat(provider)? {
        let response =
            build_ollama_chat_request(provider, model, messages, tools, tool_choice, false)?
                .send()
                .map_err(reqwest_transport_error)?;
        let status = response.status();
        let body = read_provider_json_body(provider, status, response)?;
        let mut reply = ollama_chat::parse_response_body(&body, tools)?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    let response = apply_opencode_identity(
        build_openai_compatible_request(provider, model, messages, tools, tool_choice, false)?,
        provider,
        session_id,
        request_id,
    )
    .send()
    .map_err(reqwest_transport_error)?;
    let status = response.status();
    let body = read_provider_json_body(provider, status, response)?;
    parse_openai_chat_non_streaming_reply(&body, tools)
}

#[allow(dead_code)]
pub(crate) fn call_model_once_streaming(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelReply> {
    let mut committed_any: Option<bool> = None;
    call_model_once_streaming_inner(
        session_id,
        turn_id,
        provider,
        model,
        messages,
        tools,
        &ModelToolChoice::Auto,
        cancellation,
        true,
        &mut committed_any,
    )
}

pub(crate) fn call_model_once_streaming_inner(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
    committed_any: &mut Option<bool>,
) -> AgentRuntimeResult<ModelReply> {
    // Dedicated protocol parsers (responses/anthropic/gemini/ollama) don't
    // report per-stream commit state yet, so `committed_any` stays `None` for
    // them — the caller treats that as "not safe to replay" and fails the turn
    // (the existing conservative behavior). Only the OpenAI-compatible path
    // tracks commits and can opt in to safe transport retry.
    *committed_any = None;
    if providers::subscription::is_special_transport(&provider.route_id) {
        let text = providers::subscription::special_text(provider, model, messages, tools)?;
        return Ok(ModelReply {
            content: Some(text),
            reasoning_content: None,
            tool_calls: Vec::new(),
            ui_message_id: None,
            raw_stop_reason: Some("stop".to_string()),
            provider_replay_protocol: None,
            provider_replay_items: Vec::new(),
            response_meta: ProviderResponseMeta::default(),
            stop_signal: TurnStopSignal::EndTurn,
        });
    }
    if route_uses_openai_responses(provider, model)? {
        let response = apply_opencode_identity(
            build_openai_responses_request(provider, model, messages, tools, tool_choice, true)?,
            provider,
            session_id,
            turn_id,
        )
        .send()
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(provider_response_error_from_response(
                provider, status, response,
            ));
        }
        let mut reply = openai_responses::parse_streaming_response(
            BufReader::new(response),
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_anthropic_messages(provider, model)? {
        let response = apply_opencode_identity(
            build_anthropic_messages_request(provider, model, messages, tools, tool_choice, true)?,
            provider,
            session_id,
            turn_id,
        )
        .send()
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(provider_response_error_from_response(
                provider, status, response,
            ));
        }
        let mut reply = anthropic_messages::parse_streaming_response(
            BufReader::new(response),
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_gemini_generate_content(provider, model)? {
        let response = apply_opencode_identity(
            build_gemini_generate_content_request(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                true,
            )?,
            provider,
            session_id,
            turn_id,
        )
        .send()
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(provider_response_error_from_response(
                provider, status, response,
            ));
        }
        let mut reply = gemini_generate_content::parse_streaming_response(
            BufReader::new(response),
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_aws_bedrock_converse(provider)? {
        return Err(AgentRuntimeError::Core(
            "AWS Bedrock Converse streaming is not supported yet; mark this model as non-streaming"
                .to_string(),
        ));
    }
    if route_uses_ollama_chat(provider)? {
        let response =
            build_ollama_chat_request(provider, model, messages, tools, tool_choice, true)?
                .send()
                .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(provider_response_error_from_response(
                provider, status, response,
            ));
        }
        let mut reply = ollama_chat::parse_streaming_response(
            BufReader::new(response),
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    // OpenAI-compatible path: track whether any increment was committed so the
    // caller can safely replay the turn if the transport fails before the first
    // committed delta. A pre-stream `.send()` failure leaves this at Some(false)
    // (set just below), which is the safe-to-retry case.
    *committed_any = Some(false);
    let response = apply_opencode_identity(
        build_openai_compatible_request(provider, model, messages, tools, tool_choice, true)?,
        provider,
        session_id,
        turn_id,
    )
    .send()
    .map_err(reqwest_transport_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(provider_response_error_from_response(
            provider, status, response,
        ));
    }
    let mut stream_committed = false;
    let result = parse_streaming_response_with_commit(
        BufReader::new(response),
        session_id,
        turn_id,
        cancellation,
        tools,
        commit_assistant_text,
        &mut stream_committed,
    );
    *committed_any = Some(stream_committed);
    result
}

pub(crate) async fn call_model_once_streaming_inner_async(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    cancellation: &CancellationToken,
    commit_assistant_text: bool,
    committed_any: &mut Option<bool>,
) -> AgentRuntimeResult<ModelReply> {
    *committed_any = None;
    if providers::subscription::is_special_transport(&provider.route_id) {
        let text = providers::subscription::special_text(provider, model, messages, tools)?;
        return Ok(ModelReply {
            content: Some(text),
            reasoning_content: None,
            tool_calls: Vec::new(),
            ui_message_id: None,
            raw_stop_reason: Some("stop".to_string()),
            provider_replay_protocol: None,
            provider_replay_items: Vec::new(),
            response_meta: ProviderResponseMeta::default(),
            stop_signal: TurnStopSignal::EndTurn,
        });
    }
    if route_uses_openai_responses(provider, model)? {
        let response = apply_opencode_identity_async(
            build_openai_responses_request_async(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                true,
            )?,
            provider,
            session_id,
            turn_id,
        )
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(
                provider_response_error_from_response_async(provider, status, response).await,
            );
        }
        let mut reply = openai_responses::parse_streaming_response_async(
            response,
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )
        .await?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_anthropic_messages(provider, model)? {
        let response = apply_opencode_identity_async(
            build_anthropic_messages_request_async(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                true,
            )?,
            provider,
            session_id,
            turn_id,
        )
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(
                provider_response_error_from_response_async(provider, status, response).await,
            );
        }
        let mut reply = anthropic_messages::parse_streaming_response_async(
            response,
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )
        .await?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_gemini_generate_content(provider, model)? {
        let response = apply_opencode_identity_async(
            build_gemini_generate_content_request_async(
                provider,
                model,
                messages,
                tools,
                tool_choice,
                true,
            )?,
            provider,
            session_id,
            turn_id,
        )
        .send()
        .await
        .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(
                provider_response_error_from_response_async(provider, status, response).await,
            );
        }
        let mut reply = gemini_generate_content::parse_streaming_response_async(
            response,
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )
        .await?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    if route_uses_aws_bedrock_converse(provider)? {
        return Err(AgentRuntimeError::Core(
            "AWS Bedrock Converse streaming is not supported yet; mark this model as non-streaming"
                .to_string(),
        ));
    }
    if route_uses_ollama_chat(provider)? {
        let response =
            build_ollama_chat_request_async(provider, model, messages, tools, tool_choice, true)?
                .send()
                .await
                .map_err(reqwest_transport_error)?;
        let status = response.status();
        if !status.is_success() {
            return Err(
                provider_response_error_from_response_async(provider, status, response).await,
            );
        }
        let mut reply = ollama_chat::parse_streaming_response_async(
            response,
            session_id,
            turn_id,
            cancellation,
            tools,
            commit_assistant_text,
        )
        .await?;
        normalize_model_reply_protocol(&mut reply, tools)?;
        return Ok(reply);
    }
    *committed_any = Some(false);
    let response = apply_opencode_identity_async(
        build_openai_compatible_request_async(provider, model, messages, tools, tool_choice, true)?,
        provider,
        session_id,
        turn_id,
    )
    .send()
    .await
    .map_err(reqwest_transport_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(provider_response_error_from_response_async(provider, status, response).await);
    }
    let mut stream_committed = false;
    let result = parse_streaming_response_with_commit_async(
        response,
        session_id,
        turn_id,
        cancellation,
        tools,
        commit_assistant_text,
        &mut stream_committed,
    )
    .await;
    *committed_any = Some(stream_committed);
    result
}

#[cfg(test)]
#[test]
fn attempt_metadata_keeps_transport_class_without_raw_failure_secrets() {
    let provider: NativeProviderProfile = serde_json::from_value(json!({
        "id":"fixture", "label":"Fixture", "routeId":"custom_openai_compatible"
    }))
    .unwrap();
    let session = format!("transport-metadata-{}", Uuid::new_v4());
    for kind in [
        ProviderTransportKind::Connect,
        ProviderTransportKind::Timeout,
        ProviderTransportKind::StreamInterrupted,
        ProviderTransportKind::Other,
    ] {
        let started = Instant::now();
        record_physical_provider_attempt(
            &session,
            "turn",
            &provider,
            "fixture",
            true,
            started,
            Some(started),
            Some(false),
            &Err(AgentRuntimeError::ProviderTransport {
                kind,
                detail: "raw-error-secret-must-not-be-persisted".into(),
            }),
        );
        let metadata =
            super::session_runtime::take_turn_provider_metadata(&session, "turn").unwrap();
        assert_eq!(
            metadata["providerAttempts"][0]["transportKind"],
            kind.to_string()
        );
        assert_eq!(
            metadata["providerAttempts"][0]["errorCategory"],
            "transport"
        );
        assert!(!metadata.to_string().contains("raw-error-secret"));
    }
}

#[cfg(test)]
#[path = "connection_recovery_tests.rs"]
mod connection_recovery_tests;
