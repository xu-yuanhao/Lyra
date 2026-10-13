/// <reference path="./env.d.ts" />
export type OfficePreviewSource = {
  readonly format: "pdf" | "docx" | "xlsx" | "pptx";
  readonly sourceUrl: string;
  readonly byteLength: number;
  readonly title: string;
};

type OfficeHandle = { readonly destroy: () => void };

const countLabel = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

let pdfWorkerScript: Promise<string> | null = null;

const renderPdf = async (
  host: HTMLElement,
  sourceUrl: string,
  isCancelled: () => boolean
): Promise<{ readonly handle: OfficeHandle; readonly detail: string } | null> => {
  const pdfjs = await import("pdfjs-dist");
  // Cache only the immutable worker resource. Each preview owns its worker,
  // so closing one document cannot interrupt another document's loading task.
  pdfWorkerScript ??= (async () => {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    const response = await fetch(worker.default);
    if (!response.ok) throw new Error("PDF worker is unavailable.");
    const script = await response.arrayBuffer();
    return URL.createObjectURL(new Blob([script], { type: "text/javascript" }));
  })();
  let workerUrl: string;
  try { workerUrl = await pdfWorkerScript; }
  catch (error) { pdfWorkerScript = null; throw error; }
  // A supplied port avoids PDF.js wrapping opaque file:// origins in a worker
  // that dynamically imports a blob script. Only worker-src blob: is required.
  const port = new Worker(workerUrl, { type: "module", name: "Lyra PDF preview" });
  const worker: import("pdfjs-dist").PDFWorker = pdfjs.PDFWorker.fromPort({ port });
  const releaseWorker = (): void => { worker.destroy(); port.terminate(); };
  const task = pdfjs.getDocument({ url: sourceUrl, rangeChunkSize: 64 * 1024, worker });
  let pdfDocument: Awaited<typeof task.promise>;
  try { pdfDocument = await task.promise; }
  catch (error) { releaseWorker(); throw error; }
  const destroy = async (): Promise<void> => {
    try { await pdfDocument.destroy(); } finally { releaseWorker(); }
  };
  if (isCancelled()) { await destroy(); return null; }
  const navigation = document.createElement("nav");
  navigation.setAttribute("aria-label", "PDF pages");
  const previous = document.createElement("button");
  previous.textContent = "Previous page";
  const next = document.createElement("button");
  next.textContent = "Next page";
  const label = document.createElement("span");
  label.setAttribute("aria-live", "polite");
  navigation.append(previous, label, next);
  const canvas = document.createElement("canvas");
  canvas.style.display = "block";
  canvas.style.margin = "0 auto";
  canvas.style.maxWidth = "100%";
  host.append(navigation, canvas);
  let pageNumber = 1;
  let disposed = false;
  let busy = false;
  const paint = async (): Promise<void> => {
    busy = true; previous.disabled = true; next.disabled = true;
    try {
      const page = await pdfDocument.getPage(pageNumber);
      if (disposed || isCancelled()) return;
      const natural = page.getViewport({ scale: 1 });
      const scale = Math.min(1.25, 4096 / Math.max(natural.width, natural.height));
      const viewport = page.getViewport({ scale });
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      if (context === null) throw new Error("PDF canvas is unavailable.");
      await page.render({ canvasContext: context, viewport }).promise;
      label.textContent = `Page ${pageNumber} of ${pdfDocument.numPages}`;
    } finally {
      busy = false;
      previous.disabled = pageNumber <= 1; next.disabled = pageNumber >= pdfDocument.numPages;
    }
  };
  const changePage = (step: number): void => {
    if (busy || disposed || isCancelled()) return;
    pageNumber = Math.max(1, Math.min(pdfDocument.numPages, pageNumber + step));
    void paint().catch((error: unknown) => { if (!disposed) label.textContent = error instanceof Error ? error.message : String(error); });
  };
  previous.onclick = () => changePage(-1); next.onclick = () => changePage(1);
  try { await paint(); } catch (error) { await destroy(); throw error; }
  return {
    handle: { destroy: () => { disposed = true; previous.onclick = null; next.onclick = null; void destroy(); } },
    detail: countLabel(pdfDocument.numPages, "page", "pages")
  };
};

const readBounded = async (sourceUrl: string): Promise<ArrayBuffer> => {
  const response = await fetch(sourceUrl);
  if (!response.ok || response.body === null) throw new Error("Office file is unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 64 * 1024 * 1024) throw new Error("Office preview exceeds 64 MiB.");
      chunks.push(part.value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const data = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  return data.buffer;
};

const finishViewer = <T extends OfficeHandle>(
  viewer: T,
  isCancelled: () => boolean,
  detail: (viewer: T) => void
): OfficeHandle | null => {
  if (isCancelled()) {
    viewer.destroy();
    return null;
  }
  detail(viewer);
  return viewer;
};

export const renderOfficeFile = async (
  host: HTMLElement,
  preview: OfficePreviewSource,
  isCancelled: () => boolean,
  onDetail: (detail: string) => void
): Promise<OfficeHandle | null> => {
  if (preview.byteLength > 64 * 1024 * 1024) throw new Error("Office preview exceeds 64 MiB.");
  if (preview.format === "pdf") {
    host.style.overflow = "auto";
    host.style.padding = "var(--lyra-space-16)";
    const rendered = await renderPdf(host, preview.sourceUrl, isCancelled);
    if (rendered === null) return null;
    onDetail(rendered.detail);
    return rendered.handle;
  }
  const data = await readBounded(preview.sourceUrl);
  if (isCancelled()) return null;
  host.style.overflow = "hidden";
  host.style.padding = "0";

  if (preview.format === "docx") {
    const { DocxScrollViewer } = await import("@silurus/ooxml/docx");
    const viewer = new DocxScrollViewer(host, {
      useGoogleFonts: false,
      enableTextSelection: true,
      refitOnResize: false,
      onVisiblePageChange: (_index, total) => {
        if (!isCancelled() && total > 0) onDetail(countLabel(total, "page", "pages"));
      }
    });
    try {
      await viewer.load(data);
    } catch (error) {
      viewer.destroy();
      throw error;
    }
    return finishViewer(viewer, isCancelled, (loaded) => {
      if (loaded.pageCount > 0) onDetail(countLabel(loaded.pageCount, "page", "pages"));
    });
  }
  if (preview.format === "xlsx") {
    const { XlsxViewer } = await import("@silurus/ooxml/xlsx");
    const viewer = new XlsxViewer(host, { useGoogleFonts: false });
    try {
      await viewer.load(data);
    } catch (error) {
      viewer.destroy();
      throw error;
    }
    return finishViewer(viewer, isCancelled, (loaded) => {
      onDetail(countLabel(loaded.sheetCount, "sheet", "sheets"));
    });
  }
  const { PptxScrollViewer } = await import("@silurus/ooxml/pptx");
  const viewer = new PptxScrollViewer(host, {
    useGoogleFonts: false,
    enableTextSelection: true,
    refitOnResize: false,
    onVisibleSlideChange: (_index, total) => {
      if (!isCancelled() && total > 0) onDetail(countLabel(total, "slide", "slides"));
    }
  });
  try {
    await viewer.load(data);
  } catch (error) {
    viewer.destroy();
    throw error;
  }
  return finishViewer(viewer, isCancelled, (loaded) => {
    if (loaded.slideCount > 0) onDetail(countLabel(loaded.slideCount, "slide", "slides"));
  });
};

