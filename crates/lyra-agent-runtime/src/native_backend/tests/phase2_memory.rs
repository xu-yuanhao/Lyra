use super::super::*;
use tempfile::tempdir;

#[test]
fn memory_create_rejects_secret_fact() {
    let backend = LyraAgentBackend;
    let result = backend.call_agent_method(
        "agent.memory.longterm.create",
        json!({
            "scope": "global",
            "category": "credential",
            "fact": "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
            "confidence": 1.0,
            "sourceType": "user_declaration"
        }),
    );
    assert!(result.is_err());
    let message = result.expect_err("expected secret rejection").to_string();
    assert!(message.contains("secret"));
}

#[test]
fn user_message_includes_dual_timestamps() {
    let message = user_message("hello".to_string(), Vec::new(), now());
    assert!(message.get("createdAtMs").and_then(Value::as_i64).is_some());
    assert!(
        message
            .get("createdAtIso")
            .and_then(Value::as_str)
            .is_some()
    );
    assert!(message.get("updatedAtMs").and_then(Value::as_i64).is_some());
}

#[test]
fn pinned_todo_surfaces_in_context_window_plan() {
    let dir = tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = "session-pinned-todo";
    let large = (0..800)
        .map(|n| format!("pin{n}"))
        .collect::<Vec<_>>()
        .join(" ");
    let tail = (0..200)
        .map(|n| format!("tail{n}"))
        .collect::<Vec<_>>()
        .join(" ");
    let mut session = NativeSession {
        id: session_id.to_string(),
        snapshot: json!({
            "id": session_id,
            "title": "Pinned Todo",
            "sessionKind": "normal",
            "workingDir": "/tmp",
            "projectBound": true,
            "turnStatus": "idle",
            "todos": [{
                "id": "todo-1",
                "content": "Finish memory refactor",
                "status": "open"
            }],
            "messages": [
                { "id": "m0", "role": "system", "text": "sys", "createdAt": "2026-06-19T00:00:00.000Z" },
                { "id": "m1", "role": "user", "text": "first", "createdAt": "2026-06-19T00:00:00.000Z" },
                { "id": "m2", "role": "assistant", "text": large, "createdAt": "2026-06-19T00:00:00.000Z" },
                { "id": "m3", "role": "user", "text": large, "createdAt": "2026-06-19T00:00:00.000Z" },
                { "id": "m4", "role": "assistant", "text": large, "createdAt": "2026-06-19T00:00:00.000Z" },
                { "id": "m5", "role": "user", "text": "latest", "createdAt": "2026-06-19T00:00:00.000Z" },
                { "id": "m6", "role": "assistant", "text": tail, "createdAt": "2026-06-19T00:00:00.000Z" }
            ],
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
    save_session(&root, &session).expect("save");

    let config = TrimControllerConfig {
        trim_trigger_tokens: 2_000,
        target_tokens: 1_000,
        protected_recent_tokens: 500,
    };
    let plan = context_window::build_context_window_plan(&session, &config, None);
    assert!(plan.is_some());
    let plan = plan.expect("plan");
    assert!(plan.pinned_items.iter().any(|item| item.kind == "todo"));
}
