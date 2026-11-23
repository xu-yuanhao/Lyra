import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { AppEmptyState, AppLoadingState } from "@renderer/ui/components";

import type { AgentSessionSnapshot } from "../../../shared/desktop-bridge";
import { agentSessionToChatMessages } from "../agent-session-view-model";
import { inlineReferenceLabel } from "../ai-panel/lyra-agents/features/chat/message-citation";
import { messageVirtualizerOptions } from "../ai-panel/lyra-agents/features/chat/virtual-message-window";
import { DataContextProvider, Message, createDataProviderValue } from "../ai-panel/lyra-agents";
import type { ChatMessage } from "../ai-panel/lyra-agents/core/types";
import type { AgentSessionHistorySurfaceProps } from "./types";
import {
  HISTORY_PREVIEW_CHAT_CLASS,
  HISTORY_PREVIEW_CHAT_INNER_CLASS,
  HISTORY_PREVIEW_CLASS,
  HISTORY_PREVIEW_EMPTY_CLASS,
  HISTORY_PREVIEW_EMPTY_INLINE_CLASS,
  HISTORY_PREVIEW_STATE_CLASS
} from "./classes";
import { CHAT_INNER_CLASS, CHAT_MESSAGE_SLOT_CLASS, CHAT_SCROLL_CLASS } from "../ai-panel/classes";

const PreviewTranscript = ({
  messages,
  label
}: {
  readonly messages: readonly ChatMessage[];
  readonly label: string;
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const virtualizer = useVirtualizer(messageVirtualizerOptions(
    messages.length,
    () => scrollRef.current,
    (index) => messages[index]?.id ?? index
  ));

  return (
    <div
      ref={scrollRef}
      className={`${CHAT_SCROLL_CLASS} ${HISTORY_PREVIEW_CHAT_CLASS}`}
      role="log"
      aria-label={label}
    >
      <div
        className={`${CHAT_INNER_CLASS} ${HISTORY_PREVIEW_CHAT_INNER_CLASS}`}
        style={{ height: virtualizer.getTotalSize(), position: "relative" }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = messages[item.index];
          if (message === undefined) return null;
          return (
            <div
              key={message.id}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className={CHAT_MESSAGE_SLOT_CLASS}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <Message message={message} />
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const projectFolderNameFromPath = (value: string): string => {
  const normalized = value.trim().replace(/[\\/]+$/u, "");
  if (normalized.length === 0) {
    return value;
  }
  const parts = normalized.split(/[\\/]+/u);
  return parts[parts.length - 1] ?? normalized;
};

export const AgentSessionPreviewPane = ({
  snapshot,
  labels,
  loading
}: {
  readonly snapshot: AgentSessionSnapshot | null;
  readonly labels: AgentSessionHistorySurfaceProps["labels"];
  readonly loading: boolean;
}) => {
  if (loading) {
    return (
      <aside className={HISTORY_PREVIEW_CLASS} aria-label={labels.previewTitle}>
        <AppLoadingState className={HISTORY_PREVIEW_STATE_CLASS} title={labels.loading} />
      </aside>
    );
  }

  if (snapshot === null) {
    return (
      <aside className={HISTORY_PREVIEW_CLASS} aria-label={labels.previewTitle}>
        <AppEmptyState
          className={HISTORY_PREVIEW_EMPTY_CLASS}
          title={labels.previewEmptyTitle}
        />
      </aside>
    );
  }

  const messages = agentSessionToChatMessages(snapshot).map((message) => ({
    ...message,
    rollback: null
  }));
  const workingDir = (snapshot.workingDir ?? "").trim();
  const dataValue = createDataProviderValue({
    session: {
      id: snapshot.id,
      title: snapshot.title,
      project: snapshot.projectBound && workingDir.length > 0
        ? projectFolderNameFromPath(workingDir)
        : "",
      workingDir: workingDir.length > 0 ? workingDir : null,
      projectBound: snapshot.projectBound,
      workingDirIsHome: snapshot.workingDirIsHome === true,
      totalAdditions: 0,
      totalDeletions: 0,
      tokenEstimate: snapshot.tokenEstimate ?? null
    },
    messages,
    isTurnRunning: snapshot.turnStatus === "running",
    followActivity: snapshot.follow.activity ?? null
  });

  return (
    <aside className={HISTORY_PREVIEW_CLASS} aria-label={labels.previewTitle}>
      {messages.length === 0 ? (
        <AppEmptyState
          className={`${HISTORY_PREVIEW_EMPTY_CLASS} ${HISTORY_PREVIEW_EMPTY_INLINE_CLASS}`}
          title={labels.emptyTitle}
        />
      ) : (
        <DataContextProvider value={dataValue}>
          <PreviewTranscript
            messages={messages}
            label={`${labels.previewTitle}: ${inlineReferenceLabel(snapshot.title)}`}
          />
        </DataContextProvider>
      )}
    </aside>
  );
};
