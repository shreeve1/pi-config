import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HOME = homedir();
const CRON_ROOT = path.join(HOME, ".pi", "cron");

const withTrailingSep = (dirPath: string): string => `${dirPath}${path.sep}`;

export const cronRoot = (): string => withTrailingSep(CRON_ROOT);

export const jobsPath = (): string => path.join(CRON_ROOT, "jobs.json");

export const logsDir = (jobId: string): string =>
  withTrailingSep(path.join(CRON_ROOT, "logs", jobId));

export const runsDir = (jobId: string): string =>
  withTrailingSep(path.join(CRON_ROOT, "runs", jobId));

export const statePath = (jobId: string): string =>
  path.join(CRON_ROOT, "state", `${jobId}.json`);

export const lockPath = (): string =>
  path.join(CRON_ROOT, "locks", "registry.lock");

export const installDir = (): string =>
  withTrailingSep(path.join(CRON_ROOT, "install"));

export const ensureDirs = (): void => {
  mkdirSync(CRON_ROOT, { recursive: true });
  mkdirSync(path.join(CRON_ROOT, "logs"), { recursive: true });
  mkdirSync(path.join(CRON_ROOT, "runs"), { recursive: true });
  mkdirSync(path.join(CRON_ROOT, "state"), { recursive: true });
  mkdirSync(path.join(CRON_ROOT, "locks"), { recursive: true });
  mkdirSync(path.join(CRON_ROOT, "install"), { recursive: true });
};
