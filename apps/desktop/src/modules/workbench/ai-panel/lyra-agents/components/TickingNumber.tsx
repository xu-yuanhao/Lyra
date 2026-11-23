import { useEffect, useRef, useState } from "react";
import { TICK_CLASS, TICK_CURRENT_CLASS, TICK_DOWN_CLASS, TICK_GHOST_CLASS, TICK_UP_CLASS } from "../features/chat/classes";

/**
 * Displays an integer that animates whenever the `value` prop changes.
 *
 * direction="up"   — new value slides up into place (used for additions)
 * direction="down" — new value slides down into place (used for deletions)
 *
 * During the transition the outgoing digit picks up a glow and blurs out
 * while the incoming digit sharpens from a blurred glowing state.
 */
export function TickingNumber({
  value,
  direction,
}: {
  value: number;
  direction: "up" | "down";
}) {
  const [display, setDisplay] = useState(value);
  const [ghost, setGhost] = useState<{ value: number; id: number } | null>(null);
  const ghostIdRef = useRef(0);

  useEffect(() => {
    if (value === display) return;
    ghostIdRef.current += 1;
    const id = ghostIdRef.current;
    setGhost({ value: display, id });
    setDisplay(value);
    const timeout = window.setTimeout(() => {
      setGhost((g) => (g && g.id === id ? null : g));
    }, 420);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span className={`${TICK_CLASS} ${direction === "up" ? TICK_UP_CLASS : TICK_DOWN_CLASS}`}>
      <span key={display} className={TICK_CURRENT_CLASS}>
        {display}
      </span>
      {ghost !== null && (
        <span key={`ghost-${ghost.id}`} className={TICK_GHOST_CLASS}>
          {ghost.value}
        </span>
      )}
    </span>
  );
}
