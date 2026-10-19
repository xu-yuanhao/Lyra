export const LYRA_CORE_API_DESKTOP_KEYS = [
  "agent",
  "terminal",
  "lsp",
  "search",
  "downloads",
  "files",
  "browser"
] as const;

export const LYRA_CORE_API_DAEMON_METHOD_PREFIXES = [
  "search.",
  "terminal.",
  "lsp.",
  "download.",
  "agent."
] as const;

export const LYRA_DAEMON_EXTRA_METHOD_PREFIXES = [
  "runtime.",
  "files.",
  "scheduler."
] as const;

export const LYRA_DAEMON_METHOD_PREFIXES = [
  ...LYRA_CORE_API_DAEMON_METHOD_PREFIXES,
  ...LYRA_DAEMON_EXTRA_METHOD_PREFIXES
] as const;

export const LYRA_OS_SHELL_ADAPTER_IDS = [
  "windowMaterial",
  "systemNotifications",
  "safeStorage",
  "appUpdate",
  "location",
  "loginCookieVault"
] as const;

export const LYRA_OS_SHELL_DESKTOP_KEYS = [
  "systemNotifications",
  "appUpdate",
  "location",
  "loginManager",
  "sensitiveValues",
  "auth"
] as const;

export const LYRA_OS_SHELL_ELECTRON_ADAPTERS = [
  "apps/desktop/src/main/window-material.ts",
  "apps/desktop/src/main/system-notifications/service.ts",
  "apps/desktop/src/main/auto-update/service.ts",
  "apps/desktop/src/main/location/service.ts",
  "apps/desktop/src/main/login-manager/site-data.ts",
  "apps/desktop/src/main/login-manager/password-vault.ts",
  "apps/desktop/src/main/auth/service.ts",
  "apps/desktop/src/main/sensitive-values/service.ts"
] as const;

export const LYRA_OS_SHELL_FORBIDDEN_DAEMON_PREFIXES = [
  "window.",
  "notification.",
  "safeStorage.",
  "appUpdate.",
  "location.",
  "login.",
  "auth."
] as const;

export type LyraCoreApiDesktopKey = (typeof LYRA_CORE_API_DESKTOP_KEYS)[number];
export type LyraOsShellAdapterId = (typeof LYRA_OS_SHELL_ADAPTER_IDS)[number];
export type LyraOsShellDesktopKey = (typeof LYRA_OS_SHELL_DESKTOP_KEYS)[number];

export const isLyraCoreApiDesktopKey = (value: string): value is LyraCoreApiDesktopKey =>
  (LYRA_CORE_API_DESKTOP_KEYS as readonly string[]).includes(value);

export const isLyraOsShellAdapterId = (value: string): value is LyraOsShellAdapterId =>
  (LYRA_OS_SHELL_ADAPTER_IDS as readonly string[]).includes(value);

export const isLyraOsShellDesktopKey = (value: string): value is LyraOsShellDesktopKey =>
  (LYRA_OS_SHELL_DESKTOP_KEYS as readonly string[]).includes(value);
