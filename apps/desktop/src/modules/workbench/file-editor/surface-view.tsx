import { AppButton, AppEmptyState, AppLoadingState, AppToolbarButton } from "@renderer/ui/components";
import { t } from "@workbench/i18n";
import { AlertTriangle, Check, CheckCheck, ChevronDown, ChevronUp, GitCompareArrows, Lock, Save, Undo2, X } from "@lyra/icons";
import { lazy, Suspense, type RefObject } from "react";

import { FilePreviewModeButton } from "../file-preview/view-mode-button";
import { FilePreviewSplit } from "../file-preview/split-pane";
import { previewKindFromPath } from "../file-preview/kinds";
import { useFilePreviewLayout } from "../file-preview/layout-store";
import { looksLikeUnifiedDiff } from "../syntax/language-from-path";
import { parseUnifiedDiff } from "../agent-session-view-model/tool-parsing/diff";
import { VirtualizedDiffView } from "../ai-panel/lyra-agents/features/tools/VirtualizedDiffView";
import type { FileEditorRenderModel } from "./render-model";
import type { FileEditorChangeReviewItem } from "./types";
import { TITLEBAR_CONTEXT_CHIP_CLASS, TITLEBAR_CONTEXT_CONTROLS_CLASS, TITLEBAR_CONTEXT_GROUP_CLASS, TITLEBAR_CONTEXT_ICON_BUTTON_CLASS } from "../shell/classes";
import {
  FE_HOST_HIDDEN_CLASS,
  FE_EMPTY_STATE_CLASS,
  FE_BODY_CLASS,
  FE_UNIFIED_DIFF_CLASS,
  FE_AI_WORK_DELTA_CLASS,
  FE_AI_WORK_DELTA_ADDED_CLASS,
  FE_AI_WORK_DELTA_REMOVED_CLASS,
} from "./classes";

const FilePreviewPane = lazy(async () => {
  const module = await import("../file-preview/preview-pane");
  return { default: module.FilePreviewPane };
});

const unifiedDiffHunksFromEditorContent = (content: string) => {
  if (looksLikeUnifiedDiff(content) === false) {
    return [];
  }
  return parseUnifiedDiff(content).hunks;
};

type FileEditorSurfaceViewProps = {
  readonly renderModel: FileEditorRenderModel;
  readonly attachHost: (node: HTMLDivElement | null) => void;
  readonly diffHostRef: RefObject<HTMLDivElement>;
  readonly previewEnabled: boolean;
  readonly onToggleDiff: () => void;
  readonly onSave: () => void;
  readonly onRetry: () => void;
  readonly onGoToPreviousEditorWorkItem?: (() => void) | undefined;
  readonly onGoToNextEditorWorkItem?: (() => void) | undefined;
  readonly onAcceptAllEditorWorkItems?: (() => void) | undefined;
  readonly onAcceptEditorWorkItem?: ((item: FileEditorChangeReviewItem) => void) | undefined;
  readonly onRejectEditorWorkItem?: ((item: FileEditorChangeReviewItem) => void) | undefined;
  readonly onUndoEditorWorkItem?: ((item: FileEditorChangeReviewItem) => void) | undefined;
};

export const FileEditorTitlebarContent = ({
  renderModel,
  onToggleDiff,
  onSave,
  onGoToPreviousEditorWorkItem,
  onGoToNextEditorWorkItem,
  onAcceptAllEditorWorkItems,
  onAcceptEditorWorkItem,
  onRejectEditorWorkItem,
  onUndoEditorWorkItem
}: Omit<FileEditorSurfaceViewProps, "attachHost" | "diffHostRef" | "onRetry" | "previewEnabled">) => {
  const { toolbar } = renderModel;
  return (
    <div className={TITLEBAR_CONTEXT_CONTROLS_CLASS}>
      {toolbar.delta === null ? null : (
        <span className={FE_AI_WORK_DELTA_CLASS} aria-label={toolbar.delta.ariaLabel}>
          <span className={FE_AI_WORK_DELTA_ADDED_CLASS}>
            {toolbar.delta.addedText}
          </span>
          <span className={FE_AI_WORK_DELTA_REMOVED_CLASS}>
            {toolbar.delta.removedText}
          </span>
        </span>
      )}
      {toolbar.diffToggle === null ? null : (
        <AppToolbarButton
          type="button"
          className={
            toolbar.diffToggle.active
              ? `${TITLEBAR_CONTEXT_ICON_BUTTON_CLASS} lyra-titlebar-context-button-active`
              : TITLEBAR_CONTEXT_ICON_BUTTON_CLASS
          }
          active={toolbar.diffToggle.active}
          aria-label={toolbar.diffToggle.label}
          aria-pressed={toolbar.diffToggle.active}
          onClick={onToggleDiff}
        >
          <GitCompareArrows size={13} />
        </AppToolbarButton>
      )}
      {toolbar.reviewActions === null ? null : (
        <span className={TITLEBAR_CONTEXT_GROUP_CLASS}>
          <AppToolbarButton
            type="button"
            className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
            aria-label={toolbar.reviewActions.prevLabel}
            disabled={!toolbar.reviewActions.canGoPrevious}
            onClick={() => {
              onGoToPreviousEditorWorkItem?.();
            }}
          >
            <ChevronUp size={12} />
          </AppToolbarButton>
          <AppToolbarButton
            type="button"
            className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
            aria-label={toolbar.reviewActions.nextLabel}
            disabled={!toolbar.reviewActions.canGoNext}
            onClick={() => {
              onGoToNextEditorWorkItem?.();
            }}
          >
            <ChevronDown size={12} />
          </AppToolbarButton>
          <AppToolbarButton
            type="button"
            className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
            aria-label={toolbar.reviewActions.acceptAllLabel}
            disabled={!toolbar.reviewActions.canAcceptAll}
            onClick={() => {
              onAcceptAllEditorWorkItems?.();
            }}
          >
            <CheckCheck size={12} />
          </AppToolbarButton>
          {toolbar.reviewActions.decisionState === "accepted" ? (
            <AppToolbarButton
              type="button"
              className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
              aria-label={toolbar.reviewActions.undoLabel}
              onClick={() => {
                onUndoEditorWorkItem?.(toolbar.reviewActions!.item);
              }}
            >
              <Undo2 size={12} />
            </AppToolbarButton>
          ) : (
            <>
              <AppToolbarButton
                type="button"
                className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
                aria-label={toolbar.reviewActions.acceptLabel}
                onClick={() => {
                  onAcceptEditorWorkItem?.(toolbar.reviewActions!.item);
                }}
              >
                <Check size={12} />
              </AppToolbarButton>
              <AppToolbarButton
                type="button"
                className={
                  toolbar.reviewActions.decisionState === "rejected"
                    ? `${TITLEBAR_CONTEXT_ICON_BUTTON_CLASS} lyra-titlebar-context-danger lyra-titlebar-context-button-active`
                    : `${TITLEBAR_CONTEXT_ICON_BUTTON_CLASS} lyra-titlebar-context-danger`
                }
                tone="danger"
                active={toolbar.reviewActions.decisionState === "rejected"}
                aria-label={toolbar.reviewActions.rejectLabel}
                onClick={() => {
                  onRejectEditorWorkItem?.(toolbar.reviewActions!.item);
                }}
              >
                <X size={12} />
              </AppToolbarButton>
            </>
          )}
        </span>
      )}
      {toolbar.readOnlyLabel === null ? null : (
        <span className={TITLEBAR_CONTEXT_CHIP_CLASS}>
          <Lock size={12} />
          {toolbar.readOnlyLabel}
        </span>
      )}
      {toolbar.conflictLabel === null ? null : (
        <span className={TITLEBAR_CONTEXT_CHIP_CLASS}>
          <AlertTriangle size={12} />
          {toolbar.conflictLabel}
        </span>
      )}
      {toolbar.saveButton === null ? null : (
        <AppToolbarButton
          type="button"
          className={TITLEBAR_CONTEXT_ICON_BUTTON_CLASS}
          aria-label={toolbar.saveButton.label}
          disabled={toolbar.saveButton.disabled}
          onClick={onSave}
        >
          <Save size={14} />
        </AppToolbarButton>
      )}
      <FilePreviewModeButton filePath={renderModel.filePath} />
    </div>
  );
};

export const FileEditorSurfaceView = ({
  renderModel,
  attachHost,
  diffHostRef,
  previewEnabled,
  onToggleDiff,
  onSave,
  onRetry,
  onGoToPreviousEditorWorkItem,
  onGoToNextEditorWorkItem,
  onAcceptAllEditorWorkItems,
  onAcceptEditorWorkItem,
  onRejectEditorWorkItem,
  onUndoEditorWorkItem
}: FileEditorSurfaceViewProps) => {
  const { body } = renderModel;
  const kind = previewEnabled ? previewKindFromPath(renderModel.filePath) : null;
  const layout = useFilePreviewLayout(renderModel.filePath);
  const unifiedDiffHunks = body.kind === "editor"
    && body.hostClassName.includes("lyra-file-editor-host-hidden") === false
    ? unifiedDiffHunksFromEditorContent(renderModel.content)
    : [];
  const source = body.kind === "empty"
    ? (
      <AppEmptyState
        className={FE_EMPTY_STATE_CLASS}
        title={body.message}
        actions={(
          <AppButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onRetry}
          >
            {body.retryLabel}
          </AppButton>
        )}
      />
    )
    : (
      <section className={FE_BODY_CLASS}>
        <div
          ref={attachHost}
          className={
            unifiedDiffHunks.length > 0
              ? `${body.hostClassName} ${FE_HOST_HIDDEN_CLASS}`
              : body.hostClassName
          }
        />
        <div
          ref={diffHostRef}
          className={body.diffHostClassName}
        />
        {unifiedDiffHunks.length > 0 ? (
          <section className={FE_UNIFIED_DIFF_CLASS} aria-label={renderModel.filePath}>
            <VirtualizedDiffView fill hunks={unifiedDiffHunks} />
          </section>
        ) : null}
      </section>
    );

  return (
    <section
      className={renderModel.surfaceClassName}
      aria-label="file-editor-surface"
    >
      {kind === null ? source : (
        <FilePreviewSplit
          layout={layout}
          source={source}
          preview={(
            <Suspense fallback={<AppLoadingState title={t("editor.viewPreview")} />}>
              <FilePreviewPane
                kind={kind}
                filePath={renderModel.filePath}
                content={renderModel.content}
              />
            </Suspense>
          )}
          resizerLabel={t("editor.viewMode")}
        />
      )}
    </section>
  );
};
