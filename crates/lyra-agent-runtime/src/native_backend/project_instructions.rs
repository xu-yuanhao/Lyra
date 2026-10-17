//! Project instruction file discovery for the stable system prefix.
//!
//! Finds `AGENTS.override.md` > `AGENTS.md` > `CLAUDE.md` from the session's
//! working directory up to (and including) the nearest git root, nearest
//! directory first, and renders the collected files under a shared character
//! budget. Every failure is fail-open: a missing, unreadable, non-UTF-8, or
//! empty file is simply absent from the result.
//!
//! v1 notes: each candidate file is read whole before the budget applies at
//! render time, discovery runs per request with no watcher (a changed file
//! rotates the stable prefix once on the next request), and there is no
//! global (~/.config/lyra) instruction file.

use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

pub(crate) const PROJECT_INSTRUCTIONS_BUDGET_CHARS: usize = 32 * 1024;

const INSTRUCTION_FILE_CANDIDATES: [&str; 3] = ["AGENTS.override.md", "AGENTS.md", "CLAUDE.md"];

pub(crate) struct ProjectInstructionFile {
    pub path: String,
    pub content: String,
}

/// Mirrors `active_skill_prompt_for_project`: a home-bound session (None),
/// a blank root, or a root with no instruction files yields an empty prompt.
pub(crate) fn project_instructions_prompt(project_root: Option<&str>) -> String {
    let Some(root) = project_root.map(str::trim).filter(|root| !root.is_empty()) else {
        return String::new();
    };
    let files = discover_instruction_files(root);
    if files.is_empty() {
        return String::new();
    }
    render_instruction_files_with_budget(&files, PROJECT_INSTRUCTIONS_BUDGET_CHARS)
}

/// Walks from the working directory to the nearest git root (inclusive),
/// nearest directory first. Without a git root only the working directory is
/// considered. Duplicate files are dropped by canonical path and by
/// normalized content hash, keeping the nearest occurrence.
fn discover_instruction_files(root: &str) -> Vec<ProjectInstructionFile> {
    let start = Path::new(root);
    if !start.is_dir() {
        return Vec::new();
    }
    let mut dirs = vec![start.to_path_buf()];
    if let Some(git_root) = find_git_root(start) {
        let mut ancestor = start.to_path_buf();
        while ancestor != git_root {
            let Some(parent) = ancestor.parent() else {
                break;
            };
            dirs.push(parent.to_path_buf());
            ancestor = parent.to_path_buf();
        }
    }
    let mut files: Vec<ProjectInstructionFile> = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();
    let mut seen_hashes: HashSet<String> = HashSet::new();
    for dir in dirs {
        let Some(file) = first_non_empty_candidate(&dir) else {
            continue;
        };
        let path_key = std::fs::canonicalize(&file.path)
            .map(|canonical| canonical.to_string_lossy().to_string())
            .unwrap_or_else(|_| file.path.clone());
        if !seen_paths.insert(path_key) || !seen_hashes.insert(content_hash(&file.content)) {
            continue;
        }
        files.push(file);
    }
    files
}

fn find_git_root(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    loop {
        if current.join(".git").exists() {
            return Some(current);
        }
        current = current.parent()?.to_path_buf();
    }
}

/// First non-empty candidate in one directory; unreadable, non-UTF-8, and
/// empty files count as absent, falling through to the next candidate.
fn first_non_empty_candidate(dir: &Path) -> Option<ProjectInstructionFile> {
    for candidate in INSTRUCTION_FILE_CANDIDATES {
        let path = dir.join(candidate);
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        if content.trim().is_empty() {
            continue;
        }
        return Some(ProjectInstructionFile {
            path: path.to_string_lossy().to_string(),
            content,
        });
    }
    None
}

/// Joins one block per file (`--- path ---` + content) with the budget spent
/// on injected content characters only. The first file that exceeds the
/// remaining budget is truncated with a visible `[truncated]` marker; files
/// beyond the budget are folded into a single note line.
fn render_instruction_files_with_budget(files: &[ProjectInstructionFile], budget: usize) -> String {
    let mut blocks: Vec<String> = Vec::new();
    let mut omitted: Vec<&str> = Vec::new();
    let mut remaining = budget;
    for file in files {
        let content = file.content.trim();
        let char_count = content.chars().count();
        if char_count == 0 {
            continue;
        }
        if char_count <= remaining {
            remaining -= char_count;
            blocks.push(format!("--- {} ---\n{content}", file.path));
        } else if remaining > 0 {
            let visible: String = content.chars().take(remaining).collect();
            remaining = 0;
            blocks.push(format!("--- {} ---\n{visible}\n[truncated]", file.path));
        } else {
            omitted.push(file.path.as_str());
        }
    }
    let mut rendered = blocks.join("\n\n");
    if !omitted.is_empty() {
        rendered.push_str(&format!(
            "\n\nProject instruction files beyond the character budget, not included: {}",
            omitted.join(", ")
        ));
    }
    rendered
}

/// Dedup key only: CRLF and surrounding whitespace are normalized away.
fn content_hash(content: &str) -> String {
    let normalized = content.replace("\r\n", "\n");
    let mut hasher = Sha256::new();
    hasher.update(normalized.trim().as_bytes());
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write(dir: &Path, name: &str, content: &str) {
        std::fs::write(dir.join(name), content).expect("write instruction file");
    }

    fn make_git_root(dir: &Path) {
        std::fs::create_dir(dir.join(".git")).expect("create fake git root");
    }

    // --- render_instruction_files_with_budget ---

    #[test]
    fn render_truncates_at_budget_and_folds_remaining_files_into_note() {
        let files = vec![
            ProjectInstructionFile {
                path: "/a/AGENTS.md".to_string(),
                content: "aaaaaaaaaa\n".to_string(),
            },
            ProjectInstructionFile {
                path: "/b/AGENTS.md".to_string(),
                content: "bbbbbbbbbb".to_string(),
            },
        ];
        let rendered = render_instruction_files_with_budget(&files, 6);
        assert_eq!(
            rendered,
            "--- /a/AGENTS.md ---\naaaaaa\n[truncated]\n\nProject instruction files beyond \
             the character budget, not included: /b/AGENTS.md"
        );
    }

    #[test]
    fn render_fits_exactly_without_truncation_marker() {
        let files = vec![ProjectInstructionFile {
            path: "/a/AGENTS.md".to_string(),
            content: "0123456789\n".to_string(),
        }];
        let rendered = render_instruction_files_with_budget(&files, 10);
        assert_eq!(rendered, "--- /a/AGENTS.md ---\n0123456789");
        assert!(!rendered.contains("[truncated]"));
        assert!(!rendered.contains("not included"));
    }

    #[test]
    fn render_truncates_single_oversized_file_to_full_budget() {
        let files = vec![ProjectInstructionFile {
            path: "/a/AGENTS.md".to_string(),
            content: "a".repeat(PROJECT_INSTRUCTIONS_BUDGET_CHARS + 7_224),
        }];
        let rendered =
            render_instruction_files_with_budget(&files, PROJECT_INSTRUCTIONS_BUDGET_CHARS);
        assert_eq!(
            rendered,
            format!(
                "--- /a/AGENTS.md ---\n{}\n[truncated]",
                "a".repeat(PROJECT_INSTRUCTIONS_BUDGET_CHARS)
            )
        );
    }

    #[test]
    fn render_note_lists_every_omitted_path_in_order() {
        let files = vec![
            ProjectInstructionFile {
                path: "/a/AGENTS.md".to_string(),
                content: "aaaaa".to_string(),
            },
            ProjectInstructionFile {
                path: "/b/AGENTS.md".to_string(),
                content: "bbbbb".to_string(),
            },
            ProjectInstructionFile {
                path: "/c/AGENTS.md".to_string(),
                content: "ccccc".to_string(),
            },
        ];
        let rendered = render_instruction_files_with_budget(&files, 5);
        assert!(rendered.starts_with("--- /a/AGENTS.md ---\naaaaa"));
        assert!(rendered.ends_with("not included: /b/AGENTS.md, /c/AGENTS.md"));
        assert!(!rendered.contains("bbbbb"));
        assert!(!rendered.contains("ccccc"));
    }

    // --- project_instructions_prompt fail-open surface ---

    #[test]
    fn prompt_is_empty_for_missing_blank_or_nonexistent_roots() {
        assert_eq!(project_instructions_prompt(None), "");
        assert_eq!(project_instructions_prompt(Some("")), "");
        assert_eq!(project_instructions_prompt(Some("   ")), "");
        let vanished = tempdir().expect("tempdir");
        let path = vanished.path().display().to_string();
        drop(vanished);
        assert_eq!(project_instructions_prompt(Some(&path)), "");
    }

    // --- candidate chain ---

    #[test]
    fn candidate_chain_prefers_override_then_agents_then_claude() {
        let all = tempdir().expect("tempdir");
        write(all.path(), "AGENTS.override.md", "override rules");
        write(all.path(), "AGENTS.md", "agents rules");
        write(all.path(), "CLAUDE.md", "claude rules");
        let found = discover_instruction_files(all.path().to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("AGENTS.override.md"));
        assert_eq!(found[0].content, "override rules");

        let fallback = tempdir().expect("tempdir");
        write(fallback.path(), "AGENTS.override.md", "   \n");
        write(fallback.path(), "AGENTS.md", "agents rules");
        let found = discover_instruction_files(fallback.path().to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("AGENTS.md"));

        let claude_only = tempdir().expect("tempdir");
        write(claude_only.path(), "CLAUDE.md", "claude rules");
        let found = discover_instruction_files(claude_only.path().to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("CLAUDE.md"));
    }

    // --- ancestor walk ---

    #[test]
    fn walk_includes_git_root_and_orders_nearest_first() {
        let root = tempdir().expect("tempdir");
        make_git_root(root.path());
        write(root.path(), "AGENTS.md", "root rules");
        let sub = root.path().join("sub");
        std::fs::create_dir(&sub).expect("create sub");
        write(&sub, "AGENTS.md", "sub rules");

        let found = discover_instruction_files(sub.to_str().expect("utf8"));
        assert_eq!(found.len(), 2);
        assert!(found[0].path.ends_with("sub/AGENTS.md"));
        assert_eq!(found[0].content, "sub rules");
        assert!(found[1].path.ends_with("AGENTS.md"));
        assert_eq!(found[1].content, "root rules");

        let prompt = project_instructions_prompt(Some(sub.to_str().expect("utf8")));
        assert_eq!(
            prompt,
            format!(
                "--- {} ---\nsub rules\n\n--- {} ---\nroot rules",
                sub.join("AGENTS.md").display(),
                root.path().join("AGENTS.md").display()
            )
        );
    }

    #[test]
    fn walk_without_git_root_stays_in_working_directory() {
        let root = tempdir().expect("tempdir");
        write(root.path(), "AGENTS.md", "root rules");
        let sub = root.path().join("sub");
        std::fs::create_dir(&sub).expect("create sub");
        write(&sub, "AGENTS.md", "sub rules");

        let found = discover_instruction_files(sub.to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("sub/AGENTS.md"));
    }

    #[test]
    fn empty_nearest_file_falls_through_to_next_directory() {
        let root = tempdir().expect("tempdir");
        make_git_root(root.path());
        write(root.path(), "AGENTS.md", "root rules");
        let sub = root.path().join("sub");
        std::fs::create_dir(&sub).expect("create sub");
        write(&sub, "AGENTS.md", "");

        let found = discover_instruction_files(sub.to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("AGENTS.md"));
        assert_eq!(found[0].content, "root rules");
    }

    #[test]
    fn candidate_directory_falls_through_to_next_candidate() {
        let root = tempdir().expect("tempdir");
        make_git_root(root.path());
        std::fs::create_dir(root.path().join("AGENTS.override.md")).expect("create candidate dir");
        write(root.path(), "AGENTS.md", "agents rules");
        write(root.path(), "CLAUDE.md", "claude rules");

        let found = discover_instruction_files(root.path().to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("AGENTS.md"));
    }

    // --- dedup ---

    #[test]
    fn identical_content_dedups_keeping_nearest() {
        let root = tempdir().expect("tempdir");
        make_git_root(root.path());
        write(root.path(), "AGENTS.md", "rules");
        let sub = root.path().join("sub");
        std::fs::create_dir(&sub).expect("create sub");
        write(&sub, "AGENTS.md", "rules\n");

        let found = discover_instruction_files(sub.to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("sub/AGENTS.md"));
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_file_dedups_by_canonical_path() {
        use std::os::unix::fs::symlink;
        let root = tempdir().expect("tempdir");
        make_git_root(root.path());
        write(root.path(), "AGENTS.md", "rules");
        let sub = root.path().join("sub");
        std::fs::create_dir(&sub).expect("create sub");
        symlink(
            root.path().join("AGENTS.md"),
            sub.join("AGENTS.override.md"),
        )
        .expect("symlink instruction file");

        let found = discover_instruction_files(sub.to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("AGENTS.override.md"));
        assert_eq!(found[0].content, "rules");
    }

    #[test]
    fn crlf_and_lf_twins_dedup() {
        let root = tempdir().expect("tempdir");
        make_git_root(root.path());
        write(root.path(), "AGENTS.md", "alpha\nbeta");
        let sub = root.path().join("sub");
        std::fs::create_dir(&sub).expect("create sub");
        write(&sub, "AGENTS.md", "alpha\r\nbeta\r\n");

        let found = discover_instruction_files(sub.to_str().expect("utf8"));
        assert_eq!(found.len(), 1);
        assert!(found[0].path.ends_with("sub/AGENTS.md"));
        assert_eq!(found[0].content, "alpha\r\nbeta\r\n");
    }
}
