import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

import {
  loadRegistry,
  addJob,
  removeJob,
  type ScheduledPromptJob,
} from "./lib/registry.js";
import { validateCreateInput } from "./lib/validation.js";
import { readState, writeState } from "./lib/state.js";
import { nextRun } from "./lib/cron-parse.js";
import { acquireLock, releaseLock } from "./lib/lock.js";
import { ensureDirs, statePath } from "./lib/paths.js";
import { installLaunchd, uninstallLaunchd, checkInstallation } from "./lib/install.js";

const formatJob = (job: ScheduledPromptJob): string => {
  const state = readState(job.id);
  const status = state?.status ?? (job.enabled ? "running" : "paused");
  const cadence =
    job.scheduleType === "cron"
      ? `cron=${job.cron ?? "(missing)"}`
      : `runAt=${job.runAt ?? "(missing)"}`;

  return [
    `- ${job.id}${job.label ? ` (${job.label})` : ""}`,
    `  cwd: ${job.cwd}`,
    `  ${cadence}`,
    `  enabled: ${job.enabled ? "yes" : "no"} | status: ${status}`,
    `  nextRunAt: ${job.nextRunAt ?? "(none)"}`,
    `  runs: ${job.runs}${job.maxRuns !== undefined ? `/${job.maxRuns}` : ""}`,
  ].join("\n");
};

const formatJobs = (jobs: ScheduledPromptJob[]): string => {
  if (jobs.length === 0) {
    return "No cron jobs found.";
  }

  return [`Scheduled jobs (${jobs.length}):`, ...jobs.map(formatJob)].join("\n\n");
};

export default function (pi: ExtensionAPI) {
  ensureDirs();

  // System prompt guidance
  pi.on("before_agent_start", (event) => {
    event.systemPrompt +=
      "\n\n## Cron Scheduled Tasks\n" +
      "Use `cron_create` to schedule prompts that run automatically as fresh pi sessions. " +
      "Jobs persist across restarts and run via a background scheduler. " +
      "Use `cron_list` to see scheduled jobs and `cron_delete` to remove them. " +
      "Use `cron_write_context` to save context/summary that will be injected into the next run's prompt. " +
      "Use `/cron-install` to set up the background scheduler.\n";
  });

  pi.registerTool({
    name: "cron_create",
    label: "CronCreate",
    description: "Create a scheduled prompt job (cron or one-time).",
    parameters: Type.Object({
      prompt: Type.String({ description: "Prompt text to schedule" }),
      scheduleType: StringEnum(["cron", "once"] as const, {
        description: "Schedule mode: recurring cron or one-shot",
      }),
      cron: Type.Optional(Type.String({ description: "Cron expression for recurring job" })),
      runAt: Type.Optional(Type.String({ description: "ISO timestamp for one-shot run" })),
      cwd: Type.Optional(Type.String({ description: "Working directory for the spawned pi run" })),
      label: Type.Optional(Type.String({ description: "Human-friendly label" })),
      expiresAt: Type.Optional(Type.String({ description: "ISO timestamp after which job should stop" })),
      maxRuns: Type.Optional(Type.Number({ description: "Maximum number of executions" })),
      timezone: Type.Optional(Type.String({ description: "Timezone for scheduling (default: local)" })),
      concurrency: Type.Optional(StringEnum(["skip"] as const, { description: "Overlap policy (only 'skip' in v1)" })),
    }),
    async execute(_id, params, _signal, _onUpdate, ctx) {
      const validation = validateCreateInput(params, ctx.cwd);
      if (!validation.valid) {
        return {
          content: [{ type: "text", text: `Error: ${validation.error}` }],
          details: {},
        };
      }

      const normalized = validation.normalized;
      const id = randomUUID().slice(0, 8);
      const now = new Date().toISOString();

      let nextRunAt: string | undefined;
      if (normalized.scheduleType === "cron") {
        try {
          nextRunAt = nextRun(normalized.cron!, new Date(), normalized.timezone).toISOString();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            content: [{ type: "text", text: `Error computing next run: ${message}` }],
            details: {},
          };
        }
      } else {
        nextRunAt = normalized.runAt;
      }

      const job: ScheduledPromptJob = {
        id,
        label: normalized.label,
        prompt: normalized.prompt,
        cwd: normalized.cwd,
        scheduleType: normalized.scheduleType,
        cron: normalized.cron,
        runAt: normalized.runAt,
        timezone: normalized.timezone,
        recurring: normalized.scheduleType === "cron",
        enabled: true,
        createdAt: now,
        updatedAt: now,
        expiresAt: normalized.expiresAt,
        nextRunAt,
        runs: 0,
        maxRuns: normalized.maxRuns,
        concurrency: normalized.concurrency,
      };

      await acquireLock();
      try {
        addJob(job);
      } finally {
        releaseLock();
      }

      writeState(id, { status: "running", updatedAt: new Date().toISOString() });

      return {
        content: [
          {
            type: "text",
            text:
              `Created cron job ${id}${job.label ? ` (${job.label})` : ""}.\n` +
              `Type: ${job.scheduleType}\n` +
              `Next run: ${job.nextRunAt ?? "(none)"}\n` +
              `CWD: ${job.cwd}`,
          },
        ],
        details: { job },
      };
    },
  });

  pi.registerTool({
    name: "cron_write_context",
    label: "CronWriteContext",
    description:
      "Save context for a cron job's next run. The context will be prepended to the prompt on the next execution.",
    parameters: Type.Object({
      jobId: Type.String({ description: "Job ID (from PI_CRON_JOB_ID or prompt metadata)" }),
      context: Type.String({ description: "Free-form text to inject into the next run's prompt" }),
    }),
    async execute(_id, params) {
      const existing = readState(params.jobId);
      writeState(params.jobId, {
        status: existing?.status ?? "running",
        message: existing?.message,
        context: params.context,
        updatedAt: new Date().toISOString(),
      });
      return {
        content: [{ type: "text", text: `Saved context for job ${params.jobId} (${params.context.length} chars)` }],
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "cron_list",
    label: "CronList",
    description: "List scheduled cron jobs.",
    parameters: Type.Object({
      cwd: Type.Optional(Type.String({ description: "Filter jobs by cwd" })),
      all: Type.Optional(Type.Boolean({ description: "Include disabled jobs" })),
    }),
    async execute(_id, params) {
      const registry = loadRegistry();
      let jobs = registry.jobs;

      if (params.cwd) {
        jobs = jobs.filter((job) => job.cwd === params.cwd);
      }

      if (params.all !== true) {
        jobs = jobs.filter((job) => job.enabled);
      }

      return {
        content: [{ type: "text", text: formatJobs(jobs) }],
        details: { jobs },
      };
    },
  });

  pi.registerTool({
    name: "cron_delete",
    label: "CronDelete",
    description: "Delete a scheduled cron job by id.",
    parameters: Type.Object({
      id: Type.String({ description: "Job id to remove" }),
    }),
    async execute(_id, params) {
      await acquireLock();
      try {
        const removed = removeJob(params.id);
        if (!removed) {
          return {
            content: [{ type: "text", text: `Error: job not found: ${params.id}` }],
            details: {},
          };
        }

        try {
          unlinkSync(statePath(params.id));
        } catch (error) {
          const fsError = error as NodeJS.ErrnoException;
          if (fsError.code !== "ENOENT") {
            throw error;
          }
        }
      } finally {
        releaseLock();
      }

      return {
        content: [{ type: "text", text: `Deleted cron job ${params.id}.` }],
        details: {},
      };
    },
  });

  pi.registerCommand("cron-list", {
    description: "List scheduled cron jobs",
    async handler(_args, ctx) {
      const registry = loadRegistry();
      ctx.ui.notify(formatJobs(registry.jobs), "info");
    },
  });

  pi.registerCommand("cron-delete", {
    description: "Delete a scheduled cron job. Usage: /cron-delete <id>",
    async handler(args, ctx) {
      const id = (args ?? "").trim().split(/\s+/)[0];

      if (!id) {
        ctx.ui.notify("Usage: /cron-delete <id>", "error");
        return;
      }

      await acquireLock();
      try {
        const removed = removeJob(id);
        if (!removed) {
          ctx.ui.notify(`Job not found: ${id}`, "error");
          return;
        }
        try { unlinkSync(statePath(id)); } catch {}
      } finally {
        releaseLock();
      }

      ctx.ui.notify(`Deleted cron job ${id}`, "info");
    },
  });

  pi.registerCommand("cron-install", {
    description: "Install the background cron scheduler (macOS launchd)",
    async handler(_args, ctx) {
      const result = installLaunchd();
      ctx.ui.notify(result.message, result.success ? "info" : "error");
    },
  });

  pi.registerCommand("cron-uninstall", {
    description: "Remove the background cron scheduler",
    async handler(_args, ctx) {
      const result = uninstallLaunchd();
      ctx.ui.notify(result.message, result.success ? "info" : "error");
    },
  });

  pi.registerCommand("cron-doctor", {
    description: "Check cron scheduler health",
    async handler(_args, ctx) {
      const status = checkInstallation();
      const emoji = status.installed ? "✅" : "❌";
      ctx.ui.notify(`${emoji} Cron scheduler: ${status.installed ? "healthy" : "not installed"}\n${status.details}`, "info");
    },
  });
}
