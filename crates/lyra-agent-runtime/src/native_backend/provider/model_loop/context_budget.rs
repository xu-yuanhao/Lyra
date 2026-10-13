//! Model-window budgets and atomic local compaction. Every removed payload
//! has a real artifact; provider-message IDs are never advertised as session IDs.
use super::*;

const KEEP_RECENT_TOOL_RESULTS: usize = 10;

pub(super) struct ContextBudget {
    micro: usize,
    midturn: usize,
}
impl ContextBudget {
    fn for_request(request: &ModelRequest) -> Self {
        let context = request
            .capabilities
            .context_window
            .filter(|size| *size > 0)
            .unwrap_or(crate::retention_policy::DEFAULT_RETENTION_CONTEXT_TOKENS);
        let reserved = (context / 10).max(4096.min(context / 4)).min(20_000);
        let tool_tokens =
            estimate_tokens(&serde_json::to_string(&request.tools).unwrap_or_default());
        let available = context
            .saturating_sub(reserved)
            .saturating_sub(tool_tokens)
            .max(1);
        Self {
            micro: available.saturating_mul(4) / 5,
            midturn: available.saturating_mul(9) / 10,
        }
    }
}

pub(super) fn compact(
    session_id: &str,
    turn_id: &str,
    request: &ModelRequest,
    messages: &mut Vec<Value>,
) -> bool {
    let budget = ContextBudget::for_request(request);
    let before = estimate_messages_tokens(messages);
    if before <= budget.micro {
        return false;
    }
    let mut archive = |items: &[Value]| -> Option<String> {
        let mut records = String::new();
        for item in items {
            records.push_str(&serde_json::to_string(item).ok()?);
            records.push('\n');
        }
        let reference = write_tool_artifact_with_kind(
            session_id,
            turn_id,
            "context-compaction",
            ToolArtifactKind::ToolOutput,
            &records,
        )?;
        reference["path"].as_str().map(str::to_string)
    };
    let mut cleared = micro_compact_messages(messages, KEEP_RECENT_TOOL_RESULTS, &mut archive);
    if estimate_messages_tokens(messages) > budget.midturn {
        // A single recent result can exceed a small model's entire window.
        // Keep its call/result identity and a useful excerpt plus a real archive.
        cleared += micro_compact_messages(messages, 0, &mut archive);
    }
    let midturn = midturn_compact_messages(messages, budget.midturn, &mut archive);
    if cleared > 0 || midturn.is_some() {
        emit_context_trimmed(
            session_id,
            json!({
                "reason": "model_window_compaction", "clearedToolResults": cleared,
                "tokensBefore": before, "tokensAfter": estimate_messages_tokens(messages),
                "contextWindow": request.capabilities.context_window, "midturnThreshold": budget.midturn,
            }),
        );
        return true;
    }
    false
}

fn is_compactable_tool_name(name: &str) -> bool {
    matches!(
        name,
        "read_file"
            | "file_read"
            | "file_list"
            | "glob"
            | "file_glob"
            | "grep"
            | "project_search"
            | "code_search_text"
            | "code_search_symbol"
            | "code_graph_expand"
            | "lsp_query"
            | "web_search"
            | "web_fetch"
            | "lyra_lumen"
    )
}

fn micro_compact_messages(
    messages: &mut [Value],
    keep_recent: usize,
    archive: &mut impl FnMut(&[Value]) -> Option<String>,
) -> usize {
    let mut names = HashMap::new();
    for message in messages.iter() {
        if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
            for call in calls {
                if let (Some(id), Some(name)) = (
                    call["id"].as_str(),
                    call.pointer("/function/name").and_then(Value::as_str),
                ) {
                    names.insert(id.to_string(), name.to_string());
                }
            }
        }
        if message["type"] == "function_call" {
            if let (Some(id), Some(name)) =
                (openai_replay_call_id(message), message["name"].as_str())
            {
                names.insert(id.to_string(), name.to_string());
            }
        }
        if let Some(blocks) = message["content"].as_array() {
            for block in blocks.iter().filter(|block| block["type"] == "tool_use") {
                if let (Some(id), Some(name)) = (block["id"].as_str(), block["name"].as_str()) {
                    names.insert(id.to_string(), name.to_string());
                }
            }
        }
    }
    let mut ids = Vec::new();
    for message in messages.iter() {
        for id in tool_exchange_ids(message, true) {
            if names
                .get(id)
                .is_some_and(|name| is_compactable_tool_name(name))
                && !ids.iter().any(|seen| seen == id)
            {
                ids.push(id.to_string());
            }
        }
    }
    let mut cleared = 0;
    for id in ids.iter().take(ids.len().saturating_sub(keep_recent)) {
        let indices = messages
            .iter()
            .enumerate()
            .filter_map(|(i, message)| {
                tool_exchange_ids(message, true)
                    .contains(&id.as_str())
                    .then_some(i)
            })
            .collect::<Vec<_>>();
        if indices
            .iter()
            .all(|&i| result_was_archived(&messages[i], id))
        {
            continue;
        }
        if indices.iter().all(|&i| {
            result_content(&messages[i], id)
                .map(|value| value.to_string().chars().count())
                .unwrap_or(0)
                <= 1024
        }) {
            continue;
        }
        let originals = indices
            .iter()
            .map(|&i| messages[i].clone())
            .collect::<Vec<_>>();
        let Some(path) = archive(&originals) else {
            continue;
        };
        for index in indices {
            let original = result_content(&messages[index], id)
                .cloned()
                .unwrap_or(Value::Null);
            let text = original
                .as_str()
                .map(str::to_string)
                .unwrap_or_else(|| original.to_string());
            let excerpt = tool_protocol::clip_chars_head_tail(&text, 1024, "[excerpt truncated]");
            let marker = json!(format!(
                "[Old tool result content cleared; full original result: {path}. Read this artifact with read_file.]\n{excerpt}"
            ));
            if let Some(blocks) = messages[index]["content"].as_array_mut() {
                for block in blocks
                    .iter_mut()
                    .filter(|block| block["type"] == "tool_result" && block["tool_use_id"] == *id)
                {
                    block["content"] = marker.clone();
                }
            } else {
                let key = if messages[index]["type"] == "function_call_output" {
                    "output"
                } else {
                    "content"
                };
                messages[index][key] = marker;
            }
        }
        cleared += 1;
    }
    cleared
}

fn result_content<'a>(message: &'a Value, id: &str) -> Option<&'a Value> {
    if let Some(blocks) = message["content"].as_array() {
        blocks
            .iter()
            .find(|block| block["type"] == "tool_result" && block["tool_use_id"] == id)
            .and_then(|block| block.get("content"))
    } else {
        message.get("output").or_else(|| message.get("content"))
    }
}

fn result_was_archived(message: &Value, id: &str) -> bool {
    let content = if let Some(blocks) = message["content"].as_array() {
        blocks
            .iter()
            .find(|block| block["type"] == "tool_result" && block["tool_use_id"] == id)
            .and_then(|block| block["content"].as_str())
    } else {
        message
            .get("output")
            .or_else(|| message.get("content"))
            .and_then(Value::as_str)
    };
    content.is_some_and(|text| {
        text.starts_with("[Old tool result content cleared; full original result:")
    })
}

fn midturn_compact_messages(
    messages: &mut Vec<Value>,
    threshold: usize,
    archive: &mut impl FnMut(&[Value]) -> Option<String>,
) -> Option<(usize, usize)> {
    let before = estimate_messages_tokens(messages);
    if before <= threshold {
        return None;
    }
    let start = crate::retention_policy::head_keep_count(messages);
    let protected = threshold / 3;
    let mut retained = 0_usize;
    let mut cut = messages.len();
    for (index, message) in messages.iter().enumerate().rev() {
        let tokens = estimate_message_tokens(message);
        if retained > 0 && retained.saturating_add(tokens) > protected {
            break;
        }
        retained = retained.saturating_add(tokens);
        cut = index;
    }
    let end = atomic_compress_end(messages, cut);
    if end <= start {
        return None;
    }
    let path = archive(&messages[start..end])?;
    let briefs = messages[start..end]
        .iter()
        .map(|message| {
            let role = message["role"]
                .as_str()
                .or_else(|| message["type"].as_str())
                .unwrap_or("message");
            let text = message
                .get("content")
                .or_else(|| message.get("output"))
                .unwrap_or(message)
                .to_string();
            format!("{role}: {}", text.chars().take(200).collect::<String>())
        })
        .collect::<Vec<_>>()
        .join("\n");
    let summary = json!({"role":"system", "content": format!(
        "Earlier provider context is archived at {path}. Read this artifact with read_file for original messages; these are provider records, not session message IDs. Brief excerpts:\n{briefs}"
    )});
    let mut compacted = messages[..start].to_vec();
    compacted.push(summary);
    // Keep the current user's full instruction even when a long tool loop is
    // split at an assistant exchange inside that user turn.
    if let Some(user) = messages
        .iter()
        .enumerate()
        .rev()
        .find(|(_, message)| {
            message["role"] == "user"
                && !message["content"]
                    .as_array()
                    .is_some_and(|blocks| blocks.iter().any(|block| block["type"] == "tool_result"))
        })
        .filter(|(index, _)| *index >= start && *index < end)
        .map(|(_, message)| message)
    {
        compacted.push(user.clone());
    }
    compacted.extend_from_slice(&messages[end..]);
    let after = estimate_messages_tokens(&compacted);
    if after >= before {
        return None;
    }
    *messages = compacted;
    Some((before, after))
}

/// The retained suffix must start at an assistant exchange boundary, never at
/// one of its results. Native Responses items, chat messages (also used by the
/// Anthropic adapter), and Anthropic content blocks obey the same invariant.
fn atomic_compress_end(messages: &[Value], compress_end: usize) -> usize {
    if compress_end == 0 || compress_end >= messages.len() {
        return compress_end;
    }
    if messages[compress_end].get("type").and_then(Value::as_str) == Some("function_call") {
        let mut replay_start = compress_end;
        while replay_start > 0
            && matches!(
                messages[replay_start - 1]
                    .get("type")
                    .and_then(Value::as_str),
                Some("reasoning") | Some("function_call")
            )
        {
            replay_start -= 1;
        }
        if replay_start < compress_end {
            return atomic_compress_end(messages, replay_start);
        }
    }
    let pending_output_ids = messages[compress_end..]
        .iter()
        .flat_map(|message| tool_exchange_ids(message, true))
        .collect::<HashSet<_>>();
    let Some(mut call_start) = messages[..compress_end]
        .iter()
        .enumerate()
        .find(|(_, message)| {
            tool_exchange_ids(message, false)
                .iter()
                .any(|call_id| pending_output_ids.contains(call_id))
        })
        .map(|(index, _)| index)
    else {
        return compress_end;
    };
    while call_start > 0
        && matches!(
            messages[call_start - 1].get("type").and_then(Value::as_str),
            Some("reasoning") | Some("function_call")
        )
    {
        call_start -= 1;
    }
    atomic_compress_end(messages, call_start)
}

fn tool_exchange_ids(message: &Value, results: bool) -> Vec<&str> {
    let mut ids = Vec::new();
    let item_type = if results {
        "function_call_output"
    } else {
        "function_call"
    };
    if message.get("type").and_then(Value::as_str) == Some(item_type) {
        ids.extend(openai_replay_call_id(message));
    }
    if results && message.get("role").and_then(Value::as_str) == Some("tool") {
        ids.extend(message.get("tool_call_id").and_then(Value::as_str));
    }
    if !results && message.get("role").and_then(Value::as_str) == Some("assistant") {
        if let Some(calls) = message.get("tool_calls").and_then(Value::as_array) {
            ids.extend(
                calls
                    .iter()
                    .filter_map(|call| call.get("id").and_then(Value::as_str)),
            );
        }
    }
    if let Some(blocks) = message.get("content").and_then(Value::as_array) {
        let block_type = if results { "tool_result" } else { "tool_use" };
        let id_key = if results { "tool_use_id" } else { "id" };
        ids.extend(
            blocks
                .iter()
                .filter(|block| block.get("type").and_then(Value::as_str) == Some(block_type))
                .filter_map(|block| block.get(id_key).and_then(Value::as_str)),
        );
    }
    ids
}

fn openai_replay_call_id(message: &Value) -> Option<&str> {
    message
        .get("call_id")
        .or_else(|| message.get("id"))
        .and_then(Value::as_str)
}

#[cfg(test)]
mod replay_atomic_tests {
    use super::*;

    #[test]
    fn actual_midturn_compaction_keeps_a_complete_chat_tool_exchange() {
        let mut messages = vec![
            json!({"role": "system", "content": "system"}),
            json!({"role": "user", "content": "initial request"}),
            json!({"role": "assistant", "content": "a b c d e f g h\n".repeat(20_000)}),
            json!({"role": "user", "content": "current task"}),
            json!({"role": "assistant", "tool_calls": [{"id": "a"}, {"id": "b"}]}),
            json!({"role": "tool", "tool_call_id": "a", "content": "one"}),
            json!({"role": "tool", "tool_call_id": "b", "content": "two"}),
            json!({"role": "assistant", "content": "done"}),
            json!({"role": "user", "content": "next"}),
            json!({"role": "assistant", "content": "answer"}),
            json!({"role": "user", "content": "latest"}),
        ];
        let (before, after) = midturn_compact_messages(&mut messages, 120_000, &mut |_| {
            Some("/test/archive.jsonl".into())
        })
        .expect("threshold must trigger compaction");
        assert!(after < before);
        let mut call_ids = HashSet::new();
        for message in &messages {
            for id in tool_exchange_ids(message, true) {
                assert!(call_ids.contains(id), "orphan result {id}");
            }
            call_ids.extend(tool_exchange_ids(message, false));
        }
        assert_eq!(call_ids.len(), 2);
        assert_eq!(messages.last().unwrap()["content"], "latest");
    }

    #[test]
    fn midturn_cut_keeps_chat_parallel_tool_results_with_their_assistant() {
        let messages = vec![
            json!({"role": "user", "content": "request"}),
            json!({"role": "assistant", "tool_calls": [{"id": "a"}, {"id": "b"}]}),
            json!({"role": "tool", "tool_call_id": "a", "content": "one"}),
            json!({"role": "tool", "tool_call_id": "b", "content": "two"}),
            json!({"role": "assistant", "content": "done"}),
        ];
        for cut in 2..=3 {
            assert_eq!(atomic_compress_end(&messages, cut), 1);
        }
    }

    #[test]
    fn midturn_cut_keeps_anthropic_tool_use_and_result_blocks_together() {
        let messages = vec![
            json!({"role": "user", "content": "request"}),
            json!({"role": "assistant", "content": [
                {"type": "thinking", "thinking": "plan", "signature": "sig"},
                {"type": "tool_use", "id": "a", "name": "read", "input": {}}
            ]}),
            json!({"role": "user", "content": [
                {"type": "tool_result", "tool_use_id": "a", "content": "one"}
            ]}),
            json!({"role": "assistant", "content": "done"}),
        ];
        assert_eq!(atomic_compress_end(&messages, 2), 1);
    }

    #[test]
    fn midturn_cut_between_function_call_and_output_moves_before_replay() {
        let messages = vec![
            json!({ "role": "system", "content": "system" }),
            json!({ "role": "user", "content": "old request" }),
            json!({ "type": "reasoning", "id": "reasoning-1" }),
            json!({ "type": "function_call", "call_id": "call-1" }),
            json!({
                "role": "assistant",
                "content": "",
                "tool_calls": [{ "id": "call-1" }],
                "openaiResponsesShadow": true
            }),
            json!({
                "type": "function_call_output",
                "call_id": "call-1",
                "output": "done"
            }),
            json!({
                "role": "tool",
                "tool_call_id": "call-1",
                "content": "done",
                "openaiResponsesShadow": true
            }),
            json!({ "role": "user", "content": "latest request" }),
        ];

        assert_eq!(atomic_compress_end(&messages, 5), 2);
    }

    #[test]
    fn midturn_cut_between_reasoning_and_function_call_keeps_the_reasoning_group() {
        let messages = vec![
            json!({ "role": "system", "content": "system" }),
            json!({ "role": "user", "content": "old request" }),
            json!({ "type": "reasoning", "id": "reasoning-1" }),
            json!({ "type": "function_call", "call_id": "call-1" }),
            json!({
                "role": "assistant",
                "content": "",
                "tool_calls": [{ "id": "call-1" }],
                "openaiResponsesShadow": true
            }),
            json!({
                "type": "function_call_output",
                "call_id": "call-1",
                "output": "done"
            }),
            json!({ "role": "assistant", "content": "finished" }),
        ];

        assert_eq!(atomic_compress_end(&messages, 3), 2);
    }
}

#[cfg(test)]
mod budget_tests {
    use super::*;
    #[test]
    fn thresholds_follow_the_model_window_instead_of_absolute_token_constants() {
        let make = |window| ModelRequest {
            provider: serde_json::from_value(
                json!({"id":"test", "label":"Test", "routeId":"custom_openai_compatible"}),
            )
            .unwrap(),
            model: "model".into(),
            messages: vec![],
            tools: vec![],
            tool_choice: ModelToolChoice::Auto,
            host_dispatcher: None,
            capabilities: ModelCapabilityProfile {
                context_window: Some(window),
                supports_image_input: false,
                supports_tool_calling: false,
                supports_streaming: false,
                supports_tool_choice: false,
            },
            input_downgrades: vec![],
            evidence_refs: vec![],
            token_estimate: 0,
            context_trimmed: false,
        };
        let small = ContextBudget::for_request(&make(32_000));
        let large = ContextBudget::for_request(&make(1_000_000));
        assert!(small.midturn < 32_000);
        assert!(large.micro > 700_000);
        assert!(small.micro < small.midturn);
    }
    #[test]
    fn compaction_requires_a_real_archive_and_preserves_result_identity() {
        let original = vec![
            json!({"role":"assistant", "content":[{"type":"tool_use", "id":"a", "name":"read_file"}, {"type":"tool_use", "id":"b", "name":"read_file"}]}),
            json!({"role":"user", "content":[{"type":"tool_result", "tool_use_id":"a", "content":"first".repeat(300)}, {"type":"tool_result", "tool_use_id":"b", "content":"second".repeat(300)}]}),
        ];
        let mut messages = original.clone();
        assert_eq!(micro_compact_messages(&mut messages, 0, &mut |_| None), 0);
        assert_eq!(messages, original);
        let temp = tempfile::tempdir().unwrap();
        let store = ToolArtifactStore::from_root(temp.path().to_path_buf());
        let mut paths = Vec::new();
        let mut archive = |items: &[Value]| {
            let reference = store.write_text(
                "s",
                "t",
                "compact",
                ToolArtifactKind::ToolOutput,
                &serde_json::to_string(items).unwrap(),
            )?;
            let path = reference["path"].as_str()?.to_string();
            paths.push(path.clone());
            Some(path)
        };
        assert_eq!(micro_compact_messages(&mut messages, 0, &mut archive), 2);
        for (index, id) in ["a", "b"].iter().enumerate() {
            assert_eq!(messages[1]["content"][index]["type"], "tool_result");
            assert_eq!(messages[1]["content"][index]["tool_use_id"], *id);
        }
        assert!(
            std::fs::read_to_string(&paths[0])
                .unwrap()
                .contains("first")
        );
        assert!(
            std::fs::read_to_string(&paths[1])
                .unwrap()
                .contains("second")
        );
    }
}

#[cfg(test)]
mod archive_contract_tests {
    use super::*;
    #[test]
    fn midturn_references_an_actual_readable_archive_without_fake_session_ids() {
        let temp = tempfile::tempdir().unwrap();
        let store = ToolArtifactStore::from_root(temp.path().to_path_buf());
        let original =
            json!({"role":"assistant", "content":"alpha beta gamma delta\n".repeat(5000)});
        let mut messages = vec![
            json!({"role":"system", "content":"system"}),
            json!({"role":"user", "content":"first"}),
            original.clone(),
            json!({"role":"user", "content":"latest"}),
        ];
        let mut path = String::new();
        let mut archive = |items: &[Value]| {
            let reference = store.write_text(
                "s",
                "t",
                "compact",
                ToolArtifactKind::ToolOutput,
                &serde_json::to_string(items).unwrap(),
            )?;
            path = reference["path"].as_str()?.to_string();
            Some(path.clone())
        };
        assert!(midturn_compact_messages(&mut messages, 1000, &mut archive).is_some());
        let records: Vec<Value> =
            serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
        assert_eq!(records, vec![original]);
        let summary = messages[2]["content"].as_str().unwrap();
        assert!(summary.contains(&path));
        assert!(!summary.contains("cut_store"));
        assert!(!summary.contains("lyra_session_read_message"));
    }
}
