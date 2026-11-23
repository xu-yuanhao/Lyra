import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@renderer/ui/utils";
import {
  AppContextMenu,
  AppContextMenuAnchor,
  AppContextMenuContent,
  AppContextMenuItem
} from "@renderer/ui/components";
import {
  clampContextMenuPosition,
  readBrowserPageHostRects,
  readContextMenuPaneBoundary
} from "./context-menu-position";
import type { ContextMenuState } from "./types";

const MENU_CLASS =
  "lyra-context-menu pointer-events-auto isolate grid min-w-[var(--lyra-unit-188)] gap-[var(--lyra-space-2)] overflow-hidden rounded-[var(--lyra-radius-8)] border border-[var(--lyra-app-border)] bg-[var(--lyra-app-popover-bg)] p-[var(--lyra-space-4)] text-[var(--lyra-text-primary)] shadow-[var(--lyra-shadow-elevated-md)] z-[var(--lyra-z-menu-layer)]";

const MENU_ITEM_CLASS =
  "lyra-context-menu-item relative outline-none transition-[background-color,color,opacity] duration-[var(--lyra-transition-fast)] data-[highlighted]:bg-[var(--lyra-app-row-hover-bg)] data-[highlighted]:text-[var(--lyra-text-primary)] data-[highlighted]:opacity-100 rounded-[var(--lyra-radius-6)] px-[var(--lyra-space-8)] py-0 min-h-[var(--lyra-control-h-28)] w-full grid grid-cols-[var(--lyra-space-16)_minmax(0,1fr)] items-center justify-start gap-[var(--lyra-space-8)] text-left font-medium text-[var(--lyra-text-secondary)] data-[disabled]:opacity-[var(--lyra-opacity-disabled)]";

const MENU_ITEM_SEPARATOR_CLASS =
  "lyra-context-menu-item-separator relative mt-[var(--lyra-space-4)] before:pointer-events-none before:absolute before:top-[calc(var(--lyra-space-2)*-1)] before:right-[var(--lyra-space-8)] before:left-[var(--lyra-space-8)] before:h-[var(--lyra-stroke-thin)] before:bg-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)] before:content-['']";

const MENU_ITEM_DANGER_CLASS =
  "lyra-context-menu-item-danger text-[var(--lyra-text-secondary)] [&.lyra-context-menu-item-danger]:data-[highlighted]:text-[color-mix(in_srgb,var(--lyra-window-close-hover-bg)_82%,var(--lyra-text-primary)_18%)] [&.lyra-context-menu-item-danger]:data-[highlighted]:bg-[color-mix(in_srgb,var(--lyra-window-close-hover-bg)_10%,var(--lyra-app-row-hover-bg))] [&_.lyra-context-menu-item-icon]:text-inherit";

const MENU_ITEM_ICON_CLASS =
  "lyra-context-menu-item-icon inline-flex items-center justify-center text-current";

type ContextMenuHostProps = {
  readonly state: ContextMenuState;
  readonly onClose: () => void;
  readonly onSelectItem: (itemId: string) => void;
};

type MenuPosition = {
  readonly left: number;
  readonly top: number;
};

const pointRect = (x: number, y: number): DOMRect => ({
  x,
  y,
  top: y,
  left: x,
  right: x,
  bottom: y,
  width: 0,
  height: 0,
  toJSON: () => ({})
}) as DOMRect;

export const ContextMenuHost = ({
  state,
  onClose,
  onSelectItem
}: ContextMenuHostProps) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<MenuPosition>({
    left: state.anchorX,
    top: state.anchorY
  });
  const positionRef = useRef(position);
  positionRef.current = position;
  const virtualAnchorRef = useRef({
    getBoundingClientRect: () =>
      pointRect(positionRef.current.left, positionRef.current.top)
  });

  const updatePosition = useCallback((): void => {
    const menu = contentRef.current;
    if (menu === null) {
      return;
    }
    const paneBoundary = readContextMenuPaneBoundary(
      state.anchorX,
      state.anchorY
    );
    const next = clampContextMenuPosition({
      anchorX: state.anchorX,
      anchorY: state.anchorY,
      menuWidth: menu.offsetWidth,
      menuHeight: menu.offsetHeight,
      paneBoundary,
      browserHostRects: readBrowserPageHostRects()
    });
    setPosition((prev) =>
      prev.left === next.left && prev.top === next.top ? prev : next
    );
  }, [state.anchorX, state.anchorY]);

  useLayoutEffect(() => {
    if (state.isOpen === false) {
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [state.isOpen, state.items, updatePosition]);

  useLayoutEffect(() => {
    if (state.isOpen === false) {
      return;
    }
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("resize", updatePosition);
    };
  }, [state.isOpen, updatePosition]);

  if (state.isOpen === false || typeof document === "undefined") {
    return null;
  }

  return (
    <AppContextMenu
      open={state.isOpen}
      modal={false}
      onOpenChange={(open) => {
        if (open === false) {
          onClose();
        }
      }}
    >
      <AppContextMenuAnchor virtualRef={virtualAnchorRef} />
      <AppContextMenuContent
        ref={contentRef}
        className={MENU_CLASS}
        side="bottom"
        align="start"
        updatePositionStrategy="always"
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        {state.items.map((item) => (
          <AppContextMenuItem
            key={item.id}
            className={cn(
              MENU_ITEM_CLASS,
              item.separatorBefore && MENU_ITEM_SEPARATOR_CLASS,
              item.danger && MENU_ITEM_DANGER_CLASS
            )}
            disabled={item.disabled}
            onSelect={() => {
              onSelectItem(item.id);
            }}
          >
            <span className={MENU_ITEM_ICON_CLASS} aria-hidden="true">
              {item.icon}
            </span>
            <span className="lyra-context-menu-item-label">{item.label}</span>
          </AppContextMenuItem>
        ))}
      </AppContextMenuContent>
    </AppContextMenu>
  );
};
