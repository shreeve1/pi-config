import type { ScheduledPromptJob, CronRegistry } from "./registry.js";
import { nextRun } from "./cron-parse.js";
import { readState } from "./state.js";

export interface SchedulerResult {
  toDo: ScheduledPromptJob[];
  toDisable: { job: ScheduledPromptJob; reason: string }[];
}

export function computeNextRunAt(
  job: ScheduledPromptJob,
  after?: Date,
): string | undefined {
  if (job.scheduleType !== "cron" || !job.cron) {
    return undefined;
  }

  return nextRun(job.cron, after ?? new Date()).toISOString();
}

export function findDueJobs(
  registry: CronRegistry,
  now: Date = new Date(),
): SchedulerResult {
  const result: SchedulerResult = {
    toDo: [],
    toDisable: [],
  };

  for (const job of registry.jobs) {
    if (!job.enabled) {
      continue;
    }

    const state = readState(job.id);
    if (state?.status === "completed" || state?.status === "failed") {
      result.toDisable.push({
        job,
        reason: `state is ${state.status}`,
      });
      continue;
    }

    if (state?.status === "paused") {
      continue;
    }

    if (job.expiresAt && now >= new Date(job.expiresAt)) {
      result.toDisable.push({ job, reason: "expired" });
      continue;
    }

    if (job.maxRuns !== undefined && job.runs >= job.maxRuns) {
      result.toDisable.push({ job, reason: "max runs reached" });
      continue;
    }

    if (job.running === true) {
      continue;
    }

    let due = false;

    if (job.scheduleType === "cron") {
      let nextRunAt = job.nextRunAt ? new Date(job.nextRunAt) : undefined;

      if (!nextRunAt && job.cron) {
        nextRunAt = nextRun(
          job.cron,
          new Date(job.lastRunAt ?? job.createdAt),
        );
      }

      if (nextRunAt && now >= nextRunAt) {
        due = true;
      }
    } else if (job.scheduleType === "once" && job.runAt) {
      due = now >= new Date(job.runAt);
    }

    if (due) {
      result.toDo.push(job);
    }
  }

  return result;
}
