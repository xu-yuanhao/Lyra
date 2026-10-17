use minijinja::{AutoEscape, Environment, UndefinedBehavior};
use serde_json::Value;

const TEMPLATES: &[(&str, &str)] = &[
    ("kernel.md.j2", include_str!("prompts/kernel.md.j2")),
    (
        "interaction_contract.md.j2",
        include_str!("prompts/interaction_contract.md.j2"),
    ),
    (
        "compact_contract.md.j2",
        include_str!("prompts/compact_contract.md.j2"),
    ),
    (
        "project_instructions.md.j2",
        include_str!("prompts/project_instructions.md.j2"),
    ),
    (
        "full_contract.md.j2",
        include_str!("prompts/full_contract.md.j2"),
    ),
    ("plan_mode.md.j2", include_str!("prompts/plan_mode.md.j2")),
    (
        "browser_scene.md.j2",
        include_str!("prompts/browser_scene.md.j2"),
    ),
    (
        "computer_scene.md.j2",
        include_str!("prompts/computer_scene.md.j2"),
    ),
    (
        "design_scene.md.j2",
        include_str!("prompts/design_scene.md.j2"),
    ),
    (
        "citation_scene.md.j2",
        include_str!("prompts/citation_scene.md.j2"),
    ),
    (
        "image_scene.md.j2",
        include_str!("prompts/image_scene.md.j2"),
    ),
    (
        "active_skill.md.j2",
        include_str!("prompts/active_skill.md.j2"),
    ),
    (
        "memory_context.md.j2",
        include_str!("prompts/memory_context.md.j2"),
    ),
    (
        "dynamic_context.md.j2",
        include_str!("prompts/dynamic_context.md.j2"),
    ),
    (
        "permission_consent.md.j2",
        include_str!("prompts/permission_consent.md.j2"),
    ),
    (
        "permission_managed.md.j2",
        include_str!("prompts/permission_managed.md.j2"),
    ),
    (
        "permission_autonomous.md.j2",
        include_str!("prompts/permission_autonomous.md.j2"),
    ),
    (
        "prompt_accounting.md.j2",
        include_str!("prompts/prompt_accounting.md.j2"),
    ),
];

pub(crate) fn render_template(name: &str, context: Value) -> Result<String, String> {
    let mut env = Environment::new();
    env.set_undefined_behavior(UndefinedBehavior::Strict);
    env.set_auto_escape_callback(|_| AutoEscape::None);
    for (template_name, source) in TEMPLATES {
        env.add_template(template_name, source)
            .map_err(|error| error.to_string())?;
    }
    env.get_template(name)
        .map_err(|error| error.to_string())?
        .render(context)
        .map_err(|error| error.to_string())
        .map(|text| text.trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn render_uses_strict_undefined_and_no_escape() {
        let rendered = render_template(
            "memory_context.md.j2",
            json!({ "memory_prompt": "A < B && C > D" }),
        )
        .expect("render");
        assert!(rendered.contains("A < B && C > D"));
        assert!(!rendered.contains("&lt;"));
        assert!(render_template("memory_context.md.j2", json!({})).is_err());
    }

    #[test]
    fn permission_operating_fragments_render_without_mode_labels() {
        let consent = render_template("permission_consent.md.j2", json!({})).expect("consent");
        let managed = render_template("permission_managed.md.j2", json!({})).expect("managed");
        let autonomous =
            render_template("permission_autonomous.md.j2", json!({})).expect("autonomous");
        assert!(consent.contains("need consent"));
        assert!(managed.contains("do not need per-action consent"));
        assert!(autonomous.contains("do not need approval or consent"));
        assert!(autonomous.contains("think through the evidence"));
    }

    #[test]
    fn project_instructions_template_renders_content_verbatim() {
        let rendered = render_template(
            "project_instructions.md.j2",
            json!({ "project_instructions": "Follow <repo> rules && stay brief" }),
        )
        .expect("render");
        assert!(
            rendered.contains("Project instructions from this workspace, nearest directory first:")
        );
        assert!(rendered.contains("Follow <repo> rules && stay brief"));
        assert!(!rendered.contains("&lt;"));
        assert!(render_template("project_instructions.md.j2", json!({})).is_err());
    }
}
