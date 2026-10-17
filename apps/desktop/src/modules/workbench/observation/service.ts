import type {
  WorkbenchTabCloseRequest,
  WorkbenchTabCloseResult,
  WorkbenchTabDetachSplitRequest,
  WorkbenchTabDetachSplitResult,
  WorkbenchTabReorderRequest,
  WorkbenchTabReorderResult,
  WorkbenchTabSplitRequest,
  WorkbenchTabSplitResult,
  WorkbenchTabsLayoutSnapshot,
  WorkbenchTerminalCloseRequest,
  WorkbenchTerminalCloseResult,
  WorkbenchTerminalFocusRequest,
  WorkbenchTerminalFocusResult,
  WorkbenchTerminalListResult,
  WorkbenchTerminalMoveRequest,
  WorkbenchTerminalMoveResult,
  WorkbenchTerminalOpenRequest,
  WorkbenchTerminalOpenResult,
  WorkbenchTerminalPaneDescriptor,
  WorkbenchObservationQueryRequest,
  WorkbenchObservationQueryResult
} from "../../../shared/workbench-observation";
import { disposeTerminalRendererForSession } from "../terminal-dock/pane-surface";
import { isReportableShellCwd } from "../terminal-dock/service";
import type { WorkbenchObservationDependencies } from "./types";
import { listObservedTabs, readObservedLocalTab } from "./local-tab-readers";
import { readObservedWorkspace } from "./workspace-readers";

const embeddedBrowserTab = (
  dependencies: WorkbenchObservationDependencies,
  tabId: string
): boolean =>
  (dependencies.embeddedBrowserPages ?? []).some((page) => page.tabId === tabId);

const ensureWorkbenchTab = (
  dependencies: WorkbenchObservationDependencies,
  tabId: string
): boolean => {
  if (dependencies.tabsModel.tabs.some((tab) => tab.id === tabId)) {
    return true;
  }
  return dependencies.activateEmbeddedBrowserTab?.(tabId) === true;
};

const readWorkbenchLayoutSnapshot = (
  dependencies: WorkbenchObservationDependencies
): WorkbenchTabsLayoutSnapshot => {
  const layout = dependencies.tabsModel.getVisibleWorkspaceLayout();
  return {
    layoutMode: layout.mode,
    splitGroupTabIds: dependencies.tabsModel.splitGroupTabIds,
    focusedSplitTabId: layout.mode === "split" ? layout.focusedSplitTabId : null
  };
};

const closeTerminalSessions = async (
  dependencies: WorkbenchObservationDependencies,
  sessionIds: readonly string[]
): Promise<void> => {
  if (dependencies.desktopApi === null || sessionIds.length === 0) {
    return;
  }
  await Promise.all(
    sessionIds.map((sessionId) =>
      dependencies.desktopApi!.terminal.closeSession({ sessionId }).catch((_error: unknown) => undefined)
    )
  );
  for (const sessionId of sessionIds) {
    disposeTerminalRendererForSession(sessionId);
  }
};

const closeWorkbenchTab = async (
  request: WorkbenchTabCloseRequest,
  dependencies: WorkbenchObservationDependencies
): Promise<WorkbenchTabCloseResult> => {
  const tabId = request.tabId.trim();
  const tab = dependencies.tabsModel.tabs.find((entry) => entry.id === tabId);
  if (tab === undefined) {
    return {
      tabId,
      closed: false,
      activeTabId: dependencies.tabsModel.activeTabId ?? null,
      receipt: `Tab ${tabId} not found; workspace is unchanged.`,
      reason: "tab_not_found"
    };
  }

  if (dependencies.tabsModel.tabs.length <= 1) {
    return {
      tabId,
      closed: false,
      activeTabId: dependencies.tabsModel.activeTabId ?? null,
      receipt: `Tab "${tab.title}" is the last open tab and was not closed; workspace is unchanged.`,
      reason: "last_tab",
      title: tab.title
    };
  }

  if (tab.pageKind === "terminal" && tab.terminalTabId !== undefined) {
    const terminalTab = dependencies.terminalModel.findTab(tab.terminalTabId);
    if (terminalTab !== null) {
      const sessionIds = dependencies.terminalModel
        .getTabPanes(terminalTab.id)
        .map((pane) => pane.sessionId);
      await closeTerminalSessions(dependencies, sessionIds);
      dependencies.terminalModel.closeTab(terminalTab.id);
    }
    dependencies.tabsModel.closeTerminalTab(tab.terminalTabId);
  } else {
    dependencies.tabsModel.closeTab(tabId);
  }

  return {
    tabId,
    closed: true,
    activeTabId: dependencies.tabsModel.activeTabId ?? null,
    receipt: `Closed tab "${tab.title}". The active tab is now ${dependencies.tabsModel.activeTabId ?? "(none)"}; this result is post-mutation and needs no follow-up read.`,
    title: tab.title
  };
};

const reorderWorkbenchTab = (
  request: WorkbenchTabReorderRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTabReorderResult => {
  const tabId = request.tabId.trim();
  const targetIndex = Math.max(0, Math.trunc(request.targetIndex));
  dependencies.tabsModel.reorderTab(tabId, targetIndex);
  return {
    tabId,
    targetIndex,
    tabIds: dependencies.tabsModel.tabs.map((tab) => tab.id),
    layout: readWorkbenchLayoutSnapshot(dependencies),
    receipt: `Reordered tab ${tabId} to index ${targetIndex}. tabIds and layout are post-mutation; no follow-up read needed.`
  };
};

const splitWorkbenchTabs = (
  request: WorkbenchTabSplitRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTabSplitResult => {
  const sourceTabId = request.sourceTabId.trim();
  const targetTabId = request.targetTabId.trim();
  dependencies.tabsModel.splitTabWithTarget(sourceTabId, targetTabId);
  return {
    sourceTabId,
    targetTabId,
    layout: readWorkbenchLayoutSnapshot(dependencies),
    receipt: `Split tab ${sourceTabId} with ${targetTabId}. Layout is post-mutation; no follow-up read needed.`
  };
};

const detachWorkbenchSplit = (
  request: WorkbenchTabDetachSplitRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTabDetachSplitResult => {
  const tabId = request.tabId.trim();
  dependencies.tabsModel.detachTabFromSplit(tabId);
  return {
    tabId,
    layout: readWorkbenchLayoutSnapshot(dependencies),
    receipt: `Detached tab ${tabId} from its split. Layout is post-mutation; no follow-up read needed.`
  };
};

const moveTerminalTab = (
  request: WorkbenchTerminalMoveRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTerminalMoveResult | null => {
  const terminalTabId = request.terminalTabId.trim();
  const targetTab = dependencies.terminalModel.findTab(terminalTabId);
  if (targetTab === null) {
    return null;
  }

  if (request.placement === "workspace") {
    dependencies.terminalModel.moveTabToWorkspace(terminalTabId);
    dependencies.tabsModel.openTerminalTab(
      terminalTabId,
      targetTab.title,
      request.targetIndex === undefined ? undefined : { targetIndex: request.targetIndex }
    );
  } else {
    dependencies.terminalModel.moveTabToDock(terminalTabId);
    dependencies.tabsModel.closeTerminalTab(terminalTabId);
  }

  const activePaneId = targetTab.activePaneId;
  return terminalDescriptorForPane(dependencies, terminalTabId, activePaneId);
};

const toBridgeError = (
  requestId: string,
  code: WorkbenchObservationQueryResult["error"] extends infer T
    ? T extends { readonly code: infer Code }
      ? Code
      : never
    : never,
  message: string
): WorkbenchObservationQueryResult => ({
  requestId,
  ok: false,
  error: {
    code,
    message
  }
});

const terminalDescriptorForPane = (
  dependencies: WorkbenchObservationDependencies,
  terminalTabId: string,
  paneId: string
): WorkbenchTerminalPaneDescriptor | null => {
  const terminalTab = dependencies.terminalModel.findTab(terminalTabId);
  if (terminalTab === null) {
    return null;
  }
  const pane = dependencies.terminalModel.getTabPanes(terminalTab.id)
    .find((entry) => entry.id === paneId);
  if (pane === undefined) {
    return null;
  }
  const reportedCwd = (value: string | undefined): string | undefined =>
    value !== undefined && isReportableShellCwd(value) ? value : undefined;
  const cwd = reportedCwd(pane.cwd);
  const currentCwd = reportedCwd(pane.currentCwd);
  const workspaceTab = dependencies.tabsModel.tabs.find(
    (tab) => tab.pageKind === "terminal" && tab.terminalTabId === terminalTab.id
  );
  return {
    terminalTabId: terminalTab.id,
    paneId: pane.id,
    sessionId: pane.sessionId,
    title: pane.title,
    placement: terminalTab.placement,
    isActive:
      terminalTab.id === dependencies.terminalModel.state.activeTabId
      && terminalTab.activePaneId === pane.id,
    ...(cwd === undefined ? {} : { cwd }),
    ...(currentCwd === undefined ? {} : { currentCwd }),
    ...(pane.shell === undefined ? {} : { shell: pane.shell }),
    ...(pane.sourceAgentSessionId === undefined
      ? {}
      : { sourceAgentSessionId: pane.sourceAgentSessionId }),
    ...(workspaceTab === undefined ? {} : { workspaceTabId: workspaceTab.id })
  };
};

const listTerminalPanes = (
  dependencies: WorkbenchObservationDependencies
): WorkbenchTerminalListResult => {
  const panes = dependencies.terminalModel.state.tabs.flatMap((tab) =>
    tab.paneIds.flatMap((paneId) => {
      const descriptor = terminalDescriptorForPane(dependencies, tab.id, paneId);
      return descriptor === null ? [] : [descriptor];
    })
  );
  const layout = dependencies.tabsModel.getVisibleWorkspaceLayout();
  const focusedWorkspaceTabId =
    layout.mode === "split" ? layout.focusedSplitTabId : dependencies.tabsModel.activeTabId;
  const focusedWorkspaceTab = dependencies.tabsModel.tabs.find(
    (tab) => tab.id === focusedWorkspaceTabId
  );
  const focusedTerminalTabId =
    focusedWorkspaceTab?.pageKind === "terminal"
      ? focusedWorkspaceTab.terminalTabId
      : undefined;
  const active =
    (focusedTerminalTabId === undefined
      ? null
      : panes.find((pane) => pane.terminalTabId === focusedTerminalTabId && pane.isActive)
        ?? panes.find((pane) => pane.terminalTabId === focusedTerminalTabId)
        ?? null)
    ?? panes.find((pane) => pane.isActive)
    ?? panes[0]
    ?? null;
  return { active, panes };
};

const resolveTerminalPane = (
  request: WorkbenchTerminalFocusRequest | WorkbenchTerminalCloseRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTerminalPaneDescriptor | null => {
  const listed = listTerminalPanes(dependencies);
  const sessionId =
    typeof request.sessionId === "string" && request.sessionId.trim().length > 0
      ? request.sessionId.trim()
      : undefined;
  const paneId =
    typeof request.paneId === "string" && request.paneId.trim().length > 0
      ? request.paneId.trim()
      : undefined;
  const terminalTabId =
    typeof request.terminalTabId === "string" && request.terminalTabId.trim().length > 0
      ? request.terminalTabId.trim()
      : undefined;
  return listed.panes.find((pane) => (
    (sessionId === undefined || pane.sessionId === sessionId)
    && (paneId === undefined || pane.paneId === paneId)
    && (terminalTabId === undefined || pane.terminalTabId === terminalTabId)
  )) ?? null;
};

const openTerminalPane = (
  request: WorkbenchTerminalOpenRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTerminalOpenResult => {
  const anchorTerminalTabId =
    typeof request.terminalTabId === "string" && request.terminalTabId.trim().length > 0
      ? request.terminalTabId.trim()
      : undefined;
  if (anchorTerminalTabId !== undefined) {
    const anchorTab = dependencies.terminalModel.findTab(anchorTerminalTabId);
    if (anchorTab !== null) {
      const anchorPaneId =
        typeof request.paneId === "string" && request.paneId.trim().length > 0
          ? request.paneId.trim()
          : undefined;
      if (anchorPaneId !== undefined && anchorTab.paneIds.includes(anchorPaneId)) {
        dependencies.terminalModel.focusPane(anchorTab.id, anchorPaneId);
      }
      const direction = request.splitDirection === "vertical" ? "vertical" : "horizontal";
      const split = dependencies.terminalModel.splitTabWithOptions(anchorTab.id, direction, {
        profileId: "shell",
        mode: "shell",
        ...(typeof request.title === "string" && request.title.trim().length > 0
          ? { title: request.title.trim() }
          : {}),
        ...(typeof request.cwd === "string" && request.cwd.trim().length > 0
          ? { cwd: request.cwd.trim() }
          : {}),
        ...(typeof request.sourceAgentSessionId === "string" && request.sourceAgentSessionId.trim().length > 0
          ? { sourceAgentSessionId: request.sourceAgentSessionId.trim() }
          : {})
      });
      if (split !== null) {
        return {
          terminalTabId: split.tab.id,
          paneId: split.pane.id,
          sessionId: split.pane.sessionId,
          title: split.pane.title,
          placement: split.tab.placement,
          isActive: true,
          ...(split.pane.cwd === undefined ? {} : { cwd: split.pane.cwd }),
          ...(split.pane.currentCwd === undefined ? {} : { currentCwd: split.pane.currentCwd }),
          ...(split.pane.shell === undefined ? {} : { shell: split.pane.shell }),
          ...(split.pane.sourceAgentSessionId === undefined
            ? {}
            : { sourceAgentSessionId: split.pane.sourceAgentSessionId })
        };
      }
    }
  }
  const placement = request.placement === "workspace" ? "workspace" : "dock";
  const { tab, pane } = dependencies.terminalModel.openTabWithPlacement({
    placement,
    ...(typeof request.title === "string" && request.title.trim().length > 0
      ? { title: request.title.trim() }
      : {}),
    ...(typeof request.cwd === "string" && request.cwd.trim().length > 0
      ? { cwd: request.cwd.trim() }
      : {}),
    ...(typeof request.sourceAgentSessionId === "string" && request.sourceAgentSessionId.trim().length > 0
      ? { sourceAgentSessionId: request.sourceAgentSessionId.trim() }
      : {})
  });
  if (placement === "workspace") {
    dependencies.tabsModel.openTerminalTab(tab.id, tab.title);
  }
  const descriptor = terminalDescriptorForPane(dependencies, tab.id, pane.id);
  return descriptor ?? {
    terminalTabId: tab.id,
    paneId: pane.id,
    sessionId: pane.sessionId,
    title: pane.title,
    placement,
    isActive: true
  };
};

const focusTerminalPane = (
  request: WorkbenchTerminalFocusRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTerminalFocusResult | null => {
  const target = resolveTerminalPane(request, dependencies);
  if (target === null) {
    return null;
  }
  dependencies.terminalModel.focusPane(target.terminalTabId, target.paneId);
  if (target.workspaceTabId !== undefined) {
    dependencies.tabsModel.setActiveTab(target.workspaceTabId);
  }
  return {
    ...target,
    isActive: true
  };
};

const closeTerminalPane = (
  request: WorkbenchTerminalCloseRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTerminalCloseResult => {
  const target = resolveTerminalPane(request, dependencies);
  if (target === null) {
    return { closed: false };
  }
  dependencies.terminalModel.closePane(target.terminalTabId, target.paneId);
  if (target.workspaceTabId !== undefined) {
    dependencies.tabsModel.closeTerminalTab(target.terminalTabId);
  }
  return {
    closed: true,
    terminalTabId: target.terminalTabId,
    paneId: target.paneId,
    sessionId: target.sessionId
  };
};

export const attachWorkbenchObservationBridge = (
  dependencies: WorkbenchObservationDependencies
): (() => void) => {
  const desktopApi = dependencies.desktopApi;
  if (desktopApi === null) {
    return () => undefined;
  }

  return desktopApi.workbenchObservation.registerHandler(
    async (request: WorkbenchObservationQueryRequest): Promise<WorkbenchObservationQueryResult> => {
      const requestId = request.requestId;
      try {
        if (request.method === "workbench.tabs.list_local") {
          return {
            requestId,
            ok: true,
            result: listObservedTabs(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.workspace.read_local") {
          return {
            requestId,
            ok: true,
            result: readObservedWorkspace(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.tab.activate_local") {
          const tabId = request.payload.tabId.trim();
          const tabExists = dependencies.tabsModel.tabs.some((tab) => tab.id === tabId);
          if (!tabExists) {
            if (dependencies.activateEmbeddedBrowserTab?.(tabId) === true) {
              return {
                requestId,
                ok: true,
                result: {
                  tabId,
                  activeTabId: tabId
                }
              };
            }
            return toBridgeError(
              requestId,
              "tab_not_found",
              `Workbench tab not found: ${tabId}`
            );
          }
          dependencies.tabsModel.setActiveTab(tabId, { source: "agent" });
          return {
            requestId,
            ok: true,
            result: {
              tabId,
              activeTabId: tabId
            }
          };
        }
        if (request.method === "workbench.terminal.list_local") {
          return {
            requestId,
            ok: true,
            result: listTerminalPanes(dependencies)
          };
        }
        if (request.method === "workbench.terminal.open_local") {
          return {
            requestId,
            ok: true,
            result: openTerminalPane(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.terminal.focus_local") {
          const result = focusTerminalPane(request.payload, dependencies);
          if (result === null) {
            return toBridgeError(
              requestId,
              "terminal_unavailable",
              "Terminal pane not found."
            );
          }
          return {
            requestId,
            ok: true,
            result
          };
        }
        if (request.method === "workbench.terminal.close_local") {
          return {
            requestId,
            ok: true,
            result: closeTerminalPane(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.tab.read_local") {
          const result = readObservedLocalTab(request.payload, dependencies);
          if ("code" in result) {
            return {
              requestId,
              ok: false,
              error: result
            };
          }
          return {
            requestId,
            ok: true,
            result
          };
        }
        if (request.method === "workbench.tab.close_local") {
          const tabId = request.payload.tabId.trim();
          const tabExists = dependencies.tabsModel.tabs.some((tab) => tab.id === tabId);
          if (!tabExists && embeddedBrowserTab(dependencies, tabId)) {
            if (dependencies.closeEmbeddedBrowserTab?.(tabId) === true) {
              return {
                requestId,
                ok: true,
                result: {
                  tabId,
                  closed: true,
                  activeTabId: dependencies.tabsModel.activeTabId ?? null
                }
              };
            }
          }
          if (!tabExists) {
            return toBridgeError(
              requestId,
              "tab_not_found",
              `Workbench tab not found: ${tabId}`
            );
          }
          return {
            requestId,
            ok: true,
            result: await closeWorkbenchTab(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.tab.reorder_local") {
          const tabId = request.payload.tabId.trim();
          const tabExists = ensureWorkbenchTab(dependencies, tabId);
          if (!tabExists) {
            return toBridgeError(
              requestId,
              "tab_not_found",
              `Workbench tab not found: ${tabId}`
            );
          }
          return {
            requestId,
            ok: true,
            result: reorderWorkbenchTab(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.tab.split_local") {
          const sourceTabId = request.payload.sourceTabId.trim();
          const targetTabId = request.payload.targetTabId.trim();
          const sourceExists = ensureWorkbenchTab(dependencies, sourceTabId);
          const targetExists = ensureWorkbenchTab(dependencies, targetTabId);
          if (!sourceExists || !targetExists) {
            return toBridgeError(
              requestId,
              "tab_not_found",
              "One or both workbench tabs were not found for split."
            );
          }
          return {
            requestId,
            ok: true,
            result: splitWorkbenchTabs(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.tab.detach_split_local") {
          const tabId = request.payload.tabId.trim();
          const tabExists = ensureWorkbenchTab(dependencies, tabId);
          if (!tabExists) {
            return toBridgeError(
              requestId,
              "tab_not_found",
              `Workbench tab not found: ${tabId}`
            );
          }
          return {
            requestId,
            ok: true,
            result: detachWorkbenchSplit(request.payload, dependencies)
          };
        }
        if (request.method === "workbench.terminal.move_local") {
          const result = moveTerminalTab(request.payload, dependencies);
          if (result === null) {
            return toBridgeError(
              requestId,
              "terminal_unavailable",
              "Terminal tab not found."
            );
          }
          return {
            requestId,
            ok: true,
            result
          };
        }
        return toBridgeError(
          requestId,
          "unsupported_tab_kind",
          "Unsupported workbench observation method."
        );
      } catch (error: unknown) {
        return toBridgeError(
          requestId,
          "renderer_bridge_unavailable",
          error instanceof Error ? error.message : String(error)
        );
      }
    }
  );
};
