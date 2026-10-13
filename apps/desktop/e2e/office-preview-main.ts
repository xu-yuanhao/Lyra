import { app, BrowserWindow, ipcMain, net, protocol } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createLyraFileAccessController } from "../src/main/security";
import { previewOfficeFile } from "../src/main/office/preview";
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))!.slice(name.length + 3);
const root = argument("fixture-root");
app.setPath("userData", path.join(root, "profile"));
app.commandLine.appendSwitch("disable-gpu");
protocol.registerSchemesAsPrivileged(["lyra-file", "lyra-app-module"].map(scheme => ({ scheme, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } })));
void app.whenReady().then(async () => {
  const access = createLyraFileAccessController();
  ipcMain.handle("fixture-preview", async (_event, format: string) => {
    if (!["pdf", "docx", "xlsx", "pptx"].includes(format)) throw new Error("Unknown fixture");
    const filePath = path.join(root, `sample.${format}`);
    const preview = await previewOfficeFile(filePath);
    return { ...preview, sourceUrl: access.createPreviewUrl(filePath) };
  });
  protocol.handle("lyra-file", async request => {
    const resolved = await access.resolveRequest(request.url);
    if (resolved === null) return new Response(null, { status: 403 });
    const response = await net.fetch(pathToFileURL(resolved.path).toString(), { headers: request.headers });
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), "content-type": resolved.contentType } });
  });
  protocol.handle("lyra-app-module", async request => {
    const source = new URL(request.url);
    const upstream = new URL(argument("fixture-url"));
    upstream.pathname = source.pathname; upstream.search = source.search;
    const response = await net.fetch(upstream.toString());
    return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), "access-control-allow-origin": "*" } });
  });
  const window = new BrowserWindow({ width: 1000, height: 760, webPreferences: { nodeIntegration: true, contextIsolation: false } });
  if (process.argv.includes("--fixture-file-origin")) await window.loadFile(path.join(root, "index.html"));
  else await window.loadURL(argument("fixture-url"));
});
app.on("window-all-closed", () => app.quit());
