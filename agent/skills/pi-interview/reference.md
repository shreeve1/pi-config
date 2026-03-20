# Interview Skill Reference

## Implementation Guidelines

### 1. Context Gathering Phase

Before starting the interview:

1. **Read CLAUDE.md** (if it exists) — use `Read` to get project context, architecture, constraints
2. **Explore the codebase** — use `Bash` with `find`, `ls`, or `grep`/`rg` to understand structure
3. **Identify scope** — general project, specific feature, architecture decision, or pre-mortem

### 2. Question Generation Strategy

**Avoid** obvious questions like:
- "What programming language will you use?"
- "What framework are you using?"
- "How many users do you expect?"
- "What's the timeline?"

**Ask** probing questions like:
- "How will you handle [failure mode]?"
- "What's your strategy for [edge case]?"
- "What happens if [assumption] is wrong?"
- "How does this approach handle [constraint]?"
- "What are the tradeoffs between [option A] and [option B]?"
- "Have you considered [non-obvious implication]?"
- "How will you test [complex scenario]?"
- "What's your rollback strategy if [change] fails?"

### 3. Question Categories

#### Technical Implementation
- Architecture patterns and design choices
- Technology selection and tradeoffs
- Integration points and dependencies
- Data flow and state management
- Error handling and edge cases

#### Operational Concerns
- Deployment and rollback strategies
- Monitoring and observability
- Performance under load
- Resource utilization and scaling

#### Security & Reliability
- Security implications of design choices
- Attack surface considerations
- Data protection and privacy
- Failure modes and recovery

#### User Experience
- Edge cases in user workflows
- Performance perceptions
- Error messages and handling

#### Testing & Validation
- How to test complex scenarios
- Integration testing strategy
- Performance testing approach

#### Business & Requirements
- Alignment with project goals
- Cost implications
- Priority tradeoffs
- Success metrics

### 4. Using ask_user

```json
{
  "type": "input",
  "question": "How will you handle connection failures when the API is under heavy load?"
}
```

Or with options for structured choices:
```json
{
  "type": "select",
  "question": "Which area should we explore next?",
  "options": ["Security", "Scalability", "Testing", "We're done"]
}
```

**Best practices:**
- Ask one question at a time
- Follow up on answers with deeper questions
- Provide options when you want structured responses
- Acknowledge good insights before moving on

### 5. Interview Flow

```
START
  ↓
Read CLAUDE.md & explore codebase
  ↓
Identify interview scope
  ↓
Ask first question (ask_user)
  ↓
Process answer → follow-up or next topic
  ↓
Continue until comprehensive coverage
  ↓
User signals completion or no more questions
  ↓
Generate summary
  ↓
END
```

### 6. Completion Signals

Stop the interview when:
- User says "that's enough", "we're done", "good enough"
- All major topics have been covered
- User indicates they need to implement before planning more

### 7. Summary Format

```markdown
## Interview Summary

### Topic: [What we discussed]

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

## Common Interview Patterns

### The "Five Whys" Approach
Keep asking "why?" to dig deeper into the reasoning behind decisions.

### The "Premortem" Approach
"Pretend this has failed in production. What likely went wrong?"

### The "Constraint" Challenge
"What if you couldn't use [technology X]? How would you solve it?"

### The "Edge Case" Hunt
"What happens when [unexpected input/condition] occurs?"

### The "Alternative" Challenge
"Why not [completely different approach]? What's wrong with that?"
