# Todo Extension Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance `agent/extensions/todo.ts` with auto-nudge on incomplete tasks, named list support (title + description), dependency metadata on todo items, and a richer footer UI.

**Architecture:** All changes are additive to the existing two-tool (`todo_write` / `todo_read`) design. New fields are optional and backward-compatible. Footer replaces the current widget. Auto-nudge uses the `agent_end` event with a loop-guard flag.

**Tech Stack:** TypeScript, `@mariozechner/pi-coding-agent` ExtensionAPI, `@mariozechner/pi-tui`

---

### Task 1: Add `dependsOn` to TodoItem schema and `listTitle`/`listDescription` to `todo_write`

**Files:**
- Modify: `agent/extensions/todo.ts`

**Step 1: Update `TodoItem` interface**

Find the `TodoItem` interface and add the new optional field:

```ts
interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
  dependsOn?: string[];  // IDs of tasks that must complete before this one
}
```

**Step 2: Add module-level state for list metadata**

After `let todos: TodoItem[] = [];`, add:

```ts
let listTitle: string | undefined;
let listDescription: string | undefined;
```

**Step 3: Update `TodoItemSchema` to include `dependsOn`**

After the `priority` field in the TypeBox schema:

```ts
dependsOn: Type.Optional(
  Type.Array(Type.String(), {
    description: "IDs of tasks that must be completed before this task can start",
  })
),
```

**Step 4: Update `todo_write` parameters to accept `listTitle` and `listDescription`**

Change the `parameters` object for `todo_write` from:

```ts
parameters: Type.Object({
  todos: Type.Array(TodoItemSchema, { ... }),
}),
```

to:

```ts
parameters: Type.Object({
  todos: Type.Array(TodoItemSchema, {
    description: "Complete updated list of todo items",
  }),
  listTitle: Type.Optional(Type.String({ description: "Short name for this task list" })),
  listDescription: Type.Optional(Type.String({ description: "Longer description of the list's theme or goal" })),
}),
```

**Step 5: Update `todo_write` execute to store list metadata and include in details**

```ts
async execute(_id, params, _signal, _onUpdate, ctx) {
  todos = params.todos;
  if (params.listTitle !== undefined) listTitle = params.listTitle;
  if (params.listDescription !== undefined) listDescription = params.listDescription;
  updateWidget(ctx);
  return {
    content: [{ type: "text", text: makeSummary(todos) }],
    details: { todos, listTitle, listDescription },
  };
},
```

**Step 6: Verify TypeScript compiles**

```bash
cd /Users/james/.pi/agent/extensions
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors)

**Step 7: Commit**

```bash
cd /Users/james/.pi
git add agent/extensions/todo.ts
git commit -m "feat(todo): add dependsOn field and listTitle/listDescription to todo_write"
```

---

### Task 2: Update session reconstruction to restore list metadata

**Files:**
- Modify: `agent/extensions/todo.ts`

**Step 1: Update `reconstructTodos` to restore `listTitle` and `listDescription`**

Find the `reconstructTodos` function. After `todos = (entry as any).message.details.todos;`, add:

```ts
listTitle = (entry as any).message.details.listTitle ?? listTitle;
listDescription = (entry as any).message.details.listDescription ?? listDescription;
```

Also reset both at the top of `reconstructTodos`:

```ts
function reconstructTodos(ctx: ExtensionContext) {
  todos = [];
  listTitle = undefined;
  listDescription = undefined;
  // ... rest of loop
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/james/.pi/agent/extensions
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

**Step 3: Commit**

```bash
cd /Users/james/.pi
git add agent/extensions/todo.ts
git commit -m "feat(todo): restore listTitle/listDescription in session reconstruction"
```

---

### Task 3: Replace widget with richer footer UI

**Files:**
- Modify: `agent/extensions/todo.ts`

**Step 1: Check what footer imports are available**

```bash
grep -n "from '@mariozechner/pi" /Users/james/.pi/agent/extensions/todo.ts
grep -n "setFooter\|visibleWidth\|truncateToWidth" /Users/james/.pi/agent/extensions/footer.ts 2>/dev/null | head -20
```

**Step 2: Add needed imports**

Ensure `truncateToWidth` and `visibleWidth` are imported from `@mariozechner/pi-tui`. Update the import line:

```ts
import { Text, Container, Spacer, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
```

**Step 3: Replace `updateWidget` with `updateFooter`**

Remove the existing `updateWidget` function entirely and replace with:

```ts
const STATUS_ICON_FOOTER: Record<TodoItem["status"], string> = {
  completed:   "✓",
  in_progress: "▶",
  pending:     "○",
};

function updateFooter(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  const title = listTitle ?? "Todos";
  const total = todos.length;
  const done  = todos.filter((t) => t.status === "completed").length;
  const active = todos.filter((t) => t.status === "in_progress").length;
  const pending = todos.filter((t) => t.status === "pending").length;
  const remaining = total - done;

  ctx.ui.setStatus(
    `📋 ${title}: ${total} tasks (${remaining} remaining)`,
    "todo"
  );

  if (total === 0) {
    ctx.ui.setWidget("todos", []);
    return;
  }

  ctx.ui.setFooter((_tui, theme) => {
    return {
      invalidate() {},
      render(width: number): string[] {
        const t = listTitle ?? "Todos";
        const d  = todos.filter((x) => x.status === "completed").length;
        const a  = todos.filter((x) => x.status === "in_progress").length;
        const p  = todos.filter((x) => x.status === "pending").length;
        const tot = todos.length;

        // Line 1: title + progress left, counts right
        const l1Left =
          theme.fg("accent", ` ${t} `) +
          theme.fg("warning", "[") +
          theme.fg("success", `${d}`) +
          theme.fg("dim", "/") +
          theme.fg("muted", `${tot}`) +
          theme.fg("warning", "]");

        const l1Right =
          theme.fg("success", `✓ ${d}`) +
          theme.fg("dim", "  ") +
          theme.fg("warning", `▶ ${a}`) +
          theme.fg("dim", "  ") +
          theme.fg("dim", `○ ${p} `);

        const pad = " ".repeat(Math.max(1, width - visibleWidth(l1Left) - visibleWidth(l1Right)));
        const line1 = truncateToWidth(l1Left + pad + l1Right, width, "");

        // Lines 2+: in_progress first, then pending, max 5
        const inProgress = todos.filter((x) => x.status === "in_progress");
        const pendingItems = todos.filter((x) => x.status === "pending");
        const visible = [...inProgress, ...pendingItems].slice(0, 5);
        const overflow = (inProgress.length + pendingItems.length) - visible.length;

        const rows = visible.map((item) => {
          const icon = item.status === "in_progress"
            ? theme.fg("warning", "▶")
            : theme.fg("dim", "○");
          const text = item.status === "in_progress"
            ? theme.fg("success", item.content)
            : theme.fg("muted", item.content);
          return truncateToWidth(` ${icon} ${text}`, width, "");
        });

        if (overflow > 0) {
          rows.push(truncateToWidth(theme.fg("dim", `   +${overflow} more`), width, ""));
        }

        return [line1, ...rows];
      },
    };
  });
}
```

**Step 4: Replace all calls to `updateWidget` with `updateFooter`**

```bash
grep -n "updateWidget" /Users/james/.pi/agent/extensions/todo.ts
```

Replace every occurrence of `updateWidget(ctx)` with `updateFooter(ctx)`.

Also update the `agent_end` handler:
```ts
pi.on("agent_end", (_, ctx) => updateFooter(ctx));
```

**Step 5: Verify TypeScript compiles**

```bash
cd /Users/james/.pi/agent/extensions
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

**Step 6: Commit**

```bash
cd /Users/james/.pi
git add agent/extensions/todo.ts
git commit -m "feat(todo): replace widget with richer footer UI showing progress and task rows"
```

---

### Task 4: Add auto-nudge on agent_end

**Files:**
- Modify: `agent/extensions/todo.ts`

**Step 1: Add `nudgedThisCycle` flag to module state**

After `let listDescription: string | undefined;`, add:

```ts
let nudgedThisCycle = false;
```

**Step 2: Update `agent_end` handler to auto-nudge**

Replace the existing `agent_end` handler with:

```ts
pi.on("agent_end", async (_event, ctx) => {
  updateFooter(ctx);

  const incomplete = todos.filter((t) => t.status !== "completed");
  if (incomplete.length === 0 || nudgedThisCycle) return;

  nudgedThisCycle = true;

  const taskList = incomplete
    .map((t) => {
      const icon = t.status === "in_progress" ? "▶" : "○";
      return `  ${icon} [${t.id}] (${t.status}): ${t.content}`;
    })
    .join("\n");

  pi.sendMessage(
    {
      customType: "todo-nudge",
      content: `⚠️ You still have ${incomplete.length} incomplete task(s):\n\n${taskList}\n\nContinue working on them or mark them completed with \`todo_write\`. Don't stop until it's done!`,
      display: true,
    },
    { triggerTurn: true },
  );
});
```

**Step 3: Add `input` event handler to reset the nudge flag**

After the `agent_end` handler, add:

```ts
pi.on("input", async () => {
  nudgedThisCycle = false;
  return { action: "continue" as const };
});
```

**Step 4: Verify TypeScript compiles**

```bash
cd /Users/james/.pi/agent/extensions
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

**Step 5: Commit**

```bash
cd /Users/james/.pi
git add agent/extensions/todo.ts
git commit -m "feat(todo): add auto-nudge on agent_end for incomplete tasks"
```

---

### Task 5: Update system prompt guidance for dependsOn

**Files:**
- Modify: `agent/extensions/todo.ts`

**Step 1: Extend the `before_agent_start` system prompt injection**

Find the `before_agent_start` handler and replace the system prompt string with:

```ts
pi.on("before_agent_start", (event) => {
  event.systemPrompt +=
    "\n\n## Todo Tools\n" +
    "For multi-step tasks, use `todo_write` at the start to create a structured task list. " +
    "Update statuses as you work (`pending` → `in_progress` → `completed`). " +
    "Use `todo_read` to review your current list at any time. " +
    "Always pass the *complete* updated array when calling `todo_write`.\n\n" +
    "### Named Lists\n" +
    "Use `listTitle` and `listDescription` in `todo_write` to give your task list a meaningful name and theme.\n\n" +
    "### Parallel Execution with dependsOn\n" +
    "Each todo item supports an optional `dependsOn` field — an array of task IDs that must be `completed` before this task should start. " +
    "Use this to express task dependencies. Tasks with no unmet dependencies (all their `dependsOn` IDs are `completed`, or the field is absent) " +
    "are candidates for parallel execution via subagents. " +
    "When dispatching parallel work, check `dependsOn` to determine which tasks can run concurrently and which must wait.";
});
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/james/.pi/agent/extensions
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

**Step 3: Commit**

```bash
cd /Users/james/.pi
git add agent/extensions/todo.ts
git commit -m "feat(todo): update system prompt to explain dependsOn and parallel execution"
```

---

### Task 6: Update `todo_write` renderCall and renderResult to show list title

**Files:**
- Modify: `agent/extensions/todo.ts`

**Step 1: Update `renderCall` for `todo_write`**

Find `renderCall` in the `todo_write` registration and update to show title if present:

```ts
renderCall(args, theme) {
  const count = Array.isArray(args.todos) ? args.todos.length : "?";
  const title = args.listTitle ? ` "${args.listTitle}"` : "";
  return new Text(
    theme.fg("toolTitle", theme.bold("TodoWrite ")) +
    theme.fg("dim", `${count} items${title}`),
    0, 0
  );
},
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/james/.pi/agent/extensions
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

**Step 3: Commit**

```bash
cd /Users/james/.pi
git add agent/extensions/todo.ts
git commit -m "feat(todo): show list title in todo_write renderCall"
```
