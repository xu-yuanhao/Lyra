import { ChevronLeft } from "@lyra/icons";
import { forwardRef, type ButtonHTMLAttributes } from "react";

import { AppButton } from "./app-button";
import { cn } from "../utils";

export type AppSubPageBackProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly label: string;
};

// ponytail: 单一返回组件——统一设置二级/三级界面返回样式，替换各处内联 AppButton + ChevronLeft 的不一致写法
export const AppSubPageBack = forwardRef<HTMLButtonElement, AppSubPageBackProps>(
  ({ label, className, ...props }, ref) => (
    <AppButton
      ref={ref}
      type="button"
      variant="ghost"
      size="sm"
      className={cn("lyra-settings-subpage-back", className)}
      {...props}
    >
      <ChevronLeft size={14} aria-hidden="true" />
      <span>{label}</span>
    </AppButton>
  ),
);

AppSubPageBack.displayName = "AppSubPageBack";