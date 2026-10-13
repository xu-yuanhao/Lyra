import { describe, expect, it } from "vitest";

import { splitSettledMarkdown, SettledMarkdownSplitter } from "../markdown-stream-split";

describe("splitSettledMarkdown", () => {
  it("keeps an incomplete paragraph in the tail", () => {
    expect(splitSettledMarkdown("A **bold phrase")).toEqual({
      settled: [],
      tail: "A **bold phrase"
    });
  });

  it("settles a completed paragraph on a blank line", () => {
    expect(splitSettledMarkdown("# Title\n\nBody still writing")).toEqual({
      settled: ["# Title\n\n"],
      tail: "Body still writing"
    });
  });

  it("does not settle blank lines inside an open fence", () => {
    const text = "Intro\n\n```ts\nconst x = 1\n\nconst y = 2";
    expect(splitSettledMarkdown(text)).toEqual({
      settled: ["Intro\n\n"],
      tail: "```ts\nconst x = 1\n\nconst y = 2"
    });
  });

  it("settles a closed fence and keeps the following tail", () => {
    const text = "```ts\nconst x = 1\n```\n\nAfter";
    expect(splitSettledMarkdown(text)).toEqual({
      settled: ["```ts\nconst x = 1\n```\n\n"],
      tail: "After"
    });
  });

  it("does not settle blank lines inside display math", () => {
    const text = "Before\n\n$$\na = b\n\nc = d\n$$\n\nAfter";
    expect(splitSettledMarkdown(text)).toEqual({
      settled: ["Before\n\n", "$$\na = b\n\nc = d\n$$\n\n"],
      tail: "After"
    });
  });

  it("treats a one-line bracket formula as closed", () => {
    expect(splitSettledMarkdown("Display:\n\n\\[e = mc^2\\]\n\nInline")).toEqual({
      settled: ["Display:\n\n", "\\[e = mc^2\\]\n\n"],
      tail: "Inline"
    });
  });

  it("keeps a list without a blank line in one tail", () => {
    expect(splitSettledMarkdown("- a\n- b\n- c")).toEqual({
      settled: [],
      tail: "- a\n- b\n- c"
    });
  });

  it("keeps footnote references and definitions in one tree", () => {
    const text = "See this[^1].\n\nLater text.\n\n[^1]: the note";
    expect(splitSettledMarkdown(text)).toEqual({
      settled: [],
      tail: text
    });
  });
});

it("settles whitespace-only separators without splitting footnote dependencies", () => {
  expect(splitSettledMarkdown("Intro\n \t\nSee this[^1].\n\nLater\n\n[^1]: note")).toEqual({
    settled: ["Intro\n \t\n"], tail: "See this[^1].\n\nLater\n\n[^1]: note"
  });
});

it("retains frozen blocks across appends and rebuilds on replacement", () => {
  const splitter = new SettledMarkdownSplitter();
  const first = splitter.split("A\n\npartial");
  const second = splitter.split("A\n\npartial continuation");
  expect(second.settled).toBe(first.settled);
  expect(splitter.split("Replaced\n\nnew")).toEqual({ settled: ["Replaced\n\n"], tail: "new" });
});

it("does not treat footnote examples inside code as document dependencies", () => {
  expect(splitSettledMarkdown("```md\n[^1]\n```\n\nNext").settled).toEqual(["```md\n[^1]\n```\n\n"]);
  expect(splitSettledMarkdown("Literal `[^1]`\n\nNext").settled).toEqual(["Literal `[^1]`\n\n"]);
});
