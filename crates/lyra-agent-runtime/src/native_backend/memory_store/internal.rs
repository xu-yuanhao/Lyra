use super::*;

pub(crate) fn open_memory_connection(root: &Path) -> AgentRuntimeResult<Connection> {
    fs::create_dir_all(root).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    // Same contract as codex/ZCode: readers and the background memory worker
    // share this file. WAL is switched once at startup (init_memory_schema),
    // never re-probed here — a mode switch needs a momentary exclusive lock,
    // so re-probing on every open turned each poll into a lock contender.
    open_sqlite_connection(&memory_store_path(root))
}

pub(crate) fn init_memory_schema(conn: &Connection) -> AgentRuntimeResult<()> {
    // Steady state is read-free: the startup call (ensure_memory_store) has
    // applied the schema, so later callers only verify the ledger row. The
    // DDL batch below ends in an INSERT — re-running it per call made every
    // session read a writer and serialized polls behind the memory worker.
    if memory_schema_ready(conn)? {
        return Ok(());
    }
    // WAL is a startup-time switch, never a per-open probe: changing journal
    // mode needs a momentary exclusive lock, so probing on every connection
    // made each poll a lock contender (codex/ZCode set WAL once at init).
    ensure_wal(conn)?;
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          scope TEXT NOT NULL,
          category TEXT NOT NULL,
          fact TEXT NOT NULL,
          content_json TEXT NOT NULL,
          confidence REAL NOT NULL,
          source_type TEXT NOT NULL,
          source_ref TEXT,
          status TEXT NOT NULL,
          priority INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_accessed_at TEXT,
          access_count INTEGER NOT NULL DEFAULT 0,
          expires_at TEXT,
          supersedes TEXT,
          superseded_by TEXT
        );

        CREATE TABLE IF NOT EXISTS memory_tags (
          memory_id TEXT NOT NULL,
          tag TEXT NOT NULL,
          PRIMARY KEY (memory_id, tag),
          FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS memory_relations (
          source_id TEXT NOT NULL,
          target_id TEXT NOT NULL,
          relation TEXT NOT NULL,
          confidence REAL NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (source_id, target_id, relation),
          FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
          FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS memory_events (
          id TEXT PRIMARY KEY,
          memory_id TEXT,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
          memory_id UNINDEXED,
          fact,
          content,
          tags,
          category,
          scope
        );

        CREATE TABLE IF NOT EXISTS memory_embeddings (
          memory_id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          dimension INTEGER NOT NULL,
          vector BLOB NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS memory_access_events (
          id TEXT PRIMARY KEY,
          memory_id TEXT NOT NULL,
          access_type TEXT NOT NULL,
          query TEXT,
          score REAL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS memory_candidates (
          id TEXT PRIMARY KEY,
          fact TEXT NOT NULL,
          content_json TEXT NOT NULL,
          category TEXT NOT NULL,
          scope TEXT NOT NULL,
          confidence REAL NOT NULL,
          source_type TEXT NOT NULL,
          source_ref TEXT,
          proposed_action TEXT NOT NULL,
          conflict_with TEXT,
          target_id TEXT,
          relation_type TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          reviewed_at TEXT,
          expires_at TEXT
        );

        CREATE TABLE IF NOT EXISTS memory_injection_events (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          turn_id TEXT,
          query TEXT,
          selected_json TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recall_items (
          id TEXT PRIMARY KEY,
          source_kind TEXT NOT NULL,
          source_id TEXT NOT NULL,
          session_id TEXT,
          turn_id TEXT,
          role TEXT,
          text TEXT NOT NULL,
          summary TEXT,
          content_hash TEXT NOT NULL,
          source_path TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS recall_fts USING fts5(
          recall_id UNINDEXED,
          text,
          summary,
          source_kind
        );

        CREATE TABLE IF NOT EXISTS recall_embeddings (
          recall_id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          model TEXT NOT NULL,
          dimension INTEGER NOT NULL,
          vector BLOB NOT NULL,
          content_hash TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (recall_id) REFERENCES recall_items(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_recall_items_source
          ON recall_items(source_kind, source_id);
        CREATE INDEX IF NOT EXISTS idx_recall_items_content_hash
          ON recall_items(content_hash);
        CREATE INDEX IF NOT EXISTS idx_recall_items_session_turn
          ON recall_items(session_id, turn_id);

        CREATE TABLE IF NOT EXISTS proactive_events (
          id TEXT PRIMARY KEY,
          trigger_type TEXT NOT NULL,
          title TEXT NOT NULL,
          reason TEXT NOT NULL,
          source_json TEXT NOT NULL,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          session_id TEXT,
          created_at TEXT NOT NULL,
          dismissed_at TEXT,
          opened_session_id TEXT
        );

        CREATE TABLE IF NOT EXISTS trigger_marks (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          created_at TEXT NOT NULL,
          processed_at TEXT
        );

        CREATE TABLE IF NOT EXISTS memory_jobs (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          turn_id TEXT NOT NULL,
          job_type TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          started_at TEXT,
          completed_at TEXT,
          result_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_trigger_marks_session_turn
          ON trigger_marks(session_id, turn_id);
        CREATE INDEX IF NOT EXISTS idx_memory_jobs_status_created
          ON memory_jobs(status, created_at);

        CREATE TABLE IF NOT EXISTS layer_projection_state (
          memory_id TEXT PRIMARY KEY,
          revision INTEGER NOT NULL,
          exported_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_trigger_marks_unprocessed
          ON trigger_marks(session_id, processed_at, created_at);
        "#,
    )
    .map_err(sql_error)?;
    apply_memory_schema_migrations(conn)?;
    conn.execute(
        "INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?1, ?2)",
        params![MEMORY_SCHEMA_VERSION, now()],
    )
    .map_err(sql_error)?;
    Ok(())
}

fn apply_memory_schema_migrations(conn: &Connection) -> AgentRuntimeResult<()> {
    ensure_column(conn, "memories", "layer", "TEXT NOT NULL DEFAULT 'shared'")?;
    ensure_column(
        conn,
        "memories",
        "value_class",
        "TEXT NOT NULL DEFAULT 'semantic'",
    )?;
    ensure_column(conn, "memories", "abstract_text", "TEXT")?;
    ensure_column(conn, "memory_candidates", "layer", "TEXT")?;
    ensure_column(conn, "memory_candidates", "value_class", "TEXT")?;
    ensure_column(conn, "memory_candidates", "trigger_event", "TEXT")?;
    ensure_column(conn, "memory_candidates", "evidence_json", "TEXT")?;
    ensure_column(conn, "memories", "revision", "INTEGER NOT NULL DEFAULT 1")?;
    ensure_column(conn, "memory_candidates", "stability_review_at", "TEXT")?;
    ensure_column(
        conn,
        "memory_candidates",
        "stability_window_hours",
        "INTEGER",
    )?;
    if !schema_migration_applied(conn, MEMORY_SCHEMA_VERSION)? {
        rebuild_memory_fts_for_all_statuses(conn)?;
    }
    Ok(())
}

fn schema_migration_applied(conn: &Connection, version: i64) -> AgentRuntimeResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
        params![version],
        |row| row.get::<_, bool>(0),
    )
    .map_err(sql_error)
}

fn table_exists(conn: &Connection, name: &str) -> AgentRuntimeResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
        params![name],
        |row| row.get::<_, bool>(0),
    )
    .map_err(sql_error)
}

fn memory_schema_ready(conn: &Connection) -> AgentRuntimeResult<bool> {
    // Fresh file: no ledger table yet → full DDL path.
    if !table_exists(conn, "schema_migrations")?
        || !schema_migration_applied(conn, MEMORY_SCHEMA_VERSION)?
    {
        return Ok(false);
    }
    // Databases created before the WAL contract have the ledger row but still
    // run the delete journal; they must cross the one-time WAL switch.
    let mode: String = conn
        .query_row("PRAGMA journal_mode", [], |row| row.get(0))
        .map_err(sql_error)?;
    Ok(mode.eq_ignore_ascii_case("wal"))
}

fn ensure_wal(conn: &Connection) -> AgentRuntimeResult<()> {
    // Switching journal modes needs a momentary exclusive lock, so only the
    // busy timeout stands between us and SQLITE_BUSY — re-read the mode and
    // retry a bounded number of times, like ZCode's migration runner.
    for _ in 0..50 {
        let mode: String = conn
            .query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .map_err(sql_error)?;
        if mode.eq_ignore_ascii_case("wal") || !mode.eq_ignore_ascii_case("delete") {
            return Ok(());
        }
        if conn
            .query_row("PRAGMA journal_mode = WAL", [], |row| {
                row.get::<_, String>(0)
            })
            .is_ok_and(|set| set.eq_ignore_ascii_case("wal"))
        {
            return Ok(());
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    Ok(())
}

fn rebuild_memory_fts_for_all_statuses(conn: &Connection) -> AgentRuntimeResult<()> {
    conn.execute("DELETE FROM memory_fts", [])
        .map_err(sql_error)?;
    for record in load_all_memory_records(conn)? {
        upsert_memory_fts(conn, &record)?;
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
        .map_err(sql_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    if columns.iter().any(|name| name == column) {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE {table} ADD COLUMN {column} {definition}"),
        [],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn rank_memory_records(
    conn: &Connection,
    query: &MemoryQuery,
) -> AgentRuntimeResult<Vec<RankedMemoryRecord>> {
    let query_text = query
        .query
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let fts_scores = query_text
        .map(|text| fts_score_map(conn, text))
        .transpose()?
        .unwrap_or_default();
    let query_embedding = query_text.and_then(query_embedding);
    let embeddings = if query_embedding.is_some() {
        load_embedding_map(conn)?
    } else {
        HashMap::new()
    };
    let relation_counts = relation_degree_map(conn)?;
    let contradiction_ids = contradiction_id_set(conn)?;
    let mut ranked = Vec::new();
    for record in load_all_memory_records(conn)? {
        if !memory_passes_filters(&record, query) {
            continue;
        }
        let fts_score = fts_scores.get(&record.id).copied().unwrap_or(0.0);
        let vector_score = query_embedding
            .as_ref()
            .map(|query_vector| {
                let record_vector = embeddings.get(&record.id).cloned().or_else(|| {
                    try_upsert_memory_embedding(conn, &record).ok().flatten()?;
                    load_memory_embedding(conn, &record.id).ok().flatten()
                });
                record_vector
                    .as_ref()
                    .map(|vector| cosine(query_vector, vector))
                    .unwrap_or(0.0)
            })
            .unwrap_or(0.0);
        let metadata_relevance = metadata_relevance(&record, query);
        let confidence_boost = record.confidence.clamp(0.0, 1.0);
        let access_frequency_boost = access_frequency_boost(record.access_count);
        let graph_degree = relation_counts.get(&record.id).copied().unwrap_or(0);
        let (half_life_days, age_days, retention, decay_penalty) =
            decay_metrics(&record, graph_degree);
        let recency_boost = retention.clamp(0.0, 1.0);
        let contradiction_penalty = if contradiction_ids.contains(&record.id) {
            0.4
        } else {
            0.0
        };
        let layer_boost = super::super::memory_layer::layer_rank_boost(&record.layer);
        let mut matched_by = Vec::new();
        if fts_score > 0.0 {
            matched_by.push("fts".to_string());
        }
        if vector_score > 0.12 {
            matched_by.push("vector".to_string());
        }
        if metadata_relevance > 0.0 {
            matched_by.push("metadata".to_string());
        }
        let mut breakdown = MemoryScoreBreakdown {
            fts_score,
            vector_score,
            metadata_relevance,
            confidence_boost,
            access_frequency_boost,
            graph_boost: 0.0,
            recency_boost,
            decay_penalty,
            contradiction_penalty,
            half_life_days,
            age_days,
            retention,
            matched_by,
            ..MemoryScoreBreakdown::default()
        };
        breakdown.final_score = final_memory_score(&breakdown) + layer_boost;
        ranked.push(RankedMemoryRecord {
            record,
            score: breakdown.final_score,
            breakdown,
        });
    }

    if query.include_related {
        let seed_ids = ranked
            .iter()
            .filter(|entry| {
                entry.breakdown.fts_score > 0.0
                    || entry.breakdown.vector_score > 0.45
                    || entry.breakdown.metadata_relevance > 0.0
            })
            .take(12)
            .map(|entry| entry.record.id.clone())
            .collect::<Vec<_>>();
        let boosts = graph_expansion_boosts(conn, &seed_ids)?;
        for entry in &mut ranked {
            if let Some(boost) = boosts.get(&entry.record.id) {
                entry.breakdown.graph_boost = (*boost).min(1.0);
                if !entry
                    .breakdown
                    .matched_by
                    .iter()
                    .any(|source| source == "graph")
                {
                    entry.breakdown.matched_by.push("graph".to_string());
                }
                entry.breakdown.final_score = final_memory_score(&entry.breakdown);
                entry.score = entry.breakdown.final_score;
            }
        }
    }

    if query_text.is_some() {
        ranked.retain(|entry| {
            entry.breakdown.fts_score > 0.0
                || entry.breakdown.vector_score > 0.12
                || entry.breakdown.metadata_relevance > 0.0
                || entry.breakdown.graph_boost > 0.0
        });
    }

    ranked.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| right.record.updated_at.cmp(&left.record.updated_at))
    });
    Ok(ranked)
}

pub(super) fn load_all_memory_records(
    conn: &Connection,
) -> AgentRuntimeResult<Vec<LongTermMemoryRecord>> {
    let mut statement = conn
        .prepare("SELECT id FROM memories ORDER BY priority DESC, updated_at DESC, created_at DESC")
        .map_err(sql_error)?;
    let ids = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    ids.into_iter()
        .filter_map(|id| load_memory_record(conn, &id).transpose())
        .collect()
}

pub(super) fn memory_passes_filters(record: &LongTermMemoryRecord, query: &MemoryQuery) -> bool {
    if !query.include_archived && record.status != "active" {
        return false;
    }
    if let Some(status) = query.status.as_deref()
        && record.status != status
    {
        return false;
    }
    if let Some(scope) = query.scope.as_deref()
        && record.scope != scope
    {
        return false;
    }
    if let Some(category) = query.category.as_deref()
        && record.category != category
    {
        return false;
    }
    if let Some(layer) = query.layer.as_deref()
        && record.layer != layer
    {
        return false;
    }
    if let Some(value_class) = query.value_class.as_deref()
        && record.value_class != value_class
    {
        return false;
    }
    if is_expired(record) && record.status == "active" && query.status.is_none() {
        return false;
    }
    true
}

pub(super) fn final_memory_score(breakdown: &MemoryScoreBreakdown) -> f64 {
    (breakdown.fts_score * 0.34
        + breakdown.vector_score * 0.34
        + breakdown.metadata_relevance * 0.08
        + breakdown.confidence_boost * 0.08
        + breakdown.access_frequency_boost * 0.08
        + breakdown.graph_boost * 0.05
        + breakdown.recency_boost * 0.03
        - breakdown.decay_penalty
        - breakdown.contradiction_penalty)
        .max(0.0)
}

pub(super) fn fts_score_map(
    conn: &Connection,
    query: &str,
) -> AgentRuntimeResult<HashMap<String, f64>> {
    let Some(fts_query) = fts_query(query) else {
        return Ok(HashMap::new());
    };
    let mut statement = conn
        .prepare(
            "SELECT memory_id, bm25(memory_fts) AS rank
             FROM memory_fts
             WHERE memory_fts MATCH ?1",
        )
        .map_err(sql_error)?;
    let rows = statement
        .query_map(params![fts_query], |row| {
            let id: String = row.get(0)?;
            let rank: f64 = row.get(1)?;
            Ok((id, rank))
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(normalized_bm25_score_map(rows))
}

fn normalized_bm25_score_map(rows: Vec<(String, f64)>) -> HashMap<String, f64> {
    let qualities = rows
        .iter()
        .map(|(_, rank)| bm25_rank_quality(*rank))
        .collect::<Vec<_>>();
    let max_quality = qualities
        .iter()
        .copied()
        .fold(0.0_f64, |left, right| left.max(right));
    rows.into_iter()
        .zip(qualities)
        .map(|((id, _), quality)| {
            let score = if max_quality > f64::EPSILON {
                quality / max_quality
            } else {
                1.0
            };
            (id, score.clamp(0.0, 1.0))
        })
        .collect()
}

fn bm25_rank_quality(rank: f64) -> f64 {
    if rank.is_nan() {
        return 0.0;
    }
    if rank < 0.0 {
        return -rank;
    }
    1.0 / (1.0 + rank.max(0.0))
}

pub(super) fn fts_query(query: &str) -> Option<String> {
    let terms = search_terms(query);
    if terms.is_empty() {
        return None;
    }
    Some(
        terms
            .into_iter()
            .take(12)
            .map(|term| {
                if term.is_ascii() {
                    format!("{term}*")
                } else {
                    format!("\"{}\"", term.replace('"', ""))
                }
            })
            .collect::<Vec<_>>()
            .join(" OR "),
    )
}

pub(super) fn metadata_relevance(record: &LongTermMemoryRecord, query: &MemoryQuery) -> f64 {
    let mut score = 0.0_f64;
    if query.scope.as_deref() == Some(record.scope.as_str()) {
        score += 0.35;
    }
    if query.category.as_deref() == Some(record.category.as_str()) {
        score += 0.35;
    }
    score.min(1.0)
}

pub(super) fn decay_metrics(
    record: &LongTermMemoryRecord,
    relation_degree: usize,
) -> (f64, f64, f64, f64) {
    let age_days = age_days(record.updated_at.as_str());
    let base_half_life = base_half_life_days(record);
    let access_multiplier = (1.0 + (record.access_count as f64 + 1.0).ln() / 3.0).min(4.0);
    let relation_multiplier = (1.0 + relation_degree as f64 * 0.08).min(2.0);
    let half_life_days = base_half_life * access_multiplier * relation_multiplier;
    let retention = (-age_days / half_life_days.max(1.0)).exp();
    let decay_penalty = if record.source_type == "user_declaration" && record.confidence >= 0.95 {
        (1.0 - retention) * 0.04
    } else {
        (1.0 - retention) * 0.22
    };
    (half_life_days, age_days, retention, decay_penalty)
}

pub(super) fn base_half_life_days(record: &LongTermMemoryRecord) -> f64 {
    let base: f64 = match record.source_type.as_str() {
        "agent_inference" => 14.0,
        "memory_agent_inference" => 45.0,
        "tool_observation" => 7.0,
        _ => match record.category.as_str() {
            "user_profile" => 365.0,
            "preference" => 180.0,
            "project" => 90.0,
            "instruction" => 180.0,
            "goal" => 30.0,
            _ => 30.0,
        },
    };
    base.max(1.0)
}

pub(super) fn access_frequency_boost(access_count: u64) -> f64 {
    ((access_count as f64 + 1.0).ln() / 4.0).min(1.0)
}

pub(super) fn age_days(value: &str) -> f64 {
    DateTime::parse_from_rfc3339(value)
        .map(|time| {
            let duration = Utc::now().signed_duration_since(time.with_timezone(&Utc));
            duration.num_seconds().max(0) as f64 / 86_400.0
        })
        .unwrap_or(0.0)
}

pub(super) fn is_expired(record: &LongTermMemoryRecord) -> bool {
    record
        .expires_at
        .as_deref()
        .and_then(|value| DateTime::parse_from_rfc3339(value).ok())
        .map(|time| time.with_timezone(&Utc) <= Utc::now())
        .unwrap_or(false)
}

pub(super) fn insert_memory_record(
    conn: &Connection,
    record: &LongTermMemoryRecord,
) -> AgentRuntimeResult<bool> {
    let changed = conn
        .execute(
            "INSERT OR IGNORE INTO memories (
                id, scope, category, fact, content_json, layer, value_class, abstract_text,
                confidence, source_type, source_ref, status, priority, created_at, updated_at,
                last_accessed_at, access_count, expires_at, supersedes, superseded_by, revision
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)",
            params![
                record.id,
                record.scope,
                record.category,
                record.fact,
                serde_json::to_string(&record.content)
                    .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
                record.layer,
                record.value_class,
                record.abstract_text,
                record.confidence,
                record.source_type,
                record.source_ref,
                record.status,
                record.priority,
                record.created_at,
                record.updated_at,
                record.last_accessed_at,
                record.access_count,
                record.expires_at,
                record.supersedes,
                record.superseded_by,
                record.revision as i64,
            ],
        )
        .map_err(sql_error)?;
    if changed > 0 {
        replace_memory_tags(conn, &record.id, &record.tags)?;
        replace_memory_relations(conn, &record.related_to)?;
        upsert_memory_fts(conn, record)?;
        sync_memory_record_to_recall(conn, record)?;
        if let Err(error) = try_upsert_memory_embedding(conn, record) {
            write_memory_event(
                conn,
                Some(&record.id),
                "embedding_failed",
                json!({ "message": error.to_string() }),
            )?;
        }
    }
    Ok(changed > 0)
}

pub(super) fn replace_memory_record(
    conn: &Connection,
    record: &LongTermMemoryRecord,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "UPDATE memories SET
            scope = ?2,
            category = ?3,
            fact = ?4,
            content_json = ?5,
            layer = ?6,
            value_class = ?7,
            abstract_text = ?8,
            confidence = ?9,
            source_type = ?10,
            source_ref = ?11,
            status = ?12,
            priority = ?13,
            updated_at = ?14,
            last_accessed_at = ?15,
            access_count = ?16,
            expires_at = ?17,
            supersedes = ?18,
            superseded_by = ?19,
            revision = ?20
         WHERE id = ?1",
        params![
            record.id,
            record.scope,
            record.category,
            record.fact,
            serde_json::to_string(&record.content)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
            record.layer,
            record.value_class,
            record.abstract_text,
            record.confidence,
            record.source_type,
            record.source_ref,
            record.status,
            record.priority,
            record.updated_at,
            record.last_accessed_at,
            record.access_count,
            record.expires_at,
            record.supersedes,
            record.superseded_by,
            record.revision as i64,
        ],
    )
    .map_err(sql_error)?;
    replace_memory_tags(conn, &record.id, &record.tags)?;
    conn.execute(
        "DELETE FROM memory_relations WHERE source_id = ?1",
        params![record.id],
    )
    .map_err(sql_error)?;
    for relation in &record.related_to {
        upsert_memory_relation(conn, relation)?;
    }
    upsert_memory_fts(conn, record)?;
    sync_memory_record_to_recall(conn, record)?;
    if let Err(error) = try_upsert_memory_embedding(conn, record) {
        write_memory_event(
            conn,
            Some(&record.id),
            "embedding_failed",
            json!({ "message": error.to_string() }),
        )?;
    }
    Ok(())
}

pub(super) fn load_memory_record(
    conn: &Connection,
    id: &str,
) -> AgentRuntimeResult<Option<LongTermMemoryRecord>> {
    let row = conn
        .query_row(
            "SELECT id, scope, category, fact, content_json, layer, value_class, abstract_text,
                    confidence, source_type, source_ref, status, priority, created_at, updated_at,
                    last_accessed_at, access_count, expires_at, supersedes, superseded_by, revision
             FROM memories WHERE id = ?1",
            params![id],
            |row| {
                let content_json: String = row.get(4)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    content_json,
                    row.get::<_, String>(5)?,
                    row.get::<_, String>(6)?,
                    row.get::<_, Option<String>>(7)?,
                    row.get::<_, f64>(8)?,
                    row.get::<_, String>(9)?,
                    row.get::<_, Option<String>>(10)?,
                    row.get::<_, String>(11)?,
                    row.get::<_, i64>(12)?,
                    row.get::<_, String>(13)?,
                    row.get::<_, String>(14)?,
                    row.get::<_, Option<String>>(15)?,
                    row.get::<_, u64>(16)?,
                    row.get::<_, Option<String>>(17)?,
                    row.get::<_, Option<String>>(18)?,
                    row.get::<_, Option<String>>(19)?,
                    row.get::<_, i64>(20)?,
                ))
            },
        )
        .optional()
        .map_err(sql_error)?;
    let Some((
        id,
        scope,
        category,
        fact,
        content_json,
        layer,
        value_class,
        abstract_text,
        confidence,
        source_type,
        source_ref,
        status,
        priority,
        created_at,
        updated_at,
        last_accessed_at,
        access_count,
        expires_at,
        supersedes,
        superseded_by,
        revision,
    )) = row
    else {
        return Ok(None);
    };
    let content = serde_json::from_str(&content_json).unwrap_or(Value::Null);
    let tags = load_memory_tags(conn, &id)?;
    let related_to = load_memory_relations(conn, &id)?;
    let mut record = LongTermMemoryRecord {
        id,
        scope,
        category,
        fact,
        content,
        layer,
        value_class,
        abstract_text,
        confidence,
        source_type,
        source_ref,
        status,
        priority,
        created_at,
        updated_at,
        last_accessed_at,
        access_count,
        tags,
        related_to,
        expires_at,
        supersedes,
        superseded_by,
        revision: revision.max(1) as u64,
    };
    super::super::memory_layer::apply_layer_fields_to_record(&mut record);
    super::super::memory_derived_fields::apply_derived_fields_to_record(&mut record);
    Ok(Some(record))
}

pub(super) fn insert_memory_candidate(
    conn: &Connection,
    candidate: &MemoryCandidate,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "INSERT INTO memory_candidates (
            id, fact, content_json, category, scope, layer, value_class, trigger_event,
            evidence_json, confidence, source_type, source_ref, proposed_action, conflict_with,
            target_id, relation_type, status, created_at, reviewed_at, expires_at,
            stability_review_at, stability_window_hours
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22)",
        params![
            candidate.id,
            candidate.fact,
            serde_json::to_string(&candidate.content)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
            candidate.category,
            candidate.scope,
            candidate.layer,
            candidate.value_class,
            candidate.trigger_event,
            candidate
                .evidence_json
                .as_ref()
                .map(|value| {
                    serde_json::to_string(value)
                        .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))
                })
                .transpose()?,
            candidate.confidence,
            candidate.source_type,
            candidate.source_ref,
            candidate.proposed_action,
            candidate.conflict_with,
            candidate.target_id,
            candidate.relation_type,
            candidate.status,
            candidate.created_at,
            candidate.reviewed_at,
            candidate.expires_at,
            candidate.stability_review_at,
            candidate.stability_window_hours,
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn load_memory_candidate(
    conn: &Connection,
    id: &str,
) -> AgentRuntimeResult<Option<MemoryCandidate>> {
    conn.query_row(
        "SELECT id, fact, content_json, category, scope, layer, value_class, trigger_event,
                evidence_json, confidence, source_type, source_ref, proposed_action, conflict_with,
                target_id, relation_type, status, created_at, reviewed_at, expires_at,
                stability_review_at, stability_window_hours
         FROM memory_candidates WHERE id = ?1",
        params![id],
        |row| {
            let content_json: String = row.get(2)?;
            let evidence_json: Option<String> = row.get(8)?;
            Ok(MemoryCandidate {
                id: row.get(0)?,
                fact: row.get(1)?,
                content: serde_json::from_str(&content_json).unwrap_or(Value::Null),
                category: row.get(3)?,
                scope: row.get(4)?,
                layer: row.get(5)?,
                value_class: row.get(6)?,
                trigger_event: row.get(7)?,
                evidence_json: evidence_json
                    .as_deref()
                    .and_then(|value| serde_json::from_str(value).ok()),
                confidence: row.get(9)?,
                source_type: row.get(10)?,
                source_ref: row.get(11)?,
                proposed_action: row.get(12)?,
                conflict_with: row.get(13)?,
                target_id: row.get(14)?,
                relation_type: row.get(15)?,
                status: row.get(16)?,
                created_at: row.get(17)?,
                reviewed_at: row.get(18)?,
                expires_at: row.get(19)?,
                stability_review_at: row.get(20)?,
                stability_window_hours: row.get(21)?,
            })
        },
    )
    .optional()
    .map_err(sql_error)
}

pub(super) fn promote_stability_pending_candidates(conn: &Connection) -> AgentRuntimeResult<usize> {
    let timestamp = now();
    let changed = conn
        .execute(
            "UPDATE memory_candidates
             SET status = 'pending', reviewed_at = ?1
             WHERE status = 'stability_pending'
               AND stability_review_at IS NOT NULL
               AND stability_review_at <= ?1",
            params![timestamp],
        )
        .map_err(sql_error)?;
    Ok(changed)
}

pub(super) fn mark_memory_candidate_status(
    conn: &Connection,
    id: &str,
    status: &str,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "UPDATE memory_candidates SET status = ?2, reviewed_at = ?3 WHERE id = ?1",
        params![id, normalize_candidate_status(status), now()],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn expire_memory_candidates(conn: &Connection) -> AgentRuntimeResult<()> {
    conn.execute(
        "UPDATE memory_candidates
         SET status = 'expired', reviewed_at = ?1
         WHERE status IN ('pending', 'needs_user_confirmation')
           AND expires_at IS NOT NULL
           AND expires_at <= ?1",
        params![now()],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn apply_memory_candidate_action(
    root: &Path,
    candidate: &MemoryCandidate,
) -> AgentRuntimeResult<Value> {
    match candidate.proposed_action.as_str() {
        "create" => {
            let record = create_long_term_memory(root, candidate_to_memory_mutation(candidate))?;
            Ok(json!({ "action": "create", "record": memory_record_json(&record) }))
        }
        "update" | "replace" => {
            let target_id = candidate_target_id(candidate)?;
            let mut mutation = candidate_to_memory_mutation(candidate);
            mutation.id = Some(target_id.clone());
            let record = update_long_term_memory(root, mutation)?;
            reconcile_candidate_action_relations(root, candidate, Some(&record.id))?;
            Ok(json!({ "action": "replace", "record": memory_record_json(&record) }))
        }
        "merge" => {
            let target_id = candidate_target_id(candidate)?;
            let existing = load_memory_record(&open_memory_connection(root)?, &target_id)?
                .ok_or_else(|| AgentRuntimeError::Core(format!("memory not found: {target_id}")))?;
            let merged_content = merge_memory_content(&existing.content, &candidate.content);
            let record = update_long_term_memory(
                root,
                MemoryMutation {
                    id: Some(target_id),
                    fact: Some(candidate.fact.clone()),
                    content: Some(merged_content),
                    confidence: Some(candidate.confidence),
                    source_type: Some(candidate.source_type.clone()),
                    source_ref: candidate.source_ref.clone(),
                    ..MemoryMutation::default()
                },
            )?;
            reconcile_candidate_action_relations(root, candidate, Some(&record.id))?;
            Ok(json!({ "action": "merge", "record": memory_record_json(&record) }))
        }
        "deprecate" | "forget" => {
            let target_id = candidate_target_id(candidate)?;
            let result =
                forget_long_term_memory(root, &target_id, "archive", Some("memory candidate"))?;
            reconcile_candidate_action_relations(root, candidate, None)?;
            Ok(json!({ "action": "deprecate", "result": result }))
        }
        "supersede" => {
            let target_id = candidate_target_id(candidate)?;
            let mut mutation = candidate_to_memory_mutation(candidate);
            mutation.supersedes = Some(target_id.clone());
            let record = create_long_term_memory(root, mutation)?;
            let old = update_long_term_memory(
                root,
                MemoryMutation {
                    id: Some(target_id.clone()),
                    status: Some("superseded".to_string()),
                    superseded_by: Some(record.id.clone()),
                    ..MemoryMutation::default()
                },
            )?;
            link_long_term_memory(
                root,
                &record.id,
                &old.id,
                "supersedes",
                candidate.confidence,
            )?;
            Ok(json!({
                "action": "supersede",
                "record": memory_record_json(&record),
                "superseded": memory_summary_json(&old)
            }))
        }
        "link" => {
            let target_id = candidate_target_id(candidate)?;
            let source_id = candidate
                .conflict_with
                .clone()
                .or_else(|| candidate.source_ref.clone())
                .ok_or_else(|| {
                    AgentRuntimeError::Core("memory link candidate source is required".to_string())
                })?;
            let relation = link_long_term_memory(
                root,
                &source_id,
                &target_id,
                candidate.relation_type.as_deref().unwrap_or("related_to"),
                candidate.confidence,
            )?;
            Ok(json!({ "action": "link", "relation": relation }))
        }
        action => Err(AgentRuntimeError::Core(format!(
            "unsupported memory candidate action: {action}"
        ))),
    }
}

pub(super) fn candidate_target_id(candidate: &MemoryCandidate) -> AgentRuntimeResult<String> {
    candidate
        .target_id
        .clone()
        .or_else(|| candidate.conflict_with.clone())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AgentRuntimeError::Core("memory candidate target is required".to_string()))
}

fn reconcile_candidate_action_relations(
    root: &Path,
    candidate: &MemoryCandidate,
    result_record_id: Option<&str>,
) -> AgentRuntimeResult<()> {
    let target_id = candidate
        .target_id
        .as_deref()
        .or(candidate.conflict_with.as_deref());
    let Some(target_id) = target_id else {
        return Ok(());
    };
    match candidate.proposed_action.as_str() {
        "merge" | "replace" | "update" => {
            if let Some(conflict_id) = candidate
                .conflict_with
                .as_deref()
                .filter(|id| *id != target_id)
            {
                let source = result_record_id.unwrap_or(target_id);
                link_long_term_memory(
                    root,
                    source,
                    conflict_id,
                    "contradicts",
                    candidate.confidence,
                )?;
            }
            if candidate.proposed_action == "replace"
                && let Some(new_id) = result_record_id.filter(|id| *id != target_id)
            {
                link_long_term_memory(root, new_id, target_id, "supersedes", candidate.confidence)?;
            }
        }
        "deprecate" | "forget" => {
            if let Some(conflict_id) = candidate.conflict_with.as_deref() {
                let relation = candidate.relation_type.as_deref().unwrap_or("contradicts");
                link_long_term_memory(
                    root,
                    conflict_id,
                    target_id,
                    relation,
                    candidate.confidence,
                )?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub(super) fn mark_trigger_marks_processed(
    conn: &Connection,
    session_id: &str,
    turn_id: &str,
    event_type: &str,
) -> AgentRuntimeResult<()> {
    let timestamp = now();
    conn.execute(
        "UPDATE trigger_marks
         SET processed_at = ?4
         WHERE session_id = ?1 AND turn_id = ?2 AND event_type = ?3 AND processed_at IS NULL",
        params![session_id, turn_id, event_type, timestamp],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn count_pending_memory_jobs(conn: &Connection) -> AgentRuntimeResult<usize> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM memory_jobs WHERE status = 'pending'",
            [],
            |row| row.get(0),
        )
        .map_err(sql_error)?;
    Ok(count.max(0) as usize)
}

pub(super) fn recover_interrupted_memory_jobs(conn: &Connection) -> AgentRuntimeResult<usize> {
    conn.execute(
        "UPDATE memory_jobs
         SET status = 'pending', started_at = NULL
         WHERE status = 'running' AND completed_at IS NULL",
        [],
    )
    .map_err(sql_error)
}

fn merge_memory_content(existing: &Value, incoming: &Value) -> Value {
    let mut merged = existing.clone();
    let Some(incoming_map) = incoming.as_object() else {
        return incoming.clone();
    };
    let Some(existing_map) = merged.as_object_mut() else {
        return incoming.clone();
    };
    for (key, value) in incoming_map {
        existing_map.insert(key.clone(), value.clone());
    }
    merged
}

pub(super) fn candidate_to_memory_mutation(candidate: &MemoryCandidate) -> MemoryMutation {
    MemoryMutation {
        scope: Some(candidate.scope.clone()),
        category: Some(candidate.category.clone()),
        fact: Some(candidate.fact.clone()),
        content: Some(candidate.content.clone()),
        layer: candidate.layer.clone(),
        value_class: candidate.value_class.clone(),
        abstract_text: Some(super::super::memory_layer::memory_abstract_text(
            &candidate.fact,
        )),
        confidence: Some(candidate.confidence),
        source_type: Some(candidate.source_type.clone()),
        source_ref: candidate.source_ref.clone(),
        status: Some("active".to_string()),
        tags: Some(vec!["auto_extracted".to_string()]),
        ..MemoryMutation::default()
    }
}

pub(crate) fn memory_candidate_json(candidate: &MemoryCandidate) -> Value {
    json!({
        "id": candidate.id,
        "fact": candidate.fact,
        "content": candidate.content,
        "category": candidate.category,
        "scope": candidate.scope,
        "layer": candidate.layer,
        "valueClass": candidate.value_class,
        "triggerEvent": candidate.trigger_event,
        "evidence": candidate.evidence_json,
        "confidence": candidate.confidence,
        "sourceType": candidate.source_type,
        "sourceRef": candidate.source_ref,
        "proposedAction": candidate.proposed_action,
        "conflictWith": candidate.conflict_with,
        "targetId": candidate.target_id,
        "relationType": candidate.relation_type,
        "status": candidate.status,
        "createdAt": candidate.created_at,
        "reviewedAt": candidate.reviewed_at,
        "expiresAt": candidate.expires_at,
        "stabilityReviewAt": candidate.stability_review_at,
        "stabilityWindowHours": candidate.stability_window_hours,
    })
}

pub(super) fn insert_proactive_event(
    conn: &Connection,
    event: &ProactiveEvent,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "INSERT INTO proactive_events (
            id, trigger_type, title, reason, source_json, mode, status, session_id,
            created_at, dismissed_at, opened_session_id
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            event.id,
            event.trigger_type,
            event.title,
            event.reason,
            serde_json::to_string(&event.source)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
            event.mode,
            event.status,
            event.session_id,
            event.created_at,
            event.dismissed_at,
            event.opened_session_id,
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn load_proactive_event(
    conn: &Connection,
    id: &str,
) -> AgentRuntimeResult<Option<ProactiveEvent>> {
    conn.query_row(
        "SELECT id, trigger_type, title, reason, source_json, mode, status, session_id,
                created_at, dismissed_at, opened_session_id
         FROM proactive_events WHERE id = ?1",
        params![id],
        |row| {
            let source_json: String = row.get(4)?;
            Ok(ProactiveEvent {
                id: row.get(0)?,
                trigger_type: row.get(1)?,
                title: row.get(2)?,
                reason: row.get(3)?,
                source: serde_json::from_str(&source_json).unwrap_or(Value::Null),
                mode: row.get(5)?,
                status: row.get(6)?,
                session_id: row.get(7)?,
                created_at: row.get(8)?,
                dismissed_at: row.get(9)?,
                opened_session_id: row.get(10)?,
            })
        },
    )
    .optional()
    .map_err(sql_error)
}

pub(crate) fn proactive_event_json(event: &ProactiveEvent) -> Value {
    json!({
        "id": event.id,
        "triggerType": event.trigger_type,
        "title": event.title,
        "reason": event.reason,
        "source": event.source,
        "mode": event.mode,
        "status": event.status,
        "sessionId": event.session_id,
        "createdAt": event.created_at,
        "dismissedAt": event.dismissed_at,
        "openedSessionId": event.opened_session_id,
        "role": "proactive",
    })
}

pub(super) fn replace_memory_tags(
    conn: &Connection,
    memory_id: &str,
    tags: &[String],
) -> AgentRuntimeResult<()> {
    conn.execute(
        "DELETE FROM memory_tags WHERE memory_id = ?1",
        params![memory_id],
    )
    .map_err(sql_error)?;
    for tag in tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
    {
        conn.execute(
            "INSERT OR IGNORE INTO memory_tags (memory_id, tag) VALUES (?1, ?2)",
            params![memory_id, tag],
        )
        .map_err(sql_error)?;
    }
    Ok(())
}

pub(super) fn replace_memory_relations(
    conn: &Connection,
    relations: &[MemoryRelation],
) -> AgentRuntimeResult<()> {
    if let Some(source_id) = relations
        .first()
        .map(|relation| relation.source_id.as_str())
    {
        conn.execute(
            "DELETE FROM memory_relations WHERE source_id = ?1",
            params![source_id],
        )
        .map_err(sql_error)?;
    }
    for relation in relations {
        upsert_memory_relation(conn, relation)?;
    }
    Ok(())
}

pub(super) fn upsert_memory_relation(
    conn: &Connection,
    relation: &MemoryRelation,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "INSERT INTO memory_relations (source_id, target_id, relation, confidence, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
           confidence = excluded.confidence",
        params![
            relation.source_id,
            relation.target_id,
            relation.relation,
            relation.confidence,
            relation.created_at,
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn load_memory_tags(
    conn: &Connection,
    memory_id: &str,
) -> AgentRuntimeResult<Vec<String>> {
    let mut statement = conn
        .prepare("SELECT tag FROM memory_tags WHERE memory_id = ?1 ORDER BY tag")
        .map_err(sql_error)?;
    statement
        .query_map(params![memory_id], |row| row.get::<_, String>(0))
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)
}

pub(super) fn load_memory_relations(
    conn: &Connection,
    memory_id: &str,
) -> AgentRuntimeResult<Vec<MemoryRelation>> {
    let mut statement = conn
        .prepare(
            "SELECT source_id, target_id, relation, confidence, created_at
             FROM memory_relations WHERE source_id = ?1
             ORDER BY created_at DESC",
        )
        .map_err(sql_error)?;
    statement
        .query_map(params![memory_id], |row| {
            Ok(MemoryRelation {
                source_id: row.get(0)?,
                target_id: row.get(1)?,
                relation: row.get(2)?,
                confidence: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)
}

pub(super) fn upsert_memory_fts(
    conn: &Connection,
    record: &LongTermMemoryRecord,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "DELETE FROM memory_fts WHERE memory_id = ?1",
        params![record.id],
    )
    .map_err(sql_error)?;
    conn.execute(
        "INSERT INTO memory_fts (memory_id, fact, content, tags, category, scope)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            record.id,
            record.fact,
            serde_json::to_string(&record.content)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
            record.tags.join(" "),
            record.category,
            record.scope,
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn delete_memory_indexes(conn: &Connection, memory_id: &str) -> AgentRuntimeResult<()> {
    conn.execute(
        "DELETE FROM memory_fts WHERE memory_id = ?1",
        params![memory_id],
    )
    .map_err(sql_error)?;
    conn.execute(
        "DELETE FROM memory_embeddings WHERE memory_id = ?1",
        params![memory_id],
    )
    .map_err(sql_error)?;
    delete_recall_by_source(conn, "long_term_memory", memory_id)?;
    Ok(())
}

pub(super) fn sync_memory_record_to_recall(
    conn: &Connection,
    record: &LongTermMemoryRecord,
) -> AgentRuntimeResult<()> {
    if record.status != "active" || is_expired(record) {
        delete_recall_by_source(conn, "long_term_memory", &record.id)?;
        return Ok(());
    }
    let text = format!(
        "{}\n{}",
        record.fact,
        serde_json::to_string(&record.content).unwrap_or_default()
    );
    let item = SystemRecallItem {
        id: format!("recall-memory-{}", record.id),
        source_kind: "long_term_memory".to_string(),
        source_id: record.id.clone(),
        session_id: None,
        turn_id: None,
        role: None,
        text: text.clone(),
        summary: Some(record.fact.clone()),
        content_hash: stable_hash(&text),
        source_path: Some(format!("memory.sqlite#{}", record.id)),
        created_at: record.created_at.clone(),
        updated_at: record.updated_at.clone(),
    };
    upsert_recall_item(conn, &item)
}

pub(super) fn upsert_recall_item(
    conn: &Connection,
    item: &SystemRecallItem,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "INSERT INTO recall_items
          (id, source_kind, source_id, session_id, turn_id, role, text, summary, content_hash, source_path, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
         ON CONFLICT(id) DO UPDATE SET
           source_kind = excluded.source_kind,
           source_id = excluded.source_id,
           session_id = excluded.session_id,
           turn_id = excluded.turn_id,
           role = excluded.role,
           text = excluded.text,
           summary = excluded.summary,
           content_hash = excluded.content_hash,
           source_path = excluded.source_path,
           updated_at = excluded.updated_at",
        params![
            item.id,
            item.source_kind,
            item.source_id,
            item.session_id,
            item.turn_id,
            item.role,
            item.text,
            item.summary,
            item.content_hash,
            item.source_path,
            item.created_at,
            item.updated_at,
        ],
    )
    .map_err(sql_error)?;
    upsert_recall_fts(conn, item)?;
    try_upsert_recall_embedding(conn, item)?;
    Ok(())
}

pub(super) fn delete_recall_by_source(
    conn: &Connection,
    source_kind: &str,
    source_id: &str,
) -> AgentRuntimeResult<()> {
    let mut statement = conn
        .prepare("SELECT id FROM recall_items WHERE source_kind = ?1 AND source_id = ?2")
        .map_err(sql_error)?;
    let ids = statement
        .query_map(params![source_kind, source_id], |row| {
            row.get::<_, String>(0)
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    for id in ids {
        delete_recall_item_indexes(conn, &id)?;
    }
    conn.execute(
        "DELETE FROM recall_items WHERE source_kind = ?1 AND source_id = ?2",
        params![source_kind, source_id],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn delete_recall_item_indexes(
    conn: &Connection,
    recall_id: &str,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "DELETE FROM recall_fts WHERE recall_id = ?1",
        params![recall_id],
    )
    .map_err(sql_error)?;
    conn.execute(
        "DELETE FROM recall_embeddings WHERE recall_id = ?1",
        params![recall_id],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn upsert_recall_fts(
    conn: &Connection,
    item: &SystemRecallItem,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "DELETE FROM recall_fts WHERE recall_id = ?1",
        params![item.id],
    )
    .map_err(sql_error)?;
    let text = recall_index_text(item);
    conn.execute(
        "INSERT INTO recall_fts (recall_id, text, summary, source_kind)
         VALUES (?1, ?2, ?3, ?4)",
        params![item.id, text, item.summary, item.source_kind],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn try_upsert_recall_embedding(
    conn: &Connection,
    item: &SystemRecallItem,
) -> AgentRuntimeResult<Option<()>> {
    let Some(provider) = embedding_provider() else {
        return Ok(None);
    };
    let text = recall_embedding_text(item);
    let content_hash = stable_hash(&text);
    let existing_hash = conn
        .query_row(
            "SELECT content_hash FROM recall_embeddings WHERE recall_id = ?1",
            params![item.id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(sql_error)?;
    if existing_hash.as_deref() == Some(content_hash.as_str()) {
        return Ok(Some(()));
    }
    let vector = provider.embed(&text)?;
    let timestamp = now();
    conn.execute(
        "INSERT INTO recall_embeddings
          (recall_id, provider, model, dimension, vector, content_hash, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
         ON CONFLICT(recall_id) DO UPDATE SET
           provider = excluded.provider,
           model = excluded.model,
           dimension = excluded.dimension,
           vector = excluded.vector,
           content_hash = excluded.content_hash,
           updated_at = excluded.updated_at",
        params![
            item.id,
            provider.provider(),
            provider.model(),
            provider.dimension() as i64,
            vector_to_blob(&vector),
            content_hash,
            timestamp,
        ],
    )
    .map_err(sql_error)?;
    Ok(Some(()))
}

pub(super) fn recall_fts_score_map(
    conn: &Connection,
    query: &str,
    limit: usize,
) -> AgentRuntimeResult<HashMap<String, f64>> {
    let Some(fts_query) = fts_query(query) else {
        return Ok(HashMap::new());
    };
    let mut statement = conn
        .prepare(
            "SELECT recall_id, bm25(recall_fts) AS rank
             FROM recall_fts
             WHERE recall_fts MATCH ?1
             ORDER BY rank
             LIMIT ?2",
        )
        .map_err(sql_error)?;
    let rows = statement
        .query_map(params![fts_query, limit as i64], |row| {
            let id: String = row.get(0)?;
            let rank: f64 = row.get(1)?;
            Ok((id, rank))
        })
        .map_err(sql_error)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(sql_error)?;
    Ok(normalized_bm25_score_map(rows))
}

pub(super) fn load_recall_items(
    conn: &Connection,
    ids: &[String],
) -> AgentRuntimeResult<Vec<SystemRecallItem>> {
    let mut items = Vec::new();
    for id in ids {
        if let Some(item) = conn
            .query_row(
                "SELECT id, source_kind, source_id, session_id, turn_id, role, text, summary, content_hash, source_path, created_at, updated_at
                 FROM recall_items WHERE id = ?1",
                params![id],
                recall_item_from_row,
            )
            .optional()
            .map_err(sql_error)?
        {
            items.push(item);
        }
    }
    Ok(items)
}

pub(super) fn load_recall_embedding_map(
    conn: &Connection,
    ids: &[String],
) -> AgentRuntimeResult<HashMap<String, Vec<f32>>> {
    let mut embeddings = HashMap::new();
    for id in ids {
        if let Some(vector) = conn
            .query_row(
                "SELECT vector FROM recall_embeddings WHERE recall_id = ?1",
                params![id],
                |row| row.get::<_, Vec<u8>>(0),
            )
            .optional()
            .map_err(sql_error)?
        {
            embeddings.insert(id.clone(), blob_to_vector(&vector));
        }
    }
    Ok(embeddings)
}

fn recall_item_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<SystemRecallItem> {
    Ok(SystemRecallItem {
        id: row.get(0)?,
        source_kind: row.get(1)?,
        source_id: row.get(2)?,
        session_id: row.get(3)?,
        turn_id: row.get(4)?,
        role: row.get(5)?,
        text: row.get(6)?,
        summary: row.get(7)?,
        content_hash: row.get(8)?,
        source_path: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

pub(super) fn insert_trigger_mark(
    conn: &Connection,
    session_id: &str,
    turn_id: &str,
    event_type: &str,
    payload: &Value,
) -> AgentRuntimeResult<()> {
    let timestamp = now();
    conn.execute(
        "INSERT INTO trigger_marks (
            id, session_id, turn_id, event_type, payload_json, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            format!("trigger-{}", Uuid::new_v4()),
            session_id,
            turn_id,
            event_type,
            serde_json::to_string(payload)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
            timestamp,
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}

pub(super) fn enqueue_memory_job_record(
    conn: &Connection,
    session_id: &str,
    turn_id: &str,
    job_type: &str,
    payload: &Value,
) -> AgentRuntimeResult<String> {
    let id = format!("memory-job-{}", Uuid::new_v4());
    let timestamp = now();
    conn.execute(
        "INSERT INTO memory_jobs (
            id, session_id, turn_id, job_type, payload_json, status, created_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)",
        params![
            id,
            session_id,
            turn_id,
            job_type,
            serde_json::to_string(payload)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
            timestamp,
        ],
    )
    .map_err(sql_error)?;
    Ok(id)
}

pub(super) fn claim_next_memory_job(
    conn: &Connection,
) -> AgentRuntimeResult<Option<MemoryJobRecord>> {
    let order = super::super::memory_job_budget::job_type_order_clause();
    let row = conn
        .query_row(
            &format!(
                "SELECT id, session_id, turn_id, job_type, payload_json
             FROM memory_jobs
             WHERE status = 'pending'
             ORDER BY {order}
             LIMIT 1"
            ),
            [],
            |row| {
                let payload_json: String = row.get(4)?;
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    payload_json,
                ))
            },
        )
        .optional()
        .map_err(sql_error)?;
    let Some((id, session_id, turn_id, job_type, payload_json)) = row else {
        return Ok(None);
    };
    let started_at = now();
    conn.execute(
        "UPDATE memory_jobs SET status = 'running', started_at = ?2 WHERE id = ?1 AND status = 'pending'",
        params![id, started_at],
    )
    .map_err(sql_error)?;
    if conn.changes() == 0 {
        return Ok(None);
    }
    Ok(Some(MemoryJobRecord {
        id,
        session_id,
        turn_id,
        job_type,
        payload: serde_json::from_str(&payload_json).unwrap_or(Value::Null),
    }))
}

pub(super) fn finish_memory_job_record(
    conn: &Connection,
    id: &str,
    status: &str,
    result: Value,
) -> AgentRuntimeResult<()> {
    conn.execute(
        "UPDATE memory_jobs
         SET status = ?2, completed_at = ?3, result_json = ?4
         WHERE id = ?1",
        params![
            id,
            status,
            now(),
            serde_json::to_string(&result)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?,
        ],
    )
    .map_err(sql_error)?;
    Ok(())
}
