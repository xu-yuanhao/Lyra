import { JSDOM, type DOMWindow } from "jsdom";
import { beforeEach, describe, expect, test, vi } from "vitest";

const electronMock = vi.hoisted(() => {
  const webContentsQueue: unknown[] = [];
  const browserWindows: unknown[] = [];
  const webContentsViews: FakeWebContentsView[] = [];

  class FakeView {
    readonly children: unknown[] = [];
    private bounds = { x: 0, y: 0, width: 1, height: 1 };
    private visible = false;

    addChildView(view: unknown): void {
      this.children.push(view);
    }

    removeChildView(view: unknown): void {
      const index = this.children.indexOf(view);
      if (index >= 0) {
        this.children.splice(index, 1);
      }
    }

    setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
      this.bounds = bounds;
    }

    getBounds(): { x: number; y: number; width: number; height: number } {
      return this.bounds;
    }

    setVisible(visible: boolean): void {
      this.visible = visible;
    }

    isVisible(): boolean {
      return this.visible;
    }
  }

  class FakeWebContentsView extends FakeView {
    readonly webContents: unknown;
    readonly options: unknown;

    constructor(options?: unknown) {
      super();
      this.options = options;
      this.webContents = webContentsQueue.shift() ?? {};
      webContentsViews.push(this);
    }

    setBackgroundColor(): void {
      // Electron-only visual hook.
    }
  }

  class FakeBrowserWindow {
    readonly contentView = new FakeView();
    readonly webContents: unknown;
    private destroyed = false;

    constructor() {
      this.webContents = webContentsQueue.shift() ?? {};
      browserWindows.push(this);
    }

    isDestroyed(): boolean {
      return this.destroyed;
    }

    destroy(): void {
      this.destroyed = true;
    }

    getContentBounds(): { x: number; y: number; width: number; height: number } {
      return { x: 0, y: 0, width: 1_280, height: 720 };
    }

    isFullScreen(): boolean {
      return false;
    }

    setFullScreen(): void {
      // Electron-only visual hook.
    }

    setMenuBarVisibility(): void {
      // Electron-only visual hook.
    }

    // Geometry fixtures have no native keyboard focus. Match Electron's
    // event-chain API without enabling focus emulation in these tests.
    isVisible(): boolean { return true; }
    isMinimized(): boolean { return false; }
    isFocused(): boolean { return false; }
    on(): this { return this; }
    off(): this { return this; }
  }

  return {
    webContentsQueue,
    webContentsViews,
    browserWindows,
    BrowserWindow: FakeBrowserWindow,
    View: FakeView,
    WebContentsView: FakeWebContentsView,
    session: {
      fromPartition: vi.fn(() => ({
        getStoragePath: () => null,
        cookies: {
          get: vi.fn(async () => [])
        }
      }))
    },
    shell: {
      openExternal: vi.fn(async () => undefined)
    }
  };
});

vi.mock("electron", () => electronMock);

import { createWorkbenchBrowserViewManager } from "../view-manager";
import type {
  WorkbenchBrowserAgentElement,
  WorkbenchBrowserViewManager
} from "../types";

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

type FakeFrame = {
  frameTreeNodeId: number;
  url: string;
  origin: string;
  name: string;
  readonly window: DOMWindow;
  parent: FakeFrame | null;
  top: FakeFrame;
  frames: FakeFrame[];
  readonly framesInSubtree: FakeFrame[];
  isDestroyed: () => boolean;
  executeJavaScript: ReturnType<typeof vi.fn>;
};

type FakeWebContents = {
  mainFrame: FakeFrame;
  sentInputEvents: Array<Record<string, unknown>>;
  debugger: {
    isAttached: ReturnType<typeof vi.fn>;
    attach: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
    sendCommand: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
  };
  getURL: ReturnType<typeof vi.fn>;
  getTitle: ReturnType<typeof vi.fn>;
  isDestroyed: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  sendInputEvent: ReturnType<typeof vi.fn>;
  executeJavaScript: ReturnType<typeof vi.fn>;
  loadURL: ReturnType<typeof vi.fn>;
  reload: ReturnType<typeof vi.fn>;
  reloadIgnoringCache: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  setWindowOpenHandler: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  emit: (event: string, ...args: unknown[]) => void;
  listenerCount: (event: string) => number;
  removeAllListeners: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  insertCSS: ReturnType<typeof vi.fn>;
  findInPage: ReturnType<typeof vi.fn>;
  stopFindInPage: ReturnType<typeof vi.fn>;
  insertText: ReturnType<typeof vi.fn>;
  removeInsertedCSS: ReturnType<typeof vi.fn>;
  capturePage: ReturnType<typeof vi.fn>;
  navigationHistory: {
    canGoBack: ReturnType<typeof vi.fn>;
    canGoForward: ReturnType<typeof vi.fn>;
    getAllEntries: ReturnType<typeof vi.fn>;
    getActiveIndex: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  };
  session: {
    cookies: {
      get: ReturnType<typeof vi.fn>;
    };
  };
};

const originFromUrl = (url: string): string => {
  try {
    return new URL(url).origin;
  } catch {
    return "null";
  }
};

// Electron sendInputEvent lands in the renderer as a trusted input event, and
// JSDOM can only construct synthetic ones whose trust flag the dispatcher
// resets. Chromium also routes the click through the compositor, so a point
// over a child iframe is delivered to that frame's document in child-frame
// coordinates. This fixture mirrors both.
const markTrustedInput = (event: Event): void => {
  for (const symbol of Object.getOwnPropertySymbols(event)) {
    const impl = (event as unknown as Record<symbol, unknown>)[symbol];
    if (impl !== null && typeof impl === "object" && "isTrusted" in (impl as object)) {
      Object.defineProperty(impl as object, "isTrusted", {
        configurable: true,
        get: () => true,
        set: () => undefined
      });
    }
  }
};
const dispatchTrustedMouseInput = (frame: FakeFrame, type: string, x: number, y: number): void => {
  const win = frame.window;
  const hit = win.document.elementFromPoint(x, y);
  if (hit === null) {
    return;
  }
  if (hit instanceof win.HTMLIFrameElement) {
    const iframe = hit as HTMLIFrameElement;
    const child = frame.frames.find((candidate) =>
      (iframe.name.length > 0 && candidate.name === iframe.name) || candidate.url === iframe.src);
    if (child !== undefined) {
      const rect = iframe.getBoundingClientRect();
      dispatchTrustedMouseInput(child, type, x - rect.x, y - rect.y);
      return;
    }
  }
  const event = new win.MouseEvent(type, {
    bubbles: true,
    composed: true,
    clientX: x,
    clientY: y
  });
  markTrustedInput(event);
  hit.dispatchEvent(event);
};

const createWindow = (html: string, url: string): DOMWindow => {
  const dom = new JSDOM(html, {
    url,
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const win = dom.window;
  // Layout is supplied by setRect; native visibility behavior is covered by the
  // Chromium suite, since JSDOM does not implement Element.checkVisibility.
  Object.defineProperty(win.Element.prototype, "checkVisibility", { configurable: true, value: function (this: Element) {
    const style = win.getComputedStyle(this);
    return style.display !== "none" && !["hidden", "collapse"].includes(style.visibility);
  } });
  // Chromium scrolls when revealing owners; JSDOM has no layout engine, so the
  // reveal scripts only need the call to exist.
  Object.defineProperty(win.Element.prototype, "scrollIntoView", { configurable: true, value: function (this: Element) {
    // Intentional no-op: JSDOM has no scrolling layout to update.
  } });
  // Rendered-text reads gate text nodes on non-empty range rects. JSDOM has no
  // layout, so derive range rects from the fake element boxes set by setRect;
  // unmeasured elements keep the all-zero JSDOM box and stay excluded.
  Object.defineProperty(win.Range.prototype, "getClientRects", { configurable: true, value: function (this: Range) {
    const dbgStart = this.startContainer;
    const element = dbgStart.nodeType === 3 ? dbgStart.parentElement : dbgStart.nodeType === 1 ? (dbgStart as Element) : null;
    const rect = element !== null && typeof element.getBoundingClientRect === "function"
      ? element.getBoundingClientRect()
      : null;
    if (rect === null || rect.width <= 0 || rect.height <= 0) {
      return [];
    }
    return [{
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      x: rect.x,
      y: rect.y,
      toJSON: () => rect
    }];
  } });
  Object.defineProperty(win, "innerWidth", { configurable: true, value: 1_280 });
  Object.defineProperty(win, "innerHeight", { configurable: true, value: 720 });
  win.scrollTo = vi.fn();
  win.document.elementFromPoint = ((x: number, y: number) => {
    const collect = (root: ParentNode): Element[] => {
      const elements = Array.from(root.querySelectorAll("*"));
      return elements.flatMap((element) => {
        const shadowRoot = (element as HTMLElement).shadowRoot;
        return shadowRoot === null ? [element] : [element, ...collect(shadowRoot)];
      });
    };
    return collect(win.document)
      .reverse()
      .find((element) => {
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      }) ?? win.document.body;
  }) as Document["elementFromPoint"];
  return win;
};

const setRect = (element: Element, rect: Rect): void => {
  element.getBoundingClientRect = vi.fn(() => ({
    x: rect.x,
    y: rect.y,
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.width,
    bottom: rect.y + rect.height,
    width: rect.width,
    height: rect.height,
    toJSON: () => rect
  }));
  // JSDOM has no layout engine; the surface frame math scales points by the
  // owner element's border box, so supply the fake layout box too.
  Object.defineProperty(element, "offsetWidth", { configurable: true, value: rect.width });
  Object.defineProperty(element, "offsetHeight", { configurable: true, value: rect.height });
};

const createFrame = ({
  id,
  url,
  html,
  name = "",
  parent = null,
  executeJavaScript
}: {
  readonly id: number;
  readonly url: string;
  readonly html: string;
  readonly name?: string;
  readonly parent?: FakeFrame | null;
  readonly executeJavaScript?: (script: string, userGesture?: boolean) => unknown | Promise<unknown>;
}): FakeFrame => {
  const win = createWindow(html, url);
  const frame = {
    frameTreeNodeId: id,
    url,
    origin: originFromUrl(url),
    name,
    parent,
    top: undefined as unknown as FakeFrame,
    frames: [] as FakeFrame[],
    get framesInSubtree(): FakeFrame[] {
      return [frame, ...frame.frames.flatMap((child) => child.framesInSubtree)];
    },
    isDestroyed: () => false,
    executeJavaScript: vi.fn(async (script: string, userGesture?: boolean) => {
      if (executeJavaScript !== undefined) {
        return await executeJavaScript(script, userGesture);
      }
      return win.eval(script);
    }),
    window: win
  };
  frame.top = parent?.top ?? frame;
  return frame;
};

const appendChildFrame = (parent: FakeFrame, child: FakeFrame): void => {
  child.parent = parent;
  child.top = parent.top;
  parent.frames.push(child);
};

const createWebContents = (
  mainFrame: FakeFrame,
  options: {
    readonly sendCommand?: (
      method: string,
      params?: Record<string, unknown>,
      sessionId?: string
    ) => Record<string, unknown> | Promise<Record<string, unknown>>;
    readonly hangLoad?: boolean;
  } = {}
): FakeWebContents => {
  let attached = false;
  const sentInputEvents: Array<Record<string, unknown>> = [];
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const addListener = (event: string, listener: (...args: unknown[]) => void): void => {
    const existing = listeners.get(event) ?? new Set();
    existing.add(listener);
    listeners.set(event, existing);
  };
  const removeListener = (event: string, listener: (...args: unknown[]) => void): void => {
    listeners.get(event)?.delete(listener);
  };
  const emit = (event: string, ...args: unknown[]): void => {
    for (const listener of [...(listeners.get(event) ?? [])]) {
      listener(...args);
    }
  };
  const debuggerApi = {
    isAttached: vi.fn(() => attached),
    attach: vi.fn(() => {
      attached = true;
    }),
    detach: vi.fn(() => {
      attached = false;
    }),
    sendCommand: vi.fn(async (
      method: string,
      params?: Record<string, unknown>,
      sessionId?: string
    ) => {
      if (options.sendCommand !== undefined) {
        return await options.sendCommand(method, params, sessionId);
      }
      if (method === "Accessibility.getFullAXTree") {
        return { nodes: [] };
      }
      if (method === "DOMSnapshot.captureSnapshot") {
        return { documents: [], strings: [], computedStyles: [] };
      }
      if (method === "Runtime.evaluate") {
        return { result: { type: "object", subtype: "null", value: null } };
      }
      if (method === "Page.addScriptToEvaluateOnNewDocument") {
        return { identifier: `script-${Math.random().toString(16).slice(2)}` };
      }
      return {};
    }),
    on: vi.fn(),
    off: vi.fn()
  };
  const webContents: FakeWebContents = {
    mainFrame,
    sentInputEvents,
    debugger: debuggerApi,
    getURL: vi.fn(() => mainFrame.url),
    getTitle: vi.fn(() => mainFrame.window.document.title || "Fixture"),
    isDestroyed: vi.fn(() => false),
    focus: vi.fn(),
    sendInputEvent: vi.fn((event: Record<string, unknown>) => {
      sentInputEvents.push(event);
      const type = event.type;
      const x = Number(event.x);
      const y = Number(event.y);
      if (
        (type === "mouseMove" || type === "mouseDown" || type === "mouseUp")
        && Number.isFinite(x)
        && Number.isFinite(y)
      ) {
        const domEventType =
          type === "mouseMove" ? "mousemove" : type === "mouseDown" ? "mousedown" : "mouseup";
        dispatchTrustedMouseInput(mainFrame, domEventType, x, y);
      }
    }),
    insertText: vi.fn(async (text: string) => {
      const win = mainFrame.window;
      // document.activeElement retargets to the shadow host; walk open shadow
      // roots to the actual focused editable, as Chromium's insertText would.
      let active = win.document.activeElement;
      while (active !== null && active.shadowRoot !== null && active.shadowRoot.activeElement !== null) {
        active = active.shadowRoot.activeElement;
      }
      if (active instanceof win.HTMLInputElement || active instanceof win.HTMLTextAreaElement) {
        const start = active.selectionStart ?? active.value.length;
        const end = active.selectionEnd ?? active.value.length;
        active.value = active.value.slice(0, start) + text + active.value.slice(end);
        const caret = start + text.length;
        try {
          active.setSelectionRange(caret, caret);
        } catch {
          // Caret-less input types keep their full replacement value.
        }
        active.dispatchEvent(new win.Event("input", { bubbles: true, composed: true }));
      }
    }),
    executeJavaScript: vi.fn(async (script: string, userGesture?: boolean) =>
      await mainFrame.executeJavaScript(script, userGesture)
    ),
    loadURL: vi.fn(async (url: string) => {
      mainFrame.url = url;
      mainFrame.origin = originFromUrl(url);
      if (!options.hangLoad) queueMicrotask(() => {
        webContents.emit("did-navigate", {}, url);
        webContents.emit("dom-ready");
      });
      if (options.hangLoad === true) {
        await new Promise(() => undefined);
      }
    }),
    reload: vi.fn(() => {
      queueMicrotask(() => {
        webContents.emit("did-stop-loading");
      });
    }),
    reloadIgnoringCache: vi.fn(() => {
      queueMicrotask(() => {
        webContents.emit("did-stop-loading");
      });
    }),
    close: vi.fn(),
    stop: vi.fn(),
    setWindowOpenHandler: vi.fn(),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      addListener(event, listener);
    }),
    removeListener: vi.fn((event: string, listener: (...args: unknown[]) => void) => { removeListener(event,listener); }),
    off: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      removeListener(event, listener);
    }),
    once: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      const onceListener = (...args: unknown[]): void => {
        removeListener(event, onceListener);
        listener(...args);
      };
      addListener(event, onceListener);
    }),
    emit,
    listenerCount: (event: string) => listeners.get(event)?.size ?? 0,
    removeAllListeners: vi.fn((event?: string) => {
      if (typeof event === "string") {
        listeners.delete(event);
      } else {
        listeners.clear();
      }
    }),
    insertCSS: vi.fn(async () => "css-key"),
    removeInsertedCSS: vi.fn(async () => undefined),
    findInPage: vi.fn(),
    stopFindInPage: vi.fn(),
    capturePage: vi.fn(async () => ({
      getSize: () => ({ width: 1, height: 1 }),
      toPNG: () => Buffer.from([])
    })),
    navigationHistory: {
      canGoBack: vi.fn(() => false),
      canGoForward: vi.fn(() => false),
      getAllEntries: vi.fn(() => []),
      getActiveIndex: vi.fn(() => 0),
      restore: vi.fn(async () => undefined)
    },
    session: {
      cookies: {
        get: vi.fn(async () => [])
      }
    }
  };
  return webContents;
};

const createManager = (
  mainFrame: FakeFrame,
  options?: Parameters<typeof createWebContents>[1],
  managerOptions: {
    readonly withWindow?: boolean;
    readonly publishEvent?: Parameters<typeof createWorkbenchBrowserViewManager>[0]["publishEvent"];
  } = {}
): {
  readonly manager: WorkbenchBrowserViewManager;
  readonly publishEvent: Parameters<typeof createWorkbenchBrowserViewManager>[0]["publishEvent"];
  readonly webContents: FakeWebContents;
} => {
  const webContents = createWebContents(mainFrame, options);
  const browserWindow = managerOptions.withWindow === true
    ? new electronMock.BrowserWindow()
    : null;
  const publishEvent = managerOptions.publishEvent ?? vi.fn();
  electronMock.webContentsQueue.push(webContents);
  const manager = createWorkbenchBrowserViewManager({
    getWindow: () => browserWindow as never,
    publishEvent
  });
  manager.syncTopology({
    activeTabId: "tab-1",
    pages: [{
      tabId: "tab-1",
      address: mainFrame.url,
      titleHint: "Fixture",
      isActive: true
    }]
  });
  return { manager, publishEvent, webContents };
};

const createEmptyManager = (): WorkbenchBrowserViewManager =>
  createWorkbenchBrowserViewManager({
    getWindow: () => null,
    publishEvent: vi.fn()
  });

const findByLabel = (
  elements: readonly WorkbenchBrowserAgentElement[],
  label: string
): WorkbenchBrowserAgentElement => {
  const element = elements.find((candidate) => candidate.label === label);
  expect(element).toBeDefined();
  return element as WorkbenchBrowserAgentElement;
};

describe("Workbench browser semantic tree fixtures", () => {
  beforeEach(() => {
    electronMock.webContentsQueue.length = 0;
    electronMock.webContentsViews.length = 0;
    electronMock.browserWindows.length = 0;
    delete process.env.LYRA_BROWSER_ENABLE_CDP_PAGESHOT;
    delete process.env.LYRA_BROWSER_ENABLE_TEMP_SNAPSHOT_RENDERER;
  });

  test("explicit missing page state never aliases the foreground page",()=>{
    const frame=createFrame({id:1,url:"https://active.example/",html:"<main>Active</main>"});
    const {manager}=createManager(frame);
    expect(manager.readPageState({tabId:"missing"})).toBeNull();
    expect(manager.readPageState({tabId:"tab-1"})).not.toBeNull();
  });

  test("subframe history changes cannot replace tab identity or main-document targets", async () => {
    const frame = createFrame({ id: 1, url: "https://mail.example/#drafts", html: '<button>Compose</button>' });
    setRect(frame.window.document.querySelector("button")!, { x: 20, y: 20, width: 120, height: 40 });
    const { manager, webContents } = createManager(frame);
    const before = await manager.observeAgentPage("tab-1", { strategy: "interactiveOnly" });
    webContents.emit("did-navigate-in-page", {}, "https://contacts.example/widget#profile", false, 2, 2);
    expect(manager.readPageState({ tabId: "tab-1" })?.address).toBe(frame.url);
    expect((await manager.readAgentPage("tab-1", { strategy: "focus" })).url).toBe(frame.url);
    const after = await manager.observeAgentPage("tab-1", { strategy: "interactiveOnly" });
    expect(findByLabel(after.elements, "Compose").targetRef).toBe(findByLabel(before.elements, "Compose").targetRef);
    frame.url = "https://mail.example/#inbox";
    webContents.emit("did-navigate-in-page", {}, frame.url, true, 1, 1);
    expect(manager.readPageState({ tabId: "tab-1" })?.address).toBe(frame.url);
    expect((await manager.readAgentPage("tab-1", { strategy: "focus" })).url).toBe(frame.url);
  });

  test("an agent can materialize a known hidden page without activating another tab",async()=>{
    const active=createWebContents(createFrame({id:1,url:"https://active.example/",html:"<main>Active</main>"}));
    const hidden=createWebContents(createFrame({id:2,url:"https://hidden.example/",html:"<main>Hidden</main>"}));
    electronMock.webContentsQueue.push(active,hidden);
    const manager=createEmptyManager();
    manager.syncTopology({activeTabId:"active",pages:[
      {tabId:"active",address:"https://active.example/",isActive:true,isVisible:true},
      {tabId:"hidden",address:"https://hidden.example/",isActive:false,isVisible:false}
    ]});
    expect(electronMock.webContentsQueue).toEqual([hidden]);
    await manager.readAgentPage("hidden",{targetMode:"live"});
    expect(electronMock.webContentsQueue).toHaveLength(0);
    expect(manager.readPageState({tabId:"active"})?.address).toBe("https://active.example/");
    manager.syncTopology({activeTabId:"active",pages:[{tabId:"active",address:"https://active.example/",isActive:true,isVisible:true}]});
    await expect(manager.readAgentPage("hidden",{targetMode:"live"})).rejects.toThrow("not materialized");
  });

  test("keeps HTML video fullscreen inside the browser view", () => {
    const frame = createFrame({
      id: 1,
      url: "https://video.example/",
      html: "<!doctype html><title>Video</title><video></video>"
    });

    createManager(frame);

    expect(electronMock.webContentsViews).toHaveLength(1);
    expect(electronMock.webContentsViews[0]?.options).toMatchObject({
      webPreferences: {
        disableHtmlFullscreenWindowResize: true
      }
    });
  });

  test("materializes only visible browser tabs and closes removed tabs without snapshotting", async () => {
    const activeFrame = createFrame({
      id: 1,
      url: "https://active.example/",
      html: "<!doctype html><title>Active</title><main>Active</main>"
    });
    const hiddenFrame = createFrame({
      id: 2,
      url: "about:blank",
      html: "<!doctype html><title>Hidden</title><main>Hidden</main>"
    });
    const activeWebContents = createWebContents(activeFrame);
    const hiddenWebContents = createWebContents(hiddenFrame);
    electronMock.webContentsQueue.push(activeWebContents, hiddenWebContents);
    const manager = createEmptyManager();

    manager.syncTopology({
      activeTabId: "active",
      pages: [
        {
          tabId: "active",
          address: "https://active.example/",
          isActive: true,
          isVisible: true
        },
        {
          tabId: "hidden",
          address: "https://hidden.example/",
          isActive: false,
          isVisible: false
        }
      ]
    });
    await Promise.resolve();

    expect(electronMock.webContentsQueue).toEqual([hiddenWebContents]);

    manager.syncTopology({
      activeTabId: "hidden",
      pages: [
        {
          tabId: "active",
          address: "https://active.example/",
          isActive: false,
          isVisible: false
        },
        {
          tabId: "hidden",
          address: "https://hidden.example/",
          isActive: true,
          isVisible: true
        }
      ]
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(hiddenWebContents.loadURL).toHaveBeenCalledWith("https://hidden.example/");
    // Load/commit may read restore state; removing the tab must not do so.
    hiddenWebContents.executeJavaScript.mockClear();

    manager.syncTopology({
      activeTabId: "active",
      pages: [{
        tabId: "active",
        address: "https://active.example/",
        isActive: true,
        isVisible: true
      }]
    });

    expect(hiddenWebContents.executeJavaScript).not.toHaveBeenCalled();
    expect(hiddenWebContents.close).toHaveBeenCalledTimes(1);
  });

  test("does not reload when runtime navigated ahead of stale tab topology", async () => {
    const translated =
      "https://example.com/article#googtrans(en|zh-CN)";
    const stale =
      "https://example.com/article";
    const mainFrame = createFrame({
      id: 1,
      url: translated,
      html: "<!doctype html><title>Article</title><main>Translated</main>"
    });

    const { manager, webContents } = createManager(mainFrame);
    await Promise.resolve();
    webContents.loadURL.mockClear();

    manager.syncTopology({
      activeTabId: "tab-1",
      pages: [{
        tabId: "tab-1",
        address: stale,
        titleHint: "Article",
        isActive: true
      }]
    });

    expect(webContents.loadURL).not.toHaveBeenCalled();
    expect(manager.readPageState({ tabId: "tab-1" })?.address).toBe(translated);
  });

  test("does not reload after repeated stale topology frames following a guest navigation", async () => {
    const initial = "https://example.com/start";
    const navigated = "https://example.com/next";
    const mainFrame = createFrame({
      id: 1,
      url: initial,
      html: "<!doctype html><title>Start</title><main>Start</main>"
    });

    const { manager, webContents } = createManager(mainFrame);
    await Promise.resolve();
    webContents.loadURL.mockClear();

    mainFrame.url = navigated;
    mainFrame.origin = originFromUrl(navigated);
    webContents.emit("did-navigate", {}, navigated);

    manager.syncTopology({
      activeTabId: "tab-1",
      pages: [{
        tabId: "tab-1",
        address: initial,
        titleHint: "Start",
        isActive: true
      }]
    });
    manager.syncTopology({
      activeTabId: "tab-1",
      pages: [{
        tabId: "tab-1",
        address: initial,
        titleHint: "Start",
        isActive: true
      }]
    });

    expect(webContents.loadURL).not.toHaveBeenCalled();
    expect(manager.readPageState({ tabId: "tab-1" })?.address).toBe(navigated);
  });

  test("chrome navigate still loads a new address after guest owns the current URL", async () => {
    const initial = "https://example.com/start";
    const typed = "https://example.com/typed";
    const mainFrame = createFrame({
      id: 1,
      url: initial,
      html: "<!doctype html><title>Start</title><main>Start</main>"
    });

    const { manager, webContents } = createManager(mainFrame);
    await Promise.resolve();
    webContents.loadURL.mockClear();

    await manager.navigate({
      tabId: "tab-1",
      address: typed
    });

    expect(webContents.loadURL).toHaveBeenCalledWith(typed);
  });

  test("live agent navigate without a workspace tab stays off the visible page", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://example.com/start",
      html: "<!doctype html><title>Start</title><main>Start</main>"
    });
    let manager: ReturnType<typeof createManager>["manager"] | undefined;
    const publishEvent = vi.fn((event: { readonly kind: string; readonly tabId?: string; readonly address?: string; readonly embedded?: boolean; readonly title?: string }) => {
      if (
        manager === undefined
        || event.kind !== "request-open-tab"
        || event.embedded !== true
        || typeof event.tabId !== "string"
        || typeof event.address !== "string"
      ) {
        return;
      }
      manager.syncTopology({
        activeTabId: "tab-1",
        pages: [
          {
            tabId: "tab-1",
            address: "https://example.com/start",
            titleHint: "Start",
            isActive: true
          },
          {
            tabId: event.tabId,
            address: event.address,
            ...(event.title === undefined ? {} : { titleHint: event.title }),
            isActive: false,
            isVisible: true
          }
        ]
      });
    });
    const created = createManager(mainFrame, undefined, { publishEvent });
    manager = created.manager;
    const { webContents } = created;
    await Promise.resolve();
    webContents.loadURL.mockClear();

    const previewFrame = createFrame({
      id: 2,
      url: "about:blank",
      html: "<!doctype html><title>Preview</title><main>Preview</main>"
    });
    const previewWebContents = createWebContents(previewFrame);
    electronMock.webContentsQueue.push(previewWebContents);

    await manager.navigateAgentPage("preview-tab", {
      url: "https://example.com/preview",
      targetMode: "live",
      timeoutMs: 250
    });

    expect(webContents.loadURL).not.toHaveBeenCalled();
    expect(previewWebContents.loadURL).toHaveBeenCalledWith("https://example.com/preview");
    expect(electronMock.browserWindows).toHaveLength(0);
    expect(publishEvent.mock.calls.some(([event]) =>
      event.kind === "request-open-tab"
      && event.embedded === true
      && event.tabId === "preview-tab"
      && event.address === "about:blank"
    )).toBe(true);
  });

  test("does not reload user link navigation when stale topology echoes the old address", async () => {
    const initial = "https://example.com/start";
    const navigated = "https://example.com/next";
    const mainFrame = createFrame({
      id: 1,
      url: initial,
      html: "<!doctype html><title>Start</title><main>Start</main>"
    });

    const { manager, webContents } = createManager(mainFrame);
    await Promise.resolve();
    webContents.loadURL.mockClear();

    mainFrame.url = navigated;
    mainFrame.origin = originFromUrl(navigated);
    webContents.emit("did-navigate", {}, navigated);

    manager.syncTopology({
      activeTabId: "tab-1",
      pages: [{
        tabId: "tab-1",
        address: initial,
        titleHint: "Start",
        isActive: true
      }]
    });

    expect(webContents.loadURL).not.toHaveBeenCalled();
    expect(manager.readPageState({ tabId: "tab-1" })?.address).toBe(navigated);
  });

  test("does not reload Cloudflare challenge token variants from topology sync", async () => {
    const tokenA =
      "https://www.dmit.io/clientarea.php?__cf_chl_rt_tk=first-token";
    const tokenB =
      "https://www.dmit.io/clientarea.php?__cf_chl_rt_tk=second-token";
    const mainFrame = createFrame({
      id: 1,
      url: tokenA,
      html: "<!doctype html><title>Cloudflare</title><main>Checking...</main>"
    });

    const { manager, webContents } = createManager(mainFrame);
    await Promise.resolve();
    webContents.loadURL.mockClear();

    manager.syncTopology({
      activeTabId: "tab-1",
      pages: [{
        tabId: "tab-1",
        address: tokenB,
        titleHint: "Cloudflare",
        isActive: true
      }]
    });

    expect(webContents.loadURL).not.toHaveBeenCalled();
    expect(manager.readPageState({ tabId: "tab-1" })?.address).toBe(tokenA);
  });

  test("reuses an active elevated browser tab instead of reopening it", async () => {
    const publishEvent = vi.fn();
    const mainFrame = createFrame({
      id: 1,
      url: "https://www.dmit.io/clientarea.php",
      html: "<!doctype html><title>DMIT</title><main>Login</main>"
    });
    const { manager } = createManager(mainFrame, undefined, { publishEvent });
    const shadowFrame = createFrame({
      id: 101,
      url: "about:blank",
      html: "<!doctype html><title>Shadow</title><main>Shadow</main>"
    });
    const shadowWebContents = createWebContents(shadowFrame);
    electronMock.webContentsQueue.push(shadowWebContents);

    const first = await manager.elevateAgentPage("tab-1", {
      reason: "captcha"
    });
    const second = await manager.elevateAgentPage("tab-1", {
      reason: "captcha"
    });

    expect(first.liveTabId).toBeTruthy();
    expect(second.liveTabId).toBe(first.liveTabId);
    expect(shadowWebContents.loadURL).toHaveBeenCalledTimes(1);
    expect(electronMock.browserWindows).toHaveLength(1);
    const openEvents = publishEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.kind === "request-open-tab");
    expect(openEvents).toHaveLength(1);
    expect(openEvents[0]).toMatchObject({
      tabId: first.liveTabId,
      address: "https://www.dmit.io/clientarea.php"
    });
  });

  test("maps and acts on open shadow root controls", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/shadow",
      html: "<!doctype html><title>Shadow</title><semantic-widget></semantic-widget>"
    });
    const host = mainFrame.window.document.querySelector("semantic-widget");
    expect(host).toBeInstanceOf(mainFrame.window.HTMLElement);
    setRect(host as Element, { x: 12, y: 18, width: 260, height: 96 });
    const shadow = (host as HTMLElement).attachShadow({ mode: "open" });
    shadow.innerHTML = "<button>Shadow save</button><input aria-label=\"Shadow name\" />";
    const button = shadow.querySelector("button");
    const input = shadow.querySelector("input");
    expect(button).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    expect(input).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(button as Element, { x: 24, y: 30, width: 120, height: 32 });
    setRect(input as Element, { x: 24, y: 72, width: 180, height: 32 });

    const { manager, webContents } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    const shadowButton = findByLabel(observation.elements, "Shadow save");
    const shadowInput = findByLabel(observation.elements, "Shadow name");
    expect(shadowButton.discoveryScope).toBe("shadow");
    expect(shadowInput.discoveryScope).toBe("shadow");
    expect(shadowButton.hostChainFingerprint).toBeTruthy();
    expect(shadowButton.actionCapabilities).toContain("click");
    expect(shadowInput.actionCapabilities).toContain("type");
    expect(observation.semanticTree?.nodes.find((node) => node.targetRef === shadowButton.targetRef)).toMatchObject({
      treeScope: "shadow",
      hostChain: expect.arrayContaining(["semantic-widget"])
    });

    await expect(
      manager.actOnAgentElement("tab-1", {
        targetMode: "live",
        targetRef: shadowButton.targetRef,
        interaction: "click"
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: shadowButton.targetRef
    });
    expect(webContents.sentInputEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mouseDown",
          x: 84,
          y: 46
        })
      ])
    );

    await expect(
      manager.typeIntoAgentElement("tab-1", {
        targetMode: "live",
        targetRef: shadowInput.targetRef,
        text: "Ada",
        clear: true
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: shadowInput.targetRef
    });
    expect((input as HTMLInputElement).value).toBe("Ada");
  });

  test("maps named interactive controls without a second full-document CDP scan", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/quick",
      html: "<!doctype html><title>Quick</title><button>Save</button><input aria-label=\"Name\" />"
    });
    const button = mainFrame.window.document.querySelector("button");
    const input = mainFrame.window.document.querySelector("input");
    expect(button).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    expect(input).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(button as Element, { x: 24, y: 40, width: 96, height: 32 });
    setRect(input as Element, { x: 24, y: 88, width: 160, height: 32 });

    const { manager, webContents } = createManager(mainFrame);
    mainFrame.executeJavaScript.mockClear();

    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });

    expect(observation).toMatchObject({
      strategy: "interactiveOnly",
      title: "Quick"
    });
    expect(observation.elements.map((element) => element.label)).toEqual(["Save", "Name"]);
    const scripts = mainFrame.executeJavaScript.mock.calls.map((call) => String(call[0]));
    expect(scripts.filter((script) => script.includes("const INCLUDE_CHILD_FRAMES = true"))).toHaveLength(1);
    expect(scripts.some((script) => script.includes("role='tooltip'"))).toBe(false);
    expect(webContents.debugger.attach).not.toHaveBeenCalled();
    expect(
      webContents.debugger.sendCommand.mock.calls.some(
        ([method, params]) =>
          method === "DOMSnapshot.captureSnapshot"
          && (params as { includePaintOrder?: boolean })?.includePaintOrder === true
      )
    ).toBe(false);
    expect(webContents.debugger.sendCommand).not.toHaveBeenCalledWith("Accessibility.getFullAXTree");
  });

  test("interactive map collapses nested chrome and lists needs-scroll separately", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/lists",
      html: "<!doctype html><title>Lists</title><button aria-label=\"Save\"><span role=\"button\">icon</span></button><button>Footer</button>"
    });
    const [save, footer] = Array.from(mainFrame.window.document.querySelectorAll("button"));
    const inner = mainFrame.window.document.querySelector("span[role='button']");
    expect(save).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    expect(footer).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    expect(inner).toBeInstanceOf(mainFrame.window.HTMLSpanElement);
    setRect(save as Element, { x: 24, y: 40, width: 96, height: 32 });
    setRect(inner as Element, { x: 36, y: 46, width: 64, height: 16 });
    setRect(footer as Element, { x: 24, y: 900, width: 96, height: 32 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });

    expect(observation.elements.map((element) => element.label)).toEqual(["Save", "Footer"]);
    expect(observation.inViewport?.map((element) => element.label)).toEqual(["Save"]);
    expect(observation.needsScroll?.map((element) => element.label)).toEqual(["Footer"]);
    expect(observation.mapAppendix).toContain("Now operable:");
    expect(observation.mapAppendix).toContain("Also on this page:");
    expect(observation.mapAppendix).toContain("Footer");
    expect(observation.elements.some((element) => element.tagName.toLowerCase() === "span")).toBe(false);
  });

  test("keeps a sidebar footer when the column inherits one pointer cursor", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/sidebar",
      html: "<!doctype html><title>Sidebar</title><aside style=\"cursor:pointer\"><a href=\"/chat\">History</a><div id=\"account\" style=\"cursor:pointer\">Account<img alt=\"\"><button type=\"button\">More</button></div></aside>"
    });
    const aside = mainFrame.window.document.querySelector("aside");
    const link = mainFrame.window.document.querySelector("a");
    const account = mainFrame.window.document.querySelector("#account");
    const avatar = mainFrame.window.document.querySelector("img");
    const more = mainFrame.window.document.querySelector("button");
    expect(aside).toBeInstanceOf(mainFrame.window.HTMLElement);
    expect(link).toBeInstanceOf(mainFrame.window.HTMLAnchorElement);
    expect(account).toBeInstanceOf(mainFrame.window.HTMLDivElement);
    expect(avatar).toBeInstanceOf(mainFrame.window.HTMLImageElement);
    expect(more).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    setRect(aside as Element, { x: 0, y: 0, width: 240, height: 700 });
    setRect(link as Element, { x: 12, y: 40, width: 200, height: 28 });
    setRect(account as Element, { x: 12, y: 640, width: 216, height: 44 });
    setRect(avatar as Element, { x: 24, y: 648, width: 28, height: 28 });
    setRect(more as Element, { x: 180, y: 650, width: 28, height: 28 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });

    expect(observation.elements.map((element) => element.label)).toEqual(expect.arrayContaining(["History", "More"]));
  });

  test("keeps each toggle's own on or off when they sit in one pointer row", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/composer",
      html: "<!doctype html><title>Composer</title><div id=\"bar\" style=\"cursor:pointer\"><div id=\"think\" style=\"cursor:pointer\" aria-pressed=\"true\"><span id=\"think-label\">DeepThink</span></div><div id=\"search\" style=\"cursor:pointer\" aria-pressed=\"false\"><span id=\"search-label\">Search</span></div></div>"
    });
    const bar = mainFrame.window.document.querySelector("#bar");
    const think = mainFrame.window.document.querySelector("#think");
    const search = mainFrame.window.document.querySelector("#search");
    const thinkLabel = mainFrame.window.document.querySelector("#think-label");
    const searchLabel = mainFrame.window.document.querySelector("#search-label");
    setRect(bar as Element, { x: 20, y: 400, width: 220, height: 36 });
    setRect(think as Element, { x: 28, y: 404, width: 96, height: 28 });
    setRect(search as Element, { x: 132, y: 404, width: 80, height: 28 });
    setRect(thinkLabel as Element, { x: 36, y: 408, width: 72, height: 20 });
    setRect(searchLabel as Element, { x: 140, y: 408, width: 56, height: 20 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });
    const labels = observation.elements.map((element) => element.label);
    expect(labels).toEqual(expect.arrayContaining(["DeepThink", "Search"]));
    expect(labels.some((label) => label.includes("DeepThink Search"))).toBe(false);
    expect(observation.elements.find((element) => element.label === "DeepThink")?.tagName).toBe("div");
    expect(observation.elements.find((element) => element.label === "DeepThink")?.stateHint).toBe("pressed");
    expect(observation.elements.find((element) => element.label === "Search")?.stateHint).toBe("unpressed");
  });

  test("finds and semantically locates page text before returning nearby controls", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/settings",
      html: `
        <!doctype html>
        <title>Settings</title>
        <button id="top">Global save</button>
        <section>
          <h2 id="billing-title">Billing settings</h2>
          <p id="billing-copy">Invoices and payment method are managed here.</p>
          <button id="edit-billing">Edit billing</button>
          <input aria-label="Billing email" />
        </section>
      `
    });
    const topButton = mainFrame.window.document.querySelector("#top");
    const title = mainFrame.window.document.querySelector("#billing-title");
    const copy = mainFrame.window.document.querySelector("#billing-copy");
    const editButton = mainFrame.window.document.querySelector("#edit-billing");
    const input = mainFrame.window.document.querySelector("input");
    expect(topButton).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    expect(title).toBeInstanceOf(mainFrame.window.HTMLElement);
    expect(copy).toBeInstanceOf(mainFrame.window.HTMLElement);
    expect(editButton).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    expect(input).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(topButton as Element, { x: 24, y: 40, width: 120, height: 32 });
    setRect(title as Element, { x: 40, y: 280, width: 220, height: 34 });
    setRect(copy as Element, { x: 40, y: 320, width: 420, height: 44 });
    setRect(editButton as Element, { x: 40, y: 382, width: 120, height: 32 });
    setRect(input as Element, { x: 180, y: 382, width: 180, height: 32 });

    const { manager, webContents } = createManager(mainFrame);

    await expect(
      manager.findAgentPage("tab-1", {
        targetMode: "live",
        query: "payment method",
        reveal: true
      })
    ).resolves.toMatchObject({
      ok: true,
      kind: "lyraLumenFind",
      totalMatches: 1,
      currentIndex: 1,
      revealRect: expect.objectContaining({ top: 320 })
    });
    expect(webContents.findInPage).toHaveBeenCalledWith(
      "payment method",
      expect.objectContaining({ findNext: false })
    );

    const located = await manager.locateAgentPage("tab-1", {
      targetMode: "live",
      query: "billing settings",
      matchMode: "semantic",
      reveal: true,
      autoMap: true,
      nearbyLimit: 3
    });

    expect(located).toMatchObject({
      ok: true,
      kind: "lyraLumenLocate",
      matched: true,
      matchMode: "semantic",
      anchorQuery: expect.stringContaining("Billing"),
      observationId: expect.any(String)
    });
    expect(located.nearbyElements?.map((element) => element.label)).toEqual([
      "Edit billing",
      "Billing email",
      "Global save"
    ]);
  });

  test("maps same-origin iframe controls and clicks by child frame bounds", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/parent",
      html: "<!doctype html><title>Parent</title><iframe name=\"checkout\" src=\"https://app.test/child\"></iframe>"
    });
    const childFrame = createFrame({
      id: 2,
      url: "https://app.test/child",
      name: "checkout",
      parent: mainFrame,
      html: "<!doctype html><title>Child</title><button>Pay now</button>"
    });
    appendChildFrame(mainFrame, childFrame);
    const iframe = mainFrame.window.document.querySelector("iframe");
    const payButton = childFrame.window.document.querySelector("button");
    expect(iframe).toBeInstanceOf(mainFrame.window.HTMLIFrameElement);
    expect(payButton).toBeInstanceOf(childFrame.window.HTMLButtonElement);
    setRect(iframe as Element, { x: 100, y: 80, width: 320, height: 200 });
    setRect(payButton as Element, { x: 12, y: 16, width: 120, height: 30 });

    const { manager, webContents } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    const payTarget = findByLabel(observation.elements, "Pay now");
    expect(payTarget.frameTreeNodeId).toBe(2);
    expect(payTarget.bounds).toEqual({ x: 112, y: 96, width: 120, height: 30 });
    expect(observation.semanticTree?.frames.find((frame) => frame.frameTreeNodeId === 2)).toMatchObject({
      parentFrameTreeNodeId: 1,
      ownerSelectorPreview: "iframe[name=\"checkout\"]",
      bounds: { x: 100, y: 80, width: 320, height: 200 },
      domAccess: "direct"
    });

    await expect(
      manager.actOnAgentElement("tab-1", {
        targetMode: "live",
        targetRef: payTarget.targetRef,
        interaction: "click"
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: payTarget.targetRef
    });
    expect(webContents.sentInputEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mouseDown",
          x: 172,
          y: 111
        })
      ])
    );
  });

  test("sends two Chromium click sequences for double click", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/double-click",
      html: "<!doctype html><title>Double Click</title><button>Open file</button>"
    });
    const button = mainFrame.window.document.querySelector("button");
    expect(button).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    setRect(button as Element, { x: 40, y: 40, width: 80, height: 30 });

    const { manager, webContents } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const openTarget = findByLabel(observation.elements, "Open file");

    await expect(
      manager.actOnAgentElement("tab-1", {
        targetMode: "live",
        targetRef: openTarget.targetRef,
        interaction: "doubleClick"
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: openTarget.targetRef
    });

    expect(webContents.sentInputEvents).toEqual([
      expect.objectContaining({ type: "mouseMove", x: 80, y: 55, clickCount: 1 }),
      expect.objectContaining({ type: "mouseDown", x: 80, y: 55, button: "left", clickCount: 1 }),
      expect.objectContaining({ type: "mouseUp", x: 80, y: 55, button: "left", clickCount: 1 }),
      expect.objectContaining({ type: "mouseDown", x: 80, y: 55, button: "left", clickCount: 2 }),
      expect.objectContaining({ type: "mouseUp", x: 80, y: 55, button: "left", clickCount: 2 })
    ]);
  });

  test("uses fast action verification by default and full verification only when requested", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/fast-action",
      html: "<!doctype html><title>Fast</title><button>Save</button>"
    });
    const button = mainFrame.window.document.querySelector("button");
    expect(button).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    setRect(button as Element, { x: 32, y: 48, width: 100, height: 30 });

    const { manager, webContents } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const saveTarget = findByLabel(observation.elements, "Save");

    mainFrame.executeJavaScript.mockClear();
    webContents.executeJavaScript.mockClear();

    const fastResult = await manager.actOnAgentElement("tab-1", {
      targetMode: "live",
      targetRef: saveTarget.targetRef,
      interaction: "click"
    });

    expect(fastResult).toMatchObject({
      ok: true,
      targetRef: saveTarget.targetRef,
      verification: "none"
    });
    expect(fastResult.afterObservationId).toBeUndefined();
    expect(fastResult.elementDiff ?? fastResult.diffUnavailable).toBeTruthy();
    expect(mainFrame.executeJavaScript.mock.calls.some((call) => String(call[0]).includes("element_not_found"))).toBe(true);
    expect(mainFrame.executeJavaScript.mock.calls.some((call) => String(call[0]).includes("defaultView.innerWidth"))).toBe(true);
    expect(
      webContents.executeJavaScript.mock.calls.filter(
        (call) => String(call[0]).includes("__lyra_agent_page_cursor__") === false
      )
    ).toHaveLength(0);
    expect(
      webContents.executeJavaScript.mock.calls.some(
        (call) => String(call[0]).includes("__lyra_agent_page_cursor__")
      )
    ).toBe(true);

    const fullResult = await manager.actOnAgentElement("tab-1", {
      targetMode: "live",
      targetRef: saveTarget.targetRef,
      interaction: "click",
      verification: "full"
    });

    expect(fullResult).toMatchObject({
      ok: true,
      targetRef: saveTarget.targetRef,
      verification: "full"
    });
    expect(fullResult.afterObservationId).toBeTruthy();
  });

  test("splits full verification codes across segmented one-character inputs", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://github.com/login/device",
      html: `
        <!doctype html>
        <title>Device Activation</title>
        <form>
          ${Array.from({ length: 8 }, (_, index) =>
            `<input aria-label="User code ${index}" maxlength="1" inputmode="text" />`
          ).join("")}
          <button>Continue</button>
        </form>
      `
    });
    const inputs = Array.from(mainFrame.window.document.querySelectorAll("input"));
    for (const [index, input] of inputs.entries()) {
      setRect(input, { x: 40 + index * 36, y: 80, width: 28, height: 36 });
    }
    const button = mainFrame.window.document.querySelector("button");
    expect(button).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    setRect(button as Element, { x: 40, y: 132, width: 180, height: 36 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const firstCodeInput = findByLabel(observation.elements, "User code 0");

    await expect(
      manager.typeIntoAgentElement("tab-1", {
        targetMode: "live",
        targetRef: firstCodeInput.targetRef,
        text: "2514-091A",
        clear: true
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: firstCodeInput.targetRef
    });
    expect(inputs.map((input) => input.value)).toEqual(["2", "5", "1", "4", "0", "9", "1", "A"]);
  });

  test("keeps full verification codes in a single ordinary code input", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://example.com/login/device",
      html: `
        <!doctype html>
        <title>Device Activation</title>
        <label>
          Verification code
          <input aria-label="Verification code" inputmode="text" />
        </label>
      `
    });
    const input = mainFrame.window.document.querySelector("input");
    expect(input).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(input as Element, { x: 40, y: 80, width: 220, height: 36 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const codeInput = findByLabel(observation.elements, "Verification code");

    await expect(
      manager.typeIntoAgentElement("tab-1", {
        targetMode: "live",
        targetRef: codeInput.targetRef,
        text: "2514-091A",
        clear: true
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: codeInput.targetRef
    });
    expect(input?.value).toBe("2514-091A");
  });

  test("returns the final input value and avoids duplicating an already matching value", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://ip112.cn/",
      html: `
        <!doctype html>
        <title>IP availability</title>
        <label>
          IP地址或域名
          <input aria-label="IP地址或域名" />
        </label>
      `
    });
    const input = mainFrame.window.document.querySelector("input");
    expect(input).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(input as Element, { x: 40, y: 80, width: 260, height: 36 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });
    const ipInput = findByLabel(observation.elements, "IP地址或域名");

    const firstResult = await manager.typeIntoAgentElement("tab-1", {
      targetMode: "live",
      targetRef: ipInput.targetRef,
      text: "64.186.233.226",
      clear: true
    });
    expect(firstResult).toMatchObject({
      ok: true,
      inputValuePreview: "64.186.233.226",
      inputTextChanged: true
    });

    const secondResult = await manager.typeIntoAgentElement("tab-1", {
      targetMode: "live",
      targetRef: ipInput.targetRef,
      text: "64.186.233.226"
    });
    expect(secondResult).toMatchObject({
      ok: true,
      inputValuePreview: "64.186.233.226",
      inputTextChanged: false,
      inputAlreadyMatched: true
    });
    expect(input?.value).toBe("64.186.233.226");
  });

  test("types into text inputs using stable locators when observation-local ids drift", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://github.com/petehsu/KiroProxy/settings/branch_protection_rules/new",
      html: `
        <!doctype html>
        <title>Branch protection</title>
        <form>
          ${Array.from({ length: 44 }, (_, index) =>
            `<label><input type="checkbox" name="opt-${index}" /> Option ${index}</label>`
          ).join("")}
          <label>
            Branch name pattern
            <input id="rule_field" class="form-control long" name="rule" type="text" />
          </label>
        </form>
      `
    });
    const checkboxes = Array.from(mainFrame.window.document.querySelectorAll("input[type='checkbox']"));
    for (const [index, checkbox] of checkboxes.entries()) {
      setRect(checkbox, { x: 40, y: 40 + index * 28, width: 16, height: 16 });
    }
    const textInput = mainFrame.window.document.querySelector("#rule_field");
    expect(textInput).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(textInput as Element, { x: 313, y: 440, width: 653, height: 32 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const branchInput = observation.elements.find(
      (element) => element.selectorPreview.includes("#rule_field") && element.inputType === "text"
    );
    expect(branchInput).toBeTruthy();

    await expect(
      manager.typeIntoAgentElement("tab-1", {
        targetMode: "live",
        targetRef: branchInput!.targetRef,
        text: "main",
        clear: true
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: branchInput!.targetRef,
      inputValuePreview: "main",
      inputTextChanged: true
    });
    expect((textInput as HTMLInputElement).value).toBe("main");
  });

  test("returns coordinate fallback target and allows act for cross-origin iframe", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://merchant.test/checkout",
      html: "<!doctype html><title>Checkout</title><iframe name=\"pay\" src=\"https://pay.example/auth\"></iframe>"
    });
    const childWindow = createWindow("<!doctype html><title>Pay</title>", "https://pay.example/auth");
    const childFrame = createFrame({
      id: 2,
      url: "https://pay.example/auth",
      name: "pay",
      parent: mainFrame,
      html: "<!doctype html><title>Pay</title>",
      executeJavaScript: (script) => {
        if (script.includes("const FRAME_TREE_NODE_ID")) {
          throw new Error("cross origin frame execution blocked");
        }
        return childWindow.eval(script);
      }
    });
    appendChildFrame(mainFrame, childFrame);
    const iframe = mainFrame.window.document.querySelector("iframe");
    expect(iframe).toBeInstanceOf(mainFrame.window.HTMLIFrameElement);
    setRect(iframe as Element, { x: 240, y: 140, width: 360, height: 220 });

    const { manager, webContents } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    expect(observation.blockedRegions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "visual-fallback",
          frameTreeNodeId: 2,
          bounds: { x: 240, y: 140, width: 360, height: 220 },
          fallback: "coordinate"
        })
      ])
    );
    const coordinateTarget = observation.elements.find((element) => element.discoveryScope === "coordinate");
    expect(coordinateTarget).toBeDefined();
    expect(coordinateTarget).toMatchObject({
      frameTreeNodeId: 2,
      frameBounds: { x: 240, y: 140, width: 360, height: 220 },
      bounds: { x: 400, y: 230, width: 40, height: 40 }
    });
    expect(observation.semanticTree?.coverage.visualCoverage).toBe(0);
    expect(observation.nextRecommendedAction).toBe("lyra_lumen.act");
    expect(coordinateTarget?.actionHint).toBe("use_coordinate_act");
    expect(coordinateTarget?.actionCapabilities).toEqual(["click"]);

    await expect(
      manager.actOnAgentElement("tab-1", {
        targetMode: "live",
        targetRef: coordinateTarget!.targetRef,
        interaction: "click"
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: coordinateTarget!.targetRef
    });
    expect(webContents.sentInputEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mouseDown",
          x: 420,
          y: 250
        })
      ])
    );
  });

  test("maps cross-origin iframe controls via OOPIF CDP attach", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://merchant.test/checkout",
      html: "<!doctype html><title>Checkout</title><iframe name=\"pay\" src=\"https://pay.example/auth\"></iframe>"
    });
    const childFrame = createFrame({
      id: 2,
      url: "https://pay.example/auth",
      name: "pay",
      parent: mainFrame,
      html: "<!doctype html><title>Pay</title><button>Pay now</button>",
      executeJavaScript: (script) => {
        // The frame observation script must go through the CDP attach below;
        // direct main-frame probes of a cross-origin frame stay blocked.
        if (script.includes("const FRAME_TREE_NODE_ID")) {
          throw new Error("cross origin frame execution blocked");
        }
        return childFrame.window.eval(script);
      }
    });
    appendChildFrame(mainFrame, childFrame);
    const iframe = mainFrame.window.document.querySelector("iframe");
    const payButton = childFrame.window.document.querySelector("button");
    expect(iframe).toBeInstanceOf(mainFrame.window.HTMLIFrameElement);
    expect(payButton).toBeInstanceOf(childFrame.window.HTMLButtonElement);
    setRect(iframe as Element, { x: 240, y: 140, width: 360, height: 220 });
    setRect(payButton as Element, { x: 12, y: 16, width: 120, height: 30 });

    const { manager, webContents } = createManager(mainFrame, {
      sendCommand: async (method, params, sessionId) => {
        if (method === "Target.getTargets") {
          return {
            targetInfos: [{ type: "iframe", targetId: "oopif-target", url: "https://pay.example/auth" }]
          };
        }
        if (method === "Target.attachToTarget") {
          return { sessionId: "oopif-session" };
        }
        if (method === "Runtime.evaluate" && sessionId === "oopif-session") {
          // The attached OOPIF session evaluates inside the child frame's own
          // JavaScript world, which also stamps the surface node registry.
          const expression = typeof params?.expression === "string" ? params.expression : "";
          return { result: { value: await childFrame.window.eval(expression) } };
        }
        if (method === "Accessibility.getFullAXTree") {
          return { nodes: [] };
        }
        if (method === "DOMSnapshot.captureSnapshot") {
          return { documents: [], strings: [], computedStyles: [] };
        }
        return {};
      }
    });

    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    const payTarget = findByLabel(observation.elements, "Pay now");
    expect(payTarget.discoveryScope).toBe("frame");
    expect(payTarget.bounds).toEqual({ x: 252, y: 156, width: 120, height: 30 });
    expect(observation.blockedRegions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cross-origin",
          frameTreeNodeId: 2
        })
      ])
    );

    await expect(
      manager.actOnAgentElement("tab-1", {
        targetMode: "live",
        targetRef: payTarget.targetRef,
        interaction: "click"
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: payTarget.targetRef
    });
    expect(webContents.sentInputEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "mouseDown",
          x: 312,
          y: 171
        })
      ])
    );
  });

  test("does not treat a visible Google sign-in trigger as an auth prompt", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://dmit.io/clientarea",
      html: `
        <!doctype html>
        <title>Client Area</title>
        <button>Sign in with Google</button>
        <iframe
          title="Sign in with Google"
          src="https://accounts.google.com/gsi/button?client_id=client.test"
        ></iframe>
      `
    });
    const iframe = mainFrame.window.document.querySelector("iframe");
    expect(iframe).toBeInstanceOf(mainFrame.window.HTMLIFrameElement);
    setRect(iframe as Element, { x: 620, y: 60, width: 380, height: 44 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    expect(observation.authChallengeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "oauth_popup",
          confidence: "medium",
          label: expect.stringContaining("trigger")
        })
      ])
    );
    expect(observation.authChallengeSignals?.some((signal) => signal.confidence === "high")).not.toBe(true);
    expect(observation.blockedRegions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "auth-prompt" })
      ])
    );
    expect(observation.nextRecommendedAction).not.toBe("lyra_lumen_elevate");
  });

  test("detects visible Google account iframe as an AX auth prompt", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://dmit.io/clientarea",
      html: `
        <!doctype html>
        <title>Client Area</title>
        <form>
          <input aria-label="Email Address" />
          <input aria-label="Password" type="password" />
          <button>Login</button>
        </form>
        <button>Sign in with Google</button>
        <iframe
          title="Sign in to dmit.io with Google"
          src="https://accounts.google.com/gsi/iframe/select?client_id=client.test"
        ></iframe>
      `
    });
    const iframe = mainFrame.window.document.querySelector("iframe");
    expect(iframe).toBeInstanceOf(mainFrame.window.HTMLIFrameElement);
    setRect(iframe as Element, { x: 620, y: 60, width: 380, height: 180 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    expect(observation.authChallengeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "oauth_popup",
          confidence: "high",
          source: "frame",
          label: "Google identity prompt",
          url: expect.stringContaining("accounts.google.com/gsi"),
          bounds: { x: 620, y: 60, width: 380, height: 180 }
        })
      ])
    );
    expect(observation.blockedRegions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "auth-prompt",
          fallback: "ax",
          confidence: "high",
          bounds: { x: 620, y: 60, width: 380, height: 180 },
          url: expect.stringContaining("accounts.google.com/gsi")
        })
      ])
    );
    expect(observation.nextRecommendedAction).toBe("browser_ax.map");
  });

  test("does not block automation for a dormant visible file input", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://user.qzone.qq.com/3434993851",
      html: `
        <!doctype html>
        <title>QQ Space</title>
        <textarea placeholder="说点儿什么吧"></textarea>
        <label>本地相册<input type="file" accept="image/*" /></label>
      `
    });
    const fileInput = mainFrame.window.document.querySelector("input[type='file']");
    expect(fileInput).toBeInstanceOf(mainFrame.window.HTMLInputElement);
    setRect(fileInput as Element, { x: 120, y: 420, width: 120, height: 28 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });

    expect(observation.authChallengeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "dormant_file_input",
          confidence: "low",
          label: "dormant page upload control"
        })
      ])
    );
    expect(observation.blockedRegions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "permission-prompt" })
      ])
    );
    expect(observation.warnings).toEqual(
      expect.arrayContaining([expect.stringContaining("dormant_file_input")])
    );
    expect(observation.nextRecommendedAction).not.toBe("ask_user");
  });

  test("detects a captcha iframe without pausing the agent", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/login",
      html: `
        <!doctype html>
        <title>Login</title>
        <button>Sign in</button>
        <iframe src="https://www.google.com/recaptcha/api2/anchor"></iframe>
      `
    });
    const iframe = mainFrame.window.document.querySelector("iframe");
    expect(iframe).toBeInstanceOf(mainFrame.window.HTMLIFrameElement);
    setRect(iframe as Element, { x: 120, y: 180, width: 304, height: 78 });

    const { manager } = createManager(mainFrame);
    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "interactiveOnly"
    });

    expect(observation.authChallengeSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "captcha",
          confidence: "high",
          source: "frame"
        })
      ])
    );
    expect(observation.needsUserAction).toBeUndefined();
    expect(observation.nextRecommendedAction).not.toBe("ask_user");
    expect(observation.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining("captcha_detected")
      ])
    );
  });

  test("visual point action converts screenshot device pixels to css coordinates", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/visual",
      html: "<!doctype html><title>Visual</title><button id=\"hit\">Hit</button>"
    });
    Object.defineProperty(mainFrame.window, "devicePixelRatio", { configurable: true, value: 2 });
    const hit = mainFrame.window.document.querySelector("#hit");
    expect(hit).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    setRect(hit as Element, { x: 90, y: 40, width: 80, height: 40 });

    const { manager, webContents } = createManager(mainFrame, undefined, { withWindow: true });
    manager.syncLayout({
      coordinateSpace: "workbench",
      windowWidth: 1_280,
      windowHeight: 720,
      layouts: [{
        tabId: "tab-1",
        x: 0,
        y: 0,
        width: 1_280,
        height: 720,
        visible: true,
        zIndex: 0,
        isFocusedPane: true
      }]
    });
    webContents.capturePage.mockResolvedValueOnce({
      getSize: () => ({ width: 2_560, height: 1_440 }),
      toPNG: () => Buffer.from("visual")
    });
    const capture = await manager.captureAgentPage("tab-1", { targetMode: "live" });
    expect(capture.visualFrame).toMatchObject({
      dpr: 2,
      cssViewportWidth: 1_280,
      cssViewportHeight: 720,
      imageWidth: 2_560,
      imageHeight: 1_440
    });

    const result = await manager.actOnAgentVisualPoint("tab-1", {
      targetMode: "live",
      captureId: capture.visualFrame!.captureId,
      point: { x: 200, y: 100, reason: "hit button" },
      interaction: "click"
    });

    expect(result).toMatchObject({
      ok: true,
      kind: "lyraLumenActionResult",
      x: 100,
      y: 50
    });
    expect(webContents.sentInputEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "mouseUp", x: 100, y: 50 })
      ])
    );
  });

  test("visual point action rejects stale captures after layout resize", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/visual-stale",
      html: "<!doctype html><title>Visual stale</title><button id=\"hit\">Hit</button>"
    });
    Object.defineProperty(mainFrame.window, "devicePixelRatio", { configurable: true, value: 2 });
    const { manager, webContents } = createManager(mainFrame, undefined, { withWindow: true });
    manager.syncLayout({
      coordinateSpace: "workbench",
      windowWidth: 1_280,
      windowHeight: 720,
      layouts: [{
        tabId: "tab-1",
        x: 0,
        y: 0,
        width: 1_280,
        height: 720,
        visible: true,
        zIndex: 0,
        isFocusedPane: true
      }]
    });
    webContents.capturePage.mockResolvedValueOnce({
      getSize: () => ({ width: 2_560, height: 1_440 }),
      toPNG: () => Buffer.from("visual")
    });
    const capture = await manager.captureAgentPage("tab-1", { targetMode: "live" });

    manager.syncLayout({
      coordinateSpace: "workbench",
      windowWidth: 1_280,
      windowHeight: 720,
      layouts: [{
        tabId: "tab-1",
        x: 0,
        y: 0,
        width: 960,
        height: 540,
        visible: true,
        zIndex: 0,
        isFocusedPane: true
      }]
    });

    const result = await manager.actOnAgentVisualPoint("tab-1", {
      targetMode: "live",
      captureId: capture.visualFrame!.captureId,
      point: { x: 200, y: 100, reason: "hit button" },
      interaction: "click"
    });

    expect(result).toMatchObject({
      ok: false,
      kind: "lyraLumenVactStale",
      reason: "viewport_resized",
      nextRecommendedAction: "lyra_lumen.see"
    });
    expect(webContents.sentInputEvents).toEqual([]);
  });

  test("discovers portal menuitems after hover reveal", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/menu",
      html: "<!doctype html><title>Menu</title><button id=\"more\" aria-haspopup=\"menu\">More</button>"
    });
    const moreButton = mainFrame.window.document.querySelector("#more");
    expect(moreButton).toBeInstanceOf(mainFrame.window.HTMLButtonElement);
    setRect(moreButton as Element, { x: 40, y: 44, width: 90, height: 36 });
    moreButton?.addEventListener("mousemove", () => {
      if (mainFrame.window.document.querySelector("[role='menuitem']") !== null) {
        return;
      }
      const item = mainFrame.window.document.createElement("button");
      item.setAttribute("role", "menuitem");
      item.textContent = "Delete";
      setRect(item, { x: 44, y: 88, width: 120, height: 32 });
      mainFrame.window.document.body.appendChild(item);
    });

    const { manager } = createManager(mainFrame);
    const before = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const moreTarget = findByLabel(before.elements, "More");
    expect(before.elements.some((element) => element.label === "Delete")).toBe(false);

    await expect(
      manager.actOnAgentElement("tab-1", {
        targetMode: "live",
        targetRef: moreTarget.targetRef,
        interaction: "hover"
      })
    ).resolves.toMatchObject({
      ok: true,
      targetRef: moreTarget.targetRef
    });
    const after = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });
    const menuitem = findByLabel(after.elements, "Delete");
    expect(menuitem.role).toBe("menuitem");
    expect(menuitem.actionCapabilities).toEqual(expect.arrayContaining(["menuitem", "click"]));
  });

  test("reloadAgentPage calls webContents.reload even when the URL is unchanged", async () => {
    const shadowFrame = createFrame({
      id: 1,
      url: "https://app.test/dashboard",
      html: "<!doctype html><title>Dashboard</title><main>Before reload</main>"
    });
    const shadowWebContents = createWebContents(shadowFrame);
    electronMock.webContentsQueue.push(shadowWebContents);
    const manager = createEmptyManager();

    const result = await manager.reloadAgentPage("agent-tab", {
      targetMode: "isolated",
      timeoutMs: 2_000
    });

    expect(shadowWebContents.reload).toHaveBeenCalledTimes(1);
    expect(shadowWebContents.reloadIgnoringCache).not.toHaveBeenCalled();
    expect(shadowWebContents.loadURL).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      address: "https://app.test/dashboard",
      targetMode: "isolated",
      reloaded: true,
      ignoreCache: false
    });
  });

  test("reloadAgentPage can bypass cache when ignoreCache is true", async () => {
    const shadowFrame = createFrame({
      id: 1,
      url: "https://app.test/dashboard",
      html: "<!doctype html><title>Dashboard</title><main>Stale</main>"
    });
    const shadowWebContents = createWebContents(shadowFrame);
    electronMock.webContentsQueue.push(shadowWebContents);
    const manager = createEmptyManager();

    await manager.reloadAgentPage("agent-tab", {
      targetMode: "isolated",
      ignoreCache: true,
      timeoutMs: 2_000
    });

    expect(shadowWebContents.reloadIgnoringCache).toHaveBeenCalledTimes(1);
    expect(shadowWebContents.reload).not.toHaveBeenCalled();
  });

  test("navigateAgentPage does not reload when the target URL matches the current page", async () => {
    const shadowFrame = createFrame({
      id: 1,
      url: "https://app.test/dashboard",
      html: "<!doctype html><title>Dashboard</title><main>Still stale</main>"
    });
    const shadowWebContents = createWebContents(shadowFrame);
    electronMock.webContentsQueue.push(shadowWebContents);
    const manager = createEmptyManager();

    await expect(manager.navigateAgentPage("agent-tab", {
      targetMode: "isolated",
      url: "https://app.test/dashboard",
      timeoutMs: 2_000
    })).resolves.toMatchObject({ alreadyOpen: true });

    expect(shadowWebContents.loadURL).not.toHaveBeenCalled();
    expect(shadowWebContents.reload).not.toHaveBeenCalled();
  });

  test("framework router clicks a same-origin link and falls back to hard navigation", async () => {
    let routedFrame: FakeFrame;
    routedFrame = createFrame({
      id: 1,
      url: "https://app.test/start",
      html: "<!doctype html><title>Router</title><a href=\"/next\">Next</a>",
      executeJavaScript: (script) => {
        if (script.includes("document.querySelectorAll(\"a[href]\")")) {
          routedFrame.url = "https://app.test/next";
          routedFrame.origin = originFromUrl(routedFrame.url);
          return true;
        }
        return routedFrame.window.eval(script);
      }
    });
    const routed = createManager(routedFrame);
    await expect(routed.manager.navigate({
      address: "https://app.test/next",
      tabId: "tab-1",
      useFrameworkRouter: true
    })).resolves.toMatchObject({ address: "https://app.test/next" });
    expect(routed.webContents.loadURL).not.toHaveBeenCalled();

    const fallbackFrame = createFrame({
      id: 2,
      url: "https://app.test/start",
      html: "<!doctype html><title>Fallback</title><main>No matching link</main>"
    });
    const fallback = createManager(fallbackFrame);
    await fallback.manager.navigate({
      address: "https://app.test/missing",
      tabId: "tab-1",
      useFrameworkRouter: true
    });
    await vi.waitFor(() => {
      expect(fallback.webContents.loadURL).toHaveBeenCalledWith("https://app.test/missing");
    });
  });

  test("cancels stale page-load waits when isolated navigation is superseded", async () => {
    vi.useFakeTimers();
    try {
      const shadowFrame = createFrame({
        id: 1,
        url: "about:blank",
        html: "<!doctype html><title>Shadow</title><main>Loading</main>"
      });
      const shadowWebContents = createWebContents(shadowFrame, { hangLoad: true });
      electronMock.webContentsQueue.push(shadowWebContents);
      const manager = createEmptyManager();

      const firstNavigation = manager.navigateAgentPage("agent-tab", {
        targetMode: "isolated",
        url: "https://app.test/first",
        timeoutMs: 10_000
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(shadowWebContents.listenerCount("did-stop-loading")).toBe(2);

      const secondNavigation = manager.navigateAgentPage("agent-tab", {
        targetMode: "isolated",
        url: "https://app.test/second",
        timeoutMs: 1_000
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(shadowWebContents.stop).toHaveBeenCalledTimes(1);
      expect(shadowWebContents.listenerCount("did-stop-loading")).toBe(2);
      expect(shadowWebContents.listenerCount("did-fail-load")).toBe(1);

      await expect(firstNavigation).resolves.toMatchObject({
        targetMode: "isolated"
      });

      await vi.advanceTimersByTimeAsync(1_000);
      await expect(secondNavigation).resolves.toMatchObject({
        address: "https://app.test/second",
        targetMode: "isolated"
      });
      expect(shadowWebContents.listenerCount("did-stop-loading")).toBe(1);
      expect(shadowWebContents.listenerCount("did-fail-load")).toBe(0);
      expect(shadowWebContents.stop).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  test("degrades pageshot to visible capture without CDP by default", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/snapshot",
      html: "<!doctype html><title>Snapshot</title><main>Rendered snapshot text</main>"
    });
    const { manager, webContents } = createManager(mainFrame);

    const snapshot = await manager.readRenderedSnapshot({
      url: "https://app.test/snapshot",
      includePageshot: true,
      waitUntil: "html"
    });

    expect(webContents.debugger.attach).not.toHaveBeenCalled();
    expect(webContents.capturePage).toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      ok: true,
      kind: "workbenchBrowserRenderedSnapshot",
      finalUrl: "https://app.test/snapshot",
      pageshot: {
        mimeType: "image/png",
        visibleOnly: true
      },
      debug: {
        snapshotMode: "tabRenderer"
      }
    });
    expect((snapshot as { warnings?: Array<{ readonly code: string }> }).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "browser_pageshot_degraded" })
      ])
    );
  });

  test("returns AX elements only when explicitly requested", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/ax",
      html: "<!doctype html><title>AX</title><main><button>Save</button></main>"
    });
    const { manager, webContents } = createManager(mainFrame, {
      sendCommand: async (method) => {
        if (method === "Accessibility.getFullAXTree") {
          return {
            nodes: [{
              nodeId: "1",
              ignored: false,
              role: { value: "button" },
              name: { value: "Save" },
              backendDOMNodeId: 50,
              properties: []
            }]
          };
        }
        if (method === "DOM.getBoxModel") {
          return {
            model: {
              content: [10, 20, 90, 20, 90, 52, 10, 52]
            }
          };
        }
        return {};
      }
    });

    const withoutAx = await manager.readRenderedSnapshot({
      url: "https://app.test/ax",
      waitUntil: "html"
    }) as { readonly axElements?: readonly unknown[] };
    expect(withoutAx.axElements).toBeUndefined();
    expect(webContents.debugger.sendCommand).not.toHaveBeenCalledWith(
      "Accessibility.getFullAXTree"
    );

    const withAx = await manager.readRenderedSnapshot({
      url: "https://app.test/ax",
      waitUntil: "html",
      includeAxTree: true
    }) as {
      readonly axElements?: ReadonlyArray<{
        readonly refId: string;
        readonly role: string;
        readonly isInteractive: boolean;
      }>;
    };
    expect(withAx.axElements).toEqual([
      expect.objectContaining({
        refId: expect.stringMatching(/^ax:/u),
        role: "button",
        isInteractive: true
      })
    ]);
  });

  test("keeps viewport/mobile browser snapshots on the tab renderer unless explicitly enabled", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/mobile",
      html: "<!doctype html><title>Mobile</title><main>Mobile snapshot text</main>"
    });
    const { manager, webContents } = createManager(mainFrame);
    expect(electronMock.browserWindows).toHaveLength(0);

    const snapshot = await manager.readRenderedSnapshot({
      url: "https://app.test/mobile",
      includePageshot: true,
      mobile: true,
      viewport: { width: 390, height: 844, deviceScaleFactor: 3 },
      waitUntil: "html"
    });

    expect(electronMock.browserWindows).toHaveLength(0);
    expect(webContents.debugger.attach).not.toHaveBeenCalled();
    expect(webContents.capturePage).toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      ok: true,
      kind: "workbenchBrowserRenderedSnapshot",
      finalUrl: "https://app.test/mobile",
      pageshot: {
        visibleOnly: true
      },
      debug: {
        snapshotMode: "tabRenderer"
      }
    });
    expect((snapshot as { warnings?: Array<{ readonly code: string }> }).warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "browser_temporary_renderer_disabled" }),
        expect.objectContaining({ code: "browser_pageshot_degraded" })
      ])
    );
  });

  test("creates target refs for AX-only controls", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/ax-only",
      html: "<!doctype html><title>AX</title>"
    });
    const { manager } = createManager(mainFrame, {
      sendCommand: async (method) => {
        if (method === "Accessibility.getFullAXTree") {
          return {
            nodes: [{
              ignored: false,
              role: { value: "button" },
              name: { value: "AX submit" },
              backendDOMNodeId: 42
            }]
          };
        }
        if (method === "DOM.getBoxModel") {
          return {
            model: {
              border: [300, 220, 420, 220, 420, 260, 300, 260]
            }
          };
        }
        if (method === "Page.addScriptToEvaluateOnNewDocument") {
          return { identifier: "script-ax" };
        }
        return {};
      }
    });

    const observation = await manager.observeAgentPage("tab-1", {
      targetMode: "live",
      strategy: "hybrid"
    });

    const axTarget = findByLabel(observation.elements, "AX submit");
    expect(axTarget.discoveryScope).toBe("ax");
    expect(axTarget.targetRef).toMatch(/^lumen:/u);
    expect(axTarget.actionCapabilities).toContain("click");
    expect(observation.semanticTree?.nodes.find((node) => node.targetRef === axTarget.targetRef)).toMatchObject({
      source: ["ax"],
      actionCapabilities: expect.arrayContaining(["click"])
    });
  });

  test("reads composer identity from a hidden live tab without capturing it", async () => {
    const mainFrame = createFrame({
      id: 1,
      url: "https://app.test/hidden-preview",
      html: "<!doctype html><title>Hidden preview</title><main>Agent page</main>"
    });
    const { manager, webContents } = createManager(mainFrame, undefined, { withWindow: true });
    manager.syncLayout({
      coordinateSpace: "workbench",
      windowWidth: 1_280,
      windowHeight: 720,
      layouts: [{
        tabId: "tab-1",
        x: 0,
        y: 0,
        width: 1_280,
        height: 720,
        visible: false,
        zIndex: 0,
        isFocusedPane: false
      }]
    });
    webContents.capturePage.mockRejectedValue(new Error("Unexpected preview capture"));

    await expect(manager.captureAgentPage("tab-1", { targetMode: "live" })).rejects.toMatchObject({
      code: "background_visual_capture_unsupported"
    });

    const preview = await manager.readAgentPreviewPage("tab-1", "live");
    expect(preview).toMatchObject({
      tabId: "tab-1",
      targetMode: "live"
    });
    expect(preview).not.toHaveProperty("imageBase64");
    expect(webContents.capturePage).not.toHaveBeenCalled();
  });
});
