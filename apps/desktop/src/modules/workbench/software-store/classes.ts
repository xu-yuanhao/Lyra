export const SS_STORE_CLASS =
  "lyra-software-store h-full min-h-0 overflow-auto text-[var(--lyra-text-primary)] bg-[var(--lyra-app-panel-bg)]";
export const SS_STORE_EMBEDDED_CLASS =
  "lyra-software-store-embedded h-auto min-h-0 overflow-visible bg-transparent [&_.lyra-software-store-content]:w-full [&_.lyra-software-store-content]:min-h-0 [&_.lyra-software-store-content]:p-0";
export const SS_CONTENT_CLASS =
  "lyra-software-store-content mx-auto grid min-h-full w-[min(var(--lyra-unit-720),calc(100%-var(--lyra-space-48)))] min-w-0 content-start gap-[var(--lyra-space-20)] py-[var(--lyra-page-pad-block-start)] pb-[var(--lyra-page-pad-block-end)] max-[980px]:w-[min(var(--lyra-unit-640),calc(100%-var(--lyra-space-32)))] max-[980px]:py-[var(--lyra-space-32)]";
export const SS_BROWSE_HEAD_CLASS =
  "lyra-software-store-browse-head flex min-w-0 items-start justify-between gap-[var(--lyra-space-24)] max-[980px]:grid max-[980px]:grid-cols-[minmax(0,1fr)]";
export const SS_TITLE_BLOCK_CLASS =
  "lyra-software-store-title-block grid min-w-0 gap-[var(--lyra-space-4)] [&_h1]:m-0 [&_h1]:text-[var(--lyra-text-primary)] [&_h1]:text-[length:var(--lyra-text-size-title-md)] [&_h1]:font-semibold [&_h1]:leading-[var(--lyra-text-line-24)] [&_p]:m-0 [&_p]:max-w-[var(--lyra-unit-520)] [&_p]:text-[var(--lyra-text-secondary)] [&_p]:text-[length:var(--lyra-text-size-body)] [&_p]:leading-[var(--lyra-text-line-body)]";
export const SS_CONTROLS_CLASS = "lyra-software-store-controls flex min-w-0 items-center gap-[var(--lyra-space-16)]";
export const SS_SEARCH_CLASS = "lyra-software-store-search w-full min-w-0";
export const SS_SECTION_STACK_CLASS = "lyra-software-store-section-stack grid min-w-0 gap-[var(--lyra-space-20)]";
export const SS_ITEM_SECTION_CLASS = "lyra-software-store-item-section grid min-w-0 gap-[var(--lyra-space-10)]";
export const SS_ITEM_LIST_CLASS =
  "lyra-software-store-item-list min-w-0 overflow-hidden rounded-[var(--lyra-radius-8)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_70%,transparent)] bg-[var(--lyra-app-surface-bg)]";
export const SS_ITEM_CLASS =
  "lyra-software-store-item min-h-[var(--lyra-unit-70)] rounded-none border-0 bg-transparent px-[var(--lyra-space-14)] py-[var(--lyra-space-12)] hover:bg-[var(--lyra-app-row-hover-bg)] [.lyra-software-store-item+&::before]:absolute [.lyra-software-store-item+&::before]:top-0 [.lyra-software-store-item+&::before]:left-[var(--lyra-space-14)] [.lyra-software-store-item+&::before]:right-[var(--lyra-space-14)] [.lyra-software-store-item+&::before]:h-[var(--lyra-stroke-thin)] [.lyra-software-store-item+&::before]:bg-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)] [.lyra-software-store-item+&::before]:content-[''] [&_.lyra-app-object-row-icon]:size-[var(--lyra-control-h-36)] [&_.lyra-app-object-row-icon]:rounded-[var(--lyra-radius-8)] [&_.lyra-app-object-row-icon]:bg-[var(--lyra-app-input-bg)] [&_.lyra-app-object-row-icon]:text-[var(--lyra-text-secondary)] [&_.lyra-app-object-row-icon]:shadow-[inset_0_0_0_var(--lyra-stroke-thin)_color-mix(in_srgb,var(--lyra-app-border)_66%,transparent)] [&_.lyra-app-object-row-title]:font-semibold [&_.lyra-app-object-row-description]:max-w-[var(--lyra-unit-520)] [&_.lyra-app-object-row-meta]:text-[var(--lyra-text-muted)]";
export const SS_ITEM_CHEVRON_CLASS =
  "lyra-software-store-item-chevron text-[var(--lyra-text-muted)] [stroke-width:1.8]";
export const SS_PRODUCT_ICON_CLASS =
  "lyra-software-store-product-icon inline-flex size-full items-center justify-center text-inherit [&_svg]:[stroke-width:1.8]";
export const SS_EMPTY_CLASS = "lyra-software-store-empty h-auto flex-none";
export const SS_DETAIL_CLASS = "lyra-software-store-detail grid min-w-0 content-start gap-[var(--lyra-space-12)]";
export const SS_DETAIL_PANEL_CLASS = "lyra-software-store-detail-panel grid min-w-0 content-start gap-[var(--lyra-space-24)]";
export const SS_DETAIL_HEAD_CLASS =
  "lyra-software-store-detail-head grid min-w-0 grid-cols-[var(--lyra-control-h-40)_minmax(0,1fr)_auto] items-start gap-[var(--lyra-space-12)] max-[980px]:grid-cols-[minmax(0,1fr)] [&_h2]:m-0 [&_h2]:truncate [&_h2]:text-[var(--lyra-text-primary)] [&_h2]:text-[length:var(--lyra-text-size-title-md)] [&_h2]:font-semibold [&_h2]:leading-[var(--lyra-text-line-24)] [&_p]:mx-0 [&_p]:mt-[var(--lyra-space-8)] [&_p]:mb-0 [&_p]:max-w-[var(--lyra-unit-640)] [&_p]:text-[var(--lyra-text-secondary)] [&_p]:text-[length:var(--lyra-text-size-body)] [&_p]:leading-[var(--lyra-text-line-body)]";
export const SS_DETAIL_COPY_CLASS = "lyra-software-store-detail-copy grid min-w-0 gap-[var(--lyra-space-4)]";
export const SS_DETAIL_ICON_CLASS =
  "lyra-software-store-detail-icon inline-flex size-[var(--lyra-control-h-40)] items-center justify-center rounded-[var(--lyra-radius-8)] bg-[var(--lyra-app-input-bg)] text-[var(--lyra-text-secondary)] shadow-[inset_0_0_0_var(--lyra-stroke-thin)_color-mix(in_srgb,var(--lyra-app-border)_66%,transparent)]";
export const SS_DETAIL_BADGES_CLASS =
  "lyra-software-store-detail-badges inline-flex min-w-0 flex-wrap items-center gap-[var(--lyra-space-6)]";
export const SS_DETAIL_ACTIONS_CLASS =
  "lyra-software-store-detail-actions inline-flex min-w-0 flex-wrap items-center justify-end gap-[var(--lyra-space-6)] max-[980px]:justify-start";
const SS_CARD_SHELL =
  "min-w-0 overflow-hidden rounded-[var(--lyra-radius-8)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-app-border)_70%,transparent)] bg-[var(--lyra-app-surface-bg)] [&_.lyra-app-surface-header]:border-b [&_.lyra-app-surface-header]:border-[var(--lyra-divider-soft)] [&_.lyra-app-surface-header]:p-[var(--lyra-space-14)]";
export const SS_FACTS_CLASS = `lyra-software-store-facts m-0 grid min-w-0 ${SS_CARD_SHELL}`;
export const SS_FACT_CLASS =
  "lyra-software-store-fact grid min-h-[var(--lyra-control-h-40)] min-w-0 grid-cols-[minmax(var(--lyra-unit-132),var(--lyra-unit-180))_minmax(0,1fr)] items-center gap-[var(--lyra-space-16)] px-[var(--lyra-space-14)] py-[var(--lyra-space-8)] [.lyra-software-store-fact+&]:border-t [.lyra-software-store-fact+&]:border-[var(--lyra-divider-soft)] [&_dt]:text-[var(--lyra-text-muted)] [&_dt]:text-[length:var(--lyra-text-size-caption)] [&_dt]:font-semibold [&_dt]:leading-[var(--lyra-text-line-caption)] [&_dd]:m-0 [&_dd]:min-w-0 [&_dd]:text-[var(--lyra-text-primary)] [&_dd]:text-[length:var(--lyra-text-size-body)] [&_dd]:leading-[var(--lyra-text-line-body)] [&_dd]:wrap-anywhere";
export const SS_PERMISSIONS_CLASS =
  `lyra-software-store-permissions m-0 grid min-w-0 gap-[var(--lyra-space-8)] px-[var(--lyra-space-14)] py-[var(--lyra-space-12)] ${SS_CARD_SHELL} [&_span]:text-[var(--lyra-text-secondary)] [&_span]:text-[length:var(--lyra-text-size-body)] [&_span]:leading-[var(--lyra-text-line-body)] [&_li]:text-[var(--lyra-text-secondary)] [&_li]:text-[length:var(--lyra-text-size-body)] [&_li]:leading-[var(--lyra-text-line-body)] [&_strong]:text-[var(--lyra-text-muted)] [&_strong]:text-[length:var(--lyra-text-size-caption)] [&_strong]:font-semibold [&_strong]:leading-[var(--lyra-text-line-caption)] [&_ul]:m-0 [&_ul]:flex [&_ul]:list-none [&_ul]:flex-wrap [&_ul]:gap-[var(--lyra-space-6)] [&_ul]:p-0`;
export const SS_CHIP_LIST_CLASS = "lyra-software-store-chip-list [&_li]:contents";
export const SS_ACTION_LIST_CLASS =
  "lyra-software-store-action-list grid gap-[var(--lyra-space-2)] [&_li]:grid [&_li]:min-h-[var(--lyra-control-h-36)] [&_li]:min-w-0 [&_li]:grid-cols-[minmax(0,1fr)_auto] [&_li]:items-center [&_li]:gap-[var(--lyra-space-10)] [&_li]:rounded-[var(--lyra-radius-6)] [&_li]:bg-transparent [&_li]:px-[var(--lyra-space-8)] [&_li]:py-[var(--lyra-space-6)] [&_li]:text-[var(--lyra-text-secondary)] [&_li:hover]:bg-[var(--lyra-app-row-hover-bg)] [&_li>span:first-child]:truncate";
export const SS_CONTRIBUTIONS_CLASS = "lyra-software-store-contributions grid border-t border-[var(--lyra-divider-strong)]";
export const SS_CONTRIBUTION_COPY_CLASS =
  "lyra-software-store-contribution-copy grid gap-[var(--lyra-space-2)] [&_code]:truncate [&_code]:font-[family-name:var(--lyra-font-mono)] [&_code]:text-[var(--lyra-text-muted)] [&_code]:text-[length:var(--lyra-text-size-caption)]";
export const SS_CONTRIBUTION_ACTIONS_CLASS =
  "lyra-software-store-contribution-actions flex flex-wrap items-center justify-end gap-[var(--lyra-space-4)]";
export const SS_CONTRIBUTION_META_CLASS =
  "lyra-software-store-contribution-meta flex flex-wrap items-center justify-end gap-[var(--lyra-space-4)]";
export const SS_INSTALL_CLASS = `lyra-software-store-install ${SS_CARD_SHELL}`;
export const SS_UPDATE_CLASS = `lyra-software-store-update ${SS_CARD_SHELL}`;
export const SS_INSTALL_GRID_CLASS =
  "lyra-software-store-install-grid grid grid-cols-[repeat(2,minmax(0,1fr))] gap-0 p-[var(--lyra-space-14)] max-[980px]:grid-cols-[minmax(0,1fr)] [&_form]:grid [&_form]:min-w-0 [&_form]:content-start [&_form]:gap-[var(--lyra-space-10)] [&_form+form]:border-l [&_form+form]:border-[color-mix(in_srgb,var(--lyra-app-border)_62%,transparent)] [&_form+form]:pl-[var(--lyra-space-14)] max-[980px]:[&_form+form]:mt-[var(--lyra-space-14)] max-[980px]:[&_form+form]:border-t max-[980px]:[&_form+form]:border-[var(--lyra-divider-soft)] max-[980px]:[&_form+form]:border-l-0 max-[980px]:[&_form+form]:pl-0 max-[980px]:[&_form+form]:pt-[var(--lyra-space-14)] [&_label]:grid [&_label]:min-w-0 [&_label]:gap-[var(--lyra-space-4)] [&_label_span]:text-[var(--lyra-text-muted)] [&_label_span]:text-[length:var(--lyra-text-size-caption)] [&_label_span]:font-semibold [&_label_span]:leading-[var(--lyra-text-line-caption)]";
export const SS_INSTALL_TITLE_CLASS =
  "lyra-software-store-install-title inline-flex items-center gap-[var(--lyra-space-6)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] font-semibold leading-[var(--lyra-text-line-caption)] [&_svg]:size-[var(--lyra-icon-size-14)]";
export const SS_UPDATE_ACTIONS_CLASS =
  "lyra-software-store-update-actions flex flex-wrap items-center gap-[var(--lyra-space-8)]";
export const SS_UPDATE_BODY_CLASS =
  "lyra-software-store-update-body flex flex-wrap items-center gap-[var(--lyra-space-8)] px-[var(--lyra-space-14)] py-[var(--lyra-space-12)]";
export const SS_UPDATE_CHANNEL_LABEL_CLASS =
  "lyra-software-store-update-channel-label text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] font-semibold";
export const SS_UPDATE_PROGRESS_CLASS = "lyra-software-store-update-progress ml-auto";
export const SS_STATUS_STACK_CLASS = "lyra-software-store-status-stack grid gap-[var(--lyra-space-8)]";
export const SS_STATUS_CLASS = "lyra-software-store-status px-[var(--lyra-space-2)]";
