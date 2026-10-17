use super::*;

#[derive(Clone, Debug)]
pub(crate) struct NativeToolSuccess {
    pub(crate) content: String,
    pub(crate) raw: Value,
    pub(crate) recommended_next_action: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct NativeToolFailure {
    pub(crate) code: String,
    pub(crate) message: String,
    pub(crate) recommended_next_action: String,
    pub(crate) detail: Option<Value>,
    /// Set when the failure is a cancellation; the output then uses the
    /// cancellation envelope instead of the failure envelope.
    pub(crate) cancel_reason: Option<&'static str>,
}

impl NativeToolFailure {
    pub(crate) fn new(
        code: impl Into<String>,
        message: impl Into<String>,
        recommended_next_action: impl Into<String>,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            recommended_next_action: recommended_next_action.into(),
            detail: None,
            cancel_reason: None,
        }
    }

    pub(crate) fn cancelled(
        reason: &'static str,
        message: impl Into<String>,
        recommended_next_action: impl Into<String>,
    ) -> Self {
        Self {
            cancel_reason: Some(reason),
            ..Self::new("cancelled", message, recommended_next_action)
        }
    }

    pub(crate) fn with_detail(mut self, detail: Value) -> Self {
        self.detail = Some(detail);
        self
    }
}

pub(crate) type NativeToolResult = Result<NativeToolSuccess, NativeToolFailure>;

#[derive(Clone, Debug)]
pub(crate) struct WorkspacePath {
    pub(crate) root: PathBuf,
    pub(crate) absolute: PathBuf,
    pub(crate) relative: String,
    pub(crate) outside_workspace: bool,
}

pub(crate) async fn execute_native_tool_adapter(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    tool_name: &str,
    display_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
) -> Value {
    if !cancellation.is_cancelled()
        && let Some(forwarded) = forward_tool_to_exec(
            session_id,
            turn_id,
            tool_call_id,
            tool_name,
            display_name,
            action,
            &arguments,
            started_at,
        )
        .await
    {
        return forwarded;
    }
    execute_native_tool_adapter_with_dispatcher(
        session_id,
        turn_id,
        cancellation,
        tool_call_id,
        tool_name,
        display_name,
        action,
        arguments,
        started_at,
        None,
    )
    .await
}

async fn forward_tool_to_exec(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    tool_name: &str,
    display_name: &str,
    action: &str,
    arguments: &Value,
    started_at: &str,
) -> Option<Value> {
    // The exec companion cannot execute forwarded tool calls correctly yet:
    // it holds no turn state (every forwarded call looked "cancelled"), the
    // exec role only serves `agent.exec.run` so a permission wait could never
    // be answered, and mid-flight cancellation cannot reach it. Forwarding is
    // therefore off by default and tools run locally in the agent host; set
    // LYRA_EXEC_FORWARDING=1 only when developing the companion itself.
    if std::env::var("LYRA_EXEC_FORWARDING").ok().as_deref() != Some("1") {
        return None;
    }
    let socket = std::env::var("LYRA_EXEC_SOCKET").ok()?;
    if socket.is_empty() || std::env::var("LYRA_HOST_ROLE").ok().as_deref() == Some("exec") {
        return None;
    }
    let payload = json!({
        "sessionId": session_id,
        "turnId": turn_id,
        "toolCallId": tool_call_id,
        "toolName": tool_name,
        "displayName": display_name,
        "action": action,
        "arguments": arguments,
        "startedAt": started_at,
    });
    let joined = tokio::task::spawn_blocking(move || submit_exec_job(socket, payload)).await;
    match joined {
        // `None` means the call was never delivered to the exec host, so the
        // caller falls back to running it locally instead of surfacing a
        // transport error as the tool result.
        Ok(Ok(value)) => Some(value),
        _ => None,
    }
}

struct ExecJob {
    socket: String,
    payload: Value,
    reply: std::sync::mpsc::Sender<Result<Value, ExecJobError>>,
}

/// Why a forwarded tool call produced no result.
enum ExecJobError {
    /// The request never reached the exec host; the caller may run the tool
    /// locally without risking a double execution.
    NotDelivered,
    /// The connection dropped mid-call; the tool may have run, so the caller
    /// must surface an error instead of re-executing locally.
    ConnectionLost,
}

#[cfg(unix)]
fn submit_exec_job(socket: String, payload: Value) -> Result<Value, ExecJobError> {
    let (reply, receiver) = std::sync::mpsc::channel();
    if exec_jobs()
        .send(ExecJob {
            socket,
            payload,
            reply,
        })
        .is_err()
    {
        return Err(ExecJobError::NotDelivered);
    }
    // ponytail: one connection answers host callbacks, so tool calls queue.
    // A host callback that itself waits on another tool deadlocks this queue.
    receiver
        .recv()
        .map_err(|_| ExecJobError::NotDelivered)
        .and_then(std::convert::identity)
}

#[cfg(not(unix))]
fn submit_exec_job(_socket: String, _payload: Value) -> Result<Value, ExecJobError> {
    Err(ExecJobError::NotDelivered)
}

#[cfg(unix)]
fn exec_jobs() -> &'static std::sync::mpsc::Sender<ExecJob> {
    use std::sync::OnceLock;
    static JOBS: OnceLock<std::sync::mpsc::Sender<ExecJob>> = OnceLock::new();
    JOBS.get_or_init(|| {
        let (sender, receiver) = std::sync::mpsc::channel();
        std::thread::spawn(move || exec_client_loop(receiver));
        sender
    })
}

#[cfg(unix)]
fn exec_client_loop(jobs: std::sync::mpsc::Receiver<ExecJob>) {
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_ID: AtomicU64 = AtomicU64::new(1);
    let mut connection: Option<(
        std::io::BufReader<std::os::unix::net::UnixStream>,
        std::os::unix::net::UnixStream,
        String,
    )> = None;
    while let Ok(job) = jobs.recv() {
        if connection.as_ref().is_none_or(|open| open.2 != job.socket) {
            connection = connect_exec(&job.socket).ok();
        }
        let id = format!("exec-run-{}", NEXT_ID.fetch_add(1, Ordering::Relaxed));
        let result = run_exec_job(&mut connection, &job, &id);
        match result {
            Ok(value) => {
                let _ = job.reply.send(Ok(value));
            }
            Err(error @ ExecJobError::NotDelivered) => {
                connection = None;
                let _ = job.reply.send(Err(error));
            }
            Err(ExecJobError::ConnectionLost) => {
                connection = None;
                let _ = job.reply.send(Ok(tool_failure_output(
                    "exec_host_unavailable",
                    "The exec host connection was lost while running this tool call.",
                    "Retry the tool call.",
                    None,
                )));
            }
        }
    }
}

#[cfg(unix)]
fn run_exec_job(
    connection: &mut Option<(
        std::io::BufReader<std::os::unix::net::UnixStream>,
        std::os::unix::net::UnixStream,
        String,
    )>,
    job: &ExecJob,
    id: &str,
) -> Result<Value, ExecJobError> {
    use std::io::{BufRead, Write};
    use std::time::Duration;

    let Some((reader, writer, _)) = connection.as_mut() else {
        return Err(ExecJobError::NotDelivered);
    };
    let request = serde_json::json!({
        "kind": "request",
        "id": id,
        "method": "agent.exec.run",
        "payload": job.payload
    });
    let _ = writer.set_write_timeout(Some(Duration::from_secs(5)));
    if writeln!(writer, "{request}").is_err() || writer.flush().is_err() {
        return Err(ExecJobError::NotDelivered);
    }
    loop {
        let mut line = String::new();
        if reader.read_line(&mut line).is_err() || line.is_empty() {
            return Err(ExecJobError::ConnectionLost);
        }
        let envelope: Value = serde_json::from_str(line.trim()).unwrap_or(Value::Null);
        match envelope.get("kind").and_then(Value::as_str) {
            Some("event") => {
                if let Some(payload) = envelope.get("payload") {
                    crate::relay_runtime_event(payload.to_string());
                }
            }
            Some("request") => {
                let request_id = envelope
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let method = envelope
                    .get("method")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_string();
                let payload = envelope.get("payload").cloned().unwrap_or(Value::Null);
                let response = match crate::call_registered_host_capability(&method, payload) {
                    Ok(result) => serde_json::json!({
                        "kind": "response",
                        "id": request_id,
                        "ok": true,
                        "result": result
                    }),
                    Err(error) => serde_json::json!({
                        "kind": "response",
                        "id": request_id,
                        "ok": false,
                        "error": {"code": "RUNTIME_HOST_REQUEST_FAILED", "message": error}
                    }),
                };
                if writeln!(writer, "{response}").is_err() || writer.flush().is_err() {
                    return Err(ExecJobError::ConnectionLost);
                }
            }
            Some("response") if envelope.get("id").and_then(Value::as_str) == Some(id) => {
                if envelope.get("ok").and_then(Value::as_bool) == Some(true) {
                    return Ok(envelope.get("result").cloned().unwrap_or(Value::Null));
                }
                return Ok(tool_failure_output(
                    "exec_host_rejected",
                    envelope
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("The exec host rejected this tool call."),
                    "Retry the tool call.",
                    None,
                ));
            }
            _ => {}
        }
    }
}

#[cfg(unix)]
fn connect_exec(
    socket: &str,
) -> std::io::Result<(
    std::io::BufReader<std::os::unix::net::UnixStream>,
    std::os::unix::net::UnixStream,
    String,
)> {
    use std::io::{BufRead, BufReader, Write};
    use std::os::unix::net::UnixStream;
    use std::sync::atomic::AtomicU64;
    use std::time::Duration;
    static NEXT_EXEC_LEASE: AtomicU64 = AtomicU64::new(1);
    let stream = UnixStream::connect(socket)?;
    let _ = stream.set_read_timeout(None);
    let _ = stream.set_write_timeout(Some(Duration::from_secs(5)));
    let mut writer = stream.try_clone()?;
    let hello = serde_json::json!({
        "kind": "request",
        "id": "exec-hello",
        "method": "runtime.handshake",
        "payload": {
            "protocolMinVersion": 2,
            "protocolMaxVersion": 2,
            "clientName": "lyra-agent-host",
            "componentVersion": "0.1.0",
            "buildId": "agent-host",
            "hostApiVersion": "1.0.0",
            "capabilities": ["runtime.host.requests"],
            "dataSchemas": {"lyra.desktop": 1},
            "connectionRole": "primaryHost",
            "connectionLeaseId": format!(
                "agent-exec-{}-{}",
                std::process::id(),
                NEXT_EXEC_LEASE.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            )
        }
    });
    writeln!(writer, "{hello}")?;
    writer.flush()?;
    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    reader.read_line(&mut line)?;
    let envelope: Value = serde_json::from_str(line.trim()).unwrap_or(Value::Null);
    if envelope.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(std::io::Error::other("exec host rejected the handshake"));
    }
    Ok((reader, writer, socket.to_string()))
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn execute_native_tool_adapter_with_dispatcher(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    tool_name: &str,
    display_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
) -> Value {
    execute_native_tool_adapter_with_runtime(
        session_id,
        turn_id,
        cancellation,
        tool_call_id,
        tool_name,
        display_name,
        action,
        arguments,
        started_at,
        dispatcher,
        ToolExecutionRuntime::default(),
        true,
    )
    .await
}

#[allow(clippy::too_many_arguments)]
pub(crate) async fn execute_native_tool_adapter_with_runtime(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    tool_name: &str,
    display_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    runtime: ToolExecutionRuntime,
    turn_cancellation_authoritative: bool,
) -> Value {
    let mut input = native_tool_input(action, arguments);
    let mut policy_decision = None;
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_call_id,
            display_name,
            &tool_label(display_name, action),
            "running",
            input.clone(),
            None,
            started_at,
            None,
        ),
        "toolStarted",
    );
    // `turn_cancellation_authoritative` is false for calls served by the exec
    // host: that process holds no turn state, and the agent host already gated
    // cancellation before forwarding. Deriving cancellation from the exec
    // host's (absent) session snapshot would falsely cancel every forwarded
    // call — turn ids are fresh UUIDs, so the snapshot can never match — so
    // only the forwarded token applies there.
    let turn_state_cancelled =
        turn_cancellation_authoritative && turn_was_cancelled(session_id, turn_id);
    if cancellation.is_cancelled() || turn_state_cancelled {
        let output = if cancellation.is_cancelled() {
            cancelled_tool_output(
                CANCEL_REASON_TURN_CANCELLED,
                "Lyra tool call was cancelled.",
                "Stop this tool call and continue only after a new user turn.",
                None,
            )
        } else {
            cancelled_tool_output(
                CANCEL_REASON_TURN_SUPERSEDED,
                "This tool call was cancelled because its turn is no longer active.",
                "Stop this tool call and continue only after a new user turn.",
                None,
            )
        };
        record_tool_activity(
            session_id,
            turn_id,
            tool_activity(
                tool_call_id,
                display_name,
                &tool_label(display_name, action),
                "cancelled",
                input,
                Some(output.clone()),
                started_at,
                Some(now()),
            ),
            "toolFinished",
        );
        return output;
    }
    if let Some(risk) = permission_risk(display_name, action, &input)
        && evaluate_permission_policy(display_name, action, Some(&risk), &input)
            == PermissionPolicyDecision::Deny
    {
        let output = attach_policy_decision_to_output(
            tool_failure_output(
                "permission_policy_denied",
                "The local Lyra Agent permission policy denied this native tool request.",
                "Do not execute this tool call. Explain the limitation or choose a safer alternative.",
                None,
            ),
            Some(policy_denial_decision(display_name, action, &input, &risk)),
        );
        record_tool_activity(
            session_id,
            turn_id,
            tool_activity(
                tool_call_id,
                display_name,
                &tool_label(display_name, action),
                "failed",
                input,
                Some(output.clone()),
                started_at,
                Some(now()),
            ),
            "toolFinished",
        );
        return output;
    }
    let native_permission_policy_decision =
        native_permission_policy_decision_for_tool(session_id, display_name, action, &input);
    if let Some((risk, PermissionPolicyDecision::Deny)) = &native_permission_policy_decision {
        let output = attach_policy_decision_to_output(
            tool_failure_output(
                "permission_policy_denied",
                "The local Lyra Agent permission policy denied this native tool request.",
                "Do not execute this tool call. Explain the limitation or choose a safer alternative.",
                None,
            ),
            Some(policy_denial_decision(display_name, action, &input, &risk)),
        );
        record_tool_activity(
            session_id,
            turn_id,
            tool_activity(
                tool_call_id,
                display_name,
                &tool_label(display_name, action),
                "failed",
                input,
                Some(output.clone()),
                started_at,
                Some(now()),
            ),
            "toolFinished",
        );
        return output;
    }
    apply_native_permission_policy_auto_grant(&mut input, &native_permission_policy_decision);
    let permission_opt = native_permission_request_for_tool(
        session_id,
        turn_id,
        tool_call_id,
        display_name,
        action,
        &input,
    );
    if let Some(permission) = permission_opt {
        let permission_record = permission.clone();
        match wait_for_permission_with_cancellation_async(permission, cancellation).await {
            Ok(true) => {
                if let Some(object) = input.as_object_mut() {
                    object.insert("permissionGranted".to_string(), Value::Bool(true));
                }
                policy_decision = Some(policy_decision_from_permission(
                    &permission_record,
                    "approved",
                ));
            }
            Ok(false) => {
                let output = attach_policy_decision_to_output(
                    tool_failure_output(
                        "permission_denied",
                        "The user denied this native tool request.",
                        "Do not execute this tool call. Explain the limitation or choose a safer alternative.",
                        None,
                    ),
                    Some(policy_decision_from_permission(
                        &permission_record,
                        "denied",
                    )),
                );
                record_tool_activity(
                    session_id,
                    turn_id,
                    tool_activity(
                        tool_call_id,
                        display_name,
                        &tool_label(display_name, action),
                        "failed",
                        input,
                        Some(output.clone()),
                        started_at,
                        Some(now()),
                    ),
                    "toolFinished",
                );
                return output;
            }
            Err(error) => {
                let cancelled = permission_wait_was_cancelled(&error);
                let output = if cancelled {
                    cancelled_tool_output(
                        CANCEL_REASON_PERMISSION_WAIT,
                        "Lyra tool call was cancelled before permission was resolved.",
                        "Ask the user again in a new turn if the action is still needed.",
                        None,
                    )
                } else {
                    tool_failure_output(
                        "permission_request_failed",
                        &format!("Permission request failed: {error}"),
                        "Stop this tool call and wait for user input before retrying.",
                        None,
                    )
                };
                record_tool_activity(
                    session_id,
                    turn_id,
                    tool_activity(
                        tool_call_id,
                        display_name,
                        &tool_label(display_name, action),
                        if cancelled { "cancelled" } else { "failed" },
                        input,
                        Some(output.clone()),
                        started_at,
                        Some(now()),
                    ),
                    "toolFinished",
                );
                return output;
            }
        }
    } else if policy_record_required(display_name, action, &input) {
        policy_decision = Some(auto_approval_policy_decision(display_name, action, &input));
    }

    let result = run_native_tool_with_dispatcher(
        session_id,
        turn_id,
        tool_name,
        tool_call_id,
        &input,
        dispatcher,
        cancellation,
        runtime,
    )
    .await;
    let (status, output) = match result {
        Ok(mut success) => {
            annotate_mutation_verification_requirement(&mut success.raw);
            let reported_failure = native_reported_failure(&success.raw);
            let keep_open = success.raw.get("background").and_then(Value::as_bool) == Some(true)
                && success
                    .raw
                    .get("subagentId")
                    .and_then(Value::as_str)
                    .is_some();
            let mut output = budgeted_tool_output_with_budget(
                session_id,
                turn_id,
                tool_call_id,
                success.content,
                attach_policy_decision_to_raw(success.raw, policy_decision),
                success.recommended_next_action,
                tool_content_char_budget(display_name, action),
            );
            if let Some((code, message)) = reported_failure {
                if code == "cancelled" {
                    // A cancelled tool kept its partial output; mark it with
                    // the cancellation contract instead of a failure code so
                    // loop detection does not count a user stop as a failure.
                    output["cancelled"] = Value::Bool(true);
                    output["error"] = json!({
                        "code": "cancelled",
                        "reason": CANCEL_REASON_TURN_CANCELLED,
                        "message": message,
                    });
                    ("cancelled", output)
                } else {
                    output["error"] = json!({
                        "code": code,
                        "message": message,
                    });
                    ("failed", output)
                }
            } else if keep_open {
                ("running", output)
            } else {
                ("completed", output)
            }
        }
        Err(error) => {
            let output = if let Some(reason) = error.cancel_reason {
                cancelled_tool_output(
                    reason,
                    &error.message,
                    &error.recommended_next_action,
                    error.detail,
                )
            } else {
                tool_failure_output(
                    &error.code,
                    &error.message,
                    &error.recommended_next_action,
                    error.detail,
                )
            };
            let status = if error.cancel_reason.is_some() {
                "cancelled"
            } else {
                "failed"
            };
            (
                status,
                attach_policy_decision_to_output(output, policy_decision),
            )
        }
    };
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_call_id,
            display_name,
            &tool_label(display_name, action),
            status,
            input,
            Some(output.clone()),
            started_at,
            if status == "running" {
                None
            } else {
                Some(now())
            },
        ),
        if status == "running" {
            "toolUpdated"
        } else {
            "toolFinished"
        },
    );
    output
}

fn native_reported_failure(raw: &Value) -> Option<(&'static str, String)> {
    if raw.get("stillRunning").and_then(Value::as_bool) == Some(true) {
        return None;
    }
    if raw.get("success").and_then(Value::as_bool) != Some(false)
        && raw.get("ok").and_then(Value::as_bool) != Some(false)
    {
        return None;
    }
    if raw.get("cancelledByTurn").and_then(Value::as_bool) == Some(true) {
        return Some((
            "cancelled",
            "The foreground command was stopped because the turn was cancelled.".to_string(),
        ));
    }
    if raw.get("timedOut").and_then(Value::as_bool) == Some(true) {
        return Some((
            "tool_timeout",
            "Native tool execution timed out.".to_string(),
        ));
    }
    if raw.get("processGroupTerminated").and_then(Value::as_bool) == Some(true) {
        return Some((
            "background_process_terminated",
            "The bounded command ended with background descendants still running, so Lyra terminated the process group.".to_string(),
        ));
    }
    if let Some(exit_code) = raw.get("exitCode").and_then(Value::as_i64) {
        return Some((
            "command_failed",
            format!("Command exited with status {exit_code}."),
        ));
    }
    Some((
        "tool_reported_failure",
        "Native tool reported an unsuccessful result.".to_string(),
    ))
}

pub(crate) fn native_tool_input(action: &str, arguments: Value) -> Value {
    let mut input = arguments.as_object().cloned().unwrap_or_default();
    // ponytail: or_insert instead of insert — tools like design_reference
    // accept `action` as a user parameter (list vs read on the same path).
    // The target mapping's action is only a default when the user omits it.
    input
        .entry("action".to_string())
        .or_insert(Value::String(action.to_string()));
    Value::Object(input)
}

fn outside_workspace_permission_input(
    session_id: &str,
    display_name: &str,
    action: &str,
    input: &Value,
) -> Option<Value> {
    for (raw_path, allow_missing_leaf) in
        filesystem_path_permission_candidates(display_name, action, input)
    {
        if path_qualifies_for_lyra_artifact_access(&raw_path).unwrap_or(false) {
            continue;
        }
        let Ok(Some((workspace_root, absolute))) =
            path_escapes_session_workspace(session_id, &raw_path, allow_missing_leaf)
        else {
            continue;
        };
        let mut permission_input = input.clone();
        if let Some(object) = permission_input.as_object_mut() {
            object.insert("permissionRequired".to_string(), Value::Bool(true));
            object.insert(
                "permissionRisk".to_string(),
                Value::String("workspace_escape".to_string()),
            );
            object.insert(
                "workspaceRoot".to_string(),
                Value::String(workspace_root.display().to_string()),
            );
            object.insert(
                "outsideWorkspacePath".to_string(),
                Value::String(absolute.display().to_string()),
            );
            if object.get("path").is_none() {
                object.insert(
                    "path".to_string(),
                    Value::String(absolute.display().to_string()),
                );
            }
        }
        return Some(permission_input);
    }
    None
}

fn native_permission_input_for_tool(
    session_id: &str,
    display_name: &str,
    action: &str,
    input: &Value,
) -> Option<Value> {
    if let Some(permission_input) =
        outside_workspace_permission_input(session_id, display_name, action, input)
    {
        return Some(permission_input);
    }
    if display_name == "file"
        && matches!(
            action,
            "write" | "edit" | "strict_edit" | "multiedit" | "apply_patch"
        )
    {
        let mut permission_input = input.clone();
        if let Some(object) = permission_input.as_object_mut() {
            object.insert("permissionRequired".to_string(), Value::Bool(true));
            object.insert(
                "permissionRisk".to_string(),
                Value::String("file".to_string()),
            );
        }
        return Some(permission_input);
    }
    if display_name == "shell" && action == "run" && shell_input_requires_permission(input) {
        let mut permission_input = input.clone();
        if let Some(object) = permission_input.as_object_mut() {
            object.insert("permissionRequired".to_string(), Value::Bool(true));
            object.insert(
                "permissionRisk".to_string(),
                Value::String("shell".to_string()),
            );
        }
        return Some(permission_input);
    }
    if display_name == "media"
        && matches!(
            action,
            "generate_image" | "generate_speech" | "transcribe_audio" | "generate_video"
        )
    {
        let mut permission_input = input.clone();
        if let Some(object) = permission_input.as_object_mut() {
            object.insert("permissionRequired".to_string(), Value::Bool(true));
            object.insert(
                "permissionRisk".to_string(),
                Value::String(
                    if action == "transcribe_audio" {
                        "media.upload"
                    } else {
                        "media.generation"
                    }
                    .to_string(),
                ),
            );
        }
        return Some(permission_input);
    }
    None
}

fn native_permission_policy_decision_for_tool(
    session_id: &str,
    display_name: &str,
    action: &str,
    input: &Value,
) -> Option<(String, PermissionPolicyDecision)> {
    native_permission_policy_decision_for_tool_with_evaluator(
        session_id,
        display_name,
        action,
        input,
        |display_name, action, risk, input| {
            evaluate_permission_policy_for_session(session_id, display_name, action, risk, input)
        },
    )
}

fn native_permission_policy_decision_for_tool_with_evaluator<F>(
    session_id: &str,
    display_name: &str,
    action: &str,
    input: &Value,
    evaluate: F,
) -> Option<(String, PermissionPolicyDecision)>
where
    F: Fn(&str, &str, Option<&str>, &Value) -> PermissionPolicyDecision,
{
    let Some(permission_input) =
        native_permission_input_for_tool(session_id, display_name, action, input)
    else {
        return None;
    };
    let Some(risk) = permission_risk(display_name, action, &permission_input) else {
        return None;
    };
    let decision = evaluate(display_name, action, Some(&risk), &permission_input);
    Some((risk, decision))
}

fn apply_native_permission_policy_auto_grant(
    input: &mut Value,
    decision: &Option<(String, PermissionPolicyDecision)>,
) {
    if matches!(decision, Some((_, PermissionPolicyDecision::Allow)))
        && let Some(object) = input.as_object_mut()
    {
        object.insert("permissionGranted".to_string(), Value::Bool(true));
    }
}

pub(crate) fn native_permission_request_for_tool(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    display_name: &str,
    action: &str,
    input: &Value,
) -> Option<PermissionRequest> {
    let permission_input =
        native_permission_input_for_tool(session_id, display_name, action, input)?;
    permission_request_for_tool(
        session_id,
        turn_id,
        tool_call_id,
        display_name,
        action,
        &permission_input,
    )
}

pub(crate) fn shell_input_requires_permission(input: &Value) -> bool {
    let Some(command) = input.get("command").and_then(Value::as_str) else {
        return false;
    };
    shell_command_requires_permission(command)
}

fn cancellation_for_turn(turn_id: &str) -> CancellationToken {
    super::super::session_runtime::cancellation_token(turn_id)
        .unwrap_or_else(|| CancellationToken::new())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancellation_for_turn_uses_session_runtime_token() {
        let turn_id = format!("turn-native-cancel-{}", Uuid::new_v4());
        let token = CancellationToken::new();
        crate::native_backend::session_runtime::register_turn_cancellation(&turn_id, token.clone());

        let observed = cancellation_for_turn(&turn_id);
        observed.cancel();
        crate::native_backend::session_runtime::clear_turn_cancellation(&turn_id);

        assert!(token.is_cancelled());
    }

    #[test]
    fn policy_allow_marks_high_risk_shell_as_permission_granted() {
        let mut input = json!({ "action": "run", "command": "rm file.txt" });
        let decision = native_permission_policy_decision_for_tool_with_evaluator(
            "session-policy-test",
            "shell",
            "run",
            &input,
            |display_name, action, risk, permission_input| {
                assert_eq!(display_name, "shell");
                assert_eq!(action, "run");
                assert_eq!(risk, Some("shell"));
                assert_eq!(permission_input["permissionRequired"], true);
                assert_eq!(permission_input["permissionRisk"], "shell");
                PermissionPolicyDecision::Allow
            },
        );

        apply_native_permission_policy_auto_grant(&mut input, &decision);

        assert_eq!(input["permissionGranted"], true);
    }

    #[test]
    fn media_tools_enter_the_native_permission_policy() {
        for (action, expected_risk) in [
            ("generate_image", "media.generation"),
            ("generate_speech", "media.generation"),
            ("transcribe_audio", "media.upload"),
            ("generate_video", "media.generation"),
        ] {
            let decision = native_permission_policy_decision_for_tool_with_evaluator(
                "session-media-policy-test",
                "media",
                action,
                &json!({ "path": "recording.mp3" }),
                |display_name, observed_action, risk, permission_input| {
                    assert_eq!(display_name, "media");
                    assert_eq!(observed_action, action);
                    assert_eq!(risk, Some(expected_risk));
                    assert_eq!(permission_input["permissionRequired"], true);
                    PermissionPolicyDecision::Ask
                },
            );
            assert_eq!(
                decision,
                Some((expected_risk.to_string(), PermissionPolicyDecision::Ask))
            );
        }
    }
}

#[allow(dead_code)]
pub(crate) fn run_native_tool(
    session_id: &str,
    turn_id: &str,
    tool_name: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let cancellation = cancellation_for_turn(turn_id);
    run_native_tool_sync(
        session_id,
        turn_id,
        tool_name,
        tool_call_id,
        input,
        None,
        &cancellation,
        ToolExecutionRuntime::default(),
    )
}

/// Async wrapper — sync tool functions run in spawn_blocking to avoid
/// stalling the async runtime on file I/O and process execution.
pub(crate) async fn run_native_tool_with_dispatcher(
    session_id: &str,
    turn_id: &str,
    tool_name: &str,
    tool_call_id: &str,
    input: &Value,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    runtime: ToolExecutionRuntime,
) -> NativeToolResult {
    let session_id = session_id.to_string();
    let turn_id = turn_id.to_string();
    let tool_name = tool_name.to_string();
    let tool_call_id = tool_call_id.to_string();
    let input = input.clone();
    let dispatcher = dispatcher.cloned();
    let cancellation = cancellation.clone();

    // Agent spawn runs an async child turn — cannot live inside spawn_blocking.
    if tool_name == AGENT_SPAWN_MODEL_TOOL || tool_name == "agent_spawn" {
        return super::super::tool_agent(&session_id, &turn_id, &tool_call_id, &input).await;
    }

    // shell_run runs on the tokio runtime so it can `.await` `child.wait()`
    // instead of polling with `try_wait()` + `thread::sleep`. Event-driven
    // wakeup on process exit (matches codex/opencode/zed).
    if tool_name == "shell_run" {
        return super::shell::tool_shell_run_async(
            &session_id,
            &turn_id,
            &tool_call_id,
            &input,
            &cancellation,
        )
        .await;
    }

    tokio::task::spawn_blocking(move || {
        run_native_tool_sync(
            &session_id,
            &turn_id,
            &tool_name,
            &tool_call_id,
            &input,
            dispatcher.as_ref(),
            &cancellation,
            runtime,
        )
    })
    .await
    .unwrap_or_else(|e| {
        Err(NativeToolFailure::new(
            "worker_panicked",
            format!("Native tool worker panicked: {e}"),
            "Retry the tool call.",
        ))
    })
}

fn run_native_tool_sync(
    session_id: &str,
    turn_id: &str,
    tool_name: &str,
    tool_call_id: &str,
    input: &Value,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    _runtime: ToolExecutionRuntime,
) -> NativeToolResult {
    match tool_name {
        "artifact_read" => tool_artifact_read(session_id, turn_id, tool_call_id, input),
        "file_read" => tool_file_read(session_id, turn_id, tool_call_id, input),
        "file_list" => tool_file_list(session_id, input),
        "file_glob" => tool_file_glob(session_id, input),
        "file_grep" => tool_file_grep(session_id, input),
        "file_write" => tool_file_write(session_id, turn_id, tool_call_id, input),
        "file_edit" => tool_file_edit(session_id, turn_id, tool_call_id, input),
        "file_strict_edit" => tool_file_strict_edit(session_id, turn_id, tool_call_id, input),
        "file_multiedit" => tool_file_multiedit(session_id, turn_id, tool_call_id, input),
        "apply_patch" => tool_apply_patch(session_id, turn_id, tool_call_id, input),
        "network_status" => tool_network_status(),
        "media_generate_image" => {
            tool_media_generate_image(session_id, turn_id, tool_call_id, input, dispatcher)
        }
        "media_generate_speech" => {
            tool_media_generate_speech(session_id, turn_id, tool_call_id, input, dispatcher)
        }
        "media_transcribe_audio" => {
            tool_media_transcribe_audio(session_id, turn_id, tool_call_id, input, dispatcher)
        }
        "media_generate_video" => tool_media_generate_video(
            session_id,
            turn_id,
            tool_call_id,
            input,
            dispatcher,
            cancellation,
        ),
        "web_search" => tool_web_search(input),
        "web_research" => tool_web_research(session_id, turn_id, input),
        "web_map" => tool_web_map(input),
        "web_batch" => tool_web_batch(
            session_id,
            turn_id,
            tool_call_id,
            input,
            dispatcher,
            cancellation,
        ),
        "web_fetch" => tool_web_fetch_with_browser_for_session(
            session_id,
            turn_id,
            tool_call_id,
            input,
            dispatcher,
        ),
        "todo_read" => tool_todo_read(session_id),
        "todo_write" => tool_todo_write(session_id, turn_id, input),
        "todo_update" => tool_todo_update(session_id, turn_id, input),
        "todo_finish" => tool_todo_finish(session_id, turn_id, input),
        "lsp_query" => tool_lsp_query(session_id, input),
        "design_reference" => tool_design_reference(session_id, input),
        "design_extract_reference" => {
            tool_design_extract_reference(turn_id, tool_call_id, input, dispatcher)
        }
        "design_quality" => {
            tool_design_quality(session_id, turn_id, tool_call_id, input, dispatcher)
        }
        _ => Err(NativeToolFailure::new(
            "tool_not_found",
            format!("Unknown Lyra native tool: {tool_name}"),
            "Call one of the tools listed in the current Lyra runtime context.",
        )),
    }
}
