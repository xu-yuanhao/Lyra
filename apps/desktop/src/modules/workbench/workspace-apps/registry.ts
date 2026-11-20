import {
  validateLyraAppModule,
  validateWorkspaceTabV2,
  type HostCapabilityContributionV1,
  type HostCommandContributionV1,
  type HostEventContributionV1,
  type HostSettingsContributionV1,
  type HostStatusContributionV1,
  type JsonValue,
  type LyraAppInstanceV1,
  type LyraAppModule
} from "@lyra/app-runtime";

import { workbenchChromeBus } from "../shell/workbench-chrome-bus";
import { createLyraHostBus } from "./host-api";
import {
  createNestedAppSlotCoordinator,
  type NestedAppOwner
} from "./nested-slots";
import {
  assertModuleContributionsOwned,
  normalizeWorkspaceIdentifier as normalizeIdentifier,
  normalizeWorkspaceVersion as normalizeVersion
} from "./registry-contracts";

export type WorkspaceProductComponentId = string;

export type WorkspaceProductComponentDescriptor = {
  readonly componentId: WorkspaceProductComponentId;
  readonly version: string;
  readonly activation: "module-idle";
  /**
   * Trusted Core policy. Preview surfaces may be loaded and command-tested, but
   * Workbench keeps the complete static renderer until its feature matrix is at parity.
   */
  readonly surfaceReadiness: "preview" | "complete";
  readonly appIds: readonly string[];
};

export type WorkspaceAppDescriptor = {
  readonly appId: string;
  readonly componentId: WorkspaceProductComponentId;
  readonly version: string;
};

export type WorkspaceAppVersionState = {
  readonly active: string;
  readonly previous?: string;
  readonly pending?: string;
  readonly references: number;
};

export type WorkspaceAppInstanceHandle = {
  readonly componentId: WorkspaceProductComponentId;
  readonly version: string;
  readonly instanceId: string;
  readonly snapshot: () => Promise<JsonValue>;
  readonly close: () => Promise<WorkspaceAppVersionState>;
};

export type WorkspaceAppVersionActivation = {
  readonly componentId: WorkspaceProductComponentId;
  readonly targetVersion: string;
  readonly commit: (activatedVersion: string) => Promise<WorkspaceAppVersionState>;
  readonly cancel: () => void;
};

export type WorkspaceAppVersionPointers = {
  readonly active?: string;
  readonly previous?: string;
  readonly pending?: string;
};

export type WorkspaceAppContributionSet = {
  readonly componentId: string;
  readonly version: string;
  readonly commands: readonly HostCommandContributionV1[];
  readonly capabilities: readonly HostCapabilityContributionV1[];
  readonly settings: readonly HostSettingsContributionV1[];
  readonly status: readonly HostStatusContributionV1[];
  readonly events: readonly HostEventContributionV1[];
};

export type WorkspaceAppActiveModuleSnapshot = WorkspaceAppContributionSet & {
  /**
   * Core-owned view of the active renderer record. A compatibility fallback
   * preserves the built-in surface, but is not an independently loaded bundle.
   */
  readonly moduleState: "loaded" | "compatibility-fallback" | "missing";
  readonly surfaceCapable: boolean;
};

const BUILTIN_WORKSPACE_APPS = [
  { appId: "browser", componentId: "lyra.browser", version: "1.0.0" },
  { appId: "file-manager", componentId: "lyra.files", version: "1.0.0" },
  { appId: "file-editor", componentId: "lyra.editor", version: "1.0.0" },
  { appId: "image-viewer", componentId: "lyra.images", version: "1.0.0" },
  { appId: "office-viewer", componentId: "lyra.office", version: "1.0.0" },
  { appId: "terminal", componentId: "lyra.terminal", version: "1.0.0" },
  { appId: "downloads", componentId: "lyra.downloads", version: "1.0.0" },
  { appId: "agent-solo", componentId: "lyra.agent", version: "1.0.0" },
  { appId: "agent-project-tree", componentId: "lyra.agent", version: "1.0.0" },
  { appId: "agent-plan-board", componentId: "lyra.agent", version: "1.0.0" },
  { appId: "agent-subagent", componentId: "lyra.agent", version: "1.0.0" },
  { appId: "agent-git", componentId: "lyra.agent", version: "1.0.0" },
  { appId: "agent-session-history", componentId: "lyra.agent", version: "1.0.0" },
  { appId: "login-manager", componentId: "lyra.credentials", version: "1.0.0" },
  { appId: "notification-center", componentId: "lyra.notifications", version: "1.0.0" },
  { appId: "software-store", componentId: "lyra.core", version: "1.0.0" }
] as const satisfies readonly WorkspaceAppDescriptor[];

/** The ten independently published first-party application units. */
export const BUILTIN_PRODUCT_COMPONENTS = [
  { componentId: "lyra.browser", version: "1.0.0", activation: "module-idle", surfaceReadiness: "preview", appIds: ["browser"] },
  { componentId: "lyra.files", version: "1.0.0", activation: "module-idle", surfaceReadiness: "preview", appIds: ["file-manager"] },
  { componentId: "lyra.editor", version: "1.0.0", activation: "module-idle", surfaceReadiness: "preview", appIds: ["file-editor"] },
  { componentId: "lyra.images", version: "1.0.0", activation: "module-idle", surfaceReadiness: "preview", appIds: ["image-viewer"] },
  { componentId: "lyra.office", version: "1.0.0", activation: "module-idle", surfaceReadiness: "preview", appIds: ["office-viewer"] },
  { componentId: "lyra.terminal", version: "1.0.0", activation: "module-idle", surfaceReadiness: "preview", appIds: ["terminal"] },
  { componentId: "lyra.downloads", version: "1.0.0", activation: "module-idle", surfaceReadiness: "complete", appIds: ["downloads"] },
  {
    componentId: "lyra.agent",
    version: "1.0.0",
    activation: "module-idle",
    surfaceReadiness: "preview",
    appIds: [
      "agent-solo",
      "agent-project-tree",
      "agent-plan-board",
      "agent-subagent",
      "agent-git",
      "agent-session-history"
    ]
  },
  { componentId: "lyra.credentials", version: "1.0.0", activation: "module-idle", surfaceReadiness: "complete", appIds: ["login-manager"] },
  { componentId: "lyra.notifications", version: "1.0.0", activation: "module-idle", surfaceReadiness: "complete", appIds: ["notification-center"] }
] as const satisfies readonly WorkspaceProductComponentDescriptor[];

type MutableVersionState = {
  active: string;
  previous?: string;
  pending?: string;
  references: number;
  readonly referencesByVersion: Map<string, number>;
  appComponent: boolean;
  activationToken?: symbol;
};

type ModuleRecord = {
  readonly module: LyraAppModule;
  readonly host: ReturnType<ReturnType<typeof createLyraHostBus>["createHost"]>;
  readonly lifecycleQueue: { current: Promise<void> };
  activated: boolean;
};

type InstanceRecord = {
  readonly appId: string;
  readonly componentId: string;
  readonly version: string;
  readonly instanceId: string;
  readonly moduleRecord: ModuleRecord;
  readonly lease: ReturnType<typeof acquireWorkspaceAppVersion>;
  readonly opening: Promise<LyraAppInstanceV1>;
  readonly surfaceQueue: { current: Promise<void> };
  consumers: number;
  mountedContainer?: HTMLElement;
  closePromise?: Promise<WorkspaceAppVersionState>;
};

const descriptors = new Map<string, WorkspaceAppDescriptor>(
  BUILTIN_WORKSPACE_APPS.map((descriptor) => [descriptor.appId, descriptor])
);
const versions = new Map<string, MutableVersionState>();
const modules = new Map<string, ModuleRecord>();
const fallbackModules = new Map<string, ModuleRecord>();
const instances = new Map<string, InstanceRecord>();
const instanceWaiters = new Map<string, Set<(record: InstanceRecord) => void>>();
/**
 * Host tab for instances Core mounts inside a tab surface rather than as the
 * tab's own app (for example the Logins page inside Settings). Chrome
 * contributions resolve their scope through this binding.
 */
const hostTabByInstance = new Map<string, string>();
const hostBus = createLyraHostBus();

const moduleKey = (componentId: string, version: string): string =>
  `${componentId}\u0000${version}`;

const notifyInstanceWaiters = (record: InstanceRecord): void => {
  const waiters = instanceWaiters.get(record.instanceId);
  if (waiters === undefined) {
    return;
  }
  instanceWaiters.delete(record.instanceId);
  for (const resolve of waiters) {
    resolve(record);
  }
};

const waitForInstanceRecord = (instanceId: string): Promise<InstanceRecord> => {
  const existing = instances.get(instanceId);
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }
  return new Promise<InstanceRecord>((resolve, reject) => {
    const waiters = instanceWaiters.get(instanceId) ?? new Set();
    const onReady = (record: InstanceRecord): void => {
      clearTimeout(timeout);
      resolve(record);
    };
    const timeout = setTimeout(() => {
      waiters.delete(onReady);
      if (waiters.size === 0) {
        instanceWaiters.delete(instanceId);
      }
      reject(new Error(`Workspace app instance did not open: ${instanceId}`));
    }, 10_000);
    waiters.add(onReady);
    instanceWaiters.set(instanceId, waiters);
  });
};

const createVersionState = (version: string, appComponent: boolean): MutableVersionState => ({
  active: version,
  references: 0,
  referencesByVersion: new Map<string, number>(),
  appComponent
});

for (const descriptor of BUILTIN_PRODUCT_COMPONENTS) {
  versions.set(descriptor.componentId, createVersionState(descriptor.version, true));
}
for (const descriptor of BUILTIN_WORKSPACE_APPS) {
  if (!versions.has(descriptor.componentId)) {
    versions.set(descriptor.componentId, createVersionState(descriptor.version, false));
  }
}

const requireVersionState = (componentId: WorkspaceProductComponentId): MutableVersionState => {
  const state = versions.get(componentId);
  if (state === undefined) {
    throw new Error(`Unknown workspace component: ${componentId}`);
  }
  return state;
};

const snapshotVersionState = (state: MutableVersionState): WorkspaceAppVersionState => ({
  active: state.active,
  ...(state.previous === undefined ? {} : { previous: state.previous }),
  ...(state.pending === undefined ? {} : { pending: state.pending }),
  references: state.references
});

const requireLoadedModule = (componentId: string, version: string): ModuleRecord => {
  const record = modules.get(moduleKey(componentId, version));
  if (record === undefined) {
    throw new Error(`Workspace app module is not loaded: ${componentId}@${version}`);
  }
  return record;
};

const enqueueLifecycle = async <T>(
  record: ModuleRecord,
  operation: () => Promise<T>
): Promise<T> => {
  const previous = record.lifecycleQueue.current;
  let releaseQueue!: () => void;
  record.lifecycleQueue.current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    releaseQueue();
  }
};

const ensureModuleActivated = async (record: ModuleRecord): Promise<void> => {
  await enqueueLifecycle(record, async () => {
    if (!record.activated) {
      await record.module.activate(record.host);
      record.activated = true;
    }
  });
};

const referencesForVersion = (state: MutableVersionState, version: string): number =>
  state.referencesByVersion.get(version) ?? 0;

const deactivateModuleWhenUnused = async (
  componentId: string,
  version: string,
  options: { readonly allowActive?: boolean } = {}
): Promise<void> => {
  const state = requireVersionState(componentId);
  if (referencesForVersion(state, version) > 0) {
    throw new Error(`Cannot deactivate a running workspace app module: ${componentId}@${version}`);
  }
  if (!options.allowActive && state.active === version) {
    return;
  }
  const record = modules.get(moduleKey(componentId, version));
  if (record === undefined) {
    return;
  }
  await enqueueLifecycle(record, async () => {
    if (record.activated) {
      await record.module.deactivate();
      workbenchChromeBus.clearOwner(componentId);
      record.activated = false;
    }
  });
};

const assertValidInstanceResult = (
  value: LyraAppInstanceV1,
  instanceId: string
): LyraAppInstanceV1 => {
  if (
    typeof value !== "object"
    || value === null
    || typeof value.instanceId !== "string"
    || value.instanceId !== instanceId
  ) {
    throw new Error(`Workspace app module returned an invalid instance: ${instanceId}`);
  }
  return value;
};

const assertJsonSnapshot = (
  componentId: string,
  version: string,
  instanceId: string,
  value: unknown
): JsonValue => {
  if (!validateWorkspaceTabV2({
    schemaVersion: 2,
    appId: componentId,
    appVersion: version,
    instanceId,
    route: "/",
    opaqueState: value
  })) {
    throw new Error(`Workspace app module returned a non-JSON snapshot: ${componentId}@${version}`);
  }
  return value as JsonValue;
};

const createSharedRendererModule = (
  componentId: string,
  version: string
): LyraAppModule => {
  const snapshots = new Map<string, JsonValue>();
  return {
    id: componentId,
    version,
    activate: () => undefined,
    create: ({ instanceId }) => {
      snapshots.set(instanceId, {});
      return { instanceId };
    },
    restore: ({ instanceId, opaqueState }) => {
      snapshots.set(instanceId, opaqueState);
      return { instanceId };
    },
    snapshot: ({ instanceId }) => snapshots.get(instanceId) ?? {},
    close: ({ instanceId }) => {
      snapshots.delete(instanceId);
    },
    deactivate: () => {
      if (snapshots.size > 0) {
        throw new Error(`Cannot deactivate shared renderer module with open instances: ${componentId}`);
      }
    }
  };
};

export const listWorkspaceProductComponents = ():
readonly WorkspaceProductComponentDescriptor[] => BUILTIN_PRODUCT_COMPONENTS;

export const listWorkspaceApps = (): readonly WorkspaceAppDescriptor[] =>
  [...descriptors.values()];

export const readWorkspaceAppActiveModule = (
  componentId: string
): WorkspaceAppActiveModuleSnapshot | undefined => {
  const state = versions.get(componentId);
  if (state === undefined) {
    return undefined;
  }
  const key = moduleKey(componentId, state.active);
  const record = modules.get(key);
  const contributions = record?.module.contributions;
  return {
    componentId,
    version: state.active,
    moduleState: record === undefined
      ? "missing"
      : fallbackModules.get(key) === record
        ? "compatibility-fallback"
        : "loaded",
    surfaceCapable: record !== undefined
      && typeof record.module.mount === "function"
      && typeof record.module.unmount === "function",
    commands: contributions?.commands ?? [],
    capabilities: contributions?.capabilities ?? [],
    settings: contributions?.settings ?? [],
    status: contributions?.status ?? [],
    events: contributions?.events ?? []
  };
};

export const listWorkspaceAppContributions = (): readonly WorkspaceAppContributionSet[] => {
  const result: WorkspaceAppContributionSet[] = [];
  for (const [componentId, state] of versions) {
    const record = modules.get(moduleKey(componentId, state.active));
    const contributions = record?.module.contributions;
    if (contributions === undefined) {
      continue;
    }
    result.push({
      componentId,
      version: state.active,
      commands: contributions.commands ?? [],
      capabilities: contributions.capabilities ?? [],
      settings: contributions.settings ?? [],
      status: contributions.status ?? [],
      events: contributions.events ?? []
    });
  }
  return result;
};

export const executeWorkspaceAppCommand = async (
  commandId: string,
  input: JsonValue
): Promise<JsonValue> => {
  const owners = listWorkspaceAppContributions().filter(({ commands }) =>
    commands.some(({ id }) => id === commandId)
  );
  if (owners.length === 0) {
    throw new Error(`Workspace app command is not declared by an active module: ${commandId}`);
  }
  if (owners.length !== 1) {
    throw new Error(`Workspace app command has multiple active owners: ${commandId}`);
  }
  const owner = owners[0]!;
  const state = requireVersionState(owner.componentId);
  if (state.active !== owner.version) {
    throw new Error(`Workspace app command owner is no longer active: ${commandId}`);
  }
  const lease = acquireWorkspaceAppVersion(owner.componentId, owner.version);
  const record = requireLoadedModule(owner.componentId, owner.version);
  try {
    await ensureModuleActivated(record);
    return await hostBus.executeRegisteredCommand(commandId, input);
  } finally {
    lease.release();
  }
};

export const resolveWorkspaceApp = (
  appId: string
): WorkspaceAppDescriptor | undefined => descriptors.get(appId);

export const isWorkspaceProductComponent = (componentId: string): boolean =>
  versions.get(componentId)?.appComponent === true;

export const isWorkspaceProductSurfaceComplete = (componentId: string): boolean =>
  BUILTIN_PRODUCT_COMPONENTS.some(
    (descriptor) =>
      descriptor.componentId === componentId && descriptor.surfaceReadiness === "complete"
  );

export const isWorkspaceAppModuleLoaded = (
  componentId: string,
  version: string
): boolean => modules.has(moduleKey(componentId, version));

export const assertWorkspaceAppModuleLoaded = (
  componentId: string,
  version: string
): void => {
  requireLoadedModule(
    normalizeIdentifier(componentId, "Workspace component id"),
    normalizeVersion(version)
  );
};

export const assertWorkspaceAppVersionCanOpen = (
  componentId: string,
  version: string
): void => {
  const normalizedComponentId = normalizeIdentifier(componentId, "Workspace component id");
  const state = requireVersionState(normalizedComponentId);
  if (state.activationToken !== undefined) {
    throw new Error(`Workspace app activation is in progress: ${normalizedComponentId}`);
  }
  if (state.appComponent && !isWorkspaceProductSurfaceComplete(normalizedComponentId)) {
    requireLoadedModule(normalizedComponentId, normalizeVersion(version));
  }
};

export const registerWorkspaceApp = (descriptor: WorkspaceAppDescriptor): (() => void) => {
  const appId = normalizeIdentifier(descriptor.appId, "Workspace app id");
  const componentId = normalizeIdentifier(descriptor.componentId, "Workspace component id");
  const version = normalizeVersion(descriptor.version);
  if (descriptors.has(appId)) {
    throw new Error(`Workspace app is already registered: ${appId}`);
  }
  const normalizedDescriptor = { appId, componentId, version };
  descriptors.set(appId, normalizedDescriptor);
  const state = versions.get(componentId);
  if (state === undefined) {
    versions.set(componentId, createVersionState(version, true));
  } else {
    state.appComponent = true;
  }
  return () => {
    if (descriptors.get(appId) === normalizedDescriptor) {
      descriptors.delete(appId);
    }
  };
};

export const registerWorkspaceAppModule = (
  value: unknown,
  options: {
    readonly allowedCapabilities?: ReadonlySet<string>;
    /** Allows a verified installed bundle to replace Core's non-surface fallback for the same version. */
    readonly replaceFallback?: boolean;
    /** Core-only marker used while registering the static compatibility implementation. */
    readonly fallback?: boolean;
  } = {}
): (() => Promise<void>) => {
  if (!validateLyraAppModule(value)) {
    throw new Error("Invalid LyraAppModule implementation.");
  }
  assertModuleContributionsOwned(value);
  const componentId = value.id;
  const version = value.version;
  const key = moduleKey(componentId, version);
  const existing = modules.get(key);
  const replaceableFallback = existing !== undefined && fallbackModules.get(key) === existing;
  if (existing !== undefined && (!options.replaceFallback || !replaceableFallback)) {
    throw new Error(`Workspace app module is already loaded: ${componentId}@${version}`);
  }
  if (replaceableFallback && referencesForVersion(requireVersionState(componentId), version) > 0) {
    throw new Error(`Cannot replace a running workspace app fallback: ${componentId}@${version}`);
  }
  const state = versions.get(componentId);
  if (state === undefined) {
    versions.set(componentId, createVersionState(version, true));
  } else {
    state.appComponent = true;
  }
  const record: ModuleRecord = {
    module: value,
    host: hostBus.createHost({
      moduleId: componentId,
      ...(options.allowedCapabilities === undefined
        ? {}
        : { allowedCapabilities: options.allowedCapabilities })
    }),
    lifecycleQueue: { current: Promise.resolve() },
    activated: false
  };
  modules.set(key, record);
  if (options.fallback === true) {
    fallbackModules.set(key, record);
  }
  let registered = true;
  return async () => {
    if (!registered || modules.get(key) !== record) {
      return;
    }
    const currentState = requireVersionState(componentId);
    if (referencesForVersion(currentState, version) > 0) {
      throw new Error(`Cannot unload a running workspace app module: ${componentId}@${version}`);
    }
    await deactivateModuleWhenUnused(componentId, version, { allowActive: true });
    const fallback = fallbackModules.get(key);
    if (fallback !== undefined && fallback !== record) {
      modules.set(key, fallback);
    } else {
      modules.delete(key);
      if (fallback === record) {
        fallbackModules.delete(key);
      }
    }
    record.host.dispose();
    registered = false;
  };
};

for (const descriptor of BUILTIN_PRODUCT_COMPONENTS) {
  if (descriptor.surfaceReadiness === "complete") {
    continue;
  }
  registerWorkspaceAppModule(
    createSharedRendererModule(descriptor.componentId, descriptor.version),
    { fallback: true }
  );
}

export const registerWorkspaceCoreCommand = hostBus.registerCoreCommand;
export const registerWorkspaceCoreCapability = hostBus.registerCoreCapability;
export const registerWorkspaceCoreEvent = hostBus.registerCoreEvent;

export const readWorkspaceAppVersionState = (
  componentId: WorkspaceProductComponentId
): WorkspaceAppVersionState => snapshotVersionState(requireVersionState(componentId));

export const acquireWorkspaceAppVersion = (
  componentId: WorkspaceProductComponentId,
  requestedVersion?: string
): { readonly version: string; readonly release: () => WorkspaceAppVersionState } => {
  const state = requireVersionState(componentId);
  if (state.activationToken !== undefined) {
    throw new Error(`Workspace app activation is in progress: ${componentId}`);
  }
  const version = requestedVersion === undefined
    ? state.active
    : normalizeVersion(requestedVersion);
  if (state.appComponent) {
    requireLoadedModule(componentId, version);
  }
  state.references += 1;
  state.referencesByVersion.set(version, referencesForVersion(state, version) + 1);
  let released = false;
  return {
    version,
    release: () => {
      if (!released) {
        released = true;
        state.references = Math.max(0, state.references - 1);
        const nextVersionReferences = Math.max(0, referencesForVersion(state, version) - 1);
        if (nextVersionReferences === 0) {
          state.referencesByVersion.delete(version);
        } else {
          state.referencesByVersion.set(version, nextVersionReferences);
        }
      }
      return snapshotVersionState(state);
    }
  };
};

/**
 * Reconciles the renderer registry with the signed on-disk component registry
 * before workspace tabs are restored. Pointer changes while instances are open
 * must go through beginWorkspaceAppVersionActivation instead.
 */
export const hydrateWorkspaceAppVersionState = (
  componentId: WorkspaceProductComponentId,
  pointers: WorkspaceAppVersionPointers
): WorkspaceAppVersionState => {
  const state = requireVersionState(componentId);
  if (state.references > 0 || state.activationToken !== undefined) {
    throw new Error(`Cannot hydrate a running workspace component: ${componentId}`);
  }
  const active = pointers.active === undefined
    ? state.active
    : normalizeVersion(pointers.active);
  const previous = pointers.previous === undefined
    ? undefined
    : normalizeVersion(pointers.previous);
  const pending = pointers.pending === undefined
    ? undefined
    : normalizeVersion(pointers.pending);
  if (state.appComponent) {
    for (const version of new Set([active, previous, pending].filter(
      (value): value is string => value !== undefined
    ))) {
      requireLoadedModule(componentId, version);
    }
  }
  state.active = active;
  if (previous === undefined) {
    delete state.previous;
  } else {
    state.previous = previous;
  }
  if (pending === undefined) {
    delete state.pending;
  } else {
    state.pending = pending;
  }
  return snapshotVersionState(state);
};

export const stageWorkspaceAppVersion = (
  componentId: WorkspaceProductComponentId,
  version: string
): WorkspaceAppVersionState => {
  const state = requireVersionState(componentId);
  const normalized = normalizeVersion(version);
  if (state.activationToken !== undefined) {
    throw new Error(`Workspace app activation is in progress: ${componentId}`);
  }
  if (state.appComponent) {
    requireLoadedModule(componentId, normalized);
  }
  if (normalized === state.active) {
    delete state.pending;
    return snapshotVersionState(state);
  }
  if (state.references === 0) {
    state.previous = state.active;
    state.active = normalized;
    delete state.pending;
  } else {
    state.pending = normalized;
  }
  return snapshotVersionState(state);
};

export const beginWorkspaceAppVersionActivation = (
  componentId: WorkspaceProductComponentId,
  targetVersion: string,
  options: { readonly expectedActiveVersion?: string } = {}
): WorkspaceAppVersionActivation => {
  const state = requireVersionState(componentId);
  const normalized = normalizeVersion(targetVersion);
  if (!state.appComponent) {
    throw new Error(`Component is not a workspace app release: ${componentId}`);
  }
  requireLoadedModule(componentId, normalized);
  if (
    options.expectedActiveVersion !== undefined
    && state.active !== normalizeVersion(options.expectedActiveVersion)
  ) {
    throw new Error(
      `Workspace and component registries disagree for ${componentId}: renderer=${state.active}, disk=${options.expectedActiveVersion}.`
    );
  }
  if (state.references > 0) {
    throw new Error(`Cannot activate a running workspace component: ${componentId}`);
  }
  if (state.activationToken !== undefined) {
    throw new Error(`Workspace app activation is already in progress: ${componentId}`);
  }
  const token = Symbol(`${componentId}@${normalized}`);
  state.activationToken = token;
  let finished = false;
  const cancel = (): void => {
    if (!finished && state.activationToken === token) {
      delete state.activationToken;
      finished = true;
    }
  };
  return {
    componentId,
    targetVersion: normalized,
    commit: async (activatedVersion) => {
      if (finished || state.activationToken !== token) {
        throw new Error(`Workspace app activation is no longer pending: ${componentId}`);
      }
      const actualVersion = normalizeVersion(activatedVersion);
      if (actualVersion !== normalized) {
        throw new Error(
          `Component registry activated ${componentId}@${actualVersion}, expected ${normalized}.`
        );
      }
      if (state.references > 0) {
        throw new Error(`Cannot activate a running workspace component: ${componentId}`);
      }
      const previousSnapshot = {
        active: state.active,
        previous: state.previous,
        pending: state.pending
      };
      if (actualVersion !== state.active) {
        state.previous = state.active;
        state.active = actualVersion;
      }
      delete state.pending;
      try {
        if (previousSnapshot.active !== actualVersion) {
          await deactivateModuleWhenUnused(componentId, previousSnapshot.active);
        }
        delete state.activationToken;
        finished = true;
        return snapshotVersionState(state);
      } catch (error) {
        state.active = previousSnapshot.active;
        if (previousSnapshot.previous === undefined) {
          delete state.previous;
        } else {
          state.previous = previousSnapshot.previous;
        }
        if (previousSnapshot.pending === undefined) {
          delete state.pending;
        } else {
          state.pending = previousSnapshot.pending;
        }
        delete state.activationToken;
        finished = true;
        throw error;
      }
    },
    cancel
  };
};

export const rollbackWorkspaceAppVersion = (
  componentId: WorkspaceProductComponentId
): WorkspaceAppVersionState => {
  const state = requireVersionState(componentId);
  if (state.activationToken !== undefined) {
    throw new Error(`Workspace app activation is in progress: ${componentId}`);
  }
  if (state.references > 0) {
    throw new Error(`Cannot roll back a running component: ${componentId}`);
  }
  if (state.previous !== undefined) {
    if (state.appComponent) {
      requireLoadedModule(componentId, state.previous);
    }
    const current = state.active;
    state.active = state.previous;
    state.previous = current;
    delete state.pending;
  }
  return snapshotVersionState(state);
};

const openWorkspaceAppInstance = async ({
  appId,
  componentId,
  version: requestedVersion,
  instanceId,
  route,
  opaqueState,
  restore,
  nestedOwner
}: {
  readonly appId: string;
  readonly componentId: string;
  readonly version?: string;
  readonly instanceId: string;
  readonly route: string;
  readonly opaqueState?: JsonValue;
  readonly restore: boolean;
  readonly nestedOwner?: NestedAppOwner;
}): Promise<WorkspaceAppInstanceHandle> => {
  const normalizedAppId = normalizeIdentifier(appId, "Workspace app id");
  const normalizedComponentId = normalizeIdentifier(componentId, "Workspace component id");
  const normalizedInstanceId = instanceId.trim();
  const state = requireVersionState(normalizedComponentId);
  const version = requestedVersion === undefined
    ? state.active
    : normalizeVersion(requestedVersion);
  if (!validateWorkspaceTabV2({
    schemaVersion: 2,
    appId: normalizedAppId,
    appVersion: version,
    instanceId: normalizedInstanceId,
    route,
    opaqueState: opaqueState ?? {}
  })) {
    throw new Error(`Workspace app instance request is invalid: ${normalizedComponentId}`);
  }
  const reservedOwner = nestedAppSlots.ownerForChild(normalizedInstanceId);
  if (
    reservedOwner !== undefined
    && (
      nestedOwner === undefined
      || reservedOwner.parentInstanceId !== nestedOwner.parentInstanceId
      || reservedOwner.slotId !== nestedOwner.slotId
    )
  ) {
    throw new Error(`Workspace app instance is reserved by a nested slot: ${normalizedInstanceId}`);
  }
  const existing = instances.get(normalizedInstanceId);
  if (existing !== undefined) {
    if (
      existing.appId !== normalizedAppId
      || existing.componentId !== normalizedComponentId
      || existing.version !== version
    ) {
      throw new Error(`Workspace app instance id is already pinned: ${normalizedInstanceId}`);
    }
    if (existing.closePromise !== undefined) {
      await existing.closePromise;
      return openWorkspaceAppInstance({
        appId: normalizedAppId,
        componentId: normalizedComponentId,
        version,
        instanceId: normalizedInstanceId,
        route,
        ...(opaqueState === undefined ? {} : { opaqueState }),
        restore,
        ...(nestedOwner === undefined ? {} : { nestedOwner })
      });
    }
    existing.consumers += 1;
    await existing.opening;
    return createInstanceHandle(existing);
  }

  const moduleRecord = requireLoadedModule(normalizedComponentId, version);
  const lease = acquireWorkspaceAppVersion(normalizedComponentId, version);
  let instanceRecord!: InstanceRecord;
  const opening = (async () => {
    await ensureModuleActivated(moduleRecord);
    const context = {
      host: moduleRecord.host,
      appId: normalizedAppId,
      instanceId: normalizedInstanceId,
      route
    };
    const opened = restore
      ? await moduleRecord.module.restore({
          ...context,
          opaqueState: opaqueState ?? {}
        })
      : await moduleRecord.module.create(context);
    return assertValidInstanceResult(opened, normalizedInstanceId);
  })();
  instanceRecord = {
    appId: normalizedAppId,
    componentId: normalizedComponentId,
    version,
    instanceId: normalizedInstanceId,
    moduleRecord,
    lease,
    opening,
    surfaceQueue: { current: Promise.resolve() },
    consumers: 1
  };
  instances.set(normalizedInstanceId, instanceRecord);
  notifyInstanceWaiters(instanceRecord);
  try {
    await opening;
    return createInstanceHandle(instanceRecord);
  } catch (error) {
    if (instances.get(normalizedInstanceId) === instanceRecord) {
      instances.delete(normalizedInstanceId);
      lease.release();
    }
    if (referencesForVersion(requireVersionState(normalizedComponentId), version) === 0) {
      await deactivateModuleWhenUnused(normalizedComponentId, version, { allowActive: true });
    }
    throw error;
  }
};

const createInstanceHandle = (record: InstanceRecord): WorkspaceAppInstanceHandle => {
  let released = false;
  let closing: Promise<WorkspaceAppVersionState> | undefined;
  return {
    componentId: record.componentId,
    version: record.version,
    instanceId: record.instanceId,
    snapshot: async () => {
      if (released || closing !== undefined) {
        throw new Error(`Workspace app instance is closing or closed: ${record.instanceId}`);
      }
      const instance = await record.opening;
      return assertJsonSnapshot(
        record.componentId,
        record.version,
        record.instanceId,
        await record.moduleRecord.module.snapshot(instance)
      );
    },
    close: async () => {
      if (released) {
        return readWorkspaceAppVersionState(record.componentId);
      }
      if (closing === undefined) {
        closing = closeInstanceConsumer(record)
          .then((state) => {
            released = true;
            return state;
          })
          .finally(() => {
            closing = undefined;
          });
      }
      return closing;
    }
  };
};

const closeInstanceConsumer = async (
  record: InstanceRecord
): Promise<WorkspaceAppVersionState> => {
  record.consumers = Math.max(0, record.consumers - 1);
  if (record.consumers > 0) {
    return readWorkspaceAppVersionState(record.componentId);
  }
  if (record.closePromise !== undefined) {
    return record.closePromise;
  }
  record.closePromise = (async () => {
    const instance = await record.opening;
    const cleanupFailures: unknown[] = [];
    try {
      await unmountWorkspaceAppInstance(record.instanceId);
    } catch (error) {
      cleanupFailures.push(error);
    }
    try {
      await nestedAppSlots.closeForParent(record);
    } catch (error) {
      cleanupFailures.push(error);
    }
    if (cleanupFailures.length > 0) {
      throw cleanupFailures.length === 1
        ? cleanupFailures[0]
        : new AggregateError(
            cleanupFailures,
            `Failed to clean up workspace application ${record.instanceId}.`
          );
    }
    await record.moduleRecord.module.close(instance);
    if (instances.get(record.instanceId) === record) {
      instances.delete(record.instanceId);
    }
    const nextState = record.lease.release();
    if (referencesForVersion(requireVersionState(record.componentId), record.version) === 0) {
      await deactivateModuleWhenUnused(record.componentId, record.version);
    }
    return nextState;
  })();
  try {
    return await record.closePromise;
  } catch (error) {
    delete record.closePromise;
    record.consumers = 1;
    throw error;
  }
};

export const createWorkspaceAppInstance = (request: {
  readonly appId: string;
  readonly componentId: string;
  readonly version?: string;
  readonly instanceId: string;
  readonly route: string;
  /** Workspace tab that hosts this surface, when Core mounts it inside a tab. */
  readonly hostTabId?: string;
}): Promise<WorkspaceAppInstanceHandle> => openWorkspaceAppInstance({
  ...request,
  restore: false
}).then((handle) => {
  const normalizedInstanceId = request.instanceId.trim();
  const hostTabId = request.hostTabId?.trim();
  // Always rewrite the binding so a reused instance id cannot keep pointing at
  // the previous host tab. The binding outlives close so chrome cleanup can
  // still resolve the tab while the surface unmounts; `resolve-tab` checks the
  // tab still exists before returning it.
  if (hostTabId !== undefined && hostTabId.length > 0) {
    hostTabByInstance.set(normalizedInstanceId, hostTabId);
  } else {
    hostTabByInstance.delete(normalizedInstanceId);
  }
  return handle;
});

export const readWorkspaceAppHostTab = (instanceId: string): string | undefined =>
  hostTabByInstance.get(instanceId.trim());

export const restoreWorkspaceAppInstance = (request: {
  readonly appId: string;
  readonly componentId: string;
  readonly version: string;
  readonly instanceId: string;
  readonly route: string;
  readonly opaqueState: JsonValue;
}): Promise<WorkspaceAppInstanceHandle> => openWorkspaceAppInstance({
  ...request,
  restore: true
});

export const snapshotWorkspaceAppInstance = async (instanceId: string): Promise<JsonValue> => {
  const record = instances.get(instanceId);
  if (record === undefined) {
    throw new Error(`Workspace app instance is not open: ${instanceId}`);
  }
  if (record.closePromise !== undefined) {
    throw new Error(`Workspace app instance is closing: ${instanceId}`);
  }
  const instance = await record.opening;
  return assertJsonSnapshot(
    record.componentId,
    record.version,
    record.instanceId,
    await record.moduleRecord.module.snapshot(instance)
  );
};

const nestedAppSlots = createNestedAppSlotCoordinator<InstanceRecord>({
  resolveApp: (appId) => descriptors.get(appId),
  readComponentState: (componentId) => {
    const state = versions.get(componentId);
    return state === undefined
      ? undefined
      : {
          active: state.active,
          activationInProgress: state.activationToken !== undefined
        };
  },
  isParentAvailable: (parent) =>
    instances.get(parent.instanceId) === parent && parent.closePromise === undefined,
  isInstanceOpen: (instanceId) => instances.has(instanceId),
  isModuleLoaded: (componentId, version) => modules.has(moduleKey(componentId, version)),
  isModuleSurfaceCapable: (componentId, version) => {
    const record = modules.get(moduleKey(componentId, version));
    return record !== undefined
      && typeof record.module.mount === "function"
      && typeof record.module.unmount === "function";
  },
  openInstance: (request) => openWorkspaceAppInstance(request),
  mountInstance: (instanceId, container) => mountWorkspaceAppInstance(instanceId, container),
  unmountInstance: (instanceId) => unmountWorkspaceAppInstance(instanceId)
});

const enqueueSurfaceLifecycle = async <T>(
  record: InstanceRecord,
  operation: () => Promise<T>
): Promise<T> => {
  const previous = record.surfaceQueue.current;
  let releaseQueue!: () => void;
  record.surfaceQueue.current = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    releaseQueue();
  }
};

export const isWorkspaceAppModuleSurfaceCapable = (
  componentId: string,
  version: string
): boolean => {
  const record = modules.get(moduleKey(componentId, version));
  return record !== undefined
    && typeof record.module.mount === "function"
    && typeof record.module.unmount === "function";
};

/**
 * Whether trusted Core policy permits this installed first-party surface to
 * occupy the workspace route. Package manifests cannot opt in.
 */
export const isWorkspaceAppModuleSurfaceReady = (
  componentId: string,
  version: string
): boolean => {
  const descriptor = BUILTIN_PRODUCT_COMPONENTS.find(
    (candidate) => candidate.componentId === componentId
  );
  return descriptor?.surfaceReadiness === "complete"
    && isWorkspaceAppModuleSurfaceCapable(componentId, version);
};

export const mountWorkspaceAppInstance = async (
  instanceId: string,
  container: HTMLElement
): Promise<void> => {
  const record = await waitForInstanceRecord(instanceId);
  await enqueueSurfaceLifecycle(record, async () => {
    if (record.closePromise !== undefined) {
      throw new Error(`Workspace app instance is closing: ${instanceId}`);
    }
    if (record.mountedContainer === container) {
      return;
    }
    const instance = await record.opening;
    const mount = record.moduleRecord.module.mount;
    const unmount = record.moduleRecord.module.unmount;
    if (mount === undefined || unmount === undefined) {
      throw new Error(`Workspace app module has no surface entry: ${record.componentId}@${record.version}`);
    }
    if (record.mountedContainer !== undefined) {
      await unmount(instance);
      delete record.mountedContainer;
    }
    await mount({
      instance,
      container,
      slots: nestedAppSlots.slotsFor(record)
    });
    record.mountedContainer = container;
  });
};

export const unmountWorkspaceAppInstance = async (instanceId: string): Promise<void> => {
  const record = instances.get(instanceId);
  if (record === undefined) {
    return;
  }
  await enqueueSurfaceLifecycle(record, async () => {
    if (record.mountedContainer === undefined) {
      return;
    }
    const instance = await record.opening;
    const unmount = record.moduleRecord.module.unmount;
    if (unmount === undefined) {
      throw new Error(`Workspace app module has no surface cleanup: ${record.componentId}@${record.version}`);
    }
    await unmount(instance);
    delete record.mountedContainer;
  });
};

export const closeWorkspaceAppInstance = async (
  instanceId: string
): Promise<WorkspaceAppVersionState> => {
  const nestedOwner = nestedAppSlots.ownerForChild(instanceId);
  if (nestedOwner !== undefined) {
    throw new Error(
      `Nested application instances must be closed through their parent slot: ${instanceId}`
    );
  }
  const record = instances.get(instanceId);
  if (record === undefined) {
    throw new Error(`Workspace app instance is not open: ${instanceId}`);
  }
  return closeInstanceConsumer(record);
};

export const deactivateWorkspaceAppModule = (
  componentId: string,
  version: string
): Promise<void> => deactivateModuleWhenUnused(componentId, version, { allowActive: true });
