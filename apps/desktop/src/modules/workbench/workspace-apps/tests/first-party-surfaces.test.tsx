import type {
  HostEventHandlerV1,
  JsonValue,
  LyraHostApiV1,
  LyraNestedAppSlotsV1,
  WorkspaceTabV2
} from "@lyra/app-runtime";
import type {
  FirstPartyCodeDiffHandleV1,
  FirstPartyCodeDiffMountOptionsV1,
  FirstPartyCodeEditorHandleV1,
  FirstPartyCodeEditorMountOptionsV1,
  FirstPartyCodeEditorUpdateV1
} from "@lyra/workbench-ui-runtime";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as React from "react";
import * as ReactDomClient from "react-dom/client";
import * as ReactJsxRuntime from "react/jsx-runtime";

import { installFirstPartyUiRuntime } from "@lyra/workbench-ui-runtime/host";

import { lyraAppModule as imagesModule } from "../../../../../../lyra-images/src/index";
import { lyraAppModule as notificationsModule } from "../../../../../../lyra-notifications/src/index";
import { lyraAppModule as filesModule } from "../../../../../../lyra-files/src/index";
import { lyraAppModule as editorModule } from "../../../../../../lyra-editor/src/index";
import { lyraAppModule as browserModule } from "../../../../../../lyra-browser/src/index";
import { lyraAppModule as agentModule } from "../../../../../../lyra-agent/src/index";
import { lyraAppModule as credentialsModule } from "../../../../../../lyra-credentials/src/index";
import { isolatedSurfaceSlots } from "./nested-slot-test-helper";

const mounted: HTMLElement[] = [];
let latestEditorMount: FirstPartyCodeEditorMountOptionsV1 | null = null;
let latestDiffMount: FirstPartyCodeDiffMountOptionsV1 | null = null;
const editorUpdates: FirstPartyCodeEditorUpdateV1[] = [];

installFirstPartyUiRuntime({
  react: React,
  reactDomClient: ReactDomClient,
  jsxRuntime: ReactJsxRuntime,
  services: {
    codeEditor: {
      mountEditor: async (options): Promise<FirstPartyCodeEditorHandleV1> => {
        latestEditorMount = options;
        let value = options.value;
        let selection = options.selection ?? null;
        options.container.dataset.fakeMonaco = "editor";
        return {
          getValue: () => value,
          getSelection: () => selection,
          update: (update) => {
            editorUpdates.push(update);
            if (update.value !== undefined) value = update.value;
            if (update.selection !== undefined) selection = update.selection;
          },
          focus: () => options.onFocusChange?.(true),
          layout: () => undefined,
          dispose: () => {
            options.onFocusChange?.(false);
            delete options.container.dataset.fakeMonaco;
          }
        };
      },
      mountDiff: async (options): Promise<FirstPartyCodeDiffHandleV1> => {
        latestDiffMount = options;
        options.container.dataset.fakeMonaco = "diff";
        return {
          update: () => undefined,
          layout: () => undefined,
          dispose: () => {
            delete options.container.dataset.fakeMonaco;
          }
        };
      }
    }
  }
});

afterEach(() => {
  for (const element of mounted.splice(0)) element.remove();
  latestEditorMount = null;
  latestDiffMount = null;
  editorUpdates.splice(0);
});

const appendHostEventHandler = (
  handlers: Map<string, HostEventHandlerV1[]>,
  eventId: string,
  handler: HostEventHandlerV1
): void => {
  const existing = handlers.get(eventId) ?? [];
  handlers.set(eventId, [...existing, handler]);
};

const emitHostEvent = async (
  handlers: Map<string, HostEventHandlerV1[]>,
  eventId: string,
  payload: JsonValue
): Promise<void> => {
  for (const handler of handlers.get(eventId) ?? []) {
    await handler(payload);
  }
};

const handleFirstPartyChromeHostCommand = (commandId: string): JsonValue | undefined => {
  if (commandId === "lyra.core.workspace.resolve-tab") {
    return { tabId: "first-party-test-tab" };
  }
  if (commandId === "lyra.core.chrome.set" || commandId === "lyra.core.chrome.clear") {
    return null;
  }
  return undefined;
};

const createHost = (
  executeCommand: LyraHostApiV1["executeCommand"],
  onSubscribe?: (eventId: string, handler: HostEventHandlerV1) => void,
  onPresentationSubscribe?: (eventId: string, handler: HostEventHandlerV1) => void
): LyraHostApiV1 => ({
  apiVersion: "1.0.0",
  executeCommand,
  invokeCapability: async () => null,
  registerCommand: () => ({ dispose() {} }),
  registerCapability: () => ({ dispose() {} }),
  subscribeEvent: (eventId, handler) => {
    if (
      eventId === "lyra.core.locale-changed"
      || eventId === "lyra.core.theme-changed"
    ) {
      onPresentationSubscribe?.(eventId, handler);
    } else {
      onSubscribe?.(eventId, handler);
    }
    return { dispose() {} };
  }
});

const createContainer = (): HTMLElement => {
  const container = document.createElement("div");
  document.body.append(container);
  mounted.push(container);
  return container;
};

describe("independently shipped first-party surfaces", () => {
  test("notification center reads Core state, reacts to events, and executes actions", async () => {
    let notificationEntries: Array<Record<string, JsonValue>> = [{
      id: "notice-1",
      title: "Download complete",
      preview: "archive.zip",
      level: "success",
      source: { title: "Downloads" },
      target: { kind: "page-tab", address: "https://example.com" },
      createdAt: 1
    }];
    const execute = vi.fn(async (commandId: string, _input?: JsonValue): Promise<JsonValue> => {
      const chrome = handleFirstPartyChromeHostCommand(commandId);
      if (chrome !== undefined) {
        return chrome;
      }
      if (commandId === "lyra.core.notifications.read") {
        return {
          notifications: notificationEntries,
          selectedNotificationId: notificationEntries.length > 0 ? "notice-1" : null,
          unreadCount: notificationEntries.filter((entry) => entry.readAt === undefined).length
        };
      }
      if (commandId === "lyra.core.notifications.mark-all-read") {
        notificationEntries = notificationEntries.map((entry) => ({ ...entry, readAt: 2 }));
      }
      return null;
    });
    const eventHandlers = new Map<string, HostEventHandlerV1[]>();
    const host = createHost(execute, (eventId, handler) => {
      appendHostEventHandler(eventHandlers, eventId, handler);
    });
    await notificationsModule.activate(host);
    const instance = await notificationsModule.create({
      host, appId: "notification-center", instanceId: "notifications-test", route: "/"
    });
    const container = createContainer();
    await act(async () => notificationsModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("Download complete"));
    expect(container.querySelector('[data-lyra-component="lyra.notifications"]')).not.toBeNull();
    expect(container.querySelector(".lyra-notification-center")).not.toBeNull();
    const firstRow = container.querySelector(".lyra-notification-center-item");
    expect(firstRow).toHaveClass("lyra-app-object-row", "lyra-notification-center-item-unread");
    fireEvent.click(firstRow!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.notifications.select",
      { notificationId: "notice-1" }
    ));
    expect(await notificationsModule.snapshot(instance)).toEqual({ selectedNotificationId: "notice-1" });
    fireEvent.click([...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Open source"))!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.notifications.open-source",
      { notificationId: "notice-1" }
    ));
    await act(async () => {
      await execute("lyra.core.notifications.mark-all-read", {});
      await emitHostEvent(eventHandlers, "lyra.core.notifications-changed", { unreadCount: 0 });
    });
    await waitFor(() => expect(container.querySelector(".lyra-notification-center-item-unread")).toBeNull());
    await act(async () => {
      await execute("lyra.core.notifications.request-clear", {});
    });
    expect(execute).toHaveBeenCalledWith("lyra.core.notifications.request-clear", {});
    expect(container.textContent).toContain("Download complete");
    notificationEntries = [];
    await act(async () => emitHostEvent(eventHandlers, "lyra.core.notifications-changed", { unreadCount: 0 }));
    await waitFor(() => expect(container.textContent).toContain("No notifications"));
    await act(async () => emitHostEvent(eventHandlers, "lyra.core.notifications-changed", { unreadCount: 0 }));
    await waitFor(() => expect(
      execute.mock.calls.filter(([id]) => id === "lyra.core.notifications.read").length
    ).toBeGreaterThanOrEqual(2));

    await act(async () => notificationsModule.unmount?.(instance));
    await notificationsModule.close(instance);
    await notificationsModule.deactivate();
  });

  test("notification center restores its selected notification as opaque module state", async () => {
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> => {
      const chrome = handleFirstPartyChromeHostCommand(commandId);
      if (chrome !== undefined) {
        return chrome;
      }
      if (commandId === "lyra.core.notifications.read") {
        return {
          notifications: [
            {
              id: "notice-1", title: "First", preview: "First preview", level: "info",
              source: { title: "System" }, target: { kind: "none" }, createdAt: 1
            },
            {
              id: "notice-2", title: "Restored", preview: "Restored preview", level: "info",
              source: { title: "System" }, target: { kind: "none" }, createdAt: 2
            }
          ],
          selectedNotificationId: "notice-1",
          unreadCount: 2
        };
      }
      return null;
    });
    const host = createHost(execute);
    await notificationsModule.activate(host);
    const instance = await notificationsModule.restore({
      host,
      appId: "notification-center",
      instanceId: "notifications-restored",
      route: "/",
      opaqueState: { selectedNotificationId: "notice-2" }
    });
    const container = createContainer();
    await act(async () => notificationsModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(
      container.querySelector(".lyra-notification-center-detail-title-wrap strong")?.textContent
    ).toBe("Restored"));
    expect(await notificationsModule.snapshot(instance)).toEqual({
      selectedNotificationId: "notice-2"
    });

    await act(async () => notificationsModule.unmount?.(instance));
    await notificationsModule.close(instance);
    await notificationsModule.deactivate();
  });

  test("notification center follows Core locale presentation changes without remounting", async () => {
    const handlers = new Map<string, HostEventHandlerV1[]>();
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> => {
      const chrome = handleFirstPartyChromeHostCommand(commandId);
      if (chrome !== undefined) {
        return chrome;
      }
      if (commandId === "lyra.core.presentation.read") {
        return { locale: "en-US", themeId: "classic-light", themeTone: "light" };
      }
      if (commandId === "lyra.core.notifications.read") {
        return { notifications: [], selectedNotificationId: null, unreadCount: 0 };
      }
      return null;
    });
    const host = createHost(
      execute,
      (eventId, handler) => appendHostEventHandler(handlers, eventId, handler),
      (eventId, handler) => appendHostEventHandler(handlers, eventId, handler)
    );
    await notificationsModule.activate(host);
    const instance = await notificationsModule.create({
      host,
      appId: "notification-center",
      instanceId: "notifications-locale",
      route: "/"
    });
    const container = createContainer();
    await act(async () => notificationsModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("No notifications"));
    await waitFor(() => expect(execute).toHaveBeenCalledWith("lyra.core.presentation.read", {}));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => emitHostEvent(handlers, "lyra.core.locale-changed", { locale: "zh-CN" }));
    await waitFor(() => expect(container.textContent).toContain("暂无通知"));

    await act(async () => notificationsModule.unmount?.(instance));
    await notificationsModule.close(instance);
    await notificationsModule.deactivate();
  });

  test("images surface renders native metadata and delegates viewport changes", async () => {
    const state: JsonValue = {
      instanceId: "image-test",
      filePath: "/tmp/cat.png",
      title: "cat.png",
      status: "ready",
      openResult: {
        sessionId: "session-1", title: "cat.png", format: "png", mimeType: "image/png",
        width: 640, height: 480, sizeBytes: 2048, sourceUrl: "data:image/png;base64,iVBORw0KGgo=",
        nativeTileSupported: false, cacheState: "none", importProgress: 1
      },
      siblingPaths: [],
      view: { zoom: 1, offsetX: 0, offsetY: 0, rotation: 0, background: "checkerboard" }
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> =>
      commandId === "lyra.core.images.read" ? state : null);
    const host = createHost(execute);
    await imagesModule.activate(host);
    const instance = await imagesModule.create({
      host, appId: "image-viewer", instanceId: "image-test", route: "/"
    });
    const container = createContainer();
    await act(async () => imagesModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("640×480 · PNG · 2.0 KB"));
    fireEvent.click([...container.querySelectorAll("button")].find((button) => button.textContent === "Zoom in")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.images.set-viewport",
      { instanceId: "image-test", zoom: 1.25 }
    ));

    await act(async () => imagesModule.unmount?.(instance));
    await imagesModule.close(instance);
    await imagesModule.deactivate();
  });

  test("Browser delegates tabs and WebContents navigation to Core and snapshots local input", async () => {
    const browserState: JsonValue = {
      instanceId: "lyra.browser:browser-tab-1",
      tabId: "browser-tab-1",
      activeTabId: "browser-tab-1",
      runtimeAvailable: true,
      tabs: [
        {
          id: "browser-tab-1",
          title: "Example",
          kind: "page",
          address: "https://example.com/",
          active: true
        },
        {
          id: "browser-tab-2",
          title: "Search",
          kind: "search",
          address: "lyra://search",
          active: false
        }
      ],
      page: {
        tabId: "browser-tab-1",
        address: "https://example.com/",
        title: "Example",
        canGoBack: true,
        canGoForward: false,
        lifecycleState: "foreground"
      },
      profiles: [
        {
          profileId: "lyra-browser-live",
          profileMode: "live",
          profilePartition: "persist:lyra-browser-live",
          persistence: "chromium-profile",
          cookies: { availability: "available", count: 2 }
        },
        {
          profileId: "lyra-browser-isolated",
          profileMode: "isolated",
          profilePartition: "persist:lyra-browser-isolated",
          persistence: "chromium-profile",
          cookies: { availability: "unknown" }
        }
      ],
      history: [
        {
          id: "https://history.example/",
          url: "https://history.example/",
          title: "History example",
          visitedAt: "2026-07-30T00:00:00.000Z",
          visitCount: 3
        }
      ]
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> =>
      commandId === "lyra.core.browser.read" ? browserState : null);
    let browserEventHandler: HostEventHandlerV1 | undefined;
    const host = createHost(execute, (eventId, handler) => {
      expect(eventId).toBe("lyra.core.browser-changed");
      browserEventHandler = handler;
    });
    await browserModule.activate(host);
    const instance = await browserModule.create({
      host,
      appId: "browser",
      instanceId: "lyra.browser:browser-tab-1",
      route: "https://example.com/"
    });
    const container = createContainer();
    await act(async () => browserModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("History example"));
    expect(container.textContent).toContain("live · lyra-browser-live · 2 cookies");

    const address = container.querySelector<HTMLInputElement>(
      'input[aria-label="Enter an address or search"]'
    );
    expect(address).not.toBeNull();
    fireEvent.focus(address!);
    fireEvent.change(address!, { target: { value: "modular browser" } });
    fireEvent.submit(address!.closest("form")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.browser.navigate",
      {
        instanceId: "lyra.browser:browser-tab-1",
        input: "modular browser"
      }
    ));

    fireEvent.click(container.querySelector<HTMLButtonElement>('button[aria-label="Back"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.browser.go-back",
      { instanceId: "lyra.browser:browser-tab-1" }
    ));

    const secondTab = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Search");
    fireEvent.click(secondTab!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.browser.activate-tab",
      {
        instanceId: "lyra.browser:browser-tab-1",
        tabId: "browser-tab-2"
      }
    ));

    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("History example"))!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.browser.navigate",
      {
        instanceId: "lyra.browser:browser-tab-1",
        input: "https://history.example/"
      }
    ));
    await act(async () => browserEventHandler?.({ kind: "page-runtime-state" }));
    await waitFor(() => expect(
      execute.mock.calls.filter(([id]) => id === "lyra.core.browser.read").length
    ).toBeGreaterThanOrEqual(2));
    expect(await browserModule.snapshot(instance)).toMatchObject({
      tabId: "browser-tab-1",
      activeTabId: "browser-tab-1"
    });

    await act(async () => browserModule.unmount?.(instance));
    await browserModule.close(instance);
    await browserModule.deactivate();
  });

  test("Credentials keeps secrets out of snapshots and delegates copy/fill to Core", async () => {
    const snapshot: JsonValue = {
      generatedAt: "2026-07-31T00:00:00.000Z",
      passwordsAvailable: true,
      sessions: [{
        id: "session-1",
        origin: "https://example.com",
        hostname: "example.com",
        title: "Example",
        address: "https://example.com/login",
        authMethod: { kind: "password", label: "Password", source: "observed" },
        authMethodSource: "observed",
        lastSeenAt: "2026-07-31T00:00:00.000Z"
      }],
      credentials: [{
        id: "credential-1",
        origin: "https://example.com",
        hostname: "example.com",
        username: "pete@example.com",
        authMethod: { label: "Password" },
        hasPassword: true,
        passwordAvailable: true,
        updatedAt: "2026-07-31T00:00:00.000Z"
      }]
    };
    const execute = vi.fn(async (commandId: string, _input?: JsonValue): Promise<JsonValue> => {
      const chrome = handleFirstPartyChromeHostCommand(commandId);
      if (chrome !== undefined) {
        return chrome;
      }
      if (commandId === "lyra.core.credentials.read") return snapshot;
      return null;
    });
    let credentialsEventHandler: HostEventHandlerV1 | undefined;
    const host = createHost(execute, (eventId, handler) => {
      expect(eventId).toBe("lyra.core.credentials-changed");
      credentialsEventHandler = handler;
    });
    await credentialsModule.activate(host);
    const instance = await credentialsModule.create({
      host,
      appId: "login-manager",
      instanceId: "credentials-test",
      route: "/"
    });
    const container = createContainer();
    await act(async () => credentialsModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.querySelector(".lyra-login-manager-embedded-list")).not.toBeNull());
    expect(container.querySelector('[data-lyra-component="lyra.credentials"]')).not.toBeNull();
    expect(container.querySelector(".lyra-login-manager-embedded")).not.toBeNull();
    expect(container.querySelector(".lyra-login-manager-detail")).toBeNull();
    expect(container.querySelector('input[placeholder="Search sites, accounts, methods, or notes"]')).not.toBeNull();
    expect(container.textContent).toContain("Sessions");
    expect(container.textContent).toContain("Review");
    expect(container.textContent).toContain("Passwords");
    expect(container.textContent).not.toContain("Saved credentials");
    expect(container.textContent).not.toContain("Credentials");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Reveal password")).toBe(false);

    fireEvent.click(container.querySelector('button[aria-label="Fill"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.credentials.fill",
      { credentialId: "credential-1", reason: "user-fill" }
    ));
    fireEvent.click(container.querySelector('button[aria-label="Copy"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.credentials.copy",
      { credentialId: "credential-1", reason: "user-copy" }
    ));
    fireEvent.click(container.querySelectorAll('button[aria-label="Open site"]')[0]!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.navigate",
      { address: "https://example.com/login", title: "Example" }
    ));
    fireEvent.click(container.querySelector('button[aria-label="Log out site"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.credentials.clear-site",
      { sessionId: "session-1" }
    ));
    fireEvent.click(container.querySelector('button[aria-label="Delete password"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.credentials.delete",
      { credentialId: "credential-1" }
    ));
    expect(JSON.stringify(await credentialsModule.snapshot(instance))).not.toContain("top-secret");
    expect(await credentialsModule.snapshot(instance)).not.toHaveProperty("password");

    await act(async () => credentialsEventHandler?.({ kind: "snapshot-updated" }));
    await waitFor(() => expect(
      execute.mock.calls.filter(([id]) => id === "lyra.core.credentials.read").length
    ).toBeGreaterThanOrEqual(2));

    await act(async () => credentialsModule.unmount?.(instance));
    await credentialsModule.close(instance);
    await credentialsModule.deactivate();
  });

  test("Files reads the production model and delegates navigation and file opening", async () => {
    const state: JsonValue = {
      instanceId: "files-test",
      status: "ready",
      viewKind: "directory",
      presentationMode: "list",
      title: "src",
      currentLocation: {
        id: "/project/src", title: "src", kind: "directory", path: "/project/src"
      },
      parentPath: "/project",
      history: [
        { id: "/project", title: "project", kind: "directory", path: "/project" },
        { id: "/project/src", title: "src", kind: "directory", path: "/project/src" }
      ],
      historyIndex: 1,
      systemLocations: [],
      favorites: [],
      recentLocations: [],
      disks: [],
      devices: [],
      entries: [
        {
          id: "directory-1", name: "components", path: "/project/src/components",
          kind: "directory", isHidden: false, folderState: "non-empty"
        },
        {
          id: "file-1", name: "index.ts", path: "/project/src/index.ts",
          kind: "file", isHidden: false, sizeBytes: 128
        }
      ],
      trashEntries: [],
      downloadTasks: []
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> =>
      commandId === "lyra.core.files.read" ? state : state);
    const host = createHost(execute);
    await filesModule.activate(host);
    const instance = await filesModule.create({
      host, appId: "file-manager", instanceId: "files-test", route: "/"
    });
    const container = createContainer();
    await act(async () => filesModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("index.ts"));
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Back")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.navigate",
      { instanceId: "files-test", direction: "back" }
    ));
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Files")!);
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Downloads")!);
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Trash")!);
    await waitFor(() => {
      expect(execute).toHaveBeenCalledWith("lyra.core.files.open-home", {
        instanceId: "files-test"
      });
      expect(execute).toHaveBeenCalledWith("lyra.core.files.open-downloads", {
        instanceId: "files-test"
      });
      expect(execute).toHaveBeenCalledWith("lyra.core.files.open-trash", {
        instanceId: "files-test"
      });
    });
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Add favorite")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.toggle-favorite",
      { instanceId: "files-test" }
    ));
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "New file")!);
    const createInput = container.querySelector<HTMLInputElement>("input[aria-label='Name']")!;
    fireEvent.change(createInput, { target: { value: "new.ts" } });
    fireEvent.submit(createInput.closest("form")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.create-entry",
      { instanceId: "files-test", kind: "file", name: "new.ts" }
    ));
    const components = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("components"));
    fireEvent.doubleClick(components!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.open-directory",
      { instanceId: "files-test", path: "/project/src/components" }
    ));
    const indexFile = [...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("index.ts"));
    fireEvent.click(indexFile!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.select-entry",
      { instanceId: "files-test", entryId: "file-1" }
    ));
    fireEvent.doubleClick(indexFile!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.open-resource",
      { path: "/project/src/index.ts" }
    ));

    await act(async () => filesModule.unmount?.(instance));
    await filesModule.close(instance);
    await filesModule.deactivate();
  });

  test("Files follows Core change events, opens typed favorites, and confirms destructive actions", async () => {
    let state: JsonValue = {
      instanceId: "files-confirm",
      status: "ready",
      viewKind: "directory",
      presentationMode: "list",
      title: "src",
      currentLocation: {
        id: "/project/src", title: "src", kind: "directory", path: "/project/src"
      },
      parentPath: "/project",
      history: [{ id: "/project/src", title: "src", kind: "directory", path: "/project/src" }],
      historyIndex: 0,
      systemLocations: [],
      favorites: [{
        id: "favorite-web", title: "Lyra docs", path: "https://lyra.ltd/docs",
        kind: "web", url: "https://lyra.ltd/docs"
      }],
      recentLocations: [],
      disks: [],
      devices: [],
      entries: [{
        id: "file-1", name: "old.txt", path: "/project/src/old.txt",
        kind: "file", isHidden: false, sizeBytes: 32
      }],
      trashEntries: [],
      downloadTasks: [],
      selectedEntryIds: ["file-1"],
      selectionAnchorId: "file-1"
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> => {
      if (commandId === "lyra.core.files.move-selection-to-trash") {
        state = {
          ...(state as Record<string, JsonValue>),
          entries: [],
          selectedEntryIds: []
        };
      }
      if (commandId === "lyra.core.files.empty-trash") {
        state = {
          ...(state as Record<string, JsonValue>),
          trashEntries: [],
          selectedTrashEntryId: null
        };
      }
      return state;
    });
    let filesEventHandler: HostEventHandlerV1 | undefined;
    const host = createHost(execute, (eventId, handler) => {
      expect(eventId).toBe("lyra.core.files-changed");
      filesEventHandler = handler;
    });
    await filesModule.activate(host);
    const instance = await filesModule.create({
      host, appId: "file-manager", instanceId: "files-confirm", route: "/"
    });
    const container = createContainer();
    await act(async () => filesModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("old.txt"));
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("Lyra docs"))!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.open-favorite",
      { instanceId: "files-confirm", favoriteId: "favorite-web" }
    ));

    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Move to Trash")!);
    expect(execute).not.toHaveBeenCalledWith(
      "lyra.core.files.move-selection-to-trash",
      expect.anything()
    );
    const firstDialog = container.querySelector<HTMLElement>("[role='alertdialog']");
    expect(firstDialog?.getAttribute("aria-label")).toBe("Move this item to Trash?");
    fireEvent.click([...firstDialog!.querySelectorAll("button")]
      .find((button) => button.textContent === "Cancel")!);
    expect(container.querySelector("[role='alertdialog']")).toBeNull();

    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Move to Trash")!);
    const moveDialog = container.querySelector<HTMLElement>("[role='alertdialog']")!;
    fireEvent.click([...moveDialog.querySelectorAll("button")]
      .find((button) => button.textContent === "Move to Trash")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.move-selection-to-trash",
      { instanceId: "files-confirm" }
    ));

    state = {
      ...(state as Record<string, JsonValue>),
      viewKind: "trash",
      title: "Trash",
      currentLocation: { id: "trash", title: "Trash", kind: "trash", specialId: "trash" },
      trashEntries: [{
        id: "trash-1", name: "old.txt", kind: "file", originalPath: "/project/src/old.txt"
      }]
    };
    await act(async () => filesEventHandler?.({
      kind: "state-changed",
      instanceIds: ["files-confirm"]
    }));
    await waitFor(() => expect(container.textContent).toContain("Empty Trash"));
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Empty Trash")!);
    expect(execute).not.toHaveBeenCalledWith(
      "lyra.core.files.empty-trash",
      expect.anything()
    );
    const emptyDialog = container.querySelector<HTMLElement>("[role='alertdialog']")!;
    expect(emptyDialog.getAttribute("aria-label")).toBe("Permanently empty Trash?");
    fireEvent.click([...emptyDialog.querySelectorAll("button")]
      .find((button) => button.textContent === "Delete permanently")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.files.empty-trash",
      { instanceId: "files-confirm" }
    ));

    await act(async () => filesModule.unmount?.(instance));
    await filesModule.close(instance);
    await filesModule.deactivate();
  });

  test("Editor preserves dirty content through Core and delegates explicit save", async () => {
    let content = "export const answer = 1;";
    let savedContent = content;
    let languageId = "typescript";
    const editorState = (): JsonValue => ({
      instanceId: "editor-test",
      sessionId: "session-1",
      filePath: "/project/index.ts",
      title: "index.ts",
      status: "ready",
      languageId,
      encoding: "utf8",
      content,
      lastSavedContent: savedContent,
      isDirty: content !== savedContent,
      isReadOnly: false,
      isHydrated: true,
      sizeBytes: content.length
    });
    const execute = vi.fn(async (commandId: string, input: JsonValue): Promise<JsonValue> => {
      if (commandId === "lyra.core.presentation.read") {
        return { locale: "en-US", themeId: "classic-dark", themeTone: "dark" };
      }
      if (commandId === "lyra.core.editor.complete") {
        return [{
          label: "answer",
          insertText: "answer",
          detail: "const answer",
          kind: 6
        }];
      }
      if (commandId === "lyra.core.editor.set-content") {
        content = (input as { content: string }).content;
      }
      if (commandId === "lyra.core.editor.save") {
        savedContent = content;
      }
      return editorState();
    });
    const presentationHandlers = new Map<string, HostEventHandlerV1>();
    const host = createHost(
      execute,
      undefined,
      (eventId, handler) => presentationHandlers.set(eventId, handler)
    );
    await editorModule.activate(host);
    const instance = await editorModule.create({
      host, appId: "file-editor", instanceId: "editor-test", route: "/"
    });
    const container = createContainer();
    await act(async () => editorModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(
      container.querySelector('[data-lyra-editor-runtime="monaco"]')
    ).not.toBeNull());
    expect(latestEditorMount?.resourceId).toBe("lyra.editor@1.0.0:editor-test");
    await act(async () => latestEditorMount?.onChange("export const answer = 42;"));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.editor.set-content",
      { instanceId: "editor-test", content: "export const answer = 42;" }
    ));
    const completions = await latestEditorMount?.provideCompletions({ line: 3, column: 7 });
    expect(execute).toHaveBeenCalledWith(
      "lyra.core.editor.complete",
      { instanceId: "editor-test", line: 3, column: 7 }
    );
    expect(completions).toEqual([{
      label: "answer",
      insertText: "answer",
      detail: "const answer",
      kind: 6
    }]);
    await act(async () => latestEditorMount?.onSelectionChange({ start: 7, end: 13 }));
    expect(await editorModule.snapshot(instance)).toEqual({
      filePath: "/project/index.ts",
      selection: { start: 7, end: 13 }
    });
    expect(editorUpdates.some((update) =>
      update.languageId === "typescript"
      && update.presentation?.themeTone === "dark"
    )).toBe(true);
    const compare = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Compare changes");
    fireEvent.click(compare!);
    await waitFor(() => expect(latestDiffMount).toMatchObject({
      resourceId: "lyra.editor@1.0.0:editor-test:diff",
      original: "export const answer = 1;",
      modified: "export const answer = 42;",
      languageId: "typescript"
    }));
    fireEvent.click([...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Close comparison")!);
    languageId = "javascript";
    await act(async () => presentationHandlers.get("lyra.core.theme-changed")?.({
      themeId: "classic-light",
      themeTone: "light"
    }));
    const save = [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Save");
    fireEvent.click(save!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.editor.save",
      { instanceId: "editor-test" }
    ));
    await waitFor(() => expect(editorUpdates.some((update) =>
      update.languageId === "javascript"
      && update.presentation?.themeId === "classic-light"
      && update.presentation.themeTone === "light"
    )).toBe(true));

    await act(async () => editorModule.unmount?.(instance));
    await editorModule.close(instance);
    await editorModule.deactivate();
  });

  test("Editor retains the textarea fallback when Core does not advertise Monaco", async () => {
    const installedRuntime = globalThis.__LYRA_FIRST_PARTY_UI_RUNTIME_V1__;
    globalThis.__LYRA_FIRST_PARTY_UI_RUNTIME_V1__ = undefined;
    const content = "fallback content";
    const state: JsonValue = {
      instanceId: "editor-fallback",
      sessionId: "session-fallback",
      filePath: "/project/fallback.txt",
      title: "fallback.txt",
      status: "ready",
      languageId: "plaintext",
      encoding: "utf8",
      content,
      lastSavedContent: content,
      isDirty: false,
      isReadOnly: false,
      isHydrated: true,
      sizeBytes: content.length
    };
    const execute = vi.fn(async (commandId: string, input: JsonValue): Promise<JsonValue> => {
      if (commandId === "lyra.core.editor.set-content") {
        return { ...(state as Record<string, JsonValue>), content: (input as { content: string }).content };
      }
      return state;
    });
    const host = createHost(execute);
    let instance: Awaited<ReturnType<typeof editorModule.create>> | null = null;
    try {
      await editorModule.activate(host);
      instance = await editorModule.create({
        host, appId: "file-editor", instanceId: "editor-fallback", route: "/"
      });
      const container = createContainer();
      await act(async () => editorModule.mount?.({
        instance: instance!,
        container,
        slots: isolatedSurfaceSlots
      }));
      const fallback = await waitFor(() => {
        const element = container.querySelector('textarea[aria-label="editor-text-surface"]');
        expect(element).not.toBeNull();
        return element as HTMLTextAreaElement;
      });
      fireEvent.change(fallback, { target: { value: "edited fallback" } });
      await waitFor(() => expect(execute).toHaveBeenCalledWith(
        "lyra.core.editor.set-content",
        { instanceId: "editor-fallback", content: "edited fallback" }
      ));
    } finally {
      if (instance !== null) {
        await act(async () => editorModule.unmount?.(instance!));
        await editorModule.close(instance);
      }
      await editorModule.deactivate();
      globalThis.__LYRA_FIRST_PARTY_UI_RUNTIME_V1__ = installedRuntime;
    }
  });

  test("Editor restores its persisted file when a nested Core model is absent", async () => {
    const state: JsonValue = {
      instanceId: "nested-editor-test",
      sessionId: "session-nested",
      filePath: "/project/restored.ts",
      title: "restored.ts",
      status: "ready",
      languageId: "typescript",
      encoding: "utf8",
      content: "export const restored = true;",
      lastSavedContent: "export const restored = true;",
      isDirty: false,
      isReadOnly: false,
      isHydrated: true,
      sizeBytes: 29
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> =>
      commandId === "lyra.core.editor.read" ? null : state);
    const host = createHost(execute);
    await editorModule.activate(host);
    const instance = await editorModule.restore({
      host,
      appId: "file-editor",
      instanceId: "nested-editor-test",
      route: "/",
      opaqueState: { filePath: "/project/restored.ts" }
    });
    const container = createContainer();
    await act(async () => editorModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.editor.open",
      {
        instanceId: "nested-editor-test",
        path: "/project/restored.ts"
      }
    ));
    await waitFor(() => expect(container.textContent).toContain("restored.ts"));

    await act(async () => editorModule.unmount?.(instance));
    await editorModule.close(instance);
    await editorModule.deactivate();
  });

  test("Agent project tree mounts Editor through a Core-owned nested slot", async () => {
    const initialTree: JsonValue = {
      instanceId: "agent-tree-test",
      agentSessionId: "session-1",
      rootPath: "/project",
      title: "project",
      selectedPath: null,
      selectedFilePath: null,
      editorInstanceId: null,
      expandedPaths: [],
      editorTabs: [],
      entries: [{
        id: "file-1",
        name: "index.ts",
        path: "/project/index.ts",
        kind: "file"
      }]
    };
    const openedTree: JsonValue = {
      ...(initialTree as Record<string, JsonValue>),
      selectedPath: "/project/index.ts",
      selectedFilePath: "/project/index.ts",
      editorInstanceId: "agent-project-tree-editor-agent-tree-test",
      editorTabs: [{
        editorInstanceId: "agent-project-tree-editor-agent-tree-test",
        filePath: "/project/index.ts",
        preview: true
      }]
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> =>
      commandId === "lyra.core.agent.project-tree.open-file"
        ? openedTree
        : initialTree);
    const descriptor: WorkspaceTabV2 = {
      schemaVersion: 2,
      appId: "file-editor",
      appVersion: "1.0.0",
      instanceId: "agent-project-tree-editor-agent-tree-test",
      route: "/",
      opaqueState: { filePath: "/project/index.ts" }
    };
    const createNested = vi.fn(async () => ({ ok: true, value: descriptor } as const));
    const mountNested = vi.fn(async () => ({ ok: true, value: null } as const));
    const slots: LyraNestedAppSlotsV1 = {
      create: createNested,
      restore: async () => ({ ok: true, value: descriptor }),
      mount: mountNested,
      unmount: async () => ({ ok: true, value: null }),
      snapshot: async () => ({ ok: true, value: descriptor }),
      close: async () => ({ ok: true, value: descriptor })
    };
    const host = createHost(execute);
    await agentModule.activate(host);
    const instance = await agentModule.create({
      host,
      appId: "agent-project-tree",
      instanceId: "agent-tree-test",
      route: "/"
    });
    const container = createContainer();
    await act(async () => agentModule.mount?.({ instance, container, slots }));
    const fileButton = await waitFor(() => {
      const button = [...container.querySelectorAll("button")]
        .find((candidate) => candidate.textContent?.includes("index.ts"));
      expect(button).toBeDefined();
      return button!;
    });
    fireEvent.click(fileButton);

    await waitFor(() => expect(createNested).toHaveBeenCalledWith(
      "project-editor",
      {
        appId: "file-editor",
        instanceId: "agent-project-tree-editor-agent-tree-test",
        route: "/"
      }
    ));
    await waitFor(() => expect(mountNested).toHaveBeenCalledWith(
      "project-editor",
      expect.any(HTMLElement)
    ));
    await waitFor(async () => expect(await agentModule.snapshot(instance)).toMatchObject({
      selectedPath: "/project/index.ts",
      editorChild: descriptor
    }));

    await act(async () => agentModule.unmount?.(instance));
    await agentModule.close(instance);
    await agentModule.deactivate();
  });
});
