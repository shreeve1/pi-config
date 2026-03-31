# Pi Config

Personal [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) configuration — skills, extensions, agents, themes, and prompts.

## Why Use Pi?

<img width="1429" height="339" alt="image" src="https://github.com/user-attachments/assets/e61a430e-dd20-43fa-a306-5618f4cb28ce" />

<img width="1202" height="1263" alt="image" src="https://github.com/user-attachments/assets/b0b10dc9-90c2-4942-b9cb-2d3973bb0d5d" />



[Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) is a minimal terminal coding agent that adapts to your workflows instead of forcing you into its own. Unlike other AI coding tools, pi is designed to be extended — not forked.

- **Open source (MIT)** — Read, modify, and version control every part of the agent: the loop, the prompt, the tools. Pin what works. No surprise behavior changes from upstream updates.
- **~200 token system prompt** — Pi's core is radically minimal. Four tools (`read`, `write`, `edit`, `bash`). Everything else loads on demand, not upfront — so your context window is spent on work, not framework overhead.
- **Extensible, not opinionated** — Add capabilities through TypeScript extensions, skills, and themes. Build exactly the agent you need instead of working around decisions someone else made for you.
- **300+ models, any provider** — Anthropic, OpenAI, Google, Mistral, Groq, OpenRouter, Ollama, and more. Switch mid-conversation. Pick the best model for the task, not the one your tool vendor prefers.
- **Skills as workflows** — Skills are structured instructions that guide the agent through multi-step processes (brainstorming → planning → building → testing). They load only when triggered — no token cost when unused. This repo is a full skill library.

### How Pi Differs from Claude Code

Pi and Claude Code use the same models, but the community consistently highlights these real differences:

**Radical minimalism** — Pi's system prompt is ~200 tokens. Claude Code's is ~10,000+. Pi ships 4 tools (`read`, `write`, `edit`, `bash`). Claude Code ships 8+. Less baked-in means less token overhead on every single turn, and more of your context window available for actual work.

**You own the agent** — Pi is open source (MIT). Extensions, skills, themes, the agent loop itself — it's all TypeScript you can read, modify, and version control. Claude Code is closed source. When it changes behavior in an update, you adapt. With pi, you pin what works.

**Model freedom** — Pi works with any provider: Anthropic, OpenAI, Google, Mistral, Groq, OpenRouter, local models via Ollama — 300+ models out of the box. Claude Code prioritizes Anthropic models. Pi lets you pick the best model for the task and switch mid-conversation.

**Progressive disclosure over upfront loading** — Skills load their full content only when triggered. MCP servers and Claude Code's built-in tools dump thousands of tokens into context on every session whether you need them or not. Pi's approach: if you're not using it, it's not in context.

**Token efficiency in practice** — Users who switched [report their token limits lasting 5-10x longer](https://www.reddit.com/r/ClaudeCode/comments/1r11egp/why_i_switched_from_claude_code_to_pi_the_agent/) for the same volume of work. The combination of a minimal system prompt, on-demand skill loading, and scoped subagents with isolated context means dramatically less waste.

**No guardrails by default** — Claude Code has 5 confirmation modes and permission gates designed for broad accessibility. Pi trusts you're an engineer who knows what you're doing. You add exactly the safety controls you want via extensions — nothing more, nothing less.

**Full observability** — Every tool call, every reasoning step, every file the agent reads is visible. No abstraction layers hiding what's happening. When something goes wrong, you see exactly why.

## Installation

### Quick Setup via AI Agent

Install Pi: `npm install -g @mariozechner/pi-coding-agent`

Paste this prompt into your already working cli/agent tool session and let the agent do the rest:

```
Clone https://github.com/shreeve1/pi-config.git into ~/.pi (back up existing first), run npm install in agent/, agent/extensions/typescript-lsp/, and agent/extensions/web-fetch/.

Run /login once pi config is installed to setup providers
```

## Manual Install

### 1. Clone into `~/.pi`

```bash
# Back up existing config if needed
[ -d ~/.pi ] && mv ~/.pi ~/.pi.backup

git clone https://github.com/shreeve1/pi-config.git ~/.pi
```

### 2. Install dependencies

```bash
cd ~/.pi/agent && npm install
cd ~/.pi/agent/extensions/typescript-lsp && npm install
cd ~/.pi/agent/extensions/web-fetch && npm install
```

### 3. Create auth.json

Create `~/.pi/agent/auth.json` with your API keys:

```json
{
  "anthropic": {
    "type": "api_key",
    "key": "sk-ant-..."
  },
  "openai": {
    "type": "api_key",
    "key": "sk-proj-..."
  },
  "openrouter": {
    "type": "api_key",
    "key": "sk-or-..."
  }
}
```

Only add the providers you use. Anthropic is the default.

### 4. Create models.json (optional)

If you use custom providers (Ollama, etc.), create `~/.pi/agent/models.json`:

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "streaming": false,
      "models": [
        { "id": "your-model-id", "name": "Display Name" }
      ]
    }
  }
}
```

## How To Use — Agent Teams (Primary Workflow)

The primary workflow in this config is now **team-based orchestration**, not the old `/dev-*` linear flow.

```text
Idea / Request
   │
   ▼
/skill:create-team
   │   (interview + tensions + roles)
   ▼
artifacts/specs/team-prd-<team>-<date>.md
   │
   ▼
/skill:build-team <prd-path>
   │   (CEO first, then one specialist per run)
   ▼
agents/<team>/*.md + agents/teams/<team>/
   │
   ▼
Enable team dispatcher mode
   │
   ▼
/agents-team  → pick team → dispatch_agent runs specialists
```

### 1) Create a Team PRD (`create-team`)

Run:

```bash
/skill:create-team
```

`create-team` interviews you and produces a buildable Team PRD that includes:
- domain overview and stakes
- explicit tensions (Red/Blue poles)
- CEO (White) + specialist roster
- per-member models, tools, and write boundaries
- shared context + differentiated persona specs

Output file:

```text
artifacts/specs/team-prd-<team-name>-<date>.md
```

### 2) Build the Team from the PRD (`build-team`)

Run:

```bash
/skill:build-team artifacts/specs/team-prd-<team-name>-<date>.md
```

Behavior:
- first run scaffolds `agents/teams/<team-slug>/` and builds the CEO first
- each run builds exactly one pending member
- updates `agents/teams/<team-slug>/team.yaml`
- can be resumed safely across sessions

Generated structure (typical):

```text
agent/agents/<team-slug>/<agent-id>.md
agent/agents/teams/<team-slug>/team.yaml
agent/agents/teams/<team-slug>/dispatcher.md
agent/agents/teams/<team-slug>/brief.md
agent/agents/teams/<team-slug>/context.md
agent/agents/teams/<team-slug>/expertise/*.md
agent/agents/teams/<team-slug>/agent-skills/mental-model.md
agent/agents/teams/<team-slug>/session-notes/
```

### 3) Run Teams in Dispatcher Mode

Enable team mode by loading `extensions/agent-team.ts` (either in settings or with `-e` on launch), then use:

- `/agents-team` — switch active team
- `/agents-list` — list loaded agents in current team
- `/agents-view <compact|cards|toggle>` — change dashboard view
- `/agents-grid <1-6|auto>` — control grid layout
- `/agents-comms` — inspect team channel + active requests

In team mode, the primary agent is a **dispatcher** and delegates all specialist work via `dispatch_agent`.

### Built-In Teams in This Repo

| Team | Purpose | Members |
|---|---|---|
| `full` | End-to-end software delivery | scout, web-searcher, planner, builder, reviewer, tester, documenter, red-team, investigator |
| `frontend` | UI design + implementation loop | planner, mockup-designer, builder, ui-reviewer, bowser |
| `info` | Research and documentation | scout, web-searcher, reviewer, documenter |
| `qa` | Validation and risk review | tester, reviewer, red-team, investigator, ui-reviewer |
| `infra-ops` | MSP infrastructure operations | infra-scout, infra-responder, infra-analyst, infra-operator, infra-hardener, infra-documenter |
| `pi-pi` | Pi framework experts + meta-improvement | ext-expert, theme-expert, tui-expert, skill-expert, config-expert, prompt-expert, agent-expert, agent-auditor, prompt-engineer, config-tuner |

### Team-First Routing (Replacing `/dev-*` as Default)

Use these dispatcher patterns instead of the old `/dev-*` linear flow:

- **Feature/refactor implementation:** `full` team implementation pipeline
  - `planner → reviewer → builder → reviewer → tester` (optional `red-team`)
- **Bug/root-cause work:** `full` debug pipeline
  - `investigator → planner → builder → reviewer → tester`
- **Infrastructure incidents/maintenance:** `infra-ops` pipelines from team dispatcher
- **Pi agent system tuning:** `pi-pi` audit-first pipeline
  - `agent-auditor → prompt-engineer and/or config-tuner`

The `/dev-*` skills can still exist for compatibility, but this config is now documented and operated as **team-first**.

### Quick Start (Team-First)

```bash
# 1) Design team
/skill:create-team

# 2) Build team from PRD
/skill:build-team artifacts/specs/team-prd-<team-name>-<date>.md

# 3) Start team mode and select team
/agents-team
```

## Memory Management — `pi-mem`

Pi-mem gives your agent persistent memory across sessions — project-scoped and global. Use it to save work, resume later, and build up cross-project learnings.

```
                    ┌──────────────────────────────────┐
                    │      During a session...         │
                    └──────┬──────────────┬────────────┘
                           │              │
                    Need to pause?   Learned something
                    Mid-task?        cross-project?
                           │              │
                           ▼              ▼
                    ┌─────────────┐ ┌─────────────┐
                    │ /mem        │ │ /mem global  │
                    │ checkpoint  │ │ <learning>   │
                    └──────┬──────┘ └──────┬──────┘
                           │               │
                           ▼               ▼
                    Saves resume      Saves to global
                    context + links   memory with
                    to plan file      category & tags
                           │
                           │
                    ┌──────┴──────────────────────────┐
                    │      Later / New session...      │
                    └──────┬──────────────┬────────────┘
                           │              │
                           ▼              ▼
                    ┌─────────────┐ ┌─────────────┐
                    │ /mem plan   │ │ /mem search  │
                    │ <plan.md>   │ │ "<query>"    │
                    └──────┬──────┘ └──────┬──────┘
                           │               │
                           ▼               ▼
                    Resume exactly    Find past sessions
                    where you         and learnings
                    left off          across projects
                           │
                           ▼
                    ┌──────────────────────────────────┐
                    │     Periodically: /mem cleanup    │
                    │     Consolidate or prune old      │
                    │     entries (always confirms)     │
                    └──────────────────────────────────┘
```

### Commands

| Command | What it does |
|---|---|
| `/mem` | Browse recent project sessions and global learnings |
| `/mem search "query"` | Full-text search across all memory |
| `/mem save` | Save current session to project memory |
| `/mem save <description>` | Save with a specific description |
| `/mem checkpoint` | Save mid-session snapshot with resume context, linked to a plan |
| `/mem global <learning>` | Save a cross-project learning (prompts for category & tags) |
| `/mem plan path/to/plan.md` | Resume work from a plan file's checkpoint history |
| `/mem cleanup` | Consolidate or prune old entries (default: 7 days) |
| `/mem cleanup N` | Cleanup entries older than N days |

### When to Use What

- **`/mem save`** — End of a session. Captures what you did so you can find it later.
- **`/mem checkpoint`** — Mid-task, need to stop. Saves structured resume context (goal, done, in-progress, next steps, blockers) and links to your plan file so you can pick up exactly where you left off.
- **`/mem global`** — You discovered a pattern, preference, or lesson that applies beyond the current project. Saved with category and tags for cross-project search.
- **`/mem plan`** — Starting a new session on an existing plan. Loads the plan file and any linked checkpoints so the agent has full context.
- **`/mem search`** — "Did I solve this before?" Search across all saved sessions and learnings.
- **`/mem cleanup`** — Memory getting cluttered. Review old entries, consolidate related ones, or delete with confirmation.

### Storage

- **Project memory**: `~/.pi/data/memory/projects/{hash}-{name}/memory.db` — one SQLite DB per project
- **Global memory**: `~/.pi/data/memory/global/memory.db` — shared across all projects

## What's Included

| Directory | Contents |
|---|---|
| `agent/skills/` | 20+ skills — planning, building, testing, investigating, brainstorming, etc. |
| `agent/extensions/` | Extensions — ask-user, auto-compact, web-fetch, TypeScript LSP, subagents, etc. |
| `agent/agents/` | Subagent definitions — worker, planner, reviewer, tester, scout |
| `agent/themes/` | Custom themes (neon80s) |
| `agent/prompts/` | Prompt templates for investigation/fix workflows |
| `agent/scripts/` | Utility scripts (HaloPSA, memory CLI) |
| `artifacts/` | Docs, plans, brainstorming notes |

## Settings

Default settings in `agent/settings.json`:
- **Provider:** openai-codex
- **Model:** gpt-5.3-codex
- **Theme:** ember
- **Thinking:** high

Edit `~/.pi/agent/settings.json` to change defaults.

## Updating

```bash
cd ~/.pi && git pull
```

Re-run `npm install` in the dependency directories if `package.json` files changed.
