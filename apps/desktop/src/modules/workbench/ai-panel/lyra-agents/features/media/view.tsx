import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SyntheticEvent
} from "react";

import type { AgentImageAttachment } from "../../core/types";
import { useOptionalData } from "../../data/DataProvider";
import { AppButton } from "@renderer/ui/components";
import { t } from "@workbench/i18n";
import {
  AdaptiveImageLayers,
  imagePreviewSource,
  imagePreviewSourceFromSource,
  isImageFileReference
} from "../rich-text/ActionTargets";
import {
  applyImageSizes,
  aspectKindFromSize,
  canFillWidth,
  figureCopy,
  groupMediaCardRuns,
  isBannerImage,
  isCompactIntrinsicImage,
  mediaCardColumnCount,
  mediaTypeFromSrc,
  resolveMediaLayout,
  type MediaImage,
  type MediaToken,
  type ResolvedMediaSegment
} from "./layout";

const ASPECT_CLASS: Record<string, string> = {
  ultraWide: "is-ultra-wide",
  landscape: "is-landscape",
  squareLike: "is-square",
  portrait: "is-portrait",
  ultraTall: "is-ultra-tall"
};

export const displaySrcForMediaImage = (
  image: MediaImage,
  workingDir?: string | null
): string | undefined => {
  if (image.attachment !== undefined) {
    return imagePreviewSource(image.attachment, workingDir)
      ?? imagePreviewSourceFromSource(image.src, image.attachment.mediaType, workingDir);
  }
  const fromSource = imagePreviewSourceFromSource(image.src, mediaTypeFromSrc(image.src), workingDir);
  if (fromSource !== undefined) {
    return fromSource;
  }
  if (image.src.length === 0 || isImageFileReference(image.src)) {
    return undefined;
  }
  return image.src;
};

export const mediaImageFromAttachment = (image: AgentImageAttachment): MediaImage => {
  const src = imagePreviewSource(image) ?? image.source?.trim() ?? "";
  const width = image.width ?? undefined;
  const height = image.height ?? undefined;
  return {
    id: image.id,
    src,
    attachment: image,
    ...(image.label !== undefined && image.label !== null && image.label.length > 0
      ? { alt: image.label }
      : {}),
    ...(width !== undefined && width > 0 ? { intrinsicWidth: width } : {}),
    ...(height !== undefined && height > 0 ? { intrinsicHeight: height } : {})
  };
};

const attachmentsInGroup = (group: readonly MediaImage[]): AgentImageAttachment[] => {
  const attachments: AgentImageAttachment[] = [];
  for (const item of group) {
    if (item.attachment !== undefined) {
      attachments.push(item.attachment);
    }
  }
  return attachments;
};

export function AdaptiveImage({
  image,
  group,
  index = 0,
  className,
  presentation = "natural",
  fill = false,
  containerWidth = 720,
  onDimensions
}: {
  readonly image: MediaImage;
  readonly group?: readonly MediaImage[];
  readonly index?: number;
  readonly className?: string;
  readonly presentation?: "frame" | "natural";
  readonly fill?: boolean;
  readonly containerWidth?: number;
  readonly onDimensions?: (id: string, width: number, height: number) => void;
}) {
  const data = useOptionalData();
  const workingDir = data?.session.workingDir;
  const [loadedSize, setLoadedSize] = useState<{ width: number; height: number } | null>(null);
  const displaySrc = displaySrcForMediaImage(image, workingDir);
  const width = loadedSize?.width ?? image.intrinsicWidth;
  const height = loadedSize?.height ?? image.intrinsicHeight;
  const kind = aspectKindFromSize(width, height);
  const sizedImage = {
    ...image,
    ...(width === undefined ? {} : { intrinsicWidth: width }),
    ...(height === undefined ? {} : { intrinsicHeight: height })
  };
  const banner = isBannerImage(sizedImage);
  const bleed = presentation === "natural" && fill === false && banner && canFillWidth(sizedImage, containerWidth);
  const budget = presentation === "natural" && fill === false && banner && canFillWidth(sizedImage, containerWidth) === false;
  const small = presentation === "natural" && isCompactIntrinsicImage(sizedImage);
  const viewerGroup = group ?? [image];
  const attachment = image.attachment;
  const canOpen = attachment !== undefined
    && data !== null
    && data.canOpenImageInWorkbench(attachment);
  const pending = width === undefined || height === undefined;
  const framed = presentation === "frame";
  const classes = [
    "lyra-agents-action-image-button",
    "lyra-agents-adaptive-image",
    framed ? "is-frame" : "is-natural",
    pending ? "is-pending" : "",
    small ? "is-small" : "",
    budget ? "is-budget" : "",
    fill || bleed ? "is-ultra-wide" : (kind === null ? "" : (ASPECT_CLASS[kind] ?? "")),
    className
  ].filter((value): value is string => typeof value === "string" && value.length > 0).join(" ");

  const handleLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const node = event.currentTarget;
    if (node.naturalWidth <= 0 || node.naturalHeight <= 0) {
      return;
    }
    setLoadedSize((current) => {
      if (current?.width === node.naturalWidth && current.height === node.naturalHeight) {
        return current;
      }
      return { width: node.naturalWidth, height: node.naturalHeight };
    });
    onDimensions?.(image.id, node.naturalWidth, node.naturalHeight);
  };

  const open = () => {
    if (data === null || attachment === undefined || !canOpen) {
      return;
    }
    const groupAttachments = attachmentsInGroup(viewerGroup);
    void (groupAttachments.length > 1
      ? data.openImageInWorkbench(attachment, { group: groupAttachments, index })
      : data.openImageInWorkbench(attachment)
    ).catch(() => undefined);
  };

  const imageNode = displaySrc === undefined
    ? (
        <span className="lyra-agents-action-image-placeholder-label">
          {image.alt ?? t("tool.imageAttachment")}
        </span>
      )
    : (
        <AdaptiveImageLayers
          src={displaySrc}
          alt={image.alt ?? ""}
          framed={framed}
          onLoad={handleLoad}
        />
      );

  if (!canOpen) {
    if (displaySrc === undefined) {
      return null;
    }
    return (
      <span className={classes}>
        {imageNode}
      </span>
    );
  }

  return (
    <AppButton
      variant="ghost"
      type="button"
      className={`${classes}${displaySrc === undefined ? " lyra-agents-action-image-placeholder" : ""}`}
      title={t("tool.openImageInWorkbench")}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
    >
      {imageNode}
    </AppButton>
  );
}

export function SideFlow({
  text,
  image,
  order,
  group,
  index = 0,
  presentation = "natural",
  wrap = false,
  columnPair = false,
  fill = false,
  containerWidth = 720,
  renderText,
  onDimensions
}: {
  readonly text: string;
  readonly image: MediaImage;
  readonly order: "text-image" | "image-text";
  readonly group?: readonly MediaImage[];
  readonly index?: number;
  readonly presentation?: "frame" | "natural";
  readonly wrap?: boolean;
  readonly columnPair?: boolean;
  readonly fill?: boolean;
  readonly containerWidth?: number;
  readonly renderText: (text: string) => ReactNode;
  readonly onDimensions?: (id: string, width: number, height: number) => void;
}) {
  const kind = aspectKindFromSize(image.intrinsicWidth, image.intrinsicHeight);
  const banner = presentation === "natural" && (kind === "ultraWide" || isBannerImage(image));
  const caption = image.alt !== undefined && image.alt.length > 0 && image.alt !== text.trim()
    ? <figcaption>{image.alt}</figcaption>
    : null;
  const textNode = text.trim().length === 0
    ? null
    : <div className="lyra-agents-side-flow-text">{renderText(text)}</div>;
  const mediaNode = (
    <div className="lyra-agents-side-flow-media">
      <AdaptiveImage
        image={image}
        group={group ?? [image]}
        index={index}
        presentation={presentation}
        fill={fill}
        containerWidth={containerWidth}
        {...(onDimensions === undefined ? {} : { onDimensions })}
      />
    </div>
  );
  return (
    <figure className={[
      "lyra-agents-side-flow",
      `lyra-agents-side-flow-${order}`,
      presentation === "natural" ? "is-natural" : "",
      banner ? "is-banner" : "",
      wrap ? "is-wrap" : "",
      columnPair ? "is-column-pair" : ""
    ].filter((value) => value.length > 0).join(" ")}>
      {order === "text-image" ? textNode : null}
      {mediaNode}
      {order === "image-text" ? textNode : null}
      {caption}
    </figure>
  );
}

export function MediaStack({
  images,
  onDimensions
}: {
  readonly images: readonly MediaImage[];
  readonly onDimensions?: (id: string, width: number, height: number) => void;
}) {
  const data = useOptionalData();
  const layers = images.slice(0, 3);
  const front = images[0];
  const canOpen = front?.attachment !== undefined
    && data !== null
    && data.canOpenImageInWorkbench(front.attachment);

  const open = () => {
    if (data === null || front?.attachment === undefined || !canOpen) {
      return;
    }
    const groupAttachments = attachmentsInGroup(images);
    void (groupAttachments.length > 0
      ? data.openImageInWorkbench(front.attachment, { group: groupAttachments, index: 0 })
      : data.openImageInWorkbench(front.attachment)
    ).catch(() => undefined);
  };

  return (
    <AppButton
      variant="ghost"
      type="button"
      className="lyra-agents-action-image-button lyra-agents-media-stack"
      title={t("tool.openImageInWorkbench")}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
    >
      {[...layers].reverse().map((image, reverseIndex) => {
        const depth = layers.length - 1 - reverseIndex;
        const src = displaySrcForMediaImage(image, data?.session.workingDir);
        return (
          <span
            key={image.id}
            className={`lyra-agents-media-stack-layer lyra-agents-media-stack-layer-${depth}`}
          >
            {src === undefined ? null : (
              <img
                src={src}
                alt=""
                decoding="async"
                loading="lazy"
                referrerPolicy="no-referrer"
                onLoad={(event) => {
                  const node = event.currentTarget;
                  onDimensions?.(image.id, node.naturalWidth, node.naturalHeight);
                }}
              />
            )}
          </span>
        );
      })}
      <span className="lyra-agents-media-stack-count">{images.length}</span>
    </AppButton>
  );
}

const renderSegment = (
  segment: ResolvedMediaSegment,
  renderText: (segment: Extract<ResolvedMediaSegment, { type: "text" } | { type: "side-flow" }>) => ReactNode,
  onDimensions: (id: string, width: number, height: number) => void,
  presentation: "frame" | "natural",
  fill = false,
  containerWidth = 720
): ReactNode => {
  switch (segment.type) {
    case "text":
      return (
        <div key={segment.id} className="lyra-agents-media-text">
          {renderText(segment)}
        </div>
      );
    case "single":
      return (
        <figure key={segment.id} className="lyra-agents-message-image lyra-agents-message-image-agent">
          <AdaptiveImage
            image={segment.image}
            group={segment.group}
            index={segment.index}
            presentation={presentation}
            fill={fill}
            containerWidth={containerWidth}
            onDimensions={onDimensions}
          />
          {segment.image.alt !== undefined && segment.image.alt.length > 0 ? (
            <figcaption>{segment.image.alt}</figcaption>
          ) : null}
        </figure>
      );
    case "side-flow": {
      const copy = figureCopy(segment);
      return (
        <SideFlow
          key={segment.id}
          text={copy}
          image={segment.image}
          order={segment.order}
          group={segment.group}
          presentation={presentation}
          wrap={segment.wrap}
          columnPair={segment.columnPair}
          fill={fill}
          containerWidth={containerWidth}
          renderText={() => renderText({ ...segment, text: copy })}
          onDimensions={onDimensions}
        />
      );
    }
    case "stack":
      return (
        <MediaStack
          key={segment.id}
          images={segment.images}
          onDimensions={onDimensions}
        />
      );
    default:
      return null;
  }
};

function MediaCards({
  count,
  slotRatio,
  children
}: {
  readonly count: number;
  readonly slotRatio?: { readonly width: number; readonly height: number };
  readonly children: ReactNode;
}) {
  const nodeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (node === null) {
      return;
    }
    const apply = () => {
      const cols = mediaCardColumnCount(node.clientWidth, count);
      const template = `repeat(${cols}, minmax(0, 1fr))`;
      if (node.style.gridTemplateColumns !== template) {
        node.style.gridTemplateColumns = template;
      }
      if (slotRatio === undefined) {
        return;
      }
      const ratio = `${slotRatio.width} / ${slotRatio.height}`;
      if (node.style.getPropertyValue("--lyra-agents-image-slot-ratio") !== ratio) {
        node.style.setProperty("--lyra-agents-image-slot-ratio", ratio);
      }
    };
    apply();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [count, slotRatio]);

  return (
    <div ref={nodeRef} className="lyra-agents-media-cards">
      {children}
    </div>
  );
}

export function ChatMediaLayout({
  tokens,
  renderText
}: {
  readonly tokens: readonly MediaToken[];
  readonly renderText: (
    segment: Extract<ResolvedMediaSegment, { type: "text" } | { type: "side-flow" }>
  ) => ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(720);
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>({});
  const sizedTokens = useMemo(() => applyImageSizes(tokens, sizes), [sizes, tokens]);
  const segments = useMemo(
    () => resolveMediaLayout(sizedTokens, { containerWidth }),
    [sizedTokens, containerWidth]
  );
  const runs = useMemo(
    () => groupMediaCardRuns(segments, { containerWidth }),
    [segments, containerWidth]
  );
  const onDimensions = useCallback((id: string, width: number, height: number) => {
    setSizes((current) => {
      const existing = current[id];
      if (existing?.width === width && existing.height === height) {
        return current;
      }
      return {
        ...current,
        [id]: { width, height }
      };
    });
  }, []);

  useLayoutEffect(() => {
    const node = rootRef.current;
    if (node === null) {
      return;
    }
    const apply = () => {
      const width = node.clientWidth;
      if (width > 0) {
        setContainerWidth(width);
      }
    };
    apply();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={rootRef} className="lyra-agents-media-layout">
      {runs.map((run) => {
        if (run.type === "cards") {
          return (
            <MediaCards
              key={run.id}
              count={run.segments.length}
              {...(run.slotRatio === undefined ? {} : { slotRatio: run.slotRatio })}
            >
              {run.segments.map((segment) => renderSegment(
                segment,
                renderText,
                onDimensions,
                "frame",
                false,
                containerWidth
              ))}
            </MediaCards>
          );
        }
        if (run.type === "figure-row") {
          const group = run.segments.map((segment) => segment.image);
          return (
            <div
              key={run.id}
              className={`lyra-agents-figure-row ${run.segments.length === 1 ? "is-single" : "is-multi"}`}
            >
              {run.segments.map((segment, index) => {
                if (segment.type !== "side-flow") {
                  return renderSegment(
                    { ...segment, group, index },
                    renderText,
                    onDimensions,
                    "natural",
                    false,
                    containerWidth
                  );
                }
                const copy = figureCopy(segment);
                return (
                  <SideFlow
                    key={segment.id}
                    text={copy}
                    image={segment.image}
                    order={run.segments.length > 1 ? "image-text" : segment.order}
                    group={group}
                    index={index}
                    presentation="natural"
                    wrap={false}
                    columnPair={run.segments.length === 1 && segment.columnPair}
                    fill={false}
                    containerWidth={containerWidth}
                    renderText={() => renderText({ ...segment, text: copy })}
                    onDimensions={onDimensions}
                  />
                );
              })}
            </div>
          );
        }
        return renderSegment(run.segment, renderText, onDimensions, "natural", false, containerWidth);
      })}
    </div>
  );
}
