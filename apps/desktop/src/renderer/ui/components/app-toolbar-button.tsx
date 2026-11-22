import { forwardRef, type ReactNode } from "react";

import { AppIconButton, type AppIconButtonProps } from "./app-icon-button";
import { cn } from "../utils";

export type AppToolbarButtonProps = AppIconButtonProps & {
  readonly label?: ReactNode;
};

export const AppToolbarButton = forwardRef<HTMLButtonElement, AppToolbarButtonProps>(({
  children,
  className,
  label,
  ...props
}, ref) => (
  <AppIconButton
    ref={ref}
    className={cn(
      "lyra-app-toolbar-button",
      label !== undefined && "lyra-app-toolbar-button-with-label w-auto px-[var(--lyra-space-8)]",
      className
    )}
    {...props}
  >
    {children}
    {label === undefined ? null : (
      <span className="lyra-app-toolbar-button-label min-w-0 overflow-hidden text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-inherit text-ellipsis whitespace-nowrap">
        {label}
      </span>
    )}
  </AppIconButton>
));

AppToolbarButton.displayName = "AppToolbarButton";
