import type { ReactNode } from "react";

import { BROWSER_CHROME_SURFACE_CLASS } from "./classes";

type BrowserChromeSurfaceProps = {
  readonly toolbar: ReactNode;
  readonly tabStrip: ReactNode;
};

export const BrowserChromeSurface = ({
  toolbar,
  tabStrip
}: BrowserChromeSurfaceProps) => (
  <div className={BROWSER_CHROME_SURFACE_CLASS}>
    {toolbar}
    {tabStrip}
  </div>
);
