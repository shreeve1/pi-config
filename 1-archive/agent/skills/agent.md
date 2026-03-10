---
name: agent
description: Generic subagent dispatcher supporting single, parallel, chain, and list modes. Invoke any available agent with flexible invocation patterns.
argument-hint: "[mode] [agent:task pairs or agent \"task\"]"
---

# Agent — Subagent Dispatcher

A generic command for invoking subagents in different modes. This skill parses user input and translates it into `subagent` tool calls.

## Variables

INPUT: $ARGUMENTS — The user's full input after `/agent`

## Modes

### Single Mode
Invoke one agent with one task.

**Input patterns:**
```
/agent explorer "scout the src/ directory for API endpoints"
/agent scout check test coverage in this project
/agent brutalist create a landing page for my app
```

**Action:** Call the `subagent` tool with:
```json
{ "agent": "<agent-name>", "task": "<the task description>" }
```

Parse the agent name as the first word after `/agent`. Everything after the agent name is the task (quotes are optional).

### Parallel Mode
Run multiple agents simultaneously.

**Input patterns:**
```
/agent parallel explorer:"find API routes" web-searcher:"latest Express.js docs" scout:"check test coverage"
/agent parallel brutalist:"create hero section" minimalist:"create hero section" organic:"create hero section"
```

**Action:** Call the `subagent` tool with:
```json
{
  "tasks": [
    { "agent": "explorer", "task": "find API routes" },
    { "agent": "web-searcher", "task": "latest Express.js docs" },
    { "agent": "scout", "task": "check test coverage" }
  ]
}
```

Parse each `agent:"task"` or `agent:"task"` pair. Maximum 8 parallel tasks (4 concurrent — enforced by the extension).

### Chain Mode
Run agents sequentially, piping output from one to the next.

**Input patterns:**
```
/agent chain scout:"find auth files" -> worker:"refactor auth based on: {previous}"
/agent chain explorer:"find all API endpoints" -> reviewer:"review these endpoints for security issues: {previous}"
```

**Action:** Call the `subagent` tool with:
```json
{
  "chain": [
    { "agent": "scout", "task": "find auth files" },
    { "agent": "worker", "task": "refactor auth based on: {previous}" }
  ]
}
```

Parse steps separated by `->`. The `{previous}` placeholder is automatically replaced with the prior agent's output by the extension.

### List Mode
Show all available agents.

**Input patterns:**
```
/agent list
/agent agents
/agent help
```

**Action:** Call the `subagent` tool with:
```json
{ "agent": "list-all", "task": "list available agents" }
```

This triggers the error path which lists all available agents with their names and sources. Present the results as a formatted list showing:
- Agent name
- Source (user/project)
- Description (from the agent's frontmatter)

## Parsing Rules

1. **First word determines mode**: If it's `parallel`, `chain`, `list`, `agents`, or `help`, use that mode. Otherwise, it's single mode.
2. **Single mode**: First word is agent name, rest is the task.
3. **Parallel mode**: Parse `agent:"task"` or `agent:"task"` pairs separated by spaces.
4. **Chain mode**: Parse `agent:"task"` pairs separated by `->`.
5. **Quotes are flexible**: Both `agent:"task"` and `agent:"task"` work. Unquoted text after the agent name in single mode is also valid.

## Error Handling

- If the agent name doesn't match any available agent, the subagent tool will return the list of available agents. Present this list to the user.
- If parallel mode has more than 8 tasks, inform the user of the limit.
- If the input is ambiguous, ask the user to clarify.

## Examples

```
# Single agent
/agent explorer scout this project structure
/agent web-searcher latest React documentation for hooks

# Parallel - compare design approaches
/agent parallel brutalist:"create a signup form" minimalist:"create a signup form" material:"create a signup form"

# Chain - scout then act
/agent chain scout:"find all TODO comments" -> worker:"create issues from these TODOs: {previous}"

# Chain - research then summarize
/agent chain web-searcher:"find latest news about AI agents" -> reviewer:"summarize and critique: {previous}"

# List available agents
/agent list
```
