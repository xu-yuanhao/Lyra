import { BookText, Eye, Archive, Check } from "@lyra/icons";
import type {
  AgentPlanReviewRespondAction,
  AgentPlanSnapshot
} from "../../../../../../shared/agent";
import { Button } from "@renderer/ui/components/button";
import { t } from "@workbench/i18n";
import {
  PANEL_BASE_CLASS,
  PANEL_HEADER_CLASS,
  PANEL_ICON_CLASS,
  PANEL_TITLE_BLOCK_CLASS,
  PANEL_QUESTION_CLASS,
  PANEL_DETAIL_CLASS,
  PLAN_REVIEW_PANEL_CLASS,
  PLAN_REVIEW_ACTIONS_CLASS,
  PLAN_REVIEW_BTN_CLASS,
  PLAN_REVIEW_BTN_APPROVE_CLASS,
  PLAN_REVIEW_BTN_SET_ASIDE_CLASS,
} from "./classes";

export function PlanReviewPanel({
  plan,
  onReview,
  onRespond
}: {
  plan: AgentPlanSnapshot | null;
  onReview: (plan: AgentPlanSnapshot) => void | Promise<void>;
  onRespond: (action: AgentPlanReviewRespondAction, feedback?: string | null) => void | Promise<void>;
}) {
  if (plan === null || plan.phase !== "reviewing") return null;

  const summary = plan.review.summary?.trim() || plan.reason?.trim() || t("planReview.ready");
  const primaryAction: AgentPlanReviewRespondAction =
    plan.review.status === "changed" ? "request_revision" : "approve";
  const primaryLabel =
    plan.review.status === "changed" ? t("planReview.revise") : t("planReview.approve");

  return (
    <div className={`${PANEL_BASE_CLASS} ${PLAN_REVIEW_PANEL_CLASS}`}>
      <div className={PANEL_HEADER_CLASS}>
        <span className={PANEL_ICON_CLASS}>
          <BookText size={14} strokeWidth={2} />
        </span>
        <div className={PANEL_TITLE_BLOCK_CLASS}>
          <p className={PANEL_QUESTION_CLASS}>{plan.title}</p>
          <p className={PANEL_DETAIL_CLASS}>{summary}</p>
        </div>
      </div>
      <div className={PLAN_REVIEW_ACTIONS_CLASS}>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className={PLAN_REVIEW_BTN_CLASS}
          onClick={() => { void onReview(plan); }}
        >
          <Eye size={13} strokeWidth={2.1} />
          {t("planReview.review")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className={`${PLAN_REVIEW_BTN_CLASS} ${PLAN_REVIEW_BTN_SET_ASIDE_CLASS}`}
          onClick={() => { void onRespond("set_aside"); }}
        >
          <Archive size={13} strokeWidth={2.1} />
          {t("planReview.setAside")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className={`${PLAN_REVIEW_BTN_CLASS} ${PLAN_REVIEW_BTN_APPROVE_CLASS}`}
          onClick={() => { void onRespond(primaryAction); }}
        >
          <Check size={13} strokeWidth={2.1} />
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
