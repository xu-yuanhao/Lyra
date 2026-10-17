use super::*;
use rusqlite::{Connection, params};

pub(crate) const SESSION_SCHEMA_VERSION: i64 = 5;

pub(crate) fn open_connection(path: &Path) -> AgentRuntimeResult<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    open_sqlite_connection(path)
}

pub(crate) fn init_schema(conn: &Connection) -> AgentRuntimeResult<()> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let has_schema: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'session_meta')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let has_marker: bool = conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations')",
            [],
            |row| row.get(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let version: i64 = if has_marker {
        conn.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
    } else {
        0
    };
    if version > SESSION_SCHEMA_VERSION {
        return Err(AgentRuntimeError::Core(format!(
            "Session database version {version} is newer than supported {SESSION_SCHEMA_VERSION}"
        )));
    }
    conn.pragma_update(None, "journal_mode", "WAL")
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    if version == SESSION_SCHEMA_VERSION {
        return Ok(());
    }
    // SQLite creates a consistent backup, including committed WAL contents.
    if has_schema && let Some(path) = conn.path().filter(|path| !path.is_empty()) {
        let backup = format!(
            "{path}.pre-v{SESSION_SCHEMA_VERSION}-{}.bak",
            Uuid::new_v4()
        );
        conn.execute("VACUUM INTO ?1", params![backup])
            .map_err(|error| {
                AgentRuntimeError::Core(format!("Unable to back up session database: {error}"))
            })?;
    }
    let tx = rusqlite::Transaction::new_unchecked(conn, rusqlite::TransactionBehavior::Immediate)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let current: i64 = if tx
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name = 'schema_migrations')",
            [],
            |row| row.get::<_, bool>(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
    {
        tx.query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
    } else {
        0
    };
    if current > SESSION_SCHEMA_VERSION {
        return Err(AgentRuntimeError::Core(
            "Session database was upgraded by a newer runtime".into(),
        ));
    }
    for next in current + 1..=SESSION_SCHEMA_VERSION {
        match next {
            1 => create_tables(&tx)?,
            2 => migrate_legacy_columns(&tx)?,
            3 => {
                create_tables(&tx)?;
                migrate_legacy_columns(&tx)?;
            }
            4 => ensure_column(
                &tx,
                "session_bundle",
                "stream_journal_sequence",
                "INTEGER NOT NULL DEFAULT 0",
            )?,
            5 => ensure_column(
                &tx,
                "session_bundle",
                "provider_protocol_json",
                "TEXT NOT NULL DEFAULT '[]'",
            )?,
            _ => {
                return Err(AgentRuntimeError::Core(format!(
                    "Missing session migration {next}"
                )));
            }
        }
        let iso = now();
        tx.execute(
            "INSERT INTO schema_migrations (version, applied_at_ms, applied_at_iso) VALUES (?1, ?2, ?3)",
            params![next, iso_ms(&iso), iso],
        ).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    tx.commit()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))
}

fn create_tables(conn: &Connection) -> AgentRuntimeResult<()> {
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at_ms INTEGER NOT NULL,
          applied_at_iso TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS session_meta (
          session_id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          session_kind TEXT NOT NULL,
          working_dir TEXT NOT NULL,
          project_bound INTEGER NOT NULL,
          working_dir_is_home INTEGER NOT NULL,
          turn_status TEXT NOT NULL,
          active_turn_id TEXT,
          created_at_ms INTEGER NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          updated_at_iso TEXT NOT NULL,
          saved INTEGER NOT NULL DEFAULT 0,
          save_label TEXT,
          archived INTEGER NOT NULL DEFAULT 0,
          custom_title TEXT,
          short_name TEXT
        );

        CREATE TABLE IF NOT EXISTS session_dialog (
          msg_id TEXT PRIMARY KEY,
          ordinal INTEGER NOT NULL,
          turn_index INTEGER,
          role TEXT NOT NULL,
          content_raw TEXT NOT NULL,
          token_count INTEGER NOT NULL DEFAULT 0,
          char_count INTEGER NOT NULL DEFAULT 0,
          created_at_ms INTEGER NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          updated_at_iso TEXT NOT NULL,
          metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_session_dialog_ordinal
          ON session_dialog(ordinal);

        CREATE TABLE IF NOT EXISTS session_bundle (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          snapshot_json TEXT NOT NULL,
          runtime_turns_json TEXT NOT NULL,
          rollback_checkpoints_json TEXT NOT NULL,
          file_read_state_json TEXT NOT NULL,
          stream_journal_sequence INTEGER NOT NULL DEFAULT 0,
          provider_protocol_json TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS stream_deltas (
          sequence INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id TEXT NOT NULL,
          channel TEXT NOT NULL,
          delta TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS trim_journal (
          journal_id TEXT PRIMARY KEY,
          state TEXT NOT NULL,
          cut_pack_id TEXT,
          msg_ids_json TEXT NOT NULL,
          ordinal_start INTEGER,
          ordinal_end INTEGER,
          token_before INTEGER NOT NULL,
          token_after INTEGER,
          created_at_ms INTEGER NOT NULL,
          created_at_iso TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL,
          updated_at_iso TEXT NOT NULL
        );
        "#,
    )
    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    Ok(())
}

fn migrate_legacy_columns(conn: &Connection) -> AgentRuntimeResult<()> {
    // Version 2 used to stamp the current version without upgrading old tables.
    // The repair is an ordered migration, so even those incorrectly stamped DBs
    // are upgraded exactly once, atomically with their migration marker.
    for (table, column, definition) in [
        ("session_meta", "saved", "INTEGER NOT NULL DEFAULT 0"),
        ("session_meta", "save_label", "TEXT"),
        ("session_meta", "archived", "INTEGER NOT NULL DEFAULT 0"),
        ("session_meta", "custom_title", "TEXT"),
        ("session_meta", "short_name", "TEXT"),
        (
            "session_bundle",
            "rollback_checkpoints_json",
            "TEXT NOT NULL DEFAULT '[]'",
        ),
        (
            "session_bundle",
            "file_read_state_json",
            "TEXT NOT NULL DEFAULT '{}'",
        ),
        ("session_dialog", "turn_index", "INTEGER"),
        (
            "session_dialog",
            "token_count",
            "INTEGER NOT NULL DEFAULT 0",
        ),
        ("session_dialog", "char_count", "INTEGER NOT NULL DEFAULT 0"),
        ("session_dialog", "metadata_json", "TEXT"),
    ] {
        ensure_column(conn, table, column, definition)?;
    }

    Ok(())
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    definition: &str,
) -> AgentRuntimeResult<()> {
    let mut statement = conn
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    if !columns.iter().any(|name| name == column) {
        conn.execute_batch(&format!(
            "ALTER TABLE {table} ADD COLUMN {column} {definition}"
        ))
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repairs_old_columns_and_preserves_a_consistent_backup_once() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("session.sqlite");
        let conn = open_connection(&path).unwrap();
        init_schema(&conn).unwrap();
        conn.execute_batch("DELETE FROM schema_migrations WHERE version >= 3; ALTER TABLE session_meta DROP COLUMN custom_title; ALTER TABLE session_bundle DROP COLUMN file_read_state_json; ALTER TABLE session_bundle DROP COLUMN stream_journal_sequence;").unwrap();
        init_schema(&conn).unwrap();
        conn.prepare("SELECT custom_title FROM session_meta")
            .unwrap();
        conn.prepare("SELECT stream_journal_sequence FROM session_bundle")
            .unwrap();
        conn.prepare("SELECT file_read_state_json FROM session_bundle")
            .unwrap();
        let backups = || {
            fs::read_dir(temp.path())
                .unwrap()
                .filter_map(Result::ok)
                .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "bak"))
                .count()
        };
        assert_eq!(backups(), 1);
        init_schema(&conn).unwrap();
        assert_eq!(backups(), 1);
        assert_eq!(
            conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            SESSION_SCHEMA_VERSION
        );
    }

    #[test]
    fn rejects_future_versions_without_mutating_or_downgrading() {
        let conn = Connection::open_in_memory().unwrap();
        init_schema(&conn).unwrap();
        conn.execute("INSERT INTO schema_migrations VALUES (100, 0, '')", [])
            .unwrap();
        assert!(
            init_schema(&conn)
                .unwrap_err()
                .to_string()
                .contains("newer")
        );
        assert_eq!(
            conn.query_row("SELECT MAX(version) FROM schema_migrations", [], |row| row
                .get::<_, i64>(
                0
            ))
            .unwrap(),
            100
        );
    }
}
