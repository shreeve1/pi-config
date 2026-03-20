import { constants, promises as fs, unlinkSync, readFileSync, statSync } from "node:fs";

import { ensureDirs, lockPath } from "./paths.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_BACKOFF_MS = 100;
const STALE_LOCK_AGE_MS = 5 * 60 * 1000; // 5 minutes

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const tryBreakStaleLock = (lockFilePath: string): boolean => {
  try {
    const content = readFileSync(lockFilePath, "utf8").trim();
    const pid = parseInt(content, 10);

    // If PID is valid and process is dead, break the lock
    if (!isNaN(pid) && pid > 0 && !isProcessAlive(pid)) {
      unlinkSync(lockFilePath);
      return true;
    }

    // If lock file is older than STALE_LOCK_AGE_MS, break it regardless
    const stat = statSync(lockFilePath);
    if (Date.now() - stat.mtimeMs > STALE_LOCK_AGE_MS) {
      unlinkSync(lockFilePath);
      return true;
    }

    return false;
  } catch {
    return false;
  }
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export const acquireLock = async (timeout = DEFAULT_TIMEOUT_MS): Promise<void> => {
  ensureDirs();

  const lockFilePath = lockPath();
  const startedAt = Date.now();

  while (true) {
    try {
      const handle = await fs.open(
        lockFilePath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      );

      try {
        await handle.writeFile(`${process.pid}\n`, "utf8");
      } finally {
        await handle.close();
      }

      return;
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;

      if (fsError.code !== "EEXIST") {
        throw error;
      }

      // Try to break stale lock before timing out
      if (tryBreakStaleLock(lockFilePath)) {
        continue; // Retry immediately after breaking stale lock
      }

      if (Date.now() - startedAt >= timeout) {
        throw new Error(
          `Timed out acquiring lock after ${timeout}ms: ${lockFilePath}`,
        );
      }

      await sleep(RETRY_BACKOFF_MS);
    }
  }
};

export const releaseLock = (): void => {
  try {
    unlinkSync(lockPath());
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code !== "ENOENT") {
      throw error;
    }
  }
};
