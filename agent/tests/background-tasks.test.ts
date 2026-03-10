/**
 * Tests for background-tasks extension
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn, ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

// Mock dependencies
vi.mock("node:child_process");
vi.mock("node:fs");

// Mock pi modules
vi.mock("@mariozechner/pi-coding-agent", () => ({
	// Re-export for type checking if needed
}));

vi.mock("@mariozechner/pi-tui", () => ({
	Container: class Container {
		children: any[] = [];
		addChild(child: any) {
			this.children.push(child);
		}
	},
	Spacer: class Spacer {
		constructor(public height: number) {}
	},
	Text: class Text {
		constructor(public content: string, public x: number, public y: number) {}
	},
}));

vi.mock("@sinclair/typebox", () => ({
	Type: {
		Object: vi.fn((obj: any) => obj),
		String: vi.fn(() => ({})),
		Number: vi.fn(() => ({})),
		Boolean: vi.fn(() => ({})),
		Array: vi.fn(() => []),
		Optional: vi.fn((v: any) => v),
	},
}));

vi.mock("@mariozechner/pi-ai", () => ({
	StringEnum: vi.fn((values: readonly string[]) => values),
}));

// Import after mocking
import extension from "../extensions/background-tasks";

// Helper to create mock context
function createMockContext() {
	return {
		cwd: "/test/project",
		ui: {
			notify: vi.fn(),
			confirm: vi.fn(),
			setWidget: vi.fn(),
			theme: {
				fg: vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`),
			},
		},
	};
}

// Helper to create mock extension API
function createMockAPI() {
	const handlers: Map<string, any> = new Map();
	const tools: Map<string, any> = new Map();
	const commands: Map<string, any> = new Map();

	return {
		registerShortcut: vi.fn((key: string, config: any) => {
			handlers.set(`shortcut:${key}`, config);
		}),
		registerTool: vi.fn((config: any) => {
			tools.set(config.name, config);
		}),
		registerCommand: vi.fn((name: string, config: any) => {
			commands.set(name, config);
		}),
		on: vi.fn((event: string, handler: any) => {
			handlers.set(`event:${event}`, handler);
		}),
		_handlers: handlers,
		_tools: tools,
		_commands: commands,
	};
}

describe("background-tasks extension", () => {
	let mockAPI: ReturnType<typeof createMockAPI>;

	beforeEach(async () => {
		vi.clearAllMocks();
		mockAPI = createMockAPI();

		// Initialize extension and trigger session_start to clear any existing tasks
		extension(mockAPI as any);
		const sessionStartHandler = mockAPI._handlers.get("event:session_start");
		if (sessionStartHandler) {
			await sessionStartHandler({}, createMockContext());
		}

		// Reset mock counts after setup
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("extension registration", () => {
		it("registers the keyboard shortcut", () => {
			extension(mockAPI as any);
			expect(mockAPI.registerShortcut).toHaveBeenCalledWith("ctrl+b", expect.any(Object));
		});

		it("registers the background_task tool", () => {
			extension(mockAPI as any);
			expect(mockAPI.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "background_task",
					label: "Background Task",
				}),
			);
		});

		it("registers the list_background_tasks tool", () => {
			extension(mockAPI as any);
			expect(mockAPI.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "list_background_tasks",
				}),
			);
		});

		it("registers the background_task_output tool", () => {
			extension(mockAPI as any);
			expect(mockAPI.registerTool).toHaveBeenCalledWith(
				expect.objectContaining({
					name: "background_task_output",
				}),
			);
		});

		it("registers the bg-list command", () => {
			extension(mockAPI as any);
			expect(mockAPI.registerCommand).toHaveBeenCalledWith("bg-list", expect.any(Object));
		});

		it("registers the bg-stop command", () => {
			extension(mockAPI as any);
			expect(mockAPI.registerCommand).toHaveBeenCalledWith("bg-stop", expect.any(Object));
		});

		it("registers session_start event handler", () => {
			extension(mockAPI as any);
			expect(mockAPI.on).toHaveBeenCalledWith("session_start", expect.any(Function));
		});

		it("registers tool_call event handler for auto-detection", () => {
			extension(mockAPI as any);
			expect(mockAPI.on).toHaveBeenCalledWith("tool_call", expect.any(Function));
		});

		it("registers session_shutdown event handler for cleanup", () => {
			extension(mockAPI as any);
			expect(mockAPI.on).toHaveBeenCalledWith("session_shutdown", expect.any(Function));
		});
	});

	describe("background_task tool - start action", () => {
		it("requires id, label, and command parameters", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			// Missing parameters
			const result = await tool.execute("test-id", { action: "start" }, undefined, undefined, ctx);
			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("'id', 'label', and 'command' are required");
		});

		it("starts a task with valid parameters", async () => {
			const mockProcess = {
				pid: 12345,
				stdout: { on: vi.fn() },
				stderr: { on: vi.fn() },
				on: vi.fn(),
				kill: vi.fn(),
			};
			(spawn as any).mockReturnValue(mockProcess);
			(fs.existsSync as any).mockReturnValue(false);
			(fs.appendFileSync as any).mockImplementation(() => {});

			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			const result = await tool.execute(
				"test-id",
				{
					action: "start",
					id: "dev-server",
					label: "Dev Server",
					command: "npm run dev",
				},
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("Started background task");
			expect(result.details.id).toBe("dev-server");
			expect(result.details.pid).toBe(12345);
			expect(result.details.status).toBe("running");
		});
	});

	describe("background_task tool - stop action", () => {
		it("requires id parameter", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			const result = await tool.execute("test-id", { action: "stop" }, undefined, undefined, ctx);
			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("'id' is required");
		});

		it("returns error for non-existent task", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			const result = await tool.execute(
				"test-id",
				{ action: "stop", id: "non-existent" },
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("not found");
		});
	});

	describe("background_task tool - pause action", () => {
		it("requires id parameter", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			const result = await tool.execute("test-id", { action: "pause" }, undefined, undefined, ctx);
			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("'id' is required");
		});
	});

	describe("background_task tool - resume action", () => {
		it("requires id parameter", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			const result = await tool.execute("test-id", { action: "resume" }, undefined, undefined, ctx);
			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("'id' is required");
		});
	});

	describe("background_task tool - restart action", () => {
		it("requires id parameter", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();

			const result = await tool.execute("test-id", { action: "restart" }, undefined, undefined, ctx);
			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("'id' is required");
		});
	});

	describe("list_background_tasks tool", () => {
		it("returns empty list when no tasks", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("list_background_tasks");
			const ctx = createMockContext();

			const result = await tool.execute("test-id", {}, undefined, undefined, ctx);
			expect(result.content[0].text).toBe("No background tasks running");
			expect(result.details.tasks).toEqual([]);
		});
	});

	describe("background_task_output tool", () => {
		it("returns error for non-existent task", async () => {
			extension(mockAPI as any);
			const tool = mockAPI._tools.get("background_task_output");
			const ctx = createMockContext();

			const result = await tool.execute(
				"test-id",
				{ id: "non-existent" },
				undefined,
				undefined,
				ctx,
			);

			expect(result.content[0].text).toContain("Error");
			expect(result.content[0].text).toContain("not found");
		});
	});

	describe("auto-detection of long-running commands", () => {
		it("detects 'npm run dev' as long-running", async () => {
			extension(mockAPI as any);
			const handler = mockAPI._handlers.get("event:tool_call");
			const ctx = createMockContext();

			ctx.ui.confirm.mockResolvedValue(false); // User declines

			const result = await handler(
				{ toolName: "bash", input: { command: "npm run dev" } },
				ctx,
			);

			// Should have prompted user
			expect(ctx.ui.confirm).toHaveBeenCalled();
		});

		it("does not detect short commands as long-running", async () => {
			extension(mockAPI as any);
			const handler = mockAPI._handlers.get("event:tool_call");
			const ctx = createMockContext();

			const result = await handler(
				{ toolName: "bash", input: { command: "ls -la" } },
				ctx,
			);

			// Should not prompt
			expect(ctx.ui.confirm).not.toHaveBeenCalled();
		});

		it("starts background task when user confirms", async () => {
			const mockProcess = {
				pid: 54321,
				stdout: { on: vi.fn() },
				stderr: { on: vi.fn() },
				on: vi.fn(),
				kill: vi.fn(),
			};
			(spawn as any).mockReturnValue(mockProcess);
			(fs.existsSync as any).mockReturnValue(false);
			(fs.appendFileSync as any).mockImplementation(() => {});

			extension(mockAPI as any);
			const handler = mockAPI._handlers.get("event:tool_call");
			const ctx = createMockContext();

			ctx.ui.confirm.mockResolvedValue(true); // User accepts

			const result = await handler(
				{ toolName: "bash", input: { command: "npm run dev" } },
				ctx,
			);

			// Should have blocked the original tool call
			expect(result).toEqual({
				block: true,
				reason: expect.stringContaining("running in background"),
			});
		});
	});

	describe("session shutdown cleanup", () => {
		it("kills running processes on shutdown", async () => {
			const mockProcess = {
				pid: 12345,
				stdout: { on: vi.fn() },
				stderr: { on: vi.fn() },
				on: vi.fn(),
				kill: vi.fn(),
			};
			(spawn as any).mockReturnValue(mockProcess);
			(fs.existsSync as any).mockReturnValue(false);
			(fs.appendFileSync as any).mockImplementation(() => {});

			extension(mockAPI as any);

			// Start a task
			const tool = mockAPI._tools.get("background_task");
			const ctx = createMockContext();
			await tool.execute(
				"test-id",
				{ action: "start", id: "test", label: "Test", command: "sleep 100" },
				undefined,
				undefined,
				ctx,
			);

			// Trigger shutdown
			const shutdownHandler = mockAPI._handlers.get("event:session_shutdown");
			await shutdownHandler();

			// Process should be killed
			expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");
		});
	});
});
