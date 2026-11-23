import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { resetWorkspaceProblemsStore } from "../../bottom-aux/problems";
import { TerminalDock } from "../view";
import type { TerminalDockProps } from "../types";

vi.mock("../pane-surface", () => ({
  TerminalPaneSurface: ({
    pane
  }: {
    readonly pane: { readonly id: string };
  }) => <div aria-label={`pane-${pane.id}`} />
}));

const createProps = (): TerminalDockProps => ({
  desktopApi: {
    terminal: {}
  } as unknown as TerminalDockProps["desktopApi"],
  labels: {
    newTab: "new",
    splitHorizontal: "split-horizontal",
    splitVertical: "split-vertical",
    moveTerminalToTop: "move-top",
    moveTerminalToBottom: "move-bottom",
    closeTab: "close",
    closePane: "close-pane",
    newTabWithProfile: "new-profile",
    profile: "profile",
    renameTab: "rename",
    pinTab: "pin",
    unpinTab: "unpin",
    favoriteTab: "favorite",
    unfavoriteTab: "unfavorite",
    exited: "exited",
    unavailable: "unavailable"
  },
  themeSignature: "lyra-dark:dark",
  uiThemeId: "lyra-dark",
  terminalPanelSide: "bottom",
  model: {
    state: {
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          title: "Terminal",
          orientation: "horizontal",
          paneIds: ["pane-1"],
          activePaneId: "pane-1",
          placement: "dock"
        }
      ],
      panes: {
        "pane-1": {
          id: "pane-1",
          sessionId: "session-1",
          title: "Terminal"
        }
      }
    },
    dockTabs: [
      {
        id: "tab-1",
        title: "Terminal",
        orientation: "horizontal",
        paneIds: ["pane-1"],
        activePaneId: "pane-1",
        placement: "dock"
      }
    ],
    workspaceTabs: [],
    activeDockTab: {
      id: "tab-1",
      title: "Terminal",
      orientation: "horizontal",
      paneIds: ["pane-1"],
      activePaneId: "pane-1",
      placement: "dock"
    },
    activeDockPanes: [
      {
        id: "pane-1",
        sessionId: "session-1",
        title: "Terminal"
      }
    ],
    restoreRequest: { sessions: [] },
    findTab: vi.fn(() => null),
    getTabPanes: vi.fn(() => []),
    setActiveTab: vi.fn(),
    openTab: vi.fn(),
    openTabWithProfile: vi.fn(),
    openTabWithPlacement: vi.fn(),
    renameTab: vi.fn(),
    toggleTabPinned: vi.fn(),
    toggleTabFavorite: vi.fn(),
    closeTab: vi.fn(),
    moveTabToWorkspace: vi.fn(),
    moveTabToDock: vi.fn(),
    reorderDockTab: vi.fn(),
    splitActivePane: vi.fn(),
    splitTab: vi.fn(),
    splitTabWithOptions: vi.fn(() => null),
    focusPane: vi.fn(),
    setPaneFollowMode: vi.fn(),
    closePane: vi.fn(),
    syncRestoredSessions: vi.fn(),
    applyCwdChanged: vi.fn()
  },
  onRequestCloseTab: vi.fn(),
  onRequestTabContextMenu: vi.fn(),
  onToggleTerminalPanelSide: vi.fn()
});

describe("terminal dock problems tabs", () => {
  afterEach(() => {
    resetWorkspaceProblemsStore();
  });
  test("renders a project Problems tab beside terminals without hiding the PTY", () => {
    const props = createProps();
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    const onClearSelection = vi.fn();
    render(
      <TerminalDock
        {...props}
        problems={{
          tabs: [
            {
              id: "problems:tree-a",
              instanceId: "tree-a",
              title: "Lyra",
              rootPath: "/work/Lyra"
            }
          ],
          activeId: "problems:tree-a",
          labels: {
            list: "Problems",
            empty: "No problems"
          },
          onSelectTab,
          onCloseTab,
          onClearSelection,
          onOpenFile: vi.fn()
        }}
      />
    );

    expect(screen.getByRole("tab", { name: "Lyra" })).toBeInTheDocument();
    expect(screen.getByText("No problems")).toBeInTheDocument();
    expect(screen.getByLabelText("pane-pane-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "split-horizontal" })).toBeDisabled();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Terminal" }));
    expect(onClearSelection).toHaveBeenCalled();
    expect(props.model.setActiveTab).toHaveBeenCalledWith("tab-1");
  });
});
