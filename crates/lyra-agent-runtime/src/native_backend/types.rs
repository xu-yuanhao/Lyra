use super::*;

pub(crate) struct NativeRuntimeState {
    pub(crate) root: PathBuf,
    pub(crate) tool_runtime_schema_version: u32,
    pub(crate) tool_runtime_migration_diagnostics: Vec<Value>,
    pub(crate) tool_usage_cache: HashMap<String, ToolUsageCacheEntry>,
    pub(crate) sessions: HashMap<String, NativeSession>,
    pub(crate) active_session_id: Option<String>,
    pub(crate) config: NativeConfig,
    pub(crate) pending_permissions: HashMap<String, PermissionRequest>,
    pub(crate) pending_clarifications: HashMap<String, ClarificationRequest>,
    pub(crate) suppressed_tool_usage_by_turn: HashMap<String, HashSet<String>>,
    pub(crate) inspected_tool_descriptors_by_session:
        HashMap<String, HashMap<String, ToolDescriptorCacheEntry>>,
    pub(crate) legacy_plaintext_provider_keys: HashSet<String>,
    pub(crate) active_compressions: HashSet<String>,
    pub(crate) first_used_at: Option<String>,
    pub(crate) model_capabilities: HashMap<String, HashMap<String, NativeModelCapabilityRecord>>,
    pub(crate) media_model_defaults: HashMap<String, NativeModelReference>,
    /// 标记全局状态是否有未持久化的变更。
    /// `save_state()` 设为 true，`flush_now()` 持久化后清零。
    pub(crate) dirty: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeStateFile {
    #[serde(default)]
    pub(crate) tool_runtime_schema_version: u32,
    #[serde(default)]
    pub(crate) tool_runtime_migration_diagnostics: Vec<Value>,
    #[serde(default)]
    pub(crate) tool_usage_cache: HashMap<String, ToolUsageCacheEntry>,
    pub(crate) active_session_id: Option<String>,
    pub(crate) config: NativeConfig,
    #[serde(default)]
    pub(crate) pending_permissions: HashMap<String, PermissionRequest>,
    #[serde(default)]
    pub(crate) pending_clarifications: HashMap<String, ClarificationRequest>,
    #[serde(default)]
    pub(crate) first_used_at: Option<String>,
    #[serde(default)]
    pub(crate) model_capabilities: HashMap<String, HashMap<String, NativeModelCapabilityRecord>>,
    #[serde(default)]
    pub(crate) media_model_defaults: HashMap<String, NativeModelReference>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CapabilitySupport {
    #[default]
    Unknown,
    Supported,
    Unsupported,
}

impl CapabilitySupport {
    pub(crate) fn as_bool(self) -> Option<bool> {
        match self {
            Self::Unknown => None,
            Self::Supported => Some(true),
            Self::Unsupported => Some(false),
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum CapabilityOverride {
    #[default]
    Auto,
    Supported,
    Unsupported,
}

impl CapabilityOverride {
    pub(crate) fn as_bool(self) -> Option<bool> {
        match self {
            Self::Auto => None,
            Self::Supported => Some(true),
            Self::Unsupported => Some(false),
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeCapabilityEvidence {
    pub(crate) source: String,
    #[serde(default)]
    pub(crate) conflict: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) observed_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) detail: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum NativeReasoningKind {
    Effort,
    Toggle,
    Budget,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeReasoningControl {
    pub(crate) kind: NativeReasoningKind,
    pub(crate) values: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) budget_min: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) budget_max: Option<u32>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeModelCapabilityRecord {
    #[serde(default)]
    pub(crate) detected: HashMap<String, CapabilitySupport>,
    #[serde(default)]
    pub(crate) overrides: HashMap<String, CapabilityOverride>,
    #[serde(default)]
    pub(crate) evidence: HashMap<String, NativeCapabilityEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) reasoning_control: Option<NativeReasoningControl>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) api_npm: Option<String>,
    // Live 400s observed by the runtime retry path. Kept apart from `detected`
    // so a catalog/discovery refresh cannot silently resurrect a capability
    // the provider already rejected.
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub(crate) runtime_rejections: HashMap<String, NativeCapabilityEvidence>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) context_window_override: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) reasoning_replay_field_override: Option<ReasoningReplayField>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) assistant_reasoning_field_required_override: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) runtime_conflict: Option<String>,
}

impl NativeModelCapabilityRecord {
    pub(crate) fn resolved(&self, key: &str, fallback: bool) -> bool {
        if let Some(value) = self
            .overrides
            .get(key)
            .copied()
            .and_then(CapabilityOverride::as_bool)
        {
            return value;
        }
        if self.runtime_rejections.contains_key(key) {
            return false;
        }
        self.detected
            .get(key)
            .copied()
            .and_then(CapabilitySupport::as_bool)
            .unwrap_or(fallback)
    }

    // A conflict exists only when the user forced a capability to Supported
    // while the provider keeps rejecting it. The override is retained; the
    // message just records the disagreement.
    pub(crate) fn recompute_runtime_conflict(&mut self) {
        self.runtime_conflict = self
            .runtime_rejections
            .keys()
            .find(|key| self.overrides.get(*key) == Some(&CapabilityOverride::Supported))
            .map(|key| {
                format!(
                    "The provider rejected {key}, but this model is manually forced to Supported. The override was retained."
                )
            });
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeModelReference {
    pub(crate) provider_id: String,
    pub(crate) model_id: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolUsageCacheEntry {
    pub(crate) tool_path: String,
    pub(crate) handle: Option<String>,
    pub(crate) title: String,
    pub(crate) domain: String,
    pub(crate) operation: String,
    #[serde(default)]
    pub(crate) total_runs: u64,
    #[serde(default)]
    pub(crate) successes: u64,
    #[serde(default)]
    pub(crate) failures: u64,
    #[serde(default)]
    pub(crate) consecutive_failures: u64,
    #[serde(default)]
    pub(crate) last_used_at: Option<String>,
    #[serde(default)]
    pub(crate) last_success_at: Option<String>,
    #[serde(default)]
    pub(crate) last_failure_at: Option<String>,
    #[serde(default)]
    pub(crate) last_error_code: Option<String>,
    #[serde(default)]
    pub(crate) last_scene: Option<String>,
    #[serde(default)]
    pub(crate) scene_stats: HashMap<String, ToolUsageSceneStats>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolUsageSceneStats {
    #[serde(default)]
    pub(crate) runs: u64,
    #[serde(default)]
    pub(crate) successes: u64,
    #[serde(default)]
    pub(crate) failures: u64,
    #[serde(default)]
    pub(crate) last_used_at: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ToolDescriptorCacheEntry {
    pub(crate) tool_path: String,
    pub(crate) handle: Option<String>,
    pub(crate) title: String,
    pub(crate) domain: String,
    pub(crate) operation: String,
    pub(crate) inspected_at: String,
    pub(crate) run_hint: String,
    pub(crate) mini_schema: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeSession {
    pub(crate) id: String,
    pub(crate) snapshot: Value,
    pub(crate) created_at: String,
    pub(crate) saved: bool,
    pub(crate) save_label: Option<String>,
    pub(crate) archived: bool,
    pub(crate) custom_title: Option<String>,
    pub(crate) short_name: Option<String>,
    pub(crate) runtime_turns: Vec<Value>,
    #[serde(default)]
    pub(crate) rollback_checkpoints: Vec<RollbackCheckpoint>,
    #[serde(default)]
    pub(crate) file_read_state: HashMap<String, FileReadStateEntry>,
    /// Independent provider-protocol replay log (codex rollout / opencode
    /// providerContext shape): one v2 step per record, each carrying its
    /// `messageId` anchor. Protocol state must not ride inside message
    /// metadata — the log is the source of truth for resume replay, and the
    /// renderer never reads it.
    #[serde(default)]
    pub(crate) provider_protocol_log: Vec<Value>,
    #[serde(default, skip)]
    pub(crate) dirty: bool,
    #[serde(default, skip)]
    pub(crate) dialog_dirty_from: Option<usize>,
    #[serde(default, skip)]
    pub(crate) persisted_dialog_len: usize,
    /// False means `snapshot.messages` was not read. Saving must not rewrite dialog rows.
    #[serde(default, skip)]
    pub(crate) dialog_loaded: bool,
    /// Ephemeral sessions back the temporary plan-chat capsule: they are seeded
    /// with plan context, never persisted to disk, never shown in the session
    /// list, and are discarded when the capsule closes. They must never become
    /// the active session.
    #[serde(default, skip)]
    pub(crate) ephemeral: bool,
    /// Snapshot revision; journal rows at or below it are included.
    #[serde(default, skip)]
    pub(crate) stream_journal_sequence: i64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileReadStateEntry {
    pub(crate) path: String,
    pub(crate) absolute_path: String,
    pub(crate) read_version: String,
    pub(crate) content_hash: String,
    pub(crate) mtime_ms: u64,
    pub(crate) size: u64,
    pub(crate) start_line: Option<usize>,
    pub(crate) end_line: Option<usize>,
    pub(crate) read_at: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeConfig {
    pub(crate) default_provider: Option<String>,
    pub(crate) default_model: Option<String>,
    #[serde(default)]
    pub(crate) memory_agent_provider: Option<String>,
    #[serde(default)]
    pub(crate) memory_agent_model: Option<String>,
    pub(crate) reasoning_effort: Option<String>,
    pub(crate) service_tier: Option<String>,
    pub(crate) verbosity: Option<String>,
    #[serde(default)]
    pub(crate) prompt_delivery_mode: Option<String>,
    #[serde(default = "default_false")]
    pub(crate) openai_responses_stateful_prompt_contract: bool,
    #[serde(default)]
    pub(crate) providers: HashMap<String, NativeProviderProfile>,
    #[serde(default)]
    pub(crate) accounts: Vec<NativeAccount>,
    #[serde(default = "default_true")]
    pub(crate) proactive_enabled: bool,
    #[serde(default)]
    pub(crate) proactive_disabled_triggers: HashSet<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeProviderProfile {
    pub(crate) id: String,
    pub(crate) label: String,
    pub(crate) route_id: String,
    pub(crate) base_url: Option<String>,
    pub(crate) default_model: Option<String>,
    #[serde(default, skip_serializing)]
    pub(crate) api_key: Option<String>,
    #[serde(default)]
    pub(crate) api_key_ref: Option<Value>,
    pub(crate) api_key_env: Option<String>,
    pub(crate) auth_header: Option<String>,
    pub(crate) embedding_model: Option<String>,
    #[serde(default)]
    pub(crate) models: Vec<NativeProviderModel>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeProviderModel {
    pub(crate) id: String,
    pub(crate) label: Option<String>,
    pub(crate) context_window: Option<usize>,
    #[serde(default = "default_false")]
    pub(crate) supports_image_input: bool,
    #[serde(default = "default_false")]
    pub(crate) supports_tool_calling: bool,
    #[serde(default = "default_true")]
    pub(crate) supports_streaming: bool,
    /// None = unknown; Responses falls back to protocol defaults, Chat only
    /// if discovery reported Some(true). Some(false) hides the control.
    /// Some(true) without catalog values uses the protocol default ladder.
    #[serde(default)]
    pub(crate) supports_reasoning_effort: Option<bool>,
    #[serde(default)]
    pub(crate) reasoning_replay_field: ReasoningReplayField,
    #[serde(default)]
    pub(crate) requires_reasoning_field_on_assistant_messages: Option<bool>,
    #[serde(default)]
    pub(crate) supports_tool_choice: Option<bool>,
    #[serde(default = "default_true")]
    pub(crate) enabled: bool,
    /// models.dev model-level `provider.npm`. Drives Zen/Go wire protocol.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) api_npm: Option<String>,
}

impl Default for NativeProviderModel {
    fn default() -> Self {
        Self {
            id: String::new(),
            label: None,
            context_window: None,
            supports_image_input: false,
            supports_tool_calling: false,
            supports_streaming: true,
            supports_reasoning_effort: None,
            reasoning_replay_field: ReasoningReplayField::Auto,
            requires_reasoning_field_on_assistant_messages: None,
            supports_tool_choice: None,
            enabled: true,
            api_npm: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum ReasoningReplayField {
    #[default]
    Auto,
    None,
    Reasoning,
    ReasoningContent,
    ReasoningDetails,
}

impl ReasoningReplayField {
    pub(crate) fn wire_name(self) -> Option<&'static str> {
        match self {
            Self::Auto | Self::None => None,
            Self::Reasoning => Some("reasoning"),
            Self::ReasoningContent => Some("reasoning_content"),
            Self::ReasoningDetails => Some("reasoning_details"),
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeAccount {
    pub(crate) provider: String,
    pub(crate) label: String,
    pub(crate) kind: String,
    pub(crate) active: bool,
    pub(crate) configured: bool,
    pub(crate) detail: Option<String>,
    #[serde(default)]
    pub(crate) email: Option<String>,
    #[serde(default)]
    pub(crate) display_name: Option<String>,
    #[serde(default)]
    pub(crate) avatar_url: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LongTermMemoryRecord {
    pub(crate) id: String,
    pub(crate) scope: String,
    pub(crate) category: String,
    pub(crate) fact: String,
    pub(crate) content: Value,
    pub(crate) layer: String,
    pub(crate) value_class: String,
    pub(crate) abstract_text: Option<String>,
    pub(crate) confidence: f64,
    pub(crate) source_type: String,
    pub(crate) source_ref: Option<String>,
    pub(crate) status: String,
    pub(crate) priority: i64,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
    pub(crate) last_accessed_at: Option<String>,
    pub(crate) access_count: u64,
    pub(crate) tags: Vec<String>,
    pub(crate) related_to: Vec<MemoryRelation>,
    pub(crate) expires_at: Option<String>,
    pub(crate) supersedes: Option<String>,
    pub(crate) superseded_by: Option<String>,
    #[serde(default)]
    pub(crate) revision: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryRelation {
    pub(crate) source_id: String,
    pub(crate) target_id: String,
    pub(crate) relation: String,
    pub(crate) confidence: f64,
    pub(crate) created_at: String,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct MemoryQuery {
    pub(crate) query: Option<String>,
    pub(crate) scope: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) layer: Option<String>,
    pub(crate) value_class: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) include_archived: bool,
    pub(crate) include_related: bool,
    pub(crate) explain: bool,
    pub(crate) min_score: Option<f64>,
    pub(crate) limit: usize,
    pub(crate) offset: usize,
    pub(crate) touch_access: bool,
    pub(crate) access_type: String,
}

#[derive(Clone, Debug)]
pub(crate) struct RankedMemoryRecord {
    pub(crate) record: LongTermMemoryRecord,
    pub(crate) score: f64,
    pub(crate) breakdown: MemoryScoreBreakdown,
}

#[derive(Clone, Debug)]
pub(crate) struct SystemRecallItem {
    pub(crate) id: String,
    pub(crate) source_kind: String,
    pub(crate) source_id: String,
    pub(crate) session_id: Option<String>,
    pub(crate) turn_id: Option<String>,
    pub(crate) role: Option<String>,
    pub(crate) text: String,
    pub(crate) summary: Option<String>,
    pub(crate) content_hash: String,
    pub(crate) source_path: Option<String>,
    pub(crate) created_at: String,
    pub(crate) updated_at: String,
}

#[derive(Clone, Debug)]
pub(crate) struct RankedSystemRecallItem {
    pub(crate) item: SystemRecallItem,
    pub(crate) score: f64,
    pub(crate) reason: String,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryScoreBreakdown {
    pub(crate) fts_score: f64,
    pub(crate) vector_score: f64,
    pub(crate) metadata_relevance: f64,
    pub(crate) confidence_boost: f64,
    pub(crate) access_frequency_boost: f64,
    pub(crate) graph_boost: f64,
    pub(crate) recency_boost: f64,
    pub(crate) decay_penalty: f64,
    pub(crate) contradiction_penalty: f64,
    pub(crate) final_score: f64,
    pub(crate) half_life_days: f64,
    pub(crate) age_days: f64,
    pub(crate) retention: f64,
    pub(crate) matched_by: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct MemoryMutation {
    pub(crate) id: Option<String>,
    pub(crate) scope: Option<String>,
    pub(crate) category: Option<String>,
    pub(crate) fact: Option<String>,
    pub(crate) content: Option<Value>,
    pub(crate) layer: Option<String>,
    pub(crate) value_class: Option<String>,
    pub(crate) abstract_text: Option<String>,
    pub(crate) confidence: Option<f64>,
    pub(crate) source_type: Option<String>,
    pub(crate) source_ref: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) priority: Option<i64>,
    pub(crate) tags: Option<Vec<String>>,
    pub(crate) related_to: Option<Vec<MemoryRelation>>,
    pub(crate) expires_at: Option<String>,
    pub(crate) supersedes: Option<String>,
    pub(crate) superseded_by: Option<String>,
    pub(crate) revision: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MemoryCandidate {
    pub(crate) id: String,
    pub(crate) fact: String,
    pub(crate) content: Value,
    pub(crate) category: String,
    pub(crate) scope: String,
    #[serde(default)]
    pub(crate) layer: Option<String>,
    #[serde(default)]
    pub(crate) value_class: Option<String>,
    #[serde(default)]
    pub(crate) trigger_event: Option<String>,
    #[serde(default)]
    pub(crate) evidence_json: Option<Value>,
    pub(crate) confidence: f64,
    pub(crate) source_type: String,
    pub(crate) source_ref: Option<String>,
    pub(crate) proposed_action: String,
    pub(crate) conflict_with: Option<String>,
    pub(crate) target_id: Option<String>,
    pub(crate) relation_type: Option<String>,
    pub(crate) status: String,
    pub(crate) created_at: String,
    pub(crate) reviewed_at: Option<String>,
    pub(crate) expires_at: Option<String>,
    #[serde(default)]
    pub(crate) stability_review_at: Option<String>,
    #[serde(default)]
    pub(crate) stability_window_hours: Option<i64>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct MemoryCandidateMutation {
    pub(crate) fact: String,
    pub(crate) content: Value,
    pub(crate) category: String,
    pub(crate) scope: String,
    pub(crate) layer: Option<String>,
    pub(crate) value_class: Option<String>,
    pub(crate) abstract_text: Option<String>,
    pub(crate) trigger_event: Option<String>,
    pub(crate) evidence_json: Option<Value>,
    pub(crate) confidence: f64,
    pub(crate) source_type: String,
    pub(crate) source_ref: Option<String>,
    pub(crate) proposed_action: String,
    pub(crate) conflict_with: Option<String>,
    pub(crate) target_id: Option<String>,
    pub(crate) relation_type: Option<String>,
    pub(crate) status: Option<String>,
    pub(crate) expires_at: Option<String>,
    pub(crate) stability_review_at: Option<String>,
    pub(crate) stability_window_hours: Option<i64>,
}

#[derive(Clone, Debug)]
pub(crate) struct MemoryJobRecord {
    pub(crate) id: String,
    pub(crate) session_id: String,
    pub(crate) turn_id: String,
    pub(crate) job_type: String,
    pub(crate) payload: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProactiveEvent {
    pub(crate) id: String,
    pub(crate) trigger_type: String,
    pub(crate) title: String,
    pub(crate) reason: String,
    pub(crate) source: Value,
    pub(crate) mode: String,
    pub(crate) status: String,
    pub(crate) session_id: Option<String>,
    pub(crate) created_at: String,
    pub(crate) dismissed_at: Option<String>,
    pub(crate) opened_session_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RollbackCheckpoint {
    pub(crate) id: String,
    pub(crate) session_id: String,
    pub(crate) turn_id: String,
    pub(crate) message_id: String,
    pub(crate) created_at: String,
    pub(crate) changed_files: Vec<RollbackFileCheckpoint>,
    pub(crate) artifact_refs: Vec<Value>,
    #[serde(default)]
    pub(crate) before_message_count: usize,
    #[serde(default)]
    pub(crate) before_tool_count: usize,
    #[serde(default, skip_serializing)]
    pub(crate) before_messages: Vec<Value>,
    #[serde(default, skip_serializing)]
    pub(crate) before_tools: Vec<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RollbackFileCheckpoint {
    pub(crate) path: String,
    pub(crate) absolute_path: String,
    pub(crate) before_exists: bool,
    pub(crate) before_content: Option<String>,
    pub(crate) after_exists: Option<bool>,
    pub(crate) after_content: Option<String>,
    #[serde(default)]
    pub(crate) artifact_refs: Vec<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PermissionRequest {
    pub(crate) id: String,
    pub(crate) session_id: String,
    pub(crate) turn_id: String,
    pub(crate) tool_call_id: String,
    pub(crate) action: String,
    pub(crate) risk: String,
    pub(crate) summary: String,
    pub(crate) why: String,
    pub(crate) title: String,
    pub(crate) detail: String,
    pub(crate) status: String,
    pub(crate) allowed: Option<bool>,
    pub(crate) created_at: String,
    pub(crate) responded_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ClarificationRequest {
    pub(crate) id: String,
    pub(crate) session_id: String,
    pub(crate) turn_id: String,
    pub(crate) tool_call_id: String,
    pub(crate) question: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) i18n_key: Option<String>,
    pub(crate) options: Vec<Value>,
    pub(crate) allow_custom_answer: bool,
    pub(crate) detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) detail_i18n_key: Option<String>,
    pub(crate) status: String,
    pub(crate) answer: Option<String>,
    pub(crate) selected_option: Option<String>,
    pub(crate) created_at: String,
    pub(crate) responded_at: Option<String>,
}
