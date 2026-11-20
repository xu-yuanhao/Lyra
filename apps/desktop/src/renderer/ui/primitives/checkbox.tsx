import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "@lyra/icons";
import { forwardRef, type ElementRef } from "react";

import { cn } from "../utils";

export type CheckboxProps = CheckboxPrimitive.CheckboxProps;

export const Checkbox = forwardRef<
  ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "lyra-ui-checkbox peer inline-flex shrink-0 items-center justify-center rounded-sm border border-input-border bg-input text-primary-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary",
      className
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="lyra-ui-checkbox-indicator flex items-center justify-center text-current">
      <Check className="lyra-ui-checkbox-icon" aria-hidden="true" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));

Checkbox.displayName = CheckboxPrimitive.Root.displayName;
