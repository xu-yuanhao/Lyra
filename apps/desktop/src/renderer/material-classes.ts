// Shared Tailwind class tokens for native window-material transparency and
// theme color transitions migrated from material.scss. Every token must
// appear literally here (or at an emission site) so the Tailwind scanner
// can emit the underlying utilities.

export const NATIVE_BG_TRANSPARENT_CLASS = "native-material:bg-transparent";

export const NATIVE_LIGHT_BG_TRANSPARENT_CLASS = "native-material-light:bg-transparent";

export const THEME_COLOR_TRANSITION_ONLY =
  "transition-[background-color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),border-color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),box-shadow_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),fill_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),stroke_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast)]";

export const THEME_COLOR_TRANSITION_CLASS =
  `${THEME_COLOR_TRANSITION_ONLY} motion-reduce:transition-none`;
