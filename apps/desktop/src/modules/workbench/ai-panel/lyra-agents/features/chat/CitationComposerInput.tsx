import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent
} from "react";
import { isAiPanelAttachDrag, resolveAiPanelDropEffect } from "./ai-panel-drag-attach";
import { CITATION_COMPOSER_INPUT_CLASS } from "./classes";
import { hydrateActivePageDragCitationFromMain } from "../../../../browser-tabs/page-drag-transfer";
import { isPageDragCitationSessionActive } from "../../../../browser-tabs/page-drag-citation-session";
import { readImageAttachmentsFromClipboardData } from "./image-drop";
import type { AgentPageCitation, AgentTranscriptCitation } from "../../../../../../shared/agent";
import type { AgentImageAttachment } from "../../core/types";
import { normalizeInlineImageAttachment } from "./composer-image";
import { createComposerChipElement } from "./citation-chip-dom";
import { isOpenableImageSource, mediaTypeFromPath } from "./read-image-attachment";
import type { AgentFileAttachment } from "./composer-file";
import { normalizeFileAttachment } from "./composer-file";
import type { ComposerInsertableCitation, ComposerSegment } from "./message-citation";
import { normalizePageCitation } from "./page-citation";
import type { WorkspaceTab } from "../../../../workspace-tabs/types";
import { createComposerLinkSegment, websiteLinkLabel } from "./web-link";
import { selectedWebLinkText, useWebLinkClipboard } from "./web-link-clipboard";
import { splitMessageWebLinks } from "./message-web-links";

export type { ComposerInsertableCitation } from "./message-citation";

export type CitationComposerInputHandle = {
  insertCitation(citation: ComposerInsertableCitation): void;
  insertImage(image: AgentImageAttachment): void;
  insertFile(file: AgentFileAttachment): void;
  readSegments(): ComposerSegment[];
  focus(): void;
  clear(): void;
};

const isComposerChip = (node: HTMLElement): boolean =>
  node.dataset.citationId !== undefined
  || node.dataset.attachmentId !== undefined
  || node.dataset.fileAttachmentId !== undefined
  || node.dataset.linkUrl !== undefined;

type CitationComposerInputProps = {
  segments: ComposerSegment[];
  workspaceTabs?: readonly WorkspaceTab[];
  disabled?: boolean;
  placeholder?: string;
  onSegmentsChange(segments: ComposerSegment[]): void;
  onSubmit(): void;
  onLinkClick?(url: string, title?: string): void;
  onTranscriptCitationClick?(citation: AgentTranscriptCitation): void;
  onPageCitationClick?(citation: AgentPageCitation): void;
  onImageAttachmentClick?(image: AgentImageAttachment): void;
  onImageAttachmentsAccepted?(attachments: readonly AgentImageAttachment[]): void;
  onEditorKeyDown?(event: KeyboardEvent<HTMLDivElement>): boolean;
};

export const parseEditorSegments = (
  root: HTMLElement,
  knownSegments: readonly ComposerSegment[]
): ComposerSegment[] => {
  const knownTranscript = new Map(
    knownSegments
      .filter((segment): segment is Extract<ComposerSegment, { type: "citation" }> => segment.type === "citation")
      .map((segment) => [segment.citation.id, segment.citation] as const)
  );
  const knownPage = new Map(
    knownSegments
      .filter((segment): segment is Extract<ComposerSegment, { type: "pageCitation" }> => segment.type === "pageCitation")
      .map((segment) => [segment.citation.id, segment.citation] as const)
  );
  const knownImages = new Map(
    knownSegments
      .filter((segment): segment is Extract<ComposerSegment, { type: "image" }> => segment.type === "image")
      .map((segment) => [segment.image.id, segment.image] as const)
  );
  const knownFiles = new Map(
    knownSegments
      .filter((segment): segment is Extract<ComposerSegment, { type: "file" }> => segment.type === "file")
      .map((segment) => [segment.file.id, segment.file] as const)
  );
  const segments: ComposerSegment[] = [];
  const pushText = (value: string) => {
    if (value.length === 0) return;
    const last = segments.at(-1);
    if (last?.type === "text") {
      segments[segments.length - 1] = { type: "text", value: last.value + value };
      return;
    }
    segments.push({ type: "text", value });
  };

  const visitNode = (node: Node): void => {
    if (node instanceof HTMLElement && node.dataset.linkUrl !== undefined) {
      const url = node.dataset.linkUrl.trim();
      if (url.length > 0) {
        const label = node.dataset.linkLabel?.trim() || websiteLinkLabel(url);
        const faviconUrl = node.dataset.linkFaviconUrl?.trim();
        segments.push({
          type: "link",
          url,
          label,
          ...(faviconUrl === undefined || faviconUrl.length === 0 ? {} : { faviconUrl })
        });
      }
      return;
    }
    if (node instanceof HTMLElement && node.dataset.fileAttachmentId !== undefined) {
      const known = knownFiles.get(node.dataset.fileAttachmentId);
      if (known !== undefined) {
        segments.push({ type: "file", file: known });
        return;
      }
      const fallback = normalizeFileAttachment({
        id: node.dataset.fileAttachmentId,
        path: node.dataset.filePath ?? "",
        name: node.textContent ?? "",
        preview: node.textContent ?? "",
        kind: node.dataset.fileKind
      });
      if (fallback !== null) {
        segments.push({ type: "file", file: fallback });
      }
      return;
    }
    if (node instanceof HTMLElement && node.dataset.attachmentId !== undefined) {
      const attachmentId = node.dataset.attachmentId;
      const known = knownImages.get(attachmentId);
      if (known !== undefined) {
        segments.push({ type: "image", image: known });
        return;
      }
      const source = node.dataset.attachmentSource?.trim() ?? "";
      const preview = node.querySelector(".lyra-agents-citation-chip-preview")?.textContent?.trim()
        ?? node.textContent?.trim()
        ?? null;
      const mediaType = node.dataset.attachmentMediaType?.trim()
        || (isOpenableImageSource(source) ? mediaTypeFromPath(source) : "image/png");
      const fallback = normalizeInlineImageAttachment({
        id: attachmentId,
        mediaType,
        source: isOpenableImageSource(source) ? source : null,
        label: preview
      });
      if (fallback !== null) {
        segments.push({ type: "image", image: fallback });
      }
      return;
    }
    if (node instanceof HTMLElement && node.dataset.citationId !== undefined) {
      const citationId = node.dataset.citationId;
      if (node.dataset.citationKind === "page") {
        const known = knownPage.get(citationId);
        if (known !== undefined) {
          segments.push({ type: "pageCitation", citation: known });
          return;
        }
        const fallback = normalizePageCitation({
          id: citationId,
          tabId: node.dataset.tabId ?? citationId,
          tabTitle: node.textContent ?? "",
          pageUrl: node.dataset.pageUrl ?? "",
          pageTitle: node.textContent ?? "",
          excerptKind: "selection",
          preview: node.textContent ?? "",
          quotedText: node.dataset.quotedText ?? node.textContent ?? "",
          truncated: node.dataset.truncated === "true",
          sourceKind: node.dataset.sourceKind,
          tabPageKind: node.dataset.tabPageKind,
          faviconUrl: node.dataset.faviconUrl,
          appId: node.dataset.appId,
          appIconKey: node.dataset.appIconKey
        });
        if (fallback !== null) {
          segments.push({ type: "pageCitation", citation: fallback });
        }
        return;
      }
      const known = knownTranscript.get(citationId);
      if (known !== undefined) {
        segments.push({ type: "citation", citation: known });
        return;
      }
      const preview = node.textContent ?? "";
      const role = node.dataset.citationRole === "user" ||
        node.classList.contains("lyra-agents-citation-chip-user")
        ? "user"
        : "assistant";
      segments.push({
        type: "citation",
        citation: {
          id: citationId,
          messageId: node.dataset.messageId ?? citationId,
          role,
          excerptKind: "selection",
          preview,
          quotedText: node.dataset.quotedText ?? preview,
          truncated: node.dataset.truncated === "true",
          blockId: node.dataset.blockId ?? null,
          startOffset: node.dataset.startOffset ? Number(node.dataset.startOffset) : null,
          endOffset: node.dataset.endOffset ? Number(node.dataset.endOffset) : null,
          sourceCreatedAt: node.dataset.sourceCreatedAt ?? null
        }
      });
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      pushText(node.textContent ?? "");
      return;
    }
    if (node instanceof HTMLBRElement) {
      pushText("\n");
      return;
    }
    if (node instanceof HTMLElement) {
      node.childNodes.forEach(visitNode);
    }
  };

  root.childNodes.forEach(visitNode);
  return segments;
};

const renderSegments = (root: HTMLElement, segments: readonly ComposerSegment[]) => {
  root.replaceChildren();
  segments.forEach((segment) => {
    if (segment.type === "text") {
      const lines = segment.value.split("\n");
      lines.forEach((line, index) => {
        if (line.length > 0) {
          root.appendChild(document.createTextNode(line));
        }
        if (index < lines.length - 1) {
          root.appendChild(document.createElement("br"));
        }
      });
      return;
    }
    root.appendChild(createComposerChipElement(segment));
  });
};

const placeCaretAfterNode = (chip: Node): void => {
  const selection = window.getSelection();
  if (selection === null) return;
  const range = document.createRange();
  range.setStartAfter(chip);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

const insertComposerContent = (
  editor: HTMLDivElement,
  chip: Node,
  nextKnownSegments: readonly ComposerSegment[],
  onSegmentsChange: (segments: ComposerSegment[]) => void
): void => {
  const lastInserted = chip instanceof DocumentFragment ? chip.lastChild : chip;
  if (lastInserted === null) return;
  editor.focus();
  const selection = window.getSelection();
  if (selection !== null && selection.rangeCount > 0 && editor.contains(selection.anchorNode)) {
    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(chip);
    placeCaretAfterNode(lastInserted);
  } else {
    editor.appendChild(chip);
    placeCaretAfterNode(lastInserted);
  }
  onSegmentsChange(parseEditorSegments(editor, nextKnownSegments));
};

export const CitationComposerInput = forwardRef<CitationComposerInputHandle, CitationComposerInputProps>(
  function CitationComposerInput({
    segments,
    workspaceTabs = [],
    disabled = false,
    placeholder,
    onSegmentsChange,
    onSubmit,
    onLinkClick,
    onTranscriptCitationClick,
    onPageCitationClick,
    onImageAttachmentClick,
    onImageAttachmentsAccepted,
    onEditorKeyDown
  }, ref) {
    useWebLinkClipboard();
    const editorRef = useRef<HTMLDivElement>(null);
    const [dropActive, setDropActive] = useState(false);
    const segmentsRef = useRef(segments);
    segmentsRef.current = segments;

    const syncFromEditor = useCallback(() => {
      const editor = editorRef.current;
      if (editor === null) return;
      onSegmentsChange(parseEditorSegments(editor, segmentsRef.current));
    }, [onSegmentsChange]);

    useImperativeHandle(ref, () => ({
      insertCitation(citation: ComposerInsertableCitation) {
        const editor = editorRef.current;
        if (editor === null) return;
        const segment = citation.kind === "page"
          ? { type: "pageCitation", citation: citation.citation } as const
          : { type: "citation", citation: citation.citation } as const;
        const nextKnownSegments = [...segmentsRef.current, segment];
        insertComposerContent(editor, createComposerChipElement(segment), nextKnownSegments, onSegmentsChange);
      },
      insertImage(image: AgentImageAttachment) {
        const editor = editorRef.current;
        if (editor === null) return;
        const segment = { type: "image", image } as const;
        const nextKnownSegments = [...segmentsRef.current, segment];
        insertComposerContent(editor, createComposerChipElement(segment), nextKnownSegments, onSegmentsChange);
      },
      insertFile(file: AgentFileAttachment) {
        const editor = editorRef.current;
        if (editor === null) return;
        const segment = { type: "file", file } as const;
        const nextKnownSegments = [...segmentsRef.current, segment];
        insertComposerContent(editor, createComposerChipElement(segment), nextKnownSegments, onSegmentsChange);
      },
      readSegments() {
        const editor = editorRef.current;
        if (editor === null) {
          return segmentsRef.current;
        }
        return parseEditorSegments(editor, segmentsRef.current);
      },
      focus() {
        editorRef.current?.focus();
      },
      clear() {
        const editor = editorRef.current;
        if (editor === null) return;
        editor.replaceChildren();
        onSegmentsChange([]);
      }
    }), [onSegmentsChange, syncFromEditor]);

    useEffect(() => {
      const editor = editorRef.current;
      if (editor === null) return;
      const current = parseEditorSegments(editor, segments);
      const serializedCurrent = JSON.stringify(current);
      const serializedNext = JSON.stringify(segments);
      if (serializedCurrent !== serializedNext) {
        renderSegments(editor, segments);
      }
    }, [segments]);

    useEffect(() => {
      const clearDropActive = () => setDropActive(false);
      document.addEventListener("dragend", clearDropActive);
      return () => document.removeEventListener("dragend", clearDropActive);
    }, []);

    const removeComposerChip = (chip: HTMLElement) => {
      const editor = editorRef.current;
      if (editor === null) return;
      chip.remove();
      syncFromEditor();
      editor.focus();
    };

    const acceptImageAttachments = useCallback(async (
      readAttachments: () => Promise<readonly AgentImageAttachment[]>
    ): Promise<boolean> => {
      if (disabled === true || onImageAttachmentsAccepted === undefined) {
        return false;
      }
      const attachments = await readAttachments();
      if (attachments.length === 0) {
        return false;
      }
      onImageAttachmentsAccepted(attachments);
      return true;
    }, [disabled, onImageAttachmentsAccepted]);

    const handlePaste = useCallback((event: ClipboardEvent<HTMLDivElement>) => {
      const clipboardData = event.clipboardData;
      if (clipboardData === null) {
        return;
      }
      const hasImage = Array.from(clipboardData.items).some((item) => item.type.startsWith("image/"));
      if (hasImage) {
        event.preventDefault();
        void acceptImageAttachments(() => readImageAttachmentsFromClipboardData(clipboardData));
        return;
      }

      const editor = editorRef.current;
      const text = clipboardData.getData("text/plain");
      const link = createComposerLinkSegment(text, workspaceTabs);
      const parts: ComposerSegment[] = link === null
        ? splitMessageWebLinks(text).map((part) => part.type === "text" ? part
          : createComposerLinkSegment(part.url, workspaceTabs)!)
        : [link];
      if (disabled || editor === null || !parts.some((part) => part.type === "link")) {
        return;
      }
      event.preventDefault();
      const content = document.createDocumentFragment();
      for (const part of parts) {
        if (part.type === "text") {
          part.value.split("\n").forEach((line, index) => {
            if (index > 0) content.appendChild(document.createElement("br"));
            content.appendChild(document.createTextNode(line));
          });
        } else {
          content.appendChild(createComposerChipElement(part));
        }
      }
      insertComposerContent(editor, content, [...segmentsRef.current, ...parts], onSegmentsChange);
    }, [acceptImageAttachments, disabled, onSegmentsChange, workspaceTabs]);

    const handleCut = (event: ClipboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const selection = window.getSelection();
      if (!editorRef.current?.contains(selection?.anchorNode ?? null)
        || !editorRef.current.contains(selection?.focusNode ?? null)) return;
      const text = selectedWebLinkText(selection);
      if (text === null) return;
      event.preventDefault();
      event.clipboardData.setData("text/plain", text);
      if (typeof document.execCommand !== "function" || !document.execCommand("delete")) {
        selection?.getRangeAt(0).deleteContents();
      }
      syncFromEditor();
    };

    const handleDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
      if (disabled === true) {
        return;
      }
      hydrateActivePageDragCitationFromMain();
      if (!isPageDragCitationSessionActive() && !isAiPanelAttachDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = resolveAiPanelDropEffect(event.dataTransfer);
      const hasFiles = event.dataTransfer.types.includes("Files");
      const hasImage = Array.from(event.dataTransfer.items).some((item) => item.type.startsWith("image/"));
      setDropActive(hasFiles || hasImage);
    }, [disabled]);

    const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
      const nextTarget = event.relatedTarget;
      if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
        return;
      }
      setDropActive(false);
    }, []);

    const handleDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
      if (disabled === true) {
        return;
      }
      hydrateActivePageDragCitationFromMain();
      if (!isPageDragCitationSessionActive() && !isAiPanelAttachDrag(event.dataTransfer)) {
        return;
      }
      event.preventDefault();
      setDropActive(false);
    }, [disabled]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (onEditorKeyDown?.(event)) {
        return;
      }
      if (event.key === " " && !event.nativeEvent.isComposing) {
        const selection = window.getSelection();
        const editor = editorRef.current;
        if (selection !== null && editor !== null && selection.isCollapsed) {
          const { anchorNode, anchorOffset } = selection;
          const textNode = anchorNode instanceof Text
            ? anchorNode
            : anchorNode === editor && anchorOffset > 0 && editor.childNodes[anchorOffset - 1] instanceof Text
              ? editor.childNodes[anchorOffset - 1] as Text
              : null;
          const textOffset = textNode === anchorNode
            ? anchorOffset
            : textNode?.textContent?.length ?? 0;
          const beforeCaret = textNode?.textContent?.slice(0, textOffset) ?? "";
          const token = beforeCaret.match(/(?:^|\s)(\S+)$/u)?.[1] ?? "";
          const link = createComposerLinkSegment(token, workspaceTabs);
          if (textNode !== null && editor.contains(textNode) && link !== null) {
            event.preventDefault();
            const range = document.createRange();
            range.setStart(textNode, textOffset - token.length);
            range.setEnd(textNode, textOffset);
            range.deleteContents();

            const chip = createComposerChipElement(link);
            const spacer = document.createTextNode(" ");
            const fragment = document.createDocumentFragment();
            fragment.append(chip, spacer);
            range.insertNode(fragment);

            const nextRange = document.createRange();
            nextRange.setStartAfter(spacer);
            nextRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(nextRange);
            onSegmentsChange(parseEditorSegments(editor, [...segmentsRef.current, link]));
            return;
          }
        }
      }
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        onSubmit();
        return;
      }
      if (event.key !== "Backspace" && event.key !== "Delete") return;
      const selection = window.getSelection();
      const editor = editorRef.current;
      if (selection === null || editor === null || !selection.isCollapsed) return;
      const { anchorNode, anchorOffset } = selection;
      if (event.key === "Backspace") {
        if (anchorNode === editor && anchorOffset > 0) {
          const previous = editor.childNodes[anchorOffset - 1];
          if (previous instanceof HTMLElement && isComposerChip(previous)) {
            event.preventDefault();
            removeComposerChip(previous);
          }
        } else if (anchorNode instanceof Text && anchorOffset === 0) {
          const previous = anchorNode.previousSibling;
          if (previous instanceof HTMLElement && isComposerChip(previous)) {
            event.preventDefault();
            removeComposerChip(previous);
          }
        }
      }
      if (event.key === "Delete") {
        if (anchorNode === editor && anchorOffset < editor.childNodes.length) {
          const next = editor.childNodes[anchorOffset];
          if (next instanceof HTMLElement && isComposerChip(next)) {
            event.preventDefault();
            removeComposerChip(next);
          }
        } else if (anchorNode instanceof Text && anchorOffset === (anchorNode.textContent?.length ?? 0)) {
          const next = anchorNode.nextSibling;
          if (next instanceof HTMLElement && isComposerChip(next)) {
            event.preventDefault();
            removeComposerChip(next);
          }
        }
      }
    };

    return (
      <div
        ref={editorRef}
        className={CITATION_COMPOSER_INPUT_CLASS}
        contentEditable={disabled ? "false" : "true"}
        role="textbox"
        aria-label={placeholder}
        aria-multiline="true"
        aria-disabled={disabled}
        data-placeholder={placeholder}
        data-drop-active={dropActive ? "true" : "false"}
        suppressContentEditableWarning
        onInput={syncFromEditor}
        onPaste={handlePaste}
        onCut={handleCut}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const linkChip = target.closest<HTMLElement>("[data-link-url]");
          if (linkChip !== null && linkChip.dataset.linkUrl !== undefined) {
            if (onLinkClick !== undefined) {
              event.preventDefault();
              onLinkClick(
                linkChip.dataset.linkUrl,
                linkChip.dataset.linkLabel || websiteLinkLabel(linkChip.dataset.linkUrl)
              );
            }
            return;
          }
          const chip = target.closest<HTMLElement>("[data-citation-id]");
          if (chip === null || chip.dataset.citationId === undefined) {
            const attachmentChip = target.closest<HTMLElement>("[data-attachment-id]");
            if (attachmentChip !== null) {
              event.preventDefault();
              const attachmentId = attachmentChip.dataset.attachmentId;
              if (attachmentId === undefined) {
                return;
              }
              const imageSegment = segmentsRef.current.find(
                (segment) => segment.type === "image" && segment.image.id === attachmentId
              );
              if (imageSegment?.type === "image") {
                onImageAttachmentClick?.(imageSegment.image);
              }
            }
            return;
          }
          event.preventDefault();
          const citationId = chip.dataset.citationId;
          const pageSegment = segmentsRef.current.find(
            (segment) => segment.type === "pageCitation" && segment.citation.id === citationId
          );
          if (pageSegment?.type === "pageCitation") {
            onPageCitationClick?.(pageSegment.citation);
            return;
          }
          const transcriptSegment = segmentsRef.current.find(
            (segment) => segment.type === "citation" && segment.citation.id === citationId
          );
          if (transcriptSegment?.type === "citation") {
            onTranscriptCitationClick?.(transcriptSegment.citation);
          }
        }}
      />
    );
  }
);

export { citationChipAriaLabel, pageCitationChipAriaLabel } from "./message-citation";
