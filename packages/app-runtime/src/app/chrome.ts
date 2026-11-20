export const WORKBENCH_CHROME_SLOTS = [
  "toolbarContext",
  "navigation",
  "composerMeta"
] as const;

export type WorkbenchChromeSlotV1 = (typeof WORKBENCH_CHROME_SLOTS)[number];

export type WorkbenchChromeScopeV1 =
  | { readonly kind: "workspaceTab"; readonly tabId: string }
  | { readonly kind: "aiSession"; readonly sessionId: string }
  | { readonly kind: "global"; readonly id: "workbench" };

export type ChromeActionToneV1 = "default" | "danger";

/**
 * Icon actions render as square buttons. Text actions render as the compact
 * label buttons the address band already uses for page-local switches, so a
 * surface can move a section switch out of its own body without inventing a
 * second visual language.
 */
export type ChromeActionDisplayV1 = "icon" | "text";

export type ChromeActionV1 = {
  readonly id: string;
  readonly label: string;
  readonly commandId: string;
  readonly order: number;
  readonly iconKey?: string;
  readonly display?: ChromeActionDisplayV1;
  /** Marks the currently selected member of a text switch. */
  readonly active?: boolean;
  readonly tone?: ChromeActionToneV1;
  readonly disabled?: boolean;
};

export type ChromeChipV1 = {
  readonly id: string;
  readonly text: string;
  readonly order: number;
};

export type ChromeNavigationModeV1 = "omnibox" | "readOnly" | "hidden";
export type ChromeNavigationPrimaryActionV1 = "submit" | "reload";

export type ChromeNavigationV1 = {
  readonly mode: ChromeNavigationModeV1;
  readonly value?: string;
  readonly placeholder?: string;
  readonly ariaLabel?: string;
  readonly primaryAction?: ChromeNavigationPrimaryActionV1;
  readonly trailingActionIds?: readonly string[];
};

export type ChromeBuiltinMetaIdV1 = "projectDir" | "backgroundTerminal" | "location";

export type ChromeMetaItemV1 =
  | { readonly kind: "builtin"; readonly id: ChromeBuiltinMetaIdV1; readonly order: number }
  | {
      readonly kind: "button";
      readonly id: string;
      readonly label: string;
      readonly commandId: string;
      readonly order: number;
      readonly iconKey?: string;
      readonly disabled?: boolean;
      readonly status?: string;
      readonly busy?: boolean;
    };

export type WorkbenchChromeContributionV1 = {
  readonly ariaLabel?: string;
  readonly actions?: readonly ChromeActionV1[];
  readonly chips?: readonly ChromeChipV1[];
  readonly navigation?: ChromeNavigationV1;
  readonly metaItems?: readonly ChromeMetaItemV1[];
};

export type HostChromeSlotContributionV1 = {
  readonly slot: WorkbenchChromeSlotV1;
  readonly contribution: WorkbenchChromeContributionV1;
};

export type HostChromeContributionsV1 = {
  readonly slots?: readonly HostChromeSlotContributionV1[];
};

const ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && Array.isArray(value) === false;
const isIdentifier = (value: unknown): value is string =>
  typeof value === "string" && ID_PATTERN.test(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const BUILTIN_META_IDS = new Set<ChromeBuiltinMetaIdV1>([
  "projectDir",
  "backgroundTerminal",
  "location"
]);

export const workbenchChromeScopeKey = (scope: WorkbenchChromeScopeV1): string => {
  if (scope.kind === "workspaceTab") {
    return `workspaceTab:${scope.tabId}`;
  }
  if (scope.kind === "aiSession") {
    return `aiSession:${scope.sessionId}`;
  }
  return `global:${scope.id}`;
};

export const validateWorkbenchChromeScopeV1 = (value: unknown): value is WorkbenchChromeScopeV1 => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "workspaceTab") {
    return isNonEmptyString(value.tabId);
  }
  if (value.kind === "aiSession") {
    return isNonEmptyString(value.sessionId);
  }
  if (value.kind === "global") {
    return value.id === "workbench";
  }
  return false;
};

export const validateWorkbenchChromeSlotV1 = (value: unknown): value is WorkbenchChromeSlotV1 =>
  typeof value === "string"
  && (WORKBENCH_CHROME_SLOTS as readonly string[]).includes(value);

const validateChromeActionV1 = (value: unknown): value is ChromeActionV1 => {
  if (!isRecord(value)) {
    return false;
  }
  return isIdentifier(value.id)
    && isNonEmptyString(value.label)
    && isIdentifier(value.commandId)
    && typeof value.order === "number"
    && Number.isFinite(value.order)
    && (value.iconKey === undefined || isNonEmptyString(value.iconKey))
    && (value.display === undefined || value.display === "icon" || value.display === "text")
    && (value.active === undefined || typeof value.active === "boolean")
    && (value.tone === undefined || value.tone === "default" || value.tone === "danger")
    && (value.disabled === undefined || typeof value.disabled === "boolean");
};

const validateChromeChipV1 = (value: unknown): value is ChromeChipV1 => {
  if (!isRecord(value)) {
    return false;
  }
  return isIdentifier(value.id)
    && typeof value.text === "string"
    && typeof value.order === "number"
    && Number.isFinite(value.order);
};

export const validateChromeNavigationV1 = (value: unknown): value is ChromeNavigationV1 => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.mode !== "omnibox" && value.mode !== "readOnly" && value.mode !== "hidden") {
    return false;
  }
  if (value.value !== undefined && typeof value.value !== "string") {
    return false;
  }
  if (value.placeholder !== undefined && typeof value.placeholder !== "string") {
    return false;
  }
  if (value.ariaLabel !== undefined && typeof value.ariaLabel !== "string") {
    return false;
  }
  if (
    value.primaryAction !== undefined
    && value.primaryAction !== "submit"
    && value.primaryAction !== "reload"
  ) {
    return false;
  }
  if (value.trailingActionIds !== undefined) {
    if (!Array.isArray(value.trailingActionIds)) {
      return false;
    }
    if (value.trailingActionIds.some((item) => !isIdentifier(item))) {
      return false;
    }
  }
  return true;
};

const validateChromeMetaItemV1 = (value: unknown): value is ChromeMetaItemV1 => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (typeof value.order !== "number" || !Number.isFinite(value.order)) {
    return false;
  }
  if (value.kind === "builtin") {
    return typeof value.id === "string" && BUILTIN_META_IDS.has(value.id as ChromeBuiltinMetaIdV1);
  }
  if (value.kind === "button") {
    return isIdentifier(value.id)
      && isNonEmptyString(value.label)
      && isIdentifier(value.commandId)
      && (value.iconKey === undefined || isNonEmptyString(value.iconKey))
      && (value.disabled === undefined || typeof value.disabled === "boolean")
      && (value.status === undefined || typeof value.status === "string")
      && (value.busy === undefined || typeof value.busy === "boolean");
  }
  return false;
};

export const validateWorkbenchChromeContributionV1 = (
  value: unknown
): value is WorkbenchChromeContributionV1 => {
  if (!isRecord(value)) {
    return false;
  }
  if (value.ariaLabel !== undefined && typeof value.ariaLabel !== "string") {
    return false;
  }
  if (
    value.actions !== undefined
    && (
      !Array.isArray(value.actions)
      || value.actions.some((item) => !validateChromeActionV1(item))
    )
  ) {
    return false;
  }
  if (
    value.chips !== undefined
    && (
      !Array.isArray(value.chips)
      || value.chips.some((item) => !validateChromeChipV1(item))
    )
  ) {
    return false;
  }
  if (value.navigation !== undefined && !validateChromeNavigationV1(value.navigation)) {
    return false;
  }
  if (
    value.metaItems !== undefined
    && (
      !Array.isArray(value.metaItems)
      || value.metaItems.some((item) => !validateChromeMetaItemV1(item))
    )
  ) {
    return false;
  }
  return true;
};

const validateHostChromeContributionsV1 = (value: unknown): value is HostChromeContributionsV1 => {
  if (!isRecord(value)) {
    return false;
  }
  const slots = value.slots ?? [];
  if (!Array.isArray(slots)) {
    return false;
  }
  return slots.every((item) => {
    if (!isRecord(item)) {
      return false;
    }
    return validateWorkbenchChromeSlotV1(item.slot)
      && validateWorkbenchChromeContributionV1(item.contribution);
  });
};

export { validateHostChromeContributionsV1 };
