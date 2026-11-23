// ============================================================================
// Header — frosted top bar with session title, total diff, project name
// ============================================================================

import {
  AppIconButton,
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuSeparator,
  AppMenuTrigger,
} from "@renderer/ui/components";
import {
  Archive,
  ArrowLeftToLine,
  ArrowRightToLine,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2
} from "@lyra/icons";
import { useState } from "react";
import { t } from "@workbench/i18n";
import { useData } from "../../data/DataProvider";
import type { AiPanelSide } from "../../../types";
import { MessageCitationText } from "../chat/MessageCitationText";
import {
  inlineContentMarkersToDisplayText,
  inlineReferenceRecords
} from "../chat/message-citation";

export function Header() {
  const { session, messages } = useData();
  const records = inlineReferenceRecords(messages);
  const rawTitle = session.title.trim();
  const title = inlineContentMarkersToDisplayText(
    rawTitle,
    records.transcriptCitations,
    records.pageCitations,
    records.inlineImages,
    records.fileAttachments
  ).trim() || t("aiPanel.defaultSessionTitle");
  return (
    <header className="lyra-agents-header select-none">
      <div className="lyra-agents-header-title" title={title}>
        <MessageCitationText
          text={rawTitle.length > 0 ? rawTitle : title}
          transcriptCitations={records.transcriptCitations}
          pageCitations={records.pageCitations}
          inlineImages={records.inlineImages}
          fileAttachments={records.fileAttachments}
        />
      </div>
      <HeaderControls />
    </header>
  );
}

export function HeaderControls({
  showNewSessionButton = true,
  forceShowNewSessionButton = false,
  aiPanelSide,
  onToggleAiPanelSide,
  movePanelToLeftLabel,
  movePanelToRightLabel
}: {
  readonly showNewSessionButton?: boolean;
  readonly forceShowNewSessionButton?: boolean;
  readonly aiPanelSide?: AiPanelSide;
  readonly onToggleAiPanelSide?: () => void;
  readonly movePanelToLeftLabel?: string;
  readonly movePanelToRightLabel?: string;
}) {
  const {
    session,
    messages,
    isTurnRunning,
    createSession,
    renameSession,
    archiveSession,
    deleteSession,
  } = useData();
  const [creating, setCreating] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionActionBusy, setSessionActionBusy] = useState(false);
  const shouldShowNewSessionButton =
    showNewSessionButton && (forceShowNewSessionButton || messages.length > 0);
  const canManageSession =
    typeof session.id === "string" && session.id.trim().length > 0;
  const canMovePanel =
    onToggleAiPanelSide !== undefined
    && aiPanelSide !== undefined
    && (aiPanelSide === "left"
      ? movePanelToRightLabel !== undefined
      : movePanelToLeftLabel !== undefined);
  const hasMenuItems = canManageSession || canMovePanel;

  const onCreateSession = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await createSession();
    } finally {
      setCreating(false);
    }
  };

  const sessionActionDisabled = sessionActionBusy || isTurnRunning;
  const menuItemClassName = "lyra-app-menu-item-with-icon lyra-agents-header-menu-item";

  return (
    <div className="lyra-agents-header-right">
      {shouldShowNewSessionButton ? (
        <AppIconButton
          className="lyra-agents-header-action app-header-new-session"
          type="button"
          aria-label={t("header.newSession")}
          title={t("header.newSession")}
          disabled={creating}
          onClick={() => void onCreateSession()}
        >
          <Plus aria-hidden="true" size={14} strokeWidth={1.8} />
        </AppIconButton>
      ) : null}
      {hasMenuItems ? (
      <AppMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <div className="lyra-agents-header-more">
          <AppMenuTrigger asChild>
            <AppIconButton
              className="lyra-agents-header-action app-header-more-button"
              type="button"
              aria-label={t("header.more")}
              title={t("header.more")}
              active={menuOpen}
            >
              <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
            </AppIconButton>
          </AppMenuTrigger>
          <AppMenuContent className="lyra-agents-header-menu" align="end" sideOffset={6}>
            {canManageSession ? (
              <>
                <AppMenuItem
                  className={menuItemClassName}
                  disabled={sessionActionDisabled}
                  onSelect={() => {
                    setMenuOpen(false);
                    renameSession();
                  }}
                >
                  <Pencil aria-hidden="true" size={14} strokeWidth={1.8} />
                  <span className="lyra-app-menu-item-label">{t("header.rename")}</span>
                </AppMenuItem>
                <AppMenuItem
                  className={menuItemClassName}
                  disabled={sessionActionDisabled}
                  onSelect={() => {
                    if (sessionActionBusy) return;
                    setMenuOpen(false);
                    setSessionActionBusy(true);
                    void archiveSession().finally(() => {
                      setSessionActionBusy(false);
                    });
                  }}
                >
                  <Archive aria-hidden="true" size={14} strokeWidth={1.8} />
                  <span className="lyra-app-menu-item-label">{t("header.archive")}</span>
                </AppMenuItem>
                <AppMenuItem
                  className={menuItemClassName}
                  disabled={sessionActionDisabled}
                  onSelect={() => {
                    setMenuOpen(false);
                    deleteSession();
                  }}
                >
                  <Trash2 aria-hidden="true" size={14} strokeWidth={1.8} />
                  <span className="lyra-app-menu-item-label">{t("header.delete")}</span>
                </AppMenuItem>
              </>
            ) : null}
            {canMovePanel ? (
              <>
                {canManageSession ? <AppMenuSeparator /> : null}
                <AppMenuItem
                  className={menuItemClassName}
                  onSelect={() => {
                    setMenuOpen(false);
                    onToggleAiPanelSide?.();
                  }}
                >
                  {aiPanelSide === "left" ? (
                    <ArrowRightToLine aria-hidden="true" size={14} strokeWidth={1.8} />
                  ) : (
                    <ArrowLeftToLine aria-hidden="true" size={14} strokeWidth={1.8} />
                  )}
                  <span className="lyra-app-menu-item-label">
                    {aiPanelSide === "left" ? movePanelToRightLabel : movePanelToLeftLabel}
                  </span>
                </AppMenuItem>
              </>
            ) : null}
          </AppMenuContent>
        </div>
      </AppMenu>
      ) : (
        <AppIconButton
          className="lyra-agents-header-action app-header-more-button"
          type="button"
          disabled
          aria-label={t("header.more")}
          title={t("header.moreDisabled")}
        >
          <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
        </AppIconButton>
      )}
    </div>
  );
}
