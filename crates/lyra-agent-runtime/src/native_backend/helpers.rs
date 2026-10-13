use super::*;

pub(crate) fn required_session_id(payload: &Value) -> AgentRuntimeResult<String> {
    payload
        .get("sessionId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| AgentRuntimeError::Core("sessionId is required".to_string()))
}

/// Models often serialize omitted optional strings as `"null"` / `"undefined"`.
/// Those are absences, not identifiers.
pub(crate) fn is_absent_model_string(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "" | "null" | "undefined" | "nil"
    )
}

pub(crate) fn string_opt(payload: &Value, key: &str) -> Option<String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !is_absent_model_string(value))
        .map(str::to_string)
}

pub(crate) fn push_array(value: &mut Value, key: &str, item: Value) {
    if !value.get(key).is_some_and(Value::is_array) {
        value[key] = Value::Array(Vec::new());
    }
    if let Some(items) = value.get_mut(key).and_then(Value::as_array_mut) {
        items.push(item);
    }
}

pub(crate) fn set_string(value: &mut Value, key: &str, next: String) {
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), Value::String(next));
    }
}

pub(crate) fn set_bool(value: &mut Value, key: &str, next: bool) {
    if let Some(object) = value.as_object_mut() {
        object.insert(key.to_string(), Value::Bool(next));
    }
}

pub(crate) fn touch_snapshot(snapshot: &mut Value) {
    super::pinned_context::stamp_snapshot_timestamps(snapshot);
    set_string(snapshot, "updatedAt", now());
    if snapshot.get("memory").is_none() {
        snapshot["memory"] = Value::Null;
    }
    refresh_token_estimate_if_stale(snapshot);
}

/// How stale the UI context meter may get before we re-run the tokenizer.
const TOKEN_ESTIMATE_REFRESH_MS: i64 = 5_000;

/// tokenEstimate feeds the UI context-usage meter only — the model-call path
/// computes its own estimate at request time (provider.rs). Recomputing it here
/// used to clone + serialize + BPE-encode the ENTIRE conversation on every
/// touch, and touch_session runs on every streamed progress frame: profiling
/// showed the provider stream thread spending its time inside tiktoken instead
/// of reading the socket, throttling code generation to a crawl. A time gate
/// keeps the meter fresh enough (5s) while making the hot path O(1).
fn refresh_token_estimate_if_stale(snapshot: &mut Value) {
    // The UI meter must never initialize the tokenizer under the session lock.
    // Request budgeting still performs an exact count before sending a request.
    if !super::token_estimate::tokenizer_ready() {
        super::token_estimate::warm_tokenizer();
        return;
    }
    let now_ms = Utc::now().timestamp_millis();
    let stamped_at = snapshot
        .get("tokenEstimateAtMs")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    if snapshot.get("tokenEstimate").is_some()
        && now_ms.saturating_sub(stamped_at) < TOKEN_ESTIMATE_REFRESH_MS
    {
        return;
    }
    refresh_token_estimate_now(snapshot, now_ms);
}

/// Force-recompute `tokenEstimate`/`tokenEstimateAtMs` ignoring the staleness
/// time gate. Callers (compaction, archive) mutate `messages` synchronously
/// and then `touch_session`, whose `refresh_token_estimate_if_stale` would
/// return early because the field and timestamp were just stamped milliseconds
/// ago — leaving the meter pinned at the pre-mutation (large) value and the
/// UI ring staying "red/full" after a successful compaction (cf jcode
/// `observed_input_tokens = None`, mimocode/opencode "ring is pure derived").
/// Resetting the baseline here makes the next `touch_session` propagate the
/// post-mutation count regardless of throttle.
pub(crate) fn force_refresh_token_estimate(snapshot: &mut Value) {
    refresh_token_estimate_now(snapshot, Utc::now().timestamp_millis());
}

fn refresh_token_estimate_now(snapshot: &mut Value, now_ms: i64) {
    if let Some(messages) = snapshot.get("messages").and_then(Value::as_array) {
        let estimate = super::token_estimate::estimate_messages_tokens(messages);
        snapshot["tokenEstimate"] = json!(estimate);
        snapshot["tokenEstimateAtMs"] = json!(now_ms);
    }
}

pub(crate) fn touch_session(session: &mut NativeSession) {
    session.stream_journal_sequence = session.stream_journal_sequence.saturating_add(1);
    session.snapshot["revision"] = json!(session.stream_journal_sequence.to_string());
    touch_snapshot(&mut session.snapshot);
    session.dirty = true;
}

pub(crate) fn mark_dialog_dirty_from(session: &mut NativeSession, index: usize) {
    session.dialog_dirty_from = Some(
        session
            .dialog_dirty_from
            .map_or(index, |current| current.min(index)),
    );
    touch_session(session);
}

pub(crate) fn mark_dialog_message_dirty(session: &mut NativeSession, message_id: &str) {
    let index = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .and_then(|messages| {
            messages
                .iter()
                .rposition(|message| message.get("id").and_then(Value::as_str) == Some(message_id))
        });
    if let Some(index) = index {
        mark_dialog_dirty_from(session, index);
    } else {
        touch_session(session);
    }
}

pub(crate) fn push_session_message(session: &mut NativeSession, message: Value) {
    let index = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0);
    push_array(&mut session.snapshot, "messages", message);
    mark_dialog_dirty_from(session, index);
}

pub(crate) fn is_deleted(snapshot: &Value) -> bool {
    snapshot.get("turnStatus").and_then(Value::as_str) == Some("deleted")
}

pub(crate) fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub(crate) fn iso_ms(value: &str) -> i64 {
    DateTime::parse_from_rfc3339(value)
        .map(|time| time.timestamp_millis())
        .unwrap_or_else(|_| Utc::now().timestamp_millis())
}

pub(crate) fn emit_with_callback(callback: &Option<Arc<EventCallback>>, event: Value) {
    if let Some(callback) = callback
        && let Ok(payload) = serde_json::to_string(&event)
    {
        callback(payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_opt_drops_model_null_sentinels() {
        assert_eq!(
            string_opt(&json!({ "subagent_id": "null" }), "subagent_id"),
            None
        );
        assert_eq!(
            string_opt(&json!({ "subagent_id": "NULL" }), "subagent_id"),
            None
        );
        assert_eq!(
            string_opt(&json!({ "subagent_id": "undefined" }), "subagent_id"),
            None
        );
        assert_eq!(
            string_opt(&json!({ "subagent_id": Value::Null }), "subagent_id"),
            None
        );
        assert_eq!(
            string_opt(&json!({ "subagent_id": "session-1" }), "subagent_id"),
            Some("session-1".to_string())
        );
    }
}
