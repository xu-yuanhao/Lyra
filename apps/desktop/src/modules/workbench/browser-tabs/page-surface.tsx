import { useCallback, useMemo } from "react";

import { AppButton, AppLoadingState } from "@renderer/ui/components";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import type { SearchEngineDefinition } from "../browser-search/types";
import { resolveNextSearchEngineSelection } from "../browser-search/service";
import { TITLEBAR_CONTEXT_CHIP_CLASS, TITLEBAR_CONTEXT_CONTROLS_CLASS, TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS } from "../shell/classes";

export type BrowserPageSurfaceProps = {
  readonly tabId: string;
  readonly searchQuery?: string;
  readonly searchSource?: "web";
  readonly searchEngineSelectionMode?: "auto" | "manual";
  readonly searchSelectedEngineIds?: readonly string[];
  readonly searchEngines?: readonly SearchEngineDefinition[];
  readonly sourceFilterLabel?: string;
  readonly autoSearchLabel?: string;
  readonly webTabLabel?: string;
  readonly onSearchEngineSelectionChange?: (
    selection: {
      readonly mode: "auto" | "manual";
      readonly engineIds: readonly string[];
    }
  ) => void;
  readonly isLoading?: boolean;
  readonly loadingLabel: string;
  readonly onHostChange?: (tabId: string, element: HTMLElement | null) => void;
};

const PH_HOST_CLASS =
  "lyra-page-host relative flex h-full min-h-0 w-full min-w-0 overflow-hidden rounded-[inherit] bg-[var(--lyra-app-panel-bg)]";
const PH_LOADING_CLASS =
  "lyra-page-loading-state pointer-events-none absolute inset-0 z-[2] grid place-content-center bg-[color-mix(in_srgb,var(--lyra-app-panel-bg)_82%,transparent)]";

export const BrowserPageSurface = ({
  tabId,
  searchQuery,
  searchSource,
  searchEngineSelectionMode,
  searchSelectedEngineIds = [],
  searchEngines = [],
  sourceFilterLabel,
  autoSearchLabel,
  webTabLabel,
  onSearchEngineSelectionChange,
  isLoading = false,
  loadingLabel,
  onHostChange
}: BrowserPageSurfaceProps) => {
  const handleHostRef = useCallback(
    (element: HTMLElement | null) => {
      onHostChange?.(tabId, element);
    },
    [onHostChange, tabId]
  );
  const titlebarContribution = useMemo(() => {
    if (
      searchQuery === undefined ||
      sourceFilterLabel === undefined ||
      autoSearchLabel === undefined ||
      webTabLabel === undefined
    ) {
      return null;
    }
    return {
      ariaLabel: sourceFilterLabel,
      content: (
        <>
          <span className={TITLEBAR_CONTEXT_CHIP_CLASS}>{searchQuery}</span>
          <div className={TITLEBAR_CONTEXT_CONTROLS_CLASS}>
            <AppButton
              variant="ghost"
              size="sm"
              className={
                searchEngineSelectionMode !== "manual"
                  ? `${TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS} lyra-titlebar-context-button-active`
                  : TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS
              }
              aria-label={`${sourceFilterLabel}: ${autoSearchLabel}`}
              onClick={() => {
                onSearchEngineSelectionChange?.({ mode: "auto", engineIds: [] });
              }}
            >
              {autoSearchLabel}
            </AppButton>
            {searchEngines.map((engine) => (
              <AppButton
                key={engine.id}
                variant="ghost"
                size="sm"
                className={
                  searchEngineSelectionMode === "manual" &&
                  searchSelectedEngineIds.includes(engine.id)
                    ? `${TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS} lyra-titlebar-context-button-active`
                    : TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS
                }
                aria-label={`${sourceFilterLabel}: ${engine.label}`}
                onClick={() => {
                  onSearchEngineSelectionChange?.(
                    resolveNextSearchEngineSelection({
                      currentMode: searchEngineSelectionMode ?? "auto",
                      currentEngineIds: searchSelectedEngineIds,
                      clickedEngineId: engine.id
                    })
                  );
                }}
              >
                {engine.label}
              </AppButton>
            ))}
          </div>
        </>
      )
    };
  }, [
    autoSearchLabel,
    onSearchEngineSelectionChange,
    searchEngineSelectionMode,
    searchEngines,
    searchSelectedEngineIds,
    searchQuery,
    searchSource,
    sourceFilterLabel,
    webTabLabel
  ]);
  useWorkbenchTitlebarContribution(titlebarContribution);

  return (
    <section
      ref={handleHostRef}
      className={PH_HOST_CLASS}
      aria-label="page-surface"
      data-browser-page-host="true"
      data-tab-id={tabId}
    >
      {isLoading ? (
        <AppLoadingState
          className={PH_LOADING_CLASS}
          title={loadingLabel}
        />
      ) : null}
    </section>
  );
};
