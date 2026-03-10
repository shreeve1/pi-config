/**
 * Background Tasks Extension
 *
 * Run long-running commands (dev servers, log watchers, tests) in the background
 * while continuing your conversation. Features tabbed widget interface, rolling
 * buffers, pause/resume, auto-detection of long-running commands, and output filtering.
 *
 * Usage:
 *   background_task({ action: "start", id: "dev", label: "Dev Server", command: "npm run dev" })
 *   background_task({ action: "stop", id: "dev" })
 *   list_background_tasks()
 */

import { spawn, ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
	Container,
	Spacer,
	Text,
	SelectList,
	type SelectItem,
} from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { StringEnum } from "@mariozechner/pi-ai";

interface BackgroundTask {
	id: string;
	label: string;
	command: string;
	cwd: string;
	status: "running" | "paused" | "stopped" | "error";
	pid?: number | undefined;
	process?: ChildProcess | undefined;
	createdAt: number;
	exitCode?: number;
	outputFile: string;
	filters?: {
		exclude: string[];
		highlight: boolean;
	};
	bufferSize: number;
	buffer: string[];
	hasNewOutput: boolean;
}

interface TaskManager {
	tasks: Map<string, BackgroundTask>;
	widget: BackgroundWidget | null;
	activeTabId: string | null;
}

// Long-running command patterns for auto-detection
const BACKGROUND_PATTERNS = [
	/npm run (dev|start|watch)/,
	/yarn (dev|start|watch)/,
	/pnpm (dev|start|watch)/,
	/npm run build.*--watch/,
	/tail -f/,
	/\bwatch\b/,
	/\b(serve|server)\b/,
];

const DEFAULT_BUFFER_SIZE = 200;

// Task Manager singleton
let taskManager: TaskManager = {
	tasks: new Map(),
	widget: null,
	activeTabId: null,
};

// Custom widget for background tasks
class BackgroundWidget {
	constructor(private ctx: ExtensionContext) {}

	render(): Container {
		const container = new Container();
		const theme = this.ctx.ui.theme;

		if (taskManager.tasks.size === 0) {
			return container;
		}

		// Compact one-line-per-task display
		const tasks = Array.from(taskManager.tasks.values()).sort(
			(a, b) => a.createdAt - b.createdAt,
		);

		const taskLines = tasks.map((task) => {
			const statusIcon = this.getStatusIcon(task);
			const newOutputIcon = task.hasNewOutput ? "+" : "";
			const isActive = task.id === taskManager.activeTabId;
			const statusColor = this.getStatusColor(task.status);

			const taskText = `${statusIcon}${newOutputIcon} ${task.label}`;
			const coloredText = isActive
				? theme.fg("accent", taskText)
				: theme.fg(statusColor, taskText);

			return coloredText;
		});

		// Single line with all tasks
		container.addChild(new Text(taskLines.join("  "), 0, 0));

		return container;
	}

	private getStatusIcon(task: BackgroundTask): string {
		switch (task.status) {
			case "running":
				return task.hasNewOutput ? "●+" : "●";
			case "paused":
				return "⏸";
			case "stopped":
				return "✓";
			case "error":
				return "✗";
		}
	}

	private getStatusColor(status: string): any {
		switch (status) {
			case "running":
				return "success";
			case "paused":
				return "warning";
			case "stopped":
				return "muted";
			case "error":
				return "error";
			default:
				return "dim";
		}
	}

	updateWidget() {
		if (!taskManager.widget) return;
		this.ctx.ui.setWidget(
			"background-tasks",
			(_tui, _theme) => ({
				render: (width: number) => this.render().render(width),
				invalidate: () => this.render().invalidate?.(),
			}),
			{ placement: "belowEditor" },
		);
	}

	async showTaskManager(): Promise<void> {
		const taskIds = Array.from(taskManager.tasks.keys()).sort((a, b) => {
			const taskA = taskManager.tasks.get(a)!;
			const taskB = taskManager.tasks.get(b)!;
			return taskA.createdAt - taskB.createdAt;
		});

		if (taskIds.length === 0) {
			this.ctx.ui.notify("No background tasks running", "info");
			return;
		}

		const items: SelectItem[] = taskIds.map((id) => {
			const task = taskManager.tasks.get(id)!;
			const statusIcon = this.getStatusIcon(task);
			const newOutput = task.hasNewOutput ? " +" : "";
			return {
				value: id,
				label: `${statusIcon} ${task.label}${newOutput}`,
				description: `${task.status} • ${task.command.slice(0, 40)}${task.command.length > 40 ? "..." : ""}`,
			};
		});

		const result = await this.ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();

			// Top border
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			// Title
			container.addChild(new Text(theme.fg("accent", theme.bold("Background Tasks")), 1, 0));
			container.addChild(new Spacer(1));

			// SelectList
			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			});
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);

			// Help text
			container.addChild(
				new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0),
			);

			// Bottom border
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (w) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		}, { overlay: true });

		// Show action menu for selected task
		if (result) {
			await this.showActionMenu(result);
		}
	}

	private async showActionMenu(taskId: string): Promise<void> {
		const task = taskManager.tasks.get(taskId);
		if (!task) return;
		const items: SelectItem[] = [];

		// Add actions based on task status
		if (task.status === "running") {
			items.push({ value: "pause", label: "Pause", description: "Temporarily stop the task" });
		}
		if (task.status === "paused") {
			items.push({ value: "resume", label: "Resume", description: "Continue the task" });
		}
		if (task.status === "running" || task.status === "paused") {
			items.push({ value: "stop", label: "Stop", description: "Kill the task process" });
			items.push({ value: "restart", label: "Restart", description: "Stop and start again" });
		}
		items.push({ value: "view", label: "View Full Output", description: "See all output lines" });
		items.push({ value: "copy", label: "Copy Command", description: "Copy command to clipboard" });

		const result = await this.ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
			const container = new Container();

			// Top border
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			// Title with task info
			const statusColor = this.getStatusColor(task.status);
			container.addChild(
				new Text(
					theme.fg("accent", theme.bold(`Task: ${task.label}`)) +
						" " +
						theme.fg(statusColor, `[${task.status.toUpperCase()}]`),
					1,
					0,
				),
			);
			container.addChild(new Spacer(1));

			// SelectList
			const selectList = new SelectList(items, Math.min(items.length, 10), {
				selectedPrefix: (t) => theme.fg("accent", t),
				selectedText: (t) => theme.fg("accent", t),
				description: (t) => theme.fg("muted", t),
				scrollInfo: (t) => theme.fg("dim", t),
				noMatch: (t) => theme.fg("warning", t),
			});
			selectList.onSelect = (item) => done(item.value);
			selectList.onCancel = () => done(null);
			container.addChild(selectList);

			// Help text
			container.addChild(
				new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0),
			);

			// Bottom border
			container.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

			return {
				render: (w) => container.render(w),
				invalidate: () => container.invalidate(),
				handleInput: (data) => {
					selectList.handleInput(data);
					tui.requestRender();
				},
			};
		}, { overlay: true });

		// Handle the selected action
		if (result) {
			await this.executeAction(taskId, result);
		}
	}

	private async executeAction(taskId: string, action: string): Promise<void> {
		switch (action) {
			case "stop":
				stopTask(taskId);
				this.ctx.ui.notify(`Stopped task: ${taskId}`, "info");
				break;
			case "pause":
				if (pauseTask(taskId)) {
					this.ctx.ui.notify(`Paused task: ${taskId}`, "info");
				}
				break;
			case "resume":
				if (resumeTask(taskId)) {
					this.ctx.ui.notify(`Resumed task: ${taskId}`, "info");
				}
				break;
			case "restart":
				await restartTask(this.ctx, taskId);
				this.ctx.ui.notify(`Restarted task: ${taskId}`, "info");
				break;
			case "view":
				// View full output - could open in editor or show in a larger overlay
				const task = taskManager.tasks.get(taskId);
				if (task && task.buffer.length > 0) {
					this.ctx.ui.notify(
						`Output: ${task.buffer.length} lines in buffer, see ${task.outputFile}`,
						"info",
					);
				} else {
					this.ctx.ui.notify("No output available", "info");
				}
				break;
			case "copy":
				// Copy command to clipboard
				const taskToCopy = taskManager.tasks.get(taskId);
				if (taskToCopy) {
					try {
						const { spawn: spawnCopy } = await import("node:child_process");
						const platform = process.platform;
						let copyProcess: ReturnType<typeof spawnCopy>;

						if (platform === "darwin") {
							copyProcess = spawnCopy("pbcopy", []);
						} else if (platform === "linux") {
							copyProcess = spawnCopy("xclip", ["-selection", "clipboard"]);
						} else if (platform === "win32") {
							copyProcess = spawnCopy("clip", []);
						} else {
							throw new Error("Unsupported platform");
						}

						copyProcess.stdin?.write(taskToCopy.command);
						copyProcess.stdin?.end();
						this.ctx.ui.notify("Command copied to clipboard", "info");
					} catch {
						this.ctx.ui.notify("Failed to copy to clipboard", "error");
					}
				}
				break;
		}
		updateWidget(this.ctx);
	}
}

// Helper functions
function getOutputFile(id: string): string {
	const safeId = id.replace(/[^\w.-]+/g, "_");
	return path.join(os.tmpdir(), `pi-bg-task-${safeId}-${Date.now()}.log`);
}

function shouldExcludeLine(line: string, filters?: BackgroundTask["filters"]): boolean {
	if (!filters?.exclude) return false;

	for (const pattern of filters.exclude) {
		const regex = new RegExp(pattern);
		if (regex.test(line)) {
			return true;
		}
	}

	return false;
}

function addToBuffer(task: BackgroundTask, line: string) {
	if (shouldExcludeLine(line, task.filters)) {
		return;
	}

	task.buffer.push(line);

	// Maintain rolling buffer
	while (task.buffer.length > task.bufferSize) {
		task.buffer.shift();
	}

	task.hasNewOutput = true;
}

function writeOutputToFile(task: BackgroundTask, line: string) {
	try {
		fs.appendFileSync(task.outputFile, line + "\n", { encoding: "utf-8" });
	} catch (error) {
		// Silently fail - file writing is non-critical
	}
}

function updateWidget(_ctx: ExtensionContext): void {
	if (taskManager.widget) {
		taskManager.widget.updateWidget();
	}
}

async function startTask(
	ctx: ExtensionContext,
	id: string,
	label: string,
	command: string,
	cwd: string,
	filters?: BackgroundTask["filters"],
	bufferSize: number = DEFAULT_BUFFER_SIZE,
): Promise<BackgroundTask> {
	const outputFile = getOutputFile(id);

	const task: BackgroundTask = {
		id,
		label,
		command,
		cwd,
		status: "running",
		createdAt: Date.now(),
		outputFile,
		filters,
		bufferSize,
		buffer: [],
		hasNewOutput: false,
	};

	const process = spawn("sh", ["-c", command], {
		cwd,
		detached: false,
		stdio: ["ignore", "pipe", "pipe"],
	});

	task.pid = process.pid;
	task.process = process;

	const handleOutput = (data: Buffer, _stream: "stdout" | "stderr") => {
		const lines = data.toString().split("\n").filter((l) => l.trim());
		for (const line of lines) {
			addToBuffer(task, line);
			writeOutputToFile(task, line);
		}
		updateWidget(ctx);
	};

	process.stdout?.on("data", (data) => handleOutput(data, "stdout"));
	process.stderr?.on("data", (data) => handleOutput(data, "stderr"));

	process.on("close", (code) => {
		task.status = code === 0 ? "stopped" : "error";
		task.exitCode = code ?? undefined;
		task.process = undefined;
		task.hasNewOutput = true;
		updateWidget(ctx);

		// Notify completion
		ctx.ui.notify(
			`Task "${label}" ${task.status} (exit ${code})`,
			task.status === "stopped" ? "info" : "error",
		);
	});

	process.on("error", (err) => {
		task.status = "error";
		task.process = undefined;
		task.hasNewOutput = true;
		updateWidget(ctx);
		ctx.ui.notify(`Task "${label}" failed: ${err.message}`, "error");
	});

	taskManager.tasks.set(id, task);
	taskManager.activeTabId = id;
	updateWidget(ctx);

	return task;
}

function stopTask(id: string): boolean {
	const task = taskManager.tasks.get(id);
	if (!task || !task.process) return false;

	task.process.kill("SIGTERM");
	task.status = "stopped";

	// Clean up output file after stopping
	try {
		if (fs.existsSync(task.outputFile)) {
			fs.unlinkSync(task.outputFile);
		}
	} catch {
		// Ignore cleanup errors
	}

	return true;
}

function pauseTask(id: string): boolean {
	const task = taskManager.tasks.get(id);
	if (!task || !task.process || task.status !== "running") return false;

	process.kill(task.pid!, "SIGSTOP");
	task.status = "paused";
	return true;
}

function resumeTask(id: string): boolean {
	const task = taskManager.tasks.get(id);
	if (!task || !task.process || task.status !== "paused") return false;

	process.kill(task.pid!, "SIGCONT");
	task.status = "running";
	return true;
}

async function restartTask(
	ctx: ExtensionContext,
	id: string,
): Promise<{ success: boolean; taskId?: string }> {
	const task = taskManager.tasks.get(id);
	if (!task) return { success: false };

	// Stop existing task
	stopTask(id);
	taskManager.tasks.delete(id);

	// Start new task
	const newTask = await startTask(
		ctx,
		id,
		task.label,
		task.command,
		task.cwd,
		task.filters,
		task.bufferSize,
	);

	return { success: true, taskId: newTask.id };
}

// Tool schemas
const ActionParam = Type.Object({
	action: StringEnum(["start", "stop", "pause", "resume", "restart"] as const),
	id: Type.Optional(Type.String()),
	label: Type.Optional(Type.String()),
	command: Type.Optional(Type.String()),
	cwd: Type.Optional(Type.String()),
	filters: Type.Optional(
		Type.Object({
			exclude: Type.Array(Type.String()),
			highlight: Type.Boolean(),
		}),
	),
	bufferSize: Type.Optional(Type.Number()),
});

// Main export
export default function (pi: ExtensionAPI) {
	// Register keyboard shortcut to open task manager
	pi.registerShortcut("ctrl+b", {
		description: "Open background tasks manager",
		handler: async (_ctx) => {
			if (taskManager.widget) {
				await taskManager.widget.showTaskManager();
			}
		},
	});

	// Register widget on session start
	pi.on("session_start", async (_event, ctx) => {
		taskManager.widget = new BackgroundWidget(ctx);
		taskManager.tasks.clear();
		taskManager.activeTabId = null;
		updateWidget(ctx);
	});

	// Auto-detect long-running commands
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return;

		const command = event.input.command;
		if (!command || typeof command !== "string") return;

		// Check if command matches background patterns
		const isLongRunning = BACKGROUND_PATTERNS.some((pattern) =>
			pattern.test(command),
		);

		if (!isLongRunning) return;

		// Prompt user to run in background
		const shouldBackground = await ctx.ui.confirm(
			"Long-running command detected",
			`"${command}" looks like it will run for a while. Run in background?\n\n• Yes (recommended) - Runs in widget, you can continue\n• No - Run normally (blocks conversation)`,
		);

		if (!shouldBackground) {
			return { continue: true };
		}

		// Extract a reasonable ID from command
		const id = (command as string)
			.replace(/npm run|yarn|pnpm/g, "")
			.trim()
			.replace(/\s+/g, "-")
			|| `task-${Date.now()}`;

		const label = (command as string).split(" ").slice(0, 3).join(" ");

		// Start as background task
		const task = await startTask(
			ctx,
			id,
			label,
			command as string,
			ctx.cwd,
			{ exclude: [], highlight: true },
			DEFAULT_BUFFER_SIZE,
		);

		return {
			block: true,
			reason: `Command running in background as task "${id}" (PID ${task.pid})`,
		};
	});

	// Main background_task tool
	pi.registerTool({
		name: "background_task",
		label: "Background Task",
		description: "Manage long-running background tasks with a tabbed widget interface",
		promptSnippet:
			"Start/stop/pause/resume background tasks. Use for dev servers, log watchers, test runners.",
		parameters: ActionParam,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const action = params.action;

			if (action === "start") {
				if (!params.id || !params.label || !params.command) {
					return {
						content: [
							{
								type: "text",
								text: "Error: 'id', 'label', and 'command' are required for start action",
							},
						],
						details: {},
					};
				}

				const startedTask = await startTask(
					ctx,
					params.id,
					params.label,
					params.command,
					params.cwd ?? ctx.cwd,
					params.filters ?? { exclude: [], highlight: true },
					params.bufferSize ?? DEFAULT_BUFFER_SIZE,
				);

				return {
					content: [
						{
							type: "text",
							text: `Started background task: ${params.label} (PID ${startedTask.pid})`,
						},
					],
					details: {
						id: startedTask.id,
						pid: startedTask.pid,
						status: startedTask.status,
					},
				};
			}

			if (action === "stop") {
				if (!params.id) {
					return {
						content: [
							{
								type: "text",
								text: "Error: 'id' is required for stop action",
							},
						],
						details: {},
					};
				}

				const success = stopTask(params.id);
				if (!success) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task "${params.id}" not found or not running`,
							},
						],
						details: {},
					};
				}

				updateWidget(ctx);
				return {
					content: [
						{
							type: "text",
							text: `Stopped background task: ${params.id}`,
						},
					],
					details: { id: params.id, status: "stopped" },
				};
			}

			if (action === "pause") {
				if (!params.id) {
					return {
						content: [
							{
								type: "text",
								text: "Error: 'id' is required for pause action",
							},
						],
						details: {},
					};
				}

				const success = pauseTask(params.id);
				if (!success) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task "${params.id}" not found or not running`,
							},
						],
						details: {},
					};
				}

				updateWidget(ctx);
				return {
					content: [
						{
							type: "text",
							text: `Paused background task: ${params.id}`,
						},
					],
					details: { id: params.id, status: "paused" },
				};
			}

			if (action === "resume") {
				if (!params.id) {
					return {
						content: [
							{
								type: "text",
								text: "Error: 'id' is required for resume action",
							},
						],
						details: {},
					};
				}

				const success = resumeTask(params.id);
				if (!success) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task "${params.id}" not found or not paused`,
							},
						],
						details: {},
					};
				}

				updateWidget(ctx);
				return {
					content: [
						{
							type: "text",
							text: `Resumed background task: ${params.id}`,
						},
					],
					details: { id: params.id, status: "running" },
				};
			}

			if (action === "restart") {
				if (!params.id) {
					return {
						content: [
							{
								type: "text",
								text: "Error: 'id' is required for restart action",
							},
						],
						details: {},
					};
				}

				const result = await restartTask(ctx, params.id);
				if (!result.success) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Task "${params.id}" not found`,
							},
						],
						details: {},
					};
				}

				updateWidget(ctx);
				return {
					content: [
						{
							type: "text",
							text: `Restarted background task: ${params.id}`,
						},
					],
					details: { id: result.taskId, status: "running" },
				};
			}

			return {
				content: [
					{
						type: "text",
						text: `Unknown action: ${action}`,
					},
				],
				details: {},
			};
		},
	});

	// list_background_tasks tool
	pi.registerTool({
		name: "list_background_tasks",
		label: "List Background Tasks",
		description: "List all running background tasks with their status",
		parameters: Type.Object({}),

		async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
			const tasks = Array.from(taskManager.tasks.values()).map((task) => ({
				id: task.id,
				label: task.label,
				command: task.command,
				status: task.status,
				pid: task.pid,
				createdAt: task.createdAt,
				exitCode: task.exitCode,
				outputFile: task.outputFile,
				bufferSize: task.bufferSize,
				bufferLineCount: task.buffer.length,
			}));

			if (tasks.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: "No background tasks running",
						},
					],
					details: { tasks: [] },
				};
			}

			const output = tasks
				.map(
					(t) =>
						`● ${t.label} (${t.id})\n  Status: ${t.status}\n  Command: ${t.command}\n  PID: ${t.pid || "N/A"}\n  Buffer: ${t.bufferLineCount}/${t.bufferSize} lines`,
				)
				.join("\n\n");

			return {
				content: [
					{
						type: "text",
						text: output,
					},
				],
				details: { tasks },
			};
		},
	});

	// background_task_output tool - retrieve output
	pi.registerTool({
		name: "background_task_output",
		label: "Background Task Output",
		description: "Retrieve output from a background task (buffer or full file)",
		parameters: Type.Object({
			id: Type.String({ description: "Task ID" }),
			full: Type.Optional(
				Type.Boolean({
					description: "Read full output from file (default: false, reads buffer only)",
				}),
			),
			offset: Type.Optional(
				Type.Number({
					description: "Line number to start from (for paging full output)",
				}),
			),
		}),

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const task = taskManager.tasks.get(params.id);
			if (!task) {
				return {
					content: [
						{
							type: "text",
							text: `Error: Task "${params.id}" not found`,
						},
					],
					details: {},
				};
			}

			if (params.full) {
				// Read from output file
				try {
					let content = fs.readFileSync(task.outputFile, { encoding: "utf-8" });

					if (params.offset !== undefined) {
						const lines = content.split("\n");
						const fromLine = Math.max(0, params.offset);
						content = lines.slice(fromLine).join("\n");
					}

					return {
						content: [
							{
								type: "text",
								text: content || "(no output)",
							},
						],
						details: {
							id: task.id,
							outputFile: task.outputFile,
							full: true,
							offset: params.offset,
						},
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error reading output file: ${(error as Error).message}`,
							},
						],
						details: {},
					};
				}
			}

			// Read from buffer
			if (task.buffer.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: "(no output in buffer)",
						},
					],
					details: { id: task.id, bufferLineCount: 0 },
				};
			}

			const content = task.buffer.join("\n");
			return {
				content: [
					{
						type: "text",
						text: content,
					},
				],
				details: {
					id: task.id,
					bufferLineCount: task.buffer.length,
					full: false,
				},
			};
		},
	});

	// Custom commands for quick access
	pi.registerCommand("bg-list", {
		description: "List all background tasks",
		handler: async (_args, ctx) => {
			const tasks = Array.from(taskManager.tasks.values());
			if (tasks.length === 0) {
				ctx.ui.notify("No background tasks running", "info");
				return;
			}

			const summary = tasks
				.map((t) => `${t.id}: ${t.status} (${t.pid})`)
				.join("\n");
			ctx.ui.notify(summary, "info");
		},
	});

	pi.registerCommand("bg-stop", {
		description: "Stop a background task by ID",
		handler: async (args, ctx) => {
			const id = args.trim();
			if (!id) {
				ctx.ui.notify("Usage: /bg-stop <task-id>", "error");
				return;
			}

			const success = stopTask(id);
			if (success) {
				ctx.ui.notify(`Stopped task: ${id}`, "info");
				updateWidget(ctx);
			} else {
				ctx.ui.notify(`Task not found: ${id}`, "error");
			}
		},
	});

	// Cleanup on session shutdown
	pi.on("session_shutdown", async () => {
		for (const [_id, task] of taskManager.tasks) {
			if (task.process && task.status === "running") {
				task.process.kill("SIGTERM");
			}

			// Clean up output files
			try {
				if (fs.existsSync(task.outputFile)) {
					fs.unlinkSync(task.outputFile);
				}
			} catch {
				// Ignore cleanup errors
			}
		}

		taskManager.tasks.clear();
		taskManager.widget = null;
		taskManager.activeTabId = null;
	});
}
