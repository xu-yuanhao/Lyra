//! A provider request owns its early reads. Explicit tool-complete events may
//! start a read-only prefix; side effects remain in the normal round executor.
use super::*;

tokio::task_local! {
    static CURRENT: Arc<StreamingTools>;
}

pub(crate) struct StreamingTools {
    session_id: String,
    turn_id: String,
    tools: Vec<Value>,
    dispatcher: Option<Arc<HostCapabilityDispatcher>>,
    cancellation: CancellationToken,
    runtime: ToolExecutionRuntime,
    detector: tool_loop_detector::ToolLoopDetector,
    pending: StdMutex<Pending>,
}

#[derive(Default)]
struct Pending {
    barrier: bool,
    declared: HashSet<String>,
    tasks: HashMap<String, (ModelToolCall, EarlyTask)>,
    checkpoint: Value,
    message_id: Option<String>,
}

pub(crate) struct EarlyTask(tokio::task::JoinHandle<Value>);

impl Drop for EarlyTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}

impl EarlyTask {
    pub(crate) async fn result(mut self) -> Value {
        match (&mut self.0).await {
            Ok(value) => value,
            Err(_) => {
                json!({"error":{"code":"tool_worker_panicked","message":"Tool execution interrupted."}})
            }
        }
    }
}

impl StreamingTools {
    pub(crate) fn new(
        session_id: &str,
        turn_id: &str,
        request: &ModelRequest,
        cancellation: &CancellationToken,
        detector: &tool_loop_detector::ToolLoopDetector,
    ) -> Arc<Self> {
        Arc::new(Self {
            session_id: session_id.to_string(),
            turn_id: turn_id.to_string(),
            tools: request.tools.clone(),
            dispatcher: request.host_dispatcher.clone(),
            cancellation: cancellation.child_token(),
            runtime: ToolExecutionRuntime::from_model_capabilities(&request.capabilities),
            detector: detector.clone(),
            pending: StdMutex::new(Pending {
                checkpoint: provider_protocol_step(
                    request,
                    turn_id,
                    &ModelReply {
                        stop_signal: TurnStopSignal::ToolUse,
                        ..ModelReply::default()
                    },
                    &[],
                    "awaitingToolResults",
                    vec![],
                    vec![],
                ),
                ..Pending::default()
            }),
        })
    }

    pub(crate) async fn scope<F: Future>(self: &Arc<Self>, future: F) -> F::Output {
        CURRENT.scope(self.clone(), future).await
    }

    pub(crate) fn take(&self, call: &ModelToolCall) -> AgentRuntimeResult<Option<EarlyTask>> {
        let Some((accepted, task)) = self.pending.lock().unwrap().tasks.remove(&call.id) else {
            return Ok(None);
        };
        if accepted.name != call.name || accepted.arguments != call.arguments {
            return Err(AgentRuntimeError::Core(
                "Provider changed an already completed tool call".to_string(),
            ));
        }
        Ok(Some(task))
    }

    pub(crate) fn validate_reply(&self, reply: &ModelReply) -> AgentRuntimeResult<()> {
        for (id, (accepted, _)) in &self.pending.lock().unwrap().tasks {
            let calls: Vec<_> = reply
                .tool_calls
                .iter()
                .filter(|call| &call.id == id)
                .collect();
            if calls.len() != 1
                || calls[0].name != accepted.name
                || calls[0].arguments != accepted.arguments
            {
                return Err(AgentRuntimeError::Core(
                    "Provider changed an already completed tool call".to_string(),
                ));
            }
        }
        Ok(())
    }
}

impl Drop for StreamingTools {
    fn drop(&mut self) {
        self.cancellation.cancel();
    }
}

// These names dispatch only to built-in local readers. Dynamic/MCP tools and
// generic dispatchers are intentionally excluded, regardless of annotations.
fn safe_name(name: &str) -> bool {
    matches!(name, "read_file" | "glob" | "grep")
}

pub(crate) fn declare(id: &str, name: &str) {
    let _ = CURRENT.try_with(|round| {
        let mut pending = round.pending.lock().unwrap();
        if !safe_name(name) {
            pending.barrier = true;
        }
        if !pending.barrier {
            pending.declared.insert(id.to_string());
        }
    });
}

pub(crate) fn complete(call: ModelToolCall, ui_message_id: &mut Option<String>) {
    let _ = CURRENT.try_with(|round| {
        let mut pending = round.pending.lock().unwrap();
        if !pending.declared.remove(&call.id)
            || pending.tasks.contains_key(&call.id)
            || round.cancellation.is_cancelled()
            || matches!(
                round.detector.pre_check(&call.name, &call.arguments),
                tool_loop_detector::LoopDetectorAction::Block(_)
            )
            || schema_not_sent_if_needed(&call.name, &round.tools, round.dispatcher.as_ref())
                .is_some()
            || !safe_arguments(&call)
            || native_permission_request_for_tool(
                &round.session_id,
                &round.turn_id,
                &call.id,
                "file",
                if call.name == "read_file" {
                    "read"
                } else {
                    &call.name
                },
                &call.arguments,
            )
            .is_some()
        {
            return;
        }
        // Anchor before starting the tool. The ordinary dispatcher persists
        // its pending activity and applies the same plan/workspace checks.
        if ui_message_id.is_none() {
            *ui_message_id =
                turns::emit_assistant_message_placeholder(&round.session_id, &round.turn_id);
        }
        if ui_message_id.is_none() {
            return;
        }
        pending.message_id = ui_message_id.clone();
        push_array(&mut pending.checkpoint["assistant"], "toolCalls", json!({"id":call.id,"name":call.name,"arguments":call.arguments}));
        if checkpoint(round, &mut pending).is_err() {
            pending.checkpoint["assistant"]["toolCalls"].as_array_mut().unwrap().pop();
            return;
        }
        let weak_round = Arc::downgrade(round);
        let session = round.session_id.clone();
        let turn = round.turn_id.clone();
        let dispatcher = round.dispatcher.clone();
        let cancellation = round.cancellation.clone();
        let runtime = round.runtime;
        let task_call = call.clone();
        let result_id = call.id.clone();
        let task = EarlyTask(tokio::spawn(async move {
            let tool_cancellation = cancellation.child_token();
            let output = match tokio::time::timeout(tool_join_deadline(), execute_model_tool_with_runtime(
                &session, &turn, &dispatcher, &tool_cancellation, runtime, task_call.clone(),
            )).await {
                Ok(output) => output,
                Err(_) => {
                    tool_cancellation.cancel();
                    let output = json!({"error":{"code":"tool_join_timeout","message":"Tool execution timed out."}});
                    crate::native_backend::activity::settle_tool_join_timeout(&session, &turn, &task_call, &output);
                    output
                }
            };
            if let Some(round) = weak_round.upgrade() {
                let (content, _) = provider_visible_tool_result_content(&output, &result_id, 24_000);
                let mut pending = round.pending.lock().unwrap();
                push_array(&mut pending.checkpoint, "toolResults", json!({
                    "toolCallId": result_id, "content": content,
                    "status": if tool_output_failed(&output) { "failed" } else { "completed" }
                }));
                if let Err(error) = checkpoint(&round, &mut pending) {
                    return json!({"error":{"code":"tool_checkpoint_failed", "message":error.to_string()}});
                }
            }
            output
        }));
        pending.tasks.insert(call.id.clone(), (call, task));
    });
}

fn checkpoint(round: &StreamingTools, pending: &mut Pending) -> AgentRuntimeResult<()> {
    let message_id = pending
        .message_id
        .as_deref()
        .expect("early tool has message anchor");
    if let Ok(state) = state().lock() {
        if let Some(message) = state
            .sessions
            .get(&round.session_id)
            .and_then(|s| s.snapshot["messages"].as_array())
            .and_then(|messages| {
                messages
                    .iter()
                    .find(|m| m["id"].as_str() == Some(message_id))
            })
        {
            pending.checkpoint["assistant"]["content"] = message["text"].clone();
        }
    }
    turns::upsert_provider_protocol_log_entry(
        &round.session_id,
        &round.turn_id,
        Some(message_id),
        pending.checkpoint.clone(),
    )
}

fn safe_arguments(call: &ModelToolCall) -> bool {
    if !safe_name(&call.name)
        || !call.arguments.is_object()
        || call.arguments.get("parseError").is_some()
    {
        return false;
    }
    let Some(path) = call.arguments.get("path").and_then(Value::as_str) else {
        return false;
    };
    // /tools reads can connect to dynamic services. Only workspace readers may
    // overlap generation; the existing resolver still enforces workspace scope.
    !path.trim().starts_with("/tools") && !path.trim().starts_with("lyra://")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_explicit_local_reads_qualify() {
        let call = |name: &str, arguments: Value| ModelToolCall {
            id: "call".into(),
            name: name.into(),
            arguments,
        };
        assert!(safe_arguments(&call(
            "read_file",
            json!({"path":"README.md"})
        )));
        assert!(!safe_arguments(&call(
            "read_file",
            json!({"path":"/tools/mcp/server"})
        )));
        assert!(!safe_arguments(&call(
            "read_file",
            json!({"path":"x", "parseError":true})
        )));
        for name in [
            "exec_command",
            "apply_patch",
            "tool_fs_run",
            "browser_read",
            "mcp_read",
        ] {
            assert!(!safe_arguments(&call(name, json!({"path":"README.md"}))));
        }
    }
}

#[cfg(test)]
mod lifecycle_tests {
    use super::*;

    fn round() -> Arc<StreamingTools> {
        Arc::new(StreamingTools {
            session_id: "session".into(),
            turn_id: "turn".into(),
            tools: vec![],
            dispatcher: None,
            cancellation: CancellationToken::new(),
            runtime: ToolExecutionRuntime::default(),
            detector: tool_loop_detector::ToolLoopDetector::default(),
            pending: StdMutex::new(Pending::default()),
        })
    }

    #[tokio::test]
    async fn writes_are_barriers_and_request_scopes_are_isolated() {
        let first = round();
        let second = round();
        first
            .scope(async {
                declare("a", "read_file");
                declare("write", "write_file");
                declare("b", "read_file");
                second
                    .scope(async {
                        declare("c", "read_file");
                    })
                    .await;
            })
            .await;
        assert_eq!(
            first.pending.lock().unwrap().declared,
            HashSet::from(["a".to_string()])
        );
        assert_eq!(
            second.pending.lock().unwrap().declared,
            HashSet::from(["c".to_string()])
        );
        declare("outside", "read_file");
        assert_eq!(second.pending.lock().unwrap().declared.len(), 1);
    }

    #[tokio::test]
    async fn results_are_consumed_once_and_changed_arguments_are_rejected() {
        let round = round();
        let call = ModelToolCall {
            id: "read".into(),
            name: "read_file".into(),
            arguments: json!({"path":"a"}),
        };
        round.pending.lock().unwrap().tasks.insert(
            call.id.clone(),
            (
                call.clone(),
                EarlyTask(tokio::spawn(async { json!({"content":"once"}) })),
            ),
        );
        assert_eq!(
            round.take(&call).unwrap().unwrap().result().await["content"],
            "once"
        );
        assert!(round.take(&call).unwrap().is_none());
        round.pending.lock().unwrap().tasks.insert(
            call.id.clone(),
            (
                call.clone(),
                EarlyTask(tokio::spawn(std::future::pending())),
            ),
        );
        let changed = ModelToolCall {
            arguments: json!({"path":"b"}),
            ..call
        };
        assert!(round.take(&changed).is_err());
    }

    #[tokio::test]
    async fn abandoning_a_request_cancels_and_aborts_pending_reads() {
        use std::sync::atomic::{AtomicBool, Ordering};
        struct Dropped(Arc<AtomicBool>);
        impl Drop for Dropped {
            fn drop(&mut self) {
                self.0.store(true, Ordering::SeqCst);
            }
        }
        let round = round();
        let cancelled = round.cancellation.clone();
        let stopped = Arc::new(AtomicBool::new(false));
        let guard = Dropped(stopped.clone());
        let task = EarlyTask(tokio::spawn(async move {
            let _guard = guard;
            std::future::pending::<Value>().await
        }));
        let call = ModelToolCall {
            id: "read".into(),
            name: "read_file".into(),
            arguments: json!({"path":"a"}),
        };
        round
            .pending
            .lock()
            .unwrap()
            .tasks
            .insert(call.id.clone(), (call, task));
        tokio::task::yield_now().await;
        drop(round);
        tokio::task::yield_now().await;
        assert!(cancelled.is_cancelled());
        assert!(stopped.load(Ordering::SeqCst));
    }
}
