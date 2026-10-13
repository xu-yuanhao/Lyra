//! One SSE framing implementation for synchronous tests and async transports.
//! `data:` lines belong to an event, joined by newlines at a blank line or EOF.
use super::super::async_line_reader::AsyncLineReader;
use crate::{AgentRuntimeError, AgentRuntimeResult};
use bytes::Bytes;
use futures::Stream;
use serde_json::Value;
use std::io::{BufRead, Lines};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SseEvent {
    Data(Value),
    Done,
}

#[derive(Default)]
struct SseDecoder {
    data: Vec<String>,
}
impl SseDecoder {
    fn line(&mut self, line: &str) -> AgentRuntimeResult<Option<SseEvent>> {
        let line = line.trim_end_matches('\r').trim_start_matches('\u{feff}');
        if line.is_empty() {
            return self.finish();
        }
        if line.starts_with(':') {
            return Ok(None);
        }
        let (field, value) = line.split_once(':').unwrap_or((line, ""));
        if field == "data" {
            self.data
                .push(value.strip_prefix(' ').unwrap_or(value).to_string());
        }
        Ok(None)
    }
    fn finish(&mut self) -> AgentRuntimeResult<Option<SseEvent>> {
        if self.data.is_empty() {
            return Ok(None);
        }
        let data = std::mem::take(&mut self.data).join("\n");
        if data.trim().is_empty() {
            return Ok(None);
        }
        if data.trim() == "[DONE]" {
            return Ok(Some(SseEvent::Done));
        }
        serde_json::from_str(&data)
            .map(|data| Some(SseEvent::Data(data)))
            .map_err(|error| {
                AgentRuntimeError::Serialization(format!("invalid SSE event data: {error}"))
            })
    }
}

pub(crate) struct SseReader<R: BufRead> {
    lines: Lines<R>,
    decoder: SseDecoder,
    eof: bool,
}
impl<R: BufRead> SseReader<R> {
    pub(crate) fn new(reader: R) -> Self {
        Self {
            lines: reader.lines(),
            decoder: SseDecoder::default(),
            eof: false,
        }
    }
}
impl<R: BufRead> Iterator for SseReader<R> {
    type Item = AgentRuntimeResult<SseEvent>;
    fn next(&mut self) -> Option<Self::Item> {
        while !self.eof {
            let event = match self.lines.next() {
                Some(Ok(line)) => self.decoder.line(&line),
                Some(Err(error)) => {
                    self.eof = true;
                    return Some(Err(
                        crate::native_backend::provider::streaming_body_read_error(error),
                    ));
                }
                None => {
                    self.eof = true;
                    self.decoder.finish()
                }
            };
            match event {
                Ok(Some(event)) => return Some(Ok(event)),
                Err(error) => return Some(Err(error)),
                Ok(None) => {}
            }
        }
        None
    }
}

pub(crate) struct AsyncSseReader<S: Stream<Item = Result<Bytes, reqwest::Error>> + Unpin> {
    lines: AsyncLineReader<S>,
    decoder: SseDecoder,
    eof: bool,
}
impl<S: Stream<Item = Result<Bytes, reqwest::Error>> + Unpin> AsyncSseReader<S> {
    pub(crate) fn new(stream: S) -> Self {
        Self {
            lines: AsyncLineReader::new(stream),
            decoder: SseDecoder::default(),
            eof: false,
        }
    }
    pub(crate) async fn next_event(
        &mut self,
        cancellation: &CancellationToken,
    ) -> Option<AgentRuntimeResult<SseEvent>> {
        while !self.eof {
            let line = tokio::select! {
                biased;
                _ = cancellation.cancelled() => return Some(Err(AgentRuntimeError::Cancelled)),
                line = self.lines.next_line() => line,
            };
            let event = match line {
                Some(Ok(line)) => self.decoder.line(&line),
                Some(Err(error)) => {
                    self.eof = true;
                    return Some(Err(error));
                }
                None => {
                    self.eof = true;
                    self.decoder.finish()
                }
            };
            match event {
                Ok(Some(event)) => return Some(Ok(event)),
                Err(error) => return Some(Err(error)),
                Ok(None) => {}
            }
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[tokio::test]
    async fn sync_and_async_share_multiline_crlf_utf8_and_eof_framing() {
        let data = "\u{feff}: ping\r\nevent: message\r\ndata: {\r\ndata: \"text\":\"中文\"}\r\n\r\ndata: [DONE]";
        let expected = vec![SseEvent::Data(json!({"text":"中文"})), SseEvent::Done];
        let sync = SseReader::new(std::io::Cursor::new(data))
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(sync, expected);
        for size in 1..=data.len() {
            let chunks = data
                .as_bytes()
                .chunks(size)
                .map(|chunk| Ok(Bytes::copy_from_slice(chunk)))
                .collect::<Vec<_>>();
            let mut reader = AsyncSseReader::new(futures::stream::iter(chunks));
            let mut events = Vec::new();
            while let Some(event) = reader.next_event(&CancellationToken::new()).await {
                events.push(event.unwrap());
            }
            assert_eq!(events, expected, "chunk size {size}");
        }
    }
    #[tokio::test]
    async fn cancellation_releases_a_stalled_sse_body() {
        let mut reader = AsyncSseReader::new(futures::stream::pending());
        let cancellation = CancellationToken::new();
        cancellation.cancel();
        assert!(matches!(
            reader.next_event(&cancellation).await,
            Some(Err(AgentRuntimeError::Cancelled))
        ));
    }
}
