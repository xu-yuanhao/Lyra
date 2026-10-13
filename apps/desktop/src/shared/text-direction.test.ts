import { describe, expect, it } from "vitest";
import { textDirectionForLocale } from "./text-direction";
describe("text direction", () => {
  it("follows the actual script and explicit pack metadata", () => {
    for (const locale of ["ar", "he", "dv", "ps", "ku-Arab", "ff-Adlm"]) expect(textDirectionForLocale(locale)).toBe("rtl");
    for (const locale of ["en-US", "ar-Latn", "ku-Latn", "invalid_locale"]) expect(textDirectionForLocale(locale)).toBe("ltr");
    expect(textDirectionForLocale("en-US", "rtl")).toBe("rtl");
  });
});
