import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type OverflowMarqueeTextProps = {
  readonly text: string;
  readonly active: boolean;
  readonly className?: string;
};

const resolveDurationSeconds = (offsetPx: number): number => {
  if (offsetPx <= 0) {
    return 0;
  }

  return Math.min(16, Math.max(4, offsetPx / 28 + 2));
};

export const OverflowMarqueeText = ({
  text,
  active,
  className
}: OverflowMarqueeTextProps) => {
  const hostRef = useRef<HTMLSpanElement | null>(null);
  const trackRef = useRef<HTMLSpanElement | null>(null);
  const [overflowOffset, setOverflowOffset] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    const track = trackRef.current;
    if (host === null || track === null) {
      return;
    }

    const syncOverflowOffset = () => {
      const nextOffset = Math.max(0, Math.ceil(track.scrollWidth - host.clientWidth));
      setOverflowOffset(nextOffset);
    };

    syncOverflowOffset();

    const resizeObserver = new ResizeObserver(syncOverflowOffset);
    resizeObserver.observe(host);
    resizeObserver.observe(track);
    return () => {
      resizeObserver.disconnect();
    };
  }, [text]);

  const shouldAnimate = active && overflowOffset > 0;
  const classNames = useMemo(
    () =>
      [
        "lyra-overflow-marquee min-w-0 block w-full overflow-hidden whitespace-nowrap",
        shouldAnimate
          ? "lyra-overflow-marquee-active data-[overflow=true]:animate-[lyra-overflow-marquee_var(--lyra-marquee-duration,6s)_linear_infinite]"
          : "",
        className ?? ""
      ]
        .filter((value) => value.length > 0)
        .join(" "),
    [className, shouldAnimate]
  );
  const style = useMemo(
    () =>
      ({
        "--lyra-marquee-offset": `${overflowOffset}px`,
        "--lyra-marquee-duration": `${resolveDurationSeconds(overflowOffset)}s`
      }) as CSSProperties,
    [overflowOffset]
  );

  return (
    <span
      ref={hostRef}
      className={classNames}
      data-overflow={overflowOffset > 0 ? "true" : "false"}
      style={style}
      title={text}
    >
      <span ref={trackRef} className="lyra-overflow-marquee-track inline-block min-w-0 translate-x-0 will-change-transform">
        {text}
      </span>
    </span>
  );
};

