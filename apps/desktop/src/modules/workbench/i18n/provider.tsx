import { useLayoutEffect, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n, { changeI18nLocale } from "./i18n-instance";
import { useWorkbenchLocaleSnapshot } from "./locale-state";

export function WorkbenchI18nProvider({
  children
}: {
  readonly children: ReactNode;
}) {
  const { locale, revision, direction } = useWorkbenchLocaleSnapshot();

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
    void changeI18nLocale(locale);
  }, [locale, revision, direction]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
