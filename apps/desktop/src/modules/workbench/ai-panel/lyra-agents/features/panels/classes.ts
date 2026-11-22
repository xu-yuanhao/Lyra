export const PANEL_BASE_CLASS =
  "lyra-agents-decision-panel pointer-events-auto self-center bg-[color-mix(in_srgb,var(--lyra-app-surface-strong-bg)_92%,var(--lyra-app-surface-bg)_8%)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] border-b-0 rounded-t-[var(--lyra-radius-14)] px-[var(--lyra-space-14)] shadow-none flex flex-col mb-[calc(var(--lyra-space-1)*-1)] animate-[decision-in_var(--lyra-motion-panel-layout-duration)_var(--lyra-ease-tick)_both]";
export const PANEL_HEADER_CLASS =
  "lyra-agents-decision-header flex items-start justify-between gap-[var(--lyra-space-8)] min-h-[var(--lyra-space-34)] shrink-0";
export const PANEL_ICON_CLASS =
  "lyra-agents-decision-icon flex items-center text-[var(--lyra-text-secondary)] shrink-0 h-[var(--lyra-space-34)]";
export const PANEL_TITLE_BLOCK_CLASS =
  "lyra-agents-decision-title-block flex-1 min-w-0 py-[var(--lyra-unit-7)] pb-[var(--lyra-space-5)]";
export const PANEL_QUESTION_CLASS =
  "lyra-agents-decision-question whitespace-normal overflow-visible text-clip wrap-anywhere m-0 text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-primary)] leading-[var(--lyra-text-line-snug)]";
export const PANEL_PERMISSION_QUESTION_CLASS = PANEL_QUESTION_CLASS + " flex-1 min-w-0 leading-[var(--lyra-text-line-30)]";
export const PANEL_DETAIL_CLASS =
  "lyra-agents-decision-detail mt-[var(--lyra-space-2)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-snug)] wrap-anywhere";
export const PLAN_REVIEW_PANEL_CLASS = "lyra-agents-plan-review-panel gap-[var(--lyra-space-8)] pb-[var(--lyra-space-10)]";
export const PLAN_REVIEW_ACTIONS_CLASS =
  "lyra-agents-plan-review-actions flex flex-wrap justify-end gap-[var(--lyra-space-6)]";
export const PLAN_REVIEW_BTN_CLASS =
  "lyra-agents-plan-review-btn min-h-[var(--lyra-space-28)] inline-flex items-center gap-[var(--lyra-space-5)] text-[var(--lyra-text-secondary)] bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_52%,transparent)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_36%,transparent)] rounded-[var(--lyra-radius-8)] hover:not-disabled:text-[var(--lyra-text-primary)] hover:not-disabled:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_82%,transparent)]";
export const PLAN_REVIEW_BTN_APPROVE_CLASS =
  "lyra-agents-plan-review-btn-approve text-[var(--lyra-status-success)] border-[color-mix(in_srgb,var(--lyra-status-success)_42%,transparent)] bg-[color-mix(in_srgb,var(--lyra-status-success)_10%,transparent)]";
export const PLAN_REVIEW_BTN_SET_ASIDE_CLASS =
  "lyra-agents-plan-review-btn-set-aside hover:not-disabled:text-[var(--lyra-text-primary)] hover:not-disabled:border-[color-mix(in_srgb,var(--lyra-app-border)_64%,transparent)]";
export const PANEL_NAV_CLASS =
  "lyra-agents-decision-nav flex items-center gap-[var(--lyra-space-2)] shrink-0 h-[var(--lyra-space-34)]";
export const PANEL_COUNTER_CLASS =
  "lyra-agents-decision-counter font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-caption)] text-[var(--lyra-text-muted)] shrink-0";
export const PANEL_BODY_CLASS =
  "lyra-agents-decision-body overflow-hidden overflow-y-auto [contain:layout_style] [will-change:max-height,opacity]";
export const PANEL_BODY_CONTENT_CLASS =
  "lyra-agents-decision-body-content flex flex-col gap-[var(--lyra-space-8)] py-[var(--lyra-space-2)] pb-[var(--lyra-space-12)] translate-y-[calc((1-var(--panel-progress,1))*calc(var(--lyra-space-10)*-1))] transition-transform duration-[120ms] ease-linear";
export const PANEL_OPTIONS_CLASS =
  "lyra-agents-decision-options flex flex-wrap gap-[var(--lyra-space-5)]";
const PANEL_OPTION_BASE =
  "lyra-agents-decision-option min-h-[var(--lyra-space-30)] px-[var(--lyra-space-10)] py-[var(--lyra-space-4)] font-inherit text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-secondary)] bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_58%,transparent)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_34%,transparent)] rounded-[var(--lyra-radius-8)] cursor-pointer inline-flex items-center justify-center gap-[var(--lyra-space-6)] min-w-0 max-w-full text-left transition-[background,border-color,color] duration-[var(--lyra-motion-fast)] hover:bg-[color-mix(in_srgb,var(--lyra-app-row-hover-bg)_82%,transparent)] hover:border-[color-mix(in_srgb,var(--lyra-app-border)_52%,transparent)] hover:text-[var(--lyra-text-primary)] active:bg-[color-mix(in_srgb,var(--lyra-app-row-active-bg)_76%,transparent)] active:border-[color-mix(in_srgb,var(--lyra-app-focus)_46%,transparent)] active:text-[var(--lyra-text-primary)]";
export const PANEL_OPTION_CLASS = PANEL_OPTION_BASE;
export const PANEL_OPTION_CUSTOM_CLASS = PANEL_OPTION_BASE + " border-dashed items-center";
export const PANEL_OPTION_LABEL_CLASS =
  "lyra-agents-decision-option-label min-w-0 leading-[var(--lyra-text-line-tight)] wrap-anywhere";
export const PANEL_OPTION_INFO_CLASS =
  "lyra-agents-decision-option-info w-[var(--lyra-space-16)] h-[var(--lyra-space-16)] min-w-[var(--lyra-space-16)] inline-flex items-center justify-center rounded-full text-[var(--lyra-text-muted)] opacity-0 transition-[background,color,opacity] duration-[var(--lyra-motion-fast)] [.lyra-agents-decision-option:hover_&]:bg-[color-mix(in_srgb,var(--lyra-app-border)_18%,transparent)] [.lyra-agents-decision-option:hover_&]:text-[var(--lyra-text-secondary)] [.lyra-agents-decision-option:hover_&]:opacity-100 [.lyra-agents-decision-option:focus-visible_&]:bg-[color-mix(in_srgb,var(--lyra-app-border)_18%,transparent)] [.lyra-agents-decision-option:focus-visible_&]:text-[var(--lyra-text-secondary)] [.lyra-agents-decision-option:focus-visible_&]:opacity-100 [.lyra-agents-decision-option.active_&]:bg-[color-mix(in_srgb,var(--lyra-app-border)_18%,transparent)] [.lyra-agents-decision-option.active_&]:text-[var(--lyra-text-secondary)] [.lyra-agents-decision-option.active_&]:opacity-100 hover:bg-[color-mix(in_srgb,var(--lyra-app-border)_18%,transparent)] hover:text-[var(--lyra-text-secondary)] hover:opacity-100";
export const PANEL_OPTION_TOOLTIP_CLASS =
  "lyra-agents-decision-option-tooltip max-w-[min(var(--lyra-unit-260),calc(100vw-var(--lyra-space-32)))] text-[var(--lyra-text-secondary)]";
export const PANEL_CUSTOM_INPUT_CLASS =
  "lyra-agents-decision-custom-input w-full px-[var(--lyra-space-10)] py-[var(--lyra-space-6)] font-inherit text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-primary)] bg-[color-mix(in_srgb,var(--lyra-app-surface-strong-bg)_86%,transparent)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] rounded-[var(--lyra-radius-8)] outline-none transition-colors duration-[var(--lyra-motion-fast-duration)] focus:border-[color-mix(in_srgb,var(--lyra-app-focus)_58%,transparent)] placeholder:text-[var(--lyra-text-muted)]";
export const PANEL_ANSWER_ROW_CLASS =
  "lyra-agents-decision-answer-row flex items-center gap-[var(--lyra-space-8)] justify-end";
export const PANEL_ANSWER_SPACER_CLASS = "lyra-agents-decision-answer-spacer flex-1 min-w-0";
export const PANEL_NAV_BTN_CLASS =
  "lyra-agents-decision-nav-btn w-[var(--lyra-space-24)] h-[var(--lyra-space-24)] inline-flex items-center justify-center bg-transparent border-0 rounded-[var(--lyra-radius-4)] text-[var(--lyra-text-muted)] cursor-pointer p-0 transition-colors duration-[var(--lyra-motion-fast)] hover:not-disabled:text-[var(--lyra-text-primary)] disabled:opacity-[var(--lyra-opacity-disabled)] disabled:cursor-default";
export const PANEL_SUBMIT_CLASS =
  "lyra-agents-decision-submit flex-none w-[var(--lyra-space-28)] min-w-[var(--lyra-space-28)] h-[var(--lyra-space-28)] min-h-[var(--lyra-space-28)] aspect-square inline-flex items-center justify-center bg-[var(--lyra-app-primary-button)] text-[var(--lyra-app-primary-button-fg)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-primary-button)_80%,transparent)] rounded-full p-0 cursor-pointer box-border leading-[var(--lyra-text-line-collapse)] transition-[background,transform] duration-[var(--lyra-motion-fast)] hover:not-disabled:bg-[color-mix(in_srgb,var(--lyra-app-primary-button)_88%,var(--lyra-app-input-focus-bg))] active:not-disabled:scale-[0.92] disabled:bg-[var(--lyra-app-input-bg)] disabled:text-[var(--lyra-text-muted)] disabled:border-[var(--lyra-app-input-border)] disabled:cursor-default";

export const PERMISSION_PANEL_CLASS = "lyra-agents-permission-panel w-auto";
export const USER_GATE_HOST_CLASS =
  "lyra-agents-user-gate-host flex flex-col items-center self-stretch w-full pointer-events-none [&>.lyra-agents-decision-panel]:w-[calc(100%-var(--lyra-space-48))] [&>.lyra-agents-decision-panel:last-of-type]:w-[calc(100%-var(--lyra-space-24))]";
export const PERMISSION_ICON_DANGEROUS_CLASS = "lyra-agents-permission-icon-dangerous text-[var(--lyra-status-error)]";
export const PERMISSION_CMD_CLASS =
  "lyra-agents-permission-cmd font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-text-size-12)] text-[var(--lyra-text-secondary)] bg-[var(--lyra-effect-glass-soft)] px-[var(--lyra-space-6)] py-[var(--lyra-space-1)] rounded-[var(--lyra-radius-4)] ml-[var(--lyra-space-4)]";
export const PERMISSION_ACTIONS_CLASS =
  "lyra-agents-permission-actions flex items-center justify-end gap-[var(--lyra-space-8)]";
export const PERMISSION_BTN_CLASS =
  "lyra-agents-permission-btn inline-flex items-center justify-center w-[var(--lyra-space-24)] h-[var(--lyra-space-24)] p-0 font-inherit border-0 rounded-[var(--lyra-radius-4)] cursor-pointer bg-transparent transition-[color,transform] duration-[var(--lyra-motion-fast)] active:scale-[0.96]";
export const PERMISSION_BTN_APPROVE_CLASS =
  "lyra-agents-permission-btn-approve text-[var(--lyra-status-success)] hover:text-[var(--lyra-effect-permission-approve-hover)]";
export const PERMISSION_BTN_DENY_CLASS =
  "lyra-agents-permission-btn-deny text-[var(--lyra-status-error)] hover:text-[var(--lyra-effect-permission-deny-hover)]";

export const DEBUG_PANEL_CLASS =
  "lyra-agents-debug-panel absolute top-[var(--lyra-space-10)] right-[var(--lyra-space-10)] z-[var(--lyra-z-debug-panel)] flex flex-col items-end gap-[var(--lyra-space-6)]";
export const DEBUG_TOGGLE_CLASS =
  "lyra-agents-debug-toggle w-[var(--lyra-space-30)] h-[var(--lyra-space-30)] flex items-center justify-center bg-[var(--lyra-app-row-hover-bg)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] rounded-[var(--lyra-radius-8)] text-[var(--lyra-text-muted)] cursor-pointer transition-[color,background] duration-[var(--lyra-motion-fast)] hover:text-[var(--lyra-text-primary)] hover:bg-[var(--lyra-app-row-hover-bg)]";
export const DEBUG_BODY_CLASS =
  "lyra-agents-debug-body bg-[var(--lyra-effect-debug-panel-bg)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] rounded-[var(--lyra-radius-10)] px-[var(--lyra-space-14)] py-[var(--lyra-space-10)] flex flex-col gap-[var(--lyra-space-8)] min-w-[var(--lyra-unit-160)] shadow-none";
export const DEBUG_TITLE_CLASS =
  "lyra-agents-debug-title text-[length:var(--lyra-text-size-caption)] font-semibold text-[var(--lyra-text-muted)] uppercase tracking-[var(--lyra-unit-0-5)]";
export const DEBUG_ROW_CLASS =
  "lyra-agents-debug-row flex items-center gap-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-body)] text-[var(--lyra-text-secondary)] cursor-pointer [&_input[type='checkbox']]:w-[var(--lyra-space-14)] [&_input[type='checkbox']]:h-[var(--lyra-space-14)] [&_input[type='checkbox']]:accent-[var(--lyra-text-accent)]";
