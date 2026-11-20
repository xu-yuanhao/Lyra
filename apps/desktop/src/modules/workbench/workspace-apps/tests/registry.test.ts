import type {
  JsonValue,
  LyraAppModule,
  LyraNestedAppSlotsV1,
  WorkspaceTabV2
} from "@lyra/app-runtime";
import { describe, expect, test, vi } from "vitest";

import {
  BUILTIN_PRODUCT_COMPONENTS,
  acquireWorkspaceAppVersion,
  beginWorkspaceAppVersionActivation,
  createWorkspaceAppInstance,
  deactivateWorkspaceAppModule,
  executeWorkspaceAppCommand,
  listWorkspaceAppContributions,
  listWorkspaceApps,
  mountWorkspaceAppInstance,
  readWorkspaceAppActiveModule,
  readWorkspaceAppHostTab,
  readWorkspaceAppVersionState,
  registerWorkspaceApp,
  registerWorkspaceAppModule,
  resolveWorkspaceApp,
  restoreWorkspaceAppInstance,
  rollbackWorkspaceAppVersion,
  snapshotWorkspaceAppInstance,
  stageWorkspaceAppVersion,
  unmountWorkspaceAppInstance
} from "../registry";

const createModule = (
  id: string,
  version: string,
  events: string[] = []
): LyraAppModule => {
  const snapshots = new Map<string, JsonValue>();
  return {
    id,
    version,
    activate: vi.fn(() => {
      events.push(`activate:${version}`);
    }),
    create: vi.fn(({ instanceId }) => {
      events.push(`create:${version}:${instanceId}`);
      snapshots.set(instanceId, {});
      return { instanceId };
    }),
    restore: vi.fn(({ instanceId, opaqueState }) => {
      events.push(`restore:${version}:${instanceId}`);
      snapshots.set(instanceId, opaqueState);
      return { instanceId };
    }),
    snapshot: vi.fn(({ instanceId }) => snapshots.get(instanceId) ?? {}),
    close: vi.fn(({ instanceId }) => {
      events.push(`close:${version}:${instanceId}`);
      snapshots.delete(instanceId);
    }),
    deactivate: vi.fn(() => {
      events.push(`deactivate:${version}`);
    })
  };
};

describe("workspace app registry", () => {
  test("defines exactly ten independently versioned first-party app units", () => {
    expect(BUILTIN_PRODUCT_COMPONENTS).toHaveLength(10);
    expect(new Set(BUILTIN_PRODUCT_COMPONENTS.map(({ componentId }) => componentId)).size).toBe(10);
    expect(BUILTIN_PRODUCT_COMPONENTS
      .filter(({ surfaceReadiness }) => surfaceReadiness === "complete")
      .map(({ componentId }) => componentId)
      .sort()).toEqual(["lyra.credentials", "lyra.downloads", "lyra.notifications"]);
    expect(BUILTIN_PRODUCT_COMPONENTS
      .find(({ componentId }) => componentId === "lyra.files")?.surfaceReadiness)
      .toBe("preview");
    expect(BUILTIN_PRODUCT_COMPONENTS
      .find(({ componentId }) => componentId === "lyra.editor")?.surfaceReadiness)
      .toBe("preview");
    expect(BUILTIN_PRODUCT_COMPONENTS
      .find(({ componentId }) => componentId === "lyra.images")?.surfaceReadiness)
      .toBe("preview");
    expect(BUILTIN_PRODUCT_COMPONENTS
      .find(({ componentId }) => componentId === "lyra.office")?.surfaceReadiness)
      .toBe("preview");
  });

  test("groups built-in surfaces into product components", () => {
    expect(resolveWorkspaceApp("file-manager")?.componentId).toBe("lyra.files");
    expect(resolveWorkspaceApp("agent-git")?.componentId).toBe("lyra.agent");
    expect(listWorkspaceApps().some((app) => app.appId === "software-store")).toBe(true);
  });

  test("rejects invalid and duplicate module implementations", async () => {
    expect(() => registerWorkspaceAppModule({ id: "dev.invalid", version: "1.0.0" }))
      .toThrow("Invalid LyraAppModule");

    const module = createModule("dev.lifecycle.duplicate", "1.0.0");
    const unregister = registerWorkspaceAppModule(module);
    expect(() => registerWorkspaceAppModule(module)).toThrow("already loaded");
    await unregister();
  });

  test("validates and consumes active command, settings, and status contributions", async () => {
    const componentId = "dev.contributions";
    let commandRegistration: { readonly dispose: () => void } | undefined;
    const module = {
      ...createModule(componentId, "1.0.0"),
      contributions: {
        commands: [{ id: `${componentId}.refresh`, title: "Refresh" }],
        capabilities: [{
          id: `${componentId}.read`,
          title: "Read contribution state",
          version: "1.0.0"
        }],
        settings: [{ id: `${componentId}.settings`, title: "Settings", route: "/settings" }],
        status: [{ id: `${componentId}.status`, title: "Ready" }],
        events: [{
          id: `${componentId}.changed`,
          title: "Contribution changed",
          requiredCapability: "state:read"
        }]
      },
      activate: vi.fn((host) => {
        commandRegistration = host.registerCommand(
          `${componentId}.refresh`,
          async (input: JsonValue) => ({ refreshed: input })
        );
      }),
      deactivate: vi.fn(() => {
        commandRegistration?.dispose();
        commandRegistration = undefined;
      })
    } satisfies LyraAppModule;
    const unregister = registerWorkspaceAppModule(module);

    expect(listWorkspaceAppContributions()).toContainEqual(expect.objectContaining({
      componentId,
      version: "1.0.0",
      commands: module.contributions.commands,
      settings: module.contributions.settings,
      status: module.contributions.status,
      capabilities: module.contributions.capabilities,
      events: module.contributions.events
    }));
    expect(readWorkspaceAppActiveModule(componentId)).toMatchObject({
      componentId,
      version: "1.0.0",
      moduleState: "loaded",
      commands: module.contributions.commands,
      settings: module.contributions.settings,
      status: module.contributions.status,
      capabilities: module.contributions.capabilities,
      events: module.contributions.events
    });
    await expect(executeWorkspaceAppCommand(`${componentId}.refresh`, { source: "test" }))
      .resolves.toEqual({ refreshed: { source: "test" } });

    await unregister();
    expect(listWorkspaceAppContributions().some((entry) => entry.componentId === componentId))
      .toBe(false);
    expect(readWorkspaceAppActiveModule(componentId)).toMatchObject({
      componentId,
      version: "1.0.0",
      moduleState: "missing",
      commands: [],
      settings: [],
      status: [],
      capabilities: [],
      events: []
    });

    const foreign = {
      ...createModule("dev.contributions.foreign", "1.0.0"),
      contributions: {
        status: [{ id: "dev.someone.else.status", title: "Invalid" }]
      }
    } satisfies LyraAppModule;
    expect(() => registerWorkspaceAppModule(foreign)).toThrow("another module's contribution");
  });

  test("publishes declarations only from the active version", async () => {
    const componentId = "dev.contributions.switch";
    const createContributedModule = (version: string, suffix: string): LyraAppModule => ({
      ...createModule(componentId, version),
      contributions: {
        commands: [{
          id: `${componentId}.${suffix}`,
          title: `${suffix} command`
        }],
        status: [{
          id: `${componentId}.${suffix}-status`,
          title: `${suffix} status`
        }]
      },
      activate(host) {
        host.registerCommand(`${componentId}.${suffix}`, () => ({ version }));
      }
    });
    const unregisterV1 = registerWorkspaceAppModule(createContributedModule("1.0.0", "old"));
    const unregisterV2 = registerWorkspaceAppModule(createContributedModule("2.0.0", "new"));

    expect(readWorkspaceAppActiveModule(componentId)).toMatchObject({
      version: "1.0.0",
      commands: [{ id: `${componentId}.old`, title: "old command" }]
    });
    expect(stageWorkspaceAppVersion(componentId, "2.0.0").active).toBe("2.0.0");
    expect(readWorkspaceAppActiveModule(componentId)).toMatchObject({
      version: "2.0.0",
      commands: [{ id: `${componentId}.new`, title: "new command" }]
    });
    expect(listWorkspaceAppContributions()
      .filter((entry) => entry.componentId === componentId))
      .toEqual([
        expect.objectContaining({
          version: "2.0.0",
          commands: [{ id: `${componentId}.new`, title: "new command" }]
        })
      ]);
    await expect(executeWorkspaceAppCommand(`${componentId}.old`, {}))
      .rejects.toThrow("not declared by an active module");
    await expect(executeWorkspaceAppCommand(`${componentId}.new`, {}))
      .resolves.toEqual({ version: "2.0.0" });

    await unregisterV1();
    await unregisterV2();
  });

  test("pins the active module while a Core-initiated command is running", async () => {
    const componentId = "dev.contributions.command-lease";
    const commandId = `${componentId}.run`;
    let commandStarted!: () => void;
    let finishCommand!: () => void;
    const started = new Promise<void>((resolve) => {
      commandStarted = resolve;
    });
    const commandGate = new Promise<void>((resolve) => {
      finishCommand = resolve;
    });
    let registration: { readonly dispose: () => void } | undefined;
    const v1: LyraAppModule = {
      ...createModule(componentId, "1.0.0"),
      contributions: {
        commands: [{ id: commandId, title: "Run guarded command" }]
      },
      activate(host) {
        registration = host.registerCommand(commandId, async () => {
          commandStarted();
          await commandGate;
          return { version: "1.0.0" };
        });
      },
      deactivate() {
        registration?.dispose();
        registration = undefined;
      }
    };
    const v2: LyraAppModule = {
      ...createModule(componentId, "2.0.0"),
      contributions: {
        commands: [{ id: commandId, title: "Run guarded command" }]
      },
      activate(host) {
        registration = host.registerCommand(commandId, () => ({ version: "2.0.0" }));
      },
      deactivate() {
        registration?.dispose();
        registration = undefined;
      }
    };
    const unregisterV1 = registerWorkspaceAppModule(v1);
    const unregisterV2 = registerWorkspaceAppModule(v2);

    const execution = executeWorkspaceAppCommand(commandId, {});
    await started;
    expect(stageWorkspaceAppVersion(componentId, "2.0.0")).toMatchObject({
      active: "1.0.0",
      pending: "2.0.0",
      references: 1
    });
    finishCommand();
    await expect(execution).resolves.toEqual({ version: "1.0.0" });
    expect(readWorkspaceAppVersionState(componentId)).toMatchObject({
      active: "1.0.0",
      pending: "2.0.0",
      references: 0
    });

    const activation = beginWorkspaceAppVersionActivation(componentId, "2.0.0");
    await activation.commit("2.0.0");
    await expect(executeWorkspaceAppCommand(commandId, {}))
      .resolves.toEqual({ version: "2.0.0" });
    await unregisterV1();
    await unregisterV2();
  });

  test("runs create, snapshot, close, and deactivate with an exact version lease", async () => {
    const events: string[] = [];
    const module = createModule("dev.lifecycle.create", "1.0.0", events);
    const unregister = registerWorkspaceAppModule(module);

    const instance = await createWorkspaceAppInstance({
      appId: "dev-create",
      componentId: module.id,
      version: module.version,
      instanceId: "create-instance",
      route: "/new"
    });
    expect(instance.version).toBe("1.0.0");
    expect(readWorkspaceAppVersionState(module.id).references).toBe(1);
    expect(await instance.snapshot()).toEqual({});
    await expect(deactivateWorkspaceAppModule(module.id, module.version))
      .rejects.toThrow("running workspace app module");

    await instance.close();
    expect(readWorkspaceAppVersionState(module.id).references).toBe(0);
    await deactivateWorkspaceAppModule(module.id, module.version);
    expect(events).toEqual([
      "activate:1.0.0",
      "create:1.0.0:create-instance",
      "close:1.0.0:create-instance",
      "deactivate:1.0.0"
    ]);
    await unregister();
  });

  test("records the host tab of an instance mounted inside a Core tab", async () => {
    const componentId = "dev.host-tab";
    const module = createModule(componentId, "1.0.0");
    const unregister = registerWorkspaceAppModule(module);

    const hosted = await createWorkspaceAppInstance({
      appId: "dev-host-tab",
      componentId,
      version: "1.0.0",
      instanceId: "hosted-instance",
      route: "/",
      hostTabId: "settings-tab"
    });
    expect(readWorkspaceAppHostTab("hosted-instance")).toBe("settings-tab");
    await hosted.close();

    const standalone = await createWorkspaceAppInstance({
      appId: "dev-host-tab",
      componentId,
      version: "1.0.0",
      instanceId: "standalone-instance",
      route: "/"
    });
    expect(readWorkspaceAppHostTab("standalone-instance")).toBeUndefined();
    await standalone.close();

    await unregister();
  });

  test("mounts an independently shipped surface into a Core-owned slot", async () => {
    const componentId = "dev.lifecycle.surface";
    const module = {
      ...createModule(componentId, "1.0.0"),
      mount: vi.fn(({ container }: { readonly container: HTMLElement }) => {
        container.textContent = "dynamic surface";
      }),
      unmount: vi.fn(() => undefined)
    } satisfies LyraAppModule;
    const unregister = registerWorkspaceAppModule(module);
    const instance = await createWorkspaceAppInstance({
      appId: "dev-surface",
      componentId,
      version: "1.0.0",
      instanceId: "surface-instance",
      route: "/"
    });
    const container = document.createElement("div");

    await mountWorkspaceAppInstance(instance.instanceId, container);
    expect(container.textContent).toBe("dynamic surface");
    expect(module.mount).toHaveBeenCalledOnce();
    await unmountWorkspaceAppInstance(instance.instanceId);
    expect(module.unmount).toHaveBeenCalledOnce();

    await instance.close();
    await unregister();
  });

  test("owns nested app slots, pins child versions, and recursively cleans up", async () => {
    const parentComponentId = "dev.nested.parent";
    const childComponentId = "dev.nested.child";
    const missingComponentId = "dev.nested.missing";
    const incompatibleComponentId = "dev.nested.incompatible";
    const parentAppId = "dev.nested.parent-app";
    const childAppId = "dev.nested.child-app";
    const missingAppId = "dev.nested.missing-app";
    const incompatibleAppId = "dev.nested.incompatible-app";
    const events: string[] = [];
    const surfaceSlots = new Map<string, LyraNestedAppSlotsV1>();
    const parentState = new Map<string, JsonValue>();

    const createSurfaceModule = (
      id: string,
      version: string
    ): LyraAppModule => {
      const snapshots = new Map<string, JsonValue>();
      return {
        id,
        version,
        activate: vi.fn(),
        create: vi.fn(({ instanceId }) => {
          snapshots.set(instanceId, {});
          return { instanceId };
        }),
        restore: vi.fn(({ instanceId, opaqueState }) => {
          snapshots.set(instanceId, opaqueState);
          return { instanceId };
        }),
        snapshot: vi.fn(({ instanceId }) =>
          id === parentComponentId
            ? parentState.get(instanceId) ?? {}
            : snapshots.get(instanceId) ?? {}
        ),
        mount: vi.fn(({ instance, container, slots }) => {
          surfaceSlots.set(instance.instanceId, slots);
          container.textContent = `${id}@${version}:${instance.instanceId}`;
          events.push(`mount:${instance.instanceId}`);
        }),
        unmount: vi.fn(({ instanceId }) => {
          events.push(`unmount:${instanceId}`);
          surfaceSlots.delete(instanceId);
        }),
        close: vi.fn(({ instanceId }) => {
          events.push(`close:${instanceId}`);
          snapshots.delete(instanceId);
          parentState.delete(instanceId);
        }),
        deactivate: vi.fn()
      };
    };

    const parentModule = createSurfaceModule(parentComponentId, "1.0.0");
    const childV1 = createSurfaceModule(childComponentId, "1.0.0");
    const childV2 = createSurfaceModule(childComponentId, "2.0.0");
    const incompatibleModule = createModule(incompatibleComponentId, "1.0.0");
    const unregisterParentModule = registerWorkspaceAppModule(parentModule);
    const unregisterChildV1 = registerWorkspaceAppModule(childV1);
    const unregisterChildV2 = registerWorkspaceAppModule(childV2);
    const unregisterIncompatibleModule = registerWorkspaceAppModule(incompatibleModule);
    const unregisterParentApp = registerWorkspaceApp({
      appId: parentAppId,
      componentId: parentComponentId,
      version: "1.0.0"
    });
    const unregisterChildApp = registerWorkspaceApp({
      appId: childAppId,
      componentId: childComponentId,
      version: "1.0.0"
    });
    const unregisterMissingApp = registerWorkspaceApp({
      appId: missingAppId,
      componentId: missingComponentId,
      version: "1.0.0"
    });
    const unregisterIncompatibleApp = registerWorkspaceApp({
      appId: incompatibleAppId,
      componentId: incompatibleComponentId,
      version: "1.0.0"
    });

    const parent = await createWorkspaceAppInstance({
      appId: parentAppId,
      componentId: parentComponentId,
      version: "1.0.0",
      instanceId: "nested-parent-instance",
      route: "/"
    });
    await mountWorkspaceAppInstance(parent.instanceId, document.createElement("div"));
    const parentSlots = surfaceSlots.get(parent.instanceId);
    expect(parentSlots).toBeDefined();

    const childDescriptor: WorkspaceTabV2 = {
      schemaVersion: 2,
      appId: childAppId,
      appVersion: "1.0.0",
      instanceId: "nested-child-instance",
      route: "/document",
      opaqueState: { selectedPath: "/project/readme.md" }
    };
    const restoredChild = await parentSlots!.restore("editor", childDescriptor);
    expect(restoredChild).toEqual({ ok: true, value: childDescriptor });
    expect(readWorkspaceAppVersionState(childComponentId)).toMatchObject({
      active: "1.0.0",
      references: 1
    });
    expect(await parentSlots!.restore("editor", childDescriptor)).toEqual({
      ok: true,
      value: childDescriptor
    });
    expect(readWorkspaceAppVersionState(childComponentId).references).toBe(1);
    await expect(createWorkspaceAppInstance({
      appId: childAppId,
      componentId: childComponentId,
      version: "1.0.0",
      instanceId: childDescriptor.instanceId,
      route: childDescriptor.route
    })).rejects.toThrow("reserved by a nested slot");
    expect(await parent.snapshot()).toEqual({});

    await parentSlots!.mount("editor", document.createElement("div"));
    const childSlots = surfaceSlots.get(childDescriptor.instanceId);
    expect(childSlots).toBeDefined();
    const grandchild = await childSlots!.create("preview", {
      appId: childAppId,
      instanceId: "nested-grandchild-instance",
      route: "/preview"
    });
    expect(grandchild).toMatchObject({
      ok: true,
      value: {
        appId: childAppId,
        appVersion: "1.0.0",
        instanceId: "nested-grandchild-instance",
        opaqueState: {}
      }
    });
    expect(readWorkspaceAppVersionState(childComponentId).references).toBe(2);

    const cycle = await childSlots!.restore("cycle", {
      schemaVersion: 2,
      appId: parentAppId,
      appVersion: "1.0.0",
      instanceId: parent.instanceId,
      route: "/",
      opaqueState: {}
    });
    expect(cycle).toMatchObject({
      ok: false,
      error: { code: "cycle", repairable: false }
    });
    const duplicate = await parentSlots!.create("duplicate", {
      appId: childAppId,
      instanceId: childDescriptor.instanceId,
      route: "/document"
    });
    expect(duplicate).toMatchObject({
      ok: false,
      error: { code: "duplicate-instance", repairable: false }
    });

    const missing = await parentSlots!.create("missing", {
      appId: missingAppId,
      instanceId: "nested-missing-instance",
      route: "/"
    });
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "version-unavailable", repairable: true }
    });
    const incompatible = await parentSlots!.create("incompatible", {
      appId: incompatibleAppId,
      instanceId: "nested-incompatible-instance",
      route: "/"
    });
    expect(incompatible).toMatchObject({
      ok: false,
      error: { code: "surface-unavailable", repairable: true }
    });

    const childSnapshot = await parentSlots!.snapshot("editor");
    expect(childSnapshot).toEqual({ ok: true, value: childDescriptor });
    if (childSnapshot.ok) {
      parentState.set(parent.instanceId, { child: childSnapshot.value });
    }
    expect(await parent.snapshot()).toEqual({ child: childDescriptor });

    expect(stageWorkspaceAppVersion(childComponentId, "2.0.0")).toMatchObject({
      active: "1.0.0",
      pending: "2.0.0",
      references: 2
    });
    const pinnedAfterStage = await parentSlots!.create("secondary", {
      appId: childAppId,
      instanceId: "nested-secondary-instance",
      route: "/secondary"
    });
    expect(pinnedAfterStage).toMatchObject({
      ok: true,
      value: { appVersion: "1.0.0" }
    });
    expect(readWorkspaceAppVersionState(childComponentId).references).toBe(3);

    vi.mocked(parentModule.unmount!).mockImplementationOnce(({ instanceId }) => {
      events.push(`unmount-failed:${instanceId}`);
      throw new Error("simulated parent surface cleanup failure");
    });
    await expect(parent.close()).rejects.toThrow("simulated parent surface cleanup failure");
    expect(readWorkspaceAppVersionState(childComponentId).references).toBe(0);
    expect(readWorkspaceAppVersionState(parentComponentId).references).toBe(1);

    await parent.close();
    expect(readWorkspaceAppVersionState(childComponentId)).toMatchObject({
      active: "1.0.0",
      pending: "2.0.0",
      references: 0
    });
    expect(events).toEqual(expect.arrayContaining([
      "unmount:nested-parent-instance",
      "unmount:nested-child-instance",
      "close:nested-grandchild-instance",
      "close:nested-child-instance",
      "close:nested-secondary-instance",
      "close:nested-parent-instance"
    ]));

    unregisterIncompatibleApp();
    unregisterMissingApp();
    unregisterChildApp();
    unregisterParentApp();
    await unregisterIncompatibleModule();
    await unregisterChildV2();
    await unregisterChildV1();
    await unregisterParentModule();
  });

  test("restores opaque state and pins running instances until the last close", async () => {
    const events: string[] = [];
    const componentId = "dev.lifecycle.pin";
    const unregisterV1 = registerWorkspaceAppModule(createModule(componentId, "1.0.0", events));
    const unregisterV2 = registerWorkspaceAppModule(createModule(componentId, "2.0.0", events));

    const restored = await restoreWorkspaceAppInstance({
      appId: "dev-pin",
      componentId,
      version: "1.0.0",
      instanceId: "restored-instance",
      route: "/restored",
      opaqueState: { selectedPane: "history" }
    });
    const second = await createWorkspaceAppInstance({
      appId: "dev-pin",
      componentId,
      instanceId: "new-instance",
      route: "/new"
    });
    expect(await snapshotWorkspaceAppInstance("restored-instance"))
      .toEqual({ selectedPane: "history" });
    expect(second.version).toBe("1.0.0");

    expect(stageWorkspaceAppVersion(componentId, "2.0.0")).toMatchObject({
      active: "1.0.0",
      pending: "2.0.0",
      references: 2
    });
    await second.close();
    expect(readWorkspaceAppVersionState(componentId).active).toBe("1.0.0");
    await restored.close();
    expect(readWorkspaceAppVersionState(componentId)).toMatchObject({
      active: "1.0.0",
      pending: "2.0.0",
      references: 0
    });
    const activation = beginWorkspaceAppVersionActivation(componentId, "2.0.0");
    await activation.commit("2.0.0");
    expect(readWorkspaceAppVersionState(componentId)).toMatchObject({
      active: "2.0.0",
      previous: "1.0.0",
      references: 0
    });
    expect(events).toContain("deactivate:1.0.0");

    await unregisterV1();
    await unregisterV2();
  });

  test("reserves an idle activation and refuses unloaded targets before disk mutation", async () => {
    const componentId = "dev.lifecycle.activation";
    const unregisterV1 = registerWorkspaceAppModule(createModule(componentId, "1.0.0"));

    expect(() => beginWorkspaceAppVersionActivation(componentId, "2.0.0"))
      .toThrow(`Workspace app module is not loaded: ${componentId}@2.0.0`);

    const unregisterV2 = registerWorkspaceAppModule(createModule(componentId, "2.0.0"));
    const activation = beginWorkspaceAppVersionActivation(componentId, "2.0.0");
    expect(() => acquireWorkspaceAppVersion(componentId)).toThrow("activation is in progress");
    await expect(activation.commit("1.0.0")).rejects.toThrow("expected 2.0.0");
    activation.cancel();

    const retry = beginWorkspaceAppVersionActivation(componentId, "2.0.0");
    await retry.commit("2.0.0");
    expect(readWorkspaceAppVersionState(componentId).active).toBe("2.0.0");
    expect(rollbackWorkspaceAppVersion(componentId).active).toBe("1.0.0");

    await unregisterV2();
    await unregisterV1();
  });

  test("registers and removes a future app without changing the closed-source core", () => {
    const unregister = registerWorkspaceApp({
      appId: "dev.example.notes",
      componentId: "dev.example.notes",
      version: "1.0.0"
    });
    expect(resolveWorkspaceApp("dev.example.notes")?.version).toBe("1.0.0");
    unregister();
    expect(resolveWorkspaceApp("dev.example.notes")).toBeUndefined();
  });
});
