import { useCallback, useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Search,
  Globe,
  Star
} from "@lyra/icons";
import type { ChangeEvent, FormEvent, ReactNode } from "react";
import type {
  WorkbenchBrowserChromePopoverRequest,
  WorkbenchBrowserEvent,
  WorkbenchBrowserSearchInPageResult,
  WorkbenchBrowserWebThemeSnapshot
} from "../../../shared/desktop-bridge";
import { DEFAULT_WEB_THEME_SNAPSHOT } from "../../../shared/workbench-browser";
import { AppIconButton, AppInput } from "@renderer/ui/components";
import {
  FIND_EMPTY_CLASS,
  FIND_RESULT_INDEX_CLASS,
  FIND_TRUNCATED_CLASS,
  OMNIBOX_SUGGESTION_PANEL_CLASS,
  SUGGESTION_ITEM_CLASS,
  SUGGESTION_LEFT_CLASS,
  SUGGESTION_TEXT_CLASS,
  SUGGESTION_TYPE_BADGE_CLASS,
  TITLEBAR_NAVIGATION_ACTIONS_CLASS,
  TITLEBAR_NAVIGATION_ACTION_CLASS,
  TITLEBAR_NAVIGATION_ACTION_RELOADING_CLASS,
  TITLEBAR_NAVIGATION_CLASS,
  TITLEBAR_NAVIGATION_EXTERNAL_ACTIONS_CLASS,
  TITLEBAR_NAVIGATION_FAVORITE_ACTION_CLASS,
  TITLEBAR_NAVIGATION_FORM_CLASS,
  TITLEBAR_NAVIGATION_INPUT_CLASS,
  TITLEBAR_NAVIGATION_ROW_CLASS,
  TITLEBAR_NAVIGATION_SHELL_CLASS,
  TITLEBAR_NAVIGATION_SHELL_CONTEXTUAL_CLASS,
  TITLEBAR_PAGE_FIND_COUNTER_CLASS
} from "./classes";
import { cx } from "../ui-primitives";
import { t, formatMessage } from "@workbench/i18n";
import type { OmniboxSuggestion } from "./use-titlebar-navigation-model";
import { useAnchoredOverlayPosition } from "./use-anchored-overlay-position";

export type TitlebarNavigationPrimaryActionKind = "submit" | "reload";

type TitlebarNavigationProps = {
  readonly mode?: "normal" | "page-find";
  readonly value: string;
  readonly placeholder: string;
  readonly ariaLabel: string;
  readonly submitLabel: string;
  readonly reloadLabel: string;
  readonly primaryActionKind: TitlebarNavigationPrimaryActionKind;
  readonly isContextualAddress: boolean;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void | Promise<void>;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly favoriteButton?: {
    readonly visible: boolean;
    readonly active: boolean;
    readonly label: string;
    readonly onToggle: () => void;
  };
  readonly trailingControl?: ReactNode;
  readonly suggestions?: readonly OmniboxSuggestion[];
  readonly selectedIndex?: number;
  readonly showSuggestions?: boolean;
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
  readonly onSuggestionClick?: (suggestion: OmniboxSuggestion) => void;
  readonly focusRequestKey?: number;
  readonly pageFindResult?: WorkbenchBrowserSearchInPageResult | null;
  readonly onPageFindClose?: () => void;
  readonly onPageFindNext?: () => void | Promise<void>;
  readonly onPageFindPrevious?: () => void | Promise<void>;
  readonly onPageFindMatchClick?: (index: number) => void | Promise<void>;
  readonly activeBrowserTabId?: string | null;
  readonly browserChromePopoverBridge?: {
    readonly setChromePopover?: (
      request: WorkbenchBrowserChromePopoverRequest
    ) => Promise<void>;
    readonly onEvent?: (
      listener: (event: WorkbenchBrowserEvent) => void
    ) => () => void;
  } | undefined;
};

const readCssVar = (styles: CSSStyleDeclaration, name: string, fallback: string): string => {
  const value = styles.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
};

const readChromePopoverTheme = (): WorkbenchBrowserWebThemeSnapshot => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return DEFAULT_WEB_THEME_SNAPSHOT;
  }
  const styles = window.getComputedStyle(document.documentElement);
  const fallback = DEFAULT_WEB_THEME_SNAPSHOT.palette;
  return {
    enabled: true,
    isDark: document.documentElement.dataset.lyraThemeTone === "dark",
    revision: 0,
    palette: {
      bgApp: readCssVar(styles, "--lyra-app-bg", fallback.bgApp),
      bgSurface: readCssVar(styles, "--lyra-app-popover-bg", fallback.bgSurface),
      bgEditor: readCssVar(styles, "--lyra-app-row-hover-bg", fallback.bgEditor),
      textPrimary: readCssVar(styles, "--lyra-text-primary", fallback.textPrimary),
      textSecondary: readCssVar(styles, "--lyra-text-secondary", fallback.textSecondary),
      textMuted: readCssVar(styles, "--lyra-text-muted", fallback.textMuted),
      textAccent: readCssVar(styles, "--lyra-text-accent", fallback.textAccent),
      lineDefault: readCssVar(styles, "--lyra-app-border", fallback.lineDefault),
      lineFocused: readCssVar(styles, "--lyra-app-border-strong", fallback.lineFocused),
      statusSuccess: readCssVar(styles, "--lyra-status-success", fallback.statusSuccess),
      statusWarning: readCssVar(styles, "--lyra-status-warning", fallback.statusWarning),
      statusError: readCssVar(styles, "--lyra-status-error", fallback.statusError)
    }
  };
};

export const TitlebarNavigation = ({
  mode = "normal",
  value,
  placeholder,
  ariaLabel,
  submitLabel,
  reloadLabel,
  primaryActionKind,
  isContextualAddress,
  onChange,
  onSubmit,
  onFocus,
  onBlur,
  favoriteButton,
  trailingControl,
  suggestions = [],
  selectedIndex = -1,
  showSuggestions = false,
  onKeyDown = () => undefined,
  onSuggestionClick = () => undefined,
  focusRequestKey = 0,
  pageFindResult = null,
  onPageFindNext = () => undefined,
  onPageFindPrevious = () => undefined,
  onPageFindMatchClick = () => undefined,
  activeBrowserTabId = null,
  browserChromePopoverBridge
}: TitlebarNavigationProps) => {
  const hasTrailingControl = trailingControl !== undefined && trailingControl !== null;
  const hasFavoriteButton = favoriteButton?.visible === true;
  const pageFindMode = mode === "page-find";
  const hasExternalActions =
    hasTrailingControl || hasFavoriteButton || (!pageFindMode && primaryActionKind === "reload");

  const [reloadAnimating, setReloadAnimating] = useState(false);
  const navigationRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const overlayRef = useRef<HTMLUListElement | null>(null);
  const nativeFindPopoverTabIdRef = useRef<string | null>(null);
  const nativeOmniboxPopoverTabIdRef = useRef<string | null>(null);
  const suggestionPanelOpen = !pageFindMode && showSuggestions && suggestions.length > 0;
  const canUseNativeOmniboxPopover =
    activeBrowserTabId !== null && browserChromePopoverBridge?.setChromePopover !== undefined;
  const canUseNativeFindPopover =
    pageFindMode
    && activeBrowserTabId !== null
    && browserChromePopoverBridge?.setChromePopover !== undefined;
  const nativeSuggestionPanelOpen = suggestionPanelOpen && canUseNativeOmniboxPopover;
  const inlineSuggestionPanelOpen = suggestionPanelOpen && !nativeSuggestionPanelOpen;
  const inlinePageFindPanelOpen = pageFindMode && !canUseNativeFindPopover;
  const inlineOverlayOpen = inlineSuggestionPanelOpen || inlinePageFindPanelOpen;
  const overlayPosition = useAnchoredOverlayPosition({
    open: inlineOverlayOpen,
    anchorRef: navigationRef,
    overlayRef,
    matchAnchorWidth: true,
    minWidth: 1,
    minHeight: 54,
    maxHeight: 240,
    offset: 6
  });
  const pageFindMatches = pageFindMode ? pageFindResult?.matches ?? [] : [];
  const pageFindCounter = pageFindMode
    ? pageFindResult !== null && pageFindResult.totalMatches > 0
      ? `${Math.max(1, pageFindResult.currentIndex)} / ${pageFindResult.totalMatches}`
      : "0 / 0"
    : null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (primaryActionKind === "reload") {
      setReloadAnimating(false);
      window.requestAnimationFrame(() => {
        setReloadAnimating(true);
      });
    }
    void onSubmit();
  };

  useEffect(() => {
    if (!reloadAnimating) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setReloadAnimating(false);
    }, 650);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [reloadAnimating]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onChange(event.target.value);
  };

  const hideNativeOmniboxPopover = useCallback((): void => {
    const tabId = nativeOmniboxPopoverTabIdRef.current;
    nativeOmniboxPopoverTabIdRef.current = null;
    if (tabId === null || browserChromePopoverBridge?.setChromePopover === undefined) {
      return;
    }
    void browserChromePopoverBridge.setChromePopover({
      tabId,
      kind: "omnibox",
      visible: false
    }).catch(() => undefined);
  }, [browserChromePopoverBridge]);

  const hideNativeFindPopover = useCallback((): void => {
    const tabId = nativeFindPopoverTabIdRef.current;
    nativeFindPopoverTabIdRef.current = null;
    if (tabId === null || browserChromePopoverBridge?.setChromePopover === undefined) {
      return;
    }
    void browserChromePopoverBridge.setChromePopover({
      tabId,
      kind: "find",
      visible: false
    }).catch(() => undefined);
  }, [browserChromePopoverBridge]);

  useEffect(() => () => {
    hideNativeFindPopover();
    hideNativeOmniboxPopover();
  }, [hideNativeFindPopover, hideNativeOmniboxPopover]);

  useEffect(() => {
    if (focusRequestKey <= 0) {
      return;
    }
    const input = inputRef.current;
    if (input === null) {
      return;
    }
    input.focus();
    input.select();
  }, [focusRequestKey]);

  useEffect(() => {
    if (browserChromePopoverBridge?.onEvent === undefined) {
      return undefined;
    }
    return browserChromePopoverBridge.onEvent((event) => {
      if (
        event.kind === "chrome-popover-state"
        && event.popoverKind === "omnibox"
        && event.tabId === activeBrowserTabId
        && event.visible === false
      ) {
        nativeOmniboxPopoverTabIdRef.current = null;
      }
      if (
        event.kind === "chrome-popover-state"
        && event.popoverKind === "find"
        && event.tabId === activeBrowserTabId
        && event.visible === false
      ) {
        nativeFindPopoverTabIdRef.current = null;
      }
      if (
        event.kind === "request-omnibox-suggestion-select"
        && event.tabId === activeBrowserTabId
      ) {
        const suggestion = suggestions[event.index];
        if (suggestion !== undefined) {
          onSuggestionClick(suggestion);
        }
      }
    });
  }, [
    activeBrowserTabId,
    browserChromePopoverBridge,
    onSuggestionClick,
    suggestions
  ]);

  useEffect(() => {
    if (
      !nativeSuggestionPanelOpen
      || activeBrowserTabId === null
      || browserChromePopoverBridge?.setChromePopover === undefined
      || navigationRef.current === null
    ) {
      hideNativeOmniboxPopover();
      return;
    }
    const rect = navigationRef.current.getBoundingClientRect();
    nativeOmniboxPopoverTabIdRef.current = activeBrowserTabId;
    void browserChromePopoverBridge.setChromePopover({
      tabId: activeBrowserTabId,
      kind: "omnibox",
      visible: true,
      anchorRect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      theme: readChromePopoverTheme(),
      omnibox: {
        value,
        selectedIndex,
        labels: {
          ariaLabel: t("navigation.addressSuggestionAriaLabel"),
          history: t("navigation.suggestionTypeHistory"),
          searchSuggestion: t("navigation.suggestionTypeSearch"),
          emptyStart: t("navigation.omniboxEmptyStart"),
          emptyNoMatch: t("navigation.omniboxEmptyNoMatch")
        },
        suggestions: suggestions.map((suggestion) => ({
          value: suggestion.value,
          type: suggestion.type,
          ...(suggestion.label === undefined ? {} : { label: suggestion.label })
        }))
      }
    }).then(() => {
      if (nativeOmniboxPopoverTabIdRef.current === activeBrowserTabId) {
        inputRef.current?.focus();
      }
    }).catch(() => {
      nativeOmniboxPopoverTabIdRef.current = null;
    });
  }, [
    activeBrowserTabId,
    browserChromePopoverBridge,
    hideNativeOmniboxPopover,
    nativeSuggestionPanelOpen,
    selectedIndex,
    suggestions,
    value
  ]);

  useEffect(() => {
    if (
      !canUseNativeFindPopover
      || activeBrowserTabId === null
      || browserChromePopoverBridge?.setChromePopover === undefined
      || navigationRef.current === null
    ) {
      hideNativeFindPopover();
      return;
    }
    const rect = navigationRef.current.getBoundingClientRect();
    nativeFindPopoverTabIdRef.current = activeBrowserTabId;
    const result = pageFindResult;
    void browserChromePopoverBridge.setChromePopover({
      tabId: activeBrowserTabId,
      kind: "find",
      visible: true,
      anchorRect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height
      },
      theme: readChromePopoverTheme(),
      find: {
        query: result?.query ?? value,
        currentIndex: result?.currentIndex ?? 0,
        totalMatches: result?.totalMatches ?? 0,
        ...(result?.activeMatchId === undefined ? {} : { activeMatchId: result.activeMatchId }),
        matches: result?.matches ?? [],
        truncated: result?.truncated === true,
        labels: {
          ariaLabel: t("navigation.pageFindResultsAriaLabel"),
          current: t("navigation.pageFindResultCurrent"),
          result: t("navigation.pageFindResultLabel"),
          emptyStart: t("navigation.pageFindEmptyStart"),
          emptyNoMatch: t("navigation.pageFindEmptyNoMatch"),
          truncationNotice: formatMessage("navigation.pageFindTruncationNotice", {
            count: result?.matches.length ?? 0
          })
        }
      }
    }).catch(() => {
      nativeFindPopoverTabIdRef.current = null;
    });
  }, [
    activeBrowserTabId,
    browserChromePopoverBridge,
    canUseNativeFindPopover,
    hideNativeFindPopover,
    pageFindResult,
    value
  ]);

  const renderPageFindSnippet = (snippet: string): ReactNode => {
    const trimmedQuery = value.trim();
    if (trimmedQuery.length === 0) {
      return snippet;
    }
    const lowerSnippet = snippet.toLocaleLowerCase();
    const lowerQuery = trimmedQuery.toLocaleLowerCase();
    const index = lowerSnippet.indexOf(lowerQuery);
    if (index < 0) {
      return snippet;
    }
    return (
      <>
        {snippet.slice(0, index)}
        <mark>{snippet.slice(index, index + trimmedQuery.length)}</mark>
        {snippet.slice(index + trimmedQuery.length)}
      </>
    );
  };

  const overlayList = inlineSuggestionPanelOpen ? (
    <ul
      ref={overlayRef}
      className={OMNIBOX_SUGGESTION_PANEL_CLASS}
      role="listbox"
      aria-label={t("navigation.addressSuggestionAriaLabel")}
      data-placement={overlayPosition.placement}
      style={overlayPosition.style}
    >
      {suggestions.map((suggestion, index) => (
        <li
          key={`${suggestion.value}-${index}`}
          role="option"
          aria-selected={index === selectedIndex}
          className={cx(
            SUGGESTION_ITEM_CLASS,
            index === selectedIndex && "is-selected"
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            onSuggestionClick(suggestion);
          }}
        >
          <div className={SUGGESTION_LEFT_CLASS}>
            {suggestion.type === "history" && <Globe size={13} />}
            {suggestion.type === "search" && <Search size={13} />}
            <span className={SUGGESTION_TEXT_CLASS}>
              {suggestion.value} {suggestion.label ? `(${suggestion.label})` : ""}
            </span>
          </div>
          <span className={SUGGESTION_TYPE_BADGE_CLASS}>
            {suggestion.type === "history" ? t("navigation.suggestionTypeHistory") : t("navigation.suggestionTypeSearch")}
          </span>
        </li>
      ))}
    </ul>
  ) : inlinePageFindPanelOpen ? (
    <ul
      ref={overlayRef}
      className={OMNIBOX_SUGGESTION_PANEL_CLASS}
      role="listbox"
      aria-label={t("navigation.pageFindResultsAriaLabel")}
      data-placement={overlayPosition.placement}
      style={overlayPosition.style}
    >
      {pageFindMatches.length > 0 ? (
        pageFindMatches.map((match) => {
          const selected =
            match.id === pageFindResult?.activeMatchId
            || match.index === pageFindResult?.currentIndex;
          return (
            <li
              key={match.id}
              role="option"
              aria-selected={selected}
              className={cx(SUGGESTION_ITEM_CLASS, selected && "is-selected")}
              onMouseDown={(event) => {
                event.preventDefault();
                void onPageFindMatchClick(match.index);
              }}
            >
              <div className={SUGGESTION_LEFT_CLASS}>
                <span className={FIND_RESULT_INDEX_CLASS}>#{match.index}</span>
                <span className={SUGGESTION_TEXT_CLASS}>
                  {renderPageFindSnippet(match.snippet)}
                </span>
              </div>
              <span className={SUGGESTION_TYPE_BADGE_CLASS}>
                {selected ? t("navigation.pageFindResultCurrent") : t("navigation.pageFindResultLabel")}
              </span>
            </li>
          );
        })
      ) : (
        <li className={FIND_EMPTY_CLASS}>
          {value.trim().length === 0 ? t("navigation.pageFindEmptyStart") : t("navigation.pageFindEmptyNoMatch")}
        </li>
      )}
      {pageFindResult?.truncated === true ? (
        <li className={FIND_TRUNCATED_CLASS}>
          {formatMessage("navigation.pageFindTruncationNotice", { count: pageFindMatches.length })}
        </li>
      ) : null}
    </ul>
  ) : null;

  return (
    <>
      <div className={cx(TITLEBAR_NAVIGATION_CLASS, "lyra-no-drag")}>
        <form ref={navigationRef} className={TITLEBAR_NAVIGATION_FORM_CLASS} onSubmit={handleSubmit}>
          <div
            className={
              isContextualAddress
                ? cx(TITLEBAR_NAVIGATION_SHELL_CLASS, TITLEBAR_NAVIGATION_SHELL_CONTEXTUAL_CLASS)
                : TITLEBAR_NAVIGATION_SHELL_CLASS
            }
            data-has-trailing-control={hasTrailingControl ? "true" : "false"}
            data-has-favorite-control={hasFavoriteButton ? "true" : "false"}
            data-mode={pageFindMode ? "page-find" : "normal"}
            data-primary-action={primaryActionKind}
          >
            <div className={TITLEBAR_NAVIGATION_ROW_CLASS}>
              <AppInput
                ref={inputRef}
                className={TITLEBAR_NAVIGATION_INPUT_CLASS}
                type="text"
                value={value}
                placeholder={placeholder}
                aria-label={ariaLabel}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                onChange={handleChange}
                onFocus={onFocus}
                onBlur={() => {
                  window.setTimeout(() => {
                    if (inputRef.current === document.activeElement) {
                      return;
                    }
                    if (nativeOmniboxPopoverTabIdRef.current !== null) {
                      inputRef.current?.focus();
                      return;
                    }
                    onBlur();
                  }, 50);
                }}
                onKeyDown={onKeyDown}
              />
              {pageFindMode || primaryActionKind === "submit" ? (
                <span className={TITLEBAR_NAVIGATION_ACTIONS_CLASS}>
                  {pageFindMode ? (
                    <>
                      <span className={TITLEBAR_PAGE_FIND_COUNTER_CLASS}>
                        {pageFindCounter}
                      </span>
                      <AppIconButton
                        className={TITLEBAR_NAVIGATION_ACTION_CLASS}
                        aria-label={t("navigation.previousPageResult")}
                        title={t("navigation.previousPageResult")}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          void onPageFindPrevious();
                        }}
                      >
                        <ChevronUp size={14} aria-hidden="true" />
                      </AppIconButton>
                      <AppIconButton
                        className={TITLEBAR_NAVIGATION_ACTION_CLASS}
                        aria-label={t("navigation.nextPageResult")}
                        title={t("navigation.nextPageResult")}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          void onPageFindNext();
                        }}
                      >
                        <ChevronDown size={14} aria-hidden="true" />
                      </AppIconButton>
                    </>
                  ) : (
                    <AppIconButton
                      type="submit"
                      className={TITLEBAR_NAVIGATION_ACTION_CLASS}
                      aria-label={submitLabel}
                      title={submitLabel}
                    >
                      <ArrowRight size={14} aria-hidden="true" />
                    </AppIconButton>
                  )}
                </span>
              ) : null}
            </div>
          </div>
        </form>
        {hasExternalActions ? (
          <div className={TITLEBAR_NAVIGATION_EXTERNAL_ACTIONS_CLASS}>
            {!pageFindMode && primaryActionKind === "reload" ? (
              <AppIconButton
                type="button"
                className={
                  reloadAnimating
                    ? cx(TITLEBAR_NAVIGATION_ACTION_CLASS, TITLEBAR_NAVIGATION_ACTION_RELOADING_CLASS)
                    : TITLEBAR_NAVIGATION_ACTION_CLASS
                }
                aria-label={reloadLabel}
                title={reloadLabel}
                onClick={() => navigationRef.current?.requestSubmit()}
              >
                <RefreshCw size={14} aria-hidden="true" />
              </AppIconButton>
            ) : null}
            {trailingControl}
            {hasFavoriteButton ? (
              <AppIconButton
                className={cx(TITLEBAR_NAVIGATION_ACTION_CLASS, TITLEBAR_NAVIGATION_FAVORITE_ACTION_CLASS)}
                active={favoriteButton!.active}
                aria-label={favoriteButton!.label}
                title={favoriteButton!.label}
                onClick={favoriteButton!.onToggle}
              >
                <Star
                  size={14}
                  aria-hidden="true"
                  fill={favoriteButton!.active ? "currentColor" : "none"}
                />
              </AppIconButton>
            ) : null}
          </div>
        ) : null}
      </div>
      {overlayList !== null ? createPortal(overlayList, document.body) : null}
    </>
  );
};
