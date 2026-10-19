use reqwest::{RequestBuilder as AsyncRequestBuilder, blocking::RequestBuilder};
use serde_json::Value;

use crate::{
    AgentRuntimeError, AgentRuntimeResult,
    native_backend::{NativeProviderModel, NativeProviderProfile},
};

use super::super::{
    protocol::openai_common::{self, ModelDiscoveryScope},
    transport,
    types::ProviderRouteDescriptor,
};

/// A vendor that serves one OpenAI-compatible model list for both its OpenAI
/// and Anthropic endpoints. The Messages route has no list of its own, so its
/// discovery always runs against the OpenAI base URL.
#[derive(Clone, Copy)]
pub(crate) struct SharedModelListEndpoints {
    pub(crate) openai_route_id: &'static str,
    pub(crate) openai_base_url: &'static str,
    pub(crate) anthropic_route_id: &'static str,
}

pub(crate) fn openai_endpoint_discovery_profile(
    provider: &NativeProviderProfile,
    endpoints: SharedModelListEndpoints,
) -> NativeProviderProfile {
    let base_url = if provider.route_id == endpoints.anthropic_route_id {
        endpoints.openai_base_url
    } else {
        provider
            .base_url
            .as_deref()
            .unwrap_or(endpoints.openai_base_url)
    };
    NativeProviderProfile {
        route_id: endpoints.openai_route_id.to_string(),
        base_url: Some(base_url.to_string()),
        auth_header: None,
        ..provider.clone()
    }
}

pub(crate) fn discover_models_via_openai_endpoint(
    provider: &NativeProviderProfile,
    endpoints: SharedModelListEndpoints,
) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    discover_models_via_openai_endpoint_with_client(&client, provider, endpoints)
}

pub(crate) fn discover_models_via_openai_endpoint_with_client(
    client: &reqwest::blocking::Client,
    provider: &NativeProviderProfile,
    endpoints: SharedModelListEndpoints,
) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
    let provider = openai_endpoint_discovery_profile(provider, endpoints);
    openai_common::discover_models(client, &provider, true, ModelDiscoveryScope::CompatibleText)
}

#[allow(dead_code)]
pub(crate) trait HostedOpenAiRouteHook: Sync {
    fn descriptor(&self) -> ProviderRouteDescriptor;

    fn endpoint_path(&self) -> &'static str {
        "chat/completions"
    }

    fn decorate_request_body(
        &self,
        body: Value,
        _provider: &NativeProviderProfile,
        _model: &str,
    ) -> AgentRuntimeResult<Value> {
        Ok(body)
    }

    fn apply_request_headers(
        &self,
        builder: RequestBuilder,
        provider: &NativeProviderProfile,
    ) -> AgentRuntimeResult<RequestBuilder> {
        transport::auth::apply_model_auth(builder, provider)
    }

    /// Async counterpart for the streaming hot path.  Default implementation
    /// delegates to `apply_model_auth_async`; overrides are unnecessary because
    /// every current impl uses the default.
    fn apply_request_headers_async(
        &self,
        builder: AsyncRequestBuilder,
        provider: &NativeProviderProfile,
    ) -> AgentRuntimeResult<AsyncRequestBuilder> {
        transport::auth::apply_model_auth_async(builder, provider)
    }

    fn discover_models(
        &self,
        provider: &NativeProviderProfile,
    ) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
        let descriptor = self.descriptor();
        if !descriptor.model_discovery_supported {
            return Err(AgentRuntimeError::Core(format!(
                "model discovery is not implemented for route {}",
                provider.route_id
            )));
        }
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let require_auth = !descriptor.auth_kind.contains("none");
        openai_common::discover_models(
            &client,
            provider,
            require_auth,
            ModelDiscoveryScope::CompatibleText,
        )
    }
}
