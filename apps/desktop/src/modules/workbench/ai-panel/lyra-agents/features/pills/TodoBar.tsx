import { ListChecks } from "@lyra/icons";
import { Button } from "@renderer/ui/components/button";
import { t } from "@workbench/i18n";

export interface TodoItem {
  id: string;
  title: string;
  status: "pending" | "running" | "done";
}

const CAPSULE_CLASS =
  "pointer-events-auto ml-auto inline-flex h-[var(--lyra-agents-composer-toolbar-control-size)] items-center gap-[var(--lyra-space-4)] rounded-full border border-[var(--lyra-app-input-border)] bg-[var(--lyra-app-surface-strong-bg)] px-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-12)] leading-[var(--lyra-text-line-flat)] text-[var(--lyra-text-secondary)] tabular-nums hover:bg-[color-mix(in_srgb,var(--lyra-app-surface-strong-bg)_94%,var(--lyra-text-primary)_6%)] hover:text-[var(--lyra-text-primary)]";

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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={CAPSULE_CLASS}
      onClick={() => { void onOpenBoard?.(); }}
      disabled={onOpenBoard === undefined}
      title={t("lyra-agents-composer.openTodoBoard")}
      aria-label={label}
    >
      <ListChecks size={13} strokeWidth={2.1} className="flex-none" />
      <span className="inline-flex items-center font-medium">
        {currentNumber}
        <span className="mx-[var(--lyra-space-2)] opacity-45">|</span>
        {total}
      </span>
    </Button>
  );
}
