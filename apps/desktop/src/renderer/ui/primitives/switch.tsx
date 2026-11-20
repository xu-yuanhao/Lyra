import * as SwitchPrimitive from "@radix-ui/react-switch";
import { forwardRef, type ElementRef } from "react";

import { cn } from "../utils";

export type SwitchProps = SwitchPrimitive.SwitchProps;

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "lyra-ui-switch peer relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="lyra-ui-switch-thumb pointer-events-none block rounded-full" />
  </SwitchPrimitive.Root>
));

Switch.displayName = SwitchPrimitive.Root.displayName;
