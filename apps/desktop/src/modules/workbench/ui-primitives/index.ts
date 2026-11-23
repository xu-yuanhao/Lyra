export { cx } from "./classnames";
export type { ClassNameValue } from "./classnames";
export {
  chromeTabStripLayoutsEqual,
  closestChromeTabLayoutIndex,
  computeChromeTabStripLayout
} from "./chrome-tab-layout";
export type {
  ChromeTabDensity,
  ChromeTabLayoutItem,
  ChromeTabStripLayout
} from "./chrome-tab-layout";
export {
  handleChromeTabCloseClick,
  handleChromeTabClosePointerDown,
  isChromeTabCloseTarget,
  isMiddleClick,
  useChromeTabStripCloseLock
} from "./use-chrome-tab-strip-close-lock";
export type { ChromeTabCloseGestureEvent } from "./use-chrome-tab-strip-close-lock";
export { fixedRowVirtualizerOptions } from "./fixed-row-virtualizer";
export { PanelHost, PanelResizer } from "./panel-chrome";

// Chrome control primitives now resolve to the shared Lyra App components.
// Pack authors consuming `context.primitives` keep the legacy names; the values
// are the canonical App components instead of bespoke chrome shells.
export {
  AppButton,
  AppButton as ChromeTabButton,
  AppIconButton,
  AppIconButton as ChromeIconButton
} from "@renderer/ui/components";
