use std::{collections::HashMap, io::BufRead, time::Instant};

use serde_json::{Value, json};

use tokio_util::sync::CancellationToken;

use crate::{
    AgentRuntimeError, AgentRuntimeResult, ProviderTransportKind,
    native_backend::{
        provider::{ModelReply, ProviderResponseMeta, TurnStopSignal},
        turns::{emit_reasoning_delta, emit_visible_delta, turn_was_cancelled},
    },
};

use super::super::openai_common::{AsyncSseReader, SseEvent, SseReader};
use super::response::{
    output_text_from_items, reasoning_text_from_items, refusal_from_items, response_meta,
    tool_calls_from_items, validate_tool_call_items,
};

#[derive(Clone, Debug, Default)]
struct FunctionCallDraft {
    id: Option<String>,
    call_id: Option<String>,
    name: Option<String>,
    arguments: String,
}

#[derive(Default)]
struct ResponsesStreamState {
    text: String,
    reasoning: String,
    refusal: String,
    output_items: Vec<Value>,
    function_calls: HashMap<usize, FunctionCallDraft>,
    function_call_indices: HashMap<String, usize>,
    raw_stop_reason: Option<String>,
    saw_terminal_response: bool,
    stop_signal: TurnStopSignal,
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
    let mut state = ResponsesStreamState::default();
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
    let mut state = ResponsesStreamState::default();
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
        if event.pointer("/item/type").and_then(Value::as_str) == Some("function_call") {
            let item = &event["item"];
            match event["type"].as_str() {
                Some("response.output_item.added") => streaming_tools::declare(
                    item["call_id"].as_str().unwrap_or_default(),
                    item["name"].as_str().unwrap_or_default(),
                ),
                Some("response.output_item.done") => {
                    let items = vec![item.clone()];
                    let calls = tool_calls_from_items(&items, tools);
                    if validate_tool_call_items(&items, &calls, TurnStopSignal::ToolUse).is_ok() {
                        for call in calls {
                            streaming_tools::complete(call, &mut ui_message_id);
                        }
                    }
                }
                _ => {}
            }
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

fn finish_streaming_reply(
    state: ResponsesStreamState,
    ui_message_id: Option<String>,
    session_id: &str,
    turn_id: &str,
    tools: &[Value],
    commit_assistant_text: bool,
) -> AgentRuntimeResult<ModelReply> {
    if !state.saw_terminal_response {
        return Err(AgentRuntimeError::ProviderTransport {
            kind: ProviderTransportKind::StreamInterrupted,
            detail: "OpenAI Responses stream ended before a terminal response event".to_string(),
        });
    }
    let mut replay_items = if state.output_items.is_empty() && !state.text.trim().is_empty() {
        vec![json!({
            "type": "message",
            "role": "assistant",
            "content": [{ "type": "output_text", "text": state.text }],
        })]
    } else {
        state.output_items
    };
    append_missing_function_call_drafts(&mut replay_items, state.function_calls)?;
    if let Some(refusal) = refusal_from_items(&replay_items)
        .or_else(|| (!state.refusal.trim().is_empty()).then_some(state.refusal))
    {
        return Err(crate::native_backend::providers::errors::protocol_error(
            crate::ProviderProtocolFailureKind::ContentBlocked,
            format!("provider refused the request: {refusal}"),
        ));
    }
    let tool_calls = tool_calls_from_items(&replay_items, tools);
    validate_tool_call_items(&replay_items, &tool_calls, state.stop_signal)?;
    let content = output_text_from_items(&replay_items)
        .or_else(|| (!state.text.trim().is_empty()).then_some(state.text));
    let reasoning_content = reasoning_text_from_items(&replay_items)
        .or_else(|| (!state.reasoning.trim().is_empty()).then_some(state.reasoning));
    let streamed_message_id = ui_message_id.filter(|id| !id.is_empty());
    let mut reply = ModelReply {
        content,
        reasoning_content,
        tool_calls,
        ui_message_id: streamed_message_id.clone(),
        raw_stop_reason: state.raw_stop_reason,
        provider_replay_protocol: Some(super::PROTOCOL_ID.to_string()),
        provider_replay_items: replay_items,
        response_meta: state.response_meta,
        stop_signal: state.stop_signal,
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

fn map_stream_event(
    event: &Value,
    state: &mut ResponsesStreamState,
    ui_message_id: &mut Option<String>,
    buffer_assistant_text: bool,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<()> {
    if let Some(response) = event.get("response") {
        state.response_meta.merge(response_meta(response));
    }
    if let Some(response_id) = event
        .get("response_id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        state.response_meta.response_id = Some(response_id.to_string());
    }
    match event.get("type").and_then(Value::as_str) {
        Some("response.output_text.delta") => {
            let delta = event
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if delta.is_empty() {
                return Ok(());
            }
            if !buffer_assistant_text {
                emit_visible_delta(delta, ui_message_id, session_id, turn_id)?;
            }
            state.text.push_str(delta);
        }
        Some("response.reasoning_summary_text.delta" | "response.reasoning_text.delta") => {
            let delta = event
                .get("delta")
                .and_then(Value::as_str)
                .unwrap_or_default();
            if !delta.is_empty() {
                state.reasoning.push_str(delta);
                emit_reasoning_delta(delta, ui_message_id, session_id, turn_id)?;
            }
        }
        Some("response.refusal.delta") => {
            if let Some(delta) = event.get("delta").and_then(Value::as_str) {
                state.refusal.push_str(delta);
            }
        }
        Some("response.output_item.added") => {
            if let Some(item) = event.get("item") {
                capture_function_call_draft(event, item, state);
            }
        }
        Some("response.function_call_arguments.delta") => {
            let index = function_call_index_for_event(event, state);
            let draft = state.function_calls.entry(index).or_default();
            if let Some(delta) = event.get("delta").and_then(Value::as_str) {
                draft.arguments.push_str(delta);
            }

            let tool_call_id = draft
                .call_id
                .as_deref()
                .or(draft.id.as_deref())
                .unwrap_or_default();
            if let Some(tool_name) = draft.name.as_deref() {
                crate::native_backend::tools::maybe_emit_streaming_diff_preview(
                    session_id,
                    turn_id,
                    tool_call_id,
                    tool_name,
                    &draft.arguments,
                );
            }
        }
        Some("response.output_item.done") => {
            if let Some(item) = event.get("item").cloned() {
                state.output_items.push(item);
            }
        }
        Some("response.completed") => {
            let response = terminal_response(event, "completed")?;
            if let Some(output) = response.get("output").and_then(Value::as_array) {
                state.output_items = output.clone();
            }
            state.raw_stop_reason = Some("completed".to_string());
            state.saw_terminal_response = true;
            if state.stop_signal == TurnStopSignal::Unknown {
                state.stop_signal = TurnStopSignal::EndTurn;
            }
        }
        Some("response.incomplete") => {
            let response = terminal_response(event, "incomplete")?;
            if let Some(output) = response.get("output").and_then(Value::as_array) {
                state.output_items = output.clone();
            }
            let incomplete_reason = response
                .pointer("/incomplete_details/reason")
                .and_then(Value::as_str);
            let signal = TurnStopSignal::from_raw(incomplete_reason);
            if signal != TurnStopSignal::MaxTokens {
                return Err(AgentRuntimeError::Core(format!(
                    "provider response is incomplete: {}",
                    event
                        .pointer("/response/incomplete_details")
                        .cloned()
                        .unwrap_or(Value::Null)
                )));
            }
            state.raw_stop_reason = Some(incomplete_reason.unwrap_or("incomplete").to_string());
            state.saw_terminal_response = true;
            state.stop_signal = signal;
        }
        Some("response.failed") => {
            return Err(crate::native_backend::providers::errors::stream_error(
                super::PROTOCOL_ID,
                event.pointer("/response/error").unwrap_or(&Value::Null),
            ));
        }
        Some("error") => {
            return Err(crate::native_backend::providers::errors::stream_error(
                super::PROTOCOL_ID,
                event,
            ));
        }
        _ => {}
    }
    Ok(())
}

fn terminal_response<'a>(event: &'a Value, expected_status: &str) -> AgentRuntimeResult<&'a Value> {
    let response = event
        .get("response")
        .filter(|response| response.is_object())
        .ok_or_else(|| {
            AgentRuntimeError::Core("terminal response event is malformed".to_string())
        })?;
    if response.get("status").and_then(Value::as_str) != Some(expected_status) {
        return Err(AgentRuntimeError::Core(format!(
            "terminal response event is missing status `{expected_status}`"
        )));
    }
    Ok(response)
}

fn capture_function_call_draft(event: &Value, item: &Value, state: &mut ResponsesStreamState) {
    if item.get("type").and_then(Value::as_str) != Some("function_call") {
        return;
    }
    let index = event
        .get("output_index")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let draft = state.function_calls.entry(index).or_default();
    draft.id = item.get("id").and_then(Value::as_str).map(str::to_string);
    draft.call_id = item
        .get("call_id")
        .and_then(Value::as_str)
        .map(str::to_string);
    draft.name = item.get("name").and_then(Value::as_str).map(str::to_string);
    for key in [draft.id.as_deref(), draft.call_id.as_deref()]
        .into_iter()
        .flatten()
        .filter(|value| !value.trim().is_empty())
    {
        state.function_call_indices.insert(key.to_string(), index);
    }
    if let Some(arguments) = item.get("arguments").and_then(Value::as_str)
        && !arguments.is_empty()
    {
        draft.arguments.push_str(arguments);
    }
}

fn append_missing_function_call_drafts(
    replay_items: &mut Vec<Value>,
    drafts: HashMap<usize, FunctionCallDraft>,
) -> AgentRuntimeResult<()> {
    if replay_items
        .iter()
        .any(|item| item.get("type").and_then(Value::as_str) == Some("function_call"))
    {
        return Ok(());
    }
    let mut drafts = drafts.into_iter().collect::<Vec<_>>();
    drafts.sort_by_key(|(index, _)| *index);
    for (_, draft) in drafts {
        let has_payload = draft.id.is_some()
            || draft.call_id.is_some()
            || draft.name.is_some()
            || !draft.arguments.trim().is_empty();
        if !has_payload {
            continue;
        }
        let Some(name) = draft.name else {
            return Err(crate::native_backend::providers::errors::protocol_error(
                crate::ProviderProtocolFailureKind::IncompleteToolCall,
                "provider returned an incomplete function call",
            ));
        };
        replay_items.push(json!({
            "type": "function_call",
            "id": draft.id,
            "call_id": draft.call_id,
            "name": name,
            "arguments": draft.arguments,
        }));
    }
    Ok(())
}

fn function_call_index_for_event(event: &Value, state: &ResponsesStreamState) -> usize {
    if let Some(index) = event.get("output_index").and_then(Value::as_u64) {
        return index as usize;
    }
    for key in ["item_id", "call_id"] {
        let Some(value) = event.get(key).and_then(Value::as_str) else {
            continue;
        };
        if let Some(index) = state.function_call_indices.get(value) {
            return *index;
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn parses_streaming_text_and_function_call_events() {
        let stream = [
            r#"data: {"type":"response.output_text.delta","delta":"Plan."}"#,
            r#"data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc-1","call_id":"call-1","name":"tool_fs_run","arguments":""}}"#,
            r#"data: {"type":"response.function_call_arguments.delta","output_index":1,"delta":"{\"path\":\"/tools/web/search\",\"args\":{\"query\":\"Lyra\"}}" }"#,
            r#"data: {"type":"response.output_item.done","output_index":1,"item":{"type":"function_call","id":"fc-1","call_id":"call-1","name":"tool_fs_run","arguments":"{\"path\":\"/tools/web/search\",\"args\":{\"query\":\"Lyra\"}}"}}"#,
            r#"data: {"type":"response.completed","response":{"id":"resp-stream-1","status":"completed","usage":{"input_tokens":90,"input_tokens_details":{"cached_tokens":60},"output_tokens":12,"output_tokens_details":{"reasoning_tokens":3}}}}"#,
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
        .expect("streaming reply");

        assert_eq!(reply.content.as_deref(), Some("Plan."));
        assert_eq!(reply.tool_calls[0].id, "call-1");
        assert_eq!(reply.tool_calls[0].name, "tool_fs_run");
        assert_eq!(reply.provider_replay_items[0]["type"], "function_call");
        assert_eq!(
            reply.provider_replay_protocol.as_deref(),
            Some("openai_responses")
        );
        assert_eq!(reply.raw_stop_reason.as_deref(), Some("completed"));
        assert_eq!(
            reply.response_meta.response_id.as_deref(),
            Some("resp-stream-1")
        );
        assert_eq!(reply.response_meta.usage.input_uncached_tokens, Some(30));
        assert_eq!(reply.response_meta.usage.reasoning_tokens, Some(3));
    }

    #[test]
    fn fallback_drafts_preserve_unknown_tools_for_dispatch_rejection() {
        let stream = [
            r#"data: {"type":"response.output_text.delta","delta":"I cannot use that tool."}"#,
            r#"data: {"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","id":"fc-1","call_id":"call-1","name":"unknown_tool","arguments":"{}"}}"#,
            r#"data: {"type":"response.completed","response":{"status":"completed"}}"#,
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
        .expect("complete but unavailable call");

        assert_eq!(reply.tool_calls[0].name, "unknown_tool");
    }

    #[test]
    fn streams_write_file_arguments_into_running_edit_activity() {
        let workspace = tempfile::tempdir().expect("workspace");
        let mut session = crate::native_backend::sessions::new_session(
            Some(format!("Streaming preview {}", uuid::Uuid::new_v4())),
            Some(workspace.path().display().to_string()),
            "normal",
        );
        let session_id = session.id.clone();
        let turn_id = format!("turn-streaming-preview-{}", uuid::Uuid::new_v4());
        let cancellation = CancellationToken::new();
        session.snapshot["turnStatus"] = Value::String("running".to_string());
        session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
        session.snapshot["follow"] = json!({ "running": true, "activity": "calling_model" });
        session
            .runtime_turns
            .push(crate::native_backend::projections::runtime_turn(
                &turn_id,
                &session_id,
                "calling_model",
                None,
                None,
            ));
        {
            let mut state = crate::native_backend::state::state()
                .lock()
                .expect("state lock");
            session.dirty = true;
            state.sessions.insert(session_id.clone(), session);
            state.save_state().expect("save state");
        }
        crate::native_backend::session_runtime::register_active_turn(
            &session_id,
            &turn_id,
            cancellation.clone(),
        );

        let arguments = r#"{"path":"index.html","content":"<!DOCTYPE html>\n<html>"}"#;
        let stream = [
            format!(
                "data: {}",
                json!({
                    "type": "response.output_item.added",
                    "output_index": 0,
                    "item": {
                        "type": "function_call",
                        "id": "fc-1",
                        "call_id": "call-write",
                        "name": "write_file",
                        "arguments": ""
                    }
                })
            ),
            format!(
                "data: {}",
                json!({
                    "type": "response.function_call_arguments.delta",
                    "item_id": "fc-1",
                    "delta": arguments
                })
            ),
            format!(
                "data: {}",
                json!({
                    "type": "response.output_item.done",
                    "output_index": 0,
                    "item": {
                        "type": "function_call",
                        "id": "fc-1",
                        "call_id": "call-write",
                        "name": "write_file",
                        "arguments": arguments
                    }
                })
            ),
            r#"data: {"type":"response.completed","response":{"status":"completed"}}"#.to_string(),
            "data: [DONE]".to_string(),
        ]
        .join("\n\n");

        let reply = parse_streaming_response(
            std::io::Cursor::new(stream),
            &session_id,
            &turn_id,
            &cancellation,
            &[json!({ "type": "function", "function": { "name": "write_file" } })],
            false,
        )
        .expect("streaming write_file reply");

        assert_eq!(reply.tool_calls[0].id, "call-write");
        let state = crate::native_backend::state::state()
            .lock()
            .expect("state lock");
        let session = state.sessions.get(&session_id).expect("session");
        let tool = session
            .snapshot
            .get("tools")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .find(|tool| tool.get("id").and_then(Value::as_str) == Some("call-write"))
            .expect("streaming preview tool");
        assert_eq!(tool["status"].as_str(), Some("running"));
        assert_eq!(tool["activityKind"].as_str(), Some("edit"));
        assert_eq!(
            tool.pointer("/output/raw/changedFiles/0/path")
                .and_then(Value::as_str),
            Some("index.html")
        );
        assert!(
            tool.pointer("/output/raw/diff")
                .and_then(Value::as_str)
                .is_some_and(|diff| diff.contains("<!DOCTYPE html>"))
        );
        drop(state);
        crate::native_backend::session_runtime::clear_active_turn(&session_id, &turn_id);
    }

    #[test]
    fn maps_streaming_incomplete_max_output_tokens() {
        let stream = [
            r#"data: {"type":"response.output_text.delta","delta":"partial"}"#,
            r#"data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"partial"}]}]}}"#,
            "data: [DONE]",
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
        .expect("streaming incomplete reply");

        assert_eq!(reply.content.as_deref(), Some("partial"));
        assert_eq!(reply.stop_signal, TurnStopSignal::MaxTokens);
    }

    #[test]
    fn rejects_streaming_incomplete_non_max_output_tokens_reason() {
        let stream = [
            r#"data: {"type":"response.output_text.delta","delta":"partial"}"#,
            r#"data: {"type":"response.incomplete","response":{"status":"incomplete","incomplete_details":{"reason":"content_filter"},"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"partial"}]}]}}"#,
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
        .expect_err("non-token-limit incomplete response");

        assert!(error.to_string().contains("content_filter"));
    }

    #[test]
    fn streaming_reasoning_only_and_empty_terminal_responses_reach_the_loop() {
        let reasoning_item = json!({
            "type": "reasoning",
            "id": "rs-1",
            "encrypted_content": "opaque",
            "summary": [{ "type": "summary_text", "text": "Still reasoning." }]
        });
        let stream = [
            format!(
                "data: {}",
                json!({
                    "type": "response.completed",
                    "response": {
                        "status": "completed",
                        "output": [reasoning_item.clone()],
                        "usage": {
                            "output_tokens": 9,
                            "output_tokens_details": { "reasoning_tokens": 9 }
                        }
                    }
                })
            ),
            "data: [DONE]".to_string(),
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
        .expect("reasoning-only stream");

        assert!(reply.content.is_none());
        assert_eq!(reply.reasoning_content.as_deref(), Some("Still reasoning."));
        assert_eq!(reply.provider_replay_items, vec![reasoning_item]);
        assert_eq!(reply.response_meta.usage.reasoning_tokens, Some(9));

        let empty = [
            r#"data: {"type":"response.completed","response":{"status":"completed","output":[]}}"#,
            "data: [DONE]",
        ]
        .join("\n\n");
        let empty_reply = parse_streaming_response(
            std::io::Cursor::new(empty),
            "",
            "",
            &CancellationToken::new(),
            &[],
            false,
        )
        .expect("empty terminal stream");
        assert!(empty_reply.content.is_none());
        assert!(empty_reply.reasoning_content.is_none());
        assert!(empty_reply.tool_calls.is_empty());
    }

    #[test]
    fn stream_without_a_terminal_response_is_an_error() {
        let error = parse_streaming_response(
            std::io::Cursor::new("data: [DONE]"),
            "",
            "",
            &CancellationToken::new(),
            &[],
            false,
        )
        .expect_err("missing terminal response");

        assert!(error.to_string().contains("terminal response"));
    }
}
