use super::super::*;
use tempfile::tempdir;

#[test]
fn derived_age_field_updates_from_date_of_birth() {
    let mut content = json!({
        "kind": "date_of_birth",
        "dateOfBirth": "1990-01-15"
    });
    apply_derived_fields_to_content(&mut content);
    assert!(
        content
            .get("derivedAgeYears")
            .and_then(Value::as_u64)
            .is_some()
    );
}

#[test]
fn low_confidence_candidate_enters_stability_pending() {
    let temp = tempdir().expect("tempdir");
    let candidate = create_memory_candidate(
        temp.path(),
        MemoryCandidateMutation {
            fact: "Inferred preference for dark mode".to_string(),
            content: json!({ "kind": "preference", "text": "dark mode" }),
            category: "preference".to_string(),
            scope: "global".to_string(),
            confidence: 0.72,
            source_type: "memory_agent_inference".to_string(),
            proposed_action: "create".to_string(),
            ..MemoryCandidateMutation::default()
        },
    )
    .expect("create candidate");
    assert_eq!(candidate.status, "stability_pending");
    assert!(candidate.stability_review_at.is_some());
}

#[test]
fn merge_candidate_action_merges_content() {
    let temp = tempdir().expect("tempdir");
    let existing = create_long_term_memory(
        temp.path(),
        MemoryMutation {
            fact: Some("Project uses Rust".to_string()),
            content: Some(json!({ "stack": ["rust"], "notes": "backend" })),
            confidence: Some(0.9),
            ..MemoryMutation::default()
        },
    )
    .expect("create memory");
    let candidate = create_memory_candidate(
        temp.path(),
        MemoryCandidateMutation {
            fact: "Project uses Rust and TypeScript".to_string(),
            content: json!({ "stack": ["rust", "typescript"] }),
            category: "project".to_string(),
            scope: "global".to_string(),
            confidence: 0.95,
            source_type: "user_declaration".to_string(),
            proposed_action: "merge".to_string(),
            target_id: Some(existing.id.clone()),
            ..MemoryCandidateMutation::default()
        },
    )
    .expect("create candidate");
    let result = apply_memory_candidate(temp.path(), &candidate.id).expect("apply merge");
    let record = result["result"]["record"]["content"].clone();
    assert_eq!(
        record.get("stack").and_then(Value::as_array).map(Vec::len),
        Some(2)
    );
    assert_eq!(record.get("notes").and_then(Value::as_str), Some("backend"));
}

#[test]
fn memory_trigger_persists_mark_and_job_together() {
    let temp = tempdir().expect("tempdir");
    let event = MemoryTriggerEvent {
        event_type: EVENT_FILE_CHANGE_RECORDED.to_string(),
        session_id: "session-atomic-trigger".to_string(),
        turn_id: "turn-atomic-trigger".to_string(),
        payload: json!({ "toolName": "file_write" }),
    };

    record_memory_trigger_and_enqueue(temp.path(), &event).expect("enqueue trigger transaction");
    let conn = open_memory_connection(temp.path()).expect("open memory store");
    let trigger_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM trigger_marks", [], |row| row.get(0))
        .expect("count trigger marks");
    let job_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM memory_jobs", [], |row| row.get(0))
        .expect("count memory jobs");
    assert_eq!((trigger_count, job_count), (1, 1));
}

#[test]
fn interrupted_memory_job_is_requeued() {
    let temp = tempdir().expect("tempdir");
    let event = MemoryTriggerEvent {
        event_type: EVENT_FILE_CHANGE_RECORDED.to_string(),
        session_id: "session-replay".to_string(),
        turn_id: "turn-replay".to_string(),
        payload: json!({ "path": "src/lib.rs" }),
    };
    record_memory_trigger_and_enqueue(temp.path(), &event).expect("enqueue trigger");
    let claimed = claim_next_memory_job(temp.path())
        .expect("claim job")
        .expect("pending job");

    assert_eq!(
        recover_interrupted_memory_jobs(temp.path()).expect("recover interrupted job"),
        1
    );
    let replayed = claim_next_memory_job(temp.path())
        .expect("reclaim job")
        .expect("requeued job");
    assert_eq!(replayed.id, claimed.id);
}

#[test]
fn memory_reads_stay_read_only_once_schema_is_ready() {
    // The lock-contention root cause: every session poll re-ran schema DDL
    // (ending in an INSERT) and re-probed WAL. Steady state must not write —
    // verify via total_changes on a ready store.
    let temp = tempdir().expect("tempdir");
    ensure_memory_store(temp.path()).expect("init store");
    let conn = open_memory_connection(temp.path()).expect("open");
    let before: i64 = conn
        .query_row("SELECT total_changes()", [], |row| row.get(0))
        .expect("total_changes before");
    init_memory_schema(&conn).expect("re-init must be a no-op");
    let after: i64 = conn
        .query_row("SELECT total_changes()", [], |row| row.get(0))
        .expect("total_changes after");
    assert_eq!(after - before, 0, "ready schema must not write");

    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .expect("journal mode");
    assert_eq!(mode.to_ascii_lowercase(), "wal");
}

#[test]
fn concurrent_writer_does_not_block_memory_candidate_read() {
    // WAL contract (codex/ZCode): a poll must read while another connection
    // holds the writer. Delete-journal or per-open WAL probes serialize here.
    let temp = tempdir().expect("tempdir");
    ensure_memory_store(temp.path()).expect("init store");
    let mut writer = open_memory_connection(temp.path()).expect("writer");
    let tx = writer
        .transaction_with_behavior(rusqlite::TransactionBehavior::Immediate)
        .expect("hold writer lock");
    tx.execute(
        "INSERT INTO memory_candidates (id, fact, content_json, category, scope, confidence, source_type, proposed_action, status, created_at)
         VALUES ('candidate-held', 'held by writer', '{}', 'other', 'global', 0.9, 'memory_agent_inference', 'create', 'pending', ?)",
        [now()],
    )
    .expect("insert inside held transaction");
    // Read path used to fight this writer: schema INSERT + expiry UPDATE.
    let listed = list_memory_candidates(temp.path(), Some("pending"), 20).expect("read while held");
    assert!(listed.is_empty(), "uncommitted row must not leak");
    tx.commit().expect("commit");
    let listed = list_memory_candidates(temp.path(), Some("pending"), 20).expect("read after");
    assert_eq!(listed.len(), 1);
}
