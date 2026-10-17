use super::*;

pub(crate) enum RuntimeToolTarget {
    MemoryAdapter {
        tool_name: &'static str,
        action: &'static str,
    },
    NativeAdapter {
        tool_name: &'static str,
        display_name: &'static str,
        action: &'static str,
    },
    SkillAdapter {
        tool_name: &'static str,
        action: &'static str,
    },
    McpAdapter {
        tool_name: &'static str,
        action: &'static str,
    },
    HostAdapter {
        host_method: &'static str,
        display_name: &'static str,
        action: &'static str,
    },
    SoftwareCapability {
        software_id: String,
        action_id: String,
    },
    McpCapability {
        server_id: String,
        tool_name: String,
    },
    SkillCapability {
        skill_id: String,
    },
}

pub(crate) fn runtime_target_for_manifest(manifest: &ToolManifest) -> Option<RuntimeToolTarget> {
    if let Some((software_id, action_id)) = parse_software_capability_path(&manifest.path) {
        return Some(RuntimeToolTarget::SoftwareCapability {
            software_id,
            action_id,
        });
    }
    if let Some((server_id, tool_name)) =
        super::mcp_dynamic::parse_mcp_capability_path(&manifest.path)
    {
        return Some(RuntimeToolTarget::McpCapability {
            server_id,
            tool_name,
        });
    }
    if let Some(skill_id) = super::skills_dynamic::parse_skill_capability_path(&manifest.path) {
        return Some(RuntimeToolTarget::SkillCapability { skill_id });
    }
    let host = |host_method, display_name, action| RuntimeToolTarget::HostAdapter {
        host_method,
        display_name,
        action,
    };
    let memory = |tool_name, action| RuntimeToolTarget::MemoryAdapter { tool_name, action };
    let native = |tool_name, display_name, action| RuntimeToolTarget::NativeAdapter {
        tool_name,
        display_name,
        action,
    };
    let skill = |tool_name, action| RuntimeToolTarget::SkillAdapter { tool_name, action };
    let mcp = |tool_name, action| RuntimeToolTarget::McpAdapter { tool_name, action };
    Some(match manifest.path.as_str() {
        "/tools/runtime/artifact_read" => native("artifact_read", "artifact", "read"),
        "/tools/media/generate_image" => native("media_generate_image", "media", "generate_image"),
        "/tools/media/generate_speech" => {
            native("media_generate_speech", "media", "generate_speech")
        }
        "/tools/media/transcribe_audio" => {
            native("media_transcribe_audio", "media", "transcribe_audio")
        }
        "/tools/media/generate_video" => native("media_generate_video", "media", "generate_video"),
        "/tools/filesystem/list_files" => native("file_list", "file", "list"),
        "/tools/memory/search" => memory("memory_search", "search"),
        "/tools/memory/write" => memory("memory_write", "write"),
        "/tools/memory/review_candidates" => {
            memory("memory_review_candidates", "review_candidates")
        }
        "/tools/memory/apply_candidate" => memory("memory_apply_candidate", "apply_candidate"),
        "/tools/memory/reject_candidate" => memory("memory_reject_candidate", "reject_candidate"),
        "/tools/memory/explain_injection" => {
            memory("memory_explain_injection", "explain_injection")
        }
        "/tools/memory/read_compressed_context" => {
            memory("memory_read_compressed_context", "read_compressed_context")
        }
        "/tools/workbench/list_tabs" => host("workbench.listTabs", "workbench", "list_tabs"),
        "/tools/workbench/read_workspace" => {
            host("workbench.readWorkspace", "workbench", "read_workspace")
        }
        "/tools/workbench/read_tab" => host("workbench.readTab", "workbench", "read_tab"),
        "/tools/workbench/capture_visual_evidence" => host(
            "workbench.captureVisualEvidence",
            "workbench",
            "capture_visual_evidence",
        ),
        "/tools/workbench/activate_tab" => {
            host("workbench.activateTab", "workbench", "activate_tab")
        }
        "/tools/workbench/close_tab" => host("workbench.closeTab", "workbench", "close_tab"),
        "/tools/workbench/reorder_tab" => host("workbench.reorderTab", "workbench", "reorder_tab"),
        "/tools/workbench/split_tabs" => host("workbench.splitTabs", "workbench", "split_tabs"),
        "/tools/workbench/detach_split" => {
            host("workbench.detachSplit", "workbench", "detach_split")
        }
        "/tools/workbench/list_terminals" => {
            host("workbench.listTerminals", "workbench", "list_terminals")
        }
        "/tools/workbench/open_terminal" => {
            host("workbench.openTerminal", "workbench", "open_terminal")
        }
        "/tools/workbench/focus_terminal" => {
            host("workbench.focusTerminal", "workbench", "focus_terminal")
        }
        "/tools/workbench/close_terminal" => {
            host("workbench.closeTerminal", "workbench", "close_terminal")
        }
        "/tools/workbench/move_terminal" => {
            host("workbench.moveTerminal", "workbench", "move_terminal")
        }
        "/tools/workbench/extract_tab_text" => {
            host("workbench.extractTabText", "workbench", "extract_tab_text")
        }
        "/tools/workbench/list_favorites" => {
            host("workbench.listFavorites", "workbench", "list_favorites")
        }
        "/tools/workbench/remove_favorite" => {
            host("workbench.removeFavorite", "workbench", "remove_favorite")
        }
        "/tools/software/list_capabilities" => {
            host("software.listCapabilities", "software", "list_capabilities")
        }
        "/tools/software/inspect_capability" => host(
            "software.inspectCapability",
            "software",
            "inspect_capability",
        ),
        "/tools/software/read_state" => host("software.readState", "software", "read_state"),
        "/tools/software/invoke_capability" => {
            host("software.invokeCapability", "software", "invoke_capability")
        }
        "/tools/design/reference" => native("design_reference", "design", "read"),
        "/tools/design/extract_reference" => {
            native("design_extract_reference", "design", "extract_reference")
        }
        "/tools/design/quality" => native("design_quality", "design", "quality"),
        "/tools/agent/spawn" => native("agent_spawn", "agent", "spawn"),
        "/tools/browser/map" => host("lyraLumen.map", "lyra_lumen", "map"),
        "/tools/browser/read" => host("lyraLumen.read", "lyra_lumen", "read"),
        "/tools/browser/see" => host("lyraLumen.see", "lyra_lumen", "see"),
        "/tools/browser/dialog" => host("lyraLumen.dialog", "lyra_lumen", "dialog"),
        "/tools/browser/drag" => host("lyraLumen.drag", "lyra_lumen", "drag"),
        "/tools/browser/act" => host("lyraLumen.act", "lyra_lumen", "act"),
        "/tools/browser/vact" => host("lyraLumen.vact", "lyra_lumen", "vact"),
        "/tools/browser/type" => host("lyraLumen.type", "lyra_lumen", "type"),
        "/tools/browser/upload" => host("lyraLumen.upload", "lyra_lumen", "upload"),
        "/tools/browser/reload" => host("lyraLumen.reload", "lyra_lumen", "reload"),
        "/tools/browser/press" => host("lyraLumen.press", "lyra_lumen", "press"),
        "/tools/browser/scroll" => host("lyraLumen.scroll", "lyra_lumen", "scroll"),
        "/tools/browser/wait" => host("lyraLumen.wait", "lyra_lumen", "wait"),
        "/tools/browser/navigate" => host("lyraLumen.navigate", "lyra_lumen", "navigate"),
        "/tools/browser/detect_qr" => host("lyraLumen.detectQr", "lyra_lumen", "detect_qr"),
        "/tools/browser/elevate" => host("lyraLumen.elevate", "lyra_lumen", "elevate"),
        "/tools/browser_ax/map" => host("lyraAx.map", "lyra_ax", "map"),
        "/tools/browser_ax/act" => host("lyraAx.act", "lyra_ax", "act"),
        "/tools/computer/list_apps" => host("lyraComputer.listApps", "lyra_computer", "list_apps"),
        "/tools/computer/observe" => host("lyraComputer.observe", "lyra_computer", "observe"),
        "/tools/computer/focus" => host("lyraComputer.focus", "lyra_computer", "focus"),
        "/tools/computer/map" => host("lyraComputer.map", "lyra_computer", "map"),
        "/tools/computer/find" => host("lyraComputer.find", "lyra_computer", "find"),
        "/tools/computer/act" => host("lyraComputer.act", "lyra_computer", "act"),
        "/tools/computer/diff" => host("lyraComputer.diff", "lyra_computer", "diff"),
        "/tools/computer/explain" => host("lyraComputer.explain", "lyra_computer", "explain"),
        "/tools/computer/see" => host("lyraComputer.see", "lyra_computer", "see"),
        "/tools/network/status" => native("network_status", "network", "status"),
        "/tools/web/search" => native("web_search", "web", "search"),
        "/tools/web/research" => native("web_research", "web", "research"),
        "/tools/web/map" => native("web_map", "web", "map"),
        "/tools/web/batch" => native("web_batch", "web", "batch"),
        "/tools/web/fetch" => native("web_fetch", "web", "fetch"),
        "/tools/todo/read" => native("todo_read", "todo", "read"),
        "/tools/skills/list" => skill("skill_list", "list"),
        "/tools/skills/inspect" => skill("skill_inspect", "inspect"),
        "/tools/skills/activate" => skill("skill_activate", "activate"),
        "/tools/skills/deactivate" => skill("skill_deactivate", "deactivate"),
        "/tools/skills/install_local" => skill("skill_install_local", "install_local"),
        "/tools/skills/install_git" => skill("skill_install_git", "install_git"),
        "/tools/skills/install_store" => skill("skill_install_store", "install_store"),
        "/tools/skills/uninstall" => skill("skill_uninstall", "uninstall"),
        "/tools/mcp/server_list" => mcp("mcp_server_list", "server_list"),
        "/tools/mcp/server_connect" => mcp("mcp_server_connect", "server_connect"),
        "/tools/mcp/server_upsert" => mcp("mcp_server_upsert", "server_upsert"),
        "/tools/mcp/server_remove" => mcp("mcp_server_remove", "server_remove"),
        "/tools/mcp/server_disconnect" => mcp("mcp_server_disconnect", "server_disconnect"),
        "/tools/mcp/server_reload" => mcp("mcp_server_reload", "server_reload"),
        "/tools/mcp/tool_discover" => mcp("mcp_tool_discover", "tool_discover"),
        "/tools/mcp/tool_inspect" => mcp("mcp_tool_inspect", "tool_inspect"),
        "/tools/mcp/tool_execute" => mcp("mcp_tool_execute", "tool_execute"),
        _ => return None,
    })
}

pub(super) fn validate_runtime_target_availability(
    manifest: &ToolManifest,
    target: &RuntimeToolTarget,
    dispatcher: Option<&Arc<HostCapabilityDispatcher>>,
) -> Result<(), NativeToolFailure> {
    if matches!(
        target,
        RuntimeToolTarget::HostAdapter { .. } | RuntimeToolTarget::SoftwareCapability { .. }
    ) && dispatcher.is_none()
    {
        return Err(NativeToolFailure::new(
            "host_unavailable",
            format!(
                "Tool-FS target {} requires the Lyra host capability bridge, but it is not available.",
                manifest.path
            ),
            "Retry when the desktop host bridge is available, or choose a local-only Tool-FS target.",
        )
        .with_detail(json!({
            "toolPath": manifest.path,
            "domain": manifest.domain,
            "operation": manifest.operation,
            "permissionPolicy": manifest.permission_policy,
        })));
    }
    Ok(())
}

pub(super) fn validate_workspace_scope_for_manifest(
    session_id: &str,
    manifest: &ToolManifest,
) -> Result<(), NativeToolFailure> {
    if !manifest_requires_workspace_scope(manifest) {
        return Ok(());
    }
    session_workspace_root(session_id)
        .map(|_| ())
        .map_err(|failure| {
            let mut detail = json!({
                "toolPath": manifest.path,
                "domain": manifest.domain,
                "operation": manifest.operation,
                "permissionPolicy": manifest.permission_policy,
                "scope": "workspace",
            });
            if let Some(cause) = failure.detail {
                detail["cause"] = cause;
            }
            NativeToolFailure {
                code: failure.code,
                message: failure.message,
                recommended_next_action: failure.recommended_next_action,
                detail: Some(detail),
                cancel_reason: None,
            }
        })
}

pub(super) fn manifest_requires_workspace_scope(manifest: &ToolManifest) -> bool {
    matches!(manifest.domain.as_str(), "filesystem" | "code" | "git")
}

pub(super) fn validate_runtime_turn_for_operation(
    session_id: &str,
    turn_id: &str,
) -> Result<(), NativeToolFailure> {
    let state = state().lock().map_err(|_| {
        NativeToolFailure::new(
            "runtime_state_unavailable",
            "agent runtime state lock failed",
            "Retry the tool call.",
        )
    })?;
    let session = state.sessions.get(session_id).ok_or_else(|| {
        NativeToolFailure::new(
            "session_not_found",
            format!("Agent session was not found: {session_id}"),
            "Create or restore an Agent session before running tools.",
        )
    })?;
    let active_turn = session
        .snapshot
        .get("activeTurnId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let status = session
        .snapshot
        .get("turnStatus")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if status != "running" || active_turn != turn_id {
        return Err(NativeToolFailure::new(
            "runtime_turn_not_active",
            format!("Runtime turn {turn_id} is not active for session {session_id}."),
            "Stop this tool call and wait for the active Agent turn.",
        )
        .with_detail(json!({
            "turnStatus": status,
            "activeTurnId": active_turn,
        })));
    }
    let turn_exists = session.runtime_turns.iter().any(|turn| {
        turn.get("runtimeTurnId").and_then(Value::as_str) == Some(turn_id)
            && turn.get("sessionId").and_then(Value::as_str) == Some(session_id)
    });
    if !turn_exists {
        return Err(NativeToolFailure::new(
            "missing_runtime_turn",
            format!("Runtime turn record was not found: {turn_id}"),
            "Retry inside a valid Agent runtime turn.",
        ));
    }
    if super::super::super::session_runtime::turn_cancellation_requested(turn_id) {
        return Err(NativeToolFailure::new(
            "operation_cancelled",
            "Tool-FS operation was cancelled before execution.",
            "Stop this tool call and wait for a new user turn.",
        ));
    }
    Ok(())
}

fn native_file_activity_path(action: &str) -> Option<&'static str> {
    match action {
        "read" => Some("/tools/filesystem/read_file"),
        "list" => Some("/tools/filesystem/list_files"),
        "glob" => Some("/tools/filesystem/glob"),
        "write" => Some("/tools/filesystem/write_file"),
        "edit" | "strict_edit" => Some("/tools/filesystem/edit_file"),
        "multiedit" => Some("/tools/filesystem/multi_edit"),
        "apply_patch" => Some("/tools/filesystem/apply_patch"),
        _ => None,
    }
}

pub(crate) fn path_for_activity(name: &str, action: &str) -> Option<String> {
    if name == "file" {
        return native_file_activity_path(action).map(str::to_string);
    }
    let registry = runtime_registry();
    let activity_domain = name;
    registry
        .manifests()
        .iter()
        .find(|manifest| {
            if manifest.domain == activity_domain && manifest.operation == action {
                return true;
            }
            if name == "lyra_lumen" && manifest.domain == "browser" && manifest.operation == action
            {
                return true;
            }
            if name == "artifact" && manifest.path == "/tools/runtime/artifact_read" {
                return true;
            }
            false
        })
        .map(|manifest| manifest.path.clone())
}
