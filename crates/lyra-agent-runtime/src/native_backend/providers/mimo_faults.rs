use crate::{AgentRuntimeError, ProviderFailure, ProviderFailureCategory};

use super::routes::mimo;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum MimoFaultCategory {
    Format,
    Auth,
    Balance,
    Access,
    Vision,
    ContentModeration,
    RateLimit,
    Server,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum MimoFaultAction {
    RetryBackoff,
    RetryImageDowngrade,
    RetryContextCompact,
    NotifyAndFail,
    FailWithGuidance,
}

#[derive(Clone, Debug)]
pub(crate) struct MimoProviderFault {
    pub(crate) http_status: u16,
    pub(crate) code: String,
    pub(crate) category: MimoFaultCategory,
    pub(crate) action: MimoFaultAction,
    pub(crate) notify: bool,
    pub(crate) title_key: String,
    pub(crate) body_key: String,
}

pub(crate) fn parse_mimo_fault_from_error(error: &AgentRuntimeError) -> Option<MimoProviderFault> {
    let AgentRuntimeError::ProviderFailure { failure } = error else {
        return None;
    };
    mimo::is_mimo_route(&failure.route_id).then(|| fault_from_provider_failure(failure))
}

pub(crate) fn mimo_fault_dedupe_key(fault: &MimoProviderFault, provider_id: &str) -> String {
    format!("mimo-fault-{}-{}", fault.http_status, provider_id)
}

pub(crate) fn should_notify_for_mimo_fault(
    fault: &MimoProviderFault,
    transient_retries_exhausted: bool,
) -> bool {
    match fault.action {
        MimoFaultAction::NotifyAndFail => true,
        MimoFaultAction::RetryBackoff if transient_retries_exhausted && fault.notify => true,
        _ => false,
    }
}

pub(crate) fn is_mimo_backoff_fault(fault: &MimoProviderFault) -> bool {
    fault.action == MimoFaultAction::RetryBackoff
}

pub(crate) fn is_mimo_notify_and_fail_fault(fault: &MimoProviderFault) -> bool {
    fault.action == MimoFaultAction::NotifyAndFail
}

fn fault_from_provider_failure(failure: &ProviderFailure) -> MimoProviderFault {
    let status = failure.http_status.unwrap_or_default();
    let code = failure
        .provider_code
        .clone()
        .or_else(|| failure.provider_type.clone())
        .unwrap_or_else(|| status.to_string());
    match failure.category {
        ProviderFailureCategory::ContextLimit => MimoProviderFault {
            http_status: status,
            code: "context_length".to_string(),
            category: MimoFaultCategory::Format,
            action: MimoFaultAction::RetryContextCompact,
            notify: false,
            title_key: "notification.mimoFault400Title".to_string(),
            body_key: "notification.mimoFault400Body".to_string(),
        },
        ProviderFailureCategory::Capability => MimoProviderFault {
            http_status: status,
            code: "image_input_unsupported".to_string(),
            category: MimoFaultCategory::Vision,
            action: MimoFaultAction::RetryImageDowngrade,
            notify: false,
            title_key: "notification.mimoFault404VisionTitle".to_string(),
            body_key: "notification.mimoFault404VisionBody".to_string(),
        },
        ProviderFailureCategory::Authentication => notification_fault(
            status,
            "authentication_failed",
            MimoFaultCategory::Auth,
            "notification.mimoFault401Title",
            "notification.mimoFault401Body",
        ),
        ProviderFailureCategory::Quota => notification_fault(
            status,
            "insufficient_balance",
            MimoFaultCategory::Balance,
            "notification.mimoFault402Title",
            "notification.mimoFault402Body",
        ),
        ProviderFailureCategory::Authorization => notification_fault(
            status,
            "access_denied",
            MimoFaultCategory::Access,
            "notification.mimoFault403Title",
            "notification.mimoFault403Body",
        ),
        ProviderFailureCategory::ContentPolicy => notification_fault(
            status,
            "content_blocked",
            MimoFaultCategory::ContentModeration,
            "notification.mimoFault421Title",
            "notification.mimoFault421Body",
        ),
        ProviderFailureCategory::RateLimit => MimoProviderFault {
            http_status: status,
            code: "rate_limited".to_string(),
            category: MimoFaultCategory::RateLimit,
            action: MimoFaultAction::RetryBackoff,
            notify: true,
            title_key: "notification.mimoFault429Title".to_string(),
            body_key: "notification.mimoFault429Body".to_string(),
        },
        ProviderFailureCategory::Server => MimoProviderFault {
            http_status: status,
            code: "server_error".to_string(),
            category: MimoFaultCategory::Server,
            action: MimoFaultAction::RetryBackoff,
            notify: false,
            title_key: "notification.mimoFault500Title".to_string(),
            body_key: "notification.mimoFault500Body".to_string(),
        },
        _ => MimoProviderFault {
            http_status: status,
            code,
            category: MimoFaultCategory::Format,
            action: MimoFaultAction::FailWithGuidance,
            notify: false,
            title_key: if status == 404 {
                "notification.mimoFault404Title"
            } else {
                "notification.mimoFaultGenericTitle"
            }
            .to_string(),
            body_key: if status == 404 {
                "notification.mimoFault404Body"
            } else {
                "notification.mimoFaultGenericBody"
            }
            .to_string(),
        },
    }
}

fn notification_fault(
    status: u16,
    code: &str,
    category: MimoFaultCategory,
    title_key: &str,
    body_key: &str,
) -> MimoProviderFault {
    MimoProviderFault {
        http_status: status,
        code: code.to_string(),
        category,
        action: MimoFaultAction::NotifyAndFail,
        notify: true,
        title_key: title_key.to_string(),
        body_key: body_key.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn provider_error(category: ProviderFailureCategory, status: u16) -> AgentRuntimeError {
        AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                provider_id: "mimo".to_string(),
                route_id: mimo::PAY_AS_YOU_GO_ROUTE_ID.to_string(),
                http_status: Some(status),
                provider_code: None,
                provider_type: None,
                retry_after_ms: None,
                category,
                message: "provider failure".to_string(),
                body_preview: None,
            },
        }
    }

    #[test]
    fn classifies_balance_fault() {
        let fault =
            parse_mimo_fault_from_error(&provider_error(ProviderFailureCategory::Quota, 402))
                .expect("fault");
        assert_eq!(fault.category, MimoFaultCategory::Balance);
        assert_eq!(fault.action, MimoFaultAction::NotifyAndFail);
        assert!(fault.notify);
    }

    #[test]
    fn classifies_capability_failure_as_downgrade() {
        let fault =
            parse_mimo_fault_from_error(&provider_error(ProviderFailureCategory::Capability, 400))
                .expect("fault");
        assert_eq!(fault.action, MimoFaultAction::RetryImageDowngrade);
    }

    #[test]
    fn classifies_rate_limit_as_backoff() {
        let fault =
            parse_mimo_fault_from_error(&provider_error(ProviderFailureCategory::RateLimit, 429))
                .expect("fault");
        assert_eq!(fault.action, MimoFaultAction::RetryBackoff);
    }
}
