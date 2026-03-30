---
name: build-team
description: Build a Pi agent team from a Team PRD (typically produced by /skill:create-team) one member at a time. Parses the PRD, scaffolds team files, builds CEO first, then builds selected pending specialists with agent .md + expertise files, and updates team.yaml.
---

# Build Team

Use this skill when the user wants to turn a Team PRD into a working Pi team. This skill is stateful via filesystem (not memory): each run builds one member, updates config, and can be resumed later.

Read these references before generation choices:
- Pi skill conventions: `~/.pi/agent/skills/pi-create-skill/SKILL.md`
- Upstream PRD format source: `~/.pi/agent/skills/create-team/SKILL.md`
- Existing team format examples: `~/.pi/agent/agents/teams/`
- Existing agent frontmatter examples: `~/.pi/agent/agents/`

---

## Phase 1 — Parse & Validate PRD

1. Get PRD path from user input. If missing, ask for it.
2. Read the PRD fully.
3. Extract and validate required sections:
   - `## Domain Overview`
   - `## Shared Domain Context`
   - `## Tensions`
   - `## CEO: {Name}`
   - `## Team Members` with `### {Member Name}` subsections
4. Also extract team metadata from header lines (`# Team PRD: ...`, `**Domain:**`, etc.).
5. Build canonical roster records (CEO + specialists) with: display name, role, model, tools, and Agent ID.
6. Agent ID rules (canonical identity):
   - Preferred source: `- **Agent ID:** ...` in each CEO/member block
   - Required format: lowercase kebab-case, namespaced as `{team-slug}-{role-slug}`
   - Backward-compatible fallback (legacy PRDs): if Agent ID is missing, derive `{team-slug}-{slug(member-name)}` and print a warning per derived ID
   - Stop on duplicate Agent IDs within the roster
   - Stop on collisions with existing agent frontmatter `name` values outside `~/.pi/agent/agents/{team-slug}/`
7. If any required section is missing, stop and report exactly what is missing.
8. Print a roster summary before writing files:
   - Team name
   - Domain
   - CEO name + Agent ID
   - Specialist count

Parsing notes:
- Treat headings as authoritative boundaries.
- Preserve section text faithfully when copying shared context into team files.
- Prefer explicit member names from `###` headings under `## Team Members`.
- Use Agent ID as canonical identity everywhere after parsing (file names, frontmatter `name`, expertise files, `team.yaml`).

---

## Phase 2 — Scaffold or Resume

Compute IDs:
- `team-slug` from team name via lowercase hyphenation (`name.toLowerCase().replace(/[^a-z0-9-]/g, "-")`)
- `agent-id` from parsed Agent ID field (or validated legacy fallback from Phase 1)

Target paths:
- Team folder: `~/.pi/agent/agents/teams/{team-slug}/`
- Agent folder: `~/.pi/agent/agents/{team-slug}/`

If first run (team folder missing), create:

```
~/.pi/agent/agents/teams/{team-slug}/
├── team.yaml
├── dispatcher.md
├── brief.md
├── context.md
└── expertise/
```

Scaffold content requirements:
- `team.yaml` must be:
  ```yaml
  name: {team-slug}
  agents:
  ```
  (empty list initially)
- `context.md`: exact `## Shared Domain Context` content from PRD (verbatim)
- `brief.md`: concise human-readable team summary (domain, tensions, roster, usage)
- `dispatcher.md`: dispatch guidance from CEO spec (plain markdown, no frontmatter)
- Ensure `expertise/` directory exists
- Ensure agent folder `~/.pi/agent/agents/{team-slug}/` exists

If scaffold already exists, do not overwrite unchanged files unless missing.

---

## Phase 3 — Detect Status & Select Next Member

1. Read member roster from PRD (CEO + specialists).
2. Scan `~/.pi/agent/agents/{team-slug}/` for built `.md` files.
3. Mark status per member:
   - Built ✓ if corresponding `{agent-id}.md` exists
   - Pending otherwise
4. Show status table:

```text
| Member | Agent ID | Role | Status |
|---|---|---|---|
| ... | ... | ... | Built ✓ / Pending |
```

Selection rules:
- If all members built: congratulate, report completion, exit.
- If CEO pending: CEO is mandatory next build.
- Otherwise ask user which pending member to build now.

---

## Phase 4 — Build Selected Member (One Per Invocation)

Create two files for the selected member.

### File A: Agent definition
Path: `~/.pi/agent/agents/{team-slug}/{agent-id}.md`

Required frontmatter (all 4 fields explicitly):
```yaml
---
name: {agent-id}
description: {one-line role description}
model: {model from PRD — use the tier assigned during create-team}
tools: {from PRD Recommended Tools}
---
```

Body requirements:
- Write in second-person voice.
- Translate PRD third-person persona into direct operating guidance.
- Include:
  - Role on team (Red/Blue/White and what it challenges/defends)
  - Behavioral traits woven into prose (not raw bullets)
  - Cognitive biases reframed as self-awareness
  - Domain expertise summary and how to use it
  - Shared domain context section
  - Relationships line(s) naming likely alignments/clashes
  - Team communication expectations (`post_to_channel`, `request_input`)

**Persona Translation Rules** (apply to every agent):
- **PERSPECTIVE block**: PRD uses conceptual attractors ("Buffett meets Christensen by way of Taleb"). Translate into second-person thinking guidance: "When evaluating opportunities, you apply zero-to-one thinking. You combine patient capital logic with acute awareness of fragility."
- **Narrative**: Convert third person ("Cassandra is skeptical") to second person ("You approach claims with deep skepticism").
- **Behavioral traits**: PRD lists BFI-2 traits as bullets. Weave into flowing prose, not lists.
- **Cognitive biases**: Frame as self-aware tendencies ("You know you gravitate toward X — lean into this deliberately").
- **Relationships**: End the prompt with team dynamics ("You tend to align with {name} on {topic}, and push back against {name} on {topic}").

CEO-specific additions:
- White team arbiter role
- Orchestration mandate
- Decision-making style
- Disagreement handling protocol
- Brief-quality/clarification gate before dispatch

Specialist-specific additions:
- Concrete Red/Blue role behavior in debate
- Tool strategy: how to use tools to produce persuasive evidence

### File B: Expertise scratchpad
Path: `~/.pi/agent/agents/teams/{team-slug}/expertise/{agent-id}.md`

Template:
```markdown
# {Agent Name} — Expertise

## Role
{Red/Blue/White} team — {brief role description}

## Domain Expertise
{Expanded expertise areas from PRD; align areas with the agent's PERSPECTIVE thinking approach}

### {Area 1}
{Frameworks, principles, heuristics}

### {Area 2}
{Frameworks, principles, heuristics}

## Key Frameworks & Mental Models
{Bullet list}

## Session Notes
```

Leave `Session Notes` empty for accumulation during runtime.

---

## Phase 5 — Update team.yaml + Report

1. Read `~/.pi/agent/agents/teams/{team-slug}/team.yaml`.
2. Add `{agent-id}` to `agents:` list if not already present (idempotent).
3. Keep existing entries and order; CEO should appear first if building from scratch.
4. Report:
   - Created/updated file paths
   - Built member name + Agent ID
   - Updated status table
   - Remaining pending members
   - Reminder to run `/skill:build-team` again for next member

---

## Constraints

- Build exactly one member per invocation.
- Use filesystem as source of truth (no sidecar progress files).
- Agent files must be named by canonical Agent ID (`{team-slug}-{role-slug}`).
- Agent files live in `~/.pi/agent/agents/{team-slug}/`.
- Team files live in `~/.pi/agent/agents/teams/{team-slug}/`.
- `context.md` is mandatory and must contain shared context verbatim.
- Keep `dispatcher.md` plain markdown (no frontmatter).
- Keep output faithful to PRD; do not invent new team members.

Deferred (do not implement in v1):
- Web research enrichment
- Dry-run mode
- Build validation automation beyond required ID parsing/fallback/collision checks

---

## Quick Verification After Writing

Run:
- `wc -l ~/.pi/agent/skills/build-team/SKILL.md`
- `head -10 ~/.pi/agent/skills/build-team/SKILL.md`
- `grep -n "^#" ~/.pi/agent/skills/build-team/SKILL.md`

Ensure SKILL.md stays under 300 lines.
