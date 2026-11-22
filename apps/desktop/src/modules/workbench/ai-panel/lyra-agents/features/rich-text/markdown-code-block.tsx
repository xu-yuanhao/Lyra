import { Check, CodeXml, Copy, WrapText } from "@lyra/icons";
import { cloneElement, createContext, isValidElement, useContext, useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import { AppButton } from "@renderer/ui/components";
import { t } from "@workbench/i18n";
import { writeClipboardText } from "../../../../../../shared/clipboard";
import { MarkdownCitationButton } from "./markdown-citation";
import {
  RT_MARKDOWN_CODE_BLOCK_CLASS,
  RT_MARKDOWN_CODE_HEADER_CLASS,
  RT_MARKDOWN_CODE_LANGUAGE_CLASS,
  RT_MARKDOWN_CODE_ACTIONS_CLASS,
  RT_MARKDOWN_CODE_FEEDBACK_CLASS,
} from "./classes";

type CodeElementProps = ComponentProps<"code"> & { "data-block"?: string };
export const MarkdownStreamingContext = createContext(false);

/** Decorate the parsed fence, leaving highlighting, streaming and diagrams to Streamdown. */
export function LyraMarkdownPre({ children }: ComponentProps<"pre">) {
  const streaming = useContext(MarkdownStreamingContext);
  if (!isValidElement<CodeElementProps>(children)) return children;
  const block = cloneElement(children, { "data-block": "true" });
  const language = /(?:^|\s)language-(\S+)/u.exec(children.props.className ?? "")?.[1] ?? "";
  const code = children.props.children;
  if (typeof code !== "string" || (language === "mermaid" && !streaming)) return block;
  return <MarkdownCodeBlock code={code} language={language}>{block}</MarkdownCodeBlock>;
}

function MarkdownCodeBlock({ code, language, children }: {
  readonly code: string;
  readonly language: string;
  readonly children: ReactNode;
}) {
  const streaming = useContext(MarkdownStreamingContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const [selectionActive, setSelectionActive] = useState(false);
  // Do not replace selected plain source with highlighted spans at completion.
  // Once the selection clears, highlighting may proceed without losing it.
  useEffect(() => {
    if (!streaming && !selectionActive) return;
    const sync = () => {
      const selection = window.getSelection();
      setSelectionActive(selection !== null && !selection.isCollapsed
        && Boolean(rootRef.current?.contains(selection.anchorNode)
          || rootRef.current?.contains(selection.focusNode)));
    };
    document.addEventListener("selectionchange", sync);
    return () => document.removeEventListener("selectionchange", sync);
  }, [selectionActive, streaming]);
  const [wrapped, setWrapped] = useState(false);
  const [feedback, setFeedback] = useState<{ code: string; copied: boolean } | null>(null);
  const copyAttempt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    copyAttempt.current += 1;
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const result = feedback?.code === code ? feedback : null;
  const copyLabel = result === null ? t("richText.codeBlock.copy")
    : result.copied ? t("dialog.copiedAction") : t("richText.codeBlock.copyFailed");
  const copy = async () => {
    const attempt = ++copyAttempt.current;
    const copied = await writeClipboardText(code);
    if (attempt !== copyAttempt.current) return;
    setFeedback({ code, copied });
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setFeedback(null), 2_000);
  };

  return (
    <div ref={rootRef} className={RT_MARKDOWN_CODE_BLOCK_CLASS} data-wrap={wrapped} dir="ltr">
      <div className={RT_MARKDOWN_CODE_HEADER_CLASS}>
        <span className={RT_MARKDOWN_CODE_LANGUAGE_CLASS}>
          <CodeXml size={14} aria-hidden="true" />
          <span>{language || t("richText.codeBlock.text")}</span>
        </span>
        <div className={RT_MARKDOWN_CODE_ACTIONS_CLASS}>
          <AppButton
            variant="ghost" size="icon"
            aria-label={t("richText.codeBlock.wrap")}
            title={t("richText.codeBlock.wrap")}
            aria-pressed={wrapped}
            onClick={() => setWrapped((value) => !value)}
          ><WrapText size={16} aria-hidden="true" /></AppButton>
          <AppButton variant="ghost" size="icon" aria-label={copyLabel} title={copyLabel} onClick={() => void copy()}>
            {result?.copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </AppButton>
          <MarkdownCitationButton getTarget={() => rootRef.current?.querySelector("pre code") ?? null} getQuote={() => code} />
          <span className={RT_MARKDOWN_CODE_FEEDBACK_CLASS} role="status">
            {result === null ? "" : copyLabel}
          </span>
        </div>
      </div>
      {/* ZCode defers syntax highlighting until output completes. Keep the
          toolbar and exact copy source stable; avoid thousands of token spans
          and whole-fence highlighting on every incoming delta. */}
      {streaming || selectionActive ? (
        <div data-streamdown="code-block" data-language={language}>
          <div data-streamdown="code-block-body" data-code-streaming="true">
            <pre><code>{code.replace(/\n+$/u, "") || "\n"}</code></pre>
          </div>
        </div>
      ) : children}
    </div>
  );
}
