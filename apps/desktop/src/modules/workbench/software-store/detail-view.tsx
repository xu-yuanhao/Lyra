import { AppBadge, AppButton } from "@renderer/ui/components";
import {
  CheckCircle2,
  History,
  PackageOpen,
  Play,
  RefreshCw,
  Settings2,
  ShieldCheck,
  ShieldOff
} from "@lyra/icons";
import type { ReactNode } from "react";

import {
  readWorkspaceAppActiveModule,
  type WorkspaceAppActiveModuleSnapshot
} from "../workspace-apps";
import {
  findBuiltinApp,
  formatDate,
  getAgentAccessLabel,
  getSoftwareAgentAccess,
  type BuiltinSoftwareItem,
  type ComponentSoftwareItem,
  type UiuxSoftwareItem
} from "./catalog-model";
import {
  badgeToneForRisk,
  DetailFact,
  ItemIcon
} from "./catalog-item-view";
import type {
  SoftwareStoreLabels,
  SoftwareStoreSurfaceProps
} from "./types";
import {
  SS_ACTION_LIST_CLASS,
  SS_CHIP_LIST_CLASS,
  SS_CONTRIBUTION_ACTIONS_CLASS,
  SS_CONTRIBUTION_COPY_CLASS,
  SS_CONTRIBUTION_META_CLASS,
  SS_CONTRIBUTIONS_CLASS,
  SS_DETAIL_ACTIONS_CLASS,
  SS_DETAIL_COPY_CLASS,
  SS_DETAIL_HEAD_CLASS,
  SS_DETAIL_ICON_CLASS,
  SS_DETAIL_PANEL_CLASS,
  SS_FACTS_CLASS,
  SS_PERMISSIONS_CLASS,
} from "./classes";

export const SoftwareDetail = ({
  item,
  labels,
  onOpenBuiltinApp
}: {
  readonly item: BuiltinSoftwareItem;
  readonly labels: SoftwareStoreLabels;
  readonly onOpenBuiltinApp: SoftwareStoreSurfaceProps["onOpenBuiltinApp"];
}) => {
  const software = item.software;
  const builtinApp = findBuiltinApp(labels, software);
  const openable = software.source === "builtin" && builtinApp?.openable === true;
  return (
    <article className={SS_DETAIL_PANEL_CLASS}>
      <header className={SS_DETAIL_HEAD_CLASS}>
        <span className={SS_DETAIL_ICON_CLASS} aria-hidden="true">
          <ItemIcon item={item} size={20} />
        </span>
        <div className={SS_DETAIL_COPY_CLASS}>
          <h2>{software.title}</h2>
        </div>
        <span className={SS_DETAIL_ACTIONS_CLASS}>
          <AppButton
            variant="outline"
            size="sm"
            disabled={!openable}
            title={builtinApp?.openDisabledReason ?? labels.openBuiltin}
            onClick={() => {
              if (openable && builtinApp !== undefined) {
                onOpenBuiltinApp(builtinApp.id);
              }
            }}
          >
            <Play size={14} aria-hidden="true" />
            <span>{openable ? labels.openBuiltin : labels.openUnavailable}</span>
          </AppButton>
        </span>
      </header>
      <dl className={SS_FACTS_CLASS}>
        <DetailFact label={labels.typeLabel}>
          {software.source === "builtin" ? labels.builtinType : labels.uiuxType}
        </DetailFact>
        <DetailFact label={labels.categoryLabel}>{software.category ?? "-"}</DetailFact>
        <DetailFact label={labels.versionLabel}>{software.version ?? "-"}</DetailFact>
        <DetailFact label={labels.agentAccessLabel}>
          {getAgentAccessLabel(getSoftwareAgentAccess(software), labels)}
        </DetailFact>
      </dl>
      <section className={SS_PERMISSIONS_CLASS}>
        <strong>{labels.actionsLabel}</strong>
        {software.actions.length === 0 ? (
          <span>{labels.noActions}</span>
        ) : (
          <ul className={SS_ACTION_LIST_CLASS}>
            {software.actions.map((action) => (
              <li key={action.id}>
                <span>{action.title}</span>
                <AppBadge tone={badgeToneForRisk(action.risk)}>
                  {labels.riskLabel}: {action.risk}
                </AppBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
};

const ModuleContributionGroup = ({
  title,
  emptyLabel,
  hasItems,
  children
}: {
  readonly title: string;
  readonly emptyLabel: string;
  readonly hasItems: boolean;
  readonly children: ReactNode;
}) => (
  <section className={SS_PERMISSIONS_CLASS}>
    <strong>{title}</strong>
    {hasItems ? (
      <ul className={SS_ACTION_LIST_CLASS}>
        {children}
      </ul>
    ) : (
      <span>{emptyLabel}</span>
    )}
  </section>
);

const ModuleContributionMetadata = ({
  id,
  version,
  capability,
  labels
}: {
  readonly id: string;
  readonly version: string;
  readonly capability?: string;
  readonly labels: SoftwareStoreLabels;
}) => (
  <span className={SS_CONTRIBUTION_META_CLASS}>
    <AppBadge title={id}>{id}</AppBadge>
    <AppBadge tone="success">{version}</AppBadge>
    {capability === undefined ? null : (
      <AppBadge tone="info">
        {labels.requiredCapabilityLabel}: {capability}
      </AppBadge>
    )}
  </span>
);

const ActiveModuleContributions = ({
  snapshot,
  labels,
  busy,
  onExecuteCommand,
  onOpenSettings
}: {
  readonly snapshot: WorkspaceAppActiveModuleSnapshot;
  readonly labels: SoftwareStoreLabels;
  readonly busy: boolean;
  readonly onExecuteCommand: (commandId: string) => void;
  readonly onOpenSettings: (route: string) => void;
}) => (
  <section
    className={SS_CONTRIBUTIONS_CLASS}
    aria-label={labels.contributionsLabel}
  >
    <ModuleContributionGroup
      title={labels.contributionCommandsLabel}
      emptyLabel={labels.noContributions}
      hasItems={snapshot.commands.length > 0}
    >
      {snapshot.commands.map((command) => (
        <li key={command.id}>
          <span className={SS_CONTRIBUTION_COPY_CLASS}>
            <span>{command.title}</span>
            <code>{command.id}</code>
          </span>
          <span className={SS_CONTRIBUTION_ACTIONS_CLASS}>
            {command.requiredCapability === undefined ? null : (
              <AppBadge tone="info">
                {labels.requiredCapabilityLabel}: {command.requiredCapability}
              </AppBadge>
            )}
            <AppButton
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                onExecuteCommand(command.id);
              }}
            >
              <Play size={13} aria-hidden="true" />
              <span>{labels.runCommand}</span>
            </AppButton>
          </span>
        </li>
      ))}
    </ModuleContributionGroup>
    <ModuleContributionGroup
      title={labels.contributionSettingsLabel}
      emptyLabel={labels.noContributions}
      hasItems={snapshot.settings.length > 0}
    >
      {snapshot.settings.map((setting) => (
        <li key={setting.id}>
          <span className={SS_CONTRIBUTION_COPY_CLASS}>
            <span>{setting.title}</span>
            <code>{setting.id} · {setting.route}</code>
          </span>
          <AppButton
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => {
              onOpenSettings(setting.route);
            }}
          >
            <Settings2 size={13} aria-hidden="true" />
            <span>{labels.openContributionSettings}</span>
          </AppButton>
        </li>
      ))}
    </ModuleContributionGroup>
    <ModuleContributionGroup
      title={labels.contributionStatusLabel}
      emptyLabel={labels.noContributions}
      hasItems={snapshot.status.length > 0}
    >
      {snapshot.status.map((status) => (
        <li key={status.id}>
          <span>{status.title}</span>
          <ModuleContributionMetadata
            id={status.id}
            version={snapshot.version}
            labels={labels}
          />
        </li>
      ))}
    </ModuleContributionGroup>
    <ModuleContributionGroup
      title={labels.contributionCapabilitiesLabel}
      emptyLabel={labels.noContributions}
      hasItems={snapshot.capabilities.length > 0}
    >
      {snapshot.capabilities.map((capability) => (
        <li key={capability.id}>
          <span>{capability.title}</span>
          <ModuleContributionMetadata
            id={capability.id}
            version={capability.version}
            labels={labels}
          />
        </li>
      ))}
    </ModuleContributionGroup>
    <ModuleContributionGroup
      title={labels.contributionEventsLabel}
      emptyLabel={labels.noContributions}
      hasItems={snapshot.events.length > 0}
    >
      {snapshot.events.map((event) => (
        <li key={event.id}>
          <span>{event.title}</span>
          <ModuleContributionMetadata
            id={event.id}
            version={snapshot.version}
            {...(event.requiredCapability === undefined
              ? {}
              : { capability: event.requiredCapability })}
            labels={labels}
          />
        </li>
      ))}
    </ModuleContributionGroup>
  </section>
);

export const ComponentDetail = ({
  item,
  labels,
  busy,
  onActivate,
  onRollback,
  onRepair,
  onExecuteCommand,
  onOpenSettings
}: {
  readonly item: ComponentSoftwareItem;
  readonly labels: SoftwareStoreLabels;
  readonly busy: boolean;
  readonly onActivate: () => void;
  readonly onRollback: () => void;
  readonly onRepair: () => void;
  readonly onExecuteCommand: (commandId: string) => void;
  readonly onOpenSettings: (route: string) => void;
}) => {
  const component = item.component;
  const rendererSnapshot = component.kind === "app"
    ? readWorkspaceAppActiveModule(component.componentId)
    : undefined;
  const activeSnapshot = rendererSnapshot?.version === component.active
    ? rendererSnapshot
    : undefined;
  const independentlyLoaded = activeSnapshot?.moduleState === "loaded"
    && activeSnapshot.surfaceCapable;
  const rendererStatus = rendererSnapshot !== undefined
    && rendererSnapshot.version !== component.active
      ? labels.moduleVersionMismatch
      : activeSnapshot?.moduleState === "compatibility-fallback"
        ? labels.moduleFallback
        : independentlyLoaded
          ? labels.moduleLoaded
          : labels.moduleMissing;
  const canRepair = component.kind === "app"
    && component.active !== undefined
    && !independentlyLoaded;
  return (
    <article className={SS_DETAIL_PANEL_CLASS}>
      <header className={SS_DETAIL_HEAD_CLASS}>
        <span className={SS_DETAIL_ICON_CLASS} aria-hidden="true">
          <ItemIcon item={item} size={20} />
        </span>
        <div className={SS_DETAIL_COPY_CLASS}>
          <h2>{component.componentId}</h2>
        </div>
        <span className={SS_DETAIL_ACTIONS_CLASS}>
          {component.kind !== "app" ? null : (
            <AppButton
              variant="outline"
              size="sm"
              disabled={busy || !canRepair}
              onClick={onRepair}
            >
              <PackageOpen size={14} aria-hidden="true" />
              <span>{labels.repairModule}</span>
            </AppButton>
          )}
          {component.kind === "core" ? null : (
            <AppButton
              variant="outline"
              size="sm"
              disabled={busy || component.previous === undefined}
              onClick={onRollback}
            >
              <History size={14} aria-hidden="true" />
              <span>{labels.rollback}</span>
            </AppButton>
          )}
          <AppButton
            variant="outline"
            size="sm"
            disabled={busy || component.pending === undefined}
            onClick={onActivate}
          >
            {component.kind === "core" ? (
              <RefreshCw size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            <span>{component.kind === "core" ? labels.restartAndApply : labels.activate}</span>
          </AppButton>
        </span>
      </header>
      <dl className={SS_FACTS_CLASS}>
        <DetailFact label={labels.typeLabel}>{labels.componentType}</DetailFact>
        <DetailFact label={labels.categoryLabel}>{component.kind}</DetailFact>
        <DetailFact label={labels.versionLabel}>{component.active ?? "-"}</DetailFact>
        <DetailFact label={labels.statusLabel}>
          {component.pending === undefined
            ? labels.activeBadge
            : `${labels.pendingBadge}: ${component.pending}`}
        </DetailFact>
        {component.kind !== "app" ? null : (
          <DetailFact label={labels.contributionsLabel}>{rendererStatus}</DetailFact>
        )}
      </dl>
      <section className={SS_PERMISSIONS_CLASS}>
        <strong>{labels.versionLabel}</strong>
        <ul className={SS_ACTION_LIST_CLASS}>
          {component.versions.map((version) => (
            <li key={`${version.version}:${version.target}`}>
              <span>{version.version} · {version.target}</span>
              <span>{formatDate(version.installedAt)}</span>
            </li>
          ))}
        </ul>
      </section>
      {component.kind !== "app" || activeSnapshot === undefined ? null : (
        <ActiveModuleContributions
          snapshot={activeSnapshot}
          labels={labels}
          busy={busy}
          onExecuteCommand={onExecuteCommand}
          onOpenSettings={onOpenSettings}
        />
      )}
    </article>
  );
};

export const UiuxDetail = ({
  item,
  labels,
  busy,
  onTrust,
  onRevoke,
  onActivate
}: {
  readonly item: UiuxSoftwareItem;
  readonly labels: SoftwareStoreLabels;
  readonly busy: boolean;
  readonly onTrust: () => void;
  readonly onRevoke: () => void;
  readonly onActivate: () => void;
}) => {
  const installed = item.installed;
  const canActivate = installed === undefined || installed.trustState === "trusted";
  return (
    <article className={SS_DETAIL_PANEL_CLASS}>
      <header className={SS_DETAIL_HEAD_CLASS}>
        <span className={SS_DETAIL_ICON_CLASS} aria-hidden="true">
          <ItemIcon item={item} size={20} />
        </span>
        <div className={SS_DETAIL_COPY_CLASS}>
          <h2>{item.name}</h2>
        </div>
        <span className={SS_DETAIL_ACTIONS_CLASS}>
          {installed === undefined ? null : installed.trustState === "trusted" ? (
            <AppButton variant="outline" size="sm" disabled={busy} onClick={onRevoke}>
              <ShieldOff size={14} aria-hidden="true" />
              <span>{labels.revokeTrust}</span>
            </AppButton>
          ) : (
            <AppButton variant="outline" size="sm" disabled={busy} onClick={onTrust}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{labels.trust}</span>
            </AppButton>
          )}
          <AppButton
            variant="outline"
            size="sm"
            disabled={busy || item.active || item.pending || !canActivate}
            onClick={onActivate}
          >
            {item.active
              ? <CheckCircle2 size={14} aria-hidden="true" />
              : <Play size={14} aria-hidden="true" />}
            <span>{labels.activate}</span>
          </AppButton>
        </span>
      </header>
      <dl className={SS_FACTS_CLASS}>
        <DetailFact label={labels.typeLabel}>{labels.uiuxType}</DetailFact>
        <DetailFact label={labels.versionLabel}>{item.version}</DetailFact>
        <DetailFact label={labels.sourceLabel}>{item.sourceLabel}</DetailFact>
        <DetailFact label={labels.statusLabel}>
          {item.pending
            ? labels.pendingBadge
            : item.active
              ? labels.activeBadge
              : installed?.trustState ?? labels.builtinBadge}
        </DetailFact>
        {installed === undefined ? null : (
          <>
            <DetailFact label={labels.installedAtLabel}>
              {formatDate(installed.installedAt)}
            </DetailFact>
            <DetailFact label={labels.updatedAtLabel}>
              {formatDate(installed.updatedAt)}
            </DetailFact>
          </>
        )}
      </dl>
      <section className={SS_PERMISSIONS_CLASS}>
        <strong>{labels.permissionsLabel}</strong>
        {item.permissions.length === 0 ? (
          <span>{labels.noPermissions}</span>
        ) : (
          <ul className={SS_CHIP_LIST_CLASS}>
            {item.permissions.map((permission) => (
              <li key={permission}>
                <AppBadge>{permission}</AppBadge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
};
