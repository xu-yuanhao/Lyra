import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { cx } from "../ui-primitives";
import { TITLEBAR_CONTEXT_CLASS, TITLEBAR_CONTEXT_EMPTY_CLASS, TITLEBAR_CONTEXT_SCROLL_CLASS, TITLEBAR_CONTEXT_LEADING_CLASS, TITLEBAR_CONTEXT_META_CLASS, TITLEBAR_CONTEXT_CONTROLS_CLASS } from "./classes";

export type WorkbenchTitlebarContribution = {
  readonly ariaLabel: string;
  readonly content?: ReactNode;
  readonly leading?: ReactNode;
  readonly meta?: ReactNode;
  readonly controls?: ReactNode;
  readonly className?: string;
};

type WorkbenchTitlebarRegistry = {
  readonly registerContribution: (
    scopeId: string,
    contribution: WorkbenchTitlebarContribution
  ) => () => void;
};

const WorkbenchTitlebarRegistryContext =
  createContext<WorkbenchTitlebarRegistry | null>(null);
export const WorkbenchTitlebarActiveContributionContext =
  createContext<WorkbenchTitlebarContribution | null>(null);
const WorkbenchTitlebarScopeContext = createContext<string | null>(null);

export const WorkbenchTitlebarContextProvider = ({
  activeScopeId,
  children
}: {
  readonly activeScopeId: string | null;
  readonly children: ReactNode;
}) => {
  const [contributionByScope, setContributionByScope] = useState<
    Readonly<Record<string, WorkbenchTitlebarContribution>>
  >({});

  const registerContribution = useCallback((
    scopeId: string,
    contribution: WorkbenchTitlebarContribution
  ): (() => void) => {
    setContributionByScope((current) =>
      current[scopeId] === contribution
        ? current
        : { ...current, [scopeId]: contribution }
    );
    return () => {
      setContributionByScope((current) => {
        if (current[scopeId] !== contribution) {
          return current;
        }
        const next = { ...current };
        delete next[scopeId];
        return next;
      });
    };
  }, []);

  const registry = useMemo<WorkbenchTitlebarRegistry>(
    () => ({
      registerContribution
    }),
    [registerContribution]
  );
  const activeContribution =
    activeScopeId === null ? null : contributionByScope[activeScopeId] ?? null;

  return (
    <WorkbenchTitlebarRegistryContext.Provider value={registry}>
      <WorkbenchTitlebarActiveContributionContext.Provider value={activeContribution}>
        {children}
      </WorkbenchTitlebarActiveContributionContext.Provider>
    </WorkbenchTitlebarRegistryContext.Provider>
  );
};

export const WorkbenchTitlebarScopeProvider = ({
  scopeId,
  children
}: {
  readonly scopeId: string;
  readonly children: ReactNode;
}) => (
  <WorkbenchTitlebarScopeContext.Provider value={scopeId}>
    {children}
  </WorkbenchTitlebarScopeContext.Provider>
);

/**
 * Workspace tab id of the surface being rendered. Core-owned surfaces use it
 * to bind instances they mount inside a tab so app chrome resolves the tab.
 */
export const useWorkbenchTabScopeId = (): string | null =>
  useContext(WorkbenchTitlebarScopeContext);

export const useWorkbenchTitlebarContribution = (
  contribution: WorkbenchTitlebarContribution | null
): void => {
  const registry = useContext(WorkbenchTitlebarRegistryContext);
  const scopeId = useContext(WorkbenchTitlebarScopeContext);
  const contributionRef = useRef<WorkbenchTitlebarContribution | null>(null);

  useEffect(() => {
    if (registry === null || scopeId === null || contribution === null) {
      contributionRef.current = null;
      return undefined;
    }
    const previous = contributionRef.current;
    if (
      previous !== null
      && previous.ariaLabel === contribution.ariaLabel
      && previous.className === contribution.className
      && previous.content === contribution.content
      && previous.leading === contribution.leading
      && previous.meta === contribution.meta
      && previous.controls === contribution.controls
    ) {
      return undefined;
    }
    contributionRef.current = contribution;
    return registry.registerContribution(scopeId, contribution);
  }, [contribution, registry, scopeId]);
};

export const WorkbenchTitlebarContextSlot = () => {
  const contribution = useContext(WorkbenchTitlebarActiveContributionContext);

  if (contribution === null) {
    return <div className={cx(TITLEBAR_CONTEXT_CLASS, TITLEBAR_CONTEXT_EMPTY_CLASS)} aria-hidden="true" />;
  }

  return (
    <section
      className={cx(TITLEBAR_CONTEXT_CLASS, contribution.className)}
      aria-label={contribution.ariaLabel}
    >
      <div className={TITLEBAR_CONTEXT_SCROLL_CLASS}>
        {contribution.content ?? (
          <>
            {contribution.leading === undefined ? null : (
              <div className={TITLEBAR_CONTEXT_LEADING_CLASS}>{contribution.leading}</div>
            )}
            {contribution.meta === undefined ? null : (
              <div className={TITLEBAR_CONTEXT_META_CLASS}>{contribution.meta}</div>
            )}
            {contribution.controls === undefined ? null : (
              <div className={TITLEBAR_CONTEXT_CONTROLS_CLASS}>{contribution.controls}</div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
