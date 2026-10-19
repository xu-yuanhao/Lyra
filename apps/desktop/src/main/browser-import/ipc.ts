import { ipcMain } from "electron";

import type {
  BrowserImportProfilesResponse,
  BrowserImportResult
} from "../../shared/browser-import";
import { LYRA_CHANNELS } from "../../shared/desktop-bridge";
import { importBrowserProfile, listBrowserProfiles } from "./service";

export type BrowserImportIpcBridge = {
  readonly dispose: () => void;
};

const readProfileId = (payload: unknown): string | null => {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const profileId = (payload as { readonly profileId?: unknown }).profileId;
  return typeof profileId === "string" && profileId.length > 0 ? profileId : null;
};

/** Detection and import both stay in main; the renderer only names a profile. */
export const createBrowserImportIpcBridge = (): BrowserImportIpcBridge => {
  ipcMain.handle(
    LYRA_CHANNELS.browserImportListProfiles,
    async (): Promise<BrowserImportProfilesResponse> => ({ profiles: await listBrowserProfiles() })
  );
  ipcMain.handle(
    LYRA_CHANNELS.browserImportRun,
    async (_event, payload: unknown): Promise<BrowserImportResult> => {
      const profileId = readProfileId(payload);
      if (profileId === null) {
        throw new Error("profileId is required");
      }
      return importBrowserProfile({ profileId });
    }
  );
  return {
    dispose: () => {
      ipcMain.removeHandler(LYRA_CHANNELS.browserImportListProfiles);
      ipcMain.removeHandler(LYRA_CHANNELS.browserImportRun);
    }
  };
};
