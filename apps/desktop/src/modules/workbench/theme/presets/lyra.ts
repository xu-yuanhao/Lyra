import type { WorkbenchTheme } from "../types";
import { createThemeVars } from "./shared";

type LyraResolvedThemeId = "lyra-light" | "lyra-dark";

export const LYRA_RESOLVED_THEMES: Record<LyraResolvedThemeId, WorkbenchTheme> = {
  "lyra-light": {
    id: "lyra-light",
    vars: createThemeVars({
      "--lyra-app-bg": "#fafafa",
      "--lyra-app-sidebar-bg": "#fafafa",
      "--lyra-app-panel-bg": "#fafafa",
      "--lyra-app-surface-bg": "#ffffff",
      "--lyra-app-surface-strong-bg": "#ffffff",
      "--lyra-app-muted-bg": "#f5f5f5",
      "--lyra-app-row-bg": "transparent",
      "--lyra-app-row-hover-bg": "color-mix(in oklab, #0a0a0a 5%, transparent)",
      "--lyra-app-row-active-bg": "color-mix(in oklab, #0a0a0a 10%, transparent)",
      "--lyra-app-row-active-border": "color-mix(in oklab, #0a0a0a 16%, transparent)",
      "--lyra-app-input-bg": "#ffffff",
      "--lyra-app-input-hover-bg": "#ffffff",
      "--lyra-app-input-focus-bg": "#fafafa",
      "--lyra-app-input-border": "color-mix(in oklab, #0a0a0a 12%, transparent)",
      "--lyra-app-input-focus-border": "color-mix(in oklab, #0a0a0a 28%, transparent)",
      "--lyra-app-input-placeholder": "#737373",
      "--lyra-app-border": "color-mix(in oklab, #0a0a0a 10%, transparent)",
      "--lyra-app-border-strong": "color-mix(in oklab, #0a0a0a 18%, transparent)",
      "--lyra-app-focus": "color-mix(in oklab, #0a0a0a 22%, transparent)",
      "--lyra-app-primary-button": "#171717",
      "--lyra-app-primary-button-fg": "#fafafa",
      "--lyra-app-switch-off": "#d4d4d4",
      "--lyra-app-switch-on": "#4fa173",
      "--lyra-app-popover-bg": "#ffffff",
      "--lyra-app-overlay-bg": "color-mix(in oklab, #0a0a0a 36%, transparent)",
      "--lyra-text-primary": "#171717",
      "--lyra-text-secondary": "#404040",
      "--lyra-text-muted": "#737373",
      "--lyra-text-accent": "#171717",
      "--lyra-window-close-hover-bg": "#d36151",
      "--lyra-status-success": "#3f7a3a",
      "--lyra-status-warning": "#7a5f00",
      "--lyra-status-error": "#b03a2e"
    })
  },
  "lyra-dark": {
    id: "lyra-dark",
    vars: createThemeVars({
      "--lyra-app-bg": "#171717",
      "--lyra-app-sidebar-bg": "#171717",
      "--lyra-app-panel-bg": "#171717",
      "--lyra-app-surface-bg": "#222222",
      "--lyra-app-surface-strong-bg": "#222222",
      "--lyra-app-muted-bg": "#141414",
      "--lyra-app-row-bg": "transparent",
      "--lyra-app-row-hover-bg": "color-mix(in oklab, #fafafa 8%, transparent)",
      "--lyra-app-row-active-bg": "color-mix(in oklab, #fafafa 12%, transparent)",
      "--lyra-app-row-active-border": "color-mix(in oklab, #fafafa 16%, transparent)",
      "--lyra-app-input-bg": "#262626",
      "--lyra-app-input-hover-bg": "#2e2e2e",
      "--lyra-app-input-focus-bg": "#222222",
      "--lyra-app-input-border": "color-mix(in oklab, #fafafa 10%, transparent)",
      "--lyra-app-input-focus-border": "color-mix(in oklab, #fafafa 22%, transparent)",
      "--lyra-app-input-placeholder": "#a3a3a3",
      "--lyra-app-border": "color-mix(in oklab, #fafafa 8%, transparent)",
      "--lyra-app-border-strong": "color-mix(in oklab, #fafafa 14%, transparent)",
      "--lyra-app-focus": "color-mix(in oklab, #fafafa 18%, transparent)",
      "--lyra-app-primary-button": "#f5f5f5",
      "--lyra-app-primary-button-fg": "#171717",
      "--lyra-app-switch-off": "#3f3f3f",
      "--lyra-app-switch-on": "#4fa173",
      "--lyra-app-popover-bg": "#262626",
      "--lyra-app-overlay-bg": "color-mix(in oklab, #000000 55%, transparent)",
      "--lyra-text-primary": "#e8e8e8",
      "--lyra-text-secondary": "#a3a3a3",
      "--lyra-text-muted": "#8a8a8a",
      "--lyra-text-accent": "#e8e8e8",
      "--lyra-window-close-hover-bg": "#d07277",
      "--lyra-status-success": "#a1c181",
      "--lyra-status-warning": "#dec184",
      "--lyra-status-error": "#d07277"
    })
  }
};
