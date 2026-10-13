import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { _electron } from "playwright";
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const repo = path.resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const root = await mkdtemp(path.join(tmpdir(), "lyra-office-e2e-"));
const artifacts = process.argv[2] ?? root;
const fileOrigin = process.argv.includes("--file-origin");
await mkdir(path.join(root, "profile"), { recursive: true });
await mkdir(artifacts, { recursive: true });
const fixtures = path.join(root, "fixtures.cjs");
esbuild.buildSync({ entryPoints: [path.join(repo, "apps/desktop/src/main/office/office.test-fixtures.ts")], bundle: true, platform: "node", format: "cjs", outfile: fixtures });
const { helloDocx, helloSheet, helloDeck, helloPdf } = require(fixtures);
for (const [format, create] of Object.entries({ docx: helloDocx, xlsx: helloSheet, pptx: helloDeck, pdf: helloPdf })) await writeFile(path.join(root, `sample.${format}`), create());
const main = path.join(root, "main.cjs");
esbuild.buildSync({ entryPoints: [fileURLToPath(new URL("./office-preview-main.ts", import.meta.url))], bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: main, nodePaths: [path.join(repo, "node_modules"), path.join(repo, "apps/desktop/node_modules")] });
const entry = `
import * as React from 'react';
import * as ReactDomClient from 'react-dom/client';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { installFirstPartyUiRuntime } from '/@fs/${repo}/packages/workbench-ui-runtime/src/host.ts';
installFirstPartyUiRuntime({ react: React, reactDomClient: ReactDomClient, jsxRuntime: ReactJsxRuntime });
const artifactUrl = '/built-office.mjs';
const { lyraAppModule } = await import(/* @vite-ignore */ artifactUrl);
let mounted;
let format;
const host = { executeCommand: async (command) => command === 'lyra.core.office.preview'
 ? window.require('electron').ipcRenderer.invoke('fixture-preview', format) : null,
 subscribeEvent: () => ({ dispose() {} }), registerCommand: () => ({ dispose() {} }) };
const unavailable = async () => ({ ok: false, error: { code: 'app-unavailable', message: 'Unavailable', repairable: true } });
const slots = { create: unavailable, restore: unavailable, mount: unavailable, unmount: unavailable, close: unavailable, snapshot: unavailable };
await lyraAppModule.activate(host);
window.openFixture = async (next) => {
 if(mounted) await lyraAppModule.unmount({instanceId:mounted.instanceId});
 format=next;
 mounted = await lyraAppModule.create({host, appId:'office-viewer', instanceId:next, route:'/'});
 document.querySelector('#surface').replaceChildren();
 await lyraAppModule.mount({instance:mounted, container:document.querySelector('#surface'), slots});
};
window.ready = true;
`;
await writeFile(path.join(root, "entry.ts"), entry);
const desktopHtml = await readFile(path.join(repo, "apps/desktop/src/renderer/index.html"), "utf8");
const policy = desktopHtml.match(/content="(default-src[^"]+)"/)[1];
await writeFile(path.join(root, "index.html"), `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><style>html,body,#surface{height:100%;margin:0;font-family:Arial}button{padding:8px}</style><div id="surface"></div><script type="module" src="${fileOrigin ? "lyra-app-module://fixture/entry.ts" : "/entry.ts"}"></script>`);
const server = await createServer({ root, configFile: false, plugins: [{ name: "office-artifact", configureServer(server) {
 server.middlewares.use((request, response, next) => {
  if (request.url?.split("?")[0] !== "/built-office.mjs") return next();
  void readFile(path.join(repo, "apps/lyra-office/dist/index.mjs")).then(bytes => {
   response.setHeader("content-type", "application/javascript"); response.end(bytes);
  }).catch(next);
 });
} }], define: { __LYRA_APP_VERSION__: '"1.0.0"' }, resolve: { alias: { react: path.join(repo, "apps/desktop/node_modules/react"), "react-dom": path.join(repo, "apps/desktop/node_modules/react-dom") }, dedupe: ["react", "react-dom"] }, server: { host: "127.0.0.1", port: 0, watch: { ignored: ["**/profile/**"] }, fs: { allow: [root, repo] } } });
await server.listen();
let app;
try {
 app = await _electron.launch({ args: ["--no-sandbox", main, `--fixture-root=${root}`, `--fixture-url=http://127.0.0.1:${server.httpServer.address().port}`, ...(fileOrigin ? ["--fixture-file-origin"] : [])], timeout: 30000 });
 const page = await app.firstWindow();
 page.on('requestfailed', request => console.error('Request failed:', request.url().slice(0,180), request.failure()));
 page.on('pageerror', error => console.error('Renderer:', error));
 page.on('console', message => { if(message.type() === 'error') console.error('Console:', message.text()); });
 await page.waitForFunction(() => window.ready === true);
 for (const format of ["docx", "xlsx", "pptx", "pdf", "pdf"]) {
  await page.evaluate(next => window.openFixture(next), format);
  await page.waitForFunction(() => {
   const surface = document.querySelector('[data-lyra-component="lyra.office"]');
   return surface && (!surface.textContent.includes('Opening…') || surface.querySelector('.lyra-app-state-error'));
  }, { timeout: 30000 });
  console.log(format, await page.locator('#surface').innerText());
  assert(await page.locator('#surface canvas, #surface svg').count() > 0, `${format} rendered no page/sheet/slide`);
  await page.screenshot({ path: path.join(artifacts, `office-${format}.png`) });
  console.log(`${format}: visible content`);
 }
 await writeFile(path.join(root, "sample.docx"), helloPdf());
 await page.evaluate(() => window.openFixture("docx"));
 await page.locator('.lyra-app-state-error').waitFor();
 assert((await page.locator('.lyra-app-state-error').innerText()).includes('do not match'), "mismatched file was not rejected visibly");
 console.log("mismatched format: visible error");
} finally {
 await app?.close().catch(() => {});
 await server.close();
 await rm(root, { recursive: true, force: true });
}
