use super::*;

/// Pin the permission policy to an explicit ask-for-file-writes config so the
/// request/response protocol runs under a controlled contract instead of the
/// host's real policy (the default approval preset auto-allows workspace file
/// edits, matching codex/zed/vscode). Session-scoped: parallel tests are
/// unaffected.
fn pin_file_writes_to_ask(session_id: &str) {
    crate::native_backend::permission_policy::pin_ask_for_file_policy_for_session(session_id);
}

#[test]
fn rollback_preview_and_restore_recover_messages_and_files() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let file_path = temp.path().join("note.txt");
    fs::write(&file_path, "before").expect("write before");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Rollback Test", "workingDir": temp.path().display().to_string() }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = "turn-rollback-test".to_string();
    let mut message = user_message("change note".to_string(), Vec::new(), now());
    let message_id = message["id"].as_str().expect("message id").to_string();
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        let checkpoint = rollback_checkpoint(&session_id, &turn_id, &message_id, session);
        session.snapshot["turnStatus"] = Value::String("running".to_string());
        session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
        message["rollback"] = json!({
            "available": true,
            "anchorId": checkpoint.id,
            "checkpointAt": checkpoint.created_at,
        });
        session.rollback_checkpoints.push(checkpoint);
        push_array(&mut session.snapshot, "messages", message);
        session.runtime_turns.push(runtime_turn(
            &turn_id,
            &session_id,
            "waiting_for_tool",
            Some(message_id.clone()),
            None,
        ));
    }
    record_tool_activity(
        &session_id,
        &turn_id,
        tool_activity(
            "tool-write",
            "file",
            "Write file",
            "running",
            json!({ "action": "write", "path": "note.txt" }),
            None,
            &now(),
            None,
        ),
        "toolStarted",
    );
    fs::write(&file_path, "after").expect("write after");
    let preview = backend
        .call_agent_method(
            "agent.rollback.preview",
            json!({ "sessionId": session_id.clone(), "messageId": message_id.clone() }),
        )
        .expect("preview");
    assert_eq!(preview["available"], true);
    assert_eq!(preview["changedFiles"].as_array().expect("files").len(), 1);
    let restored = backend
        .call_agent_method(
            "agent.rollback.restore",
            json!({ "sessionId": session_id.clone(), "messageId": message_id.clone() }),
        )
        .expect("restore");
    assert_eq!(restored["restoredFileCount"], 1);
    assert_eq!(
        fs::read_to_string(file_path).expect("read restored"),
        "before"
    );
    let after = backend
        .call_agent_method("agent.session.read", json!({ "sessionId": session_id }))
        .expect("read after restore");
    assert_eq!(after["messages"].as_array().expect("messages").len(), 0);
}
#[test]
fn direct_file_read_requests_outside_workspace_permission() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let outside = tempfile::tempdir().expect("outside tempdir");
    let outside_file = outside.path().join("outside-workspace.txt");
    fs::write(&outside_file, "outside workspace").expect("write outside file");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Outside Workspace Permission", "workingDir": temp.path().display().to_string() }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let read_session_id = session_id.clone();
    let read_turn_id = turn_id.clone();
    let read_cancellation = cancellation.clone();
    let read_handle = thread::spawn(move || {
        execute_model_tool_sync(
            &read_session_id,
            &read_turn_id,
            &None,
            &read_cancellation,
            ModelToolCall {
                id: "tool-outside-denied".to_string(),
                name: READ_FILE_MODEL_TOOL.to_string(),
                arguments: json!({ "path": outside_file.display().to_string() }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id, "permissionId": permission_id, "allowed": false }),
        )
        .expect("deny outside read permission");
    let denied_output = read_handle.join().expect("join outside read");
    assert_eq!(
        denied_output.pointer("/error/code").and_then(Value::as_str),
        Some("permission_denied")
    );
    assert!(
        state()
            .lock()
            .expect("state lock")
            .pending_permissions
            .is_empty()
    );
}

#[test]
fn permission_request_denies_and_allows_native_file_write() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let denied_path = temp.path().join("denied.txt");
    let allowed_path = temp.path().join("allowed.txt");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Permission Test", "workingDir": temp.path().display().to_string() }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    pin_file_writes_to_ask(&session_id);
    let denied_turn_id = start_test_runtime_turn(&session_id);
    record_test_investigation(&session_id, &denied_turn_id, "investigate-denied-file");
    let denied_session_id = session_id.clone();
    let denied_patch = "*** Begin Patch\n*** Add File: denied.txt\n+nope\n*** End Patch\n";
    let denied_handle = thread::spawn(move || {
        execute_model_tool_sync(
            &denied_session_id,
            &denied_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-denied".to_string(),
                name: "apply_patch".to_string(),
                arguments: json!({ "patch": denied_patch }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id.clone(), "permissionId": permission_id, "allowed": false }),
        )
        .expect("deny permission");
    let denied_output = denied_handle.join().expect("join denied");
    assert_eq!(
        denied_output.pointer("/error/code").and_then(Value::as_str),
        Some("permission_denied")
    );
    assert_eq!(
        denied_output
            .pointer("/policyDecision/outcome")
            .and_then(Value::as_str),
        Some("denied")
    );
    assert!(
        denied_output["changes"]
            .as_array()
            .is_none_or(|changes| changes.is_empty())
    );
    assert!(!denied_path.exists());
    let allowed_turn_id = start_test_runtime_turn(&session_id);
    record_test_investigation(&session_id, &allowed_turn_id, "investigate-allowed-file");
    let allowed_session_id = session_id.clone();
    let allowed_patch = "*** Begin Patch\n*** Add File: allowed.txt\n+yes\n*** End Patch\n";
    let allowed_handle = thread::spawn(move || {
        execute_model_tool_sync(
            &allowed_session_id,
            &allowed_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-allowed".to_string(),
                name: "apply_patch".to_string(),
                arguments: json!({ "patch": allowed_patch }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id.clone(), "permissionId": permission_id, "allowed": true }),
        )
        .expect("allow permission");
    let allowed_output = allowed_handle.join().expect("join allowed");
    assert!(
        allowed_output["content"]
            .as_str()
            .unwrap()
            .contains("allowed.txt")
    );
    assert_eq!(allowed_output["activityKind"].as_str(), Some("edit"));
    assert_eq!(
        allowed_output
            .pointer("/raw/policyDecision/mode")
            .and_then(Value::as_str),
        Some("user_prompt")
    );
    assert_eq!(
        allowed_output
            .pointer("/raw/policyDecision/outcome")
            .and_then(Value::as_str),
        Some("approved")
    );
    assert!(
        allowed_output["raw"]["diffArtifactRef"]["id"]
            .as_str()
            .is_some()
    );
    assert!(
        allowed_output["raw"]["changedFiles"]
            .as_array()
            .is_some_and(|changes| changes.iter().any(|change| {
                change["path"] == "allowed.txt"
                    && change["beforeRef"]["id"].is_string()
                    && change["afterRef"]["id"].is_string()
                    && change["diffRef"]["id"].is_string()
            }))
    );
    assert_eq!(
        fs::read_to_string(allowed_path).expect("read allowed"),
        "yes\n"
    );
    let spoofed_large_path = temp.path().join("spoofed-large.txt");
    let spoofed_large_turn_id = start_test_runtime_turn(&session_id);
    let spoofed_large_output = execute_model_tool_sync(
        &session_id,
        &spoofed_large_turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-spoofed-large-write",
            "/tools/filesystem/write_file",
            json!({
                "path": "spoofed-large.txt",
                "content": "z".repeat(12_001),
                "overwrite": true
            }),
        ),
    );
    assert_eq!(
        spoofed_large_output
            .pointer("/error/code")
            .and_then(Value::as_str),
        Some("tool_not_found")
    );
    assert!(!spoofed_large_path.exists());
    let denied_shell_path = temp.path().join("denied-shell.txt");
    fs::write(&denied_shell_path, "keep").expect("write denied shell file");
    let denied_shell_turn_id = start_test_runtime_turn(&session_id);
    record_test_investigation(
        &session_id,
        &denied_shell_turn_id,
        "investigate-denied-shell",
    );
    let denied_shell_session_id = session_id.clone();
    let denied_shell_handle = thread::spawn(move || {
        execute_model_tool_sync(
            &denied_shell_session_id,
            &denied_shell_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-shell-denied".to_string(),
                name: EXEC_COMMAND_MODEL_TOOL.to_string(),
                arguments: json!({ "timeout_ms": 8000, "cmd": "rm denied-shell.txt" }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id.clone(), "permissionId": permission_id, "allowed": false }),
        )
        .expect("deny shell permission");
    let denied_shell_output = denied_shell_handle.join().expect("join denied shell");
    assert_eq!(
        denied_shell_output
            .pointer("/error/code")
            .and_then(Value::as_str),
        Some("permission_denied")
    );
    assert!(denied_shell_path.exists());
    let allowed_shell_path = temp.path().join("allowed-shell.txt");
    fs::write(&allowed_shell_path, "remove").expect("write allowed shell file");
    let allowed_shell_turn_id = start_test_runtime_turn(&session_id);
    record_test_investigation(
        &session_id,
        &allowed_shell_turn_id,
        "investigate-allowed-shell",
    );
    let allowed_shell_session_id = session_id.clone();
    let allowed_shell_handle = thread::spawn(move || {
        execute_model_tool_sync(
            &allowed_shell_session_id,
            &allowed_shell_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-shell-allowed".to_string(),
                name: EXEC_COMMAND_MODEL_TOOL.to_string(),
                arguments: json!({ "timeout_ms": 8000, "cmd": "rm allowed-shell.txt" }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id.clone(), "permissionId": permission_id, "allowed": true }),
        )
        .expect("allow shell permission");
    let allowed_shell_output = allowed_shell_handle.join().expect("join allowed shell");
    assert_eq!(allowed_shell_output["raw"]["success"].as_bool(), Some(true));
    assert_eq!(
        allowed_shell_output
            .pointer("/raw/policyDecision/mode")
            .and_then(Value::as_str),
        Some("user_prompt")
    );
    assert!(!allowed_shell_path.exists());
    let unbound_shell_path = temp.path().join("unbound-shell.txt");
    fs::write(&unbound_shell_path, "keep").expect("write unbound shell file");
    let unbound = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Unbound Shell Permission" }),
        )
        .expect("create unbound shell session");
    let unbound_session_id = unbound["id"]
        .as_str()
        .expect("unbound session id")
        .to_string();
    let unbound_turn_id = start_test_runtime_turn(&unbound_session_id);
    record_test_investigation(
        &unbound_session_id,
        &unbound_turn_id,
        "investigate-unbound-shell",
    );
    let unbound_shell_session_id = unbound_session_id.clone();
    let unbound_cwd = temp.path().display().to_string();
    let unbound_shell_handle = thread::spawn(move || {
        execute_model_tool_sync(
            &unbound_shell_session_id,
            &unbound_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-shell-unbound-denied".to_string(),
                name: EXEC_COMMAND_MODEL_TOOL.to_string(),
                arguments: json!({ "timeout_ms": 8000, "cmd": "rm unbound-shell.txt", "workdir": unbound_cwd }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&unbound_session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": unbound_session_id, "permissionId": permission_id, "allowed": false }),
        )
        .expect("deny unbound shell permission");
    let unbound_shell_output = unbound_shell_handle
        .join()
        .expect("join unbound denied shell");
    assert_eq!(
        unbound_shell_output
            .pointer("/error/code")
            .and_then(Value::as_str),
        Some("permission_denied")
    );
    assert!(unbound_shell_path.exists());
}

#[test]
fn tool_fs_permission_modes_gate_before_adapter_execution() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Permission Mode Test", "workingDir": temp.path().display().to_string() }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();

    let read_turn_id = start_test_runtime_turn(&session_id);
    let read_output = execute_model_tool_sync(
        &session_id,
        &read_turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call_with_permission_mode(
            "tool-read-only-memory",
            "/tools/memory/search",
            json!({ "query": "hello" }),
            "read_only",
        ),
    );
    assert_eq!(read_output["status"].as_str(), Some("completed"));
    assert_eq!(
        read_output
            .pointer("/toolOperation/permissionMode")
            .and_then(Value::as_str),
        Some("read_only")
    );

    let denied_path = temp.path().join("read-only-denied.txt");
    let read_only_turn_id = start_test_runtime_turn(&session_id);
    let read_only_output = execute_model_tool_sync(
        &session_id,
        &read_only_turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call_with_permission_mode(
            "tool-read-only-write",
            "/tools/filesystem/write_file",
            json!({ "path": "read-only-denied.txt", "content": "no", "overwrite": true }),
            "read_only",
        ),
    );
    assert_eq!(read_only_output["status"].as_str(), Some("failed"));
    assert_eq!(
        read_only_output
            .pointer("/error/code")
            .and_then(Value::as_str),
        Some("tool_not_found")
    );
    assert!(!denied_path.exists());

    let deny_turn_id = start_test_runtime_turn(&session_id);
    let deny_output = execute_model_tool_sync(
        &session_id,
        &deny_turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call_with_permission_mode(
            "tool-deny-memory",
            "/tools/memory/search",
            json!({ "query": "hello" }),
            "deny",
        ),
    );
    assert_eq!(deny_output["status"].as_str(), Some("failed"));
    assert_eq!(
        deny_output["notRunReason"].as_str(),
        Some("permission_denied")
    );

    let full_access_turn_id = start_test_runtime_turn(&session_id);
    let full_access_output = execute_model_tool_sync(
        &session_id,
        &full_access_turn_id,
        &None,
        &CancellationToken::new(),
        tool_fs_run_call_with_permission_mode(
            "tool-full-access-memory",
            "/tools/memory/search",
            json!({ "query": "hello" }),
            "full_access",
        ),
    );
    assert_eq!(full_access_output["status"].as_str(), Some("completed"));
    assert_eq!(
        full_access_output
            .pointer("/toolOperation/permissionMode")
            .and_then(Value::as_str),
        Some("full_access")
    );
    assert!(
        state()
            .lock()
            .expect("state lock")
            .pending_permissions
            .is_empty()
    );
}

#[test]
fn lumen_live_login_state_requires_permission_even_for_read_tools() {
    assert_eq!(
        permission_risk(
            "lyra_lumen",
            "map",
            &json!({
                "targetMode": "isolated",
                "authState": "borrowLiveLogin"
            })
        ),
        Some("sensitive".to_string())
    );
    assert_eq!(
        permission_risk(
            "lyra_lumen",
            "read",
            &json!({
                "targetMode": "isolated",
                "useLiveLoginState": true
            })
        ),
        Some("sensitive".to_string())
    );
    assert_eq!(
        permission_risk("lyra_lumen", "map", &json!({ "targetMode": "isolated" })),
        None
    );
    assert_eq!(
        permission_risk("lyra_lumen", "wait", &json!({ "targetMode": "isolated" })),
        None
    );
    assert_eq!(
        permission_risk(
            "lyra_lumen",
            "read",
            &json!({
                "targetMode": "isolated",
                "useLiveLoginState": true
            })
        ),
        Some("sensitive".to_string())
    );
}

#[test]
fn lumen_visual_act_is_dangerous_and_summarizes_capture_reason() {
    let input = json!({
        "tabId": "browser-tab-1",
        "targetMode": "live",
        "captureId": "visual-capture-1",
        "reason": "click rendered canvas button"
    });
    assert_eq!(
        permission_risk("lyra_lumen", "vact", &input),
        Some("dangerous".to_string())
    );
    let summary = permission_summary("lyra_lumen", "vact", &input);
    assert!(summary.contains("captureId=visual-capture-1"));
    assert!(summary.contains("reason=click rendered canvas button"));
}

#[test]
fn terminal_host_tools_apply_read_and_write_permission_policy() {
    assert_eq!(permission_risk("terminal", "list", &json!({})), None);
    assert_eq!(
        permission_risk("terminal", "read", &json!({ "sessionId": "terminal-1" })),
        None
    );
    assert_eq!(
        permission_risk("terminal", "screen", &json!({ "sessionId": "terminal-1" })),
        None
    );
    assert_eq!(
        permission_risk("terminal", "wait", &json!({ "sessionId": "terminal-1" })),
        None
    );
    assert_eq!(
        permission_risk("terminal", "create", &json!({ "mode": "shell" })),
        None
    );
    assert_eq!(
        permission_risk("terminal", "create", &json!({ "command": "npm test" })),
        Some("shell".to_string())
    );
    assert_eq!(
        permission_risk("terminal", "write", &json!({ "text": "npm test" })),
        Some("shell".to_string())
    );
    assert_eq!(
        permission_risk("terminal", "close", &json!({ "sessionId": "terminal-1" })),
        Some("shell".to_string())
    );
}

#[test]
fn direct_write_stdin_records_permission_and_log_artifact() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Terminal Mutation Change Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|method, payload| {
        assert_eq!(method, "terminal.write");
        let input: Value = serde_json::from_str(&payload).expect("terminal payload json");
        assert_eq!(input["action"], "write");
        assert_eq!(input["sessionId"], "terminal-session-1");
        assert_eq!(input["data"], "npm test\n");
        Ok(serde_json::to_string(&json!({
            "ok": true,
            "target": { "type": "private", "sessionId": "terminal-session-1" },
            "sessionId": "terminal-session-1",
            "output": "wrote 9 bytes to terminal-session-1",
            "running": true,
            "exitCode": null,
            "truncated": false
        }))
        .expect("json"))
    });
    let run_session_id = session_id.clone();
    let run_dispatcher = dispatcher.clone();
    let handle = thread::spawn(move || {
        execute_model_tool_sync(
            &run_session_id,
            &turn_id,
            &Some(run_dispatcher),
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-terminal-write".to_string(),
                name: WRITE_STDIN_MODEL_TOOL.to_string(),
                arguments: json!({
                    "sessionId": "terminal-session-1",
                    "chars": "npm test\n"
                }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id, "permissionId": permission_id, "allowed": true }),
        )
        .expect("allow terminal write permission");
    let output = handle.join().expect("join terminal write");
    assert_eq!(
        output
            .pointer("/raw/logArtifactRef/kind")
            .and_then(Value::as_str),
        Some("log")
    );
    assert_eq!(
        output
            .pointer("/raw/policyDecision/mode")
            .and_then(Value::as_str),
        Some("user_prompt")
    );
}

#[test]
fn permission_policy_does_not_infer_risk_from_free_text_keywords() {
    assert_eq!(
        permission_risk(
            "unknown",
            "noop",
            &json!({
                "note": "please delete file and exec shell command",
                "description": "write patch terminal"
            })
        ),
        None
    );
    assert_eq!(
        permission_risk(
            "workbench",
            "read_tab",
            &json!({ "title": "delete file shell exec" })
        ),
        None
    );
    assert_eq!(
        permission_risk("lyra_lumen", "press", &json!({ "label": "plain press" })),
        Some("dangerous".to_string())
    );
}
#[test]
fn clarification_tool_resumes_same_turn_without_assistant_bubble() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Clarification Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    session_runtime::register_turn_activity(&turn_id);
    let thread_session_id = session_id.clone();
    let first_turn_id = turn_id.clone();
    let handle = thread::spawn(move || {
        execute_model_tool_sync(
            &thread_session_id,
            &first_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-clarify".to_string(),
                name: LYRA_CLARIFICATION_ASK_TOOL.to_string(),
                arguments: json!({
                    "question": "Which target?",
                    "options": ["A", "B"],
                    "allowCustomAnswer": true
                }),
            },
        )
    });
    let clarification_id = wait_for_pending_clarification(&session_id);
    assert!(session_runtime::turn_activity_is_paused(&turn_id));
    thread::sleep(Duration::from_millis(80));
    assert!(session_runtime::turn_activity_is_paused(&turn_id));
    backend
        .call_agent_method(
            "agent.clarification.respond",
            json!({
                "sessionId": session_id.clone(),
                "clarificationId": clarification_id,
                "answer": "A",
                "selectedOption": "A"
            }),
        )
        .expect("respond clarification");
    let output = handle.join().expect("join clarification");
    assert_eq!(output["answer"], "A");
    assert!(!session_runtime::turn_activity_is_paused(&turn_id));
    let thread_session_id = session_id.clone();
    let second_turn_id = turn_id.clone();
    let handle = thread::spawn(move || {
        execute_model_tool_sync(
            &thread_session_id,
            &second_turn_id,
            &None,
            &CancellationToken::new(),
            ModelToolCall {
                id: "tool-clarify-again".to_string(),
                name: LYRA_CLARIFICATION_ASK_TOOL.to_string(),
                arguments: json!({
                    "question": "Which mode?",
                    "options": ["fast", "careful"],
                    "allowCustomAnswer": true
                }),
            },
        )
    });
    let clarification_id = wait_for_pending_clarification(&session_id);
    backend
        .call_agent_method(
            "agent.clarification.respond",
            json!({
                "sessionId": session_id.clone(),
                "clarificationId": clarification_id,
                "answer": "careful",
                "selectedOption": "careful"
            }),
        )
        .expect("respond second clarification");
    let output = handle.join().expect("join second clarification");
    assert_eq!(output["answer"], "careful");
    let read = backend
        .call_agent_method(
            "agent.session.read",
            json!({ "sessionId": session_id.clone() }),
        )
        .expect("read");
    assert_eq!(read["messages"].as_array().expect("messages").len(), 0);
    session_runtime::clear_active_turn(&session_id, &turn_id);
}

#[test]
fn browser_shared_control_interruption_requests_clarification_and_resolves_decision() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Shared Control Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|method, payload| {
        let input: Value = serde_json::from_str(&payload).expect("payload json");
        match method.as_str() {
            "lyraLumen.read" => Ok(serde_json::to_string(&json!({
                "ok": false,
                "kind": "lyraLumenControlHandoff",
                "tabId": "browser-tab-1",
                "targetMode": "live",
                "needsUserAction": {
                    "kind": "shared_control_interrupted",
                    "tabId": "browser-tab-1",
                    "targetMode": "live"
                }
            }))
            .expect("json")),
            "lyraLumen.resolveControlHandoff" => {
                assert_eq!(input["decision"], "continue_agent");
                Ok(serde_json::to_string(&json!({
                    "ok": true,
                    "kind": "lyraLumenControlDecision",
                    "tabId": "browser-tab-1",
                    "decision": "continue_agent"
                }))
                .expect("json"))
            }
            other => panic!("unexpected method {other}"),
        }
    });
    let thread_session_id = session_id.clone();
    let thread_turn_id = turn_id.clone();
    let handle = thread::spawn(move || {
        execute_model_tool_sync(
            &thread_session_id,
            &thread_turn_id,
            &Some(dispatcher),
            &CancellationToken::new(),
            tool_fs_run_call(
                "tool-read-interrupted",
                "/tools/browser/read",
                json!({ "tabId": "browser-tab-1", "targetMode": "live" }),
            ),
        )
    });
    let clarification_id = wait_for_pending_clarification(&session_id);
    backend
        .call_agent_method(
            "agent.clarification.respond",
            json!({
                "sessionId": session_id.clone(),
                "clarificationId": clarification_id,
                "answer": "Continue Agent",
                "selectedOption": "Continue Agent"
            }),
        )
        .expect("respond clarification");
    let output = handle.join().expect("join interrupted read");
    assert_eq!(
        output
            .pointer("/raw/userActionResolution/decision")
            .and_then(Value::as_str),
        Some("continue_agent")
    );
    assert!(
        output["content"]
            .as_str()
            .unwrap_or_default()
            .contains("shared_control_decision")
    );
    let read = backend
        .call_agent_method("agent.session.read", json!({ "sessionId": session_id }))
        .expect("read session");
    assert_eq!(read["tools"][0]["status"], "uncertain");
}
#[test]
fn auth_challenge_does_not_open_a_system_pause() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Auth Continues" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let dispatcher: Arc<HostCapabilityDispatcher> =
        Arc::new(|method, _payload| match method.as_str() {
            "lyraLumen.map" => Ok(serde_json::to_string(&json!({
                "ok": true,
                "kind": "lyraLumenMap",
                "tabId": "browser-tab-1",
                "targetMode": "live",
                "observationId": "obs-live-auth",
                "title": "Login",
                "url": "https://example.com/login",
                "elements": [{ "id": 1, "role": "button", "label": "Sign in" }],
                "needsUserAction": {
                    "kind": "auth_challenge",
                    "reason": "captcha",
                    "actionability": "user_only",
                    "confidence": "high",
                    "taskBlocking": true,
                    "stableObservationCount": 3
                }
            }))
            .expect("json")),
            other => panic!("unexpected method {other}"),
        });
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &Some(dispatcher),
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-map-live-auth",
            "/tools/browser/map",
            json!({ "tabId": "browser-tab-1", "targetMode": "live" }),
        ),
    );
    assert!(output.pointer("/raw/userActionResolution").is_none());
    assert!(
        state()
            .lock()
            .expect("state lock")
            .pending_clarifications
            .is_empty()
    );
}
