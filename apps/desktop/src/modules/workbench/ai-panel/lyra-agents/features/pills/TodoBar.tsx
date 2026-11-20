import { ListChecks } from "@lyra/icons";
import { AppButton } from "@renderer/ui/components";
import { t } from "@workbench/i18n";

export interface TodoItem {
  id: string;
  title: string;
  status: "pending" | "running" | "done";
}

/** Progress capsule above the composer. Hidden when empty or all done. */
export function TodoBar({
  tasks,
  onOpenBoard,
}: {
  tasks: TodoItem[];
  onOpenBoard?: () => void | Promise<void>;
}) {
  const total = tasks.length;
  const doneCount = tasks.filter((task) => task.status === "done").length;
  const hasIncomplete = doneCount < total;
  if (total === 0 || !hasIncomplete) return null;

  const runningIndex = tasks.findIndex((task) => task.status === "running");
  const currentNumber = runningIndex >= 0 ? runningIndex + 1 : Math.min(total, doneCount + 1);
  const label = t("lyra-agents-composer.openTodo");

  return (
    <AppButton
      type="button"
      variant="ghost"
      size="sm"
      className="lyra-agents-composer-rail-chip lyra-agents-todo-capsule"
      onClick={() => { void onOpenBoard?.(); }}
      disabled={onOpenBoard === undefined}
      title={t("lyra-agents-composer.openTodoBoard")}
      aria-label={label}
    >
      <ListChecks size={13} strokeWidth={2.1} />
      <span className="lyra-agents-todo-capsule-progress">
        {currentNumber}
        <span className="lyra-agents-todo-capsule-sep">|</span>
        {total}
      </span>
    </AppButton>
  );
}
