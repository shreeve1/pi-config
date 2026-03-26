/**
 * Subagent Widget Extension
 *
 * Registers subagent_create, subagent_continue, subagent_remove, and subagent_list
 * tools so the main agent can spawn and manage background subagents with persistent
 * sessions and live TUI widgets.
 *
 * Each subagent runs as a separate `pi` process with its own JSONL session file,
 * enabling multi-turn conversation continuations via subagent_continue.
 *
 * Results are delivered back to the main agent as a follow-up message when finished.
 *
 * Commands:
 *   /subclear   — Kill and clear all active subagent widgets
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import { Container, Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface SubState {
	id: number;
	status: "running" | "done" | "error";
	task: string;
	textChunks: string[];
	toolCount: number;
	elapsed: number;
	sessionFile: string;
	turnCount: number;
	proc?: any;
}

interface InlineSubState {
	toolCallId: string;
	args: any;
	status: "running" | "done" | "error";
	label: string;
	task: string;
	preview: string;
	toolCount: number;
	elapsed: number;
	startedAt: number;
	tick?: NodeJS.Timeout;
	cleanup?: NodeJS.Timeout;
}

const SUCCESS_WIDGET_TTL_MS = 15000;
const ERROR_WIDGET_TTL_MS = 30000;
const WIDGET_TICK_MS = 1000;

export default function (pi: ExtensionAPI) {
	const agents: Map<number, SubState> = new Map();
	const inlineSubagents: Map<string, InlineSubState> = new Map();
	let nextId = 1;
	let widgetCtx: any;

	// ── Session file helpers ──────────────────────────────────────────────────

	function makeSessionFile(id: number): string {
		const dir = path.join(os.homedir(), ".pi", "agent", "sessions", "subagents");
		fs.mkdirSync(dir, { recursive: true });
		return path.join(dir, `subagent-${id}-${Date.now()}.jsonl`);
	}

	function getInlineWidgetKey(toolCallId: string): string {
		return `sub-tool-${toolCallId}`;
	}

	function extractLastNonEmptyLine(text: string): string {
		return text
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.pop() || "";
	}

	function getInlineLabel(args: any, details?: any): string {
		if (details?.mode === "single" && details?.results?.[0]?.agent) return details.results[0].agent;
		if (details?.mode === "parallel") return "parallel";
		if (details?.mode === "chain") return "chain";
		if (typeof args?.agent === "string" && args.agent.trim()) return args.agent;
		if (Array.isArray(args?.tasks)) return "parallel";
		if (Array.isArray(args?.chain)) return "chain";
		return "subagent";
	}

	function getInlineTaskSummary(args: any): string {
		if (typeof args?.task === "string" && args.task.trim()) return args.task;
		if (Array.isArray(args?.tasks) && args.tasks.length > 0) {
			const first = args.tasks[0];
			const firstTask = typeof first?.task === "string" ? first.task : "";
			const firstAgent = typeof first?.agent === "string" ? `${first.agent}: ` : "";
			return `${args.tasks.length} tasks · ${firstAgent}${firstTask}`.trim();
		}
		if (Array.isArray(args?.chain) && args.chain.length > 0) {
			const first = args.chain[0];
			const firstTask = typeof first?.task === "string" ? first.task.replace(/\{previous\}/g, "").trim() : "";
			const firstAgent = typeof first?.agent === "string" ? `${first.agent}: ` : "";
			return `${args.chain.length} steps · ${firstAgent}${firstTask}`.trim();
		}
		return "subagent run";
	}

	function extractMessagesFromDetails(details: any): any[] {
		if (!Array.isArray(details?.results)) return [];
		return details.results.flatMap((result: any) => (Array.isArray(result?.messages) ? result.messages : []));
	}

	function countToolCallsFromDetails(details: any): number {
		let count = 0;
		for (const message of extractMessagesFromDetails(details)) {
			if (message?.role !== "assistant" || !Array.isArray(message?.content)) continue;
			for (const part of message.content) {
				if (part?.type === "toolCall") count++;
			}
		}
		return count;
	}

	function getResultPreview(result: any): string {
		if (Array.isArray(result?.content)) {
			const text = result.content
				.filter((part: any) => part?.type === "text" && typeof part?.text === "string")
				.map((part: any) => part.text)
				.join("\n");
			const preview = extractLastNonEmptyLine(text);
			if (preview) return preview;
		}

		for (const message of [...extractMessagesFromDetails(result?.details)].reverse()) {
			if (message?.role !== "assistant" || !Array.isArray(message?.content)) continue;
			for (const part of [...message.content].reverse()) {
				if (part?.type !== "text" || typeof part?.text !== "string") continue;
				const preview = extractLastNonEmptyLine(part.text);
				if (preview) return preview;
			}
		}

		return "";
	}

	function clearInlineState(state: InlineSubState, ctx?: any) {
		if (state.tick) clearInterval(state.tick);
		if (state.cleanup) clearTimeout(state.cleanup);
		state.tick = undefined;
		state.cleanup = undefined;
		ctx?.ui.setWidget(getInlineWidgetKey(state.toolCallId), undefined);
	}

	function scheduleInlineRemoval(state: InlineSubState) {
		if (state.cleanup) clearTimeout(state.cleanup);
		const removeDelay = state.status === "done" ? SUCCESS_WIDGET_TTL_MS : ERROR_WIDGET_TTL_MS;
		state.cleanup = setTimeout(() => {
			const current = inlineSubagents.get(state.toolCallId);
			if (!current || current.status === "running") return;
			clearInlineState(current, widgetCtx);
			inlineSubagents.delete(state.toolCallId);
		}, removeDelay);
	}

	function renderWidget(
		key: string,
		title: string,
		state: { status: "running" | "done" | "error"; task: string; elapsed: number; toolCount: number; preview?: string; turnCount?: number },
	) {
		widgetCtx.ui.setWidget(key, (_tui: any, theme: any) => {
			const container = new Container();
			const borderFn = (s: string) => theme.fg("dim", s);

			container.addChild(new Text("", 0, 0));
			container.addChild(new DynamicBorder(borderFn));
			const content = new Text("", 1, 0);
			container.addChild(content);
			container.addChild(new DynamicBorder(borderFn));

			return {
				render(width: number): string[] {
					const lines: string[] = [];
					const statusColor =
						state.status === "running" ? "accent" : state.status === "done" ? "success" : "error";
					const statusIcon = state.status === "running" ? "●" : state.status === "done" ? "✓" : "✗";

					const taskPreview = state.task.length > 40 ? state.task.slice(0, 37) + "..." : state.task;
					const turnLabel = state.turnCount && state.turnCount > 1 ? theme.fg("dim", ` · Turn ${state.turnCount}`) : "";

					lines.push(
						theme.fg(statusColor, `${statusIcon} ${title}`) +
							turnLabel +
							theme.fg("dim", `  ${taskPreview}`) +
							theme.fg("dim", `  (${Math.round(state.elapsed / 1000)}s)`) +
							theme.fg("dim", ` | Tools: ${state.toolCount}`),
					);

					if (state.preview) {
						const trimmed =
							state.preview.length > width - 10 ? state.preview.slice(0, width - 13) + "..." : state.preview;
						lines.push(theme.fg("muted", `  ${trimmed}`));
					}

					content.setText(lines.join("\n"));
					return container.render(width);
				},
				invalidate() {
					container.invalidate();
				},
			};
		});
	}

	// ── Widget rendering ──────────────────────────────────────────────────────

	function updateWidgets() {
		if (!widgetCtx) return;

		for (const [id, state] of Array.from(agents.entries())) {
			renderWidget(`sub-${id}`, `Subagent #${state.id}`, {
				status: state.status,
				task: state.task,
				elapsed: state.elapsed,
				toolCount: state.toolCount,
				preview: extractLastNonEmptyLine(state.textChunks.join("")),
				turnCount: state.turnCount,
			});
		}

		for (const state of Array.from(inlineSubagents.values())) {
			renderWidget(getInlineWidgetKey(state.toolCallId), `Subagent ${state.label}`, {
				status: state.status,
				task: state.task,
				elapsed: state.elapsed,
				toolCount: state.toolCount,
				preview: state.preview,
			});
		}
	}

	// ── Streaming helpers ─────────────────────────────────────────────────────

	function processLine(state: SubState, line: string) {
		if (!line.trim()) return;
		try {
			const event = JSON.parse(line);
			const type = event.type;

			if (type === "message_update") {
				const delta = event.assistantMessageEvent;
				if (delta?.type === "text_delta") {
					state.textChunks.push(delta.delta || "");
					updateWidgets();
				}
			} else if (type === "tool_execution_start") {
				state.toolCount++;
				updateWidgets();
			}
		} catch {}
	}

	function spawnAgent(state: SubState, prompt: string, ctx: any): Promise<void> {
		const model = ctx.model
			? `${ctx.model.provider}/${ctx.model.id}`
			: "anthropic/claude-sonnet-4-5";

		return new Promise<void>((resolve) => {
			const proc = spawn(
				"pi",
				[
					"--mode", "json",
					"-p",
					"--session", state.sessionFile,
					"--no-extensions",
					"--model", model,
					"--tools", "read,bash,grep,find,ls,write,edit",
					"--thinking", "off",
					prompt,
				],
				{
					stdio: ["ignore", "pipe", "pipe"],
					env: { ...process.env },
				},
			);

			state.proc = proc;

			const startTime = Date.now();
			const timer = setInterval(() => {
				state.elapsed = Date.now() - startTime;
				updateWidgets();
			}, 1000);

			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) processLine(state, line);
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", (chunk: string) => {
				if (chunk.trim()) {
					state.textChunks.push(chunk);
					updateWidgets();
				}
			});

			proc.on("close", (code) => {
				if (buffer.trim()) processLine(state, buffer);
				clearInterval(timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";
				state.proc = undefined;
				updateWidgets();

				const result = state.textChunks.join("");
				ctx.ui.notify(
					`Subagent #${state.id} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error",
				);

				// Keep widgets visible long enough to notice and inspect.
				const removeDelay = state.status === "done" ? SUCCESS_WIDGET_TTL_MS : ERROR_WIDGET_TTL_MS;
				setTimeout(() => {
					if (agents.has(state.id) && agents.get(state.id)?.status !== "running") {
						// Only remove if not restarted via subagent_continue
						const currentWidgetCtx = widgetCtx;
						if (currentWidgetCtx) {
							currentWidgetCtx.ui.setWidget(`sub-${state.id}`, undefined);
						}
						agents.delete(state.id);
					}
				}, removeDelay);

				pi.sendMessage(
					{
						customType: "subagent-result",
						content: `Subagent #${state.id}${state.turnCount > 1 ? ` (Turn ${state.turnCount})` : ""} finished "${prompt}" in ${Math.round(state.elapsed / 1000)}s.\n\nResult:\n${result.slice(0, 8000)}${result.length > 8000 ? "\n\n... [truncated]" : ""}`,
						display: true,
					},
					{ deliverAs: "followUp", triggerTurn: true },
				);

				resolve();
			});

			proc.on("error", (err) => {
				clearInterval(timer);
				state.status = "error";
				state.proc = undefined;
				state.textChunks.push(`Error: ${err.message}`);
				updateWidgets();
				resolve();
			});
		});
	}

	// ── Tools ─────────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "subagent_create",
		label: "Subagent Create",
		description:
			"Spawn a background subagent to perform a task. Returns the subagent ID immediately while it runs in the background. Results are delivered as a follow-up message when finished. Use this for long-running, isolated tasks that benefit from a persistent session and potential continuation.",
		parameters: Type.Object({
			task: Type.String({ description: "The complete task description for the subagent to perform" }),
		}),
		execute: async (_callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const id = nextId++;
			const state: SubState = {
				id,
				status: "running",
				task: args.task,
				textChunks: [],
				toolCount: 0,
				elapsed: 0,
				sessionFile: makeSessionFile(id),
				turnCount: 1,
			};
			agents.set(id, state);
			updateWidgets();

			// Fire-and-forget
			spawnAgent(state, args.task, ctx);

			return {
				content: [{ type: "text", text: `Subagent #${id} spawned and running in background. Results will arrive as a follow-up message.` }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "subagent_continue",
		label: "Subagent Continue",
		description:
			"Continue an existing subagent's conversation with a follow-up prompt. The subagent resumes from its persistent session, retaining full conversation history. Returns immediately while the subagent runs in the background.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the subagent to continue" }),
			prompt: Type.String({ description: "The follow-up prompt or new instructions" }),
		}),
		execute: async (_callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No subagent #${args.id} found.` }], details: {} };
			}
			if (state.status === "running") {
				return {
					content: [{ type: "text", text: `Error: Subagent #${args.id} is still running. Wait for its result first.` }],
					details: {},
				};
			}

			state.status = "running";
			state.task = args.prompt;
			state.textChunks = [];
			state.elapsed = 0;
			state.turnCount++;
			updateWidgets();

			ctx.ui.notify(`Continuing Subagent #${args.id} (Turn ${state.turnCount})…`, "info");
			spawnAgent(state, args.prompt, ctx);

			return {
				content: [{ type: "text", text: `Subagent #${args.id} continuing (Turn ${state.turnCount}). Results will arrive as a follow-up message.` }],
				details: {},
			};
		},
	});

	pi.registerTool({
		name: "subagent_remove",
		label: "Subagent Remove",
		description: "Remove a specific subagent. Kills it if currently running.",
		parameters: Type.Object({
			id: Type.Number({ description: "The ID of the subagent to remove" }),
		}),
		execute: async (_callId, args, _signal, _onUpdate, ctx) => {
			widgetCtx = ctx;
			const state = agents.get(args.id);
			if (!state) {
				return { content: [{ type: "text", text: `Error: No subagent #${args.id} found.` }], details: {} };
			}

			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
			}
			ctx.ui.setWidget(`sub-${args.id}`, undefined);
			agents.delete(args.id);

			return { content: [{ type: "text", text: `Subagent #${args.id} removed.` }], details: {} };
		},
	});

	pi.registerTool({
		name: "subagent_list",
		label: "Subagent List",
		description: "List all active and finished background subagents with their IDs, status, and tasks.",
		parameters: Type.Object({}),
		execute: async () => {
			if (agents.size === 0) {
				return { content: [{ type: "text", text: "No active subagents." }], details: {} };
			}

			const list = Array.from(agents.values())
				.map((s) => `#${s.id} [${s.status.toUpperCase()}] (Turn ${s.turnCount}) – ${s.task}`)
				.join("\n");

			return { content: [{ type: "text", text: `Subagents:\n${list}` }], details: {} };
		},
	});

	// ── /subclear command ─────────────────────────────────────────────────────

	pi.registerCommand("subclear", {
		description: "Kill and clear all subagent widgets",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;

			let killed = 0;
			for (const [id, state] of Array.from(agents.entries())) {
				if (state.proc && state.status === "running") {
					state.proc.kill("SIGTERM");
					killed++;
				}
				ctx.ui.setWidget(`sub-${id}`, undefined);
			}
			for (const state of Array.from(inlineSubagents.values())) {
				clearInlineState(state, ctx);
			}

			const total = agents.size + inlineSubagents.size;
			agents.clear();
			inlineSubagents.clear();
			nextId = 1;

			const msg =
				total === 0
					? "No subagents to clear."
					: `Cleared ${total} subagent${total !== 1 ? "s" : ""}${killed > 0 ? ` (${killed} killed)` : ""}.`;
			ctx.ui.notify(msg, "info");
		},
	});

	// ── Session lifecycle ─────────────────────────────────────────────────────

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName !== "subagent" || !ctx.hasUI) return;
		widgetCtx = ctx;

		const existing = inlineSubagents.get(event.toolCallId);
		if (existing) clearInlineState(existing, ctx);

		const state: InlineSubState = {
			toolCallId: event.toolCallId,
			args: event.args,
			status: "running",
			label: getInlineLabel(event.args),
			task: getInlineTaskSummary(event.args),
			preview: "",
			toolCount: 0,
			elapsed: 0,
			startedAt: Date.now(),
		};
		state.tick = setInterval(() => {
			if (!inlineSubagents.has(state.toolCallId)) {
				clearInlineState(state, widgetCtx);
				return;
			}
			state.elapsed = Date.now() - state.startedAt;
			updateWidgets();
		}, WIDGET_TICK_MS);

		inlineSubagents.set(state.toolCallId, state);
		updateWidgets();
	});

	pi.on("tool_execution_update", async (event, ctx) => {
		if (event.toolName !== "subagent" || !ctx.hasUI) return;
		const state = inlineSubagents.get(event.toolCallId);
		if (!state) return;
		widgetCtx = ctx;

		state.elapsed = Date.now() - state.startedAt;
		state.label = getInlineLabel(event.args, event.partialResult?.details);
		state.toolCount = countToolCallsFromDetails(event.partialResult?.details);
		const preview = getResultPreview(event.partialResult);
		if (preview) state.preview = preview;
		updateWidgets();
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.toolName !== "subagent" || !ctx.hasUI) return;
		const state = inlineSubagents.get(event.toolCallId);
		if (!state) return;
		widgetCtx = ctx;

		state.status = event.isError ? "error" : "done";
		state.elapsed = Date.now() - state.startedAt;
		state.label = getInlineLabel(state.args, event.result?.details);
		state.toolCount = countToolCallsFromDetails(event.result?.details) || state.toolCount;
		const preview = getResultPreview(event.result);
		if (preview) state.preview = preview;
		if (state.tick) {
			clearInterval(state.tick);
			state.tick = undefined;
		}
		updateWidgets();
		scheduleInlineRemoval(state);
	});

	pi.on("session_start", async (_event, ctx) => {
		for (const [id, state] of Array.from(agents.entries())) {
			if (state.proc && state.status === "running") {
				state.proc.kill("SIGTERM");
			}
			ctx.ui.setWidget(`sub-${id}`, undefined);
		}
		for (const state of Array.from(inlineSubagents.values())) {
			clearInlineState(state, ctx);
		}
		agents.clear();
		inlineSubagents.clear();
		nextId = 1;
		widgetCtx = ctx;
	});
}
