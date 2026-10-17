use std::collections::HashSet;

use lyra_agent_plugins::SkillRegistry;
use serde_json::{Value, json};

use crate::retention_policy::{
    CONTEXT_GUARD_TOKENS, ComplexityBand, RetentionPolicy, RetentionSignals, TrimAggressiveness,
    halve_tool_message_ids, retention_policy_from_messages, select_interleaved_provider_keep,
};

use crate::native_backend::inline_images::{
    effective_inline_images_for_user_turn, enrich_inline_images_for_provider,
    expand_inline_image_markers_in_content, prepend_inline_images_vision_to_content,
    provider_image_url_from_value, text_has_inline_image_markers,
};
use crate::native_backend::token_estimate::{estimate_message_tokens, estimate_messages_tokens};
use crate::native_backend::tool_protocol::{
    TOOL_OUTPUT_CLEARED_SUMMARY, TOOL_OUTPUT_OMITTED_SUMMARY, tool_activity_output_summary,
};
use crate::prompt_policy::PromptAccounting;

const OPENAI_RESPONSES_REPLAY_GROUP_KEY: &str = "lyraOpenaiResponsesReplayGroup";

/// Returns true for runtime diagnostics that are shown in the UI, but are not
/// conversational turns. In particular, a provider failure must never be
/// replayed to a later model request as though it were an assistant response.
///
/// `isApiError` is kept here for sessions created before `kind` was added, so
/// opening an existing session immediately stops its old failure messages from
/// contaminating subsequent requests.
pub(crate) fn excludes_provider_context(message: &Value) -> bool {
    message
        .pointer("/metadata/excludeFromProviderContext")
        .and_then(Value::as_bool)
        == Some(true)
        || message
            .pointer("/metadata/isApiError")
            .and_then(Value::as_bool)
            == Some(true)
        || message.pointer("/metadata/kind").and_then(Value::as_str) == Some("provider-error")
}

/// Member-authored user turn: typed text, not uiHidden runtime pokes
/// (worker resume, terminal exit, goal continuation).
pub(crate) fn is_member_user_message(message: &Value) -> bool {
    message.get("role").and_then(Value::as_str) == Some("user")
        && message
            .pointer("/metadata/uiHidden")
            .and_then(Value::as_bool)
            != Some(true)
        && !excludes_provider_context(message)
}

#[derive(Clone, Debug)]
pub struct ContextBuilder {
    skill_registry: SkillRegistry,
}

impl Default for ContextBuilder {
    fn default() -> Self {
        Self::with_skill_registry(SkillRegistry::with_builtin_skills())
    }
}

#[derive(Clone, Debug)]
pub struct ProviderContextOptions {
    pub supports_image_input: bool,
    pub supports_audio_input: bool,
    pub supports_video_input: bool,
    pub supports_pdf_input: bool,
    pub context_window: Option<usize>,
    pub max_tool_output_chars: usize,
    pub session_tool_count: usize,
    pub last_turn_tool_count: usize,
    /// Durable provider-protocol steps (one JSON entry per replayable round),
    /// anchored to assistant message ids. Replaces the former metadata copies.
    pub protocol_log: Vec<Value>,
    pub provider_id: Option<String>,
    pub route_id: Option<String>,
    pub protocol_id: Option<String>,
    pub model: Option<String>,
    pub halve_tool_output_message_ids: HashSet<String>,
    pub volatile_appendix: Option<String>,
}

impl Default for ProviderContextOptions {
    fn default() -> Self {
        Self {
            supports_image_input: false,
            supports_audio_input: false,
            supports_video_input: false,
            supports_pdf_input: false,
            context_window: None,
            max_tool_output_chars: 24_000,
            session_tool_count: 0,
            last_turn_tool_count: 0,
            protocol_log: Vec::new(),
            provider_id: None,
            route_id: None,
            protocol_id: None,
            model: None,
            halve_tool_output_message_ids: HashSet::new(),
            volatile_appendix: None,
        }
    }
}

#[derive(Clone, Debug, Default)]
pub struct ProviderContext {
    pub messages: Vec<Value>,
    pub token_estimate: usize,
    pub input_downgrades: Vec<Value>,
    pub evidence_refs: Vec<Value>,
    pub trimmed: bool,
    pub overflow: Option<Value>,
}

impl ContextBuilder {
    pub const NAME: &'static str = "context_builder";

    pub fn with_skill_registry(skill_registry: SkillRegistry) -> Self {
        Self { skill_registry }
    }

    pub fn build_prompt_context(
        &self,
        messages: Vec<lyra_agent_api::AgentMessage>,
        memory: Option<lyra_agent_api::AgentMemoryProjection>,
    ) -> serde_json::Value {
        serde_json::json!({
            "messages": messages,
            "memory": memory,
            "activeSkillPrompt": self.skill_registry.active_prompt(),
            "activeSkillPermissions": self.skill_registry.active_permissions(),
            "promptAccounting": prompt_accounting_json(&PromptAccounting::default()),
        })
    }

    pub fn build_layered_prompt_context(
        &self,
        runtime_context: Value,
        memory_prompt: String,
        history_token_estimate: usize,
        artifact_token_estimate: usize,
    ) -> serde_json::Value {
        let accounting = PromptAccounting {
            system_budget: 1200,
            tools_budget: 800,
            memory_budget: 600,
            history_budget: history_token_estimate,
            artifact_budget: artifact_token_estimate,
        };
        json!({
            "staticPrompt": "Lyra Agent identity, tool strategy, verification policy",
            "dynamicRuntimeContext": runtime_context,
            "dynamicToolSection": {
                "cacheKey": "runtime-tool-section",
                "strategy": "Only this section changes when Lyra tool manifests change; large schemas stay behind discover/inspect references."
            },
            "activeSkillPrompt": self.skill_registry.active_prompt(),
            "activeSkillPermissions": self.skill_registry.active_permissions(),
            "memoryPrompt": memory_prompt,
            "promptAccounting": prompt_accounting_json(&accounting),
        })
    }

    pub fn build_provider_context(
        &self,
        system_prompt: String,
        messages: Vec<Value>,
        options: ProviderContextOptions,
    ) -> ProviderContext {
        let mut output = ProviderContext {
            messages: vec![json!({
                "role": "system",
                "content": system_prompt,
            })],
            ..ProviderContext::default()
        };

        // Defend this boundary as well as the session-request projection. Some
        // callers construct context directly, and provider diagnostics must
        // remain invisible to the model in every path.
        let messages = messages
            .into_iter()
            .filter(|message| !excludes_provider_context(message))
            .collect::<Vec<_>>();
        let retention_signals = RetentionSignals {
            context_window: options.context_window,
            session_tool_count: options.session_tool_count,
            last_turn_tool_count: options.last_turn_tool_count,
        };
        let retention = retention_policy_from_messages(&messages, &retention_signals);
        let mut options = options;
        options.halve_tool_output_message_ids =
            halve_tool_message_ids(&messages, &retention, &HashSet::new());

        for (message_index, message) in messages.iter().enumerate() {
            let provider_messages = provider_messages_from_agent_message(
                message,
                message_index,
                &messages,
                &options,
                &mut output,
            );
            output.messages.extend(provider_messages);
        }
        insert_volatile_appendix(&mut output.messages, options.volatile_appendix.as_deref());
        demote_old_tool_results(&mut output.messages);
        output.token_estimate = estimate_messages_tokens(&output.messages);
        if should_compact_provider_context(&output, &retention, messages.len()) {
            compact_to_retention_policy(&mut output, retention, TrimAggressiveness::Normal);
        }
        strip_openai_responses_replay_groups(&mut output.messages);
        output.token_estimate = estimate_messages_tokens(&output.messages);
        output
    }
}

mod provider_messages;
mod retention;
#[cfg(test)]
#[path = "context_builder/tests/mod.rs"]
mod tests;

use provider_messages::provider_messages_from_agent_message;
#[cfg(test)]
use retention::normalize_openai_responses_replay_retention;
use retention::{
    compact_to_retention_policy, demote_old_tool_results, prompt_accounting_json,
    should_compact_provider_context, strip_openai_responses_replay_groups,
};

/// Project one queued mid-turn user message (steer) into provider wire
/// messages. Steers are durable transcript citizens, so this must stay in
/// lockstep with the normal rebuild path — hence the shared projection
/// instead of a hand-built wire message.
pub(crate) fn project_steer_user_message(
    steer: &Value,
    transcript: &[Value],
    options: &ProviderContextOptions,
) -> Vec<Value> {
    let message_index = transcript
        .iter()
        .position(|message| {
            message
                .get("id")
                .is_some_and(|id| Some(id) == steer.get("id"))
        })
        .unwrap_or_else(|| transcript.len().saturating_sub(1));
    let mut output = ProviderContext::default();
    provider_messages_from_agent_message(steer, message_index, transcript, options, &mut output)
}

fn insert_volatile_appendix(messages: &mut Vec<Value>, appendix: Option<&str>) {
    let Some(appendix) = appendix.map(str::trim).filter(|text| !text.is_empty()) else {
        return;
    };
    let volatile = json!({
        "role": "system",
        "content": appendix,
        "lyraCacheBoundary": "turnTail",
    });
    let insert_at = messages
        .iter()
        .rposition(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        .unwrap_or(messages.len().min(1));
    messages.insert(insert_at.max(1), volatile);
}
