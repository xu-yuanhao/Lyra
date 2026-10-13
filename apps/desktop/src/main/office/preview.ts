import { open, stat } from "node:fs/promises";
import { open as openZip, type Entry, type ZipFile } from "yauzl";

import { officeFormatFromPath, officeTitleFromPath, type OfficeDocumentFormat } from "./paths";

export const MAX_OFFICE_PREVIEW_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;

export class OfficePreviewError extends Error {
  readonly code: "unsupported" | "invalid" | "too-large";
  constructor(code: OfficePreviewError["code"], message: string) {
    super(message);
    this.name = "OfficePreviewError";
    this.code = code;
  }
}

export type OfficePreview = {
  readonly format: OfficeDocumentFormat;
  readonly title: string;
  readonly byteLength: number;
};

const detectPackage = (filePath: string): Promise<Exclude<OfficeDocumentFormat, "pdf">> =>
  new Promise((resolve, reject) => {
    openZip(filePath, { lazyEntries: true, autoClose: true }, (error, zip: ZipFile | undefined) => {
      if (error !== null || zip === undefined) { reject(new OfficePreviewError("invalid", "Invalid Office package.")); return; }
      let expanded = 0;
      let entries = 0;
      const names = new Set<string>();
      const fail = (message: string): void => { zip.close(); reject(new OfficePreviewError("invalid", message)); };
      zip.on("error", () => fail("Invalid Office package."));
      zip.on("entry", (entry: Entry) => {
        expanded += entry.uncompressedSize;
        entries += 1;
        if (expanded > MAX_EXPANDED_BYTES || entries > 20000 || entry.generalPurposeBitFlag & 1) {
          fail("Office package is encrypted or exceeds preview limits."); return;
        }
        names.add(entry.fileName);
        zip.readEntry();
      });
      zip.on("end", () => {
        const formats = (["docx", "xlsx", "pptx"] as const).filter((format) => names.has({
          docx: "word/document.xml", xlsx: "xl/workbook.xml", pptx: "ppt/presentation.xml"
        }[format]));
        if (!names.has("[Content_Types].xml") || formats.length !== 1) { fail("File is not an Office document package."); return; }
        resolve(formats[0]!);
      });
      zip.readEntry();
    });
  });

/** Validate bounded metadata; file content travels through the ticketed stream. */
export const previewOfficeFile = async (filePath: string): Promise<OfficePreview> => {
  const expected = officeFormatFromPath(filePath);
  if (expected === null) throw new OfficePreviewError("unsupported", "This file is not a pdf, docx, xlsx, or pptx.");
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new OfficePreviewError("invalid", "Office preview requires a regular file.");
  if (metadata.size > MAX_OFFICE_PREVIEW_BYTES) throw new OfficePreviewError("too-large", "Office preview supports files up to 64 MiB.");
  const handle = await open(filePath, "r");
  const header = Buffer.alloc(8);
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  const actual = header.subarray(0, 5).toString("ascii") === "%PDF-" ? "pdf"
    : header.readUInt32LE(0) === 0x04034b50 ? await detectPackage(filePath) : null;
  if (actual === null || actual !== expected) throw new OfficePreviewError("invalid", "File contents do not match its Office extension.");
  return { format: actual, title: officeTitleFromPath(filePath), byteLength: metadata.size };
};
