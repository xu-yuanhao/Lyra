import type { LyraAppModule, LyraHostApiV1 } from "@lyra/app-runtime";
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  CORE_HOST_COMMANDS,
  CORE_HOST_EVENTS,
  createWorkspaceAppInstance,
  registerWorkspaceAppModule
} from "../../workspace-apps";
import { useWorkspaceCoreCommandBus } from "../use-workspace-core-command-bus";

describe("workspace Core command bridge", () => {
  test("projects notification and image models through permission-checked JSON commands", async () => {
    let moduleHost: LyraHostApiV1 | null = null;
    const onFilesChanged = vi.fn();
    const module: LyraAppModule = {
      id: "lyra.test-core-bridge",
      version: "1.0.0",
      activate: (host) => {
        moduleHost = host;
        host.subscribeEvent(CORE_HOST_EVENTS.filesChanged, onFilesChanged);
      },
      create: ({ instanceId }) => ({ instanceId }),
      restore: ({ instanceId }) => ({ instanceId }),
      snapshot: () => ({}),
      close: () => undefined,
      deactivate: () => undefined
    };
    const unregister = registerWorkspaceAppModule(module, {
      allowedCapabilities: new Set([
        "notifications:read",
        "apps:open",
        "files:read",
        "files:write",
        "browser:read",
        "browser:navigate",
        "terminal:read",
        "terminal:write",
        "downloads:read",
        "downloads:write",
        "credentials:read",
        "credentials:write"
      ])
    });
    const notificationModel = {
      notifications: [{
        id: "notice-1", title: "Done", preview: "Ready", level: "success",
        source: { id: "test", title: "Test", iconKey: "system" },
        target: { kind: "none" }, createdAt: 1
      }],
      selectedNotificationId: "notice-1",
      unreadCount: 1,
      selectNotification: vi.fn(),
      markAllNotificationsRead: vi.fn(),
      clearNotifications: vi.fn()
    };
    const onOpenNotificationSource = vi.fn();
    const onRequestClearNotifications = vi.fn();
    const onOpenFilesFavorite = vi.fn();
    const imageState = {
      instanceId: "image-1", filePath: "/tmp/a.png", title: "a.png", status: "ready",
      openResult: null, siblingPaths: [], view: {
        zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, background: "checkerboard"
      }
    };
    const imageViewerModel = {
      getState: vi.fn(() => imageState),
      openImage: vi.fn(async () => undefined),
      openAdjacent: vi.fn(async () => undefined),
      setViewport: vi.fn(),
      resetViewport: vi.fn()
    };
    const filesState = {
      instanceId: "files-1",
      status: "ready",
      viewKind: "directory",
      presentationMode: "list",
      title: "src",
      currentLocation: { id: "/project/src", title: "src", kind: "directory", path: "/project/src" },
      history: [],
      historyIndex: 0,
      systemLocations: [],
      favorites: [{
        id: "favorite-web",
        title: "Lyra",
        path: "https://lyra.ltd",
        kind: "web",
        url: "https://lyra.ltd"
      }],
      recentLocations: [],
      disks: [],
      devices: [],
      entries: [],
      trashEntries: [],
      downloadTasks: []
    };
    let publishFilesChanged: ((instanceIds: readonly string[]) => void) | undefined;
    const fileManagerModel = {
      subscribe: vi.fn((listener: (instanceIds: readonly string[]) => void) => {
        publishFilesChanged = listener;
        return () => undefined;
      }),
      ensureInstance: vi.fn(),
      getState: vi.fn(() => filesState),
      openHome: vi.fn(async () => undefined),
      openDirectory: vi.fn(async () => undefined),
      openTrash: vi.fn(async () => undefined),
      openDownloads: vi.fn(async () => undefined),
      goBack: vi.fn(async () => undefined),
      goForward: vi.fn(async () => undefined),
      goUp: vi.fn(async () => undefined),
      refresh: vi.fn(async () => undefined),
      setPresentationMode: vi.fn(),
      selectEntry: vi.fn(),
      selectTrashEntry: vi.fn(),
      beginCreateDraft: vi.fn(),
      updateCreateDraft: vi.fn(),
      commitCreateDraft: vi.fn(async () => undefined),
      moveSelectionToTrash: vi.fn(async () => undefined),
      restoreSelectionFromTrash: vi.fn(async () => undefined),
      emptyTrash: vi.fn(async () => undefined),
      toggleCurrentDirectoryFavorite: vi.fn(async () => undefined)
    };
    const editorState = {
      instanceId: "editor-1",
      sessionId: "session-1",
      filePath: "/project/src/index.ts",
      title: "index.ts",
      status: "ready",
      languageId: "typescript",
      encoding: "utf8",
      content: "export {};",
      lastSavedContent: "export {};",
      isDirty: false,
      isReadOnly: false,
      isHydrated: true,
      sizeBytes: 10
    };
    const fileEditorModel = {
      hydrateIfNeeded: vi.fn(async () => undefined),
      getState: vi.fn(() => editorState),
      ensureInstance: vi.fn(),
      openFile: vi.fn(async () => undefined),
      setContent: vi.fn(),
      save: vi.fn(async () => undefined),
      statFile: vi.fn(async () => ({ path: editorState.filePath, exists: true })),
      requestCompletion: vi.fn(async () => [{ label: "export" }]),
      requestHover: vi.fn(async () => null),
      requestDefinition: vi.fn(async () => []),
      requestReferences: vi.fn(async () => []),
      subscribe: vi.fn(() => () => undefined),
      subscribeLspEvents: vi.fn(() => () => undefined)
    };
    const tabsModel = {
      tabs: [{
        id: "browser-tab-1",
        title: "Example",
        pageKind: "page",
        inputValue: "https://example.com/",
        displayAddress: "https://example.com/",
        faviconUrl: undefined,
        query: undefined
      }],
      activeTabId: "browser-tab-1",
      activeTab: undefined,
      openPageInNewTab: vi.fn(),
      openAppTab: vi.fn(),
      openSettingsTab: vi.fn(),
      setActiveTab: vi.fn(),
      navigateResolvedInput: vi.fn(() => "browser-tab-1"),
      closeTab: vi.fn()
    };
    const goBack = vi.fn(async () => undefined);
    const goForward = vi.fn(async () => undefined);
    const reload = vi.fn(async () => undefined);
    const terminalRead = vi.fn(async () => ({
      sessionId: "terminal-session-1",
      cursor: "4",
      output: "done",
      running: true,
      exitCode: null,
      truncated: false,
      source: "user" as const,
      mode: "shell" as const
    }));
    const terminalWrite = vi.fn(async () => undefined);
    const downloadsList = vi.fn(async () => ({
      tasks: [{
        id: "download-1",
        url: "https://example.com/archive.zip",
        fileName: "archive.zip",
        savePath: "/Downloads/archive.zip",
        directory: "/Downloads",
        protocol: "https",
        source: "manual" as const,
        state: "downloading" as const,
        receivedBytes: 4,
        totalBytes: 8,
        speedBytesPerSecond: 2,
        priority: "normal" as const,
        connectionsRequested: 1,
        connectionsActive: 1,
        canResume: true,
        createdAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z",
        tags: []
      }]
    }));
    const pauseDownload = vi.fn(async () => null);
    const credentialsList = vi.fn(async () => ({
      version: 1 as const,
      generatedAt: "2026-07-31T00:00:00.000Z",
      storageRoot: "/data/credentials",
      passwordsAvailable: true,
      sessions: [],
      credentials: []
    }));
    const revealCredential = vi.fn(async () => ({
      credentialId: "credential-1",
      username: "pete@example.com",
      password: "secret"
    }));
    const terminalPane = {
      id: "pane-1",
      sessionId: "terminal-session-1",
      title: "Shell",
      currentCwd: "/project",
      shell: "/bin/zsh",
      mode: "shell" as const
    };
    const terminalTab = {
      id: "terminal-tab-1",
      title: "Shell",
      orientation: "horizontal" as const,
      paneIds: ["pane-1"],
      activePaneId: "pane-1",
      placement: "workspace" as const
    };
    const terminalModel = {
      state: {
        tabs: [terminalTab],
        panes: { "pane-1": terminalPane },
        activeTabId: "terminal-tab-1"
      },
      dockTabs: [],
      workspaceTabs: [terminalTab],
      getTabPanes: vi.fn(() => [terminalPane]),
      openTabWithPlacement: vi.fn(() => ({ tab: terminalTab, pane: terminalPane })),
      focusPane: vi.fn(),
      closePane: vi.fn(),
      findTab: vi.fn(() => terminalTab)
    };
    const previousDesktopApi = Object.getOwnPropertyDescriptor(window, "lyraDesktop");
    const previousClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeClipboardText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeClipboardText }
    });
    Object.defineProperty(window, "lyraDesktop", {
      configurable: true,
      value: {
        browser: {
          onEvent: vi.fn(() => () => undefined),
          readSessionSnapshot: vi.fn(async () => ({
            tabs: [{
              tabId: "browser-tab-1",
              address: "https://example.com/",
              title: "Example",
              canGoBack: true,
              canGoForward: false,
              profilePartition: "persist:lyra-browser-live",
              restoreState: {}
            }]
          })),
          readStorageState: vi.fn(async ({ profileMode }: { profileMode: string }) => ({
            profileId: `lyra-browser-${profileMode}`,
            profileMode,
            profilePartition: `persist:lyra-browser-${profileMode}`,
            persistence: "chromium-profile",
            cookies: { availability: "unknown", manifestOnly: true }
          })),
          goBack,
          goForward,
          reload,
          clearSiteData: vi.fn(async () => ({
            origin: "https://example.com",
            cookiesRemoved: 0,
            storageCleared: true
          }))
        },
        terminal: {
          read: terminalRead,
          write: terminalWrite,
          onData: vi.fn(() => () => undefined),
          onExit: vi.fn(() => () => undefined),
          onError: vi.fn(() => () => undefined)
        },
        downloads: {
          list: downloadsList,
          pause: pauseDownload,
          onEvent: vi.fn(() => () => undefined)
        },
        loginManager: {
          list: credentialsList,
          revealCredential,
          onEvent: vi.fn(() => () => undefined)
        }
      }
    });
    const hook = renderHook(() => useWorkspaceCoreCommandBus({
      tabsModel: tabsModel as never,
      notificationModel: notificationModel as never,
      imageViewerModel: imageViewerModel as never,
      fileManagerModel: fileManagerModel as never,
      fileEditorModel: fileEditorModel as never,
      terminalModel: terminalModel as never,
      locale: "en-US",
      resolvedThemeId: "classic-light",
      onOpenFile: vi.fn() as never,
      onOpenFilesFavorite,
      onOpenNotificationSource,
      onRequestClearNotifications
    }));
    const instance = await createWorkspaceAppInstance({
      appId: "test-core-bridge", componentId: module.id,
      instanceId: "test-core-bridge-instance", route: "/"
    });
    try {
      const host = moduleHost as LyraHostApiV1 | null;
      if (host === null) throw new Error("test app host was not activated");
      await expect(host.executeCommand(CORE_HOST_COMMANDS.readPresentation, {})).resolves.toEqual({
        locale: "en-US",
        themeId: "classic-light",
        themeTone: "light"
      });
      await expect(host.executeCommand(CORE_HOST_COMMANDS.readNotifications, {})).resolves.toMatchObject({
        unreadCount: 1,
        selectedNotificationId: "notice-1"
      });
      await host.executeCommand(CORE_HOST_COMMANDS.selectNotification, { notificationId: "notice-1" });
      expect(notificationModel.selectNotification).toHaveBeenCalledWith("notice-1");
      await host.executeCommand(CORE_HOST_COMMANDS.openNotificationSource, {
        notificationId: "notice-1"
      });
      expect(onOpenNotificationSource).toHaveBeenCalledWith("notice-1");
      await host.executeCommand(CORE_HOST_COMMANDS.requestClearNotifications, {});
      expect(onRequestClearNotifications).toHaveBeenCalledOnce();
      expect(notificationModel.clearNotifications).not.toHaveBeenCalled();

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readImage, { instanceId: "image-1" }))
        .resolves.toMatchObject({ filePath: "/tmp/a.png" });
      await host.executeCommand(CORE_HOST_COMMANDS.setImageViewport, {
        instanceId: "image-1", zoom: 2, rotation: 90, background: "dark"
      });
      expect(imageViewerModel.setViewport).toHaveBeenCalledWith("image-1", {
        zoom: 2, rotation: 90, background: "dark"
      });

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readFiles, { instanceId: "files-1" }))
        .resolves.toMatchObject({ viewKind: "directory", title: "src" });
      await host.executeCommand(CORE_HOST_COMMANDS.navigateFiles, {
        instanceId: "files-1", direction: "up"
      });
      expect(fileManagerModel.goUp).toHaveBeenCalledWith("files-1");
      await host.executeCommand(CORE_HOST_COMMANDS.createFilesEntry, {
        instanceId: "files-1", kind: "file", name: "new.ts"
      });
      expect(fileManagerModel.beginCreateDraft).toHaveBeenCalledWith("files-1", "file");
      expect(fileManagerModel.updateCreateDraft).toHaveBeenCalledWith("files-1", "new.ts");
      expect(fileManagerModel.commitCreateDraft).toHaveBeenCalledWith("files-1");
      await host.executeCommand(CORE_HOST_COMMANDS.openFilesFavorite, {
        instanceId: "files-1",
        favoriteId: "favorite-web"
      });
      expect(onOpenFilesFavorite).toHaveBeenCalledWith(filesState.favorites[0]);
      publishFilesChanged?.(["files-1"]);
      await vi.waitFor(() => expect(onFilesChanged).toHaveBeenCalledWith({
        kind: "state-changed",
        instanceIds: ["files-1"]
      }));

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readEditor, { instanceId: "editor-1" }))
        .resolves.toMatchObject({ filePath: "/project/src/index.ts" });
      await host.executeCommand(CORE_HOST_COMMANDS.setEditorContent, {
        instanceId: "editor-1", content: "export const answer = 42;"
      });
      expect(fileEditorModel.setContent).toHaveBeenCalledWith(
        "editor-1",
        "export const answer = 42;"
      );
      await host.executeCommand(CORE_HOST_COMMANDS.saveEditor, { instanceId: "editor-1" });
      expect(fileEditorModel.save).toHaveBeenCalledWith("editor-1", "manual");

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readBrowser, {
        instanceId: "lyra.browser:browser-tab-1"
      })).resolves.toMatchObject({
        tabId: "browser-tab-1",
        runtimeAvailable: true,
        tabs: [{ id: "browser-tab-1", address: "https://example.com/" }],
        page: { canGoBack: true, canGoForward: false },
        profiles: [
          { profileId: "lyra-browser-live", profileMode: "live" },
          { profileId: "lyra-browser-isolated", profileMode: "isolated" }
        ]
      });
      await host.executeCommand(CORE_HOST_COMMANDS.navigateBrowser, {
        instanceId: "lyra.browser:browser-tab-1",
        input: "docs.example"
      });
      expect(tabsModel.setActiveTab).toHaveBeenCalledWith("browser-tab-1");
      expect(tabsModel.navigateResolvedInput).toHaveBeenCalledWith(
        { kind: "page", address: "https://docs.example/" },
        { target: "active-tab" }
      );
      await host.executeCommand(CORE_HOST_COMMANDS.goBackBrowser, {
        instanceId: "lyra.browser:browser-tab-1"
      });
      expect(goBack).toHaveBeenCalledWith({ tabId: "browser-tab-1" });
      await host.executeCommand(CORE_HOST_COMMANDS.goForwardBrowser, {
        instanceId: "lyra.browser:browser-tab-1"
      });
      expect(goForward).toHaveBeenCalledWith({ tabId: "browser-tab-1" });
      await host.executeCommand(CORE_HOST_COMMANDS.reloadBrowser, {
        instanceId: "lyra.browser:browser-tab-1",
        ignoreCache: true
      });
      expect(reload).toHaveBeenCalledWith({ tabId: "browser-tab-1", ignoreCache: true });
      await host.executeCommand(CORE_HOST_COMMANDS.closeBrowserTab, {
        instanceId: "lyra.browser:browser-tab-1"
      });
      expect(tabsModel.closeTab).toHaveBeenCalledWith("browser-tab-1");

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readTerminal, {}))
        .resolves.toMatchObject({
          activeTabId: "terminal-tab-1",
          panes: [{ sessionId: "terminal-session-1", currentCwd: "/project" }]
        });
      await host.executeCommand(CORE_HOST_COMMANDS.writeTerminalSession, {
        sessionId: "terminal-session-1",
        text: "git status"
      });
      expect(terminalWrite).toHaveBeenCalledWith({
        sessionId: "terminal-session-1",
        text: "git status",
        appendNewline: true,
        source: "user"
      });
      await expect(host.executeCommand(CORE_HOST_COMMANDS.readTerminalSession, {
        sessionId: "terminal-session-1"
      })).resolves.toMatchObject({ output: "done", running: true });

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readDownloads, {}))
        .resolves.toMatchObject({ tasks: [{ id: "download-1" }] });
      await host.executeCommand(CORE_HOST_COMMANDS.pauseDownload, { taskId: "download-1" });
      expect(pauseDownload).toHaveBeenCalledWith({ taskId: "download-1" });

      await expect(host.executeCommand(CORE_HOST_COMMANDS.readCredentials, {}))
        .resolves.toMatchObject({ passwordsAvailable: true });
      await expect(host.executeCommand(CORE_HOST_COMMANDS.revealCredential, {
        credentialId: "credential-1",
        reason: "user-reveal"
      })).resolves.toMatchObject({ password: "secret" });
      expect(revealCredential).toHaveBeenCalledWith({
        credentialId: "credential-1",
        reason: "user-reveal"
      });
      await expect(host.executeCommand(CORE_HOST_COMMANDS.revealCredential, {
        credentialId: "credential-1",
        reason: "background"
      })).rejects.toThrow("explicit user-reveal intent");
      await expect(host.executeCommand(CORE_HOST_COMMANDS.copyCredential, {
        credentialId: "credential-1",
        reason: "user-copy"
      })).resolves.toBeNull();
      expect(revealCredential).toHaveBeenLastCalledWith({
        credentialId: "credential-1",
        reason: "user-copy"
      });
      expect(writeClipboardText).toHaveBeenCalledWith("secret");

      // A nested instance mounted inside a tab resolves to its host tab; an
      // unbound instance falls back to the tab that owns it as its app.
      const hosted = await createWorkspaceAppInstance({
        appId: "test-core-bridge", componentId: module.id,
        instanceId: "hosted-logins-instance", route: "/",
        hostTabId: "browser-tab-1"
      });
      try {
        await expect(host.executeCommand(CORE_HOST_COMMANDS.workspaceResolveTab, {
          instanceId: "hosted-logins-instance"
        })).resolves.toEqual({ tabId: "browser-tab-1" });
      } finally {
        await hosted.close();
      }
      await expect(host.executeCommand(CORE_HOST_COMMANDS.workspaceResolveTab, {
        instanceId: "unknown-instance"
      })).resolves.toBeNull();
    } finally {
      hook.unmount();
      await instance.close();
      await unregister();
      if (previousDesktopApi === undefined) {
        Reflect.deleteProperty(window, "lyraDesktop");
      } else {
        Object.defineProperty(window, "lyraDesktop", previousDesktopApi);
      }
      if (previousClipboard === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
      } else {
        Object.defineProperty(navigator, "clipboard", previousClipboard);
      }
    }
  });
});
