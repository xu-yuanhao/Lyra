import type { WorkbenchChromeScopeV1 } from "@lyra/app-runtime";
import { CheckCheck, Trash2 } from "@lyra/icons";
import { TITLEBAR_CONTEXT_CLASS, TITLEBAR_CONTEXT_SCROLL_CLASS, TITLEBAR_CONTEXT_CONTROLS_CLASS, TITLEBAR_CONTEXT_CHIP_CLASS, TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS, TITLEBAR_CONTEXT_ICON_BUTTON_CLASS, TITLEBAR_CONTEXT_EMPTY_CLASS } from "./classes";
import {
  useContext,
  useMemo,
  type ComponentProps,
  type ReactNode
} from "react";

import { AppButton, AppIconButton } from "@renderer/ui/components";
import { executeWorkspaceAppCommand } from "../workspace-apps";
import { cx } from "../ui-primitives";
import {
  WorkbenchTitlebarActiveContributionContext,
  WorkbenchTitlebarContextProvider,
  WorkbenchTitlebarContextSlot
} from "./titlebar-context";
import { useWorkbenchChromeBusContribution } from "./workbench-chrome-hooks";
import { TitlebarNavigation, type TitlebarNavigationPrimaryActionKind } from "./titlebar-navigation";
import { useWorkspaceTabNavigationChrome } from "./titlebar-navigation-chrome";

export { useWorkbenchChromeBusContribution } from "./workbench-chrome-hooks";

const renderChromeActionIcon = (iconKey: string | undefined, size: number): ReactNode => {
  if (iconKey === "check-check") {
    return <CheckCheck size={size} aria-hidden="true" />;
  }
  if (iconKey === "trash-2") {
    return <Trash2 size={size} aria-hidden="true" />;
  }
  return null;
};

const WorkbenchChromeToolbarContextFromBus = ({
  scope
}: {
  readonly scope: WorkbenchChromeScopeV1;
}) => {
  const contribution = useWorkbenchChromeBusContribution(scope, "toolbarContext");
  if (contribution === null) {
    return null;
  }
  const actions = contribution.actions ?? [];
  const chips = contribution.chips ?? [];
  if (actions.length === 0 && chips.length === 0 && contribution.ariaLabel === undefined) {
    return null;
  }

  return (
    <div
      className={cx(TITLEBAR_CONTEXT_CLASS, "lyra-titlebar-context-from-bus")}
      aria-label={contribution.ariaLabel}
    >
      <div className={TITLEBAR_CONTEXT_SCROLL_CLASS}>
        {actions.length > 0 || chips.length > 0 ? (
          <>
            {actions.length > 0 ? (
              <div className={TITLEBAR_CONTEXT_CONTROLS_CLASS}>
                {actions.map((action) => (
                  action.display === "text" ? (
                    <AppButton
                      key={action.id}
                      variant="ghost"
                      size="sm"
                      className={cx(
                        TITLEBAR_CONTEXT_TEXT_BUTTON_CLASS,
                        action.active === true ? "lyra-titlebar-context-button-active" : undefined
                      )}
                      aria-pressed={action.active === true}
                      disabled={action.disabled === true}
                      onClick={() => {
                        void executeWorkspaceAppCommand(action.commandId, {});
                      }}
                    >
                      {action.label}
                    </AppButton>
                  ) : (
                    <AppIconButton
                      key={action.id}
                      className={cx(
                        TITLEBAR_CONTEXT_ICON_BUTTON_CLASS,
                        action.tone === "danger" ? "lyra-titlebar-context-danger" : undefined
                      )}
                      tone={action.tone === "danger" ? "danger" : "default"}
                      aria-label={action.label}
                      title={action.label}
                      disabled={action.disabled === true}
                      onClick={() => {
                        void executeWorkspaceAppCommand(action.commandId, {});
                      }}
                    >
                      {renderChromeActionIcon(action.iconKey, 14)}
                    </AppIconButton>
                  )
                ))}
              </div>
            ) : null}
            {chips.map((chip) => (
              <span key={chip.id} className={TITLEBAR_CONTEXT_CHIP_CLASS}>
                {chip.text}
              </span>
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
};

export const WorkbenchChromeToolbarContextSlot = ({
  activeTabId
}: {
  readonly activeTabId: string | null;
}) => {
  const legacyContribution = useContext(WorkbenchTitlebarActiveContributionContext);
  const busScope = useMemo(
    (): WorkbenchChromeScopeV1 | null =>
      activeTabId === null ? null : { kind: "workspaceTab", tabId: activeTabId },
    [activeTabId]
  );

  if (busScope === null && legacyContribution === null) {
    return <div className={cx(TITLEBAR_CONTEXT_CLASS, TITLEBAR_CONTEXT_EMPTY_CLASS)} aria-hidden="true" />;
  }

  return (
    <>
      {busScope === null ? null : <WorkbenchChromeToolbarContextFromBus scope={busScope} />}
      {legacyContribution === null ? null : <WorkbenchTitlebarContextSlot />}
    </>
  );
};

type TitlebarNavigationControlProps = ComponentProps<typeof TitlebarNavigation> & {
  readonly activeTabId: string | null;
};

export const WorkbenchChromeNavigationControl = ({
  activeTabId,
  ...navigationProps
}: TitlebarNavigationControlProps) => {
  const navigationOverride = useWorkspaceTabNavigationChrome(activeTabId);

  if (navigationOverride?.mode === "hidden") {
    return null;
  }

  if (navigationOverride?.mode === "readOnly") {
    const nav = navigationOverride;
    return (
      <TitlebarNavigation
        {...navigationProps}
        value={nav.value ?? navigationProps.value}
        placeholder={nav.placeholder ?? navigationProps.placeholder}
        ariaLabel={nav.ariaLabel ?? navigationProps.ariaLabel}
        primaryActionKind={
          (nav.primaryAction ?? navigationProps.primaryActionKind) as TitlebarNavigationPrimaryActionKind
        }
        onChange={() => undefined}
      />
    );
  }

  return <TitlebarNavigation {...navigationProps} />;
};

export { WorkbenchTitlebarContextProvider };
