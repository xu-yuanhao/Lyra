import { textDirectionForLocale, type TextDirection } from "../../../shared/text-direction";
import { useSyncExternalStore } from "react";

import { readWorkbenchStateSync } from "../state-storage";

import type { WorkbenchLocale } from "./types";

const PREFERENCES_STATE_KEY = "preferences" as const;
const DEFAULT_LOCALE = "en-US" as const;
const PSEUDO_LOCALE_ENABLED = import.meta.env?.LYRA_PSEUDO_LOCALE === "true";
const BUILTIN_LOCALES = ["en-US"] as const;

type LocaleSnapshot = {
  readonly locale: WorkbenchLocale;
  readonly revision: number;
  readonly direction: TextDirection;
};

const localeListeners = new Set<() => void>();
const availableLocaleListeners = new Set<() => void>();

const normalizeLocale = (value: unknown): WorkbenchLocale | null => {
  if (value === "pseudo" && PSEUDO_LOCALE_ENABLED) {
    return value;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
};

const readInitialLocale = (): WorkbenchLocale => {
  try {
    const raw = readWorkbenchStateSync(PREFERENCES_STATE_KEY);
    if (raw === null) {
      return DEFAULT_LOCALE;
    }
    const parsed = JSON.parse(raw) as {
      readonly locale?: unknown;
      readonly localePreference?: unknown;
    };
    const localePreference =
      parsed.localePreference !== null && typeof parsed.localePreference === "object"
        ? (parsed.localePreference as { readonly mode?: unknown }).mode
        : parsed.localePreference;
    if (localePreference === "system" && typeof navigator !== "undefined") {
      try {
        return Intl.getCanonicalLocales(navigator.language)[0] ?? DEFAULT_LOCALE;
      } catch {
        return DEFAULT_LOCALE;
      }
    }
    return normalizeLocale(parsed.locale) ?? DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
};

let locale = readInitialLocale();
let revision = 0;
let availableLocales = new Set<WorkbenchLocale>([
  ...BUILTIN_LOCALES,
  ...(PSEUDO_LOCALE_ENABLED ? ["pseudo"] : [])
]);
let directions: Readonly<Record<string, TextDirection>> = {};
let currentLocaleSnapshot: LocaleSnapshot = { locale, revision, direction: textDirectionForLocale(locale) };
export const registerWorkbenchTextDirections = (next: Readonly<Record<string, TextDirection>>): void => {
  directions = Object.fromEntries(Object.entries(next).filter(([, direction]) => direction === "ltr" || direction === "rtl"));
  refreshWorkbenchLocale();
};
let currentAvailableLocales = Array.from(availableLocales).sort((left, right) =>
  left.localeCompare(right)
);

const updateLocaleSnapshot = (): void => {
  currentLocaleSnapshot = { locale, revision, direction: textDirectionForLocale(locale, directions[locale]) };
};

const updateAvailableLocalesSnapshot = (): void => {
  currentAvailableLocales = Array.from(availableLocales).sort((left, right) =>
    left.localeCompare(right)
  );
};

const notifyLocaleListeners = (): void => {
  localeListeners.forEach((listener) => listener());
};

const notifyAvailableLocaleListeners = (): void => {
  availableLocaleListeners.forEach((listener) => listener());
};

const localeSnapshot = (): LocaleSnapshot => currentLocaleSnapshot;

export const getWorkbenchLocale = (): WorkbenchLocale => locale;

export const setWorkbenchLocale = (nextLocale: WorkbenchLocale): void => {
  const normalized = normalizeLocale(nextLocale);
  if (normalized === null || normalized === locale) {
    return;
  }
  locale = normalized;
  revision += 1;
  updateLocaleSnapshot();
  notifyLocaleListeners();
};

export const refreshWorkbenchLocale = (): void => {
  revision += 1;
  updateLocaleSnapshot();
  notifyLocaleListeners();
};

export const useWorkbenchLocale = (): WorkbenchLocale =>
  useSyncExternalStore(
    (listener) => {
      localeListeners.add(listener);
      return () => localeListeners.delete(listener);
    },
    getWorkbenchLocale,
    getWorkbenchLocale
  );

export const useWorkbenchLocaleSnapshot = (): LocaleSnapshot =>
  useSyncExternalStore(
    (listener) => {
      localeListeners.add(listener);
      return () => localeListeners.delete(listener);
    },
    localeSnapshot,
    localeSnapshot
  );

export const getWorkbenchLocales = (): readonly WorkbenchLocale[] => currentAvailableLocales;

export const registerWorkbenchLocales = (
  locales: readonly string[]
): (() => void) => {
  const registered = locales
    .map(normalizeLocale)
    .filter((candidate): candidate is WorkbenchLocale => candidate !== null);
  if (registered.length === 0) {
    return () => {};
  }

  let changed = false;
  for (const candidate of registered) {
    if (availableLocales.has(candidate) === false) {
      availableLocales.add(candidate);
      changed = true;
    }
  }
  if (changed) {
    updateAvailableLocalesSnapshot();
    notifyAvailableLocaleListeners();
  }

  return () => {
    let removed = false;
    for (const candidate of registered) {
      if (BUILTIN_LOCALES.includes(candidate as (typeof BUILTIN_LOCALES)[number])) {
        continue;
      }
      if (candidate === "pseudo" && PSEUDO_LOCALE_ENABLED) {
        continue;
      }
      removed = availableLocales.delete(candidate) || removed;
    }
    if (removed) {
      updateAvailableLocalesSnapshot();
      notifyAvailableLocaleListeners();
    }
  };
};

export const useWorkbenchLocales = (): readonly WorkbenchLocale[] =>
  useSyncExternalStore(
    (listener) => {
      availableLocaleListeners.add(listener);
      return () => availableLocaleListeners.delete(listener);
    },
    getWorkbenchLocales,
    getWorkbenchLocales
  );

export const isWorkbenchLocale = (value: unknown): value is WorkbenchLocale =>
  normalizeLocale(value) !== null;

export const __resetWorkbenchLocaleStateForTests = (
  nextLocale: WorkbenchLocale = DEFAULT_LOCALE
): void => {
  locale = normalizeLocale(nextLocale) ?? DEFAULT_LOCALE;
  revision += 1;
  updateLocaleSnapshot();
  availableLocales = new Set<WorkbenchLocale>([
    ...BUILTIN_LOCALES,
    ...(PSEUDO_LOCALE_ENABLED ? ["pseudo"] : [])
  ]);
  updateAvailableLocalesSnapshot();
  notifyLocaleListeners();
  notifyAvailableLocaleListeners();
};
