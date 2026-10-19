import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { AgentApi } from "../../../shared/agent";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import { SettingsImportView, type SettingsImportLabels } from "./view";

const labels: SettingsImportLabels = {
  title: "Import Settings", description: "Sync settings",
  detect: "Detect", sync: "Sync",
  synced: "Synced", needsAttention: "Needs attention", noContent: "Nothing to sync",
  skills: "Skills", mcp: "MCP", back: "Import Settings", loading: "Working", unavailable: "Unavailable",
  browsersDescription: "Copy the signed-in state of a browser profile.",
  browserImport: "Import", browserEmpty: "No browser profile with data to import was found.",
  cookies: "cookies", sites: "sites",
  browserIssueKeyring: "the system keyring did not release the decryption key",
  browserIssueAppBound: "this browser protects its cookies with app-bound encryption",
  browserIssueGeneric: "some data could not be read"
};

const createApi = () => {
  const detectImport = vi.fn(async () => ({
    detectionId: "detection-1", sourceId: "claude" as const,
    counts: { pending: 2 }, diagnostics: [], candidates: [
      { kind: "skill" as const, scope: "user" as const, sourcePath: "/home/.claude/skills/demo", sourceItemId: "demo", targetId: "demo", status: "pending" as const, enabled: true },
      { kind: "mcp" as const, scope: "user" as const, sourcePath: "/home/.mcp.json", sourceItemId: "server", targetId: "server", status: "pending" as const, enabled: true }
    ]
  }));
  const agent = {
    listImportSources: vi.fn(async () => ({ sources: [
      { id: "claude" as const, label: "Claude", configPath: "/home/.claude" },
      { id: "cursor" as const, label: "Cursor", configPath: "/home/.cursor" },
      { id: "codex" as const, label: "Codex", configPath: "/home/.codex" },
      { id: "opencode" as const, label: "OpenCode", configPath: "/home/.config/opencode" },
      { id: "zed" as const, label: "Zed", configPath: "/home/.config/zed" }
    ] })),
    getImportPreferences: vi.fn(async () => ({ sources: { claude: { skills: true, mcp: true }, cursor: { skills: true, mcp: true }, codex: { skills: true, mcp: true }, opencode: { skills: true, mcp: true }, zed: { skills: true, mcp: true } } })),
    setImportPreferences: vi.fn(async () => ({ sources: { claude: { skills: true, mcp: true }, cursor: { skills: true, mcp: true }, codex: { skills: true, mcp: true }, opencode: { skills: true, mcp: true }, zed: { skills: true, mcp: true } } })),
    detectImport,
    syncImport: vi.fn(async () => ({ sourceId: "claude" as const, results: [], diagnostics: [] }))
  } as unknown as AgentApi;
  const desktopApi = { agent, files: { selectDirectories: vi.fn(async () => []) } } as unknown as LyraDesktopApi;
  return { agent, desktopApi, detectImport };
};

describe("SettingsImportView", () => {
  test("detects a visible source and exposes persisted kind toggles", async () => {
    const { desktopApi, detectImport } = createApi();
    render(<SettingsImportView desktopApi={desktopApi} labels={labels} />);

    const detectButtons = await screen.findAllByRole("button", { name: "Detect" });
    const [detect] = detectButtons;
    expect(detect).toBeDefined();
    expect(detectButtons).toHaveLength(5);
    for (const button of detectButtons) {
      expect(button).toHaveClass("lyra-settings-ai-action");
    }
    const sourceRows = document.querySelectorAll(".lyra-settings-row-list > .lyra-settings-import-source");
    expect(sourceRows).toHaveLength(5);
    expect(document.querySelector(".lyra-settings-group-header")).toBeNull();
    for (const sourceId of ["claude", "cursor", "codex", "opencode", "zed"]) {
      expect(document.querySelector(`.lyra-settings-import-source-icon[src*="${sourceId}"]`))
        .toBeInTheDocument();
    }
    for (const configPath of ["/home/.claude", "/home/.cursor", "/home/.codex", "/home/.config/opencode", "/home/.config/zed"]) {
      expect(screen.queryByText(configPath)).toBeNull();
    }
    expect(document.querySelector(".lyra-settings-import"))
      .toHaveClass("lyra-settings-import");
    fireEvent.click(detect!);
    await waitFor(() => expect(detectImport).toHaveBeenCalledWith({ sourceId: "claude" }));
    expect(await screen.findByRole("button", { name: "Sync" })).toBeInTheDocument();

    fireEvent.click(screen.getByText("Claude"));
    expect(screen.getByRole("switch", { name: "Skills" })).toBeChecked();
    expect(screen.getByRole("switch", { name: "MCP" })).toBeChecked();
  });

  test("lists every detected browser profile in the agent list and badges its account picture", async () => {
    const run = vi.fn(async () => ({
      profileId: "/home/.config/chromium/Default",
      cookies: { imported: 412, skipped: 0, failed: 0 },
      localStorage: { originsImported: 3, entriesImported: 9, originsSkipped: 0, originsFailed: 0 }
    }));
    const desktopApi = {
      agent: createApi().agent,
      browserImport: {
        listProfiles: vi.fn(async () => ({
          profiles: [
            {
              id: "/home/.config/chromium/Default", browser: "chromium", browserLabel: "Chromium",
              family: "chromium", profileName: "Work", accountEmail: "work@example.com",
              avatarDataUrl: "data:image/png;base64,iVBORw0KGgo=",
              profilePath: "/home/.config/chromium/Default", isDefault: true, lastUsed: false
            },
            {
              id: "/home/.config/chromium/Profile 2", browser: "chromium", browserLabel: "Chromium",
              family: "chromium", profileName: "Pete", accountEmail: "pete@example.com",
              profilePath: "/home/.config/chromium/Profile 2", isDefault: false, lastUsed: true
            }
          ]
        })),
        run
      }
    } as unknown as LyraDesktopApi;
    render(<SettingsImportView desktopApi={desktopApi} labels={labels} />);

    // The browser rows join the agent rows: one list, one divider rule, no section of their own.
    expect(await screen.findByText("Chromium · Work")).toBeInTheDocument();
    expect(screen.getByText("Chromium · Pete")).toBeInTheDocument();
    expect(document.querySelectorAll(".lyra-settings-import-browser")).toHaveLength(2);
    expect(document.querySelectorAll(".lyra-settings-row-list > .lyra-settings-import-source"))
      .toHaveLength(7);
    expect(document.querySelectorAll(".lyra-settings-group")).toHaveLength(1);
    expect(document.querySelectorAll(".lyra-settings-group-header")).toHaveLength(0);

    // The browser mark carries the row; the account shows as a corner badge instead of a line.
    expect(document.querySelectorAll(".lyra-settings-import-browser .lyra-settings-import-source-icon[src*=\"chromium\"]"))
      .toHaveLength(2);
    expect(screen.queryByText("work@example.com")).toBeNull();
    expect(screen.queryByText("pete@example.com")).toBeNull();
    const avatars = document.querySelectorAll(".lyra-settings-import-browser .lyra-settings-import-source-avatar");
    expect(avatars).toHaveLength(2);
    expect(avatars[0]?.querySelector(".lyra-identity-icon-image"))
      .toHaveAttribute("src", "data:image/png;base64,iVBORw0KGgo=");
    // A profile whose browser cached no picture falls back to the account initial.
    expect(avatars[1]?.querySelector(".lyra-identity-icon-image")).toBeNull();
    expect(avatars[1]?.textContent).toBe("P");

    fireEvent.click(screen.getAllByRole("button", { name: labels.browserImport })[0]!);
    await waitFor(() =>
      expect(run).toHaveBeenCalledWith({ profileId: "/home/.config/chromium/Default" })
    );
    expect(await screen.findByText("412 cookies · 3 sites")).toBeInTheDocument();
  });

  test("says so when no browser profile can be imported", async () => {
    const desktopApi = {
      agent: createApi().agent,
      browserImport: { listProfiles: vi.fn(async () => ({ profiles: [] })), run: vi.fn() }
    } as unknown as LyraDesktopApi;

    render(<SettingsImportView desktopApi={desktopApi} labels={labels} />);

    const empty = await screen.findByText(labels.browserEmpty);
    expect(empty.closest(".lyra-settings-row-list")).not.toBeNull();
  });
});
