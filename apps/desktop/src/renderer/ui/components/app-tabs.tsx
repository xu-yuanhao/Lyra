import { type ReactNode } from "react";

import { Tabs, TabsList, TabsTrigger } from "./tabs";
import { Toggle } from "./toggle";
import { cn } from "../utils";

export type AppTabOption<TValue extends string = string> = {
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly title?: string;
  readonly value: TValue;
};

export type AppTabsProps<TValue extends string = string> = {
  readonly activeValues?: readonly TValue[];
  readonly ariaLabel: string;
  readonly className?: string;
  readonly onValueChange: (value: TValue) => void;
  readonly options: readonly AppTabOption<TValue>[];
  readonly selectionMode?: "single" | "multiple";
  readonly size?: "sm" | "md";
  readonly value: TValue;
};

const renderTabContent = <TValue extends string = string>(option: AppTabOption<TValue>) => (
  <>
    {option.icon === undefined ? null : (
      <span className="lyra-app-tab-icon" aria-hidden="true">
        {option.icon}
      </span>
    )}
    <span className="lyra-app-tab-label">{option.label}</span>
  </>
);

const isSelected = <TValue extends string>(
  option: AppTabOption<TValue>,
  value: TValue,
  activeValues: readonly TValue[] | undefined
): boolean =>
  activeValues === undefined ? option.value === value : activeValues.includes(option.value);

export const AppTabs = <TValue extends string = string>({
  activeValues,
  ariaLabel,
  className,
  onValueChange,
  options,
  selectionMode = "single",
  size = "sm",
  value
}: AppTabsProps<TValue>) => {
  const rootClassName = cn("lyra-app-tabs", `lyra-app-tabs-size-${size}`, className);

  // Multiple mode is a toggle-button group, not tabs: each option is an
  // independent pressed toggle; the parent owns the selected set.
  if (selectionMode === "multiple") {
    return (
      <div className={rootClassName} role="group" aria-label={ariaLabel}>
        {options.map((option) => {
          const selected = isSelected(option, value, activeValues);
          return (
            <Toggle
              key={option.value}
              type="button"
              pressed={selected}
              disabled={option.disabled}
              aria-label={option.ariaLabel}
              title={option.title}
              className="lyra-app-tab"
              data-active={selected ? "true" : undefined}
              onPressedChange={() => {
                if (option.disabled) return;
                onValueChange(option.value);
              }}
            >
              {renderTabContent(option)}
            </Toggle>
          );
        })}
      </div>
    );
  }

  return (
    <Tabs
      className={rootClassName}
      value={value}
      onValueChange={(nextValue) => {
        onValueChange(nextValue as TValue);
      }}
    >
      <TabsList className="lyra-app-tabs-list inline-flex items-center" aria-label={ariaLabel}>
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            title={option.title}
            className="lyra-app-tab"
            data-active={isSelected(option, value, activeValues) ? "true" : undefined}
          >
            {renderTabContent(option)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
