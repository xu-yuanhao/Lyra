pub mod agent_event;
pub mod archive_service;
pub mod browser_service;
pub mod clarification_service;
pub mod context_builder;

pub mod event_bus;
pub mod event_mapper;
pub mod follow_service;
pub mod git_runtime;
pub mod memory_service;
pub mod native_backend;
pub mod permission_service;
pub mod persona;
pub mod prompt_contract;
pub mod prompt_policy;
mod prompt_templates;
pub mod protocol_contract;
pub mod provider_service;
mod recovering_mutex;
pub mod recovery_service;
pub mod retention_policy;
pub mod session_service;
pub mod software_service;
pub mod todo_service;
pub mod tool_activity_service;
pub mod turn_runner;

use lyra_agent_plugins::SkillRegistry;
use serde_json::Value;
use std::sync::{Arc, OnceLock};
use thiserror::Error;

pub use native_backend::LyraAgentBackend;

pub async fn run_exec_tool(payload: Value) -> Value {
    native_backend::tools::run_exec_tool(payload).await
}

pub fn call_registered_host_capability(method: &str, payload: Value) -> Result<Value, String> {
    runtime_backend().call_host_capability(method, payload)
}

pub fn relay_runtime_event(event_json: String) {
    native_backend::relay_runtime_event(event_json);
}

pub type EventCallback = dyn Fn(String) + Send + Sync + 'static;
pub type HostCapabilityDispatcher =
    dyn Fn(String, String) -> Result<String, String> + Send + Sync + 'static;

pub trait AgentRuntimeBackend: Send + Sync {
    fn call_agent_method(&self, method: &str, payload: Value) -> AgentRuntimeResult<Value>;

    fn register_event_callback(&self, callback: Arc<EventCallback>);

    fn clear_event_callback(&self);

    fn register_host_capability_dispatcher(&self, dispatcher: Arc<HostCapabilityDispatcher>);

    fn clear_host_capability_dispatcher(&self);

    fn call_host_capability(&self, method: &str, payload: Value) -> Result<Value, String>;
}

#[derive(Clone)]
pub struct BackendHandle(Arc<dyn AgentRuntimeBackend>);

impl BackendHandle {
    pub fn new(backend: Arc<dyn AgentRuntimeBackend>) -> Self {
        Self(backend)
    }

    pub fn call(&self, method: &str, payload: Value) -> AgentRuntimeResult<Value> {
        self.0.call_agent_method(method, payload)
    }

    pub fn register_event_callback(&self, callback: Arc<EventCallback>) {
        self.0.register_event_callback(callback);
    }

    pub fn clear_event_callback(&self) {
        self.0.clear_event_callback();
    }

    pub fn register_host_capability_dispatcher(&self, dispatcher: Arc<HostCapabilityDispatcher>) {
        self.0.register_host_capability_dispatcher(dispatcher);
    }

    pub fn clear_host_capability_dispatcher(&self) {
        self.0.clear_host_capability_dispatcher();
    }

    pub fn call_host_capability(&self, method: &str, payload: Value) -> Result<Value, String> {
        self.0.call_host_capability(method, payload)
    }
}

impl Default for BackendHandle {
    fn default() -> Self {
        runtime_backend()
    }
}

impl std::fmt::Debug for BackendHandle {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("BackendHandle(..)")
    }
}

static RUNTIME_BACKEND: OnceLock<BackendHandle> = OnceLock::new();
static DEFAULT_BACKEND: OnceLock<BackendHandle> = OnceLock::new();

pub fn set_runtime_backend(backend: Arc<dyn AgentRuntimeBackend>) {
    let _ = RUNTIME_BACKEND.set(BackendHandle::new(backend));
}

pub fn clear_runtime_backend() {
    let _ = native_backend::flush_state();
}

fn runtime_backend() -> BackendHandle {
    RUNTIME_BACKEND.get().cloned().unwrap_or_else(|| {
        DEFAULT_BACKEND
            .get_or_init(|| BackendHandle::new(Arc::new(LyraAgentBackend)))
            .clone()
    })
}

#[derive(Clone, Debug)]
pub struct AgentRuntimeServices {
    pub session: session_service::SessionService,
    pub turn_runner: turn_runner::TurnRunner,
    pub event_bus: event_bus::RuntimeEventBus,
    pub event_mapper: event_mapper::RuntimeEventMapper,
    pub tool_activity: tool_activity_service::ToolActivityService,
    pub memory: memory_service::MemoryService,
    pub context_builder: context_builder::ContextBuilder,
    pub provider: provider_service::ProviderService,
    pub permission: permission_service::PermissionService,
    pub clarification: clarification_service::ClarificationService,
    pub todo: todo_service::TodoService,
    pub browser: browser_service::BrowserService,
    pub software: software_service::SoftwareService,
    pub follow: follow_service::FollowService,
    pub recovery: recovery_service::RecoveryService,
    pub archive: archive_service::ArchiveService,
    pub skill_registry: SkillRegistry,
    backend: BackendHandle,
}

impl Default for AgentRuntimeServices {
    fn default() -> Self {
        Self::with_backend_handle(runtime_backend())
    }
}

impl AgentRuntimeServices {
    pub fn with_backend(backend: Arc<dyn AgentRuntimeBackend>) -> Self {
        Self::with_backend_handle(BackendHandle::new(backend))
    }

    pub fn with_backend_handle(backend: BackendHandle) -> Self {
        let skill_registry = SkillRegistry::with_builtin_skills();
        Self {
            session: session_service::SessionService::new(backend.clone()),
            turn_runner: turn_runner::TurnRunner::new(backend.clone()),
            event_bus: event_bus::RuntimeEventBus::new(backend.clone()),
            event_mapper: event_mapper::RuntimeEventMapper::default(),
            tool_activity: tool_activity_service::ToolActivityService::with_skill_registry(
                skill_registry.clone(),
            ),
            memory: memory_service::MemoryService::new(backend.clone()),
            context_builder: context_builder::ContextBuilder::with_skill_registry(
                skill_registry.clone(),
            ),
            provider: provider_service::ProviderService::new(backend.clone()),
            permission: permission_service::PermissionService::new(backend.clone()),
            clarification: clarification_service::ClarificationService::new(backend.clone()),
            todo: todo_service::TodoService::default(),
            browser: browser_service::BrowserService::default(),
            software: software_service::SoftwareService::new(backend.clone()),
            follow: follow_service::FollowService::default(),
            recovery: recovery_service::RecoveryService::new(backend.clone()),
            archive: archive_service::ArchiveService::new(backend.clone()),
            skill_registry,
            backend,
        }
    }

    pub fn attach_core_event_bus(&self) {
        self.event_bus.attach_runtime_events();
    }

    pub fn service_names(&self) -> [&'static str; 16] {
        [
            session_service::SessionService::NAME,
            turn_runner::TurnRunner::NAME,
            event_bus::RuntimeEventBus::NAME,
            event_mapper::RuntimeEventMapper::NAME,
            tool_activity_service::ToolActivityService::NAME,
            memory_service::MemoryService::NAME,
            context_builder::ContextBuilder::NAME,
            provider_service::ProviderService::NAME,
            permission_service::PermissionService::NAME,
            clarification_service::ClarificationService::NAME,
            todo_service::TodoService::NAME,
            browser_service::BrowserService::NAME,
            software_service::SoftwareService::NAME,
            follow_service::FollowService::NAME,
            recovery_service::RecoveryService::NAME,
            archive_service::ArchiveService::NAME,
        ]
    }

    pub fn handle_agent_request(&self, method: &str, payload: Value) -> AgentRuntimeResult<Value> {
        match method {
            "agent.session.create" => self.session.create_from_payload(payload),
            "agent.session.read" => self.session.read_from_payload(payload),
            "agent.session.list" => self.session.list_from_payload(payload),
            "agent.session.save" => self.session.save(payload),
            "agent.session.unsave" => self.session.unsave(payload),
            "agent.session.rename" => self.session.rename_from_payload(payload),
            "agent.session.archive" => self.session.archive_from_payload(payload),
            "agent.session.delete" => self.session.delete_from_payload(payload),
            "agent.session.bindProject" => self.session.bind_project_from_payload(payload),
            "agent.session.createTemporary"
            | "agent.session.readWindow"
            | "agent.session.readToolArtifact" => self.backend.call(method, payload),

            "agent.projects.list"
            | "agent.projects.register"
            | "agent.projects.settings"
            | "agent.projects.setOverride" => self.backend.call(method, payload),

            "agent.plan.list"
            | "agent.plan.read"
            | "agent.plan.delete"
            | "agent.plan.revise"
            | "agent.plan.review.respond"
            | "agent.todo.read-project" => self.backend.call(method, payload),

            "agent.cli.follow.read" | "agent.cli.follow.update" => {
                self.backend.call(method, payload)
            }

            "agent.turn.send" | "agent.turn.start" | "agent.turn.resume" => {
                self.turn_runner.send(payload)
            }
            "agent.turn.cancel" => self.turn_runner.cancel_from_payload(payload),
            "agent.memory.snapshot" => self.memory.snapshot_from_payload(payload),
            "agent.memory.audit" => self.memory.audit(payload),
            "agent.memory.recover.run" => self.memory.recover(payload),
            "agent.memory.longterm.create"
            | "agent.memory.longterm.search"
            | "agent.memory.longterm.update"
            | "agent.memory.longterm.forget"
            | "agent.memory.longterm.list"
            | "agent.memory.longterm.link"
            | "agent.memory.longterm.rebuildIndex"
            | "agent.memory.longterm.cleanupCandidates"
            | "agent.memory.candidates.review"
            | "agent.memory.candidates.apply"
            | "agent.memory.candidates.reject"
            | "agent.memory.explainInjection" => self.backend.call(method, payload),
            "agent.memory.shared.search" => self.memory.search_shared_from_payload(payload),
            "agent.memory.shared.update" => self.memory.write_shared_from_payload(payload),
            "agent.memory.frozen.search" => self.memory.search_frozen(payload),
            "agent.memory.frozen.create" => self.memory.create_frozen(payload),
            "agent.memory.frozen.update" => self.memory.update_frozen(payload),
            "agent.memory.frozen.forget" => self.memory.forget_frozen(payload),
            "agent.memory.layers.describe" => self.memory.describe_layers(payload),
            "agent.memory.exportAudit" => self.memory.export_audit(payload),
            "agent.memory.exportLayerProjections" => self.memory.export_layer_projections(payload),
            "agent.skills.list"
            | "agent.skills.inspect"
            | "agent.skills.activate"
            | "agent.skills.deactivate"
            | "agent.skills.installFromLocal"
            | "agent.skills.installFromGit"
            | "agent.skills.installFromStore"
            | "agent.skills.uninstall"
            | "agent.skills.refreshStore"
            | "agent.skills.updateStoreConfig"
            | "agent.mcp.list"
            | "agent.mcp.setEnabled"
            | "agent.mcp.upsert"
            | "agent.mcp.remove"
            | "agent.mcp.connect"
            | "agent.mcp.disconnect"
            | "agent.mcp.reload"
            | "agent.mcp.discoverTools"
            | "agent.mcp.inspectTool"
            | "agent.mcp.executeTool"
            | "agent.import.listSources"
            | "agent.import.getPreferences"
            | "agent.import.setPreferences"
            | "agent.import.detect"
            | "agent.import.sync"
            | "agent.usage.read" => self.backend.call(method, payload),
            "agent.provider.profile.saveAndDiscover" => self.backend.call(method, payload),
            "agent.models.updateCapabilities" => self.backend.call(method, payload),
            "agent.rollback.preview" => self.backend.call(method, payload),
            "agent.message.resolve" => self.backend.call(method, payload),
            "agent.rollback.restore" => self.backend.call(method, payload),
            "agent.git.status" => call_json(git_runtime::git_status_json, payload),
            "agent.git.diff" => call_json(git_runtime::git_diff_json, payload),
            "agent.git.stage" => call_json(git_runtime::git_stage_json, payload),
            "agent.git.unstage" => call_json(git_runtime::git_unstage_json, payload),
            "agent.git.discard" => call_json(git_runtime::git_discard_json, payload),
            "agent.permission.respond" => self.permission.respond_from_payload(payload),
            "agent.permissionPolicy.read" | "agent.permissionPolicy.setMode" => {
                self.backend.call(method, payload)
            }
            "agent.elevation.validate"
            | "agent.elevation.setSecret"
            | "agent.elevation.clear"
            | "agent.elevation.status" => self.backend.call(method, payload),
            "agent.clarification.respond" => self.clarification.respond_from_payload(payload),
            "agent.userGate.list"
            | "agent.userGate.resolve"
            | "agent.userGate.cancel"
            | "agent.userGate.touchActivity"
            | "agent.userGate.autoResolve" => self.backend.call(method, payload),
            method if self.provider.handles_method(method) => self
                .provider
                .handle_agent_request(method, payload)
                .expect("provider service handles its declared methods"),
            "agent.action.poke" => self.backend.call(method, payload),

            "agent.proactive.list" => self.backend.call(method, payload),
            "agent.proactive.dismiss" => self.backend.call(method, payload),
            "agent.proactive.openSession" => self.backend.call(method, payload),

            "agent.protocol.contract" => Ok(protocol_contract::current_protocol_contract_json()),

            _ => Err(AgentRuntimeError::UnknownMethod(method.to_string())),
        }
    }
}

/// Structured category of a provider transport failure.
///
/// The category is derived at the source from the typed HTTP/IO error
/// (reqwest's `is_timeout`/`is_connect`/`is_decode`/`is_body` predicates), never
/// by matching on the error's message text. Downstream classification (retry,
/// fallback, surfacing) pattern-matches on this type instead of re-parsing a
/// string, so it stays correct across reqwest versions and wording changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderTransportKind {
    /// The connection could not be established (DNS, TCP, or TLS handshake).
    Connect,
    /// The request or response exceeded its time budget.
    Timeout,
    /// The connection dropped or the response body failed to transfer/decode
    /// mid-flight, including an SSE stream that ended before completion. This is
    /// reqwest's "error decoding response body" / "connection closed" family.
    StreamInterrupted,
    /// A transport failure that doesn't fit the categories above.
    Other,
}

impl std::fmt::Display for ProviderTransportKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            ProviderTransportKind::Connect => "connect",
            ProviderTransportKind::Timeout => "timeout",
            ProviderTransportKind::StreamInterrupted => "stream interrupted",
            ProviderTransportKind::Other => "transport",
        })
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderFailureCategory {
    Configuration,
    Authentication,
    Authorization,
    Quota,
    RateLimit,
    Server,
    ContextLimit,
    Capability,
    ContentPolicy,
    InvalidRequest,
    NotFound,
    EmptyResponse,
    MalformedResponse,
    Unknown,
}

impl std::fmt::Display for ProviderFailureCategory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            ProviderFailureCategory::Configuration => "configuration",
            ProviderFailureCategory::Authentication => "authentication",
            ProviderFailureCategory::Authorization => "authorization",
            ProviderFailureCategory::Quota => "quota",
            ProviderFailureCategory::RateLimit => "rate limit",
            ProviderFailureCategory::Server => "server",
            ProviderFailureCategory::ContextLimit => "context limit",
            ProviderFailureCategory::Capability => "capability",
            ProviderFailureCategory::ContentPolicy => "content policy",
            ProviderFailureCategory::InvalidRequest => "invalid request",
            ProviderFailureCategory::NotFound => "not found",
            ProviderFailureCategory::EmptyResponse => "empty response",
            ProviderFailureCategory::MalformedResponse => "malformed response",
            ProviderFailureCategory::Unknown => "unknown",
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderFailure {
    pub provider_id: String,
    pub route_id: String,
    pub http_status: Option<u16>,
    pub provider_code: Option<String>,
    pub provider_type: Option<String>,
    pub retry_after_ms: Option<u64>,
    pub category: ProviderFailureCategory,
    pub message: String,
    pub body_preview: Option<String>,
}

impl std::fmt::Display for ProviderFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "provider `{}` failed ({})",
            self.provider_id, self.category
        )?;
        if let Some(status) = self.http_status {
            write!(f, " with HTTP {status}")?;
        }
        if let Some(code) = self.provider_code.as_deref() {
            write!(f, " code `{code}`")?;
        }
        if let Some(provider_type) = self.provider_type.as_deref() {
            write!(f, " type `{provider_type}`")?;
        }
        if !self.message.trim().is_empty() {
            write!(f, ": {}", self.message)?;
        }
        if let Some(preview) = self
            .body_preview
            .as_deref()
            .map(str::trim)
            .filter(|preview| !preview.is_empty())
        {
            write!(f, " (body preview: {preview})")?;
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderProtocolFailureKind {
    ProviderErrorEnvelope,
    ContentBlocked,
    TextualToolProtocolLeak,
    ToolPayloadLeak,
    EmptyAssistantResponse,
    ReasoningOnlyResponse,
    IncompleteToolCall,
}

impl std::fmt::Display for ProviderProtocolFailureKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            ProviderProtocolFailureKind::ProviderErrorEnvelope => "provider error envelope",
            ProviderProtocolFailureKind::ContentBlocked => "content blocked",
            ProviderProtocolFailureKind::TextualToolProtocolLeak => "textual tool protocol leak",
            ProviderProtocolFailureKind::ToolPayloadLeak => "tool payload leak",
            ProviderProtocolFailureKind::EmptyAssistantResponse => "empty assistant response",
            ProviderProtocolFailureKind::ReasoningOnlyResponse => "reasoning-only response",
            ProviderProtocolFailureKind::IncompleteToolCall => "incomplete tool call",
        })
    }
}

#[derive(Debug, Error)]
pub enum AgentRuntimeError {
    #[error("turn cancelled")]
    Cancelled,
    #[error("agent core failed: {0}")]
    Core(String),
    #[error("{failure}")]
    ProviderFailure { failure: ProviderFailure },
    #[error("provider protocol failed ({kind}): {detail}")]
    ProviderProtocol {
        kind: ProviderProtocolFailureKind,
        detail: String,
    },
    #[error("provider transport failed ({kind}): {detail}")]
    ProviderTransport {
        kind: ProviderTransportKind,
        detail: String,
    },
    #[error("agent runtime backend is not registered for method: {0}")]
    BackendUnavailable(String),
    #[error("agent runtime serialization failed: {0}")]
    Serialization(String),
    #[error("agent host capability failed: {0}")]
    HostCapability(String),
    #[error("unknown agent runtime method: {0}")]
    UnknownMethod(String),
}

pub type AgentRuntimeResult<T> = Result<T, AgentRuntimeError>;

pub(crate) fn call_json<E>(
    call: impl FnOnce(String) -> Result<String, E>,
    payload: Value,
) -> AgentRuntimeResult<Value>
where
    E: std::fmt::Display,
{
    let payload = serde_json::to_string(&payload)
        .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))?;
    let output = call(payload).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    serde_json::from_str(&output)
        .map_err(|error| AgentRuntimeError::Serialization(error.to_string()))
}

pub fn register_runtime_event_callback(callback: std::sync::Arc<EventCallback>) {
    runtime_backend().register_event_callback(callback);
}

pub fn clear_runtime_event_callback() {
    runtime_backend().clear_event_callback();
}

pub fn register_host_capability_dispatcher(dispatcher: std::sync::Arc<HostCapabilityDispatcher>) {
    runtime_backend().register_host_capability_dispatcher(dispatcher);
}

pub fn clear_host_capability_dispatcher() {
    runtime_backend().clear_host_capability_dispatcher();
}

#[cfg(test)]
mod tests {
    use super::{
        AgentRuntimeBackend, AgentRuntimeError, AgentRuntimeResult, AgentRuntimeServices,
        EventCallback, HostCapabilityDispatcher,
    };
    use serde_json::{Value, json};
    use std::sync::Arc;

    struct EchoBackend;

    impl AgentRuntimeBackend for EchoBackend {
        fn call_agent_method(&self, method: &str, payload: Value) -> AgentRuntimeResult<Value> {
            Ok(json!({
                "method": method,
                "payload": payload,
            }))
        }

        fn register_event_callback(&self, _callback: Arc<EventCallback>) {}

        fn clear_event_callback(&self) {}

        fn register_host_capability_dispatcher(&self, _dispatcher: Arc<HostCapabilityDispatcher>) {}

        fn clear_host_capability_dispatcher(&self) {}

        fn call_host_capability(&self, method: &str, _payload: Value) -> Result<Value, String> {
            Err(format!("unexpected host capability call: {method}"))
        }
    }

    #[test]
    fn runtime_declares_expected_services() {
        let names = AgentRuntimeServices::default().service_names();
        assert_eq!(names.len(), 16);
        assert!(names.contains(&"session_service"));
        assert!(names.contains(&"turn_runner"));
        assert!(names.contains(&"event_mapper"));
        assert!(names.contains(&"software_service"));
    }

    #[test]
    fn runtime_services_can_attach_and_collect_core_events() {
        let services = AgentRuntimeServices::default();
        services.attach_core_event_bus();
        services
            .event_bus
            .publish_raw(r#"{"kind":"turnStarted","sessionId":"s","turnId":"t"}"#);
        let events = services.event_bus.drain();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0]["kind"], "turnStarted");
    }

    #[test]
    fn runtime_services_route_backend_owned_requests_to_backend() {
        // Regression: handle_agent_request must forward backend-owned methods.
        // They were previously unrouted and surfaced as
        // "unknown agent runtime method: agent.plan.revise" to the desktop.
        let services = AgentRuntimeServices::with_backend(Arc::new(EchoBackend));
        for method in [
            "agent.projects.list",
            "agent.projects.register",
            "agent.projects.settings",
            "agent.projects.setOverride",
            "agent.mcp.setEnabled",
            "agent.plan.list",
            "agent.plan.read",
            "agent.plan.delete",
            "agent.plan.revise",
            "agent.plan.review.respond",
            "agent.todo.read-project",
            "agent.session.createTemporary",
            "agent.session.readWindow",
            "agent.session.readToolArtifact",
            "agent.provider.profile.saveAndDiscover",
            "agent.models.updateCapabilities",
            "agent.import.listSources",
            "agent.import.getPreferences",
            "agent.import.setPreferences",
            "agent.import.detect",
            "agent.import.sync",
            "agent.usage.read",
            "agent.userGate.list",
            "agent.userGate.resolve",
            "agent.userGate.cancel",
            "agent.userGate.touchActivity",
            "agent.userGate.autoResolve",
        ] {
            let routed = services
                .handle_agent_request(method, json!({}))
                .unwrap_or_else(|error| panic!("{method} should be routed: {error:?}"));
            assert_eq!(routed["method"], method);
        }
    }

    #[test]
    fn runtime_services_preserve_project_and_mcp_setting_payloads() {
        let services = AgentRuntimeServices::with_backend(Arc::new(EchoBackend));
        for enabled in [json!(true), json!(false), Value::Null] {
            let payload = json!({
                "projectId": "project-a",
                "kind": "mcp",
                "itemId": "server-a",
                "enabled": enabled,
            });
            let routed = services
                .handle_agent_request("agent.projects.setOverride", payload.clone())
                .expect("project override request should be routed");
            assert_eq!(routed["payload"], payload);
        }
        for enabled in [true, false] {
            let payload = json!({ "serverId": "server-a", "enabled": enabled });
            let routed = services
                .handle_agent_request("agent.mcp.setEnabled", payload.clone())
                .expect("global MCP setting request should be routed");
            assert_eq!(routed["payload"], payload);
        }
    }

    #[test]
    fn runtime_services_reject_unregistered_methods() {
        let services = AgentRuntimeServices::with_backend(Arc::new(EchoBackend));
        for method in ["agent.projects.unknown", "agent.mcp.unknown"] {
            assert!(matches!(
                services.handle_agent_request(method, json!({})),
                Err(AgentRuntimeError::UnknownMethod(name)) if name == method
            ));
        }
    }

    #[test]
    fn runtime_services_route_provider_catalog_requests_through_provider_service() {
        let services = AgentRuntimeServices::default();
        let catalog = services
            .handle_agent_request("agent.provider.catalog.read", json!({}))
            .expect("provider catalog request should be routed");

        assert_eq!(catalog["schemaVersion"], "2026-06-14");
        assert!(
            catalog["routes"]
                .as_array()
                .expect("routes array")
                .iter()
                .any(|entry| entry["id"] == "openai")
        );
    }

    #[test]
    fn runtime_services_route_model_management_requests_through_provider_service() {
        let services = AgentRuntimeServices::with_backend(Arc::new(EchoBackend));

        let enabled = services
            .handle_agent_request(
                "agent.models.enable",
                json!({ "provider": "mimo", "model": "mimo-v2.5-pro", "enabled": false }),
            )
            .expect("model enable request should be routed");
        assert_eq!(enabled["method"], "agent.models.enable");
        assert_eq!(enabled["payload"]["enabled"], false);

        let deleted = services
            .handle_agent_request(
                "agent.models.delete",
                json!({ "provider": "mimo", "model": "mimo-v2.5-pro" }),
            )
            .expect("model delete request should be routed");
        assert_eq!(deleted["method"], "agent.models.delete");
        assert_eq!(deleted["payload"]["provider"], "mimo");
    }
}
