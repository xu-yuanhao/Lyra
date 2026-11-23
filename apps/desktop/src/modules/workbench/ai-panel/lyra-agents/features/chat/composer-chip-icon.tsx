import {
  Bot,
  Camera,
  FileImage,
  Monitor,
  UserRound,
  resolveFileTypeIconId,
  type LyraIcon
} from "@lyra/icons";
import { createRoot, type Root } from "react-dom/client";

import type { AgentTranscriptCitation } from "../../../../../../shared/agent";
import { FileTypeIcon } from "../../components/FileTypeIcon";
import type { AgentImageAttachment } from "../../core/types";
import type { AgentFileEntryKind } from "./composer-file";
import { CITATION_CHIP_ICON_CLASS } from "./classes";
import { imageAttachmentChipKind } from "./composer-image";

export type ComposerChipIconKind =
  | AgentTranscriptCitation["role"]
  | "imageFile"
  | "imageBrowser"
  | "imageWindow";

const FILE_CHIP_ICON_SIZE = 12;

const ICON_BY_KIND: Record<ComposerChipIconKind, LyraIcon> = {
  assistant: Bot,
  user: UserRound,
  imageFile: FileImage,
  imageBrowser: Camera,
  imageWindow: Monitor
};

export const composerChipIconKindForImage = (
  image: AgentImageAttachment
): ComposerChipIconKind => {
  const kind = imageAttachmentChipKind(image);
  if (kind === "workspace") {
    return "imageBrowser";
  }
  if (kind === "window") {
    return "imageWindow";
  }
  return "imageFile";
};

const ComposerChipIconSvg = ({
  kind
}: {
  readonly kind: ComposerChipIconKind;
}) => {
  const Icon = ICON_BY_KIND[kind];
  return <Icon size={12} strokeWidth={1.8} aria-hidden="true" />;
};

export const ComposerChipIcon = ({
  kind
}: {
  readonly kind: ComposerChipIconKind;
}) => (
  <span className={CITATION_CHIP_ICON_CLASS} aria-hidden="true">
    <ComposerChipIconSvg kind={kind} />
  </span>
);

const fileChipIconKind = (kind: AgentFileEntryKind | undefined) =>
  kind === "directory" ? "folder" as const : "file" as const;

export const fileChipTypeIconId = (
  name: string,
  kind?: AgentFileEntryKind
): string => resolveFileTypeIconId(name, fileChipIconKind(kind));

export const FileChipTypeIcon = ({
  name,
  kind
}: {
  readonly name: string;
  readonly kind?: AgentFileEntryKind | undefined;
}) => (
  <span
    className={CITATION_CHIP_ICON_CLASS}
    data-file-type={fileChipTypeIconId(name, kind)}
    aria-hidden="true"
  >
    <FileTypeIcon filename={name} kind={fileChipIconKind(kind)} size={FILE_CHIP_ICON_SIZE} />
  </span>
);

const iconRoots = new WeakMap<HTMLElement, Root>();

export const mountComposerChipIcon = (
  container: HTMLElement,
  kind: ComposerChipIconKind
): void => {
  let root = iconRoots.get(container);
  if (root === undefined) {
    root = createRoot(container);
    iconRoots.set(container, root);
  }
  root.render(<ComposerChipIconSvg kind={kind} />);
};

export const mountFileChipTypeIcon = (
  container: HTMLElement,
  name: string,
  kind?: AgentFileEntryKind
): void => {
  container.dataset.fileType = fileChipTypeIconId(name, kind);
  let root = iconRoots.get(container);
  if (root === undefined) {
    root = createRoot(container);
    iconRoots.set(container, root);
  }
  root.render(
    <FileTypeIcon filename={name} kind={fileChipIconKind(kind)} size={FILE_CHIP_ICON_SIZE} />
  );
};
