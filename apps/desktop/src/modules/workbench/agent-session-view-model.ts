import type {
  AgentModelCatalogSnapshot,
  AgentSessionSnapshot
} from "../../shared/agent";
import type { ModelOption, SessionMeta, TodoItem } from "./ai-panel/lyra-agents/core/types";
import { formatMessage } from "@workbench/i18n";

export {
  applyAgentRuntimeEventToSnapshot,
  mergeRunningSessionSnapshot,
  normalizeAgentSessionSnapshot,
  normalizeAgentTurnStatus
} from "./agent-session-view-model/runtime-reducer";
export {
  agentSessionToChatMessages,
  cleanSyntheticImageText,
  formatAgentMessageTime
} from "./agent-session-view-model/message-view-model";

export const agentSessionToSessionMeta = (
  session: AgentSessionSnapshot | null
): SessionMeta => {
  const workingDir = normalizeSessionWorkingDir(session?.workingDir);
  const projectBound = session?.projectBound ?? false;
  const workingDirIsHome = session?.workingDirIsHome ?? false;
  return {
    id: session?.id ?? null,
    title: session?.title ?? "Lyra Agent",
    // Home-bound sessions show "Home" (handled by the UI), not the home folder
    // basename, so leave the project name empty for them.
    project: projectBound && !workingDirIsHome ? projectNameFromWorkingDir(workingDir) : "",
    workingDir,
    projectBound,
    workingDirIsHome,
    totalAdditions: 0,
    totalDeletions: 0,
    tokenEstimate: session?.tokenEstimate ?? null
  };
};

// Surface a draft tab's chosen working directory on the session meta before a
// session is backed by the runtime, so the composer/empty-state can show the
// project name. The draft is not a real binding (projectBound stays false); the
// runtime still treats first-message creation as the moment of binding.
export const agentSessionMetaWithDraftWorkingDir = (
  meta: SessionMeta,
  draftWorkingDir: string | null | undefined
): SessionMeta => {
  const trimmed = typeof draftWorkingDir === "string" ? draftWorkingDir.trim() : "";
  if (trimmed.length === 0) return meta;
  return { ...meta, workingDir: trimmed, project: projectNameFromWorkingDir(trimmed) };
};

const normalizeSessionWorkingDir = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed.length === 0 ? null : trimmed;
};

const projectNameFromWorkingDir = (workingDir: string | null): string => {
  if (workingDir === null) return "";
  const segments = workingDir.split(/[\\/]+/).filter(Boolean);
  return segments.at(-1) ?? workingDir;
};

const todoStatus = (raw: unknown): TodoItem["status"] => {
  if (typeof raw !== "string") return "pending";
  const value = raw.trim().toLowerCase();
  if (["completed", "complete", "done", "success", "succeeded", "cancelled", "canceled"].includes(value)) return "done";
  if (["in_progress", "running", "active", "current", "working"].includes(value)) return "running";
  return "pending";
};

export const agentSessionToTodos = (
  session: AgentSessionSnapshot | null
): TodoItem[] => {
  if (session === null) return [];
  return session.todos
    .map((todo, index) => ({
      id: todo.id,
      title: todo.content.trim().length > 0
        ? todo.content
        : formatMessage("todo.fallback", { index: index + 1 }),
      status: todoStatus(todo.status)
    }))
    .filter((todo) => todo.title.trim().length > 0);
};

export const agentModelsToModelOptions = (
  state: AgentModelCatalogSnapshot | null
): ModelOption[] =>
  (state?.models ?? [])
    .filter((model) =>
      model.available &&
      model.agentUsable !== false &&
      (
        (model.provider ?? "").trim().length > 0 ||
        (model.providerLabel ?? "").trim().length > 0 ||
        (model.apiMethod ?? "").trim().length > 0
      )
    )
    .map((model) => ({
      id: model.id,
      label: model.label,
      model: model.model,
      provider: model.providerLabel ?? model.provider ?? null,
      providerId: model.providerId ?? null,
      providerKey: model.providerKey ?? null,
      detail: model.detail ?? model.apiMethod ?? null,
      available: model.available,
      enabled: model.enabled,
      selected: model.selected ?? false,
      contextWindow: model.contextWindow ?? null
    }));
