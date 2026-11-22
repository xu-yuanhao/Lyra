export const AI_STACK_CLASS = "lyra-settings-ai-stack grid min-w-0 gap-[var(--lyra-space-12)]";
export const AI_MODELS_PANEL_CLASS = "lyra-settings-ai-models-panel grid min-w-0 gap-[var(--lyra-space-10)]";

export const AI_PAGE_HEADER_CLASS =
  "lyra-settings-ai-page-header grid min-h-[var(--lyra-control-h-36)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-8)] p-0 [&_h3]:m-0 [&_h3]:text-[var(--lyra-text-primary)] [&_h3]:text-[length:var(--lyra-text-size-body)] [&_h3]:font-semibold [&_h3]:leading-[var(--lyra-text-line-body)] [&[data-drop-active=true]_.lyra-app-search-field]:outline [&[data-drop-active=true]_.lyra-app-search-field]:outline-[var(--lyra-stroke-thin)] [&[data-drop-active=true]_.lyra-app-search-field]:outline-[color-mix(in_srgb,var(--lyra-text-primary)_72%,transparent)] [&[data-drop-active=true]_.lyra-app-search-field]:outline-offset-[var(--lyra-space-2)]";

export const AI_FORM_CLASS =
  "lyra-settings-ai-form grid grid-cols-[minmax(0,1fr)] items-start gap-[var(--lyra-space-12)]";

export const AI_FIELD_CLASS =
  "lyra-settings-ai-field grid min-w-0 content-start gap-[var(--lyra-space-6)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] [&>span]:text-[var(--lyra-text-secondary)] [&>span]:text-[length:var(--lyra-text-size-caption)] [&>span]:font-semibold [&>span]:leading-[var(--lyra-text-line-caption)] [&_small]:text-[var(--lyra-text-muted)] [&_small]:text-[length:var(--lyra-text-size-caption)] [&_small]:leading-[var(--lyra-text-line-caption)]";

export const AI_FIELD_SPAN2_CLASS = "lyra-settings-ai-field-span-2 col-[1/-1]";
export const AI_FIELD_ACTION_CLASS = "lyra-settings-ai-field-action self-end";

export const AI_DISCOVERY_ROW_CLASS =
  "lyra-settings-ai-model-discovery-action-row flex min-w-0 items-center gap-[var(--lyra-space-8)]";

export const AI_CUSTOM_ROW_CLASS =
  "lyra-settings-ai-custom-model-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-8)]";

export const AI_INPUT_CLASS =
  "lyra-settings-ai-input min-h-[var(--lyra-control-h-default)] w-full min-w-0 rounded-[var(--lyra-control-radius-default)] border border-[var(--lyra-stroke-thin)] border-[var(--lyra-settings-input-border)] bg-[var(--lyra-settings-input-bg)] px-[var(--lyra-space-8)] py-0 font-[family-name:var(--lyra-font-ui)] text-[var(--lyra-text-primary)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] transition-[background-color,border-color,box-shadow] duration-[var(--lyra-motion-fast)] hover:border-[var(--lyra-settings-input-focus-border)] hover:bg-[var(--lyra-settings-input-hover-bg)] placeholder:text-[var(--lyra-settings-input-placeholder)] read-only:text-[var(--lyra-text-secondary)]";

export const AI_INPUT_MULTILINE_CLASS =
  "lyra-settings-ai-input-multiline min-h-[var(--lyra-unit-96)] resize-y px-[var(--lyra-space-12)] py-[var(--lyra-space-10)]";

export const AI_MODEL_INPUT_CLASS = "lyra-settings-ai-model-input min-h-[var(--lyra-unit-86)]";

export const AI_SWITCH_ROW_CLASS =
  "lyra-settings-ai-switch-row grid min-h-[var(--lyra-control-h-36)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-12)] border-0 bg-transparent p-0 text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] [&>span]:min-w-0 [&>span]:overflow-hidden [&>span]:text-ellipsis [&>span]:whitespace-nowrap";

export const AI_SELECT_CLASS = "lyra-settings-ai-select w-full";
export const AI_MODEL_MODE_PICKER_CLASS = "lyra-settings-ai-model-mode-picker w-full";

export const AI_ACTIONS_CLASS =
  "lyra-settings-ai-actions inline-flex flex-wrap items-center gap-[var(--lyra-space-8)]";

export const AI_ERROR_CLASS =
  "lyra-settings-ai-error min-w-0 text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)]";

const AI_LIST_DIVIDER =
  "[.lyra-settings-ai-skill-card+&::before]:absolute [.lyra-settings-ai-skill-card+&::before]:top-0 [.lyra-settings-ai-skill-card+&::before]:left-[var(--lyra-space-14)] [.lyra-settings-ai-skill-card+&::before]:right-[var(--lyra-space-14)] [.lyra-settings-ai-skill-card+&::before]:h-[var(--lyra-stroke-thin)] [.lyra-settings-ai-skill-card+&::before]:bg-[color-mix(in_srgb,var(--lyra-settings-border)_72%,transparent)] [.lyra-settings-ai-skill-card+&::before]:content-['']";

export const AI_SKILL_LIST_CLASS =
  "lyra-settings-ai-skill-list grid min-w-0 gap-0 overflow-hidden rounded-[var(--lyra-settings-radius-control)] border border-[var(--lyra-stroke-thin)] border-[color-mix(in_srgb,var(--lyra-settings-border)_70%,transparent)] bg-[var(--lyra-settings-card-bg)]";

export const AI_SKILL_CARD_CLASS =
  "lyra-settings-ai-skill-card relative grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-12)] border-0 bg-transparent px-[var(--lyra-space-14)] py-[var(--lyra-space-12)] hover:bg-[var(--lyra-settings-row-hover-bg)] [&:hover_.lyra-settings-ai-row-action]:opacity-100 [&:hover_.lyra-settings-ai-row-delete]:opacity-100 [&:focus-within_.lyra-settings-ai-row-action]:opacity-100 [&:focus-within_.lyra-settings-ai-row-delete]:opacity-100 " + AI_LIST_DIVIDER;

export const AI_SKILL_MAIN_CLASS = "lyra-settings-ai-skill-main grid min-w-0 gap-[var(--lyra-space-8)]";

export const AI_SKILL_TITLE_ROW_CLASS =
  "lyra-settings-ai-skill-title-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-[var(--lyra-space-10)] [&_h3]:m-0 [&_h3]:min-w-0 [&_h3]:text-[var(--lyra-text-primary)] [&_h3]:text-[length:var(--lyra-text-size-body)] [&_h3]:font-semibold [&_h3]:leading-[var(--lyra-text-line-body)] [&_h3]:wrap-anywhere [&_p]:m-0 [&_p]:min-w-0 [&_p]:text-[var(--lyra-text-secondary)] [&_p]:text-[length:var(--lyra-text-size-caption)] [&_p]:leading-[var(--lyra-text-line-caption)] [&_p]:wrap-anywhere";

export const AI_MCP_TITLE_CLASS =
  "lyra-settings-ai-mcp-title grid min-w-0 grid-cols-[var(--lyra-control-h-24)_minmax(0,1fr)] items-center gap-[var(--lyra-space-8)]";

export const AI_MCP_ICON_CLASS =
  "lyra-settings-ai-mcp-icon inline-grid size-[var(--lyra-control-h-24)] place-items-center rounded-[var(--lyra-radius-6)] bg-[var(--lyra-settings-muted-bg)] text-[var(--lyra-text-secondary)]";

export const AI_SKILL_TEXT_CLASS =
  "min-w-0 m-0 text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)] wrap-anywhere";

export const AI_SKILL_DESCRIPTION_CLASS = "lyra-settings-ai-skill-description " + AI_SKILL_TEXT_CLASS;

export const AI_SKILL_META_CLASS =
  "lyra-settings-ai-skill-meta flex min-w-0 flex-wrap gap-[var(--lyra-space-8)] " + AI_SKILL_TEXT_CLASS + " [&_strong]:text-[var(--lyra-text-primary)] [&_strong]:font-semibold";

export const AI_SKILL_ACTIONS_CLASS =
  "lyra-settings-ai-skill-actions inline-flex items-center justify-end gap-[var(--lyra-space-6)]";

export const AI_MCP_ITEM_CLASS =
  "lyra-settings-ai-mcp-item relative grid min-w-0 gap-0 [.lyra-settings-ai-mcp-item+&::before]:absolute [.lyra-settings-ai-mcp-item+&::before]:top-0 [.lyra-settings-ai-mcp-item+&::before]:left-[var(--lyra-space-14)] [.lyra-settings-ai-mcp-item+&::before]:right-[var(--lyra-space-14)] [.lyra-settings-ai-mcp-item+&::before]:h-[var(--lyra-stroke-thin)] [.lyra-settings-ai-mcp-item+&::before]:bg-[color-mix(in_srgb,var(--lyra-settings-border)_72%,transparent)] [.lyra-settings-ai-mcp-item+&::before]:content-['']";

export const AI_MCP_EDITOR_CLASS =
  "lyra-settings-ai-mcp-editor grid min-w-0 gap-[var(--lyra-space-12)] border-0 bg-[var(--lyra-settings-muted-bg)] px-[var(--lyra-space-14)] py-[var(--lyra-space-12)] shadow-[inset_0_var(--lyra-stroke-thin)_0_color-mix(in_srgb,var(--lyra-settings-border)_72%,transparent)]";

export const AI_MCP_EDITOR_GRID_CLASS = "lyra-settings-ai-mcp-editor-grid grid min-w-0 gap-[var(--lyra-space-10)]";
export const AI_MCP_EDITOR_ACTIONS_CLASS =
  "lyra-settings-ai-mcp-editor-actions inline-flex items-center justify-end gap-[var(--lyra-space-8)]";

export const AI_SKILL_STATUS_CLASS =
  "lyra-settings-ai-skill-status min-w-0 px-[var(--lyra-space-14)] py-[var(--lyra-space-8)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-caption)]";

export const AI_SKILL_LOAD_MORE_CLASS = "lyra-settings-ai-skill-load-more min-h-[var(--lyra-space-1)]";
