import { useEffect, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, ArrowUp, HelpCircle, Info } from "@lyra/icons";
import { t } from "@workbench/i18n";
import type { DecisionQuestion } from "../../core/types";
import { AppButton, AppInput, AppTooltip } from "@renderer/ui/components";
import {
  PANEL_BASE_CLASS,
  PANEL_HEADER_CLASS,
  PANEL_ICON_CLASS,
  PANEL_TITLE_BLOCK_CLASS,
  PANEL_QUESTION_CLASS,
  PANEL_DETAIL_CLASS,
  PANEL_NAV_CLASS,
  PANEL_COUNTER_CLASS,
  PANEL_BODY_CLASS,
  PANEL_BODY_CONTENT_CLASS,
  PANEL_OPTIONS_CLASS,
  PANEL_OPTION_CLASS,
  PANEL_OPTION_CUSTOM_CLASS,
  PANEL_OPTION_LABEL_CLASS,
  PANEL_OPTION_INFO_CLASS,
  PANEL_CUSTOM_INPUT_CLASS,
  PANEL_ANSWER_ROW_CLASS,
  PANEL_ANSWER_SPACER_CLASS,
  PANEL_NAV_BTN_CLASS,
  PANEL_SUBMIT_CLASS,
} from "./classes";

export type { DecisionQuestion } from "../../core/types";

/**
 * Decision panel that sits above the lyra-agents-composer.
 * `progress` (0–1) controls how much of the body is revealed:
 *   0 = collapsed (question only), 1 = fully expanded.
 */
export function DecisionPanel({
  questions,
  onSubmit,
  onDismiss: _onDismiss,
  progress,
  onTap,
}: {
  questions: DecisionQuestion[];
  onSubmit: (answers: Record<string, string>) => void | Promise<void>;
  onDismiss: () => void;
  progress: number;
  onTap: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [customActive, setCustomActive] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCurrentIndex((index) => Math.min(index, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  if (questions.length === 0) return null;

  const q = questions[currentIndex] ?? questions[0];
  if (q === undefined) return null;
  const questionText = q.displayQuestion ?? q.question;
  const detailText = q.displayDetail ?? q.detail;
  const hasMultipleQuestions = questions.length > 1;
  const canPrev = currentIndex > 0;
  const canNext = currentIndex < questions.length - 1;

  const customAllowed = q.options.length === 0 || q.allowCustomAnswer !== false;
  const isCustom = q.options.length === 0 || (customActive[q.id] ?? false);
  const customValue = customInputs[q.id] ?? "";
  const selectedOption = answers[q.id] ?? null;

  const allAnswered = questions.every((question) => {
    const ans = answers[question.id];
    return ans && ans.trim().length > 0;
  });

  const selectOption = (opt: string) => {
    if (!customAllowed && !hasMultipleQuestions) {
      void onSubmit({ [q.id]: opt });
      return;
    }
    setAnswers((a) => ({ ...a, [q.id]: opt }));
    setCustomActive((c) => ({ ...c, [q.id]: false }));
  };

  const activateCustom = () => {
    if (!customAllowed) return;
    setCustomActive((c) => ({ ...c, [q.id]: true }));
    setAnswers((a) => ({ ...a, [q.id]: customValue }));
  };

  const updateCustom = (val: string) => {
    setCustomInputs((c) => ({ ...c, [q.id]: val }));
    setAnswers((a) => ({ ...a, [q.id]: val }));
  };

  const handleSubmit = () => {
    if (!allAnswered) return;
    void onSubmit(answers);
  };

  const isCollapsed = progress < 0.1;

  return (
    <div
      className={PANEL_BASE_CLASS}
      onClick={isCollapsed ? onTap : undefined}
      style={{ cursor: isCollapsed ? "pointer" : undefined }}
    >
      {/* Header: always visible */}
      <div className={PANEL_HEADER_CLASS}>
        <span className={PANEL_ICON_CLASS}>
          <HelpCircle size={14} strokeWidth={2} />
        </span>
        <div className={PANEL_TITLE_BLOCK_CLASS}>
          <p className={PANEL_QUESTION_CLASS}>{questionText}</p>
          {detailText ? <p className={PANEL_DETAIL_CLASS}>{detailText}</p> : null}
        </div>
        {hasMultipleQuestions ? (
          <div className={PANEL_NAV_CLASS}>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={PANEL_NAV_BTN_CLASS}
              disabled={!canPrev}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i - 1); }}
              aria-label={t("decision.prevQuestion")}
            >
              <ChevronLeft size={14} strokeWidth={2.1} />
            </AppButton>
            <span className={PANEL_COUNTER_CLASS}>
              {currentIndex + 1}/{questions.length}
            </span>
            <AppButton variant="ghost" size="sm"
              type="button"
              className={PANEL_NAV_BTN_CLASS}
              disabled={!canNext}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex((i) => i + 1); }}
              aria-label={t("decision.nextQuestion")}
            >
              <ChevronRight size={14} strokeWidth={2.1} />
            </AppButton>
          </div>
        ) : null}
      </div>

      {/* Body: height controlled by progress */}
      <div
        className={PANEL_BODY_CLASS}
        style={{
          maxHeight: `${progress * 520}px`,
          opacity: progress,
          pointerEvents: progress < 0.3 ? "none" : "auto",
          "--panel-progress": progress,
        } as CSSProperties}
      >
        <div className={PANEL_BODY_CONTENT_CLASS}>
          <div className={PANEL_OPTIONS_CLASS}>
            {q.options.map((opt) => (
              <AppButton variant="ghost" size="sm"
                key={opt.value}
                type="button"
                className={`${PANEL_OPTION_CLASS} ${selectedOption === opt.value && !isCustom ? "active" : ""}`}
                onClick={() => selectOption(opt.value)}
              >
                <span className={PANEL_OPTION_LABEL_CLASS}>{opt.displayLabel ?? opt.label}</span>
                {(opt.displayDescription ?? opt.description) ? (
                  <AppTooltip
                    content={opt.displayDescription ?? opt.description}
                    contentClassName="lyra-agents-decision-option-tooltip max-w-[min(var(--lyra-unit-260),calc(100vw-var(--lyra-space-32)))] text-[var(--lyra-text-secondary)]"
                    delayDuration={160}
                    side="top"
                    sideOffset={8}
                  >
                    <span
                      className={PANEL_OPTION_INFO_CLASS}
                      aria-label={opt.displayDescription ?? opt.description ?? ""}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Info size={12} strokeWidth={2} aria-hidden="true" />
                    </span>
                  </AppTooltip>
                ) : null}
              </AppButton>
            ))}
            {q.options.length > 0 && customAllowed ? (
              <AppButton variant="ghost" size="sm"
                type="button"
                className={`${PANEL_OPTION_CUSTOM_CLASS} ${isCustom ? "active" : ""}`}
                onClick={activateCustom}
              >
                {t("decision.custom")}
              </AppButton>
            ) : null}
          </div>

          <div className={PANEL_ANSWER_ROW_CLASS}>
            {isCustom && customAllowed ? (
              <AppInput
                className={PANEL_CUSTOM_INPUT_CLASS}
                type="text"
                placeholder={t("decision.customPlaceholder")}
                value={customValue}
                onChange={(e) => updateCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && allAnswered) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                autoFocus
              />
            ) : (
              <span className={PANEL_ANSWER_SPACER_CLASS} aria-hidden="true" />
            )}
            <AppButton variant="ghost" size="sm"
              type="button"
              className={PANEL_SUBMIT_CLASS}
              disabled={!allAnswered}
              onClick={handleSubmit}
              aria-label={t("decision.submit")}
            >
              <ArrowUp size={14} strokeWidth={2.1} />
            </AppButton>
          </div>
        </div>
      </div>
    </div>
  );
}
