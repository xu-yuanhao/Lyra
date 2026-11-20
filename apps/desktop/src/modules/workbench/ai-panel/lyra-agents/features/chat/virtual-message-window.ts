import {
  defaultRangeExtractor,
  observeElementRect,
  type Range,
  type Virtualizer
} from "@tanstack/react-virtual";

export const MESSAGE_ROW_ESTIMATE_PX = 80;
export const MESSAGE_ROW_OVERSCAN = 6;

/** Prefetch older history two viewports before the edge (ZCode timeline). */
export const HISTORY_PREFETCH_VIEWPORTS = 2;

export const historyPrefetchTriggerPx = (
  viewportHeight: number,
  minimumPx: number
): number => {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return minimumPx;
  }
  return Math.max(minimumPx, viewportHeight * HISTORY_PREFETCH_VIEWPORTS);
};

const UNMEASURED_TAIL = 16;

const VIEWPORT_FALLBACK = { width: 800, height: 600 };

/** Before the scrollport has a height, keep the latest rows. A chat is pinned to the end. */
export const messageRangeExtractor = (
  count: number,
  scrollportHeight: number
) => (range: Range): number[] => {
  if (scrollportHeight <= 0 && count > 0) {
    const start = Math.max(0, count - UNMEASURED_TAIL);
    return Array.from({ length: count - start }, (_, index) => start + index);
  }
  return defaultRangeExtractor(range);
};

export type MessageHeightMemory = {
  readonly estimateForKey: (key: string | number) => number;
  readonly recordHeight: (key: string | number, height: number) => void;
};

export const messageVirtualizerOptions = (
  count: number,
  getScrollElement: () => HTMLDivElement | null,
  getItemKey: (index: number) => string | number,
  memory?: MessageHeightMemory
) => ({
  count,
  getScrollElement,
  getItemKey,
  // Remounted rows start from their last real height instead of the raw
  // default, so offsets stay close during drag-churned mount/unmount.
  estimateSize: (index: number) =>
    memory?.estimateForKey(getItemKey(index)) ?? MESSAGE_ROW_ESTIMATE_PX,
  overscan: MESSAGE_ROW_OVERSCAN,
  initialRect: VIEWPORT_FALLBACK,
  initialOffset: () => Math.max(0, count * MESSAGE_ROW_ESTIMATE_PX - VIEWPORT_FALLBACK.height),
  observeElementRect: (
    instance: Virtualizer<HTMLDivElement, HTMLElement>,
    callback: (rect: { width: number; height: number }) => void
  ) => observeElementRect(instance, (rect) => {
    callback(rect.height > 0 ? rect : { width: rect.width || VIEWPORT_FALLBACK.width, height: VIEWPORT_FALLBACK.height });
  }),
  measureElement: (element: HTMLElement) => {
    const height = element.getBoundingClientRect().height;
    if (height > 0 && memory !== undefined) {
      const id = element.getAttribute?.("data-chat-message-id");
      if (typeof id === "string" && id.length > 0) {
        memory.recordHeight(id, height);
      }
    }
    return height > 0 ? height : MESSAGE_ROW_ESTIMATE_PX;
  },
  rangeExtractor: (range: Range) => messageRangeExtractor(
    count,
    getScrollElement()?.clientHeight ?? 0
  )(range)
});

/** Width settles quickly once a splitter drag stops; keep the mute window short. */
export const CONTENT_WIDTH_RESIZE_SETTLE_MS = 120;

export type MessageScrollAdjustmentInput = {
  readonly contentWidthChanging: boolean;
  readonly userScrolled: boolean;
  readonly itemIndex: number;
  readonly rangeStartIndex: number | undefined;
};

/**
 * Width resizes re-measure many rows in batches across adjacent frames;
 * compensating scrollTop per row fights the other rewrites and reads as
 * jitter. While the width moves or the view is pinned to the bottom, hold;
 * otherwise compensate only for rows above the rendered range.
 */
export const shouldAdjustMessageScrollOnItemSizeChange = (
  input: MessageScrollAdjustmentInput
): boolean => {
  if (input.contentWidthChanging || !input.userScrolled) {
    return false;
  }
  return input.rangeStartIndex !== undefined && input.itemIndex < input.rangeStartIndex;
};
