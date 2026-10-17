use super::*;

#[test]
fn file_read_can_continue_past_the_default_byte_window_and_reports_eof() {
    let temp = tempfile::tempdir().unwrap();
    let text = (1..=12_000)
        .map(|i| format!("line-{i:05}\n"))
        .collect::<String>();
    fs::write(temp.path().join("large.txt"), text).unwrap();
    let created = LyraAgentBackend
        .call_agent_method(
            "agent.session.create",
            json!({"workingDir": temp.path().display().to_string()}),
        )
        .unwrap();
    let session_id = created["id"].as_str().unwrap();
    let turn_id = start_test_runtime_turn(session_id);
    let result = tool_file_read(
        session_id,
        &turn_id,
        "late-lines",
        &json!({
            "path": "large.txt", "startLine": 11_000, "endLine": 11_002
        }),
    )
    .unwrap();
    assert!(
        result
            .content
            .contains("line-11000\nline-11001\nline-11002")
    );
    assert_eq!(result.raw["truncated"], false);
    let error = tool_file_read(
        session_id,
        &turn_id,
        "past-eof",
        &json!({
            "path": "large.txt", "startLine": 12_001
        }),
    )
    .expect_err("an out-of-range read must not silently return empty content");
    assert_eq!(error.code, "line_out_of_range");
    let artifact = write_tool_artifact_with_kind(
        session_id,
        &turn_id,
        "large-log",
        ToolArtifactKind::Stdout,
        &fs::read_to_string(temp.path().join("large.txt")).unwrap(),
    )
    .unwrap();
    let artifact_read = tool_file_read(
        session_id,
        &turn_id,
        "late-artifact-lines",
        &json!({
            "path": artifact["path"], "startLine": 11_000, "endLine": 11_002
        }),
    )
    .unwrap();
    assert!(
        artifact_read
            .content
            .contains("line-11000\nline-11001\nline-11002")
    );
    assert_eq!(artifact_read.raw["truncated"], false);
}

#[test]
fn native_file_tools_enforce_policy_budgets_edits_and_patch_artifacts() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::create_dir_all(temp.path().join("src")).expect("create src");
    fs::write(temp.path().join("src").join("main.rs"), "alpha\nbeta\n").expect("write main");
    fs::write(temp.path().join("dupes.txt"), "same\nsame\n").expect("write dupes");
    fs::write(temp.path().join("first.txt"), "one").expect("write first");
    fs::write(temp.path().join("second.txt"), "two").expect("write second");
    fs::write(temp.path().join("delete.txt"), "remove me").expect("write delete");
    fs::write(temp.path().join("large.txt"), "x".repeat(128)).expect("write large");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "File Tool Coverage", "workingDir": temp.path().display().to_string() }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let cancellation = CancellationToken::new();
    let tool_fs_list = execute_model_tool_sync(
        &session_id,
        &turn_id,
        &None,
        &cancellation,
        tool_fs_run_call(
            "tool-list",
            "/tools/filesystem/list_files",
            json!({ "path": ".", "recursive": true }),
        ),
    );
    assert_eq!(tool_fs_list["status"].as_str(), Some("completed"));
    assert!(
        tool_fs_list["content"]
            .as_str()
            .is_some_and(|text| text.contains("src/main.rs"))
    );
    let listed =
        tool_file_list(&session_id, &json!({ "path": ".", "recursive": true })).expect("list");
    assert!(listed.content.contains("src/main.rs"));
    let missing = tool_file_read(
        &session_id,
        &turn_id,
        "tool-missing-file",
        &json!({ "path": "missing.txt" }),
    )
    .expect_err("missing file");
    assert_eq!(missing.code, "path_not_found");
    // The error must name the workspace-root anchor so a relative input that
    // resolved somewhere unexpected is diagnosable (hermes three-element form:
    // raw input + resolved path + base directory).
    assert!(
        missing.message.contains(&temp.path().display().to_string()),
        "path_not_found message must name the workspace root, got: {}",
        missing.message
    );
    assert!(
        missing.message.contains("missing.txt"),
        "path_not_found message must echo the raw input, got: {}",
        missing.message
    );
    let large = tool_file_read(
        &session_id,
        &turn_id,
        "tool-large-read",
        &json!({ "path": "large.txt", "maxBytes": 8 }),
    )
    .expect("large read");
    assert_eq!(large.raw["truncated"], true);
    assert!(large.raw["artifactRef"].is_object());
    assert_eq!(
        large
            .raw
            .pointer("/artifactRef/kind")
            .and_then(Value::as_str),
        Some("raw_data")
    );
    let outside_path = temp
        .path()
        .parent()
        .expect("temp parent")
        .join("outside-tool-test.txt");
    tool_file_write(
        &session_id,
        &turn_id,
        "tool-outside-write",
        &json!({
            "path": outside_path.display().to_string(),
            "content": "outside workspace write",
            "overwrite": true
        }),
    )
    .expect("direct file tool can write outside workspace after approval layer is bypassed");
    assert_eq!(
        fs::read_to_string(&outside_path).expect("read outside file"),
        "outside workspace write"
    );
    let _ = fs::remove_file(&outside_path);
    // write_file no longer caps content size: large generated files (HTML, CSS,
    // bundles) must write in a single call rather than being forced through
    // apply_patch. Exercise a >1MB payload to confirm there is no hidden limit.
    let large_native_content = "x".repeat(1_200_000);
    tool_file_write(
        &session_id,
        &turn_id,
        "tool-large-native-write",
        &json!({
            "path": "large-native-write.txt",
            "content": large_native_content,
            "overwrite": true
        }),
    )
    .expect("large write_file content is written in a single call");
    assert_eq!(
        fs::read_to_string(temp.path().join("large-native-write.txt"))
            .expect("read large file")
            .len(),
        1_200_000
    );
    let nested_write = tool_file_write(
        &session_id,
        &turn_id,
        "tool-nested-write",
        &json!({
            "path": "css/components/styles.css",
            "content": "body { color: red; }\n",
            "overwrite": true
        }),
    )
    .expect("write_file creates missing parent directories");
    assert_eq!(
        nested_write
            .raw
            .pointer("/changedFiles/0/additions")
            .and_then(Value::as_u64),
        Some(1)
    );
    assert_eq!(
        nested_write
            .raw
            .pointer("/changedFiles/0/deletions")
            .and_then(Value::as_u64),
        Some(0)
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("css/components/styles.css"))
            .expect("read nested write"),
        "body { color: red; }\n"
    );
    let root_name = temp
        .path()
        .file_name()
        .expect("temp name")
        .to_string_lossy();
    tool_file_write(
        &session_id,
        &turn_id,
        "tool-duplicated-root-write",
        &json!({
            "path": format!("{root_name}/column-site/index.html"),
            "content": "<!doctype html>\n",
            "overwrite": true
        }),
    )
    .expect("write_file strips duplicated workspace root path component");
    assert_eq!(
        fs::read_to_string(temp.path().join("column-site/index.html"))
            .expect("read normalized duplicated-root write"),
        "<!doctype html>\n"
    );
    assert!(
        !temp
            .path()
            .join(root_name.as_ref())
            .join("column-site/index.html")
            .exists(),
        "duplicated workspace root folder must not be created"
    );
    let unread_edit = tool_file_edit(
        &session_id,
        &turn_id,
        "tool-unread-edit",
        &json!({ "path": "src/main.rs", "oldString": "beta", "newString": "gamma" }),
    )
    .expect_err("strict edit requires read first");
    assert_eq!(unread_edit.code, "must_read_first");
    tool_file_read(
        &session_id,
        &turn_id,
        "tool-read-before-edit",
        &json!({ "path": "src/main.rs" }),
    )
    .expect("read before edit");
    let edit = tool_file_edit(
        &session_id,
        &turn_id,
        "tool-edit",
        &json!({ "path": "src/main.rs", "oldString": "beta", "newString": "gamma" }),
    )
    .expect("edit file");
    assert!(edit.raw["diffArtifactRef"].is_object());
    assert_eq!(
        edit.raw
            .pointer("/diffArtifactRef/kind")
            .and_then(Value::as_str),
        Some("diff")
    );
    assert!(edit.raw["changedFiles"][0]["beforeRef"].is_object());
    assert_eq!(
        edit.raw
            .pointer("/changedFiles/0/beforeRef/kind")
            .and_then(Value::as_str),
        Some("snapshot")
    );
    assert!(edit.raw["changedFiles"][0]["afterRef"].is_object());
    assert!(edit.raw["changedFiles"][0]["diffRef"].is_object());
    assert!(
        fs::read_to_string(temp.path().join("src").join("main.rs"))
            .expect("read edited")
            .contains("gamma")
    );
    tool_file_read(
        &session_id,
        &turn_id,
        "tool-read-before-duplicate-edit",
        &json!({ "path": "dupes.txt" }),
    )
    .expect("read dupes before duplicate edit");
    let duplicate = tool_file_edit(
        &session_id,
        &turn_id,
        "tool-duplicate-edit",
        &json!({ "path": "dupes.txt", "oldString": "same", "newString": "once" }),
    )
    .expect_err("duplicate oldString should fail");
    assert_eq!(duplicate.code, "edit_not_unique");
    let failed_multiedit = tool_file_multiedit(
        &session_id,
        &turn_id,
        "tool-multiedit-fail",
        &json!({
            "edits": [
                { "path": "first.txt", "oldString": "one", "newString": "ONE" },
                { "path": "second.txt", "oldString": "missing", "newString": "TWO" }
            ]
        }),
    )
    .expect_err("failed staged edit");
    assert_eq!(failed_multiedit.code, "edit_not_found");
    assert_eq!(
        fs::read_to_string(temp.path().join("first.txt")).expect("first unchanged"),
        "one"
    );
    let multiedit = tool_file_multiedit(
        &session_id,
        &turn_id,
        "tool-multiedit",
        &json!({
            "edits": [
                { "path": "first.txt", "oldString": "one", "newString": "ONE" },
                { "path": "second.txt", "oldString": "two", "newString": "TWO" }
            ]
        }),
    )
    .expect("successful multiedit");
    assert_eq!(
        multiedit.raw["changedFiles"].as_array().map(Vec::len),
        Some(2)
    );
    assert!(multiedit.raw["diffArtifactRef"].is_object());
    assert_eq!(
        multiedit
            .raw
            .pointer("/diffArtifactRef/kind")
            .and_then(Value::as_str),
        Some("diff")
    );
    assert!(
        multiedit.raw["changedFiles"]
            .as_array()
            .is_some_and(|files| files.iter().all(|file| {
                file["beforeRef"].is_object()
                    && file["afterRef"].is_object()
                    && file["diffRef"].is_object()
            }))
    );
    assert_eq!(
        fs::read_to_string(temp.path().join("second.txt")).expect("read second"),
        "TWO"
    );
    tool_file_read(
        &session_id,
        &turn_id,
        "tool-read-before-patch",
        &json!({ "path": "first.txt" }),
    )
    .expect("read before patch update");
    let patch = tool_apply_patch(
        &session_id,
        &turn_id,
        "tool-patch",
        &json!({
            "operations": [
                { "op": "add", "path": "added.txt", "content": "added" },
                { "op": "update", "path": "first.txt", "oldString": "ONE", "newString": "uno" },
                { "op": "move", "path": "second.txt", "newPath": "moved.txt" },
                { "op": "delete", "path": "delete.txt" }
            ]
        }),
    )
    .expect("apply patch");
    assert!(patch.raw["diffArtifactRef"].is_object());
    assert_eq!(
        patch
            .raw
            .pointer("/diffArtifactRef/kind")
            .and_then(Value::as_str),
        Some("diff")
    );
    assert!(
        patch.raw["changedFiles"]
            .as_array()
            .is_some_and(|files| files.iter().all(|file| {
                file["beforeRef"].is_object()
                    && file["afterRef"].is_object()
                    && file["diffRef"].is_object()
            }))
    );
    assert!(temp.path().join("moved.txt").exists());
    assert!(!temp.path().join("delete.txt").exists());
}

/// Regression: a `~/...` path passed to file tools must expand to the user's
/// home directory, not be joined onto the workspace root as a literal `~`
/// component. Before the fix, `write_file("~/Documents/cursor-demos/x")`
/// silently created `<root>/~/Documents/cursor-demos/x` (a real directory
/// named `~`), the model then saw the correct path as empty, and rewrote
/// everything. Other tilde variants (`~user`, `~+`, `~-`) must be rejected.
#[test]
fn native_file_tools_expand_tilde_and_reject_variants() {
    let backend = LyraAgentBackend;
    // Home-unbound session: no workingDir, so the workspace root falls back to
    // the real home directory (mirrors the regression scenario where the user
    // ran the agent from ~ without picking a project). This keeps the test
    // independent of a synthetic tempdir-vs-home relationship.
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Tilde Regression" }),
        )
        .expect("create home-unbound session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);

    let home = dirs::home_dir().expect("home dir available in test env");
    let sentinel = format!("lyra-tilde-regression-{}.txt", Uuid::new_v4());
    let expected_path = home.join(&sentinel);
    // The home directory may already contain a literal `~` directory left over
    // from a prior buggy run (e.g. ~/Documents/cursor-demos). Record what is
    // there before the test so we can assert the write did not touch it rather
    // than asserting it never exists at all.
    let literal_tilde_dir = home.join("~");
    let literal_tilde_existed_before = literal_tilde_dir.exists();
    let literal_tilde_entry_count_before = if literal_tilde_existed_before {
        fs::read_dir(&literal_tilde_dir)
            .map(|entries| entries.count())
            .unwrap_or(0)
    } else {
        0
    };

    let written = tool_file_write(
        &session_id,
        &turn_id,
        "tool-tilde-write",
        &json!({
            "path": format!("~/{}", sentinel),
            "content": "tilde expansion regression",
            "overwrite": true,
        }),
    )
    .expect("home-relative write should succeed and expand to home");
    assert_eq!(
        written.raw["changedFiles"][0]["path"].as_str(),
        Some(sentinel.as_str()),
        "relative path should be the home-relative suffix, not a literal ~/... path"
    );
    assert!(
        expected_path.exists(),
        "file should land at <home>/{} after tilde expansion, not under a literal ~ dir",
        sentinel
    );
    assert_eq!(
        fs::read_to_string(&expected_path).expect("read sentinel back"),
        "tilde expansion regression",
    );
    let literal_tilde_entry_count_after = if literal_tilde_dir.exists() {
        fs::read_dir(&literal_tilde_dir)
            .map(|entries| entries.count())
            .unwrap_or(0)
    } else {
        0
    };
    assert_eq!(
        literal_tilde_entry_count_after, literal_tilde_entry_count_before,
        "the literal '~' directory entry count must not change: the write should expand ~ to \
         home, not create files under a literal ~ directory"
    );
    let _ = fs::remove_file(&expected_path);

    // A bare `~` also expands to home itself.
    let bare_result =
        tool_file_list(&session_id, &json!({ "path": "~" })).expect("bare ~ lists home");
    assert!(
        !bare_result.content.is_empty(),
        "listing '~' should list the home directory contents"
    );

    // Tilde variants other than `~` / `~/` are rejected outright.
    let rejected = tool_file_write(
        &session_id,
        &turn_id,
        "tool-tilde-variant",
        &json!({
            "path": "~root/should-not-exist.txt",
            "content": "rejected",
            "overwrite": true,
        }),
    )
    .expect_err("~user variant must be rejected");
    assert_eq!(
        rejected.code, "bad_request",
        "tilde variants (~user/~+/~-) must be rejected as bad_request, not silently joined"
    );
    assert!(
        !home.join("~root").join("should-not-exist.txt").exists(),
        "no file should be created under a literal ~root directory"
    );
}

#[test]
fn file_read_replaces_invalid_utf8_and_keeps_budget_cuts_on_char_boundaries() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::write(temp.path().join("CHANGELOG.md"), b"hello\n\xe4\xb8").expect("write truncated");
    fs::write(temp.path().join("wide.txt"), "中中").expect("write wide");
    fs::write(temp.path().join("binary.bin"), b"a\0b").expect("write binary");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "UTF-8 Read",
                "workingDir": temp.path().display().to_string()
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let turn_id = start_test_runtime_turn(&session_id);
    let truncated = tool_file_read(
        &session_id,
        &turn_id,
        "tool-truncated-utf8",
        &json!({ "path": "CHANGELOG.md" }),
    )
    .expect("a file ending mid-character still reads");
    assert!(truncated.content.contains("hello"));
    assert!(truncated.content.contains('\u{FFFD}'));
    let cut = tool_file_read(
        &session_id,
        &turn_id,
        "tool-char-boundary",
        &json!({ "path": "wide.txt", "maxBytes": 4 }),
    )
    .expect("budget cut");
    assert_eq!(cut.raw["truncated"], true);
    assert_eq!(cut.raw["bytesReturned"], 3);
    assert!(cut.content.contains('中'));
    assert!(!cut.content.contains('\u{FFFD}'));
    assert!(cut.content.contains("before the end of the file"));
    assert!(cut.content.matches("before the end of the file").count() >= 2);
    let binary = tool_file_read(
        &session_id,
        &turn_id,
        "tool-binary",
        &json!({ "path": "binary.bin" }),
    )
    .expect_err("nul bytes stay rejected");
    assert_eq!(binary.code, "unsupported_encoding");
}

#[test]
fn grep_accepts_a_file_path_without_enotdir() {
    let backend = LyraAgentBackend;
    let temp = tempfile::tempdir().expect("tempdir");
    fs::create_dir_all(temp.path().join("src")).expect("create src");
    fs::write(
        temp.path().join("src").join("main.rs"),
        "fn needle_token() {}\nfn other() {}\n",
    )
    .expect("write main");
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({
                "title": "Grep File Path",
                "workingDir": temp.path().display().to_string()
            }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let grepped = tool_file_grep(
        &session_id,
        &json!({ "pattern": "needle_token", "path": "src/main.rs" }),
    )
    .expect("grep a file path");
    assert!(
        grepped.content.contains("needle_token"),
        "grep over a file must search that file, not fail with ENOTDIR: {}",
        grepped.content
    );
    assert!(
        grepped.content.contains("1:") || grepped.content.contains("main.rs"),
        "file grep should include a line number or filename: {}",
        grepped.content
    );
}

#[test]
fn glob_recursive_prefix_matches_root_level_files() {
    // glob-0.3 Pattern::matches cannot match `**/` against zero directories,
    // so `**/*.rs` used to silently miss files at the workspace root.
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("root.rs"), "fn main() {}\n").unwrap();
    fs::create_dir_all(temp.path().join("src")).unwrap();
    fs::write(temp.path().join("src/lib.rs"), "").unwrap();
    let created = LyraAgentBackend
        .call_agent_method(
            "agent.session.create",
            json!({"workingDir": temp.path().display().to_string()}),
        )
        .unwrap();
    let session_id = created["id"].as_str().unwrap();
    let result = tool_file_glob(session_id, &json!({ "pattern": "**/*.rs" })).unwrap();
    let paths: Vec<String> = result.raw["matches"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|item| item["path"].as_str().map(str::to_string))
        .collect();
    assert!(
        paths.iter().any(|path| path == "root.rs"),
        "**/ must match root-level files: {paths:?}"
    );
    assert!(
        paths.iter().any(|path| path == "src/lib.rs"),
        "nested files must still match: {paths:?}"
    );
}
