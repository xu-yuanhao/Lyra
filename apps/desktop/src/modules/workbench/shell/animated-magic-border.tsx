import { useLayoutEffect, useRef } from "react";

const MAGIC_BORDER_TRACK_CLASS =
  "lyra-magic-border-track pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] p-[var(--lyra-stroke-thin)] [mask:linear-gradient(black,black)_content-box,linear-gradient(black,black)] [-webkit-mask:linear-gradient(black,black)_content-box,linear-gradient(black,black)] [mask-composite:exclude] [-webkit-mask-composite:xor]";

const MAGIC_BORDER_SWEEP_CLASS =
  "lyra-magic-border-sweep pointer-events-none absolute top-1/2 left-1/2 aspect-square w-[300%] [transform:translate(-50%,-50%)] bg-[conic-gradient(from_0deg,var(--lyra-pill-rainbow-red)_0%,var(--lyra-pill-rainbow-orange)_14%,var(--lyra-pill-rainbow-yellow)_28%,var(--lyra-pill-rainbow-green)_42%,var(--lyra-pill-rainbow-cyan)_57%,var(--lyra-pill-rainbow-blue)_71%,var(--lyra-pill-rainbow-violet)_85%,var(--lyra-pill-rainbow-red)_100%)] [will-change:transform,mask-image]";

const MAGIC_BORDER_SWEEP_OPEN_STATIC_CLASS =
  `${MAGIC_BORDER_SWEEP_CLASS} [mask-image:none] [-webkit-mask-image:none]`;

const MAGIC_BORDER_SWEEP_CLOSED_STATIC_CLASS =
  `${MAGIC_BORDER_SWEEP_CLASS} [mask-image:conic-gradient(transparent_0deg,black_72deg,black_96deg,transparent_96deg)] [-webkit-mask-image:conic-gradient(transparent_0deg,black_72deg,black_96deg,transparent_96deg)]`;

const CLOSED_SWEEP_DEGREES = 96;
const OPEN_SWEEP_DEGREES = 360;
const OPEN_MASK_THRESHOLD_DEGREES = 356;
const MAX_FRAME_DELTA_MS = 48;

type MagicBorderMotion = {
  angleDegrees: number;
  lastFrameMs: number | null;
  speedRevolutionsPerSecond: number;
  sweepDegrees: number;
};

const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export type AnimatedMagicBorderProps = {
  readonly isOpen: boolean;
  readonly className?: string;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const approach = (current: number, target: number, deltaMs: number, responseMs: number): number => {
  const next = current + (target - current) * (1 - Math.exp(-deltaMs / responseMs));
  return Math.abs(target - next) < 0.28 ? target : next;
};

const formatDegrees = (value: number): string => `${Number(value.toFixed(2))}deg`;

const getClosedSpeed = (nowMs: number): number => {
  const longWave = Math.sin(nowMs / 820);
  const shortWave = Math.sin(nowMs / 330 + 1.35);
  const driftWave = Math.sin(nowMs / 1450 + 2.1);

  return clamp(0.17 + longWave * 0.085 + shortWave * 0.045 + driftWave * 0.035, 0.065, 0.31);
};

const getTargetSpeed = (nowMs: number, isOpen: boolean, sweepDegrees: number): number => {
  if (isOpen && sweepDegrees < OPEN_MASK_THRESHOLD_DEGREES) {
    return 0.38;
  }
  if (!isOpen && sweepDegrees > CLOSED_SWEEP_DEGREES + 1) {
    return 0.28;
  }
  if (isOpen) {
    return 0.075;
  }
  return getClosedSpeed(nowMs);
};

const getFadeDegrees = (sweepDegrees: number): number => {
  const progress = clamp(
    (sweepDegrees - CLOSED_SWEEP_DEGREES) / (OPEN_SWEEP_DEGREES - CLOSED_SWEEP_DEGREES),
    0,
    1
  );
  const fade = 72 * (1 - progress) + 14 * progress;
  return Math.min(fade, Math.max(0, sweepDegrees - 2));
};

const applySweepStyles = (
  element: HTMLDivElement,
  angleDegrees: number,
  sweepDegrees: number
): void => {
  element.style.transform = `translate(-50%, -50%) rotate(${formatDegrees(angleDegrees)})`;

  if (sweepDegrees >= OPEN_MASK_THRESHOLD_DEGREES) {
    element.style.maskImage = "none";
    element.style.webkitMaskImage = "none";
    return;
  }

  const safeSweepDegrees = clamp(sweepDegrees, 1, OPEN_MASK_THRESHOLD_DEGREES);
  const fadeDegrees = getFadeDegrees(safeSweepDegrees);
  const mask = `conic-gradient(transparent 0deg, black ${formatDegrees(fadeDegrees)}, black ${formatDegrees(safeSweepDegrees)}, transparent ${formatDegrees(safeSweepDegrees)})`;

  element.style.maskImage = mask;
  element.style.webkitMaskImage = mask;
};

export const AnimatedMagicBorder = ({ isOpen, className }: AnimatedMagicBorderProps) => {
  const sweepRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  const motionRef = useRef<MagicBorderMotion>({
    angleDegrees: 0,
    lastFrameMs: null,
    speedRevolutionsPerSecond: isOpen ? 0.075 : 0.17,
    sweepDegrees: isOpen ? OPEN_SWEEP_DEGREES : CLOSED_SWEEP_DEGREES
  });
  isOpenRef.current = isOpen;

  useLayoutEffect(() => {
    const el = sweepRef.current;
    if (el === null || prefersReducedMotion()) {
      return;
    }

    let animationFrameId: number | null = null;

    const startNextFrame = (): void => {
      animationFrameId = window.requestAnimationFrame(tick);
    };

    const tick = (now: number) => {
      const motion = motionRef.current;
      const rawDeltaMs = motion.lastFrameMs === null ? 16 : now - motion.lastFrameMs;
      const deltaMs = clamp(rawDeltaMs, 0, MAX_FRAME_DELTA_MS);
      motion.lastFrameMs = now;

      const open = isOpenRef.current;
      const targetSweepDegrees = open ? OPEN_SWEEP_DEGREES : CLOSED_SWEEP_DEGREES;
      const sweepResponseMs = open ? 310 : 430;
      motion.sweepDegrees = approach(
        motion.sweepDegrees,
        targetSweepDegrees,
        deltaMs,
        sweepResponseMs
      );

      const targetSpeed = getTargetSpeed(now, open, motion.sweepDegrees);
      motion.speedRevolutionsPerSecond = approach(
        motion.speedRevolutionsPerSecond,
        targetSpeed,
        deltaMs,
        520
      );
      motion.angleDegrees =
        (motion.angleDegrees + motion.speedRevolutionsPerSecond * 360 * (deltaMs / 1000)) % 360;

      applySweepStyles(el, motion.angleDegrees, motion.sweepDegrees);
      startNextFrame();
    };

    applySweepStyles(el, motionRef.current.angleDegrees, motionRef.current.sweepDegrees);
    startNextFrame();
    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isOpen]);

  const isReduced = prefersReducedMotion();
  const sweepClassName = isReduced
    ? isOpen
      ? MAGIC_BORDER_SWEEP_OPEN_STATIC_CLASS
      : MAGIC_BORDER_SWEEP_CLOSED_STATIC_CLASS
    : MAGIC_BORDER_SWEEP_CLASS;

  return (
    <div
      className={
        className === undefined
          ? MAGIC_BORDER_TRACK_CLASS
          : `${MAGIC_BORDER_TRACK_CLASS} ${className}`
      }
      aria-hidden="true"
    >
      <div className={sweepClassName} ref={sweepRef} />
    </div>
  );
};
