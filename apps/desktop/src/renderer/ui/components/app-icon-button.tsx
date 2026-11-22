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
    className={cn(
      "lyra-app-icon-button size-[var(--lyra-control-h-28)] rounded-[var(--lyra-radius-8)] border-transparent text-[var(--lyra-text-muted)] opacity-[0.78] [&_svg]:size-[var(--lyra-icon-size-14)] [&_svg]:[stroke-width:1.8]",
      "hover:border-transparent hover:bg-transparent hover:text-[var(--lyra-text-primary)] hover:opacity-100",
      "data-[active=true]:border-transparent data-[active=true]:bg-transparent data-[active=true]:text-[var(--lyra-text-primary)] data-[active=true]:opacity-100",
      "active:scale-[0.94]",
      tone === "danger" && "data-[tone=danger]:hover:border-transparent data-[tone=danger]:hover:bg-transparent data-[tone=danger]:hover:text-[var(--lyra-status-error)]",
      className
    )}
    {...props}
  />
));

AppIconButton.displayName = "AppIconButton";
