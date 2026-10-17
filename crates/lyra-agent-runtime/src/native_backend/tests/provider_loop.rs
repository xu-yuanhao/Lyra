use super::*;
use crate::native_backend::providers::protocol::openai_chat_completions;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc;

fn read_http_headers_only(stream: &mut std::net::TcpStream) -> String {
    let mut headers = Vec::new();
    let mut byte = [0_u8; 1];
    while !headers.ends_with(b"\r\n\r\n") {
        stream.read_exact(&mut byte).expect("read header byte");
        headers.push(byte[0]);
    }
    let headers = String::from_utf8_lossy(&headers).to_ascii_lowercase();
    // Windows sends RST when a socket closes with unread incoming data, which
    // discards the response bytes the client is about to read. Drain the body
    // so the mock's reply survives the close.
    if let Some(length) = headers.lines().find_map(|line| {
        let (name, value) = line.split_once(':')?;
        name.trim()
            .eq_ignore_ascii_case("content-length")
            .then(|| value.trim().parse::<usize>().ok())
            .flatten()
    }) {
        let mut body = vec![0_u8; length];
        let _ = stream.read_exact(&mut body);
    }
    headers
}

fn wait_for_progress_guard_clarification(session_id: &str) -> String {
    for _ in 0..12_000 {
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
    panic!("pending progress guard clarification not observed")
}

fn test_message_text(message: &Value) -> String {
    match message.get("content") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Array(parts)) => parts
            .iter()
            .filter_map(|part| {
                part.get("text")
                    .and_then(Value::as_str)
                    .or_else(|| part.get("content").and_then(Value::as_str))
            })
            .collect::<Vec<_>>()
            .join(""),
        Some(value) => value.to_string(),
        None => String::new(),
    }
}

#[test]
fn provider_tool_results_expose_the_exact_evidence_activity_id() {
    let (success, _) = provider_visible_tool_result_content(
        &json!({ "content": "read source", "raw": { "ok": true } }),
        "call-success",
        24_000,
    );
    assert!(success.ends_with("Evidence activity ID: call-success"));

    let (failure, _) = provider_visible_tool_result_content(
        &json!({
            "content": "read failed",
            "error": { "code": "read_failed", "message": "missing" }
        }),
        "call-failed",
        24_000,
    );
    assert!(failure.ends_with(&format!("{FAILED_TOOL_ACTIVITY_LABEL}: call-failed")));
}

#[test]
fn streaming_parser_emits_delta_and_collects_tool_call() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({ "title": "Stream Test" }))
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = format!("turn-{}", Uuid::new_v4());
    let cancellation = CancellationToken::new();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["turnStatus"] = Value::String("running".to_string());
        session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
        session.runtime_turns.push(runtime_turn(
            &turn_id,
            &session_id,
            "streaming_model",
            None,
            None,
        ));
    }
    session_runtime::register_active_turn(&session_id, &turn_id, cancellation.clone());

    let stream = concat!(
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"/tools/workbench/list_tabs\\\",\\\"args\\\":{\\\"scope\\\":\\\"all\\\"}}\"}}]}}]}\n\n",
        "data: [DONE]\n\n",
    );
    let reply = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &model_tools(),
    )
    .expect("streaming reply");

    assert_eq!(reply.content.as_deref(), Some("Hello"));
    assert_eq!(reply.tool_calls[0].id, "call-1");
    assert_eq!(reply.tool_calls[0].name, "read_file");
    assert_eq!(
        reply.tool_calls[0].arguments["path"],
        "/tools/workbench/list_tabs"
    );
    assert_eq!(reply.tool_calls[0].arguments["args"]["scope"], "all");
    assert!(reply.ui_message_id.is_some());
    let session_events = events
        .lock()
        .expect("events lock")
        .iter()
        .filter(|event| event.get("sessionId").and_then(Value::as_str) == Some(&session_id))
        .cloned()
        .collect::<Vec<_>>();
    let event_kinds = session_events
        .iter()
        .map(|event| event["kind"].as_str().unwrap_or_default().to_string())
        .collect::<Vec<_>>();
    assert_eq!(
        event_kinds,
        [
            "messageCommitted",
            "messageDelta",
            "messageDelta",
            "messageCommitted"
        ]
    );
    let delta_events = session_events
        .iter()
        .filter(|event| event["kind"].as_str() == Some("messageDelta"))
        .collect::<Vec<_>>();
    assert_eq!(delta_events.len(), 2);
    assert_eq!(delta_events[0]["delta"].as_str(), Some("Hel"));
    assert_eq!(delta_events[1]["delta"].as_str(), Some("lo"));
    assert!(
        delta_events
            .iter()
            .all(|event| event.get("renderDocument").is_none())
    );
    assert!(
        delta_events
            .iter()
            .all(|event| event.get("renderRevision").is_none())
    );
    let final_commit = session_events
        .iter()
        .rev()
        .find(|event| event["kind"].as_str() == Some("messageCommitted"))
        .expect("final message commit");
    assert_eq!(final_commit["message"]["text"], "Hello");
    assert!(final_commit["message"].get("renderDocument").is_none());
    assert!(final_commit["message"].get("renderRevision").is_none());
    backend.clear_event_callback();
}

#[test]
fn streaming_parser_forwards_single_character_deltas_without_waiting_for_another_chunk() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Stream Batch Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));

    let expected = "x".repeat(300);
    let mut stream = String::new();
    for _ in 0..300 {
        stream.push_str("data: ");
        stream.push_str(&json!({ "choices": [{ "delta": { "content": "x" } }] }).to_string());
        stream.push_str("\n\n");
    }
    stream.push_str("data: [DONE]\n\n");

    let reply = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &model_tools(),
    )
    .expect("streaming reply");

    assert_eq!(reply.content.as_deref(), Some(expected.as_str()));
    let session_events = events
        .lock()
        .expect("events lock")
        .iter()
        .filter(|event| event.get("sessionId").and_then(Value::as_str) == Some(&session_id))
        .cloned()
        .collect::<Vec<_>>();
    let delta_events = session_events
        .iter()
        .filter(|event| event["kind"].as_str() == Some("messageDelta"))
        .collect::<Vec<_>>();
    let streamed_text = delta_events
        .iter()
        .filter_map(|event| event["delta"].as_str())
        .collect::<Vec<_>>()
        .join("");
    assert_eq!(streamed_text, expected);
    assert_eq!(
        delta_events.len(),
        300,
        "frame batching belongs to the renderer"
    );
    backend.clear_event_callback();
}

#[test]
fn streaming_parser_preserves_markdown_whitespace_in_committed_message() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Stream Markdown Whitespace Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = format!("turn-{}", Uuid::new_v4());
    let cancellation = CancellationToken::new();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["turnStatus"] = Value::String("running".to_string());
        session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
        session.runtime_turns.push(runtime_turn(
            &turn_id,
            &session_id,
            "streaming_model",
            None,
            None,
        ));
    }
    session_runtime::register_active_turn(&session_id, &turn_id, cancellation.clone());

    let chunks = [
        "### ",
        "1. 标题与列表\n\n",
        "```python\n",
        "    return value\n",
        "```\n\n",
        "### 流程图\n\n",
        "```mermaid\n",
        "graph TD\nA --> B\n",
        "```\n",
    ];
    let expected = chunks.concat();
    let expected_committed = expected.trim_end_matches('\n');
    let mut stream = String::new();
    for chunk in chunks {
        stream.push_str("data: ");
        stream.push_str(&json!({ "choices": [{ "delta": { "content": chunk } }] }).to_string());
        stream.push_str("\n\n");
    }
    stream.push_str("data: [DONE]\n\n");

    let reply = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &model_tools(),
    )
    .expect("streaming reply");

    assert_eq!(reply.content.as_deref(), Some(expected_committed));
    let session_events = events
        .lock()
        .expect("events lock")
        .iter()
        .filter(|event| event.get("sessionId").and_then(Value::as_str) == Some(&session_id))
        .cloned()
        .collect::<Vec<_>>();
    let final_commit = session_events
        .iter()
        .rev()
        .find(|event| event["kind"].as_str() == Some("messageCommitted"))
        .expect("final message commit");
    assert_eq!(
        final_commit["message"]["text"].as_str(),
        Some(expected.as_str())
    );
    assert_eq!(
        final_commit["message"]["blocks"][0]["text"].as_str(),
        Some(expected.as_str())
    );
    backend.clear_event_callback();
}

#[test]
fn streaming_parser_commits_final_answer_once_without_tool_calls() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Stream Final Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = format!("turn-{}", Uuid::new_v4());
    let cancellation = CancellationToken::new();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["turnStatus"] = Value::String("running".to_string());
        session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
        session.runtime_turns.push(runtime_turn(
            &turn_id,
            &session_id,
            "streaming_model",
            None,
            None,
        ));
    }
    session_runtime::register_active_turn(&session_id, &turn_id, cancellation.clone());

    let stream = concat!(
        "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
        "data: [DONE]\n\n",
    );
    let reply = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &model_tools(),
    )
    .expect("streaming reply");

    assert_eq!(reply.content.as_deref(), Some("Hello"));
    assert!(reply.tool_calls.is_empty());
    assert!(reply.ui_message_id.is_some());
    let session_events = events
        .lock()
        .expect("events lock")
        .iter()
        .filter(|event| event.get("sessionId").and_then(Value::as_str) == Some(&session_id))
        .cloned()
        .collect::<Vec<_>>();
    let event_kinds = session_events
        .iter()
        .map(|event| event["kind"].as_str().unwrap_or_default().to_string())
        .collect::<Vec<_>>();
    assert_eq!(
        event_kinds,
        [
            "messageCommitted",
            "messageDelta",
            "messageDelta",
            "messageCommitted"
        ]
    );
    let delta_events = session_events
        .iter()
        .filter(|event| event["kind"].as_str() == Some("messageDelta"))
        .collect::<Vec<_>>();
    assert_eq!(delta_events.len(), 2);
    assert_eq!(delta_events[0]["delta"].as_str(), Some("Hel"));
    assert_eq!(delta_events[1]["delta"].as_str(), Some("lo"));
    assert!(
        delta_events
            .iter()
            .all(|event| event.get("renderDocument").is_none())
    );
    assert!(
        delta_events
            .iter()
            .all(|event| event.get("renderRevision").is_none())
    );
    let final_commits = session_events
        .iter()
        .filter(|event| {
            event["kind"].as_str() == Some("messageCommitted")
                && event["message"]["text"].as_str() == Some("Hello")
        })
        .collect::<Vec<_>>();
    assert_eq!(final_commits.len(), 1);
    assert_eq!(final_commits[0]["message"]["text"], "Hello");
    assert!(final_commits[0]["message"].get("renderDocument").is_none());
    assert!(final_commits[0]["message"].get("renderRevision").is_none());
    backend.clear_event_callback();
}

#[test]
fn direct_apply_patch_writes_large_generated_file() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Direct Apply Patch Test",
                "workingDir": temp.path().display().to_string()
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    // The permission request/response protocol under test requires an
    // explicit ask-for-file-writes policy; session-scoped so parallel tests
    // keep the default allow semantics.
    crate::native_backend::permission_policy::pin_ask_for_file_policy_for_session(&session_id);
    let turn_id = start_test_runtime_turn(&session_id);
    record_test_investigation(&session_id, &turn_id, "investigate-direct-apply-patch");
    let cancellation = CancellationToken::new();
    let large_html = format!(
        "<!doctype html>\n<html><body>{}</body></html>\n",
        "x".repeat(12_001)
    );
    let patch_body = large_html
        .lines()
        .map(|line| format!("+{line}"))
        .collect::<Vec<_>>()
        .join("\n");
    let patch = format!("*** Begin Patch\n*** Add File: index.html\n{patch_body}\n*** End Patch\n");

    let exec_session_id = session_id.clone();
    let exec_turn_id = turn_id.clone();
    let handle = thread::spawn(move || {
        execute_model_tool_sync(
            &exec_session_id,
            &exec_turn_id,
            &None,
            &cancellation,
            ModelToolCall {
                id: "tool-direct-apply-patch".to_string(),
                name: "apply_patch".to_string(),
                arguments: json!({ "patch": patch }),
            },
        )
    });
    let permission_id = wait_for_pending_permission(&session_id);
    backend
        .call_agent_method(
            "agent.permission.respond",
            json!({ "sessionId": session_id, "permissionId": permission_id, "allowed": true }),
        )
        .expect("allow apply_patch permission");
    let output = handle.join().expect("join apply_patch execution");

    assert_eq!(output["activityKind"], "edit");
    assert_eq!(output["raw"]["changedFiles"][0]["path"], "index.html");
    assert_eq!(
        fs::read_to_string(temp.path().join("index.html")).expect("read written html"),
        large_html
    );
}

#[test]
fn structured_tool_call_is_ignored_when_no_tools_are_advertised() {
    let parsed = openai_chat_completions::parse_tool_call(
        &json!({
            "id": "call-1",
            "function": {
                "name": "read_file",
                "arguments": "{\"path\":\"/tools/workbench/list_tabs\",\"args\":{}}"
            }
        }),
        &HashSet::new(),
        0,
    );

    assert!(parsed.is_none());
}

#[test]
fn streaming_textual_tool_call_is_rejected() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Stream Guard Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));
    let stream = concat!(
        "data: {\"choices\":[{\"delta\":{\"content\":\"好的，我来打开。\\n\\n\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"[Tool call: software_invoke_capability({\\\"softwareId\\\":\\\"browser-search\\\",\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"\\\"capabilityId\\\":\\\"browser-search.openUrl\\\",\\\"input\\\":{\\\"url\\\":\\\"https://vimeo.com/1148303712\\\"}})]\"}}]}\n\n",
        "data: [DONE]\n\n",
    );

    let error = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &model_tools(),
    )
    .expect_err("streaming textual tool call must be rejected");

    assert!(error.to_string().contains("textual tool"));
    let emitted_text = events
        .lock()
        .expect("events lock")
        .iter()
        .filter_map(|event| event.get("delta").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("");
    assert!(!emitted_text.contains("[Tool call:"));
    backend.clear_event_callback();
}

#[test]
fn streaming_parser_handles_usage_only_chunk_and_repairs_tool_call() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Provider Conformance Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let tools = model_tools();
    let stream = concat!(
        "data: {\"choices\":[],\"usage\":{\"prompt_tokens\":1,\"completion_tokens\":0}}\n\n",
        "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"null\",\"function\":{\"name\":\"READ_FILE\",\"arguments\":\"{\\\"path\\\":\\\"/tools/workbench/list_tabs\\\",\\\"args\\\":{}}\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\n",
        "data: [DONE]\n\n",
    );

    let reply = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &tools,
    )
    .expect("streaming reply");

    assert_eq!(reply.content, None);
    assert_eq!(reply.tool_calls.len(), 1);
    assert_eq!(reply.tool_calls[0].name, "read_file");
    assert_eq!(reply.tool_calls[0].id, "call-0");
    assert_eq!(
        reply.tool_calls[0].arguments,
        json!({ "path": "/tools/workbench/list_tabs", "args": {} })
    );
}

#[test]
fn streaming_parser_preserves_reasoning_only_reply_for_loop_recovery() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Reasoning Only Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let stream = concat!(
        "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"I should answer.\"}}]}\n\n",
        "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
        "data: [DONE]\n\n",
    );

    let reply = parse_streaming_response(
        BufReader::new(stream.as_bytes()),
        &session_id,
        &turn_id,
        &cancellation,
        &[],
    )
    .expect("reasoning-only reply reaches the loop");

    assert!(reply.content.is_none());
    assert_eq!(reply.reasoning_content.as_deref(), Some("I should answer."));
    assert!(reply.tool_calls.is_empty());
    assert_eq!(reply.raw_stop_reason.as_deref(), Some("stop"));
    assert_eq!(
        reply.provider_replay_protocol.as_deref(),
        Some("openai_chat_completions")
    );
    assert_eq!(
        reply.provider_replay_items,
        vec![json!({
            "field": "reasoning_content",
            "value": "I should answer.",
        })]
    );
}

#[test]
fn streaming_parser_classifies_missing_terminal_event_as_transport_interruption() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Missing SSE Terminal Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let mut committed_any = false;
    let error = parse_streaming_response_with_commit(
        BufReader::new(
            b"data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"still thinking\"}}]}\n\ndata: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n"
                .as_slice(),
        ),
        &session_id,
        &turn_id,
        &CancellationToken::new(),
        &[],
        false,
        &mut committed_any,
    )
    .expect_err("stream without DONE must be incomplete even after finish_reason");

    assert!(matches!(
        error,
        AgentRuntimeError::ProviderTransport {
            kind: crate::ProviderTransportKind::StreamInterrupted,
            ..
        }
    ));
    assert!(
        committed_any,
        "visible reasoning must prohibit replay of the original request"
    );
}

#[test]
fn model_loop_retries_reasoning_only_once_without_non_streaming_or_history_pollution() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Reasoning Recovery Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let request_bodies = Arc::new(Mutex::new(Vec::<Value>::new()));
    let request_bodies_for_server = request_bodies.clone();
    let server = thread::spawn(move || {
        for attempt in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept provider request");
            request_bodies_for_server
                .lock()
                .expect("request bodies")
                .push(read_http_json_body(&mut stream));
            let body = if attempt == 0 {
                concat!(
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"I should answer.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":7,\"completion_tokens_details\":{\"reasoning_tokens\":7}}}\n\n",
                    "data: [DONE]\n\n",
                )
            } else {
                concat!(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Recovered final answer.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":14,\"completion_tokens\":4}}\n\n",
                    "data: [DONE]\n\n",
                )
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write provider response");
        }
    });
    let provider = NativeProviderProfile {
        id: "opencode-free".to_string(),
        label: "OpenCode Free".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("deepseek-v4-flash-free".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "deepseek-v4-flash-free".to_string(),
            label: None,
            context_window: Some(32_000),
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
    };
    let result = run_model_loop(
        &session_id,
        &turn_id,
        ModelRequest {
            capabilities: model_capabilities(&provider, "deepseek-v4-flash-free"),
            provider,
            model: "deepseek-v4-flash-free".to_string(),
            messages: vec![json!({ "role": "user", "content": "hello" })],
            tools: Vec::new(),
            tool_choice: ModelToolChoice::Auto,
            host_dispatcher: None,
            input_downgrades: Vec::new(),
            evidence_refs: Vec::new(),
            token_estimate: 1,
            context_trimmed: false,
        },
        &CancellationToken::new(),
    )
    .expect("reasoning-only recovery");
    server.join().expect("server join");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Recovered final answer.")
    );
    let bodies = request_bodies.lock().expect("request bodies");
    assert_eq!(bodies.len(), 2);
    assert!(bodies.iter().all(|body| body["stream"] == true));
    let second = serde_json::to_string(&bodies[1]).expect("serialize second request");
    assert!(second.contains("Finish the current response now"));
    assert!(!second.contains("I should answer."));
    drop(bodies);

    let metadata = session_runtime::take_turn_provider_metadata(&session_id, &turn_id)
        .expect("provider attempt metadata");
    let attempts = metadata["providerAttempts"]
        .as_array()
        .expect("provider attempts");
    assert_eq!(attempts.len(), 2);
    assert_eq!(attempts[0]["outcome"], "reasoning_only");
    assert_eq!(
        attempts[0]["recoveryAction"],
        "provider_reasoning_only_retry"
    );
    assert_eq!(attempts[1]["outcome"], "visible_final");
    assert_eq!(attempts[0]["usage"]["reasoning"], 7);
    for attempt in attempts {
        let total = attempt["latencyMs"].as_u64().expect("total duration");
        let queued = attempt["schedulerWaitMs"].as_u64().expect("queue duration");
        let request = attempt["requestDurationMs"]
            .as_u64()
            .expect("request duration");
        assert!(queued + request <= total && total - queued - request <= 1);
    }
}

#[test]
fn provider_transport_errors_are_not_api_key_or_retryable_errors() {
    let transport = AgentRuntimeError::ProviderTransport {
        kind: crate::ProviderTransportKind::Other,
        detail: "request or response body error".to_string(),
    };
    assert!(is_provider_transport_error(&transport));
    assert!(!is_retryable_provider_error(&transport));
    assert!(!is_provider_configuration_error(&transport));

    let sending = AgentRuntimeError::ProviderTransport {
        kind: crate::ProviderTransportKind::Connect,
        detail: "error sending request for url (https://example.test/v1/chat/completions)"
            .to_string(),
    };
    assert!(is_provider_transport_error(&sending));
    assert!(!is_retryable_provider_error(&sending));

    let auth = AgentRuntimeError::ProviderFailure {
        failure: crate::ProviderFailure {
            provider_id: "test".to_string(),
            route_id: "test".to_string(),
            http_status: Some(401),
            provider_code: None,
            provider_type: None,
            retry_after_ms: None,
            category: crate::ProviderFailureCategory::Authentication,
            message: String::new(),
            body_preview: None,
        },
    };
    assert!(is_provider_configuration_error(&auth));
    assert!(!is_provider_transport_error(&auth));
}

#[test]
fn streamed_body_decode_failure_is_classified_as_transport_not_retryable() {
    // Regression: a mid-stream SSE read that fails (reqwest's "error decoding
    // response body" family) used to flatten into a `Core(String)` and leak to the
    // user as the assistant reply. It is now captured at the IO boundary as a typed
    // `ProviderTransport { StreamInterrupted }`, classified by variant — not by
    // matching message text — as transport, non-retryable, and non-config.
    let interrupted = AgentRuntimeError::ProviderTransport {
        kind: crate::ProviderTransportKind::StreamInterrupted,
        detail: "provider streaming response body read failed: error decoding response body"
            .to_string(),
    };
    assert!(is_provider_transport_error(&interrupted));
    assert!(!is_retryable_provider_error(&interrupted));
    assert!(!is_provider_configuration_error(&interrupted));
}

#[test]
fn macos_proxy_parser_reports_system_proxy_without_secret_values() {
    let status = parse_macos_scutil_proxy(
        r#"<dictionary> {
  HTTPEnable : 1
  HTTPPort : 10808
  HTTPProxy : 127.0.0.1
  HTTPSEnable : 1
  HTTPSPort : 10808
  HTTPSProxy : 127.0.0.1
  SOCKSEnable : 0
}"#,
    );
    assert_eq!(status["source"], "macos-scutil");
    assert_eq!(status["active"], true);
    assert_eq!(status["http"]["host"], "127.0.0.1");
    assert_eq!(status["https"]["port"], 10808);
}

#[test]
fn streaming_transport_error_does_not_replay_as_non_streaming() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Provider Transport Fallback Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    record_tool_activity(
        &session_id,
        &turn_id,
        tool_activity(
            "tool-provider-plan-investigation",
            "read_file",
            "Read project source",
            "completed",
            json!({ "path": "package.json" }),
            Some(json!({ "content": "project metadata inspected" })),
            &now(),
            Some(now()),
        ),
        "toolFinished",
    );
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener
            .accept()
            .expect("accept streaming provider request");
        let _ = read_http_json_body(&mut stream);
        // The delta must exceed the 96-byte frame batcher window so the
        // increment is committed to the transcript before the connection
        // truncates — only a committed partial forbids the non-streaming
        // fallback (a tiny fragment stays uncommitted and replays safely).
        let content = "committed partial delta ".repeat(10);
        let body =
            format!("data: {{\"choices\":[{{\"delta\":{{\"content\":\"{content}\"}}}}]}}\n\n");
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len() + 4096,
            body
        )
        .expect("write truncated stream");
        drop(stream);
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let error = call_model_once(
        &session_id,
        &turn_id,
        &provider,
        "test-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
        &model_capabilities(&provider, "test-model"),
        &CancellationToken::new(),
    )
    .expect_err("truncated SSE stream should not be replayed as non-streaming");
    let message = error.to_string();

    assert!(
        message.contains("provider streaming transport failed"),
        "{message}"
    );
    assert!(
        message.contains("non-streaming fallback was not attempted"),
        "{message}"
    );
    server.join().expect("server join");
}

#[test]
fn streaming_transport_error_is_safely_retried_when_nothing_committed() {
    // A transport failure that strikes before the first committed increment
    // (here: the provider closes the connection immediately after the 200
    // headers, before any SSE delta) must be safely replayed instead of
    // failing the turn. The second attempt returns a normal stream.
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Stream Safe Retry Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let attempts = Arc::new(std::sync::atomic::AtomicU32::new(0));
    let attempts_for_server = attempts.clone();
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));
    let server = thread::spawn(move || {
        for _ in 0..2 {
            let (mut stream, _) = listener
                .accept()
                .expect("accept streaming provider request");
            let _ = read_http_json_body(&mut stream);
            let n = attempts_for_server.fetch_add(1, Ordering::SeqCst);
            if n == 0 {
                // Send a 200 with a non-committing SSE chunk (empty choices —
                // map_provider_stream_chunk returns without committing), then a
                // content-length longer than the body so the body read fails
                // mid-stream. Nothing was committed, so replaying is safe.
                let body = "data: {\"choices\":[]}\n\n";
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len() + 4096,
                    body
                )
                .expect("write truncated non-committing stream");
                drop(stream);
            } else {
                let body = concat!(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Recovered.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}\n\n",
                    "data: [DONE]\n\n",
                );
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .expect("write recovered stream");
            }
        }
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let reply = call_model_once(
        &session_id,
        &turn_id,
        &provider,
        "test-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
        &model_capabilities(&provider, "test-model"),
        &CancellationToken::new(),
    )
    .unwrap_or_else(|error| {
        let captured = events
            .lock()
            .expect("events lock")
            .iter()
            .filter(|event| {
                event.get("kind").and_then(Value::as_str) == Some("providerProtocolEvent")
            })
            .cloned()
            .collect::<Vec<_>>();
        panic!(
            "safe retry should recover the turn: {error}\nattempts={}\nevents={captured:#?}",
            attempts.load(Ordering::SeqCst)
        );
    });

    assert_eq!(reply.content.as_deref(), Some("Recovered."));
    assert_eq!(attempts.load(Ordering::SeqCst), 2);
    server.join().expect("server join");
    backend.clear_event_callback();
}

#[test]
fn streaming_failure_falls_back_to_non_streaming_when_uncommitted() {
    // Streaming fails on every attempt (server truncates a non-committing SSE
    // chunk), so safe-retry exhausts and the turn falls back to a single
    // non-streaming request that succeeds. Asserts: reply is the non-streaming
    // content, and a `stream:false` request was actually issued.
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Stream Fallback Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let requests = Arc::new(Mutex::new(Vec::<Value>::new()));
    let requests_for_server = requests.clone();
    let server = thread::spawn(move || {
        // MAX_STREAM_TRANSPORT_RETRIES=2 ⇒ up to 3 streaming attempts, then 1
        // non-streaming fallback. Accept a few streaming conns then one non-streaming.
        for index in 0..=3 {
            let (mut stream, _) = listener.accept().expect("accept provider request");
            let request = read_http_json_body(&mut stream);
            requests_for_server
                .lock()
                .expect("requests")
                .push(request.clone());
            if index < 3 {
                // Streaming attempt: non-committing chunk + truncated body ⇒ transport error.
                let body = "data: {\"choices\":[]}\n\n";
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len() + 4096,
                    body
                )
                .expect("write truncated stream");
                drop(stream);
            } else {
                // Non-streaming fallback: full JSON response.
                let body = json!({
                    "choices": [{
                        "message": { "role": "assistant", "content": "Non-streamed recovery." },
                        "finish_reason": "stop"
                    }]
                })
                .to_string();
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                    body.len(),
                    body
                )
                .expect("write non-streaming fallback");
            }
        }
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let reply = call_model_once(
        &session_id,
        &turn_id,
        &provider,
        "test-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
        &model_capabilities(&provider, "test-model"),
        &CancellationToken::new(),
    )
    .expect("fallback should recover the turn via non-streaming");

    assert_eq!(reply.content.as_deref(), Some("Non-streamed recovery."));
    let captured = requests.lock().expect("requests").clone();
    // The last request must be the non-streaming fallback (stream == false).
    let last = captured.last().expect("at least one request");
    assert_eq!(
        last["stream"],
        json!(false),
        "expected non-streaming fallback request, got {last}"
    );
    server.join().expect("server join");
    backend.clear_event_callback();
}

#[test]
fn committed_stream_does_not_resample_or_fall_back_to_non_streaming() {
    // Once a streaming delta is committed, replaying the whole request could
    // duplicate text or tool side effects. The transport error must surface
    // without a second physical request.
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Committed Fallback Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let requests = Arc::new(Mutex::new(Vec::<Value>::new()));
    let requests_for_server = requests.clone();
    let server = thread::spawn(move || {
        // Every provider content delta crosses the native boundary immediately,
        // setting committed_any=Some(true).
        let (mut stream, _) = listener.accept().expect("accept provider request");
        let request = read_http_json_body(&mut stream);
        requests_for_server.lock().expect("requests").push(request);
        let long_content = "a".repeat(200);
        let body = format!(
            "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}}}}]}}\n\n",
            long_content
        );
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len() + 4096,
            body
        )
        .expect("write truncated committed stream");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let error = call_model_once(
        &session_id,
        &turn_id,
        &provider,
        "test-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
        &model_capabilities(&provider, "test-model"),
        &CancellationToken::new(),
    )
    .expect_err("committed stream must fail without resampling");
    let message = error.to_string();
    assert!(
        message.contains("provider streaming transport failed"),
        "expected transport-failure message, got: {message}"
    );
    let captured = requests.lock().expect("requests").clone();
    assert_eq!(
        captured.len(),
        1,
        "expected exactly the committed streaming request, got {captured:?}"
    );
    assert_eq!(
        captured[0]["stream"],
        json!(true),
        "first request must be streaming: {captured:?}"
    );
    server.join().expect("server join");
    backend.clear_event_callback();
}

#[test]
fn running_tool_marked_failed_on_transport_failure() {
    // When a streaming turn that had a running tool fails irrecoverably (committed
    // partial state), the tool is finalized as `failed` rather than left `running`
    // — so the next round reports "[Tool failed.]" instead of "[Tool did not
    // finish; omitting output from provider context.]".
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Tool Finalize On Transport Fail Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    // Seed a running tool for this turn so the finalizer has something to close.
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        let tools = session
            .snapshot
            .get("tools")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut tools = tools;
        tools.push(json!({
            "id": "tool-running-1",
            "name": "write_file",
            "status": "running",
            "input": { "toolOperation": { "runtimeTurnId": turn_id } },
        }));
        session.snapshot["tools"] = Value::Array(tools);
    }
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        // A committed streaming attempt must never be semantically resampled
        // through a non-streaming fallback.
        // The content delta flushes immediately → committed_any=Some(true) → safe_to_retry=false
        // and the transport failure is surfaced directly.
        let (mut stream, _) = listener.accept().expect("accept provider request");
        let _ = read_http_json_body(&mut stream);
        let long_content = "a".repeat(200);
        let body = format!(
            "data: {{\"choices\":[{{\"delta\":{{\"content\":\"{}\"}}}}]}}\n\n",
            long_content
        );
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len() + 4096,
            body
        )
        .expect("write truncated stream");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let _ = call_model_once(
        &session_id,
        &turn_id,
        &provider,
        "test-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
        &model_capabilities(&provider, "test-model"),
        &CancellationToken::new(),
    )
    .expect_err("expected transport failure");
    server.join().expect("server join");

    let state = state().lock().expect("state lock");
    let session = state.sessions.get(&session_id).expect("session");
    let tools = session
        .snapshot
        .get("tools")
        .and_then(Value::as_array)
        .expect("tools array");
    let tool = tools
        .iter()
        .find(|t| t["id"] == "tool-running-1")
        .expect("seeded tool present");
    assert_eq!(
        tool["status"].as_str(),
        Some("failed"),
        "running tool must be finalized as failed on transport failure, got {tool}"
    );
    backend.clear_event_callback();
}

#[test]
fn model_loop_continues_and_concatenates_max_tokens_text() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Max Tokens Continuation Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept provider request");
            let request = read_http_json_body(&mut stream);
            request_tx.send(request.clone()).expect("send request");
            let body = if index == 0 {
                json!({
                    "choices": [{
                        "message": { "role": "assistant", "content": "Hello " },
                        "finish_reason": "length"
                    }]
                })
                .to_string()
            } else {
                json!({
                    "choices": [{
                        "message": { "role": "assistant", "content": "world" },
                        "finish_reason": "stop"
                    }]
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
        }
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
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
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({ "role": "user", "content": "write a long answer" })],
        tools: Vec::new(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("model loop");

    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    let second_messages = requests[1]["messages"].as_array().expect("messages");
    assert!(
        second_messages.iter().any(|message| {
            message.get("role").and_then(Value::as_str) == Some("assistant")
                && test_message_text(message) == "Hello "
        }),
        "second request missing truncated assistant segment: {}",
        requests[1]
    );
    assert!(
        second_messages.iter().any(|message| {
            message.get("role").and_then(Value::as_str) == Some("user")
                && test_message_text(message).contains("Continue the same response")
        }),
        "second request missing continuation prompt: {}",
        requests[1]
    );
    assert_eq!(result.final_text.as_deref(), Some("Hello world"));
    assert!(!result.ui_text_committed);
    server.join().expect("server join");
}

#[test]
fn max_tokens_tool_call_is_not_executed_and_is_corrected_once() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Truncated Tool Recovery Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind provider");
    let addr = listener.local_addr().expect("local addr");
    let requests = Arc::new(Mutex::new(Vec::<Value>::new()));
    let requests_for_server = requests.clone();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept provider request");
            requests_for_server
                .lock()
                .expect("requests")
                .push(read_http_json_body(&mut stream));
            let body = if index == 0 {
                json!({
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "tool_calls": [{
                                "id": "call-truncated",
                                "type": "function",
                                "function": {
                                    "name": "read_file",
                                    "arguments": "{\"path\":\"/tools/browser/read\""
                                }
                            }]
                        },
                        "finish_reason": "length"
                    }]
                })
            } else {
                json!({
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": "Recovered without executing the truncated call."
                        },
                        "finish_reason": "stop"
                    }]
                })
            }
            .to_string();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
        }
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let dispatch_count = Arc::new(AtomicUsize::new(0));
    let dispatch_count_for_host = dispatch_count.clone();
    let host_dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(move |_, _| {
        dispatch_count_for_host.fetch_add(1, Ordering::SeqCst);
        Ok("{}".to_string())
    });
    let result = run_model_loop(
        &session_id,
        &turn_id,
        ModelRequest {
            capabilities: model_capabilities(&provider, "test-model"),
            provider,
            model: "test-model".to_string(),
            messages: vec![json!({
                "role": "user",
                "content": "Test a truncated tool-call recovery."
            })],
            tools: model_tools(),
            tool_choice: ModelToolChoice::Auto,
            host_dispatcher: Some(host_dispatcher),
            input_downgrades: Vec::new(),
            evidence_refs: Vec::new(),
            token_estimate: 0,
            context_trimmed: false,
        },
        &CancellationToken::new(),
    )
    .expect("bounded correction");
    server.join().expect("server join");

    assert_eq!(dispatch_count.load(Ordering::SeqCst), 0);
    assert_eq!(
        result.final_text.as_deref(),
        Some("Recovered without executing the truncated call.")
    );
    let requests = requests.lock().expect("requests");
    assert_eq!(requests.len(), 2);
    let second = serde_json::to_string(&requests[1]).expect("second request");
    assert!(second.contains("was not executed"));
    assert!(second.contains("Reissue the complete tool call"));
    backend.clear_event_callback();
}

#[test]
fn model_loop_marks_continuation_exhaustion() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Max Tokens Exhaustion Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let expected_continuation_retries = 4_u8;
    let server = thread::spawn(move || {
        for index in 0..=expected_continuation_retries {
            let (mut stream, _) = listener.accept().expect("accept provider request");
            let request = read_http_json_body(&mut stream);
            request_tx.send(request).expect("send request");
            let body = json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": format!("part-{index};")
                    },
                    "finish_reason": "length"
                }]
            })
            .to_string();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write response");
        }
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
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
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({ "role": "user", "content": "write a very long answer" })],
        tools: Vec::new(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("model loop");

    let final_text = result.final_text.as_deref().expect("final text");
    assert!(final_text.starts_with("part-0;part-1;part-2;part-3;part-4;"));
    assert!(final_text.contains("Auto continuation limit reached"));
    let metadata = result.session_metadata().expect("metadata");
    assert_eq!(
        metadata.pointer("/providerContinuation/continuationExhausted"),
        Some(&Value::Bool(true))
    );
    assert!(!result.ui_text_committed);
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), expected_continuation_retries as usize + 1);
    server.join().expect("server join");
}

#[test]
fn openai_responses_route_executes_non_streaming_request() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind hosted provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept hosted provider request");
        let request = read_http_json_body(&mut stream);
        assert_eq!(request["model"], "gpt-test");
        assert_eq!(request["stream"], false);
        assert_eq!(request["store"], false);
        assert_eq!(request["include"][0], "reasoning.encrypted_content");
        assert_eq!(request["input"][0]["role"], "user");
        let body = r#"{"id":"resp-test","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Hosted route reply."}]}]}"#;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write hosted route reply");
    });
    let provider = NativeProviderProfile {
        id: "openai".to_string(),
        label: "OpenAI".to_string(),
        route_id: "openai".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("gpt-test".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "gpt-test".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let reply = call_model_once_non_streaming(
        &provider,
        "gpt-test",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
    )
    .expect("responses request should succeed");

    assert_eq!(reply.content.as_deref(), Some("Hosted route reply."));
    assert_eq!(reply.provider_replay_items[0]["type"], "message");
    server.join().expect("server join");
}

#[test]
fn mimo_hosted_route_applies_specialized_body_and_api_key_header() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mimo provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept mimo provider request");
        let (headers, request) = read_http_request(&mut stream);
        assert!(
            headers
                .to_ascii_lowercase()
                .contains("\r\napi-key: test-key\r\n")
        );
        assert_eq!(request["model"], "mimo-v2.5-pro");
        assert_eq!(request["stream"], false);
        assert_eq!(request["thinking"]["type"], "enabled");
        assert_eq!(request["temperature"], 1.0);
        assert_eq!(request["top_p"], 0.95);
        let body = r#"{"choices":[{"message":{"role":"assistant","content":"MiMo hosted route reply."}}]}"#;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write mimo hosted route reply");
    });
    let provider = NativeProviderProfile {
        id: "mimo".to_string(),
        label: "MiMo".to_string(),
        route_id: "mimo".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("mimo-v2.5-pro".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
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
        }],
    };

    let reply = call_model_once_non_streaming(
        &provider,
        "mimo-v2.5-pro",
        &[json!({ "role": "user", "content": "hello" })],
        &model_tools(),
    )
    .expect("mimo hooked request should succeed");

    assert_eq!(reply.content.as_deref(), Some("MiMo hosted route reply."));
    server.join().expect("server join");
}

#[test]
fn mimo_tool_loop_replays_reasoning_content_with_assistant_tool_calls() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "MiMo Reasoning Tool Transcript Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mimo provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept mimo provider request");
            let request = read_http_json_body(&mut stream);
            request_tx.send(request).expect("send request");
            let body = if index == 0 {
                json!({
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": "",
                            "reasoning_content": "I should inspect the current tabs before answering.",
                            "tool_calls": [{
                                "id": "call-tabs",
                                "type": "function",
                                "function": {
                                    "name": "read_file",
                                    "arguments": "{\"path\":\"/tools/workbench/list_tabs\",\"args\":{\"scope\":\"all\"}}"
                                }
                            }]
                        }
                    }]
                })
                .to_string()
            } else {
                json!({
                    "choices": [{
                        "message": {
                            "role": "assistant",
                            "content": "Checked the current tabs.",
                            "reasoning_content": "The tab evidence is enough to finish."
                        }
                    }]
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write mimo response");
        }
    });
    let provider = NativeProviderProfile {
        id: "mimo".to_string(),
        label: "MiMo".to_string(),
        route_id: "mimo".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("mimo-v2.5-pro".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "mimo-v2.5-pro".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "mimo-v2.5-pro".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "mimo-v2.5-pro"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("mimo model loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let log = state()
        .lock()
        .expect("state lock")
        .sessions
        .get(&session_id)
        .map(|session| session.provider_protocol_log.clone())
        .unwrap_or_default();
    assert_eq!(log.len(), 2);
    assert_eq!(
        log[0]["step"]["assistant"]["reasoning"],
        "I should inspect the current tabs before answering."
    );
    assert_eq!(
        log[0]["step"]["assistant"]["toolCalls"][0]["id"],
        "call-tabs"
    );
    assert_eq!(
        log[1]["step"]["assistant"]["reasoning"],
        "The tab evidence is enough to finish."
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0]["thinking"]["type"], "enabled");
    let replayed_assistant = requests[1]["messages"]
        .as_array()
        .expect("messages")
        .iter()
        .find(|message| {
            message.get("role").and_then(Value::as_str) == Some("assistant")
                && message.get("tool_calls").is_some()
        })
        .expect("assistant tool-call replay");
    assert_eq!(
        replayed_assistant["reasoning_content"],
        "I should inspect the current tabs before answering."
    );
    server.join().expect("server join");
}

#[test]
fn mimo_streaming_tool_loop_replays_reasoning_content_with_assistant_tool_calls() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "MiMo Streaming Reasoning Tool Transcript Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mimo provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept mimo provider request");
            let request = read_http_json_body(&mut stream);
            request_tx.send(request).expect("send request");
            let body = if index == 0 {
                concat!(
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"I should inspect the current tabs before answering.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-tabs\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"/tools/workbench/list_tabs\\\",\\\"args\\\":{\\\"scope\\\":\\\"all\\\"}}\"}}]}}]}\n\n",
                    "data: [DONE]\n\n",
                )
                .to_string()
            } else {
                concat!(
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"The tab evidence is enough to finish.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Checked the current tabs.\"}}]}\n\n",
                    "data: [DONE]\n\n",
                )
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write mimo streaming response");
        }
    });
    let provider = NativeProviderProfile {
        id: "mimo".to_string(),
        label: "MiMo".to_string(),
        route_id: "mimo".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("mimo-v2.5-pro".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
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
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "mimo-v2.5-pro".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "mimo-v2.5-pro"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("mimo streaming model loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0]["stream"], true);
    let replayed_assistant = requests[1]["messages"]
        .as_array()
        .expect("messages")
        .iter()
        .find(|message| {
            message.get("role").and_then(Value::as_str) == Some("assistant")
                && message.get("tool_calls").is_some()
        })
        .expect("assistant tool-call replay");
    assert_eq!(
        replayed_assistant["reasoning_content"],
        "I should inspect the current tabs before answering."
    );
    server.join().expect("server join");
}

#[test]
fn mimo_anthropic_tool_loop_replays_thinking_blocks_with_assistant_tool_calls() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "MiMo Anthropic Reasoning Tool Transcript Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind mimo anthropic provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept mimo anthropic request");
            let (headers, request) = read_http_request(&mut stream);
            request_tx.send(request.clone()).expect("send request");
            assert!(headers.to_ascii_lowercase().contains("api-key: test-key"));
            if index == 0 {
                assert_eq!(request["thinking"]["type"], "enabled");
            } else {
                let replayed_assistant = request["messages"]
                    .as_array()
                    .expect("messages")
                    .iter()
                    .find(|message| {
                        message.get("role").and_then(Value::as_str) == Some("assistant")
                            && message.pointer("/content/0/type").and_then(Value::as_str)
                                == Some("thinking")
                    })
                    .expect("assistant thinking replay");
                assert_eq!(
                    replayed_assistant
                        .pointer("/content/0/thinking")
                        .and_then(Value::as_str),
                    Some("I should inspect the current tabs before answering.")
                );
            }
            let body = if index == 0 {
                json!({
                    "id": "msg-tool-1",
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "thinking",
                            "thinking": "I should inspect the current tabs before answering."
                        },
                        {
                            "type": "tool_use",
                            "id": "call-tabs",
                            "name": "read_file",
                            "input": {
                                "path": "/tools/workbench/list_tabs",
                                "args": { "scope": "all" }
                            }
                        }
                    ],
                    "stop_reason": "tool_use"
                })
                .to_string()
            } else {
                json!({
                    "id": "msg-tool-2",
                    "type": "message",
                    "role": "assistant",
                    "content": [
                        {
                            "type": "thinking",
                            "thinking": "The tab evidence is enough to finish."
                        },
                        {
                            "type": "text",
                            "text": "Checked the current tabs."
                        }
                    ],
                    "stop_reason": "end_turn"
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write mimo anthropic response");
        }
    });
    let provider = NativeProviderProfile {
        id: "mimo-anthropic".to_string(),
        label: "MiMo Anthropic".to_string(),
        route_id: "mimo_anthropic".to_string(),
        base_url: Some(format!("http://{addr}/anthropic/v1")),
        default_model: Some("mimo-v2.5-pro".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: Some("api-key".to_string()),
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "mimo-v2.5-pro".to_string(),
            label: None,
            context_window: None,
            supports_image_input: true,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "mimo-v2.5-pro".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "mimo-v2.5-pro"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("mimo anthropic model loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let log = state()
        .lock()
        .expect("state lock")
        .sessions
        .get(&session_id)
        .map(|session| session.provider_protocol_log.clone())
        .unwrap_or_default();
    assert_eq!(log.len(), 2);
    assert_eq!(
        log[0]["step"]["assistant"]["reasoning"],
        "I should inspect the current tabs before answering."
    );
    assert_eq!(
        log[0]["step"]["assistant"]["toolCalls"][0]["id"],
        "call-tabs"
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    server.join().expect("server join");
}

#[test]
fn openai_responses_tool_loop_replays_native_items_and_function_outputs() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "OpenAI Responses Replay Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind openai provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept openai request");
            let request = read_http_json_body(&mut stream);
            request_tx.send(request.clone()).expect("send request");
            if index == 0 {
                assert_eq!(request["store"], false);
                assert_eq!(request["include"][0], "reasoning.encrypted_content");
            } else {
                let input = request["input"].as_array().expect("responses input");
                assert!(input.iter().any(|item| {
                    item.get("type").and_then(Value::as_str) == Some("function_call")
                        && item.get("call_id").and_then(Value::as_str) == Some("call-tabs")
                }));
                assert!(input.iter().any(|item| {
                    item.get("type").and_then(Value::as_str) == Some("function_call_output")
                        && item.get("call_id").and_then(Value::as_str) == Some("call-tabs")
                }));
            }
            let body = if index == 0 {
                json!({
                    "id": "resp-tool-1",
                    "status": "completed",
                    "output": [
                        {
                            "type": "reasoning",
                            "id": "rs-1",
                            "encrypted_content": "encrypted-reasoning"
                        },
                        {
                            "type": "function_call",
                            "id": "fc-1",
                            "call_id": "call-tabs",
                            "name": "read_file",
                            "arguments": "{\"path\":\"/tools/workbench/list_tabs\",\"args\":{\"scope\":\"all\"}}"
                        }
                    ]
                })
                .to_string()
            } else {
                json!({
                    "id": "resp-tool-2",
                    "status": "completed",
                    "output": [{
                        "type": "message",
                        "role": "assistant",
                        "content": [{
                            "type": "output_text",
                            "text": "Checked the current tabs."
                        }]
                    }]
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write openai response");
        }
    });
    let provider = NativeProviderProfile {
        id: "openai".to_string(),
        label: "OpenAI".to_string(),
        route_id: "openai".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("gpt-5-mini".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "gpt-5-mini".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "gpt-5-mini".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "gpt-5-mini"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("openai responses model loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let (saved_messages, log) = state()
        .lock()
        .expect("state lock")
        .sessions
        .get(&session_id)
        .map(|session| {
            (
                session.snapshot["messages"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default(),
                session.provider_protocol_log.clone(),
            )
        })
        .unwrap_or((Vec::new(), Vec::new()));
    assert_eq!(log.len(), 2);
    let round_one_items = log[0]["step"]["replay"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert!(round_one_items.iter().any(|item| {
        item.get("type").and_then(Value::as_str) == Some("reasoning")
            && item.get("encrypted_content").and_then(Value::as_str) == Some("encrypted-reasoning")
    }));
    assert!(round_one_items.iter().any(|item| {
        item.get("type").and_then(Value::as_str) == Some("function_call")
            && item.get("call_id").and_then(Value::as_str) == Some("call-tabs")
    }));
    assert!(
        log[0]["step"]["toolResults"]
            .as_array()
            .is_some_and(|results| {
                results.iter().any(|result| {
                    result.get("toolCallId").and_then(Value::as_str) == Some("call-tabs")
                })
            })
    );
    let round_two_items = log[1]["step"]["replay"]["items"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    assert!(round_two_items.iter().any(|item| {
        item.get("type").and_then(Value::as_str) == Some("message")
            && item.pointer("/content/0/text").and_then(Value::as_str)
                == Some("Checked the current tabs.")
    }));
    // Resume replay: the saved timeline plus the log rebuild the native
    // provider transcript — items, tool calls, and tool outputs. Unanchored
    // steps are backfilled to the committed message the way finish_turn does.
    let mut protocol_log = log;
    let replay_message_id = result
        .final_message_id
        .clone()
        .expect("committed final message id");
    for entry in protocol_log.iter_mut() {
        if entry
            .get("messageId")
            .and_then(Value::as_str)
            .filter(|id| !id.is_empty())
            .is_none()
        {
            entry["messageId"] = json!(replay_message_id.clone());
        }
    }
    let replayed = ContextBuilder::default().build_provider_context(
        "system".to_string(),
        saved_messages,
        ProviderContextOptions {
            protocol_log,
            provider_id: Some("openai".to_string()),
            route_id: Some("openai".to_string()),
            protocol_id: Some("openai_responses".to_string()),
            model: Some("gpt-5-mini".to_string()),
            ..ProviderContextOptions::default()
        },
    );
    let item_types: Vec<&str> = replayed
        .messages
        .iter()
        .filter_map(|message| message.get("type").and_then(Value::as_str))
        .collect();
    assert_eq!(
        item_types,
        vec![
            "reasoning",
            "function_call",
            "function_call_output",
            "message"
        ]
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    server.join().expect("server join");
}

#[test]
fn native_plan_draft_allows_prose_final_response() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::write(
        temp.path().join("agent.rs"),
        "pub struct AgentRuntime { pub enabled: bool }\n",
    )
    .expect("write fixture");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Native quality gate retry",
                "workingDir": temp.path().display().to_string(),
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    bind_test_user_message(&session_id, &turn_id);
    record_test_investigation(&session_id, &turn_id, "tool-gate-investigation");
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["messages"] =
            json!([{ "role": "user", "text": "审查并优化这个 Agent 架构" }]);
        // A plan was started but not finalized: the quality gate must reject a
        // prose final response until the plan reaches review.
        session.snapshot["plan"] = json!({
            "activePlanId": "plan-gate-retry",
            "activeVersionId": "plan-gate-retry-v1",
            "title": "Review the Agent runtime",
            "phase": PLAN_PHASE_PLANNING,
            "markdown": "# Plan\n\nReview the Agent runtime architecture, then optimize it with verification.",
        });
    }

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept provider request");
        let request = read_http_json_body(&mut stream);
        request_tx.send(request).expect("send request");
        let body = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "The architecture is complete and production-ready."
                },
                "finish_reason": "stop"
            }]
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write provider response");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({
            "role": "user",
            "content": "审查并优化这个 Agent 架构"
        })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("model loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("The architecture is complete and production-ready.")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 1);
    server.join().expect("server join");
}

#[test]
fn native_ordinary_turn_completes_after_source_mutation() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Completion verification recovery",
                "workingDir": temp.path().display().to_string(),
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["messages"] =
            json!([{ "role": "user", "text": "Update the runtime source." }]);
        session.snapshot["tools"] = json!([{
            "id": "source-mutation",
            "name": WRITE_FILE_MODEL_TOOL,
            "status": "completed",
            "input": {
                "toolOperation": {
                    "runtimeTurnId": turn_id,
                }
            },
            "output": {
                "content": "source changed",
                "raw": {
                    "changedFiles": [{ "path": "src/lib.rs" }],
                }
            }
        }]);
    }

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept provider request");
        let request = read_http_json_body(&mut stream);
        request_tx.send(request).expect("send request");
        let body = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "The source update is verified and complete."
                },
                "finish_reason": "stop"
            }]
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write provider response");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: Some(true),
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({
            "role": "user",
            "content": "Update the runtime source."
        })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("model loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("The source update is verified and complete.")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0]["tool_choice"], "auto");
    server.join().expect("server join");
}

#[test]
fn native_completion_gate_blocks_unfinished_todos_without_turn_failure() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Completion blocked recovery",
                "workingDir": temp.path().display().to_string(),
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    {
        let mut state = state().lock().expect("state lock");
        let session = state.sessions.get_mut(&session_id).expect("session");
        session.snapshot["messages"] =
            json!([{ "role": "user", "text": "Update the runtime source." }]);
        session.snapshot["projectTodo"] = json!({
            "status": "completed",
            "todos": [{
                "id": "open",
                "content": "Still working",
                "status": "in_progress"
            }]
        });
    }

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept provider request");
        let request = read_http_json_body(&mut stream);
        request_tx.send(request).expect("send request");
        let body = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "The source update is complete."
                },
                "finish_reason": "stop"
            }]
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write provider response");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: Some(true),
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({
            "role": "user",
            "content": "Update the runtime source."
        })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("completionBlocked is a recoverable model-loop result");

    assert!(
        result
            .final_text
            .as_deref()
            .is_some_and(|text| text.starts_with("Completion is blocked:"))
    );
    assert_eq!(
        result
            .metadata
            .as_ref()
            .and_then(|metadata| metadata.pointer("/completionBlocked/code"))
            .and_then(Value::as_str),
        Some("todo_items_incomplete")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0]["tool_choice"], "auto");
    {
        let state = state().lock().expect("state lock");
        let session = state.sessions.get(&session_id).expect("session");
        assert_eq!(
            session
                .snapshot
                .pointer("/completionBlocked/status")
                .and_then(Value::as_str),
            Some("blocked")
        );
        assert_eq!(
            session
                .snapshot
                .pointer("/goalContinuation/reason")
                .and_then(Value::as_str),
            Some("completion_blocked")
        );
    }
    server.join().expect("server join");
}

#[test]
fn native_clarification_tool_success_is_detected() {
    let clarification_call = ModelToolCall {
        id: "call-clarification".to_string(),
        name: LYRA_CLARIFICATION_ASK_TOOL.to_string(),
        arguments: json!({}),
    };
    assert!(completed_successful_tool_call(
        std::slice::from_ref(&clarification_call),
        &[json!({ "answer": "Product site" })],
        LYRA_CLARIFICATION_ASK_TOOL,
    ));
    assert!(!completed_successful_tool_call(
        &[clarification_call],
        &[json!({ "error": { "code": "clarificationFailed" } })],
        LYRA_CLARIFICATION_ASK_TOOL,
    ));
}

#[test]
fn plan_contract_rejects_prose_only_completion_and_requires_tools() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Plan Required Test",
                "workingDir": temp.path().display().to_string(),
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    bind_test_user_message(&session_id, &turn_id);
    let evidence_id = "tool-plan-required-investigation";
    record_test_investigation(&session_id, &turn_id, evidence_id);

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept provider request");
        let request = read_http_json_body(&mut stream);
        request_tx.send(request).expect("send request");
        let tool_call = |id: &str, name: &str, args: Value| {
            json!({
                "id": id,
                "type": "function",
                "function": {
                    "name": name,
                    "arguments": args.to_string(),
                }
            })
        };
        let body = json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        tool_call("call-plan-begin", PLAN_BEGIN_MODEL_TOOL, json!({
                            "title": "Build product site",
                            "reason": "user requested a plan",
                        })),
                        tool_call("call-plan-write", PLAN_WRITE_MODEL_TOOL, json!({
                            "markdownDelta": "# Plan\n\nBuild the product site within the existing project architecture and verify the final implementation.",
                            "replace": true,
                        })),
                        tool_call("call-plan-finalize", PLAN_FINALIZE_MODEL_TOOL, json!({
                            "summary": "Ready for review"
                        })),
                    ],
                },
                "finish_reason": "tool_calls",
            }]
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write provider response");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({ "role": "user", "content": "Plan a product site" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("model loop");

    assert!(result.final_text.is_none());
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0]["tool_choice"], "auto");
    let phase = state()
        .lock()
        .expect("state lock")
        .sessions
        .get(&session_id)
        .and_then(|session| session.snapshot.pointer("/plan/phase"))
        .and_then(Value::as_str)
        .map(str::to_string);
    assert_eq!(phase.as_deref(), Some(PLAN_PHASE_REVIEWING));
    server.join().expect("server join");
}

#[test]
fn plan_finalize_stops_same_tool_batch_before_mutation() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    let target_path = temp.path().join("should-not-exist.txt");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Plan Finalize Stop Test",
                "workingDir": temp.path().display().to_string(),
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    record_test_investigation(&session_id, &turn_id, "tool-plan-finalize-investigation");
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn({
        let target_path = target_path.clone();
        move || {
            let (mut stream, _) = listener.accept().expect("accept provider request");
            let _ = read_http_json_body(&mut stream);
            let tool_call = |id: &str, name: &str, args: Value| {
                json!({
                    "id": id,
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": args.to_string(),
                    }
                })
            };
            let body = json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            tool_call("call-plan-begin", PLAN_BEGIN_MODEL_TOOL, json!({
                                "title": "Build runtime change",
                                "reason": "user requested plan",
                            })),
                            tool_call("call-plan-write", PLAN_WRITE_MODEL_TOOL, json!({
                                "markdownDelta": "# Plan\n\nArchitecture: keep the change in maintainable runtime module boundaries.\n\nVerification: run focused checks before review.",
                                "replace": true,
                            })),
                            tool_call("call-plan-finalize", PLAN_FINALIZE_MODEL_TOOL, json!({
                                "summary": "Ready for review",
                                "investigationEvidenceIds": ["tool-plan-finalize-investigation"],
                            })),
                            tool_call("call-write", "write_file", json!({
                                "path": target_path.display().to_string(),
                                "content": "should not be written",
                                "overwrite": true,
                            })),
                        ],
                    },
                    "finish_reason": "tool_calls",
                }]
            })
            .to_string();
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write provider response");
        }
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("test-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "test-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "test-model".to_string(),
        messages: vec![json!({ "role": "user", "content": "make a runtime change" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "test-model"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("model loop");

    assert!(result.final_text.is_none());
    assert!(!target_path.exists());
    let phase = state()
        .lock()
        .expect("state lock")
        .sessions
        .get(&session_id)
        .and_then(|session| session.snapshot.pointer("/plan/phase"))
        .and_then(Value::as_str)
        .map(str::to_string);
    assert_eq!(phase.as_deref(), Some("reviewing"));
    server.join().expect("server join");
}

#[test]
fn anthropic_messages_tool_loop_converts_tool_use_and_results() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Anthropic Messages Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind anthropic provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept anthropic request");
            let (headers, request) = read_http_request(&mut stream);
            let lower_headers = headers.to_ascii_lowercase();
            assert!(lower_headers.contains("x-api-key: test-key"));
            assert!(lower_headers.contains("anthropic-version: 2023-06-01"));
            request_tx.send(request.clone()).expect("send request");
            if index == 0 {
                assert_eq!(request["model"], "claude-sonnet-4-6");
                assert_eq!(request["stream"], false);
                assert!(
                    request["tools"]
                        .as_array()
                        .expect("anthropic tools array")
                        .iter()
                        .any(|tool| tool["name"] == "ToolSearch")
                );
            } else {
                let messages = request["messages"].as_array().expect("messages");
                assert!(messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("assistant")
                        && message.pointer("/content/0/type").and_then(Value::as_str)
                            == Some("tool_use")
                }));
                assert!(messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("user")
                        && message.pointer("/content/0/type").and_then(Value::as_str)
                            == Some("tool_result")
                }));
            }
            let body = if index == 0 {
                json!({
                    "id": "msg-tool-1",
                    "type": "message",
                    "role": "assistant",
                    "content": [{
                        "type": "tool_use",
                        "id": "call-tabs",
                        "name": "read_file",
                        "input": {
                            "path": "/tools/workbench/list_tabs",
                            "args": { "scope": "all" }
                        }
                    }],
                    "stop_reason": "tool_use"
                })
                .to_string()
            } else {
                json!({
                    "id": "msg-tool-2",
                    "type": "message",
                    "role": "assistant",
                    "content": [{
                        "type": "text",
                        "text": "Checked the current tabs."
                    }],
                    "stop_reason": "end_turn"
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write anthropic response");
        }
    });
    let provider = NativeProviderProfile {
        id: "anthropic".to_string(),
        label: "Anthropic".to_string(),
        route_id: "anthropic".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("claude-sonnet-4-6".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "claude-sonnet-4-6".to_string(),
            label: None,
            context_window: None,
            supports_image_input: true,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "claude-sonnet-4-6".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "claude-sonnet-4-6"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("anthropic messages loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    server.join().expect("server join");
}

#[test]
fn custom_anthropic_compatible_route_executes_messages_request() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind custom anthropic provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener
            .accept()
            .expect("accept custom anthropic provider request");
        let (headers, request) = read_http_request(&mut stream);
        let lower_headers = headers.to_ascii_lowercase();
        assert!(lower_headers.starts_with("post /v1/messages "));
        assert!(lower_headers.contains("api-key: test-key"));
        assert!(!lower_headers.contains("x-api-key: test-key"));
        assert!(lower_headers.contains("anthropic-version: 2023-06-01"));
        assert_eq!(request["model"], "claude-compatible");
        assert_eq!(request["messages"][0]["role"], "user");
        let body = json!({
            "id": "msg-custom-1",
            "type": "message",
            "role": "assistant",
            "content": [{ "type": "text", "text": "Custom Anthropic reply." }],
            "stop_reason": "end_turn"
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write custom anthropic response");
    });
    let provider = NativeProviderProfile {
        id: "custom-anthropic".to_string(),
        label: "Custom Anthropic".to_string(),
        route_id: "custom_anthropic_compatible".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("claude-compatible".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: Some("api-key".to_string()),
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "claude-compatible".to_string(),
            label: None,
            context_window: None,
            supports_image_input: true,
            supports_tool_calling: true,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let reply = call_model_once_non_streaming(
        &provider,
        "claude-compatible",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
    )
    .expect("custom anthropic request should succeed");

    assert_eq!(reply.content.as_deref(), Some("Custom Anthropic reply."));
    server.join().expect("server join");
}

#[test]
fn gemini_generate_content_tool_loop_converts_function_calls_and_responses() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Gemini GenerateContent Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind gemini provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept gemini request");
            let (headers, request) = read_http_request(&mut stream);
            let lower_headers = headers.to_ascii_lowercase();
            assert!(
                lower_headers.starts_with("post /v1beta/models/gemini-2.5-flash:generatecontent ")
            );
            assert!(lower_headers.contains("x-goog-api-key: test-key"));
            request_tx.send(request.clone()).expect("send request");
            if index == 0 {
                assert_eq!(request["contents"][0]["role"], "user");
                assert!(
                    request["tools"][0]["functionDeclarations"]
                        .as_array()
                        .expect("gemini functionDeclarations array")
                        .iter()
                        .any(|tool| tool["name"] == "ToolSearch")
                );
                assert_eq!(
                    request["toolConfig"]["functionCallingConfig"]["mode"],
                    "AUTO"
                );
            } else {
                let contents = request["contents"].as_array().expect("contents");
                assert!(contents.iter().any(|content| {
                    content.get("role").and_then(Value::as_str) == Some("model")
                        && content
                            .pointer("/parts/0/functionCall/name")
                            .and_then(Value::as_str)
                            == Some("read_file")
                }));
                assert!(contents.iter().any(|content| {
                    content.get("role").and_then(Value::as_str) == Some("user")
                        && content
                            .pointer("/parts/0/functionResponse/name")
                            .and_then(Value::as_str)
                            == Some("read_file")
                }));
            }
            let body = if index == 0 {
                json!({
                    "candidates": [{
                        "content": {
                            "role": "model",
                            "parts": [{
                                "functionCall": {
                                    "name": "read_file",
                                    "args": {
                                        "path": "/tools/workbench/list_tabs",
                                        "args": { "scope": "all" }
                                    }
                                }
                            }]
                        },
                        "finishReason": "STOP"
                    }]
                })
                .to_string()
            } else {
                json!({
                    "candidates": [{
                        "content": {
                            "role": "model",
                            "parts": [{
                                "text": "Checked the current tabs."
                            }]
                        },
                        "finishReason": "STOP"
                    }]
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write gemini response");
        }
    });
    let provider = NativeProviderProfile {
        id: "google_gemini".to_string(),
        label: "Google Gemini".to_string(),
        route_id: "google_gemini".to_string(),
        base_url: Some(format!("http://{addr}/v1beta")),
        default_model: Some("gemini-2.5-flash".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "gemini-2.5-flash".to_string(),
            label: None,
            context_window: None,
            supports_image_input: true,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "gemini-2.5-flash".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "gemini-2.5-flash"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("gemini generate content loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    server.join().expect("server join");
}

#[test]
fn aws_bedrock_converse_tool_loop_signs_and_converts_tool_use_and_results() {
    unsafe {
        std::env::set_var("AWS_SECRET_ACCESS_KEY", "test-secret");
        std::env::set_var("AWS_REGION", "us-west-2");
    }
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "AWS Bedrock Converse Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind bedrock provider");
    let addr = listener.local_addr().expect("local addr");
    let (request_tx, request_rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().expect("accept bedrock request");
            let (headers, request) = read_http_request(&mut stream);
            let lower_headers = headers.to_ascii_lowercase();
            assert!(
                lower_headers.starts_with(
                    "post /model/anthropic.claude-3-5-sonnet-20241022-v2%3a0/converse "
                )
            );
            assert!(lower_headers.contains("authorization: aws4-hmac-sha256 credential=akiatest/"));
            assert!(lower_headers.contains("/us-west-2/bedrock/aws4_request"));
            assert!(lower_headers.contains("x-amz-date: "));
            assert!(lower_headers.contains("x-amz-content-sha256: "));
            request_tx.send(request.clone()).expect("send request");
            if index == 0 {
                assert_eq!(request["messages"][0]["role"], "user");
                assert!(
                    request["toolConfig"]["tools"]
                        .as_array()
                        .expect("bedrock toolConfig tools array")
                        .iter()
                        .any(|tool| tool["toolSpec"]["name"] == "ToolSearch")
                );
                assert_eq!(request["toolConfig"]["toolChoice"]["auto"], json!({}));
            } else {
                let messages = request["messages"].as_array().expect("messages");
                assert!(messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("assistant")
                        && message
                            .pointer("/content/0/toolUse/name")
                            .and_then(Value::as_str)
                            == Some("read_file")
                }));
                assert!(messages.iter().any(|message| {
                    message.get("role").and_then(Value::as_str) == Some("user")
                        && message
                            .pointer("/content/0/toolResult/toolUseId")
                            .and_then(Value::as_str)
                            == Some("call-tabs")
                }));
            }
            let body = if index == 0 {
                json!({
                    "output": {
                        "message": {
                            "role": "assistant",
                            "content": [{
                                "toolUse": {
                                    "toolUseId": "call-tabs",
                                    "name": "read_file",
                                    "input": {
                                        "path": "/tools/workbench/list_tabs",
                                        "args": { "scope": "all" }
                                    }
                                }
                            }]
                        }
                    },
                    "stopReason": "tool_use"
                })
                .to_string()
            } else {
                json!({
                    "output": {
                        "message": {
                            "role": "assistant",
                            "content": [{
                                "text": "Checked the current tabs."
                            }]
                        }
                    },
                    "stopReason": "end_turn"
                })
                .to_string()
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write bedrock response");
        }
    });
    let provider = NativeProviderProfile {
        id: "aws_bedrock".to_string(),
        label: "AWS Bedrock".to_string(),
        route_id: "aws_bedrock".to_string(),
        base_url: Some(format!("http://{addr}")),
        default_model: Some("anthropic.claude-3-5-sonnet-20241022-v2:0".to_string()),
        api_key_ref: None,
        api_key: Some("AKIATEST".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            label: None,
            context_window: None,
            supports_image_input: true,
            supports_tool_calling: true,
            supports_streaming: false,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };
    let request = ModelRequest {
        provider: provider.clone(),
        model: "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
        messages: vec![json!({ "role": "user", "content": "what tabs are open?" })],
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(&provider, "anthropic.claude-3-5-sonnet-20241022-v2:0"),
        input_downgrades: Vec::new(),
        evidence_refs: Vec::new(),
        token_estimate: 0,
        context_trimmed: false,
    };

    let result = run_model_loop(&session_id, &turn_id, request, &CancellationToken::new())
        .expect("aws bedrock converse loop");

    assert_eq!(
        result.final_text.as_deref(),
        Some("Checked the current tabs.")
    );
    let requests = request_rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    server.join().expect("server join");
}

#[test]
fn local_descriptor_route_keeps_generic_fallback_execution() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept local provider request");
        let request = read_http_json_body(&mut stream);
        assert_eq!(request["model"], "local-model");
        assert_eq!(request["stream"], false);
        let body =
            r#"{"choices":[{"message":{"role":"assistant","content":"Local fallback reply."}}]}"#;
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write local fallback reply");
    });
    let provider = NativeProviderProfile {
        id: "lmstudio".to_string(),
        label: "LM Studio".to_string(),
        route_id: "lmstudio".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("local-model".to_string()),
        api_key_ref: None,
        api_key: None,
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "local-model".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }],
    };

    let reply = call_model_once_non_streaming(
        &provider,
        "local-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
    )
    .expect("local fallback request should succeed");

    assert_eq!(reply.content.as_deref(), Some("Local fallback reply."));
    server.join().expect("server join");
}

#[test]
fn non_streaming_provider_html_error_body_surfaces_status_and_preview() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept local provider request");
        let request = read_http_json_body(&mut stream);
        assert_eq!(request["model"], "local-model");
        assert_eq!(request["stream"], false);
        let body = "<html><body><h1>503 Service Unavailable</h1><p>edge timeout</p></body></html>";
        write!(
            stream,
            "HTTP/1.1 503 Service Unavailable\r\ncontent-type: text/html\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write local error body");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("local-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "local-model".to_string(),
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
        }],
    };

    let error = call_model_once_non_streaming(
        &provider,
        "local-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
    )
    .expect_err("HTML provider error body should be surfaced");
    let message = error.to_string();

    assert!(message.contains("HTTP 503"));
    assert!(message.contains("edge timeout"));
    server.join().expect("server join");
}

#[test]
fn non_streaming_provider_success_non_json_body_surfaces_decode_context() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind local provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept local provider request");
        let request = read_http_json_body(&mut stream);
        assert_eq!(request["model"], "local-model");
        assert_eq!(request["stream"], false);
        let body = "upstream returned an empty gateway page";
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: text/plain\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write local non-json body");
    });
    let provider = NativeProviderProfile {
        id: "local".to_string(),
        label: "Local Test".to_string(),
        route_id: "custom_openai_compatible".to_string(),
        base_url: Some(format!("http://{addr}/v1")),
        default_model: Some("local-model".to_string()),
        api_key_ref: None,
        api_key: Some("test-key".to_string()),
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "local-model".to_string(),
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
        }],
    };

    let error = call_model_once_non_streaming(
        &provider,
        "local-model",
        &[json!({ "role": "user", "content": "hello" })],
        &[],
    )
    .expect_err("non-JSON provider success body should include decode context");
    let message = error.to_string();

    assert!(message.contains("provider response JSON decode failed"));
    assert!(message.contains("HTTP 200"));
    assert!(message.contains("content-type text/plain"));
    assert!(message.contains("upstream returned an empty gateway page"));
    server.join().expect("server join");
}

#[test]
fn lmstudio_refresh_uses_native_model_discovery_endpoint() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind lmstudio provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept lmstudio request");
        let headers = read_http_headers_only(&mut stream);
        assert!(headers.starts_with("get /api/v1/models "));
        assert!(!headers.contains("authorization:"));
        let body = json!({
            "data": [
                { "id": "lmstudio-qwen" },
                { "model": "lmstudio-gemma" }
            ]
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write lmstudio discovery response");
    });

    let backend = LyraAgentBackend;
    let profile_name = format!("lmstudio-{}", Uuid::new_v4());
    backend
        .call_agent_method(
            "agent.provider.profile.save",
            json!({
                "profileName": profile_name,
                "routeId": "lmstudio",
                "baseUrl": format!("http://{addr}/v1"),
                "defaultModel": "lmstudio-qwen",
                "setDefault": false
            }),
        )
        .expect("save lmstudio profile");

    let catalog = backend
        .call_agent_method("agent.models.refresh", json!({ "provider": profile_name }))
        .expect("refresh lmstudio models");
    let model_ids = catalog["models"]
        .as_array()
        .expect("models")
        .iter()
        .filter(|model| model["providerId"].as_str() == Some(profile_name.as_str()))
        .filter_map(|model| model["model"].as_str())
        .collect::<Vec<_>>();

    assert!(model_ids.contains(&"lmstudio-qwen"));
    assert!(model_ids.contains(&"lmstudio-gemma"));
    server.join().expect("server join");
}

#[test]
fn ollama_refresh_discovers_tags() {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind ollama provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().expect("accept ollama tags request");
        let headers = read_http_headers_only(&mut stream);
        assert!(headers.starts_with("get /api/tags "));
        assert!(!headers.contains("authorization:"));
        let body = json!({
            "models": [
                { "name": "llama3.2:latest" },
                { "model": "qwen3:8b" }
            ]
        })
        .to_string();
        write!(
            stream,
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .expect("write ollama tags response");
    });

    let backend = LyraAgentBackend;
    let profile_name = format!("ollama-{}", Uuid::new_v4());
    backend
        .call_agent_method(
            "agent.provider.profile.save",
            json!({
                "profileName": profile_name,
                "routeId": "ollama",
                "baseUrl": format!("http://{addr}"),
                "defaultModel": "llama3.2:latest",
                "setDefault": false
            }),
        )
        .expect("save ollama profile");

    let catalog = backend
        .call_agent_method("agent.models.refresh", json!({ "provider": profile_name }))
        .expect("refresh ollama models");
    let model_ids = catalog["models"]
        .as_array()
        .expect("models")
        .iter()
        .filter(|model| model["providerId"].as_str() == Some(profile_name.as_str()))
        .filter_map(|model| model["model"].as_str())
        .collect::<Vec<_>>();

    assert!(model_ids.contains(&"llama3.2:latest"));
    assert!(model_ids.contains(&"qwen3:8b"));
    server.join().expect("server join");
}

#[test]
fn media_video_tool_reports_xai_polling_progress() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Video Progress Test" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    bind_test_user_message(&session_id, &turn_id);

    let listener = TcpListener::bind("127.0.0.1:0").expect("bind xai video provider");
    let addr = listener.local_addr().expect("local addr");
    let server = thread::spawn(move || {
        for index in 0..5 {
            let Ok((mut stream, _)) = listener.accept() else {
                break;
            };
            // Requests mix POST bodies and bodyless GETs; headers are all the
            // mock needs before replying and closing.
            let _headers = read_http_headers_only(&mut stream);
            if index == 4 {
                // Artifact download: tiny ftyp-prefixed mp4 header.
                let bytes: Vec<u8> = vec![
                    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6D, 0x70, 0x34, 0x32,
                ];
                write!(
                    stream,
                    "HTTP/1.1 200 OK\r\ncontent-type: video/mp4\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                    bytes.len()
                )
                .expect("write video asset header");
                std::io::Write::write_all(&mut stream, &bytes).expect("write video asset bytes");
                continue;
            }
            let body = match index {
                // The create response carries no progress field: no frame yet.
                0 => json!({ "id": "job-1", "status": "queued" }).to_string(),
                1 => json!({ "status": "queued", "progress": 10 }).to_string(),
                2 => json!({ "status": "in_progress", "progress": 55 }).to_string(),
                3 => json!({
                    "status": "completed",
                    "url": format!("http://{addr}/v1/asset/video.mp4")
                })
                .to_string(),
                _ => unreachable!(),
            };
            write!(
                stream,
                "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",
                body.len(),
                body
            )
            .expect("write xai video response");
        }
    });

    let provider_id = format!("test-xai-video-{}", Uuid::new_v4());
    let model_id = "grok-video";
    let events = Arc::new(Mutex::new(Vec::<Value>::new()));
    let events_for_callback = events.clone();
    backend.register_event_callback(Arc::new(move |event| {
        events_for_callback
            .lock()
            .expect("events lock")
            .push(serde_json::from_str(&event).expect("event json"));
    }));
    let (original_config, original_defaults, original_capabilities) = {
        let mut state = state().lock().expect("state lock");
        let original_config = state.config.clone();
        let original_defaults = state.media_model_defaults.clone();
        let original_capabilities = state.model_capabilities.clone();
        state.config.providers.insert(
            provider_id.clone(),
            NativeProviderProfile {
                id: provider_id.clone(),
                label: "Test xAI Video".to_string(),
                route_id: providers::routes::xai::ROUTE_ID.to_string(),
                base_url: Some(format!("http://{addr}/v1")),
                default_model: Some(model_id.to_string()),
                api_key_ref: None,
                api_key: Some("test-key".to_string()),
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: vec![NativeProviderModel {
                    id: model_id.to_string(),
                    label: Some("Grok Video".to_string()),
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
                }],
            },
        );
        state.media_model_defaults.insert(
            "videoGeneration".to_string(),
            NativeModelReference {
                provider_id: provider_id.clone(),
                model_id: model_id.to_string(),
            },
        );
        state
            .model_capabilities
            .entry(provider_id.clone())
            .or_default()
            .entry(model_id.to_string())
            .or_default()
            .detected
            .insert(
                providers::model_capabilities::OPERATION_VIDEO_GENERATION.to_string(),
                CapabilitySupport::Supported,
            );
        (original_config, original_defaults, original_capabilities)
    };

    let result = run_native_tool(
        &session_id,
        &turn_id,
        "media_generate_video",
        "call-video-progress",
        &json!({ "prompt": "a short clip of waves" }),
    );

    backend.clear_event_callback();
    {
        let mut state = state().lock().expect("state lock");
        state.config = original_config;
        state.media_model_defaults = original_defaults;
        state.model_capabilities = original_capabilities;
        let _ = state.save_state();
    }

    result.expect("video tool run");
    let progress_frames = events
        .lock()
        .expect("events lock")
        .iter()
        .filter(|event| {
            event.pointer("/tool/name").and_then(Value::as_str) == Some("media_generate_video")
        })
        .filter_map(|event| event.pointer("/tool/progress").and_then(Value::as_u64))
        .collect::<Vec<_>>();
    assert_eq!(progress_frames, vec![10, 55]);
    server.join().expect("server join");
}

mod catalog_and_images;
mod model_discovery;
mod reasoning_replay;
mod refresh_and_runtime;
mod reply_protocol;
mod steer;

#[test]
fn transient_provider_retry_replays_the_same_request_and_has_a_finite_budget() {
    // Real HTTP responses exercise header parsing, model-loop retry decisions,
    // and the scheduler together. A tiny server-specified wait keeps this test
    // fast while still detecting the old 250/500 ms hardcoded sleep.
    for statuses in [vec![503, 429, 503, 503, 503, 200], vec![503; 6], vec![401]] {
        let created = LyraAgentBackend
            .call_agent_method("agent.session.create", json!({}))
            .unwrap();
        let session_id = created["id"].as_str().unwrap();
        let turn_id = start_test_runtime_turn(session_id);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        let server_statuses = statuses.clone();
        let server = thread::spawn(move || {
            let mut requests = Vec::new();
            for status in server_statuses {
                let deadline = Instant::now() + Duration::from_secs(5);
                let mut stream = loop {
                    match listener.accept() {
                        Ok((stream, _)) => break stream,
                        Err(error)
                            if error.kind() == std::io::ErrorKind::WouldBlock
                                && Instant::now() < deadline =>
                        {
                            thread::sleep(Duration::from_millis(1))
                        }
                        Err(error) => panic!("missing retry request: {error}"),
                    }
                };
                stream
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                requests.push((Instant::now(), read_http_json_body(&mut stream)));
                let body = if status == 200 {
                    json!({"choices": [{"message": {"role": "assistant", "content": "Recovered."}, "finish_reason": "stop"}]})
                } else {
                    json!({"error": {"message": "temporary provider failure"}})
                }.to_string();
                write!(stream, "HTTP/1.1 {status} Test\r\ncontent-type: application/json\r\nretry-after-ms: 10\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len()).unwrap();
            }
            requests
        });
        let provider = NativeProviderProfile {
            id: format!("retry-test-{addr}"),
            label: "Retry Test".into(),
            route_id: "custom_openai_compatible".into(),
            base_url: Some(format!("http://{addr}")),
            default_model: Some("test-model".into()),
            api_key_ref: None,
            api_key: Some("test-key".into()),
            api_key_env: None,
            auth_header: None,
            embedding_model: None,
            models: vec![NativeProviderModel {
                id: "test-model".into(),
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
            }],
        };
        let result = run_model_loop(
            session_id,
            &turn_id,
            ModelRequest {
                capabilities: model_capabilities(&provider, "test-model"),
                provider,
                model: "test-model".into(),
                messages: vec![json!({"role": "user", "content": "hello"})],
                tools: Vec::new(),
                tool_choice: ModelToolChoice::Auto,
                host_dispatcher: None,
                input_downgrades: Vec::new(),
                evidence_refs: Vec::new(),
                token_estimate: 1,
                context_trimmed: false,
            },
            &CancellationToken::new(),
        );
        let requests = server.join().unwrap();
        assert_eq!(requests.len(), statuses.len());
        for pair in requests.windows(2) {
            assert_eq!(
                pair[0].1, pair[1].1,
                "retry must not invent a new user turn"
            );
            assert!(pair[1].0.duration_since(pair[0].0) >= Duration::from_millis(10));
        }
        if statuses.last() == Some(&200) {
            assert_eq!(result.unwrap().final_text.as_deref(), Some("Recovered."));
        } else {
            assert!(matches!(
                result,
                Err(AgentRuntimeError::ProviderFailure { .. })
            ));
        }
    }
}
