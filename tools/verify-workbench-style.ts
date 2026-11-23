import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

import {
  UNIT_VALUES,
  WORKBENCH_FOUNDATION_TOKENS
} from "../apps/desktop/src/modules/workbench/theme/foundation";
import { WORKBENCH_RESOLVED_THEMES } from "../apps/desktop/src/modules/workbench/theme/config";

type SelectorRule = {
  readonly selector: string;
  readonly required: readonly RegExp[];
  readonly forbidden?: readonly RegExp[];
  readonly optional?: boolean;
};

type IconOnlyHoverRule = {
  readonly selector: string;
  readonly requireTransparentBackground?: boolean;
  readonly optional?: boolean;
};

type CssSelectorBlock = {
  readonly selectors: readonly string[];
  readonly body: string;
};

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DESKTOP_SRC_DIR = path.join(ROOT, "apps/desktop/src");
const RENDERER_UI_DIR = path.join(DESKTOP_SRC_DIR, "renderer/ui");
const RENDERER_UI_COMPONENTS_DIR = path.join(RENDERER_UI_DIR, "components");
const RENDERER_UI_PRIMITIVES_DIR = path.join(RENDERER_UI_DIR, "primitives");
const RENDERER_STYLES_DIR = path.join(DESKTOP_SRC_DIR, "renderer/styles");
const DELETED_RENDERER_WORKBENCH_STYLES_DIR = path.join(RENDERER_STYLES_DIR, "workbench");
const RENDERER_STYLES_ENTRYPOINT = path.join(RENDERER_STYLES_DIR, "index.scss");
const MODULES_WORKBENCH_DIR = path.join(ROOT, "apps/desktop/src/modules/workbench");
const WORKBENCH_SHELL_ENTRYPOINT = path.join(MODULES_WORKBENCH_DIR, "shell/index.tsx");
const WORKBENCH_SHELL_ENTRYPOINT_RELATIVE = "apps/desktop/src/modules/workbench/shell/index.tsx";
const DELETED_LEGACY_CSS_PATH = path.join(RENDERER_STYLES_DIR, "workbench.css");
const WORKBENCH_SHELL_ENTRYPOINT_MAX_LINES = 800;
// Four layout steps plus one micro-container. Adding a step means auditing every
// surface at that width first; 1080px and 1200px were folded into 980px/1180px.
const APPROVED_BREAKPOINTS = new Set(["360px", "720px", "860px", "980px", "1180px"]);
const FOUNDATION_TOKEN_NAMES = new Set(Object.keys(WORKBENCH_FOUNDATION_TOKENS));
const VISUAL_STYLE_KEYS = new Set([
  "fontSize",
  "lineHeight",
  "width",
  "height",
  "minWidth",
  "minHeight",
  "maxWidth",
  "maxHeight",
  "top",
  "right",
  "bottom",
  "left",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "margin",
  "marginTop",
  "marginRight",
  "marginBottom",
  "marginLeft",
  "gap",
  "columnGap",
  "rowGap",
  "borderRadius"
]);

const MIGRATED_PAGE_TOKEN_SOURCE_FILES = [
  /apps\/desktop\/src\/renderer\/styles\/shell\.scss$/,
  /apps\/desktop\/src\/renderer\/styles\/surfaces\.scss$/,
  /apps\/desktop\/src\/renderer\/styles\/agents\.scss$/,
  /apps\/desktop\/src\/renderer\/styles\/effects\.scss$/
];

const PAGE_VISUAL_TOKEN_NAMES = new Set([
  "--lyra-settings-bg",
  "--lyra-settings-shell-bg",
  "--lyra-settings-sidebar-bg",
  "--lyra-settings-panel-bg",
  "--lyra-settings-card-bg",
  "--lyra-settings-card-strong-bg",
  "--lyra-settings-row-bg",
  "--lyra-settings-row-hover-bg",
  "--lyra-settings-row-active-bg",
  "--lyra-settings-row-active-border",
  "--lyra-settings-input-bg",
  "--lyra-settings-input-hover-bg",
  "--lyra-settings-input-focus-bg",
  "--lyra-settings-input-border",
  "--lyra-settings-input-focus-border",
  "--lyra-settings-input-placeholder",
  "--lyra-settings-muted-bg",
  "--lyra-settings-border",
  "--lyra-settings-border-strong",
  "--lyra-settings-focus",
  "--lyra-settings-switch-on",
  "--lyra-settings-primary-button",
  "--lyra-settings-primary-button-fg"
]);

const LEGACY_VISUAL_TOKEN_REFERENCE_PATTERN = /var\(--(?:lyra-bg|lyra-line|material)-[A-Za-z0-9-]+/g;
const LEGACY_VISUAL_TOKEN_PATTERN =
  /--(?:lyra-(?:bg|line)-[A-Za-z0-9-]+|lyra-browser-tabs-bg|lyra-browser-tab-bg|lyra-browser-tab-top-border|lyra-tab-inactive|lyra-tab-active(?![A-Za-z0-9_-])|material-[A-Za-z0-9-]+)/g;

const MATERIAL_TOKEN_SOURCE_FILES = [
  /apps\/desktop\/src\/renderer\/styles\/material\.scss$/,
  /apps\/desktop\/src\/renderer\/styles\/app-ui\.scss$/
];

const RAW_VALUE_SOURCE_FILES = [
  /apps\/desktop\/src\/renderer\/styles\/tokens\.css$/,
  /apps\/desktop\/src\/renderer\/styles\/material\.scss$/
];

const TS_INLINE_PX_ALLOWLIST = [
  /apps\/desktop\/src\/modules\/workbench\/shell\/use-panel-layout\.ts$/,
  /apps\/desktop\/src\/modules\/workbench\/global-dialog\/view\.tsx$/,
  /apps\/desktop\/src\/modules\/workbench\/browser-tabs\/tab-strip\.tsx$/
];

const REACT_STATEFUL_VIEW_IMPORTS = new Set([
  "useCallback",
  "useEffect",
  "useLayoutEffect",
  "useMemo",
  "useReducer",
  "useRef",
  "useState"
]);

const STATEFUL_VIEW_HOOK_PATTERN = /\bReact\.use(?:Callback|Effect|LayoutEffect|Memo|Reducer|Ref|State)\b/;
const DISALLOWED_TITLEBAR_CONTEXT_TITLE_CLASS = "lyra-titlebar-context-title";
const DISALLOWED_LOCAL_TITLEBAR_CLASSES = [
  "lyra-file-manager-toolbar",
  "lyra-file-editor-toolbar",
  "lyra-results-topbar",
  "lyra-deep-search-topbar",
  "lyra-deep-search-toolbar",
  "lyra-image-viewer-toolbar",
  "lyra-notification-center-header",
] as const;

const DISALLOWED_WORKBENCH_INTRINSIC_CONTROLS = new Set([
  "button",
  "input",
  "select",
  "textarea"
]);

const BASELINE_VIOLATION_PATTERNS: readonly RegExp[] = [
  /apps\/desktop\/src\/renderer\/styles\/surfaces\.scss:1424 references unknown foundation token --lyra-unit-760$/u,
  /apps\/desktop\/src\/renderer\/styles\/surfaces\.scss:1253 contains raw color literal #000$/u,
  /apps\/desktop\/src\/renderer\/styles\/surfaces\.scss:1254 contains raw color literal #000$/u,
  /apps\/desktop\/src\/renderer\/styles\/surfaces\.scss:1257 contains raw color literal #000$/u,
  /apps\/desktop\/src\/renderer\/styles\/surfaces\.scss:1258 contains raw color literal #000$/u,
  /apps\/desktop\/src\/modules\/workbench\/ai-panel\/lyra-agents\/features\/chat\/ProjectDirChip\.tsx:34 uses raw numeric inline style for gap$/u,
  /apps\/desktop\/src\/modules\/workbench\/ai-panel\/lyra-agents\/features\/chat\/ProjectDirChip\.tsx:34 uses raw px inline style for padding$/u,
  /apps\/desktop\/src\/modules\/workbench\/ai-panel\/lyra-agents\/features\/chat\/ProjectDirChip\.tsx:34 uses raw numeric inline style for fontSize$/u,
  /^apps\/desktop\/src\/modules\/workbench\/browser-tabs\/settings-surface-view\.tsx:1 Presentational workbench views must not own React state\/effect hooks\. Move runtime behavior into a model or runtime hook\.$/u,
  // ponytail: startup gates predate the kit mandate and are being rebuilt in
  // the UI refactor; path-scoped baselines keep the guard green until then.
  /apps\/desktop\/src\/renderer\/startup\/(?:InstallerGate|StartupGate|UninstallerGate|startup-chrome)\.tsx:\d+ Workbench business TSX must use Lyra App components instead of bare </u,
];

const APPROVED_DESKTOP_ICON_MODULES = new Set([
  "@lyra/icons",
  "@lyra/icons/file-type",
  "@lyra/icons/brands"
]);

const ICON_PACKAGE_MODULE_PATTERN =
  /^(?:@lyra\/icons(?:\/(?:file-type|brands))?$|lucide-react|@lobehub\/icons(?:\/|$)|@fortawesome(?:\/|$)|@hugeicons(?:\/|$)|hugeicons-react$|react-icons(?:\/|$)|@heroicons(?:\/|$)|@phosphor-icons(?:\/|$)|phosphor-react$|reicon(?:-react|-brands)?$|@tabler\/icons(?:-|\/|$)|@remixicon\/react$|@iconify\/react(?:\/|$)|@iconify-json(?:\/|$)|@radix-ui\/react-icons$|@mui\/icons-material(?:\/|$)|feather-icons(?:\/|$)|material-icons(?:\/|$))/;

const selectorRules: readonly SelectorRule[] = [
  {
    selector: ".lyra-workspace",
    required: [/grid-template-rows:\s*minmax\(0,\s*1fr\)\s*var\(--lyra-size-browser-tab-h\)\s*;/]
  },
  {
    selector: ".lyra-workspace > .lyra-browser-tabs",
    required: [/grid-row:\s*2\s*;/]
  },
  {
    selector: ".lyra-workspace-surface-single",
    required: [/grid-row:\s*1\s*;/]
  },
  {
    selector: ".lyra-workspace-surface-split",
    required: [/grid-row:\s*1\s*;/]
  },
  {
    selector: ".lyra-browser-tabs::before",
    required: [/top:\s*0\s*;/],
    forbidden: [/bottom:\s*0\s*;/]
  },
  {
    // Current design: borderless neutral tab. The Chrome-style curved tab shape
    // (chrome-tab-background geometry) was removed in c5355aa5; do not restore it.
    selector: ".lyra-browser-tab-item",
    required: [
      /border:\s*0\s*;/,
      /border-radius:\s*var\(--lyra-radius-8\)\s*;/,
      /background:\s*transparent\s*;/
    ],
    forbidden: [/lyra-chrome-tab-background/]
  },
  {
    selector: ".lyra-browser-tabs .lyra-browser-tab-item",
    required: [
      /margin-bottom:\s*var\(--lyra-browser-tab-control-y\)\s*;/,
      /margin-top:\s*var\(--lyra-browser-tab-control-y\)\s*;/
    ]
  },
  {
    selector: ".lyra-tab-strip .lyra-tab-item-active",
    required: [/background:\s*var\(--lyra-tab-shape-active-fill\)\s*;/]
  },
  {
    // Every tab model carries both hooks; the active fill must cover both.
    selector: ".lyra-tab-strip .lyra-browser-tab-item-active",
    required: [/background:\s*var\(--lyra-tab-shape-active-fill\)\s*;/]
  },
  {
    selector: ".lyra-browser-tab-item:hover .lyra-browser-tab-title",
    required: [/color:\s*var\(--lyra-text-primary\)\s*;/]
  },
  {
    selector: ".lyra-ai-agent-send-ready",
    required: [],
    forbidden: [/border-color\s*:/, /background\s*:/, /box-shadow\s*:/],
    optional: true
  }
];

const iconOnlyHoverRules: readonly IconOnlyHoverRule[] = [
  { selector: ".lyra-titlebar-navigation-action:hover" },
  { selector: ".lyra-titlebar-context-icon-button:hover:enabled" },
  { selector: ".lyra-titlebar-context-text-button:hover:enabled" },
  { selector: ".lyra-browser-nav-button:hover" },
  { selector: ".lyra-browser-tab-close:hover" },
  { selector: ".lyra-browser-tab-add:hover" },
  { selector: ".lyra-ai-panel-shell-icon-button:hover", optional: true }
];

const transparentMenuSelectionSelectors: readonly string[] = [];

const globalForbiddenPatterns: readonly { readonly pattern: RegExp; readonly message: string }[] = [
  {
    pattern: /\.lyra-browser-tab-item:hover\s+\.lyra-chrome-tab-background\s*\{/gs,
    message: "Tab hover must not reveal or alter the tab shape; only text brightness may change."
  },
  {
    pattern: /\.lyra-browser-tab-item:hover\s+\.lyra-chrome-tab-dividers/gs,
    message: "Tab hover must not alter tab dividers; only text brightness may change."
  },
  {
    pattern: /\.lyra-browser-tab-item:hover\s*\{[^}]*box-shadow\s*:/gs,
    message: "Tab hover must not add a tab shadow."
  }
];

export const escapeRegex = (input: string): string =>
  input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const splitSelectorList = (selectorText: string): string[] =>
  selectorText
    .split(",")
    .map((selector) => selector.trim())
    .filter((selector) => selector.length > 0 && !selector.startsWith("@"));

const collectSelectorBlocks = (css: string): CssSelectorBlock[] =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => ({
      selectors: splitSelectorList(match[1] ?? ""),
      body: match[2] ?? ""
    }))
    .filter((block) => block.selectors.length > 0);

const findSelectorBlock = (css: string, selector: string): string | null => {
  const blocks = collectSelectorBlocks(css);
  const matchingBlock =
    blocks.find((block) => block.selectors.length === 1 && block.selectors[0] === selector)
    ?? blocks.find((block) => block.selectors.includes(selector));
  return matchingBlock?.body ?? null;
};

const findSelectorBlocks = (css: string, selector: string): CssSelectorBlock[] =>
  collectSelectorBlocks(css).filter((block) => block.selectors.includes(selector));

const isMigratedPageTokenSourceFile = (filePath: string): boolean =>
  MIGRATED_PAGE_TOKEN_SOURCE_FILES.some((pattern) => pattern.test(filePath));

const isTsInlinePxAllowlisted = (filePath: string): boolean =>
  TS_INLINE_PX_ALLOWLIST.some((pattern) => pattern.test(filePath));

const isMaterialTokenSourceFile = (filePath: string): boolean =>
  MATERIAL_TOKEN_SOURCE_FILES.some((pattern) => pattern.test(filePath));

const isRawValueSourceFile = (filePath: string): boolean =>
  RAW_VALUE_SOURCE_FILES.some((pattern) => pattern.test(normalizePath(filePath)));

const isBreakpointLine = (line: string, literal: string): boolean =>
  (line.includes("@media") || line.includes("@container")) && APPROVED_BREAKPOINTS.has(literal);

const lineNumberAt = (text: string, index: number): number =>
  text.slice(0, index).split("\n").length;

const normalizePath = (filePath: string): string => filePath.split(path.sep).join("/");

const relativeToRoot = (filePath: string): string => normalizePath(path.relative(ROOT, filePath));

const reportPath = (filePath: string): string =>
  path.isAbsolute(filePath) ? relativeToRoot(filePath) : normalizePath(filePath);

const isWorkbenchTestPath = (filePath: string): boolean => /\/tests\//.test(normalizePath(filePath));

const isWorkbenchBusinessTsxPath = (filePath: string): boolean => {
  const normalizedPath = normalizePath(filePath);
  return normalizedPath.endsWith(".tsx")
    && /apps\/desktop\/src\/modules\/workbench\//.test(normalizedPath)
    && !/\/tests\/|\.test\./.test(normalizedPath);
};

// Every desktop TSX outside the component kit itself must render through the
// kit (renderer/ui app-* components) instead of bare interactive elements.
const isDesktopUiConsumerTsxPath = (filePath: string): boolean => {
  const normalizedPath = normalizePath(filePath);
  return normalizedPath.endsWith(".tsx")
    && /apps\/desktop\/src\//.test(normalizedPath)
    && !/apps\/desktop\/src\/renderer\/ui\//.test(normalizedPath)
    && !/\/tests\/|\.test\./.test(normalizedPath);
};

const basenameOf = (filePath: string): string => path.basename(filePath);

const isPresentationalViewPath = (filePath: string): boolean => {
  const basename = basenameOf(filePath);
  return basename === "surface-view.tsx"
    || basename.endsWith("-surface-view.tsx")
    || basename === "agent-composer-view.tsx"
    || basename === "settings-surface-view.tsx"
    || basename === "tab-strip-view.tsx"
    || basename === "thread-view.tsx"
    || /^view-panels(?:-[^/]+)?\.tsx$/.test(basename);
};

const isPureUiModelPath = (filePath: string): boolean => {
  const basename = basenameOf(filePath);
  if (basename.startsWith("use-") || basename.endsWith("-view-model.ts")) {
    return false;
  }
  return basename === "model.ts"
    || basename === "render-model.ts"
    || basename === "runtime-model.ts"
    || basename === "split-model.ts"
    || basename === "surface-model.ts"
    || basename.endsWith("-model.ts")
    || basename.endsWith("-render-model.ts")
    || basename.endsWith("-runtime-model.ts")
    || basename.endsWith("-surface-model.ts")
    || basename.endsWith("-task.ts");
};

const isRuntimeHookPath = (filePath: string): boolean => {
  const basename = basenameOf(filePath);
  return basename.startsWith("use-")
    && (basename.endsWith("-runtime.ts") || basename.endsWith("-model.ts"));
};

const moduleBasename = (moduleSpecifier: string): string => {
  const normalized = normalizePath(moduleSpecifier);
  const withoutQuery = normalized.split("?")[0] ?? normalized;
  return withoutQuery.split("/").at(-1) ?? withoutQuery;
};

const isLocalModuleSpecifier = (moduleSpecifier: string): boolean =>
  moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/");

const isViewModuleSpecifier = (moduleSpecifier: string): boolean => {
  const basename = moduleBasename(moduleSpecifier).replace(/\.(?:tsx?|jsx?)$/, "");
  return basename === "view"
    || basename === "surface-view"
    || basename === "thread-view"
    || basename === "settings-surface-view"
    || basename === "tab-strip-view"
    || basename === "agent-composer-view"
    || basename.startsWith("view-panels-")
    || basename === "view-panels"
    || basename.endsWith("-view");
};

const isRuntimeModuleSpecifier = (moduleSpecifier: string): boolean => {
  const basename = moduleBasename(moduleSpecifier).replace(/\.(?:tsx?|jsx?)$/, "");
  return basename === "service"
    || basename.startsWith("use-")
    || basename === "runtime-model"
    || basename.endsWith("-runtime")
    || basename.endsWith("-task");
};

const hasExactClassToken = (text: string, className: string): boolean =>
  new RegExp(`(?<![A-Za-z0-9_-])${escapeRegex(className)}(?![A-Za-z0-9_-])`, "u").test(text);

export const collectFiles = (rootDir: string, predicate: (filePath: string) => boolean): string[] => {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const results: string[] = [];
  const walk = (current: string): void => {
    const stats = fs.statSync(current);
    if (stats.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
        walk(path.join(current, name));
      }
      return;
    }
    if (predicate(current)) {
      results.push(current);
    }
  };

  walk(rootDir);
  return results.sort();
};

const collectCssPaths = (): string[] => {
  const cssPaths = [
    ...collectFiles(RENDERER_STYLES_DIR, (filePath) => filePath.endsWith(".css") || filePath.endsWith(".scss")),
    ...collectFiles(MODULES_WORKBENCH_DIR, (filePath) => filePath.endsWith(".css"))
  ];

  if (cssPaths.length === 0) {
    throw new Error("No renderer or workbench style files found.");
  }

  return cssPaths;
};

const collectWorkbenchTsPaths = (): string[] =>
  collectFiles(MODULES_WORKBENCH_DIR, (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"));

const collectDesktopTsPaths = (): string[] =>
  collectFiles(DESKTOP_SRC_DIR, (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx"));

const collectRendererStylePaths = (): string[] =>
  collectFiles(RENDERER_STYLES_DIR, (filePath) => filePath.endsWith(".css") || filePath.endsWith(".scss"));

export const validateDeletedStyleEntrypoints = (): string[] => {
  const violations: string[] = [];
  if (fs.existsSync(DELETED_RENDERER_WORKBENCH_STYLES_DIR)) {
    violations.push("apps/desktop/src/renderer/styles/workbench must not exist; use shell.scss, surfaces.scss, agents.scss, and effects.scss.");
  }
  if (fs.existsSync(DELETED_LEGACY_CSS_PATH)) {
    violations.push("apps/desktop/src/renderer/styles/workbench.css must not exist; styles/index.scss is the only renderer style entrypoint.");
  }
  if (fs.existsSync(RENDERER_STYLES_ENTRYPOINT)) {
    const entrypoint = fs.readFileSync(RENDERER_STYLES_ENTRYPOINT, "utf8");
    if (/workbench\//.test(entrypoint) || /workbench\.css/.test(entrypoint)) {
      violations.push("apps/desktop/src/renderer/styles/index.scss must not import deleted workbench CSS entrypoints.");
    }
  }
  return violations;
};

const isWithinDir = (filePath: string, dir: string): boolean => {
  const absoluteFilePath = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const relative = path.relative(dir, absoluteFilePath);
  return relative.length === 0 || (relative.startsWith("..") === false && path.isAbsolute(relative) === false);
};

export const validateSelectorRules = (css: string): string[] => {
  const violations: string[] = [];
  for (const rule of selectorRules) {
    const block = findSelectorBlock(css, rule.selector);
    if (block === null) {
      if (rule.optional === true) {
        continue;
      }
      violations.push(`Missing selector block: ${rule.selector}`);
      continue;
    }

    for (const requiredPattern of rule.required) {
      if (!requiredPattern.test(block)) {
        violations.push(`${rule.selector} missing required style: ${requiredPattern}`);
      }
    }

    for (const forbiddenPattern of rule.forbidden ?? []) {
      if (forbiddenPattern.test(block)) {
        violations.push(`${rule.selector} contains forbidden style: ${forbiddenPattern}`);
      }
    }
  }
  return violations;
};

export const validateGlobalPatterns = (css: string): string[] => {
  const violations: string[] = [];
  for (const rule of globalForbiddenPatterns) {
    if (rule.pattern.test(css)) {
      violations.push(rule.message);
    }
  }
  return violations;
};

const hasDeclaration = (body: string, property: string): boolean =>
  new RegExp(`(?:^|;)\\s*${escapeRegex(property)}\\s*:`, "m").test(body);

const declarationValues = (body: string, propertyPattern: string): string[] =>
  [...body.matchAll(new RegExp(`(?:^|;)\\s*${propertyPattern}\\s*:\\s*([^;]+)\\s*;`, "gm"))]
    .map((match) => match[1]?.trim() ?? "");

const hasTransparentBackgroundDeclaration = (body: string): boolean =>
  declarationValues(body, "background(?:-color)?").some((value) => value === "transparent");

const hasNonTransparentBackgroundDeclaration = (body: string): boolean =>
  declarationValues(body, "background(?:-color)?").some((value) => value !== "transparent");

const hasNonNoneBoxShadowDeclaration = (body: string): boolean =>
  declarationValues(body, "box-shadow").some((value) => value !== "none");

export const validateIconOnlyHoverRules = (css: string): string[] => {
  const violations: string[] = [];
  for (const rule of iconOnlyHoverRules) {
    const blocks = findSelectorBlocks(css, rule.selector);
    if (blocks.length === 0) {
      if (rule.optional === true) {
        continue;
      }
      violations.push(`Missing icon-only hover selector block: ${rule.selector}`);
      continue;
    }

    const requireTransparentBackground = rule.requireTransparentBackground ?? true;
    for (const block of blocks) {
      if (requireTransparentBackground && !hasTransparentBackgroundDeclaration(block.body)) {
        violations.push(`${rule.selector} hover must declare background: transparent.`);
      }
      if (hasNonTransparentBackgroundDeclaration(block.body)) {
        violations.push(`${rule.selector} hover must not add a container background.`);
      }
      for (const property of ["border-color", "box-shadow", "transform"]) {
        if (hasDeclaration(block.body, property)) {
          violations.push(`${rule.selector} hover must not change ${property}.`);
        }
      }
    }
  }
  return violations;
};

export const validateTransparentMenuSelections = (css: string): string[] => {
  const violations: string[] = [];
  for (const selector of transparentMenuSelectionSelectors) {
    const blocks = findSelectorBlocks(css, selector);
    if (blocks.length === 0) {
      violations.push(`Missing transparent menu selection selector block: ${selector}`);
      continue;
    }
    for (const block of blocks) {
      if (hasNonTransparentBackgroundDeclaration(block.body)) {
        violations.push(`${selector} selected state must not use a row background.`);
      }
      if (hasNonNoneBoxShadowDeclaration(block.body)) {
        violations.push(`${selector} selected state must not use a row shadow.`);
      }
      if (hasDeclaration(block.body, "border-color")) {
        violations.push(`${selector} selected state must not use a row border.`);
      }
    }
  }
  return violations;
};

export const scanPageVisualTokenSources = (filePath: string, text: string): string[] => {
  const violations: string[] = [];
  if (!isMigratedPageTokenSourceFile(filePath)) {
    return violations;
  }

  for (const match of text.matchAll(LEGACY_VISUAL_TOKEN_REFERENCE_PATTERN)) {
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} migrated surfaces must use --lyra-app-* or App component tokens, not legacy ${match[0].slice("var(".length)}.`);
  }

  for (const match of text.matchAll(/(--lyra-[A-Za-z0-9-]+)\s*:\s*([^;]+);/g)) {
    const tokenName = match[1] ?? "";
    const value = (match[2] ?? "").trim();
    if (!PAGE_VISUAL_TOKEN_NAMES.has(tokenName)) {
      continue;
    }
    if (value === "transparent" || /var\(--lyra-app-/.test(value)) {
      continue;
    }
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} ${tokenName} must alias --lyra-app-* instead of defining page-local visual values.`);
  }

  return violations;
};

export const scanLegacyVisualTokenConsumers = (filePath: string, text: string): string[] => {
  if (isWorkbenchTestPath(filePath)) {
    return [];
  }

  const normalizedPath = normalizePath(filePath);
  const violations: string[] = [];
  for (const match of text.matchAll(LEGACY_VISUAL_TOKEN_PATTERN)) {
    const tokenName = match[0] ?? "";
    if (tokenName.startsWith("--material-")) {
      if (isMaterialTokenSourceFile(normalizedPath)) {
        continue;
      }
      const lineNumber = lineNumberAt(text, match.index ?? 0);
      violations.push(`${reportPath(filePath)}:${lineNumber} --material-* is reserved for the global material shell layer; migrated/product UI must use --lyra-app-* or App components.`);
      continue;
    }

    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${reportPath(filePath)}:${lineNumber} ${tokenName} belongs to the removed visual system. Use --lyra-app-* as the product visual source.`);
  }

  return violations;
};

/**
 * Resolvable `--lyra-*` properties: stylesheet declarations, foundation/theme
 * tokens, the injected unit scale, and custom properties set from TSX inline styles.
 */
export const collectResolvableLyraProperties = (cssTexts: readonly string[], tsxTexts: readonly string[]): Set<string> => {
  const names = new Set<string>();
  for (const text of [...cssTexts, ...tsxTexts]) {
    for (const match of text.matchAll(/(?<=[\s;{{\[])(--lyra-[A-Za-z0-9-]+)\s*:/g)) names.add(match[1] ?? "");
    for (const match of text.matchAll(/["'](--lyra-[A-Za-z0-9-]+)["']\s*:/g)) names.add(match[1] ?? "");
  }
  for (const value of UNIT_VALUES) names.add(`--lyra-unit-${value.replaceAll(".", "-")}`);
  const themeTokens = [...Object.keys(WORKBENCH_FOUNDATION_TOKENS), ...Object.values(WORKBENCH_RESOLVED_THEMES).flatMap((theme) => Object.keys(theme.vars))];
  for (const name of themeTokens) {
    if (name.startsWith("--lyra-app-")) names.add(`--lyra-material-solid-${name.slice(10)}`);
  }
  return names;
};

/** A bare `var(--lyra-*)` whose token is unresolvable makes the whole declaration invalid. */
export const scanUndeclaredTokenReferences = (filePath: string, text: string, resolvable: ReadonlySet<string>): string[] => {
  if (isWorkbenchTestPath(filePath)) return [];
  const violations: string[] = [];
  for (const match of text.matchAll(/var\(\s*(--lyra-[A-Za-z0-9-]+)/g)) {
    const tokenName = match[1] ?? "";
    if (resolvable.has(tokenName) || /^\s*,/.test(text.slice((match.index ?? 0) + match[0].length))) continue;
    violations.push(`${reportPath(filePath)}:${lineNumberAt(text, match.index ?? 0)} references undeclared token ${tokenName}; the declaration is dropped at runtime.`);
  }
  return violations;
};

/** Raw line-height ratios, sub-tier control heights and off-scale text sizes are the three scales that drift silently. */
const TEXT_SIZE_TIERS = new Set([
  "12",
  "14",
  "16",
  "20",
  "24",
  "caption",
  "body",
  "title-sm",
  "title-md"
]);

const validateTypographicScale = (filePath: string, text: string, violations: string[]): void => {
  for (const match of text.matchAll(/line-height:\s*([0-9]*\.?[0-9]+)\s*;/g)) {
    violations.push(`${filePath}:${lineNumberAt(text, match.index ?? 0)} uses raw line-height ${match[1]}; use a --lyra-text-line-* ratio token.`);
  }
  for (const match of text.matchAll(/--lyra-control-h-(22|26|30)\b/g)) {
    violations.push(`${filePath}:${lineNumberAt(text, match.index ?? 0)} uses the retired control-height tier ${match[0]}; 24px is the click-target floor and 28/32 are the only compact/default steps.`);
  }
  for (const match of text.matchAll(/--lyra-text-size-([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/g)) {
    if (TEXT_SIZE_TIERS.has(match[1] ?? "")) continue;
    violations.push(`${filePath}:${lineNumberAt(text, match.index ?? 0)} uses ${match[0]}; the type scale is 12/14/16/20/24 only (caption/body/title-sm/title-md).`);
  }
  for (const match of text.matchAll(/--lyra-text-ui-xl\b/g)) {
    violations.push(`${filePath}:${lineNumberAt(text, match.index ?? 0)} uses retired token ${match[0]}; the type scale has no ui-xl tier.`);
  }
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim().split("\n").pop() ?? "";
    if (/\.katex\b/.test(selector)) continue;
    const relative = /font-size:\s*([0-9]*\.?[0-9]+)em\s*;/.exec(match[2] ?? "");
    if (relative === null) continue;
    const offset = (match.index ?? 0) + (match[1] ?? "").length + (match[2] ?? "").indexOf(relative[0]);
    violations.push(`${filePath}:${lineNumberAt(text, offset)} sets a relative font-size ${relative[1]}em; use a --lyra-text-size-* tier so text follows the user's font-size setting.`);
  }
};

const DISABLED_SELECTOR = /:(?:disabled|disabled\))|\[(?:aria-)?disabled/;

/** Disabled controls must dim by the one token; anything else is drift. */
const validateDisabledOpacity = (filePath: string, text: string, violations: string[]): void => {
  for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = (match[1] ?? "").trim().split("\n").pop() ?? "";
    if (!DISABLED_SELECTOR.test(selector)) continue;
    const body = match[2] ?? "";
    const opacity = /opacity:\s*([0-9]*\.?[0-9]+)\s*;/.exec(body);
    if (opacity === null || opacity[1] === "1") continue;
    const offset = (match.index ?? 0) + (match[1] ?? "").length + body.indexOf(opacity[0]);
    violations.push(`${filePath}:${lineNumberAt(text, offset)} sets disabled opacity ${opacity[1]}; use var(--lyra-opacity-disabled).`);
  }
};

/** Literal `ease` keywords and hand-copied bezier curves drift silently while
    identical-looking. Every easing must name a token. */
const validateEasingTokens = (filePath: string, text: string, violations: string[]): void => {
  for (const match of text.matchAll(/(?:transition|animation)[^;]*;/g)) {
    const declaration = match[0];
    if (/(?:^|[\s,])ease(?:-in|-out|-in-out)?(?=[\s,;])/u.test(declaration) === false) continue;
    if (declaration.includes("var(--lyra-ease-")) continue;
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} uses a literal ease keyword; name it with a var(--lyra-ease-*) token.`);
  }
  for (const match of text.matchAll(/(?:transition|animation)[^;]*cubic-bezier\(/g)) {
    const declaration = text.slice(match.index ?? 0, (match.index ?? 0) + 120);
    if (declaration.includes("var(--lyra-ease-")) continue;
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} uses a raw cubic-bezier; use a var(--lyra-ease-*) token.`);
  }
};

/** `outline: thin` is a non-token width; focus rings read --lyra-app-focus. */
const validateOutlineLiterals = (filePath: string, text: string, violations: string[]): void => {
  for (const match of text.matchAll(/outline[^;:]*:\s*thin\b/g)) {
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} uses the outline-thin keyword; use --lyra-stroke-* width tokens.`);
  }
  for (const match of text.matchAll(/outline[^;:]*:\s*(?:--lyra-space-[0-9]+|[0-9]+px)\s+solid\s+var\(--lyra-text-accent\)/g)) {
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} draws the focus ring with --lyra-text-accent; focus rings use --lyra-app-focus.`);
  }
};

/** Workhorse decorative dimming values (0.72 icon-dim, 0.82 lifted) have tokens;
    re-adding the raw literal is drift. One-off decorative values stay local. */
const WORKHORSE_OPACITY_LITERALS = new Set(["0.72", "0.82"]);
const validateDecorativeOpacityTokens = (filePath: string, text: string, violations: string[]): void => {
  for (const match of text.matchAll(/opacity:\s*(0\.[0-9]+)\s*;/g)) {
    if (!WORKHORSE_OPACITY_LITERALS.has(match[1] ?? "")) continue;
    const lineNumber = lineNumberAt(text, match.index ?? 0);
    violations.push(`${filePath}:${lineNumber} sets opacity ${match[1]}; use var(--lyra-opacity-icon-dim) or var(--lyra-opacity-lifted).`);
  }
};

/** Replace CSS comments with same-length blanks so literal scans skip them
    while line numbers still match the original file. */
const blankCssComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));

export const scanCssText = (filePath: string, text: string): string[] => {
  const violations: string[] = [];
  if (/apps\/desktop\/src\/modules\/workbench\/ai-panel\/lyra-agents\/.*\.css$/.test(normalizePath(filePath))) {
    violations.push(`${filePath}:1 Lyra Agents styles must live in apps/desktop/src/renderer/styles/agents.scss, not inside the module directory.`);
  }
  const rawValueSource = isRawValueSourceFile(filePath);
  // Literal scans (px, colors, em, opacity) run on comment-free text; the
  // typographic/disabled validators read the original so selectors they rely
  // on keep their shape.
  const scanned = blankCssComments(text);
  validateTypographicScale(filePath, scanned, violations);
  validateDisabledOpacity(filePath, scanned, violations);
  validateEasingTokens(filePath, scanned, violations);
  validateOutlineLiterals(filePath, scanned, violations);
  validateDecorativeOpacityTokens(filePath, scanned, violations);

  for (const match of scanned.matchAll(/var\((--lyra-unit-[A-Za-z0-9-]+)/g)) {
    const tokenName = match[1] ?? "";
    if (FOUNDATION_TOKEN_NAMES.has(tokenName)) {
      continue;
    }
    const index = match.index ?? 0;
    const lineNumber = lineNumberAt(scanned, index);
    violations.push(`${filePath}:${lineNumber} references unknown foundation token ${tokenName}`);
  }

  if (!rawValueSource) {
    for (const match of scanned.matchAll(/-?\d+(?:\.\d+)?px\b/g)) {
      const literal = match[0];
      const index = match.index ?? 0;
      const lineNumber = lineNumberAt(scanned, index);
      const line = scanned.split("\n")[lineNumber - 1] ?? "";
      if (isBreakpointLine(line, literal.replace(/^-/, ""))) {
        continue;
      }
      violations.push(`${filePath}:${lineNumber} contains raw length literal ${literal}`);
    }
  }

  if (!rawValueSource) {
    for (const match of scanned.matchAll(/#[0-9A-Fa-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)|oklch\([^)]*\)/g)) {
      const index = match.index ?? 0;
      const lineNumber = lineNumberAt(scanned, index);
      violations.push(`${filePath}:${lineNumber} contains raw color literal ${match[0]}`);
    }
  }

  return violations;
};

const collectStyleViolations = (
  filePath: string,
  initializer: ts.Expression,
  propertyName: string,
  sourceFile: ts.SourceFile
): string[] => {
  const violations: string[] = [];
  if (!VISUAL_STYLE_KEYS.has(propertyName)) {
    return violations;
  }
  if (initializer.kind === ts.SyntaxKind.NumericLiteral) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(initializer.getStart());
    violations.push(`${filePath}:${line + 1} uses raw numeric inline style for ${propertyName}`);
    return violations;
  }
  if (
    initializer.kind === ts.SyntaxKind.PrefixUnaryExpression &&
    (initializer as ts.PrefixUnaryExpression).operand.kind === ts.SyntaxKind.NumericLiteral
  ) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(initializer.getStart());
    violations.push(`${filePath}:${line + 1} uses raw numeric inline style for ${propertyName}`);
    return violations;
  }
  if (
    ts.isStringLiteralLike(initializer) &&
    /-?\d+(?:\.\d+)?px\b/.test(initializer.text)
  ) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(initializer.getStart());
    violations.push(`${filePath}:${line + 1} uses raw px inline style for ${propertyName}`);
    return violations;
  }
  if (ts.isObjectLiteralExpression(initializer) && propertyName === "padding") {
    for (const property of initializer.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const nestedName = property.name.getText(sourceFile);
      violations.push(...collectStyleViolations(filePath, property.initializer, nestedName, sourceFile));
    }
  }
  return violations;
};

export const scanInlineStyleLiterals = (filePath: string, text: string): string[] => {
  if (isTsInlinePxAllowlisted(filePath)) {
    return [];
  }

  const sourceFile = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const violations: string[] = [];

  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "style" &&
      node.initializer &&
      ts.isJsxExpression(node.initializer)
    ) {
      const expression = node.initializer.expression;
      if (expression && ts.isObjectLiteralExpression(expression)) {
        for (const property of expression.properties) {
          if (!ts.isPropertyAssignment(property)) {
            continue;
          }
          const propertyName = property.name.getText(sourceFile).replace(/^["']|["']$/g, "");
          violations.push(...collectStyleViolations(filePath, property.initializer, propertyName, sourceFile));
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return violations;
};

const hasValueImportBinding = (node: ts.ImportDeclaration): boolean => {
  const importClause = node.importClause;
  if (importClause === undefined) {
    return true;
  }
  if (importClause.isTypeOnly) {
    return false;
  }
  if (importClause.name !== undefined) {
    return true;
  }
  const namedBindings = importClause.namedBindings;
  if (namedBindings === undefined) {
    return false;
  }
  if (ts.isNamespaceImport(namedBindings)) {
    return true;
  }
  return namedBindings.elements.some((element) => element.isTypeOnly === false);
};

const valueImportNames = (node: ts.ImportDeclaration): string[] => {
  const importClause = node.importClause;
  if (importClause === undefined || importClause.isTypeOnly || importClause.namedBindings === undefined) {
    return [];
  }
  if (ts.isNamespaceImport(importClause.namedBindings)) {
    return [importClause.namedBindings.name.text];
  }
  return importClause.namedBindings.elements
    .filter((element) => element.isTypeOnly === false)
    .map((element) => element.name.text);
};

const hasValueExportBinding = (node: ts.ExportDeclaration): boolean => {
  if (node.isTypeOnly) {
    return false;
  }
  const exportClause = node.exportClause;
  if (exportClause === undefined || ts.isNamespaceExport(exportClause)) {
    return true;
  }
  return exportClause.elements.some((element) => element.isTypeOnly === false);
};

const moduleSpecifierText = (
  node: ts.ImportDeclaration | ts.ExportDeclaration
): string | null => {
  const moduleSpecifier = node.moduleSpecifier;
  if (moduleSpecifier === undefined || !ts.isStringLiteralLike(moduleSpecifier)) {
    return null;
  }
  return moduleSpecifier.text;
};

export const scanWorkbenchUiComposition = (filePath: string, text: string): string[] => {
  if (isWorkbenchTestPath(filePath) || (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx"))) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const violations: string[] = [];
  const relativePath = reportPath(filePath);
  const isPresentationalView = isPresentationalViewPath(filePath);
  const isPureModel = isPureUiModelPath(filePath);
  const isRuntimeHook = isRuntimeHookPath(filePath);

  const pushViolation = (node: ts.Node, message: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${relativePath}:${line + 1} ${message}`);
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const moduleSpecifier = moduleSpecifierText(statement);
      if (moduleSpecifier === null) {
        continue;
      }
      const hasValueBinding = hasValueImportBinding(statement);
      if (
        isPresentationalView
        && moduleSpecifier === "react"
        && valueImportNames(statement).some((name) => REACT_STATEFUL_VIEW_IMPORTS.has(name))
      ) {
        pushViolation(statement, "Presentational workbench views must not own React state/effect hooks. Move runtime behavior into a model or runtime hook.");
      }
      if (
        isPresentationalView
        && hasValueBinding
        && isLocalModuleSpecifier(moduleSpecifier)
        && isRuntimeModuleSpecifier(moduleSpecifier)
      ) {
        pushViolation(statement, "Presentational workbench views must not import runtime hooks, services, or task modules by value. Pass data/actions through props.");
      }
      if (isPureModel && hasValueBinding && moduleSpecifier === "react") {
        pushViolation(statement, "Workbench model/render/task files may import React types only, not React runtime values.");
      }
      if (
        (isPureModel || isRuntimeHook)
        && hasValueBinding
        && isLocalModuleSpecifier(moduleSpecifier)
        && isViewModuleSpecifier(moduleSpecifier)
      ) {
        pushViolation(statement, "Workbench model/runtime files must not import view components by value. Keep view dependencies one-way.");
      }
    }

    if (ts.isExportDeclaration(statement)) {
      const moduleSpecifier = moduleSpecifierText(statement);
      if (moduleSpecifier === null) {
        continue;
      }
      const hasValueBinding = hasValueExportBinding(statement);
      if (
        (isPureModel || isRuntimeHook)
        && hasValueBinding
        && isLocalModuleSpecifier(moduleSpecifier)
        && isViewModuleSpecifier(moduleSpecifier)
      ) {
        pushViolation(statement, "Workbench model/runtime files must not re-export view components by value. Keep view dependencies one-way.");
      }
    }
  }

  if (isPresentationalView && STATEFUL_VIEW_HOOK_PATTERN.test(text)) {
    violations.push(`${relativePath}:1 Presentational workbench views must not call React state/effect hooks. Move runtime behavior into a model or runtime hook.`);
  }
  if (isPresentationalView && /\bgetDesktopApi\b|\blyraDesktop\b/.test(text)) {
    violations.push(`${relativePath}:1 Presentational workbench views must not call the desktop bridge directly. Pass bridge-backed actions through props.`);
  }

  return violations;
};

export const scanWorkbenchDesignContracts = (filePath: string, text: string): string[] => {
  const normalizedPath = normalizePath(filePath);
  const relativePath = reportPath(filePath);
  const violations: string[] = [];

  if (/agent-chat-demo|lyra-agents\/(?:App|index)\.css|lyra-agents\/styles\/tokens\.css/.test(text)) {
    violations.push(`${relativePath}:1 AI Panel must use the Lyra Agents module and global agents.scss layer; old demo paths and local CSS/token imports are forbidden.`);
  }

  if (normalizedPath.endsWith(".tsx")) {
    if (hasExactClassToken(text, DISALLOWED_TITLEBAR_CONTEXT_TITLE_CLASS)) {
      violations.push(`${relativePath}:1 Global titlebar contributions must not render visible title blocks; the active tab already carries the surface title.`);
    }
    for (const className of DISALLOWED_LOCAL_TITLEBAR_CLASSES) {
      if (hasExactClassToken(text, className)) {
        violations.push(`${relativePath}:1 Workspace surfaces must move ${className} controls into the global titlebar contribution.`);
      }
    }
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/ai-panel\/thread-tabs\.tsx$/.test(normalizedPath)
    && (/\bprojectLogoUrlForRoot\b/.test(text) || /projectLogoUrl=\{(?!null\})/u.test(text))
  ) {
    violations.push(`${relativePath}:1 AI thread tabs must use the controlled identity icon projection, not direct project logo helpers.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/browser-search\/(?:result-engine-overview|deep-search-overview-sections|result-web-section)\.tsx$/.test(normalizedPath)
    && /style=\{\{[^}]*accentColor/u.test(text)
  ) {
    violations.push(`${relativePath}:1 Browser search surfaces must not render per-engine accent colors inline.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/browser-search\/(?:result-engine-overview|deep-search-overview-sections)\.tsx$/.test(normalizedPath)
    && /engine-dot/.test(text)
  ) {
    violations.push(`${relativePath}:1 Browser search source markers must not use decorative dot indicators.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/browser-search\/deep-search-canvas\.tsx$/.test(normalizedPath)
    && /#[0-9a-fA-F]{6}/u.test(text)
  ) {
    violations.push(`${relativePath}:1 Deep search minimap nodes must stay neutral, not per-kind accent colors.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/browser-search\/result-surface-model\.ts$/.test(normalizedPath)
    && /sourceChips:[\s\S]*accentColor/u.test(text)
  ) {
    violations.push(`${relativePath}:1 Browser result source chips must stay neutral and not carry accentColor.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/shell\/element-picker-appearance\.ts$/.test(normalizedPath)
    && (/--lyra-(?:app-primary-button|app-focus|text-accent)/.test(text) || /#7d82e8|#5c78e2/i.test(text))
  ) {
    violations.push(`${relativePath}:1 Browser element picker appearance must use neutral workbench tones, not accent tokens.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/ai-panel\/rich-content\.tsx$/.test(normalizedPath)
    && /--lyra-line-focused/.test(text)
  ) {
    violations.push(`${relativePath}:1 AI rich content diagrams must use neutral line tokens, not focused accent tokens.`);
  }

  if (
    /apps\/desktop\/src\/modules\/workbench\/ai-panel\/lyra-agents\/features\/chat\/(?:citation-chip-dom|.*ChipView)\.tsx?$/.test(normalizedPath)
    && /CITATION_CHIP_ICON_SVGS|dangerouslySetInnerHTML|\.innerHTML\s*=/.test(text)
  ) {
    violations.push(`${relativePath}:1 Citation and attachment chips must use the shared composer-chip-icon registry, not inline SVG strings.`);
  }

  return violations;
};

export const scanUiImportBoundaries = (filePath: string, text: string): string[] => {
  const normalizedPath = normalizePath(filePath);
  if (
    (!filePath.endsWith(".ts") && !filePath.endsWith(".tsx")) ||
    /\/tests\/|\.test\./.test(normalizedPath)
  ) {
    return [];
  }

  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const violations: string[] = [];
  const relativePath = reportPath(filePath);
  const isPrimitiveLayer = isWithinDir(filePath, RENDERER_UI_PRIMITIVES_DIR);
  const isLyraUiLayer = isWithinDir(filePath, RENDERER_UI_COMPONENTS_DIR);
  const enforceAppComponentControls =
    isWorkbenchBusinessTsxPath(normalizedPath) || isDesktopUiConsumerTsxPath(normalizedPath);

  const pushViolation = (node: ts.Node, message: string): void => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push(`${relativePath}:${line + 1} ${message}`);
  };

  const checkModuleSpecifier = (
    node: ts.ImportDeclaration | ts.ExportDeclaration,
    moduleSpecifier: string
  ): void => {
    if (
      ICON_PACKAGE_MODULE_PATTERN.test(moduleSpecifier)
      && APPROVED_DESKTOP_ICON_MODULES.has(moduleSpecifier) === false
      // Vendored kit internals (renderer/ui) may use the component library's
      // own icon set; business code stays on @lyra/icons.
      && !/apps\/desktop\/src\/renderer\/ui\//.test(normalizedPath)
    ) {
      pushViolation(node, "Desktop icon imports are limited to @lyra/icons.");
    }
    if (moduleSpecifier.startsWith("@radix-ui/") && isPrimitiveLayer === false) {
      pushViolation(node, "Radix primitives must be wrapped inside apps/desktop/src/renderer/ui/primitives before business code consumes them.");
    }
    if (moduleSpecifier.startsWith("@renderer/ui/primitives") && isLyraUiLayer === false) {
      pushViolation(node, "Business code must import Lyra App components/layout/app modules instead of @renderer/ui/primitives.");
    }
  };

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
      const moduleSpecifier = moduleSpecifierText(statement);
      if (moduleSpecifier !== null) {
        checkModuleSpecifier(statement, moduleSpecifier);
      }
    }
  }

  if (enforceAppComponentControls) {
    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tagName = node.tagName.getText(sourceFile);
        if (DISALLOWED_WORKBENCH_INTRINSIC_CONTROLS.has(tagName)) {
          pushViolation(node, `Workbench business TSX must use Lyra App components instead of bare <${tagName}>.`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }

  return violations;
};

export const scanWorkbenchShellEntrypointSize = (filePath: string, text: string): string[] => {
  const normalizedPath = normalizePath(filePath);
  if (
    normalizedPath !== normalizePath(WORKBENCH_SHELL_ENTRYPOINT)
    && normalizedPath !== WORKBENCH_SHELL_ENTRYPOINT_RELATIVE
  ) {
    return [];
  }
  const lineCount = text.split(/\r?\n/).length;
  if (lineCount <= WORKBENCH_SHELL_ENTRYPOINT_MAX_LINES) {
    return [];
  }
  return [
    `${reportPath(filePath)}:${WORKBENCH_SHELL_ENTRYPOINT_MAX_LINES + 1} shell/index.tsx is ${String(lineCount)} lines; keep WorkbenchShell as a composition layer and extract new UI/runtime logic into shell hooks, render models, or surface adapters.`
  ];
};

export const runUiStyleGuard = (): string[] => {
  const violations: string[] = [];

  violations.push(...validateDeletedStyleEntrypoints());

  const cssPaths = collectCssPaths();
  const cssByPath = new Map(cssPaths.map((cssPath) => [cssPath, fs.readFileSync(cssPath, "utf8")]));
  const combinedCss = [...cssByPath.values()].join("\n\n");
  violations.push(...validateSelectorRules(combinedCss));
  violations.push(...validateGlobalPatterns(combinedCss));
  violations.push(...validateIconOnlyHoverRules(combinedCss));
  violations.push(...validateTransparentMenuSelections(combinedCss));

  const resolvableTokens = collectResolvableLyraProperties(
    [...cssByPath.values()],
    collectFiles(DESKTOP_SRC_DIR, (filePath) => filePath.endsWith(".ts") || filePath.endsWith(".tsx")).map((filePath) => fs.readFileSync(filePath, "utf8"))
  );

  for (const [cssPath, cssText] of cssByPath) {
    violations.push(...scanCssText(cssPath, cssText));
    violations.push(...scanPageVisualTokenSources(cssPath, cssText));
    violations.push(...scanUndeclaredTokenReferences(cssPath, cssText, resolvableTokens));
  }

  for (const filePath of collectWorkbenchTsPaths()) {
    const text = fs.readFileSync(filePath, "utf8");
    violations.push(...scanInlineStyleLiterals(filePath, text));
    violations.push(...scanWorkbenchUiComposition(filePath, text));
    violations.push(...scanWorkbenchDesignContracts(filePath, text));
    violations.push(...scanWorkbenchShellEntrypointSize(filePath, text));
  }

  for (const filePath of collectDesktopTsPaths()) {
    violations.push(...scanUiImportBoundaries(filePath, fs.readFileSync(filePath, "utf8")));
  }

  const legacyConsumerPaths = new Set([
    ...collectRendererStylePaths(),
    ...collectDesktopTsPaths()
  ]);
  for (const filePath of legacyConsumerPaths) {
    violations.push(...scanLegacyVisualTokenConsumers(filePath, fs.readFileSync(filePath, "utf8")));
  }

  return violations;
};

export const main = (): void => {
  try {
    const violations = runUiStyleGuard().filter((violation) =>
      BASELINE_VIOLATION_PATTERNS.every((pattern) => pattern.test(violation) === false)
    );
    if (violations.length > 0) {
      console.error("\n[Lyra UI Guard] Violations found:\n");
      for (const violation of violations) {
        console.error(`- ${violation}`);
      }
      process.exit(1);
    }
    console.log("[Lyra UI Guard] OK");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Lyra UI Guard] ${message}`);
    process.exit(1);
  }
};

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
