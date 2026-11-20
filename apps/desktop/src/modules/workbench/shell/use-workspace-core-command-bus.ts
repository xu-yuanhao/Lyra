import { useEffect, useRef } from "react";

import type { JsonValue } from "@lyra/app-runtime";

import type { WorkbenchNotificationModel, WorkbenchNotificationLevel } from "../notifications";
import type { ImageViewerBackground, ImageViewerModel } from "../image-viewer";
import type { FileEditorModel } from "../file-editor";
import type { FileManagerModel } from "../file-manager";
import type { FileManagerFavorite } from "../../../shared/file-manager";
import type { LoginManagerAuthMethodKind, LoginManagerFactSource } from "../../../shared/login-manager";
import type { TerminalDockModel } from "../terminal-dock/types";
import { readBrowserHistoryEntries } from "../browser-history/service";
import type { WorkbenchAppId, WorkspaceAppIconKey } from "../workspace-apps";
import {
  CORE_HOST_COMMANDS,
  CORE_HOST_EVENTS,
  readWorkspaceAppHostTab,
  registerWorkspaceCoreEvent,
  registerWorkspaceCoreCommand
} from "../workspace-apps";
import { isPublicHttpsUrl } from "../../../shared/product-announcements";
import type { WorkspaceTabsModel } from "../workspace-tabs";
import { looksLikeUrl, toSafeAddress } from "../workspace-tabs/navigation";
import type { WorkbenchOpenFileFromManager } from "./use-workbench-file-actions";
import { getDesktopApi } from "./service";
import {
  handleWorkbenchChromeClearCommand,
  handleWorkbenchChromeReadCommand,
  handleWorkbenchChromeSetCommand,
  workbenchChromeBus
} from "./workbench-chrome-bus";

const asRecord = (value: JsonValue): Readonly<Record<string, JsonValue>> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Core command input must be an object.");
  }
  return value as Readonly<Record<string, JsonValue>>;
};

const requiredString = (
  input: Readonly<Record<string, JsonValue>>,
  key: string
): string => {
  const value = input[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Core command field is required: ${key}`);
  }
  return value.trim();
};

const optionalString = (
  input: Readonly<Record<string, JsonValue>>,
  key: string
): string | undefined => {
  const value = input[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
};

const CREDENTIAL_AUTH_METHOD_KINDS: readonly LoginManagerAuthMethodKind[] = [
  "site_session", "password", "passkey", "oauth", "sso", "magic_link", "unknown"
];
const CREDENTIAL_AUTH_METHOD_SOURCES: readonly LoginManagerFactSource[] = [
  "observed", "inferred", "manual", "unknown"
];
const authMethodKindOf = (value: JsonValue | undefined): LoginManagerAuthMethodKind =>
  typeof value === "string" && (CREDENTIAL_AUTH_METHOD_KINDS as readonly string[]).includes(value)
    ? value as LoginManagerAuthMethodKind
    : "unknown";
const authMethodSourceOf = (value: JsonValue | undefined): LoginManagerFactSource =>
  typeof value === "string" && (CREDENTIAL_AUTH_METHOD_SOURCES as readonly string[]).includes(value)
    ? value as LoginManagerFactSource
    : "unknown";

const notificationLevel = (value: JsonValue | undefined): WorkbenchNotificationLevel =>
  value === "success" || value === "warning" || value === "error" ? value : "info";

const optionalNumber = (
  input: Readonly<Record<string, JsonValue>>,
  key: string
): number | undefined => {
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const requiredText = (
  input: Readonly<Record<string, JsonValue>>,
  key: string
): string => {
  const value = input[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Core command field is required: ${key}`);
  }
  return value;
};

const requireSensitiveIntent = (
  input: Readonly<Record<string, JsonValue>>,
  expected: "user-reveal" | "user-copy" | "user-fill"
): void => {
  if (input.reason !== expected) {
    throw new Error(`Core credential action requires explicit ${expected} intent.`);
  }
};

const toJsonValue = (value: unknown): JsonValue =>
  JSON.parse(JSON.stringify(value)) as JsonValue;

const terminalProjection = (terminalModel: TerminalDockModel): JsonValue => ({
  activeTabId: terminalModel.state.activeTabId,
  tabs: [...terminalModel.dockTabs, ...terminalModel.workspaceTabs].map((tab) => ({
    id: tab.id,
    title: tab.title,
    orientation: tab.orientation,
    paneIds: [...tab.paneIds],
    activePaneId: tab.activePaneId,
    placement: tab.placement,
    pinned: tab.pinned === true,
    favorite: tab.favorite === true
  })),
  panes: [...terminalModel.dockTabs, ...terminalModel.workspaceTabs].flatMap((tab) =>
    terminalModel.getTabPanes(tab.id).map((pane) => ({
      id: pane.id,
      tabId: tab.id,
      sessionId: pane.sessionId,
      title: pane.title,
      ...(pane.cwd === undefined ? {} : { cwd: pane.cwd }),
      ...(pane.currentCwd === undefined ? {} : { currentCwd: pane.currentCwd }),
      ...(pane.shell === undefined ? {} : { shell: pane.shell }),
      ...(pane.mode === undefined ? {} : { mode: pane.mode }),
      placement: tab.placement,
      active: pane.id === tab.activePaneId
    }))
  )
});

const isBrowserTab = (
  tab: WorkspaceTabsModel["tabs"][number] | undefined
): tab is WorkspaceTabsModel["tabs"][number] =>
  tab?.pageKind === "page" || tab?.pageKind === "search" || tab?.pageKind === "results";

const browserTabIdFromInput = (
  tabsModel: WorkspaceTabsModel,
  input: Readonly<Record<string, JsonValue>>
): string => {
  const instanceId = optionalString(input, "instanceId");
  const explicitTabId = optionalString(input, "tabId");
  const candidate = explicitTabId
    ?? (instanceId?.startsWith("lyra.browser:") === true
      ? instanceId.slice("lyra.browser:".length)
      : instanceId);
  const tab = tabsModel.tabs.find((entry) => entry.id === candidate);
  if (!isBrowserTab(tab)) {
    throw new Error(`Core browser tab is unavailable: ${candidate ?? "unknown"}`);
  }
  return tab.id;
};

const toBrowserProfileSummary = (value: {
  readonly profileId: string;
  readonly profileMode: string;
  readonly profilePartition: string;
  readonly persistence: string;
  readonly cookies: {
    readonly availability: string;
    readonly count?: number | undefined;
  };
}): JsonValue => ({
  profileId: value.profileId,
  profileMode: value.profileMode,
  profilePartition: value.profilePartition,
  persistence: value.persistence,
  cookies: {
    availability: value.cookies.availability,
    ...(value.cookies.count === undefined ? {} : { count: value.cookies.count })
  }
});

export const useWorkspaceCoreCommandBus = ({
  tabsModel,
  notificationModel,
  imageViewerModel,
  fileManagerModel,
  fileEditorModel,
  terminalModel,
  locale,
  resolvedThemeId,
  onOpenFile,
  onOpenFilesFavorite,
  onOpenNotificationSource,
  onRequestClearNotifications
}: {
  readonly tabsModel: WorkspaceTabsModel;
  readonly notificationModel: WorkbenchNotificationModel;
  readonly imageViewerModel: ImageViewerModel;
  readonly fileManagerModel: FileManagerModel;
  readonly fileEditorModel: FileEditorModel;
  readonly terminalModel: TerminalDockModel;
  readonly locale: string;
  readonly resolvedThemeId: string;
  readonly onOpenFile: WorkbenchOpenFileFromManager;
  readonly onOpenFilesFavorite: (favorite: FileManagerFavorite) => void;
  readonly onOpenNotificationSource: (notificationId: string) => void;
  readonly onRequestClearNotifications: () => void;
}): void => {
  const notificationsEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const filesEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const browserEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const terminalEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const localeEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const themeEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const chromeEventRef = useRef<ReturnType<typeof registerWorkspaceCoreEvent> | null>(null);
  const presentationRef = useRef({ locale, resolvedThemeId });
  presentationRef.current = { locale, resolvedThemeId };

  useEffect(() => {
    // `null` is an explicit public registration. The release permission audit
    // rejects omitted access declarations so new capabilities cannot become
    // public accidentally.
    const localeEvent = registerWorkspaceCoreEvent(CORE_HOST_EVENTS.localeChanged, null);
    const themeEvent = registerWorkspaceCoreEvent(CORE_HOST_EVENTS.themeChanged, null);
    localeEventRef.current = localeEvent;
    themeEventRef.current = themeEvent;
    const presentation = registerWorkspaceCoreCommand(
      CORE_HOST_COMMANDS.readPresentation,
      async () => ({
        locale: presentationRef.current.locale,
        themeId: presentationRef.current.resolvedThemeId,
        themeTone: presentationRef.current.resolvedThemeId.endsWith("-dark")
          ? "dark"
          : "light"
      }),
      null
    );
    return () => {
      localeEventRef.current = null;
      themeEventRef.current = null;
      localeEvent.dispose();
      themeEvent.dispose();
      presentation.dispose();
    };
  }, []);

  useEffect(() => {
    void localeEventRef.current?.emit({ locale }).catch((error: unknown) => {
      console.error("[lyra-workspace-apps] locale event delivery failed", error);
    });
  }, [locale]);

  useEffect(() => {
    void themeEventRef.current?.emit({
      themeId: resolvedThemeId,
      themeTone: resolvedThemeId.endsWith("-dark") ? "dark" : "light"
    }).catch((error: unknown) => {
      console.error("[lyra-workspace-apps] theme event delivery failed", error);
    });
  }, [resolvedThemeId]);

  const tabIdsRef = useRef<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const nextTabIds = new Set(tabsModel.tabs.map((tab) => tab.id));
    for (const tabId of tabIdsRef.current) {
      if (!nextTabIds.has(tabId)) {
        workbenchChromeBus.clearWorkspaceTab(tabId);
      }
    }
    tabIdsRef.current = nextTabIds;
  }, [tabsModel.tabs]);

  useEffect(() => {
    const chromeEvent = registerWorkspaceCoreEvent(CORE_HOST_EVENTS.chromeChanged, null);
    chromeEventRef.current = chromeEvent;
    const unsubscribe = workbenchChromeBus.subscribe((payload) => {
      void chromeEvent.emit(payload as JsonValue).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] chrome event delivery failed", error);
      });
    });
    return () => {
      unsubscribe();
      chromeEventRef.current = null;
      chromeEvent.dispose();
    };
  }, []);

  useEffect(() => {
    const event = registerWorkspaceCoreEvent(
      CORE_HOST_EVENTS.notificationsChanged,
      "notifications:read"
    );
    notificationsEventRef.current = event;
    return () => {
      notificationsEventRef.current = null;
      event.dispose();
    };
  }, []);

  useEffect(() => {
    void notificationsEventRef.current?.emit({
      unreadCount: notificationModel.unreadCount,
      selectedNotificationId: notificationModel.selectedNotificationId
    }).catch((error: unknown) => {
      console.error("[lyra-workspace-apps] notification event delivery failed", error);
    });
  }, [notificationModel.notifications, notificationModel.selectedNotificationId, notificationModel.unreadCount]);

  useEffect(() => {
    const event = registerWorkspaceCoreEvent(
      CORE_HOST_EVENTS.filesChanged,
      "files:read"
    );
    filesEventRef.current = event;
    const unsubscribe = fileManagerModel.subscribe?.((instanceIds) => {
      void event.emit({
        kind: "state-changed",
        instanceIds: [...instanceIds]
      }).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] files event delivery failed", error);
      });
    }) ?? (() => undefined);
    return () => {
      unsubscribe();
      filesEventRef.current = null;
      event.dispose();
    };
  }, [fileManagerModel]);

  useEffect(() => {
    const event = registerWorkspaceCoreEvent(
      CORE_HOST_EVENTS.browserChanged,
      "browser:read"
    );
    browserEventRef.current = event;
    const unsubscribeShell = getDesktopApi()?.browserShell?.onEvent((browserEvent) => {
      const tabId = "tabId" in browserEvent && typeof browserEvent.tabId === "string"
        ? browserEvent.tabId
        : undefined;
      void event.emit({
        kind: browserEvent.kind,
        ...(tabId === undefined ? {} : { tabId })
      }).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] browser event delivery failed", error);
      });
    }) ?? (() => undefined);
    const unsubscribeEngine = getDesktopApi()?.browser?.onEvent((browserEvent) => {
      const tabId = "tabId" in browserEvent && typeof browserEvent.tabId === "string"
        ? browserEvent.tabId
        : browserEvent.kind === "page-runtime-state"
          ? browserEvent.page.tabId
          : undefined;
      void event.emit({
        kind: browserEvent.kind,
        ...(tabId === undefined ? {} : { tabId })
      }).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] browser event delivery failed", error);
      });
    }) ?? (() => undefined);
    return () => {
      unsubscribeShell();
      unsubscribeEngine();
      browserEventRef.current = null;
      event.dispose();
    };
  }, []);

  useEffect(() => {
    void browserEventRef.current?.emit({
      kind: "topology-changed",
      activeTabId: tabsModel.activeTabId
    }).catch((error: unknown) => {
      console.error("[lyra-workspace-apps] browser topology delivery failed", error);
    });
  }, [tabsModel.activeTabId, tabsModel.tabs]);

  useEffect(() => {
    const event = registerWorkspaceCoreEvent(
      CORE_HOST_EVENTS.terminalChanged,
      "terminal:read"
    );
    terminalEventRef.current = event;
    const terminal = getDesktopApi()?.terminal;
    const publish = (value: JsonValue): void => {
      void event.emit(value).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] terminal event delivery failed", error);
      });
    };
    const unsubscribers = terminal === undefined ? [] : [
      terminal.onData((terminalEvent) => publish({
        kind: terminalEvent.kind,
        sessionId: terminalEvent.sessionId
      })),
      terminal.onExit((terminalEvent) => publish({
        kind: terminalEvent.kind,
        sessionId: terminalEvent.sessionId,
        exitCode: terminalEvent.exitCode
      })),
      terminal.onError((terminalEvent) => publish({
        kind: terminalEvent.kind,
        sessionId: terminalEvent.sessionId
      })),
      ...(terminal.onCwdChanged === undefined ? [] : [
        terminal.onCwdChanged((terminalEvent) => publish({
          kind: terminalEvent.kind,
          sessionId: terminalEvent.sessionId,
          cwd: terminalEvent.cwd
        }))
      ])
    ];
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
      terminalEventRef.current = null;
      event.dispose();
    };
  }, []);

  useEffect(() => {
    void terminalEventRef.current?.emit({
      kind: "topology-changed",
      activeTabId: terminalModel.state.activeTabId
    }).catch((error: unknown) => {
      console.error("[lyra-workspace-apps] terminal topology delivery failed", error);
    });
  }, [terminalModel.state]);

  useEffect(() => {
    const event = registerWorkspaceCoreEvent(
      CORE_HOST_EVENTS.downloadsChanged,
      "downloads:read"
    );
    const unsubscribe = getDesktopApi()?.downloads?.onEvent((downloadEvent) => {
      void event.emit({
        kind: downloadEvent.kind,
        ...("taskId" in downloadEvent ? { taskId: downloadEvent.taskId } : {}),
        ...("task" in downloadEvent ? { taskId: downloadEvent.task.id } : {})
      }).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] downloads event delivery failed", error);
      });
    }) ?? (() => undefined);
    return () => {
      unsubscribe();
      event.dispose();
    };
  }, []);

  useEffect(() => {
    const event = registerWorkspaceCoreEvent(
      CORE_HOST_EVENTS.credentialsChanged,
      "credentials:read"
    );
    const unsubscribe = getDesktopApi()?.loginManager?.onEvent((credentialEvent) => {
      void event.emit({
        kind: credentialEvent.kind,
        generatedAt: credentialEvent.snapshot.generatedAt
      }).catch((error: unknown) => {
        console.error("[lyra-workspace-apps] credential event delivery failed", error);
      });
    }) ?? (() => undefined);
    return () => {
      unsubscribe();
      event.dispose();
    };
  }, []);

  useEffect(() => {
    const registrations = [
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openResource, async (value) => {
        const input = asRecord(value);
        return onOpenFile(requiredString(input, "path")) ?? null;
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.navigate, async (value) => {
        const input = asRecord(value);
        return tabsModel.openPageInNewTab(
          requiredString(input, "address"),
          optionalString(input, "title")
        );
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openNestedApp, async (value) => {
        const input = asRecord(value);
        const appId = requiredString(input, "appId");
        const instanceId = requiredString(input, "instanceId");
        const route = optionalString(input, "route");
        tabsModel.openAppTab({
          appId: appId as WorkbenchAppId,
          appInstanceId: instanceId,
          title: optionalString(input, "title") ?? appId,
          iconKey: (optionalString(input, "iconKey") ?? "notification-center-default") as WorkspaceAppIconKey,
          ...(route === undefined ? {} : { route }),
          ...(input.state === undefined ? {} : { opaqueState: input.state })
        });
        return instanceId;
      }, "apps:open"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openSettings, async () => {
        tabsModel.openSettingsTab();
        return null;
      }, "settings:open"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.notify, async (value) => {
        const input = asRecord(value);
        const title = requiredString(input, "title");
        const body = optionalString(input, "body");
        const item = notificationModel.publishNotification({
          title,
          preview: optionalString(input, "preview") ?? title,
          ...(body === undefined ? {} : { body }),
          level: notificationLevel(input.level),
          source: { id: "workspace-app", title: "Lyra App", iconKey: "system" },
          target: { kind: "none" }
        });
        return item.id;
      }, "notifications:publish"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readNotifications, async () =>
        toJsonValue({
          notifications: notificationModel.notifications,
          selectedNotificationId: notificationModel.selectedNotificationId,
          unreadCount: notificationModel.unreadCount
        }), "notifications:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.selectNotification, async (value) => {
        notificationModel.selectNotification(requiredString(asRecord(value), "notificationId"));
        return null;
      }, "notifications:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.markAllNotificationsRead, async () => {
        notificationModel.markAllNotificationsRead();
        return null;
      }, "notifications:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openNotificationSource, async (value) => {
        onOpenNotificationSource(requiredString(asRecord(value), "notificationId"));
        return null;
      }, "notifications:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openNotificationLink, async (value) => {
        const url = requiredString(asRecord(value), "url");
        if (isPublicHttpsUrl(url) === false) {
          throw new Error("Notification links must be https.");
        }
        return tabsModel.openPageInNewTab(url);
      }, "notifications:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.requestClearNotifications, async () => {
        onRequestClearNotifications();
        return null;
      }, "notifications:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readImage, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        return toJsonValue(imageViewerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openImage, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        await imageViewerModel.openImage(instanceId, requiredString(input, "path"));
        return toJsonValue(imageViewerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openAdjacentImage, async (value) => {
        const input = asRecord(value);
        const direction = optionalNumber(input, "direction");
        if (direction !== -1 && direction !== 1) {
          throw new Error("Core command direction must be -1 or 1.");
        }
        const instanceId = requiredString(input, "instanceId");
        await imageViewerModel.openAdjacent(instanceId, direction);
        return toJsonValue(imageViewerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.setImageViewport, async (value) => {
        const input = asRecord(value);
        const backgroundValue = optionalString(input, "background");
        const zoom = optionalNumber(input, "zoom");
        const offsetX = optionalNumber(input, "offsetX");
        const offsetY = optionalNumber(input, "offsetY");
        const rotation = optionalNumber(input, "rotation");
        const background: ImageViewerBackground | undefined =
          backgroundValue === "checkerboard" || backgroundValue === "dark" || backgroundValue === "light"
            ? backgroundValue
            : undefined;
        imageViewerModel.setViewport(requiredString(input, "instanceId"), {
          ...(zoom === undefined ? {} : { zoom }),
          ...(offsetX === undefined ? {} : { offsetX }),
          ...(offsetY === undefined ? {} : { offsetY }),
          ...(rotation === undefined ? {} : { rotation }),
          ...(background === undefined ? {} : { background })
        });
        return null;
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.resetImageViewport, async (value) => {
        imageViewerModel.resetViewport(requiredString(asRecord(value), "instanceId"));
        return null;
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.previewOffice, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        const tab = tabsModel.tabs.find((entry) => entry.appInstanceId === instanceId);
        const filePath = tab?.filePath;
        if (filePath === undefined || filePath.length === 0) {
          throw new Error("Office preview has no file.");
        }
        const preview = getDesktopApi()?.office?.preview;
        if (preview === undefined) {
          throw new Error("Office preview bridge is unavailable.");
        }
        return toJsonValue(await preview({ path: filePath }));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readFiles, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        fileManagerModel.ensureInstance(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openFilesHome, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        fileManagerModel.ensureInstance(instanceId);
        await fileManagerModel.openHome(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openFilesDirectory, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        fileManagerModel.ensureInstance(instanceId);
        await fileManagerModel.openDirectory(instanceId, requiredString(input, "path"));
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openFilesTrash, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        fileManagerModel.ensureInstance(instanceId);
        await fileManagerModel.openTrash(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openFilesDownloads, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        fileManagerModel.ensureInstance(instanceId);
        await fileManagerModel.openDownloads(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openFilesFavorite, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        const favoriteId = requiredString(input, "favoriteId");
        fileManagerModel.ensureInstance(instanceId);
        const state = fileManagerModel.getState(instanceId);
        const favorite = state?.favorites.find((item) => item.id === favoriteId);
        if (favorite === undefined) {
          throw new Error(`Core Files favorite is unavailable: ${favoriteId}`);
        }
        if (favorite.kind === undefined || favorite.kind === "path") {
          await fileManagerModel.openDirectory(instanceId, favorite.path);
        } else {
          onOpenFilesFavorite(favorite);
        }
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "apps:open"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.navigateFiles, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        const direction = requiredString(input, "direction");
        if (direction === "back") {
          await fileManagerModel.goBack(instanceId);
        } else if (direction === "forward") {
          await fileManagerModel.goForward(instanceId);
        } else if (direction === "up") {
          await fileManagerModel.goUp(instanceId);
        } else if (direction === "refresh") {
          await fileManagerModel.refresh(instanceId);
        } else {
          throw new Error(`Core command direction is invalid: ${direction}`);
        }
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.setFilesPresentation, async (value) => {
        const input = asRecord(value);
        const mode = requiredString(input, "mode");
        if (mode !== "list" && mode !== "large") {
          throw new Error(`Core command presentation mode is invalid: ${mode}`);
        }
        const instanceId = requiredString(input, "instanceId");
        fileManagerModel.setPresentationMode(instanceId, mode);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.selectFilesEntry, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        fileManagerModel.selectEntry(instanceId, requiredString(input, "entryId"));
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.selectFilesTrashEntry, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        fileManagerModel.selectTrashEntry(instanceId, requiredString(input, "entryId"));
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.createFilesEntry, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        const kind = requiredString(input, "kind");
        if (kind !== "file" && kind !== "directory") {
          throw new Error(`Core command entry kind is invalid: ${kind}`);
        }
        fileManagerModel.beginCreateDraft(instanceId, kind);
        fileManagerModel.updateCreateDraft(instanceId, requiredString(input, "name"));
        await fileManagerModel.commitCreateDraft(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.moveFilesSelectionToTrash, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        await fileManagerModel.moveSelectionToTrash(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.restoreFilesSelection, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        await fileManagerModel.restoreSelectionFromTrash(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.emptyFilesTrash, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        await fileManagerModel.emptyTrash(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.toggleFilesFavorite, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        await fileManagerModel.toggleCurrentDirectoryFavorite(instanceId);
        return toJsonValue(fileManagerModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readEditor, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        await fileEditorModel.hydrateIfNeeded(instanceId);
        return toJsonValue(fileEditorModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openEditor, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        const path = requiredString(input, "path");
        fileEditorModel.ensureInstance(instanceId, { filePath: path });
        await fileEditorModel.openFile(instanceId, path);
        return toJsonValue(fileEditorModel.getState(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.setEditorContent, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        const content = input.content;
        if (typeof content !== "string") {
          throw new Error("Core command field is required: content");
        }
        fileEditorModel.setContent(instanceId, content);
        return toJsonValue(fileEditorModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.saveEditor, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        await fileEditorModel.save(instanceId, "manual");
        return toJsonValue(fileEditorModel.getState(instanceId));
      }, "files:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.statEditorFile, async (value) => {
        const instanceId = requiredString(asRecord(value), "instanceId");
        return toJsonValue(await fileEditorModel.statFile(instanceId));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.requestEditorCompletion, async (value) => {
        const input = asRecord(value);
        const line = optionalNumber(input, "line");
        const column = optionalNumber(input, "column");
        if (line === undefined || column === undefined || line < 0 || column < 0) {
          throw new Error("Core command completion position is invalid.");
        }
        return toJsonValue(await fileEditorModel.requestCompletion(
          requiredString(input, "instanceId"),
          Math.floor(line),
          Math.floor(column)
        ));
      }, "files:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readBrowser, async (value) => {
        const input = asRecord(value);
        const tabId = browserTabIdFromInput(tabsModel, input);
        const desktopApi = getDesktopApi();
        const [session, liveProfile, isolatedProfile] = desktopApi === null
          ? [null, null, null] as const
          : await Promise.all([
              desktopApi.browser.readSessionSnapshot().catch(() => null),
              desktopApi.browser.readStorageState({ profileMode: "live" }).catch(() => null),
              desktopApi.browser.readStorageState({ profileMode: "isolated" }).catch(() => null)
            ]);
        const page = session?.tabs.find((entry) => entry.tabId === tabId);
        return toJsonValue({
          instanceId: optionalString(input, "instanceId") ?? `lyra.browser:${tabId}`,
          tabId,
          activeTabId: tabsModel.activeTabId,
          runtimeAvailable: desktopApi !== null,
          tabs: tabsModel.tabs.filter(isBrowserTab).map((tab) => ({
            id: tab.id,
            title: tab.title,
            kind: tab.pageKind,
            address: tab.displayAddress,
            ...(tab.faviconUrl === undefined ? {} : { faviconUrl: tab.faviconUrl }),
            active: tab.id === tabsModel.activeTabId
          })),
          page: page === undefined ? null : {
            tabId: page.tabId,
            address: page.address,
            title: page.title,
            ...(page.faviconUrl === undefined ? {} : { faviconUrl: page.faviconUrl }),
            canGoBack: page.canGoBack,
            canGoForward: page.canGoForward,
            lifecycleState: page.lifecycleState ?? "visible"
          },
          profiles: [liveProfile, isolatedProfile]
            .filter((profile): profile is NonNullable<typeof profile> => profile !== null)
            .map(toBrowserProfileSummary),
          history: readBrowserHistoryEntries().slice(0, 100)
        });
      }, "browser:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.navigateBrowser, async (value) => {
        const input = asRecord(value);
        const tabId = browserTabIdFromInput(tabsModel, input);
        const rawInput = requiredString(input, "input");
        const target = optionalString(input, "target") === "new-tab" ? "new-tab" : "active-tab";
        if (target === "active-tab") {
          tabsModel.setActiveTab(tabId);
        }
        if (looksLikeUrl(rawInput)) {
          const address = toSafeAddress(rawInput);
          if (address === null) {
            throw new Error("Core browser address is invalid.");
          }
          return tabsModel.navigateResolvedInput(
            { kind: "page", address },
            { target }
          );
        }
        return tabsModel.navigateResolvedInput(
          { kind: "search", query: rawInput },
          { target }
        );
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.activateBrowserTab, async (value) => {
        const tabId = browserTabIdFromInput(tabsModel, asRecord(value));
        tabsModel.setActiveTab(tabId);
        return tabId;
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openBrowserTab, async (value) => {
        const input = asRecord(value);
        const rawInput = optionalString(input, "input");
        if (rawInput === undefined) {
          return tabsModel.navigateResolvedInput({ kind: "home" }, { target: "new-tab" });
        }
        if (looksLikeUrl(rawInput)) {
          const address = toSafeAddress(rawInput);
          if (address === null) {
            throw new Error("Core browser address is invalid.");
          }
          return tabsModel.navigateResolvedInput(
            { kind: "page", address },
            { target: "new-tab" }
          );
        }
        return tabsModel.navigateResolvedInput(
          { kind: "search", query: rawInput },
          { target: "new-tab" }
        );
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.closeBrowserTab, async (value) => {
        const tabId = browserTabIdFromInput(tabsModel, asRecord(value));
        tabsModel.closeTab(tabId);
        return null;
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.goBackBrowser, async (value) => {
        const tabId = browserTabIdFromInput(tabsModel, asRecord(value));
        const browser = getDesktopApi()?.browser;
        if (browser === undefined) {
          throw new Error("Core browser runtime is unavailable.");
        }
        await browser.goBack({ tabId });
        return null;
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.goForwardBrowser, async (value) => {
        const tabId = browserTabIdFromInput(tabsModel, asRecord(value));
        const browser = getDesktopApi()?.browser;
        if (browser === undefined) {
          throw new Error("Core browser runtime is unavailable.");
        }
        await browser.goForward({ tabId });
        return null;
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.reloadBrowser, async (value) => {
        const input = asRecord(value);
        const tabId = browserTabIdFromInput(tabsModel, input);
        const browser = getDesktopApi()?.browser;
        if (browser === undefined) {
          throw new Error("Core browser runtime is unavailable.");
        }
        await browser.reload({
          tabId,
          ...(input.ignoreCache === true ? { ignoreCache: true } : {})
        });
        return null;
      }, "browser:navigate"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readTerminal, async () =>
        terminalProjection(terminalModel), "terminal:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.createTerminal, async (value) => {
        const input = asRecord(value);
        const modeValue = optionalString(input, "mode");
        if (modeValue !== undefined && modeValue !== "shell" && modeValue !== "command") {
          throw new Error(`Core terminal mode is invalid: ${modeValue}`);
        }
        const title = optionalString(input, "title");
        const cwd = optionalString(input, "cwd");
        const shell = optionalString(input, "shell");
        const command = optionalString(input, "command");
        const created = terminalModel.openTabWithPlacement({
          placement: "workspace",
          ...(title === undefined ? {} : { title }),
          ...(cwd === undefined ? {} : { cwd }),
          ...(shell === undefined ? {} : { shell }),
          ...(modeValue === undefined ? {} : { mode: modeValue }),
          ...(command === undefined ? {} : { command })
        });
        tabsModel.openTerminalTab(created.tab.id, created.tab.title);
        return {
          tabId: created.tab.id,
          paneId: created.pane.id,
          sessionId: created.pane.sessionId,
          topology: terminalProjection(terminalModel)
        };
      }, "terminal:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.focusTerminalPane, async (value) => {
        const input = asRecord(value);
        terminalModel.focusPane(
          requiredString(input, "tabId"),
          requiredString(input, "paneId")
        );
        return terminalProjection(terminalModel);
      }, "terminal:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.closeTerminalPane, async (value) => {
        const input = asRecord(value);
        const tabId = requiredString(input, "tabId");
        terminalModel.closePane(tabId, requiredString(input, "paneId"));
        if (terminalModel.findTab(tabId) === null) {
          tabsModel.closeTerminalTab(tabId);
        }
        return terminalProjection(terminalModel);
      }, "terminal:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readTerminalSession, async (value) => {
        const input = asRecord(value);
        const terminal = getDesktopApi()?.terminal;
        if (terminal === undefined) {
          throw new Error("Core terminal runtime is unavailable.");
        }
        const maxBytes = optionalNumber(input, "maxBytes");
        const cursor = optionalString(input, "cursor");
        return toJsonValue(await terminal.read({
          sessionId: requiredString(input, "sessionId"),
          ...(cursor === undefined ? {} : { cursor }),
          ...(maxBytes === undefined
            ? { maxBytes: 65_536 }
            : { maxBytes: Math.max(1, Math.min(262_144, Math.floor(maxBytes))) }),
          waitMs: 0
        }));
      }, "terminal:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.writeTerminalSession, async (value) => {
        const input = asRecord(value);
        const terminal = getDesktopApi()?.terminal;
        if (terminal === undefined) {
          throw new Error("Core terminal runtime is unavailable.");
        }
        await terminal.write({
          sessionId: requiredString(input, "sessionId"),
          text: requiredText(input, "text"),
          appendNewline: input.appendNewline !== false,
          source: "user"
        });
        return null;
      }, "terminal:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readDownloads, async () => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) {
          throw new Error("Core download runtime is unavailable.");
        }
        return toJsonValue(await downloads.list());
      }, "downloads:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.enqueueDownload, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) {
          throw new Error("Core download runtime is unavailable.");
        }
        return toJsonValue(await downloads.enqueue({
          text: requiredString(asRecord(value), "text")
        }));
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.pauseDownload, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.pause({
          taskId: requiredString(asRecord(value), "taskId")
        }));
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.resumeDownload, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.resume({
          taskId: requiredString(asRecord(value), "taskId")
        }));
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.cancelDownload, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.cancel({
          taskId: requiredString(asRecord(value), "taskId")
        }));
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.retryDownload, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.retry({
          taskId: requiredString(asRecord(value), "taskId")
        }));
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.removeDownload, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        await downloads.remove({ taskId: requiredString(asRecord(value), "taskId") });
        return null;
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.pauseAllDownloads, async () => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.pauseAll());
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.resumeAllDownloads, async () => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.resumeAll());
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.cancelAllDownloads, async () => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return toJsonValue(await downloads.cancelAll());
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.openDownloadedFile, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return downloads.openFile({ taskId: requiredString(asRecord(value), "taskId") });
      }, "downloads:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.revealDownloadedFile, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        return downloads.revealFile({ taskId: requiredString(asRecord(value), "taskId") });
      }, "downloads:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.setDownloadPriority, async (value) => {
        const downloads = getDesktopApi()?.downloads;
        if (downloads === undefined) throw new Error("Core download runtime is unavailable.");
        const input = asRecord(value);
        const priority = requiredString(input, "priority");
        if (priority !== "low" && priority !== "normal" && priority !== "high") {
          throw new Error("Core download priority is invalid.");
        }
        return toJsonValue(await downloads.setPriority({
          taskId: requiredString(input, "taskId"),
          priority
        }));
      }, "downloads:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.readCredentials, async () => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) {
          throw new Error("Core credential manager is unavailable.");
        }
        return toJsonValue(await loginManager.list());
      }, "credentials:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.deleteCredential, async (value) => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) throw new Error("Core credential manager is unavailable.");
        return toJsonValue(await loginManager.deleteCredential({
          credentialId: requiredString(asRecord(value), "credentialId")
        }));
      }, "credentials:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.revealCredential, async (value) => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) throw new Error("Core credential manager is unavailable.");
        const input = asRecord(value);
        requireSensitiveIntent(input, "user-reveal");
        return toJsonValue(await loginManager.revealCredential({
          credentialId: requiredString(input, "credentialId"),
          reason: "user-reveal"
        }));
      }, "credentials:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.copyCredential, async (value) => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) throw new Error("Core credential manager is unavailable.");
        const input = asRecord(value);
        requireSensitiveIntent(input, "user-copy");
        const revealed = await loginManager.revealCredential({
          credentialId: requiredString(input, "credentialId"),
          reason: "user-copy"
        });
        if (navigator.clipboard?.writeText === undefined) {
          throw new Error("Core clipboard access is unavailable.");
        }
        await navigator.clipboard.writeText(revealed.password);
        return null;
      }, "credentials:read"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.fillCredential, async (value) => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) throw new Error("Core credential manager is unavailable.");
        const input = asRecord(value);
        requireSensitiveIntent(input, "user-fill");
        return toJsonValue(await loginManager.fillCredential({
          credentialId: requiredString(input, "credentialId"),
          reason: "user-fill"
        }));
      }, "credentials:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.clearCredentialSite, async (value) => {
        const desktopApi = getDesktopApi();
        if (desktopApi?.loginManager === undefined) {
          throw new Error("Core credential manager is unavailable.");
        }
        const input = asRecord(value);
        const sessionId = optionalString(input, "sessionId");
        const origin = optionalString(input, "origin");
        const hostname = optionalString(input, "hostname");
        if (sessionId === undefined && origin === undefined && hostname === undefined) {
          throw new Error("Core credential site selector is required.");
        }
        const cleared = await desktopApi.loginManager.clearSite({
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(origin === undefined ? {} : { origin }),
          ...(hostname === undefined ? {} : { hostname })
        });
        await desktopApi.browser.clearSiteData({ origin: cleared.origin }).catch(() => undefined);
        return toJsonValue(cleared);
      }, "credentials:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.updateCredentialSession, async (value) => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) throw new Error("Core credential manager is unavailable.");
        const input = asRecord(value);
        const sessionId = optionalString(input, "sessionId");
        const origin = optionalString(input, "origin");
        const accountHint = input.accountHint;
        const notes = input.notes;
        const authMethodKind = optionalString(input, "authMethodKind");
        const authMethodObject = typeof input.authMethod === "object" && input.authMethod !== null && !Array.isArray(input.authMethod)
          ? input.authMethod as Readonly<Record<string, JsonValue>>
          : undefined;
        const authMethod = authMethodObject !== undefined
          ? {
              kind: authMethodKindOf(authMethodObject.kind),
              label: typeof authMethodObject.label === "string" ? authMethodObject.label : "",
              source: authMethodSourceOf(authMethodObject.source),
              confidence: typeof authMethodObject.confidence === "number" ? authMethodObject.confidence : 1
            }
          : authMethodKind !== undefined
            ? { kind: authMethodKindOf(authMethodKind), label: authMethodKind, source: "manual" as const, confidence: 1 }
            : undefined;
        return toJsonValue(await loginManager.updateSession({
          ...(sessionId === undefined ? {} : { sessionId }),
          ...(origin === undefined ? {} : { origin }),
          ...(authMethod === undefined ? {} : { authMethod }),
          ...(accountHint === undefined ? {} : { accountHint: typeof accountHint === "string" && accountHint.length > 0 ? accountHint : null }),
          ...(notes === undefined ? {} : { notes: typeof notes === "string" && notes.length > 0 ? notes : null })
        }));
      }, "credentials:write"),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.setCredentialCaptureEnabled, async (value) => {
        const loginManager = getDesktopApi()?.loginManager;
        if (loginManager === undefined) throw new Error("Core credential manager is unavailable.");
        const input = asRecord(value);
        const enabled = input.enabled;
        if (typeof enabled !== "boolean") throw new Error("Credential capture enabled flag is required.");
        return toJsonValue(await loginManager.setCredentialCaptureEnabled(enabled));
      }, "credentials:write"),
      registerWorkspaceCoreCommand(
        CORE_HOST_COMMANDS.chromeSet,
        async (value) => handleWorkbenchChromeSetCommand(value),
        null
      ),
      registerWorkspaceCoreCommand(
        CORE_HOST_COMMANDS.chromeClear,
        async (value) => handleWorkbenchChromeClearCommand(value),
        null
      ),
      registerWorkspaceCoreCommand(
        CORE_HOST_COMMANDS.chromeRead,
        async (value) => handleWorkbenchChromeReadCommand(value),
        null
      ),
      registerWorkspaceCoreCommand(CORE_HOST_COMMANDS.workspaceResolveTab, async (value) => {
        const input = asRecord(value);
        const instanceId = requiredString(input, "instanceId");
        const hostTabId = readWorkspaceAppHostTab(instanceId);
        if (hostTabId !== undefined && tabsModel.tabs.some((tab) => tab.id === hostTabId)) {
          return { tabId: hostTabId };
        }
        const matches = tabsModel.tabs.filter((tab) => tab.appInstanceId === instanceId);
        if (matches.length === 0) {
          return null;
        }
        const preferred =
          matches.find((tab) => tab.id === tabsModel.activeTabId) ?? matches[0]!;
        return { tabId: preferred.id };
      }, null)
    ];
    return () => {
      for (const registration of registrations) {
        registration.dispose();
      }
    };
  }, [
    fileEditorModel,
    fileManagerModel,
    imageViewerModel,
    notificationModel,
    onOpenFile,
    onOpenNotificationSource,
    onRequestClearNotifications,
    tabsModel,
    terminalModel
  ]);
};
