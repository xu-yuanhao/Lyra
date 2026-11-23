import type { ToolPeek } from "../../core/types";
import { imagePreviewSourceFromSource } from "../rich-text/ActionTargets";
import { TOOL_PEEK_CHIP_CLASS, TOOL_PEEK_CLASS, TOOL_PEEK_EXCERPT_CLASS, TOOL_PEEK_THUMB_CLASS } from "./classes";

export function ToolPeekStrip({
  peek,
  className = "",
}: {
  peek?: ToolPeek | undefined;
  className?: string;
}) {
  if (peek === undefined) return null;
  if (peek.chips.length === 0 && peek.excerpt === undefined && peek.thumbnail === undefined) {
    return null;
  }
  const thumbnailSrc = peek.thumbnail === undefined
    ? undefined
    : imagePreviewSourceFromSource(peek.thumbnail.src);

  return (
    <span className={`${TOOL_PEEK_CLASS} ${className}`.trim()}>
      {peek.thumbnail !== undefined && thumbnailSrc !== undefined ? (
        <img
          src={thumbnailSrc}
          alt={peek.thumbnail.alt}
          className={TOOL_PEEK_THUMB_CLASS}
        />
      ) : null}
      {peek.chips.map((chip) => (
        <span key={chip} className={TOOL_PEEK_CHIP_CLASS}>
          {chip}
        </span>
      ))}
      {peek.excerpt !== undefined ? (
        <span className={TOOL_PEEK_EXCERPT_CLASS} title={peek.excerpt}>
          {peek.excerpt}
        </span>
      ) : null}
    </span>
  );
}
