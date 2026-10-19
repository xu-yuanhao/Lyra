import { EventEmitter } from "node:events";
import { expect, test, vi } from "vitest";
import { browserContextMenuLabels } from "../../../shared/browser-context-menu-labels";

const mock = vi.hoisted(() => ({ views: [] as Array<any>, preferences: [] as Array<any> }));
vi.mock("electron", async () => {
  const { EventEmitter } = await import("node:events");
  return { shell: {}, WebContentsView: class {
    webContents = Object.assign(new EventEmitter(), {
      getURL: vi.fn(() => ""), getOSProcessId: () => 1, isDestroyed: () => false,
      loadURL: vi.fn(async () => {}), close: vi.fn(), reload: vi.fn(), reloadIgnoringCache: vi.fn(),
      setWindowOpenHandler: vi.fn(), setBackgroundThrottling: vi.fn(),
      navigationHistory: { canGoBack: () => true, canGoForward: () => false }
    });
    setVisible = vi.fn();
    constructor(_options?: { webPreferences?: unknown }) {
      mock.views.push(this);
      mock.preferences.push(_options?.webPreferences);
    }
  } };
});
import { createPageRegistryController } from "../view-manager-runtime/page-registry-controller";

test("a renderer crash keeps its tab and URL; the recovery button reloads only that guest", async () => {
  const publishEvent = vi.fn();
  const host = new Proxy({
    getWindow: () => null, publishEvent, canMaterializePage: () => true,
    syncTopologySnapshot: (topology: unknown) => ({ previousActiveTabId: null, topology }),
    readTombstone: () => undefined, consumeTombstone: () => undefined, persistedTabSnapshot: () => null,
    listTombstoneTabIds: () => [], readBrowserContextMenuLabels: () => browserContextMenuLabels("en-US"),
    restoreNavigationHistory: async () => false,
    updateRuntimeState: (entry: any, patch: unknown) => { entry.runtime = { ...entry.runtime, ...(patch as object) }; },
    onWebContentsCreated: () => vi.fn()
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn() });
  const registry = createPageRegistryController(host as never);
  registry.syncTopology({ activeTabId: "tab", pages: [{ tabId: "tab", address: "https://example.com/page", isActive: true }] });
  await Promise.resolve();
  const entry = registry.entries.get("tab")!;
  const guest = entry.webContents as unknown as EventEmitter & { close: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
  guest.emit("render-process-gone", {}, { reason: "crashed", exitCode: 1 });
  expect(registry.entries.get("tab")).toBe(entry);
  expect(guest.close).not.toHaveBeenCalled();
  expect(entry.runtime.address).toBe("https://example.com/page");
  expect(entry.runtime.recoveryFailure?.reason).toBe("renderer_crashed");
  expect(publishEvent.mock.calls.some(([event]) => event.kind === "page-closed")).toBe(false);
  const recovery = entry.recoveryView!.webContents as unknown as EventEmitter;
  const preventDefault = vi.fn();
  recovery.emit("will-navigate", { preventDefault }, "https://lyra-recovery.invalid/reload");
  expect(preventDefault).toHaveBeenCalledOnce();
  expect(guest.reload).toHaveBeenCalledOnce();
  expect(entry.recoveryView).toBeUndefined();
  expect(entry.runtime.recoveryFailure).toBeUndefined();
  registry.dispose();
});

test("user tabs keep Chromium background throttling; agent-driven pages opt out", () => {
  mock.preferences.length = 0;
  const host = new Proxy({
    getWindow: () => null, publishEvent: vi.fn(), canMaterializePage: () => true,
    syncTopologySnapshot: (topology: unknown) => ({ previousActiveTabId: null, topology }),
    readTombstone: () => undefined, consumeTombstone: () => undefined, persistedTabSnapshot: () => null,
    listTombstoneTabIds: () => [], readBrowserContextMenuLabels: () => browserContextMenuLabels("en-US"),
    restoreNavigationHistory: async () => false,
    updateRuntimeState: (entry: any, patch: unknown) => { entry.runtime = { ...entry.runtime, ...(patch as object) }; },
    onWebContentsCreated: () => vi.fn()
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : vi.fn() });
  const registry = createPageRegistryController(host as never);
  registry.syncTopology({ activeTabId: "tab", pages: [{ tabId: "tab", address: "https://example.com/page", isActive: true }] });
  expect(mock.preferences.at(-1)?.backgroundThrottling).toBeUndefined();

  const live = registry.ensureAgentEntry("tab");
  expect(live?.webContents.setBackgroundThrottling).toHaveBeenCalledWith(false);

  registry.prepareAgentPage("agent-tab", "https://example.com/agent");
  expect(mock.preferences.at(-1)?.backgroundThrottling).toBe(false);
  registry.dispose();
});
