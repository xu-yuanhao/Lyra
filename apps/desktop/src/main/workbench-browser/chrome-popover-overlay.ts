import type {
  WorkbenchBrowserFindLabels,
  WorkbenchBrowserOmniboxLabels,
  WorkbenchBrowserOmniboxSuggestion,
  WorkbenchBrowserSearchInPageMatch,
  WorkbenchBrowserWebThemeSnapshot
} from "../../shared/workbench-browser";
import { DEFAULT_WEB_THEME_SNAPSHOT } from "../../shared/workbench-browser";

export const LYRA_BROWSER_CHROME_POPOVER_DOCUMENT_TITLE = "Lyra Browser Chrome Popover";

export type BrowserChromePopoverDocumentOptions = {
  readonly kind: "find" | "omnibox";
  readonly width: number;
  readonly height: number;
  readonly find?: {
    readonly query: string;
    readonly placeholder?: string;
    readonly currentIndex: number;
    readonly totalMatches: number;
    readonly activeMatchId?: string;
    readonly matches: readonly WorkbenchBrowserSearchInPageMatch[];
    readonly truncated?: boolean;
    readonly labels?: WorkbenchBrowserFindLabels;
  };
  readonly omnibox?: {
    readonly value: string;
    readonly selectedIndex: number;
    readonly suggestions: readonly WorkbenchBrowserOmniboxSuggestion[];
    readonly labels?: WorkbenchBrowserOmniboxLabels;
  };
  readonly theme?: WorkbenchBrowserWebThemeSnapshot;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");

const normalizeTheme = (
  theme: WorkbenchBrowserWebThemeSnapshot | undefined
): WorkbenchBrowserWebThemeSnapshot => {
  const candidate = theme ?? DEFAULT_WEB_THEME_SNAPSHOT;
  const palette = candidate.palette ?? DEFAULT_WEB_THEME_SNAPSHOT.palette;
  return {
    enabled: candidate.enabled === true,
    isDark: candidate.isDark !== false,
    revision: Number.isFinite(candidate.revision) ? Math.round(candidate.revision) : 0,
    palette: {
      bgApp: palette.bgApp || DEFAULT_WEB_THEME_SNAPSHOT.palette.bgApp,
      bgSurface: palette.bgSurface || DEFAULT_WEB_THEME_SNAPSHOT.palette.bgSurface,
      bgEditor: palette.bgEditor || DEFAULT_WEB_THEME_SNAPSHOT.palette.bgEditor,
      textPrimary: palette.textPrimary || DEFAULT_WEB_THEME_SNAPSHOT.palette.textPrimary,
      textSecondary: palette.textSecondary || DEFAULT_WEB_THEME_SNAPSHOT.palette.textSecondary,
      textMuted: palette.textMuted || DEFAULT_WEB_THEME_SNAPSHOT.palette.textMuted,
      textAccent: palette.textAccent || DEFAULT_WEB_THEME_SNAPSHOT.palette.textAccent,
      lineDefault: palette.lineDefault || DEFAULT_WEB_THEME_SNAPSHOT.palette.lineDefault,
      lineFocused: palette.lineFocused || DEFAULT_WEB_THEME_SNAPSHOT.palette.lineFocused,
      statusSuccess: palette.statusSuccess || DEFAULT_WEB_THEME_SNAPSHOT.palette.statusSuccess,
      statusWarning: palette.statusWarning || DEFAULT_WEB_THEME_SNAPSHOT.palette.statusWarning,
      statusError: palette.statusError || DEFAULT_WEB_THEME_SNAPSHOT.palette.statusError
    }
  };
};

const DEFAULT_FIND_LABELS: WorkbenchBrowserFindLabels = {
  ariaLabel: "Page content search results",
  current: "Current",
  result: "Result",
  emptyStart: "Type to search page content",
  emptyNoMatch: "No matches found",
  truncationNotice: "Only the first results are shown."
};

const DEFAULT_OMNIBOX_LABELS: WorkbenchBrowserOmniboxLabels = {
  ariaLabel: "Address suggestions",
  history: "History",
  searchSuggestion: "Search suggestion",
  emptyStart: "Type to search",
  emptyNoMatch: "No matching suggestions"
};

export const resolveBrowserFindPopoverHeight = ({
  matchCount,
  maxHeight
}: {
  readonly matchCount: number;
  readonly maxHeight: number;
}): number => {
  const visibleRows = Math.min(8, Math.max(1, Math.round(matchCount)));
  const preferred = 10 + visibleRows * 36 + 8;
  return Math.max(54, Math.min(Math.round(maxHeight), Math.min(240, preferred)));
};

export const resolveBrowserOmniboxPopoverHeight = ({
  itemCount,
  maxHeight
}: {
  readonly itemCount: number;
  readonly maxHeight: number;
}): number => {
  const visibleRows = Math.min(8, Math.max(1, Math.round(itemCount)));
  const preferred = 10 + visibleRows * 36 + 8;
  return Math.max(54, Math.min(Math.round(maxHeight), Math.min(240, preferred)));
};

const buildFindActionUrl = (action: string, value?: string | number): string => {
  const params = new URLSearchParams();
  if (value !== undefined) {
    params.set("value", String(value));
  }
  return `lyra-find://${action}${params.toString().length === 0 ? "" : `?${params.toString()}`}`;
};

const buildOmniboxActionUrl = (index: number): string => {
  const params = new URLSearchParams();
  params.set("index", String(index));
  return `lyra-omnibox://suggestion?${params.toString()}`;
};

const highlightSnippet = (snippet: string, query: string): string => {
  const escapedSnippet = escapeHtml(snippet);
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) {
    return escapedSnippet;
  }
  const lowerSnippet = snippet.toLocaleLowerCase();
  const lowerQuery = trimmedQuery.toLocaleLowerCase();
  const index = lowerSnippet.indexOf(lowerQuery);
  if (index < 0) {
    return escapedSnippet;
  }
  const before = escapeHtml(snippet.slice(0, index));
  const match = escapeHtml(snippet.slice(index, index + trimmedQuery.length));
  const after = escapeHtml(snippet.slice(index + trimmedQuery.length));
  return `${before}<mark>${match}</mark>${after}`;
};

const buildSuggestionPanelDocument = ({
  width,
  height,
  theme,
  body,
  ariaLabel
}: {
  readonly width: number;
  readonly height: number;
  readonly theme?: WorkbenchBrowserWebThemeSnapshot;
  readonly body: string;
  readonly ariaLabel: string;
}): string => {
  const normalizedTheme = normalizeTheme(theme);
  const palette = normalizedTheme.palette;
  const panelWidth = Math.max(1, Math.round(width));
  const panelHeight = Math.max(54, Math.round(height));
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; script-src 'none'; navigate-to lyra-find: lyra-omnibox:;"
    />
    <title>${LYRA_BROWSER_CHROME_POPOVER_DOCUMENT_TITLE}</title>
    <style>
      :root {
        color-scheme: ${normalizedTheme.isDark ? "dark" : "light"};
        --lyra-unit-1: 1px;
        --lyra-unit-2: 2px;
        --lyra-unit-3: 3px;
        --lyra-unit-6: 6px;
        --lyra-unit-7: 7px;
        --lyra-unit-10: 10px;
        --lyra-unit-12: 12px;
        --lyra-unit-240: 240px;
        --lyra-unit-999: 999px;
        --lyra-stroke-hairline: 1px;
        --lyra-radius-8: 8px;
        --lyra-app-popover-bg: ${palette.bgSurface};
        --lyra-app-row-hover-bg: ${palette.bgEditor};
        --lyra-app-row-active-bg: color-mix(in srgb, ${palette.bgEditor} 82%, ${palette.textPrimary} 8%);
        --lyra-app-border: ${palette.lineDefault};
        --lyra-text-primary: ${palette.textPrimary};
        --lyra-text-secondary: ${palette.textSecondary};
        --lyra-text-muted: ${palette.textMuted};
        --lyra-text-accent: ${palette.textAccent};
        --lyra-status-warning: ${palette.statusWarning};
        --lyra-scrollbar-thumb-idle: ${palette.textMuted};
        --lyra-scrollbar-thumb-hover: ${palette.lineFocused};
        --lyra-shadow-elevated-md: 0 9px 28px color-mix(in srgb, ${palette.textPrimary} 10%, transparent);
        --lyra-font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      html,
      body {
        width: ${panelWidth}px;
        height: ${panelHeight}px;
        margin: 0;
        overflow: hidden;
        background: transparent;
        color: var(--lyra-text-primary);
        font: 12px/1.45 var(--lyra-font-ui);
      }
      .lyra-omnibox-suggestion-panel {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        margin: 0;
        padding: var(--lyra-unit-6) 0 var(--lyra-unit-3);
        list-style: none;
        overflow: hidden auto;
        background: var(--lyra-app-popover-bg);
        border: var(--lyra-stroke-hairline) solid var(--lyra-app-border);
        border-radius: var(--lyra-radius-8);
        box-shadow: var(--lyra-shadow-elevated-md);
        scrollbar-width: thin;
        scrollbar-color: var(--lyra-scrollbar-thumb-idle) transparent;
      }
      .lyra-omnibox-suggestion-panel::-webkit-scrollbar {
        width: var(--lyra-unit-10);
        height: var(--lyra-unit-10);
        background: transparent;
      }
      .lyra-omnibox-suggestion-panel::-webkit-scrollbar-track {
        background: transparent;
      }
      .lyra-omnibox-suggestion-panel::-webkit-scrollbar-thumb {
        background-color: var(--lyra-scrollbar-thumb-idle);
        border: var(--lyra-unit-2) solid transparent;
        background-clip: padding-box;
        border-radius: var(--lyra-unit-999);
      }
      .lyra-omnibox-suggestion-panel::-webkit-scrollbar-thumb:hover {
        background-color: var(--lyra-scrollbar-thumb-hover);
      }
      .lyra-suggestion-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--lyra-unit-10);
        min-width: 0;
        padding: var(--lyra-unit-7) var(--lyra-unit-12);
        color: var(--lyra-text-primary);
        text-decoration: none;
        cursor: pointer;
      }
      .lyra-suggestion-item:hover {
        background: var(--lyra-app-row-hover-bg);
      }
      .lyra-suggestion-item.is-selected {
        background: var(--lyra-app-row-active-bg);
      }
      .lyra-suggestion-left {
        display: flex;
        align-items: center;
        gap: var(--lyra-unit-10);
        min-width: 0;
        flex: 1;
      }
      .lyra-suggestion-glyph,
      .lyra-find-result-index {
        width: 34px;
        flex: 0 0 34px;
        color: var(--lyra-text-muted);
        font-variant-numeric: tabular-nums;
      }
      .lyra-suggestion-item:hover .lyra-suggestion-glyph,
      .lyra-suggestion-item.is-selected .lyra-suggestion-glyph {
        color: var(--lyra-text-accent);
      }
      .lyra-suggestion-text {
        min-width: 0;
        font-size: 12px;
        font-family: var(--lyra-font-ui);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--lyra-text-primary);
      }
      .lyra-suggestion-type-badge {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--lyra-text-muted);
        letter-spacing: 0.04em;
        opacity: 0.68;
        flex: 0 0 auto;
      }
      .lyra-suggestion-item:hover .lyra-suggestion-type-badge,
      .lyra-suggestion-item.is-selected .lyra-suggestion-type-badge {
        opacity: 0.95;
      }
      mark {
        color: inherit;
        background: color-mix(in srgb, var(--lyra-status-warning) 42%, transparent);
        border-radius: 3px;
        padding: 0 1px;
      }
      .lyra-find-empty,
      .lyra-find-truncated {
        color: var(--lyra-text-muted);
        padding: var(--lyra-unit-7) var(--lyra-unit-12);
        font-size: 12px;
      }
      .lyra-find-truncated {
        padding: var(--lyra-unit-3) var(--lyra-unit-12) var(--lyra-unit-6);
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <div class="lyra-omnibox-suggestion-panel" role="listbox" aria-label="${escapeHtml(ariaLabel)}">
      ${body}
    </div>
  </body>
</html>`;
};

const buildFindPopoverDocument = ({
  width,
  height,
  find,
  theme
}: {
  readonly width: number;
  readonly height: number;
  readonly find: NonNullable<BrowserChromePopoverDocumentOptions["find"]>;
  readonly theme?: WorkbenchBrowserWebThemeSnapshot;
}): string => {
  const labels = find.labels ?? DEFAULT_FIND_LABELS;
  const rows = find.matches
    .map((match) => {
      const selected = match.id === find.activeMatchId || match.index === find.currentIndex;
      return `
        <a class="lyra-suggestion-item${selected ? " is-selected" : ""}" href="${buildFindActionUrl("match", match.index)}" role="option" aria-selected="${selected ? "true" : "false"}">
          <span class="lyra-suggestion-left">
            <span class="lyra-find-result-index">#${match.index}</span>
            <span class="lyra-suggestion-text">${highlightSnippet(match.snippet, find.query)}</span>
          </span>
          <span class="lyra-suggestion-type-badge">${escapeHtml(selected ? labels.current : labels.result)}</span>
        </a>`;
    })
    .join("");
  const empty = find.query.trim().length === 0 ? labels.emptyStart : labels.emptyNoMatch;
  return buildSuggestionPanelDocument({
    width,
    height,
    ...(theme === undefined ? {} : { theme }),
    ariaLabel: labels.ariaLabel,
    body: `
      ${rows.length > 0 ? rows : `<div class="lyra-find-empty">${escapeHtml(empty)}</div>`}
      ${find.truncated === true ? `<div class="lyra-find-truncated">${escapeHtml(labels.truncationNotice)}</div>` : ""}
    `
  });
};

const buildOmniboxPopoverDocument = ({
  width,
  height,
  omnibox,
  theme
}: {
  readonly width: number;
  readonly height: number;
  readonly omnibox: NonNullable<BrowserChromePopoverDocumentOptions["omnibox"]>;
  readonly theme?: WorkbenchBrowserWebThemeSnapshot;
}): string => {
  const labels = omnibox.labels ?? DEFAULT_OMNIBOX_LABELS;
  const rows = omnibox.suggestions
    .map((suggestion, index) => {
      const selected = index === omnibox.selectedIndex;
      const text = `${suggestion.value}${suggestion.label ? ` (${suggestion.label})` : ""}`;
      return `
        <a class="lyra-suggestion-item${selected ? " is-selected" : ""}" href="${buildOmniboxActionUrl(index)}" role="option" aria-selected="${selected ? "true" : "false"}">
          <span class="lyra-suggestion-left">
            <span class="lyra-suggestion-glyph">${suggestion.type === "history" ? "◎" : "⌕"}</span>
            <span class="lyra-suggestion-text">${escapeHtml(text)}</span>
          </span>
          <span class="lyra-suggestion-type-badge">${escapeHtml(suggestion.type === "history" ? labels.history : labels.searchSuggestion)}</span>
        </a>`;
    })
    .join("");
  const empty = omnibox.value.trim().length === 0 ? labels.emptyStart : labels.emptyNoMatch;
  return buildSuggestionPanelDocument({
    width,
    height,
    ...(theme === undefined ? {} : { theme }),
    ariaLabel: labels.ariaLabel,
    body: rows.length > 0 ? rows : `<div class="lyra-find-empty">${escapeHtml(empty)}</div>`
  });
};

export const buildBrowserChromePopoverDocument = ({
  kind,
  width,
  height,
  find,
  omnibox,
  theme
}: BrowserChromePopoverDocumentOptions): string => {
  if (kind === "omnibox") {
    if (omnibox === undefined) {
      throw new Error("omnibox popover payload is required");
    }
    return buildOmniboxPopoverDocument({
      width,
      height,
      omnibox,
      ...(theme === undefined ? {} : { theme })
    });
  }
  if (find === undefined) {
    throw new Error("find popover payload is required");
  }
  return buildFindPopoverDocument({
    width,
    height,
    find,
    ...(theme === undefined ? {} : { theme })
  });
};
