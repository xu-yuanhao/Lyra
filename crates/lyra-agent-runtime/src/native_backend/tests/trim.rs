use super::super::*;
use tempfile::tempdir;

fn large_text(chars: usize) -> String {
    "x".repeat(chars)
}

fn message(id: &str, role: &str, text: &str) -> Value {
    json!({
        "id": id,
        "role": role,
        "text": text,
        "createdAt": "2026-06-19T00:00:00.000Z"
    })
}

fn trim_test_config() -> TrimControllerConfig {
    TrimControllerConfig {
        trim_trigger_tokens: 2_000,
        target_tokens: 1_000,
        protected_recent_tokens: 500,
    }
}

fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .is_ok_and(|output| output.status.success())
}

fn git_output(cwd: &Path, args: &[&str]) -> String {
    let output = Command::new("git")
        .args(args)
        .current_dir(cwd)
        .output()
        .expect("run git");
    assert!(
        output.status.success(),
        "git failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    String::from_utf8_lossy(&output.stdout).to_string()
}

fn build_overflow_session(session_id: &str) -> NativeSession {
    let mut messages = vec![
        message("msg-system", "system", "system prompt"),
        message("msg-user-0", "user", "first user intent"),
    ];
    for index in 1..8 {
        messages.push(message(
            &format!("msg-assistant-{index}"),
            "assistant",
            &large_text(3_200),
        ));
        messages.push(message(
            &format!("msg-user-{index}"),
            "user",
            &large_text(1_200),
        ));
    }
    messages.push(message("msg-user-latest", "user", "latest user intent"));
    messages.push(message(
        "msg-assistant-latest",
        "assistant",
        &large_text(1_200),
    ));

    NativeSession {
        id: session_id.to_string(),
        snapshot: json!({
            "id": session_id,
            "title": "Trim Test",
            "sessionKind": "normal",
            "workingDir": "/tmp",
            "projectBound": true,
            "workingDirIsHome": false,
            "turnStatus": "idle",
            "messages": messages,
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
    }
}

#[test]
fn trim_triggers_when_tokens_exceed_threshold() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-trim-trigger";
    let mut session = build_overflow_session(session_id);
    save_session(&root, &session).expect("save session");

    let before = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(|messages| messages.len())
        .unwrap_or(0);

    let trimmed = maybe_trim_session(&mut session, &root, &trim_test_config()).expect("trim");
    assert!(trimmed);

    let after = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(|messages| messages.len())
        .unwrap_or(0);
    assert!(after < before);
    save_session(&root, &session).expect("save trimmed session");
}

#[test]
fn trim_writes_cut_pack_and_manifest() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-trim-cut-pack";
    let mut session = build_overflow_session(session_id);
    save_session(&root, &session).expect("save session");

    let _ = maybe_trim_session(&mut session, &root, &trim_test_config()).expect("trim");

    let manifest_path = root
        .join("sessions")
        .join(session_id)
        .join("cuts")
        .join("cuts.manifest.json");
    assert!(manifest_path.is_file());

    let manifest = cut_store::load_manifest(&root, session_id).expect("manifest");
    assert!(!manifest.packs.is_empty());
    let pack_path = root
        .join("sessions")
        .join(session_id)
        .join("cuts")
        .join(&manifest.packs[0].path);
    assert!(pack_path.is_file());
}

#[test]
fn trim_records_session_ledger_manifest_without_cut_sqlite() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-trim-ledger";
    let mut session = build_overflow_session(session_id);
    save_session(&root, &session).expect("save session");

    let _ = maybe_trim_session(&mut session, &root, &trim_test_config()).expect("trim");

    let ledger = ledger_dir(&root, session_id);
    assert!(
        !ledger.join(".git").exists(),
        "the ledger is a plain append-only log, not a git repo"
    );
    assert!(ledger.join("events.jsonl").is_file());
    let events = fs::read_to_string(ledger.join("events.jsonl")).expect("ledger events");
    assert!(events.contains("\"eventType\":\"session_trimmed\""));
    assert!(!events.contains(".sqlite"));
}

#[test]
fn trim_journal_survives_interrupted_state() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-trim-resume";
    let mut session = build_overflow_session(session_id);
    save_session(&root, &session).expect("save session");

    let plan =
        session_trim::controller::evaluate(&session, &trim_test_config(), None).expect("plan");
    let conn = session_trim::journal::open_session_connection(&root, session_id).expect("conn");
    let entry = session_trim::journal::TrimJournalEntry {
        journal_id: "trim-test-journal".to_string(),
        state: session_trim::journal::TrimJournalState::PendingTrim,
        cut_pack_id: None,
        msg_ids: plan.msg_ids,
        ordinal_start: plan.trim_ordinals.first().copied().map(|v| v as i64),
        ordinal_end: plan.trim_ordinals.last().copied().map(|v| v as i64),
        token_before: plan.token_before as i64,
        token_after: Some(plan.token_after as i64),
    };
    session_trim::journal::insert_journal(&conn, &entry).expect("insert journal");

    let before = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(|messages| messages.len())
        .unwrap_or(0);
    resume_pending_trim_journal(&mut session, &root).expect("resume");
    let after = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(|messages| messages.len())
        .unwrap_or(0);
    assert!(after < before);
    let manifest = cut_store::load_manifest(&root, session_id).expect("manifest");
    assert!(!manifest.packs.is_empty());
}

#[test]
fn exact_dedupe_skips_duplicate_normalized() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-trim-dedupe";
    let duplicate = "duplicate prose payload for dedupe";
    let entries = vec![
        cut_store::CutMessageEntry {
            message: message("dup-a", "assistant", duplicate),
            ordinal: 0,
        },
        cut_store::CutMessageEntry {
            message: message("dup-b", "assistant", duplicate),
            ordinal: 1,
        },
    ];
    let first = cut_store::append_cut_pack(&root, session_id, &entries).expect("first pack");
    assert_eq!(first.msg_count, 1);
    assert_eq!(first.deduped_msg_ids.len(), 1);
}

#[test]
fn delete_session_removes_cuts() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-trim-delete";
    let mut session = build_overflow_session(session_id);
    save_session(&root, &session).expect("save session");
    let _ = maybe_trim_session(&mut session, &root, &trim_test_config()).expect("trim");

    let cuts_path = root.join("sessions").join(session_id).join("cuts");
    assert!(cuts_path.is_dir());

    delete_session_store(&root, session_id).expect("delete session");
    assert!(!cuts_path.exists());
}

#[test]
fn spawn_trim_skips_when_compression_active() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = format!("session-trim-guard-{}", Uuid::new_v4());
    let session = build_overflow_session(&session_id);
    save_session(&root, &session).expect("save session");

    let message_count_before = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(|m| m.len())
        .unwrap_or(0);

    {
        let mut state = state().lock().expect("state lock");
        state.sessions.insert(session_id.clone(), session);
        state.active_compressions.insert(session_id.clone());
    }

    spawn_post_turn_session_trim(root.clone(), session_id.clone());

    // Give the spawned thread time to run (or skip).
    thread::sleep(Duration::from_millis(300));

    let after_count = state()
        .lock()
        .ok()
        .and_then(|state| {
            state
                .sessions
                .get(&session_id)
                .and_then(|s| s.snapshot.get("messages"))
                .and_then(Value::as_array)
                .map(|m| m.len())
        })
        .unwrap_or(0);

    assert_eq!(
        after_count, message_count_before,
        "session should not be trimmed while compression is active"
    );

    // Cleanup
    let mut state = state().lock().expect("state lock cleanup");
    state.active_compressions.remove(&session_id);
    state.sessions.remove(&session_id);
}
