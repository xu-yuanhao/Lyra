use super::{
    providers::protocol::{
        anthropic_messages, aws_bedrock_converse, gemini_generate_content, ollama_chat,
        openai_chat_completions as openai_chat, openai_responses,
    },
    *,
};
use crate::{ProviderFailure, ProviderFailureCategory, ProviderProtocolFailureKind};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64_STANDARD};
use lyra_tool_fs_core::PROVIDER_VISIBLE_TOOL_NAMES;
use std::collections::{HashSet, VecDeque};
use std::future::Future;
use std::pin::Pin;
use std::sync::Mutex as StdMutex;

mod cache_state;
mod continuation;
mod model_loop;
mod non_streaming;
mod protocol_io;
mod protocol_mapping;
mod retry_policy;
#[cfg(test)]
#[path = "provider/scheduler_tests.test.rs"]
mod scheduler_tests;
#[cfg(test)]
#[path = "provider/stop_signal_tests.test.rs"]
mod stop_signal_tests;
pub(crate) mod streaming_tools;
mod usage;

pub(crate) use cache_state::*;
pub(crate) use model_loop::*;
pub(crate) use non_streaming::*;
pub(crate) use protocol_io::*;
pub(crate) use protocol_mapping::*;
pub(crate) use retry_policy::*;
pub(crate) use usage::*;

const REPEATED_TOOL_ROUND_SOFT_OCCURRENCES: usize = 3;
const REPEATED_TOOL_ROUND_HARD_OCCURRENCES: usize = 5;
const MAX_CONTINUATION_RETRIES: u8 = 4;
/// How many times a streaming turn is replayed after a transport failure that
/// struck before any increment was committed to the session (e.g. the provider
/// dropped the connection before the first usable SSE event). Replay is only
/// attempted when the route's parser confirms nothing was committed; a
/// mid-stream failure after a committed delta is never replayed.
const MAX_STREAM_TRANSPORT_RETRIES: u8 = 2;
const MAX_PROVIDER_IMAGE_TOOL_BYTES: u64 = 8 * 1024 * 1024;
const MAX_TOKENS_CONTINUATION_PROMPT: &str = "Previous response was cut off by output token limit, not finished. Continue the same response exactly where it stopped. Do not repeat, restart, apologize, or re-introduce. Output only continuation.";
const MAX_TOKENS_EXHAUSTED_VISIBLE_NOTE: &str =
    "[Auto continuation limit reached. Reply \"continue\" for remaining output.]";
const PROGRESS_GUARD_WARNING_PROMPT: &str = "Lyra's dynamic progress guard detected repeated identical tool calls with identical provider-visible results. Do not repeat the exact same tool call again unless the page, file, or external state has actually changed. Change strategy, inspect different evidence, use a more specific wait/read_until condition, or produce the final answer/blocker summary from the evidence already gathered.";
const PROGRESS_GUARD_FINAL_SYNTHESIS_PROMPT: &str = "Lyra's dynamic progress guard detected repeated identical tool calls with no new provider-visible evidence. Do not call more task tools in this response. Produce the best possible final answer from gathered evidence. If task is incomplete, state attempted work, exact blocker, and one next action. Do not ask member to restate the same request. Only exception: if completion truly needs missing member decision, call lyra_clarification_ask. Plain assistant questions r non-blocking and must not be used to wait.";

const PROVIDER_MIN_CONCURRENCY: usize = 1;
const PROVIDER_INITIAL_CONCURRENCY: usize = 2;
const PROVIDER_MAX_CONCURRENCY: usize = 4;
const PROVIDER_SUCCESSES_TO_GROW: u8 = 2;

/// Deadline for joining parallel tool threads. Occupancy for exec_command is
/// `EXEC_OCCUPANCY_CAP_MS`; slack keeps this fuse from winning the race and
/// looking like a 120s poll. Override with `LYRA_TOOL_JOIN_TIMEOUT_MS`.
fn tool_join_deadline() -> std::time::Duration {
    std::time::Duration::from_millis(
        std::env::var("LYRA_TOOL_JOIN_TIMEOUT_MS")
            .ok()
            .and_then(|s| s.parse().ok())
            .unwrap_or(super::tools::EXEC_OCCUPANCY_CAP_MS + super::tools::EXEC_JOIN_SLACK_MS),
    )
}

struct ProviderRequestScheduler {
    state: StdMutex<HashMap<String, ProviderRequestLane>>,
    wake: tokio::sync::Notify,
}

#[derive(Default)]
struct ProviderRequestLane {
    in_flight: usize,
    capacity: usize,
    consecutive_successes: u8,
    next_ticket: u64,
    waiting: VecDeque<(u64, RequestPriority)>,
    cooldown_until: Option<Instant>,
    backoff_attempt: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
enum RequestPriority {
    Foreground,
    Worker,
    Background,
}

struct ProviderRequestPermit {
    key: String,
}

// Both stages own their occupancy. Dropping an async request (cancellation,
// timeout or panic) must not strand a queue head or an in-flight slot.
struct ProviderQueueTicket {
    key: String,
    ticket: u64,
}

impl Drop for ProviderQueueTicket {
    fn drop(&mut self) {
        remove_waiting_ticket(provider_request_scheduler(), &self.key, self.ticket);
    }
}

impl Drop for ProviderRequestPermit {
    fn drop(&mut self) {
        let scheduler = provider_request_scheduler();
        let mut state = scheduler
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(lane) = state.get_mut(&self.key) {
            lane.in_flight = lane.in_flight.saturating_sub(1);
        }
        drop(state);
        scheduler.wake.notify_waiters();
    }
}

static PROVIDER_REQUEST_SCHEDULER: OnceLock<ProviderRequestScheduler> = OnceLock::new();

fn provider_request_scheduler() -> &'static ProviderRequestScheduler {
    PROVIDER_REQUEST_SCHEDULER.get_or_init(|| ProviderRequestScheduler {
        state: StdMutex::new(HashMap::new()),
        wake: tokio::sync::Notify::new(),
    })
}

fn provider_lane_key(provider: &NativeProviderProfile, model: &str) -> String {
    format!(
        "{}\u{1f}{}\u{1f}{}\u{1f}{}",
        provider.route_id,
        provider.id,
        provider.base_url.as_deref().unwrap_or_default(),
        model
    )
}

async fn acquire_provider_request_permit(
    provider: &NativeProviderProfile,
    model: &str,
    session_id: &str,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ProviderRequestPermit> {
    let priority = if is_subagent_session_id(session_id) {
        RequestPriority::Worker
    } else {
        RequestPriority::Foreground
    };
    acquire_prioritized_provider_permit(provider, model, priority, cancellation).await
}

async fn acquire_prioritized_provider_permit(
    provider: &NativeProviderProfile,
    model: &str,
    priority: RequestPriority,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<ProviderRequestPermit> {
    let scheduler = provider_request_scheduler();
    let key = provider_lane_key(provider, model);
    let ticket = {
        let mut state = scheduler
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let lane = state
            .entry(key.clone())
            .or_insert_with(|| ProviderRequestLane {
                capacity: PROVIDER_INITIAL_CONCURRENCY,
                ..ProviderRequestLane::default()
            });
        let ticket = lane.next_ticket;
        lane.next_ticket = lane.next_ticket.wrapping_add(1);
        enqueue_lane_ticket(&mut lane.waiting, ticket, priority);
        ticket
    };
    let _queued = ProviderQueueTicket {
        key: key.clone(),
        ticket,
    };
    loop {
        if cancellation.is_cancelled() {
            return Err(AgentRuntimeError::Cancelled);
        }
        let acquired = {
            let mut state = scheduler
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let now = Instant::now();
            let lane = state.get_mut(&key).expect("provider lane exists");
            let cooling_down = lane.cooldown_until.is_some_and(|deadline| deadline > now);
            let is_next = lane.waiting.front().map(|(queued, _)| *queued) == Some(ticket);
            if is_next && !cooling_down && lane.in_flight < lane.capacity {
                lane.waiting.pop_front();
                lane.in_flight += 1;
                true
            } else {
                false
            }
        };
        if acquired {
            return Ok(ProviderRequestPermit { key });
        }
        let wait_for = {
            let state = scheduler
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner());
            let now = Instant::now();
            let lane = state.get(&key).expect("provider lane exists");
            lane.cooldown_until
                .and_then(|deadline| deadline.checked_duration_since(now))
                .map(|duration| duration.min(Duration::from_millis(100)))
                .unwrap_or(Duration::from_millis(50))
        };
        tokio::select! {
            _ = scheduler.wake.notified() => {},
            _ = tokio::time::sleep(wait_for) => {},
            _ = cancellation.cancelled() => {
                return Err(AgentRuntimeError::Cancelled);
            }
        }
    }
}

fn enqueue_lane_ticket(
    waiting: &mut VecDeque<(u64, RequestPriority)>,
    ticket: u64,
    priority: RequestPriority,
) {
    let index = waiting
        .iter()
        .position(|(_, queued)| *queued > priority)
        .unwrap_or(waiting.len());
    waiting.insert(index, (ticket, priority));
}

pub(crate) async fn scheduled_background_provider_request<
    F: Future<Output = AgentRuntimeResult<ModelReply>>,
>(
    provider: &NativeProviderProfile,
    model: &str,
    request: F,
) -> AgentRuntimeResult<ModelReply> {
    let permit = acquire_prioritized_provider_permit(
        provider,
        model,
        RequestPriority::Background,
        &CancellationToken::default(),
    )
    .await?;
    let result = request.await;
    release_provider_request_permit(permit, &result);
    result
}

fn remove_waiting_ticket(scheduler: &ProviderRequestScheduler, key: &str, ticket: u64) {
    let mut state = scheduler
        .state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(lane) = state.get_mut(key) {
        lane.waiting.retain(|(queued, _)| *queued != ticket);
    }
    drop(state);
    scheduler.wake.notify_waiters();
}

fn release_provider_request_permit(
    permit: ProviderRequestPermit,
    result: &AgentRuntimeResult<ModelReply>,
) {
    let scheduler = provider_request_scheduler();
    let mut state = scheduler
        .state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    let lane = state
        .get_mut(&permit.key)
        .expect("provider lane exists while its permit is held");
    // Occupancy is released by the permit's Drop after this feedback lock.
    if result.is_ok() {
        lane.consecutive_successes = lane.consecutive_successes.saturating_add(1);
        if lane.consecutive_successes >= PROVIDER_SUCCESSES_TO_GROW
            && lane.capacity < PROVIDER_MAX_CONCURRENCY
        {
            lane.capacity += 1;
            lane.consecutive_successes = 0;
            lane.backoff_attempt = 0;
        }
    } else if result
        .as_ref()
        .err()
        .is_some_and(is_provider_rate_limited_error)
    {
        lane.capacity = (lane.capacity / 2).max(PROVIDER_MIN_CONCURRENCY);
        lane.consecutive_successes = 0;
        lane.backoff_attempt = lane.backoff_attempt.saturating_add(1).min(6);
        let cooldown = retry_after_from_error(result.as_ref().err().expect("checked above"))
            .unwrap_or_else(|| {
                let base =
                    250_u64.saturating_mul(2_u64.saturating_pow(lane.backoff_attempt.into()));
                Duration::from_millis(base.min(8_000) + (lane.backoff_attempt as u64 * 31 % 97))
            });
        lane.cooldown_until = Some(Instant::now() + cooldown);
    }
    drop(state);
}

fn is_provider_rate_limited_error(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                category: ProviderFailureCategory::RateLimit,
                ..
            }
        }
    )
}

fn retry_after_from_error(error: &AgentRuntimeError) -> Option<Duration> {
    let AgentRuntimeError::ProviderFailure { failure } = error else {
        return None;
    };
    let milliseconds = failure.retry_after_ms?;
    // Keep the server's minimum wait even when it exceeds the local backoff
    // cap. Bound pathological values to the same safe timer range as opencode.
    Some(Duration::from_millis(milliseconds.min(i32::MAX as u64)))
}
pub(crate) struct ModelRequest {
    pub(crate) provider: NativeProviderProfile,
    pub(crate) model: String,
    pub(crate) messages: Vec<Value>,
    pub(crate) tools: Vec<Value>,
    pub(crate) tool_choice: ModelToolChoice,
    pub(crate) host_dispatcher: Option<Arc<HostCapabilityDispatcher>>,
    pub(crate) capabilities: ModelCapabilityProfile,
    pub(crate) input_downgrades: Vec<Value>,
    pub(crate) evidence_refs: Vec<Value>,
    pub(crate) token_estimate: usize,
    pub(crate) context_trimmed: bool,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) enum ModelToolChoice {
    #[default]
    Auto,
    Required,
    Specific {
        tool_name: String,
    },
    None,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ModelReply {
    pub(crate) content: Option<String>,
    pub(crate) reasoning_content: Option<String>,
    pub(crate) tool_calls: Vec<ModelToolCall>,
    pub(crate) ui_message_id: Option<String>,
    /// Native stop reason before protocol normalization (`finish_reason`,
    /// `stop_reason`, `finishReason`, ...). Kept even for empty/reasoning-only
    /// replies so the loop can choose the correct recovery without guessing.
    pub(crate) raw_stop_reason: Option<String>,
    /// Protocol that owns `provider_replay_items`. Opaque items are only sent
    /// back when the next request has the same provider/route/protocol/model.
    pub(crate) provider_replay_protocol: Option<String>,
    pub(crate) provider_replay_items: Vec<Value>,
    pub(crate) response_meta: ProviderResponseMeta,
    /// The provider's normalized stop signal for this reply. Used by the turn
    /// loop to tell "model wanted to call a tool but emitted none" (=> retry)
    /// apart from "model is done" (=> end turn), instead of guessing from prose.
    /// `None` when the provider did not report one (older/odd endpoints).
    pub(crate) stop_signal: TurnStopSignal,
}

/// Provider-agnostic stop reason. Each protocol maps its native field
/// (OpenAI `finish_reason`, Anthropic/Bedrock `stop_reason`/`stopReason`,
/// Gemini `finishReason`) onto this so the turn loop reasons about one vocabulary.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) enum TurnStopSignal {
    /// The model finished a normal text answer (OpenAI `stop`, Anthropic
    /// `end_turn`, Gemini `STOP`). No tool was requested.
    EndTurn,
    /// The model signalled it wants to use a tool (OpenAI `tool_calls`,
    /// Anthropic `tool_use`). If no structured tool_call was parsed, this is the
    /// reliable "forgot to emit the tool_call" signal.
    ToolUse,
    /// Length/token cap (OpenAI `length`, Anthropic `max_tokens`).
    MaxTokens,
    /// Provider safety/content policy stopped generation.
    ContentFilter,
    /// Provider/model explicitly refused the request.
    Refusal,
    /// Provider reported nothing usable, or an unrecognized value.
    #[default]
    Unknown,
}

impl TurnStopSignal {
    /// Map a raw provider stop string (any protocol) onto the unified vocabulary.
    pub(crate) fn from_raw(raw: Option<&str>) -> Self {
        match raw.map(str::trim).map(str::to_ascii_lowercase).as_deref() {
            Some("stop" | "end_turn" | "endturn") => Self::EndTurn,
            Some("tool_calls" | "tool_use" | "tooluse" | "function_call") => Self::ToolUse,
            Some("length" | "max_tokens" | "max_token" | "max_output_tokens" | "model_length") => {
                Self::MaxTokens
            }
            Some(
                "content_filter" | "safety" | "safety_block" | "blocked" | "prohibited_content",
            ) => Self::ContentFilter,
            Some("refusal" | "refused") => Self::Refusal,
            _ => Self::Unknown,
        }
    }

    pub(crate) fn label(self) -> &'static str {
        match self {
            Self::EndTurn => "end_turn",
            Self::ToolUse => "tool_use",
            Self::MaxTokens => "max_tokens",
            Self::ContentFilter => "content_filter",
            Self::Refusal => "refusal",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Clone, Debug)]
pub(crate) struct ModelToolCall {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) arguments: Value,
}

pub(crate) fn completed_successful_tool_call(
    tool_calls: &[ModelToolCall],
    outputs: &[Value],
    tool_name: &str,
) -> bool {
    tool_calls
        .iter()
        .zip(outputs)
        .any(|(call, output)| call.name == tool_name && output.get("error").is_none())
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ProviderStreamState {
    pub(crate) content: String,
    pub(crate) reasoning_content: String,
    pub(crate) reasoning_chars: usize,
    pub(crate) saw_refusal: bool,
    pub(crate) reasoning_replay: openai_chat::ReasoningAccumulator,
    pub(crate) tool_calls: HashMap<usize, openai_chat::StreamingToolCallAccumulator>,
    /// Provider tool-call id → stream slot. A missing `index` must not fall
    /// into slot 0 when that slot already belongs to another id.
    pub(crate) tool_call_ids: HashMap<String, usize>,
    /// Holds a trailing `<` that might open a textual `<tool_call>` so the
    /// markup never becomes assistant text.
    pub(crate) visible_markup_hold: String,
    pub(crate) saw_choice: bool,
    pub(crate) finish_reason: Option<String>,
    pub(crate) response_meta: ProviderResponseMeta,
    /// True once this stream has committed any increment to session state — an
    /// assistant delta or a streaming tool-call preview
    /// (`maybe_emit_streaming_diff_previews_from_accumulators`).
    /// A transport failure before this point is safe to retry (replaying the
    /// turn duplicates nothing); a failure after it is not, because the
    /// partial assistant text / tool activity is already in the timeline.
    pub(crate) committed_any: bool,
    /// Strips inline `<think>…</think>` reasoning from OpenAI-compatible content
    /// deltas so it never leaks into the visible message; routed to
    /// `reasoning_content` instead. Stateful across deltas (handles tags split
    /// across stream chunks).
    pub(crate) think_scrubber: openai_chat::StreamingThinkScrubber,
}

#[derive(Clone, Debug)]
pub(crate) struct ModelLoopResult {
    pub(crate) final_text: Option<String>,
    pub(crate) final_message_id: Option<String>,
    pub(crate) metadata: Option<Value>,
    pub(crate) provider_transcript: Vec<Value>,
    pub(crate) provider_replay_items: Vec<Value>,
    pub(crate) ui_text_committed: bool,
}

impl ModelLoopResult {
    pub(crate) fn final_text(text: String) -> Self {
        Self {
            final_text: Some(text),
            final_message_id: None,
            metadata: None,
            provider_transcript: Vec::new(),
            provider_replay_items: Vec::new(),
            ui_text_committed: false,
        }
    }

    fn with_ui_text_committed(mut self, ui_text_committed: bool) -> Self {
        self.ui_text_committed = ui_text_committed;
        self
    }

    fn with_final_message_id(mut self, final_message_id: Option<String>) -> Self {
        self.final_message_id = final_message_id.filter(|id| !id.trim().is_empty());
        self
    }

    fn with_provider_transcript(mut self, provider_transcript: Vec<Value>) -> Self {
        self.provider_transcript = provider_transcript;
        self
    }

    fn with_provider_replay_items(mut self, provider_replay_items: Vec<Value>) -> Self {
        self.provider_replay_items = provider_replay_items;
        self
    }

    fn with_metadata(mut self, metadata: Value) -> Self {
        self.metadata = Some(metadata);
        self
    }

    fn with_merged_metadata(mut self, incoming: Value) -> Self {
        let mut current = self.metadata.take().unwrap_or_else(|| json!({}));
        if !current.is_object() {
            current = json!({ "value": current });
        }
        if let (Some(current), Some(incoming)) = (current.as_object_mut(), incoming.as_object()) {
            current.extend(incoming.clone());
        }
        self.metadata = Some(current);
        self
    }

    pub(crate) fn session_metadata(&self) -> Option<Value> {
        let mut metadata = self.metadata.clone().unwrap_or_else(|| json!({}));
        if !metadata.is_object() {
            metadata = json!({ "value": metadata });
        }
        if !self.provider_transcript.is_empty()
            && let Some(object) = metadata.as_object_mut()
        {
            object.insert(
                "providerTranscript".to_string(),
                Value::Array(self.provider_transcript.clone()),
            );
        }
        if !self.provider_replay_items.is_empty()
            && let Some(object) = metadata.as_object_mut()
        {
            object.insert(
                "openaiResponsesReplay".to_string(),
                Value::Array(self.provider_replay_items.clone()),
            );
        }
        (!metadata.as_object().is_some_and(Map::is_empty)).then_some(metadata)
    }
}

#[derive(Clone, Debug)]
pub(crate) struct ModelCapabilityProfile {
    pub(crate) supports_image_input: bool,
    pub(crate) supports_tool_calling: bool,
    pub(crate) supports_streaming: bool,
    pub(crate) supports_tool_choice: bool,
    pub(crate) context_window: Option<usize>,
}

#[cfg(test)]
mod lane_priority_tests {
    use super::*;

    #[test]
    fn parent_tickets_queue_ahead_of_waiting_workers() {
        let mut waiting = VecDeque::new();
        enqueue_lane_ticket(&mut waiting, 1, RequestPriority::Worker);
        enqueue_lane_ticket(&mut waiting, 2, RequestPriority::Worker);
        enqueue_lane_ticket(&mut waiting, 3, RequestPriority::Foreground);
        enqueue_lane_ticket(&mut waiting, 4, RequestPriority::Worker);
        assert_eq!(
            waiting.into_iter().collect::<Vec<_>>(),
            vec![
                (3, RequestPriority::Foreground),
                (1, RequestPriority::Worker),
                (2, RequestPriority::Worker),
                (4, RequestPriority::Worker)
            ]
        );
    }
}
