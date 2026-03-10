---
name: pi-dev-test
description: Use when the user wants to run tests, generate or expand test coverage, analyze failing tests, or verify an implementation against a plan, acceptance criteria, or validation commands.
---

# Dev Test

Use this skill to orchestrate testing work: run existing tests, inspect coverage and test gaps, generate or expand tests when appropriate, and verify implementations against plans or acceptance criteria. Choose the lightest mode that fits the request. Do not use this skill for manual exploratory QA or root-cause debugging of a specific failing test when the primary need is diagnosis rather than test orchestration.

---

## Variables

- `PATH_TO_PLAN` - optional path to a plan file
- `BROWSER_MODE` - from `--browser=none|headless|headed`, default `none`
- `RUN_ONLY` - from `--run`
- `COVERAGE` - from `--coverage`
- `ANALYZE_FAILURES` - from `--analyze-failures`
- `ANALYZE` - from `--analyze`
- `GENERATE_MISSING` - from `--generate-missing`
- `MANIFEST_PATH` - `.pi/test-manifest.json`
- `TEST_DIR` - `tests/`
- `PLAN_DIRECTORIES` - `artifacts/plans/`, `specs/`

---

## Workflow Overview

Choose the lightest mode that satisfies the request:

1. **Plan-Driven Mode** - verify work against a plan, acceptance criteria, or validation commands
2. **Run Mode** - run existing tests quickly
3. **Analyze Mode** - inspect gaps, stale tests, and low coverage without focusing on execution first
4. **Discovery Mode** - inspect project test setup, identify frameworks, and optionally generate missing tests

Rules:
- Prefer **Run Mode** when the user just wants tests executed
- Prefer **Analyze Mode** when the user wants coverage or gap insight
- Prefer **Plan-Driven Mode** when a plan file or acceptance criteria drive verification
- Use **Discovery Mode** when test structure is unclear or the project lacks an established test workflow

Workspace policy:
- If implementation happened in a git worktree, run verification in that same worktree
- If the current directory is already a linked worktree, keep using it
- If the user is testing a branch-based implementation from `main` or another shared checkout and the test flow may write files, caches, snapshots, or generated artifacts, invoke the `pi-worktree` skill to create an isolated worktree before running tests

Do not make implementation changes by default. If tests expose product bugs, report them clearly and only fix implementation if the user asked for a repair-oriented testing loop.

---

## Mode Detection

Determine mode in this order:

1. If a valid plan path is provided, use **Plan-Driven Mode**
2. Else if `--run` is present, use **Run Mode**
3. Else if `--analyze` is present, use **Analyze Mode**
4. Else use **Discovery Mode**

If the request is ambiguous, use `ask_user` to confirm the intended mode before proceeding.

---

# MODE 1: Plan-Driven Mode

Use this mode when testing should be anchored to a written plan or explicit acceptance criteria.

## Phase P1 - Discover and Read the Plan

Before selecting commands, use `bash` to determine the execution workspace: current branch, git top-level path, and whether the current directory is already a linked worktree. If the plan was built in a separate worktree path, treat that path as the default testing workspace.

If `PATH_TO_PLAN` is provided, use it.

If not:
1. Use `bash` to find recent markdown files in `artifacts/plans/` and `specs/`
2. If one clear candidate exists, confirm it with `ask_user`
3. If multiple likely candidates exist, present the most relevant options with `ask_user`
4. If no plan can be found, ask the user for a path or switch to a non-plan mode

Use `read` to inspect the selected plan.

Extract:
- task description and objective
- acceptance criteria
- testing strategy
- validation commands
- relevant files
- implementation tasks and any `[N.M]` task IDs
- `#req-*` tags if present
- traceability information if present

## Phase P2 - Decide What Must Be Verified

Identify what kinds of tests are appropriate:
- **Unit tests** for functions, utilities, transformations, isolated modules
- **Integration tests** for component interaction, endpoints, services, persistence, and workflows across boundaries
- **E2E or browser tests** for user-facing flows, pages, or interactive browser behavior

If browser testing is likely relevant and `BROWSER_MODE` is `none`, ask the user whether browser verification should be included.

## Phase P3 - Write or Expand Tests

Prefer existing test coverage and validation commands before adding new tests.

Write or expand tests only as needed to verify the plan.

Use `subagent` with `worker` when helpful for focused test-writing work. A typical prompt should instruct the subagent to:
- read the plan
- write tests for the specified criteria
- stay within the required scope
- report files created or modified
- report blockers clearly

If using task traceability, include comments or naming conventions that link tests to plan task IDs or requirement tags.

Do not weaken assertions or mark tests skipped just to force a passing result.

Do not modify implementation unless the user explicitly asked for a fix-oriented loop.

## Phase P4 - Run Verification

Use `bash` to run:
- plan validation commands where available
- test commands appropriate to the project
- browser/E2E tests if included

Run these commands from the same workspace used for implementation. If that workspace is a worktree, keep all commands scoped there so test results match the code under review.

Prefer targeted commands first, then broader verification if needed.

Capture:
- pass/fail counts
- failing files or suites
- command outputs
- whether the plan's acceptance criteria are satisfied, partially satisfied, or not yet satisfied

## Phase P5 - Report Plan Verification

Summarize:
- which criteria were verified by passing tests
- which criteria remain unverified or failing
- what test files were added or updated
- whether validation commands passed
- whether browser verification was included

Only mark plan completion or test completion when supported by actual results.

---

# MODE 2: Run Mode

Use this mode for fast execution of existing tests.

## Phase R1 - Load Existing Test Context

If `MANIFEST_PATH` exists, use `read` to inspect it for:
- preferred run commands
- coverage commands
- known test directories
- prior results

Use the manifest as a convenience for known commands and prior results, but prefer the current repository state if they disagree.

If no manifest exists, infer the test command from the project structure using `bash`.

## Phase R2 - Run Tests

Use `bash` to run the most appropriate existing test command.

If the repo has an active implementation worktree, prefer running from that worktree rather than the primary checkout. If no worktree is active and the requested testing step is likely to update snapshots, fixtures, coverage artifacts, or generated files, invoke the `pi-worktree` skill to create an isolated worktree before proceeding.

Examples may include:
- project package scripts
- direct test runner commands
- scoped commands for relevant test directories

If `COVERAGE` is enabled, run the appropriate coverage command instead of or in addition to the base command.

## Phase R3 - Report Results

Report:
- command(s) run
- pass/fail status
- test file and test count summary where available
- failing files or suites
- coverage summary if collected

If `ANALYZE_FAILURES` is enabled and tests failed, continue into failure analysis.

---

# MODE 3: Analyze Mode

Use this mode when the user wants insight into test quality, gaps, and priorities rather than a simple run.

## Phase A1 - Inspect the Test Landscape

Use `bash` and `read` to inspect:
- source directories
- test directories
- existing test files
- test config
- manifest data if present

Look for:
- missing tests for important modules
- stale tests relative to changed source files
- low coverage areas if coverage data exists
- critical paths without meaningful verification

## Phase A2 - Analyze Gaps and Priorities

Categorize findings such as:
- **Missing tests** - source files with no meaningful test coverage
- **Partial coverage** - low-coverage or shallowly tested modules
- **Stale tests** - tests that may no longer match recent source changes
- **Weak assertions** - tests that exist but do not strongly verify behavior
- **Failure hotspots** - repeatedly failing areas from prior runs or manifest history

If useful, use `subagent` with `worker` to analyze uncovered files and suggest high-value tests.

## Phase A3 - Report Analysis

Report:
- highest-priority missing tests
- partial or weak coverage areas
- stale test risks
- recommended next tests to add
- whether generating missing tests would be a good next step

Do not generate tests in Analyze Mode unless the user asked for it.

---

# MODE 4: Discovery Mode

Use this mode when the project's testing setup is unclear, incomplete, or not yet standardized.

## Phase D1 - Detect Project Test Setup

Use `bash` to inspect:
- package or build manifests
- test frameworks and config files
- source directories
- existing test directories and naming patterns

Use `read` on relevant config files to understand how tests are expected to run.

Identify:
- language and framework
- test runner
- current test directory structure
- whether the repo already has a stable testing pattern
- whether browser testing is likely relevant

## Phase D2 - Decide What Is Missing

Determine whether the project needs:
- only a test run
- missing configuration
- missing test directories
- missing tests for uncovered modules
- manifest creation for future runs

Prefer using the project's existing conventions over introducing new ones.

## Phase D3 - Generate Missing Tests Only If Requested

If `GENERATE_MISSING` is enabled or the user explicitly asked for test generation:
- use `subagent` with `worker` to generate tests for the highest-value uncovered modules first
- prefer unit and integration coverage before broad E2E expansion
- keep generated tests aligned with existing framework and naming conventions

If generation is not requested, stop at reporting what is missing.

## Phase D4 - Save or Update Manifest

When useful, create or update `.pi/test-manifest.json` with concise structured information such as:
- project type and framework
- test runner and commands
- known test directories
- tracked test files
- high-level coverage summary
- missing/partial/stale test gaps
- last run results

Keep the manifest practical and easy to refresh. Do not let schema complexity dominate the workflow.

## Phase D5 - Run Tests If Appropriate

If the user wants execution after discovery, run the most appropriate test command and report results.

---

# Failure Analysis

Use this when tests fail and the user wants deeper insight.

## Phase F1 - Categorize Failures

Group failures into patterns such as:
- assertion mismatch
- import/module breakage
- async timing or timeout issues
- mock mismatch
- environment/setup failures
- browser or E2E instability
- likely intentional behavior changes requiring test updates

Use `bash` to capture relevant failing output and `read` to inspect affected test files when needed.

## Phase F2 - Analyze Root Cause

Use direct investigation first. If helpful, use `subagent` with `worker` to produce a structured failure summary.

Distinguish between:
- test bug
- implementation bug
- environment/setup problem
- outdated expectation after intended behavior change

## Phase F3 - Report Fix Direction

Provide:
- failure category
- likely cause
- recommended next fix
- priority

Do not silently repair implementation unless the user requested that explicitly.

---

# Browser Testing

Include browser testing only when:
- the project has user-facing web flows
- the plan requires browser-visible verification
- the user requested browser coverage
- `BROWSER_MODE` is `headless` or `headed`

When browser testing is used:
- prefer existing project browser test setup if one exists
- otherwise use a minimal, explicit Puppeteer-based approach if appropriate
- verify application readiness before testing instead of relying on fixed sleeps where possible
- clean up any temporary processes you start

If browser setup is heavy or project-specific, keep the test scope narrow and focused on the acceptance criteria.

---

# Post-Test Merge Decision

After testing succeeds for a branch-based or worktree-based workflow, ask the user what they want to do next.

Use `ask_user` with a focused `select` prompt. The default options should be:
- `Merge and clean up` (recommended when all tests pass)
- `Keep the worktree open for more changes`
- `Stop here without merging yet`

Decision rules:
- if tests or validation commands failed, do not offer merge as the recommended path
- if tests passed in a worktree or feature branch, recommend `Merge and clean up`
- if the user wants more changes, keep the worktree path and branch visible in the final report

**If the user selects merge:** Invoke the `pi-merge` skill. It handles the entire merge, push, worktree removal, and branch cleanup with one confirmation. Do not reimplement merge logic here.

# Unified Report

After testing work completes, output a concise unified report:

```text
✅ Testing Complete

Mode: <Plan-Driven | Run | Analyze | Discovery>
Plan: <path or "none">
Worktree: <path or "none">
Branch: <branch or "none">
Browser Mode: <none | headless | headed>

Results:
- Commands run: <summary>
- Test Files: <passed>/<total> passed
- Tests: <passed>/<total> passed
- Status: <PASSED | PARTIAL | FAILED>

Failures:
- <summary or "none">

Coverage:
- <summary or "not collected">

Gaps:
- <summary or "none">

Artifacts:
- Manifest: .pi/test-manifest.json <if created or updated>
- Tests added/updated: <omit if none>
  - <file>
  - <file>

Plan Verification:
- <summary or "not plan-driven">

Post-Test Decision:
- Selected: <merge into main | keep working | stop here>
- Recommendation: <brief reason>

Recommended Next Steps:
1. <highest priority next step>
2. <next step>
```

---

# Execution Notes

- Prefer the lightest mode that fits the request
- Prefer existing project conventions over introducing new test structure
- Prefer reporting over automatic implementation repair
- Do not weaken assertions to force passing tests
- Do not claim success without actual command output or verification evidence
- Use `worker` for delegated test-writing or analysis tasks
