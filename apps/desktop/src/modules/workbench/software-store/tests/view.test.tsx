import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { JsonValue, LyraAppModule } from "@lyra/app-runtime";
import type {
  ComponentSummary,
  LyraSoftwareManifest,
  LyraDesktopApi,
  UiuxListPacksResponse
} from "../../../../shared/desktop-bridge";
import { createTranslator } from "../../i18n";
import { useWorkbenchLabels } from "../../shell/use-workbench-labels";
import {
  WorkbenchTitlebarContextProvider,
  WorkbenchTitlebarContextSlot,
  WorkbenchTitlebarScopeProvider
} from "../../shell/titlebar-context";
import { resolveSoftwareStoreSettingsRouteTarget } from "../service";
import { SoftwareStoreSurface } from "../view";
import type { SoftwareStoreSurfaceProps } from "../types";
import type { SoftwareCapabilitiesRegistryModel } from "../../software-capabilities";
import {
  readWorkspaceAppVersionState,
  registerWorkspaceAppModule
} from "../../workspace-apps";

const createLabels = () => {
  const { result } = renderHook(() => useWorkbenchLabels(createTranslator("en-US")));
  return result.current.softwareStore;
};

const createResponse = (
  installed: UiuxListPacksResponse["installed"] = []
): UiuxListPacksResponse => ({
  builtin: [
    {
      id: "classic",
      name: "Classic",
      description: "Current Lyra desktop layout and visual language."
    }
  ],
  installed
});

const createInstalledPack = (
  trustState: "trusted" | "untrusted" | "revoked"
): UiuxListPacksResponse["installed"][number] => ({
  id: "external:ocean.ui",
  manifest: {
    id: "external:ocean.ui",
    name: "Ocean UI",
    version: "1.2.3",
    description: "Ocean theme",
    entry: "entry.js",
    workbenchUiApi: "1",
    permissions: ["workbench.ui"],
    software: []
  },
  source: {
    kind: "git",
    url: "https://example.test/ocean.git"
  },
  packagePath: "/packs/ocean",
  entryPath: "/packs/ocean/entry.js",
  sourceFingerprint: "abc123",
  trustState,
  installedAt: "2026-05-25T00:00:00Z",
  updatedAt: "2026-05-25T00:05:00Z"
});

const createDesktopApi = (
  response: UiuxListPacksResponse,
  components: readonly ComponentSummary[] = []
): {
  readonly api: LyraDesktopApi;
  readonly listPacks: ReturnType<typeof vi.fn>;
  readonly installFromLocal: ReturnType<typeof vi.fn>;
  readonly setTrustState: ReturnType<typeof vi.fn>;
  readonly requestActivation: ReturnType<typeof vi.fn>;
  readonly activateComponent: ReturnType<typeof vi.fn>;
  readonly applyCore: ReturnType<typeof vi.fn>;
  readonly stageUpdate: ReturnType<typeof vi.fn>;
  readonly cancelUpdate: ReturnType<typeof vi.fn>;
  readonly rollbackComponent: ReturnType<typeof vi.fn>;
  readonly resolveAppModule: ReturnType<typeof vi.fn>;
} => {
  const listPacks = vi.fn(async () => response);
  const installFromLocal = vi.fn(async () => createInstalledPack("untrusted"));
  const setTrustState = vi.fn(async () => createInstalledPack("trusted"));
  const uninstall = vi.fn(async ({ packId }: { readonly packId: string }) => ({
    packId,
    removed: true
  }));
  const requestActivation = vi.fn(async ({ packId }: { readonly packId: string }) => ({
    packId,
    reloadRequired: packId !== "classic",
    activated: packId === "classic"
  }));
  const activateComponent = vi.fn(async ({ componentId }: { readonly componentId: string }): Promise<ComponentSummary> => {
    const component = components.find((candidate) => candidate.componentId === componentId);
    if (component === undefined) {
      throw new Error(`Unknown component: ${componentId}`);
    }
    if (component.pending === undefined) {
      return component;
    }
    const { pending, ...installed } = component;
    return {
      ...installed,
      ...(component.active === undefined ? {} : { previous: component.active }),
      active: pending
    };
  });
  const rollbackComponent = vi.fn(async (componentId: string): Promise<ComponentSummary> => {
    const component = components.find((candidate) => candidate.componentId === componentId);
    if (component === undefined) {
      throw new Error(`Unknown component: ${componentId}`);
    }
    if (component.previous === undefined) {
      return component;
    }
    const { active, previous, ...installed } = component;
    return {
      ...installed,
      active: previous,
      ...(active === undefined ? {} : { previous: active })
    };
  });
  const applyCore = vi.fn(async () => ({
    state: "spawned" as const,
    componentId: "lyra.core" as const,
    pendingVersion: "2.0.0",
    requestId: "00000000-0000-4000-8000-000000000001"
  }));
  const stageUpdate = vi.fn(async ({ channel }: { readonly channel: "stable" | "preview" }) => ({
    releaseVersion: channel === "preview" ? "2.0.0-preview.1" : "2.0.0",
    catalogSequence: 2,
    target: "darwin-arm64",
    installedComponents: [],
    repairedComponents: [],
    stagedComponents: ["lyra.core"],
    deferredComponents: []
  }));
  const cancelUpdate = vi.fn(async () => undefined);
  const resolveAppModule = vi.fn(async ({
    componentId,
    version
  }: {
    readonly componentId: string;
    readonly version: string;
  }) => {
    throw new Error(`App module entry is unavailable: ${componentId}@${version}`);
  });
  return {
    api: {
      files: {
        selectDirectories: vi.fn(async () => [
          {
            name: "pack",
            path: "/Users/tester/pack",
            kind: "directory" as const
          }
        ])
      },
      uiux: {
        listPacks,
        installFromLocal,
        installFromGit: vi.fn(),
        installFromNpm: vi.fn(),
        setTrustState,
        uninstall,
        requestActivation,
        resolveRuntime: vi.fn()
      },
      components: {
        list: vi.fn(async () => components),
        assessActivation: vi.fn(async (componentId: string) => {
          const component = components.find((candidate) => candidate.componentId === componentId);
          if (component?.pending === undefined) {
            throw new Error(`No pending version: ${componentId}`);
          }
          return {
            componentId,
            ...(component.active === undefined ? {} : { activeVersion: component.active }),
            pendingVersion: component.pending,
            reasons: [],
            addedPermissions: [],
            requiresConfirmation: false
          };
        }),
        resolveAppModule,
        installFromDirectory: vi.fn(),
        activate: activateComponent,
        applyCore,
        rollback: rollbackComponent,
        uninstallVersion: vi.fn(),
        stageUpdate,
        cancelUpdate,
        purgeStagedUpdate: vi.fn(async () => undefined),
        readCoreProjectionStatus: vi.fn(),
        onUpdateProgress: vi.fn(() => () => undefined)
      }
    } as unknown as LyraDesktopApi,
    listPacks,
    installFromLocal,
    setTrustState,
    requestActivation,
    activateComponent,
    applyCore,
    stageUpdate,
    cancelUpdate,
    rollbackComponent,
    resolveAppModule
  };
};

const createSoftwareCapabilities = (
  labels: ReturnType<typeof createLabels>
): SoftwareCapabilitiesRegistryModel => {
  const software: readonly LyraSoftwareManifest[] = labels.builtinApps.map((app) => ({
    id: app.id,
    title: app.title,
    description: app.description,
    category: app.category,
    version: "1.0.0",
    source: "builtin" as const,
    actions: app.id === "file-manager"
      ? [{
          id: "file-manager.openHome",
          title: "Open Home",
          description: "Open home",
          risk: "navigate" as const
        }]
      : []
  }));
  return {
    software,
    loading: false,
    error: null,
    refresh: vi.fn(async () => undefined),
    handleBridgeQuery: vi.fn(),
    createUiPackCapabilities: vi.fn(() => ({
      software: [],
      registerActionHandler: vi.fn(() => vi.fn())
    }))
  };
};

const renderStore = (
  response: UiuxListPacksResponse,
  overrides: Partial<SoftwareStoreSurfaceProps> = {},
  components: readonly ComponentSummary[] = []
) => {
  const { api, ...calls } = createDesktopApi(response, components);
  const labels = createLabels();
  const props: SoftwareStoreSurfaceProps = {
    desktopApi: api,
    labels,
    softwareCapabilities: createSoftwareCapabilities(labels),
    activeUiPackId: "classic",
    onUiPackIdChange: vi.fn(),
    onOpenBuiltinApp: vi.fn(),
    onOpenSettingsRoute: vi.fn(),
    ...overrides
  };
  render(
    <WorkbenchTitlebarContextProvider activeScopeId="tab-test">
      <WorkbenchTitlebarContextSlot />
      <WorkbenchTitlebarScopeProvider scopeId="tab-test">
        <SoftwareStoreSurface {...props} />
      </WorkbenchTitlebarScopeProvider>
    </WorkbenchTitlebarContextProvider>
  );
  return { props, ...calls };
};

describe("SoftwareStoreSurface", () => {
  test("maps declarative settings routes through trusted Core destinations", () => {
    expect(resolveSoftwareStoreSettingsRouteTarget("/credentials")).toBe("loginManager");
    expect(resolveSoftwareStoreSettingsRouteTarget("/settings/softwareStore"))
      .toBe("softwareStore");
    expect(resolveSoftwareStoreSettingsRouteTarget("/models")).toBe("models");
    expect(resolveSoftwareStoreSettingsRouteTarget("/unknown-module-route")).toBeNull();
    expect(resolveSoftwareStoreSettingsRouteTarget("https://example.test/settings")).toBeNull();
    expect(resolveSoftwareStoreSettingsRouteTarget("//example.test/settings")).toBeNull();
    expect(resolveSoftwareStoreSettingsRouteTarget("/settings//models")).toBeNull();
    expect(resolveSoftwareStoreSettingsRouteTarget("/settings/models?source=module")).toBeNull();
    expect(resolveSoftwareStoreSettingsRouteTarget("/settings/models#advanced")).toBeNull();
    expect(resolveSoftwareStoreSettingsRouteTarget("/settings\\models")).toBeNull();
  });

  test("shows built-in software and opens supported built-in apps", async () => {
    const onOpenBuiltinApp = vi.fn();
    renderStore(createResponse(), { onOpenBuiltinApp });

    fireEvent.click(await screen.findByRole("button", { name: /This PC/ }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(onOpenBuiltinApp).toHaveBeenCalledWith("file-manager");
  });

  test("switches sections from the address-bar buttons", async () => {
    renderStore(createResponse());

    // Built-in rows are visible first; the built-in switcher button is pressed.
    expect(await screen.findByRole("button", { name: /This PC/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Built-in" })).toHaveAttribute("aria-pressed", "true");

    // Switching hides the built-in list and marks the component button active.
    fireEvent.click(screen.getByRole("button", { name: "Components" }));
    expect(screen.getByRole("button", { name: "Components" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /This PC/ })).not.toBeInTheDocument();

    // Switching back restores the built-in list.
    fireEvent.click(screen.getByRole("button", { name: "Built-in" }));
    expect(await screen.findByRole("button", { name: /This PC/ })).toBeInTheDocument();
  });

  test("installs a local UIUX pack through the existing bridge", async () => {
    const { installFromLocal } = renderStore(createResponse());

    fireEvent.click(await screen.findByRole("button", { name: "Install local pack" }));

    await waitFor(() => {
      expect(installFromLocal).toHaveBeenCalledWith({
        sourcePath: "/Users/tester/pack"
      });
    });
  });

  test("checks and stages the signed Preview component channel", async () => {
    const { stageUpdate } = renderStore(createResponse());

    fireEvent.click(await screen.findByRole("button", { name: "Check and stage updates" }));

    await waitFor(() => {
      expect(stageUpdate).toHaveBeenCalledWith({ channel: "preview" });
    });
    expect(await screen.findByText(/2\.0\.0-preview\.1/u)).toBeInTheDocument();
  });

  test("trusts and activates installed UIUX packs", async () => {
    const setUiPackId = vi.fn();
    const { setTrustState, requestActivation } = renderStore(
      createResponse([createInstalledPack("trusted")]),
      { onUiPackIdChange: setUiPackId }
    );

    fireEvent.click(await screen.findByRole("button", { name: "UIUX packs" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ocean UI/ }));
    fireEvent.click(screen.getByRole("button", { name: "Revoke trust" }));

    await waitFor(() => {
      expect(setTrustState).toHaveBeenCalledWith({
        packId: "external:ocean.ui",
        trustState: "revoked"
      });
    });
    await screen.findByText("Operation completed.");

    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(requestActivation).toHaveBeenCalledWith({
        packId: "external:ocean.ui"
      });
      expect(setUiPackId).toHaveBeenCalledWith("external:ocean.ui");
    });
  });

  test("requires a trusted-code acknowledgement before trusting a UIUX pack", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    const { setTrustState } = renderStore(
      createResponse([createInstalledPack("untrusted")])
    );

    fireEvent.click(await screen.findByRole("button", { name: "UIUX packs" }));
    fireEvent.click(await screen.findByRole("button", { name: /Ocean UI/ }));
    fireEvent.click(screen.getByRole("button", { name: "Trust" }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        expect.stringMatching(/full trusted Desktop UI API/u)
      );
      expect(setTrustState).toHaveBeenCalledWith({
        packId: "external:ocean.ui",
        trustState: "trusted",
        acknowledgeTrustedDesktopCode: true
      });
    });
    vi.unstubAllGlobals();
  });

  test("rejects an app activation before disk mutation when its renderer module cannot load", async () => {
    const component: ComponentSummary = {
      componentId: "lyra.images",
      kind: "app",
      active: "1.0.0",
      pending: "9.0.0",
      versions: [
        { version: "1.0.0", installedAt: "2026-07-30T00:00:00Z", target: "darwin-arm64" },
        { version: "9.0.0", installedAt: "2026-07-30T00:01:00Z", target: "darwin-arm64" }
      ]
    };
    const { activateComponent } = renderStore(createResponse(), {}, [component]);

    fireEvent.click(await screen.findByRole("button", { name: "Components" }));
    fireEvent.click(await screen.findByRole("button", { name: /lyra\.images/ }));
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    expect(await screen.findByText(/App module entry is unavailable: lyra\.images@9\.0\.0/))
      .toBeInTheDocument();
    expect(activateComponent).not.toHaveBeenCalled();
  });

  test("allows non-app components to use their own activation coordinator", async () => {
    const component: ComponentSummary = {
      componentId: "lyra.runtime",
      kind: "runtime",
      active: "1.0.0",
      pending: "1.1.0",
      versions: [
        { version: "1.0.0", installedAt: "2026-07-30T00:00:00Z", target: "darwin-arm64" },
        { version: "1.1.0", installedAt: "2026-07-30T00:01:00Z", target: "darwin-arm64" }
      ]
    };
    const { activateComponent } = renderStore(createResponse(), {}, [component]);

    fireEvent.click(await screen.findByRole("button", { name: "Components" }));
    fireEvent.click(await screen.findByRole("button", { name: /lyra\.runtime/ }));
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(activateComponent).toHaveBeenCalledWith({
        componentId: "lyra.runtime",
        confirmedReasons: []
      });
    });
  });

  test("uses the explicit restart handoff for a pending Core update", async () => {
    const component: ComponentSummary = {
      componentId: "lyra.core",
      kind: "core",
      active: "1.0.0",
      pending: "2.0.0",
      versions: [
        { version: "1.0.0", installedAt: "2026-07-30T00:00:00Z", target: "darwin-arm64" },
        { version: "2.0.0", installedAt: "2026-07-30T00:01:00Z", target: "darwin-arm64" }
      ]
    };
    const confirm = vi.spyOn(globalThis, "confirm").mockReturnValue(true);
    const { applyCore, activateComponent } = renderStore(createResponse(), {}, [component]);

    fireEvent.click(await screen.findByRole("button", { name: "Components" }));
    fireEvent.click(await screen.findByRole("button", { name: /lyra\.core/ }));
    expect(screen.queryByRole("button", { name: "Roll back" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restart and apply" }));

    await waitFor(() => {
      expect(applyCore).toHaveBeenCalledWith({
        componentId: "lyra.core",
        confirmedReasons: []
      });
    });
    expect(activateComponent).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith(
      "Lyra will fully quit and apply the verified Core update. If integrity verification or replacement fails, the previous version will be restored. Continue?"
    );
    confirm.mockRestore();
  });

  test("shows and consumes declarations from the active app module", async () => {
    const componentId = "dev.store.contributions";
    let commandRegistration: { readonly dispose: () => void } | undefined;
    const commandHandler = vi.fn(async (_input: JsonValue) => ({ ready: true }));
    const activateModule = vi.fn((
      host: Parameters<NonNullable<LyraAppModule["activate"]>>[0]
    ) => {
      commandRegistration = host.registerCommand(
        `${componentId}.inspect`,
        commandHandler
      );
    });
    const module: LyraAppModule = {
      id: componentId,
      version: "1.0.0",
      contributions: {
        commands: [{
          id: `${componentId}.inspect`,
          title: "Inspect state",
          requiredCapability: "state:read"
        }],
        settings: [{
          id: `${componentId}.settings`,
          title: "Credential settings",
          route: "/credentials"
        }],
        status: [{
          id: `${componentId}.ready`,
          title: "Ready state"
        }],
        capabilities: [{
          id: `${componentId}.query`,
          title: "Query state",
          version: "1.2.0"
        }],
        events: [{
          id: `${componentId}.changed`,
          title: "State changed",
          requiredCapability: "state:read"
        }]
      },
      activate: activateModule,
      create: ({ instanceId }) => ({ instanceId }),
      restore: ({ instanceId }) => ({ instanceId }),
      snapshot: () => ({}),
      close: () => undefined,
      deactivate: () => {
        commandRegistration?.dispose();
        commandRegistration = undefined;
      },
      mount: () => undefined,
      unmount: () => undefined
    };
    const unregister = registerWorkspaceAppModule(module);
    const component: ComponentSummary = {
      componentId,
      kind: "app",
      active: "1.0.0",
      versions: [{
        version: "1.0.0",
        installedAt: "2026-07-30T00:00:00Z",
        target: "darwin-arm64"
      }]
    };
    const onOpenSettingsRoute = vi.fn();
    renderStore(createResponse(), { onOpenSettingsRoute }, [component]);

    fireEvent.click(await screen.findByRole("button", { name: "Components" }));
    fireEvent.click(await screen.findByRole("button", { name: /dev\.store\.contributions/ }));
    expect(screen.getByText("Independent module loaded")).toBeInTheDocument();
    expect(screen.getByText("dev.store.contributions.ready")).toBeInTheDocument();
    expect(screen.getByText("dev.store.contributions.query")).toBeInTheDocument();
    expect(screen.getByText("dev.store.contributions.changed")).toBeInTheDocument();
    expect(activateModule).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("Module command completed.")).toBeInTheDocument();
    expect(activateModule).toHaveBeenCalledTimes(1);
    expect(commandHandler).toHaveBeenCalledWith({});

    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    await waitFor(() => {
      expect(commandHandler).toHaveBeenCalledTimes(2);
    });
    expect(activateModule).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));
    await waitFor(() => {
      expect(onOpenSettingsRoute).toHaveBeenCalledWith("/credentials");
    });

    await unregister();
  });

  test("offers repair when the active app module is missing", async () => {
    const component: ComponentSummary = {
      componentId: "dev.store.missing",
      kind: "app",
      active: "1.0.0",
      versions: [{
        version: "1.0.0",
        installedAt: "2026-07-30T00:00:00Z",
        target: "darwin-arm64"
      }]
    };
    const { resolveAppModule } = renderStore(createResponse(), {}, [component]);

    fireEvent.click(await screen.findByRole("button", { name: "Components" }));
    fireEvent.click(await screen.findByRole("button", { name: /dev\.store\.missing/ }));
    expect(screen.getByText("Active module is not loaded")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Repair module" }));

    expect(await screen.findByText(/App module entry is unavailable: dev\.store\.missing@1\.0\.0/))
      .toBeInTheDocument();
    expect(resolveAppModule).toHaveBeenCalledWith({
      componentId: "dev.store.missing",
      version: "1.0.0"
    });
  });

  test("commits a loaded app version only after disk activation succeeds", async () => {
    const componentId = "dev.store.lifecycle";
    const createModule = (version: string) => ({
      id: componentId,
      version,
      activate: vi.fn(),
      create: vi.fn(({ instanceId }: { readonly instanceId: string }) => ({ instanceId })),
      restore: vi.fn(({ instanceId }: { readonly instanceId: string }) => ({ instanceId })),
      snapshot: vi.fn(() => ({})),
      close: vi.fn(),
      deactivate: vi.fn(),
      mount: vi.fn(),
      unmount: vi.fn()
    });
    const unregisterV1 = registerWorkspaceAppModule(createModule("1.0.0"));
    const unregisterV2 = registerWorkspaceAppModule(createModule("2.0.0"));
    const component: ComponentSummary = {
      componentId,
      kind: "app",
      active: "1.0.0",
      pending: "2.0.0",
      versions: [
        { version: "1.0.0", installedAt: "2026-07-30T00:00:00Z", target: "darwin-arm64" },
        { version: "2.0.0", installedAt: "2026-07-30T00:01:00Z", target: "darwin-arm64" }
      ]
    };
    const { activateComponent } = renderStore(createResponse(), {}, [component]);

    fireEvent.click(await screen.findByRole("button", { name: "Components" }));
    fireEvent.click(await screen.findByRole("button", { name: /dev\.store\.lifecycle/ }));
    fireEvent.click(screen.getByRole("button", { name: "Activate" }));

    await waitFor(() => {
      expect(activateComponent).toHaveBeenCalledWith({
        componentId,
        confirmedReasons: []
      });
      expect(readWorkspaceAppVersionState(componentId).active).toBe("2.0.0");
    });
    await unregisterV1();
    await unregisterV2();
  });
});
