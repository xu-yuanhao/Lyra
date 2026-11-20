import type { HostEventHandlerV1, JsonValue, LyraHostApiV1 } from "@lyra/app-runtime";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { lyraAppModule as terminalModule } from "../../../../../../lyra-terminal/src/index";
import { lyraAppModule as downloadsModule } from "../../../../../../lyra-downloads/src/index";
import { lyraAppModule as credentialsModule } from "../../../../../../lyra-credentials/src/index";
import { isolatedSurfaceSlots } from "./nested-slot-test-helper";

const mounted: HTMLElement[] = [];

afterEach(() => {
  for (const element of mounted.splice(0)) element.remove();
});

const createHost = (
  executeCommand: LyraHostApiV1["executeCommand"],
  onSubscribe?: (eventId: string, handler: HostEventHandlerV1) => void,
  commands?: Map<string, (input: JsonValue) => JsonValue | Promise<JsonValue>>
): LyraHostApiV1 => ({
  apiVersion: "1.0.0",
  executeCommand,
  invokeCapability: async () => null,
  registerCommand: (commandId, handler) => {
    commands?.set(commandId, handler);
    return {
      dispose: () => {
        if (commands?.get(commandId) === handler) commands.delete(commandId);
      }
    };
  },
  registerCapability: () => ({ dispose() {} }),
  subscribeEvent: (eventId, handler) => {
    if (
      eventId !== "lyra.core.locale-changed"
      && eventId !== "lyra.core.theme-changed"
    ) {
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

describe("Terminal, Downloads, and Credentials component surfaces", () => {
  test("Terminal reads Runtime-backed sessions, writes input, and snapshots selection", async () => {
    const topology: JsonValue = {
      activeTabId: "terminal-tab-1",
      tabs: [{
        id: "terminal-tab-1",
        title: "Project shell",
        activePaneId: "pane-1",
        placement: "workspace"
      }],
      panes: [{
        id: "pane-1",
        tabId: "terminal-tab-1",
        sessionId: "session-1",
        title: "Project shell",
        currentCwd: "/project",
        shell: "/bin/zsh",
        mode: "shell",
        placement: "workspace",
        active: true
      }]
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> => {
      if (commandId === "lyra.core.terminal.read") return topology;
      if (commandId === "lyra.core.terminal.read-session") {
        return {
          sessionId: "session-1",
          cursor: "18",
          output: "$ pnpm test\npassed\n",
          running: true,
          exitCode: null,
          truncated: false
        };
      }
      return null;
    });
    let eventHandler: HostEventHandlerV1 | undefined;
    const host = createHost(execute, (eventId, handler) => {
      expect(eventId).toBe("lyra.core.terminal-changed");
      eventHandler = handler;
    });
    await terminalModule.activate(host);
    const instance = await terminalModule.create({
      host, appId: "terminal", instanceId: "terminal-test", route: "/"
    });
    const container = createContainer();
    await act(async () => terminalModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("pnpm test"));
    const input = container.querySelector<HTMLInputElement>('input[aria-label="Enter a command"]');
    expect(input).not.toBeNull();
    fireEvent.change(input!, { target: { value: "git status" } });
    fireEvent.submit(input!.closest("form")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.terminal.write-session",
      { sessionId: "session-1", text: "git status", appendNewline: true }
    ));
    await act(async () => eventHandler?.({ kind: "data", sessionId: "session-1" }));
    await waitFor(() => expect(
      execute.mock.calls.filter(([id]) => id === "lyra.core.terminal.read-session").length
    ).toBeGreaterThanOrEqual(2));
    expect(await terminalModule.snapshot(instance)).toEqual({
      selectedSessionId: "session-1"
    });

    await act(async () => terminalModule.unmount?.(instance));
    await terminalModule.close(instance);
    await terminalModule.deactivate();
  });

  test("Downloads reads tasks, delegates task control, and restores local draft state", async () => {
    const snapshot: JsonValue = {
      tasks: [{
        id: "download-1",
        url: "https://example.com/archive.zip",
        fileName: "archive.zip",
        savePath: "/Downloads/archive.zip",
        state: "downloading",
        receivedBytes: 512,
        totalBytes: 1024,
        speedBytesPerSecond: 128,
        canResume: true
      }]
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> =>
      commandId === "lyra.core.downloads.read" ? snapshot : null);
    let eventHandler: HostEventHandlerV1 | undefined;
    const host = createHost(execute, (eventId, handler) => {
      expect(eventId).toBe("lyra.core.downloads-changed");
      eventHandler = handler;
    });
    await downloadsModule.activate(host);
    const instance = await downloadsModule.restore({
      host,
      appId: "downloads",
      instanceId: "downloads-test",
      route: "/",
      opaqueState: { urlDraft: "https://example.com/new.zip" }
    });
    const container = createContainer();
    await act(async () => downloadsModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.textContent).toContain("archive.zip"));
    expect(container.querySelector(".lyra-file-manager-download-list")).not.toBeNull();
    expect(container.querySelector(".lyra-app-module-aside")).toBeNull();
    const urlInput = container.querySelector<HTMLInputElement>(
      'input[placeholder="Paste URL or batch URLs"]'
    );
    expect(urlInput?.value).toBe("https://example.com/new.zip");
    fireEvent.click(container.querySelector('button[aria-label="Pause"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.downloads.pause",
      { taskId: "download-1" }
    ));
    fireEvent.submit(urlInput!.closest("form")!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.downloads.enqueue",
      { text: "https://example.com/new.zip" }
    ));
    await act(async () => eventHandler?.({ kind: "task-updated", taskId: "download-1" }));
    await waitFor(async () => {
      expect(await downloadsModule.snapshot(instance)).toEqual({
        urlDraft: ""
      });
    });

    await act(async () => downloadsModule.unmount?.(instance));
    await downloadsModule.close(instance);
    await downloadsModule.deactivate();
  });

  test("Credentials keeps secrets ephemeral while delegating fill to Core", async () => {
    const snapshot: JsonValue = {
      version: 1,
      generatedAt: "2026-07-31T00:00:00.000Z",
      storageRoot: "/data/lyra.credentials",
      passwordsAvailable: true,
      sessions: [{
        id: "session-1",
        origin: "https://example.com",
        hostname: "example.com",
        status: "observed",
        accountHint: "pete@example.com",
        authMethod: { kind: "password", label: "Password", source: "observed", confidence: 1 },
        signals: { cookieCount: 2, storageObserved: true, formSubmitted: true },
        credentialIds: ["credential-1"],
        firstSeenAt: "2026-07-30T00:00:00.000Z",
        lastSeenAt: "2026-07-31T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z"
      }],
      credentials: [{
        id: "credential-1",
        origin: "https://example.com",
        hostname: "example.com",
        username: "pete@example.com",
        authMethod: { kind: "password", label: "Password", source: "observed", confidence: 1 },
        hasPassword: true,
        passwordAvailable: true,
        createdAt: "2026-07-30T00:00:00.000Z",
        updatedAt: "2026-07-31T00:00:00.000Z"
      }]
    };
    const execute = vi.fn(async (commandId: string): Promise<JsonValue> => {
      if (commandId === "lyra.core.credentials.read") return snapshot;
      if (commandId === "lyra.core.workspace.resolve-tab") return { tabId: "settings-tab" };
      return null;
    });
    let eventHandler: HostEventHandlerV1 | undefined;
    const credentialsCommands = new Map<string, (input: JsonValue) => JsonValue | Promise<JsonValue>>();
    const host = createHost(execute, (eventId, handler) => {
      expect(eventId).toBe("lyra.core.credentials-changed");
      eventHandler = handler;
    }, credentialsCommands);
    await credentialsModule.activate(host);
    const instance = await credentialsModule.create({
      host, appId: "login-manager", instanceId: "credentials-test", route: "/"
    });
    const container = createContainer();
    await act(async () => credentialsModule.mount?.({
      instance,
      container,
      slots: isolatedSurfaceSlots
    }));

    await waitFor(() => expect(container.querySelector(".lyra-login-manager-embedded-list")).not.toBeNull());
    expect(container.querySelector('[aria-label="Sessions"]')).not.toBeNull();
    expect(container.textContent).not.toContain("Saved credentials");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "Reveal password")).toBe(false);
    await act(async () => {
      await credentialsCommands.get("lyra.credentials.show-passwords")?.({});
    });
    await waitFor(() => expect(container.querySelector('[aria-label="Passwords"]')).not.toBeNull());
    fireEvent.click(container.querySelector('button[aria-label="Fill"]')!);
    await waitFor(() => expect(execute).toHaveBeenCalledWith(
      "lyra.core.credentials.fill",
      { credentialId: "credential-1", reason: "user-fill" }
    ));
    await act(async () => eventHandler?.({
      kind: "snapshot",
      generatedAt: "2026-07-31T00:00:01.000Z"
    }));
    expect(await credentialsModule.snapshot(instance)).not.toHaveProperty("password");
    expect(JSON.stringify(await credentialsModule.snapshot(instance))).not.toContain("local-secret");

    await act(async () => credentialsModule.unmount?.(instance));
    await credentialsModule.close(instance);
    await credentialsModule.deactivate();
  });
});
