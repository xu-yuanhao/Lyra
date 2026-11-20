import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
  type ReactNode
} from "react";
import { createRoot, type Root } from "react-dom/client";

import type {
  HostContributionsV1,
  HostRegistrationV1,
  JsonValue,
  LyraAppInstanceV1,
  LyraAppModule,
  LyraHostApiV1,
  LyraNestedAppCreateRequestV1,
  LyraNestedAppSlotErrorV1,
  LyraNestedAppSlotsV1,
  WorkbenchChromeContributionV1,
  WorkspaceTabV2
} from "@lyra/app-runtime";

import { LyraAppState } from "./app-state";
export { LyraAppState, type LyraAppStateKind, type LyraAppStateProps } from "./app-state";
export {
  optionalFirstPartyCodeEditorService
} from "@lyra/workbench-ui-runtime";
export type {
  FirstPartyCodeDiffHandleV1,
  FirstPartyCodeDiffMountOptionsV1,
  FirstPartyCodeEditorCompletionItemV1,
  FirstPartyCodeEditorCompletionPositionV1,
  FirstPartyCodeEditorHandleV1,
  FirstPartyCodeEditorMountOptionsV1,
  FirstPartyCodeEditorPresentationV1,
  FirstPartyCodeEditorSelectionV1,
  FirstPartyCodeEditorServiceV1
} from "@lyra/workbench-ui-runtime";

declare global {
  /** Replaced by the private first-party app build from that package's version. */
  const __LYRA_APP_VERSION__: string;
}

export type FirstPartySurfaceProps = {
  readonly host: LyraHostApiV1;
  readonly appId: string;
  readonly instanceId: string;
  readonly route: string;
  readonly opaqueState: JsonValue;
  readonly slots: LyraNestedAppSlotsV1;
  readonly presentation: FirstPartyPresentationV1;
  readonly updateOpaqueState: (value: JsonValue) => void;
};

export type FirstPartyPresentationV1 = {
  readonly locale: string;
  readonly themeId: string;
  readonly themeTone: "light" | "dark";
};

const PRESENTATION_COMMAND = "lyra.core.presentation.read";
const LOCALE_CHANGED_EVENT = "lyra.core.locale-changed";
const THEME_CHANGED_EVENT = "lyra.core.theme-changed";

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const defaultPresentation = (): FirstPartyPresentationV1 => ({
  locale: typeof document !== "undefined" && document.documentElement.lang.trim().length > 0
    ? document.documentElement.lang
    : typeof navigator !== "undefined" && navigator.language.trim().length > 0
      ? navigator.language
      : "en-US",
  themeId: "system",
  themeTone: typeof document !== "undefined"
    && document.documentElement.dataset.lyraThemeTone === "dark"
    ? "dark"
    : "light"
});

const mergePresentation = (
  current: FirstPartyPresentationV1,
  value: JsonValue
): FirstPartyPresentationV1 => {
  if (!isRecord(value)) {
    return current;
  }
  const locale = typeof value.locale === "string" && value.locale.trim().length > 0
    ? value.locale
    : current.locale;
  const themeId = typeof value.themeId === "string" && value.themeId.trim().length > 0
    ? value.themeId
    : current.themeId;
  const themeTone = value.themeTone === "dark" || value.themeTone === "light"
    ? value.themeTone
    : current.themeTone;
  return { locale, themeId, themeTone };
};

const useFirstPartyPresentation = (host: LyraHostApiV1): FirstPartyPresentationV1 => {
  const [presentation, setPresentation] = useState<FirstPartyPresentationV1>(defaultPresentation);
  useEffect(() => {
    let disposed = false;
    const update = (value: JsonValue): void => {
      if (!disposed) {
        setPresentation((current) => mergePresentation(current, value));
      }
    };
    const registrations: HostRegistrationV1[] = [];
    const subscribedEvents = new Set<string>();
    const subscribe = (): void => {
      for (const eventId of [LOCALE_CHANGED_EVENT, THEME_CHANGED_EVENT]) {
        if (subscribedEvents.has(eventId)) {
          continue;
        }
        try {
          registrations.push(host.subscribeEvent(eventId, async (value) => update(value)));
          subscribedEvents.add(eventId);
        } catch {
          // Core may register its events later in the same React effect flush.
          // A single microtask retry below closes that ordering window; older
          // compatibility hosts keep the deterministic DOM-derived fallback.
        }
      }
    };
    const read = (): Promise<void> => host.executeCommand(PRESENTATION_COMMAND, {})
      .then(update)
      .catch(() => undefined);
    subscribe();
    void read();
    queueMicrotask(() => {
      if (!disposed) {
        subscribe();
        void read();
      }
    });
    return () => {
      disposed = true;
      for (const registration of registrations) {
        registration.dispose();
      }
    };
  }, [host]);
  return presentation;
};

const FirstPartySurfaceContext = createContext<FirstPartySurfaceProps | null>(null);

/** Access to the current private first-party surface and its Core-owned child slots. */
export const useFirstPartySurfaceContext = (): FirstPartySurfaceProps => {
  const context = useContext(FirstPartySurfaceContext);
  if (context === null) {
    throw new Error("First-party surface context is unavailable.");
  }
  return context;
};

const CHROME_HOST_COMMANDS = {
  set: "lyra.core.chrome.set",
  clear: "lyra.core.chrome.clear",
  resolveTab: "lyra.core.workspace.resolve-tab"
} as const;

const isHostRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type FirstPartyWorkbenchChromeBuild = {
  readonly toolbarContext?: WorkbenchChromeContributionV1;
  readonly navigation?: WorkbenchChromeContributionV1;
};

/** Registers serializable Workbench chrome through Core; do not use React titlebar context in modules. */
export const useFirstPartyWorkbenchChrome = (
  ownerId: string,
  build: () => FirstPartyWorkbenchChromeBuild | null,
  deps: readonly unknown[]
): void => {
  const { host, instanceId } = useFirstPartySurfaceContext();

  useEffect(() => {
    let disposed = false;
    const apply = async (): Promise<void> => {
      const resolved = await host.executeCommand(CHROME_HOST_COMMANDS.resolveTab, { instanceId });
      if (disposed || !isHostRecord(resolved) || typeof resolved.tabId !== "string") {
        return;
      }
      const tabId = resolved.tabId;
      const scope = { kind: "workspaceTab" as const, tabId };
      const built = build();
      if (built === null) {
        await host.executeCommand(CHROME_HOST_COMMANDS.clear, {
          scope, slot: "toolbarContext", ownerId
        });
        await host.executeCommand(CHROME_HOST_COMMANDS.clear, {
          scope, slot: "navigation", ownerId
        });
        return;
      }
      if (built.navigation !== undefined) {
        await host.executeCommand(CHROME_HOST_COMMANDS.set, {
          scope,
          slot: "navigation",
          ownerId,
          contribution: built.navigation
        });
      } else {
        await host.executeCommand(CHROME_HOST_COMMANDS.clear, {
          scope, slot: "navigation", ownerId
        });
      }
      if (built.toolbarContext !== undefined) {
        await host.executeCommand(CHROME_HOST_COMMANDS.set, {
          scope,
          slot: "toolbarContext",
          ownerId,
          contribution: built.toolbarContext
        });
      } else {
        await host.executeCommand(CHROME_HOST_COMMANDS.clear, {
          scope, slot: "toolbarContext", ownerId
        });
      }
    };
    // Chrome is best effort: the surface may unmount while Core tears the
    // module down, and a disposed host must not surface an unhandled rejection.
    void apply().catch(() => undefined);
    return () => {
      disposed = true;
    };
    // Caller-owned deps, same contract as useEffect. Do not subscribe to
    // chrome-changed: set() emits that event and would recurse forever.
  }, [host, instanceId, ownerId, ...deps]);

  useEffect(() => {
    return () => {
      void (async () => {
        const resolved = await host.executeCommand(CHROME_HOST_COMMANDS.resolveTab, { instanceId });
        if (!isHostRecord(resolved) || typeof resolved.tabId !== "string") {
          return;
        }
        const tabId = resolved.tabId;
        const scope = { kind: "workspaceTab" as const, tabId };
        await host.executeCommand(CHROME_HOST_COMMANDS.clear, {
          scope, slot: "toolbarContext", ownerId
        });
        await host.executeCommand(CHROME_HOST_COMMANDS.clear, {
          scope, slot: "navigation", ownerId
        });
      })().catch(() => undefined);
    };
  }, [host, instanceId, ownerId]);
};

export type FirstPartyNestedAppSlotProps = {
  readonly slotId: string;
  /**
   * A complete descriptor restores a child. A create request lets Core pin the
   * current version and reports the resulting descriptor to the parent.
   */
  readonly child: WorkspaceTabV2 | LyraNestedAppCreateRequestV1;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly onDescriptorChange?: (descriptor: WorkspaceTabV2) => void;
  readonly renderError?: (
    error: LyraNestedAppSlotErrorV1,
    retry: () => void
  ) => ReactNode;
};

const isWorkspaceTabDescriptor = (
  value: WorkspaceTabV2 | LyraNestedAppCreateRequestV1
): value is WorkspaceTabV2 => "schemaVersion" in value;

const nestedSlotIdentity = (
  value: WorkspaceTabV2 | LyraNestedAppCreateRequestV1
): string => JSON.stringify([
  isWorkspaceTabDescriptor(value) ? "restore" : "create",
  value.appId,
  value.appVersion ?? "",
  value.instanceId,
  value.route
]);

/**
 * Mounts one child Lyra application into a parent-owned DOM location. Core owns
 * the child lifecycle and lease; the parent owns persistence via
 * onDescriptorChange.
 */
export const FirstPartyNestedAppSlot = ({
  slotId,
  child,
  className,
  style,
  onDescriptorChange,
  renderError
}: FirstPartyNestedAppSlotProps) => {
  const { slots } = useFirstPartySurfaceContext();
  const childContainerRef = useRef<HTMLDivElement | null>(null);
  const descriptorCallbackRef = useRef(onDescriptorChange);
  descriptorCallbackRef.current = onDescriptorChange;
  const childRef = useRef(child);
  childRef.current = child;
  const [error, setError] = useState<LyraNestedAppSlotErrorV1 | null>(null);
  const [retrySerial, setRetrySerial] = useState(0);
  const identity = useMemo(() => nestedSlotIdentity(child), [child]);

  useEffect(() => {
    let disposed = false;
    setError(null);
    const open = async (): Promise<void> => {
      const request = childRef.current;
      const opened = isWorkspaceTabDescriptor(request)
        ? await slots.restore(slotId, request)
        : await slots.create(slotId, request);
      if (!opened.ok) {
        if (!disposed) {
          setError(opened.error);
        }
        return;
      }
      descriptorCallbackRef.current?.(opened.value);
      const container = childContainerRef.current;
      if (container === null) {
        return;
      }
      const mounted = await slots.mount(slotId, container);
      if (!mounted.ok && !disposed) {
        setError(mounted.error);
      }
    };
    void open().catch((cause: unknown) => {
      if (!disposed) {
        setError({
          code: "lifecycle-failed",
          message: cause instanceof Error ? cause.message : String(cause),
          repairable: true,
          appId: childRef.current.appId,
          ...(childRef.current.appVersion === undefined
            ? {}
            : { appVersion: childRef.current.appVersion }),
          instanceId: childRef.current.instanceId
        });
      }
    });

    return () => {
      disposed = true;
      void slots.close(slotId).then((closed) => {
        if (closed.ok && closed.value !== null) {
          descriptorCallbackRef.current?.(closed.value);
        }
      }).catch(() => {
        // Parent close is the authoritative cleanup path. A slot
        // implementation must return structured failures, but defensive
        // containment here avoids an unhandled rejection during React teardown.
      });
    };
  }, [identity, retrySerial, slotId, slots]);

  const retry = (): void => {
    setRetrySerial((value) => value + 1);
  };

  return (
    <div
      className={className}
      style={{ position: "relative", minWidth: 0, minHeight: 0, ...style }}
      data-lyra-nested-app-slot={slotId}
    >
      <div ref={childContainerRef} style={{ width: "100%", height: "100%" }} />
      {error === null ? null : (
        <div
          data-lyra-nested-app-error={error.code}
          data-lyra-repairable={String(error.repairable)}
          style={{ position: "absolute", inset: 0 }}
        >
          {renderError?.(error, retry) ?? (
            <LyraAppState
              kind="error"
              title={error.message}
              {...(error.repairable
                ? { actionLabel: "Retry", onAction: retry }
                : {})}
            />
          )}
        </div>
      )}
    </div>
  );
};

export type FirstPartySurfaceDefinition = {
  readonly title: string;
  readonly description: string;
  /** A real independently shipped application surface. Metadata-only entries retain the safe fallback. */
  readonly component?: ComponentType<FirstPartySurfaceProps>;
};

export type FirstPartyAppModuleDefinition = {
  readonly componentId: string;
  readonly version: string;
  readonly surfaces: Readonly<Record<string, FirstPartySurfaceDefinition>>;
  readonly contributions?: HostContributionsV1;
  readonly commandHandlers?: Readonly<Record<
    string,
    (host: LyraHostApiV1, input: JsonValue) => JsonValue | Promise<JsonValue>
  >>;
};

type FirstPartyInstance = LyraAppInstanceV1 & {
  readonly appId: string;
  readonly route: string;
  opaqueState: JsonValue;
};

const surfaceStyle = {
  boxSizing: "border-box",
  width: "100%",
  height: "100%",
  padding: "24px",
  color: "var(--lyra-text-primary, #202124)",
  background: "var(--lyra-surface-primary, #ffffff)",
  fontFamily: "var(--lyra-font-sans, system-ui, sans-serif)",
  overflow: "auto"
} as const;

const metadataStyle = {
  marginTop: "18px",
  padding: "12px",
  border: "1px solid var(--lyra-border-subtle, #d9dce1)",
  borderRadius: "8px",
  background: "var(--lyra-surface-secondary, #f7f8fa)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontFamily: "var(--lyra-font-mono, ui-monospace, monospace)",
  fontSize: "12px"
} as const;

const DefaultFirstPartySurface = ({
  definition,
  instance
}: {
  readonly definition: FirstPartyAppModuleDefinition;
  readonly instance: FirstPartyInstance;
}) => {
  const surface = definition.surfaces[instance.appId] ?? {
    title: instance.appId,
    description: "This Lyra application surface is installed and ready."
  };
  return (
    <section style={surfaceStyle} data-lyra-component={definition.componentId}>
      <h1 style={{ margin: 0, fontSize: "20px", fontWeight: 650 }}>{surface.title}</h1>
      <p style={{ margin: "8px 0 0", color: "var(--lyra-text-secondary, #62666d)" }}>
        {surface.description}
      </p>
      <pre style={metadataStyle}>{JSON.stringify({
        componentId: definition.componentId,
        version: definition.version,
        appId: instance.appId,
        route: instance.route,
        state: instance.opaqueState
      }, null, 2)}</pre>
    </section>
  );
};

const FirstPartySurface = ({
  definition,
  instance,
  host,
  slots,
  updateOpaqueState
}: {
  readonly definition: FirstPartyAppModuleDefinition;
  readonly instance: FirstPartyInstance;
  readonly host: LyraHostApiV1;
  readonly slots: LyraNestedAppSlotsV1;
  readonly updateOpaqueState: (value: JsonValue) => void;
}) => {
  const presentation = useFirstPartyPresentation(host);
  const surface = definition.surfaces[instance.appId];
  const SurfaceComponent = surface?.component;
  if (SurfaceComponent === undefined) {
    return createElement(DefaultFirstPartySurface, { definition, instance });
  }
  const props = {
    host,
    appId: instance.appId,
    instanceId: instance.instanceId,
    route: instance.route,
    opaqueState: instance.opaqueState,
    slots,
    presentation,
    updateOpaqueState
  };
  return createElement(
    FirstPartySurfaceContext.Provider,
    { value: props },
    createElement(SurfaceComponent, props)
  );
};

export const createFirstPartyAppModule = (
  definition: FirstPartyAppModuleDefinition
): LyraAppModule => {
  const declaredCommands = new Set(
    (definition.contributions?.commands ?? []).map(({ id }) => id)
  );
  const handledCommands = new Set(Object.keys(definition.commandHandlers ?? {}));
  if (
    declaredCommands.size !== handledCommands.size
    || [...declaredCommands].some((id) => !handledCommands.has(id))
  ) {
    throw new Error(`${definition.componentId} command contributions and handlers must match.`);
  }
  const instances = new Map<string, FirstPartyInstance>();
  const roots = new Map<string, Root>();
  const commandRegistrations: HostRegistrationV1[] = [];
  let host: LyraHostApiV1 | null = null;

  const open = ({
    appId,
    instanceId,
    route,
    opaqueState
  }: {
    readonly appId: string;
    readonly instanceId: string;
    readonly route: string;
    readonly opaqueState: JsonValue;
  }): FirstPartyInstance => {
    const instance = { instanceId, appId, route, opaqueState };
    instances.set(instanceId, instance);
    return instance;
  };

  return {
    id: definition.componentId,
    version: definition.version,
    ...(definition.contributions === undefined ? {} : { contributions: definition.contributions }),
    activate: (nextHost) => {
      host = nextHost;
      try {
        for (const [commandId, handler] of Object.entries(definition.commandHandlers ?? {})) {
          commandRegistrations.push(nextHost.registerCommand(
            commandId,
            (input) => handler(nextHost, input)
          ));
        }
      } catch (error) {
        for (const registration of commandRegistrations.splice(0)) {
          registration.dispose();
        }
        host = null;
        throw error;
      }
    },
    create: ({ appId, instanceId, route }) => open({
      appId,
      instanceId,
      route,
      opaqueState: {}
    }),
    restore: ({ appId, instanceId, route, opaqueState }) => open({
      appId,
      instanceId,
      route,
      opaqueState
    }),
    snapshot: ({ instanceId }) => instances.get(instanceId)?.opaqueState ?? {},
    mount: ({ instance, container, slots }) => {
      const current = instances.get(instance.instanceId);
      if (current === undefined || host === null) {
        throw new Error(`First-party app instance is unavailable: ${instance.instanceId}`);
      }
      roots.get(instance.instanceId)?.unmount();
      const root = createRoot(container);
      roots.set(instance.instanceId, root);
      root.render(createElement(FirstPartySurface, {
        definition,
        instance: current,
        host,
        slots,
        updateOpaqueState: (value: JsonValue) => {
          const active = instances.get(instance.instanceId);
          if (active !== undefined) {
            active.opaqueState = value;
          }
        }
      }));
    },
    unmount: ({ instanceId }) => {
      roots.get(instanceId)?.unmount();
      roots.delete(instanceId);
    },
    close: ({ instanceId }) => {
      roots.get(instanceId)?.unmount();
      roots.delete(instanceId);
      instances.delete(instanceId);
    },
    deactivate: () => {
      if (instances.size > 0) {
        throw new Error(`Cannot deactivate ${definition.componentId} with open instances.`);
      }
      for (const registration of commandRegistrations.splice(0)) {
        registration.dispose();
      }
      host = null;
    }
  };
};
