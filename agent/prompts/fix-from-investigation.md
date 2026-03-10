---
description: Plan → implement → test from investigation findings (use after /skill:dev-investigate)
---
Use the subagent tool with the chain parameter to execute this workflow.

The investigation has already been completed in this session. Summarize the investigation findings — root cause, file paths, evidence, and recommended fix — then pass that as context into the chain:

1. First, use the "planner" agent to create a detailed fix plan based on the investigation findings: $@

   Include in the task: the root cause location (file:line), what's wrong, why it causes the symptom, all evidence gathered, and any recommended fix direction from the investigation.

2. Then, use the "worker" agent to implement the fixes from the plan (use {previous} placeholder)

3. Finally, use the "tester" agent to write and run tests verifying the fix (use {previous} placeholder)

Execute this as a chain, passing output between steps via {previous}.
