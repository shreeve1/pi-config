# Pi Config

Personal [pi](https://github.com/nicholasgasior/pi-coding-agent) configuration — skills, extensions, agents, themes, and prompts.

## Prerequisites

- **Node.js** ≥ 20
- **pi** installed globally: `npm i -g @mariozechner/pi-coding-agent`
- **Python 3** (optional, for memory CLI scripts)
- API keys for your preferred providers (Anthropic, OpenAI, etc.)

## Installation

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

### 5. Install superpowers (optional)

The `superpowers/` skill pack is a separate repo and not included in this clone:

```bash
# If you have access to the superpowers repo:
git clone <superpowers-repo-url> ~/.pi/superpowers
```

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

## Quick Setup via AI Agent

Already have pi running? Paste this prompt into your pi session and let the agent do the rest:

```
Clone https://github.com/shreeve1/pi-config.git into ~/.pi (back up existing first), run npm install in agent/, agent/extensions/typescript-lsp/, and agent/extensions/web-fetch/, then create agent/auth.json with my API keys — ask me for each key I want to add.
```

## Updating

```bash
cd ~/.pi && git pull
```

Re-run `npm install` in the dependency directories if `package.json` files changed.
