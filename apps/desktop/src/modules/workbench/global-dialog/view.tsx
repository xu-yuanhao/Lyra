import {
  AppButton,
  AppDialog,
  AppIconButton,
  AppInput
} from "@renderer/ui/components";
import { Check, Copy } from "@lyra/icons";
import type { FormEvent } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { writeClipboardText } from "../../../shared/clipboard";
import { getDesktopApi } from "../shell/service";

import type { GlobalDialogActionContext, GlobalDialogState } from "./types";

type GlobalDialogHostProps = {
  readonly state: GlobalDialogState;
  readonly onClose: () => void;
  readonly onSelectAction: (actionId: string, context?: GlobalDialogActionContext) => void;
};

const toActionLayoutClassName = (count: number): string => {
  if (count <= 1) {
    return "lyra-global-dialog-actions-1 grid-cols-[minmax(0,1fr)] max-[980px]:grid-cols-[minmax(0,1fr)]";
  }
  if (count === 2) {
    return "lyra-global-dialog-actions-2 grid-cols-[repeat(2,minmax(0,1fr))] max-[980px]:grid-cols-[minmax(0,1fr)]";
  }
  return "lyra-global-dialog-actions-3 grid-cols-[repeat(3,minmax(0,1fr))] max-[980px]:grid-cols-[minmax(0,1fr)]";
};

const DEFAULT_SOURCE_ICON_LABEL = "APP";
const COPIED_MARK_DURATION_MS = 1600;

const resolveSourceIconLabel = (source: GlobalDialogState["source"]): string => {
  if (source === undefined) {
    return DEFAULT_SOURCE_ICON_LABEL;
  }

  if (source.iconLabel !== undefined) {
    return source.iconLabel;
  }

  const compactTitle = source.title.replace(/\s+/g, "");
  const fallback = compactTitle.slice(0, 2).toUpperCase();
  return fallback.length > 0 ? fallback : DEFAULT_SOURCE_ICON_LABEL;
};

const setWorkbenchModalOcclusion = (active: boolean): void => {
  void getDesktopApi()?.browserShell?.setModalOcclusion?.({ active });
};

const GD_CONTENT_CLASS =
  "lyra-global-dialog w-[min(var(--lyra-dialog-max-w),calc(100vw-var(--lyra-space-44)))] cursor-default select-none [-webkit-user-select:none] [-webkit-user-drag:none] max-[980px]:w-[min(var(--lyra-unit-560),calc(100vw-var(--lyra-space-28)))]";
const GD_BODY_CLASS = "lyra-global-dialog-body min-w-0 grid gap-[var(--lyra-surface-gap)]";
const GD_FORM_CLASS = "lyra-global-dialog-form m-0 grid min-w-0 gap-[var(--lyra-surface-gap)]";
const GD_SOURCE_CLASS =
  "lyra-global-dialog-source grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[var(--lyra-space-10)] rounded-[var(--lyra-radius-10)] border border-[var(--lyra-stroke-hairline)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] bg-[color-mix(in_srgb,var(--lyra-app-surface-bg)_88%,var(--lyra-app-panel-bg)_12%)] px-[var(--lyra-space-10)] py-[var(--lyra-space-8)]";
const GD_SOURCE_ICON_BASE =
  "lyra-global-dialog-source-icon grid size-[var(--lyra-space-30)] place-items-center rounded-[var(--lyra-radius-8)] border border-[var(--lyra-stroke-hairline)] border-[color-mix(in_srgb,var(--lyra-app-border)_48%,transparent)] bg-[color-mix(in_srgb,var(--lyra-app-panel-bg)_82%,var(--lyra-app-surface-bg)_18%)] text-[var(--lyra-text-secondary)] text-[length:var(--lyra-text-size-caption)] font-bold uppercase tracking-[0.06em]";
const GD_SOURCE_ICON_DANGER_CLASS =
  "lyra-global-dialog-source-icon-danger text-[color-mix(in_srgb,var(--lyra-window-close-hover-bg)_80%,var(--lyra-text-primary)_20%)]";
const GD_SOURCE_META_CLASS =
  "lyra-global-dialog-source-meta grid min-w-0 gap-[var(--lyra-space-2)] [&_strong]:text-[var(--lyra-text-primary)] [&_strong]:text-[length:var(--lyra-text-size-body)] [&_strong]:font-semibold [&_small]:text-[var(--lyra-text-muted)] [&_small]:text-[length:var(--lyra-text-size-caption)]";
const GD_COPY_LIST_CLASS = "lyra-global-dialog-copy-list grid gap-[var(--lyra-space-8)]";
const GD_COPY_ITEM_CLASS =
  "lyra-global-dialog-copy-item grid grid-cols-[minmax(0,1fr)_auto] items-center gap-[var(--lyra-space-10)] rounded-[var(--lyra-radius-10)] border border-[var(--lyra-stroke-hairline)] border-[color-mix(in_srgb,var(--lyra-app-border)_46%,transparent)] bg-[color-mix(in_srgb,var(--lyra-app-panel-bg)_90%,var(--lyra-app-surface-bg)_10%)] px-[var(--lyra-space-10)] py-[var(--lyra-space-8)] max-[980px]:grid-cols-[minmax(0,1fr)]";
const GD_COPY_META_CLASS =
  "lyra-global-dialog-copy-meta grid min-w-0 gap-[var(--lyra-space-4)] [&_strong]:text-[var(--lyra-text-primary)] [&_strong]:text-[length:var(--lyra-text-size-12)] [&_strong]:font-semibold [&_code]:m-0 [&_code]:block [&_code]:font-[family-name:var(--lyra-font-mono)] [&_code]:text-[var(--lyra-text-secondary)] [&_code]:text-[length:var(--lyra-text-size-caption)] [&_code]:leading-[var(--lyra-text-line-normal)] [&_code]:whitespace-pre-wrap [&_code]:break-all";
const GD_INPUT_CLASS =
  "lyra-global-dialog-input grid gap-[var(--lyra-space-6)] [&_span]:font-medium [&_span]:text-[var(--lyra-text-secondary)] [&_span]:text-[length:var(--lyra-text-size-12)]";
const GD_ACTIONS_BASE = "lyra-global-dialog-actions grid w-full gap-[var(--lyra-space-8)]";
const GD_ACTION_CLASS =
  "lyra-global-dialog-action w-full min-h-[var(--lyra-space-32)] text-[length:var(--lyra-text-size-12)]";
const GD_ACTION_PRIMARY_CLASS =
  "lyra-global-dialog-action-primary text-[var(--lyra-app-primary-button-fg)]";
const GD_ACTION_DANGER_CLASS =
  "lyra-global-dialog-action-danger border-[color-mix(in_srgb,var(--lyra-status-error)_42%,var(--lyra-app-border))]";

export const GlobalDialogHost = ({
  state,
  onClose,
  onSelectAction
}: GlobalDialogHostProps) => {
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const copiedResetTimerRef = useRef<number | null>(null);
  const formId = useId();

  const clearCopiedResetTimer = useCallback((): void => {
    if (copiedResetTimerRef.current !== null) {
      window.clearTimeout(copiedResetTimerRef.current);
      copiedResetTimerRef.current = null;
    }
  }, []);

  const onCopyItem = useCallback((itemId: string, value: string): void => {
    void (async () => {
      const copied = await writeClipboardText(value);
      if (copied === false) {
        return;
      }

      setCopiedItemId(itemId);
      clearCopiedResetTimer();
      copiedResetTimerRef.current = window.setTimeout(() => {
        setCopiedItemId((currentId) =>
          currentId === itemId ? null : currentId
        );
        copiedResetTimerRef.current = null;
      }, COPIED_MARK_DURATION_MS);
    })();
  }, [clearCopiedResetTimer]);

  useEffect(() => {
    if (state.isOpen === false) {
      setWorkbenchModalOcclusion(false);
      return;
    }
    setWorkbenchModalOcclusion(true);
    return () => {
      setWorkbenchModalOcclusion(false);
    };
  }, [state.isOpen]);

  useEffect(() => {
    if (state.isOpen === false) {
      setCopiedItemId(null);
      setInputValue("");
      clearCopiedResetTimer();
    }
  }, [clearCopiedResetTimer, state.isOpen]);

  useEffect(() => {
    if (state.isOpen === false) {
      return;
    }
    setInputValue(state.input?.value ?? "");
  }, [state.input?.id, state.input?.value, state.isOpen]);

  const submitActionId = state.input?.submitActionId
    ?? state.actions.find((action) => action.tone === "primary")?.id
    ?? state.actions[0]?.id;

  const onSubmit = useCallback((event: FormEvent): void => {
    event.preventDefault();
    if (state.input === undefined || submitActionId === undefined) {
      return;
    }
    onSelectAction(submitActionId, { inputValue });
  }, [inputValue, onSelectAction, state.input, submitActionId]);

  useEffect(
    () => () => {
      clearCopiedResetTimer();
    },
    [clearCopiedResetTimer]
  );

  const actionsClassName = [
    GD_ACTIONS_BASE,
    toActionLayoutClassName(state.actions.length)
  ].join(" ");
  const sourceIconLabel = resolveSourceIconLabel(state.source);
  const sourceIconTone = state.source?.iconTone ?? "default";
  const sourceIconClassName = [
    GD_SOURCE_ICON_BASE,
    sourceIconTone === "danger" ? GD_SOURCE_ICON_DANGER_CLASS : ""
  ].join(" ");

  const footer = state.actions.length > 0 ? (
    <footer className={actionsClassName}>
      {state.actions.map((action) => {
        const isSubmitAction =
          state.input !== undefined && action.id === submitActionId;

        return (
          <AppButton
            key={action.id}
            form={isSubmitAction ? formId : undefined}
            type={isSubmitAction ? "submit" : "button"}
            size="sm"
            variant={
              action.tone === "primary"
                ? "default"
                : action.tone === "danger"
                  ? "destructive"
                  : "secondary"
            }
            className={[
              GD_ACTION_CLASS,
              action.tone === "primary"
                ? GD_ACTION_PRIMARY_CLASS
                : "",
              action.tone === "danger"
                ? GD_ACTION_DANGER_CLASS
                : ""
            ]
              .filter((value) => value.length > 0)
              .join(" ")}
            disabled={action.disabled}
            onClick={isSubmitAction ? undefined : () => {
              onSelectAction(action.id, { inputValue });
            }}
          >
            {action.label}
          </AppButton>
        );
      })}
    </footer>
  ) : undefined;

  return (
    <AppDialog
      open={state.isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      title={state.title}
      description={state.description}
      contentClassName={GD_CONTENT_CLASS}
      bodyClassName={GD_BODY_CLASS}
      footer={footer}
    >
      <form
        id={formId}
        className={GD_FORM_CLASS}
        onSubmit={onSubmit}
        onDragStart={(event) => {
          event.preventDefault();
        }}
      >
        {state.source !== undefined ? (
          <section
            className={GD_SOURCE_CLASS}
            aria-label="global-dialog-source"
          >
            <span className={sourceIconClassName} aria-hidden="true">
              {sourceIconLabel}
            </span>
            <div className={GD_SOURCE_META_CLASS}>
              <strong>{state.source.title}</strong>
              {state.source.subtitle !== undefined ? (
                <small>{state.source.subtitle}</small>
              ) : null}
            </div>
          </section>
        ) : null}

        {state.input !== undefined ? (
          <label
            className={GD_INPUT_CLASS}
            htmlFor={`global-dialog-${state.input.id}`}
          >
            <span>{state.input.label}</span>
            <AppInput
              id={`global-dialog-${state.input.id}`}
              autoFocus
              type={state.input.type ?? "text"}
              value={inputValue}
              placeholder={state.input.placeholder}
              onChange={(event) => {
                setInputValue(event.currentTarget.value);
              }}
            />
          </label>
        ) : null}

        {state.copyItems.length > 0 ? (
          <section
            className={GD_COPY_LIST_CLASS}
            aria-label="global-dialog-copy-list"
          >
            {state.copyItems.map((item) => {
              const isCopied = copiedItemId === item.id;
              const copyLabel = isCopied
                ? state.copiedActionLabel
                : state.copyActionLabel;
              const copyClassName = isCopied
                ? "lyra-global-dialog-copy-action lyra-global-dialog-copy-action-copied"
                : "lyra-global-dialog-copy-action";

              return (
                <article
                  key={item.id}
                  className={GD_COPY_ITEM_CLASS}
                  aria-label={`global-dialog-copy-item-${item.id}`}
                >
                  <div className={GD_COPY_META_CLASS}>
                    <strong>{item.label}</strong>
                    <code>{item.value}</code>
                  </div>
                  <AppIconButton
                    className={copyClassName}
                    active={isCopied}
                    aria-label={`${copyLabel} ${item.label}`}
                    title={`${copyLabel}: ${item.label}`}
                    onClick={() => {
                      onCopyItem(item.id, item.value);
                    }}
                  >
                    {isCopied ? (
                      <Check size={14} aria-hidden="true" />
                    ) : (
                      <Copy size={14} aria-hidden="true" />
                    )}
                  </AppIconButton>
                </article>
              );
            })}
          </section>
        ) : null}
      </form>
    </AppDialog>
  );
};
