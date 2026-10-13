use std::collections::{HashMap, HashSet};

use serde_json::{Value, json};

use crate::{AgentRuntimeError, AgentRuntimeResult, native_backend::provider::ModelToolCall};

#[derive(Clone, Debug, Default)]
pub(crate) struct StreamingToolCallAccumulator {
    pub(crate) id: Option<String>,
    pub(crate) name: Option<String>,
    pub(crate) arguments: String,
}

impl StreamingToolCallAccumulator {
    pub(crate) fn push_name_delta(&mut self, fragment: &str) {
        if fragment.is_empty() {
            return;
        }
        let name = self.name.get_or_insert_with(String::new);
        // Function names are metadata: gateways may resend the full value or
        // send cumulative prefixes. Only argument JSON is unconditionally a
        // text delta. Still accept genuine name fragments for compatibility.
        if name == fragment {
            return;
        }
        if fragment.starts_with(name.as_str()) {
            *name = fragment.to_string();
        } else {
            name.push_str(fragment);
        }
    }
}

pub(crate) fn tool_name_set(tools: &[Value]) -> HashSet<String> {
    tools
        .iter()
        .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
        .map(str::to_string)
        .collect()
}

/// Missing provider ids become `call-{index}`. A full UUID is 41 characters
/// with a `tool-` prefix, and DeepSeek rejects any tool call id over 40.
pub(crate) fn synthesized_tool_call_id(index: usize) -> String {
    format!("call-{index}")
}

pub(crate) fn parse_tool_call(
    value: &Value,
    allowed_tool_names: &HashSet<String>,
    index: usize,
) -> Option<ModelToolCall> {
    // No tools advertised means the model should not be calling tools at all;
    // a stray tool call in that state is ignored (prompt-injection defense).
    if allowed_tool_names.is_empty() {
        return None;
    }
    let function = value.get("function")?;
    let name = function
        .get("name")
        .and_then(Value::as_str)
        .filter(|name| !name.trim().is_empty())
        .map(|name| {
            repair_tool_name(name, allowed_tool_names).unwrap_or_else(|| name.trim().to_string())
        })?;
    let id = value
        .get("id")
        .and_then(Value::as_str)
        .filter(|id| is_valid_tool_call_id(id))
        .map(|id| id.trim().to_string())
        .unwrap_or_else(|| synthesized_tool_call_id(index));
    let arguments = match function.get("arguments") {
        Some(Value::String(text)) => parse_tool_arguments(text),
        Some(value) => value.clone(),
        None => json!({}),
    };
    Some(ModelToolCall {
        id,
        name,
        arguments,
    })
}

pub(crate) fn finalize_streaming_tool_calls(
    tool_calls: HashMap<usize, StreamingToolCallAccumulator>,
    allowed_tool_names: &HashSet<String>,
) -> AgentRuntimeResult<Vec<(usize, ModelToolCall)>> {
    let mut finalized = Vec::new();
    for (index, accumulator) in tool_calls {
        let has_tool_payload = accumulator.id.is_some()
            || accumulator.name.is_some()
            || !accumulator.arguments.trim().is_empty();
        if !has_tool_payload {
            continue;
        }
        let Some(raw_name) = accumulator
            .name
            .as_deref()
            .map(str::trim)
            .filter(|name| !name.is_empty())
        else {
            return Err(AgentRuntimeError::ProviderProtocol {
                kind: crate::ProviderProtocolFailureKind::IncompleteToolCall,
                detail: "provider returned incomplete tool call: missing function name".to_string(),
            });
        };
        // A complete but unknown name is a tool error, not a broken wire
        // protocol. Preserve it for schema-gated dispatch and model correction.
        let name =
            repair_tool_name(raw_name, allowed_tool_names).unwrap_or_else(|| raw_name.to_string());
        finalized.push((
            index,
            ModelToolCall {
                id: accumulator
                    .id
                    .filter(|id| is_valid_tool_call_id(id))
                    .unwrap_or_else(|| synthesized_tool_call_id(index)),
                name,
                arguments: parse_tool_arguments(&accumulator.arguments),
            },
        ));
    }
    Ok(finalized)
}

pub(crate) fn repair_tool_name(name: &str, allowed_tool_names: &HashSet<String>) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() || allowed_tool_names.is_empty() {
        return None;
    }
    if allowed_tool_names.contains(trimmed) {
        return Some(trimmed.to_string());
    }
    let lowercase = trimmed.to_ascii_lowercase();
    if allowed_tool_names.contains(&lowercase) {
        return Some(lowercase);
    }
    None
}

/// Parsing retains a syntactically complete call even when the model names
/// an unavailable tool. Only the dispatch gate decides whether it can run.
pub(crate) fn parsed_tool_name(name: &str, allowed: &HashSet<String>) -> Option<String> {
    let name = name.trim();
    (!name.is_empty()).then(|| repair_tool_name(name, allowed).unwrap_or_else(|| name.to_string()))
}

pub(crate) fn is_valid_tool_call_id(id: &str) -> bool {
    let value = id.trim();
    !value.is_empty() && value != "null"
}

pub(crate) fn parse_tool_arguments(arguments: &str) -> Value {
    let text = arguments.trim();
    if text.is_empty() {
        return json!({});
    }
    match serde_json::from_str::<Value>(text) {
        Ok(value) => value,
        // Strict parse failed: attempt a bounded JSON repair (trailing commas,
        // unclosed braces, excess closers, bare control chars) before marking
        // the arguments unparseable. Local models (e.g. GLM via Ollama) often
        // emit slightly malformed argument JSON that is trivially recoverable.
        Err(error) => match super::tool_args_repair::repair_tool_arguments(text) {
            Some(value) => value,
            None => json!({ "rawArguments": arguments, "parseError": error.to_string() }),
        },
    }
}

pub(crate) fn validate_tool_call_arguments(
    tool_calls: &[ModelToolCall],
) -> crate::AgentRuntimeResult<()> {
    if tool_calls
        .iter()
        .all(|call| call.arguments.is_object() && call.arguments.get("parseError").is_none())
    {
        return Ok(());
    }
    Err(crate::native_backend::providers::errors::protocol_error(
        crate::ProviderProtocolFailureKind::IncompleteToolCall,
        "provider returned truncated or non-object tool arguments",
    ))
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn complete_unknown_calls_survive_parsing_for_schema_gated_error_results() {
        let allowed = HashSet::from(["read_file".to_string()]);
        let raw = json!({"id":"call-unknown","function":{"name":"removed_tool","arguments":"{}"}});
        let parsed = parse_tool_call(&raw, &allowed, 0).unwrap();
        assert_eq!(parsed.name, "removed_tool");
        let mut accumulator = StreamingToolCallAccumulator {
            id: Some("call-unknown".into()),
            ..Default::default()
        };
        accumulator.push_name_delta("removed_");
        accumulator.push_name_delta("tool");
        accumulator.arguments = "{}".into();
        let streamed =
            finalize_streaming_tool_calls(HashMap::from([(0, accumulator)]), &allowed).unwrap();
        assert_eq!(streamed[0].1.name, parsed.name);
        assert_eq!(streamed[0].1.id, parsed.id);
        assert!(parsed_tool_name("", &allowed).is_none());
        assert!(parsed_tool_name("removed_tool", &HashSet::new()).is_some());
    }

    #[test]
    fn missing_tool_call_id_is_short_and_provider_id_is_kept() {
        let allowed = HashSet::from(["tool_fs_run".to_string()]);
        let missing = parse_tool_call(
            &json!({
                "id": "null",
                "function": { "name": "tool_fs_run", "arguments": "{}" }
            }),
            &allowed,
            2,
        )
        .expect("missing id");
        assert_eq!(missing.id, "call-2");
        assert!(missing.id.len() <= 40);

        let issued = parse_tool_call(
            &json!({
                "id": "call_00_ET_14E5Y2N3MsAaj8ljUOJt2553",
                "function": { "name": "tool_fs_run", "arguments": "{}" }
            }),
            &allowed,
            0,
        )
        .expect("provider id");
        assert_eq!(issued.id, "call_00_ET_14E5Y2N3MsAaj8ljUOJt2553");
    }

    #[test]
    fn tool_parser_repairs_case_and_preserves_bad_arguments() {
        let allowed = HashSet::from(["tool_fs_run".to_string()]);
        let parsed = parse_tool_call(
            &json!({
                "id": "call-1",
                "function": {
                    "name": "TOOL_FS_RUN",
                    "arguments": "{bad"
                }
            }),
            &allowed,
            0,
        )
        .expect("tool call");

        assert_eq!(parsed.name, "tool_fs_run");
        assert_eq!(parsed.arguments["rawArguments"], "{bad");
    }

    #[test]
    fn parse_tool_arguments_repairs_trailing_comma_instead_of_marking_parse_error() {
        // A trailing comma is recoverable; the repaired object should be
        // returned without a parseError marker so the tool call can execute.
        let parsed = parse_tool_arguments(r#"{"path":"/x","args":{},}"#);
        assert_eq!(parsed["path"], "/x");
        assert!(parsed.get("parseError").is_none());
    }

    #[test]
    fn parse_tool_arguments_repairs_unclosed_object() {
        let parsed = parse_tool_arguments(r#"{"path":"/x""#);
        assert_eq!(parsed["path"], "/x");
        assert!(parsed.get("parseError").is_none());
    }

    #[test]
    fn parse_tool_arguments_keeps_parse_error_for_unrepairable_input() {
        // A string truncated mid-token (`{"path":"`) cannot be closed safely;
        // repair returns None and the parseError marker is preserved so the
        // loop can surface the failure rather than silently executing a
        // half-formed tool call.
        let parsed = parse_tool_arguments(r#"{"path":""#);
        assert!(parsed.get("parseError").is_some());
    }
}

#[cfg(test)]
mod name_metadata_tests {
    use super::*;
    #[test]
    fn repeated_names_cumulative_names_and_real_fragments_resolve_to_one_identity() {
        for fragments in [
            vec!["exec_command", "exec_command"],
            vec!["exec_", "exec_command"],
            vec!["exec_", "command", "exec_command"],
        ] {
            let mut call = StreamingToolCallAccumulator::default();
            for name in fragments {
                call.push_name_delta(name);
            }
            assert_eq!(call.name.as_deref(), Some("exec_command"));
        }
    }
}
