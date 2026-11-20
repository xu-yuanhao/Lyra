import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent
} from "react";
import {
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  Loader2,
  Search,
  Trash2
} from "@lyra/icons";

import {
  AppButton,
  AppIconButton,
  AppInput,
  AppPopover,
  AppPopoverContent,
  AppPopoverTrigger,
  AppStatusMessage,
  AppTooltip
} from "@renderer/ui/components";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import type {
  InstalledLanguagePack,
  LanguagePackCatalogResponse
} from "../../../shared/language-packs";
import type { WorkbenchLocale } from "../i18n";
import type { LanguagePickerLabels, SettingsOption } from "./settings-surface-types";
import { searchLanguages, type LanguageSearchEntry } from "./language-picker-search";

type LanguagePickerProps = {
  readonly value: WorkbenchLocale;
  readonly builtins: readonly SettingsOption<WorkbenchLocale>[];
  readonly labels: LanguagePickerLabels;
  readonly desktopApi: LyraDesktopApi | null;
  readonly onChange: (locale: WorkbenchLocale) => void;
};

type LanguagePickerEntry = LanguageSearchEntry & {
  readonly builtin: boolean;
};

const BUILTIN_LOCALES = new Set(["en-US"]);
const BUILTIN_ALIASES: Readonly<Record<string, readonly string[]>> = {
  "zh-CN": ["chinese", "mandarin", "zh", "cn", "zhongwen", "putonghua", "中文", "简体"],
  "en-US": ["english", "en", "us", "american", "anglais"],
  "ja-JP": [
    "japanese",
    "ja",
    "jp",
    "nihongo",
    "nihon",
    "日本語",
    "にほんご",
    "日语",
    "日文"
  ],
  "ko-KR": [
    "korean",
    "ko",
    "kr",
    "hanguk",
    "hangugeo",
    "한국어",
    "한글",
    "韩语",
    "韩文",
    "朝鲜语"
  ]
};

const languageDisplayName = (locale: string, displayLocale: string, fallback: string): string => {
  try {
    return new Intl.DisplayNames([displayLocale], { type: "language" }).of(locale) ?? fallback;
  } catch {
    return fallback;
  }
};

export const LanguagePicker = ({
  value,
  builtins,
  labels,
  desktopApi,
  onChange
}: LanguagePickerProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<LanguagePackCatalogResponse | null>(null);
  const [installed, setInstalled] = useState<readonly InstalledLanguagePack[]>([]);
  const [operations, setOperations] = useState<
    Readonly<Record<string, "installing" | "removing">>
  >({});
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const refresh = useCallback(async (): Promise<void> => {
    const api = desktopApi?.languagePacks;
    if (api === undefined) {
      setCatalog(null);
      setInstalled([]);
      return;
    }
    const [nextCatalog, nextInstalled] = await Promise.all([
      api.listCatalog(),
      api.listInstalled()
    ]);
    setCatalog(nextCatalog);
    setInstalled(nextInstalled);
  }, [desktopApi]);

  useEffect(() => {
    const api = desktopApi?.languagePacks;
    if (api === undefined) {
      void refresh();
      return;
    }
    const reload = (): void => {
      void refresh().catch(() => {
        // Keep a previously verified catalog usable when a refresh is transiently unavailable.
      });
    };
    reload();
    const unsubscribe = api.onChanged((event) => {
      const locales = event.locales;
      const error = event.error;
      if (event.kind === "error" && locales !== undefined && error !== undefined) {
        const nextErrors: Record<string, string> = Object.fromEntries(
          locales.map((locale) => [locale, error])
        );
        setErrors((current) => ({
          ...current,
          ...nextErrors
        }));
      }
      reload();
    });
    void api.checkForUpdates().then(reload, reload);
    return () => {
      unsubscribe();
    };
  }, [desktopApi, refresh]);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const handleOpenChange = useCallback((nextOpen: boolean): void => {
    setOpen(nextOpen);
    if (nextOpen === false) {
      return;
    }
    const api = desktopApi?.languagePacks;
    if (api === undefined) {
      return;
    }
    void api.checkForUpdates()
      .catch(() => undefined)
      .then(async () => {
        try {
          await refresh();
        } catch {
          // A stale catalog remains available until a later refresh succeeds.
        }
      });
  }, [desktopApi, refresh]);

  const entries = useMemo(() => {
    const result = new Map<string, LanguagePickerEntry>();
    for (const option of builtins) {
      if (BUILTIN_LOCALES.has(option.value) === false) {
        continue;
      }
      result.set(option.value, {
        locale: option.value,
        nativeName: languageDisplayName(option.value, option.value, option.label),
        displayName: option.label,
        englishName: languageDisplayName(option.value, "en-US", option.label),
        aliases: BUILTIN_ALIASES[option.value] ?? [],
        builtin: true
      });
    }
    for (const pack of catalog?.packs ?? []) {
      result.set(pack.locale, {
        locale: pack.locale,
        nativeName: pack.nativeName,
        displayName: languageDisplayName(pack.locale, value, pack.englishName),
        englishName: pack.englishName,
        aliases: [...pack.aliases, ...(BUILTIN_ALIASES[pack.locale] ?? [])],
        builtin: false
      });
    }
    for (const pack of installed) {
      if (result.has(pack.locale)) {
        continue;
      }
      const name = languageDisplayName(pack.locale, value, pack.locale);
      result.set(pack.locale, {
        locale: pack.locale,
        nativeName: name,
        displayName: name,
        englishName: languageDisplayName(pack.locale, "en-US", pack.locale),
        aliases: BUILTIN_ALIASES[pack.locale] ?? [],
        builtin: false
      });
    }
    return Array.from(result.values());
  }, [builtins, catalog?.packs, installed, value]);

  const results = useMemo(() => searchLanguages(entries, query), [entries, query]);
  const catalogError = catalog?.status === "unavailable" ? catalog.error : undefined;
  const installedLocales = useMemo(
    () => new Set(installed.map((pack) => pack.locale)),
    [installed]
  );
  const current = entries.find((entry) => entry.locale === value) ?? {
    locale: value,
    nativeName: languageDisplayName(value, value, value),
    displayName: languageDisplayName(value, value, value),
    englishName: languageDisplayName(value, "en-US", value),
    aliases: [],
    builtin: BUILTIN_LOCALES.has(value)
  };

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const select = useCallback(async (entry: LanguagePickerEntry): Promise<void> => {
    const api = desktopApi?.languagePacks;
    if (entry.locale === value) {
      setOpen(false);
      return;
    }
    if (entry.builtin || installedLocales.has(entry.locale)) {
      onChange(entry.locale);
      setOpen(false);
      return;
    }
    if (api === undefined) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [entry.locale]: "Language packs are unavailable"
      }));
      return;
    }
    setOperations((currentOperations) => ({
      ...currentOperations,
      [entry.locale]: "installing"
    }));
    setErrors((currentErrors) => {
      const { [entry.locale]: _removed, ...remaining } = currentErrors;
      return remaining;
    });
    try {
      await api.install(entry.locale);
      await refresh();
      onChange(entry.locale);
      setOpen(false);
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [entry.locale]: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      setOperations((currentOperations) => {
        const { [entry.locale]: _removed, ...remaining } = currentOperations;
        return remaining;
      });
    }
  }, [desktopApi, installedLocales, onChange, refresh, value]);

  const remove = useCallback(async (entry: LanguagePickerEntry): Promise<void> => {
    const api = desktopApi?.languagePacks;
    if (api === undefined || entry.builtin || entry.locale === value) {
      return;
    }
    setOperations((currentOperations) => ({
      ...currentOperations,
      [entry.locale]: "removing"
    }));
    setErrors((currentErrors) => {
      const { [entry.locale]: _removed, ...remaining } = currentErrors;
      return remaining;
    });
    try {
      await api.uninstall(entry.locale);
      await refresh();
    } catch (error) {
      setErrors((currentErrors) => ({
        ...currentErrors,
        [entry.locale]: error instanceof Error ? error.message : String(error)
      }));
    } finally {
      setOperations((currentOperations) => {
        const { [entry.locale]: _removed, ...remaining } = currentOperations;
        return remaining;
      });
    }
  }, [desktopApi, refresh, value]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (results.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = results[activeIndex] ?? results[0];
      if (active !== undefined) {
        void select(active);
      }
    }
  };

  return (
    <AppPopover open={open} onOpenChange={handleOpenChange}>
      <AppPopoverTrigger asChild>
        <AppButton
          className="lyra-language-picker-trigger"
          variant="outline"
          aria-label={labels.searchPlaceholder}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="lyra-language-picker-trigger-copy">{current.nativeName}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent
        className="lyra-language-picker-popover"
        align="end"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="lyra-language-picker-search">
          <Search aria-hidden="true" size={16} />
          <AppInput
            ref={inputRef}
            value={query}
            placeholder={labels.searchPlaceholder}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={open}
            aria-activedescendant={
              results[activeIndex] === undefined
                ? undefined
                : `${listboxId}-${results[activeIndex]!.locale}`
            }
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
          />
        </div>
        <div id={listboxId} className="lyra-language-picker-results" role="listbox">
          {results.length === 0 ? (
            <AppStatusMessage
              className="lyra-language-picker-empty"
              role={catalogError === undefined ? undefined : "alert"}
              tone={catalogError === undefined ? "neutral" : "error"}
            >
              {catalogError ?? labels.noResults}
            </AppStatusMessage>
          ) : results.map((entry, index) => {
            const operation = operations[entry.locale];
            const error = errors[entry.locale];
            const selected = entry.locale === value;
            const isInstalled = entry.builtin || installedLocales.has(entry.locale);
            const downloadLabel = `${labels.download}: ${entry.nativeName}`;
            const removeLabel = `${labels.remove}: ${entry.nativeName}`;
            const operationLabel = operation === "removing"
              ? `${labels.removing}: ${entry.nativeName}`
              : `${labels.installing}: ${entry.nativeName}`;
            return (
              <div
                key={entry.locale}
                className="lyra-language-picker-option"
                data-active={index === activeIndex || undefined}
                data-selected={selected || undefined}
                onMouseMove={() => setActiveIndex(index)}
              >
                <AppButton
                  id={`${listboxId}-${entry.locale}`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  role="option"
                  aria-selected={selected}
                  className="lyra-language-picker-option-select"
                  disabled={operation !== undefined}
                  onClick={() => {
                    void select(entry);
                  }}
                >
                  <span className="lyra-language-picker-option-copy">{entry.nativeName}</span>
                </AppButton>
                <span className="lyra-language-picker-option-actions">
                  {operation !== undefined ? (
                    <Loader2
                      className="lyra-language-picker-operation"
                      aria-label={operationLabel}
                      size={16}
                    />
                  ) : error !== undefined ? (
                    <AppTooltip content={error}>
                      <CircleAlert
                        className="lyra-language-picker-error"
                        aria-label={error}
                        size={16}
                      />
                    </AppTooltip>
                  ) : selected ? (
                    <Check
                      className="lyra-language-picker-current"
                      aria-label={entry.nativeName}
                      size={16}
                    />
                  ) : isInstalled ? (
                    <AppTooltip content={removeLabel}>
                      <AppIconButton
                        aria-label={removeLabel}
                        title={removeLabel}
                        tone="danger"
                        className="lyra-language-picker-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          void remove(entry);
                        }}
                      >
                        <Trash2 aria-hidden="true" size={15} />
                      </AppIconButton>
                    </AppTooltip>
                  ) : (
                    <AppTooltip content={downloadLabel}>
                      <AppIconButton
                        aria-label={downloadLabel}
                        title={downloadLabel}
                        className="lyra-language-picker-action lyra-language-picker-action-download"
                        onClick={(event) => {
                          event.stopPropagation();
                          void select(entry);
                        }}
                      >
                        <Download aria-hidden="true" size={15} />
                      </AppIconButton>
                    </AppTooltip>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </AppPopoverContent>
    </AppPopover>
  );
};
