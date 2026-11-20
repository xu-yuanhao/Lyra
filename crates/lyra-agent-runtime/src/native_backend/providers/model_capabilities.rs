use std::collections::HashMap;

use serde_json::{Value, json};

use crate::{
    AgentRuntimeError, ProviderFailureCategory,
    native_backend::{
        CapabilitySupport, NativeCapabilityEvidence, NativeModelCapabilityRecord,
        NativeProviderModel, NativeProviderProfile, ReasoningReplayField, state,
    },
};

use super::{registry, types::ProviderRouteDescriptor};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct OpenAiChatModelCapabilities {
    pub(crate) reasoning_replay_field: ReasoningReplayField,
    pub(crate) requires_reasoning_field_on_assistant_messages: bool,
    pub(crate) supports_tool_choice: bool,
}

impl Default for OpenAiChatModelCapabilities {
    fn default() -> Self {
        Self {
            reasoning_replay_field: ReasoningReplayField::None,
            requires_reasoning_field_on_assistant_messages: false,
            // Unknown OpenAI-compatible routes are not guaranteed to support
            // forced tool choice. Exact built-ins or explicit model settings
            // opt in below.
            supports_tool_choice: false,
        }
    }
}

pub(crate) const INPUT_TEXT: &str = "input.text";
pub(crate) const INPUT_IMAGE: &str = "input.image";
pub(crate) const INPUT_AUDIO: &str = "input.audio";
pub(crate) const INPUT_VIDEO: &str = "input.video";
pub(crate) const INPUT_PDF: &str = "input.pdf";
pub(crate) const OUTPUT_TEXT: &str = "output.text";
pub(crate) const OUTPUT_IMAGE: &str = "output.image";
pub(crate) const OUTPUT_AUDIO: &str = "output.audio";
pub(crate) const OUTPUT_VIDEO: &str = "output.video";
pub(crate) const OPERATION_LANGUAGE: &str = "operation.language";
pub(crate) const OPERATION_IMAGE_GENERATION: &str = "operation.imageGeneration";
pub(crate) const OPERATION_SPEECH_GENERATION: &str = "operation.speechGeneration";
pub(crate) const OPERATION_TRANSCRIPTION: &str = "operation.transcription";
pub(crate) const OPERATION_VIDEO_GENERATION: &str = "operation.videoGeneration";
pub(crate) const FEATURE_TOOL_CALLING: &str = "feature.toolCalling";
pub(crate) const FEATURE_TOOL_CHOICE: &str = "feature.toolChoice";
pub(crate) const FEATURE_STREAMING: &str = "feature.streaming";
pub(crate) const FEATURE_STRUCTURED_OUTPUT: &str = "feature.structuredOutput";
pub(crate) const FEATURE_REASONING: &str = "feature.reasoning";
pub(crate) const FEATURE_REASONING_EFFORT: &str = "feature.reasoningEffort";
pub(crate) const FEATURE_TEMPERATURE: &str = "feature.temperature";

pub(crate) const CAPABILITY_KEYS: [&str; 21] = [
    INPUT_TEXT,
    INPUT_IMAGE,
    INPUT_AUDIO,
    INPUT_VIDEO,
    INPUT_PDF,
    OUTPUT_TEXT,
    OUTPUT_IMAGE,
    OUTPUT_AUDIO,
    OUTPUT_VIDEO,
    OPERATION_LANGUAGE,
    OPERATION_IMAGE_GENERATION,
    OPERATION_SPEECH_GENERATION,
    OPERATION_TRANSCRIPTION,
    OPERATION_VIDEO_GENERATION,
    FEATURE_TOOL_CALLING,
    FEATURE_TOOL_CHOICE,
    FEATURE_STREAMING,
    FEATURE_STRUCTURED_OUTPUT,
    FEATURE_REASONING,
    FEATURE_REASONING_EFFORT,
    FEATURE_TEMPERATURE,
];

pub(crate) fn is_known_capability_key(key: &str) -> bool {
    CAPABILITY_KEYS.contains(&key)
}

pub(crate) fn protocol_can_execute(protocol_id: &str, route_id: &str, key: &str) -> bool {
    use super::protocol::{
        anthropic_messages, aws_bedrock_converse, gemini_generate_content, ollama_chat,
        openai_chat_completions, openai_responses,
    };
    match key {
        INPUT_TEXT | OUTPUT_TEXT | OPERATION_LANGUAGE | FEATURE_STREAMING => true,
        FEATURE_TOOL_CALLING => registry::protocol_catalog()
            .into_iter()
            .find(|entry| entry.id == protocol_id)
            .is_some_and(|entry| entry.tool_calling_supported),
        FEATURE_TOOL_CHOICE => matches!(
            protocol_id,
            openai_chat_completions::PROTOCOL_ID
                | openai_responses::PROTOCOL_ID
                | anthropic_messages::PROTOCOL_ID
                | gemini_generate_content::PROTOCOL_ID
                | aws_bedrock_converse::PROTOCOL_ID
                | ollama_chat::PROTOCOL_ID
        ),
        INPUT_IMAGE => matches!(
            protocol_id,
            openai_chat_completions::PROTOCOL_ID
                | openai_responses::PROTOCOL_ID
                | anthropic_messages::PROTOCOL_ID
                | gemini_generate_content::PROTOCOL_ID
                | aws_bedrock_converse::PROTOCOL_ID
                | ollama_chat::PROTOCOL_ID
        ),
        INPUT_AUDIO => matches!(
            protocol_id,
            openai_chat_completions::PROTOCOL_ID
                | gemini_generate_content::PROTOCOL_ID
                | aws_bedrock_converse::PROTOCOL_ID
        ),
        INPUT_VIDEO => matches!(
            protocol_id,
            gemini_generate_content::PROTOCOL_ID | aws_bedrock_converse::PROTOCOL_ID
        ),
        INPUT_PDF => matches!(
            protocol_id,
            openai_responses::PROTOCOL_ID
                | anthropic_messages::PROTOCOL_ID
                | gemini_generate_content::PROTOCOL_ID
                | aws_bedrock_converse::PROTOCOL_ID
        ),
        OPERATION_IMAGE_GENERATION | OPERATION_SPEECH_GENERATION | OPERATION_TRANSCRIPTION => {
            matches!(
                protocol_id,
                openai_chat_completions::PROTOCOL_ID | openai_responses::PROTOCOL_ID
            )
        }
        OPERATION_VIDEO_GENERATION => route_id == super::routes::xai::ROUTE_ID,
        OUTPUT_IMAGE | OUTPUT_AUDIO | OUTPUT_VIDEO => true,
        FEATURE_REASONING => matches!(
            protocol_id,
            openai_chat_completions::PROTOCOL_ID | openai_responses::PROTOCOL_ID
        ),
        FEATURE_REASONING_EFFORT => matches!(
            protocol_id,
            openai_chat_completions::PROTOCOL_ID
                | openai_responses::PROTOCOL_ID
                | anthropic_messages::PROTOCOL_ID
                | gemini_generate_content::PROTOCOL_ID
        ),
        // These fields are catalogued now, but no generic runtime request
        // control exists yet. They remain non-executable rather than causing
        // optional-parameter 400s.
        FEATURE_STRUCTURED_OUTPUT | FEATURE_TEMPERATURE => false,
        _ => false,
    }
}

pub(crate) fn record_from_discovered_model(
    model: &NativeProviderModel,
    source: &str,
    source_url: Option<&str>,
) -> NativeModelCapabilityRecord {
    let mut record = NativeModelCapabilityRecord::default();
    let observed_at = chrono::Utc::now().to_rfc3339();
    // A plain /models entry proves that the model exists, not that it is a
    // language model. Text defaults remain protocol fallbacks until the API or
    // a sourced catalog explicitly reports modalities.
    if model.supports_image_input {
        record
            .detected
            .insert(INPUT_IMAGE.to_string(), CapabilitySupport::Supported);
    }
    if model.supports_tool_calling {
        record.detected.insert(
            FEATURE_TOOL_CALLING.to_string(),
            CapabilitySupport::Supported,
        );
    }
    if model.supports_streaming {
        record
            .detected
            .insert(FEATURE_STREAMING.to_string(), CapabilitySupport::Supported);
    }
    if let Some(value) = model.supports_reasoning_effort {
        record.detected.insert(
            FEATURE_REASONING_EFFORT.to_string(),
            if value {
                CapabilitySupport::Supported
            } else {
                CapabilitySupport::Unsupported
            },
        );
    }
    if let Some(value) = model.supports_tool_choice {
        record.detected.insert(
            FEATURE_TOOL_CHOICE.to_string(),
            if value {
                CapabilitySupport::Supported
            } else {
                CapabilitySupport::Unsupported
            },
        );
    }
    for key in record.detected.keys().cloned().collect::<Vec<_>>() {
        record.evidence.insert(
            key,
            NativeCapabilityEvidence {
                source: source.to_string(),
                conflict: false,
                source_url: source_url.map(str::to_string),
                observed_at: Some(observed_at.clone()),
                detail: None,
            },
        );
    }
    record
}

pub(crate) fn discovered_model(
    id: impl Into<String>,
    label: Option<String>,
    context_window: Option<usize>,
    route: Option<&ProviderRouteDescriptor>,
    api_modalities: Option<&[String]>,
) -> NativeProviderModel {
    let (supports_tool_calling, supports_streaming) = protocol_capability_defaults(route);
    let id_string = id.into();
    let supports_image_input =
        api_modalities.is_some_and(|modalities| modalities.iter().any(|m| m == "image"));
    NativeProviderModel {
        id: id_string,
        label,
        context_window,
        supports_image_input,
        supports_tool_calling,
        supports_streaming,
        supports_reasoning_effort: None,
        reasoning_replay_field: ReasoningReplayField::Auto,
        requires_reasoning_field_on_assistant_messages: None,
        supports_tool_choice: None,
        enabled: true,
        api_npm: None,
    }
}

pub(crate) fn merge_discovered_models(
    existing: &[NativeProviderModel],
    discovered: Vec<NativeProviderModel>,
) -> Vec<NativeProviderModel> {
    let existing_by_id = existing
        .iter()
        .map(|model| (model.id.as_str(), model))
        .collect::<HashMap<_, _>>();
    let mut merged = discovered
        .into_iter()
        .map(|mut model| {
            let Some(previous) = existing_by_id.get(model.id.as_str()) else {
                return model;
            };
            // Discovery replaces the detected layer. User choices are stored in
            // the separate capability override table and must not be OR-merged
            // back into newly discovered facts.
            model.supports_reasoning_effort = previous.supports_reasoning_effort;
            model.reasoning_replay_field = previous.reasoning_replay_field;
            model.requires_reasoning_field_on_assistant_messages =
                previous.requires_reasoning_field_on_assistant_messages;
            model.supports_tool_choice = previous.supports_tool_choice;
            model.context_window = model.context_window.or(previous.context_window);
            if model.label.as_deref().unwrap_or("").trim().is_empty() {
                model.label = previous.label.clone();
            }
            model.enabled = previous.enabled;
            if model.api_npm.is_none() {
                model.api_npm = previous.api_npm.clone();
            }
            model
        })
        .collect::<Vec<_>>();
    let discovered_ids = merged
        .iter()
        .map(|model| model.id.clone())
        .collect::<std::collections::HashSet<_>>();
    merged.extend(
        existing
            .iter()
            .filter(|model| !discovered_ids.contains(&model.id))
            .cloned(),
    );
    merged
}

fn route_reasoning_replay_field(route_id: &str) -> Option<ReasoningReplayField> {
    super::routes::mimo::default_reasoning_replay_field(route_id)
        .or_else(|| super::routes::poolside::default_reasoning_replay_field(route_id))
        .or_else(|| super::routes::deepseek::default_reasoning_replay_field(route_id))
}

fn apply_route_reasoning_defaults(route_id: &str, resolved: &mut OpenAiChatModelCapabilities) {
    if let Some(field) = route_reasoning_replay_field(route_id) {
        resolved.reasoning_replay_field = field;
    }
    if let Some(required) =
        super::routes::poolside::default_requires_reasoning_field_on_assistant_messages(route_id)
            .or_else(|| {
                super::routes::deepseek::default_requires_reasoning_field_on_assistant_messages(
                    route_id,
                )
            })
    {
        resolved.requires_reasoning_field_on_assistant_messages = required;
    }
}

pub(crate) fn resolve_openai_chat_model_capabilities(
    provider: &NativeProviderProfile,
    model_id: &str,
) -> OpenAiChatModelCapabilities {
    let mut resolved = OpenAiChatModelCapabilities::default();
    apply_route_reasoning_defaults(&provider.route_id, &mut resolved);
    if let Some(field) =
        super::models_dev::cached_reasoning_replay_field(&provider.route_id, model_id)
    {
        resolved.reasoning_replay_field = field;
    }
    if let Some(model) = provider.models.iter().find(|model| model.id == model_id) {
        if model.reasoning_replay_field != ReasoningReplayField::Auto {
            resolved.reasoning_replay_field = model.reasoning_replay_field;
        }
        if let Some(required) = model.requires_reasoning_field_on_assistant_messages {
            resolved.requires_reasoning_field_on_assistant_messages = required;
        }
        if let Some(supported) = model.supports_tool_choice {
            resolved.supports_tool_choice = supported;
        }
    }
    if let Ok(state) = state().try_lock()
        && let Some(record) = state
            .model_capabilities
            .get(&provider.id)
            .and_then(|records| records.get(model_id))
    {
        if let Some(field) = record.reasoning_replay_field_override {
            resolved.reasoning_replay_field = field;
        }
        if let Some(required) = record.assistant_reasoning_field_required_override {
            resolved.requires_reasoning_field_on_assistant_messages = required;
        }
        resolved.supports_tool_choice =
            record.resolved(FEATURE_TOOL_CHOICE, resolved.supports_tool_choice);
    }
    resolved
}

pub(crate) fn is_image_input_unsupported_error(error: &AgentRuntimeError) -> bool {
    let AgentRuntimeError::ProviderFailure { failure } = error else {
        return false;
    };
    if failure.category != ProviderFailureCategory::Capability {
        return false;
    }
    let stable_id = failure
        .provider_code
        .as_deref()
        .or(failure.provider_type.as_deref())
        .map(|value| value.trim().to_ascii_lowercase());
    matches!(
        stable_id.as_deref(),
        Some(
            "image_input_unsupported"
                | "unsupported_image_input"
                | "unsupported_multimodal_input"
                | "vision_not_supported"
        )
    )
}

pub(crate) fn is_tool_calling_unsupported_error(error: &AgentRuntimeError) -> bool {
    let AgentRuntimeError::ProviderFailure { failure } = error else {
        return false;
    };
    let stable_id = failure
        .provider_code
        .as_deref()
        .or(failure.provider_type.as_deref())
        .map(|value| value.trim().to_ascii_lowercase());
    if matches!(
        stable_id.as_deref(),
        Some(
            "tool_calling_unsupported"
                | "unsupported_tool_calling"
                | "tools_not_supported"
                | "function_calling_unsupported"
        )
    ) {
        return true;
    }
    if !matches!(failure.http_status, Some(400 | 422)) {
        return false;
    }
    let provider_payload = failure.message.to_ascii_lowercase();
    provider_payload.contains("tool calling is not supported")
        || provider_payload.contains("tool use is not supported")
        || provider_payload.contains("does not support tool calling")
        || provider_payload.contains("does not support tools")
}

pub(crate) fn unsupported_media_input_capability(
    error: &AgentRuntimeError,
) -> Option<&'static str> {
    let AgentRuntimeError::ProviderFailure { failure } = error else {
        return None;
    };
    if !matches!(failure.http_status, Some(400 | 415 | 422))
        && failure.category != ProviderFailureCategory::Capability
    {
        return None;
    }
    let stable_id = failure
        .provider_code
        .as_deref()
        .or(failure.provider_type.as_deref())
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let provider_payload = failure.message.to_ascii_lowercase();
    for (key, tokens) in [
        (
            INPUT_AUDIO,
            [
                "audio_input_unsupported",
                "unsupported_audio_input",
                "audio input is not supported",
                "does not support audio",
            ],
        ),
        (
            INPUT_VIDEO,
            [
                "video_input_unsupported",
                "unsupported_video_input",
                "video input is not supported",
                "does not support video",
            ],
        ),
        (
            INPUT_PDF,
            [
                "pdf_input_unsupported",
                "unsupported_pdf_input",
                "pdf input is not supported",
                "does not support pdf",
            ],
        ),
    ] {
        if tokens
            .iter()
            .any(|token| stable_id == *token || provider_payload.contains(token))
        {
            return Some(key);
        }
    }
    None
}

pub(crate) fn remember_runtime_rejection(
    provider_id: &str,
    model_id: &str,
    capability: &str,
    detail: &str,
) {
    let Ok(mut state) = state().lock() else {
        return;
    };
    let record = state
        .model_capabilities
        .entry(provider_id.to_string())
        .or_default()
        .entry(model_id.to_string())
        .or_default();
    record.runtime_rejections.insert(
        capability.to_string(),
        NativeCapabilityEvidence {
            source: "runtime_rejection".to_string(),
            conflict: false,
            source_url: None,
            observed_at: Some(chrono::Utc::now().to_rfc3339()),
            detail: Some(detail.to_string()),
        },
    );
    record.recompute_runtime_conflict();
    let _ = state.save_state();
}

// Single resolution entry point shared by the catalog, request mapping, and
// tool gating. Priority: user override > runtime rejection > detected >
// models.dev catalog (when detected is absent) > provider-metadata fallback.
// `protocol_can_execute` caps every layer (it can only press a claim down,
// never lift one).
pub(crate) fn effective_capability(
    record: Option<&NativeModelCapabilityRecord>,
    protocol_id: &str,
    route_id: &str,
    key: &str,
    metadata_fallback: bool,
) -> bool {
    let declared = record
        .map(|record| record.resolved(key, metadata_fallback))
        .unwrap_or(metadata_fallback);
    declared && protocol_can_execute(protocol_id, route_id, key)
}

pub(crate) fn effective_capability_for_model(
    record: Option<&NativeModelCapabilityRecord>,
    protocol_id: &str,
    route_id: &str,
    model_id: &str,
    key: &str,
    metadata_fallback: bool,
) -> bool {
    let fallback = super::models_dev::cached_capability(route_id, model_id, key)
        .and_then(CapabilitySupport::as_bool)
        .unwrap_or(metadata_fallback);
    effective_capability(record, protocol_id, route_id, key, fallback)
}

pub(crate) fn strip_images_from_provider_messages(
    messages: Vec<Value>,
) -> (Vec<Value>, Vec<Value>) {
    let mut downgrades = Vec::new();
    let stripped = messages
        .into_iter()
        .map(|message| strip_images_from_provider_message(message, &mut downgrades))
        .collect();
    (stripped, downgrades)
}

pub(crate) fn strip_media_from_provider_messages(
    messages: Vec<Value>,
    capability: &str,
) -> (Vec<Value>, Vec<Value>) {
    let mut downgrades = Vec::new();
    let media_prefix = match capability {
        INPUT_AUDIO => "audio/",
        INPUT_VIDEO => "video/",
        INPUT_PDF => "application/pdf",
        _ => return (messages, downgrades),
    };
    let messages = messages
        .into_iter()
        .map(|mut message| {
            let message_id = message.get("id").cloned().unwrap_or(Value::Null);
            let Some(parts) = message.get_mut("content").and_then(Value::as_array_mut) else {
                return message;
            };
            let mut next = Vec::with_capacity(parts.len());
            for part in parts.drain(..) {
                let media_type = part
                    .get("media_type")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                let matches = part.get("type").and_then(Value::as_str) == Some("input_media")
                    && if capability == INPUT_PDF {
                        media_type == media_prefix
                    } else {
                        media_type.starts_with(media_prefix)
                    };
                if matches {
                    downgrades.push(json!({
                        "messageId": message_id,
                        "reason": format!("provider_rejected_{capability}"),
                        "source": "runtime_retry",
                    }));
                    next.push(json!({
                        "type": "text",
                        "text": format!("[Media omitted: provider_rejected_{capability}]")
                    }));
                } else {
                    next.push(part);
                }
            }
            message["content"] = Value::Array(next);
            message
        })
        .collect();
    (messages, downgrades)
}

pub(crate) fn protocol_capability_defaults(
    route: Option<&ProviderRouteDescriptor>,
) -> (bool, bool) {
    let Some(route) = route else {
        return (false, false);
    };
    registry::protocol_catalog()
        .into_iter()
        .find(|entry| entry.id == route.protocol_id)
        // Optimistic on tool calling: whenever the protocol can encode tools,
        // claim support so capable models are not locked out of tools. Models
        // that actually reject tool calls are downgraded at request time and
        // permanently recorded via remember_runtime_rejection, which outranks
        // this default in effective_capability.
        .map(|entry| (entry.tool_calling_supported, entry.streaming_supported))
        .unwrap_or((false, false))
}

fn strip_images_from_provider_message(mut message: Value, downgrades: &mut Vec<Value>) -> Value {
    let message_id = message.get("id").cloned().unwrap_or(Value::Null);
    let Some(content) = message.get_mut("content") else {
        return message;
    };
    let Value::Array(parts) = content else {
        return message;
    };
    let mut next_parts = Vec::new();
    for part in parts.iter() {
        if part.get("type").and_then(Value::as_str) == Some("image_url") {
            downgrades.push(json!({
                "messageId": message_id,
                "reason": "provider_rejected_image_input",
                "source": "runtime_retry",
            }));
            next_parts.push(json!({
                "type": "text",
                "text": "[Image omitted: provider_rejected_image_input]",
            }));
            continue;
        }
        next_parts.push(part.clone());
    }
    message["content"] = Value::Array(next_parts);
    message
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ProviderFailure;
    use crate::native_backend::CapabilityOverride;

    fn rejected_record(key: &str) -> NativeModelCapabilityRecord {
        let mut record = NativeModelCapabilityRecord::default();
        record
            .detected
            .insert(key.to_string(), CapabilitySupport::Supported);
        record.runtime_rejections.insert(
            key.to_string(),
            NativeCapabilityEvidence {
                source: "runtime_rejection".to_string(),
                conflict: false,
                source_url: None,
                observed_at: None,
                detail: Some("400".to_string()),
            },
        );
        record
    }

    #[test]
    fn runtime_rejection_beats_detected_and_metadata_fallback() {
        let record = rejected_record(INPUT_IMAGE);
        assert!(!record.resolved(INPUT_IMAGE, true));
        assert!(!effective_capability(
            Some(&record),
            super::super::protocol::openai_chat_completions::PROTOCOL_ID,
            "test-route",
            INPUT_IMAGE,
            true,
        ));
        // With no record at all the metadata fallback still applies.
        assert!(effective_capability(
            None,
            super::super::protocol::openai_chat_completions::PROTOCOL_ID,
            "test-route",
            INPUT_IMAGE,
            true,
        ));
        assert_eq!(
            effective_capability_for_model(
                None,
                super::super::protocol::openai_chat_completions::PROTOCOL_ID,
                "test-route",
                "unknown-model",
                INPUT_IMAGE,
                true,
            ),
            effective_capability(
                None,
                super::super::protocol::openai_chat_completions::PROTOCOL_ID,
                "test-route",
                INPUT_IMAGE,
                true,
            )
        );
    }

    #[test]
    fn forced_override_keeps_conflict_but_protocol_still_caps() {
        let mut record = rejected_record(INPUT_IMAGE);
        record
            .overrides
            .insert(INPUT_IMAGE.to_string(), CapabilityOverride::Supported);
        record.recompute_runtime_conflict();
        assert!(record.runtime_conflict.is_some());
        // The user override wins over the rejection...
        assert!(record.resolved(INPUT_IMAGE, false));
        // ...but the protocol still caps what is executable.
        assert!(!effective_capability(
            Some(&record),
            "no-such-protocol",
            "test-route",
            INPUT_IMAGE,
            false,
        ));
        assert!(effective_capability(
            Some(&record),
            super::super::protocol::openai_chat_completions::PROTOCOL_ID,
            "test-route",
            INPUT_IMAGE,
            false,
        ));

        // Unsupported override forces false regardless of detected state.
        record
            .overrides
            .insert(INPUT_IMAGE.to_string(), CapabilityOverride::Unsupported);
        assert!(!record.resolved(INPUT_IMAGE, false));

        // Clearing the rejection and the override clears the conflict.
        record.overrides.remove(INPUT_IMAGE);
        record.runtime_rejections.remove(INPUT_IMAGE);
        record.recompute_runtime_conflict();
        assert!(record.runtime_conflict.is_none());
    }

    #[test]
    fn capability_record_serializes_rejections_and_reads_legacy_state() {
        let record = rejected_record(FEATURE_TOOL_CALLING);
        let serialized = serde_json::to_string(&record).expect("serialize record");
        assert!(serialized.contains("runtimeRejections"));
        let roundtrip: NativeModelCapabilityRecord =
            serde_json::from_str(&serialized).expect("deserialize record");
        assert!(
            roundtrip
                .runtime_rejections
                .contains_key(FEATURE_TOOL_CALLING)
        );

        // Records written before the rejections layer existed load unchanged.
        let legacy: NativeModelCapabilityRecord =
            serde_json::from_str(r#"{"detected":{"feature.toolCalling":"supported"}}"#)
                .expect("deserialize legacy record");
        assert!(legacy.runtime_rejections.is_empty());
        assert_eq!(
            legacy.detected.get(FEATURE_TOOL_CALLING),
            Some(&CapabilitySupport::Supported)
        );
    }

    #[test]
    fn image_input_error_detection_matches_provider_rejection() {
        let error = AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                provider_id: "test".to_string(),
                route_id: "test".to_string(),
                http_status: Some(400),
                provider_code: Some("image_input_unsupported".to_string()),
                provider_type: None,
                retry_after_ms: None,
                category: ProviderFailureCategory::Capability,
                message: "image input rejected".to_string(),
                body_preview: None,
            },
        };
        assert!(is_image_input_unsupported_error(&error));
    }

    #[test]
    fn unrelated_capability_errors_do_not_disable_image_input() {
        let error = AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                provider_id: "test".to_string(),
                route_id: "test".to_string(),
                http_status: Some(400),
                provider_code: Some("tool_calling_unsupported".to_string()),
                provider_type: None,
                retry_after_ms: None,
                category: ProviderFailureCategory::Capability,
                message: "tool calling rejected".to_string(),
                body_preview: None,
            },
        };
        assert!(!is_image_input_unsupported_error(&error));
    }

    #[test]
    fn audio_rejection_is_classified_and_only_audio_blocks_are_removed() {
        let error = AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                provider_id: "test".to_string(),
                route_id: "test".to_string(),
                http_status: Some(400),
                provider_code: None,
                provider_type: Some("invalid_request_error".to_string()),
                retry_after_ms: None,
                category: ProviderFailureCategory::Capability,
                message: "audio input is not supported with this model".to_string(),
                body_preview: None,
            },
        };
        assert_eq!(
            unsupported_media_input_capability(&error),
            Some(INPUT_AUDIO)
        );
        let (messages, downgrades) = strip_media_from_provider_messages(
            vec![json!({
                "id": "message-1",
                "role": "user",
                "content": [
                    { "type": "input_media", "media_type": "audio/mpeg", "data": "abc" },
                    { "type": "input_media", "media_type": "application/pdf", "data": "def" }
                ]
            })],
            INPUT_AUDIO,
        );
        assert_eq!(downgrades.len(), 1);
        assert_eq!(messages[0]["content"].as_array().unwrap().len(), 2);
        assert_eq!(messages[0]["content"][1]["media_type"], "application/pdf");
    }

    #[test]
    fn merge_discovered_models_replaces_detected_booleans_but_preserves_user_fields() {
        let existing = vec![NativeProviderModel {
            id: "mimo-v2.5-pro".to_string(),
            label: Some("MiMo v2.5 Pro".to_string()),
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::ReasoningContent,
            requires_reasoning_field_on_assistant_messages: Some(true),
            supports_tool_choice: Some(false),
            enabled: true,
            api_npm: None,
        }];
        let discovered = vec![discovered_model(
            "mimo-v2.5-pro",
            Some("mimo-v2.5-pro".to_string()),
            None,
            None,
            None,
        )];
        let merged = merge_discovered_models(&existing, discovered);
        assert_eq!(merged.len(), 1);
        assert!(!merged[0].supports_image_input);
        assert!(!merged[0].supports_tool_calling);
        assert_eq!(
            merged[0].reasoning_replay_field,
            ReasoningReplayField::ReasoningContent
        );
        assert_eq!(
            merged[0].requires_reasoning_field_on_assistant_messages,
            Some(true)
        );
        assert_eq!(merged[0].supports_tool_choice, Some(false));
    }

    #[test]
    fn openai_compatible_models_require_explicit_advanced_fields() {
        let mut provider = NativeProviderProfile {
            id: "zen-mirror".to_string(),
            label: "Zen Mirror".to_string(),
            route_id: super::super::routes::custom_openai_compatible::ROUTE_ID.to_string(),
            base_url: Some("https://opencode.ai/zen/v1".to_string()),
            default_model: Some("deepseek-v4-flash-free".to_string()),
            api_key: None,
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        };
        let builtin = resolve_openai_chat_model_capabilities(&provider, "deepseek-v4-flash-free");
        assert_eq!(builtin, OpenAiChatModelCapabilities::default());
        assert_eq!(
            resolve_openai_chat_model_capabilities(
                &provider,
                "vendor/deepseek-v4-flash-free-preview"
            ),
            OpenAiChatModelCapabilities::default()
        );

        let mut explicit = discovered_model(
            "deepseek-v4-flash-free",
            Some("DeepSeek V4 Flash Free".to_string()),
            None,
            None,
            None,
        );
        explicit.reasoning_replay_field = ReasoningReplayField::None;
        explicit.requires_reasoning_field_on_assistant_messages = Some(false);
        explicit.supports_tool_choice = Some(true);
        provider.models.push(explicit);
        let resolved = resolve_openai_chat_model_capabilities(&provider, "deepseek-v4-flash-free");
        assert_eq!(resolved.reasoning_replay_field, ReasoningReplayField::None);
        assert!(!resolved.requires_reasoning_field_on_assistant_messages);
        assert!(resolved.supports_tool_choice);
    }

    #[test]
    fn unknown_openai_compatible_model_does_not_assume_forced_tool_choice() {
        let provider = NativeProviderProfile {
            id: "custom".to_string(),
            label: "Custom".to_string(),
            route_id: super::super::routes::custom_openai_compatible::ROUTE_ID.to_string(),
            base_url: Some("https://example.invalid/v1".to_string()),
            default_model: Some("unknown-model".to_string()),
            api_key: None,
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: Vec::new(),
        };

        assert!(
            !resolve_openai_chat_model_capabilities(&provider, "unknown-model")
                .supports_tool_choice
        );
    }

    #[test]
    fn omitted_tool_flag_is_conservative_while_streaming_uses_route_default() {
        let model: NativeProviderModel = serde_json::from_value(json!({
            "id": "deepseek-v4-flash",
            "enabled": true
        }))
        .expect("model");
        assert!(!model.supports_tool_calling);
        assert!(model.supports_streaming);
        assert!(!model.supports_image_input);
    }

    #[test]
    fn legacy_model_json_defaults_new_protocol_capabilities() {
        let model: NativeProviderModel = serde_json::from_value(json!({
            "id": "legacy-model",
            "label": null,
            "contextWindow": null,
            "supportsImageInput": false,
            "supportsToolCalling": true,
            "supportsStreaming": true,
            "enabled": true
        }))
        .expect("legacy provider model");
        assert_eq!(model.reasoning_replay_field, ReasoningReplayField::Auto);
        assert_eq!(model.requires_reasoning_field_on_assistant_messages, None);
        assert_eq!(model.supports_tool_choice, None);
        let serialized = serde_json::to_value(model).expect("serialize model");
        assert_eq!(serialized["reasoningReplayField"], "auto");
    }

    #[test]
    fn strip_images_from_provider_messages_replaces_image_blocks() {
        let (messages, downgrades) = strip_images_from_provider_messages(vec![json!({
            "role": "user",
            "content": [
                { "type": "text", "text": "see this" },
                { "type": "image_url", "image_url": { "url": "data:image/png;base64,abc" } }
            ]
        })]);
        assert_eq!(downgrades.len(), 1);
        let parts = messages[0]["content"].as_array().unwrap();
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[1]["type"], "text");
        assert!(
            parts[1]["text"]
                .as_str()
                .unwrap()
                .contains("provider_rejected_image_input")
        );
    }

    #[test]
    fn merge_does_not_infer_multimodal_from_model_id() {
        // Simulates persisted state with supports_image_input: false
        // being merged with a re-discovered model that infers true.
        let existing = vec![NativeProviderModel {
            id: "mimo-v2.5-free".to_string(),
            label: Some("MiMo-V2.5 Free".to_string()),
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
        }];
        let discovered = vec![discovered_model(
            "mimo-v2.5-free",
            Some("mimo-v2.5-free".to_string()),
            None,
            None,
            None,
        )];
        let merged = merge_discovered_models(&existing, discovered);
        assert_eq!(merged.len(), 1);
        assert!(!merged[0].supports_image_input);
    }

    #[test]
    fn merge_replaces_legacy_true_with_new_discovery_result() {
        let existing = vec![NativeProviderModel {
            id: "mimo-v2-flash".to_string(),
            label: None,
            context_window: None,
            supports_image_input: true, // user confirmed it works
            supports_tool_calling: true,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }];
        let discovered = vec![discovered_model(
            "mimo-v2-flash",
            Some("mimo-v2-flash".to_string()),
            None,
            None,
            None,
        )];
        let merged = merge_discovered_models(&existing, discovered);
        assert_eq!(merged.len(), 1);
        assert!(!merged[0].supports_image_input);
    }

    #[test]
    fn model_ids_do_not_mutate_persisted_image_capabilities() {
        let models = vec![
            NativeProviderModel {
                id: "mimo-v2.5-free".to_string(),
                label: None,
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
            },
            NativeProviderModel {
                id: "mimo-v2.5-pro".to_string(),
                label: None,
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
            },
        ];
        assert!(!models[0].supports_image_input);
        assert!(!models[1].supports_image_input);
    }

    #[test]
    fn discovered_model_with_api_image_modalities() {
        let modalities = vec!["text".to_string(), "image".to_string()];
        let model = discovered_model("unknown-model", None, None, None, Some(&modalities));
        assert!(model.supports_image_input);
    }

    #[test]
    fn discovered_model_with_api_text_only_modalities() {
        let modalities = vec!["text".to_string()];
        let model = discovered_model("mimo-v2.5", None, None, None, Some(&modalities));
        assert!(!model.supports_image_input);
    }

    #[test]
    fn discovered_model_without_modalities_stays_conservative() {
        let model = discovered_model("mimo-v2.5", None, None, None, None);
        assert!(!model.supports_image_input);
        assert!(!model.supports_tool_calling);
    }

    #[test]
    fn merge_discovered_models_upgrades_stale_false_tool_flags() {
        let existing = vec![NativeProviderModel {
            id: "deepseek-v4-flash".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }];
        let mut discovered = discovered_model(
            "deepseek-v4-flash",
            Some("deepseek-v4-flash".to_string()),
            None,
            None,
            None,
        );
        discovered.supports_tool_calling = true;
        discovered.supports_streaming = true;
        let merged = merge_discovered_models(&existing, vec![discovered]);
        assert!(merged[0].supports_tool_calling);
        assert!(merged[0].supports_streaming);
    }

    #[test]
    fn legacy_false_flags_are_not_optimistically_restored() {
        let models = vec![NativeProviderModel {
            id: "deepseek-v4-flash".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }];
        assert!(!models[0].supports_tool_calling);
        assert!(!models[0].supports_streaming);
    }
}
