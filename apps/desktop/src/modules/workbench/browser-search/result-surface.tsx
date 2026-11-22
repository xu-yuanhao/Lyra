import { useMemo } from "react";

import type {
  BrowserSearchPayload,
  SearchEngineDefinition
} from "./types";
import { AppTabs } from "@renderer/ui/components";
import type {
  SearchResultsSourceFilter
} from "./result-surface-model";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import {
  resolveNextSearchEngineSelection
} from "./service";

export type BrowserResultSurfaceProps = {
  readonly logoUrl: string;
  readonly inputValue: string;
  readonly placeholder: string;
  readonly searchActionLabel: string;
  readonly headingLabel: string;
  readonly sourceFilterLabel: string;
  readonly autoSearchLabel: string;
  readonly officialResultLabel: string;
  readonly officialHomepageLabel: string;
  readonly officialSubsiteLabel: string;
  readonly officialDocsLabel: string;
  readonly officialLoginLabel: string;
  readonly officialDownloadLabel: string;
  readonly officialSupportLabel: string;
  readonly allTabLabel: string;
  readonly emptyLabel: string;
  readonly engineErrorLabel: string;
  readonly webTabLabel: string;
  readonly channelIdleLabel: string;
  readonly channelLoadingLabel: string;
  readonly channelReadyLabel: string;
  readonly channelErrorLabel: string;
  readonly sourceFilter: SearchResultsSourceFilter;
  readonly payload: BrowserSearchPayload;
  readonly sharedStartRect?: DOMRect | null;
  readonly searchEngineSelectionMode?: "auto" | "manual";
  readonly searchSelectedEngineIds?: readonly string[];
  readonly searchEngines: readonly SearchEngineDefinition[];
  readonly onInputChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onSourceFilterChange: (value: SearchResultsSourceFilter) => void;
  readonly onSearchEngineSelectionChange: (
    selection: {
      readonly mode: "auto" | "manual";
      readonly engineIds: readonly string[];
    }
  ) => void;
  readonly onSwitchToWebSearch: () => void;
  readonly onOpenUrl?: (url: string, title: string) => void;
  readonly onSharedAnimationDone?: () => void;
};

const RS_SHELL_CLASS = "lyra-results-shell grid h-full min-h-0 grid-rows-[minmax(0,1fr)]";

export const BrowserResultSurface = ({
  logoUrl,
  inputValue,
  placeholder,
  searchActionLabel,
  headingLabel,
  sourceFilterLabel,
  autoSearchLabel,
  officialResultLabel,
  officialHomepageLabel,
  officialSubsiteLabel,
  officialDocsLabel,
  officialLoginLabel,
  officialDownloadLabel,
  officialSupportLabel,
  allTabLabel,
  emptyLabel,
  engineErrorLabel,
  webTabLabel,
  channelIdleLabel,
  channelLoadingLabel,
  channelReadyLabel,
  channelErrorLabel,
  sourceFilter,
  payload,
  sharedStartRect,
  searchEngineSelectionMode = "auto",
  searchSelectedEngineIds = [],
  searchEngines,
  onInputChange,
  onSubmit,
  onSourceFilterChange,
  onSearchEngineSelectionChange,
  onSwitchToWebSearch,
  onOpenUrl,
  onSharedAnimationDone
}: BrowserResultSurfaceProps) => {
  const titlebarContribution = useMemo(
    () => ({
      ariaLabel: headingLabel,
      content: (
        <>
            <span className="lyra-titlebar-context-chip">{payload.query}</span>
            <AppTabs
              ariaLabel={`${sourceFilterLabel} options`}
              className="lyra-titlebar-context-tabs"
              selectionMode="multiple"
              value={
                searchEngineSelectionMode === "manual"
                  ? searchSelectedEngineIds[0] ?? "auto"
                  : "auto"}
              activeValues={
                searchEngineSelectionMode === "manual"
                  ? searchSelectedEngineIds
                  : ["auto"]}
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
                  onSwitchToWebSearch();
                  return;
                }
                onSearchEngineSelectionChange(
                  resolveNextSearchEngineSelection({
                    currentMode: searchEngineSelectionMode,
                    currentEngineIds: searchSelectedEngineIds,
                    clickedEngineId: value
                  })
                );
              }}
            />
        </>
      )
    }),
    [
      headingLabel,
      autoSearchLabel,
      onSearchEngineSelectionChange,
      onSwitchToWebSearch,
      payload.query,
      searchEngineSelectionMode,
      searchEngines,
      searchSelectedEngineIds,
      sourceFilterLabel,
      webTabLabel
    ]
  );
  useWorkbenchTitlebarContribution(titlebarContribution);

  void inputValue;
  void logoUrl;
  void onInputChange;
  void onOpenUrl;
  void onSharedAnimationDone;
  void onSubmit;
  void placeholder;
  void searchActionLabel;
  void sharedStartRect;
  void sourceFilter;
  void allTabLabel;
  void officialResultLabel;
  void officialHomepageLabel;
  void officialSubsiteLabel;
  void officialDocsLabel;
  void officialLoginLabel;
  void officialDownloadLabel;
  void officialSupportLabel;
  void emptyLabel;
  void engineErrorLabel;
  void channelIdleLabel;
  void channelLoadingLabel;
  void channelReadyLabel;
  void channelErrorLabel;

  return (
    <section className={RS_SHELL_CLASS} aria-label="search-results-surface" />
  );
};