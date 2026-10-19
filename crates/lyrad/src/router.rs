use crate::handlers::{handle_lsp_request, handle_terminal_request};
use crate::modules::web::{
    search_site_stream_cancel_json, search_site_stream_read_json, search_site_stream_start_json,
};
use lyra_agent_runtime::{AgentRuntimeError, AgentRuntimeServices};
use lyra_download_core::{
    cancel_all_downloads_json, cancel_download_json, enqueue_download_json, list_downloads_json,
    pause_all_downloads_json, pause_download_json, read_download_settings_json,
    remove_download_json, resume_all_downloads_json, resume_download_json, retry_download_json,
    set_download_priority_json, update_download_settings_json,
};
use lyra_files_core::json::{handle_files_json, FILES_METHODS};
use lyra_runtime_protocol::{
    is_known_runtime_family, RuntimeError, RuntimeHelloV2Request, RuntimeHelloV2Response,
    DAEMON_CAPABILITIES, HANDSHAKE_METHOD, HOST_API_VERSION, PROTOCOL_MAX_VERSION,
    PROTOCOL_MIN_VERSION, RUNTIME_DATA_SCHEMA_NAME, RUNTIME_DATA_SCHEMA_VERSION,
    SHELL_CONNECTION_ROLE, SHELL_DATA_SCHEMA_NAME, SHELL_DATA_SCHEMA_VERSION,
};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

pub(crate) fn install_host_role_from_args(args: &[String]) {
    if let Some(role) = args
        .windows(2)
        .find(|pair| pair[0] == "--role")
        .map(|pair| pair[1].clone())
    {
        std::env::set_var("LYRA_HOST_ROLE", role);
    }
}

pub(crate) fn host_role() -> String {
    std::env::var("LYRA_HOST_ROLE").unwrap_or_else(|_| "all".to_string())
}

pub(crate) fn role_allows(role: &str, method: &str) -> bool {
    if method == HANDSHAKE_METHOD || method.starts_with("runtime.") {
        return true;
    }
    match role {
        "all" | "" => true,
        "terminal" => method.starts_with("terminal."),
        "files" => method.starts_with("files."),
        "agent" => method.starts_with("agent.") && method != "agent.exec.run",
        "exec" => method == "agent.exec.run",
        "scheduler" => method.starts_with("scheduler."),
        "services" => {
            method.starts_with("search.")
                || method.starts_with("lsp.")
                || method.starts_with("download.")
        }
        _ => false,
    }
}

pub(crate) fn runtime_error(code: &str, message: impl Into<String>) -> RuntimeError {
    RuntimeError::new(code, message.into())
}

fn map_runtime_error(error: impl std::fmt::Display) -> RuntimeError {
    runtime_error("RUNTIME_ERROR", error.to_string())
}

fn json_request(payload: Value) -> Result<String, RuntimeError> {
    serde_json::to_string(&payload)
        .map_err(|error| runtime_error("SERDE_ENCODE_FAILED", error.to_string()))
}

fn parse_json_result(payload: String) -> Result<Value, RuntimeError> {
    serde_json::from_str(&payload)
        .map_err(|error| runtime_error("SERDE_DECODE_FAILED", error.to_string()))
}

fn call_json<E>(
    payload: Value,
    handler: impl FnOnce(String) -> Result<String, E>,
) -> Result<Value, RuntimeError>
where
    E: std::fmt::Display,
{
    let response_json = handler(json_request(payload)?).map_err(map_runtime_error)?;
    parse_json_result(response_json)
}

fn call_void<E>(
    payload: Value,
    handler: impl FnOnce(String) -> Result<(), E>,
) -> Result<Value, RuntimeError>
where
    E: std::fmt::Display,
{
    handler(json_request(payload)?).map_err(map_runtime_error)?;
    Ok(Value::Null)
}

fn to_value<T: Serialize>(value: &T) -> Result<Value, RuntimeError> {
    serde_json::to_value(value)
        .map_err(|error| runtime_error("SERDE_ENCODE_FAILED", error.to_string()))
}

fn negotiate_protocol_version(request: &RuntimeHelloV2Request) -> Result<u32, RuntimeError> {
    if request.protocol_min_version == 0
        || request.protocol_min_version > request.protocol_max_version
    {
        return Err(runtime_error(
            "BAD_REQUEST",
            "runtime protocol range must be non-zero and ordered",
        ));
    }

    let minimum = request.protocol_min_version.max(PROTOCOL_MIN_VERSION);
    let maximum = request.protocol_max_version.min(PROTOCOL_MAX_VERSION);
    if minimum > maximum {
        return Err(RuntimeError::with_details(
            "PROTOCOL_VERSION_MISMATCH",
            format!(
                "runtime protocol ranges do not overlap: client {}-{}, server {}-{}",
                request.protocol_min_version,
                request.protocol_max_version,
                PROTOCOL_MIN_VERSION,
                PROTOCOL_MAX_VERSION
            ),
            json!({
                "client": {
                    "min": request.protocol_min_version,
                    "max": request.protocol_max_version
                },
                "server": {
                    "min": PROTOCOL_MIN_VERSION,
                    "max": PROTOCOL_MAX_VERSION
                }
            }),
        ));
    }
    Ok(maximum)
}

fn validate_runtime_hello(request: &RuntimeHelloV2Request) -> Result<(), RuntimeError> {
    if request.client_name.trim().is_empty()
        || request.component_version.trim().is_empty()
        || request.build_id.trim().is_empty()
        || request.host_api_version.trim().is_empty()
        || request.connection_lease_id.trim().is_empty()
    {
        return Err(runtime_error(
            "BAD_REQUEST",
            "runtime hello identity and connection lease fields must not be empty",
        ));
    }
    if request
        .data_schemas
        .iter()
        .any(|(name, version)| name.trim().is_empty() || *version == 0)
    {
        return Err(runtime_error(
            "BAD_REQUEST",
            "runtime hello data schema names and versions must be non-empty and non-zero",
        ));
    }
    let client_host_api = Version::parse(&request.host_api_version).map_err(|error| {
        runtime_error("BAD_REQUEST", format!("invalid host API version: {error}"))
    })?;
    let runtime_host_api = Version::parse(HOST_API_VERSION)
        .map_err(|error| runtime_error("INTERNAL_ERROR", error.to_string()))?;
    if client_host_api.major != runtime_host_api.major {
        return Err(RuntimeError::with_details(
            "HOST_API_VERSION_MISMATCH",
            format!(
                "host API major versions do not overlap: client {}, runtime {}",
                client_host_api, runtime_host_api
            ),
            json!({
                "client": request.host_api_version,
                "runtime": runtime_host_api.to_string()
            }),
        ));
    }
    if request.connection_role == SHELL_CONNECTION_ROLE
        && request.data_schemas.get(SHELL_DATA_SCHEMA_NAME) != Some(&SHELL_DATA_SCHEMA_VERSION)
    {
        return Err(runtime_error(
            "DATA_SCHEMA_MISMATCH",
            "primary host must support lyra.desktop data schema v1",
        ));
    }
    if request
        .capabilities
        .iter()
        .any(|capability| capability.trim().is_empty())
    {
        return Err(runtime_error(
            "BAD_REQUEST",
            "runtime hello capabilities must not be empty",
        ));
    }
    Ok(())
}

pub(crate) fn handle_runtime_request(method: &str, payload: Value) -> Result<Value, RuntimeError> {
    if !is_known_runtime_family(method)
        && method != "agent.exec.run"
        && !method.starts_with("scheduler.")
    {
        return Err(runtime_error(
            "METHOD_NOT_FOUND",
            format!("unknown runtime method: {method}"),
        ));
    }
    if !role_allows(&host_role(), method) {
        return Err(runtime_error(
            "METHOD_NOT_FOUND",
            format!("{method} is served by another host"),
        ));
    }
    match method {
        HANDSHAKE_METHOD => {
            let request: RuntimeHelloV2Request = from_payload(payload)?;
            validate_runtime_hello(&request)?;
            let negotiated_protocol_version = negotiate_protocol_version(&request)?;
            let component_version = validated_runtime_component_version()?;
            to_value(&RuntimeHelloV2Response {
                protocol_min_version: PROTOCOL_MIN_VERSION,
                protocol_max_version: PROTOCOL_MAX_VERSION,
                negotiated_protocol_version,
                server_name: crate::RUNTIME_NAME.to_string(),
                component_version: component_version.to_string(),
                build_id: runtime_build_id().to_string(),
                host_api_version: HOST_API_VERSION.to_string(),
                capabilities: DAEMON_CAPABILITIES
                    .iter()
                    .map(|capability| (*capability).to_string())
                    .collect(),
                data_schemas: [(
                    RUNTIME_DATA_SCHEMA_NAME.to_string(),
                    RUNTIME_DATA_SCHEMA_VERSION,
                )]
                .into(),
                connection_role: request.connection_role,
                connection_lease_id: request.connection_lease_id,
            })
        }
        "runtime.identity" => {
            let component_version = validated_runtime_component_version()?;
            Ok(json!({
                "componentVersion": component_version,
                "buildId": runtime_build_id(),
                "protocolMinVersion": PROTOCOL_MIN_VERSION,
                "protocolMaxVersion": PROTOCOL_MAX_VERSION,
            }))
        }
        "runtime.reload" => Ok(json!({
            "status": "reloaded",
            "detail": "runtime modules will use latest persisted configuration on subsequent calls"
        })),
        method if method.starts_with("search.") => handle_search_request(method, payload),
        method if method.starts_with("terminal.") => handle_terminal_request(method, payload),
        method if method.starts_with("lsp.") => handle_lsp_request(method, payload),
        method if method.starts_with("download.") => handle_download_request(method, payload),
        method if method.starts_with("files.") => handle_files_request(method, payload),
        method if method.starts_with("agent.") => handle_agent_request(method, payload),
        other => Err(runtime_error(
            "METHOD_NOT_FOUND",
            format!("unknown runtime method: {other}"),
        )),
    }
}

fn runtime_component_version() -> &'static str {
    option_env!("LYRA_COMPONENT_VERSION").unwrap_or(env!("CARGO_PKG_VERSION"))
}

fn validated_runtime_component_version() -> Result<&'static str, RuntimeError> {
    let version = runtime_component_version();
    Version::parse(version).map_err(|error| {
        runtime_error(
            "RUNTIME_COMPONENT_VERSION_INVALID",
            format!("invalid Runtime component version {version}: {error}"),
        )
    })?;
    Ok(version)
}

fn runtime_build_id() -> &'static str {
    option_env!("LYRA_BUILD_ID").unwrap_or(env!("CARGO_PKG_VERSION"))
}

fn handle_agent_request(method: &str, payload: Value) -> Result<Value, RuntimeError> {
    AgentRuntimeServices::default()
        .handle_agent_request(method, payload)
        .map_err(|error| match error {
            AgentRuntimeError::UnknownMethod(_) => {
                unknown_method("agent", method).expect_err("unknown_method always returns an error")
            }
            other => runtime_error("RUNTIME_ERROR", other.to_string()),
        })
}

fn handle_download_request(method: &str, payload: Value) -> Result<Value, RuntimeError> {
    match method {
        "download.list" => call_json(payload, list_downloads_json),
        "download.enqueue" => call_json(payload, enqueue_download_json),
        "download.pause" => call_json(payload, pause_download_json),
        "download.resume" => call_json(payload, resume_download_json),
        "download.cancel" => call_json(payload, cancel_download_json),
        "download.retry" => call_json(payload, retry_download_json),
        "download.remove" => call_void(payload, remove_download_json),
        "download.set_priority" => call_json(payload, set_download_priority_json),
        "download.pause_all" => call_json(payload, pause_all_downloads_json),
        "download.resume_all" => call_json(payload, resume_all_downloads_json),
        "download.cancel_all" => call_json(payload, cancel_all_downloads_json),
        "download.settings.read" => call_json(payload, read_download_settings_json),
        "download.settings.update" => call_json(payload, update_download_settings_json),
        _ => unknown_method("download", method),
    }
}

fn handle_files_request(method: &str, payload: Value) -> Result<Value, RuntimeError> {
    if !FILES_METHODS.contains(&method) {
        return unknown_method("files", method);
    }
    call_json(payload, |encoded| handle_files_json(method, &encoded))
}

fn handle_search_request(method: &str, payload: Value) -> Result<Value, RuntimeError> {
    match method {
        "search.site.stream.start" => call_json(payload, search_site_stream_start_json),
        "search.site.stream.read" => call_json(payload, search_site_stream_read_json),
        "search.site.stream.cancel" => call_json(payload, search_site_stream_cancel_json),
        _ => unknown_method("search", method),
    }
}

fn from_payload<T: for<'de> Deserialize<'de>>(payload: Value) -> Result<T, RuntimeError> {
    serde_json::from_value(payload).map_err(|error| runtime_error("BAD_REQUEST", error.to_string()))
}

fn unknown_method(scope: &str, method: &str) -> Result<Value, RuntimeError> {
    Err(runtime_error(
        "METHOD_NOT_FOUND",
        format!("unknown {scope} runtime method: {method}"),
    ))
}

#[cfg(test)]
mod tests {
    use super::role_allows;

    #[test]
    fn each_host_only_answers_its_own_methods() {
        assert!(role_allows("terminal", "terminal.session.create"));
        assert!(!role_allows("terminal", "files.list"));
        assert!(role_allows("files", "files.list"));
        assert!(!role_allows("agent", "agent.exec.run"));
        assert!(role_allows("exec", "agent.exec.run"));
        assert!(role_allows("services", "download.list"));
        assert!(!role_allows("services", "agent.turn"));
        assert!(role_allows("all", "agent.turn"));
        assert!(role_allows("scheduler", "runtime.identity"));
    }
}
