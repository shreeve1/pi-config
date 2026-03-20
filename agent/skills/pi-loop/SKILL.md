---
name: pi-loop
description: Schedule a prompt to run on a recurring interval or at a specific time using the cron extension. Use when the user says "loop", "every N minutes", "check on this periodically", "remind me", "schedule", "run this on a timer", or wants a prompt to fire repeatedly in the background without an active session.
---

# Schedule a Recurring or One-Shot Prompt

Parse the user's natural-language scheduling request, convert it to `cron_create` inputs, create the job, and confirm. This skill is the UX layer on top of the cron extension's tools.

---

## Step 1 — Parse the Request

Extract from the user's message:

- **Prompt**: what should pi do each time it fires
- **Interval or time**: how often, or when
- **One-shot vs recurring**: is this a single future event or a repeated task?
- **Label**: short name for the job (infer from prompt if not explicit)
- **CWD**: default to current directory unless specified

### Interval Syntax

Support these natural patterns and convert to cron expressions:

| User says | Cron expression | Type |
|-----------|----------------|------|
| `every 5 minutes`, `5m` | `*/5 * * * *` | recurring |
| `every 10 minutes`, `10m` | `*/10 * * * *` | recurring |
| `every 30 minutes`, `30m` | `*/30 * * * *` | recurring |
| `every hour`, `1h`, `every 60 minutes` | `0 * * * *` | recurring |
| `every 2 hours`, `2h` | `0 */2 * * *` | recurring |
| `every day at 9am` | `0 9 * * *` | recurring |
| `every weekday at 9am` | `0 9 * * 1-5` | recurring |
| `at 3pm`, `at 15:00` | compute ISO timestamp | once |
| `in 45 minutes` | compute ISO timestamp | once |
| `in 2 hours` | compute ISO timestamp | once |
| `tomorrow at 9am` | compute ISO timestamp | once |

**Interval defaults**: If no interval is specified, default to `every 10 minutes`.

**Seconds**: If the user says seconds (e.g., `30s`, `every 30 seconds`), round up to 1 minute and tell them: "Cron has minute-level granularity, so I've rounded to every 1 minute."

**Odd intervals**: Intervals that don't divide evenly (e.g., `7m`, `90m`) should be mapped to the nearest clean cron expression. Tell the user what you picked. For example:
- `7m` → `*/7 * * * *` (fires at minutes 0, 7, 14, 21, 28, 35, 42, 49, 56 — close enough)
- `90m` → `0 */2 * * *` (every 2 hours — round from 1.5h and explain)

**Trailing `every` clause**: The interval can appear at the start or end of the message:
- `/loop 5m check the build` → every 5 minutes
- `/loop check the build every 2 hours` → every 2 hours

### One-Shot Detection

The request is one-shot if it uses:
- `at <time>` (specific clock time)
- `in <duration>` (relative future)
- `tomorrow`, `next Monday`, etc.
- `remind me` (usually one-shot)

Otherwise assume recurring.

---

## Step 2 — Create the Job

Call `cron_create` with the parsed inputs:

```
cron_create({
  prompt: "<extracted prompt>",
  scheduleType: "cron" | "once",
  cron: "<cron expression>",        // for recurring
  runAt: "<ISO timestamp>",          // for one-shot
  label: "<short label>",
  cwd: "<current directory>",
})
```

The extension automatically:
- Defaults `expiresAt` to 3 days for recurring jobs
- Sets `concurrency` to `skip`
- Computes `nextRunAt`

---

## Step 3 — Confirm

Report clearly:

For recurring:
```
✅ Scheduled: "<label>"
   Every <interval> (cron: <expression>)
   Prompt: <prompt summary>
   Next run: <time>
   Expires: <3 days from now>
   CWD: <directory>
   Job ID: <id>
```

For one-shot:
```
✅ Scheduled: "<label>"
   At <time>
   Prompt: <prompt summary>
   CWD: <directory>
   Job ID: <id>
```

---

## Step 4 — Remind About the Scheduler

If this is the user's first job (check via `cron_list`), add:

```
💡 Make sure the background scheduler is installed: run /cron-install
   Without it, jobs only fire while pi is open.
```

---

## Limitations to Communicate

When relevant, tell the user:

- **Minute granularity**: cron can't fire more often than once per minute
- **Fresh sessions**: each run is an independent `pi -p` session — no shared memory with the current session or between runs
- **Context passing**: each run can call `cron_write_context` with its job ID to save a summary/context for the next run. This is automatically injected into the next run's prompt as `<previous-run-context>`. The job ID and instructions are included in every spawned prompt.
- **3-day expiry**: recurring jobs expire after 3 days by default. To extend, recreate the job or set a custom `expiresAt`.
- **No live session**: scheduled runs execute in the background without an interactive session. They have access to all tools but no user interaction.
- **Overlap policy**: if a run is still going when the next tick fires, it's skipped (not queued)

---

## Managing Existing Jobs

If the user asks about existing scheduled tasks:

- **List**: call `cron_list` and format the results
- **Delete**: call `cron_delete` with the job ID
- **What's running?**: call `cron_list` and highlight running/recent jobs

---

## Examples

### User: `/loop 5m check if the deployment finished`

→ Recurring, every 5 minutes, prompt = "check if the deployment finished"
→ `cron_create({ prompt: "check if the deployment finished", scheduleType: "cron", cron: "*/5 * * * *", label: "deployment-check" })`

### User: `/loop check the build every 2 hours`

→ Trailing interval, recurring, every 2 hours
→ `cron_create({ prompt: "check the build", scheduleType: "cron", cron: "0 */2 * * *", label: "build-check" })`

### User: `remind me at 3pm to push the release branch`

→ One-shot at 3pm today
→ `cron_create({ prompt: "remind me to push the release branch", scheduleType: "once", runAt: "<today 3pm ISO>", label: "push-release" })`

### User: `in 45 minutes, check whether the integration tests passed`

→ One-shot in 45 minutes
→ `cron_create({ prompt: "check whether the integration tests passed", scheduleType: "once", runAt: "<now+45m ISO>", label: "integration-test-check" })`

### User: `/loop 20m /review-pr 1234`

→ Recurring, every 20 minutes, prompt = "/review-pr 1234"
→ The scheduled prompt itself is a skill invocation — the spawned pi session will expand it.
→ `cron_create({ prompt: "/review-pr 1234", scheduleType: "cron", cron: "*/20 * * * *", label: "review-pr-1234" })`

### User: `what scheduled tasks do I have?`

→ Call `cron_list` and format results.

### User: `cancel the deploy check job`

→ Call `cron_list`, find the matching job, call `cron_delete`.
