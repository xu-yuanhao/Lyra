import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DiffHunk } from "../../core/types";
import { useFollowBottomUntilHover } from "./use-follow-bottom-until-hover";
import {
  DIFF_GUTTER_CLASS,
  DIFF_SIGN_CLASS,
  DIFF_TEXT_CLASS,
  DIFF_VIEWPORT_CLASS,
  DIFF_VIEWPORT_TRACK_CLASS,
  DIFF_WIDTH_PROBE_CLASS,
  diffLineClass
} from "../chat/classes";

/** Matches `.lyra-agents-diff-line` single-line row height in agents.scss. */
export const DIFF_LINE_HEIGHT_PX = 20;
/** Max viewport before inner scroll; mirrors diff-stats pill body cap. */
export const DIFF_VIEWPORT_MAX_HEIGHT_PX = 220;
const OVERSCAN_LINES = 10;

type FlatDiffLine = {
  readonly key: string;
  readonly lineNumber: number;
  readonly kind: "add" | "del" | "ctx";
  readonly text: string;
};

export const flattenDiffHunks = (hunks: readonly DiffHunk[]): FlatDiffLine[] => {
  const lines: FlatDiffLine[] = [];
  for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex += 1) {
    const hunk = hunks[hunkIndex]!;
    for (let lineIndex = 0; lineIndex < hunk.lines.length; lineIndex += 1) {
      const line = hunk.lines[lineIndex]!;
      lines.push({
        key: `${hunkIndex}:${lineIndex}`,
        lineNumber: hunk.startLine + lineIndex,
        kind: line.kind,
        text: line.text
      });
    }
  }
  return lines;
};

export const diffVisibleLineRange = (
  scrollTop: number,
  viewportHeight: number,
  lineCount: number,
  overscan = OVERSCAN_LINES
): { readonly start: number; readonly end: number } => {
  if (lineCount <= 0) {
    return { start: 0, end: -1 };
  }
  const start = Math.max(0, Math.floor(scrollTop / DIFF_LINE_HEIGHT_PX) - overscan);
  const end = Math.min(
    lineCount - 1,
    Math.ceil((scrollTop + viewportHeight) / DIFF_LINE_HEIGHT_PX) + overscan
  );
  return { start, end };
};

export function VirtualizedDiffView({
  hunks,
  running = false,
  className = "",
  fill = false
}: {
  readonly hunks: readonly DiffHunk[];
  readonly running?: boolean;
  readonly className?: string;
  readonly fill?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const lines = useMemo(() => flattenDiffHunks(hunks), [hunks]);
  const longestLineText = useMemo(
    () => lines.reduce((longest, line) => (line.text.length > longest.length ? line.text : longest), ""),
    [lines]
  );
  const contentHeight = lines.length * DIFF_LINE_HEIGHT_PX;
  const viewportHeight = fill
    ? Math.max(measuredHeight, 1)
    : Math.min(contentHeight, DIFF_VIEWPORT_MAX_HEIGHT_PX);
  const { start, end } = diffVisibleLineRange(scrollTop, viewportHeight, lines.length);
  const shouldVirtualize = lines.length > OVERSCAN_LINES * 2 + 4;

  useEffect(() => {
    if (fill === false) {
      return undefined;
    }
    const viewport = viewportRef.current;
    if (viewport === null) {
      return undefined;
    }
    const update = (): void => {
      setMeasuredHeight(viewport.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport);
    return () => {
      observer.disconnect();
    };
  }, [fill, lines.length]);

  const pinVirtualWindow = useCallback((scroller: HTMLElement) => {
    setScrollTop(scroller.scrollTop);
  }, []);
  const followBottom = useFollowBottomUntilHover(
    viewportRef,
    running,
    lines.length,
    pinVirtualWindow,
  );

  if (lines.length === 0) {
    return null;
  }

  const visibleLines = shouldVirtualize ? lines.slice(start, end + 1) : lines;
  const topSpacer = shouldVirtualize ? start * DIFF_LINE_HEIGHT_PX : 0;
  const bottomSpacer = shouldVirtualize
    ? Math.max(0, contentHeight - topSpacer - visibleLines.length * DIFF_LINE_HEIGHT_PX)
    : 0;

  return (
    <div
      ref={viewportRef}
      className={[DIFF_VIEWPORT_CLASS, fill && "lyra-agents-diff-viewport-fill", className]
        .filter(Boolean)
        .join(" ")}
      data-scrollable="true"
      style={fill ? { height: "100%", maxHeight: "none" } : { maxHeight: DIFF_VIEWPORT_MAX_HEIGHT_PX }}
      onMouseEnter={followBottom.onMouseEnter}
      onMouseLeave={followBottom.onMouseLeave}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className={DIFF_VIEWPORT_TRACK_CLASS} style={{ minHeight: contentHeight }}>
        <div className={DIFF_WIDTH_PROBE_CLASS} aria-hidden>
          <div className={diffLineClass("ctx")}>
            <span className={DIFF_GUTTER_CLASS}>00000</span>
            <span className={DIFF_SIGN_CLASS}>+</span>
            <span className={DIFF_TEXT_CLASS}>{longestLineText || "\u00A0"}</span>
          </div>
        </div>
        {topSpacer > 0 ? <div style={{ height: topSpacer }} aria-hidden /> : null}
        {visibleLines.map((line) => (
          <div
            key={line.key}
            className={diffLineClass(line.kind)}
          >
            <span className="lyra-agents-diff-gutter">{line.lineNumber}</span>
            <span className="lyra-agents-diff-sign">
              {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
            </span>
            <span className="lyra-agents-diff-text">{line.text || "\u00A0"}</span>
          </div>
        ))}
        {bottomSpacer > 0 ? <div style={{ height: bottomSpacer }} aria-hidden /> : null}
      </div>
    </div>
  );
}