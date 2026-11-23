import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  XCircle
} from "@lyra/icons";
import { FileTypeIcon } from "@lyra/icons/file-type";
import { Button } from "@renderer/ui/components/button";

import type { LspDiagnostic } from "../../../shared/desktop-bridge";
import {
  PROJECT_TREE_ROW_OVERSCAN,
  windowFixedRows
} from "../agent-project-tree/visible-rows";
import type { FileEditorRevealLocation } from "../file-editor";
import { flattenProblemsRows, groupDiagnosticsByFile } from "./problems";

const PROBLEMS_ROW_HEIGHT_PX = 22;
const PROBLEMS_LIST_VIEWPORT_FALLBACK_PX = 600;
const PROBLEMS_ROW_KEY_ATTR = "data-lyra-problems-key";

const LIST_CLASS =
  "h-full min-h-0 min-w-0 overflow-auto py-[var(--lyra-space-4)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-18)]";
const ROW_CLASS =
  "grid h-[var(--lyra-control-h-24)] w-full min-w-0 cursor-pointer justify-start gap-[var(--lyra-space-6)] rounded-none border-0 bg-transparent px-[var(--lyra-space-8)] py-0 text-left font-normal whitespace-normal text-inherit hover:bg-[var(--lyra-app-row-hover-bg)]";
const FILE_ROW_CLASS = `${ROW_CLASS} grid-cols-[var(--lyra-icon-size-16)_var(--lyra-icon-size-16)_max-content_minmax(0,1fr)_auto]`;
const ITEM_ROW_CLASS = `${ROW_CLASS} grid-cols-[var(--lyra-icon-size-16)_minmax(0,1fr)_auto_auto] pl-[calc(var(--lyra-space-8)+var(--lyra-icon-size-16)+var(--lyra-space-6))]`;
const MUTED_TEXT_CLASS = "text-[length:var(--lyra-text-size-12)] whitespace-nowrap text-[var(--lyra-text-muted)]";

const severityTextClass = (severity: number): string => {
  if (severity <= 1) {
    return "text-[var(--lyra-status-error)]";
  }
  if (severity === 2) {
    return "text-[var(--lyra-status-warning)]";
  }
  return "text-[var(--lyra-text-secondary)]";
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

  const focusRow = useCallback((key: string): void => {
    const selector = `[${PROBLEMS_ROW_KEY_ATTR}="${CSS.escape(key)}"]`;
    const existing = listRef.current?.querySelector<HTMLElement>(selector);
    if (existing !== null && existing !== undefined) {
      existing.focus();
      return;
    }
    const index = rows.findIndex((row) => row.key === key);
    if (index < 0 || listRef.current === null) {
      return;
    }
    listRef.current.scrollTop = Math.max(0, index * PROBLEMS_ROW_HEIGHT_PX - PROBLEMS_ROW_HEIGHT_PX);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        listRef.current?.querySelector<HTMLElement>(selector)?.focus();
      });
    });
  }, [rows]);

  const onListKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const item = (event.target as HTMLElement).closest<HTMLElement>('[role="treeitem"]');
    if (item === null || listRef.current === null) {
      return;
    }
    const key = item.getAttribute(PROBLEMS_ROW_KEY_ATTR);
    const flatIndex = key === null ? -1 : rows.findIndex((row) => row.key === key);
    const row = flatIndex >= 0 ? rows[flatIndex] : undefined;
    if (row === undefined) {
      return;
    }
    let targetIndex: number | null = null;
    switch (event.key) {
      case "ArrowDown":
        targetIndex = flatIndex + 1;
        break;
      case "ArrowUp":
        targetIndex = flatIndex - 1;
        break;
      case "Home":
        targetIndex = 0;
        break;
      case "End":
        targetIndex = rows.length - 1;
        break;
      case "ArrowRight":
        if (row.kind === "file") {
          if (collapsed.has(row.group.filePath)) {
            toggleFile(row.group.filePath);
            return;
          }
          const next = rows[flatIndex + 1];
          if (next?.kind === "item" && next.group.filePath === row.group.filePath) {
            targetIndex = flatIndex + 1;
          }
        }
        break;
      case "ArrowLeft":
        if (row.kind === "file" && collapsed.has(row.group.filePath) === false) {
          toggleFile(row.group.filePath);
          return;
        }
        targetIndex = rows.findIndex(
          (candidate) => candidate.kind === "file" && candidate.group.filePath === row.group.filePath
        );
        break;
      default:
        return;
    }
    if (targetIndex === null || targetIndex < 0 || targetIndex >= rows.length) {
      return;
    }
    event.preventDefault();
    const targetKey = rows[targetIndex]?.key;
    if (targetKey !== undefined) {
      focusRow(targetKey);
    }
  };

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
      <div className={`${LIST_CLASS} grid place-items-center`} role="tree" aria-label={listLabel}>
        <span className="text-sm text-muted-foreground">{emptyLabel}</span>
      </div>
    );
  }

  const rendered = windowed.rows.map((row) => {
    if (row.kind === "file") {
      const expanded = collapsed.has(row.group.filePath) === false;
      return (
        <Button
          variant="ghost"
          key={row.key}
          type="button"
          className={FILE_ROW_CLASS}
          role="treeitem"
          aria-expanded={expanded}
          {...{ [PROBLEMS_ROW_KEY_ATTR]: row.key }}
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
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">{row.group.fileName}</span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[var(--lyra-text-muted)]">{row.group.directoryLabel}</span>
          <span className="min-w-[var(--lyra-icon-size-16)] rounded-[var(--lyra-radius-pill)] bg-[var(--lyra-app-row-active-bg)] px-[var(--lyra-space-4)] text-center text-[length:var(--lyra-text-size-caption)] leading-[var(--lyra-text-line-16)] text-[var(--lyra-text-secondary)] tabular-nums">
            {row.group.items.length}
          </span>
        </Button>
      );
    }
    return (
      <Button
        variant="ghost"
        key={row.key}
        type="button"
        className={ITEM_ROW_CLASS}
        role="treeitem"
        {...{ [PROBLEMS_ROW_KEY_ATTR]: row.key }}
        onClick={() => {
          onOpenFile(row.item.filePath, {
            line: row.item.startLine + 1,
            column: row.item.startCharacter + 1
          });
        }}
      >
        <span className={`inline-flex items-center justify-center ${severityTextClass(row.item.severity)}`}>
          <SeverityIcon severity={row.item.severity} />
        </span>
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{row.item.message}</span>
        <span className={MUTED_TEXT_CLASS}>{row.item.source ?? ""}</span>
        <span className={MUTED_TEXT_CLASS}>
          {`[Ln ${row.item.startLine + 1}, Col ${row.item.startCharacter + 1}]`}
        </span>
      </Button>
    );
  });
  const body = windowed.virtualized ? (
    <div
      className="relative w-full"
      style={{ height: windowed.totalHeight } as CSSProperties}
    >
      <div
        className="absolute inset-x-0"
        style={{ transform: `translateY(${windowed.offsetY}px)` } as CSSProperties}
      >
        {rendered}
      </div>
    </div>
  ) : rendered;

  return (
    <div ref={listRef} className={LIST_CLASS} role="tree" aria-label={listLabel} onKeyDown={onListKeyDown}>
      {body}
    </div>
  );
};
