const FP_PANE_DESCENDANTS =
  "[&_.lyra-file-editor-body]:h-full [&_.lyra-file-editor-empty-state]:h-full [&_.lyra-file-editor-surface]:h-full [&_.lyra-image-viewer-source-pane]:h-full [&_.lyra-image-viewer-stage]:h-full [&_.lyra-image-viewer-loading-flow]:h-full [&_.lyra-image-viewer-empty]:h-full";
export const FP_SPLIT_CLASS =
  `lyra-file-preview-split grid min-h-0 min-w-0 h-full w-full ${FP_PANE_DESCENDANTS}`;
export const FP_FILL_CLASS =
  `lyra-file-preview-fill grid h-full min-h-0 w-full min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] ${FP_PANE_DESCENDANTS} [&>.lyra-file-preview-pane]:col-start-1 [&>.lyra-file-preview-pane]:row-start-1`;
export const FP_PANE_CLASS =
  "lyra-file-preview-pane min-h-0 min-w-0 overflow-hidden [[hidden]>&]:hidden";
export const FP_FRAME_CLASS =
  "lyra-file-preview-frame block h-full w-full border-0 bg-[var(--lyra-app-panel-bg)]";
export const FP_IMAGE_CLASS = "lyra-file-preview-image block h-full w-full border-0 bg-[var(--lyra-app-panel-bg)] object-contain";
export const FP_IMAGE_STAGE_CLASS =
  "lyra-file-preview-image-stage relative h-full w-full min-h-0 min-w-0 cursor-grab touch-none overflow-hidden active:cursor-grabbing [&_.lyra-file-preview-image]:pointer-events-none [&_.lyra-file-preview-image]:absolute [&_.lyra-file-preview-image]:top-1/2 [&_.lyra-file-preview-image]:left-1/2 [&_.lyra-file-preview-image]:h-auto [&_.lyra-file-preview-image]:w-auto [&_.lyra-file-preview-image]:max-h-full [&_.lyra-file-preview-image]:max-w-full [&_.lyra-file-preview-image]:-translate-x-1/2 [&_.lyra-file-preview-image]:-translate-y-1/2 [&_.lyra-file-preview-image]:origin-center [&_.lyra-file-preview-image]:select-none";
export const FP_MARKDOWN_CLASS = "lyra-file-preview-markdown h-full overflow-auto";
export const FP_EMPTY_CLASS = "lyra-file-preview-empty h-full overflow-auto";
