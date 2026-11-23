import { forwardRef, type ComponentProps } from "react";

import { cn } from "../utils";
import {
  MenuAnchor,
  MenuContent,
  MenuItem,
  MenuPortal,
  MenuRoot
} from "../primitives/menu";

export type AppContextMenuProps = ComponentProps<typeof MenuRoot>;
export type AppContextMenuAnchorProps = ComponentProps<typeof MenuAnchor>;
export type AppContextMenuContentProps = ComponentProps<typeof MenuContent>;
export type AppContextMenuItemProps = ComponentProps<typeof MenuItem>;

export const AppContextMenu = (props: AppContextMenuProps) => (
  <MenuRoot data-slot="context-menu" {...props} />
);

export const AppContextMenuAnchor = (props: AppContextMenuAnchorProps) => (
  <MenuAnchor data-slot="context-menu-anchor" {...props} />
);

export const AppContextMenuPortal = MenuPortal;

export const AppContextMenuContent = forwardRef<
  HTMLDivElement,
  AppContextMenuContentProps
>(function AppContextMenuContent(
  { className, sideOffset = 0, ...props },
  ref
) {
  return (
    <MenuPortal>
      <MenuContent
        ref={ref}
        data-slot="context-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[8rem] origin-(--radix-menu-content-transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </MenuPortal>
  );
});

export const AppContextMenuItem = ({
  className,
  ...props
}: AppContextMenuItemProps) => (
  <MenuItem
    data-slot="context-menu-item"
    className={cn(
      "relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      className
    )}
    {...props}
  />
);
