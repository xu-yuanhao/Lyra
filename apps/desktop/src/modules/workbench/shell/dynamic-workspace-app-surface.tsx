import { useEffect, useRef, useState } from "react";
import { AppButton, AppErrorState } from "@renderer/ui/components";

import {
  mountWorkspaceAppInstance,
  unmountWorkspaceAppInstance
} from "../workspace-apps";

export type DynamicWorkspaceAppSurfaceProps = {
  readonly instanceId: string;
  readonly title: string;
  readonly repairLabel: string;
  readonly startFailedDescription: string;
  readonly onRepair: () => void;
};

export const DynamicWorkspaceAppSurface = ({
  instanceId,
  title,
  repairLabel,
  startFailedDescription,
  onRepair
}: DynamicWorkspaceAppSurfaceProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return undefined;
    }
    let disposed = false;
    void mountWorkspaceAppInstance(instanceId, container)
      .then(() => {
        if (disposed) {
          void unmountWorkspaceAppInstance(instanceId);
        }
      })
      .catch((mountError: unknown) => {
        if (!disposed) {
          setError(mountError instanceof Error ? mountError.message : String(mountError));
        }
      });
    return () => {
      disposed = true;
      void unmountWorkspaceAppInstance(instanceId).catch((unmountError: unknown) => {
        console.error("[lyra-workspace-apps] failed to unmount app surface", unmountError);
      });
    };
  }, [instanceId]);

  if (error !== null) {
    return (
      <AppErrorState
        title={title}
        description={`${startFailedDescription} ${error}`}
        actions={<AppButton variant="secondary" size="sm" onClick={onRepair}>{repairLabel}</AppButton>}
      />
    );
  }
  return (
    <div
      ref={containerRef}
      className="lyra-dynamic-app-surface block h-full w-full min-h-0 min-w-0"
      role="region"
      aria-label={title}
    />
  );
};
