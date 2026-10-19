use crate::{
    AgentRuntimeError, AgentRuntimeResult,
    native_backend::{
        NativeProviderModel, NativeProviderProfile, ReasoningReplayField,
        providers::protocol::openai_common::{self, ModelDiscoveryScope},
    },
};

use super::{
    super::{protocol, types::ProviderRouteDescriptor},
    RouteModelDiscoveryHook,
};

// Route ids resolve to models.dev's `volcengine-coding-plan` catalogue both
// directly and through the `anthropic` protocol-suffix fallback, so plan models
// keep their real context windows and reasoning metadata.
pub(crate) const OPENAI_ROUTE_ID: &str = "volcengine_coding_plan";
pub(crate) const ANTHROPIC_ROUTE_ID: &str = "volcengine_coding_plan_anthropic";
pub(crate) const OPENAI_BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/coding/v3";
pub(crate) const ANTHROPIC_BASE_URL: &str = "https://ark.cn-beijing.volces.com/api/coding";

// Coding Plan Model Names, from the Ark "other tools" and Claude Code setup
// docs. A Coding Plan subscription covers these names on the plan Base URLs
// only: `https://ark.cn-beijing.volces.com/api/v3` is billed separately.
// `ark-code-latest` follows whatever the console has selected, including Auto.
// Live discovery adds anything newer the plan reports; this list only keeps the
// documented names present when `/models` fails.
const DOCUMENTED_MODELS: &[(&str, &str)] = &[
    ("ark-code-latest", "Ark Code Latest (console-selected)"),
    ("doubao-seed-evolving", "Doubao Seed Evolving"),
    ("doubao-seed-2.1-pro", "Doubao Seed 2.1 Pro"),
    ("doubao-seed-2.1-lite", "Doubao Seed 2.1 Lite"),
    ("doubao-seed-2.0-mini", "Doubao Seed 2.0 Mini"),
    ("minimax-m3", "MiniMax M3"),
    ("glm-5.3", "GLM 5.3"),
    ("glm-5.3-flash", "GLM 5.3 Flash"),
    ("deepseek-v4.1-flash", "DeepSeek V4.1 Flash"),
    ("deepseek-v4-flash", "DeepSeek V4 Flash"),
    ("deepseek-v4-pro", "DeepSeek V4 Pro"),
    ("kimi-k2.8-preview", "Kimi K2.8 Preview"),
    ("kimi-k3", "Kimi K3"),
];

static MODEL_DISCOVERY_HOOK: VolcengineModelDiscoveryHook = VolcengineModelDiscoveryHook;

pub(crate) fn route_descriptors() -> Vec<ProviderRouteDescriptor> {
    [OPENAI_ROUTE_ID, ANTHROPIC_ROUTE_ID]
        .into_iter()
        .map(descriptor_for)
        .collect()
}

pub(crate) fn model_discovery_hook() -> &'static dyn RouteModelDiscoveryHook {
    &MODEL_DISCOVERY_HOOK
}

fn descriptor_for(route_id: &str) -> ProviderRouteDescriptor {
    let (label, description, default_base_url, protocol_id, protocol_family, api_method, auth_kind) =
        match route_id {
            OPENAI_ROUTE_ID => (
                "Volcengine Ark Coding Plan",
                "Volcengine Ark Coding Plan OpenAI-compatible endpoint.",
                OPENAI_BASE_URL,
                protocol::openai_chat_completions::PROTOCOL_ID,
                protocol::openai_chat_completions::PROTOCOL_FAMILY,
                "chatCompletions",
                "bearer",
            ),
            ANTHROPIC_ROUTE_ID => (
                "Volcengine Ark Coding Plan (Anthropic)",
                "Volcengine Ark Coding Plan Anthropic-compatible endpoint.",
                ANTHROPIC_BASE_URL,
                protocol::anthropic_messages::PROTOCOL_ID,
                protocol::anthropic_messages::PROTOCOL_FAMILY,
                "messages",
                "x-api-key",
            ),
            _ => unreachable!("unsupported Volcengine Ark route id"),
        };

    ProviderRouteDescriptor {
        id: route_id.to_string(),
        provider_id: "volcengine".to_string(),
        protocol_id: protocol_id.to_string(),
        protocol_family: protocol_family.to_string(),
        label: label.to_string(),
        description: description.to_string(),
        default_base_url: Some(default_base_url.to_string()),
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

struct VolcengineModelDiscoveryHook;

impl RouteModelDiscoveryHook for VolcengineModelDiscoveryHook {
    fn descriptor(&self) -> ProviderRouteDescriptor {
        descriptor_for(OPENAI_ROUTE_ID)
    }

    fn discover_models(
        &self,
        provider: &NativeProviderProfile,
    ) -> AgentRuntimeResult<Vec<NativeProviderModel>> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        // The plan's documented Model Names must stay selectable, because the
        // endpoint is plan-scoped and an unavailable `/models` would otherwise
        // leave a paid subscription with no usable model. Live entries enrich
        // the documented ones and add anything newer the plan reports.
        let discovered = openai_common::discover_models(
            &client,
            &openai_discovery_profile(provider),
            true,
            ModelDiscoveryScope::CompatibleText,
        )
        .unwrap_or_default();
        Ok(coding_plan_catalog(discovered))
    }
}

fn openai_discovery_profile(provider: &NativeProviderProfile) -> NativeProviderProfile {
    NativeProviderProfile {
        route_id: OPENAI_ROUTE_ID.to_string(),
        base_url: Some(OPENAI_BASE_URL.to_string()),
        auth_header: None,
        ..provider.clone()
    }
}

fn documented_model(id: &str, label: &str) -> NativeProviderModel {
    NativeProviderModel {
        id: id.to_string(),
        label: Some(label.to_string()),
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
    }
}

fn coding_plan_catalog(discovered: Vec<NativeProviderModel>) -> Vec<NativeProviderModel> {
    let mut catalog = DOCUMENTED_MODELS
        .iter()
        .map(|(id, label)| {
            let mut model = discovered
                .iter()
                .find(|model| model.id.eq_ignore_ascii_case(id))
                .cloned()
                .unwrap_or_else(|| documented_model(id, label));
            model.id = (*id).to_string();
            model.label = Some((*label).to_string());
            model.supports_tool_calling = true;
            model.supports_streaming = true;
            model
        })
        .collect::<Vec<_>>();
    catalog.extend(
        discovered
            .into_iter()
            .filter(|model| {
                !DOCUMENTED_MODELS
                    .iter()
                    .any(|(id, _)| model.id.eq_ignore_ascii_case(id))
            })
            .collect::<Vec<_>>(),
    );
    catalog
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn anthropic_route_uses_messages_path_and_openai_discovery_base() {
        let provider = NativeProviderProfile {
            id: "volcengine-anthropic".to_string(),
            label: "Volcengine Ark Coding Plan (Anthropic)".to_string(),
            route_id: ANTHROPIC_ROUTE_ID.to_string(),
            base_url: Some(ANTHROPIC_BASE_URL.to_string()),
            default_model: None,
            api_key_ref: None,
            api_key: Some("ark-test".to_string()),
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        };

        let descriptor = descriptor_for(ANTHROPIC_ROUTE_ID);
        assert_eq!(
            descriptor.protocol_id,
            protocol::anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(descriptor.auth_kind, "x-api-key");
        assert_eq!(
            super::super::super::transport::http::endpoint_url(&provider, "messages")
                .expect("messages endpoint"),
            "https://ark.cn-beijing.volces.com/api/coding/v1/messages"
        );

        let discovery = openai_discovery_profile(&provider);
        assert_eq!(discovery.route_id, OPENAI_ROUTE_ID);
        assert_eq!(
            super::super::super::transport::http::endpoint_url(&discovery, "models")
                .expect("models endpoint"),
            "https://ark.cn-beijing.volces.com/api/coding/v3/models"
        );
    }

    #[test]
    fn coding_plan_catalog_keeps_documented_names_and_adds_live_ones() {
        let discovered = vec![
            NativeProviderModel {
                id: "GLM-5.3".to_string(),
                context_window: Some(1_000_000),
                supports_image_input: true,
                ..documented_model("glm-5.3", "GLM 5.3")
            },
            documented_model("doubao-seed-2.1-turbo", "Doubao Seed 2.1 Turbo"),
        ];

        let catalog = coding_plan_catalog(discovered);
        let ids = catalog
            .iter()
            .map(|model| model.id.as_str())
            .collect::<Vec<_>>();

        for (id, _) in DOCUMENTED_MODELS {
            assert!(ids.contains(id), "documented model {id} is missing");
        }
        assert_eq!(
            ids.iter().filter(|id| **id == "glm-5.3").count(),
            1,
            "a live id matching a documented Name must not be listed twice"
        );
        assert!(ids.contains(&"doubao-seed-2.1-turbo"));

        let glm = catalog
            .iter()
            .find(|model| model.id == "glm-5.3")
            .expect("glm");
        assert_eq!(glm.context_window, Some(1_000_000));
        assert!(glm.supports_image_input);
        assert_eq!(glm.label.as_deref(), Some("GLM 5.3"));
    }

    #[test]
    fn coding_plan_catalog_works_without_live_discovery() {
        let catalog = coding_plan_catalog(Vec::new());

        assert!(catalog.iter().any(|model| model.id == "ark-code-latest"));
        assert!(catalog.iter().any(|model| model.id == "kimi-k3"));
        assert!(
            catalog
                .iter()
                .all(|model| model.supports_tool_calling && model.supports_streaming)
        );
    }
}
