import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import type {
  LoginManagerSnapshot,
  LyraSoftwareManifest
} from "../../../../shared/desktop-bridge";
import {
  createSoftwareStateReaders,
  redactedLoginManagerSnapshot
} from "../state-readers";

const software: readonly LyraSoftwareManifest[] = [
  {
    id: "file-manager",
    title: "Files",
    description: "File manager",
    source: "builtin",
    actions: [{
      id: "file-manager.openHome",
      title: "Open Home",
      description: "Open home",
      risk: "navigate"
    }]
  }
];

describe("software capability state readers", () => {
  test("reads the active file manager state and truncates large listings", () => {
    const entries = Array.from({ length: 101 }, (_, index) => ({
      id: `entry-${index}`,
      name: `entry-${index}.txt`,
      path: `/tmp/entry-${index}.txt`,
      kind: "file" as const,
      isHidden: false
    }));
    const readers = createSoftwareStateReaders({
      desktopApi: null,
      tabsModel: {
        activeTabId: "files-tab",
        tabs: [{
          id: "files-tab",
          pageKind: "app",
          appId: "file-manager",
          appInstanceId: "files-instance",
          title: "Files"
        }]
      } as never,
      fileManagerModel: {
        getState: vi.fn(() => ({
          viewKind: "directory",
          currentLocation: {
            id: "tmp",
            title: "tmp",
            kind: "directory",
            path: "/tmp"
          },
          selectedEntryIds: ["entry-0"],
          entries
        }))
      } as never,
      imageViewerModel: undefined,
      terminalModel: undefined,
      loginManagerSnapshot: null,
      software
    });

    expect(readers.readFileManagerState()).toMatchObject({
      available: true,
      tabId: "files-tab",
      appInstanceId: "files-instance",
      selectedEntryId: "entry-0",
      entries: expect.any(Array),
      truncated: true
    });
    const state = readers.readFileManagerState() as { readonly entries: readonly unknown[] };
    expect(state.entries).toHaveLength(100);
  });

  test("summarizes installed software without exposing action schemas", () => {
    const readers = createSoftwareStateReaders({
      desktopApi: null,
      tabsModel: {
        activeTabId: null,
        tabs: []
      } as never,
      fileManagerModel: {
        getState: vi.fn(() => null)
      } as never,
      imageViewerModel: undefined,
      terminalModel: undefined,
      loginManagerSnapshot: null,
      software
    });

    expect(readers.readSoftwareState({ softwareId: "software-store" })).toEqual({
      softwareId: "software-store",
      state: {
        installed: [{
          id: "file-manager",
          title: "Files",
          source: "builtin",
          actionCount: 1
        }]
      }
    });
  });

  test("redacts Login Manager storage details and password text", () => {
    const snapshot = {
      version: 1,
      generatedAt: "2026-06-11T00:00:00.000Z",
      storageRoot: "/private/login-manager",
      passwordsAvailable: true,
      passwordStorageReason: undefined,
      sessions: [],
      credentials: [{
        id: "credential-1",
        origin: "https://example.com",
        hostname: "example.com",
        username: "alice@example.com",
        authMethod: {
          kind: "password",
          label: "Password",
          source: "observed",
          confidence: 1
        },
        hasPassword: true,
        passwordAvailable: true,
        password: "super-secret-password",
        createdAt: "2026-06-11T00:00:00.000Z",
        updatedAt: "2026-06-11T00:00:00.000Z"
      }]
    } as unknown as LoginManagerSnapshot;

    const redacted = redactedLoginManagerSnapshot(snapshot);
    const serialized = JSON.stringify(redacted);

    expect(redacted).toMatchObject({
      available: true,
      credentials: [{
        id: "credential-1",
        username: "alice@example.com",
        hasPassword: true
      }]
    });
    expect(serialized).not.toContain("storageRoot");
    expect(serialized).not.toContain("super-secret-password");
  });
});
