use super::state_auth_migration::{fail_legacy_auth_tools, is_legacy_auth_clarification};
use super::*;
use fs2::FileExt;
use std::io::Write;
use std::sync::mpsc::{self, Sender};

static STATE: OnceLock<Mutex<NativeRuntimeState>> = OnceLock::new();
pub(crate) const TOOL_RUNTIME_SCHEMA_VERSION: u32 = 4;
static RUNTIME_HOOKS: OnceLock<RuntimeHooks> = OnceLock::new();

struct RuntimeHooks {
    event_callback: Mutex<Option<Arc<EventCallback>>>,
    host_dispatcher: Mutex<Option<Arc<HostCapabilityDispatcher>>>,
}

impl Default for RuntimeHooks {
    fn default() -> Self {
        Self {
            event_callback: Mutex::new(None),
            host_dispatcher: Mutex::new(None),
        }
    }
}

pub(crate) fn state() -> &'static Mutex<NativeRuntimeState> {
    let mutex = STATE.get_or_init(|| Mutex::new(NativeRuntimeState::load()));
    super::subagent::spawn_startup_background_recovery_if_needed();
    mutex
}

/// Snapshot of the runtime mutex if hydrate already started. Listing must not
/// call `state()` — that `get_or_init` loads every transcript before returning.
pub(crate) fn try_state() -> Option<&'static Mutex<NativeRuntimeState>> {
    STATE.get()
}

fn runtime_hooks() -> &'static RuntimeHooks {
    RUNTIME_HOOKS.get_or_init(RuntimeHooks::default)
}

pub(crate) fn event_callback() -> Option<Arc<EventCallback>> {
    runtime_hooks()
        .event_callback
        .lock()
        .ok()
        .and_then(|callback| callback.clone())
}

pub(crate) fn set_event_callback(callback: Option<Arc<EventCallback>>) {
    if let Ok(mut current) = runtime_hooks().event_callback.lock() {
        *current = callback;
    }
}

pub(crate) fn host_dispatcher() -> Option<Arc<HostCapabilityDispatcher>> {
    runtime_hooks()
        .host_dispatcher
        .lock()
        .ok()
        .and_then(|dispatcher| dispatcher.clone())
}

pub(crate) fn set_host_dispatcher(dispatcher: Option<Arc<HostCapabilityDispatcher>>) {
    if let Ok(mut current) = runtime_hooks().host_dispatcher.lock() {
        *current = dispatcher;
    }
}

// ---------------------------------------------------------------------------
// 后台持久化 worker — 解耦状态变更与磁盘 I/O
//
// `save_state()` 仅在锁内标记 dirty + 发送 channel 消息（瞬时返回）。
// `persist_worker` 后台线程接收消息，防抖 200ms 后在锁外执行 I/O。
// `flush_state()` 提供同步 flush 能力（关键保存点 + 测试用）。
// ---------------------------------------------------------------------------

/// 持久化命令：`Save` 触发防抖写入，`Flush(ack)` 立即写入并回复。
enum PersistCmd {
    Save,
    Flush(mpsc::Sender<AgentRuntimeResult<()>>),
}

static PERSIST_TX: OnceLock<Sender<PersistCmd>> = OnceLock::new();

/// 懒初始化 persist channel sender，首次调用时 spawn 后台 worker 线程。
fn persist_tx() -> &'static Sender<PersistCmd> {
    PERSIST_TX.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<PersistCmd>();
        thread::Builder::new()
            .name("lyra-persist-worker".to_string())
            .spawn(move || persist_worker(rx))
            .expect("spawn persist worker");
        tx
    })
}

/// 后台持久化线程：防抖 200ms 批处理 Save，Flush 立即执行。
fn persist_worker(rx: mpsc::Receiver<PersistCmd>) {
    let debounce = Duration::from_millis(200);
    loop {
        match rx.recv() {
            Ok(PersistCmd::Save) => {
                // 防抖：在 200ms 窗口内持续 drain 后续 Save
                loop {
                    match rx.recv_timeout(debounce) {
                        Ok(PersistCmd::Save) => { /* 扩展窗口 */ }
                        Ok(PersistCmd::Flush(ack)) => {
                            let _ = ack.send(flush_now());
                            break;
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {
                            let _ = flush_now();
                            break;
                        }
                        Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    }
                }
            }
            Ok(PersistCmd::Flush(ack)) => {
                let _ = ack.send(flush_now());
            }
            Err(_) => return,
        }
    }
}

/// 三阶段 flush：Phase 1 锁内 snapshot + clear dirty → Phase 2 锁外 I/O → Phase 3 失败时 re-set dirty
fn flush_now() -> AgentRuntimeResult<()> {
    // Phase 1: 锁内 snapshot dirty 数据 + 清零 dirty 标记
    let (root, state_file, dirty_sessions) = {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        if !state.dirty {
            return Ok(());
        }
        state.dirty = false;
        let state_file = state.build_state_file();
        let dirty_sessions: Vec<NativeSession> = state
            .sessions
            .values()
            .filter(|session| !session.ephemeral)
            .filter(|session| session.dirty || !session_db_path(&state.root, &session.id).exists())
            .cloned()
            .collect();
        for session in &dirty_sessions {
            if let Some(s) = state.sessions.get_mut(&session.id) {
                s.dirty = false;
                s.dialog_dirty_from = None;
                s.persisted_dialog_len = s
                    .snapshot
                    .get("messages")
                    .and_then(Value::as_array)
                    .map(Vec::len)
                    .unwrap_or(0);
            }
        }
        (state.root.clone(), state_file, dirty_sessions)
    };

    // Phase 2: 锁外 I/O
    let io_result = flush_io(&root, &state_file, &dirty_sessions);

    // Phase 3: I/O 失败时，锁内 re-set dirty
    if io_result.is_err() {
        let mut state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        state.dirty = true;
        for session in &dirty_sessions {
            if let Some(s) = state.sessions.get_mut(&session.id) {
                s.dirty = true;
                s.dialog_dirty_from = match (s.dialog_dirty_from, session.dialog_dirty_from) {
                    (Some(current), Some(failed)) => Some(current.min(failed)),
                    (current, failed) => current.or(failed),
                };
                s.persisted_dialog_len = session.persisted_dialog_len;
            }
        }
    }
    io_result
}

/// 锁外执行全部磁盘 I/O：写 state.json + 逐 session 写 SQLite
fn flush_io(
    root: &Path,
    state_file: &NativeStateFile,
    dirty_sessions: &[NativeSession],
) -> AgentRuntimeResult<()> {
    let _lock = lock_path_exclusive(&root.join(".state.lock"))?;
    fs::create_dir_all(root.join("sessions"))
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    write_json(&root.join("state.json"), state_file)?;
    for session in dirty_sessions {
        save_session(root, session)?;
    }
    Ok(())
}

/// 同步 flush：发送 Flush 命令并等待 persist worker 回复。
/// 必须在 **不持有** 全局锁时调用，否则会死锁。
pub(crate) fn flush_state() -> AgentRuntimeResult<()> {
    // In test mode, save_state() already does synchronous I/O, so there's
    // nothing to flush — the persist worker isn't running.
    #[cfg(test)]
    {
        return Ok(());
    }
    #[cfg(not(test))]
    {
        let (tx, rx) = mpsc::channel();
        persist_tx()
            .send(PersistCmd::Flush(tx))
            .map_err(|_| AgentRuntimeError::Core("persist worker died".to_string()))?;
        rx.recv()
            .map_err(|_| AgentRuntimeError::Core("persist worker died".to_string()))?
    }
}

impl NativeRuntimeState {
    pub(crate) fn load() -> Self {
        let (loaded, recovery) = Self::load_from_root_with_recovery(runtime_root());
        super::subagent::stage_startup_background_recovery(recovery);
        loaded
    }

    pub(crate) fn load_from_root(root: PathBuf) -> Self {
        Self::load_from_root_with_recovery(root).0
    }

    fn load_from_root_with_recovery(
        root: PathBuf,
    ) -> (Self, super::subagent::StartupBackgroundRecovery) {
        let sessions_dir = root.join("sessions");
        let _ = fs::create_dir_all(&sessions_dir);
        let _ = prune_low_value_tool_artifacts(&root);

        let state_file = read_json::<NativeStateFile>(&root.join("state.json"));
        let _ = ensure_memory_store(&root);
        let legacy_plaintext_provider_keys = state_file
            .as_ref()
            .map(|state| {
                state
                    .config
                    .providers
                    .iter()
                    .filter(|(_, profile)| {
                        profile.api_key_ref.is_none()
                            && profile
                                .api_key
                                .as_ref()
                                .is_some_and(|value| !value.trim().is_empty())
                    })
                    .map(|(id, _)| id.clone())
                    .collect::<HashSet<_>>()
            })
            .unwrap_or_default();

        let mut config = state_file
            .as_ref()
            .map(|state| state.config.clone())
            .unwrap_or_default();
        let free_provider_catalog_migration = config.providers.contains_key("mimo-free")
            || config
                .providers
                .get(providers::routes::opencode::ANONYMOUS_PROVIDER_ID)
                .is_some_and(|provider| {
                    provider.label != providers::routes::opencode::ANONYMOUS_PROVIDER_LABEL
                        || provider.base_url.as_deref()
                            != Some(providers::routes::opencode::ZEN_BASE_URL)
                        || provider.route_id != providers::routes::opencode::ZEN_ROUTE_ID
                        || provider.models.iter().any(|model| {
                            providers::routes::opencode::is_retired_anonymous_model(&model.id)
                        })
                        || providers::routes::opencode::ANONYMOUS_MODELS
                            .iter()
                            .any(|spec| provider.models.iter().all(|model| model.id != spec.id))
                });
        install_default_providers(&mut config);

        let previous_tool_runtime_schema_version = state_file
            .as_ref()
            .map(|state| state.tool_runtime_schema_version)
            .unwrap_or_default();
        let schema_upgrade = previous_tool_runtime_schema_version < TOOL_RUNTIME_SCHEMA_VERSION;
        let mut tool_runtime_migration_diagnostics = state_file
            .as_ref()
            .map(|state| state.tool_runtime_migration_diagnostics.clone())
            .unwrap_or_default();
        let snapshot_failed = if schema_upgrade {
            let diagnostics = snapshot_schema_migration(
                &root,
                &sessions_dir,
                previous_tool_runtime_schema_version,
            );
            let failed = !diagnostics.is_empty();
            tool_runtime_migration_diagnostics.extend(diagnostics);
            failed
        } else {
            false
        };
        let tool_runtime_schema_version = if schema_upgrade && snapshot_failed {
            previous_tool_runtime_schema_version
        } else {
            TOOL_RUNTIME_SCHEMA_VERSION
        };

        let legacy_auth_tools = state_file
            .as_ref()
            .map(|state| {
                state
                    .pending_clarifications
                    .values()
                    .filter(|request| is_legacy_auth_clarification(request))
                    .map(|request| (request.session_id.clone(), request.tool_call_id.clone()))
                    .collect::<HashSet<_>>()
            })
            .unwrap_or_default();
        let mut sessions = HashMap::new();
        let mut startup_cancelled_background_children = Vec::new();
        for session_id in list_session_ids(&root).unwrap_or_default() {
            if let Some(mut session) = load_session_for_startup_with_diagnostics(
                &root,
                &session_id,
                &mut tool_runtime_migration_diagnostics,
            ) {
                let resumed_trim =
                    resume_pending_trim_journal(&mut session, &root).is_ok() && session.dirty;
                let migrated_legacy_auth = fail_legacy_auth_tools(&mut session, &legacy_auth_tools);
                let was_background_child =
                    super::subagent::is_background_subagent_session(&session.snapshot);
                let reconciled_turn =
                    reconcile_orphan_running_turn(&mut session, false, "runtime_startup");
                if was_background_child && reconciled_turn {
                    startup_cancelled_background_children.push(session.id.clone());
                }
                let reconciled_tools = reconcile_orphan_running_tools(&mut session);
                if resumed_trim || migrated_legacy_auth || reconciled_turn || reconciled_tools {
                    let _ = save_session(&root, &session);
                    session.dirty = false;
                }
                sessions.insert(session.id.clone(), session);
            }
        }
        let recovery = super::subagent::reap_dead_background_workers(
            &mut sessions,
            &startup_cancelled_background_children,
        );
        for session in sessions.values_mut() {
            if session.dirty {
                let _ = save_session(&root, session);
                session.dirty = false;
            }
        }

        let pending_permissions = if schema_upgrade {
            HashMap::new()
        } else {
            state_file
                .as_ref()
                .map(|state| state.pending_permissions.clone())
                .unwrap_or_default()
        };
        let mut pending_clarifications = if schema_upgrade {
            HashMap::new()
        } else {
            state_file
                .as_ref()
                .map(|state| state.pending_clarifications.clone())
                .unwrap_or_default()
        };
        pending_clarifications.retain(|_, request| !is_legacy_auth_clarification(request));
        let mut tool_usage_cache = state_file
            .as_ref()
            .map(|state| state.tool_usage_cache.clone())
            .unwrap_or_default();
        prune_tool_usage_cache(&mut tool_usage_cache, Utc::now());
        let active_session_id = state_file
            .as_ref()
            .and_then(|state| state.active_session_id.clone())
            .filter(|session_id| sessions.contains_key(session_id));
        let mut model_capabilities = state_file
            .as_ref()
            .map(|state| state.model_capabilities.clone())
            .unwrap_or_default();
        let capability_migration = state_file.as_ref().is_some_and(|state_file| {
            let legacy =
                migrate_legacy_model_capabilities(&state_file.config, &mut model_capabilities);
            let rejections = migrate_runtime_rejections(&mut model_capabilities);
            let optimistic = migrate_optimistic_tool_defaults(&mut config, &mut model_capabilities);
            legacy || rejections || optimistic
        });

        let mut loaded = Self {
            root,
            tool_runtime_schema_version,
            tool_runtime_migration_diagnostics,
            tool_usage_cache,
            sessions,
            active_session_id,
            config,
            pending_permissions,
            pending_clarifications,
            suppressed_tool_usage_by_turn: HashMap::new(),
            inspected_tool_descriptors_by_session: HashMap::new(),
            legacy_plaintext_provider_keys,
            active_compressions: HashSet::new(),
            first_used_at: state_file
                .as_ref()
                .and_then(|s| s.first_used_at.clone())
                .or_else(|| Some(chrono::Utc::now().to_rfc3339())),
            model_capabilities,
            media_model_defaults: state_file
                .as_ref()
                .map(|state| state.media_model_defaults.clone())
                .unwrap_or_default(),
            dirty: false,
        };
        let pruned_pending = loaded.prune_non_live_pending();
        let first_used_just_init = state_file
            .as_ref()
            .and_then(|s| s.first_used_at.as_ref())
            .is_none();
        if pruned_pending
            || schema_upgrade
            || first_used_just_init
            || free_provider_catalog_migration
            || capability_migration
        {
            let _ = loaded.save_state_sync();
        }
        (loaded, recovery)
    }

    /// 构建可序列化的 `NativeStateFile` 快照，同时执行 tool-usage cache 裁剪。
    /// 在锁内调用（Phase 1），返回值在锁外用于 I/O。
    pub(crate) fn build_state_file(&mut self) -> NativeStateFile {
        prune_tool_usage_cache(&mut self.tool_usage_cache, Utc::now());
        let pending_permissions = self
            .pending_permissions
            .iter()
            .filter(|(_, request)| is_live_pending_permission(&self.sessions, request))
            .map(|(id, request)| (id.clone(), request.clone()))
            .collect();
        let pending_clarifications = self
            .pending_clarifications
            .iter()
            .filter(|(_, request)| is_live_pending_clarification(&self.sessions, request))
            .map(|(id, request)| (id.clone(), request.clone()))
            .collect();
        NativeStateFile {
            tool_runtime_schema_version: self.tool_runtime_schema_version,
            tool_runtime_migration_diagnostics: self.tool_runtime_migration_diagnostics.clone(),
            tool_usage_cache: self.tool_usage_cache.clone(),
            active_session_id: self.active_session_id.clone(),
            config: self.config.clone(),
            pending_permissions,
            pending_clarifications,
            first_used_at: self.first_used_at.clone(),
            model_capabilities: self.model_capabilities.clone(),
            media_model_defaults: self.media_model_defaults.clone(),
        }
    }

    /// 非阻塞 save：标记 dirty + 发送 channel 消息，瞬时返回。
    /// I/O 由后台 persist worker 防抖 200ms 后执行。
    /// `cfg(test)` 模式下退化为同步写入，保持现有测试行为。
    pub(crate) fn save_state(&mut self) -> AgentRuntimeResult<()> {
        self.dirty = true;
        #[cfg(not(test))]
        {
            let _ = persist_tx().send(PersistCmd::Save);
            Ok(())
        }
        #[cfg(test)]
        {
            self.save_state_sync()
        }
    }

    /// 同步 save：在锁内完成全部 I/O（初始化 + 测试用）。
    pub(crate) fn save_state_sync(&mut self) -> AgentRuntimeResult<()> {
        let _lock = lock_path_exclusive(&self.root.join(".state.lock"))?;
        fs::create_dir_all(self.root.join("sessions"))
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let state = self.build_state_file();
        write_json(&self.root.join("state.json"), &state)?;
        let session_ids = self
            .sessions
            .values()
            .filter(|session| !session.ephemeral)
            .filter(|session| session.dirty || !session_db_path(&self.root, &session.id).exists())
            .map(|session| session.id.clone())
            .collect::<Vec<_>>();
        for session_id in session_ids {
            if let Some(session) = self.sessions.get_mut(&session_id) {
                save_session(&self.root, session)?;
                session.dirty = false;
                session.dialog_dirty_from = None;
                session.persisted_dialog_len = session
                    .snapshot
                    .get("messages")
                    .and_then(Value::as_array)
                    .map(Vec::len)
                    .unwrap_or(0);
            }
        }
        self.dirty = false;
        Ok(())
    }

    pub(crate) fn prune_non_live_pending(&mut self) -> bool {
        let before_permissions = self.pending_permissions.len();
        let before_clarifications = self.pending_clarifications.len();
        self.pending_permissions
            .retain(|_, request| is_live_pending_permission(&self.sessions, request));
        self.pending_clarifications
            .retain(|_, request| is_live_pending_clarification(&self.sessions, request));
        before_permissions != self.pending_permissions.len()
            || before_clarifications != self.pending_clarifications.len()
    }

    pub(crate) fn ensure_dialog(&mut self, session_id: &str) -> AgentRuntimeResult<()> {
        let needs_dialog = self
            .sessions
            .get(session_id)
            .is_some_and(|session| !session.dialog_loaded);
        if !needs_dialog {
            return Ok(());
        }
        let root = self.root.clone();
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| AgentRuntimeError::Core(format!("session not found: {session_id}")))?;
        fill_dialog(&root, session)
    }

    pub(crate) fn resolve_session_id(
        &mut self,
        requested: Option<String>,
    ) -> AgentRuntimeResult<String> {
        if let Some(id) = requested.filter(|value| !value.trim().is_empty()) {
            if id == "active" {
                return self.ensure_active_session();
            }
            if self.sessions.contains_key(&id) {
                self.active_session_id = Some(id.clone());
                return Ok(id);
            }
            return Err(
                session_database_load_error(&self.tool_runtime_migration_diagnostics, &id)
                    .unwrap_or_else(|| AgentRuntimeError::Core(format!("session not found: {id}"))),
            );
        }
        self.ensure_active_session()
    }

    pub(crate) fn ensure_active_session(&mut self) -> AgentRuntimeResult<String> {
        if let Some(id) = self.active_session_id.clone()
            && self.sessions.contains_key(&id)
        {
            return Ok(id);
        }
        let session = new_session(None, None, "normal");
        let id = session.id.clone();
        self.sessions.insert(id.clone(), session);
        self.active_session_id = Some(id.clone());
        self.save_state()?;
        Ok(id)
    }
}

#[derive(Clone)]
struct LegacyProviderApiKeyMigration {
    id: String,
    label: String,
    api_key: String,
}

fn legacy_provider_api_key_migrations(
    state: &NativeRuntimeState,
) -> Vec<LegacyProviderApiKeyMigration> {
    state
        .legacy_plaintext_provider_keys
        .iter()
        .filter_map(|id| {
            let profile = state.config.providers.get(id)?;
            if profile.api_key_ref.is_some() {
                return None;
            }
            let api_key = profile
                .api_key
                .as_ref()
                .filter(|value| !value.trim().is_empty())?
                .clone();
            Some(LegacyProviderApiKeyMigration {
                id: id.clone(),
                label: profile.label.clone(),
                api_key,
            })
        })
        .collect()
}

fn store_legacy_provider_api_key_refs(
    dispatcher: &Arc<HostCapabilityDispatcher>,
    migrations: &[LegacyProviderApiKeyMigration],
) -> AgentRuntimeResult<Vec<(String, Value)>> {
    migrations
        .iter()
        .map(|migration| {
            let payload = serde_json::to_string(&json!({
                "owner": "ai-provider",
                "valueKind": "api_key",
                "label": format!("API key for {}", migration.label),
                "description": format!("Migrated API key for Lyra provider {}", migration.label),
                "value": migration.api_key,
                "capabilities": ["list_metadata", "use"],
            }))
            .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?;
            let output = dispatcher("sensitiveValues.storeForAgentUse".to_string(), payload)
                .map_err(AgentRuntimeError::HostCapability)?;
            let stored: Value = serde_json::from_str(&output)
                .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?;
            let api_key_ref = stored
                .get("ref")
                .filter(|value| value.is_object())
                .cloned()
                .ok_or_else(|| {
                    AgentRuntimeError::Core(format!(
                        "secure storage did not return an API key reference for provider {}",
                        migration.label
                    ))
                })?;
            Ok((migration.id.clone(), api_key_ref))
        })
        .collect()
}

fn apply_legacy_provider_api_key_refs(
    state: &mut NativeRuntimeState,
    refs: Vec<(String, Value)>,
) -> bool {
    let mut changed = false;
    for (id, api_key_ref) in refs {
        if let Some(profile) = state.config.providers.get_mut(&id) {
            profile.api_key_ref = Some(api_key_ref);
            profile.api_key = None;
            changed = true;
        }
        state.legacy_plaintext_provider_keys.remove(&id);
    }
    changed
}

pub(crate) fn migrate_legacy_provider_api_keys_to_secure_storage(
    dispatcher: Arc<HostCapabilityDispatcher>,
) -> AgentRuntimeResult<()> {
    let migrations = {
        let state = state()
            .lock()
            .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
        legacy_provider_api_key_migrations(&state)
    };
    if migrations.is_empty() {
        return Ok(());
    }
    let refs = store_legacy_provider_api_key_refs(&dispatcher, &migrations)?;
    let mut state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    if apply_legacy_provider_api_key_refs(&mut state, refs) {
        state.save_state()?;
    }
    Ok(())
}

fn snapshot_schema_migration(
    root: &Path,
    sessions_dir: &Path,
    from_schema_version: u32,
) -> Vec<Value> {
    let mut diagnostics = Vec::new();
    if !sessions_dir.exists() && !root.join("state.json").exists() {
        return diagnostics;
    }
    let backup_dir = root.join("migration-backups").join(format!(
        "tool-runtime-v{from_schema_version}-to-v{}-{}",
        TOOL_RUNTIME_SCHEMA_VERSION,
        Utc::now().format("%Y%m%d%H%M%S%3f")
    ));
    if let Err(error) = fs::create_dir_all(&backup_dir) {
        diagnostics.push(schema_snapshot_diagnostic(
            &backup_dir,
            from_schema_version,
            error,
        ));
        return diagnostics;
    }
    let state_path = root.join("state.json");
    if state_path.exists()
        && let Err(error) = fs::copy(&state_path, backup_dir.join("state.json"))
    {
        diagnostics.push(schema_snapshot_diagnostic(
            &state_path,
            from_schema_version,
            error,
        ));
    }
    if sessions_dir.exists()
        && let Err(error) = copy_dir_all(sessions_dir, &backup_dir.join("sessions"))
    {
        diagnostics.push(schema_snapshot_diagnostic(
            sessions_dir,
            from_schema_version,
            error,
        ));
    }
    let manifest = json!({
        "fromSchemaVersion": from_schema_version,
        "toSchemaVersion": TOOL_RUNTIME_SCHEMA_VERSION,
        "createdAt": now(),
    });
    if let Err(error) = write_json(&backup_dir.join("manifest.json"), &manifest) {
        diagnostics.push(json!({
            "code": "tool_runtime_schema_snapshot_failed",
            "message": "Failed to write an Agent session schema migration snapshot manifest.",
            "path": backup_dir.join("manifest.json").display().to_string(),
            "fromSchemaVersion": from_schema_version,
            "toSchemaVersion": TOOL_RUNTIME_SCHEMA_VERSION,
            "error": error.to_string(),
        }));
    }
    diagnostics
}

fn schema_snapshot_diagnostic(
    path: &Path,
    from_schema_version: u32,
    error: std::io::Error,
) -> Value {
    json!({
        "code": "tool_runtime_schema_snapshot_failed",
        "message": "Failed to snapshot Agent sessions before runtime schema migration.",
        "path": path.display().to_string(),
        "fromSchemaVersion": from_schema_version,
        "toSchemaVersion": TOOL_RUNTIME_SCHEMA_VERSION,
        "error": error.to_string(),
    })
}

fn copy_dir_all(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let destination_path = destination.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_all(&source_path, &destination_path)?;
        } else {
            fs::copy(&source_path, &destination_path)?;
        }
    }
    Ok(())
}

fn prune_tool_usage_cache(
    cache: &mut HashMap<String, ToolUsageCacheEntry>,
    now: DateTime<Utc>,
) -> bool {
    let before_len = cache.len();
    cache.retain(|_, entry| {
        let Some(last_used_at) = entry_last_used_at(entry) else {
            return false;
        };
        let Ok(last_used_at) = DateTime::parse_from_rfc3339(last_used_at) else {
            return false;
        };
        let age_days = now
            .signed_duration_since(last_used_at.with_timezone(&Utc))
            .num_days()
            .max(0);
        age_days <= tool_usage_retention_days(entry)
    });
    if cache.len() > 500 {
        let mut ranked = cache
            .values()
            .map(|entry| {
                (
                    entry.tool_path.clone(),
                    entry_last_used_at(entry).unwrap_or_default().to_string(),
                    tool_usage_success_rate(entry),
                    entry.total_runs,
                )
            })
            .collect::<Vec<_>>();
        ranked.sort_by(|left, right| {
            right
                .1
                .cmp(&left.1)
                .then_with(|| {
                    right
                        .2
                        .partial_cmp(&left.2)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| right.3.cmp(&left.3))
        });
        let keep = ranked
            .into_iter()
            .take(500)
            .map(|entry| entry.0)
            .collect::<HashSet<_>>();
        cache.retain(|path, _| keep.contains(path));
    }
    cache.len() != before_len
}

fn entry_last_used_at(entry: &ToolUsageCacheEntry) -> Option<&str> {
    entry
        .last_used_at
        .as_deref()
        .or(entry.last_success_at.as_deref())
        .or(entry.last_failure_at.as_deref())
}

fn tool_usage_retention_days(entry: &ToolUsageCacheEntry) -> i64 {
    if entry.successes == 0 {
        7
    } else if entry.total_runs >= 3 && tool_usage_success_rate(entry) >= 0.8 {
        90
    } else {
        30
    }
}

fn tool_usage_success_rate(entry: &ToolUsageCacheEntry) -> f64 {
    if entry.total_runs == 0 {
        0.0
    } else {
        entry.successes as f64 / entry.total_runs as f64
    }
}

fn is_live_pending_permission(
    sessions: &HashMap<String, NativeSession>,
    request: &PermissionRequest,
) -> bool {
    request.allowed.is_none()
        && request.status == "pending"
        && session_has_active_turn(sessions, &request.session_id, &request.turn_id)
}

fn is_live_pending_clarification(
    sessions: &HashMap<String, NativeSession>,
    request: &ClarificationRequest,
) -> bool {
    request.answer.is_none()
        && request.status == "pending"
        && session_has_active_turn(sessions, &request.session_id, &request.turn_id)
}

fn session_has_active_turn(
    sessions: &HashMap<String, NativeSession>,
    session_id: &str,
    turn_id: &str,
) -> bool {
    sessions.get(session_id).is_some_and(|session| {
        session.snapshot.get("turnStatus").and_then(Value::as_str) == Some("running")
            && session.snapshot.get("activeTurnId").and_then(Value::as_str) == Some(turn_id)
    })
}

pub(crate) fn default_true() -> bool {
    true
}

pub(crate) fn default_false() -> bool {
    false
}

pub(crate) fn runtime_root() -> PathBuf {
    if let Some(path) = env::var_os("LYRA_AGENT_RUNTIME_HOME") {
        return PathBuf::from(path);
    }
    if cfg!(test) {
        return env::temp_dir()
            .join("lyra-agent-runtime-tests")
            .join(std::process::id().to_string());
    }
    if let Some(path) = env::var_os("LYRA_AGENT_HOME") {
        return PathBuf::from(path).join("agent-runtime");
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".lyra")
        .join("modules")
        .join("agent-runtime")
}

pub(crate) fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
    let data = match fs::read_to_string(path) {
        Ok(data) => data,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => {
            eprintln!(
                "[lyra-agent-runtime] failed to read JSON {}: {error}",
                path.display()
            );
            return None;
        }
    };
    match serde_json::from_str(&data) {
        Ok(value) => Some(value),
        Err(error) => {
            quarantine_corrupt_json(path, &error.to_string());
            None
        }
    }
}

pub(crate) fn write_json<T: Serialize>(path: &Path, value: &T) -> AgentRuntimeResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    let _lock = lock_path_exclusive(&json_lock_path(path))?;
    let data = serde_json::to_vec_pretty(value)
        .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?;
    write_bytes_atomic(path, &data).map_err(|error| AgentRuntimeError::Core(error.to_string()))
}

fn json_lock_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".lock");
    PathBuf::from(value)
}

fn lock_path_exclusive(path: &Path) -> AgentRuntimeResult<fs::File> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    let file = fs::OpenOptions::new()
        .create(true)
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    file.lock_exclusive()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    Ok(file)
}

fn temp_json_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("state.json");
    path.with_file_name(format!(
        ".{file_name}.tmp-{}-{}",
        std::process::id(),
        Uuid::new_v4()
    ))
}

fn corrupt_json_path(path: &Path) -> PathBuf {
    let mut value = path.as_os_str().to_os_string();
    value.push(".corrupt");
    PathBuf::from(value)
}

#[cfg(unix)]
fn sync_parent_directory(path: &Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::File::open(parent)?.sync_all()?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn sync_parent_directory(_path: &Path) -> std::io::Result<()> {
    Ok(())
}

fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let temp_path = temp_json_path(path);
    let result = (|| -> std::io::Result<()> {
        let mut file = fs::OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);

        #[cfg(windows)]
        {
            if path.exists() {
                fs::remove_file(path)?;
            }
        }

        fs::rename(&temp_path, path)?;
        sync_parent_directory(path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn quarantine_corrupt_json(path: &Path, reason: &str) {
    if !path.exists() {
        return;
    }
    let corrupt_path = corrupt_json_path(path);
    let _ = fs::remove_file(&corrupt_path);
    match fs::rename(path, &corrupt_path) {
        Ok(()) => {
            eprintln!(
                "[lyra-agent-runtime] quarantined corrupt JSON {} -> {}: {reason}",
                path.display(),
                corrupt_path.display()
            );
        }
        Err(rename_error) => match fs::copy(path, &corrupt_path) {
            Ok(_) => {
                let _ = fs::remove_file(path);
                eprintln!(
                    "[lyra-agent-runtime] copied corrupt JSON {} -> {} after rename failed ({rename_error}): {reason}",
                    path.display(),
                    corrupt_path.display()
                );
            }
            Err(copy_error) => {
                eprintln!(
                    "[lyra-agent-runtime] failed to quarantine corrupt JSON {}: rename failed ({rename_error}); copy failed ({copy_error}); {reason}",
                    path.display()
                );
            }
        },
    }
}

pub(crate) fn install_default_providers(config: &mut NativeConfig) {
    // MiMo's anonymous `mimo-auto` API was retired. This profile was created
    // solely for that public endpoint, so remove it on startup for both new
    // and existing installations. The authenticated MiMo profiles above stay
    // available through the normal provider setup flow.
    let removed_mimo_free = config.providers.remove("mimo-free").is_some();
    if removed_mimo_free && config.default_provider.as_deref() == Some("mimo-free") {
        config.default_provider =
            Some(providers::routes::opencode::ANONYMOUS_PROVIDER_ID.to_string());
        config.default_model =
            Some(providers::routes::opencode::ANONYMOUS_DEFAULT_MODEL.to_string());
    }
    if config.memory_agent_provider.as_deref() == Some("mimo-free") {
        config.memory_agent_provider = None;
        config.memory_agent_model = None;
    }
    if config.default_provider.is_none() {
        config.default_provider = Some("openai".to_string());
    }
    if config.default_model.is_none() {
        config.default_model = env::var("OPENAI_MODEL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .or_else(|| Some("gpt-5-mini".to_string()));
    }
    let openai_key = env::var("OPENAI_API_KEY").ok();
    config
        .providers
        .entry("openai".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "openai".to_string(),
            label: "OpenAI".to_string(),
            route_id: providers::routes::openai::ROUTE_ID.to_string(),
            base_url: env::var("OPENAI_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::openai::DEFAULT_BASE_URL.to_string())),
            default_model: config.default_model.clone(),
            api_key_ref: None,
            api_key: openai_key,
            api_key_env: Some("OPENAI_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("openrouter".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "openrouter".to_string(),
            label: "OpenRouter".to_string(),
            route_id: providers::routes::openrouter::ROUTE_ID.to_string(),
            base_url: env::var("OPENROUTER_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::openrouter::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("OPENROUTER_MODEL").ok(),
            api_key_ref: None,
            api_key: env::var("OPENROUTER_API_KEY").ok(),
            api_key_env: Some("OPENROUTER_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("ollama_cloud".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "ollama_cloud".to_string(),
            label: "Ollama Cloud".to_string(),
            route_id: providers::routes::ollama::CLOUD_ROUTE_ID.to_string(),
            base_url: env::var("OLLAMA_CLOUD_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::ollama::CLOUD_DEFAULT_BASE_URL.to_string())),
            default_model: env::var("OLLAMA_CLOUD_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| Some("gpt-oss:120b".to_string())),
            api_key_ref: None,
            api_key: env::var("OLLAMA_API_KEY").ok(),
            api_key_env: Some("OLLAMA_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("deepseek".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "deepseek".to_string(),
            label: "DeepSeek".to_string(),
            route_id: providers::routes::deepseek::OPENAI_ROUTE_ID.to_string(),
            base_url: env::var("DEEPSEEK_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::deepseek::OPENAI_BASE_URL.to_string())),
            default_model: env::var("DEEPSEEK_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("DEEPSEEK_API_KEY").ok(),
            api_key_env: Some("DEEPSEEK_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("glm".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "glm".to_string(),
            label: "GLM".to_string(),
            route_id: providers::routes::glm::ROUTE_ID.to_string(),
            base_url: env::var("GLM_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::glm::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("GLM_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("GLM_API_KEY")
                .ok()
                .or_else(|| env::var("ZHIPU_API_KEY").ok())
                .or_else(|| env::var("ZAI_API_KEY").ok()),
            api_key_env: Some("GLM_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("moonshot".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "moonshot".to_string(),
            label: "Kimi".to_string(),
            route_id: providers::routes::moonshot::ROUTE_ID.to_string(),
            base_url: env::var("MOONSHOT_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::moonshot::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("MOONSHOT_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("MOONSHOT_API_KEY").ok(),
            api_key_env: Some("MOONSHOT_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("nvidia".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "nvidia".to_string(),
            label: "NVIDIA NIM".to_string(),
            route_id: providers::routes::nvidia::ROUTE_ID.to_string(),
            base_url: env::var("NVIDIA_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::nvidia::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("NVIDIA_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("NVIDIA_API_KEY").ok(),
            api_key_env: Some("NVIDIA_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("amd".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "amd".to_string(),
            label: "AMD Radeon Cloud".to_string(),
            route_id: providers::routes::amd::ROUTE_ID.to_string(),
            base_url: env::var("AMD_BASE_URL")
                .ok()
                .or_else(|| env::var("RADEON_BASE_URL").ok())
                .or_else(|| Some(providers::routes::amd::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("AMD_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| {
                    env::var("RADEON_MODEL")
                        .ok()
                        .filter(|value| !value.trim().is_empty())
                }),
            api_key_ref: None,
            api_key: env::var("AMD_API_KEY")
                .ok()
                .or_else(|| env::var("RADEON_API_KEY").ok()),
            api_key_env: Some("AMD_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("bai".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "bai".to_string(),
            label: "B.AI".to_string(),
            route_id: providers::routes::bai::ROUTE_ID.to_string(),
            base_url: env::var("BAI_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::bai::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("BAI_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("BAI_API_KEY").ok(),
            api_key_env: Some("BAI_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("atria".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "atria".to_string(),
            label: "Atria ASI".to_string(),
            route_id: providers::routes::atria::ROUTE_ID.to_string(),
            base_url: env::var("ATRIA_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::atria::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("ATRIA_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("ATRIA_API_KEY").ok(),
            api_key_env: Some("ATRIA_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("intern-token-plan".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "intern-token-plan".to_string(),
            label: "Intern TokenPlan".to_string(),
            route_id: providers::routes::intern::ROUTE_ID.to_string(),
            base_url: env::var("INTERN_TOKENPLAN_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::intern::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("INTERN_TOKENPLAN_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("TOKENPLAN_API_KEY").ok(),
            api_key_env: Some("TOKENPLAN_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("intern-token-plan-anthropic".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "intern-token-plan-anthropic".to_string(),
            label: "Intern TokenPlan (Anthropic)".to_string(),
            route_id: providers::routes::intern::ANTHROPIC_ROUTE_ID.to_string(),
            base_url: env::var("INTERN_TOKENPLAN_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::intern::ANTHROPIC_BASE_URL.to_string())),
            default_model: env::var("INTERN_TOKENPLAN_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            api_key_ref: None,
            api_key: env::var("TOKENPLAN_API_KEY").ok(),
            api_key_env: Some("TOKENPLAN_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("poolside".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "poolside".to_string(),
            label: "Poolside".to_string(),
            route_id: providers::routes::poolside::ROUTE_ID.to_string(),
            base_url: env::var("POOLSIDE_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::poolside::DEFAULT_BASE_URL.to_string())),
            default_model: env::var("POOLSIDE_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .or_else(|| Some(providers::routes::poolside::DEFAULT_MODEL.to_string())),
            api_key_ref: None,
            api_key: env::var("POOLSIDE_API_KEY").ok(),
            api_key_env: Some("POOLSIDE_API_KEY".to_string()),
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("anthropic".to_string())
        .or_insert_with(|| {
            let default_model = env::var("ANTHROPIC_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "claude-sonnet-4-6".to_string());
            NativeProviderProfile {
                id: "anthropic".to_string(),
                label: "Anthropic".to_string(),
                route_id: providers::routes::anthropic::ROUTE_ID.to_string(),
                base_url: env::var("ANTHROPIC_BASE_URL")
                    .ok()
                    .or_else(|| Some(providers::routes::anthropic::DEFAULT_BASE_URL.to_string())),
                default_model: Some(default_model.clone()),
                api_key_ref: None,
                api_key: env::var("ANTHROPIC_API_KEY").ok(),
                api_key_env: Some("ANTHROPIC_API_KEY".to_string()),
                auth_header: None,
                embedding_model: Some("lyra-hash-embedding-v1".to_string()),
                models: Vec::new(),
            }
        });
    config
        .providers
        .entry("google_gemini".to_string())
        .or_insert_with(|| {
            let default_model = env::var("GEMINI_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "gemini-2.5-flash".to_string());
            NativeProviderProfile {
                id: "google_gemini".to_string(),
                label: "Google Gemini".to_string(),
                route_id: providers::routes::google_gemini::ROUTE_ID.to_string(),
                base_url: env::var("GEMINI_BASE_URL").ok().or_else(|| {
                    Some(providers::routes::google_gemini::DEFAULT_BASE_URL.to_string())
                }),
                default_model: Some(default_model.clone()),
                api_key_ref: None,
                api_key: env::var("GEMINI_API_KEY").ok(),
                api_key_env: Some("GEMINI_API_KEY".to_string()),
                auth_header: None,
                embedding_model: Some("lyra-hash-embedding-v1".to_string()),
                models: Vec::new(),
            }
        });
    config
        .providers
        .entry("aws_bedrock".to_string())
        .or_insert_with(|| {
            let default_region = env::var("AWS_REGION")
                .ok()
                .or_else(|| env::var("AWS_DEFAULT_REGION").ok())
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| {
                    providers::protocol::aws_bedrock_converse::DEFAULT_REGION.to_string()
                });
            let default_model = env::var("AWS_BEDROCK_MODEL")
                .ok()
                .filter(|value| !value.trim().is_empty())
                .unwrap_or_else(|| "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string());
            NativeProviderProfile {
                id: "aws_bedrock".to_string(),
                label: "AWS Bedrock".to_string(),
                route_id: providers::routes::aws_bedrock::ROUTE_ID.to_string(),
                base_url: env::var("AWS_BEDROCK_BASE_URL").ok().or_else(|| {
                    Some(format!(
                        "https://bedrock-runtime.{}.amazonaws.com",
                        default_region
                    ))
                }),
                default_model: Some(default_model.clone()),
                api_key_ref: None,
                api_key: env::var("AWS_ACCESS_KEY_ID").ok(),
                api_key_env: Some("AWS_ACCESS_KEY_ID".to_string()),
                auth_header: None,
                embedding_model: Some("lyra-hash-embedding-v1".to_string()),
                models: Vec::new(),
            }
        });
    config
        .providers
        .entry("mimo".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "mimo".to_string(),
            label: "MiMo".to_string(),
            route_id: providers::routes::mimo::PAY_AS_YOU_GO_ROUTE_ID.to_string(),
            base_url: env::var("MIMO_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::mimo::PAY_AS_YOU_GO_BASE_URL.to_string())),
            default_model: env::var("MIMO_MODEL")
                .ok()
                .or_else(|| Some("mimo-v2.5-pro".to_string())),
            api_key_ref: None,
            api_key: env::var("MIMO_API_KEY").ok(),
            api_key_env: Some("MIMO_API_KEY".to_string()),
            auth_header: Some("api-key".to_string()),
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("mimo-token-plan-cn".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "mimo-token-plan-cn".to_string(),
            label: "MiMo Token Plan (CN)".to_string(),
            route_id: providers::routes::mimo::TOKEN_PLAN_CN_ROUTE_ID.to_string(),
            base_url: env::var("MIMO_TOKEN_PLAN_CN_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::mimo::TOKEN_PLAN_CN_BASE_URL.to_string())),
            default_model: env::var("MIMO_TOKEN_PLAN_MODEL")
                .ok()
                .or_else(|| Some("mimo-v2.5-pro".to_string())),
            api_key_ref: None,
            api_key: env::var("MIMO_TOKEN_PLAN_API_KEY").ok(),
            api_key_env: Some("MIMO_TOKEN_PLAN_API_KEY".to_string()),
            auth_header: Some("api-key".to_string()),
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("mimo-token-plan-sgp".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "mimo-token-plan-sgp".to_string(),
            label: "MiMo Token Plan (SGP)".to_string(),
            route_id: providers::routes::mimo::TOKEN_PLAN_SGP_ROUTE_ID.to_string(),
            base_url: env::var("MIMO_TOKEN_PLAN_SGP_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::mimo::TOKEN_PLAN_SGP_BASE_URL.to_string())),
            default_model: env::var("MIMO_TOKEN_PLAN_MODEL")
                .ok()
                .or_else(|| Some("mimo-v2.5-pro".to_string())),
            api_key_ref: None,
            api_key: env::var("MIMO_TOKEN_PLAN_API_KEY").ok(),
            api_key_env: Some("MIMO_TOKEN_PLAN_API_KEY".to_string()),
            auth_header: Some("api-key".to_string()),
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    config
        .providers
        .entry("mimo-token-plan-ams".to_string())
        .or_insert_with(|| NativeProviderProfile {
            id: "mimo-token-plan-ams".to_string(),
            label: "MiMo Token Plan (AMS)".to_string(),
            route_id: providers::routes::mimo::TOKEN_PLAN_AMS_ROUTE_ID.to_string(),
            base_url: env::var("MIMO_TOKEN_PLAN_AMS_BASE_URL")
                .ok()
                .or_else(|| Some(providers::routes::mimo::TOKEN_PLAN_AMS_BASE_URL.to_string())),
            default_model: env::var("MIMO_TOKEN_PLAN_MODEL")
                .ok()
                .or_else(|| Some("mimo-v2.5-pro".to_string())),
            api_key_ref: None,
            api_key: env::var("MIMO_TOKEN_PLAN_API_KEY").ok(),
            api_key_env: Some("MIMO_TOKEN_PLAN_API_KEY".to_string()),
            auth_header: Some("api-key".to_string()),
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: Vec::new(),
        });
    // ponytail: 免费模型 provider，api_key="public" 通过 provider_profile_available 检查
    // api_key 标了 skip_serializing，从 state.json 读回时为 None，需在 and_modify 中补回
    const OPENCODE_PROVIDER_ID: &str = providers::routes::opencode::ANONYMOUS_PROVIDER_ID;
    const OPENCODE_LABEL: &str = providers::routes::opencode::ANONYMOUS_PROVIDER_LABEL;
    const OPENCODE_BASE_URL: &str = providers::routes::opencode::ZEN_BASE_URL;

    // Preview.9 could mistake the built-in OpenCode profile for a newly added
    // custom OpenAI-compatible profile because both use the same route. Preserve
    // the user's endpoint as a separate profile before restoring the built-in.
    let corrupted_opencode = config
        .providers
        .get(OPENCODE_PROVIDER_ID)
        .filter(|provider| {
            provider.label != OPENCODE_LABEL
                || provider.base_url.as_deref() != Some(OPENCODE_BASE_URL)
        })
        .cloned();
    if let Some(mut recovered_profile) = corrupted_opencode {
        let mut recovered_id = providers::routes::custom_openai_compatible::ROUTE_ID.to_string();
        if config.providers.contains_key(&recovered_id) {
            let mut suffix = 2usize;
            loop {
                let candidate = format!("custom-openai-compatible-{suffix}");
                if !config.providers.contains_key(&candidate) {
                    recovered_id = candidate;
                    break;
                }
                suffix += 1;
            }
        }
        recovered_profile.id = recovered_id.clone();
        if config.default_provider.as_deref() == Some(OPENCODE_PROVIDER_ID) {
            config.default_provider = Some(recovered_id.clone());
        }
        config.providers.insert(recovered_id, recovered_profile);
        config.providers.remove(OPENCODE_PROVIDER_ID);
    }

    let opencode_provider = config
        .providers
        .entry(OPENCODE_PROVIDER_ID.to_string())
        .and_modify(|p| {
            p.id = OPENCODE_PROVIDER_ID.to_string();
            p.label = OPENCODE_LABEL.to_string();
            p.route_id = providers::routes::opencode::ZEN_ROUTE_ID.to_string();
            p.base_url = Some(OPENCODE_BASE_URL.to_string());
            p.api_key = Some("public".to_string());
            p.api_key_ref = None;
            p.api_key_env = None;
            p.auth_header = None;
            p.embedding_model = Some("lyra-hash-embedding-v1".to_string());
            providers::routes::opencode::reconcile_anonymous_models(&mut p.models);
            if p.default_model
                .as_deref()
                .is_none_or(|id| providers::routes::opencode::is_retired_anonymous_model(id))
            {
                p.default_model =
                    Some(providers::routes::opencode::ANONYMOUS_DEFAULT_MODEL.to_string());
            }
        })
        .or_insert_with(|| NativeProviderProfile {
            id: OPENCODE_PROVIDER_ID.to_string(),
            label: OPENCODE_LABEL.to_string(),
            route_id: providers::routes::opencode::ZEN_ROUTE_ID.to_string(),
            base_url: Some(OPENCODE_BASE_URL.to_string()),
            default_model: Some(providers::routes::opencode::ANONYMOUS_DEFAULT_MODEL.to_string()),
            api_key: Some("public".to_string()),
            api_key_ref: None,
            api_key_env: None,
            auth_header: None,
            embedding_model: Some("lyra-hash-embedding-v1".to_string()),
            models: providers::routes::opencode::seed_anonymous_models(),
        });
    providers::routes::opencode::reconcile_anonymous_models(&mut opencode_provider.models);
    if config.default_provider.as_deref() == Some(OPENCODE_PROVIDER_ID)
        && config
            .default_model
            .as_deref()
            .is_some_and(providers::routes::opencode::is_retired_anonymous_model)
    {
        config.default_model =
            Some(providers::routes::opencode::ANONYMOUS_DEFAULT_MODEL.to_string());
    }
    for provider in config.providers.values_mut() {
        if provider.embedding_model.is_none() {
            provider.embedding_model = Some("lyra-hash-embedding-v1".to_string());
        }
    }
}

fn migrate_legacy_model_capabilities(
    config: &NativeConfig,
    records: &mut HashMap<String, HashMap<String, NativeModelCapabilityRecord>>,
) -> bool {
    let mut changed = false;
    let observed_at = Utc::now().to_rfc3339();
    for provider in config.providers.values() {
        for model in &provider.models {
            let provider_records = records.entry(provider.id.clone()).or_default();
            if provider_records.contains_key(&model.id) {
                continue;
            }
            let mut record = NativeModelCapabilityRecord::default();
            let mut supported = Vec::new();
            if model.supports_image_input {
                supported.push(providers::model_capabilities::INPUT_IMAGE);
            }
            if model.supports_tool_calling {
                supported.push(providers::model_capabilities::FEATURE_TOOL_CALLING);
            }
            if model.supports_streaming {
                supported.push(providers::model_capabilities::FEATURE_STREAMING);
            }
            for key in supported {
                record
                    .detected
                    .insert(key.to_string(), CapabilitySupport::Supported);
                record.evidence.insert(
                    key.to_string(),
                    NativeCapabilityEvidence {
                        source: "legacy_state_migration".to_string(),
                        conflict: false,
                        source_url: None,
                        observed_at: Some(observed_at.clone()),
                        detail: Some(
                            "Migrated from an earlier explicit true model flag; legacy false values remain Unknown."
                                .to_string(),
                        ),
                    },
                );
            }
            provider_records.insert(model.id.clone(), record);
            changed = true;
        }
    }
    changed
}

// Older state files stored runtime 400s inside `detected`. Move them into the
// dedicated `runtime_rejections` layer, otherwise a later refresh replaces
// `detected` and the rejection silently disappears (recurring 400 loop).
fn migrate_runtime_rejections(
    records: &mut HashMap<String, HashMap<String, NativeModelCapabilityRecord>>,
) -> bool {
    let mut changed = false;
    for per_provider in records.values_mut() {
        for record in per_provider.values_mut() {
            let rejected: Vec<String> = record
                .evidence
                .iter()
                .filter(|(_, evidence)| evidence.source == "runtime_rejection")
                .map(|(key, _)| key.clone())
                .collect();
            let mut migrated = false;
            for key in rejected {
                let Some(evidence) = record.evidence.remove(&key) else {
                    continue;
                };
                record.detected.remove(&key);
                record.runtime_rejections.insert(key, evidence);
                migrated = true;
            }
            if migrated {
                record.recompute_runtime_conflict();
                changed = true;
            }
        }
    }
    changed
}

// Earlier discovery flows defaulted persisted models to supportsToolCalling
// false even when the route's protocol can encode tools, which locked custom
// providers out of tool calling entirely. Upgrade those stale flags to the
// protocol capability at load time, unless the user forced an override or the
// provider already rejected tool calls at runtime.
fn migrate_optimistic_tool_defaults(
    config: &mut NativeConfig,
    records: &mut HashMap<String, HashMap<String, NativeModelCapabilityRecord>>,
) -> bool {
    let mut changed = false;
    let observed_at = Utc::now().to_rfc3339();
    for provider in config.providers.values_mut() {
        let Ok(route) = providers::registry::require_route(&provider.route_id) else {
            continue;
        };
        if !providers::model_capabilities::protocol_can_execute(
            &route.protocol_id,
            &provider.route_id,
            providers::model_capabilities::FEATURE_TOOL_CALLING,
        ) {
            continue;
        }
        for model in &mut provider.models {
            if model.supports_tool_calling {
                continue;
            }
            let provider_records = records.entry(provider.id.clone()).or_default();
            let record = provider_records.entry(model.id.clone()).or_default();
            if record
                .overrides
                .contains_key(providers::model_capabilities::FEATURE_TOOL_CALLING)
                || record
                    .runtime_rejections
                    .contains_key(providers::model_capabilities::FEATURE_TOOL_CALLING)
            {
                continue;
            }
            record.detected.insert(
                providers::model_capabilities::FEATURE_TOOL_CALLING.to_string(),
                CapabilitySupport::Supported,
            );
            record.evidence.insert(
                providers::model_capabilities::FEATURE_TOOL_CALLING.to_string(),
                NativeCapabilityEvidence {
                    source: "optimistic_protocol_default".to_string(),
                    conflict: false,
                    source_url: None,
                    observed_at: Some(observed_at.clone()),
                    detail: Some(
                        "Upgraded from a stale conservative default; the route protocol can encode tool calls."
                            .to_string(),
                    ),
                },
            );
            model.supports_tool_calling = true;
            changed = true;
        }
    }
    changed
}

#[cfg(test)]
mod persistence_tests {
    use super::*;

    #[test]
    fn write_json_persists_readable_json() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("state.json");
        let value = json!({ "activeSessionId": "session-1" });

        write_json(&path, &value).expect("write json");

        let reloaded = read_json::<Value>(&path).expect("read json");
        assert_eq!(reloaded["activeSessionId"], "session-1");
        let leftover_temp = fs::read_dir(temp.path())
            .expect("read tempdir")
            .filter_map(Result::ok)
            .any(|entry| entry.file_name().to_string_lossy().contains(".tmp-"));
        assert!(!leftover_temp);
    }

    #[test]
    fn read_json_quarantines_corrupt_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("state.json");
        fs::write(&path, "{ not json").expect("write corrupt json");

        let reloaded = read_json::<Value>(&path);

        assert!(reloaded.is_none());
        assert!(!path.exists());
        assert_eq!(
            fs::read_to_string(temp.path().join("state.json.corrupt")).expect("corrupt backup"),
            "{ not json"
        );
    }

    #[test]
    fn migrate_optimistic_tool_defaults_upgrades_stale_flags_but_respects_rejections_and_overrides()
    {
        let mut config = NativeConfig::default();
        let make_model = |tool: bool| NativeProviderModel {
            id: "glm-5.3-flash".to_string(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: tool,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        };
        config.providers.insert(
            "plain".to_string(),
            NativeProviderProfile {
                id: "plain".to_string(),
                label: "Plain".to_string(),
                route_id: providers::routes::ollama::CLOUD_OPENAI_ROUTE_ID.to_string(),
                base_url: None,
                default_model: None,
                api_key: None,
                api_key_ref: None,
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: vec![make_model(false)],
            },
        );
        config.providers.insert(
            "rejected".to_string(),
            NativeProviderProfile {
                id: "rejected".to_string(),
                label: "Rejected".to_string(),
                route_id: providers::routes::ollama::CLOUD_OPENAI_ROUTE_ID.to_string(),
                base_url: None,
                default_model: None,
                api_key: None,
                api_key_ref: None,
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: vec![make_model(false)],
            },
        );
        config.providers.insert(
            "overridden".to_string(),
            NativeProviderProfile {
                id: "overridden".to_string(),
                label: "Overridden".to_string(),
                route_id: providers::routes::ollama::CLOUD_OPENAI_ROUTE_ID.to_string(),
                base_url: None,
                default_model: None,
                api_key: None,
                api_key_ref: None,
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: vec![make_model(false)],
            },
        );
        let mut records: HashMap<String, HashMap<String, NativeModelCapabilityRecord>> =
            HashMap::new();
        let mut rejected_record = NativeModelCapabilityRecord::default();
        rejected_record.runtime_rejections.insert(
            providers::model_capabilities::FEATURE_TOOL_CALLING.to_string(),
            NativeCapabilityEvidence {
                source: "runtime_rejection".to_string(),
                conflict: false,
                source_url: None,
                observed_at: None,
                detail: None,
            },
        );
        records.insert(
            "rejected".to_string(),
            HashMap::from([("glm-5.3-flash".to_string(), rejected_record)]),
        );
        let mut override_record = NativeModelCapabilityRecord::default();
        override_record.overrides.insert(
            providers::model_capabilities::FEATURE_TOOL_CALLING.to_string(),
            CapabilityOverride::Unsupported,
        );
        records.insert(
            "overridden".to_string(),
            HashMap::from([("glm-5.3-flash".to_string(), override_record)]),
        );

        assert!(migrate_optimistic_tool_defaults(&mut config, &mut records));

        assert!(config.providers["plain"].models[0].supports_tool_calling);
        assert!(!config.providers["rejected"].models[0].supports_tool_calling);
        assert!(!config.providers["overridden"].models[0].supports_tool_calling);
        assert_eq!(
            records["plain"]["glm-5.3-flash"].evidence
                [providers::model_capabilities::FEATURE_TOOL_CALLING]
                .source,
            "optimistic_protocol_default"
        );
        assert!(!migrate_optimistic_tool_defaults(&mut config, &mut records));
    }

    #[test]
    fn migrate_runtime_rejections_moves_legacy_detected_entries() {
        let key = providers::model_capabilities::INPUT_IMAGE;
        let mut records = HashMap::new();
        let mut provider_records = HashMap::new();
        let mut record = NativeModelCapabilityRecord::default();
        record
            .detected
            .insert(key.to_string(), CapabilitySupport::Unsupported);
        record.evidence.insert(
            key.to_string(),
            NativeCapabilityEvidence {
                source: "runtime_rejection".to_string(),
                conflict: false,
                source_url: None,
                observed_at: None,
                detail: Some("legacy 400".to_string()),
            },
        );
        provider_records.insert("model-a".to_string(), record);
        records.insert("provider-a".to_string(), provider_records);

        assert!(migrate_runtime_rejections(&mut records));

        let record = &records["provider-a"]["model-a"];
        assert!(!record.detected.contains_key(key));
        assert!(record.runtime_rejections.contains_key(key));
        assert!(record.runtime_conflict.is_none());

        // A forced-Supported override conflicts with the migrated rejection.
        let mut records = HashMap::new();
        let mut provider_records = HashMap::new();
        let mut record = NativeModelCapabilityRecord::default();
        record
            .detected
            .insert(key.to_string(), CapabilitySupport::Unsupported);
        record.evidence.insert(
            key.to_string(),
            NativeCapabilityEvidence {
                source: "runtime_rejection".to_string(),
                conflict: false,
                source_url: None,
                observed_at: None,
                detail: None,
            },
        );
        record
            .overrides
            .insert(key.to_string(), CapabilityOverride::Supported);
        record.runtime_conflict = Some("stale conflict".to_string());
        provider_records.insert("model-a".to_string(), record);
        records.insert("provider-a".to_string(), provider_records);

        assert!(migrate_runtime_rejections(&mut records));
        let record = &records["provider-a"]["model-a"];
        assert!(record.runtime_rejections.contains_key(key));
        assert!(record.runtime_conflict.is_some());

        // Catalog-detected evidence is left alone, and a second run is a no-op.
        let mut records = HashMap::new();
        let mut provider_records = HashMap::new();
        let mut record = NativeModelCapabilityRecord::default();
        record
            .detected
            .insert(key.to_string(), CapabilitySupport::Supported);
        record.evidence.insert(
            key.to_string(),
            NativeCapabilityEvidence {
                source: "provider_api".to_string(),
                conflict: false,
                source_url: None,
                observed_at: None,
                detail: None,
            },
        );
        provider_records.insert("model-a".to_string(), record);
        records.insert("provider-a".to_string(), provider_records);

        assert!(!migrate_runtime_rejections(&mut records));
        let record = &records["provider-a"]["model-a"];
        assert!(record.detected.contains_key(key));
        assert!(record.runtime_rejections.is_empty());
    }

    #[test]
    fn state_json_does_not_serialize_provider_api_key_plaintext() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("state.json");
        let mut config = NativeConfig::default();
        config.providers.insert(
            "openai".to_string(),
            NativeProviderProfile {
                id: "openai".to_string(),
                label: "OpenAI".to_string(),
                route_id: providers::routes::openai::ROUTE_ID.to_string(),
                base_url: Some(providers::routes::openai::DEFAULT_BASE_URL.to_string()),
                default_model: Some("gpt-test".to_string()),
                api_key: Some("sk-plaintext-secret".to_string()),
                api_key_ref: Some(json!({
                    "kind": "lyra-sensitive-value-ref",
                    "id": "ai-provider:opaque:secret-id"
                })),
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: Vec::new(),
            },
        );
        let state = NativeStateFile {
            tool_runtime_schema_version: TOOL_RUNTIME_SCHEMA_VERSION,
            tool_runtime_migration_diagnostics: Vec::new(),
            tool_usage_cache: HashMap::new(),
            active_session_id: None,
            config,
            pending_permissions: HashMap::new(),
            pending_clarifications: HashMap::new(),
            first_used_at: None,
            model_capabilities: HashMap::new(),
            media_model_defaults: HashMap::new(),
        };

        write_json(&path, &state).expect("write state");

        let raw = fs::read_to_string(path).expect("read state");
        assert!(!raw.contains("sk-plaintext-secret"));
        assert!(raw.contains("apiKeyRef"));
        assert!(raw.contains("ai-provider:opaque:secret-id"));
    }

    #[test]
    fn legacy_provider_api_key_is_migrated_to_secure_storage_ref() {
        let temp = tempfile::tempdir().expect("tempdir");
        let mut config = NativeConfig::default();
        config.providers.insert(
            "openai".to_string(),
            NativeProviderProfile {
                id: "openai".to_string(),
                label: "OpenAI".to_string(),
                route_id: providers::routes::openai::ROUTE_ID.to_string(),
                base_url: Some(providers::routes::openai::DEFAULT_BASE_URL.to_string()),
                default_model: Some("gpt-test".to_string()),
                api_key: Some("sk-legacy-secret".to_string()),
                api_key_ref: None,
                api_key_env: None,
                auth_header: None,
                embedding_model: None,
                models: Vec::new(),
            },
        );
        let mut state = NativeRuntimeState {
            root: temp.path().to_path_buf(),
            tool_runtime_schema_version: TOOL_RUNTIME_SCHEMA_VERSION,
            tool_runtime_migration_diagnostics: Vec::new(),
            tool_usage_cache: HashMap::new(),
            sessions: HashMap::new(),
            active_session_id: None,
            config,
            pending_permissions: HashMap::new(),
            pending_clarifications: HashMap::new(),
            model_capabilities: HashMap::new(),
            media_model_defaults: HashMap::new(),
            suppressed_tool_usage_by_turn: HashMap::new(),
            inspected_tool_descriptors_by_session: HashMap::new(),
            legacy_plaintext_provider_keys: HashSet::from(["openai".to_string()]),
            active_compressions: HashSet::new(),
            first_used_at: None,
            dirty: false,
        };
        let dispatcher: Arc<HostCapabilityDispatcher> = Arc::new(|method, payload| {
            assert_eq!(method, "sensitiveValues.storeForAgentUse");
            let request: Value = serde_json::from_str(&payload).expect("store payload");
            assert_eq!(request["value"], "sk-legacy-secret");
            Ok(json!({
                "ref": {
                    "kind": "lyra-sensitive-value-ref",
                    "id": "ai-provider:opaque:stored-openai",
                    "owner": "ai-provider",
                    "valueKind": "api_key",
                    "ownership": "user_owned",
                    "label": "API key for OpenAI",
                    "displayHint": "API key for OpenAI",
                    "ownerRef": {
                        "kind": "opaque",
                        "owner": "ai-provider",
                        "valueId": "stored-openai"
                    },
                    "capabilities": ["list_metadata", "use"],
                    "modelVisibility": "metadata_only",
                    "plaintextVisibility": "user_reveal_only"
                }
            })
            .to_string())
        });

        let migrations = legacy_provider_api_key_migrations(&state);
        let refs = store_legacy_provider_api_key_refs(&dispatcher, &migrations).expect("store ref");
        assert!(apply_legacy_provider_api_key_refs(&mut state, refs));
        state.save_state().expect("save migrated state");

        let raw = fs::read_to_string(temp.path().join("state.json")).expect("read state");
        assert!(!raw.contains("sk-legacy-secret"));
        assert!(raw.contains("apiKeyRef"));
        assert!(raw.contains("stored-openai"));
        assert!(
            state
                .config
                .providers
                .get("openai")
                .expect("provider")
                .api_key
                .is_none()
        );
    }
}
