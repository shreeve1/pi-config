---
name: create-team
description: Design domain-specific advisory agent teams through structured interviewing. Identifies problem-domain tensions, proposes a Red/Blue/White team composition with a CEO orchestrator, and generates a complete Team PRD with deep persona specs (PERSPECTIVE blocks, BFI-2 behavioral traits, expertise, biases, tools, relationships) ready for downstream build-team implementation.
version: 1.0.1
author: james + pi
created: 2026-03-29
---

# Create Team

Use this skill when the user wants to design a domain-specific advisory team and produce a buildable Team PRD for `/skill:build-team`. Do not use for coding implementation or unstructured brainstorming with no artifact target.

---

## Variables

- `TEAM_NAME` — human-readable team name
- `TEAM_SLUG` — lowercase kebab-case slug derived from team name
- `AGENT_ID_PATTERN` — `{team-slug}-{role-slug}` (lowercase kebab-case)
- `OUTPUT_DIR` — `artifacts/specs/`
- `DRAFT_FILE` — `artifacts/specs/team-prd-{team-name}-draft.md`
- `CURRENT_DATE` — today in `YYYY-MM-DD`

---

## Workflow Overview

1. Domain discovery interview
2. Tension identification
3. Team composition
4. CEO deep design + shared context
5. Specialist deep design (sequential)
6. Assemble, save, and review Team PRD

After each major phase, save a draft to `DRAFT_FILE`.

**Resume protocol:** At start, check whether a draft exists for this team. If yes, ask whether to resume from the last completed phase or restart fresh.

---

## Phase 1 — Domain Discovery

Run a conversational interview using `ask_user` (3-5 focused questions, one at a time). Adapt follow-ups to answers.

Cover:
- domain/problem space
- recurring decisions/questions the team will advise on
- stakes when decisions fail
- expertise gaps today
- frameworks / schools of thought / reference thinkers to represent

If answers are vague, ask for concrete examples before moving on.

Then synthesize a 2-3 paragraph domain summary and ask for explicit confirmation or corrections.

Persist draft to `DRAFT_FILE`.

---

## Phase 2 — Tension Identification

Propose 2-5 real tensions from the confirmed domain summary. Each tension must represent a meaningful trade-off between legitimate positions.

For each tension include:
- **Name**
- **Red Pole** (challenger position)
- **Blue Pole** (defender position)
- **Why it matters** (what fails if over-indexed)

Ask the user to refine, add, remove, or reframe tensions. Finalize only after explicit approval.

Guidance:
- Prefer 3-4 tensions for practical team operation
- Avoid generic or fake dichotomies
- Keep tensions domain-specific and consequential

Persist updated tensions to `DRAFT_FILE`.

---

## Phase 3 — Team Composition

Propose **CEO (White) + 3-7 specialists**.

Map each specialist to 1-2 tensions with clear lean:
- **Red** = challenger
- **Blue** = defender

Validate before presenting:
- every tension has at least one Red and one Blue voice
- no redundant member pair that argues identically
- size is within CEO + 3-7 specialists
- every member (including CEO) has a unique **Agent ID** matching `{team-slug}-{role-slug}`

Present roster, team name proposal, and Agent IDs. Ask for edits (missing, redundant, renames, remaps). Finalize only after user approval.

Persist roster + team name + Agent IDs to `DRAFT_FILE`.

---

## Model Tiering

Assign models based on each member's strategic importance to the team. Not every agent needs the most powerful model — reserve premium models for members whose judgment carries the highest stakes.

**Tier 1 — Premium** (1 member max): `anthropic/claude-opus-4-6`
Assign to the single most critical team member — typically the CEO or the specialist whose domain requires the deepest reasoning.

**Tier 2 — Strong** (1-2 members): `openai-codex/gpt-5.3-codex`, `openai-codex/gpt-5.4`
Assign to key Red/Blue leads whose analysis directly shapes decisions.

**Tier 3 — Efficient** (remaining members): `anthropic/claude-haiku`, `openai/gpt-4o-mini`
Assign to supporting specialists, scouts, and information-gathering roles where speed matters more than depth.

During team composition, explicitly assign a model tier to each member and include the model ID in the Team PRD output.

---

## Phase 4 — CEO Deep Design + Shared Domain Context

Design the CEO first, then define shared context used by all members.

### Shared Domain Context

Write 2-4 paragraphs of baseline context all agents share (facts, constraints, operating realities, known metrics patterns).

### CEO Specification (11 required components)

Generate all eleven:
1. Name
2. Agent ID (`{team-slug}-{role-slug}`)
3. Narrative Description (conceptual attractor)
4. PERSPECTIVE Block
5. Behavioral Traits (BFI-2 spectrum prose)
6. Role (White arbiter)
7. Orchestration Mandate
8. Decision-Making Style
9. Handling Disagreement
10. Domain Expertise
11. Recommended Tools (must include `dispatch_agent`)

Also include **Constraint Policy**: when to stop debate, required evidence threshold for final call, and what to do with unresolved tensions.

Ask for approval before specialist design.

Persist shared context + CEO spec to `DRAFT_FILE`.

---

## Phase 5 — Specialist Deep Design (Sequential)

Design specialists one at a time in approved order. After each member, run a differentiation check against prior members.

For each member include all required components:
1. Name
2. Agent ID (`{team-slug}-{role-slug}`)
3. Narrative
4. PERSPECTIVE Block
5. Behavioral Traits (BFI-2 spectrum prose)
6. Team Role (Red/Blue + what they challenge/defend)
7. Domain Expertise (3+ specific seed areas/frameworks)
8. Cognitive Biases (self-aware tendencies)
9. Recommended Tools
10. Relationships (directional, topic-specific)

Style guidance:
- narrative is character-first, not role boilerplate
- PERSPECTIVE uses intersecting references
- traits are nuanced behavior prose, never high/low labels
- biases are deliberate gravitational pulls
- relationships specify who/what/where agreement or clash appears

Differentiation check per member:
- unique axis of disagreement
- closest neighbor comparison
- adjust perspective/traits/biases if overlap is too high

Optionally ask once whether user wants web research enrichment for frameworks/thought leaders.

Persist each completed member to `DRAFT_FILE`.

---

## Phase 6 — Assemble, Save, and Review

Save final PRD to:
`artifacts/specs/team-prd-{team-name}-{date}.md`

Use this build-team-compatible structure exactly:

```markdown
# Team PRD: {Team Name}

**Date:** {date}
**Architect:** {user}
**Domain:** {domain}
**Team Size:** CEO + {N} specialists
**Status:** Draft

## Domain Overview
{Problem domain, decision scope, stakes, end users}

## Expertise Gaps
{Missing perspectives this team is designed to cover}

## Shared Domain Context
{Baseline context injected into every agent}

## Tensions
### Tension: {Name}
- **Red Pole:** {position}
- **Blue Pole:** {position}
- **Stakes:** {what fails if over-indexed}
- **Mapped Members:** {names + pole coverage}

## CEO: {CEO Name}
### Name
{CEO name}
- **Agent ID:** `{team-slug}-{role-slug}`
- **Model:** `{model-id from tiering}`
### Role
White team arbiter and orchestrator
### Orchestration Mandate
{how meetings run}
### Decision-Making Style
{how inputs are weighed}
### Handling Disagreement
{split-board protocol}
### Narrative Description
{conceptual attractor prose}
### PERSPECTIVE Block
{second-person reasoning guidance}
### Behavioral Traits
{BFI-2 spectrum prose}
### Domain Expertise
{CEO expertise areas}
### Recommended Tools
{tools, must include dispatch_agent}
### Domain Context Reference
See: **## Shared Domain Context**

## Team Members
### {Member Name}
- **Agent ID:** `{team-slug}-{role-slug}`
- **Model:** `{model-id from tiering}`
### Narrative
{conceptual attractor prose}
### PERSPECTIVE Block
{second-person reasoning guidance}
### Behavioral Traits
{BFI-2 spectrum prose}
### Team Role
{Red/Blue — what they challenge/defend}
### Domain Expertise
{3+ seed areas/frameworks; include scratchpad seed intent}
### Cognitive Biases
{self-aware tendencies}
### Recommended Tools
{tool list}
### Relationships
- **Likely agrees with:** {who} on {what}
- **Likely clashes with:** {who} on {what}

## Differentiation Check
{verify unique perspective and minimal overlap across members}

## Appendix
### Build Instructions
{How to hand this PRD to /skill:build-team}
### Downstream Dependencies
{Known follow-on work}
```

Before final save, validate:
- every Agent ID is present for CEO and all specialists
- every Agent ID is unique (no collisions)
- every Agent ID is lowercase kebab-case and namespaced as `{team-slug}-{role-slug}`

After save:
1. Ask if user wants revisions to specific member(s)
2. If yes, revise and re-save
3. If no, finalize and report path
4. Keep draft only if user wants continued iteration; otherwise overwrite with completion note

---

## Design Principles

- **Conversational, not checklist:** ask naturally; adapt to answers.
- **Guided reasoning:** propose trade-offs, avoid rigid form filling.
- **stunspot methodology:** use conceptual attractors and “X meets Y by way of Z.”
- **BFI-2 traits:** write spectrum behaviors with qualifiers, never binary labels.
- **Biases as self-awareness:** frame tendencies as deliberate, known pulls.
- **Red/Blue/White architecture:** structural disagreement improves decisions.
- **Shared + individual layering:** common context for all, differentiated expertise per member.
- **Decision compounding:** design teams that improve judgment over repeated briefs.

---

## Report

When complete, return:

```text
Team Design Complete

File: artifacts/specs/team-prd-{team-name}-{date}.md
Team: {Team Name}
Domain: {Domain}
Size: CEO + {N} specialists
Tensions: {count}

Members:
- {Name} ({Agent ID}) — {Role}
- ...

Next Step: /skill:build-team
```
