/**
 * Workspace root detection.
 */

import { execFileSync } from "node:child_process";

export function resolveWorkspaceRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
      timeout: 5000,
    }).trim();
  } catch {
    return cwd || process.cwd();
  }
}
