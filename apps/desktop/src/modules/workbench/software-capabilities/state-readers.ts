import type {
  LoginManagerSnapshot,
  LyraDesktopApi,
  LyraSoftwareManifest,
  SoftwareReadStateRequest,
  SoftwareReadStateResponse
} from "../../../shared/desktop-bridge";
import type { FileManagerModel } from "../file-manager";
import type { ImageViewerModel } from "../image-viewer";
import type { TerminalDockModel } from "../terminal-dock/types";
import type { WorkspaceTabsModel } from "../workspace-tabs";
import {
  nonEmptyString,
  toRecord
} from "./validation";

export type SoftwareStateReaders = {
  readonly findActiveSoftwareTab: (softwareId: string) => WorkspaceTabsModel["tabs"][number] | null;
  readonly readFileManagerState: () => unknown;
  readonly readImageViewerState: (request?: SoftwareReadStateRequest) => unknown;
  readonly readTerminalState: () => unknown;
  readonly readBrowserState: () => unknown;
  readonly readLoginManagerState: () => unknown;
  readonly readSoftwareState: (request?: SoftwareReadStateRequest) => SoftwareReadStateResponse;
};

export const redactedLoginManagerSnapshot = (
  snapshot: LoginManagerSnapshot | null
) => {
  if (snapshot === null) {
    return {
      available: false,
      message: "Login Manager state is not loaded yet."
    };
  }
  return {
    available: true,
    generatedAt: snapshot.generatedAt,
    passwordsAvailable: snapshot.passwordsAvailable,
    passwordStorageReason: snapshot.passwordStorageReason,
    sessions: snapshot.sessions.map((session) => ({
      id: session.id,
      origin: session.origin,
      hostname: session.hostname,
      title: session.title,
      address: session.address,
      status: session.status,
      accountHint: session.accountHint,
      notes: session.notes,
      authMethod: session.authMethod,
      authMethodSource: session.authMethodSource,
      signals: session.signals,
      credentialIds: session.credentialIds,
      firstSeenAt: session.firstSeenAt,
      lastSeenAt: session.lastSeenAt,
      updatedAt: session.updatedAt
    })),
    credentials: snapshot.credentials.map((credential) => ({
      id: credential.id,
      origin: credential.origin,
      hostname: credential.hostname,
      username: credential.username,
      usernameLabel: credential.usernameLabel,
      authMethod: credential.authMethod,
      hasPassword: credential.hasPassword,
      passwordAvailable: credential.passwordAvailable,
      passwordRef: credential.passwordRef,
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
      lastUsedAt: credential.lastUsedAt
    }))
  };
};

export const createSoftwareStateReaders = ({
  desktopApi,
  tabsModel,
  fileManagerModel,
  imageViewerModel,
  terminalModel,
  loginManagerSnapshot,
  software
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly tabsModel: WorkspaceTabsModel;
  readonly fileManagerModel: FileManagerModel;
  readonly imageViewerModel: ImageViewerModel | undefined;
  readonly terminalModel: TerminalDockModel | undefined;
  readonly loginManagerSnapshot: LoginManagerSnapshot | null;
  readonly software: readonly LyraSoftwareManifest[];
}): SoftwareStateReaders => {
  const findActiveSoftwareTab = (softwareId: string) =>
    tabsModel.tabs.find((tab) =>
      tab.id === tabsModel.activeTabId && tab.appId === softwareId
    )
    ?? tabsModel.tabs.find((tab) => tab.appId === softwareId)
    ?? null;

  const readFileManagerState = () => {
    const tab = findActiveSoftwareTab("file-manager");
    if (tab?.appInstanceId === undefined) {
      return {
        available: false,
        message: "No File Manager tab is open."
      };
    }
    const state = fileManagerModel.getState(tab.appInstanceId);
    if (state === null) {
      return {
        available: false,
        tabId: tab.id,
        appInstanceId: tab.appInstanceId,
        message: "File Manager state is unavailable."
      };
    }
    return {
      available: true,
      tabId: tab.id,
      appInstanceId: tab.appInstanceId,
      viewKind: state.viewKind,
      currentLocation: state.currentLocation,
      selectedEntryId: state.selectedEntryIds[state.selectedEntryIds.length - 1],
      entries: state.entries.slice(0, 100).map((entry) => ({
        id: entry.id,
        name: entry.name,
        path: entry.path,
        kind: entry.kind,
        sizeBytes: entry.sizeBytes,
        modifiedAt: entry.modifiedAt
      })),
      truncated: state.entries.length > 100
    };
  };

  const readImageViewerState = (request?: SoftwareReadStateRequest) => {
    const requestedInstanceId = request?.softwareId === "image-viewer"
      ? nonEmptyString(toRecord(request).instanceId)
      : null;
    const tab =
      requestedInstanceId === null
        ? findActiveSoftwareTab("image-viewer")
        : tabsModel.tabs.find((entry) => entry.appInstanceId === requestedInstanceId) ?? null;
    const instanceId = requestedInstanceId ?? tab?.appInstanceId ?? null;
    if (imageViewerModel === undefined || instanceId === null) {
      return {
        available: false,
        message: "No Image Viewer tab is open."
      };
    }
    const state = imageViewerModel.getState(instanceId);
    if (state === null) {
      return {
        available: false,
        appInstanceId: instanceId,
        message: "Image Viewer state is unavailable."
      };
    }
    return {
      available: true,
      tabId: tab?.id,
      appInstanceId: instanceId,
      filePath: state.openResult?.path ?? state.filePath,
      status: state.status,
      metadata: state.openResult,
      viewport: state.view,
      siblingIndex: state.siblingIndex,
      siblingCount: state.siblingPaths.length
    };
  };

  const readTerminalState = () => {
    if (terminalModel === undefined) {
      return {
        available: false,
        message: "Terminal model is unavailable."
      };
    }
    const activeTab = terminalModel.activeDockTab
      ?? terminalModel.workspaceTabs.find((tab) => tab.id === tabsModel.activeTabId)
      ?? terminalModel.dockTabs[0]
      ?? terminalModel.workspaceTabs[0]
      ?? null;
    if (activeTab === null) {
      return {
        available: false,
        message: "No terminal tab is open."
      };
    }
    const panes = terminalModel.getTabPanes(activeTab.id);
    return {
      available: true,
      tabId: activeTab.id,
      activePaneId: activeTab.activePaneId,
      panes: panes.map((pane) => ({
        paneId: pane.id,
        sessionId: pane.sessionId,
        title: pane.title,
        cwd: pane.cwd,
        shell: pane.shell,
        ...(pane.sourceAgentSessionId === undefined
          ? {}
          : { sourceAgentSessionId: pane.sourceAgentSessionId }),
        active: pane.id === activeTab.activePaneId
      })),
      activeOutput: "",
      visibleBufferUnavailable: true,
      message:
        "Terminal pane metadata is available. Visible buffer projection is not exposed by the current terminal model."
    };
  };

  const readBrowserState = () => ({
    activeTabId: tabsModel.activeTabId,
    pages: tabsModel.tabs
      .filter((tab) => tab.pageKind === "page")
      .map((tab) => ({
        tabId: tab.id,
        title: tab.title,
        address: tab.displayAddress,
        active: tab.id === tabsModel.activeTabId
      })),
    searchTabs: tabsModel.tabs
      .filter((tab) => tab.pageKind === "search" || tab.pageKind === "results")
      .map((tab) => ({
        tabId: tab.id,
        title: tab.title,
        query: tab.query ?? tab.inputValue,
        active: tab.id === tabsModel.activeTabId
      })),
    downloadAwareness: {
      source: desktopApi?.downloads === undefined ? "file-manager" : "download-manager",
      bridgeAvailable: desktopApi?.downloads !== undefined,
      state: readFileManagerState()
    }
  });

  const readLoginManagerState = () =>
    redactedLoginManagerSnapshot(loginManagerSnapshot);

  const readSoftwareState = (
    request: SoftwareReadStateRequest = {}
  ): SoftwareReadStateResponse => {
    const softwareId = nonEmptyString(request.softwareId);
    if (softwareId === "browser-search") {
      return { softwareId, state: readBrowserState() };
    }
    if (softwareId === "file-manager") {
      return { softwareId, state: readFileManagerState() };
    }
    if (softwareId === "image-viewer") {
      return { softwareId, state: readImageViewerState(request) };
    }
    if (softwareId === "terminal") {
      return { softwareId, state: readTerminalState() };
    }
    if (softwareId === "login-manager") {
      return { softwareId, state: readLoginManagerState() };
    }
    if (softwareId === "software-store") {
      return {
        softwareId,
        state: {
          installed: software.map((entry) => ({
            id: entry.id,
            title: entry.title,
            source: entry.source,
            actionCount: entry.actions.length
          }))
        }
      };
    }
    return {
      ...(softwareId === null ? {} : { softwareId }),
      state: {
        activeTabId: tabsModel.activeTabId,
        browser: readBrowserState(),
        fileManager: readFileManagerState(),
        imageViewer: readImageViewerState(request),
        loginManager: readLoginManagerState(),
        terminal: readTerminalState(),
        software: software.map((entry) => ({
          id: entry.id,
          title: entry.title,
          source: entry.source,
          actionCount: entry.actions.length
        }))
      }
    };
  };

  return {
    findActiveSoftwareTab,
    readFileManagerState,
    readImageViewerState,
    readTerminalState,
    readBrowserState,
    readLoginManagerState,
    readSoftwareState
  };
};
