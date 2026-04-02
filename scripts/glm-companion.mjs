#!/usr/bin/env node

/**
 * glm-companion.mjs — Main entry point for the GLM plugin.
 *
 * Subcommands:
 *   setup          Check Zhipu API key and connectivity
 *   ask            General GLM query
 *   task           Structured task delegation
 *   review         Code review using git diff (piped via stdin)
 *   status         Show active and recent jobs
 *   result         Show finished job output
 *   cancel         Cancel an active background job
 *   task-worker    Internal: run a background job
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { parseArgs } from "./lib/args.mjs";
import {
  getGlmAvailability,
  runGlmPrompt,
  normalizeRequestedModel,
  loadPromptTemplate,
  interpolateTemplate,
} from "./lib/glm.mjs";
import {
  generateJobId,
  upsertJob,
  writeJobFile,
  readJobFile,
  resolveJobFile,
  resolveJobLogFile,
  ensureStateDir,
} from "./lib/state.mjs";
import {
  appendLogLine,
  createJobLogFile,
  createJobRecord,
  nowIso,
  SESSION_ID_ENV,
} from "./lib/tracked-jobs.mjs";
import {
  buildStatusSnapshot,
  buildSingleJobSnapshot,
  enrichJob,
  resolveResultJob,
  resolveCancelableJob,
  readStoredJob,
} from "./lib/job-control.mjs";
import {
  renderStatusReport,
  renderJobStatusReport,
  renderStoredJobResult,
  renderCancelReport,
} from "./lib/render.mjs";
import { resolveWorkspaceRoot } from "./lib/workspace.mjs";
import { terminateProcessTree } from "./lib/process.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function printUsage() {
  console.log(
    [
      "Usage:",
      "  node scripts/glm-companion.mjs setup [--json]",
      "  node scripts/glm-companion.mjs ask [--background] [--model <model>] <question>",
      "  node scripts/glm-companion.mjs task [--background] [--model <model>] <prompt>",
      "  node scripts/glm-companion.mjs review [--background] [--model <model>] [--focus <focus>]",
      "  node scripts/glm-companion.mjs status [job-id] [--all] [--json]",
      "  node scripts/glm-companion.mjs result [job-id] [--json]",
      "  node scripts/glm-companion.mjs cancel [job-id] [--json]",
    ].join("\n")
  );
}

function outputResult(value, asJson) {
  if (asJson) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    process.stdout.write(typeof value === "string" ? value : JSON.stringify(value, null, 2));
  }
}

/**
 * Read stdin if available (for piped diff content).
 */
async function readStdin() {
  if (process.stdin.isTTY) return "";
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ─── Background job launcher ────────────────────────────────────────

function launchBackgroundWorker(jobId, kind, prompt, options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(process.cwd());
  const logFile = createJobLogFile(workspaceRoot, jobId, `${kind} job`);

  const jobRecord = createJobRecord({
    id: jobId,
    kind,
    jobClass: kind,
    title: `${kind}: ${(options.title || prompt).slice(0, 60)}`,
    status: "queued",
    phase: "queued",
    workspaceRoot,
    logFile,
    prompt,
    model: options.model || null,
    systemPrompt: options.systemPrompt || null,
  });

  writeJobFile(workspaceRoot, jobId, { ...jobRecord, prompt, systemPrompt: options.systemPrompt });
  upsertJob(workspaceRoot, jobRecord);

  const workerArgs = [SCRIPT_PATH, "task-worker", jobId, "--kind", kind];
  if (options.model) workerArgs.push("--model", options.model);

  const child = spawn("node", workerArgs, {
    cwd: workspaceRoot,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
    env: {
      ...process.env,
      GLM_WORKER_JOB_ID: jobId,
      GLM_WORKER_WORKSPACE: workspaceRoot,
    },
  });

  child.unref();
  upsertJob(workspaceRoot, { id: jobId, status: "running", phase: "starting", pid: child.pid });

  return { jobId, logFile, pid: child.pid, workspaceRoot };
}

// ─── setup ──────────────────────────────────────────────────────────

async function cmdSetup(flags) {
  const status = await getGlmAvailability();

  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    const lines = [];
    if (status.available) {
      lines.push("GLM API — ready.");
      lines.push("");
      lines.push("Available commands:");
      lines.push("  /glm:ask <question>              — General query");
      lines.push("  /glm:task <prompt>               — Structured task delegation");
      lines.push("  /glm:review [--focus <focus>]     — Code review via git diff");
      lines.push("  /glm:status [job-id]             — Show job status");
      lines.push("  /glm:result [job-id]             — Show finished job result");
      lines.push("  /glm:cancel [job-id]             — Cancel an active job");
      lines.push("");
      lines.push("All action commands support --background for async execution.");
    } else {
      lines.push("GLM API is not available.");
      lines.push(`Error: ${status.error}`);
      lines.push("");
      lines.push("Set ZHIPU_API_KEY in your environment. Get a key at https://open.bigmodel.cn");
    }
    console.log(lines.join("\n"));
  }
}

// ─── Prompt builders ────────────────────────────────────────────────

async function buildAskPrompt(flags, positional) {
  const question = positional.join(" ");
  if (!question) throw new Error("No question provided.\nUsage: /glm:ask <question>");

  return { prompt: question, title: question };
}

async function buildTaskPrompt(flags, positional) {
  const taskPrompt = positional.join(" ");
  if (!taskPrompt) throw new Error("No task prompt provided.\nUsage: /glm:task <prompt>");

  const systemPrompt = [
    "You are a structured task executor. Complete the following task thoroughly and precisely.",
    "Organize your output with clear headings and sections.",
    "If the task involves code, provide complete, working code with explanations.",
    "If the task involves analysis, be rigorous and cite your reasoning.",
  ].join("\n");

  return { prompt: taskPrompt, systemPrompt, title: taskPrompt };
}

async function buildReviewPrompt(flags, positional) {
  const stdinContent = await readStdin();
  const focus = flags.focus || positional.join(" ") || "";

  if (!stdinContent.trim()) {
    throw new Error(
      "No diff content received on stdin.\n" +
      "Usage: git diff | node scripts/glm-companion.mjs review [--focus <focus>]\n" +
      "Or from Claude Code: /glm:review [focus]"
    );
  }

  let systemPrompt;
  try {
    const template = await loadPromptTemplate("code-review");
    systemPrompt = interpolateTemplate(template, { focus: focus || "general code quality" });
  } catch {
    systemPrompt = [
      "You are an expert code reviewer. Review the following git diff carefully.",
      focus ? `Focus area: ${focus}` : "",
      "",
      "Structure your review as:",
      "## Summary — What changed and why (infer from the diff)",
      "## Issues — Bugs, logic errors, security concerns, edge cases",
      "## Suggestions — Improvements, refactoring opportunities, better patterns",
      "## Verdict — Overall assessment: approve / request-changes / needs-discussion",
      "",
      "Be direct. Flag real problems. Skip trivial style nits unless they affect readability.",
    ].filter(Boolean).join("\n");
  }

  const prompt = `Review this diff:\n\n\`\`\`diff\n${stdinContent}\n\`\`\``;

  return { prompt, systemPrompt, title: `code review${focus ? `: ${focus}` : ""}` };
}

// ─── Generic run-or-background handler ──────────────────────────────

async function runCommand(kind, flags, positional, promptBuilder) {
  const { prompt, systemPrompt, title } = await promptBuilder(flags, positional);

  const isBackground = flags.background === true;

  if (isBackground) {
    const jobId = generateJobId("glm");
    const info = launchBackgroundWorker(jobId, kind, prompt, {
      model: flags.model,
      title,
      systemPrompt,
    });

    const lines = [
      `# GLM ${kind} — background`,
      "",
      `Job **${info.jobId}** is running in the background (PID ${info.pid}).`,
      "",
      "Commands:",
      `- Check progress: \`/glm:status ${info.jobId}\``,
      `- Get result: \`/glm:result ${info.jobId}\``,
      `- Cancel: \`/glm:cancel ${info.jobId}\``,
    ];
    console.log(lines.join("\n"));
    return;
  }

  // Foreground
  console.error(`[glm] Running ${kind}...`);
  const result = await runGlmPrompt(prompt, {
    model: flags.model,
    systemPrompt,
  });

  if (result.exitCode !== 0) {
    console.error(`GLM returned an error`);
  }

  console.log(result.text);
}

// ─── status ─────────────────────────────────────────────────────────

async function cmdStatus(flags, positional) {
  const reference = positional[0] || null;

  if (reference) {
    const { job } = buildSingleJobSnapshot(process.cwd(), reference);
    outputResult(flags.json ? job : renderJobStatusReport(job), flags.json);
    return;
  }

  const report = buildStatusSnapshot(process.cwd(), { all: flags.all });
  outputResult(flags.json ? report : renderStatusReport(report), flags.json);
}

// ─── result ─────────────────────────────────────────────────────────

async function cmdResult(flags, positional) {
  const reference = positional[0] || null;
  const { workspaceRoot, job } = resolveResultJob(process.cwd(), reference);
  const storedJob = readStoredJob(workspaceRoot, job.id);

  if (flags.json) {
    outputResult({ job: enrichJob(job), storedJob }, true);
    return;
  }

  process.stdout.write(renderStoredJobResult(job, storedJob));
}

// ─── cancel ─────────────────────────────────────────────────────────

async function cmdCancel(flags, positional) {
  const reference = positional[0] || null;
  const { workspaceRoot, job } = resolveCancelableJob(process.cwd(), reference);

  if (job.pid) {
    try { await terminateProcessTree(job.pid); } catch {}
  }

  const completedAt = nowIso();
  upsertJob(workspaceRoot, { id: job.id, status: "cancelled", phase: "cancelled", pid: null, completedAt });

  const jobFile = resolveJobFile(workspaceRoot, job.id);
  if (fs.existsSync(jobFile)) {
    const stored = readJobFile(jobFile);
    writeJobFile(workspaceRoot, job.id, { ...stored, status: "cancelled", phase: "cancelled", pid: null, completedAt });
  }

  appendLogLine(job.logFile, "Cancelled by user.");
  outputResult(flags.json ? { cancelled: true, job } : renderCancelReport(job), flags.json);
}

// ─── task-worker ────────────────────────────────────────────────────

async function cmdTaskWorker(flags, positional) {
  const jobId = positional[0] || process.env.GLM_WORKER_JOB_ID;
  const workspaceRoot = process.env.GLM_WORKER_WORKSPACE || process.cwd();

  if (!jobId) process.exit(1);

  const jobFile = resolveJobFile(workspaceRoot, jobId);
  if (!fs.existsSync(jobFile)) process.exit(1);

  const jobData = readJobFile(jobFile);
  const logFile = jobData.logFile || resolveJobLogFile(workspaceRoot, jobId);
  const prompt = jobData.prompt;
  const systemPrompt = jobData.systemPrompt || null;

  if (!prompt) {
    appendLogLine(logFile, "No prompt found in job file.");
    upsertJob(workspaceRoot, { id: jobId, status: "failed", phase: "failed", pid: null, completedAt: nowIso() });
    process.exit(1);
  }

  appendLogLine(logFile, `Worker started (PID ${process.pid}).`);
  appendLogLine(logFile, `Running GLM ${flags.kind || "task"}...`);
  upsertJob(workspaceRoot, { id: jobId, status: "running", phase: "running", pid: process.pid });

  try {
    const result = await runGlmPrompt(prompt, {
      model: flags.model,
      systemPrompt: systemPrompt || undefined,
      timeout: 300_000,
    });

    const completionStatus = result.exitCode === 0 ? "completed" : "failed";
    const completedAt = nowIso();

    const summary = result.text
      ? result.text.replace(/\s+/g, " ").trim().slice(0, 120) + (result.text.length > 120 ? "..." : "")
      : null;

    writeJobFile(workspaceRoot, jobId, {
      ...jobData,
      status: completionStatus,
      phase: completionStatus === "completed" ? "done" : "failed",
      pid: null,
      completedAt,
      exitCode: result.exitCode,
      result: result.text,
      rendered: result.text,
      summary,
    });

    upsertJob(workspaceRoot, {
      id: jobId,
      status: completionStatus,
      phase: completionStatus === "completed" ? "done" : "failed",
      pid: null,
      completedAt,
      summary,
    });

    appendLogLine(logFile, `Completed.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const completedAt = nowIso();

    writeJobFile(workspaceRoot, jobId, { ...jobData, status: "failed", phase: "failed", pid: null, completedAt, errorMessage });
    upsertJob(workspaceRoot, { id: jobId, status: "failed", phase: "failed", pid: null, completedAt, errorMessage });
    appendLogLine(logFile, `Failed: ${errorMessage}`);
    process.exit(1);
  }
}

// ─── main ───────────────────────────────────────────────────────────

async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 0) { printUsage(); process.exit(0); }

  const subcommand = rawArgs[0];
  const { flags, positional } = parseArgs(rawArgs.slice(1));

  switch (subcommand) {
    case "setup":       await cmdSetup(flags); break;
    case "ask":         await runCommand("ask", flags, positional, buildAskPrompt); break;
    case "task":        await runCommand("task", flags, positional, buildTaskPrompt); break;
    case "review":      await runCommand("review", flags, positional, buildReviewPrompt); break;
    case "status":      await cmdStatus(flags, positional); break;
    case "result":      await cmdResult(flags, positional); break;
    case "cancel":      await cmdCancel(flags, positional); break;
    case "task-worker": await cmdTaskWorker(flags, positional); break;
    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => { console.error(`Error: ${err.message}`); process.exit(1); });
