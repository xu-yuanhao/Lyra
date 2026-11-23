import { observeElementRect, type Virtualizer } from "@tanstack/react-virtual";

import type { FileManagerEntry } from "../../../shared/file-manager";

import type { AgentProjectTreeDirectoryState } from "./types";

// ponytail: filter noise directories and hidden entries instead of full gitignore
// parsing. Covers the 90% case — node_modules, .git, build artifacts. Upgrade
// path: add a native gitignore-aware readDirectory binding if needed.
const NOISE_DIRECTORY_NAMES = new Set([
  "node_modules",
  ".git",
  "target",
  "dist",
  "build",
  "out",
  "coverage",
  "vendor",
  "Pods",
  "DerivedData",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".tmp-test",
  ".turbo",
  ".gradle",
  ".idea",
  ".cache",
  ".parcel-cache",
  ".pnpm-store",
  ".yarn",
  "__pycache__",
  ".venv",
  "venv",
  "bazel-bin",
  "bazel-out",
  "bazel-testlogs"
]);

export const PROJECT_TREE_ROW_HEIGHT_PX = 28;
export const PROJECT_TREE_ROW_OVERSCAN = 40;
export const PROJECT_TREE_VIRTUALIZE_AFTER = 80;

const FIXED_ROW_VIEWPORT_FALLBACK = { width: 800, height: 600 };

/**
 * Shared options for fixed-height row lists virtualized with
 * @tanstack/react-virtual. Before the scrollport reports a real height
 * (first paint, jsdom tests) fall back to a 600px viewport so the initial
 * range still covers a useful slice instead of collapsing to overscan.
 */
export const fixedRowVirtualizerOptions = ({
  count,
  getScrollElement,
  rowHeight = PROJECT_TREE_ROW_HEIGHT_PX,
  overscan = PROJECT_TREE_ROW_OVERSCAN
}: {
  readonly count: number;
  readonly getScrollElement: () => HTMLElement | null;
  readonly rowHeight?: number;
  readonly overscan?: number;
}) => ({
  count,
  getScrollElement,
  estimateSize: () => rowHeight,
  overscan,
  initialRect: FIXED_ROW_VIEWPORT_FALLBACK,
  observeElementRect: (
    instance: Virtualizer<HTMLElement, HTMLElement>,
    callback: (rect: { width: number; height: number }) => void
  ) => observeElementRect(instance, (rect) => {
    callback(rect.height > 0
      ? rect
      : {
        width: rect.width > 0 ? rect.width : FIXED_ROW_VIEWPORT_FALLBACK.width,
        height: FIXED_ROW_VIEWPORT_FALLBACK.height
      });
  }),
  measureElement: (element: HTMLElement) => {
    const height = element.getBoundingClientRect().height;
    return height > 0 ? height : rowHeight;
  }
});

export type DirectoryStateMap = Record<string, AgentProjectTreeDirectoryState | undefined>;

export type VisibleTreeRow =
  | {
      readonly kind: "entry";
      readonly key: string;
      readonly depth: number;
      readonly entry: FileManagerEntry;
    }
  | {
      readonly kind: "loading";
      readonly key: string;
      readonly depth: number;
    }
  | {
      readonly kind: "error";
      readonly key: string;
      readonly depth: number;
      readonly errorMessage: string;
    }
  | {
      readonly kind: "empty";
      readonly key: string;
      readonly depth: number;
    };

const isNoiseEntry = (entry: FileManagerEntry): boolean =>
  entry.isHidden ||
  (entry.kind === "directory" && NOISE_DIRECTORY_NAMES.has(entry.name));

const filterNoise = (entries: readonly FileManagerEntry[]): readonly FileManagerEntry[] =>
  entries.filter((entry) => !isNoiseEntry(entry));

const sortEntries = (entries: readonly FileManagerEntry[]): readonly FileManagerEntry[] =>
  [...entries].sort((left, right) => {
    if (left.kind !== right.kind) {
      return left.kind === "directory" ? -1 : 1;
    }
    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base"
    });
  });

export const prepareEntries = (entries: readonly FileManagerEntry[]): readonly FileManagerEntry[] =>
  sortEntries(filterNoise(entries));

export const flattenVisibleRows = ({
  rootPath,
  expandedPaths,
  directoryStates
}: {
  readonly rootPath: string;
  readonly expandedPaths: ReadonlySet<string>;
  readonly directoryStates: DirectoryStateMap;
}): readonly VisibleTreeRow[] => {
  const rows: VisibleTreeRow[] = [];
  const walk = (path: string, depth: number): void => {
    const node = directoryStates[path];
    if (node === undefined || node.status === "loading") {
      rows.push({
        kind: "loading",
        key: `loading:${path}`,
        depth
      });
      return;
    }
    if (node.status === "error") {
      rows.push({
        kind: "error",
        key: `error:${path}`,
        depth,
        errorMessage: node.errorMessage
      });
      return;
    }
    const entries = prepareEntries(node.entries);
    if (entries.length === 0) {
      rows.push({ kind: "empty", key: `empty:${path}`, depth });
      return;
    }
    for (const entry of entries) {
      rows.push({ kind: "entry", key: entry.path, depth, entry });
      if (entry.kind === "directory" && expandedPaths.has(entry.path)) {
        walk(entry.path, depth + 1);
      }
    }
  };
  walk(rootPath, 1);
  return rows;
};
