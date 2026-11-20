use super::{NativeSession, Value, iso_ms, now};
use serde_json::json;
use std::collections::HashSet;

#[derive(Clone, Debug)]
pub(crate) struct PinnedItem {
    pub kind: String,
    pub title: String,
    pub content: String,
    pub source_ref: Option<String>,
    pub message_ids: Vec<String>,
}

const ACTIVE_RUNTIME_TURN_STATES: &[&str] =
    &["calling_model", "awaiting_tools", "running", "interrupted"];

pub(crate) fn collect_pinned_items(
    session: &NativeSession,
    active_clarification: Option<&Value>,
) -> Vec<PinnedItem> {
    let mut items = Vec::new();
    let snapshot = &session.snapshot;

    items.push(PinnedItem {
        kind: "session".to_string(),
        // The auto title is the first user message, so injecting it here keeps
        // an old goal in front of the model long after that turn ended.
        title: "Session".to_string(),
        content: format!(
            "workingDir={}",
            snapshot
                .get("workingDir")
                .and_then(Value::as_str)
                .unwrap_or("")
        ),
        source_ref: Some(session.id.clone()),
        message_ids: Vec::new(),
    });

    if let Some(clarification) = active_clarification.filter(|value| !value.is_null()) {
        let question = clarification
            .get("question")
            .and_then(Value::as_str)
            .unwrap_or("");
        if !question.is_empty() {
            items.push(PinnedItem {
                kind: "clarification".to_string(),
                title: "Active clarification".to_string(),
                content: question.to_string(),
                source_ref: clarification
                    .get("clarificationId")
                    .and_then(Value::as_str)
                    .map(str::to_string),
                message_ids: Vec::new(),
            });
        }
    }

    for line in super::session_resilience::resume_context_lines(session) {
        items.push(PinnedItem {
            kind: "resume_context".to_string(),
            title: "Session resume context".to_string(),
            content: line,
            source_ref: Some(session.id.clone()),
            message_ids: Vec::new(),
        });
    }

    if let Some(blocked) = super::session_resilience::active_blocked_browser(session) {
        items.push(PinnedItem {
            kind: "browser_blocked".to_string(),
            title: "Blocked browser regions".to_string(),
            content: blocked
                .get("blockedRegions")
                .and_then(Value::as_array)
                .map(|regions| format!("{} active blocked region(s)", regions.len()))
                .unwrap_or_else(|| "Browser automation is blocked".to_string()),
            source_ref: Some(session.id.clone()),
            message_ids: Vec::new(),
        });
    }

    for milestone in snapshot
        .get("taskMilestones")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .rev()
        .take(6)
    {
        let detail = milestone
            .get("detail")
            .and_then(Value::as_str)
            .unwrap_or("");
        if detail.is_empty() {
            continue;
        }
        items.push(PinnedItem {
            kind: "milestone".to_string(),
            title: milestone
                .get("kind")
                .and_then(Value::as_str)
                .unwrap_or("milestone")
                .to_string(),
            content: detail.to_string(),
            source_ref: milestone
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string),
            message_ids: Vec::new(),
        });
    }

    for todo in snapshot
        .get("todos")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
    {
        let status = todo.get("status").and_then(Value::as_str).unwrap_or("open");
        // failed/skipped are terminal. Keeping a failed item pinned kept the
        // previous task alive as if it still needed work.
        if matches!(
            status,
            "done" | "completed" | "cancelled" | "failed" | "skipped"
        ) {
            continue;
        }
        let content = todo
            .get("content")
            .or_else(|| todo.get("title"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if content.is_empty() {
            continue;
        }
        items.push(PinnedItem {
            kind: "todo".to_string(),
            title: "Session checklist item (may belong to an earlier request)".to_string(),
            content: format!("[{status}] {content}"),
            source_ref: todo.get("id").and_then(Value::as_str).map(str::to_string),
            message_ids: Vec::new(),
        });
    }

    for turn in &session.runtime_turns {
        let state = turn.get("state").and_then(Value::as_str).unwrap_or("");
        if !ACTIVE_RUNTIME_TURN_STATES.contains(&state) {
            continue;
        }
        let turn_id = turn
            .get("runtimeTurnId")
            .and_then(Value::as_str)
            .unwrap_or("runtime-turn");
        let user_message_id = turn
            .get("userMessageId")
            .and_then(Value::as_str)
            .map(str::to_string);
        items.push(PinnedItem {
            kind: "runtime_turn".to_string(),
            title: format!("Runtime turn ({state})"),
            content: format!("runtimeTurnId={turn_id}"),
            source_ref: Some(turn_id.to_string()),
            message_ids: user_message_id.into_iter().collect(),
        });
    }

    let messages = snapshot
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for message in &messages {
        let msg_id = message
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        if msg_id.is_empty() {
            continue;
        }

        if message
            .pointer("/metadata/pinned")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        {
            let text = message.get("text").and_then(Value::as_str).unwrap_or("");
            if !text.is_empty() {
                items.push(PinnedItem {
                    kind: "user_constraint".to_string(),
                    title: "Pinned user constraint".to_string(),
                    content: truncate_pin_text(text),
                    source_ref: Some(msg_id.clone()),
                    message_ids: vec![msg_id.clone()],
                });
            }
        }

        if let Some(citations) = message
            .pointer("/metadata/transcriptCitations")
            .and_then(Value::as_array)
            .filter(|items| !items.is_empty())
        {
            let summary = citations
                .iter()
                .filter_map(|cite| {
                    cite.get("messageId")
                        .and_then(Value::as_str)
                        .map(|id| format!("cite:{id}"))
                })
                .collect::<Vec<_>>()
                .join(", ");
            if !summary.is_empty() {
                items.push(PinnedItem {
                    kind: "transcript_cite".to_string(),
                    title: "Transcript citation anchor".to_string(),
                    content: summary,
                    source_ref: Some(msg_id.clone()),
                    message_ids: vec![msg_id],
                });
            }
        }
    }

    for tool in snapshot
        .get("tools")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .rev()
        .take(6)
    {
        let status = tool.get("status").and_then(Value::as_str).unwrap_or("");
        if !matches!(status, "completed" | "running" | "failed") {
            continue;
        }
        let tool_path = tool
            .pointer("/output/toolPath")
            .or_else(|| tool.get("toolPath"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if tool_path.is_empty() {
            continue;
        }
        items.push(PinnedItem {
            kind: "execution_evidence".to_string(),
            title: tool
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("tool")
                .to_string(),
            content: format!("{tool_path} status={status}"),
            source_ref: tool.get("id").and_then(Value::as_str).map(str::to_string),
            message_ids: Vec::new(),
        });
    }

    items
}

pub(crate) fn pinned_context_json(items: &[PinnedItem]) -> Value {
    json!({
        "items": items.iter().map(|item| json!({
            "kind": item.kind,
            "title": item.title,
            "content": item.content,
            "sourceRef": item.source_ref,
            "messageIds": item.message_ids,
        })).collect::<Vec<_>>()
    })
}

pub(crate) fn pinned_message_ids(items: &[PinnedItem]) -> HashSet<String> {
    items
        .iter()
        .flat_map(|item| item.message_ids.iter().cloned())
        .collect()
}

pub(crate) fn pinned_context_prompt(items: &[PinnedItem]) -> String {
    if items.is_empty() {
        return String::new();
    }
    let mut lines = vec![
        "Pinned background context (earlier session state; the latest incoming request outranks it):"
            .to_string(),
    ];
    for item in items.iter().take(24) {
        lines.push(format!("[{}] {}: {}", item.kind, item.title, item.content));
    }
    lines.join("\n")
}

fn truncate_pin_text(text: &str) -> String {
    const MAX_CHARS: usize = 480;
    if text.chars().count() <= MAX_CHARS {
        return text.to_string();
    }
    text.chars().take(MAX_CHARS).collect::<String>() + "…"
}

pub(crate) fn stamp_message_timestamps(message: &mut Value, created_at: Option<&str>) {
    let iso = created_at.map(str::to_string).unwrap_or_else(now);
    let ms = iso_ms(&iso);
    if let Some(object) = message.as_object_mut() {
        object.insert("createdAt".to_string(), Value::String(iso.clone()));
        object.insert("createdAtIso".to_string(), Value::String(iso.clone()));
        object.insert("createdAtMs".to_string(), Value::Number(ms.into()));
        object.insert("updatedAtIso".to_string(), Value::String(iso.clone()));
        object.insert("updatedAtMs".to_string(), Value::Number(ms.into()));
    }
}

pub(crate) fn stamp_snapshot_timestamps(snapshot: &mut Value) {
    let iso = now();
    let ms = iso_ms(&iso);
    if let Some(object) = snapshot.as_object_mut() {
        object.insert("updatedAt".to_string(), Value::String(iso.clone()));
        object.insert("updatedAtIso".to_string(), Value::String(iso));
        object.insert("updatedAtMs".to_string(), Value::Number(ms.into()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::collections::HashMap;

    fn session_with(title: &str) -> NativeSession {
        NativeSession {
            id: "session-test".to_string(),
            snapshot: json!({
                "title": title,
                "workingDir": "/tmp/player",
                "messages": [
                    {"id": "m1", "role": "user", "text": title},
                    {"id": "m2", "role": "assistant", "text": "old diagnosis"},
                    {"id": "m3", "role": "user", "text": "why does this song not play?"}
                ],
                "todos": [
                    {"id": "t1", "content": "old task that already failed", "status": "failed"},
                    {"id": "t2", "content": "old task still open", "status": "in_progress"},
                    {"id": "t3", "content": "old task already done", "status": "completed"}
                ],
                "taskMilestones": [],
                "tools": []
            }),
            created_at: now(),
            saved: false,
            save_label: None,
            archived: false,
            custom_title: None,
            short_name: None,
            runtime_turns: Vec::new(),
            rollback_checkpoints: Vec::new(),
            file_read_state: HashMap::new(),
            provider_protocol_log: Vec::new(),
            dirty: false,
            dialog_dirty_from: None,
            persisted_dialog_len: 0,
            dialog_loaded: true,
            ephemeral: false,
            stream_journal_sequence: 0,
        }
    }

    #[test]
    fn earlier_goal_state_does_not_outrank_the_latest_request() {
        let session = session_with("remember playback progress");
        let prompt = pinned_context_prompt(&collect_pinned_items(&session, None));

        assert!(!prompt.contains("remember playback progress"));
        assert!(!prompt.contains("old task that already failed"));
        assert!(!prompt.contains("old task already done"));
        assert!(prompt.contains("[in_progress] old task still open"));
        assert!(prompt.contains("the latest incoming request outranks it"));
    }
}
