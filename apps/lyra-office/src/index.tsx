import { renderOfficeFile, type OfficePreviewSource } from "@lyra/office-render";
import { useEffect, useRef, useState } from "react";

import {
  createFirstPartyAppModule,
  LyraAppState,
  type FirstPartySurfaceProps
} from "@lyra/first-party-app-kit";

const PREVIEW = "lyra.core.office.preview";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const OfficeSurface = ({
  host,
  instanceId
}: FirstPartySurfaceProps) => {
  const [title, setTitle] = useState("Office");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let handle: { destroy: () => void } | null = null;
    const element = hostRef.current;
    if (element === null) return;
    element.replaceChildren();
    setStatus("loading");
    setMessage(null);
    void (async () => {
      try {
        const result = await host.executeCommand(PREVIEW, { instanceId });
        if (!isRecord(result) || typeof result.sourceUrl !== "string" || typeof result.byteLength !== "number" || !["pdf", "docx", "xlsx", "pptx"].includes(String(result.format))) {
          throw new Error("Office preview returned no file.");
        }
        const nextTitle = typeof result.title === "string" && result.title.length > 0 ? result.title : "Office";
        if (cancelled) return;
        setTitle(nextTitle);
        handle = await renderOfficeFile(element, result as unknown as OfficePreviewSource, () => cancelled, () => {});
        if (!cancelled && handle !== null) setStatus("ready");
      } catch (error) {
        if (!cancelled) {
          setStatus("error");
          setMessage(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
      handle?.destroy();
      element.replaceChildren();
    };
  }, [host, instanceId]);

  return (
    <section
      className="lyra-app-module"
      data-lyra-component="lyra.office"
      aria-label="office-viewer-surface"
      style={{
        display: "grid",
        gridTemplateRows: "auto minmax(0, 1fr) auto",
        minHeight: 0,
        height: "100%",
        background: "var(--lyra-app-panel-bg)",
        color: "var(--lyra-text-primary)"
      }}
    >
      <header className="lyra-app-module-toolbar">
        <strong>{title}</strong>
      </header>
      <div ref={hostRef} style={{ minHeight: 0, height: "100%" }} />
      {status !== "ready" && <LyraAppState kind={status === "error" ? "error" : "loading"} title={message ?? "Opening…"} />}
    </section>
  );
};

export const lyraAppModule = createFirstPartyAppModule({
  componentId: "lyra.office",
  version: __LYRA_APP_VERSION__,
  surfaces: {
    "office-viewer": {
      title: "Office",
      description: "Preview pdf, docx, xlsx, and pptx.",
      component: OfficeSurface
    }
  }
});

export default lyraAppModule;
