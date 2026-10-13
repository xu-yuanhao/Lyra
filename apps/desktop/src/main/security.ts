import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const LYRA_FILE_TICKET_TTL_MS = 10 * 60 * 1000;

const PREVIEW_MIME_BY_EXTENSION = new Map<string, string>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".svg", "image/svg+xml"],
  [".bmp", "image/bmp"],
  [".ico", "image/x-icon"],
  [".avif", "image/avif"],
  [".tiff", "image/tiff"],
  [".tif", "image/tiff"],
  [".heic", "image/heif"],
  [".heif", "image/heif"],
  [".jxl", "image/jxl"],
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".m4a", "audio/mp4"],
  [".aac", "audio/aac"],
  [".ogg", "audio/ogg"],
  [".oga", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".flac", "audio/flac"],
  [".mp4", "video/mp4"],
  [".m4v", "video/mp4"],
  [".webm", "video/webm"],
  [".ogv", "video/ogg"],
  [".mov", "video/quicktime"],
  [".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [".pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [".pdf", "application/pdf"]
]);

type LyraFileTicket = {
  readonly path: string;
  readonly contentType?: string;
  readonly expiresAt: number;
};

export type LyraFileAccessController = {
  readonly addAllowedRoot: (rootPath: string | null | undefined) => void;
  readonly createPreviewUrl: (filePath: string, contentType?: string | null) => string;
  readonly resolveRequest: (requestUrl: string) => Promise<{
    readonly path: string;
    readonly contentType: string;
  } | null>;
};

const normalizeNativePath = (value: string): string => {
  if (process.platform === "win32") {
    return value.replace(/^\/([A-Za-z]:[\\/])/, "$1");
  }
  return value;
};

export const parseLyraFileRequestPath = (requestUrl: string): string | null => {
  try {
    const parsedUrl = new URL(requestUrl);
    const queryPath = parsedUrl.searchParams.get("path");

    if (typeof queryPath === "string" && queryPath.length > 0) {
      return normalizeNativePath(queryPath);
    }

    const decodedPathname = decodeURIComponent(parsedUrl.pathname);
    const decodedHost = decodeURIComponent(parsedUrl.hostname);
    const joinedPath =
      decodedHost.length > 0
        ? `/${decodedHost}${decodedPathname}`
        : decodedPathname;

    return joinedPath.length === 0 ? null : normalizeNativePath(joinedPath);
  } catch (_error) {
    return null;
  }
};

export const isPathInsideOrEqual = (targetPath: string, rootPath: string): boolean => {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath === "" || (
    relativePath.startsWith("..") === false &&
    path.isAbsolute(relativePath) === false
  );
};

export const resolvePreviewMimeType = (
  filePath: string,
  contentType: string | null = null
): string | null => {
  const extensionMimeType = PREVIEW_MIME_BY_EXTENSION.get(path.extname(filePath).toLowerCase()) ?? null;
  if (extensionMimeType === null) {
    return null;
  }
  if (
    contentType !== null &&
    /^(?:image|audio|video)\/[a-z0-9.+-]+$/iu.test(contentType) &&
    contentType.split("/", 1)[0] === extensionMimeType.split("/", 1)[0]
  ) {
    return contentType;
  }
  return extensionMimeType;
};

const normalizeAllowedRoot = (rootPath: string | null | undefined): string | null => {
  const trimmed = rootPath?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return null;
  }
  return path.resolve(normalizeNativePath(trimmed));
};

export const createLyraFileAccessController = (
  initialAllowedRoots: readonly string[] = []
): LyraFileAccessController => {
  const allowedRoots = new Set<string>();
  const tickets = new Map<string, LyraFileTicket>();

  const addAllowedRoot = (rootPath: string | null | undefined): void => {
    const normalized = normalizeAllowedRoot(rootPath);
    if (normalized !== null) {
      allowedRoots.add(normalized);
    }
  };

  for (const root of initialAllowedRoots) {
    addAllowedRoot(root);
  }

  const pruneExpiredTickets = (): void => {
    const now = Date.now();
    for (const [token, ticket] of tickets) {
      if (ticket.expiresAt <= now) {
        tickets.delete(token);
      }
    }
  };

  const createPreviewUrl = (filePath: string, contentType?: string | null): string => {
    pruneExpiredTickets();
    const normalizedPath = path.resolve(normalizeNativePath(filePath));
    const token = randomUUID();
    tickets.set(token, {
      path: normalizedPath,
      ...(contentType === undefined || contentType === null ? {} : { contentType }),
      expiresAt: Date.now() + LYRA_FILE_TICKET_TTL_MS
    });
    const url = new URL("lyra-file://preview");
    url.searchParams.set("path", normalizedPath);
    url.searchParams.set("token", token);
    if (contentType !== undefined && contentType !== null) {
      url.searchParams.set("contentType", contentType);
    }
    return url.toString();
  };

  const hasValidTicket = (requestUrl: string, normalizedPath: string): boolean => {
    try {
      const token = new URL(requestUrl).searchParams.get("token");
      if (token === null) {
        return false;
      }
      const ticket = tickets.get(token);
      if (ticket === undefined) {
        return false;
      }
      if (ticket.expiresAt <= Date.now()) {
        tickets.delete(token);
        return false;
      }
      return ticket.path === normalizedPath;
    } catch (_error) {
      return false;
    }
  };

  const isUnderAllowedRoot = async (normalizedPath: string): Promise<boolean> => {
    let realTarget: string;
    try {
      realTarget = await realpath(normalizedPath);
    } catch (_error) {
      return false;
    }
    for (const root of allowedRoots) {
      try {
        const realRoot = await realpath(root);
        if (isPathInsideOrEqual(realTarget, realRoot)) {
          return true;
        }
      } catch (_error) {
        // Roots may be created lazily; ignore missing ones.
      }
    }
    return false;
  };

  const resolveRequest = async (requestUrl: string): Promise<{
    readonly path: string;
    readonly contentType: string;
  } | null> => {
    const parsedPath = parseLyraFileRequestPath(requestUrl);
    if (parsedPath === null || path.isAbsolute(parsedPath) === false) {
      return null;
    }
    const normalizedPath = path.resolve(parsedPath);
    let requestedContentType: string | null = null;
    try {
      requestedContentType = new URL(requestUrl).searchParams.get("contentType");
    } catch (_error) {
      requestedContentType = null;
    }
    const contentType = resolvePreviewMimeType(normalizedPath, requestedContentType);
    if (contentType === null) {
      return null;
    }
    try {
      const details = await stat(normalizedPath);
      if (details.isFile() === false) {
        return null;
      }
    } catch (_error) {
      return null;
    }
    if (
      hasValidTicket(requestUrl, normalizedPath) === false &&
      await isUnderAllowedRoot(normalizedPath) === false
    ) {
      return null;
    }
    return { path: normalizedPath, contentType };
  };

  return {
    addAllowedRoot,
    createPreviewUrl,
    resolveRequest
  };
};

export const isSafeExternalUrl = (value: string): boolean => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch (_error) {
    return false;
  }
};
