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
          "lyra-ui-select-trigger",
          "lyra-app-select",
          selectedOption?.icon === undefined ? undefined : "lyra-ui-select-trigger-with-icon",
          className
        )}
        aria-label={ariaLabel}
        title={typeof selectedOption?.label === "string" ? selectedOption.label : ariaLabel}
        disabled={disabled || !hasOptions}
        {...dataAttributes}
      >
        {selectedOption?.icon === undefined ? null : (
          <span className="lyra-ui-select-trigger-icon" aria-hidden="true">
            {selectedOption.icon}
          </span>
        )}
        <span className="lyra-ui-select-trigger-value">
          {selectedOption?.label ?? placeholder ?? ariaLabel}
        </span>
        <ChevronDown className="lyra-ui-select-chevron" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn("lyra-ui-select-content", contentClassName)}
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
                  "lyra-ui-select-item",
                  option.icon === undefined ? undefined : "lyra-ui-select-item-with-icon",
                  option.description === undefined ? undefined : "lyra-ui-select-item-with-description",
                  option.className
                )}
                key={option.value}
                value={option.value}
                {...disabledProps}
                {...textValueProps}
              >
                <span className="lyra-ui-select-item-indicator" aria-hidden="true">
                  {active ? <Check className="lyra-ui-select-check" aria-hidden="true" /> : null}
                </span>
                {option.icon === undefined ? null : (
                  <span className="lyra-ui-select-item-icon" aria-hidden="true">
                    {option.icon}
                  </span>
                )}
                <span className="lyra-ui-select-item-copy">
                  <span>{option.label}</span>
                  {option.description === undefined ? null : (
                    <span className="lyra-ui-select-item-description" aria-hidden="true">
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
