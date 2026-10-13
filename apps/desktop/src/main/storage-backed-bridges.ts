import type { BrowserWindow } from "electron";
import { LYRA_CHANNELS } from "../shared/desktop-bridge";

import { createImageViewerIpcBridge } from "./image-viewer";
import { createOfficeIpcBridge } from "./office/ipc";
import { createSqliteIpcBridge } from "./sqlite/ipc";
import { createIdentityIpcBridge } from "./identity";
import { createLoginManagerIpcBridge } from "./login-manager";
import { createSensitiveValuesIpcBridge } from "./sensitive-values";

export const createStorageBackedIpcBridges = ({
  fileManagerStorageRoot: _fileManagerStorageRoot,
  imageViewerStorageRoot,
  identityStorageRoot,
  loginManagerStorageRoot,
  createPreviewUrl,
  addAllowedRoot,
  getWindow
}: {
  readonly fileManagerStorageRoot: string;
  readonly imageViewerStorageRoot: string;
  readonly identityStorageRoot: string;
  readonly loginManagerStorageRoot: string;
  readonly createPreviewUrl: (path: string) => string;
  readonly addAllowedRoot: (path: string) => void;
  readonly getWindow: () => BrowserWindow | null;
}) => {
  const imageViewer = createImageViewerIpcBridge(imageViewerStorageRoot, {
    createPreviewUrl
  });
  const office = createOfficeIpcBridge(createPreviewUrl);
  const sqlite = createSqliteIpcBridge();
  console.info(`[lyra-image-viewer] native loaded: ${imageViewer.loadResult.loadedFrom}`);

  const identity = createIdentityIpcBridge(identityStorageRoot, {
    createPreviewUrl,
    addAllowedRoot
  });
  const loginManager = createLoginManagerIpcBridge({
    storageRoot: loginManagerStorageRoot,
    getWindow
  });
  const sensitiveValues = createSensitiveValuesIpcBridge({
    loginManager,
    onStorageStatus: (status) => {
      const window = getWindow();
      if (window !== null && !window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send(LYRA_CHANNELS.sensitiveValuesStatusChanged, status);
      }
    }
  });

  return {
    imageViewer,
    office,
    sqlite,
    identity,
    loginManager,
    sensitiveValues
  };
};
