import { useCallback } from "react";

import type { ChatMessage, MessageBlock } from "../../core/types";
import { useData } from "../../data/DataProvider";
import { MarkdownCitationContext } from "../rich-text/markdown-citation";
import { StreamingText } from "../rich-text/StreamingText";
import { resolveSelectionCitation } from "./message-citation";

export function MessageTextBlock({ message, block, streaming }: {
  readonly message: ChatMessage;
  readonly block: Extract<MessageBlock, { type: "text" }>;
  readonly streaming: boolean;
}) {
  const { addCitationToComposer } = useData();
  const cite = useCallback((target: HTMLElement, quotedText: string) => {
    const root = target.closest<HTMLElement>("[data-message-id]");
    if (root?.dataset.messageId !== message.id) return;
    const range = document.createRange();
    range.selectNodeContents(target);
    const citation = resolveSelectionCitation(message, quotedText, range, root);
    if (citation !== null) addCitationToComposer(citation);
  }, [addCitationToComposer, message]);

  return (
    <div className="lyra-agents-message-text-block select-text" data-message-block-id={block.id}>
      <MarkdownCitationContext.Provider value={cite}>
        <StreamingText
          content={block.body}
          streaming={streaming}
          messageId={block.sourceMessageId ?? message.id}
          blockId={block.sourceBlockId ?? null}
        />
      </MarkdownCitationContext.Provider>
    </div>
  );
}
