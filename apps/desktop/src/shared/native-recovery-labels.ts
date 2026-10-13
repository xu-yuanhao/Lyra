import { shared } from "./i18n/en-US/shared";

const keys = {
  pageTitle: "appStatus.pageStoppedTitle",
  pageDescription: "appStatus.pageStoppedDescription",
  reload: "appStatus.reloadPage",
  windowTitle: "appStatus.windowStoppedTitle",
  windowDescription: "appStatus.windowStoppedDescription",
  reopenWindow: "appStatus.reopenWindow",
  closeWindow: "appStatus.closeWindow"
} as const;
export const nativeRecoveryLabels = (resources?: Readonly<Record<string, string>>) =>
  Object.fromEntries(Object.entries(keys).map(([name, key]) => [name, resources?.[key] ?? shared[key]])) as Record<keyof typeof keys, string>;
export type NativeRecoveryLabels = ReturnType<typeof nativeRecoveryLabels>;
