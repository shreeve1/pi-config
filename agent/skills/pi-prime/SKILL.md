---
name: pi-prime
description: Load context for a new agent session by analyzing codebase structure, documentation, and recent session history
---

# Pi Prime

Use this skill at the start of a new session to rapidly load project context. It delegates codebase exploration to a subagent, checks prior session history, and scans available resources. Do not use this skill mid-session or when context is already loaded.

---

## Phase 1 — Delegate Exploration

Use `subagent` in single mode to spawn a subagent for a full codebase scan. Instruct it to report back with:

- `project_overview`
- `tech_stack`
- `structure`
- Key config file directives (e.g. `CLAUDE.md`, `pi.md`, `.pi/`)
- `documentation_status`
- `patterns_detected`

Then run `git ls-files` with `Bash` as backup/verification of project files.

## Phase 2 — Resume Context

Check if the project has an `artifacts/sessions/` directory using `Bash`.

If it exists:
1. List `artifacts/sessions/*_todos.md` sorted by modification time (newest first)
2. Read the most recent `_todos.md` file with `Read` to understand what was worked on last and any outstanding tasks
3. If no `_todos.md` files exist, check for the most recent `.jsonl` transcript file — note its existence but do NOT read it (too large)

If pending or in-progress tasks exist from the last session, include them in the Report.

## Phase 3 — Scan Available Resources

Discover what's available without loading everything:

1. Use `Bash` to list contents of `artifacts/docs/`, `artifacts/web-search/`, and `scripts/` (if they exist)
2. Use `Read` on index files only: `artifacts/docs/README.md` and `scripts/README.md` (if they exist)
3. Read up to 3–4 files whose names clearly describe architecture or purpose (e.g. `artifacts/docs/architecture.md`)
4. List `artifacts/web-search/*.md` filenames — note available research topics from filenames only, do NOT read full files

Do NOT read every file. The goal is awareness of what's available, not full ingestion.

## Report

Synthesize the subagent's findings with session history into a concise summary:

```markdown
## Project Overview
<name, type, architecture from subagent>

## Tech Stack
<languages, frameworks, build tools>

## Key Directories
<entry points and key directories>

## Config Directives
<key rules from CLAUDE.md, pi.md, or .pi/ if present>

## Session Context
<prior session status if artifacts/sessions exists; pending/in-progress tasks>

## Available Resources
<docs/ and scripts/ overview>

## Cached Research
<list of available web-search research topics from artifacts/web-search/, if any>
```
