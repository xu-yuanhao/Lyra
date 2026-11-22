import { FileManagerChooserBar } from "./surface-chooser-bar";
import {
  FM_LAYOUT_CLASS,
  FM_SURFACE_CLASS
} from "./surface-classes";
import { FileManagerContent } from "./surface-content";
import { FileManagerSidebar } from "./surface-sidebar";
import type { FileManagerSurfaceViewProps } from "./surface-view-types";

export type { FileManagerSurfaceActions } from "./surface-view-types";

export const FileManagerSurfaceView = ({
  renderModel,
  labels,
  actions,
  instanceId,
  downloadsSlot
}: FileManagerSurfaceViewProps) => (
  <section className={FM_SURFACE_CLASS} aria-label="file-manager-surface">
    <section className={`lyra-app-sidebar-split ${FM_LAYOUT_CLASS}`}>
      <FileManagerSidebar
        renderModel={renderModel}
        labels={labels}
        actions={actions}
      />
      <FileManagerContent
        renderModel={renderModel}
        labels={labels}
        actions={actions}
        instanceId={instanceId}
        downloadsSlot={downloadsSlot}
      />
    </section>
    <FileManagerChooserBar
      renderModel={renderModel}
      labels={labels}
      actions={actions}
    />
  </section>
);
