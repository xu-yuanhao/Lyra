import type { MouseEvent, ReactNode } from "react";
import { Button } from "@renderer/ui/components/button";

export type ResourceChipProps = {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly onActivate?: (() => void) | undefined;
  readonly title?: string | undefined;
  readonly webLinkUrl?: string | undefined;
};

const chipClassName = (className?: string): string => [
  "lyra-agents-citation-chip",
  "lyra-agents-inline-resource",
  "lyra-agents-resource-chip",
  className
].filter(Boolean).join(" ");

const ChipContents = ({ icon, label }: Pick<ResourceChipProps, "icon" | "label">) => (
  <>
    {icon}
    <span className="lyra-agents-citation-chip-preview-wrap">
      <span className="lyra-agents-citation-chip-preview">{label}</span>
    </span>
  </>
);

/**
 * Shared inline resource primitive for citations, files, images and pages.
 * Composer DOM tokens use the same element structure and
 * `lyra-agents-inline-resource` contract so every surface has one visual.
 * Interactive chips use a native button instead of a span with a hand-written
 * keyboard emulation; static chips keep neutral span semantics.
 */
export const ResourceChip = ({
  ariaLabel,
  className,
  icon,
  label,
  onActivate,
  title,
  webLinkUrl
}: ResourceChipProps) => {
  if (onActivate === undefined) {
    return (
      <span className={chipClassName(className)} title={title} aria-label={ariaLabel} data-web-link-url={webLinkUrl}>
        <ChipContents icon={icon} label={label} />
      </span>
    );
  }

  const activate = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onActivate();
    event.currentTarget.blur();
  };
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={chipClassName(className)}
      title={title}
      aria-label={ariaLabel}
      data-web-link-url={webLinkUrl}
      onClick={activate}
    >
      <ChipContents icon={icon} label={label} />
    </Button>
  );
};
