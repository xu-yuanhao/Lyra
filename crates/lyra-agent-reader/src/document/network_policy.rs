//! URL fetch policy and checked redirect handling.

use std::net::{IpAddr, ToSocketAddrs};
use std::time::Duration;

use crate::errors::ReaderError;
use crate::fetch::{FetchProvider, FetchRequest};

use super::security;

const DEFAULT_REDIRECT_LIMIT: usize = 5;
const DEFAULT_ACCEPT: &str =
    "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5";
// ponytail: Cloudflare's bot score refuses a request that carries only
// `user-agent` + `accept` (chatgpt.com answers 403 while the same UA through
// curl gets the page), so every fetch also identifies as a document
// navigation. Ceiling: this raises the score, it does not defeat a real
// interactive challenge - use engine=browser for those.
const NAVIGATION_HEADERS: &[(&str, &str)] = &[
    ("sec-fetch-dest", "document"),
    ("sec-fetch-mode", "navigate"),
    ("sec-fetch-site", "none"),
    ("sec-fetch-user", "?1"),
    ("upgrade-insecure-requests", "1"),
];

pub(super) fn fetch_with_checked_redirects(
    url: &str,
    options: &crate::types::ReaderOptions,
    provider: &dyn FetchProvider,
    user_agent: &str,
    timeout: Duration,
    max_bytes: usize,
) -> Result<crate::fetch::FetchResponse, ReaderError> {
    let mut current_url = url.to_string();
    for redirect_count in 0..=DEFAULT_REDIRECT_LIMIT {
        enforce_remote_url_policy(&current_url, options)?;
        let response = provider.fetch(&FetchRequest {
            url: &current_url,
            user_agent,
            accept: DEFAULT_ACCEPT,
            timeout,
            // Redirects are followed here so URL/IP policy runs before each hop.
            redirect_limit: 0,
            max_bytes,
            extra_headers: NAVIGATION_HEADERS,
            proxy: None,
        })?;
        if !is_http_redirect(response.status) {
            return Ok(response);
        }
        let Some(location) = header_value(&response.headers, "location") else {
            return Ok(response);
        };
        if redirect_count == DEFAULT_REDIRECT_LIMIT {
            return Err(ReaderError::Fetch {
                message: format!("too many redirects; last location: {location}"),
                final_url: Some(response.final_url),
                status: Some(response.status),
            });
        }
        let next_url = resolve_redirect_url(&current_url, &location)?;
        enforce_remote_url_policy(&next_url, options)?;
        current_url = next_url;
    }
    unreachable!("redirect loop always returns or errors within the redirect limit")
}

fn is_http_redirect(status: u16) -> bool {
    matches!(status, 301 | 302 | 303 | 307 | 308)
}

fn header_value(headers: &[(String, String)], name: &str) -> Option<String> {
    headers
        .iter()
        .find(|(header_name, _)| header_name.eq_ignore_ascii_case(name))
        .map(|(_, value)| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn resolve_redirect_url(base_url: &str, location: &str) -> Result<String, ReaderError> {
    let base = url::Url::parse(base_url).map_err(|error| ReaderError::Fetch {
        message: format!("invalid redirect base URL: {error}"),
        final_url: Some(base_url.to_string()),
        status: None,
    })?;
    base.join(location)
        .map(|url| url.to_string())
        .map_err(|error| ReaderError::Fetch {
            message: format!("invalid redirect location: {error}"),
            final_url: Some(base_url.to_string()),
            status: None,
        })
}

pub(super) fn enforce_remote_url_policy(
    raw_url: &str,
    options: &crate::types::ReaderOptions,
) -> Result<(), ReaderError> {
    let parsed = url::Url::parse(raw_url).map_err(|error| ReaderError::Fetch {
        message: format!("invalid URL: {error}"),
        final_url: Some(raw_url.to_string()),
        status: None,
    })?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(ReaderError::Fetch {
            message: format!("unsupported URL scheme: {}", parsed.scheme()),
            final_url: Some(raw_url.to_string()),
            status: None,
        });
    }
    if options.allow_private_network {
        return Ok(());
    }
    let Some(host) = parsed.host_str() else {
        return Ok(());
    };
    if host.eq_ignore_ascii_case("localhost") {
        return Err(private_network_error(raw_url));
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_private_or_local_ip(ip) {
            return Err(private_network_error(raw_url));
        }
        return Ok(());
    }
    let port = parsed.port_or_known_default().unwrap_or(443);
    if let Ok(addresses) = (host, port).to_socket_addrs() {
        for address in addresses {
            if is_private_or_local_ip(address.ip()) {
                return Err(private_network_error(raw_url));
            }
        }
    }
    Ok(())
}

fn private_network_error(raw_url: &str) -> ReaderError {
    ReaderError::Fetch {
        message: "remote URL resolved to a private, localhost, or link-local address".to_string(),
        final_url: Some(raw_url.to_string()),
        status: None,
    }
}

fn is_private_or_local_ip(ip: IpAddr) -> bool {
    security::blocks_untrusted_remote_ip(ip)
}

#[cfg(test)]
#[allow(clippy::expect_used, clippy::unwrap_used, unused_imports)]
mod tests {
    use super::*;
    use crate::document::test_support::*;
    use crate::document::{run, run_with_browser};
    use crate::errors::ReaderError;
    use crate::types::{
        BrowserSnapshotInput, ChunkingMode, ChunkingOptions, CitationFormat, ContentFilterMode,
        ExtractionMode, Format, HeadingStyle, ImageRetention, LinkRetention, MediaRetention,
        OverflowMode, ReaderEngine, ReaderInput, ReaderOptions, ReaderRequest, WarningCode,
    };

    #[test]
    fn remote_redirect_to_private_network_is_blocked_before_following() {
        let fetch = RedirectFetch::new("http://127.0.0.1/private");
        let request = ReaderRequest {
            input: ReaderInput::Url("https://public.test/start".to_string()),
            options: ReaderOptions::default(),
        };
        let error = run(&request, Some(&fetch)).expect_err("private redirect should be blocked");
        match error {
            ReaderError::Fetch {
                message, final_url, ..
            } => {
                assert!(message.contains("private"));
                assert_eq!(final_url.as_deref(), Some("http://127.0.0.1/private"));
            }
            other => panic!("unexpected error: {other:?}"),
        }
        assert_eq!(fetch.calls(), 1);
    }

    #[test]
    fn remote_redirect_is_followed_after_policy_check() {
        let fetch = RedirectFetch::new("/final");
        let request = ReaderRequest {
            input: ReaderInput::Url("https://public.test/start".to_string()),
            options: ReaderOptions::default(),
        };
        let result = run(&request, Some(&fetch)).expect("redirect result");
        assert_eq!(
            result.final_url.as_deref(),
            Some("https://public.test/final")
        );
        assert!(result.markdown_with_citations.contains("redirected body"));
        assert_eq!(fetch.calls(), 2);
    }

    #[test]
    fn fetch_carries_browser_navigation_headers() {
        struct RecordingFetch(std::cell::RefCell<Vec<(String, String)>>);

        impl FetchProvider for RecordingFetch {
            fn fetch(
                &self,
                request: &FetchRequest<'_>,
            ) -> Result<crate::fetch::FetchResponse, ReaderError> {
                self.0.borrow_mut().extend(
                    request
                        .extra_headers
                        .iter()
                        .map(|(name, value)| ((*name).to_string(), (*value).to_string())),
                );
                Ok(crate::fetch::FetchResponse {
                    final_url: request.url.to_string(),
                    status: 200,
                    content_type: Some("text/html".to_string()),
                    headers: Vec::new(),
                    body: b"<html><body><p>body</p></body></html>".to_vec(),
                })
            }
        }

        let fetch = RecordingFetch(std::cell::RefCell::new(Vec::new()));
        let request = ReaderRequest {
            input: ReaderInput::Url("https://public.test/page".to_string()),
            options: ReaderOptions::default(),
        };
        run(&request, Some(&fetch)).expect("fetch result");

        let headers = fetch.0.borrow();
        let has = |name: &str, value: Option<&str>| {
            headers
                .iter()
                .any(|(key, found)| key == name && value.is_none_or(|expected| found == expected))
        };
        assert!(has("sec-fetch-dest", Some("document")), "{headers:?}");
        assert!(has("sec-fetch-mode", Some("navigate")), "{headers:?}");
        assert!(has("sec-fetch-site", Some("none")), "{headers:?}");
        assert!(has("upgrade-insecure-requests", None), "{headers:?}");
    }
}
