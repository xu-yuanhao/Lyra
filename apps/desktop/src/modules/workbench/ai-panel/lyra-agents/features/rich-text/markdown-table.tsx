import { useRef, type ComponentProps } from "react";
import { extractTableDataFromElement, tableDataToMarkdown } from "streamdown";

import { MarkdownCitationButton } from "./markdown-citation";
import {
  RT_MARKDOWN_TABLE_BLOCK_CLASS,
  RT_MARKDOWN_TABLE_ACTIONS_CLASS,
  RT_MD_TABLE_WRAP_CLASS,
  RT_MD_TABLE_CLASS,
} from "./classes";

export function LyraMarkdownTable({ children, node: _node, className, ...props }: ComponentProps<"table"> & {
  readonly node?: unknown;
}) {
  const tableRef = useRef<HTMLTableElement>(null);
  return (
    <div className={RT_MARKDOWN_TABLE_BLOCK_CLASS}>
      <div className={RT_MARKDOWN_TABLE_ACTIONS_CLASS}>
        <MarkdownCitationButton
          getTarget={() => tableRef.current}
          getQuote={(table) => tableDataToMarkdown(extractTableDataFromElement(table))}
        />
      </div>
      <div className={RT_MD_TABLE_WRAP_CLASS}>
        <table {...props} ref={tableRef} data-streamdown="table" className={[RT_MD_TABLE_CLASS, className].filter(Boolean).join(" ")}>
          {children}
        </table>
      </div>
    </div>
  );
}
