# Pi Config

Personal [Pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) configuration — agent teams, skills, extensions, themes, and prompts.

<img width="1625" height="544" alt="image" src="https://github.com/user-attachments/assets/30c63265-c328-4e67-811b-68a5d3dc2fdc" />


---

## Why Pi?

- **Open source (MIT)** — Read, modify, and version-control every part of the agent. Pin what works. No surprise behavior changes from upstream.
- **~200 token system prompt** — Pi's core is radically minimal. Four tools by default. Everything else loads on demand — your context window is spent on work, not framework overhead.
- **Extensible, not opinionated** — Add capabilities via TypeScript extensions, skills, and themes. Build exactly the agent you need.
- **300+ models, any provider** — Anthropic, OpenAI, Google, Mistral, Groq, OpenRouter, Ollama, and more. Switch mid-conversation.
- **Skills as workflows** — Multi-step workflows load only when triggered. No token cost when unused.

### Pi vs. Claude Code

| | Pi | Claude Code |
|---|---|---|
| **System prompt** | ~200 tokens | ~10,000+ tokens |
| **Core tools** | 4 (read, write, edit, bash) | 8+ |
| **Source** | Open source (MIT) | Closed source |
| **Models** | 300+ across any provider | Anthropic-first |
| **Token efficiency** | On-demand skill loading | Upfront context dump |

---

## Installation

```bash
# Install Pi globally
npm install -g @mariozechner/pi-coding-agent

# Clone this config
git clone https://github.com/shreeve1/pi-config.git ~/.pi

# Install dependencies
cd ~/.pi/agent && npm install
```

Create `~/.pi/agent/auth.json` with your API keys:

```json
{
  "anthropic": { "type": "api_key", "key": "sk-ant-..." },
  "openai":    { "type": "api_key", "key": "sk-proj-..." },
  "google-gemini-cli": { "type": "api_key", "key": "AIza..." }
}
```

Only add providers you use. For custom providers (Ollama, OpenRouter, etc.), add them to `~/.pi/agent/models.json`.

---

## Agent Teams

The primary workflow is **team-based orchestration**. You talk to a dispatcher; it delegates work to specialists. Agents accumulate knowledge across sessions through expertise files and session notes.

```
You
 │
 ▼
Dispatcher  ←── team context, channel messages, expertise
 │
 ├──► scout          (read-only exploration)
 ├──► planner        (design & task breakdown)
 ├──► builder        (implementation)
 ├──► reviewer       (plan & code review)
 ├──► tester         (validation)
 ├──► red-team       (security)
 ├──► documenter     (docs & changelogs)
 ├──► investigator   (root cause diagnosis)
 └──► web-searcher   (live research)
```

### Team Dashboard Icons

When running in team mode, each agent shows status and activity at a glance.

#### Agent Status

| Icon | Meaning |
|------|---------|
| `○` | Idle — ready, not running |
| `●` | Running — currently working |
| `✓` | Done — completed successfully |
| `✗` | Error — encountered a failure |

#### Activity Indicators

| Indicator | Meaning |
|-----------|---------|
| `💬 N` | N messages in team channel |
| `⏳` | Pending request from another agent |
| `📚` | Expertise file loaded |
| `📝 N` | Session notes count |
| `⚙ N` | Tool calls made this dispatch |
| `# N` | Dispatch run count |
| `M:SS` | Elapsed time |
| `Nk` | Context tokens used |

### Team Commands

| Command | What it does |
|---------|-------------|
| `/agents-team` | Switch active team |
| `/agents-list` | List agents in current team |
| `/agents-view` | Toggle dashboard layout (compact / cards) |
| `/agents-grid <1–6\|auto>` | Control agent grid columns |
| `/agents-comms` | Inspect team channel and pending requests |

### Ask Pi to Update Your Team

If you want to refine or upgrade your agent team, ask your Pi agent directly. A good prompt is:

```text
Review my current agent team and update any agents, prompts, or team configs that should be improved. When choosing or changing models, only use providers/models I am already authenticated for in my Pi config. If a better model is unavailable because I am not authenticated, keep the current model or ask me before changing it.
```

This helps Pi improve agent definitions without switching you to models or providers you have not configured yet.

---

## Built-In Teams

### `full` — End-to-End Software Delivery (9 agents)

| Agent | Model | Role |
|-------|-------|------|
| scout | gpt-5.3-codex | Read-only codebase exploration |
| web-searcher | gemini-2.5-pro | Live research, docs, package versions |
| planner | gpt-5.4 | Task breakdown, implementation plans |
| builder | gpt-5.3-codex | Code implementation |
| reviewer | claude-opus-4-6 | Plan and code review, risk assessment |
| tester | gpt-5.3-codex | Test execution and validation |
| documenter | gpt-5.4 | Docs, READMEs, changelogs |
| red-team | gemini-2.5-pro | Security audits, vulnerability analysis |
| investigator | gpt-5.4 | Root cause diagnosis (read-only) |

**Pipelines:**

```
Implementation:   planner → reviewer → builder → reviewer → tester
Debugging:        investigator → planner → builder → reviewer → tester
Security:         ... → tester → red-team
Documentation:    documenter (direct dispatch)
```

---

### `infra-ops` — Infrastructure Operations (6 agents)

| Agent | Model | Role |
|-------|-------|------|
| infra-scout | gpt-5.3-codex | Read-only infrastructure exploration |
| infra-responder | gpt-5.4 | Incident response and triage |
| infra-analyst | gpt-5.4 | Root cause analysis |
| infra-operator | gpt-5.3-codex | Deployment, configuration, runbooks |
| infra-hardener | gpt-5.4 | Security hardening, policy management |
| infra-documenter | gpt-5.4 | Infrastructure docs and runbooks |

---

### `pi-pi` — Pi Framework Experts + Meta-Improvement (10 agents)

Seven read-only framework experts, three meta-improvement agents that can audit and refine the agent-team system itself.

| Agent | Model | Role |
|-------|-------|------|
| ext-expert | claude-opus-4-6 | Pi extensions, hooks, lifecycle |
| theme-expert | claude-opus-4-6 | Themes, color tokens, styling |
| tui-expert | claude-opus-4-6 | Terminal UI, rendering, layout |
| skill-expert | claude-opus-4-6 | SKILL.md format, skill packages |
| config-expert | claude-opus-4-6 | settings.json, providers, models |
| prompt-expert | claude-opus-4-6 | Prompt templates, LLM interaction |
| agent-expert | claude-opus-4-6 | Agent definitions, teams, dispatch |
| agent-auditor | gemini-2.5-pro | Read-only audit of agent behavior data |
| prompt-engineer | gemini-2.5-pro | Refines agent prompts, expertise, skills |
| config-tuner | gemini-2.5-pro | Adjusts team configs, boundaries, models |

**Meta-improvement pipeline:**
```
agent-auditor → (findings) → prompt-engineer and/or config-tuner
```

---

### `frontend` — UI Design + Implementation (5 agents)

| Agent | Model | Role |
|-------|-------|------|
| planner | gpt-5.4 | Feature planning |
| mockup-designer | gemini-2.5-pro | Visual mockups, design direction |
| builder | gpt-5.3-codex | UI implementation |
| ui-reviewer | claude-sonnet-4-6 | Visual QA, screenshot review |
| bowser | claude-sonnet-4-6 | Headless browser automation |

---

### `info` — Research and Documentation (4 agents)

| Agent | Model | Role |
|-------|-------|------|
| scout | gpt-5.3-codex | Codebase exploration |
| web-searcher | gemini-2.5-pro | Web research |
| reviewer | claude-opus-4-6 | Content review |
| documenter | gpt-5.4 | Writing and documentation |

---

### `qa` — Validation and Risk (5 agents)

| Agent | Model | Role |
|-------|-------|------|
| tester | gpt-5.3-codex | Test execution |
| reviewer | claude-opus-4-6 | Code and plan review |
| red-team | gemini-2.5-pro | Security and adversarial testing |
| investigator | gpt-5.4 | Root cause diagnosis |
| ui-reviewer | claude-sonnet-4-6 | Visual and UX review |

---

## Agent Architecture

### Model Strategy

| Tier | Models | Used For |
|------|--------|----------|
| **Premium** | claude-opus-4-6 | Deep review, security, framework expertise, audit |
| **Strong** | gpt-5.4, gemini-2.5-pro | Planning, investigation, research, meta-improvement |
| **Efficient** | gpt-5.3-codex | Implementation, testing, exploration, default work |
| **Visual** | claude-sonnet-4-6, gemini-2.5-pro | UI review, mockups, browser automation |

### Domain Locking

Every write-capable agent declares `allowed_write_paths` in its frontmatter. The `domain-lock.ts` extension intercepts all write and edit tool calls and blocks any path outside the agent's declared scope.

- Fail-closed: an agent with no `allowed_write_paths` declaration cannot write anywhere
- Violation logged to `~/.pi/logs/domain-violations.jsonl`
- Error message names the teammate who has write access to the blocked path

### Learning and Persistence

Agents accumulate knowledge across sessions through three layers:

| Layer | File | Updated By | Purpose |
|-------|------|------------|---------|
| **Domain knowledge** | `teams/{team}/knowledge/{agent}.md` | Humans | Curated reference, never overwritten by agents |
| **Expertise** | `teams/{team}/expertise/{agent}.md` | Agent (`update_expertise`) | Core mental model, grows over time |
| **Session notes** | `teams/{team}/session-notes/{agent}.jsonl` | Agent (`add_session_note`) | Lightweight per-session observations |

All three are injected into the agent's system prompt on each dispatch. The `mental-model.md` skill (in `agent-skills/`) tells each agent when and what to capture.

### Team File Structure

```
~/.pi/agent/agents/
├── {agent}.md                        ← Root-level agent definitions
├── {team}/
│   └── {agent}.md                    ← Team-specific overrides
└── teams/
    └── {team}/
        ├── team.yaml                 ← Roster
        ├── dispatcher.md             ← Dispatch protocol and pipelines
        ├── context.md                ← Shared domain context
        ├── brief.md                  ← Human-readable team summary
        ├── expertise/
        │   └── {agent}.md            ← Persistent expertise per agent
        ├── knowledge/
        │   └── {agent}.md            ← Read-only domain reference
        ├── session-notes/
        │   └── {agent}.jsonl         ← Append-only session learnings
        └── agent-skills/
            └── mental-model.md       ← Shared learning capture guidance
```

---

## Creating New Teams

Design and build a custom team from scratch:

```bash
# 1. Interview-driven design — produces a Team PRD
/skill:create-team

# 2. Build agents from the PRD (one per run, resumable)
/skill:build-team artifacts/specs/team-prd-<name>-<date>.md

# 3. Activate the team
/agents-team
```

`create-team` interviews you about the domain, identifies tensions (Red/Blue trade-offs), and produces a PRD with per-agent persona specs, model assignments, tool lists, and write boundaries.

`build-team` translates the PRD into working agent files, scaffolding the full team directory structure including expertise files, session-notes directory, and dispatcher protocol.

---

## Memory Management

Pi-mem gives the agent persistent memory across sessions — project-scoped and global.

| Command | What it does |
|---------|-------------|
| `/mem` | Browse recent project sessions and global learnings |
| `/mem search "query"` | Full-text search across all saved memory |
| `/mem save` | Save current session to project memory |
| `/mem checkpoint` | Save mid-session snapshot with resume context, linked to a plan |
| `/mem global <learning>` | Save a cross-project learning with category and tags |
| `/mem plan path/to/plan.md` | Resume work from a plan file's checkpoint history |
| `/mem cleanup` | Consolidate or prune old entries (confirms before deleting) |

**Storage:**
- Project memory: `~/.pi/data/memory/projects/{hash}-{name}/memory.db`
- Global memory: `~/.pi/data/memory/global/memory.db`

---

## What's Included

| Directory | Contents |
|-----------|----------|
| `agent/agents/` | Agent definitions — root-level and team-specific |
| `agent/agents/teams/` | Team configs, dispatcher protocols, expertise, session notes |
| `agent/skills/` | 35+ skills — planning, building, testing, brainstorming, team creation, etc. |
| `agent/extensions/` | TypeScript extensions — agent-team orchestration, domain locking, team comms, web fetch, TypeScript LSP, etc. |
| `agent/themes/` | Custom themes |
| `agent/prompts/` | Prompt templates |
| `agent/scripts/` | Utility scripts |
| `artifacts/` | Plans, specs, docs, brainstorming output |

---

## Settings

Default settings in `agent/settings.json`:

| Setting | Default | Notes |
|---------|---------|-------|
| `defaultProvider` | `openai-codex` | Provider for the main session |
| `defaultModel` | `gpt-5.3-codex` | Model for the main session |
| `theme` | `ember` | UI color theme |
| `defaultThinkingLevel` | `high` | Reasoning depth |
| `extensions` | `["-extensions/agent-team.ts"]` | agent-team disabled by default; enable with `/agents-team` or `-e extensions/agent-team.ts` |

Edit `~/.pi/agent/settings.json` to change defaults.

---

## Updating

```bash
cd ~/.pi && git pull
cd agent && npm install
```
