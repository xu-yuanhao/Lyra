export type LinuxGraphicsBackend = "wayland" | "x11";

export type LinuxGpuMode = "hardware" | "software";

export type LinuxCompatProfile = "reliable" | "native" | "performance";

export type LinuxPackageType =
  | "appimage"
  | "deb"
  | "dev"
  | "flatpak"
  | "pacman"
  | "rpm"
  | "snap"
  | "tar"
  | "unknown";

export type LinuxGpuVendor =
  | "amd"
  | "intel"
  | "nvidia"
  | "software"
  | "virtio"
  | "unknown";

export type LinuxStrategySource = "auto" | "cli" | "config" | "env" | "history" | "recovery";

export type LinuxSessionType = "wayland" | "x11" | "unknown";

export type LinuxCompatWarning = {
  readonly code:
    | "both-display-servers-detected"
    | "gpu-compat-fallback"
    | "missing-display-server"
    | "previous-launch-failed"
    | "recovery-mode"
    | "session-env-mismatch"
    | "unknown-session"
    | "unknown-desktop";
  readonly message: string;
};

export type LinuxCompatConfig = {
  readonly version: 1;
  readonly profile: LinuxCompatProfile;
  readonly updatedAt: string;
};

export type LinuxGpuFacts = {
  readonly vendor: LinuxGpuVendor;
  readonly deviceCount: number;
  readonly hasDiscreteGpu: boolean;
  readonly driverHint: string | null;
  readonly hardwareAccelerationEnabled: boolean | null;
  readonly featureStatus: Readonly<Record<string, unknown>> | null;
  readonly vendors?: readonly LinuxGpuVendor[];
  readonly isHybrid?: boolean;
  readonly preferredRenderNode?: string | null;
};

export type LinuxEnvironmentFacts = {
  readonly sessionType: LinuxSessionType;
  readonly architecture: NodeJS.Architecture;
  readonly kernelRelease: string;
  readonly libc: "glibc" | "musl" | "unknown" | null;
  readonly desktop: string;
  readonly desktopRaw: string;
  readonly distributionId: string | null;
  readonly distributionVersion: string | null;
  readonly distributionLike: readonly string[];
  readonly packageType: LinuxPackageType;
  readonly waylandDisplay: string | null;
  readonly x11Display: string | null;
  readonly x11DisplaySource: "env" | "socket-scan" | null;
  readonly isContainer: boolean;
  readonly isRoot: boolean;
  readonly gpu: LinuxGpuFacts;
};

export type LinuxCompatRecoveryStatus = {
  readonly active: boolean;
  readonly autoRestarted: boolean;
  readonly launchId: string;
  readonly previousFailureReason: string | null;
};

export type LinuxCompatPlan = {
  readonly enabled: boolean;
  readonly profile: LinuxCompatProfile;
  readonly recommendedProfile: LinuxCompatProfile;
  readonly safeMode: boolean;
  readonly backend: LinuxGraphicsBackend;
  readonly gpuMode: LinuxGpuMode;
  readonly profileSource: LinuxStrategySource;
  readonly backendSource: LinuxStrategySource;
  readonly gpuSource: LinuxStrategySource;
  readonly warnings: readonly LinuxCompatWarning[];
  readonly notes: readonly string[];
  readonly appliedEnv: Readonly<Record<string, string>>;
  readonly appliedSwitches: Readonly<Record<string, string>>;
  readonly disableHardwareAcceleration: boolean;
  readonly facts: LinuxEnvironmentFacts;
  readonly recovery: LinuxCompatRecoveryStatus;
};

export type LinuxCompatStatus = {
  readonly platform: NodeJS.Platform;
  readonly enabled: boolean;
  readonly profile: LinuxCompatProfile;
  readonly recommendedProfile: LinuxCompatProfile;
  readonly safeMode: boolean;
  readonly backend: LinuxGraphicsBackend;
  readonly gpuMode: LinuxGpuMode;
  readonly profileSource: LinuxStrategySource;
  readonly backendSource: LinuxStrategySource;
  readonly gpuSource: LinuxStrategySource;
  readonly warnings: readonly LinuxCompatWarning[];
  readonly notes: readonly string[];
  readonly appliedEnv: Readonly<Record<string, string>>;
  readonly appliedSwitches: Readonly<Record<string, string>>;
  readonly facts: LinuxEnvironmentFacts;
  readonly recovery: LinuxCompatRecoveryStatus;
  readonly generatedAt: string;
};

export type LinuxCompatReadStatusResponse = LinuxCompatStatus;

export type LinuxCompatReadConfigResponse = LinuxCompatConfig;

export type LinuxCompatUpdateConfigRequest = {
  readonly profile: LinuxCompatProfile;
};

export type LinuxCompatUpdateConfigResponse = {
  readonly ok: boolean;
  readonly config?: LinuxCompatConfig;
  readonly error?: string;
};

export type LinuxCompatRestartRequest = {
  readonly recovery?: boolean;
  readonly reason?: string;
};

export type LinuxCompatRestartResponse = {
  readonly ok: boolean;
  readonly error?: string;
};

export type LinuxCompatBridge = {
  readonly status: LinuxCompatStatus;
  readonly readConfig: () => LinuxCompatConfig;
  readonly updateConfig: (request: LinuxCompatUpdateConfigRequest) => LinuxCompatUpdateConfigResponse;
  readonly applyToProcessEnv: () => void;
  readonly applyToElectronApp: (app: Electron.App) => void;
  readonly requestEnvCorrectionRelaunch: (app: Electron.App) => LinuxCompatRestartResponse;
  readonly markWindowReady: () => void;
  readonly recordRendererGone: (details: Electron.RenderProcessGoneDetails) => void;
  readonly recordChildProcessGone: (details: Electron.Details) => void;
  readonly captureGpuSnapshot: (app: Electron.App) => Promise<void>;
  readonly requestRestart: (app: Electron.App, request?: LinuxCompatRestartRequest) => LinuxCompatRestartResponse;
  readonly persistStatusSnapshot: (storageRoot: string) => void;
};
