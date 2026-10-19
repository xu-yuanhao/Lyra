import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

import desktopPackage from "../../package.json";
import { resolveNativeResourceCandidates } from "./native-resource-paths";
import {
  RUNTIME_AUXILIARY_CONNECTION_ROLE,
  RUNTIME_DAEMON_REQUIRED_CAPABILITIES,
  RUNTIME_FATAL_HANDSHAKE_ERROR_CODES,
  RUNTIME_HANDSHAKE_METHOD,
  RUNTIME_HOST_API_VERSION,
  RUNTIME_PROTOCOL_MAX_VERSION,
  RUNTIME_PROTOCOL_MIN_VERSION,
  RUNTIME_REQUIRED_DATA_SCHEMAS,
  RUNTIME_SHELL_CAPABILITIES,
  RUNTIME_SHELL_CONNECTION_ROLE,
  RUNTIME_SHELL_DATA_SCHEMAS,
  assertRuntimeShellHandshake,
  type RuntimeConnectionRole
} from "../shared/runtime-shell-handshake";

const PROTOCOL_MIN_VERSION = RUNTIME_PROTOCOL_MIN_VERSION;
const PROTOCOL_MAX_VERSION = RUNTIME_PROTOCOL_MAX_VERSION;
const REQUIRED_CAPABILITIES = RUNTIME_DAEMON_REQUIRED_CAPABILITIES;
const CLIENT_CAPABILITIES = RUNTIME_SHELL_CAPABILITIES;
const CLIENT_DATA_SCHEMAS = RUNTIME_SHELL_DATA_SCHEMAS;
const REQUIRED_RUNTIME_DATA_SCHEMAS = RUNTIME_REQUIRED_DATA_SCHEMAS;
const CLIENT_NAME = "lyra-desktop";
const CLIENT_COMPONENT_VERSION = desktopPackage.version;
const HANDSHAKE_METHOD = RUNTIME_HANDSHAKE_METHOD;
const FATAL_HANDSHAKE_ERROR_CODES = new Set<string>(RUNTIME_FATAL_HANDSHAKE_ERROR_CODES);
const MIN_HOST_REQUEST_TIMEOUT_MS = 250;
const DEFAULT_HOST_REQUEST_TIMEOUT_MS = 30_000;
const MAX_HOST_REQUEST_TIMEOUT_MS = 120_000;
const MAX_RUNTIME_FRAME_BYTES = 8 * 1024 * 1024;
export const RUNTIME_CLIENT_LIFECYCLE_EVENT =
  "lyra.runtime.lifecycle" as const;
// Set by `pnpm run dev:desktop`. A packaged app keeps attaching to the
// daemon already on the socket; a dev start must not.
export const LYRA_DEV_REPLACE_RUNTIME_ENV = "LYRA_DEV_REPLACE_RUNTIME";

export const devRuntimeReplacesDaemon = (
  env: NodeJS.ProcessEnv = process.env
): boolean => env[LYRA_DEV_REPLACE_RUNTIME_ENV] === "1";

type RuntimeError = {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
};

type RuntimeEnvelope =
  | {
      readonly kind: "request";
      readonly id: string;
      readonly method: string;
      readonly payload: unknown;
    }
  | {
      readonly kind: "response";
      readonly id: string;
      readonly ok: boolean;
      readonly result?: unknown;
      readonly error?: RuntimeError;
    }
  | {
      readonly kind: "event";
      readonly event: string;
      readonly payload: unknown;
    };

type PendingRequest = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
};

class RuntimeProtocolMismatchError extends Error {}
class StaleRuntimeDaemonError extends Error {}

type RuntimeHelloV2Response = {
  readonly protocolMinVersion: number;
  readonly protocolMaxVersion: number;
  readonly negotiatedProtocolVersion: number;
  readonly serverName: string;
  readonly componentVersion: string;
  readonly buildId: string;
  readonly hostApiVersion: string;
  readonly capabilities: readonly string[];
  readonly dataSchemas: Readonly<Record<string, number>>;
  readonly connectionRole: RuntimeConnectionRole;
  readonly connectionLeaseId: string;
};

export type RuntimeEventListener = (event: string, payload: unknown) => void;
export type RuntimeRequestHandler = (payload: unknown) => Promise<unknown> | unknown;

export type LyraRuntimeClientOptions = {
  readonly storageRoot: string;
  readonly agentStorageRoot: string;
  readonly expectedComponentVersion?: string;
  readonly maxRuntimeFrameBytes?: number;
  readonly hostRole?: string;
  readonly onRolePid?: (role: string, pid: number) => void;
};

export type LyraRuntimeClient = {
  readonly request: <T>(method: string, payload: unknown) => Promise<T>;
  readonly registerRequestHandler: (method: string, handler: RuntimeRequestHandler) => void;
  readonly unregisterRequestHandler: (method: string) => void;
  readonly subscribe: (listener: RuntimeEventListener) => () => void;
  readonly dispose: () => void;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const resolveSocketPath = (storageRoot: string, hostRole?: string): string => {
  if (process.platform === "win32") {
    const key = `${storageRoot}-${hostRole ?? "legacy"}`.replace(/[^a-zA-Z0-9]/g, "_");
    return `\\\\.\\pipe\\lyra-runtime-${key}`;
  }
  const file = hostRole === undefined ? "lyrad.sock" : `${hostRole}.sock`;
  return path.join(storageRoot, "runtime", file);
};

const resolveRuntimeBinaryName = (): string =>
  process.platform === "win32" ? "lyrad.exe" : "lyrad";

export const resolveRuntimeBinaryCandidates = (cwd: string): readonly string[] =>
  resolveNativeResourceCandidates({
    cwd,
    moduleDir: __dirname,
    envVar: "LYRA_RUNTIME_BIN",
    fileNames: [resolveRuntimeBinaryName()],
  });

const resolveRuntimeBinaryPath = (): string => {
  const candidates = resolveRuntimeBinaryCandidates(process.cwd());
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`lyrad binary not found; tried paths:\n${candidates.join("\n")}`);
};

const resolveRuntimeWorkingDirectory = (): string => {
  return os.homedir();
};

const toError = (error: RuntimeError | undefined, fallback: string): Error =>
  Object.assign(new Error(error?.message ?? fallback), {
    ...(error?.code === undefined ? {} : { code: error.code }),
    ...(error?.details === undefined ? {} : { details: error.details })
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isProtocolVersion = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isRuntimeDataSchemas = (value: unknown): value is Record<string, number> =>
  isRecord(value)
  && Object.entries(value).every(([name, version]) =>
    name.trim().length > 0 && isProtocolVersion(version)
  );

const readRuntimeHelloV2Response = (value: unknown): RuntimeHelloV2Response => {
  if (
    !isRecord(value)
    || !isProtocolVersion(value.protocolMinVersion)
    || !isProtocolVersion(value.protocolMaxVersion)
    || !isProtocolVersion(value.negotiatedProtocolVersion)
    || !isNonEmptyString(value.serverName)
    || !isNonEmptyString(value.componentVersion)
    || !isNonEmptyString(value.buildId)
    || !isNonEmptyString(value.hostApiVersion)
    || !Array.isArray(value.capabilities)
    || !value.capabilities.every(isNonEmptyString)
    || !isRuntimeDataSchemas(value.dataSchemas)
    || (value.connectionRole !== RUNTIME_SHELL_CONNECTION_ROLE
      && value.connectionRole !== RUNTIME_AUXILIARY_CONNECTION_ROLE)
    || !isNonEmptyString(value.connectionLeaseId)
  ) {
    throw new RuntimeProtocolMismatchError("Lyra runtime returned an invalid RuntimeHelloV2 response");
  }
  return value as RuntimeHelloV2Response;
};

const resolveClientBuildId = (): string => {
  const configured = process.env.LYRA_BUILD_ID?.trim();
  return configured === undefined || configured.length === 0
    ? CLIENT_COMPONENT_VERSION
    : configured;
};

const readFinitePositiveNumber = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;

const resolveRuntimeHostRequestTimeoutMs = (payload: unknown): number => {
  const requested = isRecord(payload)
    ? readFinitePositiveNumber(payload.timeoutMs)
      ?? (isRecord(payload.runtimeCancellation)
        ? readFinitePositiveNumber(payload.runtimeCancellation.timeoutMs)
        : undefined)
    : undefined;
  const timeoutMs = Math.round(requested ?? DEFAULT_HOST_REQUEST_TIMEOUT_MS);
  return Math.max(MIN_HOST_REQUEST_TIMEOUT_MS, Math.min(MAX_HOST_REQUEST_TIMEOUT_MS, timeoutMs));
};

const createSocket = (socketPath: string): Promise<net.Socket> =>
  new Promise((resolve, reject) => {
    const socket = net.createConnection(socketPath, () => {
      socket.removeListener("error", reject);
      resolve(socket);
    });
    socket.once("error", reject);
  });

const ensureSocketParent = (socketPath: string): void => {
  if (process.platform === "win32") {
    return;
  }
  fs.mkdirSync(path.dirname(socketPath), { recursive: true });
};

const resolveAgentRuntimeDir = (agentStorageRoot: string): string =>
  path.join(agentStorageRoot, "runtime");

const maybeResourcesPath = (): string | undefined => {
  const electronProcess = process as NodeJS.Process & { readonly resourcesPath?: unknown };
  return typeof electronProcess.resourcesPath === "string" && electronProcess.resourcesPath.length > 0
    ? electronProcess.resourcesPath
    : undefined;
};

const uniqueNonEmpty = (values: readonly string[]): readonly string[] =>
  Array.from(new Set(values.filter((value) => value.trim().length > 0)));

const resolveLyraDesignPlaywrightBrowsersPath = (
  cwd: string,
  resourcesPath = maybeResourcesPath()
): string => {
  const fallbackPath = path.join(cwd, "apps", "desktop", "resources", "playwright-browsers");
  const candidates = uniqueNonEmpty([
    resourcesPath === undefined ? "" : path.join(resourcesPath, "playwright-browsers"),
    resourcesPath === undefined ? "" : path.join(resourcesPath, "resources", "playwright-browsers"),
    path.join(cwd, "resources", "playwright-browsers"),
    fallbackPath,
  ]);
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? fallbackPath;
};

const resolveLyraDesignNodePathEntries = (
  cwd: string,
  resourcesPath = maybeResourcesPath()
): readonly string[] =>
  uniqueNonEmpty([
    path.join(cwd, "node_modules"),
    path.join(cwd, "apps", "desktop", "node_modules"),
    path.resolve(__dirname, "node_modules"),
    path.resolve(__dirname, "..", "node_modules"),
    path.resolve(__dirname, "..", "..", "node_modules"),
    resourcesPath === undefined ? "" : path.join(resourcesPath, "app.asar", "node_modules"),
    resourcesPath === undefined ? "" : path.join(resourcesPath, "app", "node_modules"),
  ]);

const ensureAgentStoragePaths = (options: LyraRuntimeClientOptions): void => {
  fs.mkdirSync(options.agentStorageRoot, { recursive: true });
  fs.mkdirSync(resolveAgentRuntimeDir(options.agentStorageRoot), { recursive: true });
};

const buildRuntimeDaemonEnv = (
  baseEnv: NodeJS.ProcessEnv,
  options: LyraRuntimeClientOptions,
  nodePath: string
): NodeJS.ProcessEnv => {
  const cwd = process.cwd();
  const lyraDesignNodePaths = resolveLyraDesignNodePathEntries(cwd);
  const inheritedNodePath = typeof baseEnv.NODE_PATH === "string" ? baseEnv.NODE_PATH : "";
  // lyrad spawns the user's terminals and the agent's exec shells, so Lyra's own
  // dev-server pointer must not ride along: an electron-vite app launched from
  // there loads Lyra's dev renderer instead of its own UI (a grey window stuck
  // on Lyra's bootstrap mark). Packaged builds never set it.
  const inheritedEnv = { ...baseEnv };
  delete inheritedEnv.ELECTRON_RENDERER_URL;
  return {
    ...inheritedEnv,
    ELECTRON_RUN_AS_NODE: "",
    LYRA_AGENT_HOME: options.agentStorageRoot,
    LYRA_AGENT_RUNTIME_DIR: resolveAgentRuntimeDir(options.agentStorageRoot),
    JCODE_HOME: options.agentStorageRoot,
    JCODE_RUNTIME_DIR: resolveAgentRuntimeDir(options.agentStorageRoot),
    LYRA_JS_REPL_NODE_PATH: nodePath,
    LYRA_JS_REPL_NODE_RUN_AS_NODE: "1",
    LYRA_DESIGN_NODE_PATH: nodePath,
    LYRA_DESIGN_NODE_RUN_AS_NODE: "1",
    LYRA_DESIGN_NODE_PATHS: uniqueNonEmpty([
      ...lyraDesignNodePaths,
      ...inheritedNodePath.split(path.delimiter),
    ]).join(path.delimiter),
    PLAYWRIGHT_BROWSERS_PATH:
      typeof baseEnv.PLAYWRIGHT_BROWSERS_PATH === "string"
        && baseEnv.PLAYWRIGHT_BROWSERS_PATH.trim().length > 0
        ? baseEnv.PLAYWRIGHT_BROWSERS_PATH
        : baseEnv.LYRA_RESOURCE_COMPONENT_MODE === "signed-components"
          ? path.join(
              options.agentStorageRoot,
              "runtime",
              "missing-resource-components",
              "playwright"
            )
          : resolveLyraDesignPlaywrightBrowsersPath(cwd),
  };
};

const createRequestId = (): string =>
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Match lyrad Path::with_extension("sock.lock") so the desktop can find the
// flock holder of a leftover daemon after a stale handshake.
export const unixRuntimeLockPath = (socketPath: string): string => {
  const ext = path.extname(socketPath);
  if (ext.length === 0) {
    return `${socketPath}.sock.lock`;
  }
  return `${socketPath.slice(0, socketPath.length - ext.length)}.sock.lock`;
};

export const collectPidsUsingPath = (targetPath: string): readonly number[] => {
  if (process.platform === "win32") {
    return [];
  }
  let entries: string[];
  try {
    entries = fs.readdirSync("/proc");
  } catch {
    return [];
  }
  const pids: number[] = [];
  for (const entry of entries) {
    if (/^[0-9]+$/u.test(entry) === false) {
      continue;
    }
    const pid = Number.parseInt(entry, 10);
    let fds: string[];
    try {
      fds = fs.readdirSync(`/proc/${pid}/fd`);
    } catch {
      continue;
    }
    for (const fd of fds) {
      try {
        if (fs.readlinkSync(`/proc/${pid}/fd/${fd}`) === targetPath) {
          pids.push(pid);
          break;
        }
      } catch {
        // fd vanished
      }
    }
  }
  return pids;
};

const signalPids = (pids: readonly number[], signal: NodeJS.Signals): void => {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch {
      // already gone
    }
  }
};

const waitForPidsToExit = async (pids: readonly number[], timeoutMs: number): Promise<boolean> => {
  const remaining = new Set(pids);
  const deadline = Date.now() + timeoutMs;
  while (remaining.size > 0 && Date.now() < deadline) {
    for (const pid of [...remaining]) {
      try {
        process.kill(pid, 0);
      } catch {
        remaining.delete(pid);
      }
    }
    if (remaining.size === 0) {
      return true;
    }
    await sleep(50);
  }
  return remaining.size === 0;
};

export const stopRuntimeDaemon = async (storageRoot: string): Promise<void> => {
  const sockets = [
    resolveSocketPath(storageRoot),
    ...["agent", "terminal", "files", "scheduler", "services", "exec"].map((role) =>
      resolveSocketPath(storageRoot, role)
    )
  ];
  for (const socketPath of sockets) {
    if (process.platform === "win32") {
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // pipe already gone
      }
      continue;
    }
    await stopStaleUnixRuntime(socketPath);
  }
};

const stopStaleUnixRuntime = async (socketPath: string): Promise<void> => {
  const lockPath = unixRuntimeLockPath(socketPath);
  const holders = [...new Set([
    ...collectPidsUsingPath(socketPath),
    ...collectPidsUsingPath(lockPath)
  ])].filter((pid) => pid !== process.pid);
  if (holders.length > 0) {
    signalPids(holders, "SIGTERM");
    if (await waitForPidsToExit(holders, 2000) === false) {
      signalPids(holders, "SIGKILL");
      await waitForPidsToExit(holders, 1000);
    }
  }
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // Drop of the old daemon already removed it, or SIGKILL left a stale file
    // that the next lyrad will replace after it takes the lock.
  }
};

export const createLyraRuntimeClient = (
  options: LyraRuntimeClientOptions
): LyraRuntimeClient => {
  const socketPath = resolveSocketPath(options.storageRoot, options.hostRole);
  ensureSocketParent(socketPath);
  ensureAgentStoragePaths(options);
  const binaryPath = resolveRuntimeBinaryPath();
  const pending = new Map<string, PendingRequest>();
  const listeners = new Set<RuntimeEventListener>();
  const requestHandlers = new Map<string, RuntimeRequestHandler>();
  const maxRuntimeFrameBytes = options.maxRuntimeFrameBytes ?? MAX_RUNTIME_FRAME_BYTES;
  let socket: net.Socket | null = null;
  let child: ChildProcessWithoutNullStreams | null = null;
  let buffer = "";
  let disposed = false;
  let startPromise: Promise<void> | null = null;
  let runtimeConnected = false;
  let connectionGeneration = 0;
  const connectionRole: RuntimeConnectionRole = RUNTIME_SHELL_CONNECTION_ROLE;
  const connectionLeaseId = randomUUID();

  const emitClientEvent = (event: string, payload: unknown): void => {
    for (const listener of listeners) {
      try {
        listener(event, payload);
      } catch (error) {
        console.warn(`[lyra-runtime] event listener failed for ${event}`, error);
      }
    }
  };

  const noteRuntimeDisconnected = (): void => {
    if (!runtimeConnected) {
      return;
    }
    runtimeConnected = false;
    emitClientEvent(RUNTIME_CLIENT_LIFECYCLE_EVENT, {
      kind: "disconnected",
      generation: connectionGeneration
    });
  };

  const writeEnvelope = (envelope: RuntimeEnvelope): void => {
    if (socket === null || socket.destroyed) {
      throw new Error("Lyra runtime socket is not connected");
    }
    socket.write(`${JSON.stringify(envelope)}\n`);
  };

  const rejectAllPending = (reason: string): void => {
    for (const entry of pending.values()) {
      entry.reject(new Error(reason));
    }
    pending.clear();
  };

  const sendRequestUnsafe = async <T>(method: string, payload: unknown): Promise<T> => {
    const id = createRequestId();
    const promise = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    writeEnvelope({ kind: "request", id, method, payload });
    return await promise as T;
  };

  const handleEnvelope = (envelope: RuntimeEnvelope): void => {
    if (envelope.kind === "request") {
      const handler = requestHandlers.get(envelope.method);
      if (handler === undefined) {
        try {
          writeEnvelope({
            kind: "response",
            id: envelope.id,
            ok: false,
            error: {
              code: "RUNTIME_HOST_METHOD_NOT_FOUND",
              message: `No runtime host handler registered for ${envelope.method}`
            }
          });
        } catch (error) {
          console.warn("[lyra-runtime] failed to reply to runtime host request", error);
        }
        return;
      }

      const timeoutMs = resolveRuntimeHostRequestTimeoutMs(envelope.payload);
      let settled = false;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        settled = true;
        timeoutHandle = null;
        try {
          writeEnvelope({
            kind: "response",
            id: envelope.id,
            ok: false,
            error: {
              code: "RUNTIME_HOST_REQUEST_TIMEOUT",
              message:
                `Runtime host handler ${envelope.method} timed out after ` +
                `${timeoutMs}ms`,
              details: {
                method: envelope.method,
                timeoutMs
              }
            }
          });
        } catch (error) {
          console.warn("[lyra-runtime] failed to send runtime host timeout response", error);
        }
      }, timeoutMs);

      const finishHostRequest = (
        reply: Omit<Extract<RuntimeEnvelope, { kind: "response" }>, "kind" | "id">
      ): void => {
        if (settled) {
          return;
        }
        settled = true;
        if (timeoutHandle !== null) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        writeEnvelope({
          kind: "response",
          id: envelope.id,
          ...reply
        });
      };

      void Promise.resolve(handler(envelope.payload))
        .then((result) => {
          finishHostRequest({
            ok: true,
            result
          });
        })
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          const code =
            error !== null && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
              ? (error as { code: string }).code
              : "RUNTIME_HOST_REQUEST_FAILED";
          const details =
            error !== null && typeof error === "object" && "details" in (error as Record<string, unknown>)
              ? (error as { details?: unknown }).details
              : undefined;
          try {
            finishHostRequest({
              ok: false,
              error: {
                code,
                message,
                ...(details === undefined ? {} : { details })
              }
            });
          } catch (writeError) {
            console.warn("[lyra-runtime] failed to reply to runtime host request", writeError);
          }
        });
      return;
    }

    if (envelope.kind === "response") {
      const pendingRequest = pending.get(envelope.id);
      if (pendingRequest === undefined) {
        return;
      }
      pending.delete(envelope.id);
      if (envelope.ok) {
        pendingRequest.resolve(envelope.result);
      } else {
        pendingRequest.reject(toError(envelope.error, "runtime request failed"));
      }
      return;
    }

    if (envelope.kind === "event") {
      for (const listener of listeners) {
        listener(envelope.event, envelope.payload);
      }
    }
  };

  const attachSocket = (connected: net.Socket): void => {
    socket = connected;
    connected.setEncoding("utf8");
    connected.on("data", (chunk: string) => {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.trim().length === 0) {
          continue;
        }
        if (Buffer.byteLength(part, "utf8") > maxRuntimeFrameBytes) {
          rejectAllPending("Lyra runtime protocol frame too large");
          connected.destroy();
          return;
        }
        try {
          handleEnvelope(JSON.parse(part) as RuntimeEnvelope);
        } catch (error) {
          console.warn("[lyra-runtime] failed to decode runtime envelope", error);
          rejectAllPending("Lyra runtime protocol decode failed");
          connected.destroy();
          return;
        }
      }
      if (Buffer.byteLength(buffer, "utf8") > maxRuntimeFrameBytes) {
        rejectAllPending("Lyra runtime protocol frame too large");
        connected.destroy();
      }
    });
    connected.on("close", () => {
      if (socket === connected) {
        socket = null;
      }
      buffer = "";
      startPromise = null;
      noteRuntimeDisconnected();
      if (disposed) {
        return;
      }
      rejectAllPending("Lyra runtime socket closed");
      console.warn("[lyra-runtime] runtime socket closed");
    });
    connected.on("error", (error) => {
      if (disposed) {
        return;
      }
      console.warn("[lyra-runtime] runtime socket error", error);
    });
  };

  const spawnDaemon = (): void => {
    if (child !== null && child.exitCode === null && child.killed === false) {
      return;
    }

    const hostBinaryName =
      options.hostRole === undefined || options.hostRole === "services" || options.hostRole === "exec"
        ? undefined
        : process.platform === "win32"
          ? `lyra-${options.hostRole}-host.exe`
          : `lyra-${options.hostRole}-host`;
    const hostBinaryPath =
      hostBinaryName === undefined
        ? undefined
        : path.join(path.dirname(binaryPath), hostBinaryName);
    const program =
      hostBinaryPath !== undefined && fs.existsSync(hostBinaryPath) ? hostBinaryPath : binaryPath;
    const args =
      program === binaryPath && options.hostRole !== undefined
        ? ["--role", options.hostRole, "--socket", socketPath]
        : ["--socket", socketPath];
    child = spawn(program, args, {
      cwd: resolveRuntimeWorkingDirectory(),
      stdio: "pipe",
      windowsHide: true,
      env: {
        ...buildRuntimeDaemonEnv(process.env, options, process.execPath),
        LYRA_DAEMON_WATCHER_BIN: binaryPath,
        ...(options.hostRole === undefined ? {} : { LYRA_HOST_ROLE: options.hostRole })
      }
    });
    if (child.pid !== undefined && options.hostRole !== undefined) {
      options.onRolePid?.(options.hostRole, child.pid);
    }
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text.length > 0) {
        console.info(`[lyrad] ${text}`);
      }
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString().trim();
      if (text.length > 0) {
        const execPid = /exec pid (\d+)/.exec(text);
        if (execPid?.[1] !== undefined) {
          options.onRolePid?.("exec", Number(execPid[1]));
        }
        console.warn(`[lyrad] ${text}`);
      }
    });
    const spawned = child;
    spawned.once("exit", (code, signal) => {
      if (disposed) {
        return;
      }
      if (child === spawned) {
        child = null;
      }
      console.warn(
        `[lyra-runtime] runtime daemon exited code=${code ?? "null"} signal=${signal ?? "null"}`
      );
      if (runtimeConnected === false) {
        return;
      }
      socket = null;
      startPromise = null;
      noteRuntimeDisconnected();
      rejectAllPending("Lyra runtime daemon exited");
    });
  };

  const connectRuntimeDaemon = async (checkStale: boolean): Promise<void> => {
    const connected = await createSocket(socketPath);
    try {
      attachSocket(connected);
      let handshakePayload: unknown;
      try {
        const handshakeRequest = {
          protocolMinVersion: PROTOCOL_MIN_VERSION,
          protocolMaxVersion: PROTOCOL_MAX_VERSION,
          clientName: CLIENT_NAME,
          componentVersion: CLIENT_COMPONENT_VERSION,
          buildId: resolveClientBuildId(),
          hostApiVersion: RUNTIME_HOST_API_VERSION,
          capabilities: CLIENT_CAPABILITIES,
          dataSchemas: CLIENT_DATA_SCHEMAS,
          connectionRole,
          connectionLeaseId
        };
        assertRuntimeShellHandshake(handshakeRequest);
        handshakePayload = await sendRequestUnsafe<unknown>(HANDSHAKE_METHOD, handshakeRequest);
      } catch (error) {
        const code = isRecord(error) && typeof error.code === "string" ? error.code : undefined;
        if (code !== undefined && FATAL_HANDSHAKE_ERROR_CODES.has(code)) {
          throw new RuntimeProtocolMismatchError(
            error instanceof Error ? error.message : "Lyra runtime rejected RuntimeHelloV2"
          );
        }
        throw error;
      }
      const handshake = readRuntimeHelloV2Response(handshakePayload);
      if (
        options.expectedComponentVersion !== undefined
        && handshake.componentVersion !== options.expectedComponentVersion
      ) {
        throw new RuntimeProtocolMismatchError(
          "Lyra runtime component mismatch: "
          + `expected ${options.expectedComponentVersion}, `
          + `received ${handshake.componentVersion}`
        );
      }
      const negotiatedMinimum = Math.max(PROTOCOL_MIN_VERSION, handshake.protocolMinVersion);
      const negotiatedMaximum = Math.min(PROTOCOL_MAX_VERSION, handshake.protocolMaxVersion);
      if (
        handshake.protocolMinVersion > handshake.protocolMaxVersion
        || negotiatedMinimum > negotiatedMaximum
        || handshake.negotiatedProtocolVersion < negotiatedMinimum
        || handshake.negotiatedProtocolVersion > negotiatedMaximum
      ) {
        throw new RuntimeProtocolMismatchError(
          "Lyra runtime protocol mismatch: "
          + `client ${PROTOCOL_MIN_VERSION}-${PROTOCOL_MAX_VERSION}, `
          + `server ${handshake.protocolMinVersion}-${handshake.protocolMaxVersion}, `
          + `negotiated ${handshake.negotiatedProtocolVersion}`
        );
      }
      const coreHostApiMajor = Number.parseInt(RUNTIME_HOST_API_VERSION.split(".", 1)[0] ?? "", 10);
      const runtimeHostApiMajor = Number.parseInt(
        handshake.hostApiVersion.split(".", 1)[0] ?? "",
        10
      );
      if (
        !Number.isSafeInteger(coreHostApiMajor)
        || !Number.isSafeInteger(runtimeHostApiMajor)
        || coreHostApiMajor !== runtimeHostApiMajor
      ) {
        throw new RuntimeProtocolMismatchError(
          `Lyra Host API mismatch: Core ${RUNTIME_HOST_API_VERSION}, Runtime ${handshake.hostApiVersion}`
        );
      }
      if (
        Object.entries(REQUIRED_RUNTIME_DATA_SCHEMAS).some(
          ([schema, version]) => handshake.dataSchemas[schema] !== version
        )
      ) {
        throw new RuntimeProtocolMismatchError(
          "Lyra runtime data schema is incompatible with this Core build"
        );
      }
      if (
        handshake.connectionRole !== connectionRole
        || handshake.connectionLeaseId !== connectionLeaseId
      ) {
        throw new RuntimeProtocolMismatchError(
          "Lyra runtime returned a different connection role or lease"
        );
      }
      if (checkStale) {
        const caps = handshake.capabilities;
        const stale = !REQUIRED_CAPABILITIES.every((required) => caps.includes(required));
        if (stale) {
          throw new StaleRuntimeDaemonError("Runtime daemon is missing required capabilities.");
        }
      }
      console.info(
        `[lyra-runtime] connected ${handshake.serverName}@${handshake.componentVersion} `
        + `build=${handshake.buildId} protocol=${handshake.negotiatedProtocolVersion} `
        + `socket=${socketPath}`
      );
      connectionGeneration += 1;
      runtimeConnected = true;
      emitClientEvent(RUNTIME_CLIENT_LIFECYCLE_EVENT, {
        kind: "connected",
        generation: connectionGeneration,
        recovered: connectionGeneration > 1
      });
    } catch (error) {
      socket?.destroy();
      socket = null;
      throw error;
    }
  };

  const ensureStarted = async (): Promise<void> => {
    if (disposed) {
      throw new Error("Lyra runtime client already disposed");
    }
    if (socket !== null && socket.destroyed === false) {
      return;
    }
    if (startPromise !== null) {
      await startPromise;
      return;
    }

    startPromise = (async () => {
      let lastError: unknown = null;
      if (devRuntimeReplacesDaemon()) {
        console.info("[lyra-runtime] dev start replaces any lyrad already on this socket");
      } else {
        try {
          await connectRuntimeDaemon(true);
          return;
        } catch (error) {
          lastError = error;
          if (error instanceof RuntimeProtocolMismatchError) {
            throw error;
          }
          if (error instanceof StaleRuntimeDaemonError) {
            console.warn(
              "[lyra-runtime] stale daemon detected (missing capabilities), respawning"
            );
            if (child !== null && child.killed === false) {
              child.kill();
              child = null;
            }
            socket?.destroy();
            socket = null;
          }
        }
      }

      if (process.platform === "win32") {
        try {
          fs.unlinkSync(socketPath);
        } catch {
          // pipe/socket file may not exist or already removed
        }
      } else {
        await stopStaleUnixRuntime(socketPath);
      }
      spawnDaemon();

      for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
          await connectRuntimeDaemon(true);
          return;
        } catch (error) {
          lastError = error;
          if (error instanceof RuntimeProtocolMismatchError) {
            throw error;
          }
          socket?.destroy();
          socket = null;
          if (child === null || child.exitCode !== null || child.killed) {
            spawnDaemon();
          }
          await sleep(100);
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error(`failed to connect to runtime socket ${socketPath}`);
    })();

    try {
      await startPromise;
    } finally {
      if (socket === null || socket.destroyed) {
        startPromise = null;
      }
    }
  };

  return {
    request: async <T>(method: string, payload: unknown): Promise<T> => {
      await ensureStarted();
      return await sendRequestUnsafe<T>(method, payload);
    },
    registerRequestHandler: (method: string, handler: RuntimeRequestHandler) => {
      requestHandlers.set(method, handler);
    },
    unregisterRequestHandler: (method: string) => {
      requestHandlers.delete(method);
    },
    subscribe: (listener: RuntimeEventListener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      disposed = true;
      noteRuntimeDisconnected();
      listeners.clear();
      requestHandlers.clear();
      rejectAllPending("Lyra runtime client disposed");
      socket?.destroy();
      socket = null;
      startPromise = null;
      if (child !== null && child.killed === false) {
        child.kill();
      }
      child = null;
    }
  };
};

export const runtimeClientInternalsForTests = {
  buildRuntimeDaemonEnv,
  resolveLyraDesignNodePathEntries,
  resolveLyraDesignPlaywrightBrowsersPath,
  resolveAgentRuntimeDir,
  resolveSocketPath,
  unixRuntimeLockPath,
  collectPidsUsingPath,
  resolveRuntimeHostRequestTimeoutMs,
  readRuntimeHelloV2Response,
  PROTOCOL_MIN_VERSION,
  PROTOCOL_MAX_VERSION,
  MAX_RUNTIME_FRAME_BYTES
};
