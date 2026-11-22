import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";

export type AppListProps = HTMLAttributes<HTMLDivElement>;

/**
 * Vertical list container for `AppObjectRow` items. Provides the shared
 * `.lyra-app-row-list` spacing/state context so surfaces stop hand-rolling the
 * wrapper div. Layout-only; row visuals come from `AppObjectRow`.
 */
export const AppList = forwardRef<HTMLDivElement, AppListProps>(({
  className,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={cn(
      "lyra-app-row-list grid min-w-0 gap-0 p-[var(--lyra-space-4)] [--lyra-app-row-list-row-min-height:var(--lyra-control-h-40)]",
      "[&>.lyra-app-object-row]:min-h-[var(--lyra-app-row-list-row-min-height)] [&>.lyra-app-object-row]:rounded-[var(--lyra-radius-6)] [&>.lyra-app-object-row]:border-transparent [&>.lyra-app-object-row]:bg-transparent",
      "[&>.lyra-app-object-row:hover:not(:disabled)]:bg-[var(--lyra-app-row-hover-bg)]",
      "[&>.lyra-app-object-row[data-active=true]]:bg-[var(--lyra-app-row-active-bg)]",
      className
    )}
    {...props}
  />
));

AppList.displayName = "AppList";
