import type { ToolDetails as ToolDetailsType } from "../../core/types";
import { HighlightedSource } from "@workbench/syntax/highlighted-source";
import { splitCommandDump } from "@workbench/agent-session-view-model/tool-parsing/terminal";
import { INFO_BLOCK_CLASS, INFO_DIM_CLASS, SHELL_COMMAND_CLASS, SHELL_EXIT_CLASS, SHELL_PROMPT_CLASS } from "./classes";

type TerminalToolDetails = Extract<ToolDetailsType, { type: "terminal" }>;

export function TerminalToolCard({
  details
}: {
  readonly details: TerminalToolDetails;
}) {
  const command = details.command ?? details.wrote;
  const screenText = details.screen?.visibleText;
  const dump = typeof screenText === "string" && screenText.trim().length > 0
    ? screenText
    : details.output;
  const parts = splitCommandDump(command, dump);

  return (
    <div className={INFO_BLOCK_CLASS}>
      {parts.command !== null ? (
        <div className={SHELL_COMMAND_CLASS}>
          <span className={SHELL_PROMPT_CLASS}>$</span>
          <HighlightedSource
            code={parts.command}
            language="shell"
            className="lyra-agents-tool-dump"
          />
        </div>
      ) : null}
      {parts.output !== null ? (
        <HighlightedSource
          code={parts.output}
          language="shell"
          className="lyra-agents-tool-dump"
        />
      ) : null}
      {!details.running && details.exitCode !== null && details.exitCode !== undefined ? (
        <div className={`${INFO_DIM_CLASS} ${SHELL_EXIT_CLASS}`}>exit {details.exitCode}</div>
      ) : null}
    </div>
  );
}
