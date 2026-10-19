import type { AgentPageCitation } from "../../../../../../shared/agent";
import type { LyraDesktopApi } from "../../../../../../shared/desktop-bridge";
import { isLocalFilePath } from "./page-citation";
import { terminalTabIdFromPageUrl } from "./terminal-tab-citation";

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });

export type NavigateToPageCitationOptions = {
  readonly onOpenTerminalLiveSession?: (request: {
    readonly terminalTabId?: string | null;
  }) => Promise<void> | void;
  readonly onOpenExternalPageUrl?: (
    url: string,
    title?: string
  ) => Promise<void> | void;
};

const isExternalPageCitation = (citation: AgentPageCitation): boolean =>
  citation.sourceKind === "external-browser" || citation.tabId.startsWith("external-page-");

export const navigateToPageCitation = async (
  desktopApi: LyraDesktopApi | null,
  setActiveTab: (tabId: string) => void,
  citation: AgentPageCitation,
  options: NavigateToPageCitationOptions = {}
): Promise<boolean> => {
  const terminalTabId = terminalTabIdFromPageUrl(citation.pageUrl);
  if (terminalTabId !== null) {
    setActiveTab(citation.tabId);
    await options.onOpenTerminalLiveSession?.({ terminalTabId });
    return true;
  }

  if (citation.pageUrl.startsWith("lyra://workspace-tab/")) {
    setActiveTab(citation.tabId);
    return true;
  }

  // A file-manager or editor tab's address is a local path. Activating the tab is
  // the whole action; there is no browser page to navigate or search.
  if (isLocalFilePath(citation.pageUrl)) {
    setActiveTab(citation.tabId);
    return true;
  }

  if (isExternalPageCitation(citation)) {
    const targetUrl = citation.linkUrl?.trim() || citation.pageUrl.trim();
    if (targetUrl.length === 0) {
      return false;
    }
    await options.onOpenExternalPageUrl?.(targetUrl, citation.pageTitle);
    return true;
  }

  if (desktopApi === null) return false;
  setActiveTab(citation.tabId);
  await sleep(48);
  const current = await desktopApi.browser.readPageState({ tabId: citation.tabId });
  const currentAddress = current?.address ?? "";
  if (currentAddress !== citation.pageUrl) {
    await desktopApi.browser.navigate({
      tabId: citation.tabId,
      address: citation.pageUrl
    });
    await sleep(280);
  }
  const quote = citation.quotedText.trim();
  if (quote.length === 0) {
    return true;
  }
  try {
    const result = await desktopApi.browser.searchInPage({
      tabId: citation.tabId,
      query: quote.length > 120 ? quote.slice(0, 120) : quote,
      reveal: true,
      ephemeralReveal: true,
      direction: "current"
    });
    return result.totalMatches > 0;
  } catch {
    return false;
  }
};