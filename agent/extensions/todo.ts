/**
 * TodoWrite / TodoRead extension for Pi
 *
 * Registers two tools the LLM uses to maintain a structured in-session task list:
 *   - todo_write  — replace the full todo list
 *   - todo_read   — read the current list
 *
 * Also provides:
 *   - A live widget above the editor showing active todos
 *   - A /todo command to view or clear the list
 *   - System prompt guidance so the LLM knows when to use these tools
 *   - Session reconstruction: todos are restored from the last todo_write result after compact/reload
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Text, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ─── Data model ────────────────────────────────────────────────────────────────

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed";
  priority: "high" | "medium" | "low";
  dependsOn?: string[];
}

// Module-level state (reconstructed from session on start/switch)
let todos: TodoItem[] = [];
let listTitle: string | undefined;
let listDescription: string | undefined;
let nudgedThisCycle = false;
let activeContext: ExtensionContext | undefined;
let activeSessionName: string | undefined;

// ─── TypeBox schema ─────────────────────────────────────────────────────────────

const TodoItemSchema = Type.Object({
  id: Type.String({ description: "Unique identifier for the todo item" }),
  content: Type.String({ description: "Description of the task" }),
  status: StringEnum(["pending", "in_progress", "completed"] as const, {
    description: "Current status of the task",
  }),
  priority: StringEnum(["high", "medium", "low"] as const, {
    description: "Priority level",
  }),
  dependsOn: Type.Optional(
    Type.Array(Type.String(), {
      description: "IDs of tasks that must be completed before this task can start",
    })
  ),
});

// ─── Rendering helpers ──────────────────────────────────────────────────────────

const STATUS_ICON: Record<TodoItem["status"], string> = {
  completed:   "✓",
  in_progress: "▶",
  pending:     "○",
};

const STATUS_COLOR: Record<TodoItem["status"], string> = {
  completed:   "success",
  in_progress: "warning",
  pending:     "dim",
};

const PRIORITY_BADGE: Record<TodoItem["priority"], string> = {
  high:   "!!",
  medium: " !",
  low:    "  ",
};

function renderTodoList(
  items: TodoItem[],
  theme: any,
  opts: { expanded?: boolean; maxCollapsed?: number } = {}
): string {
  if (items.length === 0) return theme.fg("muted", "(no todos)");
  const { expanded = false, maxCollapsed = 6 } = opts;
  const toShow = expanded ? items : items.slice(0, maxCollapsed);
  const lines = toShow.map((t) =>
    theme.fg(STATUS_COLOR[t.status], `${STATUS_ICON[t.status]} ${PRIORITY_BADGE[t.priority]} ${t.content}`)
  );
  if (!expanded && items.length > maxCollapsed) {
    lines.push(theme.fg("muted", `... +${items.length - maxCollapsed} more (Ctrl+O to expand)`));
  }
  return lines.join("\n");
}

// ─── Footer helper ──────────────────────────────────────────────────────────────

function updateFooter(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;

  const total     = todos.length;
  const done      = todos.filter((t) => t.status === "completed").length;
  const remaining = total - done;
  const title     = listTitle ?? "Todos";

  ctx.ui.setStatus(
    `📋 ${title}: ${total} tasks (${remaining} remaining)`,
    "todo",
  );

  if (total === 0) {
    ctx.ui.setWidget("todos", []);
    return;
  }

  // Widget above editor (input field) - use default aboveEditor placement
  ctx.ui.setWidget("todos", (_tui, theme) => {
    return {
      invalidate() {},
      render(width: number): string[] {
        const t   = listTitle ?? "Todos";
        const d   = todos.filter((x) => x.status === "completed").length;
        const a   = todos.filter((x) => x.status === "in_progress").length;
        const p   = todos.filter((x) => x.status === "pending").length;
        const tot = todos.length;

        // Line 1: title + progress (left), counts (right)
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

        const pad   = " ".repeat(Math.max(1, width - visibleWidth(l1Left) - visibleWidth(l1Right)));
        const line1 = truncateToWidth(l1Left + pad + l1Right, width, "");

        // Lines 2+: in_progress first, then pending, max 5 rows
        const inProgress   = todos.filter((x) => x.status === "in_progress");
        const pendingItems = todos.filter((x) => x.status === "pending");
        const visible      = [...inProgress, ...pendingItems].slice(0, 5);
        const overflow     = inProgress.length + pendingItems.length - visible.length;

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

// ─── Session reconstruction ─────────────────────────────────────────────────────

function reconstructTodos(ctx: ExtensionContext) {
  todos = [];
  listTitle = undefined;
  listDescription = undefined;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (
      entry.type === "message" &&
      (entry as any).message?.role === "toolResult" &&
      (entry as any).message?.toolName === "todo_write" &&
      Array.isArray((entry as any).message?.details?.todos)
    ) {
      todos = (entry as any).message.details.todos;
      listTitle = (entry as any).message.details.listTitle ?? listTitle;
      listDescription = (entry as any).message.details.listDescription ?? listDescription;
    }
  }
  updateFooter(ctx);
}

// ─── Summary string ─────────────────────────────────────────────────────────────

function makeSummary(items: TodoItem[]): string {
  const done    = items.filter((t) => t.status === "completed").length;
  const inProg  = items.filter((t) => t.status === "in_progress").length;
  const pending = items.filter((t) => t.status === "pending").length;
  return `${items.length} todos: ${done} completed, ${inProg} in_progress, ${pending} pending`;
}

// ─── Extension entry point ──────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // Restore todos on session load/switch
  pi.on("session_start", (_, ctx) => {
    activeContext = ctx;
    activeSessionName = ctx.sessionManager.getSessionName();
    reconstructTodos(ctx);
  });
  pi.on("session_switch", (_, ctx) => {
    todos = [];
    activeContext = ctx;
    activeSessionName = ctx.sessionManager.getSessionName();
    reconstructTodos(ctx);
  });

  // Listen for plan-mode sync events
  pi.events.on("plan_tasks_sync", (data: unknown) => {
    const event = data as {
      type: "plan_tasks_sync";
      sessionName?: string;
      tasks: Array<{
        id: string;
        content: string;
        completed: boolean;
        status: "pending" | "in_progress" | "completed";
      }>;
      listTitle: string;
    };

    if (event.type !== "plan_tasks_sync" || !Array.isArray(event.tasks)) {
      return;
    }

    if (event.sessionName && activeSessionName && event.sessionName !== activeSessionName) {
      return;
    }

    todos = event.tasks.map((t) => ({
      id: t.id,
      content: t.content,
      status: t.status,
      priority: "medium" as const,
    }));
    listTitle = event.listTitle;

    if (activeContext) {
      updateFooter(activeContext);
    }
  });

  // Keep footer fresh and auto-nudge if tasks remain incomplete
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

  pi.on("input", async () => {
    nudgedThisCycle = false;
    return { action: "continue" as const };
  });

  // Tell the LLM how to use the todo tools
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
      "Use this to express task dependencies. Tasks with no unmet dependencies (all `dependsOn` IDs are `completed`, or the field is absent) " +
      "are candidates for parallel execution via subagents. " +
      "When dispatching parallel work, check `dependsOn` to determine which tasks can run concurrently and which must wait.";
  });

  // ─── todo_write ──────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "todo_write",
    label: "TodoWrite",
    description:
      "Create or update the session todo list. Pass the COMPLETE updated array of todo items (all items, not just changes). " +
      "Each item needs: id (unique string), content (task description), status (pending|in_progress|completed), priority (high|medium|low).",
    parameters: Type.Object({
      todos: Type.Array(TodoItemSchema, {
        description: "Complete updated list of todo items",
      }),
      listTitle: Type.Optional(Type.String({ description: "Short name for this task list" })),
      listDescription: Type.Optional(Type.String({ description: "Longer description of the list's theme or goal" })),
    }),

    async execute(_id, params, _signal, _onUpdate, ctx) {
      todos = params.todos;
      if (params.listTitle !== undefined) listTitle = params.listTitle;
      if (params.listDescription !== undefined) listDescription = params.listDescription;
      updateFooter(ctx);
      return {
        content: [{ type: "text", text: makeSummary(todos) }],
        details: { todos, listTitle, listDescription },
      };
    },

    renderCall(args: { todos?: unknown; listTitle?: string }, theme) {
      const count = Array.isArray(args.todos) ? args.todos.length : "?";
      const title = args.listTitle ? ` "${args.listTitle}"` : "";
      return new Text(
        theme.fg("toolTitle", theme.bold("TodoWrite ")) + theme.fg("dim", `${count} items${title}`),
        0, 0
      );
    },

    renderResult(result: any, { expanded }, theme) {
      const items: TodoItem[] = result.details?.todos ?? [];
      return new Text(renderTodoList(items, theme, { expanded }), 0, 0);
    },
  });

  // ─── todo_read ───────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "todo_read",
    label: "TodoRead",
    description:
      "Read the current session todo list. Returns the full list as JSON.",
    parameters: Type.Object({}),

    async execute() {
      return {
        content: [
          {
            type: "text",
            text: todos.length === 0 ? "No todos." : JSON.stringify(todos, null, 2),
          },
        ],
        details: { todos },
      };
    },

    renderCall(_args, theme) {
      return new Text(theme.fg("toolTitle", theme.bold("TodoRead")), 0, 0);
    },

    renderResult(result, { expanded }, theme) {
      const items: TodoItem[] = result.details?.todos ?? [];
      return new Text(renderTodoList(items, theme, { expanded }), 0, 0);
    },
  });

  // ─── /todo command ────────────────────────────────────────────────────────────

  pi.registerCommand("todo", {
    description: "Show or clear the current todo list. Usage: /todo [clear]",
    async handler(args, ctx) {
      const arg = (args ?? "").trim().toLowerCase();

      if (arg === "clear") {
        todos = [];
        ctx.ui.setWidget("todos", []);
        ctx.ui.notify("Todo list cleared", "info");
        return;
      }

      if (todos.length === 0) {
        ctx.ui.notify("No todos.", "info");
        return;
      }

      const lines = todos.map((t) => {
        const icon  = STATUS_ICON[t.status];
        const badge = t.priority === "high" ? "[!]" : t.priority === "medium" ? "[ ]" : "   ";
        return `${icon} ${badge} ${t.content}`;
      });
      ctx.ui.notify(
        `Todos (${todos.filter((t) => t.status !== "completed").length} active):\n${lines.join("\n")}`,
        "info"
      );
    },
  });
}
