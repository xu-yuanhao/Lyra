import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Folder } from "@lyra/icons";
import { AppButton } from "@renderer/ui/components";
import { getDesktopApi } from "@workbench/shell/service";
import type { ProductUninstallProgress } from "../../shared/desktop-bridge";
import { dismissLyraBootstrapScreen } from "./bootstrap-screen";
import {
  AnimatedAsciiLogo,
  StartupFrame,
  StartupTagline,
  useStartupTheme
} from "./startup-chrome";
import {
  INSTALLER_ACTIONS_CLASS,
  INSTALLER_INSTALL_SLOT_CLASS,
  INSTALLER_METRICS_CLASS,
  INSTALLER_PATH_CLASS,
  INSTALLER_PROGRESS_CLASS,
  INSTALLER_PROGRESS_FILL_CLASS,
  INSTALLER_PROGRESS_TRACK_CLASS,
  STARTUP_BRAND_CLASS,
  STARTUP_ERROR_CLASS,
  STARTUP_HERO_CLASS,
  STARTUP_LOGO_WRAP_CLASS,
  UNINSTALLER_CHECK_CLASS,
  UNINSTALLER_HERO_CLASS,
} from "./classes";
import { elideInstallPath, formatPercent, INSTALLER_COMPLETE_KEY } from "./installer-copy";
import {
  statusPoolForUninstall,
  UNINSTALL_COMPLETE_STATUS,
  UNINSTALL_ROTATE_MS,
  uninstallProgressFraction
} from "./uninstaller-copy";

const noop = (): void => undefined;

export const UninstallerGate = () => {
  const desktopApi = getDesktopApi();
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removeUserData, setRemoveUserData] = useState(false);
  const [progress, setProgress] = useState<ProductUninstallProgress | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const startingRef = useRef(false);

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
    if (desktopApi?.productUninstall === undefined) {
      return;
    }
    return desktopApi.productUninstall.onProgress(setProgress);
  }, [desktopApi]);

  const statusPool = useMemo(
    () => statusPoolForUninstall(progress, running, failed, finished),
    [failed, finished, progress, running]
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
    }, UNINSTALL_ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [statusPool]);

  const statusText = statusPool[statusIndex] ?? statusPool[0] ?? UNINSTALL_COMPLETE_STATUS;
  const installPath = desktopApi?.appMeta.componentInstallRoot ?? "";
  const fraction = uninstallProgressFraction(progress);
  const percentText = running || finished ? formatPercent(finished ? 1 : fraction) : "";
  const busy = running;

  const startUninstall = useCallback(async (): Promise<void> => {
    if (startingRef.current || desktopApi?.productUninstall === undefined) {
      return;
    }
    startingRef.current = true;
    setRunning(true);
    setFailed(false);
    setFinished(false);
    setError(null);
    setProgress(null);
    try {
      await desktopApi.productUninstall.run({ removeUserData });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(INSTALLER_COMPLETE_KEY);
      }
      setFinished(true);
      setProgress((current) => current ?? {
        phase: "complete",
        completed: 1,
        total: 1
      });
    } catch (uninstallError: unknown) {
      setFailed(true);
      setError(uninstallError instanceof Error ? uninstallError.message : String(uninstallError));
    } finally {
      setRunning(false);
      startingRef.current = false;
    }
  }, [desktopApi, removeUserData]);

  const revealInstallPath = (): void => {
    if (installPath.length === 0) {
      return;
    }
    void desktopApi?.revealInFolder(installPath);
  };

  return (
    <StartupFrame mode="uninstaller">
      <div className={`${STARTUP_HERO_CLASS} ${UNINSTALLER_HERO_CLASS}`}>
        <div className={STARTUP_LOGO_WRAP_CLASS}>
          <AnimatedAsciiLogo />
        </div>
        <h1 className={STARTUP_BRAND_CLASS}>LYRA</h1>
        <StartupTagline text={statusText} onHover={noop} onLeave={noop} />
        <div
          className={INSTALLER_PROGRESS_CLASS}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round((finished ? 1 : fraction) * 100)}
          aria-label="Uninstall progress"
        >
          <div className={INSTALLER_PROGRESS_TRACK_CLASS}>
            <div
              className={`${INSTALLER_PROGRESS_FILL_CLASS}${running && progress === null ? " is-indeterminate" : ""}`}
              style={running && progress === null
                ? undefined
                : { width: `${Math.round((finished ? 1 : fraction) * 100)}%` }}
            />
          </div>
          <div className={INSTALLER_METRICS_CLASS}>
            <span />
            <span>{percentText}</span>
          </div>
        </div>
        {installPath.length > 0 ? (
          <button
            type="button"
            className={INSTALLER_PATH_CLASS}
            onClick={revealInstallPath}
            disabled={busy}
            title={installPath}
          >
            <Folder size={16} strokeWidth={1.7} aria-hidden="true" />
            <span>{elideInstallPath(installPath, 42)}</span>
          </button>
        ) : null}
        <label className={UNINSTALLER_CHECK_CLASS}>
          <input
            type="checkbox"
            checked={removeUserData}
            disabled={busy || finished}
            onChange={(event) => setRemoveUserData(event.currentTarget.checked)}
          />
          <span>Also delete my files and settings</span>
        </label>
        {error !== null ? <p className={STARTUP_ERROR_CLASS}>{error}</p> : null}
        {finished ? (
          <div className={INSTALLER_ACTIONS_CLASS}>
            <AppButton
              variant="default"
              size="lg"
              onClick={() => void desktopApi?.windowControls.close()}
            >
              Close
            </AppButton>
          </div>
        ) : (
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
                  <AppButton variant="default" size="lg" onClick={() => void startUninstall()}>
                    Retry
                  </AppButton>
                </div>
              </>
            ) : (
              <>
                <AppButton
                  variant="secondary"
                  size="lg"
                  disabled={busy}
                  onClick={() => void desktopApi?.windowControls.close()}
                >
                  Cancel
                </AppButton>
                <div className={INSTALLER_INSTALL_SLOT_CLASS} aria-hidden={busy}>
                  <AppButton
                    variant="default"
                    size="lg"
                    disabled={busy}
                    tabIndex={busy ? -1 : undefined}
                    onClick={() => void startUninstall()}
                  >
                    Uninstall
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
