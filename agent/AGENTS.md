# PI Code Configuration

This file provides instructions for pi, an AI coding assistant that runs in the terminal. Pi uses this file to understand project conventions, preferences, and rules. Unlike instructions meant for human developers, this file shapes how the AI agent behaves when working on code.

Pi loads AGENTS.md files from:
- `~/.pi/agent/AGENTS.md` (this global file)
- Parent directories (walking up from current working directory)
- Current directory

All matching files are concatenated, so project-level AGENTS.md files can extend or override these global rules.

## NEVER EVER DO

These rules are ABSOLUTE:

### NEVER Publish Sensitive Data
- NEVER publish passwords, API keys, tokens to git/npm/docker
- Before ANY commit: verify no secrets included

### NEVER Commit .env Files
- NEVER commit `.env` to git
- ALWAYS verify `.env` is in `.gitignore`

## User Preferences

- Always ask questions if intent is not clear

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
- Create `docs/README.md` as navigation hub if 3+ docs exist

### Plans

- Plans are created in the `artifacts/plans/` of the CWD

### Scripts

- **Don't create scripts in project root**
- Place in `scripts/` organized by function:
  - `scripts/api/` - API clients
  - `scripts/[domain]/` - Group by what it DOES, not language
- Create `scripts/README.md` as script catalog if 3+ scripts exist
- Mixed .py/.js in same directory is OK if same domain

### Root Directory

**Target:** Keep root minimal (~20 items max)

**OK in root:** README.md, AGENTS.md, package.json, .env.example, main entry files, config files, dotfiles

**NOT in root:** Scripts, documentation, temporary files, investigation outputs

### When You See Disorganization

If root has 25+ items or many loose scripts/docs:
1. Alert the user
2. Suggest organizing into appropriate directories
3. Offer to help reorganize
