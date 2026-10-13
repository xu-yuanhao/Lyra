use super::*;

const PERMISSION_POLICY_VERSION: u64 = 1;
const PERMISSION_POLICY_DIR: &str = ".lyra/agent";
const PERMISSION_POLICY_FILE: &str = "permission-policy.json";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum PermissionPolicyDecision {
    Allow,
    Ask,
    Deny,
}

/// Test-only session-scoped policy overrides: parallel tests must not share
/// the global policy file (a pinned ask policy would leak into unrelated
/// file-writing tests running in the same process).
#[cfg(test)]
fn session_policy_overrides()
-> &'static std::sync::Mutex<std::collections::HashMap<String, PermissionPolicyConfig>> {
    use std::sync::OnceLock;
    static OVERRIDES: OnceLock<
        std::sync::Mutex<std::collections::HashMap<String, PermissionPolicyConfig>>,
    > = OnceLock::new();
    OVERRIDES.get_or_init(|| std::sync::Mutex::new(std::collections::HashMap::new()))
}

#[cfg(test)]
pub(crate) fn set_session_policy_override_for_tests(
    session_id: &str,
    config: PermissionPolicyConfig,
) {
    session_policy_overrides()
        .lock()
        .expect("session policy override lock")
        .insert(session_id.to_string(), config);
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct PermissionPolicyRule {
    #[serde(skip_serializing_if = "Option::is_none")]
    tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    action: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    risk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pattern: Option<String>,
    decision: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PermissionPolicyConfig {
    version: u64,
    mode: String,
    rules: Vec<PermissionPolicyRule>,
    #[serde(skip_serializing_if = "Option::is_none")]
    elevation_credential_ref: Option<Value>,
}

fn home_dir() -> AgentRuntimeResult<PathBuf> {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .ok_or_else(|| {
            AgentRuntimeError::Core("Unable to resolve user home directory.".to_string())
        })
}

fn permission_policy_path() -> AgentRuntimeResult<PathBuf> {
    if cfg!(test) {
        return Ok(runtime_root()
            .join(PERMISSION_POLICY_DIR)
            .join(PERMISSION_POLICY_FILE));
    }
    Ok(home_dir()?
        .join(PERMISSION_POLICY_DIR)
        .join(PERMISSION_POLICY_FILE))
}

fn approval_preset(elevation_credential_ref: Option<Value>) -> PermissionPolicyConfig {
    PermissionPolicyConfig {
        version: PERMISSION_POLICY_VERSION,
        mode: "approval".to_string(),
        rules: vec![
            PermissionPolicyRule {
                tool: None,
                action: None,
                risk: Some("file".to_string()),
                pattern: None,
                decision: "allow".to_string(),
            },
            PermissionPolicyRule {
                tool: None,
                action: None,
                risk: None,
                pattern: None,
                decision: "ask".to_string(),
            },
        ],
        elevation_credential_ref,
    }
}

fn is_legacy_approval_catch_all(config: &PermissionPolicyConfig) -> bool {
    config.mode == "approval"
        && config.rules.len() == 1
        && config.rules[0].tool.is_none()
        && config.rules[0].action.is_none()
        && config.rules[0].risk.is_none()
        && config.rules[0].pattern.is_none()
        && config.rules[0].decision == "ask"
}

fn migrate_legacy_approval_catch_all(config: PermissionPolicyConfig) -> PermissionPolicyConfig {
    if !is_legacy_approval_catch_all(&config) {
        return config;
    }
    let migrated = approval_preset(config.elevation_credential_ref.clone());
    let _ = write_policy_config(&migrated);
    migrated
}

fn full_auto_preset(elevation_credential_ref: Option<Value>) -> PermissionPolicyConfig {
    PermissionPolicyConfig {
        version: PERMISSION_POLICY_VERSION,
        mode: "full_auto".to_string(),
        rules: vec![PermissionPolicyRule {
            tool: None,
            action: None,
            risk: None,
            pattern: None,
            decision: "allow".to_string(),
        }],
        elevation_credential_ref,
    }
}

fn autonomous_preset(elevation_credential_ref: Option<Value>) -> PermissionPolicyConfig {
    PermissionPolicyConfig {
        mode: "autonomous".to_string(),
        ..full_auto_preset(elevation_credential_ref)
    }
}

fn normalized_without_credential(config: &PermissionPolicyConfig) -> PermissionPolicyConfig {
    PermissionPolicyConfig {
        elevation_credential_ref: None,
        ..config.clone()
    }
}

fn validate_policy(config: PermissionPolicyConfig) -> AgentRuntimeResult<PermissionPolicyConfig> {
    if config.version != PERMISSION_POLICY_VERSION {
        return Err(AgentRuntimeError::Core(format!(
            "Unsupported permission policy version: {}",
            config.version
        )));
    }
    if !matches!(
        config.mode.as_str(),
        "approval" | "full_auto" | "autonomous"
    ) {
        return Err(AgentRuntimeError::Core(format!(
            "Unsupported permission policy mode: {}",
            config.mode
        )));
    }
    for rule in &config.rules {
        if !matches!(rule.decision.as_str(), "allow" | "ask" | "deny") {
            return Err(AgentRuntimeError::Core(format!(
                "Unsupported permission policy decision: {}",
                rule.decision
            )));
        }
    }
    Ok(config)
}

fn read_policy_config() -> AgentRuntimeResult<(PermissionPolicyConfig, bool, Option<String>)> {
    let path = permission_policy_path()?;
    if !path.exists() {
        return Ok((approval_preset(None), false, None));
    }
    let raw = fs::read_to_string(&path).map_err(|error| {
        AgentRuntimeError::Core(format!("Failed to read permission policy: {error}"))
    })?;
    match serde_json::from_str::<PermissionPolicyConfig>(&raw)
        .map_err(|error| {
            AgentRuntimeError::Core(format!("Invalid permission policy JSON: {error}"))
        })
        .and_then(validate_policy)
    {
        Ok(config) => Ok((migrate_legacy_approval_catch_all(config), true, None)),
        Err(error) => Ok((approval_preset(None), true, Some(error.to_string()))),
    }
}

#[cfg(test)]
pub(crate) fn pin_full_auto_policy_for_session(session_id: &str) {
    set_session_policy_override_for_tests(session_id, full_auto_preset(None));
}

#[cfg(test)]
pub(crate) fn pin_ask_for_file_policy_for_session(session_id: &str) {
    set_session_policy_override_for_tests(
        session_id,
        PermissionPolicyConfig {
            version: PERMISSION_POLICY_VERSION,
            mode: "approval".to_string(),
            rules: vec![
                PermissionPolicyRule {
                    tool: None,
                    action: None,
                    risk: Some("file".to_string()),
                    pattern: None,
                    decision: "ask".to_string(),
                },
                PermissionPolicyRule {
                    tool: None,
                    action: None,
                    risk: None,
                    pattern: None,
                    decision: "ask".to_string(),
                },
            ],
            elevation_credential_ref: None,
        },
    );
}

pub(crate) fn write_policy_config(config: &PermissionPolicyConfig) -> AgentRuntimeResult<()> {
    let path = permission_policy_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            AgentRuntimeError::Core(format!(
                "Failed to create permission policy directory: {error}"
            ))
        })?;
    }
    let serialized = serde_json::to_string_pretty(config).map_err(|error| {
        AgentRuntimeError::Core(format!("Failed to serialize permission policy: {error}"))
    })?;
    fs::write(&path, format!("{serialized}\n")).map_err(|error| {
        AgentRuntimeError::Core(format!("Failed to write permission policy: {error}"))
    })
}

fn mode_label(config: &PermissionPolicyConfig, valid: bool) -> String {
    if !valid {
        return "custom".to_string();
    }
    let normalized = normalized_without_credential(config);
    if normalized == normalized_without_credential(&approval_preset(None)) {
        return "approval".to_string();
    }
    if normalized == normalized_without_credential(&full_auto_preset(None)) {
        return "full_auto".to_string();
    }
    if normalized == normalized_without_credential(&autonomous_preset(None)) {
        return "autonomous".to_string();
    }
    "custom".to_string()
}

fn permission_operating_contract_template(mode: &str) -> &'static str {
    match mode {
        "full_auto" => "permission_managed.md.j2",
        "autonomous" => "permission_autonomous.md.j2",
        _ => "permission_consent.md.j2",
    }
}

pub(crate) fn permission_operating_contract_for_mode(mode: &str) -> String {
    let name = permission_operating_contract_template(mode);
    crate::prompt_templates::render_template(name, json!({}))
        .unwrap_or_else(|error| panic!("failed to render prompt template {name}: {error}"))
}

pub(crate) fn permission_operating_contract_text() -> String {
    let mode = read_permission_policy()
        .ok()
        .and_then(|value| {
            value
                .get("mode")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .unwrap_or_else(|| "approval".to_string());
    permission_operating_contract_for_mode(&mode)
}

pub(crate) fn is_autonomous_permission_mode() -> bool {
    read_permission_policy()
        .ok()
        .and_then(|value| {
            value
                .get("mode")
                .and_then(Value::as_str)
                .map(|mode| mode == "autonomous")
        })
        .unwrap_or(false)
}

pub(crate) fn read_permission_policy() -> AgentRuntimeResult<Value> {
    let path = permission_policy_path()?;
    let (config, exists, warning) = read_policy_config()?;
    let valid = warning.is_none();
    Ok(json!({
        "mode": mode_label(&config, valid),
        "effectiveMode": config.mode,
        "valid": valid,
        "configPath": path.to_string_lossy(),
        "exists": exists,
        "warning": warning,
        "elevationCredentialRef": config.elevation_credential_ref,
    }))
}

pub(crate) fn set_permission_policy_mode(payload: Value) -> AgentRuntimeResult<Value> {
    let mode = string_opt(&payload, "mode")
        .ok_or_else(|| AgentRuntimeError::Core("mode is required".to_string()))?;
    let elevation_credential_ref = payload.get("elevationCredentialRef").cloned();
    let current_ref = read_policy_config()
        .ok()
        .and_then(|(config, _, _)| config.elevation_credential_ref);
    let credential_ref = elevation_credential_ref.or(current_ref);
    let config = match mode.as_str() {
        "approval" => approval_preset(credential_ref),
        "full_auto" => full_auto_preset(credential_ref),
        "autonomous" => autonomous_preset(credential_ref),
        _ => {
            return Err(AgentRuntimeError::Core(format!(
                "Unsupported permission policy mode: {mode}"
            )));
        }
    };
    write_policy_config(&config)?;
    read_permission_policy()
}

fn rule_matches(
    rule: &PermissionPolicyRule,
    display_name: &str,
    action: &str,
    risk: Option<&str>,
    input: &Value,
) -> bool {
    if rule
        .tool
        .as_deref()
        .is_some_and(|tool| tool != display_name)
    {
        return false;
    }
    if rule
        .action
        .as_deref()
        .is_some_and(|rule_action| rule_action != action)
    {
        return false;
    }
    if rule
        .risk
        .as_deref()
        .is_some_and(|rule_risk| Some(rule_risk) != risk)
    {
        return false;
    }
    if let Some(pattern) = rule.pattern.as_deref() {
        let haystack = permission_summary(display_name, action, input);
        if !haystack.contains(pattern) {
            return false;
        }
    }
    true
}

pub(crate) fn evaluate_permission_policy(
    display_name: &str,
    action: &str,
    risk: Option<&str>,
    input: &Value,
) -> PermissionPolicyDecision {
    let Ok((config, warning)) = effective_policy_config(None) else {
        return PermissionPolicyDecision::Ask;
    };
    evaluate_policy_config(&config, warning, display_name, action, risk, input)
}

pub(crate) fn evaluate_permission_policy_for_session(
    session_id: &str,
    display_name: &str,
    action: &str,
    risk: Option<&str>,
    input: &Value,
) -> PermissionPolicyDecision {
    let Ok((config, warning)) = effective_policy_config(Some(session_id)) else {
        return PermissionPolicyDecision::Ask;
    };
    evaluate_policy_config(&config, warning, display_name, action, risk, input)
}

fn effective_policy_config(
    session_id: Option<&str>,
) -> AgentRuntimeResult<(PermissionPolicyConfig, Option<String>)> {
    #[cfg(test)]
    if let Some(session_id) = session_id
        && let Some(config) = session_policy_overrides()
            .lock()
            .ok()
            .and_then(|overrides| overrides.get(session_id).cloned())
    {
        return Ok((config, None));
    }
    let (config, _, warning) = read_policy_config()?;
    Ok((config, warning))
}

fn evaluate_policy_config(
    config: &PermissionPolicyConfig,
    warning: Option<String>,
    display_name: &str,
    action: &str,
    risk: Option<&str>,
    input: &Value,
) -> PermissionPolicyDecision {
    if warning.is_some() {
        return PermissionPolicyDecision::Ask;
    }
    for rule in &config.rules {
        if !rule_matches(rule, display_name, action, risk, input) {
            continue;
        }
        return match rule.decision.as_str() {
            "allow" => PermissionPolicyDecision::Allow,
            "deny" => PermissionPolicyDecision::Deny,
            _ => PermissionPolicyDecision::Ask,
        };
    }
    if matches!(config.mode.as_str(), "full_auto" | "autonomous") {
        PermissionPolicyDecision::Allow
    } else {
        PermissionPolicyDecision::Ask
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn autonomous_preset_is_not_full_auto_and_keeps_allow_rules() {
        let full_auto = full_auto_preset(None);
        let autonomous = autonomous_preset(None);
        assert_eq!(mode_label(&full_auto, true), "full_auto");
        assert_eq!(mode_label(&autonomous, true), "autonomous");
        assert_eq!(full_auto.rules, autonomous.rules);
        assert_ne!(full_auto.mode, autonomous.mode);
    }

    #[test]
    fn permission_operating_contract_maps_modes_without_naming_them() {
        let consent = permission_operating_contract_for_mode("approval");
        let custom = permission_operating_contract_for_mode("custom");
        let managed = permission_operating_contract_for_mode("full_auto");
        let autonomous = permission_operating_contract_for_mode("autonomous");
        assert_eq!(consent, custom);
        assert!(consent.contains("need consent"));
        assert!(managed.contains("do not need per-action consent"));
        assert!(autonomous.contains("do not need approval or consent"));
        assert!(autonomous.contains("think through the evidence"));
        for text in [&consent, &managed, &autonomous] {
            let lower = text.to_lowercase();
            assert!(!lower.contains("approval mode"));
            assert!(!lower.contains("autonomous mode"));
            assert!(!lower.contains("full_auto"));
            assert!(!lower.contains("you are in"));
        }
    }

    #[test]
    fn approval_preset_allows_workspace_file_edits_and_asks_everything_else() {
        let config = approval_preset(None);
        assert_eq!(config.rules[0].risk.as_deref(), Some("file"));
        assert_eq!(config.rules[0].decision, "allow");
        assert!(rule_matches(
            &config.rules[0],
            "file",
            "write",
            Some("file"),
            &json!({})
        ));
        assert!(!rule_matches(
            &config.rules[0],
            "shell",
            "run",
            Some("shell"),
            &json!({})
        ));
        assert!(rule_matches(
            &config.rules[1],
            "shell",
            "run",
            Some("shell"),
            &json!({})
        ));
        assert_eq!(config.rules[1].decision, "ask");
        let legacy = PermissionPolicyConfig {
            version: PERMISSION_POLICY_VERSION,
            mode: "approval".to_string(),
            rules: vec![PermissionPolicyRule {
                tool: None,
                action: None,
                risk: None,
                pattern: None,
                decision: "ask".to_string(),
            }],
            elevation_credential_ref: None,
        };
        assert!(is_legacy_approval_catch_all(&legacy));
        assert!(!is_legacy_approval_catch_all(&config));
    }
}
