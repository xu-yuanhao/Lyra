use super::*;

fn unique_message(id: &str, role: &str, index: usize) -> Value {
    let text = (0..400)
        .map(|n| format!("tok{index}_{n}"))
        .collect::<Vec<_>>()
        .join(" ");
    json!({
        "id": id,
        "role": role,
        "text": text,
        "createdAt": "2026-06-19T00:00:00.000Z"
    })
}

#[test]
fn apply_compression_replaces_messages_with_block_and_archives_to_cut_store() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = format!("session-compress-{}", Uuid::new_v4());

    let mut messages = vec![unique_message("msg-system", "system", 0)];
    for i in 1..=20 {
        messages.push(unique_message(&format!("msg-user-{i}"), "user", i));
        messages.push(unique_message(
            &format!("msg-assistant-{i}"),
            "assistant",
            i + 100,
        ));
    }

    let mut session = NativeSession {
        id: session_id.clone(),
        snapshot: json!({
            "id": session_id,
            "title": "Compress Test",
            "sessionKind": "normal",
            "workingDir": "/tmp",
            "projectBound": true,
            "workingDirIsHome": false,
            "turnStatus": "idle",
            "messages": messages.clone(),
            "todos": [
                {
                    "id": "todo-keep",
                    "content": "fold worker reports",
                    "status": "in_progress"
                }
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
        dirty: true,
        dialog_dirty_from: Some(0),
        persisted_dialog_len: 0,
        dialog_loaded: true,
        ephemeral: false,
        stream_journal_sequence: 0,
    };
    save_session(&root, &session).expect("save session");

    let selected = select_compact_middle(&messages);
    assert!(!selected.is_empty(), "should have selected a middle window");
    assert!(
        selected
            .iter()
            .all(|(idx, msg)| *idx > 0
                && msg.get("id").and_then(Value::as_str) != Some("msg-user-1")),
        "first user question must stay outside the compact window"
    );

    let parsed = json!({
        "candidates": [],
        "compressedContext": {
            "summary": "Test compression summary for the conversation window.",
            "keyDecisions": ["decision1"],
            "projectState": "test state",
            "compressedMessageIds": [],
            "tokenEstimate": 100
        }
    });

    let turn_id = format!("turn-compress-{}", Uuid::new_v4());
    apply_compression_to_session(
        &mut session,
        &root,
        &session_id,
        &turn_id,
        &selected,
        &messages,
        &parsed,
    )
    .expect("apply compression");

    let msgs = session.snapshot["messages"]
        .as_array()
        .expect("messages array");

    let compression_idx = msgs
        .iter()
        .position(|m| {
            m.pointer("/metadata/kind").and_then(Value::as_str) == Some("compressed-context-block")
        })
        .expect("compression block found");
    assert_eq!(
        msgs[compression_idx]
            .pointer("/metadata/uiHidden")
            .and_then(Value::as_bool),
        Some(true),
        "compression blocks must be explicitly hidden from member-facing UI"
    );

    let first_user = msgs
        .iter()
        .find(|m| m.get("id").and_then(Value::as_str) == Some("msg-user-1"))
        .expect("first user kept");
    assert_ne!(
        first_user
            .pointer("/metadata/excludeFromProviderContext")
            .and_then(Value::as_bool),
        Some(true),
        "first user question must remain in the live prompt"
    );

    let watermark_id = session
        .snapshot
        .pointer("/memoryCompression/compressedUpToMessageId")
        .and_then(Value::as_str)
        .expect("compressedUpToMessageId");
    assert!(
        !watermark_id.is_empty(),
        "compressedUpToMessageId should be set"
    );
    assert!(
        session
            .snapshot
            .pointer("/memoryCompression/compressionBlockId")
            .and_then(Value::as_str)
            == Some(watermark_id),
        "compressedUpToMessageId should match compressionBlockId"
    );

    let excluded_count = msgs
        .iter()
        .filter(|m| {
            m.pointer("/metadata/excludeFromProviderContext")
                .and_then(Value::as_bool)
                == Some(true)
        })
        .count();
    assert!(
        excluded_count > 0,
        "compressed messages should be marked excludeFromProviderContext, found {}",
        excluded_count
    );
    assert!(
        msgs.len() >= 41,
        "all messages should be retained in storage, got {}",
        msgs.len()
    );

    let manifest = cut_store::load_manifest(&root, &session_id).expect("cut manifest");
    assert!(
        !manifest.packs.is_empty(),
        "cut_store should have archived at least one pack"
    );
    assert_eq!(
        session.snapshot["todos"][0]["id"], "todo-keep",
        "compression must not wipe snapshot.todos"
    );
    assert_eq!(session.snapshot["todos"][0]["status"], "in_progress");
}

#[test]
fn compact_selection_keeps_the_first_user_question() {
    let mut messages = vec![json!({
        "id": "sys",
        "role": "system",
        "text": "stable"
    })];
    messages.push(json!({
        "id": "first-ask",
        "role": "user",
        "text": "zcode是不是开源了"
    }));
    for i in 1..=12 {
        messages.push(unique_message(&format!("u{i}"), "user", i));
        messages.push(unique_message(&format!("a{i}"), "assistant", i + 50));
    }
    let selected = select_compact_middle(&messages);
    assert!(!selected.is_empty());
    assert!(
        selected
            .iter()
            .all(|(_, msg)| msg.get("id").and_then(Value::as_str) != Some("first-ask"))
    );
    assert_eq!(first_live_user_id(&messages).as_deref(), Some("first-ask"));
}

#[test]
fn member_user_identity_skips_ui_hidden_pokes() {
    let messages = vec![
        json!({
            "id": "first-ask",
            "role": "user",
            "text": "zcode是不是开源了"
        }),
        json!({
            "id": "legacy-poke",
            "role": "user",
            "text": "Background workers updated. Each finished Agent tool result now contains that worker's report",
            "metadata": { "uiHidden": true }
        }),
        json!({
            "id": "terminal-exit",
            "role": "user",
            "text": "A background terminal command has exited.",
            "metadata": { "uiHidden": true, "terminalExit": true }
        }),
    ];
    assert_eq!(first_live_user_id(&messages).as_deref(), Some("first-ask"));
    assert_eq!(latest_user_text(&messages), "zcode是不是开源了");
    let session = NativeSession {
        id: "session-member-ask".to_string(),
        snapshot: json!({
            "id": "session-member-ask",
            "title": "Host",
            "sessionKind": "normal",
            "messages": messages,
            "todos": [],
            "tools": []
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
        dirty: true,
        dialog_dirty_from: Some(0),
        persisted_dialog_len: 0,
        dialog_loaded: true,
        ephemeral: false,
        stream_journal_sequence: 0,
    };
    let projection = memory_projection_for_session(&session, &[], &[], None);
    assert_eq!(
        projection["workingMemory"]["latestUserIntent"], "zcode是不是开源了",
        "recall/intent must not treat uiHidden pokes as the member question"
    );
}

#[test]
fn read_cut_messages_round_trips_archived_messages() {
    let dir = tempfile::tempdir().expect("tempdir");
    let root = dir.path().to_path_buf();
    let session_id = format!("session-read-cut-{}", Uuid::new_v4());

    let msg_a = json!({
        "id": "cut-msg-a",
        "role": "user",
        "text": "Hello from message A",
        "createdAt": "2026-06-19T00:00:00.000Z"
    });
    let msg_b = json!({
        "id": "cut-msg-b",
        "role": "assistant",
        "text": "Reply from message B",
        "createdAt": "2026-06-19T00:00:01.000Z"
    });
    let msg_c = json!({
        "id": "cut-msg-c",
        "role": "user",
        "text": "Follow-up from message C",
        "createdAt": "2026-06-19T00:00:02.000Z"
    });

    let entries = vec![
        cut_store::CutMessageEntry {
            message: msg_a.clone(),
            ordinal: 0,
        },
        cut_store::CutMessageEntry {
            message: msg_b.clone(),
            ordinal: 1,
        },
        cut_store::CutMessageEntry {
            message: msg_c.clone(),
            ordinal: 2,
        },
    ];
    let pack = cut_store::append_cut_pack(&root, &session_id, &entries).expect("append cut pack");
    cut_store::update_manifest_with_pack(&root, &session_id, &pack).expect("update manifest");

    // Read back two of three messages by ID
    let ids = vec!["cut-msg-b".to_string(), "cut-msg-c".to_string()];
    let result = cut_store::read_cut_messages(&root, &session_id, &ids).expect("read cut messages");
    assert_eq!(result.len(), 2, "should return exactly 2 messages");
    assert_eq!(result[0]["id"], "cut-msg-b");
    assert_eq!(result[0]["text"], "Reply from message B");
    assert_eq!(result[1]["id"], "cut-msg-c");
    assert_eq!(result[1]["text"], "Follow-up from message C");

    // Reading a non-existent ID returns only found messages
    let missing = vec!["cut-msg-a".to_string(), "no-such-msg".to_string()];
    let result2 = cut_store::read_cut_messages(&root, &session_id, &missing).expect("read partial");
    assert_eq!(result2.len(), 1, "should return only the found message");
    assert_eq!(result2[0]["id"], "cut-msg-a");

    // Empty ID list returns empty
    let empty = cut_store::read_cut_messages(&root, &session_id, &[]).expect("read empty");
    assert!(empty.is_empty());
}
