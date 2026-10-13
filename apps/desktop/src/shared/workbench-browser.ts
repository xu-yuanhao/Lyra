export type WorkbenchBrowserNavigateRequest = {
  readonly address: string;
  readonly tabId?: string;
  readonly newTab?: boolean;
  readonly title?: string;
  readonly useFrameworkRouter?: boolean;
};

export type WorkbenchBrowserNavigateResult = {
  readonly address: string;
  readonly tabId: string | null;
  readonly title: string | null;
};

export type WorkbenchBrowserReadPageStateRequest = {
  readonly tabId?: string;
};

export type WorkbenchBrowserSearchInPageRequest = {
  readonly tabId?: string;
  readonly query: string;
  readonly caseSensitive?: boolean;
  readonly maxMatches?: number;
  readonly activeIndex?: number;
  readonly direction?: "current" | "next" | "previous";
  readonly reveal?: boolean;
  /** When true with `reveal`, clears in-page highlights after a short flash (e.g. citation jumps). */
  readonly ephemeralReveal?: boolean;
};

export type WorkbenchBrowserSearchInPageMatch = {
  readonly id: string;
  readonly index: number;
  readonly startChar: number;
  readonly endChar: number;
  readonly snippet: string;
};

export type WorkbenchBrowserSearchInPageResult = {
  readonly tabId: string;
  readonly address: string;
  readonly title: string;
  readonly query: string;
  readonly currentIndex: number;
  readonly activeMatchId?: string;
  readonly totalMatches: number;
  readonly matches: readonly WorkbenchBrowserSearchInPageMatch[];
  readonly truncated: boolean;
};

export type WorkbenchBrowserOmniboxSuggestion = {
  readonly value: string;
  readonly type: "history" | "search";
  readonly label?: string;
};

export type WorkbenchBrowserClientRect = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
};

export type WorkbenchBrowserSecurityLevel = "secure" | "insecure" | "system";
export type WorkbenchBrowserSecurityLocale = string;

export type WorkbenchBrowserSecurityLabels = {
  readonly ariaLabel: string;
  readonly secureTitle: string;
  readonly secureBody: string;
  readonly insecureTitle: string;
  readonly insecureBody: string;
  readonly systemTitle: string;
  readonly systemBody: string;
  readonly connectionLabel: string;
  readonly addressLabel: string;
  readonly hostLabel: string;
  readonly originLabel: string;
  readonly schemeLabel: string;
  readonly certificateSubjectLabel: string;
  readonly certificateSubjectCommonNameLabel: string;
  readonly certificateIssuerLabel: string;
  readonly certificateIssuerCommonNameLabel: string;
  readonly certificateValidFromLabel: string;
  readonly certificateValidToLabel: string;
  readonly certificateSerialLabel: string;
  readonly certificateFingerprintLabel: string;
  readonly certificateSubjectAltNameLabel: string;
  readonly certificateUnavailableLabel: string;
  readonly certificateNotApplicableLabel: string;
  readonly secureConnection: string;
  readonly insecureConnection: string;
  readonly localConnection: string;
  readonly unavailableReason: string;
  readonly unavailableNotHttps: string;
  readonly unavailableNoCertificate: string;
};

export type WorkbenchBrowserFindLabels = {
  readonly ariaLabel: string;
  readonly current: string;
  readonly result: string;
  readonly emptyStart: string;
  readonly emptyNoMatch: string;
  readonly truncationNotice: string;
};

export type WorkbenchBrowserOmniboxLabels = {
  readonly ariaLabel: string;
  readonly history: string;
  readonly searchSuggestion: string;
  readonly emptyStart: string;
  readonly emptyNoMatch: string;
};

export type WorkbenchBrowserCertificateInfo = {
  readonly subject?: string;
  readonly subjectCommonName?: string;
  readonly issuer?: string;
  readonly issuerCommonName?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly serialNumber?: string;
  readonly fingerprint256?: string;
  readonly subjectAltName?: string;
};

export type WorkbenchBrowserChromeSecurityPopoverPayload = {
  readonly level: WorkbenchBrowserSecurityLevel;
  readonly address: string;
  readonly domain: string;
  readonly locale?: WorkbenchBrowserSecurityLocale;
  readonly labels?: WorkbenchBrowserSecurityLabels;
  readonly scheme?: string;
  readonly origin?: string;
  readonly certificate?: WorkbenchBrowserCertificateInfo;
  readonly certificateStatus?: "available" | "unavailable" | "not-applicable";
  readonly certificateUnavailableReason?: string;
};

export type WorkbenchBrowserChromePopoverRequest = {
  readonly tabId?: string;
  readonly kind: "find" | "omnibox";
  readonly visible: boolean;
  readonly anchorRect?: WorkbenchBrowserClientRect;
  readonly theme?: WorkbenchBrowserWebThemeSnapshot;
  readonly find?: {
    readonly query: string;
    readonly placeholder?: string;
    readonly currentIndex: number;
    readonly totalMatches: number;
    readonly activeMatchId?: string;
    readonly matches: readonly WorkbenchBrowserSearchInPageMatch[];
    readonly truncated?: boolean;
    readonly labels?: WorkbenchBrowserFindLabels;
  };
  readonly omnibox?: {
    readonly value: string;
    readonly selectedIndex: number;
    readonly suggestions: readonly WorkbenchBrowserOmniboxSuggestion[];
    readonly labels?: WorkbenchBrowserOmniboxLabels;
  };
};

export type WorkbenchBrowserSetElementPickerModeRequest = {
  readonly tabId: string;
  readonly enabled: boolean;
  readonly mode?: WorkbenchBrowserElementPickerMode;
  readonly appearance?: WorkbenchBrowserElementPickerAppearance;
};

export const WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION = "persist:lyra-browser-live" as const;
export const WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION = "persist:lyra-browser-isolated" as const;

type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type WorkbenchBrowserProfileMode = "live" | "isolated";

export type BrowserStorageAvailability =
  | "available"
  | "unavailable"
  | "unknown";

export type BrowserStorageScopeManifest = {
  readonly availability: BrowserStorageAvailability;
  readonly manifestOnly: true;
  readonly count?: number | undefined;
  readonly reason?: string | undefined;
};

export type BrowserSiteStorageAvailability = {
  readonly origin: string;
  readonly cookieCount: number;
  readonly localStorage: BrowserStorageAvailability;
  readonly sessionStorage: BrowserStorageAvailability;
  readonly indexedDB: BrowserStorageAvailability;
  readonly capturedAt: number;
};

export type BrowserStorageStateRef = {
  readonly schemaVersion: typeof WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION;
  readonly profileId: string;
  readonly profileMode: WorkbenchBrowserProfileMode;
  readonly profilePartition: string;
  readonly chromiumStoragePath?: string | null | undefined;
  readonly persistence: "chromium-profile";
  readonly cookies: BrowserStorageScopeManifest;
  readonly localStorage: BrowserStorageScopeManifest;
  readonly indexedDB: BrowserStorageScopeManifest;
  readonly sessionStorage: BrowserStorageScopeManifest;
  readonly cacheStorage: BrowserStorageScopeManifest;
  readonly clearPolicy: {
    readonly siteScoped: true;
    readonly supportedOrigins: "http_https";
    readonly clears: readonly (
      | "cookies"
      | "localStorage"
      | "indexedDB"
      | "cacheStorage"
      | "serviceWorkers"
      | "webSQL"
    )[];
    readonly sensitiveValues: "metadata_only";
  };
  readonly relationship: {
    readonly livePartition: string;
    readonly isolatedPartition: string;
    readonly mode: "shared-live-tabs-isolated-agent";
    readonly migration: "none";
  };
  readonly sites?: readonly BrowserSiteStorageAvailability[] | undefined;
};

export type BrowserNavigationHistoryEntry = {
  readonly url: string;
  readonly title: string;
  readonly faviconUrl?: string;
  readonly timestamp: number;
};

export type BrowserNavigationHistory = {
  readonly entries: readonly BrowserNavigationHistoryEntry[];
  readonly currentIndex: number;
};

export type BrowserViewportState = {
  readonly width: number;
  readonly height: number;
  readonly deviceScaleFactor: number;
};

export type BrowserElementBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type BrowserActiveElementRef = {
  targetRef?: string | undefined;
  readonly signature: string;
  readonly tagName: string;
  role?: string | undefined;
  inputType?: string | undefined;
  selectorPreview?: string | undefined;
  cssSelector?: string | undefined;
  frameUrl?: string | undefined;
  textHash?: string | undefined;
  bounds?: BrowserElementBounds | undefined;
};

export type BrowserFormDraftFieldMetadata = {
  readonly targetRef: string;
  readonly tagName: string;
  readonly inputType?: string;
  readonly dirty: boolean;
  readonly sensitive: boolean;
  readonly valueLength?: number;
};

export type BrowserFormDraftMetadata = {
  readonly redacted: true;
  readonly fieldCount: number;
  readonly editedFieldCount: number;
  readonly passwordFieldCount: number;
  readonly sensitiveFieldCount: number;
  readonly fields: readonly BrowserFormDraftFieldMetadata[];
};

export type BrowserPageLoadState =
  | "idle"
  | "loading"
  | "failed";

export type BrowserTargetRegistryManifest = {
  readonly warmed: boolean;
  targetCount?: number | undefined;
  activeTargetRef?: string | undefined;
  readonly capturedAt: number;
};

export type WorkbenchBrowserRecoveryFailureReason =
  | "profile_missing"
  | "storage_unavailable"
  | "navigation_failed"
  | "target_stale"
  | "renderer_crashed";

export type WorkbenchBrowserRecoveryFailure = {
  readonly reason: WorkbenchBrowserRecoveryFailureReason;
  readonly message: string;
  readonly at: number;
};

export type WorkbenchBrowserPageRestoreState = {
  scrollX?: number | undefined;
  scrollY?: number | undefined;
  viewport?: BrowserViewportState | undefined;
  history?: BrowserNavigationHistory | undefined;
  loadState?: BrowserPageLoadState | undefined;
  activeElement?: BrowserActiveElementRef | undefined;
  formDraft?: BrowserFormDraftMetadata | undefined;
  targetRegistry?: BrowserTargetRegistryManifest | undefined;
  storage?: BrowserSiteStorageAvailability | undefined;
  textHash?: string | undefined;
  readonly capturedAt: number;
};

export type BrowserRecoveryAnchor = {
  readonly schemaVersion: typeof WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION;
  readonly tabId: string;
  readonly address: string;
  readonly title: string;
  readonly targetRef?: string;
  readonly textHash?: string;
  readonly visualArtifactRef?: string;
  readonly storageStateRef: {
    readonly profilePartition: string;
    siteOrigin?: string | undefined;
  };
  readonly authState:
    | "logged_in"
    | "possibly_logged_in"
    | "requires_user"
    | "unknown";
  readonly capturedAt: number;
};

export type BrowserSessionTabSnapshot = {
  readonly tabId: string;
  readonly address: string;
  readonly title: string;
  faviconUrl?: string | undefined;
  readonly isActive: boolean;
  lifecycleState?: WorkbenchBrowserPageLifecycleState | undefined;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly profilePartition: string;
  readonly restoreState: WorkbenchBrowserPageRestoreState;
  recoveryFailure?: WorkbenchBrowserRecoveryFailure | undefined;
};

export type BrowserSessionSnapshot = {
  readonly schemaVersion: typeof WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION;
  readonly snapshotId: string;
  readonly capturedAt: number;
  readonly activeTabId: string | null;
  readonly layout: WorkbenchBrowserLayoutSnapshot;
  readonly tabs: readonly BrowserSessionTabSnapshot[];
  readonly storageState: BrowserStorageStateRef;
  recoveryAnchor?: BrowserRecoveryAnchor | undefined;
  readonly migrations: readonly {
    readonly fromVersion: number;
    readonly toVersion: number;
    readonly migratedAt: number;
  }[];
};

export type WorkbenchBrowserStorageStateRequest = {
  readonly tabId?: string;
  readonly origin?: string;
  readonly profileMode?: WorkbenchBrowserProfileMode;
};

export type WorkbenchBrowserClearSiteDataRequest = {
  readonly origin?: string;
  readonly tabId?: string;
  readonly profileMode?: WorkbenchBrowserProfileMode | "all";
};

export type WorkbenchBrowserClearSiteDataResult = {
  readonly ok: true;
  readonly origin: string;
  readonly profilePartitions: readonly string[];
  readonly cookiesRemoved: number;
  readonly storageCleared: boolean;
  readonly snapshot: BrowserSessionSnapshot | null;
};

export type WorkbenchBrowserPageSpec = {
  readonly tabId: string;
  readonly address: string;
  readonly titleHint?: string;
  readonly isActive: boolean;
  /** Keep webContents alive. Workspace panes and parked agent preview pages set this. */
  readonly isVisible?: boolean;
  readonly restoreState?: WorkbenchBrowserPageRestoreState;
};

export type WorkbenchBrowserWebThemePalette = {
  readonly bgApp: string;
  readonly bgSurface: string;
  readonly bgEditor: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly textAccent: string;
  readonly lineDefault: string;
  readonly lineFocused: string;
  readonly statusSuccess: string;
  readonly statusWarning: string;
  readonly statusError: string;
};

export type WorkbenchBrowserWebThemeSnapshot = {
  /** Master toggle. When false, injector should disable all stages and let pages render natively. */
  readonly enabled: boolean;
  /** Whether resolved Lyra theme is on the dark side of the spectrum. */
  readonly isDark: boolean;
  /** Subset of Lyra theme vars relevant to web page theming. */
  readonly palette: WorkbenchBrowserWebThemePalette;
  /** Monotonic tick that bumps on every snapshot update so downstream can react. */
  readonly revision: number;
};

/** Static dark palette used to color Lyra's own browser chrome popovers. */
export const DEFAULT_WEB_THEME_PALETTE: WorkbenchBrowserWebThemePalette = {
  bgApp: "#1a1b20",
  bgSurface: "#24262d",
  bgEditor: "#1e2026",
  textPrimary: "#e6e7eb",
  textSecondary: "#b7bac3",
  textMuted: "#8b8f9b",
  textAccent: "#7aa7ff",
  lineDefault: "#353842",
  lineFocused: "#7aa7ff",
  statusSuccess: "#87c07a",
  statusWarning: "#dcba7a",
  statusError: "#e47878"
} as const;

/** Default snapshot consumed by the browser chrome popover overlay. */
export const DEFAULT_WEB_THEME_SNAPSHOT: WorkbenchBrowserWebThemeSnapshot = {
  enabled: false,
  isDark: true,
  palette: DEFAULT_WEB_THEME_PALETTE,
  revision: 0
} as const;

export type WorkbenchBrowserTopologySnapshot = {
  readonly activeTabId: string | null;
  readonly pages: readonly WorkbenchBrowserPageSpec[];
};

export type WorkbenchBrowserPageLayout = {
  readonly tabId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly visible: boolean;
  readonly zIndex: number;
  readonly isFocusedPane: boolean;
};

export const WORKBENCH_BROWSER_LAYOUT_COORDINATE_SPACE = "workbench" as const;
export const WORKBENCH_BROWSER_LAYOUT_ORIGIN = "workbenchTopLeft" as const;
export const WORKBENCH_BROWSER_LAYOUT_UNIT = "cssPixel" as const;

export type WorkbenchBrowserLayoutCoordinateSpace =
  typeof WORKBENCH_BROWSER_LAYOUT_COORDINATE_SPACE;

export type WorkbenchBrowserLayoutSnapshot = {
  readonly coordinateSpace: WorkbenchBrowserLayoutCoordinateSpace;
  readonly windowWidth: number;
  readonly windowHeight: number;
  readonly layouts: readonly WorkbenchBrowserPageLayout[];
};

export const EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT: WorkbenchBrowserLayoutSnapshot = {
  coordinateSpace: WORKBENCH_BROWSER_LAYOUT_COORDINATE_SPACE,
  windowWidth: 0,
  windowHeight: 0,
  layouts: []
};

export type WorkbenchBrowserPageLifecycleState =
  | "foreground"
  | "visible"
  | "hot-hidden"
  | "tombstoned"
  | "restoring";

export type WorkbenchBrowserPageRuntimeState = {
  readonly tabId: string;
  readonly address: string;
  readonly title: string;
  readonly faviconUrl?: string;
  readonly lifecycleState?: WorkbenchBrowserPageLifecycleState;
  readonly coreKey?: string;
  readonly stateKey?: string;
  readonly isTombstoned?: boolean;
  readonly restoreReason?: string;
  readonly isActive: boolean;
  readonly isVisible: boolean;
  readonly isLoading: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
  readonly isHtmlFullscreen: boolean;
  readonly restoreState?: WorkbenchBrowserPageRestoreState;
  readonly recoveryFailure?: WorkbenchBrowserRecoveryFailure | undefined;
  readonly updatedAt: number;
};

const browserRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && Array.isArray(value) === false
    ? value as Record<string, unknown>
    : null;

const browserString = (value: unknown): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const browserNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : fallback;
};

const browserSignedNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
};

const browserAvailability = (value: unknown): BrowserStorageAvailability =>
  value === "available" || value === "unavailable" || value === "unknown"
    ? value
    : "unknown";

const browserLoadState = (value: unknown): BrowserPageLoadState | undefined =>
  value === "idle" || value === "loading" || value === "failed"
    ? value
    : undefined;

const browserLifecycleState = (
  value: unknown
): WorkbenchBrowserPageLifecycleState | undefined =>
  value === "foreground" ||
  value === "visible" ||
  value === "hot-hidden" ||
  value === "tombstoned" ||
  value === "restoring"
    ? value
    : undefined;

const browserRecoveryFailureReason = (
  value: unknown
): WorkbenchBrowserRecoveryFailureReason | undefined =>
  value === "profile_missing" ||
  value === "storage_unavailable" ||
  value === "navigation_failed" ||
  value === "target_stale" ||
  value === "renderer_crashed"
    ? value
    : undefined;

const browserProfileMode = (value: unknown): WorkbenchBrowserProfileMode =>
  value === "isolated" ? "isolated" : "live";

const browserSafeUrl = (value: unknown): string | undefined => {
  const text = browserString(value);
  if (text === undefined) {
    return undefined;
  }
  if (text === "about:blank") {
    return text;
  }
  try {
    const parsed = new URL(text);
    if (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "file:"
    ) {
      return parsed.toString();
    }
  } catch (_error) {
    return undefined;
  }
  return undefined;
};

const browserOrigin = (value: unknown): string | undefined => {
  const url = browserSafeUrl(value);
  if (url === undefined) {
    return undefined;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
  } catch (_error) {
    return undefined;
  }
  return undefined;
};

const browserStorageManifest = (value: unknown): BrowserStorageScopeManifest => {
  const record = browserRecord(value);
  const reason = browserString(record?.reason);
  const count = Number.isFinite(Number(record?.count))
    ? browserNumber(record?.count)
    : undefined;
  if (count !== undefined && reason !== undefined) {
    return {
      availability: browserAvailability(record?.availability),
      manifestOnly: true,
      count,
      reason
    };
  }
  if (count !== undefined) {
    return {
      availability: browserAvailability(record?.availability),
      manifestOnly: true,
      count
    };
  }
  if (reason !== undefined) {
    return {
      availability: browserAvailability(record?.availability),
      manifestOnly: true,
      reason
    };
  }
  return {
    availability: browserAvailability(record?.availability),
    manifestOnly: true
  };
};

export const createBrowserStorageStateRef = (
  options: {
    readonly profileMode?: WorkbenchBrowserProfileMode | undefined;
    readonly profilePartition?: string | undefined;
    readonly chromiumStoragePath?: string | null | undefined;
    readonly sites?: readonly BrowserSiteStorageAvailability[] | undefined;
  } = {}
): BrowserStorageStateRef => {
  const profileMode = options.profileMode ?? "live";
  const profilePartition =
    options.profilePartition ??
    (profileMode === "isolated"
      ? WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION
      : WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION);
  const unavailableManifest = {
    availability: "unknown",
    manifestOnly: true
  } as const satisfies BrowserStorageScopeManifest;
  return {
    schemaVersion: WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    profileId: profileMode === "isolated" ? "lyra-browser-isolated" : "lyra-browser-live",
    profileMode,
    profilePartition,
    ...(options.chromiumStoragePath === undefined
      ? {}
      : { chromiumStoragePath: options.chromiumStoragePath }),
    persistence: "chromium-profile",
    cookies: unavailableManifest,
    localStorage: unavailableManifest,
    indexedDB: unavailableManifest,
    sessionStorage: unavailableManifest,
    cacheStorage: unavailableManifest,
    clearPolicy: {
      siteScoped: true,
      supportedOrigins: "http_https",
      clears: [
        "cookies",
        "localStorage",
        "indexedDB",
        "cacheStorage",
        "serviceWorkers",
        "webSQL"
      ],
      sensitiveValues: "metadata_only"
    },
    relationship: {
      livePartition: WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
      isolatedPartition: WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION,
      mode: "shared-live-tabs-isolated-agent",
      migration: "none"
    },
    ...(options.sites === undefined ? {} : { sites: options.sites })
  };
};

export const sanitizeBrowserSiteStorageAvailability = (
  value: unknown
): BrowserSiteStorageAvailability | null => {
  const record = browserRecord(value);
  if (record === null) {
    return null;
  }
  const origin = browserOrigin(record.origin);
  if (origin === undefined) {
    return null;
  }
  return {
    origin,
    cookieCount: browserNumber(record.cookieCount),
    localStorage: browserAvailability(record.localStorage),
    sessionStorage: browserAvailability(record.sessionStorage),
    indexedDB: browserAvailability(record.indexedDB),
    capturedAt: browserNumber(record.capturedAt, Date.now())
  };
};

export const sanitizeBrowserStorageStateRef = (
  value: unknown
): BrowserStorageStateRef => {
  const record = browserRecord(value);
  if (record === null) {
    return createBrowserStorageStateRef();
  }
  const profileMode = browserProfileMode(record.profileMode);
  const profilePartition = browserString(record.profilePartition)
    ?? (profileMode === "isolated"
      ? WORKBENCH_BROWSER_ISOLATED_PROFILE_PARTITION
      : WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION);
  const sites = Array.isArray(record.sites)
    ? record.sites
        .map(sanitizeBrowserSiteStorageAvailability)
        .filter((entry): entry is BrowserSiteStorageAvailability => entry !== null)
    : undefined;
  const chromiumStoragePath =
    record.chromiumStoragePath === null
      ? null
      : browserString(record.chromiumStoragePath);
  const storageOptions: Parameters<typeof createBrowserStorageStateRef>[0] = {
    profileMode,
    profilePartition,
    ...(chromiumStoragePath === undefined ? {} : { chromiumStoragePath }),
    ...(sites === undefined ? {} : { sites })
  };
  const base = createBrowserStorageStateRef(storageOptions);
  return {
    schemaVersion: base.schemaVersion,
    profileId: browserString(record.profileId)
      ?? (profileMode === "isolated" ? "lyra-browser-isolated" : "lyra-browser-live"),
    profileMode: base.profileMode,
    profilePartition: base.profilePartition,
    ...(base.chromiumStoragePath === undefined ? {} : { chromiumStoragePath: base.chromiumStoragePath }),
    persistence: base.persistence,
    cookies: browserStorageManifest(record.cookies),
    localStorage: browserStorageManifest(record.localStorage),
    indexedDB: browserStorageManifest(record.indexedDB),
    sessionStorage: browserStorageManifest(record.sessionStorage),
    cacheStorage: browserStorageManifest(record.cacheStorage),
    clearPolicy: base.clearPolicy,
    relationship: base.relationship,
    ...(base.sites === undefined ? {} : { sites: base.sites })
  };
};

const sanitizeBrowserNavigationHistory = (
  value: unknown
): BrowserNavigationHistory | undefined => {
  const record = browserRecord(value);
  if (record === null || Array.isArray(record.entries) === false) {
    return undefined;
  }
  const entries = record.entries
    .map((item) => {
      const entry = browserRecord(item);
      const url = browserSafeUrl(entry?.url);
      if (entry === null || url === undefined) {
        return null;
      }
      return {
        url,
        title: browserString(entry.title) ?? url,
        ...(browserString(entry.faviconUrl) === undefined
          ? {}
          : { faviconUrl: browserString(entry.faviconUrl) }),
        timestamp: browserNumber(entry.timestamp, Date.now())
      };
    })
    .filter((entry): entry is BrowserNavigationHistoryEntry => entry !== null)
    .slice(-80);
  if (entries.length === 0) {
    return undefined;
  }
  const requestedIndex = browserNumber(record.currentIndex, entries.length - 1);
  return {
    entries,
    currentIndex: Math.max(0, Math.min(entries.length - 1, requestedIndex))
  };
};

const sanitizeBrowserViewportState = (
  value: unknown
): BrowserViewportState | undefined => {
  const record = browserRecord(value);
  if (record === null) {
    return undefined;
  }
  const width = browserNumber(record.width);
  const height = browserNumber(record.height);
  const deviceScaleFactor = Number(record.deviceScaleFactor);
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    width,
    height,
    deviceScaleFactor:
      Number.isFinite(deviceScaleFactor) && deviceScaleFactor > 0
        ? Math.round(deviceScaleFactor * 100) / 100
        : 1
  };
};

const sanitizeBrowserElementBounds = (
  value: unknown
): BrowserElementBounds | undefined => {
  const record = browserRecord(value);
  if (record === null) {
    return undefined;
  }
  const width = browserNumber(record.width);
  const height = browserNumber(record.height);
  if (width <= 0 || height <= 0) {
    return undefined;
  }
  return {
    x: browserSignedNumber(record.x),
    y: browserSignedNumber(record.y),
    width,
    height
  };
};

const sanitizeBrowserActiveElementRef = (
  value: unknown
): BrowserActiveElementRef | undefined => {
  const record = browserRecord(value);
  if (record === null) {
    return undefined;
  }
  const signature = browserString(record.signature);
  const tagName = browserString(record.tagName);
  if (signature === undefined || tagName === undefined) {
    return undefined;
  }
  const targetRef = browserString(record.targetRef);
  const role = browserString(record.role);
  const inputType = browserString(record.inputType);
  const selectorPreview = browserString(record.selectorPreview);
  const cssSelector = browserString(record.cssSelector);
  const frameUrl = browserString(record.frameUrl);
  const textHash = browserString(record.textHash);
  const bounds = sanitizeBrowserElementBounds(record.bounds);
  const activeElement: Mutable<BrowserActiveElementRef> = {
    signature,
    tagName
  };
  if (targetRef !== undefined) activeElement.targetRef = targetRef;
  if (role !== undefined) activeElement.role = role;
  if (inputType !== undefined) activeElement.inputType = inputType;
  if (selectorPreview !== undefined) activeElement.selectorPreview = selectorPreview;
  if (cssSelector !== undefined) activeElement.cssSelector = cssSelector;
  if (frameUrl !== undefined) activeElement.frameUrl = frameUrl;
  if (textHash !== undefined) activeElement.textHash = textHash;
  if (bounds !== undefined) activeElement.bounds = bounds;
  return activeElement;
};

const sanitizeBrowserFormDraftMetadata = (
  value: unknown
): BrowserFormDraftMetadata | undefined => {
  const record = browserRecord(value);
  if (record === null) {
    return undefined;
  }
  const fields = Array.isArray(record.fields)
    ? record.fields
        .map((item) => {
          const field = browserRecord(item);
          const targetRef = browserString(field?.targetRef);
          const tagName = browserString(field?.tagName);
          if (field === null || targetRef === undefined || tagName === undefined) {
            return null;
          }
          return {
            targetRef,
            tagName,
            ...(browserString(field.inputType) === undefined
              ? {}
              : { inputType: browserString(field.inputType) }),
            dirty: field.dirty === true,
            sensitive: field.sensitive === true,
            ...(Number.isFinite(Number(field.valueLength))
              ? { valueLength: browserNumber(field.valueLength) }
              : {})
          };
        })
        .filter((field): field is BrowserFormDraftFieldMetadata => field !== null)
        .slice(0, 80)
    : [];
  return {
    redacted: true,
    fieldCount: Math.max(browserNumber(record.fieldCount), fields.length),
    editedFieldCount: Math.max(
      browserNumber(record.editedFieldCount),
      fields.filter((field) => field.dirty).length
    ),
    passwordFieldCount: browserNumber(record.passwordFieldCount),
    sensitiveFieldCount: Math.max(
      browserNumber(record.sensitiveFieldCount),
      fields.filter((field) => field.sensitive).length
    ),
    fields
  };
};

const sanitizeBrowserTargetRegistryManifest = (
  value: unknown
): BrowserTargetRegistryManifest | undefined => {
  const record = browserRecord(value);
  if (record === null) {
    return undefined;
  }
  const activeTargetRef = browserString(record.activeTargetRef);
  const targetRegistry: Mutable<BrowserTargetRegistryManifest> = {
    warmed: record.warmed === true,
    capturedAt: browserNumber(record.capturedAt, Date.now())
  };
  if (Number.isFinite(Number(record.targetCount))) {
    targetRegistry.targetCount = browserNumber(record.targetCount);
  }
  if (activeTargetRef !== undefined) {
    targetRegistry.activeTargetRef = activeTargetRef;
  }
  return targetRegistry;
};

export const sanitizeBrowserPageRestoreState = (
  value: unknown
): WorkbenchBrowserPageRestoreState | undefined => {
  const record = browserRecord(value);
  if (record === null) {
    return undefined;
  }
  const capturedAt = browserNumber(record.capturedAt);
  if (capturedAt <= 0) {
    return undefined;
  }
  const viewport = sanitizeBrowserViewportState(record.viewport);
  const history = sanitizeBrowserNavigationHistory(record.history);
  const loadState = browserLoadState(record.loadState);
  const activeElement = sanitizeBrowserActiveElementRef(record.activeElement);
  const formDraft = sanitizeBrowserFormDraftMetadata(record.formDraft);
  const targetRegistry = sanitizeBrowserTargetRegistryManifest(record.targetRegistry);
  const storage = sanitizeBrowserSiteStorageAvailability(record.storage);
  const textHash = browserString(record.textHash);
  const restoreState: Mutable<WorkbenchBrowserPageRestoreState> = { capturedAt };
  if (Number.isFinite(Number(record.scrollX))) {
    restoreState.scrollX = browserNumber(record.scrollX);
  }
  if (Number.isFinite(Number(record.scrollY))) {
    restoreState.scrollY = browserNumber(record.scrollY);
  }
  if (viewport !== undefined) restoreState.viewport = viewport;
  if (history !== undefined) restoreState.history = history;
  if (loadState !== undefined) restoreState.loadState = loadState;
  if (activeElement !== undefined) restoreState.activeElement = activeElement;
  if (formDraft !== undefined) restoreState.formDraft = formDraft;
  if (targetRegistry !== undefined) restoreState.targetRegistry = targetRegistry;
  if (storage !== null) restoreState.storage = storage;
  if (textHash !== undefined) restoreState.textHash = textHash;
  return restoreState;
};

const sanitizeBrowserRecoveryFailure = (
  value: unknown
): WorkbenchBrowserRecoveryFailure | undefined => {
  const record = browserRecord(value);
  const reason = browserRecoveryFailureReason(record?.reason);
  const message = browserString(record?.message);
  if (record === null || reason === undefined || message === undefined) {
    return undefined;
  }
  return {
    reason,
    message,
    at: browserNumber(record.at, Date.now())
  };
};

const sanitizeBrowserRecoveryAnchor = (
  value: unknown
): BrowserRecoveryAnchor | undefined => {
  const record = browserRecord(value);
  const tabId = browserString(record?.tabId);
  const address = browserSafeUrl(record?.address);
  const title = browserString(record?.title);
  const storageRecord = browserRecord(record?.storageStateRef);
  const authState = record?.authState;
  if (
    record === null ||
    tabId === undefined ||
    address === undefined ||
    title === undefined ||
    storageRecord === null
  ) {
    return undefined;
  }
  const profilePartition =
    browserString(storageRecord.profilePartition) ??
    WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION;
  const sanitizedAuthState =
    authState === "logged_in" ||
    authState === "possibly_logged_in" ||
    authState === "requires_user" ||
    authState === "unknown"
      ? authState
      : "unknown";
  const targetRef = browserString(record.targetRef);
  const textHash = browserString(record.textHash);
  const visualArtifactRef = browserString(record.visualArtifactRef);
  const siteOrigin = browserOrigin(storageRecord.siteOrigin);
  const storageStateRef: Mutable<BrowserRecoveryAnchor["storageStateRef"]> = {
    profilePartition
  };
  if (siteOrigin !== undefined) {
    storageStateRef.siteOrigin = siteOrigin;
  }
  return {
    schemaVersion: WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    tabId,
    address,
    title,
    ...(targetRef === undefined ? {} : { targetRef }),
    ...(textHash === undefined ? {} : { textHash }),
    ...(visualArtifactRef === undefined ? {} : { visualArtifactRef }),
    storageStateRef,
    authState: sanitizedAuthState,
    capturedAt: browserNumber(record.capturedAt, Date.now())
  };
};

const sanitizeBrowserSessionTabSnapshot = (
  value: unknown
): BrowserSessionTabSnapshot | null => {
  const record = browserRecord(value);
  const tabId = browserString(record?.tabId);
  const address = browserSafeUrl(record?.address);
  const title = browserString(record?.title);
  const restoreState = sanitizeBrowserPageRestoreState(record?.restoreState);
  if (
    record === null ||
    tabId === undefined ||
    address === undefined ||
    title === undefined ||
    restoreState === undefined
  ) {
    return null;
  }
  const faviconUrl = browserString(record.faviconUrl);
  const lifecycleState = browserLifecycleState(record.lifecycleState);
  const recoveryFailure = sanitizeBrowserRecoveryFailure(record.recoveryFailure);
  const tabSnapshot: Mutable<BrowserSessionTabSnapshot> = {
    tabId,
    address,
    title,
    isActive: record.isActive === true,
    canGoBack: record.canGoBack === true,
    canGoForward: record.canGoForward === true,
    profilePartition:
      browserString(record.profilePartition) ?? WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
    restoreState
  };
  if (faviconUrl !== undefined) tabSnapshot.faviconUrl = faviconUrl;
  if (lifecycleState !== undefined) tabSnapshot.lifecycleState = lifecycleState;
  if (recoveryFailure !== undefined) tabSnapshot.recoveryFailure = recoveryFailure;
  return tabSnapshot;
};

export const sanitizeBrowserSessionSnapshot = (
  value: unknown
): BrowserSessionSnapshot | null => {
  const record = browserRecord(value);
  if (record === null || Array.isArray(record.tabs) === false) {
    return null;
  }
  const rawVersion = Number(record.schemaVersion ?? 0);
  const migratedFromVersion =
    rawVersion === WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION
      ? null
      : Number.isFinite(rawVersion)
        ? Math.max(0, Math.round(rawVersion))
        : 0;
  const tabs = record.tabs
    .map(sanitizeBrowserSessionTabSnapshot)
    .filter((tab): tab is BrowserSessionTabSnapshot => tab !== null);
  if (tabs.length === 0) {
    return null;
  }
  const activeTabId = browserString(record.activeTabId);
  const safeActiveTabId =
    activeTabId !== undefined && tabs.some((tab) => tab.tabId === activeTabId)
      ? activeTabId
      : tabs.find((tab) => tab.isActive)?.tabId ?? tabs[0]?.tabId ?? null;
  const layoutRecord = browserRecord(record.layout);
  const layout: WorkbenchBrowserLayoutSnapshot = {
    coordinateSpace: WORKBENCH_BROWSER_LAYOUT_COORDINATE_SPACE,
    windowWidth: browserNumber(layoutRecord?.windowWidth),
    windowHeight: browserNumber(layoutRecord?.windowHeight),
    layouts: Array.isArray(layoutRecord?.layouts)
      ? layoutRecord.layouts
          .map((item) => {
            const entry = browserRecord(item);
            const tabId = browserString(entry?.tabId);
            if (entry === null || tabId === undefined) {
              return null;
            }
            return {
              tabId,
              x: browserSignedNumber(entry.x),
              y: browserSignedNumber(entry.y),
              width: browserNumber(entry.width),
              height: browserNumber(entry.height),
              visible: entry.visible === true,
              zIndex: browserSignedNumber(entry.zIndex),
              isFocusedPane: entry.isFocusedPane === true
            };
          })
          .filter((entry): entry is WorkbenchBrowserPageLayout => entry !== null)
      : []
  };
  const explicitMigrations = Array.isArray(record.migrations)
    ? record.migrations
        .map((item) => {
          const migration = browserRecord(item);
          if (migration === null) {
            return null;
          }
          return {
            fromVersion: browserNumber(migration.fromVersion),
            toVersion: browserNumber(migration.toVersion),
            migratedAt: browserNumber(migration.migratedAt, Date.now())
          };
        })
        .filter((entry): entry is BrowserSessionSnapshot["migrations"][number] => entry !== null)
    : [];
  const migrations =
    migratedFromVersion === null
      ? explicitMigrations
      : [
          ...explicitMigrations,
          {
            fromVersion: migratedFromVersion,
            toVersion: WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
            migratedAt: Date.now()
          }
        ];
  const recoveryAnchor = sanitizeBrowserRecoveryAnchor(record.recoveryAnchor);
  const snapshot: Mutable<BrowserSessionSnapshot> = {
    schemaVersion: WORKBENCH_BROWSER_SESSION_SNAPSHOT_SCHEMA_VERSION,
    snapshotId: browserString(record.snapshotId) ?? `browser-session-${Date.now()}`,
    capturedAt: browserNumber(record.capturedAt, Date.now()),
    activeTabId: safeActiveTabId,
    layout,
    tabs,
    storageState: sanitizeBrowserStorageStateRef(record.storageState),
    migrations
  };
  if (recoveryAnchor !== undefined) {
    snapshot.recoveryAnchor = recoveryAnchor;
  }
  return snapshot;
};

export const browserPageRestoreStateEquals = (
  first: WorkbenchBrowserPageRestoreState | undefined,
  second: WorkbenchBrowserPageRestoreState | undefined
): boolean => JSON.stringify(first ?? null) === JSON.stringify(second ?? null);

export type WorkbenchBrowserElementPickerDisableCause =
  | "user_toggle"
  | "escape"
  | "tab_switched"
  | "page_navigated"
  | "page_closed"
  | "script_error";

export type WorkbenchBrowserElementPickerOwner = "manual";

export type WorkbenchBrowserElementPickerPhase = "idle";

export type WorkbenchBrowserElementPickerMode = "inspect" | "layout";

export type WorkbenchBrowserElementPickerState = {
  readonly tabId: string;
  readonly enabled: boolean;
  readonly mode?: WorkbenchBrowserElementPickerMode;
  readonly owner?: WorkbenchBrowserElementPickerOwner;
  readonly phase?: WorkbenchBrowserElementPickerPhase;
  readonly cause?: WorkbenchBrowserElementPickerDisableCause;
  readonly errorCode?: "tab_not_found" | "script_injection_failed" | "frame_unavailable";
};

export type WorkbenchBrowserElementPickerAppearance = {
  readonly fontFamily: string;
  readonly surfaceBackground: string;
  readonly surfaceBorder: string;
  readonly surfaceShadow: string;
  readonly surfaceBackdropFilter: string;
  readonly accentColor: string;
  readonly accentFill: string;
  readonly tagBackground: string;
  readonly tagText: string;
  readonly textPrimary: string;
  readonly textSecondary: string;
  readonly textMuted: string;
  readonly frameRadius: string;
  readonly bubbleRadius: string;
  readonly strokeWidth: string;
};

export type WorkbenchBrowserHoveredElementInfo = {
  readonly tabId: string;
  readonly frameTreeNodeId: number;
  readonly tagName: string;
  readonly role?: string;
  readonly inputType?: string;
  readonly ariaLabel?: string;
  readonly placeholder?: string;
  readonly textSnippet?: string;
  readonly selectorPreview: string;
  readonly bounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly widgetId?: string;
  readonly widgetKind?: string;
  readonly widgetLabel?: string;
  readonly affordanceLabel?: string;
  readonly affordanceAction?: string;
  readonly cursorStyle?: string;
  readonly tooltipText?: string;
  readonly stateHint?: string;
  readonly containerBounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly frameUrl?: string;
  readonly crossOriginBoundary?: boolean;
};

export type WorkbenchLumenActivityAction =
  | "observe"
  | "read"
  | "capture"
  | "wait"
  | "navigate"
  | "focus"
  | "scroll"
  | "act"
  | "type"
  | "press"
  | "submit"
  | "reveal"
  | "elevate"
  | "handoff";

export type WorkbenchLumenActivityInteraction =
  | "click"
  | "doubleClick"
  | "rightClick"
  | "hover"
  | "select";

export type WorkbenchLumenActivityCursorPhase =
  | "move"
  | "down"
  | "up"
  | "idle";

export type WorkbenchBrowserSharedControlState =
  | "idle"
  | "agent_active"
  | "locked_input"
  | "user_interrupted"
  | "awaiting_user_decision"
  | "resuming";

export type WorkbenchBrowserSharedControlInputType =
  | "mouse_move"
  | "mouse_down"
  | "wheel"
  | "keyboard";

export type WorkbenchBrowserAuthChallengeKind =
  | "captcha"
  | "mfa"
  | "oauth_popup"
  | "permission_prompt"
  | "dormant_file_input"
  | "active_file_chooser"
  | "login_wall"
  | "download_prompt"
  | "payment_auth";

export type WorkbenchBrowserAuthChallengeSignal = {
  readonly kind: WorkbenchBrowserAuthChallengeKind;
  readonly confidence: "high" | "medium" | "low";
  readonly source: "dom" | "attribute" | "frame" | "browser" | "diagnostic" | "ax";
  readonly scope?: "main_document" | "subresource" | "frame";
  readonly resourceType?: string;
  readonly actionability?: "informational" | "automatic" | "user_only";
  readonly reasonCode?: string;
  readonly stableObservationCount?: number;
  readonly label?: string;
  readonly provider?: string;
  readonly url?: string;
  readonly frameRef?: string;
  readonly frameTreeNodeId?: number;
  readonly bounds?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
};

export type WorkbenchLumenActivityEvent = {
  readonly kind: "lumen-browser-activity";
  readonly source: "lyra_lumen";
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly action: WorkbenchLumenActivityAction;
  readonly interaction?: WorkbenchLumenActivityInteraction;
  readonly inputActive: boolean;
  readonly visibleFollow?: boolean;
  readonly durationMs: number;
  readonly sessionId: string;
  readonly actionId: string;
  readonly cursorPhase?: WorkbenchLumenActivityCursorPhase;
  readonly cursor?: {
    readonly x: number;
    readonly y: number;
  };
  readonly sharedControlState?: WorkbenchBrowserSharedControlState;
  readonly criticalInput?: boolean;
  readonly redacted?: boolean;
};

export type WorkbenchLumenTargetKind =
  | "element"
  | "button"
  | "link"
  | "input"
  | "frame"
  | "visual";

export type WorkbenchLumenTargetStaleReason =
  | "expired"
  | "navigation"
  | "frameReload"
  | "mapEpochReplaced"
  | "observationLocalId"
  | "notFound"
  | "invalidRef";

export type WorkbenchLumenTargetRef = {
  readonly targetRef: string;
  readonly targetKind: WorkbenchLumenTargetKind;
  readonly tabId: string;
  readonly frameRef: string;
  readonly frameChain: readonly string[];
  readonly elementFingerprint: string;
  readonly mapEpoch: number;
  readonly expiresAt: number;
  readonly staleReason?: WorkbenchLumenTargetStaleReason;
};

export type WorkbenchLumenTargetCandidate = {
  readonly targetRef: string;
  readonly targetKind: WorkbenchLumenTargetKind;
  readonly label: string;
  readonly role: string;
  readonly frameRef: string;
  readonly confidence: number;
  readonly reason: string;
};

export type WorkbenchLumenStaleTarget = {
  readonly reason: WorkbenchLumenTargetStaleReason;
  readonly lastSeenAt: number | null;
  readonly recommendedAction: "lyra_lumen.map" | "lyra_lumen_explain_target";
  readonly nearestCandidates: readonly WorkbenchLumenTargetCandidate[];
};

export type WorkbenchLumenTargetExplanation = {
  readonly ok: true;
  readonly kind: "lyraLumenTargetExplanation";
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly targetRef: string;
  readonly available: boolean;
  readonly target?: WorkbenchLumenTargetRef;
  readonly lastSeenAt: number | null;
  readonly staleTarget?: WorkbenchLumenStaleTarget;
  readonly recommendedAction: "lyra_lumen.act" | "lyra_lumen.map";
};

export type WorkbenchLumenFollowSessionStatus =
  | "running"
  | "completed"
  | "cancelled"
  | "failed"
  | "interrupted";

export type WorkbenchLumenFollowAction = {
  readonly id: string;
  readonly at: number;
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly action: WorkbenchLumenActivityAction;
  readonly interaction?: WorkbenchLumenActivityInteraction;
  readonly cursorPhase?: WorkbenchLumenActivityCursorPhase;
  readonly inputActive: boolean;
  readonly cursor?: {
    readonly x: number;
    readonly y: number;
  };
  readonly result?: "success" | "failure" | "interrupted";
  readonly summary: string;
  readonly sharedControlState?: WorkbenchBrowserSharedControlState;
  readonly criticalInput?: boolean;
  readonly redacted?: boolean;
};

export type WorkbenchLumenFollowFrame = {
  readonly id: string;
  readonly at: number;
  readonly actionId: string;
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly cursor?: {
    readonly x: number;
    readonly y: number;
  };
  readonly cursorPhase?: WorkbenchLumenActivityCursorPhase;
  readonly event: "cursor" | "input" | "wait" | "navigation" | "interrupt";
};

export type WorkbenchLumenFollowAudit = {
  readonly ok: true;
  readonly kind: "lyraLumenFollowAudit";
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly sessionId: string | null;
  readonly turnId: string | null;
  readonly startedAt: number | null;
  readonly endedAt: number | null;
  readonly updatedAt: number | null;
  readonly status: WorkbenchLumenFollowSessionStatus | null;
  readonly reason: string | null;
  readonly totalActions: number;
  readonly actions: readonly WorkbenchLumenFollowAction[];
  readonly frames?: readonly WorkbenchLumenFollowFrame[];
  readonly finalPageState: {
    readonly address: string;
    readonly title: string;
    readonly isLoading: boolean;
  } | null;
  readonly compactSummary: {
    readonly observeCount: number;
    readonly readCount: number;
    readonly captureCount: number;
    readonly waitCount: number;
    readonly navigationCount: number;
    readonly focusCount: number;
    readonly pointerCount: number;
    readonly typeCount: number;
    readonly keyCount: number;
    readonly revealCount: number;
    readonly elevateCount: number;
    readonly interruptedCount: number;
  };
  readonly compactText: string;
  readonly chunks: readonly {
    readonly index: number;
    readonly actionStart: number;
    readonly actionEnd: number;
    readonly summary: string;
  }[];
};

export type WorkbenchBrowserPageDiagnosticSeverity =
  | "info"
  | "warning"
  | "error";

export type WorkbenchBrowserPageDiagnosticEntry = {
  readonly id: string;
  readonly at: number;
  readonly source:
    | "console"
    | "network"
    | "navigation"
    | "runtime"
    | "log"
    | "performance"
    | "page";
  readonly severity: WorkbenchBrowserPageDiagnosticSeverity;
  readonly message: string;
  readonly timestamp?: string;
  readonly stack?: string;
  readonly stackTruncated?: boolean;
  readonly stackFrameCount?: number;
  readonly url?: string;
  readonly line?: number;
  readonly column?: number;
  readonly requestId?: string;
  readonly method?: string;
  readonly domain?: string;
  readonly path?: string;
  readonly status?: number;
  readonly statusText?: string;
  readonly failureKind?:
    | "http"
    | "cors"
    | "blockedByClient"
    | "blocked"
    | "mixedContent"
    | "dns"
    | "tls"
    | "network"
    | "failed";
  readonly errorText?: string;
  readonly blockedReason?: string;
  readonly requestHeaders?: Readonly<Record<string, string>>;
  readonly responseHeaders?: Readonly<Record<string, string>>;
  readonly responseBody?: string;
  readonly responseBodyBase64Encoded?: boolean;
  readonly responseBodyTruncated?: boolean;
  readonly mimeType?: string;
  readonly resourceType?: string;
  readonly durationMs?: number;
  readonly evidenceRef?: string;
};

export type WorkbenchBrowserPageDiagnosticsResult = {
  readonly ok: true;
  readonly kind: "lyraLumenPageDiagnostics";
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly address: string;
  readonly title: string;
  readonly available?: boolean;
  readonly unavailableReason?: string;
  readonly entries: readonly WorkbenchBrowserPageDiagnosticEntry[];
  readonly diagnostics?: readonly WorkbenchBrowserPageDiagnosticEntry[];
  readonly evidenceRefs?: readonly string[];
  readonly recommendedNextAction?: string;
  readonly summary: {
    readonly errors: number;
    readonly warnings: number;
    readonly networkFailures: number;
    readonly consoleErrors: number;
    readonly runtimeExceptions?: number;
    readonly httpFailures?: number;
    readonly corsFailures?: number;
    readonly blockedRequests?: number;
    readonly pageEvents?: number;
  };
};

export type WorkbenchBrowserSharedControlEvent = {
  readonly kind: "browser-shared-control-interrupted";
  readonly tabId: string;
  readonly targetMode: "live";
  readonly sessionId: string;
  readonly inputType: WorkbenchBrowserSharedControlInputType;
  readonly at: number;
  readonly action?: WorkbenchLumenActivityAction;
  readonly interaction?: WorkbenchLumenActivityInteraction;
  readonly followActionId?: string;
  readonly criticalInput: boolean;
  readonly physicalInputPrevented: boolean;
  readonly sharedControlState: Extract<
    WorkbenchBrowserSharedControlState,
    "user_interrupted" | "awaiting_user_decision"
  >;
  readonly browserRecoveryAnchor?: {
    readonly tabId: string;
    readonly targetMode: "live";
    readonly followActionId?: string;
  };
};

export type WorkbenchBrowserSharedControlStateEvent = {
  readonly kind: "browser-shared-control-state";
  readonly tabId: string;
  readonly targetMode: "live";
  readonly sessionId: string;
  readonly state: WorkbenchBrowserSharedControlState;
  readonly previousState: WorkbenchBrowserSharedControlState;
  readonly at: number;
  readonly action?: WorkbenchLumenActivityAction;
  readonly interaction?: WorkbenchLumenActivityInteraction;
  readonly criticalInput: boolean;
  readonly reason: "agent_action" | "user_input" | "awaiting_decision" | "decision" | "timer";
};

export type WorkbenchBrowserElevationSession = {
  readonly sessionId: string;
  readonly isolatedTarget: {
    readonly tabId: string;
    readonly address: string;
    readonly title: string;
  };
  readonly liveTabId: string;
  readonly storageRelation: "shared_default_session" | "foreground_clone";
  readonly startedAt: number;
  readonly updatedAt: number;
  readonly status: "opening_live" | "awaiting_user" | "verifying" | "completed" | "failed" | "cancelled";
  readonly cloneStrategy: "storage_preserving_foreground_clone";
  readonly differences: readonly string[];
  readonly reason?: string;
};

export type WorkbenchBrowserAgentElevationResult = {
  readonly ok: boolean;
  readonly kind: "lyraLumenElevation";
  readonly tabId: string;
  readonly targetMode: "isolated" | "live";
  readonly liveTabId?: string;
  readonly address: string;
  readonly title: string;
  readonly userActionRequired: boolean;
  readonly message: string;
  readonly elevationSession?: WorkbenchBrowserElevationSession;
};

export type WorkbenchBrowserAgentElevationCompletionResult = {
  readonly ok: boolean;
  readonly kind: "lyraLumenElevationCompletion";
  readonly tabId: string;
  readonly targetMode: "isolated";
  readonly liveTabId: string;
  readonly address: string;
  readonly title: string;
  readonly verified: boolean;
  readonly authChallengeSignals?: readonly WorkbenchBrowserAuthChallengeSignal[];
  readonly elevationSession?: WorkbenchBrowserElevationSession;
  readonly message: string;
};

export type WorkbenchBrowserAgentActivityAction = WorkbenchLumenActivityAction;

export type WorkbenchLegacyBrowserAgentActivityEvent =
  Omit<WorkbenchLumenActivityEvent, "kind" | "source"> & {
    readonly kind: "agent-browser-activity";
    readonly source?: "lyra_lumen";
  };

export type WorkbenchBrowserAgentActivityEvent =
  | WorkbenchLumenActivityEvent
  | WorkbenchLegacyBrowserAgentActivityEvent;

export type WorkbenchBrowserPageContextMediaType =
  | "none"
  | "image"
  | "video"
  | "audio"
  | "canvas"
  | "file"
  | "plugin"
  | "link";

export const PAGE_DRAG_CITATION_MIME = "application/x-lyra-page-citation-drag";
export const PAGE_DRAG_CITATION_PLAIN_PREFIX = "⟦lyra-page-drag:";
export const PAGE_DRAG_CITATION_PLAIN_SUFFIX = "⟧";

export type PageDragCitationPayload = {
  readonly tabId: string;
  readonly pageUrl: string;
  readonly pageTitle: string;
  readonly frameUrl?: string;
  readonly selectionText?: string;
  readonly linkUrl?: string;
  readonly linkText?: string;
  readonly srcUrl?: string;
  readonly mediaType?: WorkbenchBrowserPageContextMediaType;
  readonly elementTag?: string;
  readonly elementSelector?: string;
  readonly elementId?: string;
  readonly elementRole?: string;
  readonly elementAriaLabel?: string;
};

export type WorkbenchBrowserPageContextMenuPayload = {
  readonly tabId: string;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly pageUrl: string;
  readonly pageTitle: string;
  readonly selectionText?: string;
  readonly linkUrl?: string;
  readonly linkText?: string;
  readonly srcUrl?: string;
  readonly frameUrl?: string;
  readonly mediaType: WorkbenchBrowserPageContextMediaType;
  readonly elementTag?: string;
  readonly elementSelector?: string;
  readonly elementId?: string;
  readonly elementRole?: string;
  readonly elementAriaLabel?: string;
  readonly visibleText?: string;
  readonly isEditable: boolean;
  readonly canGoBack: boolean;
  readonly canGoForward: boolean;
};

export type WorkbenchBrowserPageContextAction =
  | "back"
  | "forward"
  | "reload"
  | "copy"
  | "cut"
  | "paste"
  | "copyLink"
  | "openLinkInNewTab";

export type WorkbenchBrowserExecutePageContextActionRequest = {
  readonly tabId: string;
  readonly action: WorkbenchBrowserPageContextAction;
  readonly linkUrl?: string;
};

export type WorkbenchBrowserEvent =
  | {
      readonly kind: "page-context-menu";
      readonly menu: WorkbenchBrowserPageContextMenuPayload;
    }
  | {
      readonly kind: "page-context-menu-select";
      readonly tabId: string;
      readonly itemId: string;
      readonly menu: WorkbenchBrowserPageContextMenuPayload;
      readonly tabTitle?: string;
    }
  | {
      readonly kind: "page-drag-citation-active";
      readonly payload: PageDragCitationPayload;
    }
  | {
      readonly kind: "page-drag-citation-clear";
    }
  | {
      readonly kind: "page-runtime-state";
      readonly page: WorkbenchBrowserPageRuntimeState;
    }
  | {
      readonly kind: "page-closed";
      readonly tabId: string;
    }
  | {
      readonly kind: "request-open-tab";
      readonly address: string;
      readonly title?: string;
      readonly tabId?: string;
      readonly embedded?: boolean;
    }
  | {
      readonly kind: "element-picker-state";
      readonly state: WorkbenchBrowserElementPickerState;
    }
  | {
      readonly kind: "element-picker-hover";
      readonly hover: WorkbenchBrowserHoveredElementInfo;
    }
  | {
      readonly kind: "element-picker-select";
      readonly menu: WorkbenchBrowserPageContextMenuPayload;
      readonly tabTitle?: string;
    }
  | {
      readonly kind: "chrome-popover-state";
      readonly tabId: string;
      readonly popoverKind: "find" | "omnibox";
      readonly visible: boolean;
    }
  | {
      readonly kind: "request-activate-tab";
      readonly tabId: string;
    }
  | {
      readonly kind: "request-page-find";
      readonly tabId: string;
    }
  | {
      readonly kind: "request-page-find-match-select";
      readonly tabId: string;
      readonly index: number;
    }
  | {
      readonly kind: "request-omnibox-suggestion-select";
      readonly tabId: string;
      readonly index: number;
    }
  | WorkbenchBrowserSharedControlStateEvent
  | WorkbenchBrowserSharedControlEvent
  | WorkbenchLumenActivityEvent
  | WorkbenchLegacyBrowserAgentActivityEvent;
