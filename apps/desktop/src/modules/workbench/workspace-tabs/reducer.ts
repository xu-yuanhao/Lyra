import {
  areNavigationAddressesEquivalent,
  resolveReplacementTab,
  toNonEmptyTrimmed,
  toSafeAddress
} from "./navigation";
import { browserPageRestoreStateEquals } from "../../../shared/workbench-browser";
import type { WorkspaceTabsRuntimeState } from "./runtime-state";
import {
  resolveNextSerial,
  sanitizePersistedSnapshot
} from "./session-codec";
import {
  composeSplitGroup,
  exclusiveSplitGroupTabIds,
  insertTabAt,
  keepSplitGroupContiguous,
  reorderSplitGroupByTabId,
  reorderTabsById,
  resolveRuntimeState,
  resolveSplitState
} from "./split-model";
import type {
  WorkspaceAppTabMetaRequest,
  WorkspaceAppTabOpenRequest,
  WorkspaceResolvedNavigation,
  WorkspaceTab,
  WorkspaceTabPageMeta,
  WorkspaceTabPageRuntimeState,
  WorkspaceTabsConfig,
  WorkspaceTabsOptions,
  WorkspaceTabsSessionSnapshot
} from "./types";

export type WorkspaceTabsReducerContext = {
  readonly config: WorkspaceTabsConfig;
  readonly options: WorkspaceTabsOptions;
};

export type WorkspaceTabsReducerAction =
  | { readonly type: "sync-settings-title" }
  | { readonly type: "set-active-tab"; readonly tabId: string }
  | { readonly type: "reorder-tab"; readonly tabId: string; readonly targetIndex: number }
  | {
      readonly type: "split-tab-with-target";
      readonly sourceTabId: string;
      readonly targetTabId: string;
    }
  | { readonly type: "replace-split-group"; readonly tabIds: readonly string[] }
  | { readonly type: "detach-tab-from-split"; readonly tabId: string }
  | { readonly type: "open-new-tab"; readonly tab: WorkspaceTab }
  | { readonly type: "open-settings-tab"; readonly tab: WorkspaceTab }
  | {
      readonly type: "open-terminal-tab";
      readonly terminalTabId: string;
      readonly tab: WorkspaceTab;
      readonly targetIndex?: number;
    }
  | {
      readonly type: "open-app-tab";
      readonly request: WorkspaceAppTabOpenRequest;
      readonly tab: WorkspaceTab;
    }
  | { readonly type: "update-app-tab-meta"; readonly request: WorkspaceAppTabMetaRequest }
  | { readonly type: "close-tab"; readonly tabId: string }
  | {
      readonly type: "close-terminal-tab";
      readonly terminalTabId: string;
      readonly fallbackTab: WorkspaceTab;
    }
  | { readonly type: "open-page-in-new-tab"; readonly tab: WorkspaceTab }
  | { readonly type: "update-page-meta"; readonly tabId: string; readonly meta: WorkspaceTabPageMeta }
  | {
      readonly type: "sync-page-runtime-state";
      readonly tabId: string;
      readonly pageState: WorkspaceTabPageRuntimeState;
 	    }
 	  | { readonly type: "update-active-input"; readonly value: string }
 	  | {
      readonly type: "navigate-active-tab";
      readonly request: WorkspaceResolvedNavigation;
    }
  | {
      readonly type: "open-navigation-tab";
      readonly tab: WorkspaceTab;
    }
  | {
      readonly type: "open-search-tabs";
      readonly tabs: readonly WorkspaceTab[];
    }
  | {
      readonly type: "replace-active-search-tabs";
      readonly tabs: readonly WorkspaceTab[];
    }
  | {
      readonly type: "restore-session";
      readonly snapshot: WorkspaceTabsSessionSnapshot;
    };

export type WorkspaceTabsReduction = {
  readonly state: WorkspaceTabsRuntimeState;
  readonly consumedSerial: boolean;
  readonly nextSerial?: number;
  readonly latestInputValue?: string;
};

const unchanged = (state: WorkspaceTabsRuntimeState): WorkspaceTabsReduction => ({
  state,
  consumedSerial: false
});

const changed = (
  state: WorkspaceTabsRuntimeState,
  effects: Omit<WorkspaceTabsReduction, "state" | "consumedSerial"> & {
    readonly consumedSerial?: boolean;
  } = {}
): WorkspaceTabsReduction => ({
  state,
  consumedSerial: effects.consumedSerial ?? false,
  ...(effects.nextSerial === undefined ? {} : { nextSerial: effects.nextSerial }),
  ...(effects.latestInputValue === undefined
    ? {}
    : { latestInputValue: effects.latestInputValue })
});

const findActiveTab = (state: WorkspaceTabsRuntimeState): WorkspaceTab | undefined =>
  state.tabs.find((tab) => tab.id === state.activeTabId) ?? state.tabs[0];

const insertTabAfterActive = (
  state: WorkspaceTabsRuntimeState,
  tab: WorkspaceTab
): readonly WorkspaceTab[] => {
  const activeIndex = state.tabs.findIndex((candidate) => candidate.id === state.activeTabId);
  const targetIndex = activeIndex < 0 ? state.tabs.length : activeIndex + 1;
  return keepSplitGroupContiguous(
    insertTabAt(state.tabs, tab, targetIndex),
    state.splitGroupTabIds
  );
};

const insertTabsAfterActive = (
  state: WorkspaceTabsRuntimeState,
  tabs: readonly WorkspaceTab[]
): readonly WorkspaceTab[] => {
  const activeIndex = state.tabs.findIndex((candidate) => candidate.id === state.activeTabId);
  const targetIndex = activeIndex < 0 ? state.tabs.length : activeIndex + 1;
  let next = state.tabs;
  tabs.forEach((tab, index) => {
    next = insertTabAt(next, tab, targetIndex + index);
  });
  return keepSplitGroupContiguous(next, state.splitGroupTabIds);
};

const resolveActiveSearchReplacementIds = (
  state: WorkspaceTabsRuntimeState
): readonly string[] => {
  const activeTab = findActiveTab(state);
  if (activeTab === undefined) {
    return [];
  }
  if (activeTab.searchQuery === undefined) {
    return [activeTab.id];
  }
  const candidateIds =
    state.splitGroupTabIds.includes(activeTab.id)
      ? state.splitGroupTabIds
      : [activeTab.id];
  return candidateIds.filter((tabId) => {
    const tab = state.tabs.find((candidate) => candidate.id === tabId);
    return tab?.searchQuery === activeTab.searchQuery;
  });
};

const replaceActiveSearchTabs = (
  state: WorkspaceTabsRuntimeState,
  tabs: readonly WorkspaceTab[],
  config: WorkspaceTabsConfig
): WorkspaceTabsRuntimeState => {
  if (tabs.length === 0) {
    return state;
  }
  const replacementIds = resolveActiveSearchReplacementIds(state);
  const firstReplacementIndex = Math.max(
    0,
    state.tabs.findIndex((tab) => replacementIds.includes(tab.id))
  );
  const remainingTabs = state.tabs.filter((tab) => replacementIds.includes(tab.id) === false);
  const nextTabs = insertTabAt(remainingTabs, tabs[0]!, firstReplacementIndex);
  const withRest = tabs.slice(1).reduce(
    (current, tab, index) => insertTabAt(current, tab, firstReplacementIndex + index + 1),
    nextTabs
  );
  return resolveRuntimeState(
    {
      tabs: withRest,
      activeTabId: tabs[0]!.id,
      splitGroupTabIds: tabs.length >= 2 ? tabs.map((tab) => tab.id) : [],
      focusedSplitTabId: tabs.length >= 2 ? tabs[0]!.id : null
    },
    config
  );
};

const closeTabById = (
  state: WorkspaceTabsRuntimeState,
  tabId: string,
  config: WorkspaceTabsConfig
): WorkspaceTabsRuntimeState => {
  if (state.tabs.length <= 1) {
    return state;
  }

  const removeIndex = state.tabs.findIndex((tab) => tab.id === tabId);
  if (removeIndex < 0) {
    return state;
  }

  const nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
  const nextActiveTabId =
    tabId === state.activeTabId
      ? (nextTabs[removeIndex]?.id ?? nextTabs[removeIndex - 1]?.id ?? nextTabs[0]!.id)
      : state.activeTabId;

  const split = resolveSplitState(
    nextTabs,
    state.splitGroupTabIds.filter((tabIdInSplit) => tabIdInSplit !== tabId),
    state.focusedSplitTabId === tabId ? null : state.focusedSplitTabId
  );

  return resolveRuntimeState(
    {
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
      splitGroupTabIds: split.splitGroupTabIds,
      focusedSplitTabId: split.splitGroupTabIds.includes(nextActiveTabId)
        ? nextActiveTabId
        : split.focusedSplitTabId
    },
    config
  );
};

export const reduceWorkspaceTabsState = (
  state: WorkspaceTabsRuntimeState,
  action: WorkspaceTabsReducerAction,
  context: WorkspaceTabsReducerContext
): WorkspaceTabsReduction => {
  switch (action.type) {
    case "sync-settings-title": {
      let hasChanges = false;
      const nextTabs = state.tabs.map((tab) => {
        if (tab.pageKind !== "settings" || tab.title === context.config.settingsTabTitle) {
          return tab;
        }
        hasChanges = true;
        return {
          ...tab,
          title: context.config.settingsTabTitle
        };
      });

      if (hasChanges === false) {
        return unchanged(state);
      }
      return changed({
        ...state,
        tabs: nextTabs
      });
    }

    case "set-active-tab": {
      const nextTabId = toNonEmptyTrimmed(action.tabId);
      if (nextTabId === null || state.tabs.some((tab) => tab.id === nextTabId) === false) {
        return unchanged(state);
      }

      return changed({
        ...state,
        activeTabId: nextTabId,
        focusedSplitTabId: state.splitGroupTabIds.includes(nextTabId)
          ? nextTabId
          : state.focusedSplitTabId
      });
    }

    case "reorder-tab": {
      const nextTabId = toNonEmptyTrimmed(action.tabId);
      if (nextTabId === null) {
        return unchanged(state);
      }

      const reordered = reorderSplitGroupByTabId(
        state.tabs,
        state.splitGroupTabIds,
        nextTabId,
        action.targetIndex
      );
      return changed({
        ...state,
        tabs: keepSplitGroupContiguous(reordered, state.splitGroupTabIds)
      });
    }

    case "split-tab-with-target": {
      const source = toNonEmptyTrimmed(action.sourceTabId);
      const target = toNonEmptyTrimmed(action.targetTabId);
      if (source === null || target === null || source === target) {
        return unchanged(state);
      }
      if (state.tabs.some((tab) => tab.id === source) === false) {
        return unchanged(state);
      }
      if (state.tabs.some((tab) => tab.id === target) === false) {
        return unchanged(state);
      }

      const candidate = composeSplitGroup(
        state.splitGroupTabIds,
        source,
        target,
        context.options
      );
      if (candidate === null || candidate.length < 2) {
        return unchanged(state);
      }

      return changed({
        ...state,
        activeTabId: source,
        splitGroupTabIds: candidate,
        focusedSplitTabId: source
      });
    }

    case "replace-split-group": {
      const validIds = new Set(state.tabs.map((tab) => tab.id));
      const nextGroup = exclusiveSplitGroupTabIds(
        action.tabIds.filter((tabId) => validIds.has(tabId))
      );
      if (nextGroup.length < 2) {
        const focusId = action.tabIds.find((tabId) => validIds.has(tabId)) ?? state.activeTabId;
        return changed({
          ...state,
          activeTabId: validIds.has(focusId) ? focusId : state.activeTabId,
          splitGroupTabIds: [],
          focusedSplitTabId: null
        });
      }
      const focusId = nextGroup.includes(state.activeTabId)
        ? state.activeTabId
        : (nextGroup[nextGroup.length - 1] ?? nextGroup[0]!);
      return changed({
        ...state,
        activeTabId: focusId,
        splitGroupTabIds: nextGroup,
        focusedSplitTabId: focusId
      });
    }

    case "detach-tab-from-split": {
      const nextTabId = toNonEmptyTrimmed(action.tabId);
      if (nextTabId === null || state.splitGroupTabIds.includes(nextTabId) === false) {
        return unchanged(state);
      }

      const remaining = state.splitGroupTabIds.filter((candidate) => candidate !== nextTabId);
      if (remaining.length <= 1) {
        return changed({
          ...state,
          activeTabId: nextTabId,
          splitGroupTabIds: [],
          focusedSplitTabId: null
        });
      }

      return changed({
        ...state,
        activeTabId: nextTabId,
        splitGroupTabIds: remaining,
        focusedSplitTabId: remaining[0] ?? null
      });
    }

    case "open-new-tab":
      return changed(
        {
          ...state,
          tabs: insertTabAfterActive(state, action.tab),
          activeTabId: action.tab.id
        },
        { consumedSerial: true }
      );

    case "open-settings-tab": {
      const existing = state.tabs.find((tab) => tab.pageKind === "settings");
      if (existing !== undefined) {
        return changed({
          ...state,
          activeTabId: existing.id,
          focusedSplitTabId: state.splitGroupTabIds.includes(existing.id)
            ? existing.id
            : state.focusedSplitTabId
        });
      }

      return changed(
        {
          ...state,
          tabs: insertTabAfterActive(state, action.tab),
          activeTabId: action.tab.id
        },
        { consumedSerial: true }
      );
    }

    case "open-terminal-tab": {
      const existing = state.tabs.find(
        (tab) =>
          tab.pageKind === "terminal" && tab.terminalTabId === action.terminalTabId
      );
      if (existing !== undefined) {
        const nextTabs =
          action.targetIndex === undefined
            ? state.tabs
            : reorderTabsById(state.tabs, existing.id, action.targetIndex);
        const normalizedTabs = keepSplitGroupContiguous(nextTabs, state.splitGroupTabIds);

        return changed({
          ...state,
          tabs: normalizedTabs,
          activeTabId: existing.id,
          focusedSplitTabId: state.splitGroupTabIds.includes(existing.id)
            ? existing.id
            : state.focusedSplitTabId
        });
      }

      return changed(
        {
          ...state,
          tabs: keepSplitGroupContiguous(
            action.targetIndex === undefined
              ? insertTabAfterActive(state, action.tab)
              : insertTabAt(state.tabs, action.tab, action.targetIndex),
            state.splitGroupTabIds
          ),
          activeTabId: action.tab.id
        },
        { consumedSerial: true }
      );
    }

    case "open-app-tab": {
      const existing = state.tabs.find(
        (tab) =>
          tab.pageKind === "app" &&
          tab.appId === action.request.appId &&
          tab.appInstanceId === action.request.appInstanceId
      );
      if (existing !== undefined) {
        return changed({
          ...state,
          activeTabId: existing.id,
          focusedSplitTabId: state.splitGroupTabIds.includes(existing.id)
            ? existing.id
            : state.focusedSplitTabId
        });
      }

      return changed(
        {
          ...state,
          tabs: insertTabAfterActive(state, action.tab),
          activeTabId: action.tab.id
        },
        { consumedSerial: true }
      );
    }

    case "update-app-tab-meta":
      return changed({
        ...state,
        tabs: state.tabs.map((tab) => {
          if (
            tab.pageKind !== "app" ||
            tab.appId !== action.request.appId ||
            tab.appInstanceId !== action.request.appInstanceId
          ) {
            return tab;
          }

          if (
            tab.title === action.request.title
            && tab.appIconKey === action.request.iconKey
            && (action.request.filePath === undefined || tab.filePath === action.request.filePath)
            && (action.request.route === undefined || tab.appRoute === action.request.route)
            && (action.request.opaqueState === undefined
              || tab.appOpaqueState === action.request.opaqueState)
          ) {
            return tab;
          }

          return {
            ...tab,
            title: action.request.title,
            appIconKey: action.request.iconKey,
            ...(action.request.route === undefined
              ? {}
              : { appRoute: action.request.route }),
            ...(action.request.opaqueState === undefined
              ? {}
              : { appOpaqueState: action.request.opaqueState }),
            ...(action.request.filePath === undefined
              ? {}
              : { filePath: action.request.filePath }),
            ...(action.request.fileSessionId === undefined
              ? {}
              : { fileSessionId: action.request.fileSessionId }),
            ...(action.request.isDirty === undefined
              ? {}
              : { isDirty: action.request.isDirty })
          };
        })
      });

    case "close-tab": {
      const nextTabId = toNonEmptyTrimmed(action.tabId);
      if (nextTabId === null) {
        return unchanged(state);
      }
      return changed(closeTabById(state, nextTabId, context.config));
    }

    case "close-terminal-tab": {
      const trimmedId = toNonEmptyTrimmed(action.terminalTabId);
      if (trimmedId === null) {
        return unchanged(state);
      }

      const target = state.tabs.find(
        (tab) => tab.pageKind === "terminal" && tab.terminalTabId === trimmedId
      );
      if (target === undefined) {
        return unchanged(state);
      }

      if (state.tabs.length === 1) {
        return changed(
          {
            tabs: [action.fallbackTab],
            activeTabId: action.fallbackTab.id,
            splitGroupTabIds: [],
            focusedSplitTabId: null
          },
          { consumedSerial: true }
        );
      }

      return changed(closeTabById(state, target.id, context.config));
    }

    case "open-page-in-new-tab": {
      const existing = state.tabs.find((tab) => tab.id === action.tab.id);
      if (existing !== undefined) {
        return changed(
          {
            ...state,
            tabs: state.tabs.map((tab) =>
              tab.id === action.tab.id && tab.pageKind === "page" ? action.tab : tab
            ),
            activeTabId: action.tab.id,
            focusedSplitTabId: state.splitGroupTabIds.includes(action.tab.id)
              ? action.tab.id
              : state.focusedSplitTabId
          },
          {
            latestInputValue: action.tab.inputValue
          }
        );
      }
      return changed(
        {
          ...state,
          tabs: insertTabAfterActive(state, action.tab),
          activeTabId: action.tab.id
        },
        {
          consumedSerial: true,
          latestInputValue: action.tab.inputValue
        }
      );
    }

    case "update-page-meta": {
      if (toNonEmptyTrimmed(action.tabId) === null) {
        return unchanged(state);
      }

      const nextTitle = action.meta.title?.trim();
      const nextFaviconUrl = action.meta.faviconUrl?.trim();
      if (
        (nextTitle === undefined || nextTitle.length === 0) &&
        (nextFaviconUrl === undefined || nextFaviconUrl.length === 0)
      ) {
        return unchanged(state);
      }

      return changed({
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== action.tabId || tab.pageKind !== "page") {
            return tab;
          }

          return {
            ...tab,
            ...(nextTitle !== undefined && nextTitle.length > 0
              ? { title: nextTitle }
              : {}),
            ...(nextFaviconUrl !== undefined && nextFaviconUrl.length > 0
              ? { faviconUrl: nextFaviconUrl }
              : {})
          };
        })
      });
    }

    case "sync-page-runtime-state": {
      if (toNonEmptyTrimmed(action.tabId) === null) {
        return unchanged(state);
      }
      const nextAddress = toSafeAddress(action.pageState.address);
      const nextTitle = toNonEmptyTrimmed(action.pageState.title);
      const nextFaviconUrl = action.pageState.faviconUrl?.trim();
      const nextRestoreState = action.pageState.restoreState;
      if (nextAddress === null || nextTitle === null) {
        return unchanged(state);
      }

      return changed({
        ...state,
        tabs: state.tabs.map((tab) => {
          if (tab.id !== action.tabId || tab.pageKind !== "page") {
            return tab;
          }

          const nextFaviconValue =
            nextFaviconUrl === undefined || nextFaviconUrl.length === 0
              ? undefined
              : nextFaviconUrl;
          const nextDisplayAddress = areNavigationAddressesEquivalent(
            tab.displayAddress,
            nextAddress
          )
            ? tab.displayAddress
            : nextAddress;
          const inputDirty = tab.inputValue !== tab.displayAddress;
          const nextInputValue = inputDirty ? tab.inputValue : nextDisplayAddress;
          if (
            tab.title === nextTitle &&
            tab.displayAddress === nextDisplayAddress &&
            tab.inputValue === nextInputValue &&
            tab.faviconUrl === nextFaviconValue &&
            browserPageRestoreStateEquals(tab.browserRestoreState, nextRestoreState)
          ) {
            return tab;
          }

          return {
            ...tab,
            title: nextTitle,
            displayAddress: nextDisplayAddress,
            inputValue: nextInputValue,
            ...(nextFaviconValue === undefined
              ? {}
              : { faviconUrl: nextFaviconValue }),
            ...(nextRestoreState === undefined
              ? {}
              : { browserRestoreState: nextRestoreState })
          };
        })
      });
    }

    case "update-active-input": {
      const activeTab = findActiveTab(state);
      if (activeTab === undefined) {
        return unchanged(state);
      }

      return changed(
        {
          ...state,
          tabs: state.tabs.map((tab) =>
            tab.id === activeTab.id
              ? {
                  ...tab,
                  inputValue: action.value
                }
              : tab
          )
        },
        { latestInputValue: action.value }
      );
    }

    case "navigate-active-tab": {
      const activeTab = findActiveTab(state);
      if (activeTab === undefined) {
        return unchanged(state);
      }

      const replacement = resolveReplacementTab(
        activeTab,
        action.request,
        context.config
      );
      return changed(
        {
          ...state,
          tabs: state.tabs.map((tab) => (tab.id === activeTab.id ? replacement : tab))
        },
        { latestInputValue: replacement.inputValue }
      );
    }

    case "open-navigation-tab":
      return changed(
        {
          ...state,
          tabs: insertTabAfterActive(state, action.tab),
          activeTabId: action.tab.id
        },
        {
          consumedSerial: true,
          latestInputValue: action.tab.inputValue
        }
      );

    case "open-search-tabs": {
      if (action.tabs.length === 0) {
        return unchanged(state);
      }
      return changed(
        {
          ...state,
          tabs: insertTabsAfterActive(state, action.tabs),
          activeTabId: action.tabs[0]!.id,
          splitGroupTabIds: action.tabs.length >= 2 ? action.tabs.map((tab) => tab.id) : [],
          focusedSplitTabId: action.tabs.length >= 2 ? action.tabs[0]!.id : null
        },
        {
          consumedSerial: true,
          latestInputValue: action.tabs[0]!.inputValue
        }
      );
    }

    case "replace-active-search-tabs": {
      if (action.tabs.length === 0) {
        return unchanged(state);
      }
      return changed(
        replaceActiveSearchTabs(state, action.tabs, context.config),
        {
          consumedSerial: true,
          latestInputValue: action.tabs[0]!.inputValue
        }
      );
    }

    case "restore-session": {
      const restored = sanitizePersistedSnapshot(action.snapshot, context.config);
      if (restored === null) {
        return unchanged(state);
      }

      const nextActive = restored.tabs.find((tab) => tab.id === restored.activeTabId);
      return changed(restored, {
        nextSerial: resolveNextSerial(restored.tabs),
        latestInputValue: nextActive?.inputValue ?? ""
      });
    }
  }
};
