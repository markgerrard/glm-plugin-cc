/**
 * Job tracking — create, log, and run tracked background jobs.
 */

import fs from "node:fs";
import process from "node:process";

import { readJobFile, resolveJobFile, resolveJobLogFile, upsertJob, writeJobFile } from "./state.mjs";

export const SESSION_ID_ENV = "GLM_COMPANION_SESSION_ID";

export function nowIso() {
  return new Date().toISOString();
}

export function appendLogLine(logFile, message) {
  const normalized = String(message ?? "").trim();
  if (!logFile || !normalized) return;
  fs.appendFileSync(logFile, `[${nowIso()}] ${normalized}\n`, "utf8");
}

export function createJobLogFile(workspaceRoot, jobId, title) {
  const logFile = resolveJobLogFile(workspaceRoot, jobId);
  fs.writeFileSync(logFile, "", "utf8");
  if (title) appendLogLine(logFile, `Starting ${title}.`);
  return logFile;
}

export function createJobRecord(base, options = {}) {
  const env = options.env ?? process.env;
  const sessionId = env[options.sessionIdEnv ?? SESSION_ID_ENV];
  return {
    ...base,
    createdAt: nowIso(),
    ...(sessionId ? { sessionId } : {}),
  };
}

export async function runTrackedJob(job, runner, options = {}) {
  const runningRecord = {
    ...job,
    status: "running",
    startedAt: nowIso(),
    phase: "starting",
    pid: process.pid,
    logFile: options.logFile ?? job.logFile ?? null,
  };
  writeJobFile(job.workspaceRoot, job.id, runningRecord);
  upsertJob(job.workspaceRoot, runningRecord);

  try {
    const execution = await runner();
    const completionStatus = execution.exitCode === 0 ? "completed" : "failed";
    const completedAt = nowIso();

    writeJobFile(job.workspaceRoot, job.id, {
      ...runningRecord,
      status: completionStatus,
      pid: null,
      phase: completionStatus === "completed" ? "done" : "failed",
      completedAt,
      result: execution.text,
      rendered: execution.text,
    });

    upsertJob(job.workspaceRoot, {
      id: job.id,
      status: completionStatus,
      summary: execution.summary ?? null,
      phase: completionStatus === "completed" ? "done" : "failed",
      pid: null,
      completedAt,
    });

    appendLogLine(options.logFile, `Completed with exit code ${execution.exitCode}.`);
    return execution;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const completedAt = nowIso();

    writeJobFile(job.workspaceRoot, job.id, {
      ...runningRecord,
      status: "failed",
      phase: "failed",
      errorMessage,
      pid: null,
      completedAt,
    });

    upsertJob(job.workspaceRoot, {
      id: job.id,
      status: "failed",
      phase: "failed",
      pid: null,
      errorMessage,
      completedAt,
    });

    throw error;
  }
}
