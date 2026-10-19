import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { ContextMenuModel } from "../../context-menu";
import type {
  LyraDesktopApi
} from "../../../../shared/desktop-bridge";
import { createBrowserStorageStateRef } from "../../../../shared/workbench-browser";
import type {
  FileManagerDirectoryPatch,
  FileManagerReadDirectoryResponse,
  FileManagerReadHomeResponse,
  FileManagerReadTrashResponse
} from "../../../../shared/file-manager";
import type { FileManagerSurfaceLabels } from "../types";
import { useFileManagerModel } from "../service";

const labels: FileManagerSurfaceLabels = {
  title: "文件管理",
  locationHome: "主目录",
  locationDesktop: "桌面",
  locationDocuments: "文稿",
  locationDownloads: "下载",
  locationPictures: "图片",
  locationVideos: "视频",
  downloadManagerTitle: "下载管理",
  locationTrash: "回收站",
  homeSectionFavorites: "收藏",
  homeSectionLocations: "位置",
  homeSectionDevices: "设备",
  homeSectionRecent: "最近",
  navigationBack: "后退",
  navigationForward: "前进",
  navigationUp: "上一级",
  refresh: "刷新",
  addFavorite: "添加收藏",
  removeFavorite: "移除收藏",
  newFolder: "新建文件夹",
  newFile: "新建文件",
  delete: "删除",
  restore: "恢复",
  emptyTrash: "清空回收站",
  noRecentLocations: "暂无最近位置",
  emptyDirectory: "目录为空",
  emptyTrashState: "回收站为空",
  noFavorites: "暂无收藏",
  emptyDownloads: "暂无下载",
  loading: "加载中",
  unavailable: "文件能力不可用",
  diskAvailable: "可用",
  diskKindSystem: "本机磁盘",
  diskKindLocal: "本机附加盘",
  diskKindRemovable: "可移动磁盘",
  diskKindExternal: "外置盘",
  deviceUnmounted: "未挂载",
  nameColumn: "名称",
  locationColumn: "位置",
  originalLocationColumn: "原始位置",
  createPlaceholderFile: "输入文件名",
  createPlaceholderDirectory: "输入文件夹名",
  createConfirm: "确认",
  createCancel: "取消",
  contextOpen: "打开",
  contextMountDevice: "挂载",
  contextMoveToTrash: "移到回收站",
  contextRestore: "恢复",
  contextEmptyTrash: "清空回收站",
  contextEjectDevice: "弹出设备",
  viewList: "列表视图",
  viewLarge: "大视图",
  downloadAddUrl: "添加下载",
  downloadUrlPlaceholder: "粘贴 URL",
  downloadOpenFile: "打开文件",
  downloadRevealFile: "显示文件",
  downloadPause: "暂停",
  downloadResume: "继续",
  downloadCancel: "取消",
  downloadRetry: "重试",
  downloadRemove: "移除",
  downloadPauseAll: "全部暂停",
  downloadResumeAll: "全部继续",
  downloadCancelAll: "全部取消",
  downloadPriority: "优先级",
  downloadPriorityLow: "低",
  downloadPriorityNormal: "普通",
  downloadPriorityHigh: "高",
  downloadStateQueued: "排队中",
  downloadStateDownloading: "下载中",
  downloadStatePaused: "已暂停",
  downloadStateCompleted: "已完成",
  downloadStateFailed: "失败",
  downloadStateCanceled: "已取消",
  downloadSourceBrowser: "浏览器",
  downloadSourceManual: "手动",
  downloadConnections: "{count} 个连接",
  downloadUnknownSize: "未知",
  downloadSpeedIdle: "空闲",
  downloadDurationSeconds: "{seconds} 秒",
  downloadDurationMinutes: "{minutes} 分 {seconds} 秒",
  downloadDurationHours: "{hours} 小时 {minutes} 分",
  downloadEta: "剩余 {duration}",
  chooserBindProjectLabel: "绑定当前目录",
  chooserSelectDirectoryPlaceholder: "先进入一个目录",
  chooserSelectAnyDirectoryPlaceholder: "打开一个目录以选择"
};

const homeResponse: FileManagerReadHomeResponse = {
  location: {
    id: "home-root",
    title: "文件管理",
    kind: "home"
  },
  systemLocations: [
    {
      id: "documents",
      title: "Documents",
      kind: "special",
      path: "/home/lyra/Documents",
      specialId: "documents"
    }
  ],
  favorites: [],
  recentLocations: [],
  devices: [
    {
      id: "/dev/sdb",
      title: "SanDisk 3.2Gen1",
      devicePath: "/dev/sdb",
      displayPath: "/dev/sdb",
      fileSystem: "exfat",
      kind: "removable",
      osFlavor: "unknown",
      totalBytes: 115 * 1024 * 1024 * 1024,
      isRemovable: true,
      canMount: true,
      canEject: true
    }
  ],
  disks: [
    {
      id: "/",
      title: "System",
      mountPath: "/",
      devicePath: "/dev/nvme0n1p2",
      fileSystem: "ext4",
      kind: "system",
      osFlavor: "arch",
      totalBytes: 512 * 1024 * 1024 * 1024,
      availableBytes: 320 * 1024 * 1024 * 1024,
      usedBytes: 192 * 1024 * 1024 * 1024,
      usageRatio: 0.375,
      isRemovable: false,
      canEject: false
    }
  ]
};

const directoryResponse: FileManagerReadDirectoryResponse = {
  location: {
    id: "documents-dir",
    title: "Documents",
    kind: "directory",
    path: "/home/lyra/Documents"
  },
  parentPath: "/home/lyra",
  entries: [
    {
      id: "projects-dir",
      name: "Projects",
      path: "/home/lyra/Documents/Projects",
      kind: "directory",
      folderState: "non-empty",
      isHidden: false
    },
    {
      id: "readme-file",
      name: "README.md",
      path: "/home/lyra/Documents/README.md",
      kind: "file",
      extension: "md",
      isHidden: false,
      sizeBytes: 128,
      modifiedAt: "1711111111"
    }
  ]
};

const trashResponse: FileManagerReadTrashResponse = {
  location: {
    id: "trash-root",
    title: "回收站",
    kind: "trash",
    specialId: "trash"
  },
  entries: []
};

const createContextMenuModel = (): ContextMenuModel => ({
  state: {
    isOpen: false,
    anchorX: 0,
    anchorY: 0,
    items: []
  },
  openMenu: vi.fn(),
  closeMenu: vi.fn(),
  selectItem: vi.fn()
});

const createDesktopApi = (): {
  readonly api: LyraDesktopApi;
  readonly readHome: ReturnType<typeof vi.fn>;
  readonly readDirectory: ReturnType<typeof vi.fn>;
  readonly readTrash: ReturnType<typeof vi.fn>;
  readonly mountDevice: ReturnType<typeof vi.fn>;
  readonly ejectDevice: ReturnType<typeof vi.fn>;
  readonly writeFavorites: ReturnType<typeof vi.fn>;
  readonly writeRecentLocations: ReturnType<typeof vi.fn>;
} => {
  const readHome = vi.fn(async () => homeResponse);
  const readDirectory = vi.fn(async () => directoryResponse);
  const readTrash = vi.fn(async () => trashResponse);
  const mountDevice = vi.fn(async () => ({
    mounted: true,
    mountPath: "/run/media/lyra/SanDisk",
    strategy: "test-mount"
  }));
  const ejectDevice = vi.fn(async () => ({
    ejected: true,
    poweredOff: false,
    strategy: "test-eject"
  }));
  const writeFavorites = vi.fn(async (payload) => payload);
  const writeRecentLocations = vi.fn(async (payload) => payload);

  const api: LyraDesktopApi = {
    windowControls: {
      minimize: async () => undefined,
      toggleMaximize: async () => undefined,
      close: async () => undefined
    },
    appMeta: {
      version: "0.1.0",
      platform: "linux",
      isPackaged: false
    },
    shellEvents: {
      onWindowStateChange: () => () => undefined
    },
    screenshotPreview: {
      present: async () => ({ previewId: null }),
      dismiss: async () => undefined,
      onEvent: () => () => undefined
    },
    openExternal: async () => false,
    detectEditors: async () => [],
    openInEditor: async () => false,
    revealInFolder: async () => false,
    i18n: {
      readLocalBundles: async () => ({}),
      readLanguageBundles: async () => ({ managed: {}, local: {} })
    },
    languagePacks: {
      listCatalog: async () => ({ status: "unavailable", packs: [] }),
      listInstalled: async () => [],
      install: async () => {
        throw new Error("not implemented");
      },
      uninstall: async () => undefined,
      checkForUpdates: async () => ({ status: "unavailable", packs: [] }),
      onChanged: () => () => undefined
    },
    components: {
      list: async () => [],
      resolveAppModule: async () => {
        throw new Error("not implemented");
      },
      installFromDirectory: async () => {
        throw new Error("not implemented");
      },
      assessActivation: async () => {
        throw new Error("not implemented");
      },
      activate: async () => {
        throw new Error("not implemented");
      },
      rollback: async () => {
        throw new Error("not implemented");
      },
      uninstallVersion: async () => undefined,
      stageUpdate: async () => {
        throw new Error("not implemented");
      },
      cancelUpdate: async () => undefined,
      purgeStagedUpdate: async () => undefined,
      readCoreProjectionStatus: async () => ({
        state: "idle",
        componentId: "lyra.core"
      }),
      applyCore: async () => {
        throw new Error("not implemented");
      },
      onUpdateProgress: () => () => undefined
    },
    productUninstall: {
      run: async () => undefined,
      onProgress: () => () => undefined,
      onOpenRequested: () => () => undefined,
      registerEntry: async () => undefined
    },
    linuxCompat: {
      readStatus: async () => ({
        platform: "linux" as const,
        enabled: true,
        profile: "native" as const,
        recommendedProfile: "native" as const,
        safeMode: false,
        backend: "wayland" as const,
        gpuMode: "hardware" as const,
        profileSource: "auto" as const,
        backendSource: "auto" as const,
        gpuSource: "auto" as const,
        warnings: [],
        notes: [],
        appliedEnv: {},
        appliedSwitches: {},
        facts: {
          sessionType: "wayland" as const,
          architecture: "x64" as const,
          kernelRelease: "6.8.0",
          libc: "glibc" as const,
          desktop: "KDE",
          desktopRaw: "KDE",
          distributionId: "ubuntu",
          distributionVersion: "24.04",
          distributionLike: ["debian"],
          packageType: "dev" as const,
          waylandDisplay: "wayland-0",
          x11Display: null,
          isContainer: false,
          isRoot: false,
          gpu: {
            vendor: "intel" as const,
            deviceCount: 1,
            hasDiscreteGpu: false,
            driverHint: null,
            hardwareAccelerationEnabled: true,
            featureStatus: null
          }
        },
        recovery: {
          active: false,
          autoRestarted: false,
          launchId: "test",
          previousFailureReason: null
        },
        generatedAt: new Date().toISOString()
      }),
      readConfig: async () => ({
        version: 1 as const,
        profile: "native" as const,
        updatedAt: new Date().toISOString()
      }),
      updateConfig: async () => ({
        ok: true as const,
        config: {
          version: 1 as const,
          profile: "native" as const,
          updatedAt: new Date().toISOString()
        }
      }),
      requestRestart: async () => ({ ok: true as const })
    },
    search: {
      resolveWebSearchEngine: async (request) => {
        const engine = request.engines[0]!;
        return {
          engine,
          searchUrl: engine.searchUrlTemplate.replace(
            "{searchTerms}",
            encodeURIComponent(request.query)
          ),
          fallbackUsed: false
        };
      }
    },
    browserShell: {
      syncTopology: async () => undefined,
      syncLayout: async () => undefined,
      setChromePopover: async () => undefined,
      setModalOcclusion: async () => undefined,
      onEvent: () => () => undefined
    },
    browser: {
      navigate: async (request) => ({
        address: request.address,
        tabId: request.tabId ?? "browser-tab-test",
        title: request.title ?? null
      }),
      goBack: async () => undefined,
      goForward: async () => undefined,
      reload: async () => undefined,
      stop: async () => undefined,
      readPageState: async () => null,
      readSessionSnapshot: async () => null,
      readStorageState: async () => createBrowserStorageStateRef(),
      clearSiteData: async () => ({
        ok: true as const,
        origin: "https://example.test",
        profilePartitions: [],
        cookiesRemoved: 0,
        storageCleared: false,
        snapshot: null
      }),
      executePageContextAction: async () => undefined,
      searchInPage: async () => ({
        tabId: "browser-tab-test",
        address: "https://example.test/",
        title: "Example",
        query: "test",
        currentIndex: 0,
        totalMatches: 0,
        matches: [],
        truncated: false
      }),
      setElementPickerMode: async () => undefined,
      capturePage: async () => ({
        tabId: "browser-tab-test",
        mimeType: "image/png" as const,
        imageBase64: "",
        width: 1,
        height: 1,
        visibleOnly: true
      }),
      captureWindow: async () => ({
        tabId: "lyra-window",
        mimeType: "image/png" as const,
        imageBase64: "",
        width: 1,
        height: 1,
        visibleOnly: true
      }),
      readActivePageDragCitation: () => null,
      consumePageDragCitation: () => undefined,
      onEvent: () => () => undefined
    },
    files: {
      readHome,
      readDirectory,
      readTrash,
      readTextFile: async () => ({
        kind: "unsupported",
        path: "",
        reason: "not-needed",
        readOnly: true,
        sizeBytes: 0
      }),
      writeTextFile: async () => ({
        ok: true,
        path: "",
        revision: "",
        encoding: "utf8",
        savedAt: ""
      }),
      statFile: async () => ({
        path: "",
        exists: false,
        isDirectory: false,
        readOnly: false,
        sizeBytes: 0
      }),
      searchText: async () => ({ hits: [], truncated: false }),
      selectAttachments: async () => [],
      selectDirectories: async () => [],
      createFile: async () => ({}),
      createFolder: async () => ({}),
      moveToTrash: async () => undefined,
      restoreFromTrash: async () => undefined,
      emptyTrash: async () => undefined,
      mountDevice,
      ejectDevice,
      readFavorites: async () => ({ favorites: [] }),
      writeFavorites,
      readRecentLocations: async () => ({ recentLocations: [] }),
      writeRecentLocations
    },
    lsp: {
      openDocument: async () => undefined,
      changeDocument: async () => undefined,
      saveDocument: async () => undefined,
      closeDocument: async () => undefined,
      completion: async () => ({
        items: [],
        isIncomplete: false
      }),
      hover: async () => null,
      gotoDefinition: async () => [],
      findReferences: async () => [],
      onEvent: () => () => undefined
    },
    terminal: {
      createSession: async () => ({
        sessionId: "session-1",
        title: "Terminal",
        shell: "/usr/bin/bash",
        cols: 80,
        rows: 24,
        createdAt: new Date().toISOString()
      }),
      reloadPrompt: async () => ({ applied: false, deferred: false }),
      write: async () => undefined,
      read: async () => ({
        sessionId: "session-1",
        cursor: "0",
        output: "",
        running: false,
        exitCode: 0,
        truncated: false,
        source: "user" as const,
        mode: "shell" as const
      }),
      resize: async () => undefined,
      closeSession: async () => undefined,
      onData: () => () => undefined,
      onExit: () => () => undefined,
      onError: () => () => undefined
    },
    workbenchState: {
      readCached: () => null,
      read: async () => null,
      write: async () => undefined,
      remove: async () => undefined,
      onDidChange: () => () => undefined
    },
    uiux: {
      listPacks: async () => ({ builtin: [], installed: [] }),
      installFromLocal: async () => {
        throw new Error("not implemented");
      },
      installFromGit: async () => {
        throw new Error("not implemented");
      },
      installFromNpm: async () => {
        throw new Error("not implemented");
      },
      setTrustState: async () => {
        throw new Error("not implemented");
      },
      requestActivation: async (request) => ({
        packId: request.packId,
        reloadRequired: request.packId !== "classic",
        activated: request.packId === "classic"
      }),
      uninstall: async (request) => ({
        packId: request.packId,
        removed: true
      }),
      resolveRuntime: async () => null
    },
    workbenchObservation: {
      registerHandler: () => () => undefined
    }
  };

  return {
    api,
    readHome,
    readDirectory,
    readTrash,
    mountDevice,
    ejectDevice,
    writeFavorites,
    writeRecentLocations
  };
};

describe("file manager model", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("publishes changed instance ids through the Core-facing subscription", async () => {
    const desktop = createDesktopApi();
    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange: vi.fn()
      })
    );
    const listener = vi.fn();
    const unsubscribe = result.current.subscribe(listener);
    let appInstanceId = "";

    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });
    await waitFor(() => expect(listener).toHaveBeenCalledWith([appInstanceId]));

    listener.mockClear();
    unsubscribe();
    await act(async () => {
      await result.current.openHome(appInstanceId);
    });
    expect(listener).not.toHaveBeenCalled();
  });

  test("loads home state and reports app metadata", async () => {
    const desktop = createDesktopApi();
    const onMetaChange = vi.fn();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange
      })
    );

    let appInstanceId = "";
    act(() => {
      const app = result.current.createInstance();
      appInstanceId = app.appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    expect(desktop.readHome).toHaveBeenCalledTimes(1);
    expect(result.current.getState(appInstanceId)).toMatchObject({
      viewKind: "home",
      title: labels.title,
      iconKey: "file-manager-home",
      systemLocations: [
        {
          ...homeResponse.systemLocations[0],
          title: labels.locationDocuments
        }
      ],
      devices: homeResponse.devices,
      disks: homeResponse.disks
    });
    expect(onMetaChange).toHaveBeenLastCalledWith({
      appId: "file-manager",
      appInstanceId,
      title: labels.title,
      iconKey: "file-manager-home",
      filePath: ""
    });
  });

  test("opens directory and persists recent locations", async () => {
    const desktop = createDesktopApi();
    const onMetaChange = vi.fn();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange
      })
    );

    let appInstanceId = "";
    act(() => {
      const app = result.current.createInstance();
      appInstanceId = app.appInstanceId;
    });

    await act(async () => {
      await result.current.openDirectory(appInstanceId, "/home/lyra/Documents");
    });

    expect(desktop.readDirectory).toHaveBeenCalledWith({
      path: "/home/lyra/Documents"
    });
    expect(desktop.writeRecentLocations).toHaveBeenCalledTimes(1);
    expect(result.current.getState(appInstanceId)).toMatchObject({
      viewKind: "directory",
      title: "Documents",
      iconKey: "file-manager-directory-non-empty",
      parentPath: "/home/lyra",
      entries: directoryResponse.entries
    });
    expect(result.current.getState(appInstanceId)?.recentLocations).toHaveLength(1);
    // The tab carries the open directory so agent references and session
    // restore can address it without a read_tab round-trip.
    expect(onMetaChange).toHaveBeenLastCalledWith({
      appId: "file-manager",
      appInstanceId,
      title: "Documents",
      iconKey: "file-manager-directory-non-empty",
      filePath: "/home/lyra/Documents"
    });
  });

  test("subscribes to directories and applies patch events", async () => {
    const desktop = createDesktopApi();
    let patchListener: ((patch: FileManagerDirectoryPatch) => void) | null = null;
    const subscribeDirectory = vi.fn(async () => ({
      subscriptionId: "sub-1",
      snapshot: {
        ...directoryResponse,
        generation: 1
      }
    }));
    const unsubscribeDirectory = vi.fn(async () => undefined);
    Object.assign(desktop.api.files, {
      subscribeDirectory,
      unsubscribeDirectory,
      onDirectoryPatch: (listener: (patch: FileManagerDirectoryPatch) => void) => {
        patchListener = listener;
        return () => {
          patchListener = null;
        };
      }
    });

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openDirectory(appInstanceId, "/home/lyra/Documents");
    });

    expect(subscribeDirectory).toHaveBeenCalledWith({ path: "/home/lyra/Documents" });
    expect(desktop.readDirectory).not.toHaveBeenCalled();

    act(() => {
      patchListener?.({
        subscriptionId: "sub-1",
        directoryPath: "/home/lyra/Documents",
        generation: 2,
        kind: "create",
        path: "/home/lyra/Documents/notes.txt",
        entry: {
          id: "notes-file",
          name: "notes.txt",
          path: "/home/lyra/Documents/notes.txt",
          kind: "file",
          extension: "txt",
          isHidden: false,
          sizeBytes: 12,
          modifiedAt: "1711111112"
        }
      });
    });

    expect(result.current.getState(appInstanceId)?.entries.map((entry) => entry.name)).toEqual([
      "Projects",
      "notes.txt",
      "README.md"
    ]);

    act(() => {
      patchListener?.({
        subscriptionId: "sub-1",
        directoryPath: "/home/lyra/Documents",
        generation: 3,
        kind: "remove",
        path: "/home/lyra/Documents/README.md"
      });
    });

    expect(result.current.getState(appInstanceId)?.entries.map((entry) => entry.name)).toEqual([
      "Projects",
      "notes.txt"
    ]);
    expect(unsubscribeDirectory).not.toHaveBeenCalled();
  });

  test("stores presentation mode per file manager instance", async () => {
    const desktop = createDesktopApi();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange: vi.fn()
      })
    );

    let firstId = "";
    let secondId = "";
    act(() => {
      firstId = result.current.createInstance().appInstanceId;
      secondId = result.current.createInstance().appInstanceId;
    });

    act(() => {
      result.current.setPresentationMode(firstId, "large");
    });

    expect(result.current.getState(firstId)?.presentationMode).toBe("large");
    expect(result.current.getState(secondId)?.presentationMode).toBe("list");
  });

  test("syncTabInstances removes closed app state", async () => {
    const desktop = createDesktopApi();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange: vi.fn()
      })
    );

    let firstId = "";
    let secondId = "";
    act(() => {
      firstId = result.current.createInstance().appInstanceId;
      secondId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(firstId);
      await result.current.openTrash(secondId);
    });

    act(() => {
      result.current.syncTabInstances([secondId]);
    });

    expect(result.current.getState(firstId)).toBeNull();
    expect(result.current.getState(secondId)).not.toBeNull();
    expect(desktop.readTrash).toHaveBeenCalledTimes(1);
  });

  test("falls back to unavailable state when native files api is missing", async () => {
    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: null,
        contextMenuModel: createContextMenuModel(),
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    expect(result.current.getState(appInstanceId)).toMatchObject({
      status: "error",
      errorMessage: labels.unavailable
    });
  });

  test("opens location context menu with favorite action", async () => {
    const desktop = createDesktopApi();
    const contextMenu = createContextMenuModel();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: contextMenu,
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    act(() => {
      result.current.openLocationContextMenu(
        appInstanceId,
        {
          id: "documents",
          title: labels.locationDocuments,
          kind: "special",
          path: "/home/lyra/Documents",
          specialId: "documents"
        },
        24,
        36
      );
    });

    expect(contextMenu.openMenu).toHaveBeenCalledTimes(1);
    expect(contextMenu.openMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorX: 24,
        anchorY: 36,
        items: expect.arrayContaining([
          expect.objectContaining({ label: labels.contextOpen }),
          expect.objectContaining({ label: labels.addFavorite })
        ])
      })
    );
  });

  test("opens trash background context menu with restore actions centralized", async () => {
    const desktop = createDesktopApi();
    const contextMenu = createContextMenuModel();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: contextMenu,
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openTrash(appInstanceId);
    });

    act(() => {
      result.current.openTrashContextMenu(appInstanceId, 80, 120);
    });

    expect(contextMenu.openMenu).toHaveBeenCalledTimes(1);
    expect(contextMenu.openMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        items: expect.arrayContaining([
          expect.objectContaining({ label: labels.refresh }),
          expect.objectContaining({ label: labels.contextEmptyTrash, danger: true })
        ])
      })
    );
  });

  test("opens disk context menu with eject action for ejectable disks", async () => {
    const desktop = createDesktopApi();
    const contextMenu = createContextMenuModel();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: contextMenu,
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    act(() => {
      result.current.openDiskContextMenu(
        appInstanceId,
        {
          id: "/run/media/lyra/Ventoy",
          title: "/dev/sda1",
          mountPath: "/run/media/lyra/Ventoy",
          devicePath: "/dev/sda1",
          fileSystem: "exfat",
          kind: "removable",
          osFlavor: "unknown",
          totalBytes: 64 * 1024 * 1024 * 1024,
          availableBytes: 32 * 1024 * 1024 * 1024,
          usedBytes: 32 * 1024 * 1024 * 1024,
          usageRatio: 0.5,
          isRemovable: true,
          canEject: true
        },
        48,
        96
      );
    });

    expect(contextMenu.openMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorX: 48,
        anchorY: 96,
        items: expect.arrayContaining([
          expect.objectContaining({ label: labels.contextOpen }),
          expect.objectContaining({ label: labels.contextEjectDevice })
        ])
      })
    );
  });

  test("opens device context menu with mount action for mountable devices", async () => {
    const desktop = createDesktopApi();
    const contextMenu = createContextMenuModel();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: contextMenu,
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    act(() => {
      result.current.openDeviceContextMenu(
        appInstanceId,
        {
          id: "/dev/sdb1",
          title: "SanDisk",
          devicePath: "/dev/sdb1",
          displayPath: "/dev/sdb1",
          fileSystem: "exfat",
          kind: "removable",
          osFlavor: "unknown",
          totalBytes: 64 * 1024 * 1024 * 1024,
          isRemovable: true,
          canMount: true,
          canEject: true
        },
        52,
        108
      );
    });

    expect(contextMenu.openMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        anchorX: 52,
        anchorY: 108,
        items: expect.arrayContaining([
          expect.objectContaining({ label: labels.contextMountDevice }),
          expect.objectContaining({ label: labels.contextEjectDevice })
        ])
      })
    );
  });

  test("mounts unmounted devices through the centralized context menu action", async () => {
    const desktop = createDesktopApi();
    const contextMenu = createContextMenuModel();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: contextMenu,
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    act(() => {
      result.current.openDeviceContextMenu(
        appInstanceId,
        {
          id: "/dev/sdb1",
          title: "SanDisk",
          devicePath: "/dev/sdb1",
          displayPath: "/dev/sdb1",
          fileSystem: "exfat",
          kind: "removable",
          osFlavor: "unknown",
          totalBytes: 64 * 1024 * 1024 * 1024,
          isRemovable: true,
          canMount: true,
          canEject: false
        },
        52,
        108
      );
    });

    const openMenuRequest = vi.mocked(contextMenu.openMenu).mock.calls.at(-1)?.[0];
    const mountItem = openMenuRequest?.items.find((item) => item.label === labels.contextMountDevice);

    expect(mountItem).toBeDefined();
    if (mountItem === undefined) {
      throw new Error("expected mount context menu item");
    }
    if (mountItem.onSelect === undefined) {
      throw new Error("expected mount context menu handler");
    }
    const handleMount = mountItem.onSelect;

    await act(async () => {
      handleMount();
      await Promise.resolve();
    });

    expect(desktop.mountDevice).toHaveBeenCalledWith({
      devicePath: "/dev/sdb1",
      kind: "removable"
    });
    expect(desktop.readHome).toHaveBeenCalledTimes(2);
    expect(desktop.readDirectory).toHaveBeenCalledWith({
      path: "/run/media/lyra/SanDisk"
    });
  });

  test("ejects removable disks through the centralized context menu action", async () => {
    const desktop = createDesktopApi();
    const contextMenu = createContextMenuModel();

    const { result } = renderHook(() =>
      useFileManagerModel({
        desktopApi: desktop.api,
        contextMenuModel: contextMenu,
        labels,
        onMetaChange: vi.fn()
      })
    );

    let appInstanceId = "";
    act(() => {
      appInstanceId = result.current.createInstance().appInstanceId;
    });

    await act(async () => {
      await result.current.openHome(appInstanceId);
    });

    act(() => {
      result.current.openDiskContextMenu(
        appInstanceId,
        {
          id: "/run/media/lyra/Ventoy",
          title: "/dev/sda1",
          mountPath: "/run/media/lyra/Ventoy",
          devicePath: "/dev/sda1",
          fileSystem: "exfat",
          kind: "removable",
          osFlavor: "unknown",
          totalBytes: 64 * 1024 * 1024 * 1024,
          availableBytes: 32 * 1024 * 1024 * 1024,
          usedBytes: 32 * 1024 * 1024 * 1024,
          usageRatio: 0.5,
          isRemovable: true,
          canEject: true
        },
        48,
        96
      );
    });

    const openMenuRequest = vi.mocked(contextMenu.openMenu).mock.calls.at(-1)?.[0];
    const ejectItem = openMenuRequest?.items.find((item) => item.label === labels.contextEjectDevice);

    expect(ejectItem).toBeDefined();
    if (ejectItem === undefined) {
      throw new Error("expected eject context menu item");
    }
    if (ejectItem.onSelect === undefined) {
      throw new Error("expected eject context menu handler");
    }
    const handleEject = ejectItem.onSelect;

    await act(async () => {
      handleEject();
      await Promise.resolve();
    });

    expect(desktop.ejectDevice).toHaveBeenCalledWith({
      mountPath: "/run/media/lyra/Ventoy",
      devicePath: "/dev/sda1",
      kind: "removable"
    });
    expect(desktop.readHome).toHaveBeenCalledTimes(2);
  });
});
