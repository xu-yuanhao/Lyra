import { randomUUID } from "node:crypto";
import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type {
  AgentImageAttachmentMaterializeRequest,
  AgentImageAttachmentMaterializeResponse
} from "../../shared/agent";

const IMAGE_ATTACHMENT_MAX_BYTES = 64 * 1024 * 1024;

const extensionForImageMediaType = (mediaType: string): string => {
  switch (mediaType.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/svg+xml":
      return "svg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/avif":
      return "avif";
    case "image/heic":
      return "heic";
    default:
      return "png";
  }
};

const safeImageAttachmentStem = (request: AgentImageAttachmentMaterializeRequest): string => {
  const seed = request.label ?? request.id ?? "agent-image";
  const sanitized = seed
    .replace(/\.[A-Za-z0-9]{1,12}$/u, "")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48);
  return sanitized.length === 0 ? "agent-image" : sanitized;
};

export const materializeImageAttachment = async (
  storageRoot: string,
  request: AgentImageAttachmentMaterializeRequest
): Promise<AgentImageAttachmentMaterializeResponse> => {
  const mediaType = request.mediaType.trim().toLowerCase();
  if (!mediaType.startsWith("image/")) {
    throw new Error("Only image attachments can be materialized.");
  }

  const data = request.data.trim();
  if (data.length === 0) {
    throw new Error("Image attachment data is empty.");
  }

  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0 || buffer.length > IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error("Image attachment size is invalid.");
  }

  const directory = join(storageRoot, "message-images");
  await mkdir(directory, { recursive: true });
  const filePath = join(
    directory,
    `${Date.now()}-${randomUUID()}-${safeImageAttachmentStem(request)}.${extensionForImageMediaType(mediaType)}`
  );
  await writeFile(filePath, buffer);
  return { path: filePath };
};

export const materializeLumenCapture = async (
  storageRoot: string,
  tabId: string,
  capture: {
    readonly mimeType: string;
    readonly imageBase64: string;
    readonly width: number;
    readonly height: number;
    readonly visibleOnly: boolean;
  }
) => {
  const mediaType = capture.mimeType.trim().toLowerCase();
  if (!mediaType.startsWith("image/")) {
    throw new Error("Lumen visual capture did not return an image.");
  }
  const buffer = Buffer.from(capture.imageBase64, "base64");
  if (buffer.length === 0 || buffer.length > IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error("Lumen visual capture size is invalid.");
  }
  const directory = join(storageRoot, "lumen-evidence");
  await mkdir(directory, { recursive: true });
  const artifactId = `lumen-see-${Date.now()}-${randomUUID()}`;
  const sanitizedTabId = tabId
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "browser";
  const filePath = join(
    directory,
    `${artifactId}-${sanitizedTabId}.${extensionForImageMediaType(mediaType)}`
  );
  await writeFile(filePath, buffer);
  return {
    id: artifactId,
    kind: "image",
    mediaType,
    path: filePath,
    width: capture.width,
    height: capture.height,
    visibleOnly: capture.visibleOnly,
    sizeBytes: buffer.length,
    openTarget: {
      kind: "file",
      path: filePath
    }
  };
};

export const materializeQrCropCapture = async (
  storageRoot: string,
  tabId: string,
  capture: {
    readonly mimeType: string;
    readonly imageBase64: string;
    readonly width: number;
    readonly height: number;
  },
  index: number
) => {
  const mediaType = capture.mimeType.trim().toLowerCase();
  if (!mediaType.startsWith("image/")) {
    throw new Error("QR crop capture did not return an image.");
  }
  const buffer = Buffer.from(capture.imageBase64, "base64");
  if (buffer.length === 0 || buffer.length > IMAGE_ATTACHMENT_MAX_BYTES) {
    throw new Error("QR crop capture size is invalid.");
  }
  const directory = join(storageRoot, "lumen-evidence");
  await mkdir(directory, { recursive: true });
  const artifactId = `lumen-qr-${Date.now()}-${randomUUID()}`;
  const sanitizedTabId = tabId
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "browser";
  const filePath = join(
    directory,
    `${artifactId}-${sanitizedTabId}-${index}.${extensionForImageMediaType(mediaType)}`
  );
  await writeFile(filePath, buffer);
  return {
    id: artifactId,
    kind: "image",
    mediaType,
    path: filePath,
    width: capture.width,
    height: capture.height,
    visibleOnly: true,
    sizeBytes: buffer.length,
    openTarget: {
      kind: "file",
      path: filePath
    }
  };
};

// Agent captures (screenshots under lumen-evidence/) are write-once evidence
// referenced from transcript rows, but nothing records ownership, so the
// directory grows without bound. Prune it by age, matching the mtime-TTL
// housekeeping shape of the reference projects (hermes sweeps media caches
// hourly at a 24h TTL; opencode sweeps tool-output spill files at 7d). 7d
// keeps recent-session screenshots viewable while bounding disk growth.
const LUMEN_EVIDENCE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const LUMEN_EVIDENCE_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

export const sweepLumenEvidence = async (
  storageRoot: string,
  now = Date.now()
): Promise<number> => {
  const directory = join(storageRoot, "lumen-evidence");
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    return 0; // nothing captured yet — directory absent
  }
  let removed = 0;
  for (const entry of entries) {
    try {
      const filePath = join(directory, entry);
      const stats = await stat(filePath);
      if (!stats.isFile() || now - stats.mtimeMs <= LUMEN_EVIDENCE_TTL_MS) {
        continue;
      }
      await unlink(filePath);
      removed += 1;
    } catch {
      // Best effort: the file may vanish or be rewritten concurrently.
    }
  }
  return removed;
};

export const startLumenEvidenceSweeper = (storageRoot: string): void => {
  void sweepLumenEvidence(storageRoot);
  const timer = setInterval(() => {
    void sweepLumenEvidence(storageRoot);
  }, LUMEN_EVIDENCE_SWEEP_INTERVAL_MS);
  timer.unref();
};

