import { useEffect, useRef, useState, type MutableRefObject } from "react";

import {
  registerAgentBrowserPreviewWorkspace
} from "../ai-panel/lyra-agents/hooks/agent-browser-preview-workspace";
import type { EmbeddedBrowserPageDescriptor } from "./use-workbench-browser-runtime";

type WorkspaceTabsRef = {
  readonly current: {
    readonly tabs: readonly { readonly id: string }[];
    readonly setActiveTab: (tabId: string) => void;
    readonly openPageInNewTab: (
      address: string,
      titleHint?: string,
      options?: { readonly tabId?: string }
    ) => unknown;
    readonly closeTab: (tabId: string) => void;
  };
};

/**
 * Owns the agent-browser pages that are kept alive while their workspace tab is
 * parked, and bridges the preview-workspace registry to the tabs model.
 */
export const useParkedAgentBrowserPages = (
  tabsModelRef: WorkspaceTabsRef
): {
  readonly parkedAgentBrowserPages: readonly EmbeddedBrowserPageDescriptor[];
  readonly parkedAgentBrowserPagesRef: MutableRefObject<readonly EmbeddedBrowserPageDescriptor[]>;
} => {
  const [parkedAgentBrowserPages, setParkedAgentBrowserPages] = useState<
    readonly EmbeddedBrowserPageDescriptor[]
  >([]);
  const parkedAgentBrowserPagesRef = useRef(parkedAgentBrowserPages);
  parkedAgentBrowserPagesRef.current = parkedAgentBrowserPages;

  useEffect(() => {
    const replacePage = (
      pages: readonly EmbeddedBrowserPageDescriptor[],
      page: EmbeddedBrowserPageDescriptor
    ): readonly EmbeddedBrowserPageDescriptor[] => [
      ...pages.filter((entry) => entry.tabId !== page.tabId),
      page
    ];
    const removeTab = (
      pages: readonly EmbeddedBrowserPageDescriptor[],
      tabId: string
    ): readonly EmbeddedBrowserPageDescriptor[] =>
      pages.filter((entry) => entry.tabId !== tabId);

    return registerAgentBrowserPreviewWorkspace({
      parkTabIfWatched: (tabId, tab) => {
        const page: EmbeddedBrowserPageDescriptor = {
          tabId,
          address: tab.displayAddress,
          ...(tab.title.length === 0 ? {} : { titleHint: tab.title })
        };
        parkedAgentBrowserPagesRef.current = replacePage(
          parkedAgentBrowserPagesRef.current,
          page
        );
        setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
        return true;
      },
      ensureParked: (page) => {
        parkedAgentBrowserPagesRef.current = replacePage(
          parkedAgentBrowserPagesRef.current,
          page
        );
        setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
      },
      promoteOrActivate: (tabId) => {
        const tabs = tabsModelRef.current;
        const parked = parkedAgentBrowserPagesRef.current.find(
          (entry) => entry.tabId === tabId
        );
        const unpark = (): void => {
          if (parked === undefined) {
            return;
          }
          parkedAgentBrowserPagesRef.current = removeTab(
            parkedAgentBrowserPagesRef.current,
            tabId
          );
          setParkedAgentBrowserPages(parkedAgentBrowserPagesRef.current);
        };
        if (tabs.tabs.some((tab) => tab.id === tabId)) {
          tabs.setActiveTab(tabId);
          unpark();
          return true;
        }
        if (parked === undefined) {
          return false;
        }
        const opened = tabs.openPageInNewTab(parked.address, parked.titleHint, { tabId });
        if (opened === null) {
          return false;
        }
        unpark();
        return true;
      },
      destroyWatch: (tabIds) => {
        let pages = parkedAgentBrowserPagesRef.current;
        for (const tabId of tabIds) {
          pages = removeTab(pages, tabId);
        }
        parkedAgentBrowserPagesRef.current = pages;
        setParkedAgentBrowserPages(pages);
        for (const tabId of tabIds) {
          if (tabsModelRef.current.tabs.some((tab) => tab.id === tabId)) {
            tabsModelRef.current.closeTab(tabId);
          }
        }
      }
    });
  }, [tabsModelRef]);

  return { parkedAgentBrowserPages, parkedAgentBrowserPagesRef };
};
