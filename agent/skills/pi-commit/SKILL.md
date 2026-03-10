---
name: pi-commit
description: Git operations — commit, push, pull, merge, or status with safety checks
---

# Git Operations Skill

Use this skill for any git workflow: committing and pushing changes, pulling from remote, syncing (pull → commit → push), or reviewing repository status. Do not use for complex rebasing workflows or repository initialization.

---

## Usage Modes

Activate one of the following modes based on user intent:

- **sync** (default) — Pull from remote, then commit and push any local changes
- **push** — Stage, commit, and push local changes
- **pull** — Pull from remote and merge
- **status** — Show current git state without making changes

---

## Phase 1 — Safety Checks (All Modes)

Before any operation, use `Bash` to run:

1. `git status` — inspect working tree state
2. `git branch --show-current` — confirm current branch name
3. `git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null` — check remote tracking
4. `git rev-list --left-right --count HEAD...@{u} 2>/dev/null` — check ahead/behind counts

**Sensitive file check** — scan unstaged changes for:
- `.env`, `.env.*`, `credentials*`, `secret*`, `*.pem`, `*.key`
- If any found: warn the user explicitly and exclude them from staging

**Temp file check** — silently exclude from staging:
- `tmp*`, `*.tmp`, `*.swp`, `*.swo`, `*~`, `.DS_Store`

---

## Phase 2 — Execute Mode

### status
Show current state without changing anything:
- Branch name, remote tracking info, ahead/behind count
- Staged, unstaged, and untracked files
- Last 5 commit messages via `git log --oneline -5`

### pull
Pull from remote and merge:
- Run `git pull origin <current-branch>`
- If merge conflict occurs: list the conflicting files and use `ask_user` (type: select) to ask how to proceed (abort / resolve manually / show diff)

### push
Stage, commit, and push:
1. Run `git diff --stat` to review changes
2. Run `git log --oneline -5` to observe the existing commit message style
3. Stage files **individually** using `git add <file>` — never `git add .` or `git add -A`
4. Draft a concise commit message focused on *why*, not *what*
5. Commit using HEREDOC format, appending a co-author trailer:
   ```
   git commit -m "$(cat <<'EOF'
   <commit message>

   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```
6. Push with `git push origin <current-branch>`

### sync (default)
Execute **pull** first, then **push** if there are local changes after the pull.

---

## Rules

- NEVER commit `.env` files or anything containing secrets or credentials
- NEVER use `git add .` or `git add -A` — always stage specific files
- NEVER use `--force` push unless the user explicitly requests it
- NEVER amend previous commits — always create new commits
- NEVER skip pre-commit hooks (`--no-verify`)
- If the working tree is clean, report "Already in sync" and stop
- If a pull results in merge conflicts, stop and ask the user before proceeding

---

## Output Format

After completing the operation, output:

```
Git <action> complete (<branch> → origin/<branch>)

Commit: <short-hash>  (if applicable)
Files:  <N> changed, +<insertions> / -<deletions>

Skipped: <list of excluded files>  (if any)
```

---

## Report

Summarize what was done: which mode ran, the branch operated on, commit hash (if any), files changed, and any files skipped due to safety checks. If nothing was committed, state "Already in sync."
