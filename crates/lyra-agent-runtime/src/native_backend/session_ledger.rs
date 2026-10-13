use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs::OpenOptions,
    io::{BufReader, Write as _},
};

const PREVIEW_CHARS: usize = 160;
const RECENT_COMMIT_LIMIT: usize = 5;
const DIAGNOSTIC_LIMIT: usize = 12;

pub(crate) fn ledger_dir(root: &Path, session_id: &str) -> PathBuf {
    session_dir(root, session_id).join(".ledger")
}

/// (len, mtime-ms) fingerprint of a ledger file; changes whenever the file does.
fn file_stamp(path: &Path) -> (u64, u128) {
    fs::metadata(path)
        .map(|meta| {
            let mtime = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|duration| duration.as_millis())
                .unwrap_or(0);
            (meta.len(), mtime)
        })
        .unwrap_or((0, 0))
}

type LedgerSummaryCache = HashMap<String, ((u64, u128), (u64, u128), Value)>;
static LEDGER_SUMMARY_CACHE: std::sync::LazyLock<std::sync::Mutex<LedgerSummaryCache>> =
    std::sync::LazyLock::new(|| std::sync::Mutex::new(HashMap::new()));

pub(crate) fn session_ledger_summary(root: &Path, session_id: &str) -> Value {
    // The UI asks for this summary on every session poll; the ledger only
    // changes when record_event appends, which always touches events.jsonl,
    // so a (events, diagnostics) file-stamp key keeps polls read-free.
    // ponytail: stamp granularity is fs mtime; a same-millisecond rewrite with
    // identical length would serve one stale poll — harmless for a UI summary.
    let dir = ledger_dir(root, session_id);
    let events_stamp = file_stamp(&dir.join("events.jsonl"));
    let diagnostics_stamp = file_stamp(&dir.join("diagnostics.jsonl"));
    if let Ok(cache) = LEDGER_SUMMARY_CACHE.lock()
        && let Some((cached_events, cached_diagnostics, summary)) = cache.get(session_id)
        && *cached_events == events_stamp
        && *cached_diagnostics == diagnostics_stamp
    {
        return summary.clone();
    }
    let summary = compute_session_ledger_summary(root, session_id);
    if let Ok(mut cache) = LEDGER_SUMMARY_CACHE.lock() {
        cache.insert(
            session_id.to_string(),
            (events_stamp, diagnostics_stamp, summary.clone()),
        );
    }
    summary
}

fn compute_session_ledger_summary(root: &Path, session_id: &str) -> Value {
    // The ledger is a plain append-only JSONL log. It used to shell out to
    // git (init/add/commit per event, no subprocess timeout) — a stale
    // index.lock could park a turn thread forever. Summary fields that used
    // to come from git keep their keys for consumers but derive from the
    // JSONL itself.
    let dir = ledger_dir(root, session_id);
    let diagnostics = read_recent_jsonl(&dir.join("diagnostics.jsonl"), DIAGNOSTIC_LIMIT);
    let events_path = dir.join("events.jsonl");
    let enabled = events_path.is_file();
    let event_count = if enabled {
        count_jsonl_lines(&events_path)
    } else {
        0
    };
    let last_event_at = read_last_event_at(&events_path).unwrap_or(Value::Null);

    json!({
        "enabled": enabled,
        "path": dir.display().to_string(),
        "head": Value::Null,
        "commitCount": if enabled { Value::from(event_count as u64) } else { Value::Null },
        "lastEventAt": last_event_at,
        "recentCommits": recent_event_entries(&events_path),
        "diagnostics": diagnostics,
    })
}

/// Recent event digests, shaped like the old recent-commit entries so
/// existing consumers keep rendering without a schema change.
fn recent_event_entries(events_path: &Path) -> Vec<Value> {
    read_recent_jsonl(events_path, RECENT_COMMIT_LIMIT)
        .into_iter()
        .rev()
        .map(|event| {
            let event_id = event
                .get("eventId")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
            let short = event_id.rsplit('-').next().unwrap_or_default().to_string();
            json!({
                "hash": event_id,
                "shortHash": short,
                "subject": format!(
                    "ledger: {}",
                    event.get("eventType").and_then(Value::as_str).unwrap_or("event")
                ),
                "committedAt": event.get("createdAt").cloned().unwrap_or(Value::Null),
            })
        })
        .collect()
}

fn count_jsonl_lines(path: &Path) -> usize {
    let Ok(file) = fs::File::open(path) else {
        return 0;
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter(|line| !line.trim().is_empty())
        .count()
}

pub(crate) fn record_session_created(root: &Path, session: &NativeSession) -> Value {
    record_event(root, session, "session_created", Value::Null)
}

pub(crate) fn record_turn_finished(
    root: &Path,
    session: &NativeSession,
    turn_id: &str,
    status: &str,
    failure: Option<&str>,
) -> Value {
    record_event(
        root,
        session,
        "turn_finished",
        json!({
            "turnId": turn_id,
            "status": status,
            "failure": failure.map(redacted_text_value).unwrap_or(Value::Null),
        }),
    )
}

pub(crate) fn record_session_trimmed(root: &Path, session: &NativeSession, detail: Value) -> Value {
    record_event(root, session, "session_trimmed", detail)
}

pub(crate) fn record_memory_candidate_event(
    root: &Path,
    session_id: &str,
    turn_id: Option<&str>,
    event_type: &str,
    candidate: &MemoryCandidate,
    detail: Value,
) -> Value {
    if !session_dir(root, session_id).is_dir() {
        return json!({
            "enabled": false,
            "path": ledger_dir(root, session_id).display().to_string(),
            "head": Value::Null,
            "commitCount": Value::Null,
            "lastEventAt": Value::Null,
            "recentCommits": [],
            "diagnostics": [{
                "code": "session_dir_missing",
                "message": "Session ledger was not initialized because the session directory does not exist.",
                "createdAt": now(),
            }],
        });
    }
    let session = session_for_memory_event(root, session_id);
    let detail = json!({
        "turnId": turn_id,
        "candidate": memory_candidate_ledger_json(candidate),
        "detail": detail,
    });
    record_event(root, &session, event_type, detail)
}

pub(crate) fn session_id_from_memory_source_ref(source_ref: Option<&str>) -> Option<String> {
    let source_ref = source_ref?.trim();
    let session_id = source_ref.split(':').next().unwrap_or(source_ref).trim();
    (!session_id.is_empty() && session_id.starts_with("session-")).then(|| session_id.to_string())
}

fn record_event(root: &Path, session: &NativeSession, event_type: &str, detail: Value) -> Value {
    let dir = ledger_dir(root, &session.id);
    let mut diagnostics = Vec::new();
    if let Err(error) = fs::create_dir_all(&dir) {
        diagnostics.push(io_diagnostic(
            "ledger_dir_create_failed",
            "Failed to create the session ledger directory.",
            error,
        ));
        return summary_with_diagnostics(root, &session.id, diagnostics);
    }

    let events_path = dir.join("events.jsonl");
    let needs_created_event = !events_path.is_file() && event_type != "session_created";
    if needs_created_event {
        append_event(
            &events_path,
            build_event(session, "session_created", Value::Null),
            &mut diagnostics,
        );
    }
    append_event(
        &events_path,
        build_event(session, event_type, detail),
        &mut diagnostics,
    );

    if event_type == "session_trimmed" {
        copy_cut_manifest(root, &session.id, &dir, &mut diagnostics);
    }
    write_session_index(root, session, &dir, &mut diagnostics);
    append_diagnostics(&dir, &diagnostics);

    summary_with_diagnostics(root, &session.id, diagnostics)
}

fn append_event(path: &Path, event: Value, diagnostics: &mut Vec<Value>) {
    let Some(parent) = path.parent() else {
        return;
    };
    if let Err(error) = fs::create_dir_all(parent) {
        diagnostics.push(io_diagnostic(
            "ledger_event_dir_create_failed",
            "Failed to create the session ledger event directory.",
            error,
        ));
        return;
    }
    let line = match serde_json::to_string(&event) {
        Ok(line) => line,
        Err(error) => {
            diagnostics.push(json!({
                "code": "ledger_event_serialize_failed",
                "message": "Failed to serialize a session ledger event.",
                "error": error.to_string(),
                "createdAt": now(),
            }));
            return;
        }
    };
    match OpenOptions::new().create(true).append(true).open(path) {
        Ok(mut file) => {
            if let Err(error) = writeln!(file, "{line}") {
                diagnostics.push(io_diagnostic(
                    "ledger_event_write_failed",
                    "Failed to append a session ledger event.",
                    error,
                ));
            }
        }
        Err(error) => diagnostics.push(io_diagnostic(
            "ledger_event_open_failed",
            "Failed to open the session ledger event log.",
            error,
        )),
    }
}

fn build_event(session: &NativeSession, event_type: &str, detail: Value) -> Value {
    json!({
        "eventId": format!("ledger-event-{}", Uuid::new_v4()),
        "eventType": event_type,
        "sessionId": session.id,
        "createdAt": now(),
        "summary": event_summary(session, event_type, &detail),
        "messages": message_previews(session),
        "detail": detail,
    })
}

fn event_summary(session: &NativeSession, event_type: &str, detail: &Value) -> Value {
    json!({
        "eventType": event_type,
        "title": session.snapshot.get("title").cloned().unwrap_or(Value::Null),
        "turnId": detail.get("turnId").cloned().unwrap_or(Value::Null),
        "status": detail.get("status").cloned().unwrap_or(Value::Null),
        "messageCount": session.snapshot.get("messages").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
        "toolCount": session.snapshot.get("tools").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
    })
}

fn message_previews(session: &NativeSession) -> Vec<Value> {
    let messages = session
        .snapshot
        .get("messages")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    messages
        .iter()
        .rev()
        .take(6)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|message| {
            let text = message_text(message);
            let secret_like = secret_guard::contains_secret_material(&text);
            json!({
                "messageId": message.get("id").and_then(Value::as_str).unwrap_or(""),
                "role": message.get("role").and_then(Value::as_str).unwrap_or("runtime"),
                "charCount": text.chars().count(),
                "textHash": if secret_like { Value::Null } else { Value::String(format!("sha256:{}", sha256_hex(&text))) },
                "preview": if secret_like {
                    Value::String("[redacted: secret-like content]".to_string())
                } else {
                    Value::String(truncate_preview(&text))
                },
            })
        })
        .collect()
}

fn message_text(message: &Value) -> String {
    // Prefer reconstructing from blocks: a tool-only assistant message carries an
    // empty top-level `text` but real `tool` blocks, so an early return on `text`
    // would record it as a fully empty ledger entry (charCount 0, empty hash).
    // Tool blocks have no text field, so they get a placeholder — mirrors
    // transcript_citations::extract_message_text.
    if let Some(blocks) = message.get("blocks").and_then(Value::as_array) {
        let mut parts = Vec::new();
        for block in blocks {
            match block.get("type").and_then(Value::as_str) {
                Some("tool") => parts.push("[tool activity]".to_string()),
                _ => {
                    if let Some(text) = block.get("text").and_then(Value::as_str)
                        && !text.is_empty()
                    {
                        parts.push(text.to_string());
                    }
                }
            }
        }
        if !parts.is_empty() {
            return parts.join("\n");
        }
    }
    message
        .get("text")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn redacted_text_value(text: &str) -> Value {
    if secret_guard::contains_secret_material(text) {
        json!({
            "charCount": text.chars().count(),
            "textHash": Value::Null,
            "preview": "[redacted: secret-like content]",
        })
    } else {
        json!({
            "charCount": text.chars().count(),
            "textHash": format!("sha256:{}", sha256_hex(text)),
            "preview": truncate_preview(text),
        })
    }
}

fn truncate_preview(text: &str) -> String {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = normalized.chars().take(PREVIEW_CHARS).collect::<String>();
    if normalized.chars().count() > PREVIEW_CHARS {
        preview.push_str("...");
    }
    preview
}

fn copy_cut_manifest(root: &Path, session_id: &str, dir: &Path, diagnostics: &mut Vec<Value>) {
    match cut_store::load_manifest(root, session_id) {
        Ok(manifest) => {
            if let Err(error) = write_json(&dir.join("cuts").join("manifest.json"), &manifest) {
                diagnostics.push(json!({
                    "code": "ledger_cut_manifest_write_failed",
                    "message": "Failed to write the session ledger cut manifest projection.",
                    "error": error.to_string(),
                    "createdAt": now(),
                }));
            }
        }
        Err(error) => diagnostics.push(json!({
            "code": "ledger_cut_manifest_load_failed",
            "message": "Failed to load the session cut manifest for the ledger.",
            "error": error.to_string(),
            "createdAt": now(),
        })),
    }
}

fn write_session_index(
    root: &Path,
    session: &NativeSession,
    dir: &Path,
    diagnostics: &mut Vec<Value>,
) {
    let cut_count = cut_store::load_manifest(root, &session.id)
        .map(|manifest| manifest.packs.len())
        .unwrap_or(0);
    let memory_events = count_events_with_prefix(&dir.join("events.jsonl"), "memory_");
    let value = json!({
        "sessionId": session.id,
        "title": session.snapshot.get("title").cloned().unwrap_or(Value::Null),
        "workingDir": session.snapshot.get("workingDir").cloned().unwrap_or(Value::Null),
        "createdAt": session.created_at,
        "updatedAt": session.snapshot.get("updatedAt").cloned().unwrap_or(Value::Null),
        "counts": {
            "messages": session.snapshot.get("messages").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
            "tools": session.snapshot.get("tools").and_then(Value::as_array).map(Vec::len).unwrap_or(0),
            "cuts": cut_count,
            "memoryEvents": memory_events,
        },
        "head": Value::Null,
    });
    if let Err(error) = write_json(&dir.join("session.json"), &value) {
        diagnostics.push(json!({
            "code": "ledger_session_index_write_failed",
            "message": "Failed to write the session ledger index.",
            "error": error.to_string(),
            "createdAt": now(),
        }));
    }
}

fn summary_with_diagnostics(root: &Path, session_id: &str, mut diagnostics: Vec<Value>) -> Value {
    let mut summary = session_ledger_summary(root, session_id);
    if !diagnostics.is_empty() {
        let existing = summary
            .get("diagnostics")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        diagnostics.extend(existing);
        diagnostics.truncate(DIAGNOSTIC_LIMIT);
        summary["diagnostics"] = Value::Array(diagnostics);
    }
    summary
}

fn append_diagnostics(dir: &Path, diagnostics: &[Value]) {
    if diagnostics.is_empty() {
        return;
    }
    let path = dir.join("diagnostics.jsonl");
    let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    for diagnostic in diagnostics {
        if let Ok(line) = serde_json::to_string(diagnostic) {
            let _ = writeln!(file, "{line}");
        }
    }
}

fn read_recent_jsonl(path: &Path, limit: usize) -> Vec<Value> {
    let Ok(file) = fs::File::open(path) else {
        return Vec::new();
    };
    let mut values = BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
        .collect::<Vec<_>>();
    if values.len() > limit {
        values = values.split_off(values.len() - limit);
    }
    values
}

fn read_last_event_at(path: &Path) -> Option<Value> {
    read_recent_jsonl(path, 1)
        .pop()
        .and_then(|event| event.get("createdAt").cloned())
}

fn count_events_with_prefix(path: &Path, prefix: &str) -> usize {
    let Ok(file) = fs::File::open(path) else {
        return 0;
    };
    BufReader::new(file)
        .lines()
        .map_while(Result::ok)
        .filter_map(|line| serde_json::from_str::<Value>(&line).ok())
        .filter(|event| {
            event
                .get("eventType")
                .and_then(Value::as_str)
                .is_some_and(|event_type| event_type.starts_with(prefix))
        })
        .count()
}

fn session_for_memory_event(root: &Path, session_id: &str) -> NativeSession {
    load_session(root, session_id)
        .ok()
        .flatten()
        .unwrap_or_else(|| {
            let timestamp = now();
            NativeSession {
                id: session_id.to_string(),
                snapshot: json!({
                    "id": session_id,
                    "title": Value::Null,
                    "sessionKind": "normal",
                    "workingDir": Value::Null,
                    "messages": [],
                    "tools": [],
                    "updatedAt": timestamp,
                }),
                created_at: timestamp,
                saved: false,
                save_label: None,
                archived: false,
                custom_title: None,
                short_name: None,
                runtime_turns: Vec::new(),
                rollback_checkpoints: Vec::new(),
                file_read_state: HashMap::new(),
                dirty: false,
                dialog_dirty_from: None,
                persisted_dialog_len: 0,
                dialog_loaded: true,
                ephemeral: false,
                stream_journal_sequence: 0,
            }
        })
}

fn memory_candidate_ledger_json(candidate: &MemoryCandidate) -> Value {
    json!({
        "candidateId": candidate.id,
        "scope": candidate.scope,
        "category": candidate.category,
        "layer": candidate.layer,
        "valueClass": candidate.value_class,
        "confidence": candidate.confidence,
        "sourceType": candidate.source_type,
        "sourceRef": candidate.source_ref,
        "proposedAction": candidate.proposed_action,
        "conflictWith": candidate.conflict_with,
        "targetId": candidate.target_id,
        "status": candidate.status,
        "createdAt": candidate.created_at,
        "fact": redacted_text_value(&candidate.fact),
    })
}

fn io_diagnostic(code: &str, message: &str, error: std::io::Error) -> Value {
    json!({
        "code": code,
        "message": message,
        "error": error.to_string(),
        "createdAt": now(),
    })
}

fn sha256_hex(text: &str) -> String {
    let digest = Sha256::digest(text.as_bytes());
    let mut output = String::with_capacity(digest.len() * 2);
    for byte in digest {
        output.push_str(&format!("{byte:02x}"));
    }
    output
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn test_session(session_id: &str) -> NativeSession {
        NativeSession {
            id: session_id.to_string(),
            snapshot: json!({
                "id": session_id,
                "title": "Ledger Test",
                "sessionKind": "normal",
                "workingDir": "/tmp",
                "messages": [
                    { "id": "msg-user", "role": "user", "text": "hello ledger" },
                    { "id": "msg-secret", "role": "assistant", "text": "password = super-secret-token" }
                ],
                "tools": [],
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
            dirty: true,
            dialog_dirty_from: Some(0),
            persisted_dialog_len: 0,
            dialog_loaded: true,
            ephemeral: false,
            stream_journal_sequence: 0,
        }
    }

    #[test]
    fn session_created_initializes_append_only_ledger_without_git() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        let session = test_session("session-ledger-created");
        save_session(root, &session).expect("save session");

        let summary = record_session_created(root, &session);
        let dir = ledger_dir(root, &session.id);

        // Root cure: the ledger must never create a git repo again — a git
        // subprocess with no timeout (stale index.lock) could park a turn
        // thread forever.
        assert!(!dir.join(".git").exists());
        assert_eq!(summary.get("enabled").and_then(Value::as_bool), Some(true));
        assert_eq!(summary.get("commitCount").and_then(Value::as_u64), Some(1));
        assert!(dir.join("session.json").is_file());
        let events = fs::read_to_string(dir.join("events.jsonl")).expect("events");
        assert!(events.contains("\"eventType\":\"session_created\""));
        let recent = summary
            .get("recentCommits")
            .and_then(Value::as_array)
            .expect("recent entries");
        assert_eq!(recent.len(), 1);
        assert_eq!(
            recent[0].get("subject").and_then(Value::as_str),
            Some("ledger: session_created")
        );
    }

    #[test]
    fn turn_finished_records_redacted_previews_and_no_sqlite() {
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        let session = test_session("session-ledger-turn");
        save_session(root, &session).expect("save session");
        fs::write(
            session_dir(root, &session.id).join("session.sqlite"),
            "not for ledger",
        )
        .expect("write sqlite marker");

        record_turn_finished(root, &session, "turn-ledger", "finished", None);

        let dir = ledger_dir(root, &session.id);
        let events = fs::read_to_string(dir.join("events.jsonl")).expect("events");
        assert!(events.contains("\"eventType\":\"turn_finished\""));
        assert!(events.contains("[redacted: secret-like content]"));
        // The JSONL log never embeds the sqlite payload.
        assert!(!events.contains("not for ledger"));
    }

    #[test]
    fn record_event_works_without_git_binary_semantics() {
        // Ledger recording is pure file I/O now: no subprocess, no way for a
        // missing/hung git binary to affect it.
        let temp = tempdir().expect("tempdir");
        let root = temp.path();
        let session = test_session("session-ledger-no-git");
        save_session(root, &session).expect("save session");

        let summary = record_session_created(root, &session);

        assert_eq!(summary.get("enabled").and_then(Value::as_bool), Some(true));
        assert!(ledger_dir(root, &session.id).join("events.jsonl").is_file());
        assert!(!ledger_dir(root, &session.id).join(".git").exists());
    }
}
