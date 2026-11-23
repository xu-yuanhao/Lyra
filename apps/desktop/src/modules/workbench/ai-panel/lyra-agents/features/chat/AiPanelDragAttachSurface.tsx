import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type ReactNode
} from "react";

import { clearTerminalTabDragPayload } from "../../../../terminal-dock/drag-transfer";
import { clearWorkspaceTabDragPayload } from "../../../../browser-tabs/workspace-drag-transfer";
import { clearFileManagerEntryDragPayload } from "../../../../file-manager/drag-transfer";
import {
  consumeActivePageDragCitation,
  hydrateActivePageDragCitationFromMain
} from "../../../../browser-tabs/page-drag-transfer";
import {
  isPageDragCitationSessionActive,
  subscribePageDragCitationSession
} from "../../../../browser-tabs/page-drag-citation-session";
import { getDesktopApi } from "../../../../shell/service";
import { useData } from "../../data/DataProvider";
import { isAiPanelAttachDrag, resolveAiPanelDropEffect } from "./ai-panel-drag-attach";
import { AGENTS_APP_CLASS, AGENTS_DRAG_ATTACH_ACTIVE_CLASS, AGENTS_DRAG_HOST_CLASS, AGENTS_DRAG_HOST_CONTENT_CLASS } from "../../../classes";

type AiPanelDragAttachSurfaceProps = {
  readonly children: ReactNode;
};

const isComposerAttachDrag = (dataTransfer: DataTransfer): boolean => {
  hydrateActivePageDragCitationFromMain();
  return isPageDragCitationSessionActive() || isAiPanelAttachDrag(dataTransfer);
};

export const AiPanelDragAttachSurface = ({ children }: AiPanelDragAttachSurfaceProps) => {
  const { attachDragPayloadToComposer } = useData();
  const [dragActive, setDragActive] = useState(false);
  const dragDepthRef = useRef(0);
  const dragActiveRef = useRef(false);
  const pageDragDropHandledRef = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const pageDragSessionActive = useSyncExternalStore(
    subscribePageDragCitationSession,
    isPageDragCitationSessionActive,
    () => false
  );

  const resetDragVisualState = useCallback(() => {
    dragDepthRef.current = 0;
    dragActiveRef.current = false;
    setDragActive(false);
  }, []);

  const clearNonPageDragPayloads = useCallback(() => {
    clearWorkspaceTabDragPayload();
    clearTerminalTabDragPayload();
    clearFileManagerEntryDragPayload();
  }, []);

  const clearAllDragPayloads = useCallback(() => {
    clearNonPageDragPayloads();
    consumeActivePageDragCitation();
  }, [clearNonPageDragPayloads]);

  const activateIfSupported = useCallback((dataTransfer: DataTransfer) => {
    if (!isComposerAttachDrag(dataTransfer)) {
      return false;
    }
    dragActiveRef.current = true;
    setDragActive(true);
    return true;
  }, []);

  const handleDragEnter = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!activateIfSupported(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    dragDepthRef.current += 1;
  }, [activateIfSupported]);

  const handleDragOver = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!isComposerAttachDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = resolveAiPanelDropEffect(event.dataTransfer);
    if (!dragActiveRef.current) {
      activateIfSupported(event.dataTransfer);
    }
  }, [activateIfSupported]);

  const handleDragLeave = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!dragActiveRef.current) {
      return;
    }
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      resetDragVisualState();
    }
  }, [resetDragVisualState]);

  const handleDrop = useCallback((event: ReactDragEvent<HTMLDivElement>) => {
    if (!isComposerAttachDrag(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pageDragDropHandledRef.current = true;
    resetDragVisualState();
    const dataTransfer = event.dataTransfer;
    void attachDragPayloadToComposer(dataTransfer)
      .then((attached) => {
        if (attached) {
          void getDesktopApi()?.screenshotPreview.dismiss().catch(() => undefined);
        }
      })
      .finally(() => {
        clearAllDragPayloads();
      });
  }, [attachDragPayloadToComposer, clearAllDragPayloads, resetDragVisualState]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) {
      return;
    }

    const isWithinHost = (target: EventTarget | null): boolean =>
      target instanceof Node && host.contains(target);

    const handleCaptureDragOver = (event: globalThis.DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (dataTransfer === null || !isComposerAttachDrag(dataTransfer)) {
        return;
      }
      if (!isWithinHost(event.target)) {
        return;
      }
      event.preventDefault();
      dataTransfer.dropEffect = resolveAiPanelDropEffect(dataTransfer);
      dragActiveRef.current = true;
      setDragActive(true);
    };

    const handleCaptureDrop = (event: globalThis.DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (dataTransfer === null || !isComposerAttachDrag(dataTransfer)) {
        return;
      }
      if (!isWithinHost(event.target)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      pageDragDropHandledRef.current = true;
      resetDragVisualState();
      void attachDragPayloadToComposer(dataTransfer)
        .then((attached) => {
          if (attached) {
            void getDesktopApi()?.screenshotPreview.dismiss().catch(() => undefined);
          }
        })
        .finally(() => {
          clearAllDragPayloads();
        });
    };

    document.addEventListener("dragover", handleCaptureDragOver, true);
    document.addEventListener("drop", handleCaptureDrop, true);
    return () => {
      document.removeEventListener("dragover", handleCaptureDragOver, true);
      document.removeEventListener("drop", handleCaptureDrop, true);
    };
  }, [attachDragPayloadToComposer, clearAllDragPayloads, resetDragVisualState]);

  useEffect(() => {
    const handleDragEnd = () => {
      resetDragVisualState();
      clearNonPageDragPayloads();
      window.requestAnimationFrame(() => {
        if (pageDragDropHandledRef.current) {
          pageDragDropHandledRef.current = false;
          return;
        }
        if (isPageDragCitationSessionActive()) {
          consumeActivePageDragCitation();
        }
      });
    };
    document.addEventListener("dragend", handleDragEnd);
    return () => {
      document.removeEventListener("dragend", handleDragEnd);
    };
  }, [clearNonPageDragPayloads, resetDragVisualState]);

  return (
    <div
      ref={hostRef}
      className={`${AGENTS_DRAG_HOST_CLASS} ${AGENTS_DRAG_ATTACH_ACTIVE_CLASS}`}
      data-drag-attach-active={dragActive ? "true" : "false"}
      data-page-drag-session-active={pageDragSessionActive ? "true" : "false"}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={`${AGENTS_DRAG_HOST_CONTENT_CLASS} ${AGENTS_APP_CLASS}`}
      >
        {children}
      </div>
    </div>
  );
};
