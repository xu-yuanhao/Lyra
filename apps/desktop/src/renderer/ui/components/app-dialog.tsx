import { X } from "@lyra/icons";
import { type ComponentProps, type ReactNode } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger
} from "./dialog";
import { cn } from "../utils";
import { AppIconButton } from "./app-icon-button";

export type AppDialogProps = Omit<ComponentProps<typeof Dialog>, "children"> & {
  readonly bodyClassName?: string;
  readonly children?: ReactNode;
  readonly closeLabel?: string;
  readonly contentClassName?: string;
  readonly description?: ReactNode;
  readonly footer?: ReactNode;
  readonly headerActions?: ReactNode;
  readonly title: ReactNode;
};

const DIALOG_HEADER_CLASS =
  "lyra-app-dialog-header grid min-h-[var(--lyra-control-h-52)] min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-[var(--lyra-space-12)] px-[var(--lyra-space-16)] pt-[var(--lyra-space-16)] pb-[var(--lyra-space-12)]";

const DIALOG_COPY_CLASS = "lyra-app-dialog-copy grid min-w-0 gap-[var(--lyra-space-4)]";

const DIALOG_DESCRIPTION_HIDDEN_CLASS =
  "lyra-app-dialog-description-hidden absolute -m-[var(--lyra-stroke-thin)] h-[var(--lyra-stroke-thin)] w-[var(--lyra-stroke-thin)] overflow-hidden border-0 whitespace-nowrap [clip:rect(0_0_0_0)]";

const DIALOG_HEADER_ACTIONS_CLASS =
  "lyra-app-dialog-header-actions inline-flex min-w-0 items-center justify-end gap-[var(--lyra-space-6)]";

const DIALOG_BODY_CLASS =
  "lyra-app-dialog-body min-h-0 min-w-0 overflow-auto px-[var(--lyra-space-16)] pb-[var(--lyra-space-16)] text-[var(--lyra-text-primary)]";

const DIALOG_FOOTER_CLASS =
  "lyra-app-dialog-footer relative flex min-w-0 items-center justify-end gap-[var(--lyra-space-8)] px-[var(--lyra-space-16)] pt-[var(--lyra-space-12)] pb-[var(--lyra-space-16)] text-[var(--lyra-text-primary)] before:pointer-events-none before:absolute before:top-0 before:right-[var(--lyra-space-16)] before:left-[var(--lyra-space-16)] before:h-[var(--lyra-stroke-thin)] before:bg-[color-mix(in_srgb,var(--lyra-app-border)_72%,transparent)]";

const DIALOG_CLOSE_CLASS =
  "lyra-app-dialog-close size-[var(--lyra-control-h-compact)] hover:not-disabled:bg-transparent hover:not-disabled:text-[var(--lyra-status-error)]";

export type AppDialogTriggerProps = ComponentProps<typeof DialogTrigger>;

export const AppDialogTrigger = DialogTrigger;

export const AppDialog = ({
  bodyClassName,
  children,
  closeLabel = "Close dialog",
  contentClassName,
  description,
  footer,
  headerActions,
  title,
  ...dialogProps
}: AppDialogProps) => (
  <Dialog {...dialogProps}>
    <DialogContent
      className={cn("lyra-app-dialog", contentClassName)}
    >
      <div className={DIALOG_HEADER_CLASS}>
        <div className={DIALOG_COPY_CLASS}>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription
            className={description === undefined ? DIALOG_DESCRIPTION_HIDDEN_CLASS : undefined}
          >
            {description ?? "Dialog"}
          </DialogDescription>
        </div>
        <div className={DIALOG_HEADER_ACTIONS_CLASS}>
          {headerActions}
          <DialogClose asChild>
            <AppIconButton aria-label={closeLabel} title={closeLabel} className={DIALOG_CLOSE_CLASS}>
              <X aria-hidden="true" size={14} />
            </AppIconButton>
          </DialogClose>
        </div>
      </div>
      {children === undefined ? null : (
        <div className={cn(DIALOG_BODY_CLASS, bodyClassName)}>
          {children}
        </div>
      )}
      {footer === undefined ? null : (
        <div className={DIALOG_FOOTER_CLASS}>
          {footer}
        </div>
      )}
    </DialogContent>
  </Dialog>
);
