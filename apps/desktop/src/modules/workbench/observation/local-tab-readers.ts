import type { BrowserSearchPayload } from "../browser-search/types";
import { getStandardSearchSnapshot } from "../browser-search/store";
import type { FileManagerEntry } from "../../../shared/file-manager";
import type {
  WorkbenchObservedTabDescriptor,
  WorkbenchObservationError,
  WorkbenchTabReadRequest,
  WorkbenchTabsListRequest,
  WorkbenchTabsListResult
} from "../../../shared/workbench-observation";
import type { WorkbenchObservationDependencies, RendererTabObservationResult } from "./types";

const toError = (
  code: WorkbenchObservationError["code"],
  message: string
): WorkbenchObservationError => ({
  code,
  message
});

const toDescriptorIndex = (
  descriptors: readonly WorkbenchObservedTabDescriptor[]
): ReadonlyMap<string, WorkbenchObservedTabDescriptor> =>
  new Map(descriptors.map((descriptor) => [descriptor.tabId, descriptor]));

const sliceText = (
  value: string,
  maxChars: number
): { readonly content: string; readonly truncated: boolean } =>
  value.length > maxChars
    ? {
        content: value.slice(0, maxChars),
        truncated: true
      }
    : {
        content: value,
        truncated: false
      };

const summarizeStandardResults = (
  payload: BrowserSearchPayload | null,
  query: string,
  maxEntries: number
) => {
  const state = payload;
  const blended = state?.web.payload.blendedResults ?? [];
  return {
    kind: "search-results" as const,
    query,
    webStatus: state?.web.status ?? "idle",
    localStatus: "idle",
    blendedResults: blended.slice(0, maxEntries).map((entry) => ({
      title: entry.title,
      url: entry.url,
      snippet: entry.snippet
    })),
    localResults: [],
    truncated: blended.length > maxEntries
  };
};

const summarizeEntries = (
  entries: readonly FileManagerEntry[],
  maxEntries: number
) => entries.slice(0, maxEntries).map((entry) => ({
  id: entry.id,
  name: entry.name,
  path: entry.path,
  ...(entry.kind === undefined ? {} : { kind: entry.kind }),
  ...(entry.sizeBytes === undefined ? {} : { sizeBytes: entry.sizeBytes }),
  ...(entry.modifiedAt === undefined ? {} : { modifiedAt: entry.modifiedAt })
}));

const summarizeImageViewer = (
  state: ReturnType<WorkbenchObservationDependencies["imageViewerModel"]["getState"]>,
  maxEntries: number
) => {
  if (state === null) return null;
  const openResult = state.openResult;
  const levels = openResult?.levels ?? [];
  return {
    kind: "image-viewer" as const,
    filePath: openResult?.path ?? state.filePath,
    title: openResult?.title ?? state.title,
    status: state.status,
    ...(state.sessionId === undefined ? {} : { sessionId: state.sessionId }),
    ...(state.message === undefined ? {} : { message: state.message }),
    ...(openResult === null
      ? {}
      : {
          mimeType: openResult.mimeType,
          format: openResult.format,
          width: openResult.width,
          height: openResult.height,
          frameCount: openResult.frameCount,
          hasAlpha: openResult.hasAlpha,
          orientation: openResult.orientation,
          colorSpace: openResult.colorSpace,
          sizeBytes: openResult.sizeBytes,
          sourceUrl: openResult.sourceUrl,
          renderMode: openResult.renderMode,
          cacheState: openResult.cacheState,
          cacheId: openResult.cacheId,
          generationId: openResult.generationId,
          sampleFormat: openResult.sampleFormat,
          channelCount: openResult.channelCount,
          tileSize: openResult.tileSize,
          nativeTileSupported: openResult.nativeTileSupported,
          hasInternalTiles: openResult.hasInternalTiles,
          hasInternalMipmaps: openResult.hasInternalMipmaps,
          importProgress: state.importProgress ?? openResult.importProgress
        }),
    levels: levels.slice(0, maxEntries).map((level) => ({
      level: level.level,
      width: level.width,
      height: level.height,
      scale: level.scale
    })),
    viewport: {
      zoom: state.view.zoom,
      offsetX: state.view.offsetX,
      offsetY: state.view.offsetY,
      rotation: state.view.rotation,
      background: state.view.background
    },
    siblingIndex: state.siblingIndex,
    siblingCount: state.siblingPaths.length,
    truncated: levels.length > maxEntries
  };
};

export const listObservedTabs = (
  request: WorkbenchTabsListRequest,
  dependencies: WorkbenchObservationDependencies
): WorkbenchTabsListResult => {
  const { tabsModel } = dependencies;
  const layout = tabsModel.getVisibleWorkspaceLayout();
  const visibleIds = new Set(layout.visibleTabIds);
  const includeUnsupported = request.includeUnsupported !== false;
  const filteredTabs = tabsModel.tabs.filter((tab) => {
    if (request.scope === "active") {
      return tab.id === tabsModel.activeTabId;
    }
    if (request.scope === "visible") {
      return visibleIds.has(tab.id);
    }
    return true;
  });

  const tabs = filteredTabs.flatMap<WorkbenchObservedTabDescriptor>((tab) => {
    const isVisible = visibleIds.has(tab.id);
    const isFocusedPane =
      layout.mode === "split"
        ? layout.focusedSplitTabId === tab.id
        : tabsModel.activeTabId === tab.id;

    const observationKind =
      tab.pageKind === "page"
        ? "page"
          : tab.pageKind === "search"
            ? "search-home"
          : tab.pageKind === "results"
            ? "search-results"
            : tab.pageKind === "terminal"
              ? "terminal"
              : tab.pageKind === "app" && tab.appId === "file-editor"
                ? "file-editor"
              : tab.pageKind === "app" && tab.appId === "file-manager"
                ? "file-manager"
                : tab.pageKind === "app" && tab.appId === "image-viewer"
                  ? "image-viewer"
                  : undefined;
    const observable = observationKind !== undefined;
    if (!observable && !includeUnsupported) {
      return [];
    }
    return [{
      tabId: tab.id,
      title: tab.title,
      pageKind: tab.pageKind,
      ...(tab.appId === undefined ? {} : { appId: tab.appId }),
      ...(tab.appInstanceId === undefined ? {} : { appInstanceId: tab.appInstanceId }),
      active: tab.id === tabsModel.activeTabId,
      visible: isVisible,
      focusedPane: isFocusedPane,
      ...(tab.displayAddress.trim().length === 0 ? {} : { displayAddress: tab.displayAddress }),
      observable,
      ...(observationKind === undefined ? {} : { observationKind })
    }];
  });

  if (request.scope !== "active" && request.scope !== "visible") {
    const listedIds = new Set(tabs.map((tab) => tab.tabId));
    for (const page of dependencies.embeddedBrowserPages ?? []) {
      if (listedIds.has(page.tabId)) {
        continue;
      }
      listedIds.add(page.tabId);
      tabs.push({
        tabId: page.tabId,
        title: page.titleHint ?? page.address,
        pageKind: "page",
        active: false,
        visible: false,
        focusedPane: false,
        ...(page.address.length === 0 ? {} : { displayAddress: page.address }),
        observable: true,
        observationKind: "page"
      });
    }
  }

  return {
    activeTabId: tabsModel.activeTabId ?? null,
    visibleTabIds: layout.visibleTabIds,
    layout: {
      layoutMode: layout.mode,
      splitGroupTabIds: tabsModel.splitGroupTabIds,
      focusedSplitTabId: layout.mode === "split" ? layout.focusedSplitTabId : null
    },
    tabs
  };
};

export const readObservedLocalTab = (
  request: WorkbenchTabReadRequest,
  dependencies: WorkbenchObservationDependencies
): RendererTabObservationResult | WorkbenchObservationError => {
  const descriptors = listObservedTabs({ includeUnsupported: true }, dependencies).tabs;
  const descriptor = toDescriptorIndex(descriptors).get(request.tabId);
  if (descriptor === undefined) {
    return toError("tab_not_found", `Unknown tab: ${request.tabId}`);
  }
  if (descriptor.observable === false || descriptor.observationKind === "page") {
    return toError(
      "unsupported_tab_kind",
      `Local renderer observation is unsupported for ${descriptor.pageKind}.`
    );
  }

  const maxChars = Math.max(1, request.maxChars ?? 12_000);
  const maxEntries = Math.max(1, request.maxEntries ?? 100);
  const tab = dependencies.tabsModel.tabs.find((entry) => entry.id === request.tabId);
  if (tab === undefined) {
    return toError("tab_not_found", `Unknown tab: ${request.tabId}`);
  }

  if (descriptor.observationKind === "file-editor" && tab.appInstanceId !== undefined) {
    const state = dependencies.fileEditorModel.getState(tab.appInstanceId);
    if (state === null) {
      return toError("tab_not_found", `File editor state unavailable: ${request.tabId}`);
    }
    const sliced = sliceText(state.content, maxChars);
    return {
      tab: descriptor,
      observation: {
        kind: "file-editor",
        filePath: state.filePath,
        title: state.title,
        languageId: state.languageId,
        status: state.status,
        isDirty: state.isDirty,
        isReadOnly: state.isReadOnly,
        ...(state.revision === undefined ? {} : { revision: state.revision }),
        content: sliced.content,
        truncated: sliced.truncated
      }
    };
  }

  if (descriptor.observationKind === "file-manager" && tab.appInstanceId !== undefined) {
    const state = dependencies.fileManagerModel.getState(tab.appInstanceId);
    if (state === null) {
      return toError("tab_not_found", `File manager state unavailable: ${request.tabId}`);
    }
    return {
      tab: descriptor,
      observation: {
        kind: "file-manager",
        viewKind: state.viewKind,
        presentationMode: state.presentationMode,
        currentLocation:
          state.currentLocation === null
            ? null
            : {
                kind: state.currentLocation.kind,
                ...(state.currentLocation.path === undefined ? {} : { path: state.currentLocation.path }),
                ...(state.currentLocation.title === undefined ? {} : { title: state.currentLocation.title })
              },
        ...(state.selectedEntryIds.length === 0
          ? {}
          : { selectedEntryId: state.selectedEntryIds[state.selectedEntryIds.length - 1] }),
        entries: summarizeEntries(state.entries, maxEntries),
        truncated: state.entries.length > maxEntries
      }
    };
  }

  if (descriptor.observationKind === "image-viewer" && tab.appInstanceId !== undefined) {
    const observation = summarizeImageViewer(
      dependencies.imageViewerModel.getState(tab.appInstanceId),
      maxEntries
    );
    if (observation === null) {
      return toError("tab_not_found", `Image viewer state unavailable: ${request.tabId}`);
    }
    return {
      tab: descriptor,
      observation
    };
  }

  if (descriptor.observationKind === "terminal") {
    const terminalTabId = tab.terminalTabId ?? tab.id;
    const terminalTab = dependencies.terminalModel.findTab(terminalTabId);
    if (terminalTab === null) {
      return toError("tab_not_found", `Terminal state unavailable: ${request.tabId}`);
    }
    const panes = dependencies.terminalModel.getTabPanes(terminalTab.id);
    return {
      tab: descriptor,
      observation: {
        kind: "terminal",
        activePaneId: terminalTab.activePaneId,
        panes: panes.map((pane) => ({
          paneId: pane.id,
          sessionId: pane.sessionId,
          title: pane.title,
          ...(pane.cwd === undefined ? {} : { cwd: pane.cwd }),
          ...(pane.shell === undefined ? {} : { shell: pane.shell }),
          isActive: pane.id === terminalTab.activePaneId
        })),
        activeOutput: "",
        running: false,
        exitCode: null,
        truncated: false
      }
    };
  }

  if (descriptor.observationKind === "search-home") {
    return {
      tab: descriptor,
      observation: {
        kind: "search-home",
        inputValue: tab.inputValue,
        hasResults: false
      }
    };
  }

  if (descriptor.observationKind === "search-results") {
    return {
      tab: descriptor,
      observation: summarizeStandardResults(
        getStandardSearchSnapshot(tab.id),
        tab.query ?? tab.inputValue,
        maxEntries
      )
    };
  }

  return toError(
    "unsupported_tab_kind",
    `Observation kind is unsupported for ${descriptor.tabId}.`
  );
};
