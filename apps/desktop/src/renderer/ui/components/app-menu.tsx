import type { ComponentProps } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./dropdown-menu";

export type AppMenuProps = ComponentProps<typeof DropdownMenu>;
export type AppMenuContentProps = ComponentProps<typeof DropdownMenuContent>;
export type AppMenuGroupProps = ComponentProps<typeof DropdownMenuGroup>;
export type AppMenuItemProps = ComponentProps<typeof DropdownMenuItem>;
export type AppMenuLabelProps = ComponentProps<typeof DropdownMenuLabel>;
export type AppMenuSeparatorProps = ComponentProps<typeof DropdownMenuSeparator>;
export type AppMenuSubProps = ComponentProps<typeof DropdownMenuSub>;
export type AppMenuSubContentProps = ComponentProps<typeof DropdownMenuSubContent>;
export type AppMenuSubTriggerProps = ComponentProps<typeof DropdownMenuSubTrigger>;
export type AppMenuTriggerProps = ComponentProps<typeof DropdownMenuTrigger>;

export const AppMenu = ({ modal = false, ...props }: AppMenuProps) => (
  <DropdownMenu modal={modal} {...props} />
);

export const AppMenuContent = DropdownMenuContent;
export const AppMenuGroup = DropdownMenuGroup;
export const AppMenuItem = DropdownMenuItem;
export const AppMenuLabel = DropdownMenuLabel;
export const AppMenuSeparator = DropdownMenuSeparator;
export const AppMenuSub = DropdownMenuSub;
export const AppMenuSubContent = DropdownMenuSubContent;
export const AppMenuSubTrigger = DropdownMenuSubTrigger;
export const AppMenuTrigger = DropdownMenuTrigger;
