import { BrowserWindow, ipcMain } from "electron";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import {
  LYRA_CHANNELS,
  type WorkbenchStateChangeEvent,
  type WorkbenchStateKey,
  type WorkbenchStateSnapshot
} from "../../shared/desktop-bridge";
import {
  quarantineCorruptFile,
  writeFileAtomic
} from "../persistence";
import { sendToWebContents } from "../web-contents-ipc";

const WORKBENCH_STATE_FILENAMES: Readonly<Record<WorkbenchStateKey, string>> = {
  preferences: "preferences.v1.json",
  "workspace-tabs": "workspace-tabs.v1.json",
  "browser-session": "browser-session.v1.json",
  "browser-history": "browser-history.v1.json",
  "ai-panel-tabs": "ai-panel-tabs.v1.json",
  "terminal-dock": "terminal-dock.v1.json",
  notifications: "notifications.v1.json",
  layout: "layout.v1.json",
  location: "location.v1.json"
};
const WORKBENCH_STATE_KEYS = Object.keys(WORKBENCH_STATE_FILENAMES) as WorkbenchStateKey[];

const isWorkbenchStateKey = (value: unknown): value is WorkbenchStateKey =>
  value === "preferences"
  || value === "workspace-tabs"
  || value === "browser-session"
  || value === "browser-history"
  || value === "ai-panel-tabs"
  || value === "terminal-dock"
  || value === "notifications"
  || value === "layout"
  || value === "location";

const normalizeKey = (value: unknown): WorkbenchStateKey => {
  if (isWorkbenchStateKey(value) === false) {
    throw new Error(`unknown workbench state key: ${String(value)}`);
  }
  return value;
};

const normalizeJson = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("workbench-state json payload is required");
  }

  try {
    JSON.parse(value);
  } catch (error) {
    throw new Error(`workbench-state payload must be valid JSON: ${String(error)}`);
  }

  return value;
};

const resolveStateFilePath = (storageRoot: string, key: WorkbenchStateKey): string =>
  path.join(storageRoot, WORKBENCH_STATE_FILENAMES[key]);

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const createEmptySnapshot = (): Record<WorkbenchStateKey, string | null> => ({
  preferences: null,
  "workspace-tabs": null,
  "browser-session": null,
  "browser-history": null,
  "ai-panel-tabs": null,
  "terminal-dock": null,
  notifications: null,
  layout: null,
  location: null
});

const readStateFile = async (filePath: string): Promise<string | null> => {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === "ENOENT") {
      return null;
    }
    console.error(`[lyra-workbench-state] failed to read ${filePath}: ${toErrorMessage(error)}`);
    throw error;
  }
  try {
    JSON.parse(raw);
    return raw;
  } catch (error) {
    await quarantineCorruptFile(filePath, toErrorMessage(error), "lyra-workbench-state");
    return null;
  }
};

const loadSnapshot = async (storageRoot: string): Promise<Record<WorkbenchStateKey, string | null>> => {
  await mkdir(storageRoot, { recursive: true });
  const snapshot = createEmptySnapshot();
  await Promise.all(
    WORKBENCH_STATE_KEYS.map(async (key) => {
      const filePath = resolveStateFilePath(storageRoot, key);
      snapshot[key] = await readStateFile(filePath);
    })
  );
  return snapshot;
};

export type WorkbenchStateIpcBridge = {
  readonly dispose: () => void;
  readonly flush: () => Promise<void>;
  readonly snapshot: () => WorkbenchStateSnapshot;
  readonly readState: (key: WorkbenchStateKey) => string | null;
  readonly readStateAsync: (key: WorkbenchStateKey) => Promise<string | null>;
  readonly writeState: (key: WorkbenchStateKey, json: string) => void;
  readonly writeStateAsync: (key: WorkbenchStateKey, json: string) => Promise<void>;
  readonly removeState: (key: WorkbenchStateKey) => void;
  readonly removeStateAsync: (key: WorkbenchStateKey) => Promise<void>;
  readonly subscribe: (
    listener: (event: WorkbenchStateChangeEvent) => void
  ) => () => void;
};

export const createWorkbenchStateIpcBridge = async (
  storageRoot: string
): Promise<WorkbenchStateIpcBridge> => {
  const stateSnapshot = await loadSnapshot(storageRoot);
  const stateListeners = new Set<(event: WorkbenchStateChangeEvent) => void>();
  const writeQueues = new Map<WorkbenchStateKey, Promise<void>>();
  const writeFailures = new Map<WorkbenchStateKey, unknown>();

  const publish = (key: WorkbenchStateKey, json: string | null): void => {
    const event = { key, json } satisfies WorkbenchStateChangeEvent;
    for (const listener of stateListeners) {
      listener(event);
    }
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.isDestroyed()) {
        continue;
      }
      sendToWebContents(window.webContents, LYRA_CHANNELS.workbenchStateChanged, event);
    }
  };

  const enqueueDiskWrite = (
    key: WorkbenchStateKey,
    operation: () => Promise<void>
  ): Promise<void> => {
    const previous = writeQueues.get(key) ?? Promise.resolve();
    const queued = previous.catch(() => undefined).then(operation);
    const tracked = queued.then(
      () => { writeFailures.delete(key); },
      (error: unknown) => { writeFailures.set(key, error); }
    ).finally(() => {
      if (writeQueues.get(key) === tracked) writeQueues.delete(key);
    });
    writeQueues.set(key, tracked);
    return queued;
  };

  const readState = (key: WorkbenchStateKey): string | null => {
    normalizeKey(key);
    return stateSnapshot[key];
  };

  const readStateAsync = async (key: WorkbenchStateKey): Promise<string | null> =>
    readState(key);

  const writeStateAsync = async (key: WorkbenchStateKey, json: string): Promise<void> => {
    normalizeKey(key);
    const normalizedJson = normalizeJson(json);
    if (stateSnapshot[key] === normalizedJson && !writeFailures.has(key)) {
      return;
    }
    const filePath = resolveStateFilePath(storageRoot, key);
    stateSnapshot[key] = normalizedJson;
    publish(key, normalizedJson);
    await enqueueDiskWrite(key, async () => {
      await writeFileAtomic(filePath, normalizedJson);
    });
  };

  const writeState = (key: WorkbenchStateKey, json: string): void => {
    void writeStateAsync(key, json).catch((error: unknown) => {
      console.error(`[lyra-workbench-state] write failed key=${key}: ${toErrorMessage(error)}`);
    });
  };

  const removeStateAsync = async (key: WorkbenchStateKey): Promise<void> => {
    normalizeKey(key);
    if (stateSnapshot[key] === null && !writeFailures.has(key)) {
      return;
    }
    const filePath = resolveStateFilePath(storageRoot, key);
    stateSnapshot[key] = null;
    publish(key, null);
    await enqueueDiskWrite(key, async () => {
      await rm(filePath, { force: true });
    });
  };

  const removeState = (key: WorkbenchStateKey): void => {
    void removeStateAsync(key).catch((error: unknown) => {
      console.error(`[lyra-workbench-state] remove failed key=${key}: ${toErrorMessage(error)}`);
    });
  };

  const handlers: Array<readonly [string, Parameters<typeof ipcMain.handle>[1]]> = [
    [
      LYRA_CHANNELS.workbenchStateRead,
      (_event, payload: unknown) =>
        readState(normalizeKey((payload as { readonly key?: unknown })?.key))
    ],
    [
      LYRA_CHANNELS.workbenchStateWrite,
      async (_event, payload: unknown) => {
        const key = normalizeKey((payload as { readonly key?: unknown })?.key);
        await writeStateAsync(key, (payload as { readonly json?: unknown })?.json as string);
      }
    ],
    [
      LYRA_CHANNELS.workbenchStateRemove,
      async (_event, payload: unknown) => {
        const key = normalizeKey((payload as { readonly key?: unknown })?.key);
        await removeStateAsync(key);
      }
    ]
  ];

  for (const [channel, handler] of handlers) {
    ipcMain.handle(channel, handler);
  }

  const bootstrapSnapshotListener: Parameters<typeof ipcMain.on>[1] = (event) => {
    event.returnValue = { ...stateSnapshot } satisfies WorkbenchStateSnapshot;
  };
  ipcMain.on(LYRA_CHANNELS.workbenchStateBootstrapSnapshot, bootstrapSnapshotListener);

  return {
    readState,
    readStateAsync,
    writeState,
    writeStateAsync,
    removeState,
    removeStateAsync,
    snapshot: () => ({ ...stateSnapshot }),
    flush: async () => {
      while (writeQueues.size > 0) await Promise.all([...writeQueues.values()]);
      if (writeFailures.size > 0) throw new AggregateError([...writeFailures.values()], "Workbench state could not be saved");
    },
    subscribe: (listener) => {
      stateListeners.add(listener);
      return () => {
        stateListeners.delete(listener);
      };
    },
    dispose: () => {
      stateListeners.clear();
      for (const [channel] of handlers) {
        ipcMain.removeHandler(channel);
      }
      ipcMain.removeListener(
        LYRA_CHANNELS.workbenchStateBootstrapSnapshot,
        bootstrapSnapshotListener
      );
    }
  };
};
