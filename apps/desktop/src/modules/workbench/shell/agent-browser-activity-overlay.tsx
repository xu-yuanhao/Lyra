import {
  AGENT_BROWSER_OVERLAY_CLASS,
  AGENT_BROWSER_PAGE_GLOW_CLASS
} from "./classes";
import type { BrowserAgentVisualState } from "./use-workbench-browser-runtime";

type AgentBrowserActivityOverlayProps = {
  readonly state: BrowserAgentVisualState;
};

export const AgentBrowserActivityOverlay = ({
  state
}: AgentBrowserActivityOverlayProps) => {
  return (
    <div
      className={AGENT_BROWSER_OVERLAY_CLASS}
      data-active={state.active ? "true" : "false"}
      aria-hidden="true"
    >
      {state.active ? <span className={AGENT_BROWSER_PAGE_GLOW_CLASS} /> : null}
    </div>
  );
};
