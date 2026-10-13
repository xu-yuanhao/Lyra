import { ipcMain } from "electron";

import {
  LYRA_CHANNELS,
  type OfficeApplyRequest,
  type OfficeApplyResult,
  type OfficePreviewRequest,
  type OfficePreviewResult,
  type OfficeReadRequest,
  type OfficeReadResult
} from "../../shared/desktop-bridge";
import { OfficeDocxError, applyDocxFile, readDocxFile } from "./docx";
import { OfficePptxError, applyPptxFile, readPptxFile } from "./pptx";
import { assertOfficeEditPath } from "../../shared/office-documents";
import { OfficePreviewError, previewOfficeFile } from "./preview";
import { OfficeXlsxError, applyXlsxFile, readXlsxFile } from "./xlsx";

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};

export const createOfficeIpcBridge = (createPreviewUrl: (path: string) => string): { readonly dispose: () => void } => {
  ipcMain.handle(LYRA_CHANNELS.officePreview, async (_event, payload: unknown): Promise<OfficePreviewResult> => {
    const path = asRecord(payload).path;
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("path is required");
    }
    try {
      const preview = await previewOfficeFile(path);
      return {
        format: preview.format,
        title: preview.title,
        sourceUrl: createPreviewUrl(path),
        byteLength: preview.byteLength
      };
    } catch (error) {
      if (error instanceof OfficePreviewError) {
        throw new Error(error.message);
      }
      throw error;
    }
  });

  ipcMain.handle(LYRA_CHANNELS.officeRead, async (_event, payload: unknown): Promise<OfficeReadResult> => {
    const path = asRecord(payload).path;
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("path is required");
    }
    const format = assertOfficeEditPath(path, "read");
    if (format === "docx") {
      return readDocxFile(path);
    }
    if (format === "xlsx") {
      return readXlsxFile(path);
    }
    return readPptxFile(path);
  });

  ipcMain.handle(LYRA_CHANNELS.officeApply, async (_event, payload: unknown): Promise<OfficeApplyResult> => {
    const record = asRecord(payload);
    const path = record.path;
    if (typeof path !== "string" || path.length === 0) {
      throw new Error("path is required");
    }
    if (!Array.isArray(record.ops)) {
      throw new Error("ops must be an array");
    }
    const format = assertOfficeEditPath(path, "apply");
    try {
      if (format === "docx") {
        const result = await applyDocxFile(path, record.ops);
        return { format, applied: result.applied, written: result.written };
      }
      if (format === "xlsx") {
        const result = await applyXlsxFile(path, record.ops);
        return { format, applied: result.applied, written: result.written };
      }
      const result = await applyPptxFile(path, record.ops);
      return { format, applied: result.applied, written: result.written };
    } catch (error) {
      if (error instanceof OfficeDocxError || error instanceof OfficeXlsxError || error instanceof OfficePptxError) {
        throw new Error(error.message);
      }
      throw error;
    }
  });

  return {
    dispose: () => {
      ipcMain.removeHandler(LYRA_CHANNELS.officePreview);
      ipcMain.removeHandler(LYRA_CHANNELS.officeRead);
      ipcMain.removeHandler(LYRA_CHANNELS.officeApply);
    }
  };
};

export type { OfficeApplyRequest, OfficePreviewRequest, OfficeReadRequest };
