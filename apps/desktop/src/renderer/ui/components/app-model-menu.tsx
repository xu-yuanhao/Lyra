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
} from "../primitives";
import { cn } from "../utils";

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
          "lyra-app-model-menu-item",
          option.icon === undefined ? "" : "lyra-app-model-menu-item-with-icon"
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
          <span className="lyra-app-model-menu-option-icon" aria-hidden="true">
            {option.icon}
          </span>
        )}
        <span className="lyra-app-model-menu-item-label">
          {option.label}
        </span>
        {active ? (
          <Check className="lyra-ui-menu-check" aria-hidden="true" />
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
            "lyra-app-model-menu-item lyra-app-model-menu-sub-trigger",
            option.icon === undefined ? "" : "lyra-app-model-menu-item-with-icon"
          )}
          data-active={option.value === value ? "true" : undefined}
          {...(optionText === undefined ? {} : { textValue: optionText })}
        >
          {option.icon === undefined ? null : (
            <span className="lyra-app-model-menu-option-icon" aria-hidden="true">
              {option.icon}
            </span>
          )}
          <span className="lyra-app-model-menu-item-label">
            {option.label}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent
          className="lyra-app-model-menu-sub-content"
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
                  className="lyra-app-model-menu-item"
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
                  <span className="lyra-app-model-menu-item-label">
                    {effort.label}
                  </span>
                  {active ? (
                    <Check className="lyra-ui-menu-check" aria-hidden="true" />
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
        className={cn("lyra-ui-select-trigger lyra-app-model-menu-trigger", className)}
        aria-label={ariaLabel}
        title={labelText(effectiveTriggerLabel) ?? ariaLabel}
        disabled={disabled || allOptions.length === 0}
        data-has-icon={triggerIcon === undefined ? undefined : "true"}
      >
        <span className="lyra-ui-select-trigger-value">
          {triggerIcon === undefined ? null : (
            <span className="lyra-app-model-menu-option-icon" aria-hidden="true">
              {triggerIcon}
            </span>
          )}
          <span className="lyra-ui-select-trigger-label">{effectiveTriggerLabel}</span>
        </span>
        <ChevronDown className="lyra-ui-select-chevron" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className={cn("lyra-app-model-menu-content", contentClassName)}
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
                    className="lyra-app-model-menu-group-header"
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
                    <span className="lyra-app-model-menu-group-line" aria-hidden="true" />
                    <span className="lyra-app-model-menu-group-label">
                      {group.label}
                    </span>
                    <span className="lyra-app-model-menu-group-line" aria-hidden="true" />
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
                      className="lyra-app-model-menu-sub-trigger"
                      aria-label={
                        currentLabelText === undefined
                          ? submenu.ariaLabel
                          : `${submenu.ariaLabel} ${currentLabelText}`
                      }
                      {...submenuDisabledProps}
                    >
                      <span className="lyra-app-model-menu-sub-label">
                        {submenu.label}
                      </span>
                      <span className="lyra-app-model-menu-sub-value">
                        {currentLabel}
                      </span>
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent
                      className="lyra-app-model-menu-sub-content"
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
                              "lyra-app-model-menu-item",
                              option.icon === undefined ? "" : "lyra-app-model-menu-item-with-icon"
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
                              <span className="lyra-app-model-menu-option-icon" aria-hidden="true">
                                {option.icon}
                              </span>
                            )}
                            <span className="lyra-app-model-menu-item-label">
                              {option.label}
                            </span>
                            {active ? (
                              <Check className="lyra-ui-menu-check" aria-hidden="true" />
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
