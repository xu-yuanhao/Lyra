use crate::AgentRuntimeResult;

use super::{
    errors, protocol, routes,
    types::{ProtocolCatalogEntry, ProviderRouteDescriptor},
};

pub(crate) fn protocol_catalog() -> Vec<ProtocolCatalogEntry> {
    vec![
        protocol::openai_chat_completions::catalog_entry(),
        protocol::openai_responses::catalog_entry(),
        protocol::anthropic_messages::catalog_entry(),
        protocol::gemini_generate_content::catalog_entry(),
        protocol::ollama_chat::catalog_entry(),
        protocol::aws_bedrock_converse::catalog_entry(),
    ]
}

pub(crate) fn route_catalog() -> Vec<ProviderRouteDescriptor> {
    let mut routes = vec![
        routes::openai::descriptor(),
        routes::anthropic::descriptor(),
        routes::aws_bedrock::descriptor(),
        routes::google_gemini::descriptor(),
        routes::openrouter::descriptor(),
        routes::custom_openai_compatible::descriptor(),
        routes::custom_anthropic_compatible::descriptor(),
        routes::local_openai_compatible::descriptor(),
    ];
    routes.extend(routes::ollama::route_descriptors());
    routes.extend(routes::opencode::route_descriptors());
    routes.extend(routes::deepseek::route_descriptors());
    routes.extend(routes::glm::route_descriptors());
    routes.extend(routes::moonshot::route_descriptors());
    routes.extend(routes::volcengine::route_descriptors());
    routes.push(routes::nvidia::descriptor());
    routes.push(routes::amd::descriptor());
    routes.extend(routes::atria::route_descriptors());
    routes.push(routes::poolside::descriptor());
    routes.push(routes::bai::descriptor());
    routes.extend(routes::intern::route_descriptors());
    routes.extend(routes::mimo::route_descriptors());
    routes.extend([
        routes::lmstudio::descriptor(),
        routes::llama_cpp_server::descriptor(),
        routes::vllm::descriptor(),
    ]);
    routes.extend([
        routes::xai::descriptor(),
        routes::mistral::descriptor(),
        routes::groq::descriptor(),
        routes::cerebras::descriptor(),
        routes::cohere::descriptor(),
        routes::togetherai::descriptor(),
        routes::perplexity::descriptor(),
        routes::alibaba::descriptor(),
        routes::deepinfra::descriptor(),
        routes::venice::descriptor(),
    ]);
    routes.extend(routes::subscription::descriptors());
    routes
}

pub(crate) fn route_descriptor(route_id: &str) -> Option<ProviderRouteDescriptor> {
    route_catalog()
        .into_iter()
        .find(|route| route.id == route_id)
}

pub(crate) fn require_route(route_id: &str) -> AgentRuntimeResult<ProviderRouteDescriptor> {
    route_descriptor(route_id).ok_or_else(|| errors::unknown_route_error(route_id))
}

pub(crate) fn hosted_openai_route_hook(
    route_id: &str,
) -> Option<&'static dyn routes::HostedOpenAiRouteHook> {
    match route_id {
        routes::openrouter::ROUTE_ID => Some(routes::openrouter::hook()),
        routes::mimo::PAY_AS_YOU_GO_ROUTE_ID
        | routes::mimo::TOKEN_PLAN_CN_ROUTE_ID
        | routes::mimo::TOKEN_PLAN_SGP_ROUTE_ID
        | routes::mimo::TOKEN_PLAN_AMS_ROUTE_ID => routes::mimo::hook(route_id),
        routes::custom_openai_compatible::ROUTE_ID => {
            Some(routes::custom_openai_compatible::hook())
        }
        _ => None,
    }
}

pub(crate) fn route_model_discovery_hook(
    route_id: &str,
) -> Option<&'static dyn routes::RouteModelDiscoveryHook> {
    match route_id {
        routes::lmstudio::ROUTE_ID => Some(routes::lmstudio::model_discovery_hook()),
        routes::opencode::ZEN_ROUTE_ID | routes::opencode::GO_ROUTE_ID => {
            Some(routes::opencode::model_discovery_hook())
        }
        routes::mimo::PAY_AS_YOU_GO_ROUTE_ID
        | routes::mimo::TOKEN_PLAN_CN_ROUTE_ID
        | routes::mimo::TOKEN_PLAN_SGP_ROUTE_ID
        | routes::mimo::TOKEN_PLAN_AMS_ROUTE_ID
        | routes::mimo::ANTHROPIC_PAY_AS_YOU_GO_ROUTE_ID
        | routes::mimo::ANTHROPIC_TOKEN_PLAN_CN_ROUTE_ID
        | routes::mimo::ANTHROPIC_TOKEN_PLAN_SGP_ROUTE_ID
        | routes::mimo::ANTHROPIC_TOKEN_PLAN_AMS_ROUTE_ID => {
            Some(routes::mimo::model_discovery_hook())
        }
        routes::deepseek::OPENAI_ROUTE_ID | routes::deepseek::ANTHROPIC_ROUTE_ID => {
            Some(routes::deepseek::model_discovery_hook())
        }
        routes::volcengine::OPENAI_ROUTE_ID | routes::volcengine::ANTHROPIC_ROUTE_ID => {
            Some(routes::volcengine::model_discovery_hook())
        }
        routes::atria::ROUTE_ID | routes::atria::ANTHROPIC_ROUTE_ID => {
            Some(routes::atria::model_discovery_hook())
        }
        routes::intern::ROUTE_ID | routes::intern::ANTHROPIC_ROUTE_ID => {
            Some(routes::intern::model_discovery_hook())
        }
        routes::poolside::ROUTE_ID => Some(routes::poolside::model_discovery_hook()),
        route_id if routes::subscription::is_subscription_route(route_id) => {
            Some(subscription_discovery())
        }
        _ => None,
    }
}

struct SubscriptionDiscovery;

impl routes::RouteModelDiscoveryHook for SubscriptionDiscovery {
    fn descriptor(&self) -> super::types::ProviderRouteDescriptor {
        routes::subscription::descriptors()
            .into_iter()
            .next()
            .expect("subscription routes")
    }

    fn discover_models(
        &self,
        provider: &crate::native_backend::NativeProviderProfile,
    ) -> crate::AgentRuntimeResult<Vec<crate::native_backend::NativeProviderModel>> {
        super::subscription::discover_live_models(provider)
    }
}

fn subscription_discovery() -> &'static dyn routes::RouteModelDiscoveryHook {
    static HOOK: SubscriptionDiscovery = SubscriptionDiscovery;
    &HOOK
}

pub(crate) fn route_id_for_login_provider(provider: &str) -> Option<&'static str> {
    match provider {
        "openai" => Some(routes::openai::ROUTE_ID),
        "anthropic" | "claude" => Some(routes::anthropic::ROUTE_ID),
        "aws_bedrock" | "bedrock" => Some(routes::aws_bedrock::ROUTE_ID),
        "gemini" | "google_gemini" => Some(routes::google_gemini::ROUTE_ID),
        "openrouter" => Some(routes::openrouter::ROUTE_ID),
        "opencode" | "opencode_zen" | "opencode-zen" => Some(routes::opencode::ZEN_ROUTE_ID),
        "opencode_go" | "opencode-go" => Some(routes::opencode::GO_ROUTE_ID),
        "mimo" => Some(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID),
        "deepseek" => Some(routes::deepseek::OPENAI_ROUTE_ID),
        "glm" | "zhipu" | "zai" => Some(routes::glm::ROUTE_ID),
        "kimi" | "moonshot" => Some(routes::moonshot::ROUTE_ID),
        "volcengine" | "volcengine_ark" | "ark" | "doubao" => {
            Some(routes::volcengine::OPENAI_ROUTE_ID)
        }
        "nvidia" | "nim" => Some(routes::nvidia::ROUTE_ID),
        "amd" | "radeon" => Some(routes::amd::ROUTE_ID),
        "atria" | "atria-asi" | "atria_asi" => Some(routes::atria::ROUTE_ID),
        "intern" | "intern-token-plan" | "intern_token_plan" | "tokenplan" | "token-plan" => {
            Some(routes::intern::ROUTE_ID)
        }
        "poolside" | "laguna" => Some(routes::poolside::ROUTE_ID),
        "bai" | "b.ai" => Some(routes::bai::ROUTE_ID),
        "ollama_cloud" | "ollama-cloud" => Some(routes::ollama::CLOUD_ROUTE_ID),
        "xai" | "grok" => Some(routes::xai::ROUTE_ID),
        "mistral" => Some(routes::mistral::ROUTE_ID),
        "groq" => Some(routes::groq::ROUTE_ID),
        "cerebras" => Some(routes::cerebras::ROUTE_ID),
        "cohere" => Some(routes::cohere::ROUTE_ID),
        "togetherai" | "together" => Some(routes::togetherai::ROUTE_ID),
        "perplexity" => Some(routes::perplexity::ROUTE_ID),
        "alibaba" | "dashscope" | "qwen" => Some(routes::alibaba::ROUTE_ID),
        "deepinfra" => Some(routes::deepinfra::ROUTE_ID),
        "venice" => Some(routes::venice::ROUTE_ID),
        routes::subscription::CLAUDE => Some(routes::subscription::CLAUDE),
        routes::subscription::CHATGPT => Some(routes::subscription::CHATGPT),
        routes::subscription::COPILOT => Some(routes::subscription::COPILOT),
        routes::subscription::COPILOT_ACP => Some(routes::subscription::COPILOT_ACP),
        routes::subscription::GEMINI_CODE_ASSIST => Some(routes::subscription::GEMINI_CODE_ASSIST),
        routes::subscription::ANTIGRAVITY => Some(routes::subscription::ANTIGRAVITY),
        routes::subscription::GROK_BUILD => Some(routes::subscription::GROK_BUILD),
        routes::subscription::XAI_OAUTH => Some(routes::subscription::XAI_OAUTH),
        routes::subscription::CURSOR => Some(routes::subscription::CURSOR),
        routes::subscription::AZURE => Some(routes::subscription::AZURE),
        routes::subscription::DIGITALOCEAN => Some(routes::subscription::DIGITALOCEAN),
        routes::subscription::SNOWFLAKE => Some(routes::subscription::SNOWFLAKE),
        routes::subscription::QWEN => Some(routes::subscription::QWEN),
        routes::subscription::MINIMAX => Some(routes::subscription::MINIMAX),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use reqwest::{blocking::Client, header::AUTHORIZATION};
    use serde_json::json;

    use crate::native_backend::{NativeProviderModel, NativeProviderProfile, ReasoningReplayField};

    use super::*;

    fn provider(route_id: &str, auth_header: Option<&str>) -> NativeProviderProfile {
        NativeProviderProfile {
            id: format!("{route_id}-profile"),
            label: route_id.to_string(),
            route_id: route_id.to_string(),
            base_url: Some("https://example.com/v1".to_string()),
            default_model: Some("gpt-test".to_string()),
            api_key_ref: None,
            api_key: Some("sk-test".to_string()),
            api_key_env: None,
            auth_header: auth_header.map(str::to_string),
            embedding_model: None,
            models: vec![NativeProviderModel {
                id: "gpt-test".to_string(),
                label: Some("gpt-test".to_string()),
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
    fn hosted_openai_hook_lookup_resolves_supported_hosted_routes_only() {
        assert!(hosted_openai_route_hook(routes::openai::ROUTE_ID).is_none());
        assert_eq!(
            hosted_openai_route_hook(routes::openrouter::ROUTE_ID).map(|hook| hook.descriptor().id),
            Some(routes::openrouter::ROUTE_ID.to_string())
        );
        assert_eq!(
            hosted_openai_route_hook(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID)
                .map(|hook| hook.descriptor().id),
            Some(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID.to_string())
        );
        assert_eq!(
            hosted_openai_route_hook(routes::mimo::TOKEN_PLAN_CN_ROUTE_ID)
                .map(|hook| hook.descriptor().id),
            Some(routes::mimo::TOKEN_PLAN_CN_ROUTE_ID.to_string())
        );
        assert_eq!(
            hosted_openai_route_hook(routes::custom_openai_compatible::ROUTE_ID)
                .map(|hook| hook.descriptor().id),
            Some(routes::custom_openai_compatible::ROUTE_ID.to_string())
        );
        assert!(hosted_openai_route_hook(routes::lmstudio::ROUTE_ID).is_none());
        assert!(hosted_openai_route_hook(routes::llama_cpp_server::ROUTE_ID).is_none());
        assert!(hosted_openai_route_hook(routes::vllm::ROUTE_ID).is_none());
        assert!(hosted_openai_route_hook(routes::local_openai_compatible::ROUTE_ID).is_none());
    }

    #[test]
    fn openai_route_is_responses_protocol_not_chat_hook() {
        let route = require_route(routes::openai::ROUTE_ID).expect("openai route");

        assert_eq!(route.protocol_id, protocol::openai_responses::PROTOCOL_ID);
        assert_eq!(route.api_method, "responses");
        assert!(route.runtime_supported);
        assert!(route.model_discovery_supported);
        assert!(route.supports_stateful_prompt_contract);
    }

    #[test]
    fn anthropic_route_is_messages_protocol() {
        let route = require_route(routes::anthropic::ROUTE_ID).expect("anthropic route");

        assert_eq!(route.protocol_id, protocol::anthropic_messages::PROTOCOL_ID);
        assert_eq!(route.api_method, "messages");
        assert!(route.runtime_supported);
        assert!(route.model_discovery_supported);
        assert!(!route.supports_stateful_prompt_contract);
    }

    #[test]
    fn custom_anthropic_route_is_messages_protocol() {
        let route = require_route(routes::custom_anthropic_compatible::ROUTE_ID)
            .expect("custom anthropic route");

        assert_eq!(route.protocol_id, protocol::anthropic_messages::PROTOCOL_ID);
        assert_eq!(route.api_method, "messages");
        assert!(route.runtime_supported);
        assert!(route.model_discovery_supported);
        assert!(route.custom_headers_supported);
    }

    #[test]
    fn deepseek_routes_are_auto_discovery_routes() {
        let openai_route =
            require_route(routes::deepseek::OPENAI_ROUTE_ID).expect("deepseek route");
        assert_eq!(
            openai_route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            openai_route.default_base_url.as_deref(),
            Some(routes::deepseek::OPENAI_BASE_URL)
        );
        assert_eq!(openai_route.auth_kind, "bearer");
        assert!(openai_route.quick_setup_supported);
        assert!(openai_route.model_discovery_supported);

        let anthropic_route =
            require_route(routes::deepseek::ANTHROPIC_ROUTE_ID).expect("deepseek anthropic route");
        assert_eq!(
            anthropic_route.protocol_id,
            protocol::anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(
            anthropic_route.default_base_url.as_deref(),
            Some(routes::deepseek::ANTHROPIC_BASE_URL)
        );
        assert_eq!(anthropic_route.auth_kind, "x-api-key");
        assert!(anthropic_route.quick_setup_supported);
        assert!(anthropic_route.model_discovery_supported);
    }

    #[test]
    fn volcengine_coding_plan_routes_use_plan_base_urls() {
        let openai_route =
            require_route(routes::volcengine::OPENAI_ROUTE_ID).expect("volcengine coding route");
        assert_eq!(
            openai_route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            openai_route.default_base_url.as_deref(),
            Some(routes::volcengine::OPENAI_BASE_URL)
        );
        assert_eq!(openai_route.auth_kind, "bearer");
        assert!(openai_route.quick_setup_supported);
        assert!(openai_route.model_discovery_supported);

        let anthropic_route = require_route(routes::volcengine::ANTHROPIC_ROUTE_ID)
            .expect("volcengine anthropic route");
        assert_eq!(
            anthropic_route.protocol_id,
            protocol::anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(
            anthropic_route.default_base_url.as_deref(),
            Some(routes::volcengine::ANTHROPIC_BASE_URL)
        );
        assert_eq!(anthropic_route.auth_kind, "x-api-key");
        assert!(anthropic_route.quick_setup_supported);
        assert!(anthropic_route.model_discovery_supported);

        assert_eq!(
            route_id_for_login_provider("doubao"),
            Some(routes::volcengine::OPENAI_ROUTE_ID)
        );
        assert!(route_model_discovery_hook(routes::volcengine::OPENAI_ROUTE_ID).is_some());
        assert!(route_model_discovery_hook(routes::volcengine::ANTHROPIC_ROUTE_ID).is_some());
    }

    #[test]
    fn glm_routes_are_openai_compatible_discovery_routes() {
        let route = require_route(routes::glm::ROUTE_ID).expect("glm route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::glm::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);

        let zai_route = require_route(routes::glm::ZAI_ROUTE_ID).expect("zai glm route");
        assert_eq!(
            zai_route.default_base_url.as_deref(),
            Some(routes::glm::ZAI_BASE_URL)
        );
        assert_eq!(
            zai_route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
    }

    #[test]
    fn moonshot_routes_are_openai_compatible_discovery_routes() {
        let route = require_route(routes::moonshot::ROUTE_ID).expect("moonshot route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::moonshot::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);

        let cn_route = require_route(routes::moonshot::CN_ROUTE_ID).expect("moonshot cn route");
        assert_eq!(
            cn_route.default_base_url.as_deref(),
            Some(routes::moonshot::CN_BASE_URL)
        );
        assert_eq!(
            cn_route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
    }

    #[test]
    fn nvidia_route_is_openai_compatible_discovery_route() {
        let route = require_route(routes::nvidia::ROUTE_ID).expect("nvidia route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::nvidia::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
    }

    #[test]
    fn amd_route_is_openai_compatible_discovery_route() {
        let route = require_route(routes::amd::ROUTE_ID).expect("amd route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::amd::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
        assert_eq!(
            route_id_for_login_provider("radeon"),
            Some(routes::amd::ROUTE_ID)
        );
    }

    #[test]
    fn bai_route_is_openai_compatible_discovery_route() {
        let route = require_route(routes::bai::ROUTE_ID).expect("bai route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::bai::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
        assert_eq!(
            route_id_for_login_provider("b.ai"),
            Some(routes::bai::ROUTE_ID)
        );
    }

    #[test]
    fn atria_route_is_openai_compatible_discovery_route() {
        let route = require_route(routes::atria::ROUTE_ID).expect("atria route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::atria::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
        assert_eq!(
            route_id_for_login_provider("atria-asi"),
            Some(routes::atria::ROUTE_ID)
        );
        assert!(route_model_discovery_hook(routes::atria::ROUTE_ID).is_some());
    }

    #[test]
    fn poolside_route_is_openai_compatible_discovery_route() {
        let route = require_route(routes::poolside::ROUTE_ID).expect("poolside route");
        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::poolside::DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
        assert_eq!(
            route_id_for_login_provider("laguna"),
            Some(routes::poolside::ROUTE_ID)
        );
        assert!(route_model_discovery_hook(routes::poolside::ROUTE_ID).is_some());
    }

    #[test]
    fn ollama_cloud_route_is_hosted_ollama_chat_route() {
        let route = require_route(routes::ollama::CLOUD_ROUTE_ID).expect("ollama cloud route");

        assert_eq!(route.protocol_id, protocol::ollama_chat::PROTOCOL_ID);
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::ollama::CLOUD_DEFAULT_BASE_URL)
        );
        assert_eq!(route.auth_kind, "bearer");
        assert_eq!(route.catalog_section, "hosted");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
        assert!(route.local_backend.is_none());
    }

    #[test]
    fn ollama_cloud_openai_route_is_hosted_openai_chat_completions_route() {
        let route = require_route(routes::ollama::CLOUD_OPENAI_ROUTE_ID)
            .expect("ollama cloud openai route");

        assert_eq!(
            route.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(
            route.default_base_url.as_deref(),
            Some(routes::ollama::CLOUD_OPENAI_DEFAULT_BASE_URL)
        );
        assert_eq!(route.api_method, "chatCompletions");
        assert_eq!(route.auth_kind, "bearer");
        assert_eq!(route.catalog_section, "hosted");
        assert!(route.quick_setup_supported);
        assert!(route.model_discovery_supported);
        assert!(route.local_backend.is_none());
    }

    #[test]
    fn google_gemini_route_is_generate_content_protocol() {
        let route = require_route(routes::google_gemini::ROUTE_ID).expect("google gemini route");

        assert_eq!(
            route.protocol_id,
            protocol::gemini_generate_content::PROTOCOL_ID
        );
        assert_eq!(route.api_method, "generateContent");
        assert!(route.runtime_supported);
        assert!(route.model_discovery_supported);
    }

    #[test]
    fn aws_bedrock_route_is_converse_protocol() {
        let route = require_route(routes::aws_bedrock::ROUTE_ID).expect("aws bedrock route");

        assert_eq!(
            route.protocol_id,
            protocol::aws_bedrock_converse::PROTOCOL_ID
        );
        assert_eq!(route.api_method, "converse");
        assert!(route.runtime_supported);
        assert!(route.model_discovery_supported);
        assert!(!route.quick_setup_supported);
    }

    #[test]
    fn every_runtime_supported_route_supports_model_discovery() {
        let missing = route_catalog()
            .into_iter()
            .filter(|route| route.runtime_supported && !route.model_discovery_supported)
            .map(|route| route.id)
            .collect::<Vec<_>>();

        assert!(
            missing.is_empty(),
            "runtime routes without model discovery: {missing:?}"
        );
    }

    #[test]
    fn mimo_token_plan_routes_are_runtime_only_not_quick_setup() {
        let mimo_routes = route_catalog()
            .into_iter()
            .filter(|route| route.provider_id == "mimo")
            .collect::<Vec<_>>();
        assert_eq!(mimo_routes.len(), 8);

        let pay_as_you_go =
            require_route(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID).expect("mimo pay-as-you-go route");
        assert!(pay_as_you_go.runtime_supported);
        assert!(pay_as_you_go.quick_setup_supported);
        assert!(pay_as_you_go.model_discovery_supported);
        assert_eq!(
            pay_as_you_go.protocol_id,
            protocol::openai_chat_completions::PROTOCOL_ID
        );

        for route_id in [
            routes::mimo::TOKEN_PLAN_CN_ROUTE_ID,
            routes::mimo::TOKEN_PLAN_SGP_ROUTE_ID,
            routes::mimo::TOKEN_PLAN_AMS_ROUTE_ID,
        ] {
            let route = require_route(route_id).expect("mimo token-plan route");

            assert_eq!(route.catalog_section, "hosted");
            assert!(route.runtime_supported);
            assert!(route.model_discovery_supported);
            assert!(!route.quick_setup_supported);
            assert_eq!(
                route.protocol_id,
                protocol::openai_chat_completions::PROTOCOL_ID
            );
        }

        let anthropic_pay_as_you_go = require_route(routes::mimo::ANTHROPIC_PAY_AS_YOU_GO_ROUTE_ID)
            .expect("mimo anthropic pay-as-you-go route");
        assert!(anthropic_pay_as_you_go.runtime_supported);
        assert!(anthropic_pay_as_you_go.quick_setup_supported);
        assert!(anthropic_pay_as_you_go.model_discovery_supported);
        assert_eq!(
            anthropic_pay_as_you_go.protocol_id,
            protocol::anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(
            anthropic_pay_as_you_go.default_base_url.as_deref(),
            Some(routes::mimo::ANTHROPIC_PAY_AS_YOU_GO_BASE_URL)
        );
        assert_eq!(anthropic_pay_as_you_go.auth_kind, "api-key");

        for route_id in [
            routes::mimo::ANTHROPIC_TOKEN_PLAN_CN_ROUTE_ID,
            routes::mimo::ANTHROPIC_TOKEN_PLAN_SGP_ROUTE_ID,
            routes::mimo::ANTHROPIC_TOKEN_PLAN_AMS_ROUTE_ID,
        ] {
            let route = require_route(route_id).expect("mimo anthropic token-plan route");

            assert_eq!(route.catalog_section, "hosted");
            assert!(route.runtime_supported);
            assert!(route.model_discovery_supported);
            assert!(!route.quick_setup_supported);
            assert_eq!(route.protocol_id, protocol::anthropic_messages::PROTOCOL_ID);
            assert_eq!(route.auth_kind, "api-key");
        }
    }

    #[test]
    fn local_routes_are_runtime_supported_but_not_quick_setup() {
        for route_id in [
            routes::ollama::ROUTE_ID,
            routes::local_openai_compatible::ROUTE_ID,
            routes::lmstudio::ROUTE_ID,
            routes::llama_cpp_server::ROUTE_ID,
            routes::vllm::ROUTE_ID,
        ] {
            let route = require_route(route_id).expect("local route");

            assert_eq!(route.catalog_section, "local");
            assert!(route.runtime_supported);
            assert!(route.model_discovery_supported);
            assert!(!route.quick_setup_supported);
        }
    }

    #[test]
    fn route_model_discovery_hooks_cover_special_routes() {
        assert!(route_model_discovery_hook(routes::lmstudio::ROUTE_ID).is_some());
        assert!(route_model_discovery_hook(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID).is_some());
        assert!(route_model_discovery_hook(routes::mimo::TOKEN_PLAN_SGP_ROUTE_ID).is_some());
        assert!(
            route_model_discovery_hook(routes::mimo::ANTHROPIC_PAY_AS_YOU_GO_ROUTE_ID).is_some()
        );
        assert!(
            route_model_discovery_hook(routes::mimo::ANTHROPIC_TOKEN_PLAN_SGP_ROUTE_ID).is_some()
        );
        assert!(route_model_discovery_hook(routes::deepseek::OPENAI_ROUTE_ID).is_some());
        assert!(route_model_discovery_hook(routes::deepseek::ANTHROPIC_ROUTE_ID).is_some());
        assert!(route_model_discovery_hook(routes::llama_cpp_server::ROUTE_ID).is_none());
        assert!(route_model_discovery_hook(routes::vllm::ROUTE_ID).is_none());
    }

    #[test]
    fn custom_hosted_hook_uses_custom_auth_header_when_requested() {
        let hook = hosted_openai_route_hook(routes::custom_openai_compatible::ROUTE_ID)
            .expect("custom hook must exist");
        let provider = provider(routes::custom_openai_compatible::ROUTE_ID, Some("api-key"));

        let request = hook
            .apply_request_headers(
                Client::new().post("https://example.com/v1/chat/completions"),
                &provider,
            )
            .expect("apply request headers")
            .build()
            .expect("build request");

        assert_eq!(
            request
                .headers()
                .get("api-key")
                .and_then(|value| value.to_str().ok()),
            Some("sk-test")
        );
        assert!(request.headers().get(AUTHORIZATION).is_none());
    }

    #[test]
    fn mimo_hook_applies_api_key_header_and_keeps_pro_thinking_enabled_for_tool_calls() {
        let hook =
            hosted_openai_route_hook(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID).expect("mimo hook");
        let provider = provider(routes::mimo::PAY_AS_YOU_GO_ROUTE_ID, None);

        let body = hook
            .decorate_request_body(
                json!({
                    "model": "mimo-v2.5-pro",
                    "tools": [{
                        "type": "function",
                        "function": { "name": "tool_fs_run" }
                    }]
                }),
                &provider,
                "mimo-v2.5-pro",
            )
            .expect("decorate mimo body");
        let request = hook
            .apply_request_headers(
                Client::new().post("https://example.com/v1/chat/completions"),
                &provider,
            )
            .expect("apply request headers")
            .build()
            .expect("build request");

        assert_eq!(body["thinking"]["type"], "enabled");
        assert_eq!(body["temperature"], 1.0);
        assert_eq!(body["top_p"], 0.95);
        assert_eq!(
            request
                .headers()
                .get("api-key")
                .and_then(|value| value.to_str().ok()),
            Some("sk-test")
        );
        assert!(request.headers().get(AUTHORIZATION).is_none());
    }
}
