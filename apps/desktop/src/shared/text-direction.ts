export type TextDirection = "ltr" | "rtl";

// Resolve the maximized script, respecting explicit variants such as ar-Latn.
// This also handles RTL scripts outside the four formerly hard-coded languages.
const RTL_SCRIPTS = new Set(["Arab", "Hebr", "Syrc", "Thaa", "Nkoo", "Adlm", "Rohg", "Samr", "Mand"]);
export const textDirectionForLocale = (locale: string, declared?: TextDirection): TextDirection => {
  if (declared !== undefined) return declared;
  try {
    const script = new Intl.Locale(locale).maximize().script;
    return script !== undefined && RTL_SCRIPTS.has(script) ? "rtl" : "ltr";
  } catch { return "ltr"; }
};
