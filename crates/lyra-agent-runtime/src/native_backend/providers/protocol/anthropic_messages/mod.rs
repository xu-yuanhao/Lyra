mod request;
mod response;
mod stream;

use reqwest::{
    RequestBuilder as AsyncRequestBuilder,
    blocking::{Client, RequestBuilder},
    header::HeaderName,
};

use crate::{
    AgentRuntimeError, AgentRuntimeResult,
    native_backend::{
        NativeProviderModel, NativeProviderProfile,
        providers::{errors, model_capabilities, registry, transport},
    },
};

use super::super::types::ProtocolCatalogEntry;

pub(crate) const PROTOCOL_ID: &str = "anthropic_messages";
pub(crate) const PROTOCOL_FAMILY: &str = "anthropic_messages";
pub(crate) const ENDPOINT_PATH: &str = "messages";
pub(crate) const ANTHROPIC_VERSION: &str = "2023-06-01";
pub(crate) const DEFAULT_MAX_TOKENS: u64 = 4096;
pub(crate) const FIRST_PARTY_TOOL_SEARCH_BETA: &str = "advanced-tool-use-2025-11-20";
pub(crate) const VERTEX_TOOL_SEARCH_BETA: &str = "advanced-tool-use-2025-11-20";

/// Claude Code `betas.ts` split: first-party and Vertex send `anthropic-beta`;
/// Bedrock Anthropic does not use that header (Converse/body betas instead).
pub(crate) fn tool_search_beta_header(provider: &NativeProviderProfile) -> Option<&'static str> {
    let route = provider.route_id.to_ascii_lowercase();
    if route.contains("bedrock") {
        return None;
    }
    let vertex = route.contains("vertex")
        || provider.models.iter().any(|model| {
            model
                .api_npm
                .as_deref()
                .is_some_and(|npm| npm.contains("google-vertex"))
        });
    Some(if vertex {
        VERTEX_TOOL_SEARCH_BETA
    } else {
        FIRST_PARTY_TOOL_SEARCH_BETA
    })
}

pub(crate) use request::{RequestOptions, build_request_body_with_options};
pub(crate) use response::parse_response_body;
pub(crate) use stream::parse_streaming_response;
pub(crate) use stream::parse_streaming_response_async;

pub(crate) fn catalog_entry() -> ProtocolCatalogEntry {
    ProtocolCatalogEntry {
        id: PROTOCOL_ID.to_string(),
        family: PROTOCOL_FAMILY.to_string(),
        label: "Anthropic Messages".to_string(),
        transport: "http_json_stream".to_string(),
        runtime_supported: true,
        streaming_supported: true,
        tool_calling_supported: true,
    }
}

pub(crate) fn apply_headers(
    builder: RequestBuilder,
    provider: &NativeProviderProfile,
) -> AgentRuntimeResult<RequestBuilder> {
    if super::super::subscription::is_subscription_route(&provider.route_id) {
        return transport::auth::apply_model_auth(builder, provider)
            .map(|builder| builder.header("anthropic-version", ANTHROPIC_VERSION));
    }
    let api_key = transport::auth::resolve_api_key(provider).ok_or_else(|| {
        errors::configuration_error(
            provider,
            format!("API key is not configured for provider {}", provider.label),
        )
    })?;
    let builder = builder.header("anthropic-version", ANTHROPIC_VERSION);
    let builder = if let Some(beta) = tool_search_beta_header(provider) {
        builder.header("anthropic-beta", beta)
    } else {
        builder
    };
    let Some(header_name) = provider
        .auth_header
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(builder.header("x-api-key", api_key));
    };
    let header_name = HeaderName::from_bytes(header_name.as_bytes()).map_err(|error| {
        AgentRuntimeError::Core(format!("invalid auth header `{header_name}`: {error}"))
    })?;
    Ok(builder.header(header_name, api_key))
}

/// Async counterpart of `apply_headers` for the streaming hot path.
pub(crate) fn apply_headers_async(
    builder: AsyncRequestBuilder,
    provider: &NativeProviderProfile,
) -> AgentRuntimeResult<AsyncRequestBuilder> {
    if super::super::subscription::is_subscription_route(&provider.route_id) {
        return transport::auth::apply_model_auth_async(builder, provider)
            .map(|builder| builder.header("anthropic-version", ANTHROPIC_VERSION));
    }
    let api_key = transport::auth::resolve_api_key(provider).ok_or_else(|| {
        errors::configuration_error(
            provider,
            format!("API key is not configured for provider {}", provider.label),
        )
    })?;
    let builder = builder.header("anthropic-version", ANTHROPIC_VERSION);
    let builder = if let Some(beta) = tool_search_beta_header(provider) {
        builder.header("anthropic-beta", beta)
    } else {
        builder
    };
    let Some(header_name) = provider
        .auth_header
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    else {
        return Ok(builder.header("x-api-key", api_key));
    };
    let header_name = HeaderName::from_bytes(header_name.as_bytes()).map_err(|error| {
        AgentRuntimeError::Core(format!("invalid auth header `{header_name}`: {error}"))
    })?;
    Ok(builder.header(header_name, api_key))
}

pub(crate) fn discover_models(
    client: &Client,
    provider: &NativeProviderProfile,
) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
    let url = transport::http::endpoint_url(provider, "models")?;
    let response = apply_headers(client.get(url), provider)?
        .send()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    if !status.is_success() {
        return Err(AgentRuntimeError::Core(format!(
            "provider model discovery failed with status {status}: {body}"
        )));
    }
    let mut models = body
        .get("data")
        .and_then(serde_json::Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|item| item.get("id").and_then(serde_json::Value::as_str))
        .filter(|id| is_supported_messages_model_id(id))
        .map(|id| {
            let route = registry::require_route(&provider.route_id).ok();
            model_capabilities::discovered_model(
                id,
                Some(id.to_string()),
                None,
                route.as_ref(),
                None,
            )
        })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.id.cmp(&right.id));
    models.dedup_by(|left, right| left.id == right.id);
    Ok(models)
}

fn is_supported_messages_model_id(id: &str) -> bool {
    let normalized = id.trim().to_ascii_lowercase();
    !normalized.is_empty() && normalized.starts_with("claude") && !normalized.contains("embed")
}

#[cfg(test)]
mod tests {
    use reqwest::blocking::Client;

    use crate::native_backend::{NativeProviderModel, ReasoningReplayField};

    use super::*;

    fn provider(auth_header: Option<&str>) -> NativeProviderProfile {
        NativeProviderProfile {
            id: "test".to_string(),
            label: "Test".to_string(),
            route_id: "custom_anthropic_compatible".to_string(),
            base_url: Some("https://example.com/v1".to_string()),
            default_model: Some("claude-test".to_string()),
            api_key_ref: None,
            api_key: Some("sk-test".to_string()),
            api_key_env: None,
            auth_header: auth_header.map(str::to_string),
            embedding_model: None,
            models: vec![NativeProviderModel {
                id: "claude-test".to_string(),
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
            }],
        }
    }

    #[test]
    fn applies_default_anthropic_headers() {
        let request = apply_headers(
            Client::new().post("https://example.com/v1/messages"),
            &provider(None),
        )
        .expect("headers")
        .build()
        .expect("request");

        assert_eq!(
            request
                .headers()
                .get("x-api-key")
                .and_then(|value| value.to_str().ok()),
            Some("sk-test")
        );
        assert_eq!(
            request
                .headers()
                .get("anthropic-version")
                .and_then(|value| value.to_str().ok()),
            Some(ANTHROPIC_VERSION)
        );
        assert_eq!(
            request
                .headers()
                .get("anthropic-beta")
                .and_then(|value| value.to_str().ok()),
            Some(FIRST_PARTY_TOOL_SEARCH_BETA)
        );
    }

    #[test]
    fn bedrock_route_omits_tool_search_beta_header() {
        let mut bedrock = provider(None);
        bedrock.route_id = "aws_bedrock".to_string();
        let request = apply_headers(
            Client::new().post("https://example.com/v1/messages"),
            &bedrock,
        )
        .expect("headers")
        .build()
        .expect("request");
        assert!(request.headers().get("anthropic-beta").is_none());
    }

    #[test]
    fn applies_custom_anthropic_auth_header() {
        let request = apply_headers(
            Client::new().post("https://example.com/v1/messages"),
            &provider(Some("api-key")),
        )
        .expect("headers")
        .build()
        .expect("request");

        assert_eq!(
            request
                .headers()
                .get("api-key")
                .and_then(|value| value.to_str().ok()),
            Some("sk-test")
        );
        assert!(request.headers().get("x-api-key").is_none());
    }
}
