import { useEffect, useMemo, useState } from "react";

import type { AgentRuntimeEvent, AgentSessionSnapshot } from "../../../shared/agent";
import {
  agentSessionToChatMessages,
  agentSessionToSessionMeta,
  applyAgentRuntimeEventToSnapshot,
  mergeRunningSessionSnapshot,
  normalizeAgentSessionSnapshot
} from "../agent-session-view-model";
import {
  createDataProviderValue,
  DataContextProvider,
  Message
} from "../ai-panel/lyra-agents";
import { Spinner } from "@renderer/ui/components/spinner";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import type { AgentSubagentSurfaceProps } from "./types";

const eventSessionId = (event: AgentRuntimeEvent): string | null => {
  if (event.kind === "sessionSnapshot") {
    return event.snapshot.id;
  }
  if ("sessionId" in event && typeof event.sessionId === "string") {
    return event.sessionId;
  }
  return null;
};

const adoptSessionSnapshot = (
  current: AgentSessionSnapshot | null,
  incoming: AgentSessionSnapshot
): AgentSessionSnapshot => {
  if (current === null) {
    return incoming;
  }
  const merged = mergeRunningSessionSnapshot(current, incoming);
  if (current.follow.running && incoming.follow.running !== true
    && incoming.messages.length < current.messages.length) {
    return {
      ...merged,
      follow: current.follow,
      turnStatus: current.turnStatus,
      activeTurnId: current.activeTurnId ?? null
    };
  }
  return merged;
};

export const AgentSubagentSurface = ({
  labels,
  state,
  desktopApi,
  onOpenFile,
  onOpenUrl,
  onRevealPath,
  onOpenSubagent
}: AgentSubagentSurfaceProps) => {
  const [snapshot, setSnapshot] = useState<AgentSessionSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useWorkbenchTitlebarContribution({
    ariaLabel: state.title,
    content: (
      <div className="inline-flex min-w-0 items-center gap-[var(--lyra-space-8)]">
        <span>{state.title}</span>
        <span className="text-[length:var(--lyra-text-size-caption)] text-[var(--lyra-text-muted)]">{labels.readOnly}</span>
      </div>
    )
  });

  useEffect(() => {
    let disposed = false;
    const agent = desktopApi?.agent;
    if (agent === undefined) {
      setLoading(false);
      setError(labels.unavailable);
      return undefined;
    }
    setLoading(true);
    setError(null);
    let hasLiveSnapshot = false;
    const unsubscribe = agent.onEvent((event: AgentRuntimeEvent) => {
      const sessionId = eventSessionId(event);
      if (sessionId !== state.subagentId) {
        return;
      }
      hasLiveSnapshot = true;
      setSnapshot((current) => {
        if (event.kind === "sessionSnapshot") {
          return adoptSessionSnapshot(current, normalizeAgentSessionSnapshot(event.snapshot));
        }
        if (current === null) {
          return current;
        }
        return applyAgentRuntimeEventToSnapshot(current, event);
      });
      setLoading(false);
    });
    void agent.readSession({ sessionId: state.subagentId }).then((next) => {
      if (disposed) {
        return;
      }
      const incoming = normalizeAgentSessionSnapshot(next);
      setSnapshot((current) => adoptSessionSnapshot(current, incoming));
      setLoading(false);
    }).catch((cause: unknown) => {
      if (disposed) {
        return;
      }
      setLoading(false);
      if (hasLiveSnapshot) {
        return;
      }
      setSnapshot(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [desktopApi, labels.unavailable, state.subagentId]);

  const messages = useMemo(
    () => agentSessionToChatMessages(snapshot).map((message) => ({
      ...message,
      rollback: null
    })),
    [snapshot]
  );
  const dataValue = useMemo(() => createDataProviderValue({
    session: agentSessionToSessionMeta(snapshot),
    messages,
    isTurnRunning: snapshot?.follow.running === true,
    followActivity: snapshot?.follow.activity ?? null,
    ...(onOpenFile === undefined ? {} : { openFileInWorkbench: async (filePath) => { onOpenFile(filePath); } }),
    ...(onOpenUrl === undefined ? {} : { openUrlInWorkbench: async (url, title) => { onOpenUrl(url, title); } }),
    ...(onRevealPath === undefined ? {} : { revealPathInWorkbench: async (filePath) => { onRevealPath(filePath); } }),
    ...(onOpenSubagent === undefined
      ? {}
      : {
          openSubagent: (subagentId: string) => {
            onOpenSubagent({
              parentSessionId: state.parentSessionId,
              subagentId
            });
          }
        })
  }), [messages, onOpenFile, onOpenUrl, onOpenSubagent, onRevealPath, snapshot, state.parentSessionId]);

  if (loading && snapshot === null) {
    return (
      <div className="lyra-agent-subagent lyra-agents-host flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center gap-[var(--lyra-space-8)] text-sm text-muted-foreground">
          <Spinner />
          <span>{labels.loading}</span>
        </div>
      </div>
    );
  }

  if (snapshot === null) {
    return (
      <div className="lyra-agent-subagent lyra-agents-host flex-col">
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
          {error ?? labels.unavailable}
        </div>
      </div>
    );
  }

  return (
    <div className="lyra-agent-subagent lyra-agents-host flex-col">
      <DataContextProvider value={dataValue}>
        <div
          className="lyra-agent-subagent-chat lyra-agents-chat-scroll min-h-0 flex-1"
          role="log"
          aria-label={state.title}
        >
          {messages.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
              {labels.loading}
            </div>
          ) : (
            <div className="lyra-agent-subagent-chat-inner lyra-agents-chat-inner">
              {messages.map((message) => (
                <Message key={message.id} message={message} />
              ))}
            </div>
          )}
        </div>
      </DataContextProvider>
    </div>
  );
};
