import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { AppEmptyState, AppLoadingState } from "@renderer/ui/components";
import { t } from "@workbench/i18n";
import { LyraMarkdown } from "../ai-panel/lyra-agents/features/rich-text/LyraMarkdown";
import {
  detectHtmlPreviewPlan,
  fileExists,
  startHtmlPreviewCommand,
  type HtmlPreviewPlan
} from "./detect-html-preview";
import { filePreviewUrl, type FilePreviewKind } from "./kinds";
import {
  FP_FRAME_CLASS,
  FP_IMAGE_CLASS,
  FP_IMAGE_STAGE_CLASS,
  FP_MARKDOWN_CLASS,
  FP_EMPTY_CLASS,
} from "./classes";

const mermaidDocument = (content: string): string => {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return content;
  }
  return `\`\`\`mermaid\n${content}\n\`\`\``;
};

const MarkdownPreview = ({
  content,
  documentKey
}: {
  readonly content: string;
  readonly documentKey: string;
}) => (
  <LyraMarkdown
    arrangeMedia={false}
    className={FP_MARKDOWN_CLASS}
    content={content}
    documentKey={documentKey}
  />
);

const HtmlPreview = ({
  filePath,
  content
}: {
  readonly filePath: string;
  readonly content: string;
}) => {
  const [plan, setPlan] = useState<HtmlPreviewPlan | null>(null);
  const [frameUrl, setFrameUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPlan(null);
    setFrameUrl(null);
    void detectHtmlPreviewPlan(filePath).then((next) => {
      if (cancelled) {
        return;
      }
      setPlan(next);
      if (next.kind === "command") {
        void startHtmlPreviewCommand(next);
        setFrameUrl(next.url);
        return;
      }
      setFrameUrl(null);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  if (plan === null) {
    return <AppLoadingState title={t("editor.viewPreview")} />;
  }
  if (plan.kind === "command" && frameUrl !== null) {
    return (
      <iframe
        className={FP_FRAME_CLASS}
        title={t("editor.viewPreview")}
        src={frameUrl}
      />
    );
  }
  return (
    <iframe
      className={FP_FRAME_CLASS}
      title={t("editor.viewPreview")}
      sandbox="allow-scripts"
      srcDoc={content}
    />
  );
};

const siblingWithExtension = (filePath: string, extension: string): string => {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  const dot = filePath.lastIndexOf(".");
  if (dot <= slash) {
    return `${filePath}.${extension}`;
  }
  return `${filePath.slice(0, dot)}.${extension}`;
};

const PdfFrame = ({ filePath }: { readonly filePath: string }) => (
  <iframe
    className={FP_FRAME_CLASS}
    title={t("editor.viewPreview")}
    src={`lyra-file://preview?path=${encodeURIComponent(filePath)}`}
  />
);

const ImageFilePreview = ({
  filePath,
  contentType
}: {
  readonly filePath: string;
  readonly contentType?: string;
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef({ zoom: 1, offsetX: 0, offsetY: 0 });
  const dragRef = useRef<{
    readonly x: number;
    readonly y: number;
    readonly offsetX: number;
    readonly offsetY: number;
  } | null>(null);
  const [view, setView] = useState(viewRef.current);
  const src = filePreviewUrl(filePath, contentType);

  useEffect(() => {
    viewRef.current = { zoom: 1, offsetX: 0, offsetY: 0 };
    setView(viewRef.current);
  }, [filePath]);

  useEffect(() => {
    const stage = stageRef.current;
    if (stage === null) {
      return undefined;
    }
    const handleWheel = (event: WheelEvent): void => {
      const current = viewRef.current;
      event.preventDefault();
      event.stopPropagation();
      const nextZoom = Math.max(
        0.02,
        Math.min(64, current.zoom * Math.exp(Math.max(-120, Math.min(120, -event.deltaY)) * 0.002))
      );
      const factor = nextZoom / current.zoom;
      const rect = stage.getBoundingClientRect();
      const anchorX = event.clientX - rect.left - rect.width / 2;
      const anchorY = event.clientY - rect.top - rect.height / 2;
      const next = {
        zoom: nextZoom,
        offsetX: anchorX - (anchorX - current.offsetX) * factor,
        offsetY: anchorY - (anchorY - current.offsetY) * factor
      };
      viewRef.current = next;
      setView(next);
    };
    stage.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      stage.removeEventListener("wheel", handleWheel);
    };
  }, [filePath]);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      offsetX: viewRef.current.offsetX,
      offsetY: viewRef.current.offsetY
    };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const start = dragRef.current;
    if (start === null) {
      return;
    }
    event.preventDefault();
    const next = {
      ...viewRef.current,
      offsetX: start.offsetX + event.clientX - start.x,
      offsetY: start.offsetY + event.clientY - start.y
    };
    viewRef.current = next;
    setView(next);
  };
  const onPointerEnd = (): void => {
    dragRef.current = null;
  };

  return (
    <div
      ref={stageRef}
      className={FP_IMAGE_STAGE_CLASS}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <img
        className={FP_IMAGE_CLASS}
        alt=""
        src={src}
        draggable={false}
        style={{
          transform: `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.zoom})`
        }}
      />
    </div>
  );
};

const PaperPreview = ({
  filePath,
  content,
  kindExtension
}: {
  readonly filePath: string;
  readonly content: string;
  readonly kindExtension: string;
}) => {
  const [compiledPdfPath, setCompiledPdfPath] = useState<string | null>(null);
  const [resolved, setResolved] = useState(kindExtension === "pdf");

  useEffect(() => {
    if (kindExtension === "pdf") {
      setCompiledPdfPath(filePath);
      setResolved(true);
      return;
    }
    let cancelled = false;
    const candidate = siblingWithExtension(filePath, "pdf");
    setResolved(false);
    void fileExists(candidate).then((exists) => {
      if (cancelled) {
        return;
      }
      setCompiledPdfPath(exists ? candidate : null);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [filePath, kindExtension]);

  if (kindExtension === "pdf") {
    return <PdfFrame filePath={filePath} />;
  }
  if (resolved === false) {
    return <AppLoadingState title={t("editor.viewPreview")} />;
  }
  if (compiledPdfPath !== null) {
    return <PdfFrame filePath={compiledPdfPath} />;
  }
  return <MarkdownPreview content={content} documentKey={filePath} />;
};

export const FilePreviewPane = ({
  kind,
  filePath,
  content
}: {
  readonly kind: FilePreviewKind;
  readonly filePath: string;
  readonly content: string;
}) => {
  if (kind === "svg") {
    return <ImageFilePreview filePath={filePath} contentType="image/svg+xml" />;
  }
  if (kind === "image") {
    return <ImageFilePreview filePath={filePath} />;
  }
  if (kind === "html") {
    return <HtmlPreview filePath={filePath} content={content} />;
  }
  if (kind === "paper") {
    const extension = filePath.toLowerCase().endsWith(".pdf") ? "pdf" : "tex";
    return (
      <PaperPreview
        filePath={filePath}
        content={content}
        kindExtension={extension}
      />
    );
  }
  if (kind === "mermaid") {
    return (
      <MarkdownPreview
        content={mermaidDocument(content)}
        documentKey={filePath}
      />
    );
  }
  if (content.trim().length === 0) {
    return (
      <AppEmptyState
        className={FP_EMPTY_CLASS}
        title={t("editor.viewPreview")}
      />
    );
  }
  return <MarkdownPreview content={content} documentKey={filePath} />;
};
