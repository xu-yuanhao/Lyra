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
import {
  CHEVRON_SLOT_CLASS,
  FOLD_LINE_CLASS,
  ICON_SWAP_CHEVRON_CLASS,
  ICON_SWAP_CLASS,
  ICON_SWAP_TOOL_CLASS,
  STAGGER_ITEM_CLASS,
  THINKING_BODY_CLASS,
  TOOL_CALL_BODY_CLASS,
  TOOL_CALL_BODY_DESCENDANT_CLASS,
  TOOL_CALL_CLASS,
  TOOL_CALL_FILE_ICON_CLASS,
  TOOL_CALL_HEAD_CLASS,
  TOOL_CALL_HEAD_LABEL_CLASS,
  TOOL_CALL_HEAD_ROW_CLASS,
  TOOL_CALL_TARGET_CLASS,
  TOOL_CALL_TARGET_NAME_CLASS,
  TOOL_CALL_TITLE_CLASS,
  TOOL_ARTIFACTS_CLASS,
  TOOL_ARTIFACT_AUDIO_CLASS,
  TOOL_ARTIFACT_MEDIA_CLASS,
  TOOL_ARTIFACT_PREVIEW_CLASS,
  TOOL_ARTIFACT_PREVIEW_HEAD_CLASS,
  TOOL_ARTIFACT_PREVIEW_LIST_CLASS,
  TOOL_CALL_TWIST_CLASS,
  TOOL_GROUP_BODY_CLASS,
  TOOL_GROUP_CLASS,
  TOOL_GROUP_HEAD_CLASS,
  TOOL_GROUP_ICON_SLOT_CLASS,
  TOOL_GROUP_LABEL_CLASS,
  TOOL_GROUP_LEAD_CLASS,
  toolCallStatusIconClass
} from "./classes";

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
    <div className={`${TOOL_GROUP_CLASS} ${open ? "open" : ""} lyra-agents-mode-${mode}`}>
      <AppButton variant="ghost" size="sm"
        type="button"
        className={TOOL_GROUP_HEAD_CLASS}
        onClick={() => toggleGroup(group.id, open)}
        aria-expanded={open}
      >
        <span ref={anchorRef} className={TOOL_GROUP_ICON_SLOT_CLASS}>
          <span className={TOOL_GROUP_LEAD_CLASS}>
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
          <span className={CHEVRON_SLOT_CLASS}>
            <ChevronIcon open={open} />
          </span>
        </span>

        <span className={TOOL_GROUP_LABEL_CLASS}>
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
          className={`${FOLD_LINE_CLASS} left-0`}
          onClick={() => toggleGroup(group.id, true)}
          aria-label={t("tool.collapseGroup")}
        />
      )}

      {open ? (
        <div className={TOOL_GROUP_BODY_CLASS}>
          {activityRows.map((row, i) => (
            <div
              key={row.id}
              className={STAGGER_ITEM_CLASS}
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
  const { openFileInWorkbench, openSubagent } = useData();
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
  const targetFile = call.details?.type === "edit" || call.details?.type === "read"
    ? call.details.file
    : undefined;
  const openTargetFile = (event: { stopPropagation: () => void }) => {
    if (targetFile === undefined) return;
    event.stopPropagation();
    void openFileInWorkbench(targetFile).catch(() => undefined);
  };
  const toggle = (): void => {
    if (!canToggle) {
      return;
    }
    accordion.toggleEntry(groupId, call.id, open);
  };

  return (
    <div className={`${TOOL_CALL_CLASS} ${open ? "open" : ""} lyra-agents-status-${call.status} ${toolCallStatusIconClass(call.status)}`}>
      <div className={`${TOOL_CALL_HEAD_ROW_CLASS} ${hasDetails || isSubagent ? "has-details" : ""}`}>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className={TOOL_CALL_TWIST_CLASS}
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t("tool.collapseCall") : t("tool.expandCall")}
          disabled={!canToggle}
        >
          <span ref={anchorRef} className={ICON_SWAP_CLASS}>
            <span className={ICON_SWAP_TOOL_CLASS}>
              <ToolCallIcon call={call} />
            </span>
            <span className={ICON_SWAP_CHEVRON_CLASS}>
              <ChevronIcon open={open} />
            </span>
          </span>
        </AppButton>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className={`${TOOL_CALL_HEAD_CLASS} ${hasDetails || isSubagent ? "has-details" : ""}`}
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
        </AppButton>
        {targetFile !== undefined ? (
          <AppButton
            variant="plain"
            className={TOOL_CALL_TARGET_CLASS}
            title={targetFile}
            onClick={openTargetFile}
          >
            <span className={TOOL_CALL_FILE_ICON_CLASS} aria-hidden="true">
              <FileTypeIcon filename={targetFile} size={14} />
            </span>
            <span className={TOOL_CALL_TARGET_NAME_CLASS}>{editFileLabel(targetFile)}</span>
          </AppButton>
        ) : null}
        {showRowEditStats ? (
          <InlineDiffStats
            additions={editStats.additions}
            deletions={editStats.deletions}
          />
        ) : null}
      </div>

      {open && hasDetails ? (
        <>
          {anchorVisible ? null : (
            <AppButton
              variant="ghost"
              size="icon"
              className={`${FOLD_LINE_CLASS} left-0`}
              onClick={toggle}
              aria-label={t("tool.collapseCall")}
            />
          )}
          <div
            ref={scrollerRef}
            className={`${TOOL_CALL_BODY_CLASS} ${TOOL_CALL_BODY_DESCENDANT_CLASS}`}
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
    <div className={TOOL_ARTIFACTS_CLASS}>
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
              className={TOOL_ARTIFACT_MEDIA_CLASS}
            />
          );
        }
        if (mediaType.startsWith("audio/")) {
          return (
            <audio
              key={`${target.kind}:${target.value}`}
              className={TOOL_ARTIFACT_AUDIO_CLASS}
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
            className={TOOL_ARTIFACT_MEDIA_CLASS}
            controls
            preload="metadata"
            src={source}
            aria-label={target.label}
          />
        );
      })}
      {(call.artifactPreviews?.length ?? 0) > 0
        && !(call.details?.type === "edit" && call.details.hunks.length > 0) ? (
        <div className={TOOL_ARTIFACT_PREVIEW_LIST_CLASS}>
          {call.artifactPreviews?.map((preview, index) => {
            const unified = looksLikeUnifiedDiff(preview.text)
              ? parseUnifiedDiff(preview.text)
              : null;
            return (
              <div className={TOOL_ARTIFACT_PREVIEW_CLASS} key={`${preview.path ?? preview.label}:${index}`}>
                <div className={TOOL_ARTIFACT_PREVIEW_HEAD_CLASS}>
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
  return (
    <span className={TOOL_CALL_HEAD_LABEL_CLASS}>
      <AppShimmer
        text={call.title}
        active={shimmer}
        className={TOOL_CALL_TITLE_CLASS}
      />
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
    <div className={`${TOOL_CALL_CLASS} ${open ? "open" : ""} lyra-agents-status-${entry.status} ${toolCallStatusIconClass(entry.status)}`}>
      <div className={`${TOOL_CALL_HEAD_ROW_CLASS} has-details`}>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className={TOOL_CALL_TWIST_CLASS}
          onClick={toggle}
          aria-expanded={open}
          aria-label={open ? t("tool.collapseCall") : t("tool.expandCall")}
        >
          <span ref={anchorRef} className={ICON_SWAP_CLASS}>
            <span className={ICON_SWAP_TOOL_CLASS}>
              <ToolIcon kind="thought" />
            </span>
            <span className={ICON_SWAP_CHEVRON_CLASS}>
              <ChevronIcon open={open} />
            </span>
          </span>
        </AppButton>
        <AppButton
          variant="ghost"
          size="sm"
          type="button"
          className={`${TOOL_CALL_HEAD_CLASS} has-details`}
          onClick={toggle}
          aria-expanded={open}
        >
          <span className={TOOL_CALL_HEAD_LABEL_CLASS}>
            <AppShimmer
              text={isRunning
                ? t("lyra-agents-message.thinkingInProgress")
                : t("lyra-agents-message.thinkingLabel")}
              active={groupOpen && isRunning}
              className={TOOL_CALL_TITLE_CLASS}
            />
          </span>
        </AppButton>
      </div>
      {open && !anchorVisible ? (
        <AppButton
          variant="ghost"
          size="icon"
          className={`${FOLD_LINE_CLASS} left-0`}
          onClick={toggle}
          aria-label={t("tool.collapseCall")}
        />
      ) : null}
      {open ? (
        <div
          ref={scrollerRef}
          className={`${TOOL_CALL_BODY_CLASS} ${TOOL_CALL_BODY_DESCENDANT_CLASS}`}
          data-scrollable="true"
          onMouseEnter={followBottom.onMouseEnter}
          onMouseLeave={followBottom.onMouseLeave}
        >
          <div className={THINKING_BODY_CLASS}>{entry.body}</div>
        </div>
      ) : null}
    </div>
  );
}
