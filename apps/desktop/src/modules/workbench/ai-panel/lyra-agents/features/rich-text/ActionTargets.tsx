import { useState, type ReactNode, type SyntheticEvent } from "react";

import type { AgentImageAttachment, ToolActionTarget } from "../../core/types";
import { parseWorkbenchPathTarget } from "../../../lyra-agent-data-provider-runtime";
import { useData } from "../../data/DataProvider";
import { AppButton } from "@renderer/ui/components";
import { t } from "@workbench/i18n";
import {
  RT_ACTION_TEXT_LINK_CLASS,
  RT_ACTION_TEXT_LINK_SECRET_CLASS,
  RT_TOOL_ACTION_TARGETS_CLASS,
} from "./classes";
import { ACTION_IMAGE_BUTTON_CLASS, ACTION_IMAGE_PLACEHOLDER_CLASS, ACTION_IMAGE_PLACEHOLDER_LABEL_CLASS, ADAPTIVE_IMAGE_CLASS } from "../media/classes";

export type ActionTarget = ToolActionTarget;

type TextSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "target"; readonly target: ActionTarget };

const URL_PATTERN = "(?:https?:\\/\\/|www\\.|localhost(?::\\d+)?(?:\\/|(?=[\\s),.;!?，。；！？]|$)))[^\\s<>\"'`]*";
const FILE_URL_PATTERN = "file:\\/\\/[^\\s<>\"'`]+";
const ABSOLUTE_PATH_PATTERN = "\\/(?:Users|Volumes|tmp|var|private|opt|etc|home|Applications)\\/[^\\s<>\"'`]+";
const HOME_PATH_PATTERN = "~\\/[^\\s<>\"'`]+";
const PROJECT_PATH_PATTERN = "(?:(?:\\.{1,2}\\/)|(?:apps|crates|web|scripts|packages|vendor|docs|target|参考)\\/)[^\\s<>\"'`]+";
const BARE_FILE_PATTERN = "(?:README\\.md|Cargo\\.toml|package\\.json|pnpm-lock\\.yaml|tsconfig\\.json|vite\\.config\\.[cm]?[jt]s|[A-Za-z0-9_.-]+\\.(?:ts|tsx|js|jsx|json|rs|md|mdx|css|scss|html|png|jpe?g|gif|webp|svg|avif|heic|toml|yaml|yml|lock))(?:[:#][^\\s<>\"'`]+)?";

const ACTION_TOKEN_PATTERN = new RegExp(
  [URL_PATTERN, FILE_URL_PATTERN, ABSOLUTE_PATH_PATTERN, HOME_PATH_PATTERN, PROJECT_PATH_PATTERN, BARE_FILE_PATTERN].join("|"),
  "giu"
);

const IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/iu;
const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|gif|webp|bmp|ico|tiff?|svg|avif|heic|heif|jxl|exr|hdr|dpx|dds|tga|psd|psb|fits?|dcm|dicom|cr2|nef|arw|dng|orf|raf|rw2)(?=$|[:#?])/iu;
const CONFIG_BASENAME_PATTERN = /^(?:README\.md|Cargo\.toml|package\.json|pnpm-lock\.yaml|tsconfig\.json|vite\.config\.[cm]?[jt]s)$/iu;
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9]{1,12}(?=$|[:#?])/u;

const stripOuterPunctuation = (value: string): string => {
  let result = value.trim();
  while (/^[([{"'“‘]/u.test(result)) {
    result = result.slice(1);
  }
  while (/[)\].,;:!?，。；：！？、"'”’}]$/u.test(result)) {
    result = result.slice(0, -1);
  }
  return result;
};

const normalizeUrl = (value: string): string => {
  if (/^www\./iu.test(value)) {
    return `https://${value}`;
  }
  if (/^localhost(?::\d+)?(?:\/|$)/iu.test(value)) {
    return `http://${value}`;
  }
  return value;
};

const pathWithoutLocation = (value: string): string =>
  value
    .replace(/#L\d+(?:-L\d+)?$/iu, "")
    .replace(/:\d+(?::\d+)?$/u, "");

const pathBasename = (value: string): string => {
  const normalized = pathWithoutLocation(value.trim()).replace(/\\/g, "/").replace(/\/+$/u, "");
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
};

export const isFileOpenTarget = (target: ActionTarget): boolean => {
  if (target.kind !== "file") {
    return false;
  }
  const basename = pathBasename(target.value);
  return CONFIG_BASENAME_PATTERN.test(basename) || FILE_EXTENSION_PATTERN.test(basename);
};

export const isProbablyTruncatedFileReference = (value: string): boolean => {
  const candidate = stripOuterPunctuation(value);
  return (
    candidate.startsWith(".../")
    || candidate.startsWith("…/")
    || candidate.includes("/.../")
    || candidate.includes("/…/")
  );
};

export const isLocalFileReference = (value: string): boolean => {
  const candidate = stripOuterPunctuation(value);
  if (candidate.length === 0) {
    return false;
  }
  if (isProbablyTruncatedFileReference(candidate)) {
    return false;
  }
  if (/^https?:\/\//iu.test(candidate) || /^www\./iu.test(candidate)) {
    return false;
  }
  if (/^file:\/\//iu.test(candidate)) {
    return true;
  }
  if (/^(?:\/|~\/|\.{1,2}\/|[A-Za-z]:[\\/])/u.test(candidate)) {
    return true;
  }
  if (/^(?:apps|crates|web|scripts|packages|vendor|docs|target|参考)\//u.test(candidate)) {
    return true;
  }
  const withoutLocation = pathWithoutLocation(candidate);
  if (CONFIG_BASENAME_PATTERN.test(withoutLocation)) {
    return true;
  }
  return withoutLocation.includes("/") && FILE_EXTENSION_PATTERN.test(withoutLocation);
};

export const classifyActionTarget = (value: string): ActionTarget | null => {
  const label = stripOuterPunctuation(value);
  if (label.length === 0) {
    return null;
  }
  if (/^(?:https?:\/\/|www\.|localhost(?::\d+)?(?:\/|$))/iu.test(label)) {
    return {
      kind: "url",
      label,
      value: normalizeUrl(label)
    };
  }
  if (isLocalFileReference(label)) {
    return {
      kind: "file",
      label,
      value: label
    };
  }
  return null;
};

const isMatchInsideEllipsisPath = (
  source: string,
  matchIndex: number,
  raw: string
): boolean =>
  raw.startsWith("../")
  && matchIndex > 0
  && source[matchIndex - 1] === ".";

const isRemoteOrDataImageSrc = (value: string): boolean =>
  /^(?:https?:\/\/|www\.|localhost(?::\d+)?(?:\/|$)|data:)/iu.test(value)
  || (/^[a-z][a-z0-9+.-]*:/iu.test(value)
    && !/^file:/iu.test(value)
    && !/^[A-Za-z]:[\\/]/u.test(value));

const isAbsoluteFsPath = (value: string): boolean =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value);

export const isImageFileReference = (value: string): boolean => {
  const candidate = stripOuterPunctuation(value);
  if (candidate.length === 0 || isRemoteOrDataImageSrc(candidate)) {
    return false;
  }
  return IMAGE_EXTENSION_PATTERN.test(pathWithoutLocation(candidate));
};

export const imageAttachmentFromDataUrl = (
  src: string,
  label?: string | null
): AgentImageAttachment | null => {
  const match = IMAGE_DATA_URL_PATTERN.exec(src.trim());
  if (match === null) {
    return null;
  }
  const data = (match[2] ?? "").trim();
  if (data.length === 0) {
    return null;
  }
  return {
    id: `inline-image-${Date.now().toString(36)}`,
    mediaType: match[1] ?? "image/png",
    data,
    label: label ?? null,
    source: "inline-data-url"
  };
};

const imageAttachmentFromActionTarget = (
  target: ActionTarget | null,
  label?: string | null
): AgentImageAttachment | null => {
  if (target === null) {
    return null;
  }
  if (target.kind === "file" && !IMAGE_EXTENSION_PATTERN.test(pathWithoutLocation(target.value))) {
    return null;
  }
  return {
    id: `image-source-${target.value}`,
    mediaType: "image/png",
    data: "",
    label: label ?? target.label,
    source: target.value
  };
};

const filePathFromPreviewSource = (source: string): string => {
  const trimmed = source.trim();
  if (!/^file:\/\//iu.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    const host = url.hostname.length > 0 && url.hostname !== "localhost"
      ? `/${url.hostname}`
      : "";
    const pathname = decodeURIComponent(url.pathname);
    const filePath = `${host}${pathname}`;
    return filePath.replace(/^\/([A-Za-z]:[\\/])/u, "$1");
  } catch {
    return trimmed;
  }
};

const localImagePreviewSource = (
  source: string,
  mediaType = "image/png",
  workingDir?: string | null
): string | undefined => {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (/^lyra-file:\/\//iu.test(trimmed)) {
    return trimmed;
  }
  if (!isImageFileReference(trimmed)) {
    return undefined;
  }
  const filePath = filePathFromPreviewSource(trimmed);
  const resolved = parseWorkbenchPathTarget(filePath, workingDir)?.path ?? filePath;
  if (!isAbsoluteFsPath(resolved)) {
    return undefined;
  }
  const contentType = mediaType.trim().toLowerCase().startsWith("image/")
    ? mediaType
    : "image/png";
  return `lyra-file://preview?path=${encodeURIComponent(resolved)}&contentType=${encodeURIComponent(contentType)}`;
};

export const imagePreviewSourceFromSource = (
  source: string,
  mediaType = "image/png",
  workingDir?: string | null
): string | undefined => {
  const trimmed = source.trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  if (IMAGE_DATA_URL_PATTERN.test(trimmed)) {
    return trimmed;
  }
  const localPreview = localImagePreviewSource(trimmed, mediaType, workingDir);
  if (localPreview !== undefined) {
    return localPreview;
  }
  if (/^www\./iu.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^localhost(?::\d+)?(?:\/|$)/iu.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^https?:\/\//iu.test(trimmed)) {
    return trimmed;
  }
  return undefined;
};

export const imagePreviewSource = (
  image: AgentImageAttachment,
  workingDir?: string | null
): string | undefined => {
  const mediaType = image.mediaType.trim().toLowerCase();
  if (mediaType.startsWith("image/") && (image.data ?? "").trim().length > 0) {
    return `data:${image.mediaType};base64,${image.data}`;
  }
  const source = image.source?.trim() ?? "";
  return imagePreviewSourceFromSource(source, image.mediaType, workingDir);
};

export const splitActionText = (text: string): readonly TextSegment[] => {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(ACTION_TOKEN_PATTERN)) {
    const raw = match[0] ?? "";
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({ kind: "text", text: text.slice(lastIndex, index) });
    }
    const target = isMatchInsideEllipsisPath(text, index, raw)
      ? null
      : classifyActionTarget(raw);
    if (target === null) {
      segments.push({ kind: "text", text: raw });
    } else {
      segments.push({ kind: "target", target });
    }
    lastIndex = index + raw.length;
  }
  if (lastIndex < text.length) {
    segments.push({ kind: "text", text: text.slice(lastIndex) });
  }
  return segments;
};

export function ActionText({ text }: { readonly text: string }) {
  const { openUrlInWorkbench, openFileInWorkbench, revealPathInWorkbench } = useData();
  const segments = splitActionText(text);

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          return <span key={index}>{segment.text}</span>;
        }
        const { target } = segment;
        const open = () => {
          if (target.kind === "url") {
            void openUrlInWorkbench(target.value, target.label).catch(() => undefined);
          } else if (isFileOpenTarget(target)) {
            void openFileInWorkbench(target.value).catch(() => undefined);
          } else {
            void revealPathInWorkbench(target.value).catch(() => undefined);
          }
        };
        return (
          <AppButton variant="ghost" size="sm"
            key={index}
            type="button"
            className={`${RT_ACTION_TEXT_LINK_CLASS} action-text-link-${target.kind}`}
            title={target.value}
            onClick={open}
          >
            {target.label}
          </AppButton>
        );
      })}
    </>
  );
}

export function ActionTargetButton({
  target,
  className,
  children
}: {
  readonly target: ActionTarget;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}) {
  const {
    openUrlInWorkbench,
    openFileInWorkbench,
    revealPathInWorkbench,
    revealSensitiveValueToUser
  } = useData();
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = () => {
    if (target.kind === "secret") {
      if (target.secretRef === undefined) return;
      setBusy(true);
      void revealSensitiveValueToUser(target.secretRef)
        .then((value) => setRevealedValue(value))
        .finally(() => setBusy(false));
      return;
    }
    if (target.kind === "url") {
      void openUrlInWorkbench(target.value, target.label).catch(() => undefined);
    } else if (isFileOpenTarget(target)) {
      void openFileInWorkbench(target.value).catch(() => undefined);
    } else {
      void revealPathInWorkbench(target.value).catch(() => undefined);
    }
  };
  return (
    <AppButton variant="ghost" size="sm"
      type="button"
      className={className ?? `${RT_ACTION_TEXT_LINK_CLASS} action-text-link-${target.kind}`}
      title={target.value}
      onClick={open}
    >
      {target.kind === "secret" && revealedValue !== null
        ? revealedValue
        : children ?? (busy ? "Loading..." : target.label)}
    </AppButton>
  );
}

export function ActionTargetList({
  targets,
  className
}: {
  readonly targets: readonly ToolActionTarget[] | undefined;
  readonly className?: string | undefined;
}) {
  const {
    openUrlInWorkbench,
    openFileInWorkbench,
    openImageInWorkbench,
    canOpenImageInWorkbench,
    revealSensitiveValueToUser
  } = useData();
  const openableTargets = (targets ?? []).filter((target) => {
    if (target.kind === "secret") {
      return target.secretRef !== undefined;
    }
    if (target.kind === "url") return target.value.trim().length > 0;
    if ((target.mediaType ?? "").toLowerCase().startsWith("image/")) {
      return canOpenImageInWorkbench({
        id: `tool-target-${target.value}`,
        mediaType: target.mediaType ?? "image/png",
        data: "",
        label: target.label,
        source: target.value,
        width: target.width ?? null,
        height: target.height ?? null
      });
    }
    return target.value.trim().length > 0;
  });
  if (openableTargets.length === 0) {
    return null;
  }
  return (
    <div className={className ?? RT_TOOL_ACTION_TARGETS_CLASS}>
      {openableTargets.map((target) => {
        const open = () => {
          if (target.kind === "secret") {
            return;
          }
          if ((target.mediaType ?? "").toLowerCase().startsWith("image/")) {
            void openImageInWorkbench({
              id: `tool-target-${target.value}`,
              mediaType: target.mediaType ?? "image/png",
              data: "",
              label: target.label,
              source: target.value,
              width: target.width ?? null,
              height: target.height ?? null
            }).catch(() => undefined);
            return;
          }
          if (target.kind === "url") {
            void openUrlInWorkbench(target.value, target.label).catch(() => undefined);
            return;
          }
          void openFileInWorkbench(target.value).catch(() => undefined);
        };
        if (target.kind === "secret") {
          return (
            <SecretActionTargetButton
              key={`${target.kind}:${target.value}`}
              target={target}
              revealSensitiveValueToUser={revealSensitiveValueToUser}
            />
          );
        }
        return (
          <AppButton variant="ghost" size="sm"
            key={`${target.kind}:${target.value}`}
            type="button"
            className={`${RT_ACTION_TEXT_LINK_CLASS} action-text-link-${target.kind}`}
            title={target.value}
            onClick={open}
          >
            {target.label}
          </AppButton>
        );
      })}
    </div>
  );
}

function SecretActionTargetButton({
  target,
  revealSensitiveValueToUser
}: {
  readonly target: ToolActionTarget;
  readonly revealSensitiveValueToUser: ReturnType<typeof useData>["revealSensitiveValueToUser"];
}) {
  const [revealedValue, setRevealedValue] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = target.secretRef;

  const reveal = () => {
    if (ref === undefined) return;
    setBusy(true);
    void revealSensitiveValueToUser(ref)
      .then((value) => setRevealedValue(value))
      .finally(() => setBusy(false));
  };

  const copy = () => {
    if (revealedValue === null) {
      return;
    }
    void navigator.clipboard.writeText(revealedValue).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <span className="action-text-secret">
      <AppButton variant="ghost" size="sm"
        type="button"
        className={`${RT_ACTION_TEXT_LINK_CLASS} ${RT_ACTION_TEXT_LINK_SECRET_CLASS}`}
        title={target.value}
        onClick={revealedValue === null ? reveal : copy}
        disabled={busy || ref === undefined}
      >
        {revealedValue === null
          ? (busy ? "Loading..." : target.label)
          : (copied ? "Copied" : revealedValue)}
      </AppButton>
    </span>
  );
}

export function AdaptiveImageLayers({
  src,
  alt,
  onLoad,
  framed = true
}: {
  readonly src: string;
  readonly alt: string;
  readonly onLoad?: (event: SyntheticEvent<HTMLImageElement>) => void;
  readonly framed?: boolean;
}) {
  const photo = (
    <img
      className="lyra-agents-adaptive-image-photo"
      src={src}
      alt={alt}
      decoding="async"
      loading="lazy"
      referrerPolicy="no-referrer"
      onLoad={onLoad}
    />
  );
  if (!framed) {
    return photo;
  }
  return (
    <>
      <span className="lyra-agents-adaptive-image-fill" aria-hidden="true">
        <img
          src={src}
          alt=""
          decoding="async"
          loading="lazy"
          referrerPolicy="no-referrer"
          // Lowercase on purpose: React 18 renders unknown camelCase props
          // with a dev warning, and the HTML attribute is case-insensitive.
          {...{ fetchpriority: "low" }}
        />
      </span>
      {photo}
    </>
  );
}

export function ClickableImage({
  src,
  alt,
  image,
  className,
  allowTargetFallback = true
}: {
  readonly src: string | undefined;
  readonly alt?: string | null | undefined;
  readonly image?: AgentImageAttachment | null | undefined;
  readonly className?: string | undefined;
  readonly allowTargetFallback?: boolean | undefined;
}) {
  const {
    openFileInWorkbench,
    openImageInWorkbench,
    canOpenImageInWorkbench,
    session
  } = useData();
  const displaySrc = src === undefined
    ? (image === undefined || image === null ? undefined : imagePreviewSource(image, session.workingDir))
    : (localImagePreviewSource(src, image?.mediaType, session.workingDir)
      ?? (isImageFileReference(src) ? undefined : src));
  const dataImage = displaySrc === undefined
    ? null
    : imageAttachmentFromDataUrl(displaySrc, alt ?? null);
  const target = src === undefined || allowTargetFallback === false
    ? null
    : classifyActionTarget(src);
  const targetImage = imageAttachmentFromActionTarget(target, alt ?? null);
  const imageToOpen = image ?? dataImage ?? targetImage;
  const canOpenImage = imageToOpen !== null && canOpenImageInWorkbench(imageToOpen);
  const canOpenTarget = imageToOpen === null && target !== null && target.kind !== "url";
  const canOpen = canOpenImage || canOpenTarget;

  const open = () => {
    if (canOpenImage && imageToOpen !== null) {
      void openImageInWorkbench(imageToOpen).catch(() => undefined);
      return;
    }
    if (target?.kind === "file") {
      void openFileInWorkbench(target.value).catch(() => undefined);
    }
  };

  if (displaySrc === undefined) {
    if (!canOpenImage || imageToOpen === null) {
      return null;
    }
    return (
      <AppButton variant="ghost" size="sm"
        type="button"
        className={[ACTION_IMAGE_BUTTON_CLASS, ACTION_IMAGE_PLACEHOLDER_CLASS, className]
          .filter(Boolean)
          .join(" ")}
        title={t("tool.openImageInWorkbench")}
        onClick={open}
      >
        <span className={ACTION_IMAGE_PLACEHOLDER_LABEL_CLASS}>
          {alt ?? t("tool.imageAttachment")}
        </span>
      </AppButton>
    );
  }

  if (!canOpen) {
    if (className === undefined) {
      return <img src={displaySrc} alt={alt ?? ""} />;
    }
    return (
      <span className={className}>
        <img src={displaySrc} alt={alt ?? ""} />
      </span>
    );
  }

  return (
    <AppButton variant="ghost" size="sm"
      type="button"
      className={[ACTION_IMAGE_BUTTON_CLASS, ADAPTIVE_IMAGE_CLASS, className].filter(Boolean).join(" ")}
      title={t("tool.openImageInWorkbench")}
      onClick={open}
    >
      <AdaptiveImageLayers src={displaySrc} alt={alt ?? ""} />
    </AppButton>
  );
}
