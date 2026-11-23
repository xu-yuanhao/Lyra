import { useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { fixedRowVirtualizerOptions } from "../../../../ui-primitives";
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
  const lines = useMemo(() => flattenDiffHunks(hunks), [hunks]);
  const longestLineText = useMemo(
    () => lines.reduce((longest, line) => (line.text.length > longest.length ? line.text : longest), ""),
    [lines]
  );
  const contentHeight = lines.length * DIFF_LINE_HEIGHT_PX;
  const virtualizer = useVirtualizer(fixedRowVirtualizerOptions({
    count: lines.length,
    getScrollElement: () => viewportRef.current,
    rowHeight: DIFF_LINE_HEIGHT_PX,
    overscan: OVERSCAN_LINES
  }));
  const followBottom = useFollowBottomUntilHover(
    viewportRef,
    running,
    lines.length,
  );

  if (lines.length === 0) {
    return null;
  }

  const virtualized = lines.length > OVERSCAN_LINES * 2 + 4;
  const virtualItems = virtualizer.getVirtualItems();
  const visibleLines = virtualized
    ? virtualItems
      .map((item) => lines[item.index])
      .filter((line): line is FlatDiffLine => line !== undefined)
    : lines;
  const lastItem = virtualItems[virtualItems.length - 1];
  const topSpacer = virtualized ? (virtualItems[0]?.start ?? 0) : 0;
  const bottomSpacer = virtualized && lastItem !== undefined
    ? Math.max(0, virtualizer.getTotalSize() - lastItem.end)
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