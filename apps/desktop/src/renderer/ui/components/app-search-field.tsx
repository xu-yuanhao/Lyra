import { Search } from "@lyra/icons";
import { forwardRef, type KeyboardEvent, type ReactNode, type Ref } from "react";

import { AppIconButton } from "./app-icon-button";
import { Input } from "./input";
import { cn } from "../utils";

export type AppSearchFieldProps = {
  readonly ariaLabel: string;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly containerRef?: Ref<HTMLDivElement>;
  readonly disabled?: boolean;
  readonly leading?: ReactNode;
  readonly onSubmit?: () => void;
  readonly onValueChange: (value: string) => void;
  readonly placeholder?: string;
  readonly submitLabel?: string;
  readonly trailing?: ReactNode;
  readonly value: string;
};

export const AppSearchField = forwardRef<HTMLInputElement, AppSearchFieldProps>(({
  ariaLabel,
  autoFocus,
  className,
  containerRef,
  disabled = false,
  leading,
  onSubmit,
  onValueChange,
  placeholder,
  submitLabel,
  trailing,
  value
}, ref) => {
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== "Enter" || onSubmit === undefined) return;
    onSubmit();
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        "lyra-app-search-field grid h-[var(--lyra-control-h-default)] min-w-0 grid-cols-[var(--lyra-icon-size-16)_minmax(0,1fr)_auto_auto] items-center gap-[var(--lyra-space-12)] border border-[var(--lyra-app-input-border)] bg-[var(--lyra-app-input-bg)] py-0 pl-[var(--lyra-space-10)] pr-[var(--lyra-space-6)]",
        "text-[var(--lyra-text-primary)] rounded-[var(--lyra-control-radius-default)] transition-[background-color,border-color,box-shadow] duration-[var(--lyra-motion-fast)]",
        "hover:border-[var(--lyra-app-input-focus-border)] hover:bg-[var(--lyra-app-input-hover-bg)]",
        "focus-within:border-[var(--lyra-app-input-focus-border)] focus-within:bg-[var(--lyra-app-input-focus-bg)] focus-within:shadow-[0_0_0_var(--lyra-stroke-thin)_var(--lyra-app-focus)]",
        "data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-[var(--lyra-opacity-disabled)]",
        className
      )}
      data-disabled={disabled ? "true" : undefined}
    >
      <span
        className="lyra-app-search-field-leading inline-flex size-[var(--lyra-icon-size-16)] items-center justify-center text-[var(--lyra-text-muted)] [&_svg]:size-[var(--lyra-icon-size-14)]"
        aria-hidden={leading === undefined ? "true" : undefined}
      >
        {leading ?? <Search size={15} />}
      </span>
      <Input
        ref={ref}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
        onKeyDown={onKeyDown}
        className="lyra-app-search-field-input h-[calc(var(--lyra-control-h-36)_-_var(--lyra-space-4))] min-w-0 rounded-none border-0 bg-transparent p-0 shadow-none! hover:border-transparent focus-visible:border-transparent focus-visible:shadow-none!"
      />
      {trailing}
      {submitLabel === undefined || onSubmit === undefined ? null : (
        <AppIconButton
          aria-label={submitLabel}
          title={submitLabel}
          disabled={disabled}
          className="lyra-app-search-field-submit size-[var(--lyra-control-h-compact)]"
          onClick={onSubmit}
        >
          <Search size={15} />
        </AppIconButton>
      )}
    </div>
  );
});

AppSearchField.displayName = "AppSearchField";
