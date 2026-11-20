import { useMemo } from "react";

import { createWorkbenchChromeLabels } from "./use-workbench-action-api";
import type { useWorkbenchLabels } from "./use-workbench-labels";

type WorkbenchLabels = ReturnType<typeof useWorkbenchLabels>;
type Translator = Parameters<typeof createWorkbenchChromeLabels>[0];

/** Chrome and suggestion labels derived from the active language bundle. */
export const useWorkbenchChromeLabels = (
  t: Translator,
  labels: WorkbenchLabels
): {
  readonly workbenchChromeLabels: ReturnType<typeof createWorkbenchChromeLabels>;
  readonly historyAppSuggestionLabels: {
    readonly sessions: string;
    readonly archivedSessions: string;
    readonly browserHistory: string;
  };
} => {
  const workbenchChromeLabels = useMemo(() => createWorkbenchChromeLabels(t), [t]);
  const historyAppSuggestionLabels = useMemo(() => ({
    sessions: labels.agentSessionHistory.categorySessions,
    archivedSessions: labels.agentSessionHistory.categoryArchivedSessions,
    browserHistory: labels.agentSessionHistory.categoryBrowserHistory
  }), [labels.agentSessionHistory]);
  return { workbenchChromeLabels, historyAppSuggestionLabels };
};
