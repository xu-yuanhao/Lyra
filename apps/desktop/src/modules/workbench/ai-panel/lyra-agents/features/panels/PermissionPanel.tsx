import { Terminal, FileText, Globe, AlertTriangle } from "@lyra/icons";
import { ChevronLeft, ChevronRight, Check, X } from "@lyra/icons";
import { useState, type CSSProperties } from "react";
import { t } from "@workbench/i18n";
import type { PermissionRequest } from "../../core/types";
import { AppButton } from "@renderer/ui/components";

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
      className="lyra-agents-decision-panel lyra-agents-permission-panel"
      onClick={isCollapsed ? onTap : undefined}
      style={{ cursor: isCollapsed ? "pointer" : undefined }}
    >
      {/* Header: icon + title + command inline */}
      <div className="lyra-agents-decision-header">
        <span className={`lyra-agents-decision-icon permission-icon-${req.type}`}>
          {renderPermissionIcon(req.type)}
        </span>
        <div className="lyra-agents-decision-title-block">
          <p className="lyra-agents-decision-question">
            {req.title} <code className="lyra-agents-permission-cmd">{req.detail}</code>
          </p>
        </div>
        {showNav && (
          <div className="lyra-agents-decision-nav">
            <AppButton variant="ghost" size="sm"
              type="button"
              className="lyra-agents-decision-nav-btn"
              disabled={!canPrev}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i - 1); }}
              aria-label={t("permission.prev")}
            >
              <ChevronLeft size={14} strokeWidth={2.1} />
            </AppButton>
            <span className="lyra-agents-decision-counter">
              {currentIndex + 1}/{requests.length}
            </span>
            <AppButton variant="ghost" size="sm"
              type="button"
              className="lyra-agents-decision-nav-btn"
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
        className="lyra-agents-decision-body"
        style={{
          maxHeight: `${progress * 200}px`,
          opacity: progress,
          pointerEvents: progress < 0.3 ? "none" : "auto",
          "--panel-progress": progress,
        } as CSSProperties}
      >
        <div className="lyra-agents-decision-body-content">
          <div className="lyra-agents-permission-actions">
            <AppButton variant="ghost" size="sm"
              type="button"
              className="lyra-agents-permission-btn lyra-agents-permission-btn-deny"
              onClick={() => handleAction("deny")}
              aria-label={t("permission.deny")}
            >
              <X size={14} strokeWidth={2.1} />
            </AppButton>
            <AppButton variant="ghost" size="sm"
              type="button"
              className="lyra-agents-permission-btn lyra-agents-permission-btn-approve"
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
