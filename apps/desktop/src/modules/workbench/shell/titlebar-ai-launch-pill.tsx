import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppButton } from "@renderer/ui/components";
import { LyraBrandLogo } from "../brand";

const LAUNCH_CLASS =
  "lyra-titlebar-ai-launch relative inline-flex cursor-pointer items-center gap-[var(--lyra-space-8)] isolate border-0 bg-transparent py-0 text-[var(--lyra-text-secondary)] select-none transition-colors duration-[var(--lyra-transition-fast)] [app-region:no-drag] [-webkit-app-region:no-drag] [&.lyra-ui-button]:h-[var(--lyra-control-h-compact)] [&.lyra-ui-button]:min-h-0 [&.lyra-ui-button]:w-auto [&.lyra-ui-button]:gap-[var(--lyra-space-8)] [&.lyra-ui-button]:rounded-[var(--lyra-radius-pill)] [&.lyra-ui-button]:bg-transparent [&.lyra-ui-button]:px-[var(--lyra-space-12)] [&.lyra-ui-button]:py-0 [&.lyra-ui-button]:text-[length:var(--lyra-text-size-12)] [&.lyra-ui-button]:leading-[var(--lyra-text-line-18)] [&.lyra-ui-button]:text-[var(--lyra-text-secondary)] hover:text-[var(--lyra-text-primary)] focus-visible:outline-[var(--lyra-stroke-thin)_solid_color-mix(in_srgb,var(--lyra-app-focus)_68%,transparent)] focus-visible:outline-offset-[var(--lyra-space-2)] [&.lyra-ui-button]:focus-visible:ring-0 [&.lyra-ui-button]:focus-visible:shadow-none";

const LAUNCH_OPEN_CLASS = "lyra-titlebar-ai-launch-open text-[var(--lyra-text-primary)]";

const LAUNCH_LOGO_CLASS =
  "lyra-titlebar-ai-launch-logo size-[var(--lyra-icon-size-14)] shrink-0 text-inherit";

const LAUNCH_TEXT_CLASS =
  "lyra-titlebar-ai-launch-text inline-flex items-baseline gap-[var(--lyra-space-6)] whitespace-nowrap";

const LAUNCH_PREFIX_CLASS =
  "lyra-titlebar-ai-launch-prefix font-medium tracking-[0.01em] text-inherit";

const LAUNCH_ROTATOR_CLASS =
  "lyra-titlebar-ai-launch-rotator relative inline-block overflow-hidden text-inherit leading-[var(--lyra-text-line-18)] align-baseline";

const LAUNCH_SIZER_CLASS =
  "lyra-titlebar-ai-launch-sizer invisible inline-block whitespace-nowrap text-inherit pointer-events-none";

const LAUNCH_WORD_CLASS =
  "lyra-titlebar-ai-launch-word absolute top-0 left-0 inline-flex items-baseline whitespace-nowrap text-inherit motion-reduce:transition-[opacity_var(--lyra-transition-fast)] data-[phase=exit]:motion-reduce:opacity-0 data-[phase=enter]:motion-reduce:opacity-1";

const LAUNCH_CHAR_CLASS =
  "lyra-titlebar-ai-launch-char inline-block translate-y-0 opacity-100 blur-0 text-inherit motion-reduce:[animation:none] [.lyra-titlebar-ai-launch-word[data-phase=exit]_&]:[animation-name:lyra-pill-char-exit] [.lyra-titlebar-ai-launch-word[data-phase=exit]_&]:[animation-timing-function:var(--lyra-ease-fast)] [.lyra-titlebar-ai-launch-word[data-phase=exit]_&]:[animation-fill-mode:forwards] [.lyra-titlebar-ai-launch-word[data-phase=enter]_&]:[animation-name:lyra-pill-char-enter] [.lyra-titlebar-ai-launch-word[data-phase=enter]_&]:[animation-timing-function:var(--lyra-ease-tick)] [.lyra-titlebar-ai-launch-word[data-phase=enter]_&]:[animation-fill-mode:backwards]";

type PillPhase = "idle" | "exit" | "enter";

export type TitlebarAiLaunchPillProps = {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
  readonly logoUrl: string;
  readonly prefix: string;
  readonly verbs: readonly string[];
  readonly ariaLabel: string;
  readonly exitDurationMs?: number;
  readonly enterDurationMs?: number;
};

const DEFAULT_EXIT_MS = 280;
const DEFAULT_ENTER_MS = 360;
const LOGO_SPIN_DURATION_MS = 640;

const prefersReducedMotion = (): boolean => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

const splitGraphemes = (input: string): readonly string[] => {
  if (input.length === 0) {
    return [];
  }
  const IntlAny = Intl as typeof Intl & {
    Segmenter?: new (locale?: string, options?: { granularity?: "grapheme" | "word" | "sentence" }) => {
      segment(text: string): Iterable<{ segment: string }>;
    };
  };
  if (typeof IntlAny.Segmenter === "function") {
    try {
      const segmenter = new IntlAny.Segmenter(undefined, { granularity: "grapheme" });
      return Array.from(segmenter.segment(input), (chunk) => chunk.segment);
    } catch (_error) {
      /* fall back to array spread */
    }
  }
  return Array.from(input);
};

const computeCharDelayMs = (totalChars: number, exitOrEnterMs: number): number => {
  if (totalChars <= 1) {
    return 0;
  }
  const maxPerChar = 32;
  const available = exitOrEnterMs * 0.55;
  const ideal = available / totalChars;
  return Math.max(6, Math.min(maxPerChar, ideal));
};

export const TitlebarAiLaunchPill = ({
  isOpen,
  onToggle,
  logoUrl,
  prefix,
  verbs,
  ariaLabel,
  exitDurationMs = DEFAULT_EXIT_MS,
  enterDurationMs = DEFAULT_ENTER_MS,
}: TitlebarAiLaunchPillProps) => {
  const safeVerbs = useMemo(
    () => (verbs.length > 0 ? verbs : [""]),
    [verbs]
  );
  const shortestSizerVerb = useMemo<string>(() => {
    let anchor = safeVerbs[0] ?? "";
    let anchorLength = splitGraphemes(anchor).length;
    for (let index = 1; index < safeVerbs.length; index += 1) {
      const candidate = safeVerbs[index] ?? "";
      const candidateLength = splitGraphemes(candidate).length;
      if (candidateLength < anchorLength) {
        anchor = candidate;
        anchorLength = candidateLength;
      }
    }
    return anchor;
  }, [safeVerbs]);
  const [verbIndex, setVerbIndex] = useState(0);
  const [phase, setPhase] = useState<PillPhase>("idle");
  const [isLogoSpinning, setIsLogoSpinning] = useState(false);
  const reducedMotionRef = useRef<boolean>(prefersReducedMotion());
  const pendingTimeouts = useRef<number[]>([]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => {
      reducedMotionRef.current = query.matches;
    };
    update();
    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", update);
      return () => {
        query.removeEventListener("change", update);
      };
    }
    query.addListener(update);
    return () => {
      query.removeListener(update);
    };
  }, []);

  const clearPendingTimeouts = useCallback((): void => {
    for (const timeoutId of pendingTimeouts.current) {
      window.clearTimeout(timeoutId);
    }
    pendingTimeouts.current = [];
  }, []);

  const scheduleTimeout = useCallback((callback: () => void, delayMs: number): void => {
    const timeoutId = window.setTimeout(() => {
      pendingTimeouts.current = pendingTimeouts.current.filter((id) => id !== timeoutId);
      callback();
    }, delayMs);
    pendingTimeouts.current.push(timeoutId);
  }, []);

  useEffect(() => clearPendingTimeouts, [clearPendingTimeouts]);

  const playHoverMotion = useCallback((): void => {
    if (phase !== "idle") {
      return;
    }
    if (reducedMotionRef.current) {
      if (safeVerbs.length > 1) {
        setVerbIndex((current) => (current + 1) % safeVerbs.length);
      }
      return;
    }

    setIsLogoSpinning(true);
    scheduleTimeout(() => setIsLogoSpinning(false), LOGO_SPIN_DURATION_MS);
    if (safeVerbs.length <= 1) {
      return;
    }

    setPhase("exit");
    scheduleTimeout(() => {
      const nextIndex = (verbIndex + 1) % safeVerbs.length;
      const nextCharCount = splitGraphemes(safeVerbs[nextIndex] ?? "").length;
      const nextCharDelay = computeCharDelayMs(nextCharCount, enterDurationMs);
      setVerbIndex(nextIndex);
      setPhase("enter");
      scheduleTimeout(
        () => setPhase("idle"),
        Math.max(0, enterDurationMs) + Math.max(0, nextCharCount - 1) * nextCharDelay
      );
    }, Math.max(0, exitDurationMs));
  }, [enterDurationMs, exitDurationMs, phase, safeVerbs, scheduleTimeout, verbIndex]);

  const activeVerb = safeVerbs[verbIndex] ?? "";
  const chars = useMemo(() => splitGraphemes(activeVerb), [activeVerb]);
  const animationDuration =
    phase === "exit" ? exitDurationMs : phase === "enter" ? enterDurationMs : 0;
  const charDelayMs = computeCharDelayMs(chars.length, animationDuration);

  const rootClassName = isOpen
    ? `${LAUNCH_CLASS} ${LAUNCH_OPEN_CLASS}`
    : LAUNCH_CLASS;

  return (
    <AppButton
      variant="ghost"
      size="sm"
      className={rootClassName}
      aria-label={ariaLabel}
      aria-pressed={isOpen}
      title={ariaLabel}
      onClick={onToggle}
      onMouseEnter={playHoverMotion}
      data-phase={phase}
    >
      <LyraBrandLogo
        logoUrl={logoUrl}
        className={LAUNCH_LOGO_CLASS}
        motion={isLogoSpinning ? "active" : "none"}
        spinDurationMs={LOGO_SPIN_DURATION_MS}
      />
      <span className={LAUNCH_TEXT_CLASS}>
        <span className={LAUNCH_PREFIX_CLASS}>{prefix}</span>
        <span className={LAUNCH_ROTATOR_CLASS}>
          <span
            className={LAUNCH_SIZER_CLASS}
            aria-hidden="true"
          >
            {shortestSizerVerb}
          </span>
          <span
            key={String(verbIndex) + ":" + phase}
            className={LAUNCH_WORD_CLASS}
            data-phase={phase}
          >
            {chars.length === 0 ? (
              <span className={LAUNCH_CHAR_CLASS} aria-hidden="true">
                &nbsp;
              </span>
            ) : (
              chars.map((char, index) => (
                <span
                  key={String(index) + ":" + char}
                  className={LAUNCH_CHAR_CLASS}
                  style={{
                    animationDelay: String(index * charDelayMs) + "ms",
                    animationDuration: String(animationDuration) + "ms",
                  }}
                >
                  {char === " " ? "\u00a0" : char}
                </span>
              ))
            )}
          </span>
        </span>
      </span>
    </AppButton>
  );
};
