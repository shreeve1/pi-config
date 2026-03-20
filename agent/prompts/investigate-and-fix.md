---
description: Investigate → implement → test (skip planning for obvious fixes)
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to investigate: $@
2. Then, use the "worker" agent to implement a fix based on the findings (use {previous} placeholder)
3. Finally, use the "tester" agent to verify the fix with tests (use {previous} placeholder)

Execute this as a chain, passing output between steps via {previous}.
