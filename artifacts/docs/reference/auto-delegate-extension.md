# Auto-Delegate Extension

Pi's auto-delegate extension automatically routes user prompts to appropriate subagents based on detected intent signals. It uses a two-layer approach: a static routing guide injected into the system prompt, plus dynamic per-prompt hints when high-confidence delegation signals are detected.

## Overview

The extension enables Pi to proactively delegate tasks to specialized subagents without requiring users to manually invoke `/skill:agent`. When you type "search for the latest React hooks", the extension detects the research intent and nudges Pi's LLM to use the `web-searcher` subagent.

**Key features:**
- **No explicit syntax** — Hints are invisible; you type naturally
- **LLM stays in control** — Hints are suggestions, not directives; the model can ignore them
- **High-confidence patterns only** — Matches 5 signal categories with carefully chosen regex patterns
- **Interactive mode only** — Hints are only applied when Pi has UI; non-interactive/JSON mode is unaffected
- **Toggleable** — Use `/delegate on|off` to enable/disable hints per session

## Architecture

### Layer 1: System Prompt Routing Guide

On every turn, the `before_agent_start` event injects a routing guide into the system prompt. This guide teaches the LLM:

- Which agent categories exist (web-searcher, explorer/scout, reviewer, worker, designer agents)
- What kinds of tasks map to which agents
- How to invoke the `subagent` tool in single, parallel, and chain modes
- When and why to delegate

The guide is persistent across the entire session, so the LLM has a consistent reference.

### Layer 2: Per-Prompt Intent Hints

The `input` event handler runs pattern matching against the user's prompt. When a high-confidence signal is detected, a one-line hint is prepended:

```
[Route hint: web research — consider delegating to web-searcher subagent]

<original prompt>
```

The hint is non-intrusive — it doesn't modify the user's actual request, just nudges Pi toward the right agent.

## Intent Signal Categories

Five categories of signals trigger routing hints:

| Category | Signals | Delegated Agent | Example Hint |
|----------|---------|-----------------|--------------|
| **Web Research** | "search", "look up", "latest", "what is", "how does X work", "docs for", "news about" | `web-searcher` | "[Route hint: web research — consider delegating to web-searcher subagent]" |
| **Codebase Exploration** | "explore", "scout", "what files", "find where", "how is X structured" | `explorer` or `scout` | "[Route hint: codebase recon — consider delegating to explorer or scout subagent]" |
| **Code Review/Audit** | "review", "audit", "check for issues", "security", "code quality" | `reviewer` | "[Route hint: review task — consider delegating to reviewer subagent]" |
| **Design/UI** | "design UI", "UI component", "landing page", "styling" | designer agents | "[Route hint: design task — consider delegating to a designer subagent (brutalist, minimalist, material, etc.)]" |
| **Parallel Work** | "parallel", "at the same time", "simultaneously", "multiple research" | subagent parallel mode | "[Route hint: parallel work — consider using subagent parallel mode with tasks array]" |

## Commands

### `/delegate` (toggle)

Toggle hints on and off with a status notification:

```
/delegate
```

Shows: `Auto-delegate hints enabled` or `Auto-delegate hints disabled`

### `/delegate on`

Enable hints for this session:

```
/delegate on
```

Shows: `Auto-delegate hints enabled`

### `/delegate off`

Disable hints for this session:

```
/delegate off
```

Shows: `Auto-delegate hints disabled`

**Note:** Hints are enabled by default on session start. The toggle resets to `true` on each Pi restart.

## Usage Examples

### Example 1: Web Research

**You type:**
```
what's the latest on React 19 features
```

**Extension detects:** "latest" matches web research pattern

**Hint prepended to LLM:**
```
[Route hint: web research — consider delegating to web-searcher subagent]

what's the latest on React 19 features
```

**LLM behavior:** Recognizes research intent, calls `subagent({ agent: "web-searcher", task: "Research latest React 19 features" })`

### Example 2: Codebase Exploration

**You type:**
```
explore the directory structure and show me where auth is handled
```

**Extension detects:** "explore" + "where" matches codebase exploration pattern

**Hint prepended:**
```
[Route hint: codebase recon — consider delegating to explorer or scout subagent]

explore the directory structure and show me where auth is handled
```

**LLM behavior:** Delegates to `explorer` or `scout` subagent for structured exploration

### Example 3: No Match (No Hint)

**You type:**
```
fix the bug in the login form where validation isn't working
```

**Extension detects:** No high-confidence signal matches

**No hint prepended** — prompt goes directly to LLM

**LLM behavior:** Works on the bug directly; may or may not delegate to `worker` agent depending on its own judgment

### Example 4: Disable Hints

**You type:**
```
/delegate off
```

Extension responds: `Auto-delegate hints disabled`

**Subsequent prompts:** No hints are prepended, even if they match signal patterns

**You type:**
```
search for recent ML papers on attention mechanisms
```

**No hint prepended** — "search" signal is ignored because hints are disabled

## Implementation Details

**File:** `~/.pi/agent/extensions/auto-delegate.ts`

**Lifecycle events used:**
- `before_agent_start` — Inject routing guide into system prompt
- `input` — Pattern-match and prepend hints
- `registerCommand` — Register `/delegate` command

**Hint injection logic:**
```typescript
if (!hintsEnabled) return;  // Disabled
if (!ctx.hasUI) return;      // Non-interactive mode
const hint = detectDelegationHint(event.text);
if (hint) {
  return { action: "transform", text: hint + "\n\n" + event.text };
}
```

**Pattern matching:**
Each routing pattern is an array of RegExp objects. A single match in any pattern for a category triggers the hint for that category.

Example pattern entry:
```typescript
{
  patterns: [
    /\bsearch\b/i,
    /\blook up\b/i,
    /\bfind online\b/i,
    /\blatest\b/i,
  ],
  hint: "[Route hint: web research — consider delegating to web-searcher subagent]"
}
```

## Design Rationale

### Why two layers?

- **System prompt** (persistent, passive) — Educates the LLM once about all routing options; applies globally to every turn
- **Input hint** (per-prompt, active) — Provides immediate context-aware nudging for high-confidence signals

The system prompt alone is passive; the LLM might forget or deprioritize it. The input hint is an active signal for this specific turn.

### Why not mandatory routing?

The extension uses hints + guidance rather than intercepting and forcing subagent calls. This keeps the LLM in full control. For example, if a prompt has mixed intent (both research and implementation), the LLM might choose to do both in sequence rather than just delegate one. Mandatory routing removes that flexibility.

### Why only high-confidence signals?

Regex-based intent detection has false positives. For example, "review this code" triggers the review hint, but "review my implementation plan" might not need a reviewer agent. By limiting hints to high-confidence patterns, we avoid wasting time on routing decisions that the LLM would get wrong anyway.

### Why disable in non-interactive mode?

Pi can run in non-interactive mode (e.g., piping JSON input). Adding hints would pollute the actual user input in those contexts. The check `if (!ctx.hasUI) return` ensures hints only apply in interactive terminal sessions.

## Interacting with Subagents

When the LLM receives a routing hint and decides to delegate, it uses the `subagent` tool. Three modes are available:

### Single Delegation

```typescript
subagent({ agent: "web-searcher", task: "Find recent news on AI safety" })
```

### Parallel Delegations

For independent research angles or implementation subtasks:

```typescript
subagent({
  tasks: [
    { agent: "web-searcher", task: "Latest on transformer efficiency" },
    { agent: "web-searcher", task: "Recent RLHF advances" },
    { agent: "web-searcher", task: "New quantization techniques" }
  ]
})
```

### Chained Delegations

When output from one agent feeds into another:

```typescript
subagent({
  chain: [
    { agent: "scout", task: "Find authentication implementation in codebase" },
    { agent: "worker", task: "Based on: {previous}\n\nRefactor to use JWT tokens" }
  ]
})
```

See [Extensions Guide](extensions-guide.md) for more details on the subagent tool.

## Related Documentation

- [Extensions Guide](extensions-guide.md) — How to build and load custom extensions
- [Skills](skills.md) — Self-contained capability packages like `/skill:agent` and `/skill:brainstorm`
