---
name: pi-merge
description: Merge a feature branch into the primary branch and clean up the worktree. Use after tests pass in a worktree or feature branch, or when the user asks to merge and clean up completed work.
---

# Merge and Clean Up

Merge a completed feature branch into the primary branch, then clean up the worktree and branch. Designed to handle the entire post-test flow with a single user confirmation.

**Announce at start:** "Merging and cleaning up the feature branch."

---

## Step 1 — Gather State

```bash
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
GIT_DIR=$(git rev-parse --git-dir 2>/dev/null)
GIT_COMMON=$(git rev-parse --git-common-dir 2>/dev/null)
IS_LINKED_WORKTREE="no"
[ "$GIT_DIR" != "$GIT_COMMON" ] && IS_LINKED_WORKTREE="yes"

# Detect primary branch
PRIMARY=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@')
[ -z "$PRIMARY" ] && PRIMARY=$(git branch --list main master | head -1 | tr -d ' *')
[ -z "$PRIMARY" ] && PRIMARY="main"

echo "REPO_ROOT=$REPO_ROOT"
echo "CURRENT_BRANCH=$CURRENT_BRANCH"
echo "IS_LINKED_WORKTREE=$IS_LINKED_WORKTREE"
echo "PRIMARY_BRANCH=$PRIMARY"
echo "--- worktree list ---"
git worktree list 2>/dev/null
echo "--- uncommitted changes ---"
git status --porcelain 2>/dev/null
```

**If not in a git repo:** Stop. Nothing to merge.

**If on the primary branch already:** Stop. Report "Already on `<primary>`, nothing to merge."

---

## Step 2 — Pre-Merge Checks

Before merging, verify everything is clean. Run all checks and report results together.

### 2a — Uncommitted changes

```bash
git status --porcelain
```

If there are uncommitted changes, **commit them automatically** using the `pi-commit` skill (push mode). The feature work should not be lost. Tell the user what was committed.

### 2b — Check merge feasibility

```bash
# Preview the merge — will it conflict?
git fetch origin "$PRIMARY" 2>/dev/null
git merge-tree $(git merge-base HEAD "origin/$PRIMARY") HEAD "origin/$PRIMARY" 2>/dev/null | head -50
# Simpler conflict check
git merge --no-commit --no-ff "origin/$PRIMARY" 2>&1; git merge --abort 2>/dev/null
```

If conflicts are detected:
- Report which files conflict
- Ask the user: `Resolve conflicts manually` | `Abort merge`
- Do NOT proceed automatically past conflicts

### 2c — Summarize what will be merged

```bash
# Show commits that will be merged
git log --oneline "$PRIMARY".."$CURRENT_BRANCH" 2>/dev/null

# Show files changed
git diff --stat "$PRIMARY".."$CURRENT_BRANCH" 2>/dev/null
```

Present a brief summary:
```
Ready to merge into <primary>:
  Branch: <current branch>
  Commits: <N>
  Files changed: <N>
  Insertions: +<N>  Deletions: -<N>
```

---

## Step 3 — Confirm and Merge

**This is the single confirmation point.** Ask once, then handle everything.

```
ask_user(select): "Merge <branch> into <primary> and clean up?"
Options:
  - "Yes — merge, delete branch, remove worktree"
  - "Merge only — keep branch and worktree"
  - "Cancel"
```

If cancelled, stop and report "Merge cancelled. Branch and worktree remain active."

### Perform the merge

If currently inside a worktree, switch to the primary checkout first:

```bash
# Find the primary worktree path (the original clone)
PRIMARY_WORKTREE=$(git worktree list --porcelain | grep -B2 "branch refs/heads/$PRIMARY" | head -1 | sed 's/worktree //')

# If primary worktree not found, use the common git dir to find it
if [ -z "$PRIMARY_WORKTREE" ]; then
  PRIMARY_WORKTREE=$(git rev-parse --git-common-dir | sed 's/\/.git$//')
fi
```

Then merge:

```bash
cd "$PRIMARY_WORKTREE"
git checkout "$PRIMARY"
git pull origin "$PRIMARY"
git merge "$FEATURE_BRANCH" --no-ff -m "Merge $FEATURE_BRANCH into $PRIMARY"
```

Use `--no-ff` to preserve branch history in the merge commit.

If the merge fails at this point (unexpected conflict), abort and report:
```bash
git merge --abort
```

---

## Step 4 — Push

```bash
git push origin "$PRIMARY"
```

If push fails (e.g., remote has diverged), report the error. Do not force-push.

---

## Step 5 — Clean Up (if user selected full cleanup)

Perform all cleanup steps automatically. Do not ask for each one individually.

### 5a — Remove the worktree

```bash
WORKTREE_PATH="<path from Step 1>"

# Only if we were in a worktree
if [ "$IS_LINKED_WORKTREE" = "yes" ]; then
  git worktree remove "$WORKTREE_PATH" --force
  git worktree prune
fi
```

### 5b — Delete the local branch

```bash
git branch -d "$FEATURE_BRANCH"
```

Use `-d` (safe delete, requires merge). If it fails because git doesn't recognize the merge (can happen with some merge strategies), use `-D` and note it in the report.

### 5c — Delete the remote branch (if it exists)

```bash
# Check if remote branch exists
if git ls-remote --heads origin "$FEATURE_BRANCH" | grep -q .; then
  git push origin --delete "$FEATURE_BRANCH"
fi
```

### 5d — Clean up empty worktree parent directory

```bash
# If the worktree dir's parent (.worktrees/) is now empty, leave it — it's still useful for next time
# But prune any stale worktree entries
git worktree prune
```

---

## Step 6 — Report

```text
## Merge Complete

Branch: <feature branch> → <primary branch>
Commits merged: <N>
Files changed: <N>

Cleanup:
  ✅ Worktree removed: <path>
  ✅ Local branch deleted: <feature branch>
  ✅ Remote branch deleted: <feature branch>  (or "no remote branch")
  ✅ Pushed to origin/<primary>

Current state:
  Branch: <primary>
  Working directory: <path>
  Status: clean
```

If merge-only (no cleanup):
```text
## Merge Complete

Branch: <feature branch> → <primary branch>
Commits merged: <N>
Files changed: <N>

Note: Branch and worktree kept active at <path>
```

---

## Error Recovery

| Situation | Action |
|---|---|
| Uncommitted changes | Auto-commit via pi-commit before merge |
| Merge conflicts | Report conflicting files, ask user |
| Push rejected | Report error, do not force-push |
| Worktree remove fails | Run `git worktree prune`, retry once |
| Branch delete fails with `-d` | Use `-D`, note in report |
| Not in a feature branch | Stop, report "nothing to merge" |
| Remote branch doesn't exist | Skip remote delete silently |

## Integration

**Called by:**
- `pi-dev-test` — after tests pass, when user selects merge
- `pi-dev-build` — after build succeeds, when user selects merge

**Invokes:**
- `pi-commit` — to commit any uncommitted work before merge
