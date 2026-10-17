use super::*;
use lyra_tool_fs_core::{
    CatalogEntry, ToolFsRegistry, ToolManifest, build_catalog_listing, catalog_entry_from_manifest,
    deferred_tool_name, search_catalog,
};
use std::collections::HashSet;
use std::sync::OnceLock;

pub(crate) const TOOL_SEARCH_TOOL_NAME: &str = "ToolSearch";
pub(crate) const DISCOVERED_TOOL_NAMES_KEY: &str = "discoveredToolNames";
/// Recomputed on every model request. Not a ToolSearch discovery: the next
/// turn without an office file drops these schemas again.
pub(crate) const EPHEMERAL_OFFICE_TOOLS_KEY: &str = "ephemeralOfficeTools";
const OFFICE_TOOL_NAMES: &[&str] = &["software__office__read", "software__office__apply"];
const BROWSER_FOLLOW_TOOLS: &[&str] = &[
    "browser_upload",
    "browser_type",
    "browser_act",
    "browser_press",
    "browser_wait",
    "browser_drag",
    "browser_dialog",
    "browser_see",
    "browser_vact",
];
const DEFAULT_SEARCH_LIMIT: usize = 5;
const MAX_SEARCH_LIMIT: usize = 25;
const LISTING_MAX_TOKENS: usize = 4000;
const LISTING_CONTEXT_PCT: f64 = 5.0;

const EAGER_DEFERRED_EXCLUSIONS: &[&str] = &[
    "agent_spawn",
    "web_search",
    "web_fetch",
    "design_reference",
    "design_extract_reference",
    "design_quality",
    "browser_navigate",
    "browser_read",
    "browser_map",
];

const TOOL_SEARCH_PROMPT_HEAD: &str =
    "Fetches full schema definitions for deferred tools so they can be called.";
const TOOL_SEARCH_PROMPT_TAIL: &str = " Tools whose schemas are already in this request can be called directly; do not search for them again. browser_map, browser_read and browser_navigate are always available. An attached browser map also makes browser_act, browser_type, browser_press, browser_wait, browser_upload, browser_drag, browser_dialog, browser_see and browser_vact available. Query forms for other tools:\n- \"select:browser_scroll,computer_map\" — fetch these exact tools by name\n- \"notebook jupyter\" — keyword search, up to max_results best matches. Loaded results embed each tool's full parameter schema; read them before calling.";

#[derive(Clone, Debug)]
pub(crate) struct DeferredTool {
    pub name: String,
    pub description: String,
    pub source_name: String,
    pub schema: Value,
    pub manifest: Option<ToolManifest>,
}

pub(crate) fn is_tool_search_name(name: &str) -> bool {
    name == TOOL_SEARCH_TOOL_NAME
}

pub(crate) fn schema_not_sent_hint(name: &str) -> Value {
    json!({
        "content": format!(
            "Schema for `{name}` was not sent. Call `{TOOL_SEARCH_TOOL_NAME}` with query \"select:{name}\" first, then invoke `{name}` by name."
        ),
        "error": {
            "code": "tool_schema_not_sent",
            "message": format!("Deferred tool `{name}` is not loaded in this request."),
        },
        "recommendedNextAction": format!("Call {TOOL_SEARCH_TOOL_NAME} with select:{name}"),
    })
}

fn unknown_tool_name_hint(name: &str) -> Value {
    json!({
        "content": format!(
            "`{name}` is not a tool in this session. Do not call it again and do not search for that string. Each action is its own tool call, using a name from the tools already in this request."
        ),
        "error": {
            "code": "tool_schema_not_sent",
            "message": format!("`{name}` is not a tool in this session."),
        },
        "recommendedNextAction": "Call a tool name from this request. Do not repeat this name.",
    })
}

fn push_unique_name(names: &mut Vec<String>, name: &str) {
    let name = name.trim();
    if name.is_empty() || names.iter().any(|existing| existing == name) {
        return;
    }
    names.push(name.to_string());
}

fn names_from_value_list(value: Option<&Value>) -> Vec<String> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

pub(crate) fn discovered_tool_names(snapshot: &Value) -> Vec<String> {
    let mut names = Vec::new();
    for name in names_from_value_list(snapshot.get(DISCOVERED_TOOL_NAMES_KEY)) {
        push_unique_name(&mut names, &name);
    }
    if let Some(messages) = snapshot.get("messages").and_then(Value::as_array) {
        for message in messages {
            for name in names_from_value_list(message.get("lyraDiscoveredTools")) {
                push_unique_name(&mut names, &name);
            }
        }
    }
    names
}

pub(crate) fn record_browser_follow_tools(session_id: &str, tool_name: &str) {
    if !matches!(
        tool_name,
        "browser_map" | "browser_read" | "browser_navigate" | "browser_see" | "browser_vact"
    ) {
        return;
    }
    let names = BROWSER_FOLLOW_TOOLS
        .iter()
        .map(|name| (*name).to_string())
        .collect::<Vec<_>>();
    record_discovered_tool_names(session_id, &names);
}

pub(crate) fn record_discovered_tool_names(session_id: &str, names: &[String]) {
    if names.is_empty() {
        return;
    }
    let Ok(mut state) = state().lock() else {
        return;
    };
    let Some(session) = state.sessions.get_mut(session_id) else {
        return;
    };
    let mut existing = discovered_tool_names(&session.snapshot);
    for name in names {
        if !existing.iter().any(|existing| existing == name) {
            existing.push(name.clone());
        }
    }
    session.snapshot[DISCOVERED_TOOL_NAMES_KEY] = json!(existing);
    session.dirty = true;
}

pub(crate) fn listing_token_budget(context_window: u64) -> usize {
    let pct = ((context_window as f64) * LISTING_CONTEXT_PCT / 100.0) as usize;
    LISTING_MAX_TOKENS.min(pct.max(200))
}

pub(crate) fn office_turn_signal(snapshot: &Value, workbench: Option<&Value>) -> bool {
    latest_user_message_has_office_file(snapshot)
        || workbench.is_some_and(workbench_shows_office_file)
}

pub(crate) fn set_ephemeral_office_tools(session_id: &str, enabled: bool) {
    let Ok(mut state) = state().lock() else {
        return;
    };
    let Some(session) = state.sessions.get_mut(session_id) else {
        return;
    };
    let next = Value::Bool(enabled);
    if session.snapshot.get(EPHEMERAL_OFFICE_TOOLS_KEY) != Some(&next) {
        session.snapshot[EPHEMERAL_OFFICE_TOOLS_KEY] = next;
        session.dirty = true;
    }
}

fn office_tools_active(snapshot: &Value) -> bool {
    snapshot
        .get(EPHEMERAL_OFFICE_TOOLS_KEY)
        .and_then(Value::as_bool)
        == Some(true)
        || latest_user_message_has_office_file(snapshot)
}

fn is_office_edit_path(raw: &str) -> bool {
    let trimmed = raw.trim().trim_matches(|ch: char| {
        matches!(
            ch,
            '"' | '\'' | '`' | '<' | '>' | '(' | ')' | '[' | ']' | '{' | '}'
        )
    });
    let head = trimmed.split(['?', '#']).next().unwrap_or(trimmed);
    let name = head.rsplit(['/', '\\']).next().unwrap_or(head);
    let name = name.trim_end_matches(|ch: char| {
        matches!(ch, '.' | ',' | ';' | ':' | '!' | '?' | '，' | '。' | '、')
    });
    let Some((stem, ext)) = name.rsplit_once('.') else {
        return false;
    };
    !stem.is_empty() && matches!(ext.to_ascii_lowercase().as_str(), "docx" | "xlsx" | "pptx")
}

fn text_mentions_office_file(text: &str) -> bool {
    text.split(|ch: char| {
        ch.is_whitespace()
            || matches!(
                ch,
                '"' | '\''
                    | '`'
                    | '<'
                    | '>'
                    | '('
                    | ')'
                    | '['
                    | ']'
                    | '{'
                    | '}'
                    | ','
                    | ';'
                    | '，'
                    | '。'
                    | '、'
            )
    })
    .any(is_office_edit_path)
}

fn latest_user_message(snapshot: &Value) -> Option<&Value> {
    snapshot
        .get("messages")
        .and_then(Value::as_array)?
        .iter()
        .rev()
        .find(|message| message.get("role").and_then(Value::as_str) == Some("user"))
}

fn latest_user_message_has_office_file(snapshot: &Value) -> bool {
    let Some(message) = latest_user_message(snapshot) else {
        return false;
    };
    if message
        .get("text")
        .and_then(Value::as_str)
        .is_some_and(text_mentions_office_file)
        || message
            .get("content")
            .and_then(Value::as_str)
            .is_some_and(text_mentions_office_file)
    {
        return true;
    }
    if message
        .get("blocks")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|block| block.get("text").and_then(Value::as_str))
        .any(text_mentions_office_file)
    {
        return true;
    }
    ["fileAttachments", "fileCitations"].into_iter().any(|key| {
        message
            .pointer(&format!("/metadata/{key}"))
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .any(|item| {
                item.get("path")
                    .and_then(Value::as_str)
                    .is_some_and(is_office_edit_path)
                    || item
                        .get("name")
                        .and_then(Value::as_str)
                        .is_some_and(is_office_edit_path)
            })
    })
}

fn tab_is_office_file(tab: &Value) -> bool {
    ["title", "displayAddress", "filePath", "path"]
        .into_iter()
        .any(|field| {
            tab.get(field)
                .and_then(Value::as_str)
                .is_some_and(is_office_edit_path)
        })
}

fn workbench_shows_office_file(workbench: &Value) -> bool {
    let Some(tabs) = workbench.get("tabs").and_then(Value::as_array) else {
        return false;
    };
    let active_id = workbench.get("activeTabId").and_then(Value::as_str);
    let focused = tabs
        .iter()
        .filter(|tab| tab.get("focusedPane").and_then(Value::as_bool) == Some(true))
        .collect::<Vec<_>>();
    let current = if focused.is_empty() {
        tabs.iter()
            .filter(|tab| {
                tab.get("active").and_then(Value::as_bool) == Some(true)
                    || active_id.is_some_and(|id| {
                        tab.get("tabId")
                            .or_else(|| tab.get("id"))
                            .and_then(Value::as_str)
                            == Some(id)
                    })
            })
            .collect::<Vec<_>>()
    } else {
        focused
    };
    current.into_iter().any(tab_is_office_file)
}

fn deferred_from_manifest(manifest: &ToolManifest) -> DeferredTool {
    DeferredTool {
        name: deferred_tool_name(manifest),
        description: if manifest.summary.is_empty() {
            manifest.description.clone()
        } else {
            manifest.summary.clone()
        },
        source_name: manifest.domain.clone(),
        schema: provider_schema_from_manifest(manifest),
        manifest: Some(manifest.clone()),
    }
}

fn dedupe_sort_deferred(tools: &mut Vec<DeferredTool>) {
    let mut seen = HashSet::new();
    tools.retain(|tool| seen.insert(tool.name.clone()));
    tools.sort_by(|left, right| left.name.cmp(&right.name));
}

fn cached_builtin_deferred_tools() -> &'static Vec<DeferredTool> {
    static CACHE: OnceLock<Vec<DeferredTool>> = OnceLock::new();
    CACHE.get_or_init(|| {
        // Keep eager tools (web_search/web_fetch) in this cache so dispatch can
        // look them up. ToolSearch listings still drop them via include_deferred_manifest.
        let mut tools = ToolFsRegistry::builtin()
            .manifests()
            .iter()
            .map(deferred_from_manifest)
            .collect::<Vec<_>>();
        dedupe_sort_deferred(&mut tools);
        tools
    })
}

fn include_deferred_manifest(manifest: &ToolManifest, enabled_media: &HashSet<String>) -> bool {
    !is_eager_exclusion(manifest)
        && (manifest.domain != "media" || enabled_media.contains(&manifest.path))
}

fn provider_schema_from_manifest(manifest: &ToolManifest) -> Value {
    let name = deferred_tool_name(manifest);
    let description = if manifest.summary.is_empty() {
        manifest.description.as_str()
    } else {
        manifest.summary.as_str()
    };
    let mut parameters = manifest.input_schema.clone();
    if let Some(object) = parameters.as_object_mut() {
        object.remove("$id");
        object.remove("schemaId");
    }
    function_tool(&name, description, parameters)
}

fn is_eager_exclusion(manifest: &ToolManifest) -> bool {
    let name = deferred_tool_name(manifest);
    EAGER_DEFERRED_EXCLUSIONS.contains(&name.as_str())
}

pub(crate) fn deferred_tools(
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    root: Option<&str>,
) -> Vec<DeferredTool> {
    let enabled_media = tool_fs::enabled_media_tool_paths();
    let mut tools = cached_builtin_deferred_tools()
        .iter()
        .filter(|tool| {
            tool.manifest
                .as_ref()
                .is_none_or(|manifest| include_deferred_manifest(manifest, &enabled_media))
        })
        .cloned()
        .collect::<Vec<_>>();
    tools.extend(
        tool_fs::dynamic_capability_manifests(dispatcher, root)
            .iter()
            .filter(|manifest| include_deferred_manifest(manifest, &enabled_media))
            .map(deferred_from_manifest),
    );
    dedupe_sort_deferred(&mut tools);
    tools
}

pub(crate) fn lookup_deferred_tool(
    name: &str,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    root: Option<&str>,
) -> Option<DeferredTool> {
    if let Some(tool) = cached_builtin_deferred_tools()
        .iter()
        .find(|tool| tool.name == name)
    {
        return Some(tool.clone());
    }
    tool_fs::dynamic_capability_manifests(dispatcher, root)
        .iter()
        .map(deferred_from_manifest)
        .find(|tool| tool.name == name)
}

fn catalog_entries(tools: &[DeferredTool]) -> Vec<CatalogEntry> {
    tools
        .iter()
        .map(|tool| {
            if let Some(manifest) = &tool.manifest {
                catalog_entry_from_manifest(manifest)
            } else {
                CatalogEntry {
                    name: tool.name.clone(),
                    description: tool.description.clone(),
                    source_name: tool.source_name.clone(),
                    tokens: lyra_tool_fs_core::tokenize(&format!(
                        "{} {}",
                        tool.name.replace('_', " "),
                        tool.description
                    )),
                }
            }
        })
        .collect()
}

fn tool_search_description(tools: &[DeferredTool], max_tokens: usize) -> String {
    let entries = catalog_entries(tools);
    let (listing, _) = build_catalog_listing(&entries, max_tokens, TOOL_SEARCH_TOOL_NAME);
    match listing {
        Some(listing) => format!(
            "{TOOL_SEARCH_PROMPT_HEAD} Deferred tools are listed below. {TOOL_SEARCH_PROMPT_TAIL}\n\n{listing}"
        ),
        None => format!("{TOOL_SEARCH_PROMPT_HEAD}{TOOL_SEARCH_PROMPT_TAIL}"),
    }
}

pub(crate) fn tool_search_provider_tool(tools: &[DeferredTool], max_tokens: usize) -> Value {
    function_tool(
        TOOL_SEARCH_TOOL_NAME,
        &tool_search_description(tools, max_tokens),
        json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Query to find deferred tools. Use \"select:<tool_name>\" for direct selection, or keywords to search."
                },
                "refresh": {
                    "type": "boolean",
                    "description": "Refresh the host catalog only after a reported catalog failure or newly installed software; ordinary searches use the existing catalog."
                },
                "max_results": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": MAX_SEARCH_LIMIT,
                    "default": DEFAULT_SEARCH_LIMIT,
                    "description": "Maximum ranked candidates (default: 5). Keyword search loads the first 3 schemas and lists the rest; select:<name> loads an exact candidate."
                }
            },
            "required": ["query"]
        }),
    )
}

fn mcp_capability_connected(manifest: &ToolManifest, root: Option<&str>) -> bool {
    if !manifest.path.starts_with("/tools/mcp/capability/") {
        return true;
    }
    let Some((server_id, _)) = tool_fs::parse_mcp_capability_path(&manifest.path) else {
        return false;
    };
    mcp_catalog::effective_registry(root).is_ok_and(|registry| {
        registry
            .servers
            .iter()
            .any(|server| server.id == server_id && server.enabled && server.state == "connected")
    })
}

fn promotable_discovered_names(snapshot: &Value, deferred: &[DeferredTool]) -> Vec<String> {
    discovered_tool_names(snapshot)
        .into_iter()
        .filter(|name| {
            deferred.iter().any(|tool| {
                tool.name == *name
                    && tool.manifest.as_ref().is_none_or(|manifest| {
                        mcp_capability_connected(manifest, projects::snapshot_root(snapshot))
                    })
            })
        })
        .collect()
}

fn has_attached_browser_map(snapshot: &Value) -> bool {
    snapshot
        .get("messages")
        .and_then(Value::as_array)
        .and_then(|messages| {
            messages
                .iter()
                .rev()
                .find(|message| message.get("role").and_then(Value::as_str) == Some("user"))
        })
        .and_then(|message| message.pointer("/metadata/pageCitations"))
        .and_then(Value::as_array)
        .is_some_and(|citations| {
            citations.iter().any(|citation| {
                citation.get("sourceKind").and_then(Value::as_str) != Some("terminal-tab")
                    && citation
                        .get("pageUrl")
                        .and_then(Value::as_str)
                        .is_some_and(|url| {
                            url.starts_with("https://") || url.starts_with("http://")
                        })
                    && citation
                        .get("surfaceMap")
                        .and_then(Value::as_str)
                        .is_some_and(|map| !map.trim().is_empty())
            })
        })
}

pub(crate) fn persist_discovered_snapshot(
    session_id: &str,
    _dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
) {
    let Ok(mut state) = state().lock() else {
        return;
    };
    let Some(session) = state.sessions.get_mut(session_id) else {
        return;
    };
    // Discovery records intent. Availability filters the current request; a
    // temporary disconnection must never erase what the model has loaded.
    let names = discovered_tool_names(&session.snapshot);
    let encoded = json!(names);
    if session.snapshot.get(DISCOVERED_TOOL_NAMES_KEY) != Some(&encoded) {
        session.snapshot[DISCOVERED_TOOL_NAMES_KEY] = encoded;
        session.dirty = true;
    }
}

pub(crate) fn assemble_provider_tools(
    snapshot: &Value,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    context_window: Option<usize>,
) -> Vec<Value> {
    let deferred = deferred_tools(dispatcher, projects::snapshot_root(snapshot));
    let budget = listing_token_budget(context_window.unwrap_or(128_000) as u64);
    let mut tools = eager_model_tools_without_search();
    tools.push(tool_search_provider_tool(&deferred, budget));
    tools.push(session_read_message_model_tool());
    let promoted = promotable_discovered_names(snapshot, &deferred);
    for name in &promoted {
        if BROWSER_FOLLOW_TOOLS.contains(&name.as_str()) {
            continue;
        }
        if let Some(entry) = deferred.iter().find(|tool| tool.name == *name) {
            // Discovery has already selected this schema. Sending it deferred
            // again hides it when old search result references are compacted.
            tools.push(entry.schema.clone());
        }
    }
    if has_attached_browser_map(snapshot)
        || promoted
            .iter()
            .any(|name| BROWSER_FOLLOW_TOOLS.contains(&name.as_str()))
    {
        for name in BROWSER_FOLLOW_TOOLS {
            if tools
                .iter()
                .any(|tool| tool.pointer("/function/name").and_then(Value::as_str) == Some(*name))
            {
                continue;
            }
            if let Some(entry) = deferred.iter().find(|tool| tool.name == *name) {
                tools.push(entry.schema.clone());
            }
        }
    }
    if office_tools_active(snapshot) {
        for name in OFFICE_TOOL_NAMES {
            if tools
                .iter()
                .any(|tool| tool.pointer("/function/name").and_then(Value::as_str) == Some(*name))
            {
                continue;
            }
            if let Some(entry) = deferred.iter().find(|tool| tool.name == *name) {
                tools.push(entry.schema.clone());
            }
        }
    }
    tools
}

fn eager_model_tools_without_search() -> Vec<Value> {
    let mut tools = vec![clarification_ask_model_tool()];
    tools.extend(plan_model_tools());
    tools.extend(todo_model_tools());
    tools.push(agent_spawn_model_tool(None));
    tools.extend(codex_code_model_tools());
    if let Some(web_search) = eager_named_schema("web_search") {
        tools.push(web_search);
    }
    if let Some(web_fetch) = eager_named_schema("web_fetch") {
        tools.push(web_fetch);
    }
    for name in [
        "design_reference",
        "design_extract_reference",
        "design_quality",
        "browser_navigate",
        "browser_read",
        "browser_map",
    ] {
        if let Some(schema) = eager_named_schema(name) {
            tools.push(schema);
        }
    }
    tools
}

fn eager_named_schema(name: &str) -> Option<Value> {
    ToolFsRegistry::builtin()
        .manifests()
        .iter()
        .find(|manifest| deferred_tool_name(manifest) == name)
        .map(provider_schema_from_manifest)
}

fn parse_select_names(query: &str) -> Option<Vec<String>> {
    let rest = query.trim().strip_prefix("select:")?;
    let names = rest
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    (!names.is_empty()).then_some(names)
}

fn partition_available_candidates(
    names: Vec<String>,
    deferred: &[DeferredTool],
    root: Option<&str>,
) -> (Vec<String>, Vec<String>) {
    names.into_iter().partition(|name| {
        deferred.iter().any(|tool| {
            tool.name == *name
                && tool
                    .manifest
                    .as_ref()
                    .is_none_or(|manifest| mcp_capability_connected(manifest, root))
        })
    })
}

pub(crate) fn execute_tool_search(
    session_id: &str,
    turn_id: &str,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
    call: &ModelToolCall,
    started_at: &str,
) -> Value {
    let query = call
        .arguments
        .get("query")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let limit = call
        .arguments
        .get("max_results")
        .and_then(Value::as_u64)
        .unwrap_or(DEFAULT_SEARCH_LIMIT as u64)
        .clamp(1, MAX_SEARCH_LIMIT as u64) as usize;
    if call.arguments.get("refresh").and_then(Value::as_bool) == Some(true) {
        tool_fs::refresh_software_catalog(dispatcher);
    }
    let root = match projects::session_root(session_id) {
        Ok(root) => root,
        Err(error) => return json!({ "error": error.to_string() }),
    };
    let deferred = deferred_tools(dispatcher, root.as_deref());
    let eager_names = eager_model_tools_without_search()
        .iter()
        .filter_map(|tool| {
            tool.pointer("/function/name")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect::<Vec<_>>();
    let already_available = parse_select_names(&query)
        .unwrap_or_default()
        .into_iter()
        .filter(|name| eager_names.contains(name))
        .collect::<Vec<_>>();
    let matches = if query.is_empty() {
        Vec::new()
    } else if let Some(names) = parse_select_names(&query) {
        names
            .into_iter()
            .filter(|name| deferred.iter().any(|tool| tool.name == *name))
            .collect::<Vec<_>>()
    } else {
        let entries = catalog_entries(&deferred);
        search_catalog(&entries, &query, limit)
            .into_iter()
            .map(|entry| entry.name.clone())
            .collect()
    };
    // Discovery and schema loading have different budgets. Preserve every
    // requested candidate, but do not carry a broad keyword search's weak
    // matches in every subsequent model request. Exact selections are explicit.
    let candidates = matches.clone();
    let (matches, unavailable) =
        partition_available_candidates(matches, &deferred, root.as_deref());
    let matches = if parse_select_names(&query).is_some() {
        matches
    } else {
        matches.into_iter().take(3).collect::<Vec<_>>()
    };
    // Reference pattern (codex/opencode): embed each loaded tool's full
    // parameter schema in the search result itself. The provider only sees
    // this result's `content`, so the schemas must live there — not just in
    // raw — or the model still has to guess arguments before the next turn.
    const EMBEDDED_SCHEMA_CAP: usize = 12;
    let tool_schemas = matches
        .iter()
        .filter_map(|name| {
            deferred
                .iter()
                .find(|tool| &tool.name == name)
                .map(|tool| tool.schema.clone())
        })
        .take(EMBEDDED_SCHEMA_CAP)
        .collect::<Vec<_>>();
    let embedded_schemas_json = serde_json::to_string(&tool_schemas).unwrap_or_default();
    record_discovered_tool_names(session_id, &matches);
    let mut raw = json!({
        "matches": matches,
        "candidates": candidates,
        "unavailable": unavailable,
        "alreadyAvailable": already_available,
        "query": query,
        "total_deferred_tools": deferred.len(),
    });
    let (_, diagnostics) = tool_fs::software_catalog::software_catalog(dispatcher, false);
    raw["catalogDiagnostics"] = json!(diagnostics);
    raw["toolSchemas"] = json!(tool_schemas);
    let content = if candidates.is_empty() && already_available.is_empty() {
        let mut sources = std::collections::BTreeMap::<&str, usize>::new();
        for tool in &deferred {
            *sources.entry(&tool.source_name).or_default() += 1;
        }
        raw["availableSources"] = json!(
            sources
                .iter()
                .map(|(name, count)| { json!({"name": name, "toolCount": count}) })
                .collect::<Vec<_>>()
        );
        let groups = sources.keys().copied().collect::<Vec<_>>().join(", ");
        format!(
            "No keyword matches for `{query}`; this does not establish that a capability is unavailable. Check the tool schemas already provided and the ToolSearch catalog; use select:<tool_name> for an exact listed name or fewer keywords. Available tool groups: {groups}."
        )
    } else {
        let mut parts = Vec::new();
        if !already_available.is_empty() {
            parts.push(format!(
                "Already available: {}. Call them directly; no discovery is needed.",
                already_available.join(", ")
            ));
        }
        if !matches.is_empty() {
            parts.push(format!(
                "Loaded deferred tools: {}. Call them by name on the next turn.",
                matches.join(", ")
            ));
        }
        if !unavailable.is_empty() {
            parts.push(format!("Found but not loaded: {}. Connect the enabled MCP server, then retry discovery. Connection health and project availability are separate settings.", unavailable.join(", ")));
        }
        let additional = candidates
            .iter()
            .filter(|name| !matches.contains(name) && !unavailable.contains(name))
            .cloned()
            .collect::<Vec<_>>();
        if !additional.is_empty() {
            parts.push(format!("Additional ranked candidates (not loaded): {}. Load only a needed candidate with select:<name>.", additional.join(", ")));
        }
        parts.join("\n")
    };
    let content = if diagnostics
        .iter()
        .any(|diagnostic| diagnostic["code"] == "dynamic_provider_failed")
    {
        format!(
            "{content}\nSoftware catalog refresh failed; last successful definitions are retained. This is not proof a tool is absent. Retry ToolSearch with refresh=true if you need an updated catalog."
        )
    } else {
        content
    };
    let content = if tool_schemas.is_empty() {
        content
    } else {
        format!(
            "{content}\n\nFull parameter schemas for the loaded tools (call them by name on the next turn):\n{embedded_schemas_json}"
        )
    };
    let output = json!({
        "content": content,
        "raw": raw,
        "ok": true,
        "status": "completed",
    });
    record_tool_activity(
        session_id,
        turn_id,
        tool_activity(
            &call.id,
            TOOL_SEARCH_TOOL_NAME,
            "",
            "completed",
            call.arguments.clone(),
            Some(output.clone()),
            started_at,
            Some(now()),
        ),
        "toolFinished",
    );
    output
}

pub(crate) fn request_contains_tool(tools: &[Value], name: &str) -> bool {
    tools
        .iter()
        .any(|tool| tool.pointer("/function/name").and_then(Value::as_str) == Some(name))
}

pub(crate) fn schema_not_sent_if_needed(
    name: &str,
    request_tools: &[Value],
    _dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
) -> Option<Value> {
    if request_contains_tool(request_tools, name) {
        return None;
    }
    // A real deferred tool can be loaded with ToolSearch. An invented or
    // glued name must not be handed back as the next thing to call.
    if lookup_deferred_tool(name, _dispatcher, None).is_some() {
        Some(schema_not_sent_hint(name))
    } else {
        Some(unknown_tool_name_hint(name))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct SearchSession(String);

    impl SearchSession {
        fn new() -> Self {
            let session = new_session(Some("Tool discovery test".into()), None, "normal");
            let id = session.id.clone();
            state().lock().unwrap().sessions.insert(id.clone(), session);
            Self(id)
        }
    }

    impl Drop for SearchSession {
        fn drop(&mut self) {
            state().lock().unwrap().sessions.remove(&self.0);
        }
    }

    #[test]
    fn disconnected_mcp_candidates_are_found_but_never_reported_as_loaded() {
        let available = cached_builtin_deferred_tools()
            .iter()
            .find(|tool| tool.name == "browser_scroll")
            .unwrap()
            .clone();
        let mut disconnected = available.clone();
        disconnected.name = "mcp__offline_fixture__inspect".into();
        let manifest = disconnected.manifest.as_mut().unwrap();
        manifest.domain = "mcp".into();
        manifest.path = "/tools/mcp/capability/offline-fixture/inspect".into();
        let names = vec![disconnected.name.clone(), available.name.clone()];
        let (loaded, unavailable) =
            partition_available_candidates(names, &[available, disconnected], None);
        assert_eq!(loaded, vec!["browser_scroll"]);
        assert_eq!(unavailable, vec!["mcp__offline_fixture__inspect"]);
    }

    #[test]
    fn loaded_schema_stays_visible_without_search_history_and_rejects_unadvertised_calls() {
        let tools = assemble_provider_tools(
            &json!({"discoveredToolNames":["browser_scroll"],"messages":[]}),
            None,
            Some(128_000),
        );
        let schema = tools
            .iter()
            .find(|tool| tool["function"]["name"] == "browser_scroll")
            .unwrap();
        assert!(schema.get("defer_loading").is_none());
        for name in [
            "invented_tool",
            "software__removed__action",
            TOOL_SEARCH_TOOL_NAME,
        ] {
            assert_eq!(
                schema_not_sent_if_needed(name, &[], None).unwrap()["error"]["code"],
                "tool_schema_not_sent"
            );
        }
        assert!(schema_not_sent_if_needed("browser_scroll", &tools, None).is_none());
        let invented =
            schema_not_sent_if_needed("write_stdinworkbench_close_tab", &[], None).unwrap();
        let content = invented["content"].as_str().unwrap_or_default();
        assert!(!content.contains("select:write_stdinworkbench_close_tab"));
        assert!(content.contains("not a tool"));
    }

    #[test]
    fn attached_map_exposes_action_schemas_in_the_first_request() {
        let snapshot = json!({"messages":[{"role":"user", "metadata":{"pageCitations":[{
            "pageUrl":"https://example.test/", "surfaceMap":"[1 targetRef=lumen:send] button: Send"
        }]}}]});
        let tools = assemble_provider_tools(&snapshot, None, Some(128_000));
        for name in BROWSER_FOLLOW_TOOLS {
            let schema = tools
                .iter()
                .find(|tool| tool.pointer("/function/name").and_then(Value::as_str) == Some(name))
                .unwrap();
            assert!(schema.get("defer_loading").is_none());
        }
    }

    #[test]
    fn searching_eager_tools_reports_available_instead_of_no_match() {
        let session = SearchSession::new();
        let output = execute_tool_search(
            &session.0,
            "no-turn",
            None,
            &ModelToolCall {
                id: "search-eager-test".to_string(),
                name: TOOL_SEARCH_TOOL_NAME.to_string(),
                arguments: json!({"query":"select:browser_map,browser_read,browser_scroll"}),
            },
            "2026-09-26T00:00:00Z",
        );
        assert_eq!(
            output["raw"]["alreadyAvailable"],
            json!(["browser_map", "browser_read"])
        );
        assert_eq!(output["raw"]["matches"], json!(["browser_scroll"]));
        assert!(!output["content"].as_str().unwrap().contains("No matching"));
    }

    #[test]
    fn tool_search_result_embeds_loaded_parameter_schemas() {
        let session = SearchSession::new();
        let output = execute_tool_search(
            &session.0,
            "no-turn",
            None,
            &ModelToolCall {
                id: "search-schema-embed".to_string(),
                name: TOOL_SEARCH_TOOL_NAME.to_string(),
                arguments: json!({"query":"select:browser_scroll"}),
            },
            "2026-10-15T00:00:00Z",
        );
        let schemas = output["raw"]["toolSchemas"].as_array().unwrap();
        assert_eq!(schemas.len(), 1);
        assert_eq!(schemas[0]["function"]["name"], "browser_scroll");
        assert!(schemas[0]["function"]["parameters"].is_object());
        // The provider only sees `content`, so the schema must be there too.
        let content = output["content"].as_str().unwrap();
        assert!(content.contains("Full parameter schemas"));
        assert!(content.contains("\"browser_scroll\""));
        assert!(content.contains("parameters"));
    }

    #[test]
    fn upload_session_queries_discover_the_upload_schema() {
        for query in [
            "upload file attach filechooser input files",
            "file picker chooser attach insert document upload path",
        ] {
            let session = new_session(
                Some("Upload discovery regression".to_string()),
                None,
                "normal",
            );
            let session_id = session.id.clone();
            state()
                .lock()
                .unwrap()
                .sessions
                .insert(session_id.clone(), session);
            let output = execute_tool_search(
                &session_id,
                "no-turn",
                None,
                &ModelToolCall {
                    id: "upload-discovery-test".to_string(),
                    name: TOOL_SEARCH_TOOL_NAME.to_string(),
                    arguments: json!({"query": query, "max_results": 3}),
                },
                "2026-09-27T10:25:00Z",
            );
            let matches = output["raw"]["matches"].as_array().expect("matches");
            let snapshot = state()
                .lock()
                .unwrap()
                .sessions
                .remove(&session_id)
                .unwrap()
                .snapshot;
            eprintln!("{query}: {matches:?}");
            assert!(
                matches.contains(&json!("browser_upload")),
                "{query}: {output}"
            );
            assert!(discovered_tool_names(&snapshot).contains(&"browser_upload".to_string()));
            let tools = assemble_provider_tools(&snapshot, None, Some(128_000));
            assert!(request_contains_tool(&tools, "browser_upload"));
            assert!(schema_not_sent_if_needed("browser_upload", &tools, None).is_none());
            let wire = providers::protocol::openai_chat_completions::build_request_body(
                "test-model",
                &[],
                &tools,
                true,
            );
            let upload = wire["tools"]
                .as_array()
                .unwrap()
                .iter()
                .find(|tool| {
                    tool.pointer("/function/name").and_then(Value::as_str) == Some("browser_upload")
                })
                .expect("upload schema reaches the provider body");
            assert!(
                upload
                    .pointer("/function/parameters/properties/files")
                    .is_some()
            );
        }
    }

    #[test]
    fn broad_search_lists_candidates_without_loading_every_schema() {
        let session = SearchSession::new();
        let search = |query: &str, limit| {
            execute_tool_search(
                &session.0,
                "no-turn",
                None,
                &ModelToolCall {
                    id: "budget-search".into(),
                    name: TOOL_SEARCH_TOOL_NAME.into(),
                    arguments: json!({"query":query,"max_results":limit}),
                },
                "2026-09-27T10:25:00Z",
            )
        };
        let result = search("browser page file upload attachment", 20);
        let loaded = result["raw"]["matches"].as_array().unwrap();
        let candidates = result["raw"]["candidates"].as_array().unwrap();
        assert_eq!(loaded.len(), 3);
        assert!(candidates.len() > loaded.len());
        assert!(loaded.contains(&json!("browser_upload")));
        let selected = candidates.last().unwrap().as_str().unwrap();
        assert_eq!(
            search(&format!("select:{selected}"), 20)["raw"]["matches"],
            json!([selected])
        );
    }

    #[test]
    fn empty_search_preserves_the_available_catalog_and_a_recovery_path() {
        let session = SearchSession::new();
        let output = execute_tool_search(
            &session.0,
            "no-turn",
            None,
            &ModelToolCall {
                id: "empty-discovery-test".to_string(),
                name: TOOL_SEARCH_TOOL_NAME.to_string(),
                arguments: json!({"query": "nonexistentcapability"}),
            },
            "2026-09-27T10:25:00Z",
        );
        assert_eq!(output["raw"]["matches"], json!([]));
        assert!(
            output["raw"]["availableSources"]
                .as_array()
                .unwrap()
                .iter()
                .any(|source| {
                    source["name"] == "browser" && source["toolCount"].as_u64().unwrap() > 0
                })
        );
        assert!(
            output["content"]
                .as_str()
                .unwrap()
                .contains("select:<tool_name>")
        );
    }

    #[test]
    fn select_query_promotes_exact_names() {
        let tools = deferred_tools(None, None);
        assert!(tools.iter().any(|tool| tool.name == "browser_scroll"));
        let names = parse_select_names("select:browser_scroll,missing_tool").unwrap();
        let matches = names
            .into_iter()
            .filter(|name| tools.iter().any(|tool| tool.name == *name))
            .collect::<Vec<_>>();
        assert_eq!(matches, vec!["browser_scroll".to_string()]);
    }

    #[test]
    fn lookup_finds_eager_web_tools_that_tool_search_hides() {
        assert!(lookup_deferred_tool("web_search", None, None).is_some());
        assert!(lookup_deferred_tool("web_fetch", None, None).is_some());
        let deferred_names: Vec<_> = deferred_tools(None, None)
            .into_iter()
            .map(|tool| tool.name)
            .collect();
        assert!(!deferred_names.iter().any(|name| name == "web_search"));
        assert!(!deferred_names.iter().any(|name| name == "web_fetch"));
    }

    #[test]
    fn assemble_starts_with_eager_and_tool_search() {
        let tools = assemble_provider_tools(&json!({}), None, Some(128_000));
        let names: Vec<_> = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"read_file"));
        assert!(names.contains(&TOOL_SEARCH_TOOL_NAME));
        assert!(names.contains(&"web_search"));
        assert!(names.contains(&"web_fetch"));
        assert!(names.contains(&"design_reference"));
        assert!(names.contains(&"browser_read"));
        assert!(names.contains(&"browser_navigate"));
        assert!(names.contains(&"todo_update"));
        assert!(!names.contains(&"tool_fs_run"));
    }

    #[test]
    fn assemble_inserts_browser_tools_after_map() {
        let tools = assemble_provider_tools(
            &json!({
                "discoveredToolNames": ["browser_type", "browser_act", "browser_press", "browser_wait"]
            }),
            None,
            Some(128_000),
        );
        let typed = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str) == Some("browser_type")
            })
            .expect("type schema");
        assert!(typed.get("defer_loading").is_none());
        assert!(
            typed
                .pointer("/function/parameters/properties/fields")
                .is_some()
        );
        let names: Vec<_> = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"browser_act"));
        assert!(names.contains(&"browser_press"));
        assert!(names.contains(&"browser_wait"));
        // A persisted session from before uploads existed must gain the new
        // browser action without another map/search or a new conversation.
        let upload = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str) == Some("browser_upload")
            })
            .expect("upload schema in an old browser session");
        assert!(upload.get("defer_loading").is_none());
        assert!(
            upload
                .pointer("/function/parameters/properties/files")
                .is_some()
        );
        assert!(names.contains(&"browser_see"));
        assert!(names.contains(&"browser_vact"));
        for name in ["browser_see", "browser_vact"] {
            let tool = tools
                .iter()
                .find(|tool| tool.pointer("/function/name").and_then(Value::as_str) == Some(name))
                .unwrap();
            assert!(tool.get("defer_loading").is_none());
            assert!(tool.pointer("/function/parameters/properties").is_some());
        }
    }

    fn assemble_promotes_discovered_tools() {
        let tools = assemble_provider_tools(
            &json!({ "discoveredToolNames": ["web_search"] }),
            None,
            Some(128_000),
        );
        let names: Vec<_> = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"web_search"));
    }

    #[test]
    fn compact_messages_rehydrate_discovered_names() {
        let tools = assemble_provider_tools(
            &json!({
                "messages": [{
                    "role": "tool",
                    "name": "ToolSearch",
                    "lyraDiscoveredTools": ["web_search"]
                }]
            }),
            None,
            Some(128_000),
        );
        let names: Vec<_> = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"web_search"));
    }

    #[test]
    fn schema_not_sent_for_undiscovered_deferred_name() {
        let hint = schema_not_sent_if_needed("browser_read", &[], None).expect("hint");
        assert_eq!(
            hint.pointer("/error/code").and_then(Value::as_str),
            Some("tool_schema_not_sent")
        );
        assert!(
            hint["content"]
                .as_str()
                .is_some_and(|content| content.contains("select:browser_read"))
        );
    }

    #[test]
    fn bm25_ranks_exact_deferred_name() {
        let tools = deferred_tools(None, None);
        let entries = catalog_entries(&tools);
        let matches = search_catalog(&entries, "browser_scroll", 5);
        assert_eq!(
            matches.first().map(|entry| entry.name.as_str()),
            Some("browser_scroll")
        );
    }

    #[test]
    fn assemble_drops_unknown_or_disconnected_mcp_names() {
        let tools = assemble_provider_tools(
            &json!({
                "discoveredToolNames": ["mcp__missing__tool", "web_search"]
            }),
            None,
            Some(128_000),
        );
        let names: Vec<_> = tools
            .iter()
            .filter_map(|tool| tool.pointer("/function/name").and_then(Value::as_str))
            .collect();
        assert!(names.contains(&"web_search"));
        assert!(!names.contains(&"mcp__missing__tool"));
    }

    fn office_dispatcher() -> Arc<HostCapabilityDispatcher> {
        Arc::new(|method, _payload| {
            assert_eq!(method, "software.listCapabilities");
            Ok(serde_json::to_string(&json!({
                "software": [{
                    "id": "office",
                    "title": "Office",
                    "actions": [{
                        "id": "read",
                        "title": "Read office document",
                        "description": "Read a docx, xlsx, or pptx.",
                        "risk": "read",
                        "inputSchema": {
                            "type": "object",
                            "properties": { "path": { "type": "string" } },
                            "required": ["path"]
                        }
                    }, {
                        "id": "apply",
                        "title": "Apply office edits",
                        "description": "Patch docx, xlsx, or pptx, including background and theme.",
                        "risk": "write",
                        "inputSchema": {
                            "type": "object",
                            "properties": {
                                "path": { "type": "string" },
                                "ops": { "type": "array" }
                            },
                            "required": ["path", "ops"]
                        }
                    }]
                }]
            }))
            .expect("office capabilities"))
        })
    }

    fn provider_tool_names(
        snapshot: &Value,
        dispatcher: &Arc<HostCapabilityDispatcher>,
    ) -> Vec<String> {
        assemble_provider_tools(snapshot, Some(dispatcher), Some(128_000))
            .iter()
            .filter_map(|tool| {
                tool.pointer("/function/name")
                    .and_then(Value::as_str)
                    .map(str::to_string)
            })
            .collect()
    }

    #[test]
    fn office_file_in_the_latest_message_loads_office_schemas() {
        let dispatcher = office_dispatcher();
        let attached = json!({
            "messages": [{
                "role": "user",
                "text": "改成黑底⟦file:file-1⟧",
                "metadata": {
                    "fileAttachments": [{
                        "id": "file-1",
                        "path": "/tmp/答辩.pptx",
                        "name": "答辩.pptx"
                    }]
                }
            }]
        });
        let names = provider_tool_names(&attached, &dispatcher);
        assert!(names.contains(&"software__office__read".to_string()));
        assert!(names.contains(&"software__office__apply".to_string()));

        let path_in_text = json!({
            "messages": [{ "role": "user", "text": "改 /tmp/notes.docx 的标题" }]
        });
        let names = provider_tool_names(&path_in_text, &dispatcher);
        assert!(names.contains(&"software__office__apply".to_string()));

        let pdf = json!({
            "messages": [{
                "role": "user",
                "text": "看看这个",
                "metadata": { "fileAttachments": [{ "path": "/tmp/slides.pdf", "name": "slides.pdf" }] }
            }]
        });
        let names = provider_tool_names(&pdf, &dispatcher);
        assert!(!names.contains(&"software__office__apply".to_string()));

        let word_only = json!({
            "messages": [{ "role": "user", "text": "pptx 和 docx 有什么区别" }]
        });
        let names = provider_tool_names(&word_only, &dispatcher);
        assert!(!names.contains(&"software__office__read".to_string()));
    }

    #[test]
    fn office_schemas_follow_the_latest_message_not_an_older_one() {
        let dispatcher = office_dispatcher();
        let snapshot = json!({
            "messages": [
                {
                    "role": "user",
                    "metadata": { "fileAttachments": [{ "path": "/tmp/old.xlsx" }] }
                },
                { "role": "assistant", "text": "done" },
                { "role": "user", "text": "修一下这个 rust 测试" }
            ]
        });
        let names = provider_tool_names(&snapshot, &dispatcher);
        assert!(!names.contains(&"software__office__read".to_string()));
        assert!(!names.contains(&"software__office__apply".to_string()));
    }

    #[test]
    fn open_office_tab_loads_schemas_until_the_flag_clears() {
        let dispatcher = office_dispatcher();
        let open = json!({
            "messages": [{ "role": "user", "text": "把背景改成黑色" }],
            "ephemeralOfficeTools": true
        });
        let tools = assemble_provider_tools(&open, Some(&dispatcher), Some(128_000));
        let apply = tools
            .iter()
            .find(|tool| {
                tool.pointer("/function/name").and_then(Value::as_str)
                    == Some("software__office__apply")
            })
            .expect("apply schema");
        assert!(apply.get("defer_loading").is_none());
        assert!(
            apply
                .pointer("/function/parameters/properties/ops")
                .is_some()
        );

        let closed = json!({
            "messages": [{ "role": "user", "text": "把背景改成黑色" }],
            "ephemeralOfficeTools": false
        });
        let names = provider_tool_names(&closed, &dispatcher);
        assert!(!names.contains(&"software__office__apply".to_string()));

        assert!(office_turn_signal(
            &json!({ "messages": [{ "role": "user", "text": "改一下" }] }),
            Some(&json!({
                "activeTabId": "tab-1",
                "tabs": [
                    { "tabId": "tab-1", "active": true, "title": "答辩.pptx" },
                    { "tabId": "tab-2", "active": false, "title": "main.rs" }
                ]
            }))
        ));
        assert!(!office_turn_signal(
            &json!({ "messages": [{ "role": "user", "text": "改一下" }] }),
            Some(&json!({
                "activeTabId": "tab-2",
                "tabs": [
                    { "tabId": "tab-1", "active": false, "title": "答辩.pptx" },
                    { "tabId": "tab-2", "active": true, "focusedPane": true, "title": "main.rs" }
                ]
            }))
        ));
        assert!(!office_turn_signal(
            &json!({ "messages": [{ "role": "user", "text": "看看" }] }),
            Some(&json!({
                "tabs": [{ "active": true, "title": "手册.pdf" }]
            }))
        ));
    }
}
