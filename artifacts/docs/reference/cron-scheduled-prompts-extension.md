# Cron Scheduled Prompts Extension

Technical specification for a pi extension that adds durable scheduled task support where each task stores a **prompt** and launches a fresh non-interactive pi run when due.

## Purpose

This extension provides the missing scheduling capability that a future `pi-loop` skill can use. The extension is responsible for persistence, scheduling, execution, and operational controls. The skill will later handle natural-language parsing and user-friendly prompting.

## Goals

- Schedule a prompt to run once at a future time
- Schedule a prompt to run repeatedly on a cron cadence
- Persist jobs outside the current pi session
- Run scheduled prompts in the correct working directory
- List, inspect, and delete scheduled jobs from pi
- Keep the execution model simple and auditable by launching a fresh pi process per run

## Non-Goals

- Natural-language time parsing in the extension itself
- Reusing or attaching to a live interactive pi session
- Full workflow orchestration beyond prompt execution
- Distributed scheduling or remote execution in v1
- Exact-second scheduling; minute-level granularity is sufficient for v1

## Core Product Decision

A scheduled task stores a **prompt**, not a shell command.

When the task fires, the extension launches a new non-interactive pi process in the stored `cwd` and submits that prompt. This keeps the model-centric behavior aligned with pi's tool system and makes the extension a clean foundation for a future `pi-loop` skill.

## High-Level Architecture

The recommended design uses a **single minute-tick scheduler** instead of one OS scheduler entry per job.

### Components

1. **pi extension**
   - Registers model-callable tools and human-facing commands
   - Validates inputs and edits the persistent job registry

2. **Job registry**
   - Durable JSON file storing all scheduled jobs and metadata
   - Lives outside session state

3. **Minute-tick runner**
   - Invoked every minute by an OS scheduler such as `launchd`
   - Loads the registry, computes due jobs, dispatches runs, updates metadata

4. **Execution runner**
   - Spawns a detached `pi` process for each due job
   - Captures stdout/stderr and writes per-run metadata

5. **OS scheduler bootstrap**
   - Installs one persistent per-user scheduled entry that runs the tick runner every minute
   - On macOS, this is best implemented with `launchd`

## Why a Minute-Tick Runner

This design is preferred over creating one OS-level scheduler entry per job because it:

- keeps full cron semantics in extension-controlled code
- makes add/update/delete operations simple JSON edits
- makes one-shot jobs easy to support
- reduces scheduler sprawl
- is easier to port to Linux or Windows later
- allows centralized locking, logging, overlap policy, and health checks

## Execution Model

Each due task launches a **fresh pi process**.

### Why this is preferred

- works even when no interactive pi TUI is open
- avoids coupling with current session state
- isolates scheduled runs from active user work
- produces per-run logs and metadata
- keeps failure handling simple

### Execution contract

Each run should execute with:

- stored `cwd`
- stored `prompt`
- extension/runtime available in the environment
- predictable log output location

The run should **not** assume any active interactive session context.

## Proposed User-Facing Capabilities

### Tools

#### `cron_create`
Create a one-shot or recurring prompt task.

#### `cron_list`
List scheduled tasks, optionally filtered to the current project.

#### `cron_delete`
Delete a scheduled task by ID.

### Commands

#### `/cron-list`
Human-facing listing command.

#### `/cron-delete <id>`
Human-facing delete command.

#### `/cron-install`
Installs or repairs the OS-level minute-tick scheduler.

#### `/cron-run-now <id>`
Optional but useful for testing and validation.

#### `/cron-doctor`
Optional health check command for scheduler status, registry validity, and recent failures.

## Extension Tool API

## `cron_create`

### Input

```ts
{
  prompt: string;
  scheduleType: "cron" | "once";
  cron?: string;
  runAt?: string;      // ISO timestamp for one-shot jobs
  cwd?: string;
  label?: string;
  timezone?: string;
  expiresAt?: string;  // optional ISO timestamp
  maxRuns?: number;
  concurrency?: "skip" | "queue" | "parallel";
}
```

### Validation rules

- `prompt` is required and must be non-empty
- if `scheduleType === "cron"`, `cron` is required
- if `scheduleType === "once"`, `runAt` is required
- `cwd` defaults to `ctx.cwd`
- `timezone` defaults to the local system timezone
- `concurrency` defaults to `"skip"`; only `"skip"` is accepted in v1 — `"queue"` and `"parallel"` are rejected with a clear error
- if `expiresAt` is not provided, it defaults to `now + 3 days` for recurring jobs; one-shot jobs do not need expiry since they self-disable after firing
- invalid cron expressions are rejected with a clear error
- invalid or past one-shot timestamps are rejected unless explicitly allowed in a future v2

### Output

```ts
{
  id: string;
  label?: string;
  prompt: string;
  cwd: string;
  scheduleType: "cron" | "once";
  cron?: string;
  runAt?: string;
  recurring: boolean;
  enabled: boolean;
  nextRunAt?: string;
  createdAt: string;
}
```

## `cron_list`

### Input

```ts
{
  cwd?: string;
  includeDisabled?: boolean;
  all?: boolean;
}
```

### Semantics

- if `cwd` is provided, filter to that project
- if `all` is false or omitted, the extension may default to current-project-first behavior
- disabled jobs are omitted unless requested

### Output

```ts
{
  jobs: Array<{
    id: string;
    label?: string;
    cwd: string;
    scheduleType: "cron" | "once";
    cron?: string;
    runAt?: string;
    nextRunAt?: string;
    lastRunAt?: string;
    enabled: boolean;
    runs: number;
    lastExitCode?: number;
  }>;
}
```

## `cron_delete`

### Input

```ts
{
  id: string;
}
```

### Output

```ts
{
  deleted: boolean;
  id: string;
}
```

## Nice-to-Have v2 Tools

- `cron_get`
- `cron_update`
- `cron_pause`
- `cron_resume`
- `cron_run_now`
- `cron_tail_logs`

These are intentionally out of MVP scope.

## Data Model

## Registry shape

```ts
interface CronRegistry {
  version: 1;
  jobs: ScheduledPromptJob[];
}

interface ScheduledPromptJob {
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
```

## Per-run shape

```ts
interface ScheduledPromptRun {
  runId: string;
  jobId: string;
  startedAt: string;
  finishedAt?: string;
  status: "started" | "succeeded" | "failed" | "skipped";
  exitCode?: number;
  logPath?: string;
  sessionFile?: string;
  pid?: number;
  note?: string;
}
```

## Storage Layout

Recommended runtime state location:

```text
~/.pi/cron/
  jobs.json
  state/
    <job-id>.json          # optional job state (status + context)
  logs/
    <job-id>/
      <run-id>.log
  runs/
    <job-id>/
      <run-id>.json
  locks/
    registry.lock
  install/
    com.pi.cron.plist
```

Recommended extension code location:

```text
~/.pi/agent/extensions/cron/
  index.ts
  runner.ts
  lib/
    registry.ts
    scheduler.ts
    executor.ts
    cron-parse.ts
    lock.ts
    paths.ts
    validation.ts
```

This keeps code separate from mutable runtime state.

## File and Module Responsibilities

## `index.ts`

Registers:

- `cron_create`
- `cron_list`
- `cron_delete`
- `/cron-list`
- `/cron-delete`
- `/cron-install`
- optionally `/cron-run-now` and `/cron-doctor`

It should contain minimal business logic and delegate to library modules.

## `runner.ts`

CLI entrypoint used by the OS scheduler.

Suggested modes:

- `tick` — evaluate due jobs and dispatch them
- `run-now <id>` — execute one job immediately
- `doctor` — validate installation and registry state

## `lib/registry.ts`

- load registry
- write registry atomically
- add/update/delete jobs
- maintain versioning and schema checks

## `lib/scheduler.ts`

- compute whether a job is due
- compute `nextRunAt`
- enforce expiry and `maxRuns`
- enforce concurrency policy

## `lib/executor.ts`

- spawn fresh `pi` process for a due job
- create per-run metadata and logs
- update registry/run records on start and finish

## `lib/cron-parse.ts`

- validate cron expressions
- compute next matching minute
- minute-level semantics only

Using a well-tested npm cron parser is acceptable and preferable to implementing cron logic from scratch.

## `lib/lock.ts`

- file locking for registry edits and tick processing
- prevent concurrent ticks from dispatching the same job twice

## `lib/paths.ts`

- centralize runtime paths under `~/.pi/cron`
- ensure directories exist

## `lib/validation.ts`

- validate tool inputs
- validate job objects before persistence
- normalize cwd and timestamps

## Scheduler Semantics

## Time granularity

- one minute
- any seconds in user-facing input should be rounded or rejected by higher-level UX

## Timezone

- default to local system timezone
- store explicit timezone on each job when possible
- all timestamps persisted as ISO strings

## Cron semantics

Support standard 5-field cron expressions:

```text
minute hour day-of-month month day-of-week
```

Supported syntax for MVP:

- wildcard `*`
- single values
- step values like `*/5`
- ranges like `1-5`
- comma-separated lists

Unsupported in MVP unless provided by library support and explicitly tested:

- `L`, `W`, `?`
- named aliases like `MON`, `JAN`

## One-shot semantics

For `scheduleType: "once"`:

- store absolute `runAt`
- tick runner fires when current minute is greater than or equal to scheduled minute and the job has not yet run
- after successful dispatch, the job is disabled or deleted

Disabling after execution is preferred initially because it preserves history in the registry.

## Overlap and Concurrency Policy

Default policy: `skip`

### `skip`
If a job fires while a previous run is still active, skip the new firing and record a skipped run.

### `queue`
Queue one pending execution for later. This is v2 territory.

### `parallel`
Dispatch overlapping runs in parallel. This is possible but unsafe by default for coding workflows.

For MVP, implement only `skip`. The `queue` and `parallel` values are reserved in the schema but must be rejected by validation in v1. Two concurrent pi sessions in the same `cwd` would conflict on file writes, git state, and lock files. If a job takes longer than its interval, the correct response is to increase the interval, not run overlapping agents.

## Job State File

Each job may have an optional state file that enables inter-run context passing and in-loop completion signaling. The extension treats this as passive infrastructure — it checks the file before dispatch and injects context into the prompt, but never generates content itself.

### Location

```
~/.pi/cron/state/<job-id>.json
```

### Shape

```ts
interface JobState {
  status: "running" | "completed" | "failed" | "paused";
  message?: string;       // human-readable reason for status
  context?: string;       // free-form text injected into the next run's prompt
  updatedAt: string;      // ISO timestamp
}
```

### Behavior

- **Before each dispatch**, the tick runner checks for a state file:
  - If `status === "completed"` or `"failed"`: skip the run and disable the job
  - If `status === "paused"`: skip the run but keep the job enabled
  - If `status === "running"` or no file exists: proceed normally
- **If `context` is present**, the executor prepends it to the job's prompt before spawning pi
- **The extension never writes `context`** — that's the responsibility of the spawned pi session (via the `write` tool or a future `cron_update_state` tool from the loop skill)
- **The extension only writes the state file** for lifecycle events: initial creation (`status: "running"`) and expiry-based disable (`status: "completed"`, `message: "expired"`)

### Context Injection

When a state file contains `context`, the executor composes the prompt as:

```
<previous-run-context>
{contents of context field}
</previous-run-context>

{original job prompt}
```

### Design Rationale

- **Optional**: bare `cron_create` jobs work without a state file
- **Passive**: the extension just checks and reads, minimal logic
- **Single file**: status and context in one place, one read per tick
- **Consumer-controlled**: the loop skill (or any prompt) decides what to write back — the extension doesn't impose structure on context content

## Dispatch Flow

For each tick:

1. acquire registry lock
2. load registry
3. find enabled jobs that are due
4. for each due job:
   - check state file (if exists): skip if completed/failed/paused
   - check expiry
   - check `maxRuns`
   - check overlap policy
   - read context from state file (if exists) and compose prompt
   - create run record
   - spawn detached `pi` process with composed prompt
   - update `lastRunAt`, `runs`, `lastRunId`, `running`
   - compute `nextRunAt` or disable one-shot jobs
5. write registry atomically
6. release lock

A follow-up process or completion hook should later update:

- `finishedAt`
- `status`
- `exitCode`
- `running = false`

If keeping live process tracking is too complex for v1, the implementation may instead avoid a durable `running` flag and rely on PID checks or simpler per-run state files.

## Pi Process Execution

## Required behavior

Each due run should execute a command conceptually equivalent to:

```bash
cd "$CWD" && pi -p "$PROMPT"
```

But implementation should use `spawn()` argument arrays where possible instead of raw shell interpolation.

## Recommended execution details

- set child process `cwd` directly instead of shell `cd` when possible
- write stdout and stderr to a log file
- preserve environment unless there is a reason to inject specific vars
- ensure the cron extension itself is available to the spawned pi process through normal auto-discovery

## Prompt handling

Prompts may contain quotes, newlines, or long text.

Preferred approaches, in order:

1. pass prompt as a direct CLI argument if pi handles arbitrary strings safely
2. pass prompt via stdin if pi supports it
3. write prompt to a temp file and have a tiny wrapper read it before launching pi

The final implementation should avoid shell-fragile string interpolation.

## Logging and Observability

Each run should produce:

- append-only log file with stdout/stderr
- JSON run record with timestamps and exit state

Minimum useful fields in logs and records:

- job ID
- run ID
- prompt label or summary
- cwd
- startedAt / finishedAt
- exitCode

## Bootstrap and Installation

## MVP platform target

- macOS with `launchd`

## Installation approach

The extension should install a single user agent that runs once per minute and invokes:

```text
node <extension-runner> tick
```

or equivalent if executed through ts runtime/jiti in pi's environment.

## Install command responsibilities

`/cron-install` should:

- create required runtime directories
- write or refresh the launchd plist
- load or reload the agent
- verify that the tick command is callable
- report success or actionable failure details

## Scheduler label

Use a stable label such as:

```text
com.pi.cron.tick
```

## Health Checks

A future `/cron-doctor` command should verify:

- runtime directories exist and are writable
- registry JSON is valid
- launchd agent exists and is loaded
- tick runner executable path is valid
- recent logs indicate successful recent ticks

## Safety and Failure Handling

## Registry writes

Use atomic writes:

- write to temp file
- fsync if appropriate
- rename into place

## Locking

Use a filesystem lock or advisory lock so concurrent ticks or tool calls do not corrupt state.

## Invalid jobs

If a job becomes invalid due to parse errors or missing cwd:

- mark it disabled
- preserve the record
- surface the issue in `cron_list` and `doctor`

## Missing pi binary

If the runner cannot find `pi`:

- fail the specific run
- record the error in the run record and log
- do not destroy the job

## Crash resilience

If the runner crashes mid-tick:

- registry should remain readable due to atomic writes
- partially created run records are acceptable if they aid debugging

## Security Considerations

- scheduled tasks launch pi with full user permissions
- prompts should be treated as user-authored automation inputs
- avoid shell interpolation vulnerabilities
- do not silently broaden execution privileges
- store logs locally with standard user permissions
- prefer explicit paths and normalized cwd values

## Relationship to Future `pi-loop` Skill

This extension intentionally does not parse natural-language scheduling requests.

The future `pi-loop` skill should:

- interpret requests like “every 20 minutes” or “tomorrow at 9”
- decide whether the task is one-shot or recurring
- convert to `cron_create` inputs
- explain limitations such as minute granularity and no shared live-session state

This keeps the extension small, deterministic, and reusable by multiple future skills or commands.

## Open Questions

1. ~~**CLI invocation shape**~~ **Resolved:** `pi -p "prompt"` (non-interactive print mode) processes a prompt and exits. The executor spawns `pi` with `-p` as a direct CLI argument. No temp files or stdin needed. For very long prompts, argument length limits should be tested but typical use is safe.

2. **Completion tracking**
   - Should the child process be detached and tracked via PID only?
   - Or should the runner wait and finalize metadata synchronously?

3. **Session file output**
   - Is there a stable way to capture the created session file for each scheduled run?

4. **Tool restrictions**
   - Should scheduled runs support read-only mode in v2?

5. **Cross-platform support**
   - Linux could use systemd user timers or cron
   - Windows could use Task Scheduler

## Recommended MVP Milestones

### Milestone 1 — Runtime foundation

- runtime paths
- registry read/write
- cron validation and next-run calculation
- per-run logs and records
- tick runner

### Milestone 2 — Execution

- spawn fresh pi process in stored cwd
- update run metadata and exit code
- one-shot disable behavior
- overlap policy `skip`

### Milestone 3 — Extension integration

- `cron_create`
- `cron_list`
- `cron_delete`
- `/cron-list`
- `/cron-delete`
- `/cron-install`

### Milestone 4 — Operations polish

- `/cron-run-now`
- `/cron-doctor`
- improved rendering and error reporting

## Acceptance Criteria

The MVP is successful when all of the following are true:

- a user can create a recurring scheduled prompt with `cron_create`
- a user can create a one-shot scheduled prompt with `cron_create`
- jobs persist across pi restarts
- the minute-tick scheduler continues firing without an interactive pi session open
- due jobs launch a fresh pi process in the correct cwd
- `cron_list` accurately reports active jobs and recent metadata
- `cron_delete` removes or disables a job so it no longer fires
- logs and run records make failures diagnosable

## Recommended Initial File Scaffold

```text
~/.pi/agent/extensions/cron/
  index.ts
  runner.ts
  lib/
    cron-parse.ts
    executor.ts
    lock.ts
    paths.ts
    registry.ts
    scheduler.ts
    validation.ts
```

## Summary

The recommended design is a durable cron extension built around a single OS-scheduled minute tick, a JSON registry of prompt-based jobs, and fresh non-interactive pi runs for execution. This cleanly separates infrastructure from UX and gives a future `pi-loop` skill a minimal, stable API to build on top of.
