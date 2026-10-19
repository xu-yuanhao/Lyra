use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, SystemTime},
};

#[cfg(test)]
use std::sync::atomic::{AtomicUsize, Ordering};

use serde_json::Value;

use crate::native_backend::{
    CapabilitySupport, NativeCapabilityEvidence, NativeModelCapabilityRecord, NativeProviderModel,
    NativeReasoningControl, NativeReasoningKind, ReasoningReplayField,
};

use super::model_capabilities::{
    FEATURE_REASONING, FEATURE_REASONING_EFFORT, FEATURE_STRUCTURED_OUTPUT, FEATURE_TEMPERATURE,
    FEATURE_TOOL_CALLING, INPUT_AUDIO, INPUT_IMAGE, INPUT_PDF, INPUT_TEXT, INPUT_VIDEO,
    OPERATION_IMAGE_GENERATION, OPERATION_LANGUAGE, OPERATION_SPEECH_GENERATION,
    OPERATION_TRANSCRIPTION, OPERATION_VIDEO_GENERATION, OUTPUT_AUDIO, OUTPUT_IMAGE, OUTPUT_TEXT,
    OUTPUT_VIDEO,
};

const MODELS_DEV_URL: &str = "https://models.dev/api.json";
const EMBEDDED_MODELS_DEV_SNAPSHOT: &str =
    include_str!("../../../assets/model-capabilities/models-dev-snapshot.v1.json");
const CATALOG_CACHE_TTL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Clone, Debug, Default)]
pub(crate) struct ModelDevCapabilities {
    pub(crate) capabilities: HashMap<String, CapabilitySupport>,
    pub(crate) reasoning_replay_field: Option<ReasoningReplayField>,
    pub(crate) context_window: Option<usize>,
    pub(crate) reasoning_control: Option<NativeReasoningControl>,
    pub(crate) api_npm: Option<String>,
}

struct CatalogNpmMemo {
    mtime: Option<SystemTime>,
    maps: HashMap<String, HashMap<String, ModelDevCapabilities>>,
    consensus: HashMap<String, ModelDevCapabilities>,
    consensus_ready: bool,
}

static CATALOG_NPM_MEMO: Mutex<Option<CatalogNpmMemo>> = Mutex::new(None);

#[cfg(test)]
static CATALOG_READS: AtomicUsize = AtomicUsize::new(0);

/// Fetch only the configured provider's section from models.dev's provider-aware
/// catalog. This is called exclusively from the explicit refresh flow.
pub(crate) fn fetch_capability_map(provider_id: &str) -> HashMap<String, ModelDevCapabilities> {
    if let Some(body) = read_cached_catalog(true) {
        return parse_provider_catalog(&body, provider_id);
    }
    let client =
        crate::native_backend::network::http_client_builder(std::time::Duration::from_secs(10))
            .build();
    let Ok(client) = client else {
        return stale_capability_map(provider_id);
    };
    let Ok(response) = client.get(MODELS_DEV_URL).send() else {
        return stale_capability_map(provider_id);
    };
    if !response.status().is_success() {
        return stale_capability_map(provider_id);
    }
    let body: Value = match response.json() {
        Ok(body) => body,
        Err(_) => return stale_capability_map(provider_id),
    };
    let _ = crate::native_backend::state::write_json(&catalog_cache_path(), &body);
    parse_provider_catalog(&body, provider_id)
}

fn stale_capability_map(provider_id: &str) -> HashMap<String, ModelDevCapabilities> {
    read_cached_catalog(false)
        .or_else(|| serde_json::from_str(EMBEDDED_MODELS_DEV_SNAPSHOT).ok())
        .map(|body| parse_provider_catalog(&body, provider_id))
        .unwrap_or_default()
}

fn catalog_cache_path() -> PathBuf {
    crate::native_backend::state::runtime_root()
        .join("cache")
        .join("model-capabilities")
        .join("models-dev-api.json")
}

fn read_cached_catalog(require_fresh: bool) -> Option<Value> {
    #[cfg(test)]
    CATALOG_READS.fetch_add(1, Ordering::Relaxed);
    let path = catalog_cache_path();
    if require_fresh {
        let modified = fs::metadata(&path).ok()?.modified().ok()?;
        let age = SystemTime::now().duration_since(modified).ok()?;
        if age > CATALOG_CACHE_TTL {
            return None;
        }
    }
    crate::native_backend::state::read_json(&path)
}

fn with_catalog_memo<T>(f: impl FnOnce(&mut CatalogNpmMemo) -> T) -> Option<T> {
    let mtime = fs::metadata(catalog_cache_path())
        .ok()
        .and_then(|metadata| metadata.modified().ok());
    let mut slot = CATALOG_NPM_MEMO.lock().ok()?;
    let memo = slot.get_or_insert_with(|| CatalogNpmMemo {
        mtime: None,
        maps: HashMap::new(),
        consensus: HashMap::new(),
        consensus_ready: false,
    });
    if memo.mtime != mtime {
        memo.maps.clear();
        memo.consensus.clear();
        memo.consensus_ready = false;
        memo.mtime = mtime;
    }
    Some(f(memo))
}

fn ensure_provider_map(memo: &mut CatalogNpmMemo, provider_id: &str) {
    if memo.maps.contains_key(provider_id) {
        return;
    }
    let parsed = read_cached_catalog(false)
        .map(|catalog| parse_provider_catalog(&catalog, provider_id))
        .unwrap_or_default();
    memo.maps.insert(provider_id.to_string(), parsed);
}

fn parse_provider_catalog(
    body: &Value,
    provider_id: &str,
) -> HashMap<String, ModelDevCapabilities> {
    let Some(provider_key) = resolve_provider_key(body, provider_id) else {
        return HashMap::new();
    };
    let Some(models) = body
        .get(provider_key)
        .and_then(|provider| provider.get("models"))
        .and_then(Value::as_object)
    else {
        return HashMap::new();
    };
    models
        .iter()
        .map(|(model_id, metadata)| {
            (
                model_id.trim().to_ascii_lowercase(),
                capabilities_from_metadata(metadata),
            )
        })
        .collect()
}

// Route ids are transport names; models.dev keys are vendor names. Separators
// differ ("ollama_cloud_openai" vs "ollama-cloud"), some vendors are renamed
// ("mimo" -> "xiaomi", "moonshot" -> "moonshotai"), and a route can carry a
// protocol suffix ("deepseek-anthropic"). Longest alias prefix rewrites the
// vendor stem so `moonshot-cn` becomes `moonshotai-cn` without a per-region
// table. Greedy catalog-key prefixing is limited to known protocol suffixes so
// `llama-cpp-server` does not steal Meta's `llama` catalog.
const PROVIDER_KEY_ALIASES: &[(&str, &str)] = &[
    ("google-gemini", "google"),
    ("aws-bedrock", "amazon-bedrock"),
    ("amazon-bedrock", "amazon-bedrock"),
    ("bedrock", "amazon-bedrock"),
    ("moonshotai", "moonshotai"),
    ("moonshot", "moonshotai"),
    ("zhipuai", "zhipuai"),
    ("zhipu", "zhipuai"),
    ("glm", "zhipuai"),
    ("zai-glm", "zai"),
    ("mimo-anthropic", "xiaomi"),
    ("mimo", "xiaomi"),
];
const CATALOG_PROTOCOL_SUFFIXES: &[&str] = &["openai", "anthropic", "zen"];

fn catalog_provider_candidates(provider_id: &str) -> Vec<String> {
    let normalized = provider_id.trim().to_ascii_lowercase().replace('_', "-");
    let mut candidates = Vec::new();
    let mut push = |value: String| {
        if !candidates.iter().any(|existing| existing == &value) {
            candidates.push(value);
        }
    };
    let mut aliases = PROVIDER_KEY_ALIASES.to_vec();
    aliases.sort_by_key(|(from, _)| std::cmp::Reverse(from.len()));
    for (from, to) in aliases {
        if normalized == from {
            push(to.to_string());
            break;
        }
        if let Some(rest) = normalized.strip_prefix(&format!("{from}-")) {
            if !rest.is_empty() {
                push(format!("{to}-{rest}"));
                break;
            }
        }
    }
    push(normalized);
    candidates
}

fn resolve_provider_key(body: &Value, provider_id: &str) -> Option<String> {
    let candidates = catalog_provider_candidates(provider_id);
    for candidate in &candidates {
        if body.get(candidate).is_some() {
            return Some(candidate.clone());
        }
    }
    let keys = body.as_object()?.keys();
    keys.filter(|key| {
        candidates.iter().any(|candidate| {
            candidate
                .strip_prefix(&format!("{key}-"))
                .is_some_and(|rest| CATALOG_PROTOCOL_SUFFIXES.contains(&rest))
        })
    })
    .max_by_key(|key| key.len())
    .cloned()
}

fn capabilities_from_metadata(metadata: &Value) -> ModelDevCapabilities {
    let mut result = ModelDevCapabilities::default();
    insert_optional_bool(
        &mut result.capabilities,
        FEATURE_TOOL_CALLING,
        metadata.get("tool_call").and_then(Value::as_bool),
    );
    insert_optional_bool(
        &mut result.capabilities,
        FEATURE_REASONING,
        metadata.get("reasoning").and_then(Value::as_bool),
    );
    if let Some(options) = metadata.get("reasoning_options").and_then(Value::as_array) {
        result.reasoning_control = super::reasoning_control::from_models_dev_metadata(metadata);
        insert_optional_bool(
            &mut result.capabilities,
            FEATURE_REASONING_EFFORT,
            Some(!options.is_empty() && result.reasoning_control.is_some()),
        );
    }
    insert_optional_bool(
        &mut result.capabilities,
        FEATURE_STRUCTURED_OUTPUT,
        metadata.get("structured_output").and_then(Value::as_bool),
    );
    insert_optional_bool(
        &mut result.capabilities,
        FEATURE_TEMPERATURE,
        metadata.get("temperature").and_then(Value::as_bool),
    );
    if let Some(input_modalities) = metadata
        .pointer("/modalities/input")
        .and_then(Value::as_array)
    {
        for key in [INPUT_TEXT, INPUT_IMAGE, INPUT_AUDIO, INPUT_VIDEO, INPUT_PDF] {
            result
                .capabilities
                .insert(key.to_string(), CapabilitySupport::Unsupported);
        }
        for modality in input_modalities.iter().filter_map(Value::as_str) {
            if let Some(key) = input_modality_key(modality) {
                result
                    .capabilities
                    .insert(key.to_string(), CapabilitySupport::Supported);
            }
        }
    }
    if let Some(output_modalities) = metadata
        .pointer("/modalities/output")
        .and_then(Value::as_array)
    {
        for key in [OUTPUT_TEXT, OUTPUT_IMAGE, OUTPUT_AUDIO, OUTPUT_VIDEO] {
            result
                .capabilities
                .insert(key.to_string(), CapabilitySupport::Unsupported);
        }
        for modality in output_modalities.iter().filter_map(Value::as_str) {
            if let Some(key) = output_modality_key(modality) {
                result
                    .capabilities
                    .insert(key.to_string(), CapabilitySupport::Supported);
            }
        }
    }
    if metadata.pointer("/modalities/input").is_some()
        && metadata.pointer("/modalities/output").is_some()
    {
        for operation in [
            OPERATION_LANGUAGE,
            OPERATION_IMAGE_GENERATION,
            OPERATION_SPEECH_GENERATION,
            OPERATION_TRANSCRIPTION,
            OPERATION_VIDEO_GENERATION,
        ] {
            result
                .capabilities
                .insert(operation.to_string(), CapabilitySupport::Unsupported);
        }
    }
    derive_operations(&mut result.capabilities);
    result.context_window = metadata
        .pointer("/limit/context")
        .and_then(Value::as_u64)
        .map(|value| value as usize);
    result.reasoning_replay_field = metadata
        .pointer("/interleaved/field")
        .and_then(Value::as_str)
        .and_then(reasoning_replay_field);
    result.api_npm = metadata
        .pointer("/provider/npm")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    result
}

/// Stale-ok lookup of a catalogued model. Memoized by cache file mtime so
/// request encoding does not re-parse the full catalog each turn. Provider
/// section wins; if that section has no row, fall back to an exact-id
/// consensus across the whole catalog (custom/local routes, missed aliases).
///
/// ponytail: models.dev JSON is ~8MB. Catalog list hits this once per
/// (model, capability key); parse on every call freezes Settings for minutes.
/// Ceiling = one parse per provider map + one consensus index per mtime.
fn cached_model_capabilities(provider_id: &str, model_id: &str) -> Option<ModelDevCapabilities> {
    with_catalog_memo(|memo| {
        ensure_provider_map(memo, provider_id);
        if let Some(entry) = memo
            .maps
            .get(provider_id)
            .and_then(|map| capability_entry(map, model_id))
        {
            return Some(entry.clone());
        }
        if !memo.consensus_ready {
            memo.consensus = read_cached_catalog(false)
                .map(|body| build_consensus_index(&body))
                .unwrap_or_default();
            memo.consensus_ready = true;
        }
        lookup_consensus(&memo.consensus, model_id).cloned()
    })?
}

fn cached_scoped_api_npm(provider_id: &str, model_id: &str) -> Option<String> {
    with_catalog_memo(|memo| -> Option<String> {
        ensure_provider_map(memo, provider_id);
        capability_entry(memo.maps.get(provider_id)?, model_id)?
            .api_npm
            .clone()
    })?
}

pub(crate) fn cached_api_npm(provider_id: &str, model_id: &str) -> Option<String> {
    cached_scoped_api_npm(provider_id, model_id)
}

pub(crate) fn cached_reasoning_replay_field(
    provider_id: &str,
    model_id: &str,
) -> Option<ReasoningReplayField> {
    // A gateway may reject fields accepted by the upstream vendor. Use its own
    // catalogue entry, not a cross-provider model-name consensus.
    with_catalog_memo(|memo| {
        ensure_provider_map(memo, provider_id);
        capability_entry(memo.maps.get(provider_id)?, model_id)?.reasoning_replay_field
    })?
}

pub(crate) fn cached_capability(
    provider_id: &str,
    model_id: &str,
    key: &str,
) -> Option<CapabilitySupport> {
    cached_model_capabilities(provider_id, model_id)?
        .capabilities
        .get(key)
        .copied()
}

pub(crate) fn cached_catalog_body() -> Option<Value> {
    read_cached_catalog(false)
}

fn insert_optional_bool(
    capabilities: &mut HashMap<String, CapabilitySupport>,
    key: &str,
    value: Option<bool>,
) {
    let Some(value) = value else {
        return;
    };
    capabilities.insert(
        key.to_string(),
        if value {
            CapabilitySupport::Supported
        } else {
            CapabilitySupport::Unsupported
        },
    );
}

fn input_modality_key(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "text" => Some(INPUT_TEXT),
        "image" => Some(INPUT_IMAGE),
        "audio" => Some(INPUT_AUDIO),
        "video" => Some(INPUT_VIDEO),
        "pdf" | "document" => Some(INPUT_PDF),
        _ => None,
    }
}

fn output_modality_key(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "text" => Some(OUTPUT_TEXT),
        "image" => Some(OUTPUT_IMAGE),
        "audio" => Some(OUTPUT_AUDIO),
        "video" => Some(OUTPUT_VIDEO),
        _ => None,
    }
}

fn derive_operations(capabilities: &mut HashMap<String, CapabilitySupport>) {
    let supported =
        |key: &str| capabilities.get(key).copied() == Some(CapabilitySupport::Supported);
    let mut operations = Vec::new();
    if supported(INPUT_TEXT) && supported(OUTPUT_TEXT) {
        operations.push(OPERATION_LANGUAGE);
    }
    if supported(INPUT_TEXT) && supported(OUTPUT_IMAGE) {
        operations.push(OPERATION_IMAGE_GENERATION);
    }
    if supported(INPUT_TEXT) && supported(OUTPUT_AUDIO) {
        operations.push(OPERATION_SPEECH_GENERATION);
    }
    if supported(INPUT_AUDIO) && supported(OUTPUT_TEXT) {
        operations.push(OPERATION_TRANSCRIPTION);
    }
    if supported(INPUT_TEXT) && supported(OUTPUT_VIDEO) {
        operations.push(OPERATION_VIDEO_GENERATION);
    }
    for operation in operations {
        capabilities.insert(operation.to_string(), CapabilitySupport::Supported);
    }
}

// Provider APIs return ids with qualifiers the catalog omits (and vice versa:
// "deepseek-v4-flash:0731" vs "deepseek-v4-flash"). Match the exact id first,
// then a leading `vendor/` prefix, then the part before ":" on either side.
fn capability_entry<'a>(
    capability_map: &'a HashMap<String, ModelDevCapabilities>,
    model_id: &str,
) -> Option<&'a ModelDevCapabilities> {
    for candidate in requested_model_keys(model_id) {
        if let Some(capabilities) = capability_map.get(&candidate) {
            return Some(capabilities);
        }
        if let Some(capabilities) = capability_map.iter().find_map(|(key, capabilities)| {
            let key_base = key.split(':').next().unwrap_or(key);
            let key_name = key_base
                .rsplit_once('/')
                .map(|(_, rest)| rest)
                .unwrap_or(key_base);
            (key_name == candidate || key_base == candidate).then_some(capabilities)
        }) {
            return Some(capabilities);
        }
    }
    None
}

fn requested_model_keys(model_id: &str) -> Vec<String> {
    let normalized = model_id.trim().to_ascii_lowercase();
    let mut keys = Vec::new();
    let push = |keys: &mut Vec<String>, value: String| {
        if !value.is_empty() && !keys.iter().any(|existing| existing == &value) {
            keys.push(value);
        }
    };
    push(&mut keys, normalized.clone());
    if let Some((_, rest)) = normalized.rsplit_once('/') {
        push(&mut keys, rest.to_string());
    }
    for key in keys.clone() {
        if let Some(base) = key.split(':').next() {
            push(&mut keys, base.to_string());
        }
    }
    keys
}

fn consensus_for_model(body: &Value, model_id: &str) -> Option<ModelDevCapabilities> {
    lookup_consensus(&build_consensus_index(body), model_id).cloned()
}

fn build_consensus_index(body: &Value) -> HashMap<String, ModelDevCapabilities> {
    let mut grouped: HashMap<String, Vec<ModelDevCapabilities>> = HashMap::new();
    let Some(providers) = body.as_object() else {
        return HashMap::new();
    };
    for provider in providers.values() {
        let Some(models) = provider.get("models").and_then(Value::as_object) else {
            continue;
        };
        for (model_id, metadata) in models {
            let capabilities = capabilities_from_metadata(metadata);
            let normalized = model_id.trim().to_ascii_lowercase();
            grouped
                .entry(normalized.clone())
                .or_default()
                .push(capabilities.clone());
            if let Some(base) = normalized.split(':').next() {
                if base != normalized {
                    grouped
                        .entry(base.to_string())
                        .or_default()
                        .push(capabilities);
                }
            }
        }
    }
    grouped
        .into_iter()
        .filter_map(|(model_id, entries)| {
            merge_consensus(entries).map(|capabilities| (model_id, capabilities))
        })
        .collect()
}

fn lookup_consensus<'a>(
    index: &'a HashMap<String, ModelDevCapabilities>,
    model_id: &str,
) -> Option<&'a ModelDevCapabilities> {
    requested_model_keys(model_id)
        .into_iter()
        .find_map(|candidate| index.get(&candidate))
}

fn merge_consensus(entries: Vec<ModelDevCapabilities>) -> Option<ModelDevCapabilities> {
    let Some(first) = entries.first() else {
        return None;
    };
    if entries.len() == 1 {
        let mut only = first.clone();
        only.api_npm = None;
        return Some(only);
    }
    let mut result = ModelDevCapabilities::default();
    let mut keys = HashMap::<String, Option<CapabilitySupport>>::new();
    for entry in &entries {
        for (key, value) in &entry.capabilities {
            match keys.get(key) {
                None => {
                    keys.insert(key.clone(), Some(*value));
                }
                Some(Some(existing)) if existing == value => {}
                Some(_) => {
                    keys.insert(key.clone(), None);
                }
            }
        }
    }
    for (key, value) in keys {
        if let Some(value) = value {
            result.capabilities.insert(key, value);
        }
    }
    if entries
        .iter()
        .all(|entry| entry.context_window == first.context_window)
    {
        result.context_window = first.context_window;
    }
    if entries
        .iter()
        .all(|entry| entry.reasoning_replay_field == first.reasoning_replay_field)
    {
        result.reasoning_replay_field = first.reasoning_replay_field;
    }
    if entries
        .iter()
        .all(|entry| entry.reasoning_control == first.reasoning_control)
    {
        result.reasoning_control = first.reasoning_control.clone();
    }
    if result.capabilities.is_empty()
        && result.context_window.is_none()
        && result.reasoning_replay_field.is_none()
        && result.reasoning_control.is_none()
    {
        return None;
    }
    Some(result)
}

pub(crate) fn enrich_models(
    models: &mut [NativeProviderModel],
    provider_id: &str,
    capability_map: &HashMap<String, ModelDevCapabilities>,
) {
    enrich_models_with_catalog(models, provider_id, capability_map, None);
}

pub(crate) fn enrich_models_with_catalog(
    models: &mut [NativeProviderModel],
    _provider_id: &str,
    capability_map: &HashMap<String, ModelDevCapabilities>,
    catalog_body: Option<&Value>,
) {
    for model in models {
        let scoped = capability_entry(capability_map, &model.id).cloned();
        let capabilities = scoped
            .clone()
            .or_else(|| catalog_body.and_then(|body| consensus_for_model(body, &model.id)));
        let Some(capabilities) = capabilities else {
            continue;
        };
        apply_catalog_to_model(model, &capabilities, scoped.is_some());
    }
}

fn apply_catalog_to_model(
    model: &mut NativeProviderModel,
    capabilities: &ModelDevCapabilities,
    copy_npm: bool,
) {
    if let Some(value) = capabilities
        .capabilities
        .get(INPUT_IMAGE)
        .and_then(|value| value.as_bool())
    {
        model.supports_image_input = value;
    }
    if let Some(value) = capabilities
        .capabilities
        .get(FEATURE_TOOL_CALLING)
        .and_then(|value| value.as_bool())
    {
        model.supports_tool_calling = value;
    }
    if let Some(value) = capabilities
        .capabilities
        .get(FEATURE_REASONING_EFFORT)
        .and_then(|value| value.as_bool())
    {
        model.supports_reasoning_effort = Some(value);
    }
    if model.reasoning_replay_field == ReasoningReplayField::Auto {
        if let Some(field) = capabilities.reasoning_replay_field {
            model.reasoning_replay_field = field;
        }
    }
    model.context_window = capabilities.context_window.or(model.context_window);
    if copy_npm {
        model.api_npm = capabilities.api_npm.clone();
    }
}

pub(crate) fn enrich_capability_record(
    record: &mut NativeModelCapabilityRecord,
    provider_id: &str,
    model_id: &str,
    capability_map: &HashMap<String, ModelDevCapabilities>,
) {
    enrich_capability_record_with_catalog(record, provider_id, model_id, capability_map, None);
}

pub(crate) fn enrich_capability_record_with_catalog(
    record: &mut NativeModelCapabilityRecord,
    _provider_id: &str,
    model_id: &str,
    capability_map: &HashMap<String, ModelDevCapabilities>,
    catalog_body: Option<&Value>,
) {
    let scoped = capability_entry(capability_map, model_id).cloned();
    let from_scope = scoped.is_some();
    let Some(mut capabilities) =
        scoped.or_else(|| catalog_body.and_then(|body| consensus_for_model(body, model_id)))
    else {
        return;
    };
    if !from_scope {
        capabilities.api_npm = None;
    }
    let observed_at = chrono::Utc::now().to_rfc3339();
    for (key, value) in &capabilities.capabilities {
        if let Some(detected) = record.detected.get(key).copied() {
            if detected != CapabilitySupport::Unknown
                && *value != CapabilitySupport::Unknown
                && detected != *value
            {
                let detail = format!(
                    "Provider discovery reported {detected:?}, while models.dev reported {value:?}. Provider discovery keeps priority."
                );
                if let Some(evidence) = record.evidence.get_mut(key) {
                    evidence.conflict = true;
                    evidence.detail = Some(match evidence.detail.take() {
                        Some(existing) => format!("{existing} {detail}"),
                        None => detail.clone(),
                    });
                }
                let summary = format!("Capability conflict for {key}: {detail}");
                record.runtime_conflict = Some(match record.runtime_conflict.take() {
                    Some(existing) => format!("{existing} {summary}"),
                    None => summary,
                });
            }
            continue;
        }
        record.detected.insert(key.clone(), *value);
        record.evidence.insert(
            key.clone(),
            NativeCapabilityEvidence {
                source: "models_dev".to_string(),
                conflict: false,
                source_url: Some(MODELS_DEV_URL.to_string()),
                observed_at: Some(observed_at.clone()),
                detail: None,
            },
        );
    }
    if capabilities.reasoning_control.is_some() {
        record.reasoning_control = capabilities.reasoning_control.clone();
    } else if capabilities.capabilities.get(FEATURE_REASONING_EFFORT)
        == Some(&CapabilitySupport::Unsupported)
    {
        record.reasoning_control = None;
    }
    if from_scope {
        record.api_npm = capabilities.api_npm.clone();
    }
}

fn reasoning_replay_field(value: &str) -> Option<ReasoningReplayField> {
    match value {
        "reasoning" => Some(ReasoningReplayField::Reasoning),
        "reasoning_content" => Some(ReasoningReplayField::ReasoningContent),
        "reasoning_details" => Some(ReasoningReplayField::ReasoningDetails),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::Ordering;

    fn reset_catalog_memo() {
        *CATALOG_NPM_MEMO.lock().expect("catalog memo") = None;
    }

    #[test]
    fn cached_capability_parses_catalog_once_per_mtime() {
        reset_catalog_memo();
        CATALOG_READS.store(0, Ordering::Relaxed);
        let catalog = json!({
            "nvidia": {
                "models": {
                    "z-ai/glm-5.3-flash": {
                        "tool_call": true,
                        "interleaved": { "field": "reasoning_details" },
                        "modalities": { "input": ["text"], "output": ["text"] }
                    }
                }
            },
            "acme": {
                "models": {
                    "orphan-id": {
                        "tool_call": true,
                        "interleaved": { "field": "reasoning_content" },
                        "modalities": { "input": ["text"], "output": ["text"] }
                    }
                }
            }
        });
        crate::native_backend::state::write_json(&catalog_cache_path(), &catalog)
            .expect("write catalog");
        for _ in 0..40 {
            assert_eq!(
                cached_reasoning_replay_field("nvidia", "z-ai/glm-5.3-flash"),
                Some(ReasoningReplayField::ReasoningDetails)
            );
            assert_eq!(
                cached_reasoning_replay_field("custom_openai_compatible", "orphan-id"),
                None,
                "upstream metadata must not enable fields on a different gateway"
            );
            assert_eq!(
                cached_capability("nvidia", "z-ai/glm-5.3-flash", FEATURE_TOOL_CALLING),
                Some(CapabilitySupport::Supported)
            );
            assert_eq!(
                cached_capability(
                    "custom_openai_compatible",
                    "orphan-id",
                    FEATURE_TOOL_CALLING
                ),
                Some(CapabilitySupport::Supported)
            );
        }
        let reads = CATALOG_READS.load(Ordering::Relaxed);
        assert!(
            reads <= 4,
            "catalog reparsed per lookup: {reads} reads for 80 lookups"
        );
        reset_catalog_memo();
    }

    #[test]
    fn parses_provider_scoped_tool_and_modality_capabilities() {
        let body = json!({
            "groq": {
                "models": {
                    "groq/compound": {
                        "tool_call": false,
                        "reasoning": true,
                        "structured_output": true,
                        "modalities": { "input": ["text"], "output": ["text"] },
                        "limit": { "context": 131072 }
                    }
                }
            }
        });
        let map = parse_provider_catalog(&body, "groq");
        let capability = map.get("groq/compound").expect("compound");
        assert_eq!(
            capability.capabilities.get(FEATURE_TOOL_CALLING),
            Some(&CapabilitySupport::Unsupported)
        );
        assert_eq!(
            capability.capabilities.get(OPERATION_LANGUAGE),
            Some(&CapabilitySupport::Supported)
        );
        assert_eq!(capability.context_window, Some(131072));
    }

    #[test]
    fn derives_specialized_operations_from_modalities() {
        let image = capabilities_from_metadata(&serde_json::json!({
            "modalities": { "input": ["text"], "output": ["image"] }
        }));
        assert_eq!(
            image.capabilities.get(OPERATION_IMAGE_GENERATION),
            Some(&CapabilitySupport::Supported)
        );
        let transcription = capabilities_from_metadata(&serde_json::json!({
            "modalities": { "input": ["audio"], "output": ["text"] }
        }));
        assert_eq!(
            transcription.capabilities.get(OPERATION_TRANSCRIPTION),
            Some(&CapabilitySupport::Supported)
        );
    }

    #[test]
    fn provider_discovery_keeps_priority_and_records_catalog_conflicts() {
        let body = json!({
            "groq": {
                "models": {
                    "conflicted": { "tool_call": false }
                }
            }
        });
        let map = parse_provider_catalog(&body, "groq");
        let mut record = NativeModelCapabilityRecord::default();
        record.detected.insert(
            FEATURE_TOOL_CALLING.to_string(),
            CapabilitySupport::Supported,
        );
        record.evidence.insert(
            FEATURE_TOOL_CALLING.to_string(),
            NativeCapabilityEvidence {
                source: "provider_api".to_string(),
                conflict: false,
                source_url: None,
                observed_at: None,
                detail: None,
            },
        );

        enrich_capability_record(&mut record, "groq", "conflicted", &map);

        assert_eq!(
            record.detected.get(FEATURE_TOOL_CALLING),
            Some(&CapabilitySupport::Supported)
        );
        assert_eq!(
            record
                .evidence
                .get(FEATURE_TOOL_CALLING)
                .map(|evidence| evidence.conflict),
            Some(true)
        );
        assert!(record.runtime_conflict.is_some());
    }

    #[test]
    fn maps_route_ids_to_provider_scoped_catalog_ids() {
        let body = json!({
            "google": { "models": { "gemini-test": { "tool_call": true } } },
            "amazon-bedrock": { "models": { "bedrock-test": { "tool_call": false } } },
            "moonshotai": { "models": { "kimi-test": { "tool_call": true } } },
            "moonshotai-cn": { "models": { "kimi-cn": { "tool_call": true } } },
            "zhipuai": { "models": { "glm-test": { "tool_call": true } } },
            "zai": { "models": { "glm-zai": { "tool_call": true } } },
            "xiaomi": { "models": { "mimo-v2.5": { "tool_call": true } } },
            "xiaomi-token-plan-cn": { "models": { "mimo-v2.5": { "tool_call": true } } },
            "llama": { "models": { "llama-3.3-70b-instruct": { "tool_call": true } } },
            "ollama-cloud": { "models": { "glm-5.3-flash": { "tool_call": true } } },
            "opencode": { "models": { "big-pickle": { "tool_call": true } } },
            "deepseek": { "models": { "deepseek-v4-flash": { "tool_call": true } } },
            "amd": { "models": { "DeepSeek-V4-Flash": { "tool_call": true } } },
            "volcengine-coding-plan": { "models": { "glm-5.3": { "tool_call": true } } }
        });
        assert!(parse_provider_catalog(&body, "google_gemini").contains_key("gemini-test"));
        assert!(parse_provider_catalog(&body, "aws_bedrock").contains_key("bedrock-test"));
        assert!(parse_provider_catalog(&body, "moonshot").contains_key("kimi-test"));
        assert!(parse_provider_catalog(&body, "moonshot_cn").contains_key("kimi-cn"));
        assert!(parse_provider_catalog(&body, "glm").contains_key("glm-test"));
        assert!(parse_provider_catalog(&body, "zai_glm").contains_key("glm-zai"));
        assert!(parse_provider_catalog(&body, "mimo").contains_key("mimo-v2.5"));
        assert!(parse_provider_catalog(&body, "mimo_anthropic").contains_key("mimo-v2.5"));
        assert!(parse_provider_catalog(&body, "mimo_token_plan_cn").contains_key("mimo-v2.5"));
        assert!(
            parse_provider_catalog(&body, "mimo_anthropic_token_plan_cn").contains_key("mimo-v2.5")
        );
        assert!(parse_provider_catalog(&body, "ollama_cloud_openai").contains_key("glm-5.3-flash"));
        assert!(parse_provider_catalog(&body, "opencode_zen").contains_key("big-pickle"));
        assert!(
            parse_provider_catalog(&body, "deepseek_anthropic").contains_key("deepseek-v4-flash")
        );
        assert!(parse_provider_catalog(&body, "amd").contains_key("deepseek-v4-flash"));
        assert!(parse_provider_catalog(&body, "volcengine_coding_plan").contains_key("glm-5.3"));
        assert!(
            parse_provider_catalog(&body, "volcengine_coding_plan_anthropic")
                .contains_key("glm-5.3"),
            "the Anthropic coding-plan route must share the plan catalogue"
        );
        assert!(
            parse_provider_catalog(&body, "llama_cpp_server").is_empty(),
            "local llama.cpp must not inherit Meta's llama catalog"
        );
    }

    #[test]
    fn mimo_catalog_keeps_omni_v25_and_text_only_pro() {
        let body = json!({
            "xiaomi": {
                "models": {
                    "mimo-v2.5": {
                        "tool_call": true,
                        "modalities": {
                            "input": ["text", "image", "audio", "video"],
                            "output": ["text"]
                        }
                    },
                    "mimo-v2.5-pro": {
                        "tool_call": true,
                        "modalities": { "input": ["text"], "output": ["text"] }
                    }
                }
            }
        });
        let map = parse_provider_catalog(&body, "mimo");
        assert_eq!(
            map["mimo-v2.5"].capabilities.get(INPUT_IMAGE),
            Some(&CapabilitySupport::Supported)
        );
        assert_eq!(
            map["mimo-v2.5-pro"].capabilities.get(INPUT_IMAGE),
            Some(&CapabilitySupport::Unsupported)
        );

        let mut models = vec![
            NativeProviderModel {
                id: "mimo-v2.5".to_string(),
                supports_image_input: false,
                ..NativeProviderModel::default()
            },
            NativeProviderModel {
                id: "mimo-v2.5-pro".to_string(),
                supports_image_input: false,
                ..NativeProviderModel::default()
            },
        ];
        enrich_models(&mut models, "mimo", &map);
        assert!(models[0].supports_image_input);
        assert!(!models[1].supports_image_input);

        let mut record = NativeModelCapabilityRecord::default();
        enrich_capability_record(&mut record, "mimo", "mimo-v2.5", &map);
        assert_eq!(
            record.detected.get(INPUT_IMAGE),
            Some(&CapabilitySupport::Supported)
        );
        assert_eq!(
            record
                .evidence
                .get(INPUT_IMAGE)
                .map(|evidence| evidence.source.as_str()),
            Some("models_dev")
        );
    }

    #[test]
    fn catalog_consensus_fills_capabilities_when_route_has_no_section() {
        let body = json!({
            "xiaomi": {
                "models": {
                    "mimo-v2.5": {
                        "tool_call": true,
                        "modalities": {
                            "input": ["text", "image", "audio", "video"],
                            "output": ["text"]
                        },
                        "provider": { "npm": "@ai-sdk/openai-compatible" }
                    }
                }
            },
            "huggingface": {
                "models": {
                    "XiaomiMiMo/MiMo-V2.5": {
                        "modalities": { "input": ["text"], "output": ["text"] }
                    }
                }
            }
        });
        assert!(parse_provider_catalog(&body, "custom_openai_compatible").is_empty());
        let mut models = vec![NativeProviderModel {
            id: "mimo-v2.5".to_string(),
            supports_image_input: false,
            api_npm: Some("keep-me".to_string()),
            ..NativeProviderModel::default()
        }];
        enrich_models_with_catalog(
            &mut models,
            "custom_openai_compatible",
            &HashMap::new(),
            Some(&body),
        );
        assert!(models[0].supports_image_input);
        assert_eq!(models[0].api_npm.as_deref(), Some("keep-me"));

        let mut record = NativeModelCapabilityRecord::default();
        enrich_capability_record_with_catalog(
            &mut record,
            "custom_openai_compatible",
            "xiaomi/mimo-v2.5",
            &HashMap::new(),
            Some(&body),
        );
        assert_eq!(
            record.detected.get(INPUT_IMAGE),
            Some(&CapabilitySupport::Supported)
        );
        assert!(record.api_npm.is_none());
    }

    #[test]
    fn catalog_consensus_omits_capabilities_that_providers_disagree_on() {
        let body = json!({
            "alpha": {
                "models": {
                    "shared-id": {
                        "modalities": { "input": ["text", "image"], "output": ["text"] }
                    }
                }
            },
            "beta": {
                "models": {
                    "shared-id": {
                        "modalities": { "input": ["text"], "output": ["text"] }
                    }
                }
            }
        });
        let consensus = consensus_for_model(&body, "shared-id").expect("consensus");
        assert_eq!(
            consensus.capabilities.get(INPUT_TEXT),
            Some(&CapabilitySupport::Supported)
        );
        assert!(consensus.capabilities.get(INPUT_IMAGE).is_none());
    }

    #[test]
    fn embedded_offline_snapshot_disables_groq_compound_tools() {
        let body: Value = serde_json::from_str(EMBEDDED_MODELS_DEV_SNAPSHOT).expect("snapshot");
        let models = parse_provider_catalog(&body, "groq");
        assert_eq!(
            models["groq/compound"]
                .capabilities
                .get(FEATURE_TOOL_CALLING),
            Some(&CapabilitySupport::Unsupported)
        );
    }

    #[test]
    fn route_id_with_transport_suffix_matches_base_catalog_entry() {
        let body = json!({
            "ollama-cloud": { "models": { "glm-5.3-flash": { "tool_call": true } } }
        });
        let map = parse_provider_catalog(&body, "ollama_cloud_openai");
        assert!(map.contains_key("glm-5.3-flash"));
        assert_eq!(
            map["glm-5.3-flash"].capabilities.get(FEATURE_TOOL_CALLING),
            Some(&CapabilitySupport::Supported)
        );
    }

    #[test]
    fn capability_entry_matches_tagged_model_ids() {
        let mut map = HashMap::new();
        map.insert("glm-5.3-flash".to_string(), ModelDevCapabilities::default());
        assert!(capability_entry(&map, "glm-5.3-flash:0731").is_some());

        map.insert(
            "deepseek-v4-pro:0813".to_string(),
            ModelDevCapabilities::default(),
        );
        assert!(capability_entry(&map, "deepseek-v4-pro").is_some());
        assert!(capability_entry(&map, "totally-unknown").is_none());
    }

    #[test]
    fn parses_reasoning_options_and_does_not_treat_reasoning_bool_as_effort() {
        let effort = capabilities_from_metadata(&json!({
            "reasoning": true,
            "reasoning_options": [{ "type": "effort", "values": [null, "low", "high"] }]
        }));
        assert_eq!(
            effort.capabilities.get(FEATURE_REASONING),
            Some(&CapabilitySupport::Supported)
        );
        assert_eq!(
            effort.capabilities.get(FEATURE_REASONING_EFFORT),
            Some(&CapabilitySupport::Supported)
        );
        let control = effort.reasoning_control.expect("effort control");
        assert_eq!(control.kind, NativeReasoningKind::Effort);
        assert_eq!(control.values, ["none", "low", "high"]);

        let reasoning_only = capabilities_from_metadata(&json!({ "reasoning": true }));
        assert_eq!(
            reasoning_only.capabilities.get(FEATURE_REASONING),
            Some(&CapabilitySupport::Supported)
        );
        assert!(
            reasoning_only
                .capabilities
                .get(FEATURE_REASONING_EFFORT)
                .is_none()
        );
        assert!(reasoning_only.reasoning_control.is_none());

        let empty = capabilities_from_metadata(&json!({
            "reasoning": true,
            "reasoning_options": []
        }));
        assert_eq!(
            empty.capabilities.get(FEATURE_REASONING_EFFORT),
            Some(&CapabilitySupport::Unsupported)
        );
        assert!(empty.reasoning_control.is_none());
    }

    #[test]
    fn enrich_writes_reasoning_control_and_supports_flag() {
        let body = json!({
            "anthropic": {
                "models": {
                    "claude-test": {
                        "reasoning": true,
                        "reasoning_options": [{ "type": "effort", "values": ["low", "max"] }]
                    },
                    "no-control": {
                        "reasoning": true,
                        "reasoning_options": []
                    }
                }
            }
        });
        let map = parse_provider_catalog(&body, "anthropic");
        let mut models = vec![
            NativeProviderModel {
                id: "claude-test".to_string(),
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
            },
            NativeProviderModel {
                id: "no-control".to_string(),
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
            },
        ];
        enrich_models(&mut models, "anthropic", &map);
        assert_eq!(models[0].supports_reasoning_effort, Some(true));
        assert_eq!(models[1].supports_reasoning_effort, Some(false));

        let mut record = NativeModelCapabilityRecord::default();
        enrich_capability_record(&mut record, "anthropic", "claude-test", &map);
        assert_eq!(
            record
                .reasoning_control
                .as_ref()
                .map(|control| control.values.clone()),
            Some(vec!["low".to_string(), "max".to_string()])
        );

        let mut empty_record = NativeModelCapabilityRecord::default();
        empty_record.reasoning_control = Some(NativeReasoningControl {
            kind: NativeReasoningKind::Effort,
            values: vec!["high".to_string()],
            budget_min: None,
            budget_max: None,
        });
        enrich_capability_record(&mut empty_record, "anthropic", "no-control", &map);
        assert!(empty_record.reasoning_control.is_none());
    }

    #[test]
    fn parses_model_level_provider_npm_and_ignores_parent_package() {
        let map = parse_provider_catalog(
            &json!({
                "opencode": {
                    "npm": "@ai-sdk/openai-compatible",
                    "models": {
                        "muse-spark-1.3-contributor-free": {
                            "provider": { "npm": "@ai-sdk/openai" }
                        },
                        "claude-fable-5": {
                            "provider": { "npm": "@ai-sdk/anthropic" }
                        },
                        "gemini-3.6-flash": {
                            "provider": { "npm": "@ai-sdk/google" }
                        },
                        "big-pickle": {},
                        "qwen3-coder": {},
                        "grok-code": {},
                        "minimax-m2.5-free": {
                            "provider": { "npm": "@ai-sdk/anthropic" }
                        },
                        "minimax-m2.5": {}
                    }
                }
            }),
            "opencode_zen",
        );
        let protocol = |model_id: &str| {
            crate::native_backend::providers::wire_protocol::protocol_from_api_npm(
                map.get(model_id).and_then(|entry| entry.api_npm.as_deref()),
            )
        };
        use crate::native_backend::providers::protocol::{
            anthropic_messages, gemini_generate_content, openai_chat_completions, openai_responses,
        };
        assert_eq!(
            protocol("muse-spark-1.3-contributor-free"),
            openai_responses::PROTOCOL_ID
        );
        assert_eq!(protocol("claude-fable-5"), anthropic_messages::PROTOCOL_ID);
        assert_eq!(
            protocol("gemini-3.6-flash"),
            gemini_generate_content::PROTOCOL_ID
        );
        assert_eq!(protocol("big-pickle"), openai_chat_completions::PROTOCOL_ID);
        assert_eq!(
            protocol("qwen3-coder"),
            openai_chat_completions::PROTOCOL_ID
        );
        assert_eq!(protocol("grok-code"), openai_chat_completions::PROTOCOL_ID);
        assert_eq!(
            protocol("minimax-m2.5-free"),
            anthropic_messages::PROTOCOL_ID
        );
        assert_eq!(
            protocol("minimax-m2.5"),
            openai_chat_completions::PROTOCOL_ID
        );
    }

    #[test]
    fn enrich_writes_api_npm_onto_model_and_capability_record() {
        let map = parse_provider_catalog(
            &json!({
                "opencode": {
                    "models": {
                        "muse-spark-1.3-contributor-free": {
                            "provider": { "npm": "@ai-sdk/openai" }
                        },
                        "big-pickle": {}
                    }
                }
            }),
            "opencode",
        );
        let mut models = vec![
            NativeProviderModel {
                id: "muse-spark-1.3-contributor-free".to_string(),
                ..NativeProviderModel::default()
            },
            NativeProviderModel {
                id: "big-pickle".to_string(),
                api_npm: Some("@ai-sdk/openai".to_string()),
                ..NativeProviderModel::default()
            },
        ];
        enrich_models(&mut models, "opencode", &map);
        assert_eq!(models[0].api_npm.as_deref(), Some("@ai-sdk/openai"));
        assert_eq!(models[1].api_npm, None);

        let mut record = NativeModelCapabilityRecord::default();
        enrich_capability_record(
            &mut record,
            "opencode",
            "muse-spark-1.3-contributor-free",
            &map,
        );
        assert_eq!(record.api_npm.as_deref(), Some("@ai-sdk/openai"));
    }
}
