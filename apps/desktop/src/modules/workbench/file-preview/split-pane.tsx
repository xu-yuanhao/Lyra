import { useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";

import { PanelResizer } from "../ui-primitives";
import type { FilePreviewLayout } from "./kinds";
import {
  FP_SPLIT_CLASS,
  FP_FILL_CLASS,
  FP_PANE_CLASS,
} from "./classes";

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const FilePreviewSplit = ({
  layout,
  source,
  preview,
  resizerLabel
}: {
  readonly layout: FilePreviewLayout;
  readonly source: ReactNode;
  readonly preview: ReactNode;
  readonly resizerLabel: string;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState(0.5);
  const showSource = layout !== "preview";
  const showPreview = layout !== "source";
  const split = layout === "split-horizontal" || layout === "split-vertical";
  const orientation = layout === "split-vertical" ? "vertical" : "horizontal";

  const onResizeMouseDown = (event: ReactMouseEvent<HTMLDivElement>): void => {
    if (split === false) {
      return;
    }
    event.preventDefault();
    const host = hostRef.current;
    if (host === null) {
      return;
    }
    const rect = host.getBoundingClientRect();
    const start = orientation === "vertical" ? event.clientX : event.clientY;
    const size = orientation === "vertical" ? rect.width : rect.height;
    const origin = ratio;
    const onMove = (moveEvent: MouseEvent): void => {
      const delta = orientation === "vertical"
        ? moveEvent.clientX - start
        : moveEvent.clientY - start;
      setRatio(clamp(origin + delta / Math.max(size, 1), 0.18, 0.82));
    };
    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ponytail: VS Code markdown preview is a separate webview editor; Zed
  // OpenPreview is a separate pane item. Neither unmounts the source editor
  // widget. Hide the source pane instead of returning a different tree.
  const first = `${Math.round(ratio * 1000) / 10}%`;
  const second = `${Math.round((1 - ratio) * 1000) / 10}%`;
  const style = split
    ? orientation === "vertical"
      ? { gridTemplateColumns: `${first} auto ${second}` }
      : { gridTemplateRows: `${first} auto ${second}` }
    : undefined;

  return (
    <div
      ref={hostRef}
      className={
        split
          ? `${FP_SPLIT_CLASS} ${orientation === "vertical" ? "lyra-file-preview-split-vertical" : "lyra-file-preview-split-horizontal"}`
          : FP_FILL_CLASS
      }
      style={style}
    >
      <div className={FP_PANE_CLASS} hidden={showSource === false}>
        {source}
      </div>
      {split ? (
        <PanelResizer
          orientation={orientation}
          ariaLabel={resizerLabel}
          onMouseDown={onResizeMouseDown}
        />
      ) : null}
      {showPreview ? (
        <div className={FP_PANE_CLASS}>{preview}</div>
      ) : null}
    </div>
  );
};
