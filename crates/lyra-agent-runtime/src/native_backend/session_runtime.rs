use super::*;
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Copy)]
struct TurnActivityState {
    last_progress_at: Instant,
    paused_at: Option<Instant>,
    pause_count: usize,
}

pub(crate) struct TurnActivityPauseGuard {
    turn_id: String,
}

impl Drop for TurnActivityPauseGuard {
    fn drop(&mut self) {
        resume_turn_activity(&self.turn_id);
    }
}

static TURN_CANCELLATIONS: OnceLock<Mutex<HashMap<String, CancellationToken>>> = OnceLock::new();
static CANCELLED_TURNS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
static ACTIVE_TURNS: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static ACTIVE_UI_MESSAGES: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
static TURN_ACTIVITIES: OnceLock<Mutex<HashMap<String, TurnActivityState>>> = OnceLock::new();
static TURN_ACTIVITY_CHANGES: OnceLock<Mutex<HashMap<String, watch::Sender<u64>>>> =
    OnceLock::new();
static TURN_PROVIDER_METADATA: OnceLock<Mutex<HashMap<String, Value>>> = OnceLock::new();
// Mid-turn user messages (steers) waiting for the running turn's next model
// boundary. FIFO per session; drained by the model loop (in-flight delivery)
// or by finish_turn's tail (final-response race). An empty inbox at turn
// start is an invariant: finish_turn drains it inside the same critical
// section that ends the turn, so a steer in the inbox always belongs to the
// currently running turn and no later context rebuild can double-include it.
static PENDING_STEERS: OnceLock<Mutex<HashMap<String, Vec<Value>>>> = OnceLock::new();

fn turn_cancellations() -> &'static Mutex<HashMap<String, CancellationToken>> {
    TURN_CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn cancelled_turns() -> &'static Mutex<HashSet<String>> {
    CANCELLED_TURNS.get_or_init(|| Mutex::new(HashSet::new()))
}

fn active_turns() -> &'static Mutex<HashMap<String, String>> {
    ACTIVE_TURNS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn active_ui_messages() -> &'static Mutex<HashMap<String, String>> {
    ACTIVE_UI_MESSAGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn turn_activities() -> &'static Mutex<HashMap<String, TurnActivityState>> {
    TURN_ACTIVITIES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn turn_activity_changes() -> &'static Mutex<HashMap<String, watch::Sender<u64>>> {
    TURN_ACTIVITY_CHANGES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn turn_provider_metadata() -> &'static Mutex<HashMap<String, Value>> {
    TURN_PROVIDER_METADATA.get_or_init(|| Mutex::new(HashMap::new()))
}

fn pending_steers() -> &'static Mutex<HashMap<String, Vec<Value>>> {
    PENDING_STEERS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Queue a mid-turn user message for delivery at the running turn's next
/// model boundary. The message is already a transcript citizen (send_turn
/// appended it before enqueueing), so the inbox copy is purely the
/// in-flight delivery handle.
pub(crate) fn enqueue_steer(session_id: &str, message: Value) {
    if let Ok(mut pending) = pending_steers().lock() {
        pending
            .entry(session_id.to_string())
            .or_default()
            .push(message);
    }
}

/// Drain every queued steer for the session, oldest first.
pub(crate) fn take_pending_steers(session_id: &str) -> Vec<Value> {
    pending_steers()
        .lock()
        .ok()
        .and_then(|mut pending| pending.remove(session_id))
        .unwrap_or_default()
}

#[cfg(test)]
pub(crate) fn pending_steer_count(session_id: &str) -> usize {
    pending_steers()
        .lock()
        .ok()
        .and_then(|pending| pending.get(session_id).cloned())
        .unwrap_or_default()
        .len()
}

/// Transcript snapshot for steer projection: the drain needs the messages
/// that precede each steer (inline-image inheritance, citation context) and
/// the steer's own index, exactly as a full context rebuild would see them.
pub(crate) fn session_transcript_snapshot(session_id: &str) -> Vec<Value> {
    state()
        .lock()
        .ok()
        .and_then(|state| {
            state
                .sessions
                .get(session_id)
                .and_then(|session| session.snapshot.get("messages"))
                .and_then(Value::as_array)
                .cloned()
        })
        .unwrap_or_default()
}

fn turn_key(session_id: &str, turn_id: &str) -> String {
    format!("{session_id}:{turn_id}")
}

pub(crate) fn register_turn_cancellation(turn_id: &str, token: CancellationToken) {
    if let Ok(mut cancellations) = turn_cancellations().lock() {
        cancellations.insert(turn_id.to_string(), token);
    }
}

pub(crate) fn register_active_turn(session_id: &str, turn_id: &str, token: CancellationToken) {
    register_turn_cancellation(turn_id, token);
    if let Ok(mut active) = active_turns().lock() {
        active.insert(session_id.to_string(), turn_id.to_string());
    }
}

pub(crate) fn active_turn_id(session_id: &str) -> Option<String> {
    active_turns()
        .lock()
        .ok()
        .and_then(|active| active.get(session_id).cloned())
}

pub(crate) fn turn_is_active(session_id: &str, turn_id: &str) -> bool {
    if turn_cancellation_requested(turn_id) {
        return false;
    }
    if let Some(active_turn_id) = active_turn_id(session_id) {
        return active_turn_id == turn_id;
    }
    state()
        .lock()
        .map(|state| {
            state.sessions.get(session_id).is_some_and(|session| {
                session.snapshot.get("turnStatus").and_then(Value::as_str) == Some("running")
                    && session.snapshot.get("activeTurnId").and_then(Value::as_str) == Some(turn_id)
            })
        })
        .unwrap_or(false)
}

/// Register a turn so permission/clarification pauses can freeze tool-batch
/// join budgets. Foreground commands wait on process exit; there is no
/// turn-idle watchdog.
pub(crate) fn register_turn_activity(turn_id: &str) {
    if let Ok(mut activities) = turn_activities().lock() {
        activities.insert(
            turn_id.to_string(),
            TurnActivityState {
                last_progress_at: Instant::now(),
                paused_at: None,
                pause_count: 0,
            },
        );
    }
    if let Ok(mut changes) = turn_activity_changes().lock() {
        let (sender, _) = watch::channel(0);
        changes.insert(turn_id.to_string(), sender);
    }
}

/// Record that the turn made progress (provider response arrived, tool
/// completed, etc.). Wakes pause-aware tool-batch waiters.
///
/// No-op while the turn is paused (interaction wait).
pub(crate) fn record_progress(turn_id: &str) {
    let now = Instant::now();
    let progressed = if let Ok(mut activities) = turn_activities().lock() {
        if let Some(state) = activities.get_mut(turn_id) {
            if state.pause_count == 0 {
                state.last_progress_at = now;
                true
            } else {
                false
            }
        } else {
            false
        }
    } else {
        false
    };
    if progressed {
        notify_turn_activity_changed(turn_id);
    }
}

pub(crate) fn record_turn_provider_metadata(session_id: &str, turn_id: &str, metadata: Value) {
    if let Ok(mut entries) = turn_provider_metadata().lock() {
        let entry = entries
            .entry(turn_key(session_id, turn_id))
            .or_insert_with(|| json!({}));
        if let (Some(target), Some(incoming)) = (entry.as_object_mut(), metadata.as_object()) {
            target.extend(incoming.clone());
        } else {
            *entry = metadata;
        }
    }
}

pub(crate) fn append_turn_provider_attempt(session_id: &str, turn_id: &str, attempt: Value) {
    if let Ok(mut entries) = turn_provider_metadata().lock() {
        let entry = entries
            .entry(turn_key(session_id, turn_id))
            .or_insert_with(|| json!({}));
        if !entry.is_object() {
            *entry = json!({});
        }
        let Some(object) = entry.as_object_mut() else {
            return;
        };
        let attempts = object
            .entry("providerAttempts".to_string())
            .or_insert_with(|| json!([]));
        if let Some(attempts) = attempts.as_array_mut() {
            attempts.push(attempt);
        }
    }
}

/// Aggregate local work separately from provider/tool latency. Only numbers
/// are retained; timing does not add synchronous disk writes or UI events.
pub(crate) struct LocalPhaseTimer<'a> {
    session_id: &'a str,
    turn_id: &'a str,
    phase: &'static str,
    started: Instant,
}
impl<'a> LocalPhaseTimer<'a> {
    pub(crate) fn start(session_id: &'a str, turn_id: &'a str, phase: &'static str) -> Self {
        Self {
            session_id,
            turn_id,
            phase,
            started: Instant::now(),
        }
    }
}
impl Drop for LocalPhaseTimer<'_> {
    fn drop(&mut self) {
        let elapsed = self.started.elapsed().as_secs_f64() * 1000.0;
        if let Ok(mut entries) = turn_provider_metadata().lock() {
            let entry = entries
                .entry(turn_key(self.session_id, self.turn_id))
                .or_insert_with(|| json!({}));
            if !entry.is_object() {
                *entry = json!({});
            }
            if !entry["localPhases"].is_object() {
                entry["localPhases"] = json!({});
            }
            let stats = &mut entry["localPhases"][self.phase];
            let count = stats["count"].as_u64().unwrap_or(0) + 1;
            let total = stats["totalMs"].as_f64().unwrap_or(0.0) + elapsed;
            let max = stats["maxMs"].as_f64().unwrap_or(0.0).max(elapsed);
            *stats = json!({"count":count,"totalMs":total,"maxMs":max});
        }
    }
}

pub(crate) fn set_last_provider_attempt_recovery(
    session_id: &str,
    turn_id: &str,
    recovery_action: &str,
) {
    if let Ok(mut entries) = turn_provider_metadata().lock()
        && let Some(attempt) = entries
            .get_mut(&turn_key(session_id, turn_id))
            .and_then(|metadata| metadata.get_mut("providerAttempts"))
            .and_then(Value::as_array_mut)
            .and_then(|attempts| attempts.last_mut())
    {
        attempt["recoveryAction"] = json!(recovery_action);
    }
}

pub(crate) fn take_turn_provider_metadata(session_id: &str, turn_id: &str) -> Option<Value> {
    turn_provider_metadata()
        .lock()
        .ok()
        .and_then(|mut entries| entries.remove(&turn_key(session_id, turn_id)))
}

pub(crate) fn turn_activity_is_paused(turn_id: &str) -> bool {
    turn_activities()
        .lock()
        .ok()
        .and_then(|activities| activities.get(turn_id).copied())
        .is_some_and(|state| state.pause_count > 0)
}

pub(crate) fn turn_activity_change_receiver(turn_id: &str) -> Option<watch::Receiver<u64>> {
    turn_activity_changes()
        .lock()
        .ok()
        .and_then(|changes| changes.get(turn_id).map(watch::Sender::subscribe))
}

pub(crate) fn pause_turn_activity(turn_id: &str) -> TurnActivityPauseGuard {
    if let Ok(mut activities) = turn_activities().lock()
        && let Some(state) = activities.get_mut(turn_id)
    {
        if state.pause_count == 0 {
            state.paused_at = Some(Instant::now());
        }
        state.pause_count += 1;
    }
    notify_turn_activity_changed(turn_id);
    TurnActivityPauseGuard {
        turn_id: turn_id.to_string(),
    }
}

fn resume_turn_activity(turn_id: &str) {
    let now = Instant::now();
    if let Ok(mut activities) = turn_activities().lock()
        && let Some(state) = activities.get_mut(turn_id)
    {
        state.pause_count = state.pause_count.saturating_sub(1);
        if state.pause_count == 0
            && let Some(paused_at) = state.paused_at.take()
        {
            state.last_progress_at += now.saturating_duration_since(paused_at);
        }
    }
    notify_turn_activity_changed(turn_id);
}

fn notify_turn_activity_changed(turn_id: &str) {
    if let Ok(changes) = turn_activity_changes().lock()
        && let Some(sender) = changes.get(turn_id)
    {
        sender.send_modify(|version| *version = version.wrapping_add(1));
    }
}

pub(crate) fn unregister_turn_cancellation(turn_id: &str) {
    if let Ok(mut cancellations) = turn_cancellations().lock() {
        cancellations.remove(turn_id);
    }
}

pub(crate) fn clear_active_turn(session_id: &str, turn_id: &str) {
    super::tools::finish_foreground_shells(turn_id);
    if let Ok(mut active) = active_turns().lock()
        && active
            .get(session_id)
            .is_some_and(|active_turn| active_turn == turn_id)
    {
        active.remove(session_id);
    }
    if let Ok(mut activities) = turn_activities().lock() {
        activities.remove(turn_id);
    }
    if let Ok(mut changes) = turn_activity_changes().lock()
        && let Some(sender) = changes.remove(turn_id)
    {
        sender.send_modify(|version| *version = version.wrapping_add(1));
    }
    if let Ok(mut entries) = turn_provider_metadata().lock() {
        entries.remove(&turn_key(session_id, turn_id));
    }
    clear_turn_cancellation(turn_id);
    clear_active_ui_message_id(session_id, turn_id);
}

pub(crate) fn request_turn_cancellation(turn_id: &str) -> bool {
    if let Ok(mut cancelled) = cancelled_turns().lock() {
        cancelled.insert(turn_id.to_string());
    }
    // Wake any permission/clarification waiter parked for this turn so
    // cancellation interrupts the wait immediately instead of letting it
    // sit out its timeout.
    super::waiters::cancel_turn_waiters(turn_id);
    turn_cancellations()
        .lock()
        .ok()
        .and_then(|cancellations| cancellations.get(turn_id).cloned())
        .map(|token| {
            token.cancel();
            true
        })
        .unwrap_or(false)
}

pub(crate) fn clear_turn_cancellation(turn_id: &str) {
    if let Ok(mut cancelled) = cancelled_turns().lock() {
        cancelled.remove(turn_id);
    }
    unregister_turn_cancellation(turn_id);
}

pub(crate) fn turn_cancellation_requested(turn_id: &str) -> bool {
    // Fail open on lock errors: a broken lock must not fabricate a
    // cancellation (unknown ≠ cancelled). RecoveringMutex makes both
    // `unwrap_or` branches unreachable today.
    if cancelled_turns()
        .lock()
        .map(|cancelled| cancelled.contains(turn_id))
        .unwrap_or(false)
    {
        return true;
    }
    turn_cancellations()
        .lock()
        .map(|cancellations| {
            cancellations
                .get(turn_id)
                .is_some_and(|token| token.is_cancelled())
        })
        .unwrap_or(false)
}

pub(crate) fn cancellation_token(turn_id: &str) -> Option<CancellationToken> {
    turn_cancellations()
        .lock()
        .ok()
        .and_then(|cancellations| cancellations.get(turn_id).cloned())
}

pub(crate) fn set_active_ui_message_id(session_id: &str, turn_id: &str, message_id: &str) {
    if let Ok(mut messages) = active_ui_messages().lock() {
        messages.insert(turn_key(session_id, turn_id), message_id.to_string());
    }
}

pub(crate) fn active_ui_message_id(session_id: &str, turn_id: &str) -> Option<String> {
    active_ui_messages()
        .lock()
        .ok()
        .and_then(|messages| messages.get(&turn_key(session_id, turn_id)).cloned())
}

pub(crate) fn clear_active_ui_message_id(session_id: &str, turn_id: &str) {
    if let Ok(mut messages) = active_ui_messages().lock() {
        messages.remove(&turn_key(session_id, turn_id));
    }
}

pub(crate) fn clear_active_ui_message_if_matches(session_id: &str, message_id: &str) {
    if let Ok(mut messages) = active_ui_messages().lock() {
        let prefix = format!("{session_id}:");
        messages.retain(|key, active_message_id| {
            !key.starts_with(&prefix) || active_message_id != message_id
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_phase_timings_survive_provider_metadata_updates() {
        let session_id = format!("session-{}", Uuid::new_v4());
        let turn_id = format!("turn-{}", Uuid::new_v4());
        append_turn_provider_attempt(&session_id, &turn_id, json!({"status":"success"}));
        for _ in 0..2 {
            drop(LocalPhaseTimer::start(
                &session_id,
                &turn_id,
                "contextAccounting",
            ));
        }
        record_turn_provider_metadata(
            &session_id,
            &turn_id,
            json!({"protocol":"chat-completions"}),
        );
        let metadata = take_turn_provider_metadata(&session_id, &turn_id).unwrap();
        assert_eq!(metadata["providerAttempts"][0]["status"], "success");
        assert_eq!(metadata["protocol"], "chat-completions");
        let stats = &metadata["localPhases"]["contextAccounting"];
        assert_eq!(stats["count"], 2);
        assert!(stats["totalMs"].as_f64().unwrap() >= stats["maxMs"].as_f64().unwrap());
        assert!(take_turn_provider_metadata(&session_id, &turn_id).is_none());
    }

    #[test]
    fn removing_a_draft_clears_only_its_matching_active_ui_anchor() {
        let session_id = format!("session-{}", Uuid::new_v4());
        let first_turn = format!("turn-{}", Uuid::new_v4());
        let second_turn = format!("turn-{}", Uuid::new_v4());
        set_active_ui_message_id(&session_id, &first_turn, "draft-1");
        set_active_ui_message_id(&session_id, &second_turn, "draft-2");

        clear_active_ui_message_if_matches(&session_id, "draft-1");

        assert_eq!(active_ui_message_id(&session_id, &first_turn), None);
        assert_eq!(
            active_ui_message_id(&session_id, &second_turn).as_deref(),
            Some("draft-2")
        );
        clear_active_ui_message_id(&session_id, &second_turn);
    }
}
