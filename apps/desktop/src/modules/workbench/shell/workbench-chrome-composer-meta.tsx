import type { ChromeMetaItemV1, WorkbenchChromeScopeV1 } from "@lyra/app-runtime";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { AppButton } from "@renderer/ui/components";
import { BackgroundTerminalButton } from "../ai-panel/lyra-agents/features/chat/BackgroundTerminalButton";
import { ProjectDirChip } from "../ai-panel/lyra-agents/features/chat/ProjectDirChip";
import { executeWorkspaceAppCommand } from "../workspace-apps";
import { workbenchChromeBus } from "./workbench-chrome-bus";
import { useWorkbenchChromeBusContribution } from "./workbench-chrome-hooks";
import { PROJECT_META_ROW_CLASS } from "../ai-panel/lyra-agents/features/chat/classes";

export type ComposerMetaBuiltinProjectDirProps = React.ComponentProps<typeof ProjectDirChip>;
export type ComposerMetaBuiltinBackgroundTerminalProps = React.ComponentProps<
  typeof BackgroundTerminalButton
>;

export type ComposerMetaBuiltinContextValue = {
  readonly projectDir: ComposerMetaBuiltinProjectDirProps;
  readonly backgroundTerminal: ComposerMetaBuiltinBackgroundTerminalProps;
};

const ComposerMetaBuiltinContext = createContext<ComposerMetaBuiltinContextValue | null>(null);

const INACTIVE_AI_SESSION_CHROME_SCOPE: WorkbenchChromeScopeV1 = {
  kind: "aiSession",
  sessionId: "__lyra-chrome-inactive__"
};

export const CORE_COMPOSER_BUILTIN_META_ITEMS: readonly ChromeMetaItemV1[] = [
  { kind: "builtin", id: "projectDir", order: 0 }
];

const resolveComposerMetaChromeScope = (
  sessionId: string | null | undefined
): WorkbenchChromeScopeV1 => {
  const trimmed = typeof sessionId === "string" ? sessionId.trim() : "";
  if (trimmed.length === 0) {
    return INACTIVE_AI_SESSION_CHROME_SCOPE;
  }
  return { kind: "aiSession", sessionId: trimmed };
};

export const ComposerMetaBuiltinProvider = ({
  value,
  children
}: {
  readonly value: ComposerMetaBuiltinContextValue;
  readonly children: ReactNode;
}) => (
  <ComposerMetaBuiltinContext.Provider value={value}>
    {children}
  </ComposerMetaBuiltinContext.Provider>
);

const renderBuiltinMetaItem = (
  item: Extract<ChromeMetaItemV1, { readonly kind: "builtin" }>,
  builtins: ComposerMetaBuiltinContextValue
): ReactNode => {
  if (item.id === "projectDir") {
    return <ProjectDirChip key={item.id} {...builtins.projectDir} />;
  }
  if (item.id === "backgroundTerminal") {
    return <BackgroundTerminalButton key={item.id} {...builtins.backgroundTerminal} />;
  }
  return null;
};

const renderButtonMetaItem = (
  item: Extract<ChromeMetaItemV1, { readonly kind: "button" }>
): ReactNode => (
  <AppButton
    key={item.id}
    variant="ghost"
    size="sm"
    type="button"
    aria-label={item.label}
    title={item.label}
    disabled={item.disabled === true}
    aria-busy={item.busy ? "true" : undefined}
    data-status={item.status}
    onClick={() => {
      void executeWorkspaceAppCommand(item.commandId, {});
    }}
  >
    {item.label}
  </AppButton>
);

export const WorkbenchChromeComposerMetaRow = ({
  sessionId
}: {
  readonly sessionId: string | null | undefined;
}) => {
  const builtins = useContext(ComposerMetaBuiltinContext);
  const scope = useMemo(
    () => resolveComposerMetaChromeScope(sessionId),
    [sessionId]
  );
  const contribution = useWorkbenchChromeBusContribution(scope, "composerMeta");
  const metaItems =
    contribution?.metaItems !== undefined && contribution.metaItems.length > 0
      ? contribution.metaItems
      : CORE_COMPOSER_BUILTIN_META_ITEMS;

  if (builtins === null) {
    return null;
  }

  return (
    <div className={PROJECT_META_ROW_CLASS}>
      {metaItems.map((item) => {
        if (item.kind === "builtin") {
          return renderBuiltinMetaItem(item, builtins);
        }
        return renderButtonMetaItem(item);
      })}
    </div>
  );
};

export const useRegisterCoreComposerMetaChrome = (
  sessionId: string | null | undefined
): void => {
  useEffect(() => {
    const trimmed = typeof sessionId === "string" ? sessionId.trim() : "";
    if (trimmed.length === 0) {
      return undefined;
    }
    const scope = { kind: "aiSession" as const, sessionId: trimmed };
    workbenchChromeBus.set({
      scope,
      slot: "composerMeta",
      ownerId: "lyra.core",
      contribution: {
        metaItems: [...CORE_COMPOSER_BUILTIN_META_ITEMS]
      }
    });
    return () => {
      workbenchChromeBus.clear({
        scope,
        slot: "composerMeta",
        ownerId: "lyra.core"
      });
    };
  }, [sessionId]);
};
