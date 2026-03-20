---
name: pi-interview
description: Interview you about your project plans, goals, and ideas using context from project docs and the codebase. Ask in-depth questions about technical implementation, concerns, tradeoffs, and requirements.
---

# Interview Skill

Conduct a thorough interview about the user's project plans, ideas, or goals. Use context from the project's `CLAUDE.md` or `README.md` (if available) and the current codebase to ask relevant, non-obvious questions. Do not use this skill for casual conversation or simple Q&A — only invoke it when the user explicitly asks to be interviewed.

---

## Phase 1 — Context Gathering

Before asking the first question:

1. Use `Bash` to check if `CLAUDE.md` or `README.md` exist in the current directory:
   ```
   ls CLAUDE.md README.md 2>/dev/null
   ```

2. Read any that exist using `Read`. Extract: project type, architecture, constraints, existing services, known risks.

3. If the user specified a topic (e.g., "interview me about adding auth"), note it as the interview scope. Otherwise treat it as a general project interview.

4. Use `Bash` to explore project structure lightly (e.g., `find . -maxdepth 2 -name "*.md" | head -20`) to identify additional context files if CLAUDE.md is absent.

---

## Phase 2 — Interview

Ask questions one at a time using `ask_user` with `type: "input"`. Do not batch multiple questions together.

**Question strategy — avoid obvious questions like:**
- "What language will you use?"
- "How many users do you expect?"
- "What's the timeline?"

**Instead ask probing questions like:**
- "How will you handle [specific failure mode] given [observed constraint]?"
- "What's your rollback strategy if [change] introduces a regression?"
- "What happens if [assumption] turns out to be wrong?"
- "Have you considered the security implications of [design choice]?"
- "How will you test [complex scenario] in a way that gives you confidence?"

**Question categories to rotate through (based on relevance):**
- Technical implementation: architecture, data flow, error handling, edge cases
- Operational: deployment, rollback, monitoring, scaling
- Security: attack surface, secrets management, audit trails
- Testing & validation: how will you know it works?
- Business tradeoffs: cost, complexity, maintainability

**Interview patterns to apply:**
- **Five Whys**: keep drilling into reasoning behind decisions
- **Premortem**: "Pretend this failed in production — what likely went wrong?"
- **Constraint challenge**: "What if you couldn't use X? How would you solve it?"
- **Edge case hunt**: "What happens when [unexpected input] occurs?"
- **Alternative challenge**: "Why not [different approach]? What's wrong with it?"

Continue until:
- The user says "that's enough", "we're done", or similar
- All major relevant topics have been covered
- The user indicates they need to go implement before planning further

---

## Phase 3 — Summary

Once the interview ends, output a structured summary:

```markdown
## Interview Summary

### Topic
[What was discussed]

### Key Discussion Points
- [Point 1]
- [Point 2]

### Decisions Made
- [Decision 1]

### Concerns & Risks Identified
- [Concern 1]

### Action Items / Follow-up
- [ ] [Action 1]

### Open Questions to Revisit
- [Question 1]
```

---

## Report

After delivering the summary, confirm:
- How many questions were asked
- Which topic areas were covered
- Whether any critical gaps remain unaddressed
