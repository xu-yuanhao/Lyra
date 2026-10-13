#![cfg_attr(test, allow(clippy::expect_used, clippy::unwrap_used))]

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use chrono::{SecondsFormat, Utc};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

mod aria2;
mod aria2_resource_lease;
mod aria2_rpc;
mod manager;
mod model;
mod persistence;
mod transport;

pub use aria2_resource_lease::{
    Aria2ResourceLeaseDispatcher, clear_aria2_resource_lease_dispatcher,
    register_aria2_resource_lease_dispatcher,
};
pub use model::*;

use manager::DownloadManager;

pub type RustEventCallback = Arc<dyn Fn(String) + Send + Sync + 'static>;

static RUST_EVENT_CALLBACK: Lazy<Mutex<Option<RustEventCallback>>> = Lazy::new(|| Mutex::new(None));
static MANAGERS: Lazy<Mutex<HashMap<PathBuf, Arc<DownloadManager>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn register_rust_event_callback(callback: RustEventCallback) {
    if let Ok(mut slot) = RUST_EVENT_CALLBACK.lock() {
        *slot = Some(callback);
    }
}

pub fn clear_rust_event_callback() {
    if let Ok(mut slot) = RUST_EVENT_CALLBACK.lock() {
        *slot = None;
    }
}

pub(crate) fn emit_event(event: &DownloadEvent) {
    let payload = match serde_json::to_string(event) {
        Ok(value) => value,
        Err(_) => return,
    };
    if let Ok(slot) = RUST_EVENT_CALLBACK.lock() {
        if let Some(callback) = slot.as_ref() {
            callback(payload);
        }
    }
}

pub(crate) fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn storage_root_from_payload(value: &Value) -> Result<PathBuf, String> {
    let storage_root = value
        .get("storageRoot")
        .and_then(Value::as_str)
        .ok_or_else(|| "storageRoot is required".to_string())?;
    if storage_root.trim().is_empty() {
        return Err("storageRoot is required".to_string());
    }
    Ok(PathBuf::from(storage_root))
}

fn manager_for_storage_root(storage_root: PathBuf) -> Result<Arc<DownloadManager>, String> {
    let mut managers = MANAGERS
        .lock()
        .map_err(|_| "download managers".to_string())?;
    if let Some(manager) = managers.get(&storage_root) {
        return Ok(Arc::clone(manager));
    }
    let manager = Arc::new(DownloadManager::new(storage_root.clone())?);
    managers.insert(storage_root, Arc::clone(&manager));
    Ok(manager)
}

fn with_manager<T>(
    payload: Value,
    operation: impl FnOnce(&Arc<DownloadManager>, Value) -> Result<T, String>,
) -> Result<T, String> {
    let storage_root = storage_root_from_payload(&payload)?;
    let manager = manager_for_storage_root(storage_root)?;
    operation(&manager, payload)
}

fn parse_payload<T: for<'de> Deserialize<'de>>(payload: Value) -> Result<T, String> {
    serde_json::from_value(payload).map_err(|error| error.to_string())
}

fn to_json<T: Serialize>(value: T) -> Result<String, String> {
    serde_json::to_string(&value).map_err(|error| error.to_string())
}

pub fn list_downloads_json(payload: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, _| to_json(manager.snapshot()))
}

pub fn enqueue_download_json(payload: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, payload| {
        let request = parse_payload::<DownloadEnqueueRequest>(payload)?;
        manager.enqueue(request)?;
        to_json(manager.snapshot())
    })
}

pub fn pause_download_json(payload: String) -> Result<String, String> {
    task_mutation(payload, |manager, id| manager.pause_task(&id))
}

pub fn resume_download_json(payload: String) -> Result<String, String> {
    task_mutation(payload, |manager, id| manager.resume_task(&id))
}

pub fn cancel_download_json(payload: String) -> Result<String, String> {
    task_mutation(payload, |manager, id| manager.cancel_task(&id))
}

pub fn retry_download_json(payload: String) -> Result<String, String> {
    task_mutation(payload, |manager, id| manager.retry_task(&id))
}

pub fn remove_download_json(payload: String) -> Result<(), String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, payload| {
        let request = parse_payload::<DownloadTaskRequest>(payload)?;
        manager.remove_task(&request.task_id);
        Ok(())
    })
}

pub fn set_download_priority_json(payload: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, payload| {
        let request = parse_payload::<DownloadPriorityRequest>(payload)?;
        to_json(manager.set_priority(&request.task_id, request.priority))
    })
}

pub fn pause_all_downloads_json(payload: String) -> Result<String, String> {
    batch_mutation(payload, |manager, ids| {
        for id in ids {
            manager.pause_task(&id);
        }
    })
}

pub fn resume_all_downloads_json(payload: String) -> Result<String, String> {
    batch_mutation(payload, |manager, ids| {
        for id in ids {
            manager.resume_task(&id);
        }
    })
}

pub fn cancel_all_downloads_json(payload: String) -> Result<String, String> {
    batch_mutation(payload, |manager, ids| {
        for id in ids {
            manager.cancel_task(&id);
        }
    })
}

pub fn read_download_settings_json(payload: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, _| to_json(manager.settings()))
}

pub fn update_download_settings_json(payload: String) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, payload| {
        let update = parse_payload::<DownloadSettingsUpdate>(payload)?;
        to_json(manager.update_settings(update)?)
    })
}

fn task_mutation(
    payload: String,
    operation: impl FnOnce(&Arc<DownloadManager>, String) -> Option<DownloadTask>,
) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, payload| {
        let request = parse_payload::<DownloadTaskRequest>(payload)?;
        to_json(operation(manager, request.task_id))
    })
}

fn batch_mutation(
    payload: String,
    operation: impl FnOnce(&Arc<DownloadManager>, Vec<String>),
) -> Result<String, String> {
    let payload: Value = serde_json::from_str(&payload).map_err(|error| error.to_string())?;
    with_manager(payload, |manager, payload| {
        let request = parse_payload::<DownloadBatchRequest>(payload)?;
        let ids = manager.select_batch_ids(request.task_ids);
        operation(manager, ids);
        to_json(manager.snapshot())
    })
}
