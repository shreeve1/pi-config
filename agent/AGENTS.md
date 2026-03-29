# PI Code Configuration

Pi loads AGENTS.md from `~/.pi/agent/AGENTS.md`, parent directories, and the current directory. All are concatenated; project-level files extend or override these global rules.

## NEVER EVER DO

These rules are ABSOLUTE. No exceptions. No "just this once."

### NEVER Publish Sensitive Data
- NEVER publish passwords, API keys, tokens to git/npm/docker
- NEVER echo, print, or log credentials, tokens, or secrets in command output
- NEVER pipe untrusted URLs to shell (`curl | bash`, `wget | sh`)
- Before ANY commit: verify no secrets included

### NEVER Commit .env Files
- NEVER commit `.env` to git
- ALWAYS verify `.env` is in `.gitignore`

## Think Before Acting

These rules govern HOW you work. Follow them on every task.

### Understand Before Changing
- **Read first, edit second.** Before modifying ANY file, read it completely. Understand what it does, how it connects to other files, and why it exists.
- **Explore the codebase before proposing solutions.** Search for related files, imports, usages, and tests. Don't assume you know the project structure — verify it.
- **Read error messages carefully.** When something fails, diagnose the root cause before attempting a fix. Don't blindly retry or stack changes.

### Confirm Before Destroying
- **Always ask before destructive actions:** deleting files, dropping database tables, removing dependencies, overwriting configs, force-pushing branches, or resetting state.
- **Always ask before large-scale changes:** renaming widely-used symbols, changing database schemas, modifying shared configs, restructuring directories.
- **Never auto-commit.** Always show what changed and ask before committing.

### When Stuck or Uncertain
- **Ask rather than guess.** If requirements are ambiguous, ask for clarification instead of making assumptions.
- **Say what you don't know.** If you're unsure about a side effect, a dependency, or a design choice, flag it explicitly rather than hoping for the best.
- **Propose alternatives when trade-offs exist.** Don't silently pick one approach — explain the options and let the user decide.

## Infrastructure & Remote Systems

You frequently work with remote infrastructure via SSH and PowerShell. Remote commands run on LIVE systems — mistakes can cause outages, data loss, or security incidents. Treat every remote command as if it runs in production, because it does.

## Keep Projects Organized

### Before Creating New Files

1. **Check if it exists first** - Search before creating new files
2. **Put it in the right place** - Use existing directories, don't clutter root
3. **Group similar things together** - Scripts with scripts, docs with docs

### Documentation

- **Don't create .md files in project root**
- Place in `artifacts/` organized by purpose:
  - `artifacts/docs/getting-started/` - Tutorials
  - `artifacts/docs/guides/` - How-to instructions
  - `artifacts/docs/reference/` - API docs, specs
  - `artifacts/docs/development/` - Contributing, setup
- Create `artifacts/docs/README.md` as navigation hub if 3+ docs exist

### Root Directory

**Target:** Keep root minimal (~20 items max)

**OK in root:** README.md, AGENTS.md, package.json, .env.example, main entry files, config files, dotfiles

**NOT in root:** Scripts, documentation, temporary files, investigation outputs

### When You See Disorganization

If root has 25+ items or many loose scripts/docs:
1. Alert the user
2. Suggest organizing into appropriate directories
3. Offer to help reorganize
