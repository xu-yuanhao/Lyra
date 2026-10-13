/**
 * Split streaming Markdown into frozen prefix blocks and a live tail.
 *
 * Streamdown already memoizes completed inner blocks. Feeding the whole
 * growing document every token still reparses settled prose. Settled chunks
 * keep a stable React identity (same Streamdown, same plugins, same CSS).
 * Only the tail re-parses.
 *
 * A block settles only on a blank line outside a fence or display-math span,
 * so a later closer cannot rewrite an already-painted paragraph. Partial
 * trailing lines stay in the tail (they may still open a fence).
 */

const FENCE_LINE = /^ {0,3}([`~]{3,})(.*)$/u;
const DOLLAR_OPEN = /^ {0,3}\$\$/u;
const DOLLAR_CLOSE = /\$\$[ \t]*$/u;
const BRACKET_OPEN = /^ {0,3}\\\[/u;
const BRACKET_CLOSE = /\\\][ \t]*$/u;

type FenceChar = "`" | "~";
type MathOpener = "$$" | "\\[";

type ScanState = {
  codeOpen: boolean;
  fenceChar: FenceChar | null;
  fenceLen: number;
  math: MathOpener | null;
};

export type SettledMarkdownChunks = {
  readonly settled: readonly string[];
  readonly tail: string;
};

const createScan = (): ScanState => ({
  codeOpen: false,
  fenceChar: null,
  fenceLen: 0,
  math: null
});

const normalizeNewlines = (text: string): string =>
  text.includes("\r") ? text.replace(/\r\n/g, "\n").replace(/\r/g, "\n") : text;

const isSingleLineDollarMath = (line: string): boolean => {
  if (!DOLLAR_OPEN.test(line)) return false;
  const trimmed = line.trim();
  return trimmed.length >= 4 && trimmed.endsWith("$$");
};

const isSingleLineBracketMath = (line: string): boolean =>
  BRACKET_OPEN.test(line) && BRACKET_CLOSE.test(line) && line.trim().length > 4;

const applyFence = (scan: ScanState, line: string): boolean => {
  const match = FENCE_LINE.exec(line);
  if (match === null) return false;
  const marker = match[1] ?? "";
  const info = match[2] ?? "";
  const char = marker[0];
  if (char !== "`" && char !== "~") return false;
  if (scan.codeOpen) {
    if (scan.fenceChar !== char || marker.length < scan.fenceLen || info.trim().length > 0) {
      return false;
    }
    scan.codeOpen = false;
    scan.fenceChar = null;
    scan.fenceLen = 0;
    return true;
  }
  if (info.includes(char)) return false;
  scan.codeOpen = true;
  scan.fenceChar = char;
  scan.fenceLen = marker.length;
  return true;
};

const applyLine = (scan: ScanState, line: string): void => {
  if (scan.codeOpen) {
    applyFence(scan, line);
    return;
  }
  if (scan.math !== null) {
    if (scan.math === "$$" && DOLLAR_CLOSE.test(line)) scan.math = null;
    else if (scan.math === "\\[" && BRACKET_CLOSE.test(line)) scan.math = null;
    return;
  }
  if (applyFence(scan, line)) return;
  if (DOLLAR_OPEN.test(line) && !isSingleLineDollarMath(line)) {
    scan.math = "$$";
    return;
  }
  if (BRACKET_OPEN.test(line) && !isSingleLineBracketMath(line)) {
    scan.math = "\\[";
  }
};

// GFM footnotes resolve only inside one MDAST tree. Splitting a finished
// paragraph away from `[^1]:` at the end of the document leaves the marks
// as literal text.
const hasFootnoteMarkup = (text: string): boolean => /\[\^[^\s\]]+\]/u.test(text);

/** Incremental scan state belongs to one rendered document, not a global cache. */
export class SettledMarkdownSplitter {
  private previous = "";
  private scan = createScan();
  private settled: string[] = [];
  private settledLen = 0;
  private index = 0;
  private dependentTail = false;
  private blockHasFootnote = false;

  split(text: string): SettledMarkdownChunks {
    const source = normalizeNewlines(text);
    if (!source.startsWith(this.previous)) {
      this.scan = createScan(); this.settled = []; this.settledLen = 0;
      this.index = 0; this.dependentTail = false; this.blockHasFootnote = false;
    }
    this.previous = source;
    while (!this.dependentTail && this.index < source.length) {
      const newline = source.indexOf("\n", this.index);
      if (newline < 0) break;
      const line = source.slice(this.index, newline);
      if (/^[ \t]*$/u.test(line)) {
        if (this.index > this.settledLen && !this.scan.codeOpen && this.scan.math === null) {
          const block = source.slice(this.settledLen, newline + 1);
          // A reference and its future definition share a parse tree. Earlier
          // unrelated paragraphs remain frozen; only this dependency suffix is live.
          if (this.blockHasFootnote) { this.dependentTail = true; break; }
          if (/\S/u.test(block)) {
            this.settled = [...this.settled, block];
            this.settledLen = newline + 1;
          }
        }
      } else {
        if (!this.scan.codeOpen && this.scan.math === null && !FENCE_LINE.test(line)) {
          const prose = line.replace(/(`+).*?\1/gu, "").replace(/\\\[/gu, "");
          this.blockHasFootnote ||= hasFootnoteMarkup(prose);
        }
        applyLine(this.scan, line);
      }
      this.index = newline + 1;
    }
    return { settled: this.settled, tail: source.slice(this.settledLen) };
  }
}

export const splitSettledMarkdown = (text: string): SettledMarkdownChunks =>
  new SettledMarkdownSplitter().split(text);
