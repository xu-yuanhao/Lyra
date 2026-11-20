use super::*;
mod policy;
pub(crate) use policy::{effective_skills, execute_for_project, global_active_skills};
use sha2::{Digest, Sha256};
use std::io::{Cursor, copy};
use zip::ZipArchive;

const REGISTRY_FILE_NAME: &str = "registry.v1.json";
const SKILL_MD_FILE_NAME: &str = "SKILL.md";
const DEFAULT_SKILL_STORE_INDEX_URL: &str = "lyra://skills/dynamic";
const CLAWHUB_SEARCH_API: &str = "https://clawhub.ai/api/v1/search";
const CLAWHUB_LIST_API: &str = "https://clawhub.ai/api/v1/skills";
const CLAWHUB_DOWNLOAD_API: &str = "https://clawhub.ai/api/v1/download";
const SKILL_STORE_LIMIT: usize = 24;
const SKILL_SEARCH_MAX_RESULTS: usize = 80;
const SKILL_PACKAGE_SEARCH_DEPTH: usize = 6;
const MAX_SKILL_ARCHIVE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_SKILL_ARCHIVE_FILES: usize = 1_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillManifest {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) version: String,
    pub(crate) description: String,
    pub(crate) prompt: String,
    #[serde(default)]
    pub(crate) permissions: Vec<String>,
    #[serde(default)]
    pub(crate) tool_paths: Vec<String>,
    #[serde(default)]
    pub(crate) tool_capabilities: Vec<Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum SkillSource {
    Local {
        path: String,
    },
    Git {
        url: String,
        #[serde(rename = "ref", default, skip_serializing_if = "Option::is_none")]
        ref_name: Option<String>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        subdir: Option<String>,
    },
    Archive {
        url: String,
    },
    Store {
        skill_id: String,
        index_url: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        source: Option<Box<SkillSource>>,
    },
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct InstalledSkill {
    pub(crate) id: String,
    pub(crate) manifest: SkillManifest,
    pub(crate) source: SkillSource,
    pub(crate) package_path: String,
    pub(crate) prompt_path: String,
    pub(crate) resource_root: String,
    pub(crate) source_fingerprint: String,
    pub(crate) installed_at: String,
    pub(crate) updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillStoreIndex {
    pub(crate) version: u32,
    pub(crate) updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) query: Option<String>,
    #[serde(default)]
    pub(crate) has_more: bool,
    #[serde(default)]
    pub(crate) skills: Vec<SkillStoreEntry>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillStoreEntry {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) version: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) source: SkillSource,
    #[serde(default)]
    pub(crate) permissions: Vec<String>,
    #[serde(default)]
    pub(crate) tool_paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) source_registry: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) source_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) installs: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) stars: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) score: Option<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SkillRegistryDocument {
    pub(crate) version: u32,
    #[serde(default)]
    pub(crate) installed: Vec<InstalledSkill>,
    #[serde(default = "default_store_index_url")]
    pub(crate) store_index_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) store_index: Option<SkillStoreIndex>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) store_last_error: Option<String>,
}

impl Default for SkillRegistryDocument {
    fn default() -> Self {
        Self {
            version: 1,
            installed: Vec::new(),
            store_index_url: default_store_index_url(),
            store_index: None,
            store_last_error: None,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillFrontmatter {
    id: Option<String>,
    name: Option<String>,
    version: Option<String>,
    description: Option<String>,
    #[serde(default)]
    permissions: Vec<String>,
    #[serde(default, alias = "tool_paths")]
    tool_paths: Vec<String>,
    #[serde(default, alias = "tool_capabilities")]
    tool_capabilities: Vec<Value>,
}

fn default_store_index_url() -> String {
    DEFAULT_SKILL_STORE_INDEX_URL.to_string()
}

pub(crate) fn skill_storage_root() -> PathBuf {
    if let Some(path) = env::var_os("LYRA_SKILLS_HOME") {
        return PathBuf::from(path);
    }
    if let Some(path) = env::var_os("LYRA_AGENT_HOME") {
        let agent_home = PathBuf::from(path);
        if let Some(modules_root) = agent_home.parent() {
            return modules_root.join("skills");
        }
    }
    let root = runtime_root();
    if cfg!(test) {
        return root.join("skills");
    }
    root.parent()
        .map(|parent| parent.join("skills"))
        .unwrap_or_else(|| root.join("skills"))
}

fn mutation_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

fn registry_path(storage_root: &Path) -> PathBuf {
    storage_root.join(REGISTRY_FILE_NAME)
}

pub(crate) fn read_registry_from(storage_root: &Path) -> SkillRegistryDocument {
    // Reading a catalog must not rename or remove the user's configuration.
    // Mutations validate existing JSON before writing.
    fs::read(registry_path(storage_root))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<SkillRegistryDocument>(&bytes).ok())
        .unwrap_or_default()
}

fn write_registry_to(
    storage_root: &Path,
    registry: &SkillRegistryDocument,
) -> AgentRuntimeResult<()> {
    let path = registry_path(storage_root);
    if path.exists() {
        let bytes = fs::read(&path).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        serde_json::from_slice::<SkillRegistryDocument>(&bytes)
            .map_err(|error| AgentRuntimeError::Core(format!("{}: {error}", path.display())))?;
    }
    fs::create_dir_all(storage_root).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    write_json(&registry_path(storage_root), registry)
}

fn read_registry() -> SkillRegistryDocument {
    read_registry_from(&skill_storage_root())
}

/// Read-only snapshot of the global skill registry for dynamic Tool-FS
/// manifest generation (skills_dynamic.rs).
pub(crate) fn registry_snapshot() -> SkillRegistryDocument {
    read_registry()
}

fn package_markdown_path(root: &Path) -> PathBuf {
    root.join(SKILL_MD_FILE_NAME)
}

fn split_frontmatter(markdown: &str) -> AgentRuntimeResult<(SkillFrontmatter, String)> {
    let mut lines = markdown.lines();
    if lines.next() != Some("---") {
        return Ok((SkillFrontmatter::default(), markdown.trim().to_string()));
    }
    let mut yaml = String::new();
    let mut body = String::new();
    let mut in_frontmatter = true;
    for line in lines {
        if in_frontmatter && line == "---" {
            in_frontmatter = false;
            continue;
        }
        if in_frontmatter {
            yaml.push_str(line);
            yaml.push('\n');
        } else {
            body.push_str(line);
            body.push('\n');
        }
    }
    if in_frontmatter {
        return Err(AgentRuntimeError::Core(
            "SKILL.md frontmatter is not closed".to_string(),
        ));
    }
    let frontmatter = if yaml.trim().is_empty() {
        SkillFrontmatter::default()
    } else {
        serde_yaml::from_str::<SkillFrontmatter>(&yaml)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
    };
    Ok((frontmatter, body.trim().to_string()))
}

fn slugify_skill_id(value: &str) -> String {
    value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches(|ch| matches!(ch, '-' | '.'))
        .to_string()
}

fn fallback_skill_id(root: &Path) -> String {
    let dir_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("skill");
    let slug = slugify_skill_id(dir_name);
    if slug.is_empty() {
        "skill".to_string()
    } else {
        slug
    }
}

fn validate_skill_id(skill_id: &str) -> AgentRuntimeResult<()> {
    let valid = skill_id.len() <= 128
        && skill_id
            .chars()
            .next()
            .is_some_and(|ch| ch.is_ascii_alphanumeric())
        && skill_id
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-' | ':'));
    if valid {
        Ok(())
    } else {
        Err(AgentRuntimeError::Core(format!(
            "invalid Lyra skill id: {skill_id}"
        )))
    }
}

pub(crate) fn parse_skill_package(root: &Path) -> AgentRuntimeResult<SkillManifest> {
    let markdown_path = package_markdown_path(root);
    let markdown = fs::read_to_string(&markdown_path).map_err(|error| {
        AgentRuntimeError::Core(format!(
            "failed to read {}: {error}",
            markdown_path.display()
        ))
    })?;
    let (frontmatter, prompt) = split_frontmatter(&markdown)?;
    if prompt.trim().is_empty() {
        return Err(AgentRuntimeError::Core(
            "SKILL.md body must contain skill instructions".to_string(),
        ));
    }
    // Skill id precedence: explicit frontmatter id, then the frontmatter name
    // (the convention most skill authors follow), then the directory name.
    // Directory-based fallbacks must never leak staging paths like
    // ".<hash>-<uuid>-staging" into the registry.
    let id = frontmatter
        .id
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            frontmatter
                .name
                .as_deref()
                .map(slugify_skill_id)
                .filter(|value| !value.is_empty())
        })
        .unwrap_or_else(|| fallback_skill_id(root));
    validate_skill_id(&id)?;
    Ok(SkillManifest {
        name: frontmatter.name.unwrap_or_else(|| id.clone()),
        version: frontmatter.version.unwrap_or_else(|| "0.1.0".to_string()),
        description: frontmatter.description.unwrap_or_default(),
        prompt,
        permissions: frontmatter.permissions,
        tool_paths: frontmatter.tool_paths,
        tool_capabilities: frontmatter.tool_capabilities,
        id,
    })
}

fn hash_json(value: &impl Serialize) -> String {
    let payload = serde_json::to_vec(value).unwrap_or_default();
    format!("{:x}", Sha256::digest(payload))
}

pub(crate) fn skill_package_fingerprint(root: &Path) -> AgentRuntimeResult<String> {
    fn visit(
        root: &Path,
        current: &Path,
        entries: &mut Vec<(String, Vec<u8>)>,
    ) -> AgentRuntimeResult<()> {
        for entry in
            fs::read_dir(current).map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        {
            let entry = entry.map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            let file_name = entry.file_name();
            if file_name == ".git" || file_name == "node_modules" {
                continue;
            }
            let file_type = entry
                .file_type()
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            let path = entry.path();
            if file_type.is_symlink() {
                return Err(AgentRuntimeError::Core(format!(
                    "skill package contains a symbolic link: {}",
                    path.display()
                )));
            }
            if file_type.is_dir() {
                visit(root, &path, entries)?;
            } else if file_type.is_file() {
                let relative = path
                    .strip_prefix(root)
                    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
                let bytes =
                    fs::read(&path).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
                entries.push((relative.to_string_lossy().replace('\\', "/"), bytes));
            }
        }
        Ok(())
    }
    let root =
        fs::canonicalize(root).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let mut entries = Vec::new();
    visit(&root, &root, &mut entries)?;
    entries.sort_by(|left, right| left.0.cmp(&right.0));
    let mut digest = Sha256::new();
    for (path, bytes) in entries {
        digest.update(path.as_bytes());
        digest.update([0]);
        digest.update((bytes.len() as u64).to_le_bytes());
        digest.update(bytes);
    }
    Ok(format!("{:x}", digest.finalize()))
}

fn storage_name(skill_id: &str) -> String {
    let slug = skill_id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>()
        .trim_matches('-')
        .to_string();
    let digest = &hash_json(&skill_id)[..12];
    format!("{}-{digest}", if slug.is_empty() { "skill" } else { &slug })
}

fn copy_dir_all(source: &Path, destination: &Path) -> AgentRuntimeResult<()> {
    fs::create_dir_all(destination).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    for entry in fs::read_dir(source).map_err(|error| AgentRuntimeError::Core(error.to_string()))? {
        let entry = entry.map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let file_name = entry.file_name();
        if file_name == ".git" || file_name == "node_modules" {
            continue;
        }
        let source_path = entry.path();
        let destination_path = destination.join(file_name);
        let file_type = entry
            .file_type()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        if file_type.is_symlink() {
            return Err(AgentRuntimeError::Core(format!(
                "skill package contains a symbolic link: {}",
                source_path.display()
            )));
        } else if file_type.is_dir() {
            copy_dir_all(&source_path, &destination_path)?;
        } else if file_type.is_file() {
            fs::copy(&source_path, &destination_path)
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        }
    }
    Ok(())
}

pub(crate) fn install_package_from_root(
    storage_root: &Path,
    source_root: &Path,
    source: SkillSource,
) -> AgentRuntimeResult<InstalledSkill> {
    install_package_from_root_as(storage_root, source_root, source, None)
}

pub(crate) fn install_package_from_root_as(
    storage_root: &Path,
    source_root: &Path,
    source: SkillSource,
    managed_id: Option<&str>,
) -> AgentRuntimeResult<InstalledSkill> {
    let mut source_manifest = parse_skill_package(source_root)?;
    if let Some(id) = managed_id {
        source_manifest.id = id.to_string();
    }
    let installed_root = storage_root
        .join("installed")
        .join(storage_name(&source_manifest.id));
    let staging_root = storage_root.join("installed").join(format!(
        ".{}-{}-staging",
        storage_name(&source_manifest.id),
        Uuid::new_v4()
    ));
    let backup_root = storage_root.join("installed").join(format!(
        ".{}-{}-backup",
        storage_name(&source_manifest.id),
        Uuid::new_v4()
    ));
    if let Some(parent) = installed_root.parent() {
        fs::create_dir_all(parent).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    copy_dir_all(source_root, &staging_root)?;
    // Parsing the staging copy would re-derive the skill id from the staging
    // directory name when the frontmatter lacks an id, which both disagrees
    // with the source parse above and can yield an invalid id. The manifest
    // comes from the source; here we only verify the copy is faithful.
    let staged_markdown = fs::read(package_markdown_path(&staging_root)).map_err(|error| {
        AgentRuntimeError::Core(format!(
            "staged skill package is missing {}: {error}",
            SKILL_MD_FILE_NAME
        ))
    })?;
    let source_markdown = fs::read(package_markdown_path(source_root)).map_err(|error| {
        AgentRuntimeError::Core(format!(
            "failed to re-read {}: {error}",
            package_markdown_path(source_root).display()
        ))
    })?;
    if staged_markdown != source_markdown {
        let _ = fs::remove_dir_all(&staging_root);
        return Err(AgentRuntimeError::Core(
            "staged skill package does not match its source".to_string(),
        ));
    }
    let _guard = mutation_lock()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("skill registry lock failed".into()))?;
    let manifest = source_manifest;
    let timestamp = now();
    let mut registry = read_registry_from(storage_root);
    let existing = registry
        .installed
        .iter()
        .find(|skill| skill.id == manifest.id);
    let source_fingerprint = skill_package_fingerprint(source_root)?;
    let installed = InstalledSkill {
        id: manifest.id.clone(),
        source,
        prompt_path: package_markdown_path(&installed_root)
            .to_string_lossy()
            .to_string(),
        resource_root: installed_root.to_string_lossy().to_string(),
        package_path: installed_root.to_string_lossy().to_string(),
        source_fingerprint,
        installed_at: existing
            .map(|skill| skill.installed_at.clone())
            .unwrap_or_else(|| timestamp.clone()),
        updated_at: timestamp,
        last_error: None,
        manifest,
    };
    registry.installed.retain(|skill| skill.id != installed.id);
    registry.installed.push(installed.clone());
    registry
        .installed
        .sort_by(|left, right| left.id.cmp(&right.id));
    let had_existing = installed_root.exists();
    if had_existing {
        fs::rename(&installed_root, &backup_root)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    if let Err(error) = fs::rename(&staging_root, &installed_root) {
        if had_existing {
            let _ = fs::rename(&backup_root, &installed_root);
        }
        return Err(AgentRuntimeError::Core(error.to_string()));
    }
    if let Err(error) = write_registry_to(storage_root, &registry) {
        let _ = fs::remove_dir_all(&installed_root);
        if had_existing {
            let _ = fs::rename(&backup_root, &installed_root);
        }
        return Err(error);
    }
    if storage_root == skill_storage_root() {
        projects::notify_changed();
    }
    if had_existing {
        let _ = fs::remove_dir_all(&backup_root);
    }
    Ok(installed)
}

fn git_source_root(storage_root: &Path, source: &SkillSource) -> PathBuf {
    storage_root
        .join("sources")
        .join("git")
        .join(&hash_json(source)[..16])
}

fn clone_git_source(storage_root: &Path, source: &SkillSource) -> AgentRuntimeResult<PathBuf> {
    let SkillSource::Git {
        url,
        ref_name,
        subdir: _,
    } = source
    else {
        return Err(AgentRuntimeError::Core(
            "git source is required".to_string(),
        ));
    };
    let source_root = git_source_root(storage_root, source);
    let _ = fs::remove_dir_all(&source_root);
    if let Some(parent) = source_root.parent() {
        fs::create_dir_all(parent).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    }
    let mut args = vec!["clone".to_string(), "--depth".to_string(), "1".to_string()];
    if let Some(ref_name) = ref_name.as_deref().filter(|value| !value.trim().is_empty()) {
        args.push("--branch".to_string());
        args.push(ref_name.to_string());
    }
    args.push(url.clone());
    args.push(source_root.to_string_lossy().to_string());
    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    if !output.status.success() {
        return Err(AgentRuntimeError::Core(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ));
    }
    Ok(source_root)
}

fn find_skill_markdown_paths(
    root: &Path,
    depth: usize,
    output: &mut Vec<PathBuf>,
) -> AgentRuntimeResult<()> {
    if depth == 0 || output.len() >= 64 {
        return Ok(());
    }
    for entry in fs::read_dir(root).map_err(|error| AgentRuntimeError::Core(error.to_string()))? {
        let entry = entry.map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let file_name = entry.file_name();
        if file_name == ".git" || file_name == "node_modules" || file_name == "target" {
            continue;
        }
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        if file_type.is_file() && file_name == SKILL_MD_FILE_NAME {
            output.push(path);
        } else if file_type.is_dir() {
            find_skill_markdown_paths(&path, depth - 1, output)?;
        }
    }
    Ok(())
}

fn skill_hint_matches(skill_root: &Path, hint: &str) -> bool {
    let hint = hint.trim().trim_matches('/').to_ascii_lowercase();
    if hint.is_empty() {
        return false;
    }
    let folder = skill_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    folder == hint || hint.ends_with(&format!("/{folder}"))
}

fn locate_skill_package_root(root: &Path, hint: Option<&str>) -> AgentRuntimeResult<PathBuf> {
    if package_markdown_path(root).exists() {
        return Ok(root.to_path_buf());
    }
    let mut skill_files = Vec::new();
    find_skill_markdown_paths(root, SKILL_PACKAGE_SEARCH_DEPTH, &mut skill_files)?;
    if skill_files.is_empty() {
        return Err(AgentRuntimeError::Core(format!(
            "no SKILL.md found under {}",
            root.display()
        )));
    }
    if let Some(hint) = hint {
        if let Some(skill_file) = skill_files.iter().find(|path| {
            path.parent()
                .is_some_and(|parent| skill_hint_matches(parent, hint))
        }) {
            return Ok(skill_file.parent().unwrap_or(root).to_path_buf());
        }
    }
    if skill_files.len() == 1 {
        return Ok(skill_files[0].parent().unwrap_or(root).to_path_buf());
    }
    Err(AgentRuntimeError::Core(format!(
        "multiple SKILL.md files found under {}; paste a GitHub tree URL or local skill folder",
        root.display()
    )))
}

fn archive_source_root(storage_root: &Path, source: &SkillSource) -> PathBuf {
    storage_root
        .join("sources")
        .join("archive")
        .join(&hash_json(source)[..16])
}

fn extract_zip_bytes(bytes: Vec<u8>, source_root: &Path) -> AgentRuntimeResult<()> {
    let _ = fs::remove_dir_all(&source_root);
    fs::create_dir_all(&source_root).map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    if bytes.len() as u64 > MAX_SKILL_ARCHIVE_BYTES {
        return Err(AgentRuntimeError::Core(
            "skill archive is too large".to_string(),
        ));
    }
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    if archive.len() > MAX_SKILL_ARCHIVE_FILES {
        return Err(AgentRuntimeError::Core(
            "skill archive contains too many files".to_string(),
        ));
    }
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        let Some(path) = file.enclosed_name().map(PathBuf::from) else {
            continue;
        };
        let destination = source_root.join(path);
        if file.is_dir() {
            fs::create_dir_all(&destination)
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        } else {
            if let Some(parent) = destination.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            }
            let mut output = fs::File::create(&destination)
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
            copy(&mut file, &mut output)
                .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        }
    }
    Ok(())
}

fn download_archive_source(
    storage_root: &Path,
    source: &SkillSource,
) -> AgentRuntimeResult<PathBuf> {
    let SkillSource::Archive { url } = source else {
        return Err(AgentRuntimeError::Core(
            "archive source is required".to_string(),
        ));
    };
    let source_root = archive_source_root(storage_root, source);
    let mut response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .get(url)
        .send()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .error_for_status()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let mut bytes = Vec::new();
    response
        .by_ref()
        .take(MAX_SKILL_ARCHIVE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    extract_zip_bytes(bytes, &source_root)?;
    Ok(source_root)
}

fn install_local_archive(
    storage_root: &Path,
    archive_path: &Path,
    recorded_source: SkillSource,
) -> AgentRuntimeResult<InstalledSkill> {
    let bytes = fs::read(archive_path).map_err(|error| {
        AgentRuntimeError::Core(format!(
            "failed to read {}: {error}",
            archive_path.display()
        ))
    })?;
    let source_root = storage_root
        .join("sources")
        .join("local-archive")
        .join(&hash_json(&archive_path.to_string_lossy().to_string())[..16]);
    extract_zip_bytes(bytes, &source_root)?;
    let skill_root = locate_skill_package_root(&source_root, None)?;
    install_package_from_root(storage_root, &skill_root, recorded_source)
}

fn install_skill_source(
    storage_root: &Path,
    source: SkillSource,
    recorded_source: SkillSource,
) -> AgentRuntimeResult<InstalledSkill> {
    match source {
        SkillSource::Local { path } => {
            install_package_from_root(storage_root, &PathBuf::from(path), recorded_source)
        }
        SkillSource::Git { .. } => {
            let source_root = clone_git_source(storage_root, &source)?;
            let SkillSource::Git { subdir, .. } = &source else {
                unreachable!();
            };
            let candidate_root = subdir
                .as_deref()
                .filter(|value| !value.trim().is_empty())
                .map(|value| source_root.join(value.trim()))
                .unwrap_or_else(|| source_root.clone());
            let skill_root = locate_skill_package_root(&candidate_root, subdir.as_deref())
                .or_else(|_| locate_skill_package_root(&source_root, subdir.as_deref()))?;
            install_package_from_root(storage_root, &skill_root, recorded_source)
        }
        SkillSource::Archive { .. } => {
            let source_root = download_archive_source(storage_root, &source)?;
            let skill_root = locate_skill_package_root(&source_root, None)?;
            install_package_from_root(storage_root, &skill_root, recorded_source)
        }
        SkillSource::Store { .. } => Err(AgentRuntimeError::Core(
            "nested store skill source is not supported".to_string(),
        )),
    }
}

fn skill_value(skill: &InstalledSkill, active: bool, include_prompt: bool) -> Value {
    let prompt_hash = hash_json(&skill.manifest.prompt);
    let prompt_excerpt = skill.manifest.prompt.chars().take(500).collect::<String>();
    let mut manifest = serde_json::to_value(&skill.manifest).unwrap_or_else(|_| json!({}));
    if !include_prompt {
        if let Some(object) = manifest.as_object_mut() {
            object.remove("prompt");
        }
    }
    json!({
        "id": skill.id,
        "name": skill.manifest.name,
        "version": skill.manifest.version,
        "description": skill.manifest.description,
        "prompt": if include_prompt { Value::String(skill.manifest.prompt.clone()) } else { Value::Null },
        "promptExcerpt": prompt_excerpt,
        "promptHash": prompt_hash,
        "permissions": skill.manifest.permissions,
        "toolPaths": skill.manifest.tool_paths,
        "toolCapabilities": skill.manifest.tool_capabilities,
        "active": active,
        "source": skill.source,
        "packagePath": skill.package_path,
        "promptPath": skill.prompt_path,
        "resourceRoot": skill.resource_root,
        "sourceFingerprint": skill.source_fingerprint,
        "installedAt": skill.installed_at,
        "updatedAt": skill.updated_at,
        "lastError": skill.last_error,
        "manifest": manifest,
    })
}

fn installed_skill_value(
    skill_id: &str,
    active_skills: &HashSet<String>,
    include_prompt: bool,
) -> Option<Value> {
    read_registry()
        .installed
        .iter()
        .find(|skill| skill.id == skill_id)
        .map(|skill| skill_value(skill, active_skills.contains(&skill.id), include_prompt))
}

pub(crate) fn native_skill_state(skill_id: &str, active_skills: &HashSet<String>) -> Option<Value> {
    installed_skill_value(skill_id, active_skills, true)
}

pub(crate) fn active_skill_prompt_for_project(project_root: Option<&str>) -> String {
    effective_skills(project_root)
        .unwrap_or_default()
        .into_iter()
        .map(|skill| {
            format!(
                "Skill {} ({}):\n{}",
                skill.id,
                skill.manifest.name,
                skill.manifest.prompt.trim()
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

pub(crate) fn active_skill_context_for_project(project_root: Option<&str>) -> Value {
    Value::Array(effective_skills(project_root).unwrap_or_default().into_iter()
        .map(|skill| json!({
            "id": skill.id, "name": skill.manifest.name, "version": skill.manifest.version,
            "active": true, "source": skill.source, "permissions": skill.manifest.permissions,
            "toolPaths": skill.manifest.tool_paths, "promptHash": hash_json(&skill.manifest.prompt),
            "resourceRoot": skill.resource_root,
        }))
        .collect())
}

fn store_value(registry: &SkillRegistryDocument) -> Value {
    json!({
        "indexUrl": registry.store_index_url,
        "index": registry.store_index,
        "lastError": registry.store_last_error,
    })
}

pub(crate) fn skill_list() -> AgentRuntimeResult<Value> {
    let active_skills = global_active_skills()?;
    let storage_root = skill_storage_root();
    let mut registry = read_registry_from(&storage_root);
    registry.store_index_url = default_store_index_url();
    Ok(json!({
        "skills": registry
            .installed
            .iter()
            .map(|skill| skill_value(skill, active_skills.contains(&skill.id), false))
            .collect::<Vec<_>>(),
        "store": store_value(&registry),
    }))
}

pub(crate) fn skill_inspect(payload: Value) -> AgentRuntimeResult<Value> {
    let skill_id = string_opt(&payload, "skillId")
        .ok_or_else(|| AgentRuntimeError::Core("skillId is required".to_string()))?;
    let active_skills = global_active_skills()?;
    let skill = native_skill_state(&skill_id, &active_skills).ok_or_else(|| {
        AgentRuntimeError::Core(format!("Lyra skill is not installed: {skill_id}"))
    })?;
    Ok(json!({ "skill": skill }))
}

pub(crate) fn set_skill_active(payload: Value, active: bool) -> AgentRuntimeResult<Value> {
    let skill_id = string_opt(&payload, "skillId")
        .ok_or_else(|| AgentRuntimeError::Core("skillId is required".to_string()))?;
    if !read_registry()
        .installed
        .iter()
        .any(|skill| skill.id == skill_id)
    {
        return Err(AgentRuntimeError::Core(format!(
            "Lyra skill is not installed: {skill_id}"
        )));
    }
    let active_skills = policy::set_global_default(&skill_id, active)?;
    let skill = native_skill_state(&skill_id, &active_skills).ok_or_else(|| {
        AgentRuntimeError::Core(format!("Lyra skill is not installed: {skill_id}"))
    })?;
    Ok(json!({ "skill": skill, "activeSkills": active_skills.iter().cloned().collect::<Vec<_>>() }))
}

pub(crate) fn skill_install_from_local(payload: Value) -> AgentRuntimeResult<Value> {
    let source_path = string_opt(&payload, "sourcePath")
        .ok_or_else(|| AgentRuntimeError::Core("sourcePath is required".to_string()))?;
    let source_path = fs::canonicalize(source_path)
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let install_root = if source_path.is_file()
        && source_path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(SKILL_MD_FILE_NAME))
    {
        source_path.parent().unwrap_or(&source_path).to_path_buf()
    } else {
        source_path.clone()
    };
    let source = SkillSource::Local {
        path: install_root.to_string_lossy().to_string(),
    };
    let skill = if source_path.is_file()
        && source_path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("zip"))
    {
        install_local_archive(&skill_storage_root(), &source_path, source)?
    } else {
        install_skill_source(&skill_storage_root(), source.clone(), source)?
    };
    policy::set_global_default(&skill.id, true)?;
    Ok(json!({ "skill": skill_value(&skill, true, true) }))
}

pub(crate) fn skill_install_from_git(payload: Value) -> AgentRuntimeResult<Value> {
    let url = string_opt(&payload, "url")
        .ok_or_else(|| AgentRuntimeError::Core("url is required".to_string()))?;
    let source = SkillSource::Git {
        url,
        ref_name: string_opt(&payload, "ref"),
        subdir: string_opt(&payload, "subdir"),
    };
    let skill = install_skill_source(&skill_storage_root(), source.clone(), source)?;
    policy::set_global_default(&skill.id, true)?;
    Ok(json!({ "skill": skill_value(&skill, true, true) }))
}

fn string_at<'a>(value: &'a Value, pointer: &str) -> Option<&'a str> {
    value.pointer(pointer).and_then(Value::as_str)
}

fn u64_at(value: &Value, pointer: &str) -> Option<u64> {
    value.pointer(pointer).and_then(Value::as_u64)
}

fn f64_at(value: &Value, pointer: &str) -> Option<f64> {
    value.pointer(pointer).and_then(Value::as_f64)
}

fn normalized_store_key(value: &str) -> String {
    value
        .to_ascii_lowercase()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect()
}

fn store_entry_dedupe_key(entry: &SkillStoreEntry) -> String {
    match &entry.source {
        SkillSource::Git { url, subdir, .. } => format!(
            "git:{}:{}",
            url.to_ascii_lowercase().trim_end_matches(".git"),
            subdir.as_deref().unwrap_or_default().to_ascii_lowercase()
        ),
        SkillSource::Archive { url } => format!("archive:{}", url.to_ascii_lowercase()),
        _ => format!("name:{}", normalized_store_key(&entry.name)),
    }
}

fn merge_store_entries(entries: Vec<SkillStoreEntry>) -> Vec<SkillStoreEntry> {
    let mut by_key = HashMap::<String, SkillStoreEntry>::new();
    for entry in entries {
        let key = store_entry_dedupe_key(&entry);
        let replace = by_key
            .get(&key)
            .map(|existing| entry.installs.unwrap_or(0) > existing.installs.unwrap_or(0))
            .unwrap_or(true);
        if replace {
            by_key.insert(key, entry);
        }
    }
    let mut entries = by_key.into_values().collect::<Vec<_>>();
    entries.sort_by(|left, right| {
        right
            .installs
            .unwrap_or(0)
            .cmp(&left.installs.unwrap_or(0))
            .then_with(|| {
                left.name
                    .to_ascii_lowercase()
                    .cmp(&right.name.to_ascii_lowercase())
            })
    });
    entries.truncate(SKILL_SEARCH_MAX_RESULTS);
    entries
}

fn fetch_json(client: &reqwest::blocking::Client, url: Url) -> AgentRuntimeResult<Value> {
    client
        .get(url)
        .send()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .error_for_status()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?
        .json::<Value>()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))
}

fn fetch_clawhub_entries(
    client: &reqwest::blocking::Client,
    query: &str,
    offset: usize,
) -> AgentRuntimeResult<Vec<SkillStoreEntry>> {
    // clawhub.ai slugs are only unique per publisher; installs need both
    // `slug` and `ownerHandle`, so ids and download URLs stay owner-qualified.
    let skills = if query.trim().is_empty() {
        let mut url = Url::parse(CLAWHUB_LIST_API)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        url.query_pairs_mut()
            .append_pair("limit", &SKILL_STORE_LIMIT.to_string());
        let json = fetch_json(client, url)?;
        json.get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    } else {
        let mut url = Url::parse(CLAWHUB_SEARCH_API)
            .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("limit", &SKILL_STORE_LIMIT.to_string());
        let json = fetch_json(client, url)?;
        json.get("results")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    let entries = skills
        .iter()
        .filter_map(|skill| {
            let slug = string_at(skill, "/slug")?;
            let owner = string_at(skill, "/ownerHandle").unwrap_or_default();
            if owner.is_empty() {
                return None;
            }
            let name = string_at(skill, "/displayName").unwrap_or(slug).to_string();
            Some(SkillStoreEntry {
                id: format!("clawhub:{owner}/{slug}"),
                name,
                version: string_at(skill, "/latestVersion/version")
                    .or_else(|| string_at(skill, "/version"))
                    .unwrap_or_default()
                    .to_string(),
                description: string_at(skill, "/summary").unwrap_or_default().to_string(),
                source: SkillSource::Archive {
                    url: format!(
                        "{CLAWHUB_DOWNLOAD_API}?slug={slug}&ownerHandle={owner}"
                    ),
                },
                permissions: Vec::new(),
                tool_paths: Vec::new(),
                source_registry: Some("clawhub.ai".to_string()),
                source_url: Some(format!("https://clawhub.ai/{owner}/skills/{slug}")),
                installs: u64_at(skill, "/downloads"),
                stars: None,
                score: f64_at(skill, "/score"),
            })
        })
        .collect::<Vec<_>>();
    Ok(entries)
}

fn fetch_store_index(
    query: &str,
    offset: usize,
) -> AgentRuntimeResult<(SkillStoreIndex, Option<String>)> {
    let query = query.trim();
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Lyra")
        .build()
        .map_err(|error| AgentRuntimeError::Core(error.to_string()))?;
    let mut entries = Vec::new();
    let mut errors = Vec::new();
    match fetch_clawhub_entries(&client, query, offset) {
        Ok(value) => entries.extend(value),
        Err(error) => errors.push(format!("clawhub.ai: {error}")),
    }
    let has_more = entries.len() >= SKILL_STORE_LIMIT;
    let entries = merge_store_entries(entries);
    if entries.is_empty() && !errors.is_empty() {
        return Err(AgentRuntimeError::Core(errors.join("; ")));
    }
    Ok((
        SkillStoreIndex {
            version: 1,
            updated_at: now(),
            query: (!query.is_empty()).then(|| query.to_string()),
            has_more,
            skills: entries,
        },
        (!errors.is_empty()).then(|| errors.join("; ")),
    ))
}

pub(crate) fn skill_refresh_store(payload: Value) -> AgentRuntimeResult<Value> {
    let storage_root = skill_storage_root();
    let query = string_opt(&payload, "query").unwrap_or_default();
    let offset = payload.get("offset").and_then(Value::as_u64).unwrap_or(0) as usize;
    let append = payload
        .get("append")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let result = fetch_store_index(&query, offset);
    // Re-read after network work so installing a skill while the store loads
    // cannot be overwritten by an older catalog snapshot.
    let _guard = mutation_lock()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("skill registry lock failed".into()))?;
    let mut registry = read_registry_from(&storage_root);
    registry.store_index_url = default_store_index_url();
    match result {
        Ok((mut index, warning)) => {
            if append {
                if let Some(existing) = registry.store_index.as_ref() {
                    if existing.query.as_deref().unwrap_or_default()
                        == index.query.as_deref().unwrap_or_default()
                    {
                        let mut skills = existing.skills.clone();
                        skills.extend(index.skills);
                        index.skills = merge_store_entries(skills);
                    }
                }
            }
            registry.store_index = Some(index);
            registry.store_last_error = warning;
            write_registry_to(&storage_root, &registry)?;
            Ok(json!({ "store": store_value(&registry) }))
        }
        Err(error) => {
            registry.store_last_error = Some(error.to_string());
            let _ = write_registry_to(&storage_root, &registry);
            Err(error)
        }
    }
}

pub(crate) fn skill_update_store_config(payload: Value) -> AgentRuntimeResult<Value> {
    skill_refresh_store(payload)
}

pub(crate) fn skill_install_from_store(payload: Value) -> AgentRuntimeResult<Value> {
    let skill_id = string_opt(&payload, "skillId")
        .ok_or_else(|| AgentRuntimeError::Core("skillId is required".to_string()))?;
    let storage_root = skill_storage_root();
    let mut registry = read_registry_from(&storage_root);
    registry.store_index_url = default_store_index_url();
    if registry.store_index.is_none() {
        skill_refresh_store(json!({}))?;
        registry = read_registry_from(&storage_root);
    }
    let entry = registry
        .store_index
        .as_ref()
        .and_then(|index| index.skills.iter().find(|skill| skill.id == skill_id))
        .cloned()
        .ok_or_else(|| {
            AgentRuntimeError::Core(format!("Lyra skill store entry not found: {skill_id}"))
        })?;
    let recorded_source = SkillSource::Store {
        skill_id: skill_id.clone(),
        index_url: registry.store_index_url.clone(),
        source: Some(Box::new(entry.source.clone())),
    };
    let skill = install_skill_source(&storage_root, entry.source, recorded_source)?;
    policy::set_global_default(&skill.id, true)?;
    Ok(json!({ "skill": skill_value(&skill, true, true) }))
}

pub(crate) fn skill_uninstall(payload: Value) -> AgentRuntimeResult<Value> {
    let skill_id = string_opt(&payload, "skillId")
        .ok_or_else(|| AgentRuntimeError::Core("skillId is required".to_string()))?;
    let storage_root = skill_storage_root();
    let _guard = mutation_lock()
        .lock()
        .map_err(|_| AgentRuntimeError::Core("skill registry lock failed".into()))?;
    let mut registry = read_registry_from(&storage_root);
    let removed = registry
        .installed
        .iter()
        .find(|skill| skill.id == skill_id)
        .cloned();
    registry.installed.retain(|skill| skill.id != skill_id);
    write_registry_to(&storage_root, &registry)?;
    if let Some(skill) = removed.as_ref() {
        let _ = fs::remove_dir_all(&skill.package_path);
    }
    policy::set_global_default(&skill_id, false)?;
    Ok(json!({ "skillId": skill_id, "removed": removed.is_some() }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;
    use zip::write::SimpleFileOptions;

    fn write_skill(root: &Path, body: &str) {
        fs::create_dir_all(root).expect("create skill dir");
        fs::write(root.join(SKILL_MD_FILE_NAME), body).expect("write skill");
    }

    #[test]
    fn concurrent_installs_keep_both_global_catalog_entries() {
        let temp = tempdir().unwrap();
        let storage = temp.path().join("storage");
        let packages = [temp.path().join("first"), temp.path().join("second")];
        for (index, path) in packages.iter().enumerate() {
            write_skill(
                path,
                &format!(
                    "---\nid: concurrent-{index}\nname: Concurrent {index}\n---\nInstructions"
                ),
            );
        }
        let barrier = std::sync::Barrier::new(2);
        std::thread::scope(|scope| {
            for path in &packages {
                let storage = &storage;
                let barrier = &barrier;
                scope.spawn(move || {
                    barrier.wait();
                    install_package_from_root(
                        storage,
                        path,
                        SkillSource::Local {
                            path: path.to_string_lossy().into_owned(),
                        },
                    )
                    .unwrap();
                });
            }
        });
        let ids = read_registry_from(&storage)
            .installed
            .into_iter()
            .map(|skill| skill.id)
            .collect::<HashSet<_>>();
        assert_eq!(
            ids,
            HashSet::from(["concurrent-0".into(), "concurrent-1".into()])
        );
    }

    #[test]
    fn parses_skill_md_frontmatter_and_prompt() {
        let temp = tempdir().expect("tempdir");
        write_skill(
            temp.path(),
            r#"---
id: review-skill
name: Review Skill
description: Review code
version: 1.2.3
permissions:
  - files.read
toolPaths:
  - /tools/file/read
---
Use the review checklist.
"#,
        );

        let manifest = parse_skill_package(temp.path()).expect("parse skill");
        assert_eq!(manifest.id, "review-skill");
        assert_eq!(manifest.name, "Review Skill");
        assert_eq!(manifest.version, "1.2.3");
        assert_eq!(manifest.permissions, vec!["files.read"]);
        assert_eq!(manifest.tool_paths, vec!["/tools/file/read"]);
        assert_eq!(manifest.prompt, "Use the review checklist.");
    }

    #[test]
    fn installs_local_skill_and_writes_registry() {
        let temp = tempdir().expect("tempdir");
        let package = temp.path().join("package");
        let storage = temp.path().join("storage");
        write_skill(
            &package,
            r#"---
id: test-skill
name: Test Skill
---
Do the test thing.
"#,
        );

        let source = SkillSource::Local {
            path: package.to_string_lossy().to_string(),
        };
        let installed = install_skill_source(&storage, source.clone(), source).expect("install");
        assert_eq!(installed.id, "test-skill");
        assert!(Path::new(&installed.prompt_path).exists());
        let registry = read_registry_from(&storage);
        assert_eq!(registry.installed.len(), 1);
        assert_eq!(registry.installed[0].id, "test-skill");
    }

    #[test]
    fn installs_local_zip_skill() {
        let temp = tempdir().expect("tempdir");
        let storage = temp.path().join("storage");
        let archive_path = temp.path().join("skill.zip");
        let archive_file = fs::File::create(&archive_path).expect("create zip");
        let mut archive = zip::ZipWriter::new(archive_file);
        archive
            .start_file("review/SKILL.md", SimpleFileOptions::default())
            .expect("start skill file");
        archive
            .write_all(
                br#"---
id: zip-skill
name: Zip Skill
---
Use zip-installed instructions.
"#,
            )
            .expect("write skill");
        archive.finish().expect("finish zip");

        let source = SkillSource::Local {
            path: archive_path.to_string_lossy().to_string(),
        };
        let installed = install_local_archive(&storage, &archive_path, source).expect("install");
        assert_eq!(installed.id, "zip-skill");
        assert!(installed.manifest.prompt.contains("zip-installed"));
    }

    #[test]
    fn locates_nested_skill_package_root() {
        let temp = tempdir().expect("tempdir");
        let skill_root = temp.path().join("repo").join("skills").join("review");
        write_skill(
            &skill_root,
            r#"---
id: nested-review
---
Review nested packages.
"#,
        );

        let found = locate_skill_package_root(&temp.path().join("repo"), Some("skills/review"))
            .expect("locate skill");
        assert_eq!(found, skill_root);
    }

    #[test]
    fn merge_store_entries_deduplicates_git_source() {
        let source = SkillSource::Git {
            url: "https://github.com/acme/skills.git".to_string(),
            ref_name: None,
            subdir: Some("skills/review".to_string()),
        };
        let entries = merge_store_entries(vec![
            SkillStoreEntry {
                id: "skills.sh:acme/skills/review".to_string(),
                name: "Review".to_string(),
                version: String::new(),
                description: String::new(),
                source: source.clone(),
                permissions: Vec::new(),
                tool_paths: Vec::new(),
                source_registry: Some("skills.sh".to_string()),
                source_url: None,
                installs: Some(1),
                stars: None,
                score: None,
            },
            SkillStoreEntry {
                id: "claude-plugins:review".to_string(),
                name: "Review".to_string(),
                version: String::new(),
                description: String::new(),
                source,
                permissions: Vec::new(),
                tool_paths: Vec::new(),
                source_registry: Some("claude-plugins.dev".to_string()),
                source_url: None,
                installs: Some(10),
                stars: None,
                score: None,
            },
        ]);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "claude-plugins:review");
    }

    #[test]
    fn active_skill_prompt_uses_active_ids() {
        let temp = tempdir().expect("tempdir");
        let package = temp.path().join("package");
        let storage = temp.path().join("storage");
        write_skill(
            &package,
            r#"---
id: active-skill
name: Active Skill
---
Always say active.
"#,
        );
        let source = SkillSource::Local {
            path: package.to_string_lossy().to_string(),
        };
        install_skill_source(&storage, source.clone(), source).expect("install");
        let registry = read_registry_from(&storage);
        let active = HashSet::from(["active-skill".to_string()]);
        let prompt = registry
            .installed
            .iter()
            .filter(|skill| active.contains(&skill.id))
            .map(|skill| skill.manifest.prompt.clone())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(prompt.contains("Always say active."));
    }

    #[test]
    fn derives_stable_id_from_name_when_frontmatter_has_no_id() {
        let temp = tempdir().expect("tempdir");
        let package = temp.path().join("skill");
        let storage = temp.path().join("storage");
        write_skill(
            &package,
            r#"---
name: kill-ai-slop
description: Remove AI slop
---
Do the slop cleanup.
"#,
        );

        let source = SkillSource::Local {
            path: package.to_string_lossy().to_string(),
        };
        let installed = install_skill_source(&storage, source.clone(), source).expect("install");
        assert_eq!(installed.id, "kill-ai-slop");
        let registry = read_registry_from(&storage);
        assert_eq!(registry.installed.len(), 1);
        assert_eq!(registry.installed[0].id, "kill-ai-slop");
    }

    #[test]
    fn directory_fallback_id_is_sanitized() {
        let temp = tempdir().expect("tempdir");
        let package = temp.path().join(".hidden-staging-dir");
        let storage = temp.path().join("storage");
        write_skill(
            &package,
            r#"---
description: No id and no name
---
Fallback to a sanitized directory id.
"#,
        );

        let manifest = parse_skill_package(&package).expect("parse skill");
        assert_eq!(manifest.id, "hidden-staging-dir");
        assert!(validate_skill_id(&manifest.id).is_ok());
        let _ = storage;
    }

    #[test]
    fn installs_git_skill_from_temp_repo() {
        let temp = tempdir().expect("tempdir");
        let repo = temp.path().join("repo");
        let storage = temp.path().join("storage");
        write_skill(
            &repo,
            r#"---
id: git-skill
name: Git Skill
---
Use git-installed instructions.
"#,
        );
        Command::new("git")
            .args(["init"])
            .current_dir(&repo)
            .output()
            .expect("git init");
        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(&repo)
            .output()
            .expect("git config email");
        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(&repo)
            .output()
            .expect("git config name");
        Command::new("git")
            .args(["add", "."])
            .current_dir(&repo)
            .output()
            .expect("git add");
        Command::new("git")
            .args(["commit", "-m", "skill"])
            .current_dir(&repo)
            .output()
            .expect("git commit");

        let source = SkillSource::Git {
            url: repo.to_string_lossy().to_string(),
            ref_name: None,
            subdir: None,
        };
        let installed = install_skill_source(&storage, source.clone(), source).expect("install");
        assert_eq!(installed.id, "git-skill");
        assert!(installed.manifest.prompt.contains("git-installed"));
    }
}
