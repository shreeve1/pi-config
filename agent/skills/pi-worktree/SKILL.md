---
name: pi-worktree
description: Create, manage, and clean up git worktrees for isolated feature work. Use when starting implementation that needs branch isolation, before executing plans, or when the user asks to set up a worktree. Handles first-time setup automatically including directory creation and .gitignore configuration.
---

# Git Worktree Management

Create isolated git worktrees for feature work with zero manual setup required. Handles first-time projects, .gitignore safety, branch conflicts, and bootstrap automatically.

**Announce at start:** "Setting up an isolated worktree for this work."

---

## Step 1 — Gather Repository State

Run this diagnostic block first. Do not skip any check.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  echo "NOT_A_GIT_REPO=true"
else
  CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
  GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
  GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
  IS_LINKED_WORKTREE="no"
  [ "$GIT_DIR" != "$GIT_COMMON" ] && IS_LINKED_WORKTREE="yes"
  HAS_DOT_WORKTREES=$([ -d "$REPO_ROOT/.worktrees" ] && echo "yes" || echo "no")
  HAS_WORKTREES=$([ -d "$REPO_ROOT/worktrees" ] && echo "yes" || echo "no")

  echo "REPO_ROOT=$REPO_ROOT"
  echo "CURRENT_BRANCH=$CURRENT_BRANCH"
  echo "IS_LINKED_WORKTREE=$IS_LINKED_WORKTREE"
  echo "HAS_DOT_WORKTREES=$HAS_DOT_WORKTREES"
  echo "HAS_WORKTREES=$HAS_WORKTREES"
  echo "--- existing worktrees ---"
  git worktree list 2>/dev/null
  echo "--- existing branches ---"
  git branch --list 2>/dev/null
fi
```

**If not a git repo:** Stop. Report that worktrees require git. Offer to run in-place instead.

**If already inside a linked worktree:** Report the current worktree path and branch. Ask whether to continue here or create a new one.

---

## Step 2 — Choose Worktree Directory

Follow this priority order — do not skip steps:

1. `.worktrees/` exists at repo root → use it
2. `worktrees/` exists at repo root → use it
3. Both exist → use `.worktrees/`
4. Check project `AGENTS.md` for a documented worktree preference → use it
5. **None found → ask the user:**

```
ask_user(select): "No worktree directory found. Where should I create worktrees?"
Options:
  - ".worktrees/ (project-local, hidden)"
  - "~/.pi/worktrees/<project-name>/ (global, outside repo)"
```

Record the chosen directory as `WORKTREE_DIR` for all subsequent steps.

For global paths, derive the project name:
```bash
PROJECT_NAME=$(basename "$REPO_ROOT")
WORKTREE_DIR="$HOME/.pi/worktrees/$PROJECT_NAME"
```

---

## Step 3 — Ensure .gitignore Safety (project-local directories only)

**Skip this step entirely for global `~/.pi/worktrees/` paths.**

This is the most common failure point for first-time setup. Handle it fully and automatically.

```bash
cd "$REPO_ROOT"
DIRNAME=".worktrees"  # or "worktrees" — whichever was chosen

# Test if git ignores this directory
if git check-ignore -q "$DIRNAME" 2>/dev/null; then
  echo "IGNORED=yes"
else
  echo "IGNORED=no"
fi
```

**If not ignored, fix it immediately — do not ask, do not wait:**

```bash
# Create .gitignore at repo root if it doesn't exist
[ -f .gitignore ] || touch .gitignore

# Add the directory if not already listed
grep -qxF "$DIRNAME" .gitignore 2>/dev/null || echo "$DIRNAME" >> .gitignore

echo "Added '$DIRNAME' to .gitignore"
```

Tell the user: "Added `<dirname>` to `.gitignore` to prevent worktree contents from being tracked."

**Verify the fix worked:**
```bash
git check-ignore -q "$DIRNAME" && echo "VERIFIED" || echo "STILL_NOT_IGNORED"
```

If still not ignored (e.g., a negation pattern in .gitignore overrides it), report the issue and ask the user before proceeding.

---

## Step 4 — Determine Branch Name

If the caller provided a branch name, use it exactly.

Otherwise, derive one:
- Use the plan filename, feature name, or task description
- Format as kebab-case
- Add an intent prefix when obvious: `feat/`, `fix/`, `refactor/`, `chore/`
- Strip characters that cause shell quoting problems

**Check for conflicts:**

```bash
BRANCH="feat/my-feature"

# Does the branch already exist?
BRANCH_EXISTS=$(git branch --list "$BRANCH" | grep -q . && echo "yes" || echo "no")

# Is it already checked out in a worktree?
WORKTREE_HAS_BRANCH=$(git worktree list --porcelain | grep -q "branch refs/heads/$BRANCH" && echo "yes" || echo "no")

echo "BRANCH_EXISTS=$BRANCH_EXISTS"
echo "WORKTREE_HAS_BRANCH=$WORKTREE_HAS_BRANCH"
```

| Branch exists? | In a worktree? | Action |
|---|---|---|
| No | — | `git worktree add <path> -b <branch>` |
| Yes | No | `git worktree add <path> <branch>` (no `-b`) |
| Yes | Yes | Ask: reuse that worktree, or create `<branch>-2`? |

---

## Step 5 — Create the Worktree

```bash
# Ensure parent directory exists (critical for first-time setup)
mkdir -p "$WORKTREE_DIR"

# Sanitize branch name for use as directory name
# "feat/my-feature" becomes "feat-my-feature" to avoid nested dirs
BRANCH_DIR=$(echo "$BRANCH" | tr '/' '-')
WORKTREE_PATH="$WORKTREE_DIR/$BRANCH_DIR"

# Create (pick the right variant from Step 4)
git worktree add "$WORKTREE_PATH" -b "$BRANCH"   # new branch
# OR
git worktree add "$WORKTREE_PATH" "$BRANCH"       # existing branch
```

### Error recovery

If `git worktree add` fails, diagnose and fix automatically:

| Error message | Cause | Fix |
|---|---|---|
| `'<branch>' is already checked out at` | Branch active in another worktree | Ask user: reuse or suffix |
| `'<path>' already exists` | Stale path from removed worktree | Run `git worktree prune`, then retry |
| `invalid reference` | Bad branch name chars | Sanitize and retry |
| `not a valid branch name` | Git naming rules violated | Remove offending chars, retry |

```bash
# Auto-prune stale worktrees before retrying
git worktree prune
```

---

## Step 6 — Bootstrap the Worktree

```bash
cd "$WORKTREE_PATH"

# Auto-detect and install dependencies
[ -f package-lock.json ] && npm ci
[ -f package.json ] && [ ! -f package-lock.json ] && npm install
[ -f yarn.lock ] && yarn install --frozen-lockfile
[ -f pnpm-lock.yaml ] && pnpm install --frozen-lockfile
[ -f Cargo.toml ] && cargo build
[ -f requirements.txt ] && pip install -r requirements.txt
[ -f pyproject.toml ] && (poetry install 2>/dev/null || pip install -e . 2>/dev/null)
[ -f go.mod ] && go mod download
[ -f Gemfile ] && bundle install
```

If the caller provided baseline/validation commands, run them. If any fail, report the failure and ask whether to proceed or investigate.

---

## Step 7 — Report

```text
Worktree ready:
  Path:   <full worktree path>
  Branch: <branch name>
  Base:   <parent branch>
  Bootstrap: <passed | skipped | failed (details)>
```

Return the worktree path and branch name to the caller.

---

## Cleanup (when called for removal)

If the user asks to clean up or remove a worktree:

```bash
# Remove the worktree
git worktree remove <path> --force

# Optionally delete the branch
git branch -d <branch>  # safe delete (only if merged)
# OR
git branch -D <branch>  # force delete (if user confirms)

# Prune stale entries
git worktree prune
```

Always confirm before force-deleting branches.

---

## Quick Reference

| Situation | Action |
|---|---|
| Not a git repo | Skip worktrees, work in-place |
| Already in a linked worktree | Continue there (or ask) |
| `.worktrees/` exists | Use it |
| Neither dir exists | Ask user for preference |
| Dir not in .gitignore | Add it automatically, verify |
| .gitignore doesn't exist | Create it, add entry |
| Branch exists, no worktree | `git worktree add` without `-b` |
| Branch exists in worktree | Ask: reuse or suffix |
| `git worktree add` fails | Prune stale, retry; report if still failing |
| Bootstrap fails | Report, ask user |

## Integration

**Called by:**
- `pi-dev-build` (Phase 2) — primary consumer
- Any skill needing isolated workspace

**Pairs with:**
- `pi-commit` — for committing work in the worktree
- `pi-dev-test` — for running tests in the worktree
