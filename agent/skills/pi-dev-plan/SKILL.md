---
name: pi-dev-plan
description: Use when the user wants a structured implementation plan, technical approach, phased roadmap, or task breakdown for a feature, fix, refactor, or enhancement before writing code.
---

# Create Implementation Plan

Use this skill when the user needs a concrete engineering plan before implementation: a roadmap, phased task list, technical design, or execution spec for a feature, fix, refactor, or enhancement. Ground the plan in the actual codebase and any available source documents so the result is specific, traceable, and ready to execute. Do not use it when the user wants immediate coding, a quick answer, or debugging rather than planning.

---

## Variables

- `USER_PROMPT` — the user’s planning request or requirements
- `PLAN_OUTPUT_DIRECTORY` — `artifacts/plans/`
- `SOURCE_DIRECTORIES` — `artifacts/specs/`, `artifacts/brainstorming/`
- `TEST_DIR` — `tests/`

---

## Workflow Overview

Work through these steps in sequence, skipping only those that clearly do not apply:

1. Parse the request
2. Discover relevant source documents
3. Understand the codebase directly
4. Design the technical approach
5. Write the plan
6. Generate a descriptive filename
7. Save the plan and report the result

Adjust depth to fit complexity:
- **Simple** tasks should produce lean plans (core sections and a concise actionable task list)
- **Medium** tasks should include phased work and validation details
- **Complex** tasks should include traceability, dependencies, risks, and explicit testing coverage

---

## Phase 1 — Parse the Request

Analyze `USER_PROMPT` to identify:

- the core objective
- the type of work: `feature` | `fix` | `refactor` | `enhancement` | `chore`
- the expected scope: `simple` | `medium` | `complex`
- constraints, assumptions, and open questions
- whether the prompt references an existing document, file path, ticket, or requirement source

If the request is too ambiguous to plan well, use `ask_user` to clarify the minimum missing information before proceeding.

---

## Phase 2 — Discover Source Documents

If `USER_PROMPT` is a file path, read that file directly with `read` and treat it as the primary source.

If `USER_PROMPT` is free text, look for likely source documents:

1. Use `bash` to list markdown files in `artifacts/specs/` and `artifacts/brainstorming/`, sorted by modification time
2. If one or more likely source documents exist, present the most relevant 1-3 options with `ask_user`
3. Let the user choose:
   - use one document
   - use multiple documents
   - ignore them and use only the prompt
   - specify a different file

After confirmation, use `read` to inspect the selected source documents.

When source documents are present, extract:
- requirements
- goals
- constraints
- explicit tags such as `#req-*`
- assumptions that should carry into the plan

---

## Phase 3 — Understand the Codebase

Explore the codebase directly so the plan reflects first-hand understanding rather than delegated summaries.

Use:
- `bash` with `ls`, `find`, `rg`, or project commands to locate relevant code
- `read` to inspect key files and existing patterns

Look for:
- architecture relevant to the request
- modules or services likely to change
- existing implementation patterns to follow
- tests already covering adjacent behavior
- likely integration points, dependencies, and risks

Capture enough context to make the plan specific. Do not over-research simple tasks.

---

## Phase 4 — Design the Solution

Develop a technical approach that fits the task and the codebase you found.

Include, as appropriate:
- architecture decisions
- implementation strategy
- sequence of work
- data flow or control flow changes
- edge cases and failure modes
- backward compatibility concerns
- migration or rollout concerns
- validation and testing approach

If multiple reasonable approaches exist, choose one and briefly justify it. If the decision materially depends on user preference, ask before locking in the plan.

---

## Phase 5 — Propagate Requirement Tags

If a confirmed source document includes `#req-[id]` tags:

1. Collect those tags
2. Deduplicate tags and preserve exact tag text from the source document
3. Attach relevant tags to implementation tasks without inventing new requirement tags
4. Use stable inline task IDs in the form `[N.M]`
5. Add a `## Traceability Map` section mapping each requirement tag to task IDs

Example task formatting:

```markdown
- [ ] [1.1] Implement login form #req-user-login
- [ ] [1.2] Add server-side validation #req-user-login
```

If no `#req-*` tags are present, skip traceability features cleanly.

---

## Phase 6 — Write the Plan

Write a markdown plan tailored to the task’s complexity.

### Required sections

Every plan should include:

- `# Plan: <task name>`
- `## Task Description`
- `## Objective`
- `## Relevant Files`
- `## Step by Step Tasks`
- `## Acceptance Criteria`
- `## Validation Commands`

### Conditional sections

Include these when they add real value:

- `## Problem Statement` — for features, fixes with context, or medium/complex work
- `## Solution Approach` — when the implementation shape needs explanation
- `## Implementation Phases` — for medium/complex work
- `## Testing Strategy` — when validation needs more than a few commands
- `## Tests` — when explicit test tasks should be tracked separately
- `## Traceability Map` — only when source requirements include `#req-*`
- `## Notes` — only for useful residual context

Prefer a lean plan for simple work and a structured, dependency-aware plan for larger efforts.

---

## Phase 7 — Structure Tasks Clearly

In `## Step by Step Tasks`, write actionable tasks with stable IDs.

Rules:
- Respect dependency order
- Tasks with no dependencies may be marked as parallelizable
- Keep tasks concrete enough to execute without reinterpretation
- Group related work under numbered subsections
- Use `[N.M]` identifiers for stable tracking
- Add `#req-*` tags only when traceability data exists

Example:

```markdown
### 1. Foundation
- [ ] [1.1] Create the shared validation module
- [ ] [1.2] Wire the module into request parsing [sequential]

### 2. Feature Work
- [ ] [2.1] Add UI form state handling [parallel-safe]
- [ ] [2.2] Add API endpoint validation [parallel-safe]
- [ ] [2.3] Connect submission flow to backend [sequential]
```

Use optional annotations where helpful:
- `[parallel-safe]`
- `[sequential]`

Do not force parallelism if sequencing is clearer or safer.

---

## Phase 8 — Include Validation

Define how the implementation will be proven complete.

Use one or more of:
- test commands
- lint/typecheck commands
- build commands
- targeted manual validation steps
- acceptance checks derived from requirements

If automated checks are unavailable, include explicit manual validation steps with expected outcomes.

When useful, separate this into:
- `## Testing Strategy` for narrative validation approach
- `## Tests` for explicit test tasks
- `## Validation Commands` for concrete commands to run

Keep validation proportional to complexity.

---

## Plan Format

Use this structure as a guide and adapt it to the task:

```markdown
# Plan: <task name>

## Task Description
<describe the requested work clearly and concretely>

## Objective
<state what will be true when this work is complete>

## Problem Statement
<optional: explain the current issue or opportunity>

## Solution Approach
<optional: explain the chosen technical direction>

## Relevant Files
Use these files to complete the task:

- `<path>` — <why it matters>
- `<path>` — <why it matters>

### New Files
- `<path>` — <why it will be created>

## Implementation Phases
<optional: include for medium/complex work>

### Phase 1: Foundation
<brief summary>

**[1.1] First task**  
Description.  
**Dependencies:** None

**[1.2] Second task**  
Description.  
**Dependencies:** [1.1]

### Phase 2: Core Work
<brief summary>

**[2.1] Task A**  
Description.  
**Dependencies:** [1.2]

**[2.2] Task B**  
Description.  
**Dependencies:** [1.2]

## Step by Step Tasks

### 1. Foundation
- [ ] [1.1] <specific action>
- [ ] [1.2] <specific action>

### 2. Core Work
- [ ] [2.1] <specific action>
- [ ] [2.2] <specific action>

## Testing Strategy
<optional: describe testing approach>

## Tests
<optional: list explicit test tasks>

### T.1. Core Validation
- [ ] [T.1.1] <specific test case>
- [ ] [T.1.2] <specific test case>

## Acceptance Criteria
- <specific measurable criterion>
- <specific measurable criterion>

## Validation Commands
- `<command>` — <what it validates>
- `<command>` — <what it validates>

## Traceability Map
<optional>

| Requirement | Tasks |
|-------------|-------|
| #req-<id> | [1.1], [2.1] |

## Notes
<optional additional context>
```

---

## Phase 9 — Generate the Filename

Create a descriptive kebab-case filename based on the plan topic.

Examples:
- `add-user-authentication.md`
- `refactor-database-layer.md`
- `fix-session-timeout-handling.md`

Avoid vague names like:
- `plan.md`
- `feature-work.md`
- `misc-updates.md`

---

## Phase 10 — Save and Report

Write the completed document to:

`artifacts/plans/<filename>.md`

When the plan is meant for implementation, assume execution should usually happen on a feature branch or git worktree rather than directly on `main`/`master`. You do not need to create the worktree here; just keep the plan compatible with that workflow.

Then report:
- where the plan was saved
- what it covers
- any source documents used
- whether requirement tags were propagated
- the main workstreams or components involved

---

## Report

After creating and saving the implementation plan, output:

```text
✅ Implementation Plan Created

File: artifacts/plans/<filename>.md
Topic: <brief description of what the plan covers>
Source Documents:
- <path or "none">
Requirement Tags:
- <summary or "none">

Key Components:
- <main component 1>
- <main component 2>
- <main component 3>
```
