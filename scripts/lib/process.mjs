/**
 * Process utilities — terminate process trees.
 */

import { execFile } from "node:child_process";

/**
 * Terminate a process and its children.
 */
export async function terminateProcessTree(pid) {
  if (!pid) return;

  // Try SIGTERM first, then SIGKILL
  try {
    // On Linux, kill the process group
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // Already dead
      return;
    }
  }

  // Give it a moment, then force kill
  await new Promise((resolve) => setTimeout(resolve, 1000));

  try {
    process.kill(pid, 0); // Check if still alive
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already dead
      }
    }
  } catch {
    // Already dead, good
  }
}
