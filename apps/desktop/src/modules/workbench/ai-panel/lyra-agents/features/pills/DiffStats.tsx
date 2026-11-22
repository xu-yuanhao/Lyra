import { useState, type CSSProperties } from "react";
import { GitBranch } from "@lyra/icons";
import { FileTypeIcon } from "../../components/FileTypeIcon";
import { Button } from "@renderer/ui/components/button";

export interface DiffFileEntry {
  file: string;
  additions: number;
  deletions: number;
}

/**
 * Floating diff stats pill — same style as TodoBar.
 * Collapsed: icon + total +/- counts.
 * Expanded: list of modified files with per-file stats.
 */
export function DiffStats({
  files,
}: {
  files: DiffFileEntry[];
}) {
  const [open, setOpen] = useState(false);

  if (files.length === 0) return null;

  const totalAdd = files.reduce((s, f) => s + f.additions, 0);
  const totalDel = files.reduce((s, f) => s + f.deletions, 0);

  return (
    <div className={`lyra-agents-diff-stats-pill ${open ? "open" : ""}`}>
      <Button variant="ghost" size="sm"
        type="button"
        className="lyra-agents-diff-stats-pill-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <GitBranch size={14} strokeWidth={2} />
        <span className="lyra-agents-diff-stats-summary">
          <span className="lyra-agents-diff-add">+{totalAdd}</span>
          <span className="lyra-agents-diff-del">-{totalDel}</span>
        </span>
        <span className="lyra-agents-diff-stats-count">{files.length} files</span>
      </Button>

      <div className="lyra-agents-diff-stats-collapse" data-open={open}>
        <div className="lyra-agents-diff-stats-collapse-inner">
          <div className="lyra-agents-diff-stats-body">
            <ul className="lyra-agents-diff-stats-list">
              {files.map((f, i) => (
                <li
                  key={f.file}
                  className="lyra-agents-diff-stats-item"
                  style={{ "--stagger-index": i } as CSSProperties}
                >
                  <span className="lyra-agents-diff-stats-file-icon">
                    <FileTypeIcon filename={f.file} size={13} />
                  </span>
                  <span className="lyra-agents-diff-stats-filename">{f.file}</span>
                  <span className="lyra-agents-diff-stats-file-nums">
                    <span className="lyra-agents-diff-add">+{f.additions}</span>
                    <span className="lyra-agents-diff-del">-{f.deletions}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
