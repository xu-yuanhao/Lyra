use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::model::{
    DownloadBtSettings, DownloadProxySettings, DownloadSettings, DownloadTask, DownloadTaskBackend,
    DownloadTaskOutputKind, DownloadTaskState,
};
use crate::now_iso;

pub(crate) const TASKS_FILE_NAME: &str = "tasks.v1.json";
pub(crate) const SETTINGS_FILE_NAME: &str = "settings.v1.json";
pub(crate) const DEFAULT_MAX_RETRIES: u32 = 3;
pub(crate) const DEFAULT_RETRY_DELAY_MS: u64 = 1_500;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StoredDownloadTasksFile {
    pub(crate) version: u8,
    pub(crate) tasks: Vec<DownloadTask>,
}

fn quarantine(path: &Path) -> Result<(), String> {
    if path.exists() {
        let destination = path.with_extension(format!("corrupt-{}.json", uuid::Uuid::new_v4()));
        fs::rename(path, &destination).map_err(|error| error.to_string())?;
        eprintln!(
            "Preserved damaged download data at {}",
            destination.display()
        );
    }
    Ok(())
}

fn read_recoverable(path: &Path) -> Result<Option<Value>, String> {
    let backup = path.with_extension("bak");
    // A prior recovery may have quarantined the primary immediately before a
    // crash. The surviving last-good snapshot is still a valid startup source.
    for candidate in [path, backup.as_path()] {
        if !candidate.exists() {
            continue;
        }
        let raw = fs::read(candidate).map_err(|error| error.to_string())?;
        match serde_json::from_slice::<Value>(&raw) {
            Ok(value) => {
                if candidate == backup {
                    eprintln!("Recovered download data from {}", backup.display());
                }
                return Ok(Some(value));
            }
            Err(error) => {
                quarantine(candidate)?;
                eprintln!("Download snapshot could not be decoded: {error}");
            }
        }
    }
    Ok(None)
}

fn file_lock(path: &Path) -> Result<fs::File, String> {
    let lock = fs::OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path.with_extension("lock"))
        .map_err(|error| error.to_string())?;
    lock.lock().map_err(|error| error.to_string())?;
    Ok(lock)
}

pub(crate) fn read_tasks(path: &Path) -> Result<Vec<DownloadTask>, String> {
    if !path.exists() && !path.with_extension("bak").exists() {
        return Ok(Vec::new());
    }
    let _lock = file_lock(path)?;
    let Some(value) = read_recoverable(path)? else {
        return Ok(Vec::new());
    };
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported download tasks version; data has been preserved".to_string());
    }
    let Some(rows) = value.get("tasks").and_then(Value::as_array) else {
        quarantine(path)?;
        return Ok(Vec::new());
    };
    let mut tasks = Vec::new();
    let mut damaged = false;
    for row in rows {
        match serde_json::from_value(row.clone()) {
            Ok(task) => tasks.push(task),
            Err(error) => {
                damaged = true;
                eprintln!("Skipped damaged download record: {error}");
            }
        }
    }
    if damaged {
        quarantine(path)?;
    }
    Ok(tasks)
}

pub(crate) fn read_settings(path: &Path) -> Result<DownloadSettings, String> {
    if !path.exists() && !path.with_extension("bak").exists() {
        return Ok(default_settings());
    }
    let _lock = file_lock(path)?;
    let Some(value) = read_recoverable(path)? else {
        return Ok(default_settings());
    };
    if value.get("version").and_then(Value::as_u64) != Some(1) {
        return Err("Unsupported download settings version; data has been preserved".to_string());
    }
    match serde_json::from_value(value) {
        Ok(settings) => Ok(settings),
        Err(error) => {
            quarantine(path)?;
            eprintln!("Reset invalid download settings: {error}");
            Ok(default_settings())
        }
    }
}

pub(crate) fn default_settings() -> DownloadSettings {
    DownloadSettings {
        version: 1,
        speed_limit_bytes_per_second: None,
        proxy: DownloadProxySettings {
            mode: "system".to_string(),
            url: None,
        },
        bt: DownloadBtSettings {
            dht_enabled: true,
            peer_exchange_enabled: true,
            local_peer_discovery_enabled: true,
            seed_time_minutes: 0,
            tracker_urls: Vec::new(),
            max_upload_bytes_per_second: None,
        },
        default_headers: HashMap::new(),
        default_cookie_header: None,
        max_concurrent_downloads: crate::model::default_max_concurrent_downloads(),
        default_directory: None,
        updated_at: now_iso(),
    }
}

pub(crate) fn write_json_atomic<T: Serialize>(
    root: &Path,
    path: &Path,
    value: &T,
) -> Result<(), String> {
    fs::create_dir_all(root).map_err(|error| error.to_string())?;
    let _lock = file_lock(path)?;
    let encoded = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    if path.exists() {
        let previous = fs::read(path).map_err(|error| error.to_string())?;
        if serde_json::from_slice::<Value>(&previous).is_ok() {
            replace_synced(&path.with_extension("bak"), &previous)?;
        }
    }
    replace_synced(path, &encoded)
}

fn replace_synced(path: &Path, encoded: &[u8]) -> Result<(), String> {
    let temp = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp).map_err(|error| error.to_string())?;
        file.write_all(encoded).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        drop(file);
        fs::rename(&temp, path).map_err(|error| error.to_string())?;
        #[cfg(unix)]
        if let Some(parent) = path.parent() {
            fs::File::open(parent)
                .and_then(|directory| directory.sync_all())
                .map_err(|error| error.to_string())?;
        }
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    result
}

pub(crate) fn restore_task(mut task: DownloadTask) -> Result<DownloadTask, String> {
    let was_active = matches!(
        task.state,
        DownloadTaskState::Downloading | DownloadTaskState::Queued | DownloadTaskState::Paused
    );
    if matches!(
        task.state,
        DownloadTaskState::Downloading | DownloadTaskState::Queued
    ) {
        task.state = DownloadTaskState::Queued;
    }
    task.speed_bytes_per_second = 0;
    task.connections_active = 0;
    task.can_resume = if matches!(
        task.state,
        DownloadTaskState::Completed | DownloadTaskState::Canceled
    ) {
        false
    } else {
        was_active || task.can_resume
    };
    task.retry_count.get_or_insert(0);
    task.max_retries.get_or_insert(DEFAULT_MAX_RETRIES);
    task.retry_delay_ms.get_or_insert(DEFAULT_RETRY_DELAY_MS);
    task.backend.get_or_insert(DownloadTaskBackend::Electron);
    task.output_kind.get_or_insert(DownloadTaskOutputKind::File);
    if was_active {
        task.error_message = None;
    }
    Ok(task)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn concurrent_writers_keep_valid_snapshot_and_backup() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join(TASKS_FILE_NAME);
        std::thread::scope(|scope| {
            for index in 0..12 {
                let root = temp.path();
                let path = &path;
                scope.spawn(move || {
                    write_json_atomic(
                        root,
                        path,
                        &StoredDownloadTasksFile {
                            version: 1,
                            tasks: vec![sample_task(&index.to_string(), DownloadTaskState::Paused)],
                        },
                    )
                    .unwrap()
                });
            }
        });
        assert_eq!(read_tasks(&path).unwrap().len(), 1);
        assert!(path.with_extension("bak").is_file());
        fs::write(&path, b"{broken").unwrap();
        assert_eq!(read_tasks(&path).unwrap().len(), 1);
        // Simulate a crash between quarantine and the manager's next save.
        assert_eq!(read_tasks(&path).unwrap().len(), 1);
        assert!(
            fs::read_dir(temp.path())
                .unwrap()
                .filter_map(Result::ok)
                .any(|entry| entry.file_name().to_string_lossy().contains("corrupt-"))
        );
    }

    #[test]
    fn one_invalid_record_does_not_hide_other_downloads() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join(TASKS_FILE_NAME);
        let value = serde_json::json!({"version":1,"tasks":[sample_task("healthy", DownloadTaskState::Paused), {"id":"broken"}]});
        fs::write(&path, serde_json::to_vec(&value).unwrap()).unwrap();
        assert_eq!(read_tasks(&path).unwrap()[0].id, "healthy");
        assert!(!path.exists());
    }

    #[test]
    fn restores_active_tasks_to_queue() {
        let mut task = sample_task("active", DownloadTaskState::Downloading);
        task.error_message = Some("interrupted".to_string());
        let restored = restore_task(task).expect("restored");

        assert_eq!(restored.state, DownloadTaskState::Queued);
        assert_eq!(restored.connections_active, 0);
        assert_eq!(restored.can_resume, true);
        assert_eq!(restored.error_message, None);
    }

    #[test]
    fn default_settings_keep_expected_defaults() {
        let settings = default_settings();
        assert_eq!(settings.version, 1);
        assert_eq!(settings.proxy.mode, "system");
        assert_eq!(settings.bt.dht_enabled, true);
        assert_eq!(settings.max_concurrent_downloads, 3);
        assert_eq!(settings.default_directory, None);
    }

    #[test]
    fn settings_written_by_older_builds_still_load() {
        // Pre-simplification settings carried schedule/postProcessing/saveRules
        // and lacked maxConcurrentDownloads; serde must ignore the removed keys
        // and default the new one.
        let legacy = r#"{
            "version": 1,
            "speedLimitBytesPerSecond": 1024,
            "schedule": { "enabled": false },
            "proxy": { "mode": "system" },
            "postProcessing": { "autoExtract": false },
            "bt": { "dhtEnabled": true, "peerExchangeEnabled": true, "localPeerDiscoveryEnabled": true, "seedTimeMinutes": 0, "trackerUrls": [] },
            "defaultHeaders": {},
            "saveRules": [],
            "updatedAt": "2026-08-01T00:00:00.000Z"
        }"#;
        let settings: DownloadSettings = serde_json::from_str(legacy).expect("legacy settings");
        assert_eq!(settings.speed_limit_bytes_per_second, Some(1024));
        assert_eq!(settings.max_concurrent_downloads, 3);
    }

    fn sample_task(id: &str, state: DownloadTaskState) -> DownloadTask {
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
            source: crate::model::DownloadTaskSource::Manual,
            backend: Some(DownloadTaskBackend::NativeHttp),
            output_kind: Some(DownloadTaskOutputKind::File),
            source_tab_id: None,
            source_title: None,
            state,
            received_bytes: 0,
            total_bytes: 100,
            speed_bytes_per_second: 0,
            estimated_remaining_ms: None,
            priority: crate::model::DownloadPriority::Normal,
            connections_requested: 4,
            connections_active: 0,
            can_resume: true,
            created_at: "2026-05-04T00:00:00.000Z".to_string(),
            updated_at: "2026-05-04T00:00:00.000Z".to_string(),
            started_at: None,
            completed_at: None,
            error_message: None,
            retry_count: None,
            max_retries: None,
            retry_delay_ms: None,
        }
    }
}
