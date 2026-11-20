import { useEffect, useState, type MutableRefObject } from "react";

import type { WorkbenchThemeVars } from "../theme";

/**
 * Drives the cross-fade between two theme palettes and reports whether the
 * transition window is still open, so the stage can suppress motion that would
 * fight the fade.
 *
 * The window is the CSS value of `--lyra-motion-slow-duration` (420ms), which
 * also drives the cross-fade keyframes and the palette color transitions. The
 * two must move together: a longer timer leaves the stage suppressing motion
 * after the fade has finished, and a shorter one lets motion fight a live fade.
 */
export const THEME_TRANSITION_DURATION_MS = 420;

export const useThemeTransition = (
  themeVars: WorkbenchThemeVars,
  previousThemeVarsRef: MutableRefObject<WorkbenchThemeVars>,
  rootRef: MutableRefObject<HTMLElement | null>
): boolean => {
  const [isThemeTransitioning, setIsThemeTransitioning] = useState(false);

  useEffect(() => {
    const previousThemeVars = previousThemeVarsRef.current;
    if (previousThemeVars === themeVars) {
      return;
    }

    const root = rootRef.current;
    if (root !== null) {
      root.style.setProperty(
        "--lyra-theme-transition-from-bg",
        previousThemeVars["--lyra-app-bg"] ?? "transparent"
      );
    }
    previousThemeVarsRef.current = themeVars;
    setIsThemeTransitioning(true);
    const timer = window.setTimeout(() => {
      setIsThemeTransitioning(false);
    }, THEME_TRANSITION_DURATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [themeVars, previousThemeVarsRef, rootRef]);

  return isThemeTransitioning;
};
