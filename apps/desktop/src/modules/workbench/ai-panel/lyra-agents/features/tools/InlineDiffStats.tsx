import { TickingNumber } from "../../components/TickingNumber";
import type { ToolDetails } from "../../core/types";
import { DIFF_ADD_CLASS, DIFF_DEL_CLASS } from "../chat/classes";

export type EditDiffCounts = {
  readonly additions: number;
  readonly deletions: number;
};

export const editDiffCounts = (
  details: ToolDetails | undefined
): EditDiffCounts | null => {
  if (details?.type !== "edit") return null;
  return {
    additions: details.additions,
    deletions: details.deletions
  };
};

export const shouldShowEditDiffStats = (
  counts: EditDiffCounts | null
): counts is EditDiffCounts =>
  counts !== null && (counts.additions > 0 || counts.deletions > 0);

/**
 * Shared +/- cluster used on L1 group head, L2 tool row, and L3 edit card.
 * Numbers come from parsed unified diff output (real streaming updates).
 */
export function InlineDiffStats({
  additions,
  deletions,
  className = "lyra-agents-inline-stats",
}: EditDiffCounts & {
  className?: string;
}) {
  if (additions === 0 && deletions === 0) {
    return null;
  }
  return (
    <span className={className} aria-label={`+${additions} -${deletions}`}>
      <span className={DIFF_ADD_CLASS}>
        +<TickingNumber value={additions} direction="up" />
      </span>
      <span className={DIFF_DEL_CLASS}>
        -<TickingNumber value={deletions} direction="down" />
      </span>
    </span>
  );
}