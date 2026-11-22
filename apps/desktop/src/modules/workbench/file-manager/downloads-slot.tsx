import { useEffect, useState } from "react";
import { AppButton, AppEmptyState, AppErrorState } from "@renderer/ui/components";

import { DynamicWorkspaceAppSurface } from "../shell/dynamic-workspace-app-surface";
import { FM_EMPTY_STATE_CLASS } from "./surface-classes";
import {
  createWorkspaceAppInstance,
  isWorkspaceAppModuleSurfaceReady,
  readWorkspaceAppVersionState,
  type WorkspaceAppInstanceHandle
} from "../workspace-apps";

const DOWNLOADS_APP_ID = "downloads";
const DOWNLOADS_COMPONENT_ID = "lyra.downloads";

export type FileManagerDownloadsSlotProps = {
  readonly fileManagerInstanceId: string;
  readonly title: string;
  readonly repairLabel: string;
  readonly description: string;
  readonly startFailedDescription: string;
  readonly onRepair: () => void;
};

export const downloadsInstanceIdForFileManager = (fileManagerInstanceId: string): string =>
  `downloads:${fileManagerInstanceId}`;

export const FileManagerDownloadsSlot = ({
  fileManagerInstanceId,
  title,
  repairLabel,
  description,
  startFailedDescription,
  onRepair
}: FileManagerDownloadsSlotProps) => {
  const version = readWorkspaceAppVersionState(DOWNLOADS_COMPONENT_ID).active;
  const ready = isWorkspaceAppModuleSurfaceReady(DOWNLOADS_COMPONENT_ID, version);
  const instanceId = downloadsInstanceIdForFileManager(fileManagerInstanceId);
  const [instanceReady, setInstanceReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) {
      setInstanceReady(false);
      setError(null);
      return undefined;
    }
    let cancelled = false;
    let handle: WorkspaceAppInstanceHandle | undefined;
    void createWorkspaceAppInstance({
      appId: DOWNLOADS_APP_ID,
      componentId: DOWNLOADS_COMPONENT_ID,
      instanceId,
      route: "/"
    }).then((created) => {
      if (cancelled) {
        void created.close();
        return;
      }
      handle = created;
      setError(null);
      setInstanceReady(true);
    }).catch((cause: unknown) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setInstanceReady(false);
      }
    });
    return () => {
      cancelled = true;
      setInstanceReady(false);
      setError(null);
      void handle?.close().catch((closeError: unknown) => {
        console.error("[lyra-downloads] failed to close files surface", closeError);
      });
    };
  }, [instanceId, ready, version]);

  if (!ready) {
    return (
      <AppEmptyState
        className={FM_EMPTY_STATE_CLASS}
        title={title}
        description={description}
        actions={(
          <AppButton variant="secondary" size="sm" onClick={onRepair}>
            {repairLabel}
          </AppButton>
        )}
      />
    );
  }
  if (error !== null) {
    return (
      <AppErrorState
        className={FM_EMPTY_STATE_CLASS}
        title={title}
        description={`${startFailedDescription} ${error}`}
        actions={(
          <AppButton variant="secondary" size="sm" onClick={onRepair}>
            {repairLabel}
          </AppButton>
        )}
      />
    );
  }
  if (!instanceReady) {
    return null;
  }

  return (
    <DynamicWorkspaceAppSurface
      instanceId={instanceId}
      title={title}
      repairLabel={repairLabel}
      startFailedDescription={startFailedDescription}
      onRepair={onRepair}
    />
  );
};
