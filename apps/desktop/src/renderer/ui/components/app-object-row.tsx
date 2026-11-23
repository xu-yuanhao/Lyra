import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type Ref,
  type ReactNode
} from "react";

import { cn } from "../utils";

type AppObjectRowBaseProps = {
  readonly active?: boolean;
  readonly actions?: ReactNode;
  readonly badges?: ReactNode;
  readonly description?: ReactNode;
  readonly icon?: ReactNode;
  readonly meta?: ReactNode;
  readonly title: ReactNode;
};

export type AppObjectRowButtonProps = AppObjectRowBaseProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title"> & {
    readonly as?: "button";
  };

export type AppObjectRowDivProps = AppObjectRowBaseProps &
  Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
    readonly as: "div";
  };

export type AppObjectRowProps = AppObjectRowButtonProps | AppObjectRowDivProps;

const ROW_CLASS = cn(
  "group lyra-app-object-row",
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-[var(--lyra-space-10)] rounded-[var(--lyra-radius-8)] border border-transparent bg-[var(--lyra-app-row-bg)] px-[var(--lyra-space-10)] py-[var(--lyra-space-8)] text-left font-[family-name:var(--lyra-font-ui)] text-[var(--lyra-text-primary)]",
  "min-h-[var(--lyra-control-h-52)] transition-[background-color,border-color,color,opacity] duration-[var(--lyra-motion-fast)]",
  "hover:not(:disabled):bg-[var(--lyra-app-row-hover-bg)]",
  "data-[active=true]:bg-[var(--lyra-app-row-active-bg)]",
  "focus-visible:outline-0 focus-visible:shadow-[0_0_0_var(--lyra-stroke-strong)_var(--lyra-app-focus)]",
  "disabled:cursor-not-allowed disabled:opacity-[var(--lyra-opacity-disabled)]",
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-[var(--lyra-opacity-disabled)]",
  "[&.lyra-app-sidebar-row]:relative [&.lyra-app-sidebar-row]:min-h-[var(--lyra-app-sidebar-row-h)] [&.lyra-app-sidebar-row]:border-0 [&.lyra-app-sidebar-row]:rounded-[var(--lyra-app-sidebar-row-radius)] [&.lyra-app-sidebar-row]:bg-transparent [&.lyra-app-sidebar-row]:px-[var(--lyra-app-sidebar-row-pad-x)] [&.lyra-app-sidebar-row]:py-0 [&.lyra-app-sidebar-row]:font-medium [&.lyra-app-sidebar-row]:text-[var(--lyra-text-secondary)] [&.lyra-app-sidebar-row]:grid-cols-[var(--lyra-app-sidebar-icon-size)_minmax(0,1fr)_auto] [&.lyra-app-sidebar-row]:gap-x-[var(--lyra-space-8)]",
  "[&.lyra-app-sidebar-row]:hover:text-[var(--lyra-text-primary)] [&.lyra-app-sidebar-row]:hover:bg-[var(--lyra-app-row-hover-bg)] [&.lyra-app-sidebar-row][data-active=true]:text-[var(--lyra-text-primary)] [&.lyra-app-sidebar-row][data-active=true]:bg-[var(--lyra-app-row-active-bg)]",
  "[&.lyra-app-sidebar-row-selected]:text-[var(--lyra-text-primary)] [&.lyra-app-sidebar-row-selected]:bg-[var(--lyra-app-row-active-bg)] [&.lyra-app-sidebar-row-active]:text-[var(--lyra-text-primary)] [&.lyra-app-sidebar-row-active]:bg-[var(--lyra-app-row-active-bg)]"
);

const ROW_ICON_CLASS = cn(
  "lyra-app-object-row-icon",
  "inline-flex size-[var(--lyra-control-h-default)] items-center justify-center rounded-[var(--lyra-radius-8)] bg-[var(--lyra-app-input-bg)] text-[var(--lyra-text-secondary)] shadow-[inset_0_0_0_var(--lyra-stroke-thin)_color-mix(in_srgb,var(--lyra-app-border)_62%,transparent)]",
  "[&_svg]:size-[var(--lyra-icon-size-16)] [&_svg]:[stroke-width:1.8]",
  "group-hover:not(:disabled):text-[var(--lyra-text-primary)] group-hover:not(:disabled):bg-[var(--lyra-app-input-hover-bg)]",
  "group-data-[active=true]:text-[var(--lyra-text-primary)] group-data-[active=true]:bg-[var(--lyra-app-input-hover-bg)]",
  "[.lyra-app-sidebar-row.lyra-app-object-row_&]:w-[var(--lyra-app-sidebar-icon-size)] [.lyra-app-sidebar-row.lyra-app-object-row_&]:h-[var(--lyra-app-sidebar-icon-size)] [.lyra-app-sidebar-row.lyra-app-object-row_&]:overflow-visible [.lyra-app-sidebar-row.lyra-app-object-row_&]:rounded-none [.lyra-app-sidebar-row.lyra-app-object-row_&]:bg-transparent [.lyra-app-sidebar-row.lyra-app-object-row_&]:text-current [.lyra-app-sidebar-row.lyra-app-object-row_&]:shadow-none [.lyra-app-sidebar-row.lyra-app-object-row_&]:opacity-100",
  "[.lyra-app-sidebar-row.lyra-app-object-row:hover.lyra-app-sidebar-row_&]:bg-transparent [.lyra-app-sidebar-row.lyra-app-object-row:hover.lyra-app-sidebar-row_&]:text-current [.lyra-app-sidebar-row.lyra-app-object-row:hover.lyra-app-sidebar-row_&]:shadow-none [.lyra-app-sidebar-row.lyra-app-object-row[data-active=true].lyra-app-sidebar-row_&]:bg-transparent [.lyra-app-sidebar-row.lyra-app-object-row[data-active=true].lyra-app-sidebar-row_&]:text-current [.lyra-app-sidebar-row.lyra-app-object-row[data-active=true].lyra-app-sidebar-row_&]:shadow-none",
  "[.lyra-app-sidebar-row.lyra-app-object-row_& svg]:size-[var(--lyra-app-sidebar-icon-size)]"
);

const ROW_MAIN_CLASS = "lyra-app-object-row-main grid min-w-0";
const ROW_HEAD_CLASS = cn(
  "lyra-app-object-row-head grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[var(--lyra-space-8)]",
  "[.lyra-app-sidebar-row_&]:min-w-0"
);
const ROW_TITLE_CLASS = cn(
  "lyra-app-object-row-title min-w-0 truncate text-[length:var(--lyra-text-size-body)] font-semibold leading-[var(--lyra-text-line-body)] text-[var(--lyra-text-primary)]",
  "[.lyra-app-sidebar-row_&]:w-full [.lyra-app-sidebar-row_&]:overflow-hidden [.lyra-app-sidebar-row_&]:text-inherit [.lyra-app-sidebar-row_&]:text-[length:var(--lyra-text-size-body)] [.lyra-app-sidebar-row_&]:font-medium [.lyra-app-sidebar-row_&]:leading-[var(--lyra-text-line-18)] [.lyra-app-sidebar-row_&]:[text-overflow:clip] [.lyra-app-sidebar-row_&]:whitespace-nowrap",
  "[.lyra-app-sidebar-row_&]:[mask-image:linear-gradient(90deg,black_0%,black_calc(100%-var(--lyra-space-24)),transparent)] [.lyra-app-sidebar-row_&]:[-webkit-mask-image:linear-gradient(90deg,black_0%,black_calc(100%-var(--lyra-space-24)),transparent)]",
  "[.lyra-app-sidebar-row:hover_&]:text-[var(--lyra-text-primary)] [.lyra-app-sidebar-row[data-active=true]_&]:text-[var(--lyra-text-primary)] [.lyra-app-sidebar-row-selected_&]:text-[var(--lyra-text-primary)] [.lyra-app-sidebar-row-active_&]:text-[var(--lyra-text-primary)]"
);
const ROW_META_CLASS = cn(
  "lyra-app-object-row-meta min-w-0 truncate text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-muted)]",
  "[.lyra-app-sidebar-row:hover:has(.lyra-app-sidebar-row-action)_&]:hidden [.lyra-app-sidebar-row:focus-within:has(.lyra-app-sidebar-row-action)_&]:hidden"
);
const ROW_DESCRIPTION_CLASS = cn(
  "lyra-app-object-row-description min-w-0 truncate text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-muted)]",
  "group-hover:not(:disabled):text-[var(--lyra-text-secondary)] group-data-[active=true]:text-[var(--lyra-text-secondary)]",
  "[.lyra-app-sidebar-row_&]:hidden"
);
const ROW_EDGE_CLASS = "inline-flex min-w-0 flex-nowrap items-center justify-end gap-[var(--lyra-space-6)]";

const activateDivButton = (
  event: KeyboardEvent<HTMLDivElement>
): void => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const target = event.currentTarget;
  if (target.getAttribute("aria-disabled") === "true") {
    return;
  }
  event.preventDefault();
  target.click();
};

export const AppObjectRow = forwardRef<HTMLButtonElement | HTMLDivElement, AppObjectRowProps>(({
  active = false,
  actions,
  as = "button",
  badges,
  className,
  description,
  icon,
  meta,
  title,
  ...props
}, ref) => {
  const hasIcon = icon !== undefined;
  const rowClassName = cn(
    ROW_CLASS,
    hasIcon && "grid-cols-[var(--lyra-control-h-default)_minmax(0,1fr)_auto_auto]",
    className
  );
  const content = (
    <>
      {icon === undefined ? null : (
        <span className={ROW_ICON_CLASS} aria-hidden="true">
          {icon}
        </span>
      )}
      <span className={ROW_MAIN_CLASS}>
        <span className={ROW_HEAD_CLASS}>
          <span className={ROW_TITLE_CLASS}>{title}</span>
          {meta === undefined ? null : (
            <span className={ROW_META_CLASS}>{meta}</span>
          )}
        </span>
        {description === undefined ? null : (
          <span className={ROW_DESCRIPTION_CLASS}>{description}</span>
        )}
      </span>
      {badges === undefined ? null : (
        <span className={cn("lyra-app-object-row-badges", ROW_EDGE_CLASS)}>{badges}</span>
      )}
      {actions === undefined ? null : (
        <span
          className={cn("lyra-app-object-row-actions", ROW_EDGE_CLASS, "[.lyra-app-sidebar-row_&]:relative [.lyra-app-sidebar-row_&]:gap-[var(--lyra-space-2)]")}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {actions}
        </span>
      )}
    </>
  );

  if (as === "div") {
    const divProps = props as Omit<HTMLAttributes<HTMLDivElement>, "title">;
    const {
      onKeyDown,
      role,
      ...restDivProps
    } = divProps;
    return (
      <div
        ref={ref as Ref<HTMLDivElement>}
        className={rowClassName}
        data-active={active ? "true" : undefined}
        data-has-actions={actions === undefined ? undefined : "true"}
        data-has-icon={hasIcon ? "true" : undefined}
        role={role}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (!event.defaultPrevented && role === "button") {
            activateDivButton(event);
          }
        }}
        {...restDivProps}
      >
        {content}
      </div>
    );
  }

  const buttonProps = props as Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">;
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      className={rowClassName}
      data-active={active ? "true" : undefined}
      data-has-actions={actions === undefined ? undefined : "true"}
      data-has-icon={hasIcon ? "true" : undefined}
      {...buttonProps}
    >
      {content}
    </button>
  );
});

AppObjectRow.displayName = "AppObjectRow";
