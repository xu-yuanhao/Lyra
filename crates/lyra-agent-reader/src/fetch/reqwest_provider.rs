//! Blocking reqwest-backed [`FetchProvider`].
//!
//! Blocking is deliberate: the existing `web_fetch` tool path is synchronous and
//! runs on a tool thread, so a blocking client keeps behaviour consistent and
//! avoids dragging an async runtime into this crate.

use std::io::Read;

use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, CONTENT_TYPE, HeaderName, HeaderValue, USER_AGENT};

use super::{FetchProvider, FetchRequest, FetchResponse};
use crate::errors::ReaderError;

/// A [`FetchProvider`] built on `reqwest::blocking`.
#[derive(Debug, Default, Clone)]
pub struct ReqwestFetchProvider;

impl ReqwestFetchProvider {
    /// Create a new provider.
    pub fn new() -> Self {
        Self
    }
}

/// Headers worth surfacing to callers (lowercased names).
const RETAINED_HEADERS: &[&str] = &[
    "content-type",
    "content-length",
    "content-language",
    "last-modified",
    "etag",
    "location",
];

impl FetchProvider for ReqwestFetchProvider {
    fn fetch(&self, request: &FetchRequest<'_>) -> Result<FetchResponse, ReaderError> {
        let redirect_policy = if request.redirect_limit == 0 {
            reqwest::redirect::Policy::none()
        } else {
            reqwest::redirect::Policy::limited(request.redirect_limit)
        };
        let mut builder = Client::builder()
            .timeout(request.timeout)
            .redirect(redirect_policy);
        if let Some(proxy) = request.proxy
            && !proxy.trim().is_empty()
        {
            builder =
                builder.proxy(
                    reqwest::Proxy::all(proxy).map_err(|error| ReaderError::Fetch {
                        message: format!("invalid proxy URL: {error}"),
                        final_url: Some(request.url.to_string()),
                        status: None,
                    })?,
                );
        }
        let client = builder.build().map_err(|error| ReaderError::Fetch {
            message: format!("failed to build http client: {error}"),
            final_url: None,
            status: None,
        })?;

        let mut request_builder = client
            .get(request.url)
            .header(USER_AGENT, request.user_agent)
            .header(ACCEPT, request.accept);
        for (name, value) in request.extra_headers {
            let Ok(name) = HeaderName::from_bytes(name.as_bytes()) else {
                continue;
            };
            let Ok(value) = HeaderValue::from_str(value) else {
                continue;
            };
            request_builder = request_builder.header(name, value);
        }

        let response = request_builder.send().map_err(|error| ReaderError::Fetch {
            message: format!("request failed: {}", describe_reqwest_error(&error)),
            final_url: Some(request.url.to_string()),
            status: None,
        })?;

        let status = response.status().as_u16();
        let final_url = response.url().to_string();
        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);

        if matches!(status, 401 | 403 | 451) {
            return Err(ReaderError::AccessDenied {
                status,
                final_url,
                content_type,
            });
        }

        let mut headers = Vec::new();
        for name in RETAINED_HEADERS {
            if let Some(value) = response.headers().get(*name)
                && let Ok(text) = value.to_str()
            {
                headers.push(((*name).to_string(), text.to_string()));
            }
        }

        let body = read_capped(response, request.max_bytes, &final_url, status)?;

        Ok(FetchResponse {
            final_url,
            status,
            content_type,
            headers,
            body,
        })
    }
}

/// Render a reqwest error together with its cause chain.
///
/// `reqwest::Error`'s own `Display` stops at the failure kind, so DNS, TLS,
/// timeout and connection-reset failures all read
/// "error sending request for url (…)". The cause that distinguishes them lives
/// in `source()`, and dropping it leaves the failure undiagnosable.
fn describe_reqwest_error(error: &reqwest::Error) -> String {
    let mut message = error.to_string();
    let mut cause = std::error::Error::source(error);
    for _ in 0..8 {
        let Some(current) = cause else {
            break;
        };
        let text = current.to_string();
        if !text.is_empty() && !message.contains(&text) {
            message.push_str(": ");
            message.push_str(&text);
        }
        cause = current.source();
    }
    message
}

/// Read up to `max_bytes` from the response body, stopping early once exceeded.
fn read_capped(
    response: reqwest::blocking::Response,
    max_bytes: usize,
    final_url: &str,
    status: u16,
) -> Result<Vec<u8>, ReaderError> {
    // Read one byte past the cap so we can tell "exactly at cap" from "over".
    let mut limited = response.take((max_bytes as u64).saturating_add(1));
    let mut buffer = Vec::new();
    limited
        .read_to_end(&mut buffer)
        .map_err(|error| ReaderError::Fetch {
            message: format!("failed to read response body: {error}"),
            final_url: Some(final_url.to_string()),
            status: Some(status),
        })?;
    if buffer.len() > max_bytes {
        return Err(ReaderError::Fetch {
            message: format!("response body exceeded maxBytes limit of {max_bytes} bytes"),
            final_url: Some(final_url.to_string()),
            status: Some(status),
        });
    }
    Ok(buffer)
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used, unused_imports)]
mod tests {
    use super::*;
    use crate::fetch::FetchRequest;

    #[test]
    fn request_failure_keeps_the_underlying_cause() {
        // Bind and drop a listener so the port is closed but known.
        let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("bind loopback");
        let port = listener.local_addr().expect("local addr").port();
        drop(listener);

        let error = ReqwestFetchProvider::new()
            .fetch(&FetchRequest {
                url: &format!("http://127.0.0.1:{port}/"),
                user_agent: "Lyra Agent/0.1",
                accept: "text/html",
                timeout: std::time::Duration::from_secs(5),
                redirect_limit: 0,
                max_bytes: 1024,
                extra_headers: &[],
                proxy: None,
            })
            .expect_err("a closed port must fail");

        let ReaderError::Fetch { message, .. } = error else {
            panic!("expected a transport failure, got {error:?}");
        };
        assert!(message.contains("error sending request"), "{message}");
        assert!(
            message.to_ascii_lowercase().contains("connection refused")
                || message.to_ascii_lowercase().contains("connect"),
            "cause missing from {message}"
        );
    }
}
