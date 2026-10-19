import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type { ContextMenuModel } from "../context-menu";
import { useFileEditorModel, type FileEditorModel } from "../file-editor";
import {
  useAgentProjectTreeModel,
  type AgentProjectTreeModel
} from "../agent-project-tree";
import {
  useFileManagerModel,
  type FileManagerModel,
  type FileManagerSurfaceLabels
} from "../file-manager";
import { useImageViewerModel, type ImageViewerModel } from "../image-viewer";
import type { WorkspaceTabsModel } from "../workspace-tabs";

type WorkbenchFileAppModels = {
  readonly fileManagerModel: FileManagerModel;
  readonly fileEditorModel: FileEditorModel;
  readonly imageViewerModel: ImageViewerModel;
  readonly agentProjectTreeModel: AgentProjectTreeModel;
};

type UseWorkbenchFileAppModelsOptions = {
  readonly desktopApi: LyraDesktopApi | null;
  readonly contextMenuModel: ContextMenuModel;
  readonly fileManagerLabels: FileManagerSurfaceLabels;
  readonly tabsModel: WorkspaceTabsModel;
  readonly onOpenTerminal?: (cwd: string) => void;
};

export const useWorkbenchFileAppModels = ({
  desktopApi,
  contextMenuModel,
  fileManagerLabels,
  tabsModel,
  onOpenTerminal
}: UseWorkbenchFileAppModelsOptions): WorkbenchFileAppModels => {
  const fileManagerModel = useFileManagerModel({
    desktopApi,
    contextMenuModel,
    labels: fileManagerLabels,
    onMetaChange: tabsModel.updateAppTabMeta,
    ...(onOpenTerminal === undefined ? {} : { onOpenTerminal })
  });
  const fileEditorModel = useFileEditorModel({
    desktopApi,
    onMetaChange: tabsModel.updateAppTabMeta
  });
  const imageViewerModel = useImageViewerModel({
    desktopApi,
    fileEditorModel,
    onMetaChange: tabsModel.updateAppTabMeta
  });
  const agentProjectTreeModel = useAgentProjectTreeModel({
    fileEditorModel,
    imageViewerModel,
    onMetaChange: tabsModel.updateAppTabMeta
  });

  return {
    fileManagerModel,
    fileEditorModel,
    imageViewerModel,
    agentProjectTreeModel
  };
};
