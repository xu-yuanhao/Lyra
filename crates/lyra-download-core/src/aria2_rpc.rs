use reqwest::blocking::Client;
use serde_json::{Value, json};
use std::net::TcpListener;
use std::time::Duration;
use uuid::Uuid;

use crate::aria2::Aria2Progress;

pub(crate) struct Aria2Rpc {
    pub(crate) port: u16,
    pub(crate) secret: String,
    client: Client,
}

impl Aria2Rpc {
    pub(crate) fn new() -> Result<Self, String> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).map_err(|error| error.to_string())?;
        let port = listener
            .local_addr()
            .map_err(|error| error.to_string())?
            .port();
        Ok(Self {
            port,
            secret: Uuid::new_v4().to_string(),
            client: Client::builder()
                .no_proxy()
                .timeout(Duration::from_millis(800))
                .build()
                .map_err(|error| error.to_string())?,
        })
    }

    pub(crate) fn progress(&self) -> Result<(Aria2Progress, bool), String> {
        let token = format!("token:{}", self.secret);
        let fields = [
            "status",
            "totalLength",
            "completedLength",
            "downloadSpeed",
            "connections",
            "followedBy",
            "errorMessage",
        ];
        let response: Value = self
            .client
            .post(format!("http://127.0.0.1:{}/jsonrpc", self.port))
            .json(
                &json!({"jsonrpc":"2.0", "id":"progress", "method":"system.multicall", "params":[[
                    {"methodName":"aria2.tellActive", "params":[token, fields]},
                    {"methodName":"aria2.tellWaiting", "params":[token, 0, 1000, fields]},
                    {"methodName":"aria2.tellStopped", "params":[token, 0, 1000, fields]},
                ]]}),
            )
            .send()
            .and_then(reqwest::blocking::Response::error_for_status)
            .and_then(reqwest::blocking::Response::json)
            .map_err(|error| error.to_string())?;
        parse_progress(&response)
    }
}

fn parse_progress(response: &Value) -> Result<(Aria2Progress, bool), String> {
    let groups = response
        .get("result")
        .and_then(Value::as_array)
        .ok_or("aria2 progress response has no result")?;
    let mut progress = Aria2Progress {
        received: 0,
        total: 0,
        speed: 0,
        connections: 0,
    };
    let mut complete = true;
    let mut count = 0;
    for group in groups {
        let rows = group
            .get(0)
            .and_then(Value::as_array)
            .ok_or("aria2 progress query failed")?;
        for row in rows {
            // A torrent/metalink descriptor delegates to its payload GIDs. Never
            // count its metadata bytes as payload or mistake it for completion.
            if row
                .get("followedBy")
                .and_then(Value::as_array)
                .is_some_and(|ids| !ids.is_empty())
            {
                continue;
            }
            let status = row
                .get("status")
                .and_then(Value::as_str)
                .ok_or("aria2 task has no status")?;
            if status == "error" || status == "removed" {
                return Err(row
                    .get("errorMessage")
                    .and_then(Value::as_str)
                    .unwrap_or("aria2 task failed")
                    .to_string());
            }
            let number = |key: &str| -> Result<u64, String> {
                row.get(key)
                    .and_then(Value::as_str)
                    .ok_or_else(|| format!("aria2 task has no {key}"))?
                    .parse()
                    .map_err(|_| format!("aria2 task has invalid {key}"))
            };
            progress.received = progress.received.saturating_add(number("completedLength")?);
            progress.total = progress.total.saturating_add(number("totalLength")?);
            progress.speed = progress.speed.saturating_add(number("downloadSpeed")?);
            progress.connections = progress
                .connections
                .saturating_add(number("connections")?.min(u32::MAX as u64) as u32);
            count += 1;
            complete &= status == "complete";
        }
    }
    Ok((progress, count > 0 && complete))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn excludes_followed_metadata_and_uses_piece_counts() {
        let response = json!({"result":[[[{"status":"active","totalLength":"1048576","completedLength":"4096","downloadSpeed":"512","connections":"4"}]], [[]], [[{"status":"complete","followedBy":["payload"]}]]]});
        let (progress, done) = parse_progress(&response).unwrap();
        assert_eq!(progress.received, 4096);
        assert_eq!(progress.total, 1048576);
        assert_eq!(progress.speed, 512);
        assert_eq!(progress.connections, 4);
        assert!(!done);
    }
}
