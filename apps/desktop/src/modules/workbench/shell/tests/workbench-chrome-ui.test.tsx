import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { WorkbenchChromeToolbarContextSlot } from "../workbench-chrome-ui";
import { workbenchChromeBus } from "../workbench-chrome-bus";

const executed = vi.fn(async (_commandId: string) => null);

vi.mock("../../workspace-apps", () => ({
  executeWorkspaceAppCommand: (commandId: string) => executed(commandId)
}));

afterEach(() => {
  cleanup();
});

describe("WorkbenchChromeToolbarContextSlot", () => {
  test("renders text actions as a labelled switch with the active member pressed", async () => {
    workbenchChromeBus.set({
      scope: { kind: "workspaceTab", tabId: "settings-tab" },
      slot: "toolbarContext",
      ownerId: "lyra.credentials",
      contribution: {
        ariaLabel: "Logins",
        actions: [
          {
            id: "show-sessions",
            label: "Sessions",
            commandId: "lyra.credentials.show-sessions",
            order: 0,
            display: "text",
            active: true
          },
          {
            id: "show-passwords",
            label: "Passwords",
            commandId: "lyra.credentials.show-passwords",
            order: 2,
            display: "text"
          }
        ]
      }
    });

    render(<WorkbenchChromeToolbarContextSlot activeTabId="settings-tab" />);

    const sessions = await screen.findByRole("button", { name: "Sessions" });
    const passwords = screen.getByRole("button", { name: "Passwords" });
    expect(sessions).toHaveAttribute("aria-pressed", "true");
    expect(sessions).toHaveClass("lyra-titlebar-context-text-button", "lyra-titlebar-context-button-active");
    expect(passwords).toHaveAttribute("aria-pressed", "false");
    expect(passwords).not.toHaveClass("lyra-titlebar-context-button-active");

    passwords.click();
    expect(executed).toHaveBeenCalledWith("lyra.credentials.show-passwords");

    act(() => {
      workbenchChromeBus.clear({
        scope: { kind: "workspaceTab", tabId: "settings-tab" },
        slot: "toolbarContext",
        ownerId: "lyra.credentials"
      });
    });
  });

  test("keeps icon actions as square icon buttons", async () => {
    workbenchChromeBus.set({
      scope: { kind: "workspaceTab", tabId: "notifications-tab" },
      slot: "toolbarContext",
      ownerId: "lyra.notifications",
      contribution: {
        actions: [{
          id: "mark-all-read",
          label: "Mark all read",
          commandId: "lyra.notifications.mark-all-read",
          order: 0,
          iconKey: "check-check"
        }]
      }
    });

    render(<WorkbenchChromeToolbarContextSlot activeTabId="notifications-tab" />);

    const button = await screen.findByRole("button", { name: "Mark all read" });
    expect(button).toHaveClass("lyra-titlebar-context-icon-button");
    expect(button).not.toHaveAttribute("aria-pressed");

    act(() => {
      workbenchChromeBus.clear({
        scope: { kind: "workspaceTab", tabId: "notifications-tab" },
        slot: "toolbarContext",
        ownerId: "lyra.notifications"
      });
    });
  });
});
