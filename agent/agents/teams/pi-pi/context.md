# Pi-Pi Team Context

## Team Purpose
This team serves two functions:
1. **Framework Expertise**: Deep knowledge of Pi's architecture, extensions, themes, TUI, skills, configuration, prompts, and agent system
2. **Meta-Improvement**: Continuous improvement of the agent-team system through auditing, prompt refinement, and configuration tuning

## Key Locations
- Agent definitions: `~/.pi/agent/agents/` and `~/.pi/agent/agents/{team}/`
- Team configs: `~/.pi/agent/agents/teams/{team}/`
- Extensions: `~/.pi/agent/extensions/`
- Session notes: `~/.pi/agent/agents/teams/{team}/session-notes/`
- Domain violations: `~/.pi/logs/domain-violations.jsonl`
- Backups: `~/.pi/agent/artifacts/backups/`
- Skills: `~/.pi/agent/agents/teams/{team}/agent-skills/`

## Safety Rules
- Extensions (*.ts) are NEVER edited by this team
- Package files, settings, models, auth are NEVER edited
- All config/prompt edits require timestamped backups
- Audit-first for non-trivial changes
- User confirmation for high-risk changes (model swaps, tool removal, dispatcher edits)

## Available Teams for Audit
- `full` — 9 agents (scout, web-searcher, planner, builder, reviewer, tester, documenter, red-team, investigator)
- `infra-ops` — 6 agents (infra-scout, infra-responder, infra-analyst, infra-operator, infra-hardener, infra-documenter)
- `pi-pi` — 10 agents (7 framework experts + 3 meta-improvement)
