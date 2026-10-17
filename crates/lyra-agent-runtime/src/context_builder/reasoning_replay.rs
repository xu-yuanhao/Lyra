use serde_json::{Value, json};

use crate::native_backend::{reasoning_replay_items, valid_reasoning_value};

/// Restore the reasoning fields a chat-completions provider needs to accept a
/// replayed assistant turn. Replay items recorded at round time are primary;
/// the bounded `step.assistant.reasoning` text is the fallback. Read repair
/// only — never invent thought text or reconstruct opaque signatures from UI
/// text.
pub(super) fn restore_chat_reasoning(assistant: &mut Value, step: &Value) {
    if step
        .pointer("/replay/protocol")
        .and_then(Value::as_str)
        .is_some_and(|protocol| protocol != "openai_chat_completions")
    {
        assistant
            .as_object_mut()
            .unwrap()
            .remove("lyraProviderReplay");
        return;
    }
    let mut values = serde_json::Map::new();
    for item in step
        .pointer("/replay/items")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        if let (Some(field), Some(value)) =
            (item.get("field").and_then(Value::as_str), item.get("value"))
            && valid_reasoning_value(field, value)
        {
            values.insert(field.to_string(), value.clone());
        }
    }
    if !values.contains_key("reasoning_content")
        && let Some(text) = step
            .pointer("/assistant/reasoning")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty())
    {
        values.insert("reasoning_content".to_string(), json!(text));
    }
    let items = reasoning_replay_items(&Value::Object(values.clone()));
    for (field, value) in values {
        assistant[field] = value;
    }
    if items.is_empty() {
        assistant
            .as_object_mut()
            .unwrap()
            .remove("lyraProviderReplay");
    } else {
        assistant["lyraProviderReplay"] =
            json!({"protocol":"openai_chat_completions","items":items});
    }
}
