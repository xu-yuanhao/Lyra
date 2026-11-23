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

export const APP_TAB_ITEM_CLASS =
  "lyra-tab-item box-border h-[var(--lyra-tab-control-h)] min-h-[var(--lyra-tab-control-h)] grid grid-cols-[minmax(0,1fr)_var(--lyra-tab-close-size)] items-center gap-[var(--lyra-space-2)] rounded-[var(--lyra-radius-8)]";

export const APP_TAB_MAIN_CLASS = "lyra-tab-main min-w-0 h-full w-full justify-start";

export const APP_TAB_TITLE_CLASS =
  "lyra-tab-title flex-[1_1_0] w-full min-w-0 overflow-hidden whitespace-nowrap [text-overflow:clip] [mask-image:linear-gradient(90deg,black_0%,black_calc(100%-var(--lyra-space-24)),transparent)] [-webkit-mask-image:linear-gradient(90deg,black_0%,black_calc(100%-var(--lyra-space-24)),transparent)]";

export const APP_TAB_CLOSE_CLASS =
  "lyra-tab-close size-[var(--lyra-tab-close-size)] place-items-center self-center justify-self-center grid";

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

const APP_TAB_CLASS = cn(
  "lyra-app-tab inline-flex h-[var(--lyra-control-h-24)] min-w-0 items-center justify-center gap-[var(--lyra-space-6)] px-[var(--lyra-space-8)] py-0",
  "border-0 rounded-[var(--lyra-radius-6)] bg-transparent text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] text-[var(--lyra-text-muted)] whitespace-nowrap cursor-default",
  "[font-family:var(--lyra-font-ui)] transition-[background-color,color,opacity] duration-[var(--lyra-motion-fast)]",
  "enabled:hover:text-[var(--lyra-text-primary)] enabled:hover:bg-[var(--lyra-app-row-hover-bg)]",
  "data-[active=true]:text-[var(--lyra-text-primary)] data-[active=true]:bg-[var(--lyra-app-row-active-bg)]",
  "focus-visible:outline-none focus-visible:shadow-[0_0_0_var(--lyra-stroke-strong)_var(--lyra-app-focus)]",
  "disabled:cursor-not-allowed disabled:opacity-[var(--lyra-opacity-disabled)]"
);

const renderTabContent = <TValue extends string = string>(option: AppTabOption<TValue>) => (
  <>
    {option.icon === undefined ? null : (
      <span className="lyra-app-tab-icon inline-flex size-[var(--lyra-icon-size-14)] items-center justify-center [&_svg]:size-[var(--lyra-icon-size-14)]" aria-hidden="true">
        {option.icon}
      </span>
    )}
    <span className="lyra-app-tab-label min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{option.label}</span>
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
  const rootClassName = cn(
    "lyra-app-tabs inline-flex min-w-0 items-center gap-[var(--lyra-space-2)] border border-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)] bg-[var(--lyra-app-input-bg)] p-[var(--lyra-space-2)]",
    "rounded-[var(--lyra-radius-8)]",
    size === "md" ? "lyra-app-tabs-size-md min-h-[var(--lyra-control-h-32)]" : "lyra-app-tabs-size-sm min-h-[var(--lyra-control-h-28)]",
    size === "md" && "[&_.lyra-app-tab]:h-[var(--lyra-control-h-28)]",
    className
  );

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
              className={APP_TAB_CLASS}
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
      <TabsList className="lyra-app-tabs-list contents" aria-label={ariaLabel}>
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            title={option.title}
            className={APP_TAB_CLASS}
            data-active={isSelected(option, value, activeValues) ? "true" : undefined}
          >
            {renderTabContent(option)}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};
