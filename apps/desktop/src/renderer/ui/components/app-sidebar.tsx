import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export const APP_SIDEBAR_SPLIT_CLASS =
  "lyra-app-sidebar-split relative after:content-[''] after:absolute after:inset-y-0 after:left-[calc(var(--lyra-app-sidebar-rail-w)-var(--lyra-space-6))] after:z-[var(--lyra-z-floating)] after:w-[var(--lyra-space-12)] after:cursor-col-resize max-[720px]:after:hidden";

export type AppSidebarProps = HTMLAttributes<HTMLElement>;

/**
 * Sidebar navigation container. Compose with `AppSidebarSection` + `AppObjectRow`
 * items (give each row `className="lyra-app-sidebar-nav-item"`). Visuals come from
 * the shared `.lyra-app-sidebar-nav*` styles, not per-surface CSS.
 */
export const AppSidebar = forwardRef<HTMLElement, AppSidebarProps>(({
  className,
  ...props
}, ref) => (
  <aside
    ref={ref}
    className={cn(
      "lyra-app-sidebar-nav relative flex min-h-0 min-w-[var(--lyra-app-sidebar-rail-min-w)] flex-col gap-[var(--lyra-app-sidebar-rail-gap)] overflow-auto border-r border-[var(--lyra-app-border)] bg-[var(--lyra-app-material-sidebar-bg)] px-[var(--lyra-app-sidebar-rail-pad-x)] py-[var(--lyra-app-sidebar-rail-pad-y)] backdrop-blur-[var(--lyra-app-material-blur-sm)] backdrop-saturate-[var(--lyra-app-material-saturate)]",
      "[--lyra-app-sidebar-row-hover-bg:var(--lyra-app-row-hover-bg)] [--lyra-app-sidebar-row-active-bg:var(--lyra-app-row-active-bg)]",
      className
    )}
    {...props}
  />
));

AppSidebar.displayName = "AppSidebar";

export type AppSidebarSectionProps = HTMLAttributes<HTMLDivElement> & {
  readonly label?: ReactNode;
};

export const AppSidebarSection = forwardRef<HTMLDivElement, AppSidebarSectionProps>(({
  children,
  className,
  label,
  ...props
}, ref) => (
  <div
    ref={ref}
    className={cn(
      "lyra-app-sidebar-nav-list grid min-w-0 gap-[var(--lyra-app-sidebar-row-gap)]",
      className
    )}
    {...props}
  >
    {label === undefined ? null : (
      <span className="lyra-app-sidebar-nav-label px-[var(--lyra-app-sidebar-row-pad-x)] pb-[var(--lyra-space-6)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-14)] font-semibold text-[var(--lyra-text-muted)]">
        {label}
      </span>
    )}
    {children}
  </div>
));

AppSidebarSection.displayName = "AppSidebarSection";
