import { Check, ChevronDown } from "@lyra/icons";
import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { cn } from "../utils";

export type AppSelectOption<TValue extends string = string> = {
  readonly className?: string;
  readonly description?: ReactNode;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly value: TValue;
};

export type AppSelectProps<TValue extends string = string> = {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly contentClassName?: string;
  readonly dataAttributes?: Record<string, string>;
  readonly disabled?: boolean;
  readonly onValueChange: (value: TValue) => void;
  readonly options: readonly AppSelectOption<TValue>[];
  readonly placeholder?: string;
  readonly value: TValue;
};

export const APP_SELECT_TRIGGER_CLASS = cn(
  "lyra-ui-select-trigger lyra-app-select",
  "inline-grid h-[var(--lyra-control-h-default)] min-w-[var(--lyra-unit-150)] max-w-full items-center gap-[var(--lyra-select-icon-gap,var(--lyra-space-8))] overflow-hidden whitespace-nowrap",
  "border border-[var(--lyra-select-border,var(--lyra-app-input-border))] bg-[var(--lyra-select-trigger-bg,var(--lyra-app-input-bg))] pl-[var(--lyra-space-10)] pr-[var(--lyra-space-8)]",
  "text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] text-[var(--lyra-text-primary)]",
  "[font-family:var(--lyra-font-ui)] rounded-[var(--lyra-control-radius-default)]",
  "transition-[background-color,border-color,box-shadow,color,opacity] duration-[var(--lyra-motion-fast)]",
  "[grid-template-columns:minmax(0,1fr)_var(--lyra-icon-size-14)]",
  "enabled:hover:border-[var(--lyra-select-hover-border,var(--lyra-app-input-focus-border))] enabled:hover:bg-[var(--lyra-select-trigger-hover-bg,var(--lyra-app-input-hover-bg))]",
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_var(--lyra-stroke-strong)_var(--lyra-select-focus,var(--lyra-app-focus))]",
  "data-[state=open]:border-[var(--lyra-select-focus-border,var(--lyra-app-input-focus-border))] data-[state=open]:bg-[var(--lyra-select-trigger-open-bg,var(--lyra-select-trigger-hover-bg,var(--lyra-app-input-hover-bg)))] data-[state=open]:shadow-[0_0_0_var(--lyra-stroke-strong)_var(--lyra-select-focus,transparent)]",
  "disabled:cursor-not-allowed disabled:opacity-[var(--lyra-opacity-disabled)]"
);

export const APP_SELECT_TRIGGER_WITH_ICON_CLASS =
  "lyra-ui-select-trigger-with-icon [grid-template-columns:var(--lyra-icon-size-14)_minmax(0,1fr)_var(--lyra-icon-size-14)]";

export const APP_SELECT_TRIGGER_VALUE_CLASS =
  "lyra-ui-select-trigger-value min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

export const APP_SELECT_TRIGGER_LABEL_CLASS =
  "lyra-ui-select-trigger-label min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";

export const APP_SELECT_CHEVRON_CLASS =
  "lyra-ui-select-chevron size-[var(--lyra-icon-size-14)] shrink-0 text-[var(--lyra-text-muted)]";

export const APP_SELECT_CONTENT_CLASS = cn(
  "lyra-ui-select-content",
  "min-w-[var(--radix-dropdown-menu-trigger-width,var(--lyra-unit-200))] max-h-[min(var(--radix-dropdown-menu-content-available-height,var(--lyra-unit-320)),var(--lyra-unit-300))]",
  "border-[var(--lyra-select-border,var(--lyra-app-border))] bg-[var(--lyra-select-content-bg,var(--lyra-app-popover-bg))]"
);

export const APP_SELECT_ITEM_CLASS = cn(
  "lyra-ui-select-item group/select-item",
  "relative grid min-h-[var(--lyra-control-h-28)] grid-cols-[minmax(0,1fr)] items-center gap-x-[var(--lyra-space-8)] py-0 pl-[var(--lyra-space-8)] pr-[var(--lyra-space-28)]",
  "rounded-[var(--lyra-radius-6)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] text-[var(--lyra-text-secondary)] outline-none select-none",
  "data-[highlighted]:text-[var(--lyra-text-primary)] data-[highlighted]:bg-[var(--lyra-select-item-hover-bg,var(--lyra-app-row-hover-bg))]",
  "data-[state=checked]:bg-transparent! data-[state=checked]:text-[var(--lyra-text-primary)]",
  "data-[state=checked]:data-[highlighted]:bg-[var(--lyra-select-item-hover-bg,var(--lyra-app-row-hover-bg))]!",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-[var(--lyra-opacity-disabled)]"
);

/**
 * Single-select dropdown built on the same non-modal DropdownMenu foundation
 * as AppModelMenu and AppMenu.
 *
 * Radix Select is intentionally not used here: it is hard-wired to
 * `disableOutsidePointerEvents`, so while one select is open every other
 * trigger on the page stops receiving pointer events and one-click switching
 * between two dropdowns is structurally impossible. A non-modal menu keeps
 * all triggers alive, toggles on its own trigger, and lets the open menu
 * close from the same pointerdown that opens the next one.
 */
export const AppSelect = <TValue extends string = string>({
  ariaLabel,
  className,
  contentClassName,
  dataAttributes,
  disabled = false,
  onValueChange,
  options,
  placeholder,
  value
}: AppSelectProps<TValue>) => {
  const hasOptions = options.length > 0;
  const selectedOption = options.find((option) => option.value === value) ?? null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={cn(
          APP_SELECT_TRIGGER_CLASS,
          selectedOption?.icon === undefined ? undefined : APP_SELECT_TRIGGER_WITH_ICON_CLASS,
          className
        )}
        aria-label={ariaLabel}
        title={typeof selectedOption?.label === "string" ? selectedOption.label : ariaLabel}
        disabled={disabled || !hasOptions}
        {...dataAttributes}
      >
        {selectedOption?.icon === undefined ? null : (
          <span
            className="lyra-ui-select-trigger-icon inline-flex size-[var(--lyra-icon-size-14)] min-w-0 items-center justify-center overflow-hidden text-inherit [&_svg,&_img]:block [&_svg,&_img]:size-[var(--lyra-icon-size-14)] [&_svg,&_img]:max-h-full [&_svg,&_img]:max-w-full [&_svg,&_img]:object-contain"
            aria-hidden="true"
          >
            {selectedOption.icon}
          </span>
        )}
        <span className={APP_SELECT_TRIGGER_VALUE_CLASS}>
          {selectedOption?.label ?? placeholder ?? ariaLabel}
        </span>
        <ChevronDown className={APP_SELECT_CHEVRON_CLASS} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(
          APP_SELECT_CONTENT_CLASS,
          contentClassName
        )}
        align="start"
      >
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => {
            onValueChange(nextValue as TValue);
          }}
        >
          {options.map((option) => {
            const textValueProps = typeof option.label === "string"
              ? { textValue: option.label }
              : {};
            const disabledProps = option.disabled === undefined
              ? {}
              : { disabled: option.disabled };
            const active = option.value === value;

            return (
              <DropdownMenuRadioItem
                className={cn(
                  APP_SELECT_ITEM_CLASS,
                  option.icon === undefined ? undefined : "lyra-ui-select-item-with-icon grid-cols-[var(--lyra-icon-size-14)_minmax(0,1fr)]",
                  option.description === undefined ? undefined : "lyra-ui-select-item-with-description py-[var(--lyra-space-4)]",
                  option.className
                )}
                key={option.value}
                value={option.value}
                {...disabledProps}
                {...textValueProps}
              >
                <span className="lyra-ui-select-item-indicator absolute top-1/2 right-[var(--lyra-space-8)] inline-flex size-[var(--lyra-icon-size-14)] -translate-y-1/2 items-center justify-center text-[var(--lyra-text-primary)]" aria-hidden="true">
                  {active ? <Check className="lyra-ui-select-check size-[var(--lyra-icon-size-14)]" aria-hidden="true" /> : null}
                </span>
                {option.icon === undefined ? null : (
                  <span className="lyra-ui-select-item-icon inline-flex size-[var(--lyra-icon-size-14)] min-w-0 items-center justify-center overflow-hidden text-[var(--lyra-text-muted)] group-data-[highlighted]/select-item:text-[var(--lyra-text-secondary)] group-data-[state=checked]/select-item:text-[var(--lyra-text-secondary)] [&_svg,&_img]:block [&_svg,&_img]:size-[var(--lyra-icon-size-14)] [&_svg,&_img]:max-h-full [&_svg,&_img]:max-w-full [&_svg,&_img]:object-contain [&_svg]:[stroke-width:1.75]" aria-hidden="true">
                    {option.icon}
                  </span>
                )}
                <span className="lyra-ui-select-item-copy grid min-w-0 gap-[var(--lyra-space-2)] [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap">
                  <span>{option.label}</span>
                  {option.description === undefined ? null : (
                    <span className="lyra-ui-select-item-description min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-muted)]" aria-hidden="true">
                      {option.description}
                    </span>
                  )}
                </span>
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
