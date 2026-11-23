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
import {
  CHANGED_FILES_CLASS,
  CHANGED_FILES_COUNTS_CLASS,
  CHANGED_FILES_CHEVRON_CLASS,
  CHANGED_FILES_DIFF_CLASS,
  CHANGED_FILES_DIRECTORY_CLASS,
  CHANGED_FILES_FILENAME_CLASS,
  CHANGED_FILES_HEADER_CLASS,
  CHANGED_FILES_ICON_CLASS,
  CHANGED_FILES_ITEM_CLASS,
  CHANGED_FILES_LABEL_CLASS,
  CHANGED_FILES_LIST_CLASS,
  CHANGED_FILES_MAIN_CLASS,
  CHANGED_FILES_META_CLASS,
  CHANGED_FILES_PATH_CLASS,
  CHANGED_FILES_ROW_CLASS,
  CHANGED_FILES_TOTALS_CLASS,
  DIFF_ADD_CLASS,
  DIFF_DEL_CLASS
} from "./classes";

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
    <div className={`${CHANGED_FILES_ITEM_CLASS}${open ? " open" : ""}`}>
      <AppButton
        variant="ghost"
        size="sm"
        type="button"
        className={CHANGED_FILES_ROW_CLASS}
        title={file.file}
        aria-expanded={open}
        onClick={() => onToggle(file.file)}
      >
        <span className={CHANGED_FILES_MAIN_CLASS}>
          <span className={CHANGED_FILES_ICON_CLASS} aria-hidden="true">
            <FileTypeIcon filename={file.file} size={16} />
          </span>
          <span className={CHANGED_FILES_PATH_CLASS}>
            {directory.length > 0 ? (
              <span className={CHANGED_FILES_DIRECTORY_CLASS}>{`\u202A${directory}\u202C`}</span>
            ) : null}
            <span className={CHANGED_FILES_FILENAME_CLASS}>{filename}</span>
          </span>
        </span>
        <span className={CHANGED_FILES_META_CLASS}>
          <span className={CHANGED_FILES_COUNTS_CLASS}>
            <span className={DIFF_ADD_CLASS}>+{file.additions}</span>
            <span className={DIFF_DEL_CLASS}>-{file.deletions}</span>
          </span>
          <span className={CHANGED_FILES_CHEVRON_CLASS}>
            <ChevronIcon open={open} />
          </span>
        </span>
      </AppButton>
      {open ? (
        <div className={CHANGED_FILES_DIFF_CLASS}>
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
    <div className={CHANGED_FILES_CLASS}>
      <div className={CHANGED_FILES_HEADER_CLASS}>
        <span className={CHANGED_FILES_LABEL_CLASS}>{label}</span>
        <span className={CHANGED_FILES_TOTALS_CLASS}>
          <span className={DIFF_ADD_CLASS}>+{totalAdd}</span>
          <span className={DIFF_DEL_CLASS}>-{totalDel}</span>
        </span>
      </div>
      <div
        className={CHANGED_FILES_LIST_CLASS}
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
