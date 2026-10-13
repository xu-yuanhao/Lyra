use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use uuid::Uuid;

use crate::aria2::{Aria2RunError, Aria2Runtime};
use crate::aria2_resource_lease::Aria2ResourceLeaseGuard;
use crate::model::*;
use crate::persistence::{
    DEFAULT_MAX_RETRIES, DEFAULT_RETRY_DELAY_MS, SETTINGS_FILE_NAME, StoredDownloadTasksFile,
    TASKS_FILE_NAME, read_settings, read_tasks, restore_task, write_json_atomic,
};
use crate::transport::{self, is_bt_url, is_native_http_url, parse_protocol, select_backend};
use crate::{emit_event, now_iso};

const DEFAULT_NATIVE_HTTP_CONNECTIONS: u32 = 4;

pub(crate) struct DownloadManager {
    storage_root: PathBuf,
    tasks_file: PathBuf,
    settings_file: PathBuf,
    state: Mutex<ManagerState>,
    persistence: Mutex<()>,
}

struct ManagerState {
    tasks: HashMap<String, DownloadTask>,
    settings: DownloadSettings,
    active: HashSet<String>,
}
impl DownloadManager {
    pub(crate) fn new(storage_root: PathBuf) -> Result<Self, String> {
        fs::create_dir_all(&storage_root).map_err(|error| error.to_string())?;
        let tasks_file = storage_root.join(TASKS_FILE_NAME);
        let settings_file = storage_root.join(SETTINGS_FILE_NAME);
        let settings = read_settings(&settings_file)?;
        let tasks = read_tasks(&tasks_file)?
            .into_iter()
            .map(|task| restore_task(task).map(|task| (task.id.clone(), task)))
            .collect::<Result<HashMap<_, _>, _>>()?;
        let manager = Self {
            storage_root,
            tasks_file,
            settings_file,
            persistence: Mutex::new(()),
            state: Mutex::new(ManagerState {
                tasks,
                settings,
                active: HashSet::new(),
            }),
        };
        manager.persist_tasks()?;
        Ok(manager)
    }

    pub(crate) fn snapshot(&self) -> DownloadSnapshot {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        DownloadSnapshot {
            tasks: sort_tasks(state.tasks.values().cloned().collect()),
        }
    }

    pub(crate) fn settings(&self) -> DownloadSettings {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .settings
            .clone()
    }

    pub(crate) fn update_settings(
        self: &Arc<Self>,
        update: DownloadSettingsUpdate,
    ) -> Result<DownloadSettings, String> {
        let _persistence = self
            .persistence
            .lock()
            .map_err(|_| "download persistence lock poisoned".to_string())?;
        let settings = {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "download state".to_string())?;
            if let Some(value) = update.speed_limit_bytes_per_second {
                state.settings.speed_limit_bytes_per_second = value;
            }
            if let Some(value) = update.proxy {
                state.settings.proxy = value;
            }
            if let Some(value) = update.bt {
                state.settings.bt = value;
            }
            if let Some(value) = update.default_headers {
                state.settings.default_headers = value;
            }
            if let Some(value) = update.default_cookie_header {
                state.settings.default_cookie_header = value;
            }
            if let Some(value) = update.max_concurrent_downloads {
                state.settings.max_concurrent_downloads = value.max(1);
            }
            if let Some(value) = update.default_directory {
                state.settings.default_directory = value;
            }
            state.settings.updated_at = now_iso();
            state.settings.clone()
        };
        write_json_atomic(&self.storage_root, &self.settings_file, &settings)?;
        Ok(settings)
    }

    pub(crate) fn enqueue(self: &Arc<Self>, request: DownloadEnqueueRequest) -> Result<(), String> {
        let urls = parse_download_urls(&request);
        if urls.is_empty() {
            return Err("At least one URL is required.".to_string());
        }
        for url in urls {
            let task = self.create_task(&url, &request)?;
            self.set_task(task.clone())?;
            self.queue_task(task.id);
        }
        Ok(())
    }

    pub(crate) fn create_task(
        &self,
        url: &str,
        request: &DownloadEnqueueRequest,
    ) -> Result<DownloadTask, String> {
        let now = now_iso();
        let file_name = sanitize_file_name(&file_name_from_url(url));
        let settings = self.settings();
        let directory = request
            .partial_file_path
            .as_deref()
            .and_then(|value| Path::new(value).parent())
            .map(|path| path.to_string_lossy().to_string())
            .or_else(|| settings.default_directory.clone())
            .unwrap_or_else(default_download_directory);
        let output_kind = if is_bt_url(url) {
            DownloadTaskOutputKind::Directory
        } else {
            DownloadTaskOutputKind::File
        };
        let save_path = if output_kind == DownloadTaskOutputKind::Directory {
            unique_path(&directory, &file_name, &self.reserved_paths(None))
        } else if let Some(partial) = request.partial_file_path.as_deref() {
            partial.to_string()
        } else {
            unique_path(&directory, &file_name, &self.reserved_paths(None))
        };
        let backend = select_backend(url);
        let mut headers = settings.default_headers.clone();
        if let Some(extra) = request.headers.as_ref() {
            headers.extend(extra.clone());
        }
        if let Some(cookie) = request
            .cookie_header
            .as_ref()
            .filter(|value| !value.trim().is_empty())
            .or(settings.default_cookie_header.as_ref())
        {
            if !headers.keys().any(|key| key.eq_ignore_ascii_case("cookie")) {
                headers.insert("Cookie".to_string(), cookie.clone());
            }
        }
        Ok(DownloadTask {
            id: format!("download-{}", Uuid::new_v4()),
            url: url.to_string(),
            original_url: Some(url.to_string()),
            file_name: Path::new(&save_path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or(file_name),
            mime_type: None,
            request_headers: if headers.is_empty() {
                None
            } else {
                Some(headers)
            },
            save_path: save_path.clone(),
            directory: Path::new(&save_path)
                .parent()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or(directory),
            protocol: parse_protocol(url),
            source: request.source.clone().unwrap_or(DownloadTaskSource::Manual),
            backend: Some(backend.clone()),
            output_kind: Some(output_kind),
            source_tab_id: request.source_tab_id.clone(),
            source_title: request.source_title.clone(),
            state: DownloadTaskState::Queued,
            received_bytes: 0,
            total_bytes: 0,
            speed_bytes_per_second: 0,
            estimated_remaining_ms: None,
            priority: DownloadPriority::Normal,
            connections_requested: if backend == DownloadTaskBackend::NativeHttp {
                DEFAULT_NATIVE_HTTP_CONNECTIONS
            } else {
                1
            },
            connections_active: 0,
            can_resume: false,
            created_at: now.clone(),
            updated_at: now,
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: Some(0),
            max_retries: Some(DEFAULT_MAX_RETRIES),
            retry_delay_ms: Some(DEFAULT_RETRY_DELAY_MS),
        })
    }

    pub(crate) fn queue_task(self: &Arc<Self>, task_id: String) {
        let should_start = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let max_active = state.settings.max_concurrent_downloads.max(1) as usize;
            if state.active.contains(&task_id) || state.active.len() >= max_active {
                false
            } else {
                let Some(task) = state.tasks.get_mut(&task_id) else {
                    return;
                };
                if matches!(
                    task.state,
                    DownloadTaskState::Queued
                        | DownloadTaskState::Paused
                        | DownloadTaskState::Failed
                ) {
                    task.state = DownloadTaskState::Downloading;
                    task.started_at.get_or_insert_with(now_iso);
                    task.connections_active = 1;
                    task.can_resume = true;
                    task.updated_at = now_iso();
                    state.active.insert(task_id.clone());
                    true
                } else {
                    false
                }
            }
        };
        if should_start {
            let _ = self.persist_tasks();
            if let Some(task) = self.task(&task_id) {
                emit_event(&DownloadEvent::TaskUpdated { task });
                let manager = Arc::clone(self);
                thread::spawn(move || manager.run_task(task_id));
            }
        }
    }

    pub(crate) fn run_task(self: Arc<Self>, task_id: String) {
        let task = match self.task(&task_id) {
            Some(task) => task,
            None => return,
        };
        let backend = task
            .backend
            .clone()
            .unwrap_or(DownloadTaskBackend::NativeHttp);
        let mut aria2_resource_lease = None;
        let result = match backend {
            DownloadTaskBackend::Aria2 => match Aria2Runtime::from_process_environment() {
                Err(error) => {
                    // The aria2 component is optional at runtime; plain HTTP
                    // falls back to the single-stream engine, BT tasks fail.
                    if is_native_http_url(&task.url) {
                        self.run_http(task).map_err(|message| (message, true))
                    } else {
                        Err((Aria2RunError::Unavailable(error).message(), false))
                    }
                }
                Ok(runtime) => {
                    let (runtime_path, component_version) = runtime.resource_binding();
                    match Aria2ResourceLeaseGuard::acquire(
                        &task.id,
                        runtime_path,
                        component_version,
                    ) {
                        Err(error) => Err((Aria2RunError::Unavailable(error).message(), false)),
                        Ok(lease) => {
                            aria2_resource_lease = Some(lease);
                            self.run_aria2(task, runtime).map_err(|error| {
                                let retryable = error.retryable();
                                (error.message(), retryable)
                            })
                        }
                    }
                }
            },
            _ => self.run_http(task).map_err(|message| (message, true)),
        };
        if let Err((message, retryable)) = result {
            if retryable {
                self.fail_or_retry(&task_id, message);
            } else {
                self.fail_task(&task_id, message);
            }
        }
        // Keep the signed aria2 version pinned until the task's completed,
        // canceled, paused, or failed state has been persisted and emitted.
        drop(aria2_resource_lease);
        self.finish_active(&task_id);
        self.drain_queue();
    }

    pub(crate) fn run_http(&self, task: DownloadTask) -> Result<(), String> {
        let outcome = transport::download_http(
            &task,
            || self.is_active(&task.id),
            |progress| {
                self.update_progress(&task.id, progress.received, progress.total, progress.speed);
            },
        )?;
        let Some(outcome) = outcome else {
            return Ok(());
        };
        self.update_progress(&task.id, outcome.received, outcome.total, 0);
        self.patch_task(&task.id, |task| {
            task.state = DownloadTaskState::Completed;
            task.received_bytes = if outcome.total > 0 {
                outcome.total
            } else {
                outcome.received
            };
            task.total_bytes = outcome.total;
            task.speed_bytes_per_second = 0;
            task.estimated_remaining_ms = None;
            task.connections_active = 0;
            task.can_resume = false;
            task.completed_at = Some(now_iso());
            task.updated_at = now_iso();
            task.error_message = None;
        });
        Ok(())
    }

    pub(crate) fn run_aria2(
        &self,
        task: DownloadTask,
        runtime: Aria2Runtime,
    ) -> Result<(), Aria2RunError> {
        let settings = self.settings();
        let outcome = runtime.execute(
            &task,
            &settings,
            || self.is_active(&task.id),
            |progress| {
                self.update_progress_with_connections(
                    &task.id,
                    progress.received,
                    progress.total,
                    progress.speed,
                    progress.connections,
                );
            },
        )?;
        let Some(outcome) = outcome else {
            return Ok(());
        };
        self.update_progress(&task.id, outcome.received, outcome.total, 0);
        self.patch_task(&task.id, |task| {
            task.state = DownloadTaskState::Completed;
            task.received_bytes = outcome.received;
            task.total_bytes = outcome.total;
            task.speed_bytes_per_second = 0;
            task.estimated_remaining_ms = None;
            task.connections_active = 0;
            task.can_resume = false;
            task.completed_at = Some(now_iso());
            task.updated_at = now_iso();
            task.error_message = None;
        });
        Ok(())
    }

    pub(crate) fn fail_or_retry(self: &Arc<Self>, task_id: &str, message: String) {
        let retry = self.build_retry_task(task_id);
        if let Some((task, delay)) = retry {
            let id = task.id.clone();
            let _ = self.set_task(task);
            let manager = Arc::clone(self);
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(delay));
                manager.queue_task(id);
            });
            return;
        }
        self.fail_task(task_id, message);
    }

    pub(crate) fn fail_task(&self, task_id: &str, message: String) {
        self.patch_task(task_id, |task| {
            task.state = DownloadTaskState::Failed;
            task.speed_bytes_per_second = 0;
            task.estimated_remaining_ms = None;
            task.connections_active = 0;
            task.can_resume = true;
            task.updated_at = now_iso();
            task.error_message = Some(message);
        });
    }

    pub(crate) fn build_retry_task(&self, task_id: &str) -> Option<(DownloadTask, u64)> {
        let task = self.task(task_id)?;
        let retry_count = task.retry_count.unwrap_or(0);
        let max_retries = task.max_retries.unwrap_or(DEFAULT_MAX_RETRIES);
        if retry_count >= max_retries {
            return None;
        }
        let delay = task.retry_delay_ms.unwrap_or(DEFAULT_RETRY_DELAY_MS);
        Some((
            DownloadTask {
                state: DownloadTaskState::Queued,
                retry_count: Some(retry_count + 1),
                received_bytes: 0,
                speed_bytes_per_second: 0,
                estimated_remaining_ms: None,
                connections_active: 0,
                can_resume: true,
                completed_at: None,
                error_message: None,
                updated_at: now_iso(),
                ..task
            },
            delay,
        ))
    }

    pub(crate) fn pause_task(&self, task_id: &str) -> Option<DownloadTask> {
        let task = self.patch_task(task_id, |task| {
            if !matches!(
                task.state,
                DownloadTaskState::Completed
                    | DownloadTaskState::Failed
                    | DownloadTaskState::Canceled
            ) {
                task.state = DownloadTaskState::Paused;
                task.speed_bytes_per_second = 0;
                task.estimated_remaining_ms = None;
                task.connections_active = 0;
                task.can_resume = true;
                task.updated_at = now_iso();
            }
        });
        // Persist the paused state before allowing the worker to observe that
        // it should stop and release its resource lease.
        self.finish_active(task_id);
        task
    }

    pub(crate) fn resume_task(self: &Arc<Self>, task_id: &str) -> Option<DownloadTask> {
        let task = self.patch_task(task_id, |task| {
            if !matches!(
                task.state,
                DownloadTaskState::Completed
                    | DownloadTaskState::Downloading
                    | DownloadTaskState::Canceled
            ) {
                task.state = DownloadTaskState::Queued;
                task.updated_at = now_iso();
            }
        });
        if task.is_some() {
            self.queue_task(task_id.to_string());
        }
        self.task(task_id)
    }

    pub(crate) fn cancel_task(&self, task_id: &str) -> Option<DownloadTask> {
        let task = self.patch_task(task_id, |task| {
            if !matches!(
                task.state,
                DownloadTaskState::Completed
                    | DownloadTaskState::Failed
                    | DownloadTaskState::Canceled
            ) {
                task.state = DownloadTaskState::Canceled;
                task.speed_bytes_per_second = 0;
                task.estimated_remaining_ms = None;
                task.connections_active = 0;
                task.updated_at = now_iso();
                task.error_message = Some("Download canceled.".to_string());
            }
        });
        self.finish_active(task_id);
        task
    }

    pub(crate) fn retry_task(self: &Arc<Self>, task_id: &str) -> Option<DownloadTask> {
        let task = self.patch_task(task_id, |task| {
            task.state = DownloadTaskState::Queued;
            task.received_bytes = 0;
            task.retry_count = Some(0);
            task.speed_bytes_per_second = 0;
            task.estimated_remaining_ms = None;
            task.connections_active = 0;
            task.can_resume = true;
            task.completed_at = None;
            task.error_message = None;
            task.updated_at = now_iso();
        });
        if task.is_some() {
            self.queue_task(task_id.to_string());
        }
        self.task(task_id)
    }

    pub(crate) fn remove_task(&self, task_id: &str) {
        let removed = {
            let mut state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            state.tasks.remove(task_id).is_some()
        };
        if removed {
            let _ = self.persist_tasks();
            emit_event(&DownloadEvent::TaskRemoved {
                task_id: task_id.to_string(),
            });
        }
        // Keep a running aria2 worker leased until the removal has been
        // persisted and published.
        self.finish_active(task_id);
    }

    pub(crate) fn set_priority(
        &self,
        task_id: &str,
        priority: DownloadPriority,
    ) -> Option<DownloadTask> {
        self.patch_task(task_id, |task| {
            task.priority = priority;
            task.updated_at = now_iso();
        })
    }

    pub(crate) fn select_batch_ids(&self, requested: Option<Vec<String>>) -> Vec<String> {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        match requested {
            Some(ids) => ids
                .into_iter()
                .filter(|id| state.tasks.contains_key(id))
                .collect(),
            None => state.tasks.keys().cloned().collect(),
        }
    }

    pub(crate) fn drain_queue(self: &Arc<Self>) {
        let ids = {
            let state = self
                .state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner);
            let queued = state
                .tasks
                .values()
                .filter(|task| task.state == DownloadTaskState::Queued)
                .cloned()
                .collect();
            sort_tasks_for_queue(queued)
                .into_iter()
                .map(|task| task.id)
                .collect::<Vec<_>>()
        };
        for id in ids {
            let (active_len, max_active) = {
                let state = self
                    .state
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner);
                (
                    state.active.len(),
                    state.settings.max_concurrent_downloads.max(1) as usize,
                )
            };
            if active_len >= max_active {
                break;
            }
            self.queue_task(id);
        }
    }

    pub(crate) fn reserved_paths(&self, except_id: Option<&str>) -> HashSet<String> {
        let state = self
            .state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        state
            .tasks
            .values()
            .filter(|task| except_id != Some(task.id.as_str()))
            .map(|task| task.save_path.clone())
            .collect()
    }

    pub(crate) fn task(&self, task_id: &str) -> Option<DownloadTask> {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .tasks
            .get(task_id)
            .cloned()
    }

    pub(crate) fn is_active(&self, task_id: &str) -> bool {
        self.state
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .active
            .contains(task_id)
    }

    pub(crate) fn finish_active(&self, task_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.active.remove(task_id);
        }
    }

    pub(crate) fn set_task(&self, task: DownloadTask) -> Result<DownloadTask, String> {
        {
            let mut state = self
                .state
                .lock()
                .map_err(|_| "download state".to_string())?;
            state.tasks.insert(task.id.clone(), task.clone());
        }
        self.persist_tasks()?;
        emit_event(&DownloadEvent::TaskUpdated { task: task.clone() });
        Ok(task)
    }

    pub(crate) fn patch_task(
        &self,
        task_id: &str,
        updater: impl FnOnce(&mut DownloadTask),
    ) -> Option<DownloadTask> {
        let task = {
            let mut state = self.state.lock().ok()?;
            let task = state.tasks.get_mut(task_id)?;
            updater(task);
            task.clone()
        };
        let _ = self.persist_tasks();
        emit_event(&DownloadEvent::TaskUpdated { task: task.clone() });
        Some(task)
    }

    pub(crate) fn update_progress(&self, task_id: &str, received: u64, total: u64, speed: u64) {
        self.update_progress_with_connections(task_id, received, total, speed, 1);
    }

    fn update_progress_with_connections(
        &self,
        task_id: &str,
        received: u64,
        total: u64,
        speed: u64,
        connections: u32,
    ) {
        self.patch_task(task_id, |task| {
            // A completed RPC poll may arrive after pause/cancel was applied.
            if task.state != DownloadTaskState::Downloading {
                return;
            }
            task.state = DownloadTaskState::Downloading;
            task.received_bytes = received;
            task.total_bytes = total;
            task.speed_bytes_per_second = speed;
            task.estimated_remaining_ms = estimate_remaining_ms(received, total, speed);
            task.connections_active = connections;
            task.can_resume = true;
            task.updated_at = now_iso();
            task.error_message = None;
        });
    }

    pub(crate) fn persist_tasks(&self) -> Result<(), String> {
        // Lock before taking the snapshot: an older snapshot can never land
        // after a newer one when worker threads race to persist progress.
        let _persistence = self
            .persistence
            .lock()
            .map_err(|_| "download persistence lock poisoned".to_string())?;
        let tasks = self.snapshot();
        write_json_atomic(
            &self.storage_root,
            &self.tasks_file,
            &StoredDownloadTasksFile {
                version: 1,
                tasks: tasks.tasks,
            },
        )
    }
}

pub(crate) fn sort_tasks(mut tasks: Vec<DownloadTask>) -> Vec<DownloadTask> {
    tasks.sort_by(|left, right| {
        left.created_at
            .cmp(&right.created_at)
            .then(left.id.cmp(&right.id))
    });
    tasks
}

pub(crate) fn sort_tasks_for_queue(mut tasks: Vec<DownloadTask>) -> Vec<DownloadTask> {
    tasks.sort_by(|left, right| {
        priority_rank(&left.priority)
            .cmp(&priority_rank(&right.priority))
            .then(left.created_at.cmp(&right.created_at))
            .then(left.id.cmp(&right.id))
    });
    tasks
}

fn priority_rank(priority: &DownloadPriority) -> u8 {
    match priority {
        DownloadPriority::High => 0,
        DownloadPriority::Normal => 1,
        DownloadPriority::Low => 2,
    }
}

pub(crate) fn parse_download_urls(request: &DownloadEnqueueRequest) -> Vec<String> {
    let mut urls = Vec::new();
    if let Some(values) = request.urls.as_ref() {
        urls.extend(values.iter().flat_map(|value| extract_urls(value)));
    }
    if let Some(text) = request.text.as_ref() {
        urls.extend(extract_urls(text));
    }
    urls.into_iter()
        .filter(|url| !url.trim().is_empty())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect()
}

fn extract_urls(text: &str) -> Vec<String> {
    text.split(|ch: char| ch.is_whitespace() || ch == '"' || ch == '\'' || ch == '<' || ch == '>')
        .filter(|part| {
            let lower = part.to_ascii_lowercase();
            lower.starts_with("http://")
                || lower.starts_with("https://")
                || lower.starts_with("ftp://")
                || lower.starts_with("ftps://")
                || lower.starts_with("sftp://")
                || lower.starts_with("webdav://")
                || lower.starts_with("webdavs://")
                || lower.starts_with("magnet:")
        })
        .map(|part| part.trim_matches(|ch| ch == ',' || ch == ';').to_string())
        .collect()
}

pub(crate) fn sanitize_file_name(value: &str) -> String {
    let replaced = value
        .trim()
        .chars()
        .map(|ch| match ch {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' | '\0'..='\u{1f}' => '_',
            _ => ch,
        })
        .collect::<String>();
    let trimmed = replaced.trim_end_matches(['.', ' ']);
    if trimmed.is_empty() {
        "download".to_string()
    } else {
        trimmed.chars().take(180).collect()
    }
}

pub(crate) fn file_name_from_url(url: &str) -> String {
    if let Ok(parsed) = url::Url::parse(url) {
        if parsed.scheme() == "magnet" {
            if let Some(display_name) = parsed
                .query_pairs()
                .find_map(|(key, value)| (key == "dn").then(|| value.to_string()))
            {
                return display_name;
            }
            return "magnet-download".to_string();
        }
        if let Some(segment) = parsed
            .path_segments()
            .and_then(|mut segments| segments.next_back())
            .filter(|segment| !segment.is_empty())
        {
            return urlencoding::decode(segment)
                .map(|value| value.to_string())
                .unwrap_or_else(|_| segment.to_string());
        }
    }
    "download".to_string()
}

pub(crate) fn default_download_directory() -> String {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(std::env::temp_dir)
        .to_string_lossy()
        .to_string()
}

pub(crate) fn unique_path(directory: &str, file_name: &str, reserved: &HashSet<String>) -> String {
    let mut candidate = Path::new(directory).join(file_name);
    if !candidate.exists() && !reserved.contains(&candidate.to_string_lossy().to_string()) {
        return candidate.to_string_lossy().to_string();
    }
    let stem = Path::new(file_name)
        .file_stem()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| "download".to_string());
    let extension = Path::new(file_name)
        .extension()
        .map(|value| format!(".{}", value.to_string_lossy()))
        .unwrap_or_default();
    for index in 1..10_000 {
        candidate = Path::new(directory).join(format!("{stem} ({index}){extension}"));
        if !candidate.exists() && !reserved.contains(&candidate.to_string_lossy().to_string()) {
            return candidate.to_string_lossy().to_string();
        }
    }
    candidate.to_string_lossy().to_string()
}

pub(crate) fn estimate_remaining_ms(received: u64, total: u64, speed: u64) -> Option<u64> {
    if total == 0 || speed == 0 || received >= total {
        None
    } else {
        Some(((total - received) * 1000) / speed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn late_progress_does_not_reactivate_paused_downloads() {
        let temp = tempfile::tempdir().unwrap();
        let manager = DownloadManager::new(temp.path().to_path_buf()).unwrap();
        let task = sample_task("paused", DownloadTaskState::Paused);
        manager.set_task(task.clone()).unwrap();
        manager.update_progress("paused", 1000, 1000, 500);
        let actual = manager.task("paused").unwrap();
        assert_eq!(actual.state, DownloadTaskState::Paused);
        assert_eq!(actual.received_bytes, task.received_bytes);
    }

    #[test]
    fn queue_sort_orders_priority_then_creation_time() {
        let tasks = vec![
            sample_task_with_priority(
                "normal-new",
                "2026-05-04T00:00:03.000Z",
                DownloadPriority::Normal,
            ),
            sample_task_with_priority(
                "high-new",
                "2026-05-04T00:00:04.000Z",
                DownloadPriority::High,
            ),
            sample_task_with_priority("low-old", "2026-05-04T00:00:01.000Z", DownloadPriority::Low),
            sample_task_with_priority(
                "high-old",
                "2026-05-04T00:00:02.000Z",
                DownloadPriority::High,
            ),
        ];

        let ordered = sort_tasks_for_queue(tasks)
            .into_iter()
            .map(|task| task.id)
            .collect::<Vec<_>>();

        assert_eq!(
            ordered,
            vec!["high-old", "high-new", "normal-new", "low-old"]
        );
    }

    #[test]
    fn parses_download_urls_and_deduplicates_sources() {
        let urls = parse_download_urls(&DownloadEnqueueRequest {
            text: Some("grab https://example.com/a.zip and magnet:?xt=urn:btih:abc".to_string()),
            urls: Some(vec![
                "https://example.com/a.zip".to_string(),
                "sftp://files.example.com/b.tar".to_string(),
            ]),
            ..DownloadEnqueueRequest::default()
        });
        let set = urls.into_iter().collect::<HashSet<_>>();

        assert_eq!(set.len(), 3);
        assert!(set.contains("https://example.com/a.zip"));
        assert!(set.contains("magnet:?xt=urn:btih:abc"));
        assert!(set.contains("sftp://files.example.com/b.tar"));
    }

    fn sample_task(id: &str, state: DownloadTaskState) -> DownloadTask {
        sample_task_with_priority(id, "2026-05-04T00:00:00.000Z", DownloadPriority::Normal)
            .with_state(state)
    }

    fn sample_task_with_priority(
        id: &str,
        created_at: &str,
        priority: DownloadPriority,
    ) -> DownloadTask {
        DownloadTask {
            id: id.to_string(),
            url: format!("https://example.com/{id}.zip"),
            original_url: None,
            file_name: format!("{id}.zip"),
            mime_type: None,
            request_headers: None,
            save_path: format!("/tmp/{id}.zip"),
            directory: "/tmp".to_string(),
            protocol: "https".to_string(),
            source: DownloadTaskSource::Manual,
            backend: Some(DownloadTaskBackend::NativeHttp),
            output_kind: Some(DownloadTaskOutputKind::File),
            source_tab_id: None,
            source_title: None,
            state: DownloadTaskState::Queued,
            received_bytes: 0,
            total_bytes: 100,
            speed_bytes_per_second: 0,
            estimated_remaining_ms: None,
            priority,
            connections_requested: 4,
            connections_active: 0,
            can_resume: true,
            created_at: created_at.to_string(),
            updated_at: created_at.to_string(),
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: None,
            max_retries: None,
            retry_delay_ms: None,
        }
    }

    trait WithState {
        fn with_state(self, state: DownloadTaskState) -> Self;
    }

    impl WithState for DownloadTask {
        fn with_state(mut self, state: DownloadTaskState) -> Self {
            self.state = state;
            self
        }
    }
}
