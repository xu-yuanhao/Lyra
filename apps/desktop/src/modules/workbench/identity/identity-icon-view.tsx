import { useState, type ReactNode, type SyntheticEvent } from "react";

import { cn } from "@renderer/ui/utils";
import { IDENTITY_ICON_CLASS, IDENTITY_ICON_FALLBACK_CLASS, IDENTITY_ICON_IMAGE_CLASS } from "../ai-panel/classes";

export type IdentityIconViewProps = {
  readonly iconUrl?: string | null | undefined;
  readonly label?: string | undefined;
  readonly className?: string | undefined;
  readonly imageClassName?: string | undefined;
  readonly fallback: ReactNode;
};

export const IdentityIconView = ({
  iconUrl,
  label,
  className,
  imageClassName,
  fallback
}: IdentityIconViewProps) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const normalizedUrl = iconUrl?.trim() ?? "";
  const showImage = normalizedUrl.length > 0 && normalizedUrl !== failedUrl;

  return (
    <span className={cn(IDENTITY_ICON_CLASS, className)} title={label}>
      {showImage ? (
        <img
          src={normalizedUrl}
          alt=""
          className={cn(IDENTITY_ICON_IMAGE_CLASS, imageClassName)}
          loading="eager"
          decoding="async"
          onError={(event: SyntheticEvent<HTMLImageElement>) => {
            setFailedUrl(event.currentTarget.src);
          }}
        />
      ) : (
        <span className={IDENTITY_ICON_FALLBACK_CLASS} aria-hidden="true">
          {fallback}
        </span>
      )}
    </span>
  );
};
