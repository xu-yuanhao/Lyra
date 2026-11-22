import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export type AppSettingsSectionProps = HTMLAttributes<HTMLElement> & {
  readonly children: ReactNode;
  readonly cluster?: boolean;
  readonly label: string;
  readonly titlePlacement?: "inside" | "outside" | "none";
};

const GROUP_CARD_CLASS = cn(
  "grid min-w-0 gap-0 overflow-hidden rounded-[var(--lyra-settings-radius-card)] border border-[var(--lyra-settings-border)] bg-[color-mix(in_srgb,var(--lyra-settings-card-bg)_96%,transparent)] p-0 shadow-[var(--lyra-settings-shadow-card)] backdrop-blur-[var(--lyra-app-material-blur-sm)] backdrop-saturate-[var(--lyra-app-material-saturate)]",
  "[:root[data-lyra-window-material=opaque]_&]:bg-[var(--lyra-settings-card-bg)] [:root[data-lyra-window-material=opaque]_&]:[backdrop-filter:none]"
);

export const AppSettingsSection = forwardRef<HTMLElement, AppSettingsSectionProps>(({
  children,
  className,
  cluster = false,
  label,
  titlePlacement = "inside",
  ...props
}, ref) => {
  const group = (
    <div className={cn("lyra-settings-group", cluster && "lyra-settings-group-cluster", GROUP_CARD_CLASS)}>
      {titlePlacement === "inside" ? (
        <header className="lyra-settings-group-header relative flex min-h-[var(--lyra-control-h-40)] min-w-0 items-center justify-between gap-[var(--lyra-space-12)] px-[var(--lyra-space-14)] py-[var(--lyra-space-12)] after:absolute after:bottom-0 after:left-[var(--lyra-space-14)] after:right-[var(--lyra-space-14)] after:h-[var(--lyra-stroke-thin)] after:bg-[color-mix(in_srgb,var(--lyra-settings-border)_72%,transparent)] after:content-['']">
          <h3 className="m-0 text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] font-semibold text-[var(--lyra-text-primary)]">{label}</h3>
        </header>
      ) : null}
      {children}
    </div>
  );

  if (titlePlacement === "inside") {
    return (
      <section
        ref={ref}
        className={cn("lyra-settings-section grid min-w-0 gap-[var(--lyra-space-8)]", className)}
        {...props}
      >
        {group}
      </section>
    );
  }

  return (
    <section
      ref={ref}
      className={cn("lyra-settings-section grid min-w-0 gap-[var(--lyra-space-8)]", className)}
      {...props}
    >
      {titlePlacement === "outside" ? (
        <h3 className="lyra-settings-section-title m-0 px-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] font-medium text-[var(--lyra-text-muted)]">{label}</h3>
      ) : null}
      {group}
    </section>
  );
});

AppSettingsSection.displayName = "AppSettingsSection";
