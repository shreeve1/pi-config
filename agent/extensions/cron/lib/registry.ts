import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

import { jobsPath, ensureDirs } from "./paths.js";

export interface ScheduledPromptJob {
  id: string;
  label?: string;
  prompt: string;
  cwd: string;
  scheduleType: "cron" | "once";
  cron?: string;
  runAt?: string;
  timezone?: string;
  recurring: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  nextRunAt?: string;
  lastRunAt?: string;
  lastExitCode?: number;
  lastRunId?: string;
  runs: number;
  maxRuns?: number;
  concurrency: "skip" | "queue" | "parallel";
  running?: boolean;
}

export interface CronRegistry {
  version: 1;
  jobs: ScheduledPromptJob[];
}

const emptyRegistry = (): CronRegistry => ({
  version: 1,
  jobs: [],
});

export const loadRegistry = (): CronRegistry => {
  ensureDirs();

  const filePath = jobsPath();

  if (!existsSync(filePath)) {
    return emptyRegistry();
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.version === 1 && Array.isArray(parsed?.jobs)) {
      return parsed as CronRegistry;
    }
    console.error(`Invalid registry schema in ${filePath}, resetting`);
    return emptyRegistry();
  } catch (error) {
    console.error(`Corrupt registry at ${filePath}: ${error}, resetting`);
    return emptyRegistry();
  }
};

export const saveRegistry = (registry: CronRegistry): void => {
  ensureDirs();

  const filePath = jobsPath();
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  writeFileSync(tempPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
};

export const addJob = (job: ScheduledPromptJob): void => {
  const registry = loadRegistry();
  registry.jobs.push(job);
  saveRegistry(registry);
};

export const updateJob = (
  id: string,
  patch: Partial<ScheduledPromptJob>,
): ScheduledPromptJob | null => {
  const registry = loadRegistry();
  const index = registry.jobs.findIndex((job) => job.id === id);

  if (index < 0) {
    return null;
  }

  const current = registry.jobs[index];
  const updated: ScheduledPromptJob = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  registry.jobs[index] = updated;
  saveRegistry(registry);

  return updated;
};

export const removeJob = (id: string): boolean => {
  const registry = loadRegistry();
  const originalLength = registry.jobs.length;
  registry.jobs = registry.jobs.filter((job) => job.id !== id);

  if (registry.jobs.length === originalLength) {
    return false;
  }

  saveRegistry(registry);
  return true;
};

export const getJob = (id: string): ScheduledPromptJob | null => {
  const registry = loadRegistry();
  return registry.jobs.find((job) => job.id === id) ?? null;
};
