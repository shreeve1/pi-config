---
name: brainstorm-pi
description: Interactive brainstorming with project review and parallel research via subagents. Combines codebase understanding with web research to generate high-quality ideas.
argument-hint: "[topic] [optional-project-path]"
---

# Brainstorm

An interactive brainstorming session that combines project understanding with parallel web research to generate high-quality ideas. Uses Pi's subagent system for parallel research.

## Variables

TOPIC: $1 — The brainstorming topic or question to explore
PROJECT_PATH: $2 — Optional path to a local project to review for context

## Instructions

### Phase 1: Project Review (if PROJECT_PATH provided)

If the user provided a project path, use the `subagent` tool with the `scout` agent to explore the codebase:

```
Use the subagent tool:
{ "agent": "scout", "task": "Explore the project at [PROJECT_PATH]. Report on: architecture and structure, technical stack, pain points and gaps, opportunities and strengths." }
```

Summarize the scout's findings in a brief overview covering:
- What the project does
- Key architectural decisions
- Notable patterns or approaches
- Areas that could benefit from improvement

If no project path provided, skip to Phase 2.

### Phase 2: Understand the User's Question

Before generating research angles, clarify the user's intent interactively.

1. **Restate understanding**: "Based on your topic, it sounds like you want to explore [interpretation]."

2. **Ask clarifying questions** naturally in conversation:
   - What's driving this question? (Solving a problem, exploring an opportunity, general curiosity, planning something new?)
   - What constraints matter most? (Time, budget, technical complexity, team size?)
   - What does success look like? (Working prototype, strategic direction, list of options, implementation plan?)

3. Adapt follow-up questions based on responses. Keep this brief — gather enough context to make research targeted, then move on.

### Phase 3: Generate Research Angles

Based on TOPIC, project context, AND clarified user intent, generate 5 distinct research angles. These should be:

- **Diverse**: Cover different perspectives (technical, user, market, innovation, best practices)
- **Specific**: Focused enough to yield actionable insights
- **Relevant**: Directly tied to the brainstorming topic AND user's stated priorities
- **Informed**: Shaped by what you learned in Phases 1 and 2

Present the 5 angles to the user and ask for approval:
- "I've identified these 5 research angles. How should I proceed?"
- Options: Proceed as-is, adjust some angles, add a specific angle, reduce to 3 most important

If the user wants changes, adjust and confirm before proceeding.

### Phase 4: Parallel Research

Use the `subagent` tool with `tasks` array mode to spawn parallel web-searcher agents:

```
Use the subagent tool with parallel mode:
{
  "tasks": [
    { "agent": "web-searcher", "task": "Research angle 1 for a brainstorming session about [TOPIC]: [angle description]. Context: [brief context]. Find relevant information, synthesize into 3-5 key insights, note surprising or contrarian findings. Return as: ## [Angle Name]\n- Insight 1\n- Insight 2\n- Insight 3\n**Surprising finding:** [if any]" },
    { "agent": "web-searcher", "task": "Research angle 2 for a brainstorming session about [TOPIC]: [angle description]. ..." },
    { "agent": "web-searcher", "task": "Research angle 3 ..." },
    { "agent": "web-searcher", "task": "Research angle 4 ..." },
    { "agent": "web-searcher", "task": "Research angle 5 ..." }
  ]
}
```

**Important**: Launch all research agents in a single subagent call using the `tasks` array for maximum parallelism. The extension handles up to 8 parallel tasks with 4 concurrent.

### Phase 5: Synthesize Research

Once all agents complete, consolidate findings into a unified briefing:

```
## Research Briefing: [TOPIC]

### Key Themes
- [Theme 1 across multiple angles]
- [Theme 2]
- [Theme 3]

### Notable Insights
- [Most actionable insight 1]
- [Most actionable insight 2]
- [Most actionable insight 3]

### Contrarian or Surprising Perspectives
- [Anything that challenges assumptions]

### Research Gaps
- [What we didn't find but might matter]
```

### Phase 6: Interactive Brainstorming

Engage in highly interactive, free-form exploration:

1. **Seed the conversation** with 2-3 initial ideas inspired by the research

2. **Ask structured questions** to guide exploration:
   - "Which direction resonates most with you?"
   - "What if we approached this from [angle]?"
   - "Does [insight] change how you think about this?"

3. **Build on user responses** — riff on their ideas, combine concepts, explore tangents

4. **Synthesize periodically**: "We've explored X, Y, Z — which direction should we dig deeper into?"

Maintain an energetic, collaborative tone. The goal is generative exploration, not convergence.

### Phase 7: Wrap-Up

When the user signals they're done:

1. **Summarize key ideas** that emerged

2. **Ask about saving preferences**:
   - Save full summary as markdown?
   - Extract action items only?
   - Both summary and action items?
   - No file needed?

3. If saving, create a markdown file:
   - Use bash to create directory: `mkdir -p artifacts/brainstorming`
   - Use write tool to save to: `artifacts/brainstorming/brainstorm-[topic-slug]-[date].md`
   - Content: Key ideas, themes explored, potential next steps, source URLs from research

## Interaction Guidelines

- **Be interactive**: Ask questions naturally — don't just output monologues
- **Be curious**: Ask follow-up questions, don't just accept surface answers
- **Be generative**: Offer multiple variations, "what about...", "or alternatively..."
- **Be flexible**: Follow interesting tangents, don't force structure
- **Be concise**: Keep individual responses focused, avoid walls of text
- **Be collaborative**: This is a dialogue, not a presentation
