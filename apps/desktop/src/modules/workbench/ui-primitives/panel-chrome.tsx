import type { MouseEventHandler, ReactNode } from "react";

import {
  PANEL_BASE_CLASS,
  PANEL_LEFT_CLASS,
  PANEL_LEFT_CONTENT_CLASS,
  PANEL_LEFT_HIDDEN_CLASS,
  RESIZER_BASE_CLASS,
  RESIZER_HIDDEN_CLASS,
  RESIZER_HORIZONTAL_CLASS,
  RESIZER_VERTICAL_CLASS
} from "../shell/classes";
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
          PANEL_BASE_CLASS,
          PANEL_LEFT_CLASS,
          visible === false && PANEL_LEFT_HIDDEN_CLASS
        )}
        aria-label={ariaLabel}
        aria-hidden={visible ? undefined : true}
      >
        <div className={PANEL_LEFT_CONTENT_CLASS}>
          {children}
        </div>
      </aside>
    );
  }

  return (
    <footer
      className={cx(
        PANEL_BASE_CLASS, TD_PANEL_BOTTOM_CLASS,
        visible === false && TD_PANEL_BOTTOM_HIDDEN_CLASS
      )}
      aria-label={ariaLabel}
      aria-hidden={visible ? undefined : true}
    >
      <div className={TD_PANEL_BOTTOM_CONTENT_CLASS}>
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
      RESIZER_BASE_CLASS,
      orientation === "vertical"
        ? RESIZER_VERTICAL_CLASS
        : RESIZER_HORIZONTAL_CLASS,
      visible === false && RESIZER_HIDDEN_CLASS
    )}
    role="separator"
    aria-label={ariaLabel}
    aria-hidden={visible ? undefined : true}
    aria-orientation={orientation}
    onMouseDown={onMouseDown}
  />
);
