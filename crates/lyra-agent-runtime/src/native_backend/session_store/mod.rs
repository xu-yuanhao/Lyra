use super::*;

mod persist;
pub(crate) mod schema;

pub(crate) fn session_dir(root: &Path, session_id: &str) -> PathBuf {
    root.join("sessions").join(session_id)
}

pub(crate) fn session_db_path(root: &Path, session_id: &str) -> PathBuf {
    session_dir(root, session_id).join("session.sqlite")
}

pub(crate) fn load_session(
    root: &Path,
    session_id: &str,
) -> AgentRuntimeResult<Option<NativeSession>> {
    persist::load_session(root, session_id)
}

pub(crate) fn load_session_for_startup(
    root: &Path,
    session_id: &str,
) -> AgentRuntimeResult<Option<NativeSession>> {
    persist::load_session_for_startup(root, session_id)
}

pub(crate) fn fill_dialog(root: &Path, session: &mut NativeSession) -> AgentRuntimeResult<()> {
    persist::fill_dialog(root, session)
}

pub(crate) fn save_session(root: &Path, session: &NativeSession) -> AgentRuntimeResult<()> {
    persist::save_session(root, session)
}

pub(crate) fn delete_session_store(root: &Path, session_id: &str) -> AgentRuntimeResult<()> {
    let dir = session_dir(root, session_id);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    Ok(())
}

pub(crate) fn list_session_summaries_from_meta(root: &Path) -> Vec<Value> {
    persist::list_session_summaries_from_meta(root)
}

pub(crate) fn list_session_ids(root: &Path) -> AgentRuntimeResult<Vec<String>> {
    let sessions_root = root.join("sessions");
    if !sessions_root.is_dir() {
        return Ok(Vec::new());
    }
    let mut ids = Vec::new();
    for entry in
        fs::read_dir(&sessions_root).map_err(|error| AgentRuntimeError::Core(error.to_string()))?
    {
        let entry = entry.map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        if !entry
            .file_type()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
            .is_dir()
        {
            continue;
        }
        let session_id = entry.file_name().to_string_lossy().to_string();
        if session_db_path(root, &session_id).is_file() {
            ids.push(session_id);
        }
    }
    ids.sort();
    Ok(ids)
}

/// Append before publishing a delta. A crash replays only the unsnapshotted
/// suffix; saving the dialog clears the journal in the same SQLite transaction.
pub(crate) fn persist_stream_delta(
    root: &Path,
    session: &mut NativeSession,
    message_id: &str,
    channel: &str,
    delta: &str,
) -> AgentRuntimeResult<()> {
    if session.ephemeral {
        return Ok(());
    }
    let conn = schema::open_connection(&session_db_path(root, &session.id))?;
    schema::init_schema(&conn)?;
    let tx = rusqlite::Transaction::new_unchecked(&conn, rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let high: i64 = tx.query_row(
        "SELECT MAX(COALESCE((SELECT MAX(sequence) FROM stream_deltas), 0), COALESCE((SELECT stream_journal_sequence FROM session_bundle WHERE id = 1), 0), ?1)",
        [session.stream_journal_sequence], |row| row.get(0),
    ).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let sequence = high
        .checked_add(1)
        .ok_or_else(|| AgentRuntimeError::Core("Stream journal sequence exhausted".into()))?;
    tx.execute(
        "INSERT INTO stream_deltas (sequence, message_id, channel, delta) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![sequence, message_id, channel, delta],
    )
    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    tx.commit()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    session.stream_journal_sequence = sequence;
    session.snapshot["revision"] = json!(sequence.to_string());
    Ok(())
}

pub(crate) fn load_session_for_startup_with_diagnostics(
    root: &Path,
    session_id: &str,
    diagnostics: &mut Vec<Value>,
) -> Option<NativeSession> {
    diagnostics.retain(|diagnostic| {
        !(diagnostic.get("kind").and_then(Value::as_str) == Some("session-database-load")
            && diagnostic.get("sessionId").and_then(Value::as_str) == Some(session_id))
    });
    match load_session_for_startup(root, session_id) {
        Ok(loaded) => loaded,
        Err(error) => {
            eprintln!("Unable to load session {session_id}: {error}");
            diagnostics.push(
                json!({ "kind": "session-database-load", "sessionId": session_id,
                "error": error.to_string(), "databasePreserved": true }),
            );
            None
        }
    }
}

pub(crate) fn session_database_error_summary(root: &Path, session_id: &str, error: &str) -> Value {
    let path = session_db_path(root, session_id);
    let title =
        rusqlite::Connection::open_with_flags(&path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .ok()
            .and_then(|conn| {
                conn.query_row(
                    "SELECT title FROM session_meta WHERE session_id = ?1",
                    [session_id],
                    |row| row.get::<_, String>(0),
                )
                .ok()
            })
            .unwrap_or_else(|| session_id.to_string());
    let modified = fs::metadata(&path)
        .and_then(|metadata| metadata.modified())
        .unwrap_or(std::time::UNIX_EPOCH);
    let timestamp = chrono::DateTime::<Utc>::from(modified).to_rfc3339();
    json!({ "id": session_id, "title": title, "sessionKind": "normal", "status": "error",
        "loadError": error, "createdAt": timestamp, "updatedAt": timestamp,
        "messageCount": 0, "saved": false, "archived": false, "workingDir": "" })
}

pub(crate) fn session_database_load_error(
    diagnostics: &[Value],
    id: &str,
) -> Option<AgentRuntimeError> {
    diagnostics
        .iter()
        .find(|diagnostic| {
            diagnostic.get("kind").and_then(Value::as_str) == Some("session-database-load")
                && diagnostic.get("sessionId").and_then(Value::as_str) == Some(id)
        })
        .and_then(|diagnostic| diagnostic.get("error").and_then(Value::as_str))
        .map(|error| AgentRuntimeError::Core(error.to_owned()))
}

pub(crate) fn persist_message_snapshot(
    root: &Path,
    session: &mut NativeSession,
    message: &Value,
) -> AgentRuntimeResult<()> {
    let id = message
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| AgentRuntimeError::Core("Committed message has no id".into()))?;
    persist_stream_delta(root, session, id, "committed", &message.to_string())
}
