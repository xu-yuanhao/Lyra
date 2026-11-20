use super::*;

pub(crate) fn read_config() -> AgentRuntimeResult<Value> {
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    Ok(json!({
        "agentHome": state.root.display().to_string(),
        "configPath": state.root.join("state.json").display().to_string(),
        "config": config_json(&state.config),
        "commands": registered_commands(),
    }))
}

pub(crate) fn update_config(payload: Value) -> AgentRuntimeResult<Value> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    if let Some(provider) = string_opt(&payload, "defaultProvider") {
        state.config.default_provider = Some(provider);
    }
    if let Some(model) = string_opt(&payload, "defaultModel") {
        state.config.default_model = Some(model);
    }
    if let Some(value) = string_opt(&payload, "openaiReasoningEffort") {
        state.config.reasoning_effort = (value != "default").then_some(value);
    }
    if let Some(value) = string_opt(&payload, "openaiServiceTier") {
        state.config.service_tier = Some(value);
    }
    if let Some(value) = string_opt(&payload, "openaiVerbosity") {
        state.config.verbosity = Some(value);
    }
    if let Some(value) = string_opt(&payload, "promptDeliveryMode") {
        state.config.prompt_delivery_mode = Some(match value.trim() {
            "lean-experimental" => "lean-experimental".to_string(),
            _ => "full".to_string(),
        });
    }
    if let Some(value) = payload
        .get("openaiResponsesStatefulPromptContract")
        .and_then(Value::as_bool)
    {
        state.config.openai_responses_stateful_prompt_contract = value;
    }
    if let Some(value) = payload.get("proactiveEnabled").and_then(Value::as_bool) {
        state.config.proactive_enabled = value;
    }
    if let Some(items) = payload
        .get("proactiveDisabledTriggers")
        .and_then(Value::as_array)
    {
        state.config.proactive_disabled_triggers = items
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_string)
            .collect();
    }
    state.save_state()?;
    drop(state);
    read_config()
}

pub(crate) fn save_provider_profile(payload: Value) -> AgentRuntimeResult<Value> {
    let profile_name = string_opt(&payload, "profileName")
        .ok_or_else(|| AgentRuntimeError::Core("profileName is required".to_string()))?;
    let route_id = string_opt(&payload, "routeId")
        .ok_or_else(|| AgentRuntimeError::Core("routeId is required".to_string()))?;
    let route = providers::registry::require_route(&route_id)?;
    let base_url = string_opt(&payload, "baseUrl").or_else(|| route.default_base_url.clone());
    let default_model = string_opt(&payload, "defaultModel");
    let existing_profile = {
        let state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        state.config.providers.get(&profile_name).cloned()
    };
    let (default_tool_calling, default_streaming) =
        providers::model_capabilities::protocol_capability_defaults(Some(&route));
    let models = payload
        .get("models")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(|item| {
                    let id = item.get("id").and_then(Value::as_str)?.to_string();
                    Some(NativeProviderModel {
                        id: id.clone(),
                        label: Some(id),
                        context_window: item
                            .get("contextWindow")
                            .and_then(Value::as_u64)
                            .map(|value| value as usize),
                        supports_image_input: item
                            .get("supportsImageInput")
                            .or_else(|| item.get("supports_image_input"))
                            .and_then(Value::as_bool)
                            .unwrap_or(false),
                        supports_tool_calling: item
                            .get("supportsToolCalling")
                            .or_else(|| item.get("supports_tool_calling"))
                            .and_then(Value::as_bool)
                            .unwrap_or(default_tool_calling),
                        supports_streaming: item
                            .get("supportsStreaming")
                            .or_else(|| item.get("supports_streaming"))
                            .and_then(Value::as_bool)
                            .unwrap_or(default_streaming),
                        supports_reasoning_effort: item
                            .get("supportsReasoningEffort")
                            .or_else(|| item.get("supports_reasoning_effort"))
                            .and_then(Value::as_bool),
                        reasoning_replay_field: item
                            .get("reasoningReplayField")
                            .or_else(|| item.get("reasoning_replay_field"))
                            .cloned()
                            .and_then(|value| serde_json::from_value(value).ok())
                            .unwrap_or_default(),
                        requires_reasoning_field_on_assistant_messages: item
                            .get("requiresReasoningFieldOnAssistantMessages")
                            .or_else(|| item.get("requires_reasoning_field_on_assistant_messages"))
                            .and_then(Value::as_bool),
                        supports_tool_choice: item
                            .get("supportsToolChoice")
                            .or_else(|| item.get("supports_tool_choice"))
                            .and_then(Value::as_bool),
                        enabled: item.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                        api_npm: None,
                    })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_else(|| {
            existing_profile
                .as_ref()
                .map(|profile| profile.models.clone())
                .unwrap_or_default()
        });
    let default_auth_header = default_auth_header_for_route(&route);
    let profile = NativeProviderProfile {
        id: profile_name.clone(),
        label: string_opt(&payload, "label").unwrap_or_else(|| route.label.clone()),
        route_id,
        base_url,
        default_model: default_model.clone().or_else(|| {
            existing_profile
                .as_ref()
                .and_then(|profile| profile.default_model.clone())
        }),
        api_key: if payload.get("apiKey").is_some() {
            string_opt(&payload, "apiKey")
        } else if payload.get("apiKeyRef").is_some() {
            None
        } else {
            existing_profile
                .as_ref()
                .and_then(|profile| profile.api_key.clone())
        },
        api_key_ref: if payload.get("apiKeyRef").is_some() {
            payload
                .get("apiKeyRef")
                .filter(|value| value.is_object())
                .cloned()
        } else {
            existing_profile
                .as_ref()
                .and_then(|profile| profile.api_key_ref.clone())
        },
        api_key_env: if payload.get("apiKeyEnv").is_some() {
            string_opt(&payload, "apiKeyEnv")
        } else {
            existing_profile
                .as_ref()
                .and_then(|profile| profile.api_key_env.clone())
        },
        auth_header: if payload.get("authHeader").is_some() {
            string_opt(&payload, "authHeader").or(default_auth_header)
        } else {
            existing_profile
                .as_ref()
                .and_then(|profile| profile.auth_header.clone())
                .or(default_auth_header)
        },
        embedding_model: string_opt(&payload, "embeddingModel")
            .or_else(|| string_opt(&payload, "embedding_model"))
            .or_else(|| {
                existing_profile
                    .as_ref()
                    .and_then(|profile| profile.embedding_model.clone())
            }),
        models,
    };
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    state.config.providers.insert(profile_name.clone(), profile);
    if payload
        .get("setDefault")
        .and_then(Value::as_bool)
        .unwrap_or(false)
    {
        state.config.default_provider = Some(profile_name);
        if default_model.is_some() {
            state.config.default_model = default_model;
        }
    }
    state.save_state()?;
    drop(state);
    read_config()
}

/// Saves the profile, then runs model discovery against the freshly saved
/// profile. `refresh_models` keys the provider off `payload["provider"]`
/// while the save half keys off `profileName`, so the alias is injected
/// here rather than asking callers to send both.
pub(crate) fn save_and_discover_provider_profile(payload: Value) -> AgentRuntimeResult<Value> {
    save_provider_profile(payload.clone())?;
    let profile_name = string_opt(&payload, "profileName")
        .ok_or_else(|| AgentRuntimeError::Core("profileName is required".to_string()))?;
    let mut discover_payload = payload;
    if let Some(object) = discover_payload.as_object_mut() {
        object.insert("provider".to_string(), Value::String(profile_name));
        object.insert("resolveRoute".to_string(), Value::Bool(true));
    }
    refresh_models(discover_payload)
}

fn default_auth_header_for_route(
    route: &providers::types::ProviderRouteDescriptor,
) -> Option<String> {
    match route.auth_kind.as_str() {
        "api-key" => Some("api-key".to_string()),
        _ => None,
    }
}

pub(crate) fn update_provider_options(payload: Value) -> AgentRuntimeResult<Value> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    if payload.get("reasoningEffort").is_some() {
        state.config.reasoning_effort =
            string_opt(&payload, "reasoningEffort").filter(|value| value != "default");
    }
    if payload.get("serviceTier").is_some() {
        state.config.service_tier = string_opt(&payload, "serviceTier");
    }
    if payload.get("verbosity").is_some() {
        state.config.verbosity = string_opt(&payload, "verbosity");
    }
    state.save_state()?;
    drop(state);
    list_models(payload)
}

pub(crate) fn list_models(payload: Value) -> AgentRuntimeResult<Value> {
    match state().try_lock() {
        Ok(state) => model_catalog_for_config_with_capabilities(
            &state.config,
            &state.model_capabilities,
            &state.media_model_defaults,
            payload,
        ),
        Err(std::sync::TryLockError::WouldBlock) => {
            let state_file = read_json::<NativeStateFile>(&runtime_root().join("state.json"));
            let mut config = state_file
                .as_ref()
                .map(|state| state.config.clone())
                .unwrap_or_default();
            install_default_providers(&mut config);
            model_catalog_for_config_with_capabilities(
                &config,
                &state_file
                    .as_ref()
                    .map(|state| state.model_capabilities.clone())
                    .unwrap_or_default(),
                &state_file
                    .as_ref()
                    .map(|state| state.media_model_defaults.clone())
                    .unwrap_or_default(),
                payload,
            )
        }
        Err(std::sync::TryLockError::Poisoned(_)) => Err(AgentRuntimeError::Core(
            "agent runtime state lock failed".to_string(),
        )),
    }
}

pub(crate) fn model_catalog_for_config(
    config: &NativeConfig,
    payload: Value,
) -> AgentRuntimeResult<Value> {
    model_catalog_for_config_with_capabilities(config, &HashMap::new(), &HashMap::new(), payload)
}

fn model_catalog_for_config_with_capabilities(
    config: &NativeConfig,
    capability_records: &HashMap<String, HashMap<String, NativeModelCapabilityRecord>>,
    media_model_defaults: &HashMap<String, NativeModelReference>,
    payload: Value,
) -> AgentRuntimeResult<Value> {
    let current_provider = config.default_provider.clone().unwrap_or_default();
    let current_model = config
        .default_model
        .clone()
        .or_else(|| {
            if current_provider.is_empty() {
                None
            } else {
                config
                    .providers
                    .get(&current_provider)
                    .and_then(|provider| provider.default_model.clone())
            }
        })
        .unwrap_or_default();
    let mut models = Vec::new();
    let mut routes = Vec::new();
    let mut current_protocol_id = String::new();
    let mut current_route_id = String::new();
    let mut current_supports_reasoning_effort: Option<bool> = None;
    let mut current_reasoning_control = None;
    for provider in config.providers.values() {
        let route = providers::registry::require_route(&provider.route_id)?;
        let available = providers::capabilities::provider_profile_available(provider, &route);
        if !available || provider.models.is_empty() {
            continue;
        }
        for model in provider.models.clone() {
            let selected = provider.id == current_provider && model.id == current_model;
            let capability_record = capability_records
                .get(&provider.id)
                .and_then(|records| records.get(&model.id));
            let api_npm = providers::wire_protocol::api_npm_from(Some(&model), capability_record)
                .map(str::to_string)
                .or_else(|| {
                    providers::wire_protocol::route_protocol_id(&provider.route_id, None).and_then(
                        |_| providers::models_dev::cached_api_npm(&provider.route_id, &model.id),
                    )
                });
            let effective_protocol_id = providers::routes::opencode::effective_protocol_id(
                &provider.route_id,
                api_npm.as_deref(),
            )
            .unwrap_or(route.protocol_id.as_str());
            let effective_protocol_family = effective_protocol_id;
            let effective_api_method = providers::routes::opencode::effective_api_method(
                &provider.route_id,
                api_npm.as_deref(),
            )
            .unwrap_or(route.api_method.as_str());
            let effective_capabilities = providers::model_capabilities::CAPABILITY_KEYS
                .iter()
                .map(|key| {
                    let fallback = match *key {
                        providers::model_capabilities::INPUT_TEXT
                        | providers::model_capabilities::OUTPUT_TEXT
                        | providers::model_capabilities::OPERATION_LANGUAGE => true,
                        providers::model_capabilities::INPUT_IMAGE => model.supports_image_input,
                        providers::model_capabilities::FEATURE_TOOL_CALLING => {
                            model.supports_tool_calling
                        }
                        providers::model_capabilities::FEATURE_STREAMING => {
                            model.supports_streaming
                        }
                        providers::model_capabilities::FEATURE_REASONING_EFFORT => {
                            model.supports_reasoning_effort.unwrap_or(false)
                        }
                        providers::model_capabilities::FEATURE_TOOL_CHOICE => {
                            model.supports_tool_choice.unwrap_or(false)
                        }
                        _ => false,
                    };
                    let executable = providers::model_capabilities::effective_capability_for_model(
                        capability_record,
                        effective_protocol_id,
                        &provider.route_id,
                        &model.id,
                        key,
                        fallback,
                    );
                    ((*key).to_string(), Value::Bool(executable))
                })
                .collect::<serde_json::Map<String, Value>>();
            let agent_usable = [
                providers::model_capabilities::INPUT_TEXT,
                providers::model_capabilities::OUTPUT_TEXT,
                providers::model_capabilities::OPERATION_LANGUAGE,
            ]
            .iter()
            .all(|key| effective_capabilities.get(*key).and_then(Value::as_bool) == Some(true));
            if selected {
                current_protocol_id = effective_protocol_id.to_string();
                current_route_id = provider.route_id.clone();
                current_supports_reasoning_effort = model.supports_reasoning_effort;
                current_reasoning_control =
                    capability_record.and_then(|record| record.reasoning_control.clone());
            }
            // ponytail: 复合 uid `${provider}:${model}` 作为 catalog 条目唯一标识，
            // 避免同名模型跨 provider 时下拉 value 撞车导致路由错误（对齐 opencode/zed 的 (provider,model) 身份）。
            // `model`/`provider` 等字段仍保留 bare 值，wire 协议与持久化不变。
            let uid = format!("{}:{}", provider.id, model.id);
            let account = config
                .accounts
                .iter()
                .find(|account| account.provider == provider.id);
            models.push(json!({
                "id": uid,
                "label": model.label.clone().unwrap_or_else(|| model.id.clone()),
                "model": model.id,
                "provider": provider.id,
                "providerId": provider.id,
                "providerLabel": provider.label,
                "accountEmail": account.and_then(|account| account.email.clone()),
                "accountName": account.and_then(|account| account.display_name.clone()),
                "accountAvatarUrl": account.and_then(|account| account.avatar_url.clone()),
                "providerKey": provider.id,
                "routeId": provider.route_id,
                "protocolId": effective_protocol_id,
                "protocolFamily": effective_protocol_family,
                "apiMethod": effective_api_method,
                "detail": provider.base_url,
                "contextWindow": model.context_window,
                "supportsImageInput": effective_capabilities
                    .get(providers::model_capabilities::INPUT_IMAGE)
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                "supportsToolCalling": effective_capabilities
                    .get(providers::model_capabilities::FEATURE_TOOL_CALLING)
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
                "supportsStreaming": model.supports_streaming,
                "supportsReasoningEffort": model.supports_reasoning_effort,
                "reasoningReplayField": model.reasoning_replay_field,
                "requiresReasoningFieldOnAssistantMessages": model.requires_reasoning_field_on_assistant_messages,
                "supportsToolChoice": model.supports_tool_choice,
                "embeddingModel": provider.embedding_model,
                "available": available,
                "agentUsable": agent_usable,
                "enabled": model.enabled,
                "selected": selected,
                "capabilities": {
                    "detected": capability_record.map(|record| &record.detected),
                    "overrides": capability_record.map(|record| &record.overrides),
                    "effective": effective_capabilities,
                    "evidence": capability_record.map(|record| &record.evidence),
                    "runtimeConflict": capability_record.and_then(|record| record.runtime_conflict.as_deref()),
                    "contextWindowOverride": capability_record.and_then(|record| record.context_window_override),
                    "reasoningReplayFieldOverride": capability_record.and_then(|record| record.reasoning_replay_field_override),
                    "assistantReasoningFieldRequiredOverride": capability_record.and_then(|record| record.assistant_reasoning_field_required_override),
                },
            }));
            if model.enabled && agent_usable {
                routes.push(json!({
                    "model": model.id,
                    "provider": provider.id,
                    "routeId": provider.route_id,
                    "protocolId": effective_protocol_id,
                    "protocolFamily": effective_protocol_family,
                    "apiMethod": effective_api_method,
                    "embeddingModel": provider.embedding_model,
                    "available": available,
                    "detail": provider.base_url.clone().unwrap_or_else(|| "base URL not configured".to_string())
                }));
            }
        }
    }
    // verbosity / service_tier remain Responses-only: those fields are not
    // encoded on other protocols. reasoning effort is catalog + protocol
    // encoding, not a Responses-only UI gate.
    let is_openai_responses =
        current_protocol_id == providers::protocol::openai_responses::PROTOCOL_ID;
    let effort_options = providers::reasoning_control::catalog_options(
        &current_protocol_id,
        &current_route_id,
        current_supports_reasoning_effort,
        current_reasoning_control.as_ref(),
    );
    let supports_reasoning = !effort_options.is_empty();
    let mut display_options = Vec::new();
    if supports_reasoning {
        display_options.push("default".to_string());
        display_options.extend(
            effort_options
                .iter()
                .filter(|value| value.as_str() != "default")
                .cloned(),
        );
    }
    let effort_option_refs = display_options
        .iter()
        .map(String::as_str)
        .collect::<Vec<_>>();
    let current_effort = if supports_reasoning {
        Some(
            config
                .reasoning_effort
                .clone()
                .filter(|value| {
                    value != "default" && effort_options.iter().any(|option| option == value)
                })
                .unwrap_or_else(|| "default".to_string()),
        )
    } else {
        None
    };
    Ok(json!({
        "sessionId": payload.get("sessionId").cloned().unwrap_or(Value::Null),
        "currentModel": current_model,
        "currentProvider": current_provider,
        "defaultModel": config.default_model,
        "defaultProvider": config.default_provider,
        "models": models,
        "routes": routes,
        "mediaModelDefaults": media_model_defaults,
        "reasoningEffort": option_state(current_effort, &effort_option_refs, supports_reasoning),
        "verbosity": option_state(config.verbosity.clone(), &["low", "medium", "high"], is_openai_responses),
        "serviceTier": option_state(config.service_tier.clone(), &["auto", "default", "flex"], is_openai_responses),
    }))
}

pub(crate) fn switch_model(payload: Value) -> AgentRuntimeResult<Value> {
    let model = string_opt(&payload, "model")
        .ok_or_else(|| AgentRuntimeError::Core("model is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let provider = string_opt(&payload, "provider")
        .or_else(|| unique_provider_for_model(&state.config, &model))
        .or_else(|| state.config.default_provider.clone());
    // ponytail: 拒绝在找不到对应 provider profile 时设置 default_model。
    // 否则会得到 default_provider=旧值 + default_model=新模型名 的错配，
    // 请求路由到错误的 provider 端点 → 上游 400 "Model is unavailable"。
    let Some(provider) = provider else {
        return Err(AgentRuntimeError::Core(format!(
            "cannot switch to model {model}: no provider resolved and no default provider configured"
        )));
    };
    if !state.config.providers.contains_key(&provider) {
        return Err(AgentRuntimeError::Core(format!(
            "cannot switch to model {model}: provider {provider} is not configured"
        )));
    }
    // ponytail: 校验该 provider profile 确实拥有此 model。否则会得到
    // default_provider=该 provider + default_model=它不提供的模型名 的错配，
    // 请求路由到该 provider 端点 → 上游 400 "Model is unavailable"。
    let owns_model = state
        .config
        .providers
        .get(&provider)
        .is_some_and(|profile| profile.models.iter().any(|entry| entry.id == model));
    if !owns_model {
        return Err(AgentRuntimeError::Core(format!(
            "cannot switch to model {model}: provider {provider} does not offer it"
        )));
    }
    let profile = state
        .config
        .providers
        .get(&provider)
        .expect("provider validated");
    let route = providers::registry::require_route(&profile.route_id)?;
    let capability_record = state
        .model_capabilities
        .get(&provider)
        .and_then(|records| records.get(&model));
    let model_entry = profile
        .models
        .iter()
        .find(|entry| entry.id == model)
        .expect("owned model validated");
    let protocol_id = providers::routes::opencode::effective_protocol_id(
        &profile.route_id,
        providers::wire_protocol::api_npm_from(Some(model_entry), capability_record),
    )
    .unwrap_or(route.protocol_id.as_str());
    let agent_usable = [
        providers::model_capabilities::INPUT_TEXT,
        providers::model_capabilities::OUTPUT_TEXT,
        providers::model_capabilities::OPERATION_LANGUAGE,
    ]
    .iter()
    .all(|key| {
        let declared = capability_record
            .map(|record| record.resolved(key, true))
            .unwrap_or(true);
        declared
            && model_entry.enabled
            && providers::model_capabilities::protocol_can_execute(
                protocol_id,
                &profile.route_id,
                key,
            )
    });
    if !agent_usable {
        return Err(AgentRuntimeError::Core(format!(
            "cannot use model {model} as the main agent: it is disabled or lacks executable language text input/output capabilities"
        )));
    }
    state.config.default_model = Some(model.clone());
    if let Some(profile) = state.config.providers.get_mut(&provider) {
        profile.default_model = Some(model);
    }
    state.config.default_provider = Some(provider);
    state.save_state()?;
    drop(state);
    list_models(payload)
}

fn unique_provider_for_model(config: &NativeConfig, model_id: &str) -> Option<String> {
    let mut matches = config
        .providers
        .values()
        .filter(|provider| provider.models.iter().any(|model| model.id == model_id))
        .map(|provider| provider.id.clone());
    let first = matches.next()?;
    if matches.next().is_some() {
        return None;
    }
    Some(first)
}

pub(crate) fn set_model_enabled(payload: Value) -> AgentRuntimeResult<Value> {
    let provider_id = string_opt(&payload, "provider")
        .ok_or_else(|| AgentRuntimeError::Core("provider is required".to_string()))?;
    let model_id = string_opt(&payload, "model")
        .ok_or_else(|| AgentRuntimeError::Core("model is required".to_string()))?;
    let enabled = payload
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or_else(|| AgentRuntimeError::Core("enabled is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let provider = state
        .config
        .providers
        .get_mut(&provider_id)
        .ok_or_else(|| {
            AgentRuntimeError::Core(format!("provider {provider_id} is not configured"))
        })?;
    let model = provider
        .models
        .iter_mut()
        .find(|entry| entry.id == model_id)
        .ok_or_else(|| AgentRuntimeError::Core(format!("model {model_id} is not configured")))?;
    model.enabled = enabled;
    state.save_state()?;
    drop(state);
    list_models(payload)
}

pub(crate) fn update_model_capabilities(payload: Value) -> AgentRuntimeResult<Value> {
    let provider_id = string_opt(&payload, "provider")
        .ok_or_else(|| AgentRuntimeError::Core("provider is required".to_string()))?;
    let model_id = string_opt(&payload, "model")
        .ok_or_else(|| AgentRuntimeError::Core("model is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let model_exists = state
        .config
        .providers
        .get(&provider_id)
        .is_some_and(|provider| provider.models.iter().any(|model| model.id == model_id));
    if !model_exists {
        return Err(AgentRuntimeError::Core(format!(
            "model {model_id} is not configured for provider {provider_id}"
        )));
    }
    let provider_route_id = state
        .config
        .providers
        .get(&provider_id)
        .map(|provider| provider.route_id.clone())
        .expect("model provider validated");
    let protocol_id = providers::registry::require_route(&provider_route_id)?.protocol_id;
    let record = state
        .model_capabilities
        .entry(provider_id.clone())
        .or_default()
        .entry(model_id.clone())
        .or_default();
    if let Some(overrides) = payload.get("overrides").and_then(Value::as_object) {
        for (key, value) in overrides {
            if !providers::model_capabilities::is_known_capability_key(key) {
                return Err(AgentRuntimeError::Core(format!(
                    "unknown model capability: {key}"
                )));
            }
            let parsed = match value.as_str().unwrap_or("auto") {
                "supported" => CapabilityOverride::Supported,
                "unsupported" => CapabilityOverride::Unsupported,
                "auto" => CapabilityOverride::Auto,
                other => {
                    return Err(AgentRuntimeError::Core(format!(
                        "invalid capability override {other} for {key}"
                    )));
                }
            };
            if parsed == CapabilityOverride::Auto {
                record.overrides.remove(key);
            } else {
                record.overrides.insert(key.clone(), parsed);
            }
        }
    }
    if payload.get("contextWindowOverride").is_some() {
        record.context_window_override = payload
            .get("contextWindowOverride")
            .and_then(Value::as_u64)
            .map(|value| value as usize);
    }
    if payload.get("reasoningReplayFieldOverride").is_some() {
        record.reasoning_replay_field_override = payload
            .get("reasoningReplayFieldOverride")
            .filter(|value| !value.is_null())
            .cloned()
            .and_then(|value| serde_json::from_value(value).ok());
    }
    if payload
        .get("assistantReasoningFieldRequiredOverride")
        .is_some()
    {
        record.assistant_reasoning_field_required_override = payload
            .get("assistantReasoningFieldRequiredOverride")
            .and_then(Value::as_bool);
    }
    if let Some(operation) = string_opt(&payload, "setDefaultForOperation") {
        let capability = match operation.as_str() {
            "imageGeneration" => providers::model_capabilities::OPERATION_IMAGE_GENERATION,
            "speechGeneration" => providers::model_capabilities::OPERATION_SPEECH_GENERATION,
            "transcription" => providers::model_capabilities::OPERATION_TRANSCRIPTION,
            "videoGeneration" => providers::model_capabilities::OPERATION_VIDEO_GENERATION,
            _ => {
                return Err(AgentRuntimeError::Core(format!(
                    "unsupported media operation: {operation}"
                )));
            }
        };
        let executable = providers::model_capabilities::effective_capability_for_model(
            Some(&*record),
            &protocol_id,
            &provider_route_id,
            &model_id,
            capability,
            false,
        );
        if !executable {
            return Err(AgentRuntimeError::Core(format!(
                "model {model_id} cannot execute {operation} through its configured protocol"
            )));
        }
        state.media_model_defaults.insert(
            operation,
            NativeModelReference {
                provider_id: provider_id.clone(),
                model_id: model_id.clone(),
            },
        );
    }
    state.save_state()?;
    drop(state);
    list_models(payload)
}

pub(crate) fn delete_model(payload: Value) -> AgentRuntimeResult<Value> {
    let provider_id = string_opt(&payload, "provider")
        .ok_or_else(|| AgentRuntimeError::Core("provider is required".to_string()))?;
    if payload.get("scope").and_then(Value::as_str) == Some("provider")
        || string_opt(&payload, "model").is_none()
    {
        return delete_provider(&provider_id);
    }
    let model_id = string_opt(&payload, "model")
        .ok_or_else(|| AgentRuntimeError::Core("model is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let present = state
        .config
        .providers
        .get(&provider_id)
        .is_some_and(|provider| provider.models.iter().any(|entry| entry.id == model_id));
    if !present {
        drop(state);
        return list_models(payload);
    }
    let Some(provider) = state.config.providers.get_mut(&provider_id) else {
        drop(state);
        return list_models(payload);
    };
    provider.models.retain(|entry| entry.id != model_id);
    if provider.default_model.as_deref() == Some(model_id.as_str()) {
        provider.default_model = provider.models.first().map(|entry| entry.id.clone());
    }
    let next_default = provider.default_model.clone();
    drop(provider);
    if let Some(records) = state.model_capabilities.get_mut(&provider_id) {
        records.remove(&model_id);
    }
    state
        .media_model_defaults
        .retain(|_, model| model.provider_id != provider_id || model.model_id != model_id);
    if state.config.default_provider.as_deref() == Some(provider_id.as_str())
        && state.config.default_model.as_deref() == Some(model_id.as_str())
    {
        state.config.default_model = next_default;
    }
    state.save_state()?;
    drop(state);
    list_models(payload)
}

fn delete_provider(provider_id: &str) -> AgentRuntimeResult<Value> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    state.config.providers.remove(provider_id);
    state.model_capabilities.remove(provider_id);
    state
        .media_model_defaults
        .retain(|_, model| model.provider_id != provider_id);
    state
        .config
        .accounts
        .retain(|account| account.provider != provider_id);
    if state.config.default_provider.as_deref() == Some(provider_id) {
        let next = state
            .config
            .providers
            .iter()
            .find(|(_, profile)| !profile.models.is_empty())
            .map(|(id, profile)| {
                (
                    id.clone(),
                    profile
                        .default_model
                        .clone()
                        .or_else(|| profile.models.first().map(|model| model.id.clone())),
                )
            });
        match next {
            Some((id, model)) => {
                state.config.default_provider = Some(id);
                state.config.default_model = model;
            }
            None => {
                state.config.default_provider = None;
                state.config.default_model = None;
            }
        }
    }
    state.save_state()?;
    drop(state);
    list_models(json!({}))
}

pub(crate) fn refresh_models(payload: Value) -> AgentRuntimeResult<Value> {
    if payload.get("listOnly").and_then(Value::as_bool) == Some(true) {
        return list_models(payload);
    }
    let provider_id = string_opt(&payload, "provider").or_else(|| {
        state()
            .lock()
            .ok()
            .and_then(|state| state.config.default_provider.clone())
    });
    let Some(provider_id) = provider_id else {
        return list_models(payload);
    };
    let (provider, host_dispatcher) = {
        let state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        (
            state.config.providers.get(&provider_id).cloned(),
            host_dispatcher(),
        )
    };
    let Some(provider) = provider else {
        return list_models(payload);
    };
    let stored_provider = provider.clone();
    let provider = providers::transport::auth::provider_with_resolved_api_key(
        provider,
        host_dispatcher.as_ref(),
    )?;
    if providers::subscription::is_subscription_route(&provider.route_id) {
        if let Some(secret) = provider.api_key.as_deref() {
            let _ = remember_account_identity(&provider_id, &provider.route_id, secret);
        }
    }
    let route = providers::registry::require_route(&provider.route_id)?;
    if !route.model_discovery_supported {
        return list_models(payload);
    }
    // Seeded hosted stubs (openai, etc.) exist without a key. Live /models
    // would throw provider_not_configured; return the local catalog instead.
    if providers::capabilities::provider_requires_api_key(&provider, &route) {
        return list_models(payload);
    }
    if providers::routes::mimo::is_mimo_route(&provider.route_id) {
        let discovery = providers::routes::mimo::routing::discover(
            &provider,
            payload
                .get("resolveRoute")
                .and_then(Value::as_bool)
                .unwrap_or(false),
        )?;
        return save_refreshed_models(
            payload,
            &provider_id,
            &discovery.profile.route_id,
            discovery.models,
            HashMap::new(),
            Some((&stored_provider, &discovery.profile)),
        );
    }
    if let Some(hook) = providers::registry::route_model_discovery_hook(&provider.route_id) {
        let models = hook.discover_models(&provider)?;
        return save_refreshed_models(
            payload,
            &provider_id,
            &provider.route_id,
            models,
            HashMap::new(),
            None,
        );
    }
    let client = http_client_builder(Duration::from_secs(30))
        .build()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let mut explicit_records = HashMap::new();
    let mut models = if route.protocol_id == providers::protocol::openai_responses::PROTOCOL_ID {
        let (models, records) =
            providers::protocol::openai_responses::discover_models(&client, &provider)?;
        explicit_records.extend(records);
        models
    } else if route.protocol_id == providers::protocol::anthropic_messages::PROTOCOL_ID {
        providers::protocol::anthropic_messages::discover_models(&client, &provider)?
    } else if route.protocol_id == providers::protocol::gemini_generate_content::PROTOCOL_ID {
        providers::protocol::gemini_generate_content::discover_models(&client, &provider)?
    } else if route.protocol_id == providers::protocol::aws_bedrock_converse::PROTOCOL_ID {
        let (models, records) =
            providers::protocol::aws_bedrock_converse::discover_models(&client, &provider)?;
        explicit_records.extend(records);
        models
    } else if route.protocol_id == providers::protocol::openai_chat_completions::PROTOCOL_ID {
        let require_auth = !route.auth_kind.contains("none");
        let (models, records) =
            providers::protocol::openai_common::discover_models_with_capabilities(
                &client,
                &provider,
                require_auth,
                providers::protocol::openai_common::ModelDiscoveryScope::All,
            )?;
        explicit_records.extend(records);
        models
    } else if route.protocol_id == providers::protocol::ollama_chat::PROTOCOL_ID {
        providers::protocol::ollama_chat::discover_models(&client, &provider)?
    } else {
        return list_models(payload);
    };
    if provider.route_id == providers::routes::xai::ROUTE_ID {
        let video_models = providers::routes::xai::discover_video_models(&client, &provider)?;
        explicit_records.extend(providers::routes::xai::video_capability_records(
            &video_models,
        ));
        models.extend(video_models);
        models.sort_by(|left, right| left.id.cmp(&right.id));
        models.dedup_by(|left, right| left.id == right.id);
    }
    save_refreshed_models(
        payload,
        &provider_id,
        &provider.route_id,
        models,
        explicit_records,
        None,
    )
}

fn save_refreshed_models(
    payload: Value,
    provider_id: &str,
    capability_catalog_provider_id: &str,
    models: Vec<NativeProviderModel>,
    explicit_records: HashMap<String, NativeModelCapabilityRecord>,
    verified_route: Option<(&NativeProviderProfile, &NativeProviderProfile)>,
) -> AgentRuntimeResult<Value> {
    if models.is_empty() {
        return list_models(payload);
    }
    // Network discovery must never hold the runtime state mutex. Apart from
    // freezing the UI, doing so can deadlock callers that receive progress
    // events while the catalog request is in flight.
    let capability_map =
        providers::models_dev::fetch_capability_map(capability_catalog_provider_id);
    let catalog_body = providers::models_dev::cached_catalog_body();
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let mut route_adjustment = None;
    let refreshed_models = if let Some(profile) = state.config.providers.get_mut(provider_id) {
        if let Some((expected, verified)) = verified_route {
            route_adjustment = providers::routes::mimo::routing::apply_verified_route(
                profile, expected, verified,
            )?;
        }
        let existing = profile.models.clone();
        let subscription = providers::subscription::is_subscription_route(&profile.route_id);
        let discovered_ids = models
            .iter()
            .map(|model| model.id.clone())
            .collect::<std::collections::HashSet<_>>();
        let existing_for_merge = if subscription {
            existing
                .iter()
                .filter(|model| discovered_ids.contains(&model.id))
                .cloned()
                .collect::<Vec<_>>()
        } else {
            existing
        };
        profile.models =
            providers::model_capabilities::merge_discovered_models(&existing_for_merge, models);
        if subscription
            && profile
                .default_model
                .as_ref()
                .is_some_and(|model| !discovered_ids.contains(model))
        {
            profile.default_model = profile
                .models
                .iter()
                .find(|model| model.enabled)
                .map(|model| model.id.clone());
        }
        providers::models_dev::enrich_models_with_catalog(
            &mut profile.models,
            capability_catalog_provider_id,
            &capability_map,
            catalog_body.as_ref(),
        );
        Some(profile.models.clone())
    } else {
        None
    };
    if state.config.default_provider.as_deref() == Some(provider_id)
        && state
            .config
            .providers
            .get(provider_id)
            .is_some_and(|profile| {
                providers::subscription::is_subscription_route(&profile.route_id)
            })
    {
        let default_still_listed = state.config.default_model.as_ref().is_some_and(|model_id| {
            state
                .config
                .providers
                .get(provider_id)
                .is_some_and(|profile| profile.models.iter().any(|model| &model.id == model_id))
        });
        if !default_still_listed {
            state.config.default_model = state
                .config
                .providers
                .get(provider_id)
                .and_then(|profile| profile.default_model.clone());
        }
    }
    if let Some(refreshed_models) = refreshed_models {
        let records = state
            .model_capabilities
            .entry(provider_id.to_string())
            .or_default();
        for model in &refreshed_models {
            let discovered = providers::model_capabilities::record_from_discovered_model(
                model,
                "provider_api",
                None,
            );
            let record = records.entry(model.id.clone()).or_default();
            record.detected = discovered.detected;
            record.evidence = discovered.evidence;
            record.recompute_runtime_conflict();
            if let Some(explicit) = explicit_records.get(&model.id) {
                record.detected.extend(explicit.detected.clone());
                record.evidence.extend(explicit.evidence.clone());
            }
            providers::models_dev::enrich_capability_record_with_catalog(
                record,
                capability_catalog_provider_id,
                &model.id,
                &capability_map,
                catalog_body.as_ref(),
            );
        }
    }
    state.save_state()?;
    drop(state);
    let mut catalog = list_models(payload)?;
    if let Some(adjustment) = route_adjustment {
        catalog["routeAdjustment"] = adjustment;
    }
    Ok(catalog)
}

pub(crate) fn list_accounts() -> AgentRuntimeResult<Value> {
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    Ok(accounts_json(&state.config))
}

pub(crate) fn login_account(payload: Value) -> AgentRuntimeResult<Value> {
    let provider = string_opt(&payload, "provider").unwrap_or_else(|| "openai".to_string());
    if provider == "gmail" {
        return Err(AgentRuntimeError::Core(
            "Account login provider has been removed.".to_string(),
        ));
    }
    let label = string_opt(&payload, "label")
        .or_else(|| string_opt(&payload, "profileName"))
        .unwrap_or_else(|| provider.clone());
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    state
        .config
        .accounts
        .retain(|account| account.provider != provider);
    state.config.accounts.push(NativeAccount {
        provider: provider.clone(),
        label,
        kind: string_opt(&payload, "kind").unwrap_or_else(|| "apiKey".to_string()),
        active: true,
        configured: true,
        detail: string_opt(&payload, "detail")
            .or_else(|| string_opt(&payload, "email"))
            .or_else(|| Some("Configured in Lyra native runtime".to_string())),
        email: string_opt(&payload, "email"),
        display_name: string_opt(&payload, "displayName"),
        avatar_url: string_opt(&payload, "avatarUrl"),
    });
    state.config.default_provider = Some(provider);
    state.save_state()?;
    Ok(accounts_json(&state.config))
}

pub(crate) fn login_providers() -> AgentRuntimeResult<Value> {
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let providers = vec![
        login_provider("openai", "OpenAI", "apiKey", true, false, &state.config),
        login_provider("deepseek", "DeepSeek", "apiKey", true, false, &state.config),
        login_provider("glm", "GLM", "apiKey", true, false, &state.config),
        login_provider("moonshot", "Kimi", "apiKey", true, false, &state.config),
        login_provider("nvidia", "NVIDIA NIM", "apiKey", true, false, &state.config),
        login_provider(
            "amd",
            "AMD Radeon Cloud",
            "apiKey",
            true,
            false,
            &state.config,
        ),
        login_provider("bai", "B.AI", "apiKey", true, false, &state.config),
        login_provider("atria", "Atria ASI", "apiKey", true, false, &state.config),
        login_provider("poolside", "Poolside", "apiKey", true, false, &state.config),
        login_provider(
            "openrouter",
            "OpenRouter",
            "apiKey",
            true,
            false,
            &state.config,
        ),
        login_provider("mimo", "MiMo", "apiKey", true, false, &state.config),
    ];
    let mut providers = providers;
    providers.extend(providers::subscription::login_provider_rows(|id| {
        state
            .config
            .providers
            .get(id)
            .is_some_and(|profile| profile.api_key.is_some() || profile.api_key_ref.is_some())
            || state
                .config
                .accounts
                .iter()
                .any(|account| account.provider == id && account.configured)
    }));
    Ok(json!({ "providers": providers, "authStatus": auth_status(&state.config) }))
}

pub(crate) fn start_account_login(payload: Value) -> AgentRuntimeResult<Value> {
    let provider = string_opt(&payload, "provider").unwrap_or_else(|| "openai".to_string());
    if providers::subscription::is_subscription_route(&provider) {
        return providers::subscription::start_login(&payload);
    }
    let label = string_opt(&payload, "label");
    Ok(json!({
        "provider": provider,
        "label": label,
        "flowId": format!("login-{}", Uuid::new_v4()),
        "authUrl": null,
        "callbackHint": null,
        "authKind": "apiKey",
        "instructions": "Paste an API key to complete provider setup.",
        "requiresCallback": false,
        "requiresApiKey": true,
    }))
}

fn complete_subscription_login(payload: Value, provider: String) -> AgentRuntimeResult<Value> {
    let token = providers::subscription::complete_login(&payload)?;
    let secret = token.to_secret();
    let api_key_ref = host_dispatcher().and_then(|dispatcher| {
        providers::subscription::store_secret(&dispatcher, &provider, &secret).ok()
    });
    let route_label = providers::registry::route_descriptor(&provider)
        .map(|route| route.label.clone())
        .unwrap_or_else(|| provider.clone());
    let base_url = string_opt(&payload, "baseUrl").or_else(|| {
        providers::registry::route_descriptor(&provider).and_then(|route| route.default_base_url)
    });
    let _ = save_provider_profile(json!({
        "profileName": provider,
        "routeId": provider,
        "label": string_opt(&payload, "label").unwrap_or_else(|| route_label.clone()),
        "baseUrl": base_url,
        "apiKey": if api_key_ref.is_some() { Value::Null } else { Value::String(secret.clone()) },
        "apiKeyRef": api_key_ref.unwrap_or(Value::Null),
        "setDefault": payload.get("setDefault").and_then(Value::as_bool).unwrap_or(true),
    }));
    let who = token
        .email
        .clone()
        .or_else(|| token.display_name.clone())
        .unwrap_or_else(|| route_label.clone());
    let accounts = login_account(json!({
        "provider": provider,
        "label": route_label,
        "kind": "subscription",
        "email": token.email,
        "displayName": token.display_name,
        "avatarUrl": token.avatar_url,
        "detail": who,
    }))?;
    let discovered = refresh_models(json!({ "provider": provider }));
    let (message, catalog) = match discovered {
        Ok(catalog) => (format!("Signed in as {who}"), catalog),
        Err(error) => {
            clear_provider_models(&provider)?;
            (
                format!("Signed in as {who}, but the live model list failed: {error}"),
                list_models(json!({}))?,
            )
        }
    };
    Ok(json!({
        "accounts": accounts,
        "message": message,
        "email": token.email,
        "displayName": token.display_name,
        "avatarUrl": token.avatar_url,
        "catalog": catalog,
    }))
}

fn remember_account_identity(
    provider_id: &str,
    route_id: &str,
    secret: &str,
) -> AgentRuntimeResult<()> {
    let identity = providers::subscription::identity_from_secret(route_id, secret);
    if identity.email.is_none() && identity.display_name.is_none() && identity.avatar_url.is_none()
    {
        return Ok(());
    }
    let route_label = providers::registry::route_descriptor(route_id)
        .map(|route| route.label.clone())
        .unwrap_or_else(|| provider_id.to_string());
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    if let Some(account) = state
        .config
        .accounts
        .iter_mut()
        .find(|account| account.provider == provider_id)
    {
        if identity.email.is_some() {
            account.email = identity.email.clone();
        }
        if identity.display_name.is_some() {
            account.display_name = identity.display_name.clone();
        }
        if identity.avatar_url.is_some() {
            account.avatar_url = identity.avatar_url.clone();
        }
        account.detail = account
            .email
            .clone()
            .or_else(|| account.display_name.clone())
            .or(account.detail.clone());
    } else {
        state.config.accounts.push(NativeAccount {
            provider: provider_id.to_string(),
            label: route_label,
            kind: "subscription".to_string(),
            active: true,
            configured: true,
            detail: identity
                .email
                .clone()
                .or_else(|| identity.display_name.clone()),
            email: identity.email,
            display_name: identity.display_name,
            avatar_url: identity.avatar_url,
        });
    }
    state.save_state()
}

fn clear_provider_models(provider_id: &str) -> AgentRuntimeResult<()> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    if let Some(profile) = state.config.providers.get_mut(provider_id) {
        profile.models.clear();
        profile.default_model = None;
    }
    if state.config.default_provider.as_deref() == Some(provider_id) {
        state.config.default_model = None;
    }
    state.save_state()
}

pub(crate) fn complete_account_login(payload: Value) -> AgentRuntimeResult<Value> {
    let provider = string_opt(&payload, "provider").unwrap_or_else(|| "openai".to_string());
    if providers::subscription::is_subscription_route(&provider) {
        return complete_subscription_login(payload, provider);
    }
    let route_id =
        providers::registry::route_id_for_login_provider(&provider).ok_or_else(|| {
            AgentRuntimeError::Core(format!(
                "provider {provider} does not have a configured login route"
            ))
        })?;
    let _ = save_provider_profile(json!({
        "profileName": provider,
        "routeId": route_id,
        "label": string_opt(&payload, "label").unwrap_or_else(|| provider.clone()),
        "baseUrl": string_opt(&payload, "baseUrl"),
        "defaultModel": string_opt(&payload, "defaultModel"),
        "apiKey": string_opt(&payload, "apiKey"),
        "apiKeyRef": payload.get("apiKeyRef").cloned().unwrap_or(Value::Null),
        "authHeader": string_opt(&payload, "authHeader"),
        "setDefault": payload.get("setDefault").and_then(Value::as_bool).unwrap_or(true)
    }));
    let accounts = login_account(json!({
        "provider": provider,
        "label": string_opt(&payload, "label").unwrap_or_else(|| provider.clone())
    }))?;
    Ok(json!({ "accounts": accounts, "message": "Account configured." }))
}

pub(crate) fn switch_account(payload: Value) -> AgentRuntimeResult<Value> {
    let provider = string_opt(&payload, "provider")
        .ok_or_else(|| AgentRuntimeError::Core("provider is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    for account in &mut state.config.accounts {
        account.active = account.provider == provider;
    }
    state.config.default_provider = Some(provider);
    state.save_state()?;
    Ok(accounts_json(&state.config))
}

pub(crate) fn remove_account(payload: Value) -> AgentRuntimeResult<Value> {
    let provider = string_opt(&payload, "provider")
        .ok_or_else(|| AgentRuntimeError::Core("provider is required".to_string()))?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    state
        .config
        .accounts
        .retain(|account| account.provider != provider);
    state.save_state()?;
    Ok(accounts_json(&state.config))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(id: &str, models: &[&str]) -> NativeProviderProfile {
        NativeProviderProfile {
            id: id.to_string(),
            label: id.to_string(),
            route_id: providers::routes::custom_openai_compatible::ROUTE_ID.to_string(),
            base_url: Some("https://example.com/v1".to_string()),
            default_model: None,
            api_key: None,
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: models
                .iter()
                .map(|model| NativeProviderModel {
                    id: (*model).to_string(),
                    label: None,
                    context_window: None,
                    supports_image_input: false,
                    supports_tool_calling: false,
                    supports_streaming: true,
                    supports_reasoning_effort: None,
                    reasoning_replay_field: ReasoningReplayField::Auto,
                    requires_reasoning_field_on_assistant_messages: None,
                    supports_tool_choice: None,
                    enabled: true,
                    api_npm: None,
                })
                .collect(),
        }
    }

    #[test]
    fn unique_provider_for_model_infers_only_unambiguous_model_owner() {
        let mut config = NativeConfig::default();
        config.providers.insert(
            "openai".to_string(),
            provider("openai", &["gpt-5", "shared"]),
        );
        config.providers.insert(
            "openrouter".to_string(),
            provider("openrouter", &["shared"]),
        );

        assert_eq!(
            unique_provider_for_model(&config, "gpt-5").as_deref(),
            Some("openai")
        );
        assert_eq!(unique_provider_for_model(&config, "shared"), None);
        assert_eq!(unique_provider_for_model(&config, "missing"), None);
    }

    #[test]
    fn model_catalog_projects_openai_chat_model_compatibility_fields() {
        let mut config = NativeConfig {
            default_provider: Some("custom".to_string()),
            default_model: Some("reasoning-model".to_string()),
            ..NativeConfig::default()
        };
        let mut profile = provider("custom", &["reasoning-model"]);
        profile.api_key = Some("test-key".to_string());
        profile.models[0].reasoning_replay_field = ReasoningReplayField::ReasoningDetails;
        profile.models[0].requires_reasoning_field_on_assistant_messages = Some(true);
        profile.models[0].supports_tool_choice = Some(false);
        config.providers.insert("custom".to_string(), profile);

        let catalog = model_catalog_for_config(&config, json!({})).expect("model catalog");
        let model = catalog["models"]
            .as_array()
            .and_then(|models| {
                models.iter().find(|model| {
                    model.get("providerId").and_then(Value::as_str) == Some("custom")
                        && model.get("model").and_then(Value::as_str) == Some("reasoning-model")
                })
            })
            .expect("custom reasoning model");
        assert_eq!(model["reasoningReplayField"], "reasoning_details");
        assert_eq!(model["requiresReasoningFieldOnAssistantMessages"], true);
        assert_eq!(model["supportsToolChoice"], false);
    }

    fn available_provider(id: &str, route_id: &str, model: &str) -> NativeProviderProfile {
        let mut profile = provider(id, &[model]);
        profile.route_id = route_id.to_string();
        profile.api_key = Some("test-key".to_string());
        profile
    }

    fn effort_record(values: &[&str]) -> NativeModelCapabilityRecord {
        NativeModelCapabilityRecord {
            reasoning_control: Some(NativeReasoningControl {
                kind: NativeReasoningKind::Effort,
                values: values.iter().map(|value| (*value).to_string()).collect(),
                budget_min: None,
                budget_max: None,
            }),
            ..NativeModelCapabilityRecord::default()
        }
    }

    #[test]
    fn catalog_shows_claude_and_gemini_effort_from_model_control() {
        let mut config = NativeConfig {
            default_provider: Some("anthropic".to_string()),
            default_model: Some("claude-opus".to_string()),
            ..NativeConfig::default()
        };
        config.providers.insert(
            "anthropic".to_string(),
            available_provider(
                "anthropic",
                providers::routes::anthropic::ROUTE_ID,
                "claude-opus",
            ),
        );
        let mut records = HashMap::new();
        records.insert(
            "anthropic".to_string(),
            HashMap::from([(
                "claude-opus".to_string(),
                effort_record(&["low", "high", "max"]),
            )]),
        );
        let catalog = model_catalog_for_config_with_capabilities(
            &config,
            &records,
            &HashMap::new(),
            json!({}),
        )
        .expect("catalog");
        assert_eq!(catalog["reasoningEffort"]["supported"], true);
        assert_eq!(
            catalog["reasoningEffort"]["options"],
            json!(["default", "low", "high", "max"])
        );
        assert_eq!(catalog["reasoningEffort"]["current"], "default");

        config.default_provider = Some("google_gemini".to_string());
        config.default_model = Some("gemini-3".to_string());
        config.providers.insert(
            "google_gemini".to_string(),
            available_provider(
                "google_gemini",
                providers::routes::google_gemini::ROUTE_ID,
                "gemini-3",
            ),
        );
        records.insert(
            "google_gemini".to_string(),
            HashMap::from([(
                "gemini-3".to_string(),
                effort_record(&["minimal", "low", "medium", "high"]),
            )]),
        );
        let gemini = model_catalog_for_config_with_capabilities(
            &config,
            &records,
            &HashMap::new(),
            json!({}),
        )
        .expect("gemini catalog");
        assert_eq!(gemini["reasoningEffort"]["supported"], true);
        assert_eq!(
            gemini["reasoningEffort"]["options"],
            json!(["default", "minimal", "low", "medium", "high"])
        );
    }

    #[test]
    fn catalog_hides_chat_models_without_control_and_keeps_responses_fallback() {
        let mut chat = NativeConfig {
            default_provider: Some("custom".to_string()),
            default_model: Some("plain-chat".to_string()),
            ..NativeConfig::default()
        };
        chat.providers.insert(
            "custom".to_string(),
            available_provider(
                "custom",
                providers::routes::custom_openai_compatible::ROUTE_ID,
                "plain-chat",
            ),
        );
        let hidden = model_catalog_for_config(&chat, json!({})).expect("chat catalog");
        assert_eq!(hidden["reasoningEffort"]["supported"], false);
        assert_eq!(hidden["reasoningEffort"]["options"], json!([]));

        chat.providers.get_mut("custom").expect("custom").models[0].supports_reasoning_effort =
            Some(true);
        let discovered = model_catalog_for_config(&chat, json!({})).expect("discovered catalog");
        assert_eq!(discovered["reasoningEffort"]["supported"], true);
        assert_eq!(
            discovered["reasoningEffort"]["options"],
            json!(["default", "none", "low", "medium", "high", "xhigh"])
        );

        let mut responses = NativeConfig {
            default_provider: Some("openai".to_string()),
            default_model: Some("gpt-5".to_string()),
            reasoning_effort: Some("xhigh".to_string()),
            ..NativeConfig::default()
        };
        responses.providers.insert(
            "openai".to_string(),
            available_provider("openai", providers::routes::openai::ROUTE_ID, "gpt-5"),
        );
        let fallback = model_catalog_for_config(&responses, json!({})).expect("responses catalog");
        assert_eq!(fallback["reasoningEffort"]["supported"], true);
        assert_eq!(fallback["reasoningEffort"]["current"], "xhigh");

        let mut records = HashMap::new();
        records.insert(
            "openai".to_string(),
            HashMap::from([(
                "gpt-5".to_string(),
                effort_record(&["low", "medium", "high"]),
            )]),
        );
        let filtered = model_catalog_for_config_with_capabilities(
            &responses,
            &records,
            &HashMap::new(),
            json!({}),
        )
        .expect("filtered catalog");
        assert_eq!(filtered["reasoningEffort"]["current"], "default");
        assert_eq!(
            filtered["reasoningEffort"]["options"],
            json!(["default", "low", "medium", "high"])
        );
    }
}
