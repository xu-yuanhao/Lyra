// ============================================================================
// PillsRail — hosts the Diff pill below the header
// ============================================================================

import { DiffStats } from "./DiffStats";
import { useData } from "../../data/DataProvider";
import { PILLS_RAIL_CLASS } from "./classes";

export function PillsRail() {
  const { diffFiles } = useData();
  const hasDiff = diffFiles.length > 0;
  if (!hasDiff) return null;

  return (
    <div className={PILLS_RAIL_CLASS}>
      <DiffStats files={diffFiles} />
    </div>
  );
}
