use super::*;

use std::collections::{BTreeMap, BTreeSet};

use chrono::{Duration as ChronoDuration, NaiveDate};
use chrono_tz::Tz;

const DEFAULT_RANGE_DAYS: i64 = 365;
const MIN_RANGE_DAYS: i64 = 28;
const MAX_RANGE_DAYS: i64 = 730;
const TOP_MODEL_LIMIT: usize = 8;

#[derive(Default)]
struct TokenTotals {
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    reasoning: u64,
}

#[derive(Default)]
struct DailyUsage {
    reported_tokens: u64,
    reported_turns: u64,
}

pub(crate) fn read_usage_stats(payload: Value) -> AgentRuntimeResult<Value> {
    let time_zone = payload
        .get("timeZone")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("UTC");
    let tz = time_zone
        .parse::<Tz>()
        .map_err(|_| AgentRuntimeError::Core(format!("Unsupported IANA time zone: {time_zone}")))?;
    let range_days = payload
        .get("rangeDays")
        .and_then(Value::as_i64)
        .unwrap_or(DEFAULT_RANGE_DAYS)
        .clamp(MIN_RANGE_DAYS, MAX_RANGE_DAYS);
    let generated_at = Utc::now();
    let today = generated_at.with_timezone(&tz).date_naive();
    let mut runtime_state = state()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("agent runtime state lock failed".to_string()))?;
    let ids = runtime_state.sessions.keys().cloned().collect::<Vec<_>>();
    for id in ids {
        runtime_state.ensure_dialog(&id)?;
    }
    let sessions = runtime_state.sessions.values().collect::<Vec<_>>();
    Ok(aggregate_usage_stats(
        &sessions,
        tz,
        range_days,
        today,
        generated_at.to_rfc3339_opts(SecondsFormat::Millis, true),
    ))
}

fn aggregate_usage_stats(
    sessions: &[&NativeSession],
    tz: Tz,
    range_days: i64,
    today: NaiveDate,
    generated_at: String,
) -> Value {
    let mut session_count = 0_u64;
    let mut message_count = 0_u64;
    let mut turn_count = 0_u64;
    let mut eligible_turn_count = 0_u64;
    let mut reported_turn_count = 0_u64;
    let mut incomplete_turn_count = 0_u64;
    let mut token_totals = TokenTotals::default();
    let mut longest_turn_seconds = 0_u64;
    let mut active_dates = BTreeSet::new();
    let mut daily_usage: BTreeMap<NaiveDate, DailyUsage> = BTreeMap::new();
    let mut model_calls: BTreeMap<(String, String), u64> = BTreeMap::new();

    for session in sessions {
        if session.ephemeral || is_deleted(&session.snapshot) {
            continue;
        }
        session_count = session_count.saturating_add(1);

        let mut has_undated_user_message = false;
        if let Some(messages) = session.snapshot.get("messages").and_then(Value::as_array) {
            for message in messages {
                let role = message.get("role").and_then(Value::as_str);
                if role == Some("user")
                    || (role == Some("assistant")
                        && assistant_message_has_visible_timeline_content(message))
                {
                    message_count = message_count.saturating_add(1);
                }
                if role == Some("user") {
                    if let Some(date) = message
                        .get("createdAt")
                        .and_then(Value::as_str)
                        .and_then(|value| local_date(value, tz))
                    {
                        active_dates.insert(date);
                    } else {
                        has_undated_user_message = true;
                    }
                }
            }
        }

        if has_undated_user_message {
            active_dates.extend(
                session
                    .runtime_turns
                    .iter()
                    .filter_map(|turn| turn.get("startedAtIso").and_then(Value::as_str))
                    .filter_map(|value| local_date(value, tz)),
            );
        }

        for turn in &session.runtime_turns {
            turn_count = turn_count.saturating_add(1);
            let metadata = turn.get("providerMetadata");
            let attempts = metadata
                .and_then(|value| value.get("providerAttempts"))
                .and_then(Value::as_array);
            let usage = metadata
                .and_then(|value| value.get("providerUsage"))
                .filter(|value| value.is_object());
            if attempts.is_some_and(|values| !values.is_empty()) || usage.is_some() {
                eligible_turn_count = eligible_turn_count.saturating_add(1);
            }

            for attempt in attempts
                .into_iter()
                .flatten()
                .filter(|attempt| successful_attempt(attempt))
            {
                let Some(model) = attempt.get("model").and_then(Value::as_str) else {
                    continue;
                };
                let provider = attempt
                    .get("providerId")
                    .and_then(Value::as_str)
                    .unwrap_or("unknown");
                *model_calls
                    .entry((provider.to_string(), model.to_string()))
                    .or_default() += 1;
            }

            if turn.get("state").and_then(Value::as_str) == Some("completed")
                && let (Some(started), Some(completed)) = (
                    turn.get("startedAtMs").and_then(Value::as_i64),
                    turn.get("completedAtMs").and_then(Value::as_i64),
                )
                && completed >= started
            {
                longest_turn_seconds =
                    longest_turn_seconds.max(((completed - started) as u64) / 1_000);
            }

            let Some(usage) = usage else {
                continue;
            };
            reported_turn_count = reported_turn_count.saturating_add(1);
            if usage
                .get("telemetryIncomplete")
                .and_then(Value::as_bool)
                .unwrap_or(false)
            {
                incomplete_turn_count = incomplete_turn_count.saturating_add(1);
            }
            let input = usage_u64(usage, "inputTotal");
            let output = usage_u64(usage, "output");
            token_totals.input = token_totals.input.saturating_add(input);
            token_totals.output = token_totals.output.saturating_add(output);
            token_totals.cache_read = token_totals
                .cache_read
                .saturating_add(usage_u64(usage, "cacheRead"));
            token_totals.cache_write = token_totals
                .cache_write
                .saturating_add(usage_u64(usage, "cacheWrite"));
            token_totals.reasoning = token_totals
                .reasoning
                .saturating_add(usage_u64(usage, "reasoning"));
            let date = turn
                .get("completedAtIso")
                .and_then(Value::as_str)
                .or_else(|| turn.get("startedAtIso").and_then(Value::as_str))
                .and_then(|value| local_date(value, tz));
            if let Some(date) = date {
                let daily = daily_usage.entry(date).or_default();
                daily.reported_tokens = daily
                    .reported_tokens
                    .saturating_add(input.saturating_add(output));
                daily.reported_turns = daily.reported_turns.saturating_add(1);
            }
        }
    }

    let peak_daily_tokens = daily_usage
        .values()
        .map(|usage| usage.reported_tokens)
        .max()
        .unwrap_or(0);
    let (current_streak_days, longest_streak_days) = streaks(&active_dates, today);
    let range_start = today - ChronoDuration::days(range_days.saturating_sub(1));
    let daily_buckets = (0..range_days)
        .map(|offset| {
            let date = range_start + ChronoDuration::days(offset);
            let usage = daily_usage.get(&date);
            json!({
                "date": date.format("%Y-%m-%d").to_string(),
                "reportedTokens": usage.map(|value| value.reported_tokens).unwrap_or(0),
                "reportedTurns": usage.map(|value| value.reported_turns).unwrap_or(0),
                "active": active_dates.contains(&date),
            })
        })
        .collect::<Vec<_>>();
    let mut top_models = model_calls
        .into_iter()
        .map(|((provider_id, model_id), successful_calls)| {
            (successful_calls, provider_id, model_id)
        })
        .collect::<Vec<_>>();
    top_models.sort_by(|left, right| {
        right
            .0
            .cmp(&left.0)
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| left.1.cmp(&right.1))
    });
    top_models.truncate(TOP_MODEL_LIMIT);

    json!({
        "scope": "device",
        "generatedAt": generated_at,
        "timeZone": tz.name(),
        "range": {
            "startDate": range_start.format("%Y-%m-%d").to_string(),
            "endDate": today.format("%Y-%m-%d").to_string(),
            "days": range_days,
        },
        "totals": {
            "sessions": session_count,
            "messages": message_count,
            "turns": turn_count,
            "activeDays": active_dates.len(),
            "reportedTokens": token_totals.input.saturating_add(token_totals.output),
            "inputTokens": token_totals.input,
            "outputTokens": token_totals.output,
            "cacheReadTokens": token_totals.cache_read,
            "cacheWriteTokens": token_totals.cache_write,
            "reasoningTokens": token_totals.reasoning,
        },
        "coverage": {
            "eligibleTurns": eligible_turn_count,
            "reportedTurns": reported_turn_count,
            "incompleteTurns": incomplete_turn_count,
        },
        "peakDailyTokens": peak_daily_tokens,
        "longestTurnSeconds": longest_turn_seconds,
        "currentStreakDays": current_streak_days,
        "longestStreakDays": longest_streak_days,
        "dailyBuckets": daily_buckets,
        "topModels": top_models.into_iter().map(|(successful_calls, provider_id, model_id)| json!({
            "providerId": provider_id,
            "modelId": model_id,
            "successfulCalls": successful_calls,
        })).collect::<Vec<_>>(),
    })
}

fn local_date(value: &str, tz: Tz) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&tz).date_naive())
}

fn usage_u64(usage: &Value, key: &str) -> u64 {
    usage.get(key).and_then(Value::as_u64).unwrap_or(0)
}

fn successful_attempt(attempt: &Value) -> bool {
    if attempt
        .get("errorCategory")
        .is_some_and(|value| !value.is_null())
    {
        return false;
    }
    matches!(
        attempt.get("outcome").and_then(Value::as_str),
        Some("visible_final" | "visible_max_tokens" | "tool_use")
    )
}

fn streaks(active_dates: &BTreeSet<NaiveDate>, today: NaiveDate) -> (u64, u64) {
    let mut longest = 0_u64;
    let mut run = 0_u64;
    let mut previous = None;
    for date in active_dates {
        run = if previous.is_some_and(|value| *date == value + ChronoDuration::days(1)) {
            run.saturating_add(1)
        } else {
            1
        };
        longest = longest.max(run);
        previous = Some(*date);
    }
    let latest = active_dates.last().copied();
    if !latest.is_some_and(|date| date == today || date == today - ChronoDuration::days(1)) {
        return (0, longest);
    }
    let mut current = 0_u64;
    let mut expected = latest;
    for date in active_dates.iter().rev() {
        if Some(*date) != expected {
            break;
        }
        current = current.saturating_add(1);
        expected = Some(*date - ChronoDuration::days(1));
    }
    (current, longest)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_session(messages: Vec<Value>, turns: Vec<Value>) -> NativeSession {
        NativeSession {
            id: "session-1".to_string(),
            snapshot: json!({ "messages": messages }),
            created_at: "2026-08-01T00:00:00Z".to_string(),
            saved: false,
            save_label: None,
            archived: false,
            custom_title: None,
            short_name: None,
            runtime_turns: turns,
            rollback_checkpoints: Vec::new(),
            file_read_state: HashMap::new(),
            provider_protocol_log: vec![],
            dirty: false,
            dialog_dirty_from: None,
            persisted_dialog_len: 0,
            dialog_loaded: true,
            ephemeral: false,
            stream_journal_sequence: 0,
        }
    }

    fn empty_test_session(id: &str) -> NativeSession {
        let mut session = test_session(Vec::new(), Vec::new());
        session.id = id.to_string();
        session
    }

    #[test]
    fn aggregates_reported_usage_without_double_counting_cache_or_reasoning() {
        let session = test_session(
            vec![json!({ "role": "user", "createdAt": "2026-08-13T23:30:00Z" })],
            vec![json!({
                "state": "completed",
                "startedAtMs": 1_000,
                "completedAtMs": 121_000,
                "startedAtIso": "2026-08-13T23:30:00Z",
                "completedAtIso": "2026-08-13T23:32:00Z",
                "providerMetadata": {
                    "providerUsage": {
                        "inputTotal": 100,
                        "output": 20,
                        "cacheRead": 80,
                        "cacheWrite": 5,
                        "reasoning": 7,
                        "telemetryIncomplete": false
                    },
                    "providerAttempts": [{
                        "providerId": "provider-a",
                        "model": "model-a",
                        "outcome": "visible_final",
                        "errorCategory": null
                    }]
                }
            })],
        );
        let result = aggregate_usage_stats(
            &[&session],
            chrono_tz::Asia::Shanghai,
            28,
            NaiveDate::from_ymd_opt(2026, 8, 14).unwrap(),
            "2026-08-14T00:00:00Z".to_string(),
        );

        assert_eq!(result["totals"]["reportedTokens"], 120);
        assert_eq!(result["totals"]["cacheReadTokens"], 80);
        assert_eq!(result["totals"]["reasoningTokens"], 7);
        assert_eq!(result["longestTurnSeconds"], 120);
        assert_eq!(result["currentStreakDays"], 1);
        assert_eq!(result["topModels"][0]["modelId"], "model-a");
        assert_eq!(result["dailyBuckets"][27]["reportedTokens"], 120);
    }

    #[test]
    fn reports_missing_and_partial_telemetry_without_estimating_tokens() {
        let session = test_session(
            Vec::new(),
            vec![
                json!({
                    "state": "interrupted",
                    "startedAtMs": 1_000,
                    "completedAtMs": 301_000,
                    "startedAtIso": "2026-08-12T00:00:00Z",
                    "providerMetadata": { "providerAttempts": [{
                        "providerId": "provider-a", "model": "model-a",
                        "outcome": "transport_error", "errorCategory": "transport"
                    }] }
                }),
                json!({
                    "startedAtIso": "2026-08-13T00:00:00Z",
                    "providerMetadata": {
                        "providerUsage": { "inputTotal": 10, "output": 2, "telemetryIncomplete": true },
                        "providerAttempts": [{
                            "providerId": "provider-b", "model": "model-b",
                            "outcome": "visible_final", "errorCategory": null
                        }]
                    }
                }),
            ],
        );
        let result = aggregate_usage_stats(
            &[&session],
            chrono_tz::UTC,
            28,
            NaiveDate::from_ymd_opt(2026, 8, 14).unwrap(),
            "2026-08-14T00:00:00Z".to_string(),
        );

        assert_eq!(result["coverage"]["eligibleTurns"], 2);
        assert_eq!(result["coverage"]["reportedTurns"], 1);
        assert_eq!(result["coverage"]["incompleteTurns"], 1);
        assert_eq!(result["totals"]["reportedTokens"], 12);
        assert_eq!(result["topModels"].as_array().unwrap().len(), 1);
        assert_eq!(result["longestTurnSeconds"], 0);
    }

    #[test]
    fn calculates_current_and_longest_streaks() {
        let active = [
            NaiveDate::from_ymd_opt(2026, 8, 1).unwrap(),
            NaiveDate::from_ymd_opt(2026, 8, 2).unwrap(),
            NaiveDate::from_ymd_opt(2026, 8, 4).unwrap(),
            NaiveDate::from_ymd_opt(2026, 8, 5).unwrap(),
            NaiveDate::from_ymd_opt(2026, 8, 6).unwrap(),
        ]
        .into_iter()
        .collect();
        assert_eq!(
            streaks(&active, NaiveDate::from_ymd_opt(2026, 8, 7).unwrap()),
            (3, 3)
        );
        assert_eq!(
            streaks(&active, NaiveDate::from_ymd_opt(2026, 8, 9).unwrap()),
            (0, 3)
        );
    }

    #[test]
    fn excludes_deleted_and_ephemeral_sessions_but_keeps_archived_sessions() {
        let mut archived = empty_test_session("archived");
        archived.archived = true;
        archived.snapshot["messages"] = json!([{
            "role": "user",
            "createdAt": "2026-08-14T00:00:00Z",
            "text": "secret transcript content"
        }, {
            "role": "assistant",
            "reasoning": "hidden assistant content"
        }]);
        archived.snapshot["workingDir"] = json!("/secret/project");
        let mut deleted = empty_test_session("deleted");
        deleted.snapshot["turnStatus"] = json!("deleted");
        let mut ephemeral = empty_test_session("ephemeral");
        ephemeral.ephemeral = true;

        let result = aggregate_usage_stats(
            &[&archived, &deleted, &ephemeral],
            chrono_tz::UTC,
            28,
            NaiveDate::from_ymd_opt(2026, 8, 14).unwrap(),
            "2026-08-14T00:00:00Z".to_string(),
        );

        assert_eq!(result["totals"]["sessions"], 1);
        assert_eq!(result["totals"]["messages"], 1);
        let serialized = result.to_string();
        assert!(!serialized.contains("secret transcript content"));
        assert!(!serialized.contains("/secret/project"));
        assert!(!serialized.contains("providerAttempts"));
    }
}
