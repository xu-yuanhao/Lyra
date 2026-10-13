use super::super::*;
use tempfile::tempdir;

#[test]
fn shared_layer_query_excludes_frozen_records() {
    let temp = tempdir().expect("tempdir");
    create_long_term_memory(
        temp.path(),
        MemoryMutation {
            fact: Some("Shared layer fact".to_string()),
            layer: Some(LAYER_SHARED.to_string()),
            confidence: Some(0.9),
            ..MemoryMutation::default()
        },
    )
    .expect("create shared");
    create_long_term_memory(
        temp.path(),
        MemoryMutation {
            fact: Some("Frozen layer fact".to_string()),
            layer: Some(LAYER_FROZEN.to_string()),
            category: Some("user_profile".to_string()),
            confidence: Some(0.95),
            ..MemoryMutation::default()
        },
    )
    .expect("create frozen");

    let shared = search_ranked_long_term_memory(
        temp.path(),
        MemoryQuery {
            layer: Some(LAYER_SHARED.to_string()),
            query: Some("layer fact".to_string()),
            limit: 10,
            ..MemoryQuery::default()
        },
    )
    .expect("shared query");
    assert!(!shared.is_empty());
    assert!(
        shared
            .iter()
            .all(|entry| entry.record.layer == LAYER_SHARED)
    );
}

#[test]
fn layer_projection_exports_markdown_files() {
    let temp = tempdir().expect("tempdir");
    create_long_term_memory(
        temp.path(),
        MemoryMutation {
            fact: Some("Projection export shared".to_string()),
            layer: Some(LAYER_SHARED.to_string()),
            confidence: Some(0.8),
            ..MemoryMutation::default()
        },
    )
    .expect("create shared");
    let result = export_layer_memory_projections(temp.path(), false).expect("export layers");
    let shared_md = result["sharedMarkdownPath"].as_str().expect("shared md");
    let frozen_md = result["frozenMarkdownPath"].as_str().expect("frozen md");
    assert!(std::path::Path::new(shared_md).is_file());
    assert!(std::path::Path::new(frozen_md).is_file());
}

#[test]
fn memory_injection_updates_prompt_cache() {
    let temp = tempdir().expect("tempdir");
    let record = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            fact: Some("Prompt cache injection fact".to_string()),
            confidence: Some(0.9),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");
    let ranked = RankedMemoryRecord {
        record,
        score: 0.9,
        breakdown: MemoryScoreBreakdown::default(),
    };
    record_memory_injection(
        temp.path(),
        "session-cache",
        Some("turn-cache"),
        Some("prompt cache injection"),
        &[ranked],
    )
    .expect("record injection");
    ensure_prompt_cache(temp.path()).expect("ensure cache");
    let export = export_dynamic_prompt_cache_markdown(temp.path()).expect("export cache md");
    assert!(std::path::Path::new(export["markdownPath"].as_str().expect("md path")).is_file());
}

#[test]
fn memory_projection_splits_shared_and_frozen_facts() {
    let session = NativeSession {
        id: "session-projection".to_string(),
        created_at: now(),
        custom_title: None,
        short_name: None,
        saved: false,
        save_label: None,
        archived: false,
        dirty: false,
        dialog_dirty_from: None,
        persisted_dialog_len: 0,
        dialog_loaded: true,
        ephemeral: false,
        stream_journal_sequence: 0,
        snapshot: json!({
            "title": "Projection",
            "messages": [],
            "tools": [],
            "todos": [],
            "turnStatus": "idle",
        }),
        runtime_turns: Vec::new(),
        rollback_checkpoints: Vec::new(),
        file_read_state: HashMap::new(),
    };
    let shared = vec![LongTermMemoryRecord {
        id: "memory-shared".to_string(),
        scope: "global".to_string(),
        category: "project".to_string(),
        fact: "Shared projection fact".to_string(),
        content: json!({ "fact": "Shared projection fact" }),
        layer: LAYER_SHARED.to_string(),
        value_class: VALUE_SEMANTIC.to_string(),
        abstract_text: Some("Shared projection fact".to_string()),
        confidence: 0.9,
        source_type: "project_fact".to_string(),
        source_ref: None,
        status: "active".to_string(),
        priority: 40,
        created_at: now(),
        updated_at: now(),
        last_accessed_at: None,
        access_count: 0,
        tags: Vec::new(),
        related_to: Vec::new(),
        expires_at: None,
        supersedes: None,
        superseded_by: None,
        revision: 1,
    }];
    let frozen = vec![LongTermMemoryRecord {
        id: "memory-frozen".to_string(),
        scope: "global".to_string(),
        category: "user_profile".to_string(),
        fact: "Frozen projection fact".to_string(),
        content: json!({ "kind": "contact_email", "email": "user@example.com" }),
        layer: LAYER_FROZEN.to_string(),
        value_class: VALUE_SEMANTIC.to_string(),
        abstract_text: Some("Frozen projection fact".to_string()),
        confidence: 1.0,
        source_type: "user_declaration".to_string(),
        source_ref: None,
        status: "active".to_string(),
        priority: 60,
        created_at: now(),
        updated_at: now(),
        last_accessed_at: None,
        access_count: 0,
        tags: Vec::new(),
        related_to: Vec::new(),
        expires_at: None,
        supersedes: None,
        superseded_by: None,
        revision: 1,
    }];
    let projection = memory_projection_for_session(&session, &shared, &frozen, None);
    assert_eq!(
        projection
            .pointer("/sharedFacts/facts/0/layer")
            .and_then(Value::as_str),
        Some(LAYER_SHARED)
    );
    assert_eq!(
        projection
            .pointer("/frozenFacts/facts/0/layer")
            .and_then(Value::as_str),
        Some(LAYER_FROZEN)
    );
}
