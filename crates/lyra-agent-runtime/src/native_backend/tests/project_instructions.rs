use super::*;

#[test]
fn project_instruction_files_reach_the_stable_system_prefix() {
    let project = tempfile::tempdir().expect("project tempdir");
    std::fs::create_dir(project.path().join(".git")).expect("fake git root");
    std::fs::write(
        project.path().join("AGENTS.md"),
        "Collaboration rule: verify claims before reporting.",
    )
    .expect("write root instructions");
    let docs = project.path().join("docs");
    std::fs::create_dir(&docs).expect("docs dir");
    std::fs::write(docs.join("AGENTS.md"), "Docs rule: keep pages short.")
        .expect("write docs instructions");

    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Project Instructions", "workingDir": docs.display().to_string() }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let request = build_model_request(&session_id).expect("model request");
    let system_prompt = request.messages[0]["content"]
        .as_str()
        .expect("system prompt");

    assert!(
        system_prompt
            .contains("Project instructions from this workspace, nearest directory first:"),
        "framing sentence should open the project instructions section"
    );
    assert!(system_prompt.contains("Docs rule: keep pages short."));
    assert!(system_prompt.contains("Collaboration rule: verify claims before reporting."));
    assert!(
        system_prompt.contains(&format!("--- {} ---", docs.join("AGENTS.md").display())),
        "each discovered file gets a path label"
    );
    assert!(system_prompt.contains(&format!(
        "--- {} ---",
        project.path().join("AGENTS.md").display()
    )));
    let docs_label = system_prompt
        .find(&format!("--- {} ---", docs.join("AGENTS.md").display()))
        .expect("docs label position");
    let root_label = system_prompt
        .find(&format!(
            "--- {} ---",
            project.path().join("AGENTS.md").display()
        ))
        .expect("root label position");
    assert!(
        docs_label < root_label,
        "nearest directory renders before the git root"
    );
}

#[test]
fn home_bound_session_discovers_no_project_instructions() {
    let backend = LyraAgentBackend;
    let created = backend
        .call_agent_method(
            "agent.session.create",
            json!({ "title": "Home Bound Instructions" }),
        )
        .expect("create session");
    let session_id = created["id"].as_str().expect("session id").to_string();
    let request = build_model_request(&session_id).expect("model request");
    let system_prompt = request.messages[0]["content"]
        .as_str()
        .expect("system prompt");
    assert!(
        !system_prompt.contains("Project instructions from this workspace"),
        "home-bound sessions get no project instruction discovery"
    );
}
