import { Terminal, FileText, Globe, AlertTriangle } from "@lyra/icons";
import { ChevronLeft, ChevronRight, Check, X } from "@lyra/icons";
import { useState, type CSSProperties } from "react";
import { t } from "@workbench/i18n";
import type { PermissionRequest } from "../../core/types";
import { AppButton } from "@renderer/ui/components";
import {
  PANEL_BASE_CLASS,
  PANEL_HEADER_CLASS,
  PANEL_ICON_CLASS,
  PANEL_TITLE_BLOCK_CLASS,
  PANEL_PERMISSION_QUESTION_CLASS,
  PANEL_NAV_CLASS,
  PANEL_COUNTER_CLASS,
  PANEL_BODY_CLASS,
  PANEL_BODY_CONTENT_CLASS,
  PANEL_NAV_BTN_CLASS,
  PERMISSION_PANEL_CLASS,
  PERMISSION_CMD_CLASS,
  PERMISSION_ACTIONS_CLASS,
  PERMISSION_BTN_CLASS,
  PERMISSION_BTN_APPROVE_CLASS,
  PERMISSION_BTN_DENY_CLASS,
} from "./classes";

export type { PermissionRequest } from "../../core/types";

/**
 * Permission approval panel — same layout as DecisionPanel:
 * Header row: icon + "执行 xxx" + command inline + nav
 * Body: approve/deny buttons
 */
export function PermissionPanel({
  requests,
  onApprove,
  onDeny,
  progress,
  onTap,
}: {
  requests: PermissionRequest[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
  progress: number;
  onTap: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  if (requests.length === 0) return null;

  const req = requests[currentIndex] ?? requests[0];
  if (req === undefined) return null;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < requests.length - 1;
  const showNav = requests.length > 1;
  const isCollapsed = progress < 0.1;

  const handleAction = (action: "approve" | "deny") => {
    const id = req.id;
    if (action === "approve") {
      onApprove(id);
    } else {
      onDeny(id);
    }
    // After removing current, adjust index if needed
    if (currentIndex >= requests.length - 1 && currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  };

  return (
    <div
      className={`${PANEL_BASE_CLASS} ${PERMISSION_PANEL_CLASS}`}
      onClick={isCollapsed ? onTap : undefined}
      style={{ cursor: isCollapsed ? "pointer" : undefined }}
    >
      {/* Header: icon + title + command inline */}
      <div className={PANEL_HEADER_CLASS}>
        <span className={`${PANEL_ICON_CLASS} permission-icon-${req.type}`}>
          {renderPermissionIcon(req.type)}
        </span>
        <div className={PANEL_TITLE_BLOCK_CLASS}>
          <p className={PANEL_PERMISSION_QUESTION_CLASS}>
            {req.title} <code className={PERMISSION_CMD_CLASS}>{req.detail}</code>
          </p>
        </div>
        {showNav && (
          <div className={PANEL_NAV_CLASS}>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={PANEL_NAV_BTN_CLASS}
              disabled={!canPrev}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i - 1); }}
              aria-label={t("permission.prev")}
            >
              <ChevronLeft size={14} strokeWidth={2.1} />
            </AppButton>
            <span className={PANEL_COUNTER_CLASS}>
              {currentIndex + 1}/{requests.length}
            </span>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={PANEL_NAV_BTN_CLASS}
              disabled={!canNext}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i + 1); }}
              aria-label={t("permission.next")}
            >
              <ChevronRight size={14} strokeWidth={2.1} />
            </AppButton>
          </div>
        )}
      </div>

      {/* Body: approve/deny buttons */}
      <div
        className={PANEL_BODY_CLASS}
        style={{
          maxHeight: `${progress * 200}px`,
          opacity: progress,
          pointerEvents: progress < 0.3 ? "none" : "auto",
          "--panel-progress": progress,
        } as CSSProperties}
      >
        <div className={PANEL_BODY_CONTENT_CLASS}>
          <div className={PERMISSION_ACTIONS_CLASS}>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={`${PERMISSION_BTN_CLASS} ${PERMISSION_BTN_DENY_CLASS}`}
              onClick={() => handleAction("deny")}
              aria-label={t("permission.deny")}
            >
              <X size={14} strokeWidth={2.1} />
            </AppButton>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={`${PERMISSION_BTN_CLASS} ${PERMISSION_BTN_APPROVE_CLASS}`}
              onClick={() => handleAction("approve")}
              aria-label={t("permission.approve")}
            >
              <Check size={14} strokeWidth={2.1} />
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderPermissionIcon(type: PermissionRequest["type"]) {
  const props = { size: 14, strokeWidth: 2 };
  switch (type) {
    case "shell":
      return <Terminal {...props} />;
    case "file":
      return <FileText {...props} />;
    case "network":
      return <Globe {...props} />;
    case "dangerous":
      return <AlertTriangle {...props} />;
  }
}
