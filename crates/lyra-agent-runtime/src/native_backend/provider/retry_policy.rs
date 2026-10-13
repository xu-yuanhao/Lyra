use super::*;

pub(crate) fn connection_establishment_failed(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderTransport {
            kind: ProviderTransportKind::Connect,
            ..
        }
    )
}
pub(crate) fn transport_retry_limit(error: &AgentRuntimeError) -> u8 {
    if connection_establishment_failed(error) {
        1
    } else {
        MAX_STREAM_TRANSPORT_RETRIES
    }
}

pub(crate) fn retry_after_milliseconds(headers: &reqwest::header::HeaderMap) -> Option<u64> {
    retry_after_milliseconds_at(headers, std::time::SystemTime::now())
}

pub(crate) fn retry_after_milliseconds_at(
    headers: &reqwest::header::HeaderMap,
    now: std::time::SystemTime,
) -> Option<u64> {
    fn number(value: &str, scale: f64) -> Option<u64> {
        let value = value.trim().parse::<f64>().ok()?;
        (value.is_finite() && value >= 0.0).then(|| (value * scale).ceil() as u64)
    }
    if let Some(ms) = headers
        .get("retry-after-ms")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| number(value, 1.0))
    {
        return Some(ms);
    }
    let value = headers.get(reqwest::header::RETRY_AFTER)?.to_str().ok()?;
    number(value, 1_000.0).or_else(|| {
        let date = httpdate::parse_http_date(value.trim()).ok()?;
        Some(
            date.duration_since(now)
                .unwrap_or_default()
                .as_millis()
                .min(u128::from(u64::MAX)) as u64,
        )
    })
}

#[cfg(test)]
pub(crate) fn sleep_before_provider_retry(
    attempt: u8,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<()> {
    crate::native_backend::turn_engine::block_on(sleep_before_provider_retry_async(
        attempt,
        cancellation,
    ))
}

pub(crate) async fn sleep_before_provider_retry_async(
    attempt: u8,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<()> {
    wait_for_provider_retry(provider_retry_delay(attempt, None), cancellation).await
}

pub(crate) const MAX_TRANSIENT_PROVIDER_RETRIES: u8 = 5;
const PROVIDER_RETRY_INITIAL_MS: u64 = 2_000;
const PROVIDER_RETRY_MAX_BACKOFF_MS: u64 = 30_000;

pub(crate) fn provider_retry_delay(attempt: u8, error: Option<&AgentRuntimeError>) -> Duration {
    provider_retry_delay_with_jitter(attempt, error, rand::random_range(0..=250))
}

fn provider_retry_delay_with_jitter(
    attempt: u8,
    error: Option<&AgentRuntimeError>,
    jitter_per_mille: u64,
) -> Duration {
    if let Some(wait) = error.and_then(super::retry_after_from_error) {
        return wait;
    }
    let base = PROVIDER_RETRY_INITIAL_MS
        .saturating_mul(2_u64.saturating_pow(attempt.saturating_sub(1).into()));
    let wait_ms = base
        .saturating_add(base.saturating_mul(jitter_per_mille.min(250)) / 1_000)
        .min(PROVIDER_RETRY_MAX_BACKOFF_MS);
    Duration::from_millis(wait_ms)
}

pub(crate) async fn wait_for_provider_retry(
    wait: Duration,
    cancellation: &CancellationToken,
) -> AgentRuntimeResult<()> {
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(AgentRuntimeError::Cancelled),
        _ = tokio::time::sleep(wait) => Ok(()),
    }
}

pub(crate) fn is_retryable_provider_error(error: &AgentRuntimeError) -> bool {
    matches!(
        error,
        AgentRuntimeError::ProviderFailure {
            failure: ProviderFailure {
                category: ProviderFailureCategory::RateLimit | ProviderFailureCategory::Server,
                ..
            }
        }
    )
}

#[cfg(test)]
mod retry_policy_tests {
    use super::*;

    #[test]
    fn backoff_grows_from_two_seconds_with_bounded_jitter() {
        for (attempt, base) in [
            (1, 2_000),
            (2, 4_000),
            (3, 8_000),
            (4, 16_000),
            (5, 30_000),
            (255, 30_000),
        ] {
            assert_eq!(
                provider_retry_delay_with_jitter(attempt, None, 0),
                Duration::from_millis(base)
            );
            let jittered = provider_retry_delay_with_jitter(attempt, None, 250);
            assert!(jittered >= Duration::from_millis(base));
            assert!(jittered <= Duration::from_millis((base * 5 / 4).min(30_000)));
        }
    }

    #[test]
    fn server_retry_after_overrides_backoff_including_waits_over_a_minute() {
        for ms in [0, 125, 90_000, u64::MAX] {
            let error = AgentRuntimeError::ProviderFailure {
                failure: ProviderFailure {
                    provider_id: "test".into(),
                    route_id: "test".into(),
                    http_status: Some(503),
                    provider_code: None,
                    provider_type: None,
                    retry_after_ms: Some(ms),
                    category: ProviderFailureCategory::Server,
                    message: "overloaded".into(),
                    body_preview: None,
                },
            };
            assert_eq!(
                provider_retry_delay_with_jitter(5, Some(&error), 250),
                Duration::from_millis(ms.min(i32::MAX as u64))
            );
        }
    }

    #[tokio::test]
    async fn cancellation_interrupts_a_pending_backoff() {
        let cancellation = CancellationToken::new();
        let cancel = cancellation.clone();
        tokio::spawn(async move {
            tokio::task::yield_now().await;
            cancel.cancel();
        });
        let result = tokio::time::timeout(
            Duration::from_secs(1),
            wait_for_provider_retry(Duration::from_secs(90), &cancellation),
        )
        .await
        .unwrap();
        assert!(matches!(result, Err(AgentRuntimeError::Cancelled)));
    }
}
