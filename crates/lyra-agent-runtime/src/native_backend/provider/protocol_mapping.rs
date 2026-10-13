use super::*;

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn parse_streaming_response<R: BufRead>(
    reader: R,
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tools: &[Value],
) -> AgentRuntimeResult<ModelReply> {
    let mut committed_any = false;
    parse_streaming_response_with_commit(
        reader,
        session_id,
        turn_id,
        cancellation,
        tools,
        true,
        &mut committed_any,
    )
}

pub(crate) fn build_openai_compatible_request(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    if providers::routes::mimo::is_mimo_route(&provider.route_id) {
        providers::routes::mimo::validate_thinking_replay(messages, model, tools)?;
    }
    let effective_tools = effective_tools(tools, tool_choice);
    let capabilities =
        providers::model_capabilities::resolve_openai_chat_model_capabilities(provider, model);
    let wire_messages = openai_chat::wire_messages(
        messages,
        openai_chat::ReasoningReplayPolicy {
            field: capabilities.reasoning_replay_field,
            required_on_assistant_messages: capabilities
                .requires_reasoning_field_on_assistant_messages,
        },
    );
    let mut body =
        openai_chat::build_request_body(model, &wire_messages, effective_tools, streaming);
    apply_model_tool_choice(
        &mut body,
        tools,
        tool_choice,
        ToolChoiceProtocol::OpenAiChat,
    )?;
    let client = provider_http_client(streaming)?;
    let route = providers::registry::require_route(&provider.route_id)?;
    let route_hook = providers::registry::hosted_openai_route_hook(&provider.route_id);
    if let Some(route_hook) = route_hook {
        body = route_hook.decorate_request_body(body, provider, model)?;
    }
    apply_selected_reasoning_control(&mut body, provider, model);
    openai_chat::enforce_tool_choice_support(&mut body, capabilities.supports_tool_choice);
    if let Some(route_hook) = route_hook {
        let url = providers::transport::http::endpoint_url(provider, route_hook.endpoint_path())?;
        let request = route_hook.apply_request_headers(client.post(url), provider)?;
        return Ok(request.json(&body));
    }
    let url = providers::transport::http::chat_completions_url(provider)?;
    let request = apply_route_model_auth(client.post(url), provider, &route)?;
    Ok(request.json(&body))
}

pub(crate) fn apply_route_model_auth(
    builder: reqwest::blocking::RequestBuilder,
    provider: &NativeProviderProfile,
    route: &providers::types::ProviderRouteDescriptor,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    if providers::transport::auth::resolve_api_key(provider).is_none()
        && route.auth_kind.contains("none")
    {
        return Ok(builder);
    }
    providers::transport::auth::apply_model_auth(builder, provider)
}

pub(crate) fn apply_route_model_auth_async(
    builder: reqwest::RequestBuilder,
    provider: &NativeProviderProfile,
    route: &providers::types::ProviderRouteDescriptor,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    if providers::transport::auth::resolve_api_key(provider).is_none()
        && route.auth_kind.contains("none")
    {
        return Ok(builder);
    }
    providers::transport::auth::apply_model_auth_async(builder, provider)
}

pub(crate) fn route_uses_openai_responses(
    provider: &NativeProviderProfile,
    model: &str,
) -> AgentRuntimeResult<bool> {
    Ok(request_protocol_id(provider, model) == openai_responses::PROTOCOL_ID)
}

pub(crate) fn route_uses_anthropic_messages(
    provider: &NativeProviderProfile,
    model: &str,
) -> AgentRuntimeResult<bool> {
    Ok(request_protocol_id(provider, model) == anthropic_messages::PROTOCOL_ID)
}

pub(crate) fn route_uses_gemini_generate_content(
    provider: &NativeProviderProfile,
    model: &str,
) -> AgentRuntimeResult<bool> {
    Ok(request_protocol_id(provider, model) == gemini_generate_content::PROTOCOL_ID)
}

pub(crate) fn route_uses_aws_bedrock_converse(
    provider: &NativeProviderProfile,
) -> AgentRuntimeResult<bool> {
    let route = providers::registry::require_route(&provider.route_id)?;
    Ok(route.protocol_id == aws_bedrock_converse::PROTOCOL_ID)
}

pub(crate) fn route_uses_ollama_chat(provider: &NativeProviderProfile) -> AgentRuntimeResult<bool> {
    let route = providers::registry::require_route(&provider.route_id)?;
    Ok(route.protocol_id == ollama_chat::PROTOCOL_ID)
}

pub(crate) fn lyra_request_context(messages: &[Value]) -> Option<&Value> {
    messages
        .first()
        .and_then(|message| message.get("lyraRequestContext"))
}

pub(crate) fn request_prompt_cache_base_enabled(messages: &[Value]) -> bool {
    let Some(context) = lyra_request_context(messages) else {
        return false;
    };
    let rejected = (|| {
        let provider_id = context.get("providerId")?.as_str()?;
        let route_id = context.get("routeId")?.as_str()?;
        let model = context.get("model")?.as_str()?;
        rejected_prompt_cache_profiles()
            .lock()
            .ok()
            .map(|profiles| {
                profiles.contains(&prompt_cache_profile_key(provider_id, route_id, model))
            })
    })()
    .unwrap_or(false);
    !rejected
        && context
            .get("promptCacheEnabled")
            .and_then(Value::as_bool)
            .unwrap_or(false)
}

pub(crate) fn request_prompt_cache_enabled(messages: &[Value], dialect_key: &str) -> bool {
    let Some(context) = lyra_request_context(messages) else {
        return false;
    };
    request_prompt_cache_base_enabled(messages)
        && context
            .get(dialect_key)
            .and_then(Value::as_bool)
            .unwrap_or(false)
}

pub(crate) fn build_openai_responses_request(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    let effective_tools = effective_tools(tools, tool_choice);
    let mut body = openai_responses::build_request_body(
        model,
        messages,
        effective_tools,
        streaming,
        openai_responses_request_options(messages)?,
    )?;
    apply_model_tool_choice(
        &mut body,
        tools,
        tool_choice,
        ToolChoiceProtocol::OpenAiResponses,
    )?;
    let client = provider_http_client(streaming)?;
    let url = providers::transport::http::endpoint_url(provider, openai_responses::ENDPOINT_PATH)?;
    let request = providers::transport::auth::apply_model_auth(client.post(url), provider)?;
    Ok(request.json(&body))
}

pub(crate) fn build_anthropic_messages_request(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    if providers::routes::mimo::is_mimo_route(&provider.route_id) {
        providers::routes::mimo::validate_thinking_replay(messages, model, tools)?;
    }
    let effective_tools = effective_tools(tools, tool_choice);
    let cache = request_prompt_cache_enabled(messages, "anthropicPromptCache");
    let mut body = anthropic_messages::build_request_body_with_options(
        model,
        messages,
        effective_tools,
        streaming,
        anthropic_messages::RequestOptions {
            cache_system: cache,
            cache_latest_user_text: cache,
        },
    )?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Anthropic)?;
    if providers::subscription::uses_claude_code_contract(&provider.route_id) {
        providers::subscription::apply_claude_code_contract(&mut body);
    }
    if providers::routes::mimo::is_anthropic_route(&provider.route_id) {
        let tool_calling = !tools.is_empty();
        providers::routes::mimo::apply_mimo_model_parameters(&mut body, model, tool_calling);
    }
    apply_selected_reasoning_control(&mut body, provider, model);
    let client = provider_http_client(streaming)?;
    let url =
        providers::transport::http::endpoint_url(provider, anthropic_messages::ENDPOINT_PATH)?;
    let request = anthropic_messages::apply_headers(client.post(url), provider)?;
    Ok(request.json(&body))
}

pub(crate) fn build_gemini_generate_content_request(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    let effective_tools = effective_tools(tools, tool_choice);
    let mut body = gemini_generate_content::build_request_body(messages, effective_tools)?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Gemini)?;
    apply_selected_reasoning_control(&mut body, provider, model);
    let client = provider_http_client(streaming)?;
    let path = if streaming {
        gemini_generate_content::stream_generate_content_path(model)?
    } else {
        gemini_generate_content::generate_content_path(model)?
    };
    let url = providers::transport::http::endpoint_url(provider, &path)?;
    let request = gemini_generate_content::apply_headers(client.post(url), provider)?;
    Ok(request.json(&body))
}

pub(crate) fn build_aws_bedrock_converse_request(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    let body = bedrock_request_body(messages, tools, tool_choice)?;
    let client = provider_http_client(false)?;
    let path = aws_bedrock_converse::converse_path(model)?;
    let url = providers::transport::http::endpoint_url(provider, &path)?;
    aws_bedrock_converse::build_signed_json_request(&client, provider, &url, &body)
}

pub(crate) fn build_aws_bedrock_converse_request_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    let body = bedrock_request_body(messages, tools, tool_choice)?;
    let client = provider_http_client_async(false)?;
    let url = providers::transport::http::endpoint_url(
        provider,
        &aws_bedrock_converse::converse_path(model)?,
    )?;
    aws_bedrock_converse::build_signed_json_request_async(&client, provider, &url, &body)
}

fn bedrock_request_body(
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
) -> AgentRuntimeResult<Value> {
    let effective_tools = effective_tools(tools, tool_choice);
    let cache = request_prompt_cache_enabled(messages, "bedrockPromptCache");
    let mut body = aws_bedrock_converse::build_request_body_with_options(
        messages,
        effective_tools,
        aws_bedrock_converse::RequestOptions {
            cache_system: cache,
            cache_latest_user: cache,
        },
    )?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Bedrock)?;
    Ok(body)
}

pub(crate) fn build_ollama_chat_request(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::blocking::RequestBuilder> {
    let effective_tools = effective_tools(tools, tool_choice);
    let mut body = ollama_chat::build_request_body(model, messages, effective_tools, streaming)?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Ollama)?;
    let client = provider_http_client(streaming)?;
    let url = providers::transport::http::endpoint_url(provider, ollama_chat::CHAT_ENDPOINT_PATH)?;
    let request = ollama_chat::apply_headers(client.post(url), provider)?;
    Ok(request.json(&body))
}

// ---- Async request builders (streaming hot path) ----

pub(crate) fn build_openai_compatible_request_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    if providers::routes::mimo::is_mimo_route(&provider.route_id) {
        providers::routes::mimo::validate_thinking_replay(messages, model, tools)?;
    }
    let effective_tools = effective_tools(tools, tool_choice);
    let capabilities =
        providers::model_capabilities::resolve_openai_chat_model_capabilities(provider, model);
    let wire_messages = openai_chat::wire_messages(
        messages,
        openai_chat::ReasoningReplayPolicy {
            field: capabilities.reasoning_replay_field,
            required_on_assistant_messages: capabilities
                .requires_reasoning_field_on_assistant_messages,
        },
    );
    let mut body =
        openai_chat::build_request_body(model, &wire_messages, effective_tools, streaming);
    apply_model_tool_choice(
        &mut body,
        tools,
        tool_choice,
        ToolChoiceProtocol::OpenAiChat,
    )?;
    let client = provider_http_client_async(streaming)?;
    let route = providers::registry::require_route(&provider.route_id)?;
    let route_hook = providers::registry::hosted_openai_route_hook(&provider.route_id);
    if let Some(route_hook) = route_hook {
        body = route_hook.decorate_request_body(body, provider, model)?;
    }
    apply_selected_reasoning_control(&mut body, provider, model);
    openai_chat::enforce_tool_choice_support(&mut body, capabilities.supports_tool_choice);
    if let Some(route_hook) = route_hook {
        let url = providers::transport::http::endpoint_url(provider, route_hook.endpoint_path())?;
        let request = route_hook.apply_request_headers_async(client.post(url), provider)?;
        return Ok(request.json(&body));
    }
    let url = providers::transport::http::chat_completions_url(provider)?;
    let request = apply_route_model_auth_async(client.post(url), provider, &route)?;
    Ok(request.json(&body))
}

pub(crate) fn build_openai_responses_request_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    let effective_tools = effective_tools(tools, tool_choice);
    let mut body = openai_responses::build_request_body(
        model,
        messages,
        effective_tools,
        streaming,
        openai_responses_request_options(messages)?,
    )?;
    apply_model_tool_choice(
        &mut body,
        tools,
        tool_choice,
        ToolChoiceProtocol::OpenAiResponses,
    )?;
    let client = provider_http_client_async(streaming)?;
    let url = providers::transport::http::endpoint_url(provider, openai_responses::ENDPOINT_PATH)?;
    let request = providers::transport::auth::apply_model_auth_async(client.post(url), provider)?;
    Ok(request.json(&body))
}

pub(crate) fn build_anthropic_messages_request_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    if providers::routes::mimo::is_mimo_route(&provider.route_id) {
        providers::routes::mimo::validate_thinking_replay(messages, model, tools)?;
    }
    let effective_tools = effective_tools(tools, tool_choice);
    let cache = request_prompt_cache_enabled(messages, "anthropicPromptCache");
    let mut body = anthropic_messages::build_request_body_with_options(
        model,
        messages,
        effective_tools,
        streaming,
        anthropic_messages::RequestOptions {
            cache_system: cache,
            cache_latest_user_text: cache,
        },
    )?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Anthropic)?;
    if providers::subscription::uses_claude_code_contract(&provider.route_id) {
        providers::subscription::apply_claude_code_contract(&mut body);
    }
    if providers::routes::mimo::is_anthropic_route(&provider.route_id) {
        let tool_calling = !tools.is_empty();
        providers::routes::mimo::apply_mimo_model_parameters(&mut body, model, tool_calling);
    }
    apply_selected_reasoning_control(&mut body, provider, model);
    let client = provider_http_client_async(streaming)?;
    let url =
        providers::transport::http::endpoint_url(provider, anthropic_messages::ENDPOINT_PATH)?;
    let request = anthropic_messages::apply_headers_async(client.post(url), provider)?;
    Ok(request.json(&body))
}

pub(crate) fn build_gemini_generate_content_request_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    let effective_tools = effective_tools(tools, tool_choice);
    let mut body = gemini_generate_content::build_request_body(messages, effective_tools)?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Gemini)?;
    apply_selected_reasoning_control(&mut body, provider, model);
    let client = provider_http_client_async(streaming)?;
    let path = if streaming {
        gemini_generate_content::stream_generate_content_path(model)?
    } else {
        gemini_generate_content::generate_content_path(model)?
    };
    let url = providers::transport::http::endpoint_url(provider, &path)?;
    let request = gemini_generate_content::apply_headers_async(client.post(url), provider)?;
    Ok(request.json(&body))
}

pub(crate) fn build_ollama_chat_request_async(
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    streaming: bool,
) -> AgentRuntimeResult<reqwest::RequestBuilder> {
    let effective_tools = effective_tools(tools, tool_choice);
    let mut body = ollama_chat::build_request_body(model, messages, effective_tools, streaming)?;
    apply_model_tool_choice(&mut body, tools, tool_choice, ToolChoiceProtocol::Ollama)?;
    let client = provider_http_client_async(streaming)?;
    let url = providers::transport::http::endpoint_url(provider, ollama_chat::CHAT_ENDPOINT_PATH)?;
    let request = ollama_chat::apply_headers_async(client.post(url), provider)?;
    Ok(request.json(&body))
}

#[derive(Clone, Copy)]
pub(crate) enum ToolChoiceProtocol {
    OpenAiChat,
    OpenAiResponses,
    Anthropic,
    Gemini,
    Bedrock,
    Ollama,
}

pub(crate) fn effective_tools<'a>(tools: &'a [Value], choice: &ModelToolChoice) -> &'a [Value] {
    if matches!(choice, ModelToolChoice::None) {
        &[]
    } else {
        tools
    }
}

pub(crate) fn apply_model_tool_choice(
    body: &mut Value,
    tools: &[Value],
    choice: &ModelToolChoice,
    protocol: ToolChoiceProtocol,
) -> AgentRuntimeResult<()> {
    // `Auto` with no tools means no tool section is being sent at all; writing
    // a `tool_choice` field alongside it 400s on several OpenAI-compatible
    // providers. The same applies to `None`: omitting the field is the
    // portable way to express "do not force a tool", so every protocol removes
    // it instead of serializing a protocol-specific "none".
    if matches!(choice, ModelToolChoice::Auto | ModelToolChoice::None) && tools.is_empty() {
        return Ok(());
    }
    let specific_name = match choice {
        ModelToolChoice::Specific { tool_name } => Some(tool_name.as_str()),
        _ => None,
    };
    if matches!(
        choice,
        ModelToolChoice::Required | ModelToolChoice::Specific { .. }
    ) && tools.is_empty()
    {
        return Err(AgentRuntimeError::Core(
            "provider tool choice requires at least one model tool".to_string(),
        ));
    }
    if let Some(name) = specific_name
        && !tools.iter().any(|tool| {
            tool.pointer("/function/name").and_then(Value::as_str) == Some(name)
                || tool.get("name").and_then(Value::as_str) == Some(name)
        })
    {
        return Err(AgentRuntimeError::Core(format!(
            "provider tool choice references an unavailable tool: {name}"
        )));
    }
    match protocol {
        ToolChoiceProtocol::OpenAiChat => {
            if matches!(choice, ModelToolChoice::None) {
                body.as_object_mut()
                    .map(|object| object.remove("tool_choice"));
                return Ok(());
            }
            body["tool_choice"] = match choice {
                ModelToolChoice::Auto => json!("auto"),
                ModelToolChoice::Required => json!("required"),
                ModelToolChoice::Specific { tool_name } => {
                    json!({ "type": "function", "function": { "name": tool_name } })
                }
                ModelToolChoice::None => unreachable!(),
            };
        }
        ToolChoiceProtocol::OpenAiResponses => {
            if matches!(choice, ModelToolChoice::None) {
                body.as_object_mut()
                    .map(|object| object.remove("tool_choice"));
                return Ok(());
            }
            body["tool_choice"] = match choice {
                ModelToolChoice::Auto => json!("auto"),
                ModelToolChoice::Required => json!("required"),
                ModelToolChoice::Specific { tool_name } => {
                    json!({ "type": "function", "name": tool_name })
                }
                ModelToolChoice::None => unreachable!(),
            };
        }
        ToolChoiceProtocol::Anthropic => match choice {
            ModelToolChoice::Auto => body["tool_choice"] = json!({ "type": "auto" }),
            ModelToolChoice::Required => body["tool_choice"] = json!({ "type": "any" }),
            ModelToolChoice::Specific { tool_name } => {
                body["tool_choice"] = json!({ "type": "tool", "name": tool_name })
            }
            ModelToolChoice::None => {
                body.as_object_mut()
                    .map(|object| object.remove("tool_choice"));
            }
        },
        ToolChoiceProtocol::Gemini => match choice {
            ModelToolChoice::None => {
                body.as_object_mut()
                    .map(|object| object.remove("toolConfig"));
            }
            ModelToolChoice::Auto => {
                body["toolConfig"] = json!({ "functionCallingConfig": { "mode": "AUTO" } });
            }
            ModelToolChoice::Required => {
                body["toolConfig"] = json!({ "functionCallingConfig": { "mode": "ANY" } });
            }
            ModelToolChoice::Specific { tool_name } => {
                body["toolConfig"] = json!({
                    "functionCallingConfig": {
                        "mode": "ANY",
                        "allowedFunctionNames": [tool_name]
                    }
                });
            }
        },
        ToolChoiceProtocol::Bedrock => {
            body["toolConfig"]["toolChoice"] = match choice {
                ModelToolChoice::Auto => json!({ "auto": {} }),
                ModelToolChoice::Required => json!({ "any": {} }),
                ModelToolChoice::Specific { tool_name } => {
                    json!({ "tool": { "name": tool_name } })
                }
                ModelToolChoice::None => Value::Null,
            };
            if matches!(choice, ModelToolChoice::None) {
                body.as_object_mut()
                    .map(|object| object.remove("toolConfig"));
            }
        }
        ToolChoiceProtocol::Ollama => {
            if matches!(choice, ModelToolChoice::None) {
                body.as_object_mut()
                    .map(|object| object.remove("tool_choice"));
                return Ok(());
            }
            body["tool_choice"] = match choice {
                ModelToolChoice::Auto => json!("auto"),
                ModelToolChoice::Required => json!("required"),
                ModelToolChoice::Specific { tool_name } => {
                    json!({ "type": "function", "function": { "name": tool_name } })
                }
                ModelToolChoice::None => unreachable!(),
            };
        }
    }
    Ok(())
}

pub(crate) fn openai_responses_request_options(
    messages: &[Value],
) -> AgentRuntimeResult<openai_responses::RequestOptions> {
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let request_context = lyra_request_context(messages);
    let configured_stateful = crate::native_backend::turns::env_bool_override(
        "LYRA_OPENAI_RESPONSES_STATEFUL_PROMPT_CONTRACT",
    )
    .unwrap_or(state.config.openai_responses_stateful_prompt_contract);
    let stateful = request_context
        .and_then(|context| context.pointer("/stateful/enabled"))
        .and_then(Value::as_bool)
        .unwrap_or(configured_stateful);
    let previous_response_id = stateful
        .then(|| {
            request_context
                .and_then(|context| context.pointer("/stateful/previousResponseId"))
                .and_then(Value::as_str)
                .map(str::to_string)
                .or_else(|| {
                    std::env::var("LYRA_OPENAI_RESPONSES_PREVIOUS_RESPONSE_ID")
                        .ok()
                        .map(|value| value.trim().to_string())
                        .filter(|value| !value.is_empty())
                })
        })
        .flatten();
    let prompt_cache_enabled = request_prompt_cache_base_enabled(messages);
    Ok(openai_responses::RequestOptions {
        reasoning_effort: selected_reasoning_effort_locked(&state, messages),
        verbosity: state.config.verbosity.clone(),
        service_tier: state.config.service_tier.clone(),
        prompt_cache_key: prompt_cache_enabled
            .then(|| {
                request_context
                    .and_then(|context| context.get("promptCacheKey"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .flatten(),
        explicit_prompt_cache: prompt_cache_enabled
            && request_context
                .and_then(|context| context.get("openaiExplicitPromptCache"))
                .and_then(Value::as_bool)
                .unwrap_or(false),
        store: stateful,
        previous_response_id,
        input_start: request_context
            .filter(|_| stateful)
            .and_then(|context| context.pointer("/stateful/inputStart"))
            .and_then(Value::as_u64)
            .map(|value| value as usize)
            .unwrap_or(0),
    })
}

fn request_protocol_id(provider: &NativeProviderProfile, model: &str) -> String {
    providers::wire_protocol::protocol_id_for(
        provider,
        providers::wire_protocol::api_npm_for(provider, model).as_deref(),
    )
}

fn request_protocol_id_locked(
    state: &NativeRuntimeState,
    provider: &NativeProviderProfile,
    model: &str,
) -> String {
    let model_entry = provider.models.iter().find(|item| item.id == model);
    let record = state
        .model_capabilities
        .get(&provider.id)
        .and_then(|records| records.get(model));
    providers::wire_protocol::protocol_id_for(
        provider,
        providers::wire_protocol::api_npm_from(model_entry, record),
    )
}

fn selected_reasoning_effort_locked(
    state: &NativeRuntimeState,
    messages: &[Value],
) -> Option<String> {
    let context = lyra_request_context(messages);
    let provider_id = context
        .and_then(|context| context.get("providerId"))
        .and_then(Value::as_str);
    let model = context
        .and_then(|context| context.get("model"))
        .and_then(Value::as_str);
    let provider = provider_id.and_then(|provider_id| state.config.providers.get(provider_id));
    let protocol_id = match (provider, model) {
        (Some(provider), Some(model)) => request_protocol_id_locked(state, provider, model),
        _ => openai_responses::PROTOCOL_ID.to_string(),
    };
    let route_id = context
        .and_then(|context| context.get("routeId"))
        .and_then(Value::as_str)
        .or_else(|| provider.map(|provider| provider.route_id.as_str()))
        .unwrap_or("");
    let control = provider_id.and_then(|provider_id| {
        model.and_then(|model| {
            state
                .model_capabilities
                .get(provider_id)
                .and_then(|records| records.get(model))
                .and_then(|record| record.reasoning_control.clone())
        })
    });
    let supports = provider.and_then(|provider| {
        model.and_then(|model| {
            provider
                .models
                .iter()
                .find(|item| item.id == model)
                .and_then(|item| item.supports_reasoning_effort)
        })
    });
    providers::reasoning_control::selected_if_allowed(
        state.config.reasoning_effort.as_deref(),
        &protocol_id,
        route_id,
        supports,
        control.as_ref(),
    )
}

fn apply_selected_reasoning_control(
    body: &mut Value,
    provider: &NativeProviderProfile,
    model: &str,
) {
    let protocol_id = request_protocol_id(provider, model);
    if protocol_id == openai_responses::PROTOCOL_ID {
        return;
    }
    let Ok(state) = state().lock() else {
        return;
    };
    let control = state
        .model_capabilities
        .get(&provider.id)
        .and_then(|records| records.get(model))
        .and_then(|record| record.reasoning_control.clone());
    let supports = provider
        .models
        .iter()
        .find(|item| item.id == model)
        .and_then(|item| item.supports_reasoning_effort);
    providers::reasoning_control::apply(
        body,
        &protocol_id,
        &provider.route_id,
        control.as_ref(),
        state.config.reasoning_effort.as_deref(),
        supports,
    );
}

pub(crate) fn parse_streaming_response_with_commit<R: BufRead>(
    reader: R,
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tools: &[Value],
    commit_assistant_text: bool,
    committed_any: &mut bool,
) -> AgentRuntimeResult<ModelReply> {
    let mut state = ProviderStreamState::default();
    let mut ui_message_id: Option<String> = None;

    let buffer_assistant_text = false;
    let allowed_tool_names = openai_chat::tool_name_set(tools);
    let started_at = Instant::now();
    let mut saw_done = false;

    for event in openai_chat::SseReader::new(reader) {
        if cancellation.is_cancelled()
            || (!session_id.is_empty()
                && !turn_id.is_empty()
                && turn_was_cancelled(session_id, turn_id))
        {
            *committed_any = state.committed_any;
            return Err(AgentRuntimeError::Cancelled);
        }
        if provider_streaming_total_deadline_exceeded(started_at) {
            *committed_any = state.committed_any;
            return Err(provider_streaming_total_timeout_error());
        }
        // A stall here (provider keeps the socket open but stops sending) is
        // bounded by the client's per-operation idle timeout configured in
        // `provider_http_client_builder`; it surfaces as a `reqwest::Error` whose
        // `is_timeout()` is true, classified below into a typed transport Timeout
        // that the caller's safe-retry / non-streaming fallback can recover from.
        let event = event.map_err(|error| {
            *committed_any = state.committed_any;
            error
        })?;
        let openai_chat::SseEvent::Data(value) = event else {
            saw_done = true;
            break;
        };
        if let Some(error) = value.get("error").filter(|error| !error.is_null()) {
            *committed_any = state.committed_any;
            return Err(providers::errors::stream_error(
                openai_chat::PROTOCOL_ID,
                error,
            ));
        }
        if let Err(error) = map_provider_stream_chunk(
            &value,
            &mut state,
            &mut ui_message_id,
            buffer_assistant_text,
            session_id,
            turn_id,
        ) {
            *committed_any = state.committed_any;
            return Err(error);
        }
    }
    if !saw_done {
        *committed_any = state.committed_any;
        return Err(AgentRuntimeError::ProviderTransport {
            kind: ProviderTransportKind::StreamInterrupted,
            detail: "provider SSE stream ended before the [DONE] terminal event".to_string(),
        });
    }
    // From here on every remaining failure (finalize/normalize/commit) happens
    // after all streaming increments have been applied, so the committed flag is
    // final for the rest of the function.
    *committed_any = state.committed_any;

    // Flush any held-back partial tag the scrubber kept across the final delta.
    // If it turned out not to be a real tag it surfaces as visible text; trailing
    // in-block reasoning is routed to the reasoning channel.
    let flushed = state.think_scrubber.flush();
    if !flushed.reasoning.is_empty() {
        state.reasoning_chars = state
            .reasoning_chars
            .saturating_add(flushed.reasoning.chars().count());
        state.reasoning_content.push_str(&flushed.reasoning);
        if emit_reasoning_delta(&flushed.reasoning, &mut ui_message_id, session_id, turn_id)? {
            state.committed_any = true;
        }
    }
    if !flushed.visible.is_empty() {
        let visible = crate::native_backend::tool_protocol::drain_textual_tool_markup(
            &mut state.visible_markup_hold,
            &flushed.visible,
        );
        if !visible.is_empty() {
            if !buffer_assistant_text
                && emit_visible_delta(&visible, &mut ui_message_id, session_id, turn_id)?
            {
                state.committed_any = true;
            }
            state.content.push_str(&visible);
        }
    }
    let markup_tail = crate::native_backend::tool_protocol::finish_textual_tool_markup(
        &mut state.visible_markup_hold,
    );
    if !markup_tail.is_empty() {
        if !buffer_assistant_text
            && emit_visible_delta(&markup_tail, &mut ui_message_id, session_id, turn_id)?
        {
            state.committed_any = true;
        }
        state.content.push_str(&markup_tail);
    }
    *committed_any = state.committed_any;

    let mut tool_calls =
        openai_chat::finalize_streaming_tool_calls(state.tool_calls, &allowed_tool_names).map_err(
            |error| match error {
                AgentRuntimeError::ProviderProtocol { kind, detail } => {
                    AgentRuntimeError::ProviderProtocol {
                        kind,
                        detail: format!(
                            "{detail} (stop reason: {})",
                            state.finish_reason.as_deref().unwrap_or("not supplied")
                        ),
                    }
                }
                other => other,
            },
        )?;
    tool_calls.sort_by_key(|(index, _)| *index);
    let tool_calls = tool_calls
        .into_iter()
        .map(|(_, call)| call)
        .collect::<Vec<_>>();

    if state.content.trim().is_empty()
        && tool_calls.is_empty()
        && state.finish_reason.as_deref() == Some("tool_calls")
    {
        return Err(AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::IncompleteToolCall,
            detail: "provider finished with tool_calls but returned no complete tool call"
                .to_string(),
        });
    }

    let streamed_message_id = ui_message_id.filter(|id| !id.is_empty());
    let raw_stop_reason = state.finish_reason.clone();
    let stop_signal = if state.saw_refusal {
        TurnStopSignal::Refusal
    } else {
        TurnStopSignal::from_raw(state.finish_reason.as_deref())
    };
    let provider_replay_items = state.reasoning_replay.into_items();
    let mut reply = ModelReply {
        content: (!state.content.trim().is_empty()).then_some(state.content),
        reasoning_content: (!state.reasoning_content.trim().is_empty())
            .then_some(state.reasoning_content),
        tool_calls,
        ui_message_id: streamed_message_id.clone(),
        raw_stop_reason,
        provider_replay_protocol: Some(openai_chat::PROTOCOL_ID.to_string()),
        provider_replay_items,
        response_meta: state.response_meta,
        stop_signal,
    };
    normalize_model_reply_protocol(&mut reply, tools)?;
    if commit_assistant_text {
        crate::native_backend::turns::commit_visible_assistant_reply(
            session_id,
            turn_id,
            &mut reply,
            &streamed_message_id,
        );
    } else {
        reply.ui_message_id = streamed_message_id;
    }
    Ok(reply)
}

pub(crate) async fn parse_streaming_response_with_commit_async(
    response: reqwest::Response,
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tools: &[Value],
    commit_assistant_text: bool,
    committed_any: &mut bool,
) -> AgentRuntimeResult<ModelReply> {
    let mut state = ProviderStreamState::default();
    let mut ui_message_id: Option<String> = None;

    let buffer_assistant_text = false;
    let allowed_tool_names = openai_chat::tool_name_set(tools);
    let started_at = Instant::now();
    let mut saw_done = false;

    let mut reader = openai_chat::AsyncSseReader::new(response.bytes_stream());
    while let Some(event) = reader.next_event(cancellation).await {
        if cancellation.is_cancelled()
            || (!session_id.is_empty()
                && !turn_id.is_empty()
                && turn_was_cancelled(session_id, turn_id))
        {
            *committed_any = state.committed_any;
            return Err(AgentRuntimeError::Cancelled);
        }
        if provider_streaming_total_deadline_exceeded(started_at) {
            *committed_any = state.committed_any;
            return Err(provider_streaming_total_timeout_error());
        }
        let event = event.map_err(|error| {
            *committed_any = state.committed_any;
            error
        })?;
        let openai_chat::SseEvent::Data(value) = event else {
            saw_done = true;
            break;
        };
        if let Some(error) = value.get("error").filter(|error| !error.is_null()) {
            *committed_any = state.committed_any;
            return Err(providers::errors::stream_error(
                openai_chat::PROTOCOL_ID,
                error,
            ));
        }
        if let Err(error) = map_provider_stream_chunk(
            &value,
            &mut state,
            &mut ui_message_id,
            buffer_assistant_text,
            session_id,
            turn_id,
        ) {
            *committed_any = state.committed_any;
            return Err(error);
        }
    }
    if !saw_done {
        *committed_any = state.committed_any;
        return Err(AgentRuntimeError::ProviderTransport {
            kind: ProviderTransportKind::StreamInterrupted,
            detail: "provider SSE stream ended before the [DONE] terminal event".to_string(),
        });
    }
    *committed_any = state.committed_any;

    let flushed = state.think_scrubber.flush();
    if !flushed.reasoning.is_empty() {
        state.reasoning_chars = state
            .reasoning_chars
            .saturating_add(flushed.reasoning.chars().count());
        state.reasoning_content.push_str(&flushed.reasoning);
        if emit_reasoning_delta(&flushed.reasoning, &mut ui_message_id, session_id, turn_id)? {
            state.committed_any = true;
        }
    }
    if !flushed.visible.is_empty() {
        let visible = crate::native_backend::tool_protocol::drain_textual_tool_markup(
            &mut state.visible_markup_hold,
            &flushed.visible,
        );
        if !visible.is_empty() {
            if !buffer_assistant_text
                && emit_visible_delta(&visible, &mut ui_message_id, session_id, turn_id)?
            {
                state.committed_any = true;
            }
            state.content.push_str(&visible);
        }
    }
    let markup_tail = crate::native_backend::tool_protocol::finish_textual_tool_markup(
        &mut state.visible_markup_hold,
    );
    if !markup_tail.is_empty() {
        if !buffer_assistant_text
            && emit_visible_delta(&markup_tail, &mut ui_message_id, session_id, turn_id)?
        {
            state.committed_any = true;
        }
        state.content.push_str(&markup_tail);
    }
    *committed_any = state.committed_any;

    let mut tool_calls =
        openai_chat::finalize_streaming_tool_calls(state.tool_calls, &allowed_tool_names).map_err(
            |error| match error {
                AgentRuntimeError::ProviderProtocol { kind, detail } => {
                    AgentRuntimeError::ProviderProtocol {
                        kind,
                        detail: format!(
                            "{detail} (stop reason: {})",
                            state.finish_reason.as_deref().unwrap_or("not supplied")
                        ),
                    }
                }
                other => other,
            },
        )?;
    tool_calls.sort_by_key(|(index, _)| *index);
    let tool_calls = tool_calls
        .into_iter()
        .map(|(_, call)| call)
        .collect::<Vec<_>>();

    if state.content.trim().is_empty()
        && tool_calls.is_empty()
        && state.finish_reason.as_deref() == Some("tool_calls")
    {
        return Err(AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::IncompleteToolCall,
            detail: "provider finished with tool_calls but returned no complete tool call"
                .to_string(),
        });
    }

    let streamed_message_id = ui_message_id.filter(|id| !id.is_empty());
    let raw_stop_reason = state.finish_reason.clone();
    let stop_signal = if state.saw_refusal {
        TurnStopSignal::Refusal
    } else {
        TurnStopSignal::from_raw(state.finish_reason.as_deref())
    };
    let provider_replay_items = state.reasoning_replay.into_items();
    let mut reply = ModelReply {
        content: (!state.content.trim().is_empty()).then_some(state.content),
        reasoning_content: (!state.reasoning_content.trim().is_empty())
            .then_some(state.reasoning_content),
        tool_calls,
        ui_message_id: streamed_message_id.clone(),
        raw_stop_reason,
        provider_replay_protocol: Some(openai_chat::PROTOCOL_ID.to_string()),
        provider_replay_items,
        response_meta: state.response_meta,
        stop_signal,
    };
    normalize_model_reply_protocol(&mut reply, tools)?;
    if commit_assistant_text {
        crate::native_backend::turns::commit_visible_assistant_reply(
            session_id,
            turn_id,
            &mut reply,
            &streamed_message_id,
        );
    } else {
        reply.ui_message_id = streamed_message_id;
    }
    Ok(reply)
}

pub(crate) fn provider_streaming_total_deadline_exceeded(started_at: Instant) -> bool {
    started_at.elapsed() > streaming_total_timeout()
}

pub(crate) fn provider_streaming_total_timeout_error() -> AgentRuntimeError {
    AgentRuntimeError::ProviderTransport {
        kind: ProviderTransportKind::Timeout,
        detail: format!(
            "provider streaming response exceeded total deadline of {} seconds",
            streaming_total_timeout().as_secs()
        ),
    }
}

/// One structured tool call is one id. A missing index does not mean "slot 0",
/// and a second id is not a name fragment of the call already in that slot.
fn streaming_tool_slot(state: &mut ProviderStreamState, chunk: &Value) -> usize {
    let index = chunk
        .get("index")
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    let id = chunk
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|id| openai_chat::is_valid_tool_call_id(id));
    if let Some(id) = id {
        if let Some(&slot) = state.tool_call_ids.get(id) {
            return slot;
        }
        if let Some(index) = index {
            let occupied_by_other = state
                .tool_calls
                .get(&index)
                .is_some_and(|call| call.id.as_deref().is_some_and(|current| current != id));
            if !occupied_by_other {
                state.tool_call_ids.insert(id.to_string(), index);
                return index;
            }
        }
        let slot = state
            .tool_calls
            .keys()
            .copied()
            .max()
            .map(|value| value.saturating_add(1))
            .unwrap_or(0);
        state.tool_call_ids.insert(id.to_string(), slot);
        return slot;
    }
    if let Some(index) = index {
        return index;
    }
    state.tool_calls.keys().copied().max().unwrap_or(0)
}

pub(crate) fn map_provider_stream_chunk(
    value: &Value,
    state: &mut ProviderStreamState,
    ui_message_id: &mut Option<String>,
    buffer_assistant_text: bool,
    session_id: &str,
    turn_id: &str,
) -> AgentRuntimeResult<()> {
    state.response_meta.merge(openai_chat_response_meta(value));
    let Some(choices) = value.get("choices").and_then(Value::as_array) else {
        return Ok(());
    };
    let Some(first_choice) = choices.first() else {
        return Ok(());
    };
    let selected_index = first_choice.get("index").and_then(Value::as_u64);
    for (_, choice) in choices.iter().enumerate().filter(|(position, choice)| {
        *position == 0
            || selected_index
                .is_some_and(|index| choice.get("index").and_then(Value::as_u64) == Some(index))
    }) {
        state.saw_choice = true;
        if let Some(finish_reason) = choice.get("finish_reason").and_then(Value::as_str)
            && !finish_reason.trim().is_empty()
        {
            state.finish_reason = Some(finish_reason.to_string());
        }
        let delta = choice.get("delta").unwrap_or(&Value::Null);
        if delta
            .get("refusal")
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim().is_empty())
        {
            state.saw_refusal = true;
        }
        if let Some(raw_text) = openai_chat::message_content(delta.get("content"))
            && !raw_text.is_empty()
        {
            // Strip inline <think>…</think> reasoning before it can reach the visible
            // message. Reasoning-model providers (DeepSeek/Qwen/MiniMax/Kimi) inline
            // reasoning into `content`; without this it leaks into the chat and also
            // poisons the missing-tool-call heuristic downstream. The scrubber is
            // stateful so a tag split across stream chunks is handled correctly.
            let scrubbed = state.think_scrubber.feed(&raw_text);
            if !scrubbed.reasoning.is_empty() {
                state.reasoning_chars = state
                    .reasoning_chars
                    .saturating_add(scrubbed.reasoning.chars().count());
                state.reasoning_content.push_str(&scrubbed.reasoning);
                if emit_reasoning_delta(&scrubbed.reasoning, ui_message_id, session_id, turn_id)? {
                    state.committed_any = true;
                }
            }
            if !scrubbed.visible.is_empty() {
                let visible = crate::native_backend::tool_protocol::drain_textual_tool_markup(
                    &mut state.visible_markup_hold,
                    &scrubbed.visible,
                );
                if !visible.is_empty() {
                    let candidate = format!("{}{}", state.content, visible);
                    if contains_leaked_internal_protocol_markers(&candidate) {
                        return Err(AgentRuntimeError::ProviderProtocol {
                            kind: ProviderProtocolFailureKind::TextualToolProtocolLeak,
                            detail:
                            "provider emitted textual tool protocol syntax instead of a structured tool call"
                                .to_string(),
                        });
                    }
                    if !buffer_assistant_text
                        && emit_visible_delta(&visible, ui_message_id, session_id, turn_id)?
                    {
                        state.committed_any = true;
                    }
                    state.content.push_str(&visible);
                }
            }
        }
        state.reasoning_replay.push(delta);
        if let Some(reasoning) = openai_chat::message_reasoning_text(delta) {
            state.reasoning_chars = state
                .reasoning_chars
                .saturating_add(reasoning.chars().count());
            state.reasoning_content.push_str(&reasoning);
            if emit_reasoning_delta(&reasoning, ui_message_id, session_id, turn_id)? {
                state.committed_any = true;
            }
        }
        if let Some(chunks) = delta.get("tool_calls").and_then(Value::as_array) {
            for chunk in chunks {
                let index = streaming_tool_slot(state, chunk);
                let accumulator = state.tool_calls.entry(index).or_default();
                if let Some(id) = chunk.get("id").and_then(Value::as_str)
                    && openai_chat::is_valid_tool_call_id(id)
                {
                    accumulator.id = Some(id.trim().to_string());
                }
                if let Some(name) = chunk.pointer("/function/name").and_then(Value::as_str)
                    && !name.trim().is_empty()
                {
                    accumulator.push_name_delta(name);
                }
                if let Some(arguments) =
                    chunk.pointer("/function/arguments").and_then(Value::as_str)
                {
                    accumulator.arguments.push_str(arguments);
                }
            }
            let preview_emitted =
                crate::native_backend::tools::maybe_emit_streaming_diff_previews_from_accumulators(
                    session_id,
                    turn_id,
                    &state.tool_calls,
                );
            // A streaming tool-call preview mutates session state (records a
            // preview activity), so a later transport failure is no longer safely
            // retryable. Only mark committed when a preview was actually emitted;
            // a throttled or skipped preview does not block safe retry / fallback.
            if preview_emitted {
                state.committed_any = true;
            }
        }
    }
    Ok(())
}

pub(crate) fn normalize_model_reply_protocol(
    reply: &mut ModelReply,
    tools: &[Value],
) -> AgentRuntimeResult<()> {
    let mut allowed_tool_names = openai_chat::tool_name_set(tools);
    if allowed_tool_names.is_empty() {
        allowed_tool_names = crate::native_backend::context::model_tool_names()
            .into_iter()
            .collect();
        for name in PROVIDER_VISIBLE_TOOL_NAMES {
            allowed_tool_names.insert(name.to_string());
        }
    }
    for call in &mut reply.tool_calls {
        if let Some(name) = openai_chat::repair_tool_name(&call.name, &allowed_tool_names) {
            call.name = name;
        }
    }
    if let Some(content) = reply.content.take() {
        reply.content = Some(openai_chat::scrub_tool_markup(&content));
    }
    if reply.stop_signal != TurnStopSignal::MaxTokens {
        openai_chat::validate_tool_call_arguments(&reply.tool_calls)?;
    }
    let Some(content) = reply.content.take() else {
        return Ok(());
    };
    if contains_leaked_internal_protocol_markers(&content) {
        return Err(AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::TextualToolProtocolLeak,
            detail: "provider emitted an internal Lyra protocol marker in visible text".to_string(),
        });
    }
    tool_protocol::validate_visible_assistant_text_protocol(&content)?;
    let sanitized = if reply.stop_signal == TurnStopSignal::MaxTokens {
        tool_protocol::sanitize_truncated_assistant_text(&content)
    } else {
        sanitize_visible_assistant_text(&content)
    };
    reply.content = sanitized;
    Ok(())
}

pub(crate) fn clear_failed_assistant_draft(session_id: &str, turn_id: &str) {
    if let Some(message_id) = active_ui_message_id(session_id, turn_id) {
        let committed_prefix = state()
            .lock()
            .ok()
            .and_then(|state| {
                state.sessions.get(session_id)?.snapshot["messages"]
                    .as_array()?
                    .iter()
                    .find(|message| message["id"] == message_id)
                    .map(|message| {
                        message.pointer("/metadata/providerPartial/retainOnRecovery")
                            == Some(&Value::Bool(true))
                    })
            })
            .unwrap_or(false);
        if !committed_prefix {
            let _ = remove_assistant_message(session_id, &message_id);
        }
    }
    clear_active_ui_message_id(session_id, turn_id);
}

pub(crate) fn model_capabilities(
    provider: &NativeProviderProfile,
    model: &str,
) -> ModelCapabilityProfile {
    let openai_chat =
        providers::model_capabilities::resolve_openai_chat_model_capabilities(provider, model);
    let profile = provider
        .models
        .iter()
        .find(|candidate| candidate.id == model);
    if let Some(profile) = profile {
        let capability_record = state().try_lock().ok().and_then(|state| {
            state
                .model_capabilities
                .get(&provider.id)
                .and_then(|records| records.get(model))
                .cloned()
        });
        let npm = providers::wire_protocol::api_npm_from(Some(profile), capability_record.as_ref())
            .map(str::to_string)
            .or_else(|| providers::models_dev::cached_api_npm(&provider.route_id, model));
        let protocol_id = providers::wire_protocol::protocol_id_for(provider, npm.as_deref());
        let resolved = |key: &str, fallback: bool| {
            providers::model_capabilities::effective_capability_for_model(
                capability_record.as_ref(),
                &protocol_id,
                &provider.route_id,
                model,
                key,
                fallback,
            )
        };
        return ModelCapabilityProfile {
            supports_image_input: resolved(
                providers::model_capabilities::INPUT_IMAGE,
                profile.supports_image_input,
            ),
            supports_tool_calling: resolved(
                providers::model_capabilities::FEATURE_TOOL_CALLING,
                profile.supports_tool_calling,
            ),
            supports_streaming: resolved(
                providers::model_capabilities::FEATURE_STREAMING,
                profile.supports_streaming,
            ),
            supports_tool_choice: resolved(
                providers::model_capabilities::FEATURE_TOOL_CHOICE,
                openai_chat.supports_tool_choice,
            ),
            context_window: capability_record
                .and_then(|record| record.context_window_override)
                .or(profile.context_window),
        };
    }
    let route = providers::registry::require_route(&provider.route_id).ok();
    let discovered = providers::model_capabilities::discovered_model(
        model.to_string(),
        Some(model.to_string()),
        None,
        route.as_ref(),
        None,
    );
    ModelCapabilityProfile {
        supports_image_input: discovered.supports_image_input,
        supports_tool_calling: discovered.supports_tool_calling,
        supports_streaming: discovered.supports_streaming,
        supports_tool_choice: openai_chat.supports_tool_choice,
        context_window: discovered.context_window,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_model(id: &str, supports_reasoning_effort: Option<bool>) -> NativeProviderModel {
        NativeProviderModel {
            id: id.to_string(),
            supports_reasoning_effort,
            ..NativeProviderModel::default()
        }
    }

    fn sample_provider(
        id: &str,
        route_id: &str,
        model: NativeProviderModel,
    ) -> NativeProviderProfile {
        NativeProviderProfile {
            id: id.to_string(),
            label: id.to_string(),
            route_id: route_id.to_string(),
            base_url: Some("https://example.com".to_string()),
            default_model: Some(model.id.clone()),
            api_key: Some("test-key".to_string()),
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: vec![model],
        }
    }

    fn effort_control(values: &[&str]) -> NativeReasoningControl {
        NativeReasoningControl {
            kind: NativeReasoningKind::Effort,
            values: values.iter().map(|value| (*value).to_string()).collect(),
            budget_min: None,
            budget_max: None,
        }
    }

    fn with_selected_effort<T>(
        provider: &NativeProviderProfile,
        control: NativeReasoningControl,
        effort: &str,
        body: impl FnOnce() -> T,
    ) -> T {
        static CONFIG_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
        let _guard = CONFIG_TEST_LOCK
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let model_id = provider.models[0].id.clone();
        let mut locked = state().lock().expect("state lock");
        let previous_effort = locked.config.reasoning_effort.clone();
        let previous_record = locked.model_capabilities.get(&provider.id).cloned();
        locked.config.reasoning_effort = Some(effort.to_string());
        locked
            .model_capabilities
            .entry(provider.id.clone())
            .or_default()
            .insert(
                model_id,
                NativeModelCapabilityRecord {
                    reasoning_control: Some(control),
                    ..NativeModelCapabilityRecord::default()
                },
            );
        drop(locked);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(body));
        let mut locked = state().lock().expect("state lock");
        locked.config.reasoning_effort = previous_effort;
        match previous_record {
            Some(record) => {
                locked
                    .model_capabilities
                    .insert(provider.id.clone(), record);
            }
            None => {
                locked.model_capabilities.remove(&provider.id);
            }
        }
        drop(locked);
        match result {
            Ok(value) => value,
            Err(payload) => std::panic::resume_unwind(payload),
        }
    }

    #[test]
    fn selected_effort_is_written_on_chat_anthropic_and_gemini_bodies() {
        let chat = sample_provider(
            "test-reasoning-chat",
            providers::routes::custom_openai_compatible::ROUTE_ID,
            sample_model("gpt-test", Some(true)),
        );
        with_selected_effort(&chat, effort_control(&["low", "high"]), "high", || {
            let mut body = json!({ "model": "gpt-test" });
            apply_selected_reasoning_control(&mut body, &chat, "gpt-test");
            assert_eq!(body["reasoning_effort"], "high");
        });

        let anthropic = sample_provider(
            "test-reasoning-anthropic",
            providers::routes::anthropic::ROUTE_ID,
            sample_model("claude-test", None),
        );
        with_selected_effort(
            &anthropic,
            effort_control(&["none", "high"]),
            "high",
            || {
                let mut body = json!({ "model": "claude-test" });
                apply_selected_reasoning_control(&mut body, &anthropic, "claude-test");
                assert_eq!(body["thinking"]["type"], "adaptive");
                assert_eq!(body["effort"], "high");
            },
        );

        let gemini = sample_provider(
            "test-reasoning-gemini",
            providers::routes::google_gemini::ROUTE_ID,
            sample_model("gemini-test", None),
        );
        with_selected_effort(
            &gemini,
            effort_control(&["minimal", "high"]),
            "high",
            || {
                let mut body = json!({ "contents": [] });
                apply_selected_reasoning_control(&mut body, &gemini, "gemini-test");
                assert_eq!(
                    body["generationConfig"]["thinkingConfig"]["thinkingLevel"],
                    "high"
                );
            },
        );
    }

    #[test]
    fn responses_options_drop_effort_values_the_model_does_not_advertise() {
        let provider = sample_provider(
            "test-reasoning-responses",
            providers::routes::openai::ROUTE_ID,
            sample_model("o3", None),
        );
        with_selected_effort(
            &provider,
            effort_control(&["low", "medium", "high"]),
            "xhigh",
            || {
                let messages = [json!({
                    "lyraRequestContext": {
                        "providerId": "test-reasoning-responses",
                        "routeId": "openai",
                        "model": "o3"
                    }
                })];
                let options = openai_responses_request_options(&messages).expect("options");
                assert_eq!(options.reasoning_effort, None);
            },
        );
    }

    #[test]
    fn mimo_chat_wire_preserves_reasoning_tool_history_and_explicit_thinking_toggle() {
        let provider = sample_provider(
            "test-mimo-wire-history",
            providers::routes::mimo::TOKEN_PLAN_CN_ROUTE_ID,
            sample_model("mimo-v2.6-flash", Some(true)),
        );
        let control = NativeReasoningControl {
            kind: NativeReasoningKind::Toggle,
            values: vec!["none".to_string(), "high".to_string()],
            budget_min: None,
            budget_max: None,
        };
        let messages = vec![
            json!({"role":"user", "content":"Make the selected phrase bold"}),
            json!({"role":"assistant", "content":null, "reasoning_content":"fixture reasoning 1",
                "tool_calls":[{"id":"call-1","type":"function","function":{"name":"browser_press","arguments":"{}"}}]}),
            json!({"role":"tool", "tool_call_id":"call-1", "content":"target_not_visible", "lyraToolStatus":"failed"}),
            json!({"role":"assistant", "content":"Retrying the editor", "reasoning_content":"fixture reasoning 2",
                "tool_calls":[{"id":"call-2","type":"function","function":{"name":"browser_press","arguments":"{}"}}]}),
            json!({"role":"tool", "tool_call_id":"call-2", "content":"formats.bold: true"}),
            json!({"role":"assistant", "content":"Evidence: the editor reported formats.bold: true", "reasoning_content":"fixture final reasoning"}),
            json!({"role":"user", "content":"Continue"}),
        ];
        let tools = vec![
            json!({"type":"function","function":{"name":"browser_press","parameters":{"type":"object","properties":{}}}}),
        ];
        for (effort, thinking) in [("none", "disabled"), ("high", "enabled")] {
            with_selected_effort(&provider, control.clone(), effort, || {
                let request = build_openai_compatible_request(
                    &provider,
                    "mimo-v2.6-flash",
                    &messages,
                    &tools,
                    &ModelToolChoice::Auto,
                    true,
                )
                .expect("MiMo sync request")
                .build()
                .expect("request body");
                let body: Value =
                    serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap();
                let async_request = build_openai_compatible_request_async(
                    &provider,
                    "mimo-v2.6-flash",
                    &messages,
                    &tools,
                    &ModelToolChoice::Auto,
                    true,
                )
                .expect("MiMo async request")
                .build()
                .expect("async request body");
                let async_body: Value =
                    serde_json::from_slice(async_request.body().unwrap().as_bytes().unwrap())
                        .unwrap();
                assert_eq!(body, async_body);
                assert_eq!(body["thinking"]["type"], thinking);
                assert_eq!(body["tool_choice"], "auto");
                assert!(body.get("reasoning_effort").is_none());
                for index in [1, 3, 5] {
                    assert_eq!(
                        body["messages"][index]["reasoning_content"],
                        messages[index]["reasoning_content"]
                    );
                    assert_eq!(
                        body["messages"][index]["content"],
                        messages[index]["content"].as_str().unwrap_or_default()
                    );
                }
                assert_eq!(body["messages"][1]["tool_calls"], messages[1]["tool_calls"]);
                assert!(body["messages"][2].get("lyraToolStatus").is_none());
            });
        }
    }
}
