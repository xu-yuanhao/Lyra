use super::*;

pub(crate) const APPLY_PATCH_MODEL_TOOL: &str = "apply_patch";
pub(crate) const READ_FILE_MODEL_TOOL: &str = "read_file";
pub(crate) const GREP_MODEL_TOOL: &str = "grep";
pub(crate) const GLOB_MODEL_TOOL: &str = "glob";
pub(crate) const EDIT_FILE_MODEL_TOOL: &str = "edit_file";
pub(crate) const WRITE_FILE_MODEL_TOOL: &str = "write_file";
pub(crate) const EXEC_COMMAND_MODEL_TOOL: &str = "exec_command";
pub(crate) const WRITE_STDIN_MODEL_TOOL: &str = "write_stdin";
pub(crate) const PLAN_BEGIN_MODEL_TOOL: &str = "plan_begin";
pub(crate) const PLAN_WRITE_MODEL_TOOL: &str = "plan_write";
pub(crate) const PLAN_FINALIZE_MODEL_TOOL: &str = "plan_finalize";
pub(crate) const PLAN_REVISE_MODEL_TOOL: &str = "plan_revise";
/// Legacy overloaded Plan tool kept only for replaying historical sessions.
pub(crate) const UPDATE_PLAN_MODEL_TOOL: &str = "update_plan";
pub(crate) const TODO_WRITE_MODEL_TOOL: &str = "todo_write";
pub(crate) const TODO_UPDATE_MODEL_TOOL: &str = "todo_update";
pub(crate) const TODO_FINISH_MODEL_TOOL: &str = "todo_finish";
pub(crate) const AGENT_SPAWN_MODEL_TOOL: &str = "Agent";
pub(crate) const LSP_QUERY_MODEL_TOOL: &str = "lsp_query";

pub(crate) fn risk_identifier_mutates(risk: &str) -> bool {
    !risk.trim().eq_ignore_ascii_case("read")
}

pub(crate) async fn run_exec_tool(payload: Value) -> Value {
    let text = |key: &str| {
        payload
            .get(key)
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string()
    };
    let arguments = payload.get("arguments").cloned().unwrap_or(Value::Null);
    // Served by the exec role process, which holds no turn state: the agent
    // host already gated cancellation before forwarding, so the forwarded
    // token is the only cancellation authority here.
    native_executor::execute_native_tool_adapter_with_runtime(
        &text("sessionId"),
        &text("turnId"),
        &CancellationToken::new(),
        &text("toolCallId"),
        &text("toolName"),
        &text("displayName"),
        &text("action"),
        arguments,
        &text("startedAt"),
        None,
        ToolExecutionRuntime::default(),
        false,
    )
    .await
}

mod artifact;
mod artifacts;
mod browser_adapter;
mod browser_concurrency;
mod clarification_adapter;
mod design_quality;
mod design_reference;
mod dispatcher;
mod file;
mod host_executor;
mod image_read;
mod lsp;
mod mcp_adapter;
mod media;
mod memory_adapter;
mod native_executor;
mod native_helpers;
mod page_snapshot;
mod permission_policy;
mod plan;
mod quality_gate;
mod search;
mod shell;
mod shell_kind;
mod shell_secrets;
mod skill_adapter;
mod software_adapter;
mod streaming_diff_preview;
mod terminal;
mod timeouts;
mod todo;
pub(crate) mod tool_fs;
pub(crate) mod tool_search;
mod user_action;
mod web;
mod web_jobs;
mod web_summary;
mod workbench_adapter;

pub(crate) use self::{
    artifact::*, artifacts::*, browser_adapter::*, browser_concurrency::*,
    clarification_adapter::*, design_quality::*, design_reference::*, dispatcher::*, file::*,
    host_executor::*, lsp::*, mcp_adapter::*, media::*, memory_adapter::*, native_executor::*,
    native_helpers::*, page_snapshot::*, permission_policy::*, plan::*, quality_gate::*, search::*,
    shell::*, shell_kind::*, skill_adapter::*, software_adapter::*, streaming_diff_preview::*,
    terminal::*, timeouts::*, todo::*, tool_search::*, user_action::*, web::*, web_jobs::*,
    workbench_adapter::*,
};

#[cfg(test)]
mod risk_identifier_tests {
    use super::risk_identifier_mutates;

    #[test]
    fn only_exact_read_is_non_mutating() {
        assert!(!risk_identifier_mutates("read"));
        assert!(!risk_identifier_mutates(" READ "));
        assert!(risk_identifier_mutates("readonly"));
        assert!(risk_identifier_mutates("metadata_read"));
        assert!(risk_identifier_mutates("unknown"));
    }
}
