import { type ReactNode } from "react";
import type {
  ToolDetails as ToolDetailsType,
  WorkbenchTabSummary
} from "../../core/types";
import { t } from "@workbench/i18n";
import { languageFromPathAndContent } from "@workbench/syntax/language-from-path";
import { HighlightedSource } from "@workbench/syntax/highlighted-source";
import { splitCommandDump } from "@workbench/agent-session-view-model/tool-parsing/terminal";
import { useData } from "../../data/DataProvider";
import {
  ActionTargetList,
  ActionText,
  ClickableImage
} from "../rich-text/ActionTargets";
import { TerminalToolCard } from "./TerminalToolCard";
import { AppButton, AppShimmer } from "@renderer/ui/components";
import { VirtualizedDiffView } from "./VirtualizedDiffView";
import { EDIT_CARD_WAITING_CLASS, EDIT_DETAILS_CLASS, TASK_CARD_CLASS, TASK_CARD_HEAD_CLASS, TASK_ITEM_CLASS } from "../chat/classes";
import { TOOL_INFO_PRE_CLASS } from "./classes";
import {
  INFO_BLOCK_CLASS,
  INFO_DIM_CLASS,
  INFO_LINE_CLASS,
  INFO_STRONG_CLASS,
  SEARCH_PATH_BUTTON_CLASS,
  SEARCH_ROW_CLASS,
  SEARCH_TEXT_CLASS,
  SHELL_COMMAND_CLASS,
  SHELL_EXIT_CLASS,
  SHELL_PROMPT_CLASS,
  TOOL_MONO_TEXT_CLASS,
  TOOL_RESULT_ITEM_CLASS,
  TOOL_RESULT_LINE_CLASS,
  TOOL_RESULT_META_CLASS,
  TOOL_SCREENSHOT_CONTAINER_CLASS,
  TOOL_SCREENSHOT_IMG_CLASS
} from "./classes";

function ToolDump({
  code,
  language
}: {
  readonly code: string;
  readonly language: string;
}) {
  if (code.length === 0) {
    return null;
  }
  return (
    <HighlightedSource
      code={code}
      language={language}
      className="lyra-agents-tool-dump"
    />
  );
}

/**
 * Level-3 renderer. The surrounding `.lyra-agents-tool-call-body` is the
 * rounded dump card; this paints the contents inside it.
 */
export function ToolDetails({
  details,
  running = false
}: {
  details: ToolDetailsType;
  running?: boolean;
}) {
  switch (details.type) {
    case "edit":
      return <EditCard details={details} running={running} />;
    case "read":
      return <ReadCard details={details} />;
    case "search":
      return <SearchCard details={details} />;
    case "shell":
      return <ShellCard details={details} />;
    case "terminal":
      return <TerminalToolCard details={details} />;
    case "web":
      return <WebCard details={details} />;
    case "workbench":
      return <WorkbenchCard details={details} />;
    case "lumen":
      return <LumenCard details={details} />;
    case "software":
      return <SoftwareCard details={details} />;
    case "task":
      return <TaskCard details={details} />;
    case "text":
      return <ToolDump code={details.body} language={languageFromPathAndContent("", details.body)} />;
    case "ask":
      return <AskCard details={details} />;
  }
}

function LumenCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "lumen" }>;
}) {
  return (
    <div className={`${INFO_BLOCK_CLASS} lyra-agents-lumen-card`}>
      {details.screenshot && (
        <div className={TOOL_SCREENSHOT_CONTAINER_CLASS}>
          <ClickableImage
            src={details.screenshot}
            alt={t("tool.lumenSnapshotAlt")}
            image={details.screenshotImage}
            className={TOOL_SCREENSHOT_IMG_CLASS}
            allowTargetFallback={false}
          />
        </div>
      )}
      {details.text ? (
        <ToolDump
          code={details.text}
          language={languageFromPathAndContent("", details.text)}
        />
      ) : null}
    </div>
  );
}

function SoftwareCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "software" }>;
}) {
  return (
    <div className={INFO_BLOCK_CLASS}>
      <ActionTargetList targets={details.targets} />
      {details.text ? (
        <ToolDump
          code={details.text}
          language={languageFromPathAndContent("", details.text)}
        />
      ) : null}
    </div>
  );
}

function EditCard({
  details,
  running = false,
}: {
  details: Extract<ToolDetailsType, { type: "edit" }>;
  running?: boolean;
}) {
  const hasDiff = details.hunks.length > 0;

  return (
    <div className={`${INFO_BLOCK_CLASS} ${EDIT_DETAILS_CLASS}`}>
      {running && !hasDiff ? (
        <AppShimmer
          as="div"
          text={t("tool.streamingDiff")}
          className={EDIT_CARD_WAITING_CLASS}
        />
      ) : null}
      <VirtualizedDiffView hunks={details.hunks} running={running} />
    </div>
  );
}

function ReadCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "read" }>;
}) {
  if (details.preview === undefined && details.range === undefined) {
    return null;
  }
  return (
    <div className={INFO_BLOCK_CLASS}>
      {details.range === undefined ? null : (
        <div className={INFO_LINE_CLASS}>
          <span className={INFO_DIM_CLASS}>:{details.range}</span>
        </div>
      )}
      {details.preview === undefined ? null : (
        <ToolDump
          code={details.preview}
          language={languageFromPathAndContent(details.file, details.preview)}
        />
      )}
    </div>
  );
}

function SearchCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "search" }>;
}) {
  return (
    <div className={INFO_BLOCK_CLASS}>
      <div className={INFO_LINE_CLASS}>
        <span className={INFO_DIM_CLASS}>{t("tool.searchQueryLabel")}</span>
        <span className={INFO_STRONG_CLASS}>{details.query}</span>
      </div>
      <div className="lyra-agents-tool-result-list lyra-agents-search-results select-text">
        {details.results.map((r, i) => (
          <div key={i} className={SEARCH_ROW_CLASS}>
            <FileOpenButton filePath={`${r.file}:${r.line}`} className={`lyra-agents-tool-result-line ${TOOL_RESULT_LINE_CLASS} ${INFO_DIM_CLASS} ${SEARCH_PATH_BUTTON_CLASS}`}>
              {r.file}:{r.line}
            </FileOpenButton>
            <span className={SEARCH_TEXT_CLASS}>
              <ToolDump
                code={r.text}
                language={languageFromPathAndContent(r.file, r.text)}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ShellCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "shell" }>;
}) {
  const parts = splitCommandDump(details.command, details.output);
  return (
    <div className={INFO_BLOCK_CLASS}>
      {parts.command !== null ? (
        <div className={SHELL_COMMAND_CLASS}>
          <span className={SHELL_PROMPT_CLASS}>$</span>
          <ToolDump code={parts.command} language="shell" />
        </div>
      ) : null}
      {parts.output !== null ? <ToolDump code={parts.output} language="shell" /> : null}
      <div className={`${INFO_DIM_CLASS} ${SHELL_EXIT_CLASS}`}>exit {details.exitCode}</div>
    </div>
  );
}

function WebCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "web" }>;
}) {
  const { openUrlInWorkbench } = useData();
  const results = details.results ?? [];

  const openResult = (url: string, title?: string) => {
    void openUrlInWorkbench(url, title).catch(() => undefined);
  };

  return (
    <div className={INFO_BLOCK_CLASS}>
      {results.length > 0 ? (
        <>
          <div className={INFO_LINE_CLASS}>
            <span className={INFO_DIM_CLASS}>{t("tool.searchQueryLabel")}</span>
            <span className={INFO_STRONG_CLASS}>{details.query ?? details.url}</span>
          </div>
          <div className="lyra-agents-tool-result-list lyra-agents-web-results">
            {results.map((result, index) => (
              <div key={`${result.url}-${index}`} className={TOOL_RESULT_ITEM_CLASS}>
                <AppButton variant="ghost" size="sm"
                  type="button"
                  className={`${TOOL_RESULT_LINE_CLASS} lyra-agents-web-result-title`}
                  title={result.url}
                  onClick={() => openResult(result.url, result.title)}
                >
                  {result.title}
                </AppButton>
                <div className={`${TOOL_RESULT_META_CLASS} lyra-agents-web-result-url`}>
                  {webResultHost(result.url)}
                </div>
                {result.snippet ? (
                  <p className={`${TOOL_RESULT_META_CLASS} lyra-agents-web-result-snippet`}>
                    {result.snippet}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className={INFO_LINE_CLASS}>
            <span className={INFO_DIM_CLASS}>{t("tool.webUrlLabel")}</span>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={`${TOOL_RESULT_LINE_CLASS} lyra-agents-web-url-button`}
              title={details.url}
              onClick={() => openResult(details.url, details.title ?? details.url)}
            >
              {details.url}
            </AppButton>
          </div>
          {details.title && (
            <div className={`${TOOL_RESULT_LINE_CLASS} lyra-agents-web-fetch-title`}>{details.title}</div>
          )}
        </>
      )}
      {details.summary ? (
        <pre className={`${TOOL_INFO_PRE_CLASS} ${TOOL_MONO_TEXT_CLASS}`}>
          <ActionText text={details.summary} />
        </pre>
      ) : null}
      {details.screenshot && (
        <div className={TOOL_SCREENSHOT_CONTAINER_CLASS}>
          <ClickableImage
            src={details.screenshot}
            alt={t("tool.browserScreenshotAlt")}
            className={TOOL_SCREENSHOT_IMG_CLASS}
          />
        </div>
      )}
    </div>
  );
}

function WorkbenchCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "workbench" }>;
}) {
  const { openUrlInWorkbench } = useData();
  const tabs = details.tabs ?? (details.tab === undefined ? [] : [details.tab]);

  const openTabUrl = (tab: WorkbenchTabSummary) => {
    if (tab.url === undefined) return;
    void openUrlInWorkbench(tab.url, tab.title).catch(() => undefined);
  };

  return (
    <div className={INFO_BLOCK_CLASS}>
      {tabs.length > 0 && (
        <div className="lyra-agents-tool-result-list lyra-agents-workbench-tab-list">
          {tabs.map((tab) => (
            <WorkbenchTabRow
              key={`${tab.tabId}-${tab.url ?? tab.title}`}
              tab={tab}
              onOpen={() => openTabUrl(tab)}
            />
          ))}
        </div>
      )}

      {details.excerpt ? (
        <pre className={`${TOOL_INFO_PRE_CLASS} ${TOOL_MONO_TEXT_CLASS}`}>
          <ActionText text={details.excerpt} />
        </pre>
      ) : null}
      {details.text ? (
        <ToolDump
          code={details.text}
          language={languageFromPathAndContent("", details.text)}
        />
      ) : null}
    </div>
  );
}

function WorkbenchTabRow({
  tab,
  onOpen
}: {
  tab: WorkbenchTabSummary;
  onOpen: () => void;
}) {
  const hasUrl = tab.url !== undefined;
  if (hasUrl) {
    return (
      <AppButton variant="ghost" size="sm"
        type="button"
        className={`${TOOL_RESULT_LINE_CLASS} lyra-agents-workbench-tab-title`}
        title={tab.url}
        onClick={onOpen}
      >
        {tab.title}
      </AppButton>
    );
  }
  return (
    <div className={`${TOOL_RESULT_LINE_CLASS} lyra-agents-workbench-tab-title-static`}>
      {tab.title}
    </div>
  );
}

function FileOpenButton({
  filePath,
  className,
  children
}: {
  readonly filePath: string;
  readonly className: string;
  readonly children: ReactNode;
}) {
  const { openFileInWorkbench } = useData();
  return (
    <AppButton variant="ghost" size="sm"
      type="button"
      className={className}
      title={filePath}
      onClick={() => {
        void openFileInWorkbench(filePath).catch(() => undefined);
      }}
    >
      {children}
    </AppButton>
  );
}

function webResultHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

function TaskCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "task" }>;
}) {
  return (
    <div className={`${INFO_BLOCK_CLASS} ${TASK_CARD_CLASS}`}>
      <div className={`${TOOL_RESULT_LINE_CLASS} ${TASK_CARD_HEAD_CLASS}`}>{t("tool.executionPlan")}</div>
      <ul className="lyra-agents-tool-result-list lyra-agents-task-list">
        {details.tasks.map((task, i) => (
          <li key={i} className={`${TOOL_RESULT_LINE_CLASS} ${TASK_ITEM_CLASS} status-${task.status}`}>
            <AppShimmer text={task.title} active={task.status === "running"} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AskCard({
  details,
}: {
  details: Extract<ToolDetailsType, { type: "ask" }>;
}) {
  const answer = details.answer.trim();
  return (
    <div className={`${INFO_BLOCK_CLASS} lyra-agents-ask-card select-text`}>
      <pre className={`${TOOL_INFO_PRE_CLASS} lyra-agents-ask-question ${TOOL_MONO_TEXT_CLASS}`}>{details.question}</pre>
      {answer.length > 0 ? (
        <pre className={`${TOOL_INFO_PRE_CLASS} lyra-agents-ask-answer ${TOOL_MONO_TEXT_CLASS}`}>{answer}</pre>
      ) : null}
    </div>
  );
}
