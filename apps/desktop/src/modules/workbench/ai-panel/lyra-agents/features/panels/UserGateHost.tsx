import { useEffect, useMemo, useRef } from "react";

import type { AgentPlanReviewRespondAction, AgentPlanSnapshot } from "../../../../../../shared/agent";
import type { ComposerPermissionMode, DecisionQuestion, PermissionRequest } from "../../core/types";
import { DecisionPanel } from "./DecisionPanel";
import { PermissionPanel } from "./PermissionPanel";
import { PlanReviewPanel } from "./PlanReviewPanel";
import {
  USER_GATE_HOST_CLASS,
} from "./classes";

export const USER_GATE_IDLE_MS = 10_000;

type UserGateHostProps = {
  readonly sessionId: string;
  readonly permissionMode: ComposerPermissionMode;
  readonly showDecisions: boolean;
  readonly showPermission: boolean;
  readonly decisions: readonly DecisionQuestion[];
  readonly permissions: readonly PermissionRequest[];
  readonly planReview: AgentPlanSnapshot | null;
  readonly onSubmitDecisions: (answers: Record<string, string>) => void | Promise<void>;
  readonly onApprovePermission: (id: string) => void | Promise<void>;
  readonly onDenyPermission: (id: string) => void | Promise<void>;
  readonly onOpenPlanReview: (plan: AgentPlanSnapshot) => void | Promise<void>;
  readonly onRespondPlanReview: (
    action: AgentPlanReviewRespondAction,
    feedback?: string | null
  ) => void | Promise<void>;
  readonly autoResolve?: ((request: { readonly gateId: string }) => Promise<unknown>) | null;
  readonly touchActivity?: ((request: { readonly gateId: string }) => Promise<unknown>) | null;
};

type VisibleGate = {
  readonly id: string;
  readonly kind: "clarification" | "permission" | "plan_review";
};

export const planReviewGateId = (sessionId: string): string => `plan-review:${sessionId}`;

export function UserGateHost({
  sessionId,
  permissionMode,
  showDecisions,
  showPermission,
  decisions,
  permissions,
  planReview,
  onSubmitDecisions,
  onApprovePermission,
  onDenyPermission,
  onOpenPlanReview,
  onRespondPlanReview,
  autoResolve = null,
  touchActivity = null
}: UserGateHostProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const lastActivityAtRef = useRef(Date.now());
  const inFlightRef = useRef(false);
  const visibleGates = useMemo<readonly VisibleGate[]>(() => {
    const gates: VisibleGate[] = [];
    if (showPermission) {
      for (const permission of permissions) {
        gates.push({ id: permission.id, kind: "permission" });
      }
    }
    if (showDecisions) {
      for (const decision of decisions) {
        gates.push({ id: decision.id, kind: "clarification" });
      }
    }
    if (planReview !== null && planReview.phase === "reviewing") {
      gates.push({ id: planReviewGateId(sessionId), kind: "plan_review" });
    }
    return gates;
  }, [decisions, permissions, planReview, sessionId, showDecisions, showPermission]);
  const gateKey = visibleGates.map((gate) => gate.id).join("|");

  useEffect(() => {
    lastActivityAtRef.current = Date.now();
  }, [gateKey]);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null || visibleGates.length === 0) {
      return;
    }
    const bump = (): void => {
      lastActivityAtRef.current = Date.now();
      const gateId = visibleGates[0]?.id;
      if (gateId !== undefined && touchActivity !== null) {
        void touchActivity({ gateId });
      }
    };
    const events: Array<keyof HTMLElementEventMap> = [
      "pointerdown",
      "keydown",
      "input",
      "focusin"
    ];
    for (const event of events) {
      host.addEventListener(event, bump);
    }
    return () => {
      for (const event of events) {
        host.removeEventListener(event, bump);
      }
    };
  }, [touchActivity, visibleGates]);

  useEffect(() => {
    if (
      permissionMode !== "autonomous"
      || autoResolve === null
      || visibleGates.length === 0
    ) {
      return;
    }
    const tick = window.setInterval(() => {
      if (inFlightRef.current) {
        return;
      }
      if (Date.now() - lastActivityAtRef.current < USER_GATE_IDLE_MS) {
        return;
      }
      const gateId = visibleGates[0]?.id;
      if (gateId === undefined) {
        return;
      }
      inFlightRef.current = true;
      void autoResolve({ gateId }).finally(() => {
        inFlightRef.current = false;
        lastActivityAtRef.current = Date.now();
      });
    }, 250);
    return () => {
      window.clearInterval(tick);
    };
  }, [autoResolve, permissionMode, visibleGates]);

  if (visibleGates.length === 0) {
    return null;
  }

  return (
    <div
      ref={hostRef}
      className={USER_GATE_HOST_CLASS}
      data-user-gate-count={String(visibleGates.length)}
    >
      {showPermission && permissions.length > 0 ? (
        <PermissionPanel
          requests={[...permissions]}
          onApprove={onApprovePermission}
          onDeny={onDenyPermission}
          progress={1}
          onTap={() => undefined}
        />
      ) : null}
      {showDecisions && decisions.length > 0 ? (
        <DecisionPanel
          questions={[...decisions]}
          onSubmit={onSubmitDecisions}
          onDismiss={() => undefined}
          progress={1}
          onTap={() => undefined}
        />
      ) : null}
      <PlanReviewPanel
        plan={planReview}
        onReview={onOpenPlanReview}
        onRespond={onRespondPlanReview}
      />
    </div>
  );
}
