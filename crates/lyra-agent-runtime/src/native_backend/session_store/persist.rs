use super::{schema::*, *};
use rusqlite::{OptionalExtension, params};
use serde_json::{Value, json};

pub(super) fn load_session(
    root: &Path,
    session_id: &str,
) -> AgentRuntimeResult<Option<NativeSession>> {
    load_session_inner(root, session_id, true)
}

/// Startup index. OpenCode `Session.list` and ZCode `getSession` never read
/// every transcript. Only a live turn needs its dialog in memory.
pub(super) fn load_session_for_startup(
    root: &Path,
    session_id: &str,
) -> AgentRuntimeResult<Option<NativeSession>> {
    let db_path = session_db_path(root, session_id);
    if !db_path.is_file() {
        return Ok(None);
    }
    let conn = open_connection(&db_path)?;
    init_schema(&conn)?;
    let running = conn
        .query_row(
            "SELECT turn_status FROM session_meta WHERE session_id = ?1",
            params![session_id],
            |row| row.get::<_, String>(0),
        )
        .unwrap_or_default();
    drop(conn);
    load_session_inner(root, session_id, running == "running")
}

pub(super) fn fill_dialog(root: &Path, session: &mut NativeSession) -> AgentRuntimeResult<()> {
    if session.dialog_loaded {
        return Ok(());
    }
    let db_path = session_db_path(root, &session.id);
    if !db_path.is_file() {
        session.dialog_loaded = true;
        return Ok(());
    }
    let connection = open_connection(&db_path)?;
    init_schema(&connection)?;
    let conn = connection
        .unchecked_transaction()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let replayed: bool = conn
        .query_row("SELECT EXISTS(SELECT 1 FROM stream_deltas)", [], |row| {
            row.get(0)
        })
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let messages = read_dialog(&conn)?;
    session.stream_journal_sequence = conn
        .query_row(
            "SELECT COALESCE(MAX(sequence), ?1) FROM stream_deltas",
            [session.stream_journal_sequence],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .max(session.stream_journal_sequence);
    session.persisted_dialog_len = messages.len();
    session.snapshot["messages"] = Value::Array(messages);
    session.dialog_loaded = true;
    if replayed {
        mark_dialog_dirty_from(session, 0);
    }
    Ok(())
}

fn load_session_inner(
    root: &Path,
    session_id: &str,
    load_dialog: bool,
) -> AgentRuntimeResult<Option<NativeSession>> {
    let db_path = session_db_path(root, session_id);
    if !db_path.is_file() {
        return Ok(None);
    }
    let connection = open_connection(&db_path)?;
    init_schema(&connection)?;
    let conn = connection
        .unchecked_transaction()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    let meta = conn
        .query_row(
            "SELECT title, session_kind, working_dir, project_bound, working_dir_is_home,
                    turn_status, active_turn_id, created_at_iso,
                    updated_at_iso, saved, save_label, archived,
                    custom_title, short_name
             FROM session_meta WHERE session_id = ?1",
            params![session_id],
            |row| {
                Ok(SessionMetaRow {
                    title: row.get(0)?,
                    session_kind: row.get(1)?,
                    working_dir: row.get(2)?,
                    project_bound: row.get::<_, i64>(3)? != 0,
                    working_dir_is_home: row.get::<_, i64>(4)? != 0,
                    turn_status: row.get(5)?,
                    active_turn_id: row.get(6)?,
                    created_at_iso: row.get(7)?,
                    updated_at_iso: row.get(8)?,
                    saved: row.get::<_, i64>(9)? != 0,
                    save_label: row.get(10)?,
                    archived: row.get::<_, i64>(11)? != 0,
                    custom_title: row.get(12)?,
                    short_name: row.get(13)?,
                })
            },
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    let messages = if load_dialog {
        read_dialog(&conn)?
    } else {
        Vec::new()
    };

    let (snapshot_json, runtime_turns_json, rollback_json, file_read_json, provider_protocol_json, stored_sequence) = conn
        .query_row(
            "SELECT snapshot_json, runtime_turns_json, rollback_checkpoints_json, file_read_state_json, provider_protocol_json, stream_journal_sequence
             FROM session_bundle WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            },
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    let mut snapshot: Value = serde_json::from_str(&snapshot_json)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    snapshot["id"] = Value::String(session_id.to_string());
    snapshot["title"] = Value::String(meta.title.clone());
    snapshot["sessionKind"] = Value::String(meta.session_kind.clone());
    snapshot["workingDir"] = Value::String(meta.working_dir.clone());
    snapshot["projectBound"] = Value::Bool(meta.project_bound);
    snapshot["workingDirIsHome"] = Value::Bool(meta.working_dir_is_home);
    let turn_status = normalize_persisted_turn_status(&meta.turn_status);
    snapshot["turnStatus"] = Value::String(turn_status.clone());
    snapshot["activeTurnId"] = meta
        .active_turn_id
        .as_ref()
        .filter(|_| turn_status == "running")
        .map(|value| Value::String(value.clone()))
        .unwrap_or(Value::Null);
    snapshot["updatedAt"] = Value::String(meta.updated_at_iso.clone());
    let persisted_dialog_len = messages.len();
    let replayed: bool = load_dialog
        && conn
            .query_row("SELECT EXISTS(SELECT 1 FROM stream_deltas)", [], |row| {
                row.get(0)
            })
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    snapshot["messages"] = Value::Array(messages);
    super::super::sanitize_session_snapshot(&mut snapshot);

    let stream_journal_sequence = if load_dialog {
        conn.query_row(
            "SELECT COALESCE(MAX(sequence), ?1) FROM stream_deltas",
            [stored_sequence],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .max(stored_sequence)
    } else {
        stored_sequence
    };
    // Pending control checkpoints do not describe the on-disk metadata yet.
    // Expose only the revision of the materialized snapshot and replayed data.
    let visible_revision: i64 = if load_dialog {
        conn.query_row(
            "SELECT COALESCE(MAX(sequence), ?1) FROM stream_deltas WHERE channel != 'checkpoint'",
            [stored_sequence],
            |row| row.get(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
    } else {
        stored_sequence
    };
    snapshot["revision"] = json!(visible_revision.max(stored_sequence).to_string());
    let runtime_turns: Vec<Value> = serde_json::from_str(&runtime_turns_json)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let rollback_checkpoints: Vec<RollbackCheckpoint> = serde_json::from_str(&rollback_json)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let file_read_state: HashMap<String, FileReadStateEntry> =
        serde_json::from_str(&file_read_json)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let provider_protocol_log: Vec<Value> = serde_json::from_str(&provider_protocol_json)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    Ok(Some(NativeSession {
        id: session_id.to_string(),
        snapshot,
        created_at: meta.created_at_iso,
        saved: meta.saved,
        save_label: meta.save_label,
        archived: meta.archived,
        custom_title: meta.custom_title,
        short_name: meta.short_name,
        runtime_turns,
        rollback_checkpoints,
        file_read_state,
        provider_protocol_log,
        dirty: replayed,
        dialog_dirty_from: replayed.then_some(0),
        persisted_dialog_len,
        dialog_loaded: load_dialog,
        ephemeral: false,
        stream_journal_sequence,
    }))
}

fn read_dialog(conn: &rusqlite::Connection) -> AgentRuntimeResult<Vec<Value>> {
    let mut statement = conn
        .prepare("SELECT content_raw FROM session_dialog ORDER BY ordinal ASC")
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let mut messages = Vec::new();
    for row in rows {
        let raw = row.map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let message = serde_json::from_str(&raw)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        messages.push(message);
    }
    let mut deltas = conn
        .prepare("SELECT message_id, channel, delta FROM stream_deltas ORDER BY sequence")
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let rows = deltas
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    for row in rows {
        let (id, channel, delta) =
            row.map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        if channel == "checkpoint" {
            continue;
        }
        if channel == "created" || channel == "committed" {
            let replacement = serde_json::from_str(&delta)
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            if let Some(index) = messages
                .iter()
                .position(|message: &Value| message.get("id").and_then(Value::as_str) == Some(&id))
            {
                if channel == "committed" {
                    messages[index] = replacement;
                }
            } else {
                messages.push(replacement);
            }
            continue;
        }
        if let Some(message) = messages
            .iter_mut()
            .find(|message: &&mut Value| message.get("id").and_then(Value::as_str) == Some(&id))
        {
            if channel == "reasoning" {
                append_reasoning_to_message(message, &delta, "done");
            } else {
                append_text_to_message(message, &delta);
            }
        }
    }
    Ok(messages)
}

pub(super) fn list_session_summaries_from_meta(root: &Path) -> Vec<Value> {
    super::list_session_ids(root)
        .unwrap_or_default()
        .into_iter()
        .filter_map(
            |session_id| match load_session_list_summary(root, &session_id) {
                Ok(summary) => summary,
                Err(error) => Some(session_database_error_summary(
                    root,
                    &session_id,
                    &error.to_string(),
                )),
            },
        )
        .collect()
}

fn load_session_list_summary(root: &Path, session_id: &str) -> AgentRuntimeResult<Option<Value>> {
    let db_path = session_db_path(root, session_id);
    if !db_path.is_file() {
        return Ok(None);
    }
    let conn = open_connection(&db_path)?;
    init_schema(&conn)?;
    let meta = match conn.query_row(
        "SELECT title, session_kind, working_dir, turn_status,
                created_at_iso, updated_at_iso, saved, save_label,
                archived, custom_title, short_name
         FROM session_meta WHERE session_id = ?1",
        params![session_id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, i64>(6)? != 0,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, i64>(8)? != 0,
                row.get::<_, Option<String>>(9)?,
                row.get::<_, Option<String>>(10)?,
            ))
        },
    ) {
        Ok(meta) => meta,
        Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(None),
        Err(error) => return Err(AgentRuntimeError::Core(error.to_string())),
    };
    let (
        title,
        session_kind,
        working_dir,
        turn_status,
        created_at_iso,
        updated_at_iso,
        saved,
        save_label,
        archived,
        custom_title,
        short_name,
    ) = meta;
    if session_kind == SUBAGENT_SESSION_KIND || turn_status == "deleted" {
        return Ok(None);
    }
    let message_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM session_dialog", [], |row| row.get(0))
        .unwrap_or(0);
    let shown_title = custom_title
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(title.as_str());
    let title_message = if shown_title.contains('⟦') || title.contains('⟦') {
        conn.query_row(
            "SELECT content_raw FROM session_dialog WHERE role = 'user' ORDER BY ordinal ASC LIMIT 1",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    } else {
        None
    };
    let title_messages = title_message.as_ref().map(std::slice::from_ref);
    let records = crate::native_backend::projections::title_marker_records(
        title_messages.unwrap_or(&[]),
        &title,
        custom_title.as_deref(),
    );
    let status = if archived {
        "archived"
    } else {
        turn_status.as_str()
    };
    Ok(Some(json!({
        "id": session_id,
        "title": title,
        "sessionKind": session_kind,
        "customTitle": custom_title,
        "shortName": short_name,
        "status": status,
        "providerKey": Value::Null,
        "providerLabel": Value::Null,
        "model": Value::Null,
        "messageCount": message_count,
        "createdAt": created_at_iso,
        "updatedAt": updated_at_iso,
        "lastActiveAt": updated_at_iso,
        "saved": saved,
        "saveLabel": save_label,
        "archived": archived,
        "workingDir": working_dir,
        "inlineImages": records.inline_images,
        "fileAttachments": records.file_attachments,
        "pageCitations": records.page_citations,
        "transcriptCitations": records.transcript_citations,
    })))
}

pub(super) fn save_session(root: &Path, session: &NativeSession) -> AgentRuntimeResult<()> {
    let session_id = session.id.as_str();
    let db_path = session_db_path(root, session_id);
    let conn = open_connection(&db_path)?;
    init_schema(&conn)?;

    let snapshot = &session.snapshot;
    let title = snapshot
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_SESSION_TITLE)
        .to_string();
    let session_kind = snapshot
        .get("sessionKind")
        .and_then(Value::as_str)
        .unwrap_or("normal")
        .to_string();
    let working_dir = snapshot
        .get("workingDir")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let project_bound = snapshot
        .get("projectBound")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let working_dir_is_home = snapshot
        .get("workingDirIsHome")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let turn_status = normalize_persisted_turn_status(
        snapshot
            .get("turnStatus")
            .and_then(Value::as_str)
            .unwrap_or("idle"),
    );
    let active_turn_id = snapshot
        .get("activeTurnId")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .filter(|_| turn_status == "running")
        .map(str::to_string);
    let updated_at_iso = snapshot
        .get("updatedAt")
        .and_then(Value::as_str)
        .unwrap_or(session.created_at.as_str())
        .to_string();
    let created_at_iso = session.created_at.as_str();
    let created_at_ms = iso_ms(created_at_iso);
    let updated_at_ms = iso_ms(&updated_at_iso);

    let bundle_snapshot = Value::Object(
        snapshot
            .as_object()
            .into_iter()
            .flat_map(|object| object.iter())
            .filter(|(key, _)| {
                !matches!(
                    key.as_str(),
                    "id" | "title"
                        | "sessionKind"
                        | "workingDir"
                        | "projectBound"
                        | "workingDirIsHome"
                        | "turnStatus"
                        | "activeTurnId"
                        | "updatedAt"
                        | "messages"
                )
            })
            .map(|(key, value)| (key.clone(), value.clone()))
            .collect(),
    );
    let snapshot_json = serde_json::to_string(&bundle_snapshot)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let runtime_turns_json = serde_json::to_string(&session.runtime_turns)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let rollback_json = serde_json::to_string(&session.rollback_checkpoints)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let file_read_json = serde_json::to_string(&session.file_read_state)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let provider_protocol_json = serde_json::to_string(&session.provider_protocol_log)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    let tx = rusqlite::Transaction::new_unchecked(&conn, rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    let stored_sequence = tx
        .query_row(
            "SELECT stream_journal_sequence FROM session_bundle WHERE id = 1",
            [],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .unwrap_or(0);
    if session.stream_journal_sequence < stored_sequence {
        return Ok(());
    }

    tx.execute(
        "INSERT INTO session_meta (
            session_id, title, session_kind, working_dir, project_bound, working_dir_is_home,
            turn_status, active_turn_id, created_at_ms, created_at_iso, updated_at_ms, updated_at_iso,
            saved, save_label, archived, custom_title, short_name
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
         ON CONFLICT(session_id) DO UPDATE SET
            title = excluded.title,
            session_kind = excluded.session_kind,
            working_dir = excluded.working_dir,
            project_bound = excluded.project_bound,
            working_dir_is_home = excluded.working_dir_is_home,
            turn_status = excluded.turn_status,
            active_turn_id = excluded.active_turn_id,
            updated_at_ms = excluded.updated_at_ms,
            updated_at_iso = excluded.updated_at_iso,
            saved = excluded.saved,
            save_label = excluded.save_label,
            archived = excluded.archived,
            custom_title = excluded.custom_title,
            short_name = excluded.short_name",
        params![
            session_id,
            title,
            session_kind,
            working_dir,
            i64::from(project_bound),
            i64::from(working_dir_is_home),
            turn_status,
            active_turn_id,
            created_at_ms,
            created_at_iso,
            updated_at_ms,
            updated_at_iso,
            i64::from(session.saved),
            session.save_label,
            i64::from(session.archived),
            session.custom_title,
            session.short_name,
        ],
    )
    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    if session.dialog_loaded {
        let messages = snapshot
            .get("messages")
            .and_then(Value::as_array)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        let stored_dialog_len = tx
            .query_row(
                "SELECT COALESCE(MAX(ordinal) + 1, 0) FROM session_dialog",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
            .max(0) as usize;
        let dirty_from = session.dialog_dirty_from.or_else(|| {
            (stored_dialog_len != messages.len()).then_some(stored_dialog_len.min(messages.len()))
        });
        if let Some(dirty_from) = dirty_from {
            let rewrite_from = dirty_from.min(stored_dialog_len).min(messages.len());
            tx.execute(
                "DELETE FROM session_dialog WHERE ordinal >= ?1",
                params![rewrite_from as i64],
            )
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            for (ordinal, message) in messages.iter().enumerate().skip(rewrite_from) {
                let msg_id = message
                    .get("id")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| format!("{session_id}:message-{ordinal}"));
                let role = message
                    .get("role")
                    .and_then(Value::as_str)
                    .unwrap_or("runtime")
                    .to_string();
                let created_at_iso = message
                    .get("createdAt")
                    .and_then(Value::as_str)
                    .map(str::to_string)
                    .unwrap_or_else(|| updated_at_iso.clone());
                let created_at_ms = iso_ms(&created_at_iso);
                let char_count = message_char_count(message);
                let token_count = super::super::token_estimate::estimate_message_tokens(message);
                let turn_index = message
                    .get("turnIndex")
                    .or_else(|| message.pointer("/metadata/turnIndex"))
                    .and_then(Value::as_i64);
                let metadata_json = message.get("metadata").map(|value| value.to_string());
                let content_raw = serde_json::to_string(message)
                    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
                tx.execute(
                    "INSERT INTO session_dialog (
                    msg_id, ordinal, turn_index, role, content_raw,
                    token_count, char_count, created_at_ms, created_at_iso,
                    updated_at_ms, updated_at_iso, metadata_json
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(msg_id) DO UPDATE SET
                    ordinal = excluded.ordinal,
                    turn_index = excluded.turn_index,
                    role = excluded.role,
                    content_raw = excluded.content_raw,
                    token_count = excluded.token_count,
                    char_count = excluded.char_count,
                    created_at_ms = excluded.created_at_ms,
                    created_at_iso = excluded.created_at_iso,
                    updated_at_ms = excluded.updated_at_ms,
                    updated_at_iso = excluded.updated_at_iso,
                    metadata_json = excluded.metadata_json",
                    params![
                        msg_id,
                        ordinal as i64,
                        turn_index,
                        role,
                        content_raw,
                        token_count as i64,
                        char_count as i64,
                        created_at_ms,
                        created_at_iso,
                        updated_at_ms,
                        updated_at_iso,
                        metadata_json,
                    ],
                )
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            }
        }
    }

    tx.execute(
        "INSERT INTO session_bundle (id, snapshot_json, runtime_turns_json, rollback_checkpoints_json, file_read_state_json, stream_journal_sequence, provider_protocol_json)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
            snapshot_json = excluded.snapshot_json,
            runtime_turns_json = excluded.runtime_turns_json,
            rollback_checkpoints_json = excluded.rollback_checkpoints_json,
            file_read_state_json = excluded.file_read_state_json,
            stream_journal_sequence = excluded.stream_journal_sequence,
            provider_protocol_json = excluded.provider_protocol_json",
        params![snapshot_json, runtime_turns_json, rollback_json, file_read_json, session.stream_journal_sequence, provider_protocol_json],
    )
    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;

    if session.dialog_loaded {
        tx.execute(
            "DELETE FROM stream_deltas WHERE sequence <= ?1",
            [session.stream_journal_sequence],
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    tx.commit()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    Ok(())
}

fn normalize_persisted_turn_status(status: &str) -> String {
    match status {
        "running" => "running".to_string(),
        "cancelled" => "cancelled".to_string(),
        _ => "idle".to_string(),
    }
}

fn message_char_count(message: &Value) -> usize {
    message
        .get("text")
        .and_then(Value::as_str)
        .map(|text| text.chars().count())
        .unwrap_or_else(|| {
            serde_json::to_string(message)
                .map(|text| text.chars().count())
                .unwrap_or(0)
        })
}

struct SessionMetaRow {
    title: String,
    session_kind: String,
    working_dir: String,
    project_bound: bool,
    working_dir_is_home: bool,
    turn_status: String,
    active_turn_id: Option<String>,
    created_at_iso: String,
    updated_at_iso: String,
    saved: bool,
    save_label: Option<String>,
    archived: bool,
    custom_title: Option<String>,
    short_name: Option<String>,
}

#[cfg(test)]
mod stream_recovery_tests {
    use super::*;

    fn stream_session() -> NativeSession {
        let timestamp = now();
        NativeSession {
            id: "durable-stream".into(),
            snapshot: json!({ "messages": [{ "id": "reply", "role": "assistant", "text": "prefix", "blocks": [{"id":"text-0","type":"text","text":"prefix"}] }], "turnStatus": "running", "activeTurnId": "turn" }),
            created_at: timestamp,
            saved: false,
            save_label: None,
            archived: false,
            custom_title: None,
            short_name: None,
            runtime_turns: vec![],
            rollback_checkpoints: vec![],
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
    fn crash_replays_durable_suffix_and_snapshot_drains_it_once() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = stream_session();
        save_session(temp.path(), &session).unwrap();
        persist_stream_delta(temp.path(), &mut session, "reply", "visible", " suffix").unwrap();
        persist_stream_delta(temp.path(), &mut session, "reply", "reasoning", "thought").unwrap();
        let loaded = load_session(temp.path(), &session.id).unwrap().unwrap();
        assert_eq!(loaded.snapshot["messages"][0]["text"], "prefix suffix");
        assert!(loaded.dirty);
        save_session(temp.path(), &loaded).unwrap();
        let reopened = load_session(temp.path(), &session.id).unwrap().unwrap();
        assert_eq!(reopened.snapshot["messages"][0]["text"], "prefix suffix");
        assert_eq!(
            reopened.snapshot["messages"][0]["reasoningContent"],
            "thought"
        );
        assert!(!reopened.dirty);
    }
    #[test]
    fn old_async_snapshot_keeps_future_deltas_and_cannot_overwrite_newer_snapshot() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = stream_session();
        save_session(temp.path(), &session).unwrap();
        let old = session.clone(); // persist worker's lock-free I/O snapshot
        persist_stream_delta(
            temp.path(),
            &mut session,
            "reply",
            "visible",
            " arrived after cloning",
        )
        .unwrap();
        save_session(temp.path(), &old).unwrap();
        let latest = load_session(temp.path(), &session.id).unwrap().unwrap();
        assert_eq!(
            latest.snapshot["messages"][0]["text"],
            "prefix arrived after cloning"
        );
        save_session(temp.path(), &latest).unwrap();
        save_session(temp.path(), &old).unwrap(); // out-of-order completion
        assert_eq!(
            load_session(temp.path(), &session.id)
                .unwrap()
                .unwrap()
                .snapshot["messages"][0]["text"],
            "prefix arrived after cloning"
        );
    }

    #[test]
    fn replays_created_message_before_first_materialization() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = stream_session();
        session.snapshot["messages"] = json!([]);
        save_session(temp.path(), &session).unwrap();
        let message = json!({ "id": "new", "role": "assistant", "text": "" });
        persist_stream_delta(
            temp.path(),
            &mut session,
            "new",
            "created",
            &message.to_string(),
        )
        .unwrap();
        persist_stream_delta(
            temp.path(),
            &mut session,
            "new",
            "visible",
            "first durable delta",
        )
        .unwrap();
        let latest = load_session(temp.path(), &session.id).unwrap().unwrap();
        assert_eq!(
            latest.snapshot["messages"][0]["text"],
            "first durable delta"
        );
        save_session(temp.path(), &latest).unwrap();
        assert_eq!(
            load_session(temp.path(), &session.id)
                .unwrap()
                .unwrap()
                .snapshot["messages"][0]["text"],
            "first durable delta"
        );
    }
    #[test]
    fn final_snapshot_is_authoritative_even_when_shorter_than_streamed_text() {
        let temp = tempfile::tempdir().unwrap();
        let mut session = stream_session();
        save_session(temp.path(), &session).unwrap();
        persist_stream_delta(
            temp.path(),
            &mut session,
            "reply",
            "visible",
            " old long text",
        )
        .unwrap();
        let final_message = json!({ "id": "reply", "role": "assistant", "text": "final", "blocks": [{ "id":"text-0", "type":"text", "text":"final" }] });
        session.snapshot["messages"][0] = final_message.clone();
        persist_message_snapshot(temp.path(), &mut session, &final_message).unwrap();
        let recovered = load_session(temp.path(), &session.id).unwrap().unwrap();
        assert_eq!(recovered.snapshot["messages"][0]["text"], "final");
        save_session(temp.path(), &recovered).unwrap();
        assert_eq!(
            load_session(temp.path(), &session.id)
                .unwrap()
                .unwrap()
                .snapshot["messages"][0]["text"],
            "final"
        );
    }
}
