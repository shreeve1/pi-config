# Pi Config

Personal [pi](https://github.com/nicholasgasior/pi-coding-agent) configuration — skills, extensions, agents, themes, and prompts.

## Prerequisites

- **Node.js** ≥ 20
- **pi** installed globally: `npm i -g @mariozechner/pi-coding-agent`
- **Python 3** (optional, for memory CLI scripts)
- API keys for your preferred providers (Anthropic, OpenAI, etc.)

## Installation

### Quick Setup via AI Agent

Already have pi running? Paste this prompt into your pi session and let the agent do the rest:

```
Clone https://github.com/shreeve1/pi-config.git into ~/.pi (back up existing first), run npm install in agent/, agent/extensions/typescript-lsp/, and agent/extensions/web-fetch/, then create agent/auth.json with my API keys — ask me for each key I want to add.
```

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

## How To Use — Skill Workflows

```
                         ┌─────────────────────────────────────────┐
                         │            Where do you start?          │
                         └──────┬──────────────┬──────────────┬────┘
                                │              │              │
                                ▼              ▼              ▼
                         ┌────────────┐ ┌────────────┐ ┌────────────┐
                         │  New idea  │ │  Bug / Fix │ │  Quick Q   │
                         └─────┬──────┘ └─────┬──────┘ └─────┬──────┘
                               │              │              │
                               ▼              ▼              ▼
                      ┌──────────────┐ ┌──────────────┐ ┌──────────┐
                      │ pi-brainstorm│ │dev-investigate│ │ question │
                      └──────┬───────┘ └──────┬───────┘ └────┬─────┘
                             │                │              │
                             ▼                ▼              ▼
                      ┌──────────────────────────────┐  Quick fix?
                      │         pi-dev-plan          │◄── Yes ──┘
                      └──────────┬───────────────────┘
                                 │                        No ──► Done
                                 ▼
                      ┌──────────────────────────────┐
                      │       pi-dev-validate        │
                      └──────────┬───────────────────┘
                                 │
                                 ▼
                      ┌──────────────────────────────┐
                      │        pi-dev-build          │
                      └──────────┬───────────────────┘
                                 │
                                 ▼
                      ┌──────────────────────────────┐
                      │        pi-dev-test           │
                      └──────────┬───────────────────┘
                                 │
                                 ▼
                              Done ──► pi-commit


  Design Workflow:

      design-workflow ──► ui-review ──► iterate ──► pi-dev-plan ──► build
```

### Development Workflow

The core development loop for features, refactors, and significant changes:

1. **`pi-brainstorm`** or **`dev-investigate`** — Start here. Brainstorm explores ideas and directions creatively. Investigate digs into bugs, unexpected behavior, or unclear root causes.
2. **`pi-dev-plan`** — Turn your findings into a structured implementation plan with tasks, dependencies, and acceptance criteria.
3. **`pi-dev-validate`** — Validate the plan against your codebase before writing code. Catches breaking changes, database risks, and dependency issues.
4. **`pi-dev-build`** — Execute the plan task-by-task with parallel subagents and progress tracking.
5. **`pi-dev-test`** — Run tests, expand coverage, and verify the implementation meets acceptance criteria.

### Quick Questions & Small Changes

Not everything needs the full workflow:

1. **`question`** — Ask about your codebase: where something lives, how a feature works, what the structure looks like. Read-only exploration.
2. If the answer reveals a small fix, make it directly. If it's bigger than expected, loop into the dev workflow at **`pi-dev-plan`**.

### Design Workflow

For UI work — exploring visual directions before committing to code:

1. **`design-workflow`** — Generate multiple UI design directions with mockups, theme variants, and a side-by-side gallery. Produces HTML/CSS concepts under `artifacts/design/`.
2. **`ui-review`** — Take screenshots of live pages or mockups and get visual feedback: layout issues, responsive problems, design critique. Saves a report to `artifacts/ui-review/`.
3. **Iterate** — Refine based on review feedback, then loop back to `ui-review` until satisfied.
4. **Build** — Once a direction is chosen, feed it into **`pi-dev-plan`** → **`pi-dev-build`** to implement.

### Other Useful Skills

| Skill | Use for |
|---|---|
| `pi-commit` | Git operations with safety checks |
| `pi-continue` | Resume work from a saved session |
| `pi-document` | Extract and save documentation from sessions |
| `pi-interview` | Deep-dive Q&A about your project plans and goals |
| `pi-mem` | Browse, search, and save persistent memory across sessions |
| `pi-prime` | Load context for a new session by analyzing codebase + recent history |
| `pi-restart` | Kill and restart all running servers |
| `dev-prd` | Turn an idea into a product requirements document |
| `pi-create-skill` | Create or modify skills |

## What's Included

| Directory | Contents |
|---|---|
| `agent/skills/` | 20+ skills — planning, building, testing, investigating, brainstorming, etc. |
| `agent/extensions/` | Extensions — ask-user, auto-compact, web-fetch, TypeScript LSP, subagents, etc. |
| `agent/agents/` | Subagent definitions — worker, planner, reviewer, coder, tester, scout |
| `agent/themes/` | Custom themes (neon80s) |
| `agent/prompts/` | Prompt templates for investigation/fix workflows |
| `agent/scripts/` | Utility scripts (HaloPSA, memory CLI) |
| `artifacts/` | Docs, plans, brainstorming notes |

## Settings

Default settings in `agent/settings.json`:
- **Provider:** Anthropic
- **Model:** claude-opus-4-6
- **Theme:** neon80s
- **Thinking:** low

Edit `~/.pi/agent/settings.json` to change defaults.

## Updating

```bash
cd ~/.pi && git pull
```

Re-run `npm install` in the dependency directories if `package.json` files changed.
