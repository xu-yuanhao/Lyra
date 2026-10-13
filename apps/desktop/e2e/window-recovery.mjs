import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { _electron } from "playwright";
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const root = await mkdtemp(path.join(tmpdir(), "lyra-recovery-e2e-"));
const artifact = process.argv[2] ?? path.join(root, "page-crashed.png");
await mkdir(path.join(root, "profile"), { recursive: true });
const server = createServer((_request, response) => response.end("<!doctype html><title>Verification page</title><p>Page is working</p>"));
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/initial`;
const main = path.join(root, "main.cjs");
esbuild.buildSync({ entryPoints: [fileURLToPath(new URL("./window-recovery-main.ts", import.meta.url))],
  bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: main });
let app;
try {
  app = await _electron.launch({ args: ["--no-sandbox", main, `--fixture-root=${root}`, `--fixture-url=${url}`], timeout: 30000 });
  const poll = async (read, timeout = 10000) => {
    const end = Date.now() + timeout;
    while (!(await app.evaluate(read))) {
      assert(Date.now() < end, "Electron recovery action did not finish");
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  };
  await poll(() => !!globalThis.recoveryFixture?.registry.getEntry("tab") && !globalThis.recoveryFixture.registry.getEntry("tab").runtime.isLoading);
  await app.evaluate(() => globalThis.recoveryFixture.registry.getEntry("tab").webContents.forcefullyCrashRenderer());
  await poll(() => !!globalThis.recoveryFixture.registry.getEntry("tab").recoveryView);
  const crashed = await app.evaluate(() => {
    const f = globalThis.recoveryFixture, entry = f.registry.getEntry("tab");
    return { address: entry.runtime.address, reason: entry.runtime.recoveryFailure.reason,
      closed: f.events.some(event => event.kind === "page-closed"), visible: entry.viewVisible, attached: entry.attached };
  });
  assert.equal(crashed.address, url); assert.equal(crashed.reason, "renderer_crashed");
  assert.equal(crashed.closed, false); assert.equal(crashed.visible, true); assert.equal(crashed.attached, true);
  await poll(() => !globalThis.recoveryFixture.registry.getEntry("tab").recoveryView.webContents.isLoading());
  await mkdir(path.dirname(artifact), { recursive: true });
  await app.evaluate(async (_electron, output) => globalThis.recoveryFixture.captureRecovery(output), artifact);
  await app.evaluate(async () => globalThis.recoveryFixture.registry.getEntry("tab").recoveryView.webContents.executeJavaScript("document.querySelector('button').click()"));
  await poll(() => !globalThis.recoveryFixture.registry.getEntry("tab").recoveryView && !globalThis.recoveryFixture.registry.getEntry("tab").runtime.isLoading);
  const before = await app.evaluate(() => globalThis.recoveryFixture.created);
  await app.evaluate(() => globalThis.recoveryFixture.main.close());
  await poll(() => globalThis.recoveryFixture.main === null);
  await app.evaluate(({ app }) => app.emit("activate"));
  await poll(() => !!globalThis.recoveryFixture.main && !globalThis.recoveryFixture.main.webContents.isLoading());
  assert.equal(await app.evaluate(() => globalThis.recoveryFixture.created), before + 1);
  const mainId = await app.evaluate(() => globalThis.recoveryFixture.main.id);
  for (let index = 0; index < 4; index++) {
    const beforeGone = await app.evaluate(() => globalThis.recoveryFixture.rendererGone);
    await app.evaluate(() => globalThis.recoveryFixture.main.webContents.forcefullyCrashRenderer());
    const end = Date.now() + 10000;
    while ((await app.evaluate(() => globalThis.recoveryFixture.rendererGone)) <= beforeGone) {
      assert(Date.now() < end, "Renderer crash event did not arrive");
      await new Promise(resolve => setTimeout(resolve, 30));
    }
    await poll(() => !globalThis.recoveryFixture.main.webContents.isCrashed() && !globalThis.recoveryFixture.main.webContents.isLoading());
  }
  assert.notEqual(await app.evaluate(() => globalThis.recoveryFixture.main.id), mainId);
  assert.equal(await app.evaluate(() => globalThis.recoveryFixture.choices.length), 1);
  await poll(() => !!globalThis.recoveryFixture.registry.getEntry("tab") && !globalThis.recoveryFixture.registry.getEntry("tab").runtime.isLoading);
  const latest = url.replace("/initial", "/last-navigation");
  await app.evaluate(async (_electron, address) => globalThis.recoveryFixture.registry.navigate({ tabId: "tab", address }), latest);
  const exited = new Promise(resolve => app.process().once("exit", (code, signal) => resolve({ code, signal })));
  await app.evaluate(({ app }) => { setImmediate(() => app.quit()); });
  const exit = await exited; assert.equal(exit.code, 0);
  const snapshot = JSON.parse(await readFile(path.join(root, "state", "browser-session.v1.json"), "utf8"));
  assert.equal(snapshot.tabs[0].address, latest);
  // The same production shutdown barrier must also terminate a stuck flush.
  app = await _electron.launch({ args: ["--no-sandbox", main, `--fixture-root=${root}`, `--fixture-url=${url}`, "--fixture-hang-flush"], timeout: 30000 });
  await poll(() => !!globalThis.recoveryFixture?.main && !globalThis.recoveryFixture.main.webContents.isLoading());
  const deadlineStart = Date.now();
  const forcedExit = new Promise(resolve => app.process().once("exit", code => resolve(code)));
  await app.evaluate(({ app }) => { setImmediate(() => app.quit()); });
  assert.equal(await forcedExit, 0);
  assert(Date.now() - deadlineStart < 6500, "hung state flush blocked Electron quit");
  console.log(JSON.stringify({ pageCrash: crashed, reload: "working", hiddenWindowReopen: "working", shellCrashLoop: "reopened", hungFlushQuit: "bounded to 5 seconds", lastSnapshot: snapshot.tabs[0].address, screenshot: artifact }));
} finally {
  await app?.close().catch(() => {});
  server.close(); await rm(root, { recursive: true, force: true });
}
