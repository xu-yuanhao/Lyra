import type { WorkbenchActiveDocumentHint } from "./workbench-documents";

export type WorkbenchObservationAppId = string;

export type WorkbenchObservationPageKind =
  | "search"
  | "results"
  | "page"
  | "settings"
  | "terminal"
  | "app";

export type WorkbenchObservationDetail = "summary" | "full";

export type WorkbenchObservationErrorCode =
  | "tab_not_found"
  | "unsupported_tab_kind"
  | "renderer_timeout"
  | "renderer_bridge_unavailable"
  | "browser_capture_unavailable"
  | "background_visual_capture_unsupported"
  | "terminal_unavailable";

export type WorkbenchObservationError = {
  readonly code: WorkbenchObservationErrorCode;
  readonly message: string;
};

export type WorkbenchObservationKind =
  | "page"
  | "search-home"
  | "search-results"
  | "file-editor"
  | "file-manager"
  | "image-viewer"
  | "terminal";

export type WorkbenchObservedTabDescriptor = {
  readonly tabId: string;
  readonly title: string;
  readonly pageKind: WorkbenchObservationPageKind;
  readonly appId?: WorkbenchObservationAppId;
  readonly appInstanceId?: string;
  readonly active: boolean;
  readonly visible: boolean;
  readonly focusedPane: boolean;
  readonly displayAddress?: string;
  readonly observable: boolean;
  readonly observationKind?: WorkbenchObservationKind;
};

export type WorkbenchTabsListRequest = {
  readonly scope?: "all" | "visible" | "active";
  readonly includeUnsupported?: boolean;
};

export type WorkbenchTabsLayoutSnapshot = {
  readonly layoutMode: "single" | "split";
  readonly splitGroupTabIds: readonly string[];
  readonly focusedSplitTabId: string | null;
};

export type WorkbenchTabsListResult = {
  readonly activeTabId: string | null;
  readonly visibleTabIds: readonly string[];
  readonly layout: WorkbenchTabsLayoutSnapshot;
  readonly tabs: readonly WorkbenchObservedTabDescriptor[];
};

export type WorkbenchTabCloseRequest = {
  readonly tabId: string;
};

export type WorkbenchTabCloseResult = {
  readonly tabId: string;
  readonly closed: boolean;
  readonly activeTabId: string | null;
  // ZCode-style receipt: the result is post-mutation and authoritative —
  // the caller must not re-read workspace state to verify.
  readonly receipt: string;
  readonly reason?: "tab_not_found" | "last_tab";
  readonly title?: string;
};

export type WorkbenchTabReorderRequest = {
  readonly tabId: string;
  readonly targetIndex: number;
};

export type WorkbenchTabReorderResult = {
  readonly tabId: string;
  readonly targetIndex: number;
  readonly tabIds: readonly string[];
  readonly layout: WorkbenchTabsLayoutSnapshot;
  readonly receipt: string;
};

export type WorkbenchTabSplitRequest = {
  readonly sourceTabId: string;
  readonly targetTabId: string;
};

export type WorkbenchTabSplitResult = {
  readonly sourceTabId: string;
  readonly targetTabId: string;
  readonly layout: WorkbenchTabsLayoutSnapshot;
  readonly receipt: string;
};

export type WorkbenchTabDetachSplitRequest = {
  readonly tabId: string;
};

export type WorkbenchTabDetachSplitResult = {
  readonly tabId: string;
  readonly layout: WorkbenchTabsLayoutSnapshot;
  readonly receipt: string;
};

export type WorkbenchTerminalMoveRequest = {
  readonly terminalTabId: string;
  readonly placement: WorkbenchTerminalPlacement;
  readonly targetIndex?: number;
};

export type WorkbenchTerminalMoveResult = WorkbenchTerminalPaneDescriptor;

export type WorkbenchTerminalPlacement = "dock" | "workspace";
export type WorkbenchTerminalSplitDirection = "horizontal" | "vertical";

export type WorkbenchTerminalPaneDescriptor = {
  readonly terminalTabId: string;
  readonly paneId: string;
  readonly sessionId: string;
  readonly title: string;
  readonly placement: WorkbenchTerminalPlacement;
  readonly isActive: boolean;
  readonly cwd?: string;
  readonly currentCwd?: string;
  readonly shell?: string;
  readonly sourceAgentSessionId?: string;
  readonly workspaceTabId?: string;
};

export type WorkbenchTerminalListRequest = Record<string, never>;

export type WorkbenchTerminalListResult = {
  readonly active: WorkbenchTerminalPaneDescriptor | null;
  readonly panes: readonly WorkbenchTerminalPaneDescriptor[];
};

export type WorkbenchTerminalOpenRequest = {
  readonly placement?: WorkbenchTerminalPlacement;
  readonly title?: string;
  readonly cwd?: string;
  readonly terminalTabId?: string;
  readonly paneId?: string;
  readonly sourceAgentSessionId?: string;
  readonly splitDirection?: WorkbenchTerminalSplitDirection;
};

export type WorkbenchTerminalOpenResult = WorkbenchTerminalPaneDescriptor;

export type WorkbenchTerminalFocusRequest = {
  readonly terminalTabId?: string;
  readonly paneId?: string;
  readonly sessionId?: string;
};

export type WorkbenchTerminalFocusResult = WorkbenchTerminalPaneDescriptor;

export type WorkbenchTerminalCloseRequest = {
  readonly terminalTabId?: string;
  readonly paneId?: string;
  readonly sessionId?: string;
};

export type WorkbenchTerminalCloseResult = {
  readonly closed: boolean;
  readonly terminalTabId?: string;
  readonly paneId?: string;
  readonly sessionId?: string;
};

export type WorkbenchTabActivateRequest = {
  readonly tabId: string;
};

export type WorkbenchTabActivateResult = {
  readonly tabId: string;
  readonly activeTabId: string;
};

export type WorkbenchWorkspaceReadRequest = {
  readonly detail?: WorkbenchObservationDetail;
  readonly includeVisual?: boolean;
};

export type WorkbenchVisualCaptureRequest = {
  readonly tabId: string;
};

export type WorkbenchTabExtractTextScope = "main" | "full";

export type WorkbenchTabExtractTextRequest = {
  readonly tabId: string;
  readonly scope?: WorkbenchTabExtractTextScope;
  readonly maxChars?: number;
  readonly cursor?: number;
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly paneId?: string;
};

export type WorkbenchTabExtractTextResult = {
  readonly tabId: string;
  readonly scope: WorkbenchTabExtractTextScope;
  readonly text: string;
  readonly truncated: boolean;
  readonly startChar: number;
  readonly endChar: number;
  readonly totalChars: number;
  readonly hasMore: boolean;
  readonly nextCursor?: number;
  readonly extractionMethod: string;
};

export type WorkbenchVisualCaptureResult = {
  readonly tabId: string;
  readonly mimeType: "image/png";
  readonly imageBase64: string;
  readonly width: number;
  readonly height: number;
  readonly visibleOnly: boolean;
  readonly visualFrame?: WorkbenchVisualFrame;
};

export type WorkbenchVisualFrame = {
  readonly documentId?: string;
  readonly captureId: string;
  readonly dpr: number;
  readonly cssViewportWidth: number;
  readonly cssViewportHeight: number;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly imageScale: number;
  readonly scrollX: number;
  readonly scrollY: number;
  readonly viewBoundsHash: string;
  readonly viewBoundsEpoch: number;
};

export type WorkbenchTabReadRequest = {
  readonly tabId: string;
  readonly detail?: WorkbenchObservationDetail;
  readonly maxChars?: number;
  readonly maxEntries?: number;
  readonly maxBytes?: number;
  readonly paneId?: string;
  readonly includeVisual?: boolean;
};

export type WorkbenchBrowserLinkSummary = {
  readonly text: string;
  readonly href: string;
};

export type WorkbenchBrowserFormSummary = {
  readonly action?: string;
  readonly method?: string;
  readonly fields: readonly string[];
};

export type BrowserTabObservation = {
  readonly kind: "page";
  readonly title: string;
  readonly address: string;
  readonly faviconUrl?: string;
  readonly isLoading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly domTitle?: string;
  readonly documentLanguage?: string;
  readonly selectionText?: string;
  readonly headings: readonly string[];
  readonly mainTextExcerpt: string;
  readonly links: readonly WorkbenchBrowserLinkSummary[];
  readonly forms: readonly WorkbenchBrowserFormSummary[];
  readonly truncated: boolean;
  readonly activeDocument?: WorkbenchActiveDocumentHint;
};

export type FileEditorObservation = {
  readonly kind: "file-editor";
  readonly filePath: string;
  readonly title: string;
  readonly languageId: string;
  readonly status: string;
  readonly isDirty: boolean;
  readonly isReadOnly: boolean;
  readonly revision?: string;
  readonly content: string;
  readonly truncated: boolean;
};

export type FileManagerObservation = {
  readonly kind: "file-manager";
  readonly viewKind: string;
  readonly presentationMode: string;
  readonly currentLocation: {
    readonly kind: string;
    readonly path?: string;
    readonly title?: string;
  } | null;
  readonly selectedEntryId?: string;
  readonly entries: readonly {
    readonly id: string;
    readonly name: string;
    readonly path: string;
    readonly kind?: string;
    readonly sizeBytes?: number;
    readonly modifiedAt?: string;
  }[];
  readonly truncated: boolean;
};

export type ImageViewerObservation = {
  readonly kind: "image-viewer";
  readonly filePath: string;
  readonly title: string;
  readonly status: string;
  readonly sessionId?: string;
  readonly message?: string;
  readonly mimeType?: string;
  readonly format?: string;
  readonly width?: number;
  readonly height?: number;
  readonly frameCount?: number;
  readonly hasAlpha?: boolean;
  readonly orientation?: number;
  readonly colorSpace?: string;
  readonly sizeBytes?: number;
  readonly sourceUrl?: string;
  readonly renderMode?: string;
  readonly cacheState?: string;
  readonly cacheId?: string;
  readonly generationId?: string;
  readonly sampleFormat?: string;
  readonly channelCount?: number;
  readonly tileSize?: number;
  readonly nativeTileSupported?: boolean;
  readonly hasInternalTiles?: boolean;
  readonly hasInternalMipmaps?: boolean;
  readonly importProgress?: number;
  readonly levels: readonly {
    readonly level: number;
    readonly width: number;
    readonly height: number;
    readonly scale: number;
  }[];
  readonly viewport: {
    readonly zoom: number;
    readonly offsetX: number;
    readonly offsetY: number;
    readonly rotation: number;
    readonly background: string;
  };
  readonly siblingIndex: number;
  readonly siblingCount: number;
  readonly truncated: boolean;
};

export type TerminalObservation = {
  readonly kind: "terminal";
  readonly activePaneId: string;
  readonly panes: readonly {
    readonly paneId: string;
    readonly sessionId: string;
    readonly title: string;
    readonly cwd?: string;
    readonly shell?: string;
    readonly isActive: boolean;
  }[];
  readonly activeOutput: string;
  readonly running: boolean;
  readonly exitCode: number | null;
  readonly truncated: boolean;
};

export type SearchHomeObservation = {
  readonly kind: "search-home";
  readonly inputValue: string;
  readonly hasResults: false;
};

export type SearchResultsObservation = {
  readonly kind: "search-results";
  readonly query: string;
  readonly webStatus: string;
  readonly localStatus: string;
  readonly blendedResults: readonly {
    readonly title: string;
    readonly url: string;
    readonly snippet: string;
  }[];
  readonly localResults: readonly {
    readonly path: string;
    readonly snippet?: string;
    readonly line?: number;
  }[];
  readonly truncated: boolean;
};

export type WorkbenchTabObservation =
  | BrowserTabObservation
  | FileEditorObservation
  | FileManagerObservation
  | ImageViewerObservation
  | TerminalObservation
  | SearchHomeObservation
  | SearchResultsObservation;

export type WorkbenchTabObservationResult = {
  readonly tab: WorkbenchObservedTabDescriptor;
  readonly observation: WorkbenchTabObservation;
  readonly visual?: WorkbenchVisualCaptureResult;
};

export type WorkbenchWorkspaceSnapshot = {
  readonly layoutMode: "single" | "split";
  readonly activeTabId: string | null;
  readonly focusedTabId: string | null;
  readonly visibleTabs: readonly WorkbenchTabObservationResult[];
};

export type WorkbenchObservationQueryRequest =
  | {
      readonly requestId: string;
      readonly method: "workbench.tabs.list_local";
      readonly payload: WorkbenchTabsListRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.workspace.read_local";
      readonly payload: WorkbenchWorkspaceReadRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.tab.read_local";
      readonly payload: WorkbenchTabReadRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.tab.activate_local";
      readonly payload: WorkbenchTabActivateRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.terminal.list_local";
      readonly payload: WorkbenchTerminalListRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.terminal.open_local";
      readonly payload: WorkbenchTerminalOpenRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.terminal.focus_local";
      readonly payload: WorkbenchTerminalFocusRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.terminal.close_local";
      readonly payload: WorkbenchTerminalCloseRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.tab.close_local";
      readonly payload: WorkbenchTabCloseRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.tab.reorder_local";
      readonly payload: WorkbenchTabReorderRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.tab.split_local";
      readonly payload: WorkbenchTabSplitRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.tab.detach_split_local";
      readonly payload: WorkbenchTabDetachSplitRequest;
    }
  | {
      readonly requestId: string;
      readonly method: "workbench.terminal.move_local";
      readonly payload: WorkbenchTerminalMoveRequest;
    };

export type WorkbenchObservationQueryResult = {
  readonly requestId: string;
  readonly ok: boolean;
  readonly result?: unknown;
  readonly error?: WorkbenchObservationError;
};
