import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import { t } from "@workbench/i18n";

import { Toaster } from "./sonner";

export type AppToastTone = "neutral" | "info" | "success" | "warning" | "error";

type AppStatusNotice = {
  readonly description?: string;
  readonly id: string;
  readonly title: string;
  readonly tone: AppToastTone;
};

type AppStatusListener = (notice: AppStatusNotice) => void;

const listeners = new Set<AppStatusListener>();
const pending: AppStatusNotice[] = [];

const nextId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `notice-${Date.now()}-${Math.floor(Math.random() * 100_000)}`;

const errorMessage = (error: unknown): string | undefined => {
  if (error === null || error === undefined) {
    return undefined;
  }
  const message = error instanceof Error ? error.message : String(error);
  return message.trim().length === 0 ? undefined : message;
};

const RESIZE_OBSERVER_LOOP_RE =
  /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i;

export const isIgnoredWorkbenchWindowError = (
  event: Pick<ErrorEvent, "error" | "message">
): boolean => {
  // ponytail: React commit 抛 NotFoundError DOMException（removeChild/insertBefore
  // "not a child"）归 AppErrorBoundary 管。此处转 toast → setNotices →
  // AppStatusProvider 重渲染 → 再次进入损坏子树抛同错 → 无限刷屏。跳过断循环。
  // 代价：漏报罕见非 render 期 NotFoundError。诊断由 boundary componentDidCatch 兜底。
  if (event.error instanceof DOMException && event.error.name === "NotFoundError") {
    return true;
  }
  const message = [
    event.message,
    event.error instanceof Error ? event.error.message : "",
    typeof event.error === "string" ? event.error : ""
  ].join(" ");
  // Chromium reports this when a ResizeObserver callback mutates layout in the
  // same frame. It is not an app crash; toasting it as "Interface error" is the bug.
  return RESIZE_OBSERVER_LOOP_RE.test(message);
};

const showNotice = (notice: AppStatusNotice): void => {
  const options = {
    description: notice.description,
    duration: 5_000
  };
  switch (notice.tone) {
    case "success":
      toast.success(notice.title, options);
      break;
    case "warning":
      toast.warning(notice.title, options);
      break;
    case "error":
      toast.error(notice.title, options);
      break;
    case "info":
      toast.info(notice.title, options);
      break;
    default:
      toast(notice.title, options);
  }
};

export const reportWorkbenchStatus = (
  notice: Omit<AppStatusNotice, "id">
): void => {
  const next = { ...notice, id: nextId() };
  if (listeners.size === 0) {
    pending.push(next);
    return;
  }
  queueMicrotask(() => {
    listeners.forEach((listener) => listener(next));
  });
};

export const reportWorkbenchError = (
  error: unknown,
  title = t("appStatus.operationFailed")
): void => {
  console.warn(`[lyra] ${title}`, error);
  const description = errorMessage(error);
  reportWorkbenchStatus({
    title,
    tone: "error",
    ...(description === undefined ? {} : { description })
  });
};

const subscribe = (listener: AppStatusListener): (() => void) => {
  listeners.add(listener);
  while (pending.length > 0) {
    const notice = pending.shift();
    if (notice !== undefined) {
      listener(notice);
    }
  }
  return () => {
    listeners.delete(listener);
  };
};

export function AppStatusProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => subscribe(showNotice), []);

  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      if (isIgnoredWorkbenchWindowError(event)) {
        return;
      }
      reportWorkbenchError(event.error ?? event.message, t("appStatus.unexpectedErrorTitle"));
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      reportWorkbenchError(event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return (
    <>
      {children}
      <Toaster position="bottom-right" visibleToasts={4} />
    </>
  );
}
