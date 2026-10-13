import { View, type BrowserWindow } from "electron";

import type {
  WorkbenchBrowserLayoutSnapshot,
  WorkbenchBrowserPageLayout,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserPageSpec,
  WorkbenchBrowserTopologySnapshot
} from "../../../shared/desktop-bridge";
import { EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT } from "../../../shared/workbench-browser";
import type { WorkbenchBrowserAgentTargetMode } from "../types";
import {
  normalizeLayout,
  normalizeTopology,
  toBounds
} from "./normalizers";
import type { BrowserPageEntry } from "./types";

type LayoutControllerHost = {
  readonly getWindow: () => BrowserWindow | null;
  readonly entries: Map<string, BrowserPageEntry>;
  readonly updateRuntimeState: (
    entry: BrowserPageEntry,
    patch: Partial<WorkbenchBrowserPageRuntimeState>
  ) => void;
  readonly disposeCdpAuditSession: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ) => void;
  readonly startCdpAuditSessionForEntry: (entry: BrowserPageEntry) => void;
  readonly cancelTombstoneTimer: (tabId: string) => void;
  readonly scheduleTombstone: (entry: BrowserPageEntry) => void;
  readonly evictExcessHiddenPages: () => void;
  readonly bumpLiveViewBoundsEpoch: (tabId: string) => number;
  readonly reattachVisiblePopover: () => void;
  readonly syncFocusIsolation: (window: BrowserWindow, entries: readonly BrowserPageEntry[]) => void;
};

export const createLayoutController = ({
  getWindow,
  entries,
  updateRuntimeState,
  disposeCdpAuditSession,
  startCdpAuditSessionForEntry,
  cancelTombstoneTimer,
  scheduleTombstone,
  evictExcessHiddenPages,
  bumpLiveViewBoundsEpoch,
  reattachVisiblePopover,
  syncFocusIsolation
}: LayoutControllerHost) => {
  const overlayView = new View();
  let overlayAttached = false;
  let attachedWindow: BrowserWindow | null = null;
  let overlayVisible = false;
  let modalOcclusionActive = false;
  let topology: WorkbenchBrowserTopologySnapshot = {
    activeTabId: null,
    pages: []
  };
  let layoutSnapshot: WorkbenchBrowserLayoutSnapshot = EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT;

  const readTopology = (): WorkbenchBrowserTopologySnapshot => topology;
  const readLayoutSnapshot = (): WorkbenchBrowserLayoutSnapshot => layoutSnapshot;

  const findLayout = (tabId: string): WorkbenchBrowserPageLayout | null =>
    layoutSnapshot.layouts.find((layout) => layout.tabId === tabId) ?? null;

  const canMaterializePage = (spec: WorkbenchBrowserPageSpec): boolean => {
    return spec.isActive || spec.isVisible === true;
  };

  const getActiveOrFocusedTabId = (): string | null => {
    const focusedLayout = layoutSnapshot.layouts.find(
      (layout) => layout.visible && layout.isFocusedPane
    );
    if (focusedLayout !== undefined && entries.has(focusedLayout.tabId)) {
      return focusedLayout.tabId;
    }
    if (topology.activeTabId !== null && entries.has(topology.activeTabId)) {
      return topology.activeTabId;
    }
    return topology.pages[0]?.tabId ?? null;
  };

  const applyLayout = (): void => {
    const window = getWindow();
    if (window === null || window.isDestroyed()) {
      return;
    }

    if (attachedWindow !== window) {
      attachedWindow = window;
      overlayAttached = false;
    }
    const rootView = window.contentView;
    const contentBounds = window.getContentBounds();
    const nextOverlayBounds = {
      x: 0,
      y: 0,
      width: Math.max(contentBounds.width, layoutSnapshot.windowWidth, 1),
      height: Math.max(contentBounds.height, layoutSnapshot.windowHeight, 1)
    };
    const currentOverlayBounds = overlayView.getBounds();
    if (
      currentOverlayBounds.x !== nextOverlayBounds.x
      || currentOverlayBounds.y !== nextOverlayBounds.y
      || currentOverlayBounds.width !== nextOverlayBounds.width
      || currentOverlayBounds.height !== nextOverlayBounds.height
    ) {
      overlayView.setBounds(nextOverlayBounds);
    }
    const layoutVisibleEntries = layoutSnapshot.layouts
      .filter((layout) => layout.visible)
      .map((layout) => {
        const entry = entries.get(layout.tabId);
        if (entry === undefined || entry.isDestroyed) {
          return null;
        }
        return { entry, layout };
      })
      .filter((value): value is { entry: BrowserPageEntry; layout: WorkbenchBrowserPageLayout } => value !== null)
      .sort((left, right) => {
        const leftOrder = left.layout.zIndex + (left.entry.runtime.isHtmlFullscreen ? 10000 : 0);
        const rightOrder = right.layout.zIndex + (right.entry.runtime.isHtmlFullscreen ? 10000 : 0);
        if (leftOrder === rightOrder) {
          return left.entry.tabId.localeCompare(right.entry.tabId);
        }
        return leftOrder - rightOrder;
      });
    const nativeVisibleEntries = modalOcclusionActive ? [] : layoutVisibleEntries;
    if (nativeVisibleEntries.length > 0) {
      if (!overlayAttached) {
        rootView.addChildView(overlayView);
        overlayAttached = true;
      }
      if (!overlayVisible) {
        overlayView.setVisible(true);
        overlayVisible = true;
      }
    }
    if (nativeVisibleEntries.length === 0 && overlayVisible) {
      overlayView.setVisible(false);
      overlayVisible = false;
    }

    for (const entry of entries.values()) {
      const layout = findLayout(entry.tabId);
      const isLayoutVisible = layout?.visible === true;
      const isNativeVisible = isLayoutVisible && !modalOcclusionActive;
      entry.layout = layout;
      updateRuntimeState(entry, {
        isActive: topology.activeTabId === entry.tabId,
        isVisible: isLayoutVisible,
        lifecycleState:
          topology.activeTabId === entry.tabId
            ? "foreground"
            : isLayoutVisible
              ? "visible"
              : "hot-hidden",
        isTombstoned: false
      });

      if (!isNativeVisible) {
        if (!isLayoutVisible) {
          disposeCdpAuditSession(entry.tabId, "live");
        }
        if (entry.attached) {
          overlayView.removeChildView(entry.recoveryView ?? entry.view);
          entry.attached = false;
        }
        if (entry.viewVisible) {
          (entry.recoveryView ?? entry.view).setVisible(false);
          entry.viewVisible = false;
        }
        if (isLayoutVisible) {
          cancelTombstoneTimer(entry.tabId);
        } else {
          scheduleTombstone(entry);
        }
      } else {
        cancelTombstoneTimer(entry.tabId);
      }
    }

    for (const { entry, layout } of nativeVisibleEntries) {
      const view = entry.recoveryView ?? entry.view;
      const nextBounds = toBounds(layout);
      const currentBounds = view.getBounds();
      if (
        currentBounds.x !== nextBounds.x
        || currentBounds.y !== nextBounds.y
        || currentBounds.width !== nextBounds.width
        || currentBounds.height !== nextBounds.height
      ) {
        view.setBounds(nextBounds);
        bumpLiveViewBoundsEpoch(entry.tabId);
      }
      if (!entry.viewVisible) {
        view.setVisible(true);
        entry.viewVisible = true;
      }
      if (!entry.attached) {
        overlayView.addChildView(view);
        entry.attached = true;
      }
      if (entry.recoveryView === undefined) startCdpAuditSessionForEntry(entry);
    }
    if (!modalOcclusionActive) {
      reattachVisiblePopover();
    }
    syncFocusIsolation(window, nativeVisibleEntries.filter(({ entry }) => entry.recoveryView === undefined).map(({ entry }) => entry));
    evictExcessHiddenPages();
  };

  const syncTopology = (
    snapshot: WorkbenchBrowserTopologySnapshot
  ): {
    readonly previousActiveTabId: string | null;
    readonly topology: WorkbenchBrowserTopologySnapshot;
  } => {
    const previousActiveTabId = topology.activeTabId;
    topology = normalizeTopology(snapshot);
    return {
      previousActiveTabId,
      topology
    };
  };

  const syncLayout = (snapshot: WorkbenchBrowserLayoutSnapshot): void => {
    layoutSnapshot = normalizeLayout(snapshot);
    applyLayout();
  };

  const setModalOcclusionActive = (active: boolean): void => {
    if (modalOcclusionActive === active) {
      return;
    }
    modalOcclusionActive = active;
    applyLayout();
  };

  const detachEntryView = (entry: BrowserPageEntry): void => {
    if (entry.attached) {
      overlayView.removeChildView(entry.recoveryView ?? entry.view);
      entry.attached = false;
      entry.viewVisible = false;
    }
  };

  const dispose = (): void => {
    const window = getWindow();
    if (window !== null && window.isDestroyed() === false && overlayAttached) {
      window.contentView.removeChildView(overlayView);
      overlayAttached = false;
      overlayVisible = false;
    }
  };

  return {
    applyLayout,
    canMaterializePage,
    detachEntryView,
    dispose,
    findLayout,
    getActiveOrFocusedTabId,
    overlayView,
    readLayoutSnapshot,
    readTopology,
    setModalOcclusionActive,
    syncLayout,
    syncTopology
  };
};
