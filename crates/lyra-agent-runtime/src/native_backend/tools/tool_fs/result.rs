use super::*;

pub(super) fn native_failure_from_tool_fs(error: ToolFsError) -> NativeToolFailure {
    NativeToolFailure {
        code: error.code,
        message: error.message,
        recommended_next_action: error.recommended_next_action,
        detail: error.detail,
        cancel_reason: None,
    }
}

pub(super) fn tool_fs_content(raw: &Value) -> String {
    match raw.get("kind").and_then(Value::as_str) {
        Some("tool_fs_search") => {
            let query = raw.get("query").and_then(Value::as_str).unwrap_or("");
            let total = raw.get("total").and_then(Value::as_u64).unwrap_or(0);
            let recommended_next_action = raw
                .get("recommendedNextAction")
                .and_then(Value::as_str)
                .unwrap_or("Refine the query or browse a relevant Tool-FS domain.");
            let first = raw
                .get("results")
                .and_then(Value::as_array)
                .and_then(|results| results.first())
                .cloned();
            if first.is_none() {
                return format!(
                    "Searched Tool-FS for `{query}`: {total} matches. {recommended_next_action}"
                );
            }
            let first_path = first
                .as_ref()
                .and_then(|result| result.get("path"))
                .and_then(Value::as_str)
                .unwrap_or("no result");
            let run_hint = first
                .as_ref()
                .and_then(|result| result.get("runHint"))
                .and_then(Value::as_str)
                .unwrap_or("inspect if argument details are unclear");
            format!(
                "Searched Tool-FS for `{query}`: {total} matches. Top result: {first_path}. Search results include miniSchema/runHint; {run_hint}."
            )
        }
        Some("tool_fs_directory") => {
            let path = raw.get("path").and_then(Value::as_str).unwrap_or("/tools");
            let directories = raw
                .get("directories")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0);
            let tools = raw
                .get("tools")
                .and_then(Value::as_array)
                .map(Vec::len)
                .unwrap_or(0);
            format!("Listed {path}: {directories} directories, {tools} tools.")
        }
        Some("tool_manifest") => format!(
            "Inspected {}.",
            raw.get("path").and_then(Value::as_str).unwrap_or("tool")
        ),
        Some("tool_fs_doc") => raw
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or("Tool documentation.")
            .to_string(),
        _ => serde_json::to_string_pretty(raw).unwrap_or_default(),
    }
}

pub(super) fn tool_fs_meta_input(name: &str, arguments: Value) -> Value {
    let mut input = arguments.as_object().cloned().unwrap_or_default();
    input.insert(
        "action".to_string(),
        Value::String(meta_action(name).to_string()),
    );
    input.insert(
        "toolPath".to_string(),
        Value::String(format!("/tools/runtime/{name}")),
    );
    input.insert("domain".to_string(), Value::String("runtime".to_string()));
    input.insert(
        "operation".to_string(),
        Value::String(meta_action(name).to_string()),
    );
    Value::Object(input)
}

pub(super) fn meta_action(name: &str) -> &'static str {
    match name {
        TOOL_FS_SEARCH => "search",
        TOOL_FS_LIST => "list",
        TOOL_FS_READ_DOC => "read_doc",
        TOOL_FS_INSPECT => "inspect",
        TOOL_FS_RUN => "run",
        _ => "tool_fs",
    }
}

pub(super) fn meta_result_envelope(
    operation: &str,
    content: String,
    raw: Value,
    operation_envelope: &ToolOperationEnvelope,
    trace: Vec<ToolTraceRecord>,
    duration_ms: u64,
) -> Value {
    result_envelope_value(
        ToolResultEnvelope {
            schema_version: TOOL_FS_SCHEMA_VERSION,
            status: "completed".to_string(),
            runtime_turn_id: operation_envelope.runtime_turn_id.clone(),
            duration_ms,
            trace_id: operation_envelope.trace_id.clone(),
            ok: true,
            content,
            raw,
            tool_path: format!("/tools/runtime/tool_fs_{operation}"),
            domain: "runtime".to_string(),
            operation: operation.to_string(),
            artifacts: Vec::new(),
            artifact_refs: Vec::new(),
            projection_ref: None,
            data_ref: None,
            stdout_ref: None,
            stderr_ref: None,
            changes: Vec::new(),
            error: None,
            not_run_reason: None,
        },
        operation_envelope,
        trace,
        None,
    )
}

pub(super) fn meta_failure_envelope(
    operation: &str,
    error: NativeToolFailure,
    operation_envelope: &ToolOperationEnvelope,
    trace: Vec<ToolTraceRecord>,
    duration_ms: u64,
) -> Value {
    let error_value = native_failure_value(&error);
    result_envelope_value(
        ToolResultEnvelope {
            schema_version: TOOL_FS_SCHEMA_VERSION,
            status: "failed".to_string(),
            runtime_turn_id: operation_envelope.runtime_turn_id.clone(),
            duration_ms,
            trace_id: operation_envelope.trace_id.clone(),
            ok: false,
            content: format!("Lyra tool failed: {}", error.message),
            raw: json!({}),
            tool_path: format!("/tools/runtime/tool_fs_{operation}"),
            domain: "runtime".to_string(),
            operation: operation.to_string(),
            artifacts: Vec::new(),
            artifact_refs: Vec::new(),
            projection_ref: None,
            data_ref: None,
            stdout_ref: None,
            stderr_ref: None,
            changes: Vec::new(),
            error: Some(error_value),
            not_run_reason: Some(error.code),
        },
        operation_envelope,
        trace,
        None,
    )
}

pub(super) fn inject_manifest_metadata(
    args: Value,
    manifest: &ToolManifest,
    operation_envelope: &lyra_tool_fs_core::ToolOperationEnvelope,
) -> Value {
    let mut input = args.as_object().cloned().unwrap_or_default();
    input.insert("toolPath".to_string(), Value::String(manifest.path.clone()));
    input.insert("domain".to_string(), Value::String(manifest.domain.clone()));
    input.insert(
        "operation".to_string(),
        Value::String(manifest.operation.clone()),
    );
    input.insert(
        "toolOperation".to_string(),
        serde_json::to_value(operation_envelope).unwrap_or_else(|_| Value::Null),
    );
    Value::Object(input)
}

pub(super) fn target_failure_envelope(
    manifest: Option<&ToolManifest>,
    error: NativeToolFailure,
    operation_envelope: &ToolOperationEnvelope,
    trace: Vec<ToolTraceRecord>,
    duration_ms: u64,
) -> Value {
    let tool_path = manifest
        .map(|manifest| manifest.path.clone())
        .or_else(|| operation_envelope.path.clone())
        .unwrap_or_else(|| "/tools/runtime/tool_fs_run".to_string());
    let domain = manifest
        .map(|manifest| manifest.domain.clone())
        .or_else(|| {
            tool_path
                .trim_start_matches("/tools/")
                .split('/')
                .next()
                .filter(|value| !value.is_empty())
                .map(str::to_string)
        })
        .unwrap_or_else(|| "runtime".to_string());
    let operation = manifest
        .map(|manifest| manifest.operation.clone())
        .unwrap_or_else(|| "run".to_string());
    let error_value = native_failure_value(&error);
    let mut value = result_envelope_value(
        ToolResultEnvelope {
            schema_version: TOOL_FS_SCHEMA_VERSION,
            status: if error.code == "operation_cancelled" {
                "cancelled".to_string()
            } else {
                "failed".to_string()
            },
            runtime_turn_id: operation_envelope.runtime_turn_id.clone(),
            duration_ms,
            trace_id: operation_envelope.trace_id.clone(),
            ok: false,
            content: format!("Lyra tool failed: {}", error.message),
            raw: json!({}),
            tool_path,
            domain,
            operation,
            artifacts: Vec::new(),
            artifact_refs: Vec::new(),
            projection_ref: None,
            data_ref: None,
            stdout_ref: None,
            stderr_ref: None,
            changes: Vec::new(),
            error: Some(error_value),
            not_run_reason: Some(error.code),
        },
        operation_envelope,
        trace,
        manifest,
    );
    annotate_cached_tool_failure(&mut value, manifest, operation_envelope);
    if let Some(manifest) = manifest {
        record_tool_usage_from_result(manifest, operation_envelope, &value);
    }
    value
}

pub(super) fn result_envelope(
    manifest: &ToolManifest,
    args: &Value,
    output: Value,
    operation_envelope: &ToolOperationEnvelope,
    trace: Vec<ToolTraceRecord>,
    duration_ms: u64,
) -> Value {
    let error = output
        .get("error")
        .filter(|value| !value.is_null())
        .cloned();
    let status = result_status(&output);
    let ok = status == "completed";
    let content_source = output
        .get("content")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| serde_json::to_string_pretty(&output).unwrap_or_default());
    let (content, content_projection_ref) = compact_content_projection(
        &operation_envelope.session_id,
        &operation_envelope.runtime_turn_id,
        &operation_envelope.op_id,
        content_source,
    );
    let raw_source = output.get("raw").cloned().unwrap_or_else(|| output.clone());
    let (raw, raw_data_ref) = compact_raw_payload(
        &operation_envelope.session_id,
        &operation_envelope.runtime_turn_id,
        &operation_envelope.op_id,
        &manifest.path,
        raw_source,
    );
    let mut artifacts = collect_artifacts(&output);
    if let Some(raw_data_ref) = raw_data_ref.as_ref() {
        artifacts.push(raw_data_ref.clone());
    }
    if let Some(content_projection_ref) = content_projection_ref.as_ref() {
        artifacts.push(content_projection_ref.clone());
    }
    artifacts = dedupe_values(artifacts);
    let data_ref = first_artifact_like(&output, &["artifactRef", "dataRef"]).or(raw_data_ref);
    let projection_ref =
        first_artifact_like(&output, &["projectionRef"]).or(content_projection_ref);
    let stdout_ref = first_artifact_like(&output, &["stdoutRef", "stdoutArtifactRef"]);
    let stderr_ref = first_artifact_like(&output, &["stderrRef", "stderrArtifactRef"]);
    let not_run_reason = not_run_reason(&output);
    let changes = if not_run_reason.is_some() {
        Vec::new()
    } else {
        infer_changes(manifest, args, &output)
    };
    let envelope = ToolResultEnvelope {
        schema_version: TOOL_FS_SCHEMA_VERSION,
        status: status.to_string(),
        runtime_turn_id: operation_envelope.runtime_turn_id.clone(),
        duration_ms,
        trace_id: operation_envelope.trace_id.clone(),
        ok,
        content,
        raw,
        tool_path: manifest.path.clone(),
        domain: manifest.domain.clone(),
        operation: manifest.operation.clone(),
        artifacts: artifacts.clone(),
        artifact_refs: artifacts,
        projection_ref,
        data_ref,
        stdout_ref,
        stderr_ref,
        changes,
        error,
        not_run_reason,
    };
    let mut envelope = result_envelope_value(envelope, operation_envelope, trace, Some(manifest));
    preserve_output_fields(&mut envelope, &output);
    annotate_cached_tool_failure(&mut envelope, Some(manifest), operation_envelope);
    record_tool_usage_from_result(manifest, operation_envelope, &envelope);
    envelope
}

pub(super) fn result_envelope_value(
    envelope: ToolResultEnvelope,
    operation_envelope: &ToolOperationEnvelope,
    trace: Vec<ToolTraceRecord>,
    manifest: Option<&ToolManifest>,
) -> Value {
    let mut value = serde_json::to_value(envelope).unwrap_or_else(|_| json!({}));
    let Some(object) = value.as_object_mut() else {
        return value;
    };
    object.insert(
        "toolOperation".to_string(),
        serde_json::to_value(operation_envelope).unwrap_or_else(|_| Value::Null),
    );
    object.insert(
        "trace".to_string(),
        serde_json::to_value(trace).unwrap_or_else(|_| json!([])),
    );
    if let Some(manifest) = manifest {
        object.insert(
            "manifestTitle".to_string(),
            Value::String(manifest.title.clone()),
        );
        object.insert(
            "activityKind".to_string(),
            Value::String(manifest.activity_kind.clone()),
        );
        object.insert(
            "rendererHint".to_string(),
            Value::String(manifest.renderer_hint.clone()),
        );
    }
    value
}

pub(super) fn preserve_output_fields(envelope: &mut Value, output: &Value) {
    let Some(envelope_object) = envelope.as_object_mut() else {
        return;
    };
    if let Some(output_object) = output.as_object() {
        for (key, value) in output_object {
            envelope_object
                .entry(key.to_string())
                .or_insert_with(|| value.clone());
        }
    }
}

pub(super) fn result_status(output: &Value) -> &'static str {
    if output.get("cancelled").and_then(Value::as_bool) == Some(true) {
        return "cancelled";
    }
    let semantic_status = output
        .get("status")
        .or_else(|| output.pointer("/raw/status"))
        .and_then(Value::as_str);
    if matches!(semantic_status, Some("partial" | "degraded"))
        || output.get("notApplicable").and_then(Value::as_bool) == Some(true)
        || output
            .pointer("/raw/notApplicable")
            .and_then(Value::as_bool)
            == Some(true)
    {
        return "partial";
    }
    if output.get("error").is_some_and(|value| !value.is_null())
        || output
            .get("raw")
            .and_then(|raw| raw.get("ok"))
            .and_then(Value::as_bool)
            == Some(false)
        || output
            .get("raw")
            .and_then(|raw| raw.get("success"))
            .and_then(Value::as_bool)
            == Some(false)
    {
        return "failed";
    }
    "completed"
}

pub(super) fn native_failure_value(error: &NativeToolFailure) -> Value {
    json!({
        "code": error.code,
        "message": error.message,
        "detail": error.detail,
        "recommendedNextAction": error.recommended_next_action,
    })
}

pub(super) fn not_run_reason(output: &Value) -> Option<String> {
    if output.get("cancelled").and_then(Value::as_bool) == Some(true) {
        return Some("cancelled".to_string());
    }
    if output
        .get("raw")
        .and_then(|raw| raw.get("timedOut"))
        .and_then(Value::as_bool)
        == Some(true)
    {
        return Some("timeout".to_string());
    }
    let code = output
        .pointer("/error/code")
        .or_else(|| output.pointer("/raw/error/code"))
        .or_else(|| output.pointer("/raw/error/kind"))
        .and_then(Value::as_str)
        .map(str::to_string);
    code.and_then(|code| {
        let lower = code.to_ascii_lowercase();
        if lower.contains("timeout") {
            Some("timeout".to_string())
        } else if lower.contains("permission") {
            Some(code)
        } else if lower.contains("cancel") {
            Some(code)
        } else if lower.contains("unavailable") || lower.contains("validation") {
            Some(code)
        } else if matches!(
            lower.as_str(),
            "invalid_tool_args"
                | "invalid_tool_target"
                | "tool_target_required"
                | "tool_not_found"
                | "host_capability_failed"
                | "host_channel_closed"
                | "host_unavailable"
        ) {
            Some(code)
        } else if result_status(output) == "failed" && output.get("error").is_some() {
            Some(code)
        } else {
            None
        }
    })
}

pub(super) fn compact_raw_payload(
    session_id: &str,
    turn_id: &str,
    op_id: &str,
    tool_path: &str,
    raw: Value,
) -> (Value, Option<Value>) {
    let raw_text = serde_json::to_string_pretty(&raw).unwrap_or_else(|_| raw.to_string());
    if raw_text.chars().count() <= MAX_TOOL_FS_RAW_CHARS {
        return (raw, None);
    }
    let artifact_ref = write_tool_artifact_with_kind(
        session_id,
        turn_id,
        &format!("{op_id}-raw"),
        ToolArtifactKind::RawData,
        &raw_text,
    );
    let mut compact = json!({
        "kind": "tool_fs_raw_ref",
        "toolPath": tool_path,
        "truncated": true,
        "originalChars": raw_text.chars().count(),
        "artifactRef": artifact_ref.clone(),
        "message": "Raw Tool-FS output exceeded the model budget and was stored as an artifact.",
    });
    preserve_raw_timeline_facts(&raw, &mut compact);
    (compact, artifact_ref)
}

pub(super) fn compact_content_projection(
    session_id: &str,
    turn_id: &str,
    op_id: &str,
    content: String,
) -> (String, Option<Value>) {
    if content.chars().count() <= MAX_TOOL_FS_CONTENT_CHARS {
        return (content, None);
    }
    let artifact_ref = write_tool_artifact_with_kind(
        session_id,
        turn_id,
        &format!("{op_id}-projection"),
        ToolArtifactKind::Projection,
        &content,
    );
    let compact = truncate_chars(&content, MAX_TOOL_FS_CONTENT_CHARS);
    (compact, artifact_ref)
}

pub(super) fn collect_artifacts(output: &Value) -> Vec<Value> {
    let mut artifacts = Vec::new();
    for source in [Some(output), output.get("raw")] {
        let Some(source) = source else {
            continue;
        };
        for key in [
            "artifactRef",
            "diffArtifactRef",
            "projectionRef",
            "dataRef",
            "stdoutRef",
            "stderrRef",
            "stdoutArtifactRef",
            "stderrArtifactRef",
            "logArtifactRef",
            "screenshotArtifactRef",
            "pageArtifactRef",
            "imageArtifact",
        ] {
            if let Some(artifact) = source.get(key).filter(|value| value.is_object()) {
                artifacts.push(artifact.clone());
            }
        }
        if let Some(raw_artifacts) = source.get("artifacts").and_then(Value::as_array) {
            artifacts.extend(
                raw_artifacts
                    .iter()
                    .filter(|value| value.is_object())
                    .cloned(),
            );
        }
        if let Some(changed_files) = source.get("changedFiles").and_then(Value::as_array) {
            for changed_file in changed_files {
                for key in ["beforeRef", "afterRef", "diffRef"] {
                    if let Some(artifact) = changed_file.get(key).filter(|value| value.is_object())
                    {
                        artifacts.push(artifact.clone());
                    }
                }
            }
        }
    }
    dedupe_values(artifacts)
}

pub(super) fn first_artifact_like(output: &Value, keys: &[&str]) -> Option<Value> {
    for source in [Some(output), output.get("raw")] {
        let Some(source) = source else {
            continue;
        };
        for key in keys {
            if let Some(value) = source.get(*key).filter(|value| value.is_object()) {
                return Some(value.clone());
            }
        }
    }
    None
}

pub(super) fn dedupe_values(values: Vec<Value>) -> Vec<Value> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| {
            serde_json::to_string(value)
                .ok()
                .is_none_or(|key| seen.insert(key))
        })
        .collect()
}

pub(super) fn infer_changes(
    manifest: &ToolManifest,
    args: &Value,
    output: &Value,
) -> Vec<ToolChangeRecord> {
    let path = args
        .get("path")
        .or_else(|| args.get("file"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let diff_ref = first_artifact_like(output, &["diffArtifactRef"]);
    let change = |kind: &str,
                  operation: &str,
                  path: Option<String>,
                  summary: &str,
                  detail: Value,
                  reversible: bool,
                  before_ref: Option<Value>,
                  after_ref: Option<Value>,
                  diff_ref: Option<Value>|
     -> ToolChangeRecord {
        ToolChangeRecord {
            schema_version: TOOL_FS_SCHEMA_VERSION,
            change_id: format!("change-{}", Uuid::new_v4()),
            kind: kind.to_string(),
            operation: operation.to_string(),
            path,
            summary: summary.to_string(),
            detail,
            reversible,
            before_ref,
            after_ref,
            diff_ref,
        }
    };
    match (manifest.domain.as_str(), manifest.operation.as_str()) {
        ("filesystem", "write" | "edit" | "multiedit" | "apply_patch") => {
            let changed_files = output
                .pointer("/raw/changedFiles")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if changed_files.is_empty() {
                return vec![change(
                    "file",
                    &manifest.operation,
                    path,
                    "Filesystem mutation executed.",
                    args.clone(),
                    true,
                    None,
                    None,
                    diff_ref,
                )];
            }
            changed_files
                .into_iter()
                .map(|file| {
                    let operation = file
                        .get("operation")
                        .and_then(Value::as_str)
                        .unwrap_or(&manifest.operation)
                        .to_string();
                    let path = file.get("path").and_then(Value::as_str).map(str::to_string);
                    let before_ref = file
                        .get("beforeRef")
                        .filter(|value| value.is_object())
                        .cloned();
                    let after_ref = file
                        .get("afterRef")
                        .filter(|value| value.is_object())
                        .cloned();
                    let file_diff_ref = file
                        .get("diffRef")
                        .filter(|value| value.is_object())
                        .cloned()
                        .or_else(|| diff_ref.clone());
                    change(
                        "file",
                        &operation,
                        path,
                        "Filesystem mutation executed.",
                        file,
                        true,
                        before_ref,
                        after_ref,
                        file_diff_ref,
                    )
                })
                .collect()
        }
        ("shell", "run") => vec![change(
            "process",
            "run",
            None,
            "Shell command executed.",
            json!({
                "command": output.pointer("/raw/command").cloned().unwrap_or_else(|| args.get("command").cloned().unwrap_or(Value::Null)),
                "cwd": output.pointer("/raw/cwd").cloned().unwrap_or_else(|| args.get("cwd").cloned().unwrap_or(Value::Null)),
                "exitCode": output.pointer("/raw/exitCode").cloned().unwrap_or(Value::Null),
                "success": output.pointer("/raw/success").cloned().unwrap_or(Value::Null),
                "timedOut": output.pointer("/raw/timedOut").cloned().unwrap_or(Value::Null),
                "stdoutRef": first_artifact_like(output, &["stdoutRef", "stdoutArtifactRef"]),
                "stderrRef": first_artifact_like(output, &["stderrRef", "stderrArtifactRef"]),
            }),
            false,
            None,
            None,
            None,
        )],
        ("terminal", operation)
            if matches!(
                operation,
                "create"
                    | "close"
                    | "write"
                    | "run"
                    | "input"
                    | "keys"
                    | "resize"
                    | "signal"
                    | "act"
                    | "attach_agent"
                    | "detach_agent"
            ) =>
        {
            vec![change(
                "terminal",
                operation,
                None,
                "Terminal state changed.",
                args.clone(),
                false,
                None,
                None,
                first_artifact_like(output, &["logArtifactRef", "artifactRef"]),
            )]
        }
        ("git", "stage" | "unstage" | "discard") => {
            let changed_files = output
                .pointer("/raw/changedFiles")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if changed_files.is_empty() {
                return vec![change(
                    "git",
                    &manifest.operation,
                    path,
                    "Git working tree mutation executed.",
                    args.clone(),
                    manifest.operation != "discard",
                    None,
                    None,
                    diff_ref,
                )];
            }
            changed_files
                .into_iter()
                .map(|file| {
                    let operation = file
                        .get("operation")
                        .and_then(Value::as_str)
                        .unwrap_or(&manifest.operation)
                        .to_string();
                    let path = file.get("path").and_then(Value::as_str).map(str::to_string);
                    let before_ref = file
                        .get("beforeRef")
                        .filter(|value| value.is_object())
                        .cloned();
                    let after_ref = file
                        .get("afterRef")
                        .filter(|value| value.is_object())
                        .cloned();
                    let file_diff_ref = file
                        .get("diffRef")
                        .filter(|value| value.is_object())
                        .cloned()
                        .or_else(|| diff_ref.clone());
                    let reversible = file
                        .get("reversible")
                        .and_then(Value::as_bool)
                        .unwrap_or(manifest.operation != "discard");
                    change(
                        "git",
                        &operation,
                        path,
                        "Git working tree mutation executed.",
                        file,
                        reversible,
                        before_ref,
                        after_ref,
                        file_diff_ref,
                    )
                })
                .collect()
        }
        ("browser", operation) if browser_operation_mutates(operation) => vec![change(
            "browser",
            operation,
            None,
            "Browser state changed.",
            json!({
                "input": args,
                "result": output.get("raw").cloned().unwrap_or(Value::Null),
            }),
            false,
            None,
            None,
            first_artifact_like(
                output,
                &["artifactRef", "imageArtifact", "screenshotArtifactRef"],
            ),
        )],
        ("software", "invoke_capability") if risk_level_mutates(manifest) => vec![change(
            "external",
            "invoke_capability",
            Some(manifest.path.clone()),
            "Software capability changed external state.",
            json!({
                "input": args,
                "result": output.get("raw").cloned().unwrap_or(Value::Null),
            }),
            false,
            None,
            None,
            first_artifact_like(output, &["artifactRef", "dataRef"]),
        )],
        ("memory", "write") => {
            let operation = args
                .get("action")
                .and_then(Value::as_str)
                .unwrap_or(&manifest.operation);
            vec![change(
                "memory",
                operation,
                Some(manifest.path.clone()),
                "Tool mutation executed.",
                json!({
                    "input": args,
                    "result": output.get("raw").cloned().unwrap_or(Value::Null),
                }),
                false,
                None,
                None,
                first_artifact_like(output, &["artifactRef", "dataRef", "logArtifactRef"]),
            )]
        }
        _ if risk_level_mutates(manifest) => vec![change(
            generic_mutation_change_kind(&manifest.domain),
            &manifest.operation,
            path.or_else(|| Some(manifest.path.clone())),
            "Tool mutation executed.",
            json!({
                "input": args,
                "result": output.get("raw").cloned().unwrap_or(Value::Null),
            }),
            false,
            None,
            None,
            first_artifact_like(output, &["artifactRef", "dataRef", "logArtifactRef"]),
        )],
        _ => Vec::new(),
    }
}

pub(super) fn browser_operation_mutates(operation: &str) -> bool {
    matches!(
        operation,
        "act" | "vact" | "type" | "press" | "submit" | "navigate" | "reload" | "elevate"
    )
}

pub(super) fn risk_level_mutates(manifest: &ToolManifest) -> bool {
    super::super::risk_identifier_mutates(&manifest.risk_level)
}

pub(super) fn generic_mutation_change_kind(domain: &str) -> &str {
    match domain {
        "memory" => "memory",
        "todo" => "todo",
        "skills" => "runtime",
        "mcp" | "software" => "external",
        "browser" => "browser",
        "terminal" => "terminal",
        "git" => "git",
        "filesystem" => "file",
        _ => "state",
    }
}
