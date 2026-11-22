import {
  AppButton,
  AppIconButton,
  AppInput,
  AppSurfaceHeader
} from "@renderer/ui/components";
import { GitBranch, Package, RefreshCw } from "@lyra/icons";
import type { FormEvent } from "react";

import type { SoftwareStoreLabels } from "./types";
import {
  SS_INSTALL_CLASS,
  SS_INSTALL_GRID_CLASS,
  SS_INSTALL_TITLE_CLASS,
} from "./classes";

export const SoftwareStoreInstallPanel = ({
  labels,
  canInstall,
  busy,
  gitUrl,
  gitRef,
  gitSubdir,
  npmPackage,
  npmVersion,
  npmSubdir,
  onGitUrlChange,
  onGitRefChange,
  onGitSubdirChange,
  onNpmPackageChange,
  onNpmVersionChange,
  onNpmSubdirChange,
  onInstallGit,
  onInstallNpm,
  onRefresh
}: {
  readonly labels: SoftwareStoreLabels;
  readonly canInstall: boolean;
  readonly busy: boolean;
  readonly gitUrl: string;
  readonly gitRef: string;
  readonly gitSubdir: string;
  readonly npmPackage: string;
  readonly npmVersion: string;
  readonly npmSubdir: string;
  readonly onGitUrlChange: (value: string) => void;
  readonly onGitRefChange: (value: string) => void;
  readonly onGitSubdirChange: (value: string) => void;
  readonly onNpmPackageChange: (value: string) => void;
  readonly onNpmVersionChange: (value: string) => void;
  readonly onNpmSubdirChange: (value: string) => void;
  readonly onInstallGit: (event: FormEvent) => void;
  readonly onInstallNpm: (event: FormEvent) => void;
  readonly onRefresh: () => void;
}) => (
  <section className={SS_INSTALL_CLASS} aria-label={labels.installLocal}>
    <AppSurfaceHeader
      title={labels.installLocal}
      description={labels.uiuxTab}
      actions={(
        <AppIconButton
          aria-label={labels.refresh}
          title={labels.refresh}
          onClick={onRefresh}
        >
          <RefreshCw size={14} aria-hidden="true" />
        </AppIconButton>
      )}
    />

    <div className={SS_INSTALL_GRID_CLASS}>
      <form onSubmit={onInstallGit}>
        <strong className={SS_INSTALL_TITLE_CLASS}>
          <GitBranch size={14} aria-hidden="true" />
          {labels.installGit}
        </strong>
        <label>
          <span>{labels.gitUrlLabel}</span>
          <AppInput
            aria-label={labels.gitUrlLabel}
            value={gitUrl}
            onChange={(event) => {
              onGitUrlChange(event.currentTarget.value);
            }}
          />
        </label>
        <label>
          <span>{labels.gitRefLabel}</span>
          <AppInput
            aria-label={labels.gitRefLabel}
            value={gitRef}
            onChange={(event) => {
              onGitRefChange(event.currentTarget.value);
            }}
          />
        </label>
        <label>
          <span>{labels.gitSubdirLabel}</span>
          <AppInput
            aria-label={labels.gitSubdirLabel}
            value={gitSubdir}
            onChange={(event) => {
              onGitSubdirChange(event.currentTarget.value);
            }}
          />
        </label>
        <AppButton
          type="submit"
          variant="outline"
          size="sm"
          disabled={!canInstall || busy || gitUrl.trim().length === 0}
        >
          {labels.installGit}
        </AppButton>
      </form>

      <form onSubmit={onInstallNpm}>
        <strong className={SS_INSTALL_TITLE_CLASS}>
          <Package size={14} aria-hidden="true" />
          {labels.installNpm}
        </strong>
        <label>
          <span>{labels.npmPackageLabel}</span>
          <AppInput
            aria-label={labels.npmPackageLabel}
            value={npmPackage}
            onChange={(event) => {
              onNpmPackageChange(event.currentTarget.value);
            }}
          />
        </label>
        <label>
          <span>{labels.npmVersionLabel}</span>
          <AppInput
            aria-label={labels.npmVersionLabel}
            value={npmVersion}
            onChange={(event) => {
              onNpmVersionChange(event.currentTarget.value);
            }}
          />
        </label>
        <label>
          <span>{labels.npmSubdirLabel}</span>
          <AppInput
            aria-label={labels.npmSubdirLabel}
            value={npmSubdir}
            onChange={(event) => {
              onNpmSubdirChange(event.currentTarget.value);
            }}
          />
        </label>
        <AppButton
          type="submit"
          variant="outline"
          size="sm"
          disabled={!canInstall || busy || npmPackage.trim().length === 0}
        >
          {labels.installNpm}
        </AppButton>
      </form>
    </div>
  </section>
);
