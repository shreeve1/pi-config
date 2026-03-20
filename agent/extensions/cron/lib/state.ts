import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { statePath } from "./paths.js";

export interface JobState {
  status: "running" | "completed" | "failed" | "paused";
  message?: string;
  context?: string; // free-form text injected into next run's prompt
  updatedAt: string; // ISO timestamp
}

export const readState = (jobId: string): JobState | null => {
  const filePath = statePath(jobId);
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as JobState;
  } catch {
    return null;
  }
};

export const writeState = (jobId: string, state: JobState): void => {
  const filePath = statePath(jobId);
  const dirPath = path.dirname(filePath);
  const tempPath = path.join(
    dirPath,
    `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  mkdirSync(dirPath, { recursive: true });
  writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  renameSync(tempPath, filePath);
};
