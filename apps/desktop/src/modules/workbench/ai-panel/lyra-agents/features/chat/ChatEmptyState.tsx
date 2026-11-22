// ============================================================================
// ChatEmptyState — centered Lyra mark + project prompt for a brand-new session
// ============================================================================
//
// Rendered in the chat area before any messages exist. Clicking the highlighted
// directory name opens the project chooser. Until a directory is chosen the
// prompt reads "Home", matching the runtime's home-directory default — sessions
// are always bound (to a chosen project, or to Home by default).

import { useRef, useState } from "react";
import { Button } from "@renderer/ui/components/button";
import { LYRA_ASCII_LOGO } from "./ascii-logo";
import { useAsciiFlicker } from "./use-ascii-flicker";
import { t } from "@workbench/i18n";

export function ChatEmptyState({
  projectName,
  isHome,
  onChooseProject,
}: {
  projectName: string | null;
  isHome: boolean;
  onChooseProject: () => Promise<void> | void;
}) {
  const displayName = isHome || projectName === null || projectName.trim().length === 0
    ? t("lyra-agents-composer.workingDirHome")
    : projectName.trim();
  const [isHovering, setIsHovering] = useState(false);
  const logoRef = useRef<HTMLPreElement>(null);
  useAsciiFlicker(logoRef, LYRA_ASCII_LOGO, isHovering);

  return (
    <div className="lyra-agents-chat-empty" data-testid="lyra-agents-chat-empty">
      <pre
        ref={logoRef}
        className="lyra-agents-chat-empty-logo"
        aria-hidden="true"
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      >{LYRA_ASCII_LOGO}</pre>
      <p className="lyra-agents-chat-empty-question">
        {t("lyra-agents-empty.questionPrefix")}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="lyra-agents-chat-empty-project font-semibold text-[var(--lyra-text-primary)]"
          onClick={() => void onChooseProject()}
        >
          {displayName}
        </Button>
        {t("lyra-agents-empty.questionSuffix")}
      </p>
    </div>
  );
}