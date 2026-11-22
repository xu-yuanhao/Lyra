import { Check } from "@lyra/icons";

import { Button } from "@renderer/ui/components/button";
import type { FileManagerSurfaceChromeProps } from "./surface-view-types";

export const FileManagerChooserBar = ({
  renderModel,
  labels,
  actions
}: FileManagerSurfaceChromeProps) => {
  const chooserBar = renderModel.chooserBar;
  if (chooserBar === null) {
    return null;
  }
  return (
    <footer className="flex min-w-0 items-center justify-between gap-[var(--lyra-space-12)] border-t border-[var(--lyra-app-border)] bg-[var(--lyra-app-surface-bg)] px-[var(--lyra-space-16)] py-[var(--lyra-space-10)]">
      <div className="grid min-w-0 gap-[var(--lyra-space-2)]">
        <span className="text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-16)] font-semibold text-[var(--lyra-text-secondary)]">
          {chooserBar.promptLabel}
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-16)] text-[var(--lyra-text-muted)]">
          {chooserBar.path ?? chooserBar.selectionPlaceholder}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="flex-none bg-transparent text-[var(--lyra-text-secondary)]"
        disabled={!chooserBar.canConfirm}
        onClick={() => {
          if (!chooserBar.canConfirm) {
            return;
          }
          actions.onConfirmChooser();
        }}
      >
        <Check size={14} aria-hidden="true" />
        <span>{chooserBar.confirmLabel}</span>
      </Button>
    </footer>
  );
};
