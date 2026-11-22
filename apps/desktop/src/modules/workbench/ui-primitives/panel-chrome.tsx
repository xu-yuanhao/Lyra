import type { MouseEventHandler, ReactNode } from "react";

import { cx } from "./classnames";
import {
  TD_PANEL_BOTTOM_CLASS,
  TD_PANEL_BOTTOM_HIDDEN_CLASS,
  TD_PANEL_BOTTOM_CONTENT_CLASS,
} from "../terminal-dock/classes";

type PanelHostProps = {
  readonly placement: "left" | "bottom";
  readonly visible?: boolean;
  readonly ariaLabel: string;
  readonly children: ReactNode;
};

export const PanelHost = ({
  placement,
  visible = true,
  ariaLabel,
  children
}: PanelHostProps) => {
  if (placement === "left") {
    return (
      <aside
        className={cx(
          "lyra-panel lyra-panel-left",
          visible === false && "lyra-panel-left-hidden"
        )}
        aria-label={ariaLabel}
        aria-hidden={visible ? undefined : true}
      >
        <div className="lyra-panel-content lyra-panel-left-content">
          {children}
        </div>
      </aside>
    );
  }

  return (
    <footer
      className={cx(
        "lyra-panel", TD_PANEL_BOTTOM_CLASS,
        visible === false && TD_PANEL_BOTTOM_HIDDEN_CLASS
      )}
      aria-label={ariaLabel}
      aria-hidden={visible ? undefined : true}
    >
      <div className={`lyra-panel-content ${TD_PANEL_BOTTOM_CONTENT_CLASS}`}>
        {children}
      </div>
    </footer>
  );
};

type PanelResizerProps = {
  readonly orientation: "vertical" | "horizontal";
  readonly ariaLabel: string;
  readonly visible?: boolean;
  readonly onMouseDown: MouseEventHandler<HTMLDivElement>;
};

export const PanelResizer = ({
  orientation,
  ariaLabel,
  visible = true,
  onMouseDown
}: PanelResizerProps) => (
  <div
    className={cx(
      "lyra-resizer",
      orientation === "vertical"
        ? "lyra-resizer-vertical"
        : "lyra-resizer-horizontal",
      visible === false && "lyra-resizer-hidden"
    )}
    role="separator"
    aria-label={ariaLabel}
    aria-hidden={visible ? undefined : true}
    aria-orientation={orientation}
    onMouseDown={onMouseDown}
  />
);
