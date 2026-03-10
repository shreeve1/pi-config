# Pi Coding Agent — Workspace

Pi is a minimal, extensible terminal-based coding harness for AI-assisted development. It is deliberately un-opinionated: no built-in sub-agents, plan mode, or permission popups. Functionality is built via TypeScript extensions, skills, and prompt templates.

Source: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent

---

## Directory Structure

```
~/.pi/
├── agent/
│   ├── settings.json       # Global Pi configuration
│   ├── models.json         # Model/provider definitions
│   ├── auth.json           # API credentials (never commit)
│   ├── extensions/         # Custom TypeScript extensions (auto-loaded)
│   │   ├── plan-mode.ts    # Plan/execute workflow extension
│   │   ├── footer.ts       # UI footer extension
│   │   └── model-status.ts # Model status display extension
│   ├── themes/
│   │   └── neon80s.json    # Custom terminal theme
│   ├── prompts/
│   │   └── claude-commands -> ~/.claude/commands  # Symlink to Claude commands
│   └── sessions/           # Session history (branching/compaction state)
├── artifacts/
│   ├── docs/               # Project documentation
│   └── plans/              # Saved plan files (plan-mode.ts output)
└── CLAUDE.md               # This file
```

---

## Configuration

**`agent/settings.json`** — Global settings (project `.pi/settings.json` overrides):
- `defaultProvider` / `defaultModel` — currently `openrouter` / `qwen/qwen3-coder-next`
- `defaultThinkingLevel` — `off` | `low` | `medium` | `high` | `xhigh`
- `extensions` — array of paths to `.ts` extension files
- `skills` — paths scanned for `SKILL.md` files (includes `~/.claude/skills` and `~/.claude/commands`)
- `theme` — currently `neon80s`

**`agent/auth.json`** — Credentials for OpenAI, OpenRouter, Anthropic (OAuth). Never commit this file.

**`agent/models.json`** — Provider/model definitions. Qwen 3 Coder Next: 262K context, 32K max output.

---

## Extensions

Extensions are TypeScript modules with a default export `(pi: ExtensionAPI) => void`. They are auto-discovered from `~/.pi/agent/extensions/` and `.pi/extensions/`.

Key APIs:
- `pi.registerTool(definition)` — Register an LLM-callable tool
- `pi.on(eventName, handler)` — Subscribe to lifecycle events
- Commands: `pi.registerCommand()`, shortcuts, CLI flags
- UI: `ctx.ui.notify()`, `ctx.ui.select()`, `ctx.ui.confirm()`, `ctx.ui.setWidget()`
- Session: `pi.newSession()`, `pi.fork()`, `pi.navigateTree()`

Lifecycle events: `session_start`, `session_switch`, `before_agent_start`, `agent_start`, `agent_end`, `tool_call` (blockable), `tool_result` (modifiable), `input` (transformable).

**Tool requirements:**
- Parameters defined with TypeBox schemas
- Return `{ content, details }`
- Truncate output to ~50KB / 2000 lines
- Optionally implement `renderCall()` and `renderResult()` for custom TUI display

### plan-mode.ts

Adds a plan/execute workflow to Pi:
- `/planmode` — Toggle planning mode; agent writes `artifacts/plans/<slug>.md`
- `/execute` — Switch from planning to execution phase
- `/planstatus` — Show current task progress
- `/planlist` — List all saved plans
- `/plancomplete` — Mark current plan complete

Auto-detects complex tasks by keyword matching and prompt length (>250 chars).

Plan files use `[N.M]` task numbering; the extension tracks completion via `update_progress(taskIndex)`.

---

## Skills

Skills are `SKILL.md` files with frontmatter + instructions. Pi scans configured skill paths at startup and uses progressive disclosure (description only in context; full instructions loaded on match).

Frontmatter fields:
- `name` — 1–64 chars, lowercase with hyphens
- `description` — max 1024 chars

Invoke via `/skill:name` or reference in prompts. Current skill sources:
- `~/.claude/skills/`
- `~/.claude/commands/` (symlinked as `agent/prompts/claude-commands`)

---

## Providers & Models

**Subscription (OAuth via `/login`):** Claude Pro/Max, ChatGPT Plus/Pro, GitHub Copilot, Google Gemini

**API key providers (configured in `auth.json` or env vars):** Anthropic, OpenAI, OpenRouter, Google Gemini, Groq, Mistral, Cerebras, xAI, Azure OpenAI, AWS Bedrock, and others.

Key resolution order: `--api-key` flag → `auth.json` → environment variable → custom provider config.

---

## Key Commands (Interactive Mode)

| Command | Description |
|---|---|
| `/model` | Switch provider/model |
| `/settings` | Open settings |
| `/tree` | Navigate session tree |
| `/compact` | Compact context |
| `/skill:name` | Invoke a skill |
| `/login` | OAuth authentication |
| `/planmode` | Toggle plan mode (custom extension) |
| `/planstatus` | Show plan progress (custom extension) |

**Double Escape** — configured action (tree, fork, or none) via `doubleEscapeAction` setting.

---

## Active Projects

### Plan-Mode Extension (`agent/extensions/plan-mode.ts`)
Structured plan/execute workflow. See `artifacts/plans/` for saved plans.

### Pi Subagent Extension (planned)
Bridge Claude Code agents (`~/.claude/agents/`) into Pi's subagent system. See `artifacts/plans/pi-subagent-brainstorm-extension.md`.

---

## Reference

- Docs: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent/docs
- Extensions API: `docs/extensions.md`
- Settings reference: `docs/settings.md`
- Skills: `docs/skills.md`
- Providers: `docs/providers.md`
- Sessions/branching: `docs/session.md`, `docs/tree.md`
- Themes: `docs/themes.md`
