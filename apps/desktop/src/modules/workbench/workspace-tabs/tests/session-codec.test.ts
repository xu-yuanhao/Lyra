import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import {
  sanitizeBrowserSessionSnapshot,
  WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION
} from "../../../../shared/workbench-browser";
import {
  readWorkbenchStateSync,
  resetWorkbenchStateStorageForTests,
  writeWorkbenchStateSync
} from "../../state-storage";
import {
  readPersistedState,
  writePersistedState
} from "../session-codec";
import { useWorkspaceTabsModel } from "../service";
import type { WorkspaceTabsConfig } from "../types";

const config: WorkspaceTabsConfig = {
  homeTabTitle: "Home",
  settingsTabTitle: "Settings",
  homeSearchAddress: "lyra://search",
  maxSearchTitleLength: 48
};

describe("workspace browser session codec", () => {
  beforeEach(() => {
    resetWorkbenchStateStorageForTests();
  });

  test("persists full browser restore state without falling back to renderer localStorage", () => {
    writePersistedState({
      tabs: [
        {
          id: "browser-tab-1",
          title: "Example",
          pageKind: "page",
          inputValue: "https://example.com/",
          displayAddress: "https://example.com/",
          faviconUrl: undefined,
          query: undefined,
          browserRestoreState: {
            scrollX: 12,
            scrollY: 480,
            viewport: {
              width: 1280,
              height: 720,
              deviceScaleFactor: 2
            },
            history: {
              currentIndex: 1,
              entries: [
                {
                  url: "https://example.com/login",
                  title: "Login",
                  timestamp: 101
                },
                {
                  url: "https://example.com/dashboard",
                  title: "Dashboard",
                  timestamp: 102
                }
              ]
            },
            activeElement: {
              targetRef: "lumen:abc",
              signature: "sig",
              tagName: "input",
              inputType: "text",
              cssSelector: "input[name=\"q\"]"
            },
            formDraft: {
              redacted: true,
              fieldCount: 2,
              editedFieldCount: 1,
              passwordFieldCount: 1,
              sensitiveFieldCount: 1,
              fields: [
                {
                  targetRef: "field:q",
                  tagName: "input",
                  inputType: "text",
                  dirty: true,
                  sensitive: false,
                  valueLength: 12
                },
                {
                  targetRef: "field:password",
                  tagName: "input",
                  inputType: "password",
                  dirty: true,
                  sensitive: true
                }
              ]
            },
            storage: {
              origin: "https://example.com",
              cookieCount: 2,
              localStorage: "available",
              sessionStorage: "unavailable",
              indexedDB: "unknown",
              capturedAt: 100
            },
            textHash: "text-hash",
            capturedAt: 1234
          }
        }
      ],
      activeTabId: "browser-tab-1",
      splitGroupTabIds: [],
      focusedSplitTabId: null
    });

    const raw = readWorkbenchStateSync("workspace-tabs");
    expect(raw).not.toBeNull();
    expect(raw).toContain("\"browserRestoreState\"");

    const restored = readPersistedState(config);
    expect(restored.tabs[0]?.browserRestoreState).toMatchObject({
      scrollY: 480,
      history: {
        currentIndex: 1
      },
      formDraft: {
        redacted: true,
        sensitiveFieldCount: 1
      },
      storage: {
        origin: "https://example.com",
        cookieCount: 2
      },
      textHash: "text-hash"
    });
    expect(JSON.stringify(restored)).not.toContain("secret");
  });

  test("preserves unavailable app tabs as opaque repairable state", () => {
    writeWorkbenchStateSync("workspace-tabs", JSON.stringify({
      schemaVersion: 1,
      tabs: [
        {
          id: "app-tab-1",
          title: "Terminal Memory",
          pageKind: "app",
          inputValue: "",
          displayAddress: "lyra://app/terminal-memory/terminal-memory-session-1",
          faviconUrl: undefined,
          query: undefined,
          appId: "terminal-memory",
          appVersion: "2.4.0",
          appInstanceId: "terminal-memory-session-1",
          appIconKey: "terminal-memory-default",
          appRoute: "/sessions/1",
          appOpaqueState: { selectedPane: "memory" },
          fileSessionId: "terminal-session-1"
        }
      ],
      activeTabId: "app-tab-1",
      splitGroupTabIds: [],
      focusedSplitTabId: null
    }));

    const restored = readPersistedState(config);
    expect(restored.tabs[0]).toMatchObject({
      pageKind: "app",
      appId: "terminal-memory",
      appVersion: "2.4.0",
      appRoute: "/sessions/1",
      appOpaqueState: { selectedPane: "memory" }
    });
  });

  test("keeps a running app tab pinned when product metadata is refreshed", () => {
    const { result, unmount } = renderHook(() => useWorkspaceTabsModel(config));
    const request = {
      appId: "image-viewer",
      appVersion: "1.0.0",
      appInstanceId: "pinned-image-viewer",
      title: "Pinned image",
      iconKey: "image-viewer-default",
      route: "/image"
    } as const;

    act(() => {
      result.current.openAppTab(request);
    });
    act(() => {
      result.current.updateAppTabMeta({
        ...request,
        appVersion: "9.0.0",
        title: "Updated title"
      });
    });

    expect(result.current.tabs.find((tab) => tab.appInstanceId === request.appInstanceId))
      .toMatchObject({
        appVersion: "1.0.0",
        title: "Updated title"
      });
    unmount();
  });

  test("keeps the open directory when only the app path changes", () => {
    const { result, unmount } = renderHook(() => useWorkspaceTabsModel(config));
    const request = {
      appId: "file-manager",
      appInstanceId: "file-manager-a00e94f2",
      title: "Lyra",
      iconKey: "file-manager-directory-non-empty"
    } as const;

    act(() => {
      result.current.openAppTab(request);
    });
    act(() => {
      result.current.updateAppTabMeta({ ...request, filePath: "/home/lyra/Documents/Lyra" });
    });

    // Only filePath differs from the opened tab, so a meta guard that compares
    // title/icon alone would drop it and agent citations would lose the path.
    expect(result.current.tabs.find((tab) => tab.appInstanceId === request.appInstanceId))
      .toMatchObject({ filePath: "/home/lyra/Documents/Lyra" });
    unmount();
  });

  test("deduplicates restored workspace tabs by id", () => {
    writeWorkbenchStateSync("workspace-tabs", JSON.stringify({
      schemaVersion: 1,
      tabs: [
        {
          id: "browser-tab-35",
          title: "First page",
          pageKind: "page",
          inputValue: "https://example.com/first",
          displayAddress: "https://example.com/first"
        },
        {
          id: "browser-tab-35",
          title: "Duplicate page",
          pageKind: "page",
          inputValue: "https://example.com/duplicate",
          displayAddress: "https://example.com/duplicate"
        },
        {
          id: "browser-tab-36",
          title: "Second page",
          pageKind: "page",
          inputValue: "https://example.com/second",
          displayAddress: "https://example.com/second"
        }
      ],
      activeTabId: "browser-tab-35",
      splitGroupTabIds: ["browser-tab-35", "browser-tab-35", "browser-tab-36"],
      focusedSplitTabId: "browser-tab-35"
    }));

    const restored = readPersistedState(config);
    expect(restored.tabs.map((tab) => tab.id)).toEqual([
      "browser-tab-35",
      "browser-tab-36"
    ]);
    expect(restored.tabs[0]?.title).toBe("First page");
    expect(restored.splitGroupTabIds).toEqual(["browser-tab-35", "browser-tab-36"]);
  });

  test("rejects unversioned workspace snapshots instead of creating a legacy read path", () => {
    writeWorkbenchStateSync("workspace-tabs", JSON.stringify({
      tabs: [
        {
          id: "browser-tab-91",
          title: "Legacy",
          pageKind: "page",
          inputValue: "https://example.com/legacy",
          displayAddress: "https://example.com/legacy"
        }
      ],
      activeTabId: "browser-tab-91",
      splitGroupTabIds: [],
      focusedSplitTabId: null
    }));

    const restored = readPersistedState(config);
    expect(restored.tabs).toHaveLength(1);
    expect(restored.tabs[0]?.id).toBe("browser-tab-1");
  });

  test("reuses an existing explicit browser tab id instead of appending duplicates", () => {
    const { result } = renderHook(() => useWorkspaceTabsModel(config));

    act(() => {
      result.current.openPageInNewTab(
        "https://example.com/first",
        "First page",
        { tabId: "browser-tab-35" }
      );
    });
    act(() => {
      result.current.openPageInNewTab(
        "https://example.com/updated",
        "Updated page",
        { tabId: "browser-tab-35" }
      );
    });

    expect(result.current.tabs.map((tab) => tab.id)).toEqual([
      "browser-tab-1",
      "browser-tab-35"
    ]);
    expect(result.current.activeTabId).toBe("browser-tab-35");
    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      title: "Updated page",
      inputValue: "https://example.com/updated",
      displayAddress: "https://example.com/updated"
    });
  });

  test("preserves edited browser address input during runtime page sync", () => {
    const { result } = renderHook(() => useWorkspaceTabsModel(config));

    act(() => {
      result.current.openPageInNewTab(
        "https://example.com/first",
        "First page",
        { tabId: "browser-tab-35" }
      );
    });

    act(() => {
      result.current.syncPageRuntimeState("browser-tab-35", {
        address: "https://example.com/runtime",
        title: "Runtime page"
      });
    });

    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      inputValue: "https://example.com/runtime",
      displayAddress: "https://example.com/runtime"
    });

    act(() => {
      result.current.updateActiveInput("");
    });
    act(() => {
      result.current.syncPageRuntimeState("browser-tab-35", {
        address: "https://example.com/runtime",
        title: "Runtime page updated",
        restoreState: {
          scrollY: 24,
          capturedAt: 100
        }
      });
    });

    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      title: "Runtime page updated",
      inputValue: "",
      displayAddress: "https://example.com/runtime"
    });

    act(() => {
      result.current.updateActiveInput("https://example.com/manual");
    });
    act(() => {
      result.current.syncPageRuntimeState("browser-tab-35", {
        address: "https://example.com/runtime-next",
        title: "Runtime page next"
      });
    });

    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      title: "Runtime page next",
      inputValue: "https://example.com/manual",
      displayAddress: "https://example.com/runtime-next"
    });

    act(() => {
      result.current.updateActiveInput("example.com/runtime-next");
    });
    act(() => {
      result.current.syncPageRuntimeState("browser-tab-35", {
        address: "https://example.com/runtime-next",
        title: "Runtime page next settled"
      });
    });

    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      title: "Runtime page next settled",
      inputValue: "example.com/runtime-next",
      displayAddress: "https://example.com/runtime-next"
    });
  });

  test("does not rewrite tab addresses for equivalent runtime navigation variants", () => {
    const { result } = renderHook(() => useWorkspaceTabsModel(config));

    act(() => {
      result.current.openPageInNewTab(
        "https://example.com/article",
        "Article",
        { tabId: "browser-tab-35" }
      );
    });
    act(() => {
      result.current.syncPageRuntimeState("browser-tab-35", {
        address: "https://example.com/article#googtrans(en|zh-CN)",
        title: "Article"
      });
    });

    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      inputValue: "https://example.com/article",
      displayAddress: "https://example.com/article"
    });
  });

  test("updates tab addresses for real runtime navigation changes", () => {
    const { result } = renderHook(() => useWorkspaceTabsModel(config));

    act(() => {
      result.current.openPageInNewTab(
        "https://example.com/first",
        "First page",
        { tabId: "browser-tab-35" }
      );
    });
    act(() => {
      result.current.syncPageRuntimeState("browser-tab-35", {
        address: "https://example.com/second",
        title: "Second page"
      });
    });

    expect(result.current.tabs[1]).toMatchObject({
      id: "browser-tab-35",
      title: "Second page",
      inputValue: "https://example.com/second",
      displayAddress: "https://example.com/second"
    });
  });

  test("commits address-bar navigation through an explicit page-navigation hook", () => {
    const onCommitPageNavigation = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceTabsModel(config, {
        splitOverflowPolicy: "block_with_notice",
        onCommitPageNavigation
      })
    );

    act(() => {
      result.current.openPageInNewTab(
        "https://example.com/start",
        "Start",
        { tabId: "browser-tab-35" }
      );
    });
    act(() => {
      result.current.navigateResolvedInput(
        { kind: "page", address: "https://example.com/typed" },
        { target: "active-tab" }
      );
    });

    expect(onCommitPageNavigation).toHaveBeenCalledWith({
      tabId: "browser-tab-35",
      address: "https://example.com/typed"
    });
  });

  test("opens selected web search engines as a split search group", () => {
    const { result } = renderHook(() => useWorkspaceTabsModel(config));

    act(() => {
      result.current.openWebSearchTabs({
        query: "lyra docs",
        targets: [
          {
            address: "https://www.google.com/search?q=lyra%20docs",
            engineId: "google",
            title: "Google"
          },
          {
            address: "https://www.bing.com/search?q=lyra%20docs",
            engineId: "bing",
            title: "Bing"
          },
          {
            address: "https://duckduckgo.com/?q=lyra%20docs",
            engineId: "duckduckgo",
            title: "DuckDuckGo"
          }
        ],
        selection: {
          mode: "manual",
          engineIds: ["google", "bing", "duckduckgo"]
        }
      });
    });

    const searchTabs = result.current.tabs.filter((tab) => tab.searchQuery === "lyra docs");
    expect(searchTabs).toHaveLength(3);
    expect(searchTabs.map((tab) => tab.searchEngineId)).toEqual([
      "google",
      "bing",
      "duckduckgo"
    ]);
    expect(result.current.splitGroupTabIds).toEqual(searchTabs.map((tab) => tab.id));
    expect(searchTabs.every((tab) => tab.searchEngineSelectionMode === "manual")).toBe(true);
    expect(searchTabs.every((tab) =>
      tab.searchSelectedEngineIds?.join(",") === "google,bing,duckduckgo"
    )).toBe(true);
  });

  test("migrates legacy browser session snapshots to the schema-versioned model", () => {
    const migrated = sanitizeBrowserSessionSnapshot({
      schemaVersion: 0,
      snapshotId: "legacy",
      capturedAt: 20,
      activeTabId: "browser-tab-1",
      layout: {
        windowWidth: 1440,
        windowHeight: 900,
        layouts: []
      },
      tabs: [
        {
          tabId: "browser-tab-1",
          address: "https://example.com/",
          title: "Example",
          isActive: true,
          canGoBack: false,
          canGoForward: true,
          profilePartition: WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
          restoreState: {
            scrollX: 0,
            scrollY: 220,
            capturedAt: 10
          }
        }
      ]
    });

    expect(migrated).toMatchObject({
      schemaVersion: 1,
      snapshotId: "legacy",
      activeTabId: "browser-tab-1",
      tabs: [
        {
          tabId: "browser-tab-1",
          restoreState: {
            scrollY: 220
          }
        }
      ]
    });
    expect(migrated?.migrations).toEqual([
      expect.objectContaining({
        fromVersion: 0,
        toVersion: 1
      })
    ]);
  });

  test("keeps tombstoned browser history scroll and focus restore metadata", () => {
    const snapshot = sanitizeBrowserSessionSnapshot({
      schemaVersion: 1,
      snapshotId: "tombstone-snapshot",
      capturedAt: 200,
      activeTabId: "browser-tab-1",
      layout: {
        windowWidth: 1440,
        windowHeight: 900,
        layouts: []
      },
      storageState: {
        schemaVersion: 1,
        profileId: "lyra-browser-live",
        profileMode: "live",
        profilePartition: WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
        persistence: "chromium-profile"
      },
      tabs: [
        {
          tabId: "browser-tab-1",
          address: "https://example.com/dashboard",
          title: "Dashboard",
          isActive: true,
          lifecycleState: "tombstoned",
          canGoBack: true,
          canGoForward: false,
          profilePartition: WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION,
          restoreState: {
            scrollX: 4,
            scrollY: 640,
            history: {
              currentIndex: 1,
              entries: [
                {
                  url: "https://example.com/login",
                  title: "Login",
                  timestamp: 100
                },
                {
                  url: "https://example.com/dashboard",
                  title: "Dashboard",
                  timestamp: 150
                }
              ]
            },
            activeElement: {
              targetRef: "lumen:search-box",
              signature: "input#search",
              tagName: "input",
              cssSelector: "input[name=\"search\"]"
            },
            targetRegistry: {
              warmed: true,
              targetCount: 12,
              activeTargetRef: "lumen:search-box",
              capturedAt: 180
            },
            textHash: "sha256:page-text",
            capturedAt: 190
          }
        }
      ]
    });

    expect(snapshot?.tabs[0]).toMatchObject({
      lifecycleState: "tombstoned",
      restoreState: {
        scrollY: 640,
        history: {
          currentIndex: 1,
          entries: [
            expect.objectContaining({ url: "https://example.com/login" }),
            expect.objectContaining({ url: "https://example.com/dashboard" })
          ]
        },
        activeElement: {
          targetRef: "lumen:search-box",
          cssSelector: "input[name=\"search\"]"
        },
        targetRegistry: {
          warmed: true,
          activeTargetRef: "lumen:search-box"
        }
      }
    });
  });
});
