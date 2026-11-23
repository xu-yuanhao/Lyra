import { describe, expect, test } from "vitest";

import type { FileManagerEntry } from "../../../../shared/file-manager";
import {
  flattenVisibleRows,
  prepareEntries
} from "../visible-rows";

const file = (name: string, path: string): FileManagerEntry => ({
  id: path,
  name,
  path,
  kind: "file",
  isHidden: false
});

const directory = (name: string, path: string): FileManagerEntry => ({
  id: path,
  name,
  path,
  kind: "directory",
  isHidden: false,
  folderState: "non-empty"
});

describe("prepareEntries", () => {
  test("hides noise directories and hidden files while keeping project files", () => {
    const entries = prepareEntries([
      file("package.json", "/p/package.json"),
      directory("node_modules", "/p/node_modules"),
      directory("vendor", "/p/vendor"),
      directory("src", "/p/src"),
      { ...file(".env", "/p/.env"), isHidden: true }
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["src", "package.json"]);
  });

  test("hides local scratch directories such as .tmp-test", () => {
    const entries = prepareEntries([
      file("README.md", "/p/README.md"),
      directory(".tmp-test", "/p/.tmp-test")
    ]);
    expect(entries.map((entry) => entry.name)).toEqual(["README.md"]);
  });
});

describe("flattenVisibleRows", () => {
  test("walks only expanded directories and keeps collapsed children out of the list", () => {
    const rows = flattenVisibleRows({
      rootPath: "/p",
      expandedPaths: new Set(["/p", "/p/src"]),
      directoryStates: {
        "/p": {
          status: "ready",
          entries: [directory("src", "/p/src"), file("README.md", "/p/README.md")],
          errorMessage: null
        },
        "/p/src": {
          status: "ready",
          entries: [file("main.ts", "/p/src/main.ts"), directory("nested", "/p/src/nested")],
          errorMessage: null
        }
      }
    });
    expect(rows.map((row) => row.kind === "entry" ? row.entry.name : row.kind)).toEqual([
      "src",
      "nested",
      "main.ts",
      "README.md"
    ]);
  });

  test("shows a loading row under expanded directories before their listing is ready", () => {
    const rows = flattenVisibleRows({
      rootPath: "/p",
      expandedPaths: new Set(["/p", "/p/src"]),
      directoryStates: {
        "/p": {
          status: "ready",
          entries: [directory("src", "/p/src")],
          errorMessage: null
        }
      }
    });
    expect(rows).toEqual([
      {
        kind: "entry",
        key: "/p/src",
        depth: 1,
        entry: directory("src", "/p/src")
      },
      {
        kind: "loading",
        key: "loading:/p/src",
        depth: 2
      }
    ]);
  });
});
