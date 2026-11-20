use super::*;

#[test]
fn native_state_persists_only_live_pending_requests() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut session = new_session(Some("Pending".to_string()), None, "normal");
    let session_id = session.id.clone();
    let live_turn_id = "turn-live".to_string();
    session.snapshot["turnStatus"] = Value::String("running".to_string());
    session.snapshot["activeTurnId"] = Value::String(live_turn_id.clone());
    let stale_turn_id = "turn-stale".to_string();
    let now = now();
    let permission =
        |id: &str, turn_id: &str, status: &str, allowed: Option<bool>| PermissionRequest {
            id: id.to_string(),
            session_id: session_id.clone(),
            turn_id: turn_id.to_string(),
            tool_call_id: "tool".to_string(),
            action: "act".to_string(),
            risk: "dangerous".to_string(),
            summary: "summary".to_string(),
            why: "why".to_string(),
            title: "title".to_string(),
            detail: "detail".to_string(),
            status: status.to_string(),
            allowed,
            created_at: now.clone(),
            responded_at: allowed.map(|_| now.clone()),
        };
    let clarification =
        |id: &str, turn_id: &str, status: &str, answer: Option<String>| ClarificationRequest {
            id: id.to_string(),
            session_id: session_id.clone(),
            turn_id: turn_id.to_string(),
            tool_call_id: "tool".to_string(),
            question: "question".to_string(),
            i18n_key: None,
            options: Vec::new(),
            allow_custom_answer: true,
            detail: None,
            detail_i18n_key: None,
            status: status.to_string(),
            answer: answer.clone(),
            selected_option: answer.clone(),
            created_at: now.clone(),
            responded_at: answer.map(|_| now.clone()),
        };
    let mut state = NativeRuntimeState {
        root: temp.path().to_path_buf(),
        tool_runtime_schema_version: TOOL_RUNTIME_SCHEMA_VERSION,
        tool_runtime_migration_diagnostics: Vec::new(),
        tool_usage_cache: HashMap::new(),
        sessions: HashMap::from([(session_id.clone(), session)]),
        active_session_id: Some(session_id.clone()),
        config: NativeConfig::default(),
        pending_permissions: HashMap::from([
            (
                "permission-live".to_string(),
                permission("permission-live", &live_turn_id, "pending", None),
            ),
            (
                "permission-complete".to_string(),
                permission("permission-complete", &live_turn_id, "allowed", Some(true)),
            ),
            (
                "permission-stale".to_string(),
                permission("permission-stale", &stale_turn_id, "pending", None),
            ),
        ]),
        pending_clarifications: HashMap::from([
            (
                "clarification-live".to_string(),
                clarification("clarification-live", &live_turn_id, "pending", None),
            ),
            (
                "clarification-complete".to_string(),
                clarification(
                    "clarification-complete",
                    &live_turn_id,
                    "answered",
                    Some("A".to_string()),
                ),
            ),
            (
                "clarification-stale".to_string(),
                clarification("clarification-stale", &stale_turn_id, "pending", None),
            ),
        ]),
        model_capabilities: HashMap::new(),
        media_model_defaults: HashMap::new(),
        suppressed_tool_usage_by_turn: HashMap::new(),
        inspected_tool_descriptors_by_session: HashMap::new(),
        active_compressions: HashSet::new(),
        legacy_plaintext_provider_keys: HashSet::new(),
        first_used_at: None,
        dirty: false,
    };
    assert!(state.prune_non_live_pending());
    state.save_state().expect("save state");
    let persisted =
        read_json::<NativeStateFile>(&temp.path().join("state.json")).expect("persisted state");
    assert_eq!(
        persisted
            .pending_permissions
            .keys()
            .cloned()
            .collect::<Vec<_>>(),
        vec!["permission-live".to_string()]
    );
    assert_eq!(
        persisted
            .pending_clarifications
            .keys()
            .cloned()
            .collect::<Vec<_>>(),
        vec!["clarification-live".to_string()]
    );
}
#[test]
fn native_backend_defaults_unbound_workspace_tools_to_home_directory() {
    // An unbound session (the user sent a message without choosing a project)
    // defaults both shell and filesystem tools to the user's home directory
    // instead of rejecting filesystem work. This keeps the two tool families
    // operating in the same place and lets users start chatting without first
    // binding a project.
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Unbound Test" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let list = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        tool_fs_run_call(
            "tool-list",
            "/tools/filesystem/list_files",
            json!({ "path": "." }),
        ),
    );
    assert_eq!(list["status"].as_str(), Some("completed"));
    assert_eq!(list["raw"]["path"].as_str(), Some("."));
    assert_ne!(
        list.pointer("/error/code").and_then(Value::as_str),
        Some("workspace_unbound")
    );

    let shell = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "tool-shell-unbound".to_string(),
            name: EXEC_COMMAND_MODEL_TOOL.to_string(),
            arguments: json!({ "timeout_ms": 8000, "cmd": "printf shell-ok" }),
        },
    );
    assert_eq!(shell["raw"]["success"].as_bool(), Some(true));
    assert_eq!(shell["raw"]["stdout"].as_str(), Some("shell-ok"));
    assert_ne!(
        shell.pointer("/error/code").and_then(Value::as_str),
        Some("workspace_unbound")
    );
}

#[test]
fn native_backend_rejects_rebinding_a_session_already_bound_to_a_project() {
    // Once a session is bound to a real project the binding is permanent:
    // re-binding to a different root would desynchronize the session's tool
    // history, file-read state, and rollback checkpoints from the new root.
    let backend = LyraAgentBackend;
    let first = tempfile::tempdir().expect("first tempdir");
    let second = tempfile::tempdir().expect("second tempdir");
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Rebind Test" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();

    // First bind succeeds (session starts home-bound, which may be rebound once).
    let bound = backend
        .call_agent_method(
            "agent.session.bindProject",
            json!({
                "sessionId": session_id,
                "workingDir": first.path().display().to_string()
            }),
        )
        .expect("first bind");
    assert_eq!(bound["projectBound"], true);

    // Second bind to a different root is rejected.
    let rebind = backend.call_agent_method(
        "agent.session.bindProject",
        json!({
            "sessionId": session_id,
            "workingDir": second.path().display().to_string()
        }),
    );
    assert!(rebind.is_err(), "rebinding a bound session must fail");

    // The original binding is preserved.
    let read = backend
        .call_agent_method("agent.session.read", json!({ "sessionId": session_id }))
        .expect("read session");
    assert_eq!(
        read["workingDir"].as_str(),
        Some(first.path().display().to_string().as_str())
    );
}

#[test]
fn tool_fs_run_always_returns_tool_result_envelope_for_adapter_outputs() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::write(temp.path().join("note.txt"), "adapter envelope").expect("write note");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Adapter Envelope Test",
                "workingDir": temp.path().display().to_string()
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let cancellation = CancellationToken::new();
    for (index, (path, args, expected_domain, expected_operation)) in
        [("/tools/memory/search", json!({}), "memory", "search")]
            .into_iter()
            .enumerate()
    {
        let turn_id = start_test_runtime_turn(&session_id);
        let output = execute_model_tool_sync(
            &session_id,
            &turn_id,
            &None,
            &cancellation,
            tool_fs_run_call(&format!("tool-envelope-{index}"), path, args),
        );
        assert_eq!(output["schemaVersion"].as_u64(), Some(1), "{path}");
        assert_eq!(output["status"].as_str(), Some("completed"), "{path}");
        assert_eq!(output["ok"].as_bool(), Some(true), "{path}");
        assert_eq!(
            output["runtimeTurnId"].as_str(),
            Some(turn_id.as_str()),
            "{path}"
        );
        assert_eq!(output["toolPath"].as_str(), Some(path), "{path}");
        assert_eq!(output["domain"].as_str(), Some(expected_domain), "{path}");
        assert_eq!(
            output["operation"].as_str(),
            Some(expected_operation),
            "{path}"
        );
        assert!(output["traceId"].as_str().is_some(), "{path}");
        assert!(
            output["trace"].as_array().is_some_and(|trace| {
                trace.iter().any(|record| record["phase"] == "executing")
                    && trace.iter().any(|record| record["phase"] == "completed")
            }),
            "{path}"
        );
        assert!(output["toolOperation"].is_object(), "{path}");
        assert!(output["manifestTitle"].as_str().is_some(), "{path}");
        assert!(output["raw"].is_object(), "{path}");
    }
}

#[test]
fn removed_tool_fs_filesystem_targets_use_direct_tools() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::write(temp.path().join("README.md"), "tool fs read file\n").expect("write README");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Tool-FS Filesystem Target Test",
                "workingDir": temp.path().display().to_string()
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();

    let legacy = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "legacy-file-read".to_string(),
            name: "file_read".to_string(),
            arguments: json!({ "path": "README.md" }),
        },
    );
    assert_eq!(
        legacy.pointer("/error/code").and_then(Value::as_str),
        Some("tool_not_found")
    );

    let inspect = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "inspect-read-file".to_string(),
            name: "tool_fs_inspect".to_string(),
            arguments: json!({ "path": "/tools/filesystem/read_file" }),
        },
    );
    assert_eq!(inspect["status"].as_str(), Some("failed"));
    assert_eq!(
        inspect.pointer("/error/code").and_then(Value::as_str),
        Some("tool_not_found")
    );

    let read_file = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "run-read-file".to_string(),
            name: READ_FILE_MODEL_TOOL.to_string(),
            arguments: json!({ "path": "README.md" }),
        },
    );
    assert!(
        read_file["content"]
            .as_str()
            .is_some_and(|text| text.contains("tool fs read file"))
    );

    let invalid_args = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "invalid-tool-fs-args".to_string(),
            name: "memory_search".to_string(),
            arguments: json!([]),
        },
    );
    assert_eq!(
        invalid_args.pointer("/error/code").and_then(Value::as_str),
        Some("invalid_tool_args")
    );
    assert_eq!(invalid_args["schemaVersion"].as_u64(), Some(1));
    assert_eq!(invalid_args["status"].as_str(), Some("failed"));
    assert_eq!(
        invalid_args["runtimeTurnId"].as_str(),
        Some(turn_id.as_str())
    );
    assert!(invalid_args["traceId"].as_str().is_some());

    let inactive_turn = execute_model_tool_sync(
        &session_id,
        "turn-not-active",
        &None,
        &cancellation,
        ModelToolCall {
            id: "inactive-turn-tool-fs-run".to_string(),
            name: "memory_search".to_string(),
            arguments: json!({}),
        },
    );
    assert_eq!(
        inactive_turn.pointer("/error/code").and_then(Value::as_str),
        Some("runtime_turn_not_active")
    );
    assert_eq!(inactive_turn["status"].as_str(), Some("failed"));
    let inactive_list = execute_internal_tool_fs_sync(
        &session_id,
        "turn-not-active",
        &None,
        &cancellation,
        ModelToolCall {
            id: "inactive-turn-tool-fs-list".to_string(),
            name: lyra_tool_fs_core::TOOL_FS_LIST.to_string(),
            arguments: json!({ "path": "/tools" }),
        },
    );
    assert_eq!(
        inactive_list.pointer("/error/code").and_then(Value::as_str),
        Some("runtime_turn_not_active")
    );
    assert_eq!(inactive_list["status"].as_str(), Some("failed"));
    assert!(
        inactive_list["trace"]
            .as_array()
            .expect("trace")
            .iter()
            .all(|record| {
                !matches!(
                    record.get("phase").and_then(Value::as_str),
                    Some("executing" | "completed")
                )
            })
    );

    let traced = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        tool_fs_run_call("traced-memory-search", "/tools/memory/search", json!({})),
    );
    assert_eq!(traced["status"].as_str(), Some("completed"));
    let policy_snapshot_id = traced
        .pointer("/toolOperation/policySnapshotId")
        .and_then(Value::as_str)
        .expect("policy snapshot id");
    assert!(policy_snapshot_id.contains(&session_id));
    assert!(policy_snapshot_id.contains(&turn_id));
    let trace = traced["trace"].as_array().expect("trace");
    let phases = trace
        .iter()
        .filter_map(|entry| entry["phase"].as_str())
        .collect::<Vec<_>>();
    let validated_index = phases
        .iter()
        .position(|phase| *phase == "validated")
        .expect("validated trace");
    let permission_index = phases
        .iter()
        .position(|phase| *phase == "permission_checked")
        .expect("permission trace");
    let executing_index = phases
        .iter()
        .position(|phase| *phase == "executing")
        .expect("executing trace");
    assert!(validated_index < permission_index);
    assert!(permission_index < executing_index);
    let permission_trace = &trace[permission_index];
    assert_eq!(
        permission_trace.pointer("/detail/policySnapshotId"),
        traced.pointer("/toolOperation/policySnapshotId")
    );
    assert_eq!(
        permission_trace
            .pointer("/detail/permissionMode")
            .and_then(Value::as_str),
        Some("runtime_policy")
    );
    assert_eq!(
        permission_trace
            .pointer("/detail/permissionPolicy")
            .and_then(Value::as_str),
        Some("runtime_policy")
    );
    assert_eq!(
        permission_trace
            .pointer("/detail/toolPath")
            .and_then(Value::as_str),
        Some("/tools/memory/search")
    );
}

#[test]
fn tool_search_selects_and_promotes_deferred_names() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Tool Search Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "tool-search-select".to_string(),
            name: TOOL_SEARCH_TOOL_NAME.to_string(),
            arguments: json!({ "query": "select:browser_scroll" }),
        },
    );

    assert_eq!(output["status"].as_str(), Some("completed"));
    assert!(
        output["raw"]["matches"]
            .as_array()
            .expect("search matches")
            .iter()
            .any(|name| name.as_str() == Some("browser_scroll"))
    );
    assert!(
        output["content"]
            .as_str()
            .is_some_and(|content| content.contains("browser_scroll"))
    );
    let snapshot = {
        let state = state().lock().expect("state lock");
        state
            .sessions
            .get(&session_id)
            .expect("session")
            .snapshot
            .clone()
    };
    let tools = assemble_provider_tools(&snapshot, None, Some(128_000));
    assert!(request_contains_tool(&tools, "browser_scroll"));

    let empty = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "tool-search-empty".to_string(),
            name: TOOL_SEARCH_TOOL_NAME.to_string(),
            arguments: json!({ "query": "" }),
        },
    );
    assert_eq!(empty["status"].as_str(), Some("completed"));
    assert_eq!(empty["raw"]["matches"].as_array().map(Vec::len), Some(0));
}

#[test]
fn tool_search_does_not_promote_removed_code_write_tools() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Generated File Write Search Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "tool-search-generated-html".to_string(),
            name: TOOL_SEARCH_TOOL_NAME.to_string(),
            arguments: json!({ "query": "lyra-write-file generated html" }),
        },
    );

    assert_eq!(output["status"].as_str(), Some("completed"));
    let matches = output["raw"]["matches"].as_array().expect("search matches");
    assert!(!matches.iter().any(|name| {
        name.as_str()
            .is_some_and(|value| value.contains("lyra-write-file") || value == "file_write")
    }));
}

#[test]
fn tool_search_bm25_hits_exact_deferred_name() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Tool Search BM25 Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        ModelToolCall {
            id: "tool-search-bm25".to_string(),
            name: TOOL_SEARCH_TOOL_NAME.to_string(),
            arguments: json!({ "query": "browser_scroll" }),
        },
    );
    assert_eq!(output["status"].as_str(), Some("completed"));
    assert!(
        output["raw"]["matches"]
            .as_array()
            .expect("search matches")
            .iter()
            .any(|name| name.as_str() == Some("browser_scroll"))
    );
}

#[test]
fn tool_search_description_lists_deferred_names_instead_of_presearch() {
    let tools = assemble_provider_tools(&json!({}), None, Some(128_000));
    let search = tools
        .iter()
        .find(|tool| {
            tool.pointer("/function/name").and_then(Value::as_str) == Some(TOOL_SEARCH_TOOL_NAME)
        })
        .expect("ToolSearch schema");
    let description = search
        .pointer("/function/description")
        .and_then(Value::as_str)
        .expect("ToolSearch description");
    assert!(description.contains("browser_navigate"));
    assert!(!description.contains("/tools/browser/navigate"));
    assert!(!description.contains("presearchHints"));
}

#[test]
fn tool_usage_cache_records_success_failure_and_context_handles() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::write(temp.path().join("note.txt"), "cached tool note").expect("write note");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Tool Usage Cache Test",
                "workingDir": temp.path().display().to_string()
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    {
        let mut state = state().lock().expect("state lock");
        state.tool_usage_cache.clear();
        state.suppressed_tool_usage_by_turn.clear();
    }
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();

    let success = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        tool_fs_run_call(
            "tool-cache-memory-success",
            "/tools/memory/search",
            json!({ "query": "cached tool note" }),
        ),
    );
    assert_eq!(success["ok"].as_bool(), Some(true));
    {
        let state = state().lock().expect("state lock");
        let entry = state
            .tool_usage_cache
            .get("/tools/memory/search")
            .expect("usage cache entry");
        assert!(entry.successes >= 1);
        assert_eq!(entry.failures, 0);
        assert_eq!(entry.consecutive_failures, 0);
        assert_eq!(entry.handle.as_deref(), Some("memory_search"));
    }

    let context = tool_filesystem_runtime_context("project-code", None, None);
    assert_eq!(context["scene"].as_str(), Some("project-code"));
    assert_eq!(context["internalRegistry"].as_bool(), Some(true));
    assert!(context.get("cachedHandles").is_none());

    let failed = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        tool_fs_run_call("tool-cache-memory-failed", "/tools/memory/write", json!({})),
    );
    assert_eq!(failed["ok"].as_bool(), Some(false));
    assert_eq!(failed["cacheSuppressedForTurn"].as_bool(), Some(true));
    assert!(
        failed["recommendedNextAction"]
            .as_str()
            .is_some_and(|action| action.contains("ToolSearch"))
    );
    {
        let state = state().lock().expect("state lock");
        let entry = state
            .tool_usage_cache
            .get("/tools/memory/write")
            .expect("usage cache entry");
        assert_eq!(entry.successes, 0);
        assert_eq!(entry.failures, 1);
        assert_eq!(entry.consecutive_failures, 1);
        assert!(
            state
                .suppressed_tool_usage_by_turn
                .get(&turn_id)
                .is_some_and(|paths| paths.contains("/tools/memory/write"))
        );
    }
}

#[test]
fn model_catalog_uses_structured_provider_capabilities() {
    let mut config = NativeConfig {
        default_provider: Some("custom".to_string()),
        default_model: Some("custom-model".to_string()),
        ..NativeConfig::default()
    };
    config.providers.insert(
        "custom".to_string(),
        NativeProviderProfile {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            route_id: "custom_openai_compatible".to_string(),
            base_url: Some("http://localhost:8787/v1".to_string()),
            default_model: Some("custom-model".to_string()),
            api_key_ref: None,
            api_key: Some("sk-test".to_string()),
            api_key_env: None,
            auth_header: None,
            embedding_model: Some("custom-embedding".to_string()),
            models: vec![NativeProviderModel {
                id: "custom-model".to_string(),
                label: Some("Custom Model".to_string()),
                context_window: Some(128_000),
                supports_image_input: true,
                supports_tool_calling: true,
                supports_streaming: true,
                supports_reasoning_effort: None,
                reasoning_replay_field: ReasoningReplayField::Auto,
                requires_reasoning_field_on_assistant_messages: None,
                supports_tool_choice: None,
                enabled: true,
                api_npm: None,
            }],
        },
    );
    let catalog = model_catalog_for_config(&config, json!({})).expect("model catalog");

    assert!(catalog["models"].as_array().is_some());
    assert!(catalog["routes"].as_array().is_some());
    assert!(catalog["models"].as_array().is_some_and(|models| {
        models.iter().any(|model| {
            model
                .get("embeddingModel")
                .and_then(Value::as_str)
                .is_some()
        })
    }));
}

#[test]
fn model_catalog_does_not_synthesize_models_without_configured_providers() {
    let catalog =
        model_catalog_for_config(&NativeConfig::default(), json!({})).expect("model catalog");

    assert_eq!(catalog["currentProvider"], "");
    assert_eq!(catalog["currentModel"], "");
    assert!(catalog["models"].as_array().is_some_and(Vec::is_empty));
    assert!(catalog["routes"].as_array().is_some_and(Vec::is_empty));
}

#[test]
fn config_json_projects_prompt_delivery_settings() {
    let config = NativeConfig {
        prompt_delivery_mode: Some("lean-experimental".to_string()),
        openai_responses_stateful_prompt_contract: true,
        ..NativeConfig::default()
    };
    let projection = config_json(&config);

    assert_eq!(
        projection
            .pointer("/promptDelivery/mode")
            .and_then(Value::as_str),
        Some("lean-experimental")
    );
    assert_eq!(
        projection
            .pointer("/promptDelivery/leanExperimental")
            .and_then(Value::as_bool),
        Some(true)
    );
    assert_eq!(
        projection
            .pointer("/promptDelivery/openaiResponsesStatefulPromptContract")
            .and_then(Value::as_bool),
        Some(true)
    );
}

#[test]
fn default_provider_install_seeds_no_builtin_model_catalogs() {
    let mut config = NativeConfig::default();
    install_default_providers(&mut config);

    assert!(
        config
            .providers
            .values()
            .all(|provider| provider.models.is_empty())
    );
    assert!(!config.providers.contains_key("mimo-free"));
    assert!(!config.providers.contains_key("opencode-free"));
    let catalog = model_catalog_for_config(&config, json!({})).expect("model catalog");
    assert_eq!(catalog["models"].as_array().map(Vec::len), Some(0));
    assert_eq!(catalog["routes"].as_array().map(Vec::len), Some(0));
}

#[test]
fn default_provider_install_removes_retired_anonymous_mimo_profile() {
    let mut config = NativeConfig {
        default_provider: Some("mimo-free".to_string()),
        default_model: Some("mimo-auto".to_string()),
        memory_agent_provider: Some("mimo-free".to_string()),
        memory_agent_model: Some("mimo-auto".to_string()),
        ..NativeConfig::default()
    };
    config.providers.insert(
        "mimo-free".to_string(),
        NativeProviderProfile {
            id: "mimo-free".to_string(),
            label: "MiMo Free".to_string(),
            route_id: providers::routes::custom_openai_compatible::ROUTE_ID.to_string(),
            base_url: Some("https://api.xiaomimimo.com/v1".to_string()),
            default_model: Some("mimo-auto".to_string()),
            api_key: Some("public".to_string()),
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        },
    );

    install_default_providers(&mut config);

    assert!(!config.providers.contains_key("mimo-free"));
    assert_eq!(config.default_provider.as_deref(), Some("openai"));
    assert!(config.memory_agent_provider.is_none());
    assert!(config.memory_agent_model.is_none());
}

#[test]
fn default_provider_install_removes_retired_anonymous_opencode_profile() {
    let mut config = NativeConfig {
        default_provider: Some("opencode-free".to_string()),
        default_model: Some("big-pickle".to_string()),
        memory_agent_provider: Some("opencode-free".to_string()),
        memory_agent_model: Some("big-pickle".to_string()),
        ..NativeConfig::default()
    };
    config.providers.insert(
        "opencode-free".to_string(),
        NativeProviderProfile {
            id: "opencode-free".to_string(),
            label: "OpenCode Free".to_string(),
            route_id: providers::routes::opencode::ZEN_ROUTE_ID.to_string(),
            base_url: Some(providers::routes::opencode::ZEN_BASE_URL.to_string()),
            default_model: Some("big-pickle".to_string()),
            api_key: Some("public".to_string()),
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        },
    );

    install_default_providers(&mut config);

    assert!(!config.providers.contains_key("opencode-free"));
    assert_eq!(config.default_provider.as_deref(), Some("openai"));
    assert!(config.memory_agent_provider.is_none());
    assert!(config.memory_agent_model.is_none());
}

#[test]
fn save_provider_profile_preserves_omitted_secret_and_models() {
    let backend = LyraAgentBackend;
    let profile_name = format!("preserve-profile-{}", Uuid::new_v4());
    let original_model = format!("preserve-model-{}", Uuid::new_v4());
    {
        let mut state = state().lock().expect("state lock");
        state.config.providers.insert(
            profile_name.clone(),
            NativeProviderProfile {
                id: profile_name.clone(),
                label: "Preserve Profile".to_string(),
                route_id: "custom_openai_compatible".to_string(),
                base_url: Some("https://old.example.com/v1".to_string()),
                default_model: Some(original_model.clone()),
                api_key_ref: None,
                api_key: Some("sk-preserve".to_string()),
                api_key_env: Some("LYRA_PRESERVE_API_KEY".to_string()),
                auth_header: Some("api-key".to_string()),
                embedding_model: Some("embedding-preserve".to_string()),
                models: vec![NativeProviderModel {
                    id: original_model.clone(),
                    label: Some("Preserve Model".to_string()),
                    context_window: Some(42_000),
                    supports_image_input: true,
                    supports_tool_calling: true,
                    supports_streaming: true,
                    supports_reasoning_effort: None,
                    reasoning_replay_field: ReasoningReplayField::Auto,
                    requires_reasoning_field_on_assistant_messages: None,
                    supports_tool_choice: None,
                    enabled: true,
                    api_npm: None,
                }],
            },
        );
    }

    backend
        .call_agent_method(
            "agent.provider.profile.save",
            json!({
                "profileName": profile_name,
                "routeId": "custom_openai_compatible",
                "baseUrl": "https://new.example.com/v1",
            }),
        )
        .expect("save provider profile");

    let state = state().lock().expect("state lock");
    let profile = state
        .config
        .providers
        .get(&profile_name)
        .expect("profile preserved");
    assert_eq!(
        profile.base_url.as_deref(),
        Some("https://new.example.com/v1")
    );
    assert_eq!(
        profile.default_model.as_deref(),
        Some(original_model.as_str())
    );
    assert_eq!(profile.api_key.as_deref(), Some("sk-preserve"));
    assert_eq!(
        profile.api_key_env.as_deref(),
        Some("LYRA_PRESERVE_API_KEY")
    );
    assert_eq!(profile.auth_header.as_deref(), Some("api-key"));
    assert_eq!(
        profile.embedding_model.as_deref(),
        Some("embedding-preserve")
    );
    assert_eq!(profile.models.len(), 1);
    assert_eq!(profile.models[0].id, original_model);
}

#[test]
fn switch_model_rejects_unknown_provider_and_leaves_defaults_unchanged() {
    // ponytail: regression guard for misroute 400. Previously switch_model set
    // default_model unconditionally even when the provider resolved to nothing,
    // producing default_provider=旧值 + default_model=新模型名 → 上游 400
    // "Model is unavailable". Now it rejects before mutating state.
    let backend = LyraAgentBackend;
    let default_provider = "switch-reject-guard".to_string();
    let default_model = "guard-model".to_string();
    let mut locked = state().lock().expect("state lock");
    let original_config = locked.config.clone();
    locked.config.default_provider = Some(default_provider.clone());
    locked.config.default_model = Some(default_model.clone());
    drop(locked);

    let error = backend
        .call_agent_method(
            "agent.models.switch",
            json!({ "model": "ghost-model", "provider": "nonexistent-profile" }),
        )
        .expect_err("switch should reject unconfigured provider");

    // State must be untouched: default_model stays the original, not "ghost-model".
    let mut locked = state().lock().expect("state lock");
    assert_eq!(
        locked.config.default_provider.as_deref(),
        Some(default_provider.as_str()),
        "default_provider must not change on rejected switch; error was: {:?}",
        error
    );
    assert_eq!(
        locked.config.default_model.as_deref(),
        Some(default_model.as_str()),
        "default_model must not change on rejected switch"
    );
    locked.config = original_config;
    locked.save_state().expect("restore test config");
}

#[test]
fn model_catalog_uses_composite_provider_model_uid_for_same_named_models() {
    // ponytail: 同名模型跨两个 provider 时，catalog 的 `id` 必须是复合
    // `${provider}:${model}`，否则前端下拉 value 撞车、switchModel 命中错误条目。
    let shared_model = "deepseek-v4-flash-free".to_string();
    fn profile_with(id: &str, model_id: &str) -> NativeProviderProfile {
        NativeProviderProfile {
            id: id.to_string(),
            label: id.to_string(),
            route_id: providers::routes::custom_openai_compatible::ROUTE_ID.to_string(),
            base_url: Some("https://example.com/v1".to_string()),
            default_model: Some(model_id.to_string()),
            api_key: Some("sk-test".to_string()),
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: vec![NativeProviderModel {
                id: model_id.to_string(),
                label: Some(model_id.to_string()),
                context_window: None,
                supports_image_input: false,
                supports_tool_calling: true,
                supports_streaming: true,
                supports_reasoning_effort: None,
                reasoning_replay_field: ReasoningReplayField::Auto,
                requires_reasoning_field_on_assistant_messages: None,
                supports_tool_choice: None,
                enabled: true,
                api_npm: None,
            }],
        }
    }
    let mut config = NativeConfig {
        default_provider: Some("provider-a".to_string()),
        default_model: Some(shared_model.clone()),
        ..NativeConfig::default()
    };
    config.providers.insert(
        "provider-a".to_string(),
        profile_with("provider-a", &shared_model),
    );
    config.providers.insert(
        "custom_openai_compatible".to_string(),
        profile_with("custom_openai_compatible", &shared_model),
    );

    let catalog = model_catalog_for_config(&config, json!({})).expect("model catalog");
    // HashMap 遍历顺序不确定，用集合比较，只验证两个复合 uid 都存在且互不相同。
    let ids = catalog["models"]
        .as_array()
        .expect("models")
        .iter()
        .map(|model| model["id"].as_str().expect("id string"))
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        ids,
        [
            "provider-a:deepseek-v4-flash-free",
            "custom_openai_compatible:deepseek-v4-flash-free"
        ]
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>(),
        "catalog ids must be composite and distinct for same-named cross-provider models"
    );
    // bare `model` 字段仍保留，wire 协议不变
    assert!(
        catalog["models"]
            .as_array()
            .expect("models")
            .iter()
            .all(|model| model["model"].as_str() == Some("deepseek-v4-flash-free"))
    );
}

#[test]
fn switch_model_rejects_provider_that_does_not_own_model() {
    // ponytail: provider 存在但不拥有该 model 时必须拒绝，否则 default_provider 指向
    // 该 provider + default_model=它不提供的模型 → 上游 400 "Model is unavailable"。
    let backend = LyraAgentBackend;
    let default_provider = "model-owner-guard".to_string();
    let default_model = "owned-model".to_string();
    let mut locked = state().lock().expect("state lock");
    let original_config = locked.config.clone();
    locked.config.default_provider = Some(default_provider.clone());
    locked.config.default_model = Some(default_model.clone());
    // model-owner-guard 拥有 owned-model；custom-plain 不拥有
    locked.config.providers.insert(
            "custom-plain".to_string(),
            NativeProviderProfile {
                id: "custom-plain".to_string(),
                label: "custom-plain".to_string(),
                route_id: providers::routes::custom_openai_compatible::ROUTE_ID.to_string(),
                base_url: Some("https://example.com/v1".to_string()),
                default_model: None,
                api_key: Some("sk-test".to_string()),
                api_key_ref: None,
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: vec![NativeProviderModel {
                    id: "other-model".to_string(),
                    label: Some("other-model".to_string()),
                    context_window: None,
                    supports_image_input: false,
                    supports_tool_calling: true,
                    supports_streaming: true,
                    supports_reasoning_effort: None,
                    reasoning_replay_field: ReasoningReplayField::Auto,
                    requires_reasoning_field_on_assistant_messages: None,
                    supports_tool_choice: None,
                    enabled: true,
                    api_npm: None,
                }],
            },
        );
    drop(locked);

    let error = backend
        .call_agent_method(
            "agent.models.switch",
            json!({ "model": "owned-model", "provider": "custom-plain" }),
        )
        .expect_err("switch should reject provider that does not own the model");

    let mut locked = state().lock().expect("state lock");
    assert_eq!(
        locked.config.default_provider.as_deref(),
        Some(default_provider.as_str()),
        "default_provider must not change; error was: {:?}",
        error
    );
    assert_eq!(
        locked.config.default_model.as_deref(),
        Some(default_model.as_str()),
        "default_model must not change when provider does not own the model"
    );
    locked.config = original_config;
    locked.save_state().expect("restore test config");
}

#[test]
fn save_mimo_anthropic_profile_uses_api_key_header_by_default() {
    let backend = LyraAgentBackend;
    let profile_name = format!("mimo-anthropic-profile-{}", Uuid::new_v4());

    backend
        .call_agent_method(
            "agent.provider.profile.save",
            json!({
                "profileName": profile_name,
                "routeId": providers::routes::mimo::ANTHROPIC_TOKEN_PLAN_SGP_ROUTE_ID,
                "apiKey": "tp-secret",
                "authHeader": null,
            }),
        )
        .expect("save mimo anthropic provider profile");

    let state = state().lock().expect("state lock");
    let profile = state
        .config
        .providers
        .get(&profile_name)
        .expect("profile saved");
    assert_eq!(
        profile.route_id,
        providers::routes::mimo::ANTHROPIC_TOKEN_PLAN_SGP_ROUTE_ID
    );
    assert_eq!(
        profile.base_url.as_deref(),
        Some(providers::routes::mimo::ANTHROPIC_TOKEN_PLAN_SGP_BASE_URL)
    );
    assert_eq!(profile.api_key.as_deref(), Some("tp-secret"));
    assert_eq!(profile.auth_header.as_deref(), Some("api-key"));
}

#[test]
fn model_catalog_keeps_disabled_models_out_of_routes() {
    let mut config = NativeConfig {
        default_provider: Some("custom".to_string()),
        default_model: Some("enabled-model".to_string()),
        ..NativeConfig::default()
    };
    config.providers.insert(
        "custom".to_string(),
        NativeProviderProfile {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            route_id: "custom_openai_compatible".to_string(),
            base_url: Some("http://localhost:8787/v1".to_string()),
            default_model: Some("enabled-model".to_string()),
            api_key_ref: None,
            api_key: Some("sk-test".to_string()),
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: vec![
                NativeProviderModel {
                    id: "enabled-model".to_string(),
                    label: None,
                    context_window: None,
                    supports_image_input: true,
                    supports_tool_calling: true,
                    supports_streaming: true,
                    supports_reasoning_effort: None,
                    reasoning_replay_field: ReasoningReplayField::Auto,
                    requires_reasoning_field_on_assistant_messages: None,
                    supports_tool_choice: None,
                    enabled: true,
                    api_npm: None,
                },
                NativeProviderModel {
                    id: "disabled-model".to_string(),
                    label: None,
                    context_window: None,
                    supports_image_input: true,
                    supports_tool_calling: true,
                    supports_streaming: true,
                    supports_reasoning_effort: None,
                    reasoning_replay_field: ReasoningReplayField::Auto,
                    requires_reasoning_field_on_assistant_messages: None,
                    supports_tool_choice: None,
                    enabled: false,
                    api_npm: None,
                },
            ],
        },
    );

    let catalog = model_catalog_for_config(&config, json!({})).expect("model catalog");
    let model_ids = catalog["models"]
        .as_array()
        .expect("models")
        .iter()
        .filter_map(|model| model["model"].as_str())
        .collect::<Vec<_>>();
    let route_models = catalog["routes"]
        .as_array()
        .expect("routes")
        .iter()
        .filter_map(|route| route["model"].as_str())
        .collect::<Vec<_>>();
    let disabled = catalog["models"]
        .as_array()
        .expect("models")
        .iter()
        .find(|model| model["model"].as_str() == Some("disabled-model"))
        .expect("disabled model");

    assert!(model_ids.contains(&"enabled-model"));
    assert!(model_ids.contains(&"disabled-model"));
    assert!(route_models.contains(&"enabled-model"));
    assert!(!route_models.contains(&"disabled-model"));
    assert_eq!(disabled["enabled"], false);
}

#[test]
fn model_request_injects_lyra_identity_and_tools() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Prompt Test" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id");
    {
        let mut state = state().lock().expect("state lock");
        write_json(
            &skill_storage_root().join("enabled.v1.json"),
            &HashSet::<String>::new(),
        )
        .unwrap();
        let session = state.sessions.get_mut(session_id).expect("session");
        session.snapshot["messages"]
            .as_array_mut()
            .expect("messages")
            .push(user_message(
                "Inspect Lyra's runtime contract.".to_string(),
                Vec::new(),
                now(),
            ));
    }
    let request =
        with_tool_capable_default_model(|| build_model_request(session_id).expect("model request"));
    let system_prompt = request.messages[0]["content"]
        .as_str()
        .expect("system prompt");
    assert!(system_prompt.contains("Work on this real computer"));
    assert!(system_prompt.contains("Translate the request into observable success criteria"));
    assert!(system_prompt.contains("Fix bugs at the shared root cause"));
    assert!(
        system_prompt
            .contains("Ordinary text questions are only for non-blocking or final communication")
    );
    let names = request
        .tools
        .iter()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .collect::<Vec<_>>();
    assert_eq!(
        names,
        expected_provider_tool_names()
            .iter()
            .map(String::as_str)
            .collect::<Vec<_>>()
    );
    let user_text = provider_latest_user_text(&request.messages);
    let env = provider_volatile_appendix(&request.messages);
    assert!(user_text.contains("Inspect Lyra's runtime contract"));
    for dynamic_field in ["\"interactionContract\"", "\"clarificationTool\""] {
        assert!(!system_prompt.contains(dynamic_field));
        assert!(!user_text.contains(dynamic_field));
        assert!(!env.contains(dynamic_field));
    }
    assert!(!user_text.contains("toolFilesystem"));
    assert!(!env.contains("toolFilesystem"));
    assert!(!user_text.contains("presearchHints"));
    assert!(!env.contains("presearchHints"));
    assert!(!user_text.contains("pinnedHandles"));
    assert!(!env.contains("pinnedHandles"));
    {
        let state = state().lock().expect("state lock");
        let session = state.sessions.get(session_id).expect("session");
        assert!(session.snapshot.get("promptRuntimeContract").is_some());
        assert_eq!(
            session
                .snapshot
                .pointer("/promptDelivery/promptMode")
                .and_then(Value::as_str),
            Some("full")
        );
        assert_eq!(
            session
                .snapshot
                .pointer("/promptDelivery/refreshReason")
                .and_then(Value::as_str),
            Some("fullModeDefault")
        );
        assert!(
            session
                .snapshot
                .pointer("/promptDelivery/sceneModules")
                .and_then(Value::as_array)
                .is_some()
        );
        assert!(
            session
                .snapshot
                .pointer("/promptDelivery/prefixCacheEligibleTokens")
                .and_then(Value::as_u64)
                .is_some_and(|tokens| tokens > 0)
        );
        assert!(
            session
                .snapshot
                .pointer("/promptDelivery/missedModuleRecovery")
                .is_some()
        );
    }
}

#[test]
fn model_request_keeps_tool_fs_visible_while_presearch_adds_hints() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Tool Presearch Prompt Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    write_json(
        &skill_storage_root().join("enabled.v1.json"),
        &HashSet::<String>::new(),
    )
    .unwrap();
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["messages"]
            .as_array_mut()
            .expect("messages")
            .push(user_message(
                "打开网页 https://www.google.com".to_string(),
                Vec::new(),
                now(),
            ));
    }

    let request = with_tool_capable_default_model(|| {
        build_model_request(&session_id).expect("model request")
    });
    let names = request
        .tools
        .iter()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();
    assert_eq!(names, expected_provider_tool_names());
    let system_prompt = request.messages[0]["content"]
        .as_str()
        .expect("system prompt");
    let user_text = provider_latest_user_text(&request.messages);
    let env = provider_volatile_appendix(&request.messages);
    assert!(!system_prompt.contains("\"presearchHints\""));
    assert!(!user_text.contains("\"presearchHints\""));
    assert!(!env.contains("\"presearchHints\""));
    assert!(!user_text.contains("/tools/browser/navigate"));
    assert!(!env.contains("/tools/browser/navigate"));
    let search = request
        .tools
        .iter()
        .find(|tool| {
            tool.pointer("/function/name").and_then(Value::as_str) == Some(TOOL_SEARCH_TOOL_NAME)
        })
        .expect("ToolSearch");
    assert!(
        search
            .pointer("/function/description")
            .and_then(Value::as_str)
            .is_some_and(|description| description.contains("browser_navigate"))
    );
    assert!(!user_text.contains("\"toolDiscoverySuppressed\": true"));
    assert!(!env.contains("\"toolDiscoverySuppressed\": true"));
}

#[test]
fn runtime_context_does_not_expose_tools_to_non_tool_calling_models() {
    let context = build_runtime_context(
        &json!({}),
        &[],
        &ModelCapabilityProfile {
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: false,
            supports_tool_choice: true,
            context_window: Some(8_192),
        },
    );
    assert_eq!(context["tools"], json!([]));
    assert_eq!(
        context
            .pointer("/capabilities/supportsToolCalling")
            .and_then(Value::as_bool),
        Some(false)
    );
}

#[test]
fn provider_visible_tool_schema_snapshot_is_curated_runtime_surface() {
    for tools in [model_tools()] {
        let names = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .map(str::to_string)
            .collect::<Vec<_>>();
        assert_eq!(names, expected_provider_tool_names());
        assert_eq!(
            names.first().map(String::as_str),
            Some(LYRA_CLARIFICATION_ASK_TOOL)
        );
        let clarification = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str)
                    == Some(LYRA_CLARIFICATION_ASK_TOOL)
            })
            .expect("clarification tool");
        let description = clarification
            .pointer("/function/description")
            .and_then(Value::as_str)
            .expect("clarification description");
        assert!(description.contains("decision panel"));
        assert!(description.contains("Plain assistant text questions are non-blocking"));
        assert!(
            clarification
                .pointer("/function/parameters/properties/question/description")
                .and_then(Value::as_str)
                .is_some_and(|description| description.contains("blocking decision panel"))
        );
        assert!(tools.iter().all(|tool| {
            tool.pointer("/function/name")
                .and_then(Value::as_str)
                .is_some_and(|name| {
                    name == TOOL_SEARCH_TOOL_NAME
                        || name == LYRA_CLARIFICATION_ASK_TOOL
                        || name == READ_FILE_MODEL_TOOL
                        || name == GLOB_MODEL_TOOL
                        || name == GREP_MODEL_TOOL
                        || name == EXEC_COMMAND_MODEL_TOOL
                        || name == WRITE_STDIN_MODEL_TOOL
                        || name == EDIT_FILE_MODEL_TOOL
                        || name == WRITE_FILE_MODEL_TOOL
                        || name == "apply_patch"
                        || name == LYRA_SESSION_READ_MESSAGE_TOOL
                        || name == PLAN_BEGIN_MODEL_TOOL
                        || name == PLAN_WRITE_MODEL_TOOL
                        || name == PLAN_FINALIZE_MODEL_TOOL
                        || name == PLAN_REVISE_MODEL_TOOL
                        || name == AGENT_SPAWN_MODEL_TOOL
                        || name == TODO_WRITE_MODEL_TOOL
                        || name == TODO_UPDATE_MODEL_TOOL
                        || name == TODO_FINISH_MODEL_TOOL
                        || name == "web_search"
                        || name == "web_fetch"
                        || name == "design_reference"
                        || name == "design_extract_reference"
                        || name == "design_quality"
                        || name == "browser_navigate"
                        || name == "browser_read"
                        || name == "browser_map"
                })
        }));
        assert!(!names.iter().any(|name| name == UPDATE_PLAN_MODEL_TOOL));
        let tool_search = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str)
                    == Some(TOOL_SEARCH_TOOL_NAME)
            })
            .expect("ToolSearch schema");
        let search_description = tool_search
            .pointer("/function/description")
            .and_then(Value::as_str)
            .expect("ToolSearch description");
        assert!(names.iter().any(|name| name == "web_fetch"));
        assert!(names.iter().any(|name| name == "web_search"));
        assert!(search_description.contains("browser_read"));
        assert!(!tools.iter().any(|tool| {
            tool.pointer("/function/name")
                .and_then(Value::as_str)
                .is_some_and(|name| {
                    matches!(
                        name,
                        "file_read"
                            | "shell_run"
                            | "terminal_read"
                            | "lyra_lumen_read"
                            | "software_invoke_capability"
                    )
                })
        }));
        let read_file = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str) == Some(READ_FILE_MODEL_TOOL)
            })
            .expect("read_file schema");
        assert!(
            read_file
                .pointer("/function/description")
                .and_then(Value::as_str)
                .is_some_and(|description| description.contains("rejects directories"))
        );
        assert!(
            read_file
                .pointer("/function/parameters/properties/endLine/description")
                .and_then(Value::as_str)
                .is_some_and(|description| description.contains("startLine"))
        );
        let plan_begin = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str)
                    == Some(PLAN_BEGIN_MODEL_TOOL)
            })
            .expect("plan_begin schema");
        assert!(
            plan_begin
                .pointer("/function/parameters/required")
                .and_then(Value::as_array)
                .is_some_and(|required| required.as_slice() == [json!("title")])
        );
        assert!(plan_begin.pointer("/function/parameters/allOf").is_none());
        let plan_finalize = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str)
                    == Some(PLAN_FINALIZE_MODEL_TOOL)
            })
            .expect("plan_finalize schema");
        assert!(
            plan_finalize
                .pointer("/function/parameters/required")
                .is_none()
        );
        assert!(
            plan_finalize
                .pointer("/function/parameters/properties/investigationEvidenceIds")
                .is_none()
        );
        let promoted = assemble_provider_tools(
            &json!({ "discoveredToolNames": ["todo_update"] }),
            None,
            Some(128_000),
        );
        let todo_update = promoted
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str)
                    == Some(TODO_UPDATE_MODEL_TOOL)
            })
            .expect("todo_update schema");
        assert!(
            todo_update
                .pointer("/function/parameters/required")
                .and_then(Value::as_array)
                .is_some_and(|required| { required.as_slice() == [json!("id"), json!("status")] })
        );
        assert!(todo_update.pointer("/function/parameters/allOf").is_none());
        assert!(
            todo_update
                .pointer("/function/parameters/properties/evidenceIds")
                .is_none()
        );
    }
}

#[test]
fn tool_filesystem_runtime_context_uses_dynamic_registry_without_expanding_provider_tools() {
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|method, _payload| {
        assert_eq!(method, "software.listCapabilities");
        Ok(serde_json::to_string(&json!({
            "software": [{
                "id": "notes",
                "title": "Notes",
                "actions": [{
                    "id": "open",
                    "title": "Open note",
                    "summary": "Open a note in the Notes adapter.",
                    "risk": "read",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "noteId": { "type": "string" }
                        },
                        "required": ["noteId"],
                        "additionalProperties": false
                    }
                }]
            }]
        }))
        .expect("json"))
    });
    let static_count = tools::tool_fs::runtime_registry()
        .root_summary_for_scene(lyra_tool_fs_core::ToolScene::Automation)["toolCount"]
        .as_u64()
        .expect("static tool count");
    let context = tool_filesystem_runtime_context("automation", None, Some(&dispatcher));
    assert_eq!(context["scene"].as_str(), Some("automation"));
    assert_eq!(context["internalRegistry"].as_bool(), Some(true));
    assert!(context.get("policy").is_none());
    let names = assemble_provider_tools(&json!({}), Some(&dispatcher), Some(128_000))
        .iter()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();
    assert_eq!(names, expected_provider_tool_names());
    assert!(
        context["rootSummary"]["toolCount"]
            .as_u64()
            .expect("dynamic tool count")
            > static_count
    );
    let sources = context["manifestSources"]
        .as_array()
        .expect("manifest source summary");
    for expected in [
        "core_builtin",
        "terminal_action_specs",
        "skill_registry",
        "mcp_current_state",
        "software_host_capabilities",
    ] {
        assert!(
            sources
                .iter()
                .any(|source| source["name"].as_str() == Some(expected)),
            "missing manifest source {expected}"
        );
    }
    assert!(sources.iter().any(|source| {
        source["name"].as_str() == Some("software_host_capabilities")
            && source["kind"].as_str() == Some("dynamic")
            && source["manifestCount"].as_u64().unwrap_or(0) == 1
    }));
}

#[test]
fn tool_filesystem_scene_uses_runtime_state_signals() {
    assert_eq!(
        infer_tool_filesystem_scene(Some("project-code"), None, &HashSet::new(), &json!({})),
        "project-code"
    );
    assert_eq!(
        infer_tool_filesystem_scene(
            None,
            None,
            &HashSet::new(),
            &json!({ "activeTab": { "kind": "terminal" } }),
        ),
        "terminal"
    );
    assert_eq!(
        infer_tool_filesystem_scene(
            None,
            None,
            &HashSet::new(),
            &json!({ "activeTab": { "kind": "browser" } }),
        ),
        "browser"
    );
    assert_eq!(
        infer_tool_filesystem_scene(
            None,
            None,
            &HashSet::new(),
            &json!({
                "activeTabId": "term-1",
                "tabs": [{
                    "tabId": "term-1",
                    "pageKind": "terminal",
                    "focusedPane": true
                }]
            }),
        ),
        "terminal"
    );
    assert_eq!(
        infer_tool_filesystem_scene(
            None,
            None,
            &HashSet::new(),
            &json!({
                "focusedTabId": "page-1",
                "tabs": [{
                    "id": "page-1",
                    "pageKind": "page",
                    "observationKind": "page",
                    "displayAddress": "https://example.com"
                }]
            }),
        ),
        "browser"
    );
    assert_eq!(
        infer_tool_filesystem_scene(
            None,
            None,
            &HashSet::new(),
            &json!({ "activeTab": { "kind": "software" } }),
        ),
        "automation"
    );
}
#[test]
fn model_tool_execution_records_workbench_activity() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Tool Test" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|method, _payload| {
        assert_eq!(method, "workbench.listTabs");
        Ok(serde_json::to_string(&json!({
            "activeTabId": "browser-tab-1",
            "tabs": [
                {
                    "tabId": "browser-tab-1",
                    "title": "Example",
                    "pageKind": "page",
                    "observationKind": "page",
                    "active": true,
                    "visible": true,
                    "focusedPane": true,
                    "observable": true,
                    "url": "https://example.com"
                }
            ]
        }))
        .expect("json"))
    });
    let turn_id = start_test_runtime_turn(&session_id);
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &Some(dispatcher),
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-test",
            "/tools/workbench/list_tabs",
            json!({ "scope": "all" }),
        ),
    );
    assert!(
        output["content"]
            .as_str()
            .unwrap()
            .contains("browser-tab-1")
    );
    let read = backend
        .call_agent_method("agent.session.read", json!({ "sessionId": session_id }))
        .expect("read session");
    assert_eq!(read["tools"][0]["name"], "workbench");
    assert_eq!(read["tools"][0]["status"], "completed");
}
#[test]
fn terminal_read_tool_fs_path_is_removed() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Terminal Tool Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let captured_payload = Arc::new(Mutex::new(None::<Value>));
    let captured_for_dispatch = captured_payload.clone();
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(move |method, payload| {
        assert_eq!(method, "terminal.read");
        let payload_value: Value = serde_json::from_str(&payload).expect("host payload json");
        *captured_for_dispatch.lock().expect("captured payload lock") = Some(payload_value);
        Ok(serde_json::to_string(&json!({
            "target": { "type": "private", "sessionId": "terminal-session-1" },
            "sessionId": "terminal-session-1",
            "cursor": "1",
            "output": "hello from terminal",
            "running": true,
            "exitCode": null,
            "truncated": false
        }))
        .expect("json"))
    });
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &Some(dispatcher),
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-terminal-read",
            "/tools/terminal/read",
            json!({ "sessionId": "terminal-session-1" }),
        ),
    );
    assert_eq!(
        output.pointer("/error/code").and_then(Value::as_str),
        Some("tool_not_found")
    );
    assert!(
        captured_payload
            .lock()
            .expect("captured payload lock")
            .is_none()
    );
}
#[test]
fn terminal_activity_summary_includes_full_output_path_for_projected_memory() {
    let summary = format_terminal_output(
        "read",
        &json!({
            "target": { "type": "private", "sessionId": "terminal-session-1" },
            "sessionId": "terminal-session-1",
            "cursor": "20000",
            "output": "projected output",
            "running": true,
            "exitCode": null,
            "truncated": true,
            "memory": {
                "outputTextPath": "/tmp/lyra/terminal-memory/sessions/terminal-session-1/outputs/session-output.txt",
                "truncatedByProjection": true
            }
        }),
    );
    assert!(summary.contains("private terminal terminal-session-1"));
    assert!(summary.contains(
        "fullOutputPath=/tmp/lyra/terminal-memory/sessions/terminal-session-1/outputs/session-output.txt"
    ));
    assert!(summary.contains("projected output"));
}

#[test]
fn terminal_activity_summary_includes_lifecycle_projection() {
    let summary = format_terminal_output(
        "wait",
        &json!({
            "target": { "type": "private", "sessionId": "terminal-session-1" },
            "sessionId": "terminal-session-1",
            "output": "",
            "running": true,
            "exitCode": null,
            "reason": "timeout",
            "lifecycle": {
                "sessionId": "terminal-session-1",
                "state": "waiting",
                "phase": "command_wait",
                "reason": "timeout",
                "terminalRunning": true,
                "commandId": "command-1",
                "commandStatus": "running",
                "exitCode": null,
                "waiting": true,
                "background": false
            }
        }),
    );

    assert!(summary.contains("lifecycle state=waiting phase=command_wait"));
    assert!(summary.contains("commandStatus=running"));
    assert!(summary.contains("commandId=command-1"));
}
#[test]
fn host_tool_ok_false_records_failed_activity() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Failed Tool Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|method, _payload| {
        assert_eq!(method, "lyraLumen.read");
        Ok(serde_json::to_string(&json!({
            "ok": false,
            "kind": "lyraLumenResult",
            "error": {
                "kind": "lyraLumenRuntimeError",
                "message": "frame script timed out after 8000ms"
            }
        }))
        .expect("json"))
    });
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &Some(dispatcher),
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-timeout",
            "/tools/browser/read",
            json!({ "tabId": "browser-tab-1" }),
        ),
    );
    assert_eq!(output["raw"]["ok"], false);
    let read = backend
        .call_agent_method("agent.session.read", json!({ "sessionId": session_id }))
        .expect("read session");
    assert_eq!(read["tools"][0]["name"], "lyra_lumen");
    assert_eq!(read["tools"][0]["status"], "failed");
}
#[test]
fn host_tool_timeout_finishes_activity() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Host Timeout Tool Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    // Seed a fresh token-estimate stamp and warm the session store: the first
    // touch_session re-tokenizes the whole conversation, the first dialog-row
    // save lazy-loads the BPE ranks, and the first session save creates the
    // session SQLite file — together these exceed this test's 1s budget in
    // debug builds. The timeout boundary is under test.
    {
        let _ = crate::native_backend::token_estimate::estimate_tokens("warm");
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["tokenEstimate"] = json!(1);
        session.snapshot["tokenEstimateAtMs"] = json!(Utc::now().timestamp_millis());
        let _ = state.save_state_sync();
    }
    let turn_id = start_test_runtime_turn(&session_id);
    let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|_method, _payload| {
        std::thread::sleep(Duration::from_millis(2_000));
        Ok(serde_json::to_string(&json!({ "ok": true })).expect("json"))
    });
    let started = Instant::now();
    let output = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &Some(dispatcher),
        &CancellationToken::new(),
        tool_fs_run_call(
            "tool-timeout-hard-boundary",
            "/tools/workbench/list_tabs",
            json!({ "timeoutMs": 250 }),
        ),
    );
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(
        output["content"]
            .as_str()
            .unwrap_or_default()
            .contains("timed out")
    );
    assert_eq!(output["status"].as_str(), Some("failed"));
    assert_eq!(output["notRunReason"].as_str(), Some("timeout"));
    assert_eq!(
        output.pointer("/error/code").and_then(Value::as_str),
        Some("timeout")
    );
    assert!(
        output["changes"]
            .as_array()
            .is_none_or(|changes| changes.is_empty())
    );
    let read = backend
        .call_agent_method("agent.session.read", json!({ "sessionId": session_id }))
        .expect("read session");
    assert_eq!(read["tools"][0]["name"], "workbench");
    assert_eq!(read["tools"][0]["status"], "failed");
    assert!(read["tools"][0]["finishedAt"].is_string());
}
