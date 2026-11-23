import { useState } from "react";

import { formatMessage } from "@workbench/i18n";
import { AppButton } from "@renderer/ui/components";
import { FileTypeIcon } from "../../components/FileTypeIcon";
import { ChevronIcon } from "../../components/Icons";
import { VirtualizedDiffView } from "../tools/VirtualizedDiffView";
import {
  CHANGED_FILES_PREVIEW_LIMIT,
  type ChangedFile,
  splitDisplayPath
} from "./changed-files";
import { DIFF_ADD_CLASS, DIFF_DEL_CLASS } from "./classes";

function ChangedFileRow({
  file,
  open,
  onToggle
}: {
  readonly file: ChangedFile;
  readonly open: boolean;
  readonly onToggle: (path: string) => void;
}) {
  const { directory, filename } = splitDisplayPath(file.file);
  return (
    <div className={`lyra-agents-changed-files-item${open ? " open" : ""}`}>
      <AppButton
        variant="ghost"
        size="sm"
        type="button"
        className="lyra-agents-changed-files-row"
        title={file.file}
        aria-expanded={open}
        onClick={() => onToggle(file.file)}
      >
        <span className="lyra-agents-changed-files-main">
          <span className="lyra-agents-changed-files-icon" aria-hidden="true">
            <FileTypeIcon filename={file.file} size={16} />
          </span>
          <span className="lyra-agents-changed-files-path">
            {directory.length > 0 ? (
              <span className="lyra-agents-changed-files-directory">{`\u202A${directory}\u202C`}</span>
            ) : null}
            <span className="lyra-agents-changed-files-filename">{filename}</span>
          </span>
        </span>
        <span className="lyra-agents-changed-files-meta">
          <span className="lyra-agents-changed-files-counts">
            <span className={DIFF_ADD_CLASS}>+{file.additions}</span>
            <span className={DIFF_DEL_CLASS}>-{file.deletions}</span>
          </span>
          <span className="lyra-agents-changed-files-chevron">
            <ChevronIcon open={open} />
          </span>
        </span>
      </AppButton>
      {open ? (
        <div className="lyra-agents-changed-files-diff">
          <VirtualizedDiffView hunks={file.hunks} />
        </div>
      ) : null}
    </div>
  );
}

export function ChangedFilesCard({ files }: { readonly files: readonly ChangedFile[] }) {
  const [expandedFile, setExpandedFile] = useState<string | null>(null);

  if (files.length === 0) return null;

  const totalAdd = files.reduce((sum, file) => sum + file.additions, 0);
  const totalDel = files.reduce((sum, file) => sum + file.deletions, 0);
  const label = formatMessage(
    files.length === 1
      ? "lyra-agents-message.changedFile"
      : "lyra-agents-message.changedFiles",
    { count: files.length }
  );

  const toggle = (path: string) => {
    setExpandedFile((current) => (current === path ? null : path));
  };

  return (
    <div className="lyra-agents-changed-files">
      <div className="lyra-agents-changed-files-header">
        <span className="lyra-agents-changed-files-label">{label}</span>
        <span className="lyra-agents-changed-files-totals">
          <span className={DIFF_ADD_CLASS}>+{totalAdd}</span>
          <span className={DIFF_DEL_CLASS}>-{totalDel}</span>
        </span>
      </div>
      <div
        className="lyra-agents-changed-files-list"
        style={{
          maxHeight: `calc(${CHANGED_FILES_PREVIEW_LIMIT} * var(--lyra-agents-changed-files-row-height))`
        }}
      >
        {files.map((file) => (
          <ChangedFileRow
            key={file.file}
            file={file}
            open={expandedFile === file.file}
            onToggle={toggle}
          />
        ))}
      </div>
    </div>
  );
}
