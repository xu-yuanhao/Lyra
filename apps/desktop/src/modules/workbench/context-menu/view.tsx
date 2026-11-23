import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { AppButton } from "@renderer/ui/components";
import {
  clampContextMenuPosition,
  readBrowserPageHostRects,
  readContextMenuPaneBoundary,
  type AnchorPosition
} from "./context-menu-position";
import type { ContextMenuState } from "./types";

const MENU_LAYER_CLASS = "lyra-context-menu-layer fixed inset-0 z-[var(--lyra-z-menu-layer)]";

const MENU_CLASS =
  "lyra-context-menu pointer-events-auto isolate fixed grid min-w-[var(--lyra-unit-188)] gap-[var(--lyra-space-2)] overflow-hidden rounded-[var(--lyra-radius-8)] border border-[var(--lyra-app-border)] bg-[var(--lyra-app-popover-bg)] p-[var(--lyra-space-4)] text-[var(--lyra-text-primary)] shadow-[var(--lyra-shadow-elevated-md)]";

const MENU_ITEM_CLASS =
  "lyra-context-menu-item relative outline-none transition-[background-color,color,opacity] duration-[var(--lyra-transition-fast)] hover:enabled:bg-[var(--lyra-app-row-hover-bg)] hover:enabled:text-[var(--lyra-text-primary)] hover:enabled:opacity-100 focus:bg-[var(--lyra-app-row-active-bg)] focus-visible:bg-[var(--lyra-app-row-active-bg)] focus:shadow-none focus-visible:shadow-none active:bg-[var(--lyra-app-row-active-bg)] active:shadow-none disabled:cursor-default disabled:opacity-[var(--lyra-opacity-disabled)] [&.lyra-ui-button]:grid [&.lyra-ui-button]:min-h-[var(--lyra-control-h-28)] [&.lyra-ui-button]:w-full [&.lyra-ui-button]:grid-cols-[var(--lyra-space-16)_minmax(0,1fr)] [&.lyra-ui-button]:items-center [&.lyra-ui-button]:justify-start [&.lyra-ui-button]:gap-[var(--lyra-space-8)] [&.lyra-ui-button]:appearance-none [&.lyra-ui-button]:rounded-[var(--lyra-radius-6)] [&.lyra-ui-button]:border-0 [&.lyra-ui-button]:bg-transparent [&.lyra-ui-button]:px-[var(--lyra-space-8)] [&.lyra-ui-button]:py-0 [&.lyra-ui-button]:text-left [&.lyra-ui-button]:font-medium [&.lyra-ui-button]:text-[var(--lyra-text-secondary)] [&.lyra-ui-button]:shadow-none";

const MENU_ITEM_SEPARATOR_CLASS =
  "lyra-context-menu-item-separator relative mt-[var(--lyra-space-4)] before:pointer-events-none before:absolute before:top-[calc(var(--lyra-space-2)*-1)] before:right-[var(--lyra-space-8)] before:left-[var(--lyra-space-8)] before:h-[var(--lyra-stroke-thin)] before:bg-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)] before:content-['']";

const MENU_ITEM_DANGER_CLASS =
  "lyra-context-menu-item-danger text-[var(--lyra-text-secondary)] [&.lyra-context-menu-item-danger]:hover:enabled:text-[color-mix(in_srgb,var(--lyra-window-close-hover-bg)_82%,var(--lyra-text-primary)_18%)] [&.lyra-context-menu-item-danger]:hover:enabled:bg-[color-mix(in_srgb,var(--lyra-window-close-hover-bg)_10%,var(--lyra-app-row-hover-bg))] [&_.lyra-context-menu-item-icon]:text-inherit";

const MENU_ITEM_ICON_CLASS =
  "lyra-context-menu-item-icon inline-flex items-center justify-center text-current";

type ContextMenuHostProps = {
  readonly state: ContextMenuState;
  readonly onClose: () => void;
  readonly onSelectItem: (itemId: string) => void;
};

export const ContextMenuHost = ({
  state,
  onClose,
  onSelectItem
}: ContextMenuHostProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<AnchorPosition>({
    left: state.anchorX,
    top: state.anchorY
  });

  const updatePosition = (): void => {
    const menu = menuRef.current;
    if (menu === null) {
      return;
    }
    const rect = menu.getBoundingClientRect();
    const paneBoundary = readContextMenuPaneBoundary(state.anchorX, state.anchorY);
    setPosition(
      clampContextMenuPosition({
        anchorX: state.anchorX,
        anchorY: state.anchorY,
        menuWidth: rect.width,
        menuHeight: rect.height,
        paneBoundary,
        browserHostRects: readBrowserPageHostRects()
      })
    );
  };

  useEffect(() => {
    if (state.isOpen === false) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose, state.isOpen]);

  useLayoutEffect(() => {
    if (state.isOpen === false) {
      return;
    }
    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [state.anchorX, state.anchorY, state.isOpen, state.items]);

  useEffect(() => {
    if (state.isOpen === false) {
      return;
    }

    const onResize = (): void => {
      updatePosition();
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
    };
  }, [state.anchorX, state.anchorY, state.isOpen]);

  if (state.isOpen === false || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className={MENU_LAYER_CLASS}
      onMouseDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menuRef}
        className={MENU_CLASS}
        style={{ left: position.left, top: position.top }}
        role="menu"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
        }}
      >
        {state.items.map((item) => (
          <AppButton
            key={item.id}
            variant="ghost"
            size="sm"
            className={[
              MENU_ITEM_CLASS,
              item.separatorBefore ? MENU_ITEM_SEPARATOR_CLASS : "",
              item.danger ? MENU_ITEM_DANGER_CLASS : ""
            ]
              .filter((value) => value.length > 0)
              .join(" ")}
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onSelectItem(item.id);
            }}
          >
            <span className={MENU_ITEM_ICON_CLASS} aria-hidden="true">
              {item.icon}
            </span>
            <span className="lyra-context-menu-item-label">{item.label}</span>
          </AppButton>
        ))}
      </div>
    </div>,
    document.body
  );
};