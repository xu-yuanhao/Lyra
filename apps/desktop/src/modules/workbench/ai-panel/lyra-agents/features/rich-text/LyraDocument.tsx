import {
  RT_PLAIN_TEXT_CLASS,
} from "./classes";
/**
 * Plain-text fallback rendering for agent messages when rich rendering is
 * disabled. The rich rendering path now lives entirely in StreamingText.tsx
 * (streamdown-based, unified for streaming and final states); the old
 * markdown-it/LyraDocument path has been removed.
 */

export function PlainAgentText({ content }: { readonly content: string }) {
  return <div className={RT_PLAIN_TEXT_CLASS}>{content}</div>;
}