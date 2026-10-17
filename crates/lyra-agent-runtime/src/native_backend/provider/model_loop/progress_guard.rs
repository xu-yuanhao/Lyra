use super::*;

#[derive(Debug, Default)]
pub(crate) struct ModelLoopProgressGuard {
    last_fingerprint: Option<String>,
    repeated_occurrences: usize,
    pub(super) browser_loop_detector: browser_loop_detector::BrowserLoopDetector,
    pub(super) browser_automation_paused: bool,
    pub(super) browser_tools_used_this_turn: usize,
    pub(super) tool_loop_detector: tool_loop_detector::ToolLoopDetector,
    browser_input_seen: bool,
    rounds_since_browser_input: usize,
}

#[derive(Debug)]
pub(crate) enum ModelLoopProgressAction {
    Continue,
    Warn {
        reason: &'static str,
        observed_occurrences: usize,
    },
    Synthesize {
        reason: &'static str,
        observed_occurrences: usize,
    },
}

impl ModelLoopProgressGuard {
    pub(super) fn observe_tool_round(
        &mut self,
        calls: &[ModelToolCall],
        provider_results: &[String],
    ) -> ModelLoopProgressAction {
        if calls.is_empty() {
            self.last_fingerprint = None;
            self.repeated_occurrences = 0;
            return ModelLoopProgressAction::Continue;
        }

        // Different queries/source files are not, by themselves, progress toward
        // the browser task. This is a goal review, never an automatic success or
        // a ban on further research. Ordinary read-only research is unaffected.
        let delivered_browser_input = calls.iter().zip(provider_results).any(|(call, result)| {
            let Some((_, action, args)) =
                browser_loop_detector::parse_browser_tool_call(&call.name, &call.arguments)
            else {
                return false;
            };
            if !matches!(
                action.as_str(),
                "act" | "vact" | "type" | "press" | "drag" | "upload" | "navigate"
            ) || args["effect"] == "observe"
            {
                return false;
            }
            let output = serde_json::Deserializer::from_str(result)
                .into_iter::<Value>()
                .next()
                .and_then(Result::ok)
                .unwrap_or(Value::Null);
            output["ok"] == true && output["dispatched"] != false && output["error"].is_null()
        });
        if delivered_browser_input {
            self.browser_input_seen = true;
            self.rounds_since_browser_input = 0;
        } else if self.browser_input_seen {
            self.rounds_since_browser_input += 1;
            if [6, 12, 24].contains(&self.rounds_since_browser_input) {
                return ModelLoopProgressAction::Warn {
                    reason: "browser_outcome_review_due",
                    observed_occurrences: self.rounds_since_browser_input,
                };
            }
        }

        let fingerprint = tool_round_progress_fingerprint(calls, provider_results);
        if self.last_fingerprint.as_deref() == Some(fingerprint.as_str()) {
            self.repeated_occurrences = self.repeated_occurrences.saturating_add(1);
        } else {
            self.last_fingerprint = Some(fingerprint);
            self.repeated_occurrences = 1;
        }

        // Mature-guard shape (checked across the reference projects): no
        // generic mid-turn warning. A fully-identical round either keeps going
        // or terminates with the synthesis explanation at the hard threshold.
        // Failure-scoped nudges stay in ToolLoopDetector, which names the tool
        // and the failure count.
        if self.repeated_occurrences >= REPEATED_TOOL_ROUND_HARD_OCCURRENCES {
            return ModelLoopProgressAction::Synthesize {
                reason: "repeated_identical_tool_round_without_new_evidence",
                observed_occurrences: self.repeated_occurrences,
            };
        }
        ModelLoopProgressAction::Continue
    }
}

pub(crate) fn tool_round_progress_fingerprint(
    calls: &[ModelToolCall],
    provider_results: &[String],
) -> String {
    let visual_results = provider_results
        .iter()
        .map(|content| browser_loop_detector::visual::scene(&json!({"content":content})))
        .collect::<Vec<_>>();
    let calls = calls
        .iter()
        .enumerate()
        .map(|(index, call)| {
            let args = if visual_results.get(index).is_some_and(Option::is_some) {
                browser_loop_detector::visual::action(&call.arguments)
            } else {
                call.arguments.clone()
            };
            format!(
                "{}:{}",
                call.name,
                serde_json::to_string(&args).unwrap_or_else(|_| "{}".to_string())
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    let results = provider_results
        .iter()
        .enumerate()
        .map(|(index, content)| {
            if let Some(Some(scene)) = visual_results.get(index) {
                // Keep success/failure and reason alongside pixels; stale transport IDs are omitted.
                let output = serde_json::Deserializer::from_str(content).into_iter::<Value>().next().and_then(Result::ok).unwrap_or(Value::Null);
                return json!({"scene":browser_loop_detector::visual::progress(scene),"ok":output["ok"],"reason":output["reason"]}).to_string();
            }
            let content = content
                .lines()
                .filter(|line| {
                    !line.starts_with("Evidence activity ID: ")
                        && !line.starts_with(FAILED_TOOL_ACTIVITY_LABEL)
                })
                .collect::<Vec<_>>()
                .join("\n");
            format!("{}:{content}", content.chars().count())
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!("calls:\n{calls}\nresults:\n{results}")
}

/// Shown after a failed tool result. The output above it is why the call failed.
pub(crate) const FAILED_TOOL_ACTIVITY_LABEL: &str =
    "Failed tool activity ID (output explains the failure; it is not proof the task succeeded)";

/// A cancellation is a terminal outcome with a reason, not a failure: it must
/// not feed consecutive-failure loop detection (a user stop or a superseded
/// turn says nothing about the tool or the model's strategy).
pub(crate) fn tool_output_cancelled(output: &Value) -> bool {
    output.get("cancelled").and_then(Value::as_bool) == Some(true)
        || output.pointer("/error/code").and_then(Value::as_str) == Some("cancelled")
}

pub(crate) const CANCELLED_TOOL_ACTIVITY_LABEL: &str =
    "Cancelled activity ID (the output's reason explains why the call did not run)";

pub(crate) fn tool_output_failed(output: &Value) -> bool {
    output.get("error").is_some_and(|value| !value.is_null())
        || matches!(
            output.get("status").and_then(Value::as_str),
            Some("failed" | "cancelled")
        )
        || output.get("cancelled").and_then(Value::as_bool) == Some(true)
        || output.pointer("/raw/ok").and_then(Value::as_bool) == Some(false)
        || output.pointer("/raw/success").and_then(Value::as_bool) == Some(false)
}

pub(crate) fn provider_visible_tool_result_content(
    output: &Value,
    tool_call_id: &str,
    max_chars: usize,
) -> (String, Option<Value>) {
    let (content, evidence_ref) = guarded_tool_result_content(output, max_chars);
    let label = if tool_output_cancelled(output) {
        CANCELLED_TOOL_ACTIVITY_LABEL
    } else if tool_output_failed(output) {
        FAILED_TOOL_ACTIVITY_LABEL
    } else {
        "Evidence activity ID"
    };
    (
        format!("{content}\n\n{label}: {tool_call_id}"),
        evidence_ref,
    )
}

#[cfg(test)]
mod visual_progress_tests {
    use super::*;
    #[test]
    fn browser_recovery_reviews_the_goal_even_when_source_queries_differ() {
        let mut guard = ModelLoopProgressGuard::default();
        let call = |name: &str, args| ModelToolCall {
            id: "call".into(),
            name: name.into(),
            arguments: args,
        };
        for i in 0..12 {
            assert!(matches!(
                guard.observe_tool_round(
                    &[call("shell", json!({"command":format!("read {i}")}))],
                    &[format!("source {i}")]
                ),
                ModelLoopProgressAction::Continue
            ));
        }
        guard.observe_tool_round(
            &[call(
                "browser_vact",
                json!({"mark":"1","effect":"editDraft"}),
            )],
            &[json!({"ok":true,"dispatched":true}).to_string()],
        );
        for i in 0..5 {
            assert!(matches!(
                guard.observe_tool_round(
                    &[call("shell", json!({"command":format!("read {i}")}))],
                    &[format!("source {i}")]
                ),
                ModelLoopProgressAction::Continue
            ));
        }
        assert!(matches!(
            guard.observe_tool_round(
                &[call("shell", json!({"command":"read final"}))],
                &["new source".into()]
            ),
            ModelLoopProgressAction::Warn {
                reason: "browser_outcome_review_due",
                ..
            }
        ));
        guard.observe_tool_round(
            &[call(
                "browser_vact",
                json!({"mark":"2","effect":"editDraft"}),
            )],
            &[json!({"ok":true,"dispatched":true}).to_string()],
        );
        assert!(matches!(
            guard.observe_tool_round(&[call("browser_read", json!({}))], &["result".into()]),
            ModelLoopProgressAction::Continue
        ));
    }
    #[test]
    fn capture_ids_do_not_mask_repeated_actions_but_cell_and_visual_changes_do() {
        let call = |capture, row| ModelToolCall {
            id: "call".into(),
            name: "browser_vact".into(),
            arguments: json!({"captureId":capture,"mark":"1","cell":{"row":row,"column":8}}),
        };
        let result = |capture, pixels| {
            format!(
                "{}\n\nEvidence activity ID: {capture}",
                json!({"ok":true,"scene":{"captureId":capture,"documentKey":"doc","evidence":{"fingerprint":pixels},"pageText":"turn"}})
            )
        };
        let fingerprint = |capture, row, pixels| {
            tool_round_progress_fingerprint(&[call(capture, row)], &[result(capture, pixels)])
        };
        assert_eq!(fingerprint("a", 7, "old"), fingerprint("b", 7, "old"));
        assert_ne!(fingerprint("a", 7, "old"), fingerprint("b", 8, "old"));
        assert_ne!(fingerprint("a", 7, "old"), fingerprint("b", 7, "new"));
    }
}

#[cfg(test)]
mod cancellation_classification_tests {
    use super::*;

    #[test]
    fn cancelled_outputs_are_recognized_by_flag_or_error_code() {
        let by_flag = json!({ "content": "cancelled", "cancelled": true });
        assert!(tool_output_cancelled(&by_flag));
        let by_code = json!({ "content": "cancelled", "error": { "code": "cancelled", "reason": "user_stop" } });
        assert!(tool_output_cancelled(&by_code));
        let timeout = json!({ "error": { "code": "timeout", "message": "budget elapsed" } });
        assert!(!tool_output_cancelled(&timeout));
        let completed = json!({ "content": "ok" });
        assert!(!tool_output_cancelled(&completed));
    }

    #[test]
    fn cancelled_outputs_are_not_counted_as_failures() {
        let cancelled = json!({
            "content": "Lyra tool call was cancelled.",
            "error": { "code": "cancelled", "reason": "turn_superseded" },
            "cancelled": true
        });
        // The model-loop sites compute `failed = !cancelled && tool_output_failed`;
        // tool_output_failed itself still matches (it keys on the error object),
        // so the negation at the call site is what keeps cancellations out of
        // the consecutive-failure counter. Pin both halves of that contract.
        assert!(tool_output_failed(&cancelled));
        let cancelled = cancelled;
        assert!(tool_output_cancelled(&cancelled));
        assert!(!(!tool_output_cancelled(&cancelled) && tool_output_failed(&cancelled)));
    }
}
