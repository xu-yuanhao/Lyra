use super::*;

fn is_utf8_continuation(byte: u8) -> bool {
    byte & 0b1100_0000 == 0b1000_0000
}

/// Text returned to the model, and how many source bytes that text covers.
/// A budget cut backs up to a UTF-8 boundary. A file that itself ends inside a
/// character, or contains an invalid sequence, is decoded with U+FFFD.
fn model_text_window(bytes: &[u8], max_bytes: usize) -> (String, usize) {
    let mut end = bytes.len().min(max_bytes);
    if end < bytes.len() {
        while end > 0 && is_utf8_continuation(bytes[end]) {
            end -= 1;
        }
    }
    (String::from_utf8_lossy(&bytes[..end]).into_owned(), end)
}

fn file_read_content(path: &str, window: &FileTextWindow) -> String {
    let body = window.text.trim_end_matches('\n');
    if !window.truncated {
        return format!("{path}\n---\n{body}");
    }
    let continuation = match window.next_line {
        Some(next) => format!("Use startLine={next} to continue."),
        None => format!(
            "Line {} exceeds the byte budget and is only partially shown. Increase maxBytes or use exec_command to inspect a byte range of this line; a line offset cannot continue within this line.",
            window.start_line
        ),
    };
    let notice = format!(
        "[file truncated: showing {} bytes from line {} of {} lines. This excerpt ends before the end of the file or requested range. {continuation}]",
        window.returned_bytes, window.start_line, window.total_lines
    );
    format!("{path}\n---\n{notice}\n{body}\n{notice}")
}

struct FileTextWindow {
    text: String,
    returned_bytes: usize,
    start_line: usize,
    end_line: Option<usize>,
    total_lines: usize,
    next_line: Option<usize>,
    truncated: bool,
}

fn requested_line(input: &Value, key: &str) -> Result<Option<usize>, NativeToolFailure> {
    let Some(value) = input.get(key) else {
        return Ok(None);
    };
    let line = value
        .as_u64()
        .and_then(|line| usize::try_from(line).ok())
        .filter(|line| *line > 0);
    line.map(Some).ok_or_else(|| {
        NativeToolFailure::new(
            "invalid_line_range",
            format!("{key} must be a positive integer."),
            "Use one-based integer line numbers, or omit the line range.",
        )
    })
}

/// Locate the range in the original file before applying the output budget.
/// Prefer complete lines so the continuation offset never skips unseen bytes.
fn file_text_window(
    bytes: &[u8],
    start: Option<usize>,
    end: Option<usize>,
    max_bytes: usize,
) -> Result<FileTextWindow, NativeToolFailure> {
    let start = start.unwrap_or(1);
    if start == 0 || end.is_some_and(|end| end < start) {
        return Err(NativeToolFailure::new(
            "invalid_line_range",
            "Line numbers must satisfy 1 <= startLine <= endLine.",
            "Use one-based line numbers, or omit endLine to read to EOF.",
        ));
    }
    let mut total_lines = 0;
    let mut offset = 0;
    let mut range_start = bytes.len();
    let mut range_end = bytes.len();
    for line in bytes.split_inclusive(|byte| *byte == b'\n') {
        total_lines += 1;
        if total_lines == start {
            range_start = offset;
        }
        offset += line.len();
        if Some(total_lines) == end {
            range_end = offset;
        }
    }
    if start > total_lines && !(start == 1 && bytes.is_empty()) {
        return Err(NativeToolFailure::new(
            "line_out_of_range",
            format!("startLine {start} is beyond end of file ({total_lines} lines)."),
            "Retry with a startLine within the file's reported line count.",
        )
        .with_detail(json!({"startLine": start, "totalLines": total_lines})));
    }
    let selected = &bytes[range_start..range_end];
    let truncated = selected.len() > max_bytes;
    let mut limit = max_bytes;
    if truncated
        && let Some(newline) = selected[..max_bytes]
            .iter()
            .rposition(|byte| *byte == b'\n')
    {
        limit = newline + 1;
    }
    let (text, returned_bytes) = model_text_window(selected, limit);
    let complete = !truncated || selected.get(returned_bytes.wrapping_sub(1)) == Some(&b'\n');
    let returned_lines = selected[..returned_bytes]
        .split_inclusive(|byte| *byte == b'\n')
        .count();
    let end_line = (returned_lines > 0).then(|| start + returned_lines - 1);
    let next_line = if complete {
        end_line
            .filter(|line| *line < total_lines)
            .map(|line| line + 1)
    } else {
        None
    };
    Ok(FileTextWindow {
        text,
        returned_bytes,
        start_line: start,
        end_line,
        total_lines,
        next_line,
        truncated,
    })
}

pub(crate) fn tool_file_read(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let path = required_value_string(input, "path")?;
    if resolve_lyra_artifact_path(&path)?.is_some() {
        return tool_artifact_read(session_id, turn_id, tool_call_id, input);
    }
    let workspace_path = resolve_workspace_path(session_id, &path, false)?;
    let metadata = fs::metadata(&workspace_path.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read file metadata: {error}"),
            "Retry with a readable file path.",
        )
    })?;
    if !metadata.is_file() {
        return Err(NativeToolFailure::new(
            "not_a_file",
            format!("path is not a file: {}", workspace_path.relative),
            "Use glob with a directory root, or retry read_file with a regular text file.",
        )
        .with_detail(json!({
            "path": workspace_path.relative,
            "receivedKind": if metadata.is_dir() { "directory" } else { "other" },
            "expectedKind": "regular_text_file",
            "suggestedTool": "glob",
            "suggestedSchemaPath": "/provider/tools/glob",
        })));
    }
    if super::image_read::is_image_file(&workspace_path.absolute) {
        return super::image_read::read_image(
            session_id,
            turn_id,
            tool_call_id,
            &workspace_path.absolute,
        );
    }
    let bytes = fs::read(&workspace_path.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read file: {error}"),
            "Retry with a readable file path.",
        )
    })?;
    if bytes.contains(&0) {
        return Err(NativeToolFailure::new(
            "unsupported_encoding",
            "binary files are not inlined into model context",
            "Read supports text and PNG/JPEG/WebP/GIF images; use a format-specific tool for other binary formats.",
        ));
    }
    let requested_max = value_usize(
        input,
        "maxBytes",
        DEFAULT_FILE_READ_BYTES,
        MAX_FILE_READ_BYTES,
    );
    let start_line = requested_line(input, "startLine")?;
    let end_line = requested_line(input, "endLine")?;
    let window = file_text_window(&bytes, start_line, end_line, requested_max)?;
    let over_requested_budget = window.truncated;
    let read_version = read_state::record_file_read_state(
        session_id,
        &workspace_path.relative,
        &workspace_path.absolute,
        &bytes,
        metadata.len(),
        read_state::metadata_mtime_ms(&metadata),
        Some(window.start_line),
        window.end_line,
    )?;
    let content = file_read_content(&workspace_path.relative, &window);
    let artifact_ref = if over_requested_budget {
        write_tool_artifact_with_kind(
            session_id,
            turn_id,
            tool_call_id,
            ToolArtifactKind::RawData,
            &String::from_utf8_lossy(&bytes),
        )
    } else {
        None
    };
    warmup_lsp_file(session_id, &workspace_path.absolute, &window.text);
    Ok(NativeToolSuccess {
        content,
        raw: json!({
            "path": workspace_path.relative,
            "absolutePath": workspace_path.absolute.display().to_string(),
            "bytes": metadata.len(),
            "bytesReturned": window.returned_bytes,
            "truncated": over_requested_budget,
            "artifactRef": artifact_ref,
            "startLine": start_line,
            "endLine": end_line,
            "totalLines": window.total_lines,
            "nextLine": window.next_line,
            "readVersion": read_version,
            "contentHash": read_state::stable_text_hash(&bytes),
            "mtimeMs": read_state::metadata_mtime_ms(&metadata),
            "range": {
                "startLine": window.start_line,
                "endLine": window.end_line,
            },
        }),
        recommended_next_action: over_requested_budget.then_some(
            "Use a narrower line range or read the artifact reference if more context is needed."
                .to_string(),
        ),
    })
}

pub(crate) fn tool_artifact_read(
    session_id: &str,
    turn_id: &str,
    tool_call_id: &str,
    input: &Value,
) -> NativeToolResult {
    let artifact = if let Some(path) = value_string(input, "path") {
        resolve_lyra_artifact_path(&path)?.ok_or_else(|| {
            NativeToolFailure::new(
                "permission_denied",
                format!("path is not a readable Lyra artifact: {path}"),
                "Use artifact_read only with a Lyra artifact path, artifact id, or openTarget from tool output.",
            )
        })?
    } else if let Some(source) = value_string(input, "source") {
        resolve_lyra_artifact_path(&source)?.ok_or_else(|| {
            NativeToolFailure::new(
                "permission_denied",
                format!("source is not a readable Lyra artifact: {source}"),
                "Use artifact_read only with a Lyra artifact path, artifact id, or openTarget from tool output.",
            )
        })?
    } else if let Some(id) = value_string(input, "artifactId").or_else(|| value_string(input, "id"))
    {
        find_lyra_artifact_by_id(&id)?
    } else {
        return Err(NativeToolFailure::new(
            "bad_request",
            "artifact_read requires path, source, artifactId, or id",
            "Pass the imageArtifact.id/path/openTarget returned by Lyra Lumen or another Lyra tool.",
        ));
    };

    let metadata = fs::metadata(&artifact.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read artifact metadata: {error}"),
            "Retry with a readable Lyra artifact path.",
        )
    })?;
    if metadata.len() > MAX_ARTIFACT_READ_BYTES {
        return Err(NativeToolFailure::new(
            "artifact_size_invalid",
            format!(
                "artifact size is outside the readable range: {} bytes",
                metadata.len()
            ),
            "Open the artifact in Workbench or capture a smaller evidence artifact.",
        ));
    }
    let is_image = artifact.media_type.starts_with("image/");
    if is_image {
        return super::image_read::read_image(
            session_id,
            turn_id,
            tool_call_id,
            &artifact.absolute,
        );
    }

    let bytes = fs::read(&artifact.absolute).map_err(|error| {
        NativeToolFailure::new(
            "read_failed",
            format!("failed to read artifact: {error}"),
            "Retry with a readable Lyra artifact path.",
        )
    })?;
    if bytes.contains(&0) {
        return Err(NativeToolFailure::new(
            "unsupported_encoding",
            "binary Lyra artifact cannot be inlined as text",
            "Open it in Workbench, or use image artifacts through model vision.",
        ));
    }
    let requested_max = value_usize(
        input,
        "maxBytes",
        DEFAULT_FILE_READ_BYTES,
        MAX_FILE_READ_BYTES,
    );
    let start_line = requested_line(input, "startLine")?;
    let end_line = requested_line(input, "endLine")?;
    let window = file_text_window(&bytes, start_line, end_line, requested_max)?;
    Ok(NativeToolSuccess {
        content: file_read_content(&format!("Lyra artifact {}", artifact.artifact_id), &window),
        raw: json!({
            "kind": "lyra_artifact_read",
            "artifactId": artifact.artifact_id,
            "artifactKind": artifact.kind,
            "path": artifact.absolute.display().to_string(),
            "mediaType": artifact.media_type,
            "bytes": metadata.len(),
            "bytesReturned": window.returned_bytes,
            "truncated": window.truncated,
            "totalLines": window.total_lines,
            "nextLine": window.next_line,
            "range": {"startLine": window.start_line, "endLine": window.end_line},
        }),
        recommended_next_action: window.truncated
            .then_some("Continue with read_file on the artifact path and the reported nextLine; increase maxBytes for an oversized line.".to_string()),
    })
}

#[cfg(test)]
mod text_window_tests {
    use super::*;

    #[test]
    fn line_continuation_never_skips_the_partial_line_at_a_budget_boundary() {
        let bytes = "alpha\n中文\nomega\n".as_bytes();
        let mut start = 1;
        let mut reconstructed = String::new();
        loop {
            let window = file_text_window(bytes, Some(start), None, 10).unwrap();
            reconstructed.push_str(&window.text);
            match window.next_line {
                Some(next) => {
                    assert!(next > start);
                    start = next;
                }
                None => break,
            }
        }
        assert_eq!(reconstructed.as_bytes(), bytes);
    }

    #[test]
    fn oversized_line_has_no_misleading_line_continuation() {
        let window = file_text_window("中文\nnext\n".as_bytes(), None, None, 4).unwrap();
        assert_eq!(window.text, "中");
        assert_eq!(window.returned_bytes, 3);
        assert!(window.truncated);
        assert_eq!(window.next_line, None);
        assert!(file_read_content("wide.txt", &window).contains("only partially shown"));
    }

    #[test]
    fn empty_files_crlf_and_invalid_ranges_have_explicit_semantics() {
        for invalid in [json!(-1), json!(0), json!(1.5), json!("2")] {
            assert!(requested_line(&json!({"startLine": invalid}), "startLine").is_err());
        }
        let empty = file_text_window(b"", None, None, 10).unwrap();
        assert_eq!(empty.text, "");
        assert!(!empty.truncated);
        assert!(file_text_window(b"", Some(2), None, 10).is_err());
        let crlf = file_text_window(b"one\r\ntwo\r\n", Some(2), Some(2), 10).unwrap();
        assert_eq!(crlf.text, "two\r\n");
        assert_eq!(crlf.returned_bytes, 5);
        assert_eq!(crlf.total_lines, 2);
        assert!(file_text_window(b"one\ntwo\n", Some(0), None, 10).is_err());
        assert!(file_text_window(b"one\ntwo\n", Some(2), Some(1), 10).is_err());
        assert!(file_text_window(b"one\ntwo\n", Some(3), None, 10).is_err());
    }
}
