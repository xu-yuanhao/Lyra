use super::*;
use crate::native_backend::token_estimate::{estimate_message_tokens, estimate_messages_tokens};
use std::collections::HashSet;

pub(crate) const EXTRACT_INPUT_TARGET: usize = 10_000;
pub(crate) const EXTRACT_INPUT_MAX: usize = 15_000;
pub(crate) const COMPACT_BUFFER_TOKENS: usize = 13_000;
pub(crate) const COMPACT_PRESERVE_RECENT_TOKENS: usize = 15_000;

pub(crate) fn compact_trigger_tokens(context_window: Option<usize>) -> usize {
    let usable = context_window
        .filter(|window| *window > 0)
        .unwrap_or(crate::retention_policy::DEFAULT_RETENTION_CONTEXT_TOKENS);
    usable.saturating_sub(COMPACT_BUFFER_TOKENS)
}

pub(crate) fn first_live_user_id(messages: &[Value]) -> Option<String> {
    messages.iter().find_map(|message| {
        crate::context_builder::is_member_user_message(message)
            .then(|| {
                message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .flatten()
    })
}

pub(crate) fn select_compact_middle(messages: &[Value]) -> Vec<(usize, Value)> {
    let head_end = crate::retention_policy::head_keep_count(messages);
    let token_counts: Vec<usize> = messages.iter().map(estimate_message_tokens).collect();
    let tail_start = crate::retention_policy::tail_keep_start(
        messages,
        &token_counts,
        COMPACT_PRESERVE_RECENT_TOKENS,
    );
    let mut selected = Vec::new();
    let mut accumulated = 0usize;
    for (idx, msg) in messages.iter().enumerate() {
        if idx < head_end || idx >= tail_start {
            continue;
        }
        if crate::context_builder::excludes_provider_context(msg) {
            continue;
        }
        if !matches!(
            msg.get("role").and_then(Value::as_str),
            Some("user") | Some("assistant")
        ) {
            continue;
        }
        let msg_tokens = token_counts.get(idx).copied().unwrap_or(0);
        if accumulated + msg_tokens > EXTRACT_INPUT_MAX && !selected.is_empty() {
            break;
        }
        accumulated += msg_tokens;
        selected.push((idx, msg.clone()));
        if accumulated >= EXTRACT_INPUT_TARGET {
            break;
        }
    }
    selected
}

/// Compute the effective "compressed up to" position in the current messages
/// array. Uses `compressedUpToMessageId` (stable, trim-resistant) when
/// available, falling back to the legacy `compressedUpToMessageOrdinal`
/// (clamped to array length) for sessions persisted before the fix.
///
/// Returns the number of messages to skip — all messages at indices ≥ this
/// value are considered uncompressed and eligible for the next compression
/// cycle.
pub(crate) fn effective_compressed_up_to(snapshot: &Value, messages: &[Value]) -> usize {
    if let Some(id) = snapshot
        .pointer("/memoryCompression/compressedUpToMessageId")
        .and_then(Value::as_str)
    {
        // New watermark: find the compression block by id. Skip past it.
        // If not found (was trimmed), start from 0 — all remaining
        // messages need compression.
        return messages
            .iter()
            .position(|m| m.get("id").and_then(Value::as_str) == Some(id))
            .map(|pos| pos + 1)
            .unwrap_or(0);
    }
    // Legacy fallback: clamp ordinal to current array length to avoid
    // the empty-iterator bug that permanently blocked re-compression.
    let ordinal = snapshot
        .pointer("/memoryCompression/compressedUpToMessageOrdinal")
        .and_then(Value::as_u64)
        .map(|v| v as usize)
        .unwrap_or(0);
    ordinal.min(messages.len())
}

/// 非损 checkpoint 引用块中每条消息的摘要字符上限
const CHECKPOINT_EXTRACT_CHARS: usize = 200;

const EXTRACT_AND_COMPRESS_SYSTEM_PROMPT: &str = r#"You are Lyra's background context compression and memory maintenance agent.

You inspect a window of conversation messages and return compact JSON that simultaneously:
1. Extracts durable memory candidates (facts worth remembering long-term)
2. Produces a compressed context summary that replaces the original messages

Return ONLY a JSON object:
{
  "candidates": [
    {
      "fact": "short durable fact",
      "category": "user_profile|preference|project|instruction|goal|other",
      "scope": "global|project",
      "confidence": 0.0,
      "sensitivity": "low|personal|sensitive",
      "sourceType": "user_declaration|memory_agent_inference",
      "requiresConfirmation": true,
      "content": {"kind":"brief_type","text":"fact or structured value"},
      "expiresAt": null
    }
  ],
  "compressedContext": {
    "summary": "concise narrative summary of the conversation window (500-2000 chars)",
    "keyDecisions": ["decision1", "decision2"],
    "projectState": "current project state description",
    "compressedMessageIds": ["msg-id-1", "msg-id-2"],
    "tokenEstimate": 0
  }
}

Rules:
- Keep at most 6 candidates.
- compressedContext.summary should capture essential context: what was discussed, what was decided, what is the current state.
- Quote every original user request in the compressed window verbatim.
- compressedContext.compressedMessageIds must list the message IDs you are compressing.
- compressedContext.tokenEstimate is your estimate of the summary's token count.
- Ignore secrets, passwords, API keys, tokens in both candidates and summary.
- Do not include transient command output or one-off task details in candidates.
- The conversation's first user message is outside this window and must remain live.
"#;

// ── 非损 checkpoint 重建 ──────────────────────────────────────────────
//
// mimo-code 首选策略：用归档引用块替代 LLM 摘要。原消息归档到 cut_store
// （可恢复），live context 中只留一个轻量引用块 + 每条消息的简要摘录。
// 模型需要细节时通过 lyra_session_read_message 工具按需取回。
//
// 优势：零信息损失、不依赖 LLM 可用性、不消耗 API 配额。
// 适用场景：工具调用密集的会话（模型可按需检索）。

fn extract_message_brief(msg: &Value) -> String {
    let role = msg.get("role").and_then(Value::as_str).unwrap_or("?");
    match role {
        "user" => {
            let text = msg
                .get("text")
                .or_else(|| msg.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let text = text.trim();
            if text.is_empty() {
                return "(image/attachment)".to_string();
            }
            truncate(text, CHECKPOINT_EXTRACT_CHARS)
        }
        "assistant" => {
            let text = msg
                .get("text")
                .or_else(|| msg.get("content"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let text = text.trim();
            if text.is_empty() {
                // 可能是纯 tool_call 的 assistant 消息
                let tool_names: Vec<&str> = msg
                    .get("toolCalls")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|tc| tc.pointer("/function/name").and_then(Value::as_str))
                            .collect()
                    })
                    .unwrap_or_default();
                if tool_names.is_empty() {
                    return "(empty)".to_string();
                }
                format!("called: {}", tool_names.join(", "))
            } else {
                truncate(text, CHECKPOINT_EXTRACT_CHARS)
            }
        }
        "tool" => {
            let name = msg.get("name").and_then(Value::as_str).unwrap_or("tool");
            let content = msg.get("content").and_then(Value::as_str).unwrap_or("");
            format!("[{name}] {}", truncate(content, 80))
        }
        _ => format!("({role})"),
    }
}

fn truncate(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        return s.to_string();
    }
    let truncated: String = s.chars().take(max_chars).collect();
    format!("{truncated}…")
}

/// 构建非损 checkpoint 引用块。
///
/// 返回的 JSON 与 LLM 压缩返回的结构兼容（含 compressedContext），
/// 但 summary 是确定性摘录而非 LLM 摘要。candidates 为空（不做记忆提取）。
fn build_checkpoint_rebuild_block(
    selected: &[(usize, Value)],
    messages: &[Value],
) -> AgentRuntimeResult<Value> {
    let compress_indices: Vec<usize> = {
        let first_idx = selected.first().unwrap().0;
        let last_idx = selected.last().unwrap().0;
        let selected_set: HashSet<usize> = selected.iter().map(|(i, _)| *i).collect();
        (first_idx..=last_idx)
            .filter(|i| {
                let Some(message) = messages.get(*i) else {
                    return false;
                };
                !crate::context_builder::excludes_provider_context(message)
                    && (selected_set.contains(i)
                        || message.get("role").and_then(Value::as_str) == Some("tool"))
            })
            .collect()
    };

    let briefs: Vec<String> = compress_indices
        .iter()
        .filter_map(|&i| messages.get(i))
        .map(|msg| {
            let ordinal = msg.get("ordinal").and_then(Value::as_u64).unwrap_or(0);
            let id = msg.get("id").and_then(Value::as_str).unwrap_or("");
            let brief = extract_message_brief(msg);
            format!("  [{ordinal}] {id} ({brief})")
        })
        .collect();

    let compressed_ids: Vec<String> = compress_indices
        .iter()
        .filter_map(|&i| {
            messages
                .get(i)
                .and_then(|m| m.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();

    let msg_count = compressed_ids.len();
    let summary = format!(
        "Non-loss checkpoint: {msg_count} messages archived to cut_store and retrievable via lyra_session_read_message tool.\n\
         Message briefs (use lyra_session_read_message with the message ID to retrieve full content):\n\
         {briefs}",
        briefs = briefs.join("\n  ")
    );

    let token_estimate = estimate_tokens(&summary);

    Ok(json!({
        "candidates": [],
        "compressedContext": {
            "summary": summary,
            "keyDecisions": [],
            "projectState": "(archived — use lyra_session_read_message to retrieve)",
            "compressedMessageIds": compressed_ids,
            "tokenEstimate": token_estimate,
        }
    }))
}

// ── 静态 fallback 摘要 ────────────────────────────────────────────────
//
// hermes 的 _build_static_fallback_summary 策略：LLM 不可用时，
// 本地提取关键信息生成确定性摘要。不调 LLM，不消耗 API 配额。

fn build_static_fallback_summary(selected: &[(usize, Value)], messages: &[Value]) -> Value {
    let mut user_requests: Vec<String> = Vec::new();
    let mut tool_actions: Vec<String> = Vec::new();
    let mut assistant_responses: Vec<String> = Vec::new();
    let mut file_paths: HashSet<String> = HashSet::new();
    let mut errors: Vec<String> = Vec::new();

    let first_idx = selected.first().unwrap().0;
    let last_idx = selected.last().unwrap().0;
    let selected_set: HashSet<usize> = selected.iter().map(|(i, _)| *i).collect();

    for i in first_idx..=last_idx {
        let Some(msg) = messages.get(i) else { continue };
        let role = msg.get("role").and_then(Value::as_str).unwrap_or("");
        if !selected_set.contains(&i) && role != "tool" {
            continue;
        }
        match role {
            "user" => {
                let text = msg
                    .get("text")
                    .or_else(|| msg.get("content"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !text.trim().is_empty() {
                    user_requests.push(truncate(text.trim(), 300));
                }
            }
            "assistant" => {
                let text = msg
                    .get("text")
                    .or_else(|| msg.get("content"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if !text.trim().is_empty() {
                    assistant_responses.push(truncate(text.trim(), 200));
                }
                // Extract tool call names
                if let Some(tool_calls) = msg.get("toolCalls").and_then(Value::as_array) {
                    for tc in tool_calls {
                        let name = tc
                            .pointer("/function/name")
                            .and_then(Value::as_str)
                            .unwrap_or("tool");
                        let args_str = tc
                            .pointer("/function/arguments")
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        // Extract file paths from arguments
                        extract_file_paths(args_str, &mut file_paths);
                        tool_actions.push(format!("{name}({})", truncate(args_str, 100)));
                    }
                }
            }
            "tool" => {
                if msg.get("lyraToolStatus").and_then(Value::as_str) == Some("failed") {
                    let failure = msg
                        .get("lyraToolFailure")
                        .filter(|value| !value.is_null())
                        .and_then(|value| serde_json::to_string(value).ok())
                        .unwrap_or_else(|| "structured tool failure".to_string());
                    errors.push(truncate(&failure, 150));
                }
            }
            _ => {}
        }
    }

    let mut summary_parts: Vec<String> = Vec::new();

    if !user_requests.is_empty() {
        summary_parts.push(format!(
            "User requests:\n{}",
            user_requests
                .iter()
                .enumerate()
                .map(|(i, r)| format!("  {}. {r}", i + 1))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    if !tool_actions.is_empty() {
        // ponytail: 限制工具动作列表长度，避免 fallback 摘要过大。
        // 上限 20 条，超出时只保留首尾。
        let actions = if tool_actions.len() > 20 {
            let head = &tool_actions[..10];
            let tail = &tool_actions[tool_actions.len() - 10..];
            let mut combined = head.to_vec();
            combined.push(format!("  ... ({} more) ...", tool_actions.len() - 20));
            combined.extend(tail.to_vec());
            combined
        } else {
            tool_actions.clone()
        };
        summary_parts.push(format!(
            "Tool actions:\n{}",
            actions
                .iter()
                .map(|a| format!("  - {a}"))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    if !file_paths.is_empty() {
        let paths: Vec<&String> = file_paths.iter().take(15).collect();
        summary_parts.push(format!(
            "Files touched:\n{}",
            paths
                .iter()
                .map(|p| format!("  - {p}"))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    if !errors.is_empty() {
        summary_parts.push(format!(
            "Errors encountered:\n{}",
            errors
                .iter()
                .take(5)
                .map(|e| format!("  - {e}"))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    if !assistant_responses.is_empty() {
        summary_parts.push(format!(
            "Key assistant responses:\n{}",
            assistant_responses
                .iter()
                .take(5)
                .enumerate()
                .map(|(i, r)| format!("  {}. {r}", i + 1))
                .collect::<Vec<_>>()
                .join("\n")
        ));
    }

    let summary = if summary_parts.is_empty() {
        "(no extractable content in compressed window)".to_string()
    } else {
        format!(
            "Static fallback summary (LLM compression was unavailable):\n\n{}",
            summary_parts.join("\n\n")
        )
    };

    let compressed_ids: Vec<String> = (first_idx..=last_idx)
        .filter_map(|i| {
            messages
                .get(i)
                .and_then(|m| m.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();

    json!({
        "candidates": [],
        "compressedContext": {
            "summary": summary,
            "keyDecisions": [],
            "projectState": "(static fallback — limited context available)",
            "compressedMessageIds": compressed_ids,
            "tokenEstimate": estimate_tokens(&summary),
        }
    })
}

fn extract_file_paths(text: &str, paths: &mut HashSet<String>) {
    // ponytail: 简单正则匹配文件路径 — 覆盖常见格式，不追求完美。
    // 上限：只收集前 20 个唯一路径，避免大参数爆发。
    for (idx, word) in text.split_whitespace().enumerate() {
        if paths.len() >= 20 {
            break;
        }
        if (word.starts_with('/') || word.starts_with("./") || word.starts_with("../"))
            && (word.contains('.') || word.contains('/'))
        {
            let clean = word.trim_matches(|c: char| {
                !c.is_alphanumeric() && c != '/' && c != '.' && c != '-' && c != '_'
            });
            if clean.len() > 3 {
                paths.insert(clean.to_string());
            }
        }
        if idx > 500 {
            break;
        }
    }
}

fn estimate_tokens(text: &str) -> usize {
    crate::native_backend::token_estimate::estimate_tokens(text)
}

// ── LLM 压缩 ──────────────────────────────────────────────────────────

fn try_llm_compression(
    session_id: &str,
    turn_id: &str,
    selected: &[(usize, Value)],
) -> AgentRuntimeResult<Value> {
    let (provider, model) = memory_agent_provider_and_model()?;
    let input_messages_json: Vec<Value> = selected.iter().map(|(_, msg)| msg.clone()).collect();
    let llm_messages = vec![
        json!({
            "role": "system",
            "content": EXTRACT_AND_COMPRESS_SYSTEM_PROMPT,
        }),
        json!({
            "role": "user",
            "content": json!({
                "sessionId": session_id,
                "turnId": turn_id,
                "messages": input_messages_json,
            }).to_string(),
        }),
    ];
    let reply = call_model_once_non_streaming(&provider, &model, &llm_messages, &[])?;
    let content = reply.content.as_deref().ok_or_else(|| {
        AgentRuntimeError::Core("compression agent returned no content".to_string())
    })?;
    parse_memory_agent_json(content)
}

// ── microCompact (Claude Code 风格) ───────────────────────────────────
//
// 不调 LLM，把旧 transient 工具结果的 content 替换为占位符。
// 保留最近 keep_recent 条 tool 消息不动，保护 cache prefix。
// ── 压缩应用核心 ──────────────────────────────────────────────────────

/// Apply a parsed compression response to a session in-place.
///
/// This is the post-LLM core: archive originals to cut_store, replace
/// messages with the compression block, advance `memoryCompression`.
/// Extracted from `spawn_extract_and_compress` for direct testability.
pub(crate) fn apply_compression_to_session(
    session: &mut NativeSession,
    root: &Path,
    session_id: &str,
    turn_id: &str,
    selected: &[(usize, Value)],
    messages: &[Value],
    parsed: &Value,
) -> AgentRuntimeResult<()> {
    // 1. Process memory candidates (best-effort, non-fatal)
    if let Some(candidates_arr) = parsed.get("candidates").and_then(Value::as_array) {
        let mutations = candidates_arr
            .iter()
            .take(6)
            .filter_map(|candidate| {
                memory_candidate_from_agent_json(
                    candidate,
                    Some(format!("{session_id}:{turn_id}:memory_compress")),
                    None,
                )
            })
            .collect::<Vec<_>>();
        for mutation in mutations {
            let _ = process_extracted_candidate(root, session_id, &turn_id, mutation);
        }
    }

    // 2. Parse compressedContext
    let Some(compressed_ctx) = parsed.get("compressedContext") else {
        return Ok(());
    };
    let summary = compressed_ctx
        .get("summary")
        .and_then(Value::as_str)
        .unwrap_or("");
    if summary.is_empty() {
        return Ok(());
    }
    let key_decisions = compressed_ctx
        .get("keyDecisions")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let project_state = compressed_ctx
        .get("projectState")
        .and_then(Value::as_str)
        .unwrap_or("");
    let token_estimate = compressed_ctx
        .get("tokenEstimate")
        .and_then(Value::as_u64)
        .map(|v| v as usize)
        .unwrap_or(0);

    // 3. Determine compress indices (selected + tool messages in range)
    let first_idx = selected.first().unwrap().0;
    let last_idx = selected.last().unwrap().0;
    let selected_indices: HashSet<usize> = selected.iter().map(|(i, _)| *i).collect();
    let mut compress_indices: Vec<usize> = Vec::new();
    for i in first_idx..=last_idx {
        let role = messages
            .get(i)
            .and_then(|m| m.get("role"))
            .and_then(Value::as_str);
        if selected_indices.contains(&i) || role == Some("tool") {
            compress_indices.push(i);
        }
    }

    // 4. Archive originals to cut_store
    let cut_entries: Vec<cut_store::CutMessageEntry> = compress_indices
        .iter()
        .filter_map(|&i| {
            messages.get(i).map(|msg| cut_store::CutMessageEntry {
                message: msg.clone(),
                ordinal: i as i64,
            })
        })
        .collect();
    if !cut_entries.is_empty() {
        let pack = cut_store::append_cut_pack(root, session_id, &cut_entries)?;
        cut_store::update_manifest_with_pack(root, session_id, &pack)?;
    }

    // 5. Build compression block
    let compression_block_id = format!("compression-{}", Uuid::new_v4());
    let compressed_message_ids: Vec<String> = compress_indices
        .iter()
        .filter_map(|&i| {
            messages
                .get(i)
                .and_then(|m| m.get("id"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();
    let compression_block_text = json!({
        "summary": summary,
        "keyDecisions": key_decisions,
        "projectState": project_state,
        "compressedMessageIds": compressed_message_ids,
        "tokenEstimate": token_estimate,
    })
    .to_string();
    let compression_block = json!({
        "id": compression_block_id,
        "role": "system",
        "text": compression_block_text,
        "createdAt": now(),
        "metadata": {
            "kind": "compressed-context-block",
            "compressionBlockId": compression_block_id,
            "compressedMessageIds": compressed_message_ids,
            "uiHidden": true,
        }
    });

    // 6. Mark compressed messages excluded from provider context, insert compression block.
    // Storage retains all messages for UI display; only model context is trimmed
    // (opencode model: storage keeps all content, compaction only trims model context).
    let compress_ids_set: HashSet<String> = compressed_message_ids.iter().cloned().collect();
    let protected_first_user = first_live_user_id(messages);

    if let Some(live_messages) = session
        .snapshot
        .get_mut("messages")
        .and_then(Value::as_array_mut)
    {
        for msg in live_messages.iter_mut() {
            let msg_id = msg
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_string();
            if protected_first_user.as_deref() == Some(msg_id.as_str()) {
                continue;
            }
            if !compress_ids_set.contains(&msg_id) {
                continue;
            }
            if let Some(metadata) = msg.get_mut("metadata").and_then(Value::as_object_mut) {
                metadata.insert("excludeFromProviderContext".to_string(), json!(true));
            } else {
                msg["metadata"] = json!({ "excludeFromProviderContext": true });
            }
        }
        live_messages.retain(|msg| {
            msg.pointer("/metadata/kind").and_then(Value::as_str)
                != Some("compressed-context-block")
        });
        let insert_at = live_messages
            .iter()
            .position(|m| m.get("role").and_then(Value::as_str) != Some("system"))
            .unwrap_or(live_messages.len());
        live_messages.insert(insert_at, compression_block);
    }
    mark_dialog_dirty_from(session, 0);

    // 7. Write memoryCompression watermark
    if let Some(obj) = session.snapshot.as_object_mut() {
        obj.insert(
            "memoryCompression".to_string(),
            json!({
                "lastCompressionTurnId": turn_id,
                "lastCompressionAt": now(),
                "compressedUpToMessageId": compression_block_id,
                "compressedTokenBaseline": token_estimate,
                "compressionBlockId": compression_block_id,
            }),
        );
    }
    super::helpers::force_refresh_token_estimate(&mut session.snapshot);
    touch_session(session);
    Ok(())
}

pub(crate) fn spawn_extract_and_compress(root: PathBuf, session_id: String, turn_id: String) {
    {
        let mut state = match state().lock() {
            Ok(state) => state,
            Err(_) => return,
        };
        if !state.active_compressions.insert(session_id.clone()) {
            return;
        }
    }

    thread::spawn(move || {
        let result = (|| -> AgentRuntimeResult<()> {
            emit_context_compression_progress(&session_id, "started", None, None);

            let session = {
                let state = state().lock().map_err(|_| {
                    AgentRuntimeError::Core("agent runtime state lock failed".to_string())
                })?;
                state.sessions.get(&session_id).cloned().ok_or_else(|| {
                    AgentRuntimeError::Core(format!("session not found: {session_id}"))
                })?
            };

            let messages = session
                .snapshot
                .get("messages")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();

            let selected = select_compact_middle(&messages);

            if selected.is_empty() {
                return Ok(());
            }

            let token_before = estimate_messages_tokens(&messages);
            super::activity::record_context_compression_tool(
                &session_id,
                &turn_id,
                "running",
                None,
                None,
            );

            // 中间段收成摘要。首问由 head_keep 保住；checkpoint/session_read 不再是找回首问的主路径。
            let parsed = match try_llm_compression(&session_id, &turn_id, &selected) {
                Ok(llm_result) => llm_result,
                Err(llm_err) => {
                    eprintln!(
                        "[lyra-agent-runtime] LLM compression failed for {session_id}: {llm_err}, using static fallback"
                    );
                    build_static_fallback_summary(&selected, &messages)
                }
            };

            let token_after;
            {
                let mut state = state().lock().map_err(|_| {
                    AgentRuntimeError::Core("agent runtime state lock failed".to_string())
                })?;
                if let Some(live_session) = state.sessions.get_mut(&session_id) {
                    apply_compression_to_session(
                        live_session,
                        &root,
                        &session_id,
                        &turn_id,
                        &selected,
                        &messages,
                        &parsed,
                    )?;
                    token_after = live_session
                        .snapshot
                        .get("messages")
                        .and_then(Value::as_array)
                        .map(|msgs| estimate_messages_tokens(msgs))
                        .unwrap_or(0);
                } else {
                    token_after = 0;
                }
                state.save_state()?;
            }

            super::activity::record_context_compression_tool(
                &session_id,
                &turn_id,
                "completed",
                Some(token_before),
                Some(token_after),
            );
            emit_context_compression_progress(
                &session_id,
                "completed",
                Some(token_before),
                Some(token_after),
            );

            Ok(())
        })();

        {
            let mut state = match state().lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            state.active_compressions.remove(&session_id);
        }

        if let Err(error) = result {
            // ponytail: 隐式重试 — 压缩失败时 active_compressions 已 remove，
            // 下轮 turn 若仍超窗口阈值会重新触发。无显式重试队列，避免过度工程。
            eprintln!("[lyra-agent-runtime] extract+compress failed for {session_id}: {error}");
            super::activity::record_context_compression_tool(
                &session_id,
                &turn_id,
                "failed",
                None,
                None,
            );
            emit_context_compression_progress(&session_id, "failed", None, None);
        }
    });
}
