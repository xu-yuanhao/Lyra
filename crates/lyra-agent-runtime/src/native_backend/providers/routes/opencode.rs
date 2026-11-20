use super::{
    super::{protocol, types::ProviderRouteDescriptor},
    RouteModelDiscoveryHook,
};
use crate::{
    AgentRuntimeError, AgentRuntimeResult,
    native_backend::{
        NativeProviderModel, NativeProviderProfile,
        providers::{model_capabilities, models_dev, transport, wire_protocol},
    },
};
use serde_json::Value;
use std::time::Duration;

pub(crate) const ZEN_ROUTE_ID: &str = "opencode_zen";
pub(crate) const GO_ROUTE_ID: &str = "opencode_go";
pub(crate) const ZEN_BASE_URL: &str = "https://opencode.ai/zen/v1";
pub(crate) const GO_BASE_URL: &str = "https://opencode.ai/zen/go/v1";
const IDENTITY_CLIENT: &str = "lyra";

static MODEL_DISCOVERY_HOOK: OpenCodeModelDiscoveryHook = OpenCodeModelDiscoveryHook;

pub(crate) fn route_descriptors() -> Vec<ProviderRouteDescriptor> {
    vec![descriptor_for(ZEN_ROUTE_ID), descriptor_for(GO_ROUTE_ID)]
}

pub(crate) fn model_discovery_hook() -> &'static dyn RouteModelDiscoveryHook {
    &MODEL_DISCOVERY_HOOK
}

pub(crate) fn effective_protocol_id(route_id: &str, api_npm: Option<&str>) -> Option<&'static str> {
    wire_protocol::route_protocol_id(route_id, api_npm)
}

pub(crate) fn effective_api_method(route_id: &str, api_npm: Option<&str>) -> Option<&'static str> {
    wire_protocol::route_api_method(route_id, api_npm)
}

pub(crate) fn uses_opencode_gateway(provider: &NativeProviderProfile) -> bool {
    matches!(provider.route_id.as_str(), ZEN_ROUTE_ID | GO_ROUTE_ID)
        || provider
            .base_url
            .as_deref()
            .is_some_and(|url| url.to_ascii_lowercase().contains("opencode.ai/zen"))
}

pub(crate) fn user_agent() -> String {
    format!(
        "Lyra/{}",
        option_env!("LYRA_COMPONENT_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
    )
}

pub(crate) fn apply_identity_headers(
    builder: reqwest::blocking::RequestBuilder,
    provider: &NativeProviderProfile,
    session_id: &str,
    request_id: &str,
) -> reqwest::blocking::RequestBuilder {
    let Some(headers) = identity_headers(provider, session_id, request_id) else {
        return builder;
    };
    let mut builder = builder;
    for (name, value) in headers {
        builder = builder.header(name, value);
    }
    builder
}

pub(crate) fn apply_identity_headers_async(
    builder: reqwest::RequestBuilder,
    provider: &NativeProviderProfile,
    session_id: &str,
    request_id: &str,
) -> reqwest::RequestBuilder {
    let Some(headers) = identity_headers(provider, session_id, request_id) else {
        return builder;
    };
    let mut builder = builder;
    for (name, value) in headers {
        builder = builder.header(name, value);
    }
    builder
}

fn identity_headers(
    provider: &NativeProviderProfile,
    session_id: &str,
    request_id: &str,
) -> Option<Vec<(&'static str, String)>> {
    if !uses_opencode_gateway(provider) {
        return None;
    }
    let mut headers = vec![
        ("User-Agent", user_agent()),
        ("x-opencode-client", IDENTITY_CLIENT.to_string()),
    ];
    // ponytail: `active_session_id` is only the fallback when the caller has no
    // turn session (memory agent, tests). Concurrent non-active sessions can
    // pick the wrong id; pass session_id from protocol_io to close that.
    let session = non_empty(session_id).or_else(active_session_fallback);
    if let Some(session) = session {
        headers.push(("x-opencode-session", session));
    }
    if let Some(request_id) = non_empty(request_id) {
        headers.push(("x-opencode-request", request_id));
    }
    Some(headers)
}

fn non_empty(value: &str) -> Option<String> {
    let value = value.trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn active_session_fallback() -> Option<String> {
    crate::native_backend::state()
        .try_lock()
        .ok()
        .and_then(|state| state.active_session_id.clone())
        .and_then(|id| non_empty(&id))
}

fn descriptor_for(route_id: &str) -> ProviderRouteDescriptor {
    let (label, description, default_base_url) = match route_id {
        ZEN_ROUTE_ID => (
            "OpenCode Zen",
            "OpenCode pay-as-you-go API with automatic per-model protocol routing.",
            ZEN_BASE_URL,
        ),
        GO_ROUTE_ID => (
            "OpenCode Go",
            "OpenCode subscription API with automatic per-model protocol routing.",
            GO_BASE_URL,
        ),
        _ => unreachable!("unsupported OpenCode route id"),
    };
    ProviderRouteDescriptor {
        id: route_id.to_string(),
        provider_id: route_id.to_string(),
        // OpenCode exposes one catalog backed by multiple wire protocols. Chat
        // Completions is the safe route-level default; requests and model catalog
        // entries use catalog `provider.npm` for their concrete model.
        protocol_id: protocol::openai_chat_completions::PROTOCOL_ID.to_string(),
        protocol_family: protocol::openai_chat_completions::PROTOCOL_FAMILY.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        default_base_url: Some(default_base_url.to_string()),
        api_method: "modelDependent".to_string(),
        auth_kind: "bearer".to_string(),
        runtime_supported: true,
        model_discovery_supported: true,
        custom_headers_supported: false,
        local_backend: None,
        catalog_section: "hosted".to_string(),
        quick_setup_supported: true,
        supports_stateful_prompt_contract: false,
    }
}

struct OpenCodeModelDiscoveryHook;

impl RouteModelDiscoveryHook for OpenCodeModelDiscoveryHook {
    fn descriptor(&self) -> ProviderRouteDescriptor {
        descriptor_for(ZEN_ROUTE_ID)
    }

    fn discover_models(
        &self,
        provider: &NativeProviderProfile,
    ) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
        let client = reqwest::blocking::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let url = transport::http::endpoint_url(provider, "models")?;
        let response = apply_identity_headers(
            transport::auth::apply_model_auth(client.get(url), provider)?,
            provider,
            "",
            "",
        )
        .send()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let status = response.status();
        let body: Value = response
            .json()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        if !status.is_success() {
            return Err(AgentRuntimeError::Core(format!(
                "OpenCode model discovery failed with status {status}: {body}"
            )));
        }
        let mut models = body
            .get("data")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(|item| item.get("id").and_then(Value::as_str))
            .filter(|id| !id.trim().is_empty())
            .map(|id| {
                let api_npm = models_dev::cached_api_npm(&provider.route_id, id);
                let mut route = descriptor_for(&provider.route_id);
                let protocol_id = effective_protocol_id(&provider.route_id, api_npm.as_deref())
                    .unwrap_or(protocol::openai_chat_completions::PROTOCOL_ID);
                route.protocol_id = protocol_id.to_string();
                route.protocol_family = protocol_id.to_string();
                let mut model = model_capabilities::discovered_model(
                    id,
                    Some(id.to_string()),
                    None,
                    Some(&route),
                    None,
                );
                model.api_npm = api_npm;
                model
            })
            .collect::<Vec<_>>();
        models.sort_by(|left, right| left.id.cmp(&right.id));
        models.dedup_by(|left, right| left.id == right.id);
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zen_and_go_select_protocol_from_catalog_npm() {
        assert_eq!(
            effective_protocol_id(ZEN_ROUTE_ID, Some("@ai-sdk/openai")),
            Some(protocol::openai_responses::PROTOCOL_ID)
        );
        assert_eq!(
            effective_protocol_id(ZEN_ROUTE_ID, Some("@ai-sdk/anthropic")),
            Some(protocol::anthropic_messages::PROTOCOL_ID)
        );
        assert_eq!(
            effective_protocol_id(ZEN_ROUTE_ID, Some("@ai-sdk/google")),
            Some(protocol::gemini_generate_content::PROTOCOL_ID)
        );
        assert_eq!(
            effective_protocol_id(ZEN_ROUTE_ID, None),
            Some(protocol::openai_chat_completions::PROTOCOL_ID)
        );
        assert_eq!(
            effective_protocol_id(GO_ROUTE_ID, Some("@ai-sdk/openai")),
            Some(protocol::openai_responses::PROTOCOL_ID)
        );
        assert_eq!(
            effective_protocol_id(GO_ROUTE_ID, None),
            Some(protocol::openai_chat_completions::PROTOCOL_ID)
        );
        assert_eq!(
            effective_api_method(ZEN_ROUTE_ID, Some("@ai-sdk/openai")),
            Some("responses")
        );
        assert_eq!(
            effective_protocol_id("openai", Some("@ai-sdk/openai")),
            None
        );
    }

    fn profile(route_id: &str, id: &str, base_url: Option<&str>) -> NativeProviderProfile {
        NativeProviderProfile {
            id: id.to_string(),
            label: id.to_string(),
            route_id: route_id.to_string(),
            base_url: base_url.map(str::to_string),
            default_model: None,
            api_key_ref: None,
            api_key: Some("public".to_string()),
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        }
    }

    fn header_map(
        provider: NativeProviderProfile,
        session_id: &str,
        request_id: &str,
    ) -> reqwest::header::HeaderMap {
        apply_identity_headers(
            reqwest::blocking::Client::new().get("https://opencode.ai/zen/v1/responses"),
            &provider,
            session_id,
            request_id,
        )
        .build()
        .expect("build request")
        .headers()
        .clone()
    }

    #[test]
    fn zen_identity_headers_use_lyra_ua_and_session() {
        let headers = header_map(
            profile(ZEN_ROUTE_ID, "opencode_zen", Some(ZEN_BASE_URL)),
            "session-lyra-1",
            "turn-2",
        );
        let ua = user_agent();
        assert_eq!(
            headers.get("user-agent").and_then(|v| v.to_str().ok()),
            Some(ua.as_str())
        );
        assert_eq!(
            headers
                .get("x-opencode-session")
                .and_then(|v| v.to_str().ok()),
            Some("session-lyra-1")
        );
        assert_eq!(
            headers
                .get("x-opencode-request")
                .and_then(|v| v.to_str().ok()),
            Some("turn-2")
        );
        assert_eq!(
            headers
                .get("x-opencode-client")
                .and_then(|v| v.to_str().ok()),
            Some("lyra")
        );
        assert!(user_agent().starts_with("Lyra/"));
        assert!(!user_agent().starts_with("opencode/"));
    }

    #[test]
    fn non_opencode_routes_do_not_get_identity_headers() {
        let headers = header_map(
            profile("openai", "openai", Some("https://api.openai.com/v1")),
            "session-lyra-1",
            "turn-2",
        );
        assert!(headers.get("x-opencode-session").is_none());
        assert!(headers.get("x-opencode-client").is_none());
    }
}
