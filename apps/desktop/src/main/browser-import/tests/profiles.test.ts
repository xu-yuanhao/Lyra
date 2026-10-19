import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import {
  listBrowserImportProfiles,
  parseFirefoxProfilesIni,
  resolveBrowserImportProfile
} from "../profiles";

const temporaryHomes: string[] = [];

const createHome = (): string => {
  const home = mkdtempSync(join(tmpdir(), "lyra-browser-import-test-"));
  temporaryHomes.push(home);
  return home;
};

const writeFileAt = (path: string, contents: string): void => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
};

/** A Chromium install with two usable profiles plus one that has no cookie database. */
const createChromiumInstall = (home: string): string => {
  const userDataDir = join(home, ".config", "chromium");
  writeFileAt(
    join(userDataDir, "Local State"),
    JSON.stringify({
      profile: {
        info_cache: {
          Default: { name: "Work", user_name: "work@example.com" },
          "Profile 2": { name: "Pete", account_info: [{ email: "pete@example.com" }] }
        },
        last_used: "Profile 2"
      }
    })
  );
  writeFileAt(join(userDataDir, "Default", "Network", "Cookies"), "");
  writeFileAt(join(userDataDir, "Profile 2", "Cookies"), "");
  mkdirSync(join(userDataDir, "Profile 3"), { recursive: true });
  return userDataDir;
};

const createFirefoxInstall = (home: string): string => {
  const userDataDir = join(home, ".mozilla", "firefox");
  writeFileAt(
    join(userDataDir, "profiles.ini"),
    [
      "[Profile0]",
      "Name=default",
      "IsRelative=1",
      "Path=abc.default",
      "",
      "[Profile1]",
      "Name=work",
      "IsRelative=1",
      "Path=xyz.work",
      "Default=1"
    ].join("\n")
  );
  writeFileAt(join(userDataDir, "abc.default", "cookies.sqlite"), "");
  mkdirSync(join(userDataDir, "xyz.work"), { recursive: true });
  return userDataDir;
};

afterEach(() => {
  for (const home of temporaryHomes.splice(0)) {
    rmSync(home, { recursive: true, force: true });
  }
});

describe("listBrowserImportProfiles", () => {
  test("lists one entry per Chromium profile that holds a cookie database", async () => {
    const home = createHome();
    createChromiumInstall(home);

    const profiles = await listBrowserImportProfiles({ platform: "linux", homeDir: home, env: {} });

    expect(profiles.map((profile) => profile.profileName)).toEqual(["Work", "Pete"]);
    expect(profiles.map((profile) => profile.accountEmail)).toEqual([
      "work@example.com",
      "pete@example.com"
    ]);
    expect(profiles.map((profile) => profile.isDefault)).toEqual([true, false]);
    expect(profiles.map((profile) => profile.lastUsed)).toEqual([false, true]);
    expect(profiles.every((profile) => profile.family === "chromium")).toBe(true);
    // Profile 3 has no cookie database, so it never appears as an importable profile.
    expect(profiles).toHaveLength(2);
  });

  test("reads the cached account picture but never follows a name out of the profile", async () => {
    const home = createHome();
    const userDataDir = join(home, ".config", "chromium");
    writeFileAt(
      join(userDataDir, "Local State"),
      JSON.stringify({
        profile: {
          info_cache: {
            Default: {
              name: "Work",
              user_name: "work@example.com",
              gaia_picture_file_name: "Google Profile Picture.png"
            },
            "Profile 2": {
              name: "Pete",
              user_name: "pete@example.com",
              gaia_picture_file_name: "../stolen.png"
            }
          }
        }
      })
    );
    writeFileAt(join(userDataDir, "Default", "Cookies"), "");
    writeFileAt(join(userDataDir, "Profile 2", "Cookies"), "");
    writeFileAt(join(userDataDir, "Default", "Google Profile Picture.png"), "fake-png");
    writeFileAt(join(userDataDir, "stolen.png"), "never-read");

    const profiles = await listBrowserImportProfiles({ platform: "linux", homeDir: home, env: {} });

    expect(profiles[0]?.avatarDataUrl).toBe(
      `data:image/png;base64,${Buffer.from("fake-png").toString("base64")}`
    );
    expect(profiles[1]?.avatarDataUrl).toBeUndefined();
  });

  test("lists Firefox profiles from profiles.ini and skips profiles without cookies", async () => {
    const home = createHome();
    createFirefoxInstall(home);

    const profiles = await listBrowserImportProfiles({ platform: "linux", homeDir: home, env: {} });

    expect(profiles.map((profile) => profile.id)).toEqual([
      join(home, ".mozilla", "firefox", "abc.default")
    ]);
    expect(profiles[0]?.profileName).toBe("default");
    expect(profiles[0]?.isDefault).toBe(false);
    expect(profiles[0]?.family).toBe("firefox");
  });

  test("returns nothing when no browser data directory exists", async () => {
    const home = createHome();
    expect(await listBrowserImportProfiles({ platform: "linux", homeDir: home, env: {} })).toEqual(
      []
    );
  });
});

describe("resolveBrowserImportProfile", () => {
  test("resolves a detected profile to its cookie database", async () => {
    const home = createHome();
    const userDataDir = createChromiumInstall(home);
    const profilePath = join(userDataDir, "Profile 2");

    const resolved = await resolveBrowserImportProfile(profilePath, {
      platform: "linux",
      homeDir: home,
      env: {}
    });

    expect(resolved?.cookieDatabasePath).toBe(join(profilePath, "Cookies"));
    expect(resolved?.profile.profileName).toBe("Pete");
  });

  test("rejects a profile id that detection does not return", async () => {
    const home = createHome();
    createChromiumInstall(home);

    expect(
      await resolveBrowserImportProfile(join(home, ".config", "chromium", "Profile 9"), {
        platform: "linux",
        homeDir: home,
        env: {}
      })
    ).toBeNull();
  });
});

describe("parseFirefoxProfilesIni", () => {
  test("reads profile sections and ignores comments and other sections", () => {
    const entries = parseFirefoxProfilesIni(
      [
        "# comment",
        "[General]",
        "Version=2",
        "[Profile0]",
        "Name=dev",
        "Path=abc.dev",
        "",
        "[Profile1]",
        "Name=work",
        "IsRelative=0",
        "Path=/data/work",
        "Default=1"
      ].join("\n")
    );

    expect(entries).toEqual([
      { name: "dev", path: "abc.dev", isDefault: false },
      { name: "work", path: "/data/work", isDefault: true }
    ]);
  });
});
