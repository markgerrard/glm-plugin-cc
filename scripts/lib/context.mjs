/**
 * Context-gathering utilities: git diffs, file contents, etc.
 */

import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/**
 * Run a shell command and return stdout.
 */
function run(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: options.cwd,
      timeout: options.timeout || 30_000,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => { stdout += c; });
    proc.stderr.on("data", (c) => { stderr += c; });
    proc.on("close", (code) => resolve({ stdout, stderr, exitCode: code }));
    proc.on("error", reject);
  });
}

/**
 * Get the git diff for review context.
 * @param {string} base - Base ref (default: HEAD)
 * @param {string} scope - 'working-tree' | 'branch' | 'auto'
 */
export async function getGitDiff(base = "HEAD", scope = "auto") {
  if (scope === "working-tree" || scope === "auto") {
    // Staged + unstaged changes
    const staged = await run("git", ["diff", "--cached"]);
    const unstaged = await run("git", ["diff"]);
    const combined = (staged.stdout + "\n" + unstaged.stdout).trim();
    if (combined || scope === "working-tree") return combined;
  }

  // Branch scope: diff from base
  const result = await run("git", ["diff", `${base}...HEAD`]);
  return result.stdout.trim();
}

/**
 * Get recent git log for context.
 */
export async function getGitLog(count = 10) {
  const result = await run("git", ["log", `--oneline`, `-${count}`]);
  return result.stdout.trim();
}

/**
 * Read a file's contents, with size guard.
 */
export async function readFileContext(filePath, maxBytes = 100_000) {
  const info = await stat(filePath).catch(() => null);
  if (!info || !info.isFile()) return null;
  if (info.size > maxBytes) {
    return `[File ${filePath} is ${info.size} bytes — too large, skipped]`;
  }
  return readFile(filePath, "utf-8");
}

/**
 * Read piped stdin if available.
 */
export function readStdinIfPiped() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve(null);
      return;
    }
    let data = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data || null));
    // Timeout: don't block forever
    setTimeout(() => resolve(data || null), 3000);
  });
}
