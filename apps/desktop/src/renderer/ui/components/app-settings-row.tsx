import { type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export type AppSettingsRowProps = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  readonly control?: ReactNode;
  readonly description?: ReactNode;
  readonly title: ReactNode;
};

export const AppSettingsRow = ({
  className,
  control,
  description,
  title,
  ...props
}: AppSettingsRowProps) => (
  <div
    className={cn(
      "lyra-settings-row grid min-h-[var(--lyra-unit-58)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-16)] px-[var(--lyra-space-14)] py-[var(--lyra-space-10)]",
      className
    )}
    {...props}
  >
    <span className="lyra-settings-row-copy grid min-w-0 gap-[var(--lyra-space-2)]">
      <strong className="text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] font-medium text-[var(--lyra-text-primary)]">
        {title}
      </strong>
      {description === undefined ? null : (
        <small className="text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-muted)]">
          {description}
        </small>
      )}
    </span>
    {control === undefined ? null : (
      <span className="lyra-settings-row-control inline-flex items-center justify-end">
        {control}
      </span>
    )}
  </div>
);
