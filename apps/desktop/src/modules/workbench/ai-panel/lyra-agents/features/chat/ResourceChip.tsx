import type { MouseEvent, ReactNode } from "react";
import { Button } from "@renderer/ui/components/button";
import {
  CITATION_CHIP_PREVIEW_CLASS,
  CITATION_CHIP_PREVIEW_WRAP_CLASS,
  INLINE_RESOURCE_CLASS,
  RESOURCE_CHIP_CLASS
} from "./classes";

export type ResourceChipProps = {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly icon: ReactNode;
  readonly label: ReactNode;
  readonly onActivate?: (() => void) | undefined;
  readonly title?: string | undefined;
  readonly webLinkUrl?: string | undefined;
};

const chipClassName = (className?: string, cursor = "cursor-pointer"): string => [
  "lyra-agents-citation-chip",
  INLINE_RESOURCE_CLASS,
  RESOURCE_CHIP_CLASS,
  cursor,
  className
].filter(Boolean).join(" ");

const ChipContents = ({ icon, label }: Pick<ResourceChipProps, "icon" | "label">) => (
  <>
    {icon}
    <span className={CITATION_CHIP_PREVIEW_WRAP_CLASS}>
      <span className={CITATION_CHIP_PREVIEW_CLASS}>{label}</span>
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
      <span className={chipClassName(className, "cursor-default")} title={title} aria-label={ariaLabel} data-web-link-url={webLinkUrl}>
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
