import { useEffect, useState } from "react";
import { AppButton, AppEmptyState, AppErrorState } from "@renderer/ui/components";

import { DynamicWorkspaceAppSurface } from "../shell/dynamic-workspace-app-surface";
import { useWorkbenchTabScopeId } from "../shell/titlebar-context";
import {
  createWorkspaceAppInstance,
  isWorkspaceAppModuleSurfaceReady,
  readWorkspaceAppVersionState,
  type WorkspaceAppInstanceHandle
} from "../workspace-apps";
import {
  LOGIN_MANAGER_APP_ID,
  LOGIN_MANAGER_INSTANCE_ID
} from "./service";

const CREDENTIALS_COMPONENT_ID = "lyra.credentials";

export type LoginManagerSettingsSlotProps = {
  readonly title: string;
  readonly repairLabel: string;
  readonly description: string;
  readonly startFailedDescription: string;
  readonly onRepair: () => void;
};

export const LoginManagerSettingsSlot = ({
  title,
  repairLabel,
  description,
  startFailedDescription,
  onRepair
}: LoginManagerSettingsSlotProps) => {
  const version = readWorkspaceAppVersionState(CREDENTIALS_COMPONENT_ID).active;
  const ready = isWorkspaceAppModuleSurfaceReady(CREDENTIALS_COMPONENT_ID, version);
  const hostTabId = useWorkbenchTabScopeId();
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
      appId: LOGIN_MANAGER_APP_ID,
      componentId: CREDENTIALS_COMPONENT_ID,
      instanceId: LOGIN_MANAGER_INSTANCE_ID,
      route: "/",
      ...(hostTabId === null ? {} : { hostTabId })
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
        console.error("[lyra-credentials] failed to close settings surface", closeError);
      });
    };
  }, [ready, version, hostTabId]);

  if (!ready) {
    return (
      <AppEmptyState
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
      instanceId={LOGIN_MANAGER_INSTANCE_ID}
      title={title}
      repairLabel={repairLabel}
      startFailedDescription={startFailedDescription}
      onRepair={onRepair}
    />
  );
};
