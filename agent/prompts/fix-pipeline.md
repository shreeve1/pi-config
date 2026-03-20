---
description: Full fix pipeline — investigate → plan → implement → test
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to investigate and gather all context about: $@
2. Then, use the "planner" agent to create a fix plan based on the investigation from the previous step (use {previous} placeholder)
3. Then, use the "worker" agent to implement the fixes from the plan (use {previous} placeholder)
4. Finally, use the "tester" agent to write and run tests verifying the fix (use {previous} placeholder)

Execute this as a chain, passing output between steps via {previous}.
