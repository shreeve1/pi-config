/**
 * Goal Tracker — Opt-in durable goal tracking for the agent-team dispatcher.
 *
 * Builds on the existing todos.ts extension to provide a `track_goal` tool
 * that the dispatcher can use for multi-phase goals. Goals are persisted as
 * todo files with a "goal" tag in .pi/todos/.
 *
 * Features:
 *   - create/update/list/close lifecycle
 *   - Append-only progress log per goal
 *   - Session hydration: open goals are injected into the system prompt
 *   - Dispatcher-only: subagents never see or touch goals
 *
 * Usage: pi -e extensions/goal-tracker.ts
 *        (load alongside agent-team.ts and todos.ts)
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { StringEnum } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import {
	type TodoFrontMatter,
	type TodoRecord,
	ensureTodosDir,
	generateTodoId,
	getTodosDir,
	getTodoPath,
	isTodoClosed,
	listTodos,
	readTodoFile,
	writeTodoFile,
} from "./todos.ts";

// ── Constants ────────────────────────────────────

const GOAL_TAG = "goal";

// ── Helpers ──────────────────────────────────────

/** Convenience wrapper for tool results */
function result(text: string, details: Record<string, unknown> = {}) {
	return {
		content: [{ type: "text" as const, text }],
		details,
	};
}

function isGoal(todo: TodoFrontMatter): boolean {
	return Array.isArray(todo.tags) && todo.tags.includes(GOAL_TAG);
}

function isOpenGoal(todo: TodoFrontMatter): boolean {
	return isGoal(todo) && !isTodoClosed(todo.status);
}

function formatTimestamp(): string {
	const now = new Date();
	return now.toISOString().slice(0, 16).replace("T", " ");
}

function formatGoalForPrompt(todo: TodoRecord): string {
	const lines: string[] = [];
	lines.push(`### TODO-${todo.id}: ${todo.title}`);
	lines.push(`Status: ${todo.status}`);
	if (todo.tags.length > 1) {
		const extraTags = todo.tags.filter((t) => t !== GOAL_TAG);
		if (extraTags.length > 0) lines.push(`Tags: ${extraTags.join(", ")}`);
	}
	if (todo.body?.trim()) {
		const entries = todo.body.split(/^### /m).filter(Boolean);
		if (entries.length > 0) {
			const lastEntry = entries[entries.length - 1].trim();
			const firstLine = lastEntry.split("\n")[0] || "";
			lines.push(`Last update: ${firstLine}`);
		}
	}
	return lines.join("\n");
}

function formatGoalDetail(todo: TodoRecord): string {
	const lines: string[] = [];
	lines.push(`TODO-${todo.id}: ${todo.title}`);
	lines.push(`Status: ${todo.status}`);
	lines.push(`Tags: ${todo.tags.join(", ")}`);
	lines.push(`Created: ${todo.created_at}`);
	if (todo.body?.trim()) {
		lines.push("");
		lines.push(todo.body.trim());
	}
	return lines.join("\n");
}

function formatGoalList(goals: TodoFrontMatter[]): string {
	if (goals.length === 0) return "No open goals.";
	const lines = goals.map((g) => `- TODO-${g.id}: ${g.title} [${g.status}]`);
	return `Open goals (${goals.length}):\n${lines.join("\n")}`;
}

function normalizeId(id: string): string {
	let trimmed = id.trim();
	if (trimmed.startsWith("#")) trimmed = trimmed.slice(1);
	if (trimmed.toUpperCase().startsWith("TODO-")) trimmed = trimmed.slice(5);
	return trimmed.toLowerCase();
}

// ── Module state ─────────────────────────────────

let activeGoals: TodoRecord[] = [];

// ── Extension ────────────────────────────────────

export default function goalTrackerExtension(pi: ExtensionAPI) {
	// ── Session start: hydrate active goals ──────

	pi.on("session_start", async (_event, ctx) => {
		await hydrateGoals(ctx);
	});

	// ── Before agent start: inject goals into system prompt ──

	pi.on("before_agent_start", async (_event, _ctx) => {
		if (activeGoals.length === 0) return;

		const goalSummaries = activeGoals.map(formatGoalForPrompt).join("\n\n");

		return {
			systemPrompt:
				_event.systemPrompt +
				"\n\n## Active Goals\n\n" +
				"You have open goals from prior sessions. Review them before starting new work.\n\n" +
				goalSummaries +
				"\n\n" +
				"Use track_goal to update or close these goals as work progresses.\n",
		};
	});

	// ── track_goal tool ──────────────────────────

	pi.registerTool({
		name: "track_goal",
		label: "Track Goal",
		description:
			"Manage durable goals that persist across sessions. " +
			"Use for multi-phase work spanning 3+ dispatches. " +
			"Actions: create (new goal), update (append progress), list (show open goals), close (mark done).",
		parameters: Type.Object({
			action: StringEnum(["create", "update", "list", "close"] as const),
			id: Type.Optional(
				Type.String({
					description: "Goal id (TODO-<hex>) — required for update/close",
				}),
			),
			title: Type.Optional(
				Type.String({
					description: "Goal title — required for create",
				}),
			),
			summary: Type.Optional(
				Type.String({
					description:
						"Progress update text — appended to goal body on update/close",
				}),
			),
			tags: Type.Optional(
				Type.Array(Type.String(), {
					description: "Additional tags (goal tag is always included)",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const todosDir = getTodosDir(ctx.cwd);
			const action = params.action as "create" | "update" | "list" | "close";

			switch (action) {
				// ── CREATE ──
				case "create": {
					if (!params.title) {
						return result("Error: title required for create", { action, error: "title required" });
					}

					await ensureTodosDir(todosDir);
					const id = await generateTodoId(todosDir);
					const filePath = getTodoPath(todosDir, id);

					const tags = [GOAL_TAG, ...(params.tags ?? [])];
					const uniqueTags = [...new Set(tags)];

					const todo: TodoRecord = {
						id,
						title: params.title,
						tags: uniqueTags,
						status: "in-progress",
						created_at: new Date().toISOString(),
						body: "## Progress Log\n",
					};

					await writeTodoFile(filePath, todo);
					activeGoals.push(todo);

					return result(
						`Goal created: TODO-${id}\n\n${formatGoalDetail(todo)}`,
						{ action, goalId: id },
					);
				}

				// ── LIST ──
				case "list": {
					const allTodos = await listTodos(todosDir);
					const openGoals = allTodos.filter(isOpenGoal);
					return result(formatGoalList(openGoals), { action, count: openGoals.length });
				}

				// ── UPDATE ──
				case "update": {
					if (!params.id) {
						return result("Error: id required for update", { action, error: "id required" });
					}

					const nid = normalizeId(params.id);
					const filePath = getTodoPath(todosDir, nid);

					let todo: TodoRecord;
					try {
						todo = await readTodoFile(filePath, nid);
					} catch {
						return result(`Error: Goal TODO-${nid} not found`, { action, error: "not found" });
					}

					if (!isGoal(todo)) {
						return result(
							`Error: TODO-${nid} is not a goal (missing 'goal' tag)`,
							{ action, error: "not a goal" },
						);
					}

					const timestamp = formatTimestamp();
					const updateText = params.summary || "(no summary provided)";
					const entry = `\n### ${timestamp}\n${updateText}\n`;

					todo.body = (todo.body || "## Progress Log\n") + entry;
					await writeTodoFile(filePath, todo);
					refreshActiveGoal(todo);

					return result(
						`Goal updated: TODO-${nid}\n\n${formatGoalDetail(todo)}`,
						{ action, goalId: nid },
					);
				}

				// ── CLOSE ──
				case "close": {
					if (!params.id) {
						return result("Error: id required for close", { action, error: "id required" });
					}

					const nid = normalizeId(params.id);
					const filePath = getTodoPath(todosDir, nid);

					let todo: TodoRecord;
					try {
						todo = await readTodoFile(filePath, nid);
					} catch {
						return result(`Error: Goal TODO-${nid} not found`, { action, error: "not found" });
					}

					if (!isGoal(todo)) {
						return result(
							`Error: TODO-${nid} is not a goal (missing 'goal' tag)`,
							{ action, error: "not a goal" },
						);
					}

					if (params.summary) {
						const timestamp = formatTimestamp();
						const entry = `\n### ${timestamp} — CLOSED\n${params.summary}\n`;
						todo.body = (todo.body || "") + entry;
					}

					todo.status = "done";
					todo.assigned_to_session = undefined;
					await writeTodoFile(filePath, todo);
					activeGoals = activeGoals.filter((g) => g.id !== nid);

					return result(
						`Goal closed: TODO-${nid}\n\n${formatGoalDetail(todo)}`,
						{ action, goalId: nid },
					);
				}

				default:
					return result(
						`Unknown action: ${action}. Use create, update, list, or close.`,
						{ action, error: "unknown action" },
					);
			}
		},
	});

	// ── Internal helpers ─────────────────────────

	async function hydrateGoals(ctx: ExtensionContext) {
		const todosDir = getTodosDir(ctx.cwd);
		try {
			const allTodos = await listTodos(todosDir);
			const openGoalMeta = allTodos.filter(isOpenGoal);

			activeGoals = [];
			for (const meta of openGoalMeta) {
				try {
					const filePath = getTodoPath(todosDir, meta.id);
					const full = await readTodoFile(filePath, meta.id);
					activeGoals.push(full);
				} catch {
					// Skip unreadable goals
				}
			}
		} catch {
			activeGoals = [];
		}
	}

	function refreshActiveGoal(updated: TodoRecord) {
		const idx = activeGoals.findIndex((g) => g.id === updated.id);
		if (idx >= 0) {
			activeGoals[idx] = updated;
		} else if (isOpenGoal(updated)) {
			activeGoals.push(updated);
		}
	}
}
