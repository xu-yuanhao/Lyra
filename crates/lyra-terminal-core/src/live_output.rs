//! Live terminal output buffering and UTF-8 projection.
//!
//! Uses `vte::Parser` to strip ANSI control sequences for the text projection
//! consumed by `read_session`. The raw byte buffer is preserved for xterm.js
//! scrollback replay.

use std::sync::{Arc, Condvar, Mutex};

use crate::MAX_SESSION_BUFFER_BYTES;

pub(crate) type SessionStateHandle = Arc<(Mutex<SessionOutputState>, Condvar)>;

#[derive(Default)]
pub(crate) struct SessionOutputState {
    pub(crate) buffer: Vec<u8>,
    pub(crate) retained_start: u64,
    pub(crate) total_bytes: u64,
    pub(crate) text_buffer: Vec<u8>,
    pub(crate) text_retained_start: u64,
    pub(crate) total_text_bytes: u64,
    pub(crate) text_decoder: Utf8StreamDecoder,
    /// Persistent VT parser (zed keeps one per terminal for the same reason):
    /// escape sequences that straddle PTY read chunks must survive into the
    /// next chunk instead of leaking as literal text.
    pub(crate) text_parser: vte::Parser,
    pub(crate) running: bool,
    pub(crate) exit_code: Option<i32>,
}

/// VtePerform collects printable text from a VT stream, dropping all CSI/OSC/DCS
/// escape sequences. Only `print` and line-mode `execute` bytes (\n, \r, \t) are kept.
struct VteTextCollector {
    out: String,
}

impl VteTextCollector {
    fn new() -> Self {
        Self { out: String::new() }
    }
}

impl vte::Perform for VteTextCollector {
    fn print(&mut self, c: char) {
        self.out.push(c);
    }

    fn execute(&mut self, byte: u8) {
        // ponytail: only keep whitespace control chars that affect text layout
        if byte == b'\n' || byte == b'\r' || byte == b'\t' {
            self.out.push(byte as char);
        }
    }
    // CSI / OSC / DCS / SGR / etc. — default no-op = discarded
}

#[derive(Default)]
pub(crate) struct Utf8StreamDecoder {
    pending: Vec<u8>,
}

impl Utf8StreamDecoder {
    pub(crate) fn decode(&mut self, chunk: &[u8]) -> String {
        if self.pending.is_empty() {
            return decode_utf8_prefix(chunk, &mut self.pending);
        }
        let mut bytes = Vec::with_capacity(self.pending.len() + chunk.len());
        bytes.extend_from_slice(&self.pending);
        bytes.extend_from_slice(chunk);
        self.pending.clear();
        decode_utf8_prefix(&bytes, &mut self.pending)
    }

    pub(crate) fn finish(&mut self) -> String {
        if self.pending.is_empty() {
            return String::new();
        }
        let text = String::from_utf8_lossy(&self.pending).to_string();
        self.pending.clear();
        text
    }
}

fn decode_utf8_prefix(bytes: &[u8], pending: &mut Vec<u8>) -> String {
    let mut output = String::new();
    let mut cursor = 0;
    while cursor < bytes.len() {
        match std::str::from_utf8(&bytes[cursor..]) {
            Ok(valid) => {
                output.push_str(valid);
                break;
            }
            Err(error) => {
                let valid_end = cursor + error.valid_up_to();
                if valid_end > cursor {
                    output.push_str(
                        std::str::from_utf8(&bytes[cursor..valid_end])
                            .expect("valid prefix from UTF-8 error"),
                    );
                }
                match error.error_len() {
                    Some(invalid_len) => {
                        output.push('\u{FFFD}');
                        cursor = valid_end + invalid_len;
                    }
                    None => {
                        pending.extend_from_slice(&bytes[valid_end..]);
                        break;
                    }
                }
            }
        }
    }
    output
}

pub(crate) fn new_running_state() -> SessionStateHandle {
    Arc::new((
        Mutex::new(SessionOutputState {
            running: true,
            ..SessionOutputState::default()
        }),
        Condvar::new(),
    ))
}

pub(crate) fn append_output(state_handle: &SessionStateHandle, data: &[u8]) {
    let (lock, condvar) = &**state_handle;
    if let Ok(mut state) = lock.lock() {
        state.buffer.extend_from_slice(data);
        state.total_bytes = state.total_bytes.saturating_add(data.len() as u64);
        if state.buffer.len() > MAX_SESSION_BUFFER_BYTES {
            let excess = state.buffer.len() - MAX_SESSION_BUFFER_BYTES;
            state.buffer.drain(0..excess);
            state.retained_start = state.retained_start.saturating_add(excess as u64);
        }
        let decoded = state.text_decoder.decode(data);
        let text = strip_live_terminal_control_sequences(&mut state, &decoded);
        state.text_buffer.extend_from_slice(text.as_bytes());
        state.total_text_bytes = state.total_text_bytes.saturating_add(text.len() as u64);
        if state.text_buffer.len() > MAX_SESSION_BUFFER_BYTES {
            let excess = state.text_buffer.len() - MAX_SESSION_BUFFER_BYTES;
            // Advance the drop point to a char boundary so the retained text
            // never starts with the tail of a split character.
            let mut drop = excess;
            while drop < state.text_buffer.len() && state.text_buffer[drop] & 0xC0 == 0x80 {
                drop += 1;
            }
            state.text_buffer.drain(0..drop);
            state.text_retained_start = state.text_retained_start.saturating_add(drop as u64);
        }
        condvar.notify_all();
    }
}

fn strip_live_terminal_control_sequences(state: &mut SessionOutputState, text: &str) -> String {
    let mut collector = VteTextCollector::new();
    for byte in text.as_bytes() {
        state.text_parser.advance(&mut collector, *byte);
    }
    collector.out
}

pub(crate) fn live_output_projection(
    state: &SessionOutputState,
    requested_cursor: u64,
    max_bytes: usize,
) -> (u64, String, bool) {
    let available_start = requested_cursor.max(state.text_retained_start);
    let start_offset = available_start
        .saturating_sub(state.text_retained_start)
        .min(state.text_buffer.len() as u64) as usize;
    // Byte-based cursors can land mid-character; walk both cut points back to
    // char boundaries so pagination never splits a Chinese character or emoji
    // (zed applies the same guard when truncating terminal output). A UTF-8
    // boundary is any position whose byte is not a continuation byte.
    let mut start_offset = start_offset.min(state.text_buffer.len());
    while start_offset > 0
        && start_offset < state.text_buffer.len()
        && state.text_buffer[start_offset] & 0xC0 == 0x80
    {
        start_offset -= 1;
    }
    let mut end_offset = (start_offset + max_bytes).min(state.text_buffer.len());
    while end_offset > start_offset
        && end_offset < state.text_buffer.len()
        && state.text_buffer[end_offset] & 0xC0 == 0x80
    {
        end_offset -= 1;
    }
    let output = String::from_utf8_lossy(&state.text_buffer[start_offset..end_offset]).to_string();
    let cursor = state.text_retained_start.saturating_add(end_offset as u64);
    let truncated = requested_cursor < state.text_retained_start || cursor < state.total_text_bytes;
    (cursor, output, truncated)
}

pub(crate) fn mark_session_exit(state_handle: &SessionStateHandle, exit_code: i32) {
    let (lock, condvar) = &**state_handle;
    if let Ok(mut state) = lock.lock() {
        state.running = false;
        state.exit_code = Some(exit_code);
        condvar.notify_all();
    }
}
