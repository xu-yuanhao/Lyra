use serde::Serialize;
use serde_json::Value;

/// Strongly-typed agent runtime event enum.
///
/// Every variant serializes to `{"kind": "<camelCase>", ...}` via serde's
/// internal tag, matching the wire format that `native_backend/activity.rs`
/// already emits through hand-written `json!({...})` calls.
///
/// Complex payload fields (`snapshot`, `message`, `tool`, `plan`, etc.) use
/// `serde_json::Value` for now — later phases can narrow them to concrete structs.
///
/// `ProviderProtocol_event` is Rust-only: the TS `AgentRuntimeEvent` union does
/// not include it. The ceiling is the TS side silently dropping it; the upgrade
/// path is adding it to the TS union if the UI ever needs it.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AgentEvent {
    #[serde(rename_all = "camelCase")]
    SessionSnapshot { snapshot: Value },
    #[serde(rename_all = "camelCase")]
    MessageCommitted { session_id: String, message: Value },
    #[serde(rename_all = "camelCase")]
    MessageRemoved {
        session_id: String,
        message_id: String,
    },
    #[serde(rename_all = "camelCase")]
    MessageDelta {
        session_id: String,
        message_id: String,
        block_id: Option<String>,
        replace: Option<bool>,
        delta: String,
    },
    #[serde(rename_all = "camelCase")]
    MessageReasoningDelta {
        session_id: String,
        message_id: String,
        delta: String,
    },
    #[serde(rename_all = "camelCase")]
    ToolStarted {
        session_id: String,
        message_id: Option<String>,
        tool: Value,
    },
    #[serde(rename_all = "camelCase")]
    ToolFinished {
        session_id: String,
        message_id: Option<String>,
        tool: Value,
    },
    #[serde(rename_all = "camelCase")]
    ToolUpdated {
        session_id: String,
        turn_id: String,
        tool: Value,
    },
    #[serde(rename_all = "camelCase")]
    MemoryUpdated { session_id: String, snapshot: Value },
    #[serde(rename_all = "camelCase")]
    TurnStarted {
        session_id: String,
        turn_id: String,
        state: String,
        reason: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TurnStateChanged {
        session_id: String,
        turn_id: String,
        state: String,
        reason: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TurnCompleted { session_id: String, turn_id: String },
    #[serde(rename_all = "camelCase")]
    TurnFinished {
        session_id: String,
        turn_id: String,
        status: String,
    },
    #[serde(rename_all = "camelCase")]
    TurnFailed {
        session_id: String,
        turn_id: String,
        message: String,
        failure_kind: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    TurnInterrupted {
        session_id: String,
        turn_id: String,
        reason: String,
    },
    #[serde(rename_all = "camelCase")]
    TurnRecovered { session_id: String, turn_id: String },
    #[serde(rename_all = "camelCase")]
    ContextTrimmed { session_id: String, detail: Value },
    #[serde(rename_all = "camelCase")]
    ContextCompressionProgress {
        session_id: String,
        status: String,
        token_before: Option<u64>,
        token_after: Option<u64>,
    },
    #[serde(rename_all = "camelCase")]
    TodoUpdated { session_id: String, todos: Value },
    #[serde(rename_all = "camelCase")]
    ProjectTodoUpdated { session_id: String, todo: Value },
    #[serde(rename_all = "camelCase")]
    PlanUpdated { session_id: String, plan: Value },
    #[serde(rename_all = "camelCase")]
    PlanReviewRequested { session_id: String, plan: Value },
    #[serde(rename_all = "camelCase")]
    PlanReviewResolved {
        session_id: String,
        plan_id: Option<String>,
        resolution: String,
    },
    #[serde(rename_all = "camelCase")]
    ClarificationRequested {
        session_id: String,
        clarification_id: String,
        question: String,
        i18n_key: Option<String>,
        options: Option<Value>,
        allow_custom_answer: bool,
        detail: Option<String>,
        detail_i18n_key: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    ClarificationResolved {
        session_id: String,
        clarification_id: String,
    },
    #[serde(rename_all = "camelCase")]
    BrowserActivityChanged {
        session_id: String,
        turn_id: String,
        target: Value,
    },
    #[serde(rename_all = "camelCase")]
    PermissionRequested {
        session_id: String,
        permission_id: String,
        title: String,
        detail: String,
    },
    #[serde(rename_all = "camelCase")]
    UserGateRequested { session_id: String, gate: Value },
    #[serde(rename_all = "camelCase")]
    UserGateResolved {
        session_id: String,
        gate_id: String,
        gate_kind: String,
        resolve_source: String,
    },
    #[serde(rename_all = "camelCase")]
    FollowStateChanged { session_id: String, follow: Value },
    #[serde(rename_all = "camelCase")]
    SubagentStarted { session_id: String, subagent: Value },
    #[serde(rename_all = "camelCase")]
    ProviderFault {
        session_id: String,
        turn_id: String,
        fault: Value,
    },
    #[serde(rename_all = "camelCase")]
    RollbackStarted {
        session_id: String,
        message_id: String,
    },
    #[serde(rename_all = "camelCase")]
    RollbackFinished {
        session_id: String,
        message_id: String,
        removed_message_count: u64,
        removed_tool_count: u64,
        restored_file_count: u64,
    },
    #[serde(rename_all = "camelCase")]
    RollbackFailed {
        session_id: String,
        message_id: String,
        message: String,
    },
    /// Rust-internal event; not exposed in the TS `AgentRuntimeEvent` union.
    /// ponytail: ceiling = TS side drops this event; upgrade path = add to TS union if UI needs it.
    #[doc(hidden)]
    #[serde(rename_all = "camelCase")]
    ProviderProtocolEvent {
        session_id: String,
        turn_id: String,
        detail: Value,
    },
}

/// All kind strings that the TS `AgentRuntimeEvent` union defines.
///
/// This is the single source of truth for the alignment test — update it
/// when the TS union changes.
pub const TS_UNION_KINDS: &[&str] = &[
    "sessionSnapshot",
    "messageCommitted",
    "messageRemoved",
    "messageDelta",
    "messageReasoningDelta",
    "toolStarted",
    "toolFinished",
    "memoryUpdated",
    "turnStarted",
    "turnStateChanged",
    "toolUpdated",
    "contextTrimmed",
    "turnRecovered",
    "turnCompleted",
    "todoUpdated",
    "planUpdated",
    "planReviewRequested",
    "planReviewResolved",
    "projectTodoUpdated",
    "clarificationRequested",
    "clarificationResolved",
    "browserActivityChanged",
    "permissionRequested",
    "userGateRequested",
    "userGateResolved",
    "turnFinished",
    "turnFailed",
    "providerFault",
    "turnInterrupted",
    "followStateChanged",
    "subagentStarted",
    "rollbackStarted",
    "rollbackFinished",
    "rollbackFailed",
    "contextCompressionProgress",
];

/// Kind strings that exist in the Rust enum but are intentionally absent
/// from the TS union.
pub const RUST_ONLY_KINDS: &[&str] = &["providerProtocolEvent"];

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn all_variants_serialize_with_expected_kind() {
        let cases: Vec<(AgentEvent, &str)> = vec![
            (
                AgentEvent::SessionSnapshot {
                    snapshot: json!({}),
                },
                "sessionSnapshot",
            ),
            (
                AgentEvent::MessageCommitted {
                    session_id: "s".into(),
                    message: json!({}),
                },
                "messageCommitted",
            ),
            (
                AgentEvent::MessageDelta {
                    session_id: "s".into(),
                    message_id: "m".into(),
                    block_id: None,
                    replace: None,
                    delta: "d".into(),
                },
                "messageDelta",
            ),
            (
                AgentEvent::MessageReasoningDelta {
                    session_id: "s".into(),
                    message_id: "m".into(),
                    delta: "d".into(),
                },
                "messageReasoningDelta",
            ),
            (
                AgentEvent::ToolStarted {
                    session_id: "s".into(),
                    message_id: None,
                    tool: json!({}),
                },
                "toolStarted",
            ),
            (
                AgentEvent::ToolFinished {
                    session_id: "s".into(),
                    message_id: None,
                    tool: json!({}),
                },
                "toolFinished",
            ),
            (
                AgentEvent::ToolUpdated {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    tool: json!({}),
                },
                "toolUpdated",
            ),
            (
                AgentEvent::MemoryUpdated {
                    session_id: "s".into(),
                    snapshot: json!({}),
                },
                "memoryUpdated",
            ),
            (
                AgentEvent::TurnStarted {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    state: "running".into(),
                    reason: None,
                },
                "turnStarted",
            ),
            (
                AgentEvent::TurnStateChanged {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    state: "running".into(),
                    reason: None,
                },
                "turnStateChanged",
            ),
            (
                AgentEvent::TurnCompleted {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                },
                "turnCompleted",
            ),
            (
                AgentEvent::TurnFinished {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    status: "ok".into(),
                },
                "turnFinished",
            ),
            (
                AgentEvent::TurnFailed {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    message: "err".into(),
                    failure_kind: None,
                },
                "turnFailed",
            ),
            (
                AgentEvent::TurnInterrupted {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    reason: "cancel".into(),
                },
                "turnInterrupted",
            ),
            (
                AgentEvent::TurnRecovered {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                },
                "turnRecovered",
            ),
            (
                AgentEvent::ContextTrimmed {
                    session_id: "s".into(),
                    detail: json!({}),
                },
                "contextTrimmed",
            ),
            (
                AgentEvent::ContextCompressionProgress {
                    session_id: "s".into(),
                    status: "started".into(),
                    token_before: None,
                    token_after: None,
                },
                "contextCompressionProgress",
            ),
            (
                AgentEvent::TodoUpdated {
                    session_id: "s".into(),
                    todos: json!([]),
                },
                "todoUpdated",
            ),
            (
                AgentEvent::ProjectTodoUpdated {
                    session_id: "s".into(),
                    todo: json!({}),
                },
                "projectTodoUpdated",
            ),
            (
                AgentEvent::PlanUpdated {
                    session_id: "s".into(),
                    plan: json!({}),
                },
                "planUpdated",
            ),
            (
                AgentEvent::PlanReviewRequested {
                    session_id: "s".into(),
                    plan: json!({}),
                },
                "planReviewRequested",
            ),
            (
                AgentEvent::PlanReviewResolved {
                    session_id: "s".into(),
                    plan_id: None,
                    resolution: "approved".into(),
                },
                "planReviewResolved",
            ),
            (
                AgentEvent::ClarificationRequested {
                    session_id: "s".into(),
                    clarification_id: "c".into(),
                    question: "q".into(),
                    i18n_key: None,
                    options: None,
                    allow_custom_answer: false,
                    detail: None,
                    detail_i18n_key: None,
                },
                "clarificationRequested",
            ),
            (
                AgentEvent::ClarificationResolved {
                    session_id: "s".into(),
                    clarification_id: "c".into(),
                },
                "clarificationResolved",
            ),
            (
                AgentEvent::BrowserActivityChanged {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    target: json!({}),
                },
                "browserActivityChanged",
            ),
            (
                AgentEvent::PermissionRequested {
                    session_id: "s".into(),
                    permission_id: "p".into(),
                    title: "t".into(),
                    detail: "d".into(),
                },
                "permissionRequested",
            ),
            (
                AgentEvent::UserGateRequested {
                    session_id: "s".into(),
                    gate: json!({}),
                },
                "userGateRequested",
            ),
            (
                AgentEvent::UserGateResolved {
                    session_id: "s".into(),
                    gate_id: "g".into(),
                    gate_kind: "clarification".into(),
                    resolve_source: "user".into(),
                },
                "userGateResolved",
            ),
            (
                AgentEvent::FollowStateChanged {
                    session_id: "s".into(),
                    follow: json!({}),
                },
                "followStateChanged",
            ),
            (
                AgentEvent::MessageRemoved {
                    session_id: "s".into(),
                    message_id: "m".into(),
                },
                "messageRemoved",
            ),
            (
                AgentEvent::SubagentStarted {
                    session_id: "s".into(),
                    subagent: json!({}),
                },
                "subagentStarted",
            ),
            (
                AgentEvent::ProviderFault {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    fault: json!({}),
                },
                "providerFault",
            ),
            (
                AgentEvent::RollbackStarted {
                    session_id: "s".into(),
                    message_id: "m".into(),
                },
                "rollbackStarted",
            ),
            (
                AgentEvent::RollbackFinished {
                    session_id: "s".into(),
                    message_id: "m".into(),
                    removed_message_count: 1,
                    removed_tool_count: 2,
                    restored_file_count: 3,
                },
                "rollbackFinished",
            ),
            (
                AgentEvent::RollbackFailed {
                    session_id: "s".into(),
                    message_id: "m".into(),
                    message: "err".into(),
                },
                "rollbackFailed",
            ),
            (
                AgentEvent::ProviderProtocolEvent {
                    session_id: "s".into(),
                    turn_id: "t".into(),
                    detail: json!({}),
                },
                "providerProtocolEvent",
            ),
        ];

        for (event, expected_kind) in cases {
            let json_val = serde_json::to_value(&event).unwrap();
            assert_eq!(json_val["kind"], expected_kind, "kind mismatch for variant");
        }
    }

    #[test]
    fn kind_values_match_ts_union() {
        let rust_kinds: Vec<&str> = {
            let cases = vec![
                "sessionSnapshot",
                "messageCommitted",
                "messageRemoved",
                "messageDelta",
                "messageReasoningDelta",
                "toolStarted",
                "toolFinished",
                "toolUpdated",
                "memoryUpdated",
                "turnStarted",
                "turnStateChanged",
                "turnCompleted",
                "turnFinished",
                "turnFailed",
                "turnInterrupted",
                "turnRecovered",
                "contextTrimmed",
                "contextCompressionProgress",
                "todoUpdated",
                "projectTodoUpdated",
                "planUpdated",
                "planReviewRequested",
                "planReviewResolved",
                "clarificationRequested",
                "clarificationResolved",
                "browserActivityChanged",
                "permissionRequested",
                "userGateRequested",
                "userGateResolved",
                "followStateChanged",
                "subagentStarted",
                "providerFault",
                "rollbackStarted",
                "rollbackFinished",
                "rollbackFailed",
                "providerProtocolEvent",
            ];
            cases
        };

        let ts_kinds: Vec<&str> = TS_UNION_KINDS.to_vec();
        let rust_only: Vec<&&str> = rust_kinds
            .iter()
            .filter(|k| !ts_kinds.contains(k) && !RUST_ONLY_KINDS.contains(k))
            .collect();
        let ts_only: Vec<&&str> = ts_kinds
            .iter()
            .filter(|k| !rust_kinds.contains(k))
            .collect();

        assert!(
            rust_only.is_empty(),
            "Rust kinds not in TS union (excluding known Rust-only): {:?}",
            rust_only
        );
        assert!(
            ts_only.is_empty(),
            "TS kinds not in Rust enum: {:?}",
            ts_only
        );
    }

    #[test]
    fn session_snapshot_serializes_correctly() {
        let event = AgentEvent::SessionSnapshot {
            snapshot: json!({"id": "test"}),
        };
        let val = serde_json::to_value(&event).unwrap();
        assert_eq!(val["kind"], "sessionSnapshot");
        assert_eq!(val["snapshot"]["id"], "test");
    }

    #[test]
    fn message_delta_optional_fields_omit_when_none() {
        let event = AgentEvent::MessageDelta {
            session_id: "s".into(),
            message_id: "m".into(),
            block_id: None,
            replace: None,
            delta: "d".into(),
        };
        let val = serde_json::to_value(&event).unwrap();
        assert_eq!(val["kind"], "messageDelta");
        assert_eq!(val["sessionId"], "s");
        assert_eq!(val["messageId"], "m");
        assert_eq!(val["delta"], "d");
        assert!(val.get("blockId").is_none_or(|v| v.is_null()));
        assert!(val.get("replace").is_none_or(|v| v.is_null()));
    }
}
