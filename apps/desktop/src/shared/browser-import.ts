/**
 * Browser data import contract.
 *
 * Detection, snapshotting and decryption all stay in the Electron main process.
 * The renderer only ever sees profile identity (browser, profile name, account
 * email and cached account picture) and import counts — never cookie values,
 * storage entries or decryption material.
 */

export type BrowserImportBrowserId =
  | "chrome"
  | "chrome-beta"
  | "chrome-dev"
  | "chrome-canary"
  | "chromium"
  | "brave"
  | "edge"
  | "vivaldi"
  | "firefox";

export type BrowserImportFamily = "chromium" | "firefox";

export type BrowserImportProfile = {
  /** Path of the profile directory, and the only handle the renderer may import. */
  readonly id: string;
  readonly browser: BrowserImportBrowserId;
  readonly browserLabel: string;
  readonly family: BrowserImportFamily;
  /** Profile display name from the browser, e.g. `Default` or a user-given name. */
  readonly profileName: string;
  /** Signed-in account email for the profile, when the browser records one. */
  readonly accountEmail?: string;
  /**
   * Account picture the browser cached for the profile, as a data URL. Browsers
   * keep it beside the profile; Lyra never fetches an account picture remotely.
   */
  readonly avatarDataUrl?: string;
  readonly profilePath: string;
  readonly isDefault: boolean;
  readonly lastUsed: boolean;
};

export type BrowserImportProfilesResponse = {
  readonly profiles: readonly BrowserImportProfile[];
};

export type BrowserImportRunRequest = {
  readonly profileId: string;
};

export type BrowserImportIssue =
  | "profile_not_found"
  | "system_keyring_unavailable"
  | "windows_app_bound_unsupported"
  | "local_storage_unavailable"
  | "import_failed";

export type BrowserImportCookieStats = {
  readonly imported: number;
  readonly skipped: number;
  readonly failed: number;
};

export type BrowserImportLocalStorageStats = {
  readonly originsImported: number;
  readonly entriesImported: number;
  readonly originsSkipped: number;
  readonly originsFailed: number;
};

export type BrowserImportResult = {
  readonly profileId: string;
  /**
   * Imported into Lyra's own browser profile: the sites the user is signed into
   * in the source browser are signed in inside the built-in browser.
   */
  readonly cookies: BrowserImportCookieStats;
  readonly localStorage: BrowserImportLocalStorageStats;
  /** Set when part of the profile could not be read, so the UI can explain why. */
  readonly issue?: BrowserImportIssue;
};

export type BrowserImportApi = {
  readonly listProfiles: () => Promise<BrowserImportProfilesResponse>;
  readonly run: (request: BrowserImportRunRequest) => Promise<BrowserImportResult>;
};
