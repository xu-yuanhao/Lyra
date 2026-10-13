import { act, render, screen } from "@testing-library/react";
import { useMemo } from "react";
import { afterEach, describe, expect, test } from "vitest";

// This suite exercises React subscription behavior as well as imperative translation.
import {
  WorkbenchI18nProvider,
  createTranslator,
  formatMessage,
  formatNumber,
  getWorkbenchLocales,
  setWorkbenchLocale,
  t,
  useWorkbenchLocale,
  useWorkbenchLocaleSnapshot
} from "..";
import { refreshWorkbenchLocale, registerWorkbenchLocales } from "../locale-state";
import i18n from "../i18n-instance";
import { createSettingLocaleOptions } from "../../shell/service";
import type { I18nKey, WorkbenchLocale } from "../types";

afterEach(() => {
  act(() => {
    i18n.removeResourceBundle("zh-CN", "translation");
    setWorkbenchLocale("en-US");
  });
});

describe("i18n translator", () => {
  test("falls back to English until a remote Chinese pack is installed", () => {
    const t = createTranslator("zh-CN");
    expect(t("settings.pageTitle")).toBe("Settings");
  });

  test("returns localized string for en-US", () => {
    const t = createTranslator("en-US");
    expect(t("settings.pageTitle")).toBe("Settings");
  });

  test("falls back to en-US dictionary for unknown locale", () => {
    const t = createTranslator("unknown" as WorkbenchLocale);
    expect(t("settings.pageTitle")).toBe("Settings");
  });

  test("returns the key when it is missing from every locale", () => {
    const t = createTranslator("zh-CN");
    expect(t("totally.missing.key" as I18nKey)).toBe("totally.missing.key");
  });

  test("uses CLDR plural forms and locale-aware number formatting", () => {
    setWorkbenchLocale("en-US");
    expect(formatMessage("tool.events", { count: 1 })).toBe("1 tool event");
    expect(formatMessage("tool.events", { count: 2 })).toBe("2 tool events");

    setWorkbenchLocale("de-DE");
    expect(formatNumber(12_345.6)).toBe(
      new Intl.NumberFormat("de-DE").format(12_345.6)
    );
  });

  test("publishes dynamically registered locales to settings consumers", () => {
    const unregister = registerWorkbenchLocales(["fr-FR"]);
    expect(getWorkbenchLocales()).toContain("fr-FR");
    expect(
      createSettingLocaleOptions(
        createTranslator("en-US"),
        getWorkbenchLocales(),
        "en-US"
      ).map((option) => option.value)
    ).toContain("fr-FR");
    unregister();
    expect(getWorkbenchLocales()).not.toContain("fr-FR");
  });

  test("rerenders core and AI strings from one locale subscription", () => {
    i18n.addResourceBundle("zh-CN", "translation", {
      "settings.pageTitle": "基本设置",
      "ai.startBySending": "先发送一条消息开始对话。"
    }, true, true);
    registerWorkbenchLocales(["zh-CN"]);
    setWorkbenchLocale("zh-CN");

    function ProductSurface() {
      const locale = useWorkbenchLocale();
      const translate = createTranslator(locale);
      return (
        <>
          <span>{translate("settings.pageTitle")}</span>
          <span>{t("ai.startBySending")}</span>
        </>
      );
    }

    render(
      <WorkbenchI18nProvider>
        <ProductSurface />
      </WorkbenchI18nProvider>
    );

    expect(screen.getByText("基本设置")).toBeInTheDocument();
    expect(screen.getByText("先发送一条消息开始对话。")).toBeInTheDocument();

    act(() => {
      setWorkbenchLocale("en-US");
    });

    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Start by sending a message.")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("en-US");
  });

  test("rebuilds memoized chrome labels when the selected locale's async resources arrive", () => {
    registerWorkbenchLocales(["ja-JP"]);
    setWorkbenchLocale("ja-JP");

    function DynamicSurface() {
      const { locale, revision } = useWorkbenchLocaleSnapshot();
      const translate = useMemo(() => createTranslator(locale), [locale, revision]);
      const label = useMemo(() => translate("settings.pageTitle"), [translate]);
      return <span>{label}</span>;
    }

    render(
      <WorkbenchI18nProvider>
        <DynamicSurface />
      </WorkbenchI18nProvider>
    );
    expect(screen.getByText("Settings")).toBeInTheDocument();

    act(() => {
      i18n.addResourceBundle("ja-JP", "translation", {
        "settings.pageTitle": "設定"
      }, true, true);
      refreshWorkbenchLocale();
    });

    expect(screen.getByText("設定")).toBeInTheDocument();
    i18n.removeResourceBundle("ja-JP", "translation");
  });
});

test("locale changes apply and restore root text direction", () => {
  const view = render(<WorkbenchI18nProvider><div>content</div></WorkbenchI18nProvider>);
  act(() => setWorkbenchLocale("dv"));
  expect(document.documentElement.dir).toBe("rtl");
  act(() => setWorkbenchLocale("ar-Latn"));
  expect(document.documentElement.dir).toBe("ltr");
  act(() => setWorkbenchLocale("en-US"));
  expect(document.documentElement.lang).toBe("en-US");
  view.unmount();
});
