use super::*;

#[cfg(test)]
pub(crate) fn call_model_once_non_streaming_checked(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelReply> {
    if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
        return Err(AgentRuntimeError::Cancelled);
    }
    crate::native_backend::turn_engine::block_on(call_model_once_non_streaming_checked_async(
        session_id,
        turn_id,
        provider,
        model,
        messages,
        tools,
        tool_choice,
        cancellation,
    ))
}

/// Cancel the entire async request, including header and body waits.
/// Dropping it releases the connection instead of waiting for its timeout.
pub(crate) async fn call_model_once_non_streaming_checked_async(
    session_id: &str,
    turn_id: &str,
    provider: &NativeProviderProfile,
    model: &str,
    messages: &[Value],
    tools: &[Value],
    tool_choice: &ModelToolChoice,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ModelReply> {
    if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
        return Err(AgentRuntimeError::Cancelled);
    }
    let reply = tokio::select! {
        biased;
        _ = cancellation.cancelled() => return Err(AgentRuntimeError::Cancelled),
        reply = call_model_once_non_streaming_with_choice_async(
            provider, model, messages, tools, tool_choice, session_id, turn_id,
        ) => reply?,
    };
    if cancellation.is_cancelled() || turn_was_cancelled(session_id, turn_id) {
        return Err(AgentRuntimeError::Cancelled);
    }
    Ok(reply)
}
