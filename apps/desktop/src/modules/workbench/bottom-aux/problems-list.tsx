import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  XCircle
} from "@lyra/icons";
import { FileTypeIcon } from "@lyra/icons/file-type";
import { AppButton, AppEmptyState } from "@renderer/ui/components";

import type { LspDiagnostic } from "../../../shared/desktop-bridge";
import {
  PROJECT_TREE_ROW_OVERSCAN,
  windowFixedRows
} from "../agent-project-tree/visible-rows";
import type { FileEditorRevealLocation } from "../file-editor";
import { flattenProblemsRows, groupDiagnosticsByFile } from "./problems";

const PROBLEMS_ROW_HEIGHT_PX = 22;
const PROBLEMS_LIST_VIEWPORT_FALLBACK_PX = 600;

const severityClass = (severity: number): string => {
  if (severity <= 1) {
    return "lyra-problems-error";
  }
  if (severity === 2) {
    return "lyra-problems-warning";
  }
  return "lyra-problems-info";
};

const SeverityIcon = ({ severity }: { readonly severity: number }) => {
  if (severity <= 1) {
    return <XCircle size={14} aria-hidden="true" />;
  }
  if (severity === 2) {
    return <AlertTriangle size={14} aria-hidden="true" />;
  }
  return <Info size={14} aria-hidden="true" />;
};

export const ProblemsList = ({
  items,
  rootPath,
  emptyLabel,
  listLabel,
  onOpenFile
}: {
  readonly items: readonly LspDiagnostic[];
  readonly rootPath: string;
  readonly emptyLabel: string;
  readonly listLabel: string;
  readonly onOpenFile: (filePath: string, location: FileEditorRevealLocation) => void;
}) => {
  const groups = useMemo(() => groupDiagnosticsByFile(items, rootPath), [items, rootPath]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [viewport, setViewport] = useState({
    height: PROBLEMS_LIST_VIEWPORT_FALLBACK_PX,
    start: 0
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const rows = useMemo(() => flattenProblemsRows(groups, collapsed), [collapsed, groups]);
  const windowed = useMemo(
    () => windowFixedRows({
      rows,
      viewportHeight: viewport.height,
      start: viewport.start,
      rowHeight: PROBLEMS_ROW_HEIGHT_PX
    }),
    [rows, viewport.height, viewport.start]
  );

  const toggleFile = useCallback((filePath: string): void => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const element = listRef.current;
    if (element === null) {
      return undefined;
    }
    const update = (): void => {
      const height = element.clientHeight;
      const start = height <= 0
        ? 0
        : Math.max(
          0,
          Math.floor(element.scrollTop / PROBLEMS_ROW_HEIGHT_PX) - PROJECT_TREE_ROW_OVERSCAN
        );
      setViewport((current) => {
        if (current.height === height && current.start === start) {
          return current;
        }
        return { height: height > 0 ? height : PROBLEMS_LIST_VIEWPORT_FALLBACK_PX, start };
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", update);
    };
  }, [rows.length]);

  if (items.length === 0) {
    return (
      <div className="lyra-bottom-aux-list lyra-problems-tree" role="tree" aria-label={listLabel}>
        <AppEmptyState title={emptyLabel} />
      </div>
    );
  }

  const rendered = windowed.rows.map((row) => {
    if (row.kind === "file") {
      const expanded = collapsed.has(row.group.filePath) === false;
      return (
        <AppButton
          variant="ghost"
          key={row.key}
          type="button"
          className="lyra-problems-row lyra-problems-file"
          role="treeitem"
          aria-expanded={expanded}
          onClick={() => {
            toggleFile(row.group.filePath);
          }}
        >
          {expanded ? (
            <ChevronDown size={13} aria-hidden="true" />
          ) : (
            <ChevronRight size={13} aria-hidden="true" />
          )}
          <FileTypeIcon name={row.group.fileName} size={16} />
          <span className="lyra-problems-file-name">{row.group.fileName}</span>
          <span className="lyra-problems-file-dir">{row.group.directoryLabel}</span>
          <span className="lyra-problems-count">{row.group.items.length}</span>
        </AppButton>
      );
    }
    return (
      <AppButton
        variant="ghost"
        key={row.key}
        type="button"
        className={`lyra-problems-row lyra-problems-item ${severityClass(row.item.severity)}`}
        role="treeitem"
        onClick={() => {
          onOpenFile(row.item.filePath, {
            line: row.item.startLine + 1,
            column: row.item.startCharacter + 1
          });
        }}
      >
        <span className="lyra-problems-severity">
          <SeverityIcon severity={row.item.severity} />
        </span>
        <span className="lyra-problems-message">{row.item.message}</span>
        <span className="lyra-problems-source">{row.item.source ?? ""}</span>
        <span className="lyra-problems-location">
          {`[Ln ${row.item.startLine + 1}, Col ${row.item.startCharacter + 1}]`}
        </span>
      </AppButton>
    );
  });
  const body = windowed.virtualized ? (
    <div
      className="lyra-problems-virtual"
      style={{ height: windowed.totalHeight } as CSSProperties}
    >
      <div
        className="lyra-problems-virtual-window"
        style={{ transform: `translateY(${windowed.offsetY}px)` } as CSSProperties}
      >
        {rendered}
      </div>
    </div>
  ) : rendered;

  return (
    <div
      ref={listRef}
      className="lyra-bottom-aux-list lyra-problems-tree"
      role="tree"
      aria-label={listLabel}
    >
      {body}
    </div>
  );
};
