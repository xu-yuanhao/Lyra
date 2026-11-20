import { afterEach, describe, expect, test, vi } from "vitest";

import { WORKBENCH_BREAKPOINTS } from "../breakpoints";
import { WORKBENCH_FOUNDATION_TOKENS } from "../foundation";
import { WORKBENCH_SEMANTIC_TOKENS } from "../semantic";
import {
  isWorkbenchThemeId,
  normalizeWorkbenchThemeId,
  observeSystemPrefersDark,
  readSystemPrefersDark,
  resolveMaterialThemeVars,
  resolveWorkbenchNativeThemeSource,
  resolveThemeVars,
  resolveWorkbenchThemeId
} from "../service";

type MatchMediaLike = {
  matches: boolean;
  addEventListener?: (type: string, listener: (event: { matches: boolean }) => void) => void;
  removeEventListener?: (type: string, listener: (event: { matches: boolean }) => void) => void;
  addListener?: (listener: (event: { matches: boolean }) => void) => void;
  removeListener?: (listener: (event: { matches: boolean }) => void) => void;
};

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.restoreAllMocks();
});

describe("workbench theme service", () => {
  test("validates supported theme ids", () => {
    expect(isWorkbenchThemeId("lyra-dark")).toBe(true);
    expect(isWorkbenchThemeId("nova-system")).toBe(false);
    expect(isWorkbenchThemeId("foo-theme")).toBe(false);
  });

  test("resolves *-system themes by prefersDark", () => {
    expect(resolveWorkbenchThemeId("lyra-system", true)).toBe("lyra-dark");
    expect(resolveWorkbenchThemeId("lyra-system", false)).toBe("lyra-light");
  });

  test("maps workbench themes to Electron native theme sources", () => {
    expect(resolveWorkbenchNativeThemeSource("lyra-system")).toBe("system");
    expect(resolveWorkbenchNativeThemeSource("lyra-dark")).toBe("dark");
    expect(resolveWorkbenchNativeThemeSource("lyra-light")).toBe("light");
  });

  test("normalizes legacy theme ids into the Lyra family", () => {
    expect(normalizeWorkbenchThemeId("terra-system")).toBe("lyra-system");
    expect(normalizeWorkbenchThemeId("nova-dark")).toBe("lyra-dark");
    expect(normalizeWorkbenchThemeId("ocean-light")).toBe("lyra-light");
    expect(normalizeWorkbenchThemeId("unknown-theme", "lyra-dark")).toBe("lyra-dark");
  });

  test("readSystemPrefersDark returns false when matchMedia is unavailable", () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia;
    expect(readSystemPrefersDark()).toBe(false);
  });

  test("observeSystemPrefersDark uses addEventListener when available", () => {
    const listeners: Array<(event: { matches: boolean }) => void> = [];
    const media: MatchMediaLike = {
      matches: false,
      addEventListener: (_type, listener) => {
        listeners.push(listener);
      },
      removeEventListener: (_type, listener) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      }
    };

    window.matchMedia = vi.fn(() => media as MediaQueryList);

    const onChange = vi.fn();
    const unsubscribe = observeSystemPrefersDark(onChange);

    expect(listeners).toHaveLength(1);
    media.matches = true;
    listeners[0]?.({ matches: true });
    expect(onChange).toHaveBeenCalledWith(true);

    unsubscribe();
    expect(listeners).toHaveLength(0);
  });

  test("observeSystemPrefersDark falls back to addListener/removeListener", () => {
    const listeners: Array<(event: { matches: boolean }) => void> = [];
    const media: MatchMediaLike = {
      matches: false,
      addListener: (listener) => {
        listeners.push(listener);
      },
      removeListener: (listener) => {
        const index = listeners.indexOf(listener);
        if (index >= 0) {
          listeners.splice(index, 1);
        }
      }
    };

    window.matchMedia = vi.fn(() => media as unknown as MediaQueryList);

    const onChange = vi.fn();
    const unsubscribe = observeSystemPrefersDark(onChange);

    expect(listeners).toHaveLength(1);
    media.matches = true;
    listeners[0]?.({ matches: true });
    expect(onChange).toHaveBeenCalledWith(true);

    unsubscribe();
    expect(listeners).toHaveLength(0);
  });

  test("resolveThemeVars falls back to lyra-light vars for unknown theme", () => {
    const fallback = resolveThemeVars("lyra-light", false);
    const unknown = resolveThemeVars("unknown-theme" as never, false);
    expect(unknown).toEqual(fallback);
    expect(Object.keys(unknown).length).toBeGreaterThan(0);
  });

  test("resolveThemeVars includes foundation and semantic tokens", () => {
    const vars = resolveThemeVars("lyra-light", false);
    expect(vars["--lyra-shell-titlebar-h"]).toBe("var(--lyra-control-h-34)");
    expect(vars["--lyra-control-h-default"]).toBe("var(--lyra-control-h-32)");
    expect(vars["--lyra-font-sans"]).toContain("system-ui");
    expect(vars["--lyra-text-size-body"]).toBe("var(--lyra-text-size-14)");
    expect(vars["--lyra-ui-font-size"]).toBe("14px");
    expect(vars["--lyra-text-size-12"]).toBe("max(12px, calc(var(--lyra-ui-font-size) - 2px))");
    expect(vars["--lyra-text-size-20"]).toBe("calc(var(--lyra-ui-font-size) + 6px)");
  });

  test("uses app theme tokens as the only product visual source", () => {
    const lightVars = resolveThemeVars("lyra-light", false);
    const darkVars = resolveThemeVars("lyra-dark", false);

    expect(lightVars["--lyra-app-bg"]).toBe("#fafafa");
    expect(lightVars["--lyra-app-surface-bg"]).toBe("#ffffff");
    expect(lightVars["--lyra-app-row-hover-bg"]).toBe("color-mix(in oklab, #0a0a0a 5%, transparent)");
    expect(lightVars).not.toHaveProperty("--lyra-bg-app");
    expect(lightVars).not.toHaveProperty("--lyra-bg-surface");
    expect(lightVars).not.toHaveProperty("--lyra-bg-editor");
    expect(lightVars).not.toHaveProperty("--lyra-bg-hover");
    expect(lightVars).not.toHaveProperty("--lyra-line-default");
    expect(lightVars).not.toHaveProperty("--lyra-line-focused");
    expect(lightVars).not.toHaveProperty("--lyra-browser-tab-bg");
    expect(lightVars).not.toHaveProperty("--lyra-tab-active");

    expect(darkVars["--lyra-app-bg"]).toBe("#171717");
    expect(darkVars["--lyra-app-sidebar-bg"]).toBe("#171717");
    expect(darkVars["--lyra-app-panel-bg"]).toBe("#171717");
    expect(darkVars["--lyra-app-surface-bg"]).toBe("#222222");
    expect(darkVars["--lyra-app-surface-strong-bg"]).toBe("#222222");
    expect(darkVars["--lyra-app-input-bg"]).toBe("#262626");
    expect(darkVars["--lyra-app-popover-bg"]).toBe("#262626");
    expect(darkVars["--lyra-text-primary"]).toBe("#e8e8e8");
    expect(darkVars["--lyra-app-switch-off"]).toBe("#3f3f3f");
    expect(darkVars["--lyra-app-switch-on"]).toBe("#4fa173");
    expect(lightVars["--lyra-app-switch-on"]).toBe("#4fa173");
    expect(darkVars["--lyra-text-muted"]).toBe("#8a8a8a");
    expect(darkVars["--lyra-app-border"]).toBe("color-mix(in oklab, #fafafa 8%, transparent)");
    expect(darkVars["--lyra-app-row-active-bg"]).toBe("color-mix(in oklab, #fafafa 12%, transparent)");
    expect(darkVars["--lyra-text-secondary"]).toBe("#a3a3a3");
    expect(darkVars).not.toHaveProperty("--lyra-bg-app");
    expect(darkVars).not.toHaveProperty("--lyra-line-default");
  });

  test("does not define an independent terminal color theme in presets", () => {
    const lightVars = resolveThemeVars("lyra-light", false);
    const darkVars = resolveThemeVars("lyra-dark", false);

    expect(lightVars).not.toHaveProperty("--lyra-terminal-bg");
    expect(lightVars).not.toHaveProperty("--lyra-terminal-fg");
    expect(lightVars).not.toHaveProperty("--lyra-terminal-selection-bg");
    expect(darkVars).not.toHaveProperty("--lyra-terminal-bg");
    expect(darkVars).not.toHaveProperty("--lyra-terminal-fg");
    expect(darkVars).not.toHaveProperty("--lyra-terminal-selection-bg");
  });

  test("materializes shared surfaces while preserving their solid theme colors", () => {
    const lightVars = resolveThemeVars("lyra-light", false);
    const materialVars = resolveMaterialThemeVars(lightVars, true, "light");

    expect(materialVars["--lyra-material-solid-panel-bg"]).toBe("#fafafa");
    expect(materialVars["--lyra-app-panel-bg"]).toBe(
      "color-mix(in srgb, var(--lyra-material-solid-panel-bg) 0%, transparent)"
    );
    expect(materialVars["--lyra-app-surface-bg"]).toContain("18%");
    expect(materialVars["--lyra-app-input-bg"]).toBe(
      "var(--lyra-material-solid-input-bg)"
    );
    expect(materialVars["--lyra-app-popover-bg"]).toBe(
      "var(--lyra-material-solid-popover-bg)"
    );
    expect(materialVars["--lyra-shadow-elevated-md"]).toContain("10%");
    expect(materialVars["--lyra-text-primary"]).toBe(lightVars["--lyra-text-primary"]);
  });

  test("keeps the existing stronger material hierarchy in dark mode", () => {
    const darkVars = resolveMaterialThemeVars(
      resolveThemeVars("lyra-dark", false),
      true,
      "dark"
    );

    expect(darkVars["--lyra-app-panel-bg"]).toContain("30%");
    expect(darkVars["--lyra-app-surface-bg"]).toContain("40%");
  });

  test("leaves the solid theme untouched when material is disabled", () => {
    const darkVars = resolveThemeVars("lyra-dark", false);

    expect(resolveMaterialThemeVars(darkVars, false, "dark")).toBe(darkVars);
    expect(resolveMaterialThemeVars(darkVars, false, "dark")).not.toHaveProperty(
      "--lyra-material-solid-panel-bg"
    );
  });

  test("exports breakpoint, foundation, and semantic token registries", () => {
    expect(WORKBENCH_BREAKPOINTS.compact).toBe("980px");
    expect(WORKBENCH_BREAKPOINTS.regular).toBe("1180px");
    expect(WORKBENCH_FOUNDATION_TOKENS["--lyra-space-10"]).toBe("10px");
    expect(WORKBENCH_SEMANTIC_TOKENS["--lyra-dialog-max-w"]).toBe("560px");
  });
});
