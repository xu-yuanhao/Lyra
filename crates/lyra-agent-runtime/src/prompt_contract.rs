use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub const PROMPT_POLICY_VERSION: u32 = 12;
pub const PROMPT_TEMPLATE_VERSION: u32 = 65;
pub const MEMORY_PROJECTION_VERSION: u32 = 1;
pub const CONTEXT_PROJECTION_VERSION: u32 = 6;
pub const RETENTION_POLICY_VERSION: u32 = 1;
pub const TOOL_DISCOVERY_CONTRACT_VERSION: u32 = 4;
pub const RUNTIME_CONTEXT_SCHEMA_VERSION: u32 = 6;
pub const PROMPT_DELIVERY_MODE_VERSION: u32 = 1;
pub const PERSONA_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptRuntimeContract {
    pub prompt_policy_version: u32,
    pub prompt_template_version: u32,
    pub memory_projection_version: u32,
    pub context_projection_version: u32,
    pub retention_policy_version: u32,
    pub tool_discovery_contract_version: u32,
    pub runtime_context_schema_version: u32,
    pub prompt_delivery_mode_version: u32,
}

impl Default for PromptRuntimeContract {
    fn default() -> Self {
        current_prompt_runtime_contract()
    }
}

pub fn current_prompt_runtime_contract() -> PromptRuntimeContract {
    PromptRuntimeContract {
        prompt_policy_version: PROMPT_POLICY_VERSION,
        prompt_template_version: PROMPT_TEMPLATE_VERSION,
        memory_projection_version: MEMORY_PROJECTION_VERSION,
        context_projection_version: CONTEXT_PROJECTION_VERSION,
        retention_policy_version: RETENTION_POLICY_VERSION,
        tool_discovery_contract_version: TOOL_DISCOVERY_CONTRACT_VERSION,
        runtime_context_schema_version: RUNTIME_CONTEXT_SCHEMA_VERSION,
        prompt_delivery_mode_version: PROMPT_DELIVERY_MODE_VERSION,
    }
}

pub fn current_prompt_runtime_contract_json() -> Value {
    serde_json::to_value(current_prompt_runtime_contract()).unwrap_or_else(|_| json!({}))
}

pub fn prompt_runtime_contract_from_value(value: &Value) -> Option<PromptRuntimeContract> {
    serde_json::from_value(value.clone()).ok()
}

pub fn prompt_runtime_contract_matches(value: Option<&Value>) -> bool {
    value
        .and_then(prompt_runtime_contract_from_value)
        .is_some_and(|contract| contract == current_prompt_runtime_contract())
}
