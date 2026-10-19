import { session as electronSession } from "electron";

import type {
  BrowserImportCookieStats,
  BrowserImportLocalStorageStats,
  BrowserImportProfile,
  BrowserImportResult
} from "../../shared/browser-import";
import { WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION } from "../../shared/workbench-browser";
import { importProfileCookies } from "./cookies";
import { importProfileLocalStorage, type LocalStorageImportStats } from "./local-storage";
import {
  listBrowserImportProfiles,
  resolveBrowserImportProfile,
  type BrowserImportDetectionOptions
} from "./profiles";

export type BrowserImportServiceOptions = BrowserImportDetectionOptions & {
  readonly platform?: NodeJS.Platform;
};

export const listBrowserProfiles = async (
  options: BrowserImportServiceOptions = {}
): Promise<readonly BrowserImportProfile[]> => listBrowserImportProfiles(options);

const emptyCookies = (): BrowserImportCookieStats => ({ imported: 0, skipped: 0, failed: 0 });

const emptyLocalStorage = (): LocalStorageImportStats => ({
  originsImported: 0,
  entriesImported: 0,
  originsSkipped: 0,
  originsFailed: 0
});

/**
 * Imports one detected browser profile into Lyra's own browser profile, so the
 * sites the user is signed into there are signed in inside the built-in browser.
 * Cookies carry most logins; website storage carries the ones held in
 * localStorage by single-page apps.
 */
export const importBrowserProfile = async (options: {
  readonly profileId: string;
  readonly detection?: BrowserImportDetectionOptions;
  readonly platform?: NodeJS.Platform;
}): Promise<BrowserImportResult> => {
  const resolved = await resolveBrowserImportProfile(options.profileId, options.detection ?? {});
  if (resolved === null) {
    return {
      profileId: options.profileId,
      cookies: emptyCookies(),
      localStorage: emptyLocalStorage(),
      issue: "profile_not_found"
    };
  }
  const target = electronSession.fromPartition(WORKBENCH_BROWSER_LIVE_PROFILE_PARTITION);
  const { issue: cookieIssue, ...cookies } = await importProfileCookies({
    browser: resolved.profile.browser,
    family: resolved.profile.family,
    cookieDatabasePath: resolved.cookieDatabasePath,
    platform: options.platform ?? process.platform,
    session: target
  });
  // ponytail: Firefox keeps its website storage in per-origin SQLite files
  // (`storage/default/<origin>/ls/data.sqlite`) rather than LevelDB, so it is not
  // covered here. Its cookies still import; add the SQLite reader when a Firefox
  // user reports a site that needs the extra step.
  const localStorage = resolved.profile.family === "firefox"
    ? emptyLocalStorage()
    : await importProfileLocalStorage({
        profilePath: resolved.profile.profilePath,
        session: target
      });
  const issue = cookieIssue ?? localStorage.issue;
  return {
    profileId: options.profileId,
    cookies,
    localStorage,
    ...(issue === undefined ? {} : { issue })
  };
};
