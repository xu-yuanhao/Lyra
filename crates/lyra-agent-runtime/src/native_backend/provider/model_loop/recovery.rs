use super::*;

pub(super) fn provider_protocol_id(request: &ModelRequest) -> String {
    providers::wire_protocol::protocol_id_for(
        &request.provider,
        providers::wire_protocol::api_npm_for(&request.provider, &request.model).as_deref(),
    )
}

#[cfg(test)]
mod opencode_protocol_tests {
    use super::*;

    fn request(route_id: &str, model: &str, api_npm: Option<&str>) -> ModelRequest {
        ModelRequest {
            provider: NativeProviderProfile {
                id: route_id.to_string(),
                label: route_id.to_string(),
                route_id: route_id.to_string(),
                base_url: None,
                default_model: Some(model.to_string()),
                api_key_ref: None,
                api_key: None,
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: vec![NativeProviderModel {
                    id: model.to_string(),
                    api_npm: api_npm.map(str::to_string),
                    ..NativeProviderModel::default()
                }],
            },
            model: model.to_string(),
            messages: vec![],
            tools: vec![],
            tool_choice: ModelToolChoice::Auto,
            host_dispatcher: None,
            capabilities: ModelCapabilityProfile {
                supports_image_input: false,
                supports_tool_calling: true,
                supports_streaming: true,
                supports_tool_choice: true,
                context_window: None,
            },
            input_downgrades: vec![],
            evidence_refs: vec![],
            token_estimate: 0,
            context_trimmed: false,
        }
    }

    #[test]
    fn model_loop_uses_the_effective_opencode_protocol_for_replay() {
        assert_eq!(
            provider_protocol_id(&request(
                "opencode_zen",
                "claude-sonnet-5",
                Some("@ai-sdk/anthropic")
            )),
            anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(
            provider_protocol_id(&request(
                "opencode_go",
                "gpt-5.6-luna",
                Some("@ai-sdk/openai")
            )),
            openai_responses::PROTOCOL_ID
        );
    }
}

pub(super) fn persist_tool_protocol_checkpoint(
    session_id: &str,
    turn_id: &str,
    message_id: Option<&str>,
    provider_protocol: &Value,
) -> AgentRuntimeResult<()> {
    crate::native_backend::turns::upsert_provider_protocol_log_entry(
        session_id,
        turn_id,
        message_id.filter(|id| !id.trim().is_empty()),
        provider_protocol.clone(),
    )
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum AttemptOutcome {
    VisibleText,
    ToolCalls,
    MaxTokensWithText,
    MaxTokensWithToolCalls,
    ToolUseWithoutCall,
    ReasoningOnly,
    TerminalEmpty,
    Refusal,
    ContentFilter,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RecoveryAction {
    Accept,
    ContinueVisibleText,
    RetryReasoningOnly,
    RetryTerminalEmpty,
    RetryIncompleteToolCall,
    RetryMissingToolCall,
    Fail(ProviderProtocolFailureKind),
}

pub(super) fn classify_attempt_outcome(reply: &ModelReply) -> AttemptOutcome {
    match reply.stop_signal {
        TurnStopSignal::Refusal => return AttemptOutcome::Refusal,
        TurnStopSignal::ContentFilter => return AttemptOutcome::ContentFilter,
        _ => {}
    }
    if !reply.tool_calls.is_empty() {
        return if reply.stop_signal == TurnStopSignal::MaxTokens {
            AttemptOutcome::MaxTokensWithToolCalls
        } else {
            AttemptOutcome::ToolCalls
        };
    }
    if reply.stop_signal == TurnStopSignal::ToolUse {
        return AttemptOutcome::ToolUseWithoutCall;
    }
    let has_visible_text = reply
        .content
        .as_ref()
        .is_some_and(|text| !text.trim().is_empty());
    if !has_visible_text {
        return match reply.stop_signal {
            _ if reply
                .reasoning_content
                .as_ref()
                .is_some_and(|text| !text.trim().is_empty()) =>
            {
                AttemptOutcome::ReasoningOnly
            }
            _ => AttemptOutcome::TerminalEmpty,
        };
    }
    if reply.stop_signal == TurnStopSignal::MaxTokens {
        AttemptOutcome::MaxTokensWithText
    } else {
        AttemptOutcome::VisibleText
    }
}

pub(super) fn recovery_action_for_attempt(
    outcome: AttemptOutcome,
    model_correction_retries: u8,
    continuation_retries: u8,
) -> RecoveryAction {
    let corrections_exhausted = model_correction_retries >= max_model_correction_retry();
    match outcome {
        AttemptOutcome::ReasoningOnly if !corrections_exhausted => {
            RecoveryAction::RetryReasoningOnly
        }
        AttemptOutcome::ReasoningOnly => {
            RecoveryAction::Fail(ProviderProtocolFailureKind::ReasoningOnlyResponse)
        }
        AttemptOutcome::TerminalEmpty if !corrections_exhausted => {
            RecoveryAction::RetryTerminalEmpty
        }
        AttemptOutcome::TerminalEmpty => {
            RecoveryAction::Fail(ProviderProtocolFailureKind::EmptyAssistantResponse)
        }
        AttemptOutcome::MaxTokensWithToolCalls if !corrections_exhausted => {
            RecoveryAction::RetryIncompleteToolCall
        }
        AttemptOutcome::MaxTokensWithToolCalls => {
            RecoveryAction::Fail(ProviderProtocolFailureKind::IncompleteToolCall)
        }
        AttemptOutcome::ToolUseWithoutCall if !corrections_exhausted => {
            RecoveryAction::RetryMissingToolCall
        }
        AttemptOutcome::ToolUseWithoutCall => {
            RecoveryAction::Fail(ProviderProtocolFailureKind::IncompleteToolCall)
        }
        AttemptOutcome::MaxTokensWithText if continuation_retries < MAX_CONTINUATION_RETRIES => {
            RecoveryAction::ContinueVisibleText
        }
        AttemptOutcome::Refusal | AttemptOutcome::ContentFilter => {
            RecoveryAction::Fail(ProviderProtocolFailureKind::ContentBlocked)
        }
        AttemptOutcome::VisibleText
        | AttemptOutcome::ToolCalls
        | AttemptOutcome::MaxTokensWithText => RecoveryAction::Accept,
    }
}

#[cfg(test)]
mod attempt_recovery_tests {
    use super::*;

    fn reply(
        stop_signal: TurnStopSignal,
        content: Option<&str>,
        reasoning: Option<&str>,
        tool_calls: Vec<ModelToolCall>,
    ) -> ModelReply {
        ModelReply {
            content: content.map(str::to_string),
            reasoning_content: reasoning.map(str::to_string),
            tool_calls,
            ui_message_id: None,
            raw_stop_reason: None,
            provider_replay_protocol: None,
            provider_replay_items: Vec::new(),
            response_meta: ProviderResponseMeta::default(),
            stop_signal,
        }
    }

    #[test]
    fn stop_signals_take_priority_over_partial_payloads() {
        let tool_call = ModelToolCall {
            id: "call-1".to_string(),
            name: "read".to_string(),
            arguments: json!({}),
        };
        assert_eq!(
            classify_attempt_outcome(&reply(
                TurnStopSignal::ContentFilter,
                Some("partial"),
                None,
                vec![tool_call],
            )),
            AttemptOutcome::ContentFilter
        );
        assert_eq!(
            classify_attempt_outcome(&reply(
                TurnStopSignal::Refusal,
                Some("partial"),
                None,
                Vec::new(),
            )),
            AttemptOutcome::Refusal
        );
        assert_eq!(
            classify_attempt_outcome(&reply(
                TurnStopSignal::ToolUse,
                Some("I will call it"),
                None,
                Vec::new(),
            )),
            AttemptOutcome::ToolUseWithoutCall
        );
    }

    #[test]
    fn semantic_recovery_shares_one_bounded_correction_budget() {
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::ReasoningOnly, 0, 4),
            RecoveryAction::RetryReasoningOnly
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::ReasoningOnly, 3, 0),
            RecoveryAction::Fail(ProviderProtocolFailureKind::ReasoningOnlyResponse)
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::TerminalEmpty, 2, 4),
            RecoveryAction::RetryTerminalEmpty
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::TerminalEmpty, 3, 0),
            RecoveryAction::Fail(ProviderProtocolFailureKind::EmptyAssistantResponse)
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::MaxTokensWithToolCalls, 0, 0),
            RecoveryAction::RetryIncompleteToolCall
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::MaxTokensWithToolCalls, 3, 0),
            RecoveryAction::Fail(ProviderProtocolFailureKind::IncompleteToolCall)
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::MaxTokensWithText, 0, 3),
            RecoveryAction::ContinueVisibleText
        );
        assert_eq!(
            recovery_action_for_attempt(AttemptOutcome::MaxTokensWithText, 0, 4),
            RecoveryAction::Accept
        );
    }
}

pub(crate) fn provider_protocol_step(
    request: &ModelRequest,
    turn_id: &str,
    reply: &ModelReply,
    tool_calls: &[ModelToolCall],
    status: &str,
    tool_results: Vec<Value>,
    auxiliary_messages_before_assistant: Vec<Value>,
) -> Value {
    let protocol_id = provider_protocol_id(request);
    let replay = (reply.provider_replay_protocol.as_deref() == Some(protocol_id.as_str())
        && !reply.provider_replay_items.is_empty())
    .then(|| {
        json!({
            "protocol": protocol_id,
            "items": reply.provider_replay_items,
        })
    })
    .unwrap_or(Value::Null);
    json!({
        "version": 2,
        "turnId": turn_id,
        "origin": {
            "providerId": request.provider.id,
            "routeId": request.provider.route_id,
            "protocolId": protocol_id,
            "model": request.model,
        },
        "status": status,
        "assistant": {
            "content": reply.content.clone().unwrap_or_default(),
            "reasoning": reply.reasoning_content.as_deref().map(|text| {
                crate::native_backend::activity::truncate_bytes(
                    text,
                    crate::native_backend::activity::PROVIDER_TRANSCRIPT_TEXT_MAX_BYTES,
                )
            }).unwrap_or_default(),
            "toolCalls": tool_calls.iter().map(|call| json!({
                "id": call.id,
                "name": call.name,
                "arguments": call.arguments,
            })).collect::<Vec<_>>(),
            "rawStopReason": reply.raw_stop_reason,
            "stopSignal": reply.stop_signal.label(),
            "responseId": reply.response_meta.response_id,
        },
        "toolResults": tool_results,
        "auxiliaryMessagesBeforeAssistant": auxiliary_messages_before_assistant,
        "auxiliaryMessagesAfterToolResults": [],
        "replay": replay,
    })
}

pub(super) fn attach_assistant_replay(message: &mut Value, reply: &ModelReply) {
    if let Some(protocol) = reply.provider_replay_protocol.as_ref()
        && protocol != openai_responses::PROTOCOL_ID
        && !reply.provider_replay_items.is_empty()
    {
        message["lyraProviderReplay"] =
            json!({"protocol":protocol,"items":reply.provider_replay_items});
    }
    if let Some(reasoning) = reply.reasoning_content.as_ref() {
        message["reasoning_content"] = json!(reasoning);
    }
}

pub(super) fn take_provider_protocol_auxiliary_messages(
    provider_transcript: &[Value],
    cursor: &mut usize,
) -> Vec<Value> {
    let start = (*cursor).min(provider_transcript.len());
    *cursor = provider_transcript.len();
    provider_transcript[start..]
        .iter()
        .filter(|message| {
            matches!(
                message.get("role").and_then(Value::as_str),
                Some("user" | "system" | "developer")
            ) && message.get("content").is_some()
                && message.get("lyraAttemptLocal").and_then(Value::as_bool) != Some(true)
        })
        .map(|message| {
            let mut persisted = json!({
                "role": message.get("role").cloned().unwrap_or_else(|| json!("user")),
                "content": message.get("content").cloned().unwrap_or(Value::Null),
            });
            if let Some(meta) = message.get("lyraVisualEvidence") {
                persisted["lyraVisualEvidence"] = meta.clone();
            }
            crate::native_backend::activity::bound_provider_transcript_message(&persisted)
        })
        .collect()
}

pub(super) fn append_truncated_tool_call_recovery(
    messages: &mut Vec<Value>,
    overlay_start: &mut Option<usize>,
    reply: &ModelReply,
) {
    begin_attempt_local_overlay(messages, overlay_start);
    let response_replay_items =
        if reply.provider_replay_protocol.as_deref() == Some(openai_responses::PROTOCOL_ID) {
            retained_provider_replay_items(&reply.provider_replay_items, &reply.tool_calls)
        } else {
            Vec::new()
        };
    if !response_replay_items.is_empty() {
        messages.extend(response_replay_items);
    }
    let assistant_tool_calls = reply
        .tool_calls
        .iter()
        .map(|call| {
            json!({
                "id": call.id,
                "type": "function",
                "function": {
                    "name": call.name,
                    "arguments": serde_json::to_string(&call.arguments)
                        .unwrap_or_else(|_| "{}".to_string()),
                }
            })
        })
        .collect::<Vec<_>>();
    let mut assistant_message = json!({
        "role": "assistant",
        "content": reply.content.clone().unwrap_or_default(),
        "tool_calls": assistant_tool_calls,
        "lyraAttemptLocal": true,
    });
    if reply.provider_replay_protocol.as_deref() == Some(openai_responses::PROTOCOL_ID)
        && !reply.provider_replay_items.is_empty()
    {
        assistant_message["openaiResponsesShadow"] = Value::Bool(true);
    }
    attach_assistant_replay(&mut assistant_message, reply);
    messages.push(assistant_message);
    for call in &reply.tool_calls {
        let content = "This tool call was not executed because the provider ended at the output-token limit. Reissue the complete tool call with valid arguments.";
        let mut tool_message = json!({
            "role": "tool",
            "tool_call_id": call.id,
            "content": content,
            "lyraAttemptLocal": true,
        });
        if reply.provider_replay_protocol.as_deref() == Some(openai_responses::PROTOCOL_ID)
            && !reply.provider_replay_items.is_empty()
        {
            tool_message["openaiResponsesShadow"] = Value::Bool(true);
            messages.push(openai_responses::function_call_output_item(
                &call.id,
                content.to_string(),
            ));
        }
        messages.push(tool_message);
    }
    append_attempt_local_context_update(
        messages,
        overlay_start,
        "truncated-tool-call-recovery",
        "No tool from the truncated response was executed. Reissue the required tool call completely; do not continue or reference the truncated call.",
    );
}
