mod request;

use super::super::types::ProtocolCatalogEntry;

pub(crate) const PROTOCOL_ID: &str = "openai_chat_completions";
pub(crate) const PROTOCOL_FAMILY: &str = "openai_chat_completions";

pub(crate) use super::openai_common::{
    AsyncSseReader, ReasoningAccumulator, SseEvent, SseReader, StreamingThinkScrubber,
    StreamingToolCallAccumulator, finalize_streaming_tool_calls, is_valid_tool_call_id,
    message_content, message_reasoning_text, parse_tool_call, reasoning_replay_items,
    repair_tool_name, scrub_think_blocks, scrub_tool_markup, tool_name_set,
    validate_tool_call_arguments,
};
pub(crate) use request::{
    ReasoningReplayPolicy, build_request_body, enforce_tool_choice_support, wire_messages,
};

pub(crate) fn catalog_entry() -> ProtocolCatalogEntry {
    ProtocolCatalogEntry {
        id: PROTOCOL_ID.to_string(),
        family: PROTOCOL_FAMILY.to_string(),
        label: "OpenAI Chat Completions".to_string(),
        transport: "http_json_stream".to_string(),
        runtime_supported: true,
        streaming_supported: true,
        tool_calling_supported: true,
    }
}
