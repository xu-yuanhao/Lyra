import { zip, xml, helloDocx, helloSheet, helloDeck, helloPdf } from "./office.test-fixtures";
import { mkdtemp, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateRawSync } from "node:zlib";

import { describe, expect, test } from "vitest";

import { assertOfficeEditPath } from "../../shared/office-documents";
import { OfficeDocxError, applyDocxBytes, applyDocxFile, readDocxBytes, readDocxFile } from "./docx";
import { previewOfficeFile } from "./preview";
import { OfficePptxError, applyPptxBytes, applyPptxFile, readPptxBytes } from "./pptx";
import { OfficeXlsxError, applyXlsxBytes, applyXlsxFile, readXlsxBytes } from "./xlsx";

const unzipEntry = (archive: Uint8Array, name: string): string => {
  const found = zipTexts(archive).find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`missing zip entry ${name}`);
  }
  return found.text;
};

const zipTexts = (archive: Uint8Array): Array<{ readonly name: string; readonly text: string }> => {
  const buf = Buffer.from(archive);
  const out: Array<{ name: string; text: string }> = [];
  let offset = 0;
  while (offset + 30 <= buf.length && buf.readUInt32LE(offset) === 0x04034b50) {
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLength = buf.readUInt16LE(offset + 26);
    const extraLength = buf.readUInt16LE(offset + 28);
    const name = buf.subarray(offset + 30, offset + 30 + nameLength).toString();
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buf.subarray(dataStart, dataStart + compressedSize);
    out.push({ name, text: (method === 0 ? data : inflateRawSync(data)).toString("utf8") });
    offset = dataStart + compressedSize;
  }
  return out;
};







const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const tableDocx = (): Uint8Array => zip([
  {
    name: "[Content_Types].xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
  },
  {
    name: "_rels/.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
  },
  {
    name: "word/_rels/document.xml.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
  },
  {
    name: "word/document.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Alpha</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Beta</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Gamma</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Delta</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
    <w:sectPr/>
  </w:body>
</w:document>`)
  }
]);

describe("office docx", () => {
  // The first docx call initializes the headless engine (jsdom + tiptap), which
  // alone can exceed the default 5s test timeout; later calls are warm.
  test("reads the paragraph block index and preview", async () => {
    const read = await readDocxBytes(helloDocx());
    expect(read.blocks).toEqual([
      expect.objectContaining({ index: 0, preview: "Hello" })
    ]);
    expect(read.revisions).toEqual([]);
    expect(read.sections).toEqual([
      expect.objectContaining({ index: 0, firstBlock: 0, lastBlock: 0, summary: expect.stringMatching(/portrait/) })
    ]);
  }, 20_000);

  test("replaces paragraph text and rejects an invalid batch without writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-docx-"));
    const filePath = join(directory, "note.docx");
    const original = Buffer.from(helloDocx());
    await writeFile(filePath, original);
    const before = await stat(filePath);

    await expect(applyDocxFile(filePath, [{ op: "set_text", block: 9, text: "Nope" }]))
      .rejects.toBeInstanceOf(OfficeDocxError);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);

    const applied = await applyDocxFile(filePath, [{ op: "set_text", block: 0, text: "Updated" }]);
    expect(applied).toEqual({ applied: 1, written: true });
    const next = await readDocxBytes(new Uint8Array(await readFile(filePath)));
    expect(next.blocks[0]?.preview).toBe("Updated");
    expect(await applyDocxBytes(helloDocx(), [])).toMatchObject({ applied: 0 });
  });

  test("inserts, comments, sets a header, adds a footnote, and rejects the batch on a refused op", async () => {
    const applied = await applyDocxBytes(helloDocx(), [
      { op: "set_text", block: 0, text: "Updated" },
      { op: "insert_content", afterBlockIndex: 0, html: "<p>Next</p>" },
      { op: "add_comment", blockIndex: 0, comment: "Look" },
      { op: "set_header_footer", kind: "header", text: "Running" },
      { op: "insert_footnote", blockIndex: 0, text: "Source" }
    ]);
    expect(applied.bytes).not.toEqual(helloDocx());
    const read = await readDocxBytes(applied.bytes);
    expect(read.blocks.map((block) => block.preview)).toEqual(["Updated", "Next"]);
    expect(read.comments).toEqual([
      expect.objectContaining({ text: "Look", blockIndex: 0 })
    ]);
    expect(read.headerFooter.header).toBe("Running");
    expect(read.notes).toEqual([
      expect.objectContaining({ kind: "footnote", text: "Source", blockIndex: 0 })
    ]);

    const directory = await mkdtemp(join(tmpdir(), "lyra-office-docx-refuse-"));
    const filePath = join(directory, "note.docx");
    const original = Buffer.from(helloDocx());
    await writeFile(filePath, original);
    const before = await stat(filePath);
    await expect(applyDocxFile(filePath, [
      { op: "set_text", block: 0, text: "Updated" },
      { op: "insert_image", url: "https://example.com/a.png" }
    ])).rejects.toBeInstanceOf(OfficeDocxError);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
  });

  test("formats a block, replaces text, changes page orientation, and deletes a block", async () => {
    const bold = await applyDocxBytes(helloDocx(), [
      { op: "setFont", target: { blockIndexes: [0] }, bold: true }
    ]);
    const boldXml = unzipEntry(bold.bytes, "word/document.xml");
    expect(boldXml).toMatch(/<w:b(?:\s[^>]*\/>|\/>)/);
    expect(boldXml).toContain("Hello");

    const replaced = await applyDocxBytes(helloDocx(), [
      { op: "findReplace", find: "Hello", replace: "There" }
    ]);
    const replacedRead = await readDocxBytes(replaced.bytes);
    expect(replacedRead.blocks[0]?.preview).toBe("There");

    const landscape = await applyDocxBytes(helloDocx(), [
      { op: "set_page_setup", orientation: "landscape" }
    ]);
    const landscapeXml = unzipEntry(landscape.bytes, "word/document.xml");
    expect(landscapeXml).toMatch(/<w:sectPr[\s\S]*w:orient="landscape"[\s\S]*<\/w:sectPr>/);

    const deleted = await applyDocxBytes(helloDocx(), [
      { op: "deleteBlocks", target: { blockIndexes: [0] } }
    ]);
    const deletedRead = await readDocxBytes(deleted.bytes);
    expect(deletedRead.blocks.map((block) => block.preview)).not.toContain("Hello");
  });

  test("accepts a tracked insertion and refuses a batch that includes an image", async () => {
    const tracked = zip([
      {
        name: "[Content_Types].xml",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
      },
      {
        name: "_rels/.rels",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
      },
      {
        name: "word/_rels/document.xml.rels",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
      },
      {
        name: "word/document.xml",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:ins w:id="1" w:author="Ada" w:date="2024-01-01T00:00:00Z">
        <w:r><w:t>Added</w:t></w:r>
      </w:ins>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`)
      }
    ]);
    const before = await readDocxBytes(tracked);
    expect(before.revisions).toEqual([
      expect.objectContaining({ id: "r1", type: "insertion", blockIndex: 0, text: "Added" })
    ]);
    const accepted = await applyDocxBytes(tracked, [{ op: "accept_changes", all: true }]);
    const acceptedXml = unzipEntry(accepted.bytes, "word/document.xml");
    expect(acceptedXml).not.toContain("<w:ins");
    expect(acceptedXml).toContain("Added");
    const after = await readDocxBytes(accepted.bytes);
    expect(after.revisions).toEqual([]);
    expect(after.blocks[0]?.preview).toBe("Added");

    const directory = await mkdtemp(join(tmpdir(), "lyra-office-docx-format-refuse-"));
    const filePath = join(directory, "note.docx");
    const original = Buffer.from(helloDocx());
    await writeFile(filePath, original);
    const stamp = await stat(filePath);
    await expect(applyDocxFile(filePath, [
      { op: "setFont", target: { blockIndexes: [0] }, bold: true },
      { op: "insert_image", url: "https://example.com/a.png" }
    ])).rejects.toBeInstanceOf(OfficeDocxError);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(stamp.mtimeMs);
  });

  test("inserts a table row, a bookmark field, a toc, a chart, and a text box", async () => {
    const table = await readDocxBytes(tableDocx());
    const tableBlock = table.blocks.find((block) => block.type === "table");
    expect(tableBlock).toBeDefined();
    const rowed = await applyDocxBytes(tableDocx(), [
      { op: "insertTableRow", target: { blockIndexes: [tableBlock?.index] }, row: 0, position: "after" }
    ]);
    const rowedXml = unzipEntry(rowed.bytes, "word/document.xml");
    expect(rowedXml.match(/<w:tr\b/g)?.length).toBe(3);
    expect(rowedXml).toContain("Alpha");

    const marked = await applyDocxBytes(helloDocx(), [
      { op: "insertBookmark", target: { blockIndexes: [0] }, name: "Here" },
      { op: "insertField", target: { blockIndexes: [0] }, type: "REF", args: "Here" }
    ]);
    const markedXml = unzipEntry(marked.bytes, "word/document.xml");
    expect(markedXml).toContain("Here");
    expect(markedXml).toContain("Hello");

    const listed = await applyDocxBytes(helloDocx(), [
      { op: "setHeadingLevel", target: { blockIndexes: [0] }, level: 1 },
      { op: "insertToc", afterBlockIndex: -1 }
    ]);
    expect(unzipEntry(listed.bytes, "word/document.xml")).toMatch(/TOC|w:fldChar/);

    const charted = await applyDocxBytes(helloDocx(), [
      {
        op: "insert_chart",
        kind: "bar",
        title: "Sales",
        categories: ["East"],
        series: [{ name: "Units", values: [3] }],
        afterBlockIndex: 0
      }
    ]);
    const chartedRead = await readDocxBytes(charted.bytes);
    expect(chartedRead.blocks.some((block) => block.type === "chart")).toBe(true);
    expect(unzipEntry(charted.bytes, "word/charts/chart1.xml") + zipTexts(charted.bytes).find((entry) => entry.name.endsWith("workbook1.xlsx"))?.text).toContain("East");

    const boxed = await applyDocxBytes(helloDocx(), [
      { op: "insert_text_box", text: "Callout", width: "3cm", height: "2cm", x: "1cm", y: "1cm", afterBlockIndex: 0 }
    ]);
    expect(unzipEntry(boxed.bytes, "word/document.xml")).toContain("Callout");
  });

  test("defines a style, sets a text watermark, and accepts a revision by author", async () => {
    const styled = await applyDocxBytes(helloDocx(), [
      { op: "define_style", styleId: "Quote", name: "Quote", paragraph: { align: "center" } },
      { op: "applyStyle", target: { blockIndexes: [0] }, styleId: "Quote" }
    ]);
    expect(unzipEntry(styled.bytes, "word/styles.xml")).toContain("Quote");
    const styledRead = await readDocxBytes(styled.bytes);
    expect(styledRead.styles).toEqual(expect.arrayContaining([
      expect.objectContaining({ styleId: "Quote", name: "Quote" })
    ]));

    const marked = await applyDocxBytes(helloDocx(), [
      { op: "set_watermark", text: "DRAFT" }
    ]);
    const header = zipTexts(marked.bytes).find((entry) => entry.name.includes("header"));
    expect(header?.text).toContain("DRAFT");

    const tracked = zip([
      {
        name: "[Content_Types].xml",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`)
      },
      {
        name: "_rels/.rels",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`)
      },
      {
        name: "word/_rels/document.xml.rels",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`)
      },
      {
        name: "word/document.xml",
        data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:ins w:id="1" w:author="Ada" w:date="2024-01-01T00:00:00Z">
        <w:r><w:t>Added</w:t></w:r>
      </w:ins>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`)
      }
    ]);
    const before = await readDocxBytes(tracked);
    expect(before.revisions).toEqual([
      expect.objectContaining({ author: "Ada", text: "Added" })
    ]);
    const accepted = await applyDocxBytes(tracked, [{ op: "accept_changes", author: "Ada" }]);
    const acceptedXml = unzipEntry(accepted.bytes, "word/document.xml");
    expect(acceptedXml).not.toContain("<w:ins");
    expect(acceptedXml).toContain("Added");
  });

  test("embeds a local image, resizes it, and paints a picture watermark", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-docx-image-"));
    const imagePath = join(directory, "dot.png");
    await writeFile(imagePath, TINY_PNG);
    const inserted = await applyDocxBytes(helloDocx(), [
      { op: "insert_image", url: imagePath, afterBlockIndex: 0 }
    ]);
    const insertedRead = await readDocxBytes(inserted.bytes);
    expect(insertedRead.blocks.some((block) => block.type === "image")).toBe(true);
    expect(zipTexts(inserted.bytes).some((entry) => entry.name.startsWith("word/media/"))).toBe(true);
    const beforeWidth = unzipEntry(inserted.bytes, "word/document.xml");
    const resized = await applyDocxBytes(inserted.bytes, [
      { op: "setImageProperties", target: { nodeType: "image" }, widthPx: 40 }
    ]);
    const afterWidth = unzipEntry(resized.bytes, "word/document.xml");
    expect(afterWidth).not.toBe(beforeWidth);
    expect(afterWidth).toContain("Hello");

    const watermarked = await applyDocxBytes(helloDocx(), [
      { op: "set_watermark", image: imagePath }
    ]);
    const header = zipTexts(watermarked.bytes).find((entry) => entry.name.includes("header"));
    expect(header?.text).toMatch(/imagedata|a:blip|v:imagedata/);
  });
});

describe("office preview", () => {
  test("validates actual format and returns bounded metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "lyra-office-preview-"));
    try {
      const path = join(root, "sample.pdf");
      await writeFile(path, "%PDF-1.7\nfixture");
      expect(await previewOfficeFile(path)).toMatchObject({ format: "pdf", title: "sample.pdf", byteLength: 16 });
      await writeFile(path, "not a pdf");
      await expect(previewOfficeFile(path)).rejects.toMatchObject({ code: "invalid" });
      const disguised = join(root, "wrong.docx");
      await writeFile(disguised, "%PDF-1.7");
      await expect(previewOfficeFile(disguised)).rejects.toMatchObject({ code: "invalid" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("sniffs OOXML packages and rejects mismatches and oversized files", async () => {
    const root = await mkdtemp(join(tmpdir(), "lyra-office-packages-"));
    try {
      for (const [format, bytes] of [["docx", helloDocx()], ["xlsx", helloSheet()], ["pptx", helloDeck()]] as const) {
        const path = join(root, `sample.${format}`);
        await writeFile(path, bytes);
        expect((await previewOfficeFile(path)).format).toBe(format);
      }
      const disguised = join(root, "wrong.docx");
      await writeFile(disguised, helloSheet());
      await expect(previewOfficeFile(disguised)).rejects.toMatchObject({ code: "invalid" });
      const large = join(root, "large.pdf");
      const file = await open(large, "w");
      await file.truncate(64 * 1024 * 1024 + 1); await file.close();
      await expect(previewOfficeFile(large)).rejects.toMatchObject({ code: "too-large" });
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  test("rejects a file that is not an office document", async () => {
    await expect(previewOfficeFile("/tmp/note.txt")).rejects.toMatchObject({ code: "unsupported" });
  });

  test("rejects pdf edits and accepts docx, xlsx, and pptx", () => {
    expect(() => assertOfficeEditPath("/tmp/note.pdf", "read")).toThrow(/pdf/);
    expect(assertOfficeEditPath("/tmp/book.xlsx", "apply")).toBe("xlsx");
    expect(assertOfficeEditPath("/tmp/deck.pptx", "read")).toBe("pptx");
    expect(assertOfficeEditPath("/tmp/note.docx", "apply")).toBe("docx");
  });
});



const chartSheet = (): Uint8Array => zip([
  {
    name: "[Content_Types].xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`)
  },
  {
    name: "_rels/.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
  },
  {
    name: "xl/_rels/workbook.xml.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`)
  },
  {
    name: "xl/workbook.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>
  <definedNames><definedName name="Total">Sheet1!$B$1</definedName></definedNames>
</workbook>`)
  },
  {
    name: "xl/worksheets/sheet1.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>Hello</t></is></c><c r="B1"><v>42</v></c></row>
  </sheetData>
</worksheet>`)
  },
  {
    name: "xl/charts/chart1.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <c:chart>
    <c:plotArea>
      <c:barChart>
        <c:ser><c:val><c:numRef><c:f>Sheet1!$B$1</c:f></c:numRef></c:val></c:ser>
      </c:barChart>
    </c:plotArea>
  </c:chart>
</c:chartSpace>`)
  }
]);



const shapeDeck = (
  box: { readonly x: number; readonly y: number; readonly cx: number; readonly cy: number },
  text: string,
  notes?: string
): Uint8Array => zip([
  {
    name: "[Content_Types].xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  ${notes ? '<Override PartName="/ppt/notesSlides/notesSlide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>' : ""}
</Types>`)
  },
  {
    name: "_rels/.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`)
  },
  {
    name: "ppt/_rels/presentation.xml.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`)
  },
  {
    name: "ppt/presentation.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>
  <p:sldSz cx="9144000" cy="6858000"/>
</p:presentation>`)
  },
  {
    name: "ppt/slides/_rels/slide1.xml.rels",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${notes ? '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>' : ""}
</Relationships>`)
  },
  {
    name: "ppt/slides/slide1.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:spPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.cx}" cy="${box.cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>
        <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`)
  },
  ...(notes ? [{
    name: "ppt/notesSlides/notesSlide1.xml",
    data: xml(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree>
    <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
    <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    <p:sp>
      <p:nvSpPr><p:cNvPr id="3" name="Notes"/><p:cNvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr>
      <p:spPr/>
      <p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${notes}</a:t></a:r></a:p></p:txBody>
    </p:sp>
  </p:spTree></p:cSld>
</p:notes>`)
  }] : [])
]);

describe("office sheet and slide edits", () => {
  test("reads cells, writes a value, and stores a formula without evaluating it", async () => {
    const read = await readXlsxBytes(helloSheet());
    expect(read.truncated).toBe(false);
    expect(read.sheets[0]?.cells).toEqual([
      { address: "A1", value: "Hello" },
      { address: "B1", value: 42 }
    ]);

    const valued = await applyXlsxBytes(helloSheet(), [
      { op: "set_cell", cell: "B2", value: "Updated" }
    ]);
    expect(valued.applied).toBe(1);
    const next = await readXlsxBytes(valued.bytes);
    expect(next.sheets[0]?.cells).toContainEqual({ address: "B2", value: "Updated" });

    const formulated = await applyXlsxBytes(helloSheet(), [
      { op: "set_formula", cell: "C2", formula: "SUM(A1:A2)" }
    ]);
    const formulaCell = (await readXlsxBytes(formulated.bytes)).sheets[0]?.cells.find((cell) => cell.address === "C2");
    expect(formulaCell?.formula).toBe("=SUM(A1:A2)");
    expect(formulaCell?.value).toBeNull();
  });

  test("caches a formula, converts it, and pivots formula cells", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-formula-"));
    const filePath = join(directory, "book.xlsx");
    await applyXlsxFile(filePath, [{ op: "create_xlsx" }]);
    await applyXlsxFile(filePath, [
      { op: "set_formula", cell: "C2", formula: "1+2" }
    ]);
    const cached = (await readXlsxBytes(new Uint8Array(await readFile(filePath)))).sheets[0]?.cells
      .find((cell) => cell.address === "C2");
    expect(cached).toEqual({ address: "C2", value: 3, formula: "=1+2" });

    await applyXlsxFile(filePath, [
      { op: "set_formula", cell: "C3", formula: "NOSUCH(1)" }
    ]);
    const unknown = (await readXlsxBytes(new Uint8Array(await readFile(filePath)))).sheets[0]?.cells
      .find((cell) => cell.address === "C3");
    expect(unknown?.formula).toBe("=NOSUCH(1)");
    expect(unknown?.value).toBeNull();

    const converted = await applyXlsxBytes(new Uint8Array(await readFile(filePath)), [
      { op: "convert_to_values", range: "C2:C2" }
    ]);
    expect((await readXlsxBytes(converted.bytes)).sheets[0]?.cells.find((cell) => cell.address === "C2"))
      .toEqual({ address: "C2", value: 3 });

    const brokenPath = join(directory, "broken.xlsx");
    await applyXlsxFile(brokenPath, [
      { op: "create_xlsx" },
      { op: "set_formula", cell: "A1", formula: "1/0" }
    ]);
    expect((await readXlsxBytes(new Uint8Array(await readFile(brokenPath)))).checks).toEqual([
      { code: "formula_error", sheet: "Sheet1", address: "A1", message: "#DIV/0!" }
    ]);

    const pivotPath = join(directory, "pivot.xlsx");
    await applyXlsxFile(pivotPath, [
      { op: "create_xlsx" },
      { op: "set_cell", cell: "A1", value: "Item" },
      { op: "set_cell", cell: "B1", value: "Amount" },
      { op: "set_cell", cell: "A2", value: "a" },
      { op: "set_formula", cell: "B2", formula: "1+2" },
      { op: "set_cell", cell: "A3", value: "a" },
      { op: "set_formula", cell: "B3", formula: "2+2" }
    ]);
    await applyXlsxFile(pivotPath, [{
      op: "add_pivot",
      sourceRange: "A1:B3",
      targetCell: "D1",
      rowFields: "Item",
      values: [{ field: "Amount", agg: "sum" }]
    }]);
    const pivotCells = (await readXlsxBytes(new Uint8Array(await readFile(pivotPath)))).sheets[0]?.cells ?? [];
    expect(pivotCells.some((cell) => cell.value === 7)).toBe(true);
  });

  test("rejects an invalid cell batch without writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-xlsx-"));
    const filePath = join(directory, "book.xlsx");
    const original = Buffer.from(helloSheet());
    await writeFile(filePath, original);
    const before = await stat(filePath);
    await expect(applyXlsxFile(filePath, [
      { op: "set_cell", cell: "B2", value: "Ok" },
      { op: "set_cell", cell: "nope", value: "Bad" }
    ])).rejects.toBeInstanceOf(OfficeXlsxError);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
  });

  test("writes a range, clears it, merges cells, and adds a sheet", async () => {
    const ranged = await applyXlsxBytes(helloSheet(), [
      { op: "set_range", start: "A2", values: [["Left", 7], ["Right", 8]] }
    ]);
    const rangedRead = await readXlsxBytes(ranged.bytes);
    expect(rangedRead.sheets[0]?.cells).toEqual(expect.arrayContaining([
      { address: "A2", value: "Left" },
      { address: "B2", value: 7 },
      { address: "A3", value: "Right" },
      { address: "B3", value: 8 }
    ]));

    const cleared = await applyXlsxBytes(ranged.bytes, [
      { op: "clear_range", range: "B1:B1" }
    ]);
    expect((await readXlsxBytes(cleared.bytes)).sheets[0]?.cells.some((cell) => cell.address === "B1")).toBe(false);

    const merged = await applyXlsxBytes(helloSheet(), [
      { op: "merge_cells", range: "A1:B1" }
    ]);
    const sheetXml = unzipEntry(merged.bytes, "xl/worksheets/sheet1.xml");
    expect(sheetXml).toContain("A1:B1");

    const added = await applyXlsxBytes(helloSheet(), [
      { op: "add_sheet", name: "Notes" }
    ]);
    expect((await readXlsxBytes(added.bytes)).sheets.map((sheet) => sheet.name)).toEqual(["Sheet1", "Notes"]);
  });

  test("hides a row, lists a chart and a defined name, and renames that chart", async () => {
    const hidden = await applyXlsxBytes(helloSheet(), [
      { op: "set_rows_hidden", sheet: "Sheet1", row: 1, hidden: true }
    ]);
    expect(unzipEntry(hidden.bytes, "xl/worksheets/sheet1.xml")).toContain('hidden="1"');

    const read = await readXlsxBytes(chartSheet());
    expect(read.charts).toEqual([{ path: "xl/charts/chart1.xml", sheet: "Sheet1" }]);
    expect(read.names).toEqual([{ name: "Total", ref: "Sheet1!$B$1" }]);

    const directory = await mkdtemp(join(tmpdir(), "lyra-office-xlsx-chart-"));
    const filePath = join(directory, "book.xlsx");
    const original = Buffer.from(chartSheet());
    await writeFile(filePath, original);
    const before = await stat(filePath);
    const edited = await applyXlsxFile(filePath, [
      { op: "edit_chart", chartPath: "xl/charts/chart1.xml", title: "Renamed" }
    ]);
    expect(edited.written).toBe(true);
    expect(unzipEntry(new Uint8Array(await readFile(filePath)), "xl/charts/chart1.xml")).toContain("Renamed");
    expect((await stat(filePath)).mtimeMs).not.toBe(before.mtimeMs);
  });

  test("reads a slide element and replaces its text", async () => {
    const read = await readPptxBytes(helloDeck());
    const element = read.slides[0]?.elements.find((item) => item.preview === "Hello slide");
    expect(element).toMatchObject({ type: "shape", preview: "Hello slide" });
    expect(element?.id.startsWith("e_")).toBe(true);

    const applied = await applyPptxBytes(helloDeck(), [
      { op: "set_text", slide: 0, element: element?.id, text: "Updated" }
    ]);
    expect(applied.applied).toBe(1);
    const next = await readPptxBytes(applied.bytes);
    expect(next.slides[0]?.elements.some((item) => item.preview === "Updated")).toBe(true);
  });

  test("deletes a slide element through the engine operation", async () => {
    const read = await readPptxBytes(helloDeck());
    const element = read.slides[0]?.elements.find((item) => item.preview === "Hello slide");
    const applied = await applyPptxBytes(helloDeck(), [
      { op: "deleteElement", target: { slide: 0, el: element?.id } }
    ]);
    expect(applied.applied).toBe(1);
    const next = await readPptxBytes(applied.bytes);
    expect(next.slides[0]?.elements.some((item) => item.preview === "Hello slide")).toBe(false);
  });

  test("rejects an unknown slide element without writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-pptx-"));
    const filePath = join(directory, "deck.pptx");
    const original = Buffer.from(helloDeck());
    await writeFile(filePath, original);
    const before = await stat(filePath);
    await expect(applyPptxFile(filePath, [
      { op: "set_text", slide: 0, element: "e_missing", text: "Nope" }
    ])).rejects.toBeInstanceOf(OfficePptxError);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
  });

  test("rejects an unknown slide operation without writing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-pptx-op-"));
    const filePath = join(directory, "deck.pptx");
    const original = Buffer.from(helloDeck());
    await writeFile(filePath, original);
    const before = await stat(filePath);
    await expect(applyPptxFile(filePath, [
      { op: "not_a_real_op", target: { slide: 0, el: "e_2" } }
    ])).rejects.toThrow(/unknown op/);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(before.mtimeMs);
  });

  test("reads slide position and notes, and a wrong field includes the signature", async () => {
    const box = { x: 457200, y: 365760, cx: 2743200, cy: 914400 };
    const read = await readPptxBytes(shapeDeck(box, "Inside", "Speak this"));
    expect(read.slides[0]?.notes).toBe("Speak this");
    expect(read.slides[0]?.elements[0]).toMatchObject({ ...box, preview: "Inside" });
    expect(read.slides[0]?.issues).toEqual([]);

    const directory = await mkdtemp(join(tmpdir(), "lyra-office-pptx-field-"));
    const filePath = join(directory, "deck.pptx");
    const original = Buffer.from(shapeDeck(box, "Inside"));
    await writeFile(filePath, original);
    const stamp = await stat(filePath);
    await expect(applyPptxFile(filePath, [
      { op: "setTransform", target: { slide: 0, el: read.slides[0]?.elements[0]?.id }, width: 1 }
    ])).rejects.toThrow(/Usage: setTransform/);
    expect(Buffer.from(await readFile(filePath))).toEqual(original);
    expect((await stat(filePath)).mtimeMs).toBe(stamp.mtimeMs);
  });

  test("reports a shape past the page edge and clears it with the suggested transform", async () => {
    const box = { x: 8000000, y: 457200, cx: 2743200, cy: 914400 };
    const bytes = shapeDeck(box, "Hi");
    const read = await readPptxBytes(bytes);
    const element = read.slides[0]?.elements[0];
    const issue = read.slides[0]?.issues.find((item) => item.code === "out_of_bounds" && item.el === element?.id);
    expect(issue?.suggest).toMatchObject({ op: "setTransform", target: { el: element?.id } });

    const applied = await applyPptxBytes(bytes, [issue?.suggest]);
    const next = await readPptxBytes(applied.bytes);
    expect(next.slides[0]?.issues.some((item) => item.code === "out_of_bounds" && item.el === element?.id)).toBe(false);
    expect(next.slides[0]?.elements[0]?.x).not.toBe(box.x);
  });

  test("builds a deck and replaces one page without moving the other page's ids", async () => {
    const page = (text: string) => ({
      elements: [{
        type: "text",
        x: 80,
        y: 80,
        w: 480,
        h: 80,
        paragraphs: [{ runs: [{ text, sizePt: 28 }] }]
      }]
    });
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-deck-"));
    const filePath = join(directory, "deck.pptx");
    await expect(applyPptxFile(filePath, [
      { op: "set_text", slide: 0, element: "e_1", text: "No" }
    ])).rejects.toThrow();
    await expect(stat(filePath)).rejects.toThrow();

    await applyPptxFile(filePath, [{ op: "build_deck", pages: [page("Title"), page("Other")] }]);
    const read = await readPptxBytes(new Uint8Array(await readFile(filePath)));
    expect(read.slides[0]?.elements.some((element) => element.preview.includes("Title"))).toBe(true);
    expect(read.slides[1]?.elements.some((element) => element.preview.includes("Other"))).toBe(true);
    const kept = read.slides[1]?.elements.map((element) => element.id);

    await applyPptxFile(filePath, [{ op: "replace_slide", index: 0, page: page("Replaced") }]);
    const next = await readPptxBytes(new Uint8Array(await readFile(filePath)));
    expect(next.slides[0]?.elements.some((element) => element.preview.includes("Replaced"))).toBe(true);
    expect(next.slides[1]?.elements.map((element) => element.id)).toEqual(kept);
    expect(next.slides[1]?.elements.some((element) => element.preview.includes("Other"))).toBe(true);
  });
});



describe("office file creation", () => {
  test("creates a workbook and a document only when the path is new", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lyra-office-create-"));
    const sheetPath = join(directory, "new.xlsx");
    await expect(applyXlsxFile(sheetPath, [
      { op: "set_cell", cell: "A1", value: "No" }
    ])).rejects.toThrow();
    await expect(stat(sheetPath)).rejects.toThrow();

    await applyXlsxFile(sheetPath, [
      { op: "create_xlsx" },
      { op: "set_cell", cell: "A1", value: "Made" }
    ]);
    const sheet = await readXlsxBytes(new Uint8Array(await readFile(sheetPath)));
    expect(sheet.sheets[0]?.cells).toContainEqual({ address: "A1", value: "Made" });
    await expect(applyXlsxFile(sheetPath, [{ op: "create_xlsx" }])).rejects.toThrow(/already exists/);

    const docPath = join(directory, "new.docx");
    await applyDocxFile(docPath, [{ op: "create_docx", markdown: "# Hello\n\nBody" }]);
    const doc = await readDocxFile(docPath);
    expect(doc.blocks.map((block) => block.preview).join("\n")).toContain("Hello");
    expect(doc.blocks.map((block) => block.preview).join("\n")).toContain("Body");
    await expect(applyDocxFile(docPath, [{ op: "create_docx", markdown: "Again" }])).rejects.toThrow(/already exists/);

    const pdfPath = join(directory, "note.pdf");
    await writeFile(pdfPath, helloPdf());
    const convertedPath = join(directory, "from-pdf.docx");
    await applyDocxFile(convertedPath, [{ op: "convert_pdf", source: pdfPath }]);
    const converted = await readDocxFile(convertedPath);
    expect(converted.blocks.map((block) => block.preview).join("\n")).toContain("Hello");
    await expect(applyDocxFile(convertedPath, [{ op: "convert_pdf", source: pdfPath }])).rejects.toThrow(/already exists/);

    const sheetPathFromPdf = join(directory, "from-pdf.xlsx");
    await applyXlsxFile(sheetPathFromPdf, [{ op: "convert_pdf", source: pdfPath }]);
    expect(JSON.stringify((await readXlsxBytes(new Uint8Array(await readFile(sheetPathFromPdf)))).sheets)).toContain("Hello");
    const deckPathFromPdf = join(directory, "from-pdf.pptx");
    await applyPptxFile(deckPathFromPdf, [{ op: "convert_pdf", source: pdfPath }]);
    const deck = await readPptxBytes(new Uint8Array(await readFile(deckPathFromPdf)));
    expect(deck.slides.some((slide) => slide.elements.some((element) => element.preview.includes("Hello")))).toBe(true);
    expect(() => assertOfficeEditPath(pdfPath, "apply")).toThrow(/pdf/);
  });
});
