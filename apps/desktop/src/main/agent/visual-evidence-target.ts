import type {
  WorkbenchObservedTabDescriptor,
  WorkbenchTabsListResult
} from "../../shared/workbench-observation";

export type VisualEvidenceTarget =
  | { readonly mode: "active_tab"; readonly tabId: string }
  | { readonly mode: "workspace_window" }
  // An explicit tabId that no longer matches any listed tab: the reference
  // is stale and must fail with a named error instead of being passed
  // deeper (hermes/ZCode: "ref is stale, take a fresh snapshot").
  | { readonly mode: "unresolved_tab"; readonly requestedTabId: string };

const isBrowserPageTab = (tab: WorkbenchObservedTabDescriptor): boolean =>
  tab.pageKind === "page" || tab.observationKind === "page";

const resolveTabId = (
  requestedTabId: string,
  tabs: readonly WorkbenchObservedTabDescriptor[]
): string | null => {
  const exact = tabs.find((tab) => tab.tabId === requestedTabId);
  if (exact !== undefined) {
    return exact.tabId;
  }
  const suffix = `-${requestedTabId}`;
  const suffixMatches = tabs.filter((tab) => tab.tabId.endsWith(suffix));
  if (suffixMatches.length === 1) {
    return suffixMatches[0]?.tabId ?? null;
  }
  const browserMatch = tabs.find((tab) => tab.tabId === `browser-tab-${requestedTabId}`);
  return browserMatch?.tabId ?? null;
};

const readRequestedTabId = (request: Record<string, unknown>): string | null => {
  const value = request.tabId;
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
};

const findActiveTab = (
  tabs: readonly WorkbenchObservedTabDescriptor[],
  activeTabId: string | null
): WorkbenchObservedTabDescriptor | null =>
  tabs.find((tab) => tab.tabId === activeTabId)
  ?? tabs.find((tab) => tab.active)
  ?? null;

const findBrowserTab = (
  tabs: readonly WorkbenchObservedTabDescriptor[],
  activeTabId: string | null,
  requestedTabId: string | null
): WorkbenchObservedTabDescriptor | null => {
  if (requestedTabId !== null) {
    const resolvedId = resolveTabId(requestedTabId, tabs) ?? requestedTabId;
    const requested = tabs.find((tab) => tab.tabId === resolvedId);
    if (requested !== undefined && isBrowserPageTab(requested)) {
      return requested;
    }
  }
  const active = findActiveTab(tabs, activeTabId);
  if (active !== null && isBrowserPageTab(active)) {
    return active;
  }
  return tabs.find((tab) => tab.visible && isBrowserPageTab(tab))
    ?? tabs.find(isBrowserPageTab)
    ?? null;
};

export const resolveVisualEvidenceTarget = (
  request: Record<string, unknown>,
  listed: WorkbenchTabsListResult
): VisualEvidenceTarget => {
  const scope =
    request.scope === "active_tab" || request.scope === "workspace_window"
      ? request.scope
      : null;
  const requestedTabId = readRequestedTabId(request);
  if (scope === "workspace_window") {
    return { mode: "workspace_window" };
  }
  const browserTab = findBrowserTab(listed.tabs, listed.activeTabId, requestedTabId);
  if (scope === "active_tab") {
    if (requestedTabId !== null) {
      const resolvedId = resolveTabId(requestedTabId, listed.tabs);
      if (resolvedId === null) {
        return { mode: "unresolved_tab", requestedTabId };
      }
      return { mode: "active_tab", tabId: resolvedId };
    }
    if (browserTab !== null) {
      return { mode: "active_tab", tabId: browserTab.tabId };
    }
    return { mode: "workspace_window" };
  }
  // Omit scope: a visible/active browser page is the screenshot the user can see.
  if (browserTab !== null) {
    return { mode: "active_tab", tabId: browserTab.tabId };
  }
  return { mode: "workspace_window" };
};
