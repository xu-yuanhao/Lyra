import * as React from "react";
import { lazy, Suspense, useLayoutEffect, useState } from "react";
import * as ReactDomClient from "react-dom/client";
import { createRoot } from "react-dom/client";
import * as ReactJsxRuntime from "react/jsx-runtime";

import { installFirstPartyUiRuntime } from "@lyra/workbench-ui-runtime/host";

import {
  createFirstPartyCodeEditorService,
  synchronizeInstalledWorkspaceAppModules
} from "@workbench/workspace-apps";
import { WorkbenchI18nProvider, t } from "@workbench/i18n";
import { AppErrorBoundary, AppStatusProvider } from "@renderer/ui/components";
import { InstallerGate } from "./startup/InstallerGate";
import { UninstallerGate } from "./startup/UninstallerGate";
import { StartupGate } from "./startup/StartupGate";
import {
  dismissLyraBootstrapScreen,
  revealLyraBootstrapScreen
} from "./startup/bootstrap-screen";
import {
  hasCompletedInstaller,
  hasInstalledRelease,
  readInstallerForceFromSearch,
  shouldRunInstaller
} from "./startup/installer-copy";
import { readUninstallerForceFromSearch } from "./startup/uninstaller-copy";
import { clearLocalStartupComplete } from "./startup/startup-preferences";

import "@fontsource/geist-sans/latin.css";
import "@fontsource/geist-mono/latin.css";
import "@fontsource-variable/noto-sans-sc/wght.css";
import "@fontsource/zen-dots/latin.css";
import "./styles/index.scss";

const workbenchShellPromise = import("@workbench/shell");
const WorkbenchShell = lazy(async () => {
  const module = await workbenchShellPromise;
  return { default: module.WorkbenchShell };
});

const WorkbenchShellReady = ({
  onSignedOut
}: {
  readonly onSignedOut: () => void;
}) => {
  useLayoutEffect(() => {
    dismissLyraBootstrapScreen();
  }, []);
  return <WorkbenchShell onSignedOut={onSignedOut} />;
};

const rootElement = document.getElementById("app");
if (rootElement === null) {
  throw new Error("renderer root #app is missing");
}

installFirstPartyUiRuntime({
  react: React,
  reactDomClient: ReactDomClient,
  jsxRuntime: ReactJsxRuntime,
  services: {
    codeEditor: createFirstPartyCodeEditorService()
  }
});

const workspaceAppModulesReady = synchronizeInstalledWorkspaceAppModules({
  components: window.lyraDesktop.components
});

type RendererPhase = "boot" | "uninstall" | "install" | "startup" | "ready";

const RendererRoot = () => {
  const [phase, setPhase] = useState<RendererPhase>("boot");
  const handleStartupReady = (): void => {
    void workspaceAppModulesReady
      .then((issues) => {
        for (const issue of issues) {
          console.error(
            `[lyra-workspace-apps] ${issue.componentId} could not be restored: ${issue.message}`
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[lyra-workspace-apps] component registry synchronization failed", error);
      })
      .finally(() => setPhase("ready"));
  };
  const handleSignedOut = (): void => {
    clearLocalStartupComplete();
    setPhase("startup");
  };
  useLayoutEffect(() => {
    let cancelled = false;
    const api = window.lyraDesktop;
    const openUninstaller = (): void => {
      if (!cancelled) {
        setPhase("uninstall");
      }
    };
    const unsubscribeOpen = api.productUninstall.onOpenRequested(openUninstaller);
    void (async () => {
      const forceUninstaller = api.appMeta.forceUninstaller === true
        || readUninstallerForceFromSearch(window.location.search);
      if (forceUninstaller) {
        openUninstaller();
        return;
      }
      const force = api.appMeta.forceInstaller === true
        || readInstallerForceFromSearch(window.location.search);
      let installed = false;
      try {
        installed = hasInstalledRelease(await api.components.list());
      } catch {
        installed = false;
      }
      if (cancelled) {
        return;
      }
      setPhase(shouldRunInstaller({
        isPackaged: api.appMeta.isPackaged,
        force,
        hasCompletedMarker: hasCompletedInstaller(),
        hasInstalledRelease: installed
      })
        ? "install"
        : "startup");
    })();
    return () => {
      cancelled = true;
      unsubscribeOpen();
    };
  }, []);
  useLayoutEffect(() => {
    if (phase === "boot" || phase === "startup" || phase === "uninstall") {
      revealLyraBootstrapScreen();
    }
  }, [phase]);
  return (
    <WorkbenchI18nProvider>
      <AppStatusProvider>
        <AppErrorBoundary
          className="lyra-app-root-error min-h-screen"
          title={t("appStatus.unexpectedErrorTitle")}
          description={t("appStatus.unexpectedErrorDescription")}
          onError={dismissLyraBootstrapScreen}
        >
          {phase === "ready"
            ? (
              <Suspense fallback={null}>
                <WorkbenchShellReady onSignedOut={handleSignedOut} />
              </Suspense>
            )
            : phase === "uninstall"
              ? <UninstallerGate />
              : phase === "install"
                ? <InstallerGate onComplete={() => setPhase("startup")} />
                : phase === "startup"
                  ? <StartupGate onReady={handleStartupReady} />
                  : null}
        </AppErrorBoundary>
      </AppStatusProvider>
    </WorkbenchI18nProvider>
  );
};

createRoot(rootElement).render(<RendererRoot />);
