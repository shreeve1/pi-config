---
description: Investigate → plan only (no implementation, for review before committing)
---
Use the subagent tool with the chain parameter to execute this workflow:

1. First, use the "scout" agent to investigate and gather all context about: $@
2. Then, use the "planner" agent to create a detailed implementation plan based on the investigation (use {previous} placeholder)

Execute this as a chain, passing output between steps via {previous}. Do NOT implement — just return the plan for review.
