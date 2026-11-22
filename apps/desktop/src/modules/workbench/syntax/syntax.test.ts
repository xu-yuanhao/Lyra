import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { languageFromPath, languageFromPathAndContent, looksLikeUnifiedDiff } from "./language-from-path";
import { LYRA_SYNTAX_DARK, syntaxHex } from "./palette";

const here = dirname(fileURLToPath(import.meta.url));

describe("languageFromPath", () => {
  test("maps common source extensions onto Monaco/Shiki language ids", () => {
    expect(languageFromPath("src/app.ts")).toBe("typescript");
    expect(languageFromPath("src/app.tsx")).toBe("typescript");
    expect(languageFromPath("main.rs")).toBe("rust");
    expect(languageFromPath("script.py")).toBe("python");
    expect(languageFromPath("pkg/mod.go")).toBe("go");
    expect(languageFromPath("schema.prisma")).toBe("prisma");
    expect(languageFromPath("Dockerfile")).toBe("dockerfile");
    expect(languageFromPath("notes.diff")).toBe("diff");
    expect(languageFromPath("fix.patch")).toBe("diff");
    expect(languageFromPath("unknown.bin")).toBe("plaintext");
  });

  test("detects extensionless unified-diff dumps without hijacking source files", () => {
    const diff = ["--- a.ts", "+++ a.ts", "@@ -1 +1 @@", "-let x = 1;", "+let x = 2;"].join("\n");
    expect(looksLikeUnifiedDiff(diff)).toBe(true);
    expect(looksLikeUnifiedDiff("# Title\n\n---\n\nBody with @@ leftover")).toBe(false);
    expect(languageFromPathAndContent("artifact-chatcmpl", diff)).toBe("diff");
    expect(languageFromPathAndContent("src/app.ts", diff)).toBe("typescript");
  });
});

describe("syntax palette", () => {
  test("strips hash for Monaco token foregrounds", () => {
    expect(syntaxHex(LYRA_SYNTAX_DARK.keyword)).toBe("c678dd");
  });

  test("chat and source CSS actually paint Shiki token variables", () => {
    const chatClasses = readFileSync(
      resolve(here, "../ai-panel/lyra-agents/features/rich-text/classes.ts"),
      "utf8"
    );
    const source = readFileSync(
      resolve(here, "highlighted-source.tsx"),
      "utf8"
    );
    expect(chatClasses).toContain("var(--sdm-c,inherit)");
    expect(chatClasses).toContain("var(--shiki-dark,var(--sdm-c,inherit))");
    expect(source).toContain("var(--sdm-c,inherit)");
    expect(source).toContain("var(--shiki-dark,var(--sdm-c,inherit))");
  });
});
