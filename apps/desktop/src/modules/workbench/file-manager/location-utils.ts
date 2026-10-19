import type { FileManagerSurfaceLabels } from "./types";

type FileManagerNamedLocation = {
  readonly title: string;
  readonly specialId?: string;
};

// lyrad serde emits Option::None as JSON null; TS optionals are undefined.
export const optionalFileManagerPath = (
  value: string | null | undefined
): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

// The workspace tab records the directory the file manager is showing so agent
// references and session restore can address it; "" means "no path" because tab
// metadata only accepts defined values.
export const fileManagerTabFilePath = (state: {
  readonly currentLocation: { readonly path?: string | null } | null;
}): string => optionalFileManagerPath(state.currentLocation?.path) ?? "";

export const normalizeFileManagerLocation = <T extends {
  readonly path?: string | null;
}>(location: T): T => ({
  ...location,
  path: optionalFileManagerPath(location.path)
});

export const createLocationPathKey = (
  path: string,
  platform: NodeJS.Platform | null
): string => {
  const normalized = path.replace(/\\/g, "/");
  if (platform === "win32" || platform === "darwin") {
    return normalized.toLowerCase();
  }
  return normalized;
};

export const isSameLocationPath = (
  leftPath: string | null | undefined,
  rightPath: string | null | undefined,
  platform: NodeJS.Platform | null
): boolean => {
  const left = optionalFileManagerPath(leftPath);
  const right = optionalFileManagerPath(rightPath);
  if (left === undefined || right === undefined) {
    return false;
  }

  return createLocationPathKey(left, platform) === createLocationPathKey(right, platform);
};

export const resolveLocationTitle = (
  location: FileManagerNamedLocation,
  labels: Pick<
    FileManagerSurfaceLabels,
    | "locationHome"
    | "locationDesktop"
    | "locationDocuments"
    | "locationDownloads"
    | "locationPictures"
    | "locationVideos"
    | "downloadManagerTitle"
    | "locationTrash"
  >
): string => {
  switch (location.specialId) {
    case "home":
      return labels.locationHome;
    case "desktop":
      return labels.locationDesktop;
    case "documents":
      return labels.locationDocuments;
    case "downloads":
      return labels.locationDownloads;
    case "pictures":
      return labels.locationPictures;
    case "videos":
      return labels.locationVideos;
    case "downloadManager":
      return labels.downloadManagerTitle;
    case "trash":
      return labels.locationTrash;
    default:
      return location.title;
  }
};

export const withResolvedLocationTitle = <T extends FileManagerNamedLocation>(
  location: T,
  labels: Pick<
    FileManagerSurfaceLabels,
    | "locationHome"
    | "locationDesktop"
    | "locationDocuments"
    | "locationDownloads"
    | "locationPictures"
    | "locationVideos"
    | "downloadManagerTitle"
    | "locationTrash"
  >
): T => ({
  ...location,
  title: resolveLocationTitle(location, labels)
});
