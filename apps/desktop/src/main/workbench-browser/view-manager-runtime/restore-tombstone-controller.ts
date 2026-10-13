import type {
  BrowserSiteStorageAvailability,
  WorkbenchBrowserPageRuntimeState,
  WorkbenchBrowserPageSpec,
  WorkbenchBrowserRecoveryFailure
} from "../../../shared/desktop-bridge";
import { sanitizeBrowserPageRestoreState } from "../../../shared/workbench-browser";
import type { WorkbenchBrowserAgentTargetMode } from "../types";
import {
  HIDDEN_PAGE_TOMBSTONE_DELAY_MS,
  HIDDEN_PAGE_TOMBSTONE_RETRY_MS,
  HIDDEN_PAGE_TOMBSTONE_SAFETY_RETRY_LIMIT,
  MAX_HOT_HIDDEN_LIVE_PAGES,
  hashStableString,
  normalizeAddress,
  resolveBrowserCoreKey
} from "./normalizers";
import type { BrowserPageEntry, BrowserPageTombstone } from "./types";

type BrowserRestoreState = NonNullable<WorkbenchBrowserPageRuntimeState["restoreState"]>;

type RestoreTombstoneControllerHost = {
  readonly entries: Map<string, BrowserPageEntry>;
  readonly readPageStorageAvailability: (
    entry: BrowserPageEntry
  ) => Promise<BrowserSiteStorageAvailability | undefined>;
  readonly navigationHistorySnapshot: (
    entry: BrowserPageEntry
  ) => BrowserRestoreState["history"] | undefined;
  readonly updateRuntimeState: (
    entry: BrowserPageEntry,
    patch: Partial<WorkbenchBrowserPageRuntimeState>
  ) => void;
  readonly publishRuntimeState: (runtime: WorkbenchBrowserPageRuntimeState) => void;
  readonly scheduleBrowserSessionSnapshotWrite: (delayMs?: number) => void;
  readonly hasActiveLiveAgentBrowserTask: (tabId: string) => boolean;
  readonly hasActiveDebuggerClients: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ) => boolean;
  readonly disposeCdpAuditSession: (
    tabId: string,
    targetMode: WorkbenchBrowserAgentTargetMode
  ) => void;
  readonly destroyEntry: (entry: BrowserPageEntry, emitClosedEvent: boolean) => void;
  readonly deleteEntry: (tabId: string) => void;
  readonly scheduleBrowserTargetRegistryWarmup: (
    entry: BrowserPageEntry,
    restoreState: BrowserRestoreState
  ) => void;
};

export const createRestoreTombstoneController = ({
  entries,
  readPageStorageAvailability,
  navigationHistorySnapshot,
  updateRuntimeState,
  publishRuntimeState,
  scheduleBrowserSessionSnapshotWrite,
  hasActiveLiveAgentBrowserTask,
  hasActiveDebuggerClients,
  disposeCdpAuditSession,
  destroyEntry,
  deleteEntry,
  scheduleBrowserTargetRegistryWarmup
}: RestoreTombstoneControllerHost) => {
  const tombstones = new Map<string, BrowserPageTombstone>();
  const browserSessionSnapshots = new Map<string, BrowserRestoreState>();
  const pendingRestoreValidations = new Map<string, BrowserRestoreState>();
  const tombstoneTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const tombstoneRetryCounts = new Map<string, number>();

  const rememberBrowserRestoreState = (
    tabId: string,
    restoreState: BrowserRestoreState
  ): void => {
    browserSessionSnapshots.set(tabId, restoreState);
  };

  const captureBrowserRestoreState = async (
    entry: BrowserPageEntry
  ): Promise<WorkbenchBrowserPageRuntimeState["restoreState"] | undefined> => {
    if (entry.isDestroyed || entry.webContents.isDestroyed()) {
      return entry.runtime.restoreState;
    }
    try {
      const pageState = await entry.webContents.executeJavaScript(`
        (() => {
          const hashStableString = (value) => {
            let hash = 2166136261;
            for (let index = 0; index < value.length; index += 1) {
              hash ^= value.charCodeAt(index);
              hash = Math.imul(hash, 16777619);
            }
            return (hash >>> 0).toString(36);
          };
          const normalizeText = (value, maxLength = 160) => {
            if (typeof value !== "string") return "";
            const normalized = value.replace(/\\s+/g, " ").trim();
            return normalized.length <= maxLength
              ? normalized
              : normalized.slice(0, maxLength - 3) + "...";
          };
          const cssEscape = (value) => {
            if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
              return CSS.escape(value);
            }
            return String(value).replace(/[^A-Za-z0-9_-]/g, "\\\\$&");
          };
          const selectorPreview = (element) => {
            const tagName = String(element.tagName || "div").toLowerCase();
            const parts = [tagName];
            if (element.id) parts.push("#" + cssEscape(element.id));
            const name = normalizeText(element.getAttribute?.("name") || "", 40);
            if (name) parts.push("[name=" + JSON.stringify(name) + "]");
            const type = normalizeText(element.getAttribute?.("type") || "", 24);
            if (type) parts.push("[type=" + JSON.stringify(type) + "]");
            return parts.join("");
          };
          const activeElementSnapshot = () => {
            const element = document.activeElement;
            if (!(element instanceof Element) || element === document.body || element === document.documentElement) {
              return null;
            }
            const rect = element.getBoundingClientRect();
            const selector = selectorPreview(element);
            const role = normalizeText(element.getAttribute?.("role") || "", 40);
            const inputType = element instanceof HTMLInputElement ? normalizeText(element.type || "", 32) : "";
            const label = normalizeText(
              element.getAttribute?.("aria-label")
              || element.getAttribute?.("placeholder")
              || element.getAttribute?.("title")
              || element.textContent
              || "",
              160
            );
            const signature = [
              window.location.href,
              String(element.tagName || "").toLowerCase(),
              role,
              inputType,
              selector,
              hashStableString(label),
              Math.round(rect.left / 8),
              Math.round(rect.top / 8),
              Math.round(rect.width / 8),
              Math.round(rect.height / 8)
            ].join("|");
            const targetRef = "lumen:" + hashStableString(signature);
            return {
              targetRef,
              signature,
              tagName: String(element.tagName || "element").toLowerCase(),
              role: role || undefined,
              inputType: inputType || undefined,
              selectorPreview: selector,
              cssSelector: selector,
              frameUrl: window.location.href,
              textHash: label ? hashStableString(label) : undefined,
              bounds: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            };
          };
          const formDraftMetadata = () => {
            const fields = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
            const mapped = fields.map((field) => {
              const tagName = String(field.tagName || "field").toLowerCase();
              const input = field instanceof HTMLInputElement ? field : null;
              const textarea = field instanceof HTMLTextAreaElement ? field : null;
              const select = field instanceof HTMLSelectElement ? field : null;
              const inputType = input ? String(input.type || "text").toLowerCase() : undefined;
              const autocompleteTokens = String(field.getAttribute?.("autocomplete") || "")
                .toLowerCase()
                .split(/\\s+/)
                .filter(Boolean);
              const name = String(field.getAttribute?.("name") || field.id || "");
              const sensitive = inputType === "password"
                || autocompleteTokens.includes("current-password")
                || autocompleteTokens.includes("new-password")
                || autocompleteTokens.some((token) => token.startsWith("cc-"))
                || autocompleteTokens.includes("one-time-code");
              const value = input
                ? input.value
                : textarea
                  ? textarea.value
                  : select
                    ? Array.from(select.selectedOptions).map((option) => option.value).join(",")
                    : field.textContent || "";
              const defaultValue = input
                ? input.defaultValue
                : textarea
                  ? textarea.defaultValue
                  : select
                    ? Array.from(select.options).filter((option) => option.defaultSelected).map((option) => option.value).join(",")
                    : "";
              const dirty = inputType === "checkbox" || inputType === "radio"
                ? Boolean(input?.checked !== input?.defaultChecked)
                : value !== defaultValue;
              const refSeed = [window.location.href, tagName, inputType || "", name, selectorPreview(field)].join("|");
              return {
                targetRef: "field:" + hashStableString(refSeed),
                tagName,
                inputType,
                dirty,
                sensitive,
                valueLength: sensitive ? undefined : String(value || "").length
              };
            });
            return {
              redacted: true,
              fieldCount: fields.length,
              editedFieldCount: mapped.filter((field) => field.dirty).length,
              passwordFieldCount: mapped.filter((field) => field.inputType === "password").length,
              sensitiveFieldCount: mapped.filter((field) => field.sensitive).length,
              fields: mapped.filter((field) => field.dirty || field.sensitive).slice(0, 80)
            };
          };
          const bodyText = normalizeText(document.body?.innerText ?? document.body?.textContent ?? "", 12000);
          return {
            scrollX: Math.max(0, Math.round(window.scrollX || document.documentElement.scrollLeft || 0)),
            scrollY: Math.max(0, Math.round(window.scrollY || document.documentElement.scrollTop || 0)),
            viewport: {
              width: Math.max(0, Math.round(window.innerWidth || document.documentElement.clientWidth || 0)),
              height: Math.max(0, Math.round(window.innerHeight || document.documentElement.clientHeight || 0)),
              deviceScaleFactor: Number(window.devicePixelRatio || 1)
            },
            activeElement: activeElementSnapshot(),
            formDraft: formDraftMetadata(),
            textHash: hashStableString(bodyText),
            capturedAt: Date.now()
          };
        })()
      `, true) as Record<string, unknown>;
      const storage = await readPageStorageAvailability(entry);
      const restoreState = sanitizeBrowserPageRestoreState({
        ...pageState,
        history: navigationHistorySnapshot(entry),
        loadState: entry.runtime.isLoading ? "loading" : "idle",
        ...(entry.runtime.restoreState?.targetRegistry === undefined
          ? {}
          : { targetRegistry: entry.runtime.restoreState.targetRegistry }),
        ...(storage === undefined ? {} : { storage })
      });
      if (restoreState === undefined) {
        return entry.runtime.restoreState;
      }
      rememberBrowserRestoreState(entry.tabId, restoreState);
      updateRuntimeState(entry, { restoreState });
      scheduleBrowserSessionSnapshotWrite();
      return restoreState;
    } catch (_error) {
      return entry.runtime.restoreState;
    }
  };

  const applyBrowserRestoreState = async (
    entry: BrowserPageEntry,
    restoreState: WorkbenchBrowserPageRuntimeState["restoreState"] | undefined
  ): Promise<void> => {
    if (
      restoreState === undefined
      || entry.isDestroyed
      || entry.webContents.isDestroyed()
    ) {
      return;
    }
    const scrollX = Number(restoreState.scrollX ?? 0);
    const scrollY = Number(restoreState.scrollY ?? 0);
    if (Number.isFinite(scrollX) === false || Number.isFinite(scrollY) === false) {
      return;
    }
    try {
      await entry.webContents.executeJavaScript(
        `
          (() => {
            window.scrollTo(${Math.max(0, Math.round(scrollX))}, ${Math.max(0, Math.round(scrollY))});
            const selector = ${JSON.stringify(restoreState.activeElement?.cssSelector ?? "")};
            if (selector.length > 0) {
              try {
                const element = document.querySelector(selector);
                if (element instanceof HTMLElement || element instanceof SVGElement) {
                  element.focus?.({ preventScroll: true });
                }
              } catch (_error) {
                return false;
              }
            }
            return true;
          })()
        `,
        true
      );
    } catch {
      // Best-effort restoration should not block tab materialization.
    }
  };

  const currentHistoryUrl = (
    restoreState: WorkbenchBrowserPageRuntimeState["restoreState"] | undefined
  ): string | null => {
    const history = restoreState?.history;
    if (history === undefined || history.entries.length === 0) {
      return null;
    }
    const index = Math.max(0, Math.min(history.entries.length - 1, history.currentIndex));
    return normalizeAddress(history.entries[index]?.url) ?? null;
  };

  const validateDormantRestore = (
    entry: BrowserPageEntry,
    expected: WorkbenchBrowserPageRuntimeState["restoreState"] | undefined,
    actual: WorkbenchBrowserPageRuntimeState["restoreState"] | undefined
  ): void => {
    if (expected === undefined || actual === undefined) {
      return;
    }
    const mismatches: string[] = [];
    const expectedUrl = currentHistoryUrl(expected) ?? normalizeAddress(entry.requestedAddress);
    const actualUrl = currentHistoryUrl(actual) ?? normalizeAddress(entry.runtime.address);
    if (expectedUrl !== null && actualUrl !== null && expectedUrl !== actualUrl) {
      mismatches.push(`url expected ${expectedUrl} got ${actualUrl}`);
    }
    if (
      expected.textHash !== undefined &&
      actual.textHash !== undefined &&
      expected.textHash !== actual.textHash
    ) {
      mismatches.push("text hash changed");
    }
    const expectedScrollX = Number(expected.scrollX);
    const actualScrollX = Number(actual.scrollX);
    if (
      Number.isFinite(expectedScrollX) &&
      Number.isFinite(actualScrollX) &&
      Math.abs(expectedScrollX - actualScrollX) > 16
    ) {
      mismatches.push(`scrollX expected ${expectedScrollX} got ${actualScrollX}`);
    }
    const expectedScrollY = Number(expected.scrollY);
    const actualScrollY = Number(actual.scrollY);
    if (
      Number.isFinite(expectedScrollY) &&
      Number.isFinite(actualScrollY) &&
      Math.abs(expectedScrollY - actualScrollY) > 16
    ) {
      mismatches.push(`scrollY expected ${expectedScrollY} got ${actualScrollY}`);
    }
    const expectedHistoryLength = expected.history?.entries.length;
    const actualHistoryLength = actual.history?.entries.length;
    if (
      expectedHistoryLength !== undefined &&
      actualHistoryLength !== undefined &&
      expectedHistoryLength !== actualHistoryLength
    ) {
      mismatches.push(`history length expected ${expectedHistoryLength} got ${actualHistoryLength}`);
    }
    if (mismatches.length === 0) {
      return;
    }
    updateRuntimeState(entry, {
      recoveryFailure: {
        reason: "target_stale",
        message: `Dormant browser restore validation failed: ${mismatches.join("; ")}`,
        at: Date.now()
      }
    });
  };

  const restoreNavigationHistory = async (
    entry: BrowserPageEntry,
    restoreState: WorkbenchBrowserPageRuntimeState["restoreState"] | undefined
  ): Promise<boolean> => {
    if (
      entry.historyRestoreAttempted ||
      restoreState?.history === undefined ||
      restoreState.history.entries.length === 0 ||
      entry.webContents.isDestroyed()
    ) {
      return false;
    }
    entry.historyRestoreAttempted = true;
    const historyEntries = restoreState.history.entries
      .map((historyEntry) => ({
        url: historyEntry.url,
        title: historyEntry.title
      }))
      .filter((historyEntry) => normalizeAddress(historyEntry.url) !== null);
    if (historyEntries.length === 0) {
      return false;
    }
    const index = Math.max(0, Math.min(historyEntries.length - 1, restoreState.history.currentIndex));
    try {
      updateRuntimeState(entry, { isLoading: true, lifecycleState: "restoring" });
      await entry.webContents.navigationHistory.restore({ entries: historyEntries, index });
      return true;
    } catch (error) {
      const recoveryFailure: WorkbenchBrowserRecoveryFailure = {
        reason: "navigation_failed",
        message: error instanceof Error ? error.message : String(error),
        at: Date.now()
      };
      updateRuntimeState(entry, {
        recoveryFailure,
        isLoading: false
      });
      return false;
    }
  };

  const cancelTombstoneTimer = (tabId: string): void => {
    const timer = tombstoneTimers.get(tabId);
    if (timer === undefined) {
      return;
    }
    clearTimeout(timer);
    tombstoneTimers.delete(tabId);
  };

  const knownEditedForm = (entry: BrowserPageEntry): boolean =>
    (entry.runtime.restoreState?.formDraft?.editedFieldCount ?? 0) > 0;

  const readTombstoneSafety = async (
    entry: BrowserPageEntry,
    urgent: boolean
  ): Promise<"tombstone" | "retry" | "keep"> => {
    if (entry.isDestroyed || entry.webContents.isDestroyed()) {
      return "keep";
    }
    if (
      entry.runtime.recoveryFailure?.reason === "renderer_crashed"
      || entry.runtime.isActive
      || entry.runtime.isVisible
      || entry.runtime.isHtmlFullscreen
      || hasActiveDebuggerClients(entry.tabId, "live")
      || hasActiveLiveAgentBrowserTask(entry.tabId)
      || knownEditedForm(entry)
    ) {
      return "keep";
    }
    if (entry.runtime.isLoading && urgent === false) {
      return "retry";
    }
    if (urgent) {
      // ponytail: live form/media probes plus innerText capture froze the shell
      // when applyLayout evicted every extra hidden page during a close storm.
      // Ceiling: a never-captured dirty form or background media can be discarded.
      // Upgrade: cheap dirty/audible bits from Chromium without DOM serialization.
      return "tombstone";
    }
    try {
      const result = await entry.webContents.executeJavaScript(
        `(() => {
          const fields = Array.from(document.querySelectorAll("input, textarea, select"));
          const hasEditedField = fields.some((field) => {
            if (field instanceof HTMLInputElement) {
              const type = field.type.toLowerCase();
              if (type === "checkbox" || type === "radio") {
                return field.checked !== field.defaultChecked;
              }
              return field.value !== field.defaultValue;
            }
            if (field instanceof HTMLTextAreaElement) {
              return field.value !== field.defaultValue;
            }
            if (field instanceof HTMLSelectElement) {
              return Array.from(field.options).some((option) => option.selected !== option.defaultSelected);
            }
            return false;
          });
          const hasActiveMedia = Array.from(document.querySelectorAll("audio, video"))
            .some((media) => media instanceof HTMLMediaElement && !media.paused && !media.ended);
          return { hasEditedField, hasActiveMedia };
        })()`,
        true
      );
      if (result === null || typeof result !== "object") {
        return urgent ? "tombstone" : "retry";
      }
      const record = result as Record<string, unknown>;
      if (record.hasEditedField === true || record.hasActiveMedia === true) {
        return "keep";
      }
      return "tombstone";
    } catch {
      return urgent ? "tombstone" : "retry";
    }
  };

  const tombstoneEntry = async (
    entry: BrowserPageEntry,
    options?: { readonly skipCapture?: boolean }
  ): Promise<void> => {
    if (
      entry.isDestroyed ||
      entry.runtime.isVisible ||
      entry.runtime.isActive ||
      hasActiveLiveAgentBrowserTask(entry.tabId)
    ) {
      return;
    }
    cancelTombstoneTimer(entry.tabId);
    tombstoneRetryCounts.delete(entry.tabId);
    const restoreState = options?.skipCapture === true
      ? entry.runtime.restoreState
      : await captureBrowserRestoreState(entry);
    const runtime: WorkbenchBrowserPageRuntimeState = {
      ...entry.runtime,
      lifecycleState: "tombstoned",
      isTombstoned: true,
      isVisible: false,
      isLoading: false,
      ...(restoreState === undefined ? {} : { restoreState }),
      updatedAt: Date.now()
    };
    tombstones.set(entry.tabId, {
      tabId: entry.tabId,
      requestedAddress: entry.requestedAddress,
      titleHint: entry.titleHint,
      runtime,
      tombstonedAt: Date.now()
    });
    scheduleBrowserSessionSnapshotWrite(options?.skipCapture === true ? undefined : 0);
    destroyEntry(entry, false);
    deleteEntry(entry.tabId);
    publishRuntimeState(runtime);
  };

  const settleTombstone = (entry: BrowserPageEntry, urgent: boolean): void => {
    if (hasActiveLiveAgentBrowserTask(entry.tabId)) {
      return;
    }
    void readTombstoneSafety(entry, urgent).then((decision) => {
      if (decision === "tombstone") {
        void tombstoneEntry(entry, urgent ? { skipCapture: true } : undefined);
        return;
      }
      if (decision !== "retry") {
        tombstoneRetryCounts.delete(entry.tabId);
        return;
      }
      const retries = (tombstoneRetryCounts.get(entry.tabId) ?? 0) + 1;
      if (retries >= HIDDEN_PAGE_TOMBSTONE_SAFETY_RETRY_LIMIT) {
        tombstoneRetryCounts.delete(entry.tabId);
        void tombstoneEntry(entry);
        return;
      }
      tombstoneRetryCounts.set(entry.tabId, retries);
      const retryTimer = setTimeout(() => {
        tombstoneTimers.delete(entry.tabId);
        settleTombstone(entry, false);
      }, HIDDEN_PAGE_TOMBSTONE_RETRY_MS);
      tombstoneTimers.set(entry.tabId, retryTimer);
    });
  };

  const scheduleTombstone = (
    entry: BrowserPageEntry,
    options?: { readonly urgent?: boolean }
  ): void => {
    const urgent = options?.urgent === true;
    if (
      entry.runtime.recoveryFailure?.reason === "renderer_crashed"
      || entry.runtime.isActive
      || entry.runtime.isVisible
      || entry.runtime.isTombstoned === true
      || hasActiveLiveAgentBrowserTask(entry.tabId)
    ) {
      return;
    }
    if (urgent === false && tombstoneTimers.has(entry.tabId)) {
      return;
    }
    cancelTombstoneTimer(entry.tabId);
    if (urgent === false) {
      disposeCdpAuditSession(entry.tabId, "live");
    }
    const delayMs = urgent ? 0 : HIDDEN_PAGE_TOMBSTONE_DELAY_MS;
    const timer = setTimeout(() => {
      tombstoneTimers.delete(entry.tabId);
      settleTombstone(entry, urgent);
    }, delayMs);
    tombstoneTimers.set(entry.tabId, timer);
  };

  const evictExcessHiddenPages = (): void => {
    const hidden = [...entries.values()]
      .filter((entry) =>
        entry.isDestroyed === false
        && entry.runtime.recoveryFailure?.reason !== "renderer_crashed"
        && entry.runtime.isActive === false
        && entry.runtime.isVisible === false
        && entry.runtime.isTombstoned !== true
        && hasActiveLiveAgentBrowserTask(entry.tabId) === false
      )
      .sort((left, right) => left.runtime.updatedAt - right.runtime.updatedAt);
    const excess = hidden.length - MAX_HOT_HIDDEN_LIVE_PAGES;
    if (excess <= 0) {
      return;
    }
    const next = hidden.find((entry) => knownEditedForm(entry) === false);
    if (next === undefined) {
      return;
    }
    scheduleTombstone(next, { urgent: true });
  };

  const handlePageLoadStopped = (entry: BrowserPageEntry): void => {
    const restoreState =
      pendingRestoreValidations.get(entry.tabId)
      ?? browserSessionSnapshots.get(entry.tabId)
      ?? entry.runtime.restoreState;
    if (restoreState !== undefined) {
      void applyBrowserRestoreState(entry, restoreState)
        .then(() => captureBrowserRestoreState(entry))
        .then((nextRestoreState) => {
          if (nextRestoreState !== undefined) {
            const expectedRestoreState = pendingRestoreValidations.get(entry.tabId);
            pendingRestoreValidations.delete(entry.tabId);
            validateDormantRestore(entry, expectedRestoreState, nextRestoreState);
            scheduleBrowserTargetRegistryWarmup(entry, nextRestoreState);
          }
        });
    } else {
      void captureBrowserRestoreState(entry);
    }
    if (
      entry.isDestroyed === false
      && entry.runtime.isActive === false
      && entry.runtime.isVisible === false
    ) {
      scheduleTombstone(entry);
    }
  };

  const markPendingRestoreValidation = (
    tabId: string,
    restoreState: BrowserRestoreState | undefined
  ): void => {
    if (restoreState !== undefined) {
      pendingRestoreValidations.set(tabId, restoreState);
    }
  };

  const updateDormantTombstone = (
    spec: WorkbenchBrowserPageSpec
  ): WorkbenchBrowserPageRuntimeState | null => {
    const tombstone = tombstones.get(spec.tabId);
    if (tombstone === undefined) {
      return null;
    }
    const runtime: WorkbenchBrowserPageRuntimeState = {
      ...tombstone.runtime,
      address: spec.address,
      title: tombstone.runtime.title.length > 0 ? tombstone.runtime.title : spec.titleHint ?? spec.address,
      coreKey: resolveBrowserCoreKey(spec.address),
      stateKey: `web-state:${spec.tabId}`,
      isActive: spec.isActive,
      isVisible: false,
      lifecycleState: "tombstoned",
      isTombstoned: true,
      updatedAt: Date.now()
    };
    tombstone.requestedAddress = spec.address;
    tombstone.titleHint = spec.titleHint ?? tombstone.titleHint;
    tombstones.set(spec.tabId, {
      ...tombstone,
      runtime
    });
    publishRuntimeState(runtime);
    return runtime;
  };

  const consumeTombstone = (tabId: string): BrowserPageTombstone | undefined => {
    const tombstone = tombstones.get(tabId);
    tombstones.delete(tabId);
    return tombstone;
  };

  const readTombstone = (tabId: string): BrowserPageTombstone | undefined =>
    tombstones.get(tabId);

  const listTombstoneTabIds = (): readonly string[] => [...tombstones.keys()];

  const deleteTombstone = (tabId: string): boolean => tombstones.delete(tabId);

  const hasTombstone = (tabId: string): boolean => tombstones.has(tabId);

  const readTombstoneRuntime = (
    tabId: string
  ): WorkbenchBrowserPageRuntimeState | null =>
    tombstones.get(tabId)?.runtime ?? null;

  const dispose = (): void => {
    for (const timer of tombstoneTimers.values()) {
      clearTimeout(timer);
    }
    tombstoneTimers.clear();
    tombstoneRetryCounts.clear();
    pendingRestoreValidations.clear();
    browserSessionSnapshots.clear();
    tombstones.clear();
  };

  return {
    browserSessionSnapshots,
    cancelTombstoneTimer,
    captureBrowserRestoreState,
    consumeTombstone,
    deleteTombstone,
    dispose,
    evictExcessHiddenPages,
    handlePageLoadStopped,
    hasTombstone,
    listTombstoneTabIds,
    markPendingRestoreValidation,
    rememberBrowserRestoreState,
    readTombstone,
    restoreNavigationHistory,
    readTombstoneRuntime,
    scheduleTombstone,
    tombstones,
    updateDormantTombstone
  };
};
