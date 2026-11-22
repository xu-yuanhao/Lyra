import { forwardRef } from "react";

import { AppButton, type AppButtonProps } from "./app-button";
import { cn } from "../utils";

export type AppIconButtonProps = Omit<AppButtonProps, "size"> & {
  readonly active?: boolean;
  readonly tone?: "default" | "danger" | "muted";
};

export const AppIconButton = forwardRef<HTMLButtonElement, AppIconButtonProps>(({
  active = false,
  className,
  tone = "default",
  variant = "ghost",
  ...props
}, ref) => (
  <AppButton
    ref={ref}
    size="icon"
    variant={variant}
    data-active={active ? "true" : undefined}
    data-tone={tone}
    className={cn("lyra-app-icon-button", className)}
    {...props}
  />
));

AppIconButton.displayName = "AppIconButton";
