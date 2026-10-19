import type {
  AgentPageCitation,
  AgentPageCitationExcerptKind
} from "../../../../../../shared/agent";
import { canonicalizeBrowserCitationUrls } from "../../../../../../shared/canonicalize-browser-url";
import type { ExternalPageDragPayload } from "./external-page-drag";
import type {
  PageDragCitationPayload,
  WorkbenchBrowserPageContextMenuPayload
} from "../../../../../../shared/workbench-browser";
import type { WorkspaceTab } from "../../../../workspace-tabs/types";
import { truncateQuotedText } from "./message-citation";
import { pageCitationIconFieldsFromWorkspaceTab } from "./page-citation-tab-icon";

export const PAGE_CITE_MARKER_PATTERN = /⟦page-cite:([^⟧]+)⟧/g;

// File-manager, editor and project tabs cite the local path they are showing.
// That path is neither a browser address nor a lyra:// surface.
export const isLocalFilePath = (value: string): boolean =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(value);

export const compactCitationTrail = (parts: readonly string[]): string => {
  const seen = new Set<string>();
  const trails: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (
      trimmed.length === 0
      || /^(?:data:|blob:)/iu.test(trimmed)
      || seen.has(trimmed)
    ) {
      continue;
    }
    seen.add(trimmed);
    trails.push(trimmed);
  }
  return trails.join("\n");
};

const pageCitationId = (): string => {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `page-cite-${randomId}`;
};

const excerptKindForMenu = (
  menu: WorkbenchBrowserPageContextMenuPayload
): AgentPageCitationExcerptKind => {
  const selection = menu.selectionText?.trim() ?? "";
  if (selection.length > 0) return "selection";
  if ((menu.linkUrl?.trim().length ?? 0) > 0) return "link";
  return "page";
};

const quoteSourceForMenu = (
  menu: WorkbenchBrowserPageContextMenuPayload,
  excerptKind: AgentPageCitationExcerptKind
): string => {
  if (excerptKind === "selection") {
    return menu.selectionText?.trim() ?? "";
  }
  if (excerptKind === "link") {
    const linkText = menu.linkText?.trim();
    if (linkText !== undefined && linkText.length > 0) {
      return linkText;
    }
    return menu.linkUrl?.trim() ?? "";
  }
  const title = menu.pageTitle.trim();
  const url = menu.pageUrl.trim();
  const visibleText = menu.visibleText?.trim() ?? "";
  return [title, url, visibleText].filter((part) => part.length > 0).join("\n");
};

const nullableString = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
};

const excerptKindForDrag = (payload: PageDragCitationPayload): AgentPageCitationExcerptKind => {
  const selection = payload.selectionText?.trim() ?? "";
  if (selection.length > 0) {
    return "selection";
  }
  if ((payload.linkUrl?.trim().length ?? 0) > 0 || (payload.srcUrl?.trim().length ?? 0) > 0) {
    return "link";
  }
  return "page";
};

const quoteSourceForDrag = (
  payload: PageDragCitationPayload,
  excerptKind: AgentPageCitationExcerptKind
): string => {
  if (excerptKind === "selection") {
    return payload.selectionText?.trim() ?? "";
  }
  if (excerptKind === "link") {
    return compactCitationTrail([
      payload.linkText ?? "",
      payload.linkUrl ?? "",
      payload.srcUrl ?? "",
      payload.pageUrl,
      payload.tabId
    ]);
  }
  return compactCitationTrail([payload.pageTitle, payload.pageUrl, payload.tabId]);
};

export const enrichPageCitationFromWorkspaceTab = (
  citation: AgentPageCitation,
  tab: WorkspaceTab | undefined
): AgentPageCitation => {
  if (tab === undefined) {
    return citation;
  }
  const iconFields = pageCitationIconFieldsFromWorkspaceTab(tab);
  return {
    ...citation,
    tabPageKind: iconFields.tabPageKind ?? null,
    faviconUrl: iconFields.faviconUrl ?? null,
    appId: iconFields.appId ?? null,
    appIconKey: iconFields.appIconKey ?? null,
    sourceKind: citation.sourceKind ?? "workspace-tab",
    tabTitle: tab.title.trim().length > 0 ? tab.title.trim() : citation.tabTitle
  };
};

export const buildPageCitationFromContextMenu = (
  menu: WorkbenchBrowserPageContextMenuPayload,
  tabTitle: string
): AgentPageCitation => {
  const excerptKind = excerptKindForMenu(menu);
  const source = quoteSourceForMenu(menu, excerptKind);
  const { quotedText, truncated, preview } = truncateQuotedText(source);
  const chipPreview = excerptKind === "page"
    ? truncateQuotedText(menu.pageTitle.trim() || menu.pageUrl.trim()).preview
    : preview;
  return {
    id: pageCitationId(),
    tabId: menu.tabId,
    tabTitle: tabTitle.trim().length > 0 ? tabTitle.trim() : menu.pageTitle,
    pageUrl: menu.pageUrl,
    pageTitle: menu.pageTitle,
    frameUrl: menu.frameUrl ?? null,
    linkUrl: menu.linkUrl ?? null,
    linkText: menu.linkText ?? null,
    srcUrl: menu.srcUrl ?? null,
    mediaType: menu.mediaType,
    elementTag: nullableString(menu.elementTag),
    elementSelector: nullableString(menu.elementSelector),
    elementId: nullableString(menu.elementId),
    elementRole: nullableString(menu.elementRole),
    elementAriaLabel: nullableString(menu.elementAriaLabel),
    excerptKind,
    preview: chipPreview,
    quotedText,
    truncated,
    sourceCapturedAt: new Date().toISOString(),
    sourceKind: "browser"
  };
};

const externalPageTabId = (): string => {
  const randomId = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `external-page-${randomId}`;
};

const excerptKindForExternalDrag = (
  payload: ExternalPageDragPayload
): AgentPageCitationExcerptKind => {
  const selection = payload.selectionText?.trim() ?? "";
  if (selection.length > 0 && (payload.linkUrl?.trim().length ?? 0) === 0) {
    return "selection";
  }
  if ((payload.linkUrl?.trim().length ?? 0) > 0 || (payload.srcUrl?.trim().length ?? 0) > 0) {
    return "link";
  }
  return "page";
};

const quoteSourceForExternalDrag = (
  payload: ExternalPageDragPayload,
  excerptKind: AgentPageCitationExcerptKind
): string => {
  if (excerptKind === "selection") {
    return payload.selectionText?.trim() ?? "";
  }
  if (excerptKind === "link") {
    return compactCitationTrail([
      payload.linkText ?? "",
      payload.linkUrl ?? "",
      payload.srcUrl ?? "",
      payload.pageUrl
    ]);
  }
  return compactCitationTrail([payload.pageTitle, payload.pageUrl]);
};

export const buildPageCitationFromExternalDrag = (
  payload: ExternalPageDragPayload
): AgentPageCitation => {
  const excerptKind = excerptKindForExternalDrag(payload);
  const source = quoteSourceForExternalDrag(payload, excerptKind);
  const { quotedText, truncated, preview } = truncateQuotedText(source);
  const chipPreview = excerptKind === "page"
    ? truncateQuotedText(payload.pageTitle.trim() || payload.pageUrl.trim()).preview
    : preview;
  return {
    id: pageCitationId(),
    tabId: externalPageTabId(),
    tabTitle: payload.pageTitle,
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    frameUrl: null,
    linkUrl: nullableString(payload.linkUrl),
    linkText: nullableString(payload.linkText),
    srcUrl: nullableString(payload.srcUrl),
    mediaType: payload.mediaType ?? null,
    elementTag: nullableString(payload.elementTag),
    elementSelector: null,
    elementId: null,
    elementRole: null,
    elementAriaLabel: null,
    excerptKind,
    preview: chipPreview,
    quotedText,
    truncated,
    sourceCapturedAt: new Date().toISOString(),
    sourceKind: "external-browser",
    captureFidelity: payload.captureFidelity,
    tabPageKind: null,
    faviconUrl: null,
    appId: null,
    appIconKey: null
  };
};

export const buildPageCitationFromDragPayload = (
  payload: PageDragCitationPayload,
  tabTitle: string,
  tab?: WorkspaceTab
): AgentPageCitation => {
  const excerptKind = excerptKindForDrag(payload);
  const source = quoteSourceForDrag(payload, excerptKind);
  const { quotedText, truncated, preview } = truncateQuotedText(source);
  const chipPreview = excerptKind === "page"
    ? truncateQuotedText(payload.pageTitle.trim() || payload.pageUrl.trim()).preview
    : preview;
  const citation: AgentPageCitation = {
    id: pageCitationId(),
    tabId: payload.tabId,
    tabTitle: tabTitle.trim().length > 0 ? tabTitle.trim() : payload.pageTitle,
    pageUrl: payload.pageUrl,
    pageTitle: payload.pageTitle,
    frameUrl: nullableString(payload.frameUrl),
    linkUrl: nullableString(payload.linkUrl),
    linkText: nullableString(payload.linkText),
    srcUrl: nullableString(payload.srcUrl),
    mediaType: payload.mediaType ?? null,
    elementTag: nullableString(payload.elementTag),
    elementSelector: nullableString(payload.elementSelector),
    elementId: nullableString(payload.elementId),
    elementRole: nullableString(payload.elementRole),
    elementAriaLabel: nullableString(payload.elementAriaLabel),
    excerptKind,
    preview: chipPreview,
    quotedText,
    truncated,
    sourceCapturedAt: new Date().toISOString(),
    sourceKind: "browser"
  };
  return enrichPageCitationFromWorkspaceTab(citation, tab);
};

export type ComposerPageCitationSegment = {
  readonly type: "pageCitation";
  readonly citation: AgentPageCitation;
};

export const pageCitationMarker = (citationId: string): string => `⟦page-cite:${citationId}⟧`;

export const textHasPageCitationMarkers = (text: string): boolean =>
  /⟦page-cite:([^⟧]+)⟧/.test(text);

export const normalizePageCitation = (raw: unknown): AgentPageCitation | null => {
  if (raw === null || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const tabId = typeof value.tabId === "string" && value.tabId.length > 0 ? value.tabId : null;
  const rawPageUrl = typeof value.pageUrl === "string" && value.pageUrl.length > 0 ? value.pageUrl : null;
  const rawFrameUrl = typeof value.frameUrl === "string" ? value.frameUrl : null;
  const canonical =
    rawPageUrl === null
      ? null
      : canonicalizeBrowserCitationUrls(rawPageUrl, rawFrameUrl);
  // App, settings and terminal tabs cite their own lyra:// address, which HTTP
  // canonicalization rejects. Keep it verbatim so a dragged tab survives the
  // round-trip through message metadata instead of degrading to a bare "Page".
  // File-manager and editor tabs cite the local path they show; it is not a
  // canonicalizable URL either, so it stays verbatim by the same rule.
  const pageUrl = canonical?.pageUrl
    ?? (rawPageUrl !== null && (rawPageUrl.startsWith("lyra://") || isLocalFilePath(rawPageUrl))
      ? rawPageUrl
      : null);
  if (tabId === null || pageUrl === null) return null;
  const frameUrl = canonical?.frameUrl ?? null;
  const id = typeof value.id === "string" && value.id.length > 0 ? value.id : `page-cite-${tabId}`;
  const excerptKind: AgentPageCitationExcerptKind =
    value.excerptKind === "selection" || value.excerptKind === "link" || value.excerptKind === "page"
      ? value.excerptKind
      : "page";
  const previewRaw = typeof value.preview === "string" ? value.preview : null;
  const quotedRaw = typeof value.quotedText === "string" ? value.quotedText : "";
  const quote = quotedRaw.length > 0 ? truncateQuotedText(quotedRaw) : null;
  const nullableField = (field: unknown): string | null =>
    typeof field === "string" && field.length > 0 ? field : null;
  const sourceKind =
    value.sourceKind === "browser"
    || value.sourceKind === "external-browser"
    || value.sourceKind === "workspace-tab"
    || value.sourceKind === "terminal-tab"
      ? value.sourceKind
      : null;
  const captureFidelity =
    value.captureFidelity === "url-only" || value.captureFidelity === "html-parsed"
      ? value.captureFidelity
      : null;
  return {
    id,
    tabId,
    tabTitle: typeof value.tabTitle === "string" ? value.tabTitle : "",
    pageUrl,
    pageTitle: typeof value.pageTitle === "string" ? value.pageTitle : pageUrl,
    frameUrl,
    linkUrl: typeof value.linkUrl === "string" ? value.linkUrl : null,
    linkText: typeof value.linkText === "string" ? value.linkText : null,
    srcUrl: typeof value.srcUrl === "string" ? value.srcUrl : null,
    mediaType: nullableField(value.mediaType),
    elementTag: nullableField(value.elementTag),
    elementSelector: nullableField(value.elementSelector),
    elementId: nullableField(value.elementId),
    elementRole: nullableField(value.elementRole),
    elementAriaLabel: nullableField(value.elementAriaLabel),
    excerptKind,
    preview: previewRaw ?? quote?.preview ?? "…",
    quotedText: quote?.quotedText ?? quotedRaw,
    truncated: typeof value.truncated === "boolean" ? value.truncated : (quote?.truncated ?? false),
    sourceCapturedAt: typeof value.sourceCapturedAt === "string" ? value.sourceCapturedAt : null,
    sourceKind,
    captureFidelity,
    tabPageKind: nullableField(value.tabPageKind),
    faviconUrl: typeof value.faviconUrl === "string" ? value.faviconUrl : null,
    appId: nullableField(value.appId),
    appIconKey: nullableField(value.appIconKey)
  };
};

export const parsePageCitationsFromMetadata = (metadata: unknown): readonly AgentPageCitation[] => {
  if (metadata === null || typeof metadata !== "object") return [];
  const raw = (metadata as Record<string, unknown>).pageCitations;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizePageCitation(entry))
    .filter((entry): entry is AgentPageCitation => entry !== null);
};

export const segmentsToPageCitations = (
  segments: readonly { readonly type: string }[]
): readonly AgentPageCitation[] =>
  segments
    .filter((segment): segment is ComposerPageCitationSegment => segment.type === "pageCitation")
    .map((segment) => segment.citation);
