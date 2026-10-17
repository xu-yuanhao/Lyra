import { mkdtemp, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { materializeLumenCapture, sweepLumenEvidence } from "../artifact-materializer";

const tempRoots: string[] = [];

const makeTempRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "lyra-lumen-sweep-"));
  tempRoots.push(root);
  return root;
};

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(async (root) => {
      await rm(root, { recursive: true, force: true });
    })
  );
});

describe("sweepLumenEvidence", () => {
  it("removes captures older than the TTL and keeps fresh ones", async () => {
    const storageRoot = await makeTempRoot();
    const artifact = await materializeLumenCapture(storageRoot, "tab-a", {
      mimeType: "image/png",
      imageBase64: Buffer.from("fresh").toString("base64"),
      width: 2,
      height: 2,
      visibleOnly: true
    });
    const stalePath = join(storageRoot, "lumen-evidence", "stale.png");
    await writeFile(stalePath, "stale");
    const staleTime = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await utimes(stalePath, staleTime, staleTime);

    const removed = await sweepLumenEvidence(storageRoot);

    expect(removed).toBe(1);
    await expect(stat(stalePath)).rejects.toThrow();
    await expect(stat(artifact.path)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("sweeps nothing when the evidence directory does not exist", async () => {
    const storageRoot = await makeTempRoot();
    expect(await sweepLumenEvidence(storageRoot)).toBe(0);
  });
});
