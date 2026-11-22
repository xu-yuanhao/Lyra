import type { ComponentPropsWithoutRef, ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "./tooltip";
import { cn } from "../utils";

export type AppTooltipProps = {
  readonly children: ReactNode;
  readonly className?: string;
  readonly content: ReactNode;
  readonly contentClassName?: string;
  readonly delayDuration?: number;
  readonly disabled?: boolean;
} & Pick<
  ComponentPropsWithoutRef<typeof TooltipContent>,
  "align" | "side" | "sideOffset"
>;

export const AppTooltip = ({
  align = "center",
  children,
  className,
  content,
  contentClassName,
  delayDuration = 380,
  disabled = false,
  side = "top",
  sideOffset
}: AppTooltipProps) => {
  if (disabled || content === null || content === undefined || content === "") {
    return <>{children}</>;
  }

  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild className={className}>
          {children}
        </TooltipTrigger>
        <TooltipContent
          align={align}
          side={side}
          className={cn("lyra-app-tooltip", contentClassName)}
          {...(sideOffset === undefined ? {} : { sideOffset })}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
