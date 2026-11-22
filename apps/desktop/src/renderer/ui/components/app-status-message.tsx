import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../utils";

export type AppStatusMessageTone = "neutral" | "success" | "warning" | "error" | "info";

export type AppStatusMessageProps = HTMLAttributes<HTMLParagraphElement> & {
  readonly icon?: ReactNode;
  readonly tone?: AppStatusMessageTone;
};

const TONE_CLASS: Record<AppStatusMessageTone, string> = {
  neutral: "text-[var(--lyra-text-secondary)]",
  success: "text-[var(--lyra-status-success)]",
  warning: "text-[var(--lyra-status-warning)]",
  error: "text-[var(--lyra-status-error)]",
  info: "text-[var(--lyra-text-secondary)]"
};

export const AppStatusMessage = forwardRef<HTMLParagraphElement, AppStatusMessageProps>(({
  children,
  className,
  icon,
  tone = "neutral",
  ...props
}, ref) => (
  <p
    ref={ref}
    className={cn(
      "lyra-app-status-message",
      `lyra-app-status-message-${tone}`,
      "m-0 flex min-w-0 items-start gap-[var(--lyra-space-8)] text-[length:var(--lyra-text-size-body)] leading-[var(--lyra-text-line-body)]",
      TONE_CLASS[tone],
      className
    )}
    {...props}
  >
    {icon === undefined ? null : (
      <span
        className="lyra-app-status-message-icon mt-[var(--lyra-space-2)] inline-flex size-[var(--lyra-icon-size-16)] flex-none items-center justify-center text-current [&_svg]:size-[var(--lyra-icon-size-14)]"
        aria-hidden="true"
      >
        {icon}
      </span>
    )}
    <span className="lyra-app-status-message-content min-w-0">{children}</span>
  </p>
));

AppStatusMessage.displayName = "AppStatusMessage";
