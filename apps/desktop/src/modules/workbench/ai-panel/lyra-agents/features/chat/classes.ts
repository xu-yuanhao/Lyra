const COMPOSER_INPUT_NATIVE_BG =
  "native-material:[.lyra-agents-composer>&]:bg-[var(--lyra-material-solid-panel-bg,var(--lyra-app-panel-bg))] " +
  "native-material:[.lyra-agents-composer>&:hover:not(:disabled)]:bg-[var(--lyra-material-solid-panel-bg,var(--lyra-app-panel-bg))] " +
  "native-material:[.lyra-agents-composer>&:focus-visible]:bg-[var(--lyra-material-solid-panel-bg,var(--lyra-app-panel-bg))]";

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
  "lyra-agents-composer-bottom w-full flex items-center gap-[var(--lyra-agents-composer-toolbar-gap)] mt-[var(--lyra-space-6)] p-[var(--lyra-space-4)] h-[var(--lyra-shell-titlebar-nav-h)] min-h-[var(--lyra-shell-titlebar-nav-h)] min-w-0 [&_svg]:block [&_svg]:flex-none [&_svg]:size-[var(--lyra-agents-composer-toolbar-icon-size)] select-none";
export const COMPOSER_MODEL_CONTROLS_CLASS =
  "lyra-agents-composer-model-controls w-auto min-w-0 flex flex-1 items-center flex-nowrap gap-[var(--lyra-agents-composer-toolbar-gap)] overflow-hidden @max-[720px]:gap-[var(--lyra-agents-composer-toolbar-gap)] @max-[720px]:flex-[0_1_auto] @max-[720px]:max-w-none @max-[720px]:min-w-0";

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

// ---- Composer shell / rail / input ----
export const COMPOSER_WRAP_CLASS =
  "lyra-agents-composer-wrap absolute bottom-0 left-1/2 right-auto -translate-x-1/2 w-full max-w-full box-border pt-[var(--lyra-agents-composer-wrap-padding-top)] px-[var(--lyra-space-20)] pb-[var(--lyra-agents-composer-wrap-padding-bottom)] [@supports(padding-bottom:env(safe-area-inset-bottom))]:pb-[calc(var(--lyra-agents-composer-wrap-padding-bottom)+env(safe-area-inset-bottom))] z-[var(--lyra-z-ai-composer)] pointer-events-none flex flex-col items-center gap-0 isolate bg-transparent";
export const COMPOSER_RAIL_CLASS =
  "lyra-agents-composer-rail self-stretch flex items-start justify-start gap-[var(--lyra-space-8)] mb-[var(--lyra-space-8)] pointer-events-none";
export const COMPOSER_TOPROW_CLASS =
  "lyra-agents-composer-toprow relative flex-1 min-w-0 flex items-center justify-start flex-wrap gap-[var(--lyra-space-6)] mb-0 pointer-events-none empty:hidden";
export const COMPOSER_RAIL_CHIP_CLASS =
  `lyra-agents-composer-rail-chip pointer-events-auto inline-flex items-center gap-[var(--lyra-space-4)] h-[var(--lyra-agents-composer-toolbar-control-size)] px-[var(--lyra-space-8)] [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-input-border)] rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-app-surface-strong-bg)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] [font:inherit] tabular-nums leading-[var(--lyra-text-line-flat)] cursor-pointer hover:bg-[color-mix(in_srgb,var(--lyra-app-surface-strong-bg)_94%,var(--lyra-text-primary)_6%)] hover:text-[var(--lyra-text-primary)] disabled:opacity-[var(--lyra-opacity-disabled)] disabled:cursor-default [&_svg]:flex-none ` +
  "native-material:[.lyra-agents-composer-toprow_&]:bg-[color-mix(in_srgb,var(--lyra-material-solid-surface-strong-bg,var(--lyra-app-surface-strong-bg))_92%,var(--lyra-material-solid-surface-bg,var(--lyra-app-surface-bg))_8%)]";
export const COMPOSER_CHANGES_COUNTS_CLASS =
  "lyra-agents-composer-changes-counts inline-flex items-center gap-[var(--lyra-space-4)]";
export const COMPOSER_CLASS =
  "lyra-agents-composer relative pointer-events-auto flex flex-col w-full gap-0 self-stretch bg-[var(--lyra-agents-composer-shell-bg)] [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-input-border)] rounded-[var(--lyra-radius-12)] p-[var(--lyra-space-8)_var(--lyra-space-10)] shadow-none transition-[background-color_var(--lyra-motion-fast),border-color_var(--lyra-motion-fast)] focus-within:bg-[var(--lyra-agents-composer-shell-bg)] focus-within:[border-color:color-mix(in_srgb,var(--lyra-app-input-focus-border)_56%,var(--lyra-app-input-border))]";
export const COMPOSER_SEND_ERROR_CLASS =
  "lyra-agents-composer-send-error mb-[var(--lyra-space-6)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-caption)]";

const COMPOSER_INPUT_BASE =
  "w-full flex-none bg-[var(--lyra-agents-content-bg)] text-[var(--lyra-text-primary)] border-0 rounded-[var(--lyra-radius-8)] outline-none [font:inherit] text-[length:var(--lyra-text-size-14)] p-[var(--lyra-space-10)] shadow-none";
export const COMPOSER_INPUT_CLASS =
  `lyra-agents-composer-input ${COMPOSER_INPUT_BASE} resize-none leading-[var(--lyra-text-line-relaxed)] h-[calc(var(--lyra-space-64)+var(--lyra-space-8))] min-h-[calc(var(--lyra-space-64)+var(--lyra-space-8))] overflow-y-hidden [scrollbar-width:none] [mask-image:none] [-webkit-mask-image:none] focus-visible:bg-[var(--lyra-agents-content-bg)] focus-visible:border-0 focus-visible:shadow-none hover:not-disabled:bg-[var(--lyra-agents-content-bg)] hover:not-disabled:border-0 [&::-webkit-scrollbar]:hidden placeholder:text-[var(--lyra-text-muted)] disabled:text-[var(--lyra-text-secondary)] disabled:cursor-default disabled:opacity-100 select-text @max-[720px]:text-[length:var(--lyra-text-size-16)] @max-[720px]:h-[var(--lyra-space-52)] @max-[720px]:min-h-[var(--lyra-space-52)] @max-[360px]:text-[length:var(--lyra-text-size-16)] ${COMPOSER_INPUT_NATIVE_BG}`;
export const CITATION_COMPOSER_INPUT_CLASS =
  `lyra-agents-citation-composer-input lyra-agents-composer-input ${COMPOSER_INPUT_BASE} leading-[var(--lyra-text-line-24)] min-h-[calc(var(--lyra-space-64)+var(--lyra-space-8))] max-h-[calc((var(--lyra-space-64)+var(--lyra-space-8))*4)] overflow-y-auto whitespace-pre-wrap break-word focus-visible:outline-none focus-visible:bg-[var(--lyra-agents-content-bg)] data-[drop-active=true]:[outline:var(--lyra-stroke-thin)_solid_color-mix(in_srgb,var(--lyra-text-primary)_72%,transparent)] data-[drop-active=true]:[outline-offset:calc(-1*var(--lyra-stroke-thin))] data-[drop-active=true]:bg-[color-mix(in_srgb,var(--lyra-text-primary)_5%,var(--lyra-app-surface-strong-bg))] [&:empty]:before:content-[attr(data-placeholder)] [&:empty]:before:text-[var(--lyra-text-muted)] [&:empty]:before:pointer-events-none [&_.lyra-agents-citation-chip]:[-webkit-user-modify:read-only] select-text ${COMPOSER_INPUT_NATIVE_BG}`;

// ---- Browser capsule ----
export const BROWSER_CAPSULE_WRAP_CLASS =
  "lyra-agents-composer-browser-capsule-wrap pointer-events-auto relative flex-none ml-[var(--lyra-space-10)] inline-flex items-center [&:hover_.lyra-agents-composer-browser-capsule-dismiss]:opacity-100 [&:hover_.lyra-agents-composer-browser-capsule-dismiss]:pointer-events-auto";
export const BROWSER_CAPSULE_CLASS =
  "lyra-agents-composer-browser-capsule [&>span]:max-w-[12em] [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap";
export const BROWSER_CAPSULE_LOGO_CLASS =
  "lyra-agents-composer-browser-capsule-logo [--lyra-app-logo-size:var(--lyra-icon-size-14)] size-[var(--lyra-icon-size-14)] text-current";
export const BROWSER_CAPSULE_FAVICON_CLASS =
  "lyra-agents-composer-browser-capsule-favicon size-[var(--lyra-icon-size-14)] flex-none rounded-[var(--lyra-radius-4)] object-cover block [&[data-failed=true]]:hidden [&[data-failed=true]+_.lyra-agents-composer-browser-capsule-logo-fallback]:block";
export const BROWSER_CAPSULE_LOGO_FALLBACK_CLASS =
  "lyra-agents-composer-browser-capsule-logo lyra-agents-composer-browser-capsule-logo-fallback hidden";
export const BROWSER_CAPSULE_DISMISS_CLASS =
  "lyra-agents-composer-browser-capsule-dismiss absolute -top-[var(--lyra-space-6)] -right-[var(--lyra-space-6)] inline-flex items-center justify-center size-[var(--lyra-space-16)] p-0 [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-input-border)] rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-app-surface-strong-bg)] text-[var(--lyra-text-secondary)] cursor-pointer opacity-0 pointer-events-none focus-visible:opacity-100 focus-visible:pointer-events-auto after:content-[''] after:absolute after:inset-[calc(-1*var(--lyra-space-4))]";

// ---- Inline resource / citation chips ----
const INLINE_RESOURCE_VARS =
  "[--lyra-agents-inline-resource-max-width:min(14rem,calc(100cqi_-_var(--lyra-space-64)))] [--lyra-agents-inline-resource-color:color-mix(in_srgb,var(--lyra-syntax-keyword)_76%,var(--lyra-text-primary)_24%)] [--lyra-agents-inline-resource-icon-color:color-mix(in_srgb,var(--lyra-syntax-keyword)_88%,var(--lyra-text-primary)_12%)]";
export const INLINE_RESOURCE_CLASS =
  `lyra-agents-inline-resource ${INLINE_RESOURCE_VARS} inline-flex items-baseline gap-[var(--lyra-space-4)] min-w-0 max-w-[var(--lyra-agents-inline-resource-max-width)] min-h-0 m-0 p-0 border-0 rounded-none bg-transparent text-[var(--lyra-agents-inline-resource-color)] [font:inherit] leading-[inherit] align-baseline select-none box-border whitespace-nowrap overflow-hidden [overflow-wrap:normal] [word-break:normal] [-webkit-box-decoration-break:clone] [box-decoration-break:clone] appearance-none text-left hover:[filter:none] hover:text-[var(--lyra-agents-inline-resource-color)] hover:underline focus-visible:[filter:none] focus-visible:text-[var(--lyra-agents-inline-resource-color)] focus-visible:underline ` +
  "[&.lyra-ui-button]:h-auto [&.lyra-ui-button]:justify-start [&.lyra-ui-button]:transform-none " +
  "[&.lyra-ui-button:hover:not(:disabled)]:border-transparent [&.lyra-ui-button:hover:not(:disabled)]:bg-transparent [&.lyra-ui-button:hover:not(:disabled)]:text-[var(--lyra-agents-inline-resource-color)] [&.lyra-ui-button:hover:not(:disabled)]:transform-none " +
  "[&.lyra-ui-button:active:not(:disabled)]:border-transparent [&.lyra-ui-button:active:not(:disabled)]:bg-transparent [&.lyra-ui-button:active:not(:disabled)]:text-[var(--lyra-agents-inline-resource-color)] [&.lyra-ui-button:active:not(:disabled)]:transform-none";
export const INLINE_RESOURCE_GROUP_CLASS =
  "lyra-agents-inline-resource-group inline-flex flex-col items-start gap-[var(--lyra-space-2)] min-w-0 max-w-full align-top";
export const RESOURCE_CHIP_CLASS =
  "lyra-agents-resource-chip [&:focus]:outline-none [&:focus-visible]:[outline:var(--lyra-stroke-thin)_solid_color-mix(in_srgb,var(--lyra-text-accent)_44%,transparent)] [&:focus-visible]:outline-offset-[var(--lyra-space-2)]";
export const CITATION_CHIP_PREVIEW_WRAP_CLASS =
  "lyra-agents-citation-chip-preview-wrap relative self-baseline flex-1 min-w-0 max-w-full overflow-hidden whitespace-nowrap";
export const CITATION_CHIP_PREVIEW_CLASS =
  "lyra-agents-citation-chip-preview block leading-[inherit] overflow-hidden whitespace-nowrap [word-break:normal] [overflow-wrap:normal] text-ellipsis p-0";
export const CITATION_CHIP_ICON_CLASS =
  "lyra-agents-citation-chip-icon inline-flex flex-none self-center items-center justify-center size-[var(--lyra-space-14)] text-[var(--lyra-agents-inline-resource-icon-color)] [&_svg]:size-[var(--lyra-space-12)]";
export const CITATION_CHIP_ICON_HOST_CLASS =
  "lyra-agents-citation-chip-icon-host inline-flex flex-none self-center items-center justify-center text-[var(--lyra-agents-inline-resource-icon-color)]";
export const CITATION_CHIP_LINK_CLASS =
  "lyra-agents-citation-chip-link max-w-[var(--lyra-agents-inline-resource-max-width)] [&_.lyra-agents-citation-chip-icon-host]:size-[var(--lyra-space-14)] [&_.lyra-agents-citation-chip-icon-host]:text-[var(--lyra-agents-inline-resource-icon-color)]";
export const PAGE_CITATION_FAVICON_CLASS =
  "lyra-agents-page-citation-chip-favicon relative inline-flex size-[var(--lyra-space-12)] items-center justify-center [&_img]:absolute [&_img]:inset-0 [&_img]:size-[var(--lyra-space-12)] [&_img]:rounded-[var(--lyra-radius-4)] [&_img]:object-contain [&_img]:opacity-0 [&_img]:transition-[opacity_var(--lyra-motion-fast)] [&_img[data-failed=true]]:opacity-0 [&_img[data-loaded=true]]:opacity-100 [&_img[data-loaded=true]+_.lyra-agents-page-citation-chip-favicon-fallback]:opacity-0";
export const PAGE_CITATION_FAVICON_FALLBACK_CLASS =
  "lyra-agents-page-citation-chip-favicon-fallback absolute inset-0 inline-flex items-center justify-center opacity-100 transition-[opacity_var(--lyra-motion-fast)]";
export const MESSAGE_CITATION_TARGET_CLASS =
  "lyra-agents-message-citation-target animate-[lyra-agents-citation-target-highlight_2.6s_var(--lyra-ease-standard)_forwards]";

const ChipIconUnset = "[&_.lyra-agents-citation-chip-icon]:[color:unset]";
const ChipIconType =
  "[&_.lyra-agents-citation-chip-icon]:[--lyra-agents-inline-resource-icon-color:color-mix(in_srgb,var(--lyra-syntax-type)_84%,var(--lyra-text-primary)_16%)]";
const ChipIconFunc =
  "[&_.lyra-agents-citation-chip-icon]:[--lyra-agents-inline-resource-icon-color:color-mix(in_srgb,var(--lyra-syntax-function)_84%,var(--lyra-text-primary)_16%)]";
const ChipIconFunc82 =
  "[&_.lyra-agents-citation-chip-icon]:[--lyra-agents-inline-resource-icon-color:color-mix(in_srgb,var(--lyra-syntax-function)_82%,var(--lyra-text-primary)_18%)]";
export const CITATION_CHIP_FILE_CLASS = `lyra-agents-citation-chip-file ${ChipIconUnset}`;
export const CITATION_CHIP_ATTACHMENT_FILE_CLASS = `lyra-agents-citation-chip-attachment-file ${ChipIconUnset}`;
export const CITATION_CHIP_ASSISTANT_CLASS = `lyra-agents-citation-chip-assistant ${ChipIconType}`;
export const CITATION_CHIP_USER_CLASS = `lyra-agents-citation-chip-user ${ChipIconFunc82}`;
export const CITATION_CHIP_ATTACHMENT_WORKSPACE_CLASS = `lyra-agents-citation-chip-attachment-workspace ${ChipIconType}`;
export const CITATION_CHIP_ATTACHMENT_BROWSER_CLASS = `lyra-agents-citation-chip-attachment-browser ${ChipIconType}`;
export const CITATION_CHIP_ATTACHMENT_WINDOW_CLASS = `lyra-agents-citation-chip-attachment-window ${ChipIconFunc}`;

export const citationChipRoleClass = (role: string): string =>
  role === "user" ? CITATION_CHIP_USER_CLASS : CITATION_CHIP_ASSISTANT_CLASS;

export const imageAttachmentChipVariantClass = (kind: string): string => {
  if (kind === "workspace") return CITATION_CHIP_ATTACHMENT_WORKSPACE_CLASS;
  if (kind === "browser") return CITATION_CHIP_ATTACHMENT_BROWSER_CLASS;
  if (kind === "window") return CITATION_CHIP_ATTACHMENT_WINDOW_CLASS;
  return CITATION_CHIP_ATTACHMENT_FILE_CLASS;
};
export const CHAT_EMPTY_CLASS =
  "lyra-agents-chat-empty [container-type:inline-size] flex flex-col items-center justify-center gap-[var(--lyra-space-16)] w-full min-h-full p-[var(--lyra-space-16)] text-center text-[var(--lyra-text-muted)]";
export const CHAT_EMPTY_LOGO_CLASS =
  "lyra-agents-chat-empty-logo m-0 font-[family-name:var(--lyra-font-mono)] text-[length:clamp(var(--lyra-space-1),0.6cqw,var(--lyra-space-5))] leading-[var(--lyra-text-line-flat)] whitespace-pre max-w-full select-none pointer-events-auto cursor-pointer [--lyra-logo-wave-trough:var(--lyra-agents-content-bg)] [--lyra-logo-wave-mid:color-mix(in_srgb,var(--lyra-text-muted)_60%,transparent)] [--lyra-logo-wave-crest:var(--lyra-text-primary)] [background:linear-gradient(100deg,var(--lyra-logo-wave-trough)_0%,var(--lyra-logo-wave-mid)_12.5%,var(--lyra-logo-wave-crest)_25%,var(--lyra-logo-wave-mid)_37.5%,var(--lyra-logo-wave-trough)_50%,var(--lyra-logo-wave-mid)_62.5%,var(--lyra-logo-wave-crest)_75%,var(--lyra-logo-wave-mid)_87.5%,var(--lyra-logo-wave-trough)_100%)] bg-[length:200%_100%] bg-clip-text text-transparent [-webkit-text-fill-color:transparent] animate-[lyra-logo-wave-sweep_800ms_linear] motion-reduce:animate-none motion-reduce:bg-none motion-reduce:[-webkit-text-fill-color:color-mix(in_srgb,var(--lyra-text-muted)_52%,transparent)] motion-reduce:text-[color-mix(in_srgb,var(--lyra-text-muted)_52%,transparent)]";
export const CHAT_EMPTY_QUESTION_CLASS =
  "lyra-agents-chat-empty-question m-0 font-[family-name:var(--lyra-font-ui)] text-[length:clamp(var(--lyra-space-20),5cqw,var(--lyra-space-48))] leading-[var(--lyra-text-line-display)] text-[var(--lyra-text-secondary)] inline-flex items-baseline flex-wrap justify-center gap-[var(--lyra-space-4)]";
export const CHAT_EMPTY_PROJECT_CLASS =
  "lyra-agents-chat-empty-project [font-size:inherit] font-semibold text-[var(--lyra-text-primary)]";
export const COMPOSER_CONTEXT_RING_SLOT_CLASS =
  "lyra-agents-composer-context-ring-slot absolute bottom-[var(--lyra-agents-composer-wrap-padding-bottom)] right-[var(--lyra-space-20)] h-[var(--lyra-agents-composer-toolbar-control-size)] pointer-events-auto flex items-center justify-center [@supports(padding-bottom:env(safe-area-inset-bottom))]:bottom-[calc(var(--lyra-agents-composer-wrap-padding-bottom)+env(safe-area-inset-bottom))]";
export const PROJECT_META_ROW_CLASS =
  "lyra-agents-project-dir-chip-row lyra-agents-project-meta-row pointer-events-auto self-stretch flex items-center justify-start gap-[var(--lyra-space-8)] w-full min-w-0 mt-[var(--lyra-space-4)] pl-[var(--lyra-space-2)] pr-[calc(var(--lyra-icon-size-16)+var(--lyra-space-16))] flex-nowrap overflow-hidden";
export const PROJECT_DIR_CHIP_CLASS =
  "lyra-agents-project-dir-chip flex-[0_1_auto] min-w-0 inline-flex items-center gap-[var(--lyra-space-4)] max-w-full h-[var(--lyra-agents-composer-toolbar-control-size)] px-[var(--lyra-space-8)] bg-transparent text-[var(--lyra-text-muted)] border-0 rounded-[var(--lyra-agents-composer-toolbar-radius)] cursor-pointer transition-[background-color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),opacity_var(--lyra-motion-standard)] hover:bg-[var(--lyra-app-row-hover-bg)] hover:text-[var(--lyra-text-primary)] disabled:cursor-default disabled:opacity-[var(--lyra-opacity-disabled)] disabled:hover:bg-transparent disabled:hover:text-[var(--lyra-text-muted)] [&_svg]:flex-[0_0_auto]";
export const PROJECT_DIR_CHIP_LABEL_CLASS =
  "lyra-agents-project-dir-chip-label min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-flat)]";
export const PROJECT_DIR_CHIP_CHEVRON_CLASS =
  "lyra-agents-project-dir-chip-chevron flex-[0_0_auto] text-[var(--lyra-text-muted)] -ml-[var(--lyra-space-4)]";
export const PROJECT_DIR_CHIP_ICON_CLASS =
  "lyra-agents-project-dir-chip-icon w-[var(--lyra-icon-size-14)] h-[var(--lyra-icon-size-14)] flex-[0_0_var(--lyra-icon-size-14)] inline-flex items-center justify-center text-current";
export const PROJECT_DIR_CHIP_IMAGE_CLASS = "lyra-agents-project-dir-chip-image rounded-[var(--lyra-radius-4)]";
export const PROJECT_DIR_CHIP_LYRA_LOGO_CLASS =
  "lyra-agents-project-dir-chip-lyra-logo [--lyra-app-logo-size:var(--lyra-icon-size-14)] w-[var(--lyra-icon-size-14)] h-[var(--lyra-icon-size-14)] text-current";
export const EDITOR_MENU_ROW_CLASS =
  "lyra-agents-editor-menu-row flex items-center gap-[var(--lyra-space-8)] min-w-0";
export const EDITOR_MENU_ICON_CLASS =
  "lyra-agents-editor-menu-icon w-[var(--lyra-icon-size-16)] h-[var(--lyra-icon-size-16)] flex-[0_0_var(--lyra-icon-size-16)] rounded-[var(--lyra-radius-4)] object-contain";
export const BG_TERMINAL_ITEM_CLASS =
  "lyra-agents-bg-terminal-item flex items-center justify-between gap-[var(--lyra-space-8)] px-[var(--lyra-space-8)] py-[var(--lyra-space-4)] min-w-0 hover:bg-[var(--lyra-app-row-hover-bg)]";
export const BG_TERMINAL_ITEM_BODY_CLASS = "lyra-agents-bg-terminal-item-body min-w-0 flex-[1_1_auto]";
export const BG_TERMINAL_ITEM_TITLE_CLASS =
  "lyra-agents-bg-terminal-item-title m-0 overflow-hidden text-ellipsis whitespace-nowrap font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-caption)] text-[var(--lyra-text-primary)]";
export const BG_TERMINAL_ITEM_PATH_CLASS =
  "lyra-agents-bg-terminal-item-path m-0 overflow-hidden text-ellipsis whitespace-nowrap font-[family-name:var(--lyra-font-ui)] text-[length:var(--lyra-text-size-caption)] text-[var(--lyra-text-muted)]";
export const BG_TERMINAL_KILL_CLASS = "lyra-agents-bg-terminal-kill flex-[0_0_auto]";
export const TASK_CARD_CLASS = "lyra-agents-task-card flex flex-col gap-[var(--lyra-space-4)] select-text";
export const TASK_CARD_HEAD_CLASS = "lyra-agents-task-card-head m-0 text-[var(--lyra-text-muted)]";
export const TASK_ITEM_CLASS =
  "lyra-agents-task-item w-full min-w-0 font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-comfortable)] text-[var(--lyra-text-secondary)] [overflow-wrap:break-word]";
export const EDIT_CARD_WAITING_CLASS =
  "lyra-agents-edit-card-waiting py-[var(--lyra-space-8)] px-[var(--lyra-space-12)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-secondary)]";
export const EDIT_DETAILS_CLASS = "lyra-agents-edit-details min-w-0";
export const DIFF_ADD_CLASS = "lyra-agents-diff-add text-[var(--lyra-status-success)]";
export const DIFF_DEL_CLASS = "lyra-agents-diff-del text-[var(--lyra-status-error)]";
export const TICK_CLASS =
  "lyra-agents-tick relative inline-block min-w-[1ch] align-baseline overflow-visible";
export const TICK_UP_CLASS =
  "tick-up [&_.lyra-agents-tick-current]:animate-[tick-in-up_var(--lyra-motion-slow-duration)_var(--lyra-ease-tick)_both] [&_.lyra-agents-tick-ghost]:animate-[tick-out-up_var(--lyra-motion-slow-duration)_var(--lyra-ease-tick)_both]";
export const TICK_DOWN_CLASS =
  "tick-down [&_.lyra-agents-tick-current]:animate-[tick-in-down_var(--lyra-motion-slow-duration)_var(--lyra-ease-tick)_both] [&_.lyra-agents-tick-ghost]:animate-[tick-out-down_var(--lyra-motion-slow-duration)_var(--lyra-ease-tick)_both]";
export const TICK_CURRENT_CLASS =
  "lyra-agents-tick-current relative inline-block [will-change:transform,opacity,filter] motion-reduce:animate-none!";
export const TICK_GHOST_CLASS =
  "lyra-agents-tick-ghost absolute left-0 top-0 pointer-events-none inline-block [will-change:transform,opacity,filter] motion-reduce:animate-none!";
export const DIFF_VIEWPORT_CLASS =
  "lyra-agents-diff-viewport overflow-auto overscroll-contain [scrollbar-color:transparent_transparent] [scrollbar-width:thin] [&:hover]:[scrollbar-color:var(--lyra-effect-scrollbar-soft)_transparent] [&::-webkit-scrollbar]:w-[var(--lyra-space-5)] [&::-webkit-scrollbar]:h-[var(--lyra-space-5)] [&::-webkit-scrollbar-thumb]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-[var(--lyra-radius-4)] [&:hover::-webkit-scrollbar-thumb]:bg-[var(--lyra-effect-scrollbar-soft)] [&_.lyra-agents-diff-line]:h-[var(--lyra-space-20)] [&_.lyra-agents-diff-line]:leading-[var(--lyra-text-line-20)] [&_.lyra-agents-diff-line]:shrink-0 [&_.lyra-agents-diff-line]:w-max [&_.lyra-agents-diff-line]:min-w-full select-text";
export const DIFF_VIEWPORT_TRACK_CLASS =
  "lyra-agents-diff-viewport-track flex flex-col w-max min-w-full font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)]";
export const DIFF_WIDTH_PROBE_CLASS =
  "lyra-agents-diff-width-probe h-0 overflow-hidden [visibility:hidden] pointer-events-none shrink-0";
export const DIFF_LINE_BASE_CLASS =
  "lyra-agents-diff-line grid grid-cols-[var(--lyra-unit-42)_var(--lyra-space-16)_max-content] px-[var(--lyra-space-8)] @max-[720px]:grid-cols-[var(--lyra-space-32)_var(--lyra-space-14)_max-content] @max-[720px]:text-[length:var(--lyra-text-size-caption)] @max-[360px]:grid-cols-[var(--lyra-space-28)_var(--lyra-space-12)_max-content] @max-[360px]:pl-[var(--lyra-space-4)] @max-[360px]:text-[length:var(--lyra-text-size-caption)]";
export const DIFF_LINE_ADD_CLASS =
  "lyra-agents-diff-line-add bg-[color-mix(in_srgb,var(--lyra-status-success)_12%,transparent)] text-[var(--lyra-status-success)] [.lyra-agents-tool-call-body_&]:bg-[color-mix(in_srgb,var(--lyra-status-success)_16%,transparent)]";
export const DIFF_LINE_DEL_CLASS =
  "lyra-agents-diff-line-del bg-[color-mix(in_srgb,var(--lyra-status-error)_12%,transparent)] text-[var(--lyra-status-error)] [.lyra-agents-tool-call-body_&]:bg-[color-mix(in_srgb,var(--lyra-status-error)_16%,transparent)]";
export const DIFF_LINE_CTX_CLASS =
  "lyra-agents-diff-line-ctx text-[var(--lyra-text-secondary)]";
export const DIFF_GUTTER_CLASS =
  "lyra-agents-diff-gutter text-[var(--lyra-text-muted)] text-right pr-[var(--lyra-space-10)] select-none";
export const DIFF_SIGN_CLASS =
  "lyra-agents-diff-sign text-center select-none text-inherit opacity-70";
export const DIFF_TEXT_CLASS = "lyra-agents-diff-text whitespace-pre select-text";
export const diffLineClass = (kind: string): string => {
  if (kind === "add") return `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_ADD_CLASS} lyra-agents-diff-line-add`;
  if (kind === "del") return `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_DEL_CLASS} lyra-agents-diff-line-del`;
  return `${DIFF_LINE_BASE_CLASS} ${DIFF_LINE_CTX_CLASS} lyra-agents-diff-line-ctx`;
};
export const MESSAGE_CONTENT_USER_CLASS =
  "lyra-agents-message-content-user flex-[0_1_auto] flex flex-col items-end w-fit max-w-[75%] min-w-0 @max-[720px]:max-w-[85%]";
export const COLLAPSE_CLASS =
  "lyra-agents-collapse grid grid-rows-[0fr] transition-[grid-template-rows_var(--lyra-motion-panel-layout-duration)_var(--lyra-ease-tick)] data-[open=true]:grid-rows-[1fr] [&[data-open=true]>.lyra-agents-collapse-inner]:opacity-100 [&[data-open=true]>.lyra-agents-collapse-inner]:translate-y-0 motion-reduce:transition-none motion-reduce:transition-none";
export const COLLAPSE_INNER_CLASS =
  "lyra-agents-collapse-inner overflow-hidden min-h-0 opacity-0 -translate-y-[calc(var(--lyra-space-2)*-1)] transition-[opacity_var(--lyra-motion-standard-duration)_var(--lyra-ease-fast)_40ms,transform_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)_40ms]";
export const MESSAGE_CLASS =
  "lyra-agents-message flex gap-[var(--lyra-space-12)] [container-name:lyra-chat] [container-type:inline-size] select-text";
export const MESSAGE_USER_CLASS = "lyra-agents-message-user justify-end";
export const MESSAGE_AGENT_CLASS = "lyra-agents-message-agent items-start";
export const MESSAGE_AGENT_ERROR_CLASS = "lyra-agents-message-agent-error";
export const MESSAGE_BODY_CLASS =
  "lyra-agents-message-body flex-1 flex flex-col gap-[var(--lyra-space-14)] min-w-0";
export const MESSAGE_BODY_ERROR_CLASS =
  "lyra-agents-message-body flex-1 flex flex-col gap-[var(--lyra-space-14)] min-w-0 self-start max-w-[max(var(--lyra-unit-720),calc(100%-var(--lyra-space-64)*2))] gap-[var(--lyra-space-10)] p-[var(--lyra-space-10)_var(--lyra-space-12)] [border:var(--lyra-stroke-thin)_solid_color-mix(in_srgb,var(--lyra-status-error)_36%,var(--lyra-app-border))] rounded-[var(--lyra-radius-8)] bg-[color-mix(in_srgb,var(--lyra-status-error)_8%,var(--lyra-app-surface-bg))] text-[var(--lyra-text-primary)] [&_.lyra-agents-streaming-text]:font-[family-name:var(--lyra-font-mono)] [&_.lyra-agents-streaming-text]:text-[length:var(--lyra-text-size-12)] [&_.lyra-agents-streaming-text]:leading-[var(--lyra-text-line-relaxed)]";
export const MESSAGE_BUBBLE_CLASS =
  "lyra-agents-message-bubble bg-[var(--card)] [border:var(--lyra-stroke-thin)_solid_var(--border)] rounded-[var(--lyra-radius-12)] p-[var(--lyra-space-8)_var(--lyra-space-14)] box-border w-fit max-w-full min-w-0 whitespace-pre-wrap wrap-anywhere text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-body)] tracking-[var(--lyra-text-tracking-wide)] @max-[360px]:p-[var(--lyra-space-6)_var(--lyra-space-10)] @max-[360px]:rounded-[var(--lyra-radius-10)] @max-[360px]:text-[length:var(--lyra-text-size-14)]";
export const MESSAGE_BUBBLE_COLLAPSED_CLASS =
  "lyra-agents-message-bubble-collapsed max-h-[calc(10lh+var(--lyra-space-8)*2)] overflow-hidden [-webkit-mask-image:linear-gradient(to_bottom,var(--lyra-effect-overlay-solid-bg)_calc(100%-1.6lh),transparent_100%)] [mask-image:linear-gradient(to_bottom,var(--lyra-effect-overlay-solid-bg)_calc(100%-1.6lh),transparent_100%)]";
export const MESSAGE_TEXT_BLOCK_CLASS =
  "lyra-agents-message-text-block flex flex-col gap-[var(--lyra-space-6)] select-text";
export const MESSAGE_TEXT_CLASS =
  "lyra-agents-message-text m-0 whitespace-pre-wrap wrap-normal wrap-anywhere @max-[360px]:text-[length:var(--lyra-text-size-14)]";
export const MESSAGE_PROCESS_FOLD_CLASS =
  "lyra-agents-message-process-fold flex flex-col gap-[var(--lyra-space-14)] relative";
export const MESSAGE_PROCESS_FOLD_HEAD_CLASS =
  "lyra-agents-message-process-fold-head flex items-center justify-center gap-[var(--lyra-space-10)] self-stretch w-[calc(100%-var(--lyra-space-24))] mx-[var(--lyra-space-12)] py-[var(--lyra-space-4)] text-[var(--lyra-text-secondary)] [font:inherit] h-auto min-h-0 px-0 border-0 border-transparent rounded-none bg-transparent shadow-none transform-none hover:text-[var(--lyra-text-primary)] hover:bg-transparent hover:border-transparent hover:shadow-none hover:transform-none focus-visible:shadow-none focus-visible:[outline:var(--lyra-stroke-strong)_solid_var(--lyra-app-focus)] focus-visible:outline-offset-[var(--lyra-space-2)] [&:hover_.lyra-agents-message-process-fold-line]:bg-[color-mix(in_srgb,var(--lyra-text-muted)_52%,transparent)] [&:hover_.lyra-agents-message-process-fold-label]:text-[var(--lyra-text-secondary)]";
export const MESSAGE_PROCESS_FOLD_LINE_CLASS =
  "lyra-agents-message-process-fold-line h-[var(--lyra-space-1)] flex-[1_1_var(--lyra-unit-80)] min-w-[var(--lyra-space-32)] rounded-[50%] bg-[color-mix(in_srgb,var(--lyra-app-border)_68%,transparent)] transition-[background_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)]";
export const MESSAGE_PROCESS_FOLD_LABEL_CLASS =
  "lyra-agents-message-process-fold-label flex-none text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-muted)] whitespace-nowrap transition-[color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)]";
export const MESSAGE_PROCESS_FOLD_BODY_CLASS =
  "lyra-agents-message-process-fold-body flex flex-col gap-[var(--lyra-space-14)]";
export const CHANGED_FILES_CLASS =
  "lyra-agents-changed-files w-full min-w-0 overflow-hidden rounded-[var(--lyra-radius-12)] bg-[var(--lyra-agents-composer-shell-bg)] [--lyra-agents-changed-files-row-height:var(--lyra-control-h-28)]";
export const CHANGED_FILES_HEADER_CLASS =
  "lyra-agents-changed-files-header flex items-center justify-between gap-[var(--lyra-space-8)] p-[var(--lyra-space-8)_var(--lyra-space-12)_var(--lyra-space-4)]";
export const CHANGED_FILES_LABEL_CLASS =
  "lyra-agents-changed-files-label text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-body)] font-medium tabular-nums";
export const CHANGED_FILES_TOTALS_CLASS =
  "lyra-agents-changed-files-totals inline-flex items-center gap-[var(--lyra-space-6)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] tabular-nums";
export const CHANGED_FILES_COUNTS_CLASS =
  "lyra-agents-changed-files-counts inline-flex items-center gap-[var(--lyra-space-6)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] tabular-nums";
export const CHANGED_FILES_LIST_CLASS =
  "lyra-agents-changed-files-list flex flex-col overflow-x-hidden overflow-y-auto overscroll-contain snap-y snap-mandatory [scroll-padding-block:0]";
export const CHANGED_FILES_ITEM_CLASS =
  "lyra-agents-changed-files-item flex-none snap-start snap-normal [&.open>.lyra-agents-changed-files-row]:bg-[var(--lyra-app-row-hover-bg)]";
export const CHANGED_FILES_ROW_CLASS =
  "lyra-agents-changed-files-row flex items-center justify-between gap-[var(--lyra-space-12)] w-full min-w-0 h-[var(--lyra-agents-changed-files-row-height)] min-h-[var(--lyra-agents-changed-files-row-height)] px-[var(--lyra-space-12)] box-border border-0 rounded-none bg-transparent shadow-none transform-none text-inherit text-left [&.lyra-ui-button:hover:not(:disabled)]:bg-[var(--lyra-app-row-hover-bg)] [&.lyra-ui-button:active:not(:disabled)]:bg-[var(--lyra-app-row-hover-bg)]";
export const CHANGED_FILES_ICON_CLASS =
  "lyra-agents-changed-files-icon inline-flex shrink-0 items-center justify-center";
export const CHANGED_FILES_MAIN_CLASS =
  "lyra-agents-changed-files-main flex flex-1 min-w-0 items-center gap-[var(--lyra-space-8)]";
export const CHANGED_FILES_PATH_CLASS =
  "lyra-agents-changed-files-path flex flex-1 min-w-0 [direction:ltr] [unicode-bidi:isolate] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-20)]";
export const CHANGED_FILES_DIRECTORY_CLASS =
  "lyra-agents-changed-files-directory text-[var(--lyra-text-secondary)] overflow-hidden text-ellipsis whitespace-nowrap direction-rtl text-left";
export const CHANGED_FILES_FILENAME_CLASS =
  "lyra-agents-changed-files-filename min-w-0 text-[var(--lyra-text-primary)] font-medium overflow-hidden text-ellipsis whitespace-nowrap";
export const CHANGED_FILES_META_CLASS =
  "lyra-agents-changed-files-meta shrink-0 inline-flex items-center gap-[var(--lyra-space-10)]";
export const CHANGED_FILES_CHEVRON_CLASS =
  "lyra-agents-changed-files-chevron inline-flex text-[var(--lyra-text-muted)]";
export const CHANGED_FILES_DIFF_CLASS =
  "lyra-agents-changed-files-diff min-w-0 bg-[color-mix(in_srgb,var(--lyra-app-surface-bg)_88%,var(--lyra-app-border))]";
export const MESSAGE_TIME_CLASS =
  "lyra-agents-message-time relative inline-flex items-center h-[var(--lyra-space-16)] min-w-[var(--lyra-space-44)] mt-[var(--lyra-space-4)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] select-none" +
  " [&>.lyra-agents-time-text]:absolute [&>.lyra-agents-time-copy]:absolute [&>.lyra-agents-time-actions]:absolute" +
  " [&>.lyra-agents-time-text]:transition-[opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)] [&>.lyra-agents-time-copy]:transition-[opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)] [&>.lyra-agents-time-actions]:transition-[opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)]" +
  " [&_.lyra-agents-time-text]:opacity-100" +
  " [&>.lyra-agents-time-copy]:opacity-0 [&>.lyra-agents-time-actions]:opacity-0 [&>.lyra-agents-time-copy]:cursor-pointer [&>.lyra-agents-time-actions]:cursor-pointer [&>.lyra-agents-time-copy]:text-[var(--lyra-text-muted)] [&>.lyra-agents-time-actions]:text-[var(--lyra-text-muted)] [&>.lyra-agents-time-copy]:inline-flex [&>.lyra-agents-time-actions]:inline-flex [&>.lyra-agents-time-copy]:items-center [&>.lyra-agents-time-actions]:items-center [&>.lyra-agents-time-copy]:gap-[var(--lyra-space-3)] [&>.lyra-agents-time-actions]:gap-[var(--lyra-space-3)] [&>.lyra-agents-time-copy]:whitespace-nowrap [&>.lyra-agents-time-actions]:whitespace-nowrap [&>.lyra-agents-time-copy]:transition-[opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),color_var(--lyra-transition-fast)] [&>.lyra-agents-time-actions]:transition-[opacity_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast),color_var(--lyra-transition-fast)]" +
  " [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:static [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:opacity-100 [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:w-[var(--lyra-control-h-24)] [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:h-[var(--lyra-control-h-24)] [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:inline-flex [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:items-center [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:justify-center [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:p-0 [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:border-0 [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:rounded-none [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:bg-transparent [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:text-[var(--lyra-text-secondary)] [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:shadow-none [&_.lyra-agents-time-actions_.lyra-agents-time-copy]:transition-[color_var(--lyra-transition-fast),opacity_var(--lyra-transition-fast)]" +
  " [.lyra-agents-message:hover_&_.lyra-agents-time-text]:opacity-0" +
  " [.lyra-agents-message:hover_&_.lyra-agents-time-copy]:opacity-100" +
  " [.lyra-agents-message:hover_&_.lyra-agents-time-actions]:opacity-100" +
  " [.lyra-agents-message:hover_&_.lyra-agents-time-copy:hover]:text-[var(--lyra-text-primary)]" +
  " [.lyra-agents-message:hover_&_.lyra-agents-time-actions_span:hover]:text-[var(--lyra-text-primary)]" +
  " [.lyra-agents-message:hover_&_.lyra-agents-time-actions_.lyra-agents-time-copy:hover]:bg-transparent [.lyra-agents-message:hover_&_.lyra-agents-time-actions_.lyra-agents-time-copy:hover]:border-transparent" +
  " [&_.lyra-agents-time-copy[aria-disabled=true]]:cursor-not-allowed [&_.lyra-agents-time-copy[aria-disabled=true]]:opacity-[var(--lyra-opacity-disabled)]";
export const MESSAGE_TIME_USER_CLASS =
  "lyra-agents-message-time-user self-end [&>.lyra-agents-time-text]:right-0 [&>.lyra-agents-time-copy]:right-0 [&>.lyra-agents-time-actions]:right-0";
export const MESSAGE_TIME_AGENT_CLASS =
  "lyra-agents-message-time-agent self-start [&>.lyra-agents-time-text]:left-0 [&>.lyra-agents-time-copy]:left-0 [&>.lyra-agents-time-actions]:left-0";
export const MESSAGE_ROLLBACK_POPOVER_CLASS =
  "lyra-agents-message-rollback-popover self-end w-[min(var(--lyra-unit-320),100%)] mt-[var(--lyra-space-8)] p-[var(--lyra-space-12)] [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-border)] rounded-[var(--lyra-radius-10)] bg-[var(--lyra-app-popover-bg)] shadow-[var(--lyra-shadow-elevated-md)] text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-normal)] z-[2]";
export const MESSAGE_ROLLBACK_TITLE_CLASS =
  "lyra-agents-message-rollback-title text-[length:var(--lyra-text-size-body)] font-semibold text-[var(--lyra-text-primary)]";
export const MESSAGE_ROLLBACK_BODY_CLASS =
  "lyra-agents-message-rollback-body mt-[var(--lyra-space-4)] text-[var(--lyra-text-secondary)]";
export const MESSAGE_ROLLBACK_FILES_CLASS =
  "lyra-agents-message-rollback-files flex flex-col gap-[var(--lyra-space-3)] max-h-[var(--lyra-unit-88)] overflow-hidden mt-[var(--lyra-space-8)] text-[var(--lyra-text-muted)] font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-caption)]";
export const MESSAGE_ROLLBACK_ACTIONS_CLASS =
  "lyra-agents-message-rollback-actions flex justify-end gap-[var(--lyra-space-6)] mt-[var(--lyra-space-10)]";
export const BRAILLE_SPINNER_CLASS =
  "lyra-agents-braille-spinner text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-muted)] font-[family-name:monospace] tracking-normal";
export const SERVICE_STATUS_DOTS_CLASS =
  "lyra-agents-service-status-dots inline-flex items-center gap-[var(--lyra-space-3)] h-[var(--lyra-space-16)] text-[var(--lyra-text-muted)] [&_span]:w-[var(--lyra-space-3)] [&_span]:h-[var(--lyra-space-3)] [&_span]:rounded-[var(--lyra-radius-pill)] [&_span]:bg-current [&_span]:opacity-[0.38] [&_span]:animate-[lyra-agents-service-status-dot_1.15s_var(--lyra-ease-standard)_infinite] [&_span:nth-child(2)]:[animation-delay:140ms] [&_span:nth-child(3)]:[animation-delay:280ms]";
