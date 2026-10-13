//! The text channel carries prose and examples, never executable tools.
//! Vendor tool markup may be removed for display; no arguments are inferred.
use regex::Regex;
use std::sync::OnceLock;

pub(crate) fn scrub_tool_markup(content: &str) -> String {
    static PATTERNS: OnceLock<Vec<Regex>> = OnceLock::new();
    let patterns = PATTERNS.get_or_init(|| {
        ["tool_calls", "tool_call", "function_call", "function_calls"]
            .iter()
            .map(|tag| {
                Regex::new(&format!(
                    r"(?is)<(?:[｜|]*DSML[｜|]*)?{tag}\b[^>]*>.*?</(?:[｜|]*DSML[｜|]*)?{tag}\s*>"
                ))
                .expect("fixed markup regex")
            })
            .collect()
    });
    let mut visible = String::new();
    let mut prose = String::new();
    let mut fence: Option<&str> = None;
    let flush = |prose: &mut String, visible: &mut String| {
        let mut text = std::mem::take(prose);
        for pattern in patterns {
            text = pattern.replace_all(&text, "").into_owned();
        }
        visible.push_str(&text);
    };
    for line in content.split_inclusive('\n') {
        let trimmed = line.trim_start();
        let marker = if trimmed.starts_with("```") {
            Some("```")
        } else if trimmed.starts_with("~~~") {
            Some("~~~")
        } else {
            None
        };
        if let Some(marker) = marker {
            flush(&mut prose, &mut visible);
            if fence == Some(marker) {
                fence = None;
            } else if fence.is_none() {
                fence = Some(marker);
            }
            visible.push_str(line);
        } else if fence.is_some() {
            visible.push_str(line);
        } else {
            prose.push_str(line);
        }
    }
    flush(&mut prose, &mut visible);
    visible
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn prose_and_bare_json_examples_remain_text() {
        let text = "I will explain this example: {\"command\":\"rm -rf example\"}";
        assert_eq!(scrub_tool_markup(text), text);
    }
    #[test]
    fn markup_is_removed_without_becoming_an_executable_call() {
        let text =
            "Before <tool_calls><invoke name=\"exec_command\">anything</invoke></tool_calls> after";
        assert_eq!(scrub_tool_markup(text), "Before  after");
        let example = "```xml\n<tool_calls>example</tool_calls>\n```";
        assert_eq!(scrub_tool_markup(example), example);
    }
}
