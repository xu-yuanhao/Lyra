use std::sync::Arc;

use async_trait::async_trait;
use lyra_agent_api::{AgentToolCapabilityRef, AgentToolResult, AgentToolStatus};
use lyra_agent_plugins::{
    McpToolProvider, SkillRegistry, SkillToolProvider, ToolCapability, ToolExposureMode,
    ToolProvider, ToolProviderRegistry,
};
use serde_json::{Value, json};

#[derive(Clone)]
pub struct ToolActivityService {
    registry: ToolProviderRegistry,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ModelToolExposureMode {
    Direct,
    Discoverable,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ModelToolDescriptor {
    pub name: String,
    pub description: String,
    pub schema: Value,
    pub risk_level: String,
    pub permission_policy: String,
    pub capability_ref: AgentToolCapabilityRef,
    pub exposure_mode: ModelToolExposureMode,
}

impl std::fmt::Debug for ToolActivityService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ToolActivityService")
            .field("capability_count", &self.registry.capabilities().len())
            .finish()
    }
}

impl Default for ToolActivityService {
    fn default() -> Self {
        Self::with_skill_registry(SkillRegistry::with_builtin_skills())
    }
}

impl ToolActivityService {
    pub fn with_skill_registry(skill_registry: SkillRegistry) -> Self {
        let registry = ToolProviderRegistry::default();
        registry.register(Arc::new(BuiltInLyraToolProvider));
        registry.register(Arc::new(McpToolProvider::default()));
        registry.register(Arc::new(SkillToolProvider::new(skill_registry)));
        Self { registry }
    }
}

impl ToolActivityService {
    pub const NAME: &'static str = "tool_activity_service";

    pub fn register_provider(&self, provider: Arc<dyn ToolProvider>) {
        self.registry.register(provider);
    }

    pub fn capabilities(&self) -> Vec<ToolCapability> {
        self.registry.capabilities()
    }

    pub fn model_tool_descriptors(&self) -> Vec<ModelToolDescriptor> {
        self.capabilities()
            .into_iter()
            .map(|capability| ModelToolDescriptor {
                name: capability.reference.tool_name.clone(),
                description: capability.description,
                schema: capability.schema,
                risk_level: capability.risk_level,
                permission_policy: capability.permission_policy,
                capability_ref: capability.reference,
                exposure_mode: model_exposure_mode(&capability.exposure_mode),
            })
            .collect()
    }

    pub fn model_tool_names(&self) -> Vec<String> {
        vec!["ToolSearch".to_string()]
    }

    pub fn model_provider_tools(&self) -> Vec<Value> {
        tool_fs_provider_tools()
    }

    pub fn can_dispatch_model_tool(&self, name: &str) -> bool {
        self.model_tool_descriptors()
            .iter()
            .any(|descriptor| descriptor.name == name)
    }

    pub fn capability_ref_for_model_tool(&self, name: &str) -> Option<AgentToolCapabilityRef> {
        self.capabilities()
            .into_iter()
            .find(|capability| capability.reference.tool_name == name)
            .map(|capability| capability.reference)
    }

    pub fn project_result(
        &self,
        name: String,
        result: lyra_agent_api::AgentToolResult,
    ) -> lyra_agent_api::AgentToolActivity {
        lyra_agent_api::AgentToolActivity {
            id: result.tool_call_id,
            name: name.clone(),
            label: name,
            status: result.status,
            input: None,
            output: result.output,
            started_at: String::new(),
            finished_at: None,
        }
    }

    pub fn built_in_capabilities(&self) -> Value {
        json!({
            "tools": self.capabilities().into_iter().map(tool_capability_json).collect::<Vec<_>>()
        })
    }

    pub fn cli_capabilities(&self) -> Value {
        json!({
            "tools": self.capabilities().into_iter().map(|capability| {
                let host_unavailable = capability.required_host_capability.is_some();
                let mut value = tool_capability_json(capability);
                value["available"] = Value::Bool(!host_unavailable);
                if host_unavailable {
                    value["unavailableReason"] = Value::String(
                        "Host capability bridge is not available in CLI mode.".to_string(),
                    );
                }
                value
            }).collect::<Vec<_>>()
        })
    }
}

struct BuiltInLyraToolProvider;

#[async_trait]
impl ToolProvider for BuiltInLyraToolProvider {
    fn id(&self) -> &str {
        "lyra-core"
    }

    fn capabilities(&self) -> Vec<ToolCapability> {
        vec![
            capability(
                "lyra-memory",
                "memory_search",
                "Search Lyra long-term shared memory. Omit query or pass an empty query to list summaries.",
                "read",
                "always",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string", "description": "Search text. Omit or leave empty to list summaries instead of ranking." },
                        "scope": { "type": "string" },
                        "category": { "type": "string" },
                        "status": { "type": "string", "enum": ["active", "archived", "superseded", "forgotten"] },
                        "includeArchived": { "type": "boolean", "default": false },
                        "includeRelated": { "type": "boolean" },
                        "explain": { "type": "boolean", "default": true },
                        "minScore": { "type": "number", "minimum": 0 },
                        "limit": { "type": "integer", "minimum": 1, "maximum": 500 },
                        "offset": { "type": "integer", "minimum": 0 }
                    }
                }),
                None,
            ),
            capability(
                "lyra-memory",
                "memory_write",
                "Remember, update, forget, or link durable Lyra long-term memory. Set action to remember, update, forget, or link.",
                "state",
                "runtimePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "action": {
                            "type": "string",
                            "enum": ["remember", "update", "forget", "link"]
                        },
                        "fact": { "type": "string" },
                        "id": { "type": "string" },
                        "ids": { "type": "array", "items": { "type": "string" } },
                        "content": { "type": "object" },
                        "scope": { "type": "string", "default": "global" },
                        "category": {
                            "type": "string",
                            "enum": ["user_profile", "preference", "project", "instruction", "goal", "other"],
                            "default": "other"
                        },
                        "confidence": { "type": "number", "minimum": 0, "maximum": 1 },
                        "sourceType": {
                            "type": "string",
                            "enum": ["user_declaration", "agent_inference", "tool_observation", "project_fact", "goal_sync", "imported"],
                            "default": "agent_inference"
                        },
                        "sourceRef": { "type": "string" },
                        "tags": { "type": "array", "items": { "type": "string" } },
                        "expiresAt": { "type": "string" },
                        "status": { "type": "string", "enum": ["active", "archived", "superseded", "forgotten"] },
                        "supersedes": { "type": "string" },
                        "supersededBy": { "type": "string" },
                        "mode": { "type": "string", "enum": ["archive", "tombstone", "hard_delete"], "default": "archive" },
                        "reason": { "type": "string" },
                        "sourceId": { "type": "string" },
                        "targetId": { "type": "string" },
                        "relation": {
                            "type": "string",
                            "enum": ["related_to", "supports", "contradicts", "supersedes", "belongs_to_project", "same_user_preference", "derived_from"],
                            "default": "related_to"
                        }
                    },
                    "required": ["action"]
                }),
                None,
            ),
            capability(
                "lyra-memory",
                "memory_review_candidates",
                "Review pending Lyra memory candidates without mixing them into chat messages.",
                "read",
                "always",
                json!({
                    "type": "object",
                    "properties": {
                        "status": { "type": "string", "enum": ["pending", "auto_applied", "needs_user_confirmation", "approved", "rejected", "expired"], "default": "pending" },
                        "limit": { "type": "integer", "minimum": 1, "maximum": 500 }
                    }
                }),
                None,
            ),
            capability(
                "lyra-memory",
                "memory_apply_candidate",
                "Apply a reviewed Lyra memory candidate.",
                "state",
                "runtimePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" }
                    },
                    "required": ["id"]
                }),
                None,
            ),
            capability(
                "lyra-memory",
                "memory_reject_candidate",
                "Reject a Lyra memory candidate.",
                "state",
                "runtimePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "id": { "type": "string" },
                        "reason": { "type": "string" }
                    },
                    "required": ["id"]
                }),
                None,
            ),
            capability(
                "lyra-memory",
                "memory_explain_injection",
                "Explain which long-term memories were injected for the current or requested turn and why.",
                "read",
                "always",
                json!({
                    "type": "object",
                    "properties": {
                        "sessionId": { "type": "string" },
                        "turnId": { "type": "string" }
                    }
                }),
                None,
            ),
            capability(
                "lyra-clarification",
                "ask_user",
                "Ask the user a structured clarification question through Lyra's decision panel.",
                "state",
                "runtimePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "question": { "type": "string" },
                        "options": { "type": "array", "items": { "type": "object" } },
                        "allowCustomAnswer": { "type": "boolean", "default": true },
                        "detail": { "type": "string" }
                    },
                    "required": ["question"]
                }),
                None,
            ),
            capability(
                "lyra-workbench",
                "workbench_list_tabs",
                "List Lyra workbench tabs, including browser, file, image, terminal, and other app tabs.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "scope": { "type": "string", "enum": ["all", "visible", "active"], "default": "all" },
                        "includeUnsupported": { "type": "boolean", "default": true }
                    }
                }),
                Some("workbench.listTabs"),
            ),
            capability(
                "lyra-workbench",
                "workbench_read_workspace",
                "Read the currently visible Lyra workspace state.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "detail": { "type": "string", "enum": ["summary", "full"], "default": "summary" }
                    }
                }),
                Some("workbench.readWorkspace"),
            ),
            capability(
                "lyra-workbench",
                "workbench_read_tab",
                "Read one Lyra workbench tab by id. Use this for non-browser app tabs or tab summaries.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "tabId": { "type": "string" },
                        "detail": { "type": "string", "enum": ["summary", "full"], "default": "summary" }
                    },
                    "required": ["tabId"]
                }),
                Some("workbench.readTab"),
            ),
            capability(
                "lyra-workbench",
                "workbench_capture_visual_evidence",
                "Capture visible Lyra workspace visual evidence for model vision. Omit args to capture the active browser page when one is showing. Use workspace_window for the Lyra window including BrowserView webpage pixels; use active_tab when a specific browser tab screenshot is needed.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "scope": {
                            "type": "string",
                            "enum": ["workspace_window", "active_tab"],
                            "description": "Omit to capture the visible browser page when a browser tab is active."
                        },
                        "tabId": {
                            "type": "string",
                            "description": "Required only for active_tab capture."
                        }
                    }
                }),
                Some("workbench.captureVisualEvidence"),
            ),
            capability(
                "lyra-workbench",
                "workbench_activate_tab",
                "Activate a Lyra workbench tab by id. This shows an existing workspace tab, including a live browser tab the agent is already operating; it does not create a tab from the composer preview.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "tabId": { "type": "string" }
                    },
                    "required": ["tabId"]
                }),
                Some("workbench.activateTab"),
            ),
            capability(
                "lyra-workbench",
                "workbench_close_tab",
                "Close one Lyra workbench tab by id.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "tabId": { "type": "string" }
                    },
                    "required": ["tabId"]
                }),
                Some("workbench.closeTab"),
            ),
            capability(
                "lyra-workbench",
                "workbench_reorder_tab",
                "Reorder a workbench tab to a new strip index.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "tabId": { "type": "string" },
                        "targetIndex": { "type": "integer", "minimum": 0 }
                    },
                    "required": ["tabId", "targetIndex"]
                }),
                Some("workbench.reorderTab"),
            ),
            capability(
                "lyra-workbench",
                "workbench_split_tabs",
                "Split two workbench tabs into a visible split layout.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "sourceTabId": { "type": "string" },
                        "targetTabId": { "type": "string" }
                    },
                    "required": ["sourceTabId", "targetTabId"]
                }),
                Some("workbench.splitTabs"),
            ),
            capability(
                "lyra-workbench",
                "workbench_detach_split",
                "Detach one tab from the current split layout.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "tabId": { "type": "string" }
                    },
                    "required": ["tabId"]
                }),
                Some("workbench.detachSplit"),
            ),
            capability(
                "lyra-workbench",
                "workbench_list_terminals",
                "List terminal panes in the dock and workspace.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {}
                }),
                Some("workbench.listTerminals"),
            ),
            capability(
                "lyra-workbench",
                "workbench_open_terminal",
                "Open a terminal pane in the dock or workspace, optionally splitting an existing pane.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "placement": { "type": "string", "enum": ["dock", "workspace"], "default": "dock" },
                        "title": { "type": "string" },
                        "cwd": { "type": "string" },
                        "terminalTabId": { "type": "string" },
                        "paneId": { "type": "string" },
                        "splitDirection": { "type": "string", "enum": ["horizontal", "vertical"], "default": "horizontal" }
                    }
                }),
                Some("workbench.openTerminal"),
            ),
            capability(
                "lyra-workbench",
                "workbench_focus_terminal",
                "Focus a terminal pane by session, pane, or terminal tab id.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "sessionId": { "type": "string" },
                        "paneId": { "type": "string" },
                        "terminalTabId": { "type": "string" }
                    }
                }),
                Some("workbench.focusTerminal"),
            ),
            capability(
                "lyra-workbench",
                "workbench_close_terminal",
                "Close a terminal pane by session, pane, or terminal tab id.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "sessionId": { "type": "string" },
                        "paneId": { "type": "string" },
                        "terminalTabId": { "type": "string" }
                    }
                }),
                Some("workbench.closeTerminal"),
            ),
            capability(
                "lyra-workbench",
                "workbench_move_terminal",
                "Move a terminal tab between the dock and workspace.",
                "action",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "terminalTabId": { "type": "string" },
                        "placement": { "type": "string", "enum": ["dock", "workspace"] },
                        "targetIndex": { "type": "integer", "minimum": 0 }
                    },
                    "required": ["terminalTabId", "placement"]
                }),
                Some("workbench.moveTerminal"),
            ),
            capability(
                "lyra-workbench",
                "workbench_extract_tab_text",
                "Extract paginated text from one workbench tab.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "tabId": { "type": "string" },
                        "scope": { "type": "string", "enum": ["main", "full"], "default": "main" },
                        "maxChars": { "type": "integer", "minimum": 1 },
                        "cursor": { "type": "integer", "minimum": 0 },
                        "paneId": { "type": "string" }
                    },
                    "required": ["tabId"]
                }),
                Some("workbench.extractTabText"),
            ),
            capability(
                "lyra-software",
                "software_list_capabilities",
                "List installed Lyra software adapters and their lightweight capabilities.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "includeSchemas": { "type": "boolean", "default": false }
                    }
                }),
                Some("software.listCapabilities"),
            ),
            capability(
                "lyra-software",
                "software_inspect_capability",
                "Inspect one Lyra software adapter capability including full schema and readable state hints.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "softwareId": { "type": "string" },
                        "capabilityId": { "type": "string" }
                    },
                    "required": ["softwareId"]
                }),
                Some("software.inspectCapability"),
            ),
            capability(
                "lyra-software",
                "software_read_state",
                "Read lightweight state from installed Lyra software.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "softwareId": { "type": "string" },
                        "capabilityId": { "type": "string" }
                    }
                }),
                Some("software.readState"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_map",
                "Map the visible surface: the topmost painted control at each viewport point, collapsed by CSS cursor into one operable control. A short page is one payload. A crowded page is this window plus how many controls remain.",
                "hostCapability",
                "hostCapability",
                lumen_target_schema(json!({
                    "timeoutMs": { "type": "number" }
                })),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_read",
                "Read text from a Lyra browser page without relying on screenshot OCR.",
                "read",
                "hostCapability",
                lumen_target_schema(json!({
                    "query": { "type": "string" },
                    "reveal": { "type": "boolean", "default": true },
                    "instruction": { "type": "string" },
                    "schema": { "type": "object" },
                    "maxChars": { "type": "number" }
                })),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_see",
                "Capture a screenshot only when the surface map marks a canvas or cross-origin region with no cursor meaning. Returns device-pixel size and a captureId for lyra_lumen_vact. Do not use this as a second map of ordinary controls.",
                "read",
                "hostCapability",
                lumen_target_schema(json!({
                    "highlightTargets": { "type": "boolean", "default": true },
                    "highlightTargetRefs": {
                        "type": "array",
                        "items": { "type": "string" }
                    },
                    "downsampleForVision": { "type": "boolean", "default": true },
                    "timeoutMs": { "type": "number" }
                })),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_vact",
                "Click a canvas or cross-origin region that the surface map could not name, using device-pixel coordinates from the latest lyra_lumen_see captureId. Ordinary buttons, links, and inputs use lyra_lumen_act with a map targetRef.",
                "hostCapability",
                "runtimePolicy",
                lumen_target_schema(json!({
                    "captureId": { "type": "string" },
                    "point": {
                        "type": "object",
                        "properties": {
                            "x": { "type": "number" },
                            "y": { "type": "number" },
                            "reason": { "type": "string" }
                        },
                        "required": ["x", "y"]
                    },
                    "interaction": { "type": "string", "enum": ["click", "doubleClick", "rightClick", "hover", "drag", "scroll"], "default": "click" },
                    "to": {
                        "type": "object",
                        "properties": {
                            "x": { "type": "number" },
                            "y": { "type": "number" },
                            "reason": { "type": "string" }
                        }
                    },
                    "scrollDy": { "type": "number" },
                    "timeoutMs": { "type": "number" }
                }))
                .with_required(vec!["captureId", "point"]),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_act",
                "Click, double-click, right-click, or hover a Lyra Lumen targetRef or visual fallback point. Prefer targetRef; elementId is observation-local compatibility only. If this turn already opened the page in Lyra's browser, complete the visible click there instead of asking whether a member already finished it.",
                "hostCapability",
                "runtimePolicy",
                canonical_browser_schema("act"),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_type",
                "Type text into a browser editable element. Prefer targetRef from /tools/browser/map; elementId is observation-local compatibility only. If omitted, Lyra uses the current or last confirmed editable target. For segmented verification-code inputs, call this once on the first field with the full code; Lyra splits the characters across fields.",
                "hostCapability",
                "runtimePolicy",
                lumen_target_schema(json!({
                    "elementId": { "type": "number" },
                    "targetRef": { "type": "string" },
                    "text": { "type": "string" },
                    "clear": { "type": "boolean", "default": false },
                    "timeoutMs": { "type": "number" }
                }))
                .with_required(vec!["text"]),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_press",
                "Press a non-text keyboard key in the Lyra browser agent page, such as Enter, Tab, Escape, or Arrow keys. Prefer targetRef when focusing a target first; elementId is observation-local compatibility only. Do not use this for typing text or verification-code characters; call lyra_lumen_type once with the full text instead.",
                "hostCapability",
                "runtimePolicy",
                canonical_browser_schema("press"),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_wait",
                "Wait for browser page loading, text changes, text stability, or text containment.",
                "read",
                "hostCapability",
                lumen_target_schema(json!({
                    "until": { "type": "string", "enum": ["loadIdle", "textChanged", "textStable", "textContains"], "default": "textStable" },
                    "text": { "type": "string" },
                    "timeoutMs": { "type": "number" },
                    "idleMs": { "type": "number" },
                    "maxChars": { "type": "number" }
                })),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_navigate",
                "Navigate a Lyra browser page to a URL. Default live navigation stays in the composer preview until the user clicks it; set newTab true to open it in the workspace immediately, or pass tabId to operate an existing workspace browser tab.",
                "hostCapability",
                "runtimePolicy",
                lumen_target_schema(json!({
                    "url": { "type": "string" },
                    "newTab": { "type": "boolean", "default": false },
                    "timeoutMs": { "type": "number" }
                }))
                .with_required(vec!["url"]),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_detect_qr",
                "Capture the current Lyra browser viewport and detect QR codes without a vision model. Returns device-pixel bounds, decoded payload, optional QR-only crop artifacts, and a vact-compatible captureId. Works through cross-origin iframes because detection runs on the composited screenshot. Use region to scan a blocked iframe/login area first.",
                "read",
                "hostCapability",
                lumen_target_schema(json!({
                    "region": {
                        "type": "object",
                        "properties": {
                            "x": { "type": "number" },
                            "y": { "type": "number" },
                            "width": { "type": "number" },
                            "height": { "type": "number" }
                        },
                        "required": ["x", "y", "width", "height"]
                    },
                    "maxCodes": { "type": "number", "default": 4 },
                    "cropQr": { "type": "boolean", "default": true },
                    "includePageCapture": { "type": "boolean", "default": false },
                    "cropPadding": { "type": "number", "default": 8 },
                    "timeoutMs": { "type": "number" }
                })),
                Some("browser.operate"),
            ),
            capability(
                "lyra-browser",
                "lyra_lumen_elevate",
                "Promote an isolated browser task to a visible Lyra browser tab when user action is required.",
                "hostCapability",
                "runtimePolicy",
                lumen_target_schema_with_default(
                    json!({
                        "reason": { "type": "string" }
                    }),
                    "isolated",
                ),
                Some("browser.operate"),
            ),
            capability(
                "lyra-artifacts",
                "artifact_read",
                "Read a Lyra-owned artifact such as a Lumen screenshot, message image, or tool-output artifact by artifact id, path, source URI, or openTarget path.",
                "read",
                "lyraArtifactReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "artifactId": { "type": "string" },
                        "id": { "type": "string" },
                        "path": { "type": "string" },
                        "source": { "type": "string" },
                        "maxBytes": { "type": "integer", "minimum": 1 },
                        "startLine": { "type": "integer", "minimum": 1 },
                        "endLine": { "type": "integer", "minimum": 1 }
                    }
                }),
                None,
            ),
            capability(
                "lyra-files",
                "file_read",
                "Read a workspace file with optional line range and byte budget.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "startLine": { "type": "integer", "minimum": 1 },
                        "endLine": { "type": "integer", "minimum": 1 },
                        "maxBytes": { "type": "integer", "minimum": 1 },
                        "encoding": { "type": "string", "enum": ["utf-8", "utf8", "lossy-utf8"], "description": "Accepted for compatibility. Invalid UTF-8 bytes are always replaced." }
                    },
                    "required": ["path"]
                }),
                None,
            ),
            capability(
                "lyra-files",
                "file_list",
                "List a workspace directory with depth, hidden-file, and result limits.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "default": "." },
                        "recursive": { "type": "boolean", "default": false },
                        "depth": { "type": "number", "default": 1 },
                        "includeHidden": { "type": "boolean", "default": false },
                        "limit": { "type": "number", "default": 200 }
                    }
                }),
                None,
            ),
            capability(
                "lyra-files",
                "file_glob",
                "Find workspace paths matching a glob pattern under a checked root.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "pattern": { "type": "string" },
                        "root": { "type": "string", "default": "." },
                        "includeHidden": { "type": "boolean", "default": false },
                        "limit": { "type": "number", "default": 200 }
                    },
                    "required": ["pattern"]
                }),
                None,
            ),
            capability(
                "lyra-files",
                "file_write",
                "Write a workspace file through Lyra workspace policy.",
                "write",
                "workspaceWritePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" },
                        "overwrite": { "type": "boolean", "default": true }
                    },
                    "required": ["path", "content"]
                }),
                None,
            ),
            capability(
                "lyra-files",
                "file_edit",
                "Edit a workspace file by exact old/new string replacement.",
                "write",
                "workspaceWritePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "oldString": { "type": "string" },
                        "newString": { "type": "string" },
                        "replaceAll": { "type": "boolean", "default": false }
                    },
                    "required": ["path", "oldString", "newString"]
                }),
                None,
            ),
            capability(
                "lyra-files",
                "file_multiedit",
                "Apply multiple exact replacements atomically across workspace files.",
                "write",
                "workspaceWritePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "edits": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "path": { "type": "string" },
                                    "oldString": { "type": "string" },
                                    "newString": { "type": "string" },
                                    "replaceAll": { "type": "boolean", "default": false }
                                },
                                "required": ["oldString", "newString"]
                            }
                        }
                    },
                    "required": ["edits"]
                }),
                None,
            ),
            capability(
                "lyra-files",
                "apply_patch",
                "Apply structured workspace patch operations for add, update, delete, or move.",
                "write",
                "workspaceWritePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "operations": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "op": { "type": "string", "enum": ["add", "update", "delete", "move"] },
                                    "path": { "type": "string" },
                                    "newPath": { "type": "string" },
                                    "content": { "type": "string" },
                                    "oldString": { "type": "string" },
                                    "newString": { "type": "string" },
                                    "replaceAll": { "type": "boolean", "default": false }
                                },
                                "required": ["op", "path"]
                            }
                        }
                    },
                    "required": ["operations"]
                }),
                None,
            ),
            capability(
                "lyra-terminal",
                "shell_run",
                "Run one bounded non-interactive command in a local cwd with timeout and output limits. Defaults to the bound project root, or the user home directory when the session is unbound. Prefer this over write_stdin for one-shot checks like git config, pwd, tests, or file-system inspection. Do not use this for processes that keep running.",
                "command",
                "commandPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "command": { "type": "string" },
                        "cwd": { "type": "string" },
                        "timeoutMs": { "type": "number", "default": 30000 },
                        "maxOutputBytes": { "type": "number", "default": 20000 },
                        "env": { "type": "object" },
                        "sensitiveEnv": {
                        "type": "object",
                        "description": "Optional environment bindings: LYRA_SECRET_* names to lyra-sensitive-value-ref objects from secure storage. Values are resolved only in the process host, never in the command text. Use a credential helper/stdin consumer; never expand into a URL or write to a file.",
                        "additionalProperties": { "type": "object" }
                    },
                    "envAllowlist": { "type": "array", "items": { "type": "string" } }
                    },
                    "required": ["command"]
                }),
                None,
            ),
            capability(
                "lyra-terminal",
                "terminal_list",
                "List Agent private and visible Workbench terminal sessions.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {}
                }),
                Some("terminal.list"),
            ),
            capability(
                "lyra-terminal",
                "terminal_read",
                "Read buffered terminal output without blocking.",
                "read",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "sessionId": { "type": "string" },
                        "terminalTabId": { "type": "string" },
                        "paneId": { "type": "string" },
                        "cursor": { "type": "string" },
                        "maxBytes": { "type": "number", "default": 16000 }
                    }
                }),
                Some("terminal.read"),
            ),
            capability(
                "lyra-terminal",
                "terminal_write",
                "Send input to an existing terminal session.",
                "write",
                "hostCapability",
                json!({
                    "type": "object",
                    "properties": {
                        "sessionId": { "type": "string" },
                        "terminalTabId": { "type": "string" },
                        "paneId": { "type": "string" },
                        "data": { "type": "string" },
                        "text": { "type": "string" },
                        "keys": { "type": "array", "items": { "type": "string" } },
                        "appendNewline": { "type": "boolean", "default": false }
                    }
                }),
                Some("terminal.write"),
            ),
            capability(
                "lyra-search",
                "project_search",
                "Search workspace file names and text content.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "root": { "type": "string", "default": "." },
                        "includeHidden": { "type": "boolean", "default": false },
                        "limit": { "type": "number", "default": 80 },
                        "maxFileBytes": { "type": "number", "default": 1000000 }
                    },
                    "required": ["query"]
                }),
                None,
            ),
            capability(
                "lyra-code",
                "code_grep_text",
                "Search workspace source text with exact strings or regex and return file, line, and snippet matches.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "pattern": { "type": "string" },
                        "root": { "type": "string", "default": "." },
                        "glob": { "type": "string" },
                        "includeHidden": { "type": "boolean", "default": false },
                        "limit": { "type": "number", "default": 80 },
                        "caseSensitive": { "type": "boolean", "default": false },
                        "regex": { "type": "boolean", "default": false }
                    },
                    "required": ["query"]
                }),
                None,
            ),
            capability(
                "lyra-code",
                "code_search_text",
                "Search workspace source text and return file, line, and snippet matches.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "pattern": { "type": "string" },
                        "root": { "type": "string", "default": "." },
                        "glob": { "type": "string" },
                        "includeHidden": { "type": "boolean", "default": false },
                        "limit": { "type": "number", "default": 80 },
                        "caseSensitive": { "type": "boolean", "default": false }
                    }
                }),
                None,
            ),
            capability(
                "lyra-code",
                "code_search_symbol",
                "Search likely source symbols and return structured symbol matches.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "symbol": { "type": "string" },
                        "root": { "type": "string", "default": "." },
                        "kind": { "type": "string" },
                        "language": { "type": "string" },
                        "includeHidden": { "type": "boolean", "default": false },
                        "limit": { "type": "number", "default": 80 }
                    }
                }),
                None,
            ),
            capability(
                "lyra-code",
                "code_graph_expand",
                "Expand a lightweight code graph around a symbol using local text evidence.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "symbol": { "type": "string" },
                        "query": { "type": "string" },
                        "root": { "type": "string", "default": "." },
                        "depth": { "type": "number", "default": 1 },
                        "limit": { "type": "number", "default": 80 }
                    }
                }),
                None,
            ),
            capability(
                "lyra-lsp",
                "lsp_query",
                "Query the same language-server diagnostics, symbols, definition, references, or hover the editor uses. Omit path to list the workspace. If runtime context has workspaceProblems.errorCount, inspect here instead of guessing. Do not treat this as a second independent analysis of the file.",
                "read",
                "workspaceReadPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "queryType": { "type": "string", "enum": ["diagnostics", "symbols", "definition", "references", "hover", "completion"] },
                        "path": { "type": "string" },
                        "line": { "type": "number" },
                        "column": { "type": "number" },
                        "languageId": { "type": "string" }
                    },
                    "required": ["queryType"]
                }),
                None,
            ),
            capability(
                "lyra-web",
                "network_status",
                "Inspect Lyra native Agent network/proxy awareness for provider, web_fetch, and web_search calls.",
                "read",
                "networkPolicy",
                json!({
                    "type": "object",
                    "properties": {}
                }),
                None,
            ),
            capability(
                "lyra-web",
                "web_search",
                "Search the web through local SearXNG (an aggregator). If SearXNG fails or returns nothing, Lyra tries keyless Exa, Parallel, Firecrawl, and Keenable, then a short public fallback. Do not fire extra web_search calls for the same query.",
                "read",
                "networkPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "limit": { "type": "number", "default": 20 }
                    },
                    "required": ["query"]
                }),
                None,
            ),
            capability(
                "lyra-web",
                "web_research",
                "Search the web, deep-read top results through Lyra Agent Reader, and return a compact research bundle.",
                "read",
                "networkPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" },
                        "limit": { "type": "number", "default": 20 },
                        "readTopN": { "type": "number", "default": 3 },
                        "maxCharsPerResult": { "type": "number", "default": 4000 },
                        "includeFailedReads": { "type": "boolean", "default": true }
                    },
                    "required": ["query"]
                }),
                None,
            ),
            capability(
                "lyra-web",
                "web_fetch",
                "Fetch a URL and return agent-friendly markdown, metadata, chunks, links, images, and document recommendations.",
                "read",
                "networkPolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "url": { "type": "string" },
                        "maxChars": { "type": "number", "default": 12000 },
                        "extractText": { "type": "boolean", "default": true },
                        "includeLinks": { "type": "boolean", "default": true },
                        "engine": { "type": "string", "enum": ["auto", "http", "browser"], "default": "auto" },
                        "mode": { "type": "string", "enum": ["main", "full", "text"] },
                        "targetSelector": { "type": "string" },
                        "removeSelector": {
                            "oneOf": [
                                { "type": "string" },
                                { "type": "array", "items": { "type": "string" } }
                            ]
                        },
                        "maxTokens": { "type": "number" },
                        "chunking": {
                            "oneOf": [
                                { "type": "boolean" },
                                { "type": "string", "enum": ["disabled", "heading", "block"] },
                                {
                                    "type": "object",
                                    "properties": {
                                        "mode": { "type": "string", "enum": ["disabled", "heading", "block"] },
                                        "maxCharsPerChunk": { "type": "number" },
                                        "overlapChars": { "type": "number" }
                                    }
                                }
                            ]
                        },
                        "queryFocus": { "type": "string" },
                        "retainLinks": { "type": "string", "enum": ["all", "text", "citations", "summary", "none"] },
                        "retainImages": { "type": "string", "enum": ["all", "alt", "summary", "none"] },
                        "citations": { "type": "boolean", "default": true },
                        "includeMetadata": { "type": "boolean", "default": true },
                        "waitForSelector": { "type": "string" },
                        "waitUntil": { "type": "string", "enum": ["html", "loadIdle", "textStable", "textChanged", "textContains"], "default": "loadIdle" },
                        "timeoutMs": { "type": "number", "default": 20000 },
                        "browserMode": { "type": "string", "enum": ["matchingOrNewTab", "activeTab", "newTab"], "default": "matchingOrNewTab" },
                        "includeScreenshot": { "type": "boolean", "default": false },
                        "viewport": {
                            "type": "object",
                            "properties": {
                                "width": { "type": "number" },
                                "height": { "type": "number" },
                                "deviceScaleFactor": { "type": "number" }
                            },
                            "required": ["width", "height"]
                        },
                        "mobile": { "type": "boolean", "default": false },
                        "includeIframes": { "type": "boolean", "default": false },
                        "includeShadowDom": { "type": "boolean", "default": false },
                        "includePageshot": { "type": "boolean", "default": false },
                        "includeMedia": { "type": "boolean", "default": false }
                    },
                    "required": ["url"]
                }),
                None,
            ),
            capability(
                "lyra-todo",
                "todo_read",
                "Read the current turn-bound Lyra todo projection.",
                "read",
                "always",
                json!({
                    "type": "object",
                    "properties": {}
                }),
                None,
            ),
            capability(
                "lyra-todo",
                "todo_write",
                "Replace the current typed Lyra todo projection for this session.",
                "state",
                "runtimePolicy",
                json!({
                    "type": "object",
                    "properties": {
                        "todos": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": { "type": "string" },
                                    "content": { "type": "string" },
                                    "status": { "type": "string", "enum": ["pending", "in_progress", "completed", "cancelled"] },
                                    "priority": { "type": "string", "default": "normal" },
                                    "blockedBy": { "type": "array", "items": { "type": "string" } }
                                },
                                "required": ["content", "status"]
                            }
                        }
                    },
                    "required": ["todos"]
                }),
                None,
            ),
        ]
    }

    async fn execute(&self, capability: &AgentToolCapabilityRef, _input: Value) -> AgentToolResult {
        AgentToolResult {
            tool_call_id: capability
                .capability_id
                .clone()
                .unwrap_or_else(|| capability.tool_name.clone()),
            status: AgentToolStatus::Failed,
            output: None,
            error: Some(lyra_agent_api::LyraAgentError {
                code: lyra_agent_api::LyraAgentErrorCode::CapabilityUnavailable,
                message: "Built-in Lyra tools are executed by the core runtime dispatch path"
                    .to_string(),
                recoverability: lyra_agent_api::Recoverability::UserActionRequired,
                severity: lyra_agent_api::UserVisibleSeverity::Warning,
                detail: None,
            }),
        }
    }
}

fn capability(
    provider_id: &str,
    tool_name: &str,
    description: &str,
    risk_level: &str,
    permission_policy: &str,
    schema: Value,
    required_host_capability: Option<&str>,
) -> ToolCapability {
    ToolCapability {
        reference: AgentToolCapabilityRef {
            provider_id: provider_id.to_string(),
            tool_name: tool_name.to_string(),
            capability_id: None,
        },
        description: description.to_string(),
        schema,
        risk_level: risk_level.to_string(),
        permission_policy: permission_policy.to_string(),
        ui_renderer_hint: None,
        required_host_capability: required_host_capability.map(str::to_string),
        exposure_mode: ToolExposureMode::Always,
    }
}

trait JsonSchemaRequired {
    fn with_required(self, required: Vec<&str>) -> Self;
}

impl JsonSchemaRequired for Value {
    fn with_required(mut self, required: Vec<&str>) -> Self {
        if let Some(object) = self.as_object_mut() {
            object.insert(
                "required".to_string(),
                Value::Array(
                    required
                        .into_iter()
                        .map(|value| Value::String(value.to_string()))
                        .collect(),
                ),
            );
        }
        self
    }
}

// The legacy capability descriptor and provider Tool-FS schema must expose the
// same input contract. Do not maintain another copy of these gesture fields.
fn canonical_browser_schema(operation: &str) -> Value {
    let path = format!("/tools/browser/{operation}");
    lyra_tool_fs_core::ToolFsRegistry::builtin()
        .manifests()
        .iter()
        .find(|manifest| manifest.path == path)
        .expect("built-in browser schema")
        .input_schema
        .clone()
}

fn lumen_target_schema(extra_properties: Value) -> Value {
    lumen_target_schema_with_default(extra_properties, "live")
}

fn lumen_target_schema_with_default(extra_properties: Value, default_target_mode: &str) -> Value {
    let mut properties = json!({
        "tabId": { "type": "string" },
        "targetMode": { "type": "string", "enum": ["isolated", "live"], "default": default_target_mode },
        "authState": {
            "type": "string",
            "enum": ["none", "borrowLiveLogin"],
            "default": "none",
            "description": "For targetMode=isolated only: request user-authorized borrowing of the current live Lyra browser login state for the hidden background page. This requires a permission prompt and never exposes cookie/password values to the model."
        },
        "useLiveLoginState": {
            "type": "boolean",
            "default": false,
            "description": "Alias for authState=borrowLiveLogin. Use only when the task must operate a hidden isolated page with the user's current Lyra browser login state."
        }
    });
    if let (Some(base), Some(extra)) = (properties.as_object_mut(), extra_properties.as_object()) {
        for (key, value) in extra {
            base.insert(key.clone(), value.clone());
        }
    }
    json!({
        "type": "object",
        "properties": properties
    })
}

fn tool_fs_provider_tools() -> Vec<Value> {
    vec![tool_fs_provider_tool(
        "ToolSearch",
        "Fetches full schema definitions for deferred tools so they can be called. Use query select:<tool_name> or keywords.",
        json!({
            "type": "object",
            "properties": {
                "query": { "type": "string" },
                "max_results": { "type": "integer", "minimum": 1, "maximum": 25, "default": 5 }
            },
            "required": ["query"]
        }),
    )]
}

fn tool_fs_provider_tool(name: &str, description: &str, schema: Value) -> Value {
    json!({
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": schema,
        }
    })
}

fn tool_capability_json(capability: ToolCapability) -> Value {
    json!({
        "providerId": capability.reference.provider_id,
        "name": capability.reference.tool_name,
        "capabilityId": capability.reference.capability_id,
        "description": capability.description,
        "schema": capability.schema,
        "riskLevel": capability.risk_level,
        "permissionPolicy": capability.permission_policy,
        "uiRendererHint": capability.ui_renderer_hint,
        "requiredHostCapability": capability.required_host_capability,
        "exposureMode": exposure_mode_str(&capability.exposure_mode),
    })
}

fn model_exposure_mode(mode: &ToolExposureMode) -> ModelToolExposureMode {
    match mode {
        ToolExposureMode::Always => ModelToolExposureMode::Direct,
        ToolExposureMode::Discoverable
        | ToolExposureMode::InspectRequired
        | ToolExposureMode::Hidden => ModelToolExposureMode::Discoverable,
    }
}

fn exposure_mode_str(mode: &ToolExposureMode) -> &'static str {
    match mode {
        ToolExposureMode::Always => "always",
        ToolExposureMode::Discoverable => "discoverable",
        ToolExposureMode::InspectRequired => "inspectRequired",
        ToolExposureMode::Hidden => "hidden",
    }
}

#[cfg(test)]
mod tests {
    use super::ToolActivityService;
    use serde_json::Value;

    #[test]
    fn tool_capabilities_are_registry_backed() {
        let service = ToolActivityService::default();
        let tools = service.built_in_capabilities();
        let names = tools["tools"]
            .as_array()
            .expect("tools array")
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect::<Vec<_>>();

        assert!(names.contains(&"file_read"));
        assert!(names.contains(&"software_list_capabilities"));
        assert!(!names.contains(&"software_invoke_capability"));
        assert!(names.contains(&"lyra_lumen_map"));
        assert!(names.contains(&"terminal_write"));
    }

    #[test]
    fn model_tool_descriptors_are_registry_backed() {
        let service = ToolActivityService::default();
        assert_eq!(service.model_tool_names(), vec!["ToolSearch".to_string()]);
        let provider_tool_names = service
            .model_provider_tools()
            .into_iter()
            .filter_map(|tool| {
                tool.pointer("/function/name")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect::<Vec<_>>();
        assert_eq!(provider_tool_names, vec!["ToolSearch".to_string()]);
        let descriptors = service.model_tool_descriptors();
        let names = descriptors
            .iter()
            .map(|descriptor| descriptor.name.as_str())
            .collect::<Vec<_>>();

        assert!(names.contains(&"file_read"));
        assert!(names.contains(&"shell_run"));
        assert!(names.contains(&"terminal_read"));
        assert!(names.contains(&"terminal_write"));
        assert!(names.contains(&"web_fetch"));
        assert!(service.can_dispatch_model_tool("todo_write"));
        assert!(!service.can_dispatch_model_tool("missing_tool"));
    }

    #[test]
    fn lumen_tools_default_to_live_target_mode_except_elevation() {
        let service = ToolActivityService::default();
        let descriptors = service.model_tool_descriptors();
        for name in [
            "lyra_lumen_map",
            "lyra_lumen_read",
            "lyra_lumen_see",
            "lyra_lumen_act",
            "lyra_lumen_type",
            "lyra_lumen_press",
            "lyra_lumen_wait",
            "lyra_lumen_navigate",
        ] {
            let descriptor = descriptors
                .iter()
                .find(|descriptor| descriptor.name == name)
                .expect("lumen descriptor");
            assert_eq!(
                descriptor.schema["properties"]["targetMode"]["default"].as_str(),
                Some("live"),
                "{name} should inspect the user's visible browser by default"
            );
        }

        let elevate = descriptors
            .iter()
            .find(|descriptor| descriptor.name == "lyra_lumen_elevate")
            .expect("elevation descriptor");
        assert_eq!(
            elevate.schema["properties"]["targetMode"]["default"].as_str(),
            Some("isolated")
        );
    }
}
