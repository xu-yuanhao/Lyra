import path from "node:path";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, test } from "vitest";

import desktopPackage from "../../package.json";
import {
  LYRA_DEV_REPLACE_RUNTIME_ENV,
  RUNTIME_CLIENT_LIFECYCLE_EVENT,
  createLyraRuntimeClient,
  devRuntimeReplacesDaemon,
  runtimeClientInternalsForTests
} from "./runtime-client";

type JsonRecord = Record<string, unknown>;

const tempRoots: string[] = [];
const servers: net.Server[] = [];
const originalRuntimeBin = process.env.LYRA_RUNTIME_BIN;

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(path.join(tmpdir(), "lyra-runtime-client-test-"));
  tempRoots.push(root);
  return root;
};

const closeServer = async (server: net.Server): Promise<void> => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
};

const readEnvelope = async (socket: net.Socket): Promise<JsonRecord> => {
  socket.setEncoding("utf8");
  let buffer = "";
  return await new Promise((resolve, reject) => {
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const index = buffer.indexOf("\n");
      if (index < 0) {
        return;
      }
      const line = buffer.slice(0, index);
      try {
        resolve(JSON.parse(line) as JsonRecord);
      } catch (error) {
        reject(error);
      }
    });
    socket.once("error", reject);
    socket.once("close", () => reject(new Error("socket closed")));
  });
};

const writeEnvelope = (socket: net.Socket, envelope: JsonRecord): void => {
  socket.write(`${JSON.stringify(envelope)}\n`);
};

const record = (value: unknown): JsonRecord => value as JsonRecord;

const listenRuntimeServer = async (
  socketPath: string,
  handler: (socket: net.Socket) => void | Promise<void>
): Promise<net.Server> => {
  if (process.platform !== "win32") {
    await mkdir(path.dirname(socketPath), { recursive: true });
    await rm(socketPath, { force: true });
  }
  const server = net.createServer((socket) => {
    void Promise.resolve(handler(socket)).catch((error) => {
      socket.destroy(error instanceof Error ? error : new Error(String(error)));
    });
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  server.removeAllListeners("error");
  return server;
};

const startHandshakeServer = async (
  socketPath: string,
  onRequest: (socket: net.Socket, envelope: JsonRecord) => void | Promise<void>
): Promise<net.Server> => listenRuntimeServer(socketPath, async (socket) => {
  const handshake = await readEnvelope(socket);
  const hello = record(handshake.payload);
  writeEnvelope(socket, {
    kind: "response",
    id: handshake.id,
    ok: true,
    result: {
      protocolMinVersion: 2,
      protocolMaxVersion: 3,
      negotiatedProtocolVersion: 2,
      serverName: "fake-lyrad",
      componentVersion: "0.1.0-test",
      buildId: "fake-lyrad-build",
      hostApiVersion: "1.0.0",
      capabilities: ["agent.import.v2", "lsp.upsert", "files.read_home"],
      dataSchemas: { "lyra.runtime": 1 },
      connectionRole: hello.connectionRole,
      connectionLeaseId: hello.connectionLeaseId
    }
  });
  const request = await readEnvelope(socket);
  await onRequest(socket, request);
});

afterEach(async () => {
  if (originalRuntimeBin === undefined) {
    delete process.env.LYRA_RUNTIME_BIN;
  } else {
    process.env.LYRA_RUNTIME_BIN = originalRuntimeBin;
  }
  await Promise.all(servers.splice(0).map((server) => closeServer(server).catch(() => undefined)));
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Lyra runtime client", () => {
  test("a dev desktop start replaces a daemon already on the socket", () => {
    expect(devRuntimeReplacesDaemon({ [LYRA_DEV_REPLACE_RUNTIME_ENV]: "1" })).toBe(true);
    expect(devRuntimeReplacesDaemon({})).toBe(false);
  });

  test("starts lyrad with Lyra Agent storage aliases under the Agent module root", () => {
    const env = runtimeClientInternalsForTests.buildRuntimeDaemonEnv(
      {
        PATH: "/bin",
        ELECTRON_RENDERER_URL: "http://127.0.0.1:5173",
        LYRA_AGENT_HOME: "/legacy/.lyra-agent",
        LYRA_AGENT_RUNTIME_DIR: "/legacy/lyra-agent-runtime",
        JCODE_HOME: "/legacy/.agent",
        JCODE_RUNTIME_DIR: "/legacy/runtime"
      },
      {
        storageRoot: "/Users/tester/.lyra/modules/runtime",
        agentStorageRoot: "/Users/tester/.lyra/modules/agent"
      },
      "/Applications/Lyra.app/Contents/MacOS/Lyra"
    );

    expect(env.PATH).toBe("/bin");
    // Terminals and agent exec shells descend from this daemon, so an
    // electron-vite app launched there must not inherit Lyra's dev renderer.
    expect(env.ELECTRON_RENDERER_URL).toBeUndefined();
    expect(env.ELECTRON_RUN_AS_NODE).toBe("");
    expect(env.LYRA_AGENT_HOME).toBe("/Users/tester/.lyra/modules/agent");
    expect(env.LYRA_AGENT_RUNTIME_DIR).toBe(
      path.join("/Users/tester/.lyra/modules/agent", "runtime")
    );
    expect(env.JCODE_HOME).toBe("/Users/tester/.lyra/modules/agent");
    expect(env.JCODE_RUNTIME_DIR).toBe(
      path.join("/Users/tester/.lyra/modules/agent", "runtime")
    );
    expect(env.LYRA_JS_REPL_NODE_PATH).toBe(
      "/Applications/Lyra.app/Contents/MacOS/Lyra"
    );
    expect(env.LYRA_JS_REPL_NODE_RUN_AS_NODE).toBe("1");
    expect(env.LYRA_DESIGN_NODE_PATH).toBe(
      "/Applications/Lyra.app/Contents/MacOS/Lyra"
    );
    expect(env.LYRA_DESIGN_NODE_RUN_AS_NODE).toBe("1");
    expect(env.LYRA_DESIGN_NODE_PATHS).toContain("node_modules");
    expect(env.PLAYWRIGHT_BROWSERS_PATH).toContain("playwright-browsers");
  });

  test("maps lyrad socket paths onto the flock file lyrad uses", () => {
    expect(runtimeClientInternalsForTests.unixRuntimeLockPath("/run/lyrad.sock")).toBe(
      "/run/lyrad.sock.lock"
    );
    expect(runtimeClientInternalsForTests.unixRuntimeLockPath("/run/lyrad")).toBe(
      "/run/lyrad.sock.lock"
    );
  });

  test("finds the process holding a unix runtime lock path", async () => {
    const root = await makeTempRoot();
    const lockPath = path.join(root, "lyrad.sock.lock");
    const handle = await open(lockPath, "w");
    try {
      expect(runtimeClientInternalsForTests.collectPidsUsingPath(lockPath)).toContain(process.pid);
    } finally {
      await handle.close();
    }
  });

  test("preserves explicit Playwright browser bundle override", () => {
    const env = runtimeClientInternalsForTests.buildRuntimeDaemonEnv(
      {
        PLAYWRIGHT_BROWSERS_PATH: "/custom/ms-playwright"
      },
      {
        storageRoot: "/Users/tester/.lyra/modules/runtime",
        agentStorageRoot: "/Users/tester/.lyra/modules/agent"
      },
      "/Applications/Lyra.app/Contents/MacOS/Lyra"
    );

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe("/custom/ms-playwright");
  });

  test("does not discover packaged Playwright resources when signed components are required", () => {
    const env = runtimeClientInternalsForTests.buildRuntimeDaemonEnv(
      {
        LYRA_RESOURCE_COMPONENT_MODE: "signed-components"
      },
      {
        storageRoot: "/Users/tester/.lyra/data/runtime",
        agentStorageRoot: "/Users/tester/.lyra/data/agent"
      },
      "/Applications/Lyra.app/Contents/MacOS/Lyra"
    );

    expect(env.PLAYWRIGHT_BROWSERS_PATH).toBe(
      path.join(
        "/Users/tester/.lyra/data/agent",
        "runtime",
        "missing-resource-components",
        "playwright"
      )
    );
  });

  test("resolves runtime host request timeout from tool payload", () => {
    expect(
      runtimeClientInternalsForTests.resolveRuntimeHostRequestTimeoutMs({ timeoutMs: 8_000 })
    ).toBe(8_000);
    expect(
      runtimeClientInternalsForTests.resolveRuntimeHostRequestTimeoutMs({
        runtimeCancellation: { timeoutMs: 12_000 }
      })
    ).toBe(12_000);
    expect(
      runtimeClientInternalsForTests.resolveRuntimeHostRequestTimeoutMs({ timeoutMs: 1 })
    ).toBe(250);
    expect(
      runtimeClientInternalsForTests.resolveRuntimeHostRequestTimeoutMs({ timeoutMs: 999_999 })
    ).toBe(120_000);
  });

  test("rejects protocol mismatch during handshake without daemon fallback", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await listenRuntimeServer(socketPath, async (socket) => {
      const handshake = await readEnvelope(socket);
      const hello = record(handshake.payload);
      writeEnvelope(socket, {
        kind: "response",
        id: handshake.id,
        ok: true,
        result: {
          protocolMinVersion: 3,
          protocolMaxVersion: 4,
          negotiatedProtocolVersion: 3,
          serverName: "future-lyrad",
          componentVersion: "1.0.0",
          buildId: "future-lyrad-build",
          hostApiVersion: "1.0.0",
          capabilities: ["agent.import.v2", "lsp.upsert", "files.read_home"],
          dataSchemas: { "lyra.runtime": 2 },
          connectionRole: hello.connectionRole,
          connectionLeaseId: hello.connectionLeaseId
        }
      });
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });

    await expect(client.request("runtime.reload", {}))
      .rejects.toThrow("Lyra runtime protocol mismatch");
    client.dispose();
  });

  test("rejects a runtime with a different Host API major", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await listenRuntimeServer(socketPath, async (socket) => {
      const handshake = await readEnvelope(socket);
      const hello = record(handshake.payload);
      writeEnvelope(socket, {
        kind: "response",
        id: handshake.id,
        ok: true,
        result: {
          protocolMinVersion: 2,
          protocolMaxVersion: 2,
          negotiatedProtocolVersion: 2,
          serverName: "incompatible-lyrad",
          componentVersion: "2.0.0",
          buildId: "incompatible-host-api",
          hostApiVersion: "2.0.0",
          capabilities: ["agent.import.v2", "lsp.upsert", "files.read_home"],
          dataSchemas: { "lyra.runtime": 1 },
          connectionRole: hello.connectionRole,
          connectionLeaseId: hello.connectionLeaseId
        }
      });
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });

    await expect(client.request("runtime.reload", {}))
      .rejects.toThrow("Lyra Host API mismatch: Core 1.0.0, Runtime 2.0.0");
    client.dispose();
  });

  test("rejects a runtime whose identity does not match the selected component version", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await listenRuntimeServer(socketPath, async (socket) => {
      const handshake = await readEnvelope(socket);
      const hello = record(handshake.payload);
      writeEnvelope(socket, {
        kind: "response",
        id: handshake.id,
        ok: true,
        result: {
          protocolMinVersion: 2,
          protocolMaxVersion: 2,
          negotiatedProtocolVersion: 2,
          serverName: "wrong-lyrad",
          componentVersion: "1.9.0",
          buildId: "wrong-component",
          hostApiVersion: "1.0.0",
          capabilities: ["agent.import.v2", "lsp.upsert", "files.read_home"],
          dataSchemas: { "lyra.runtime": 1 },
          connectionRole: hello.connectionRole,
          connectionLeaseId: hello.connectionLeaseId
        }
      });
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent"),
      expectedComponentVersion: "2.0.0"
    });

    await expect(client.request("runtime.reload", {}))
      .rejects.toThrow("expected 2.0.0, received 1.9.0");
    client.dispose();
  });

  test("does not respawn over an existing primary-host lease", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await listenRuntimeServer(socketPath, async (socket) => {
      const handshake = await readEnvelope(socket);
      writeEnvelope(socket, {
        kind: "response",
        id: handshake.id,
        ok: false,
        error: {
          code: "RUNTIME_PRIMARY_HOST_EXISTS",
          message: "a primary host connection is already active"
        }
      });
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });

    await expect(client.request("runtime.reload", {}))
      .rejects.toThrow("a primary host connection is already active");
    client.dispose();
  });

  test("sends RuntimeHelloV2 identity and negotiates an overlapping range", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await listenRuntimeServer(socketPath, async (socket) => {
      const handshake = await readEnvelope(socket);
      expect(handshake.method).toBe("runtime.handshake");
      expect(handshake.payload).toMatchObject({
        protocolMinVersion: 2,
        protocolMaxVersion: 2,
        clientName: "lyra-desktop",
        componentVersion: desktopPackage.version,
        hostApiVersion: "1.0.0",
        capabilities: ["runtime.host.requests"],
        dataSchemas: { "lyra.desktop": 1 },
        connectionRole: "primaryHost"
      });
      const hello = record(handshake.payload);
      expect(hello.buildId).toEqual(expect.any(String));
      expect(hello.connectionLeaseId).toEqual(expect.any(String));
      writeEnvelope(socket, {
        kind: "response",
        id: handshake.id,
        ok: true,
        result: {
          protocolMinVersion: 1,
          protocolMaxVersion: 2,
          negotiatedProtocolVersion: 2,
          serverName: "fake-lyrad",
          componentVersion: "0.2.0",
          buildId: "fake-build",
          hostApiVersion: "1.0.0",
          capabilities: ["agent.import.v2", "lsp.upsert", "files.read_home"],
          dataSchemas: { "lyra.runtime": 1 },
          connectionRole: hello.connectionRole,
          connectionLeaseId: hello.connectionLeaseId
        }
      });
      const request = await readEnvelope(socket);
      writeEnvelope(socket, {
        kind: "response",
        id: request.id,
        ok: true,
        result: { status: "reloaded" }
      });
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });

    await expect(client.request("runtime.reload", {})).resolves.toEqual({ status: "reloaded" });
    client.dispose();
  });

  test("rejects a legacy V1 hello response", () => {
    expect(() => runtimeClientInternalsForTests.readRuntimeHelloV2Response({
      protocolVersion: 1,
      serverName: "legacy-lyrad"
    })).toThrow("invalid RuntimeHelloV2 response");
  });

  test("rejects pending requests when the runtime socket closes", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await startHandshakeServer(socketPath, (socket) => {
      socket.destroy();
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });

    await expect(client.request("runtime.reload", {})).rejects.toThrow(/socket closed|daemon exited/u);
    client.dispose();
  });

  test("reconnects after a socket disconnect", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    const firstServer = await startHandshakeServer(socketPath, (socket) => {
      socket.destroy();
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });
    const lifecycle: unknown[] = [];
    client.subscribe((event, payload) => {
      if (event === RUNTIME_CLIENT_LIFECYCLE_EVENT) {
        lifecycle.push(payload);
      }
    });
    await expect(client.request("runtime.reload", {})).rejects.toThrow();
    await closeServer(firstServer);

    await startHandshakeServer(socketPath, (socket, request) => {
      writeEnvelope(socket, {
        kind: "response",
        id: request.id,
        ok: true,
        result: { status: "reloaded" }
      });
    });

    await expect(client.request("runtime.reload", {})).resolves.toEqual({ status: "reloaded" });
    expect(lifecycle).toEqual([
      { kind: "connected", generation: 1, recovered: false },
      { kind: "disconnected", generation: 1 },
      { kind: "connected", generation: 2, recovered: true }
    ]);
    client.dispose();
  });

  test("rejects oversized runtime frames instead of buffering forever", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    const maxRuntimeFrameBytes = 1024;
    await startHandshakeServer(socketPath, (socket) => {
      socket.write("x".repeat(maxRuntimeFrameBytes + 1));
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent"),
      maxRuntimeFrameBytes
    });

    await expect(client.request("runtime.reload", {})).rejects.toThrow("frame too large");
    client.dispose();
  });

  test("rejects pending requests on malformed runtime frames", async () => {
    process.env.LYRA_RUNTIME_BIN = process.execPath;
    const storageRoot = await makeTempRoot();
    const socketPath = runtimeClientInternalsForTests.resolveSocketPath(storageRoot);
    await startHandshakeServer(socketPath, (socket) => {
      socket.write("{not-json}\n");
    });

    const client = createLyraRuntimeClient({
      storageRoot,
      agentStorageRoot: path.join(storageRoot, "agent")
    });

    await expect(client.request("runtime.reload", {})).rejects.toThrow("decode failed");
    client.dispose();
  });
});
