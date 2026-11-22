import { Bell } from "@lyra/icons";
import type { ReactNode } from "react";

import { Button } from "@renderer/ui/components/button";
import { renderNotificationSourceIcon } from "./icon-registry";
import type { NotificationTopbarLabels, WorkbenchNotificationItem } from "./types";

const MAX_TOPBAR_QUICK_ACTIONS = 4;

const TOPBAR_CLASS =
  "inline-flex min-w-0 items-center gap-[var(--lyra-space-6)] [-webkit-app-region:no-drag] max-[980px]:hidden";
const ICON_BUTTON_CLASS =
  "size-[var(--lyra-control-h-28)] flex-none rounded-md p-0";
const PREVIEW_CLASS =
  "h-[var(--lyra-control-h-28)] w-[min(var(--lyra-size-notification-preview-max-w),34vw)] min-w-[var(--lyra-size-notification-preview-min-w)] max-[1180px]:w-[min(var(--lyra-unit-300),33vw)] justify-start gap-0 overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)] bg-[var(--lyra-app-input-bg)] px-[var(--lyra-space-10)] text-[var(--lyra-text-secondary)] backdrop-blur-none hover:border-[var(--lyra-app-border-strong)] hover:bg-[var(--lyra-app-input-hover-bg)] hover:text-[var(--lyra-text-primary)]";

export type WorkbenchNotificationTopbarQuickAction = {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean;
  readonly tone?: "default" | "danger";
  readonly onSelect: () => void;
};

export type WorkbenchNotificationTopbarProps = {
  readonly labels: NotificationTopbarLabels;
  readonly notificationCount: number;
  readonly unreadCount: number;
  readonly preview: WorkbenchNotificationItem | null;
  readonly quickActions?: readonly WorkbenchNotificationTopbarQuickAction[];
  readonly onOpenCenter: () => void;
  readonly onOpenPreview: () => void;
};

export const WorkbenchNotificationTopbar = ({
  labels,
  notificationCount,
  unreadCount,
  preview,
  quickActions = [],
  onOpenCenter,
  onOpenPreview
}: WorkbenchNotificationTopbarProps) => {
  const previewText = preview === null
    ? ""
    : `${preview.source.title} · ${preview.preview}`;
  const visibleQuickActions = preview === null
    ? []
    : quickActions.slice(0, MAX_TOPBAR_QUICK_ACTIONS);
  const canOpenCenter = notificationCount > 0;

  return (
    <section className={TOPBAR_CLASS} aria-label="notification-topbar">
      {preview === null ? null : (
        <Button
          variant="ghost"
          size="sm"
          className={PREVIEW_CLASS}
          aria-label={labels.openPreview}
          onClick={onOpenPreview}
        >
          <span className="inline-flex size-[var(--lyra-icon-size-14)] flex-none items-center justify-center text-[var(--lyra-text-muted)]" aria-hidden="true">
            {renderNotificationSourceIcon(preview.source.iconKey, 12)}
          </span>
          <span className="inline-flex min-w-0 items-center overflow-hidden">
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)]">
              {previewText}
            </span>
          </span>
        </Button>
      )}

      {visibleQuickActions.length === 0 ? null : (
        <div className="inline-flex flex-none items-center gap-[var(--lyra-space-2)]">
          {visibleQuickActions.map((action) => (
            <Button
              key={action.id}
              variant="ghost"
              size="icon"
              className={`${ICON_BUTTON_CLASS}${action.tone === "danger" ? " hover:text-[var(--lyra-status-error)] hover:bg-transparent" : ""}`}
              aria-label={action.label}
              title={action.label}
              disabled={action.disabled === true}
              onClick={action.onSelect}
            >
              {action.icon}
            </Button>
          ))}
        </div>
      )}

      <Button
        variant="ghost"
        size="icon"
        className={`${ICON_BUTTON_CLASS} relative${preview !== null ? " bg-[var(--lyra-app-row-active-bg)] text-[var(--lyra-text-primary)]" : ""}`}
        aria-label={labels.openCenter}
        disabled={!canOpenCenter}
        onClick={onOpenCenter}
      >
        <Bell size={14} />
        {unreadCount > 0 ? (
          <span
            className="absolute top-[var(--lyra-space-6)] right-[var(--lyra-space-6)] size-[var(--lyra-space-6)] rounded-full bg-[var(--lyra-status-error)] shadow-[0_0_0_var(--lyra-stroke-strong)_var(--lyra-app-sidebar-bg)]"
            aria-hidden="true"
          />
        ) : null}
      </Button>
    </section>
  );
};
