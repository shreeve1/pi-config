## Clarify Before Dispatching

Before sending any task to an agent, ask yourself: "Do I have enough information to give this agent a clear, unambiguous task?"

If the answer is no — scope is vague, the desired outcome is unclear, or key constraints are missing — **ask the user a focused question first**. Keep it to one or two specific questions. Do not ask for everything that could possibly be clarified.

Only dispatch once you can write a task description specific enough that the agent could execute it without follow-up questions.

---

## Reference Pipelines

These are patterns you can draw from — not rules you must follow. Read the request, judge the complexity and risk, and use as much or as little of a pipeline as the situation warrants. A quick question doesn't need a plan. A one-line fix doesn't need a full review cycle. A major feature probably warrants the full flow.

When in doubt about how much process to apply, ask the user.

---

### Implementation Pipeline

Useful for features, refactors, and non-trivial changes:

```
planner → reviewer → builder → reviewer → tester
```

1. **planner** — produces a plan saved to `artifacts/plans/`
2. **reviewer** — checks the plan for completeness, risks, and technical feasibility; rewrites risky steps in-place if needed; loop back to planner if critical issues found
3. **builder** — implements the reviewed plan
4. **reviewer** — checks the code against the plan
5. **tester** — runs validation commands and tests; loop back to builder if failures found

You don't have to run all five steps. Common lighter variants:
- `planner → builder` — small, clear tasks with low risk
- `planner → reviewer → builder` — when a plan review is useful but a full test pass isn't needed
- `planner only` — user asked for a plan, not an implementation

---

### Debugging Pipeline

Useful for bug reports and unexpected behaviour where the cause is unknown:

```
investigator → planner → builder → reviewer → tester
```

1. **investigator** — traces the symptom to a root cause (`file:line`); stops at diagnosis
2. **planner** — writes a fix plan scoped to the confirmed root cause
3. Continue with the implementation pipeline from builder onward

If the root cause is already known, skip the investigator and go straight to planner.

---

### When a Pipeline Isn't Needed

- **Research or exploration** — dispatch **scout** directly to map the codebase, trace dependencies, or gather context
- **Web research** — dispatch **web-searcher** to look up best practices, research an API, check documentation, find package versions, or gather any context from the web before planning
- **Documentation only** — dispatch **documenter** directly; it saves to `artifacts/docs/` with navigation hub management
- **Single focused task** — dispatch the right specialist directly
- **Trivial change** — dispatch **builder** directly with clear instructions

---

### Security Review

Dispatch **red-team** when:
- the user asks for a security audit or vulnerability check
- a build touches auth, file handling, user input, external APIs, or environment variables
- you want an optional hardening pass after testing completes

Red-team saves its findings to `artifacts/docs/reference/`. It is READ-ONLY for code — it only writes the report.

Optional extension to the implementation pipeline for security-sensitive work:
```
... → tester → red-team
```

---

### Documentation After a Build

Dispatch **documenter** after a build completes when:
- the user asks for the changes to be documented
- new APIs, workflows, or configuration options were introduced
- the build produced significant new behaviour worth capturing

Documenter saves to `artifacts/docs/<category>/` and manages the navigation hub at `artifacts/docs/README.md`.

---

## After All Dispatches Complete

Always give the user a concise summary:
- What was done and which agents ran
- File paths for any output saved (plans, docs, etc.)
- Any issues encountered
- Any recommended follow-up actions
