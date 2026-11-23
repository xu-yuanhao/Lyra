import { useMemo } from "react";

import { TerminalPaneSurface } from "./pane-surface";
import { TITLEBAR_CONTEXT_CHIP_CLASS } from "../shell/classes";
import type {
  TerminalDockLabels,
  TerminalDockPane,
  TerminalDockTab
} from "./types";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import {
  TD_WORKSPACE_SURFACE_CLASS,
  TD_PANES_CLASS,
  TD_PANES_HORIZONTAL_CLASS,
  TD_PANES_VERTICAL_CLASS,
} from "./classes";

export type TerminalWorkspaceSurfaceProps = {
  readonly desktopApi: LyraDesktopApi | null;
  readonly labels: TerminalDockLabels;
  readonly themeSignature: string;
  readonly uiThemeId: string;
  readonly tab: TerminalDockTab;
  readonly panes: readonly TerminalDockPane[];
  readonly onFocusPane: (paneId: string) => void;
  readonly onClosePane: (paneId: string) => void;
  readonly onOpenTab: () => void;
  readonly onSplitHorizontal: () => void;
  readonly onSplitVertical: () => void;
  readonly onMoveToDock: () => void;
};

export const TerminalWorkspaceSurface = ({
  desktopApi,
  labels,
  themeSignature,
  uiThemeId,
  tab,
  panes,
  onFocusPane,
  onClosePane
}: TerminalWorkspaceSurfaceProps) => {
  const contribution = useMemo(
    () => ({
      ariaLabel: tab.title,
      content: (
        <span className={TITLEBAR_CONTEXT_CHIP_CLASS}>{String(panes.length)}</span>
      )
    }),
    [panes.length, tab.title]
  );
  useWorkbenchTitlebarContribution(contribution);

  return (
    <section className={TD_WORKSPACE_SURFACE_CLASS} aria-label="terminal-workspace-surface">
      <section
        className={
          tab.orientation === "vertical"
            ? `${TD_PANES_CLASS} ${TD_PANES_VERTICAL_CLASS}`
            : `${TD_PANES_CLASS} ${TD_PANES_HORIZONTAL_CLASS}`
        }
      >
        {panes.map((pane) => (
          <TerminalPaneSurface
            key={pane.id}
            pane={pane}
            terminalTabId={tab.id}
            active={pane.id === tab.activePaneId}
            desktopApi={desktopApi}
            labels={labels}
            themeSignature={themeSignature}
            uiThemeId={uiThemeId}
            canClose={panes.length > 1}
            onClose={() => {
              onClosePane(pane.id);
            }}
            onFocus={() => {
              onFocusPane(pane.id);
            }}
          />
        ))}
      </section>
    </section>
  );
};
