export const ATTACH_MENU_WRAP_CLASS =
  "lyra-agents-composer-attach-menu-wrap shrink-0";
export const ATTACH_MENU_CLASS =
  "lyra-agents-composer-attach-menu min-w-[calc(var(--lyra-unit-200)+var(--lyra-space-6))] max-w-[min(calc(var(--lyra-unit-240)+var(--lyra-space-8)),calc(100vw-var(--lyra-space-24)))]";
export const ATTACH_MENU_ITEM_CLASS =
  "lyra-agents-composer-attach-menu-item w-full";
const ATTACH_MENU_GRID_COLS =
  "grid-cols-[var(--lyra-icon-size-14)_minmax(0,1fr)_auto]";
const ATTACH_MENU_HIGHLIGHT_ICON =
  "[&[data-highlighted]_.lyra-agents-composer-attach-menu-icon]:text-[var(--lyra-text-secondary)]";
export const ATTACH_MENU_ENTRY_CLASS =
  `lyra-agents-composer-attach-menu-entry ${ATTACH_MENU_GRID_COLS} ${ATTACH_MENU_HIGHLIGHT_ICON}`;
export const ATTACH_SUBMENU_TRIGGER_CLASS =
  `lyra-agents-composer-attach-submenu-trigger ${ATTACH_MENU_GRID_COLS} ${ATTACH_MENU_HIGHLIGHT_ICON}`;
export const ATTACH_MENU_ICON_CLASS =
  "lyra-agents-composer-attach-menu-icon inline-flex items-center justify-center size-[var(--lyra-icon-size-14)] text-[var(--lyra-text-muted)] [&_svg]:size-[var(--lyra-icon-size-14)] [&_svg]:[stroke-width:1.8]";
export const ATTACH_SUBMENU_CLASS =
  "lyra-agents-composer-attach-submenu w-[min(calc(var(--lyra-unit-240)+var(--lyra-space-8)),calc(100vw-var(--lyra-space-24)))] min-w-[min(max(var(--radix-dropdown-menu-trigger-width,var(--lyra-unit-180)),var(--lyra-unit-180)),calc(var(--lyra-unit-240)+var(--lyra-space-8)),calc(100vw-var(--lyra-space-24)))] max-w-[min(calc(var(--lyra-unit-240)+var(--lyra-space-8)),calc(100vw-var(--lyra-space-24)))] max-h-[min(calc(var(--lyra-unit-160)+var(--lyra-space-16)),40vh)] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:var(--lyra-scrollbar-thumb-idle)_transparent] [&::-webkit-scrollbar]:size-[var(--lyra-space-6)] [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:min-h-[var(--lyra-space-32)] [&::-webkit-scrollbar-thumb]:rounded-[var(--lyra-radius-pill)] [&::-webkit-scrollbar-thumb]:bg-[var(--lyra-scrollbar-thumb-idle)] [&::-webkit-scrollbar-thumb:hover]:bg-[var(--lyra-scrollbar-thumb-hover)]";
