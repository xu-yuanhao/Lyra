//! Continuation resumes a witnessed visible prefix. A retry marker alone is
//! not a transcript, and an older tool round is not this attempt's prefix.
use super::*;

pub(super) struct StreamContinuation {
    message_id: String,
    prefix: String,
}
impl StreamContinuation {
    pub(super) fn has_progress(
        session_id: &str,
        turn_id: &str,
        previous_message_id: Option<&str>,
    ) -> bool {
        let Some(id) = active_ui_message_id(session_id, turn_id) else {
            return false;
        };
        if Some(id.as_str()) == previous_message_id {
            return false;
        }
        state()
            .lock()
            .ok()
            .and_then(|state| {
                let session = state.sessions.get(session_id)?;
                let message = session.snapshot["messages"]
                    .as_array()?
                    .iter()
                    .find(|message| message["id"] == id)?;
                Some(
                    message["text"]
                        .as_str()
                        .is_some_and(|text| !text.is_empty())
                        || message["reasoningContent"]
                            .as_str()
                            .is_some_and(|text| !text.is_empty())
                        || turns::anchored_protocol_step_has_tool_calls(session, &id),
                )
            })
            .unwrap_or(false)
    }
    /// True when the active draft holds reasoning but no visible text and no
    /// anchored tool call. Discarding it and replaying the turn cannot duplicate
    /// anything the user saw or any tool side effect.
    pub(super) fn has_only_reasoning(
        session_id: &str,
        turn_id: &str,
        previous_message_id: Option<&str>,
    ) -> bool {
        let Some(id) = active_ui_message_id(session_id, turn_id) else {
            return false;
        };
        if Some(id.as_str()) == previous_message_id {
            return false;
        }
        state()
            .lock()
            .ok()
            .and_then(|state| {
                let session = state.sessions.get(session_id)?;
                let message = session.snapshot["messages"]
                    .as_array()?
                    .iter()
                    .find(|message| message["id"] == id)?;
                let has_visible = message["text"]
                    .as_str()
                    .is_some_and(|text| !text.is_empty());
                let has_reasoning = message["reasoningContent"]
                    .as_str()
                    .is_some_and(|text| !text.is_empty());
                Some(
                    !has_visible
                        && has_reasoning
                        && !turns::anchored_protocol_step_has_tool_calls(session, &id),
                )
            })
            .unwrap_or(false)
    }
    /// Drop the reasoning-only draft before a replay so its thinking block does
    /// not stay in the transcript next to the replayed reply.
    pub(super) fn discard_reasoning_only(session_id: &str, turn_id: &str) {
        if let Some(id) = active_ui_message_id(session_id, turn_id) {
            turns::remove_assistant_message(session_id, &id);
        }
    }
    pub(super) fn mark_partial(session_id: &str, turn_id: &str) {
        if let Some(id) = active_ui_message_id(session_id, turn_id) {
            turns::attach_metadata_to_active_assistant_message(
                session_id,
                turn_id,
                &id,
                json!({"providerPartial": {"retainOnRecovery": true}}),
            );
            turns::commit_assistant_message(session_id, turn_id, &id);
        }
    }

    pub(super) fn capture(
        session_id: &str,
        turn_id: &str,
        previous_message_id: Option<&str>,
    ) -> Option<Self> {
        let message_id = active_ui_message_id(session_id, turn_id)?;
        if previous_message_id == Some(message_id.as_str()) {
            return None;
        }
        let prefix = {
            let state = state().lock().ok()?;
            let session = state.sessions.get(session_id)?;
            let messages = session.snapshot["messages"].as_array()?;
            let message = messages
                .iter()
                .find(|message| message["id"] == message_id)?;
            // Early tools remain in their durable protocol step. A text-only
            // continuation must not discard or resample that executed work.
            if turns::anchored_protocol_step_has_tool_calls(session, &message_id) {
                return None;
            }
            message["text"].as_str()?.to_string()
        };
        if prefix.is_empty() {
            return None;
        }
        Self::mark_partial(session_id, turn_id);
        Some(Self { message_id, prefix })
    }

    pub(super) fn request_messages(&self, messages: &[Value]) -> Vec<Value> {
        let mut request = messages.to_vec();
        reset_stateful_responses(&mut request);
        request.push(json!({"role":"assistant", "content": self.prefix}));
        request.push(json!({"role":"user", "content": "Continue the interrupted assistant response from the end of the preceding assistant message. Do not repeat its prefix. Use structured tool calls if more work is needed."}));
        request
    }

    pub(super) fn finish(
        &self,
        session_id: &str,
        turn_id: &str,
        reply: &mut ModelReply,
        commit: bool,
    ) -> AgentRuntimeResult<()> {
        let suffix = reply.content.as_deref().unwrap_or_default();
        if commit {
            turns::append_assistant_delta(session_id, turn_id, &self.message_id, suffix)?;
            turns::commit_assistant_message(session_id, turn_id, &self.message_id);
            turns::stamp_reasoning_content(
                session_id,
                &self.message_id,
                reply.reasoning_content.as_deref(),
            );
            reply.ui_message_id = Some(self.message_id.clone());
        }
        reply.content = Some(format!("{}{suffix}", self.prefix));
        Ok(())
    }
}
