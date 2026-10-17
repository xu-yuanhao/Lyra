use super::*;

#[path = "reasoning_replay.rs"]
mod reasoning_replay;

pub(super) fn provider_protocol_v2_messages(
    message: &Value,
    message_index: usize,
    options: &ProviderContextOptions,
) -> Option<Vec<Value>> {
    // Protocol replay state lives in the session's provider_protocol_log, not
    // in message metadata. Each entry anchored to this message replays in log
    // order; the old priorSteps/current nesting is gone.
    let message_id = message.get("id").and_then(Value::as_str)?;
    let mut matched = false;
    let mut output = Vec::new();
    for entry in options
        .protocol_log
        .iter()
        .filter(|entry| entry.get("messageId").and_then(Value::as_str) == Some(message_id))
    {
        let Some(step) = entry.get("step") else {
            continue;
        };
        if step.get("version").and_then(Value::as_u64) != Some(2) {
            continue;
        }
        matched = true;
        output.extend(provider_protocol_v2_step_messages(
            step,
            message_index,
            options,
            message,
            true,
        ));
    }
    matched.then_some(output)
}

fn provider_protocol_v2_step_messages(
    protocol: &Value,
    message_index: usize,
    options: &ProviderContextOptions,
    source_message: &Value,
    current_step: bool,
) -> Vec<Value> {
    let complete = protocol.get("status").and_then(Value::as_str) == Some("complete");
    let Some(assistant) = protocol.get("assistant") else {
        return Vec::new();
    };
    let recorded_content = assistant
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let content = if !complete && current_step {
        source_message
            .get("text")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
            .unwrap_or(recorded_content)
    } else {
        recorded_content
    };
    let tool_calls = assistant
        .get("toolCalls")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|call| complete_call(call))
        .cloned()
        .collect::<Vec<_>>();
    if !complete && content.is_empty() && tool_calls.is_empty() {
        return Vec::new();
    }
    let mut assistant_message = json!({
        "role": "assistant",
        "content": content,
        "tool_calls": tool_calls.iter().filter_map(|call| {
            let id = call.get("id").and_then(Value::as_str)?;
            let name = call.get("name").and_then(Value::as_str)?;
            let arguments = call.get("arguments").cloned().unwrap_or_else(|| json!({}));
            Some(json!({
                "id": id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": if let Some(text) = arguments.as_str() {
                        text.to_string()
                    } else {
                        serde_json::to_string(&arguments).unwrap_or_else(|_| "{}".to_string())
                    },
                }
            }))
        }).collect::<Vec<_>>(),
    });
    let tool_results = recover_results(protocol, &tool_calls);
    let same_origin = [
        (
            protocol
                .pointer("/origin/providerId")
                .and_then(Value::as_str),
            options.provider_id.as_deref(),
        ),
        (
            protocol.pointer("/origin/routeId").and_then(Value::as_str),
            options.route_id.as_deref(),
        ),
        (
            protocol
                .pointer("/origin/protocolId")
                .and_then(Value::as_str),
            options.protocol_id.as_deref(),
        ),
        (
            protocol.pointer("/origin/model").and_then(Value::as_str),
            options.model.as_deref(),
        ),
    ]
    .into_iter()
    .all(|(stored, active)| stored.is_some() && stored == active);
    let replay_protocol = protocol.pointer("/replay/protocol").and_then(Value::as_str);
    let replay_items = protocol
        .pointer("/replay/items")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty());
    let auxiliary_before =
        provider_protocol_auxiliary_messages(protocol, "auxiliaryMessagesBeforeAssistant");
    let auxiliary_after =
        provider_protocol_auxiliary_messages(protocol, "auxiliaryMessagesAfterToolResults");

    if complete
        && same_origin
        && options.protocol_id.as_deref() == Some("openai_responses")
        && replay_protocol == Some("openai_responses")
        && let Some(items) = replay_items
    {
        let mut output = auxiliary_before;
        output.extend(items.iter().cloned().map(|mut item| {
            if let Some(object) = item.as_object_mut() {
                object.insert(
                    OPENAI_RESPONSES_REPLAY_GROUP_KEY.to_string(),
                    json!(message_index),
                );
            }
            item
        }));
        output.extend(tool_results.iter().filter_map(|result| {
            let call_id = result.get("toolCallId").and_then(Value::as_str)?;
            let original = result.get("content").and_then(Value::as_str).unwrap_or("");
            let mut item = json!({
                "type": "function_call_output",
                "call_id": call_id,
                "output": original,
            });
            if let Some(name) = tool_result_name(result, &tool_calls) {
                item["name"] = json!(name);
            }
            item[OPENAI_RESPONSES_REPLAY_GROUP_KEY] = json!(message_index);
            Some(item)
        }));
        output.extend(auxiliary_after);
        return output;
    }

    if complete
        && same_origin
        && let (Some(replay_protocol), Some(items)) = (replay_protocol, replay_items)
        && options.protocol_id.as_deref() == Some(replay_protocol)
    {
        assistant_message["lyraProviderReplay"] = json!({
            "protocol": replay_protocol,
            "items": items,
        });
    }
    if complete && same_origin && options.protocol_id.as_deref() == Some("openai_chat_completions")
    {
        reasoning_replay::restore_chat_reasoning(&mut assistant_message, protocol);
    }

    let mut output = auxiliary_before;
    output.push(assistant_message);
    output.extend(tool_results.iter().filter_map(|result| {
        let call_id = result.get("toolCallId").and_then(Value::as_str)?;
        let original = result.get("content").and_then(Value::as_str).unwrap_or("");
        let mut item = json!({
            "role": "tool",
            "tool_call_id": call_id,
            "content": original,
        });
        if let Some(name) = tool_result_name(result, &tool_calls) {
            item["name"] = json!(name);
        }
        Some(item)
    }));
    output.extend(auxiliary_after);
    output
}

fn tool_result_name(result: &Value, tool_calls: &[Value]) -> Option<String> {
    result
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.is_empty())
        .map(str::to_string)
        .or_else(|| {
            let call_id = result.get("toolCallId").and_then(Value::as_str)?;
            tool_calls.iter().find_map(|call| {
                (call.get("id").and_then(Value::as_str) == Some(call_id))
                    .then(|| call.get("name").and_then(Value::as_str).map(str::to_string))
                    .flatten()
            })
        })
}

fn provider_protocol_auxiliary_messages(protocol: &Value, field: &str) -> Vec<Value> {
    protocol
        .get(field)
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|message| {
            let role = message.get("role").and_then(Value::as_str)?;
            if !matches!(role, "user" | "system" | "developer") {
                return None;
            }
            let mut restored = json!({
                "role": role,
                "content": message.get("content").cloned().unwrap_or(Value::Null),
            });
            // Internal browser-image provenance survives resume so the provider
            // can bound its working context without touching uploaded images.
            if let Some(meta) = message.get("lyraVisualEvidence").filter(|v| v.is_object()) {
                restored["lyraVisualEvidence"] = meta.clone();
            }
            Some(restored)
        })
        .collect()
}

fn complete_call(call: &Value) -> bool {
    if !call["id"].as_str().is_some_and(|id| !id.is_empty())
        || !call["name"].as_str().is_some_and(|name| !name.is_empty())
    {
        return false;
    }
    let arguments = call.get("arguments").cloned().unwrap_or_else(|| json!({}));
    let arguments = if let Some(text) = arguments.as_str() {
        match serde_json::from_str::<Value>(text) {
            Ok(value) => value,
            Err(_) => return false,
        }
    } else {
        arguments
    };
    arguments.is_object() && arguments.get("parseError").is_none()
}

fn recover_results(protocol: &Value, calls: &[Value]) -> Vec<Value> {
    let recorded = protocol["toolResults"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    calls.iter().map(|call| {
        let id = call["id"].as_str().unwrap_or_default();
        recorded.iter().find(|result| result["toolCallId"] == id
            && result["content"].is_string()
            && !matches!(result["status"].as_str(), Some("running" | "pending")))
            .cloned().unwrap_or_else(|| json!({
                "toolCallId": id, "name": call["name"], "status":"failed", "isError":true,
                "content":"Tool execution was interrupted before a result was recorded. Completion is unconfirmed; inspect current state before retrying a side effect."
            }))
    }).collect()
}
