import { useEffect, useRef, useState } from "react";
import type { AgentProjectSettings } from "../../../shared/agent-projects";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import { AppButton, AppSearchField, AppSettingsRow, AppSettingsSection, AppSubPageBack, AppSwitch, AppTabs } from "@renderer/ui/components";
import { t } from "../i18n";
import { useProjects } from "./use-projects";
import {
  ST_PROJECTS_GRID_CLASS,
  ST_PROJECTS_TABS_CLASS
} from "../browser-tabs/settings-classes";

export const SettingsProjectsView = ({ desktopApi }: { readonly desktopApi: LyraDesktopApi | null }) => {
  const { projects, loading, error: listError } = useProjects(desktopApi);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentProjectSettings | null>(null);
  const [tab, setTab] = useState<"mcp" | "skill">("mcp");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  const activeProject = useRef(projectId);
  activeProject.current = projectId;
  const agent = desktopApi?.agent;
  useEffect(() => {
    setDetail(null);
    setError(null);
    setPending(false);
    if (!projectId || !agent) return;
    let disposed = false;
    const refresh = async () => {
      const current = ++generation.current;
      try {
        const result = await agent.getProjectSettings({ projectId });
        if (!disposed && current === generation.current) setDetail(result);
      } catch (reason) {
        if (!disposed && current === generation.current) setError(String(reason));
      }
    };
    void refresh();
    const unsubscribe = agent.onEvent((event) => {
      if (event.kind === "projectCapabilitiesChanged") void refresh();
    });
    return () => { disposed = true; generation.current++; unsubscribe(); };
  }, [agent, projectId]);

  const update = async (itemId: string, enabled: boolean | null) => {
    if (!agent || !projectId || pending) return;
    const current = ++generation.current;
    setPending(true);
    setError(null);
    try {
      const result = await agent.setProjectOverride({ projectId, kind: tab, itemId, enabled });
      if (current === generation.current) setDetail(result);
    } catch (reason) {
      if (activeProject.current !== projectId) return;
      setError(String(reason));
      // The switch stays at the server value, including after a failed write.
      const result = await agent.getProjectSettings({ projectId }).catch(() => null);
      if (result && current === generation.current) setDetail(result);
    } finally { if (activeProject.current === projectId) setPending(false); }
  };

  const failure = error ?? listError;
  const errorRow = failure ? <AppSettingsRow role="alert" title={t("settings.projectsError")} description={failure} /> : null;
  if (!projectId) return (
    <AppSettingsSection label={t("settings.projectsCategoryLabel")} titlePlacement="none">
      {projects.map((project) => <AppSettingsRow key={project.id} title={project.name} description={`${project.path}${project.available ? "" : ` · ${t("settings.projectsUnavailable")}`}`} control={
        <AppButton variant="ghost" onClick={() => { setProjectId(project.id); setTab("mcp"); setQuery(""); }}>{project.name}</AppButton>
      } />)}
      {projects.length === 0 ? <AppSettingsRow title={t(loading ? "settings.projectsLoading" : "settings.projectsEmpty")} /> : null}
      {errorRow}
    </AppSettingsSection>
  );
  const items = (tab === "mcp" ? detail?.mcp : detail?.skills) ?? [];
  const filtered = items.filter((item) => `${item.name} ${item.description} ${item.id}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className={ST_PROJECTS_GRID_CLASS}>
    <AppSubPageBack label={t("settings.projectsBack")} onClick={() => setProjectId(null)} />
    {detail ? <AppSettingsRow title={detail.project.name} description={`${detail.project.path}${detail.project.available ? "" : ` · ${t("settings.projectsUnavailable")}`}`} /> : null}
    <AppTabs className={ST_PROJECTS_TABS_CLASS} ariaLabel={t("settings.projectsCategoryLabel")} value={tab} onValueChange={setTab} options={[{ value: "mcp", label: "MCP" }, { value: "skill", label: "Skill" }]} />
    <AppSearchField ariaLabel={t("settings.projectsSearch")} placeholder={t("settings.projectsSearch")} value={query} onValueChange={setQuery} />
    <AppSettingsSection label={tab === "mcp" ? "MCP" : "Skill"}>
      {filtered.map((item) => <AppSettingsRow key={item.id} title={item.name} description={<>{item.description}{item.sourceLabel ? ` · ${item.sourceLabel}` : ""}<br />{t(item.globalEnabled ? "settings.projectsGlobalOn" : "settings.projectsGlobalOff")} · {t(item.override === null ? "settings.projectsFollowGlobal" : "settings.projectsOverride")}</>} control={<>
        <AppButton variant="ghost" disabled={pending || item.override === null} onClick={() => void update(item.id, null)}>{t("settings.projectsReset")}</AppButton>
        <AppSwitch aria-label={item.name} checked={item.enabled} disabled={pending} onCheckedChange={(enabled) => void update(item.id, enabled)} />
      </>} />)}
      {filtered.length === 0 ? <AppSettingsRow title={t(detail ? "settings.projectsNoCapabilities" : "settings.projectsLoading")} /> : null}
      {errorRow}
    </AppSettingsSection>
  </div>;
};
