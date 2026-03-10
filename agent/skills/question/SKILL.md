---
name: question
description: Answer questions about the current project by exploring the codebase, documentation, and configuration without making code changes. Use when the user asks where something lives, how a feature works, what the project structure looks like, or wants a read-only explanation grounded in files rather than implementation.
---

# Question

Use this skill for read-only project Q&A. It is for understanding and explanation, not implementation. If the user is asking for code changes, bug fixes, or a plan to modify behavior, answer conceptually and explain what would need to change instead of editing files.

---

## Phase 1 — Clarify the Question

Identify exactly what the user wants to understand:

- project structure
- where code lives
- how a feature works
- what configuration controls behavior
- what documentation already says

If the question is ambiguous, use `ask_user` to narrow the target before exploring.

## Phase 2 — Delegate Exploration

Use `subagent` in single mode with the `scout` agent to gather targeted, read-only findings.

Give the scout a task like:

```text
Investigate this project question in read-only mode:
<user question>

Search for relevant code, configuration, and documentation. Return exact file paths, line references when possible, and a concise explanation of how the relevant pieces fit together.
```

The scout should do the broad search first so your final answer is grounded in the actual codebase.

## Phase 3 — Verify and Read Sources

Review the scout output and verify key findings yourself.

Use:
- `bash` with `git ls-files` as a quick inventory or backup check when needed
- `bash` with `rg`, `find`, or `ls` to locate adjacent files or confirm patterns
- `read` to inspect the most relevant files the scout identified

Prefer reading the primary source files that directly support the answer. Do not modify files.

## Phase 4 — Synthesize the Answer

Answer the user directly and clearly.

Guidelines:
- lead with the answer, not the investigation process
- cite concrete evidence from files
- explain relationships between modules, config, and docs when that helps
- mention uncertainty plainly if the codebase does not fully answer the question
- if the user is really asking "how would I change this?", explain the likely approach conceptually without implementing it

## Response Format

Use this structure when it fits the question:

```markdown
## Answer
<direct answer to the user's question>

## Evidence
- `<path>:<line or line range>` — <why it supports the answer>
- `<path>:<line or line range>` — <why it supports the answer>

## Related Context
<nearby architecture, config, or docs that help orient the user>

## Conceptual Explanation
<only include when the user is asking how something would be changed or extended>
```

## Report

After completing the skill's work, give the user a concise, evidence-backed answer and note the key files you used.