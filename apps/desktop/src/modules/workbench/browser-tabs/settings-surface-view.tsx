import { SettingsProjectsView } from "../settings-projects";
import { type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  BookText,
  Download,
  BingBrandLogo,
  GoogleBrandLogo,
  KeyRound,
  LogIn,
  LogOut,
  AppWindow,
  Monitor,
  Moon,
  Package,
  Palette,
  FlaskConical,
  Search,
  Settings2,
  Sparkles,
  Sun,
  Terminal,
  Import,
  Webhook,
  type LucideIcon
} from "@lyra/icons";

import {
  AppButton,
  AppInput,
  AppSelect,
  type AppSelectOption,
  AppSettingsRow,
  AppSettingsSection,
  AppSwitch,
  AppTextarea
} from "@renderer/ui/components";
import type { LyraDesktopApi } from "../../../shared/desktop-bridge";
import { IdentityIconView } from "../identity";
import { SettingsAiMcpView, SettingsAiModelsView, SettingsAiSkillsView } from "../settings-ai";
import { SettingsImportView } from "../settings-import";
import { SettingsDownloadsView } from "../settings-downloads";
import { LoginManagerSettingsSlot } from "../login-manager";
import { SoftwareStoreSurface } from "../software-store";
import { SettingsAccountPage } from "./settings-account-view";
import {
  ST_ACCOUNT_ACTION_CLASS,
  ST_ACCOUNT_ACTIVE_CLASS,
  ST_ACCOUNT_AVATAR_CLASS,
  ST_ACCOUNT_CLASS,
  ST_ACCOUNT_IDENTITY_CLASS,
  ST_ACCOUNT_LOCAL_LOGO_CLASS,
  ST_ACCOUNT_NAME_CLASS,
  ST_CATEGORY_CLASS,
  ST_CATEGORY_HEADER_CLASS,
  ST_MAIN_CLASS,
  ST_NAV_ACTIONS_CLASS,
  ST_NAV_DOCS_CLASS,
  ST_NAV_ICON_CLASS,
  ST_NAV_ITEM_ACTIVE_CLASS,
  ST_NAV_ITEM_CLASS,
  ST_NAV_JUMP_ICON_CLASS,
  ST_NAV_JUMP_LABEL_CLASS,
  ST_NAV_LIST_CLASS,
  ST_NAV_CLASS,
  ST_SHELL_CLASS,
  ST_SURFACE_CLASS,
  ST_CONTROL_SLOT_CLASS,
  ST_ENGINE_BRAND_ICON_CLASS,
  ST_INLINE_INPUT_CLASS,
  ST_INLINE_STATUS_COPY_CLASS,
  ST_INLINE_STATUS_ROW_CLASS,
  ST_ROW_BLOCK_CONTROL_CLASS,
  ST_ROW_LIST_CLASS,
  ST_STATUS_LIST_CLASS,
  ST_STATUS_ROW_CLASS,
  ST_STATUS_ROWS_CLASS,
  ST_INPUT_CLASS,
  ST_SELECT_CONTENT_CLASS,
  ST_SELECT_CONTENT_RICH_CLASS,
  ST_SELECT_TRIGGER_CLASS,
  ST_TEXTAREA_CLASS,
} from "./settings-classes";
import { LanguagePicker } from "./language-picker";
import type { SettingsCategoryId } from "./settings-schema";
import type { SettingsAccount, SettingsAccountLabels } from "./settings-surface-types";
import type {
  SettingsBooleanChoiceControlDescriptor,
  SettingsChoiceControlDescriptor,
  SettingsControlDescriptor,
  SettingsInlineStatusActionControlDescriptor,
  SettingsLanguagePickerControlDescriptor,
  SettingsMultiChoiceControlDescriptor,
  SettingsRenderedSection,
  SettingsStatusListControlDescriptor,
  SettingsSurfaceModel,
  SettingsTextControlDescriptor,
  SettingsToggleGroupControlDescriptor
} from "./settings-render-model";

type SettingsSurfaceViewProps = {
  readonly model: SettingsSurfaceModel;
  readonly activeDestination: SettingsCategoryId | "account";
  readonly onActivateCategory: (categoryId: SettingsCategoryId) => void;
  readonly onOpenAccount: () => void;
  readonly docsNavLabel: string;
  readonly onOpenDocs: () => void;
  readonly account: SettingsAccount | null;
  readonly accountLabels: SettingsAccountLabels;
  readonly desktopApi: LyraDesktopApi | null;
  readonly softwareStoreHeading?: string | null;
  readonly onRepairLoginManager: () => void;
};

type SettingsControlActions = {
  readonly onActivateCategory: (categoryId: SettingsCategoryId) => void;
  readonly onRepairLoginManager: () => void;
};

const SETTINGS_CATEGORY_ICONS: Partial<Record<SettingsCategoryId, LucideIcon>> = {
  appearance: Palette,
  general: Settings2,
  downloads: Download,
  linux: Terminal,
  loginManager: KeyRound,
  models: Package,
  mcp: Webhook,
  projects: BookText,
  importSettings: Import,
  notifications: Bell,
  softwareStore: AppWindow,
  search: Search,
  skills: Sparkles,
  experimental: FlaskConical,
  workspace: Monitor
};

const THEME_SELECT_ICONS: Partial<Record<string, LucideIcon>> = {
  "lyra-dark": Moon,
  "lyra-light": Sun,
  "lyra-system": Monitor
};

const SEARCH_ENGINE_BRAND_ICONS: Partial<Record<string, LucideIcon>> = {
  bing: BingBrandLogo,
  google: GoogleBrandLogo
};

const SettingsAccountView = ({
  account,
  active,
  onOpen
}: {
  readonly account: SettingsAccount;
  readonly active: boolean;
  readonly onOpen: () => void;
}) => (
  <div className={active ? `${ST_ACCOUNT_CLASS} ${ST_ACCOUNT_ACTIVE_CLASS}` : ST_ACCOUNT_CLASS}>
    <AppButton
      className={ST_ACCOUNT_IDENTITY_CLASS}
      variant="ghost"
      size="sm"
      aria-label={account.displayName}
      onClick={onOpen}
    >
      <IdentityIconView
        className={ST_ACCOUNT_AVATAR_CLASS}
        iconUrl={account.avatarUrl}
        label={account.displayName}
        fallback={account.kind === "local"
          ? <span className={`${ST_ACCOUNT_LOCAL_LOGO_CLASS} lyra-settings-nav-logo`} />
          : account.displayName.slice(0, 1).toUpperCase()}
      />
      <span className={ST_ACCOUNT_NAME_CLASS} title={account.displayName}>
        {account.displayName}
      </span>
    </AppButton>
    <AppButton
      className={ST_ACCOUNT_ACTION_CLASS}
      variant="ghost"
      size="icon"
      aria-label={account.actionLabel}
      title={account.actionLabel}
      aria-busy={account.actionPending}
      disabled={account.actionPending}
      onClick={account.onAction}
    >
      {account.kind === "local"
        ? <LogIn size={14} aria-hidden="true" />
        : <LogOut size={14} aria-hidden="true" />}
    </AppButton>
  </div>
);

const resolveSelectedChoiceDescription = (
  control: SettingsChoiceControlDescriptor
): string | undefined => {
  if (control.description !== undefined) {
    return control.description;
  }
  return control.options.find((option) => option.value === control.value)?.description;
};

const buildSelectOptions = (
  control: SettingsChoiceControlDescriptor
): readonly AppSelectOption[] => control.options.map((option) => {
  const Icon = control.previewKind === "theme"
    ? THEME_SELECT_ICONS[option.value]
    : undefined;
  const BrandIcon = control.previewKind === "search-engine"
    ? SEARCH_ENGINE_BRAND_ICONS[option.value]
    : undefined;

  return {
    ...option,
    ...(Icon === undefined
      ? {}
      : {
          icon: <Icon aria-hidden="true" />
        }),
    ...(BrandIcon === undefined
      ? {}
      : {
          icon: (
            <BrandIcon
              size={14}
              className={ST_ENGINE_BRAND_ICON_CLASS}
              aria-hidden="true"
            />
          )
        })
  };
});

const SettingsChoiceSelect = ({ control }: { readonly control: SettingsChoiceControlDescriptor }) => (
  <AppSettingsRow
    title={control.label}
    description={resolveSelectedChoiceDescription(control)}
    control={(
      <AppSelect
        ariaLabel={control.label}
        className={ST_SELECT_TRIGGER_CLASS}
        contentClassName={control.options.some((option) => option.description !== undefined)
          ? `${ST_SELECT_CONTENT_CLASS} ${ST_SELECT_CONTENT_RICH_CLASS}`
          : ST_SELECT_CONTENT_CLASS}
        value={control.value}
        options={buildSelectOptions(control)}
        onValueChange={control.onChange}
      />
    )}
  />
);

const SettingsLanguagePicker = ({
  control
}: {
  readonly control: SettingsLanguagePickerControlDescriptor;
}) => (
  <AppSettingsRow
    title={control.label}
    control={(
      <LanguagePicker
        value={control.value}
        builtins={control.options}
        labels={control.labels}
        desktopApi={control.desktopApi}
        onChange={control.onChange}
      />
    )}
  />
);

const SettingsBooleanChoice = ({ control }: { readonly control: SettingsBooleanChoiceControlDescriptor }) => (
  <AppSettingsRow
    title={control.label}
    description={control.description}
    control={(
      <AppSwitch
        checked={control.value}
        aria-label={control.label}
        onCheckedChange={control.onChange}
      />
    )}
  />
);

const SettingsTextControl = ({ control }: { readonly control: SettingsTextControlDescriptor }) => {
  if (control.kind === "textarea") {
    return (
      <AppSettingsRow
        className={ST_ROW_BLOCK_CONTROL_CLASS}
        title={control.label}
        control={(
          <AppTextarea
            aria-label={control.label}
            className={ST_TEXTAREA_CLASS}
            value={control.value}
            placeholder={control.placeholder}
            onChange={(event) => {
              control.onChange(event.target.value);
            }}
          />
        )}
      />
    );
  }

  return (
    <AppSettingsRow
      title={control.label}
      control={(
        <AppInput
          aria-label={control.label}
          className={`${ST_INPUT_CLASS} ${ST_INLINE_INPUT_CLASS}`}
          value={control.value}
          placeholder={control.placeholder}
          onChange={(event) => {
            control.onChange(event.target.value);
          }}
        />
      )}
    />
  );
};

const SettingsToggleGroup = ({ control }: { readonly control: SettingsToggleGroupControlDescriptor }) => (
  <div
    className={ST_ROW_LIST_CLASS}
    role="group"
    aria-label={control.label}
  >
    {control.toggles.map((toggle) => (
      <AppSettingsRow
        key={toggle.id}
        title={toggle.label}
        control={(
          <AppSwitch
            checked={toggle.active}
            aria-label={toggle.label}
            onCheckedChange={toggle.onToggle}
          />
        )}
      />
    ))}
  </div>
);

const SettingsMultiChoice = ({ control }: { readonly control: SettingsMultiChoiceControlDescriptor }) => (
  <div className={ST_ROW_LIST_CLASS} role="group" aria-label={control.label}>
    {control.options.map((option) => {
      const checked = control.selectedValues.includes(option.value);
      return (
        <AppSettingsRow
          key={option.value}
          title={option.label}
          description={option.description}
          control={(
            <AppSwitch
              checked={checked}
              aria-label={option.label}
              onCheckedChange={(nextChecked) => {
                if (!nextChecked) {
                  control.onChange(control.selectedValues.filter((value) => value !== option.value));
                  return;
                }
                control.onChange([...control.selectedValues, option.value]);
              }}
            />
          )}
        />
      );
    })}
  </div>
);

const SettingsInlineStatusAction = ({
  control
}: {
  readonly control: SettingsInlineStatusActionControlDescriptor;
}) => (
  <div className={ST_INLINE_STATUS_ROW_CLASS} role="group" aria-label={control.label}>
    <div className={ST_INLINE_STATUS_COPY_CLASS}>
      <small>{control.statusLabel}</small>
      <strong>{control.statusValue}</strong>
    </div>
    <AppButton
      variant="outline"
      size="md"
      type="button"
      disabled={control.actionDisabled}
      onClick={control.onAction}
    >
      {control.actionLabel}
    </AppButton>
  </div>
);

const SettingsStatusList = ({
  control
}: {
  readonly control: SettingsStatusListControlDescriptor;
}) => (
  <div className={ST_STATUS_LIST_CLASS} role="group" aria-label={control.label}>
    <div className={ST_STATUS_ROWS_CLASS}>
      {control.rows.map((row) => (
        <div key={row.label} className={ST_STATUS_ROW_CLASS}>
          <small>{row.label}</small>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
    {control.actionLabel !== undefined && control.onAction !== undefined ? (
      <AppButton
        variant="outline"
        size="md"
        type="button"
        onClick={control.onAction}
      >
        {control.actionLabel}
      </AppButton>
    ) : null}
  </div>
);

const renderControl = (
  control: SettingsControlDescriptor,
  actions: SettingsControlActions
): ReactNode => {
  switch (control.kind) {
    case "boolean-choice":
      return <SettingsBooleanChoice control={control} />;
    case "choice":
      return <SettingsChoiceSelect control={control} />;
    case "language-picker":
      return <SettingsLanguagePicker control={control} />;
    case "custom":
      if (control.customKind === "login-manager") {
        return (
          <LoginManagerSettingsSlot
            title={control.title}
            repairLabel={control.repairLabel}
            description={control.description}
            startFailedDescription={control.startFailedDescription}
            onRepair={actions.onRepairLoginManager}
          />
        );
      }
      if (control.customKind === "software-store") {
        return <SoftwareStoreSurface {...control.props} embedded />;
      }
      if (control.customKind === "ai-models") {
        return (
          <SettingsAiModelsView
            labels={control.labels}
            model={control.model}
            openDialog={control.openDialog}
          />
        );
      }
      if (control.customKind === "ai-skills") {
        return <SettingsAiSkillsView labels={control.labels} model={control.model} />;
      }
      if (control.customKind === "ai-mcp") {
        return <SettingsAiMcpView labels={control.labels} model={control.model} />;
      }
      if (control.customKind === "projects") return <SettingsProjectsView desktopApi={control.desktopApi} />;
      if (control.customKind === "import-settings") {
        return <SettingsImportView desktopApi={control.desktopApi} labels={control.labels} />;
      }
      if (control.customKind === "downloads") {
        return (
          <SettingsDownloadsView
            desktopApi={control.desktopApi}
            labels={control.labels}
            onChooseDirectory={control.onChooseDirectory}
          />
        );
      }
      return null;
    case "inline-status-action":
      return <SettingsInlineStatusAction control={control} />;
    case "multi-choice":
      return <SettingsMultiChoice control={control} />;
    case "status-list":
      return <SettingsStatusList control={control} />;
    case "text":
    case "textarea":
      return <SettingsTextControl control={control} />;
    case "toggle-group":
      return <SettingsToggleGroup control={control} />;
    default:
      return null;
  }
};

const resolveSectionTitlePlacement = (
  section: SettingsRenderedSection
): "inside" | "outside" | "none" => {
  if (section.controls.length !== 1) {
    return "outside";
  }

  switch (section.controls[0]?.kind) {
    case "multi-choice":
    case "status-list":
    case "toggle-group":
      return "outside";
    case "custom":
      return "inside";
    default:
      return "none";
  }
};

const renderSectionControlSlots = (
  section: SettingsRenderedSection,
  actions: SettingsControlActions
): readonly ReactNode[] =>
  section.controls.map((control, index) => (
    <div
      className={[
        ST_CONTROL_SLOT_CLASS,
        `lyra-settings-control-slot-${control.kind}`,
        control.kind === "custom" ? `lyra-settings-control-slot-custom-${control.customKind}` : ""
      ].filter(Boolean).join(" ")}
      key={`${section.id}-${control.kind}-${index}`}
    >
      {renderControl(control, actions)}
    </div>
  ));

const isCompactSection = (section: SettingsRenderedSection): boolean =>
  section.frame !== "none" && resolveSectionTitlePlacement(section) === "none";

const renderSection = (
  section: SettingsRenderedSection,
  actions: SettingsControlActions
): ReactNode => {
  const controls = renderSectionControlSlots(section, actions);

  if (section.frame === "none") {
    return controls;
  }

  return (
    <AppSettingsSection
      label={section.label}
      cluster={section.cluster}
      titlePlacement={resolveSectionTitlePlacement(section)}
    >
      {controls}
    </AppSettingsSection>
  );
};

const renderCategorySections = (
  category: SettingsSurfaceModel["categories"][number],
  actions: SettingsControlActions
): readonly ReactNode[] => {
  const nodes: ReactNode[] = [];
  let compactRun: SettingsRenderedSection[] = [];

  const flushCompactRun = () => {
    if (compactRun.length === 0) return;
    const run = compactRun;
    compactRun = [];
    nodes.push(
      <AppSettingsSection
        key={`compact-${run.map((section) => section.id).join("-")}`}
        label={category.heading}
        cluster
        titlePlacement="none"
      >
        {run.flatMap((section) => renderSectionControlSlots(section, actions))}
      </AppSettingsSection>
    );
  };

  for (const section of category.sections) {
    if (isCompactSection(section)) {
      compactRun.push(section);
      continue;
    }
    flushCompactRun();
    nodes.push(<div key={section.id}>{renderSection(section, actions)}</div>);
  }

  flushCompactRun();
  return nodes;
};

export const SettingsSurfaceView = ({
  model,
  activeDestination,
  onActivateCategory,
  onOpenAccount,
  docsNavLabel,
  onOpenDocs,
  account,
  accountLabels,
  desktopApi,
  softwareStoreHeading,
  onRepairLoginManager
}: SettingsSurfaceViewProps) => {
  const selectedCategory =
    activeDestination === "account"
      ? null
      : model.categories.find((category) => category.id === activeDestination)
        ?? model.categories[0]
        ?? null;

  return (
    <section className={ST_SURFACE_CLASS} aria-label="settings-surface">
      <div className={`lyra-app-sidebar-split ${ST_SHELL_CLASS}`}>
        <aside className={ST_NAV_CLASS} aria-label="settings-nav">
          <div className={ST_NAV_LIST_CLASS}>
            {model.categories.map((category) => (
              (() => {
                const Icon = SETTINGS_CATEGORY_ICONS[category.id];
                return (
                  <AppButton
                    key={category.id}
                    variant="ghost"
                    size="sm"
                    className={category.id === selectedCategory?.id
                      ? `${ST_NAV_ITEM_CLASS} ${ST_NAV_ITEM_ACTIVE_CLASS}`
                      : ST_NAV_ITEM_CLASS}
                    onClick={() => {
                      onActivateCategory(category.id);
                    }}
                  >
                    {category.id === "ai" ? (
                      <span className="lyra-settings-nav-icon lyra-settings-nav-logo" aria-hidden="true" />
                    ) : Icon === undefined ? null : (
                      <Icon className={ST_NAV_ICON_CLASS} size={14} aria-hidden="true" />
                    )}
                    <span className="lyra-app-sidebar-group-name">{category.navLabel}</span>
                  </AppButton>
                );
              })()
            ))}
            <div className={ST_NAV_DOCS_CLASS}>
              <AppButton
                className={`lyra-app-sidebar-row lyra-settings-nav-item-jump ${ST_NAV_ITEM_CLASS}`}
                variant="ghost"
                size="sm"
                onClick={onOpenDocs}
              >
                <BookText className={ST_NAV_ICON_CLASS} size={14} aria-hidden="true" />
                <span className={`${ST_NAV_JUMP_LABEL_CLASS} lyra-app-sidebar-group-name`}>
                  <span>{docsNavLabel}</span>
                  <ArrowUpRight
                    className={ST_NAV_JUMP_ICON_CLASS}
                    size={12}
                    aria-hidden="true"
                  />
                </span>
              </AppButton>
            </div>
          </div>
          {account === null ? null : (
            <div className={ST_NAV_ACTIONS_CLASS}>
              <SettingsAccountView
                account={account}
                active={activeDestination === "account"}
                onOpen={onOpenAccount}
              />
            </div>
          )}
        </aside>

        <main className={ST_MAIN_CLASS}>
          {activeDestination === "account" && account !== null ? (
            <SettingsAccountPage account={account} desktopApi={desktopApi} labels={accountLabels} />
          ) : selectedCategory === null ? null : (
            <section
              key={selectedCategory.id}
              id={selectedCategory.domId}
              className={`lyra-settings-category lyra-settings-category-${selectedCategory.id} ${ST_CATEGORY_CLASS}`}
              aria-labelledby={`${selectedCategory.domId}-heading`}
            >
              <header className={ST_CATEGORY_HEADER_CLASS}>
                <h2 id={`${selectedCategory.domId}-heading`}>{
                  selectedCategory.id === "softwareStore" && softwareStoreHeading != null
                    ? softwareStoreHeading
                    : selectedCategory.heading
                }</h2>
              </header>
              {renderCategorySections(selectedCategory, { onActivateCategory, onRepairLoginManager })}
            </section>
          )}
        </main>
      </div>
    </section>
  );
};
