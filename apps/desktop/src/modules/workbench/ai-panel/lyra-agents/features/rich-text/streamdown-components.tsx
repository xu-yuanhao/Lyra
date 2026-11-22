/**
 * Streamdown component overrides for Lyra.
 *
 * Ports the link click classification, image safety + local path rewriting, and
 * inline code click behavior from the old markdown-it/LyraDocument path to
 * streamdown's `components` prop. These overrides ensure the unified streamdown
 * renderer preserves Lyra's interaction semantics (open links in workbench,
 * classify file paths, rewrite local images, block unsafe image sources).
 */

import {
  Children,
  isValidElement,
  useCallback,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  type ReactNode
} from "react";

import { useData } from "../../data/DataProvider";
import {
  classifyActionTarget,
  imageAttachmentFromDataUrl,
  isFileOpenTarget
} from "./ActionTargets";
import { AdaptiveImage } from "../media";
import { imageAttachmentFromSrc } from "../media/layout";
import { WebsiteLinkIcon } from "../chat/page-citation-tab-icon";
import { websiteLinkLabel } from "../chat/web-link-display";
import {
  RT_MD_LINK_CLASS,
  RT_MD_URL_LINK_CLASS,
} from "./classes";

// ---- Image safety + local path rewrite (ported from @lyra/markdown-render) ----

const isSafeMarkdownImageSrc = (value: string): boolean => {
  const src = value.trim();
  if (src.length === 0 || src.startsWith("//")) {
    return false;
  }
  if (/^data:/iu.test(src)) {
    return /^data:image\/[a-z0-9.+-]+;base64,/iu.test(src);
  }
  const protocolMatch = /^([a-z][a-z0-9+.-]*):/iu.exec(src);
  if (protocolMatch === null) {
    return true;
  }
  return ["http", "https", "file", "lyra-file", "blob"].includes(
    protocolMatch[1]?.toLowerCase() ?? ""
  );
};

const isLocalFilePath = (src: string): boolean =>
  (src.startsWith("/") && !src.startsWith("//")) ||
  /^[A-Za-z]:[\\/]/.test(src) ||
  /^file:\/\//i.test(src);

const rewriteLocalImagePath = (src: string): string => {
  if (!isLocalFilePath(src)) return src;
  let filePath = src;
  if (/^file:\/\//i.test(src)) {
    try {
      filePath = decodeURIComponent(new URL(src).pathname);
    } catch {
      return src;
    }
  }
  return `lyra-file://preview?path=${encodeURIComponent(filePath)}`;
};

// ---- Hook: shared click handler ----

function useRichTextClickHandler(
  rootContains: (el: Element | null) => boolean
) {
  const {
    openUrlInWorkbench,
    openFileInWorkbench,
    revealPathInWorkbench,
    openImageInWorkbench,
    canOpenImageInWorkbench
  } = useData();

  return useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target === null) return;

      // Image click: open in workbench image viewer
      const image = target.closest("img");
      if (
        image instanceof HTMLImageElement &&
        rootContains(image)
      ) {
        const src = image.getAttribute("src") ?? image.currentSrc;
        const alt = image.getAttribute("alt") ?? null;
        const attachment = imageAttachmentFromDataUrl(src, alt) ?? {
          id: `markdown-image-${src}`,
          mediaType: "image/png",
          data: "",
          label: alt,
          source: src
        };
        if (canOpenImageInWorkbench(attachment)) {
          event.preventDefault();
          void openImageInWorkbench(attachment);
        }
        return;
      }

      // Link click: classify and route
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement && rootContains(anchor)) {
        const href = anchor.getAttribute("href") ?? "";
        const classified = classifyActionTarget(href);
        if (classified !== null) {
          event.preventDefault();
          if (classified.kind === "url") {
            void openUrlInWorkbench(classified.value, anchor.textContent ?? classified.label);
          } else if (isFileOpenTarget(classified)) {
            void openFileInWorkbench(classified.value);
          } else {
            void revealPathInWorkbench(classified.value);
          }
        }
        return;
      }

      // Inline code click: classify file paths / URLs
      const code = target.closest("code");
      if (
        code instanceof HTMLElement &&
        rootContains(code) &&
        code.closest("pre") === null
      ) {
        const classified = classifyActionTarget(code.textContent ?? "");
        if (classified === null) return;
        event.preventDefault();
        if (classified.kind === "url") {
          void openUrlInWorkbench(classified.value, classified.label);
        } else if (isFileOpenTarget(classified)) {
          void openFileInWorkbench(classified.value);
        } else {
          void revealPathInWorkbench(classified.value);
        }
      }
    },
    [
      canOpenImageInWorkbench,
      openFileInWorkbench,
      openImageInWorkbench,
      openUrlInWorkbench,
      revealPathInWorkbench,
      rootContains
    ]
  );
}

// ---- Exported hook for the root container ----

export function useLyraRichTextClickHandler(
  rootRef: { current: HTMLElement | null }
) {
  const rootContains = useCallback(
    (el: Element | null) => rootRef.current?.contains(el) === true,
    [rootRef]
  );
  return useRichTextClickHandler(rootContains);
}

// ---- Declarative link component ----

const isWhitespaceNode = (node: ReactNode): boolean =>
  typeof node === "string" && node.trim().length === 0;

const isImageElement = (node: ReactNode): boolean => {
  if (!isValidElement(node)) {
    return false;
  }
  const element = node as ReactElement<{
    src?: unknown;
    image?: { src?: unknown };
    node?: { tagName?: string };
  }>;
  if (element.type === "img") {
    return true;
  }
  if (typeof element.props.src === "string" && element.props.src.length > 0) {
    return true;
  }
  if (typeof element.props.image?.src === "string") {
    return true;
  }
  const tag = element.props.node?.tagName;
  return tag === "img" || tag === "IMG";
};

const isImageOnlyContent = (children: ReactNode): boolean => {
  const nodes = Children.toArray(children).filter((child) => !isWhitespaceNode(child));
  return nodes.length > 0 && nodes.every(isImageElement);
};

/**
 * Website text links use the shared inline-resource chip. Linked images stay
 * images: click already opens the workbench viewer, so a globe chip would lie.
 */
export function LyraLink({
  children,
  className,
  href = "",
  node: _node,
  ...props
}: ComponentProps<"a"> & { readonly node?: unknown }) {
  const target = classifyActionTarget(href);
  const isWebsite = target?.kind === "url" && /^https?:\/\//iu.test(target.value);
  if (isImageOnlyContent(children)) {
    return <>{children}</>;
  }
  const classes = [
    RT_MD_LINK_CLASS,
    isWebsite ? RT_MD_URL_LINK_CLASS : "",
    isWebsite ? "lyra-agents-inline-resource" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <a
      {...props}
      className={classes}
      href={href}
      title={isWebsite ? target.value : props.title}
      data-web-link-url={isWebsite ? target.value : undefined}
    >
      {isWebsite ? (
        <>
          <WebsiteLinkIcon pageUrl={target.value} />
          <span className="lyra-agents-citation-chip-preview-wrap">
            <span className="lyra-agents-citation-chip-preview">{websiteLinkLabel(target.value)}</span>
          </span>
        </>
      ) : children}
    </a>
  );
}

// ---- Exported components map ----

/**
 * Image component: rewrites local file paths to lyra-file:// and blocks
 * unsafe image sources (same logic as the old markdown-it image rule).
 */
export function LyraImage(props: ComponentProps<"img"> & {
  readonly node?: unknown;
}) {
  const { node: _node, src = "", alt } = props;
  if (!isSafeMarkdownImageSrc(src)) {
    return <span className="lyra-agents-md-blocked-image" />;
  }
  const rewritten = rewriteLocalImagePath(src);
  const label = typeof alt === "string" ? alt : "";
  return (
    <AdaptiveImage
      image={{
        id: `md-inline:${src}`,
        src: rewritten,
        ...(label.length > 0 ? { alt: label } : {}),
        attachment: imageAttachmentFromSrc(`md-inline:${src}`, src, label)
      }}
    />
  );
}
