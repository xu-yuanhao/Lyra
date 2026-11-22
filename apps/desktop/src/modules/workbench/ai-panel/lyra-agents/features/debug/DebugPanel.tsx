import { useState } from "react";
import { Bug } from "@lyra/icons";
import { t } from "@workbench/i18n";
import { Button } from "@renderer/ui/components/button";
import { Checkbox } from "@renderer/ui/components/checkbox";
import { Label } from "@renderer/ui/components/label";

/**
 * Floating debug panel (top-right corner) for local panel diagnostics.
 * Hidden in normal product flows.
 */
export function DebugPanel({
  onToggleDecisions,
  onTogglePermission,
  decisionsVisible,
  permissionVisible,
}: {
  onToggleDecisions: () => void;
  onTogglePermission: () => void;
  decisionsVisible: boolean;
  permissionVisible: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lyra-agents-debug-panel">
      <Button variant="ghost" size="sm"
        type="button"
        className="lyra-agents-debug-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("debug.title")}
      >
        <Bug size={14} strokeWidth={2} />
      </Button>

      {open && (
        <div className="lyra-agents-debug-body">
          <div className="lyra-agents-debug-title">{t("debug.title")}</div>
          <Label className="lyra-agents-debug-row">
            <Checkbox
              checked={decisionsVisible}
              onCheckedChange={onToggleDecisions}
            />
            <span>{t("debug.decisions")}</span>
          </Label>
          <Label className="lyra-agents-debug-row">
            <Checkbox
              checked={permissionVisible}
              onCheckedChange={onTogglePermission}
            />
            <span>{t("debug.permission")}</span>
          </Label>
        </div>
      )}
    </div>
  );
}
