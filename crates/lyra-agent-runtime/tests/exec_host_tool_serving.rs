//! The exec role process serves `agent.exec.run` (see `run_exec_tool`) without
//! any turn state. These tests pin the contract that a forwarded tool call
//! executes there instead of being falsely cancelled by a snapshot mismatch.

use lyra_agent_runtime::run_exec_tool;
use serde_json::{Value, json};
use std::{env, path::PathBuf};

fn isolated_agent_home() -> PathBuf {
    let temporary = tempfile::tempdir().expect("create isolated agent home");
    let path = temporary.keep();
    unsafe {
        env::set_var("LYRA_AGENT_HOME", &path);
    }
    path
}

#[tokio::test]
async fn exec_host_serves_forwarded_tool_without_turn_state() {
    isolated_agent_home();

    let output = run_exec_tool(json!({
        "sessionId": "session-exec-host-regression",
        "turnId": "turn-regression-1",
        "toolCallId": "call-regression-1",
        "toolName": "todo_read",
        "displayName": "todo_read",
        "action": "todo",
        "arguments": {},
        "startedAt": "2026-10-15T00:00:00.000Z"
    }))
    .await;

    let cancelled = output.get("cancelled").and_then(Value::as_bool) == Some(true)
        || output.pointer("/error/code").and_then(Value::as_str) == Some("cancelled");
    assert!(
        !cancelled,
        "forwarded tool call was falsely cancelled: {output}"
    );
    let content = output
        .get("content")
        .and_then(Value::as_str)
        .unwrap_or_default();
    assert!(
        content.contains("Current todos"),
        "todo_read did not execute in the exec host role: {content}"
    );
}
