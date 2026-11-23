import { useRef } from "react";

import { useData } from "../../data/DataProvider";
import { PlainAgentText } from "./LyraDocument";
import { LyraMarkdown } from "./LyraMarkdown";
import {
  useStreamingBlockReplacementRevision,
  useStreamingMessageText
} from "./use-streaming-message-text";
import { streamdownLinkSafety } from "./streamdown-plugins";
import {
  RT_PLAIN_TEXT_CLASS,
  RT_RICH_TEXT_CLASS,
  RT_STREAMING_RICH_CLASS,
  RT_STREAMING_TEXT_CLASS
} from "./classes";
import {
  useLyraRichTextClickHandler
} from "./streamdown-components";

/**
 * Renders agent text during and after streaming using a single renderer
 * (Streamdown) for both states. During streaming, settled Markdown chunks
 * keep a stable Streamdown instance and only the live tail re-parses, so
 * tokens paint without waiting for a whole-document transition. After
 * streaming ends, the same chunks remain; the finalized text from
 * messageCommitted (passed as `content`) becomes the source of truth.
 */
export function StreamingText({
  content,
  streaming,
  messageId,
  blockId
}: {
  content: string;
  streaming: boolean;
  messageId: string;
  blockId: string | null;
}) {
  const { aiRichRenderingEnabled } = useData();
  const rootRef = useRef<HTMLDivElement>(null);
  // The live tail stays in the stream store. `content` is only the first
  // delta until messageCommitted copies the finished sentence.
  const streamStoreText = useStreamingMessageText(messageId, blockId, content, streaming);
  const replacementRevision = useStreamingBlockReplacementRevision(messageId, blockId, streaming);
  // Streamdown 2.5 memoizes inner Markdown nodes by source position. A same-
  // length replacement therefore needs a one-time remount; keep that revision
  // stable after completion so the streaming -> final transition does not
  // remount again.
  const documentRevisionRef = useRef({ identity: `${messageId}:${blockId ?? "latest"}`, revision: 0 });
  const documentIdentity = `${messageId}:${blockId ?? "latest"}`;
  if (documentRevisionRef.current.identity !== documentIdentity) {
    documentRevisionRef.current = { identity: documentIdentity, revision: 0 };
  }
  if (replacementRevision > documentRevisionRef.current.revision) {
    documentRevisionRef.current.revision = replacementRevision;
  }
  const handleClick = useLyraRichTextClickHandler(rootRef);
  if (!aiRichRenderingEnabled) {
    if (streaming) {
      return (
        <div className={`${RT_STREAMING_TEXT_CLASS} ${RT_PLAIN_TEXT_CLASS}`}>
          <span>{streamStoreText}</span>
        </div>
      );
    }
    return <PlainAgentText content={streamStoreText} />;
  }

  return (
    <div
      ref={rootRef}
      className={`${RT_STREAMING_TEXT_CLASS} ${RT_STREAMING_RICH_CLASS} ${RT_RICH_TEXT_CLASS}`}
      onClick={handleClick}
    >
      <LyraMarkdown
        content={streamStoreText}
        documentKey={documentRevisionRef.current.revision}
        linkSafety={streamdownLinkSafety}
        streaming={streaming}
      />
    </div>
  );
}
