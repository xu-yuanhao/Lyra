use crate::{
    AgentRuntimeResult,
    native_backend::{NativeProviderModel, NativeProviderProfile},
};

use super::{
    super::{protocol, types::ProviderRouteDescriptor},
    RouteModelDiscoveryHook, hosted_openai,
};

pub(crate) const ROUTE_ID: &str = "atria";
pub(crate) const ANTHROPIC_ROUTE_ID: &str = "atria_anthropic";
pub(crate) const DEFAULT_BASE_URL: &str = "https://api.atria-asi.ai/v1";

const ENDPOINTS: hosted_openai::SharedModelListEndpoints =
    hosted_openai::SharedModelListEndpoints {
        openai_route_id: ROUTE_ID,
        openai_base_url: DEFAULT_BASE_URL,
        anthropic_route_id: ANTHROPIC_ROUTE_ID,
    };

static MODEL_DISCOVERY_HOOK: AtriaModelDiscoveryHook = AtriaModelDiscoveryHook;

pub(crate) fn route_descriptors() -> Vec<ProviderRouteDescriptor> {
    [ROUTE_ID, ANTHROPIC_ROUTE_ID]
        .into_iter()
        .map(descriptor_for)
        .collect()
}

pub(crate) fn model_discovery_hook() -> &'static dyn RouteModelDiscoveryHook {
    &MODEL_DISCOVERY_HOOK
}

fn descriptor_for(route_id: &str) -> ProviderRouteDescriptor {
    let (label, description, protocol_id, protocol_family, api_method, auth_kind) = match route_id {
        ROUTE_ID => (
            "Atria ASI",
            "Atria Dawn OpenAI-compatible endpoint.",
            protocol::openai_chat_completions::PROTOCOL_ID,
            protocol::openai_chat_completions::PROTOCOL_FAMILY,
            "chatCompletions",
            "bearer",
        ),
        ANTHROPIC_ROUTE_ID => (
            "Atria ASI (Anthropic)",
            "Atria Dawn Anthropic-compatible Messages endpoint.",
            protocol::anthropic_messages::PROTOCOL_ID,
            protocol::anthropic_messages::PROTOCOL_FAMILY,
            "messages",
            "x-api-key",
        ),
        _ => unreachable!("unsupported Atria route id"),
    };

    ProviderRouteDescriptor {
        id: route_id.to_string(),
        provider_id: "atria".to_string(),
        protocol_id: protocol_id.to_string(),
        protocol_family: protocol_family.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        default_base_url: Some(DEFAULT_BASE_URL.to_string()),
        api_method: api_method.to_string(),
        auth_kind: auth_kind.to_string(),
        runtime_supported: true,
        model_discovery_supported: true,
        custom_headers_supported: false,
        local_backend: None,
        catalog_section: "hosted".to_string(),
        quick_setup_supported: true,
        supports_stateful_prompt_contract: false,
    }
}

struct AtriaModelDiscoveryHook;

impl RouteModelDiscoveryHook for AtriaModelDiscoveryHook {
    fn descriptor(&self) -> ProviderRouteDescriptor {
        descriptor_for(ROUTE_ID)
    }

    fn discover_models(
        &self,
        provider: &NativeProviderProfile,
    ) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
        hosted_openai::discover_models_via_openai_endpoint(provider, ENDPOINTS)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider(route_id: &str, base_url: &str) -> NativeProviderProfile {
        NativeProviderProfile {
            id: "atria-test".to_string(),
            label: "Atria Test".to_string(),
            route_id: route_id.to_string(),
            base_url: Some(base_url.to_string()),
            default_model: None,
            api_key_ref: None,
            api_key: Some("atr-test".to_string()),
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        }
    }

    #[test]
    fn routes_cover_chat_completions_and_messages_protocols() {
        let routes = route_descriptors();
        assert_eq!(routes.len(), 2);

        let openai_route = &routes[0];
        assert_eq!(openai_route.id, ROUTE_ID);
        assert_eq!(
            openai_route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(openai_route.api_method, "chatCompletions");
        assert_eq!(openai_route.auth_kind, "bearer");

        let anthropic_route = &routes[1];
        assert_eq!(anthropic_route.id, ANTHROPIC_ROUTE_ID);
        assert_eq!(
            anthropic_route.protocol_id,
            protocol::anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(anthropic_route.api_method, "messages");
        assert_eq!(anthropic_route.auth_kind, "x-api-key");
        assert_eq!(
            anthropic_route.default_base_url.as_deref(),
            Some(DEFAULT_BASE_URL)
        );
    }

    #[test]
    fn discovery_returns_only_the_models_the_endpoint_lists() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base_url = format!("http://{}/v1", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                .unwrap();
            let mut bytes = [0; 4096];
            let size = stream.read(&mut bytes).unwrap();
            let request = String::from_utf8_lossy(&bytes[..size]).to_ascii_lowercase();
            assert!(request.starts_with("get /v1/models http/1.1"), "{request}");
            assert!(
                request.contains("authorization: bearer atr-test"),
                "{request}"
            );
            let body = r#"{"data":[{"id":"Atria-Dawn"}]}"#;
            write!(
                stream,
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
            .unwrap();
        });

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .no_proxy()
            .build()
            .unwrap();
        let discovered = hosted_openai::discover_models_via_openai_endpoint_with_client(
            &client,
            &provider(ROUTE_ID, &base_url),
            ENDPOINTS,
        )
        .expect("discovery");
        server.join().unwrap();

        // A documented catalog must never invent a model the account cannot call.
        assert_eq!(
            discovered
                .iter()
                .map(|model| model.id.as_str())
                .collect::<Vec<_>>(),
            vec!["Atria-Dawn"]
        );
    }

    #[test]
    fn anthropic_route_discovers_through_the_openai_endpoint() {
        let discovery = hosted_openai::openai_endpoint_discovery_profile(
            &provider(ANTHROPIC_ROUTE_ID, "https://gateway.example/v1"),
            ENDPOINTS,
        );

        assert_eq!(discovery.route_id, ROUTE_ID);
        assert_eq!(discovery.base_url.as_deref(), Some(DEFAULT_BASE_URL));
        assert_eq!(discovery.auth_header, None);
    }
}
