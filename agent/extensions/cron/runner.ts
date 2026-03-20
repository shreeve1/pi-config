#!/usr/bin/env node

import { acquireLock, releaseLock } from "./lib/lock.js";
import {
  loadRegistry,
  updateJob,
  type ScheduledPromptJob,
} from "./lib/registry.js";
import { findDueJobs, computeNextRunAt } from "./lib/scheduler.js";
import { executeJob } from "./lib/executor.js";
import { ensureDirs } from "./lib/paths.js";
import { readState, writeState } from "./lib/state.js";

/** Lock, mark running, release lock, execute, then lock again to update metadata. */
const runSingleJob = async (
  job: ScheduledPromptJob,
  disableAfterRun = false,
): Promise<void> => {
  // Mark running under lock
  await acquireLock();
  try {
    updateJob(job.id, { running: true });
  } finally {
    releaseLock();
  }

  // Execute WITHOUT holding the lock — allows creates/deletes during long runs
  const run = await executeJob(job);

  // Re-acquire lock to update metadata
  await acquireLock();
  try {
    updateJob(job.id, {
      running: false,
      lastRunAt: run.startedAt,
      lastRunId: run.runId,
      lastExitCode: run.exitCode,
      runs: job.runs + 1,
      nextRunAt: computeNextRunAt(job),
      ...(disableAfterRun ? { enabled: false } : {}),
    });
  } finally {
    releaseLock();
  }
};

const runTick = async (): Promise<void> => {
  ensureDirs();

  // Acquire lock to read registry and compute due jobs
  let toDo: ScheduledPromptJob[] = [];
  try {
    await acquireLock();
  } catch {
    // Another tick is likely in progress; exit silently.
    return;
  }

  try {
    const registry = loadRegistry();
    const result = findDueJobs(registry);

    for (const { job, reason } of result.toDisable) {
      updateJob(job.id, { enabled: false });
      const existing = readState(job.id);
      writeState(job.id, {
        status: reason.startsWith("state is") ? (reason.includes("completed") ? "completed" : "failed") : "completed",
        message: reason,
        context: existing?.context,
        updatedAt: new Date().toISOString(),
      });
    }

    toDo = result.toDo;
  } finally {
    releaseLock();
  }

  // Execute due jobs (each manages its own locking)
  for (const job of toDo) {
    await runSingleJob(job, job.scheduleType === "once");
  }
};

const runNow = async (jobId: string | undefined): Promise<void> => {
  if (!jobId) {
    throw new Error("Missing job id. Usage: run-now <id>");
  }

  ensureDirs();

  let lockAcquired = false;

  try {
    await acquireLock();
    lockAcquired = true;

    const registry = loadRegistry();
    const job = registry.jobs.find((entry) => entry.id === jobId);

    if (!job) {
      console.error(`Job not found: ${jobId}`);
      process.exitCode = 1;
      return;
    }

    await runSingleJob(job, job.scheduleType === "once");
  } finally {
    if (lockAcquired) {
      releaseLock();
    }
  }
};

const main = async (): Promise<void> => {
  const mode = process.argv[2] ?? "tick";

  if (mode === "tick") {
    await runTick();
    return;
  }

  if (mode === "run-now") {
    await runNow(process.argv[3]);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
};

try {
  await main();
  if (process.exitCode === undefined) {
    process.exitCode = 0;
  }
} catch (error) {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
