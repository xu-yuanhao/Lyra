import { useEffect, useMemo, useState } from "react";

import { createSettingsSurfaceModel } from "./settings-render-model";
import { SettingsSurfaceView } from "./settings-surface-view";
import { requestSoftwareStoreDetail } from "../software-store/service";
import type { BrowserSettingsSurfaceProps } from "./settings-surface-types";
import type { SettingsCategoryId } from "./settings-schema";

export type {
  BrowserSettingsCategoryFocusRequest,
  BrowserSettingsSurfaceProps
} from "./settings-surface-types";

export const BrowserSettingsSurface = (props: BrowserSettingsSurfaceProps) => {
  const [activeDestination, setActiveDestination] = useState<SettingsCategoryId | "account">(
    props.focusCategoryRequest?.categoryId ?? "general"
  );
  const [softwareStoreHeading, setSoftwareStoreHeading] = useState<string | null>(null);
  const model = useMemo(
    () =>
      createSettingsSurfaceModel({
        ...props,
        softwareStore: { ...props.softwareStore, onHeadingChange: setSoftwareStoreHeading }
      }),
    [props]
  );

  const handleActivateCategory = (categoryId: SettingsCategoryId): void => {
    setActiveDestination(categoryId);
  };

  const handleRepairLoginManager = (): void => {
    requestSoftwareStoreDetail({
      kind: "component",
      id: "lyra.credentials"
    });
    setActiveDestination("softwareStore");
  };

  useEffect(() => {
    const categoryId = props.focusCategoryRequest?.categoryId;
    if (categoryId === undefined) {
      return;
    }
    setActiveDestination(categoryId);
  }, [props.focusCategoryRequest?.categoryId, props.focusCategoryRequest?.requestId]);

  return (
    <SettingsSurfaceView
      model={model}
      activeDestination={activeDestination}
      onActivateCategory={handleActivateCategory}
      onOpenAccount={() => setActiveDestination("account")}
      docsNavLabel={props.docsNavLabel}
      onOpenDocs={props.onOpenDocs}
      account={props.account}
      accountLabels={props.accountLabels}
      desktopApi={props.desktopApi}
      softwareStoreHeading={softwareStoreHeading}
      onRepairLoginManager={handleRepairLoginManager}
    />
  );
};
