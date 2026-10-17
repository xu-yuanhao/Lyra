use super::*;
use std::sync::mpsc;

fn deepseek_profile(base_url: &str) -> NativeProviderProfile {
    NativeProviderProfile {
        id: "deepseek".into(),
        label: "DeepSeek".into(),
        route_id: "deepseek".into(),
        base_url: Some(base_url.into()),
        default_model: Some("deepseek-flash".into()),
        api_key: Some("test-key".into()),
        api_key_ref: None,
        api_key_env: None,
        auth_header: None,
        embedding_model: None,
        models: vec![NativeProviderModel {
            id: "deepseek-flash".into(),
            supports_tool_calling: true,
            ..Default::default()
        }],
    }
}

fn steer_model_request(provider: &NativeProviderProfile, messages: Vec<Value>) -> ModelRequest {
    ModelRequest {
        provider: provider.clone(),
        model: "deepseek-flash".into(),
        messages,
        tools: model_tools(),
        tool_choice: ModelToolChoice::Auto,
        host_dispatcher: None,
        capabilities: model_capabilities(provider, "deepseek-flash"),
        input_downgrades: vec![],
        evidence_refs: vec![],
        token_estimate: 0,
        context_trimmed: false,
    }
}

fn write_http_response(stream: &mut std::net::TcpStream, mime: &str, body: &str) {
    write!(
        stream,
        "HTTP/1.1 200 OK\r\ncontent-type: {mime}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",
        body.len()
    )
    .unwrap();
}

// The projection is the shared one, so a steer is doubled on the wire exactly
// like every other user message (RE2 repeat contract).
const STEER_TEXT: &str = "Also mention the footer.";
const STEER_WIRE: &str = "Also mention the footer.\n\nAlso mention the footer.";

#[test]
fn steer_enqueued_mid_turn_is_injected_at_the_next_model_boundary() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({"title":"Steer boundary"}))
        .unwrap();
    let session_id = created["id"].as_str().unwrap().to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = mpsc::channel();
    let steer_session = session_id.clone();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(10)))
                .unwrap();
            let request = read_http_json_body(&mut stream);
            tx.send(request).unwrap();
            if index == 0 {
                // Queue the steer while round 1 is in flight: the drain at
                // the top of the next loop iteration must pick it up.
                crate::native_backend::session_runtime::enqueue_steer(
                    &steer_session,
                    json!({
                        "role": "user",
                        "id": "steer-1",
                        "text": STEER_TEXT,
                        "createdAt": now(),
                    }),
                );
                let body = concat!(
                    "data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call-1\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"/tmp/steer-probe-missing\\\"}\"}}]}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n"
                );
                write_http_response(&mut stream, "text/event-stream", body);
            } else {
                let body = concat!(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Done, footer noted.\"},\"finish_reason\":\"stop\"}]}\n\n",
                    "data: [DONE]\n\n"
                );
                write_http_response(&mut stream, "text/event-stream", body);
            }
        }
    });
    let provider = deepseek_profile(&format!("http://{addr}/v1"));
    let result = run_model_loop(
        &session_id,
        &turn_id,
        steer_model_request(
            &provider,
            vec![json!({"role":"user","content":"Check the header."})],
        ),
        &CancellationToken::new(),
    )
    .unwrap();
    assert_eq!(result.final_text.as_deref(), Some("Done, footer noted."));
    let requests = rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    let round_two = requests[1]["messages"].as_array().unwrap();
    let last = round_two.last().unwrap();
    assert_eq!(last["role"], "user");
    assert_eq!(last["content"], STEER_WIRE);
    // The tool result of round 1 sits right before the steer: the model sees
    // the same wire it would have seen if the user had typed after the tool.
    assert_eq!(round_two[round_two.len() - 2]["role"], "tool");
    // Delivered exactly once — no double injection.
    assert_eq!(
        round_two
            .iter()
            .filter(|message| message["content"] == STEER_WIRE)
            .count(),
        1
    );
    assert_eq!(
        crate::native_backend::session_runtime::pending_steer_count(&session_id),
        0
    );
    server.join().unwrap();
}

#[test]
fn steer_during_final_response_continues_the_same_turn() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({"title":"Steer final race"}))
        .unwrap();
    let session_id = created["id"].as_str().unwrap().to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = mpsc::channel();
    let steer_session = session_id.clone();
    let server = thread::spawn(move || {
        for index in 0..2 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(10)))
                .unwrap();
            let request = read_http_json_body(&mut stream);
            tx.send(request).unwrap();
            if index == 0 {
                // Arrives while the final response is streaming — too late
                // for boundary 1, so boundary 2 (finalize drain) must take it.
                crate::native_backend::session_runtime::enqueue_steer(
                    &steer_session,
                    json!({
                        "role": "user",
                        "id": "steer-2",
                        "text": STEER_TEXT,
                        "createdAt": now(),
                    }),
                );
                let body = concat!(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Final one.\"},\"finish_reason\":\"stop\"}]}\n\n",
                    "data: [DONE]\n\n"
                );
                write_http_response(&mut stream, "text/event-stream", body);
            } else {
                let body = concat!(
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Final two.\"},\"finish_reason\":\"stop\"}]}\n\n",
                    "data: [DONE]\n\n"
                );
                write_http_response(&mut stream, "text/event-stream", body);
            }
        }
    });
    let provider = deepseek_profile(&format!("http://{addr}"));
    let result = run_model_loop(
        &session_id,
        &turn_id,
        steer_model_request(
            &provider,
            vec![json!({"role":"user","content":"Check the header."})],
        ),
        &CancellationToken::new(),
    )
    .unwrap();
    assert_eq!(result.final_text.as_deref(), Some("Final two."));
    let requests = rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 2);
    let round_two = requests[1]["messages"].as_array().unwrap();
    assert_eq!(round_two.len(), 3);
    assert_eq!(round_two[1]["role"], "assistant");
    assert_eq!(round_two[1]["content"], "Final one.");
    assert_eq!(round_two[2]["role"], "user");
    assert_eq!(round_two[2]["content"], STEER_WIRE);
    assert_eq!(
        crate::native_backend::session_runtime::pending_steer_count(&session_id),
        0
    );
    server.join().unwrap();
}

#[test]
fn send_turn_while_running_steers_instead_of_interrupting() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method("agent.session.create", json!({"title":"Steer send path"}))
        .unwrap();
    let session_id = created["id"].as_str().unwrap().to_string();
    let live_turn_id = start_test_runtime_turn(&session_id);
    let response = backend
        .call_agent_method(
            "agent.turn.send",
            json!({"sessionId": session_id, "text": STEER_TEXT}),
        )
        .unwrap();
    // Same turn keeps owning the session; nothing was cancelled.
    assert_eq!(response["status"], "steered");
    assert_eq!(response["turnId"], live_turn_id.as_str());
    assert_eq!(
        crate::native_backend::session_runtime::pending_steer_count(&session_id),
        1
    );
    let state = state().lock().unwrap();
    let session = state.sessions.get(&session_id).unwrap();
    assert_eq!(session.snapshot["turnStatus"], "running");
    let messages = session.snapshot["messages"].as_array().unwrap();
    let last = messages.last().unwrap();
    assert_eq!(last["role"], "user");
    assert_eq!(last["text"], STEER_TEXT);
    // The steered message is a plain transcript citizen: no rollback
    // checkpoint, no title rewrite.
    assert_eq!(last["rollback"]["available"], false);
    assert_eq!(session.runtime_turns.len(), 1);
}

#[test]
fn finish_turn_delivers_leftover_steers_and_cancel_drops_them() {
    let backend = LyraAgentBackend;
    // Cancelled: abort clears the queue.
    let created = backend
        .call_agent_method("agent.session.create", json!({"title":"Steer cancel"}))
        .unwrap();
    let session_id = created["id"].as_str().unwrap().to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    crate::native_backend::session_runtime::enqueue_steer(
        &session_id,
        json!({"role":"user","id":"steer-3","text":STEER_TEXT,"createdAt":now()}),
    );
    finish_turn_with_metadata_for_message(
        &session_id,
        &turn_id,
        "cancelled",
        None,
        None,
        None,
        None,
        None,
    );
    assert_eq!(
        crate::native_backend::session_runtime::pending_steer_count(&session_id),
        0
    );
    // Finished: a continuation turn picks the queue up.
    let created = backend
        .call_agent_method("agent.session.create", json!({"title":"Steer leftover"}))
        .unwrap();
    let session_id = created["id"].as_str().unwrap().to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    crate::native_backend::session_runtime::enqueue_steer(
        &session_id,
        json!({"role":"user","id":"steer-4","text":STEER_TEXT,"createdAt":now()}),
    );
    let turns_before = {
        let state = state().lock().unwrap();
        state.sessions.get(&session_id).unwrap().runtime_turns.len()
    };
    finish_turn_with_metadata_for_message(
        &session_id,
        &turn_id,
        "finished",
        None,
        None,
        None,
        None,
        None,
    );
    // Drained inside the same critical section that ended the turn, so no
    // later turn can double-include the queued messages.
    assert_eq!(
        crate::native_backend::session_runtime::pending_steer_count(&session_id),
        0
    );
    let turns_after = {
        let state = state().lock().unwrap();
        state.sessions.get(&session_id).unwrap().runtime_turns.len()
    };
    assert!(turns_after > turns_before, "continuation turn spawned");
}
