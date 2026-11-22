import { forwardRef, type ComponentProps } from "react";

import { Button as ShadcnButton } from "./button";
import { cn } from "../utils";

type ShadcnButtonProps = ComponentProps<typeof ShadcnButton>;

export type AppButtonProps = Omit<ShadcnButtonProps, "size"> & {
  readonly size?: "sm" | "md" | "lg" | "icon";
};

const toShadcnSize = (
  size: AppButtonProps["size"]
): ShadcnButtonProps["size"] => {
  if (size === "md") {
    return "default";
  }
  return size === undefined ? "default" : size;
};

export const AppButton = forwardRef<HTMLButtonElement, AppButtonProps>(({
  className,
  size,
  type = "button",
  ...props
}, ref) => (
  <ShadcnButton
    ref={ref}
    type={type}
    size={toShadcnSize(size)}
    className={cn(className)}
    {...props}
  />
));

AppButton.displayName = "AppButton";

export { buttonVariants as appButtonVariants } from "./button";
