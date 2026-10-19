import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runCommand = promisify(execFile);
const COMMAND_TIMEOUT_MS = 3_000;

/**
 * Reads the OS-credential-protected Chromium cookie secret.
 *
 * ponytail: KWallet and Windows DPAPI/App-Bound key extraction are not covered.
 * Those cases resolve to `null`, the affected cookies are counted as skipped,
 * and the import still writes everything it could read. Upgrade path: a native
 * helper that talks to the Secret Service/KWallet API directly.
 */
export const readMacSafeStorageSecret = async (service: string): Promise<string | null> => {
  try {
    const { stdout } = await runCommand(
      "security",
      ["find-generic-password", "-w", "-s", service],
      { encoding: "utf8", timeout: COMMAND_TIMEOUT_MS }
    );
    const secret = stdout.trim();
    return secret.length > 0 ? secret : null;
  } catch {
    return null;
  }
};

export const readLinuxKeyringSecret = async (
  application: string
): Promise<string | null> => {
  const queries: readonly string[][] = [
    ["lookup", "application", application],
    [
      "lookup",
      "xdg:schema",
      "chrome_libsecret_os_crypt_password_v2",
      "application",
      application
    ]
  ];
  for (const args of queries) {
    try {
      const { stdout } = await runCommand("secret-tool", args, {
        encoding: "utf8",
        timeout: COMMAND_TIMEOUT_MS
      });
      const secret = stdout.trim();
      if (secret.length > 0) {
        return secret;
      }
    } catch {
      // Missing secret-tool or locked keyring: fall through to the next query.
    }
  }
  return null;
};
