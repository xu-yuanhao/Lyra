use super::*;

fn profile(addr: std::net::SocketAddr, streaming: bool) -> NativeProviderProfile {
    serde_json::from_value(json!({
        "id":format!("recovery-{addr}"), "label":"Test", "routeId":"custom_openai_compatible",
        "baseUrl":format!("http://{addr}"), "apiKey":"fixture", "defaultModel":"test",
        "models":[{"id":"test", "supportsStreaming":streaming, "supportsToolCalling":false}]
    }))
    .unwrap()
}

#[test]
fn non_streaming_cancel_drops_header_and_body_waits_immediately() {
    for send_headers in [false, true] {
        let created = LyraAgentBackend
            .call_agent_method("agent.session.create", json!({}))
            .unwrap();
        let session = created["id"].as_str().unwrap();
        let turn = start_test_runtime_turn(session);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let provider = profile(listener.local_addr().unwrap(), false);
        let cancellation = CancellationToken::new();
        let cancel = cancellation.clone();
        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let _ = read_http_json_body(&mut stream);
            if send_headers {
                write!(stream, "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: 1000\r\n\r\n{{").unwrap();
            }
            cancel.cancel();
            stream
                .set_read_timeout(Some(Duration::from_secs(2)))
                .unwrap();
            let mut byte = [0; 1];
            assert_eq!(
                stream.read(&mut byte).unwrap(),
                0,
                "cancellation must close the HTTP request"
            );
        });
        let start = Instant::now();
        let result = turn_engine::block_on(call_model_once_non_streaming_checked_async(
            session,
            &turn,
            &provider,
            "test",
            &[json!({"role":"user", "content":"hello"})],
            &[],
            &ModelToolChoice::Auto,
            &cancellation,
        ));
        assert!(matches!(result, Err(AgentRuntimeError::Cancelled)));
        assert!(start.elapsed() < Duration::from_secs(2));
        server.join().unwrap();
    }
}

#[test]
fn interrupted_stream_continuation_includes_prefix_in_the_actual_request() {
    let created = LyraAgentBackend
        .call_agent_method("agent.session.create", json!({}))
        .unwrap();
    let session = created["id"].as_str().unwrap();
    let turn = start_test_runtime_turn(session);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let provider = profile(listener.local_addr().unwrap(), true);
    let server = thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let first = read_http_json_body(&mut stream);
        assert_eq!(first["stream"], true);
        let body = "data: {\"choices\":[{\"delta\":{\"content\":\"Recorded prefix. \"}}]}\n\n";
        write!(stream, "HTTP/1.1 200 OK\r\ncontent-type: text/event-stream\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len()+1000).unwrap();
        drop(stream);
        let (mut stream, _) = listener.accept().unwrap();
        let continuation = read_http_json_body(&mut stream);
        assert_eq!(continuation["stream"], false);
        let messages = continuation["messages"].as_array().unwrap();
        assert_eq!(messages[messages.len() - 2]["role"], "assistant");
        assert_eq!(messages[messages.len() - 2]["content"], "Recorded prefix. ");
        let body = json!({"choices":[{"message":{"role":"assistant", "content":"Completed suffix."}, "finish_reason":"stop"}]}).to_string();
        write!(stream, "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}", body.len()).unwrap();
    });
    let reply = turn_engine::block_on(call_model_once_for_loop_async(
        session,
        &turn,
        &provider,
        "test",
        &[json!({"role":"user", "content":"hello"})],
        &[],
        &ModelToolChoice::Auto,
        &model_capabilities(&provider, "test"),
        &CancellationToken::new(),
        true,
    ))
    .unwrap();
    assert_eq!(
        reply.content.as_deref(),
        Some("Recorded prefix. Completed suffix.")
    );
    let state = state().lock().unwrap();
    let messages = state.sessions.get(session).unwrap().snapshot["messages"]
        .as_array()
        .unwrap();
    let visible = messages
        .iter()
        .filter(|message| {
            message["role"] == "assistant"
                && message["text"]
                    .as_str()
                    .is_some_and(|text| !text.is_empty())
        })
        .collect::<Vec<_>>();
    assert_eq!(visible.len(), 1);
    assert_eq!(visible[0]["text"], "Recorded prefix. Completed suffix.");
    drop(state);
    server.join().unwrap();
}

#[test]
fn bare_json_and_planning_phrases_never_become_executable_tools() {
    let tools = [json!({"type":"function", "function":{"name":"exec_command"}})];
    for content in [
        "I will explain: {\"command\":\"rm -rf example\"}",
        "Example:\n```json\n{\"name\":\"exec_command\",\"arguments\":{\"command\":\"example\"}}\n```",
    ] {
        let mut reply = ModelReply {
            content: Some(content.into()),
            stop_signal: TurnStopSignal::EndTurn,
            ..Default::default()
        };
        normalize_model_reply_protocol(&mut reply, &tools).unwrap();
        assert!(reply.tool_calls.is_empty());
        assert_eq!(reply.content.as_deref(), Some(content));
        assert!(reply.reasoning_content.is_none());
    }
}
