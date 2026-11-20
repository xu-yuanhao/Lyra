import { BrowserWindow, nativeImage, screen } from "electron";

import type { ScreenshotPreviewImage } from "./types";

const PREVIEW_WIDTH = 148;
const PREVIEW_HEIGHT = 104;
const PREVIEW_MARGIN = 18;
const AUTO_DISMISS_MS = 8_000;

const previewHtml = (
  imageDataUrl: string,
  label: string
): string => `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: transparent;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        user-select: none;
      }
      .shell {
        box-sizing: border-box;
        width: 100%;
        height: 100%;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        border-radius: 14px;
        background: rgba(18, 20, 24, 0.82);
        border: 1px solid rgba(255, 255, 255, 0.14);
        box-shadow: 0 14px 36px rgba(0, 0, 0, 0.38);
        backdrop-filter: blur(18px);
      }
      .thumb-wrap {
        flex: 1;
        min-height: 0;
        border-radius: 10px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.04);
      }
      img {
        display: block;
        width: 100%;
        height: 100%;
        object-fit: cover;
        pointer-events: none;
      }
      .meta {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        color: rgba(255, 255, 255, 0.88);
        font-size: 12px;
        line-height: 1.2;
      }
      .hint {
        opacity: 0.78;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dismiss {
        appearance: none;
        border: 0;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.12);
        color: rgba(255, 255, 255, 0.9);
        cursor: pointer;
        font-size: 12px;
        line-height: 18px;
        padding: 0;
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div class="thumb-wrap" aria-label="${label}">
        <img src="${imageDataUrl}" alt="${label}" />
      </div>
      <div class="meta">
        <span class="hint">Drag to insert</span>
        <button class="dismiss" type="button" aria-label="Dismiss">×</button>
      </div>
    </div>
    <script>
      document.querySelector(".dismiss")?.addEventListener("click", () => {
        window.close();
      });
    </script>
  </body>
</html>`;

export type ScreenshotPreviewWindowController = {
  readonly present: (
    preview: ScreenshotPreviewImage,
    filePath: string,
    onDragStarted: () => void
  ) => void;
  readonly dismiss: () => void;
  readonly dispose: () => void;
};

export const createScreenshotPreviewWindowController = (): ScreenshotPreviewWindowController => {
  let window: BrowserWindow | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;
  let dragAnchor: { readonly x: number; readonly y: number } | null = null;
  let dragStarted = false;
  let currentFilePath: string | null = null;
  let onDragStartedHandler: (() => void) | null = null;

  const clearDismissTimer = (): void => {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  };

  const scheduleDismiss = (): void => {
    clearDismissTimer();
    dismissTimer = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
  };

  const positionWindow = (targetWindow: BrowserWindow): void => {
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    const x = Math.round(area.x + area.width - PREVIEW_WIDTH - PREVIEW_MARGIN);
    const y = Math.round(area.y + area.height - PREVIEW_HEIGHT - PREVIEW_MARGIN);
    targetWindow.setBounds({
      x,
      y,
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT
    });
  };

  const detachMouseTracking = (): void => {
    dragAnchor = null;
    dragStarted = false;
    currentFilePath = null;
    onDragStartedHandler = null;
  };

  const dismiss = (): void => {
    clearDismissTimer();
    detachMouseTracking();
    if (window !== null && window.isDestroyed() === false) {
      window.close();
    }
    window = null;
  };

  const present = (
    preview: ScreenshotPreviewImage,
    filePath: string,
    onDragStarted: () => void
  ): void => {
    dismiss();
    currentFilePath = filePath;
    onDragStartedHandler = onDragStarted;
    const mimeType = preview.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
    const imageDataUrl = `data:${mimeType};base64,${preview.imageBase64}`;
    const label = preview.label?.trim() || "Screenshot";

    const nextWindow = new BrowserWindow({
      width: PREVIEW_WIDTH,
      height: PREVIEW_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      type: process.platform === "darwin" ? "panel" : "toolbar",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });
    nextWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    nextWindow.setAlwaysOnTop(true, "screen-saver");
    positionWindow(nextWindow);

    const { webContents } = nextWindow;
    webContents.on("before-mouse-event", (event, input) => {
      if (currentFilePath === null) {
        return;
      }
      if (input.type === "mouseDown" && input.button === "left") {
        dragAnchor = { x: input.x, y: input.y };
        dragStarted = false;
        return;
      }
      if (input.type === "mouseMove" && dragAnchor !== null && dragStarted === false) {
        const distance = Math.hypot(input.x - dragAnchor.x, input.y - dragAnchor.y);
        if (distance < 5) {
          return;
        }
        dragStarted = true;
        event.preventDefault();
        const icon = nativeImage.createFromPath(currentFilePath).resize({ width: 96, height: 96 });
        webContents.startDrag({
          file: currentFilePath,
          icon
        });
        onDragStartedHandler?.();
      }
      if (input.type === "mouseUp") {
        dragAnchor = null;
      }
    });

    nextWindow.on("closed", () => {
      if (window === nextWindow) {
        window = null;
      }
      detachMouseTracking();
      clearDismissTimer();
    });

    void webContents.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(previewHtml(imageDataUrl, label))}`
    ).then(() => {
      if (nextWindow.isDestroyed()) {
        return;
      }
      nextWindow.showInactive();
      scheduleDismiss();
    });

    window = nextWindow;
  };

  const dispose = (): void => {
    dismiss();
  };

  return {
    present,
    dismiss,
    dispose
  };
};