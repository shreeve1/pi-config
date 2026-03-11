---
name: pi-loop
description: Create a requirements file from project context and run an autonomous development loop that executes tasks iteratively using fresh pi sessions. Use when the user wants to set up a Ralph-style autonomous loop, hands-off development cycle, continuous autonomous coding, or says things like "loop on this", "build this autonomously", "run a loop", or "set it and forget it."
---

# Autonomous Development Loop

Set up and run an autonomous development loop. Phase 1 interactively builds a requirements file from the project context and user input. Phase 2 launches a bash loop that calls `pi -p` repeatedly, working through tasks one at a time with fresh sessions, circuit breaker protection, and live progress monitoring.

Do not use this for quick one-off edits or when the user wants interactive back-and-forth on implementation details.

---

## Phase 1 — Gather Context and Build Requirements

### 1.1 — Scan the project

Use `Bash` to understand the project:

```bash
# Project structure
find . -maxdepth 3 -type f \( -name "*.md" -o -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name "*.toml" \) | grep -v node_modules | grep -v .git | head -30

# Package info if available
cat package.json 2>/dev/null | head -30
cat pyproject.toml 2>/dev/null | head -20
cat Cargo.toml 2>/dev/null | head -20

# README
cat README.md 2>/dev/null | head -50

# Existing specs/plans
ls artifacts/specs/ artifacts/plans/ 2>/dev/null
```

Use `Read` on any relevant files found (README, existing specs, AGENTS.md, etc).

### 1.2 — Interview the user

Use `ask_user` to understand what they want the loop to accomplish. Ask one question at a time:

1. **Goal**: "What should the loop accomplish? Describe the end state."
2. **Scope**: "What areas of the codebase should it touch? Any areas it should NOT touch?"
3. **Validation**: "How should each task be validated? (tests, build, lint, manual check)"
4. **Constraints**: "Any constraints? (specific frameworks, patterns, files to preserve)"

Keep it to 3-5 questions. Extract what you need from project context to avoid asking obvious things.

### 1.3 — Generate requirements

Create the `.loop/` directory structure and write the requirements file.

Use `Bash`:
```bash
mkdir -p .loop/logs
```

Use `Write` to create `.loop/requirements.md` with this structure:

```markdown
# Loop Requirements

**Created:** <date>
**Goal:** <one-line summary>
**Validation:** <how to verify work — e.g., `npm test`, `npm run build`, `cargo test`>

## Constraints
- <constraint 1>
- <constraint 2>

## Tasks

- [ ] Task 1: <clear, atomic task description>
- [ ] Task 2: <clear, atomic task description>
- [ ] Task 3: <clear, atomic task description>
...

## Context
<relevant project context the loop agent needs — tech stack, key files, patterns>

## Done Criteria
<what "all done" looks like>
```

**Task writing rules:**
- Each task must be atomic — completable in a single session
- Each task must be independently verifiable
- Order tasks by dependency (earlier tasks first)
- Include 5-20 tasks. If the scope implies more, break it into phases and ask the user which phase to loop on.
- Prefix dependent tasks with their dependency: "After Task 3: ..."

### 1.4 — Confirm with user

Show the generated requirements to the user using `Read` on `.loop/requirements.md`.

Use `ask_user` with `type: "confirm"` to ask if they're happy with the requirements, or want to edit.

If they want changes, use `ask_user` with `type: "editor"` to collect edits, then update the file.

### 1.5 — Add to .gitignore

Use `Bash` to ensure `.loop/` is gitignored:

```bash
if [ -f .gitignore ]; then
  grep -q '^\.loop/' .gitignore || echo '.loop/' >> .gitignore
else
  echo '.loop/' > .gitignore
fi
```

---

## Phase 2 — Configure and Launch the Loop

### 2.1 — Write the loop configuration

Use `Write` to create `.loop/config.sh`:

```bash
# Loop configuration
MAX_ITERATIONS=50
MAX_STUCK_COUNT=3
TIMEOUT_MINUTES=15
COOLDOWN_SECONDS=5
VALIDATION_CMD="<from requirements>"
GIT_SAFETY=true  # auto-checkpoint before each iteration, rollback on failure
```

Set `GIT_SAFETY=false` if the project isn't a git repo or the user doesn't want auto-commits.

### 2.2 — Write the loop script

Use `Write` to create `.loop/run.sh` with the content from [the loop script](scripts/loop.sh). Use `Read` on that script file to get the content, then write it to `.loop/run.sh`.

Make it executable:
```bash
chmod +x .loop/run.sh
```

### 2.3 — Write the monitor script

Use `Write` to create `.loop/monitor.sh` with the content from [the monitor script](scripts/monitor.sh). Use `Read` on that script file to get the content, then write it to `.loop/monitor.sh`.

Make it executable:
```bash
chmod +x .loop/monitor.sh
```

### 2.4 — Launch

Ask the user how to launch:

```
Use `ask_user` with `type: "select"`:
- "Launch with tmux monitoring (recommended)" 
- "Launch in background (check .loop/logs/)"
- "Don't launch yet, I'll start it manually"
```

**If tmux monitoring:**
```bash
tmux new-session -d -s pi-loop '.loop/run.sh 2>&1 | tee -a .loop/logs/latest.log'
tmux split-window -h -t pi-loop 'watch -n 2 .loop/monitor.sh'
tmux attach -t pi-loop
```

**If background:**
```bash
nohup .loop/run.sh > .loop/logs/latest.log 2>&1 &
echo $! > .loop/.pid
echo "Loop running in background (PID: $(cat .loop/.pid))"
echo "Monitor: .loop/monitor.sh"
echo "Logs: tail -f .loop/logs/latest.log"
echo "Stop: kill $(cat .loop/.pid)"
```

**If manual:**
Report the commands to run and exit.

---

## Phase 3 — Stopping, Skipping, and Resuming

When the user comes back, they can:

- **Check status**: `.loop/monitor.sh` (or `watch -n 2 .loop/monitor.sh`)
- **Stop**: `kill $(cat .loop/.pid)` or Ctrl+C in tmux
- **Skip stuck task**: `touch .loop/.skip` — the loop will mark the current task as skipped (`[~]`) and move on
- **Resume**: `.loop/run.sh` (it picks up from the first unchecked task)
- **Review progress**: `cat .loop/requirements.md`
- **Git rollback**: if `GIT_SAFETY=true`, each iteration is checkpointed. Failed iterations auto-rollback. Use `git log --oneline` to see checkpoints.

---

## Report

After setting everything up, output:

```text
## Loop Ready

Requirements: .loop/requirements.md
Tasks: <N> tasks defined
Validation: <validation command>
Config: .loop/config.sh

Loop script: .loop/run.sh
Monitor: .loop/monitor.sh
Logs: .loop/logs/

Status: <launched with tmux | running in background (PID: X) | ready to launch manually>

Commands:
  Start:   .loop/run.sh
  Monitor: .loop/monitor.sh  (or: watch -n 2 .loop/monitor.sh)
  Stop:    kill $(cat .loop/.pid)
  Resume:  .loop/run.sh  (auto-resumes from last incomplete task)
```
