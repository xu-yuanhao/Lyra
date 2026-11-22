import { useEffect, useState, type CSSProperties } from "react";
import type { HighlightOptions } from "streamdown";

import { lyraCodePlugin } from "./code-plugin";

type HighlightResult = NonNullable<ReturnType<typeof lyraCodePlugin.highlight>>;
type SyntaxToken = HighlightResult["tokens"][number][number];

const tokenStyle = (token: SyntaxToken): CSSProperties => {
  const style: Record<string, string> = {};
  if (token.color !== undefined) {
    style["--sdm-c"] = token.color;
  }
  if (token.bgColor !== undefined) {
    style["--sdm-tbg"] = token.bgColor;
  }
  if (token.htmlStyle !== undefined && typeof token.htmlStyle === "object") {
    for (const [key, value] of Object.entries(token.htmlStyle)) {
      if (key === "color") {
        style["--sdm-c"] = value;
      } else if (key === "background-color") {
        style["--sdm-tbg"] = value;
      } else {
        style[key] = value;
      }
    }
  }
  return style;
};

const fallbackTokens = (code: string): HighlightResult["tokens"] =>
  code.split("\n").map((line) => [{ content: line, offset: 0 }]);

export function HighlightedSource({
  code,
  language,
  className
}: {
  readonly code: string;
  readonly language: string;
  readonly className?: string;
}) {
  const [tokens, setTokens] = useState<HighlightResult["tokens"]>(() => fallbackTokens(code));

  useEffect(() => {
    let active = true;
    const apply = (result: HighlightResult): void => {
      if (active) setTokens(result.tokens);
    };
    const next = lyraCodePlugin.highlight(
      { code, language: language as HighlightOptions["language"], themes: lyraCodePlugin.getThemes() },
      apply
    );
    if (next) {
      apply(next);
    } else {
      setTokens(fallbackTokens(code));
    }
    return () => { active = false; };
  }, [code, language]);

  return (
    <pre className={["lyra-syntax-source [&_span]:text-[color:var(--sdm-c,inherit)] dark:[&_span]:text-[color:var(--shiki-dark,var(--sdm-c,inherit))]", className].filter(Boolean).join(" ")} data-language={language}>
      <code>
        {tokens.map((line, lineIndex) => (
          <span className="lyra-syntax-source-line" key={lineIndex}>
            {line.map((token, tokenIndex) => (
              <span key={tokenIndex} style={tokenStyle(token)}>
                {token.content}
              </span>
            ))}
            {lineIndex < tokens.length - 1 ? "\n" : null}
          </span>
        ))}
      </code>
    </pre>
  );
}
