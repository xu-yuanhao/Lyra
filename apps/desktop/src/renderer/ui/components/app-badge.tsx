import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";

export type AppBadgeTone = "neutral" | "success" | "warning" | "error" | "info";

export type AppBadgeProps = HTMLAttributes<HTMLSpanElement> & {
  readonly tone?: AppBadgeTone;
};

const TONE_CLASS: Record<AppBadgeTone, string> = {
  neutral: "border-[color-mix(in_srgb,var(--lyra-app-border)_80%,transparent)] bg-[var(--lyra-app-surface-strong-bg)] text-[var(--lyra-text-secondary)]",
  success: "border-[color-mix(in_srgb,var(--lyra-status-success)_32%,var(--lyra-app-border))] bg-[color-mix(in_srgb,var(--lyra-status-success)_10%,transparent)] text-[var(--lyra-status-success)]",
  warning: "border-[color-mix(in_srgb,var(--lyra-status-warning)_34%,var(--lyra-app-border))] bg-[color-mix(in_srgb,var(--lyra-status-warning)_10%,transparent)] text-[var(--lyra-status-warning)]",
  error: "border-[color-mix(in_srgb,var(--lyra-status-error)_34%,var(--lyra-app-border))] bg-[color-mix(in_srgb,var(--lyra-status-error)_10%,transparent)] text-[var(--lyra-status-error)]",
  info: "border-[color-mix(in_srgb,var(--lyra-text-secondary)_34%,var(--lyra-app-border))] bg-[color-mix(in_srgb,var(--lyra-text-secondary)_9%,transparent)] text-[var(--lyra-text-secondary)]"
};

export const AppBadge = forwardRef<HTMLSpanElement, AppBadgeProps>(({
  className,
  tone = "neutral",
  ...props
}, ref) => (
  <span
    ref={ref}
    className={cn(
      "lyra-app-badge",
      `lyra-app-badge-${tone}`,
      "inline-flex min-h-[var(--lyra-control-h-24)] min-w-0 items-center justify-center rounded-full border px-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] font-medium whitespace-nowrap",
      TONE_CLASS[tone],
      className
    )}
    {...props}
  />
));

AppBadge.displayName = "AppBadge";
