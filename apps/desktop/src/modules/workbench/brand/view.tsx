import { useMemo, type CSSProperties } from "react";

import type {
  LyraBrandLogoMotion,
  LyraBrandLogoProps,
  LyraBrandLogoSpinIntensity
} from "./types";

const DEFAULT_SPIN_DURATION_MS: Record<
  LyraBrandLogoMotion,
  Record<LyraBrandLogoSpinIntensity, number>
> = {
  none: {
    subtle: 0,
    steady: 0,
    expressive: 0
  },
  ambient: {
    subtle: 18000,
    steady: 14000,
    expressive: 10000
  },
  active: {
    subtle: 9000,
    steady: 6400,
    expressive: 4200
  }
};

const normalizeSpinDuration = (
  motion: LyraBrandLogoMotion,
  intensity: LyraBrandLogoSpinIntensity,
  durationMs: number | undefined
): number => {
  if (typeof durationMs === "number" && Number.isFinite(durationMs) && durationMs > 0) {
    return durationMs;
  }
  return DEFAULT_SPIN_DURATION_MS[motion][intensity];
};

const BL_BASE_CLASS =
  "lyra-brand-logo relative block size-[var(--lyra-space-16)] bg-current [-webkit-mask-image:var(--lyra-brand-logo-url)] [mask-image:var(--lyra-brand-logo-url)] [-webkit-mask-repeat:no-repeat] [mask-repeat:no-repeat] [-webkit-mask-position:center] [mask-position:center] [-webkit-mask-size:contain] [mask-size:contain]";
const BL_SPIN_CLASS =
  "lyra-brand-logo-spin origin-center animate-[lyra-brand-logo-smart-spin_var(--lyra-brand-logo-spin-duration,14000ms)_linear_infinite] [will-change:transform] motion-reduce:animate-none motion-reduce:[will-change:auto]";
const BL_SPIN_ACTIVE_CLASS =
  "lyra-brand-logo-spin-active [animation-timing-function:var(--lyra-ease-standard)]";
const BL_SPIN_SUBTLE_CLASS = "lyra-brand-logo-spin-subtle opacity-[0.92]";
const BL_SPIN_EXPRESSIVE_CLASS =
  "lyra-brand-logo-spin-expressive [animation-timing-function:var(--lyra-ease-emphasized)]";

export const LyraBrandLogo = ({
  logoUrl,
  className,
  motion = "none",
  spinDirection = "clockwise",
  spinIntensity = "steady",
  spinDurationMs
}: LyraBrandLogoProps) => {
  const isRotating = motion === "active";
  const normalizedDurationMs = normalizeSpinDuration(motion, spinIntensity, spinDurationMs);
  const style = useMemo(
    () =>
      ({
        "--lyra-brand-logo-url": `url("${logoUrl}")`,
        "--lyra-brand-logo-spin-duration": `${normalizedDurationMs}ms`,
        "--lyra-brand-logo-spin-turn": spinDirection === "clockwise" ? "1turn" : "-1turn"
      }) as CSSProperties,
    [logoUrl, normalizedDurationMs, spinDirection]
  );

  return (
    <span
      aria-hidden="true"
      className={[
        BL_BASE_CLASS,
        isRotating ? BL_SPIN_CLASS : "",
        isRotating ? BL_SPIN_ACTIVE_CLASS : "",
        isRotating && spinIntensity === "subtle" ? BL_SPIN_SUBTLE_CLASS : "",
        isRotating && spinIntensity === "expressive" ? BL_SPIN_EXPRESSIVE_CLASS : "",
        isRotating ? `lyra-brand-logo-spin-${spinIntensity}` : "",
        className
      ]
        .filter((value) => value !== undefined && value.length > 0)
        .join(" ")}
      data-motion={motion}
      data-spin-direction={spinDirection}
      data-spin-intensity={spinIntensity}
      style={style}
    />
  );
};
