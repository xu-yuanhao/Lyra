import {
  Globe,
  House,
  Search,
  Settings2,
  SquareTerminal
} from "@lyra/icons";
import { createRoot, type Root } from "react-dom/client";
import {
  useEffect,
  useState,
  type ReactNode,
  type SyntheticEvent
} from "react";

import type { AgentPageCitation, AgentPageCitationSourceKind } from "../../../../../../shared/agent";
import { renderWorkspaceAppIcon } from "../../../../workspace-apps";
import type { WorkbenchAppId, WorkspaceAppIconKey } from "../../../../workspace-apps";
import type { WorkspaceTab, WorkspaceTabPageKind } from "../../../../workspace-tabs/types";
import { terminalTabIdFromPageUrl } from "./terminal-tab-citation";
import {
  CITATION_CHIP_ICON_CLASS,
  PAGE_CITATION_FAVICON_CLASS,
  PAGE_CITATION_FAVICON_FALLBACK_CLASS
} from "./classes";
import {
  cachedWebsiteFaviconUrl,
  resolveWebsiteFaviconUrl
} from "./web-link";

const CHIP_ICON_STROKE = 1.8;

const workspaceTabPageKindFromUrl = (pageUrl: string): WorkspaceTabPageKind | null => {
  const prefix = "lyra://workspace-tab/";
  if (!pageUrl.startsWith(prefix)) {
    return null;
  }
  const rest = pageUrl.slice(prefix.length);
  const pageKind = rest.split("/")[0]?.trim();
  switch (pageKind) {
    case "search":
    case "results":
    case "page":
    case "settings":
    case "terminal":
    case "app":
      return pageKind;
    default:
      return null;
  }
};

export const resolvePageCitationSourceKind = (
  citation: AgentPageCitation
): AgentPageCitationSourceKind => {
  if (
    citation.sourceKind === "browser"
    || citation.sourceKind === "external-browser"
    || citation.sourceKind === "workspace-tab"
    || citation.sourceKind === "terminal-tab"
  ) {
    return citation.sourceKind;
  }
  if (citation.tabId.startsWith("external-page-")) {
    return "external-browser";
  }
  if (terminalTabIdFromPageUrl(citation.pageUrl) !== null) {
    return "terminal-tab";
  }
  if (citation.pageUrl.startsWith("lyra://workspace-tab/")) {
    return "workspace-tab";
  }
  return "browser";
};

export const pageCitationIconFieldsFromWorkspaceTab = (
  tab: WorkspaceTab
): Pick<
  AgentPageCitation,
  "sourceKind" | "tabPageKind" | "faviconUrl" | "appId" | "appIconKey"
> => ({
  sourceKind: "workspace-tab",
  tabPageKind: tab.pageKind,
  faviconUrl: tab.faviconUrl ?? null,
  appId: tab.appId ?? null,
  appIconKey: tab.appIconKey ?? null
});

const resolvedTabPageKind = (citation: AgentPageCitation): WorkspaceTabPageKind | null => {
  const explicit = citation.tabPageKind?.trim();
  if (
    explicit === "search"
    || explicit === "results"
    || explicit === "page"
    || explicit === "settings"
    || explicit === "terminal"
    || explicit === "app"
  ) {
    return explicit;
  }
  return workspaceTabPageKindFromUrl(citation.pageUrl);
};

const handleFaviconLoad = (event: SyntheticEvent<HTMLImageElement>) => {
  delete event.currentTarget.dataset.failed;
  event.currentTarget.dataset.loaded = "true";
};

const handleFaviconError = (event: SyntheticEvent<HTMLImageElement>) => {
  delete event.currentTarget.dataset.loaded;
  event.currentTarget.dataset.failed = "true";
};

const BrowserTabDefaultIcon = ({ size }: { readonly size: number }) => (
  <Globe size={size} strokeWidth={CHIP_ICON_STROKE} />
);

type WebsiteLinkIconProps = {
  readonly faviconUrl?: string | null | undefined;
  readonly pageUrl?: string | null | undefined;
  readonly size?: number;
  readonly className?: string;
};

export const WebsiteLinkIcon = ({
  faviconUrl,
  pageUrl,
  size = 12,
  className = CITATION_CHIP_ICON_CLASS
}: WebsiteLinkIconProps) => {
  const providedFaviconUrl = faviconUrl?.trim() || null;
  const [resolvedFavicon, setResolvedFavicon] = useState(() => ({
    pageUrl,
    iconUrl:
      pageUrl === undefined || pageUrl === null
        ? null
        : cachedWebsiteFaviconUrl(pageUrl)
  }));

  useEffect(() => {
    if (providedFaviconUrl !== null || pageUrl === undefined || pageUrl === null) {
      return;
    }
    let active = true;
    void resolveWebsiteFaviconUrl(pageUrl).then((iconUrl) => {
      // A missing favicon already renders the fallback icon. Avoid a no-op
      // state update (and extra chip render) when discovery also returns null.
      if (active && iconUrl !== null) {
        setResolvedFavicon({ pageUrl, iconUrl });
      }
    });
    return () => {
      active = false;
    };
  }, [pageUrl, providedFaviconUrl]);

  const resolvedFaviconUrl =
    providedFaviconUrl
    ?? (resolvedFavicon.pageUrl === pageUrl ? resolvedFavicon.iconUrl : null);
  if (resolvedFaviconUrl !== null && resolvedFaviconUrl.length > 0) {
    return (
      <span className={className} aria-hidden="true">
        <span className={PAGE_CITATION_FAVICON_CLASS}>
          <img
            key={resolvedFaviconUrl}
            src={resolvedFaviconUrl}
            alt=""
            loading="eager"
            decoding="async"
            referrerPolicy="no-referrer"
            onLoad={handleFaviconLoad}
            onError={handleFaviconError}
          />
          <span className={PAGE_CITATION_FAVICON_FALLBACK_CLASS}>
            <BrowserTabDefaultIcon size={size} />
          </span>
        </span>
      </span>
    );
  }

  return (
    <span className={className} aria-hidden="true">
      <BrowserTabDefaultIcon size={size} />
    </span>
  );
};

type PageCitationTabIconProps = {
  readonly citation?: AgentPageCitation;
  readonly tab?: WorkspaceTab;
  readonly size?: number;
  readonly className?: string;
};

export const PageCitationTabIcon = ({
  citation,
  tab,
  size = 12,
  className = CITATION_CHIP_ICON_CLASS
}: PageCitationTabIconProps) => {
  const sourceKind = tab !== undefined
    ? "workspace-tab" as const
    : citation === undefined
      ? "browser" as const
      : resolvePageCitationSourceKind(citation);

  if (sourceKind === "terminal-tab") {
    return (
      <span className={className} aria-hidden="true">
        <SquareTerminal size={size} strokeWidth={CHIP_ICON_STROKE} />
      </span>
    );
  }

  const pageKind = tab?.pageKind ?? (citation === undefined ? null : resolvedTabPageKind(citation));
  const faviconUrl = (tab?.faviconUrl ?? citation?.faviconUrl)?.trim();
  const appId = (tab?.appId ?? citation?.appId)?.trim() ?? "";
  const appIconKey = (tab?.appIconKey ?? citation?.appIconKey)?.trim() ?? "";

  if (pageKind === "settings") {
    return (
      <span className={className} aria-hidden="true">
        <Settings2 size={size} strokeWidth={CHIP_ICON_STROKE} />
      </span>
    );
  }

  if (pageKind === "results") {
    return (
      <span className={className} aria-hidden="true">
        <Search size={size} strokeWidth={CHIP_ICON_STROKE} />
      </span>
    );
  }

  if (pageKind === "search") {
    return (
      <span className={className} aria-hidden="true">
        <House size={size} strokeWidth={CHIP_ICON_STROKE} />
      </span>
    );
  }

  if (pageKind === "terminal") {
    return (
      <span className={className} aria-hidden="true">
        <SquareTerminal size={size} strokeWidth={CHIP_ICON_STROKE} />
      </span>
    );
  }

  if (pageKind === "app" && appId.length > 0 && appIconKey.length > 0) {
    return (
      <span className={className} aria-hidden="true">
        {renderWorkspaceAppIcon(appId as WorkbenchAppId, appIconKey as WorkspaceAppIconKey)}
      </span>
    );
  }

  return (
    <WebsiteLinkIcon
      faviconUrl={faviconUrl}
      pageUrl={tab?.displayAddress ?? citation?.pageUrl}
      size={size}
      className={className}
    />
  );
};

const iconRoots = new WeakMap<HTMLElement, Root>();

export const mountWebsiteLinkIcon = (
  container: HTMLElement,
  faviconUrl?: string | null,
  size = 12,
  className = CITATION_CHIP_ICON_CLASS,
  pageUrl?: string | null
): (() => void) => {
  let root = iconRoots.get(container);
  if (root === undefined) {
    root = createRoot(container);
    iconRoots.set(container, root);
  }
  root.render(
    <WebsiteLinkIcon
      faviconUrl={faviconUrl}
      pageUrl={pageUrl}
      size={size}
      className={className}
    />
  );
  return () => {
    if (iconRoots.get(container) !== root) {
      return;
    }
    root.unmount();
    iconRoots.delete(container);
  };
};

export const mountPageCitationTabIcon = (
  container: HTMLElement,
  citation: AgentPageCitation
): void => {
  let root = iconRoots.get(container);
  if (root === undefined) {
    root = createRoot(container);
    iconRoots.set(container, root);
  }
  root.render(<PageCitationTabIcon citation={citation} />);
};

export const renderPageCitationTabIconNode = (
  citation: AgentPageCitation,
  size = 12,
  className = CITATION_CHIP_ICON_CLASS
): ReactNode => (
  <PageCitationTabIcon citation={citation} size={size} className={className} />
);
