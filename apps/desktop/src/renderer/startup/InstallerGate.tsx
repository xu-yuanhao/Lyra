import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Folder, Volume2, VolumeX } from "@lyra/icons";
import { AppButton } from "@renderer/ui/components";
import { getDesktopApi } from "@workbench/shell/service";
import type { ComponentUpdateProgress } from "../../shared/desktop-bridge";
import { dismissLyraBootstrapScreen } from "./bootstrap-screen";
import {
  AnimatedAsciiLogo,
  StartupFrame,
  StartupTagline,
  useStartupTheme
} from "./startup-chrome";
import {
  INSTALLER_ACTIONS_CLASS,
  INSTALLER_HERO_CLASS,
  INSTALLER_INSTALL_SLOT_CLASS,
  INSTALLER_LOGO_LAYER_CLASS,
  INSTALLER_METRICS_CLASS,
  INSTALLER_PATH_CLASS,
  INSTALLER_PROGRESS_CLASS,
  INSTALLER_PROGRESS_FILL_CLASS,
  INSTALLER_PROGRESS_TRACK_CLASS,
  INSTALLER_STAGE_CLASS,
  INSTALLER_VIDEO_CLASS,
  INSTALLER_VIDEO_FRAME_CLASS,
  STARTUP_AUDIO_TOGGLE_CLASS,
  STARTUP_BRAND_CLASS,
  STARTUP_ERROR_CLASS,
  STARTUP_HERO_CLASS,
  STARTUP_LOGO_WRAP_CLASS,
} from "./classes";
import {
  COMPLETE_STATUS,
  elideInstallPath,
  formatPercent,
  formatSpeedBps,
  isIndeterminateProgress,
  markInstallerComplete,
  parsePromoVideoUrl,
  progressFraction,
  PROMO_MANIFEST_URL,
  resolveInstallerChannel,
  ROTATE_MS,
  SpeedEstimator,
  statusPoolForProgress
} from "./installer-copy";

type InstallerGateProps = {
  readonly onComplete: () => void;
};

const noop = (): void => undefined;

export const InstallerGate = ({ onComplete }: InstallerGateProps) => {
  const desktopApi = getDesktopApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [videoMuted, setVideoMuted] = useState(false);
  const userChoseMuteRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ComponentUpdateProgress | null>(null);
  const [speedBps, setSpeedBps] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const estimatorRef = useRef(new SpeedEstimator());
  const startingRef = useRef(false);
  const installGenerationRef = useRef(0);
  const cancellingRef = useRef(false);
  const videoStartedRef = useRef(false);

  useStartupTheme("lyra-system", desktopApi);

  useLayoutEffect(() => {
    dismissLyraBootstrapScreen();
  }, []);

  useLayoutEffect(() => {
    const windowMaterialMode = desktopApi?.appMeta.windowMaterialMode ?? "opaque";
    document.documentElement.dataset.lyraWindowMaterial = windowMaterialMode;
    document.documentElement.dataset.lyraMaterialEnabled =
      windowMaterialMode === "native" ? "true" : "false";
  }, [desktopApi]);

  useEffect(() => {
    const abort = new AbortController();
    void fetch(PROMO_MANIFEST_URL, { signal: abort.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`promo manifest HTTP ${response.status}`);
        }
        return response.json() as Promise<unknown>;
      })
      .then((manifest) => {
        videoStartedRef.current = false;
        userChoseMuteRef.current = false;
        setVideoReady(false);
        setVideoMuted(false);
        setVideoUrl(parsePromoVideoUrl(manifest));
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, []);

  useEffect(() => {
    if (desktopApi?.components === undefined) {
      return;
    }
    return desktopApi.components.onUpdateProgress((next) => {
      setProgress(next);
      if (next.phase === "cleanup") {
        setSpeedBps(0);
        return;
      }
      setSpeedBps(estimatorRef.current.update(next.completed, Date.now()));
    });
  }, [desktopApi]);

  const busy = running || cancelling;
  const statusPool = useMemo(
    () => statusPoolForProgress(progress, busy, failed, finished, cancelling),
    [busy, cancelling, failed, finished, progress]
  );

  useEffect(() => {
    setStatusIndex(0);
  }, [statusPool]);

  useEffect(() => {
    if (statusPool.length < 2) {
      return;
    }
    const timer = window.setInterval(() => {
      setStatusIndex((current) => (current + 1) % statusPool.length);
    }, ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [statusPool]);

  const statusText = statusPool[statusIndex] ?? statusPool[0] ?? COMPLETE_STATUS;
  const installPath = desktopApi?.appMeta.componentInstallRoot ?? "";
  const fraction = progressFraction(progress);
  const indeterminate = isIndeterminateProgress(busy, progress);
  const percentText = busy || finished ? formatPercent(finished ? 1 : fraction) : "";
  const rateText = running && !cancelling ? formatSpeedBps(speedBps) : "";

  const unlockPromoSound = (): void => {
    if (userChoseMuteRef.current) {
      return;
    }
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    video.muted = false;
    video.volume = 1;
    setVideoMuted(false);
    if (video.paused) {
      void video.play();
    }
  };

  const startInstall = useCallback(async (): Promise<void> => {
    if (
      startingRef.current
      || cancellingRef.current
      || desktopApi === null
      || desktopApi.components === undefined
    ) {
      return;
    }
    unlockPromoSound();
    startingRef.current = true;
    const generation = ++installGenerationRef.current;
    setRunning(true);
    setFailed(false);
    setFinished(false);
    setError(null);
    setProgress(null);
    estimatorRef.current = new SpeedEstimator();
    setSpeedBps(0);
    try {
      await desktopApi.components.stageUpdate({
        channel: resolveInstallerChannel(desktopApi.appMeta.version)
      });
      if (generation !== installGenerationRef.current) {
        return;
      }
      setFinished(true);
      setProgress((current) => current ?? {
        phase: "complete",
        completed: 1,
        total: 1,
        completedComponents: 1,
        totalComponents: 1
      });
      markInstallerComplete();
      void desktopApi.productUninstall.registerEntry();
      window.setTimeout(onComplete, 480);
    } catch (installError: unknown) {
      if (generation !== installGenerationRef.current) {
        return;
      }
      setFailed(true);
      setError(installError instanceof Error ? installError.message : String(installError));
    } finally {
      if (generation === installGenerationRef.current) {
        setRunning(false);
        startingRef.current = false;
      }
    }
  }, [desktopApi, onComplete]);

  const cancelInstall = useCallback(async (): Promise<void> => {
    if (desktopApi === null) {
      return;
    }
    if (!startingRef.current && !cancellingRef.current) {
      void desktopApi.windowControls.close();
      return;
    }
    if (cancellingRef.current || desktopApi.components === undefined) {
      return;
    }
    cancellingRef.current = true;
    installGenerationRef.current += 1;
    setCancelling(true);
    setFailed(false);
    setError(null);
    setSpeedBps(0);
    setProgress({
      phase: "cleanup",
      componentId: "process",
      completed: 0,
      total: 1,
      completedComponents: 0,
      totalComponents: 1
    });
    try {
      await desktopApi.components.cancelUpdate();
      await desktopApi.components.purgeStagedUpdate();
      setProgress(null);
    } catch (cleanupError: unknown) {
      setFailed(true);
      setError(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
    } finally {
      setRunning(false);
      setCancelling(false);
      startingRef.current = false;
      cancellingRef.current = false;
      setSpeedBps(0);
    }
  }, [desktopApi]);

  const revealInstallPath = (): void => {
    if (installPath.length === 0) {
      return;
    }
    void desktopApi?.revealInFolder(installPath);
  };

  const playPromoVideo = (video: HTMLVideoElement): void => {
    if (videoStartedRef.current) {
      return;
    }
    videoStartedRef.current = true;
    video.volume = 1;
    video.muted = false;
    setVideoReady(true);
    void video.play().then(
      () => setVideoMuted(false),
      () => {
        // Chromium may block unmuted autoplay; picture stays on, next click unsilences.
        video.muted = true;
        setVideoMuted(true);
        void video.play().then(
          undefined,
          () => {
            setVideoUrl(null);
            setVideoReady(false);
            videoStartedRef.current = false;
          }
        );
      }
    );
  };

  const toggleVideoMute = (): void => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }
    userChoseMuteRef.current = true;
    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setVideoMuted(nextMuted);
    if (!nextMuted && video.paused) {
      void video.play();
    }
  };

  return (
    <StartupFrame mode="installer">
      <div className={`${STARTUP_HERO_CLASS} ${INSTALLER_HERO_CLASS}`}>
        <div className={INSTALLER_STAGE_CLASS}>
          <div className={`${INSTALLER_LOGO_LAYER_CLASS}${videoReady ? " is-exit" : ""}`}>
            <div className={STARTUP_LOGO_WRAP_CLASS}>
              <AnimatedAsciiLogo />
            </div>
            <h1 className={STARTUP_BRAND_CLASS}>LYRA</h1>
          </div>
          {videoUrl === null ? null : (
            <div className={INSTALLER_VIDEO_FRAME_CLASS}>
              <video
                ref={videoRef}
                className={INSTALLER_VIDEO_CLASS}
                src={videoUrl}
                loop
                playsInline
                preload="auto"
                muted={videoMuted}
                disablePictureInPicture
                onCanPlay={(event) => playPromoVideo(event.currentTarget)}
                onError={() => {
                  videoStartedRef.current = false;
                  setVideoUrl(null);
                  setVideoReady(false);
                }}
              />
            </div>
          )}
        </div>
        {videoReady ? (
          <AppButton
            variant="plain"
            className={`${STARTUP_AUDIO_TOGGLE_CLASS}${videoMuted ? " is-muted" : ""}`}
            aria-label={videoMuted ? "Unmute video" : "Mute video"}
            aria-pressed={!videoMuted}
            title={videoMuted ? "Unmute video" : "Mute video"}
            onClick={toggleVideoMute}
          >
            {videoMuted
              ? <VolumeX size={17} strokeWidth={1.7} aria-hidden="true" />
              : <Volume2 size={17} strokeWidth={1.7} aria-hidden="true" />}
          </AppButton>
        ) : null}
        <StartupTagline text={statusText} onHover={noop} onLeave={noop} />
        <div
          className={INSTALLER_PROGRESS_CLASS}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={indeterminate ? undefined : Math.round((finished ? 1 : fraction) * 100)}
          aria-label={cancelling ? "Cleanup progress" : "Install progress"}
        >
          <div className={INSTALLER_PROGRESS_TRACK_CLASS}>
            <div
              className={`${INSTALLER_PROGRESS_FILL_CLASS}${indeterminate ? " is-indeterminate" : ""}`}
              style={indeterminate ? undefined : { width: `${Math.round((finished ? 1 : fraction) * 100)}%` }}
            />
          </div>
          <div className={INSTALLER_METRICS_CLASS}>
            <span>{rateText}</span>
            <span>{percentText}</span>
          </div>
        </div>
        {installPath.length > 0 ? (
          <AppButton
            variant="plain"
            className={INSTALLER_PATH_CLASS}
            onClick={revealInstallPath}
            disabled={busy}
            title={installPath}
          >
            <Folder size={16} strokeWidth={1.7} aria-hidden="true" />
            <span>{elideInstallPath(installPath, 42)}</span>
          </AppButton>
        ) : null}
        {error !== null ? <p className={STARTUP_ERROR_CLASS}>{error}</p> : null}
        {finished ? null : (
          <div className={`${INSTALLER_ACTIONS_CLASS}${busy && !failed ? " is-busy" : ""}`}>
            {failed ? (
              <>
                <AppButton
                  variant="secondary"
                  size="lg"
                  onClick={() => void desktopApi?.windowControls.close()}
                >
                  Close
                </AppButton>
                <div className={INSTALLER_INSTALL_SLOT_CLASS}>
                  <AppButton variant="default" size="lg" onClick={() => void startInstall()}>
                    Retry
                  </AppButton>
                </div>
              </>
            ) : (
              <>
                <AppButton
                  variant="secondary"
                  size="lg"
                  disabled={cancelling}
                  onClick={() => void cancelInstall()}
                >
                  Cancel
                </AppButton>
                <div className={INSTALLER_INSTALL_SLOT_CLASS} aria-hidden={busy}>
                  <AppButton
                    variant="default"
                    size="lg"
                    disabled={busy}
                    tabIndex={busy ? -1 : undefined}
                    onClick={() => void startInstall()}
                  >
                    Install
                  </AppButton>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </StartupFrame>
  );
};
