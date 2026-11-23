import { useMemo } from "react";
import { useContextUsage } from "../../hooks/use-context-usage";
import { RING_CIRCUMFERENCE, RING_RADIUS, ringColorClass, ringDashOffset } from "./context-ring-logic";
import {
  CONTEXT_RING_CLASS,
  CONTEXT_RING_FILL_CLASS,
  CONTEXT_RING_TONE_CLASS,
  CONTEXT_RING_TRACK_CLASS
} from "./classes";

export const ContextRing = (): React.ReactElement | null => {
  const { rate, status } = useContextUsage();

  const dashOffset = useMemo(
    () => ringDashOffset(rate),
    [rate]
  );

  const cls = ringColorClass(rate, status);

  return (
    <div
      className={`${CONTEXT_RING_CLASS} ${cls} ${CONTEXT_RING_TONE_CLASS[cls] ?? ""}`}
      role="img"
      aria-label={`Context usage ${Math.round(rate * 100)}%`}
      title={`Context ${Math.round(rate * 100)}%`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16">
        <circle
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="1.5"
          className={CONTEXT_RING_TRACK_CLASS}
        />
        <circle
          cx="8"
          cy="8"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="1.5"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          className={CONTEXT_RING_FILL_CLASS}
          transform="rotate(-90 8 8)"
          style={{ transition: "stroke-dashoffset 400ms ease" }}
        />
      </svg>
    </div>
  );
};