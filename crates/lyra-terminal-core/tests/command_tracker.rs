use lyra_terminal_core::command_tracker::{
    prompt_snapshot, ByteRange, CommandObservationFrame, CommandStatus, CommandSubmission,
    CommandTracker, OutputSummaryInput,
};
use lyra_terminal_core::shell_integration::{
    integration_script_for_shell, ShellIntegrationEventKind, ShellIntegrationParser,
};
use serde_json::json;

fn frame(text_offset: u64, raw_offset: u64, screen_version: u64) -> CommandObservationFrame {
    CommandObservationFrame {
        output_text_offset: text_offset,
        raw_output_offset: raw_offset,
        screen_version,
        cwd: Some("/workspace".to_string()),
        prompt: Some(prompt_snapshot(
            true,
            Some("petehsu ~/Lyra %".to_string()),
            Some("/workspace".to_string()),
            Some("zsh".to_string()),
            Some("main".to_string()),
            Some(String::new()),
        )),
        actor: json!({ "kind": "agent", "agentSessionId": "agent-1" }),
        correlation: json!({
            "agentSessionId": "agent-1",
            "runtimeTurnId": "turn-1",
            "toolCallId": "tool-1"
        }),
        permission_id: Some("permission-1".to_string()),
        process_ids: vec![42],
    }
}

#[test]
fn zsh_osc_133_lifecycle_tracks_command_boundaries() {
    let mut parser = ShellIntegrationParser::new();
    let mut tracker = CommandTracker::new("session-1");
    let bytes = concat!(
        "\x1b]7;file://localhost/workspace\x07",
        "\x1b]133;A\x07",
        "\x1b]633;LyraPrompt\x07",
        "\x1b]133;B\x07",
        "\x1b]633;CommandId;command-1\x07",
        "\x1b]133;C;command=echo%20hi\x07"
    );

    for event in parser.feed(bytes.as_bytes()) {
        tracker.apply_shell_event(&event, frame(0, 0, 1));
    }

    let active = tracker.active_command().expect("active command");
    assert_eq!(active.command_id, "command-1");
    assert_eq!(active.status, CommandStatus::Running);
    assert_eq!(active.command_text.as_deref(), Some("echo hi"));
    assert_eq!(active.cwd_before.as_deref(), Some("/workspace"));
    assert_eq!(active.confidence, 1.0);
    assert!(!tracker.prompt_visible());

    for event in parser.feed(b"\x1b]133;D;0\x07\x1b]133;A\x07") {
        tracker.apply_shell_event(&event, frame(3, 4, 2));
    }

    let completed = tracker
        .latest_command("command-1")
        .expect("completed command");
    assert_eq!(completed.status, CommandStatus::Completed);
    assert_eq!(completed.exit_code, Some(0));
    assert_eq!(completed.output_text_range, ByteRange { start: 0, end: 3 });
    assert_eq!(completed.raw_output_range, ByteRange { start: 0, end: 4 });
    assert_eq!(completed.screen_version_range.end, 2);
    assert!(tracker.prompt_visible());
}

#[test]
fn bash_osc_133_lifecycle_supports_st_terminator() {
    let mut parser = ShellIntegrationParser::new();
    let events = parser.feed(b"\x1b]133;C;command=npm%20test\x1b\\\x1b]133;D;1\x1b\\");
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].kind, ShellIntegrationEventKind::CommandStart);
    assert_eq!(events[0].command.as_deref(), Some("npm test"));
    assert_eq!(events[1].kind, ShellIntegrationEventKind::CommandEnd);
    assert_eq!(events[1].exit_code, Some(1));
}

#[test]
fn fish_lifecycle_uses_lyra_command_markers() {
    let mut parser = ShellIntegrationParser::new();
    let events = parser.feed(
        concat!(
            "\x1b]633;CommandStart;commandId=fish-1;command=cargo%20test\x07",
            "\x1b]633;CommandEnd;commandId=fish-1;exitCode=0\x07"
        )
        .as_bytes(),
    );
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].command_id.as_deref(), Some("fish-1"));
    assert_eq!(events[0].command.as_deref(), Some("cargo test"));
    assert_eq!(events[1].exit_code, Some(0));
}

#[test]
fn cwd_updates_after_cd_are_parsed_from_osc7() {
    let mut parser = ShellIntegrationParser::new();
    let events = parser.feed(b"\x1b]7;file://localhost/Users/pete/Lyra%20Project\x07");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].kind, ShellIntegrationEventKind::CwdChanged);
    assert_eq!(events[0].cwd.as_deref(), Some("/Users/pete/Lyra Project"));
}

#[test]
fn prompt_shaped_osc7_is_not_a_directory() {
    let mut parser = ShellIntegrationParser::new();
    let poisoned = parser.feed(b"\x1b]7;#/home/xu-yuanhao/Documents%\x07");
    assert!(poisoned.is_empty());
    let events = parser.feed(b"\x1b]7;file://localhost/home/xu-yuanhao/Documents\x07");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].cwd.as_deref(), Some("/home/xu-yuanhao/Documents"));
    let marker = parser.feed(b"\x1b]633;Cwd;#/home/xu-yuanhao/Documents%\x07");
    assert!(marker.is_empty());
    let absolute = parser.feed(b"\x1b]633;Cwd;/tmp/lyra\x07");
    assert_eq!(absolute[0].cwd.as_deref(), Some("/tmp/lyra"));
    let prompt_suffix = parser.feed(b"\x1b]7;file://localhost/home/xu-yuanhao/Documents/Lyra%\x07");
    assert!(prompt_suffix.is_empty());
    let prompt_cwd = parser.feed(b"\x1b]633;Cwd;/home/xu-yuanhao/Documents/Lyra%\x07");
    assert!(prompt_cwd.is_empty());
    let encoded = parser.feed(b"\x1b]7;file://localhost/home/xu-yuanhao/Lyra%20Project\x07");
    assert_eq!(
        encoded[0].cwd.as_deref(),
        Some("/home/xu-yuanhao/Lyra Project")
    );
}

#[test]
fn command_mode_session_completes_with_exit_code() {
    let mut tracker = CommandTracker::new("session-command-mode");
    let command_id = tracker.submit_command(CommandSubmission {
        command_id: Some("command-mode-1".to_string()),
        command_text: Some("cargo test".to_string()),
        frame: frame(10, 20, 1),
        status: CommandStatus::Running,
        confidence: 0.9,
        boundary_source: "command_mode_spawn".to_string(),
    });

    tracker.complete_command(lyra_terminal_core::command_tracker::CommandCompletion {
        command_id: Some(command_id.clone()),
        exit_code: Some(7),
        signal: None,
        frame: frame(18, 31, 3),
        confidence: 0.9,
        boundary_source: "process_exit".to_string(),
    });

    let failed = tracker.latest_command(&command_id).expect("failed command");
    assert_eq!(failed.status, CommandStatus::Failed);
    assert_eq!(failed.exit_code, Some(7));
    assert_eq!(failed.output_text_range, ByteRange { start: 10, end: 18 });
    assert_eq!(failed.raw_output_range, ByteRange { start: 20, end: 31 });
}

#[test]
fn output_byte_ranges_and_summary_are_exact() {
    let mut tracker = CommandTracker::new("session-output");
    tracker.submit_command(CommandSubmission {
        command_id: Some("command-output-1".to_string()),
        command_text: Some("echo hi".to_string()),
        frame: frame(5, 9, 2),
        status: CommandStatus::Running,
        confidence: 1.0,
        boundary_source: "osc_133_command_start".to_string(),
    });
    tracker.complete_command(lyra_terminal_core::command_tracker::CommandCompletion {
        command_id: Some("command-output-1".to_string()),
        exit_code: Some(0),
        signal: None,
        frame: frame(11, 16, 4),
        confidence: 1.0,
        boundary_source: "osc_133_command_end".to_string(),
    });

    let summary = tracker.summarize_output(OutputSummaryInput {
        command_id: "command-output-1".to_string(),
        output: "first\nlast\n".to_string(),
        error_lines: vec!["warning".to_string(), "error: boom".to_string()],
        output_text_range: ByteRange { start: 5, end: 11 },
        raw_output_range: ByteRange { start: 9, end: 16 },
    });

    assert_eq!(summary.status, CommandStatus::Completed);
    assert_eq!(summary.output_text_range, ByteRange { start: 5, end: 11 });
    assert_eq!(summary.raw_output_range, ByteRange { start: 9, end: 16 });
    assert_eq!(summary.first_output_preview.as_deref(), Some("first"));
    assert_eq!(summary.last_output_preview.as_deref(), Some("last"));
    assert_eq!(summary.last_error_lines, vec!["warning", "error: boom"]);
}

#[test]
fn fallback_heuristic_records_low_confidence_boundaries() {
    let mut tracker = CommandTracker::new("session-fallback");
    let command_id = tracker
        .record_input_journal("npm test", true, frame(0, 0, 1))
        .expect("tentative command");
    assert_eq!(
        tracker.latest_command(&command_id).expect("pending").status,
        CommandStatus::Pending
    );
    assert!(
        tracker
            .latest_command(&command_id)
            .expect("pending")
            .confidence
            < 1.0
    );

    tracker.infer_started_from_output(frame(0, 0, 2));
    tracker.infer_completed_from_prompt(frame(12, 13, 3));
    let completed = tracker.latest_command(&command_id).expect("completed");
    assert_eq!(completed.status, CommandStatus::Unknown);
    assert_eq!(completed.boundary_source, "prompt_reappearance_heuristic");
    assert!(completed.confidence < 1.0);
}

#[test]
fn ctrl_c_records_signal_and_command_cancellation() {
    let mut tracker = CommandTracker::new("session-cancel");
    let command_id = tracker.submit_command(CommandSubmission {
        command_id: Some("command-cancel-1".to_string()),
        command_text: Some("sleep 100".to_string()),
        frame: frame(0, 0, 1),
        status: CommandStatus::Running,
        confidence: 1.0,
        boundary_source: "osc_133_command_start".to_string(),
    });

    tracker.cancel_active("SIGINT", frame(0, 0, 2));
    let cancelled = tracker.latest_command(&command_id).expect("cancelled");
    assert_eq!(cancelled.status, CommandStatus::Cancelled);
    assert_eq!(cancelled.signal.as_deref(), Some("SIGINT"));
}

#[test]
fn shell_integration_assets_are_available_for_supported_shells() {
    for shell in [
        "/bin/zsh",
        "/bin/bash",
        "/usr/bin/fish",
        "pwsh.exe",
        "powershell.exe",
    ] {
        let script = integration_script_for_shell(shell).expect("integration script");
        assert!(script.contains("133;A"));
        assert!(script.contains("633;LyraPrompt"));
    }
    let zsh = integration_script_for_shell("/bin/zsh").expect("zsh script");
    assert!(!zsh.contains("local status="));
    let powershell = integration_script_for_shell("pwsh.exe").expect("powershell script");
    assert!(powershell.contains("Set-PSReadLineKeyHandler"));
    assert!(powershell.contains("__lyra_emit_command_start"));
}
