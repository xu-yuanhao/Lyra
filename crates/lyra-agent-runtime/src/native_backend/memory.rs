use super::*;

pub(crate) fn memory_snapshot(payload: Value) -> AgentRuntimeResult<Value> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let id = state.resolve_session_id(string_opt(&payload, "sessionId"))?;
    let session = state
        .sessions
        .get(&id)
        .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
    let mut snapshot = memory_snapshot_for_session(session, &state.config);
    snapshot["activeClarification"] = state
        .pending_clarifications
        .values()
        .find(|request| request.session_id == id && request.answer.is_none())
        .map(|request| {
            json!({
                "clarificationId": request.id,
                "question": request.question,
                "options": request.options,
                "allowCustomAnswer": request.allow_custom_answer,
                "detail": request.detail,
            })
        })
        .unwrap_or(Value::Null);
    Ok(snapshot)
}

pub(crate) fn memory_audit(payload: Value) -> AgentRuntimeResult<Value> {
    let snapshot = memory_snapshot(payload)?;
    let root = runtime_root_for_memory()?;
    let long_term = long_term_memory_audit(&root)?;
    let session_id = snapshot
        .pointer("/session/sessionId")
        .and_then(Value::as_str)
        .map(str::to_string);
    let all_records = list_long_term_memory(
        &root,
        MemoryQuery {
            include_archived: true,
            limit: 500,
            ..MemoryQuery::default()
        },
    )?;
    let cleanup_candidates = cleanup_long_term_memory_candidates(&root, 50)?;
    let low_confidence_records = all_records
        .iter()
        .filter(|record| record.status == "active" && record.confidence < 0.7)
        .take(24)
        .map(memory_summary_json)
        .collect::<Vec<_>>();
    let stale_records = cleanup_candidates
        .iter()
        .filter(|candidate| {
            candidate
                .get("reasons")
                .and_then(Value::as_array)
                .is_some_and(|reasons| reasons.iter().any(|reason| reason == "stale"))
        })
        .take(24)
        .cloned()
        .collect::<Vec<_>>();
    let conflicting_records = all_records
        .iter()
        .filter(|record| {
            record
                .related_to
                .iter()
                .any(|relation| relation.relation == "contradicts")
        })
        .take(24)
        .map(memory_summary_json)
        .collect::<Vec<_>>();
    let heavily_used_records = all_records
        .iter()
        .filter(|record| record.access_count >= 5)
        .take(24)
        .map(memory_summary_json)
        .collect::<Vec<_>>();
    let pending_candidates = list_memory_candidates(&root, Some("pending"), 50)?
        .iter()
        .map(memory_candidate_json)
        .collect::<Vec<_>>();
    let current_injection = session_id
        .as_deref()
        .map(|id| explain_memory_injection(&root, id, None))
        .transpose()?
        .unwrap_or_else(|| json!({ "selected": [] }));
    let session_ledger = session_id
        .as_deref()
        .map(|id| session_ledger_summary(&root, id))
        .unwrap_or(Value::Null);
    let health = if !conflicting_records.is_empty() {
        "needs_review"
    } else if !cleanup_candidates.is_empty() || !pending_candidates.is_empty() {
        "attention_recommended"
    } else {
        "healthy"
    };
    Ok(json!({
        "sessionId": session_id,
        "health": health,
        "events": snapshot.get("timelineProjection").cloned().unwrap_or_else(|| json!([])),
        "runtimeTurns": snapshot.get("runtimeTurns").cloned().unwrap_or_else(|| json!([])),
        "longTermMemory": long_term,
        "lowConfidenceRecords": low_confidence_records,
        "staleRecords": stale_records,
        "conflictingRecords": conflicting_records,
        "heavilyUsedRecords": heavily_used_records,
        "cleanupCandidates": cleanup_candidates,
        "memoryCandidates": pending_candidates,
        "currentInjection": current_injection,
        "sessionLedger": session_ledger,
    }))
}

pub(crate) fn recover_memory(payload: Value) -> AgentRuntimeResult<Value> {
    let (session_id, callback, projection, recovered_turn_id, reason) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let session_id = state.resolve_session_id(string_opt(&payload, "sessionId"))?;
        let shared_memory = list_long_term_memory(
            &state.root,
            MemoryQuery {
                layer: Some(LAYER_SHARED.to_string()),
                limit: 24,
                ..MemoryQuery::default()
            },
        )?;
        let frozen_memory = list_long_term_memory(
            &state.root,
            MemoryQuery {
                layer: Some(LAYER_FROZEN.to_string()),
                limit: 24,
                ..MemoryQuery::default()
            },
        )?;
        let active_clarification = active_clarification_projection(&state, &session_id);
        let session = state
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        let active_turn_id = session
            .snapshot
            .get("activeTurnId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| recoverable_runtime_turn_id(session));
        let reason = active_turn_id
            .as_ref()
            .map(|_| "recovered_interrupted_turn".to_string())
            .unwrap_or_else(|| "noRecoverableTurn".to_string());
        if let Some(turn_id) = active_turn_id.as_ref() {
            session.snapshot["turnStatus"] = Value::String("cancelled".to_string());
            session.snapshot["activeTurnId"] = Value::Null;
            session.snapshot["follow"] = json!({ "running": false, "activity": Value::Null });
            finish_running_tools_for_turn(
                session,
                turn_id,
                "cancelled",
                cancelled_tool_output(
                    CANCEL_REASON_SESSION_RECOVERY,
                    "Lyra tool call was cancelled during session recovery.",
                    "Retry the tool call in a new turn if it is still needed.",
                    None,
                ),
            );
            update_runtime_turn_state(
                session,
                turn_id,
                "interrupted",
                Some("recover_after_reload"),
            );
        }
        let mut projection = memory_projection_for_session(
            session,
            &shared_memory,
            &frozen_memory,
            active_clarification,
        );
        projection["recoveryState"] = json!({
            "activeTurnId": active_turn_id,
            "reason": reason,
        });
        session.snapshot["memory"] = projection.clone();
        touch_session(session);
        let callback = event_callback();
        state.save_state()?;
        (session_id, callback, projection, active_turn_id, reason)
    };
    emit_with_callback(
        &callback,
        json!({ "kind": "memoryUpdated", "sessionId": session_id, "snapshot": projection }),
    );
    if let Some(turn_id) = recovered_turn_id.as_ref() {
        emit_with_callback(
            &callback,
            json!({ "kind": "turnRecovered", "sessionId": session_id, "turnId": turn_id }),
        );
        emit_with_callback(
            &callback,
            json!({ "kind": "turnInterrupted", "sessionId": session_id, "turnId": turn_id, "reason": reason }),
        );
    }
    Ok(json!({
        "sessionId": session_id,
        "recovered": recovered_turn_id.is_some(),
        "turnId": recovered_turn_id,
        "reason": reason,
    }))
}

pub(crate) fn active_clarification_projection(
    state: &NativeRuntimeState,
    session_id: &str,
) -> Option<Value> {
    state
        .pending_clarifications
        .values()
        .find(|request| request.session_id == session_id && request.answer.is_none())
        .map(|request| {
            json!({
                "clarificationId": request.id,
                "question": request.question,
                "options": request.options,
                "allowCustomAnswer": request.allow_custom_answer,
                "detail": request.detail,
            })
        })
}

fn memory_fact_projection_json(record: &LongTermMemoryRecord) -> Value {
    json!({
        "id": record.id,
        "scope": record.scope,
        "category": record.category,
        "fact": record.fact,
        "content": record.content,
        "layer": record.layer,
        "valueClass": record.value_class,
        "abstractText": record.abstract_text,
        "confidence": record.confidence,
        "sourceType": record.source_type,
        "status": record.status,
        "updatedAt": record.updated_at,
        "priority": record.priority,
        "lastAccessedAt": record.last_accessed_at,
        "accessCount": record.access_count,
        "tags": record.tags,
        "relatedTo": record.related_to,
        "revision": record.revision,
    })
}

pub(crate) fn memory_projection_for_session(
    session: &NativeSession,
    shared_memory: &[LongTermMemoryRecord],
    frozen_memory: &[LongTermMemoryRecord],
    active_clarification: Option<Value>,
) -> Value {
    let messages = snapshot_array(&session.snapshot, "messages");
    let tools = snapshot_array(&session.snapshot, "tools");
    let latest_user_intent = {
        let text = latest_user_text(&messages);
        (!text.trim().is_empty()).then_some(text)
    };
    let latest_todos = snapshot_array(&session.snapshot, "todos");
    let tool_evidence = tools
        .iter()
        .rev()
        .take(12)
        .map(|tool| {
            json!({
                "kind": "tool_evidence",
                "toolId": tool.get("id").cloned().unwrap_or(Value::Null),
                "name": tool.get("name").cloned().unwrap_or(Value::Null),
                "status": tool.get("status").cloned().unwrap_or(Value::Null),
                "label": tool.get("label").cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();
    let timeline = messages
        .iter()
        .filter(|message| !crate::context_builder::excludes_provider_context(message))
        .rev()
        .take(24)
        .map(timeline_stub)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>();
    let shared_facts = shared_memory
        .iter()
        .take(24)
        .map(memory_fact_projection_json)
        .collect::<Vec<_>>();
    let frozen_facts = frozen_memory
        .iter()
        .take(24)
        .map(memory_fact_projection_json)
        .collect::<Vec<_>>();
    let long_term_facts = shared_facts
        .iter()
        .chain(frozen_facts.iter())
        .cloned()
        .collect::<Vec<_>>();
    let injection_plan = json!({
        "sharedQuota": 5,
        "frozenQuota": 3,
        "preferLayers": [LAYER_FROZEN, LAYER_SHARED],
    });
    let active_turn_id = session
        .snapshot
        .get("activeTurnId")
        .and_then(Value::as_str)
        .map(str::to_string);
    let pinned_items =
        super::pinned_context::collect_pinned_items(session, active_clarification.as_ref());
    json!({
        "pinnedContext": super::pinned_context::pinned_context_json(&pinned_items),
        "contextWindow": {
            "segments": ["head", "pinned", "middle", "tail"],
            "pinnedCount": pinned_items.len(),
        },
        "activeTodos": latest_todos.clone(),
        "sessionFacts": {
            "facts": [
                {
                    "kind": "latest_user_intent",
            "content": latest_user_intent.clone(),
                },
                {
                    "kind": "active_clarification",
                    "content": active_clarification,
                }
            ]
        },
        "workingMemory": {
            "activeTurnId": active_turn_id.clone(),
            "latestUserIntent": latest_user_intent,
            "activeClarification": active_clarification.clone(),
        },
        "sessionMemory": {
            "activeTodos": latest_todos,
            "timeline": timeline.clone(),
            "toolEvidence": tool_evidence.clone(),
            "recoveryState": {
                "activeTurnId": active_turn_id.clone(),
                "reason": if active_turn_id.is_some() { "active_turn" } else { "idle" },
            },
        },
        "layerModel": {
            "layers": MEMORY_LAYERS,
            "primaryFacts": {
                "shared": { "facts": shared_facts.clone() },
                "frozen": { "facts": frozen_facts.clone() },
            },
            "injectionPlan": injection_plan,
        },
        "sharedFacts": { "facts": shared_facts },
        "frozenFacts": { "facts": frozen_facts },
        "longTermMemory": {
            "facts": long_term_facts,
            "deprecated": true,
            "useInstead": ["sharedFacts", "frozenFacts"],
        },
        "recoveryState": {
            "activeTurnId": active_turn_id,
            "reason": if active_turn_id.is_some() { "active_turn" } else { "idle" },
        },
        "timeline": timeline,
        "toolEvidence": tool_evidence,
    })
}

const TOOL_FULL_RECENT_RETAIN_COUNT: usize = 24;
const TOOL_PRUNED_CONTENT_CHARS: usize = 1_200;
const TOOL_RAW_PRUNE_BYTES: usize = 4_096;

pub(crate) fn prune_transient_tool_outputs(session: &mut NativeSession) -> Value {
    let Some(tools) = session
        .snapshot
        .get_mut("tools")
        .and_then(Value::as_array_mut)
    else {
        return json!({ "pruned": 0, "keptFullRecent": 0 });
    };
    if tools.len() <= TOOL_FULL_RECENT_RETAIN_COUNT {
        return json!({ "pruned": 0, "keptFullRecent": tools.len() });
    }
    let full_start = tools.len().saturating_sub(TOOL_FULL_RECENT_RETAIN_COUNT);
    let mut pruned = 0_usize;
    for tool in tools.iter_mut().take(full_start) {
        if should_prune_tool_raw(tool) && prune_tool_raw(tool) {
            pruned += 1;
        }
    }
    json!({
        "pruned": pruned,
        "keptFullRecent": TOOL_FULL_RECENT_RETAIN_COUNT,
        "policy": "old_transient_tool_raw_pruned",
    })
}

fn should_prune_tool_raw(tool: &Value) -> bool {
    if tool.get("status").and_then(Value::as_str) != Some("completed") {
        return false;
    }
    if tool.pointer("/retention/policy").and_then(Value::as_str)
        == Some("old_transient_tool_raw_pruned")
    {
        return false;
    }
    let name = tool.get("name").and_then(Value::as_str).unwrap_or("");
    let action = tool
        .pointer("/input/action")
        .and_then(Value::as_str)
        .unwrap_or("");
    if is_high_value_tool(name, action) {
        return false;
    }
    if is_transient_tool(name, action) {
        return true;
    }
    let raw_bytes = tool
        .pointer("/output/raw")
        .and_then(|raw| serde_json::to_string(raw).ok())
        .map(|text| text.len())
        .unwrap_or(0);
    raw_bytes >= TOOL_RAW_PRUNE_BYTES
}

fn is_high_value_tool(name: &str, action: &str) -> bool {
    matches!(
        name,
        "memory"
            | "clarification"
            | "permission"
            | "todo"
            | "software"
            | "software_invoke_capability"
            | "file_write"
            | "file_edit"
            | "file_multiedit"
            | "apply_patch"
    ) || matches!(
        (name, action),
        ("lyra_lumen", "act")
            | ("lyra_lumen", "type")
            | ("lyra_lumen", "press")
            | ("lyra_lumen", "submit")
            | ("lyra_lumen", "navigate")
            | ("lyra_lumen", "reload")
            | ("lyra_lumen", "elevate")
            | ("lyra_lumen", "see")
            | ("lyra_lumen", "detect_qr")
    )
}

fn is_transient_tool(name: &str, action: &str) -> bool {
    matches!(
        (name, action),
        ("lyra_lumen", "map")
            | ("lyra_lumen", "focus_scan")
            | ("lyra_lumen", "read")
            | ("lyra_lumen", "scroll")
            | ("lyra_lumen", "scroll_to_target")
            | ("lyra_lumen", "ensure_visible")
            | ("lyra_lumen", "wait")
            | ("lyra_lumen", "read_until")
            | ("lyra_lumen", "reveal")
            | ("lyra_lumen", "follow_audit")
            | ("lyra_lumen", "explain_target")
            | ("lyra_lumen", "audit")
            | ("lyra_lumen", "detect_qr")
    ) || matches!(
        name,
        "file_read"
            | "file_list"
            | "file_glob"
            | "project_search"
            | "code_search_text"
            | "code_search_symbol"
            | "code_graph_expand"
            | "lsp_query"
            | "web_search"
            | "web_fetch"
    )
}

fn prune_tool_raw(tool: &mut Value) -> bool {
    let Some(output) = tool.get_mut("output").and_then(Value::as_object_mut) else {
        return false;
    };
    if output
        .get("raw")
        .and_then(|raw| raw.get("retention"))
        .is_some()
    {
        return false;
    }
    let raw = output.get("raw").cloned().unwrap_or(Value::Null);
    if raw.is_null() {
        return false;
    }
    let original_raw_bytes = serde_json::to_string(&raw)
        .map(|text| text.len())
        .unwrap_or(0);
    let content = output
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let summary = truncate_memory_text(&content, TOOL_PRUNED_CONTENT_CHARS);
    let artifact_ref = raw
        .get("artifactRef")
        .cloned()
        .or_else(|| raw.get("artifact").cloned())
        .or_else(|| raw.pointer("/imageArtifact/path").cloned());
    output.insert("content".to_string(), Value::String(summary.clone()));
    output.insert(
        "raw".to_string(),
        json!({
            "retention": {
                "policy": "old_transient_tool_raw_pruned",
                "reason": "old low-value tool raw payload was removed from local session storage; UI summary remains visible",
                "originalRawBytes": original_raw_bytes,
                "keptContentChars": summary.chars().count(),
            },
            "summary": summary,
            "artifactRef": artifact_ref,
        }),
    );
    tool["retention"] = json!({
        "policy": "old_transient_tool_raw_pruned",
        "reason": "old low-value tool raw payload was removed from local session storage",
    });
    true
}

fn timeline_stub(message: &Value) -> Value {
    json!({
        "id": message.get("id").cloned().unwrap_or(Value::Null),
        "role": message.get("role").cloned().unwrap_or(Value::Null),
        "text": timeline_preview_text(message),
    })
}

fn timeline_preview_text(message: &Value) -> String {
    let text = message.get("text").and_then(Value::as_str).unwrap_or("");
    let mut chars = text.chars();
    let preview: String = chars.by_ref().take(480).collect();
    if chars.next().is_some() {
        format!("{preview}…")
    } else {
        preview
    }
}

fn truncate_memory_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    format!(
        "{}\n\n[old transient tool raw pruned by Lyra retention policy]",
        value.chars().take(max_chars).collect::<String>().trim_end()
    )
}

pub(crate) fn recoverable_runtime_turn_id(session: &NativeSession) -> Option<String> {
    session.runtime_turns.iter().rev().find_map(|turn| {
        let state = turn.get("state").and_then(Value::as_str)?;
        matches!(
            state,
            "queued"
                | "assembling_context"
                | "calling_model"
                | "streaming_model"
                | "waiting_for_tool"
                | "recovering_after_reload"
                | "recovering_after_crash"
                | "interrupted"
        )
        .then(|| {
            turn.get("runtimeTurnId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        })
    })
}

pub(crate) fn memory_snapshot_for_session(session: &NativeSession, config: &NativeConfig) -> Value {
    let snapshot = &session.snapshot;
    let updated = snapshot
        .get("updatedAt")
        .and_then(Value::as_str)
        .unwrap_or(&session.created_at);
    let messages = snapshot
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let timeline = messages
        .iter()
        .map(|message| {
            let role = message.get("role").and_then(Value::as_str).unwrap_or("runtime");
            json!({
                "eventId": message.get("id").cloned().unwrap_or_else(|| Value::String(format!("event-{}", Uuid::new_v4()))),
                "runtimeTurnId": Value::Null,
                "kind": format!("{role}_message"),
                "role": role,
                "payloadJson": message,
                "createdAtMs": iso_ms(message.get("createdAt").and_then(Value::as_str).unwrap_or(updated)),
                "createdAtIso": message.get("createdAt").and_then(Value::as_str).unwrap_or(updated),
            })
        })
        .collect::<Vec<_>>();
    json!({
        "session": {
            "sessionId": session.id,
            "title": snapshot.get("title").cloned().unwrap_or(Value::Null),
            "workingDir": snapshot.get("workingDir").cloned().unwrap_or(Value::Null),
            "providerKey": config.default_provider,
            "model": config.default_model,
            "status": snapshot.get("turnStatus").cloned().unwrap_or_else(|| Value::String("idle".to_string())),
            "schemaVersion": 1,
            "createdAtMs": iso_ms(&session.created_at),
            "createdAtIso": session.created_at,
            "updatedAtMs": iso_ms(updated),
            "updatedAtIso": updated,
        },
        "runtimeTurns": session.runtime_turns,
        "timelineProjection": timeline,
        "activeTodos": snapshot.get("todos").cloned().unwrap_or_else(|| json!([])),
        "activeBrowserTargets": [],
        "activeClarification": Value::Null,
        "status": snapshot.get("turnStatus").cloned().unwrap_or_else(|| Value::String("idle".to_string())),
        "providerLabel": provider_label(config),
        "modelLabel": config.default_model,
    })
}

fn with_longterm_deprecation(mut value: Value) -> Value {
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "_deprecated".to_string(),
            json!({
                "api": "agent.memory.longterm.*",
                "useInstead": {
                    "shared": "agent.memory.shared.*",
                    "frozen": "agent.memory.frozen.*",
                },
            }),
        );
    }
    value
}

pub(crate) fn long_term_memory_create(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let mutation = memory_create_mutation(&payload)?;
    let record = create_long_term_memory(&root, mutation)?;
    Ok(with_longterm_deprecation(json!({
        "record": memory_record_json(&record),
        "records": list_memory_summaries(&root, MemoryQuery { limit: 24, ..MemoryQuery::default() })?,
    })))
}

pub(crate) fn long_term_memory_search(payload: Value) -> AgentRuntimeResult<Value> {
    if string_opt(&payload, "query").is_none() {
        return long_term_memory_list(payload);
    }
    let root = runtime_root_for_memory()?;
    let query = memory_query_from_payload(&payload, true);
    let query_text = query.query.clone();
    let working_dir =
        string_opt(&payload, "workingDir").or_else(|| string_opt(&payload, "working_dir"));
    let explain = query.explain;
    let records = search_ranked_long_term_memory(&root, query)?;
    let session_recall = query_text
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|text| {
            match select_system_recall_for_injection(&root, None, text, working_dir.as_deref(), &[])
            {
                Ok(mut recall) => {
                    recall.retain(|record| record.item.source_kind == "session_message");
                    system_recall_json(&recall)
                }
                Err(error) => json!({
                    "selectedCount": 0,
                    "records": [],
                    "error": error.to_string(),
                }),
            }
        })
        .unwrap_or_else(|| {
            json!({
                "selectedCount": 0,
                "records": [],
            })
        });
    Ok(with_longterm_deprecation(json!({
        "records": records.iter().map(|record| ranked_memory_json(record, explain)).collect::<Vec<_>>(),
        "sessionRecall": session_recall,
    })))
}

pub(crate) fn long_term_memory_update(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let record = update_long_term_memory(&root, memory_update_mutation(&payload)?)?;
    Ok(with_longterm_deprecation(
        json!({ "record": memory_record_json(&record) }),
    ))
}

pub(crate) fn long_term_memory_forget(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let mode = string_opt(&payload, "mode").unwrap_or_else(|| "archive".to_string());
    let reason = string_opt(&payload, "reason");
    if let Some(id) = string_opt(&payload, "id").filter(|value| !value.trim().is_empty()) {
        let result = forget_long_term_memory(&root, &id, &mode, reason.as_deref())?;
        return Ok(json!({ "result": result }));
    }
    let ids = string_array_opt(&payload, "ids").unwrap_or_default();
    if ids.is_empty() {
        return Err(AgentRuntimeError::Core(
            "memory id or ids is required".to_string(),
        ));
    }
    let mut results = Vec::new();
    for id in ids {
        results.push(forget_long_term_memory(
            &root,
            &id,
            &mode,
            reason.as_deref(),
        )?);
    }
    Ok(json!({
        "result": {
            "mode": mode,
            "reason": reason,
            "count": results.len(),
            "records": results,
        }
    }))
}

pub(crate) fn long_term_memory_list(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let query = memory_query_from_payload(&payload, false);
    Ok(json!({
        "records": list_memory_summaries(&root, query)?,
    }))
}

pub(crate) fn long_term_memory_link(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let source_id = string_opt(&payload, "sourceId")
        .or_else(|| string_opt(&payload, "source_id"))
        .ok_or_else(|| AgentRuntimeError::Core("memory source_id is required".to_string()))?;
    let target_id = string_opt(&payload, "targetId")
        .or_else(|| string_opt(&payload, "target_id"))
        .ok_or_else(|| AgentRuntimeError::Core("memory target_id is required".to_string()))?;
    let relation = string_opt(&payload, "relation").unwrap_or_else(|| "related_to".to_string());
    let confidence = payload
        .get("confidence")
        .and_then(Value::as_f64)
        .unwrap_or(1.0);
    let relation = link_long_term_memory(&root, &source_id, &target_id, &relation, confidence)?;
    Ok(json!({ "relation": relation }))
}

pub(crate) fn long_term_memory_rebuild_index(_payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    rebuild_long_term_memory_index(&root)
}

pub(crate) fn long_term_memory_cleanup_candidates(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let limit = payload
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(50)
        .min(500) as usize;
    Ok(json!({
        "candidates": cleanup_long_term_memory_candidates(&root, limit)?,
    }))
}

pub(crate) fn shared_memory_search(payload: Value) -> AgentRuntimeResult<Value> {
    let mut payload = payload;
    if payload.get("layer").is_none() {
        match payload {
            Value::Object(mut object) => {
                object.insert("layer".to_string(), Value::String(LAYER_SHARED.to_string()));
                payload = Value::Object(object);
            }
            _ => {
                payload = json!({
                    "layer": LAYER_SHARED,
                    "query": payload,
                });
            }
        }
    }
    long_term_memory_search(payload)
}

pub(crate) fn frozen_memory_search(payload: Value) -> AgentRuntimeResult<Value> {
    let mut payload = payload;
    match payload {
        Value::Object(mut object) => {
            object.insert("layer".to_string(), Value::String(LAYER_FROZEN.to_string()));
            payload = Value::Object(object);
        }
        _ => {
            payload = json!({
                "layer": LAYER_FROZEN,
                "query": payload,
            });
        }
    }
    long_term_memory_search(payload)
}

pub(crate) fn shared_memory_update(payload: Value) -> AgentRuntimeResult<Value> {
    let content = payload.get("content").cloned().unwrap_or(Value::Null);
    let mut mapped = payload.as_object().cloned().unwrap_or_default();
    if !mapped.contains_key("fact") {
        if let Some(fact) = content.get("fact").and_then(Value::as_str) {
            mapped.insert("fact".to_string(), Value::String(fact.to_string()));
        } else if !content.is_null() {
            mapped.insert(
                "fact".to_string(),
                Value::String(serde_json::to_string(&content).unwrap_or_default()),
            );
        }
    }
    mapped.insert("content".to_string(), content);
    if !mapped.contains_key("layer") {
        mapped.insert("layer".to_string(), Value::String(LAYER_SHARED.to_string()));
    }
    if !mapped.contains_key("sourceType") {
        let source_type = mapped
            .get("source")
            .and_then(Value::as_str)
            .map(|source| match source {
                "goal_state" => "goal_sync",
                "user_declaration" => "user_declaration",
                "project_fact" => "project_fact",
                "tool_observation" => "tool_observation",
                "imported" => "imported",
                _ => "agent_inference",
            })
            .unwrap_or("agent_inference");
        mapped.insert(
            "sourceType".to_string(),
            Value::String(source_type.to_string()),
        );
    }
    long_term_memory_create(Value::Object(mapped))
}

pub(crate) const SHARED_MEMORY_INJECTION_LIMIT: usize = 8;

#[cfg(test)]
pub(crate) fn select_shared_memory_for_injection(
    records: &mut [LongTermMemoryRecord],
    latest_user_text: &str,
    working_dir: Option<&str>,
    limit: usize,
) -> Vec<LongTermMemoryRecord> {
    if limit == 0 {
        return Vec::new();
    }
    let terms = memory_query_terms(latest_user_text, working_dir);
    let mut scored = records
        .iter()
        .enumerate()
        .filter(|(_, record)| record.status == "active")
        .map(|(index, record)| {
            let text = serde_json::to_string(record)
                .unwrap_or_default()
                .to_lowercase();
            let relevance = terms
                .iter()
                .filter(|term| text.contains(term.as_str()))
                .count() as i64;
            let stale_bonus = if record.last_accessed_at.is_none() {
                24
            } else {
                0
            };
            let rotation_penalty = (record.access_count.min(100) as i64) * 6;
            let score = record.priority + relevance * 18 + stale_bonus - rotation_penalty;
            (
                index,
                score,
                record.access_count,
                record.last_accessed_at.clone(),
            )
        })
        .collect::<Vec<_>>();
    scored.sort_by(|left, right| {
        right
            .1
            .cmp(&left.1)
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| left.3.cmp(&right.3))
            .then_with(|| left.0.cmp(&right.0))
    });
    let selected_indices = scored
        .into_iter()
        .take(limit)
        .map(|(index, _, _, _)| index)
        .collect::<Vec<_>>();
    let injected_at = now();
    let mut selected = Vec::new();
    for index in selected_indices {
        if let Some(record) = records.get_mut(index) {
            record.access_count = record.access_count.saturating_add(1);
            record.last_accessed_at = Some(injected_at.clone());
            selected.push(record.clone());
        }
    }
    selected
}

pub(crate) fn select_ranked_long_term_memory_for_injection(
    root: &Path,
    latest_user_text: &str,
    working_dir: Option<&str>,
    limit: usize,
) -> AgentRuntimeResult<Vec<RankedMemoryRecord>> {
    expand_long_term_memory_injection(root, latest_user_text, working_dir, limit)
}

pub(crate) fn shared_memory_prompt(records: &[RankedMemoryRecord]) -> String {
    if records.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "Lyra shared memory slice L0/L1/L2. Frozen facts protected; shared facts corrigible. Prefer newer member instr on conflict.".to_string(),
    ];
    for (index, ranked) in records.iter().enumerate() {
        lines.push(format_ranked_memory_injection_line(index, ranked));
    }
    lines.join("\n")
}

#[cfg(test)]
fn memory_query_terms(latest_user_text: &str, working_dir: Option<&str>) -> Vec<String> {
    let mut terms = Vec::new();
    for source in [Some(latest_user_text), working_dir].into_iter().flatten() {
        let lower = source.to_lowercase();
        if lower.chars().count() >= 4 {
            terms.push(lower.clone());
        }
        for term in lower
            .split(|character: char| !character.is_alphanumeric())
            .map(str::trim)
            .filter(|term| term.chars().count() >= 3)
        {
            if !terms.iter().any(|existing| existing == term) {
                terms.push(term.to_string());
            }
        }
    }
    terms
}

pub(crate) fn runtime_root_for_memory() -> AgentRuntimeResult<PathBuf> {
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    Ok(state.root.clone())
}

fn list_memory_summaries(root: &Path, query: MemoryQuery) -> AgentRuntimeResult<Vec<Value>> {
    Ok(list_long_term_memory(root, query)?
        .iter()
        .map(memory_summary_json)
        .collect())
}

fn memory_create_mutation(payload: &Value) -> AgentRuntimeResult<MemoryMutation> {
    if let Some(content) = payload.get("content") {
        super::secret_guard::validate_memory_content_value(content)?;
    }
    let fact = string_opt(payload, "fact")
        .or_else(|| {
            payload
                .get("content")
                .and_then(|content| content.get("fact"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AgentRuntimeError::Core("memory fact is required".to_string()))?;
    super::secret_guard::validate_memory_fact(&fact)?;
    Ok(MemoryMutation {
        id: string_opt(payload, "id"),
        scope: string_opt(payload, "scope"),
        category: string_opt(payload, "category").or_else(|| {
            payload
                .get("content")
                .and_then(|content| content.get("category"))
                .and_then(Value::as_str)
                .map(str::to_string)
        }),
        fact: Some(fact),
        content: payload.get("content").cloned(),
        layer: string_opt(payload, "layer"),
        value_class: string_opt(payload, "valueClass")
            .or_else(|| string_opt(payload, "value_class")),
        abstract_text: string_opt(payload, "abstractText")
            .or_else(|| string_opt(payload, "abstract_text")),
        confidence: payload.get("confidence").and_then(Value::as_f64),
        source_type: string_opt(payload, "sourceType")
            .or_else(|| string_opt(payload, "source_type")),
        source_ref: string_opt(payload, "sourceRef").or_else(|| string_opt(payload, "source_ref")),
        status: string_opt(payload, "status"),
        priority: payload.get("priority").and_then(Value::as_i64),
        tags: string_array_opt(payload, "tags"),
        related_to: memory_relations_from_payload(payload),
        expires_at: string_opt(payload, "expiresAt").or_else(|| string_opt(payload, "expires_at")),
        supersedes: string_opt(payload, "supersedes"),
        superseded_by: string_opt(payload, "supersededBy")
            .or_else(|| string_opt(payload, "superseded_by")),
        ..MemoryMutation::default()
    })
}

fn memory_update_mutation(payload: &Value) -> AgentRuntimeResult<MemoryMutation> {
    let id = string_opt(payload, "id")
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AgentRuntimeError::Core("memory id is required".to_string()))?;
    let mut mutation = memory_create_mutation(&json!({
        "fact": payload.get("fact").and_then(Value::as_str).unwrap_or("__unchanged__")
    }))?;
    mutation.id = Some(id);
    mutation.fact = string_opt(payload, "fact");
    mutation.scope = string_opt(payload, "scope");
    mutation.category = string_opt(payload, "category");
    mutation.content = payload.get("content").cloned();
    mutation.layer = string_opt(payload, "layer");
    mutation.value_class =
        string_opt(payload, "valueClass").or_else(|| string_opt(payload, "value_class"));
    mutation.abstract_text =
        string_opt(payload, "abstractText").or_else(|| string_opt(payload, "abstract_text"));
    mutation.confidence = payload.get("confidence").and_then(Value::as_f64);
    mutation.source_type =
        string_opt(payload, "sourceType").or_else(|| string_opt(payload, "source_type"));
    mutation.source_ref =
        string_opt(payload, "sourceRef").or_else(|| string_opt(payload, "source_ref"));
    mutation.status = string_opt(payload, "status");
    mutation.priority = payload.get("priority").and_then(Value::as_i64);
    mutation.tags = string_array_opt(payload, "tags");
    mutation.related_to = memory_relations_from_payload(payload);
    mutation.expires_at =
        string_opt(payload, "expiresAt").or_else(|| string_opt(payload, "expires_at"));
    mutation.supersedes = string_opt(payload, "supersedes");
    mutation.superseded_by =
        string_opt(payload, "supersededBy").or_else(|| string_opt(payload, "superseded_by"));
    mutation.revision = payload
        .get("expectedRevision")
        .or_else(|| payload.get("expected_revision"))
        .and_then(Value::as_u64);
    Ok(mutation)
}

pub(crate) fn memory_layers_describe(payload: Value) -> AgentRuntimeResult<Value> {
    let root = runtime_root_for_memory()?;
    let session_id = string_opt(&payload, "sessionId");
    let mut live_message_count = 0_usize;
    if let Some(session_id) = session_id.as_deref() {
        let state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        if let Some(session) = state.sessions.get(session_id) {
            live_message_count = snapshot_array(&session.snapshot, "messages").len();
        }
    }
    let shared_count = list_long_term_memory(
        &root,
        MemoryQuery {
            layer: Some(LAYER_SHARED.to_string()),
            status: Some("active".to_string()),
            limit: 500,
            ..MemoryQuery::default()
        },
    )?
    .len();
    let frozen_count = list_long_term_memory(
        &root,
        MemoryQuery {
            layer: Some(LAYER_FROZEN.to_string()),
            status: Some("active".to_string()),
            limit: 500,
            ..MemoryQuery::default()
        },
    )?
    .len();
    let cut_count = count_cut_archive_recall_items(&root, session_id.as_deref())?;
    Ok(json!({
        "layers": [
            {
                "layer": LAYER_LIVE,
                "storage": "session snapshot",
                "messageCount": live_message_count,
                "api": ["agent.session.*", "agent.memory.snapshot"],
            },
            {
                "layer": LAYER_CUT,
                "storage": "sessions/<id>/cuts + recall_items",
                "archiveCount": cut_count,
                "api": ["agent.memory.recall", "session trim"],
            },
            {
                "layer": LAYER_SHARED,
                "storage": "memory.sqlite",
                "activeCount": shared_count,
                "api": ["agent.memory.shared.search", "agent.memory.shared.update"],
            },
            {
                "layer": LAYER_FROZEN,
                "storage": "memory.sqlite",
                "activeCount": frozen_count,
                "api": ["agent.memory.frozen.search", "agent.memory.frozen.create", "agent.memory.frozen.update", "agent.memory.frozen.forget"],
            },
        ],
        "physicalStore": "single memory.sqlite with logical layer field",
    }))
}

pub(crate) fn frozen_memory_create(payload: Value) -> AgentRuntimeResult<Value> {
    let mut mapped = payload.as_object().cloned().unwrap_or_default();
    mapped.insert("layer".to_string(), Value::String(LAYER_FROZEN.to_string()));
    long_term_memory_create(Value::Object(mapped))
}

pub(crate) fn frozen_memory_update(payload: Value) -> AgentRuntimeResult<Value> {
    let mut mapped = payload.as_object().cloned().unwrap_or_default();
    mapped.insert("layer".to_string(), Value::String(LAYER_FROZEN.to_string()));
    long_term_memory_update(Value::Object(mapped))
}

pub(crate) fn frozen_memory_forget(payload: Value) -> AgentRuntimeResult<Value> {
    long_term_memory_forget(payload)
}

fn memory_query_from_payload(payload: &Value, touch_access: bool) -> MemoryQuery {
    MemoryQuery {
        query: string_opt(payload, "query"),
        scope: string_opt(payload, "scope"),
        category: string_opt(payload, "category"),
        layer: string_opt(payload, "layer"),
        value_class: string_opt(payload, "valueClass")
            .or_else(|| string_opt(payload, "value_class")),
        status: string_opt(payload, "status"),
        include_archived: payload
            .get("includeArchived")
            .or_else(|| payload.get("include_archived"))
            .and_then(Value::as_bool)
            .unwrap_or(false),
        include_related: payload
            .get("includeRelated")
            .or_else(|| payload.get("include_related"))
            .and_then(Value::as_bool)
            .unwrap_or(touch_access),
        explain: payload
            .get("explain")
            .and_then(Value::as_bool)
            .unwrap_or(true),
        min_score: payload
            .get("minScore")
            .or_else(|| payload.get("min_score"))
            .and_then(Value::as_f64),
        limit: payload
            .get("limit")
            .and_then(Value::as_u64)
            .unwrap_or(24)
            .min(500) as usize,
        offset: payload.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize,
        touch_access,
        access_type: if touch_access {
            "tool_search".to_string()
        } else {
            "audit".to_string()
        },
    }
}

fn string_array_opt(payload: &Value, key: &str) -> Option<Vec<String>> {
    payload.get(key).and_then(Value::as_array).map(|items| {
        items
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>()
    })
}

fn memory_relations_from_payload(payload: &Value) -> Option<Vec<MemoryRelation>> {
    let items = payload
        .get("relatedTo")
        .or_else(|| payload.get("related_to"))
        .and_then(Value::as_array)?;
    Some(
        items
            .iter()
            .filter_map(|item| {
                let target_id = item
                    .get("targetId")
                    .or_else(|| item.get("target_id"))
                    .or_else(|| item.get("id"))
                    .and_then(Value::as_str)?
                    .to_string();
                Some(MemoryRelation {
                    source_id: item
                        .get("sourceId")
                        .or_else(|| item.get("source_id"))
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string(),
                    target_id,
                    relation: item
                        .get("relation")
                        .and_then(Value::as_str)
                        .unwrap_or("related_to")
                        .to_string(),
                    confidence: item
                        .get("confidence")
                        .and_then(Value::as_f64)
                        .unwrap_or(1.0)
                        .clamp(0.0, 1.0),
                    created_at: item
                        .get("createdAt")
                        .or_else(|| item.get("created_at"))
                        .and_then(Value::as_str)
                        .map(str::to_string)
                        .unwrap_or_else(now),
                })
            })
            .collect(),
    )
}
