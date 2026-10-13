import { useEffect, useRef, useState } from "react";

import type { LyraDesktopApi } from "../../../shared/desktop-bridge";

import { renderOfficeFile } from "@lyra/office-render";

type OfficeViewerStatus = "loading" | "ready" | "error";
type OfficeHandle = { readonly destroy: () => void };

export const OfficeViewerSurface = ({
  desktopApi,
  filePath,
  title
}: {
  readonly desktopApi: LyraDesktopApi | null;
  readonly filePath: string;
  readonly title: string;
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<OfficeViewerStatus>("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    const office = desktopApi?.office;
    if (host === null || office === undefined) {
      setStatus("error");
      setMessage(office === undefined ? "Office preview is unavailable." : null);
      return undefined;
    }
    let cancelled = false;
    let teardown: (() => void) | undefined;
    setStatus("loading");
    setMessage(null);
    setDetail(null);
    host.replaceChildren();
    host.style.overflow = "hidden";
    host.style.padding = "0";
    void (async () => {
      let handle: OfficeHandle | undefined;
      try {
        const preview = await office.preview({ path: filePath });
        if (cancelled) return;
        handle = await renderOfficeFile(host, preview, () => cancelled, (next) => {
          if (!cancelled) setDetail(next);
        }) ?? undefined;
        if (handle === undefined || cancelled) {
          handle?.destroy();
          return;
        }
        teardown = () => handle?.destroy();
        setStatus("ready");
      } catch (error) {
        handle?.destroy();
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
      teardown?.();
      host.replaceChildren();
    };
  }, [desktopApi, filePath]);

  return (
    <section
      className="lyra-app-module"
      data-lyra-component="lyra.office"
      aria-label="office-viewer-surface"
      style={{
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        minHeight: "0",
        height: "100%",
        background: "var(--lyra-app-panel-bg)",
        color: "var(--lyra-text-primary)"
      }}
    >
      <header className="lyra-app-module-toolbar">
        <strong>{title}</strong>
      </header>
      <div
        ref={hostRef}
        style={{ minHeight: "0", height: "100%", overflow: "hidden", padding: "0" }}
      />
      <footer className="lyra-app-module-footer">
        <span>
          {status === "error"
            ? message
            : status === "loading"
              ? "Opening…"
              : detail}
        </span>
      </footer>
    </section>
  );
};
