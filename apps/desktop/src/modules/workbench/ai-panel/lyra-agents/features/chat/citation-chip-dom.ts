import type { AgentPageCitation, AgentTranscriptCitation } from "../../../../../../shared/agent";
import type { AgentImageAttachment } from "../../core/types";
import type { AgentFileAttachment } from "./composer-file";
import { fileAttachmentChipAriaLabel } from "./composer-file";
import {
  composerChipIconKindForImage,
  mountComposerChipIcon,
  mountFileChipTypeIcon
} from "./composer-chip-icon";
import {
  imageAttachmentChipKind,
  imageAttachmentPreview,
  imageChipAriaLabel
} from "./composer-image";
import {
  inlineReferenceLabel,
  type ComposerLinkSegment,
  type ComposerSegment
} from "./message-citation";
import {
  mountPageCitationTabIcon,
  mountWebsiteLinkIcon
} from "./page-citation-tab-icon";
import { pageCitationWebUrl, websiteLinkLabel } from "./web-link-display";
import {
  CITATION_CHIP_FILE_CLASS,
  CITATION_CHIP_ICON_CLASS,
  CITATION_CHIP_ICON_HOST_CLASS,
  CITATION_CHIP_LINK_CLASS,
  CITATION_CHIP_PREVIEW_CLASS,
  CITATION_CHIP_PREVIEW_WRAP_CLASS,
  INLINE_RESOURCE_CLASS,
  citationChipRoleClass,
  imageAttachmentChipVariantClass
} from "./classes";

const composerChip = (modifierClassName: string): HTMLSpanElement => {
  const chip = document.createElement("span");
  chip.className = `lyra-agents-citation-chip ${INLINE_RESOURCE_CLASS} cursor-pointer ${modifierClassName}`;
  chip.contentEditable = "false";
  return chip;
};




const applyCitationDataset = (chip: HTMLSpanElement, citation: AgentTranscriptCitation): void => {
  chip.dataset.citationId = citation.id;
  chip.dataset.citationRole = citation.role;
  chip.dataset.messageId = citation.messageId;
  chip.dataset.quotedText = citation.quotedText;
  chip.dataset.truncated = citation.truncated ? "true" : "false";
  if (citation.blockId !== undefined && citation.blockId !== null) {
    chip.dataset.blockId = citation.blockId;
  }
  if (citation.startOffset !== undefined && citation.startOffset !== null) {
    chip.dataset.startOffset = String(citation.startOffset);
  }
  if (citation.endOffset !== undefined && citation.endOffset !== null) {
    chip.dataset.endOffset = String(citation.endOffset);
  }
  if (citation.sourceCreatedAt !== undefined && citation.sourceCreatedAt !== null) {
    chip.dataset.sourceCreatedAt = citation.sourceCreatedAt;
  }
};

const applyPageCitationDataset = (chip: HTMLSpanElement, citation: AgentPageCitation): void => {
  chip.dataset.citationId = citation.id;
  chip.dataset.citationKind = "page";
  chip.dataset.tabId = citation.tabId;
  chip.dataset.pageUrl = citation.pageUrl;
  chip.dataset.quotedText = citation.quotedText;
  chip.dataset.truncated = citation.truncated ? "true" : "false";
  if (citation.sourceKind !== undefined && citation.sourceKind !== null) {
    chip.dataset.sourceKind = citation.sourceKind;
  }
  if (citation.tabPageKind !== undefined && citation.tabPageKind !== null) {
    chip.dataset.tabPageKind = citation.tabPageKind;
  }
  if (citation.faviconUrl !== undefined && citation.faviconUrl !== null) {
    chip.dataset.faviconUrl = citation.faviconUrl;
  }
  if (citation.appId !== undefined && citation.appId !== null) {
    chip.dataset.appId = citation.appId;
  }
  if (citation.appIconKey !== undefined && citation.appIconKey !== null) {
    chip.dataset.appIconKey = citation.appIconKey;
  }
};

export const createPageCitationChipElement = (citation: AgentPageCitation): HTMLSpanElement => {
  const chip = composerChip("lyra-agents-citation-chip-page");
  const url = pageCitationWebUrl(citation);
  const label = url === null ? inlineReferenceLabel(citation.preview) : websiteLinkLabel(url);
  chip.title = url ?? label;
  if (url !== null) chip.dataset.webLinkUrl = url;
  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "-1");
  applyPageCitationDataset(chip, citation);

  const icon = document.createElement("span");
  icon.className = CITATION_CHIP_ICON_HOST_CLASS;
  mountPageCitationTabIcon(icon, citation);
  chip.appendChild(icon);

  const previewWrap = document.createElement("span");
  previewWrap.className = CITATION_CHIP_PREVIEW_WRAP_CLASS;
  const preview = document.createElement("span");
  preview.className = CITATION_CHIP_PREVIEW_CLASS;
  preview.textContent = label;
  previewWrap.appendChild(preview);
  chip.appendChild(previewWrap);
  return chip;
};

export const createLinkChipElement = (link: ComposerLinkSegment): HTMLSpanElement => {
  const label = link.label.trim() || websiteLinkLabel(link.url);
  const chip = composerChip(CITATION_CHIP_LINK_CLASS);
  chip.title = link.url;
  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "-1");
  chip.setAttribute("aria-label", link.url);
  chip.dataset.linkUrl = link.url;
  chip.dataset.linkLabel = label;
  if (link.faviconUrl !== undefined && link.faviconUrl !== null) {
    chip.dataset.linkFaviconUrl = link.faviconUrl;
  }

  const icon = document.createElement("span");
  icon.className = CITATION_CHIP_ICON_HOST_CLASS;
  mountWebsiteLinkIcon(
    icon,
    link.faviconUrl,
    12,
    CITATION_CHIP_ICON_CLASS,
    link.url
  );
  chip.appendChild(icon);

  const previewWrap = document.createElement("span");
  previewWrap.className = CITATION_CHIP_PREVIEW_WRAP_CLASS;
  const preview = document.createElement("span");
  preview.className = CITATION_CHIP_PREVIEW_CLASS;
  preview.textContent = websiteLinkLabel(link.url);
  previewWrap.appendChild(preview);
  chip.appendChild(previewWrap);
  return chip;
};

export const createImageChipElement = (image: AgentImageAttachment): HTMLSpanElement => {
  const kind = imageAttachmentChipKind(image);
  const preview = inlineReferenceLabel(imageAttachmentPreview(image), [], [], [image]);
  const chip = composerChip(
    `lyra-agents-citation-chip-attachment ${imageAttachmentChipVariantClass(kind)}`
  );
  chip.title = preview;
  chip.setAttribute("aria-label", imageChipAriaLabel(image));
  chip.dataset.attachmentId = image.id;
  chip.dataset.attachmentSource = image.source ?? "local-file";
  chip.dataset.attachmentMediaType = image.mediaType;

  const icon = document.createElement("span");
  icon.className = CITATION_CHIP_ICON_CLASS;
  mountComposerChipIcon(icon, composerChipIconKindForImage(image));
  chip.appendChild(icon);

  const previewWrap = document.createElement("span");
  previewWrap.className = CITATION_CHIP_PREVIEW_WRAP_CLASS;
  const previewNode = document.createElement("span");
  previewNode.className = CITATION_CHIP_PREVIEW_CLASS;
  previewNode.textContent = preview;
  previewWrap.appendChild(previewNode);
  chip.appendChild(previewWrap);
  return chip;
};

export const createFileChipElement = (file: AgentFileAttachment): HTMLSpanElement => {
  const chip = composerChip(CITATION_CHIP_FILE_CLASS);
  const label = inlineReferenceLabel(file.preview);
  chip.title = label;
  chip.setAttribute("aria-label", fileAttachmentChipAriaLabel({ ...file, preview: label }));
  chip.dataset.fileAttachmentId = file.id;
  chip.dataset.filePath = file.path;
  if (file.kind !== undefined) {
    chip.dataset.fileKind = file.kind;
  }

  const icon = document.createElement("span");
  icon.className = CITATION_CHIP_ICON_CLASS;
  mountFileChipTypeIcon(icon, file.name, file.kind);
  chip.appendChild(icon);

  const previewWrap = document.createElement("span");
  previewWrap.className = CITATION_CHIP_PREVIEW_WRAP_CLASS;
  const previewNode = document.createElement("span");
  previewNode.className = CITATION_CHIP_PREVIEW_CLASS;
  previewNode.textContent = label;
  previewWrap.appendChild(previewNode);
  chip.appendChild(previewWrap);
  return chip;
};

export const createComposerChipElement = (segment: Exclude<ComposerSegment, { type: "text" }>): HTMLSpanElement => {
  if (segment.type === "link") {
    return createLinkChipElement(segment);
  }
  if (segment.type === "image") {
    return createImageChipElement(segment.image);
  }
  if (segment.type === "file") {
    return createFileChipElement(segment.file);
  }
  if (segment.type === "pageCitation") {
    return createPageCitationChipElement(segment.citation);
  }
  return createCitationChipElement(segment.citation);
};

export const createCitationChipElement = (citation: AgentTranscriptCitation): HTMLSpanElement => {
  const label = inlineReferenceLabel(citation.preview);
  const chip = composerChip(citationChipRoleClass(citation.role));
  chip.title = label;
  chip.setAttribute("role", "button");
  chip.setAttribute("tabindex", "-1");
  chip.dataset.citationKind = "transcript";
  applyCitationDataset(chip, citation);

  const icon = document.createElement("span");
  icon.className = CITATION_CHIP_ICON_CLASS;
  mountComposerChipIcon(icon, citation.role);
  chip.appendChild(icon);

  const previewWrap = document.createElement("span");
  previewWrap.className = CITATION_CHIP_PREVIEW_WRAP_CLASS;

  const preview = document.createElement("span");
  preview.className = CITATION_CHIP_PREVIEW_CLASS;
  preview.textContent = label;
  previewWrap.appendChild(preview);
  chip.appendChild(previewWrap);

  return chip;
};

export const hydrateCitationChipElement = (
  chip: HTMLSpanElement,
  citation: AgentTranscriptCitation
): void => {
  applyCitationDataset(chip, citation);
  const icon = chip.querySelector<HTMLElement>(".lyra-agents-citation-chip-icon");
  if (icon !== null) {
    mountComposerChipIcon(icon, citation.role);
  }
  const preview = chip.querySelector<HTMLElement>(".lyra-agents-citation-chip-preview");
  const label = inlineReferenceLabel(citation.preview);
  if (preview !== null) {
    preview.textContent = label;
  }
  chip.title = label;
};
