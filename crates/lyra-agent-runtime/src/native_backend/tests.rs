use super::*;
use std::{
    io::{Read, Write},
    net::TcpListener,
};

/// Test-only sync bridge: wraps the async `execute_model_tool` so legacy
/// `#[test]` functions can call it without `.await`.
fn execute_model_tool_sync(
    session_id: &str,
    turn_id: &str,
    dispatcher: &Option<Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    call: ModelToolCall,
) -> Value {
    super::turn_engine::block_on(execute_model_tool(
        session_id,
        turn_id,
        dispatcher,
        cancellation,
        call,
    ))
}

fn provider_volatile_appendix(messages: &[Value]) -> &str {
    messages
        .iter()
        .find(|message| {
            message.get("lyraCacheBoundary").and_then(Value::as_str) == Some("turnTail")
        })
        .and_then(|message| message.get("content").and_then(Value::as_str))
        .expect("volatile appendix")
}

fn provider_latest_user_text(messages: &[Value]) -> &str {
    messages
        .iter()
        .rev()
        .find(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        .and_then(|message| message.get("content").and_then(Value::as_str))
        .expect("latest user")
}

/// Test-only sync bridge: wraps the async `execute_model_tool_with_runtime`.
fn execute_model_tool_with_runtime_sync(
    session_id: &str,
    turn_id: &str,
    dispatcher: &Option<Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    runtime: ToolExecutionRuntime,
    call: ModelToolCall,
) -> Value {
    super::turn_engine::block_on(execute_model_tool_with_runtime(
        session_id,
        turn_id,
        dispatcher,
        cancellation,
        runtime,
        call,
    ))
}

/// Test-only sync bridge: wraps the async `execute_software_capability_tool_adapter`.
fn execute_software_capability_tool_adapter_sync(
    session_id: &str,
    turn_id: &str,
    dispatcher: &Option<Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    software_id: &str,
    action_id: &str,
    arguments: Value,
    started_at: &str,
) -> Value {
    super::turn_engine::block_on(execute_software_capability_tool_adapter(
        session_id,
        turn_id,
        dispatcher,
        cancellation,
        tool_call_id,
        software_id,
        action_id,
        arguments,
        started_at,
    ))
}

/// Test-only sync bridge: wraps the async `execute_plan_tool_adapter`.
fn execute_plan_tool_adapter_sync(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    tool_call_id: &str,
    tool_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
) -> Value {
    super::turn_engine::block_on(execute_plan_tool_adapter(
        session_id,
        turn_id,
        cancellation,
        tool_call_id,
        tool_name,
        action,
        arguments,
        started_at,
    ))
}

fn read_http_request(stream: &mut std::net::TcpStream) -> (String, Value) {
    let mut headers = Vec::new();
    let mut byte = [0_u8; 1];
    while !headers.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).expect("read header byte");
        headers.push(byte[0]);
    }
    let header_text = String::from_utf8_lossy(&headers);
    let content_length = header_text
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .expect("content length");
    let mut body = vec![0_u8; content_length];
    stream.read_exact(&mut body).expect("read request body");
    (
        header_text.into_owned(),
        serde_json::from_slice(&body).expect("json request body"),
    )
}

fn read_http_json_body(stream: &mut std::net::TcpStream) -> Value {
    read_http_request(stream).1
}

fn model_tool_names(request: &Value) -> Vec<String> {
    request["tools"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            tool.pointer("/function/name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
}

fn expected_provider_tool_names() -> Vec<String> {
    vec![
        LYRA_CLARIFICATION_ASK_TOOL.to_string(),
        PLAN_BEGIN_MODEL_TOOL.to_string(),
        PLAN_WRITE_MODEL_TOOL.to_string(),
        PLAN_FINALIZE_MODEL_TOOL.to_string(),
        PLAN_REVISE_MODEL_TOOL.to_string(),
        TODO_WRITE_MODEL_TOOL.to_string(),
        TODO_UPDATE_MODEL_TOOL.to_string(),
        TODO_FINISH_MODEL_TOOL.to_string(),
        AGENT_SPAWN_MODEL_TOOL.to_string(),
        READ_FILE_MODEL_TOOL.to_string(),
        GLOB_MODEL_TOOL.to_string(),
        GREP_MODEL_TOOL.to_string(),
        EXEC_COMMAND_MODEL_TOOL.to_string(),
        WRITE_STDIN_MODEL_TOOL.to_string(),
        EDIT_FILE_MODEL_TOOL.to_string(),
        WRITE_FILE_MODEL_TOOL.to_string(),
        "web_search".to_string(),
        "web_fetch".to_string(),
        "design_reference".to_string(),
        "design_extract_reference".to_string(),
        "design_quality".to_string(),
        "browser_navigate".to_string(),
        "browser_read".to_string(),
        "browser_map".to_string(),
        TOOL_SEARCH_TOOL_NAME.to_string(),
        LYRA_SESSION_READ_MESSAGE_TOOL.to_string(),
    ]
}

fn start_test_runtime_turn(session_id: &str) -> String {
    let turn_id = format!("turn-test-{}", Uuid::new_v4());
    let cancellation = CancellationToken::new();
    let mut state = state().lock().expect("state lock");
    let session = state.sessions.get_mut(session_id).expect("session");
    session.snapshot["turnStatus"] = Value::String("running".to_string());
    session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
    session.snapshot["follow"] = json!({ "running": true, "activity": "test" });
    session.runtime_turns.push(runtime_turn(
        &turn_id,
        session_id,
        "calling_model",
        None,
        None,
    ));
    drop(state);
    session_runtime::register_active_turn(session_id, &turn_id, cancellation);
    turn_id
}

fn bind_test_user_message(session_id: &str, turn_id: &str) -> String {
    let message = user_message("Test operation".to_string(), Vec::new(), now());
    let message_id = message["id"].as_str().expect("message id").to_string();
    let mut state = state().lock().expect("state lock");
    let session = state.sessions.get_mut(session_id).expect("session");
    session.snapshot["messages"]
        .as_array_mut()
        .expect("messages")
        .push(message);
    session
        .runtime_turns
        .iter_mut()
        .find(|turn| turn.get("runtimeTurnId").and_then(Value::as_str) == Some(turn_id))
        .expect("runtime turn")["userMessageId"] = Value::String(message_id.clone());
    message_id
}

fn start_test_runtime_turn_with_contract(
    session_id: &str,
    _action: &str,
    _surfaces: &[&str],
) -> String {
    // ponytail: Task Contract removed — this helper now just starts a turn
    // without binding a contract. Kept for call-site compatibility.
    let turn_id = start_test_runtime_turn(session_id);
    let _message_id = bind_test_user_message(session_id, &turn_id);
    turn_id
}

fn record_test_investigation(session_id: &str, turn_id: &str, tool_id: &str) {
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            tool_id,
            "read_file",
            "Read project source",
            "completed",
            json!({ "path": "Cargo.toml", "turnId": turn_id }),
            Some(json!({
                "content": "workspace manifest inspected",
                "raw": { "bytes": 128 }
            })),
            &now(),
            Some(now()),
        ),
        "toolFinished",
    );
}

/// Runs `body` with a tool-capable default model configured, then restores the
/// previous config. The default free model intentionally does not advertise
/// tool calling, so tests that need the full provider tool surface opt in.
fn with_tool_capable_default_model<T>(body: impl FnOnce() -> T) -> T {
    let mut locked = state().lock().expect("state lock");
    let original_config = locked.config.clone();
    let provider_id = format!("test-local-{}", Uuid::new_v4());
    let model_id = format!("test-model-{}", Uuid::new_v4());
    locked.config.default_provider = Some(provider_id.clone());
    locked.config.default_model = Some(model_id.clone());
    locked.config.providers.insert(
        provider_id.clone(),
        NativeProviderProfile {
            id: provider_id.clone(),
            label: "Test Tool Capable".to_string(),
            route_id: providers::routes::local_openai_compatible::ROUTE_ID.to_string(),
            base_url: Some("http://127.0.0.1:8765/v1".to_string()),
            default_model: Some(model_id.clone()),
            api_key_ref: None,
            api_key: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: vec![NativeProviderModel {
                id: model_id.clone(),
                label: Some("Test Tool Capable Model".to_string()),
                context_window: Some(128_000),
                supports_image_input: false,
                supports_tool_calling: true,
                supports_streaming: true,
                supports_reasoning_effort: None,
                reasoning_replay_field: ReasoningReplayField::Auto,
                requires_reasoning_field_on_assistant_messages: None,
                supports_tool_choice: None,
                enabled: true,
                api_npm: None,
            }],
        },
    );
    locked.save_state().expect("save test config");
    drop(locked);
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(body));
    let mut locked = state().lock().expect("state lock");
    locked.config = original_config;
    locked.save_state().expect("restore test config");
    drop(locked);
    match result {
        Ok(value) => value,
        Err(payload) => std::panic::resume_unwind(payload),
    }
}

fn execute_internal_tool_fs_sync(
    session_id: &str,
    turn_id: &str,
    dispatcher: &Option<Arc<HostCapabilityDispatcher>>,
    cancellation: &CancellationToken,
    call: ModelToolCall,
) -> Value {
    super::turn_engine::block_on(tools::tool_fs::execute_tool_fs_model_tool(
        session_id,
        turn_id,
        dispatcher,
        cancellation,
        ToolExecutionRuntime::default(),
        call,
        &now(),
    ))
}

fn tool_fs_run_call(id: &str, path: &str, args: Value) -> ModelToolCall {
    ModelToolCall {
        id: id.to_string(),
        name: deferred_name_for_path(path),
        arguments: args,
    }
}

fn tool_fs_run_call_with_permission_mode(
    id: &str,
    path: &str,
    args: Value,
    permission_mode: &str,
) -> ModelToolCall {
    let mut arguments = args;
    if let Some(object) = arguments.as_object_mut() {
        object.insert(
            "permissionMode".to_string(),
            Value::String(permission_mode.to_string()),
        );
    }
    ModelToolCall {
        id: id.to_string(),
        name: deferred_name_for_path(path),
        arguments,
    }
}

fn deferred_name_for_path(path: &str) -> String {
    tool_fs::runtime_registry()
        .lookup_path(path)
        .map(lyra_tool_fs_core::deferred_tool_name)
        .unwrap_or_else(|| {
            if let Some(rest) = path.strip_prefix("/tools/software/capability/") {
                let mut parts = rest.splitn(2, '/');
                if let (Some(software_id), Some(action_id)) = (parts.next(), parts.next()) {
                    return format!(
                        "software__{}__{}",
                        software_id.replace(['/', ' '], "_"),
                        action_id.replace(['/', ' '], "_")
                    );
                }
            }
            path.trim_start_matches("/tools/").replace('/', "_")
        })
}

fn wait_for_pending_permission(session_id: &str) -> String {
    for _ in 0..200 {
        if let Some(id) = state().lock().ok().and_then(|state| {
            state
                .pending_permissions
                .values()
                .find(|request| request.session_id == session_id && request.allowed.is_none())
                .map(|request| request.id.clone())
        }) {
            return id;
        }
        thread::sleep(Duration::from_millis(10));
    }
    let debug = state().lock().ok().map(|s| {
        s.sessions.get(session_id).map(|session| {
            json!({
                "pending": s.pending_permissions.len(),
                "turnStatus": session.snapshot.get("turnStatus").cloned(),
                "events": session.snapshot.get("events").cloned().map(|e| e.to_string()).map(|s| s.chars().rev().take(1500).collect::<String>().chars().rev().collect::<String>()),
            })
        })
    });
    panic!("pending permission not observed: {debug:?}")
}

fn wait_for_pending_clarification(session_id: &str) -> String {
    for _ in 0..200 {
        if let Some(id) = state().lock().ok().and_then(|state| {
            state
                .pending_clarifications
                .values()
                .find(|request| request.session_id == session_id && request.answer.is_none())
                .map(|request| request.id.clone())
        }) {
            return id;
        }
        thread::sleep(Duration::from_millis(10));
    }
    panic!("pending clarification not observed")
}

fn serve_http_once(status_line: &str, content_type: &str, body: &str) -> String {
    serve_http_bytes_once(status_line, content_type, body.as_bytes())
}

fn serve_http_bytes_once(status_line: &str, content_type: &str, body: &[u8]) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local test server");
    let address = listener.local_addr().expect("local address");
    let status_line = status_line.to_string();
    let content_type = content_type.to_string();
    let body = body.to_vec();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept local request");
        let mut buffer = [0_u8; 1024];
        let _ = stream.read(&mut buffer);
        let response = format!(
            "{status_line}\r\ncontent-type: {content_type}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
            body.len()
        );
        stream
            .write_all(response.as_bytes())
            .expect("write local response");
        stream.write_all(&body).expect("write local response body");
    });
    format!("http://{address}/index.html")
}

fn serve_http_redirect_once(location: &str) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local redirect server");
    let address = listener.local_addr().expect("local address");
    let location = location.to_string();
    thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept local redirect request");
        let mut buffer = [0_u8; 1024];
        let _ = stream.read(&mut buffer);
        let response = format!(
            "HTTP/1.1 302 Found\r\nlocation: {location}\r\ncontent-length: 0\r\nconnection: close\r\n\r\n"
        );
        stream
            .write_all(response.as_bytes())
            .expect("write local redirect response");
    });
    format!("http://{address}/redirect")
}

fn build_simple_pdf(text: &str) -> Vec<u8> {
    let stream = format!("BT /F1 24 Tf 72 720 Td ({}) Tj ET", text);
    let objects = vec![
        "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n".to_string(),
        "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n".to_string(),
        "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>\nendobj\n".to_string(),
        format!(
            "4 0 obj\n<< /Length {} >>\nstream\n{}\nendstream\nendobj\n",
            stream.len(),
            stream
        ),
        "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n".to_string(),
    ];
    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = vec![0usize];
    for object in &objects {
        offsets.push(pdf.len());
        pdf.push_str(object);
    }
    let xref_offset = pdf.len();
    pdf.push_str("xref\n0 6\n");
    pdf.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{:010} 00000 n \n", offset));
    }
    pdf.push_str("trailer\n<< /Root 1 0 R /Size 6 >>\n");
    pdf.push_str(&format!("startxref\n{}\n%%EOF\n", xref_offset));
    pdf.into_bytes()
}

mod foundation;
mod memory;
mod memory_compress;
mod phase2_memory;
mod phase3_memory;
mod phase4_memory;
mod phase5_memory;
mod phase6_memory;
mod phase7_memory;
mod provider_loop;
mod provider_recovery;
mod subagent;
mod terminal_tools;
mod trim;
mod watchdog;
