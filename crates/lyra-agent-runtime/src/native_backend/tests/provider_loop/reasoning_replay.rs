use super::*;
use crate::context_builder::{ContextBuilder, ProviderContextOptions};

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

#[test]
fn reasoning_replay_deepseek_auto_and_unlisted_models_use_the_same_wire_policy() {
    let mut provider = deepseek_profile("http://127.0.0.1:1");
    let messages = vec![
        json!({"role":"assistant","content":"answer","reasoning_content":" original "}),
        json!({"role":"assistant","content":"No thought was returned.","reasoning_content":null}),
        json!({"role":"assistant","content":"Before thinking was enabled."}),
        json!({"role":"assistant","content":"","tool_calls":[{
            "id":"empty-thought-call","type":"function","function":{"name":"read_file","arguments":"{}"}
        }],"lyraProviderReplay":{"protocol":"openai_chat_completions","items":[
            {"field":"reasoning_content","value":null}
        ]}}),
        json!({"role":"tool","tool_call_id":"empty-thought-call","content":"result"}),
    ];
    for registered in [true, false] {
        if !registered {
            provider.models.clear();
        }
        let sync = build_openai_compatible_request(
            &provider,
            "deepseek-flash",
            &messages,
            &[],
            &ModelToolChoice::Auto,
            false,
        )
        .unwrap()
        .build()
        .unwrap();
        let asynchronous = build_openai_compatible_request_async(
            &provider,
            "deepseek-flash",
            &messages,
            &[],
            &ModelToolChoice::Auto,
            false,
        )
        .unwrap()
        .build()
        .unwrap();
        for body in [
            sync.body().unwrap().as_bytes().unwrap(),
            asynchronous.body().unwrap().as_bytes().unwrap(),
        ] {
            let value: Value = serde_json::from_slice(body).unwrap();
            assert_eq!(value["messages"][0]["reasoning_content"], " original ");
            for index in 1..4 {
                assert_eq!(value["messages"][index]["reasoning_content"], "");
            }
            assert!(value["messages"][4].get("reasoning_content").is_none());
        }
    }
    provider.models.push(NativeProviderModel {
        id: "deepseek-flash".into(),
        reasoning_replay_field: ReasoningReplayField::None,
        ..Default::default()
    });
    let request = build_openai_compatible_request(
        &provider,
        "deepseek-flash",
        &messages,
        &[],
        &ModelToolChoice::Auto,
        false,
    )
    .unwrap()
    .build()
    .unwrap();
    let body: Value = serde_json::from_slice(request.body().unwrap().as_bytes().unwrap()).unwrap();
    assert!(
        body["messages"][0].get("reasoning_content").is_none(),
        "respect explicit opt-out"
    );
}

#[test]
fn reasoning_replay_non_streaming_keeps_all_native_fields_and_skips_null_aliases() {
    let reply = parse_openai_chat_non_streaming_reply(
        &json!({"choices":[{"message":{
            "content":"answer", "reasoning":null, "reasoning_content":"thought",
            "reasoning_details":[{"type":"reasoning.encrypted","data":"opaque","signature":"sig"}]
        }}]}),
        &[],
    )
    .unwrap();
    assert_eq!(reply.reasoning_content.as_deref(), Some("thought"));
    assert_eq!(reply.provider_replay_items.len(), 2);
    let message = json!({"role":"assistant","content":"answer","reasoning_content":"display projection",
        "lyraProviderReplay":{"protocol":"openai_chat_completions","items":reply.provider_replay_items}});
    let wire = openai_chat_completions::wire_messages(
        &[message],
        openai_chat_completions::ReasoningReplayPolicy {
            field: ReasoningReplayField::ReasoningDetails,
            required_on_assistant_messages: false,
        },
    );
    assert_eq!(wire[0]["reasoning_details"][0]["signature"], "sig");
    let text_only = json!({"role":"assistant","content":"answer","reasoning_content":"text"});
    let wire = openai_chat_completions::wire_messages(
        &[text_only],
        openai_chat_completions::ReasoningReplayPolicy {
            field: ReasoningReplayField::ReasoningDetails,
            required_on_assistant_messages: false,
        },
    );
    assert!(
        wire[0].get("reasoning_details").is_none(),
        "text cannot replace opaque details"
    );
}

#[test]
fn reasoning_replay_stream_tool_loop_survives_sqlite_reload_and_automatic_resume() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({"title":"DeepSeek reasoning replay"}),
        )
        .unwrap();
    let session_id = created["id"].as_str().unwrap().to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = mpsc::channel();
    let server = thread::spawn(move || {
        for index in 0..3 {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(10)))
                .unwrap();
            let request = read_http_json_body(&mut stream);
            tx.send(request).unwrap();
            let (mime,body)=match index {
                0 => ("text/event-stream",concat!(
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"Inspect \"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"tabs.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":null,\"tool_calls\":[{\"index\":0,\"id\":\"call-tabs\",\"type\":\"function\",\"function\":{\"name\":\"read_file\",\"arguments\":\"{\\\"path\\\":\\\"/tools/workbench/list_tabs\\\",\\\"args\\\":{}}\"}}]}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":null},\"finish_reason\":\"tool_calls\"}]}\n\ndata: [DONE]\n\n"
                ).to_string()),
                1 => ("text/event-stream",concat!(
                    "data: {\"choices\":[{\"delta\":{\"reasoning_content\":\"Evidence is enough.\"}}]}\n\n",
                    "data: {\"choices\":[{\"delta\":{\"content\":\"Checked tabs.\",\"reasoning_content\":null},\"finish_reason\":\"stop\"}]}\n\ndata: [DONE]\n\n"
                ).to_string()),
                _ => ("application/json",json!({"choices":[{"message":{"content":"Resumed.","reasoning_content":"Continue."},"finish_reason":"stop"}]}).to_string()),
            };
            write!(stream,"HTTP/1.1 200 OK\r\ncontent-type: {mime}\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).unwrap();
        }
    });
    let provider = deepseek_profile(&format!("http://{addr}/v1"));
    let result = run_model_loop(
        &session_id,
        &turn_id,
        ModelRequest {
            provider: provider.clone(),
            model: "deepseek-flash".into(),
            messages: vec![json!({"role":"user","content":"Inspect tabs."})],
            tools: model_tools(),
            tool_choice: ModelToolChoice::Auto,
            host_dispatcher: None,
            capabilities: model_capabilities(&provider, "deepseek-flash"),
            input_downgrades: vec![],
            evidence_refs: vec![],
            token_estimate: 0,
            context_trimmed: false,
        },
        &CancellationToken::new(),
    )
    .unwrap();
    assert_eq!(result.final_text.as_deref(), Some("Checked tabs."));
    flush_state().unwrap();
    let root = state().lock().unwrap().root.clone();
    let saved = super::super::super::session_store::load_session(&root, &session_id)
        .unwrap()
        .unwrap();
    let messages = saved.snapshot["messages"].as_array().unwrap().clone();
    let context = ContextBuilder::default().build_provider_context(
        "system".into(),
        messages,
        ProviderContextOptions {
            protocol_log: saved.provider_protocol_log.clone(),
            provider_id: Some("deepseek".into()),
            route_id: Some("deepseek".into()),
            protocol_id: Some("openai_chat_completions".into()),
            model: Some("deepseek-flash".into()),
            ..Default::default()
        },
    );
    // No new user message: mirrors the worker-completion wakeup that failed.
    let reply = call_model_once_non_streaming(
        &provider,
        "deepseek-flash",
        &context.messages,
        &model_tools(),
    )
    .unwrap();
    assert_eq!(reply.content.as_deref(), Some("Resumed."));
    let requests = rx.try_iter().collect::<Vec<_>>();
    assert_eq!(requests.len(), 3);
    let thoughts = |request: &Value| {
        request["messages"]
            .as_array()
            .unwrap()
            .iter()
            .filter(|message| message["role"] == "assistant")
            .map(|message| {
                message["reasoning_content"]
                    .as_str()
                    .expect("non-null reasoning")
                    .to_string()
            })
            .collect::<Vec<_>>()
    };
    assert_eq!(thoughts(&requests[1]), vec!["Inspect tabs."]);
    assert_eq!(
        thoughts(&requests[2]),
        vec!["Inspect tabs.", "Evidence is enough."]
    );
    server.join().unwrap();
}

#[test]
fn reasoning_replay_preserves_each_max_tokens_segment_in_normal_and_guard_loops() {
    for synthesis in [false, true] {
        let created = LyraAgentBackend
            .call_agent_method(
                "agent.session.create",
                json!({"title":"Reasoning continuation"}),
            )
            .unwrap();
        let session_id = created["id"].as_str().unwrap();
        let turn_id = start_test_runtime_turn(session_id);
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = mpsc::channel();
        let server = thread::spawn(move || {
            for index in 0..2 {
                let (mut stream, _) = listener.accept().unwrap();
                tx.send(read_http_json_body(&mut stream)).unwrap();
                let (text, thought, stop) = if index == 0 {
                    ("First ", "first thought", "length")
                } else {
                    ("second.", "second thought", "stop")
                };
                let body=json!({"choices":[{"message":{"content":text,"reasoning_content":thought},"finish_reason":stop}]}).to_string();
                write!(stream,"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).unwrap();
            }
        });
        let mut provider = deepseek_profile(&format!("http://{addr}"));
        provider.models[0].supports_streaming = false;
        let messages = vec![json!({"role":"user","content":"Continue the answer."})];
        let request = ModelRequest {
            provider: provider.clone(),
            model: "deepseek-flash".into(),
            messages: messages.clone(),
            tools: vec![],
            tool_choice: ModelToolChoice::Auto,
            host_dispatcher: None,
            capabilities: model_capabilities(&provider, "deepseek-flash"),
            input_downgrades: vec![],
            evidence_refs: vec![],
            token_estimate: 0,
            context_trimmed: false,
        };
        let result = if synthesis {
            super::super::super::turn_engine::block_on(synthesize_after_progress_guard_async(
                session_id,
                &turn_id,
                &request,
                messages,
                ModelLoopObservations::default(),
                &CancellationToken::new(),
                "test",
                3,
                false,
            ))
            .unwrap()
        } else {
            run_model_loop(session_id, &turn_id, request, &CancellationToken::new()).unwrap()
        };
        assert_eq!(result.final_text.as_deref(), Some("First second."));
        let requests = rx.try_iter().collect::<Vec<_>>();
        assert!(
            requests[1]["messages"]
                .as_array()
                .unwrap()
                .iter()
                .any(|message| message["reasoning_content"] == "first thought")
        );
        // Replay the committed log the way finish_turn would: anchor the
        // turn's unanchored steps to the final assistant message.
        let mut protocol_log = state()
            .lock()
            .expect("state lock")
            .sessions
            .get(session_id)
            .map(|session| session.provider_protocol_log.clone())
            .unwrap_or_default();
        let replay_message_id = protocol_log
            .iter()
            .rev()
            .find_map(|entry| {
                entry
                    .get("messageId")
                    .and_then(Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(str::to_string)
            })
            .unwrap_or_else(|| "message-final".to_string());
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
        let context = ContextBuilder::default().build_provider_context(
            "system".into(),
            vec![json!({
                "id": replay_message_id,
                "role":"assistant","text":result.final_text
            })],
            ProviderContextOptions {
                protocol_log,
                provider_id: Some("deepseek".into()),
                route_id: Some("deepseek".into()),
                protocol_id: Some("openai_chat_completions".into()),
                model: Some("deepseek-flash".into()),
                ..Default::default()
            },
        );
        let assistants = context
            .messages
            .iter()
            .filter(|message| message["role"] == "assistant")
            .collect::<Vec<_>>();
        assert_eq!(assistants.len(), 2);
        assert_eq!(assistants[0]["content"], "First ");
        assert_eq!(assistants[1]["content"], "second.");
        assert_eq!(assistants[0]["reasoning_content"], "first thought");
        assert_eq!(assistants[1]["reasoning_content"], "second thought");
        server.join().unwrap();
    }
}
