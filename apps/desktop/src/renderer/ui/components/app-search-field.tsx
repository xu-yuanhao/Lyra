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
      className={cn("lyra-app-search-field", className)}
      data-disabled={disabled ? "true" : undefined}
    >
      <span className="lyra-app-search-field-leading" aria-hidden={leading === undefined ? "true" : undefined}>
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
        className="lyra-app-search-field-input"
      />
      {trailing}
      {submitLabel === undefined || onSubmit === undefined ? null : (
        <AppIconButton
          aria-label={submitLabel}
          title={submitLabel}
          disabled={disabled}
          className="lyra-app-search-field-submit"
          onClick={onSubmit}
        >
          <Search size={15} />
        </AppIconButton>
      )}
    </div>
  );
});

AppSearchField.displayName = "AppSearchField";
