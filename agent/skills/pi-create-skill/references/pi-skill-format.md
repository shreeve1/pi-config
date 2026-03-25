# Pi Skill Format Specification

This reference defines the complete pi skill system: locations, structure, frontmatter, and available tools.

## Skill Locations

- **Global** (all sessions): `~/.pi/agent/skills/` or `~/.agents/skills/`
- **Project** (one project): `.pi/skills/` or `.agents/skills/` in cwd and ancestor dirs
- Discovery: direct `.md` files in skills root, or recursive `SKILL.md` under subdirectories
- Skills register as `/skill:name` commands

## Skill Structure

A skill is a directory with a `SKILL.md` file. Everything else is freeform:

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Optional: helper scripts the skill invokes
│   └── process.sh
├── references/           # Optional: detailed docs loaded on-demand
│   └── api-reference.md
└── assets/               # Optional: templates, files used in output
    └── template.json
```

Use relative paths from the skill directory to reference bundled resources:
```markdown
See [the reference guide](references/REFERENCE.md) for details.
Run `./scripts/process.sh <input>` to process.
```

## Frontmatter

```yaml
---
name: skill-name          # Required. Lowercase a-z, 0-9, hyphens. Must match parent dir. Max 64 chars.
description: "..."        # Required. Max 1024 chars. What it does + when to use it.
---
```

Skills with missing description are **not loaded**. Unknown frontmatter fields are ignored.

## Available Tools in Every Pi Session

| Name | Purpose |
|---|---|
| `ask_user` | Ask the user a question (type: input/confirm/select/editor) |
| `Bash` | Run shell commands |
| `Read` | Read file contents (text or images) |
| `Edit` | Surgical file edits by replacing exact text |
| `Write` | Create or overwrite a file |
| `web_fetch` | Fetch a URL and return readable content |
| `web_search` | Search the web and return results |
| `search_knowledge` | Search the persistent knowledge base |
| `save_to_memory` | Save content to the persistent knowledge base |
| `subagent` | Spawn subagents (single, parallel, or chain modes) |
| `subagent_create` | Spawn a background subagent |
| `subagent_continue` | Continue an existing background subagent |
| `subagent_list` | List all active/finished background subagents |
| `subagent_remove` | Remove a subagent |
| `todo_write` | Create or update the session todo list |
| `todo_read` | Read the current session todo list |
| `read_plan` | Read plan.md for the current implementation plan |
| `update_progress` | Mark a plan task as completed |
| `get_progress` | Get current plan progress |
| `ts_diagnostics` | Get TypeScript diagnostics |
| `ts_hover` | Get type info at a position |
| `ts_definition` | Find symbol definition |
| `ts_references` | Find all references to a symbol |

## Subagent Tool

Modes:
- **single**: `{ "agent": "worker", "task": "..." }`
- **parallel**: `{ "tasks": [{ "agent": "worker", "task": "..." }, ...] }`
- **chain**: sequential array where each step can reference `{previous}` output

Agent scope: `"user"` (default, `~/.pi/agent/agents/`), `"project"` (`.pi/agents/`), or `"both"`.

## Tool Name Traps — Do NOT Use in Skills

| Wrong | Correct pi equivalent |
|---|---|
| `ask` | `ask_user` |
| `find` / `grep` | `Bash` (with shell `find`/`grep`/`rg`) |
| `fetch` | `web_fetch` |
| `lsp` / `notebook` / `puppeteer` | Not available — omit |
| `task` | `subagent` |
| `EnterPlanMode` | Not available — omit |
