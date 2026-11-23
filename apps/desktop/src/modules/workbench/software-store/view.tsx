import {
  AppButton,
  AppEmptyState,
  AppIconButton,
  AppSearchField,
  AppStatusMessage,
  AppSubPageBack
} from "@renderer/ui/components";
import { TITLEBAR_CONTEXT_CHIP_CLASS, TITLEBAR_CONTEXT_CONTROLS_CLASS, TITLEBAR_CONTEXT_ICON_BUTTON_CLASS, TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS } from "../shell/classes";
import {
  FolderOpen,
  RefreshCw
} from "@lyra/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from "react";

import type {
  ComponentUpdateChannel,
  ComponentUpdateProgress,
  ComponentSummary,
  UiuxListPacksResponse
} from "../../../shared/desktop-bridge";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import {
  beginWorkspaceAppVersionActivation,
  executeWorkspaceAppCommand,
  loadInstalledWorkspaceAppModule,
  readWorkspaceAppActiveModule
} from "../workspace-apps";
import type { WorkbenchUiPackId } from "../ui-platform";
import {
  createItemKey,
  createUiuxItems,
  matchesQuery,
  toUserError,
  type BuiltinSoftwareItem,
  type ComponentSoftwareItem,
  type SoftwareStoreItem,
  type UiuxSoftwareItem
} from "./catalog-model";
import {
  SoftwareStoreItemSection
} from "./catalog-item-view";
import {
  ComponentDetail,
  SoftwareDetail,
  UiuxDetail
} from "./detail-view";
import { SoftwareStoreAppUpdatePanel, SoftwareStoreComponentUpdatePanel } from "./update-panel";
import {
  softwareStoreDetailKey,
  subscribeSoftwareStoreDetailRequests
} from "./service";
import type {
  SoftwareStoreSurfaceProps
} from "./types";
import { useAppUpdate } from "./use-app-update";
import {
  SS_BROWSE_HEAD_CLASS,
  SS_CONTENT_CLASS,
  SS_CONTROLS_CLASS,
  SS_DETAIL_CLASS,
  SS_EMPTY_CLASS,
  SS_SEARCH_CLASS,
  SS_SECTION_STACK_CLASS,
  SS_STATUS_CLASS,
  SS_STATUS_STACK_CLASS,
  SS_STORE_CLASS,
  SS_STORE_EMBEDDED_CLASS,
  SS_TITLE_BLOCK_CLASS,
} from "./classes";

const SOFTWARE_STORE_OPERATION_CANCELLED = Symbol("software-store-operation-cancelled");

type SoftwareStoreSectionId = "builtin" | "component" | "uiux";

export const SoftwareStoreSurface = ({
  desktopApi,
  embedded = false,
  labels,
  softwareCapabilities,
  activeUiPackId,
  onUiPackIdChange,
  onOpenBuiltinApp,
  onOpenSettingsRoute,
  onHeadingChange
}: SoftwareStoreSurfaceProps) => {
  const [packs, setPacks] = useState<UiuxListPacksResponse | null>(null);
  const [components, setComponents] = useState<readonly ComponentSummary[]>([]);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SoftwareStoreSectionId>("builtin");
  const [updateChannel, setUpdateChannel] = useState<ComponentUpdateChannel>("preview");
  const [updateProgress, setUpdateProgress] = useState<ComponentUpdateProgress | null>(null);
  const [componentUpdateRunning, setComponentUpdateRunning] = useState(false);
  const appUpdate = useAppUpdate(desktopApi);
  const updateCancellationRequested = useRef(false);
  const [, setModuleRegistryRevision] = useState(0);

  const refreshPacks = useCallback(async (): Promise<void> => {
    if (desktopApi?.uiux === undefined) {
      setPacks(null);
      setError(labels.unavailable);
      return;
    }
    setError(null);
    try {
      const response = await desktopApi.uiux.listPacks();
      setPacks(response);
    } catch (loadError: unknown) {
      console.warn("[lyra-software-store] failed to refresh UIUX packs", loadError);
      setPacks(null);
      setError(toUserError(loadError));
    }
  }, [desktopApi, labels.unavailable]);

  const refreshComponents = useCallback(async (): Promise<void> => {
    if (desktopApi?.components === undefined) {
      setComponents([]);
      return;
    }
    try {
      setComponents(await desktopApi.components.list());
    } catch (loadError: unknown) {
      console.warn("[lyra-software-store] failed to refresh components", loadError);
      setComponents([]);
      setError(toUserError(loadError));
    }
  }, [desktopApi]);

  const refreshAll = useCallback(async (): Promise<void> => {
    await Promise.all([
      refreshPacks(),
      refreshComponents(),
      softwareCapabilities.refresh()
    ]);
  }, [refreshComponents, refreshPacks, softwareCapabilities]);

  useEffect(() => {
    let cancelled = false;
    if (desktopApi?.uiux === undefined) {
      setPacks(null);
      setError(labels.unavailable);
      return undefined;
    }
    void desktopApi.uiux.listPacks()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPacks(response);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (cancelled) {
          return;
        }
        console.warn("[lyra-software-store] failed to list UIUX packs", loadError);
        setPacks(null);
        setError(toUserError(loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [desktopApi, labels.unavailable]);

  useEffect(() => {
    let cancelled = false;
    if (desktopApi?.components === undefined) {
      setComponents([]);
      return undefined;
    }
    void desktopApi.components.list()
      .then((result) => {
        if (!cancelled) {
          setComponents(result);
        }
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          console.warn("[lyra-software-store] failed to list components", loadError);
          setComponents([]);
          setError(toUserError(loadError));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [desktopApi]);

  useEffect(() => {
    if (desktopApi?.components === undefined) {
      return undefined;
    }
    return desktopApi.components.onUpdateProgress((progress) => {
      setUpdateProgress(progress);
    });
  }, [desktopApi]);

  const items = useMemo<readonly SoftwareStoreItem[]>(() => {
    const builtinItems = softwareCapabilities.software.map((software): BuiltinSoftwareItem => ({
      kind: "software",
      key: createItemKey("software", software.id),
      software
    }));
    return [
      ...builtinItems,
      ...components.map((component): ComponentSoftwareItem => ({
        kind: "component",
        key: createItemKey("component", component.componentId),
        component
      })),
      ...createUiuxItems(packs, activeUiPackId, labels)
    ];
  }, [activeUiPackId, components, labels, packs, softwareCapabilities.software]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = useMemo(
    () =>
      items.filter((item) => matchesQuery(item, normalizedQuery)),
    [items, normalizedQuery]
  );

  useEffect(() => {
    if (selectedKey === null || items.some((item) => item.key === selectedKey)) {
      return;
    }
    if (selectedKey.startsWith("uiux:") && packs === null) {
      return;
    }
    setSelectedKey(null);
  }, [items, packs, selectedKey]);

  useEffect(
    () => subscribeSoftwareStoreDetailRequests((request) => {
      setQuery("");
      setSelectedKey(softwareStoreDetailKey(request));
      // Jump straight to the owning section so a detail request (repair flow,
      // store navigation) never lands on a hidden list.
      if (request.kind === "component") {
        setActiveSection("component");
      } else if (request.kind === "uiux") {
        setActiveSection("uiux");
      } else if (request.kind === "software") {
        setActiveSection("builtin");
      }
    }),
    []
  );

  const selectedItem = useMemo(
    () => items.find((item) => item.key === selectedKey) ?? null,
    [items, selectedKey]
  );

  const runOperation = async (
    operationLabel: string,
    operation: () => Promise<string | void | typeof SOFTWARE_STORE_OPERATION_CANCELLED>
  ): Promise<void> => {
    setPendingOperation(operationLabel);
    setMessage(null);
    setError(null);
    try {
      const operationMessage = await operation();
      if (operationMessage === SOFTWARE_STORE_OPERATION_CANCELLED) {
        return;
      }
      await refreshAll();
      setModuleRegistryRevision((revision) => revision + 1);
      setMessage(operationMessage ?? labels.operationSucceeded);
    } catch (operationError: unknown) {
      console.warn("[lyra-software-store] operation failed", operationError);
      setError(`${labels.operationFailed}: ${toUserError(operationError)}`);
    } finally {
      setPendingOperation(null);
    }
  };

  const installLocal = (): void => {
    void runOperation(labels.installLocal, async () => {
      if (desktopApi?.uiux === undefined || desktopApi.files === undefined) {
        throw new Error(labels.unavailable);
      }
      const directories = await desktopApi.files.selectDirectories();
      const sourcePath = directories[0]?.path;
      if (sourcePath === undefined) {
        return;
      }
      await desktopApi.uiux.installFromLocal({ sourcePath });
    });
  };

  const stageComponentUpdates = (): void => {
    if (componentUpdateRunning) {
      return;
    }
    void (async () => {
      setPendingOperation(labels.checkAndStageUpdates);
      setComponentUpdateRunning(true);
      setUpdateProgress(null);
      setMessage(null);
      setError(null);
      updateCancellationRequested.current = false;
      try {
        if (desktopApi?.components === undefined) {
          throw new Error(labels.unavailable);
        }
        const report = await desktopApi.components.stageUpdate({ channel: updateChannel });
        if (updateCancellationRequested.current) {
          setMessage(labels.updateCancelled);
          return;
        }
        await refreshAll();
        setMessage(
          `${labels.updateReady} ${report.releaseVersion} · ${report.stagedComponents.length}`
        );
      } catch (updateError: unknown) {
        if (updateCancellationRequested.current) {
          setMessage(labels.updateCancelled);
        } else {
          console.warn("[lyra-software-store] component update failed", updateError);
          setError(`${labels.operationFailed}: ${toUserError(updateError)}`);
        }
      } finally {
        setPendingOperation(null);
        setComponentUpdateRunning(false);
      }
    })();
  };

  const cancelComponentUpdate = (): void => {
    if (!componentUpdateRunning || desktopApi?.components === undefined) {
      return;
    }
    updateCancellationRequested.current = true;
    void desktopApi.components.cancelUpdate().catch((cancelError: unknown) => {
      setError(`${labels.operationFailed}: ${toUserError(cancelError)}`);
    });
  };

  const installFromInput = (event: FormEvent): void => {
    event.preventDefault();
    const input = query.trim();
    if (input.length === 0) {
      return;
    }
    // Detect git URL
    if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/iu.test(input) || /\.git(?:$|[?#/])/iu.test(input)) {
      try {
        const url = new URL(input.startsWith("github.com/") ? `https://${input}` : input);
        const ref = url.searchParams.get("ref") ?? null;
        const subdir = url.searchParams.get("subdir") ?? url.searchParams.get("path") ?? null;
        void runOperation(labels.installGit, async () => {
          if (desktopApi?.uiux === undefined) {
            throw new Error(labels.unavailable);
          }
          await desktopApi.uiux.installFromGit({
            url: input,
            ...(ref === null ? {} : { ref }),
            ...(subdir === null ? {} : { subdir })
          });
          setQuery("");
        });
        return;
      } catch {
        // not a valid URL, try as git shorthand
      }
      void runOperation(labels.installGit, async () => {
        if (desktopApi?.uiux === undefined) {
          throw new Error(labels.unavailable);
        }
        await desktopApi.uiux.installFromGit({ url: input });
        setQuery("");
      });
      return;
    }
    // Detect npm package: npm:name or @scope/name
    if (input.startsWith("npm:") || /^@[\w.-]+\/[\w.-]+$/u.test(input)) {
      const packageName = input.startsWith("npm:") ? input.slice(4) : input;
      void runOperation(labels.installNpm, async () => {
        if (desktopApi?.uiux === undefined) {
          throw new Error(labels.unavailable);
        }
        await desktopApi.uiux.installFromNpm({ packageName });
        setQuery("");
      });
      return;
    }
    // Treat as local path only if it looks like a path
    if (/^(\/|\.\.?\/|~\/)/u.test(input)) {
      void runOperation(labels.installLocal, async () => {
        if (desktopApi?.uiux === undefined) {
          throw new Error(labels.unavailable);
        }
        await desktopApi.uiux.installFromLocal({ sourcePath: input });
        setQuery("");
      });
    }
  };

  const setTrustState = (
    item: UiuxSoftwareItem,
    trustState: "trusted" | "revoked"
  ): void => {
    if (trustState === "trusted" && !globalThis.confirm(labels.trustConfirmation)) {
      return;
    }
    void runOperation(trustState === "trusted" ? labels.trust : labels.revokeTrust, async () => {
      if (desktopApi?.uiux === undefined) {
        throw new Error(labels.unavailable);
      }
      await desktopApi.uiux.setTrustState({
        packId: item.id,
        trustState,
        ...(trustState === "trusted" ? { acknowledgeTrustedDesktopCode: true } : {})
      });
    });
  };

  const activateUiuxPack = (item: UiuxSoftwareItem): void => {
    void runOperation(labels.activate, async () => {
      if (desktopApi?.uiux === undefined) {
        throw new Error(labels.unavailable);
      }
      const response = await desktopApi.uiux.requestActivation({ packId: item.id });
      onUiPackIdChange(response.packId as WorkbenchUiPackId);
      if (response.reloadRequired) {
        return labels.reloadRequired;
      }
    });
  };

  const activateComponent = (item: ComponentSoftwareItem): void => {
    const isCore = item.component.kind === "core";
    void runOperation(isCore ? labels.restartAndApply : labels.activate, async () => {
      if (desktopApi?.components === undefined) {
        throw new Error(labels.unavailable);
      }
      const assessment = await desktopApi.components.assessActivation(item.component.componentId);
      if (assessment.requiresConfirmation) {
        const permissions = assessment.addedPermissions.length === 0
          ? ""
          : `\n\nNew permissions:\n${assessment.addedPermissions.join("\n")}`;
        const accepted = globalThis.confirm(
          `This component update requires confirmation.\n\n${assessment.reasons.join("\n")}${permissions}`
        );
        if (!accepted) {
          return SOFTWARE_STORE_OPERATION_CANCELLED;
        }
      }
      const activationRequest = {
        componentId: item.component.componentId,
        confirmedReasons: assessment.reasons
      };
      if (isCore) {
        if (!globalThis.confirm(labels.coreRestartConfirm)) {
          return SOFTWARE_STORE_OPERATION_CANCELLED;
        }
        await desktopApi.components.applyCore(activationRequest);
        return labels.coreUpdateStarting;
      }
      if (item.component.kind !== "app") {
        await desktopApi.components.activate(activationRequest);
        return;
      }
      const targetVersion = item.component.pending;
      if (targetVersion === undefined) {
        throw new Error(`No pending app version is available for ${item.component.componentId}.`);
      }
      await loadInstalledWorkspaceAppModule({
        components: desktopApi.components,
        componentId: item.component.componentId,
        version: targetVersion
      });
      const rendererActivation = beginWorkspaceAppVersionActivation(
        item.component.componentId,
        targetVersion,
        {
          ...(item.component.active === undefined
            ? {}
            : { expectedActiveVersion: item.component.active })
        }
      );
      let diskActivated = false;
      try {
        const activated = await desktopApi.components.activate(activationRequest);
        diskActivated = true;
        if (activated.componentId !== item.component.componentId) {
          throw new Error(`Component activation returned the wrong component: ${activated.componentId}`);
        }
        if (activated.active === undefined) {
          throw new Error(`Component activation did not return an active version: ${activated.componentId}`);
        }
        await rendererActivation.commit(activated.active);
      } catch (activationError) {
        rendererActivation.cancel();
        if (diskActivated) {
          try {
            await desktopApi.components.rollback(item.component.componentId);
          } catch (rollbackError) {
            console.error(
              "[lyra-software-store] failed to compensate app activation",
              rollbackError
            );
            throw new Error(
              `${toUserError(activationError)} Automatic disk rollback also failed: ${toUserError(rollbackError)}`
            );
          }
        }
        throw activationError;
      }
    });
  };

  const rollbackComponent = (item: ComponentSoftwareItem): void => {
    void runOperation(labels.rollback, async () => {
      if (desktopApi?.components === undefined) {
        throw new Error(labels.unavailable);
      }
      if (item.component.kind !== "app") {
        await desktopApi.components.rollback(item.component.componentId);
        return;
      }
      const targetVersion = item.component.previous;
      if (targetVersion === undefined) {
        throw new Error(`No previous app version is available for ${item.component.componentId}.`);
      }
      await loadInstalledWorkspaceAppModule({
        components: desktopApi.components,
        componentId: item.component.componentId,
        version: targetVersion
      });
      const rendererActivation = beginWorkspaceAppVersionActivation(
        item.component.componentId,
        targetVersion,
        {
          ...(item.component.active === undefined
            ? {}
            : { expectedActiveVersion: item.component.active })
        }
      );
      let diskRolledBack = false;
      try {
        const rolledBack = await desktopApi.components.rollback(item.component.componentId);
        diskRolledBack = true;
        if (rolledBack.componentId !== item.component.componentId) {
          throw new Error(`Component rollback returned the wrong component: ${rolledBack.componentId}`);
        }
        if (rolledBack.active === undefined) {
          throw new Error(`Component rollback did not return an active version: ${rolledBack.componentId}`);
        }
        await rendererActivation.commit(rolledBack.active);
      } catch (rollbackError) {
        rendererActivation.cancel();
        if (diskRolledBack) {
          try {
            await desktopApi.components.rollback(item.component.componentId);
          } catch (restoreError) {
            console.error(
              "[lyra-software-store] failed to compensate app rollback",
              restoreError
            );
            throw new Error(
              `${toUserError(rollbackError)} Automatic disk restore also failed: ${toUserError(restoreError)}`
            );
          }
        }
        throw rollbackError;
      }
    });
  };

  const repairComponent = (item: ComponentSoftwareItem): void => {
    void runOperation(labels.repairModule, async () => {
      if (desktopApi?.components === undefined) {
        throw new Error(labels.unavailable);
      }
      const activeVersion = item.component.active;
      if (item.component.kind !== "app" || activeVersion === undefined) {
        throw new Error(labels.moduleMissing);
      }
      await loadInstalledWorkspaceAppModule({
        components: desktopApi.components,
        componentId: item.component.componentId,
        version: activeVersion
      });
      const loaded = readWorkspaceAppActiveModule(item.component.componentId);
      if (
        loaded?.version !== activeVersion
        || loaded.moduleState !== "loaded"
        || !loaded.surfaceCapable
      ) {
        throw new Error(labels.moduleVersionMismatch);
      }
      return labels.repairCompleted;
    });
  };

  const runModuleCommand = (commandId: string): void => {
    void runOperation(labels.runCommand, async () => {
      await executeWorkspaceAppCommand(commandId, {});
      return labels.commandCompleted;
    });
  };

  const openModuleSettings = (route: string): void => {
    setMessage(null);
    setError(null);
    try {
      onOpenSettingsRoute(route);
    } catch (routeError: unknown) {
      setError(`${labels.operationFailed}: ${toUserError(routeError)}`);
    }
  };

  const canInstall = desktopApi?.uiux !== undefined;
  const isBusy = pendingOperation !== null;
  const builtinItems = useMemo(
    () => filteredItems.filter((item) => item.kind === "software"),
    [filteredItems]
  );
  const uiuxItems = useMemo(
    () => filteredItems.filter((item) => item.kind === "uiux"),
    [filteredItems]
  );
  const componentItems = useMemo(
    () => filteredItems.filter((item) => item.kind === "component"),
    [filteredItems]
  );

  // The address-bar switcher owns the visible section; land on the first
  // section that actually has content so a component-only install never opens
  // to an empty builtin list.
  useEffect(() => {
    setActiveSection((current) => {
      if (current === "component") return current;
      if (current === "uiux" && uiuxItems.length > 0) return current;
      if (current === "builtin" && builtinItems.length > 0) return current;
      if (componentItems.length > 0) return "component";
      if (uiuxItems.length > 0) return "uiux";
      return current;
    });
  }, [builtinItems.length, componentItems.length, uiuxItems.length]);

  const SECTION_DEFS = useMemo<readonly { id: SoftwareStoreSectionId; label: string }[]>(
    () => [
      { id: "builtin", label: labels.builtinTab },
      { id: "component", label: labels.componentsTab },
      { id: "uiux", label: labels.uiuxTab }
    ],
    [labels.builtinTab, labels.componentsTab, labels.uiuxTab]
  );

  const titlebarContribution = useMemo(
    () => ({
      ariaLabel: labels.title,
      content: (
        <>
          <span className={TITLEBAR_CONTEXT_CONTROLS_CLASS}>
            {SECTION_DEFS.map((def) => {
              const visible = def.id === "builtin" ? builtinItems.length > 0
                : def.id === "uiux" ? uiuxItems.length > 0
                  : true;
              return visible ? (
                <AppButton
                  key={def.id}
                  variant="ghost"
                  size="sm"
                  className={activeSection === def.id
                    ? `${TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS} lyra-titlebar-context-button-active`
                    : TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS}
                  aria-pressed={activeSection === def.id}
                  onClick={() => {
                    setActiveSection(def.id);
                  }}
                >
                  {def.label}
                </AppButton>
              ) : null;
            })}
          </span>
          <span className={TITLEBAR_CONTEXT_CHIP_CLASS}>
            {String(items.length)}
          </span>
          <AppIconButton
            className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
            aria-label={labels.refresh}
            title={labels.refresh}
            onClick={() => {
              void refreshAll();
            }}
          >
            <RefreshCw size={14} aria-hidden="true" />
          </AppIconButton>
        </>
      )
    }),
    [activeSection, builtinItems.length, items.length, labels, refreshAll, SECTION_DEFS, uiuxItems.length]
  );
  useWorkbenchTitlebarContribution(titlebarContribution);

  useEffect(() => {
    if (onHeadingChange === undefined) {
      return;
    }
    if (selectedItem === null) {
      onHeadingChange(null);
    } else if (selectedItem.kind === "component") {
      onHeadingChange(labels.componentsTab);
    } else if (selectedItem.kind === "uiux") {
      onHeadingChange(labels.uiuxTab);
    } else {
      onHeadingChange(labels.title);
    }
  }, [labels.componentsTab, labels.title, labels.uiuxTab, onHeadingChange, selectedItem]);

  return (
    <section
      className={embedded ? `${SS_STORE_CLASS} ${SS_STORE_EMBEDDED_CLASS}` : SS_STORE_CLASS}
      aria-label={labels.title}
    >
      <div className={SS_CONTENT_CLASS}>
        {selectedItem === null ? (
          <>
            {embedded ? null : (
              <header className={SS_BROWSE_HEAD_CLASS}>
                <div className={SS_TITLE_BLOCK_CLASS}>
                  <h1>{labels.title}</h1>
                </div>
                <AppButton
                  variant="outline"
                  size="sm"
                  disabled={!canInstall || isBusy}
                  onClick={installLocal}
                >
                  <FolderOpen size={14} aria-hidden="true" />
                  <span>{labels.chooseLocal}</span>
                </AppButton>
              </header>
            )}

            <form className={SS_CONTROLS_CLASS} onSubmit={installFromInput}>
              <AppSearchField
                className={SS_SEARCH_CLASS}
                ariaLabel={labels.searchPlaceholder}
                placeholder={labels.searchPlaceholder}
                value={query}
                onValueChange={setQuery}
              />
            </form>

            <SoftwareStoreComponentUpdatePanel
              labels={labels}
              available={desktopApi?.components !== undefined}
              busy={componentUpdateRunning}
              channel={updateChannel}
              progress={updateProgress}
              onChannelChange={setUpdateChannel}
              onStage={stageComponentUpdates}
              onCancel={cancelComponentUpdate}
            />
            <SoftwareStoreAppUpdatePanel
              labels={labels}
              available={desktopApi?.appUpdate !== undefined && appUpdate.status?.state !== "unsupported"}
              busy={appUpdate.busy || appUpdate.status?.state === "checking" || appUpdate.status?.state === "downloading"}
              status={appUpdate.status}
              onCheck={appUpdate.check}
              onDownload={appUpdate.download}
              onInstall={appUpdate.install}
            />

            {filteredItems.length === 0 ? (
              <AppEmptyState className={SS_EMPTY_CLASS} title={labels.emptyTitle} />
            ) : (
              <div className={SS_SECTION_STACK_CLASS}>
                {(activeSection === "builtin" && builtinItems.length > 0) ? (
                  <SoftwareStoreItemSection
                    title={labels.builtinTab}
                    items={builtinItems}
                    onSelect={setSelectedKey}
                  />
                ) : null}
                {activeSection === "component" ? (
                  <SoftwareStoreItemSection
                    title={labels.componentsTab}
                    items={componentItems}
                    onSelect={setSelectedKey}
                  />
                ) : null}
                {activeSection === "uiux" && uiuxItems.length > 0 ? (
                  <SoftwareStoreItemSection
                    title={labels.uiuxTab}
                    items={uiuxItems}
                    onSelect={setSelectedKey}
                  />
                ) : null}
              </div>
            )}
          </>
        ) : (
          <section className={SS_DETAIL_CLASS} aria-label={labels.detailsTitle}>
            <AppSubPageBack
              className="lyra-software-store-back"
              label={labels.title}
              onClick={() => {
                setSelectedKey(null);
              }}
            />

            {selectedItem.kind === "software" ? (
              <SoftwareDetail
                item={selectedItem}
                labels={labels}
                onOpenBuiltinApp={onOpenBuiltinApp}
              />
            ) : selectedItem.kind === "component" ? (
              <ComponentDetail
                item={selectedItem}
                labels={labels}
                busy={isBusy}
                onActivate={() => {
                  activateComponent(selectedItem);
                }}
                onRollback={() => {
                  rollbackComponent(selectedItem);
                }}
                onRepair={() => {
                  repairComponent(selectedItem);
                }}
                onExecuteCommand={runModuleCommand}
                onOpenSettings={openModuleSettings}
              />
            ) : (
              <UiuxDetail
                item={selectedItem}
                labels={labels}
                busy={isBusy}
                onTrust={() => {
                  setTrustState(selectedItem, "trusted");
                }}
                onRevoke={() => {
                  setTrustState(selectedItem, "revoked");
                }}
                onActivate={() => {
                  activateUiuxPack(selectedItem);
                }}
              />
            )}
          </section>
        )}

        <div className={SS_STATUS_STACK_CLASS}>
          {pendingOperation === null ? null : (
            <AppStatusMessage className={SS_STATUS_CLASS}>
              {labels.activating}
            </AppStatusMessage>
          )}
          {message === null ? null : (
            <AppStatusMessage className={SS_STATUS_CLASS} tone="success">
              {message}
            </AppStatusMessage>
          )}
          {error === null ? null : (
            <AppStatusMessage className={SS_STATUS_CLASS} tone="error">
              {error}
            </AppStatusMessage>
          )}
        </div>
      </div>
    </section>
  );
};
