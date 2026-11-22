import {
  Popover as AppPopover,
  PopoverAnchor as AppPopoverAnchor,
  PopoverClose as AppPopoverClose,
  PopoverContent as AppPopoverContent,
  PopoverTrigger as AppPopoverTrigger
} from "./popover";
import type { ComponentProps } from "react";

export {
  AppPopover,
  AppPopoverAnchor,
  AppPopoverClose,
  AppPopoverContent,
  AppPopoverTrigger
};
export type AppPopoverContentProps = ComponentProps<typeof AppPopoverContent>;
