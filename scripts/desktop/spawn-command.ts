import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Resolve a bare command name (e.g. "pnpm", "npm") to an absolute .cmd path
 * on Windows. Node's spawn does not apply PATHEXT resolution, so a bare
 * "pnpm" fails with ENOENT even when pnpm.cmd is on PATH. Checking each
 * PATH entry manually mirrors what cmd.exe would do, without spawning a
 * shell (which would break on paths containing spaces).
 */
const resolveWindowsCommand = (command: string): string => {
  const isBareName = path.dirname(command) === ".";
  if (process.platform !== "win32" || !isBareName) {
    return command;
  }
  const pathDirs = (process.env.PATH ?? "").split(";").filter(Boolean);
  const extensions = (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
    .split(";")
    .map((ext) => ext.trim())
    .filter((ext) => ext.length > 0);
  for (const dir of pathDirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${command}${ext.toLowerCase()}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return command;
};

export const spawnCommand = (
  command: string,
  args: readonly string[],
  options: Parameters<typeof spawn>[2] = {}
): ChildProcess => {
  if (process.platform !== "win32") {
    return spawn(command, [...args], options);
  }
  const resolved = resolveWindowsCommand(command);
  if (/\.(cmd|bat)$/iu.test(resolved)) {
    // .cmd/.bat shims can only run through a shell. cmd.exe /S /C is used
    // with windowsVerbatimArguments so Node quotes the command path once;
    // /S keeps the outer quote pair intact even when the path contains
    // spaces. The entire tail must be wrapped in one outer quote pair:
    // cmd /c otherwise strips the quotes around a spaced path and fails
    // with "'C:\Program' is not recognized".
    const tail = [`"${resolved}"`, ...args].join(" ");
    return spawn("cmd.exe", ["/d", "/s", "/c", `"${tail}"`], {
      ...options,
      windowsVerbatimArguments: true
    });
  }
  // Executables (.exe, scripts run with an explicit interpreter) are spawned
  // directly as structured argv — no shell layer, so paths with spaces are
  // passed to the OS as-is. This is the same pattern the reference projects
  // use: avoid cmd.exe string parsing entirely.
  return spawn(resolved, [...args], options);
};