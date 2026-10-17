use sha2::{Digest, Sha256};

use super::*;

mod messages;
mod provider_metadata;
mod provider_request;
mod web_links;

#[cfg(test)]
#[path = "turns/goal_continuation_tests.test.rs"]
mod goal_continuation_tests;
#[cfg(test)]
#[path = "turns/narration_tests.test.rs"]
mod narration_tests;

pub(crate) use messages::*;
use provider_metadata::{
    finalize_openai_response_state_fingerprint, set_runtime_turn_provider_metadata,
};
#[cfg(test)]
pub(crate) use provider_request::build_model_request;
pub(crate) use provider_request::build_model_request_async;

/// send_turn's two outcomes. A running session steers: the message is queued
/// for injection at the live turn's next model boundary and the turn keeps
/// running (reference semantics: queue, inject at boundaries, never abort the
/// in-flight call). An idle session starts a turn.
enum SendTurnPlan {
    Steer {
        session_id: String,
        callback: Option<Arc<EventCallback>>,
        user_message: Value,
        turn_id: String,
    },
    StartTurn {
        session_id: String,
        callback: Option<Arc<EventCallback>>,
        user_message: Value,
        snapshot: Value,
        cancellation: CancellationToken,
        dispatch_legacy_todos: bool,
    },
}

/// Transcript citations, page/file attachments and inline images — shared by
/// the turn-start and steer paths so a steered message is projected exactly
/// like a turn-starting one.
fn apply_user_message_transcript_attachments(
    user_message: &mut Value,
    existing_messages: &[Value],
    citations: &[Value],
    page_citations: &[Value],
    file_citations: &[Value],
    uses_inline_image_markers: bool,
    inline_images: &[Value],
) {
    if !citations.is_empty() {
        let (accepted, rejected) = validate_transcript_citations(existing_messages, citations);
        apply_transcript_citations_to_user_message(user_message, &accepted, &rejected);
    }
    if !page_citations.is_empty() {
        apply_page_citations_to_user_message(user_message, page_citations);
    }
    if !file_citations.is_empty() {
        apply_file_citations_to_user_message(user_message, file_citations);
        apply_media_file_attachments_to_user_message(user_message, file_citations);
    }
    if uses_inline_image_markers {
        apply_inline_images_to_user_message(user_message, inline_images);
    }
}

pub(crate) fn send_turn(payload: Value) -> AgentRuntimeResult<Value> {
    let text = string_opt(&payload, "text")
        .or_else(|| string_opt(&payload, "prompt"))
        .unwrap_or_default();
    let inline_images = parse_inline_images(&payload);
    let uses_inline_image_markers = text_has_inline_image_markers(&text);
    if uses_inline_image_markers {
        validate_inline_image_turn_commit(&text, &inline_images)
            .map_err(AgentRuntimeError::Core)?;
    }
    let legacy_images = if uses_inline_image_markers {
        Vec::new()
    } else {
        payload
            .get("images")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    let citations = parse_transcript_citations(&payload);
    let page_citations = parse_page_citations(&payload);
    let file_citations = parse_file_citations(&payload);
    validate_media_file_attachments(&file_citations).map_err(AgentRuntimeError::Core)?;
    let ui_hidden = payload
        .get("uiHidden")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let only_if_idle = payload
        .get("onlyIfIdle")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let goal_continuation = payload
        .get("goalContinuation")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let requested_session = string_opt(&payload, "sessionId");
    let now = now();
    let turn_id = format!("turn-{}", Uuid::new_v4());
    let mut user_message = user_message(text.clone(), legacy_images.clone(), now.clone());
    web_links::apply_web_links(&mut user_message, &text, &payload);
    let user_message_id = user_message
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("message-{}", Uuid::new_v4()));

    let plan = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let session_id = state.resolve_session_id(requested_session)?;
        state.ensure_dialog(&session_id)?;
        if only_if_idle {
            let turn_status = state
                .sessions
                .get(&session_id)
                .and_then(|s| s.snapshot.get("turnStatus").and_then(Value::as_str))
                .unwrap_or("idle");
            if turn_status == "running" {
                return Ok(json!({
                    "sessionId": session_id,
                    "turnId": Value::Null,
                    "status": "idle",
                    "sent": false,
                    "reason": "session_not_idle"
                }));
            }
        }
        let root = state.root.clone();
        let session = state
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        let existing_messages = session
            .snapshot
            .get("messages")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let running_turn_id = if session.snapshot["turnStatus"] == "running" {
            session
                .snapshot
                .get("activeTurnId")
                .and_then(Value::as_str)
                .map(str::to_string)
        } else {
            None
        };
        if let Some(active_turn_id) = running_turn_id {
            // ── Steer: the session is mid-turn ──
            // Queue the message for injection at the live turn's next model
            // boundary instead of killing the turn (reference semantics:
            // opencode/claw/pi queue, inject at boundaries, never abort the
            // in-flight call). The transcript keeps the message immediately
            // so UI order == transcript order; the inbox copy is purely the
            // in-flight delivery handle the model loop drains.
            apply_user_message_transcript_attachments(
                &mut user_message,
                &existing_messages,
                &citations,
                &page_citations,
                &file_citations,
                uses_inline_image_markers,
                &inline_images,
            );
            if ui_hidden {
                if !user_message.get("metadata").is_some_and(Value::is_object) {
                    user_message["metadata"] = json!({});
                }
                user_message["metadata"]["uiHidden"] = json!(true);
                if payload.get("terminalExit").and_then(Value::as_bool) == Some(true) {
                    user_message["metadata"]["terminalExit"] = json!(true);
                }
            }
            push_session_message(session, user_message.clone());
            touch_session(session);
            super::session_runtime::enqueue_steer(&session_id, user_message.clone());
            state.save_state()?;
            let callback = event_callback();
            SendTurnPlan::Steer {
                session_id,
                callback,
                user_message,
                turn_id: active_turn_id,
            }
        } else {
            let dispatch_legacy_todos = migrate_legacy_todo_required_phase(session, &root)?;
            apply_user_message_transcript_attachments(
                &mut user_message,
                &existing_messages,
                &citations,
                &page_citations,
                &file_citations,
                uses_inline_image_markers,
                &inline_images,
            );
            if ui_hidden {
                if !user_message.get("metadata").is_some_and(Value::is_object) {
                    user_message["metadata"] = json!({});
                }
                user_message["metadata"]["uiHidden"] = json!(true);
                if goal_continuation {
                    user_message["metadata"]["goalContinuation"] = json!(true);
                }
                if payload.get("terminalExit").and_then(Value::as_bool) == Some(true) {
                    user_message["metadata"]["terminalExit"] = json!(true);
                }
                user_message["rollback"] = json!({
                    "available": false,
                    "unavailableReason": "Rollback is unavailable for menu action turns."
                });
            } else {
                session.snapshot["goalContinuation"] = Value::Null;
                session.snapshot["completionBlocked"] = Value::Null;
                let checkpoint =
                    rollback_checkpoint(&session_id, &turn_id, &user_message_id, session);
                user_message["rollback"] = json!({
                    "available": true,
                    "anchorId": checkpoint.id,
                    "checkpointAt": checkpoint.created_at,
                    "unavailableReason": Value::Null
                });
                session.rollback_checkpoints.push(checkpoint);
                maybe_title_session_from_first_user_message(session, &text, &page_citations);
            }
            push_session_message(session, user_message.clone());
            session.snapshot["turnStatus"] = Value::String("running".to_string());
            session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
            session.snapshot["follow"] = json!({ "running": true, "activity": "calling_model" });
            touch_session(session);
            session.runtime_turns.push(runtime_turn(
                &turn_id,
                &session_id,
                "calling_model",
                Some(user_message_id.clone()),
                None,
            ));
            let snapshot = session.snapshot.clone();
            let cancellation = CancellationToken::new();
            super::session_runtime::register_active_turn(
                &session_id,
                &turn_id,
                cancellation.clone(),
            );
            let callback = event_callback();
            state.save_state()?;
            SendTurnPlan::StartTurn {
                session_id,
                callback,
                user_message,
                snapshot,
                cancellation,
                dispatch_legacy_todos,
            }
        }
    };

    match plan {
        SendTurnPlan::Steer {
            session_id,
            callback,
            user_message,
            turn_id,
        } => {
            emit_with_callback(
                &callback,
                json!({ "kind": "messageCommitted", "sessionId": session_id, "message": user_message }),
            );
            Ok(json!({ "sessionId": session_id, "turnId": turn_id, "status": "steered" }))
        }
        SendTurnPlan::StartTurn {
            session_id,
            callback,
            user_message,
            snapshot,
            cancellation,
            dispatch_legacy_todos,
        } => {
            emit_with_callback(
                &callback,
                json!({ "kind": "messageCommitted", "sessionId": session_id, "message": user_message }),
            );
            emit_with_callback(
                &callback,
                json!({ "kind": "turnStarted", "sessionId": session_id, "turnId": turn_id, "state": "calling_model" }),
            );
            emit_with_callback(
                &callback,
                json!({ "kind": "turnStateChanged", "sessionId": session_id, "turnId": turn_id, "state": "calling_model", "reason": "native_turn_started" }),
            );
            // Snapshots are initial sync only. Turn state reaches clients through
            // turnStarted/turnStateChanged; structural deltas arrive as their own events.
            if dispatch_legacy_todos {
                emit_project_todo_events(&session_id, &snapshot);
            }

            let thread_session_id = session_id.clone();
            let thread_turn_id = turn_id.clone();
            super::turn_engine::spawn_turn(thread_session_id, thread_turn_id, cancellation);

            Ok(json!({ "sessionId": session_id, "turnId": turn_id, "status": "running" }))
        }
    }
}

pub(crate) fn resume_idle_turn(session_id: &str) -> AgentRuntimeResult<Value> {
    let turn_id = format!("turn-{}", Uuid::new_v4());
    let (session_id, callback, snapshot, cancellation, dispatch_legacy_todos) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let session_id = state.resolve_session_id(Some(session_id.to_string()))?;
        let turn_status = state
            .sessions
            .get(&session_id)
            .and_then(|session| session.snapshot.get("turnStatus").and_then(Value::as_str))
            .unwrap_or("idle");
        if turn_status == "running" {
            return Ok(json!({
                "sessionId": session_id,
                "turnId": Value::Null,
                "status": "idle",
                "sent": false,
                "reason": "session_not_idle"
            }));
        }
        let root = state.root.clone();
        let session = state
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        let dispatch_legacy_todos = migrate_legacy_todo_required_phase(session, &root)?;
        session.snapshot["turnStatus"] = Value::String("running".to_string());
        session.snapshot["activeTurnId"] = Value::String(turn_id.clone());
        session.snapshot["follow"] = json!({ "running": true, "activity": "calling_model" });
        touch_session(session);
        session.runtime_turns.push(runtime_turn(
            &turn_id,
            &session_id,
            "calling_model",
            None,
            None,
        ));
        let snapshot = session.snapshot.clone();
        let cancellation = CancellationToken::new();
        super::session_runtime::register_active_turn(&session_id, &turn_id, cancellation.clone());
        let callback = event_callback();
        state.save_state()?;
        (
            session_id,
            callback,
            snapshot,
            cancellation,
            dispatch_legacy_todos,
        )
    };
    emit_with_callback(
        &callback,
        json!({ "kind": "turnStarted", "sessionId": session_id, "turnId": turn_id, "state": "calling_model" }),
    );
    emit_with_callback(
        &callback,
        json!({ "kind": "turnStateChanged", "sessionId": session_id, "turnId": turn_id, "state": "calling_model", "reason": "worker_completion_resume" }),
    );
    // Snapshots are initial sync only. Turn state reaches clients through
    // turnStarted/turnStateChanged; structural deltas arrive as their own events.
    if dispatch_legacy_todos {
        emit_project_todo_events(&session_id, &snapshot);
    }
    super::turn_engine::spawn_turn(session_id.clone(), turn_id.clone(), cancellation);
    Ok(json!({
        "sessionId": session_id,
        "turnId": turn_id,
        "status": "running",
        "sent": true
    }))
}

pub(crate) async fn run_native_turn_async(
    session_id: String,
    turn_id: String,
    cancellation: CancellationToken,
) {
    super::page_citations::show_attached_page_maps(&session_id, &turn_id).await;
    let model_result = match build_model_request_async(session_id.clone()).await {
        Ok(request) => run_model_loop_async(&session_id, &turn_id, request, &cancellation).await,
        Err(error) => Err(error),
    };
    tokio::time::sleep(Duration::from_millis(25)).await;

    if cancellation.is_cancelled() || turn_was_cancelled(&session_id, &turn_id) {
        let metadata = super::session_runtime::take_turn_provider_metadata(&session_id, &turn_id);
        finish_turn_with_metadata(
            &session_id,
            &turn_id,
            "cancelled",
            None,
            Some("Lyra tool call was cancelled because its turn ended.".to_string()),
            metadata,
            None,
        );
        return;
    }

    match model_result {
        Ok(result) => {
            let mut runtime_metadata =
                super::session_runtime::take_turn_provider_metadata(&session_id, &turn_id);
            if let Some(metadata) = runtime_metadata.as_mut().and_then(Value::as_object_mut) {
                // The completed loop result already carries the final aggregate.
                // Keep physical attempts from the runtime checkpoint without
                // appending duplicate warning arrays.
                metadata.remove("providerUsage");
                metadata.remove("providerWarnings");
            }
            let metadata = merge_turn_metadata(result.session_metadata(), runtime_metadata);
            let final_message_id = result.final_message_id.clone();
            let assistant_text = if result.ui_text_committed {
                None
            } else {
                result.final_text
            };
            finish_turn_with_metadata_for_message(
                &session_id,
                &turn_id,
                "finished",
                assistant_text,
                None,
                metadata,
                None,
                final_message_id,
            );
            // goal continuation: 只在成功 turn 后触发，错误/取消 turn 不继续
            evaluate_goal_continuation(&session_id, &turn_id);
            if let Some(parent_id) = parent_id_for_session(&session_id) {
                evaluate_goal_continuation(&parent_id, &turn_id);
            }
        }
        Err(error) => {
            let metadata =
                super::session_runtime::take_turn_provider_metadata(&session_id, &turn_id);
            let failure_message = error.to_string();
            let failure_kind = match error {
                AgentRuntimeError::ProviderFailure { .. }
                | AgentRuntimeError::ProviderProtocol { .. }
                | AgentRuntimeError::ProviderTransport { .. } => "provider_error",
                _ => "runtime_error",
            };
            emit_assistant_error_message(&session_id, &turn_id, &failure_message);
            finish_turn_with_metadata(
                &session_id,
                &turn_id,
                "finished",
                None,
                Some(failure_message),
                metadata,
                Some(failure_kind.to_string()),
            )
        }
    }
}

pub(crate) fn latest_user_text(messages: &[Value]) -> String {
    messages
        .iter()
        .rev()
        .find(|message| crate::context_builder::is_member_user_message(message))
        .and_then(|message| message.get("text").and_then(Value::as_str))
        .unwrap_or_default()
        .to_string()
}

const AUTO_SESSION_TITLE_MAX_CHARS: usize = 48;

fn compact_auto_session_title(text: &str, page_citations: &[Value]) -> String {
    let expanded = crate::native_backend::page_citations::expand_page_cite_markers(
        text,
        page_citations,
        crate::native_backend::page_citations::PageCiteMarkerMode::Title,
    );
    let line = expanded
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("");
    let collapsed = line.split_whitespace().collect::<Vec<_>>().join(" ");
    clip_auto_session_title(&collapsed)
}

fn clip_auto_session_title(collapsed: &str) -> String {
    let count = collapsed.chars().count();
    if count <= AUTO_SESSION_TITLE_MAX_CHARS {
        return collapsed.to_string();
    }
    let mut end_byte = collapsed.len();
    for (index, (byte, _)) in collapsed.char_indices().enumerate() {
        if index == AUTO_SESSION_TITLE_MAX_CHARS {
            end_byte = byte;
            break;
        }
    }
    let head = &collapsed[..end_byte];
    let open = head.rfind('⟦');
    let close = head.rfind('⟧');
    let inside_marker = match (open, close) {
        (Some(open_at), Some(close_at)) => open_at > close_at,
        (Some(_), None) => true,
        _ => false,
    };
    if inside_marker {
        let open_at = open.expect("marker open");
        if let Some(relative) = collapsed[open_at..].find('⟧') {
            let inclusive = open_at + relative + '⟧'.len_utf8();
            let kept = collapsed[..inclusive].trim_end();
            return if inclusive < collapsed.len() {
                format!("{kept}…")
            } else {
                kept.to_string()
            };
        }
    }
    format!("{}…", head.trim_end())
}

pub(crate) fn maybe_title_session_from_first_user_message(
    session: &mut NativeSession,
    text: &str,
    page_citations: &[Value],
) {
    if session.custom_title.is_some() {
        return;
    }
    if first_user_message_exists(session) {
        return;
    }
    let title = compact_auto_session_title(text, page_citations);
    if title.is_empty() {
        return;
    }
    // A create-time title is only a placeholder unless the user explicitly
    // renamed the session (custom_title). The frontend sends its localized
    // placeholder at create time, so recognize every locale's variant.
    let current_title = session.snapshot.get("title").and_then(Value::as_str);
    let placeholder = match current_title {
        None => true,
        Some(value) => {
            let value = value.trim();
            value.is_empty()
                || value == DEFAULT_SESSION_TITLE
                || value == LEGACY_DEFAULT_SESSION_TITLE
                || value == LEGACY_DEFAULT_SESSION_TITLE_ZH
                || value == "New session"
        }
    };
    if placeholder {
        session.snapshot["title"] = Value::String(title.to_string());
    }
}

fn first_user_message_exists(session: &NativeSession) -> bool {
    session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .is_some_and(|messages| {
            messages
                .iter()
                .any(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        })
}

fn openai_responses_stateful_prompt_contract_enabled(configured: bool) -> bool {
    env_bool_override("LYRA_OPENAI_RESPONSES_STATEFUL_PROMPT_CONTRACT").unwrap_or(configured)
}

pub(crate) fn env_bool_override(name: &str) -> Option<bool> {
    std::env::var(name)
        .map(|value| matches!(value.trim(), "1" | "true" | "yes" | "on"))
        .ok()
}

pub(crate) fn combined_memory_prompt(
    memory_records: &[RankedMemoryRecord],
    system_recall_records: &[RankedSystemRecallItem],
    pinned_context_prompt: &str,
) -> String {
    [
        pinned_context_prompt.to_string(),
        shared_memory_prompt(memory_records),
        system_recall_prompt(system_recall_records),
    ]
    .into_iter()
    .filter(|section| !section.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n\n")
}

#[cfg(test)]
pub(crate) fn finish_turn(
    session_id: &str,
    turn_id: &str,
    status: &str,
    assistant_text: Option<String>,
    failure: Option<String>,
) {
    finish_turn_with_metadata(
        session_id,
        turn_id,
        status,
        assistant_text,
        failure,
        None,
        None,
    );
}

pub(crate) fn finish_turn_with_metadata(
    session_id: &str,
    turn_id: &str,
    status: &str,
    assistant_text: Option<String>,
    failure: Option<String>,
    metadata: Option<Value>,
    failure_kind: Option<String>,
) {
    finish_turn_with_metadata_for_message(
        session_id,
        turn_id,
        status,
        assistant_text,
        failure,
        metadata,
        failure_kind,
        None,
    );
}

pub(crate) fn finish_turn_with_metadata_for_message(
    session_id: &str,
    turn_id: &str,
    status: &str,
    assistant_text: Option<String>,
    failure: Option<String>,
    metadata: Option<Value>,
    failure_kind: Option<String>,
    final_message_id: Option<String>,
) {
    let failure_kind = failure_kind.or_else(|| {
        (status != "cancelled" && failure.is_some()).then(|| "runtime_error".to_string())
    });
    let failure_for_ledger = failure.clone();
    let (unfinished_tool_status, unfinished_tool_output) = if status == "cancelled" {
        (
            "cancelled",
            cancelled_tool_output(
                CANCEL_REASON_TURN_CANCELLED,
                failure
                    .as_deref()
                    .unwrap_or("Lyra tool call was cancelled."),
                "Stop this tool call and continue only after a new user turn.",
                None,
            ),
        )
    } else if let Some(failure) = failure.as_deref() {
        ("failed", json!({ "content": failure }))
    } else {
        (
            "failed",
            json!({ "content": "Lyra ended the turn before this tool call produced a result." }),
        )
    };
    let mut metadata = metadata;
    let mut compress_check_job: Option<(PathBuf, String, String)> = None;
    let mut memory_job = None;
    let mut recall_index_job: Option<(PathBuf, NativeSession)> = None;
    let mut ledger_turn: Option<(PathBuf, NativeSession, String, String, Option<String>)> = None;
    let mut committed_anchor: Option<String> = None;
    let (callback, events, leftover_steers) = match state().lock() {
        Ok(mut state) => {
            let callback = event_callback();
            let mut events = Vec::new();
            let root = state.root.clone();
            let streamed_message_id = final_message_id
                .filter(|id| !id.trim().is_empty())
                .or_else(|| super::session_runtime::active_ui_message_id(session_id, turn_id));
            super::session_runtime::clear_active_turn(session_id, turn_id);
            clear_pending_interactions_for_turn(&mut state, turn_id);
            let in_flight = state.active_compressions.contains(session_id);
            if let Some(session) = state.sessions.get_mut(session_id) {
                if session.snapshot.get("activeTurnId").and_then(Value::as_str) == Some(turn_id) {
                    mark_unfinished_provider_protocol_steps_interrupted(session, turn_id);
                    finalize_openai_response_state_fingerprint(
                        session,
                        assistant_text.as_deref(),
                        streamed_message_id.as_deref(),
                        &mut metadata,
                    );
                    if let Some(text) = assistant_text.filter(|text| !text.trim().is_empty()) {
                        let message = assistant_message_with_metadata(text, metadata.clone());
                        let committed_message_id = message
                            .get("id")
                            .and_then(Value::as_str)
                            .map(str::to_string);
                        push_session_message(session, message.clone());
                        events.push(json!({
                            "kind": "messageCommitted",
                            "sessionId": session_id,
                            "message": message
                        }));
                        committed_anchor = committed_message_id;
                    } else if let (Some(metadata), Some(message_id)) =
                        (metadata.clone(), streamed_message_id.clone())
                    {
                        if let Some(message) = attach_metadata_to_assistant_message(
                            &mut session.snapshot,
                            &message_id,
                            metadata,
                        ) {
                            mark_dialog_message_dirty(session, &message_id);
                            events.push(json!({
                                "kind": "messageCommitted",
                                "sessionId": session_id,
                                "message": message
                            }));
                        }
                    }
                    // The protocol replay log is anchored to the committed
                    // assistant message; unanchored leftovers of this turn can
                    // never gain one anymore.
                    match committed_anchor
                        .clone()
                        .or_else(|| streamed_message_id.clone())
                    {
                        Some(anchor) => anchor_provider_protocol_log(session, turn_id, &anchor),
                        None => {}
                    }
                    drop_unanchored_provider_protocol_log_entries(session, turn_id);
                    // OpenCode step-finish leftover: the reasoning channel must
                    // close when the turn ends even if the provider omitted
                    // reasoning-end and never sent visible text or tools.
                    if let Some(message_id) = streamed_message_id.as_deref() {
                        let sealed = session
                            .snapshot
                            .get_mut("messages")
                            .and_then(Value::as_array_mut)
                            .and_then(|messages| {
                                let message = messages.iter_mut().rev().find(|message| {
                                    message.get("id").and_then(Value::as_str) == Some(message_id)
                                })?;
                                complete_streamed_reasoning(message).then(|| message.clone())
                            });
                        if let Some(sealed) = sealed {
                            mark_dialog_message_dirty(session, message_id);
                            events.push(json!({
                                "kind": "messageCommitted",
                                "sessionId": session_id,
                                "message": sealed
                            }));
                        }
                    }
                    session.snapshot["turnStatus"] =
                        Value::String(session_turn_status_for_finish_status(status).to_string());
                    session.snapshot["activeTurnId"] = Value::Null;
                    session.snapshot["follow"] =
                        json!({ "running": false, "activity": Value::Null });
                    finish_running_tools_for_turn(
                        session,
                        turn_id,
                        unfinished_tool_status,
                        unfinished_tool_output.clone(),
                    );
                    set_runtime_turn_provider_metadata(session, turn_id, metadata.as_ref());
                    if let Some(failure_kind) = failure_kind.as_deref() {
                        update_runtime_turn_state(
                            session,
                            turn_id,
                            "interrupted",
                            Some(failure_kind),
                        );
                    } else {
                        update_runtime_turn(session, turn_id, status);
                    }
                    let _ = prune_empty_assistant_messages(session);
                    if status == "finished" {
                        memory_job =
                            memory_trigger_from_turn(&session.snapshot, session_id, turn_id)
                                .map(|event| (root.clone(), event));
                    }
                    let retention_metrics = prune_transient_tool_outputs(session);
                    prune_goal_continuation_session_messages(session);
                    touch_session(session);
                    if !session.ephemeral {
                        // Terminal UI events acknowledge a durable snapshot. The
                        // checkpoint also prevents an earlier async clone from
                        // restoring a running status after cancellation/finish.
                        if let Err(error) =
                            persist_stream_delta(&root, session, "", "checkpoint", "")
                                .and_then(|()| save_session(&root, session))
                        {
                            eprintln!("Unable to persist terminal session snapshot: {error}");
                        }
                    }
                    recall_index_job = Some((root.clone(), session.clone()));
                    if retention_metrics
                        .get("pruned")
                        .and_then(Value::as_u64)
                        .unwrap_or(0)
                        > 0
                    {
                        events.push(json!({
                            "kind": "contextTrimmed",
                            "sessionId": session_id,
                            "detail": {
                                "reason": "tool_retention",
                                "metrics": retention_metrics,
                            }
                        }));
                    }
                    if status == "finished" {
                        let session_messages = session
                            .snapshot
                            .get("messages")
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default();
                        let total_tokens =
                            crate::native_backend::token_estimate::estimate_messages_tokens(
                                &session_messages,
                            );
                        let baseline = session
                            .snapshot
                            .pointer("/memoryCompression/compressedTokenBaseline")
                            .and_then(Value::as_u64)
                            .map(|v| v as usize)
                            .unwrap_or(0);
                        let compressed_up_to = super::memory_compress::effective_compressed_up_to(
                            &session.snapshot,
                            &session_messages,
                        );
                        let has_uncompressed =
                            session_messages.iter().skip(compressed_up_to).any(|msg| {
                                matches!(
                                    msg.get("role").and_then(Value::as_str),
                                    Some("user") | Some("assistant")
                                )
                            });
                        if total_tokens.saturating_sub(baseline)
                            >= super::memory_compress::compact_trigger_tokens(None)
                            && has_uncompressed
                            && !in_flight
                        {
                            compress_check_job =
                                Some((root.clone(), session_id.to_string(), turn_id.to_string()));
                        }
                    }
                    ledger_turn = Some((
                        root.clone(),
                        session.clone(),
                        turn_id.to_string(),
                        status.to_string(),
                        failure_for_ledger.clone(),
                    ));
                    events.push(json!({
                        "kind": "turnFinished",
                        "sessionId": session_id,
                        "turnId": turn_id,
                        "status": status
                    }));
                    if let Some(failure_kind) = failure_kind.as_deref() {
                        events.push(json!({
                            "kind": "turnInterrupted",
                            "sessionId": session_id,
                            "turnId": turn_id,
                            "reason": failure_kind
                        }));
                    } else {
                        match status {
                            "finished" => events.push(json!({
                            "kind": "turnCompleted",
                            "sessionId": session_id,
                            "turnId": turn_id
                            })),
                            "cancelled" => events.push(json!({
                            "kind": "turnInterrupted",
                            "sessionId": session_id,
                            "turnId": turn_id,
                            "reason": failure
                                .clone()
                                .unwrap_or_else(|| "turn cancelled".to_string())
                            })),
                            _ => {}
                        }
                    }
                    events.push(json!({
                        "kind": "followStateChanged",
                        "sessionId": session_id,
                        "follow": { "running": false, "activity": Value::Null }
                    }));
                }
            }
            // Steers that arrived during the final response can no longer
            // reach a drain point inside the model loop. Empty the inbox in
            // the same critical section that ends the turn: any turn started
            // afterwards rebuilds context from the transcript (which already
            // holds these messages) and must never see the inbox copies.
            let leftover_steers = super::session_runtime::take_pending_steers(session_id);
            let _ = state.save_state();
            (callback, events, leftover_steers)
        }
        Err(_) => return,
    };
    let _ = flush_state();
    for event in events {
        emit_with_callback(&callback, event);
    }
    if let Some((root, event)) = memory_job {
        emit_memory_trigger(&root, event);
    }
    if let Some((root, session)) = recall_index_job {
        let _ = index_session_messages_for_recall(&root, &session);
    }
    if let Some((root, session, turn_id, status, failure)) = ledger_turn {
        let _ = record_turn_finished(&root, &session, &turn_id, &status, failure.as_deref());
    }
    if let Some((root, session_id, turn_id)) = compress_check_job {
        super::memory_compress::spawn_extract_and_compress(root, session_id, turn_id);
    }
    // Final-response race: steers drained from the inbox here arrived too
    // late for the model loop. A finished turn hands them to a continuation
    // turn whose context rebuild projects them from the transcript; a
    // cancelled turn drops them (abort clears the queue — the messages stay
    // in the transcript, unanswered until the user's next turn). Draining
    // before the poke flush matters: the poke flush may spawn a turn, and
    // that turn's context must not race a still-populated inbox.
    if !leftover_steers.is_empty() && status == "finished" {
        let _ = resume_idle_turn(session_id);
    }
    super::poke::flush_pending_terminal_pokes(session_id);
    notify_session_idle(session_id);
}

fn merge_turn_metadata(left: Option<Value>, right: Option<Value>) -> Option<Value> {
    let mut merged = left.unwrap_or_else(|| json!({}));
    if !merged.is_object() {
        merged = json!({ "value": merged });
    }
    if let Some(Value::Object(source)) = right
        && let Some(target) = merged.as_object_mut()
    {
        for (key, value) in source {
            match (target.get_mut(&key), value) {
                (Some(Value::Array(existing)), Value::Array(mut incoming)) => {
                    existing.append(&mut incoming);
                }
                (_, value) => {
                    target.insert(key, value);
                }
            }
        }
    }
    (!merged.as_object().is_some_and(Map::is_empty)).then_some(merged)
}

fn mark_unfinished_provider_protocol_steps_interrupted(session: &mut NativeSession, turn_id: &str) {
    for entry in session.provider_protocol_log.iter_mut() {
        let Some(step) = entry.get_mut("step") else {
            continue;
        };
        if step.get("version").and_then(Value::as_u64) != Some(2)
            || step.get("turnId").and_then(Value::as_str) != Some(turn_id)
            || step.get("status").and_then(Value::as_str) != Some("awaitingToolResults")
        {
            continue;
        }
        step["status"] = json!("interrupted");
    }
}

fn finalize_provider_state_before_interrupt(
    session: &mut NativeSession,
    turn_id: &str,
    provider_metadata: Option<&Value>,
) {
    mark_unfinished_provider_protocol_steps_interrupted(session, turn_id);
    // No new anchor can appear after an interrupt; unanchored steps of this
    // turn were never surfaced in the timeline and are not replayable.
    drop_unanchored_provider_protocol_log_entries(session, turn_id);
    set_runtime_turn_provider_metadata(session, turn_id, provider_metadata);

    let Some(provider_metadata) = provider_metadata else {
        return;
    };
    // The stateful-responses cursor rides the last message the interrupted
    // turn anchored protocol state to; the log is the turn→message index.
    let Some(message_id) = session
        .provider_protocol_log
        .iter()
        .rev()
        .filter(|entry| entry.get("turnId").and_then(Value::as_str) == Some(turn_id))
        .find_map(|entry| {
            entry
                .get("messageId")
                .and_then(Value::as_str)
                .filter(|id| !id.is_empty())
                .map(str::to_string)
        })
    else {
        return;
    };
    let Some(messages) = session
        .snapshot
        .get_mut("messages")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    let Some(index) = messages
        .iter()
        .position(|message| message.get("id").and_then(Value::as_str) == Some(message_id.as_str()))
    else {
        return;
    };
    let current = messages[index].get("metadata").cloned();
    if let Some(merged) = merge_turn_metadata(current, Some(provider_metadata.clone())) {
        messages[index]["metadata"] = merged;
        mark_dialog_dirty_from(session, index);
    }
}

#[cfg(test)]
mod provider_protocol_interruption_tests {
    use super::*;

    #[test]
    fn interruption_marks_v2_step_and_persists_safe_attempt_metadata() {
        let turn_id = "turn-interrupted";
        let mut session = new_session(None, None, "test");
        session.snapshot["messages"] = json!([{
            "id": "assistant-step",
            "role": "assistant",
            "text": ""
        }]);
        session.provider_protocol_log = vec![json!({
            "turnId": turn_id,
            "messageId": "assistant-step",
            "step": {
                "version": 2,
                "turnId": turn_id,
                "status": "awaitingToolResults",
                "assistant": { "content": "", "toolCalls": [] },
                "toolResults": [],
                "replay": null
            }
        })];
        session.runtime_turns.push(runtime_turn(
            turn_id,
            &session.id,
            "waiting_for_tool",
            None,
            None,
        ));
        let metadata = json!({
            "providerAttempts": [{
                "providerId": "provider-a",
                "model": "model-a",
                "outcome": "tool_use"
            }]
        });

        finalize_provider_state_before_interrupt(&mut session, turn_id, Some(&metadata));

        assert_eq!(
            session.provider_protocol_log[0]
                .pointer("/step/status")
                .and_then(Value::as_str),
            Some("interrupted")
        );
        // The stateful-responses cursor merge rides the log's turn→message index.
        assert_eq!(
            session.snapshot["messages"][0]
                .pointer("/metadata/providerAttempts/0/outcome")
                .and_then(Value::as_str),
            Some("tool_use")
        );
        assert_eq!(
            session.runtime_turns[0]
                .pointer("/providerMetadata/providerAttempts/0/model")
                .and_then(Value::as_str),
            Some("model-a")
        );
    }
}

fn clear_pending_interactions_for_turn(state: &mut NativeRuntimeState, turn_id: &str) {
    state
        .pending_permissions
        .retain(|_, request| request.turn_id != turn_id);
    state
        .pending_clarifications
        .retain(|_, request| request.turn_id != turn_id);
}

fn session_turn_status_for_finish_status(status: &str) -> &'static str {
    match status {
        "cancelled" => "cancelled",
        _ => "idle",
    }
}

pub(crate) fn update_runtime_turn(session: &mut NativeSession, turn_id: &str, status: &str) {
    let state_name = match status {
        "finished" => "completed",
        "cancelled" => "cancelled_by_user",
        _ => "completed",
    };
    update_runtime_turn_state(session, turn_id, state_name, None);
}

pub(crate) const STALE_WAITING_FOR_TOOL_WITHOUT_RUNNING_TOOL_MS: i64 = 60_000;

pub(crate) fn reconcile_orphan_running_turn(
    session: &mut NativeSession,
    has_live_cancellation_token: bool,
    reason: &str,
) -> bool {
    let turn_status = session
        .snapshot
        .get("turnStatus")
        .and_then(Value::as_str)
        .unwrap_or("idle");
    let active_turn_id = session
        .snapshot
        .get("activeTurnId")
        .and_then(Value::as_str)
        .map(str::to_string);
    if turn_status != "running" {
        return false;
    }
    let stale_waiting_for_tool = active_turn_id
        .as_deref()
        .is_some_and(|turn_id| stale_waiting_for_tool_without_running_tool(session, turn_id));
    if has_live_cancellation_token && active_turn_id.is_some() && !stale_waiting_for_tool {
        return false;
    }
    // DIAGNOSTIC: log when reconcile decides to cancel a running turn
    eprintln!(
        "[DIAG] reconcile_orphan_running_turn CANCELLING turn: reason={reason} \
         has_live_token={has_live_cancellation_token} \
         active_turn_id={:?} stale_waiting_for_tool={stale_waiting_for_tool}",
        active_turn_id
    );
    let turn_id = active_turn_id.unwrap_or_else(|| format!("orphan-turn-{}", Uuid::new_v4()));
    finalize_provider_state_before_interrupt(session, &turn_id, None);
    session.snapshot["turnStatus"] = Value::String("cancelled".to_string());
    session.snapshot["activeTurnId"] = Value::Null;
    finalize_interrupt_state(session, reason);
    let recovery_message = if stale_waiting_for_tool {
        "Lyra marked this turn as interrupted because it was still waiting for a tool even though no tool was running."
    } else {
        "Lyra marked this turn as cancelled because no live runtime worker was attached to it."
    };
    finish_running_tools_for_turn(
        session,
        &turn_id,
        "cancelled",
        cancelled_tool_output(
            CANCEL_REASON_SESSION_RECOVERY,
            recovery_message,
            "Retry the tool call in a new turn if it is still needed.",
            None,
        ),
    );
    let failure_kind = if stale_waiting_for_tool {
        "stale_waiting_for_tool_without_running_tools"
    } else {
        reason
    };
    update_runtime_turn_state(session, &turn_id, "interrupted", Some(failure_kind));
    touch_session(session);
    true
}

fn stale_waiting_for_tool_without_running_tool(session: &NativeSession, turn_id: &str) -> bool {
    let Some(turn) = session
        .runtime_turns
        .iter()
        .find(|turn| turn.get("runtimeTurnId").and_then(Value::as_str) == Some(turn_id))
    else {
        return false;
    };
    if turn.get("state").and_then(Value::as_str) != Some("waiting_for_tool") {
        return false;
    }
    if running_tool_for_turn(session, turn_id) {
        return false;
    }
    let updated_at_ms = turn
        .get("updatedAtMs")
        .and_then(Value::as_i64)
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    Utc::now().timestamp_millis().saturating_sub(updated_at_ms)
        >= STALE_WAITING_FOR_TOOL_WITHOUT_RUNNING_TOOL_MS
}

fn running_tool_for_turn(session: &NativeSession, turn_id: &str) -> bool {
    session
        .snapshot
        .get("tools")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .any(|tool| {
            if tool.get("status").and_then(Value::as_str) != Some("running") {
                return false;
            }
            let tool_turn_id = super::activity::tool_runtime_turn_id(tool);
            tool_turn_id.is_none_or(|value| value == turn_id)
        })
}

pub(crate) fn update_runtime_turn_state(
    session: &mut NativeSession,
    turn_id: &str,
    state_name: &str,
    failure_kind: Option<&str>,
) {
    let timestamp = now();
    for turn in &mut session.runtime_turns {
        if turn.get("runtimeTurnId").and_then(Value::as_str) == Some(turn_id) {
            turn["state"] = Value::String(state_name.to_string());
            turn["updatedAtIso"] = Value::String(timestamp.clone());
            turn["updatedAtMs"] = Value::Number(Utc::now().timestamp_millis().into());
            if matches!(
                state_name,
                "completed" | "cancelled_by_user" | "interrupted"
            ) {
                turn["completedAtIso"] = Value::String(timestamp.clone());
                turn["completedAtMs"] = Value::Number(Utc::now().timestamp_millis().into());
            }
            if matches!(state_name, "completed" | "cancelled_by_user") {
                turn["failureKind"] = Value::Null;
            } else if state_name == "interrupted" {
                turn["failureKind"] = failure_kind
                    .map(|value| Value::String(value.to_string()))
                    .unwrap_or(Value::Null);
            } else if let Some(failure_kind) = failure_kind {
                turn["failureKind"] = Value::String(failure_kind.to_string());
            }
        }
    }
}

pub(crate) fn set_runtime_turn_state(
    session: &mut NativeSession,
    turn_id: &str,
    state_name: &str,
    failure_kind: Option<&str>,
) {
    update_runtime_turn_state(session, turn_id, state_name, failure_kind);
}

pub(crate) fn turn_was_cancelled(session_id: &str, turn_id: &str) -> bool {
    if super::session_runtime::turn_cancellation_requested(turn_id) {
        return true;
    }
    // A state lock failure must not fabricate a cancellation. RecoveringMutex
    // makes this branch unreachable today; the fail-open default keeps the
    // semantics honest if the lock ever changes: unknown ≠ cancelled.
    state()
        .lock()
        .map(|state| {
            let snapshot_turn_id = state
                .sessions
                .get(session_id)
                .and_then(|session| session.snapshot.get("activeTurnId"))
                .and_then(Value::as_str)
                .map(str::to_string);
            snapshot_turn_id.as_deref() != Some(turn_id)
        })
        .unwrap_or(false)
}

pub(crate) fn cancel_turn(payload: Value) -> AgentRuntimeResult<Value> {
    let id = required_session_id(&payload)?;
    if let Some(turn_id) = super::session_runtime::active_turn_id(&id) {
        super::session_runtime::request_turn_cancellation(&turn_id);
    }
    let (turn_id, callback, events, ledger_turn) = {
        let mut state = match state().try_lock() {
            Ok(state) => state,
            Err(std::sync::TryLockError::WouldBlock) => {
                return Ok(json!({
                    "sessionId": id,
                    "status": "cancelling",
                    "deferred": true,
                }));
            }
            Err(std::sync::TryLockError::Poisoned(_)) => {
                return Err(AgentRuntimeError::Core(
                    "agent runtime state lock failed".to_string(),
                ));
            }
        };
        let root = state.root.clone();
        let turn_id = state
            .sessions
            .get(&id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?
            .snapshot
            .get("activeTurnId")
            .and_then(Value::as_str)
            .map(str::to_string)
            .ok_or_else(|| {
                AgentRuntimeError::Core(format!("turn not running for session: {id}"))
            })?;
        super::session_runtime::request_turn_cancellation(&turn_id);
        clear_pending_interactions_for_turn(&mut state, &turn_id);
        // User stop: abort clears the steer queue (reference semantics).
        // Queued messages stay in the transcript, unanswered until the
        // user's next turn.
        super::session_runtime::take_pending_steers(&id);
        let provider_metadata = super::session_runtime::take_turn_provider_metadata(&id, &turn_id);
        let session = state
            .sessions
            .get_mut(&id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
        finalize_provider_state_before_interrupt(session, &turn_id, provider_metadata.as_ref());
        session.snapshot["turnStatus"] = Value::String("cancelled".to_string());
        session.snapshot["activeTurnId"] = Value::Null;
        finalize_interrupt_state(session, "cancelled_by_user");
        finish_running_tools_for_turn(
            session,
            &turn_id,
            "cancelled",
            cancelled_tool_output(
                CANCEL_REASON_USER_STOP,
                "Lyra tool call was cancelled by the user.",
                "Stop this tool call and continue only after a new user turn.",
                None,
            ),
        );
        update_runtime_turn(session, &turn_id, "cancelled");
        touch_session(session);
        let ledger_session = session.clone();
        let callback = event_callback();
        state.save_state()?;
        let events = vec![json!({
            "kind": "turnStateChanged",
            "sessionId": id,
            "turnId": turn_id,
            "state": "cancelled",
            "reason": "user_cancelled",
        })];
        (
            turn_id,
            callback,
            events,
            (root, ledger_session, "cancelled".to_string()),
        )
    };
    for event in events {
        emit_with_callback(&callback, event);
    }
    let (root, session, status) = ledger_turn;
    let _ = record_turn_finished(
        &root,
        &session,
        &turn_id,
        &status,
        Some("turn cancelled by user"),
    );
    Ok(json!({
        "sessionId": id,
        "turnId": turn_id,
        "status": "cancelling"
    }))
}

// ── Goal continuation ───────────────────────────────────────────────────
// turn 成功结束后，系统评估是否需要自动继续推进 goal。
// 判定信号：plan 处于 executing_todo 阶段 + Todo/Goal 的真实状态。
// 触发方式：send_turn(uiHidden=true, goalContinuation=true, onlyIfIdle=true)。
// continuation prompt 在 turn 结束后被 prune_goal_continuation_messages 剪除，
// 不保留在会话历史，不持续占用 model context。

/// 从 messages 中移除 metadata.goalContinuation == true 的 user 消息。
/// 这些是系统自动发送的 continuation prompt，turn 结束后不保留在会话历史。
fn prune_goal_continuation_messages(snapshot: &mut Value) -> Option<usize> {
    let messages = snapshot.get_mut("messages").and_then(Value::as_array_mut)?;
    let first_removed = messages.iter().position(|msg| {
        msg.get("role").and_then(Value::as_str) == Some("user")
            && msg.pointer("/metadata/goalContinuation") == Some(&Value::Bool(true))
    });
    messages.retain(|msg| {
        !(msg.get("role").and_then(Value::as_str) == Some("user")
            && msg.pointer("/metadata/goalContinuation") == Some(&Value::Bool(true)))
    });
    first_removed
}

fn running_worker_lines(snapshot: &Value) -> Vec<String> {
    snapshot
        .get("subagents")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter(|child| child.get("status").and_then(Value::as_str) == Some("running"))
        .map(|child| {
            child
                .get("description")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .or_else(|| child.get("id").and_then(Value::as_str))
                .unwrap_or("worker")
                .to_string()
        })
        .collect()
}

fn prune_goal_continuation_session_messages(session: &mut NativeSession) {
    let first_removed = prune_goal_continuation_messages(&mut session.snapshot);
    if let Some(index) = first_removed {
        mark_dialog_dirty_from(session, index);
    }
}

/// 动态拼装 continuation prompt。
fn build_continuation_prompt(
    incomplete: &[&Value],
    finish_required: bool,
    running_workers: &[String],
) -> String {
    let mut sections = Vec::new();
    sections.push("[Goal Continuation] 当前 plan 仍处于执行阶段，需要继续推进。".to_string());

    if !running_workers.is_empty() {
        sections.push(format!(
            "\n仍在运行的工人（{}）：{}",
            running_workers.len(),
            running_workers.join("; ")
        ));
        sections.push(
            "不要重做这些工人已经覆盖的切片，也不要改写他们的输出文件。工人是 Lyra 会话，不是系统进程。进程列表为空、git 状态干净、文件还没落盘，都不表示它停了。不要用 ps、pgrep、git status 或去读它的输出判断它是否还在。完成时会通知。不要编造它的结果。自己雇的 Agent 不会勾选 todo；验证完成后由本会话 todo_update。"
                .to_string(),
        );
    }

    if !incomplete.is_empty() {
        sections.push(format!("\n未完成 todo（{} 个）：", incomplete.len()));
        for todo in incomplete {
            let status = todo
                .pointer("/status")
                .and_then(Value::as_str)
                .unwrap_or("pending");
            let content = todo
                .pointer("/content")
                .and_then(Value::as_str)
                .unwrap_or("");
            let id = todo.pointer("/id").and_then(Value::as_str).unwrap_or("");
            sections.push(format!("  - [{}] [{}] {}", id, status, content));
        }
    }

    sections.push(
        "\n改状态请用 native todo_update / todo_write / todo_finish；/tools/todo/read 只读，不能勾选。"
            .to_string(),
    );

    if !incomplete.is_empty() {
        sections.push(
            "请继续推进未完成的工作。继续当前清单，不要因为条目多就收窄范围或提前 todo_finish。若本会话自己雇了 Agent 来覆盖其中某项，工人结束后由你验证并勾选，不要假设已经勾上。依赖工人草稿的终稿，等对应工人结束后再交卷。"
                .to_string(),
        );
    } else if finish_required {
        sections.push(
            "\n所有 Todo 已进入终态，但 Goal 尚未结束。请调用 todo_finish，报告真实的 completed、failed 或 cancelled 结果。"
                .to_string(),
        );
    }
    sections.join("\n")
}

fn update_goal_progress_state(
    session: &mut NativeSession,
    fingerprint: &str,
    waiting_on_workers: bool,
) -> bool {
    let previous = session
        .snapshot
        .pointer("/goalContinuation/fingerprint")
        .and_then(Value::as_str)
        .map(str::to_string);
    let paused = session
        .snapshot
        .pointer("/goalContinuation/paused")
        .and_then(Value::as_bool)
        == Some(true);
    if paused && previous.as_deref() == Some(fingerprint) {
        return false;
    }
    let stagnant_turns = if previous.as_deref() == Some(fingerprint) {
        session
            .snapshot
            .pointer("/goalContinuation/stagnantTurns")
            .and_then(Value::as_u64)
            .unwrap_or_default()
            .saturating_add(1)
    } else {
        0
    };
    if stagnant_turns >= 2 {
        if waiting_on_workers {
            session.snapshot["goalContinuation"] = json!({
                "fingerprint": fingerprint,
                "stagnantTurns": stagnant_turns,
                "paused": false,
                "reason": "waiting_workers",
            });
            return false;
        }
        session.snapshot["goalContinuation"] = json!({
            "fingerprint": fingerprint,
            "stagnantTurns": stagnant_turns,
            "paused": true,
            "reason": "no_progress",
        });
        return false;
    }
    session.snapshot["goalContinuation"] = json!({
        "fingerprint": fingerprint,
        "stagnantTurns": stagnant_turns,
        "paused": false,
        "reason": Value::Null,
    });
    true
}

/// turn 成功结束后，评估是否需要 goal continuation。
/// 满足条件时通过 send_turn 发送一条 uiHidden + goalContinuation 的隐式 prompt。
fn parent_id_for_session(session_id: &str) -> Option<String> {
    state().lock().ok().and_then(|state| {
        state
            .sessions
            .get(session_id)
            .and_then(|session| parent_session_id_of(&session.snapshot))
    })
}

fn evaluate_goal_continuation(session_id: &str, _turn_id: &str) {
    let prompt = {
        let Ok(mut state) = state().lock() else {
            return;
        };
        goal_continuation_prompt_locked(&mut state, session_id)
    };
    let Some(prompt) = prompt else {
        return;
    };
    let _ = send_turn(json!({
        "sessionId": session_id,
        "text": prompt,
        "uiHidden": true,
        "goalContinuation": true,
        "onlyIfIdle": true
    }));
}

fn goal_continuation_prompt_locked(
    state: &mut NativeRuntimeState,
    session_id: &str,
) -> Option<String> {
    let snapshot = state.sessions.get(session_id)?.snapshot.clone();
    if is_subagent_snapshot(&snapshot) {
        return None;
    }
    let host_id = todo_host_session_id(session_id, &snapshot);
    let host_snapshot = state
        .sessions
        .get(&host_id)
        .map(|host| host.snapshot.clone())
        .unwrap_or_else(|| snapshot.clone());
    let phase = host_snapshot.pointer("/plan/phase").and_then(Value::as_str);
    if phase != Some(PLAN_PHASE_EXECUTING_TODO) && phase != Some(PLAN_PHASE_TODO_REQUIRED) {
        return None;
    }
    if snapshot
        .get("turnStatus")
        .and_then(Value::as_str)
        .unwrap_or("idle")
        != "idle"
    {
        return None;
    }
    let project_status = host_snapshot
        .pointer("/projectTodo/status")
        .and_then(Value::as_str)
        .unwrap_or("running");
    if matches!(project_status, "completed" | "failed" | "cancelled") {
        return None;
    }
    let todos = host_snapshot
        .pointer("/projectTodo/todos")
        .or_else(|| host_snapshot.get("todos"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let incomplete = goal_incomplete_for_session(&snapshot, &todos);
    let all_terminal = !todos.is_empty()
        && todos.iter().all(|todo| {
            matches!(
                todo.get("status").and_then(Value::as_str),
                Some("completed" | "failed" | "skipped" | "cancelled")
            )
        });
    let finish_required = !is_subagent_snapshot(&snapshot) && incomplete.is_empty() && all_terminal;
    if incomplete.is_empty() && !finish_required && !snapshot_has_running_workers(&snapshot) {
        return None;
    }
    let waiting_on_workers = snapshot_has_running_workers(&snapshot);
    let fingerprint = serde_json::to_string(&json!({
        "todos": todos.iter().map(|todo| json!({
            "id": todo.get("id").cloned().unwrap_or(Value::Null),
            "status": todo.get("status").cloned().unwrap_or(Value::Null),
        })).collect::<Vec<_>>(),
        "projectStatus": host_snapshot.pointer("/projectTodo/status").cloned().unwrap_or(Value::Null),
        "workers": snapshot.get("subagents").cloned().unwrap_or(Value::Null),
    }))
    .unwrap_or_default();
    let running_workers = running_worker_lines(&snapshot);
    let prompt = {
        let session = state.sessions.get_mut(session_id)?;
        if !update_goal_progress_state(session, &fingerprint, waiting_on_workers) {
            touch_session(session);
            None
        } else {
            let prompt = build_continuation_prompt(&incomplete, finish_required, &running_workers);
            touch_session(session);
            Some(prompt)
        }
    };
    let _ = state.save_state();
    prompt
}

#[cfg(test)]
mod title_clip_tests {
    use super::clip_auto_session_title;

    #[test]
    fn title_clip_keeps_a_marker_that_starts_inside_the_limit() {
        let marker = "⟦image:local-image-307ae69e-37cd-4d2b-a2df-111111111111⟧";
        let text = format!("左下角是上一张照片 {marker} 后面还有");
        let title = clip_auto_session_title(&text);
        assert!(title.contains(marker), "{title}");
        assert!(!title.contains("后面还有"), "{title}");
    }
}
