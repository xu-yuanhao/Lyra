use super::*;

pub(crate) fn rollback_preview(payload: Value) -> AgentRuntimeResult<Value> {
    let session_id = required_session_id(&payload)?;
    let message_id = string_opt(&payload, "messageId").unwrap_or_default();
    let state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let Some(session) = state.sessions.get(&session_id) else {
        return Err(AgentRuntimeError::Core(format!(
            "session not found: {session_id}"
        )));
    };
    let Some(checkpoint) = session
        .rollback_checkpoints
        .iter()
        .find(|checkpoint| checkpoint.message_id == message_id)
    else {
        return Ok(json!({
            "sessionId": session_id,
            "messageId": message_id,
            "available": false,
            "checkpointAt": Value::Null,
            "removedMessageCount": 0,
            "changedFiles": [],
            "unavailableReason": "No rollback checkpoint is available for this message."
        }));
    };
    let current_messages = snapshot_array(&session.snapshot, "messages");
    let before_count = if checkpoint.before_message_count > 0 {
        checkpoint.before_message_count
    } else {
        checkpoint.before_messages.len()
    };
    let removed_message_count = current_messages.len().saturating_sub(before_count);
    Ok(json!({
        "sessionId": session_id,
        "messageId": message_id,
        "available": true,
        "checkpointAt": checkpoint.created_at,
        "removedMessageCount": removed_message_count,
        "changedFiles": checkpoint.changed_files.iter().map(|file| json!({
            "path": file.path,
            "absolutePath": file.absolute_path,
            "restoreAction": if file.before_exists { "writePreviousContent" } else { "removeCreatedFile" },
        })).collect::<Vec<_>>(),
        "restoreImpact": {
            "messages": removed_message_count,
            "files": checkpoint.changed_files.len(),
            "artifacts": checkpoint.artifact_refs.len(),
        },
        "unavailableReason": Value::Null
    }))
}

pub(crate) fn rollback_restore(payload: Value) -> AgentRuntimeResult<Value> {
    let session_id = required_session_id(&payload)?;
    let message_id = string_opt(&payload, "messageId").unwrap_or_default();
    let checkpoint = {
        let state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let session = state
            .sessions
            .get(&session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        session
            .rollback_checkpoints
            .iter()
            .find(|checkpoint| checkpoint.message_id == message_id)
            .cloned()
            .ok_or_else(|| {
                AgentRuntimeError::Core(format!(
                    "rollback checkpoint not found for message: {message_id}"
                ))
            })?
    };
    let callback = event_callback();
    emit_with_callback(
        &callback,
        json!({
            "kind": "rollbackStarted",
            "sessionId": session_id,
            "messageId": message_id,
        }),
    );
    let restore = restore_checkpoint_files(&checkpoint);
    let (removed_message_count, removed_tool_count) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        let session = state
            .sessions
            .get_mut(&session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        let message_count = if checkpoint.before_message_count > 0 {
            checkpoint.before_message_count
        } else {
            checkpoint.before_messages.len()
        };
        let tool_count = if checkpoint.before_tool_count > 0 {
            checkpoint.before_tool_count
        } else {
            checkpoint.before_tools.len()
        };
        let removed_message_count = snapshot_array(&session.snapshot, "messages")
            .len()
            .saturating_sub(message_count) as u64;
        let removed_tool_count = snapshot_array(&session.snapshot, "tools")
            .len()
            .saturating_sub(tool_count) as u64;
        if let Some(messages) = session
            .snapshot
            .get_mut("messages")
            .and_then(Value::as_array_mut)
        {
            messages.truncate(message_count);
        }
        // Protocol log entries are anchored to timeline messages; entries
        // anchored to removed messages (and unanchored leftovers of the dead
        // turn) are no longer reachable replay state.
        let retained_ids: HashSet<String> = session
            .snapshot
            .get("messages")
            .and_then(Value::as_array)
            .map(|messages| {
                messages
                    .iter()
                    .filter_map(|message| message.get("id").and_then(Value::as_str))
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default();
        session.provider_protocol_log.retain(|entry| {
            entry
                .get("messageId")
                .and_then(Value::as_str)
                .is_some_and(|id| retained_ids.contains(id))
        });
        mark_dialog_dirty_from(session, message_count);
        if let Some(tools) = session
            .snapshot
            .get_mut("tools")
            .and_then(Value::as_array_mut)
        {
            tools.truncate(tool_count);
        }
        session.snapshot["activeTurnId"] = Value::Null;
        session.snapshot["turnStatus"] = Value::String("idle".to_string());
        session.snapshot["follow"] = json!({ "running": false, "activity": Value::Null });
        session
            .rollback_checkpoints
            .retain(|item| item.id != checkpoint.id);
        touch_session(session);
        state.save_state()?;
        (removed_message_count, removed_tool_count)
    };
    emit_with_callback(
        &callback,
        json!({
            "kind": "rollbackFinished",
            "sessionId": session_id,
            "messageId": message_id,
            "removedMessageCount": removed_message_count,
            "removedToolCount": removed_tool_count,
            "restoredFileCount": restore.restored_file_count as u64,
        }),
    );
    Ok(json!({
        "sessionId": session_id,
        "messageId": message_id,
        "checkpointId": checkpoint.id,
        "restoredFileCount": restore.restored_file_count,
        "errors": restore.errors,
    }))
}

pub(crate) fn mutate_session(
    id: &str,
    mutate: impl FnOnce(&mut NativeSession) -> AgentRuntimeResult<Value>,
) -> AgentRuntimeResult<Value> {
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let session = state
        .sessions
        .get_mut(id)
        .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}")))?;
    let value = mutate(session)?;
    state.save_state()?;
    Ok(value)
}

pub(crate) fn rollback_checkpoint(
    session_id: &str,
    turn_id: &str,
    message_id: &str,
    session: &NativeSession,
) -> RollbackCheckpoint {
    let before_message_count = snapshot_array(&session.snapshot, "messages").len();
    let before_tool_count = snapshot_array(&session.snapshot, "tools").len();
    RollbackCheckpoint {
        id: format!("rollback-{}", Uuid::new_v4()),
        session_id: session_id.to_string(),
        turn_id: turn_id.to_string(),
        message_id: message_id.to_string(),
        created_at: now(),
        changed_files: Vec::new(),
        artifact_refs: Vec::new(),
        before_message_count,
        before_tool_count,
        before_messages: Vec::new(),
        before_tools: Vec::new(),
    }
}

pub(crate) fn snapshot_array(snapshot: &Value, key: &str) -> Vec<Value> {
    snapshot
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

pub(crate) fn record_rollback_file_candidates(
    session: &mut NativeSession,
    turn_id: &str,
    tool: &Value,
) {
    let Some(checkpoint_index) = session
        .rollback_checkpoints
        .iter()
        .rposition(|checkpoint| checkpoint.turn_id == turn_id)
    else {
        return;
    };
    let paths = rollback_candidate_paths(tool);
    if paths.is_empty() {
        return;
    }
    let working_dir = session
        .snapshot
        .get("workingDir")
        .and_then(Value::as_str)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(current_working_dir()));
    for path in paths {
        let Some((display_path, absolute_path)) = resolve_rollback_path(&working_dir, &path) else {
            continue;
        };
        let checkpoint = &mut session.rollback_checkpoints[checkpoint_index];
        if checkpoint
            .changed_files
            .iter()
            .any(|file| file.absolute_path == absolute_path)
        {
            continue;
        }
        let path_buf = PathBuf::from(&absolute_path);
        let before_exists = path_buf.exists();
        let before_content = if before_exists {
            fs::read_to_string(&path_buf).ok()
        } else {
            None
        };
        checkpoint.changed_files.push(RollbackFileCheckpoint {
            path: display_path,
            absolute_path,
            before_exists,
            before_content,
            after_exists: None,
            after_content: None,
            artifact_refs: Vec::new(),
        });
    }
    if let Some(message_id) = session
        .rollback_checkpoints
        .get(checkpoint_index)
        .map(|checkpoint| checkpoint.message_id.clone())
    {
        update_message_rollback_from_checkpoint(session, &message_id);
    }
}

pub(crate) fn rollback_candidate_paths(tool: &Value) -> Vec<String> {
    let mut paths = Vec::new();
    collect_path_fields(tool.get("input"), &mut paths);
    collect_path_fields(tool.get("output"), &mut paths);
    if let Some(raw) = tool.pointer("/output/raw") {
        collect_path_fields(Some(raw), &mut paths);
    }
    paths.sort();
    paths.dedup();
    paths
}

pub(crate) fn collect_path_fields(value: Option<&Value>, paths: &mut Vec<String>) {
    let Some(value) = value else {
        return;
    };
    match value {
        Value::String(text) => {
            if looks_like_path(text) {
                paths.push(text.to_string());
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_path_fields(Some(item), paths);
            }
        }
        Value::Object(object) => {
            for (key, value) in object {
                if matches!(
                    key.as_str(),
                    "path"
                        | "file"
                        | "filePath"
                        | "targetPath"
                        | "absolutePath"
                        | "relativePath"
                        | "changedFile"
                ) && let Some(text) = value.as_str()
                    && !text.trim().is_empty()
                {
                    paths.push(text.to_string());
                    continue;
                }
                if matches!(
                    key.as_str(),
                    "changedFiles" | "changed_files" | "files" | "fileChanges"
                ) {
                    collect_path_fields(Some(value), paths);
                }
            }
        }
        _ => {}
    }
}

pub(crate) fn looks_like_path(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.contains('\n') {
        return false;
    }
    trimmed.starts_with('/')
        || trimmed.starts_with("./")
        || trimmed.starts_with("../")
        || trimmed.starts_with("~/")
        || trimmed.starts_with("file://")
        || trimmed.contains('/')
}

pub(crate) fn resolve_rollback_path(
    working_dir: &Path,
    candidate: &str,
) -> Option<(String, String)> {
    let mut raw = candidate.trim().to_string();
    if raw.starts_with("file://") {
        raw = raw.trim_start_matches("file://").to_string();
    }
    if raw.starts_with("~/") {
        raw = dirs::home_dir()?
            .join(raw.trim_start_matches("~/"))
            .display()
            .to_string();
    }
    let candidate_path = PathBuf::from(&raw);
    let absolute = if candidate_path.is_absolute() {
        normalize_path(&candidate_path)
    } else {
        normalize_path(&working_dir.join(&candidate_path))
    };
    let working_dir = normalize_path(working_dir);
    if !absolute.starts_with(&working_dir) {
        return None;
    }
    let display = absolute
        .strip_prefix(&working_dir)
        .ok()
        .and_then(|path| path.to_str())
        .filter(|path| !path.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| absolute.display().to_string());
    Some((display, absolute.display().to_string()))
}

pub(crate) fn normalize_path(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            std::path::Component::CurDir => {}
            std::path::Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

pub(crate) fn update_message_rollback_from_checkpoint(
    session: &mut NativeSession,
    message_id: &str,
) {
    let Some(checkpoint) = session
        .rollback_checkpoints
        .iter()
        .find(|checkpoint| checkpoint.message_id == message_id)
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
    for (index, message) in messages.iter_mut().enumerate() {
        if message.get("id").and_then(Value::as_str) == Some(message_id) {
            message["rollback"] = json!({
                "available": true,
                "anchorId": checkpoint.id,
                "checkpointAt": checkpoint.created_at,
                "unavailableReason": Value::Null
            });
            mark_dialog_dirty_from(session, index);
            return;
        }
    }
}

pub(crate) struct RollbackRestoreResult {
    pub(crate) restored_file_count: usize,
    pub(crate) errors: Vec<String>,
}

pub(crate) fn restore_checkpoint_files(checkpoint: &RollbackCheckpoint) -> RollbackRestoreResult {
    let mut restored_file_count = 0;
    let mut errors = Vec::new();
    for file in &checkpoint.changed_files {
        let path = PathBuf::from(&file.absolute_path);
        if file.before_exists {
            match file.before_content.as_ref() {
                Some(content) => {
                    if let Some(parent) = path.parent()
                        && let Err(error) = fs::create_dir_all(parent)
                    {
                        errors.push(format!("{}: {}", file.path, error));
                        continue;
                    }
                    match fs::write(&path, content) {
                        Ok(()) => restored_file_count += 1,
                        Err(error) => errors.push(format!("{}: {}", file.path, error)),
                    }
                }
                None => errors.push(format!(
                    "{}: previous file content was not captured",
                    file.path
                )),
            }
        } else if path.exists() {
            match fs::remove_file(&path) {
                Ok(()) => restored_file_count += 1,
                Err(error) => errors.push(format!("{}: {}", file.path, error)),
            }
        }
    }
    RollbackRestoreResult {
        restored_file_count,
        errors,
    }
}
