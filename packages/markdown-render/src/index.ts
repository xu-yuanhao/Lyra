/// <reference path="./types.d.ts" />

import DOMPurify from "dompurify";
import { katex } from "@mdit/plugin-katex";
import MarkdownIt from "markdown-it";
import container from "markdown-it-container";
import taskLists from "markdown-it-task-lists";
import type Renderer from "markdown-it/lib/renderer.mjs";
import type Token from "markdown-it/lib/token.mjs";

export type MarkdownRenderMode = "streaming" | "final";
export type MarkdownRenderTheme = "dark" | "light" | "system";

export type MermaidRenderJob = {
  readonly id: string;
  readonly source: string;
  readonly sourceHash: string;
};

export type MarkdownRenderOptions = {
  readonly mode: MarkdownRenderMode;
  readonly theme?: MarkdownRenderTheme | undefined;
};

export type MarkdownRenderResult = {
  readonly html: string;
  readonly mermaidJobs: readonly MermaidRenderJob[];
};

type MarkdownItRenderer = Renderer;
type MarkdownItFenceRule = MarkdownItRenderer["rules"]["fence"];

const markdownInstances = new Map<MarkdownRenderMode, MarkdownIt>();

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");

const isSafeMarkdownImageSrc = (value: string): boolean => {
  const src = value.trim();
  if (src.length === 0 || src.startsWith("//")) {
    return false;
  }
  if (/^data:/iu.test(src)) {
    return /^data:image\/[a-z0-9.+-]+;base64,/iu.test(src);
  }
  const protocolMatch = /^([a-z][a-z0-9+.-]*):/iu.exec(src);
  if (protocolMatch === null) {
    return true;
  }
  // ponytail: allow http(s) so final render matches CSP img-src + streaming.
  // Privacy ceiling: remote image load leaks client IP to image host.
  // Upgrade path: proxy remote images to lyra-file:// via backend download.
  return ["http", "https", "file", "lyra-file", "blob"].includes(
    protocolMatch[1]?.toLowerCase() ?? ""
  );
};

const isLocalFilePath = (src: string): boolean =>
  (src.startsWith("/") && !src.startsWith("//")) ||
  /^[A-Za-z]:[\\/]/.test(src) ||
  /^file:\/\//i.test(src);

const rewriteLocalImagePath = (src: string): string => {
  if (!isLocalFilePath(src)) return src;
  let filePath = src;
  if (/^file:\/\//i.test(src)) {
    try {
      filePath = decodeURIComponent(new URL(src).pathname);
    } catch {
      return src;
    }
  }
  return `lyra-file://preview?path=${encodeURIComponent(filePath)}`;
};

let domPurifyImageHookInstalled = false;

const installDomPurifyImageHook = (): void => {
  if (domPurifyImageHookInstalled || typeof DOMPurify.addHook !== "function") {
    return;
  }
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (node.nodeName.toLowerCase() !== "img") {
      return;
    }
    if (data.attrName === "src" && !isSafeMarkdownImageSrc(data.attrValue)) {
      data.keepAttr = false;
    }
    if (data.attrName === "srcset") {
      data.keepAttr = false;
    }
  });
  domPurifyImageHookInstalled = true;
};

export const markdownRenderSourceHash = (source: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const normalizeFenceLanguage = (info: string): string =>
  info.trim().split(/\s+/u)[0]?.toLowerCase() ?? "";

const createMarkdownIt = (mode: MarkdownRenderMode): MarkdownIt => {
  const md = new MarkdownIt({
    html: mode === "final",
    linkify: true,
    typographer: false,
    breaks: false
  });

  // Override default validateLink: markdown-it blocks file: protocol, but
  // isSafeMarkdownImageSrc + DOMPurify already handle safety downstream.
  md.validateLink = (url: string): boolean => {
    const str = url.trim().toLowerCase();
    if (/^(vbscript|javascript):/.test(str)) return false;
    if (/^data:/.test(str)) return /^data:image\/[a-z0-9.+-]+;base64,/u.test(str);
    return true;
  };

  md.use(taskLists, { enabled: false, label: true, labelAfter: true });
  md.use(container, "details", {
    validate: (params: string) => params.trim().startsWith("details"),
    render: (tokens: unknown[], index: number) => {
      const token = tokens[index] as { readonly nesting?: number; readonly info?: string };
      if (token.nesting === 1) {
        const summary = (token.info ?? "").trim().replace(/^details\s*/u, "").trim();
        const safeSummary = summary.length > 0 ? summary : "Details";
        return `<details class="lyra-markdown-details"><summary>${escapeHtml(safeSummary)}</summary>\n`;
      }
      return "</details>\n";
    }
  });

  if (mode === "final") {
    md.use(katex, {
      throwOnError: false,
      output: "htmlAndMathml",
      strict: "ignore",
      mathFence: true
    });
  }

  md.renderer.rules.code_inline = (tokens, index) =>
    `<code class="lyra-agents-md-inline-code">${escapeHtml(tokens[index]?.content ?? "")}</code>`;

  md.renderer.rules.link_open = (tokens, index, rendererOptions, env, self) => {
    tokens[index]?.attrJoin("class", "lyra-agents-md-link");
    tokens[index]?.attrSet("rel", "noreferrer");
    return self.renderToken(tokens, index, rendererOptions);
  };

  md.renderer.rules.image = (tokens, index, rendererOptions, env, self) => {
    const token = tokens[index];
    const src = token?.attrGet("src") ?? "";
    if (!isSafeMarkdownImageSrc(src)) {
      const alt = token?.content ?? token?.attrGet("alt") ?? "";
      return alt.trim().length > 0
        ? `<span class="lyra-agents-md-blocked-image">${escapeHtml(alt)}</span>`
        : "";
    }
    const rewritten = rewriteLocalImagePath(src);
    if (rewritten !== src) {
      token?.attrSet("src", rewritten);
    }
    token?.attrJoin("class", "lyra-agents-md-image");
    return self.renderToken(tokens, index, rendererOptions);
  };

  md.renderer.rules.table_open = (tokens, index) => {
    tokens[index]?.attrJoin("class", "lyra-agents-md-table");
    return '<div class="lyra-agents-md-table-wrap"><table class="lyra-agents-md-table">';
  };
  md.renderer.rules.table_close = () => "</table></div>";

  return md;
};

const getMarkdownIt = (mode: MarkdownRenderMode): MarkdownIt => {
  const existing = markdownInstances.get(mode);
  if (existing !== undefined) return existing;
  const created = createMarkdownIt(mode);
  markdownInstances.set(mode, created);
  return created;
};

const sanitizeHtml = (html: string): string => {
  if (typeof DOMPurify.sanitize !== "function") {
    return html;
  }
  installDomPurifyImageHook();
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["math", "semantics", "annotation", "mrow", "mi", "mn", "mo", "msup", "msub", "msubsup", "mfrac", "msqrt", "mroot", "mtext", "mtable", "mtr", "mtd", "munderover", "munder", "mover", "mpadded", "mspace"],
    ADD_ATTR: ["target", "rel", "data-language", "data-mermaid-id", "data-mermaid-hash", "aria-hidden", "aria-label", "encoding", "xmlns", "display", "mathvariant", "accent", "stretchy", "fence", "separator", "lspace", "rspace", "width", "height", "viewBox", "checked", "disabled", "type"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "button", "textarea", "select"],
    FORBID_ATTR: ["srcset"],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|file|lyra-file|blob):|data:image\/[a-z0-9.+-]+;base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/iu,
    ALLOW_DATA_ATTR: false
  });
};

export const sanitizeMermaidSvg = (svg: string): string =>
  DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true }
  });

export const renderMarkdown = (
  source: string,
  options: MarkdownRenderOptions
): MarkdownRenderResult => {
  const mode = options.mode;
  const mermaidJobs: MermaidRenderJob[] = [];
  const md = getMarkdownIt(mode);
  const previousFenceRule: MarkdownItFenceRule | undefined = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens: Token[], index: number, rendererOptions, env, self) => {
    const token = tokens[index];
    const language = normalizeFenceLanguage(token?.info ?? "");
    if (mode === "final" && language === "mermaid") {
      const sourceHash = markdownRenderSourceHash(token?.content ?? "");
      const id = `mermaid-${sourceHash}-${mermaidJobs.length}`;
      mermaidJobs.push({ id, source: token?.content ?? "", sourceHash });
      return [
        `<div class="lyra-markdown-mermaid" data-mermaid-id="${id}" data-mermaid-hash="${sourceHash}">`,
        `<pre class="lyra-markdown-mermaid-source"><code>${escapeHtml(token?.content ?? "")}</code></pre>`,
        "</div>"
      ].join("");
    }
    const languageClass = language.length > 0 ? ` class="language-${escapeHtml(language)}"` : "";
    const dataLanguage = language.length > 0 ? ` data-language="${escapeHtml(language)}"` : "";
    return `<pre class="lyra-agents-md-code-block"${dataLanguage}><code${languageClass}>${escapeHtml(token?.content ?? "")}</code></pre>\n`;
  };

  try {
    const rendered = md.render(source);
    return {
      html: sanitizeHtml(rendered),
      mermaidJobs
    };
  } finally {
    md.renderer.rules.fence = previousFenceRule;
  }
};
