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
      <div className="lyra-app-dialog-header">
        <div className="lyra-app-dialog-copy">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription
            className={description === undefined ? "lyra-app-dialog-description-hidden" : undefined}
          >
            {description ?? "Dialog"}
          </DialogDescription>
        </div>
        <div className="lyra-app-dialog-header-actions">
          {headerActions}
          <DialogClose asChild>
            <AppIconButton aria-label={closeLabel} title={closeLabel} className="lyra-app-dialog-close">
              <X aria-hidden="true" size={14} />
            </AppIconButton>
          </DialogClose>
        </div>
      </div>
      {children === undefined ? null : (
        <div className={cn("lyra-app-dialog-body", bodyClassName)}>
          {children}
        </div>
      )}
      {footer === undefined ? null : (
        <div className="lyra-app-dialog-footer">
          {footer}
        </div>
      )}
    </DialogContent>
  </Dialog>
);
