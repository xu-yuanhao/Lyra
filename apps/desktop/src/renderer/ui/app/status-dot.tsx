import { type HTMLAttributes } from "react";

import { cn } from "../utils";

export type StatusDotProps = HTMLAttributes<HTMLSpanElement> & {
  readonly tone?: "default" | "success" | "warning" | "error" | "info";
};

const STATUS_DOT_BASE_CLASS =
  "lyra-ui-status-dot inline-block size-[var(--lyra-icon-size-12)] rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-text-muted)] shadow-[0_0_0_var(--lyra-stroke-thin)_color-mix(in_srgb,var(--lyra-app-surface-bg)_70%,transparent)]";

const STATUS_DOT_TONE_CLASS: Record<NonNullable<StatusDotProps["tone"]>, string> = {
  default: "",
  success: "bg-[var(--lyra-status-success)]",
  warning: "bg-[var(--lyra-status-warning)]",
  error: "bg-[var(--lyra-status-error)]",
  info: "bg-[var(--lyra-text-secondary)]"
};

export const StatusDot = ({ className, tone = "default", ...props }: StatusDotProps) => (
  <span
    className={cn(STATUS_DOT_BASE_CLASS, `lyra-ui-status-dot-${tone}`, STATUS_DOT_TONE_CLASS[tone], className)}
    {...props}
  />
);
