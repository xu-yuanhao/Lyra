use crate::{
    AgentRuntimeResult,
    native_backend::{NativeProviderModel, NativeProviderProfile},
};

use super::{
    super::{protocol, types::ProviderRouteDescriptor},
    RouteModelDiscoveryHook, hosted_openai,
};

pub(crate) const ROUTE_ID: &str = "intern_token_plan";
pub(crate) const ANTHROPIC_ROUTE_ID: &str = "intern_anthropic_token_plan";
pub(crate) const DEFAULT_BASE_URL: &str = "https://discovery-api.intern-ai.org.cn/v1";
pub(crate) const ANTHROPIC_BASE_URL: &str = "https://discovery-api.intern-ai.org.cn";

const ENDPOINTS: hosted_openai::SharedModelListEndpoints =
    hosted_openai::SharedModelListEndpoints {
        openai_route_id: ROUTE_ID,
        openai_base_url: DEFAULT_BASE_URL,
        anthropic_route_id: ANTHROPIC_ROUTE_ID,
    };

static MODEL_DISCOVERY_HOOK: InternModelDiscoveryHook = InternModelDiscoveryHook;

pub(crate) fn route_descriptors() -> Vec<ProviderRouteDescriptor> {
    [ROUTE_ID, ANTHROPIC_ROUTE_ID]
        .into_iter()
        .map(descriptor_for)
        .collect()
}

pub(crate) fn model_discovery_hook() -> &'static dyn RouteModelDiscoveryHook {
    &MODEL_DISCOVERY_HOOK
}

pub(crate) fn is_anthropic_route(route_id: &str) -> bool {
    route_id == ANTHROPIC_ROUTE_ID
}

fn descriptor_for(route_id: &str) -> ProviderRouteDescriptor {
    let (label, description, base_url, protocol_id, protocol_family, api_method, auth_kind) =
        match route_id {
            ROUTE_ID => (
                "Intern TokenPlan",
                "Intern InkStone TokenPlan OpenAI-compatible endpoint.",
                DEFAULT_BASE_URL,
                protocol::openai_chat_completions::PROTOCOL_ID,
                protocol::openai_chat_completions::PROTOCOL_FAMILY,
                "chatCompletions",
                "bearer",
            ),
            ANTHROPIC_ROUTE_ID => (
                "Intern TokenPlan (Anthropic)",
                "Intern InkStone TokenPlan Anthropic-compatible Messages endpoint.",
                ANTHROPIC_BASE_URL,
                protocol::anthropic_messages::PROTOCOL_ID,
                protocol::anthropic_messages::PROTOCOL_FAMILY,
                "messages",
                "x-api-key",
            ),
            _ => unreachable!("unsupported Intern TokenPlan route id"),
        };

    ProviderRouteDescriptor {
        id: route_id.to_string(),
        provider_id: "intern".to_string(),
        protocol_id: protocol_id.to_string(),
        protocol_family: protocol_family.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        default_base_url: Some(base_url.to_string()),
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

struct InternModelDiscoveryHook;

impl RouteModelDiscoveryHook for InternModelDiscoveryHook {
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
            id: "intern-test".to_string(),
            label: "Intern Test".to_string(),
            route_id: route_id.to_string(),
            base_url: Some(base_url.to_string()),
            default_model: None,
            api_key_ref: None,
            api_key: Some("tp-test".to_string()),
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
        assert_eq!(openai_route.provider_id, "intern");
        assert_eq!(
            openai_route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            openai_route.default_base_url.as_deref(),
            Some(DEFAULT_BASE_URL)
        );
        assert_eq!(openai_route.auth_kind, "bearer");

        let anthropic_route = &routes[1];
        assert_eq!(
            anthropic_route.protocol_id,
            protocol::anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(anthropic_route.api_method, "messages");
        assert_eq!(anthropic_route.auth_kind, "x-api-key");
        assert_eq!(
            anthropic_route.default_base_url.as_deref(),
            Some(ANTHROPIC_BASE_URL),
            "the documented Anthropic base has no /v1 segment; endpoint_url adds it"
        );
        assert!(is_anthropic_route(anthropic_route.id.as_str()));
        assert!(!is_anthropic_route(ROUTE_ID));
    }

    #[test]
    fn discovery_uses_the_bearer_models_path_for_both_protocols() {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = std::thread::spawn(move || {
            let mut requests = Vec::new();
            for _ in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                stream
                    .set_read_timeout(Some(std::time::Duration::from_secs(2)))
                    .unwrap();
                let mut bytes = [0; 4096];
                let size = stream.read(&mut bytes).unwrap();
                requests.push(String::from_utf8_lossy(&bytes[..size]).to_ascii_lowercase());
                let body =
                    r#"{"data":[{"id":"Atria-Dawn-Preview"},{"id":"deepseek-v4-pro-0813"}]}"#;
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                    body.len()
                )
                .unwrap();
            }
            requests
        });

        // Stand in for the two documented hosts: the OpenAI base carries `/v1`,
        // the Anthropic base does not.
        let local_openai_base: &'static str =
            Box::leak(format!("http://{address}/v1").into_boxed_str());
        let local_anthropic_base: &'static str =
            Box::leak(format!("http://{address}").into_boxed_str());
        let endpoints = hosted_openai::SharedModelListEndpoints {
            openai_route_id: ROUTE_ID,
            openai_base_url: local_openai_base,
            anthropic_route_id: ANTHROPIC_ROUTE_ID,
        };

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(2))
            .no_proxy()
            .build()
            .unwrap();
        let from_openai = hosted_openai::discover_models_via_openai_endpoint_with_client(
            &client,
            &provider(ROUTE_ID, local_openai_base),
            endpoints,
        )
        .expect("openai discovery");
        let from_anthropic = hosted_openai::discover_models_via_openai_endpoint_with_client(
            &client,
            &provider(ANTHROPIC_ROUTE_ID, local_anthropic_base),
            endpoints,
        )
        .expect("anthropic discovery");

        for request in server.join().unwrap() {
            assert!(request.starts_with("get /v1/models http/1.1"), "{request}");
            assert!(
                request.contains("authorization: bearer tp-test"),
                "{request}"
            );
        }
        // Both routes must report exactly the models the account can call.
        let expected = vec![
            "Atria-Dawn-Preview".to_string(),
            "deepseek-v4-pro-0813".to_string(),
        ];
        assert_eq!(
            from_openai
                .iter()
                .map(|model| model.id.clone())
                .collect::<Vec<_>>(),
            expected
        );
        assert_eq!(
            from_anthropic
                .iter()
                .map(|model| model.id.clone())
                .collect::<Vec<_>>(),
            expected
        );
    }

    #[test]
    fn anthropic_route_discovers_through_the_documented_openai_base() {
        let discovery = hosted_openai::openai_endpoint_discovery_profile(
            &provider(ANTHROPIC_ROUTE_ID, ANTHROPIC_BASE_URL),
            ENDPOINTS,
        );

        assert_eq!(discovery.route_id, ROUTE_ID);
        assert_eq!(discovery.base_url.as_deref(), Some(DEFAULT_BASE_URL));
        assert_eq!(discovery.auth_header, None);
    }
}
