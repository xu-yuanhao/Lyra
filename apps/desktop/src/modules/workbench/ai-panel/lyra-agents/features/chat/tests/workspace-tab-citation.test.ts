import { describe, expect, test } from "vitest";

import { buildWorkspaceTabPageCitation, citedImageViewerAttachment } from "../workspace-tab-citation";
import { createPageCitationChipElement } from "../citation-chip-dom";
import { parsePageCitationsFromMetadata } from "../page-citation";
import type { WorkspaceTab } from "../../../../../workspace-tabs/types";

const tab = (overrides?: Partial<WorkspaceTab>): WorkspaceTab => ({
  id: "tab-42",
  title: "Docs",
  pageKind: "page",
  inputValue: "",
  displayAddress: "https://example.com/docs",
  faviconUrl: undefined,
  query: undefined,
  ...overrides
});

describe("workspace-tab-citation", () => {
  test("attaches tab id and url without page body", () => {
    const citation = buildWorkspaceTabPageCitation(tab());
    expect(citation.quotedText).toBe("Docs\nhttps://example.com/docs\ntab-42");
    expect(citation.tabId).toBe("tab-42");
    expect(citation.pageUrl).toBe("https://example.com/docs");
    expect(citation.truncated).toBe(false);
  });

  test("keeps an app tab citation when the message round-trips through metadata", () => {
    const citation = buildWorkspaceTabPageCitation(tab({
      id: "browser-tab-5",
      title: "Lyra",
      pageKind: "app",
      appId: "file-manager",
      appIconKey: "file-manager-directory-non-empty",
      displayAddress: "lyra://app/file-manager/file-manager-a00e94f2",
      filePath: "/home/xu-yuanhao/Documents/Lyra",
      inputValue: ""
    }));
    // The open directory is the tab's address, so the agent reads the path
    // straight off the reference instead of calling workbench.read_tab.
    expect(citation.pageUrl).toBe("/home/xu-yuanhao/Documents/Lyra");
    expect(citation.quotedText).toContain("/home/xu-yuanhao/Documents/Lyra");

    const [restored] = parsePageCitationsFromMetadata({ pageCitations: [citation] });
    expect(restored?.preview).toBe("Lyra");
    expect(restored?.pageUrl).toBe(citation.pageUrl);
    expect(restored?.appIconKey).toBe("file-manager-directory-non-empty");
    expect(createPageCitationChipElement(restored!).textContent)
      .toBe(createPageCitationChipElement(citation).textContent);
  });

  test("cites a file-manager tab with no open directory as the tab itself", () => {
    const citation = buildWorkspaceTabPageCitation(tab({
      id: "browser-tab-6",
      title: "Files",
      pageKind: "app",
      appId: "file-manager",
      displayAddress: "lyra://app/file-manager/file-manager-a00e94f3",
      filePath: "",
      inputValue: ""
    }));
    expect(citation.pageUrl).toBe("lyra://workspace-tab/app/browser-tab-6");
  });

  test("cites an image viewer tab as the open file, with the tab identity", () => {
    const imageTab = tab({
      pageKind: "app",
      appId: "image-viewer",
      title: "diagram.png",
      filePath: "/tmp/diagram.png",
      displayAddress: "lyra://app/image-viewer/image-1"
    });
    const image = citedImageViewerAttachment(imageTab);
    expect(image).toMatchObject({
      label: "diagram.png",
      source: "/tmp/diagram.png",
      mediaType: "image/png",
      workspaceTabId: "tab-42",
      workspaceTabTitle: "diagram.png",
      workspaceTabPageKind: "image-viewer",
      workspaceTabAddress: "/tmp/diagram.png"
    });
    expect(citedImageViewerAttachment(tab())).toBeNull();
    expect(citedImageViewerAttachment(tab({
      pageKind: "app",
      appId: "image-viewer",
      filePath: "/tmp/notes.txt"
    }))).toBeNull();
  });
});
