import { writeFileSync } from "node:fs";
import { app, BrowserWindow, session } from "electron";
import { createMainWindowLifecycle } from "../src/main/main-window-lifecycle";
import { createRendererRecoveryController } from "../src/main/workbench-renderer-recovery";
import { createBoundedShutdown } from "../src/main/bounded-shutdown";
import { createPageRegistryController } from "../src/main/workbench-browser/view-manager-runtime/page-registry-controller";
import { createLayoutController } from "../src/main/workbench-browser/view-manager-runtime/layout-controller";
import { createBrowserSessionRuntime } from "../src/main/workbench-browser/view-manager-runtime/session-runtime";
import { createWorkbenchStateIpcBridge } from "../src/main/workbench-state/service";
import { browserContextMenuLabels } from "../src/shared/browser-context-menu-labels";
import { nativeRecoveryLabels } from "../src/shared/native-recovery-labels";
import { WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION, EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT } from "../src/shared/workbench-browser";
import path from "node:path";

const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))!.slice(name.length + 3);
const root = argument("fixture-root");
const url = argument("fixture-url");
app.setPath("userData", path.join(root, "profile"));
app.setName("Lyra recovery verification");
app.commandLine.appendSwitch("disable-gpu");
void app.whenReady().then(async () => {
  const store = await createWorkbenchStateIpcBridge(path.join(root, "state"));
  let main: BrowserWindow | null = null;
  let quitting = false;
  let created = 0;
  let rendererGone = 0;
  const events: unknown[] = [];
  let layout: ReturnType<typeof createLayoutController>;
  let runtime: ReturnType<typeof createBrowserSessionRuntime>;
  const noop = () => {};
  const host = new Proxy({
    getWindow: () => main, publishEvent: (event: unknown) => events.push(event),
    syncTopologySnapshot: (value: any) => layout.syncTopology(value), syncLayoutSnapshot: (value: any) => layout.syncLayout(value),
    applyLayout: () => layout.applyLayout(), findLayout: (id: string) => layout.findLayout(id),
    getActiveOrFocusedTabId: () => layout.getActiveOrFocusedTabId(), canMaterializePage: () => true,
    detachEntryView: (entry: any) => layout.detachEntryView(entry),
    readTombstone: () => undefined, consumeTombstone: () => undefined, listTombstoneTabIds: () => [],
    persistedTabSnapshot: (id: string) => runtime.persistedTabSnapshot(id),
    updateRuntimeState: (entry: any, patch: any) => runtime.updateRuntimeState(entry, patch),
    scheduleBrowserSessionSnapshotWrite: (delay?: number) => runtime.scheduleBrowserSessionSnapshotWrite(delay),
    syncPerformanceRuntimeState: noop, restoreNavigationHistory: async () => false,
    readBrowserContextMenuLabels: () => browserContextMenuLabels("en-US"), readNativeRecoveryLabels: nativeRecoveryLabels,
    onWebContentsCreated: () => noop
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : noop });
  const registry = createPageRegistryController(host as never);
  layout = createLayoutController(new Proxy({ getWindow: () => main, entries: registry.entries,
    updateRuntimeState: (entry: any, patch: any) => runtime.updateRuntimeState(entry, patch)
  }, { get: (target, key) => key in target ? target[key as keyof typeof target] : noop }) as never);
  runtime = createBrowserSessionRuntime({ workbenchState: store, entries: registry.entries, tombstones: new Map(),
    hasActiveLiveAgentBrowserTask: () => false, hasUserInputDirtyTab: () => false, publishEvent: host.publishEvent,
    readTopology: layout.readTopology, readLayoutSnapshot: layout.readLayoutSnapshot,
    liveElectronSession: () => session.fromPartition(WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION) });
  const sync = () => {
    registry.syncTopology({ activeTabId: "tab", pages: [{ tabId: "tab", address: url, isActive: true, isVisible: true }] });
    layout.syncLayout({ ...EMPTY_WORKBENCH_BROWSER_LAYOUT_SNAPSHOT, windowWidth: 760, windowHeight: 500,
      layouts: [{ tabId: "tab", x: 0, y: 0, width: 760, height: 500, visible: true, zIndex: 0, isFocusedPane: true }] as never });
  };
  const choices: unknown[] = [];
  const lifecycle = createMainWindowLifecycle({ isQuitting: () => quitting,
    create: () => {
      runtime.persistBrowserSessionSnapshot(); created++;
      const window = new BrowserWindow({ width: 760, height: 500, useContentSize: true,
        title: "Lyra recovery verification", webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
      const recovery = createRendererRecoveryController({ isUnavailable: () => quitting || window.isDestroyed(),
        tryStartupRelaunch: () => false, reload: () => window.webContents.reload(),
        // Dialog choice itself is covered by controller tests. This fixture
        // exercises replacement ownership without leaving an unattended OS dialog.
        chooseRecovery: async () => { choices.push("reopen"); return "reopen"; },
        reopen: () => lifecycle.reopen(window), close: () => window.destroy(), report: console.error });
      window.webContents.on("render-process-gone", (_event, details) => { rendererGone++; recovery.handle(details); });
      window.once("closed", recovery.dispose);
      window.on("close", () => runtime.persistBrowserSessionSnapshot());
      void window.loadURL("data:text/html,<title>Lyra recovery verification</title><body>Recovery verification</body>").then(sync);
      return window;
    }, publish: window => { main = window; }, onClosed: noop
  });
  const shadow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
  lifecycle.open(); app.on("activate", lifecycle.activate);
  const shutdown = createBoundedShutdown({ flush: process.argv.includes("--fixture-hang-flush") ? () => new Promise<void>(() => {}) : store.flush, dispose: store.dispose, exit: () => app.exit(0), reportFailure: console.error });
  app.on("before-quit", () => { quitting = true; runtime.dispose(); registry.dispose(); layout.dispose(); });
  app.on("will-quit", event => { event.preventDefault(); void shutdown.run(); });
  (globalThis as any).recoveryFixture = {
    captureRecovery: async (output: string) => {
      const image = await registry.getEntry("tab")!.recoveryView!.webContents.capturePage();
      writeFileSync(output, image.toPNG());
    },
    registry, lifecycle, runtime, shadow, events, choices, get main() { return main; }, get created() { return created; }, get rendererGone() { return rendererGone; }
  };
});
