import {
  AppBadge,
  AppButton,
  AppObjectRow,
  type AppBadgeTone
} from "@renderer/ui/components";
import {
  AppWindow,
  Bell,
  ChevronRight,
  Download,
  FileImage,
  FolderOpen,
  FolderTree,
  GitBranch,
  Globe,
  History,
  KeyRound,
  Layers3,
  Package,
  PackageOpen,
  Palette,
  Settings2,
  SquareTerminal
} from "@lyra/icons";
import type { ReactNode } from "react";

import type {
  InstalledUiuxPack,
  LyraSoftwareManifest
} from "../../../shared/desktop-bridge";
import {
  getItemTitle,
  type SoftwareStoreItem
} from "./catalog-model";
import type {
  SoftwareStoreBuiltinAppId,
  SoftwareStoreLabels
} from "./types";
import {
  SS_FACT_CLASS,
  SS_ITEM_CHEVRON_CLASS,
  SS_ITEM_CLASS,
  SS_ITEM_LIST_CLASS,
  SS_ITEM_SECTION_CLASS,
  SS_PRODUCT_ICON_CLASS,
} from "./classes";

const BuiltinSoftwareIcon = ({
  id,
  size = 17
}: {
  readonly id: SoftwareStoreBuiltinAppId | string;
  readonly size?: number;
}) => {
  if (id === "browser-search") return <Globe size={size} />;
  if (id === "file-manager") return <FolderOpen size={size} />;
  if (id === "downloads") return <Download size={size} />;
  if (id === "terminal") return <SquareTerminal size={size} />;
  if (id === "image-viewer") return <FileImage size={size} />;
  if (id === "notifications") return <Bell size={size} />;
  if (id === "settings") return <Settings2 size={size} />;
  if (id === "agent-history") return <History size={size} />;
  if (id === "agent-project-tree") return <FolderTree size={size} />;
  if (id === "agent-git") return <GitBranch size={size} />;
  if (id === "login-manager") return <KeyRound size={size} />;
  if (id === "software-store") return <AppWindow size={size} />;
  return <Layers3 size={size} />;
};

export const ItemIcon = ({
  item,
  size = 17
}: {
  readonly item: SoftwareStoreItem;
  readonly size?: number;
}) => {
  const icon = item.kind === "software"
    ? <BuiltinSoftwareIcon id={item.software.id} size={size} />
    : item.kind === "component"
      ? <Package size={size} />
      : item.builtin
        ? <Palette size={size} />
        : <PackageOpen size={size} />;
  return (
    <span className={SS_PRODUCT_ICON_CLASS} aria-hidden="true">
      {icon}
    </span>
  );
};

const badgeToneForTrustState = (
  trustState: InstalledUiuxPack["trustState"]
): AppBadgeTone => {
  if (trustState === "trusted") {
    return "success";
  }
  if (trustState === "revoked") {
    return "error";
  }
  return "warning";
};

export const badgeToneForRisk = (
  risk: LyraSoftwareManifest["actions"][number]["risk"]
): AppBadgeTone => (
  risk === "read" ? "neutral" : risk === "navigate" ? "info" : "warning"
);

export const DetailFact = ({
  label,
  children
}: {
  readonly label: string;
  readonly children: ReactNode;
}) => (
  <div className={SS_FACT_CLASS}>
    <dt>{label}</dt>
    <dd>{children}</dd>
  </div>
);

export const StatusBadges = ({
  item,
  labels
}: {
  readonly item: SoftwareStoreItem;
  readonly labels: SoftwareStoreLabels;
}) => {
  if (item.kind === "software") {
    return (
      <>
        <AppBadge>
          {item.software.source === "builtin" ? labels.builtinBadge : labels.uiuxBadge}
        </AppBadge>
        {item.software.actions.length === 0 ? null : (
          <AppBadge tone="success">
            {labels.agentAccessControllable}
          </AppBadge>
        )}
      </>
    );
  }
  if (item.kind === "component") {
    return (
      <>
        <AppBadge>{labels.componentBadge}</AppBadge>
        {item.component.active === undefined ? null : (
          <AppBadge tone="success">{labels.activeBadge}</AppBadge>
        )}
        {item.component.pending === undefined ? null : (
          <AppBadge tone="warning">{labels.pendingBadge}</AppBadge>
        )}
      </>
    );
  }
  return (
    <>
      <AppBadge>{labels.uiuxBadge}</AppBadge>
      {item.active ? (
        <AppBadge tone="success">
          {labels.activeBadge}
        </AppBadge>
      ) : null}
      {item.pending ? (
        <AppBadge tone="warning">
          {labels.pendingBadge}
        </AppBadge>
      ) : null}
      {item.installed === undefined ? null : (
        <AppBadge tone={badgeToneForTrustState(item.installed.trustState)}>
          {item.installed.trustState === "trusted"
            ? labels.trustedBadge
            : item.installed.trustState === "revoked"
              ? labels.revokedBadge
              : labels.untrustedBadge}
        </AppBadge>
      )}
    </>
  );
};

export const SoftwareStoreItemSection = ({
  title,
  items,
  onSelect
}: {
  readonly title: string;
  readonly items: readonly SoftwareStoreItem[];
  readonly onSelect: (key: string) => void;
}) => (
  <section className={SS_ITEM_SECTION_CLASS} aria-label={title}>
    <div className={SS_ITEM_LIST_CLASS}>
      {items.map((item) => (
        <AppObjectRow
          key={item.key}
          className={SS_ITEM_CLASS}
          icon={<ItemIcon item={item} />}
          title={getItemTitle(item)}
          badges={(
            <ChevronRight
              className={SS_ITEM_CHEVRON_CLASS}
              size={14}
              aria-hidden="true"
            />
          )}
          onClick={() => {
            onSelect(item.key);
          }}
        />
      ))}
    </div>
  </section>
);
