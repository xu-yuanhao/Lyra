import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "../utils";

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("lyra-ui-card rounded-surface border border-card-border bg-card text-card-foreground text-ui-base", className)}
    {...props}
  />
));

Card.displayName = "Card";

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("lyra-ui-card-header", className)} {...props} />
));

CardHeader.displayName = "CardHeader";

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("lyra-ui-card-content", className)} {...props} />
));

CardContent.displayName = "CardContent";
