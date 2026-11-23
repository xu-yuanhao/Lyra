import { Fragment, useMemo } from "react";
import type { AgentMessageWebLink, AgentPageCitation, AgentTranscriptCitation } from "../../../../../../shared/agent";
import type { AgentImageAttachment } from "../../core/types";
import type { AgentFileAttachment } from "./composer-file";
import { CitationChipView } from "./CitationChipView";
import { FileAttachmentChipView } from "./FileAttachmentChipView";
import { ImageAttachmentChipView } from "./ImageAttachmentChipView";
import { parseRenderedCitationSegments, type ComposerTextSegment, type RenderedCitationSegment } from "./message-citation";
import { PageCitationChipView } from "./PageCitationChipView";
import { splitMessageWebLinks } from "./message-web-links";
import { websiteLinkLabel } from "./web-link-display";
import { WebsiteLinkIcon } from "./page-citation-tab-icon";
import { CITATION_CHIP_LINK_CLASS, INLINE_RESOURCE_GROUP_CLASS } from "./classes";
import { ResourceChip } from "./ResourceChip";
import { useWebLinkClipboard } from "./web-link-clipboard";

type MessageCitationTextProps = {
  text: string;
  webLinks?: readonly AgentMessageWebLink[] | undefined;
  onWebLinkClick?: (url: string) => void;
  transcriptCitations?: readonly AgentTranscriptCitation[];
  pageCitations?: readonly AgentPageCitation[];
  inlineImages?: readonly AgentImageAttachment[];
  fileAttachments?: readonly AgentFileAttachment[];
  onTranscriptCitationClick?: (citation: AgentTranscriptCitation) => void;
  onPageCitationClick?: (citation: AgentPageCitation) => void;
  onImageAttachmentClick?: (image: AgentImageAttachment) => void;
  onFileAttachmentClick?: (file: AgentFileAttachment) => void;
};

type MessageTextSegment = ComposerTextSegment | RenderedCitationSegment | { type: "link"; url: string };

export const MessageCitationText = ({
  text,
  webLinks = [],
  onWebLinkClick,
  transcriptCitations = [],
  pageCitations = [],
  inlineImages = [],
  fileAttachments = [],
  onTranscriptCitationClick,
  onPageCitationClick,
  onImageAttachmentClick,
  onFileAttachmentClick
}: MessageCitationTextProps) => {
  useWebLinkClipboard();
  const segments = useMemo(
    () => splitMessageWebLinks(text, webLinks).flatMap<MessageTextSegment>((part) =>
      part.type === "link" ? [part] : parseRenderedCitationSegments(
        part.value,
        transcriptCitations,
        pageCitations,
        inlineImages,
        fileAttachments
      )
    ),
    [fileAttachments, inlineImages, pageCitations, text, transcriptCitations, webLinks]
  );
  const hasRenderedCitations = segments.some(
    (segment) =>
      segment.type === "link"
      || segment.type === "transcript"
      || segment.type === "page"
      || segment.type === "image"
      || segment.type === "file"
  );
  const hasOnlyRenderedCitations = hasRenderedCitations && segments.every(
    (segment) => segment.type !== "text" || segment.value.trim().length === 0
  );

  if (!hasRenderedCitations) {
    return (
      <>
        {segments.map((segment, index) =>
          segment.type === "text"
            ? <Fragment key={`text-${index}`}>{segment.value}</Fragment>
            : null
        )}
      </>
    );
  }

  const contents = (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "link") {
          return (
            <ResourceChip
              key={`link-${index}`}
              className={CITATION_CHIP_LINK_CLASS}
              webLinkUrl={segment.url}
              title={segment.url}
              ariaLabel={segment.url}
              icon={<WebsiteLinkIcon pageUrl={segment.url} />}
              label={websiteLinkLabel(segment.url)}
              onActivate={onWebLinkClick === undefined ? undefined : () => onWebLinkClick(segment.url)}
            />
          );
        }
        if (segment.type === "text") {
          if (hasOnlyRenderedCitations && segment.value.trim().length === 0) {
            return null;
          }
          return <Fragment key={`text-${index}`}>{segment.value}</Fragment>;
        }
        if (segment.type === "page") {
          const handleClick = onPageCitationClick === undefined
            ? undefined
            : () => onPageCitationClick(segment.citation);
          return (
            <PageCitationChipView
              key={`page-${segment.citation.id}-${index}`}
              citation={segment.citation}
              {...(handleClick === undefined ? {} : { onClick: handleClick })}
            />
          );
        }
        if (segment.type === "image") {
          const handleClick = onImageAttachmentClick === undefined
            ? undefined
            : () => onImageAttachmentClick(segment.image);
          return (
            <ImageAttachmentChipView
              key={`image-${segment.image.id}-${index}`}
              image={segment.image}
              {...(handleClick === undefined ? {} : { onClick: handleClick })}
            />
          );
        }
        if (segment.type === "file") {
          const handleClick = onFileAttachmentClick === undefined
            ? undefined
            : () => onFileAttachmentClick(segment.file);
          return (
            <FileAttachmentChipView
              key={`file-${segment.file.id}-${index}`}
              file={segment.file}
              {...(handleClick === undefined ? {} : { onClick: handleClick })}
            />
          );
        }
        const handleClick = onTranscriptCitationClick === undefined
          ? undefined
          : () => onTranscriptCitationClick(segment.citation);
        return (
          <CitationChipView
            key={`transcript-${segment.citation.id}-${index}`}
            citation={segment.citation}
            {...(handleClick === undefined ? {} : { onClick: handleClick })}
          />
        );
      })}
    </>
  );

  if (hasOnlyRenderedCitations) {
    return <span className={INLINE_RESOURCE_GROUP_CLASS}>{contents}</span>;
  }
  return contents;
};
