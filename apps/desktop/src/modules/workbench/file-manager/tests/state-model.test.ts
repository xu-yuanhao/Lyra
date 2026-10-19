import { describe, expect, test } from "vitest";

import type {
  FileManagerDirectoryPatch,
  FileManagerEntry,
  FileManagerLocation,
  FileManagerReadDirectoryResponse
} from "../../../../shared/file-manager";
import type { FileManagerSurfaceLabels } from "../types";
import {
  applyDirectoryPatchToState,
  buildDirectoryState,
  createInitialState,
  isPathInsideMount,
  mergeRecentLocations,
  withHistory
} from "../state-model";

const labels = {
  title: "Files",
  downloadManagerTitle: "Downloads"
} as FileManagerSurfaceLabels;

const directoryLocation: FileManagerLocation = {
  id: "documents",
  title: "Documents",
  kind: "directory",
  path: "/home/lyra/Documents"
};

const directoryEntry: FileManagerEntry = {
  id: "projects",
  name: "Projects",
  path: "/home/lyra/Documents/Projects",
  kind: "directory",
  folderState: "non-empty",
  isHidden: false
};

const fileEntry: FileManagerEntry = {
  id: "readme",
  name: "README.md",
  path: "/home/lyra/Documents/README.md",
  kind: "file",
  extension: "md",
  isHidden: false
};

describe("file manager state model", () => {
  test("deduplicates history when opening the current location", () => {
    const initial = createInitialState("file-manager-test", labels);
    const first = withHistory(initial, directoryLocation, true);
    const nextState = {
      ...initial,
      ...first
    };

    expect(withHistory(nextState, directoryLocation, true)).toEqual(first);
  });

  test("caps and deduplicates recent locations by path", () => {
    const current = Array.from({ length: 12 }, (_, index) => ({
      id: `recent-${index}`,
      title: `Recent ${index}`,
      path: `/tmp/recent-${index}`,
      lastOpenedAt: "2026-01-01T00:00:00.000Z"
    }));

    const next = mergeRecentLocations(current, {
      id: "recent-5-new",
      title: "Recent 5",
      kind: "directory",
      path: "/tmp/recent-5"
    });

    expect(next).toHaveLength(12);
    expect(next[0]).toMatchObject({
      id: "recent-5-new",
      path: "/tmp/recent-5"
    });
    expect(next.filter((item) => item.path === "/tmp/recent-5")).toHaveLength(1);
  });

  test("builds sorted directory state and resets transient selection", () => {
    const current = {
      ...createInitialState("file-manager-test", labels),
      selectedEntryIds: ["old-entry"],
      selectionAnchorId: "old-entry",
      createDraft: {
        kind: "file" as const,
        value: "draft.txt"
      }
    };
    const payload: FileManagerReadDirectoryResponse = {
      location: directoryLocation,
      parentPath: "/home/lyra",
      entries: [fileEntry, directoryEntry]
    };

    const next = buildDirectoryState(current, payload, labels, true, {
      subscriptionId: "subscription-1",
      generation: 3
    });

    expect(next.entries.map((entry) => entry.id)).toEqual(["projects", "readme"]);
    expect(next.directorySubscriptionId).toBe("subscription-1");
    expect(next.directoryGeneration).toBe(3);
    expect(next.selectedEntryIds).toEqual([]);
    expect(next.selectionAnchorId).toBeUndefined();
    expect(next.createDraft).toBeUndefined();
  });

  test("ignores stale directory patches", () => {
    const state = buildDirectoryState(
      createInitialState("file-manager-test", labels),
      {
        location: directoryLocation,
        entries: [directoryEntry]
      },
      labels,
      true,
      {
        subscriptionId: "subscription-1",
        generation: 5
      }
    );
    const patch: FileManagerDirectoryPatch = {
      subscriptionId: "subscription-1",
      directoryPath: directoryLocation.path!,
      generation: 4,
      kind: "remove",
      path: directoryEntry.path
    };

    expect(applyDirectoryPatchToState(state, patch, labels)).toBe(state);
  });

  test("applies rename patches and moves selection to the renamed entry", () => {
    const state = {
      ...buildDirectoryState(
        createInitialState("file-manager-test", labels),
        {
          location: directoryLocation,
          entries: [directoryEntry, fileEntry]
        },
        labels,
        true,
        {
          subscriptionId: "subscription-1",
          generation: 5
        }
      ),
      selectedEntryIds: [directoryEntry.id],
      selectionAnchorId: directoryEntry.id
    };
    const renamedEntry: FileManagerEntry = {
      ...directoryEntry,
      id: "archive",
      name: "Archive",
      path: "/home/lyra/Documents/Archive"
    };
    const patch: FileManagerDirectoryPatch = {
      subscriptionId: "subscription-1",
      directoryPath: directoryLocation.path!,
      generation: 6,
      kind: "rename",
      oldPath: directoryEntry.path,
      newPath: renamedEntry.path,
      entry: renamedEntry
    };

    const next = applyDirectoryPatchToState(state, patch, labels);

    expect(next.selectedEntryIds).toEqual(["archive"]);
    expect(next.selectionAnchorId).toBe("archive");
    expect(next.entries.map((entry) => entry.path)).toEqual([
      renamedEntry.path,
      fileEntry.path
    ]);
  });

  test("compares mount paths with platform-aware casing", () => {
    expect(isPathInsideMount("C:\\Users\\Lyra\\Desktop", "c:/users/lyra", "win32")).toBe(true);
    expect(isPathInsideMount("/Volumes/Data/Project", "/volumes/data", "darwin")).toBe(true);
    expect(isPathInsideMount("/mnt/Data/Project", "/mnt/data", "linux")).toBe(false);
  });
});
