import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "../utils";

export const buttonVariants = cva(
  "lyra-ui-button inline-flex shrink-0 items-center justify-center rounded-control border border-transparent text-ui-base font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "lyra-ui-button-default bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "lyra-ui-button-outline border-border text-foreground hover:border-border-hover hover:bg-input/50",
        secondary:
          "lyra-ui-button-secondary bg-secondary text-foreground hover:bg-secondary/80",
        ghost: "lyra-ui-button-ghost text-foreground hover:bg-hover",
        destructive:
          "lyra-ui-button-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90"
      },
      size: {
        sm: "lyra-ui-button-size-sm",
        md: "lyra-ui-button-size-md",
        lg: "lyra-ui-button-size-lg",
        icon: "lyra-ui-button-size-icon"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md"
    }
  }
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
  };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  asChild = false,
  className,
  size,
  type = "button",
  variant,
  ...props
}, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
});

Button.displayName = "Button";
