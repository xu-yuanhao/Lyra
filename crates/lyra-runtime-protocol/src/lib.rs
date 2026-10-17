use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

mod methods;
pub use methods::{is_known_runtime_family, runtime_method_family, RUNTIME_METHOD_FAMILIES};

pub const PROTOCOL_MIN_VERSION: u32 = 2;
pub const PROTOCOL_MAX_VERSION: u32 = 2;
pub const HOST_API_VERSION: &str = "1.0.0";
pub const HANDSHAKE_METHOD: &str = "runtime.handshake";
pub const SHELL_CONNECTION_ROLE: RuntimeConnectionRole = RuntimeConnectionRole::PrimaryHost;
pub const AUXILIARY_CONNECTION_ROLE: RuntimeConnectionRole = RuntimeConnectionRole::AuxiliaryClient;
pub const SHELL_CAPABILITY_HOST_REQUESTS: &str = "runtime.host.requests";
pub const SHELL_DATA_SCHEMA_NAME: &str = "lyra.desktop";
pub const SHELL_DATA_SCHEMA_VERSION: u32 = 1;
pub const RUNTIME_DATA_SCHEMA_NAME: &str = "lyra.runtime";
pub const RUNTIME_DATA_SCHEMA_VERSION: u32 = 1;
pub const DAEMON_CAPABILITIES: &[&str] = &["agent.import.v2", "lsp.upsert", "files.read_home"];
pub const PRIMARY_HOST_EXISTS_CODE: &str = "RUNTIME_PRIMARY_HOST_EXISTS";
// Byte cap for one response frame. The desktop runtime client enforces the
// hard transport limit at 8 MiB (apps/desktop/src/main/runtime-client.ts
// MAX_RUNTIME_FRAME_BYTES) and destroys the connection above it, so hosts must
// keep responses under this softer limit and fail the single request with
// RUNTIME_RESPONSE_TOO_LARGE instead of poisoning the bridge.
pub const RUNTIME_MAX_RESPONSE_FRAME_BYTES: usize = 7 * 1024 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RuntimeEnvelope {
    Request {
        id: String,
        method: String,
        payload: Value,
    },
    Response {
        id: String,
        ok: bool,
        result: Option<Value>,
        error: Option<RuntimeError>,
    },
    Event {
        event: String,
        payload: Value,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeConnectionRole {
    PrimaryHost,
    AuxiliaryClient,
}

pub type RuntimeDataSchemas = BTreeMap<String, u32>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeHelloV2Request {
    pub protocol_min_version: u32,
    pub protocol_max_version: u32,
    pub client_name: String,
    pub component_version: String,
    pub build_id: String,
    pub host_api_version: String,
    pub capabilities: Vec<String>,
    pub data_schemas: RuntimeDataSchemas,
    pub connection_role: RuntimeConnectionRole,
    pub connection_lease_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeHelloV2Response {
    pub protocol_min_version: u32,
    pub protocol_max_version: u32,
    pub negotiated_protocol_version: u32,
    pub server_name: String,
    pub component_version: String,
    pub build_id: String,
    pub host_api_version: String,
    pub capabilities: Vec<String>,
    pub data_schemas: RuntimeDataSchemas,
    pub connection_role: RuntimeConnectionRole,
    pub connection_lease_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityBridgePayload {
    pub request_json: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityBridgeResult {
    pub response_json: String,
}

pub fn is_runtime_shell_handshake(request: &RuntimeHelloV2Request) -> bool {
    request.protocol_min_version == PROTOCOL_MIN_VERSION
        && request.protocol_max_version == PROTOCOL_MAX_VERSION
        && request.connection_role == SHELL_CONNECTION_ROLE
        && request.host_api_version == HOST_API_VERSION
        && request
            .capabilities
            .iter()
            .any(|capability| capability == SHELL_CAPABILITY_HOST_REQUESTS)
        && request.data_schemas.get(SHELL_DATA_SCHEMA_NAME) == Some(&SHELL_DATA_SCHEMA_VERSION)
}

impl RuntimeError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    pub fn with_details(
        code: impl Into<String>,
        message: impl Into<String>,
        details: Value,
    ) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: Some(details),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn runtime_error_serializes_optional_details() {
        let error = RuntimeError::with_details(
            "cancelled",
            "turn cancelled",
            json!({ "sessionId": "session-1" }),
        );
        let value = serde_json::to_value(error).expect("serialize");
        assert_eq!(value["code"], "cancelled");
        assert_eq!(value["details"]["sessionId"], "session-1");
    }

    #[test]
    fn primary_host_hello_with_host_requests_is_a_shell_handshake() {
        let request = RuntimeHelloV2Request {
            protocol_min_version: PROTOCOL_MIN_VERSION,
            protocol_max_version: PROTOCOL_MAX_VERSION,
            client_name: "lyra-desktop".to_string(),
            component_version: "0.1.0".to_string(),
            build_id: "test-build".to_string(),
            host_api_version: HOST_API_VERSION.to_string(),
            capabilities: vec![SHELL_CAPABILITY_HOST_REQUESTS.to_string()],
            data_schemas: [(
                SHELL_DATA_SCHEMA_NAME.to_string(),
                SHELL_DATA_SCHEMA_VERSION,
            )]
            .into(),
            connection_role: SHELL_CONNECTION_ROLE,
            connection_lease_id: "lease-1".to_string(),
        };
        assert!(is_runtime_shell_handshake(&request));
        assert_eq!(
            serde_json::to_value(&request.connection_role).expect("role"),
            json!("primaryHost")
        );
    }

    #[test]
    fn auxiliary_cli_hello_is_not_a_shell_handshake() {
        let request = RuntimeHelloV2Request {
            protocol_min_version: PROTOCOL_MIN_VERSION,
            protocol_max_version: PROTOCOL_MAX_VERSION,
            client_name: "lyra-cli".to_string(),
            component_version: "0.1.0".to_string(),
            build_id: "test-build".to_string(),
            host_api_version: HOST_API_VERSION.to_string(),
            capabilities: Vec::new(),
            data_schemas: Default::default(),
            connection_role: AUXILIARY_CONNECTION_ROLE,
            connection_lease_id: "cli-lease".to_string(),
        };
        assert!(!is_runtime_shell_handshake(&request));
        assert_eq!(
            serde_json::to_value(&request.connection_role).expect("role"),
            json!("auxiliaryClient")
        );
    }
}
