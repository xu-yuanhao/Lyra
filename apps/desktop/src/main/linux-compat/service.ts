import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { resolveDesktopTarget } from "../platform-target";
import type {
  LinuxCompatBridge,
  LinuxCompatConfig,
  LinuxCompatPlan,
  LinuxCompatProfile,
  LinuxCompatRecoveryStatus,
  LinuxCompatRestartRequest,
  LinuxCompatRestartResponse,
  LinuxCompatStatus,
  LinuxCompatUpdateConfigRequest,
  LinuxCompatUpdateConfigResponse,
  LinuxCompatWarning,
  LinuxEnvironmentFacts,
  LinuxGpuFacts,
  LinuxGpuMode,
  LinuxGpuVendor,
  LinuxGraphicsBackend,
  LinuxPackageType,
  LinuxSessionType,
  LinuxStrategySource
} from "./types";

const CONFIG_FILE = "config.v1.json";

// Env vars Chromium reads during display/GPU initialization; correcting them
// after exec requires a relaunch, not an in-place `process.env` write.
const DISPLAY_ENV_KEYS = ["DISPLAY", "GBM_BACKEND", "__GLX_VENDOR_LIBRARY_NAME"] as const;
const RUNTIME_STATE_FILE = "runtime-state.v1.json";
const HEALTH_FILE = "launch-health.json";

const SAFE_MODE_ARGS = new Set(["--safe-mode", "--lyra-safe-mode"]);
const SOFTWARE_GPU_ARGS = new Set(["--disable-gpu", "--disable-gpu-compositing", "--lyra-software-gpu"]);
const RECOVERY_ARGS = new Set(["--lyra-linux-recovery"]);
const DEFAULT_CONFIG: LinuxCompatConfig = {
  version: 1,
  profile: "reliable",
  updatedAt: "1970-01-01T00:00:00.000Z"
};

type RuntimeState = {
  readonly version: 1;
  readonly lastFailureReason?: string;
  readonly lastFailureAt?: string;
  readonly lastFailureLaunchId?: string;
  readonly lastRecoveryAt?: string;
  readonly lastRestartReason?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const nowIso = (): string => new Date().toISOString();

const parseTruthy = (value: string | undefined): boolean => {
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const readTextFile = (filePath: string): string | null => {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
};

const readOsReleaseText = (): string | null => readTextFile("/etc/os-release");

const parseBackendValue = (value: string | undefined): LinuxGraphicsBackend | null => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "wayland") {
    return "wayland";
  }
  if (normalized === "x11") {
    return "x11";
  }
  return null;
};

const parseProfileValue = (value: unknown): LinuxCompatProfile | null => {
  if (value === "reliable" || value === "native" || value === "performance") {
    return value;
  }
  return null;
};

const parseBackendFromArgv = (argv: readonly string[]): LinuxGraphicsBackend | null => {
  for (const argument of argv) {
    if (argument.startsWith("--lyra-backend=") === false) {
      continue;
    }
    return parseBackendValue(argument.slice("--lyra-backend=".length));
  }
  return null;
};

const parseProfileFromArgv = (argv: readonly string[]): LinuxCompatProfile | null => {
  for (const argument of argv) {
    if (argument.startsWith("--lyra-linux-profile=") === false) {
      continue;
    }
    return parseProfileValue(argument.slice("--lyra-linux-profile=".length));
  }
  return null;
};

const parseGpuModeFromArgv = (argv: readonly string[]): LinuxGpuMode | null => {
  for (const argument of argv) {
    if (argument.startsWith("--lyra-gpu=") === false) {
      continue;
    }
    const value = argument.slice("--lyra-gpu=".length).trim().toLowerCase();
    if (value === "software") {
      return "software";
    }
    if (value === "hardware") {
      return "hardware";
    }
  }
  return null;
};

const hasAnyArg = (argv: readonly string[], candidates: ReadonlySet<string>): boolean =>
  argv.some((argument) => candidates.has(argument));

const toSessionType = (
  sessionTypeRaw: string | undefined,
  waylandDisplay: string | undefined,
  x11Display: string | undefined
): LinuxSessionType => {
  const normalizedSession = sessionTypeRaw?.trim().toLowerCase();
  if (normalizedSession === "wayland") {
    return "wayland";
  }
  if (normalizedSession === "x11") {
    return "x11";
  }
  if (typeof waylandDisplay === "string" && waylandDisplay.length > 0) {
    return "wayland";
  }
  if (typeof x11Display === "string" && x11Display.length > 0) {
    return "x11";
  }
  return "unknown";
};

const parseOsRelease = (
  osReleaseText: string | null
): {
  readonly distributionId: string | null;
  readonly distributionVersion: string | null;
  readonly distributionLike: readonly string[];
} => {
  if (osReleaseText === null) {
    return {
      distributionId: null,
      distributionVersion: null,
      distributionLike: [],
    };
  }
  const values = new Map<string, string>();
  for (const line of osReleaseText.split(/\r?\n/u)) {
    const match = /^([A-Z0-9_]+)=(.*)$/u.exec(line.trim());
    if (match === null) {
      continue;
    }
    const rawValue = match[2] ?? "";
    const value = rawValue.replace(/^"|"$/gu, "").replace(/\\"/gu, "\"").trim();
    values.set(match[1] ?? "", value);
  }
  const distributionLike = (values.get("ID_LIKE") ?? "")
    .split(/\s+/u)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
  return {
    distributionId: values.get("ID")?.toLowerCase() ?? null,
    distributionVersion: values.get("VERSION_ID") ?? null,
    distributionLike,
  };
};

const normalizeDesktop = (desktopRaw: string): string => {
  const normalized = desktopRaw.trim().toLowerCase();
  if (normalized.length === 0 || normalized === "unknown") {
    return "unknown";
  }
  if (normalized.includes("gnome")) return "gnome";
  if (normalized.includes("kde") || normalized.includes("plasma")) return "kde";
  if (normalized.includes("hyprland")) return "hyprland";
  if (normalized.includes("sway")) return "sway";
  if (normalized.includes("xfce")) return "xfce";
  if (normalized.includes("cinnamon")) return "cinnamon";
  if (normalized.includes("mate")) return "mate";
  if (normalized.includes("lxqt")) return "lxqt";
  if (normalized.includes("cosmic")) return "cosmic";
  return normalized.split(/[:;]/u)[0] ?? normalized;
};

const detectPackageType = (env: NodeJS.ProcessEnv): LinuxPackageType => {
  const explicit = env.LYRA_LINUX_PACKAGE_TYPE?.trim().toLowerCase();
  if (
    explicit === "appimage" ||
    explicit === "deb" ||
    explicit === "rpm" ||
    explicit === "tar" ||
    explicit === "snap" ||
    explicit === "flatpak" ||
    explicit === "pacman" ||
    explicit === "dev"
  ) {
    return explicit;
  }
  if (typeof env.APPIMAGE === "string" && env.APPIMAGE.length > 0) return "appimage";
  if (typeof env.SNAP === "string" && env.SNAP.length > 0) return "snap";
  if (typeof env.FLATPAK_ID === "string" && env.FLATPAK_ID.length > 0) return "flatpak";
  if (typeof env.ELECTRON_RENDERER_URL === "string" && env.ELECTRON_RENDERER_URL.length > 0) return "dev";
  return "unknown";
};

const detectContainer = (env: NodeJS.ProcessEnv): boolean =>
  typeof env.container === "string" ||
  typeof env.CONTAINER === "string" ||
  existsSync("/.dockerenv");

const pciVendorIdToGpu = (vendorId: string | undefined): LinuxGpuVendor | null => {
  if (vendorId === "0x10de") {
    return "nvidia";
  }
  if (vendorId === "0x1002" || vendorId === "0x1022") {
    return "amd";
  }
  if (vendorId === "0x8086") {
    return "intel";
  }
  if (vendorId === "0x1af4" || vendorId === "0x1b36") {
    return "virtio";
  }
  return null;
};

export const pickCompositorGpu = (
  vendors: readonly LinuxGpuVendor[]
): { readonly vendor: LinuxGpuVendor; readonly isHybrid: boolean } => {
  const hasNvidia = vendors.includes("nvidia");
  const hasIntel = vendors.includes("intel");
  const hasAmd = vendors.includes("amd");
  const isHybrid = hasNvidia && (hasIntel || hasAmd);
  if (hasIntel) {
    return { vendor: "intel", isHybrid };
  }
  if (hasAmd) {
    return { vendor: "amd", isHybrid };
  }
  if (hasNvidia) {
    return { vendor: "nvidia", isHybrid: false };
  }
  if (vendors.includes("virtio")) {
    return { vendor: "virtio", isHybrid: false };
  }
  if (vendors.includes("software")) {
    return { vendor: "software", isHybrid: false };
  }
  return { vendor: "unknown", isHybrid: false };
};

export const inferX11Display = (
  envDisplay: string | undefined,
  socketNames: readonly string[]
): string | null => {
  const trimmed = envDisplay?.trim();
  if (typeof trimmed === "string" && trimmed.length > 0) {
    return trimmed;
  }
  const socket = socketNames.find((name) => /^X\d+$/u.test(name));
  return socket === undefined ? null : `:${socket.slice(1)}`;
};

const readX11Sockets = (): readonly string[] => {
  try {
    return readdirSync("/tmp/.X11-unix");
  } catch {
    return [];
  }
};

const readGpuTopology = (): {
  readonly vendors: readonly LinuxGpuVendor[];
  readonly preferredRenderNode: string | null;
} => {
  const vendors = new Set<LinuxGpuVendor>();
  const renderNodes: { readonly vendor: LinuxGpuVendor; readonly node: string }[] = [];
  let entries: readonly string[] = [];
  try {
    entries = readdirSync("/sys/class/drm");
  } catch {
    return { vendors: [], preferredRenderNode: null };
  }

  for (const entry of entries) {
    const vendor = pciVendorIdToGpu(
      readTextFile(path.join("/sys/class/drm", entry, "device", "vendor"))
        ?.trim()
        .toLowerCase()
    );
    if (vendor === null) {
      continue;
    }
    if (/^card\d+$/u.test(entry)) {
      vendors.add(vendor);
    }
    if (/^renderD\d+$/u.test(entry)) {
      vendors.add(vendor);
      renderNodes.push({ vendor, node: `/dev/dri/${entry}` });
    }
  }

  const picked = pickCompositorGpu([...vendors]);
  const preferredRenderNode =
    renderNodes.find((item) => item.vendor === picked.vendor)?.node
    ?? renderNodes[0]?.node
    ?? null;
  return {
    vendors: [...vendors],
    preferredRenderNode
  };
};

const gpuVendorList = (gpu: LinuxGpuFacts): readonly LinuxGpuVendor[] =>
  gpu.vendors !== undefined && gpu.vendors.length > 0 ? gpu.vendors : [gpu.vendor];

const gpuHasNvidia = (gpu: LinuxGpuFacts): boolean =>
  gpuVendorList(gpu).includes("nvidia") || gpu.vendor === "nvidia";

const isBenignGpuProbeError = (message: string): boolean =>
  message.includes("GPU access is disabled") || message.includes("GPU access not allowed");

const detectGpuFacts = (env: NodeJS.ProcessEnv): LinuxGpuFacts => {
  const topology = readGpuTopology();
  const driverHint =
    parseTruthy(env.LIBGL_ALWAYS_SOFTWARE) || parseTruthy(env.LLVMPIPE)
      ? "software"
      : typeof env.NVIDIA_VISIBLE_DEVICES === "string" && env.NVIDIA_VISIBLE_DEVICES.length > 0
        ? "nvidia"
        : typeof env.__NV_PRIME_RENDER_OFFLOAD === "string" && env.__NV_PRIME_RENDER_OFFLOAD.length > 0
          ? "nvidia-prime"
          : typeof env.DRI_PRIME === "string" && env.DRI_PRIME.length > 0
            ? "dri-prime"
            : null;
  const vendors: LinuxGpuVendor[] =
    driverHint === "software"
      ? ["software"]
      : topology.vendors.length > 0
        ? [...topology.vendors]
        : driverHint?.startsWith("nvidia") === true
          ? ["nvidia"]
          : [];
  const picked = pickCompositorGpu(vendors);
  return {
    vendor: picked.vendor,
    deviceCount: vendors.length,
    hasDiscreteGpu: vendors.includes("nvidia") || vendors.includes("amd"),
    driverHint,
    hardwareAccelerationEnabled: null,
    featureStatus: null,
    vendors,
    isHybrid: picked.isHybrid,
    preferredRenderNode: picked.vendor === "software" ? null : topology.preferredRenderNode
  };
};

const withGpuSnapshot = (
  facts: LinuxEnvironmentFacts,
  gpu: Partial<Pick<LinuxGpuFacts, "featureStatus" | "hardwareAccelerationEnabled">>
): LinuxEnvironmentFacts => ({
  ...facts,
  gpu: {
    ...facts.gpu,
    ...gpu
  }
});

const detectEnvironmentFacts = (input: {
  readonly platform: NodeJS.Platform;
  readonly arch: NodeJS.Architecture;
  readonly env: NodeJS.ProcessEnv;
  readonly osReleaseText: string | null;
  readonly kernelRelease: string;
  readonly report?: Parameters<typeof resolveDesktopTarget>[0]["report"];
  readonly gpu?: LinuxGpuFacts;
  readonly x11Sockets?: readonly string[];
}): LinuxEnvironmentFacts => {
  const desktopRaw = input.env.XDG_CURRENT_DESKTOP ?? input.env.DESKTOP_SESSION ?? "unknown";
  const desktop = normalizeDesktop(desktopRaw);
  const waylandDisplay = input.env.WAYLAND_DISPLAY?.trim();
  const x11Display = inferX11Display(
    input.env.DISPLAY,
    input.x11Sockets ?? readX11Sockets()
  );
  const x11DisplaySource =
    x11Display === null
      ? null
      : (input.env.DISPLAY?.trim().length ?? 0) > 0
        ? "env"
        : "socket-scan";
  const osRelease = parseOsRelease(input.osReleaseText);
  const target = resolveDesktopTarget({
    platform: input.platform,
    arch: input.arch,
    env: input.env,
    ...(input.report === undefined ? {} : { report: input.report })
  });
  return {
    sessionType: toSessionType(input.env.XDG_SESSION_TYPE, waylandDisplay, x11Display ?? undefined),
    architecture: input.arch,
    kernelRelease: input.kernelRelease,
    libc: target.libc,
    desktop,
    desktopRaw: desktopRaw.trim().length > 0 ? desktopRaw : "unknown",
    distributionId: osRelease.distributionId,
    distributionVersion: osRelease.distributionVersion,
    distributionLike: osRelease.distributionLike,
    packageType: detectPackageType(input.env),
    waylandDisplay: waylandDisplay !== undefined && waylandDisplay.length > 0 ? waylandDisplay : null,
    x11Display,
    x11DisplaySource,
    isContainer: detectContainer(input.env),
    isRoot: typeof process.getuid === "function" ? process.getuid() === 0 : false,
    gpu: input.gpu ?? detectGpuFacts(input.env)
  };
};

const readJsonFile = <T>(filePath: string, normalize: (value: unknown) => T | null): T | null => {
  const raw = readTextFile(filePath);
  if (raw === null) {
    return null;
  }
  try {
    return normalize(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

const writeJsonFile = (targetPath: string, payload: unknown): void => {
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf-8");
};

const normalizeConfig = (value: unknown): LinuxCompatConfig | null => {
  if (isRecord(value) === false || value.version !== 1) {
    return null;
  }
  const profile = parseProfileValue(value.profile);
  if (profile === null) {
    return null;
  }
  return {
    version: 1,
    profile,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : DEFAULT_CONFIG.updatedAt
  };
};

const normalizeRuntimeState = (value: unknown): RuntimeState | null => {
  if (isRecord(value) === false || value.version !== 1) {
    return null;
  }
  return {
    version: 1,
    ...(typeof value.lastFailureReason === "string" ? { lastFailureReason: value.lastFailureReason } : {}),
    ...(typeof value.lastFailureAt === "string" ? { lastFailureAt: value.lastFailureAt } : {}),
    ...(typeof value.lastFailureLaunchId === "string" ? { lastFailureLaunchId: value.lastFailureLaunchId } : {}),
    ...(typeof value.lastRecoveryAt === "string" ? { lastRecoveryAt: value.lastRecoveryAt } : {}),
    ...(typeof value.lastRestartReason === "string" ? { lastRestartReason: value.lastRestartReason } : {})
  };
};

const resolveStorageFile = (storageRoot: string | undefined, fileName: string): string | null =>
  storageRoot === undefined ? null : path.join(storageRoot, fileName);

export const readLinuxCompatConfig = (storageRoot: string | undefined): LinuxCompatConfig => {
  const configPath = resolveStorageFile(storageRoot, CONFIG_FILE);
  if (configPath === null) {
    return DEFAULT_CONFIG;
  }
  return readJsonFile(configPath, normalizeConfig) ?? DEFAULT_CONFIG;
};

const writeLinuxCompatConfig = (
  storageRoot: string,
  profile: LinuxCompatProfile
): LinuxCompatConfig => {
  const config: LinuxCompatConfig = {
    version: 1,
    profile,
    updatedAt: nowIso()
  };
  writeJsonFile(path.join(storageRoot, CONFIG_FILE), config);
  return config;
};

const readRuntimeState = (storageRoot: string | undefined): RuntimeState => {
  const statePath = resolveStorageFile(storageRoot, RUNTIME_STATE_FILE);
  if (statePath === null) {
    return { version: 1 };
  }
  return readJsonFile(statePath, normalizeRuntimeState) ?? { version: 1 };
};

const writeRuntimeState = (storageRoot: string | undefined, state: RuntimeState): void => {
  if (storageRoot === undefined) {
    return;
  }
  writeJsonFile(path.join(storageRoot, RUNTIME_STATE_FILE), state);
};

const resolveRecoveryStatus = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  runtimeState: RuntimeState
): LinuxCompatRecoveryStatus => {
  const launchId = env.LYRA_LINUX_LAUNCH_ID?.trim() || randomUUID();
  const active =
    parseTruthy(env.LYRA_LINUX_RECOVERY) ||
    parseTruthy(env.LYRA_LINUX_AUTO_RESTART) ||
    hasAnyArg(argv, RECOVERY_ARGS);
  return {
    active,
    autoRestarted: parseTruthy(env.LYRA_LINUX_AUTO_RESTART),
    launchId,
    previousFailureReason: runtimeState.lastFailureReason ?? null
  };
};

const shouldEnableSafeMode = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  recovery: LinuxCompatRecoveryStatus
): boolean =>
  recovery.active || hasAnyArg(argv, SAFE_MODE_ARGS) || parseTruthy(env.LYRA_SAFE_MODE);

const resolveProfile = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  config: LinuxCompatConfig,
  recovery: LinuxCompatRecoveryStatus
): { readonly profile: LinuxCompatProfile; readonly source: LinuxStrategySource } => {
  if (recovery.active) {
    return { profile: "reliable", source: "recovery" };
  }
  const cliValue = parseProfileFromArgv(argv);
  if (cliValue !== null) {
    return { profile: cliValue, source: "cli" };
  }
  const envValue = parseProfileValue(env.LYRA_LINUX_PROFILE);
  if (envValue !== null) {
    return { profile: envValue, source: "env" };
  }
  return { profile: config.profile, source: "config" };
};

const recommendedProfileForFacts = (facts: LinuxEnvironmentFacts): LinuxCompatProfile => {
  if (facts.sessionType === "unknown" || facts.desktop === "unknown" || facts.gpu.vendor === "unknown") {
    return "reliable";
  }
  if (facts.sessionType === "wayland" && facts.gpu.vendor !== "nvidia") {
    return "native";
  }
  return "reliable";
};

const resolveBackend = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  facts: LinuxEnvironmentFacts,
  profile: LinuxCompatProfile,
  recovery: LinuxCompatRecoveryStatus
): { readonly backend: LinuxGraphicsBackend; readonly source: LinuxStrategySource } => {
  const cliValue = parseBackendFromArgv(argv);
  if (cliValue !== null) {
    return { backend: cliValue, source: "cli" };
  }
  const envValue = parseBackendValue(env.LYRA_LINUX_BACKEND);
  if (envValue !== null) {
    return { backend: envValue, source: "env" };
  }
  if (recovery.active && facts.x11Display !== null) {
    return { backend: "x11", source: "recovery" };
  }
  if (profile === "reliable") {
    if (facts.x11Display !== null && facts.x11DisplaySource === "socket-scan") {
      // A scanned X11 socket is not proof of a usable X11 session: under a
      // Wayland compositor it is usually XWayland, which the browser process
      // launched for Wayland cannot reliably attach to. Prefer the session the
      // app was actually launched into and only fall back to the scanned
      // display when no Wayland session exists.
      if (facts.waylandDisplay !== null) {
        return { backend: "wayland", source: "auto" };
      }
      return {
        backend: "x11",
        source: recovery.previousFailureReason === null ? "auto" : "history"
      };
    }
    if (facts.x11Display !== null) {
      return {
        backend: "x11",
        source: recovery.previousFailureReason === null ? "auto" : "history"
      };
    }
    if (facts.waylandDisplay !== null) {
      return { backend: "wayland", source: "auto" };
    }
    return { backend: "x11", source: "auto" };
  }
  if (profile === "native") {
    if (facts.sessionType === "wayland" || facts.waylandDisplay !== null) {
      return { backend: "wayland", source: "auto" };
    }
    return { backend: "x11", source: "auto" };
  }
  if (facts.sessionType === "wayland" || facts.waylandDisplay !== null) {
    return { backend: "wayland", source: "auto" };
  }
  return { backend: "x11", source: "auto" };
};

const shouldUseSoftwareGpuByDefault = (
  facts: LinuxEnvironmentFacts,
  profile: LinuxCompatProfile,
  backend: LinuxGraphicsBackend,
  safeMode: boolean,
  recovery: LinuxCompatRecoveryStatus
): boolean => {
  if (safeMode || recovery.active) {
    return true;
  }
  if (facts.gpu.vendor === "software") {
    return true;
  }
  if (profile === "performance") {
    return false;
  }
  if (profile === "native") {
    return false;
  }
  if (facts.gpu.vendor === "virtio" || facts.gpu.vendor === "unknown") {
    return true;
  }
  return backend === "wayland" && facts.gpu.vendor === "nvidia";
};

const resolveGpuMode = (
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  facts: LinuxEnvironmentFacts,
  profile: LinuxCompatProfile,
  backend: LinuxGraphicsBackend,
  safeMode: boolean,
  recovery: LinuxCompatRecoveryStatus
): { readonly gpuMode: LinuxGpuMode; readonly source: LinuxStrategySource } => {
  const cliValue = parseGpuModeFromArgv(argv);
  if (cliValue !== null) {
    return { gpuMode: cliValue, source: "cli" };
  }
  if (hasAnyArg(argv, SOFTWARE_GPU_ARGS)) {
    return { gpuMode: "software", source: "cli" };
  }
  if (parseTruthy(env.LYRA_SOFTWARE_GPU)) {
    return { gpuMode: "software", source: "env" };
  }
  if (shouldUseSoftwareGpuByDefault(facts, profile, backend, safeMode, recovery)) {
    return {
      gpuMode: "software",
      source: recovery.active ? "recovery" : "auto"
    };
  }
  return { gpuMode: "hardware", source: "auto" };
};

const resolveWarnings = (
  facts: LinuxEnvironmentFacts,
  backend: LinuxGraphicsBackend,
  gpuMode: LinuxGpuMode,
  recovery: LinuxCompatRecoveryStatus
): readonly LinuxCompatWarning[] => {
  const warnings: LinuxCompatWarning[] = [];
  if (recovery.active) {
    warnings.push({
      code: "recovery-mode",
      message: "Lyra is running in Linux recovery mode after a failed launch or explicit recovery request."
    });
  }
  if (recovery.previousFailureReason !== null) {
    warnings.push({
      code: "previous-launch-failed",
      message: `Previous Linux launch failure: ${recovery.previousFailureReason}`
    });
  }
  if (facts.waylandDisplay !== null && facts.x11Display !== null) {
    warnings.push({
      code: "both-display-servers-detected",
      message: "Detected both WAYLAND_DISPLAY and DISPLAY. Lyra selected one backend to avoid unstable rendering."
    });
  }
  if (facts.waylandDisplay === null && facts.x11Display === null) {
    warnings.push({
      code: "missing-display-server",
      message: "No Wayland or X11 display variable was detected before startup."
    });
  }
  if (facts.sessionType === "unknown") {
    warnings.push({
      code: "unknown-session",
      message: "Could not determine Linux session type from environment variables."
    });
  }
  if (
    (facts.sessionType === "wayland" && backend === "x11")
    || (facts.sessionType === "x11" && backend === "wayland")
  ) {
    warnings.push({
      code: "session-env-mismatch",
      message: "Effective graphics backend differs from session type due to explicit override or safety fallback."
    });
  }
  if (facts.desktop === "unknown") {
    warnings.push({
      code: "unknown-desktop",
      message: "Desktop environment could not be identified; running in generic compatibility mode."
    });
  }
  if (gpuMode === "software" && facts.gpu.vendor !== "software") {
    warnings.push({
      code: "gpu-compat-fallback",
      message: "Lyra selected software rendering for Linux startup stability."
    });
  }
  return warnings;
};

const toAppliedEnv = (
  recovery: LinuxCompatRecoveryStatus,
  backend: LinuxGraphicsBackend,
  facts: LinuxEnvironmentFacts,
  env: NodeJS.ProcessEnv,
  gpuMode: LinuxGpuMode
): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {
    LYRA_LINUX_LAUNCH_ID: recovery.launchId,
    LYRA_LINUX_PACKAGE_TYPE: facts.packageType
  };
  if (recovery.active) {
    result.LYRA_LINUX_RECOVERY = "1";
  }
  if (
    backend === "x11"
    && facts.x11Display !== null
    && (env.DISPLAY === undefined || env.DISPLAY.trim().length === 0)
  ) {
    // Only meaningful for the x11 backend: injecting DISPLAY under Wayland
    // would flip the detected display sources on a correction relaunch.
    result.DISPLAY = facts.x11Display;
  }
  if (
    gpuMode === "hardware"
    && facts.gpu.vendor === "nvidia"
    && facts.gpu.isHybrid !== true
  ) {
    result.GBM_BACKEND = "nvidia-drm";
    result.__GLX_VENDOR_LIBRARY_NAME = "nvidia";
  }
  return result;
};

const VALUELESS_SWITCHES = new Set([
  "disable-gpu",
  "disable-gpu-compositing",
  "disable-gpu-sandbox",
  "enable-wayland-ime"
]);

const toAppliedSwitches = (
  backend: LinuxGraphicsBackend,
  gpuMode: LinuxGpuMode,
  hasExplicitOzoneOverride: boolean,
  facts: LinuxEnvironmentFacts
): Readonly<Record<string, string>> => {
  const result: Record<string, string> = {};
  const enabledFeatures = [
    "OverlayScrollbar",
    "OverlayScrollbarFlashAfterAnyScrollUpdate",
    "OverlayScrollbarFlashWhenMouseEnter"
  ];

  if (hasExplicitOzoneOverride === false) {
    result["ozone-platform"] = backend;
    if (backend === "wayland") {
      enabledFeatures.unshift("UseOzonePlatform", "WaylandWindowDecorations");
      result["enable-wayland-ime"] = "true";
    }
  }
  result["enable-features"] = enabledFeatures.join(",");

  if (gpuMode === "software") {
    result["disable-gpu"] = "true";
    result["disable-gpu-compositing"] = "true";
  } else {
    const renderNode = facts.gpu.preferredRenderNode;
    if (typeof renderNode === "string" && renderNode.length > 0) {
      result["render-node-override"] = renderNode;
    }
    if (gpuHasNvidia(facts.gpu)) {
      result["disable-gpu-sandbox"] = "true";
    }
  }
  return result;
};

export const resolveLinuxCompatPlan = (input: {
  readonly platform: NodeJS.Platform;
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly arch?: NodeJS.Architecture;
  readonly config?: LinuxCompatConfig;
  readonly runtimeState?: RuntimeState;
  readonly osReleaseText?: string | null;
  readonly kernelRelease?: string;
  readonly report?: Parameters<typeof resolveDesktopTarget>[0]["report"];
  readonly gpu?: LinuxGpuFacts;
  readonly x11Sockets?: readonly string[];
}): LinuxCompatPlan => {
  const arch = input.arch ?? process.arch;
  const config = input.config ?? DEFAULT_CONFIG;
  const runtimeState = input.runtimeState ?? { version: 1 };
  const facts = detectEnvironmentFacts({
    platform: input.platform,
    arch,
    env: input.env,
    osReleaseText: input.platform === "linux" ? input.osReleaseText ?? readOsReleaseText() : null,
    kernelRelease: input.kernelRelease ?? os.release(),
    report: input.report,
    ...(input.gpu === undefined ? {} : { gpu: input.gpu }),
    ...(input.x11Sockets === undefined ? {} : { x11Sockets: input.x11Sockets })
  });
  const recovery = resolveRecoveryStatus(input.argv, input.env, runtimeState);

  if (input.platform !== "linux") {
    return {
      enabled: false,
      profile: "reliable",
      recommendedProfile: "reliable",
      safeMode: false,
      backend: "x11",
      gpuMode: "hardware",
      profileSource: "auto",
      backendSource: "auto",
      gpuSource: "auto",
      warnings: [],
      notes: ["linux-compat is disabled on non-linux platforms"],
      appliedEnv: {},
      appliedSwitches: {},
      disableHardwareAcceleration: false,
      facts,
      recovery
    };
  }

  const profileResolved = resolveProfile(input.argv, input.env, config, recovery);
  const safeMode = shouldEnableSafeMode(input.argv, input.env, recovery);
  const backendResolved = resolveBackend(
    input.argv,
    input.env,
    facts,
    profileResolved.profile,
    recovery
  );
  const gpuResolved = resolveGpuMode(
    input.argv,
    input.env,
    facts,
    profileResolved.profile,
    backendResolved.backend,
    safeMode,
    recovery
  );
  const hasExplicitOzoneOverride = input.argv.some(
    (argument) =>
      argument.startsWith("--ozone-platform")
      || argument.startsWith("--ozone-platform-hint")
  );
  const warnings = resolveWarnings(facts, backendResolved.backend, gpuResolved.gpuMode, recovery);
  const notes: string[] = [];
  if (safeMode) {
    notes.push("safe mode enabled: forcing software rendering for startup stability");
  }
  if (hasExplicitOzoneOverride) {
    notes.push("detected explicit ozone override; linux-compat skipped automatic ozone switches");
  }
  if (facts.isRoot) {
    notes.push("running as root: runtime characteristics may differ from normal user sessions");
  }
  if (facts.isContainer) {
    notes.push("containerized runtime detected; desktop integration may depend on host portals");
  }
  if (
    backendResolved.backend === "wayland"
    && facts.x11Display !== null
    && facts.x11DisplaySource === "socket-scan"
  ) {
    notes.push(
      "selected the Wayland backend; the detected X11 display comes from a socket scan (likely XWayland), not from the launch environment"
    );
  }

  return {
    enabled: true,
    profile: profileResolved.profile,
    recommendedProfile: recommendedProfileForFacts(facts),
    safeMode,
    backend: backendResolved.backend,
    gpuMode: gpuResolved.gpuMode,
    profileSource: profileResolved.source,
    backendSource: backendResolved.source,
    gpuSource: gpuResolved.source,
    warnings,
    notes,
    appliedEnv: toAppliedEnv(recovery, backendResolved.backend, facts, input.env, gpuResolved.gpuMode),
    appliedSwitches: toAppliedSwitches(
      backendResolved.backend,
      gpuResolved.gpuMode,
      hasExplicitOzoneOverride,
      facts
    ),
    disableHardwareAcceleration: gpuResolved.gpuMode === "software",
    facts,
    recovery
  };
};

const applySwitches = (app: Electron.App, switches: Readonly<Record<string, string>>): void => {
  for (const [name, value] of Object.entries(switches)) {
    if (VALUELESS_SWITCHES.has(name)) {
      app.commandLine.appendSwitch(name);
      continue;
    }
    app.commandLine.appendSwitch(name, value);
  }
};

const buildStatus = (
  platform: NodeJS.Platform,
  plan: LinuxCompatPlan
): LinuxCompatStatus => ({
  platform,
  enabled: plan.enabled,
  profile: plan.profile,
  recommendedProfile: plan.recommendedProfile,
  safeMode: plan.safeMode,
  backend: plan.backend,
  gpuMode: plan.gpuMode,
  profileSource: plan.profileSource,
  backendSource: plan.backendSource,
  gpuSource: plan.gpuSource,
  warnings: plan.warnings,
  notes: plan.notes,
  appliedEnv: plan.appliedEnv,
  appliedSwitches: plan.appliedSwitches,
  facts: plan.facts,
  recovery: plan.recovery,
  generatedAt: nowIso()
});

const isRendererFailure = (details: Electron.RenderProcessGoneDetails): boolean =>
  details.reason === "crashed" ||
  details.reason === "oom" ||
  details.reason === "launch-failed" ||
  details.reason === "integrity-failure";

const isChildFailure = (details: Electron.Details): boolean =>
  details.type === "GPU" && (
    details.reason === "crashed" ||
    details.reason === "oom" ||
    details.reason === "launch-failed" ||
    details.reason === "integrity-failure"
  );

const createRelaunchArgs = (
  argv: readonly string[],
  reason: string | undefined,
  recovery: boolean
): string[] => {
  const filtered = argv
    .slice(1)
    .filter((argument) =>
      argument !== "--lyra-linux-recovery" &&
      argument.startsWith("--lyra-linux-profile=") === false &&
      argument.startsWith("--lyra-linux-restart-reason=") === false
    );
  return [
    ...filtered,
    ...(recovery ? ["--lyra-linux-recovery"] : []),
    ...(reason === undefined ? [] : [`--lyra-linux-restart-reason=${encodeURIComponent(reason)}`])
  ];
};

export const createLinuxCompatBridge = (input: {
  readonly platform: NodeJS.Platform;
  readonly argv: readonly string[];
  readonly env: NodeJS.ProcessEnv;
  readonly storageRoot?: string;
  readonly x11Sockets?: readonly string[];
}): LinuxCompatBridge => {
  let config = readLinuxCompatConfig(input.storageRoot);
  const runtimeState = readRuntimeState(input.storageRoot);
  // Snapshot before anything mutates `process.env`; the correction relaunch
  // must compare against the environment the process actually started with.
  const launchEnv = { ...input.env };
  const plan = resolveLinuxCompatPlan({
    platform: input.platform,
    argv: input.argv,
    env: input.env,
    config,
    runtimeState,
    ...(input.x11Sockets === undefined ? {} : { x11Sockets: input.x11Sockets })
  });
  let status = buildStatus(input.platform, plan);

  const refreshStatusFacts = (facts: LinuxEnvironmentFacts): void => {
    status = {
      ...status,
      facts,
      generatedAt: nowIso()
    };
  };

  const recordFailure = (reason: string): void => {
    if (plan.enabled === false) {
      return;
    }
    writeRuntimeState(input.storageRoot, {
      ...readRuntimeState(input.storageRoot),
      version: 1,
      lastFailureReason: reason,
      lastFailureAt: nowIso(),
      lastFailureLaunchId: plan.recovery.launchId
    });
  };

  return {
    get status() {
      return status;
    },
    readConfig: () => config,
    updateConfig: (request: LinuxCompatUpdateConfigRequest): LinuxCompatUpdateConfigResponse => {
      if (input.storageRoot === undefined) {
        return {
          ok: false,
          error: "linux-compat storage root is unavailable"
        };
      }
      const profile = parseProfileValue(request.profile);
      if (profile === null) {
        return {
          ok: false,
          error: `unsupported linux compatibility profile: ${String(request.profile)}`
        };
      }
      try {
        config = writeLinuxCompatConfig(input.storageRoot, profile);
        return {
          ok: true,
          config
        };
      } catch (error: unknown) {
        return {
          ok: false,
          error: String(error)
        };
      }
    },
    applyToProcessEnv: () => {
      if (plan.enabled === false) {
        return;
      }
      for (const [name, value] of Object.entries(plan.appliedEnv)) {
        process.env[name] = value;
      }
    },
    applyToElectronApp: (app: Electron.App) => {
      if (plan.enabled === false) {
        return;
      }
      applySwitches(app, plan.appliedSwitches);
      if (plan.disableHardwareAcceleration) {
        app.disableHardwareAcceleration();
      }
    },
    requestEnvCorrectionRelaunch: (app: Electron.App): LinuxCompatRestartResponse => {
      try {
        if (plan.enabled === false) {
          return { ok: true };
        }
        // Env written via `process.env` after exec is not reliably visible to
        // Chromium's display initialization, so a corrected DISPLAY must reach
        // a fresh process instead of being patched in place.
        const correctionKeys = DISPLAY_ENV_KEYS.filter(
          (name) => name in plan.appliedEnv && launchEnv[name] !== plan.appliedEnv[name]
        );
        if (correctionKeys.length === 0) {
          return { ok: true };
        }
        if (parseTruthy(input.env.LYRA_LINUX_ENV_CORRECTION)) {
          return {
            ok: false,
            error: `display environment correction was already attempted this launch chain (remaining: ${correctionKeys.join(", ")})`
          };
        }
        for (const name of correctionKeys) {
          process.env[name] = plan.appliedEnv[name];
        }
        process.env.LYRA_LINUX_ENV_CORRECTION = "1";
        if (input.storageRoot !== undefined) {
          writeRuntimeState(input.storageRoot, {
            ...readRuntimeState(input.storageRoot),
            version: 1,
            lastRestartReason: "display-env-correction"
          });
        }
        app.relaunch({ args: createRelaunchArgs(input.argv, "display-env-correction", false) });
        app.exit(0);
        return { ok: true };
      } catch (error: unknown) {
        return { ok: false, error: String(error) };
      }
    },
    markWindowReady: () => {
      if (plan.enabled === false || input.storageRoot === undefined) {
        return;
      }
      writeJsonFile(path.join(input.storageRoot, HEALTH_FILE), {
        version: 1,
        launchId: plan.recovery.launchId,
        readyAt: nowIso(),
        profile: status.profile,
        backend: status.backend,
        gpuMode: status.gpuMode
      });
      const previous = readRuntimeState(input.storageRoot);
      writeRuntimeState(input.storageRoot, {
        version: 1,
        ...(typeof previous.lastRestartReason === "string"
          ? { lastRestartReason: previous.lastRestartReason }
          : {}),
        ...(plan.recovery.active
          ? { lastRecoveryAt: nowIso() }
          : typeof previous.lastRecoveryAt === "string"
            ? { lastRecoveryAt: previous.lastRecoveryAt }
            : {})
      });
      status = {
        ...status,
        warnings: status.warnings.filter((warning) => warning.code !== "previous-launch-failed"),
        recovery: {
          ...status.recovery,
          previousFailureReason: null
        },
        generatedAt: nowIso()
      };
    },
    recordRendererGone: (details: Electron.RenderProcessGoneDetails) => {
      if (isRendererFailure(details)) {
        recordFailure(`renderer-${details.reason}-${details.exitCode}`);
      }
    },
    recordChildProcessGone: (details: Electron.Details) => {
      if (isChildFailure(details)) {
        recordFailure(`gpu-${details.reason}-${details.exitCode}`);
      }
    },
    captureGpuSnapshot: async (app: Electron.App) => {
      if (plan.enabled === false) {
        return;
      }
      try {
        const featureStatus = app.getGPUFeatureStatus() as unknown as Readonly<Record<string, unknown>>;
        refreshStatusFacts(withGpuSnapshot(status.facts, {
          featureStatus,
          hardwareAccelerationEnabled: app.isHardwareAccelerationEnabled()
        }));
        await app.getGPUInfo("basic");
      } catch (error: unknown) {
        const message = String(error);
        if (plan.gpuMode === "software" || isBenignGpuProbeError(message)) {
          return;
        }
        recordFailure(`gpu-info-${message}`);
      }
    },
    requestRestart: (app: Electron.App, request?: LinuxCompatRestartRequest): LinuxCompatRestartResponse => {
      try {
        const recovery = request?.recovery === true;
        if (recovery) {
          process.env.LYRA_LINUX_RECOVERY = "1";
          process.env.LYRA_LINUX_AUTO_RESTART = "1";
        } else {
          delete process.env.LYRA_LINUX_RECOVERY;
          delete process.env.LYRA_LINUX_AUTO_RESTART;
        }
        // A requested restart starts a new launch chain: allow a future
        // display env correction instead of inheriting the stale marker.
        delete process.env.LYRA_LINUX_ENV_CORRECTION;
        if (input.storageRoot !== undefined) {
          writeRuntimeState(input.storageRoot, {
            ...readRuntimeState(input.storageRoot),
            version: 1,
            lastRestartReason: request?.reason ?? "linux-compat"
          });
        }
        app.relaunch({
          args: createRelaunchArgs(input.argv, request?.reason, recovery)
        });
        app.exit(0);
        return { ok: true };
      } catch (error: unknown) {
        return {
          ok: false,
          error: String(error)
        };
      }
    },
    persistStatusSnapshot: (storageRoot: string) => {
      const targetPath = path.join(storageRoot, "last-status.json");
      writeJsonFile(targetPath, status);
    }
  };
};
