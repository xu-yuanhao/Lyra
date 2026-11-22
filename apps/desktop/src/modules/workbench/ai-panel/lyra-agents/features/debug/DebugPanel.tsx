import { useState } from "react";
import { Bug } from "@lyra/icons";
import { t } from "@workbench/i18n";
import { Button } from "@renderer/ui/components/button";
import { Checkbox } from "@renderer/ui/components/checkbox";
import { Label } from "@renderer/ui/components/label";
import {
  DEBUG_PANEL_CLASS,
  DEBUG_TOGGLE_CLASS,
  DEBUG_BODY_CLASS,
  DEBUG_TITLE_CLASS,
  DEBUG_ROW_CLASS,
} from "../panels/classes";

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
    <div className={DEBUG_PANEL_CLASS}>
      <Button variant="ghost" size="sm"
        type="button"
        className={DEBUG_TOGGLE_CLASS}
        onClick={() => setOpen((v) => !v)}
        aria-label={t("debug.title")}
      >
        <Bug size={14} strokeWidth={2} />
      </Button>

      {open && (
        <div className={DEBUG_BODY_CLASS}>
          <div className={DEBUG_TITLE_CLASS}>{t("debug.title")}</div>
          <Label className={DEBUG_ROW_CLASS}>
            <Checkbox
              checked={decisionsVisible}
              onCheckedChange={onToggleDecisions}
            />
            <span>{t("debug.decisions")}</span>
          </Label>
          <Label className={DEBUG_ROW_CLASS}>
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
