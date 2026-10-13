use super::*;

pub(crate) fn emit_assistant_text(session_id: &str, turn_id: &str, text: &str) -> Option<String> {
    let message_id = emit_assistant_message_placeholder(session_id, turn_id)?;
    append_assistant_delta(session_id, turn_id, &message_id, text).ok()?;
    commit_assistant_message(session_id, turn_id, &message_id);
    Some(message_id)
}

pub(crate) fn emit_assistant_error_message(
    session_id: &str,
    turn_id: &str,
    failure_message: &str,
) -> Option<String> {
    let text = if failure_message.trim().is_empty() {
        "Agent turn failed without an error message.".to_string()
    } else {
        failure_message.trim().to_string()
    };
    let message_id = emit_assistant_message_placeholder(session_id, turn_id)?;
    append_assistant_delta(session_id, turn_id, &message_id, &text).ok()?;
    commit_assistant_message(session_id, turn_id, &message_id);
    attach_metadata_to_active_assistant_message(
        session_id,
        turn_id,
        &message_id,
        json!({
            // This remains an assistant-shaped timeline item for backwards
            // compatible rendering, but is a runtime diagnostic rather than a
            // model response. Context projection excludes it on every future
            // request.
            "isApiError": true,
            "kind": "provider-error",
            "excludeFromProviderContext": true,
            "excludeFromMemory": true,
        }),
    );
    Some(message_id)
}

pub(crate) fn set_active_ui_message_id(session_id: &str, turn_id: &str, message_id: &str) {
    super::session_runtime::set_active_ui_message_id(session_id, turn_id, message_id);
}

pub(crate) fn active_ui_message_id(session_id: &str, turn_id: &str) -> Option<String> {
    super::session_runtime::active_ui_message_id(session_id, turn_id)
}

pub(crate) fn clear_active_ui_message_id(session_id: &str, turn_id: &str) {
    super::session_runtime::clear_active_ui_message_id(session_id, turn_id);
}

pub(crate) fn assistant_reply_visible_text(
    reply: &crate::native_backend::provider::ModelReply,
) -> Option<String> {
    reply
        .content
        .as_ref()
        .filter(|content| !content.trim().is_empty())
        .cloned()
}

/// Commit assistant text to the factual UI timeline.
/// Tool-round preambles are anchored in the chat transcript and receive tool blocks.
pub(crate) fn commit_visible_assistant_reply(
    session_id: &str,
    turn_id: &str,
    reply: &mut crate::native_backend::provider::ModelReply,
    streamed_message_id: &Option<String>,
) -> bool {
    if reply.tool_calls.is_empty() {
        if let Some(message_id) = streamed_message_id
            .as_ref()
            .filter(|message_id| !message_id.is_empty())
        {
            set_active_ui_message_id(session_id, turn_id, message_id);
            reply.ui_message_id = Some(message_id.clone());
            stamp_reasoning_content(session_id, message_id, reply.reasoning_content.as_deref());
            commit_assistant_message(session_id, turn_id, message_id);
            return true;
        }
        if let Some(content) = reply
            .content
            .as_ref()
            .filter(|content| !content.trim().is_empty())
        {
            clear_active_ui_message_id(session_id, turn_id);
            reply.ui_message_id = emit_assistant_text(session_id, turn_id, content);
            if let Some(ref id) = reply.ui_message_id {
                stamp_reasoning_content(session_id, id, reply.reasoning_content.as_deref());
            }
            return reply.ui_message_id.is_some();
        }
        clear_active_ui_message_id(session_id, turn_id);
        return false;
    }

    let message_id = streamed_message_id
        .as_ref()
        .filter(|message_id| !message_id.is_empty())
        .cloned()
        .or_else(|| active_ui_message_id(session_id, turn_id))
        .or_else(|| emit_assistant_message_placeholder(session_id, turn_id));
    let Some(message_id) = message_id else {
        return false;
    };
    let streamed_live = streamed_message_id
        .as_ref()
        .is_some_and(|message_id| !message_id.is_empty());
    let has_streamed_text = reply
        .content
        .as_ref()
        .is_some_and(|content| !content.trim().is_empty());
    if !(streamed_live && has_streamed_text) {
        if let Some(visible_text) = assistant_reply_visible_text(reply)
            && append_assistant_delta(session_id, turn_id, &message_id, &visible_text).is_err()
        {
            return false;
        }
    }
    if has_streamed_text || assistant_reply_visible_text(reply).is_some() {
        commit_assistant_message(session_id, turn_id, &message_id);
    }
    if crate::native_backend::subagent::is_subagent_session_id(session_id)
        && let Some(progress) = reply
            .content
            .as_deref()
            .map(str::trim)
            .filter(|text| !text.is_empty())
    {
        crate::native_backend::subagent::mirror_child_progress(session_id, progress);
    }
    set_active_ui_message_id(session_id, turn_id, &message_id);
    stamp_reasoning_content(session_id, &message_id, reply.reasoning_content.as_deref());
    reply.ui_message_id = Some(message_id);
    true
}

pub(crate) fn ensure_existing_text_block(message: &mut Value, text: &str) {
    if text.is_empty() {
        return;
    }
    if !message.get("blocks").is_some_and(Value::is_array) {
        message["blocks"] = json!([]);
    }
    let Some(blocks) = message.get_mut("blocks").and_then(Value::as_array_mut) else {
        return;
    };
    if blocks.iter().any(|block| {
        block.get("type").and_then(Value::as_str) == Some("text")
            && block
                .get("text")
                .and_then(Value::as_str)
                .is_some_and(|value| !value.is_empty())
    }) {
        return;
    }
    if let Some(block) = blocks
        .first_mut()
        .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
    {
        block["text"] = Value::String(text.to_string());
        return;
    }
    blocks.insert(0, json!({ "type": "text", "id": "text-0", "text": text }));
}

pub(crate) fn append_reasoning_to_message(
    message: &mut Value,
    delta: &str,
    status: &str,
) -> String {
    append_string_field(message, "reasoningContent", delta);
    let existing_text = missing_text_block(message).then(|| {
        message
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    if !message.get("blocks").is_some_and(Value::is_array) {
        message["blocks"] = json!([]);
    }
    if let Some(existing_text) = existing_text {
        ensure_existing_text_block(message, &existing_text);
    }
    let Some(blocks) = message.get_mut("blocks").and_then(Value::as_array_mut) else {
        return "thinking-0".to_string();
    };
    // A thinking block must never split the message's visible text. Reasoning
    // that arrives while (or after) the reply text has started is anchored
    // before the trailing run of text blocks — accumulating into the thinking
    // block that already precedes that run when present — so content resumed
    // after the reasoning continues the SAME text block instead of opening a
    // fragment on the far side of the thinking card. This matches the
    // commit-time behavior of finish_reasoning_blocks, which inserts thinking
    // at index 0, and keeps reasoning-first and channel-interleaving providers
    // on one coherent text block.
    let trailing_text_start = blocks
        .iter()
        .rposition(|block| block.get("type").and_then(Value::as_str) != Some("text"))
        .map_or(0, |index| index + 1);
    if trailing_text_start > 0
        && let Some(block) = blocks
            .get_mut(trailing_text_start - 1)
            .filter(|block| block.get("type").and_then(Value::as_str) == Some("thinking"))
    {
        let block_id = block
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("thinking-0")
            .to_string();
        append_string_field(block, "text", delta);
        block["status"] = Value::String(status.to_string());
        return block_id;
    }
    let block_id = format!("thinking-{}", blocks.len());
    blocks.insert(
        trailing_text_start,
        json!({ "type": "thinking", "id": block_id, "text": delta, "status": status }),
    );
    block_id
}

fn collect_thinking_text(message: &Value) -> Option<String> {
    let blocks = message.get("blocks")?.as_array()?;
    let mut combined = String::new();
    for block in blocks {
        if block.get("type").and_then(Value::as_str) != Some("thinking") {
            continue;
        }
        let Some(text) = block.get("text").and_then(Value::as_str) else {
            continue;
        };
        if text.trim().is_empty() {
            continue;
        }
        if !combined.is_empty() {
            combined.push('\n');
        }
        combined.push_str(text);
    }
    if combined.trim().is_empty() {
        None
    } else {
        Some(combined)
    }
}

fn message_has_open_thinking(message: &Value) -> bool {
    message.get("reasoningStatus").and_then(Value::as_str) == Some("thinking")
        || message
            .get("blocks")
            .and_then(Value::as_array)
            .is_some_and(|blocks| {
                blocks.iter().any(|block| {
                    block.get("type").and_then(Value::as_str) == Some("thinking")
                        && block.get("status").and_then(Value::as_str) == Some("thinking")
                })
            })
}

pub(crate) fn complete_streamed_reasoning(message: &mut Value) -> bool {
    if !message_has_open_thinking(message) {
        return false;
    }
    let reasoning = message
        .get("reasoningContent")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .or_else(|| collect_thinking_text(message))
        .unwrap_or_default();
    message["reasoningStatus"] = json!("done");
    finish_reasoning_blocks(message, &reasoning);
    true
}

pub(crate) fn finish_reasoning_blocks(message: &mut Value, reasoning: &str) {
    let existing_text = message
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    ensure_existing_text_block(message, &existing_text);
    let Some(blocks) = message.get_mut("blocks").and_then(Value::as_array_mut) else {
        message["blocks"] = json!([
            { "type": "thinking", "id": "thinking-0", "text": reasoning, "status": "done" }
        ]);
        return;
    };
    let has_thinking = blocks
        .iter()
        .any(|block| block.get("type").and_then(Value::as_str) == Some("thinking"));
    if has_thinking {
        for block in blocks {
            if block.get("type").and_then(Value::as_str) == Some("thinking") {
                block["status"] = Value::String("done".to_string());
            }
        }
        return;
    }
    blocks.insert(
        0,
        json!({ "type": "thinking", "id": "thinking-0", "text": reasoning, "status": "done" }),
    );
}

/// Stamp `reasoningContent` onto a UI assistant message and mark status as done.
pub(crate) fn stamp_reasoning_content(session_id: &str, message_id: &str, reasoning: Option<&str>) {
    let (callback, committed_message) = {
        let Ok(mut state) = state().lock() else {
            return;
        };
        let callback = event_callback();
        let root = state.root.clone();
        let Some(session) = state.sessions.get_mut(session_id) else {
            return;
        };
        let Some(messages) = session
            .snapshot
            .get_mut("messages")
            .and_then(Value::as_array_mut)
        else {
            return;
        };
        let Some(index) = messages
            .iter()
            .rposition(|m| m.get("id").and_then(Value::as_str) == Some(message_id))
        else {
            return;
        };
        let message = &mut messages[index];
        // Providers that stream thinking deltas hand back reasoning_content: None
        // at commit time — the reasoning already lives on the message from the
        // delta path. Fall back to it so the status still flips to "done" instead
        // of sticking on "thinking" forever.
        let reasoning = reasoning
            .filter(|r| !r.trim().is_empty())
            .map(str::to_string)
            .or_else(|| {
                message
                    .get("reasoningContent")
                    .and_then(Value::as_str)
                    .filter(|r| !r.trim().is_empty())
                    .map(str::to_string)
            })
            .or_else(|| collect_thinking_text(message));
        if reasoning.is_none() && !message_has_open_thinking(message) {
            return;
        }
        if let Some(ref reasoning) = reasoning {
            message["reasoningContent"] = json!(reasoning);
            message["reasoningStatus"] = json!("done");
            finish_reasoning_blocks(message, reasoning);
        } else {
            complete_streamed_reasoning(message);
        }
        let committed_message = message.clone();
        mark_dialog_dirty_from(session, index);
        if let Err(error) = persist_message_snapshot(&root, session, &committed_message) {
            eprintln!("Unable to persist committed reasoning: {error}");
            return;
        }
        let _ = state.save_state();
        (callback, committed_message)
    };
    // Tool-call-only replies never reach commit_assistant_message, so without
    // this event the renderer keeps showing the thinking spinner even though
    // the snapshot already says "done".
    emit_with_callback(
        &callback,
        json!({
            "kind": "messageCommitted",
            "sessionId": session_id,
            "message": committed_message,
        }),
    );
}

pub(crate) fn emit_assistant_message_placeholder(
    session_id: &str,
    turn_id: &str,
) -> Option<String> {
    let message_id = format!("message-{}", Uuid::new_v4());
    let (callback, message) = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let root = state.root.clone();
            let session = state.sessions.get_mut(session_id)?;
            if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
                return None;
            }
            let mut message = assistant_message_with_id(message_id.clone(), String::new());
            push_session_message(session, message.clone());
            if !session.ephemeral {
                let encoded = serde_json::to_string(&message).ok()?;
                if let Err(error) =
                    persist_stream_delta(&root, session, &message_id, "created", &encoded)
                        .and_then(|()| save_session(&root, session))
                {
                    eprintln!("Unable to persist assistant placeholder: {error}");
                    return None;
                }
            }
            let _ = state.save_state();
            (callback, message)
        }
        Err(_) => return None,
    };
    set_active_ui_message_id(session_id, turn_id, &message_id);
    emit_with_callback(
        &callback,
        json!({
            "kind": "messageCommitted",
            "sessionId": session_id,
            "message": message,
        }),
    );
    Some(message_id)
}

pub(crate) fn append_assistant_delta(
    session_id: &str,
    turn_id: &str,
    message_id: &str,
    delta: &str,
) -> AgentRuntimeResult<()> {
    let callback = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let root = state.root.clone();
            let session = state.sessions.get_mut(session_id).ok_or_else(|| {
                AgentRuntimeError::Core(format!("session not found: {session_id}"))
            })?;
            if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
                return Err(AgentRuntimeError::Core("turn no longer active".to_string()));
            }
            persist_stream_delta(&root, session, message_id, "visible", delta)?;
            let messages = session
                .snapshot
                .get_mut("messages")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| {
                    AgentRuntimeError::Core("session messages are invalid".to_string())
                })?;
            // Streaming deltas target the most recently appended assistant message,
            // which lives at the tail of the array. Searching from the back finds it
            // in O(1) for the common case instead of scanning the whole conversation
            // on every token. The message id is unique, so the match is identical to a
            // forward scan.
            let index = messages
                .iter()
                .rposition(|message| message.get("id").and_then(Value::as_str) == Some(message_id))
                .ok_or_else(|| {
                    AgentRuntimeError::Core(format!("message not found: {message_id}"))
                })?;
            let message = &mut messages[index];
            record_stream_delta_telemetry(message, "visible", delta);
            let block_id = append_text_to_message(message, delta);
            if !delta.trim().is_empty() {
                complete_streamed_reasoning(message);
            }
            mark_dialog_dirty_from(session, index);
            (callback, block_id)
        }
        Err(_) => {
            return Err(AgentRuntimeError::Core(
                "agent runtime state lock failed".to_string(),
            ));
        }
    };
    // Streaming must stay lightweight: ship only raw text deltas. The frontend
    // renders an immediate plain/code view while the model is still writing,
    // and the finalized assistant message is enriched once at commit time.
    let event = json!({
        "kind": "messageDelta",
        "sessionId": session_id,
        "messageId": message_id,
        "blockId": callback.1,
        "delta": delta,
        "emittedAtMs": Utc::now().timestamp_millis(),
        "sourceChunkCount": 1,
    });
    emit_with_callback(&callback.0, event);
    Ok(())
}

pub(crate) fn append_assistant_reasoning_delta(
    session_id: &str,
    turn_id: &str,
    message_id: &str,
    delta: &str,
) -> AgentRuntimeResult<()> {
    let callback = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let root = state.root.clone();
            let session = state.sessions.get_mut(session_id).ok_or_else(|| {
                AgentRuntimeError::Core(format!("session not found: {session_id}"))
            })?;
            if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
                return Err(AgentRuntimeError::Core("turn no longer active".to_string()));
            }
            persist_stream_delta(&root, session, message_id, "reasoning", delta)?;
            let messages = session
                .snapshot
                .get_mut("messages")
                .and_then(Value::as_array_mut)
                .ok_or_else(|| {
                    AgentRuntimeError::Core("session messages are invalid".to_string())
                })?;
            let index = messages
                .iter()
                .rposition(|message| message.get("id").and_then(Value::as_str) == Some(message_id))
                .ok_or_else(|| {
                    AgentRuntimeError::Core(format!("message not found: {message_id}"))
                })?;
            let message = &mut messages[index];
            record_stream_delta_telemetry(message, "reasoning", delta);
            let block_id = append_reasoning_to_message(message, delta, "thinking");
            message["reasoningStatus"] = json!("thinking");
            mark_dialog_dirty_from(session, index);
            (callback, block_id)
        }
        Err(_) => {
            return Err(AgentRuntimeError::Core(
                "agent runtime state lock failed".to_string(),
            ));
        }
    };
    let event = json!({
        "kind": "messageReasoningDelta",
        "sessionId": session_id,
        "messageId": message_id,
        "blockId": callback.1,
        "delta": delta,
        "emittedAtMs": Utc::now().timestamp_millis(),
        "sourceChunkCount": 1,
    });
    emit_with_callback(&callback.0, event);
    Ok(())
}

/// Forward parsed deltas immediately. The renderer's StreamStore owns frame
/// batching; a provider pause must never strand text in a second buffer.
pub(crate) fn emit_visible_delta(
    delta: &str,
    ui_message_id: &mut Option<String>,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<bool> {
    if delta.is_empty() {
        return Ok(false);
    }
    let message_id = ui_message_id
        .get_or_insert_with(|| {
            emit_assistant_message_placeholder(session_id, turn_id).unwrap_or_default()
        })
        .clone();
    if !message_id.is_empty() {
        append_assistant_delta(session_id, turn_id, &message_id, delta)?;
        if !turn_id.is_empty() {
            super::super::session_runtime::record_progress(turn_id);
        }
    }
    Ok(true)
}

pub(crate) fn emit_reasoning_delta(
    delta: &str,
    ui_message_id: &mut Option<String>,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<bool> {
    if delta.is_empty() {
        return Ok(false);
    }
    append_reasoning_delta(delta, ui_message_id, session_id, turn_id)?;
    if !turn_id.is_empty() {
        super::super::session_runtime::record_progress(turn_id);
    }
    Ok(true)
}

/// Stream a reasoning delta to the UI, creating a placeholder message if needed.
pub(crate) fn append_reasoning_delta(
    delta: &str,
    ui_message_id: &mut Option<String>,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<()> {
    if delta.is_empty() {
        return Ok(());
    }
    let message_id = ui_message_id
        .get_or_insert_with(|| {
            emit_assistant_message_placeholder(session_id, turn_id).unwrap_or_default()
        })
        .clone();
    if !message_id.is_empty() {
        append_assistant_reasoning_delta(session_id, turn_id, &message_id, delta)?;
    }
    Ok(())
}

pub(crate) fn commit_assistant_message(
    session_id: &str,
    turn_id: &str,
    message_id: &str,
) -> Option<Value> {
    let (callback, committed_message) = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let root = state.root.clone();
            let session = state.sessions.get_mut(session_id)?;
            if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
                return None;
            }
            let messages = session
                .snapshot
                .get_mut("messages")
                .and_then(Value::as_array_mut)?;
            let message = messages
                .iter_mut()
                .rev()
                .find(|message| message.get("id").and_then(Value::as_str) == Some(message_id))?;
            if message.get("role").and_then(Value::as_str) != Some("assistant") {
                return None;
            }
            let committed_message = message.clone();
            mark_dialog_message_dirty(session, message_id);
            if let Err(error) = persist_message_snapshot(&root, session, &committed_message) {
                eprintln!("Unable to persist committed message: {error}");
                return None;
            }
            let _ = state.save_state();
            (callback, committed_message)
        }
        Err(_) => return None,
    };
    emit_with_callback(
        &callback,
        json!({
            "kind": "messageCommitted",
            "sessionId": session_id,
            "message": committed_message,
        }),
    );
    if crate::native_backend::subagent::is_subagent_session_id(session_id) {
        let text = committed_message
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("")
            .trim();
        if !text.is_empty() {
            crate::native_backend::subagent::mirror_child_progress(session_id, text);
        }
    }
    Some(committed_message)
}

pub(crate) fn attach_metadata_to_assistant_message(
    snapshot: &mut Value,
    message_id: &str,
    metadata: Value,
) -> Option<Value> {
    if metadata.is_null() || metadata.as_object().is_some_and(Map::is_empty) {
        return None;
    }
    let messages = snapshot.get_mut("messages").and_then(Value::as_array_mut)?;
    let message = messages
        .iter_mut()
        .find(|message| message.get("id").and_then(Value::as_str) == Some(message_id))?;
    if message.get("role").and_then(Value::as_str) != Some("assistant") {
        return None;
    }
    let existing = message
        .get("metadata")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let mut merged = existing;
    if let Some(incoming) = metadata.as_object() {
        for (key, value) in incoming {
            merged.insert(key.clone(), value.clone());
        }
    }
    message["metadata"] = Value::Object(merged);
    Some(message.clone())
}

pub(crate) fn attach_metadata_to_active_assistant_message(
    session_id: &str,
    turn_id: &str,
    message_id: &str,
    metadata: Value,
) -> Option<Value> {
    let (callback, committed_message) = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let session = state.sessions.get_mut(session_id)?;
            if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
                return None;
            }
            let committed_message =
                attach_metadata_to_assistant_message(&mut session.snapshot, message_id, metadata)?;
            mark_dialog_message_dirty(session, message_id);
            let _ = state.save_state();
            (callback, committed_message)
        }
        Err(_) => return None,
    };
    emit_with_callback(
        &callback,
        json!({
            "kind": "messageCommitted",
            "sessionId": session_id,
            "message": committed_message,
        }),
    );
    Some(committed_message)
}

pub(crate) fn persist_provider_protocol_step(
    session_id: &str,
    turn_id: &str,
    message_id: &str,
    provider_protocol: Value,
) -> AgentRuntimeResult<()> {
    let _timing = super::super::session_runtime::LocalPhaseTimer::start(
        session_id,
        turn_id,
        "protocolCheckpoint",
    );
    let (callback, committed_message) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let callback = event_callback();
        let session = state.sessions.get_mut(session_id).ok_or_else(|| {
            AgentRuntimeError::Core(format!(
                "session not found while persisting tool step: {session_id}"
            ))
        })?;
        if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
            return Err(AgentRuntimeError::Core(format!(
                "turn is no longer active while persisting tool step: {turn_id}"
            )));
        }
        let committed_message = attach_metadata_to_assistant_message(
            &mut session.snapshot,
            message_id,
            json!({ "providerProtocol": provider_protocol }),
        )
        .ok_or_else(|| {
            AgentRuntimeError::Core(format!(
                "assistant message not found while persisting tool step: {message_id}"
            ))
        })?;
        mark_dialog_message_dirty(session, message_id);
        state.save_state()?;
        (callback, committed_message)
    };

    // Tool calls may have irreversible side effects. Do not dispatch one until
    // the matching assistant/tool-call step is durably recoverable.
    flush_state()?;
    emit_with_callback(
        &callback,
        json!({
            "kind": "messageCommitted",
            "sessionId": session_id,
            "message": committed_message,
        }),
    );
    Ok(())
}

pub(crate) fn persist_provider_protocol_checkpoint(
    execution_session_id: &str,
    turn_id: &str,
    provider_protocol: Value,
) -> AgentRuntimeResult<()> {
    {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let session = state
            .sessions
            .get_mut(execution_session_id)
            .ok_or_else(|| {
                AgentRuntimeError::Core(format!(
                    "session not found while persisting provider step: {execution_session_id}"
                ))
            })?;
        if session.snapshot.get("activeTurnId").and_then(Value::as_str) != Some(turn_id) {
            return Err(AgentRuntimeError::Core(format!(
                "turn is no longer active while persisting provider step: {turn_id}"
            )));
        }
        session.snapshot["providerProtocolCheckpoint"] = json!({
            "turnId": turn_id,
            "providerProtocol": provider_protocol,
        });
        touch_session(session);
        state.save_state()?;
    }
    flush_state()
}

pub(crate) fn remove_assistant_message(session_id: &str, message_id: &str) -> bool {
    let (callback, removed) = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let Some(session) = state.sessions.get_mut(session_id) else {
                return false;
            };
            let Some(messages) = session
                .snapshot
                .get_mut("messages")
                .and_then(Value::as_array_mut)
            else {
                return false;
            };
            let removed_index = messages
                .iter()
                .position(|message| message.get("id").and_then(Value::as_str) == Some(message_id));
            let original_len = messages.len();
            messages
                .retain(|message| message.get("id").and_then(Value::as_str) != Some(message_id));
            let removed = messages.len() < original_len;
            if removed {
                mark_dialog_dirty_from(session, removed_index.unwrap_or(0));
                let _ = state.save_state();
            }
            (callback, removed)
        }
        Err(_) => return false,
    };
    if removed {
        super::session_runtime::clear_active_ui_message_if_matches(session_id, message_id);
        emit_with_callback(
            &callback,
            json!({
                "kind": "sessionSnapshot",
                "snapshot": state()
                    .lock()
                    .ok()
                    .and_then(|state| {
                        state
                            .sessions
                            .get(session_id)
                            .map(|session| session.snapshot.clone())
                    })
                    .unwrap_or(Value::Null),
            }),
        );
    }
    removed
}

pub(crate) fn assistant_message_has_visible_timeline_content(message: &Value) -> bool {
    if message
        .get("text")
        .and_then(Value::as_str)
        .is_some_and(|text| {
            crate::native_backend::tool_protocol::sanitize_visible_assistant_text(text).is_some()
        })
    {
        return true;
    }
    let Some(blocks) = message.get("blocks").and_then(Value::as_array) else {
        return false;
    };
    for block in blocks {
        match block.get("type").and_then(Value::as_str) {
            Some("tool") | Some("image") => return true,
            Some("thinking") => {
                if block
                    .get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| !text.trim().is_empty())
                {
                    return true;
                }
            }
            Some("text") => {
                if block
                    .get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| {
                        crate::native_backend::tool_protocol::sanitize_visible_assistant_text(text)
                            .is_some()
                    })
                {
                    return true;
                }
            }
            _ => {}
        }
    }
    false
}

pub(crate) fn assistant_message_has_provider_protocol_checkpoint(message: &Value) -> bool {
    message
        .pointer("/metadata/providerProtocol/version")
        .and_then(Value::as_u64)
        == Some(2)
}

pub(crate) fn prune_empty_assistant_messages(session: &mut NativeSession) -> usize {
    let Some(messages) = session
        .snapshot
        .get_mut("messages")
        .and_then(Value::as_array_mut)
    else {
        return 0;
    };
    let first_removed = messages.iter().position(|message| {
        message.get("role").and_then(Value::as_str) == Some("assistant")
            && !assistant_message_has_visible_timeline_content(message)
            && !assistant_message_has_provider_protocol_checkpoint(message)
    });
    let original_len = messages.len();
    messages.retain(|message| {
        message.get("role").and_then(Value::as_str) != Some("assistant")
            || assistant_message_has_visible_timeline_content(message)
            || assistant_message_has_provider_protocol_checkpoint(message)
    });
    let removed = original_len.saturating_sub(messages.len());
    if let Some(index) = first_removed {
        mark_dialog_dirty_from(session, index);
    }
    removed
}

fn increment_stream_metric(telemetry: &mut Value, key: &str, amount: u64) {
    let next = telemetry
        .get(key)
        .and_then(Value::as_u64)
        .unwrap_or(0)
        .saturating_add(amount);
    telemetry[key] = Value::Number(next.into());
}

/// Persist enough timing evidence to distinguish provider buffering from UI
/// rendering delay. This is updated at the same point as the canonical message
/// text, so it adds no extra state save or event path.
fn record_stream_delta_telemetry(message: &mut Value, channel: &str, delta: &str) {
    if !message.get("metadata").is_some_and(Value::is_object) {
        message["metadata"] = json!({});
    }
    let metadata = &mut message["metadata"];
    if !metadata
        .get("streamTelemetry")
        .is_some_and(Value::is_object)
    {
        metadata["streamTelemetry"] = json!({});
    }
    let telemetry = &mut metadata["streamTelemetry"];
    let now_ms = Utc::now().timestamp_millis();
    let (first_key, last_key, chunks_key, chars_key, bytes_key) = match channel {
        "reasoning" => (
            "firstReasoningAtMs",
            "lastReasoningAtMs",
            "reasoningChunkCount",
            "reasoningChars",
            "reasoningBytes",
        ),
        _ => (
            "firstVisibleAtMs",
            "lastVisibleAtMs",
            "visibleChunkCount",
            "visibleChars",
            "visibleBytes",
        ),
    };
    if telemetry.get(first_key).and_then(Value::as_i64).is_none() {
        telemetry[first_key] = Value::Number(now_ms.into());
    }
    telemetry[last_key] = Value::Number(now_ms.into());
    increment_stream_metric(telemetry, chunks_key, 1);
    increment_stream_metric(telemetry, chars_key, delta.chars().count() as u64);
    increment_stream_metric(telemetry, bytes_key, delta.len() as u64);
}

pub(crate) fn append_text_to_message(message: &mut Value, delta: &str) -> String {
    let previous_text = missing_text_block(message).then(|| {
        message
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string()
    });
    append_string_field(message, "text", delta);
    if !message.get("blocks").is_some_and(Value::is_array) {
        message["blocks"] = json!([{ "type": "text", "id": "text-0", "text": "" }]);
    }
    if let Some(previous_text) = previous_text {
        ensure_existing_text_block(message, &previous_text);
    }
    if let Some(blocks) = message.get_mut("blocks").and_then(Value::as_array_mut) {
        if let Some(block) = blocks
            .last_mut()
            .filter(|block| block.get("type").and_then(Value::as_str) == Some("text"))
        {
            let block_id = block
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("text-0")
                .to_string();
            append_string_field(block, "text", delta);
            return block_id;
        }
        // A placeholder text block from message creation must be reused, not
        // left empty ahead of a duplicate appended after the tool block.
        if let Some(block) = blocks.iter_mut().find(|block| {
            block.get("type").and_then(Value::as_str) == Some("text")
                && block
                    .get("text")
                    .and_then(Value::as_str)
                    .is_some_and(|text| text.is_empty())
        }) {
            let block_id = block
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("text-0")
                .to_string();
            block["text"] = Value::String(delta.to_string());
            return block_id;
        }
        let block_id = format!("text-{}", blocks.len());
        blocks.push(json!({ "type": "text", "id": block_id, "text": delta }));
        return block_id;
    }
    "text-0".to_string()
}

pub(crate) fn append_string_field(value: &mut Value, key: &str, delta: &str) {
    match value.get_mut(key) {
        Some(Value::String(text)) => text.push_str(delta),
        _ => value[key] = Value::String(delta.to_string()),
    }
}

pub(crate) fn missing_text_block(message: &Value) -> bool {
    let Some(text) = message.get("text").and_then(Value::as_str) else {
        return false;
    };
    if text.is_empty() {
        return false;
    }
    !message
        .get("blocks")
        .and_then(Value::as_array)
        .is_some_and(|blocks| {
            blocks.iter().any(|block| {
                block.get("type").and_then(Value::as_str) == Some("text")
                    && block
                        .get("text")
                        .and_then(Value::as_str)
                        .is_some_and(|value| !value.is_empty())
            })
        })
}

#[cfg(test)]
mod stream_telemetry_tests {
    use super::*;

    #[test]
    fn records_first_last_and_chunk_totals_for_stream_diagnostics() {
        let mut message = json!({ "role": "assistant", "metadata": {} });

        record_stream_delta_telemetry(&mut message, "visible", "你好");
        record_stream_delta_telemetry(&mut message, "visible", " world");
        record_stream_delta_telemetry(&mut message, "reasoning", "think");

        let telemetry = &message["metadata"]["streamTelemetry"];
        assert_eq!(telemetry["visibleChunkCount"], 2);
        assert_eq!(telemetry["visibleChars"], 8);
        assert_eq!(telemetry["visibleBytes"], 12);
        assert_eq!(telemetry["reasoningChunkCount"], 1);
        assert_eq!(telemetry["reasoningChars"], 5);
        assert!(telemetry["firstVisibleAtMs"].as_i64().is_some());
        assert!(telemetry["lastVisibleAtMs"].as_i64().is_some());
    }
}
