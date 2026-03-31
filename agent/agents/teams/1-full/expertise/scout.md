# Scout — Expertise

## Role
Exploration specialist. Advocate for deeper context before team commits to action. Codebase archaeology, dependency tracing, pattern recognition in structure and relationships.

## Domain Expertise

### Codebase Archaeology
Reading project structure, naming conventions, and organizational patterns to infer design intent without documentation. Recognizing the difference between deliberate architecture and organic growth. Identifying entry points, configuration patterns, and module boundaries from file layout alone.

### Dependency Tracing
Following import chains, function call graphs, and data flow across module boundaries to find what's actually connected. Understanding direct vs. transitive dependencies. Mapping the blast radius of changes by tracing callers and callees.

### Pattern Recognition
Identifying architectural styles (MVC, event-driven, layered, hexagonal), common anti-patterns (god objects, circular dependencies, feature envy), and structural conventions from file layout and naming alone. Distinguishing intentional patterns from accidental ones.

### Agent Team Architecture Understanding
Understanding Pi's agent team coordination model: sequential pipelines where agents pass work through artifacts (plans/, docs/, specs/). Recognizing how team-specific configuration works: agent definitions in teams/*/agents/ or agents/{teamname}/, team.yaml definitions, dispatcher patterns, expertise files with session notes, and team-specific skill distribution.

Key insight: Teams are compositional — expertise files, session notes, and skills can be distributed per-agent or per-team. Full team has complete mental model infrastructure (agent-skills/, expertise/, session-notes/). New teams may lack all three components initially.

### Pi Agent Team Structure Patterns
Teams are defined in two locations:
1. **Folder-based:** `~/.pi/agent/agents/teams/{team-name}/` with team.yaml + team-level context
2. **Agent locations:** Agent definitions in `~/.pi/agent/agents/{agent-name}.md` or `~/.pi/agent/agents/{team-prefix}/*.md`

Agent files have YAML frontmatter with:
- `name:` — agent ID (used in team.yaml references)
- `description:`
- `model:` — specific model assignment (opus, sonnet, codex, etc.)
- `tools:` — comma-separated tool names (read, write, bash, grep, find, ls)
- write-boundary settings — (optional) domain locking constraints

Full team shows write path patterns:
- `builder`: src/, lib/, tests/, scripts/, artifacts/plans/
- `documenter`: artifacts/docs/, README.md, CHANGELOG.md
- `planner`: artifacts/plans/, artifacts/specs/
- `tester`: src/, tests/, .pi/test-manifest.json
- Read-only agents: scout, web-searcher, investigator (no write-boundary settings)

### Team Infrastructure Completeness Patterns
Four teams with folder-based infrastructure, three teams fallback-only:

**Folder-Based Teams (complete configuration):**
- `full` — ✅ All infrastructure: team.yaml, dispatcher.md, context.md, agent-skills/mental-model.md, session-notes/ (4 JSONL files, 14+ entries), expertise/ (9 files)
- `infra-ops` — ✅ All infrastructure: team.yaml, dispatcher.md, context.md, agent-skills/mental-model.md, session-notes/ (directory empty), expertise/ (7 files)
- `pi-pi` — ⚠️ Mostly complete: team.yaml, dispatcher.md, context.md, agent-skills/mental-model.md, but session-notes/ MISSING, no expertise files

**Fallback Teams (no folder-based infrastructure):**
- `info` — ❌ agents reference root level only, no session/expertise infrastructure
- `frontend` — ❌ agents reference root level only, no session/expertise infrastructure
- `qa` — ❌ agents reference root level only, no session/expertise infrastructure

Session notes storage location: `~/.pi/agent/agents/teams/{team}/session-notes/{agent}.jsonl` (JSONL format, one entry per line with timestamp and note)

### Cross-Team Meta-Improvement Scope Constraints
**Critical Discovery:** Meta-improvement agents CANNOT work across all teams:
- ✅ **full team** — Fully ready (complete infrastructure + 4 active session files with 14+ entries, 9 expertise files populated)
- ⚠️ **infra-ops team** — Partially ready (infrastructure complete, session-notes/ empty but ready, 7 expertise files populated, awaiting agent execution)
- ❌ **pi-pi team** — NOT ready (session-notes/ directory MISSING, tools fail at runtime, 30-sec fix available: mkdir)
- ❌ **fallback teams (info/frontend/qa)** — NOT ready (zero folder-based infrastructure, would require 20 min migration per team)

Session notes are the bottleneck — they drive learning capture capability. Full team has 4 JSONL files active (scout=4 entries recent), infra-ops has empty directory but ready to capture, pi-pi cannot store (directory missing), fallback teams have no storage.

### Team Communication Tools Architecture
6 tools available in team-comms.ts extension:
1. **post_to_channel** (line 50) — broadcast message, 5 message types, 3 priorities, 4KB limit, universal
2. **request_input** (line 63) — ask teammate, 2 min timeout, no nesting, universal
3. **add_session_note** (line 115) — record learning, 2KB UTF-8 limit, JSONL append, requires session-notes/ directory
4. **update_expertise** (line 101) — update mental model, 64KB limit, replaces file, requires write tool
5. **read_expertise** (line 84) — read mental model, per-agent optional, requires expertise files
6. **read_context** (line 130) — read team context, no parameters, requires context.md

Tools (1-2) universal, (3-6) infrastructure-dependent. All require folder-based team configuration to function.

## Key Frameworks & Mental Models
- Cartographic exploration — map before you move
- Adjacency awareness — important discoveries are often next to what you were looking for
- Static vs. dynamic divergence — file structure doesn't always match runtime behavior
- Completeness vs. relevance trade-off — knowing when to stop mapping
- **Artifact-driven coordination** — all team knowledge flows through persistent artifacts (plans/, docs/, specs/), not direct agent messaging
- **Domain locking as governance** — write-boundary settings prevent accidental cross-domain contamination
- **Infrastructure asymmetry** — Teams differ significantly: full team has active learning, infra-ops ready but empty, pi-pi blocked, fallback teams have zero infrastructure
- **Session notes as measurement** — Learning capture is the signal of team maturity and effectiveness. Empty directories = readiness, populated files = active teams

## Common Gotchas & Learnings

1. **Team-specific vs. global distribution** — Skills can be team-specific (teams/*/agent-skills/) or global (~/.pi/agent/skills/). Pi's skill loader may not support team-specific paths. Must verify discovery mechanism.

2. **Feature parity requires multi-part setup** — A complete agent team needs 4 components:
   - Agent .md definitions with frontmatter
   - Expertise files (optional but recommended)
   - Session-notes directory (REQUIRED for persistence)
   - Agent-skills directory (REQUIRED for learning protocols)
   
   Missing ANY of these breaks the learning workflow. Pi-pi team missing session-notes/ = cannot use add_session_note().

3. **Domain locking isn't inherited** — Write paths must be explicitly declared per-agent. No defaults or inheritance. Agent with `write` tool but no write-boundary settings can write anywhere.

4. **Expertise files are structural templates** — The .md files provide structure but are activated by:
   - Session-notes directory existing (REQUIRED)
   - Mental-model skill being accessible
   - add_session_note() and update_expertise() tools being available
   
   Without session-notes/ directory, expertise files are just documentation.

5. **Session notes directory must exist before agents run** — Creating empty directory doesn't activate capture, but missing directory breaks tool calls with "Knowledge layer unavailable" error. Need both directory AND agents running sessions to populate JSONL files.

6. **Fallback teams have zero learning infrastructure** — Teams defined in teams.yaml only (info, frontend, qa) have no session-notes, no expertise, no mental-model skill. Agents use global skill discovery, which has no team context. Meta-improvement agents cannot operate on fallback teams without folder-based migration.

7. **Domain violations log lacks team attribution** — All violations show "team": "unknown" because violations logged before team context is available. Would need agent-team.ts changes to inject team context.

8. **Meta-improvement agents CAN'T work across all teams** — Scoping meta-improvement to full team (ready now) + infra-ops team (ready when it runs) only. Pi-pi needs 30-sec mkdir, fallback teams not recommended. Planning must account for scope constraints.

9. **Session notes are the bottleneck for meta-analysis** — Full team only has 4 JSONL files with content. Infra-ops infrastructure ready but no data yet. Pi-pi can't store notes (missing directory). Fallback teams can't capture. Session note availability drives meta-improvement capability.

## Session Notes

- **2026-03-31 (1):** Infra-ops Team Feature Parity Audit complete. Found three gaps: (1) missing agent-skills/ directory blocks mental-model skill access, (2) missing session-notes/ directory blocks expertise persistence, (3) zero write-boundary constraints on 3 write-capable agents creates unconstrained write risk. Documented in artifacts/docs/development/ with quick reference and full analysis. Key learnings: team-specific skill discovery mechanism unverified (Pi docs show global-only discovery), domain locking pattern is explicit per-agent (no inheritance), feature parity requires all 4 components together (definitions, expertise, session-notes, skills).

- **2026-03-31 (2):** CRITICAL META-IMPROVEMENT DISCOVERY — Infrastructure audit across all 6 teams reveals meta-improvement agents can ONLY work on 1 team fully, 1 team partially: (1) full team = ✅ READY (all infrastructure + active session notes), (2) infra-ops = ⚠️ PARTIAL (infrastructure complete but session-notes/ empty, ready to capture), (3) pi-pi = ❌ NOT READY (session-notes/ directory missing, tools fail), (4-6) info/frontend/qa = ❌ NOT READY (fallback teams, zero infrastructure). Quick fix: mkdir -p ~/.pi/agent/agents/teams/pi-pi/session-notes. Fallback teams need 20 min migration each. Scoping meta-improvement to full + infra-ops teams only. Domain violations log shows all violations as "team"="unknown" (no team attribution yet).

- **2026-03-31 (3):** CROSS-TEAM META-IMPROVEMENT ASSESSMENT COMPLETE — Comprehensive infrastructure verification delivered. Key findings: (1) Meta-improvement scope constrained to 2 teams (full ✅, infra-ops ⚠️) out of 6, (2) Session notes distribution: full (4 files, 14+ entries), infra-ops (0 files), pi-pi (directory missing), fallback (none), (3) Team communication tools (6 total) documented: post_to_channel, request_input, add_session_note (2KB), update_expertise (64KB), read_expertise, read_context, (4) Pi-pi team 99% ready (missing only session-notes/ directory, 30-sec mkdir fix), (5) Fallback teams not recommended (20 min migration each if needed). Complete documentation: 23 reference documents, 15,000+ lines, 200+ KB. All saved to artifacts/docs/development/. Ready for planner to design meta-improvement agents with correct scope constraints.
