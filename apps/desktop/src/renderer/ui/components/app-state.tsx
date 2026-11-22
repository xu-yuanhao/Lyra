import {
  forwardRef,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactNode
} from "react";

import { LyraLogo } from "../app";
import { cn } from "../utils";

export type AppStateDensity = "compact" | "default" | "spacious";
export type AppStateAlign = "start" | "center";
export type AppStateTone = "neutral" | "info" | "success" | "warning" | "error";

type AppStateProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly actions?: ReactNode;
  readonly align?: AppStateAlign;
  readonly density?: AppStateDensity;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly title: ReactNode;
  readonly tone?: AppStateTone;
};

const LYRA_STATE_LOGO = (
  <LyraLogo
    className="lyra-app-state-logo size-[var(--lyra-app-state-logo-size)] [--lyra-app-logo-size:var(--lyra-app-state-logo-size)]"
    alt=""
  />
);

export type AppEmptyStateProps = AppStateProps;
export type AppLoadingStateProps = Omit<AppStateProps, "tone"> & {
  readonly tone?: Extract<AppStateTone, "neutral" | "info">;
};
export type AppErrorStateProps = Omit<AppStateProps, "tone"> & {
  readonly tone?: Extract<AppStateTone, "error" | "warning">;
};

const ICON_TONE_CLASS: Record<AppStateTone, string> = {
  neutral: "text-[color-mix(in_srgb,var(--lyra-text-primary)_72%,transparent)]",
  info: "text-[var(--lyra-text-secondary)]",
  success: "text-[var(--lyra-status-success)]",
  warning: "text-[var(--lyra-status-warning)]",
  error: "text-[var(--lyra-status-error)]"
};

const renderState = (
  kind: "empty" | "loading" | "error",
  fallbackIcon: ReactNode,
  {
    actions,
    align = "center",
    className,
    density = "default",
    description,
    icon = fallbackIcon,
    title,
    tone = "neutral",
    ...props
  }: AppStateProps,
  ref: ForwardedRef<HTMLDivElement>
) => {
  const iconNode = icon === false ? null : icon;
  const alignStart = align === "start";

  return (
    <div
      ref={ref}
      className={cn(
        "lyra-app-state",
        `lyra-app-state-${kind}`,
        `lyra-app-state-density-${density}`,
        `lyra-app-state-align-${align}`,
        `lyra-app-state-tone-${tone}`,
        "grid h-full min-h-0 w-full min-w-0 flex-1 basis-auto content-center items-center justify-center gap-[var(--lyra-app-state-gap)] rounded-[var(--lyra-radius-10)] border border-transparent p-[var(--lyra-app-state-pad)] text-center text-[var(--lyra-text-secondary)]",
        density === "compact" &&
          "h-auto min-h-0 flex-none self-auto gap-[var(--lyra-space-8)] p-[var(--lyra-space-12)] [--lyra-app-state-logo-size:var(--lyra-app-state-logo-min)]",
        density === "spacious" && "p-[var(--lyra-space-24)]",
        alignStart && "justify-items-start justify-start text-left",
        className
      )}
      {...props}
    >
      {iconNode === undefined || iconNode === null ? null : (
        <span
          className={cn(
            "lyra-app-state-icon inline-flex size-[var(--lyra-app-state-logo-size)] items-center justify-center",
            "[&_svg]:size-[var(--lyra-app-state-logo-size)] [&_svg]:[stroke-width:1.8] [&_.lyra-app-logo-mark]:size-[var(--lyra-app-state-logo-size)]",
            kind === "loading" &&
              "animate-[lyra-app-state-pulse_1200ms_var(--lyra-ease-standard)_infinite] motion-reduce:animate-none",
            ICON_TONE_CLASS[tone]
          )}
          aria-hidden="true"
        >
          {iconNode}
        </span>
      )}
      <span className="lyra-app-state-copy grid min-w-0 max-w-[var(--lyra-app-state-copy-max)] gap-[var(--lyra-space-4)]">
        <strong
          className={cn(
            "lyra-app-state-title text-[length:var(--lyra-text-size-14)] font-medium leading-[var(--lyra-text-line-body)]",
            kind === "empty" ? "text-[var(--lyra-text-muted)]" : "text-[var(--lyra-text-primary)]"
          )}
        >
          {title}
        </strong>
        {description === undefined ? null : (
          <span className="lyra-app-state-description text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-muted)]">
            {description}
          </span>
        )}
      </span>
      {actions === undefined ? null : (
        <span
          className={cn(
            "lyra-app-state-actions inline-flex min-w-0 max-w-[var(--lyra-app-state-copy-max)] flex-wrap items-center justify-center gap-[var(--lyra-space-8)]",
            alignStart && "justify-start"
          )}
        >
          {actions}
        </span>
      )}
    </div>
  );
};

export const AppEmptyState = forwardRef<HTMLDivElement, AppEmptyStateProps>((props, ref) =>
  renderState("empty", LYRA_STATE_LOGO, props, ref)
);

AppEmptyState.displayName = "AppEmptyState";

export const AppLoadingState = forwardRef<HTMLDivElement, AppLoadingStateProps>(({
  tone = "info",
  ...props
}, ref) =>
  renderState(
    "loading",
    LYRA_STATE_LOGO,
    {
      "aria-busy": true,
      tone,
      ...props
    },
    ref
  )
);

AppLoadingState.displayName = "AppLoadingState";

export const AppErrorState = forwardRef<HTMLDivElement, AppErrorStateProps>(({
  tone = "error",
  ...props
}, ref) =>
  renderState("error", LYRA_STATE_LOGO, { tone, ...props }, ref)
);

AppErrorState.displayName = "AppErrorState";
