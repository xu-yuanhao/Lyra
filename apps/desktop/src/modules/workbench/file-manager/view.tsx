import {
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { useLoadingVisibility } from "../shell/use-loading-visibility";
import {
  deriveFileManagerSurfaceModel
} from "./surface-model";
import {
  FileManagerSurfaceView
} from "./surface-view";
import { FileManagerToolbarContent } from "./surface-toolbar";
import type {
  FileManagerAppState,
  FileManagerChooserMode,
  FileManagerModel,
  FileManagerSurfaceLabels
} from "./types";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type { FileManagerFavorite } from "../../../shared/file-manager";
import { useFileManagerSurfaceActions } from "./use-file-manager-surface-actions";
import type { FileManagerDownloadsSlotLabels } from "./surface-view-types";

export type FileManagerSurfaceProps = {
  readonly desktopApi?: LyraDesktopApi | null;
  readonly state: FileManagerAppState | null;
  readonly labels: FileManagerSurfaceLabels;
  readonly model: FileManagerModel;
  readonly onOpenFile: (filePath: string) => void;
  readonly onOpenFavorite?: (favorite: FileManagerFavorite) => void;
  readonly chooser?: FileManagerChooserMode | null;
  readonly downloadsSlot: FileManagerDownloadsSlotLabels;
};

const FileManagerTitlebarBridge = ({
  renderModel,
  labels,
  actions
}: {
  readonly renderModel: ReturnType<typeof deriveFileManagerSurfaceModel>;
  readonly labels: FileManagerSurfaceLabels;
  readonly actions: NonNullable<ReturnType<typeof useFileManagerSurfaceActions>>;
}) => {
  const contribution = useMemo(
    () => ({
      ariaLabel: labels.title,
      content: (
        <FileManagerToolbarContent
          renderModel={renderModel}
          labels={labels}
          actions={actions}
        />
      )
    }),
    [actions, labels, renderModel]
  );
  useWorkbenchTitlebarContribution(contribution);
  return null;
};

export const FileManagerSurface = ({
  desktopApi,
  state,
  labels,
  model,
  onOpenFile,
  onOpenFavorite,
  chooser,
  downloadsSlot
}: FileManagerSurfaceProps) => {
  const isLoading = state?.status === "loading";
  const showLoadingSkeleton = useLoadingVisibility(isLoading, {
    showDelayMs: 120,
    minVisibleMs: 180
  });
  const dragPreviewRef = useRef<HTMLElement | null>(null);
  const [pageKindOverride, setPageKindOverride] = useState<"favorites" | null>(null);

  const effectiveViewKind = pageKindOverride ?? state?.viewKind;
  const renderModel = useMemo(
    () =>
      state === null
        ? null
        : deriveFileManagerSurfaceModel(
          state,
          chooser,
          showLoadingSkeleton,
          effectiveViewKind
        ),
    [chooser, effectiveViewKind, showLoadingSkeleton, state]
  );

  const actions = useFileManagerSurfaceActions({
    state,
    model,
    onOpenFile,
    ...(onOpenFavorite === undefined ? {} : { onOpenFavorite }),
    ...(chooser === undefined ? {} : { chooser }),
    renderModel,
    setPageKindOverride,
    dragPreviewRef
  });

  useEffect(
    () => () => {
      const currentPreview = dragPreviewRef.current;
      if (currentPreview !== null) {
        dragPreviewRef.current = null;
        currentPreview.remove();
      }
    },
    []
  );

  useEffect(() => {
    setPageKindOverride(null);
  }, [state?.historyIndex, state?.instanceId]);

  if (state === null || renderModel === null || actions === null) {
    return null;
  }

  return (
    <>
      <FileManagerTitlebarBridge
        renderModel={renderModel}
        labels={labels}
        actions={actions}
      />
      <FileManagerSurfaceView
        renderModel={renderModel}
        labels={labels}
        actions={actions}
        instanceId={state.instanceId}
        downloadsSlot={downloadsSlot}
      />
    </>
  );
};