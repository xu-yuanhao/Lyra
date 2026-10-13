use crate::{
    AgentRuntimeError, ProviderFailure, ProviderFailureCategory, ProviderProtocolFailureKind,
    native_backend::NativeProviderProfile,
};

pub(crate) fn unknown_route_error(route_id: &str) -> AgentRuntimeError {
    AgentRuntimeError::Core(format!("unknown provider route `{route_id}`"))
}

pub(crate) fn protocol_error(
    kind: ProviderProtocolFailureKind,
    detail: impl Into<String>,
) -> AgentRuntimeError {
    AgentRuntimeError::ProviderProtocol {
        kind,
        detail: detail.into(),
    }
}

pub(crate) fn configuration_error(
    provider: &NativeProviderProfile,
    message: impl Into<String>,
) -> AgentRuntimeError {
    AgentRuntimeError::ProviderFailure {
        failure: ProviderFailure {
            provider_id: provider.id.clone(),
            route_id: provider.route_id.clone(),
            http_status: None,
            provider_code: Some("provider_not_configured".to_string()),
            provider_type: None,
            retry_after_ms: None,
            category: ProviderFailureCategory::Configuration,
            message: message.into(),
            body_preview: None,
        },
    }
}

/// Stream errors and HTTP errors carry the same provider failure semantics.
/// A stream's HTTP 200 is not evidence that an overloaded event is terminal.
pub(crate) fn stream_error(protocol: &str, envelope: &serde_json::Value) -> AgentRuntimeError {
    let error = envelope.get("error").unwrap_or(envelope);
    let kind = error
        .get("type")
        .and_then(serde_json::Value::as_str)
        .or_else(|| error.get("code").and_then(serde_json::Value::as_str))
        .or_else(|| error.get("status").and_then(serde_json::Value::as_str))
        .unwrap_or_default();
    let status = match kind.to_ascii_lowercase().as_str() {
        "overloaded_error" => Some(529),
        "api_error" | "internal_server_error" | "server_error" => Some(500),
        "unavailable" => Some(503),
        "rate_limit_error" | "rate_limit_exceeded" | "resource_exhausted" => Some(429),
        "timeout_error" | "request_timeout" | "deadline_exceeded" => Some(408),
        "authentication_error" => Some(401),
        "permission_error" => Some(403),
        "invalid_request_error" => Some(400),
        _ => error
            .get("status")
            .and_then(serde_json::Value::as_u64)
            .or_else(|| error.get("code").and_then(serde_json::Value::as_u64))
            .and_then(|status| u16::try_from(status).ok()),
    };
    let category = crate::native_backend::provider::classify_provider_failure(
        status,
        error.get("code").and_then(serde_json::Value::as_str),
        (!kind.is_empty()).then_some(kind),
        error.get("message").and_then(serde_json::Value::as_str),
    );
    AgentRuntimeError::ProviderFailure {
        failure: ProviderFailure {
            provider_id: String::new(),
            route_id: protocol.to_string(),
            http_status: status,
            provider_code: error
                .get("code")
                .and_then(serde_json::Value::as_str)
                .map(str::to_string),
            provider_type: (!kind.is_empty()).then(|| kind.to_string()),
            retry_after_ms: None,
            category,
            message: error
                .get("message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("Provider stream error")
                .to_string(),
            body_preview: None,
        },
    }
}

#[cfg(test)]
mod stream_error_tests {
    use super::*;
    #[test]
    fn overloaded_streams_and_request_timeouts_have_retryable_http_semantics() {
        for (error, expected) in [
            (
                serde_json::json!({"type":"overloaded_error", "message":"Overloaded"}),
                ProviderFailureCategory::Server,
            ),
            (
                serde_json::json!({"type":"rate_limit_error"}),
                ProviderFailureCategory::RateLimit,
            ),
            (
                serde_json::json!({"type":"timeout_error"}),
                ProviderFailureCategory::Server,
            ),
            (
                serde_json::json!({"code":503, "status":"UNAVAILABLE"}),
                ProviderFailureCategory::Server,
            ),
            (
                serde_json::json!({"type":"authentication_error"}),
                ProviderFailureCategory::Authentication,
            ),
        ] {
            let failure = stream_error("anthropic_messages", &error);
            assert!(
                matches!(&failure, AgentRuntimeError::ProviderFailure { failure } if failure.category == expected)
            );
            assert_eq!(
                crate::native_backend::provider::is_retryable_provider_error(&failure),
                matches!(
                    expected,
                    ProviderFailureCategory::Server | ProviderFailureCategory::RateLimit
                )
            );
        }
        assert_eq!(
            crate::native_backend::provider::classify_provider_failure(Some(408), None, None, None),
            ProviderFailureCategory::Server
        );
    }
}
