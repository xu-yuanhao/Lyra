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


// ---- Composer toolbar ----
export const COMPOSER_BOTTOM_CLASS =
  "lyra-agents-composer-bottom w-full flex items-center gap-[var(--lyra-agents-composer-toolbar-gap)] mt-[var(--lyra-space-6)] p-[var(--lyra-space-4)] h-[var(--lyra-shell-titlebar-nav-h)] min-h-[var(--lyra-shell-titlebar-nav-h)] min-w-0 [&_svg]:block [&_svg]:flex-none [&_svg]:size-[var(--lyra-agents-composer-toolbar-icon-size)]";
export const COMPOSER_MODEL_CONTROLS_CLASS =
  "lyra-agents-composer-model-controls w-auto min-w-0 flex flex-1 items-center flex-nowrap gap-[var(--lyra-agents-composer-toolbar-gap)] overflow-hidden";

const PICKER_VARS =
  "[--lyra-select-trigger-bg:transparent] [--lyra-select-trigger-hover-bg:color-mix(in_srgb,var(--lyra-app-row-hover-bg)_62%,transparent)] [--lyra-select-trigger-open-bg:color-mix(in_srgb,var(--lyra-app-row-hover-bg)_70%,transparent)] [--lyra-select-border:transparent] [--lyra-select-hover-border:transparent] [--lyra-select-focus-border:transparent] [--lyra-select-focus:transparent] [--lyra-select-content-bg:var(--lyra-app-popover-bg)] [--lyra-select-item-hover-bg:var(--lyra-app-row-hover-bg)] [--lyra-select-icon-gap:var(--lyra-space-4)]";
const PICKER_SHELL =
  "h-[var(--lyra-agents-composer-toolbar-control-size)] min-h-[var(--lyra-agents-composer-toolbar-control-size)] rounded-[var(--lyra-agents-composer-toolbar-radius)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] font-normal shadow-none px-[var(--lyra-space-4)] gap-[var(--lyra-select-icon-gap)] justify-self-start [&:hover:not([data-disabled])]:text-[var(--lyra-text-primary)] [&[data-state=open]]:text-[var(--lyra-text-primary)] [&:focus-visible]:shadow-none [&[data-state=open]]:shadow-none [&_.lyra-ui-select-chevron]:size-[var(--lyra-icon-size-12)] [&_.lyra-ui-select-chevron]:text-[var(--lyra-text-muted)]";
const PICKER_ICON_ONLY_BOX =
  "[&.lyra-agents-composer-toolbar-icon-only]:w-[var(--lyra-agents-composer-toolbar-control-size)] [&.lyra-agents-composer-toolbar-icon-only]:min-w-[var(--lyra-agents-composer-toolbar-control-size)] [&.lyra-agents-composer-toolbar-icon-only]:max-w-[var(--lyra-agents-composer-toolbar-control-size)] [&.lyra-agents-composer-toolbar-icon-only]:[min-inline-size:var(--lyra-agents-composer-toolbar-control-size)] [&.lyra-agents-composer-toolbar-icon-only]:[max-inline-size:var(--lyra-agents-composer-toolbar-control-size)] [&.lyra-agents-composer-toolbar-icon-only]:p-0 [&.lyra-agents-composer-toolbar-icon-only]:gap-0 [&.lyra-agents-composer-toolbar-icon-only]:grid-cols-1fr [&.lyra-agents-composer-toolbar-icon-only]:justify-center [&.lyra-agents-composer-toolbar-icon-only]:justify-items-center";

export const COMPOSER_MODEL_PICKER_CLASS =
  `lyra-agents-composer-model-picker ${PICKER_VARS} ${PICKER_SHELL} ${PICKER_ICON_ONLY_BOX} ` +
  "inline-flex items-center flex-[0_1_auto] w-fit max-w-full min-w-0 overflow-hidden " +
  "[&_.lyra-ui-select-trigger-label]:min-w-0 [&_.lyra-ui-select-trigger-label]:overflow-hidden [&_.lyra-ui-select-trigger-label]:text-ellipsis [&_.lyra-ui-select-trigger-label]:whitespace-nowrap " +
  "[&_.lyra-app-model-menu-option-icon]:flex-none " +
  "[&.lyra-app-model-menu-trigger[data-has-icon=true]_.lyra-ui-select-trigger-value]:inline-flex [&.lyra-app-model-menu-trigger[data-has-icon=true]_.lyra-ui-select-trigger-value]:items-center [&.lyra-app-model-menu-trigger[data-has-icon=true]_.lyra-ui-select-trigger-value]:min-w-0 [&.lyra-app-model-menu-trigger[data-has-icon=true]_.lyra-ui-select-trigger-value]:overflow-hidden " +
  "[&.lyra-agents-composer-toolbar-icon-only_.lyra-ui-select-trigger-label]:hidden " +
  "[&.lyra-agents-composer-toolbar-icon-only_.lyra-ui-select-chevron]:hidden " +
  "[&.lyra-agents-composer-toolbar-icon-only.lyra-app-model-menu-trigger_.lyra-ui-select-trigger-value]:inline-flex [&.lyra-agents-composer-toolbar-icon-only.lyra-app-model-menu-trigger_.lyra-ui-select-trigger-value]:justify-center [&.lyra-agents-composer-toolbar-icon-only.lyra-app-model-menu-trigger_.lyra-ui-select-trigger-value]:overflow-visible [&.lyra-agents-composer-toolbar-icon-only.lyra-app-model-menu-trigger_.lyra-ui-select-trigger-value]:gap-0";

export const COMPOSER_PERMISSION_PICKER_CLASS =
  `lyra-agents-composer-permission-mode-picker ${PICKER_VARS} ${PICKER_SHELL} ${PICKER_ICON_ONLY_BOX} ` +
  "flex-none w-max min-w-max [min-inline-size:max-content] [inline-size:max-content] grid-cols-[max-content_var(--lyra-icon-size-12)] " +
  "[&.lyra-ui-select-trigger-with-icon]:grid-cols-[var(--lyra-icon-size-12)_max-content_var(--lyra-icon-size-12)] " +
  "[&_.lyra-ui-select-trigger-icon]:size-[var(--lyra-icon-size-12)] [&_.lyra-ui-select-trigger-icon]:leading-[var(--lyra-text-line-collapse)] " +
  "[&_.lyra-ui-select-trigger-icon_svg]:block [&_.lyra-ui-select-trigger-icon_svg]:size-[var(--lyra-icon-size-12)] " +
  "[&_.lyra-ui-select-trigger-value]:min-w-max [&_.lyra-ui-select-trigger-value]:overflow-visible [&_.lyra-ui-select-trigger-value]:text-clip [&_.lyra-ui-select-trigger-value]:whitespace-nowrap " +
  "[&[data-permission-mode=full_auto]]:text-[var(--lyra-status-warning)] [&[data-permission-mode=full_auto]:hover:not([data-disabled])]:text-[var(--lyra-status-warning)] [&[data-permission-mode=full_auto][data-state=open]]:text-[var(--lyra-status-warning)] " +
  "[&[data-permission-mode=autonomous]]:text-[var(--lyra-status-error)] [&[data-permission-mode=autonomous]:hover:not([data-disabled])]:text-[var(--lyra-status-error)] [&[data-permission-mode=autonomous][data-state=open]]:text-[var(--lyra-status-error)] " +
  "[&.lyra-agents-composer-toolbar-icon-only_.lyra-ui-select-trigger-value]:hidden " +
  "[&.lyra-agents-composer-toolbar-icon-only_.lyra-ui-select-chevron]:hidden";

export const COMPOSER_TOOLBAR_MEASURE_CLASS =
  "lyra-agents-composer-toolbar-measure absolute top-0 left-0 invisible pointer-events-none flex w-max max-w-none overflow-visible [&_.lyra-ui-select-trigger]:w-max [&_.lyra-ui-select-trigger]:max-w-none [&_.lyra-ui-select-trigger]:[max-inline-size:none] [&_.lyra-agents-composer-model-settings-button]:w-max [&_.lyra-agents-composer-model-settings-button]:max-w-none [&_.lyra-agents-composer-model-settings-button]:[max-inline-size:none]";

export const COMPOSER_MODEL_SETTINGS_BUTTON_CLASS =
  "lyra-agents-composer-model-settings-button h-[var(--lyra-agents-composer-toolbar-control-size)] min-w-0 w-fit inline-size-fit flex-[0_1_auto] max-w-[var(--lyra-unit-260)] inline-flex items-center justify-start gap-[var(--lyra-agents-composer-toolbar-group-gap)] border border-transparent border-[var(--lyra-stroke-thin)] rounded-[var(--lyra-agents-composer-toolbar-radius)] bg-transparent text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] tracking-normal px-[var(--lyra-space-6)] cursor-pointer transition-[background-color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),border-color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),color_var(--lyra-motion-standard)] hover:bg-[var(--lyra-app-row-hover-bg)] hover:border-transparent hover:text-[var(--lyra-text-primary)] [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap " +
  PICKER_ICON_ONLY_BOX +
  " [&.lyra-agents-composer-toolbar-icon-only_span]:hidden";

export const COMPOSER_SELECT_CONTENT_CLASS =
  "lyra-agents-composer-select-content [--lyra-app-model-menu-max-width:var(--lyra-unit-260)] [--lyra-select-content-bg:var(--lyra-app-popover-bg)] [--lyra-select-border:var(--lyra-app-border)] [--lyra-select-item-hover-bg:var(--lyra-app-row-hover-bg)] shadow-none [&_.lyra-ui-select-item]:min-h-[var(--lyra-control-h-28)] [&_.lyra-ui-select-item]:rounded-[var(--lyra-radius-8)] [&_.lyra-ui-select-item]:text-[length:var(--lyra-text-size-12)] [&_.lyra-ui-select-item]:font-normal [&_.lyra-ui-menu-item]:min-h-[var(--lyra-control-h-28)] [&_.lyra-ui-menu-item]:rounded-[var(--lyra-radius-8)] [&_.lyra-ui-menu-item]:text-[length:var(--lyra-text-size-12)] [&_.lyra-ui-menu-item]:font-normal [&_.lyra-ui-menu-sub-trigger]:min-h-[var(--lyra-control-h-28)] [&_.lyra-ui-menu-sub-trigger]:rounded-[var(--lyra-radius-8)] [&_.lyra-ui-menu-sub-trigger]:text-[length:var(--lyra-text-size-12)] [&_.lyra-ui-menu-sub-trigger]:font-normal [&_.lyra-ui-select-item[data-state=checked]]:bg-[var(--lyra-app-row-active-bg)] [&_.lyra-ui-menu-item[data-active=true]]:bg-[var(--lyra-app-row-active-bg)]";

export const COMPOSER_ACTION_CLASS =
  "lyra-agents-composer-action flex-none w-[var(--lyra-agents-composer-toolbar-control-size)] min-w-[var(--lyra-agents-composer-toolbar-control-size)] h-[var(--lyra-agents-composer-toolbar-control-size)] min-h-[var(--lyra-agents-composer-toolbar-control-size)] aspect-square inline-flex items-center justify-center bg-transparent text-[var(--lyra-text-muted)] border-0 rounded-[var(--lyra-agents-composer-toolbar-radius)] p-0 cursor-pointer leading-[var(--lyra-text-line-collapse)] transition-[background-color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),opacity_var(--lyra-motion-standard)] hover:bg-transparent hover:text-[var(--lyra-text-primary)] disabled:cursor-default disabled:opacity-[var(--lyra-opacity-disabled)] disabled:hover:text-[var(--lyra-text-muted)] [&_svg]:size-[var(--lyra-agents-composer-toolbar-plain-icon-size)]! [&_svg]:flex-none";

export const COMPOSER_PRIMARY_ACTIONS_CLASS =
  "lyra-agents-composer-primary-actions ml-auto flex-none inline-flex items-center gap-[var(--lyra-agents-composer-primary-action-gap)] min-w-max";

export const COMPOSER_SEND_CLASS =
  "lyra-agents-composer-send ml-0 flex-none w-[var(--lyra-agents-composer-primary-action-size)] min-w-[var(--lyra-agents-composer-primary-action-size)] h-[var(--lyra-agents-composer-primary-action-size)] min-h-[var(--lyra-agents-composer-primary-action-size)] aspect-square inline-flex items-center justify-center bg-[var(--lyra-app-primary-button)] text-[var(--lyra-app-primary-button-fg)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-primary-button)_80%,transparent)] rounded-full p-0 cursor-pointer box-border leading-[var(--lyra-text-line-collapse)] transition-[background_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),transform_var(--lyra-motion-fast)] [&:not(:disabled):hover]:bg-[color-mix(in_srgb,var(--lyra-app-primary-button)_88%,var(--lyra-app-input-focus-bg))] [&:not(:disabled):hover]:text-[var(--lyra-app-primary-button-fg)] [&:not(:disabled):active]:scale-[0.92] [&[data-mode=pause]]:bg-[color-mix(in_srgb,var(--lyra-status-warning)_18%,var(--lyra-app-primary-button))] [&[data-mode=pause]]:text-[var(--lyra-app-primary-button-fg)] [&[data-mode=sending]]:bg-[var(--lyra-app-primary-button)] [&[data-mode=sending]]:text-[var(--lyra-app-primary-button-fg)] [&[data-mode=sending]]:cursor-default disabled:opacity-100 disabled:bg-[var(--lyra-app-row-hover-bg)] disabled:text-[var(--lyra-text-secondary)] disabled:border-[var(--lyra-app-border)] disabled:cursor-default [&[data-mode=pause]_.lyra-agents-composer-send-logo]:[--lyra-agents-composer-send-logo-spin-duration:1180ms]";

export const COMPOSER_SEND_LOGO_CLASS =
  "lyra-agents-composer-send-logo block w-[var(--lyra-agents-composer-send-logo-size)] h-[var(--lyra-agents-composer-send-logo-size)] bg-current [-webkit-mask-image:var(--lyra-agents-composer-send-logo-url)] [mask-image:var(--lyra-agents-composer-send-logo-url)] [-webkit-mask-repeat:no-repeat] [mask-repeat:no-repeat] [-webkit-mask-position:center] [mask-position:center] [-webkit-mask-size:contain] [mask-size:contain] origin-center animate-[composer-send-logo-spin_var(--lyra-agents-composer-send-logo-spin-duration)_linear_infinite] motion-reduce:animate-none";

// ---- Context ring ----
export const CONTEXT_RING_CLASS =
  "lyra-context-ring flex-none w-[var(--lyra-icon-size-16)] h-[var(--lyra-icon-size-16)] inline-flex items-center justify-center opacity-70";
export const CONTEXT_RING_TRACK_CLASS =
  "lyra-context-ring-track [stroke:color-mix(in_srgb,var(--lyra-app-border-strong)_72%,transparent)]";
export const CONTEXT_RING_FILL_CLASS =
  "lyra-context-ring-fill [transition:stroke-dashoffset_400ms_var(--lyra-ease-fast),stroke_var(--lyra-motion-standard-duration)_var(--lyra-ease-fast)]";
export const CONTEXT_RING_TONE_CLASS: Record<string, string> = {
  "lyra-context-ring--ok": "[&_.lyra-context-ring-fill]:[stroke:var(--lyra-status-success)]",
  "lyra-context-ring--warn": "[&_.lyra-context-ring-fill]:[stroke:var(--lyra-status-warning)]",
  "lyra-context-ring--danger": "[&_.lyra-context-ring-fill]:[stroke:var(--lyra-status-error)]",
  "lyra-context-ring--compressing":
    "[&_.lyra-context-ring-fill]:[stroke:var(--lyra-status-warning)] [&_.lyra-context-ring-fill]:animate-[lyra-context-ring-pulse_1.2s_var(--lyra-ease-standard)_infinite]",
  "lyra-context-ring--failed":
    "[&_.lyra-context-ring-fill]:[stroke:var(--lyra-status-error)] [&_.lyra-context-ring-fill]:opacity-50"
};
