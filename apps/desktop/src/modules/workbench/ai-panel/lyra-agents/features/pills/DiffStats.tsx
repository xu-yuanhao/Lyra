import { useState, type CSSProperties } from "react";
import { GitBranch } from "@lyra/icons";
import { FileTypeIcon } from "../../components/FileTypeIcon";
import { Button } from "@renderer/ui/components/button";
import {
  DS_PILL_CLASS,
  DS_PILL_HEAD_CLASS,
  DS_SUMMARY_CLASS,
  DS_COUNT_CLASS,
  DS_COLLAPSE_CLASS,
  DS_COLLAPSE_INNER_CLASS,
  DS_BODY_CLASS,
  DS_LIST_CLASS,
  DS_ITEM_CLASS,
  DS_FILE_ICON_CLASS,
  DS_FILENAME_CLASS,
  DS_FILE_NUMS_CLASS,
} from "./classes";
import { DIFF_ADD_CLASS, DIFF_DEL_CLASS } from "../chat/classes";

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
    <div className={open ? `${DS_PILL_CLASS} open` : DS_PILL_CLASS}>
      <Button variant="ghost" size="sm"
        type="button"
        className={DS_PILL_HEAD_CLASS}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <GitBranch size={14} strokeWidth={2} />
        <span className={DS_SUMMARY_CLASS}>
          <span className={DIFF_ADD_CLASS}>+{totalAdd}</span>
          <span className={DIFF_DEL_CLASS}>-{totalDel}</span>
        </span>
        <span className={DS_COUNT_CLASS}>{files.length} files</span>
      </Button>

      <div className={DS_COLLAPSE_CLASS} data-open={open}>
        <div className={DS_COLLAPSE_INNER_CLASS}>
          <div className={DS_BODY_CLASS}>
            <ul className={DS_LIST_CLASS}>
              {files.map((f, i) => (
                <li
                  key={f.file}
                  className={DS_ITEM_CLASS}
                  style={{ "--stagger-index": i } as CSSProperties}
                >
                  <span className={DS_FILE_ICON_CLASS}>
                    <FileTypeIcon filename={f.file} size={13} />
                  </span>
                  <span className={DS_FILENAME_CLASS}>{f.file}</span>
                  <span className={DS_FILE_NUMS_CLASS}>
                    <span className={DIFF_ADD_CLASS}>+{f.additions}</span>
                    <span className={DIFF_DEL_CLASS}>-{f.deletions}</span>
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
