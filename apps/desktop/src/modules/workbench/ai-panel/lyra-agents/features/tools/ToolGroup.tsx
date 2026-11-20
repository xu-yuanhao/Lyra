import { useRef } from "react";
import type { ToolCall, ToolGroup } from "../../core/types";
import {
  CheckCircleIcon,
  ChevronIcon,
  ErrorCircleIcon,
  ToolCallIcon,
  ToolIcon,
  WarningCircleIcon,
} from "../../components/Icons";
import { FileTypeIcon } from "../../components/FileTypeIcon";
import { ToolDetails } from "./ToolDetails";
import { useFoldAnchorVisible } from "../../hooks/useFoldAnchorVisible";
import { languageFromPath, looksLikeUnifiedDiff } from "@workbench/syntax/language-from-path";
import { HighlightedSource } from "@workbench/syntax/highlighted-source";
import { t } from "@workbench/i18n";
import { AppButton, AppShimmer } from "@renderer/ui/components";
import { useData } from "../../data/DataProvider";
import {
  ActionTargetList,
  ClickableImage,
} from "../rich-text/ActionTargets";
import {
  InlineDiffStats,
  editDiffCounts,
  shouldShowEditDiffStats
} from "./InlineDiffStats";
import { useToolAccordion } from "./tool-accordion";
import { useFollowBottomUntilHover } from "./use-follow-bottom-until-hover";
import { VirtualizedDiffView } from "./VirtualizedDiffView";
import { parseUnifiedDiff } from "@workbench/agent-session-view-model/tool-parsing/diff";
import { splitDisplayPath } from "../chat/changed-files";

export type ThinkingEntry = { id: string; body: string; status: "running" | "done" };
export type ToolGroupActivityEntry =
  | { type: "thinking"; id: string; entry: ThinkingEntry }
  | { type: "tool"; id: string; call: ToolCall };

/**
 * Level 1 head faces:
 *   - running: current activity icon + title (shimmering while collapsed)
 *   - error:   red ✗ — Lyra itself failed to run a tool
 *   - warning: yellow ! — tools ran, but a command/result reported failure
 *   - done:    green ✓ — every call succeeded
 */
export function ToolGroupBlock({
  group,
  thinkingEntries = [],
  activityEntries,
}: {
  group: ToolGroup;
  thinkingEntries?: ThinkingEntry[];
  activityEntries?: readonly ToolGroupActivityEntry[];
}) {
  const isRunning = group.status === "running";
  const isSuspended = group.status === "suspended";
  const activityRows = activityEntries ?? [
    ...thinkingEntries.map((entry) => ({ type: "thinking" as const, id: entry.id, entry })),
    ...group.calls.map((call) => ({ type: "tool" as const, id: call.id, call }))
  ];
  const accordion = useToolAccordion();
  const open = accordion.isGroupOpen(group.id, false);
  const { toggleGroup } = accordion;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const anchorVisible = useFoldAnchorVisible(anchorRef);
  const hasError = group.calls.some((c) => c.status === "error");
  const hasWarning = group.calls.some((c) => c.status === "warning");
  const currentCall =
    (isRunning || isSuspended) && group.currentCallId
      ? group.calls.find((c) => c.id === group.currentCallId)
      : undefined;

  const mode = isRunning
    ? "running"
    : isSuspended
      ? "suspended"
      : hasError
        ? "error"
        : hasWarning
          ? "warning"
          : "done";
  const currentEditStats = editDiffCounts(currentCall?.details);
  const showGroupEditStats = shouldShowEditDiffStats(currentEditStats);

  return (
    <div className={`lyra-agents-tool-group ${open ? "open" : ""} lyra-agents-mode-${mode}`}>
      <AppButton variant="ghost" size="sm"
        type="button"
        className="lyra-agents-tool-group-head"
        onClick={() => toggleGroup(group.id, open)}
        aria-expanded={open}
      >
        <span ref={anchorRef} className="lyra-agents-tool-group-icon-slot">
          <span className="lyra-agents-tool-group-lead">
            {(isRunning || isSuspended) && currentCall ? (
              <ToolCallIcon call={currentCall} />
            ) : hasError ? (
              <ErrorCircleIcon />
            ) : hasWarning ? (
              <WarningCircleIcon />
            ) : isRunning ? (
              <ToolIcon kind="thought" />
            ) : (
              <CheckCircleIcon />
            )}
          </span>
          <span className="lyra-agents-chevron-slot">
            <ChevronIcon open={open} />
          </span>
        </span>

        <span className="lyra-agents-tool-group-label">
          {isRunning && !open ? (
            <AppShimmer text={group.label} />
          ) : (
            group.label
          )}
        </span>
        {showGroupEditStats ? (
          <InlineDiffStats
            additions={currentEditStats.additions}
            deletions={currentEditStats.deletions}
          />
        ) : null}
      </AppButton>

      {open && !anchorVisible && (
        <AppButton
          variant="ghost"
          size="icon"
          className="lyra-agents-fold-line lyra-agents-fold-line-group"
          onClick={() => toggleGroup(group.id, true)}
          aria-label={t("tool.collapseGroup")}
        />
      )}

      {open ? (
        <div className="lyra-agents-tool-group-body">
          {activityRows.map((row, i) => (
            <div
              key={row.id}
              className="lyra-agents-stagger-item"
              style={{ "--stagger-index": i } as React.CSSProperties}
            >
              {row.type === "thinking" ? (
                <ThinkingRow
                  entry={row.entry}
                  groupId={group.id}
                  groupOpen={open}
                />
              ) : (
                <ToolCallRow
                  call={row.call}
                  groupId={group.id}
                  groupOpen={open}
                />
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const editFileLabel = (filePath: string): string => {
  const { filename } = splitDisplayPath(filePath);
  return filename.length > 0 ? filename : filePath;
};

function ToolCallRow({
  call,
  groupId,
  groupOpen
}: {
  call: ToolCall;
  groupId: string;
  groupOpen: boolean;
}) {
  const accordion = useToolAccordion();
  const { openSubagent } = useData();
  const subagentId = call.subagentId?.trim() ?? "";
  const isSubagent = subagentId.length > 0;
  const open = groupOpen && accordion.isEntryOpen(call.id, false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorVisible = useFoldAnchorVisible(anchorRef);
  const hasArtifacts =
    (call.artifactTargets?.length ?? 0) > 0 ||
    (call.artifactPreviews?.length ?? 0) > 0;
  const hasDetails = !!call.details || hasArtifacts;
  const followBottom = useFollowBottomUntilHover(
    scrollerRef,
    open && hasDetails,
    call.details ?? call.artifactPreviews ?? call.artifactTargets,
  );
  const editStats = editDiffCounts(call.details);
  const showRowEditStats = shouldShowEditDiffStats(editStats);
  const canToggle = hasDetails;
  const toggle = (): void => {
    if (!canToggle) {
      return;
    }
    accordion.toggleEntry(groupId, call.id, open);
  };

  return (
    <div className={`lyra-agents-tool-call ${open ? "open" : ""} lyra-agents-status-${call.status}`}>
      <div className={`lyra-agents-tool-call-head-row ${hasDetails || isSubagent ? "has-details" : ""}`}>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className="lyra-agents-tool-call-twist"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t("tool.collapseCall") : t("tool.expandCall")}
          disabled={!canToggle}
        >
          <span ref={anchorRef} className="lyra-agents-icon-swap">
            <span className="lyra-agents-icon-swap-tool">
              <ToolCallIcon call={call} />
            </span>
            <span className="lyra-agents-icon-swap-chevron">
              <ChevronIcon open={open} />
            </span>
          </span>
        </AppButton>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className={`lyra-agents-tool-call-head ${hasDetails || isSubagent ? "has-details" : ""}`}
          onClick={() => {
            if (isSubagent) {
              openSubagent(subagentId, call.title);
              return;
            }
            toggle();
          }}
          aria-label={isSubagent ? t("tool.openSubagentWorkspace") : undefined}
          aria-expanded={isSubagent ? undefined : open}
          disabled={!hasDetails && !isSubagent}
        >
          <ToolCallHeadLabel
            call={call}
            shimmer={groupOpen && call.status === "running"}
          />
          {showRowEditStats ? (
            <InlineDiffStats
              additions={editStats.additions}
              deletions={editStats.deletions}
            />
          ) : null}
        </AppButton>
      </div>

      {open && hasDetails ? (
        <>
          {anchorVisible ? null : (
            <AppButton
              variant="ghost"
              size="icon"
              className="lyra-agents-fold-line lyra-agents-fold-line-call"
              onClick={toggle}
              aria-label={t("tool.collapseCall")}
            />
          )}
          <div
            ref={scrollerRef}
            className="lyra-agents-tool-call-body"
            data-scrollable="true"
            onMouseEnter={followBottom.onMouseEnter}
            onMouseLeave={followBottom.onMouseLeave}
          >
            {call.details ? (
              <ToolDetails details={call.details} running={call.status === "running"} />
            ) : null}
            {hasArtifacts ? (
              <ToolArtifacts call={call} />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

const artifactMediaSource = (
  target: NonNullable<ToolCall["artifactTargets"]>[number]
): string | null => {
  if (/^lyra-file:\/\//iu.test(target.value)) {
    return target.value;
  }
  // Generated media is downloaded into the local Artifact store before it is
  // shown. Do not auto-load arbitrary remote targets while rendering history:
  // that would disclose message-view activity to a third party.
  if (/^[a-z][a-z\d+.-]*:\/\//iu.test(target.value)) return null;
  return `lyra-file://preview?path=${encodeURIComponent(target.value)}&contentType=${encodeURIComponent(target.mediaType ?? "application/octet-stream")}`;
};

function ToolArtifacts({ call }: { readonly call: ToolCall }) {
  const detailPreviewSource = call.details?.type === "lumen" || call.details?.type === "web"
    ? call.details.screenshot
    : undefined;
  const artifactTargets = (call.artifactTargets ?? []).filter(
    (target) => target.value !== detailPreviewSource
  );
  const mediaTargets = artifactTargets.filter((target) =>
    /^(?:image|audio|video)\//iu.test(target.mediaType ?? "")
  );
  return (
    <div className="lyra-agents-tool-artifacts">
      {mediaTargets.map((target) => {
        const mediaType = target.mediaType?.toLowerCase() ?? "";
        const source = artifactMediaSource(target);
        if (source === null) return null;
        if (mediaType.startsWith("image/")) {
          return (
            <ClickableImage
              key={`${target.kind}:${target.value}`}
              src={source}
              alt={target.label}
              className="lyra-agents-tool-artifact-image"
            />
          );
        }
        if (mediaType.startsWith("audio/")) {
          return (
            <audio
              key={`${target.kind}:${target.value}`}
              className="lyra-agents-tool-artifact-audio"
              controls
              preload="metadata"
              src={source}
              aria-label={target.label}
            />
          );
        }
        return (
          <video
            key={`${target.kind}:${target.value}`}
            className="lyra-agents-tool-artifact-video"
            controls
            preload="metadata"
            src={source}
            aria-label={target.label}
          />
        );
      })}
      {(call.artifactPreviews?.length ?? 0) > 0
        && !(call.details?.type === "edit" && call.details.hunks.length > 0) ? (
        <div className="lyra-agents-tool-artifact-preview-list">
          {call.artifactPreviews?.map((preview, index) => {
            const unified = looksLikeUnifiedDiff(preview.text)
              ? parseUnifiedDiff(preview.text)
              : null;
            return (
              <div className="lyra-agents-tool-artifact-preview" key={`${preview.path ?? preview.label}:${index}`}>
                <div className="lyra-agents-tool-artifact-preview-head">
                  <span>{preview.label}</span>
                  <AppButton
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(preview.text)}
                  >
                    {t("dialog.copyAction")}
                  </AppButton>
                </div>
                {unified !== null && unified.hunks.length > 0 ? (
                  <VirtualizedDiffView hunks={unified.hunks} />
                ) : (
                  <HighlightedSource
                    code={preview.text}
                    language={unified !== null ? "diff" : languageFromPath(preview.path ?? preview.label)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      <ActionTargetList targets={artifactTargets} />
    </div>
  );
}

function ToolCallHeadLabel({
  call,
  shimmer = false
}: {
  readonly call: ToolCall;
  readonly shimmer?: boolean;
}) {
  const targetFile = call.details?.type === "edit" || call.details?.type === "read"
    ? call.details.file
    : undefined;
  const { openFileInWorkbench } = useData();
  const openTargetFile = (event: { stopPropagation: () => void }) => {
    if (targetFile === undefined) return;
    event.stopPropagation();
    void openFileInWorkbench(targetFile).catch(() => undefined);
  };

  return (
    <span className="lyra-agents-tool-call-head-label">
      <AppShimmer
        text={call.title}
        active={shimmer}
        className="lyra-agents-tool-call-title"
      />
      {targetFile !== undefined ? (
        <span
          role="button"
          tabIndex={0}
          className="lyra-agents-tool-call-target"
          title={targetFile}
          onClick={openTargetFile}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            openTargetFile(event);
          }}
        >
          <span className="lyra-agents-tool-call-file-icon" aria-hidden="true">
            <FileTypeIcon filename={targetFile} size={14} />
          </span>
          <span className="lyra-agents-tool-call-target-name">{editFileLabel(targetFile)}</span>
        </span>
      ) : null}
    </span>
  );
}

function ThinkingRow({
  entry,
  groupId,
  groupOpen
}: {
  readonly entry: ThinkingEntry;
  readonly groupId: string;
  readonly groupOpen: boolean;
}) {
  const accordion = useToolAccordion();
  const isRunning = entry.status === "running";
  const open = groupOpen && accordion.isEntryOpen(entry.id, false);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const anchorVisible = useFoldAnchorVisible(anchorRef);
  const followBottom = useFollowBottomUntilHover(scrollerRef, open, entry.body);
  const toggle = (): void => {
    accordion.toggleEntry(groupId, entry.id, open);
  };
  return (
    <div className={`lyra-agents-tool-call ${open ? "open" : ""} lyra-agents-status-${entry.status}`}>
      <div className="lyra-agents-tool-call-head-row has-details">
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className="lyra-agents-tool-call-twist"
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t("tool.collapseCall") : t("tool.expandCall")}
        >
          <span ref={anchorRef} className="lyra-agents-icon-swap">
            <span className="lyra-agents-icon-swap-tool">
              <ToolIcon kind="thought" />
            </span>
            <span className="lyra-agents-icon-swap-chevron">
              <ChevronIcon open={open} />
            </span>
          </span>
        </AppButton>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className="lyra-agents-tool-call-head has-details"
          onClick={toggle}
          aria-expanded={open}
        >
          <span className="lyra-agents-tool-call-head-label">
            <AppShimmer
              text={isRunning
                ? t("lyra-agents-message.thinkingInProgress")
                : t("lyra-agents-message.thinkingLabel")}
              active={groupOpen && isRunning}
              className="lyra-agents-tool-call-title"
            />
          </span>
        </AppButton>
      </div>
      {open && !anchorVisible ? (
        <AppButton
          variant="ghost"
          size="icon"
          className="lyra-agents-fold-line lyra-agents-fold-line-call"
          onClick={toggle}
          aria-label={t("tool.collapseCall")}
        />
      ) : null}
      {open ? (
        <div
          ref={scrollerRef}
          className="lyra-agents-tool-call-body"
          data-scrollable="true"
          onMouseEnter={followBottom.onMouseEnter}
          onMouseLeave={followBottom.onMouseLeave}
        >
          <div className="lyra-agents-thinking-body">{entry.body}</div>
        </div>
      ) : null}
    </div>
  );
}
