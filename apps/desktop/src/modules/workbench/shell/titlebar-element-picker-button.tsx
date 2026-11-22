import { Button } from "@renderer/ui/components/button";
import { cn } from "@renderer/ui/utils";
import { Crosshair } from "@lyra/icons";

type TitlebarElementPickerButtonProps = {
  readonly active: boolean;
  readonly mode: "inspect" | "layout";
  readonly ariaLabel: string;
  readonly activeDescription: string | undefined;
  readonly onToggle: () => void;
};

export const TitlebarElementPickerButton = ({
  active,
  mode,
  ariaLabel,
  activeDescription,
  onToggle
}: TitlebarElementPickerButtonProps) => (
  <Button
    variant="ghost"
    size="icon"
    className={cn(
      "size-[var(--lyra-shell-titlebar-nav-h)] rounded-full p-0 text-[var(--lyra-text-secondary)] hover:bg-transparent hover:text-[var(--lyra-text-primary)]",
      (active || mode === "layout") && "text-[var(--lyra-text-primary)]"
    )}
    aria-label={ariaLabel}
    aria-pressed={active}
    aria-description={active ? activeDescription : undefined}
    title={ariaLabel}
    onClick={onToggle}
  >
    <Crosshair size={14} aria-hidden="true" />
  </Button>
);
