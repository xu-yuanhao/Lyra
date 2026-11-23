import {
  AppWindow,
  BookText,
  Bot,
  Camera,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardPaste,
  Clock3,
  Crosshair,
  Database,
  Eye,
  File,
  FileCode2,
  FileCog,
  FileDiff,
  FilePenLine,
  FilePlus,
  FileText,
  FolderOpen,
  FolderTree,
  GitBranch,
  GitCommitHorizontal,
  GitCompareArrows,
  Globe,
  Hammer,
  HelpCircle,
  Link2,
  List,
  ListChecks,
  Monitor,
  PackageOpen,
  Pencil,
  Puzzle,
  RadioTower,
  ScrollText,
  Search,
  SquareTerminal,
  Store,
  Target,
  Terminal,
  Webhook,
  Workflow,
  XCircle,
} from "@lyra/icons";
import type { ToolCall } from "../types";

const ICON_SIZE = 15;
const ICON_STROKE = 1.7;

const TOOL_EXECUTION_INDICATOR_CLASS =
  "lyra-agents-tool-execution-indicator inline-flex items-center justify-center w-[var(--lyra-space-16)] h-[var(--lyra-space-16)] gap-[var(--lyra-space-1)] text-[var(--lyra-text-muted)] [&_span]:w-[var(--lyra-space-2)] [&_span]:h-[var(--lyra-space-10)] [&_span]:rounded-[var(--lyra-radius-pill)] [&_span]:bg-current [&_span]:opacity-[0.32] [&_span]:animate-[lyra-agents-tool-execution-step_0.95s_steps(2,end)_infinite] [&_span:nth-child(2)]:[animation-delay:120ms] [&_span:nth-child(3)]:[animation-delay:240ms] [&_span:nth-child(4)]:[animation-delay:360ms] motion-reduce:[&_span]:animate-none motion-reduce:[&_span]:opacity-50";

export const ChevronIcon = ({ open }: { open: boolean }) => (
  <ChevronRight
    size={14}
    strokeWidth={2}
    style={{
      transition: "transform 160ms ease",
      transform: open ? "rotate(90deg)" : "rotate(0deg)",
    }}
    aria-hidden
  />
);

export const ToolExecutionIndicator = () => (
  <span className={TOOL_EXECUTION_INDICATOR_CLASS} aria-hidden="true">
    <span />
    <span />
    <span />
    <span />
  </span>
);

export const ToolIcon = ({ kind }: { kind: ToolCall["kind"] }) => {
  const props = { size: ICON_SIZE, strokeWidth: ICON_STROKE, "aria-hidden": true as const };
  switch (kind) {
    case "read":
      return <FileText {...props} />;
    case "edit":
      return <Pencil {...props} />;
    case "search":
      return <Search {...props} />;
    case "shell":
    case "terminal":
      return <SquareTerminal {...props} />;
    case "web":
      return <Globe {...props} />;
    case "workbench":
      return <AppWindow {...props} />;
    case "thought":
      return <Clock3 {...props} />;
    case "plan":
      return <BookText {...props} />;
    case "task":
      return <ListChecks {...props} />;
    case "create":
      return <FilePlus {...props} />;
  }
};

const normalized = (value: string | undefined): string => value?.trim().toLowerCase() ?? "";

const structuredOperation = (call: ToolCall): string => {
  if (call.operation !== undefined) return normalized(call.operation);
  const details = call.details;
  if (
    details?.type === "terminal"
    || details?.type === "workbench"
    || details?.type === "lumen"
    || details?.type === "software"
  ) {
    return normalized(details.action);
  }
  return "";
};

export const ToolCallIcon = ({ call }: { call: ToolCall }) => {
  const props = { size: ICON_SIZE, strokeWidth: ICON_STROKE, "aria-hidden": true as const };
  const domain = normalized(call.domain);
  const operation = structuredOperation(call);
  const rendererHint = normalized(call.rendererHint ?? call.activityKind);

  if (call.kind === "task" || domain === "todo") {
    if (operation === "write") return <ClipboardPaste {...props} />;
    if (operation === "read" || operation === "list") return <List {...props} />;
    if (operation === "update" || operation === "finish") return <CheckCheck {...props} />;
    return <ListChecks {...props} />;
  }

  if (domain === "git") {
    if (operation === "diff" || operation === "compare") return <GitCompareArrows {...props} />;
    if (operation === "commit") return <GitCommitHorizontal {...props} />;
    return <GitBranch {...props} />;
  }

  if (operation === "search" || operation === "find" || operation === "query") {
    return <Search {...props} />;
  }
  if (operation === "list") return <List {...props} />;
  if (operation === "read_doc") return <BookText {...props} />;

  if (domain === "memory") return <Database {...props} />;
  if (domain === "code" || domain === "lsp") return <FileCode2 {...props} />;
  if (domain === "skill" || domain === "skills") return <Puzzle {...props} />;
  if (domain === "mcp") return <Webhook {...props} />;

  if (domain === "terminal" || call.details?.type === "terminal") {
    if (operation === "write" || operation === "input" || operation === "type") {
      return <FilePenLine {...props} />;
    }
    if (operation === "read" || operation === "screen" || operation === "output") {
      return <Monitor {...props} />;
    }
    if (operation === "run" || operation === "command" || call.details?.type === "terminal" && call.details.command !== undefined) {
      return <SquareTerminal {...props} />;
    }
    return <Terminal {...props} />;
  }

  if (domain === "workbench" || call.details?.type === "workbench") {
    if (operation === "read") return <BookText {...props} />;
    if (operation === "open" || operation === "focus" || operation === "switch") {
      return <FolderOpen {...props} />;
    }
    return <AppWindow {...props} />;
  }

  if (domain === "software" || call.details?.type === "software") {
    if (operation === "install" || operation === "package") return <PackageOpen {...props} />;
    return <Store {...props} />;
  }

  if (
    domain === "browser"
    || domain === "browser_ax"
    || domain === "web"
    || call.kind === "web"
    || call.details?.type === "web"
    || call.details?.type === "lumen"
  ) {
    if (operation === "map") return <Workflow {...props} />;
    if (operation === "locate") return <Crosshair {...props} />;
    if (operation === "read") return <BookText {...props} />;
    if (operation === "see" || operation === "capture" || operation === "screenshot") {
      return <Camera {...props} />;
    }
    if (operation === "navigate" || operation === "fetch" || operation === "open") {
      return <Link2 {...props} />;
    }
    if (operation === "wait") return <Clock3 {...props} />;
    if (operation === "scroll") return <ScrollText {...props} />;
    if (
      operation === "act"
      || operation === "vact"
      || operation === "click"
      || operation === "type"
      || operation === "drag"
      || operation === "press"
      || operation === "submit"
    ) {
      return <Target {...props} />;
    }
    if (operation === "audit" || operation === "diagnostic") return <RadioTower {...props} />;
    return <Globe {...props} />;
  }

  if (domain === "filesystem") {
    if (operation === "inspect" || rendererHint === "inspect") return <FileCog {...props} />;
    if (operation === "tree") return <FolderTree {...props} />;
  }
  if (rendererHint === "inspect") return <Eye {...props} />;

  if (call.details?.type === "ask") return <HelpCircle {...props} />;
  if (call.details?.type === "text") return <Bot {...props} />;

  switch (call.kind) {
    case "read":
      return <FileText {...props} />;
    case "edit":
      return operation === "create"
        ? <FilePlus {...props} />
        : operation === "diff" || operation === "patch"
          ? <FileDiff {...props} />
          : <FilePenLine {...props} />;
    case "search":
      return <Search {...props} />;
    case "shell":
      return <SquareTerminal {...props} />;
    case "terminal":
      return <Terminal {...props} />;
    case "thought":
      return <Clock3 {...props} />;
    case "plan":
      return <BookText {...props} />;
    case "create":
      return <FilePlus {...props} />;
    case "workbench":
      return <AppWindow {...props} />;
  }
  return <Hammer {...props} />;
};

export const FileIcon = () => (
  <File size={ICON_SIZE} strokeWidth={ICON_STROKE} aria-hidden />
);

export const ErrorCircleIcon = () => (
  <XCircle size={14} strokeWidth={1.8} aria-hidden />
);

export const WarningCircleIcon = () => (
  <CircleAlert size={14} strokeWidth={1.8} aria-hidden />
);

export const CheckCircleIcon = () => (
  <CheckCircle2 size={14} strokeWidth={1.8} aria-hidden />
);
