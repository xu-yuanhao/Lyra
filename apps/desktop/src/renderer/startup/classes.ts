// Tailwind class constants for startup/installer/uninstaller chrome migrated
// from startup.scss. Hook classes (lyra-*) are preserved for runtime selectors
// and tests; conditional state hooks (is-*) stay as plain class tokens.

const STARTUP_THEME_TRANSITION =
  "transition-[background-color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),border-color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),box-shadow_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),fill_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),stroke_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast)]";

export const STARTUP_ROOT_CLASS =
  "lyra-startup-root box-border w-full min-h-[100dvh] h-[100dvh] relative overflow-hidden grid place-items-center text-[var(--lyra-text-primary)] bg-[var(--lyra-app-material-shell-bg)] font-[family-name:var(--lyra-font-ui)] select-none [-webkit-user-select:none] [-webkit-user-drag:none] [-webkit-app-region:drag] [app-region:drag] [backdrop-filter:var(--lyra-app-material-blur-lg)_var(--lyra-app-material-saturate)] [-webkit-backdrop-filter:var(--lyra-app-material-blur-lg)_var(--lyra-app-material-saturate)] transition-[background-color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast),color_var(--lyra-motion-slow-duration)_var(--lyra-ease-fast)] p-[clamp(var(--lyra-space-20),3vh,var(--lyra-space-56))_clamp(var(--lyra-space-28),8vw,var(--lyra-unit-96))] max-[35em]:p-[var(--lyra-space-24)] " +
  "[&_button]:[-webkit-app-region:no-drag] [&_button]:[app-region:no-drag] [&_button]:select-none [&_button]:[-webkit-user-select:none] " +
  "[&_a]:[-webkit-app-region:no-drag] [&_a]:[app-region:no-drag] [&_a]:select-none [&_a]:[-webkit-user-select:none] " +
  "[&_input]:[-webkit-app-region:no-drag] [&_input]:[app-region:no-drag] [&_input]:select-none [&_input]:[-webkit-user-select:none] " +
  "[&_textarea]:[-webkit-app-region:no-drag] [&_textarea]:[app-region:no-drag] [&_textarea]:select-none [&_textarea]:[-webkit-user-select:none] " +
  "[&_select]:[-webkit-app-region:no-drag] [&_select]:[app-region:no-drag] [&_select]:select-none [&_select]:[-webkit-user-select:none] " +
  '[&_[role="button"]]:[-webkit-app-region:no-drag] [&_[role="button"]]:[app-region:no-drag] [&_[role="button"]]:select-none [&_[role="button"]]:[-webkit-user-select:none] ' +
  `[&_h1]:${STARTUP_THEME_TRANSITION} [&_p]:${STARTUP_THEME_TRANSITION} [&_button]:${STARTUP_THEME_TRANSITION} ` +
  `[&_.lyra-startup-choice]:${STARTUP_THEME_TRANSITION} [&_.lyra-startup-theme-card]:${STARTUP_THEME_TRANSITION} ` +
  `[&_.lyra-startup-theme-preview]:${STARTUP_THEME_TRANSITION} [&_.lyra-startup-theme-card-label]:${STARTUP_THEME_TRANSITION} ` +
  `[&_.lyra-startup-avatar-fallback]:${STARTUP_THEME_TRANSITION} ` +
  "motion-reduce:transition-none " +
  "motion-reduce:[&_h1]:transition-none motion-reduce:[&_p]:transition-none motion-reduce:[&_button]:transition-none " +
  "motion-reduce:[&_.lyra-startup-choice]:transition-none motion-reduce:[&_.lyra-startup-theme-card]:transition-none " +
  "motion-reduce:[&_.lyra-startup-theme-preview]:transition-none motion-reduce:[&_.lyra-startup-theme-card-label]:transition-none " +
  "motion-reduce:[&_.lyra-startup-avatar-fallback]:transition-none";

export const STARTUP_SURFACE_CLASS =
  "lyra-startup-surface w-[min(100%,var(--lyra-unit-520))] min-h-[min(var(--lyra-unit-640),calc(100dvh_-_var(--lyra-space-40)))] grid place-items-center justify-self-center mx-auto max-[35em]:min-h-[calc(100vh_-_var(--lyra-space-48))]";

export const STARTUP_SURFACE_INSTALLER_CLASS =
  "lyra-installer-surface [.lyra-installer-shell_&]:w-[min(100%,78vw)]";

export const STARTUP_HERO_BASE_CLASS =
  "w-[min(100%,var(--lyra-unit-340))] flex flex-col items-stretch text-center";

export const STARTUP_HERO_CLASS = `lyra-startup-hero ${STARTUP_HERO_BASE_CLASS} items-center justify-self-center [&_h1]:m-0 [&_h1]:text-[length:var(--lyra-text-size-24)] [&_h1]:leading-[var(--lyra-text-line-30)] [&_h1]:font-semibold`;

export const STARTUP_PANEL_CLASS =
  `lyra-startup-panel ${STARTUP_HERO_BASE_CLASS} gap-[var(--lyra-space-18)] text-left [&_h1]:m-0 [&_h1]:text-[length:var(--lyra-text-size-24)] [&_h1]:leading-[var(--lyra-text-line-30)] [&_h1]:font-semibold [&_h1]:text-center [&_h1]:mt-[var(--lyra-space-8)] [&_h1]:mb-[var(--lyra-space-4)] [&>.lyra-ui-button]:w-full [&>.lyra-ui-button]:mt-[var(--lyra-space-4)]`;

export const STARTUP_WELCOME_CLASS =
  `lyra-startup-welcome ${STARTUP_HERO_BASE_CLASS} items-center gap-[var(--lyra-space-8)] [&_h1]:m-0 [&_h1]:text-[length:var(--lyra-text-size-24)] [&_h1]:leading-[var(--lyra-text-line-30)] [&_h1]:font-semibold [&_p]:mt-[var(--lyra-space-8)] [&_p]:text-[var(--lyra-text-secondary)] [&_p]:text-[length:var(--lyra-text-size-14)] [&_.lyra-ui-button]:w-full [&_.lyra-ui-button]:mt-[var(--lyra-unit-26)]`;

export const STARTUP_STATUS_CLASS =
  `lyra-startup-status ${STARTUP_HERO_BASE_CLASS} items-center gap-[var(--lyra-space-12)] [&_p]:m-0 [&_p]:text-[var(--lyra-text-secondary)] [&_p]:text-[length:var(--lyra-text-size-14)]`;

export const STARTUP_BRAND_CLASS =
  "lyra-startup-brand [-webkit-app-region:no-drag] [app-region:no-drag] [font-family:'Zen_Dots',var(--lyra-font-ui)] text-[length:var(--lyra-text-size-24)]! leading-[calc(var(--lyra-text-line-30)_-_var(--lyra-stroke-thin))]! font-normal! tracking-normal [.lyra-uninstaller-hero_&]:mt-0";

export const STARTUP_LOGO_WRAP_CLASS =
  "lyra-startup-logo-wrap [-webkit-app-region:no-drag] [app-region:no-drag] w-[min(100%,var(--lyra-unit-280))] min-h-[var(--lyra-unit-220)] grid place-items-center mb-[var(--lyra-space-12)] [.lyra-uninstaller-hero_&]:mb-[var(--lyra-space-16)]";

export const STARTUP_ASCII_LOGO_CLASS =
  "lyra-startup-ascii-logo m-0 block w-max max-w-full h-auto font-[family-name:var(--lyra-font-mono)] text-[length:var(--lyra-space-4)] font-normal leading-[var(--lyra-text-line-display)] whitespace-pre [--lyra-logo-wave-trough:var(--lyra-app-surface-bg)] [--lyra-logo-wave-mid:color-mix(in_srgb,var(--lyra-text-muted)_60%,transparent)] [--lyra-logo-wave-crest:var(--lyra-text-primary)] [background:linear-gradient(100deg,var(--lyra-logo-wave-trough)_0%,var(--lyra-logo-wave-mid)_12.5%,var(--lyra-logo-wave-crest)_25%,var(--lyra-logo-wave-mid)_37.5%,var(--lyra-logo-wave-trough)_50%,var(--lyra-logo-wave-mid)_62.5%,var(--lyra-logo-wave-crest)_75%,var(--lyra-logo-wave-mid)_87.5%,var(--lyra-logo-wave-trough)_100%)] [background-size:200%_100%] [-webkit-background-clip:text] [background-clip:text] [-webkit-text-fill-color:transparent] [color:transparent] animate-[lyra-logo-wave-sweep_2200ms_linear_infinite] motion-reduce:animate-none motion-reduce:[background:none] motion-reduce:[-webkit-text-fill-color:var(--lyra-text-primary)] motion-reduce:text-[var(--lyra-text-primary)]";

export const STARTUP_TAGLINE_CLASS =
  "lyra-startup-tagline relative [-webkit-app-region:no-drag] [app-region:no-drag] w-[min(100%,calc(var(--lyra-unit-340)_+_var(--lyra-space-16)))] [flex:0_0_var(--lyra-control-h-34)] h-[var(--lyra-control-h-34)] mt-[var(--lyra-space-8)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-title-md)] leading-[var(--lyra-text-line-24)] font-medium cursor-default overflow-hidden whitespace-nowrap [mask-image:linear-gradient(90deg,transparent_0,var(--lyra-effect-overlay-solid-bg)_var(--lyra-space-18),var(--lyra-effect-overlay-solid-bg)_calc(100%_-_var(--lyra-space-18)),transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0,var(--lyra-effect-overlay-solid-bg)_var(--lyra-space-18),var(--lyra-effect-overlay-solid-bg)_calc(100%_-_var(--lyra-space-18)),transparent_100%)] [&.is-overflowing_.lyra-startup-tagline-track]:left-0 [&.is-overflowing_.lyra-startup-tagline-track]:translate-x-0 [&.is-overflowing_.lyra-startup-tagline-track]:animate-[lyra-startup-tagline-marquee_16s_linear_infinite] motion-reduce:[&.is-overflowing_.lyra-startup-tagline-track]:animate-none [.lyra-uninstaller-hero_&]:mt-[var(--lyra-space-12)]";

export const STARTUP_TAGLINE_TRACK_CLASS =
  "lyra-startup-tagline-track absolute inset-y-[var(--lyra-space-5)] left-1/2 inline-flex items-center w-max min-w-0 gap-[var(--lyra-space-32)] whitespace-nowrap -translate-x-1/2";

export const STARTUP_TAGLINE_COPY_CLASS =
  "lyra-startup-tagline-copy inline-block blur-0 motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:blur-none motion-reduce:transform-none";

export const STARTUP_TAGLINE_CHARACTER_CLASS =
  "lyra-startup-tagline-character inline-block opacity-0 blur-[var(--lyra-space-10)] translate-y-[var(--lyra-unit-7)] animate-[lyra-startup-copy-character-in_820ms_var(--lyra-ease-tick)_both] [animation-delay:var(--lyra-startup-copy-delay)] motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:blur-none motion-reduce:transform-none";

export const STARTUP_PREFERENCE_TITLE_CLASS =
  "lyra-startup-preference-title relative w-full h-[var(--lyra-control-h-34)] min-h-[var(--lyra-control-h-34)] mt-[var(--lyra-space-8)] mb-[var(--lyra-space-4)] overflow-hidden text-center whitespace-nowrap [mask-image:linear-gradient(90deg,transparent_0,var(--lyra-effect-overlay-solid-bg)_var(--lyra-space-18),var(--lyra-effect-overlay-solid-bg)_calc(100%_-_var(--lyra-space-18)),transparent_100%)] [-webkit-mask-image:linear-gradient(90deg,transparent_0,var(--lyra-effect-overlay-solid-bg)_var(--lyra-space-18),var(--lyra-effect-overlay-solid-bg)_calc(100%_-_var(--lyra-space-18)),transparent_100%)] [&.is-overflowing_.lyra-startup-preference-title-track]:left-0 [&.is-overflowing_.lyra-startup-preference-title-track]:translate-x-0 [&.is-overflowing_.lyra-startup-preference-title-track]:animate-[lyra-startup-preference-title-marquee_16s_linear_infinite] motion-reduce:[&.is-overflowing_.lyra-startup-preference-title-track]:animate-none";

export const STARTUP_PREFERENCE_TITLE_TRACK_CLASS =
  "lyra-startup-preference-title-track absolute inset-y-0 left-1/2 inline-flex items-center w-max min-w-0 gap-[var(--lyra-space-32)] whitespace-nowrap -translate-x-1/2";

export const STARTUP_ACTIONS_CLASS =
  "lyra-startup-actions w-full grid gap-[var(--lyra-space-8)] mt-[var(--lyra-space-34)] [&_.lyra-ui-button]:w-full " +
  "[&_.lyra-ui-button:nth-child(2)]:text-[var(--lyra-text-primary)] [&_.lyra-ui-button:nth-child(2)]:bg-[var(--lyra-startup-signup-bg)] [&_.lyra-ui-button:nth-child(2)]:border-0 [&_.lyra-ui-button:nth-child(2)]:shadow-none hover:[&_.lyra-ui-button:nth-child(2)]:bg-[var(--lyra-startup-signup-hover-bg)]";

export const STARTUP_LOGIN_BUTTON_CLASS = "lyra-startup-login-button relative";

export const STARTUP_LOGIN_AVATAR_BASE_CLASS =
  "w-[var(--lyra-icon-size-20)] h-[var(--lyra-icon-size-20)] rounded-full flex-none";

export const STARTUP_LOGIN_AVATAR_CLASS =
  `lyra-startup-login-avatar ${STARTUP_LOGIN_AVATAR_BASE_CLASS} absolute left-[var(--lyra-space-14)] top-1/2 grid place-items-center overflow-hidden -translate-y-1/2`;

export const STARTUP_LOGIN_AVATAR_IMAGE_CLASS =
  `${STARTUP_LOGIN_AVATAR_BASE_CLASS} block object-cover`;

export const STARTUP_LOGIN_AVATAR_FALLBACK_CLASS =
  `${STARTUP_LOGIN_AVATAR_BASE_CLASS} grid place-items-center text-current bg-[color-mix(in_srgb,currentColor_14%,transparent)] text-[length:var(--lyra-text-size-caption)] font-semibold`;

export const STARTUP_LOCAL_CLASS =
  "lyra-startup-local border-0 bg-transparent text-[var(--lyra-text-muted)] cursor-pointer font-[inherit] mt-[var(--lyra-space-16)] text-[length:var(--lyra-text-size-12)] hover:text-[var(--lyra-text-primary)]";

export const STARTUP_BACK_CLASS =
  "lyra-startup-back inline-flex items-center gap-[var(--lyra-space-6)] text-[length:var(--lyra-text-size-12)] self-start border-0 bg-transparent text-[var(--lyra-text-muted)] cursor-pointer font-[inherit] hover:text-[var(--lyra-text-primary)]";

export const STARTUP_LEGAL_BUTTON_CLASS =
  "border-0 bg-transparent text-[var(--lyra-text-muted)] cursor-pointer font-[inherit] inline-flex items-center gap-[var(--lyra-space-4)] hover:text-[var(--lyra-text-primary)]";

export const STARTUP_LEGAL_CLASS =
  "lyra-startup-legal flex gap-[var(--lyra-space-16)] mt-[var(--lyra-unit-38)] text-[length:var(--lyra-text-size-caption)]";

export const STARTUP_LEGAL_LINKS_CLASS = "lyra-startup-legal-links justify-center";

export const STARTUP_LEGAL_CONSENT_CLASS =
  "lyra-startup-legal-consent max-w-[var(--lyra-unit-640)] gap-[var(--lyra-space-22)]";

export const STARTUP_LEGAL_DESCRIPTION_CLASS =
  "lyra-startup-legal-description max-w-[var(--lyra-unit-560)] m-0 text-[var(--app-text-muted)] leading-[var(--lyra-text-line-loose)] text-center";

export const STARTUP_LEGAL_CHECK_CLASS =
  "lyra-startup-legal-check flex max-w-[var(--lyra-unit-560)] gap-[var(--lyra-space-10)] items-start text-[var(--app-text-primary)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-relaxed)] cursor-pointer [&:has([data-slot=checkbox]:disabled)]:cursor-default [&:has([data-slot=checkbox]:disabled)]:opacity-[var(--lyra-opacity-disabled)]";

export const STARTUP_ERROR_CLASS =
  "lyra-startup-error max-w-full mx-0! mb-0! mt-[var(--lyra-space-14)]! text-[var(--lyra-status-error)]! text-[length:var(--lyra-text-size-12)]! wrap-anywhere [.lyra-uninstaller-hero_&]:mt-[var(--lyra-space-12)]";

export const STARTUP_AUTH_COPY_CLASS =
  "lyra-startup-auth-copy w-full max-w-full min-h-[var(--lyra-control-h-24)] p-0 border-0 bg-transparent text-[var(--lyra-text-secondary)] font-[inherit] cursor-pointer overflow-hidden disabled:cursor-default [&_.lyra-startup-tagline-copy]:inline-flex [&_.lyra-startup-tagline-copy]:whitespace-nowrap";

export const STARTUP_CANCEL_CLASS = "lyra-startup-cancel self-end mt-0 whitespace-nowrap";

export const STARTUP_AVATAR_BASE_CLASS =
  "w-[var(--lyra-unit-76)] h-[var(--lyra-unit-76)] rounded-full";

export const STARTUP_AVATAR_CLASS = `${STARTUP_AVATAR_BASE_CLASS} object-cover`;

export const STARTUP_AVATAR_FALLBACK_CLASS =
  `${STARTUP_AVATAR_BASE_CLASS} grid place-items-center text-[var(--lyra-text-primary)] bg-[var(--lyra-app-surface-bg)] [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-border)] text-[length:var(--lyra-text-size-24)] font-semibold`;

export const STARTUP_CHOICE_LIST_CLASS =
  "lyra-startup-choice-list grid gap-[var(--lyra-space-8)]";

export const STARTUP_CHOICE_CLASS =
  "lyra-startup-choice min-h-[var(--lyra-space-44)] px-[var(--lyra-space-14)] flex items-center justify-between rounded-[var(--lyra-radius-8)] font-[inherit] [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-border)] bg-[var(--lyra-app-surface-bg)] text-[var(--lyra-text-primary)] cursor-pointer hover:border-[var(--lyra-app-primary-button)] [&.is-selected]:border-[var(--lyra-app-primary-button)] [&.is-selected]:[box-shadow:0_0_0_var(--lyra-stroke-thin)_var(--lyra-app-primary-button)]";

export const STARTUP_THEME_GRID_CLASS =
  "lyra-startup-theme-grid grid grid-cols-3 gap-[var(--lyra-space-8)]";

export const STARTUP_THEME_CARD_CLASS =
  "lyra-startup-theme-card overflow-hidden p-[var(--lyra-space-6)] rounded-[var(--lyra-radius-8)] text-left [border:var(--lyra-stroke-thin)_solid_var(--lyra-app-border)] bg-[var(--lyra-app-surface-bg)] text-[var(--lyra-text-primary)] cursor-pointer hover:border-[var(--lyra-app-primary-button)] [&.is-selected]:border-[var(--lyra-app-primary-button)] [&.is-selected]:[box-shadow:0_0_0_var(--lyra-stroke-thin)_var(--lyra-app-primary-button)]";

export const STARTUP_THEME_PREVIEW_BASE_CLASS =
  "lyra-startup-theme-preview block aspect-[1.25] overflow-hidden rounded-[var(--lyra-radius-6)] bg-[var(--lyra-startup-theme-preview-light-bg)]";

export const STARTUP_THEME_PREVIEW_DARK_CLASS =
  "lyra-startup-theme-preview-dark bg-[var(--lyra-startup-theme-preview-dark-bg)]";

export const STARTUP_THEME_PREVIEW_SYSTEM_CLASS =
  "lyra-startup-theme-preview-system [background:linear-gradient(135deg,var(--lyra-startup-theme-preview-light-bg)_0_50%,var(--lyra-startup-theme-preview-dark-bg)_50%_100%)]";

export const STARTUP_PREVIEW_BAR_CLASS =
  "lyra-startup-preview-bar block h-[16%] bg-[var(--lyra-startup-theme-preview-bar-bg)]";

export const STARTUP_PREVIEW_BODY_CLASS =
  "lyra-startup-preview-body flex h-[84%]";

export const STARTUP_PREVIEW_SIDEBAR_CLASS =
  "lyra-startup-preview-sidebar w-[25%] bg-[var(--lyra-startup-theme-preview-sidebar-bg)]";

export const STARTUP_PREVIEW_CONTENT_CLASS =
  "lyra-startup-preview-content flex-1 grid content-center gap-[7%] p-[10%] [&>span]:h-[8%] [&>span]:rounded-[var(--lyra-radius-4)] [&>span]:bg-[var(--lyra-startup-theme-preview-content-bg)]";

export const STARTUP_THEME_CARD_LABEL_CLASS =
  "lyra-startup-theme-card-label flex items-center justify-between min-h-[var(--lyra-control-h-28)] px-[var(--lyra-space-3)] text-[length:var(--lyra-text-size-caption)]";

export const STARTUP_AUDIO_CLASS =
  "lyra-startup-audio absolute w-[var(--lyra-stroke-thin)] h-[var(--lyra-stroke-thin)] opacity-0 pointer-events-none";

export const STARTUP_AUDIO_TOGGLE_CLASS =
  "lyra-startup-audio-toggle absolute right-[clamp(var(--lyra-space-10),2vw,var(--lyra-space-24))] bottom-[clamp(var(--lyra-space-10),2vh,var(--lyra-space-24))] z-[2] w-[var(--lyra-control-h-28)] h-[var(--lyra-control-h-28)] grid place-items-center p-0 border-0 text-[var(--lyra-text-primary)] bg-transparent opacity-[0.52] cursor-pointer hover:bg-transparent hover:opacity-[var(--lyra-opacity-lifted)] [&.is-muted]:opacity-[0.34]";

export const INSTALLER_HERO_CLASS = "lyra-installer-hero w-full! max-w-none";

export const INSTALLER_STAGE_CLASS =
  "lyra-installer-stage relative w-full grid place-items-center mb-[var(--lyra-space-12)]";

export const INSTALLER_GRID_AREA_CLASS = "col-start-1 row-start-1";

export const INSTALLER_LOGO_LAYER_CLASS =
  `lyra-installer-logo-layer ${INSTALLER_GRID_AREA_CLASS} z-[1] self-stretch justify-self-stretch w-full flex flex-col items-center justify-center bg-[var(--lyra-app-material-shell-bg)] opacity-100 transition-[opacity_720ms_var(--lyra-ease-standard),filter_720ms_var(--lyra-ease-standard)] [&.is-exit]:opacity-0 [&.is-exit]:blur-[var(--lyra-space-8)] [&.is-exit]:pointer-events-none motion-reduce:transition-none motion-reduce:filter-none [&_.lyra-startup-logo-wrap]:mb-[var(--lyra-space-12)]`;

export const INSTALLER_VIDEO_FRAME_CLASS =
  `lyra-installer-video-frame ${INSTALLER_GRID_AREA_CLASS} z-0 max-w-full max-h-[58vh] rounded-[var(--lyra-radius-16)] overflow-hidden isolate [clip-path:inset(0_round_var(--lyra-radius-16))] leading-[var(--lyra-text-line-collapse)]`;

export const INSTALLER_VIDEO_CLASS =
  "lyra-installer-video block w-auto h-auto max-w-full max-h-[58vh] object-contain bg-transparent";

export const INSTALLER_PROGRESS_CLASS =
  "lyra-installer-progress w-[min(100%,var(--lyra-unit-420))] mx-auto mt-[var(--lyra-space-16)] [.lyra-uninstaller-hero_&]:w-full [.lyra-uninstaller-hero_&]:mt-[var(--lyra-space-20)]";

export const INSTALLER_PROGRESS_TRACK_CLASS =
  "lyra-installer-progress-track h-[var(--lyra-space-2)] rounded-[var(--lyra-space-2)] bg-[color-mix(in_srgb,var(--lyra-text-primary)_12%,transparent)] overflow-hidden";

export const INSTALLER_PROGRESS_FILL_CLASS =
  "lyra-installer-progress-fill h-full w-0 bg-[var(--lyra-text-primary)] rounded-[var(--lyra-space-2)] [&.is-indeterminate]:w-[32%] [&.is-indeterminate]:animate-[lyra-installer-indeterminate_1.2s_var(--lyra-ease-standard)_infinite] motion-reduce:[&.is-indeterminate]:animate-none motion-reduce:[&.is-indeterminate]:w-[40%]";

export const INSTALLER_METRICS_CLASS =
  "lyra-installer-metrics flex justify-between mt-[var(--lyra-space-8)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-14)] min-h-[var(--lyra-space-14)]";

export const INSTALLER_PATH_CLASS =
  "lyra-installer-path inline-flex items-center justify-center gap-[var(--lyra-space-8)] mt-[var(--lyra-space-18)] border-0 p-0 bg-transparent text-[var(--lyra-text-secondary)] font-[inherit] text-[length:var(--lyra-text-size-12)] cursor-pointer [-webkit-app-region:no-drag] [app-region:no-drag] hover:text-[var(--lyra-text-primary)] disabled:cursor-default disabled:text-[var(--lyra-text-secondary)] [.lyra-uninstaller-hero_&]:mt-[var(--lyra-space-16)]";

export const UNINSTALLER_HERO_CLASS = "lyra-uninstaller-hero w-[min(100%,var(--lyra-unit-340))] gap-0";

export const UNINSTALLER_CHECK_CLASS =
  "lyra-uninstaller-check flex items-start gap-[var(--lyra-space-10)] w-full mt-[var(--lyra-space-16)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-16)] text-left cursor-pointer [-webkit-app-region:no-drag] [app-region:no-drag] [&:has([data-slot=checkbox]:disabled)]:cursor-default [&:has([data-slot=checkbox]:disabled)]:opacity-[var(--lyra-opacity-disabled)]";

export const INSTALLER_ACTIONS_CLASS =
  "lyra-installer-actions flex justify-center items-center gap-0 mt-[var(--lyra-space-24)] [-webkit-app-region:no-drag] [app-region:no-drag] [&_.lyra-ui-button]:min-w-[var(--lyra-space-56)] [.lyra-uninstaller-hero_&]:mt-[var(--lyra-space-24)]";

export const INSTALLER_INSTALL_SLOT_CLASS =
  "lyra-installer-install-slot grid grid-cols-1 min-w-0 overflow-hidden ml-[var(--lyra-space-10)] opacity-100 transition-[grid-template-columns_var(--lyra-motion-slow-duration)_var(--lyra-ease-emphasized),opacity_var(--lyra-motion-panel-layout-duration)_var(--lyra-ease-fast),margin-left_var(--lyra-motion-slow-duration)_var(--lyra-ease-emphasized)] [&>*]:min-w-0 [&>*]:overflow-hidden [.lyra-installer-actions.is-busy_&]:grid-cols-[0fr] [.lyra-installer-actions.is-busy_&]:ml-0 [.lyra-installer-actions.is-busy_&]:opacity-0 [.lyra-installer-actions.is-busy_&]:pointer-events-none [.lyra-installer-actions.is-busy_&_.lyra-ui-button]:min-w-0 [.lyra-installer-actions.is-busy_&_.lyra-ui-button]:px-0 [.lyra-installer-actions.is-busy_&_.lyra-ui-button]:border-0 motion-reduce:transition-none";
