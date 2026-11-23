import { useCallback, useEffect, useState } from "react";
import { SquareTerminal, Trash2 } from "@lyra/icons";
import { t } from "@workbench/i18n";
import { AppButton, AppMenu, AppMenuContent, AppMenuTrigger } from "@renderer/ui/components";
import type {
  AgentPrivateTerminalSnapshot,
  LyraDesktopApi
} from "../../../../../../shared/desktop-bridge";
import type { SessionMeta } from "../../core/types";
import { COMPOSER_CHANGES_COUNTS_CLASS, COMPOSER_RAIL_CHIP_CLASS } from "./classes";
import { BG_TERMINAL_ITEM_BODY_CLASS, BG_TERMINAL_ITEM_CLASS, BG_TERMINAL_ITEM_PATH_CLASS, BG_TERMINAL_ITEM_TITLE_CLASS, BG_TERMINAL_KILL_CLASS } from "./classes";

export function BackgroundTerminalButton({
  session,
  desktopApi
}: {
  session: SessionMeta;
  desktopApi: LyraDesktopApi | null;
}) {
  const [privateTerminals, setPrivateTerminals] = useState<readonly AgentPrivateTerminalSnapshot[]>(
    []
  );

  const refresh = useCallback(async () => {
    const sessionId = typeof session.id === "string" ? session.id.trim() : "";
    if (desktopApi?.agent?.listPrivateTerminals == null || sessionId.length === 0) {
      setPrivateTerminals([]);
      return;
    }
    const listed = await desktopApi.agent
      .listPrivateTerminals({
        sessionId
      })
      .catch(() => []);
    setPrivateTerminals(listed);
  }, [desktopApi, session.id]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 3_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const closePrivate = useCallback(
    async (terminalSessionId: string) => {
      const sessionId = typeof session.id === "string" ? session.id.trim() : "";
      if (desktopApi?.agent?.closePrivateTerminal == null || sessionId.length === 0) {
        return;
      }
      await desktopApi.agent.closePrivateTerminal({
        sessionId,
        terminalSessionId
      });
      await refresh();
    },
    [desktopApi, refresh, session.id]
  );

  const count = privateTerminals.length;
  if (count === 0) {
    return null;
  }

  const label = t("lyra-agents-composer.backgroundTerminals");

  return (
    <AppMenu>
      <AppMenuTrigger asChild>
        <AppButton
          type="button"
          size="sm"
          variant="ghost"
          className={COMPOSER_RAIL_CHIP_CLASS}
          aria-label={label}
          title={label}
        >
          <SquareTerminal size={13} strokeWidth={2.1} aria-hidden="true" />
          <span>{label}</span>
          <span className={COMPOSER_CHANGES_COUNTS_CLASS}>{count}</span>
        </AppButton>
      </AppMenuTrigger>
      <AppMenuContent
        align="start"
        className="lyra-agents-bg-terminal-menu"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {privateTerminals.map((item) => (
          <div key={item.sessionId} className={BG_TERMINAL_ITEM_CLASS}>
            <div className={BG_TERMINAL_ITEM_BODY_CLASS}>
              <p className={BG_TERMINAL_ITEM_TITLE_CLASS}>{item.title.trim() || item.sessionId}</p>
              {item.cwd ? <p className={BG_TERMINAL_ITEM_PATH_CLASS}>{item.cwd}</p> : null}
            </div>
            <AppButton
              type="button"
              size="icon"
              variant="ghost"
              className={BG_TERMINAL_KILL_CLASS}
              aria-label={t("lyra-agents-composer.endTerminal")}
              onClick={() => {
                void closePrivate(item.sessionId);
              }}
            >
              <Trash2 />
            </AppButton>
          </div>
        ))}
      </AppMenuContent>
    </AppMenu>
  );
}
