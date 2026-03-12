import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, openSync, closeSync } from "node:fs";
import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ScheduledPromptJob } from "./registry.js";
import { ensureDirs, logsDir, runsDir, statePath } from "./paths.js";
import { readState } from "./state.js";

export interface ScheduledPromptRun {
  runId: string;
  jobId: string;
  startedAt: string;
  finishedAt?: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  exitCode?: number;
  logPath?: string;
  pid?: number;
  note?: string;
}

let cachedPiBinary: string | null = null;

const getPiBinary = (): string => {
  if (cachedPiBinary) {
    return cachedPiBinary;
  }

  try {
    const resolved = execSync("which pi", { encoding: "utf8" }).trim();
    cachedPiBinary = resolved || "pi";
  } catch {
    cachedPiBinary = "pi";
  }

  return cachedPiBinary;
};

const writeRunRecordAtomic = (jobId: string, run: ScheduledPromptRun): void => {
  const directory = runsDir(jobId);
  const targetPath = join(directory, `${run.runId}.json`);
  const tempPath = join(directory, `${run.runId}.${process.pid}.${Date.now()}.tmp`);

  writeFileSync(tempPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  renameSync(tempPath, targetPath);
};

export function executeJob(job: ScheduledPromptJob): Promise<ScheduledPromptRun> {
  ensureDirs();

  const runId = randomUUID().slice(0, 8);

  mkdirSync(logsDir(job.id), { recursive: true });
  mkdirSync(runsDir(job.id), { recursive: true });

  const state = readState(job.id);
  const context = state?.context?.trim();
  const stateFile = statePath(job.id);
  const composedPrompt = [
    context ? `<previous-run-context>\n${context}\n</previous-run-context>` : "",
    `<cron-job-meta job-id="${job.id}" state-file="${stateFile}" />`,
    `When this task is complete, use cron_write_context with jobId="${job.id}" to save any useful context or summary for the next run.`,
    job.prompt,
  ]
    .filter(Boolean)
    .join("\n\n");

  const startedAt = new Date().toISOString();
  const logPath = join(logsDir(job.id), `${runId}.log`);

  const run: ScheduledPromptRun = {
    runId,
    jobId: job.id,
    startedAt,
    status: "started",
    logPath,
  };

  writeRunRecordAtomic(job.id, run);

  const piBinary = getPiBinary();
  let logFd: number;
  try {
    logFd = openSync(logPath, "a");
  } catch (error) {
    run.finishedAt = new Date().toISOString();
    run.status = "failed";
    run.exitCode = -1;
    run.note = `Failed to open log: ${error instanceof Error ? error.message : error}`;
    writeRunRecordAtomic(job.id, run);
    return Promise.resolve(run);
  }

  let fdClosed = false;
  const safeCloseFd = () => {
    if (!fdClosed) {
      fdClosed = true;
      try { closeSync(logFd); } catch {}
    }
  };

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(piBinary, ["-p", composedPrompt], {
        cwd: job.cwd,
        stdio: ["ignore", logFd, logFd],
        detached: false,
      });
    } catch (error) {
      safeCloseFd();
      run.finishedAt = new Date().toISOString();
      run.exitCode = -1;
      run.status = "failed";
      run.note = `Spawn failed: ${error instanceof Error ? error.message : error}`;
      writeRunRecordAtomic(job.id, run);
      resolve(run);
      return;
    }

    run.pid = child.pid;
    writeRunRecordAtomic(job.id, run);

    child.once("error", (error: Error) => {
      run.finishedAt = new Date().toISOString();
      run.exitCode = -1;
      run.status = "failed";
      run.note = error.message;
      writeRunRecordAtomic(job.id, run);
      safeCloseFd();
      resolve(run);
    });

    child.once("close", (code) => {
      run.finishedAt = new Date().toISOString();
      run.exitCode = code ?? -1;
      run.status = code === 0 ? "succeeded" : "failed";
      writeRunRecordAtomic(job.id, run);
      safeCloseFd();
      resolve(run);
    });
  });
}
