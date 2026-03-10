---
name: pi-dev-build
description: Use when executing a multi-step implementation plan with dependencies, parallelizable tasks, and progress tracking across waves of work.
---

# Execute Implementation Plan

Use this skill when the user wants to carry out a written implementation plan, especially when the work includes dependencies, multiple task groups, or opportunities for safe parallel execution. Treat the plan system as the source of truth for task readiness and progress, and only parallelize work that is genuinely independent. Do not use this skill for quick one-off edits, simple fixes, or work that does not have a written plan.

---

## Variables

- `PATH_TO_PLAN` — path to a specific plan file, if provided
- `PLAN_DIRECTORIES` — `artifacts/plans/`, `specs/`

---

## Workflow Overview

Work through these steps in order, skipping only those that clearly do not apply:

1. Discover and confirm the plan
2. Establish the execution workspace
3. Load plan state and task readiness
4. Build a safe wave schedule
5. Execute one wave at a time
6. Evaluate results and mark completed tasks in the plan file
7. Verify results before claiming success
8. Decide the next workflow handoff
9. Report the final build status

The goal is not maximum parallelism. The goal is safe, dependency-aware progress in an isolated branch when implementation could affect the current checkout, followed by an explicit decision about testing or merge.

---

## Phase 1 — Discover the Plan

If the user provided a specific plan path, use it as `PATH_TO_PLAN`.

If no plan path was provided:

1. Use `bash` to find recent markdown files in `artifacts/plans/` and `specs/`
2. If one clear candidate exists, confirm it with `ask_user`
3. If several likely candidates exist, present the most relevant 1-3 options with `ask_user`
4. If no plan is found, ask the user to provide a path

Once confirmed, use `read` to inspect the selected plan for context.

---

## Phase 2 — Establish the Execution Workspace

Before implementation begins, decide whether work should continue in the current checkout or in a git worktree.

Use `bash` to inspect:
- whether the repository is a git repo
- the current branch name
- the repository top-level path
- whether the current directory is already a linked worktree
- whether `.worktrees/` or `worktrees/` already exists
- existing local worktrees and branch names so you do not collide with an already-active branch

Default policy:
- if already inside a non-primary worktree, continue there
- if on `main`, `master`, or another shared branch, prefer a git worktree
- if the upcoming wave includes multi-file implementation work, prefer a git worktree unless the user explicitly wants in-place changes
- if the user already provided a feature branch or workspace path, honor it
- if the repo is not a git repository, skip worktree setup cleanly and report that execution will happen in-place

Directory selection priority:
1. existing `.worktrees/`
2. existing `worktrees/`
3. any documented preference in `AGENTS.md`
4. ask the user whether to use a project-local `.worktrees/` directory or the global location `~/.pi/worktrees/<project-name>/`

Branch naming rules:
- if the user supplied a branch name, use it
- otherwise derive a short kebab-case name from the plan topic or filename
- prefer prefixes that describe intent, such as `feat/`, `fix/`, `refactor/`, or `chore/`, when the plan makes that obvious
- strip spaces and punctuation that make shell usage awkward
- if the derived branch already exists, ask whether to reuse it in an existing worktree or create a distinct suffix such as `-2`

For project-local worktree directories, verify with `bash` that the directory is ignored by git before creating a worktree. Prefer an explicit check such as `git check-ignore .worktrees` or `git check-ignore worktrees`.

If the directory is not ignored:
- inspect `.gitignore` with `read`
- add the missing ignore entry with `edit`
- tell the user exactly what line was added
- continue only after the ignore rule is in place

When a worktree is needed, use `bash` to:
- derive a branch name using the rules above if the user did not provide one
- resolve the full path, either `<repo>/.worktrees/<branch>` or `~/.pi/worktrees/<project-name>/<branch>`
- create the worktree with `git worktree add <path> -b <branch>`
- capture the resulting path for all subsequent `subagent` calls that support `cwd`

After creation, run only the lightest sensible bootstrap for the repo in that worktree, such as dependency install or a targeted baseline command already documented by the project.

Baseline command selection policy:
- Prefer commands from the selected plan's `Validation Commands`
- Before running each baseline command, verify referenced test/file paths exist in the execution workspace
- If a referenced path is missing, run Phase 2.5 provenance checks before declaring baseline failure

Baseline failure policy:
- if bootstrap or baseline verification fails before any implementation work starts, treat that as a pre-existing issue unless provenance checks show a missing-baseline mismatch
- report the failing command and the relevant output concisely
- ask the user whether to stop and investigate, continue despite the dirty baseline, or switch back to planning/validation
- do not silently proceed past a failing baseline

Useful command patterns:
- `git rev-parse --is-inside-work-tree && git rev-parse --show-toplevel`
- `git branch --show-current`
- `git worktree list --porcelain`
- `git check-ignore .worktrees`
- `git worktree add <path> -b <branch>`

Report the selected execution path, branch name, and baseline status clearly before moving on.

### Phase 2.5 — Preflight Baseline Provenance (required)

Before executing tasks, verify the selected workspace contains the plan's expected baseline files/tests.

1. From the plan's `Relevant Files` and `Validation Commands`, extract must-exist paths.
2. In the execution workspace, verify each path exists.
3. If using a worktree and required files are missing, compare against the source checkout to detect this common case:
   - files exist in primary checkout but not in worktree because they are uncommitted local changes.
4. If this mismatch is detected, STOP and ask the user to choose one:
   - `Promote baseline first` (commit/cherry-pick/patch the prerequisite changes into branch history)
   - `Run in-place` (accept higher risk)
   - `Copy prerequisite files into worktree` (explicit, scoped)
5. Do not start wave execution until prerequisite baseline is resolved.

This prevents false baseline failures like “No test files found” caused by worktrees starting from committed history only.

## Phase 3 — Load Plan Progress

Use the plan tools as the source of truth for execution state when available.

1. Call `read_plan` to load the plan structure and dependency graph
2. Call `get_progress` to determine:
   - completed tasks
   - ready tasks
   - blocked tasks
   - dependency relationships
   - current execution batches, if available

**Important:** The plan file used is whatever was discovered in Phase 1 (e.g., `artifacts/plans/migrate-qbittorrent-to-gluetun.md`), NOT a file named `plan.md`. Plan files can have any name in `artifacts/plans/` or `specs/`.

If the plan tools fail (e.g., they require a specific file path format that doesn't match your plan, or return an error):
- Do NOT ask the user to create or sync a `plan.md` file
- Automatically proceed in **manual mode** using the selected markdown plan
- In manual mode:
  - do not use `read_plan`, `get_progress`, or `update_progress`
  - parse task structure and dependencies directly from the plan markdown
  - maintain task state in `todo_write`
  - mark checkboxes in the plan markdown only when evidence confirms completion
  - report clearly that you are operating in manual mode

Use `read` on the plan file to gather:
- human-readable task descriptions
- implementation notes
- validation commands
- context not exposed by the plan tools

If the plan file and plan tool state materially disagree, stop and report the mismatch before executing.

---

## Phase 4 — Build the Wave Schedule

Create waves from the currently ready tasks, then rebuild the schedule after each wave completes.

### Scheduling rules

Apply these rules in priority order:

1. **Plan dependencies come first**  
   Only schedule tasks that are currently ready according to the plan system (or, in manual mode, tasks whose dependencies have been marked complete in the plan markdown).

2. **Honor explicit sequencing**  
   If the plan marks tasks as sequential, keep them out of parallel execution.

3. **Do not parallelize overlapping work**  
   Tasks that modify the same files, the same subsystem, or tightly coupled code paths should not run in parallel. Put them in separate waves or assign them to one subagent.

4. **Prefer independence over throughput**  
   Parallelize only tasks that are likely to succeed without stepping on each other.

5. **Keep waves understandable**  
   A smaller safe wave is better than a large conflicted wave.

For each wave, write a brief summary like:

If execution is happening in a worktree, note that path and branch in the wave summary so later verification and follow-up commands stay in the same workspace.

```text
Wave 1: [1.1], [1.2]
Reason: both tasks are ready and modify separate areas

Wave 2: [2.1]
Reason: depends on Wave 1 outputs and touches shared backend files
```

---

## Phase 5 — Prepare Execution Context

Before launching a wave:

- identify the task IDs in the wave
- gather each task’s exact wording from the plan
- include relevant plan context for the assigned work
- include outputs or constraints from earlier completed waves if needed

Use `todo_write` to create or update a session todo list for the current wave.

If using a worktree, include the worktree path and branch in the surrounding execution notes you pass to subagents so they operate in the isolated checkout rather than the original repository path.

Each todo should include:
- stable task ID
- concise task description
- status
- priority
- dependencies if helpful

---

## Phase 6 — Execute the Wave

Use `subagent` to execute the current wave.

Use parallel subagents only when the wave contains truly independent tasks. Otherwise, use a single subagent or run tasks sequentially.

### Parallel execution

For independent tasks, use `subagent` with parallel tasks. **Inline the full task description and relevant context into each subagent prompt** — do not just tell the subagent to "read the plan." The orchestrator already has this context; passing it directly saves tokens and prevents subagents from misidentifying their task.

```json
{
  "tasks": [
    {
      "agent": "worker",
      "cwd": "<EXECUTION_PATH>",
      "task": "## Task [N.M]: <task title>\n\n<full task description from plan>\n\n### Context\n<any relevant notes from earlier waves, dependencies, or plan sections>\n\n### Relevant files\n<list files this task will likely touch>\n\n### Instructions\n- Implement only this task\n- Do not work on other tasks or do unrelated cleanup\n- When finished, report using this format:\n\n```\nStatus: complete | partial | blocked\nFiles changed:\n- <path> — <what changed>\n- <path> — <what changed>\nKey decisions:\n- <any non-obvious choice you made>\nBlockers:\n- <anything preventing completion, or \"none\">\n```"
    }
  ]
}
```

### Sequential execution

If tasks are tightly coupled, overlapping, or too small to benefit from parallelism, execute them in one subagent or handle them directly. Use the same prompt structure and report format.

### Subagent prompt rules

Every subagent prompt must:
- include the full task description inline (do not rely on the subagent reading the plan)
- include relevant context from earlier waves or the plan
- specify the execution path via `cwd` when using a worktree
- require the structured report format shown above
- tell the subagent not to work on other tasks or do opportunistic refactors

---

## Phase 7 — Evaluate Wave Results and Mark Progress

After a wave completes:

1. Review each subagent result
2. Confirm whether each assigned task was actually completed
3. Note files changed and any cross-task conflicts

If any task failed or produced conflicting work:
- stop before launching the next wave
- do not mark failed tasks complete
- report which tasks need resolution
- explain whether the issue is a code failure, merge/conflict problem, missing dependency, or unclear plan step

Only continue when the wave result is coherent.

### Mark progress in the plan file (REQUIRED)

**You MUST update the plan file for every completed task before moving on.** This is not optional. Updating session todos is not a substitute for updating the plan file. Both must happen.

**If using plan tools (not in manual mode):**
- Call `update_progress(taskIndex)` for each completed task immediately after confirming it is done
- Do not mark guessed or partially completed work
- After updating progress for all completed tasks, call `get_progress` to discover the next ready batch

**If in manual mode:**
- Use `edit` to change `- [ ]` to `- [x]` in the plan markdown file for each completed task
- Parse the plan markdown to determine which tasks become ready after dependencies complete

Then update the session `todo_write` list to reflect completed tasks.

Do not mix plan tools and manual mode. Stay consistent with whichever mode was established in Phase 3.

---

## Phase 8 — Verify Before Claiming Success

Do not report success based only on task execution. Verify the work.

Use validation evidence from the plan where available. Run verification from the same checkout where implementation happened; if a worktree was used, keep all verification commands in that worktree.
- commands listed in `## Validation Commands`
- relevant test commands
- build, lint, or typecheck commands
- explicit manual validation steps if automation is unavailable

Prefer targeted verification that matches the completed tasks. For full-plan completion, run the strongest relevant validation available within reasonable scope.

If verification fails:
- report implementation as completed or partially completed only where supported
- clearly state that validation failed
- do not claim the build succeeded

If the plan does not define validation commands, say so explicitly and provide the best available verification you performed.

---

## Phase 9 — Continue Wave-by-Wave

Repeat:
1. Check progress (via `get_progress` in plan tool mode, or by parsing the plan markdown in manual mode)
2. Build the next safe wave from ready tasks (Phase 4)
3. Prepare subagent prompts with inlined task content (Phase 5)
4. Execute the wave (Phase 6)
5. Evaluate results using the structured subagent reports (Phase 7)
6. **Mark progress in the plan file** — call `update_progress` for each completed task, or `edit` checkboxes in manual mode. This is required every loop iteration, not just at the end.
7. Verify as appropriate (Phase 8)

Stop when:
- all implementation tasks are complete
- a wave fails
- the plan state becomes inconsistent
- the user interrupts or changes direction

---

## Phase 10 — Decide the Next Workflow Handoff

After implementation tasks are complete and the relevant build-side verification has succeeded, do not assume the next step. Ask the user what they want to do next.

Use `ask_user` with a focused `select` prompt. The default options should be:
- `Move to pi-dev-test in this worktree`
- `Merge this branch into main`
- `Keep the worktree open for more changes`

Adapt `main` to the project’s primary branch name if it is different.

Decision rules:
- if testing has not yet been run at the level implied by the plan, recommend `Move to pi-dev-test in this worktree`
- if the user explicitly asked for build-only work and verification is already sufficient, offer merge more neutrally
- if validation or verification failed, do not offer merge as the recommended path
- if the current workspace is not a git repo or not on an isolated branch, explain that merge guidance is not applicable and report the current state instead

If the user chooses testing:
- clearly report the worktree path, branch, and plan path that `pi-dev-test` should use
- state that testing should happen before merge so verification and integration happen in the same isolated workspace

If the user chooses merge:
- do not perform the merge implicitly
- summarize the branch, worktree path, and verification evidence that supports merging
- ask for explicit confirmation before any merge command is run in a later workflow

If the user chooses to keep working:
- report that the worktree remains the source of truth for further edits and testing

---

## Report

### Success report

When implementation and verification succeed, report:

```text
## Build Complete

Plan: <plan name>
File: <PATH_TO_PLAN>
Worktree: <path or "none">
Branch: <branch or "none">

Execution Summary:
- Waves executed: <N>
- Tasks completed: <M>
- Tasks failed: 0

Verification:
- <command/result>
- <command/result>

Next Step Decision:
- Selected: <move to pi-dev-test | merge into main | keep working>
- Recommendation: <brief reason>

Files Modified:
- <file path 1>
- <file path 2>

Status: ✅ Success
```

### Partial or failed report

If execution or verification fails, report:

```text
## Build Stopped

Plan: <plan name>
File: <PATH_TO_PLAN>

Stopped at:
- Wave: <N>
- Tasks: <task IDs>

Reason:
- <failure, blocker, or validation issue>

Completed So Far:
- <completed task IDs>

Next Steps:
- <what needs to be fixed, clarified, or rerun>

Status: ❌ Not complete
```

---

## Execution Notes

- Prefer the plan tools over manual parsing for dependency state when they work with your plan file
- If plan tools don't support your plan file format/path, use manual mode seamlessly without asking
- Prefer safe serialization over risky parallelism
- Do not run tasks in parallel when they are likely to edit the same files
- Do not mark progress until results are reviewed
- Do not claim success without verification evidence
- Plan files can have any name in `artifacts/plans/` or `specs/` - there is no requirement for a file named `plan.md`
