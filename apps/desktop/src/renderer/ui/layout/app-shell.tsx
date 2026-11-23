import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";
import { NATIVE_BG_TRANSPARENT_CLASS, THEME_COLOR_TRANSITION_CLASS } from "../../material-classes";

const SHELL_CLASS =
  `lyra-ui-app-shell relative grid h-full w-full min-h-0 grid-rows-[var(--lyra-size-titlebar-h)_minmax(0,1fr)] overflow-hidden text-[var(--lyra-text-primary)] bg-[var(--lyra-app-material-shell-bg)] [backdrop-filter:var(--lyra-app-material-blur-lg)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-lg)_var(--lyra-app-material-saturate)] ${NATIVE_BG_TRANSPARENT_CLASS}`;

const SHELL_TITLEBAR_CLASS =
  "lyra-ui-app-shell-titlebar min-w-0 min-h-0 border-b border-[var(--lyra-app-material-border)] bg-[var(--lyra-app-material-toolbar-bg)] [backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-sm)_var(--lyra-app-material-saturate)]";

const SHELL_MAIN_CLASS =
  `lyra-ui-app-shell-main min-w-0 min-h-0 bg-transparent ${THEME_COLOR_TRANSITION_CLASS}`;

const SHELL_WORKSPACE_CLASS =
  "lyra-ui-app-shell-workspace min-w-0 min-h-0 text-[var(--lyra-text-primary)]";

export type AppShellProps = HTMLAttributes<HTMLElement>;

export const AppShell = forwardRef<HTMLElement, AppShellProps>(({ className, ...props }, ref) => (
  <main ref={ref} className={cn(SHELL_CLASS, className)} {...props} />
));

AppShell.displayName = "AppShell";

export const AppShellTitlebar = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
  <header ref={ref} className={cn(SHELL_TITLEBAR_CLASS, className)} {...props} />
));

AppShellTitlebar.displayName = "AppShellTitlebar";

export const AppShellMain = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
  <section ref={ref} className={cn(SHELL_MAIN_CLASS, className)} {...props} />
));

AppShellMain.displayName = "AppShellMain";

export const AppShellWorkspace = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(({ className, ...props }, ref) => (
  <section ref={ref} className={cn(SHELL_WORKSPACE_CLASS, className)} {...props} />
));

AppShellWorkspace.displayName = "AppShellWorkspace";
