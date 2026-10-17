use super::*;

/// All session + config data extracted from the global state lock in one pass.
/// Destructured by `build_model_request` so the rest of the function stays lock-free.
struct SessionContextData {
    root: PathBuf,
    provider: NativeProviderProfile,
    model: String,
    session_snapshot: Value,
    session_messages: Vec<Value>,
    session_tools: Vec<Value>,
    host_dispatcher: Option<Arc<HostCapabilityDispatcher>>,
    working_dir: Option<String>,
    session_kind: Option<String>,
    active_turn_id: Option<String>,
    active_user_message_id: Option<String>,
    pinned_context_prompt: String,
    previous_runtime_contract: Option<Value>,
    previous_prompt_hash: Option<String>,
    previous_context_trimmed: bool,
    configured_prompt_delivery_mode: Option<String>,
    configured_stateful_prompt_contract: bool,
    protocol_log: Vec<Value>,
    session_created_at: String,
    turn_count: u64,
}

fn assemble_session_context(session_id: &str) -> AgentRuntimeResult<SessionContextData> {
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let provider_id = state
        .config
        .default_provider
        .clone()
        .unwrap_or_else(|| "openai".to_string());
    let provider = state
        .config
        .providers
        .get(&provider_id)
        .cloned()
        .ok_or_else(|| {
            AgentRuntimeError::Core(format!("provider not configured: {provider_id}"))
        })?;
    let model = provider
        .default_model
        .clone()
        .or_else(|| state.config.default_model.clone())
        .unwrap_or_else(|| "gpt-5-mini".to_string());
    let (
        session_snapshot,
        session_messages,
        session_tools,
        working_dir,
        session_kind,
        previous_runtime_contract,
        previous_prompt_hash,
        previous_context_trimmed,
        protocol_log,
        session_created_at,
        turn_count,
    ) = {
        let session = state
            .sessions
            .get(session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        let session_snapshot = session.snapshot.clone();
        let session_messages = session
            .snapshot
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        // Provider failures are timeline diagnostics, not assistant replies.
        // Remove them before deriving *any* request state (memory selection,
        // cache fingerprints, or model context). This also repairs existing
        // sessions that persisted errors before the diagnostic marker existed.
        let session_messages = session_messages
            .into_iter()
            .filter(|message| !crate::context_builder::excludes_provider_context(message))
            .collect::<Vec<_>>();
        let session_tools = session
            .snapshot
            .get("tools")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let working_dir = session
            .snapshot
            .get("workingDir")
            .and_then(Value::as_str)
            .map(str::to_string);
        let session_kind = session
            .snapshot
            .get("sessionKind")
            .and_then(Value::as_str)
            .map(str::to_string);
        let previous_runtime_contract = session.snapshot.get("promptRuntimeContract").cloned();
        let previous_prompt_hash = session
            .snapshot
            .get("promptDelivery")
            .and_then(|delivery| {
                delivery
                    .get("stableBaseHash")
                    .or_else(|| delivery.get("stablePromptHash"))
            })
            .and_then(Value::as_str)
            .map(str::to_string);
        let previous_context_trimmed = session
            .snapshot
            .get("promptDelivery")
            .and_then(|delivery| delivery.get("contextTrimmed"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        (
            session_snapshot,
            session_messages,
            session_tools,
            working_dir,
            session_kind,
            previous_runtime_contract,
            previous_prompt_hash,
            previous_context_trimmed,
            session.provider_protocol_log.clone(),
            session.created_at.clone(),
            session.runtime_turns.len() as u64,
        )
    };
    let active_turn_id = state
        .sessions
        .get(session_id)
        .and_then(|session| session.snapshot.get("activeTurnId"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let runtime_user_message_id = active_turn_id.as_deref().and_then(|turn_id| {
        state
            .sessions
            .get(session_id)?
            .runtime_turns
            .iter()
            .rev()
            .find(|turn| turn.get("runtimeTurnId").and_then(Value::as_str) == Some(turn_id))
            .and_then(|turn| turn.get("userMessageId"))
            .and_then(Value::as_str)
            .map(str::to_string)
    });
    let active_user_message_id =
        active_user_message_id_for_messages(&session_messages, runtime_user_message_id);
    let pinned_context_prompt = state
        .sessions
        .get(session_id)
        .map(|session| {
            let clarification = active_clarification_projection(&state, session_id);
            let items = pinned_context::collect_pinned_items(session, clarification.as_ref());
            pinned_context::pinned_context_prompt(&items)
        })
        .unwrap_or_default();
    Ok(SessionContextData {
        root: state.root.clone(),
        provider,
        model,
        session_snapshot,
        session_messages,
        session_tools,
        host_dispatcher: host_dispatcher(),
        working_dir,
        session_kind,
        active_turn_id,
        active_user_message_id,
        pinned_context_prompt,
        previous_runtime_contract,
        previous_prompt_hash,
        previous_context_trimmed,
        configured_prompt_delivery_mode: state.config.prompt_delivery_mode.clone(),
        configured_stateful_prompt_contract: state.config.openai_responses_stateful_prompt_contract,
        protocol_log,
        session_created_at,
        turn_count,
    })
}

fn active_user_message_id_for_messages(
    messages: &[Value],
    runtime_user_message_id: Option<String>,
) -> Option<String> {
    runtime_user_message_id
        .filter(|message_id| {
            messages.iter().any(|message| {
                message.get("role").and_then(Value::as_str) == Some("user")
                    && message.get("id").and_then(Value::as_str) == Some(message_id)
            })
        })
        .or_else(|| {
            messages.iter().rev().find_map(|message| {
                (message.get("role").and_then(Value::as_str) == Some("user"))
                    .then(|| {
                        message
                            .get("id")
                            .and_then(Value::as_str)
                            .map(str::to_string)
                    })
                    .flatten()
            })
        })
}

/// build_model_request 是同步重 I/O（sqlite + FFI），
/// 直接在 turn_engine 的 tokio runtime 上调用会触发
/// 嵌套 block_on panic（"Cannot start a runtime from within a runtime"）。
/// 用 spawn_blocking 让它跑在阻塞线程池。
pub(crate) async fn build_model_request_async(
    session_id: String,
) -> AgentRuntimeResult<ModelRequest> {
    match tokio::task::spawn_blocking(move || build_model_request(&session_id)).await {
        Ok(result) => result,
        Err(join_err) => Err(AgentRuntimeError::Core(format!(
            "build_model_request worker panicked: {join_err}"
        ))),
    }
}

fn append_turn_context_section(target: &mut String, title: &str, content: &str) {
    if content.trim().is_empty() {
        return;
    }
    if !target.trim().is_empty() {
        target.push_str("\n\n");
    }
    target.push_str(title);
    target.push_str(":\n");
    target.push_str(content.trim());
}

pub(super) fn provider_history_fingerprint(messages: &[Value]) -> String {
    let projected = messages
        .iter()
        .map(|message| {
            json!({
                "role": message.get("role").cloned().unwrap_or(Value::Null),
                "text": message.get("text").cloned().unwrap_or(Value::Null),
                "blocks": message.get("blocks").cloned().unwrap_or(Value::Null),
                "transcriptCitations": message.pointer("/metadata/transcriptCitations").cloned().unwrap_or(Value::Null),
                "pageCitations": message.pointer("/metadata/pageCitations").cloned().unwrap_or(Value::Null),
                "fileAttachments": message.pointer("/metadata/fileAttachments").cloned().unwrap_or(Value::Null),
                "inlineImages": message.pointer("/metadata/inlineImages").cloned().unwrap_or(Value::Null),
                "metadataKind": message.pointer("/metadata/kind").cloned().unwrap_or(Value::Null),
            })
        })
        .collect::<Vec<_>>();
    let bytes = serde_json::to_vec(&projected).unwrap_or_default();
    format!("{:x}", Sha256::digest(bytes))
}

fn context_epoch(
    provider: &NativeProviderProfile,
    model: &str,
    stable_prompt_hash: &str,
    tools: &[Value],
    contract: &Value,
) -> String {
    let bytes = serde_json::to_vec(&json!({
        "providerId": provider.id,
        "routeId": provider.route_id,
        "model": model,
        "stablePromptHash": stable_prompt_hash,
        "tools": tools,
        "contract": contract,
    }))
    .unwrap_or_default();
    format!("{:x}", Sha256::digest(bytes))
}

fn prompt_cache_key(provider: &NativeProviderProfile, model: &str, epoch: &str) -> String {
    let digest = Sha256::digest(
        format!("{}\0{}\0{model}\0{epoch}", provider.id, provider.route_id).as_bytes(),
    );
    format!("lyra:{digest:x}").chars().take(53).collect()
}

fn matching_openai_response_id(
    history: &[Value],
    provider: &NativeProviderProfile,
    model: &str,
    epoch: &str,
    history_fingerprint: &str,
) -> Option<String> {
    history.iter().rev().find_map(|message| {
        if message.get("role").and_then(Value::as_str) != Some("assistant") {
            return None;
        }
        let state = message.pointer("/metadata/openaiResponsesState")?;
        (state.get("providerId").and_then(Value::as_str) == Some(provider.id.as_str())
            && state.get("routeId").and_then(Value::as_str) == Some(provider.route_id.as_str())
            && state.get("model").and_then(Value::as_str) == Some(model)
            && state.get("contextEpoch").and_then(Value::as_str) == Some(epoch)
            && state
                .get("providerContextFingerprint")
                .and_then(Value::as_str)
                == Some(history_fingerprint))
        .then(|| {
            state
                .get("responseId")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .flatten()
    })
}

fn bedrock_prompt_cache_supported(model: &str) -> bool {
    let model = model.to_ascii_lowercase();
    model.contains("anthropic.claude")
        && [
            "claude-opus-4",
            "claude-sonnet-4",
            "claude-haiku-4",
            "claude-3-7-sonnet",
            "claude-3-5-sonnet-20241022",
        ]
        .iter()
        .any(|family| model.contains(family))
}

pub(crate) fn build_model_request(session_id: &str) -> AgentRuntimeResult<ModelRequest> {
    let SessionContextData {
        root,
        provider,
        model,
        session_snapshot,
        session_messages,
        session_tools,
        host_dispatcher,
        working_dir,
        session_kind,
        active_turn_id,
        active_user_message_id,
        pinned_context_prompt,
        previous_runtime_contract,
        previous_prompt_hash,
        previous_context_trimmed,
        configured_prompt_delivery_mode,
        configured_stateful_prompt_contract,
        protocol_log,
        session_created_at,
        turn_count,
    } = assemble_session_context(session_id)?;
    let active_skills =
        skill_catalog::effective_skills(projects::snapshot_root(&session_snapshot))?
            .into_iter()
            .map(|skill| skill.id)
            .collect::<HashSet<_>>();
    let provider = providers::transport::auth::provider_with_resolved_api_key(
        provider,
        host_dispatcher.as_ref(),
    )?;
    let prompt_delivery_mode =
        prompt_policy::PromptDeliveryMode::resolve(configured_prompt_delivery_mode.as_deref());
    let latest_user = latest_user_text(&session_messages);
    let selected_ranked_memory = select_ranked_long_term_memory_for_injection(
        &root,
        &latest_user,
        working_dir.as_deref(),
        SHARED_MEMORY_INJECTION_LIMIT,
    )?;
    let memory_query = [Some(latest_user.clone()), working_dir.clone()]
        .into_iter()
        .flatten()
        .filter(|value| !value.trim().is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let memory_injection_explanation = record_memory_injection(
        &root,
        session_id,
        active_turn_id.as_deref(),
        (!memory_query.trim().is_empty()).then_some(memory_query.as_str()),
        &selected_ranked_memory,
    )
    .unwrap_or_else(|_| json!({ "selected": [] }));
    let memory_records = selected_ranked_memory.clone();
    let system_recall_records = select_system_recall_for_injection(
        &root,
        Some(session_id),
        &latest_user,
        working_dir.as_deref(),
        &session_messages,
    )
    .unwrap_or_default();
    let capabilities = model_capabilities(&provider, &model);
    let retention_signals = crate::retention_policy::retention_signals_from_session_messages(
        &session_messages,
        session_tools.len(),
        capabilities.context_window,
    );
    let previous_tool_telemetry = previous_turn_tool_telemetry(&session_tools, &session_messages);
    let recent_tool_failure_count = previous_tool_telemetry.recent_failure_count;
    debug_assert_eq!(
        recent_tool_failure_count,
        estimate_previous_turn_failed_tool_count(&session_tools, &session_messages)
    );
    let mut session_messages = session_messages;
    let mut provider_context_trimmed = false;
    {
        let state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        if let Some(session) = state.sessions.get(session_id) {
            let active_clarification = active_clarification_projection(&state, session_id);
            let trim_config = crate::retention_policy::trim_controller_config_from_policy(
                crate::retention_policy::retention_policy_from_messages(
                    &session_messages,
                    &retention_signals,
                ),
            );
            if let Some(plan) = context_window::build_context_window_plan(
                session,
                &trim_config,
                active_clarification.as_ref(),
            ) {
                let (filtered, dropped) =
                    context_window::filter_messages_by_window_plan(&session_messages, &plan);
                if dropped > 0 {
                    session_messages = filtered;
                    provider_context_trimmed = true;
                }
            }
        }
    }
    let route = providers::registry::require_route(&provider.route_id)?;
    let effective_protocol_id = providers::routes::opencode::effective_protocol_id(
        &provider.route_id,
        providers::wire_protocol::api_npm_for(&provider, &model).as_deref(),
    )
    .unwrap_or(route.protocol_id.as_str());
    let host_context = context::read_turn_host_context(host_dispatcher.as_ref());
    tools::tool_fs::update_software_catalog(host_dispatcher.as_ref(), &host_context["software"]);
    tools::tool_search::persist_discovered_snapshot(session_id, host_dispatcher.as_ref());
    let workbench = host_context
        .get("workbench")
        .cloned()
        .unwrap_or_else(|| json!({}));
    let mut session_snapshot = session_snapshot;
    let office_tools = tools::tool_search::office_turn_signal(&session_snapshot, Some(&workbench));
    session_snapshot[tools::tool_search::EPHEMERAL_OFFICE_TOOLS_KEY] = json!(office_tools);
    tools::tool_search::set_ephemeral_office_tools(session_id, office_tools);
    let tools = if capabilities.supports_tool_calling {
        let mut tools = tools::tool_search::assemble_provider_tools(
            &session_snapshot,
            host_dispatcher.as_ref(),
            capabilities.context_window,
        );
        if let Some(pos) = tools.iter().position(|tool| {
            tool.pointer("/function/name").and_then(Value::as_str) == Some(AGENT_SPAWN_MODEL_TOOL)
        }) {
            tools[pos] = agent_spawn_model_tool(working_dir.as_deref());
        } else {
            tools.push(agent_spawn_model_tool(working_dir.as_deref()));
        }
        filter_tools_for_session(&session_snapshot, tools)
    } else {
        Vec::new()
    };
    let memory_record_summaries = memory_records
        .iter()
        .map(|ranked| ranked.record.clone())
        .collect::<Vec<_>>();
    let mut runtime_context = crate::native_backend::context::build_runtime_context(
        &host_context,
        &memory_record_summaries,
        &capabilities,
    );
    let capability_record = state().lock().ok().and_then(|state| {
        state
            .model_capabilities
            .get(&provider.id)
            .and_then(|records| records.get(&model))
            .cloned()
    });
    let executable_capability = |key: &str, fallback: bool| {
        providers::model_capabilities::effective_capability_for_model(
            capability_record.as_ref(),
            effective_protocol_id,
            &provider.route_id,
            &model,
            key,
            fallback,
        )
    };
    let supports_audio_input =
        executable_capability(providers::model_capabilities::INPUT_AUDIO, false);
    let supports_video_input =
        executable_capability(providers::model_capabilities::INPUT_VIDEO, false);
    let supports_pdf_input = executable_capability(providers::model_capabilities::INPUT_PDF, false);
    runtime_context["capabilities"]["supportsAudioInput"] = json!(supports_audio_input);
    runtime_context["capabilities"]["supportsVideoInput"] = json!(supports_video_input);
    runtime_context["capabilities"]["supportsPdfInput"] = json!(supports_pdf_input);
    runtime_context["capabilityOperatingContract"] = json!(capability_operating_contract(
        capabilities.supports_tool_calling,
        capabilities.supports_image_input,
        supports_audio_input,
        supports_video_input,
        supports_pdf_input,
    ));
    let stateful_prompt_contract_enabled = route.supports_stateful_prompt_contract
        && openai_responses_stateful_prompt_contract_enabled(configured_stateful_prompt_contract);
    runtime_context["providerStatefulPrompt"] = json!({
        "routeSupportsStatefulPromptContract": route.supports_stateful_prompt_contract,
        "enabled": stateful_prompt_contract_enabled,
        "defaultEnabled": false,
        "billingNote": "Provider stateful prompt inheritance is experimental and does not guarantee lower billed input tokens; Lyra's default token saving path is sending less stable prompt text in lean mode."
    });
    runtime_context["interactionContract"] = interaction_contract_runtime_context();
    let project_bound = session_snapshot
        .get("projectBound")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let working_dir_is_home = session_snapshot
        .get("workingDirIsHome")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if let Some(workspace_problems) = tools::workspace_problems_runtime_value(
        working_dir.as_deref(),
        project_bound,
        working_dir_is_home,
    ) {
        runtime_context["workspaceProblems"] = workspace_problems;
    }
    if let Some(working_dir) = working_dir
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        runtime_context["workingDir"] = json!(working_dir);
        runtime_context["gitRepo"] = json!(working_dir_is_git_repo(Some(working_dir)));
    }
    let latest_user_message = session_messages
        .iter()
        .rev()
        .find(|message| message.get("role").and_then(Value::as_str) == Some("user"));
    runtime_context["inputSignals"] = json!({
        "hasCitation": latest_user_message.is_some_and(|message| {
            message
                .get("metadata")
                .is_some_and(|metadata| {
                    metadata.get("transcriptCitations").is_some()
                        || metadata.get("pageCitations").is_some()
                        || metadata.get("fileCitations").is_some()
                })
        }),
        "hasImage": latest_user_message.is_some_and(|message| {
            message
                .get("blocks")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
                .any(|block| block.get("type").and_then(Value::as_str) == Some("image"))
        }),
    });
    runtime_context["promptRecoverySignals"] = json!({
        "recentToolFailureCount": recent_tool_failure_count,
        "recentToolMismatchCount": previous_tool_telemetry.recent_mismatch_count,
        "consecutiveToolFailureCount": previous_tool_telemetry.consecutive_failure_count,
        "recentToolPaths": previous_tool_telemetry.recent_tool_paths.clone(),
        "recentToolDomains": previous_tool_telemetry.recent_tool_domains.clone(),
        "recentFailedToolDomains": previous_tool_telemetry.recent_failed_tool_domains.clone(),
        "recentSceneModules": previous_tool_telemetry.recent_scene_modules.clone(),
        "recentFailedSceneModules": previous_tool_telemetry.recent_failed_scene_modules.clone(),
        "consecutiveFailedToolDomains": previous_tool_telemetry.consecutive_failed_tool_domains.clone(),
        "userCorrectionDetected": false,
        "effect": "Lean prompt delivery upgrades to a full refresh on failure/mismatch signals and keeps recent scene modules active after relevant tool use."
    });
    let tool_scene = infer_tool_filesystem_scene(
        session_kind.as_deref(),
        working_dir.as_deref(),
        &active_skills,
        &runtime_context["workbench"],
    );
    runtime_context["scene"] = json!(tool_scene);
    runtime_context["memoryLayers"] = json!({
        "workingMemory": {
            "activeTurn": true,
        },
        "sessionMemory": {
            "messageCount": session_messages.len(),
            "toolCount": session_tools.len(),
        },
        "longTermMemory": {
            "selectedCount": memory_records.len(),
            "records": memory_record_summaries
                .iter()
                .map(memory_summary_json)
                .collect::<Vec<_>>(),
            "injection": memory_injection_explanation,
        },
        "systemRecall": system_recall_json(&system_recall_records)
    });
    runtime_context["activeSkills"] =
        active_skill_context_for_project(projects::snapshot_root(&session_snapshot));
    runtime_context["tools"] = json!(if capabilities.supports_tool_calling {
        tools
            .iter()
            .filter_map(|tool| {
                tool.pointer("/function/name")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    });
    // Spatiotemporal awareness: inject session time + workspace layout so the
    // agent has a coherent sense of "how long I've been here" and "what's on
    // screen right now". Session age is derived from the session's created_at
    // timestamp; workspace layout comes from the host capability.
    {
        let now_ms = chrono::Utc::now().timestamp_millis();
        let session_age_seconds =
            (now_ms - super::helpers::iso_ms(&session_created_at)).max(0) as u64 / 1000;
        let seconds_since_last_interaction = session_messages
            .iter()
            .rev()
            .find(|m| m.get("role").and_then(Value::as_str) == Some("user"))
            .and_then(|m| m.get("createdAt").and_then(Value::as_str))
            .map(|t| (now_ms - super::helpers::iso_ms(t)).max(0) as u64 / 1000)
            .unwrap_or(0);
        let workspace = host_context
            .get("workspace")
            .cloned()
            .unwrap_or_else(|| json!({}));
        runtime_context["spatiotemporal"] = json!({
            "session": {
                "startedAt": session_created_at,
                "ageSeconds": session_age_seconds,
                "turnCount": turn_count,
                "secondsSinceLastInteraction": seconds_since_last_interaction,
            },
            "workspace": workspace,
        });
    }
    let persona_context = prompt_policy::persona_context_from_value(&host_context["persona"]);
    // Identity inference reads OS/Git/SSH/package-manager/editor signals and can
    // reach the selected model through the prompt. Fail closed unless the
    // Desktop host confirms the user's current explicit consent.
    let computed_persona = computed_persona_for_turn(
        host_context
            .get("personaSignalsAllowed")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    );
    let first_used_at = state().lock().ok().and_then(|s| s.first_used_at.clone());
    let project_root = projects::snapshot_root(&session_snapshot);
    let prompt_report = build_system_prompt_report(
        &runtime_context,
        &persona_context,
        &active_skill_prompt_for_project(project_root),
        &project_instructions::project_instructions_prompt(project_root),
        &combined_memory_prompt(
            &memory_records,
            &system_recall_records,
            &pinned_context_prompt,
        ),
        previous_runtime_contract,
        previous_prompt_hash,
        provider_context_trimmed || previous_context_trimmed,
        recent_tool_failure_count,
        previous_tool_telemetry.recent_mismatch_count,
        previous_tool_telemetry.consecutive_failure_count,
        false,
        Some(prompt_delivery_mode),
        computed_persona,
        first_used_at.as_deref(),
    );
    let mut stable_system_prompt = prompt_report.stable_prefix_prompt.clone();
    if let Some(prefix) = subagent_system_prefix(&session_snapshot) {
        append_turn_context_section(
            &mut stable_system_prompt,
            "Worker runtime instructions",
            &prefix,
        );
    }
    let capability_signature =
        serde_json::to_string(runtime_context.get("capabilities").unwrap_or(&Value::Null))
            .unwrap_or_default();
    let stable_prompt_hash = format!(
        "{:x}",
        Sha256::digest(format!("{stable_system_prompt}\n{capability_signature}").as_bytes())
    );
    let last_turn_tool_count = estimate_previous_turn_tool_count(&session_tools, &session_messages);
    let mut provider_context_options = ProviderContextOptions {
        supports_image_input: capabilities.supports_image_input,
        supports_audio_input,
        supports_video_input,
        supports_pdf_input,
        context_window: capabilities.context_window,
        max_tool_output_chars: 24_000,
        session_tool_count: session_tools.len(),
        last_turn_tool_count,
        protocol_log,
        provider_id: Some(provider.id.clone()),
        route_id: Some(provider.route_id.clone()),
        protocol_id: Some(effective_protocol_id.to_string()),
        model: Some(model.clone()),
        halve_tool_output_message_ids: HashSet::new(),
        volatile_appendix: None,
    };
    let active_user_message_id = active_user_message_id.as_deref();
    let mut rendered_tail = prompt_report.turn_tail_prompt.clone();
    {
        let mut preview_options = provider_context_options.clone();
        preview_options.volatile_appendix =
            Some(rendered_tail.clone()).filter(|text| !text.trim().is_empty());
        let preview = ContextBuilder::default().build_provider_context(
            stable_system_prompt.clone(),
            session_messages.clone(),
            preview_options,
        );
        if !preview.input_downgrades.is_empty() {
            append_turn_context_section(
                &mut rendered_tail,
                "Structured input downgrade report",
                &format!(
                    "{}\nThis input was dropped before reaching U, not lost for good. Judge whether it is worth recovering through Lyra instead of silently skipping it.",
                    serde_json::to_string(&preview.input_downgrades)
                        .unwrap_or_else(|_| "[]".to_string())
                ),
            );
        }
    }
    provider_context_options.volatile_appendix =
        Some(rendered_tail).filter(|text| !text.trim().is_empty());
    let context = ContextBuilder::default().build_provider_context(
        stable_system_prompt,
        session_messages.clone(),
        provider_context_options,
    );
    let request_context_trimmed = provider_context_trimmed || context.trimmed;
    let contract_value =
        serde_json::to_value(&prompt_report.contract).unwrap_or_else(|_| json!({}));
    let context_epoch = context_epoch(
        &provider,
        &model,
        &stable_prompt_hash,
        &tools,
        &contract_value,
    );
    {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        if let Some(session) = state.sessions.get_mut(session_id) {
            session.snapshot["promptRuntimeContract"] = contract_value.clone();
            session.snapshot["promptDelivery"] = json!({
                "promptMode": prompt_report.prompt_mode,
                "refreshReason": prompt_report.refresh_reason,
                "stablePromptHash": stable_prompt_hash,
                "stableBaseHash": prompt_report.stable_base_hash,
                "contextEpoch": context_epoch,
                "estimatedPromptTokens": prompt_report.estimated_prompt_tokens,
                "estimatedSavedTokens": prompt_report.estimated_saved_tokens,
                "omittedStableTokens": prompt_report.omitted_stable_tokens,
                "prefixCacheEligibleTokens": prompt_report.prefix_cache_eligible_tokens,
                "sceneModules": prompt_report.scene_modules,
                "missedModuleRecovery": prompt_report.missed_module_recovery,
                "sectionHashes": prompt_report.section_hashes,
                "contextTrimmed": request_context_trimmed,
            });
            touch_session(session);
            state.save_state()?;
        }
    }
    if let Some(overflow) = context.overflow.clone() {
        return Err(AgentRuntimeError::Core(format!(
            "context_overflow: {}",
            serde_json::to_string(&overflow).unwrap_or_else(|_| "{}".to_string())
        )));
    }
    let mut messages = context.messages;
    let active_user_index = session_messages
        .iter()
        .rposition(|message| {
            message.get("role").and_then(Value::as_str) == Some("user")
                && active_user_message_id
                    .is_none_or(|id| message.get("id").and_then(Value::as_str) == Some(id))
        })
        .unwrap_or(session_messages.len());
    let history_fingerprint = provider_history_fingerprint(&session_messages[..active_user_index]);
    let stateful_eligible = stateful_prompt_contract_enabled
        && provider.route_id == providers::routes::openai::ROUTE_ID
        && !request_context_trimmed
        && !previous_context_trimmed;
    let previous_response_id = stateful_eligible
        .then(|| {
            matching_openai_response_id(
                &session_messages[..active_user_index],
                &provider,
                &model,
                &context_epoch,
                &history_fingerprint,
            )
            .or_else(|| {
                env::var("LYRA_OPENAI_RESPONSES_PREVIOUS_RESPONSE_ID")
                    .ok()
                    .filter(|value| !value.trim().is_empty())
            })
        })
        .flatten();
    let current_provider_user_index = messages.iter().rposition(|message| {
        message.get("lyraCacheBoundary").and_then(Value::as_str) == Some("turnTail")
    });
    if let Some(first) = messages.first_mut() {
        first["lyraRequestContext"] = json!({
            "sessionId": session_id,
            "providerId": provider.id,
            "routeId": provider.route_id,
            "model": model,
            "contextEpoch": context_epoch,
            "promptCacheKey": prompt_cache_key(&provider, &model, &context_epoch),
            "promptCacheEnabled": true,
            "openaiExplicitPromptCache": provider.route_id == providers::routes::openai::ROUTE_ID
                && model.to_ascii_lowercase().starts_with("gpt-5.6"),
            "anthropicPromptCache": provider.route_id == providers::routes::anthropic::ROUTE_ID,
            "bedrockPromptCache": provider.route_id == providers::routes::aws_bedrock::ROUTE_ID
                && bedrock_prompt_cache_supported(&model),
            "stateful": {
                "enabled": stateful_eligible,
                "store": stateful_eligible,
                "previousResponseId": previous_response_id.clone(),
                "inputStart": previous_response_id
                    .as_ref()
                    .and(current_provider_user_index)
                    .unwrap_or(0),
            }
        });
    }
    Ok(ModelRequest {
        provider,
        model,
        messages,
        // Empty tool lists must not carry a tool_choice field: several
        // OpenAI-compatible providers 400 on `tool_choice` without `tools`.
        tool_choice: if tools.is_empty() {
            ModelToolChoice::None
        } else {
            ModelToolChoice::Auto
        },
        tools,
        host_dispatcher,
        capabilities,
        input_downgrades: context.input_downgrades,
        evidence_refs: context.evidence_refs,
        token_estimate: context.token_estimate,
        context_trimmed: provider_context_trimmed || context.trimmed,
    })
}

fn capability_operating_contract(
    supports_tools: bool,
    supports_images: bool,
    supports_audio: bool,
    supports_video: bool,
    supports_pdf: bool,
) -> String {
    let mut contract = vec![
        "Capability operating contract (follow this as an operational reality; never claim unavailable perception or action):".to_string(),
    ];
    if !supports_tools {
        contract.push(
            "- You cannot call tools or perform external actions in this turn. Work only with supplied text and supported attachments; never claim that an external action was executed."
                .to_string(),
        );
    }
    if !supports_images {
        contract.push(if supports_tools {
            "- You cannot directly inspect pixels. Work as someone operating without direct sight: prefer semantic page maps, accessibility trees, OCR, document extraction, and textual evidence; do not choose screenshot-only paths. You may use an exposed image-generation tool, but cannot visually verify its result yourself."
                .to_string()
        } else {
            "- You cannot directly inspect pixels and have no tools to derive visual evidence. Ask for a textual description when it is necessary and never claim to have seen an image."
                .to_string()
        });
    } else if !supports_tools {
        contract.push(
            "- You may inspect attached images, but you cannot act on external software or call tools."
                .to_string(),
        );
    }
    if !supports_audio {
        contract.push(
            "- You cannot directly hear audio. Use an available transcription tool when one is explicitly exposed; otherwise request a transcript or description."
                .to_string(),
        );
    }
    if !supports_video {
        contract.push(
            "- You cannot directly inspect video. Use exposed frame extraction or transcription paths; otherwise request a textual account of the relevant moments."
                .to_string(),
        );
    }
    if !supports_pdf {
        contract.push(
            "- You cannot directly read PDF bytes. Use exposed document extraction and cite the extracted text; otherwise ask for the relevant text."
                .to_string(),
        );
    }
    contract.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn active_user_message_falls_back_to_the_latest_user_message() {
        let messages = vec![
            json!({ "id": "channel-user-1", "role": "user", "text": "first" }),
            json!({ "id": "channel-assistant-1", "role": "assistant", "text": "answer" }),
            json!({ "id": "channel-user-2", "role": "user", "text": "second" }),
        ];

        assert_eq!(
            active_user_message_id_for_messages(&messages, Some("parent-channel-user".to_string()))
                .as_deref(),
            Some("channel-user-2")
        );
        assert_eq!(
            active_user_message_id_for_messages(&messages, Some("channel-user-1".to_string()))
                .as_deref(),
            Some("channel-user-1")
        );
    }

    #[test]
    fn prompt_cache_key_is_shared_by_sessions_with_the_same_exact_prefix() {
        let provider = NativeProviderProfile {
            id: "openai".to_string(),
            label: "OpenAI".to_string(),
            route_id: "openai".to_string(),
            base_url: None,
            default_model: None,
            api_key: None,
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        };

        assert_eq!(
            prompt_cache_key(&provider, "gpt-5.6", "same-context-epoch"),
            prompt_cache_key(&provider, "gpt-5.6", "same-context-epoch")
        );
        assert_ne!(
            prompt_cache_key(&provider, "gpt-5.6", "same-context-epoch"),
            prompt_cache_key(&provider, "gpt-5.6", "changed-context-epoch")
        );
    }

    #[test]
    fn every_tool_and_input_modality_combination_has_a_consistent_contract() {
        let mut observed = 0;
        for mask in 0_u8..32 {
            let tools = mask & 1 != 0;
            let images = mask & 2 != 0;
            let audio = mask & 4 != 0;
            let video = mask & 8 != 0;
            let pdf = mask & 16 != 0;
            let contract = capability_operating_contract(tools, images, audio, video, pdf);
            observed += 1;
            assert!(contract.starts_with("Capability operating contract"));
            assert_eq!(contract.contains("cannot call tools"), !tools);
            assert_eq!(contract.contains("cannot directly hear audio"), !audio);
            assert_eq!(contract.contains("cannot directly inspect video"), !video);
            assert_eq!(contract.contains("cannot directly read PDF bytes"), !pdf);
            if images {
                assert!(!contract.contains("cannot directly inspect pixels"));
            } else {
                assert!(contract.contains("cannot directly inspect pixels"));
            }
            assert!(!contract.contains("You are blind"));
            assert!(!contract.contains("You are deaf"));
        }
        assert_eq!(observed, 32);
    }
}
