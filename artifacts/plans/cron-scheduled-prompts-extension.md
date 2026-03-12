# Plan: Cron Scheduled Prompts Extension

## Task Description
Build a durable cron extension for pi that schedules prompts to run as fresh non-interactive pi processes on a minute-tick cadence, persisted outside session state, with job state files for inter-run context and completion signaling.

## Objective
A working pi extension at `~/.pi/agent/extensions/cron/` that lets users create, list, and delete scheduled prompt jobs. Jobs persist across pi restarts, fire via a launchd minute-tick runner, and support optional state files for context passing and lifecycle control.

## Source Document
- `artifacts/docs/reference/cron-scheduled-prompts-extension.md`

## Relevant Files

### Existing (reference patterns)
- `~/.pi/agent/extensions/todo.ts` — single-file extension pattern with tools, commands, widgets, session reconstruction
- `~/.pi/agent/extensions/web-fetch/index.ts` — directory extension with package.json and npm deps
- `~/.pi/agent/extensions/web-fetch/package.json` — package.json pattern for extensions with deps

### New Files
- `~/.pi/agent/extensions/cron/index.ts` — extension entry point (tools + commands)
- `~/.pi/agent/extensions/cron/runner.ts` — CLI entrypoint for tick runner
- `~/.pi/agent/extensions/cron/package.json` — dependencies (cron parser)
- `~/.pi/agent/extensions/cron/lib/paths.ts` — centralized runtime paths
- `~/.pi/agent/extensions/cron/lib/registry.ts` — atomic JSON registry read/write
- `~/.pi/agent/extensions/cron/lib/lock.ts` — filesystem locking
- `~/.pi/agent/extensions/cron/lib/cron-parse.ts` — cron validation + next-run calculation
- `~/.pi/agent/extensions/cron/lib/validation.ts` — input validation for tools
- `~/.pi/agent/extensions/cron/lib/scheduler.ts` — due-job computation, expiry, overlap policy
- `~/.pi/agent/extensions/cron/lib/executor.ts` — spawn pi process, log capture, run records
- `~/.pi/agent/extensions/cron/lib/state.ts` — job state file read/write (status + context)
- `~/.pi/agent/extensions/cron/lib/install.ts` — launchd plist generation and installation

## Solution Approach

Build bottom-up in 4 phases: foundation libraries → execution engine → pi extension integration → OS scheduler bootstrap. Each phase produces testable, independent modules.

The extension uses a single launchd agent (`com.pi.cron.tick`) that runs `node runner.ts tick` every minute. The tick runner loads the JSON registry, finds due jobs, checks state files, and spawns `pi -p "prompt"` for each. The extension registers `cron_create`, `cron_list`, `cron_delete` tools and `/cron-*` commands.

## Implementation Phases

### Phase 1: Foundation
Core libraries with no pi extension dependencies. All independently testable.

**[1.1] `lib/paths.ts` — Runtime paths**
Centralize all paths under `~/.pi/cron/`. Export functions for `jobsPath()`, `logsDir(jobId)`, `runsDir(jobId)`, `statePath(jobId)`, `lockPath()`, `installDir()`. Include `ensureDirs()` to create the directory tree.
**Dependencies:** None

**[1.2] `lib/lock.ts` — File locking**
Implement advisory file locking using `fs.open` with `O_EXCL` or a lockfile library. Export `acquireLock(path, timeout?)` and `releaseLock(handle)`. Used by both the tick runner and the extension tools to prevent concurrent registry corruption.
**Dependencies:** [1.1]

**[1.3] `lib/registry.ts` — Job registry**
Atomic JSON read/write for `~/.pi/cron/jobs.json`. Export `loadRegistry()`, `saveRegistry(registry)` (write to temp, fsync, rename), `addJob(job)`, `updateJob(id, patch)`, `removeJob(id)`, `getJob(id)`. Schema version field for future migrations.
**Dependencies:** [1.1], [1.2]

**[1.4] `lib/cron-parse.ts` — Cron expression handling**
Validate 5-field cron expressions. Compute next matching minute from a given time. Use an npm cron parser (e.g., `cron-parser`). Export `validateCron(expr)`, `nextRun(expr, after?, timezone?)`.
**Dependencies:** None

**[1.5] `lib/validation.ts` — Input validation**
Validate `cron_create` inputs: required fields, cron expression validity, timestamp parsing, concurrency policy (reject queue/parallel in v1), default `expiresAt` to `now + 3 days` for recurring jobs. Export `validateCreateInput(input, defaultCwd)` returning validated job or error.
**Dependencies:** [1.4]

**[1.6] `lib/state.ts` — Job state file**
Read/write `~/.pi/cron/state/<job-id>.json`. Export `readState(jobId)` returning `JobState | null`, `writeState(jobId, state)`. Shape: `{ status, message?, context?, updatedAt }`.
**Dependencies:** [1.1]

### Phase 2: Execution Engine
The tick runner and process spawning. Can be tested from CLI without pi extension loaded.

**[2.1] `lib/scheduler.ts` — Due-job computation**
Given a registry and current time, compute which jobs are due. Enforce expiry (`expiresAt`), `maxRuns`, and overlap policy (`skip` only). Export `findDueJobs(registry, now)` returning list of jobs to dispatch plus jobs to disable. Auto-disable expired jobs. Default 3-day expiry for recurring jobs without explicit `expiresAt`.
**Dependencies:** [1.3], [1.4], [1.6]

**[2.2] `lib/executor.ts` — Process spawning**
Spawn `pi -p "composed_prompt"` with `cwd` set on the child process. Compose prompt by prepending context from state file if present. Capture stdout/stderr to `~/.pi/cron/logs/<job-id>/<run-id>.log`. Write per-run JSON record to `~/.pi/cron/runs/<job-id>/<run-id>.json`. Update registry with `lastRunAt`, `runs`, `lastRunId`, `running`. On completion, update run record with `finishedAt`, `exitCode`, `status`, clear `running`.
Export `executeJob(job, stateContext?)` returning run metadata.
**Dependencies:** [1.1], [1.3], [1.6]

**[2.3] `runner.ts` — CLI tick entrypoint**
CLI script with modes: `tick` (evaluate and dispatch due jobs), `run-now <id>` (execute one job immediately). Implements the full dispatch flow: acquire lock → load registry → find due jobs → check state files → spawn processes → update registry → release lock.
**Dependencies:** [2.1], [2.2], [1.2], [1.3]

### Phase 3: Pi Extension Integration
Register tools and commands in the pi extension system.

**[3.1] `package.json` — Extension package**
Declare dependencies: `cron-parser` (or chosen library). Set `"type": "module"`, `"private": true`. Add `pi.extensions` entry pointing to `./index.ts`.
**Dependencies:** None [parallel-safe]

**[3.2] `index.ts` — Extension entry point**
Register three tools (`cron_create`, `cron_list`, `cron_delete`) and three commands (`/cron-list`, `/cron-delete`, `/cron-install`). Add system prompt guidance in `before_agent_start`. Tools delegate to library modules.
- `cron_create`: validate input → add job to registry → return job summary
- `cron_list`: load registry → filter by cwd/options → return job list
- `cron_delete`: remove job from registry → clean up state file → return confirmation
**Dependencies:** [1.3], [1.5], [1.6], [3.1]

### Phase 4: OS Scheduler Bootstrap
Install the launchd agent.

**[4.1] `lib/install.ts` — Launchd installation**
Generate plist for `com.pi.cron.tick` agent that runs `node <runner.ts> tick` every 60 seconds. Export `installLaunchd()` (write plist, `launchctl load`), `uninstallLaunchd()`, `checkInstallation()` for doctor-style status. Handle finding the correct `node` binary path. Write plist to `~/.pi/cron/install/com.pi.cron.tick.plist`.
**Dependencies:** [1.1], [2.3]

**[4.2] Wire `/cron-install` and `/cron-doctor` commands**
`/cron-install` calls `installLaunchd()` and reports success/failure. `/cron-doctor` checks: directories exist, registry valid, launchd agent loaded, runner executable, recent tick logs.
**Dependencies:** [4.1], [3.2]

## Step by Step Tasks

### 1. Foundation Libraries
- [x] [1.1] Create `lib/paths.ts` with centralized runtime paths and `ensureDirs()` [parallel-safe]
- [x] [1.2] Create `lib/lock.ts` with file locking [sequential: 1.1]
- [x] [1.3] Create `lib/registry.ts` with atomic JSON read/write [sequential: 1.1, 1.2]
- [x] [1.4] Create `lib/cron-parse.ts` with cron validation and next-run [parallel-safe]
- [x] [1.5] Create `lib/validation.ts` with input validation [sequential: 1.4]
- [x] [1.6] Create `lib/state.ts` with job state file read/write [sequential: 1.1]

### 2. Execution Engine
- [x] [2.1] Create `lib/scheduler.ts` with due-job computation [sequential: 1.3, 1.4, 1.6]
- [x] [2.2] Create `lib/executor.ts` with pi process spawning [sequential: 1.1, 1.3, 1.6]
- [x] [2.3] Create `runner.ts` CLI tick entrypoint [sequential: 2.1, 2.2, 1.2, 1.3]

### 3. Pi Extension
- [x] [3.1] Create `package.json` with dependencies and run `npm install` [parallel-safe]
- [x] [3.2] Create `index.ts` with tools, commands, and system prompt [sequential: 1.3, 1.5, 1.6, 3.1]

### 4. OS Bootstrap
- [x] [4.1] Create `lib/install.ts` with launchd plist management [sequential: 1.1, 2.3]
- [x] [4.2] Wire `/cron-install` and `/cron-doctor` into index.ts [sequential: 4.1, 3.2]

### 5. Testing & Validation
- [x] [5.1] Manual end-to-end test: create job, verify tick fires, check logs [sequential: 4.2]

## Acceptance Criteria

- `cron_create` creates recurring and one-shot scheduled prompt jobs
- Jobs persist in `~/.pi/cron/jobs.json` across pi restarts
- The launchd minute-tick runner fires without an interactive pi session
- Due jobs launch `pi -p "prompt"` in the correct `cwd`
- State files (`status` + `context`) are read before dispatch and respected
- Context from state file is prepended to the prompt
- Jobs with `completed`/`failed` status are skipped and disabled
- Recurring jobs default to 3-day expiry
- Only `skip` concurrency policy is accepted in v1
- `cron_list` shows active jobs with recent metadata
- `cron_delete` removes a job so it no longer fires
- `/cron-install` installs the launchd agent successfully
- Logs and run records are written to `~/.pi/cron/logs/` and `~/.pi/cron/runs/`

## Validation Commands

- `cat ~/.pi/cron/jobs.json` — verify registry structure
- `launchctl list | grep com.pi.cron` — verify launchd agent is loaded
- `ls ~/.pi/cron/logs/` — verify logs are being written
- `ls ~/.pi/cron/runs/` — verify run records exist
- `pi -p "list my scheduled tasks"` — verify cron_list tool works from non-interactive mode

## Notes

- Use `cron-parser` npm package for cron expression handling rather than implementing from scratch
- The runner.ts needs to resolve the `pi` binary path — use `which pi` or a known path
- For v1, the runner waits for each child process synchronously to simplify completion tracking
- Long prompts passed via `-p` flag should be tested for OS argument length limits
