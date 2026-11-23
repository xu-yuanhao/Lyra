import { type CSSProperties, type HTMLAttributes } from "react";

import lyraMark from "../../assets/brand/lyra-mark.svg";

export type LyraLogoProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  readonly alt?: string;
};

const LOGO_MARK_CLASS =
  "lyra-app-logo-mark inline-block size-[var(--lyra-app-logo-size,var(--lyra-icon-size-16))] flex-none bg-current [mask-image:var(--lyra-app-logo-url)] [mask-position:center] [mask-repeat:no-repeat] [mask-size:contain] [-webkit-mask-image:var(--lyra-app-logo-url)] [-webkit-mask-position:center] [-webkit-mask-repeat:no-repeat] [-webkit-mask-size:contain]";

const LOGO_STYLE = {
  "--lyra-app-logo-url": `url("${lyraMark}")`
} as CSSProperties;

export const LyraLogo = ({
  alt = "Lyra",
  className,
  role,
  style,
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  ...props
}: LyraLogoProps) => {
  const decorative = alt.length === 0;

  return (
    <span
      {...props}
      aria-hidden={decorative ? true : ariaHidden}
      aria-label={decorative ? undefined : ariaLabel ?? alt}
      className={[LOGO_MARK_CLASS, className].filter(Boolean).join(" ")}
      role={decorative ? undefined : role ?? "img"}
      style={{ ...LOGO_STYLE, ...style }}
    />
  );
};
