use super::{
    AgentRuntimeError, AgentRuntimeResult, NativeSession, TrimControllerConfig, Value,
    active_clarification_projection, controller::*, cut_store, journal::*, state,
};
use crate::native_backend::{
    index_cut_pack_for_recall, maybe_govern_memory_volume, record_session_trimmed, touch_session,
};
use std::{collections::HashSet, path::Path, path::PathBuf, thread};
use uuid::Uuid;

#[cfg(test)]
pub(crate) fn maybe_trim_session(
    session: &mut NativeSession,
    root: &Path,
    config: &TrimControllerConfig,
) -> AgentRuntimeResult<bool> {
    let active_clarification = state()
        .lock()
        .ok()
        .and_then(|state| active_clarification_projection(&state, &session.id));
    maybe_trim_session_with_active_clarification(
        session,
        root,
        config,
        active_clarification.as_ref(),
    )
}

fn maybe_trim_session_with_active_clarification(
    session: &mut NativeSession,
    root: &Path,
    config: &TrimControllerConfig,
    active_clarification: Option<&Value>,
) -> AgentRuntimeResult<bool> {
    resume_pending_trim_journal(session, root)?;
    let Some(plan) = evaluate(session, config, active_clarification) else {
        return Ok(false);
    };
    execute_trim_plan(session, root, plan)
}

pub(crate) fn resume_pending_trim_journal(
    session: &mut NativeSession,
    root: &Path,
) -> AgentRuntimeResult<()> {
    let conn = open_session_connection(root, &session.id)?;
    let entries = list_incomplete_journals(&conn)?;
    if !entries.is_empty() && !session.dialog_loaded {
        crate::native_backend::fill_dialog(root, session)?;
    }
    for entry in entries {
        resume_journal_entry(session, root, &conn, &entry)?;
    }
    Ok(())
}

fn execute_trim_plan(
    session: &mut NativeSession,
    root: &Path,
    plan: TrimPlan,
) -> AgentRuntimeResult<bool> {
    let conn = open_session_connection(root, &session.id)?;
    let journal_id = format!("trim-{}", Uuid::new_v4());
    let ordinal_start = plan.trim_ordinals.first().copied().map(|v| v as i64);
    let ordinal_end = plan.trim_ordinals.last().copied().map(|v| v as i64);
    let entry = TrimJournalEntry {
        journal_id: journal_id.clone(),
        state: TrimJournalState::PendingTrim,
        cut_pack_id: None,
        msg_ids: plan.msg_ids.clone(),
        ordinal_start,
        ordinal_end,
        token_before: plan.token_before as i64,
        token_after: Some(plan.token_after as i64),
    };
    insert_journal(&conn, &entry)?;
    resume_journal_entry(session, root, &conn, &entry)?;
    mark_trim_cooldown(session);
    session.dirty = true;
    Ok(true)
}

fn resume_journal_entry(
    session: &mut NativeSession,
    root: &Path,
    conn: &rusqlite::Connection,
    entry: &TrimJournalEntry,
) -> AgentRuntimeResult<()> {
    let mut state = entry.state.clone();
    let mut cut_pack: Option<cut_store::CutPackRef> = None;

    if state == TrimJournalState::PendingTrim {
        let messages = load_journal_messages(session, entry)?;
        if messages.is_empty() {
            update_journal_state(
                conn,
                &entry.journal_id,
                TrimJournalState::ManifestCommitted,
                None,
                entry.token_after,
            )?;
            return Ok(());
        }
        let pack = cut_store::append_cut_pack(root, &session.id, &messages)?;
        update_journal_state(
            conn,
            &entry.journal_id,
            TrimJournalState::Archived,
            Some(pack.pack_id.as_str()),
            entry.token_after,
        )?;
        state = TrimJournalState::Archived;
        cut_pack = Some(pack);
    }

    if state == TrimJournalState::Archived {
        remove_trimmed_messages(
            session,
            &entry.msg_ids,
            entry.ordinal_start,
            entry.ordinal_end,
        );
        update_journal_state(
            conn,
            &entry.journal_id,
            TrimJournalState::LiveDeleted,
            cut_pack.as_ref().map(|pack| pack.pack_id.as_str()),
            entry.token_after,
        )?;
        state = TrimJournalState::LiveDeleted;
    }

    if state == TrimJournalState::LiveDeleted {
        if cut_pack.is_none() {
            if let Some(pack_id) = entry.cut_pack_id.as_deref() {
                let manifest = cut_store::load_manifest(root, &session.id)?;
                if let Some(pack_entry) = manifest.packs.iter().find(|p| p.pack_id == pack_id) {
                    cut_pack = Some(cut_store::CutPackRef {
                        pack_id: pack_entry.pack_id.clone(),
                        path: pack_entry.path.clone(),
                        ordinal_start: pack_entry.ordinal_start,
                        ordinal_end: pack_entry.ordinal_end,
                        token_total: pack_entry.token_total,
                        msg_count: pack_entry.msg_count,
                        deduped_msg_ids: pack_entry.deduped_msg_ids.clone(),
                    });
                }
            }
        }
        if let Some(pack) = cut_pack.as_ref() {
            cut_store::update_manifest_with_pack(root, &session.id, pack)?;
            let _ = index_cut_pack_for_recall(root, &session.id, pack);
            let _ = record_session_trimmed(
                root,
                session,
                serde_json::json!({
                    "journalId": entry.journal_id,
                    "cutPackId": pack.pack_id,
                    "ordinalStart": pack.ordinal_start,
                    "ordinalEnd": pack.ordinal_end,
                    "tokenTotal": pack.token_total,
                    "messageCount": pack.msg_count,
                    "dedupedMessageCount": pack.deduped_msg_ids.len(),
                }),
            );
            let _ = cut_store::maybe_compact_cuts(root, &session.id);
        }
        update_journal_state(
            conn,
            &entry.journal_id,
            TrimJournalState::ManifestCommitted,
            cut_pack.as_ref().map(|pack| pack.pack_id.as_str()),
            entry.token_after,
        )?;
    }

    session.dirty = true;
    Ok(())
}

fn remove_trimmed_messages(
    session: &mut NativeSession,
    msg_ids: &[String],
    ordinal_start: Option<i64>,
    ordinal_end: Option<i64>,
) {
    let dirty_from = ordinal_start.unwrap_or(0).max(0) as usize;
    let Some(messages) = session
        .snapshot
        .get_mut("messages")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    messages.retain(|message| {
        let msg_id = message.get("id").and_then(Value::as_str).unwrap_or("");
        !msg_ids.iter().any(|id| id == msg_id)
    });
    if msg_ids.is_empty()
        && let (Some(start), Some(end)) = (ordinal_start, ordinal_end)
    {
        let mut ordinal = 0_i64;
        messages.retain(|_| {
            let keep = ordinal < start || ordinal > end;
            ordinal += 1;
            keep
        });
    }
    crate::native_backend::mark_dialog_dirty_from(session, dirty_from);
}

pub(crate) fn spawn_post_turn_session_trim(root: PathBuf, session_id: String) {
    thread::spawn(move || {
        let result = (|| -> AgentRuntimeResult<()> {
            let (mut session, active_clarification) = {
                let state = state().lock().map_err(|_| {
                    AgentRuntimeError::Core("agent runtime state lock failed".to_string())
                })?;
                if state.active_compressions.contains(&session_id) {
                    // ponytail: 压缩进行中，跳过本轮 trim，避免两个线程并发写 session 互相覆盖。
                    // 压缩完成后下轮 turn 结束若 trim 条件仍满足会自然恢复。
                    return Ok(());
                }
                let Some(session) = state.sessions.get(&session_id).cloned() else {
                    return Ok(());
                };
                let active_clarification = active_clarification_projection(&state, &session_id);
                (session, active_clarification)
            };
            let baseline_message_ids = session_message_ids(&session);
            let baseline_updated_at = session
                .snapshot
                .get("updatedAt")
                .and_then(Value::as_str)
                .map(str::to_string);
            let messages = session
                .snapshot
                .get("messages")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let session_tool_count = session
                .snapshot
                .get("tools")
                .and_then(Value::as_array)
                .map(|tools| tools.len())
                .unwrap_or(0);
            let signals = crate::retention_policy::retention_signals_from_session_messages(
                &messages,
                session_tool_count,
                None,
            );
            let config = crate::retention_policy::trim_controller_config_from_policy(
                crate::retention_policy::retention_policy_from_messages(&messages, &signals),
            );
            let _ = maybe_trim_session_with_active_clarification(
                &mut session,
                &root,
                &config,
                active_clarification.as_ref(),
            )?;
            let _ = maybe_govern_memory_volume(&root);
            if session.dirty {
                apply_trimmed_session_result(
                    &session_id,
                    session,
                    baseline_message_ids,
                    baseline_updated_at,
                )?;
            }
            Ok(())
        })();
        if let Err(error) = result {
            eprintln!("[lyra-agent-runtime] session trim failed for {session_id}: {error}");
        }
    });
}

fn apply_trimmed_session_result(
    session_id: &str,
    trimmed_session: NativeSession,
    baseline_message_ids: Vec<String>,
    baseline_updated_at: Option<String>,
) -> AgentRuntimeResult<()> {
    let trimmed_message_ids = session_message_ids(&trimmed_session)
        .into_iter()
        .collect::<HashSet<_>>();
    let removed_message_ids = baseline_message_ids
        .into_iter()
        .filter(|id| !trimmed_message_ids.contains(id))
        .collect::<Vec<_>>();
    let memory_trim = trimmed_session.snapshot.get("memoryTrim").cloned();

    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let mut should_save = false;
    if let Some(live_session) = state.sessions.get_mut(session_id) {
        let live_updated_at = live_session
            .snapshot
            .get("updatedAt")
            .and_then(Value::as_str)
            .map(str::to_string);
        if removed_message_ids.is_empty() && live_updated_at == baseline_updated_at {
            *live_session = trimmed_session;
            live_session.dirty = true;
            should_save = true;
        } else {
            let before_len = message_count(live_session);
            if !removed_message_ids.is_empty() {
                remove_trimmed_messages(live_session, &removed_message_ids, None, None);
            }
            if let Some(memory_trim) = memory_trim
                && let Some(object) = live_session.snapshot.as_object_mut()
            {
                object.insert("memoryTrim".to_string(), memory_trim);
            }
            if message_count(live_session) != before_len
                || live_session.snapshot.get("memoryTrim").is_some()
            {
                touch_session(live_session);
                should_save = true;
            }
        }
    }
    if should_save {
        state.save_state()?;
    }
    Ok(())
}

fn session_message_ids(session: &NativeSession) -> Vec<String> {
    session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|message| {
            message
                .get("id")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
}

fn message_count(session: &NativeSession) -> usize {
    session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .map(Vec::len)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::native_backend::save_session;
    use serde_json::json;
    use std::collections::HashMap;
    use tempfile::tempdir;

    fn test_message(id: &str, role: &str, text: &str) -> Value {
        json!({
            "id": id,
            "role": role,
            "text": text,
            "createdAt": "2026-06-19T00:00:00.000Z"
        })
    }

    fn overflow_session(session_id: &str) -> NativeSession {
        let mut messages = vec![
            test_message("msg-system", "system", "system prompt"),
            test_message("msg-user-0", "user", "first user intent"),
        ];
        for index in 1..8 {
            messages.push(test_message(
                &format!("msg-assistant-{index}"),
                "assistant",
                &"x".repeat(3_200),
            ));
            messages.push(test_message(
                &format!("msg-user-{index}"),
                "user",
                &"x".repeat(1_200),
            ));
        }
        messages.push(test_message(
            "msg-user-latest",
            "user",
            "latest user intent",
        ));

        NativeSession {
            id: session_id.to_string(),
            snapshot: json!({
                "id": session_id,
                "title": "Trim Lock Test",
                "sessionKind": "normal",
                "workingDir": "/tmp",
                "projectBound": true,
                "workingDirIsHome": false,
                "turnStatus": "idle",
                "messages": messages,
                "updatedAt": "2026-06-19T00:00:00.000Z"
            }),
            created_at: "2026-06-19T00:00:00.000Z".to_string(),
            saved: false,
            save_label: None,
            archived: false,
            custom_title: None,
            short_name: None,
            runtime_turns: Vec::new(),
            rollback_checkpoints: Vec::new(),
            file_read_state: HashMap::new(),
            provider_protocol_log: vec![],
            dirty: true,
            dialog_dirty_from: Some(0),
            persisted_dialog_len: 0,
            dialog_loaded: true,
            ephemeral: false,
            stream_journal_sequence: 0,
        }
    }

    #[test]
    fn supplied_clarification_projection_does_not_reenter_state_lock() {
        let dir = tempdir().expect("tempdir");
        let root = dir.path().to_path_buf();
        let mut session = overflow_session("session-trim-lock-regression");
        save_session(&root, &session).expect("save session");

        let _guard = state().lock().expect("state lock");
        let trimmed = maybe_trim_session_with_active_clarification(
            &mut session,
            &root,
            &TrimControllerConfig {
                trim_trigger_tokens: 1_000_000,
                target_tokens: 900_000,
                protected_recent_tokens: 500,
            },
            None,
        )
        .expect("trim without reentering state lock");

        assert!(!trimmed);
    }
}
