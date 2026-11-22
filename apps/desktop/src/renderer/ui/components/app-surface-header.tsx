import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export type AppSurfaceHeaderProps = HTMLAttributes<HTMLElement> & {
  readonly actions?: ReactNode;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
};

export const AppSurfaceHeader = forwardRef<HTMLElement, AppSurfaceHeaderProps>(({
  actions,
  className,
  description,
  eyebrow,
  title,
  ...props
}, ref) => (
  <header
    ref={ref}
    className={cn(
      "lyra-app-surface-header flex min-w-0 items-start justify-between gap-[var(--lyra-space-16)]",
      className
    )}
    {...props}
  >
    <div className="lyra-app-surface-header-copy grid min-w-0 gap-[var(--lyra-space-4)]">
      {eyebrow === undefined ? null : (
        <span className="lyra-app-surface-header-eyebrow text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] font-semibold text-[var(--lyra-text-muted)]">
          {eyebrow}
        </span>
      )}
      <h2 className="lyra-app-surface-header-title m-0 text-[length:var(--lyra-text-size-title-md)] leading-[var(--lyra-text-line-title)] font-semibold text-[var(--lyra-text-primary)]">
        {title}
      </h2>
      {description === undefined ? null : (
        <p className="lyra-app-surface-header-description m-0 text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] text-[var(--lyra-text-secondary)]">
          {description}
        </p>
      )}
    </div>
    {actions === undefined ? null : (
      <div className="lyra-app-surface-header-actions inline-flex items-center justify-end gap-[var(--lyra-space-8)]">
        {actions}
      </div>
    )}
  </header>
));

AppSurfaceHeader.displayName = "AppSurfaceHeader";
