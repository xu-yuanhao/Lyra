import { Check, ChevronDown } from "@lyra/icons";
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "./dropdown-menu";
import {
  APP_SELECT_CHEVRON_CLASS,
  APP_SELECT_TRIGGER_CLASS,
  APP_SELECT_TRIGGER_LABEL_CLASS,
  APP_SELECT_TRIGGER_VALUE_CLASS
} from "./app-select";
import { cn } from "../utils";

const MODEL_MENU_SCROLLBAR_CLASS = cn(
  "[scrollbar-width:thin] [scrollbar-color:var(--lyra-scrollbar-thumb-idle)_transparent]",
  "[&::-webkit-scrollbar]:size-[var(--lyra-space-6)] [&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:min-h-[var(--lyra-space-32)] [&::-webkit-scrollbar-thumb]:rounded-[var(--lyra-radius-pill)] [&::-webkit-scrollbar-thumb]:bg-[var(--lyra-scrollbar-thumb-idle)]",
  "[&::-webkit-scrollbar-thumb:hover]:bg-[var(--lyra-scrollbar-thumb-hover)]"
);

const MODEL_MENU_CONTENT_CLASS = cn(
  "lyra-app-model-menu-content lyra-app-model-menu-sub-content",
  "min-w-[min(max(var(--radix-dropdown-menu-trigger-width,var(--lyra-unit-180)),var(--lyra-unit-180)),var(--radix-dropdown-menu-content-available-width,calc(100vw_-_var(--lyra-space-24))))]",
  "max-w-[min(var(--lyra-app-model-menu-max-width,var(--lyra-unit-320)),var(--radix-dropdown-menu-content-available-width,calc(100vw_-_var(--lyra-space-24))))]",
  MODEL_MENU_SCROLLBAR_CLASS
);

const MODEL_MENU_ITEM_CLASS =
  "lyra-app-model-menu-item grid min-h-[var(--lyra-control-h-28)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[var(--lyra-space-8)] rounded-[var(--lyra-radius-6)] px-[var(--lyra-space-8)] py-0 text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)] text-[var(--lyra-text-secondary)] outline-none select-none";

const MODEL_MENU_ITEM_WITH_ICON_CLASS =
  "lyra-app-model-menu-item-with-icon grid-cols-[var(--lyra-icon-size-16)_minmax(0,1fr)_auto]";

const MODEL_MENU_OPTION_ICON_CLASS = cn(
  "lyra-app-model-menu-option-icon inline-flex size-[var(--lyra-icon-size-16)] shrink-0 items-center justify-center text-[var(--lyra-text-secondary)]",
  "[&_svg]:size-[var(--lyra-icon-size-16)] [&_.lyra-agent-provider-brand-icon]:size-[var(--lyra-icon-size-16)]"
);

const MODEL_MENU_CHECK_CLASS =
  "lyra-ui-menu-check size-[var(--lyra-icon-size-14)] text-[var(--lyra-text-primary)] [stroke-width:1.8]";

const MODEL_MENU_LABEL_CLASS =
  "lyra-app-model-menu-item-label min-w-0 overflow-hidden text-left text-ellipsis whitespace-nowrap";

type DropdownMenuContentProps = ComponentProps<typeof DropdownMenuContent>;

export type AppModelMenuOption<TValue extends string = string> = {
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly value: TValue;
};

export type AppModelMenuSubmenu<TValue extends string = string> = {
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly id: string;
  readonly label: ReactNode;
  readonly onValueChange: (value: TValue) => void;
  readonly options: readonly AppModelMenuOption<TValue>[];
  readonly value: TValue;
};

export type AppModelMenuGroup<TValue extends string = string> = {
  readonly label: ReactNode;
  readonly options: readonly AppModelMenuOption<TValue>[];
};

export type AppModelMenuProps<TModelValue extends string = string> = {
  readonly ariaLabel: string;
  readonly className?: string;
  readonly collisionBoundary?: DropdownMenuContentProps["collisionBoundary"];
  readonly collisionPadding?: DropdownMenuContentProps["collisionPadding"];
  readonly contentClassName?: string;
  readonly disabled?: boolean;
  readonly groups?: readonly AppModelMenuGroup<TModelValue>[];
  readonly onModelChange: (value: TModelValue) => void;
  readonly options: readonly AppModelMenuOption<TModelValue>[];
  readonly placeholder?: ReactNode;
  /** Keep menus near bottom-anchored composer controls above their trigger. */
  readonly side?: DropdownMenuContentProps["side"];
  readonly submenus?: readonly AppModelMenuSubmenu[];
  /** Shown when hovering a model row (reasoning effort, etc.). */
  readonly optionSubmenus?: readonly AppModelMenuSubmenu[];
  /** Trigger display override; the opening menu rows keep using option labels. */
  readonly triggerLabel?: ReactNode;
  readonly onOptionSubmenuSelect?: (
    modelId: TModelValue,
    submenuId: string,
    value: string
  ) => void;
  readonly value: TModelValue;
};

const labelText = (label: ReactNode): string | undefined =>
  typeof label === "string" ? label : undefined;

export const AppModelMenu = <TModelValue extends string = string>({
  ariaLabel,
  className,
  collisionBoundary,
  collisionPadding = 8,
  contentClassName,
  disabled = false,
  groups,
  onModelChange,
  options,
  placeholder,
  side,
  submenus = [],
  optionSubmenus = [],
  onOptionSubmenuSelect,
  triggerLabel,
  value
}: AppModelMenuProps<TModelValue>) => {
  const [open, setOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(() => new Set());
  const [submenuGeneration, setSubmenuGeneration] = useState(0);
  const submenuScrollLock = useRef(false);
  const submenuScrollTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (submenuScrollTimer.current !== null) {
      window.clearTimeout(submenuScrollTimer.current);
    }
  }, []);
  const closeSubmenusOnScroll = () => {
    if (!submenuScrollLock.current) {
      submenuScrollLock.current = true;
      setSubmenuGeneration((current) => current + 1);
    }
    if (submenuScrollTimer.current !== null) {
      window.clearTimeout(submenuScrollTimer.current);
    }
    submenuScrollTimer.current = window.setTimeout(() => {
      submenuScrollLock.current = false;
      submenuScrollTimer.current = null;
    }, 160);
  };
  const allOptions = groups !== undefined
    ? groups.flatMap((group) => group.options)
    : options;
  const selectedOption = allOptions.find((option) => option.value === value);
  const effectiveTriggerLabel =
    triggerLabel === undefined
      ? (selectedOption?.label ?? placeholder ?? ariaLabel)
      : triggerLabel;
  const triggerIcon = selectedOption?.icon;
  const enabledSubmenus = submenus.filter((submenu) => submenu.options.length > 0);
  const enabledOptionSubmenus = optionSubmenus.filter((submenu) => submenu.options.length > 0);
  const hasGroups = groups !== undefined && groups.length > 0;

  const renderOption = (option: AppModelMenuOption<TModelValue>) => {
    const active = option.value === value;
    const textValue = labelText(option.label);
    const disabledProps = option.disabled === undefined
      ? {}
      : { disabled: option.disabled };
    const textValueProps = textValue === undefined
      ? {}
      : { textValue };

    return (
      <DropdownMenuItem
        key={option.value}
        className={cn(
          MODEL_MENU_ITEM_CLASS,
          "group/model-menu-item",
          option.icon === undefined ? "" : MODEL_MENU_ITEM_WITH_ICON_CLASS
        )}
        data-active={active ? "true" : undefined}
        onSelect={() => {
          onModelChange(option.value);
          setOpen(false);
        }}
        {...disabledProps}
        {...textValueProps}
      >
        {option.icon === undefined ? null : (
          <span className={cn(MODEL_MENU_OPTION_ICON_CLASS, "group-data-[highlighted]/model-menu-item:text-[var(--lyra-text-primary)] group-data-[active=true]/model-menu-item:text-[var(--lyra-text-primary)]")} aria-hidden="true">
            {option.icon}
          </span>
        )}
        <span className={MODEL_MENU_LABEL_CLASS}>
          {option.label}
        </span>
        {active ? (
          <Check className={MODEL_MENU_CHECK_CLASS} aria-hidden="true" />
        ) : null}
      </DropdownMenuItem>
    );
  };

  const renderModelRow = (option: AppModelMenuOption<TModelValue>) => {
    if (enabledOptionSubmenus.length === 0) {
      return renderOption(option);
    }
    const optionText = labelText(option.label);
    return (
      <DropdownMenuSub key={`${option.value}:${submenuGeneration}`}>
        <DropdownMenuSubTrigger
          className={cn(
            MODEL_MENU_ITEM_CLASS,
            "lyra-app-model-menu-sub-trigger grid-cols-[minmax(0,1fr)_auto_var(--lyra-icon-size-14)]",
            "group/model-menu-item",
            option.icon === undefined ? "" : cn(MODEL_MENU_ITEM_WITH_ICON_CLASS, "grid-cols-[var(--lyra-icon-size-16)_minmax(0,1fr)_var(--lyra-icon-size-14)]")
          )}
          data-active={option.value === value ? "true" : undefined}
          {...(optionText === undefined ? {} : { textValue: optionText })}
        >
          {option.icon === undefined ? null : (
            <span className={cn(MODEL_MENU_OPTION_ICON_CLASS, "group-data-[highlighted]/model-menu-item:text-[var(--lyra-text-primary)] group-data-[active=true]/model-menu-item:text-[var(--lyra-text-primary)]")} aria-hidden="true">
              {option.icon}
            </span>
          )}
          <span className={MODEL_MENU_LABEL_CLASS}>
            {option.label}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className={cn(MODEL_MENU_CONTENT_CLASS, contentClassName)}
          alignOffset={-4}
          collisionPadding={collisionPadding}
          hideWhenDetached
          updatePositionStrategy="always"
          {...(collisionBoundary === undefined ? {} : { collisionBoundary })}
        >
          {enabledOptionSubmenus.flatMap((submenu) =>
            submenu.options.map((effort) => {
              const active = option.value === value && effort.value === submenu.value;
              const effortText = labelText(effort.label);
              return (
                <DropdownMenuItem
                  key={`${submenu.id}:${effort.value}`}
                  className={cn(MODEL_MENU_ITEM_CLASS, "lyra-app-model-menu-item")}
                  data-active={active ? "true" : undefined}
                  onSelect={() => {
                    if (onOptionSubmenuSelect === undefined) {
                      onModelChange(option.value);
                      submenu.onValueChange(effort.value);
                    } else {
                      onOptionSubmenuSelect(option.value, submenu.id, effort.value);
                    }
                    setOpen(false);
                  }}
                  {...(effort.disabled === undefined ? {} : { disabled: effort.disabled })}
                  {...(effortText === undefined ? {} : { textValue: effortText })}
                >
                  <span className={MODEL_MENU_LABEL_CLASS}>
                    {effort.label}
                  </span>
                  {active ? (
                    <Check className={MODEL_MENU_CHECK_CLASS} aria-hidden="true" />
                  ) : null}
                </DropdownMenuItem>
              );
            })
          )}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  return (
    <DropdownMenu
      open={open}
      onOpenChange={setOpen}
      modal={false}
    >
      <DropdownMenuTrigger
        className={cn(APP_SELECT_TRIGGER_CLASS, "lyra-app-model-menu-trigger cursor-default", className)}
        aria-label={ariaLabel}
        title={labelText(effectiveTriggerLabel) ?? ariaLabel}
        disabled={disabled || allOptions.length === 0}
        data-has-icon={triggerIcon === undefined ? undefined : "true"}
      >
        <span className={cn(APP_SELECT_TRIGGER_VALUE_CLASS, triggerIcon !== undefined && "inline-flex min-w-0 items-center gap-[var(--lyra-space-6)]")}>
          {triggerIcon === undefined ? null : (
            <span className={MODEL_MENU_OPTION_ICON_CLASS} aria-hidden="true">
              {triggerIcon}
            </span>
          )}
          <span className={APP_SELECT_TRIGGER_LABEL_CLASS}>{effectiveTriggerLabel}</span>
        </span>
        <ChevronDown className={APP_SELECT_CHEVRON_CLASS} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn(MODEL_MENU_CONTENT_CLASS, contentClassName)}
        align="start"
        collisionPadding={collisionPadding}
        {...(side === undefined ? {} : { side })}
        {...(collisionBoundary === undefined ? {} : { collisionBoundary })}
        onScroll={closeSubmenusOnScroll}
      >
        {hasGroups ? (
          <DropdownMenuGroup>
            {groups.map((group, groupIndex) => {
              const isCollapsed = collapsedGroups.has(groupIndex);
              return (
                <DropdownMenuGroup key={groupIndex}>
                  <DropdownMenuItem
                    className="lyra-app-model-menu-group-header flex items-center justify-center gap-[var(--lyra-space-8)] px-[var(--lyra-space-8)] py-[var(--lyra-space-4)] text-[var(--lyra-text-muted)] text-[length:var(--lyra-text-size-caption)] select-none hover:bg-transparent hover:text-[var(--lyra-text-secondary)] [&:hover_.lyra-app-model-menu-group-label]:text-[var(--lyra-text-secondary)] [&:hover_.lyra-app-model-menu-group-line]:bg-[color-mix(in_srgb,var(--lyra-text-muted)_52%,transparent)] focus-visible:outline-[length:var(--lyra-stroke-strong)] focus-visible:outline-solid focus-visible:outline-[var(--lyra-app-focus)] focus-visible:outline-offset-[var(--lyra-space-2)]"
                    data-collapsed={isCollapsed ? "true" : undefined}
                    onSelect={(e) => {
                      e.preventDefault();
                      setCollapsedGroups((prev) => {
                        const next = new Set(prev);
                        if (next.has(groupIndex)) next.delete(groupIndex);
                        else next.add(groupIndex);
                        return next;
                      });
                    }}
                  >
                    <span className="lyra-app-model-menu-group-line h-[var(--lyra-space-1)] flex-[1_1_var(--lyra-space-40)] min-w-[var(--lyra-space-16)] rounded-[var(--lyra-radius-pill)] bg-[color-mix(in_srgb,var(--lyra-app-border)_68%,transparent)] transition-[background_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)]" aria-hidden="true" />
                    <span className="lyra-app-model-menu-group-label flex-none inline-flex items-center gap-[var(--lyra-space-4)] text-[var(--lyra-text-muted)] whitespace-nowrap transition-[color_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)]">
                      {group.label}
                    </span>
                    <span className="lyra-app-model-menu-group-line h-[var(--lyra-space-1)] flex-[1_1_var(--lyra-space-40)] min-w-[var(--lyra-space-16)] rounded-[var(--lyra-radius-pill)] bg-[color-mix(in_srgb,var(--lyra-app-border)_68%,transparent)] transition-[background_var(--lyra-motion-fast-duration)_var(--lyra-ease-fast)]" aria-hidden="true" />
                  </DropdownMenuItem>
                  {isCollapsed ? null : group.options.map(renderModelRow)}
                </DropdownMenuGroup>
              );
            })}
          </DropdownMenuGroup>
        ) : (
          <DropdownMenuGroup>
            {options.map(renderModelRow)}
          </DropdownMenuGroup>
        )}
        {enabledSubmenus.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {enabledSubmenus.map((submenu) => {
                const currentOption = submenu.options.find((option) => option.value === submenu.value);
                const currentLabel = currentOption?.label ?? submenu.value;
                const currentLabelText = labelText(currentLabel);
                const submenuDisabledProps = submenu.disabled === undefined
                  ? {}
                  : { disabled: submenu.disabled };

                return (
                  <DropdownMenuSub key={`${submenu.id}:${submenuGeneration}`}>
                    <DropdownMenuSubTrigger
                      className={cn(
                        MODEL_MENU_ITEM_CLASS,
                        "lyra-app-model-menu-sub-trigger grid-cols-[minmax(0,1fr)_auto_var(--lyra-icon-size-14)]"
                      )}
                      aria-label={
                        currentLabelText === undefined
                          ? submenu.ariaLabel
                          : `${submenu.ariaLabel} ${currentLabelText}`
                      }
                      {...submenuDisabledProps}
                    >
                      <span className="lyra-app-model-menu-sub-label min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                        {submenu.label}
                      </span>
                      <span className="lyra-app-model-menu-sub-value min-w-0 max-w-[var(--lyra-unit-80)] overflow-hidden text-ellipsis whitespace-nowrap text-[length:var(--lyra-text-size-caption)] text-[var(--lyra-text-muted)]">
                        {currentLabel}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className={MODEL_MENU_CONTENT_CLASS}
                      alignOffset={-4}
                      collisionPadding={collisionPadding}
                      hideWhenDetached
                      updatePositionStrategy="always"
                      {...(collisionBoundary === undefined ? {} : { collisionBoundary })}
                    >
                      {submenu.options.map((option) => {
                        const active = option.value === submenu.value;
                        const textValue = labelText(option.label);
                        const disabledProps = option.disabled === undefined
                          ? {}
                          : { disabled: option.disabled };
                        const textValueProps = textValue === undefined
                          ? {}
                          : { textValue };

                        return (
                          <DropdownMenuItem
                            key={option.value}
                            className={cn(
                              MODEL_MENU_ITEM_CLASS,
                              "group/model-menu-item",
                              option.icon === undefined ? "" : MODEL_MENU_ITEM_WITH_ICON_CLASS
                            )}
                            data-active={active ? "true" : undefined}
                            onSelect={() => {
                              submenu.onValueChange(option.value);
                              setOpen(false);
                            }}
                            {...disabledProps}
                            {...textValueProps}
                          >
                            {option.icon === undefined ? null : (
                              <span className={cn(MODEL_MENU_OPTION_ICON_CLASS, "group-data-[highlighted]/model-menu-item:text-[var(--lyra-text-primary)] group-data-[active=true]/model-menu-item:text-[var(--lyra-text-primary)]")} aria-hidden="true">
                                {option.icon}
                              </span>
                            )}
                            <span className={MODEL_MENU_LABEL_CLASS}>
                              {option.label}
                            </span>
                            {active ? (
                              <Check className={MODEL_MENU_CHECK_CLASS} aria-hidden="true" />
                            ) : null}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                );
              })}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
