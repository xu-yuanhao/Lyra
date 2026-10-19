import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test, vi } from "vitest";

vi.mock("electron", () => ({ BrowserWindow: { getAllWindows: () => [] }, ipcMain: {
  handle: vi.fn(), on: vi.fn(), removeHandler: vi.fn(), removeListener: vi.fn()
} }));
import { createWorkbenchStateIpcBridge } from "../../workbench-state/service";
import { createBrowserSessionRuntime } from "../view-manager-runtime/session-runtime";
import { EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT } from "../../../shared/workbench-browser";

afterEach(() => vi.useRealTimers());
test("disposing within the snapshot debounce saves the last navigation before entries are destroyed", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "lyra-session-shutdown-"));
  const bridge = await createWorkbenchStateIpcBridge(root);
  vi.useFakeTimers();
  try {
    const runtimeState = { tabId: "tab", address: "https://example.com/latest", title: "Latest", isActive: true,
      isVisible: true, isLoading: false, canGoBack: true, canGoForward: false, isHtmlFullscreen: false, updatedAt: Date.now() };
    const entries = new Map([["tab", { runtime: runtimeState, requestedAddress: runtimeState.address, titleHint: "Latest" }]]) as never;
    const runtime = createBrowserSessionRuntime({ workbenchState: bridge, entries, tombstones: new Map(),
      hasActiveLiveAgentBrowserTask: () => false, publishEvent: vi.fn(),
      readTopology: () => ({ activeTabId: "tab", pages: [{ tabId: "tab", address: runtimeState.address, isActive: true }] }),
      readLayoutSnapshot: () => EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT, liveElectronSession: () => ({ getStoragePath: () => null }) as never });
    runtime.scheduleBrowserSessionSnapshotWrite(120);
    runtime.dispose(); (entries as Map<string, unknown>).clear();
    runtime.scheduleBrowserSessionSnapshotWrite();
    vi.useRealTimers(); await bridge.flush();
    const state = JSON.parse(bridge.readState("browser-session")!);
    expect(state.tabs[0].address).toBe("https://example.com/latest");
    expect(state.tabs[0].title).toBe("Latest");
    const onDisk = JSON.parse(readFileSync(path.join(root, "browser-session.v1.json"), "utf8"));
    expect(onDisk.tabs[0].address).toBe("https://example.com/latest");
    expect(onDisk.tabs[0].title).toBe("Latest");
  } finally { vi.useRealTimers(); bridge.dispose(); rmSync(root, { recursive: true, force: true }); }
});
