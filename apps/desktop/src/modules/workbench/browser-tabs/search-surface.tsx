import { useMemo } from "react";

import { AppSearchField, AppTabs } from "@renderer/ui/components";
import type { SearchEngineDefinition } from "../browser-search/types";
import { LyraBrandLogo } from "../brand";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";

const BS_SHELL_CLASS =
  "lyra-workspace-browser-shell grid h-full min-h-0 w-full content-center justify-items-center gap-[var(--lyra-space-14)] bg-[var(--lyra-app-panel-bg)] px-[var(--lyra-space-32)] pt-[var(--lyra-space-24)] pb-[var(--lyra-space-32)]";
const BS_SEARCH_ROW_CLASS =
  "lyra-browser-search-row grid w-[clamp(var(--lyra-unit-320),50%,var(--lyra-unit-560))] max-w-[calc(100%-var(--lyra-space-32))] grid-cols-[minmax(0,1fr)] items-center gap-[var(--lyra-space-10)]";
const BS_PILL_CLASS =
  "lyra-browser-pill lyra-browser-pill-app-field [--lyra-browser-search-icon-slot:var(--lyra-size-browser-pill-h)] grid h-[var(--lyra-size-browser-pill-h)] w-full grid-cols-[var(--lyra-browser-search-icon-slot)_minmax(0,1fr)_auto] items-stretch gap-0 rounded-[var(--lyra-radius-pill)] border border-[var(--lyra-stroke-hairline)] border-[var(--lyra-app-border)] bg-[var(--lyra-app-panel-bg)] p-0 shadow-none hover:border-[color-mix(in_srgb,var(--lyra-app-border)_60%,var(--lyra-text-secondary)_40%)] [&_input]:min-w-0 [&_input]:w-full [&_input]:self-center [&_input]:text-[var(--lyra-text-primary)] [&_input]:text-[length:var(--lyra-text-size-14)] [&_input]:leading-[var(--lyra-text-line-flat)] [&_.lyra-app-search-field-leading]:h-full [&_.lyra-app-search-field-leading]:w-[var(--lyra-browser-search-icon-slot)] [&_.lyra-app-search-field-leading_.lyra-brand-logo]:size-[var(--lyra-space-28)] [&_.lyra-app-search-field-input]:h-full [&_.lyra-app-search-field-input]:text-[length:var(--lyra-text-size-14)] [&_.lyra-app-search-field-submit]:h-full [&_.lyra-app-search-field-submit]:w-[var(--lyra-browser-search-icon-slot)] [&_.lyra-app-search-field-submit]:rounded-l-none [&_.lyra-app-search-field-submit]:rounded-r-[var(--lyra-radius-pill)]";

export type BrowserSearchSurfaceProps = {
  readonly logoUrl: string;
  readonly inputValue: string;
  readonly placeholder: string;
  readonly searchActionLabel: string;
  readonly autoSearchLabel?: string;
  readonly sourceFilterLabel?: string;
  readonly searchEngines?: readonly SearchEngineDefinition[];
  readonly onPillRef?: (element: HTMLDivElement | null) => void;
  readonly onInputChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onSearchEngineSubmit?: (engineId: string) => void;
};

export const BrowserSearchSurface = ({
  logoUrl,
  inputValue,
  placeholder,
  searchActionLabel,
  autoSearchLabel,
  sourceFilterLabel,
  searchEngines = [],
  onPillRef,
  onInputChange,
  onSubmit,
  onSearchEngineSubmit
}: BrowserSearchSurfaceProps) => {
  const titlebarContribution = useMemo(
    () => {
      if (autoSearchLabel === undefined || sourceFilterLabel === undefined) {
        return null;
      }
      return {
        ariaLabel: sourceFilterLabel,
        content: (
          <AppTabs
            ariaLabel={`${sourceFilterLabel} options`}
            className="lyra-titlebar-context-tabs"
            selectionMode="multiple"
            value="auto"
            activeValues={["auto"]}
            options={[
              {
                value: "auto",
                label: autoSearchLabel,
                ariaLabel: `${sourceFilterLabel}: ${autoSearchLabel}`
              },
              ...searchEngines.map((engine) => ({
                value: engine.id,
                label: engine.label,
                ariaLabel: `${sourceFilterLabel}: ${engine.label}`
              }))
            ]}
            onValueChange={(value) => {
              if (value === "auto") {
                onSubmit();
                return;
              }
              onSearchEngineSubmit?.(value);
            }}
          />
        )
      };
    },
    [
      autoSearchLabel,
      onSearchEngineSubmit,
      onSubmit,
      searchEngines,
      sourceFilterLabel
    ]
  );
  useWorkbenchTitlebarContribution(titlebarContribution);

  return (
    <div className={BS_SHELL_CLASS}>
      <div className={BS_SEARCH_ROW_CLASS}>
        <AppSearchField
          ariaLabel="browser-address-input"
          value={inputValue}
          placeholder={placeholder}
          submitLabel={searchActionLabel}
          {...(onPillRef === undefined ? {} : { containerRef: onPillRef })}
          className={BS_PILL_CLASS}
          leading={(
            <LyraBrandLogo
              logoUrl={logoUrl}
              motion="ambient"
              spinIntensity="subtle"
              spinDurationMs={22000}
            />
          )}
          onValueChange={onInputChange}
          onSubmit={onSubmit}
        />
      </div>
    </div>
  );
};
