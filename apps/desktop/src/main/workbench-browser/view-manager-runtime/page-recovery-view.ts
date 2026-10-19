import { WebContentsView } from "electron";
import type { NativeRecoveryLabels } from "../../../shared/native-recovery-labels";

const RELOAD_ADDRESS = "https://lyra-recovery.invalid/reload";
const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Recovery chrome has its own renderer and never impersonates the dead site. */
export const createPageRecoveryView = (host: {
  readonly address: string;
  readonly labels: NativeRecoveryLabels;
  readonly reload: () => void;
  readonly focus: () => void;
}): WebContentsView => {
  const view = new WebContentsView({ webPreferences: {
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    partition: "lyra-page-recovery", focusOnNavigation: false
  } });
  const contents = view.webContents;
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event, url) => {
    event.preventDefault();
    if (url === RELOAD_ADDRESS || url === `${RELOAD_ADDRESS}?`) host.reload();
  });
  contents.on("focus", host.focus);
  const html = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
:root { color-scheme: light dark; font: 15px system-ui, sans-serif; background: Canvas; color: CanvasText; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
main { width: min(32rem, 80vw); } h1 { font-size: 22px; font-weight: 600; }
p { line-height: 1.5; } .address { opacity: .65; overflow-wrap: anywhere; }
button { font: inherit; background: transparent; cursor: pointer; display: inline-block; margin-top: 12px; padding: 9px 16px; border: 1px solid; border-radius: 4px; color: inherit; text-decoration: none; }
button:focus-visible { outline: 2px solid Highlight; outline-offset: 3px; }
</style></head><body><main role="alert"><h1>${escapeHtml(host.labels.pageTitle)}</h1>
<p>${escapeHtml(host.labels.pageDescription)}</p><p class="address">${escapeHtml(host.address)}</p>
<form action="${RELOAD_ADDRESS}" method="get"><button type="submit">${escapeHtml(host.labels.reload)}</button></form></main></body></html>`;
  void contents.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch((error: unknown) => {
    if (!contents.isDestroyed()) console.error(`[lyra] page recovery view failed: ${String(error)}`);
  });
  return view;
};
