import { Spinner } from "@renderer/ui/components/spinner";

import { FileManagerDirectoryContent } from "./surface-directory";
import { FileManagerDownloadsSlot } from "./downloads-slot";
import {
  FM_CONTENT_CLASS,
  FM_CONTENT_SCROLL_CLASS
} from "./surface-classes";
import { FileManagerFavoritesContent, FileManagerHomeContent } from "./surface-home";
import { FileManagerLoadingSkeleton } from "./surface-loading";
import { FileManagerTrashContent } from "./surface-trash";
import type { FileManagerSurfaceViewProps } from "./surface-view-types";

export const FileManagerContent = ({
  renderModel,
  labels,
  actions,
  instanceId,
  downloadsSlot
}: FileManagerSurfaceViewProps) => (
  <section
    className={FM_CONTENT_CLASS}
    onContextMenu={(event) => {
      if (renderModel.viewKind !== "directory" && renderModel.viewKind !== "trash") {
        return;
      }
      event.preventDefault();
      actions.onContentContextMenu(event.clientX, event.clientY);
    }}
  >
    <div className={FM_CONTENT_SCROLL_CLASS}>
      {renderModel.body.kind === "loading" ? (
        <>
          <div className="lyra-file-manager-empty-state flex items-center justify-center gap-[var(--lyra-space-8)] text-sm text-muted-foreground">
            <Spinner className="size-4" />
            <span>{labels.loading}</span>
          </div>
          <FileManagerLoadingSkeleton
            viewKind={renderModel.viewKind}
            presentationMode={renderModel.presentationMode}
            slots={renderModel.body.skeletonSlots}
          />
        </>
      ) : null}

      {renderModel.body.kind === "error" ? (
        <div className="lyra-file-manager-empty-state flex items-center justify-center text-sm text-muted-foreground">
          {renderModel.body.message ?? labels.unavailable}
        </div>
      ) : null}

      <FileManagerHomeContent
        renderModel={renderModel}
        labels={labels}
        actions={actions}
      />
      <FileManagerFavoritesContent
        renderModel={renderModel}
        labels={labels}
        actions={actions}
      />
      <FileManagerDirectoryContent
        renderModel={renderModel}
        labels={labels}
        actions={actions}
      />
      <FileManagerTrashContent
        renderModel={renderModel}
        labels={labels}
        actions={actions}
      />
      {renderModel.body.kind === "downloads" ? (
        <FileManagerDownloadsSlot
          fileManagerInstanceId={instanceId}
          title={downloadsSlot.title}
          repairLabel={downloadsSlot.repairLabel}
          description={downloadsSlot.description}
          startFailedDescription={downloadsSlot.startFailedDescription}
          onRepair={downloadsSlot.onRepair}
        />
      ) : null}
    </div>
    {renderModel.osBrandUrl === null ? null : (
      <img
        className="lyra-file-manager-os-watermark"
        src={renderModel.osBrandUrl}
        alt=""
        aria-hidden="true"
      />
    )}
  </section>
);
