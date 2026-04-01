/**
 * Enforce Subagent Extension
 *
 * Blocks direct use of modification tools (bash, write, edit) after an
 * exploration phase, requiring the agent to use subagent delegation instead.
 *
 * Commands:
 *   /subagent-enforce on|off|status  — Toggle or check enforcement
 *   /subagent-threshold <n>          — Set turn threshold (default: 3)
 *
 * The enforcement kicks in after N turns, allowing initial exploration
 * with read-only tools (read, grep, find, ls) before requiring delegation
 * for any modifications.
 *
 * Settings persist across sessions via ~/.pi/agent/enforce-subagent-config.json
 */

import { isToolCallEventType, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "fs";
import * as path from "path";

interface EnforceConfig {
	enabled: boolean;
	threshold: number;
	blockedTools: string[];
	hintShown: boolean;
}

interface PersistedConfig {
	enabled?: boolean;
	threshold?: number;
}

const DEFAULT_CONFIG: EnforceConfig = {
	enabled: true,
	threshold: 3,
	blockedTools: ["bash", "write", "edit"],
	hintShown: false,
};

const CONFIG_PATH = path.join(
	process.env.HOME || process.env.USERPROFILE || "~",
	".pi",
	"agent",
	"enforce-subagent-config.json"
);

function loadPersistedConfig(): PersistedConfig {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
			return JSON.parse(raw) as PersistedConfig;
		}
	} catch {
		// Ignore parse errors, use defaults
	}
	return {};
}

function savePersistedConfig(partial: PersistedConfig): void {
	try {
		const dir = path.dirname(CONFIG_PATH);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}
		// Merge with existing file
		const existing = loadPersistedConfig();
		const merged = { ...existing, ...partial };
		fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + "\n", "utf-8");
	} catch {
		// Silently fail — persistence is best-effort
	}
}

export default function (pi: ExtensionAPI) {
	// Load persisted settings on startup
	const persisted = loadPersistedConfig();
	const config: EnforceConfig = {
		...DEFAULT_CONFIG,
		...(persisted.enabled !== undefined && { enabled: persisted.enabled }),
		...(persisted.threshold !== undefined && { threshold: persisted.threshold }),
	};
	let turnCount = 0;

	// Track turns
	pi.on("turn_end", async () => {
		turnCount++;
	});

	// Reset on new session
	pi.on("session_start", async () => {
		turnCount = 0;
		config.hintShown = false;
	});

	// Inject guidance into system prompt
	pi.on("before_agent_start", async (event) => {
		if (!config.enabled) return;

		const status = turnCount < config.threshold ? "exploration" : "enforced";
		const remaining = Math.max(0, config.threshold - turnCount);

		const guidance = `

## Subagent Enforcement [${status.toUpperCase()}]

${turnCount < config.threshold 
	? `You have ${remaining} turn${remaining !== 1 ? "s" : ""} of exploration remaining. Use read, grep, find, ls to understand the codebase.`
	: `Direct use of modification tools (${config.blockedTools.join(", ")}) is BLOCKED. You MUST use subagent delegation.`}

### Subagent Tool Usage

**Single task:**
\`\`\`
subagent({ agent: "worker", task: "Your task description" })
\`\`\`

**Parallel tasks (independent work):**
\`\`\`
subagent({ tasks: [
  { agent: "worker", task: "Task 1" },
  { agent: "worker", task: "Task 2" }
]})
\`\`\`

**Chain tasks (sequential with context passing):**
\`\`\`
subagent({ chain: [
  { agent: "worker", task: "Do initial work" },
  { agent: "reviewer", task: "Review the work: {previous}" }
]})
\`\`\`

Available agents: worker, researcher, reviewer (or define your own in ~/.pi/agent/agents/)
`;

		return {
			systemPrompt: event.systemPrompt + guidance,
		};
	});

	// Block tool calls after threshold
	pi.on("tool_call", async (event, ctx) => {
		if (!config.enabled) return;
		if (turnCount < config.threshold) return;

		for (const toolName of config.blockedTools) {
			if (isToolCallEventType(toolName as any, event)) {
				// Show notification once
				if (!config.hintShown && ctx.hasUI) {
					ctx.ui.notify(
						`Direct '${toolName}' blocked — use subagent delegation`,
						"warning"
					);
					config.hintShown = true;
				}

				return {
					block: true,
					reason: `ENFORCED: Direct use of '${toolName}' is blocked after ${config.threshold} turns.

You MUST use subagent delegation for modifications. Example:

subagent({
  agent: "worker",
  task: "Use ${toolName} to: ${(event as any).input?.command || (event as any).input?.path || 'your task'}"
})

For multiple independent tasks, use parallel mode:
subagent({ tasks: [{ agent: "worker", task: "..." }, ...] })

For sequential work with context passing, use chain mode:
subagent({ chain: [{ agent: "worker", task: "..." }, ...] })`,
				};
			}
		}
	});

	// Register commands
	pi.registerCommand("subagent-enforce", {
		description: "Toggle or check subagent enforcement (on|off|status)",
		handler: async (args, ctx) => {
			const action = args?.trim().toLowerCase();

			if (action === "on") {
				config.enabled = true;
				savePersistedConfig({ enabled: true });
				ctx.ui.notify("Subagent enforcement ENABLED (persisted)", "info");
			} else if (action === "off") {
				config.enabled = false;
				savePersistedConfig({ enabled: false });
				ctx.ui.notify("Subagent enforcement DISABLED (persisted)", "warning");
			} else if (action === "status" || !action) {
				ctx.ui.notify(
					`Subagent enforcement: ${config.enabled ? "ON" : "OFF"}\n` +
					`Threshold: ${config.threshold} turns\n` +
					`Current turn: ${turnCount}\n` +
					`Status: ${turnCount < config.threshold ? "exploration" : "enforced"}`,
					"info"
				);
			} else {
				ctx.ui.notify(
					"Usage: /subagent-enforce on|off|status",
					"warning"
				);
			}
		},
	});

	pi.registerCommand("subagent-threshold", {
		description: "Set turn threshold for subagent enforcement",
		handler: async (args, ctx) => {
			const value = parseInt(args?.trim() || "");
			
			if (isNaN(value) || value < 0) {
				ctx.ui.notify(
					"Usage: /subagent-threshold <number>\n" +
					`Current: ${config.threshold} turns`,
					"warning"
				);
				return;
			}

			config.threshold = value;
			savePersistedConfig({ threshold: value });
			ctx.ui.notify(
				`Threshold set to ${value} turn${value !== 1 ? "s" : ""} (persisted)`,
				"info"
			);
		},
	});

	// Expose config for other extensions if needed
	(pi as any).__enforceSubagentConfig = config;
}
