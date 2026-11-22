import {
  AppButton,
  AppStatusMessage,
  AppSurfaceHeader,
  AppTabs,
  type AppTabOption
} from "@renderer/ui/components";
import { Download, RefreshCw, X } from "@lyra/icons";
import { useMemo } from "react";

import type {
  AppUpdateStatus,
  ComponentUpdateChannel,
  ComponentUpdateProgress
} from "../../../shared/desktop-bridge";
import type { SoftwareStoreLabels } from "./types";
import {
  SS_UPDATE_ACTIONS_CLASS,
  SS_UPDATE_BODY_CLASS,
  SS_UPDATE_CHANNEL_LABEL_CLASS,
  SS_UPDATE_CLASS,
  SS_UPDATE_PROGRESS_CLASS,
} from "./classes";

export const SoftwareStoreComponentUpdatePanel = ({
  labels,
  available,
  busy,
  channel,
  progress,
  onChannelChange,
  onStage,
  onCancel
}: {
  readonly labels: SoftwareStoreLabels;
  readonly available: boolean;
  readonly busy: boolean;
  readonly channel: ComponentUpdateChannel;
  readonly progress: ComponentUpdateProgress | null;
  readonly onChannelChange: (channel: ComponentUpdateChannel) => void;
  readonly onStage: () => void;
  readonly onCancel: () => void;
}) => {
  const options = useMemo<readonly AppTabOption<ComponentUpdateChannel>[]>(() => [
    { value: "stable", label: labels.stableChannel },
    { value: "preview", label: labels.previewChannel }
  ], [labels.previewChannel, labels.stableChannel]);
  return (
    <section className={SS_UPDATE_CLASS} aria-label={labels.updateTitle}>
      <AppSurfaceHeader
        title={labels.updateTitle}
        actions={(
          <span className={SS_UPDATE_ACTIONS_CLASS}>
            <AppButton
              variant="outline"
              size="sm"
              disabled={!available || busy}
              onClick={onStage}
            >
              <Download size={14} aria-hidden="true" />
              <span>{labels.checkAndStageUpdates}</span>
            </AppButton>
            {busy ? (
              <AppButton variant="outline" size="sm" onClick={onCancel}>
                <X size={14} aria-hidden="true" />
                <span>{labels.cancelUpdate}</span>
              </AppButton>
            ) : null}
          </span>
        )}
      />
      <div className={SS_UPDATE_BODY_CLASS}>
        <span className={SS_UPDATE_CHANNEL_LABEL_CLASS}>
          {labels.updateChannelLabel}
        </span>
        <AppTabs
          ariaLabel={labels.updateChannelLabel}
          value={channel}
          options={options}
          onValueChange={onChannelChange}
        />
        {progress === null ? null : (
          <AppStatusMessage className={SS_UPDATE_PROGRESS_CLASS}>
            {labels.updateProgressLabel}: {progress.phase}
            {" · "}
            {progress.completedComponents}/{progress.totalComponents}
          </AppStatusMessage>
        )}
      </div>
    </section>
  );
};

export const SoftwareStoreAppUpdatePanel = ({
  labels,
  status,
  available,
  busy,
  onCheck,
  onDownload,
  onInstall
}: {
  readonly labels: SoftwareStoreLabels;
  readonly status: AppUpdateStatus | null;
  readonly available: boolean;
  readonly busy: boolean;
  readonly onCheck: () => void;
  readonly onDownload: () => void;
  readonly onInstall: () => void;
}) => {
  const state = status?.state ?? "unsupported";
  const description = state === "checking" ? labels.appUpdateChecking
    : state === "downloading" ? `${labels.appUpdateDownloading}${status?.progress === undefined ? "" : ` ${status.progress}%`}`
    : state === "ready" ? labels.appUpdateReady
    : state === "error" ? `${labels.appUpdateFailed}${status?.error === undefined ? "" : `: ${status.error}`}`
    : state === "unsupported" ? labels.appUpdateUnavailable
    : state === "available" ? `${labels.appUpdateAvailableVersion}: ${status?.availableVersion ?? "-"}`
    : labels.appUpdateLatest;
  return (
    <section className={SS_UPDATE_CLASS} aria-label={labels.appUpdateTitle}>
      <AppSurfaceHeader
        title={labels.appUpdateTitle}
        actions={(
          <span className={SS_UPDATE_ACTIONS_CLASS}>
            <AppButton variant="outline" size="sm" disabled={!available || busy} onClick={onCheck}>
              <RefreshCw size={14} aria-hidden="true" />
              <span>{state === "error" ? labels.appUpdateRetry : labels.appUpdateCheck}</span>
            </AppButton>
            {state === "available" ? (
              <AppButton size="sm" disabled={busy} onClick={onDownload}>
                <Download size={14} aria-hidden="true" /><span>{labels.appUpdateDownload}</span>
              </AppButton>
            ) : null}
            {state === "ready" ? <AppButton size="sm" onClick={onInstall}>{labels.appUpdateRestart}</AppButton> : null}
          </span>
        )}
      />
      <div className={SS_UPDATE_BODY_CLASS}>
        <AppStatusMessage>{labels.appUpdateCurrentVersion}: {status?.currentVersion ?? "-"}</AppStatusMessage>
        <AppStatusMessage className={state === "error" ? "lyra-software-store-error" : undefined}>{description}</AppStatusMessage>
      </div>
    </section>
  );
};
