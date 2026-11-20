import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  ChevronDown,
  List,
  MessageSquare,
  Pencil,
  RotateCcw,
  Trash2,
  X,
  XCircle
} from "@lyra/icons";

import {
  AppButton,
  AppEmptyState,
  AppIconButton,
  AppInput,
  AppMenu,
  AppMenuContent,
  AppMenuItem,
  AppMenuLabel,
  AppMenuTrigger,
  AppStatusMessage,
  AppTextarea
} from "@renderer/ui/components";
import type {
  AgentPlanAnnotation,
  AgentPlanSnapshot,
  AgentProjectPlanSummary,
  AgentProjectTodoSnapshot,
  AgentTodoItem
} from "../../../shared/agent";
import { useWorkbenchTitlebarContribution } from "../shell/titlebar-context";
import { LyraMarkdown } from "../ai-panel/lyra-agents/features/rich-text/LyraMarkdown";
import { PlanTempChat } from "./temp-chat";
import type { AgentPlanBoardSurfaceProps } from "./types";
import {
  editableLineId,
  parseMarkdownBlocks,
  replaceMarkdownLine,
  type EditableMarkdownBlock
} from "./markdown-blocks";

const statusClassName = (status: string): string => {
  const normalized = status.toLowerCase();
  if (normalized.includes("complete") || normalized === "done") return "is-done";
  if (normalized.includes("progress") || normalized === "running") return "is-running";
  if (normalized.includes("fail") || normalized.includes("reject")) return "is-failed";
  if (normalized.includes("skip") || normalized.includes("cancel")) return "is-muted";
  return "is-pending";
};

const TodoStatusIcon = ({ status }: { readonly status: string }) => {
  const normalized = status.toLowerCase();
  if (normalized.includes("complete") || normalized === "done") return <CheckCircle2 size={14} />;
  if (normalized.includes("fail") || normalized.includes("reject")) return <XCircle size={14} />;
  if (normalized.includes("progress") || normalized === "running") return <Clock3 size={14} />;
  return <Circle size={14} />;
};

const normalizeAnnotation = (
  block: EditableMarkdownBlock,
  text: string,
  kind: AgentPlanAnnotation["kind"]
): AgentPlanAnnotation => ({
  id: `plan-annotation-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`,
  lineId: editableLineId(block.lineIndex),
  line: block.lineIndex + 1,
  kind,
  text: text.trim(),
  createdAt: new Date().toISOString()
});

const annotationsForBlock = (
  annotations: readonly AgentPlanAnnotation[],
  block: EditableMarkdownBlock
): readonly AgentPlanAnnotation[] =>
  annotations.filter((annotation) =>
    annotation.lineId === editableLineId(block.lineIndex)
    || annotation.line === block.lineIndex + 1
  );

const MarkdownPreview = ({
  labels,
  markdown,
  annotations,
  onRevise
}: {
  readonly labels: AgentPlanBoardSurfaceProps["labels"];
  readonly markdown: string;
  readonly annotations: readonly AgentPlanAnnotation[];
  readonly onRevise?: AgentPlanBoardSurfaceProps["onRevisePlan"];
}) => {
  const blocks = useMemo(() => parseMarkdownBlocks(markdown), [markdown]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [commentingKey, setCommentingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const startEdit = (block: EditableMarkdownBlock): void => {
    setCommentingKey(null);
    setEditingKey(block.key);
    setDraft(block.text);
  };
  const startComment = (block: EditableMarkdownBlock): void => {
    setEditingKey(null);
    setCommentingKey(block.key);
    setDraft("");
  };
  const cancel = (): void => {
    setEditingKey(null);
    setCommentingKey(null);
    setDraft("");
  };
  const saveEdit = async (block: EditableMarkdownBlock): Promise<void> => {
    const text = draft.trim();
    if (text.length === 0 || onRevise === undefined) {
      cancel();
      return;
    }
    setBusyKey(block.key);
    try {
      await onRevise({
        markdown: replaceMarkdownLine(markdown, block, text),
        annotations: [
          ...annotations,
          normalizeAnnotation(block, text, "edit")
        ],
        source: "user_edit",
        summary: labels.editLine
      });
      cancel();
    } finally {
      setBusyKey(null);
    }
  };
  const saveComment = async (block: EditableMarkdownBlock): Promise<void> => {
    const text = draft.trim();
    if (text.length === 0 || onRevise === undefined) {
      cancel();
      return;
    }
    setBusyKey(block.key);
    try {
      await onRevise({
        markdown,
        annotations: [
          ...annotations,
          normalizeAnnotation(block, text, "comment")
        ],
        source: "user_edit",
        summary: labels.commentLine
      });
      cancel();
    } finally {
      setBusyKey(null);
    }
  };

  const renderEditableShell = (
    block: EditableMarkdownBlock,
    content: JSX.Element
  ): JSX.Element => {
    const blockAnnotations = annotationsForBlock(annotations, block);
    const isEditing = editingKey === block.key;
    const isCommenting = commentingKey === block.key;
    const disabled = busyKey === block.key || onRevise === undefined;
    return (
      <div key={block.key} className="lyra-agent-plan-board-line">
        <div className="lyra-agent-plan-board-line-content">
          {isEditing || isCommenting ? (
            <div className="lyra-agent-plan-board-line-editor">
              {isEditing && block.kind === "rich" ? (
                <AppTextarea
                  autoFocus
                  rows={Math.min(Math.max(draft.split("\n").length, 2), 12)}
                  className="lyra-agent-plan-board-line-input lyra-agent-plan-board-line-textarea"
                  placeholder={labels.editPlaceholder}
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      cancel();
                    }
                  }}
                />
              ) : (
                <AppInput
                  autoFocus
                  className="lyra-agent-plan-board-line-input"
                  placeholder={isEditing ? labels.editPlaceholder : labels.commentPlaceholder}
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      cancel();
                    }
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void (isEditing ? saveEdit(block) : saveComment(block));
                    }
                  }}
                />
              )}
              <AppIconButton
                className="lyra-agent-plan-board-line-icon-btn"
                type="button"
                disabled={disabled}
                title={labels.save}
                onClick={() => { void (isEditing ? saveEdit(block) : saveComment(block)); }}
              >
                <Check size={13} />
              </AppIconButton>
              <AppIconButton
                className="lyra-agent-plan-board-line-icon-btn"
                type="button"
                title={labels.cancel}
                onClick={cancel}
              >
                <X size={13} />
              </AppIconButton>
            </div>
          ) : content}
          {blockAnnotations.length > 0 ? (
            <div className="lyra-agent-plan-board-line-notes">
              {blockAnnotations.map((annotation) => (
                <div key={annotation.id} className={`lyra-agent-plan-board-line-note is-${annotation.kind}`}>
                  {annotation.text}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {onRevise !== undefined && !isEditing && !isCommenting ? (
          <div className="lyra-agent-plan-board-line-actions">
            <AppIconButton
              className="lyra-agent-plan-board-line-icon-btn"
              type="button"
              title={labels.editLine}
              aria-label={labels.editLine}
              onClick={() => startEdit(block)}
            >
              <Pencil size={12} />
            </AppIconButton>
            <AppIconButton
              className="lyra-agent-plan-board-line-icon-btn"
              type="button"
              title={labels.commentLine}
              aria-label={labels.commentLine}
              onClick={() => startComment(block)}
            >
              <MessageSquare size={12} />
            </AppIconButton>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="lyra-agent-plan-board-markdown">
      {blocks.map((block) => {
        if (block.kind === "heading") {
          return renderEditableShell(
            block,
            <LyraMarkdown
              className="lyra-agent-plan-board-inline-markdown"
              content={`${"#".repeat(Math.min(block.level + 1, 5))} ${block.text}`}
            />
          );
        }
        if (block.kind === "list") {
          return renderEditableShell(
            block,
            <div className="lyra-agent-plan-board-list-row">
              <span className="lyra-agent-plan-board-list-marker">
                {block.taskState === "done" ? "✓" : block.taskState === "todo" ? "□" : "•"}
              </span>
              <LyraMarkdown
                className="lyra-agent-plan-board-inline-markdown"
                content={block.text}
              />
            </div>
          );
        }
        if (block.kind === "rich") {
          return renderEditableShell(
            block,
            <LyraMarkdown
              className="lyra-agent-plan-board-rich"
              content={block.text}
            />
          );
        }
        if (block.kind === "code") {
          return (
            <LyraMarkdown
              key={block.key}
              className="lyra-agent-plan-board-rich"
              content={`\`\`\`\n${block.text}\n\`\`\``}
            />
          );
        }
        return renderEditableShell(
          block,
          <LyraMarkdown
            className="lyra-agent-plan-board-inline-markdown"
            content={block.text}
          />
        );
      })}
    </div>
  );
};

const TodoList = ({
  todos,
  currentIndex
}: {
  readonly todos: readonly AgentTodoItem[];
  readonly currentIndex: number;
}) => (
  <div className="lyra-agent-plan-board-todo-list">
    {todos.map((todo, index) => {
      const className = [
        "lyra-agent-plan-board-todo-item",
        statusClassName(todo.status),
        index === currentIndex ? "is-current" : ""
      ].join(" ");
      return (
        <div key={todo.id} className={className}>
          <span className="lyra-agent-plan-board-todo-icon">
            <TodoStatusIcon status={todo.status} />
          </span>
          <span className="lyra-agent-plan-board-todo-content">{todo.content}</span>
          <span className="lyra-agent-plan-board-todo-meta">
            <span className="lyra-agent-plan-board-todo-status">{todo.status}</span>
          </span>
        </div>
      );
    })}
  </div>
);

const PlanTodoDetail = ({
  labels,
  plan,
  todo,
  onRevisePlan,
  onResumePlan
}: {
  readonly labels: AgentPlanBoardSurfaceProps["labels"];
  readonly plan: AgentPlanSnapshot;
  readonly todo: AgentProjectTodoSnapshot | null;
  readonly onRevisePlan?: AgentPlanBoardSurfaceProps["onRevisePlan"];
  readonly onResumePlan?: () => Promise<void>;
}) => {
  const isSetAside = plan.phase === "set_aside";
  const [resuming, setResuming] = useState(false);
  const handleResume = async (): Promise<void> => {
    if (onResumePlan === undefined || resuming) return;
    setResuming(true);
    try {
      await onResumePlan();
    } finally {
      setResuming(false);
    }
  };
  return (
    <>
      {isSetAside && onResumePlan !== undefined ? (
        <div className="lyra-agent-plan-board-inline-actions">
          <span className="lyra-agent-plan-board-badge is-set-aside">{labels.setAsideBadge}</span>
          <AppButton
            type="button"
            className="lyra-agent-plan-board-resume-btn"
            variant="secondary"
            size="sm"
            disabled={resuming}
            onClick={() => { void handleResume(); }}
          >
            <RotateCcw size={13} />
            {labels.resumePlan}
          </AppButton>
        </div>
      ) : null}

      <main className={todo !== null && todo.todos.length > 0 ? "lyra-agent-plan-board-main has-todo" : "lyra-agent-plan-board-main"}>
        <section className="lyra-agent-plan-board-plan" aria-label={labels.plan}>
          <MarkdownPreview
            labels={labels}
            markdown={plan.markdown}
            annotations={plan.annotations}
            onRevise={onRevisePlan}
          />
        </section>
        {todo !== null && todo.todos.length > 0 ? (
          <section className="lyra-agent-plan-board-todo" aria-label={labels.todo}>
            <h2>
              <span className="lyra-agent-plan-board-todo-count">{todo.todos.length}</span>
              {labels.todo}
            </h2>
            <TodoList
              todos={todo.todos}
              currentIndex={todo.currentIndex}
            />
          </section>
        ) : null}
      </main>
    </>
  );
};

const PlanBoardNavigator = ({
  labels,
  plans,
  selectedPlanId,
  currentTitle,
  loading,
  onOpenPlan,
  onDeletePlan
}: {
  readonly labels: AgentPlanBoardSurfaceProps["labels"];
  readonly plans: readonly AgentProjectPlanSummary[];
  readonly selectedPlanId: string | null;
  readonly currentTitle: string;
  readonly loading: boolean;
  readonly onOpenPlan: ((planId: string) => Promise<void>) | undefined;
  readonly onDeletePlan: ((planId: string) => Promise<void>) | undefined;
}) => {
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const runPlanAction = async (
    planId: string,
    action: ((planId: string) => Promise<void>) | undefined
  ): Promise<void> => {
    if (action === undefined || busyPlanId !== null) return;
    setBusyPlanId(planId);
    try {
      await action(planId);
    } finally {
      setBusyPlanId(null);
    }
  };
  const triggerTitle = currentTitle.trim().length > 0 ? currentTitle : labels.manager;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <AppMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <AppMenuTrigger asChild>
        <AppButton
          type="button"
          variant="ghost"
          size="sm"
          className="lyra-agent-plan-board-chat-menu-trigger"
          aria-label={labels.manager}
          title={labels.manager}
        >
          <List size={13} strokeWidth={2.1} aria-hidden="true" />
          <span className="lyra-agent-plan-board-chat-menu-current">{triggerTitle}</span>
          <ChevronDown size={13} strokeWidth={2.1} aria-hidden="true" />
        </AppButton>
      </AppMenuTrigger>
      <AppMenuContent
        className="lyra-agent-plan-board-chat-menu"
        align="end"
        side="bottom"
        sideOffset={6}
      >
        <AppMenuLabel>{labels.manager}</AppMenuLabel>
        {plans.map((plan) => {
          const selected = selectedPlanId === plan.planId;
          const title = plan.title.trim().length > 0 ? plan.title : labels.openPlan;
          const busy = busyPlanId === plan.planId || loading;
          const openDisabled = busy || onOpenPlan === undefined;
          return (
            <div
              key={plan.planId}
              className="lyra-agent-plan-board-chat-menu-plan"
            >
              <AppMenuItem
                className="lyra-app-menu-item-with-icon lyra-agent-plan-board-chat-menu-plan-open"
                disabled={openDisabled}
                data-active={selected ? "true" : undefined}
                onSelect={() => {
                  void runPlanAction(plan.planId, onOpenPlan);
                }}
              >
                <Check
                  size={14}
                  strokeWidth={1.8}
                  aria-hidden="true"
                  className={selected ? "lyra-agent-plan-board-plan-check is-selected" : "lyra-agent-plan-board-plan-check"}
                />
                <span className="lyra-app-menu-item-label">{title}</span>
              </AppMenuItem>
              {onDeletePlan === undefined ? null : (
                <AppIconButton
                  type="button"
                  className="lyra-agent-plan-board-chat-menu-delete"
                  tone="danger"
                  disabled={busy}
                  title={labels.deletePlan}
                  aria-label={labels.deletePlan}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setMenuOpen(false);
                    void runPlanAction(plan.planId, onDeletePlan);
                  }}
                >
                  <Trash2 size={13} />
                </AppIconButton>
              )}
            </div>
          );
        })}
        {plans.length === 0 ? (
          <AppMenuItem disabled>
            <span className="lyra-app-menu-item-label">
              {loading ? labels.loading : labels.noPlans}
            </span>
          </AppMenuItem>
        ) : null}
      </AppMenuContent>
    </AppMenu>
  );
};

const PlanWorkspace = ({
  labels,
  plan,
  todo,
  parentSessionId,
  desktopApi,
  onRevisePlan,
  onResumePlan,
  plans,
  selectedPlanId,
  plansLoading = false,
  onOpenPlan,
  onDeletePlan
}: {
  readonly labels: AgentPlanBoardSurfaceProps["labels"];
  readonly plan: AgentPlanSnapshot | null;
  readonly todo: AgentProjectTodoSnapshot | null;
  readonly parentSessionId: string;
  readonly desktopApi: AgentPlanBoardSurfaceProps["desktopApi"];
  readonly onRevisePlan?: AgentPlanBoardSurfaceProps["onRevisePlan"];
  readonly onResumePlan?: () => Promise<void>;
  readonly plans?: readonly AgentProjectPlanSummary[];
  readonly selectedPlanId: string | null;
  readonly plansLoading?: boolean;
  readonly onOpenPlan?: (planId: string) => Promise<void>;
  readonly onDeletePlan?: (planId: string) => Promise<void>;
}) => (
  <div className="lyra-agent-plan-board-workspace has-chat">
    <section className="lyra-agent-plan-board-workspace-document">
      {plan === null ? (
        <AppEmptyState
          className="lyra-agent-plan-board-empty"
          title={plansLoading ? labels.loading : labels.noPlans}
        />
      ) : (
        <PlanTodoDetail
          labels={labels}
          plan={plan}
          todo={todo}
          onRevisePlan={onRevisePlan}
          {...(onResumePlan === undefined ? {} : { onResumePlan })}
        />
      )}
    </section>
    <aside className="lyra-agent-plan-board-chat-rail lyra-agents-host">
      <header className="lyra-agent-plan-board-chat-header">
        <span className="lyra-agent-plan-board-chat-title">{labels.tempChatTitle}</span>
        {plans === undefined ? null : (
          <PlanBoardNavigator
            labels={labels}
            plans={plans}
            selectedPlanId={selectedPlanId}
            currentTitle={plan?.title ?? labels.manager}
            loading={plansLoading}
            onOpenPlan={onOpenPlan}
            onDeletePlan={onDeletePlan}
          />
        )}
      </header>
      <PlanTempChat
        key={plan?.activePlanId ?? "none"}
        labels={labels}
        parentSessionId={parentSessionId}
        plan={plan}
        desktopApi={desktopApi}
        onApplyRevision={onRevisePlan}
      />
    </aside>
  </div>
);

export const AgentPlanBoardSurface = ({
  labels,
  state,
  desktopApi,
  onOpenManagedPlan,
  onDeleteManagedPlan,
  onRefreshManager,
  onRevisePlan,
  openDialog
}: AgentPlanBoardSurfaceProps) => {
  const plan = state.mode === "detail" ? state.plan : state.selectedPlan;
  // Deleting a managed plan is destructive and irreversible, so route it through
  // the global confirmation dialog. Without a dialog host we fall back to the raw
  // delete so the action still works (e.g. in tests).
  const confirmDeleteManagedPlan = useMemo(() => {
    if (onDeleteManagedPlan === undefined) return undefined;
    if (openDialog === undefined) return onDeleteManagedPlan;
    const plans = state.mode === "manager" ? state.plans : [];
    return (planId: string): Promise<void> =>
      new Promise<void>((resolve) => {
        const target = plans.find((entry) => entry.planId === planId);
        openDialog({
          title: labels.deleteConfirmTitle,
          description: labels.deleteConfirmDescription,
          source: {
            title: labels.title,
            subtitle: target?.title ?? labels.manager,
            iconLabel: "AI",
            iconTone: "danger"
          },
          actions: [
            { id: "cancel", label: labels.cancel, onSelect: () => resolve() },
            {
              id: "delete",
              label: labels.deleteConfirmAction,
              tone: "danger",
              onSelect: () => {
                void onDeleteManagedPlan(planId).finally(() => resolve());
              }
            }
          ]
        });
      });
  }, [
    onDeleteManagedPlan,
    openDialog,
    state,
    labels.deleteConfirmTitle,
    labels.deleteConfirmDescription,
    labels.deleteConfirmAction,
    labels.title,
    labels.manager,
    labels.cancel
  ]);
  const resumePlan = useMemo(() => {
    const agent = desktopApi?.agent;
    if (agent?.respondPlanReview === undefined) return undefined;
    const sessionId = state.agentSessionId;
    return async (): Promise<void> => {
      await agent.respondPlanReview({ sessionId, action: "resume" });
      // Manager view reads from the persisted store, so refresh it explicitly;
      // the detail view updates from runtime session-snapshot events.
      if (state.mode === "manager") await onRefreshManager?.();
    };
  }, [desktopApi, state.agentSessionId, state.mode, onRefreshManager]);
  const titlebarContent = useMemo(() => (
    <div className="lyra-agent-plan-board-titlebar">
      <span>{state.title}</span>
      <span className="lyra-agent-plan-board-titlebar-meta">
        {state.mode === "detail" ? plan?.phase : labels.manager}
      </span>
    </div>
  ), [labels.manager, plan?.phase, state.mode, state.title]);
  useWorkbenchTitlebarContribution({
    ariaLabel: state.title,
    content: titlebarContent
  });

  if (state.mode === "manager") {
    const selectedPlan = state.selectedPlan;
    return (
      <div className="lyra-agent-plan-board">
        {state.error !== null ? (
          <AppStatusMessage className="lyra-agent-plan-board-error lyra-app-status-message-boxed" role="alert" tone="error">
            {state.error}
          </AppStatusMessage>
        ) : null}
        <PlanWorkspace
          labels={labels}
          plan={selectedPlan}
          todo={state.selectedProjectTodo}
          parentSessionId={state.agentSessionId}
          desktopApi={desktopApi}
          onRevisePlan={onRevisePlan}
          plans={state.plans}
          selectedPlanId={selectedPlan?.activePlanId ?? null}
          plansLoading={state.loading}
          {...(onOpenManagedPlan === undefined ? {} : { onOpenPlan: onOpenManagedPlan })}
          {...(confirmDeleteManagedPlan === undefined ? {} : { onDeletePlan: confirmDeleteManagedPlan })}
          {...(resumePlan === undefined ? {} : { onResumePlan: resumePlan })}
        />
      </div>
    );
  }

  return (
    <div className="lyra-agent-plan-board">
      <PlanWorkspace
        labels={labels}
        plan={state.plan}
        todo={state.projectTodo}
        parentSessionId={state.agentSessionId}
        desktopApi={desktopApi}
        onRevisePlan={onRevisePlan}
        selectedPlanId={state.plan.activePlanId}
        {...(resumePlan === undefined ? {} : { onResumePlan: resumePlan })}
      />
    </div>
  );
};
