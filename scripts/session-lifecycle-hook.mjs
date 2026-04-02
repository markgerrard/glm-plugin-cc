#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import process from "node:process";

import { listJobs, upsertJob, writeJobFile, readJobFile, resolveJobFile } from "./lib/state.mjs";
import { nowIso, SESSION_ID_ENV } from "./lib/tracked-jobs.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";

const event = process.argv[2];

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function handleSessionStart() {
  const sessionId = randomUUID();
  console.log(JSON.stringify({ env: { [SESSION_ID_ENV]: sessionId } }));
}

function handleSessionEnd() {
  const workspaceRoot = resolveWorkspaceRoot(process.cwd());
  const jobs = listJobs(workspaceRoot);
  const completedAt = nowIso();

  for (const job of jobs) {
    if (job.status !== "queued" && job.status !== "running") continue;
    if (job.pid && isProcessAlive(job.pid)) {
      try { process.kill(job.pid, "SIGTERM"); } catch {}
    }
    upsertJob(workspaceRoot, { id: job.id, status: "failed", phase: "failed", pid: null, completedAt, errorMessage: "Session ended while job was still running." });
    const jobFile = resolveJobFile(workspaceRoot, job.id);
    if (fs.existsSync(jobFile)) {
      try {
        const stored = readJobFile(jobFile);
        writeJobFile(workspaceRoot, job.id, { ...stored, status: "failed", phase: "failed", pid: null, completedAt, errorMessage: "Session ended while job was still running." });
      } catch {}
    }
  }
}

switch (event) {
  case "SessionStart": handleSessionStart(); break;
  case "SessionEnd": handleSessionEnd(); break;
}
