# Todo Extension Enhancements — Design

**Date:** 2026-03-02  
**File:** `agent/extensions/todo.ts`  
**Approach:** Option A — minimal additive changes to existing two-tool design

---

## Goals

Adopt three ideas from the `tilldone` extension into the existing `todo.ts`:

1. **Auto-nudge** — Re-prompt the agent on `agent_end` if tasks remain incomplete
2. **Named lists** — `todo_write` supports `listTitle` and `listDescription` to give a task list context
3. **Richer footer UI** — Replace simple widget with a proper footer showing progress, counts, and task rows
4. **Dependency metadata** — `TodoItem` gains optional `dependsOn?: string[]` the LLM uses to plan parallel subagent work (no runtime enforcement)

---

## Data Model Changes

```ts
interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
  dependsOn?: string[];  // NEW — IDs of tasks that must complete before this one
}
```

`todo_write` gains two new optional top-level params:
- `listTitle?: string` — short name for the task list
- `listDescription?: string` — longer description of the list's theme/goal

Both are stored in module-level state alongside `todos` and persisted in `details` on tool results (enabling session reconstruction).

---

## Auto-Nudge

- Hook `agent_end` event
- If any tasks are not `completed`, call `pi.sendMessage` with a message listing incomplete tasks and prompting the agent to continue or mark them done
- Guard with a `nudgedThisCycle: boolean` flag (set on nudge, reset in the `input` event handler) to prevent infinite nudge loops

---

## Richer Footer UI

Replace `ctx.ui.setWidget` with `ctx.ui.setFooter`:

**Line 1:** `<listTitle or "Todos"> [done/total]` left-aligned · `✓ N  ▶ N  ○ N` right-aligned  
**Lines 2–N:** Up to 5 task rows — in-progress first, then pending — each with status icon + content  
**Overflow:** `+N more` row if task count exceeds 5

Status line updated via `ctx.ui.setStatus`: `📋 <title>: N tasks (N remaining)`

Widget (`setWidget`) removed in favour of footer.

---

## System Prompt Guidance

Extend the `before_agent_start` system prompt injection to explain:
- `dependsOn` field semantics
- Tasks with no unmet dependencies (all `dependsOn` IDs are `completed`) are candidates for parallel dispatch via subagents
- LLM should use this to plan parallel work where possible

---

## Session Reconstruction

`reconstructTodos` updated to also restore `listTitle` and `listDescription` from the last `todo_write` tool result's `details`.

---

## Non-Goals

- No runtime blocking based on `dependsOn` (LLM reasons about it, no enforcement)
- No collapse to single action-based tool (two-tool design preserved)
- No `new-list` action tool (list title/description set via `todo_write` params)
