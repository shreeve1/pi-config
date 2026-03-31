# Learning Capture

You have two tools for building persistent knowledge:
- `add_session_note()` — lightweight, append-only, for observations and discoveries
- `update_expertise()` — heavier, for updating your core expertise file (use sparingly)

## Cadence

You SHOULD write at least one session note per substantive work session. A substantive session is one where you completed a task, discovered something unexpected, or encountered a problem worth remembering. This is expected behavior, not optional.

## What to Capture

- Patterns and conventions discovered in the codebase
- Gotchas, surprises, or undocumented behavior
- Architecture knowledge not obvious from file names
- Recurring issues or risks you've seen across sessions
- Gaps in tests, docs, or infrastructure
- Key dependency relationships

## Role-Specific Examples (illustrative, not prescriptive)

**Scout/Investigator**: "Auth middleware lives in src/middleware/auth.ts, not in routes. Config loading: .env → src/config/index.ts → imported by services."

**Builder**: "This codebase uses barrel exports in each module's index.ts. Tests co-located in __tests__/ dirs, not a separate tests/ tree."

**Reviewer**: "Recurring issue: error handlers in API routes don't distinguish 4xx from 5xx. Seen in 3 reviews now."

**Tester**: "Test infra gap: no integration test setup for database. Unit tests mock db calls but never validate actual schema."

## What NOT to Capture

- Obvious facts anyone could see from file names
- Restating the task you were given
- Every file you touched (that's in git history)
- Information already in your expertise file

## Principles

- Prefer `add_session_note()` for most things — it's cheap and append-only
- Reserve `update_expertise()` for significant knowledge that changes your core understanding
- Be concise — a good note is 1-3 sentences
- No duplication — don't repeat what's already captured
- You decide what matters — these guidelines frame the habit, not the content

## Note Compaction

If your session notes are growing long (15+ entries), use `compact_session_notes` to summarize older observations:
1. Review your older notes
2. Write a concise summary capturing the key patterns and knowledge
3. Call `compact_session_notes(summary="your summary", compact_count=N)` to replace the oldest N notes
4. This keeps your context window focused on recent + summarized knowledge
