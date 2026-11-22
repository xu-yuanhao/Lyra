import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { ProblemsList } from "../problems-list";
import type { LspDiagnostic } from "../../../../shared/desktop-bridge";

const item: LspDiagnostic = {
  filePath: "/work/Lyra/src/a.ts",
  severity: 1,
  message: "missing",
  source: "ts",
  startLine: 3,
  startCharacter: 1,
  endLine: 3,
  endCharacter: 4
};

describe("ProblemsList", () => {
  test("shows an empty state", () => {
    render(
      <ProblemsList
        items={[]}
        rootPath="/work/Lyra"
        emptyLabel="No problems"
        listLabel="Problems"
        onOpenFile={vi.fn()}
      />
    );
    expect(screen.getByText("No problems")).toBeInTheDocument();
  });

  test("groups by file and opens a diagnostic at its location", () => {
    const onOpenFile = vi.fn();
    render(
      <ProblemsList
        items={[item]}
        rootPath="/work/Lyra"
        emptyLabel="No problems"
        listLabel="Problems"
        onOpenFile={onOpenFile}
      />
    );
    expect(screen.getByText("a.ts")).toBeInTheDocument();
    expect(screen.getByText("src")).toBeInTheDocument();
    expect(screen.getByText("ts")).toBeInTheDocument();
    expect(screen.getByText("[Ln 4, Col 2]")).toBeInTheDocument();
    fireEvent.click(screen.getByText("missing"));
    expect(onOpenFile).toHaveBeenCalledWith("/work/Lyra/src/a.ts", {
      line: 4,
      column: 2
    });
  });

  test("collapses a file group", () => {
    render(
      <ProblemsList
        items={[item]}
        rootPath="/work/Lyra"
        emptyLabel="No problems"
        listLabel="Problems"
        onOpenFile={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("treeitem", { expanded: true }));
    expect(screen.queryByText("missing")).not.toBeInTheDocument();
  });

  test("windows a large problems list instead of mounting every row", () => {
    const items = Array.from({ length: 200 }, (_, index) => ({
      ...item,
      filePath: `/work/Lyra/src/f-${String(index).padStart(3, "0")}.ts`,
      message: `err-${String(index).padStart(3, "0")}`
    }));
    render(
      <ProblemsList
        items={items}
        rootPath="/work/Lyra"
        emptyLabel="No problems"
        listLabel="Problems"
        onOpenFile={vi.fn()}
      />
    );
    expect(screen.getByText("f-000.ts")).toBeInTheDocument();
    expect(screen.getByText("err-000")).toBeInTheDocument();
    const mounted = document.querySelectorAll('[role="treeitem"]').length;
    expect(mounted).toBeGreaterThan(20);
    expect(mounted).toBeLessThan(200);
    expect(screen.queryByText("f-199.ts")).toBeNull();
  });
});
