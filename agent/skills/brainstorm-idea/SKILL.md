---
name: brainstorm-idea
description: Explore a raw idea creatively with light project context, optional web research, and collaborative generative discussion. Use when the user wants to riff on an idea, expand possibilities, make unexpected connections, or see where a concept could go before turning it into a plan or implementation.
---

# Brainstorm Idea

Use this skill for exploratory, idea-generating conversations where the goal is discovery rather than commitment. Prefer it when the user says things like "help me brainstorm," "I have an idea," "riff on this," "what could this become," or "explore possibilities." Do not use it when the user already wants a concrete implementation plan, code changes, or strict requirements gathering.

---

## Phase 1 — Capture the Idea

Start by identifying the core idea and any optional local project path or project context already present in the conversation.

1. If the idea is missing or too vague, use `ask_user` to get it.
2. If the user supplied a project path, verify it with `bash` before relying on it.
3. Keep this phase short. The goal is to anchor the exploration without turning it into a formal intake process.

If the user does not provide a project path, continue without one.

## Phase 2 — Gather Lightweight Context

If a project path or clearly relevant repository context exists, do a quick review with `bash` and `read`.

Look for:
- what the project does
- the stack and architecture
- notable patterns, gaps, or constraints
- areas where the idea might connect naturally

Summarize only the parts that help the brainstorming session. This phase provides a frame of reference; it is not a design review and not a solutioning exercise.

## Phase 3 — Go Deeper Through Conversation

Before generating ideas, restate the idea in one or two sentences so the user can correct your framing.

Then use `ask_user` to deepen the conversation. Ask only the minimum needed to unlock useful exploration.

Useful topics:
- what sparked the idea
- what feels exciting or unresolved about it
- whether the user wants wild exploration, practical directions, or a mix
- any constraints or themes they already care about

Prefer one focused question at a time. Use `select` when a few clear modes fit, for example:
- broad creative exploration
- practical product directions
- technical concept exploration
- surprising cross-domain ideas

If the user wants a deeper interview, you may read and apply the `pi-interview` skill before continuing.

## Phase 4 — Choose Research Directions

Turn what you learned into 3-5 promising angles to explore. These should be distinct and generative, not minor wording variations.

Good angles often include a mix of:
- product or user experience directions
- technical or systems angles
- workflow or operational ideas
- adjacent-domain analogies
- contrarian or unexpected framings

Present the angles briefly and ask the user how to proceed with `ask_user`.

Suggested options:
- explore all angles
- focus on the top 2-3
- revise the angles first
- skip research and riff directly

## Phase 5 — Research When It Will Add Energy or Insight

If external evidence would improve the session, use `subagent` in parallel to research selected angles. Skip this phase when the topic is mostly personal, speculative, or highly project-specific.

Each subagent should:
1. research one angle with `web_search`
2. read the most relevant 2-3 sources with `web_fetch`
3. return 3-5 concise insights
4. highlight anything surprising, novel, or contrarian

Use compact prompts like:

```text
Research this brainstorming angle for the idea "<idea>": <angle>.

Context:
<short context block>

Instructions:
1. Use web_search to find relevant sources.
2. Use web_fetch on the most relevant 2-3 results.
3. Return 3-5 concise insights.
4. Note any surprising or contrarian findings.
5. Keep the response compact and idea-generative.
```

Synthesize the findings into a short briefing before moving on.

## Phase 6 — Riff Collaboratively

This is the core of the skill. Use the context, conversation, and any research to generate momentum.

1. Seed the discussion with 2-4 interesting directions.
2. Build on what the user responds to instead of forcing a rigid structure.
3. Make connections across domains, patterns, audiences, or technologies.
4. Offer alternatives, combinations, and "what if" variants.
5. Periodically summarize emerging themes so the conversation stays coherent.

Keep the tone energetic, curious, and collaborative. Short bursts of ideas usually work better than long polished essays.

Examples of useful moves:
- "What if this worked more like <other domain pattern>?"
- "A more practical version would be..."
- "A weirder but interesting direction is..."
- "These two threads could combine into..."

If one direction clearly becomes implementation-oriented, note it, but stay in exploration mode unless the user explicitly wants to switch.

## Phase 7 — Capture the Session

When the session naturally winds down, summarize:
- the core concept
- the most interesting directions explored
- important connections or tensions
- the most promising next moves
- open questions worth revisiting

Ask whether the user wants the session saved. If yes:
1. ensure `artifacts/brainstorming/` exists with `bash`
2. write a markdown summary to `artifacts/brainstorming/idea-<topic-slug>-<date>.md`

Use a concise slug and ISO date.

## Output Format

When saving a summary, use this structure:

```markdown
# Idea Exploration: <idea>

## Context
<project context or "No project context provided">

## What Sparked This
<brief description>

## Research Findings
- <finding>

## Ideas Explored
### <direction 1>
- why it is interesting
- risks or tensions
- possible extension

### <direction 2>
- why it is interesting
- risks or tensions
- possible extension

## Connections Made
- <unexpected connection>

## Promising Next Steps
- <next step>

## Open Questions
- <question>
```

## Report

After completing the skill's work, report:
- the idea explored
- whether project context was reviewed
- whether web research was performed
- the strongest directions that emerged
- any file written and its path
- the most natural next step, if any
