import type { CSSProperties } from "react";

import { APP_TAB_ITEM_CLASS, APP_TAB_MAIN_CLASS } from "@renderer/ui/components";

import { cx } from "../ui-primitives";
import {
  BROWSER_TAB_ITEM_CLASS,
  BROWSER_TAB_MAIN_CLASS,
  BROWSER_TAB_STRIP_CLASS,
  BROWSER_TABS_CLASS,
  BROWSER_TABS_REORDER_CLASS,
  BROWSER_TABS_SPLIT_DROP_CLASS,
  BROWSER_TABS_TERMINAL_DROP_CLASS
} from "./classes";
import type { WorkspaceTab } from "../workspace-tabs/types";
import type { RightDragPreview } from "./tab-strip-types";

export type BrowserTabStripTabModel = {
  readonly tab: WorkspaceTab;
  readonly isAgentActive: boolean;
  readonly tabClassName: string;
  readonly tabMainClassName: string;
  readonly tabStyle?: CSSProperties | undefined;
  readonly closeLabel: string;
  readonly showClose: boolean;
};

export type BrowserTabStripPreviewModel = {
  readonly tab: WorkspaceTab;
  readonly shellStyle: CSSProperties;
  readonly tabClassName: string;
  readonly tabStyle: CSSProperties;
  readonly mainClassName: string;
};

export type BrowserTabStripRenderModel = {
  readonly navClassName: string;
  readonly navStyle?: CSSProperties | undefined;
  readonly stripClassName: string;
  readonly addButtonStyle?: CSSProperties | undefined;
  readonly listSpacerStyle?: CSSProperties | undefined;
  readonly tabs: readonly BrowserTabStripTabModel[];
  readonly preview: BrowserTabStripPreviewModel | null;
};

type CreateBrowserTabStripRenderModelInput = {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
  readonly agentActiveTabId?: string | null;
  readonly splitGroupTabIds: readonly string[];
  readonly closeTabLabel: string;
  readonly isTabInSplit?: ((tabId: string) => boolean) | undefined;
  readonly isTerminalDropActive: boolean;
  readonly dropIndicatorX: number | null;
  readonly isSplitDropActive: boolean;
  readonly splitDropTargetTabId: string | null;
  readonly workspaceDragTabId: string | null;
  readonly rightDragPreview: RightDragPreview | null;
  readonly closeLockedTabWidth?: number | null;
};

export const createBrowserTabStripRenderModel = ({
  tabs,
  activeTabId,
  agentActiveTabId = null,
  splitGroupTabIds,
  closeTabLabel,
  isTabInSplit,
  isTerminalDropActive,
  dropIndicatorX,
  isSplitDropActive,
  splitDropTargetTabId,
  workspaceDragTabId,
  rightDragPreview,
  closeLockedTabWidth = null
}: CreateBrowserTabStripRenderModelInput): BrowserTabStripRenderModel => {
  const splitGroupLookup = new Set(splitGroupTabIds);
  const isSplitGroupActive = splitGroupLookup.has(activeTabId);
  const isDraggingSplitGroup =
    workspaceDragTabId !== null && splitGroupLookup.has(workspaceDragTabId);
  const showClose = tabs.length > 1;

  const tabModels = tabs.map((tab, index): BrowserTabStripTabModel => {
    const isActive = tab.id === activeTabId;
    const isAgentActive = tab.id === agentActiveTabId;
    const nextTab = tabs[index + 1];
    const isCurrentTabInSplit =
      splitGroupLookup.has(tab.id) || isTabInSplit?.(tab.id) === true;
    const isNextTabInSplit =
      nextTab !== undefined &&
      (splitGroupLookup.has(nextTab.id) || isTabInSplit?.(nextTab.id) === true);
    const isFocusedTabInActiveSplitGroup =
      isSplitGroupActive && isCurrentTabInSplit && isActive;
    const isTabInDraggingSplitGroup = isDraggingSplitGroup && isCurrentTabInSplit;
    return {
      tab,
      isAgentActive,
      closeLabel: `${closeTabLabel}-${tab.title}`,
      showClose,
      tabClassName: cx(
        APP_TAB_ITEM_CLASS,
        BROWSER_TAB_ITEM_CLASS,
        "lyra-browser-tab-item-drag-enabled",
        "lyra-allow-web-drag",
        isActive && "lyra-tab-item-active",
        isActive && "lyra-browser-tab-item-active",
        isAgentActive && "lyra-browser-tab-item-agent-active",
        splitDropTargetTabId === tab.id && "lyra-browser-tab-item-split-target",
        isCurrentTabInSplit && isSplitGroupActive
          && "lyra-browser-tab-item-split-group-active",
        isCurrentTabInSplit && isNextTabInSplit
          && "lyra-browser-tab-item-split-joined-next",
        workspaceDragTabId === tab.id && "lyra-browser-tab-item-dragging",
        isTabInDraggingSplitGroup && "lyra-browser-tab-item-split-group-dragging"
      ),
      tabMainClassName: cx(
        APP_TAB_MAIN_CLASS,
        BROWSER_TAB_MAIN_CLASS,
        isFocusedTabInActiveSplitGroup && "lyra-browser-tab-main-split-focused"
      )
    };
  });

  const previewTab = rightDragPreview === null
    ? null
    : tabs.find((tab) => tab.id === rightDragPreview.tabId) ?? null;
  const preview = rightDragPreview === null || previewTab === null
    ? null
    : {
        tab: previewTab,
        shellStyle: {
          transform: `translate(${rightDragPreview.x + 14}px, ${rightDragPreview.y + 10}px)`
        },
        tabClassName: `${rightDragPreview.tabClassName} lyra-browser-tab-right-drag-preview-tab`,
        tabStyle: {
          width: `${Math.round(rightDragPreview.width)}px`,
          minWidth: `${Math.round(rightDragPreview.width)}px`,
          maxWidth: `${Math.round(rightDragPreview.width)}px`
        },
        mainClassName: `${rightDragPreview.tabMainClassName} lyra-browser-tab-right-drag-preview-main`
      };

  const navStyle = {
    ...(dropIndicatorX === null
      ? {}
      : { "--lyra-browser-drop-indicator-x": `${dropIndicatorX}px` }),
    ...(closeLockedTabWidth === null
      ? {}
      : { "--lyra-browser-tab-close-lock-w": `${Math.round(closeLockedTabWidth)}px` })
  } as CSSProperties;

  return {
    navClassName: cx(
      BROWSER_TABS_CLASS,
      isTerminalDropActive && BROWSER_TABS_TERMINAL_DROP_CLASS,
      dropIndicatorX !== null && BROWSER_TABS_REORDER_CLASS,
      isSplitDropActive && BROWSER_TABS_SPLIT_DROP_CLASS
    ),
    navStyle: Object.keys(navStyle).length === 0 ? undefined : navStyle,
    stripClassName: cx(
      BROWSER_TAB_STRIP_CLASS,
      workspaceDragTabId !== null && "lyra-browser-tab-strip-sorting",
      closeLockedTabWidth !== null && "lyra-tab-strip-close-lock"
    ),
    tabs: tabModels,
    preview
  };
};
