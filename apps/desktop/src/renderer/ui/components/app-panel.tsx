import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";

export const APP_MODULE_CLASS =
  "lyra-app-module box-border h-full w-full min-h-0 min-w-0 bg-[var(--lyra-app-panel-bg)] font-[family-name:var(--lyra-font-ui)] text-[var(--lyra-text-primary)]";

export const APP_MODULE_TOOLBAR_CLASS =
  "lyra-app-module-toolbar flex min-w-0 items-center gap-[var(--lyra-space-8)] overflow-x-auto border-b border-[var(--lyra-app-border)] px-[var(--lyra-space-12)] py-[var(--lyra-space-8)]";

export const APP_MODULE_FOOTER_CLASS =
  "lyra-app-module-footer flex min-w-0 items-center justify-between gap-[var(--lyra-space-8)] border-t border-[var(--lyra-app-border)] px-[var(--lyra-space-12)] py-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-secondary)]";

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
