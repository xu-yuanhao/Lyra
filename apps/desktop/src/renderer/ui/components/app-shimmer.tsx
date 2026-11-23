import {
  useEffect,
  useRef,
  useState,
  type CSSProperties
} from "react";

import { cn } from "../utils";

export type AppShimmerProps = {
  /** Plain text to render. Kept as a string so the sweep overlay can mirror it. */
  readonly text: string;
  /** Sweep overlay fades in while active; the base text keeps its own color. */
  readonly active?: boolean;
  /** Staggers parallel shimmers, like opencode's offset. */
  readonly offset?: number;
  readonly className?: string;
  readonly as?: "span" | "div" | "p";
};

const SWAP_MS = 220;

const SHIMMER_SUPPORTS_VARIANT =
  "supports-[(-webkit-background-clip:text)_or_(background-clip:text)]";

const SHIMMER_CLASS =
  "lyra-ui-shimmer [--lyra-shimmer-step:45ms] [--lyra-shimmer-duration:1.2s] [--lyra-shimmer-swap:220ms] [--lyra-shimmer-index:0] inline-grid font-[inherit] tracking-[inherit] leading-[inherit] select-none after:pointer-events-none after:grid-area-[1/1] after:min-w-0 after:whitespace-[inherit] after:text-[var(--lyra-text-muted)] after:opacity-0 after:transition-[opacity_var(--lyra-shimmer-swap)_var(--lyra-ease-fast)] after:content-[attr(data-text)] data-[active=true]:after:opacity-100 data-[run=true]:after:animate-[lyra-ui-shimmer-sweep_var(--lyra-shimmer-duration)_linear_infinite_both] data-[run=true]:after:[animation-delay:calc(var(--lyra-shimmer-step)*var(--lyra-shimmer-index)*-1)] data-[run=true]:after:[will-change:background-position] " +
  `${SHIMMER_SUPPORTS_VARIANT}:after:text-transparent ${SHIMMER_SUPPORTS_VARIANT}:after:[-webkit-text-fill-color:transparent] ${SHIMMER_SUPPORTS_VARIANT}:after:[background-image:linear-gradient(90deg,transparent_40%,var(--lyra-text-primary)_50%,transparent_60%),linear-gradient(var(--lyra-text-muted),var(--lyra-text-muted))] ${SHIMMER_SUPPORTS_VARIANT}:after:[background-size:300%_100%,100%_100%] ${SHIMMER_SUPPORTS_VARIANT}:after:[background-position:100%_0,0_0] ${SHIMMER_SUPPORTS_VARIANT}:after:bg-no-repeat ${SHIMMER_SUPPORTS_VARIANT}:after:[-webkit-background-clip:text] ${SHIMMER_SUPPORTS_VARIANT}:after:[background-clip:text] ${SHIMMER_SUPPORTS_VARIANT}:data-[active=true]:[&_.lyra-ui-shimmer-base]:opacity-0 ` +
  "motion-reduce:after:transition-none motion-reduce:after:animate-none motion-reduce:after:[content:none] motion-reduce:[&_.lyra-ui-shimmer-base]:opacity-100!";

const SHIMMER_BASE_CLASS =
  "lyra-ui-shimmer-base grid-area-[1/1] min-w-0 text-inherit whitespace-[inherit] opacity-100 transition-[opacity_var(--lyra-shimmer-swap)_var(--lyra-ease-fast)] motion-reduce:transition-none";

export const AppShimmer = ({
  text,
  active = true,
  offset = 0,
  className,
  as: Tag = "span"
}: AppShimmerProps) => {
  const [run, setRun] = useState(active);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (active) {
      setRun(true);
      return;
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setRun(false);
    }, SWAP_MS);
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [active]);

  useEffect(() => () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
  }, []);

  return (
    <Tag
      className={cn(SHIMMER_CLASS, Tag !== "span" && "grid", className)}
      data-active={active ? "true" : "false"}
      data-run={run ? "true" : "false"}
      data-text={text}
      aria-label={text}
      style={{ "--lyra-shimmer-index": String(offset) } as CSSProperties}
    >
      <span className={SHIMMER_BASE_CLASS} aria-hidden="true">
        {text}
      </span>
    </Tag>
  );
};
