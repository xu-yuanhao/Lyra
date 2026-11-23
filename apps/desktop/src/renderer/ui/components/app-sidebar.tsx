import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export const APP_SIDEBAR_SPLIT_CLASS =
  "lyra-app-sidebar-split relative after:content-[''] after:absolute after:inset-y-0 after:left-[calc(var(--lyra-app-sidebar-rail-w)-var(--lyra-space-6))] after:z-[var(--lyra-z-floating)] after:w-[var(--lyra-space-12)] after:cursor-col-resize max-[720px]:after:hidden";

export const APP_SIDEBAR_ROW_AGE_CLASS =
  "lyra-app-sidebar-row-age flex-none text-[var(--lyra-text-muted)] tabular-nums text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-14)] whitespace-nowrap pointer-events-none max-[720px]:hidden [.lyra-app-sidebar-row:hover_&]:hidden [.lyra-app-sidebar-row:focus-within_&]:hidden";

export const APP_SIDEBAR_ROW_ACTION_CLASS =
  "lyra-app-sidebar-row-action [&.lyra-app-icon-button]:hidden [&.lyra-app-icon-button]:size-[var(--lyra-control-h-24)] [&.lyra-app-icon-button]:text-[var(--lyra-text-muted)] [.lyra-app-sidebar-row:hover_&]:inline-flex [.lyra-app-sidebar-row:focus-within_&]:inline-flex max-[720px]:[&.lyra-app-icon-button]:inline-flex";

export const APP_SIDEBAR_GROUP_CLASS = cn(
  "lyra-app-sidebar-group relative grid min-h-[var(--lyra-app-sidebar-row-h)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center rounded-[var(--lyra-app-sidebar-row-radius)] px-[var(--lyra-app-sidebar-row-pad-x)] py-0 text-[var(--lyra-text-secondary)] hover:text-[var(--lyra-text-primary)] hover:bg-[var(--lyra-app-row-hover-bg)] has-[.lyra-app-sidebar-group-toggle:focus-visible]:text-[var(--lyra-text-primary)] has-[.lyra-app-sidebar-group-toggle:focus-visible]:bg-[var(--lyra-app-row-hover-bg)]",
  "[&_.lyra-agent-project-tree-icon-slot]:w-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-agent-project-tree-icon-slot]:h-[var(--lyra-app-sidebar-icon-size)] [&_.lyra-agent-project-tree-icon-slot]:flex-basis-[var(--lyra-app-sidebar-icon-size)]",
  "[&:hover_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-entry-icon]:opacity-0 [&:has(.lyra-app-sidebar-group-toggle:focus-visible)_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-entry-icon]:opacity-0 [&:hover_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-twist]:opacity-100 [&:has(.lyra-app-sidebar-group-toggle:focus-visible)_.lyra-agent-project-tree-icon-slot.has-twist_.lyra-agent-project-tree-twist]:opacity-100"
);

export const APP_SIDEBAR_GROUP_TOGGLE_CLASS =
  "lyra-app-sidebar-group-toggle [&.lyra-ui-button]:w-full [&.lyra-ui-button]:min-w-0 [&.lyra-ui-button]:h-[var(--lyra-app-sidebar-row-h)] [&.lyra-ui-button]:min-h-[var(--lyra-app-sidebar-row-h)] [&.lyra-ui-button]:grid [&.lyra-ui-button]:grid-cols-[var(--lyra-app-sidebar-icon-size)_minmax(0,1fr)] [&.lyra-ui-button]:items-center [&.lyra-ui-button]:justify-start [&.lyra-ui-button]:gap-[var(--lyra-space-8)] [&.lyra-ui-button]:p-0 [&.lyra-ui-button]:px-0 [&.lyra-ui-button]:rounded-none [&.lyra-ui-button]:text-inherit [&.lyra-ui-button]:bg-transparent [&.lyra-ui-button]:text-left [&.lyra-ui-button]:hover:bg-transparent [&.lyra-ui-button]:hover:text-inherit [&.lyra-ui-button]:active:bg-transparent [&.lyra-ui-button]:focus-visible:bg-transparent [&.lyra-ui-button]:focus-visible:text-inherit [&.lyra-ui-button]:focus-visible:shadow-none [&.lyra-ui-button]:focus-visible:transform-none [&_svg]:text-[var(--lyra-text-muted)]";

export const APP_SIDEBAR_GROUP_NAME_CLASS =
  "lyra-app-sidebar-group-name flex-[1_1_0] min-w-0 w-full overflow-hidden text-inherit text-[length:var(--lyra-text-size-body)] font-medium leading-[var(--lyra-text-line-18)] whitespace-nowrap [text-overflow:clip] [mask-image:linear-gradient(90deg,black_0%,black_calc(100%-var(--lyra-space-24)),transparent)] [-webkit-mask-image:linear-gradient(90deg,black_0%,black_calc(100%-var(--lyra-space-24)),transparent)]";

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
