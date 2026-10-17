use super::*;
use std::path::Component;

mod grep_fallback;
mod read;
mod read_state;

pub(crate) use read::{tool_artifact_read, tool_file_read};

const MAX_ARTIFACT_READ_BYTES: u64 = 64 * 1024 * 1024;

pub(crate) async fn execute_filesystem_tool_adapter(
    session_id: &str,
    turn_id: &str,
    cancellation: &CancellationToken,
    runtime: ToolExecutionRuntime,
    tool_call_id: &str,
    tool_name: &str,
    display_name: &str,
    action: &str,
    arguments: Value,
    started_at: &str,
) -> Value {
    execute_native_tool_adapter_with_runtime(
        session_id,
        turn_id,
        cancellation,
        tool_call_id,
        tool_name,
        display_name,
        action,
        arguments,
        started_at,
        None,
        runtime,
        true,
    )
    .await
}

#[derive(Clone, Debug)]
pub(crate) struct LyraArtifactPath {
    pub(crate) absolute: PathBuf,
    pub(crate) artifact_id: String,
    pub(crate) kind: String,
    pub(crate) media_type: String,
}

pub(crate) fn tool_file_list(session_id: &str, input: &Value) -> NativeToolResult {
    let path = value_string(input, "path").unwrap_or_else(|| ".".to_string());
    let workspace_path = resolve_workspace_path(session_id, &path, false)?;
    let metadata = fs::metadata(&workspace_path.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read directory metadata: {error}"),
            "Retry with a readable directory path.",
        )
    })?;
    if !metadata.is_dir() {
        return Err(NativeToolFailure::new(
            "not_a_directory",
            format!("path is not a directory: {}", workspace_path.relative),
            "Use read_file for a regular text file, or retry with a directory path.",
        )
        .with_detail(json!({
            "path": workspace_path.relative,
            "receivedKind": if metadata.is_file() { "file" } else { "other" },
            "expectedKind": "directory",
            "suggestedTool": "read_file",
            "suggestedSchemaPath": "/provider/tools/read_file",
        })));
    }
    let include_hidden = value_bool(input, "includeHidden", false);
    let recursive = value_bool(input, "recursive", false);
    let depth = value_usize(input, "depth", if recursive { 4 } else { 1 }, 16);
    let limit = value_usize(input, "limit", DEFAULT_LIST_LIMIT, 1000);
    let mut entries = Vec::new();
    collect_directory_entries(
        &workspace_path.root,
        &workspace_path.absolute,
        include_hidden,
        if recursive { depth } else { 1 },
        limit,
        &mut entries,
    )?;
    let truncated = entries.len() >= limit;
    let content = entries
        .iter()
        .map(|entry| {
            let kind = entry.get("kind").and_then(Value::as_str).unwrap_or("entry");
            let path = entry.get("path").and_then(Value::as_str).unwrap_or("");
            format!("{kind}\t{path}")
        })
        .collect::<Vec<_>>()
        .join("\n");
    Ok(NativeToolSuccess {
        content: if content.is_empty() {
            "Directory is empty.".to_string()
        } else {
            content
        },
        raw: json!({
            "path": workspace_path.relative,
            "entries": entries,
            "truncated": truncated,
            "limit": limit,
        }),
        recommended_next_action: truncated.then_some(
            "Narrow the directory path or increase depth in a follow-up call.".to_string(),
        ),
    })
}

pub(crate) fn collect_directory_entries(
    workspace_root: &Path,
    dir: &Path,
    include_hidden: bool,
    remaining_depth: usize,
    limit: usize,
    entries: &mut Vec<Value>,
) -> Result<(), NativeToolFailure> {
    if entries.len() >= limit || remaining_depth == 0 {
        return Ok(());
    }
    let mut children = fs::read_dir(dir)
        .map_err(|error| {
            NativeToolFailure::new(
                "read_failed",
                format!("failed to list directory {}: {error}", dir.display()),
                "Retry with a readable directory path.",
            )
        })?
        .flatten()
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.path());
    for entry in children {
        if entries.len() >= limit {
            break;
        }
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !include_hidden && file_name.starts_with('.') {
            continue;
        }
        let metadata = entry.metadata().ok();
        let kind = if metadata.as_ref().is_some_and(|metadata| metadata.is_dir()) {
            "directory"
        } else if metadata.as_ref().is_some_and(|metadata| metadata.is_file()) {
            "file"
        } else {
            "other"
        };
        let relative = path
            .strip_prefix(workspace_root)
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path.display().to_string());
        entries.push(json!({
            "path": relative,
            "kind": kind,
            "bytes": metadata.as_ref().map(|metadata| metadata.len()),
        }));
        if kind == "directory" {
            collect_directory_entries(
                workspace_root,
                &path,
                include_hidden,
                remaining_depth.saturating_sub(1),
                limit,
                entries,
            )?;
        }
    }
    Ok(())
}

pub(crate) fn tool_file_glob(session_id: &str, input: &Value) -> NativeToolResult {
    let pattern = required_value_string(input, "pattern")?;
    let root = value_string(input, "root").unwrap_or_else(|| ".".to_string());
    let workspace_path = resolve_workspace_path(session_id, &root, false)?;
    let compiled = Pattern::new(&pattern).map_err(|error| {
        NativeToolFailure::new(
            "bad_glob",
            format!("invalid glob pattern: {error}"),
            "Retry with a valid glob pattern such as **/*.rs.",
        )
    })?;
    let include_hidden = value_bool(input, "includeHidden", false);
    let limit = value_usize(input, "limit", DEFAULT_LIST_LIMIT, 2000);
    // glob-0.3 quirk: `**/` cannot match zero directories in Pattern::matches
    // (the empty match still has to consume the literal `/`), so `**/*.rs`
    // silently misses root-level files. Retry with the `**/` prefix stripped;
    // this also fixes `**/dir/**`-style patterns against their own subtree.
    let bare_glob = pattern.strip_prefix("**/").and_then(|bare| {
        if bare == pattern {
            None
        } else {
            Pattern::new(bare).ok()
        }
    });
    let mut files = Vec::new();
    collect_workspace_files(
        &workspace_path.root,
        &workspace_path.absolute,
        include_hidden,
        MAX_SEARCH_FILES,
        &mut files,
    )?;
    let mut matches = Vec::new();
    for path in files {
        if matches.len() >= limit {
            break;
        }
        let relative = path
            .strip_prefix(&workspace_path.root)
            .map(|path| path.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| path.display().to_string());
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("");
        if compiled.matches(&relative)
            || bare_glob
                .as_ref()
                .is_some_and(|bare| bare.matches(&relative))
            || (!pattern.contains('/') && compiled.matches(file_name))
        {
            matches.push(json!({ "path": relative }));
        }
    }
    Ok(NativeToolSuccess {
        content: matches
            .iter()
            .filter_map(|item| item.get("path").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n"),
        raw: json!({
            "pattern": pattern,
            "root": workspace_path.relative,
            "matches": matches,
            "truncated": matches.len() >= limit,
        }),
        recommended_next_action: None,
    })
}

pub(crate) fn tool_file_grep(session_id: &str, input: &Value) -> NativeToolResult {
    let pattern = required_value_string(input, "pattern")?;
    let root = value_string(input, "path").unwrap_or_else(|| ".".to_string());
    let workspace_path = resolve_workspace_path(session_id, &root, false)?;
    let glob = value_string(input, "glob");
    let case_insensitive = value_bool(input, "caseInsensitive", false);
    let context_lines = value_usize(input, "contextLines", 0, 10);
    let max_results = value_usize(input, "maxResults", 200, 2000);
    let metadata = fs::metadata(&workspace_path.absolute).map_err(|error| {
        NativeToolFailure::new(
            "grep_failed",
            format!(
                "failed to read grep path {}: {error}",
                workspace_path.relative
            ),
            "Retry with an existing file or directory inside the workspace.",
        )
    })?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err(NativeToolFailure::new(
            "grep_failed",
            format!(
                "grep path is not a file or directory: {}",
                workspace_path.relative
            ),
            "Retry with a regular file or directory.",
        ));
    }

    // Claude/Hermes: `path` is rg's PATH argument (file or directory), never cwd.
    // Codex: non-interactive rg with no PATH may read stdin; cwd stays the workspace root.
    let mut cmd = std::process::Command::new("rg");
    cmd.arg("--line-number")
        .arg("--no-heading")
        .arg("--color=never")
        .arg("-H")
        .arg("-m")
        .arg(max_results.to_string())
        .current_dir(&workspace_path.root)
        .stdin(std::process::Stdio::null());

    if case_insensitive {
        cmd.arg("-i");
    }
    if context_lines > 0 {
        cmd.arg("-C").arg(context_lines.to_string());
    }
    if let Some(ref g) = glob {
        cmd.arg("-g").arg(g);
    }
    cmd.arg("--").arg(&pattern).arg(&workspace_path.relative);

    let output = match cmd.output() {
        Ok(output) => output,
        // Machines without a standalone ripgrep install (common on Windows)
        // still need working grep; fall back to the bounded internal scanner.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return grep_fallback::fallback_file_grep(
                &workspace_path.absolute,
                &workspace_path.relative,
                &pattern,
                glob.as_deref(),
                case_insensitive,
                max_results,
            );
        }
        Err(error) => {
            return Err(NativeToolFailure::new(
                "grep_failed",
                format!("failed to run rg: {error}"),
                "Ensure ripgrep (rg) is installed and in PATH.",
            ));
        }
    };

    // ponytail: rg exit code 1 = no matches (not an error). Only treat code != 0 && != 1 as failure.
    if !output.status.success() && !output.status.code().is_some_and(|c| c == 1) {
        return Err(NativeToolFailure::new(
            "grep_failed",
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
            "Check the regex pattern and try again.",
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let lines: Vec<&str> = stdout.lines().collect();
    let truncated = lines.len() >= max_results;
    let display: &[&str] = if truncated {
        &lines[..max_results]
    } else {
        &lines
    };

    Ok(NativeToolSuccess {
        content: if display.is_empty() {
            "No matches found.".to_string()
        } else {
            display.join("\n")
        },
        raw: json!({
            "pattern": pattern,
            "path": workspace_path.relative,
            "matches": display.len(),
            "truncated": truncated,
        }),
        recommended_next_action: truncated
            .then_some("Narrow the pattern or path to reduce results.".to_string()),
    })
}

pub(crate) fn collect_workspace_files(
    workspace_root: &Path,
    dir: &Path,
    include_hidden: bool,
    max_files: usize,
    files: &mut Vec<PathBuf>,
) -> Result<(), NativeToolFailure> {
    if files.len() >= max_files {
        return Ok(());
    }
    let mut children = fs::read_dir(dir)
        .map_err(|error| {
            NativeToolFailure::new(
                "read_failed",
                format!("failed to walk directory {}: {error}", dir.display()),
                "Retry with a readable workspace path.",
            )
        })?
        .flatten()
        .collect::<Vec<_>>();
    children.sort_by_key(|entry| entry.path());
    for entry in children {
        if files.len() >= max_files {
            break;
        }
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if !include_hidden && file_name.starts_with('.') {
            continue;
        }
        if !include_hidden && matches!(file_name.as_str(), "target" | "node_modules" | ".git") {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) => metadata,
            Err(_) => continue,
        };
        if metadata.is_dir() {
            collect_workspace_files(workspace_root, &path, include_hidden, max_files, files)?;
        } else if metadata.is_file() {
            files.push(path);
        }
    }
    Ok(())
}

pub(crate) fn tool_file_write(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let path = required_value_string(input, "path")?;
    let content = input
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "content is required",
                "Retry with the content field set to the full file contents.",
            )
        })?
        .to_string();
    let overwrite = value_bool(input, "overwrite", true);
    let workspace_path = resolve_workspace_path(session_id, &path, true)?;
    reject_if_running_worker_owns_path(session_id, &workspace_path.relative)?;
    if workspace_path.absolute.exists() && !overwrite {
        return Err(NativeToolFailure::new(
            "file_exists",
            format!(
                "file already exists and overwrite=false: {}",
                workspace_path.relative
            ),
            "Set overwrite=true on write_file, or use edit_file. write_file is a provider tool, not /tools/filesystem/write_file.",
        ));
    }
    let before_exists = workspace_path.absolute.exists();
    let old = fs::read_to_string(&workspace_path.absolute).unwrap_or_default();
    if let Some(parent) = workspace_path.absolute.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeToolFailure::new(
                "write_failed",
                format!("failed to create parent directory: {error}"),
                "Retry after creating a writable parent directory.",
            )
        })?;
    }
    let preview_diff = diff_text(&workspace_path.relative, &old, &content);
    emit_running_mutation_diff(
        session_id,
        turn_id,
        tool_call_id,
        "file",
        "write",
        input,
        &workspace_path.relative,
        &preview_diff,
    );
    fs::write(&workspace_path.absolute, &content).map_err(|error| {
        NativeToolFailure::new(
            "write_failed",
            format!("failed to write file: {error}"),
            "Retry with a writable workspace path.",
        )
    })?;
    let diff = diff_text(&workspace_path.relative, &old, &content);
    let (additions, deletions) = diff_line_stats(&diff);
    let diff_artifact_ref = write_diff_artifact(session_id, turn_id, tool_call_id, &diff);
    let before_ref = write_file_snapshot_artifact(
        session_id,
        turn_id,
        tool_call_id,
        &workspace_path.relative,
        "before",
        if before_exists { &old } else { "" },
    );
    let after_ref = write_file_snapshot_artifact(
        session_id,
        turn_id,
        tool_call_id,
        &workspace_path.relative,
        "after",
        &content,
    );
    Ok(attach_lsp_errors(
        session_id,
        NativeToolSuccess {
            content: format!("Wrote {}\n{}", workspace_path.relative, diff),
            raw: json!({
                "changedFiles": [{
                    "path": workspace_path.relative,
                    "operation": if before_exists { "write" } else { "add" },
                    "bytes": content.len(),
                    "additions": additions,
                    "deletions": deletions,
                    "beforeExists": before_exists,
                    "afterExists": true,
                    "beforeRef": before_ref,
                    "afterRef": after_ref,
                    "diffRef": diff_artifact_ref,
                }],
                "diff": diff,
                "diffArtifactRef": diff_artifact_ref,
                // Render as a colored diff edit card (icon + path + +/- stats), not a
                // raw text blob. The activity layer lifts these hints to the top level.
                "activityKind": "edit",
                "rendererHint": "edit",
            }),
            recommended_next_action: Some(
                "Run the relevant validation command for the changed file.".to_string(),
            ),
        },
        &[LspTouchedFile {
            absolute: workspace_path.absolute.to_string_lossy().into_owned(),
            relative: workspace_path.relative.clone(),
            content: content.clone(),
        }],
    ))
}

pub(crate) fn tool_file_edit(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    tool_file_strict_edit(session_id, turn_id, tool_call_id, input)
}

pub(crate) fn tool_file_strict_edit(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let path = required_value_string(input, "path")?;
    let old_string = required_value_string(input, "oldString")?;
    let new_string = input
        .get("newString")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "newString is required",
                "Retry with the replacement string.",
            )
        })?
        .to_string();
    let replace_all = value_bool(input, "replaceAll", false);
    let workspace_path = resolve_workspace_path(session_id, &path, false)?;
    reject_if_running_worker_owns_path(session_id, &workspace_path.relative)?;
    let old_bytes = fs::read(&workspace_path.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read file before edit: {error}"),
            "Retry with a readable UTF-8 workspace file.",
        )
    })?;
    if old_bytes.contains(&0) {
        return Err(NativeToolFailure::new(
            "encoding_unsupported",
            "strict_edit only supports text files",
            "Use a text source file or a binary-aware tool.",
        ));
    }
    let metadata = fs::metadata(&workspace_path.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read file metadata before edit: {error}"),
            "Retry with a readable workspace file.",
        )
    })?;
    read_state::validate_file_read_state(
        session_id,
        &workspace_path.relative,
        &workspace_path.absolute,
        &old_bytes,
        metadata.len(),
        read_state::metadata_mtime_ms(&metadata),
        value_string(input, "expectedReadVersion").as_deref(),
    )?;
    let old = String::from_utf8(old_bytes).map_err(|error| {
        NativeToolFailure::new(
            "encoding_unsupported",
            format!("file is not valid UTF-8: {error}"),
            "Retry with a UTF-8 text file.",
        )
    })?;
    let updated = apply_fuzzy_replacement(&old, &old_string, &new_string, replace_all)?;
    let preview_diff = diff_text(&workspace_path.relative, &old, &updated);
    emit_running_mutation_diff(
        session_id,
        turn_id,
        tool_call_id,
        "file",
        "strict_edit",
        input,
        &workspace_path.relative,
        &preview_diff,
    );
    fs::write(&workspace_path.absolute, &updated).map_err(|error| {
        NativeToolFailure::new(
            "write_failed",
            format!("failed to write edited file: {error}"),
            "Retry with a writable workspace file.",
        )
    })?;
    let diff = preview_diff;
    let diff_artifact_ref = write_diff_artifact(session_id, turn_id, tool_call_id, &diff);
    let before_ref = write_file_snapshot_artifact(
        session_id,
        turn_id,
        tool_call_id,
        &workspace_path.relative,
        "before",
        &old,
    );
    let after_ref = write_file_snapshot_artifact(
        session_id,
        turn_id,
        tool_call_id,
        &workspace_path.relative,
        "after",
        &updated,
    );
    let (additions, deletions) = diff_line_stats(&diff);
    Ok(attach_lsp_errors(
        session_id,
        NativeToolSuccess {
            content: format!("Strict edited {}\n{}", workspace_path.relative, diff),
            raw: json!({
                "changedFiles": [{
                    "path": workspace_path.relative,
                    "operation": "strict_edit",
                    "additions": additions,
                    "deletions": deletions,
                    "beforeExists": true,
                    "afterExists": true,
                    "beforeRef": before_ref,
                    "afterRef": after_ref,
                    "diffRef": diff_artifact_ref,
                }],
                "diff": diff,
                "diffArtifactRef": diff_artifact_ref,
                "activityKind": "edit",
                "rendererHint": "edit",
            }),
            recommended_next_action: Some(
                "Review git_diff and run the relevant validation command.".to_string(),
            ),
        },
        &[LspTouchedFile {
            absolute: workspace_path.absolute.to_string_lossy().into_owned(),
            relative: workspace_path.relative.clone(),
            content: updated.clone(),
        }],
    ))
}

pub(crate) fn apply_exact_replacement(
    original: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<String, NativeToolFailure> {
    if old_string.is_empty() {
        return Err(NativeToolFailure::new(
            "bad_request",
            "oldString must not be empty",
            "Retry with a non-empty exact oldString.",
        ));
    }
    let count = original.matches(old_string).count();
    if count == 0 {
        return Err(NativeToolFailure::new(
            "edit_not_found",
            "oldString was not found in the target file",
            "Read the current file contents and retry with an exact oldString.",
        ));
    }
    if count > 1 && !replace_all {
        return Err(NativeToolFailure::new(
            "edit_not_unique",
            format!("oldString matched {count} times"),
            "Use a more specific oldString or set replaceAll=true.",
        ));
    }
    Ok(if replace_all {
        original.replace(old_string, new_string)
    } else {
        original.replacen(old_string, new_string, 1)
    })
}

/// Exact replacement first; on `edit_not_found`, fall back to a whitespace-
/// tolerant line-based match. A fuzzy hit keeps the file's indentation: the
/// replacement is re-anchored onto the matched block (Hermes) and a first line
/// that omitted its indent does not shift the lines after it (Zed).
///
/// Safety: the fuzzy pass NEVER silently picks one of several candidates — more
/// than one whitespace-insensitive match without `replaceAll` is reported as
/// `edit_not_unique`, exactly like the exact path. Only whitespace is tolerated;
/// no token-level or similarity fuzzing, so it cannot drift to the wrong code.
pub(crate) fn apply_fuzzy_replacement(
    original: &str,
    old_string: &str,
    new_string: &str,
    replace_all: bool,
) -> Result<String, NativeToolFailure> {
    match apply_exact_replacement(original, old_string, new_string, replace_all) {
        Ok(updated) => return Ok(updated),
        // Only an outright miss is eligible for the fuzzy fallback. Empty input
        // and genuine ambiguity (edit_not_unique) must surface unchanged.
        Err(failure) if failure.code == "edit_not_found" => {}
        Err(failure) => return Err(failure),
    }

    let original_lines: Vec<&str> = original.split('\n').collect();
    let old_lines: Vec<&str> = old_string.split('\n').collect();
    let old_trimmed: Vec<&str> = old_lines.iter().map(|line| line.trim()).collect();
    let window = old_trimmed.len();
    if window == 0 || old_trimmed.iter().all(|line| line.is_empty()) {
        return Err(NativeToolFailure::new(
            "edit_not_found",
            "oldString was not found in the target file",
            "Read the current file contents and retry with an exact oldString.",
        ));
    }

    let mut match_starts = Vec::new();
    if window <= original_lines.len() {
        for start in 0..=(original_lines.len() - window) {
            if (0..window)
                .all(|offset| original_lines[start + offset].trim() == old_trimmed[offset])
            {
                match_starts.push(start);
            }
        }
    }
    if match_starts.is_empty() {
        return Err(NativeToolFailure::new(
            "edit_not_found",
            "oldString was not found in the target file (even ignoring whitespace)",
            "Read the current file contents and retry with an exact oldString.",
        ));
    }
    if match_starts.len() > 1 && !replace_all {
        return Err(NativeToolFailure::new(
            "edit_not_unique",
            format!(
                "oldString matched {} times ignoring whitespace",
                match_starts.len()
            ),
            "Use a more specific oldString or set replaceAll=true.",
        ));
    }

    let mut result_lines: Vec<String> =
        original_lines.iter().map(|line| line.to_string()).collect();
    let targets: Vec<usize> = if replace_all {
        match_starts.clone()
    } else {
        vec![match_starts[0]]
    };
    // Splice from the bottom up so earlier indices stay valid. Each region is
    // reindented against the file text it replaces, not against a shared delta.
    for &start in targets.iter().rev() {
        let file_region = result_lines[start..start + window].join("\n");
        let adjusted = reindent_replacement(&file_region, old_string, new_string);
        let new_lines: Vec<String> = adjusted.split('\n').map(str::to_string).collect();
        result_lines.splice(start..start + window, new_lines);
    }
    Ok(result_lines.join("\n"))
}

fn leading_whitespace(line: &str) -> &str {
    let end = line
        .char_indices()
        .find(|(_, character)| *character != ' ' && *character != '\t')
        .map(|(index, _)| index)
        .unwrap_or(line.len());
    &line[..end]
}

fn first_meaningful<'a>(lines: &[&'a str]) -> Option<&'a str> {
    lines.iter().copied().find(|line| !line.trim().is_empty())
}

fn reindent_replacement(file_region: &str, old_string: &str, new_string: &str) -> String {
    if new_string.is_empty() {
        return String::new();
    }
    let file_lines: Vec<&str> = file_region.split('\n').collect();
    let old_lines: Vec<&str> = old_string.split('\n').collect();
    let old_indent = first_meaningful(&old_lines)
        .map(leading_whitespace)
        .unwrap_or("");
    let file_indent = first_meaningful(&file_lines)
        .map(leading_whitespace)
        .unwrap_or("");
    if old_indent == file_indent {
        return new_string.to_string();
    }
    if old_indent.is_empty() {
        return reindent_when_first_line_omitted_indent(&file_lines, &old_lines, new_string);
    }
    new_string
        .split('\n')
        .enumerate()
        .map(|(index, line)| {
            reindent_line(
                file_lines.get(index).copied(),
                old_indent,
                file_indent,
                line,
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn reindent_line(
    file_line: Option<&str>,
    old_indent: &str,
    file_indent: &str,
    line: &str,
) -> String {
    if line.trim().is_empty() {
        return line.to_string();
    }
    if let Some(file_line) = file_line.filter(|file_line| !file_line.trim().is_empty()) {
        if leading_whitespace(line) == leading_whitespace(file_line)
            || file_line.trim() == line.trim()
        {
            return if file_line.trim() == line.trim() {
                file_line.to_string()
            } else {
                line.to_string()
            };
        }
    }
    if leading_whitespace(line).starts_with(old_indent) {
        format!("{file_indent}{}", &line[old_indent.len()..])
    } else {
        format!("{file_indent}{}", line.trim_start_matches([' ', '\t']))
    }
}

/// Zed: when only the first old line dropped its indent, the delta from that
/// line must not be applied to the following lines. Later lines use their own
/// shared delta, or stay put when they disagree.
fn reindent_when_first_line_omitted_indent(
    file_lines: &[&str],
    old_lines: &[&str],
    new_string: &str,
) -> String {
    let rest_delta = consistent_rest_space_delta(file_lines, old_lines);
    let file_indent = first_meaningful(file_lines)
        .map(leading_whitespace)
        .unwrap_or("");
    let mut saw_content = false;
    let mut out = Vec::new();
    for (index, line) in new_string.split('\n').enumerate() {
        if line.trim().is_empty() {
            out.push(line.to_string());
            continue;
        }
        if let Some(file_line) = file_lines
            .get(index)
            .copied()
            .filter(|file_line| !file_line.trim().is_empty())
        {
            if file_line.trim() == line.trim() {
                out.push(file_line.to_string());
                saw_content = true;
                continue;
            }
            if leading_whitespace(line) == leading_whitespace(file_line) {
                out.push(line.to_string());
                saw_content = true;
                continue;
            }
        }
        if !saw_content && leading_whitespace(line).is_empty() {
            out.push(format!(
                "{file_indent}{}",
                line.trim_start_matches([' ', '\t'])
            ));
            saw_content = true;
            continue;
        }
        saw_content = true;
        match rest_delta {
            Some(delta) => out.push(apply_space_delta(line, delta)),
            None => out.push(line.to_string()),
        }
    }
    out.join("\n")
}

fn consistent_rest_space_delta(file_lines: &[&str], old_lines: &[&str]) -> Option<i32> {
    let mut rest = None;
    let mut skipped_first = false;
    let count = file_lines.len().min(old_lines.len());
    for index in 0..count {
        let file_line = file_lines[index];
        let old_line = old_lines[index];
        if file_line.trim().is_empty() || old_line.trim().is_empty() {
            continue;
        }
        if !skipped_first {
            skipped_first = true;
            continue;
        }
        let file_indent = leading_whitespace(file_line);
        let old_indent = leading_whitespace(old_line);
        if file_indent.contains('\t') || old_indent.contains('\t') {
            return None;
        }
        let delta = file_indent.len() as i32 - old_indent.len() as i32;
        match rest {
            None => rest = Some(delta),
            Some(existing) if existing == delta => {}
            Some(_) => return None,
        }
    }
    rest
}

fn apply_space_delta(line: &str, delta: i32) -> String {
    let indent = leading_whitespace(line);
    if indent.contains('\t') {
        return line.to_string();
    }
    let new_len = (indent.len() as i32 + delta).max(0) as usize;
    format!(
        "{}{}",
        " ".repeat(new_len),
        line.trim_start_matches([' ', '\t'])
    )
}

pub(crate) fn tool_file_multiedit(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let edits = input
        .get("edits")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "edits array is required",
                "Retry with edits containing oldString and newString entries.",
            )
        })?;
    let default_path = value_string(input, "path");
    let mut staged: HashMap<PathBuf, (String, String, String)> = HashMap::new();
    for edit in edits {
        let path = value_string(edit, "path")
            .or_else(|| default_path.clone())
            .ok_or_else(|| {
                NativeToolFailure::new(
                    "bad_request",
                    "each edit needs path or top-level path",
                    "Retry with a path for every edit or a top-level path.",
                )
            })?;
        let old_string = required_value_string(edit, "oldString")?;
        let new_string = edit
            .get("newString")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                NativeToolFailure::new(
                    "bad_request",
                    "newString is required for every edit",
                    "Retry with all edit replacement strings.",
                )
            })?
            .to_string();
        let replace_all = value_bool(edit, "replaceAll", false);
        let workspace_path = resolve_workspace_path(session_id, &path, false)?;
        reject_if_running_worker_owns_path(session_id, &workspace_path.relative)?;
        let entry = staged
            .entry(workspace_path.absolute.clone())
            .or_insert_with(|| {
                let old = fs::read_to_string(&workspace_path.absolute).unwrap_or_default();
                (workspace_path.relative.clone(), old.clone(), old)
            });
        entry.2 = apply_fuzzy_replacement(&entry.2, &old_string, &new_string, replace_all)?;
    }
    let mut diffs = Vec::new();
    let mut changed_files = Vec::new();
    for (relative, old, updated) in staged.values() {
        diffs.push(diff_text(relative, old, updated));
    }
    if let Some((relative, _, _)) = staged.values().next() {
        emit_running_mutation_diff(
            session_id,
            turn_id,
            tool_call_id,
            "file",
            "multiedit",
            input,
            relative,
            &diffs.join("\n"),
        );
    }
    let mut lsp_files = Vec::new();
    for (path, (relative, old, updated)) in staged {
        fs::write(&path, &updated).map_err(|error| {
            NativeToolFailure::new(
                "write_failed",
                format!("failed to write edited file {relative}: {error}"),
                "Retry after checking file permissions.",
            )
        })?;
        let diff = diff_text(&relative, &old, &updated);
        let (additions, deletions) = diff_line_stats(&diff);
        diffs.push(diff.clone());
        changed_files.push(json!({
            "path": relative,
            "operation": "multiedit",
            "additions": additions,
            "deletions": deletions,
            "beforeExists": true,
            "afterExists": true,
            "beforeRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &relative, "before", &old),
            "afterRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &relative, "after", &updated),
        }));
        lsp_files.push(LspTouchedFile {
            absolute: path.to_string_lossy().into_owned(),
            relative,
            content: updated,
        });
    }
    let diff = diffs.join("\n");
    let diff_artifact_ref = write_diff_artifact(session_id, turn_id, tool_call_id, &diff);
    attach_diff_ref_to_changed_files(&mut changed_files, &diff_artifact_ref);
    Ok(attach_lsp_errors(
        session_id,
        NativeToolSuccess {
            content: format!("Applied {} staged edits.\n{}", changed_files.len(), diff),
            raw: json!({
                "changedFiles": changed_files,
                "diff": diff,
                "diffArtifactRef": diff_artifact_ref,
                "activityKind": "edit",
                "rendererHint": "edit",
            }),
            recommended_next_action: Some(
                "Review the diff and run the relevant validation command.".to_string(),
            ),
        },
        &lsp_files,
    ))
}

pub(crate) fn diff_text(path: &str, old: &str, new: &str) -> String {
    let patch = diffy::create_patch(old, new).to_string();
    if patch.trim().is_empty() {
        return format!("No textual diff for {path}.");
    }
    // diffy emits its own `--- original` / `+++ modified` header lines. Drop them
    // and substitute path-based headers so the unified diff has a single, correct
    // file header instead of a doubled `--- path / +++ path / --- original /
    // +++ modified` block.
    let body = patch
        .split_inclusive('\n')
        .skip_while(|line| {
            let trimmed = line.trim_end();
            trimmed.starts_with("--- ") || trimmed.starts_with("+++ ")
        })
        .collect::<String>();
    format!("--- {path}\n+++ {path}\n{body}")
}

pub(crate) fn diff_line_stats(diff: &str) -> (usize, usize) {
    diff.lines()
        .filter(|line| !line.starts_with("+++") && !line.starts_with("---"))
        .fold((0, 0), |(additions, deletions), line| {
            if line.starts_with('+') {
                (additions + 1, deletions)
            } else if line.starts_with('-') {
                (additions, deletions + 1)
            } else {
                (additions, deletions)
            }
        })
}

pub(crate) fn path_qualifies_for_lyra_artifact_access(
    raw_path: &str,
) -> Result<bool, NativeToolFailure> {
    let Some(path) = normalize_lyra_artifact_path_input(raw_path) else {
        return Ok(false);
    };
    let candidate = PathBuf::from(path);
    if !candidate.is_absolute() {
        return Ok(false);
    }
    let allowed_roots = lyra_artifact_roots()?;
    if allowed_roots.is_empty() {
        return Ok(false);
    }
    let absolute = if candidate.exists() {
        candidate.canonicalize().map_err(|error| {
            NativeToolFailure::new(
                "path_unavailable",
                format!("failed to canonicalize Lyra artifact path: {error}"),
                "Retry with a readable Lyra artifact path.",
            )
        })?
    } else {
        candidate
    };
    Ok(allowed_roots
        .iter()
        .any(|(root, _)| absolute.starts_with(root)))
}

pub(crate) fn resolve_lyra_artifact_path(
    raw_path: &str,
) -> Result<Option<LyraArtifactPath>, NativeToolFailure> {
    let Some(path) = normalize_lyra_artifact_path_input(raw_path) else {
        return Ok(None);
    };
    let candidate = PathBuf::from(&path);
    if !candidate.is_absolute() {
        return Ok(None);
    }
    let allowed_roots = lyra_artifact_roots()?;
    if allowed_roots.is_empty() {
        return Ok(None);
    }
    if !candidate.exists() {
        let allowed = allowed_roots
            .iter()
            .any(|(root, _)| candidate.starts_with(root));
        if allowed {
            return Err(NativeToolFailure::new(
                "path_not_found",
                format!("Lyra artifact path does not exist: {}", candidate.display()),
                "Retry with an existing artifact path from the latest tool output.",
            ));
        }
        return Ok(None);
    }
    let absolute = candidate.canonicalize().map_err(|error| {
        NativeToolFailure::new(
            "path_unavailable",
            format!("failed to canonicalize Lyra artifact path: {error}"),
            "Retry with a readable Lyra artifact path.",
        )
    })?;
    if !absolute.is_file() {
        return Err(NativeToolFailure::new(
            "not_a_file",
            format!("Lyra artifact path is not a file: {}", absolute.display()),
            "Retry with a file artifact path.",
        ));
    }
    let Some((_, kind)) = allowed_roots
        .iter()
        .find(|(root, _)| absolute.starts_with(root))
    else {
        return Ok(None);
    };
    Ok(Some(LyraArtifactPath {
        artifact_id: artifact_id_from_path(&absolute),
        media_type: media_type_for_artifact_path(&absolute),
        kind: (*kind).to_string(),
        absolute,
    }))
}

fn normalize_lyra_artifact_path_input(raw_path: &str) -> Option<String> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("lyra-file://") {
        return Url::parse(trimmed).ok().and_then(|url| {
            url.query_pairs()
                .find(|(key, _)| key == "path")
                .map(|(_, value)| value.into_owned())
        });
    }
    Some(trimmed.to_string())
}

fn lyra_artifact_roots() -> Result<Vec<(PathBuf, &'static str)>, NativeToolFailure> {
    let root = state()
        .lock()
        .map_err(|_| {
            NativeToolFailure::new(
                "runtime_state_unavailable",
                "agent runtime state lock failed",
                "Retry the tool call.",
            )
        })?
        .root
        .clone();
    let agent_root = root.parent().map(Path::to_path_buf);
    let mut candidates = vec![(root.join("artifacts"), "tool_output")];
    if let Some(agent_root) = agent_root {
        let modules_root = agent_root.parent().map(Path::to_path_buf);
        candidates.extend([
            (agent_root.join("lumen-evidence"), "lumen_evidence"),
            (agent_root.join("message-images"), "message_image"),
        ]);
        if let Some(modules_root) = modules_root {
            candidates.extend([
                (
                    modules_root.join("terminal").join("terminal-memory"),
                    "terminal_memory",
                ),
                (
                    modules_root
                        .join("terminal")
                        .join("terminal-memory")
                        .join("sessions"),
                    "terminal_memory",
                ),
            ]);
        }
    }
    Ok(candidates
        .into_iter()
        .filter_map(|(path, kind)| {
            path.exists()
                .then(|| path.canonicalize().ok().map(|root| (root, kind)))
                .flatten()
        })
        .collect())
}

fn find_lyra_artifact_by_id(id: &str) -> Result<LyraArtifactPath, NativeToolFailure> {
    let id = id.trim();
    if id.starts_with("dropped-image-") {
        return Err(NativeToolFailure::new(
            "bad_request",
            format!("{id} is a session inline image attachment id, not a Lyra artifact id"),
            "Use the source path on <lyra-image-attach> from the user message, or answer from the vision input already in context.",
        ));
    }
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.contains('\0') {
        return Err(NativeToolFailure::new(
            "bad_request",
            "artifact id is invalid",
            "Pass the exact imageArtifact.id returned by a Lyra tool.",
        ));
    }
    let mut stack = lyra_artifact_roots()?
        .into_iter()
        .map(|(root, _)| root)
        .collect::<Vec<_>>();
    let mut visited = 0_usize;
    while let Some(dir) = stack.pop() {
        visited = visited.saturating_add(1);
        if visited > 20_000 {
            break;
        }
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
                continue;
            };
            let stem = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or(name);
            if stem == id || stem.starts_with(&format!("{id}-")) || name.starts_with(id) {
                let path = path.display().to_string();
                if let Some(artifact) = resolve_lyra_artifact_path(&path)? {
                    return Ok(artifact);
                }
            }
        }
    }
    Err(NativeToolFailure::new(
        "artifact_not_found",
        format!("Lyra artifact not found: {id}"),
        "Use an artifact id/path from the latest Lyra tool output.",
    ))
}

fn artifact_id_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("lyra-artifact")
        .to_string()
}

fn media_type_for_artifact_path(path: &Path) -> String {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        "txt" | "log" | "md" => "text/plain; charset=utf-8",
        "json" => "application/json",
        "jsonl" | "ndjson" => "application/x-ndjson",
        _ => "application/octet-stream",
    }
    .to_string()
}

pub(crate) fn write_diff_artifact(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    diff: &str,
) -> Option<Value> {
    if diff.trim().is_empty() {
        return None;
    }
    write_tool_artifact_with_kind(
        session_id,
        turn_id,
        &format!("{tool_call_id}-diff"),
        ToolArtifactKind::Diff,
        diff,
    )
}

fn write_file_snapshot_artifact(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    path: &str,
    phase: &str,
    content: &str,
) -> Option<Value> {
    write_tool_artifact_with_kind(
        session_id,
        turn_id,
        &format!("{tool_call_id}-{phase}-{path}"),
        ToolArtifactKind::Snapshot,
        content,
    )
}

fn attach_diff_ref_to_changed_files(changed_files: &mut [Value], diff_ref: &Option<Value>) {
    for file in changed_files {
        if let Some(object) = file.as_object_mut() {
            object
                .entry("diffRef".to_string())
                .or_insert_with(|| diff_ref.clone().unwrap_or(Value::Null));
        }
    }
}

#[derive(Clone)]
enum StagedPatchOperation {
    Write {
        absolute: PathBuf,
        relative: String,
        before: Option<String>,
        after: String,
        operation: &'static str,
    },
    Delete {
        absolute: PathBuf,
        relative: String,
        before: String,
    },
    Move {
        from_absolute: PathBuf,
        from_relative: String,
        to_absolute: PathBuf,
        to_relative: String,
        content: String,
    },
}

#[derive(Clone, Debug)]
enum CodexPatchOperation {
    Add {
        path: String,
        content: String,
    },
    Update {
        path: String,
        new_path: Option<String>,
        hunks: Vec<Vec<CodexPatchLine>>,
    },
    Delete {
        path: String,
    },
}

#[derive(Clone, Debug)]
enum CodexPatchLine {
    Context(String),
    Remove(String),
    Add(String),
}

pub(crate) fn tool_apply_patch(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let staged = if let Some(patch) = input.get("patch").and_then(Value::as_str) {
        stage_codex_patch(session_id, patch)?
    } else {
        stage_structured_patch(session_id, input)?
    };
    execute_staged_patch(session_id, turn_id, tool_call_id, input, staged)
}

fn stage_structured_patch(
    session_id: &str,
    input: &Value,
) -> Result<Vec<StagedPatchOperation>, NativeToolFailure> {
    let operations = input
        .get("operations")
        .and_then(Value::as_array)
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_request",
                "patch string or operations array is required",
                "Retry with a Codex patch string using the provider-visible apply_patch tool.",
            )
        })?;
    let mut staged = Vec::new();
    let mut touched = HashSet::new();
    for operation in operations {
        let op = required_value_string(operation, "op")?;
        let path = required_value_string(operation, "path")?;
        match op.as_str() {
            "add" => {
                let workspace_path = resolve_new_patch_path(session_id, &path)?;
                if workspace_path.absolute.exists() {
                    return Err(NativeToolFailure::new(
                        "file_exists",
                        format!("cannot add existing file: {}", workspace_path.relative),
                        "Use update for existing files.",
                    ));
                }
                let content = operation
                    .get("content")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                if !touched.insert(workspace_path.absolute.clone()) {
                    return Err(NativeToolFailure::new(
                        "conflicting_patch",
                        format!(
                            "patch touches the same path more than once: {}",
                            workspace_path.relative
                        ),
                        "Combine edits for the same path into one update operation.",
                    ));
                }
                staged.push(StagedPatchOperation::Write {
                    absolute: workspace_path.absolute,
                    relative: workspace_path.relative,
                    before: None,
                    after: content,
                    operation: "add",
                });
            }
            "update" => {
                let workspace_path = resolve_existing_patch_path(session_id, &path)?;
                let old_bytes = fs::read(&workspace_path.absolute).map_err(|error| {
                    NativeToolFailure::new(
                        "read_failed",
                        format!("failed to read file before patch: {error}"),
                        "Retry with a readable UTF-8 workspace file.",
                    )
                })?;
                if old_bytes.contains(&0) {
                    return Err(NativeToolFailure::new(
                        "encoding_unsupported",
                        "apply_patch update only supports text files",
                        "Use a text source file or a binary-aware tool.",
                    ));
                }
                let metadata = fs::metadata(&workspace_path.absolute).map_err(|error| {
                    NativeToolFailure::new(
                        "read_failed",
                        format!("failed to read file metadata before patch: {error}"),
                        "Retry with a readable workspace file.",
                    )
                })?;
                if operation.get("oldString").is_some() {
                    read_state::validate_file_read_state(
                        session_id,
                        &workspace_path.relative,
                        &workspace_path.absolute,
                        &old_bytes,
                        metadata.len(),
                        read_state::metadata_mtime_ms(&metadata),
                        operation.get("expectedReadVersion").and_then(Value::as_str),
                    )?;
                }
                let old = String::from_utf8(old_bytes).map_err(|error| {
                    NativeToolFailure::new(
                        "encoding_unsupported",
                        format!("file is not valid UTF-8: {error}"),
                        "Retry with a UTF-8 text file.",
                    )
                })?;
                let updated = if operation.get("oldString").is_some() {
                    let old_string = required_value_string(operation, "oldString")?;
                    let new_string = operation
                        .get("newString")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                            NativeToolFailure::new(
                                "bad_request",
                                "newString is required when oldString is provided",
                                "Retry with oldString and newString.",
                            )
                        })?;
                    apply_fuzzy_replacement(
                        &old,
                        &old_string,
                        new_string,
                        value_bool(operation, "replaceAll", false),
                    )?
                } else {
                    operation
                        .get("content")
                        .and_then(Value::as_str)
                        .ok_or_else(|| {
                            NativeToolFailure::new(
                                "bad_request",
                                "update requires content or oldString/newString",
                                "Retry with a full content replacement or exact edit strings.",
                            )
                        })?
                        .to_string()
                };
                if !touched.insert(workspace_path.absolute.clone()) {
                    return Err(NativeToolFailure::new(
                        "conflicting_patch",
                        format!(
                            "patch touches the same path more than once: {}",
                            workspace_path.relative
                        ),
                        "Combine edits for the same path into one update operation.",
                    ));
                }
                staged.push(StagedPatchOperation::Write {
                    absolute: workspace_path.absolute,
                    relative: workspace_path.relative,
                    before: Some(old),
                    after: updated,
                    operation: "update",
                });
            }
            "delete" => {
                let workspace_path = resolve_existing_patch_path(session_id, &path)?;
                let old = fs::read_to_string(&workspace_path.absolute).map_err(|error| {
                    NativeToolFailure::new(
                        "read_failed",
                        format!("failed to read file before delete: {error}"),
                        "Retry with a readable UTF-8 workspace file.",
                    )
                })?;
                if !touched.insert(workspace_path.absolute.clone()) {
                    return Err(NativeToolFailure::new(
                        "conflicting_patch",
                        format!(
                            "patch touches the same path more than once: {}",
                            workspace_path.relative
                        ),
                        "Combine edits for the same path into one operation.",
                    ));
                }
                staged.push(StagedPatchOperation::Delete {
                    absolute: workspace_path.absolute,
                    relative: workspace_path.relative,
                    before: old,
                });
            }
            "move" => {
                let workspace_path = resolve_existing_patch_path(session_id, &path)?;
                let new_path = required_value_string(operation, "newPath")?;
                let next_workspace_path = resolve_new_patch_path(session_id, &new_path)?;
                if next_workspace_path.absolute.exists() {
                    return Err(NativeToolFailure::new(
                        "file_exists",
                        format!(
                            "move target already exists: {}",
                            next_workspace_path.relative
                        ),
                        "Choose a new target path or update the existing file explicitly.",
                    ));
                }
                let old = fs::read_to_string(&workspace_path.absolute).map_err(|error| {
                    NativeToolFailure::new(
                        "read_failed",
                        format!("failed to read file before move: {error}"),
                        "Retry with a readable UTF-8 workspace file.",
                    )
                })?;
                if !touched.insert(workspace_path.absolute.clone())
                    || !touched.insert(next_workspace_path.absolute.clone())
                {
                    return Err(NativeToolFailure::new(
                        "conflicting_patch",
                        "patch move conflicts with another operation",
                        "Use one operation per source/target path.",
                    ));
                }
                staged.push(StagedPatchOperation::Move {
                    from_absolute: workspace_path.absolute,
                    from_relative: workspace_path.relative,
                    to_absolute: next_workspace_path.absolute,
                    to_relative: next_workspace_path.relative,
                    content: old,
                });
            }
            _ => {
                return Err(NativeToolFailure::new(
                    "bad_request",
                    format!("unsupported patch operation: {op}"),
                    "Use add, update, delete, or move.",
                ));
            }
        }
    }
    Ok(staged)
}

fn stage_codex_patch(
    session_id: &str,
    patch: &str,
) -> Result<Vec<StagedPatchOperation>, NativeToolFailure> {
    let operations = parse_codex_patch(patch)?;
    let mut staged = Vec::new();
    let mut touched = HashSet::new();
    for operation in operations {
        match operation {
            CodexPatchOperation::Add { path, content } => {
                let workspace_path = resolve_new_patch_path(session_id, &path)?;
                if workspace_path.absolute.exists() {
                    return Err(NativeToolFailure::new(
                        "file_exists",
                        format!("cannot add existing file: {}", workspace_path.relative),
                        "Use an update hunk for existing files.",
                    ));
                }
                touch_patch_path(
                    &mut touched,
                    &workspace_path.absolute,
                    &workspace_path.relative,
                )?;
                staged.push(StagedPatchOperation::Write {
                    absolute: workspace_path.absolute,
                    relative: workspace_path.relative,
                    before: None,
                    after: content,
                    operation: "add",
                });
            }
            CodexPatchOperation::Delete { path } => {
                let workspace_path = resolve_existing_patch_path(session_id, &path)?;
                let old = fs::read_to_string(&workspace_path.absolute).map_err(|error| {
                    NativeToolFailure::new(
                        "read_failed",
                        format!("failed to read file before delete: {error}"),
                        "Retry with a readable UTF-8 workspace file.",
                    )
                })?;
                touch_patch_path(
                    &mut touched,
                    &workspace_path.absolute,
                    &workspace_path.relative,
                )?;
                staged.push(StagedPatchOperation::Delete {
                    absolute: workspace_path.absolute,
                    relative: workspace_path.relative,
                    before: old,
                });
            }
            CodexPatchOperation::Update {
                path,
                new_path,
                hunks,
            } => {
                let workspace_path = resolve_existing_patch_path(session_id, &path)?;
                let old_bytes = fs::read(&workspace_path.absolute).map_err(|error| {
                    NativeToolFailure::new(
                        "read_failed",
                        format!("failed to read file before patch: {error}"),
                        "Retry with a readable UTF-8 workspace file.",
                    )
                })?;
                if old_bytes.contains(&0) {
                    return Err(NativeToolFailure::new(
                        "encoding_unsupported",
                        "apply_patch update only supports text files",
                        "Use a text source file or a binary-aware tool.",
                    ));
                }
                let old = String::from_utf8(old_bytes).map_err(|error| {
                    NativeToolFailure::new(
                        "encoding_unsupported",
                        format!("file is not valid UTF-8: {error}"),
                        "Retry with a UTF-8 text file.",
                    )
                })?;
                let updated = if hunks.is_empty() {
                    old.clone()
                } else {
                    apply_codex_update_hunks(&old, &hunks)?
                };
                if let Some(new_path) = new_path {
                    let next_workspace_path = resolve_new_patch_path(session_id, &new_path)?;
                    if next_workspace_path.absolute.exists() {
                        return Err(NativeToolFailure::new(
                            "file_exists",
                            format!(
                                "move target already exists: {}",
                                next_workspace_path.relative
                            ),
                            "Choose a new target path or update the existing file explicitly.",
                        ));
                    }
                    touch_patch_path(
                        &mut touched,
                        &workspace_path.absolute,
                        &workspace_path.relative,
                    )?;
                    touch_patch_path(
                        &mut touched,
                        &next_workspace_path.absolute,
                        &next_workspace_path.relative,
                    )?;
                    if updated == old {
                        staged.push(StagedPatchOperation::Move {
                            from_absolute: workspace_path.absolute,
                            from_relative: workspace_path.relative,
                            to_absolute: next_workspace_path.absolute,
                            to_relative: next_workspace_path.relative,
                            content: old,
                        });
                    } else {
                        staged.push(StagedPatchOperation::Delete {
                            absolute: workspace_path.absolute,
                            relative: workspace_path.relative,
                            before: old,
                        });
                        staged.push(StagedPatchOperation::Write {
                            absolute: next_workspace_path.absolute,
                            relative: next_workspace_path.relative,
                            before: None,
                            after: updated,
                            operation: "move_update",
                        });
                    }
                } else {
                    if hunks.is_empty() {
                        return Err(NativeToolFailure::new(
                            "empty_patch",
                            format!("update hunk for {} has no changes", workspace_path.relative),
                            "Retry with at least one context, removal, or addition line.",
                        ));
                    }
                    touch_patch_path(
                        &mut touched,
                        &workspace_path.absolute,
                        &workspace_path.relative,
                    )?;
                    staged.push(StagedPatchOperation::Write {
                        absolute: workspace_path.absolute,
                        relative: workspace_path.relative,
                        before: Some(old),
                        after: updated,
                        operation: "update",
                    });
                }
            }
        }
    }
    if staged.is_empty() {
        return Err(NativeToolFailure::new(
            "empty_patch",
            "patch did not contain any file operations",
            "Retry with at least one Add File, Update File, Delete File, or Move to operation.",
        ));
    }
    Ok(staged)
}

fn execute_staged_patch(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
    staged: Vec<StagedPatchOperation>,
) -> NativeToolResult {
    let mut changed_files = Vec::new();
    let mut diffs = Vec::new();
    let mut applied = Vec::new();
    let mut preview_diffs = Vec::new();
    let mut preview_path = None::<String>;
    for operation in &staged {
        match operation {
            StagedPatchOperation::Write {
                relative,
                before,
                after,
                ..
            } => {
                preview_diffs.push(diff_text(relative, before.as_deref().unwrap_or(""), after));
                if preview_path.is_none() {
                    preview_path = Some(relative.clone());
                }
            }
            StagedPatchOperation::Delete {
                relative, before, ..
            } => {
                preview_diffs.push(diff_text(relative, before, ""));
                if preview_path.is_none() {
                    preview_path = Some(relative.clone());
                }
            }
            StagedPatchOperation::Move { from_relative, .. } => {
                if preview_path.is_none() {
                    preview_path = Some(from_relative.clone());
                }
            }
        }
    }
    if let Some(relative) = preview_path.as_deref()
        && !preview_diffs.is_empty()
    {
        emit_running_mutation_diff(
            session_id,
            turn_id,
            tool_call_id,
            "file",
            "apply_patch",
            input,
            relative,
            &preview_diffs.join("\n"),
        );
    }
    for operation in &staged {
        if let Err(error) = apply_staged_patch_operation(operation) {
            rollback_staged_patch_operations(&applied);
            return Err(error);
        }
        applied.push(operation.clone());
    }
    for operation in staged {
        match operation {
            StagedPatchOperation::Write {
                relative,
                before,
                after,
                operation,
                ..
            } => {
                let diff = diff_text(&relative, before.as_deref().unwrap_or(""), &after);
                let (additions, deletions) = diff_line_stats(&diff);
                diffs.push(diff);
                changed_files.push(json!({
                    "path": relative,
                    "operation": operation,
                    "additions": additions,
                    "deletions": deletions,
                    "beforeExists": before.is_some(),
                    "afterExists": true,
                    "beforeRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &relative, "before", before.as_deref().unwrap_or("")),
                    "afterRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &relative, "after", &after),
                }));
            }
            StagedPatchOperation::Delete {
                relative, before, ..
            } => {
                let diff = diff_text(&relative, &before, "");
                let (additions, deletions) = diff_line_stats(&diff);
                diffs.push(diff);
                changed_files.push(json!({
                    "path": relative,
                    "operation": "delete",
                    "additions": additions,
                    "deletions": deletions,
                    "beforeExists": true,
                    "afterExists": false,
                    "beforeRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &relative, "before", &before),
                    "afterRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &relative, "after", ""),
                }));
            }
            StagedPatchOperation::Move {
                from_relative,
                to_relative,
                content,
                ..
            } => {
                changed_files.push(json!({
                    "path": from_relative,
                    "newPath": to_relative,
                    "operation": "move",
                    "additions": 0,
                    "deletions": 0,
                    "beforeExists": true,
                    "afterExists": true,
                    "beforeRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &from_relative, "before", &content),
                    "afterRef": write_file_snapshot_artifact(session_id, turn_id, tool_call_id, &to_relative, "after", &content),
                }));
            }
        }
    }
    let diff = diffs.join("\n");
    let diff_artifact_ref = write_diff_artifact(session_id, turn_id, tool_call_id, &diff);
    attach_diff_ref_to_changed_files(&mut changed_files, &diff_artifact_ref);
    let lsp_files = changed_files
        .iter()
        .filter_map(|file| {
            let relative = file.get("path")?.as_str()?;
            if file.get("afterExists").and_then(Value::as_bool) == Some(false) {
                return None;
            }
            let workspace_path = resolve_workspace_path(session_id, relative, false).ok()?;
            let content = fs::read_to_string(&workspace_path.absolute).ok()?;
            Some(LspTouchedFile {
                absolute: workspace_path.absolute.to_string_lossy().into_owned(),
                relative: relative.to_string(),
                content,
            })
        })
        .collect::<Vec<_>>();
    Ok(attach_lsp_errors(
        session_id,
        NativeToolSuccess {
            content: format!(
                "Applied {} patch operations.\n{}",
                changed_files.len(),
                diff
            ),
            raw: json!({
                "changedFiles": changed_files,
                "diff": diff,
                "diffArtifactRef": diff_artifact_ref,
                "activityKind": "edit",
                "rendererHint": "edit",
            }),
            recommended_next_action: Some(
                "Review changed files and run the relevant validation command.".to_string(),
            ),
        },
        &lsp_files,
    ))
}

fn touch_patch_path(
    touched: &mut HashSet<PathBuf>,
    absolute: &Path,
    relative: &str,
) -> Result<(), NativeToolFailure> {
    if !touched.insert(absolute.to_path_buf()) {
        return Err(NativeToolFailure::new(
            "conflicting_patch",
            format!("patch touches the same path more than once: {relative}"),
            "Combine edits for the same path into one update operation.",
        ));
    }
    Ok(())
}

fn resolve_existing_patch_path(
    session_id: &str,
    path: &str,
) -> Result<WorkspacePath, NativeToolFailure> {
    reject_workspace_escape(resolve_workspace_path(session_id, path, false)?)
}

fn resolve_new_patch_path(
    session_id: &str,
    path: &str,
) -> Result<WorkspacePath, NativeToolFailure> {
    reject_workspace_escape(resolve_missing_ok_workspace_path(session_id, path)?)
}

fn reject_workspace_escape(path: WorkspacePath) -> Result<WorkspacePath, NativeToolFailure> {
    if path.outside_workspace {
        return Err(NativeToolFailure::new(
            "permission_denied",
            format!("patch path is outside the workspace: {}", path.relative),
            "Retry with a workspace-relative path inside the bound project.",
        ));
    }
    Ok(path)
}

pub(crate) fn resolve_missing_ok_workspace_path(
    session_id: &str,
    raw_path: &str,
) -> Result<WorkspacePath, NativeToolFailure> {
    resolve_workspace_path(session_id, raw_path, true)
}

fn parse_codex_patch(patch: &str) -> Result<Vec<CodexPatchOperation>, NativeToolFailure> {
    let normalized = patch.replace("\r\n", "\n").replace('\r', "\n");
    let lines = normalized.lines().collect::<Vec<_>>();
    let begin = lines
        .iter()
        .position(|line| line.trim() == "*** Begin Patch")
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_patch",
                "patch is missing *** Begin Patch",
                "Retry with a complete Codex patch.",
            )
        })?;
    let end = lines
        .iter()
        .rposition(|line| line.trim() == "*** End Patch")
        .ok_or_else(|| {
            NativeToolFailure::new(
                "bad_patch",
                "patch is missing *** End Patch",
                "Retry with a complete Codex patch.",
            )
        })?;
    if end <= begin {
        return Err(NativeToolFailure::new(
            "bad_patch",
            "patch end appears before patch begin",
            "Retry with a complete Codex patch.",
        ));
    }
    let mut i = begin + 1;
    let mut operations = Vec::new();
    while i < end {
        let line = lines[i];
        if line.trim().is_empty() {
            i += 1;
            continue;
        }
        if let Some(path) = line.strip_prefix("*** Add File: ") {
            i += 1;
            let mut content_lines = Vec::new();
            while i < end && !is_codex_file_header(lines[i]) {
                // Accept both the Lyra-extended form (each line prefixed with '+')
                // and the standard Codex form (bare add-file lines). Models emit
                // the bare form by default; rejecting it forced a wasted retry on
                // every new file. A line that is exactly "+" is an empty added line.
                let content = lines[i].strip_prefix('+').unwrap_or(lines[i]);
                content_lines.push(content.to_string());
                i += 1;
            }
            operations.push(CodexPatchOperation::Add {
                path: clean_codex_patch_path(path)?,
                content: codex_lines_to_text(&content_lines),
            });
            continue;
        }
        if let Some(path) = line.strip_prefix("*** Delete File: ") {
            operations.push(CodexPatchOperation::Delete {
                path: clean_codex_patch_path(path)?,
            });
            i += 1;
            continue;
        }
        if let Some(path) = line.strip_prefix("*** Update File: ") {
            i += 1;
            let mut new_path = None;
            if i < end
                && let Some(target) = lines[i].strip_prefix("*** Move to: ")
            {
                new_path = Some(clean_codex_patch_path(target)?);
                i += 1;
            }
            let mut hunks = Vec::<Vec<CodexPatchLine>>::new();
            let mut current_hunk = Vec::<CodexPatchLine>::new();
            while i < end && !is_codex_file_header(lines[i]) {
                let hunk_line = lines[i];
                if hunk_line == "@@" || hunk_line.starts_with("@@ ") {
                    if !current_hunk.is_empty() {
                        hunks.push(std::mem::take(&mut current_hunk));
                    }
                    i += 1;
                    continue;
                }
                let mut chars = hunk_line.chars();
                let Some(prefix) = chars.next() else {
                    return Err(NativeToolFailure::new(
                        "bad_patch",
                        "empty update line is invalid; use a leading space for blank context lines",
                        "Retry with update lines prefixed by space, '+', or '-'.",
                    ));
                };
                let text = chars.as_str().to_string();
                match prefix {
                    ' ' => current_hunk.push(CodexPatchLine::Context(text)),
                    '-' => current_hunk.push(CodexPatchLine::Remove(text)),
                    '+' => current_hunk.push(CodexPatchLine::Add(text)),
                    _ => {
                        return Err(NativeToolFailure::new(
                            "bad_patch",
                            format!("update line must start with space, '+', or '-': {hunk_line}"),
                            "Retry with Codex update hunk syntax.",
                        ));
                    }
                }
                i += 1;
            }
            if !current_hunk.is_empty() {
                hunks.push(current_hunk);
            }
            operations.push(CodexPatchOperation::Update {
                path: clean_codex_patch_path(path)?,
                new_path,
                hunks,
            });
            continue;
        }
        return Err(NativeToolFailure::new(
            "bad_patch",
            format!("unrecognized patch header: {line}"),
            "Retry with Add File, Update File, Delete File, or Move to headers.",
        ));
    }
    Ok(operations)
}

fn is_codex_file_header(line: &str) -> bool {
    line.starts_with("*** Add File: ")
        || line.starts_with("*** Update File: ")
        || line.starts_with("*** Delete File: ")
        || line.trim() == "*** End Patch"
}

fn clean_codex_patch_path(path: &str) -> Result<String, NativeToolFailure> {
    let path = path.trim();
    if path.is_empty() || path.contains('\0') {
        return Err(NativeToolFailure::new(
            "bad_patch",
            "patch path is empty or invalid",
            "Retry with a valid workspace-relative path.",
        ));
    }
    let path_buf = PathBuf::from(path);
    if !path_buf.is_absolute()
        && Path::new(path).components().any(|component| {
            matches!(
                component,
                Component::Prefix(_) | Component::ParentDir | Component::RootDir
            )
        })
    {
        return Err(NativeToolFailure::new(
            "bad_patch",
            format!("patch path must not contain parent directory components: {path}"),
            "Retry with a normalized workspace-relative path.",
        ));
    }
    Ok(path.to_string())
}

fn apply_codex_update_hunks(
    old: &str,
    hunks: &[Vec<CodexPatchLine>],
) -> Result<String, NativeToolFailure> {
    let mut updated = old.to_string();
    for hunk in hunks {
        let mut old_lines = Vec::new();
        let mut new_lines = Vec::new();
        for line in hunk {
            match line {
                CodexPatchLine::Context(text) => {
                    old_lines.push(text.clone());
                    new_lines.push(text.clone());
                }
                CodexPatchLine::Remove(text) => old_lines.push(text.clone()),
                CodexPatchLine::Add(text) => new_lines.push(text.clone()),
            }
        }
        let old_block = codex_lines_to_text(&old_lines);
        let new_block = codex_lines_to_text(&new_lines);
        updated = replace_codex_hunk_once(&updated, &old_block, &new_block)?;
    }
    Ok(updated)
}

fn replace_codex_hunk_once(
    current: &str,
    old_block: &str,
    new_block: &str,
) -> Result<String, NativeToolFailure> {
    if old_block.is_empty() {
        if current.is_empty() {
            return Ok(new_block.to_string());
        }
        return Err(NativeToolFailure::new(
            "patch_context_missing",
            "update hunk has no removable or context lines",
            "Retry with enough context lines to anchor the insertion.",
        ));
    }
    for (old_candidate, new_candidate) in codex_block_variants(old_block, new_block) {
        let count = current.matches(&old_candidate).count();
        if count == 1 {
            return Ok(current.replacen(&old_candidate, &new_candidate, 1));
        }
        if count > 1 {
            return Err(NativeToolFailure::new(
                "patch_context_ambiguous",
                "update hunk context matches more than once",
                "Retry with more surrounding context in the patch.",
            ));
        }
    }
    Err(NativeToolFailure::new(
        "patch_context_missing",
        "update hunk context was not found in the target file",
        "Inspect the current file with exec_command and retry with an up-to-date patch.",
    ))
}

fn codex_lines_to_text(lines: &[String]) -> String {
    if lines.is_empty() {
        String::new()
    } else {
        format!("{}\n", lines.join("\n"))
    }
}

fn codex_block_variants(old_block: &str, new_block: &str) -> Vec<(String, String)> {
    let mut variants = vec![(old_block.to_string(), new_block.to_string())];
    if let Some(old_without_newline) = old_block.strip_suffix('\n') {
        let new_without_newline = new_block.strip_suffix('\n').unwrap_or(new_block);
        variants.push((
            old_without_newline.to_string(),
            new_without_newline.to_string(),
        ));
    }
    variants
}

fn apply_staged_patch_operation(operation: &StagedPatchOperation) -> Result<(), NativeToolFailure> {
    match operation {
        StagedPatchOperation::Write {
            absolute,
            relative,
            after,
            ..
        } => {
            if let Some(parent) = absolute.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    NativeToolFailure::new(
                        "write_failed",
                        format!("failed to create parent directory for {relative}: {error}"),
                        "Retry after creating a writable parent directory.",
                    )
                })?;
            }
            fs::write(absolute, after).map_err(|error| {
                NativeToolFailure::new(
                    "write_failed",
                    format!("failed to write patch target {relative}: {error}"),
                    "Patch was rolled back; retry with writable workspace paths.",
                )
            })
        }
        StagedPatchOperation::Delete {
            absolute, relative, ..
        } => fs::remove_file(absolute).map_err(|error| {
            NativeToolFailure::new(
                "delete_failed",
                format!("failed to delete file {relative}: {error}"),
                "Patch was rolled back; retry with a writable file path.",
            )
        }),
        StagedPatchOperation::Move {
            from_absolute,
            from_relative,
            to_absolute,
            ..
        } => {
            if let Some(parent) = to_absolute.parent() {
                fs::create_dir_all(parent).map_err(|error| {
                    NativeToolFailure::new(
                        "write_failed",
                        format!("failed to create move target parent: {error}"),
                        "Patch was rolled back; retry with a writable parent directory.",
                    )
                })?;
            }
            fs::rename(from_absolute, to_absolute).map_err(|error| {
                NativeToolFailure::new(
                    "move_failed",
                    format!("failed to move file {from_relative}: {error}"),
                    "Patch was rolled back; retry with writable source and target paths.",
                )
            })
        }
    }
}

mod rollback;
use rollback::rollback_staged_patch_operations;

#[cfg(test)]
mod tests;
