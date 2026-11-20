import { afterEach, describe, expect, test } from "vitest";

import {
  DEFAULT_UI_FONT_SIZE_PX,
  applyUiFontSizePx,
  normalizeUiFontSizePx
} from "../ui-font-size";

describe("ui font size", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--lyra-ui-font-size");
  });

  test("snaps unknown values to the default 14px step", () => {
    expect(normalizeUiFontSizePx(undefined)).toBe(DEFAULT_UI_FONT_SIZE_PX);
    expect(normalizeUiFontSizePx("nope")).toBe(DEFAULT_UI_FONT_SIZE_PX);
    expect(normalizeUiFontSizePx(17)).toBe(16);
    expect(normalizeUiFontSizePx(18)).toBe(16);
    expect(normalizeUiFontSizePx(21)).toBe(20);
  });

  test("writes only the ui font token, not the html rem root", () => {
    document.documentElement.style.fontSize = "16px";
    applyUiFontSizePx(16);
    expect(document.documentElement.style.getPropertyValue("--lyra-ui-font-size")).toBe("16px");
    expect(document.documentElement.style.fontSize).toBe("16px");
  });
});
