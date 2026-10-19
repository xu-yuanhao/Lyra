import {
  ChevronUp,
  FilePlus2,
  FolderPlus,
  LayoutGrid,
  List,
  RefreshCw,
  RotateCcw,
  Star,
  StarOff,
  Trash2
} from "@lyra/icons";
import { Fragment } from "react";

import { AppButton, AppIconButton } from "@renderer/ui/components";

import type { FileManagerSurfaceRenderModel } from "./surface-model";
import type { FileManagerSurfaceChromeProps } from "./surface-view-types";

const FileManagerBreadcrumbs = ({
  renderModel,
  onOpenBreadcrumb
}: {
  readonly renderModel: FileManagerSurfaceRenderModel;
  readonly onOpenBreadcrumb: (path: string) => void;
}) => {
  const breadcrumb = renderModel.breadcrumb;
  if (breadcrumb.kind === "home") {
    return null;
  }
  if (breadcrumb.kind === "favorites") {
    return null;
  }

  return (
    <div className="lyra-titlebar-context-group lyra-file-manager-titlebar-breadcrumbs" aria-label="file-manager-breadcrumbs">
      {breadcrumb.kind === "trash" && breadcrumb.title.length > 0 ? (
        <span className="lyra-titlebar-context-text">
          {breadcrumb.title}
        </span>
      ) : breadcrumb.kind === "path" ? (
        breadcrumb.parts.map((part, index) => (
          <Fragment key={part.id}>
            {index === breadcrumb.parts.length - 1 ? (
              <span className="lyra-titlebar-context-text lyra-file-manager-titlebar-breadcrumb-current">
                {part.title}
              </span>
            ) : (
              <AppButton
                variant="ghost"
                size="sm"
                className="lyra-file-manager-titlebar-breadcrumb-button"
                title={part.path}
                onClick={() => {
                  onOpenBreadcrumb(part.path);
                }}
              >
                {part.title}
              </AppButton>
            )}
            {index < breadcrumb.parts.length - 1 && part.title !== "/" ? (
              <span className="lyra-file-manager-titlebar-breadcrumb-separator" aria-hidden="true">/</span>
            ) : null}
          </Fragment>
        ))
      ) : breadcrumb.title.length > 0 ? (
        <span className="lyra-titlebar-context-text">
          {breadcrumb.title}
        </span>
      ) : (
        null
      )}
    </div>
  );
};

export const FileManagerToolbarContent = ({
  renderModel,
  labels,
  actions
}: FileManagerSurfaceChromeProps) => {
  const toolbar = renderModel.toolbar;
  return (
    <>
      <div className="lyra-titlebar-context-group">
        <AppIconButton
          aria-label={labels.navigationUp}
          title={labels.navigationUp}
          disabled={!toolbar.canGoUp}
          onClick={actions.onGoUp}
        >
          <ChevronUp size={14} />
        </AppIconButton>
        <AppIconButton
          aria-label={labels.refresh}
          title={labels.refresh}
          onClick={actions.onRefresh}
        >
          <RefreshCw size={14} />
        </AppIconButton>
      </div>

      <FileManagerBreadcrumbs
        renderModel={renderModel}
        onOpenBreadcrumb={actions.onOpenBreadcrumb}
      />

      <div className="lyra-titlebar-context-group">
        {toolbar.isLargeMode ? (
          <AppIconButton
            aria-label={labels.viewList}
            title={labels.viewList}
            onClick={() => {
              actions.onSetPresentationMode("list");
            }}
          >
            <List size={14} />
          </AppIconButton>
        ) : (
          <AppIconButton
            aria-label={labels.viewLarge}
            title={labels.viewLarge}
            onClick={() => {
              actions.onSetPresentationMode("large");
            }}
          >
            <LayoutGrid size={14} />
          </AppIconButton>
        )}
        {toolbar.favoriteDisabled ? null : (
          <AppIconButton
            active={toolbar.favoriteActive}
            aria-label={toolbar.favoriteActive ? labels.removeFavorite : labels.addFavorite}
            title={toolbar.favoriteActive ? labels.removeFavorite : labels.addFavorite}
            onClick={actions.onToggleFavorite}
          >
            {toolbar.favoriteActive ? <StarOff size={14} /> : <Star size={14} />}
          </AppIconButton>
        )}
        {toolbar.canCreateDraft ? (
          <>
            <AppIconButton
              aria-label={labels.newFolder}
              title={labels.newFolder}
              onClick={() => {
                actions.onBeginCreateDraft("directory");
              }}
            >
              <FolderPlus size={14} />
            </AppIconButton>
            <AppIconButton
              aria-label={labels.newFile}
              title={labels.newFile}
              onClick={() => {
                actions.onBeginCreateDraft("file");
              }}
            >
              <FilePlus2 size={14} />
            </AppIconButton>
          </>
        ) : null}
        {toolbar.canMoveSelectionToTrash ? (
          <AppIconButton
            tone="danger"
            aria-label={labels.delete}
            title={labels.delete}
            onClick={actions.onMoveSelectionToTrash}
          >
            <Trash2 size={14} />
          </AppIconButton>
        ) : null}
        {toolbar.canRestoreSelectionFromTrash ? (
          <AppIconButton
            aria-label={labels.restore}
            title={labels.restore}
            onClick={actions.onRestoreSelectionFromTrash}
          >
            <RotateCcw size={14} />
          </AppIconButton>
        ) : null}
        {toolbar.canEmptyTrash ? (
          <AppIconButton
            tone="danger"
            aria-label={labels.emptyTrash}
            title={labels.emptyTrash}
            onClick={actions.onEmptyTrash}
          >
            <Trash2 size={14} />
          </AppIconButton>
        ) : null}
      </div>
    </>
  );
};
