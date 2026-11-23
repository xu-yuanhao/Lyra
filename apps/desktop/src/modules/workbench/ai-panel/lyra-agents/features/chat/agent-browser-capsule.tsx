import { X } from "@lyra/icons";
import { AppButton } from "@renderer/ui/components";
import { LyraLogo } from "@renderer/ui/app";
import { t } from "@workbench/i18n";
import type { AgentBrowserPreviewSnapshot } from "../../../../../../shared/agent";
import type { LyraDesktopApi } from "../../../../../../shared/desktop-bridge";
import { useAgentBrowserPreview, openAgentBrowserPreviewTarget } from "../../hooks/useAgentBrowserPreview";
import {
  BROWSER_CAPSULE_CLASS,
  BROWSER_CAPSULE_DISMISS_CLASS,
  BROWSER_CAPSULE_FAVICON_CLASS,
  BROWSER_CAPSULE_LOGO_CLASS,
  BROWSER_CAPSULE_LOGO_FALLBACK_CLASS,
  BROWSER_CAPSULE_WRAP_CLASS,
  COMPOSER_RAIL_CHIP_CLASS
} from "./classes";

const ERROR_PAGE_TITLES = new Set([
  "not found",
  "404",
  "404 not found",
  "page not found",
  "file not found",
  "forbidden",
  "403",
  "403 forbidden",
  "access denied",
  "unauthorized",
  "401",
  "401 unauthorized",
  "internal server error",
  "500",
  "500 internal server error",
  "bad gateway",
  "502",
  "502 bad gateway",
  "service unavailable",
  "503",
  "503 service unavailable",
  "gateway timeout",
  "504",
  "504 gateway timeout",
  "error",
  "找不到",
  "未找到",
  "页面不存在",
  "找不到页面",
  "页面未找到",
  "出错了",
  "服务器错误"
]);

const isErrorPageTitle = (title: string): boolean => {
  const normalized = title.trim().toLowerCase().replace(/\s+/g, " ");
  if (ERROR_PAGE_TITLES.has(normalized)) {
    return true;
  }
  return /^(?:(?:40[134]|50[0234])\s*[-–—:|]?\s*)(?:not found|page not found|file not found|forbidden|access denied|unauthorized|internal server error|bad gateway|service unavailable|gateway time-?out)$/i
    .test(normalized);
};

// ponytail: name is the label before a one-part TLD, or before this short
// two-part suffix list. An unknown suffix such as .com.xy uses the
// second-to-last label.
const MULTI_PART_SUFFIXES = new Set([
  "co.uk",
  "org.uk",
  "ac.uk",
  "gov.uk",
  "com.au",
  "com.cn",
  "com.hk",
  "com.tw",
  "com.sg",
  "com.br",
  "com.mx",
  "com.tr",
  "co.jp",
  "co.kr",
  "co.nz",
  "co.za"
]);

const siteLabelFromHttpUrl = (url: string): string | undefined => {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return undefined;
  }
  const hostport = url.slice(url.indexOf("://") + 3).split(/[/?#]/, 1)[0] ?? "";
  const host = hostport.replace(/:\d+$/, "").replace(/^www\./i, "").toLowerCase();
  const parts = host.split(".").filter((part) => part.length > 0);
  if (parts.length === 0) {
    return undefined;
  }
  if (parts.length === 1) {
    return parts[0];
  }
  const lastTwo = `${parts[parts.length - 2]}.${parts[parts.length - 1]}`;
  const label = MULTI_PART_SUFFIXES.has(lastTwo) && parts.length >= 3
    ? parts[parts.length - 3]
    : parts[parts.length - 2];
  return label !== undefined && label.length > 0 ? label : undefined;
};

const browserCapsuleSiteName = (
  preview: Pick<AgentBrowserPreviewSnapshot, "title" | "url"> | undefined
): string => {
  const title = preview?.title.trim() ?? "";
  if (
    title.length > 0
    && title !== "about:blank"
    && title !== "Lyra Lumen"
    && !isErrorPageTitle(title)
  ) {
    return title;
  }
  return siteLabelFromHttpUrl(preview?.url ?? "") ?? "Browser";
};

const BrowserCapsuleIdentity = ({
  preview
}: {
  readonly preview: AgentBrowserPreviewSnapshot | undefined;
}) => {
  const faviconUrl = preview?.faviconUrl?.trim() ?? "";
  const label = browserCapsuleSiteName(preview);
  if (faviconUrl.length === 0) {
    return (
      <>
        <LyraLogo className={BROWSER_CAPSULE_LOGO_CLASS} alt="" />
        <span>{label}</span>
      </>
    );
  }
  return (
    <>
      <img
        className={BROWSER_CAPSULE_FAVICON_CLASS}
        alt=""
        src={faviconUrl}
        onError={(event) => {
          event.currentTarget.dataset.failed = "true";
        }}
      />
      <LyraLogo
        className={BROWSER_CAPSULE_LOGO_FALLBACK_CLASS}
        alt=""
      />
      <span>{label}</span>
    </>
  );
};

// Keep polling state here so page identity updates do not render the chat list.
export function AgentBrowserCapsule({
  desktopApi,
  isTurnRunning,
  setActiveBrowserTab,
  openUrlInWorkbench
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly isTurnRunning: boolean;
  readonly setActiveBrowserTab: (tabId: string) => boolean;
  readonly openUrlInWorkbench: (url: string, title?: string) => Promise<void> | void;
}) {
  const { items, promote, dismiss } = useAgentBrowserPreview({ desktopApi, isTurnRunning });
  const page = items[0];
  if (page === undefined) {
    return null;
  }
  return (
    <div className={BROWSER_CAPSULE_WRAP_CLASS}>
      <AppButton
        variant="ghost"
        size="sm"
        type="button"
        className={`${COMPOSER_RAIL_CHIP_CLASS} ${BROWSER_CAPSULE_CLASS}`}
        aria-label={t("lyra-agents-composer.openInWorkspace")}
        title={page.title || page.url || t("lyra-agents-composer.openInWorkspace")}
        onClick={() => {
          promote(page.tabId);
          openAgentBrowserPreviewTarget(page, { setActiveBrowserTab, openUrlInWorkbench });
        }}
      >
        <BrowserCapsuleIdentity preview={page} />
      </AppButton>
      {!isTurnRunning ? (
        <AppButton
          variant="ghost"
          size="icon"
          className={BROWSER_CAPSULE_DISMISS_CLASS}
          aria-label={t("window.close")}
          title={t("window.close")}
          onClick={dismiss}
        >
          <X size={11} strokeWidth={2.1} aria-hidden="true" />
        </AppButton>
      ) : null}
    </div>
  );
}
