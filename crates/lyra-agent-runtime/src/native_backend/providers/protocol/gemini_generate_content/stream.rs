use std::{io::BufRead, time::Instant};

use serde_json::Value;

use tokio_util::sync::CancellationToken;

use crate::{
    AgentRuntimeError, AgentRuntimeResult, ProviderTransportKind,
    native_backend::{
        provider::{ModelReply, ModelToolCall, ProviderResponseMeta},
        turns::{emit_reasoning_delta, emit_visible_delta, turn_was_cancelled},
    },
};

use super::{
    super::openai_common::{AsyncSseReader, SseEvent, SseReader},
    response::{
        reasoning_from_parts, response_meta, stop_signal_from_finish_reason, text_from_parts,
        tool_calls_from_parts,
    },
};

#[derive(Default)]
struct GeminiStreamState {
    text: String,
    reasoning: String,
    tool_calls: Vec<ModelToolCall>,
    replay_items: Vec<Value>,
    finish_reason: Option<String>,
    response_meta: ProviderResponseMeta,
}

pub(crate) fn parse_streaming_response<R: BufRead>(
    reader: R,
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tools: &[Value],
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    let mut state = GeminiStreamState::default();
    let mut ui_message_id: Option<String> = None;

    let buffer_assistant_text = false;
    let started_at = Instant::now();

    for event in SseReader::new(reader) {
        if cancellation.is_cancelled()
            || (!session_id.is_empty()
                && !turn_id.is_empty()
                && turn_was_cancelled(session_id, turn_id))
        {
            return Err(AgentRuntimeError::Cancelled);
        }
        if crate::native_backend::provider::provider_streaming_total_deadline_exceeded(started_at) {
            return Err(crate::native_backend::provider::provider_streaming_total_timeout_error());
        }
        let event = event?;
        let SseEvent::Data(chunk) = event else {
            break;
        };
        map_stream_chunk(
            &chunk,
            &mut state,
            &mut ui_message_id,
            buffer_assistant_text,
            session_id,
            turn_id,
            tools,
        )?;
    }

    finish_streaming_reply(
        state,
        ui_message_id,
        session_id,
        turn_id,
        commit_assistant_text,
    )
}

pub(crate) async fn parse_streaming_response_async(
    response: reqwest::Response,
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tools: &[Value],
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    let mut state = GeminiStreamState::default();
    let mut ui_message_id: Option<String> = None;

    let buffer_assistant_text = false;
    let started_at = Instant::now();

    let mut reader = AsyncSseReader::new(response.bytes_stream());
    while let Some(event) = reader.next_event(cancellation).await {
        if cancellation.is_cancelled()
            || (!session_id.is_empty()
                && !turn_id.is_empty()
                && turn_was_cancelled(session_id, turn_id))
        {
            return Err(AgentRuntimeError::Cancelled);
        }
        if crate::native_backend::provider::provider_streaming_total_deadline_exceeded(started_at) {
            return Err(crate::native_backend::provider::provider_streaming_total_timeout_error());
        }
        let event = event?;
        let SseEvent::Data(chunk) = event else {
            break;
        };
        map_stream_chunk(
            &chunk,
            &mut state,
            &mut ui_message_id,
            buffer_assistant_text,
            session_id,
            turn_id,
            tools,
        )?;
    }

    finish_streaming_reply(
        state,
        ui_message_id,
        session_id,
        turn_id,
        commit_assistant_text,
    )
}

fn map_stream_chunk(
    chunk: &Value,
    state: &mut GeminiStreamState,
    ui_message_id: &mut Option<String>,
    buffer_assistant_text: bool,
    session_id: &str,
    turn_id: &str,
    tools: &[Value],
) -> AgentRuntimeResult<()> {
    if let Some(error) = chunk.get("error") {
        return Err(crate::native_backend::providers::errors::stream_error(
            super::PROTOCOL_ID,
            error,
        ));
    }
    if let Some(block_reason) = chunk
        .pointer("/promptFeedback/blockReason")
        .and_then(Value::as_str)
    {
        return Err(crate::native_backend::providers::errors::protocol_error(
            crate::ProviderProtocolFailureKind::ContentBlocked,
            format!("provider blocked the prompt with reason `{block_reason}`"),
        ));
    }
    state.response_meta.merge(response_meta(chunk));
    if chunk
        .get("candidates")
        .is_some_and(|candidates| !candidates.is_array())
    {
        return Err(crate::native_backend::providers::errors::protocol_error(
            crate::ProviderProtocolFailureKind::ProviderErrorEnvelope,
            "provider returned a malformed Gemini candidates envelope",
        ));
    }
    for candidate in chunk
        .get("candidates")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if !candidate.is_object()
            || candidate
                .get("content")
                .is_some_and(|content| !content.is_object())
            || candidate
                .pointer("/content/parts")
                .is_some_and(|parts| !parts.is_array())
        {
            return Err(crate::native_backend::providers::errors::protocol_error(
                crate::ProviderProtocolFailureKind::ProviderErrorEnvelope,
                "provider returned a malformed Gemini candidate envelope",
            ));
        }
        if let Some(finish_reason) = candidate.get("finishReason").and_then(Value::as_str)
            && !finish_reason.trim().is_empty()
        {
            state.finish_reason = Some(finish_reason.to_string());
        }
        let parts = candidate
            .pointer("/content/parts")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        state.replay_items.extend(parts.iter().cloned());
        if let Some(text) = text_from_parts(&parts) {
            append_text_delta(
                &text,
                state,
                ui_message_id,
                buffer_assistant_text,
                session_id,
                turn_id,
            )?;
        }
        if let Some(reasoning) = reasoning_from_parts(&parts) {
            append_reasoning_delta(&reasoning, state, ui_message_id, session_id, turn_id)?;
        }
        state
            .tool_calls
            .extend(tool_calls_from_parts(&parts, tools)?);
    }
    Ok(())
}

fn finish_streaming_reply(
    state: GeminiStreamState,
    ui_message_id: Option<String>,
    session_id: &str,
    turn_id: &str,
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    if state.finish_reason.is_none() {
        return Err(AgentRuntimeError::ProviderTransport {
            kind: ProviderTransportKind::StreamInterrupted,
            detail: "Gemini stream ended before a candidate finishReason".to_string(),
        });
    }
    let streamed_message_id = ui_message_id.filter(|id| !id.is_empty());
    let stop_signal = stop_signal_from_finish_reason(state.finish_reason.as_deref())?;
    let mut reply = ModelReply {
        content: (!state.text.trim().is_empty()).then_some(state.text),
        reasoning_content: (!state.reasoning.trim().is_empty()).then_some(state.reasoning),
        tool_calls: state.tool_calls,
        ui_message_id: streamed_message_id.clone(),
        raw_stop_reason: state.finish_reason,
        provider_replay_protocol: Some("gemini_generate_content".to_string()),
        provider_replay_items: state.replay_items,
        response_meta: state.response_meta,
        stop_signal,
    };
    if commit_assistant_text {
        crate::native_backend::turns::commit_visible_assistant_reply(
            session_id,
            turn_id,
            &mut reply,
            &streamed_message_id,
        );
    } else {
        reply.ui_message_id = streamed_message_id;
    }
    Ok(reply)
}

fn append_text_delta(
    text: &str,
    state: &mut GeminiStreamState,
    ui_message_id: &mut Option<String>,
    buffer_assistant_text: bool,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<()> {
    if text.is_empty() {
        return Ok(());
    }
    if !buffer_assistant_text {
        emit_visible_delta(text, ui_message_id, session_id, turn_id)?;
    }
    state.text.push_str(text);
    Ok(())
}

fn append_reasoning_delta(
    reasoning: &str,
    state: &mut GeminiStreamState,
    ui_message_id: &mut Option<String>,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<()> {
    if reasoning.is_empty() {
        return Ok(());
    }
    emit_reasoning_delta(reasoning, ui_message_id, session_id, turn_id)?;
    state.reasoning.push_str(reasoning);
    Ok(())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_streaming_text_and_function_call_chunks() {
        let stream = [
            r#"data: {"candidates":[{"content":{"parts":[{"text":"Plan."}]}}]}"#,
            r#"data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"tool_fs_run","args":{"path":"/tools/workbench/list_tabs","args":{}}}}]},"finishReason":"STOP"}],"responseId":"gemini-stream-1","usageMetadata":{"promptTokenCount":80,"cachedContentTokenCount":50,"candidatesTokenCount":10,"thoughtsTokenCount":2}}"#,
            "data: [DONE]",
        ]
        .join("\n\n");

        let reply = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[json!({ "type": "function", "function": { "name": "tool_fs_run" } })],
            false,
        )
        .expect("reply");

        assert_eq!(reply.content.as_deref(), Some("Plan."));
        assert_eq!(reply.tool_calls[0].name, "tool_fs_run");
        assert_eq!(
            reply.tool_calls[0].arguments["path"],
            "/tools/workbench/list_tabs"
        );
        assert_eq!(
            reply.response_meta.response_id.as_deref(),
            Some("gemini-stream-1")
        );
        assert_eq!(reply.response_meta.usage.input_uncached_tokens, Some(30));
        assert_eq!(reply.response_meta.usage.reasoning_tokens, Some(2));
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("STOP"));
        assert_eq!(
            reply.provider_replay_protocol.as_deref(),
            Some("gemini_generate_content")
        );
    }

    #[test]
    fn preserves_streamed_parts_in_provider_order() {
        let stream = [
            r#"data: {"candidates":[{"content":{"parts":[{"text":"Done."}]}}]}"#,
            r#"data: {"candidates":[{"content":{"parts":[{"text":"","thoughtSignature":"signed-empty-text"},{"functionCall":{"name":"tool_fs_run","args":{}},"thoughtSignature":"signed-function-call"}]},"finishReason":"STOP"}]}"#,
            "data: [DONE]",
        ]
        .join("\n\n");

        let reply = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[json!({ "type": "function", "function": { "name": "tool_fs_run" } })],
            false,
        )
        .expect("reply");

        assert_eq!(
            reply.provider_replay_items,
            vec![
                json!({ "text": "Done." }),
                json!({
                    "text": "",
                    "thoughtSignature": "signed-empty-text"
                }),
                json!({
                    "functionCall": {
                        "name": "tool_fs_run",
                        "args": {}
                    },
                    "thoughtSignature": "signed-function-call"
                }),
            ]
        );
    }

    #[test]
    fn preserves_distinct_identical_function_calls() {
        let stream = [
            r#"data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"tool_fs_run","args":{"path":"/tools/workbench/list_tabs"}}},{"functionCall":{"name":"tool_fs_run","args":{"path":"/tools/workbench/list_tabs"}}}]},"finishReason":"STOP"}]}"#,
            "data: [DONE]",
        ]
        .join("\n\n");

        let reply = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[json!({ "type": "function", "function": { "name": "tool_fs_run" } })],
            false,
        )
        .expect("reply");

        assert_eq!(reply.tool_calls.len(), 2);
        assert_ne!(reply.tool_calls[0].id, reply.tool_calls[1].id);
    }

    #[test]
    fn reasoning_only_max_tokens_stream_is_returned() {
        let stream = [
            r#"data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"Still thinking.","thoughtSignature":"signed"}]}}]}"#,
            r#"data: {"candidates":[{"content":{"parts":[]},"finishReason":"MAX_TOKENS"}],"responseId":"gemini-reasoning","usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":9,"thoughtsTokenCount":9}}"#,
        ]
        .join("\n\n");

        let reply = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[],
            false,
        )
        .expect("reasoning-only reply");

        assert!(reply.content.is_none());
        assert_eq!(reply.reasoning_content.as_deref(), Some("Still thinking."));
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("MAX_TOKENS"));
        assert_eq!(reply.response_meta.usage.output_tokens, Some(9));
        assert_eq!(reply.provider_replay_items[0]["thoughtSignature"], "signed");
    }

    #[test]
    fn terminal_empty_stream_is_returned_to_the_loop() {
        let stream = r#"data: {"candidates":[{"content":{"parts":[]},"finishReason":"STOP"}],"usageMetadata":{"candidatesTokenCount":0}}"#;

        let reply = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[],
            false,
        )
        .expect("terminal-empty reply");

        assert!(reply.content.is_none());
        assert!(reply.reasoning_content.is_none());
        assert!(reply.tool_calls.is_empty());
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("STOP"));
        assert_eq!(reply.response_meta.usage.output_tokens, Some(0));
    }

    #[test]
    fn stream_without_finish_reason_is_interrupted() {
        let stream = [
            r#"data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}"#,
            "data: [DONE]",
        ]
        .join("\n\n");

        let error = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[],
            false,
        )
        .expect_err("missing finishReason");

        assert!(matches!(
            error,
            AgentRuntimeError::ProviderTransport {
                kind: ProviderTransportKind::StreamInterrupted,
                ..
            }
        ));
    }
}
