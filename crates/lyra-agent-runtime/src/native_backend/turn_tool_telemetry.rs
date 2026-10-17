use serde_json::Value;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) struct PreviousTurnToolTelemetry {
    pub(crate) recent_failure_count: usize,
    pub(crate) recent_mismatch_count: usize,
    pub(crate) consecutive_failure_count: usize,
    pub(crate) recent_tool_paths: Vec<String>,
    pub(crate) recent_tool_domains: Vec<String>,
    pub(crate) recent_failed_tool_domains: Vec<String>,
    pub(crate) recent_scene_modules: Vec<String>,
    pub(crate) recent_failed_scene_modules: Vec<String>,
    pub(crate) consecutive_failed_tool_domains: Vec<String>,
}

pub(crate) fn estimate_previous_turn_tool_count(tools: &[Value], messages: &[Value]) -> usize {
    let Some((previous_user_time, latest_user_time)) = previous_turn_time_bounds(messages) else {
        return 0;
    };
    tools
        .iter()
        .filter(|tool| {
            tool_started_in_turn_window(tool, previous_user_time.as_deref(), &latest_user_time)
        })
        .count()
}

pub(crate) fn estimate_previous_turn_failed_tool_count(
    tools: &[Value],
    messages: &[Value],
) -> usize {
    let Some((previous_user_time, latest_user_time)) = previous_turn_time_bounds(messages) else {
        return 0;
    };
    tools
        .iter()
        .filter(|tool| {
            tool_started_in_turn_window(tool, previous_user_time.as_deref(), &latest_user_time)
        })
        .filter(|tool| tool_has_failure_signal(tool))
        .count()
}

pub(crate) fn previous_turn_tool_telemetry(
    tools: &[Value],
    messages: &[Value],
) -> PreviousTurnToolTelemetry {
    let Some((previous_user_time, latest_user_time)) = previous_turn_time_bounds(messages) else {
        return PreviousTurnToolTelemetry::default();
    };
    let previous_tools = tools
        .iter()
        .filter(|tool| {
            tool_started_in_turn_window(tool, previous_user_time.as_deref(), &latest_user_time)
        })
        .collect::<Vec<_>>();
    let mut telemetry = PreviousTurnToolTelemetry::default();
    for tool in &previous_tools {
        let failed = tool_has_failure_signal(tool);
        let mismatched = tool_has_mismatch_signal(tool);
        if failed {
            telemetry.recent_failure_count += 1;
        }
        if mismatched {
            telemetry.recent_mismatch_count += 1;
        }
        for path in tool_path_candidates(tool) {
            push_unique(&mut telemetry.recent_tool_paths, path.clone());
            if let Some(domain) = tool_domain_from_path(&path) {
                push_unique(&mut telemetry.recent_tool_domains, domain.clone());
                for scene in scene_modules_for_domain(&domain) {
                    push_unique(&mut telemetry.recent_scene_modules, scene);
                }
                if failed || mismatched {
                    push_unique(&mut telemetry.recent_failed_tool_domains, domain.clone());
                    for scene in scene_modules_for_domain(&domain) {
                        push_unique(&mut telemetry.recent_failed_scene_modules, scene);
                    }
                }
            }
        }
        if let Some(domain) = tool_domain(tool) {
            push_unique(&mut telemetry.recent_tool_domains, domain.clone());
            for scene in scene_modules_for_domain(&domain) {
                push_unique(&mut telemetry.recent_scene_modules, scene);
            }
            if failed || mismatched {
                push_unique(&mut telemetry.recent_failed_tool_domains, domain.clone());
                for scene in scene_modules_for_domain(&domain) {
                    push_unique(&mut telemetry.recent_failed_scene_modules, scene);
                }
            }
        }
    }
    for tool in previous_tools.iter().rev() {
        if !tool_has_failure_signal(tool) {
            break;
        }
        telemetry.consecutive_failure_count += 1;
        if let Some(domain) = tool_domain(tool) {
            push_unique(&mut telemetry.consecutive_failed_tool_domains, domain);
        }
    }
    telemetry
}

fn previous_turn_time_bounds(messages: &[Value]) -> Option<(Option<String>, String)> {
    let user_times = messages
        .iter()
        .filter(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        .filter_map(|message| message.get("createdAt").and_then(Value::as_str))
        .map(str::to_string)
        .collect::<Vec<_>>();
    let latest_user_time = user_times.last()?.clone();
    let previous_user_time = user_times
        .len()
        .checked_sub(2)
        .and_then(|index| user_times.get(index))
        .cloned();
    Some((previous_user_time, latest_user_time))
}

fn tool_started_in_turn_window(
    tool: &Value,
    previous_user_time: Option<&str>,
    latest_user_time: &str,
) -> bool {
    let Some(started_at) = tool.get("startedAt").and_then(Value::as_str) else {
        return false;
    };
    previous_user_time
        .map(|previous| started_at >= previous)
        .unwrap_or(true)
        && started_at < latest_user_time
}

fn tool_has_failure_signal(tool: &Value) -> bool {
    // A cancelled call is not a failure: the tool never ran, so it must not
    // feed the consecutive-failure loop detector or the prompt policy.
    if matches!(
        tool.get("status").and_then(Value::as_str),
        Some("cancelled")
    ) || matches!(
        tool.pointer("/output/status").and_then(Value::as_str),
        Some("cancelled")
    ) || tool.get("cancelled").and_then(Value::as_bool) == Some(true)
        || tool.pointer("/output/cancelled").and_then(Value::as_bool) == Some(true)
    {
        return false;
    }
    matches!(
        tool.get("status").and_then(Value::as_str),
        Some("failed" | "error")
    ) || matches!(
        tool.pointer("/output/status").and_then(Value::as_str),
        Some("failed" | "error")
    ) || tool.pointer("/output/ok").and_then(Value::as_bool) == Some(false)
        || tool.pointer("/output/raw/ok").and_then(Value::as_bool) == Some(false)
        || tool
            .pointer("/output/error")
            .is_some_and(|error| !error.is_null())
}

fn tool_has_mismatch_signal(tool: &Value) -> bool {
    let operation = tool
        .get("operation")
        .or_else(|| tool.pointer("/input/operation"))
        .or_else(|| tool.pointer("/input/action"))
        .or_else(|| tool.pointer("/output/operation"))
        .and_then(Value::as_str)
        .unwrap_or_default();
    if operation != "search" {
        return false;
    }
    let total = tool
        .pointer("/output/raw/total")
        .or_else(|| tool.pointer("/output/total"))
        .and_then(Value::as_u64);
    let results_empty = tool
        .pointer("/output/raw/results")
        .or_else(|| tool.pointer("/output/results"))
        .and_then(Value::as_array)
        .is_some_and(|results| results.is_empty());
    total == Some(0) || results_empty
}

fn tool_path_candidates(tool: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    for pointer in [
        "/toolPath",
        "/output/toolPath",
        "/output/raw/toolPath",
        "/input/toolPath",
        "/input/tool_path",
        "/input/path",
        "/input/toolOperation/path",
        "/input/toolOperation/toolPath",
        "/output/toolOperation/path",
        "/output/raw/toolOperation/path",
    ] {
        if let Some(path) = tool
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| value.starts_with("/tools/"))
        {
            push_unique(&mut paths, path.to_string());
        }
    }
    for pointer in ["/output/raw/results", "/output/results"] {
        if let Some(results) = tool.pointer(pointer).and_then(Value::as_array) {
            for result in results.iter().take(3) {
                if let Some(path) = result
                    .get("path")
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .filter(|value| value.starts_with("/tools/"))
                {
                    push_unique(&mut paths, path.to_string());
                }
            }
        }
    }
    paths
}

fn tool_domain(tool: &Value) -> Option<String> {
    for pointer in [
        "/domain",
        "/output/domain",
        "/output/raw/domain",
        "/input/domain",
    ] {
        if let Some(domain) = tool
            .pointer(pointer)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty() && *value != "runtime")
        {
            return Some(domain.to_string());
        }
    }
    tool_path_candidates(tool)
        .into_iter()
        .find_map(|path| tool_domain_from_path(&path))
}

fn tool_domain_from_path(path: &str) -> Option<String> {
    path.trim()
        .strip_prefix("/tools/")
        .and_then(|rest| rest.split('/').next())
        .map(str::trim)
        .filter(|value| !value.is_empty() && *value != "runtime")
        .map(str::to_string)
}

fn scene_modules_for_domain(domain: &str) -> Vec<String> {
    match domain.trim().to_ascii_lowercase().as_str() {
        "browser" | "browser_ax" | "web" => vec!["browser".to_string()],
        "design" => vec!["design".to_string()],
        "computer" | "desktop" | "software" | "workbench" | "terminal" | "shell" => {
            vec!["computer".to_string()]
        }
        _ => Vec::new(),
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.iter().any(|existing| existing == &value) {
        values.push(value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn previous_turn_failed_tool_count_uses_latest_turn_window() {
        let messages = vec![
            json!({
                "role": "user",
                "createdAt": "2026-06-22T00:00:00.000Z",
                "text": "first"
            }),
            json!({
                "role": "user",
                "createdAt": "2026-06-22T00:02:00.000Z",
                "text": "fix it"
            }),
        ];
        let tools = vec![
            json!({
                "id": "old-failure",
                "status": "failed",
                "startedAt": "2026-06-21T23:59:00.000Z"
            }),
            json!({
                "id": "previous-failure",
                "status": "failed",
                "startedAt": "2026-06-22T00:01:00.000Z"
            }),
            json!({
                "id": "previous-complete",
                "status": "completed",
                "startedAt": "2026-06-22T00:01:30.000Z"
            }),
            json!({
                "id": "current-running",
                "status": "failed",
                "startedAt": "2026-06-22T00:03:00.000Z"
            }),
        ];

        assert_eq!(estimate_previous_turn_tool_count(&tools, &messages), 2);
        assert_eq!(
            estimate_previous_turn_failed_tool_count(&tools, &messages),
            1
        );
    }

    #[test]
    fn previous_turn_tool_telemetry_extracts_scene_domains_and_mismatches() {
        let messages = vec![
            json!({
                "role": "user",
                "createdAt": "2026-06-22T00:00:00.000Z",
                "text": "open browser"
            }),
            json!({
                "role": "user",
                "createdAt": "2026-06-22T00:02:00.000Z",
                "text": "continue"
            }),
        ];
        let tools = vec![
            json!({
                "id": "browser-map",
                "status": "completed",
                "startedAt": "2026-06-22T00:01:00.000Z",
                "toolPath": "/tools/browser/map",
                "domain": "browser",
                "operation": "map",
            }),
            json!({
                "id": "search-miss",
                "status": "completed",
                "startedAt": "2026-06-22T00:01:30.000Z",
                "input": {
                    "action": "search",
                    "query": "brower operation"
                },
                "output": {
                    "raw": {
                        "kind": "tool_fs_search",
                        "total": 0,
                        "results": []
                    }
                }
            }),
            json!({
                "id": "design-quality",
                "status": "completed",
                "startedAt": "2026-06-22T00:01:40.000Z",
                "toolPath": "/tools/design/quality",
                "domain": "design",
                "operation": "quality",
            }),
            json!({
                "id": "terminal-failure",
                "status": "failed",
                "startedAt": "2026-06-22T00:01:45.000Z",
                "toolPath": "/tools/terminal/write",
                "domain": "terminal",
                "operation": "write",
            }),
        ];

        let telemetry = previous_turn_tool_telemetry(&tools, &messages);

        assert_eq!(telemetry.recent_failure_count, 1);
        assert_eq!(telemetry.recent_mismatch_count, 1);
        assert_eq!(telemetry.consecutive_failure_count, 1);
        assert!(
            telemetry
                .recent_tool_paths
                .contains(&"/tools/browser/map".to_string())
        );
        assert!(
            telemetry
                .recent_tool_domains
                .contains(&"browser".to_string())
        );
        assert!(
            telemetry
                .recent_failed_tool_domains
                .contains(&"terminal".to_string())
        );
        assert!(
            telemetry
                .recent_scene_modules
                .contains(&"browser".to_string())
        );
        assert!(
            telemetry
                .recent_scene_modules
                .contains(&"computer".to_string())
        );
        assert!(
            telemetry
                .recent_scene_modules
                .contains(&"design".to_string())
        );
        assert!(
            telemetry
                .consecutive_failed_tool_domains
                .contains(&"terminal".to_string())
        );
    }

    #[test]
    fn cancelled_tool_output_is_not_a_failure_signal() {
        // The cancellation envelope carries an error object, but "cancelled"
        // must never count toward consecutive-failure loop detection.
        let cancelled = json!({
            "id": "call-cancelled",
            "status": "cancelled",
            "startedAt": "2026-06-22T00:01:50.000Z",
            "toolPath": "/tools/exec/run",
            "domain": "exec",
            "operation": "run",
            "output": {
                "cancelled": true,
                "error": {"code": "cancelled", "reason": "turn_cancelled"},
            },
        });
        assert!(!tool_has_failure_signal(&cancelled));

        // Output-level cancelled flag with a non-cancelled activity status
        // (e.g. shell partial output) is still excluded.
        let output_cancelled = json!({
            "id": "call-shell-cancelled",
            "status": "completed",
            "startedAt": "2026-06-22T00:01:50.000Z",
            "toolPath": "/tools/exec/run",
            "domain": "exec",
            "operation": "run",
            "output": {
                "cancelled": true,
                "error": {"code": "cancelled"},
            },
        });
        assert!(!tool_has_failure_signal(&output_cancelled));

        // A genuine failure right after a cancellation still counts.
        let failed_after_cancelled = json!({
            "id": "call-failed",
            "status": "failed",
            "startedAt": "2026-06-22T00:01:55.000Z",
            "toolPath": "/tools/exec/run",
            "domain": "exec",
            "operation": "run",
            "output": {"error": {"code": "exit_code_nonzero"}},
        });
        assert!(tool_has_failure_signal(&failed_after_cancelled));
    }
}
