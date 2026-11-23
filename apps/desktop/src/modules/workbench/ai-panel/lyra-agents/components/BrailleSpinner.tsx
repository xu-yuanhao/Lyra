import { useEffect, useState } from "react";

import { BRAILLE_SPINNER_CLASS } from "../features/chat/classes";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

/**
 * A tiny braille-character lyra-agents-spinner that cycles through frames.
 */
export function BrailleSpinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setFrame((f) => (f + 1) % FRAMES.length);
    }, 100);
    return () => window.clearInterval(iv);
  }, []);

  return <span className={BRAILLE_SPINNER_CLASS}>{FRAMES[frame]}</span>;
}
