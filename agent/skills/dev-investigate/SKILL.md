---
name: dev-investigate
description: Use when debugging unclear bugs, unexpected behavior, missing root causes, or when you need to find where a symptom originates in code before proposing a fix.
---

# Dev Investigate

Use this skill to diagnose a problem before proposing or implementing a fix. It fits cases where the symptom is real but the cause is unclear, the relevant code path is unknown, or a quick search would likely produce guesses instead of evidence. Do not use it when the root cause is already known and the task is straightforward implementation.

---

## Phase 1: Understand the Problem

Extract the current facts from the user's report and any provided logs, traces, screenshots, or code.

Capture:
- **Observed behavior**: What is actually happening?
- **Expected behavior**: What should happen instead?
- **Context**: Where does this occur? Which environment, feature, or workflow?
- **Evidence**: Errors, logs, stack traces, failing outputs, timings, or regressions
- **Unknowns**: What key facts are still missing?

Write a brief summary of your current understanding in 1-3 sentences. Be explicit about assumptions so they can be tested rather than silently carried forward.

---

## Phase 2: Resolve Ambiguity

If important facts are still unclear, use `ask_user` to clarify only the details that affect investigation direction.

Good questions include:
- "To confirm: you're seeing [X] when you expect [Y], correct?"
- "Is this happening in production, locally, or both?"
- "When did this start?"
- "Do you have an error message, stack trace, or failing example?"
- "What have you already tried?"

If the report is already concrete enough to investigate, do not block on questions. Proceed, but state your assumptions clearly.

If new information changes the shape of the problem, update the summary and loop back through Phase 1.

---

## Phase 3: Locate the Relevant Code Path

Search for where the symptom could originate. Use direct investigation yourself, and use `subagent` with `worker` when a focused parallel search would help.

A good search pass usually includes:
1. Use `bash` with `rg`, `grep`, `find`, or project-specific commands to locate relevant code
2. Use `read` to inspect likely files
3. Trace control flow and data flow
4. Record findings with file:line references

When delegating, give the subagent a narrowly scoped question, for example:
- "Find where this error string is produced and trace the caller path."
- "Locate where this request field is populated and validated."
- "Find the component or service responsible for this UI state."

Document:
- relevant file paths and line numbers
- important functions, handlers, components, or queries
- how the code path connects to the reported symptom

---

## Phase 4: Verify the Suspected Location

Before calling something the root cause, verify that the suspected location actually matches the reported behavior.

Check:
- Is this code path reachable in the user's scenario?
- Does it run in the relevant environment or mode?
- Can you trace a believable path from this code to the symptom?
- Does the timing, state, or data shape line up with the evidence?

Prefer technical verification first:
- follow call chains
- inspect related conditions and guards
- compare inputs and outputs
- match logs or error messages to code

Use `ask_user` only if product context, runtime conditions, or reproduction details are still missing.

If the suspected location does not hold up, update your understanding and loop back.

---

## Phase 5: Confirm Root Cause

Treat the investigation as complete only when you can answer all three:

- **Where is it?** Identify the file and line or the narrowest responsible code region.
- **What is wrong?** State the specific defect, mismatch, omission, or incorrect assumption.
- **Why does it cause the symptom?** Explain the causal chain from code to observed behavior.

The root cause is **not confirmed** if:
- several explanations are still plausible
- the code path cannot be tied back to the symptom
- the explanation depends on assumptions you have not verified
- you only found "suspicious" code but cannot explain the failure mechanism

If root cause is not confirmed, continue the loop with updated information.

---

## Phase 6: Stop at Diagnosis

This skill is for investigation. Do not edit code or implement a fix unless the user asks for that next step.

You may suggest a likely fix direction, but keep it brief and separate from the diagnosis.

---

## Output Format

When the investigation is complete, report:

```markdown
## Investigation Complete

### Problem Summary
<1-2 sentence description of the issue>

### Root Cause
**Where:** `<file_path>:<line_number>`
**What:** <specific issue>
**Why:** <causal explanation linking code to symptom>

### Evidence
- <finding with file:line reference>
- <finding with file:line reference>
- <finding with file:line reference, if applicable>

### Code Context
<minimal snippet or description with file path and line numbers showing the issue>

### Recommended Fix
<optional: short suggestion only if helpful>

---
Investigation iterations: <N>
Subagent calls: <N>
Assumptions confirmed: <list or "none">
```

Keep the evidence concrete. Prefer exact file:line references over broad summaries.

---

## Validation Checklist

The investigation is complete only when:
- [ ] Root cause location identified with file:line
- [ ] Specific defect described clearly
- [ ] Causal chain explained from code to symptom
- [ ] Evidence cited with concrete references
- [ ] Findings are technically verified or assumptions are clearly labeled
- [ ] User context is accounted for if it materially affects the diagnosis

---

## Report

After completing the investigation, provide a concise summary:

```text
✅ Investigation Complete

Problem: <brief description>
Root Cause: <file:line>
Iterations: <N>

Key Findings:
- <finding 1>
- <finding 2>

Next Step:
- <brief fix direction, or "Root cause identified; ready to implement if requested">
```
