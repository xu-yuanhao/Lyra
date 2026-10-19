import { describe, expect, test, vi } from "vitest";

import type { LyraDesktopApi } from "../../../../../../../shared/desktop-bridge";
import type { WorkspaceTab } from "../../../../../workspace-tabs/types";
import { navigateToPageCitation } from "../scroll-to-page-citation";
import { buildWorkspaceTabPageCitation } from "../workspace-tab-citation";

const fileManagerTab = (): WorkspaceTab => ({
  id: "browser-tab-5",
  title: "Lyra",
  pageKind: "app",
  appId: "file-manager",
  appIconKey: "file-manager-directory-non-empty",
  filePath: "/home/xu-yuanhao/Documents/Lyra",
  displayAddress: "lyra://app/file-manager/file-manager-1",
  inputValue: "",
  faviconUrl: undefined,
  query: undefined
});

describe("navigateToPageCitation", () => {
  test("a file-manager citation activates its tab instead of navigating a page to the path", async () => {
    const browser = {
      navigate: vi.fn(async () => undefined),
      readPageState: vi.fn(async () => ({ address: "" })),
      searchInPage: vi.fn(async () => ({ totalMatches: 0 }))
    };
    const setActiveTab = vi.fn();

    const navigated = await navigateToPageCitation(
      { browser } as unknown as LyraDesktopApi,
      setActiveTab,
      buildWorkspaceTabPageCitation(fileManagerTab())
    );

    expect(navigated).toBe(true);
    expect(setActiveTab).toHaveBeenCalledWith("browser-tab-5");
    expect(browser.navigate).not.toHaveBeenCalled();
    expect(browser.readPageState).not.toHaveBeenCalled();
  });
});
