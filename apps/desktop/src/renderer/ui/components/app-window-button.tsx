import { forwardRef } from "react";

import { AppIconButton, type AppIconButtonProps } from "./app-icon-button";
import { cn } from "../utils";

export type AppWindowButtonAction = "minimize" | "maximize" | "close";

export type AppWindowButtonProps = Omit<AppIconButtonProps, "active" | "tone"> & {
  readonly action: AppWindowButtonAction;
  readonly active?: boolean;
};

export const AppWindowButton = forwardRef<HTMLButtonElement, AppWindowButtonProps>(({
  action,
  active = false,
  className,
  ...props
}, ref) => (
  <AppIconButton
    ref={ref}
    active={active}
    tone={action === "close" ? "danger" : "muted"}
    data-window-action={action}
    className={cn(
      "lyra-app-window-button size-[var(--lyra-size-icon-button-w)] border-transparent text-[var(--lyra-text-secondary)] opacity-[var(--lyra-opacity-icon-dim)] hover:bg-transparent hover:opacity-100 data-[active=true]:opacity-100 data-[window-action=close]:hover:text-[var(--lyra-window-close-hover-bg)]",
      className
    )}
    {...props}
  />
));

AppWindowButton.displayName = "AppWindowButton";
