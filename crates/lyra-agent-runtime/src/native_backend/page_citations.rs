use super::*;

pub(crate) const PAGE_CITATION_PREVIEW_CHARS: usize = 32;
pub(crate) const PAGE_CITATION_QUOTED_CHARS: usize = 480;

pub(crate) fn parse_page_citations(payload: &Value) -> Vec<Value> {
    payload
        .get("pageCitations")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .filter_map(normalize_page_citation)
        .collect()
}

pub(crate) fn apply_page_citations_to_user_message(user_message: &mut Value, citations: &[Value]) {
    if citations.is_empty() {
        return;
    }
    let metadata = user_message
        .get_mut("metadata")
        .and_then(Value::as_object_mut);
    let metadata = match metadata {
        Some(object) => object,
        None => {
            user_message["metadata"] = json!({});
            user_message
                .get_mut("metadata")
                .and_then(Value::as_object_mut)
                .expect("metadata object")
        }
    };
    metadata.insert("pageCitations".to_string(), json!(citations));
}

pub(crate) fn expand_page_cite_markers(
    text: &str,
    citations: &[Value],
    mode: PageCiteMarkerMode,
) -> String {
    let preview_by_id = citations
        .iter()
        .filter_map(|citation| {
            let id = citation.get("id").and_then(Value::as_str)?;
            let preview = citation
                .get("preview")
                .and_then(Value::as_str)
                .filter(|value| !value.is_empty())
                .or_else(|| citation.get("pageTitle").and_then(Value::as_str))
                .or_else(|| citation.get("tabTitle").and_then(Value::as_str))
                .unwrap_or("Page");
            Some((id, preview))
        })
        .collect::<std::collections::HashMap<_, _>>();
    let mut output = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('⟦') {
        let Some(end_rel) = rest[start..].find('⟧') else {
            output.push_str(rest);
            rest = "";
            break;
        };
        output.push_str(&rest[..start]);
        let inner = &rest[start + '⟦'.len_utf8()..start + end_rel];
        let replacement = match inner.split_once(':') {
            Some(("page-cite", id)) => match mode {
                PageCiteMarkerMode::Title => {
                    preview_by_id.get(id).copied().unwrap_or("Page").to_string()
                }
                PageCiteMarkerMode::ModelUserText => String::new(),
            },
            Some(("image" | "file" | "cite", _)) if matches!(mode, PageCiteMarkerMode::Title) => {
                rest[start..start + end_rel + '⟧'.len_utf8()].to_string()
            }
            Some((_, _)) if matches!(mode, PageCiteMarkerMode::Title) => String::new(),
            _ => rest[start..start + end_rel + '⟧'.len_utf8()].to_string(),
        };
        if !replacement.is_empty()
            && output
                .chars()
                .last()
                .is_some_and(|character| !character.is_whitespace())
        {
            output.push(' ');
        }
        output.push_str(&replacement);
        rest = &rest[start + end_rel + '⟧'.len_utf8()..];
        if !replacement.is_empty()
            && rest
                .chars()
                .next()
                .is_some_and(|character| !character.is_whitespace())
        {
            output.push(' ');
        }
    }
    output.push_str(rest);
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Clone, Copy)]
pub(crate) enum PageCiteMarkerMode {
    Title,
    ModelUserText,
}

fn normalize_page_citation(raw: Value) -> Option<Value> {
    let tab_id = raw.get("tabId").and_then(Value::as_str)?;
    let page_url = raw.get("pageUrl").and_then(Value::as_str)?;
    let id = raw
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("page-cite-{}", Uuid::new_v4()));
    let excerpt_kind = raw
        .get("excerptKind")
        .and_then(Value::as_str)
        .filter(|value| matches!(*value, "selection" | "link" | "page"))
        .unwrap_or("page");
    let quoted_text = raw
        .get("quotedText")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let (quoted_text, truncated, preview) = truncate_page_quoted_text(&quoted_text);
    Some(json!({
        "id": id,
        "tabId": tab_id,
        "tabTitle": raw.get("tabTitle").and_then(Value::as_str).unwrap_or(""),
        "pageUrl": page_url,
        "pageTitle": raw.get("pageTitle").and_then(Value::as_str).unwrap_or(page_url),
        "frameUrl": raw.get("frameUrl").cloned().unwrap_or(Value::Null),
        "linkUrl": raw.get("linkUrl").cloned().unwrap_or(Value::Null),
        "linkText": raw.get("linkText").cloned().unwrap_or(Value::Null),
        "srcUrl": raw.get("srcUrl").cloned().unwrap_or(Value::Null),
        "mediaType": raw.get("mediaType").cloned().unwrap_or(Value::Null),
        "elementTag": raw.get("elementTag").cloned().unwrap_or(Value::Null),
        "elementSelector": raw.get("elementSelector").cloned().unwrap_or(Value::Null),
        "elementId": raw.get("elementId").cloned().unwrap_or(Value::Null),
        "elementRole": raw.get("elementRole").cloned().unwrap_or(Value::Null),
        "elementAriaLabel": raw.get("elementAriaLabel").cloned().unwrap_or(Value::Null),
        "excerptKind": excerpt_kind,
        "preview": raw.get("preview").and_then(Value::as_str).unwrap_or(&preview),
        "quotedText": quoted_text,
        "surfaceMap": truncate_surface_map(raw.get("surfaceMap").and_then(Value::as_str).unwrap_or("")),
        "truncated": raw.get("truncated").and_then(Value::as_bool).unwrap_or(truncated),
        "sourceCapturedAt": raw.get("sourceCapturedAt").cloned().unwrap_or(Value::Null),
        "sourceKind": raw.get("sourceKind").cloned().unwrap_or(Value::Null),
        "captureFidelity": raw.get("captureFidelity").cloned().unwrap_or(Value::Null),
        "tabPageKind": raw.get("tabPageKind").cloned().unwrap_or(Value::Null),
        "faviconUrl": raw.get("faviconUrl").cloned().unwrap_or(Value::Null),
        "appId": raw.get("appId").cloned().unwrap_or(Value::Null),
        "appIconKey": raw.get("appIconKey").cloned().unwrap_or(Value::Null),
    }))
}

fn truncate_page_quoted_text(text: &str) -> (String, bool, String) {
    let chars: Vec<char> = text.chars().collect();
    let truncated = chars.len() > PAGE_CITATION_QUOTED_CHARS;
    let quoted: String = chars.iter().take(PAGE_CITATION_QUOTED_CHARS).collect();
    let preview: String = chars.iter().take(PAGE_CITATION_PREVIEW_CHARS).collect();
    let preview = if chars.len() > PAGE_CITATION_PREVIEW_CHARS {
        format!("{preview}…")
    } else {
        preview
    };
    (quoted, truncated, preview)
}

pub(crate) fn format_page_cite_xml(citation: &Value) -> Option<String> {
    let id = citation.get("id").and_then(Value::as_str)?;
    let tab_id = citation.get("tabId").and_then(Value::as_str)?;
    let tab_title = citation
        .get("tabTitle")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let page_url = citation.get("pageUrl").and_then(Value::as_str)?;
    let page_title = citation
        .get("pageTitle")
        .and_then(Value::as_str)
        .unwrap_or(page_url);
    let excerpt_kind = citation
        .get("excerptKind")
        .and_then(Value::as_str)
        .unwrap_or("page");
    let truncated = citation
        .get("truncated")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let link_url = citation
        .get("linkUrl")
        .and_then(Value::as_str)
        .map(|value| format!(" linkUrl=\"{value}\""))
        .unwrap_or_default();
    let link_text = citation
        .get("linkText")
        .and_then(Value::as_str)
        .map(|value| format!(" linkText=\"{value}\""))
        .unwrap_or_default();
    let src_url = citation
        .get("srcUrl")
        .and_then(Value::as_str)
        .map(|value| format!(" srcUrl=\"{value}\""))
        .unwrap_or_default();
    let element_selector = citation
        .get("elementSelector")
        .and_then(Value::as_str)
        .map(|value| format!(" elementSelector=\"{value}\""))
        .unwrap_or_default();
    let element_tag = citation
        .get("elementTag")
        .and_then(Value::as_str)
        .map(|value| format!(" elementTag=\"{value}\""))
        .unwrap_or_default();
    let source_kind = citation
        .get("sourceKind")
        .and_then(Value::as_str)
        .map(|value| format!(" sourceKind=\"{value}\""))
        .unwrap_or_default();
    let capture_fidelity = citation
        .get("captureFidelity")
        .and_then(Value::as_str)
        .map(|value| format!(" captureFidelity=\"{value}\""))
        .unwrap_or_default();
    let quoted = citation
        .get("quotedText")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let surface_map = citation
        .get("surfaceMap")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let body = if surface_map.is_empty() {
        quoted.to_string()
    } else if quoted.is_empty() {
        surface_map.to_string()
    } else {
        format!("{quoted}\n{surface_map}")
    };
    Some(format!(
        "<lyra-page-cite id=\"{id}\" tabId=\"{tab_id}\" tabTitle=\"{tab_title}\" pageUrl=\"{page_url}\" pageTitle=\"{page_title}\" excerptKind=\"{excerpt_kind}\" truncated=\"{truncated}\"{link_url}{link_text}{src_url}{element_selector}{element_tag}{source_kind}{capture_fidelity}>\n{body}\n</lyra-page-cite>"
    ))
}

const SURFACE_MAP_CHARS: usize = 8_000;

pub(crate) fn citation_needs_live_map(citation: &Value) -> bool {
    if citation.get("excerptKind").and_then(Value::as_str) != Some("page") {
        return false;
    }
    if citation.get("sourceKind").and_then(Value::as_str) == Some("terminal-tab") {
        return false;
    }
    // App, settings and search tabs cite a Lyra surface with no browser page to
    // map; only a real browser page earns a live map. Missing tabPageKind means
    // an external/browser citation, which still maps.
    if citation
        .get("tabPageKind")
        .and_then(Value::as_str)
        .is_some_and(|kind| kind != "page")
    {
        return false;
    }
    let url = citation
        .get("pageUrl")
        .and_then(Value::as_str)
        .unwrap_or("");
    if url.starts_with("lyra://terminal/") {
        return false;
    }
    let tab_id = citation.get("tabId").and_then(Value::as_str).unwrap_or("");
    if tab_id.is_empty() {
        return false;
    }
    citation
        .get("surfaceMap")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .is_empty()
}

pub(crate) async fn show_attached_page_maps(session_id: &str, turn_id: &str) {
    let pending = attached_pages_missing_maps(session_id);
    if pending.is_empty() {
        return;
    }
    let Some(dispatcher) = super::state::host_dispatcher() else {
        return;
    };
    for (citation_id, tab_id, title) in pending {
        let tool_id = format!("page-map-{citation_id}");
        let started = super::helpers::now();
        super::activity::record_tool_activity(
            session_id,
            turn_id,
            super::activity::tool_activity(
                &tool_id,
                "browser_map",
                "Map the attached page",
                "running",
                json!({ "tabId": tab_id, "pageTitle": title }),
                None,
                &started,
                None,
            ),
            "toolStarted",
        );
        let mapped = super::tools::invoke_host_capability_with_timeout_async(
            dispatcher.clone(),
            "lyraLumen.map".to_string(),
            json!({ "tabId": tab_id, "strategy": "interactiveOnly", "mapScope": "document" }),
            15_000,
        )
        .await;
        let map = mapped
            .as_ref()
            .ok()
            .and_then(|value| value.get("mapAppendix").and_then(Value::as_str))
            .map(truncate_surface_map)
            .filter(|text| !text.trim().is_empty());
        if let Some(map) = map.as_deref() {
            write_surface_map(session_id, &citation_id, map);
            super::tools::tool_search::record_browser_follow_tools(session_id, "browser_map");
        }
        let failed = map.is_none();
        super::activity::record_tool_activity(
            session_id,
            turn_id,
            super::activity::tool_activity(
                &tool_id,
                "browser_map",
                "Map the attached page",
                if failed { "failed" } else { "completed" },
                json!({ "tabId": tab_id, "pageTitle": title }),
                Some(json!({
                    "content": map.clone().unwrap_or_else(|| "The attached page had no map.".to_string())
                })),
                &started,
                Some(super::helpers::now()),
            ),
            "toolFinished",
        );
    }
}

fn attached_pages_missing_maps(session_id: &str) -> Vec<(String, String, String)> {
    let Ok(state) = super::state::state().lock() else {
        return Vec::new();
    };
    let Some(session) = state.sessions.get(session_id) else {
        return Vec::new();
    };
    let Some(messages) = session.snapshot.get("messages").and_then(Value::as_array) else {
        return Vec::new();
    };
    let Some(citations) = messages.iter().rev().find_map(|message| {
        if message.get("role").and_then(Value::as_str) != Some("user") {
            return None;
        }
        message
            .pointer("/metadata/pageCitations")
            .and_then(Value::as_array)
    }) else {
        return Vec::new();
    };
    citations
        .iter()
        .filter(|citation| citation_needs_live_map(citation))
        .filter_map(|citation| {
            Some((
                citation.get("id")?.as_str()?.to_string(),
                citation.get("tabId")?.as_str()?.to_string(),
                citation
                    .get("pageTitle")
                    .or_else(|| citation.get("tabTitle"))
                    .and_then(Value::as_str)
                    .unwrap_or("page")
                    .to_string(),
            ))
        })
        .collect()
}

fn write_surface_map(session_id: &str, citation_id: &str, map: &str) {
    let Ok(mut state) = super::state::state().lock() else {
        return;
    };
    let Some(session) = state.sessions.get_mut(session_id) else {
        return;
    };
    let Some(messages) = session
        .snapshot
        .get_mut("messages")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    let Some(index) = messages.iter().rposition(|message| {
        message.get("role").and_then(Value::as_str) == Some("user")
            && message
                .pointer("/metadata/pageCitations")
                .and_then(Value::as_array)
                .is_some_and(|citations| {
                    citations.iter().any(|citation| {
                        citation.get("id").and_then(Value::as_str) == Some(citation_id)
                    })
                })
    }) else {
        return;
    };
    let Some(citations) = messages[index]
        .pointer_mut("/metadata/pageCitations")
        .and_then(Value::as_array_mut)
    else {
        return;
    };
    for citation in citations {
        if citation.get("id").and_then(Value::as_str) == Some(citation_id) {
            citation["surfaceMap"] = json!(map);
        }
    }
    super::helpers::mark_dialog_dirty_from(session, index);
}

fn truncate_surface_map(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    chars.into_iter().take(SURFACE_MAP_CHARS).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_page_citations_normalizes_payload() {
        let payload = json!({
            "pageCitations": [{
                "id": "page-cite-1",
                "tabId": "tab-1",
                "tabTitle": "Docs",
                "pageUrl": "https://example.com/docs",
                "pageTitle": "Documentation",
                "excerptKind": "selection",
                "quotedText": "hello world"
            }]
        });
        let citations = parse_page_citations(&payload);
        assert_eq!(citations.len(), 1);
        assert_eq!(citations[0]["tabId"], "tab-1");
        assert_eq!(citations[0]["pageUrl"], "https://example.com/docs");
    }

    #[test]
    fn format_page_cite_xml_includes_metadata() {
        let citation = json!({
            "id": "page-cite-1",
            "tabId": "tab-1",
            "tabTitle": "Docs",
            "pageUrl": "https://example.com/docs",
            "pageTitle": "Documentation",
            "excerptKind": "link",
            "truncated": false,
            "linkUrl": "https://example.com/a",
            "linkText": "Read more",
            "quotedText": "Read more"
        });
        let xml = format_page_cite_xml(&citation).expect("xml");
        assert!(xml.contains("tabId=\"tab-1\""));
        assert!(xml.contains("pageUrl=\"https://example.com/docs\""));
        assert!(xml.contains("linkUrl=\"https://example.com/a\""));
        assert!(xml.contains("Read more"));
    }

    #[test]
    fn citation_needs_live_map_only_for_a_whole_page_without_one() {
        let page = json!({
            "id": "page-cite-1",
            "tabId": "tab-1",
            "pageUrl": "https://example.com",
            "excerptKind": "page"
        });
        assert!(citation_needs_live_map(&page));
        let mut carried = page.clone();
        carried["surfaceMap"] = json!("Now operable:");
        assert!(!citation_needs_live_map(&carried));
        let mut selection = page.clone();
        selection["excerptKind"] = json!("selection");
        assert!(!citation_needs_live_map(&selection));
        let mut terminal = page.clone();
        terminal["sourceKind"] = json!("terminal-tab");
        assert!(!citation_needs_live_map(&terminal));
        let mut file_manager = page.clone();
        file_manager["tabPageKind"] = json!("app");
        file_manager["pageUrl"] = json!("/home/user/Documents");
        assert!(!citation_needs_live_map(&file_manager));
        let mut settings = page.clone();
        settings["tabPageKind"] = json!("settings");
        settings["pageUrl"] = json!("lyra://settings");
        assert!(!citation_needs_live_map(&settings));
        let mut browser_tab = page.clone();
        browser_tab["tabPageKind"] = json!("page");
        browser_tab["sourceKind"] = json!("workspace-tab");
        assert!(citation_needs_live_map(&browser_tab));
    }

    #[test]
    fn format_page_cite_xml_includes_surface_map() {
        let citation = json!({
            "id": "page-cite-1",
            "tabId": "tab-1",
            "tabTitle": "Docs",
            "pageUrl": "https://example.com",
            "pageTitle": "Docs",
            "excerptKind": "page",
            "truncated": false,
            "quotedText": "Docs",
            "surfaceMap": "Now operable:\n[1 targetRef=lumen:a] button: \"Save\""
        });
        let xml = format_page_cite_xml(&citation).expect("xml");
        assert!(xml.contains("Now operable:"));
        assert!(xml.contains("lumen:a"));
    }

    #[test]
    fn expand_page_cite_markers_uses_preview_for_titles() {
        let citations = vec![json!({
            "id": "page-cite-1",
            "preview": "Cloudflare Dashboard",
            "pageTitle": "Cloudflare | Web Performance & Security"
        })];
        let title = expand_page_cite_markers(
            "给你自己配置⟦page-cite:page-cite-1⟧",
            &citations,
            PageCiteMarkerMode::Title,
        );
        assert_eq!(title, "给你自己配置 Cloudflare Dashboard");
        assert!(!title.contains("⟦"));
        let model = expand_page_cite_markers(
            "给你自己配置⟦page-cite:page-cite-1⟧",
            &citations,
            PageCiteMarkerMode::ModelUserText,
        );
        assert_eq!(model, "给你自己配置");
    }

    #[test]
    fn expand_page_cite_markers_keeps_attachment_markers_in_titles() {
        let title = expand_page_cite_markers(
            "看 ⟦image:img-1⟧ ⟦file:file-1⟧ ⟦cite:cite-1⟧ ⟦future-ref:abc⟧",
            &[],
            PageCiteMarkerMode::Title,
        );
        assert!(title.contains("⟦image:img-1⟧"));
        assert!(title.contains("⟦file:file-1⟧"));
        assert!(title.contains("⟦cite:cite-1⟧"));
        assert!(!title.contains("future-ref"));
    }
}
