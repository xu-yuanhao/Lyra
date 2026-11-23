// ============================================================================
// ChatView — scrollable message list + floating lyra-agents-composer stack
// ============================================================================
//
// The thread is a TanStack virtual list. Only the rows in the scrollport are
// mounted. Offscreen history is not in the document.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDown,
  BookText,
  CornerUpLeft,
  Copy,
  GitBranch,
  Link2,
  Undo2
} from "@lyra/icons";
import { ContextMenuHost, useContextMenuModel } from "../../../../context-menu";
import type { LyraDesktopApi } from "../../../../../../shared/desktop-bridge";
import type { ChatMessage } from "../../core/types";
import { APP_CONFIG } from "../../core/config";
import { t } from "@workbench/i18n";
import { useData } from "../../data/DataProvider";
import {
  Message,
  resolveAgentActivityHostMessageId
} from "./Message";
import { Composer } from "./Composer";
import {
  COMPOSER_CHANGES_COUNTS_CLASS,
  COMPOSER_RAIL_CLASS,
  COMPOSER_RAIL_CHIP_CLASS,
  COMPOSER_TOPROW_CLASS,
  COMPOSER_WRAP_CLASS
} from "./classes";
import { BackgroundTerminalButton } from "./BackgroundTerminalButton";
import { AgentBrowserCapsule } from "./agent-browser-capsule";
import { ContextRing } from "./context-ring";
import { ChatEmptyState } from "./ChatEmptyState";
import {
  ComposerMetaBuiltinProvider,
  useRegisterCoreComposerMetaChrome,
  WorkbenchChromeComposerMetaRow
} from "../../../../shell/workbench-chrome-composer-meta";
import { UserGateHost } from "../panels";
import { TodoBar } from "../pills";
import { AppButton } from "@renderer/ui/components";
import {
  buildFullMessageCitation,
  clipInlineMarkerText,
  inlineContentMarkersToDisplayText,
  messagePlainText,
  resolveSelectionCitation
} from "./message-citation";
import { MessageCitationText } from "./MessageCitationText";
import { queryCitationMessageElement } from "./scroll-to-citation";
import { useAutoScroll } from "./use-auto-scroll";
import { createRafCoalescer } from "../../../../shell/raf-coalesce";
import {
  CONTENT_WIDTH_RESIZE_SETTLE_MS,
  MESSAGE_ROW_ESTIMATE_PX,
  historyPrefetchTriggerPx,
  type MessageHeightMemory,
  messageVirtualizerOptions,
  shouldAdjustMessageScrollOnItemSizeChange
} from "./virtual-message-window";
import { COMPOSER_CONTEXT_RING_SLOT_CLASS } from "./classes";
import { DIFF_ADD_CLASS, DIFF_DEL_CLASS } from "./classes";
import { CHAT_INNER_CLASS, CHAT_MESSAGE_SLOT_CLASS, CHAT_SCROLL_CLASS, CHAT_THREAD_ANCHOR_BUTTON_CLASS, CHAT_THREAD_ANCHOR_CLASS, CHAT_THREAD_ANCHOR_LABEL_CLASS, CHAT_THREAD_ANCHOR_TEXT_CLASS } from "../../../classes";

// ponytail: sticky anchor offset from the top of the scroll viewport.
const STICKY_ANCHOR_TOP_OFFSET_PX = 18;
const STICKY_ANCHOR_PREVIEW_CHARS = 96;
const GIT_STATUS_POLL_MS = 5000;

/** Keep the last message above the floating composer, including permission/decision popups. */
export const syncComposerStackHeight = (scroll: HTMLElement, wrap: HTMLElement): number => {
  const height = wrap.offsetHeight;
  if (height <= 0) {
    return 0;
  }
  const next = Math.ceil(height);
  scroll.style.setProperty(
    "--lyra-agents-composer-scroll-bottom-padding",
    `${next}px`
  );
  return next;
};

type ComposerGitCounts = {
  readonly additions: number;
  readonly deletions: number;
};

const useComposerGitCounts = (
  desktopApi: LyraDesktopApi | null,
  workingDir: string | undefined
): ComposerGitCounts | null => {
  const [counts, setCounts] = useState<ComposerGitCounts | null>(null);
  useEffect(() => {
    const dir = workingDir?.trim() ?? "";
    const agent = desktopApi?.agent;
    if (agent === undefined || dir.length === 0) {
      setCounts(null);
      return undefined;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await agent.readGitStatus({ workingDir: dir });
        if (cancelled) {
          return;
        }
        const additions = next.summary.additions ?? 0;
        const deletions = next.summary.deletions ?? 0;
        if (!next.isRepository || (next.summary.changed === 0 && additions === 0 && deletions === 0)) {
          setCounts(null);
          return;
        }
        setCounts({ additions, deletions });
      } catch {
        if (!cancelled) {
          setCounts(null);
        }
      }
    };
    void load();
    const timer = window.setInterval(() => {
      void load();
    }, GIT_STATUS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [desktopApi, workingDir]);
  return counts;
};

const useComposerHasProjectPlan = (
  desktopApi: LyraDesktopApi | null,
  workingDir: string | null | undefined,
  sessionId: string | null | undefined,
  enabled: boolean
): boolean => {
  const [hasPlan, setHasPlan] = useState(false);
  useEffect(() => {
    const dir = workingDir?.trim() ?? "";
    const id = typeof sessionId === "string" ? sessionId.trim() : "";
    const agent = desktopApi?.agent;
    if (!enabled || agent?.listProjectPlans === undefined || dir.length === 0) {
      setHasPlan(false);
      return undefined;
    }
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const next = await agent.listProjectPlans({
          workingDir: dir,
          ...(id.length === 0 ? {} : { sessionId: id })
        });
        if (!cancelled) {
          setHasPlan(next.plans.length > 0);
        }
      } catch {
        if (!cancelled) {
          setHasPlan(false);
        }
      }
    };
    void load();
    const unsubscribe = agent.onEvent?.((event) => {
      if (
        event.kind === "planUpdated"
        || event.kind === "planReviewRequested"
        || event.kind === "planReviewResolved"
      ) {
        void load();
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [desktopApi, enabled, sessionId, workingDir]);
  return hasPlan;
};

const messageReferenceText = (message: ChatMessage): string =>
  message.blocks
    .filter((block) => block.type === "text")
    .map((block) => block.body.trim())
    .filter((textBlock) => textBlock.length > 0)
    .join(" ");

const textPreviewForMessage = (message: ChatMessage): string => {
  const text = messageReferenceText(message);
  if (text.length > 0) {
    const display = inlineContentMarkersToDisplayText(
      text,
      message.transcriptCitations ?? [],
      message.pageCitations ?? [],
      message.inlineImages ?? [],
      message.fileAttachments ?? []
    );
    const shown = display.length > 0 ? display : text;
    return shown.length > STICKY_ANCHOR_PREVIEW_CHARS
      ? `${shown.slice(0, STICKY_ANCHOR_PREVIEW_CHARS).trim()}...`
      : shown;
  }
  if (message.blocks.some((block) => block.type === "image")) {
    return t("lyra-agents-message.imageAttachment");
  }
  return message.blocks.find((block) => block.type === "tools")?.group.label ?? "";
};

interface ChatViewProps {
  showDecisions: boolean;
  showPermission: boolean;
  desktopApi?: LyraDesktopApi | null;
}

export function ChatView({ showDecisions, showPermission, desktopApi = null }: ChatViewProps) {
  const {
    messages,
    decisions,
    permissions,
    planReview,
    sendMessage,
    captureWorkspaceScreenshot,
    captureWindowScreenshot,
    pickFileFromFileManager,
    workspaceTabs,
    terminalTabs,
    openImageInWorkbench,
    canOpenImageInWorkbench,
    openUrlInWorkbench,
    submitDecisions,
    approvePermission,
    denyPermission,
    openPlanReview,
    respondPlanReview,
    modelControls,
    permissionModeControls,
    openModelSettings,
    isTurnRunning,
    setActiveBrowserTab,
    cancelTurn,
    session,
    bindProject,
    openProjectTree,
    openInFileManager,
    openProjectPlanManager,
    openProjectTodo,
    openProjectGit,
    addCitationToComposer,
    pendingCitation,
    pendingCitationNonce,
    pendingImages,
    pendingImagesNonce,
    pendingFiles,
    pendingFilesNonce,
    navigateToPageCitation,
    scrollToMessage,
    citationScrollTarget,
    reportCitationScrollFinished,
    citationHighlightMessageId,
    previewRollback,
    rollbackMessage,
    todos,
    messageWindow,
    loadEarlierMessages,
  } = useData();
  useRegisterCoreComposerMetaChrome(session.id);
  const contextMenu = useContextMenuModel();
  const composerMetaBuiltins = {
    projectDir: {
      desktopApi,
      sessionId: session.id,
      projectName: session.project.trim().length > 0 ? session.project.trim() : null,
      workingDir: session.workingDir,
      isHome: session.workingDirIsHome,
      canOpenProjectTree: session.projectBound && !session.workingDirIsHome,
      onChooseProject: bindProject,
      onSelectProject: bindProject,
      onOpenProjectTree: openProjectTree,
      onOpenInFileManager: openInFileManager
    },
    backgroundTerminal: {
      session,
      desktopApi
    }
  };

  const canManagePlans =
    session.projectBound === true &&
    session.workingDirIsHome !== true &&
    typeof session.workingDir === "string" &&
    session.workingDir.trim().length > 0;
  const openPlanBoard = useCallback(
    (): Promise<void> => (canManagePlans ? openProjectPlanManager("plan") : openProjectTodo()),
    [canManagePlans, openProjectPlanManager, openProjectTodo]
  );
  const openTodoBoard = useCallback(
    (): Promise<void> => (canManagePlans ? openProjectPlanManager("todo") : openProjectTodo()),
    [canManagePlans, openProjectPlanManager, openProjectTodo]
  );
  const gitCounts = useComposerGitCounts(desktopApi, session.workingDir ?? undefined);
  const hasProjectPlan = useComposerHasProjectPlan(
    desktopApi,
    session.workingDir,
    session.id,
    canManagePlans
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const composerWrapRef = useRef<HTMLDivElement | null>(null);
  const contentElRef = useRef<HTMLDivElement | null>(null);
  // Splitter drags change the chat width every frame; rows rewrap in batches
  // and per-row scroll compensation would fight itself (visible jitter).
  const contentWidthChangingRef = useRef(false);
  const autoScroll = useAutoScroll({
    working: true,
    // The virtualizer owns scroll compensation; native anchoring would
    // double-drive it while reading history during streaming or resizes.
    overflowAnchor: "none",
    bottomThreshold: APP_CONFIG.scroll.atBottomThreshold
  });
  const bindScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    autoScroll.setScrollElement(node);
  }, [autoScroll.setScrollElement]);
  const bindContentRef = useCallback((node: HTMLDivElement | null) => {
    contentElRef.current = node;
    autoScroll.setContentElement(node);
  }, [autoScroll.setContentElement]);

  useEffect(() => {
    const el = contentElRef.current;
    if (el === null) {
      return;
    }
    let lastWidth = el.clientWidth;
    let settle = 0;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (width === lastWidth) {
        return;
      }
      lastWidth = width;
      contentWidthChangingRef.current = true;
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = 0;
        contentWidthChangingRef.current = false;
      }, CONTENT_WIDTH_RESIZE_SETTLE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(settle);
    };
  }, []);

  const [isAtBottom, setIsAtBottom] = useState(true);
  const [stickyMessageId, setStickyMessageId] = useState<string | null>(null);
  const [composerStackHeight, setComposerStackHeight] = useState(0);

  const hasPendingClarification = showDecisions && decisions.length > 0;
  const pendingPlanReview = planReview !== null && planReview.phase === "reviewing" ? planReview : null;
  const showPlanChip = canManagePlans && (hasProjectPlan || pendingPlanReview !== null);
  const activityIndicatorMessageId = resolveAgentActivityHostMessageId(messages, isTurnRunning);
  const activityIndicatorMessage =
    activityIndicatorMessageId === null
      ? null
      : messages.find((message) => message.id === activityIndicatorMessageId) ?? null;
  const activityIndicatorHostMessageId = activityIndicatorMessageId;
  const stickyMessage = stickyMessageId === null
    ? null
    : messages.find((message) => message.id === stickyMessageId) ?? null;
  const stickyMessagePreview = stickyMessage === null ? "" : textPreviewForMessage(stickyMessage);

  const citationScrollCompletedTokenRef = useRef<number | null>(null);
  // Last real height per message id: remounted rows estimate from it instead
  // of the raw default, keeping offsets close during drag-churned remounts.
  const messageHeightMemoryRef = useRef(new Map<string, number>());
  useEffect(() => {
    messageHeightMemoryRef.current.clear();
  }, [session.id]);
  const messageHeightMemory: MessageHeightMemory = {
    estimateForKey: (key) =>
      messageHeightMemoryRef.current.get(String(key)) ?? MESSAGE_ROW_ESTIMATE_PX,
    recordHeight: (key, height) => {
      messageHeightMemoryRef.current.set(String(key), height);
    }
  };
  const virtualizer = useVirtualizer(messageVirtualizerOptions(
    messages.length,
    () => scrollRef.current,
    (index) => messages[index]?.id ?? index,
    messageHeightMemory
  ));
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item) =>
    shouldAdjustMessageScrollOnItemSizeChange({
      contentWidthChanging: contentWidthChangingRef.current,
      userScrolled: autoScroll.userScrolled(),
      itemIndex: item.index,
      rangeStartIndex: virtualizer.range?.startIndex
    });

  // While the width moves (splitter drag), rows rewrap continuously and
  // ResizeObserver-driven measurement lags a frame behind; offsets built from
  // stale heights overlap neighbors. Re-measure every mounted row inside the
  // commit, before paint, so offsets match the rewrapped DOM in the same frame.
  useLayoutEffect(() => {
    if (
      !contentWidthChangingRef.current
      && !document.body.classList.contains("lyra-panel-resizing")
    ) {
      return;
    }
    const content = contentElRef.current;
    if (content === null) {
      return;
    }
    for (const node of content.querySelectorAll<HTMLElement>("[data-index]")) {
      virtualizer.measureElement(node);
    }
  });

  const publishSticky = useCallback((scrollTop: number): void => {
    if (scrollTop <= 0) {
      setStickyMessageId((current) => (current === null ? current : null));
      return;
    }
    const line = scrollTop + STICKY_ANCHOR_TOP_OFFSET_PX;
    let stickyId: string | null = null;
    const measured = virtualizer.measurementsCache;
    if (measured.length > 0) {
      for (const item of measured) {
        if (item.end > line) break;
        const message = messages[item.index];
        if (message?.author === "user") stickyId = message.id;
      }
    } else {
      for (let index = 0; index < messages.length; index += 1) {
        if ((index + 1) * MESSAGE_ROW_ESTIMATE_PX > line) break;
        const message = messages[index];
        if (message?.author === "user") stickyId = message.id;
      }
    }
    setStickyMessageId((current) => (current === stickyId ? current : stickyId));
  }, [messages, virtualizer]);

  // ── Older history (ZCode rows/range paging) ──────────────────────────────
  // The runtime ships a bounded tail window plus `messageWindow.hasEarlier`.
  // Scrolling toward the top (two viewports early, so the page lands before the
  // user reaches the edge) pulls the page older than the first loaded row.
  // Prepending moves every existing row down by the inserted height: remember
  // the row under the viewport top, then restore its absolute position after
  // the commit so reading never jumps.
  const prependAnchorRef = useRef<{
    readonly key: string;
    readonly offsetTop: number;
    readonly firstMessageId: string | null;
    readonly totalSize: number;
  } | null>(null);
  const loadingEarlierRef = useRef(false);

  const requestEarlierMessages = useCallback((scrollTop: number): void => {
    if (!messageWindow.canLoadEarlier || loadingEarlierRef.current) return;
    const el = scrollRef.current;
    if (el === null) return;
    const anchor = virtualizer.getVirtualItemForOffset(scrollTop);
    prependAnchorRef.current = {
      key: anchor === undefined ? "" : String(anchor.key),
      offsetTop: anchor === undefined ? 0 : anchor.start - scrollTop,
      firstMessageId: messages[0]?.id ?? null,
      totalSize: virtualizer.getTotalSize()
    };
    loadingEarlierRef.current = true;
    void loadEarlierMessages()
      .catch(() => undefined)
      .finally(() => {
        loadingEarlierRef.current = false;
      });
  }, [loadEarlierMessages, messageWindow.canLoadEarlier, messages, virtualizer]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    autoScroll.handleScroll();
    const atBottom =
      el.scrollHeight - scrollTop - el.clientHeight < APP_CONFIG.scroll.atBottomThreshold;
    setIsAtBottom((current) => (current === atBottom ? current : atBottom));
    publishSticky(scrollTop);
    if (
      scrollTop <= historyPrefetchTriggerPx(el.clientHeight, APP_CONFIG.scroll.topLoadThreshold)
    ) {
      requestEarlierMessages(scrollTop);
    }
  }, [autoScroll.handleScroll, publishSticky, requestEarlierMessages]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const wrap = composerWrapRef.current;
    if (scroll === null || wrap === null) {
      return undefined;
    }
    const apply = () => {
      const next = syncComposerStackHeight(scroll, wrap);
      if (next > 0) {
        setComposerStackHeight((current) => (current === next ? current : next));
      }
    };
    apply();
    const coalescer = createRafCoalescer(apply);
    const observer = new ResizeObserver(() => coalescer.schedule());
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      coalescer.cancel();
    };
  }, []);

  // New messages pin once. Streaming height is handled after resize settles.
  // Reading scrollHeight on every commit forces the whole thread to layout.
  const followKey = `${messages.length}:${messages[messages.length - 1]?.id ?? ""}:${composerStackHeight}`;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (autoScroll.userScrolled()) return;
    autoScroll.follow();
    setIsAtBottom(true);
  }, [autoScroll.follow, autoScroll.userScrolled, followKey]);

  // Prepend anchoring: restore the remembered row to the same viewport offset.
  useLayoutEffect(() => {
    const pending = prependAnchorRef.current;
    if (pending === null) return;
    if ((messages[0]?.id ?? null) === pending.firstMessageId) return;
    prependAnchorRef.current = null;
    const el = scrollRef.current;
    if (el === null) return;
    const measurement = pending.key.length === 0
      ? undefined
      : virtualizer.measurementsCache.find((item) => String(item.key) === pending.key);
    if (measurement !== undefined) {
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.max(0, Math.min(measurement.start - pending.offsetTop, maxScrollTop));
      return;
    }
    // Anchor row was unmounted by the prepend: shift by the inserted height.
    const inserted = virtualizer.getTotalSize() - pending.totalSize;
    if (inserted > 0) el.scrollTop += inserted;
  }, [messages, virtualizer]);

  // A short history can leave the scrollport unfilled (nothing to scroll, so
  // no scroll event ever asks for the next page). Keep paging until it fills.
  useEffect(() => {
    const el = scrollRef.current;
    if (el === null || !messageWindow.canLoadEarlier) return;
    if (el.scrollHeight <= el.clientHeight + 1) {
      requestEarlierMessages(el.scrollTop);
    }
  }, [messageWindow.canLoadEarlier, messages.length, requestEarlierMessages]);

  useLayoutEffect(() => {
    if (citationScrollTarget === null) return;
    const index = messages.findIndex((message) => message.id === citationScrollTarget.messageId);
    if (index < 0) return;
    virtualizer.scrollToIndex(index, { align: "center" });
  }, [citationScrollTarget, messages, virtualizer]);

  useLayoutEffect(() => {
    if (citationScrollTarget === null) return;
    if (citationScrollCompletedTokenRef.current === citationScrollTarget.token) return;

    const el = scrollRef.current;
    if (el === null) return;

    const domTarget = queryCitationMessageElement(el, citationScrollTarget.messageId);
    if (domTarget === null) return;
    autoScroll.pause();
    domTarget.scrollIntoView({ block: "center", behavior: "auto" });
    citationScrollCompletedTokenRef.current = citationScrollTarget.token;
    requestAnimationFrame(() => {
      reportCitationScrollFinished(citationScrollTarget.messageId);
    });
  }, [autoScroll.pause, citationScrollTarget, messages, reportCitationScrollFinished]);

  useEffect(() => {
    if (stickyMessageId !== null && !messages.some((message) => message.id === stickyMessageId)) {
      setStickyMessageId(null);
    }
  }, [messages, stickyMessageId]);

  // Reset scroll anchor on session switch — start at bottom
  useEffect(() => {
    setStickyMessageId(null);
    autoScroll.resume();
  }, [autoScroll.resume, session.id]);

  const scrollToStickyMessage = () => {
    if (stickyMessageId === null) return;
    const index = messages.findIndex((message) => message.id === stickyMessageId);
    if (index < 0) return;
    autoScroll.pause();
    virtualizer.scrollToIndex(index, { align: "start" });
    const el = scrollRef.current;
    const target = el?.querySelector<HTMLElement>(
      `[data-chat-message-id="${CSS.escape(stickyMessageId)}"]`
    );
    target?.scrollIntoView({ behavior: "smooth" });
  };

  const openMessageContextMenu = useCallback((
    event: MouseEvent<HTMLElement>,
    message: ChatMessage
  ) => {
    event.preventDefault();
    const root = event.currentTarget;
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim() ?? "";
    const hasSelection =
      selectedText.length > 0 &&
      selection !== null &&
      selection.rangeCount > 0 &&
      root.contains(selection.anchorNode) &&
      root.contains(selection.focusNode);
    const copySelection = () => {
      if (hasSelection) {
        void navigator.clipboard.writeText(selectedText);
        return;
      }
      void navigator.clipboard.writeText(messagePlainText(message));
    };
    const citeSelection = () => {
      if (hasSelection && selection !== null && selection.rangeCount > 0) {
        const citation = resolveSelectionCitation(
          message,
          selectedText,
          selection.getRangeAt(0),
          root
        );
        if (citation !== null) {
          addCitationToComposer(citation);
        }
        return;
      }
      addCitationToComposer(buildFullMessageCitation(message));
    };
    const items = message.author === "user"
      ? [
          {
            id: "cite",
            label: hasSelection ? t("lyra-agents-message.citeSelection") : t("lyra-agents-message.citeMessage"),
            icon: <Link2 size={14} strokeWidth={2} />,
            onSelect: citeSelection
          },
          {
            id: "copy",
            label: t("lyra-agents-message.copy"),
            icon: <Copy size={14} strokeWidth={2} />,
            onSelect: copySelection
          },
          ...(message.rollback?.available === true
            ? [{
                id: "rollback",
                label: t("lyra-agents-message.undoMessage"),
                icon: <Undo2 size={14} strokeWidth={2} />,
                separatorBefore: true,
                onSelect: () => {
                  void previewRollback(message.id).then((preview) => {
                    if (preview.available) {
                      void rollbackMessage(message.id);
                    }
                  });
                }
              }]
            : [])
        ]
      : [
          {
            id: "copy",
            label: t("lyra-agents-message.copy"),
            icon: <Copy size={14} strokeWidth={2} />,
            onSelect: copySelection
          },
          {
            id: "cite",
            label: hasSelection ? t("lyra-agents-message.citeSelection") : t("lyra-agents-message.citeMessage"),
            icon: <Link2 size={14} strokeWidth={2} />,
            onSelect: citeSelection
          }
        ];
    contextMenu.openMenu({
      anchorX: event.clientX,
      anchorY: event.clientY,
      items
    });
  }, [addCitationToComposer, contextMenu, previewRollback, rollbackMessage]);

  return (
    <>
      <ContextMenuHost
        state={contextMenu.state}
        onClose={contextMenu.closeMenu}
        onSelectItem={contextMenu.selectItem}
      />

      <div
        className={CHAT_SCROLL_CLASS}
        ref={bindScrollRef}
        onScroll={handleScroll}
        onWheel={autoScroll.handleWheel}
      >
        {stickyMessage !== null && stickyMessagePreview.length > 0 ? (
          <div className={CHAT_THREAD_ANCHOR_CLASS}>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={CHAT_THREAD_ANCHOR_BUTTON_CLASS}
              onClick={scrollToStickyMessage}
              aria-label={t("scroll.jumpToPreviousMessage")}
              title={`${t("scroll.jumpToPreviousMessage")}: ${stickyMessagePreview}`}
            >
              <CornerUpLeft size={13} strokeWidth={2.1} aria-hidden="true" />
              <span className={CHAT_THREAD_ANCHOR_LABEL_CLASS}>{t("scroll.previousMessage")}</span>
              <span className={CHAT_THREAD_ANCHOR_TEXT_CLASS}>
                <MessageCitationText
                  text={clipInlineMarkerText(messageReferenceText(stickyMessage), STICKY_ANCHOR_PREVIEW_CHARS)}
                  transcriptCitations={stickyMessage.transcriptCitations ?? []}
                  pageCitations={stickyMessage.pageCitations ?? []}
                  inlineImages={stickyMessage.inlineImages ?? []}
                  fileAttachments={stickyMessage.fileAttachments ?? []}
                />
              </span>
            </AppButton>
          </div>
        ) : null}

        <div
          className={CHAT_INNER_CLASS}
          ref={bindContentRef}
          onClick={autoScroll.handleInteraction}
        >
          {messages.length === 0 ? (
            <ChatEmptyState
              key={session.id}
              projectName={session.project.trim().length > 0 ? session.project.trim() : null}
              isHome={session.workingDirIsHome}
              onChooseProject={bindProject}
            />
          ) : (
            (() => {
              const virtualItems = virtualizer.getVirtualItems();
              const firstItem = virtualItems[0];
              const lastItem = virtualItems[virtualItems.length - 1];
              return (
                <div className="lyra-agents-chat-virtual" style={{ position: "relative" }}>
                  {firstItem === undefined || lastItem === undefined ? null : (
                    <>
                      {/* Rows render in normal flow: the browser stacks real
                          boxes, so rewrapped heights can never overlap or gap
                          neighbors. The virtualizer only picks the window and
                          sizes the spacers, so stale measurements degrade to
                          scrollbar drift instead of mispositioned rows. */}
                      <div aria-hidden style={{ height: Math.max(0, firstItem.start) }} />
                      {virtualItems.map((item) => {
                        const message = messages[item.index];
                        if (message === undefined) return null;
                        return (
                          <div
                            key={message.id}
                            ref={virtualizer.measureElement}
                            data-index={item.index}
                            className={CHAT_MESSAGE_SLOT_CLASS}
                            data-chat-message-id={message.id}
                            data-chat-message-author={message.author}
                          >
                            <Message
                              message={message}
                              showActivityIndicator={
                                activityIndicatorHostMessageId === null ||
                                message.id === activityIndicatorHostMessageId
                              }
                              activityIndicatorMessage={
                                message.id === activityIndicatorHostMessageId ? activityIndicatorMessage : null
                              }
                              highlightCitationTarget={citationHighlightMessageId === message.id}
                              onContextMenu={openMessageContextMenu}
                              onCiteMessage={() => addCitationToComposer(buildFullMessageCitation(message))}
                            />
                          </div>
                        );
                      })}
                      <div
                        aria-hidden
                        style={{
                          height: Math.max(0, virtualizer.getTotalSize() - lastItem.end)
                        }}
                      />
                    </>
                  )}
                </div>
              );
            })()
          )}
        </div>
      </div>

      <div className={COMPOSER_WRAP_CLASS} ref={composerWrapRef}>
        <div className={COMPOSER_RAIL_CLASS}>
          <AgentBrowserCapsule
            desktopApi={desktopApi}
            isTurnRunning={isTurnRunning}
            setActiveBrowserTab={setActiveBrowserTab}
            openUrlInWorkbench={openUrlInWorkbench}
          />
          <div className={COMPOSER_TOPROW_CLASS}>
          {gitCounts !== null ? (
            <AppButton
              variant="ghost"
              size="sm"
              type="button"
              className={`${COMPOSER_RAIL_CHIP_CLASS} lyra-agents-composer-changes-chip`}
              aria-label={t("lyra-agents-composer.openChanges")}
              title={t("lyra-agents-composer.openChanges")}
              onClick={() => { void openProjectGit(); }}
            >
              <GitBranch size={13} strokeWidth={2.1} aria-hidden="true" />
              <span>{t("lyra-agents-composer.openChanges")}</span>
              {gitCounts.additions > 0 || gitCounts.deletions > 0 ? (
                <span className={COMPOSER_CHANGES_COUNTS_CLASS}>
                  <span className={DIFF_ADD_CLASS}>+{gitCounts.additions}</span>
                  <span className={DIFF_DEL_CLASS}>-{gitCounts.deletions}</span>
                </span>
              ) : null}
            </AppButton>
          ) : null}
          {showPlanChip ? (
            <AppButton
              variant="ghost"
              size="sm"
              type="button"
              className={COMPOSER_RAIL_CHIP_CLASS}
              aria-label={t("lyra-agents-composer.openPlan")}
              title={t("lyra-agents-composer.openPlan")}
              onClick={() => { void openPlanBoard(); }}
            >
              <BookText size={13} strokeWidth={2.1} aria-hidden="true" />
              <span>{t("lyra-agents-composer.openPlan")}</span>
            </AppButton>
          ) : null}
          <BackgroundTerminalButton session={session} desktopApi={desktopApi} />
          {isAtBottom ? null : (
            <AppButton
              variant="ghost"
              size="sm"
              type="button"
              className={`${COMPOSER_RAIL_CHIP_CLASS} lyra-agents-scroll-to-bottom motion-reduce:transition-none select-none in pointer-events-auto z-[var(--lyra-z-scroll-affordance)]`}
              onClick={autoScroll.resume}
              aria-label={t("scroll.toBottom")}
              title={t("scroll.toBottom")}
            >
              <ArrowDown size={13} strokeWidth={2.1} aria-hidden="true" />
            </AppButton>
          )}
          <TodoBar tasks={todos} onOpenBoard={openTodoBoard} />
          </div>
        </div>

        <UserGateHost
          sessionId={session.id ?? ""}
          permissionMode={permissionModeControls?.currentMode ?? "approval"}
          showDecisions={showDecisions}
          showPermission={showPermission}
          decisions={decisions}
          permissions={permissions}
          planReview={pendingPlanReview}
          onSubmitDecisions={submitDecisions}
          onApprovePermission={approvePermission}
          onDenyPermission={denyPermission}
          onOpenPlanReview={openPlanReview}
          onRespondPlanReview={respondPlanReview}
          autoResolve={desktopApi?.agent?.autoResolveUserGate ?? null}
          touchActivity={desktopApi?.agent?.touchUserGateActivity ?? null}
        />

        <Composer
          onSend={sendMessage}
          onCaptureWorkspaceScreenshot={captureWorkspaceScreenshot}
          onCaptureWindowScreenshot={captureWindowScreenshot}
          onPickFileFromFileManager={pickFileFromFileManager}
          workspaceTabs={workspaceTabs}
          terminalTabs={terminalTabs}
          onImageAttachmentClick={(image) => {
            if (!canOpenImageInWorkbench(image)) {
              return;
            }
            void openImageInWorkbench(image);
          }}
          onLinkClick={(url, title) => {
            void openUrlInWorkbench(url, title);
          }}
          modelControls={modelControls ?? null}
          permissionModeControls={permissionModeControls ?? null}
          onOpenModelSettings={openModelSettings}
          isTurnRunning={isTurnRunning}
          onCancelTurn={cancelTurn}
          pendingCitation={pendingCitation}
          pendingCitationNonce={pendingCitationNonce}
          pendingImages={pendingImages}
          pendingImagesNonce={pendingImagesNonce}
          pendingFiles={pendingFiles}
          pendingFilesNonce={pendingFilesNonce}
          onTranscriptCitationClick={(citation) => {
            void scrollToMessage(citation.messageId, {
              blockId: citation.blockId ?? null,
              startOffset: citation.startOffset ?? null
            });
          }}
          onPageCitationClick={(citation) => {
            void navigateToPageCitation(citation);
          }}
          disabledReason={
            hasPendingClarification
              ? t("lyra-agents-composer.answerClarificationFirst")
              : pendingPlanReview !== null
                ? t("lyra-agents-composer.reviewPlanFirst")
                : undefined
          }
        />

        <ComposerMetaBuiltinProvider value={composerMetaBuiltins}>
          <WorkbenchChromeComposerMetaRow sessionId={session.id} />
        </ComposerMetaBuiltinProvider>
        <div className={COMPOSER_CONTEXT_RING_SLOT_CLASS}>
          <ContextRing />
        </div>
      </div>
    </>
  );
}
