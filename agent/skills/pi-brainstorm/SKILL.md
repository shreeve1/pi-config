---
name: pi-brainstorm
description: Use when the user wants to brainstorm, explore ideas, compare directions, think creatively, or generate options before committing to implementation. Trigger on requests like brainstorm, ideate, what if, how might we, explore approaches, help me think through, or when the user wants research-backed idea generation instead of immediate execution.
---

# Pi Brainstorm

Use this skill when the goal is collaborative idea generation and directional thinking, especially before committing to a build plan. Do not use it when the user already wants a concrete implementation plan or direct code changes; in those cases, finish the brainstorming quickly or hand off to planning.

---

## Phase 1 — Capture the Topic

Start by identifying the topic and any optional project path or project context already present in the conversation.

1. If the topic is missing or vague, use `ask_user` to get it.
2. If the user references a local project path, verify it exists with `bash`.
3. If you will save notes later, ensure `artifacts/brainstorming/` exists with `bash`.

Keep the setup light. The point is to create enough structure for a productive session, not to slow the conversation down.

## Phase 2 — Review Project Context When Helpful

If the user supplied a project path, or the current repository is clearly relevant, do a fast project review before brainstorming.

Use `bash` and `read` to understand:
- what the project does
- the stack and architecture
- notable strengths, constraints, and gaps
- where new ideas would fit naturally

Summarize the findings briefly before moving on. If there is no meaningful project context, skip this phase.

## Phase 3 — Clarify Intent Interactively

Before generating ideas, restate your current understanding in one or two sentences.

Then use `ask_user` to gather the minimum context needed to make the brainstorming useful. Prefer 1-2 short interactions over a long interview.

Good topics to clarify:
- what is driving the question
- what constraints matter most
- what success looks like
- whether the user wants broad exploration or practical next steps

Use `select` when a few common options fit. Use `input` or `editor` when the user needs room to explain nuance.

## Phase 4 — Propose Research Angles

Generate 3-5 distinct angles to explore. Make them:
- varied across technical, user, product, operational, or market perspectives
- specific enough to research
- shaped by the user's stated priorities

Present the angles and ask the user how to proceed with `ask_user`.

A good approval prompt is a `select` with options such as:
- proceed with all angles
- narrow to the top 3
- adjust the angles first

If the user wants changes, revise the angles and confirm again.

## Phase 5 — Research in Parallel When External Evidence Matters

If web research would materially improve the brainstorming session, use `subagent` in parallel to investigate the selected angles.

Each subagent should:
1. research one angle using `web_search` and `web_fetch`
2. return 3-5 concise insights
3. call out any surprising or contrarian findings

Use prompts like:

```text
Research this brainstorming angle for the topic "<topic>": <angle>.

Context:
<short context block>

Instructions:
1. Use web_search to find relevant sources.
2. Use web_fetch on the most relevant 2-3 results.
3. Return 3-5 concise insights.
4. Note any surprising or contrarian findings.
5. Keep the response compact and decision-oriented.
```

If the topic is mainly internal, speculative, or project-specific, skip web research and brainstorm directly.

## Phase 6 — Synthesize and Explore Ideas

Combine project context, user constraints, and any research into a short briefing:
- key themes
- notable insights
- tensions or trade-offs
- open questions

Then shift into collaborative ideation.

1. Seed the conversation with 2-4 promising directions.
2. Ask the user which direction resonates most using `ask_user` when a structured choice is helpful.
3. Build on their answer with alternatives, combinations, and "what if" variants.
4. Periodically synthesize what has emerged so the session stays coherent.

Keep the tone energetic and collaborative. The goal is exploration, not premature convergence.

## Phase 7 — Wrap Up and Capture Artifacts

When the user is ready to stop, summarize:
- the strongest ideas
- the most important trade-offs
- likely next steps

Ask whether they want the session saved. If yes:
1. create `artifacts/brainstorming/` if needed
2. write a markdown summary to `artifacts/brainstorming/brainstorm-<topic-slug>-<date>.md`

Suggested sections:
- Topic
- Context
- Key themes
- Candidate directions
- Recommended next steps

If the conversation naturally leads into execution, suggest the next skill or workflow, such as creating an implementation plan.

## Output Format

When saving a summary, use this structure:

```markdown
# Brainstorm: <topic>

## Context
<what prompted the session>

## Key Themes
- <theme>

## Candidate Directions
### <direction 1>
- benefits
- risks
- open questions

### <direction 2>
- benefits
- risks
- open questions

## Recommended Next Steps
- <next step>
```

## Report

After completing the skill's work, report:
- whether project review was performed
- whether research was performed
- the main ideas generated
- any file written and its path
- the best next step for the user
