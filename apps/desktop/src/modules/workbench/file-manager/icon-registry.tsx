import {
  AppWindow,
  Camera,
  Download,
  Folder,
  FolderOpen,
  Globe,
  HardDrive,
  History,
  House,
  Image,
  ListChecks,
  MessageSquare,
  Monitor,
  Sheet,
  Star,
  Trash2
} from "@lyra/icons";
import { FileTypeIcon } from "@lyra/icons/file-type";
import type { ReactNode } from "react";

import type {
  FileManagerDevice,
  FileManagerDisk,
  FileManagerEntry,
  FileManagerFavorite,
  FileManagerLocation,
  FileManagerTrashEntry
} from "../../../shared/file-manager";
import {
  resolveFileManagerEntryIconKind,
  type FileManagerEntryIconKind
} from "./entry-icon-classifier";
import {
  FM_FAVORITE_FAVICON_CLASS,
  FM_ICON_SHELL_CLASS,
  FM_ICON_SHELL_DISK_CLASS
} from "./surface-classes";
import type { FileManagerAppIconKey } from "./types";

const DEFAULT_ICON_SIZE = 14;

const SAMPLE_FILE_BY_KIND: Readonly<
  Record<FileManagerEntryIconKind, { readonly name: string; readonly kind?: "file" | "folder" | "folder-open" }>
> = {
  "directory-empty": { name: "folder", kind: "folder" },
  "directory-non-empty": { name: "folder", kind: "folder-open" },
  "package-manifest": { name: "package.json" },
  "dependency-lock": { name: "pnpm-lock.yaml" },
  config: { name: "tsconfig.json" },
  workflow: { name: "ci.yml" },
  container: { name: "Dockerfile" },
  "git-meta": { name: ".gitignore" },
  secret: { name: ".env" },
  react: { name: "App.tsx" },
  vue: { name: "App.vue" },
  svelte: { name: "App.svelte" },
  html: { name: "index.html" },
  xml: { name: "data.xml" },
  css: { name: "styles.css" },
  typescript: { name: "index.ts" },
  javascript: { name: "index.js" },
  go: { name: "main.go" },
  java: { name: "Main.java" },
  "c-cpp": { name: "main.cpp" },
  csharp: { name: "Program.cs" },
  swift: { name: "main.swift" },
  php: { name: "index.php" },
  ruby: { name: "main.rb" },
  rust: { name: "main.rs" },
  python: { name: "main.py" },
  notebook: { name: "analysis.ipynb" },
  shell: { name: "script.sh" },
  "code-generic": { name: "main.c" },
  "json-data": { name: "data.json" },
  database: { name: "schema.sql" },
  spreadsheet: { name: "data.csv" },
  presentation: { name: "deck.pptx" },
  document: { name: "notes.docx" },
  markdown: { name: "README.md" },
  image: { name: "photo.png" },
  video: { name: "clip.mp4" },
  audio: { name: "track.mp3" },
  archive: { name: "archive.zip" },
  font: { name: "font.ttf" },
  design: { name: "design.fig" },
  model: { name: "model.glb" },
  log: { name: "app.log" },
  binary: { name: "a.bin" },
  certificate: { name: "cert.pem" },
  diff: { name: "changes.diff" },
  unknown: { name: "untitled" }
};

const mergeClassNames = (...classNames: readonly (string | null | undefined)[]) =>
  classNames.filter(Boolean).join(" ");

const renderIcon = (node: ReactNode, className?: string) => (
  <span
    className={
      className === undefined
        ? FM_ICON_SHELL_CLASS
        : `${FM_ICON_SHELL_CLASS} ${className}`
    }
    aria-hidden="true"
  >
    {node}
  </span>
);

export const renderFileManagerAppIcon = (iconKey: FileManagerAppIconKey) => {
  switch (iconKey) {
    case "file-manager-home":
      return renderIcon(<AppWindow size={DEFAULT_ICON_SIZE} />);
    case "file-manager-directory-empty":
      return renderIcon(<Folder size={DEFAULT_ICON_SIZE} />);
    case "file-manager-directory-non-empty":
      return renderIcon(<FolderOpen size={DEFAULT_ICON_SIZE} />);
    case "file-manager-download-manager":
      return renderIcon(<ListChecks size={DEFAULT_ICON_SIZE} />);
    case "file-manager-trash":
      return renderIcon(<Trash2 size={DEFAULT_ICON_SIZE} />);
    default:
      return renderIcon(<Folder size={DEFAULT_ICON_SIZE} />);
  }
};

export const renderFileManagerLocationIcon = (
  location: FileManagerLocation | FileManagerFavorite
) => {
  switch (location.specialId) {
    case "home":
      return renderIcon(<House size={DEFAULT_ICON_SIZE} />);
    case "desktop":
      return renderIcon(<Monitor size={DEFAULT_ICON_SIZE} />);
    case "documents":
      return renderIcon(<Sheet size={DEFAULT_ICON_SIZE} />);
    case "downloads":
      return renderIcon(<Download size={DEFAULT_ICON_SIZE} />);
    case "pictures":
      return renderIcon(<Image size={DEFAULT_ICON_SIZE} />);
    case "videos":
      return renderIcon(<Camera size={DEFAULT_ICON_SIZE} />);
    case "downloadManager":
      return renderIcon(<ListChecks size={DEFAULT_ICON_SIZE} />);
    case "trash":
      return renderIcon(<Trash2 size={DEFAULT_ICON_SIZE} />);
    case "favorites":
      return renderIcon(<Star size={DEFAULT_ICON_SIZE} />);
    default:
      return renderIcon(<FolderOpen size={DEFAULT_ICON_SIZE} />);
  }
};

export const renderFileManagerFavoriteIcon = (favorite: FileManagerFavorite) => {
  if (favorite.kind === "web") {
    const faviconUrl = favorite.faviconUrl?.trim();
    if (faviconUrl !== undefined && faviconUrl.length > 0) {
      return renderIcon(
        <img
          className={FM_FAVORITE_FAVICON_CLASS}
          src={faviconUrl}
          alt=""
          aria-hidden="true"
        />,
        "lyra-file-manager-icon-shell-favicon"
      );
    }
    return renderIcon(<Globe size={DEFAULT_ICON_SIZE} />);
  }

  if (favorite.kind === "agent-session") {
    return renderIcon(<MessageSquare size={DEFAULT_ICON_SIZE} />);
  }

  return renderFileManagerLocationIcon(favorite);
};

export const renderFileManagerEntryIconByKind = (
  iconKind: FileManagerEntryIconKind,
  options?: {
    readonly className?: string;
    readonly size?: number;
  }
) => {
  const size = options?.size ?? DEFAULT_ICON_SIZE;
  const sample = SAMPLE_FILE_BY_KIND[iconKind];
  return renderIcon(
    <FileTypeIcon name={sample.name} kind={sample.kind ?? "file"} size={size} />,
    mergeClassNames(`lyra-file-manager-icon-shell-kind-${iconKind}`, options?.className)
  );
};

export const renderFileManagerEntryIcon = (entry: FileManagerEntry | FileManagerTrashEntry) => {
  const iconKind = resolveFileManagerEntryIconKind(entry);
  if (entry.kind === "directory") {
    return renderIcon(
      <FileTypeIcon
        name={entry.name}
        kind={iconKind === "directory-empty" ? "folder" : "folder-open"}
        size={DEFAULT_ICON_SIZE}
      />,
      mergeClassNames(`lyra-file-manager-icon-shell-kind-${iconKind}`)
    );
  }
  return renderIcon(
    <FileTypeIcon name={entry.name} size={DEFAULT_ICON_SIZE} />,
    mergeClassNames(`lyra-file-manager-icon-shell-kind-${iconKind}`)
  );
};

export const renderFileManagerDiskIcon = (_disk: FileManagerDisk | FileManagerDevice) => (
  renderIcon(
    <HardDrive size={20} strokeWidth={1.85} />,
    `${FM_ICON_SHELL_DISK_CLASS} lyra-file-manager-icon-shell-disk-glyph`
  )
);

export const renderFileManagerSectionIcon = (
  section: "favorites" | "locations" | "devices" | "recent" | "downloads"
) => {
  if (section === "favorites") {
    return renderIcon(<Star size={DEFAULT_ICON_SIZE} />);
  }
  if (section === "downloads") {
    return renderIcon(<ListChecks size={DEFAULT_ICON_SIZE} />);
  }
  if (section === "devices") {
    return renderIcon(<HardDrive size={DEFAULT_ICON_SIZE} />);
  }
  if (section === "recent") {
    return renderIcon(<History size={DEFAULT_ICON_SIZE} />);
  }
  return renderIcon(<FolderOpen size={DEFAULT_ICON_SIZE} />);
};
