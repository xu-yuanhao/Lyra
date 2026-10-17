use super::*;

fn options() -> ProviderContextOptions {
    ProviderContextOptions {
        provider_id: Some("deepseek".into()),
        route_id: Some("deepseek".into()),
        protocol_id: Some("openai_chat_completions".into()),
        model: Some("deepseek-flash".into()),
        ..Default::default()
    }
}

fn stored_log_entry(reasoning: Value) -> Value {
    json!({
        "turnId": "turn-1",
        "messageId": "message-assistant",
        "step": {
            "version": 2,
            "turnId": "turn-1",
            "status": "complete",
            "origin": {"providerId":"deepseek","routeId":"deepseek","protocolId":"openai_chat_completions","model":"deepseek-flash"},
            "assistant": {"content":"answer","toolCalls":[],"reasoning": reasoning},
            "replay": {"protocol":"openai_chat_completions","items":[{"field":"reasoning_content","value":null}]}
        }
    })
}

fn stored_message() -> Value {
    json!({"id":"message-assistant","role":"assistant","text":"answer","reasoningContent":"original thought"})
}

fn build(message: Value, options: ProviderContextOptions) -> ProviderContext {
    ContextBuilder::default().build_provider_context("system".into(), vec![message], options)
}

#[test]
fn reasoning_replay_falls_back_to_the_recorded_step_reasoning() {
    let context = build(
        stored_message(),
        ProviderContextOptions {
            protocol_log: vec![stored_log_entry(json!("original thought"))],
            ..options()
        },
    );
    assert_eq!(context.messages[1]["reasoning_content"], "original thought");
    assert_eq!(
        context.messages[1]["lyraProviderReplay"]["items"][0]["value"],
        "original thought"
    );
    for (field, value) in [
        ("providerId", "other"),
        ("routeId", "other"),
        ("protocolId", "other"),
        ("model", "other"),
    ] {
        let mut log_entry = stored_log_entry(json!("original thought"));
        log_entry["step"]["origin"][field] = json!(value);
        let serialized = serde_json::to_string(
            &build(
                stored_message(),
                ProviderContextOptions {
                    protocol_log: vec![log_entry],
                    ..options()
                },
            )
            .messages,
        )
        .unwrap();
        assert!(
            !serialized.contains("original thought"),
            "origin field {field}"
        );
    }
}

#[test]
fn reasoning_replay_restores_each_step_from_its_own_recorded_reasoning() {
    let tool_step = json!({
        "turnId": "turn-1",
        "messageId": "message-assistant",
        "step": {
            "version": 2,
            "turnId": "turn-1",
            "status": "complete",
            "origin": {"providerId":"deepseek","routeId":"deepseek","protocolId":"openai_chat_completions","model":"deepseek-flash"},
            "assistant": {"content":"","toolCalls":[{"id":"call-a","name":"read_file","arguments":{}}],"reasoning":"tool thought"},
            "toolResults": [{"toolCallId":"call-a","content":"evidence","status":"completed"}],
            "replay": {"protocol":"openai_chat_completions","items":[]}
        }
    });
    let final_step = json!({
        "turnId": "turn-1",
        "messageId": "message-assistant",
        "step": {
            "version": 2,
            "turnId": "turn-1",
            "status": "complete",
            "origin": {"providerId":"deepseek","routeId":"deepseek","protocolId":"openai_chat_completions","model":"deepseek-flash"},
            "assistant": {"content":"answer","toolCalls":[],"reasoning":"final thought"},
            "replay": {"protocol":"openai_chat_completions","items":[]}
        }
    });
    let context = build(
        stored_message(),
        ProviderContextOptions {
            protocol_log: vec![tool_step, final_step],
            ..options()
        },
    );
    assert_eq!(context.messages[1]["reasoning_content"], "tool thought");
    assert_eq!(context.messages[3]["reasoning_content"], "final thought");

    // Without recorded reasoning text nothing is invented from the UI copy.
    let context = build(
        stored_message(),
        ProviderContextOptions {
            protocol_log: vec![stored_log_entry(Value::Null), stored_log_entry(json!(""))],
            ..options()
        },
    );
    let serialized = serde_json::to_string(&context.messages).unwrap();
    assert!(!serialized.contains("original thought"));
}

#[test]
fn reasoning_replay_preserves_empty_native_values_and_never_fabricates_signatures() {
    let mut log_entry = stored_log_entry(Value::Null);
    log_entry["step"]["replay"]["items"][0]["value"] = json!("");
    assert_eq!(
        build(
            stored_message(),
            ProviderContextOptions {
                protocol_log: vec![log_entry.clone()],
                ..options()
            }
        )
        .messages[1]["reasoning_content"],
        ""
    );
    log_entry["step"]["replay"]["items"] = json!([
        {"field":"reasoning","value":"native text"},
        {"field":"reasoning_details","value":[{"type":"reasoning.encrypted","data":"opaque","signature":"sig"}]}
    ]);
    let context = build(
        stored_message(),
        ProviderContextOptions {
            protocol_log: vec![log_entry.clone()],
            ..options()
        },
    );
    assert_eq!(
        context.messages[1]["reasoning_details"][0]["signature"],
        "sig"
    );
    assert_eq!(context.messages[1]["reasoning"], "native text");
    log_entry["step"]["replay"]["items"] = json!([{"field":"reasoning_details","value":null}]);
    assert!(
        build(
            stored_message(),
            ProviderContextOptions {
                protocol_log: vec![log_entry],
                ..options()
            }
        )
        .messages[1]
            .get("reasoning_details")
            .is_none()
    );
}

#[test]
fn reasoning_replay_does_not_relabel_a_foreign_protocol_payload() {
    for protocol in ["anthropic_messages", "openai_responses"] {
        let mut log_entry = stored_log_entry(json!("original thought"));
        log_entry["step"]["replay"]["protocol"] = json!(protocol);
        let context = build(
            stored_message(),
            ProviderContextOptions {
                protocol_log: vec![log_entry],
                ..options()
            },
        );
        assert_eq!(context.messages[1]["content"], "answer");
        assert!(context.messages[1].get("reasoning_content").is_none());
        assert!(context.messages[1].get("lyraProviderReplay").is_none());
    }
}
