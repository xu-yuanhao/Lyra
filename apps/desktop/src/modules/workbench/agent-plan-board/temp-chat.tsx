import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp } from "@lyra/icons";

import {
  AppButton,
  AppStatusMessage,
  AppTextarea
} from "@renderer/ui/components";
import type {
  AgentMessage,
  AgentPlanAnnotation,
  AgentPlanSnapshot,
  AgentRuntimeEvent
} from "../../../shared/agent";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import { LyraMarkdown } from "../ai-panel/lyra-agents/features/rich-text/LyraMarkdown";
import {
  COMPOSER_BOTTOM_CLASS,
  COMPOSER_CLASS,
  COMPOSER_INPUT_CLASS,
  COMPOSER_PRIMARY_ACTIONS_CLASS,
  COMPOSER_SEND_CLASS
} from "../ai-panel/lyra-agents/features/chat/classes";
import type { AgentPlanBoardLabels, AgentPlanBoardRevisionRequest } from "./types";
import {
  APB_TEMP_CHAT_BODY_CLASS,
  APB_TEMP_CHAT_BUSY_CLASS,
  APB_TEMP_CHAT_CLASS,
  APB_TEMP_CHAT_COMPOSER_WRAP_CLASS,
  APB_TEMP_CHAT_ERROR_CLASS,
  APB_TEMP_CHAT_MESSAGE_CLASS,
} from "./classes";

type TempChatMessage = {
  readonly id: string;
  readonly role: "assistant" | "user" | "note";
  readonly text: string;
};

type PlanTempChatProps = {
  readonly labels: AgentPlanBoardLabels;
  readonly parentSessionId: string;
  readonly plan: AgentPlanSnapshot | null;
  readonly desktopApi: LyraDesktopApi | null;
  readonly onApplyRevision?: ((request: AgentPlanBoardRevisionRequest) => Promise<void>) | undefined;
};

/**
 * Temporary plan-chat rail mounted inside the Plan Board.
 *
 * It runs an isolated ephemeral agent session seeded with the parent session's
 * plan/todo context. The temp agent can explain or propose plan changes; it must
 * not execute the task. Messages live only in this capsule's local state and the
 * ephemeral session — they never enter the main transcript, are never persisted,
 * and are destroyed when the capsule closes.
 *
 * Applying a change is a deliberate user action: the temp agent emits a revised
 * plan inside a ```plan fenced block; the user clicks "Apply to plan" to call the
 * existing revisePlan IPC with source="temp_chat" on the PARENT session. That sets
 * the parent plan's review.status to "changed" and flips the main review button to
 * "根据反馈重写".
 */
const extractPlanBlock = (text: string): string | null => {
  const match = text.match(/```plan\s*\n([\s\S]*?)```/u);
  return match === null ? null : (match[1] ?? "").trim();
};

const messageText = (message: AgentMessage | undefined): string => {
  if (message === undefined) return "";
  if (typeof message.text === "string" && message.text.length > 0) return message.text;
  const blocks = message.blocks;
  if (Array.isArray(blocks)) {
    return blocks
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
  }
  return "";
};

export const PlanTempChat = ({
  labels,
  parentSessionId,
  plan,
  desktopApi,
  onApplyRevision
}: PlanTempChatProps) => {
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<readonly TempChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accumulated assistant text per messageId, reconstructed from streaming deltas.
  const assistantBufferRef = useRef<Map<string, string>>(new Map());
  // Last plan markdown auto-applied to the parent plan, to avoid re-applying the
  // same proposal on re-render.
  const appliedPlanRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const pendingPlanAnnotations: readonly AgentPlanAnnotation[] = useMemo(
    () => plan?.annotations ?? [],
    [plan?.annotations]
  );

  const flushAssistantMessage = useCallback((messageId: string) => {
    const buffer = assistantBufferRef.current.get(messageId);
    if (buffer === undefined || buffer.length === 0) return;
    setMessages((prev) => {
      if (prev.some((message) => message.id === messageId)) return prev;
      return [...prev, { id: messageId, role: "assistant", text: buffer }];
    });
    assistantBufferRef.current.delete(messageId);
  }, []);

  // Subscribe to runtime events scoped to the temp session. The main session-view-model
  // is keyed to the parent session, so these events never reach the main transcript.
  useEffect(() => {
    if (tempSessionId === null || desktopApi === null) return;
    const agent = desktopApi.agent;
    if (agent === undefined) return;
    const unsubscribe = agent.onEvent((event: AgentRuntimeEvent) => {
      if (!("sessionId" in event) || event.sessionId !== tempSessionId) return;
      switch (event.kind) {
        case "messageCommitted": {
          if (event.message.role === "user") {
            setMessages((prev) =>
              prev.some((message) => message.id === event.message.id)
                ? prev
                : [...prev, { id: event.message.id, role: "user", text: messageText(event.message) }]
            );
          } else {
            flushAssistantMessage(event.message.id);
          }
          break;
        }
        case "messageDelta": {
          if (event.replace === true) {
            assistantBufferRef.current.set(event.messageId, event.delta);
          } else {
            const current = assistantBufferRef.current.get(event.messageId) ?? "";
            assistantBufferRef.current.set(event.messageId, current + event.delta);
          }
          setMessages((prev) => {
            const buffered = assistantBufferRef.current.get(event.messageId) ?? "";
            const existing = prev.find((message) => message.id === event.messageId);
            if (existing === undefined) {
              return [...prev, { id: event.messageId, role: "assistant", text: buffered }];
            }
            return prev.map((message) =>
              message.id === event.messageId ? { ...message, text: buffered } : message
            );
          });
          break;
        }
        case "turnCompleted": {
          setBusy(false);
          break;
        }
        default:
          break;
      }
    });
    return () => {
      unsubscribe();
    };
  }, [tempSessionId, desktopApi, flushAssistantMessage]);

  useEffect(() => () => {
    const agent = desktopApi?.agent;
    if (tempSessionId !== null && agent !== undefined) {
      void agent.deleteSession({ sessionId: tempSessionId });
    }
  }, [desktopApi, tempSessionId]);

  // Auto-scroll the message list on new content.
  useEffect(() => {
    const node = scrollRef.current;
    if (node !== null) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, busy]);

  // Ensure an ephemeral temp session exists before the first send.
  const ensureTempSession = useCallback(async (): Promise<string | null> => {
    if (tempSessionId !== null) return tempSessionId;
    const agent = desktopApi?.agent;
    if (agent === undefined) {
      setError(labels.tempChatBridgeUnavailable);
      return null;
    }
    try {
      const snapshot = await agent.createTemporarySession({ parentSessionId });
      const id = snapshot.id;
      setTempSessionId(id);
      return id;
    } catch (next) {
      setError(next instanceof Error ? next.message : labels.tempChatStartFailed);
      return null;
    }
  }, [tempSessionId, desktopApi, parentSessionId]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (text.length === 0 || busy || plan === null) return;
    setError(null);
    const sessionId = await ensureTempSession();
    const agent = desktopApi?.agent;
    if (sessionId === null || agent === undefined) return;
    setBusy(true);
    setDraft("");
    try {
      await agent.sendTurn({ sessionId, text });
    } catch (next) {
      setBusy(false);
      setError(next instanceof Error ? next.message : labels.tempChatSendFailed);
    }
  }, [draft, busy, plan, ensureTempSession, desktopApi]);

  const lastAssistant = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message !== undefined && message.role === "assistant") return message;
    }
    return null;
  }, [messages]);

  const proposedPlan = useMemo(
    () => (lastAssistant === null ? null : extractPlanBlock(lastAssistant.text)),
    [lastAssistant]
  );

  // Auto-apply: when the temp agent proposes a revised plan (a fenced ```plan
  // block) and the turn has settled, apply it to the PARENT plan as a new
  // temp_chat version. This is non-destructive — it only creates a version and
  // flips the main review button to "根据反馈重写"; the user still drives the
  // final approve/revise. Deduped by content so a render never re-applies.
  useEffect(() => {
    if (proposedPlan === null || onApplyRevision === undefined || busy) return;
    if (appliedPlanRef.current === proposedPlan) return;
    appliedPlanRef.current = proposedPlan;
    void (async () => {
      try {
        await onApplyRevision({
          markdown: proposedPlan,
          annotations: pendingPlanAnnotations,
          source: "temp_chat",
          summary: labels.tempChatApplyToPlan
        });
        setMessages((prev) => [
          ...prev,
          { id: `note-${Date.now()}`, role: "note", text: labels.tempChatApplied }
        ]);
      } catch (next) {
        // Keep appliedPlanRef set to this proposal so a failed apply does not
        // re-fire on every render (which would storm the runtime). A new
        // proposal (different content) still retries; the user can also resend.
        setError(next instanceof Error ? next.message : labels.tempChatApplyFailed);
      }
    })();
  }, [
    proposedPlan,
    busy,
    onApplyRevision,
    pendingPlanAnnotations,
    labels.tempChatApplyToPlan,
    labels.tempChatApplied
  ]);

  return (
    <div className={APB_TEMP_CHAT_CLASS}>
      <div className={APB_TEMP_CHAT_BODY_CLASS} ref={scrollRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={APB_TEMP_CHAT_MESSAGE_CLASS(message.role)}
          >
            {message.role === "note" ? message.text : (
              <LyraMarkdown
                content={message.text}
                streaming={busy && message.role === "assistant" && message.id === lastAssistant?.id}
              />
            )}
          </div>
        ))}
        {busy ? <div className={APB_TEMP_CHAT_BUSY_CLASS}>{labels.tempChatBusy}</div> : null}
        {error !== null ? (
          <AppStatusMessage className={APB_TEMP_CHAT_ERROR_CLASS} role="alert" tone="error">
            {error}
          </AppStatusMessage>
        ) : null}
      </div>
      <div className={APB_TEMP_CHAT_COMPOSER_WRAP_CLASS}>
        <form
          className={COMPOSER_CLASS}
          onSubmit={(event) => {
            event.preventDefault();
            void handleSend();
          }}
        >
          <AppTextarea
            className={COMPOSER_INPUT_CLASS}
            placeholder={labels.tempChatPlaceholder}
            value={draft}
            disabled={busy || plan === null}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void handleSend();
              }
            }}
          />
          <div className={COMPOSER_BOTTOM_CLASS}>
            <div className={COMPOSER_PRIMARY_ACTIONS_CLASS}>
              <AppButton
                variant="ghost"
                size="sm"
                type="submit"
                className={COMPOSER_SEND_CLASS}
                disabled={draft.trim().length === 0 || busy || plan === null}
                title={labels.tempChatSend}
                aria-label={labels.tempChatSend}
              >
                <ArrowUp size={14} strokeWidth={2.1} />
              </AppButton>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
