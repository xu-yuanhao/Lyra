use super::*;

pub(crate) fn effective_registry(root: Option<&str>) -> AgentRuntimeResult<McpRegistryDocument> {
    let project = projects::for_root(root)?;
    let mut registry = read_registry();
    for server in &mut registry.servers {
        server.enabled = projects::enabled(project.as_ref(), "mcp", &server.id, server.enabled);
    }
    Ok(registry)
}

pub(crate) fn set_enabled(payload: Value) -> AgentRuntimeResult<Value> {
    let id = string_field(&payload, &["serverId"])
        .ok_or_else(|| AgentRuntimeError::Core("serverId is required".into()))?;
    let enabled = payload
        .get("enabled")
        .and_then(Value::as_bool)
        .ok_or_else(|| AgentRuntimeError::Core("enabled must be boolean".into()))?;
    let server = update_server(&id, |server| {
        server.enabled = enabled;
        Ok(())
    })?;
    // This is the default policy, not a connection kill switch. A different
    // project may explicitly allow this server and be using its shared peer.
    projects::notify_changed();
    Ok(
        json!({ "server": server_value(&server), "servers": read_registry().servers.iter().map(server_value).collect::<Vec<_>>() }),
    )
}

fn save_health(server: &McpServerConfig) {
    let _ = update_server(&server.id, |stored| {
        stored.state = server.state.clone();
        stored.tools = server.tools.clone();
        stored.last_error = server.last_error.clone();
        Ok(())
    });
}

fn refresh(mut server: McpServerConfig, payload: &Value, force: bool) -> McpServerConfig {
    if !force && server.state == "connected" && !server.tools.is_empty() {
        return server;
    }
    let result = probe_server(
        &server,
        timeout_from_payload_or(payload, server.startup_timeout_ms),
    );
    match result {
        Ok(tools) => {
            server.tools = tools;
            server.state = "connected".into();
            server.last_error = None;
        }
        Err(error) => {
            server.state = "failed".into();
            server.last_error = Some(error.to_string());
        }
    }
    save_health(&server);
    server
}

pub(crate) fn servers_for_call(
    name: &str,
    payload: &Value,
    servers: Vec<McpServerConfig>,
) -> AgentRuntimeResult<Vec<McpServerConfig>> {
    if name == "mcp_server_list" {
        return Ok(servers);
    }
    if !payload_names_a_server(payload) {
        return Err(AgentRuntimeError::Core(
            "serverId or serverUrl is required".into(),
        ));
    }
    let ids = server_ids_for_operation(payload, &servers);
    if ids.is_empty()
        || ids
            .iter()
            .any(|id| servers.iter().all(|server| &server.id != id))
    {
        return Err(AgentRuntimeError::Core(
            "MCP server is not in this session".into(),
        ));
    }
    let requested = servers
        .into_iter()
        .filter(|server| ids.contains(&server.id))
        .collect::<Vec<_>>();
    if requested.iter().any(|server| !server.enabled) {
        return Err(AgentRuntimeError::Core(
            "MCP server is unavailable or disabled in this project".into(),
        ));
    }
    Ok(requested)
}

pub(crate) fn execute(
    name: &str,
    payload: &Value,
    root: Option<&str>,
) -> AgentRuntimeResult<Value> {
    if name == "mcp_server_upsert" {
        let value = mcp_server_upsert(payload.clone())?;
        if let Some(root) = root
            && projects::for_root(Some(root))?.is_some()
        {
            for id in server_ids_from_payload(payload) {
                projects::set_override(root, "mcp", &id, Some(true))?;
            }
        }
        return Ok(value);
    }
    if name == "mcp_server_remove" {
        return mcp_server_remove(payload.clone());
    }
    if name == "mcp_server_disconnect" {
        if !payload_names_a_server(payload) {
            return Err(AgentRuntimeError::Core(
                "serverId or serverUrl is required".into(),
            ));
        }
        let registry = read_registry();
        let ids = server_ids_for_operation(payload, &registry.servers);
        if ids.is_empty() {
            // Zero hits are a named error that echoes the request and the
            // acceptable ids — never a silent "0 updated".
            let requested = string_field(
                payload,
                &["serverId", "id", "name", "serverUrl", "url", "endpoint"],
            )
            .unwrap_or_else(|| "<unnamed>".to_string());
            let known = registry
                .servers
                .iter()
                .map(|server| server.id.as_str())
                .collect::<Vec<_>>()
                .join(", ");
            return Err(AgentRuntimeError::Core(format!(
                "MCP server \"{requested}\" is not configured. Known server ids: {}",
                if known.is_empty() {
                    "(none)"
                } else {
                    known.as_str()
                }
            )));
        }
        let mut servers = Vec::new();
        let project_override = projects::for_root(root)?.is_some();
        for id in &ids {
            if project_override && let Some(root) = root {
                projects::set_override(root, "mcp", id, Some(false))?;
            } else {
                set_enabled(json!({"serverId": id, "enabled": false}))?;
            }
            // Echo the entity with its new state (ZCode/opencode convention).
            if let Some(server) = read_registry().servers.iter().find(|s| &s.id == id) {
                servers.push(server_value(server));
            }
        }
        return Ok(json!({ "serverIds": ids, "enabled": false, "servers": servers }));
    }
    if name == "mcp_server_connect" && connect_needs_http_install(payload, &read_registry().servers)
    {
        install_http_server_at(&mcp_storage_root(), payload)?;
    }
    let known = read_registry();
    if matches!(name, "mcp_server_connect" | "mcp_server_reload")
        && let Some(root) = root
        && projects::for_root(Some(root))?.is_some()
    {
        for id in server_ids_for_operation(payload, &known.servers) {
            projects::set_override(root, "mcp", &id, Some(true))?;
        }
    }
    let registry = effective_registry(root)?;
    if name == "mcp_server_list" {
        return Ok(
            json!({ "servers": registry.servers.iter().map(server_value).collect::<Vec<_>>(), "storageRoot": mcp_storage_root() }),
        );
    }
    let targets = servers_for_call(name, payload, registry.servers)?;
    match name {
        "mcp_server_connect" | "mcp_server_reload" => {
            let servers = targets
                .into_iter()
                .map(|server| refresh(server, payload, true))
                .collect::<Vec<_>>();
            // Settings already reloads its list on this event. Do not poll.
            // Discover and execute update health without announcing a new server.
            projects::notify_changed();
            Ok(json!({ "servers": servers.iter().map(server_value).collect::<Vec<_>>() }))
        }
        "mcp_tool_discover" => {
            let query = string_field(payload, &["query", "q"])
                .unwrap_or_default()
                .to_lowercase();
            let mut tools = Vec::new();
            let servers = targets
                .into_iter()
                .map(|server| refresh(server, payload, false))
                .collect::<Vec<_>>();
            for server in &servers {
                for tool in &server.tools {
                    if query.is_empty()
                        || format!("{} {} {}", server.name, tool.name, tool.description)
                            .to_lowercase()
                            .contains(&query)
                    {
                        tools.push(json!({ "serverId": server.id, "serverName": server.name, "name": tool.name, "description": tool.description, "inputSchema": tool.input_schema, "outputSchema": tool.output_schema }));
                    }
                }
            }
            Ok(
                json!({ "query": query, "tools": tools, "servers": servers.iter().map(server_value).collect::<Vec<_>>() }),
            )
        }
        "mcp_tool_inspect" | "mcp_tool_execute" => {
            if targets.len() != 1 {
                return Err(AgentRuntimeError::Core("serverId is required".into()));
            }
            let server = targets
                .into_iter()
                .next()
                .ok_or_else(|| AgentRuntimeError::Core("MCP server is not available".into()))?;
            let tool = string_field(payload, &["toolName", "tool"])
                .ok_or_else(|| AgentRuntimeError::Core("toolName is required".into()))?;
            if name == "mcp_tool_inspect" {
                let server = refresh(server, payload, false);
                let info = server
                    .tools
                    .iter()
                    .find(|item| item.name == tool)
                    .ok_or_else(|| {
                        AgentRuntimeError::Core(format!("MCP tool not found: {tool}"))
                    })?;
                return Ok(json!({ "server": server_value(&server), "tool": info }));
            }
            let arguments = payload
                .get("arguments")
                .or_else(|| payload.get("input"))
                .or_else(|| payload.get("payload"))
                .cloned()
                .unwrap_or_else(|| json!({}));
            let mut server = server;
            let result = sdk_call_tool(
                &server,
                &tool,
                arguments,
                timeout_from_payload_or(payload, server.tool_timeout_ms),
            );
            match &result {
                Ok(_) => {
                    server.state = "connected".into();
                    server.last_error = None;
                }
                Err(error) => {
                    server.state = "failed".into();
                    server.last_error = Some(error.to_string());
                }
            }
            save_health(&server);
            Ok(json!({ "serverId": server.id, "toolName": tool, "result": result? }))
        }
        _ => Err(AgentRuntimeError::Core(format!(
            "Unsupported scoped MCP operation: {name}"
        ))),
    }
}

/// Model-facing list operations expose only capabilities permitted by the
/// actual session. The settings RPC keeps the complete installed catalog.
pub(crate) fn execute_for_project(
    name: &str,
    payload: &Value,
    root: Option<&str>,
) -> AgentRuntimeResult<Value> {
    let mut result = execute(name, payload, root)?;
    if name == "mcp_server_list" {
        if let Some(servers) = result.get_mut("servers").and_then(Value::as_array_mut) {
            servers.retain(|server| server.get("enabled").and_then(Value::as_bool) == Some(true));
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn http_server(id: &str, url: &str, enabled: bool) -> McpServerConfig {
        serde_json::from_value(json!({
            "id": id,
            "name": id,
            "enabled": enabled,
            "transport": { "kind": "http", "url": url },
            "createdAt": "2026-01-01T00:00:00Z",
            "updatedAt": "2026-01-01T00:00:00Z"
        }))
        .expect("server")
    }

    #[test]
    fn a_url_selects_one_server_and_an_empty_call_is_not_every_server() {
        let servers = vec![
            http_server("deepwiki", "https://mcp.deepwiki.com/mcp", true),
            http_server("other", "https://example.invalid/mcp", false),
        ];
        let selected = servers_for_call(
            "mcp_server_connect",
            &json!({"serverUrl": "https://mcp.deepwiki.com/mcp"}),
            servers.clone(),
        )
        .expect("the addressed server");
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].id, "deepwiki");

        let by_url_when_id_is_unknown = servers_for_call(
            "mcp_server_connect",
            &json!({"serverId": "missing", "serverUrl": "https://mcp.deepwiki.com/mcp"}),
            servers.clone(),
        )
        .expect("an unknown id does not hide the url");
        assert_eq!(by_url_when_id_is_unknown[0].id, "deepwiki");

        match servers_for_call("mcp_server_connect", &json!({}), servers.clone()) {
            Err(AgentRuntimeError::Core(message)) => {
                assert_eq!(message, "serverId or serverUrl is required");
            }
            other => panic!("unexpected {other:?}"),
        }

        match servers_for_call(
            "mcp_server_connect",
            &json!({"serverUrl": "https://missing.example/mcp"}),
            servers.clone(),
        ) {
            Err(AgentRuntimeError::Core(message)) => {
                assert_eq!(message, "MCP server is not in this session");
            }
            other => panic!("unexpected {other:?}"),
        }

        match servers_for_call(
            "mcp_server_connect",
            &json!({"serverUrl": "https://example.invalid/mcp"}),
            servers,
        ) {
            Err(AgentRuntimeError::Core(message)) => {
                assert!(message.contains("disabled"));
            }
            other => panic!("unexpected {other:?}"),
        }
    }
}
