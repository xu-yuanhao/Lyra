use super::*;

#[test]
fn textual_tool_call_is_rejected_before_assistant_text_commit() {
    let mut reply = ModelReply {
        content: Some(
            "好的，我来帮你在工作区打开。\n\n[Tool call: software_invoke_capability({\"softwareId\":\"browser-search\",\"capabilityId\":\"browser-search.openUrl\",\"input\":{\"url\":\"https://vimeo.com/1148303712\"}})]"
                .to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: None,
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: Default::default(),
    };

    let error = normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect_err("textual tool calls must be rejected");
    assert!(error.to_string().contains("textual tool"));
}

#[test]
fn textual_tool_result_ref_is_rejected_before_assistant_text_commit() {
    let mut reply = ModelReply {
        content: Some(
            "让我搜索一下黑盒安全测试相关的开源项目。 [Tool result ref: call_2eddf41e08cf48b88bb7bc80]"
                .to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: None,
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: Default::default(),
    };

    let error = normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect_err("tool result ref placeholders must be rejected");
    assert!(error.to_string().contains("textual tool protocol leak"));
}

#[test]
fn visible_tool_preamble_without_native_tool_signal_is_not_reclassified() {
    let mut reply = ModelReply {
        content: Some("让我搜索一下黑盒安全测试相关的开源项目。".to_string()),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: None,
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: Default::default(),
    };

    normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect("visible prose alone must not infer provider tool intent");
    assert_eq!(
        reply.content.as_deref(),
        Some("让我搜索一下黑盒安全测试相关的开源项目。")
    );
}

#[test]
fn markdown_json_tool_call_example_remains_inert_text() {
    let mut reply = ModelReply {
        content: Some(
            r#"I will run this:

```json
{"path":"/tools/web/search","args":{"query":"Lyra"}}
```
"#
            .to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: None,
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: Default::default(),
    };

    let original = reply.content.clone();
    normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect("text examples have no executable authority");
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.content.as_deref(), original.as_deref().map(str::trim));
}

#[test]
fn textual_function_call_example_remains_inert_text() {
    let mut reply = ModelReply {
        content: Some(
            "tool_fs_run({\"path\":\"/tools/workbench/list_tabs\",\"args\":{}})".to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: None,
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: Default::default(),
    };

    let original = reply.content.clone();
    normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect("text examples have no executable authority");
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.content.as_deref(), original.as_deref().map(str::trim));
}

#[test]
fn leaked_xml_tool_calls_are_removed_without_execution() {
    let mut reply = ModelReply {
        content: Some(
            r#"好的，让我先看看目录。

<tool_calls>
<invoke name="exec_command">
<parameter name="command">ls -la /Users/petehsu/Documents/Lyra</parameter>
</invoke>
</tool_calls>
"#
            .to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: Some("stop".to_string()),
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: TurnStopSignal::EndTurn,
    };

    normalize_model_reply_protocol(&mut reply, &model_tools()).expect("markup is display-only");
    assert_eq!(reply.content.as_deref(), Some("好的，让我先看看目录。"));
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.stop_signal, TurnStopSignal::EndTurn);
}

#[test]
fn leaked_dsml_tool_calls_are_removed_without_execution() {
    let mut reply = ModelReply {
        content: Some(
            r#"先看看目录结构和关键文件。

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="exec_command">
<｜｜DSML｜｜parameter name="command">ls -la /Users/petehsu/Documents/Lyra</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
<｜｜DSML｜｜invoke name="glob">
<｜｜DSML｜｜parameter name="pattern">*</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="path">/Users/petehsu/Documents/Lyra</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>
"#
            .to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: Some("stop".to_string()),
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: TurnStopSignal::EndTurn,
    };

    normalize_model_reply_protocol(&mut reply, &model_tools()).expect("markup is display-only");
    assert_eq!(reply.content.as_deref(), Some("先看看目录结构和关键文件。"));
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.stop_signal, TurnStopSignal::EndTurn);
}

#[test]
fn textual_function_call_example_remains_inert_without_advertised_tools() {
    let mut reply = ModelReply {
        content: Some(
            "tool_fs_run({\"path\":\"/tools/workbench/list_tabs\",\"args\":{}})".to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: None,
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: Default::default(),
    };

    let original = reply.content.clone();
    normalize_model_reply_protocol(&mut reply, &[])
        .expect("text examples have no executable authority");
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.content.as_deref(), original.as_deref().map(str::trim));
}

#[test]
fn trailing_path_pattern_example_preserves_prose_without_execution() {
    let mut reply = ModelReply {
        content: Some(
            r#"Let's search for "description" in Cargo.toml.{"path":"~/Documents/Lyra/Cargo.toml","pattern":"description"}"#
                .to_string(),
        ),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: Some("stop".to_string()),
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: TurnStopSignal::EndTurn,
    };

    let original = reply.content.clone();
    normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect("text examples have no executable authority");
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.content.as_deref(), original.as_deref().map(str::trim));
}

#[test]
fn trailing_tool_fs_json_remains_inert_text() {
    let mut reply = ModelReply {
        content: Some(r#"{"path":"/tools/web/search","args":{"query":"Lyra"}}"#.to_string()),
        reasoning_content: None,
        tool_calls: Vec::new(),
        ui_message_id: None,
        raw_stop_reason: Some("stop".to_string()),
        provider_replay_protocol: None,
        provider_replay_items: Vec::new(),
        response_meta: Default::default(),
        stop_signal: TurnStopSignal::EndTurn,
    };

    let original = reply.content.clone();
    normalize_model_reply_protocol(&mut reply, &model_tools())
        .expect("text examples have no executable authority");
    assert!(reply.tool_calls.is_empty());
    assert!(reply.reasoning_content.is_none());
    assert_eq!(reply.content.as_deref(), original.as_deref().map(str::trim));
}
