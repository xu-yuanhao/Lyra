import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";

export type AppPanelProps = HTMLAttributes<HTMLElement> & {
  readonly placement?: "left" | "right" | "bottom" | "center";
};

export const AppPanel = forwardRef<HTMLElement, AppPanelProps>(({
  className,
  placement = "center",
  ...props
}, ref) => (
  <section
    ref={ref}
    data-placement={placement}
    className={cn(
      "lyra-app-panel min-h-0 min-w-0 rounded-[var(--lyra-radius-10)] border border-[var(--lyra-app-material-border)] bg-[var(--lyra-app-material-panel-bg)] text-[var(--lyra-text-primary)] backdrop-blur-[var(--lyra-app-material-blur-sm)] backdrop-saturate-[var(--lyra-app-material-saturate)]",
      placement === "center" && "rounded-none",
      className
    )}
    {...props}
  />
));

AppPanel.displayName = "AppPanel";
