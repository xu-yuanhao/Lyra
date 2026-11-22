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

const LP_TRIGGER_CLASS =
  "lyra-language-picker-trigger w-[var(--lyra-unit-176)] justify-between gap-[var(--lyra-space-8)] rounded-[var(--lyra-control-radius-default)] border-[var(--lyra-app-input-border)] bg-[var(--lyra-app-input-bg)]! hover:border-[var(--lyra-app-input-focus-border)]! hover:bg-[var(--lyra-app-input-hover-bg)]! focus-visible:border-[var(--lyra-app-input-focus-border)]! focus-visible:bg-[var(--lyra-app-input-hover-bg)]! focus-visible:shadow-none!";

const LP_COPY_CLASS = "min-w-0 block text-left [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap";

const LP_POPOVER_CLASS =
  "lyra-language-picker-popover w-[min(var(--lyra-unit-320),calc(100vw-var(--lyra-space-24)))] border-[var(--lyra-app-border)] bg-[var(--lyra-app-popover-bg)]! p-[var(--lyra-space-6)]";

const LP_SEARCH_CLASS =
  "lyra-language-picker-search flex items-center gap-[var(--lyra-space-6)] border-b border-[var(--lyra-app-border)] px-[var(--lyra-space-6)] py-[var(--lyra-space-4)] text-[var(--lyra-text-muted)] [&_.lyra-ui-input]:h-[var(--lyra-space-32)] [&_.lyra-ui-input]:min-w-0 [&_.lyra-ui-input]:border-0 [&_.lyra-ui-input]:shadow-none";

const LP_RESULTS_CLASS = "lyra-language-picker-results max-h-[var(--lyra-unit-320)] overflow-y-auto pt-[var(--lyra-space-4)]";

const LP_OPTION_CLASS =
  "lyra-language-picker-option flex min-h-[var(--lyra-space-36)] w-full items-center gap-[var(--lyra-space-4)] rounded-[var(--lyra-radius-4)] bg-transparent px-[var(--lyra-space-4)] py-[var(--lyra-space-2)] text-inherit hover:bg-[var(--lyra-app-row-hover-bg)] data-[active]:bg-[var(--lyra-app-row-hover-bg)] data-[selected]:bg-[var(--lyra-app-row-active-bg)]";

const LP_OPTION_SELECT_CLASS =
  "lyra-language-picker-option-select min-h-[var(--lyra-space-32)] min-w-0 flex-1 justify-start border-0 bg-transparent px-[var(--lyra-space-4)] py-0 text-left text-inherit hover:bg-transparent hover:text-inherit disabled:cursor-default disabled:opacity-100";

const LP_OPTION_COPY_CLASS = `${LP_COPY_CLASS} lyra-language-picker-option-copy`;

const LP_OPTION_ACTIONS_CLASS =
  "lyra-language-picker-option-actions inline-flex size-[var(--lyra-space-28)] shrink-0 items-center justify-center";

const LP_ACTION_CLASS = "lyra-language-picker-action size-[var(--lyra-space-28)]";
const LP_ACTION_DOWNLOAD_CLASS = "lyra-language-picker-action-download text-[var(--lyra-status-success)]";
const LP_CURRENT_CLASS = "lyra-language-picker-current text-[var(--lyra-text-muted)]";
const LP_OPERATION_CLASS =
  "lyra-language-picker-operation animate-[lyra-language-picker-spin_var(--lyra-motion-spin-duration)_linear_infinite] text-[var(--lyra-text-muted)]";
const LP_ERROR_CLASS = "lyra-language-picker-error text-[var(--lyra-status-error)]";

const LP_EMPTY_CLASS =
  "lyra-language-picker-empty px-[var(--lyra-space-8)] py-[var(--lyra-space-16)] text-center text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)]";

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
          className={LP_TRIGGER_CLASS}
          variant="outline"
          aria-label={labels.searchPlaceholder}
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className={LP_COPY_CLASS}>{current.nativeName}</span>
          <ChevronDown aria-hidden="true" size={16} />
        </AppButton>
      </AppPopoverTrigger>
      <AppPopoverContent
        className={LP_POPOVER_CLASS}
        align="end"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className={LP_SEARCH_CLASS}>
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
        <div id={listboxId} className={LP_RESULTS_CLASS} role="listbox">
          {results.length === 0 ? (
            <AppStatusMessage
              className={LP_EMPTY_CLASS}
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
                className={LP_OPTION_CLASS}
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
                  className={LP_OPTION_SELECT_CLASS}
                  disabled={operation !== undefined}
                  onClick={() => {
                    void select(entry);
                  }}
                >
                  <span className={LP_OPTION_COPY_CLASS}>{entry.nativeName}</span>
                </AppButton>
                <span className={LP_OPTION_ACTIONS_CLASS}>
                  {operation !== undefined ? (
                    <Loader2
                      className={LP_OPERATION_CLASS}
                      aria-label={operationLabel}
                      size={16}
                    />
                  ) : error !== undefined ? (
                    <AppTooltip content={error}>
                      <CircleAlert
                        className={LP_ERROR_CLASS}
                        aria-label={error}
                        size={16}
                      />
                    </AppTooltip>
                  ) : selected ? (
                    <Check
                      className={LP_CURRENT_CLASS}
                      aria-label={entry.nativeName}
                      size={16}
                    />
                  ) : isInstalled ? (
                    <AppTooltip content={removeLabel}>
                      <AppIconButton
                        aria-label={removeLabel}
                        title={removeLabel}
                        tone="danger"
                        className={LP_ACTION_CLASS}
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
                        className={`${LP_ACTION_CLASS} ${LP_ACTION_DOWNLOAD_CLASS}`}
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
