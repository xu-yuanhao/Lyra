use serde_json::{Value, json};

use crate::model::ToolManifest;
use crate::schema::object_schema;

pub(super) fn manifests() -> Vec<ToolManifest> {
    vec![
        super::s(
            "/tools/memory/search",
            "memory",
            "search",
            "Search memory",
            "Search Lyra long-term shared memory. Omit query or pass an empty query to list summaries.",
            Some("memory_search"),
        ),
        super::s(
            "/tools/memory/write",
            "memory",
            "write",
            "Write memory",
            "Remember, update, forget, or link durable Lyra memory.",
            Some("memory_write"),
        ),
        super::s(
            "/tools/memory/review_candidates",
            "memory",
            "review_candidates",
            "Review memory candidates",
            "Review pending memory candidates.",
            None,
        ),
        super::s(
            "/tools/memory/apply_candidate",
            "memory",
            "apply_candidate",
            "Apply memory candidate",
            "Apply a memory candidate.",
            None,
        ),
        super::s(
            "/tools/memory/reject_candidate",
            "memory",
            "reject_candidate",
            "Reject memory candidate",
            "Reject a memory candidate.",
            None,
        ),
        super::s(
            "/tools/memory/explain_injection",
            "memory",
            "explain_injection",
            "Explain memory injection",
            "Explain injected memories.",
            None,
        ),
        super::s(
            "/tools/memory/read_compressed_context",
            "memory",
            "read_compressed_context",
            "Read compressed context",
            "Read original messages archived from a compressed-context-block.",
            None,
        ),
    ]
}

pub(super) fn examples(operation: &str) -> Vec<&'static str> {
    match operation {
        "search" => vec![
            "Find saved user preferences or project facts.",
            "Omit query to list memory summaries.",
            "搜索记忆里的偏好；空查询就是列表。",
        ],
        "write" => vec![
            "Remember a durable user preference.",
            "Update, forget, or link an existing memory by action.",
            "用 action=remember 写下偏好。",
        ],
        _ => Vec::new(),
    }
}

pub(super) fn input_schema(operation: &str) -> Value {
    match operation {
        "search" => search_schema(),
        "write" => write_schema(),
        "review_candidates" => object_schema(
            [
                (
                    "status",
                    json!({
                        "type": "string",
                        "enum": ["pending", "applied", "rejected"],
                        "description": "Filter by candidate status. Defaults to pending."
                    }),
                ),
                (
                    "limit",
                    json!({
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 500,
                        "description": "Maximum candidates to return (default 50)."
                    }),
                ),
            ],
            &[],
        ),
        "apply_candidate" => object_schema(
            [(
                "id",
                json!({
                    "type": "string",
                    "description": "Memory candidate id, as returned by /tools/memory/review_candidates."
                }),
            )],
            &["id"],
        ),
        "reject_candidate" => object_schema(
            [
                (
                    "id",
                    json!({
                        "type": "string",
                        "description": "Memory candidate id, as returned by /tools/memory/review_candidates."
                    }),
                ),
                (
                    "reason",
                    json!({ "type": "string", "description": "Optional reason for rejecting the candidate." }),
                ),
            ],
            &["id"],
        ),
        "explain_injection" => object_schema(
            [
                (
                    "sessionId",
                    json!({ "type": "string", "description": "Session id whose memory injection should be explained." }),
                ),
                (
                    "turnId",
                    json!({ "type": "string", "description": "Optional turn id to narrow the explanation." }),
                ),
            ],
            &["sessionId"],
        ),
        "read_compressed_context" => object_schema(
            [(
                "sessionId",
                json!({ "type": "string", "description": "Session id whose compressed context should be read." }),
            )],
            &["sessionId"],
        ),
        _ => json!({ "type": "object", "properties": {} }),
    }
}

fn search_schema() -> Value {
    object_schema(
        [
            (
                "query",
                json!({
                    "type": "string",
                    "description": "Search text. Omit or leave empty to list summaries instead of ranking."
                }),
            ),
            ("scope", json!({ "type": "string" })),
            ("category", json!({ "type": "string" })),
            (
                "status",
                json!({
                    "type": "string",
                    "enum": ["active", "archived", "superseded", "forgotten"]
                }),
            ),
            (
                "includeArchived",
                json!({ "type": "boolean", "default": false }),
            ),
            (
                "includeRelated",
                json!({
                    "type": "boolean",
                    "description": "Defaults to true when ranking a query, false when listing."
                }),
            ),
            ("explain", json!({ "type": "boolean", "default": true })),
            ("minScore", json!({ "type": "number", "minimum": 0 })),
            (
                "limit",
                json!({ "type": "integer", "minimum": 1, "maximum": 500 }),
            ),
            ("offset", json!({ "type": "integer", "minimum": 0 })),
        ],
        &[],
    )
}

fn write_schema() -> Value {
    object_schema(
        [
            (
                "action",
                json!({
                    "type": "string",
                    "enum": ["remember", "update", "forget", "link"],
                    "description": "remember: write a fact. update: change an existing record by id. forget: archive or delete. link: relate two records."
                }),
            ),
            (
                "fact",
                json!({
                    "type": "string",
                    "description": "Required for action=remember. Optional replacement text for action=update."
                }),
            ),
            (
                "id",
                json!({
                    "type": "string",
                    "description": "Required for action=update. One of id or ids is required for action=forget."
                }),
            ),
            (
                "ids",
                json!({
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "Batch forget. One of id or ids is required for action=forget."
                }),
            ),
            ("content", json!({ "type": "object" })),
            ("scope", json!({ "type": "string", "default": "global" })),
            (
                "category",
                json!({
                    "type": "string",
                    "enum": ["user_profile", "preference", "project", "instruction", "goal", "other"],
                    "default": "other"
                }),
            ),
            (
                "confidence",
                json!({ "type": "number", "minimum": 0, "maximum": 1 }),
            ),
            (
                "sourceType",
                json!({
                    "type": "string",
                    "enum": ["user_declaration", "agent_inference", "tool_observation", "project_fact", "goal_sync", "imported"],
                    "default": "agent_inference"
                }),
            ),
            ("sourceRef", json!({ "type": "string" })),
            (
                "tags",
                json!({ "type": "array", "items": { "type": "string" } }),
            ),
            ("expiresAt", json!({ "type": "string" })),
            (
                "status",
                json!({
                    "type": "string",
                    "enum": ["active", "archived", "superseded", "forgotten"]
                }),
            ),
            ("supersedes", json!({ "type": "string" })),
            ("supersededBy", json!({ "type": "string" })),
            (
                "mode",
                json!({
                    "type": "string",
                    "enum": ["archive", "tombstone", "hard_delete"],
                    "default": "archive",
                    "description": "Used by action=forget."
                }),
            ),
            (
                "reason",
                json!({
                    "type": "string",
                    "description": "Used by action=forget."
                }),
            ),
            (
                "sourceId",
                json!({
                    "type": "string",
                    "description": "Required for action=link."
                }),
            ),
            (
                "targetId",
                json!({
                    "type": "string",
                    "description": "Required for action=link."
                }),
            ),
            (
                "relation",
                json!({
                    "type": "string",
                    "enum": ["related_to", "supports", "contradicts", "supersedes", "belongs_to_project", "same_user_preference", "derived_from"],
                    "default": "related_to",
                    "description": "Used by action=link."
                }),
            ),
        ],
        &["action"],
    )
}
