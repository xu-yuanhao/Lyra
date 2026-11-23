import {
  observeElementRect,
  type Virtualizer
} from "@tanstack/react-virtual";

const FIXED_ROW_VIEWPORT_FALLBACK = { width: 800, height: 600 };
const FIXED_ROW_HEIGHT_PX = 28;
const FIXED_ROW_OVERSCAN = 40;

/**
 * Shared options for fixed-height row lists virtualized with
 * @tanstack/react-virtual. Before the scrollport reports a real height
 * (first paint, jsdom tests) fall back to a 600px viewport so the initial
 * range still covers a useful slice instead of collapsing to overscan.
 */
export const fixedRowVirtualizerOptions = ({
  count,
  getScrollElement,
  rowHeight = FIXED_ROW_HEIGHT_PX,
  overscan = FIXED_ROW_OVERSCAN
}: {
  readonly count: number;
  readonly getScrollElement: () => HTMLElement | null;
  readonly rowHeight?: number;
  readonly overscan?: number;
}) => ({
  count,
  getScrollElement,
  estimateSize: () => rowHeight,
  overscan,
  initialRect: FIXED_ROW_VIEWPORT_FALLBACK,
  observeElementRect: (
    instance: Virtualizer<HTMLElement, HTMLElement>,
    callback: (rect: { width: number; height: number }) => void
  ) => observeElementRect(instance, (rect) => {
    callback(rect.height > 0
      ? rect
      : {
        width: rect.width > 0 ? rect.width : FIXED_ROW_VIEWPORT_FALLBACK.width,
        height: FIXED_ROW_VIEWPORT_FALLBACK.height
      });
  }),
  measureElement: (element: HTMLElement) => {
    const height = element.getBoundingClientRect().height;
    return height > 0 ? height : rowHeight;
  }
});
