import type { ReactNode } from "react";

import type { WorkspaceTab } from "../../../../workspace-tabs/types";
import { PageCitationTabIcon } from "./page-citation-tab-icon";
import { ATTACH_MENU_ICON_CLASS } from "./classes";

const MENU_ICON_CLASS = ATTACH_MENU_ICON_CLASS;
const MENU_ICON_SIZE = 14;

export const WorkspaceTabAttachMenuIcon = ({ tab }: { readonly tab: WorkspaceTab }) => (
  <PageCitationTabIcon tab={tab} size={MENU_ICON_SIZE} className={MENU_ICON_CLASS} />
);

export const TerminalTabAttachMenuIcon = () => (
  <PageCitationTabIcon
    citation={{
      id: "terminal-tab-menu-icon",
      tabId: "terminal-tab-menu-icon",
      tabTitle: "",
      pageUrl: "lyra://terminal/menu",
      pageTitle: "",
      excerptKind: "page",
      preview: "",
      quotedText: "",
      truncated: false,
      sourceKind: "terminal-tab",
      tabPageKind: "terminal"
    }}
    size={MENU_ICON_SIZE}
    className={MENU_ICON_CLASS}
  />
);

export const ComposerAttachMenuLeadingIcon = ({
  children
}: {
  readonly children: ReactNode;
}) => (
  <span className={MENU_ICON_CLASS} aria-hidden="true">
    {children}
  </span>
);