import type { BrowserWindow, WebContents, WebContentsView } from "electron";

import type {
  WorkbenchBrowserElevationSession,
  WorkbenchBrowserPageLayout,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserRecoveryFailure,
  WorkbenchBrowserSharedControlEvent,
  WorkbenchLumenTargetRef
} from "../../../shared/desktop-bridge";
import type { BrowserAgentCursorOverlayAction, BrowserAgentCursorOverlayPhase } from "../agent-cursor-overlay";
import type { SharedControlSnapshot } from "../shared-control";
import type {
  WorkbenchBrowserAgentElement,
  WorkbenchBrowserAgentObservation,
  WorkbenchBrowserAgentInteraction,
  WorkbenchBrowserAgentModeInfo,
  WorkbenchBrowserAgentScrollEffect,
  WorkbenchBrowserAgentTargetMode,
  WorkbenchBrowserFrameGlobalBounds,
  WorkbenchBrowserSemanticBlockedRegion,
  WorkbenchBrowserSemanticFrame
} from "../types";

type BrowserPageFindTarget = {
  readonly tabId: string;
  readonly webContents: WebContents;
  readonly address: string;
  readonly title: string;
};

type BrowserPageFindRevealResult = {
  readonly ok: boolean;
  readonly rect?: {
    readonly left: number;
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
  };
};

type BrowserPageEntry = {
  readonly tabId: string;
  readonly view: WebContentsView;
  recoveryView?: WebContentsView;
  readonly webContents: WebContents;
  requestedAddress: string;
  titleHint: string | null;
  attached: boolean;
  viewVisible: boolean;
  isDestroyed: boolean;
  layout: WorkbenchBrowserPageLayout | null;
  runtime: WorkbenchBrowserPageRuntimeState;
  historyRestoreAttempted: boolean;
  runtimeAddressUpdatedAt: number;
  lastTopologySyncAt: number;
  readonly disposeListeners: () => void;
};

type BrowserAgentPageTarget = {
  readonly tabId: string;
  readonly webContents: WebContents;
  readonly targetMode: WorkbenchBrowserAgentTargetMode;
  readonly liveEntry?: BrowserPageEntry;
  browserMode: WorkbenchBrowserAgentModeInfo;
  address: string;
  title: string;
  faviconUrl?: string | undefined;
  isLoading: boolean;
};

type BrowserAgentViewportState = {
  readonly width: number;
  readonly height: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly maxScrollX: number;
  readonly maxScrollY: number;
};

type BrowserAgentAutoScrollResult = {
  readonly element?: WorkbenchBrowserAgentElement;
  readonly point?: {
    readonly x: number;
    readonly y: number;
  };
  readonly effect?: WorkbenchBrowserAgentScrollEffect;
};

type BrowserAgentShadowEntry = BrowserAgentPageTarget & {
  readonly window: BrowserWindow;
  readonly sourceTabId: string;
  detached: boolean;
};

type BrowserAgentLoginBorrowResult = {
  readonly borrowed: boolean;
  readonly sourceOrigin?: string;
  readonly cookieCount?: number;
  readonly localStorageItemCount?: number;
  readonly coverage: readonly ("cookies" | "localStorage")[];
  readonly unavailableReason?: string;
};

type BrowserPageTombstone = {
  readonly tabId: string;
  requestedAddress: string;
  titleHint: string | null;
  runtime: WorkbenchBrowserPageRuntimeState;
  recoveryFailure?: WorkbenchBrowserRecoveryFailure;
  readonly tombstonedAt: number;
};

type BrowserAgentCacheEntry = {
  readonly observationId: string;
  readonly mapEpoch: number;
  readonly elements: readonly WorkbenchBrowserAgentElement[];
  readonly elementsById: ReadonlyMap<number, WorkbenchBrowserAgentElement>;
  readonly elementsByTargetRef: ReadonlyMap<string, WorkbenchBrowserAgentElement>;
  readonly targets: readonly WorkbenchLumenTargetRef[];
  readonly targetsByRef: ReadonlyMap<string, WorkbenchLumenTargetRef>;
  readonly pageNotes?: NonNullable<WorkbenchBrowserAgentObservation["pageNotes"]>;
  readonly url: string;
  readonly title: string;
};

type BrowserAgentFollowSession = {
  readonly sessionId: string;
  turnId: string | null;
  readonly tabId: string;
  readonly targetMode: WorkbenchBrowserAgentTargetMode;
  readonly startedAt: number;
  endedAt: number | null;
  updatedAt: number;
  status: "running" | "completed" | "cancelled" | "failed" | "interrupted";
  reason: string | null;
  totalActions: number;
  interruptedCount: number;
  readonly actions: Array<{
    readonly id: string;
    readonly at: number;
    readonly tabId: string;
    readonly targetMode: WorkbenchBrowserAgentTargetMode;
    readonly action: BrowserAgentCursorOverlayAction;
    readonly interaction?: WorkbenchBrowserAgentInteraction;
    readonly cursorPhase?: BrowserAgentCursorOverlayPhase;
    readonly inputActive: boolean;
    readonly cursor?: { readonly x: number; readonly y: number };
    readonly result?: "success" | "failure" | "interrupted";
    readonly summary: string;
    readonly sharedControlState?: SharedControlSnapshot["state"];
    readonly criticalInput?: boolean;
    readonly redacted?: boolean;
  }>;
  readonly frames: Array<{
    readonly id: string;
    readonly at: number;
    readonly actionId: string;
    readonly tabId: string;
    readonly targetMode: WorkbenchBrowserAgentTargetMode;
    readonly cursor?: { readonly x: number; readonly y: number };
    readonly cursorPhase?: BrowserAgentCursorOverlayPhase;
    readonly event: "cursor" | "input" | "wait" | "navigation" | "interrupt";
  }>;
};

type BrowserElevationSessionRecord = WorkbenchBrowserElevationSession;

class SharedControlInterruptionError extends Error {
  readonly code = "sharedControlInterrupted";
  readonly handoff: WorkbenchBrowserSharedControlEvent;

  constructor(handoff: WorkbenchBrowserSharedControlEvent) {
    super("Live browser control was interrupted by user input.");
    this.name = "SharedControlInterruptionError";
    this.handoff = handoff;
  }
}

type BrowserAgentFrameOwnerCandidate = {
  readonly index: number;
  readonly sourceKind: "iframe" | "frame";
  readonly name: string;
  readonly src: string;
  readonly title: string;
  readonly selectorPreview: string;
  readonly bounds: WorkbenchBrowserFrameGlobalBounds;
  readonly visible: boolean;
  readonly hostChain: readonly string[];
};

type BrowserAgentSemanticFrameGraph = {
  readonly frames: readonly WorkbenchBrowserSemanticFrame[];
  readonly framesByTreeNodeId: ReadonlyMap<number, WorkbenchBrowserSemanticFrame>;
  readonly warnings: readonly string[];
  readonly blockedRegions: readonly WorkbenchBrowserSemanticBlockedRegion[];
};

type BrowserAgentRawFrameObservation = {
  readonly frame: WorkbenchBrowserSemanticFrame;
  readonly raw: Record<string, unknown>;
};


export type {
  BrowserAgentAutoScrollResult,
  BrowserAgentCacheEntry,
  BrowserAgentFollowSession,
  BrowserAgentFrameOwnerCandidate,
  BrowserAgentLoginBorrowResult,
  BrowserAgentPageTarget,
  BrowserAgentRawFrameObservation,
  BrowserAgentSemanticFrameGraph,
  BrowserAgentShadowEntry,
  BrowserAgentViewportState,
  BrowserElevationSessionRecord,
  BrowserPageEntry,
  BrowserPageFindRevealResult,
  BrowserPageFindTarget,
  BrowserPageTombstone
};
export { SharedControlInterruptionError };
