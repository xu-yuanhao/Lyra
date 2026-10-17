use super::*;

#[test]
fn memory_tool_persists_shared_memory_for_future_turns() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Memory Test" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-memory",
            "/tools/memory/write",
            json!({
                "scope": "global",
                "category": "user_profile",
                "action": "remember",
                "fact": "The user prefers to be called Xu Yuanhao."
            }),
        ),
    );

    assert!(output["content"].as_str().unwrap().contains("Xu Yuanhao"));
    assert!(
        output["changes"]
            .as_array()
            .is_some_and(|changes| changes.iter().any(|change| {
                change["kind"] == "memory"
                    && change["operation"] == "remember"
                    && change["path"] == "/tools/memory/write"
            }))
    );
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        push_array(
            &mut session.snapshot,
            "messages",
            user_message("What should you call me?".to_string(), Vec::new(), now()),
        );
    }
    let request = build_model_request(&session_id).expect("model request");
    let system_prompt = request.messages[0]["content"]
        .as_str()
        .expect("system prompt");
    let user_text = provider_latest_user_text(&request.messages);
    let env = provider_volatile_appendix(&request.messages);
    assert!(!system_prompt.contains("Xu Yuanhao"));
    assert!(user_text.contains("What should you call me?"));
    assert!(!user_text.contains("Xu Yuanhao"));
    assert!(env.contains("Xu Yuanhao"));
}

#[test]
fn long_term_memory_crud_list_link_forget_and_audit() {
    let backend = LyraAgentBackend;
    let marker = Uuid::new_v4().to_string();
    let first = backend
        .call_agent_method(
            "agent.memory.longterm.create",
            json!({
                "scope": "global",
                "category": "preference",
                "fact": format!("phase one memory preference {marker}"),
                "confidence": 1.0,
                "sourceType": "user_declaration",
                "tags": ["phase-one", marker.clone()]
            }),
        )
        .expect("create first memory");
    let first_id = first["record"]["id"]
        .as_str()
        .expect("first id")
        .to_string();
    let second = backend
        .call_agent_method(
            "agent.memory.longterm.create",
            json!({
                "scope": "project",
                "category": "project",
                "fact": format!("phase one project memory {marker}"),
                "confidence": 0.9,
                "sourceType": "project_fact"
            }),
        )
        .expect("create second memory");
    let second_id = second["record"]["id"]
        .as_str()
        .expect("second id")
        .to_string();

    let search = backend
        .call_agent_method(
            "agent.memory.longterm.search",
            json!({ "query": marker, "limit": 10 }),
        )
        .expect("search memories");
    assert!(search["records"].as_array().expect("records").len() >= 2);
    assert_eq!(search["records"][0]["accessCount"], 1);

    let updated = backend
        .call_agent_method(
            "agent.memory.longterm.update",
            json!({
                "id": first_id,
                "fact": format!("phase one updated preference {marker}"),
                "status": "superseded",
                "supersededBy": second_id,
            }),
        )
        .expect("update memory");
    assert_eq!(updated["record"]["status"], "superseded");

    let linked = backend
        .call_agent_method(
            "agent.memory.longterm.link",
            json!({
                "sourceId": updated["record"]["id"],
                "targetId": second["record"]["id"],
                "relation": "related_to",
                "confidence": 0.8,
            }),
        )
        .expect("link memories");
    assert_eq!(linked["relation"]["relation"], "related_to");

    let listed = backend
        .call_agent_method(
            "agent.memory.longterm.list",
            json!({ "includeArchived": true, "query": marker, "limit": 20 }),
        )
        .expect("list memories");
    assert!(listed["records"].as_array().expect("records").len() >= 2);

    let forgotten = backend
        .call_agent_method(
            "agent.memory.longterm.forget",
            json!({ "id": second_id, "mode": "archive", "reason": "test cleanup" }),
        )
        .expect("forget memory");
    assert_eq!(forgotten["result"]["mode"], "archive");

    let audit = backend
        .call_agent_method("agent.memory.audit", json!({}))
        .expect("memory audit");
    assert!(
        audit
            .pointer("/longTermMemory/counts/total")
            .and_then(Value::as_i64)
            .unwrap_or(0)
            >= 2
    );
    assert!(
        audit
            .pointer("/longTermMemory/relations/byType/related_to")
            .and_then(Value::as_i64)
            .unwrap_or(0)
            >= 1
    );

    let cleanup = backend
        .call_agent_method(
            "agent.memory.longterm.cleanupCandidates",
            json!({ "limit": 500 }),
        )
        .expect("cleanup candidates");
    assert!(cleanup["candidates"].as_array().is_some_and(|candidates| {
        candidates.iter().any(|candidate| {
            candidate.pointer("/record/id").and_then(Value::as_str)
                == updated.pointer("/record/id").and_then(Value::as_str)
        })
    }));

    let batch_forget = backend
        .call_agent_method(
            "agent.memory.longterm.forget",
            json!({
                "ids": [updated["record"]["id"].as_str().expect("updated id")],
                "mode": "archive",
                "reason": "batch cleanup test"
            }),
        )
        .expect("batch forget");
    assert_eq!(batch_forget.pointer("/result/count"), Some(&json!(1)));
}

#[test]
fn memory_schema_migration_restores_superseded_search_without_active_recall() {
    let temp = tempfile::tempdir().expect("tempdir");
    let marker = format!("historical-memory-{}", Uuid::new_v4());
    let created = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            fact: Some(marker.clone()),
            confidence: Some(0.9),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");
    update_long_term_memory(
        temp.path(),
        MemoryMutation {
            id: Some(created.id.clone()),
            status: Some("superseded".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("supersede memory");

    let conn = rusqlite::Connection::open(memory_store_path(temp.path())).expect("open memory db");
    conn.execute("DELETE FROM memory_fts WHERE memory_id = ?1", [&created.id])
        .expect("simulate legacy missing historical index");
    conn.execute("DELETE FROM schema_migrations", [])
        .expect("mark migration pending");
    drop(conn);

    let historical = list_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(marker.clone()),
            include_archived: true,
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("search historical memory");
    assert!(historical.iter().any(|record| record.id == created.id));

    let active = search_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(marker),
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("search active memory");
    assert!(active.is_empty());
}

#[test]
fn memory_tool_activity_keeps_memory_content_out_of_chat_messages() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Memory Activity Isolation" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let marker = Uuid::new_v4().to_string();

    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-memory-isolation",
            "/tools/memory/write",
            json!({
                "scope": "global",
                "category": "other",
                "action": "remember",
                "fact": format!("memory isolation fact {marker}")
            }),
        ),
    );

    assert!(output["content"].as_str().unwrap().contains(&marker));
    let state = state().lock().expect("state lock");
    let session = state.sessions.get(&session_id).expect("session");
    let messages = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .expect("messages");
    assert!(messages.iter().all(|message| {
        !serde_json::to_string(message)
            .expect("serialize message")
            .contains(&marker)
    }));
    assert!(messages.iter().any(|message| {
        message
            .get("blocks")
            .and_then(Value::as_array)
            .is_some_and(|blocks| {
                blocks.iter().any(|block| {
                    block.get("type").and_then(Value::as_str) == Some("tool")
                        && block.get("toolId").and_then(Value::as_str)
                            == Some("tool-memory-isolation")
                })
            })
    }));
    assert!(
        session
            .snapshot
            .get("tools")
            .and_then(Value::as_array)
            .is_some_and(|tools| tools.iter().any(|tool| tool["name"] == "memory"))
    );
}

#[test]
fn memory_search_uses_hybrid_ranker_and_updates_access_stats() {
    let temp = tempfile::tempdir().expect("tempdir");
    let marker = format!("phase2-search-{}", Uuid::new_v4());
    let created = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("preference".to_string()),
            fact: Some(format!(
                "The user prefers concise Chinese summaries for Lyra architecture reviews {marker}"
            )),
            confidence: Some(1.0),
            source_type: Some("user_declaration".to_string()),
            tags: Some(vec!["phase2".to_string(), marker.clone()]),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");

    let conn = rusqlite::Connection::open(memory_store_path(temp.path())).expect("open memory db");
    conn.execute("DELETE FROM memory_fts WHERE memory_id = ?1", [&created.id])
        .expect("delete fts");
    conn.execute(
        "DELETE FROM memory_embeddings WHERE memory_id = ?1",
        [&created.id],
    )
    .expect("delete embedding");
    let rebuilt = rebuild_long_term_memory_index(temp.path()).expect("rebuild index");
    assert_eq!(rebuilt["ftsRecords"], 1);

    let results = search_ranked_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(format!(
                "How should Lyra architecture review summaries be written for the user {marker}"
            )),
            explain: true,
            touch_access: true,
            access_type: "tool_search".to_string(),
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("search memory");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].record.id, created.id);
    assert_eq!(results[0].record.access_count, 1);
    assert!(results[0].breakdown.final_score > 0.0);
    assert!(
        results[0]
            .breakdown
            .matched_by
            .iter()
            .any(|source| source == "fts" || source == "vector" || source == "metadata")
    );

    let rendered = ranked_memory_json(&results[0], true);
    assert!(rendered["score"].as_f64().unwrap_or(0.0) > 0.0);
    assert!(rendered.pointer("/scoreBreakdown/finalScore").is_some());
    assert!(rendered.pointer("/scoreBreakdown/decayPenalty").is_some());
}

#[test]
fn memory_decay_ranks_frequent_user_declarations_above_stale_low_confidence_records() {
    let temp = tempfile::tempdir().expect("tempdir");
    let marker = format!("phase2-decay-{}", Uuid::new_v4());
    let stale = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("other".to_string()),
            fact: Some(format!("temporary inferred operation note {marker}")),
            confidence: Some(0.42),
            source_type: Some("agent_inference".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create stale memory");
    let durable = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("user_profile".to_string()),
            fact: Some(format!("durable user declaration operation note {marker}")),
            confidence: Some(1.0),
            source_type: Some("user_declaration".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create durable memory");
    let old_timestamp =
        (Utc::now() - chrono::Duration::days(180)).to_rfc3339_opts(SecondsFormat::Secs, true);
    let conn = rusqlite::Connection::open(memory_store_path(temp.path())).expect("open memory db");
    conn.execute(
        "UPDATE memories SET updated_at = ?2, access_count = 0, last_accessed_at = NULL WHERE id = ?1",
        rusqlite::params![stale.id, old_timestamp],
    )
    .expect("age stale memory");
    conn.execute(
        "UPDATE memories SET updated_at = ?2, access_count = 50, last_accessed_at = ?2 WHERE id = ?1",
        rusqlite::params![durable.id, old_timestamp],
    )
    .expect("age durable memory");

    let results = search_ranked_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(marker.clone()),
            explain: true,
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("search memory");
    let durable_rank = results
        .iter()
        .position(|entry| entry.record.id == durable.id)
        .expect("durable result");
    let stale_rank = results
        .iter()
        .position(|entry| entry.record.id == stale.id)
        .expect("stale result");
    assert!(durable_rank < stale_rank);
    assert!(
        results[stale_rank].breakdown.decay_penalty > results[durable_rank].breakdown.decay_penalty
    );

    let candidates =
        cleanup_long_term_memory_candidates(temp.path(), 10).expect("cleanup candidates");
    assert!(candidates.iter().any(|candidate| {
        candidate.pointer("/record/id").and_then(Value::as_str) == Some(stale.id.as_str())
            && candidate["reasons"]
                .as_array()
                .is_some_and(|reasons| reasons.iter().any(|reason| reason == "low_confidence"))
    }));
}

#[test]
fn memory_graph_include_related_adds_one_hop_related_records_without_loops() {
    let temp = tempfile::tempdir().expect("tempdir");
    let marker = format!("phase2-graph-{}", Uuid::new_v4());
    let seed = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("project".to_string()),
            category: Some("project".to_string()),
            fact: Some(format!("Lyra browser capability decision seed {marker}")),
            confidence: Some(0.95),
            source_type: Some("project_fact".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create seed memory");
    let related = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("project".to_string()),
            category: Some("instruction".to_string()),
            fact: Some(
                "Use visible follow mode when browser automation is user-facing".to_string(),
            ),
            confidence: Some(0.9),
            source_type: Some("project_fact".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create related memory");
    link_long_term_memory(temp.path(), &seed.id, &related.id, "supports", 0.9)
        .expect("link seed to related");
    link_long_term_memory(temp.path(), &related.id, &seed.id, "related_to", 0.9)
        .expect("link related to seed");
    let conn = rusqlite::Connection::open(memory_store_path(temp.path())).expect("open memory db");
    conn.execute("DELETE FROM memory_embeddings", [])
        .expect("disable vector rows for graph assertion");

    let without_related = search_ranked_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(marker.clone()),
            include_related: false,
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("search without related");
    assert!(
        without_related
            .iter()
            .any(|entry| entry.record.id == seed.id)
    );
    if let Some(related_hit) = without_related
        .iter()
        .find(|entry| entry.record.id == related.id)
    {
        assert_eq!(related_hit.breakdown.graph_boost, 0.0);
        assert!(
            !related_hit
                .breakdown
                .matched_by
                .iter()
                .any(|source| source == "graph")
        );
    }

    let with_related = search_ranked_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(marker),
            include_related: true,
            explain: true,
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("search with related");
    let related_hit = with_related
        .iter()
        .find(|entry| entry.record.id == related.id)
        .expect("related memory returned");
    assert!(related_hit.breakdown.graph_boost > 0.0);
    assert!(
        related_hit
            .breakdown
            .matched_by
            .iter()
            .any(|source| source == "graph")
    );
    assert_eq!(
        with_related
            .iter()
            .filter(|entry| entry.record.id == seed.id)
            .count(),
        1
    );
}

#[test]
fn memory_search_uses_fts_and_lazily_repairs_missing_embedding_rows() {
    let temp = tempfile::tempdir().expect("tempdir");
    let marker = format!("phase2-fts-only-{}", Uuid::new_v4());
    let created = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("instruction".to_string()),
            fact: Some(format!("FTS fallback must retrieve this memory {marker}")),
            confidence: Some(0.9),
            source_type: Some("user_declaration".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");
    let conn = rusqlite::Connection::open(memory_store_path(temp.path())).expect("open memory db");
    conn.execute("DELETE FROM memory_embeddings", [])
        .expect("remove embeddings");

    let results = search_ranked_long_term_memory(
        temp.path(),
        MemoryQuery {
            query: Some(marker),
            explain: true,
            limit: 5,
            ..MemoryQuery::default()
        },
    )
    .expect("fts-only search");
    assert_eq!(results.len(), 1);
    assert_eq!(results[0].record.id, created.id);
    assert!(results[0].breakdown.fts_score > 0.0);
    assert!(results[0].breakdown.vector_score >= 0.0);
    let repaired_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM memory_embeddings", [], |row| {
            row.get(0)
        })
        .expect("embedding count");
    assert_eq!(repaired_count, 1);
}

#[test]
fn memory_conflict_auto_supersedes_low_confidence_and_confirms_high_confidence() {
    let temp = tempfile::tempdir().expect("tempdir");
    let low = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("preference".to_string()),
            fact: Some("用户偏好使用中文回复".to_string()),
            content: Some(json!({ "kind": "language_preference", "language": "中文" })),
            confidence: Some(0.6),
            source_type: Some("agent_inference".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create low confidence memory");
    let session_id = format!("session-{}", Uuid::new_v4());
    let turn_id = format!("turn-{}", Uuid::new_v4());
    process_extracted_candidate(
        temp.path(),
        &session_id,
        &turn_id,
        MemoryCandidateMutation {
            fact: "用户偏好使用英文回复".to_string(),
            content: json!({ "kind": "language_preference", "language": "英文" }),
            category: "preference".to_string(),
            scope: "global".to_string(),
            confidence: 1.0,
            source_type: "user_declaration".to_string(),
            source_ref: Some(format!("{session_id}:{turn_id}:memory_agent")),
            proposed_action: "create".to_string(),
            ..MemoryCandidateMutation::default()
        },
    )
    .expect("process conflict");
    let superseded = list_long_term_memory(
        temp.path(),
        MemoryQuery {
            status: Some("superseded".to_string()),
            include_archived: true,
            limit: 20,
            ..MemoryQuery::default()
        },
    )
    .expect("list superseded");
    assert!(superseded.iter().any(|record| record.id == low.id));

    let temp = tempfile::tempdir().expect("tempdir");
    let high = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("preference".to_string()),
            fact: Some("用户偏好使用中文回复".to_string()),
            content: Some(json!({ "kind": "language_preference", "language": "中文" })),
            confidence: Some(1.0),
            source_type: Some("user_declaration".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create high confidence memory");
    {
        let mut state = state().lock().expect("state lock");
        state.config.proactive_enabled = true;
        state
            .config
            .proactive_disabled_triggers
            .remove("memory_conflict");
    }
    process_extracted_candidate(
        temp.path(),
        &session_id,
        &turn_id,
        MemoryCandidateMutation {
            fact: "用户偏好使用英文回复".to_string(),
            content: json!({ "kind": "language_preference", "language": "英文" }),
            category: "preference".to_string(),
            scope: "global".to_string(),
            confidence: 1.0,
            source_type: "user_declaration".to_string(),
            source_ref: Some(format!("{session_id}:{turn_id}:memory_agent")),
            proposed_action: "create".to_string(),
            ..MemoryCandidateMutation::default()
        },
    )
    .expect("process high conflict");
    let candidates = list_memory_candidates(temp.path(), Some("needs_user_confirmation"), 20)
        .expect("review candidates");
    let candidate = candidates
        .iter()
        .find(|candidate| candidate.conflict_with.as_deref() == Some(high.id.as_str()))
        .expect("conflict candidate");
    let proactive =
        list_proactive_events(temp.path(), Some("pending"), 20).expect("proactive events");
    assert!(proactive.iter().any(|event| {
        event.trigger_type == "memory_conflict"
            && event.source.get("candidateId").and_then(Value::as_str)
                == Some(candidate.id.as_str())
    }));
    let applied = apply_memory_candidate(temp.path(), &candidate.id).expect("apply candidate");
    assert_eq!(applied.pointer("/result/action"), Some(&json!("supersede")));
}

#[test]
fn memory_candidate_events_record_to_session_ledger() {
    let temp = tempfile::tempdir().expect("tempdir");
    let session_id = format!("session-{}", Uuid::new_v4());
    let turn_id = format!("turn-{}", Uuid::new_v4());
    let session = NativeSession {
        id: session_id.clone(),
        snapshot: json!({
            "id": session_id,
            "title": "Memory Ledger",
            "sessionKind": "normal",
            "workingDir": "/tmp",
            "projectBound": true,
            "workingDirIsHome": false,
            "turnStatus": "idle",
            "messages": [],
            "tools": [],
            "updatedAt": "2026-06-19T00:00:00.000Z"
        }),
        created_at: "2026-06-19T00:00:00.000Z".to_string(),
        saved: false,
        save_label: None,
        archived: false,
        custom_title: None,
        short_name: None,
        runtime_turns: Vec::new(),
        rollback_checkpoints: Vec::new(),
        file_read_state: HashMap::new(),
        provider_protocol_log: vec![],
        dirty: true,
        dialog_dirty_from: Some(0),
        persisted_dialog_len: 0,
        dialog_loaded: true,
        ephemeral: false,
        stream_journal_sequence: 0,
    };
    save_session(temp.path(), &session).expect("save session");

    let created = process_extracted_candidate(
        temp.path(),
        &session_id,
        &turn_id,
        MemoryCandidateMutation {
            fact: "Ledger should remember project cadence".to_string(),
            content: json!({ "kind": "project_fact", "value": "cadence" }),
            category: "project".to_string(),
            scope: "project".to_string(),
            confidence: 0.8,
            source_type: "agent_inference".to_string(),
            source_ref: Some(format!("{session_id}:{turn_id}:memory_agent")),
            proposed_action: "create".to_string(),
            ..MemoryCandidateMutation::default()
        },
    )
    .expect("process candidate");
    let created_id = created
        .pointer("/candidate/id")
        .and_then(Value::as_str)
        .expect("candidate id")
        .to_string();
    apply_memory_candidate(temp.path(), &created_id).expect("apply candidate");

    let rejected = create_memory_candidate(
        temp.path(),
        MemoryCandidateMutation {
            fact: "Ledger should reject a stale candidate".to_string(),
            content: json!({ "kind": "project_fact", "value": "stale" }),
            category: "project".to_string(),
            scope: "project".to_string(),
            confidence: 0.8,
            source_type: "agent_inference".to_string(),
            source_ref: Some(format!("{session_id}:{turn_id}:memory_agent")),
            proposed_action: "create".to_string(),
            ..MemoryCandidateMutation::default()
        },
    )
    .expect("create rejected candidate");
    reject_memory_candidate(temp.path(), &rejected.id, Some("stale")).expect("reject candidate");

    let ledger = ledger_dir(temp.path(), &session_id);
    let events = fs::read_to_string(ledger.join("events.jsonl")).expect("ledger events");
    assert!(events.contains("\"eventType\":\"memory_candidate_created\""));
    assert!(events.contains("\"eventType\":\"memory_candidate_applied\""));
    assert!(events.contains("\"eventType\":\"memory_candidate_rejected\""));
    assert!(!events.contains("\"content\""));
    assert!(!ledger.join(".git").exists());
    assert!(
        fs::read_dir(&ledger)
            .expect("read ledger directory")
            .filter_map(Result::ok)
            .all(
                |entry| entry.path().extension().and_then(|value| value.to_str()) != Some("sqlite")
            )
    );

    let records = list_long_term_memory(
        temp.path(),
        MemoryQuery {
            include_archived: true,
            limit: 20,
            ..MemoryQuery::default()
        },
    )
    .expect("list long-term memory");
    assert!(records.iter().any(|record| record.fact.contains("cadence")));
}

#[test]
fn memory_explain_injection_records_ranked_long_term_memory_reasons() {
    let temp = tempfile::tempdir().expect("tempdir");
    create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("project".to_string()),
            fact: Some("Lyra memory injection should be explainable".to_string()),
            confidence: Some(0.9),
            source_type: Some("project_fact".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");
    let ranked = select_ranked_long_term_memory_for_injection(
        temp.path(),
        "explain Lyra memory injection",
        None,
        8,
    )
    .expect("rank injection");
    record_memory_injection(
        temp.path(),
        "session-explain",
        Some("turn-explain"),
        Some("explain Lyra memory injection"),
        &ranked,
    )
    .expect("record injection");
    let explanation =
        explain_memory_injection(temp.path(), "session-explain", Some("turn-explain"))
            .expect("explain injection");
    assert!(
        explanation["selected"]
            .as_array()
            .is_some_and(|items| !items.is_empty())
    );
    assert!(
        explanation
            .pointer("/selected/0/scoreBreakdown/finalScore")
            .is_some()
    );
}

#[test]
fn proactive_events_are_structured_dismissible_and_open_sessions_without_chat_pollution() {
    let backend = LyraAgentBackend;
    let root = state().lock().expect("state lock").root.clone();
    let event = create_proactive_event(
        &root,
        "memory_conflict",
        "Review memory conflict",
        "A memory candidate needs confirmation.",
        json!({ "candidateId": "candidate-test" }),
        "draft_message",
        None,
    )
    .expect("create proactive event");
    let listed = backend
        .call_agent_method("agent.proactive.list", json!({ "status": "pending" }))
        .expect("list proactive");
    assert!(listed["events"].as_array().is_some_and(|events| {
        events
            .iter()
            .any(|item| item.get("id").and_then(Value::as_str) == Some(event.id.as_str()))
    }));
    let opened = backend
        .call_agent_method("agent.proactive.openSession", json!({ "id": event.id }))
        .expect("open proactive session");
    assert_eq!(
        opened.pointer("/snapshot/sessionKind"),
        Some(&json!("proactive"))
    );
    assert!(
        opened
            .pointer("/snapshot/messages")
            .and_then(Value::as_array)
            .is_some_and(Vec::is_empty)
    );
    assert_eq!(
        opened.pointer("/snapshot/proactiveMessages/0/role"),
        Some(&json!("proactive"))
    );

    let event = create_proactive_event(
        &root,
        "goal_due",
        "Goal due",
        "A goal is due.",
        json!({ "goalId": "goal-test" }),
        "notification_only",
        None,
    )
    .expect("create dismissible proactive event");
    let dismissed = backend
        .call_agent_method(
            "agent.proactive.dismiss",
            json!({ "id": event.id, "reason": "test complete" }),
        )
        .expect("dismiss proactive");
    assert_eq!(dismissed["status"], "dismissed");
}

#[test]
fn shared_memory_injection_rotates_records() {
    let now = now();
    let mut records = (0..6)
        .map(|index| LongTermMemoryRecord {
            id: format!("memory-{index}"),
            scope: "global".to_string(),
            category: "other".to_string(),
            fact: format!("rotation fact {index}"),
            content: json!({ "fact": format!("rotation fact {index}") }),
            layer: "shared".to_string(),
            value_class: "semantic".to_string(),
            abstract_text: Some(format!("rotation fact {index}")),
            confidence: 1.0,
            source_type: "agent_inference".to_string(),
            source_ref: Some("test".to_string()),
            created_at: now.clone(),
            updated_at: now.clone(),
            status: "active".to_string(),
            priority: 40,
            last_accessed_at: None,
            access_count: 0,
            tags: Vec::new(),
            related_to: Vec::new(),
            expires_at: None,
            supersedes: None,
            superseded_by: None,
            revision: 1,
        })
        .collect::<Vec<_>>();

    let first = select_shared_memory_for_injection(&mut records, "rotation", None, 3);
    let second = select_shared_memory_for_injection(&mut records, "rotation", None, 3);
    let first_ids = first
        .iter()
        .map(|record| record.id.as_str())
        .collect::<Vec<_>>();
    let second_ids = second
        .iter()
        .map(|record| record.id.as_str())
        .collect::<Vec<_>>();

    assert_ne!(first_ids, second_ids);
    assert!(
        records
            .iter()
            .take(3)
            .all(|record| record.access_count == 1)
    );
    assert!(
        records
            .iter()
            .skip(3)
            .all(|record| record.access_count == 1)
    );
}

#[test]
fn system_recall_selects_long_term_memory_with_source_markers() {
    let temp = tempfile::tempdir().expect("tempdir");
    let created = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            scope: Some("global".to_string()),
            category: Some("user_profile".to_string()),
            fact: Some("用户的联系邮箱是 yuanhao@example.com".to_string()),
            content: Some(json!({ "kind": "contact_email", "email": "yuanhao@example.com" })),
            confidence: Some(0.95),
            source_type: Some("user_declaration".to_string()),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");

    let recall = select_system_recall_for_injection(
        temp.path(),
        None,
        "我的邮箱是什么",
        None,
        &[json!({ "role": "user", "text": "我的邮箱是什么" })],
    )
    .expect("select recall");

    assert_eq!(recall.len(), 1);
    assert_eq!(recall[0].item.source_kind, "long_term_memory");
    assert_eq!(recall[0].item.source_id, created.id);
    let rendered = system_recall_json(&recall);
    assert_eq!(
        rendered["records"][0]["systemRecalled"].as_bool(),
        Some(true)
    );
    assert_eq!(
        rendered["records"][0]["sourceKind"].as_str(),
        Some("long_term_memory")
    );
    assert!(
        rendered["records"][0]["content"]
            .as_str()
            .unwrap_or_default()
            .contains("yuanhao@example.com")
    );
}

#[test]
fn system_recall_indexes_session_messages_and_dedupes_current_context() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut old_session = new_session(Some("Old Session".to_string()), None, "normal");
    old_session.id = format!("session-{}", Uuid::new_v4());
    push_array(
        &mut old_session.snapshot,
        "messages",
        json!({
            "id": format!("message-{}", Uuid::new_v4()),
            "role": "user",
            "text": "我叫徐远豪",
            "createdAt": now()
        }),
    );
    index_session_messages_for_recall(temp.path(), &old_session).expect("index session");

    let recall = select_system_recall_for_injection(
        temp.path(),
        None,
        "我叫什么你还记得吗？",
        None,
        &[json!({ "role": "user", "text": "我叫什么你还记得吗？" })],
    )
    .expect("select recall");
    assert!(
        recall
            .iter()
            .any(|record| record.item.source_kind == "session_message"
                && record.item.text.contains("徐远豪"))
    );

    let duplicate = select_system_recall_for_injection(
        temp.path(),
        None,
        "我叫什么你还记得吗？",
        None,
        &[
            json!({ "role": "user", "text": "我叫徐远豪" }),
            json!({ "role": "user", "text": "我叫什么你还记得吗？" }),
        ],
    )
    .expect("select duplicate");
    assert!(duplicate.is_empty());
}

#[test]
fn system_recall_retrieves_prior_tool_like_session_message() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut old_session = new_session(Some("Camera Session".to_string()), None, "normal");
    old_session.id = format!("session-{}", Uuid::new_v4());
    let message_id = format!("message-{}", Uuid::new_v4());
    push_array(
        &mut old_session.snapshot,
        "messages",
        json!({
            "id": message_id,
            "role": "user",
            "text": "调用摄像头给我拍一张照片在工作区打开",
            "createdAt": now()
        }),
    );
    push_array(
        &mut old_session.snapshot,
        "messages",
        json!({
            "id": format!("message-{}", Uuid::new_v4()),
            "role": "assistant",
            "text": "摄像头照片已拍好并打开，保存路径 /Users/petehsu/Desktop/camera_photo.jpg",
            "createdAt": now()
        }),
    );
    index_session_messages_for_recall(temp.path(), &old_session).expect("index session");

    let recall = select_system_recall_for_injection(
        temp.path(),
        None,
        "你之前是不是用摄像头给我拍过一张照片",
        None,
        &[json!({ "role": "user", "text": "你之前是不是用摄像头给我拍过一张照片" })],
    )
    .expect("select recall");

    assert!(recall.iter().any(|record| {
        record.item.source_kind == "session_message" && record.item.source_id == message_id
    }));
}

#[test]
fn empty_memory_search_lists_summaries_instead_of_ranking() {
    let backend = LyraAgentBackend;
    let marker = format!("empty-search-list-{}", Uuid::new_v4());
    backend
        .call_agent_method(
            "agent.memory.longterm.create",
            json!({
                "scope": "global",
                "category": "preference",
                "fact": format!("empty query should list {marker}"),
                "confidence": 1.0,
                "sourceType": "user_declaration"
            }),
        )
        .expect("create memory");

    let listed = long_term_memory_search(json!({})).expect("empty search lists");
    assert!(listed.get("sessionRecall").is_none());
    let records = listed["records"].as_array().expect("records");
    assert!(records.iter().any(|record| {
        record
            .get("fact")
            .or_else(|| record.pointer("/content/fact"))
            .and_then(Value::as_str)
            .is_some_and(|fact| fact.contains(&marker))
    }));

    let ranked =
        long_term_memory_search(json!({ "query": marker.clone() })).expect("ranked search");
    assert!(ranked.get("sessionRecall").is_some());
}

#[test]
fn memory_search_surfaces_session_recall_records() {
    let root = {
        let state = state().lock().expect("state lock");
        state.root.clone()
    };
    let marker = format!("session-recall-search-{}", Uuid::new_v4());
    let mut old_session = new_session(Some("Session Recall Search".to_string()), None, "normal");
    old_session.id = format!("session-{}", Uuid::new_v4());
    let message_id = format!("message-{}", Uuid::new_v4());
    push_array(
        &mut old_session.snapshot,
        "messages",
        json!({
            "id": message_id,
            "role": "user",
            "text": format!("调用摄像头给我拍一张照片在工作区打开，验证编号 {marker}"),
            "createdAt": now()
        }),
    );
    index_session_messages_for_recall(&root, &old_session).expect("index session");

    let result = long_term_memory_search(json!({
        "query": format!("你之前是不是用摄像头给我拍过一张照片，验证编号 {marker}"),
        "limit": 10
    }))
    .expect("memory search");

    let session_recall_records = result
        .pointer("/sessionRecall/records")
        .and_then(Value::as_array)
        .expect("session recall records");
    assert!(session_recall_records.iter().any(|record| {
        record.get("sourceId").and_then(Value::as_str) == Some(message_id.as_str())
    }));
    let formatted = format_memory_output("search", &result);
    assert!(formatted.contains("Session recall"));
    assert!(formatted.contains(&message_id));
}

#[test]
fn memory_write_and_search_receipts_carry_record_ids() {
    let marker = format!("receipt-id-{}", Uuid::new_v4());
    let remembered = long_term_memory_create(json!({
        "action": "remember",
        "scope": "global",
        "category": "preference",
        "fact": format!("receipt test fact {marker}"),
        "confidence": 0.9,
    }))
    .expect("remember");
    let id = remembered
        .pointer("/record/id")
        .and_then(Value::as_str)
        .expect("record id")
        .to_string();

    let formatted = format_memory_output("remember", &remembered);
    assert!(
        formatted.contains(&format!("(id: {id})")),
        "remember receipt must carry the id: {formatted}"
    );

    let updated = long_term_memory_update(json!({
        "id": id,
        "fact": format!("receipt test fact updated {marker}"),
    }))
    .expect("update");
    let updated_formatted = format_memory_output("update", &updated);
    assert!(
        updated_formatted.starts_with(&format!("Updated memory {id}:")),
        "update receipt must carry the id: {updated_formatted}"
    );

    let searched = long_term_memory_search(json!({ "query": marker })).expect("search");
    let formatted_search = format_memory_output("search", &searched);
    assert!(
        formatted_search.contains(&format!("id={id}")),
        "search hits must carry ids: {formatted_search}"
    );

    // Missing id misses now name the closest stored ids (hermes-style).
    let miss = long_term_memory_update(json!({
        "id": format!("{id}-typo"),
        "fact": "irrelevant",
    }));
    let error = format!("{}", miss.expect_err("must miss"));
    assert!(
        error.contains("Closest stored memory ids"),
        "not-found error should hint closest ids: {error}"
    );
    assert!(
        error.contains(&id),
        "hint should include the real id: {error}"
    );
}

#[test]
fn system_recall_dedupes_repeated_session_facts() {
    let temp = tempfile::tempdir().expect("tempdir");
    for _ in 0..2 {
        let mut session = new_session(Some("Repeated Fact".to_string()), None, "normal");
        session.id = format!("session-{}", Uuid::new_v4());
        push_array(
            &mut session.snapshot,
            "messages",
            json!({
                "id": format!("message-{}", Uuid::new_v4()),
                "role": "user",
                "text": "我叫徐远豪",
                "createdAt": now()
            }),
        );
        index_session_messages_for_recall(temp.path(), &session).expect("index session");
    }

    let recall = select_system_recall_for_injection(
        temp.path(),
        None,
        "我叫什么",
        None,
        &[json!({ "role": "user", "text": "我叫什么" })],
    )
    .expect("select recall");
    let matching = recall
        .iter()
        .filter(|record| record.item.text.contains("徐远豪"))
        .count();
    assert_eq!(matching, 1);
}

#[test]
fn model_request_includes_system_recall_without_llm_lookup() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Recall Request Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let mut old_session = new_session(Some("Archived Identity".to_string()), None, "normal");
    old_session.id = format!("session-{}", Uuid::new_v4());
    push_array(
        &mut old_session.snapshot,
        "messages",
        json!({
            "id": format!("message-{}", Uuid::new_v4()),
            "role": "user",
            "text": "我叫徐远豪",
            "createdAt": now()
        }),
    );
    let root = {
        let state = state().lock().expect("state lock");
        state.root.clone()
    };
    index_session_messages_for_recall(&root, &old_session).expect("index old session");
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        push_array(
            &mut session.snapshot,
            "messages",
            json!({
                "id": format!("message-{}", Uuid::new_v4()),
                "role": "user",
                "text": "我叫什么你还记得吗？",
                "createdAt": now()
            }),
        );
        touch_session(session);
        state.save_state().expect("save state");
    }

    let request = with_tool_capable_default_model(|| {
        build_model_request(&session_id).expect("model request")
    });
    let system_prompt = request.messages[0]["content"]
        .as_str()
        .expect("system prompt");
    let user_text = provider_latest_user_text(&request.messages);
    let env = provider_volatile_appendix(&request.messages);
    assert!(!system_prompt.contains("System-recalled Lyra context"));
    assert!(user_text.contains("我叫什么你还记得吗？"));
    assert!(!user_text.contains("System-recalled Lyra context"));
    assert!(env.contains("System-recalled Lyra context"));
    assert!(env.contains("我叫徐远豪"));
}

#[test]
fn system_recall_keeps_foreign_assignment_but_ranks_same_project_first() {
    let temp = tempfile::tempdir().expect("tempdir");
    let lyra_dir = "/home/xu-yuanhao/Documents/Lyra";
    let query = "了解一下这个项目";

    let mut hermes_session = new_session(
        Some("Hermes Explore".to_string()),
        Some("/tmp/hermes-playground".to_string()),
        "normal",
    );
    push_array(
        &mut hermes_session.snapshot,
        "messages",
        json!({
            "id": format!("message-{}", Uuid::new_v4()),
            "role": "user",
            "text": format!(
                "You are exploring a browser-visible project. READ-ONLY exploration.\nTarget corpus: github.com/NousResearch/hermes-agent\nGoal: Produce a concise survey.\nThe member asked: {query}"
            ),
            "createdAt": now()
        }),
    );
    index_session_messages_for_recall(temp.path(), &hermes_session).expect("index hermes");

    let mut lyra_session = new_session(
        Some("Lyra Explore".to_string()),
        Some(lyra_dir.to_string()),
        "normal",
    );
    push_array(
        &mut lyra_session.snapshot,
        "messages",
        json!({
            "id": format!("message-{}", Uuid::new_v4()),
            "role": "user",
            "text": format!(
                "You are exploring a browser-visible project. READ-ONLY exploration.\nTarget corpus: {lyra_dir}\nGoal: Produce a concise survey.\nThe member asked: {query}"
            ),
            "createdAt": now()
        }),
    );
    index_session_messages_for_recall(temp.path(), &lyra_session).expect("index lyra");

    let recall = select_system_recall_for_injection(
        temp.path(),
        None,
        query,
        Some(lyra_dir),
        &[json!({ "role": "user", "text": query })],
    )
    .expect("select recall");

    let hermes = recall.iter().find(|record| {
        record
            .item
            .text
            .contains("github.com/NousResearch/hermes-agent")
    });
    let lyra = recall.iter().find(|record| {
        record.item.text.contains(lyra_dir) && !record.item.text.contains("hermes-agent")
    });
    assert!(
        hermes.is_some(),
        "foreign assignment brief must still be recalled: {recall:?}"
    );
    assert!(
        lyra.is_some(),
        "same-project assignment brief must be recalled: {recall:?}"
    );
    let hermes = hermes.expect("hermes");
    let lyra = lyra.expect("lyra");
    assert!(
        lyra.score >= hermes.score,
        "same-project brief should rank at least as high as the foreign one ({} vs {})",
        lyra.score,
        hermes.score
    );
    assert!(hermes.item.text.contains("historical assignment"));
    assert!(hermes.item.text.contains("not this turn's instructions"));
    assert!(
        hermes
            .item
            .text
            .contains(&format!("Current workingDir={lyra_dir}"))
    );
    let prompt = system_recall_prompt(&recall);
    assert!(prompt.contains("do not switch the current task"));
    assert!(prompt.contains("github.com/NousResearch/hermes-agent"));
    assert!(prompt.contains(lyra_dir));
}

#[test]
fn tool_retention_prunes_only_old_low_value_raw_payloads() {
    let mut session = new_session(Some("Retention Test".to_string()), None, "normal");
    let tools = (0..26)
        .map(|index| {
            let is_write = index == 0;
            json!({
                "id": format!("tool-{index}"),
                "name": if is_write { "file_write" } else { "file_read" },
                "label": if is_write { "Wrote file" } else { "Read file" },
                "status": "completed",
                "input": { "path": format!("file-{index}.txt") },
                "output": {
                    "content": "x".repeat(2_000),
                    "raw": {
                        "path": format!("file-{index}.txt"),
                        "data": "y".repeat(8_000)
                    }
                },
                "startedAt": "2026-05-30T00:00:00.000Z",
                "finishedAt": "2026-05-30T00:00:01.000Z"
            })
        })
        .collect::<Vec<_>>();
    session.snapshot["tools"] = Value::Array(tools);

    let metrics = prune_transient_tool_outputs(&mut session);
    let tools = session.snapshot["tools"].as_array().expect("tools");

    assert_eq!(metrics["pruned"], 1);
    assert!(tools[0].pointer("/output/raw/retention").is_none());
    assert_eq!(
        tools[1]
            .pointer("/output/raw/retention/policy")
            .and_then(Value::as_str),
        Some("old_transient_tool_raw_pruned")
    );
    assert!(tools[25].pointer("/output/raw/retention").is_none());
}

#[test]
fn memory_projection_omits_tool_output_bodies() {
    let mut session = new_session(Some("Projection".to_string()), None, "normal");
    session.snapshot["tools"] = json!([{
        "id": "tool-1",
        "name": "web_fetch",
        "status": "completed",
        "label": "Fetched page",
        "output": { "content": "SECRET_TOOL_BODY_SHOULD_NOT_PROJECT" }
    }]);
    session.snapshot["messages"] = json!([{
        "id": "msg-1",
        "role": "user",
        "text": "hello",
        "metadata": {
            "providerTranscript": [{
                "role": "tool",
                "content": "SECRET_TRANSCRIPT_SHOULD_NOT_PROJECT"
            }]
        }
    }]);
    let projection = memory_projection_for_session(&session, &[], &[], None);
    let serialized = serde_json::to_string(&projection).expect("serialize projection");
    assert!(!serialized.contains("SECRET_TOOL_BODY_SHOULD_NOT_PROJECT"));
    assert!(!serialized.contains("SECRET_TRANSCRIPT_SHOULD_NOT_PROJECT"));
    assert!(
        projection["sessionMemory"]["toolEvidence"][0]
            .get("output")
            .is_none()
    );
    assert_eq!(
        projection["sessionMemory"]["toolEvidence"][0]["name"],
        "web_fetch"
    );
    assert_eq!(projection["sessionMemory"]["timeline"][0]["text"], "hello");
}

#[test]
fn model_request_does_not_clone_tool_activity_into_session_memory() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "No Tool Clone" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["messages"]
            .as_array_mut()
            .expect("messages")
            .push(user_message("short ask".to_string(), Vec::new(), now()));
        session.snapshot["tools"] = json!([{
            "id": "tool-web",
            "name": "web_fetch",
            "status": "completed",
            "label": "Fetched",
            "output": { "content": "CLONE_MARKER_WEB_FETCH_BODY" }
        }]);
    }
    let request = with_tool_capable_default_model(|| {
        build_model_request(&session_id).expect("model request")
    });
    let serialized = serde_json::to_string(&request.messages).expect("serialize request");
    assert!(!serialized.contains("CLONE_MARKER_WEB_FETCH_BODY"));
    assert!(!serialized.contains("recentToolEvidence"));
}
