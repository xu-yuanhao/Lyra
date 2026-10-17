use serde_json::Value;

use crate::{AgentRuntimeError, ProviderProtocolFailureKind};

pub(crate) const TEXTUAL_TOOL_CALL_MARKER: &str = "[Tool call:";
pub(crate) const TEXTUAL_TOOL_RESULT_REF_MARKER: &str = "[Tool result ref:";
pub(crate) const TOOL_OUTPUT_TRUNCATED_MARKER: &str = "[Tool output truncated";
pub(crate) const TOOL_OUTPUT_OMITTED_SUMMARY: &str =
    "[Earlier tool output omitted from provider context; full result remains in session evidence.]";
pub(crate) const TOOL_OUTPUT_CLEARED_SUMMARY: &str = "[Old tool result content cleared]";

pub(crate) fn clip_chars_head_tail(text: &str, max_chars: usize, footer: &str) -> String {
    if max_chars == 0 {
        return String::new();
    }
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max_chars {
        return text.to_string();
    }
    let head = ((max_chars as f64) * 0.75) as usize;
    let head = head.max(1).min(max_chars);
    let tail = max_chars.saturating_sub(head);
    let head_text: String = chars[..head].iter().collect();
    if tail == 0 {
        return format!("{head_text}\n\n{footer}");
    }
    let tail_start = chars.len().saturating_sub(tail);
    let tail_text: String = chars[tail_start..].iter().collect();
    format!("{head_text}\n\n{footer}\n\n{tail_text}")
}

/// One shared budget for every "model behavior needs correcting" retry in the
/// thinking loop (reasoning-only, terminal-empty, truncated tool call, protocol
/// leak, missing tool call). Reference agents keep a single correction budget
/// and fail up when it is exhausted; per-kind counters multiply independent
/// failure surfaces without adding recovery power.
pub(crate) const MAX_MODEL_CORRECTION_RETRIES: u8 = 3;

pub(crate) fn max_model_correction_retry() -> u8 {
    MAX_MODEL_CORRECTION_RETRIES
}

pub(crate) fn strip_internal_protocol_markers(text: &str) -> String {
    strip_internal_protocol_markers_preserve_whitespace(text)
}

fn strip_internal_protocol_markers_preserve_whitespace(text: &str) -> String {
    let mut output = strip_incomplete_trailing_internal_marker(text);
    for marker in internal_protocol_markers() {
        while let Some(start) = find_ascii_case_insensitive(&output, marker, 0) {
            let end = output[start..]
                .find(']')
                .map(|offset| start + offset + 1)
                .unwrap_or(output.len());
            let replace_start = output[..start]
                .chars()
                .next_back()
                .filter(|ch| matches!(ch, ' ' | '\t'))
                .map(|ch| start - ch.len_utf8())
                .unwrap_or(start);
            output.replace_range(replace_start..end, "");
        }
    }
    output
}

fn strip_incomplete_trailing_internal_marker(text: &str) -> String {
    let Some(start) = text.rfind('[') else {
        return text.to_string();
    };
    let tail = &text[start..];
    if tail.contains(']') {
        return text.to_string();
    }
    let tail_lower = tail.to_ascii_lowercase();
    let looks_internal = internal_protocol_markers()
        .iter()
        .any(|marker| marker.to_ascii_lowercase().starts_with(&tail_lower))
        || tail_lower.starts_with("[tool");
    if looks_internal {
        text[..start].to_string()
    } else {
        text.to_string()
    }
}

pub(crate) fn sanitize_visible_assistant_text(text: &str) -> Option<String> {
    let sanitized = strip_internal_protocol_markers(text);
    let trimmed = sanitized.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

pub(crate) fn sanitize_truncated_assistant_text(text: &str) -> Option<String> {
    let sanitized = strip_internal_protocol_markers_preserve_whitespace(text);
    (!sanitized.trim().is_empty()).then_some(sanitized)
}

const TEXTUAL_TOOL_MARKUP: &[&str] = &["<tool_call", "<function="];
const TEXTUAL_TOOL_MARKUP_END: &str = "</tool_call>";

/// Drop Hermes/Qwen `<tool_call><function=...></tool_call>` from assistant
/// text. Structured `tool_calls` are the only tool channel. The markup is not
/// parsed into a call.
pub(crate) fn drain_textual_tool_markup(hold: &mut String, incoming: &str) -> String {
    hold.push_str(incoming);
    let mut visible = String::new();
    loop {
        let Some(start) = earliest_textual_tool_markup(hold) else {
            let keep = textual_tool_markup_prefix_len(hold);
            let emit = hold.len() - keep;
            visible.push_str(&hold[..emit]);
            hold.replace_range(..emit, "");
            return visible;
        };
        visible.push_str(&hold[..start]);
        if let Some(relative_end) = hold[start..].find(TEXTUAL_TOOL_MARKUP_END) {
            let end = start + relative_end + TEXTUAL_TOOL_MARKUP_END.len();
            hold.replace_range(..end, "");
            continue;
        }
        let rest = hold.split_off(start);
        *hold = rest;
        return visible;
    }
}

/// Stream finished. An unclosed `<tool_call>` / `<function=` is discarded.
/// A trailing `<` that never became markup is emitted.
pub(crate) fn finish_textual_tool_markup(hold: &mut String) -> String {
    let visible = drain_textual_tool_markup(hold, "");
    if earliest_textual_tool_markup(hold).is_some() {
        hold.clear();
        return visible;
    }
    let tail = std::mem::take(hold);
    let mut visible = visible;
    visible.push_str(&tail);
    visible
}

fn earliest_textual_tool_markup(text: &str) -> Option<usize> {
    TEXTUAL_TOOL_MARKUP
        .iter()
        .filter_map(|marker| text.find(marker))
        .min()
}

fn textual_tool_markup_prefix_len(text: &str) -> usize {
    let mut best = 0;
    for marker in TEXTUAL_TOOL_MARKUP {
        for len in 1..marker.len() {
            if text.ends_with(&marker[..len]) {
                best = best.max(len);
            }
        }
    }
    best
}

pub(crate) fn contains_leaked_internal_protocol_markers(text: &str) -> bool {
    internal_protocol_markers()
        .iter()
        .any(|marker| find_ascii_case_insensitive(text, marker, 0).is_some())
}

pub(crate) fn is_textual_protocol_leak_error(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::TextualToolProtocolLeak,
            ..
        }
    )
}

pub(crate) fn is_missing_tool_call_reply_error(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::IncompleteToolCall,
            ..
        }
    )
}

pub(crate) fn is_tool_payload_leak_error(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::ToolPayloadLeak,
            ..
        }
    )
}

pub(crate) fn protocol_leak_corrective_prompt() -> &'static str {
    "The previous assistant draft leaked Lyra internal tool placeholders or textual tool syntax into visible prose. Do not echo [Tool result ref:], [Tool call:], or similar internal markers. Emit a structured tool_call when a capability is required, otherwise answer with normal assistant text only."
}

pub(crate) const BROWSER_BLOCKED_CORRECTIVE_PROMPT: &str = "Browser tools are paused because an OS dialog is in front of the page. Do not keep calling browser tools against that page. Complete or dismiss the dialog through computer capabilities, then continue.";

pub(crate) const TOOL_OUTPUT_ECHO_CORRECTIVE_PROMPT: &str = "The previous assistant draft pasted raw browser tool output into visible chat text. Do not echo map/see/read tool payloads. Summarize the outcome in a few sentences, or emit a structured tool_call if more browser evidence is required.";

pub(crate) const TURN_FAILURE_BROWSER_BLOCKED: &str = "lyra_turn_failure:browser_blocked";

pub(crate) fn no_tools_used_corrective_prompt(tools_available: bool) -> &'static str {
    if tools_available {
        "The previous assistant response described an upcoming tool action but did not emit a structured tool_call. Retry now: emit the required structured tool_call immediately. Do not put planning, chain-of-thought, or JSON tool arguments in assistant content. If a tool is required, the only valid output is a structured tool_call. Do not mention internal placeholders or pretend a tool already ran."
    } else {
        "The previous assistant response was incomplete. Continue the same user request with a direct answer. Do not reference internal tool placeholders."
    }
}

pub(crate) fn tool_activity_output_summary(output: &Value, max_chars: usize) -> String {
    let content = output
        .get("content")
        .and_then(Value::as_str)
        .filter(|text| !text.trim().is_empty())
        .map(str::to_string)
        .or_else(|| {
            output
                .pointer("/raw/summary")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            serde_json::to_string_pretty(output)
                .ok()
                .filter(|text| !text.trim().is_empty())
        })
        .unwrap_or_else(|| "[Tool completed with no textual output.]".to_string());
    if max_chars == 0 || content.chars().count() <= max_chars {
        return content;
    }
    clip_chars_head_tail(
        &content,
        max_chars,
        &format!("{TOOL_OUTPUT_TRUNCATED_MARKER}; full output retained in session evidence.]"),
    )
}

pub(crate) fn is_browser_tool_name(name: &str) -> bool {
    matches!(
        name,
        "lyra_lumen" | "lyra_ax" | "browser" | "lyra_computer" | "computer"
    ) || [
        "browser_",
        "lyra_lumen_",
        "lyra_ax_",
        "computer_",
        "lyra_computer_",
        "/tools/browser/",
        "/tools/computer/",
    ]
    .iter()
    .any(|prefix| name.starts_with(prefix))
}

pub(crate) fn is_browser_tool_blocked_output(output: &Value) -> bool {
    if output.get("browserBlocked").and_then(Value::as_bool) == Some(true) {
        return true;
    }
    if output
        .pointer("/raw/browserBlocked")
        .and_then(Value::as_bool)
        == Some(true)
    {
        return true;
    }
    if output.pointer("/raw/status").and_then(Value::as_str) == Some("blocked") {
        return true;
    }
    output
        .pointer("/raw/blockedRegions")
        .and_then(Value::as_array)
        .is_some_and(|regions| {
            regions.iter().any(|region| {
                region.get("kind").and_then(Value::as_str) == Some("permission-prompt")
            })
        })
}

fn value_is_host_tool_result_envelope(value: &Value) -> bool {
    let kind = value.get("kind").and_then(Value::as_str).unwrap_or("");
    if kind.starts_with("lyraLumen") || kind.starts_with("lyraAx") {
        return true;
    }
    value.get("semanticTree").is_some()
        || value.get("blockedRegions").is_some()
        || value.get("observationId").is_some()
        || value.get("browserBlocked").is_some()
}

fn tool_payload_envelope_markers() -> &'static [&'static str] {
    &[
        "\"semanticTree\"",
        "\"blockedRegions\"",
        "\"observationId\"",
        "\"mapEpoch\"",
        "\"targetRef\":\"lumen:",
        "\"kind\":\"lyraLumenMap\"",
        "\"kind\": \"lyraLumenMap\"",
        "\"kind\":\"lyraLumenSee\"",
        "\"kind\": \"lyraLumenSee\"",
        "\"kind\":\"lyraLumenActionResult\"",
        "\"kind\": \"lyraLumenActionResult\"",
        "\"browserBlocked\"",
        "\"elements\":[",
    ]
}

pub(crate) fn contains_leaked_tool_payload_in_assistant_text(text: &str) -> bool {
    if contains_leaked_internal_protocol_markers(text) {
        return true;
    }
    if serde_json::from_str::<Value>(text.trim())
        .ok()
        .is_some_and(|value| value_is_host_tool_result_envelope(&value))
    {
        return true;
    }
    if text.trim().chars().count() < 120 {
        return false;
    }
    tool_payload_envelope_markers()
        .iter()
        .any(|marker| find_ascii_case_insensitive(text, marker, 0).is_some())
}

pub(crate) fn validate_visible_assistant_text_protocol(
    text: &str,
) -> Result<(), AgentRuntimeError> {
    if contains_leaked_tool_payload_in_assistant_text(text) {
        return Err(AgentRuntimeError::ProviderProtocol {
            kind: ProviderProtocolFailureKind::ToolPayloadLeak,
            detail: "provider emitted a host-tool result envelope in visible assistant text"
                .to_string(),
        });
    }
    Ok(())
}

fn internal_protocol_markers() -> &'static [&'static str] {
    &[
        TEXTUAL_TOOL_CALL_MARKER,
        TEXTUAL_TOOL_RESULT_REF_MARKER,
        "[Image omitted:",
        "[Tool output truncated",
    ]
}

pub(crate) fn find_ascii_case_insensitive(
    haystack: &str,
    needle: &str,
    from: usize,
) -> Option<usize> {
    if from >= haystack.len() {
        return None;
    }
    let haystack_lower = haystack[from..].to_ascii_lowercase();
    let needle_lower = needle.to_ascii_lowercase();
    haystack_lower
        .find(&needle_lower)
        .map(|offset| from + offset)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn strips_tool_result_ref_placeholders_from_visible_text() {
        let text = "让我搜索一下。 [Tool result ref: call_abc]";
        assert_eq!(
            sanitize_visible_assistant_text(text).as_deref(),
            Some("让我搜索一下。")
        );
    }

    #[test]
    fn sanitize_empty_when_only_protocol_marker_remains() {
        assert_eq!(
            sanitize_visible_assistant_text("[Tool result ref: call_abc]"),
            None
        );
    }

    #[test]
    fn sanitize_truncated_assistant_text_preserves_segment_edges() {
        assert_eq!(
            sanitize_truncated_assistant_text(" Hello ").as_deref(),
            Some(" Hello ")
        );
    }

    #[test]
    fn preserves_markdown_whitespace() {
        let markdown =
            "# 标题\n\n这是一段   带多余空格的文本。\n\n```python\n    return value\n```\n";
        assert_eq!(
            sanitize_visible_assistant_text(markdown).as_deref(),
            Some("# 标题\n\n这是一段   带多余空格的文本。\n\n```python\n    return value\n```")
        );
    }

    #[test]
    fn preserves_newlines_after_stripping_internal_marker() {
        let text = "# 标题\n\n正文。 [Tool result ref: call_abc]\n\n## 小节\n\n- 项";
        assert_eq!(
            sanitize_visible_assistant_text(text).as_deref(),
            Some("# 标题\n\n正文。\n\n## 小节\n\n- 项")
        );
    }

    #[test]
    fn detects_browser_blocked_output_from_map_payload() {
        let output = json!({
            "content": "map",
            "raw": {
                "browserBlocked": true,
                "blockedRegions": [{ "kind": "permission-prompt" }]
            }
        });
        assert!(is_browser_tool_blocked_output(&output));
    }

    #[test]
    fn detects_structural_tool_payload_leak_in_assistant_text() {
        let assistant = r#"{"kind":"lyraLumenMap","blockedRegions":[],"elements":[]}"#;
        assert!(contains_leaked_tool_payload_in_assistant_text(assistant));
    }

    #[test]
    fn clip_chars_head_tail_keeps_both_ends() {
        let text = format!("HEAD_MARK{}TAIL_MARK", "middle-padding".repeat(20));
        let clipped = clip_chars_head_tail(&text, 40, "[omitted]");
        assert!(clipped.contains("HEAD_MARK"), "{clipped}");
        assert!(clipped.contains("TAIL_MARK"), "{clipped}");
        assert!(clipped.contains("[omitted]"), "{clipped}");
        assert!(clipped.len() < text.len(), "{clipped}");
    }
}

#[test]
fn browser_tool_classification_includes_provider_visible_names() {
    for name in [
        "browser_map",
        "browser_press",
        "browser_type",
        "browser_navigate",
        "browser__vact",
        "browser_ax_map",
        "lyra_lumen",
        "lyra_ax",
        "computer_act",
        "/tools/browser/press",
    ] {
        assert!(
            is_browser_tool_name(name),
            "{name} bypasses browser ordering/pause handling"
        );
    }
    for name in [
        "ToolSearch",
        "web_search",
        "web_fetch",
        "shell",
        "agent_spawn",
    ] {
        assert!(!is_browser_tool_name(name));
    }
}

#[test]
fn textual_tool_markup_is_dropped_and_prose_around_it_stays() {
    let mut hold = String::new();
    let first = drain_textual_tool_markup(&mut hold, "收尾：");
    let second = drain_textual_tool_markup(
        &mut hold,
        "<tool_call><function=write_stdin><parameter=chars>\u{3}</parameter></function></tool_call>",
    );
    let tail = finish_textual_tool_markup(&mut hold);
    assert_eq!(format!("{first}{second}{tail}"), "收尾：");
    assert!(hold.is_empty());
}

#[test]
fn textual_tool_markup_split_across_chunks_does_not_leak() {
    let mut hold = String::new();
    let mut visible = String::new();
    for piece in [
        "看一下 <too",
        "l_call><function=exec_command></function></tool_call> 完",
    ] {
        visible.push_str(&drain_textual_tool_markup(&mut hold, piece));
    }
    visible.push_str(&finish_textual_tool_markup(&mut hold));
    assert_eq!(visible, "看一下  完");
}
