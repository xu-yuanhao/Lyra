export const DEFAULT_UI_FONT_SIZE_PX = 14;
export const MIN_UI_FONT_SIZE_PX = 12;
export const MAX_UI_FONT_SIZE_PX = 20;
// The user scaling control moves the same five-tier scale as a whole, so its
// steps are the design tiers, not a second size menu. 24 is display-only text
// and would make ordinary rows oversized, so the body range stops at 20.
export const UI_FONT_SIZE_OPTIONS = [12, 14, 16, 20] as const;

export type UiFontSizePx = (typeof UI_FONT_SIZE_OPTIONS)[number];

export const normalizeUiFontSizePx = (value: unknown): UiFontSizePx => {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_UI_FONT_SIZE_PX;
  }
  const rounded = Math.round(numeric);
  const nearest = UI_FONT_SIZE_OPTIONS.reduce((best, option) =>
    Math.abs(option - rounded) < Math.abs(best - rounded) ? option : best
  );
  return nearest;
};

export const applyUiFontSizePx = (fontSizePx: number): void => {
  const rootStyle = typeof document === "undefined" ? undefined : document.documentElement.style;
  if (rootStyle?.setProperty === undefined) {
    return;
  }
  // ponytail: 只改 --lyra-ui-font-size。html 根字号保持浏览器 16px，避免 Tailwind rem 把图标和圆角跟着滑块走。
  rootStyle.setProperty("--lyra-ui-font-size", `${normalizeUiFontSizePx(fontSizePx)}px`);
};
