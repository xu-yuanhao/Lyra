use super::*;
use crate::native_backend::tool_protocol::clip_chars_head_tail;
use std::borrow::Cow;
use std::path::Component;

const DEFAULT_TOOL_RAW_CHARS: usize = 32_000;
const BROWSER_MAP_TOOL_CONTENT_CHARS: usize = 8_000;
const DESIGN_REFERENCE_CONTENT_CHARS: usize = 50_000;
const DESIGN_QUALITY_CONTENT_CHARS: usize = 50_000;
const SHELL_OUTPUT_CONTENT_CHARS: usize = 32_000;
const SEARCH_OUTPUT_CONTENT_CHARS: usize = 32_000;

pub(crate) fn tool_content_char_budget(display_name: &str, action: &str) -> usize {
    match (display_name, action) {
        // file_read has its own 96 KB byte-level pre-truncation (file.rs);
        // usize::MAX skips char-level truncation and artifact persistence
        // entirely, preventing a Read→persist→Read circular dependency.
        ("file", "read") => usize::MAX,
        // DESIGN.md files max ~44 KB; 50 K accommodates nearly all without
        // spilling to artifact.
        ("design", "read") => DESIGN_REFERENCE_CONTENT_CHARS,
        ("design", "quality") => DESIGN_QUALITY_CONTENT_CHARS,
        // shell already pre-truncates at 20 KB bytes; 32 K chars gives
        // headroom for multibyte UTF-8.
        ("shell", "run") => SHELL_OUTPUT_CONTENT_CHARS,
        // search / grep / glob / list can produce many matches.
        ("file", "grep" | "glob" | "list") => SEARCH_OUTPUT_CONTENT_CHARS,
        ("code", "search_text" | "grep_text" | "search_symbol") => SEARCH_OUTPUT_CONTENT_CHARS,
        ("lsp", "query") => SEARCH_OUTPUT_CONTENT_CHARS,
        // browser map/see/read: compact structured snapshots.
        ("lyra_lumen", "map" | "see" | "read") => BROWSER_MAP_TOOL_CONTENT_CHARS,
        _ => DEFAULT_TOOL_CONTENT_CHARS,
    }
}

pub(crate) fn budgeted_tool_output(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    content: String,
    raw: Value,
    recommended_next_action: Option<String>,
) -> Value {
    budgeted_tool_output_with_budget(
        session_id,
        turn_id,
        tool_call_id,
        content,
        raw,
        recommended_next_action,
        DEFAULT_TOOL_CONTENT_CHARS,
    )
}

pub(crate) fn budgeted_tool_output_with_budget(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    content: String,
    raw: Value,
    recommended_next_action: Option<String>,
    content_budget: usize,
) -> Value {
    let content_char_count = content.chars().count();
    let (content, truncated, artifact_ref, truncated_reason) = if content_char_count
        > content_budget
    {
        let artifact_ref = write_tool_artifact(session_id, turn_id, tool_call_id, &content);
        let footer = match artifact_ref
            .as_ref()
            .and_then(|r| r.get("path"))
            .and_then(Value::as_str)
        {
            Some(path) => format!(
                "[persisted-output]\nFull output saved to: {path}\nUse read_file to access the full content.\n[/persisted-output]"
            ),
            None => "[truncated]".to_string(),
        };
        (
            clip_chars_head_tail(&content, content_budget, &footer),
            true,
            artifact_ref,
            Some(format!("tool output exceeded {content_budget} characters")),
        )
    } else {
        (content, false, None, None)
    };
    let (raw, raw_artifact_ref, raw_truncated_reason) =
        budgeted_raw_output(session_id, turn_id, tool_call_id, raw);
    let verification_required = raw.get("verificationRequired").cloned();
    let activity_kind = raw
        .get("activityKind")
        .and_then(Value::as_str)
        .map(str::to_string);
    let renderer_hint = raw
        .get("rendererHint")
        .and_then(Value::as_str)
        .map(str::to_string);
    json!({
        "content": content,
        "raw": raw,
        "truncated": truncated,
        "artifactRef": artifact_ref,
        "rawArtifactRef": raw_artifact_ref,
        "truncatedReason": truncated_reason,
        "rawTruncatedReason": raw_truncated_reason,
        "recommendedNextAction": recommended_next_action,
        "activityKind": activity_kind,
        "rendererHint": renderer_hint,
        "verificationRequired": verification_required,
    })
}

fn budgeted_raw_output(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    raw: Value,
) -> (Value, Option<Value>, Option<String>) {
    let raw_text = serde_json::to_string_pretty(&raw)
        .or_else(|_| serde_json::to_string(&raw))
        .unwrap_or_else(|_| "null".to_string());
    let raw_chars = raw_text.chars().count();
    if raw_chars <= DEFAULT_TOOL_RAW_CHARS {
        return (raw, None, None);
    }

    let artifact_ref = write_tool_artifact_with_kind(
        session_id,
        turn_id,
        tool_call_id,
        ToolArtifactKind::RawData,
        &raw_text,
    );
    let policy_decision = raw.get("policyDecision").cloned();
    let mut envelope = json!({
        "kind": "tool_raw_ref",
        "retention": {
            "policy": "artifact_only_raw",
            "reason": "full raw tool output exceeded the model/session raw budget and was stored as an artifact",
            "originalChars": raw_chars,
        },
        "artifactRef": artifact_ref.clone(),
        "policyDecision": policy_decision,
    });
    preserve_raw_timeline_facts(&raw, &mut envelope);
    (
        envelope,
        artifact_ref,
        Some(format!(
            "tool raw output exceeded {DEFAULT_TOOL_RAW_CHARS} characters"
        )),
    )
}

pub(crate) fn preserve_raw_timeline_facts(raw: &Value, envelope: &mut Value) {
    let Some(object) = envelope.as_object_mut() else {
        return;
    };
    for key in [
        "activityKind",
        "rendererHint",
        "changedFiles",
        "diffArtifactRef",
        "beforeRef",
        "afterRef",
        "artifactRefs",
        "providerImage",
        "imageArtifact",
        "screenshotArtifactRef",
        "policyDecision",
        "verificationRequired",
    ] {
        if let Some(value) = raw.get(key) {
            object.insert(key.to_string(), value.clone());
        }
    }
}

/// Why a tool call was cancelled. Recorded in the tool result envelope so the
/// model can distinguish a user stop from a system abort instead of treating
/// every cancellation as an unexplained failure (ZCode `cancellation.userVisibleMessage`,
/// hermes recorded-interrupt-reason wording).
pub(crate) const CANCEL_REASON_TURN_CANCELLED: &str = "turn_cancelled";
pub(crate) const CANCEL_REASON_TURN_SUPERSEDED: &str = "turn_superseded";
pub(crate) const CANCEL_REASON_USER_STOP: &str = "user_stop";
pub(crate) const CANCEL_REASON_BEFORE_EXECUTION: &str = "before_execution";
pub(crate) const CANCEL_REASON_PERMISSION_WAIT: &str = "permission_wait_cancelled";
pub(crate) const CANCEL_REASON_SESSION_RECOVERY: &str = "session_recovery";

/// The single cancellation envelope. Cancellation is not a failure: the
/// content is not prefixed with "Lyra tool failed", and the envelope carries
/// `error.code = "cancelled"` plus a machine-readable `error.reason` while
/// keeping the legacy `"cancelled": true` flag that quality_gate,
/// tool_fs/result and the progress guard key on.
pub(crate) fn cancelled_tool_output(
    reason: &str,
    message: &str,
    recommended_next_action: &str,
    detail: Option<Value>,
) -> Value {
    json!({
        "content": message,
        "error": {
            "code": "cancelled",
            "reason": reason,
            "message": message,
            "detail": detail,
        },
        "cancelled": true,
        "truncated": false,
        "artifactRef": Value::Null,
        "recommendedNextAction": recommended_next_action,
    })
}

pub(crate) fn tool_failure_output(
    code: &str,
    message: &str,
    recommended_next_action: &str,
    detail: Option<Value>,
) -> Value {
    json!({
        "content": format!("Lyra tool failed: {message}"),
        "error": {
            "code": code,
            "message": message,
            "detail": detail,
        },
        "truncated": false,
        "artifactRef": Value::Null,
        "recommendedNextAction": recommended_next_action,
    })
}

pub(crate) fn truncate_chars(value: &str, max_chars: usize) -> String {
    let mut output = value.chars().take(max_chars).collect::<String>();
    output.push_str("\n\n[truncated]");
    output
}

pub(crate) fn value_string(input: &Value, key: &str) -> Option<String> {
    input
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

pub(crate) fn required_value_string(input: &Value, key: &str) -> Result<String, NativeToolFailure> {
    value_string(input, key).ok_or_else(|| {
        NativeToolFailure::new(
            "bad_request",
            format!("{key} is required"),
            "Retry the tool call with the required input field.",
        )
    })
}

pub(crate) fn value_bool(input: &Value, key: &str, default: bool) -> bool {
    input.get(key).and_then(Value::as_bool).unwrap_or(default)
}

pub(crate) fn value_usize(input: &Value, key: &str, default: usize, max: usize) -> usize {
    input
        .get(key)
        .and_then(Value::as_u64)
        .map(|value| value as usize)
        .unwrap_or(default)
        .max(1)
        .min(max)
}

pub(crate) fn value_u64(input: &Value, key: &str, default: u64, max: u64) -> u64 {
    input
        .get(key)
        .and_then(Value::as_u64)
        .unwrap_or(default)
        .max(1)
        .min(max)
}

pub(crate) fn session_workspace_root(session_id: &str) -> Result<PathBuf, NativeToolFailure> {
    let (project_bound, working_dir) = state()
        .lock()
        .map_err(|_| {
            NativeToolFailure::new(
                "runtime_state_unavailable",
                "agent runtime state lock failed",
                "Retry the tool call.",
            )
        })?
        .sessions
        .get(session_id)
        .map(|session| {
            let project_bound = session
                .snapshot
                .get("projectBound")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            let working_dir = session
                .snapshot
                .get("workingDir")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_string();
            (project_bound, working_dir)
        })
        .unwrap_or((false, String::new()));
    // A session that is not bound to a project (the user sent a message without
    // choosing a directory) defaults to the user's home directory, mirroring the
    // shell tool's `shell_base_dir` fallback. This keeps shell and filesystem
    // tools operating in the same place instead of rejecting fs work outright.
    if !project_bound || working_dir.is_empty() {
        let home = dirs::home_dir().ok_or_else(|| {
            NativeToolFailure::new(
                "workspace_unbound",
                "session is not bound to a project and the home directory is unavailable",
                "Bind the session to an existing project root and retry.",
            )
        })?;
        return home.canonicalize().map_err(|error| {
            NativeToolFailure::new(
                "workspace_root_unavailable",
                format!("failed to canonicalize home workspace root: {error}"),
                "Bind the session to an existing project root and retry.",
            )
        });
    }
    let root = PathBuf::from(working_dir);
    let root = if root.exists() {
        root.canonicalize().map_err(|error| {
            NativeToolFailure::new(
                "workspace_root_unavailable",
                format!("failed to canonicalize workspace root: {error}"),
                "Bind the session to an existing project root and retry.",
            )
        })?
    } else {
        return Err(NativeToolFailure::new(
            "workspace_root_unavailable",
            format!("workspace root does not exist: {}", root.display()),
            "Bind the session to an existing project root and retry.",
        ));
    };
    Ok(root)
}

/// Expand a leading `~` / `~/` (POSIX) or `~\` (Windows) prefix to the user's
/// home directory. Other tilde variants (`~user`, `~+`, `~-`, `~1`, ...) are
/// rejected because Rust's `Path` treats `~` as a normal component name, so
/// they would otherwise be silently joined onto the workspace root and create
/// a literal `~` directory under it (see the "files written to ~/Documents
/// then reported missing" regression). Mirrors Claude Code's `expandPath` /
/// `expandTilde` pair: expand the two safe forms, reject everything else.
fn expand_tilde_prefix(raw: &str) -> Result<Cow<'_, str>, NativeToolFailure> {
    let trimmed = raw.trim();
    if !trimmed.starts_with('~') {
        return Ok(Cow::Borrowed(raw));
    }
    let is_bare_home = trimmed == "~";
    let is_slash_prefixed =
        trimmed.starts_with("~/") || (cfg!(windows) && trimmed.starts_with("~\\"));
    if !is_bare_home && !is_slash_prefixed {
        // `~root`, `~+`, `~-`, `~1`, ... are not expandable by us and must not
        // fall through to the workspace-relative branch where they would create
        // a literal `~...` directory.
        return Err(NativeToolFailure::new(
            "bad_request",
            format!("unsupported tilde expansion in path: {trimmed}"),
            "Use an absolute path, a workspace-relative path, or a ~/ home-relative path. Variants like ~user, ~+, ~- are rejected.",
        ));
    }
    let home = dirs::home_dir().ok_or_else(|| {
        NativeToolFailure::new(
            "workspace_unbound",
            "home directory is unavailable for tilde expansion",
            "Use an absolute path or bind the session to a project root and retry.",
        )
    })?;
    let home = home.display().to_string();
    if is_bare_home {
        Ok(Cow::Owned(home))
    } else {
        // Keep the separator and the rest of the path intact.
        Ok(Cow::Owned(format!("{home}{}", &trimmed[1..])))
    }
}

fn resolve_session_absolute_path(
    session_id: &str,
    raw_path: &str,
    allow_missing_leaf: bool,
) -> Result<(PathBuf, PathBuf), NativeToolFailure> {
    if raw_path.contains('\0') {
        return Err(NativeToolFailure::new(
            "bad_request",
            "path contains a NUL byte",
            "Retry with a normal filesystem path.",
        ));
    }
    // Expand `~`/`~/` to the home directory before any Path handling so that
    // `~/Documents/x` resolves to `<home>/Documents/x` instead of being joined
    // onto the workspace root as a literal `~` component.
    let original_input = raw_path;
    let raw_path = expand_tilde_prefix(raw_path)?;
    let root = session_workspace_root(session_id)?;
    let candidate = PathBuf::from(raw_path.as_ref());
    let input_was_absolute = candidate.is_absolute();
    let candidate = if input_was_absolute {
        candidate
    } else {
        root.join(normalize_workspace_relative_path(&root, &candidate))
    };
    let absolute = if candidate.exists() {
        candidate.canonicalize().map_err(|error| {
            NativeToolFailure::new(
                "path_unavailable",
                format!("failed to canonicalize path: {error}"),
                "Retry with a readable path.",
            )
        })?
    } else if allow_missing_leaf {
        resolve_missing_candidate_path(&candidate)?
    } else {
        // Name the anchor explicitly: a relative input that lands somewhere the
        // model did not expect is the most common path-tool failure, and the
        // raw input alone never explains where it was joined onto. Reference
        // shape: hermes `_path_resolution_warning` reports raw input, resolved
        // path, and base directory together.
        let message = if input_was_absolute {
            format!("path does not exist: {}", candidate.display())
        } else {
            format!(
                "path does not exist: {} (input \"{}\" is relative and was resolved against the session workspace root {})",
                candidate.display(),
                original_input,
                root.display()
            )
        };
        return Err(NativeToolFailure::new(
            "path_not_found",
            message,
            "Retry with an existing path; relative paths resolve against the workspace root named above, or pass an absolute path.",
        ));
    };
    Ok((root, absolute))
}

fn normalize_workspace_relative_path(root: &Path, path: &Path) -> PathBuf {
    let mut components = path.components();
    let Some(Component::Normal(first)) = components.next() else {
        return path.to_path_buf();
    };
    let Some(root_name) = root.file_name() else {
        return path.to_path_buf();
    };
    if first != root_name {
        return path.to_path_buf();
    }
    let rest = components.collect::<PathBuf>();
    if rest.as_os_str().is_empty() {
        path.to_path_buf()
    } else {
        rest
    }
}

fn resolve_missing_candidate_path(candidate: &Path) -> Result<PathBuf, NativeToolFailure> {
    let mut ancestor = candidate;
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "path has no existing ancestor",
                "Retry with a path whose drive or root directory exists.",
            )
        })?;
    }
    let suffix = candidate.strip_prefix(ancestor).map_err(|error| {
        NativeToolFailure::new(
            "path_unavailable",
            format!("failed to resolve missing path suffix: {error}"),
            "Retry with a normal filesystem path.",
        )
    })?;
    let mut absolute = ancestor.canonicalize().map_err(|error| {
        NativeToolFailure::new(
            "path_unavailable",
            format!("failed to canonicalize path ancestor: {error}"),
            "Retry with a path whose existing ancestor is readable.",
        )
    })?;
    for component in suffix.components() {
        match component {
            Component::Prefix(_) | Component::RootDir => {
                return Err(NativeToolFailure::new(
                    "bad_request",
                    "missing path suffix unexpectedly contains an absolute prefix",
                    "Retry with a normal filesystem path.",
                ));
            }
            Component::CurDir => {}
            Component::ParentDir => {
                if !absolute.pop() {
                    return Err(NativeToolFailure::new(
                        "path_unavailable",
                        "path escapes above the filesystem root",
                        "Retry with a normal filesystem path.",
                    ));
                }
            }
            Component::Normal(value) => absolute.push(value),
        }
    }
    Ok(absolute)
}

pub(crate) fn path_escapes_session_workspace(
    session_id: &str,
    raw_path: &str,
    allow_missing_leaf: bool,
) -> Result<Option<(PathBuf, PathBuf)>, NativeToolFailure> {
    let (root, absolute) = resolve_session_absolute_path(session_id, raw_path, allow_missing_leaf)?;
    if absolute.starts_with(&root) {
        return Ok(None);
    }
    Ok(Some((root, absolute)))
}

pub(crate) fn resolve_workspace_path(
    session_id: &str,
    raw_path: &str,
    allow_missing_leaf: bool,
) -> Result<WorkspacePath, NativeToolFailure> {
    let (root, absolute) = resolve_session_absolute_path(session_id, raw_path, allow_missing_leaf)?;
    let outside_workspace = !absolute.starts_with(&root);
    let relative = absolute
        .strip_prefix(&root)
        .map(|path| path.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| absolute.display().to_string());
    Ok(WorkspacePath {
        root,
        absolute,
        relative: if relative.is_empty() {
            ".".to_string()
        } else {
            relative
        },
        outside_workspace,
    })
}

pub(crate) fn filesystem_path_permission_candidates(
    display_name: &str,
    action: &str,
    input: &Value,
) -> Vec<(String, bool)> {
    match (display_name, action) {
        ("file", "glob") => vec![(
            value_string(input, "root").unwrap_or_else(|| ".".to_string()),
            false,
        )],
        ("file", "grep") => vec![(
            value_string(input, "path").unwrap_or_else(|| ".".to_string()),
            false,
        )],
        ("file", "list") => vec![(
            value_string(input, "path").unwrap_or_else(|| ".".to_string()),
            false,
        )],
        ("file", "multiedit") => {
            let mut paths = Vec::new();
            if let Some(path) = value_string(input, "path") {
                paths.push((path, false));
            }
            if let Some(edits) = input.get("edits").and_then(Value::as_array) {
                for edit in edits {
                    if let Some(path) = value_string(edit, "path") {
                        paths.push((path, false));
                    }
                }
            }
            paths
        }
        ("file", "apply_patch") => {
            let mut paths = Vec::new();
            if let Some(operations) = input.get("operations").and_then(Value::as_array) {
                for operation in operations {
                    if let Some(path) = value_string(operation, "path") {
                        let allow_missing = operation
                            .get("op")
                            .and_then(Value::as_str)
                            .is_some_and(|op| op == "add");
                        paths.push((path, allow_missing));
                    }
                    if let Some(new_path) = value_string(operation, "newPath") {
                        paths.push((new_path, true));
                    }
                }
            }
            paths
        }
        ("file", "write" | "read" | "edit" | "strict_edit") => value_string(input, "path")
            .map(|path| vec![(path, matches!(action, "write"))])
            .unwrap_or_default(),
        ("search", "project")
        | ("code", "search_text" | "grep_text" | "search_symbol" | "graph_expand") => {
            if let Some(path) = value_string(input, "root").or_else(|| value_string(input, "path"))
            {
                vec![(path, false)]
            } else {
                Vec::new()
            }
        }
        ("lsp", "query") => value_string(input, "filePath")
            .or_else(|| value_string(input, "path"))
            .map(|path| vec![(path, false)])
            .unwrap_or_default(),
        ("media", "transcribe_audio") => value_string(input, "path")
            .map(|path| vec![(path, false)])
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Per-turn aggregate budget for all tool outputs combined.
/// When total untruncated content exceeds this, the largest outputs are
/// spilled to disk artifacts so the combined message stays within limits.
const TURN_TOOL_OUTPUT_BUDGET_CHARS: usize = 200_000;

/// Preview size for outputs spilled by the aggregate budget layer.
/// Smaller than per-tool budgets — these are secondary spills.
const TURN_SPILL_PREVIEW_CHARS: usize = 4_000;

/// After all tool results for a turn are collected, if their combined
/// untruncated content exceeds `TURN_TOOL_OUTPUT_BUDGET_CHARS`, spill the
/// largest outputs to disk artifacts (descending by size) until the total
/// fits. Each spilled output is replaced with a short preview plus a
/// `[persisted-output]` tag pointing at the artifact file.
pub(crate) fn enforce_turn_tool_budget(
    session_id: &str,
    turn_id: &str,
    outputs: &mut [Value],
    tool_call_ids: &[String],
) {
    let total: usize = outputs
        .iter()
        .filter(|o| !o.get("truncated").and_then(Value::as_bool).unwrap_or(false))
        .map(|o| {
            o.get("content")
                .and_then(Value::as_str)
                .map(str::len)
                .unwrap_or(0)
        })
        .sum();
    if total <= TURN_TOOL_OUTPUT_BUDGET_CHARS {
        return;
    }

    // Collect indices of untruncated outputs with non-empty content, sorted
    // descending by byte length so we spill the biggest offenders first.
    let mut candidates: Vec<(usize, usize)> = outputs
        .iter()
        .enumerate()
        .filter(|(_, o)| !o.get("truncated").and_then(Value::as_bool).unwrap_or(false))
        .map(|(i, o)| {
            (
                i,
                o.get("content")
                    .and_then(Value::as_str)
                    .map(str::len)
                    .unwrap_or(0),
            )
        })
        .filter(|(_, len)| *len > 0)
        .collect();
    candidates.sort_by(|a, b| b.1.cmp(&a.1));

    let mut remaining = total;
    for (idx, content_len) in candidates {
        if remaining <= TURN_TOOL_OUTPUT_BUDGET_CHARS {
            break;
        }
        let tool_call_id = &tool_call_ids[idx];
        let content = outputs[idx]
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let artifact_ref = write_tool_artifact(session_id, turn_id, tool_call_id, &content);
        let mut truncated: String = content.chars().take(TURN_SPILL_PREVIEW_CHARS).collect();
        match artifact_ref
            .as_ref()
            .and_then(|r| r.get("path"))
            .and_then(Value::as_str)
        {
            Some(path) => truncated.push_str(&format!(
                "\n\n[persisted-output]\nFull output saved to: {path}\nUse read_file to access the full content.\n[/persisted-output]"
            )),
            None => truncated.push_str("\n\n[truncated]"),
        }
        if let Some(obj) = outputs[idx].as_object_mut() {
            obj.insert("content".to_string(), Value::String(truncated));
            obj.insert("truncated".to_string(), Value::Bool(true));
            if let Some(artifact_ref) = artifact_ref {
                obj.insert("artifactRef".to_string(), artifact_ref);
            }
        }
        remaining = remaining.saturating_sub(content_len.saturating_sub(TURN_SPILL_PREVIEW_CHARS));
    }
}

#[cfg(test)]
mod cancelled_output_tests {
    use super::*;

    #[test]
    fn cancelled_envelope_keeps_flag_and_names_reason() {
        let output = cancelled_tool_output(
            CANCEL_REASON_USER_STOP,
            "Lyra tool call was cancelled by the user.",
            "Stop this tool call and continue only after a new user turn.",
            None,
        );
        assert_eq!(
            output.pointer("/error/code").and_then(Value::as_str),
            Some("cancelled")
        );
        assert_eq!(
            output.pointer("/error/reason").and_then(Value::as_str),
            Some("user_stop")
        );
        assert_eq!(output.get("cancelled").and_then(Value::as_bool), Some(true));
        assert_eq!(
            output.get("content").and_then(Value::as_str),
            Some("Lyra tool call was cancelled by the user.")
        );
        assert_eq!(
            output.get("recommendedNextAction").and_then(Value::as_str),
            Some("Stop this tool call and continue only after a new user turn.")
        );
    }

    #[test]
    fn cancelled_content_is_not_failure_prefixed() {
        let output = cancelled_tool_output(
            CANCEL_REASON_PERMISSION_WAIT,
            "Lyra tool call was cancelled before permission was resolved.",
            "Ask the user again in a new turn if the action is still needed.",
            None,
        );
        let content = output
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
        assert!(!content.starts_with("Lyra tool failed"));
    }
}
