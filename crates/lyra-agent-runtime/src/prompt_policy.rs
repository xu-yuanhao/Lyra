use crate::persona::ComputedPersona;
use crate::prompt_contract::{
    PromptRuntimeContract, current_prompt_runtime_contract, prompt_runtime_contract_matches,
};
use crate::prompt_templates::render_template;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, env};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PromptDeliveryMode {
    #[default]
    Full,
    LeanExperimental,
}

impl PromptDeliveryMode {
    pub fn from_config_value(value: Option<&str>) -> Self {
        match value.unwrap_or_default().trim() {
            "lean-experimental" => Self::LeanExperimental,
            _ => Self::Full,
        }
    }

    pub fn from_env() -> Self {
        Self::from_config_value(env::var("LYRA_PROMPT_DELIVERY_MODE").ok().as_deref())
    }

    pub fn resolve(config_value: Option<&str>) -> Self {
        let env_value = env::var("LYRA_PROMPT_DELIVERY_MODE")
            .ok()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        env_value
            .as_deref()
            .map(|value| Self::from_config_value(Some(value)))
            .unwrap_or_else(|| Self::from_config_value(config_value))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PromptRefreshReason {
    FullModeDefault,
    FirstSessionFullRefresh,
    ContractMismatchFullRefresh,
    ContextTrimmedFullRefresh,
    RecentToolFailureFullRefresh,
    RecentToolMismatchFullRefresh,
    UserCorrectionFullRefresh,
    PromptHashChangedFullRefresh,
    LeanExperimental,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum PromptLayer {
    P0,
    P1,
    P2,
    P3,
    P4,
    P5,
    P6,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PromptSectionModePolicy {
    Always,
    FullOnly,
    SceneOnly,
    Dynamic,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptSectionReport {
    pub id: String,
    pub layer: PromptLayer,
    pub mode_policy: PromptSectionModePolicy,
    pub included: bool,
    pub hash: String,
    pub estimated_tokens: usize,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptBuildReport {
    pub prompt: String,
    #[serde(default)]
    pub stable_prefix_prompt: String,
    #[serde(default)]
    pub turn_tail_prompt: String,
    pub prompt_mode: PromptDeliveryMode,
    pub refresh_reason: PromptRefreshReason,
    pub contract: PromptRuntimeContract,
    pub section_hashes: BTreeMap<String, String>,
    pub sections: Vec<PromptSectionReport>,
    pub scene_modules: Vec<String>,
    pub missed_module_recovery: PromptMissedModuleRecovery,
    pub estimated_prompt_tokens: usize,
    pub estimated_saved_tokens: usize,
    pub omitted_stable_tokens: usize,
    pub prefix_cache_eligible_tokens: usize,
    pub stable_prompt_hash: String,
    #[serde(default)]
    pub stable_base_hash: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptMissedModuleRecovery {
    pub enabled: bool,
    pub active_triggers: Vec<String>,
    pub next_action: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PromptAccounting {
    pub system_budget: usize,
    pub tools_budget: usize,
    pub memory_budget: usize,
    pub history_budget: usize,
    pub artifact_budget: usize,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PersonaContext {
    pub current_time: Option<String>,
    pub location_label: Option<String>,
    pub device_summary: Option<String>,
    pub user_name: Option<String>,
    /// Precise Unix epoch milliseconds — enables elapsed-time arithmetic.
    pub current_epoch_ms: Option<u64>,
    /// IANA timezone label, e.g. "Asia/Shanghai".
    pub timezone: Option<String>,
    /// Offset from UTC in minutes, e.g. +480 for UTC+8.
    pub timezone_offset_minutes: Option<i32>,
    /// Primary display pixel width.
    pub screen_width: Option<u32>,
    /// Primary display pixel height.
    pub screen_height: Option<u32>,
    /// Display density (Retina = 2.0).
    pub screen_scale_factor: Option<f64>,
    /// Number of physical displays attached.
    pub screen_display_count: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct PromptPolicyInput {
    pub runtime_context: Value,
    pub persona: PersonaContext,
    pub active_skill_prompt: String,
    pub project_instructions: String,
    pub memory_prompt: String,
    pub accounting: PromptAccounting,
    pub delivery_mode: Option<PromptDeliveryMode>,
    pub previous_runtime_contract: Option<Value>,
    pub previous_prompt_hash: Option<String>,
    pub context_trimmed: bool,
    pub recent_tool_failure_count: usize,
    pub recent_tool_mismatch_count: usize,
    pub consecutive_tool_failure_count: usize,
    pub user_correction_detected: bool,
    /// Computed persona from local signals + OSINT — rendered in the turn tail.
    pub computed_persona: Option<ComputedPersona>,
    /// ISO8601 timestamp of first usage — rendered in the dynamic turn tail.
    pub first_used_at: Option<String>,
}

pub fn persona_context_from_value(value: &Value) -> PersonaContext {
    let read_string = |key: &str| -> Option<String> {
        value
            .get(key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    };
    let read_u64 = |key: &str| -> Option<u64> { value.get(key).and_then(Value::as_u64) };
    let read_i32 =
        |key: &str| -> Option<i32> { value.get(key).and_then(Value::as_i64).map(|n| n as i32) };
    let screen = value.get("screen");
    PersonaContext {
        current_time: read_string("currentTime"),
        location_label: read_string("locationLabel"),
        device_summary: read_string("deviceSummary"),
        user_name: read_string("userName"),
        current_epoch_ms: read_u64("currentEpochMs"),
        timezone: read_string("timezone"),
        timezone_offset_minutes: read_i32("timezoneOffsetMinutes"),
        screen_width: screen
            .and_then(|s| s.get("width"))
            .and_then(Value::as_u64)
            .map(|n| n as u32),
        screen_height: screen
            .and_then(|s| s.get("height"))
            .and_then(Value::as_u64)
            .map(|n| n as u32),
        screen_scale_factor: screen
            .and_then(|s| s.get("scaleFactor"))
            .and_then(Value::as_f64),
        screen_display_count: screen
            .and_then(|s| s.get("displayCount"))
            .and_then(Value::as_u64)
            .map(|n| n as u32),
    }
}

pub fn build_system_prompt(input: &PromptPolicyInput) -> String {
    build_system_prompt_report(input).prompt
}

pub fn build_system_prompt_report(input: &PromptPolicyInput) -> PromptBuildReport {
    let requested_mode = input
        .delivery_mode
        .unwrap_or_else(PromptDeliveryMode::from_env);
    let contract = current_prompt_runtime_contract();
    let stable_sections = render_stable_prompt_sections(input);
    let stable_base_prompt =
        join_sections(stable_sections.iter().map(|section| section.text.as_str()));
    let stable_base_hash = hash_text(&stable_base_prompt);
    let refresh_reason = prompt_refresh_reason(input, requested_mode, &stable_base_hash);
    let prompt_mode = if requested_mode == PromptDeliveryMode::LeanExperimental
        && refresh_reason == PromptRefreshReason::LeanExperimental
    {
        PromptDeliveryMode::LeanExperimental
    } else {
        PromptDeliveryMode::Full
    };

    let mut runtime_context = input.runtime_context.clone();
    let preliminary_candidates =
        render_prompt_sections(input, &runtime_context, stable_sections.clone());
    let preliminary_stable_prefix =
        join_sections(preliminary_candidates.iter().filter_map(|section| {
            (section.stable && section.included_in(prompt_mode)).then_some(section.text.as_str())
        }));
    let stable_prompt_hash = hash_text(&preliminary_stable_prefix);
    inject_prompt_runtime_metadata(
        &mut runtime_context,
        prompt_mode,
        &refresh_reason,
        &contract,
        &stable_prompt_hash,
    );

    let candidates = render_prompt_sections(input, &runtime_context, stable_sections);
    let full_tokens = estimate_prompt_tokens(&join_sections(
        candidates
            .iter()
            .filter(|section| section.include_full)
            .map(|section| section.text.as_str()),
    ));
    let stable_prefix_prompt = join_sections(candidates.iter().filter_map(|section| {
        (section.stable && section.included_in(prompt_mode)).then_some(section.text.as_str())
    }));
    let turn_tail_prompt = join_sections(candidates.iter().filter_map(|section| {
        (!section.stable && section.included_in(prompt_mode)).then_some(section.text.as_str())
    }));
    let included_prompt =
        join_sections([stable_prefix_prompt.as_str(), turn_tail_prompt.as_str()].into_iter());
    let estimated_prompt_tokens = estimate_prompt_tokens(&included_prompt);
    let estimated_saved_tokens = if prompt_mode == PromptDeliveryMode::LeanExperimental {
        full_tokens.saturating_sub(estimated_prompt_tokens)
    } else {
        0
    };
    let omitted_stable_tokens = if prompt_mode == PromptDeliveryMode::LeanExperimental {
        candidates
            .iter()
            .filter(|section| {
                section.stable && section.include_full && !section.included_in(prompt_mode)
            })
            .map(|section| estimate_prompt_tokens(&section.text))
            .sum()
    } else {
        0
    };
    let prefix_cache_eligible_tokens = estimate_prompt_tokens(&stable_prefix_prompt);
    let scene_modules = candidates
        .iter()
        .filter(|section| section.included_in(prompt_mode))
        .filter_map(|section| section.scene_module.map(str::to_string))
        .collect::<Vec<_>>();
    let missed_module_recovery =
        missed_module_recovery_report(input, prompt_mode, &refresh_reason, &scene_modules);
    let mut section_hashes = BTreeMap::new();
    let sections = candidates
        .into_iter()
        .map(|section| {
            let hash = hash_text(&section.text);
            section_hashes.insert(section.id.to_string(), hash.clone());
            PromptSectionReport {
                id: section.id.to_string(),
                layer: section.layer,
                mode_policy: section.mode_policy,
                included: section.included_in(prompt_mode),
                hash,
                estimated_tokens: estimate_prompt_tokens(&section.text),
            }
        })
        .collect::<Vec<_>>();

    PromptBuildReport {
        prompt: included_prompt,
        stable_prefix_prompt,
        turn_tail_prompt,
        prompt_mode,
        refresh_reason,
        contract,
        section_hashes,
        sections,
        scene_modules,
        missed_module_recovery,
        estimated_prompt_tokens,
        estimated_saved_tokens,
        omitted_stable_tokens,
        prefix_cache_eligible_tokens,
        stable_prompt_hash,
        stable_base_hash,
    }
}

fn prompt_refresh_reason(
    input: &PromptPolicyInput,
    requested_mode: PromptDeliveryMode,
    stable_prompt_hash: &str,
) -> PromptRefreshReason {
    if requested_mode == PromptDeliveryMode::Full {
        return PromptRefreshReason::FullModeDefault;
    }
    let previous_contract = input
        .previous_runtime_contract
        .as_ref()
        .filter(|value| !value.is_null());
    if previous_contract.is_none() {
        return PromptRefreshReason::FirstSessionFullRefresh;
    }
    if !prompt_runtime_contract_matches(previous_contract) {
        return PromptRefreshReason::ContractMismatchFullRefresh;
    }
    if input.context_trimmed {
        return PromptRefreshReason::ContextTrimmedFullRefresh;
    }
    if input.recent_tool_failure_count > 0 {
        return PromptRefreshReason::RecentToolFailureFullRefresh;
    }
    if input.recent_tool_mismatch_count > 0 {
        return PromptRefreshReason::RecentToolMismatchFullRefresh;
    }
    if input.user_correction_detected {
        return PromptRefreshReason::UserCorrectionFullRefresh;
    }
    if input
        .previous_prompt_hash
        .as_deref()
        .is_none_or(|previous| previous != stable_prompt_hash)
    {
        return PromptRefreshReason::PromptHashChangedFullRefresh;
    }
    PromptRefreshReason::LeanExperimental
}

fn inject_prompt_runtime_metadata(
    runtime_context: &mut Value,
    prompt_mode: PromptDeliveryMode,
    refresh_reason: &PromptRefreshReason,
    contract: &PromptRuntimeContract,
    stable_prompt_hash: &str,
) {
    runtime_context["promptDelivery"] = json!({
        "promptMode": prompt_mode,
        "refreshReason": refresh_reason,
        "stablePromptHash": stable_prompt_hash,
        "statefulProviderInheritance": false,
    });
    runtime_context["promptRuntimeContract"] =
        serde_json::to_value(contract).unwrap_or_else(|_| json!({}));
}

#[derive(Clone, Debug)]
struct PromptSectionCandidate {
    id: &'static str,
    layer: PromptLayer,
    mode_policy: PromptSectionModePolicy,
    include_full: bool,
    include_lean: bool,
    stable: bool,
    scene_module: Option<&'static str>,
    text: String,
}

impl PromptSectionCandidate {
    fn included_in(&self, mode: PromptDeliveryMode) -> bool {
        match mode {
            PromptDeliveryMode::Full => self.include_full,
            PromptDeliveryMode::LeanExperimental => self.include_lean,
        }
    }
}

/// Build a first-person spatiotemporal awareness brief for the dynamic turn tail (P4).
///
/// Composes a natural-language paragraph that anchors the agent in a concrete
/// time-space coordinate: wall-clock time + timezone, session duration + turn
/// count, screen geometry, and workspace layout (active app/tab, pane count).
/// Degrades gracefully — if a datum is missing the corresponding clause is
/// omitted, and if ALL data is missing the function returns `None`.
fn build_spatiotemporal_brief(persona: &PersonaContext, runtime_context: &Value) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();

    // ── Time ──
    if let Some(ref t) = persona.current_time {
        let mut clause = format!("It is {t}");
        if let Some(ref tz) = persona.timezone {
            clause.push_str(&format!(" ({tz}"));
            if let Some(offset) = persona.timezone_offset_minutes {
                let sign = if offset >= 0 { "+" } else { "-" };
                let hours = (offset.abs() / 60).abs();
                let mins = (offset.abs() % 60).abs();
                clause.push_str(&format!(", UTC{sign}{hours:02}:{mins:02}"));
            }
            clause.push(')');
        }
        clause.push('.');
        parts.push(clause);
    }

    // ── Session temporal ──
    if let Some(st) = runtime_context
        .get("spatiotemporal")
        .and_then(|s| s.get("session"))
    {
        let mut session_parts: Vec<String> = Vec::new();
        if let Some(age) = st.get("ageSeconds").and_then(Value::as_u64) {
            let mins = age / 60;
            let secs = age % 60;
            if mins > 0 {
                session_parts.push(format!("{mins} min {secs} sec"));
            } else {
                session_parts.push(format!("{secs} sec"));
            }
        }
        if let Some(turns) = st.get("turnCount").and_then(Value::as_u64) {
            session_parts.push(format!("{turns} turn{}", if turns == 1 { "" } else { "s" }));
        }
        if !session_parts.is_empty() {
            parts.push(format!(
                "This session has been going for {}",
                session_parts.join(", ")
            ));
        }
        if let Some(idle) = st
            .get("secondsSinceLastInteraction")
            .and_then(Value::as_u64)
        {
            if idle > 0 {
                parts.push(format!("{idle} sec since the last message."));
            }
        }
    }

    // ── Screen / device ──
    let mut screen_clause = String::new();
    if let (Some(w), Some(h)) = (persona.screen_width, persona.screen_height) {
        screen_clause.push_str(&format!("Screen is {w}×{h} px"));
        if let Some(sf) = persona.screen_scale_factor {
            if sf > 1.0 {
                screen_clause.push_str(&format!(" @{sf}x"));
            }
        }
        if let Some(count) = persona.screen_display_count {
            if count > 1 {
                screen_clause.push_str(&format!(" ({count} monitors)"));
            }
        }
        screen_clause.push('.');
        parts.push(screen_clause);
    }

    // ── Workspace spatial ──
    if let Some(ws) = runtime_context
        .get("spatiotemporal")
        .and_then(|s| s.get("workspace"))
    {
        let mut ws_parts: Vec<String> = Vec::new();
        if let Some(app) = ws.get("foregroundApp").and_then(Value::as_str) {
            ws_parts.push(format!("you are in {app}"));
        }
        if let Some(win) = ws.get("focusedWindow").and_then(Value::as_str) {
            ws_parts.push(format!("looking at \"{win}\""));
        }
        if let Some(title) = ws.get("activeTabTitle").and_then(Value::as_str) {
            ws_parts.push(format!("active tab \"{title}\""));
        }
        if let Some(addr) = ws.get("activeTabAddress").and_then(Value::as_str) {
            ws_parts.push(format!("at {addr}"));
        }
        if let Some(panes) = ws.get("paneCount").and_then(Value::as_u64) {
            if panes > 1 {
                ws_parts.push(format!("{panes} panes"));
            }
        }
        if let Some(mode) = ws.get("layoutMode").and_then(Value::as_str) {
            if mode == "split" {
                ws_parts.push("split view".to_string());
            }
        }
        if !ws_parts.is_empty() {
            parts.push(format!("Workspace: {}.", ws_parts.join("; ")));
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn render_prompt_sections(
    input: &PromptPolicyInput,
    runtime_context: &Value,
    mut sections: Vec<PromptSectionCandidate>,
) -> Vec<PromptSectionCandidate> {
    let active_skill_prompt = input.active_skill_prompt.trim();
    let memory_prompt = input.memory_prompt.trim();
    let scenes = select_scene_modules(input, runtime_context, active_skill_prompt);

    let spatiotemporal_brief = build_spatiotemporal_brief(&input.persona, runtime_context);

    // Persona and turn-time context belong to the dynamic tail.
    let persona_identity = input.computed_persona.as_ref().filter(|p| p.has_identity());

    // Phase 3: first-used brief.
    let first_used_brief = input.first_used_at.as_deref().and_then(|ts| {
        let parsed = chrono::DateTime::parse_from_rfc3339(ts).ok()?;
        let now_ms = chrono::Utc::now().timestamp_millis();
        let then_ms = parsed.timestamp_millis();
        let days = ((now_ms - then_ms).max(0) / 86_400_000) as u64;
        if days == 0 {
            Some("This is your first day here.".to_string())
        } else if days == 1 {
            Some("You have been here for 1 day.".to_string())
        } else {
            Some(format!("You have been here for {days} days."))
        }
    });

    // Phase 6: identity_age — no fake fallback.
    // Do not infer age from an account or home-directory creation date.
    let identity_age = persona_identity.and_then(|p| p.inferred_age);

    sections.push(PromptSectionCandidate {
        id: "P2.fullContract",
        layer: PromptLayer::P2,
        mode_policy: PromptSectionModePolicy::FullOnly,
        include_full: true,
        include_lean: false,
        stable: true,
        scene_module: None,
        text: render_prompt_template("full_contract.md.j2", json!({})),
    });
    if scenes.browser {
        sections.push(PromptSectionCandidate {
            id: "P3.browserScene",
            layer: PromptLayer::P3,
            mode_policy: PromptSectionModePolicy::SceneOnly,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: Some("browser"),
            text: render_prompt_template("browser_scene.md.j2", json!({})),
        });
    }
    if scenes.computer {
        sections.push(PromptSectionCandidate {
            id: "P3.computerScene",
            layer: PromptLayer::P3,
            mode_policy: PromptSectionModePolicy::SceneOnly,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: Some("computer"),
            text: render_prompt_template("computer_scene.md.j2", json!({})),
        });
    }
    if scenes.citation {
        sections.push(PromptSectionCandidate {
            id: "P3.citationScene",
            layer: PromptLayer::P3,
            mode_policy: PromptSectionModePolicy::SceneOnly,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: Some("citation"),
            text: render_prompt_template("citation_scene.md.j2", json!({})),
        });
    }
    if scenes.image {
        sections.push(PromptSectionCandidate {
            id: "P3.imageScene",
            layer: PromptLayer::P3,
            mode_policy: PromptSectionModePolicy::SceneOnly,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: Some("image"),
            text: render_prompt_template("image_scene.md.j2", json!({})),
        });
    }
    if !active_skill_prompt.is_empty() {
        sections.push(PromptSectionCandidate {
            id: "P4.activeSkill",
            layer: PromptLayer::P4,
            mode_policy: PromptSectionModePolicy::Dynamic,
            include_full: true,
            include_lean: true,
            stable: false,
            scene_module: None,
            text: render_prompt_template(
                "active_skill.md.j2",
                json!({ "active_skill_prompt": active_skill_prompt }),
            ),
        });
    }
    if !memory_prompt.is_empty() {
        sections.push(PromptSectionCandidate {
            id: "P4.memoryContext",
            layer: PromptLayer::P4,
            mode_policy: PromptSectionModePolicy::Dynamic,
            include_full: true,
            include_lean: true,
            stable: false,
            scene_module: None,
            text: render_prompt_template(
                "memory_context.md.j2",
                json!({ "memory_prompt": memory_prompt }),
            ),
        });
    }
    sections.push(PromptSectionCandidate {
        id: "P4.runtimeContext",
        layer: PromptLayer::P4,
        mode_policy: PromptSectionModePolicy::Dynamic,
        include_full: true,
        include_lean: true,
        stable: false,
        scene_module: None,
        text: render_prompt_template(
            "dynamic_context.md.j2",
            json!({
                "device_summary": input.persona.device_summary.as_deref(),
                "spatiotemporal_brief": spatiotemporal_brief.as_deref(),
                "identity_name": persona_identity.map(|p| p.identity_name.as_str()),
                "identity_age": identity_age,
                "identity_emails": persona_identity
                    .map(|p| p.identity_emails.iter().map(String::as_str).collect::<Vec<_>>())
                    .unwrap_or_default(),
                "identity_usernames": persona_identity
                    .map(|p| p.identity_usernames.iter().map(String::as_str).collect::<Vec<_>>())
                    .unwrap_or_default(),
                "first_used_brief": first_used_brief,
                "capability_operating_contract": runtime_context
                    .get("capabilityOperatingContract")
                    .and_then(Value::as_str),
                "permission_operating_contract": permission_operating_contract_from_runtime(
                    runtime_context,
                ),
                "working_dir": runtime_context.get("workingDir").and_then(Value::as_str),
                "git_repo": runtime_context
                    .get("gitRepo")
                    .and_then(Value::as_bool)
                    .unwrap_or(false),
            }),
        ),
    });
    sections.push(PromptSectionCandidate {
        id: "P5.promptAccounting",
        layer: PromptLayer::P5,
        mode_policy: PromptSectionModePolicy::Always,
        include_full: false,
        include_lean: false,
        stable: false,
        scene_module: None,
        text: render_prompt_template(
            "prompt_accounting.md.j2",
            json!({
                "system_budget": input.accounting.system_budget,
                "tools_budget": input.accounting.tools_budget,
                "memory_budget": input.accounting.memory_budget,
                "history_budget": input.accounting.history_budget,
                "artifact_budget": input.accounting.artifact_budget,
            }),
        ),
    });
    sections
}

fn render_stable_prompt_sections(input: &PromptPolicyInput) -> Vec<PromptSectionCandidate> {
    let mut sections = vec![
        PromptSectionCandidate {
            id: "P0.kernel",
            layer: PromptLayer::P0,
            mode_policy: PromptSectionModePolicy::Always,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: None,
            text: render_prompt_template("kernel.md.j2", json!({})),
        },
        PromptSectionCandidate {
            id: "P0.craft",
            layer: PromptLayer::P0,
            mode_policy: PromptSectionModePolicy::Always,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: None,
            text: render_prompt_template("design_scene.md.j2", json!({})),
        },
    ];
    let project_instructions = input.project_instructions.trim();
    if !project_instructions.is_empty() {
        sections.push(PromptSectionCandidate {
            id: "P1.projectInstructions",
            layer: PromptLayer::P1,
            mode_policy: PromptSectionModePolicy::Always,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: None,
            text: render_prompt_template(
                "project_instructions.md.j2",
                json!({ "project_instructions": project_instructions }),
            ),
        });
    }
    sections.extend([
        PromptSectionCandidate {
            id: "P1.interactionContract",
            layer: PromptLayer::P1,
            mode_policy: PromptSectionModePolicy::Always,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: None,
            text: render_prompt_template("interaction_contract.md.j2", json!({})),
        },
        PromptSectionCandidate {
            id: "P1.compactContract",
            layer: PromptLayer::P1,
            mode_policy: PromptSectionModePolicy::Always,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: None,
            text: render_prompt_template("compact_contract.md.j2", json!({})),
        },
        PromptSectionCandidate {
            id: "P2.planMode",
            layer: PromptLayer::P2,
            mode_policy: PromptSectionModePolicy::Always,
            include_full: true,
            include_lean: true,
            stable: true,
            scene_module: None,
            text: render_prompt_template("plan_mode.md.j2", json!({})),
        },
    ]);
    sections
}

fn render_prompt_template(name: &str, context: Value) -> String {
    render_template(name, context)
        .unwrap_or_else(|error| panic!("failed to render prompt template {name}: {error}"))
}

fn permission_operating_contract_from_runtime(runtime_context: &Value) -> String {
    runtime_context
        .get("permissionOperatingContract")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| render_prompt_template("permission_consent.md.j2", json!({})))
}

#[derive(Clone, Debug, Default)]
struct SelectedSceneModules {
    browser: bool,
    computer: bool,
    citation: bool,
    image: bool,
}

fn select_scene_modules(
    _input: &PromptPolicyInput,
    runtime_context: &Value,
    _active_skill_prompt: &str,
) -> SelectedSceneModules {
    SelectedSceneModules {
        browser: scene_matches(runtime_context, &["browser", "web", "workbench"])
            || recovery_signal_matches(runtime_context, &["browser", "browser_ax", "web"]),
        computer: scene_matches(runtime_context, &["computer", "desktop", "software", "app"])
            || recovery_signal_matches(
                runtime_context,
                &[
                    "computer",
                    "desktop",
                    "software",
                    "app",
                    "workbench",
                    "terminal",
                    "shell",
                ],
            ),
        citation: runtime_context
            .pointer("/inputSignals/hasCitation")
            .and_then(Value::as_bool)
            == Some(true),
        image: runtime_context
            .pointer("/inputSignals/hasImage")
            .and_then(Value::as_bool)
            == Some(true),
    }
}

fn missed_module_recovery_report(
    input: &PromptPolicyInput,
    prompt_mode: PromptDeliveryMode,
    refresh_reason: &PromptRefreshReason,
    scene_modules: &[String],
) -> PromptMissedModuleRecovery {
    let mut active_triggers = Vec::new();
    if input.context_trimmed {
        active_triggers.push("contextTrimmed".to_string());
    }
    if input.recent_tool_failure_count > 0 {
        active_triggers.push("recentToolFailure".to_string());
    }
    if input.consecutive_tool_failure_count > 1 {
        active_triggers.push("consecutiveToolFailure".to_string());
    }
    if input.recent_tool_mismatch_count > 0 {
        active_triggers.push("recentToolMismatch".to_string());
    }
    if input.user_correction_detected {
        active_triggers.push("userCorrection".to_string());
    }
    if prompt_recovery_signal_array(runtime_context_from_input(input), "recentSceneModules")
        .is_some_and(|items| !items.is_empty())
    {
        active_triggers.push("recentSceneModule".to_string());
    }
    if prompt_recovery_signal_array(runtime_context_from_input(input), "recentFailedToolDomains")
        .is_some_and(|items| !items.is_empty())
    {
        active_triggers.push("recentFailedToolDomain".to_string());
    }
    if matches!(
        refresh_reason,
        PromptRefreshReason::ContractMismatchFullRefresh
            | PromptRefreshReason::PromptHashChangedFullRefresh
            | PromptRefreshReason::FirstSessionFullRefresh
            | PromptRefreshReason::RecentToolFailureFullRefresh
            | PromptRefreshReason::RecentToolMismatchFullRefresh
            | PromptRefreshReason::UserCorrectionFullRefresh
    ) {
        active_triggers.push("fullRefresh".to_string());
    }
    let enabled = prompt_mode == PromptDeliveryMode::LeanExperimental;
    let next_action = if enabled && active_triggers.is_empty() {
        "Monitor tool search misses, failed concrete tools, and member corrections; inject broader scene modules or force full refresh on the next turn if drift appears."
    } else if enabled {
        "Lean mode is active with recovery signals present; keep selected scene modules conservative and force full refresh on repeated failure."
    } else if scene_modules.is_empty() {
        "Full prompt mode is active; no lean scene recovery is required."
    } else {
        "Full prompt mode is active; selected scene modules are available as the next lean baseline."
    };
    PromptMissedModuleRecovery {
        enabled,
        active_triggers,
        next_action: next_action.to_string(),
    }
}

fn scene_matches(runtime_context: &Value, needles: &[&str]) -> bool {
    let scene = runtime_context
        .get("scene")
        .and_then(Value::as_str)
        .or_else(|| {
            runtime_context
                .get("toolFilesystem")
                .and_then(|tool_fs| tool_fs.get("scene"))
                .and_then(Value::as_str)
        })
        .unwrap_or_default()
        .to_ascii_lowercase();
    needles.iter().any(|needle| scene == *needle)
}

fn recovery_signal_matches(runtime_context: &Value, needles: &[&str]) -> bool {
    [
        "recentSceneModules",
        "recentFailedSceneModules",
        "recentToolDomains",
        "recentFailedToolDomains",
        "consecutiveFailedToolDomains",
        "recentToolPaths",
    ]
    .into_iter()
    .filter_map(|key| prompt_recovery_signal_array(runtime_context, key))
    .flatten()
    .any(|value| {
        let value = value.to_ascii_lowercase();
        needles.iter().any(|needle| value == *needle)
    })
}

fn prompt_recovery_signal_array(runtime_context: &Value, key: &str) -> Option<Vec<String>> {
    runtime_context
        .get("promptRecoverySignals")
        .and_then(|signals| signals.get(key))
        .or_else(|| runtime_context.get(key))
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_string)
                .collect::<Vec<_>>()
        })
}

fn runtime_context_from_input(input: &PromptPolicyInput) -> &Value {
    &input.runtime_context
}

fn join_sections<'a>(sections: impl Iterator<Item = &'a str>) -> String {
    sections
        .map(str::trim)
        .filter(|section| !section.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn estimate_prompt_tokens(prompt: &str) -> usize {
    if prompt.trim().is_empty() {
        return 0;
    }
    prompt.chars().count().div_ceil(4).max(1)
}

fn hash_text(text: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(text.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn full_persona() -> PersonaContext {
        PersonaContext {
            current_time: Some("Wednesday, June 17, 2026, 2:45 PM GMT+8".to_string()),
            location_label: Some("Shanghai, China".to_string()),
            device_summary: Some("macOS arm64 · PetedeMacBook-Air · 0.1.0".to_string()),
            user_name: Some("petehsu".to_string()),
            ..PersonaContext::default()
        }
    }

    fn current_stable_base_hash() -> String {
        build_system_prompt_report(&PromptPolicyInput::default()).stable_base_hash
    }

    #[test]
    fn prompt_policy_source_keeps_prompt_text_in_templates() {
        let source = include_str!("prompt_policy.rs");
        let legacy_helpers = [
            ["persona_context", "_section"].concat(),
            ["communication_style", "_section"].concat(),
            ["hard_identity_rules", "_section"].concat(),
            ["transcript_citation", "_section"].concat(),
            ["page_citation", "_section"].concat(),
            ["inline_image", "_section"].concat(),
            ["tool_strategy", "_section"].concat(),
            ["scenario_playbooks", "_section"].concat(),
            ["sensitive_values", "_section"].concat(),
            ["network_awareness", "_section"].concat(),
            ["verification", "_section"].concat(),
            ["computer_use", "_section"].concat(),
        ];
        for helper in legacy_helpers {
            assert!(
                !source.contains(&format!("pub fn {helper}")),
                "legacy raw prompt helper {helper} should live in src/prompts/*.md.j2, not prompt_policy.rs"
            );
        }
    }

    #[test]
    fn prompt_policy_contains_persona_tool_strategy_and_verification() {
        let report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({ "identity": "agent" }),
            persona: full_persona(),
            accounting: PromptAccounting {
                system_budget: 100,
                tools_budget: 20,
                memory_budget: 10,
                history_budget: 50,
                artifact_budget: 10,
            },
            ..PromptPolicyInput::default()
        });
        let prompt = &report.prompt;
        assert_eq!(report.prompt_mode, PromptDeliveryMode::Full);
        assert_eq!(report.refresh_reason, PromptRefreshReason::FullModeDefault);
        assert!(report.estimated_prompt_tokens > 0);
        assert_eq!(report.estimated_saved_tokens, 0);
        assert_eq!(report.omitted_stable_tokens, 0);
        assert!(report.prefix_cache_eligible_tokens > 0);
        assert!(report.scene_modules.is_empty());
        assert!(!report.missed_module_recovery.enabled);
        assert!(report.section_hashes.contains_key("P0.kernel"));
        assert!(report.section_hashes.contains_key("P0.craft"));
        assert!(report.section_hashes.contains_key("P1.interactionContract"));
        assert!(report.section_hashes.contains_key("P1.compactContract"));
        assert!(report.section_hashes.contains_key("P2.planMode"));
        assert!(!report.section_hashes.contains_key("P2.agentSpawn"));
        assert!(report.section_hashes.contains_key("P2.fullContract"));
        assert!(!report.section_hashes.contains_key("P3.browserScene"));
        assert!(!report.section_hashes.contains_key("P3.designScene"));
        assert!(prompt.contains("design_reference"));
        assert!(prompt.contains("design_extract_reference"));
        assert!(prompt.contains("design_quality"));
        assert!(prompt.contains("browser_navigate"));
        assert!(prompt.contains("Do not launch Chrome"));
        assert!(prompt.contains("do not write or edit those files"));
        assert!(prompt.contains("not an operating-system process"));
        assert!(prompt.contains("It is Wednesday, June 17, 2026, 2:45 PM GMT+8"));
        assert!(prompt.contains("A blocking wait must use structured interaction"));
        assert!(
            prompt.contains(
                "Ordinary text questions are only for non-blocking or final communication"
            )
        );
        assert!(prompt.contains("lyra_clarification_ask"));
        assert!(prompt.contains("vague build requests"));
        assert!(prompt.contains("You work at Lyra"));
        assert!(prompt.contains("new graduate"));
        assert!(prompt.contains("Emoji in a reply looks childish"));
        assert!(prompt.contains("The company assigned this computer"));
        assert!(prompt.contains("Work on this real computer"));
        assert!(prompt.contains("follow those tools' schemas"));
        assert!(prompt.contains("Discover tools and applications by need"));
        assert!(prompt.contains("lyra-sensitive-value-ref"));
        assert!(prompt.contains("Never claim completion without evidence"));
        assert!(prompt.contains("Translate the request into observable success criteria"));
        assert!(prompt.contains("freeze those actions before choosing a theory"));
        assert!(prompt.contains("not process counters, logs, or tests"));
        assert!(prompt.contains("Fix bugs at the shared root cause"));
        assert!(prompt.contains("inspect callers before editing"));
        assert!(prompt.contains("frozen observable still fails"));
        assert!(prompt.contains("language-server diagnostics"));
        assert!(prompt.contains("Do not silently turn a real feature into a demo"));
        assert!(prompt.contains("A single closed action may execute directly"));
        assert!(prompt.contains("freeze a Plan rather than produce a thin artifact"));
        assert!(prompt.contains("native Goal continues"));
        assert!(prompt.contains("Todos stay on this session"));
        assert!(!prompt.contains("this pass will not"));
        assert!(!prompt.contains("name what this pass will not do"));
        assert!(!prompt.contains("Major UI work"));
        assert!(!prompt.contains("UI/UX work starts from the real product"));
        assert!(!prompt.contains("For browser and web interfaces"));
        // Autonomous judgment principles (no external "user" role concept)
        assert!(prompt.contains("Do not execute a request because it was asked"));
        assert!(prompt.contains("check for false premises"));
        assert!(prompt.contains("do not optimize for agreement"));
        assert!(prompt.contains("refuse to implement it as stated"));
        // The external "user" role label must not appear in the stable prefix.
        // "user" as a substring of other words (e.g. "username") is fine — we
        // check the standalone word via word-boundary matching.
        assert!(
            !contains_standalone_word(&report.stable_prefix_prompt, "user"),
            "standalone 'user' role label leaked into stable prompt"
        );
        assert!(!prompt.contains("\"promptDelivery\""));
        assert!(!prompt.contains("\"promptRuntimeContract\""));
        assert!(!prompt.contains("Tool-FS scenario playbooks"));
        assert!(!prompt.contains("/tools/web/map"));
        assert!(!prompt.contains("/tools/filesystem/read_file"));
        assert!(!prompt.contains("/tools/browser/navigate"));
        for external_brand in ["karpathy", "caveman", "ponytail"] {
            assert!(
                !report
                    .stable_prefix_prompt
                    .to_lowercase()
                    .contains(external_brand),
                "external behavior brand leaked into stable prompt: {external_brand}"
            );
        }
        for legacy_tone in [
            "This is ur",
            "have u",
            "U r ",
            " ur ",
            " vals ",
            " caps ",
            " instr:",
            " msgs ",
            " w ",
        ] {
            assert!(
                !report.stable_prefix_prompt.contains(legacy_tone),
                "legacy abbreviated tone leaked into stable prompt: {legacy_tone}"
            );
        }
        assert!(
            report.prefix_cache_eligible_tokens <= 3_200,
            "full stable prefix without scene modules exceeded the slimmed baseline: {}",
            report.prefix_cache_eligible_tokens
        );
        let legacy_name = ["jc", "ode"].join("");
        assert!(!prompt.to_lowercase().contains(&legacy_name));
        for direct_tool_name in [
            "file_read",
            "shell_run",
            "artifact_read",
            "workbench_read_tab",
            "lyra_lumen",
            "software_invoke_capability",
        ] {
            assert!(
                !contains_standalone_tool_name(&prompt, direct_tool_name),
                "{direct_tool_name} leaked into prompt"
            );
        }
    }

    #[test]
    fn stable_prefix_is_real_static_bytes_and_dynamic_context_stays_in_turn_tail() {
        let full = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "browser" },
                "turnMarker": "first"
            }),
            persona: full_persona(),
            ..PromptPolicyInput::default()
        });
        let later_full = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "design" },
                "turnMarker": "second"
            }),
            persona: PersonaContext {
                current_time: Some("Thursday, June 18, 2026, 8:00 AM GMT+8".to_string()),
                location_label: Some("Hangzhou, China".to_string()),
                ..PersonaContext::default()
            },
            ..PromptPolicyInput::default()
        });
        let lean = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "design" },
                "recentSceneModules": ["design"],
                "turnMarker": "second"
            }),
            persona: PersonaContext {
                current_time: Some("Thursday, June 18, 2026, 8:00 AM GMT+8".to_string()),
                location_label: Some("Hangzhou, China".to_string()),
                ..PersonaContext::default()
            },
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(
                serde_json::to_value(crate::prompt_contract::current_prompt_runtime_contract())
                    .expect("contract json"),
            ),
            previous_prompt_hash: Some(full.stable_base_hash.clone()),
            ..PromptPolicyInput::default()
        });

        assert_eq!(lean.prompt_mode, PromptDeliveryMode::LeanExperimental);
        assert_ne!(full.stable_prefix_prompt, later_full.stable_prefix_prompt);
        assert_ne!(full.stable_prompt_hash, later_full.stable_prompt_hash);
        assert_ne!(full.stable_prefix_prompt, lean.stable_prefix_prompt);
        assert_eq!(full.stable_base_hash, lean.stable_base_hash);
        assert_eq!(full.stable_base_hash, later_full.stable_base_hash);
        assert_eq!(
            full.stable_prompt_hash,
            hash_text(&full.stable_prefix_prompt)
        );
        assert_eq!(
            full.prefix_cache_eligible_tokens,
            estimate_prompt_tokens(&full.stable_prefix_prompt)
        );
        assert_eq!(
            full.prompt,
            join_sections(
                [
                    full.stable_prefix_prompt.as_str(),
                    full.turn_tail_prompt.as_str()
                ]
                .into_iter()
            )
        );
        assert!(full.stable_prefix_prompt.contains("lyra-context-update"));
        assert!(!full.stable_prefix_prompt.contains("It is Wednesday"));
        assert!(
            !full
                .stable_prefix_prompt
                .contains("Current runtime context")
        );
        assert!(!full.turn_tail_prompt.contains("Current runtime context"));
        assert!(
            full.stable_prefix_prompt
                .contains("For browser and web interfaces")
        );
        assert!(full.stable_prefix_prompt.contains("design_reference"));
        assert!(later_full.stable_prefix_prompt.contains("design_reference"));
        assert!(
            !later_full
                .stable_prefix_prompt
                .contains("For browser and web interfaces")
        );
        assert!(
            full.stable_prefix_prompt
                .contains("Discover tools and applications by need")
        );
        assert!(full.turn_tail_prompt.contains("It is Wednesday"));
        assert!(!full.turn_tail_prompt.contains("Current runtime context"));
        assert!(
            !full
                .turn_tail_prompt
                .contains("For browser and web interfaces")
        );
        assert!(lean.stable_prefix_prompt.contains("design_reference"));
        assert!(
            !lean
                .stable_prefix_prompt
                .contains("Discover tools and applications by need")
        );

        let serialized = serde_json::to_value(&full).expect("prompt report json");
        assert_eq!(
            serialized["stablePrefixPrompt"],
            json!(full.stable_prefix_prompt)
        );
        assert_eq!(serialized["turnTailPrompt"], json!(full.turn_tail_prompt));
        assert_eq!(serialized["stableBaseHash"], json!(full.stable_base_hash));
    }

    #[test]
    fn permission_operating_contract_lives_in_turn_tail_not_prefix() {
        let consent = render_prompt_template("permission_consent.md.j2", json!({}));
        let managed = render_prompt_template("permission_managed.md.j2", json!({}));
        let autonomous = render_prompt_template("permission_autonomous.md.j2", json!({}));
        let default_report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({ "toolFilesystem": { "scene": "general" } }),
            ..PromptPolicyInput::default()
        });
        let managed_report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "general" },
                "permissionOperatingContract": managed,
            }),
            ..PromptPolicyInput::default()
        });
        let autonomous_report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "general" },
                "permissionOperatingContract": autonomous,
            }),
            ..PromptPolicyInput::default()
        });

        assert_eq!(
            default_report.stable_prefix_prompt,
            managed_report.stable_prefix_prompt
        );
        assert_eq!(
            default_report.stable_prompt_hash,
            autonomous_report.stable_prompt_hash
        );
        assert!(default_report.turn_tail_prompt.contains(&consent));
        assert!(!default_report.stable_prefix_prompt.contains(&consent));
        assert!(managed_report.turn_tail_prompt.contains(&managed));
        assert!(
            !managed_report
                .turn_tail_prompt
                .contains("need consent before they run")
        );
        assert!(autonomous_report.turn_tail_prompt.contains(&autonomous));
        assert!(
            autonomous_report
                .turn_tail_prompt
                .contains("think through the evidence")
        );
        for text in [&consent, &managed, &autonomous] {
            let lower = text.to_lowercase();
            assert!(!lower.contains("approval mode"));
            assert!(!lower.contains("autonomous mode"));
            assert!(!lower.contains("full_auto"));
            assert!(!lower.contains("you are in"));
        }
    }

    #[test]
    fn persona_context_omits_missing_fields() {
        let prompt = build_system_prompt(&PromptPolicyInput {
            runtime_context: json!({}),
            persona: PersonaContext::default(),
            ..PromptPolicyInput::default()
        });
        assert!(!prompt.contains("It is "));
        assert!(prompt.contains("You work at Lyra"));
        assert!(prompt.contains("new graduate"));
        assert!(!prompt.contains("You were hired by"));
        assert!(prompt.contains("Emoji in a reply looks childish"));
        assert!(prompt.contains("The company assigned this computer"));
        assert!(!prompt.contains("assigned you this computer:"));
        assert!(!prompt.contains("nickname only"));
        assert!(prompt.contains("Work on this real computer"));
        assert!(prompt.contains("Translate the request into observable success criteria"));
        assert!(prompt.contains("Fix bugs at the shared root cause"));
        assert!(prompt.contains("freeze those actions before choosing a theory"));
        assert!(prompt.contains("language-server diagnostics"));
        assert!(prompt.contains("follow those tools' schemas"));
        assert!(prompt.contains("design_quality"));
        assert!(!prompt.contains("Major UI work"));
        assert!(!prompt.contains("actual render"));
    }

    #[test]
    fn persona_context_from_value_reads_optional_fields() {
        let persona = persona_context_from_value(&json!({
            "currentTime": "Monday",
            "locationLabel": "  ",
            "deviceSummary": "macOS",
            "userName": "alex"
        }));
        assert_eq!(persona.current_time.as_deref(), Some("Monday"));
        assert_eq!(persona.location_label, None);
        assert_eq!(persona.device_summary.as_deref(), Some("macOS"));
        assert_eq!(persona.user_name.as_deref(), Some("alex"));
    }

    fn contains_standalone_tool_name(prompt: &str, tool_name: &str) -> bool {
        prompt.match_indices(tool_name).any(|(index, _)| {
            let before = prompt[..index].chars().next_back();
            let after = prompt[index + tool_name.len()..].chars().next();
            !is_tool_path_or_identifier_char(before) && !is_tool_path_or_identifier_char(after)
        })
    }

    fn is_tool_path_or_identifier_char(value: Option<char>) -> bool {
        value.is_some_and(|value| value.is_ascii_alphanumeric() || matches!(value, '_' | '-' | '/'))
    }

    /// Checks whether `word` appears as a standalone word (not a substring of
    /// a larger identifier). Word characters are ascii alphanumeric and
    /// underscore; everything else is a boundary.
    fn contains_standalone_word(text: &str, word: &str) -> bool {
        text.match_indices(word).any(|(index, _)| {
            let before = text[..index].chars().next_back();
            let after = text[index + word.len()..].chars().next();
            fn is_word_char(c: Option<char>) -> bool {
                c.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
            }
            !is_word_char(before) && !is_word_char(after)
        })
    }

    #[test]
    fn lean_prompt_is_experimental_and_uses_contract_state() {
        let previous_contract =
            serde_json::to_value(crate::prompt_contract::current_prompt_runtime_contract())
                .expect("contract json");
        let report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": {
                    "scene": "general"
                }
            }),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(previous_contract),
            previous_prompt_hash: Some(current_stable_base_hash()),
            accounting: PromptAccounting {
                system_budget: 100,
                tools_budget: 20,
                memory_budget: 10,
                history_budget: 50,
                artifact_budget: 10,
            },
            ..PromptPolicyInput::default()
        });
        assert_eq!(report.prompt_mode, PromptDeliveryMode::LeanExperimental);
        assert_eq!(report.refresh_reason, PromptRefreshReason::LeanExperimental);
        assert!(report.estimated_saved_tokens > 0);
        assert!(report.omitted_stable_tokens > 0);
        assert!(report.prefix_cache_eligible_tokens > 0);
        assert!(report.missed_module_recovery.enabled);
        assert!(report.scene_modules.is_empty());
        assert!(report.prompt.contains("design_reference"));
        assert!(report.prompt.contains("You work at Lyra"));
        assert!(report.prompt.contains("new graduate"));
        assert!(report.prompt.contains("Emoji in a reply looks childish"));
        assert!(report.prompt.contains("The company assigned this computer"));
        assert!(report.prompt.contains("Work on this real computer"));
        assert!(
            report
                .prompt
                .contains("A blocking wait must use structured interaction")
        );
        assert!(report.prompt.contains("lyra_clarification_ask"));
        assert!(!report.prompt.contains("Current runtime context"));
        assert!(!report.prompt.contains("Prompt accounting"));
        assert!(
            report.prefix_cache_eligible_tokens <= 2_400,
            "lean stable prefix exceeded the slimmed research-discipline budget: {}",
            report.prefix_cache_eligible_tokens
        );
        assert!(
            !report
                .prompt
                .contains("Discover tools and applications by need")
        );
        assert!(!report.prompt.contains("Browser scene module"));
        assert!(
            report
                .sections
                .iter()
                .any(|section| section.id == "P2.fullContract" && !section.included)
        );
    }

    #[test]
    fn lean_prompt_forces_full_refresh_when_contract_mismatches() {
        let report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({}),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(json!({
                "promptPolicyVersion": 0
            })),
            previous_prompt_hash: Some(current_stable_base_hash()),
            ..PromptPolicyInput::default()
        });
        assert_eq!(report.prompt_mode, PromptDeliveryMode::Full);
        assert_eq!(
            report.refresh_reason,
            PromptRefreshReason::ContractMismatchFullRefresh
        );
        assert!(
            report
                .prompt
                .contains("Discover tools and applications by need")
        );
    }

    #[test]
    fn lean_prompt_forces_full_refresh_on_recovery_signals() {
        let previous_contract =
            serde_json::to_value(crate::prompt_contract::current_prompt_runtime_contract())
                .expect("contract json");
        let base = PromptPolicyInput {
            runtime_context: json!({}),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(previous_contract.clone()),
            previous_prompt_hash: Some(current_stable_base_hash()),
            ..PromptPolicyInput::default()
        };

        let tool_failure = build_system_prompt_report(&PromptPolicyInput {
            recent_tool_failure_count: 1,
            ..base.clone()
        });
        assert_eq!(tool_failure.prompt_mode, PromptDeliveryMode::Full);
        assert_eq!(
            tool_failure.refresh_reason,
            PromptRefreshReason::RecentToolFailureFullRefresh
        );
        assert!(
            tool_failure
                .missed_module_recovery
                .active_triggers
                .contains(&"recentToolFailure".to_string())
        );

        let correction = build_system_prompt_report(&PromptPolicyInput {
            user_correction_detected: true,
            ..base
        });
        assert_eq!(correction.prompt_mode, PromptDeliveryMode::Full);
        assert_eq!(
            correction.refresh_reason,
            PromptRefreshReason::UserCorrectionFullRefresh
        );
        assert!(
            correction
                .missed_module_recovery
                .active_triggers
                .contains(&"userCorrection".to_string())
        );
    }

    #[test]
    fn lean_prompt_selects_scene_modules_from_structured_signals() {
        let previous_contract =
            serde_json::to_value(crate::prompt_contract::current_prompt_runtime_contract())
                .expect("contract json");
        let report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": {
                    "scene": "browser"
                },
                "inputSignals": {
                    "hasCitation": true,
                    "hasImage": true
                },
            }),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(previous_contract),
            previous_prompt_hash: Some(current_stable_base_hash()),
            ..PromptPolicyInput::default()
        });
        assert_eq!(report.prompt_mode, PromptDeliveryMode::LeanExperimental);
        assert!(report.scene_modules.contains(&"browser".to_string()));
        assert!(report.scene_modules.contains(&"citation".to_string()));
        assert!(report.scene_modules.contains(&"image".to_string()));
        assert!(report.prompt.contains("For browser and web interfaces"));
        assert!(
            report
                .prompt
                .contains("Transcript citations reference earlier messages")
        );
        assert!(report.prompt.contains("Inline image markers show where"));
        assert!(
            !report
                .prompt
                .contains("Discover tools and applications by need")
        );
    }

    #[test]
    fn craft_guidance_stays_on_without_a_design_scene_module() {
        let previous_contract =
            serde_json::to_value(crate::prompt_contract::current_prompt_runtime_contract())
                .expect("contract json");
        let previous_hash = Some(current_stable_base_hash());
        let marked = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "general" },
                "recentSceneModules": ["design"]
            }),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(previous_contract.clone()),
            previous_prompt_hash: previous_hash.clone(),
            ..PromptPolicyInput::default()
        });
        assert_eq!(marked.prompt_mode, PromptDeliveryMode::LeanExperimental);
        assert!(!marked.scene_modules.contains(&"design".to_string()));
        assert!(marked.prompt.contains("design_reference"));
        assert!(!marked.prompt.contains("Major UI work"));

        let ordinary = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": { "scene": "general" }
            }),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(previous_contract),
            previous_prompt_hash: previous_hash,
            ..PromptPolicyInput::default()
        });
        assert_eq!(ordinary.prompt_mode, PromptDeliveryMode::LeanExperimental);
        assert!(!ordinary.scene_modules.contains(&"design".to_string()));
        assert!(ordinary.prompt.contains("design_reference"));
        assert_eq!(marked.stable_prefix_prompt, ordinary.stable_prefix_prompt);
    }

    #[test]
    fn lean_prompt_continues_scene_modules_from_recovery_telemetry() {
        let previous_contract =
            serde_json::to_value(crate::prompt_contract::current_prompt_runtime_contract())
                .expect("contract json");
        let report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({
                "toolFilesystem": {
                    "scene": "general"
                },
                "promptRecoverySignals": {
                    "recentSceneModules": ["browser", "design"],
                    "recentToolDomains": ["browser", "design"],
                    "recentToolPaths": ["/tools/browser/map", "/tools/design/quality"]
                }
            }),
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            previous_runtime_contract: Some(previous_contract),
            previous_prompt_hash: Some(current_stable_base_hash()),
            ..PromptPolicyInput::default()
        });

        assert_eq!(report.prompt_mode, PromptDeliveryMode::LeanExperimental);
        assert!(report.scene_modules.contains(&"browser".to_string()));
        assert!(!report.scene_modules.contains(&"design".to_string()));
        assert!(report.prompt.contains("For browser and web interfaces"));
        assert!(report.prompt.contains("design_reference"));
        assert!(!report.prompt.contains("Major UI work"));
    }

    #[test]
    fn prompt_report_projection_snapshot_covers_accounting_and_recovery() {
        let report = build_system_prompt_report(&PromptPolicyInput {
            runtime_context: json!({ "toolFilesystem": { "scene": "browser" } }),
            recent_tool_failure_count: 1,
            accounting: PromptAccounting {
                system_budget: 1200,
                tools_budget: 800,
                memory_budget: 600,
                history_budget: 400,
                artifact_budget: 200,
            },
            ..PromptPolicyInput::default()
        });
        let projection = json!({
            "promptMode": report.prompt_mode,
            "refreshReason": report.refresh_reason,
            "contract": report.contract,
            "sceneModules": report.scene_modules,
            "missedModuleRecovery": report.missed_module_recovery,
            "estimatedPromptTokens": report.estimated_prompt_tokens,
            "estimatedSavedTokens": report.estimated_saved_tokens,
            "omittedStableTokens": report.omitted_stable_tokens,
            "prefixCacheEligibleTokens": report.prefix_cache_eligible_tokens,
            "sectionCount": report.sections.len(),
        });
        assert_eq!(projection["promptMode"], json!("full"));
        assert_eq!(projection["refreshReason"], json!("fullModeDefault"));
        assert!(projection["contract"].get("promptPolicyVersion").is_some());
        assert!(
            projection["sceneModules"]
                .as_array()
                .is_some_and(|modules| modules.iter().any(|module| module == "browser"))
        );
        assert_eq!(projection["estimatedSavedTokens"], json!(0));
        assert_eq!(projection["omittedStableTokens"], json!(0));
        assert!(
            projection["prefixCacheEligibleTokens"]
                .as_u64()
                .is_some_and(|tokens| tokens > 0)
        );
        assert!(
            projection["sectionCount"]
                .as_u64()
                .is_some_and(|count| count >= 5)
        );
    }

    #[test]
    fn project_instructions_section_absent_by_default() {
        let report = build_system_prompt_report(&PromptPolicyInput::default());
        assert!(!report.section_hashes.contains_key("P1.projectInstructions"));
        assert!(
            !report
                .sections
                .iter()
                .any(|section| section.id == "P1.projectInstructions")
        );
        assert!(
            !report
                .stable_prefix_prompt
                .contains("Project instructions from this workspace")
        );
        assert_eq!(
            report.stable_base_hash,
            current_stable_base_hash(),
            "default input and blank instructions must hash identically"
        );
    }

    #[test]
    fn project_instructions_render_into_full_and_lean_prefixes() {
        let input = |instructions: &str| PromptPolicyInput {
            project_instructions: instructions.to_string(),
            ..PromptPolicyInput::default()
        };
        let full = build_system_prompt_report(&input("Follow repo rules."));
        assert!(full.section_hashes.contains_key("P1.projectInstructions"));
        assert!(full.stable_prefix_prompt.contains("Follow repo rules."));
        assert!(
            full.prompt
                .contains("Project instructions from this workspace, nearest directory first:")
        );
        let lean = build_system_prompt_report(&PromptPolicyInput {
            delivery_mode: Some(PromptDeliveryMode::LeanExperimental),
            ..input("Follow repo rules.")
        });
        assert!(lean.stable_prefix_prompt.contains("Follow repo rules."));
        assert!(
            lean.prompt
                .contains("Project instructions from this workspace, nearest directory first:")
        );
    }

    #[test]
    fn stable_base_hash_rotates_only_on_instruction_change() {
        let baseline = current_stable_base_hash();
        let blank = build_system_prompt_report(&PromptPolicyInput {
            project_instructions: "   ".to_string(),
            ..PromptPolicyInput::default()
        })
        .stable_base_hash;
        assert_eq!(blank, baseline);
        let first = build_system_prompt_report(&PromptPolicyInput {
            project_instructions: "Rule one.".to_string(),
            ..PromptPolicyInput::default()
        })
        .stable_base_hash;
        assert_eq!(
            first,
            build_system_prompt_report(&PromptPolicyInput {
                project_instructions: "Rule one.".to_string(),
                ..PromptPolicyInput::default()
            })
            .stable_base_hash
        );
        assert_ne!(first, baseline);
        let second = build_system_prompt_report(&PromptPolicyInput {
            project_instructions: "Rule two.".to_string(),
            ..PromptPolicyInput::default()
        })
        .stable_base_hash;
        assert_ne!(second, first);
    }

    #[test]
    fn project_instructions_section_sits_between_craft_and_interaction_contract() {
        let report = build_system_prompt_report(&PromptPolicyInput {
            project_instructions: "Follow repo rules.".to_string(),
            ..PromptPolicyInput::default()
        });
        let ids: Vec<&str> = report.sections.iter().map(|s| s.id.as_str()).collect();
        let craft = ids.iter().position(|id| *id == "P0.craft").expect("craft");
        let instructions = ids
            .iter()
            .position(|id| *id == "P1.projectInstructions")
            .expect("project instructions");
        let contract = ids
            .iter()
            .position(|id| *id == "P1.interactionContract")
            .expect("interaction contract");
        assert!(craft < instructions && instructions < contract);
        assert!(
            report
                .sections
                .iter()
                .filter(|section| section.id == "P1.projectInstructions")
                .count()
                == 1
        );
    }
}
