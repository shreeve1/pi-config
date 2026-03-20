---
name: dev-prd
description: Create a lean, buildable product requirements document from a raw idea, note, or spec through phased interviewing, light research, and structured requirement capture. Use when the user wants to turn an idea into a PRD, spec, product brief, or developer-ready requirements document before planning or coding, even if they ask casually like “help me think this through,” “write a PRD,” or “turn these notes into something buildable.”
---

# Create a Product Requirements Document

Use this skill when the user has an idea, rough notes, or an early concept and wants a structured PRD that a human or AI coding agent can build from with minimal guessing. Do not use it when the user already wants an implementation plan, active coding, or pure open-ended brainstorming with no intent to produce a concrete artifact.

---

## Variables

- `IDEA_INPUT` — the user's idea, notes, or file path
- `OUTPUT_DIR` — `artifacts/specs/`
- `DRAFT_FILE` — `artifacts/specs/.prd-draft.json`
- `CURRENT_DATE` — today's date in `YYYY-MM-DD` form, typically obtained with `bash`

---

## Workflow Overview

Work through these phases in order:

1. Capture the idea and gather source context
2. Define the vision, problem, and target user
3. Research the landscape and validate the opportunity
4. Define features, stories, and scope boundaries
5. Choose a technical direction and constraints
6. Generate the PRD, validate it, save it, and report the result

Keep the document lean. The goal is not a corporate requirements packet; it is a buildable spec with enough clarity for downstream planning and implementation.

---

## Phase 1 — Prepare the Session

If the user did not provide an idea, use `ask_user` to collect one before continuing.

Use `bash` to ensure the output directory exists:

```sh
mkdir -p artifacts/specs
```

Then check whether `DRAFT_FILE` already exists and is recent enough to resume. Use `bash` for the existence and age check. If a recent draft exists, ask the user with `ask_user` whether to resume or start fresh.

When resuming:
- use `read` to inspect the draft file
- restore any captured context you can trust
- continue from the next incomplete phase rather than restarting the whole interview

If starting fresh, treat the current user request as the source of truth.

---

## Phase 2 — Gather Source Context

Determine whether `IDEA_INPUT` is free text or a file path.

### If the input looks like a file path

Use `read` to inspect that file and treat it as primary source material.

Extract:
- the product idea
- explicit requirements
- constraints
- existing terminology worth preserving
- any open questions that should be resolved in the interview

### If the input is free text

Look for nearby source material that might help. Use `bash` to search these locations when they exist:
- `artifacts/notes/`
- `artifacts/brainstorming/`
- `artifacts/specs/`

Prefer a short, relevant list over a noisy dump. If you find plausible context files, ask the user with `ask_user` how to proceed. Because `ask_user` does not support multi-select, offer either:
- a single best candidate via `type: "select"`
- a choice to enter one or more file paths manually via `type: "input"` or `type: "editor"`
- an option to start fresh

After the user chooses, use `read` on the selected files.

### Capture a working context summary

Before moving on, summarize the idea back to the user in plain language so they can correct misunderstandings early.

---

## Phase 3 — Interview for Vision and Problem

Use `ask_user` to interview the user and sharpen the idea into something buildable.

Ask concise, concrete questions. Prefer one focused question at a time when the answer materially affects the next question. Use `type: "select"` for forced choices and `type: "input"` or `type: "editor"` when nuance matters.

Cover these areas:

1. **Project shape**
   - What kind of product is this: web app, mobile app, CLI, API, automation, internal tool, or something else?
   - What is the intended v1 scope: tiny MVP, short sprint, multi-week build, or ongoing product?

2. **Problem clarity**
   - What painful problem does this solve?
   - Who feels that pain most?
   - What are they doing today instead?
   - Why is that current workflow insufficient?

3. **Motivation and success**
   - Why does the user want to build this now?
   - What would make v1 feel successful?
   - What is the simplest version worth shipping?

4. **Differentiation**
   - What makes this meaningfully different from alternatives?
   - Is the advantage speed, UX, focus, workflow fit, audience, cost, or something else?

From the answers, write a one-sentence vision statement in this form:

```text
This is a <product type> that helps <target user> do <valuable outcome> by <core mechanism>.
```

Also draft a short problem statement and a target-user summary before proceeding.

---

## Phase 4 — Research the Landscape

Research helps prevent writing a PRD around a vague or imaginary opportunity.

Use one of these approaches based on scope:

### Lightweight path

For small or clearly personal tools, use `web_search` and then `web_fetch` on the 2-3 most relevant results to understand:
- current alternatives
- obvious competitors or substitutes
- common user pain points
- technical constraints or enabling tools

### Deeper path

For broader or market-facing products, use `subagent` in parallel to divide the work. Good research lanes include:
- competitive landscape
- user pain points and workflows
- technical feasibility and likely stack options

Example subagent framing:
- research existing tools and summarize strengths, weaknesses, and gaps
- research likely target users and their workflows
- research implementation options, APIs, frameworks, and constraints

After research, synthesize findings for the user. If the findings challenge the original framing, say so clearly and adjust the PRD direction with the user before continuing.

---

## Phase 5 — Define Features, Stories, and Scope

Turn the concept into concrete product behavior.

### Identify candidate features

List the likely features implied by the idea, interview, and research. Then use `ask_user` to prioritize them. A good pattern is to review one feature at a time or ask the user to paste grouped priorities in an `editor` response.

Classify each feature as:
- must-have for v1
- should-have if time allows
- explicitly out of scope

Challenge scope creep when the chosen scope and feature list do not fit together.

### Write user stories

For each must-have feature, write 1-3 user stories in this form:

```text
As a <user type>, I want to <action> so that <benefit>.
```

### Write acceptance criteria

For each must-have feature or story, write acceptance criteria in `GIVEN / WHEN / THEN` form. These should be specific enough that an implementer can tell when the behavior is correct.

### Requirement tags

Assign each major requirement a unique `#req-<kebab-case-id>` tag. Use stable, descriptive names.

Examples:
- `#req-user-sign-in`
- `#req-export-csv`
- `#req-ai-summary-generation`

Collect these tags in a small working list so they can be reused consistently later in the document.

---

## Phase 6 — Define the Technical Direction

The PRD should help downstream implementation without pretending to be a full architecture spec.

Use the user’s context and the product’s needs to define:
- likely tech stack choices
- key entities or data model concepts
- important interfaces such as screens, endpoints, commands, or jobs
- third-party integrations
- deployment or hosting assumptions
- constraints, non-goals, and non-negotiables

Use research if needed:
- `web_search` and `web_fetch` for framework or platform comparisons
- `subagent` for parallel exploration when tradeoffs are substantial

If multiple reasonable stack options exist, present a short recommendation with tradeoffs and use `ask_user` when the decision depends on preference, experience, or cost tolerance.

If the product would benefit from a clear project structure, include a proposed file or folder layout that would make implementation easier for an AI coding agent.

---

## Phase 7 — Persist Draft State Between Phases

After each major phase, update `DRAFT_FILE` so the session can be resumed if interrupted.

Use `write` to save a JSON object with fields like:

```json
{
  "idea": "<original idea>",
  "phase_completed": 3,
  "vision": "<vision statement>",
  "problem_statement": "<problem statement>",
  "target_user": "<target user>",
  "must_have_features": ["<feature>"],
  "should_have_features": ["<feature>"],
  "requirement_tags": ["#req-example"],
  "timestamp": "<ISO timestamp>"
}
```

The draft exists to protect progress, so keep it current but lightweight.

---

## Phase 8 — Generate the PRD

Write the final document only after the core ambiguities are resolved.

Save the PRD to:

```text
artifacts/specs/prd-<kebab-case-name>-<CURRENT_DATE>.md
```

Use this structure and adapt it to the product:

```md
# PRD: <Product Name>

**Date:** <date>
**Author:** <user> + pi
**Status:** Draft
**Scope:** <Weekend MVP | Sprint | Multi-week | Ongoing>

## Vision
<one-sentence vision statement>

## Problem Statement
<2-3 sentences describing the real problem and current workaround>

## Target User
<primary persona description>

### User Context
- **Technical level:** <non-technical | beginner | intermediate | advanced>
- **Usage frequency:** <daily | weekly | occasional>
- **Key frustration:** <core pain point>

## Competitive Landscape

| Solution | Strengths | Gaps |
|----------|-----------|------|
| <solution> | <strength> | <gap> |

**Our differentiator:** <what makes this worth building>

## User Stories & Features

### Must Have (v1)

#### Feature: <Feature Name> #req-<id>
**User Story:** As a <user>, I want to <action> so that <benefit>.

**Acceptance Criteria:**
- GIVEN <context>, WHEN <action>, THEN <result>
- GIVEN <context>, WHEN <action>, THEN <result>

### Should Have (v1 stretch)
<important but non-blocking items, with `#req-<id>` tags where useful>

### Out of Scope (v1)
<explicit exclusions>

## Technical Requirements

### Tech Stack
- **Frontend:** <choice + rationale>
- **Backend:** <choice + rationale>
- **Database:** <choice + rationale>
- **Hosting:** <choice + rationale>

### Data Model
<key entities and relationships>

### Key Interfaces
<API endpoints, screens, commands, jobs, or flows>

### Third-Party Integrations
<external services or libraries>

### Project Structure
```text
<suggested file/folder structure>
```

## Success Metrics
- <measurable outcome>
- <measurable outcome>

## Acceptance Criteria
1. <top-level release criterion>
2. <top-level release criterion>
3. <top-level release criterion>

## Open Questions
<remaining uncertainties>

## Requirement Tags

| Tag | Feature | Priority |
|-----|---------|----------|
| #req-<id> | <Feature Name> | Must Have |

## Next Step
Run `/skill:pi-dev-plan` to turn this PRD into an implementation plan.
```

Keep sections that matter. If a section would be fake filler, either keep it very short and truthful or omit only when the artifact still remains usable.

---

## Phase 9 — Validate Before Saving

Before finalizing, check whether the PRD is actually buildable.

Use this checklist:
- the problem statement is specific enough to be challenged or validated
- the target user is concrete, not generic
- each must-have feature has at least one user story and acceptance criteria
- the v1 scope is explicit and realistic
- out-of-scope items are named
- the technical direction is clear without being over-specified
- success metrics are measurable
- requirement tags are present and consistent
- a developer or coding agent could begin planning from this without guessing core behavior

If important gaps remain, ask follow-up questions before saving.

---

## Phase 10 — Save, Clean Up, and Report

Use `write` to save the final PRD file, then `read` it back if you need to sanity-check formatting or confirm the save succeeded.

After a successful save:
- remove the draft file with `bash` if it exists and the user is done iterating
- report the saved path
- summarize the product, scope, major features, and research basis
- mention the natural next step: `/skill:pi-dev-plan`

---

## Interaction Guidelines

- Be conversational and specific.
- Use `ask_user` for decision points instead of dumping a long block of questions.
- Push on vague claims like “good UX” or “AI-powered” until they become concrete behaviors.
- Prefer concrete examples over abstract product language.
- Keep the PRD slim enough that it can actually guide implementation.
- When research contradicts the premise, help the user refine the concept instead of blindly preserving the original framing.

---

## Report

After saving the PRD, output:

```text
PRD Complete

File: artifacts/specs/prd-<name>-<date>.md
Product: <product name>
Scope: <scope level>

Source Material:
- <path or "none">

Research Summary:
- Competitive: <brief summary>
- Users: <brief summary>
- Technical: <brief summary>

Features:
- Must Have: <count>
- Should Have: <count>
- Out of Scope: <count>

Requirement Tags: <count>

Next Step: /skill:pi-dev-plan
```
