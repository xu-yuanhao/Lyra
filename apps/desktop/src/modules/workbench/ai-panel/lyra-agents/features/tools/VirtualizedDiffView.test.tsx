import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { DiffHunk } from "../../core/types";
import {
  VirtualizedDiffView,
  flattenDiffHunks
} from "./VirtualizedDiffView";

const sampleHunks: DiffHunk[] = [
  {
    startLine: 10,
    lines: [
      { kind: "ctx", text: "unchanged" },
      { kind: "add", text: "added line" },
      { kind: "del", text: "removed line" }
    ]
  }
];

describe("VirtualizedDiffView helpers", () => {
  test("flattens hunks with stable line numbers", () => {
    const lines = flattenDiffHunks(sampleHunks);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ lineNumber: 10, kind: "ctx", text: "unchanged" });
    expect(lines[1]).toMatchObject({ lineNumber: 11, kind: "add", text: "added line" });
    expect(lines[2]).toMatchObject({ lineNumber: 12, kind: "del", text: "removed line" });
  });


});

describe("VirtualizedDiffView", () => {
  test("renders diff lines inside a scroll viewport", () => {
    render(<VirtualizedDiffView hunks={sampleHunks} />);
    const viewport = document.querySelector(".lyra-agents-diff-viewport");
    expect(viewport).toBeTruthy();
    expect(document.querySelector(".lyra-agents-diff-width-probe")).toBeTruthy();
    expect(
      viewport?.querySelectorAll(".lyra-agents-diff-viewport-track > .lyra-agents-diff-line").length
    ).toBe(3);
    expect(screen.getByText("added line")).toBeTruthy();
    expect(screen.getAllByText("removed line").length).toBeGreaterThanOrEqual(1);
  });

  test("running diff follows the bottom until the pointer hovers it", () => {
    const hunk = (text: string): DiffHunk => ({
      startLine: 1,
      lines: [{ kind: "add", text }]
    });
    const view = render(<VirtualizedDiffView hunks={[hunk("one")]} running />);
    const scroller = document.querySelector(".lyra-agents-diff-viewport") as HTMLDivElement;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 40 });
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 200 });
    scroller.scrollTop = 0;

    view.rerender(<VirtualizedDiffView hunks={[hunk("one"), hunk("two")]} running />);
    expect(scroller.scrollTop).toBe(200);

    fireEvent.mouseEnter(scroller);
    scroller.scrollTop = 10;
    Object.defineProperty(scroller, "scrollHeight", { configurable: true, value: 280 });
    view.rerender(<VirtualizedDiffView hunks={[hunk("one"), hunk("two"), hunk("three")]} running />);
    expect(scroller.scrollTop).toBe(10);

    fireEvent.mouseLeave(scroller);
    expect(scroller.scrollTop).toBe(280);
  });

  test("returns null when there are no diff lines", () => {
    const { container } = render(<VirtualizedDiffView hunks={[]} />);
    expect(container.firstChild).toBeNull();
  });
});