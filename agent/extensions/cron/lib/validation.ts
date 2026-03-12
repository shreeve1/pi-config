import { validateCron } from "./cron-parse.js";

export interface CreateInput {
  prompt: string;
  scheduleType: "cron" | "once";
  cron?: string;
  runAt?: string;
  cwd?: string;
  label?: string;
  timezone?: string;
  expiresAt?: string;
  maxRuns?: number;
  concurrency?: "skip" | "queue" | "parallel";
}

export interface NormalizedCreateInput {
  prompt: string;
  scheduleType: "cron" | "once";
  cron?: string;
  runAt?: string;
  cwd: string;
  label?: string;
  timezone: string;
  expiresAt?: string;
  maxRuns?: number;
  concurrency: "skip";
}

type ValidationResult =
  | { valid: true; normalized: NormalizedCreateInput }
  | { valid: false; error: string };

const hasValidDate = (value: string): boolean => {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return false;
  }

  return value.includes("T");
};

export function validateCreateInput(
  input: CreateInput,
  defaultCwd: string,
): ValidationResult {
  const prompt = input.prompt?.trim();
  if (!prompt) {
    return { valid: false, error: "prompt must be a non-empty string" };
  }

  if (input.scheduleType !== "cron" && input.scheduleType !== "once") {
    return { valid: false, error: "scheduleType must be either 'cron' or 'once'" };
  }

  const timezone =
    input.timezone?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const concurrency = input.concurrency ?? "skip";
  if (concurrency !== "skip") {
    return {
      valid: false,
      error: "concurrency only supports 'skip' in v1",
    };
  }

  if (input.expiresAt !== undefined && !hasValidDate(input.expiresAt)) {
    return { valid: false, error: "expiresAt must be a valid ISO timestamp" };
  }

  const normalized: NormalizedCreateInput = {
    prompt,
    scheduleType: input.scheduleType,
    cwd: input.cwd?.trim() || defaultCwd,
    label: input.label,
    timezone,
    expiresAt: input.expiresAt,
    maxRuns: input.maxRuns,
    concurrency,
  };

  if (input.scheduleType === "cron") {
    const cron = input.cron?.trim();
    if (!cron) {
      return { valid: false, error: "cron is required when scheduleType is 'cron'" };
    }

    const cronValidation = validateCron(cron);
    if (!cronValidation.valid) {
      return { valid: false, error: `invalid cron: ${cronValidation.error}` };
    }

    normalized.cron = cron;
    normalized.expiresAt =
      input.expiresAt ?? new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    return { valid: true, normalized };
  }

  const runAt = input.runAt?.trim();
  if (!runAt) {
    return { valid: false, error: "runAt is required when scheduleType is 'once'" };
  }

  if (!hasValidDate(runAt)) {
    return { valid: false, error: "runAt must be a valid ISO timestamp" };
  }

  const runAtTs = Date.parse(runAt);
  if (runAtTs <= Date.now()) {
    return { valid: false, error: "runAt must be in the future" };
  }

  normalized.runAt = runAt;

  return { valid: true, normalized };
}
