/**
 * Agent discovery and configuration
 *
 * Standalone version extended with Claude Code agent bridge.
 * Scans ~/.claude/agents/ for Claude-format agent definitions and
 * translates them into Pi-compatible AgentConfig entries.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseFrontmatter } from "@mariozechner/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

/**
 * Map Claude Code tool names to Pi tool names.
 * Unknown tools not in this map are silently dropped.
 */
const CLAUDE_TOOL_MAP: Record<string, string> = {
	"Glob": "find",
	"Grep": "grep",
	"Read": "read",
	"Write": "write",
	"Edit": "edit",
	"Bash": "bash",
	"WebSearch": "bash",
	"WebFetch": "bash",
	"NotebookEdit": "write",
};

/**
 * Map Claude model shorthand names to OpenRouter model IDs.
 * If a model is not in the map and not undefined, it passes through as-is.
 */
const CLAUDE_MODEL_MAP: Record<string, string> = {
	"haiku": "anthropic/claude-haiku-4-5",
	"sonnet": "anthropic/claude-sonnet-4-5",
	"opus": "anthropic/claude-opus-4",
};

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		const tools = frontmatter.tools
			?.split(",")
			.map((t: string) => t.trim())
			.filter(Boolean);

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: tools && tools.length > 0 ? tools : undefined,
			model: frontmatter.model,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

/**
 * Recursively scan a directory for *.md files and parse them as Claude Code
 * agent definitions, translating tools and model to Pi equivalents.
 */
function loadClaudeAgentsRecursive(dir: string): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true } as any);
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		// Build the full path — entry.parentPath is set when using { recursive: true }
		const parentDir = (entry as any).parentPath ?? (entry as any).path ?? dir;
		const filePath = path.join(parentDir, entry.name);

		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<Record<string, any>>(content);

		if (!frontmatter.name || !frontmatter.description) {
			continue;
		}

		// Handle both tools formats:
		//   String format: "Bash, Read, Write" (comma-separated)
		//   Array format:  ["Read", "Write"] (YAML array)
		const rawTools = Array.isArray(frontmatter.tools)
			? frontmatter.tools.map((t: string) => t.trim())
			: frontmatter.tools?.split(",").map((t: string) => t.trim()).filter(Boolean);

		// Translate Claude tool names to Pi tool names, drop unknown tools
		let translatedTools: string[] | undefined;
		if (rawTools && rawTools.length > 0) {
			const mapped: string[] = [];
			for (const tool of rawTools) {
				const piTool = CLAUDE_TOOL_MAP[tool];
				if (piTool) {
					mapped.push(piTool);
				} else {
					process.stderr.write(`[claude-agent-bridge] Dropping unknown tool "${tool}" from agent "${frontmatter.name}"\n`);
				}
			}
			// Deduplicate
			const unique = [...new Set(mapped)];
			translatedTools = unique.length > 0 ? unique : undefined;
		}

		// Translate model via CLAUDE_MODEL_MAP; pass through if not in map and not undefined
		let model: string | undefined;
		if (frontmatter.model !== undefined && frontmatter.model !== null) {
			const modelStr = String(frontmatter.model);
			model = CLAUDE_MODEL_MAP[modelStr] ?? modelStr;
		}

		// Ignore skills, color, hooks fields — they are Claude-specific

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			tools: translatedTools,
			model,
			systemPrompt: body,
			source: "user",
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, ".pi", "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(os.homedir(), ".pi", "agent", "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	// Load Claude Code agents when scope includes "user"
	let claudeAgents: AgentConfig[] = [];
	if (scope === "user" || scope === "both") {
		const claudeDir = path.join(os.homedir(), ".claude", "agents");
		claudeAgents = loadClaudeAgentsRecursive(claudeDir);
	}

	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		// Claude agents first (lowest priority)
		for (const agent of claudeAgents) agentMap.set(agent.name, agent);
		// Then user agents (higher priority, overwrites conflicts)
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		// Then project agents (highest priority, overwrites conflicts)
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		// Claude agents first (lower priority)
		for (const agent of claudeAgents) agentMap.set(agent.name, agent);
		// Then user agents (higher priority, overwrites conflicts)
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

export function formatAgentList(agents: AgentConfig[], maxItems: number): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed.map((a) => `${a.name} (${a.source}): ${a.description}`).join("; "),
		remaining,
	};
}
