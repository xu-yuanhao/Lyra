import { useLayoutEffect, useState, type RefObject } from "react";

import { createRafCoalescer } from "../../../../shell/raf-coalesce";
import { COMPOSER_TOOLBAR_MEASURE_CLASS } from "./classes";

export type ComposerToolbarLabelMode = "both" | "icons";

const CONTROLS_SELECTOR = ".lyra-agents-composer-model-controls";
const MODEL_SELECTOR = ":scope > .lyra-agents-composer-model-picker, :scope > .lyra-agents-composer-model-settings-button";
const PERMISSION_SELECTOR = ":scope > .lyra-agents-composer-permission-mode-picker";
const ICON_ONLY_CLASS = "lyra-agents-composer-toolbar-icon-only";

const roundPx = (value: number): number => Math.max(0, Math.round(value));

export const pickComposerToolbarLabelMode = ({
  availablePx,
  gapPx,
  modelFullPx,
  modelIconPx,
  permissionFullPx,
  permissionIconPx
}: {
  readonly availablePx: number;
  readonly gapPx: number;
  readonly modelFullPx: number;
  readonly modelIconPx: number;
  readonly permissionFullPx: number | null;
  readonly permissionIconPx: number | null;
}): ComposerToolbarLabelMode => {
  const hasModel = modelFullPx > 0;
  const hasPermission = permissionFullPx !== null && permissionIconPx !== null && permissionFullPx > 0;
  if (!hasModel && !hasPermission) {
    return "both";
  }
  if (!hasPermission) {
    return modelFullPx <= availablePx ? "both" : "icons";
  }
  if (!hasModel) {
    return permissionFullPx <= availablePx ? "both" : "icons";
  }

  const permissionFull = permissionFullPx;
  const permissionIcon = permissionIconPx;
  // A long model name ellipsizes in the leftover space. Drop both labels
  // only when the row cannot keep the shorter label next to the other icon.
  const modelLonger = modelFullPx >= permissionFull;
  const shorterFull = modelLonger ? permissionFull : modelFullPx;
  const longerIcon = modelLonger ? modelIconPx : permissionIcon;
  if (longerIcon + gapPx + shorterFull <= availablePx) {
    return "both";
  }
  return "icons";
};

const readGapPx = (element: HTMLElement): number => {
  const gap = Number.parseFloat(getComputedStyle(element).gap);
  return Number.isFinite(gap) ? gap : 0;
};

const measureCloneWidth = (source: HTMLElement, iconOnly: boolean): number => {
  const host = document.createElement("div");
  host.className = COMPOSER_TOOLBAR_MEASURE_CLASS;
  host.setAttribute("aria-hidden", "true");
  const clone = source.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.classList.toggle(ICON_ONLY_CLASS, iconOnly);
  if (!iconOnly) {
    clone.style.width = "max-content";
    clone.style.maxWidth = "none";
    clone.style.minWidth = "max-content";
    clone.querySelectorAll<HTMLElement>(".lyra-ui-select-trigger-label").forEach((label) => {
      label.style.display = "inline";
      label.style.flex = "none";
      label.style.width = "max-content";
      label.style.maxWidth = "none";
      label.style.minWidth = "0";
      label.style.overflow = "visible";
    });
  }
  host.appendChild(clone);
  source.closest(".lyra-agents-composer")?.appendChild(host);
  const width = clone.getBoundingClientRect().width;
  host.remove();
  return roundPx(width);
};

const extraChildrenWidth = (controls: HTMLElement, gapPx: number): number => {
  let extraCount = 0;
  let extraWidth = 0;
  for (const child of controls.children) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }
    if (
      child.classList.contains("lyra-agents-composer-model-picker")
      || child.classList.contains("lyra-agents-composer-model-settings-button")
      || child.classList.contains("lyra-agents-composer-permission-mode-picker")
      || child.classList.contains("lyra-agents-composer-toolbar-measure")
    ) {
      continue;
    }
    extraCount += 1;
    extraWidth += child.getBoundingClientRect().width;
  }
  if (extraCount === 0) {
    return 0;
  }
  return roundPx(extraWidth + extraCount * gapPx);
};

export const useComposerToolbarLabelMode = (
  rootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  modelKey: string,
  permissionKey: string
): ComposerToolbarLabelMode => {
  const [mode, setMode] = useState<ComposerToolbarLabelMode>("both");

  useLayoutEffect(() => {
    if (!enabled) {
      setMode("both");
      return;
    }
    const root = rootRef.current;
    if (root === null) {
      return;
    }
    const controls = root.querySelector<HTMLElement>(CONTROLS_SELECTOR);
    if (controls === null) {
      return;
    }

    let modelFullPx = 0;
    let modelIconPx = 0;
    let permissionFullPx: number | null = null;
    let permissionIconPx: number | null = null;
    let sized = false;

    const ensureSizes = (): boolean => {
      if (sized) {
        return modelFullPx > 0 || permissionFullPx !== null;
      }
      const model = controls.querySelector<HTMLElement>(MODEL_SELECTOR);
      const permission = controls.querySelector<HTMLElement>(PERMISSION_SELECTOR);
      if (model !== null) {
        modelFullPx = measureCloneWidth(model, false);
        modelIconPx = measureCloneWidth(model, true);
      }
      if (permission !== null) {
        permissionFullPx = measureCloneWidth(permission, false);
        permissionIconPx = measureCloneWidth(permission, true);
      }
      sized = true;
      return modelFullPx > 0 || permissionFullPx !== null;
    };

    const measure = (): void => {
      const availablePx = roundPx(controls.getBoundingClientRect().width);
      if (availablePx <= 0 || !ensureSizes()) {
        return;
      }
      const gapPx = readGapPx(controls);
      const next = pickComposerToolbarLabelMode({
        availablePx: Math.max(0, availablePx - extraChildrenWidth(controls, gapPx)),
        gapPx,
        modelFullPx,
        modelIconPx,
        permissionFullPx,
        permissionIconPx
      });
      setMode((current) => current === next ? current : next);
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const coalescer = createRafCoalescer(measure);
    const observer = new ResizeObserver(() => coalescer.schedule());
    observer.observe(controls);
    return () => {
      observer.disconnect();
      coalescer.cancel();
    };
  }, [enabled, modelKey, permissionKey, rootRef]);

  return enabled ? mode : "both";
};
