use std::{
    collections::{BTreeMap, HashMap},
    io::BufRead,
    time::Instant,
};

use serde_json::{Value, json};

use tokio_util::sync::CancellationToken;

use crate::{
    AgentRuntimeError, AgentRuntimeResult, ProviderTransportKind,
    native_backend::{
        provider::{ModelReply, ProviderResponseMeta},
        turns::{emit_reasoning_delta, emit_visible_delta, turn_was_cancelled},
    },
};

use super::{
    super::openai_common::{AsyncSseReader, SseEvent, SseReader, parse_tool_arguments},
    response::{
        provider_replay_items_from_content_blocks, response_meta, text_from_content_blocks,
        thinking_from_content_blocks, tool_calls_from_content_blocks,
    },
};

#[derive(Clone, Debug, Default)]
struct ToolUseDraft {
    input_json: String,
}

#[derive(Default)]
struct AnthropicStreamState {
    content_blocks: BTreeMap<usize, Value>,
    tool_uses: HashMap<usize, ToolUseDraft>,
    stop_reason: Option<String>,
    saw_message_stop: bool,
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
    let mut state = AnthropicStreamState::default();
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
        let SseEvent::Data(event) = event else {
            break;
        };
        map_stream_event(
            &event,
            &mut state,
            &mut ui_message_id,
            buffer_assistant_text,
            session_id,
            turn_id,
        )?;
    }

    finish_streaming_reply(
        state,
        ui_message_id,
        session_id,
        turn_id,
        tools,
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
    let mut state = AnthropicStreamState::default();
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
        let SseEvent::Data(event) = event else {
            break;
        };
        map_stream_event(
            &event,
            &mut state,
            &mut ui_message_id,
            buffer_assistant_text,
            session_id,
            turn_id,
        )?;
        use crate::native_backend::provider::streaming_tools;
        match event.get("type").and_then(Value::as_str) {
            Some("content_block_start") => {
                let block = &event["content_block"];
                if block["type"] == "tool_use" {
                    streaming_tools::declare(
                        block["id"].as_str().unwrap_or_default(),
                        block["name"].as_str().unwrap_or_default(),
                    );
                }
            }
            Some("content_block_stop") => {
                if let Some(index) = event["index"].as_u64().map(|v| v as usize) {
                    if let Some(mut block) = state
                        .content_blocks
                        .get(&index)
                        .cloned()
                        .filter(|v| v["type"] == "tool_use")
                    {
                        if let Some(draft) = state
                            .tool_uses
                            .get(&index)
                            .filter(|draft| !draft.input_json.is_empty())
                        {
                            block["input"] = parse_tool_arguments(&draft.input_json);
                        }
                        if block["input"].get("parseError").is_none() {
                            if let Ok(calls) = tool_calls_from_content_blocks(&[block], tools) {
                                for call in calls {
                                    streaming_tools::complete(call, &mut ui_message_id);
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    finish_streaming_reply(
        state,
        ui_message_id,
        session_id,
        turn_id,
        tools,
        commit_assistant_text,
    )
}

fn map_stream_event(
    event: &Value,
    state: &mut AnthropicStreamState,
    ui_message_id: &mut Option<String>,
    buffer_assistant_text: bool,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<()> {
    let event_type = event.get("type").and_then(Value::as_str).ok_or_else(|| {
        crate::native_backend::providers::errors::protocol_error(
            crate::ProviderProtocolFailureKind::ProviderErrorEnvelope,
            "provider returned a malformed Anthropic stream event",
        )
    })?;
    state.response_meta.merge(response_meta(event));
    if let Some(message) = event.get("message") {
        state.response_meta.merge(response_meta(message));
        if let Some(blocks) = message.get("content").and_then(Value::as_array) {
            for (index, block) in blocks.iter().enumerate() {
                capture_content_block(index, block, state);
            }
        }
    }
    match event_type {
        "content_block_start" => {
            let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            let block = event
                .get("content_block")
                .filter(|block| block.is_object())
                .ok_or_else(|| {
                    crate::native_backend::providers::errors::protocol_error(
                        crate::ProviderProtocolFailureKind::ProviderErrorEnvelope,
                        "provider returned a malformed Anthropic content_block_start event",
                    )
                })?;
            capture_content_block(index, block, state);
            if block.get("type").and_then(Value::as_str) == Some("tool_use") {
                state.tool_uses.entry(index).or_default();
            }
            match block.get("type").and_then(Value::as_str) {
                Some("text") => {
                    if let Some(text) = block.get("text").and_then(Value::as_str) {
                        append_text_delta(
                            text,
                            ui_message_id,
                            buffer_assistant_text,
                            session_id,
                            turn_id,
                        )?;
                    }
                }
                Some("thinking") => {
                    if let Some(thinking) = block.get("thinking").and_then(Value::as_str) {
                        emit_reasoning_delta(thinking, ui_message_id, session_id, turn_id)?;
                    }
                }
                _ => {}
            }
        }
        "content_block_delta" => {
            let index = event.get("index").and_then(Value::as_u64).unwrap_or(0) as usize;
            let delta = event
                .get("delta")
                .filter(|delta| delta.is_object())
                .ok_or_else(|| {
                    crate::native_backend::providers::errors::protocol_error(
                        crate::ProviderProtocolFailureKind::ProviderErrorEnvelope,
                        "provider returned a malformed Anthropic content_block_delta event",
                    )
                })?;
            match delta.get("type").and_then(Value::as_str) {
                Some("thinking_delta") => {
                    if let Some(thinking) = delta.get("thinking").and_then(Value::as_str) {
                        append_content_block_string(state, index, "thinking", "thinking", thinking);
                        emit_reasoning_delta(thinking, ui_message_id, session_id, turn_id)?;
                    }
                }
                Some("text_delta") => {
                    let text = delta
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    append_content_block_string(state, index, "text", "text", text);
                    append_text_delta(
                        text,
                        ui_message_id,
                        buffer_assistant_text,
                        session_id,
                        turn_id,
                    )?;
                }
                Some("signature_delta") => {
                    if let Some(signature) = delta.get("signature").and_then(Value::as_str) {
                        append_content_block_string(
                            state,
                            index,
                            "thinking",
                            "signature",
                            signature,
                        );
                    }
                }
                Some("input_json_delta") => {
                    let draft = state.tool_uses.entry(index).or_default();
                    if let Some(partial) = delta.get("partial_json").and_then(Value::as_str) {
                        draft.input_json.push_str(partial);
                    }

                    let block = state.content_blocks.get(&index).unwrap_or(&Value::Null);
                    if let (Some(tool_call_id), Some(tool_name)) = (
                        block.get("id").and_then(Value::as_str),
                        block.get("name").and_then(Value::as_str),
                    ) {
                        crate::native_backend::tools::maybe_emit_streaming_diff_preview(
                            session_id,
                            turn_id,
                            tool_call_id,
                            tool_name,
                            &draft.input_json,
                        );
                    }
                }
                _ => {}
            }
        }
        "message_delta" => {
            if let Some(stop_reason) = event.pointer("/delta/stop_reason").and_then(Value::as_str)
                && !stop_reason.trim().is_empty()
            {
                state.stop_reason = Some(stop_reason.to_string());
            }
        }
        "message_stop" => {
            state.saw_message_stop = true;
        }
        "error" => {
            return Err(crate::native_backend::providers::errors::stream_error(
                super::PROTOCOL_ID,
                event,
            ));
        }
        _ => {}
    }
    Ok(())
}

fn capture_content_block(index: usize, block: &Value, state: &mut AnthropicStreamState) {
    if matches!(
        block.get("type").and_then(Value::as_str),
        Some("text" | "tool_use" | "thinking" | "redacted_thinking")
    ) {
        state.content_blocks.insert(index, block.clone());
    }
}

fn append_content_block_string(
    state: &mut AnthropicStreamState,
    index: usize,
    block_type: &str,
    field: &str,
    delta: &str,
) {
    let block = state.content_blocks.entry(index).or_insert_with(|| {
        let mut block = json!({ "type": block_type });
        block[field] = Value::String(String::new());
        block
    });
    if block.get("type").and_then(Value::as_str) != Some(block_type) {
        return;
    }
    let mut value = block
        .get(field)
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    value.push_str(delta);
    block[field] = Value::String(value);
}

fn append_text_delta(
    text: &str,
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
    Ok(())
}

fn finish_streaming_reply(
    mut state: AnthropicStreamState,
    ui_message_id: Option<String>,
    session_id: &str,
    turn_id: &str,
    tools: &[Value],
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    if !state.saw_message_stop {
        return Err(AgentRuntimeError::ProviderTransport {
            kind: ProviderTransportKind::StreamInterrupted,
            detail: "Anthropic stream ended before message_stop".to_string(),
        });
    }
    for (index, draft) in state.tool_uses {
        if draft.input_json.is_empty() {
            continue;
        }
        let Some(block) = state.content_blocks.get_mut(&index) else {
            continue;
        };
        if block.get("type").and_then(Value::as_str) == Some("tool_use") {
            let input = parse_tool_arguments(&draft.input_json);
            if input.get("parseError").is_some() {
                return Err(crate::native_backend::providers::errors::protocol_error(
                    crate::ProviderProtocolFailureKind::IncompleteToolCall,
                    "provider returned truncated Anthropic tool input",
                ));
            }
            block["input"] = input;
        }
    }

    let content_blocks = state.content_blocks.into_values().collect::<Vec<_>>();
    let provider_replay_items = provider_replay_items_from_content_blocks(&content_blocks);
    let content = text_from_content_blocks(&provider_replay_items);
    let reasoning_content = thinking_from_content_blocks(&provider_replay_items);
    let tool_calls = tool_calls_from_content_blocks(&provider_replay_items, tools)?;

    let streamed_message_id = ui_message_id.filter(|id| !id.is_empty());
    let stop_signal =
        crate::native_backend::provider::TurnStopSignal::from_raw(state.stop_reason.as_deref());
    let mut reply = ModelReply {
        content,
        reasoning_content,
        tool_calls,
        ui_message_id: streamed_message_id.clone(),
        raw_stop_reason: state.stop_reason,
        provider_replay_protocol: Some("anthropic_messages".to_string()),
        provider_replay_items,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_streaming_text_and_tool_use_events() {
        let stream = [
            r#"data: {"type":"message_start","message":{"id":"msg-1","type":"message","usage":{"input_tokens":20,"cache_creation_input_tokens":30,"cache_read_input_tokens":50,"output_tokens":1}}}"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Plan."}}"#,
            r#"data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"call-tabs","name":"tool_fs_run","input":{}}}"#,
            r#"data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"/tools/workbench/list_tabs\",\"args\":{}}"}}"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":12}}"#,
            r#"data: {"type":"message_stop"}"#,
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
        assert_eq!(reply.tool_calls[0].id, "call-tabs");
        assert_eq!(reply.tool_calls[0].name, "tool_fs_run");
        assert_eq!(
            reply.tool_calls[0].arguments["path"],
            "/tools/workbench/list_tabs"
        );
        assert_eq!(reply.response_meta.response_id.as_deref(), Some("msg-1"));
        assert_eq!(reply.response_meta.usage.input_total_tokens, Some(100));
        assert_eq!(reply.response_meta.usage.output_tokens, Some(12));
        assert_eq!(
            reply.provider_replay_protocol.as_deref(),
            Some("anthropic_messages")
        );
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("tool_use"));
        assert_eq!(
            reply.provider_replay_items,
            vec![
                json!({ "type": "text", "text": "Plan." }),
                json!({
                    "type": "tool_use",
                    "id": "call-tabs",
                    "name": "tool_fs_run",
                    "input": {
                        "path": "/tools/workbench/list_tabs",
                        "args": {}
                    }
                })
            ]
        );
    }

    #[test]
    fn parses_streaming_thinking_text_and_tool_use_events() {
        let stream = [
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Inspect tabs."}}"#,
            r#"data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Plan."}}"#,
            r#"data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"call-tabs","name":"tool_fs_run","input":{}}}"#,
            r#"data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\"path\":\"/tools/workbench/list_tabs\",\"args\":{}}"}}"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}"#,
            r#"data: {"type":"message_stop"}"#,
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

        assert_eq!(reply.reasoning_content.as_deref(), Some("Inspect tabs."));
        assert_eq!(reply.content.as_deref(), Some("Plan."));
        assert_eq!(reply.tool_calls[0].id, "call-tabs");
    }

    #[test]
    fn streaming_replay_preserves_order_signatures_redactions_and_empty_text() {
        let stream = [
            r#"data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Inspect first."}}"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-provider"}}"#,
            r#"data: {"type":"content_block_start","index":1,"content_block":{"type":"redacted_thinking","data":"opaque-provider-data"}}"#,
            r#"data: {"type":"content_block_start","index":2,"content_block":{"type":"text","text":""}}"#,
            r#"data: {"type":"content_block_start","index":3,"content_block":{"type":"tool_use","id":"call-z","name":"tool_fs_run","input":{}}}"#,
            r#"data: {"type":"content_block_delta","index":3,"delta":{"type":"input_json_delta","partial_json":"{\"order\":\"first\"}"}}"#,
            r#"data: {"type":"content_block_start","index":4,"content_block":{"type":"tool_use","id":"call-a","name":"tool_fs_run","input":{}}}"#,
            r#"data: {"type":"content_block_delta","index":4,"delta":{"type":"input_json_delta","partial_json":"{\"order\":\"second\"}"}}"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"tool_use"}}"#,
            r#"data: {"type":"message_stop"}"#,
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
                json!({
                    "type": "thinking",
                    "thinking": "Inspect first.",
                    "signature": "sig-provider"
                }),
                json!({
                    "type": "redacted_thinking",
                    "data": "opaque-provider-data"
                }),
                json!({ "type": "text", "text": "" }),
                json!({
                    "type": "tool_use",
                    "id": "call-z",
                    "name": "tool_fs_run",
                    "input": { "order": "first" }
                }),
                json!({
                    "type": "tool_use",
                    "id": "call-a",
                    "name": "tool_fs_run",
                    "input": { "order": "second" }
                }),
            ]
        );
        assert_eq!(reply.reasoning_content.as_deref(), Some("Inspect first."));
        assert!(reply.content.is_none());
        assert_eq!(
            reply
                .tool_calls
                .iter()
                .map(|call| call.id.as_str())
                .collect::<Vec<_>>(),
            vec!["call-z", "call-a"]
        );
    }

    #[test]
    fn reasoning_only_max_tokens_is_returned_with_usage() {
        let stream = [
            r#"data: {"type":"message_start","message":{"id":"msg-reasoning","usage":{"input_tokens":3,"output_tokens":1}}}"#,
            r#"data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"","signature":""}}"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Still working."}}"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"signed"}}"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"},"usage":{"output_tokens":8}}"#,
            r#"data: {"type":"message_stop"}"#,
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
        assert_eq!(reply.reasoning_content.as_deref(), Some("Still working."));
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("max_tokens"));
        assert_eq!(reply.response_meta.usage.output_tokens, Some(8));
        assert_eq!(reply.provider_replay_items[0]["signature"], "signed");
    }

    #[test]
    fn terminal_empty_stream_is_returned_to_the_loop() {
        let stream = [
            r#"data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":0}}"#,
            r#"data: {"type":"message_stop"}"#,
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
        .expect("terminal-empty reply");

        assert!(reply.content.is_none());
        assert!(reply.reasoning_content.is_none());
        assert!(reply.tool_calls.is_empty());
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("end_turn"));
        assert_eq!(reply.response_meta.usage.output_tokens, Some(0));
    }

    #[test]
    fn missing_message_stop_is_a_stream_interruption() {
        let stream = [
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"partial"}}"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}"#,
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
        .expect_err("missing message_stop");

        assert!(matches!(
            error,
            AgentRuntimeError::ProviderTransport {
                kind: ProviderTransportKind::StreamInterrupted,
                ..
            }
        ));
    }

    #[test]
    fn truncated_streamed_tool_input_is_rejected() {
        let stream = [
            r#"data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"call-1","name":"tool_fs_run","input":{}}}"#,
            r#"data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"path\":"}}"#,
            r#"data: {"type":"message_delta","delta":{"stop_reason":"max_tokens"}}"#,
            r#"data: {"type":"message_stop"}"#,
        ]
        .join("\n\n");

        let error = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[json!({ "type": "function", "function": { "name": "tool_fs_run" } })],
            false,
        )
        .expect_err("truncated tool input");

        assert!(matches!(
            error,
            AgentRuntimeError::ProviderProtocol {
                kind: crate::ProviderProtocolFailureKind::IncompleteToolCall,
                ..
            }
        ));
    }
}

#[cfg(test)]
mod overload_tests {
    use super::*;
    #[test]
    fn overloaded_error_event_reaches_the_shared_retry_policy() {
        let stream = "event: error\ndata: {\"type\":\"error\",\"error\":{\"type\":\"overloaded_error\",\"message\":\"Overloaded\"}}\n\n";
        let error = parse_streaming_response(
            std::io::Cursor::new(stream),
            "",
            "",
            &CancellationToken::new(),
            &[],
            false,
        )
        .unwrap_err();
        assert!(crate::native_backend::provider::is_retryable_provider_error(&error));
    }
}
