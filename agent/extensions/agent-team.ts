/**
 * Agent Team — Dispatcher-only orchestrator with grid dashboard
 *
 * The primary Pi agent has NO codebase tools. It can ONLY delegate work
 * to specialist agents via the `dispatch_agent` tool. Each specialist
 * maintains its own Pi session for cross-invocation memory.
 *
 * Loads agent definitions from agents/*.md, .claude/agents/*.md, .pi/agents/*.md.
 * Teams are discovered folder-first from agents/teams/{name}/team.yaml (and equivalent
 * search roots), with fallback to .pi/agents/teams.yaml for unmigrated teams.
 * Folder-defined teams take precedence over teams.yaml entries.
 *
 * Commands:
 *   /agents-team          — switch active team
 *   /agents-list          — list loaded agents
 *   /agents-grid N|auto   — set column count (1-6) or auto-size by team
 *   /agents-view <mode>   — switch between compact|cards|toggle
 *
 * Usage: pi -e extensions/agent-team.ts
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text, type AutocompleteItem, truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { spawn } from "child_process";
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, appendFileSync } from "fs";
import { join, resolve, basename } from "path";
import { homedir, tmpdir } from "os";
import { randomUUID } from "crypto";
import { applyExtensionDefaults } from "./themeMap.ts";

// ── Types ────────────────────────────────────────

interface AgentDef {
	name: string;
	description: string;
	model?: string;
	tools: string;
	systemPrompt: string;
	file: string;
}

interface AgentState {
	def: AgentDef;
	status: "idle" | "running" | "done" | "error";
	task: string;
	toolCount: number;
	elapsed: number;
	lastWork: string;
	contextPct: number;
	sessionFile: string | null;
	runCount: number;
	timer?: ReturnType<typeof setInterval>;
}

type ViewMode = "cards" | "compact";

interface TeamMeta {
	name: string;
	agents: string[];
	dispatcher: string;
	brief: string;
	source: "folder" | "yaml";
	dir: string;
}

// ─── Team Communication Types ────────────────────────────────────────────────

interface ChannelMessage {
	id: string;
	timestamp: string;
	from_agent: string;
	message_type: "discovery" | "decision" | "warning" | "question" | "disagreement";
	content: string;
	references?: string[];
	priority?: "low" | "normal" | "high";
}

interface InputRequest {
	id: string;
	timestamp: string;
	from_agent: string;
	to_agent: string;
	question: string;
	context?: string;
}

interface InputResponse {
	request_id: string;
	timestamp: string;
	from_agent: string;
	content: string;
	status: "answered" | "declined" | "timeout";
}

// Team comms constants
const COMMS_DIR_NAME = ".pi/team-comms";
const COMMS_CHANNEL_FILE = "channel.jsonl";
const COMMS_REQUESTS_DIR = "requests";
const COMMS_RESPONSES_DIR = "responses";
const REQUEST_WATCHER_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 120_000;
const COMMS_DEBUG = process.env.PI_COMMS_DEBUG === "1";


// ─── Team Communication Helpers ──────────────────────────────────────────────

function getCommsDir(cwd: string): string {
  return resolve(cwd, COMMS_DIR_NAME);
}

function ensureCommsDirs(commsDir: string): void {
  mkdirSync(commsDir, { recursive: true });
  mkdirSync(join(commsDir, COMMS_REQUESTS_DIR), { recursive: true });
  mkdirSync(join(commsDir, COMMS_RESPONSES_DIR), { recursive: true });
}

function readContextFile(tDir: string): string {
  if (!tDir) return "";
  const p = join(tDir, "context.md");
  if (!existsSync(p)) return "";
  try { return readFileSync(p, "utf-8").trim(); } catch { return ""; }
}

function readExpertiseFile(tDir: string, agentName: string): string {
  if (!tDir) return "";
  const slug = agentName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const p = join(tDir, "expertise", `${slug}.md`);
  if (!existsSync(p)) return "";
  try {
    const content = readFileSync(p, "utf-8").trim();
    if (Buffer.byteLength(content) > 65536) {
      return Buffer.from(content).subarray(0, 65536).toString("utf-8") + "\n\n[expertise truncated]";
    }
    return content;
  } catch { return ""; }
}

interface SessionNote { timestamp: string; note: string; }

function readSessionNotes(tDir: string, agentName: string, limit: number = 20): SessionNote[] {
  if (!tDir) return [];
  const slug = agentName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const p = join(tDir, "session-notes", `${slug}.jsonl`);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, "utf-8");
    const entries = raw.split("\n").filter(l => l.trim()).map(line => {
      try { return JSON.parse(line) as SessionNote; } catch { return null; }
    }).filter((n): n is SessionNote => n !== null);
    return entries.slice(-limit);
  } catch { return []; }
}

function formatSessionNotesBlock(notes: SessionNote[]): string {
  if (notes.length === 0) return "";
  const lines = notes.map(n => `- **${n.timestamp}**: ${n.note}`);
  return "\n## Recent Session Notes\n\n" + lines.join("\n") + "\n";
}

function formatExpertiseBlock(content: string): string {
  if (!content) return "";
  return "\n## Your Expertise\n\n" + content + "\n";
}

function formatContextBlock(content: string): string {
  if (!content) return "";
  return "\n## Shared Domain Context\n\n" + content + "\n";
}

function readChannelMessages(cwd: string): ChannelMessage[] {
  const channelFile = join(getCommsDir(cwd), COMMS_CHANNEL_FILE);
  if (!existsSync(channelFile)) return [];
  try {
    const raw = readFileSync(channelFile, "utf-8");
    return raw.split("\n").filter((line) => line.trim()).map((line) => {
      try { return JSON.parse(line) as ChannelMessage; } catch { return null; }
    }).filter((msg): msg is ChannelMessage => msg !== null);
  } catch { return []; }
}

function curateMessagesForAgent(messages: ChannelMessage[], agentName: string): ChannelMessage[] {
  const MAX_CURATED = 20;
  const mentionsAgent = messages.filter((m) => m.from_agent !== agentName && m.content.toLowerCase().includes(agentName.toLowerCase()));
  const highPriority = messages.filter((m) => m.from_agent !== agentName && m.priority === "high" && !mentionsAgent.includes(m));
  const rest = messages.filter((m) => m.from_agent !== agentName && !mentionsAgent.includes(m) && !highPriority.includes(m));
  return [...mentionsAgent, ...highPriority, ...rest.slice(-MAX_CURATED)].slice(-MAX_CURATED);
}

function formatCuratedMessages(messages: ChannelMessage[]): string {
  if (messages.length === 0) return "";
  const lines = messages.map((m) => {
    const icon: Record<string, string> = { discovery: "🔍", decision: "✅", warning: "⚠️", question: "❓", disagreement: "🔴" };
    const refs = m.references?.length ? " [refs: " + m.references.join(", ") + "]" : "";
    return (icon[m.message_type] || "💬") + " **" + m.from_agent + "** (" + m.message_type + "): " + m.content + refs;
  });
  return "\n## Team Channel (Recent Messages)\n\n" + lines.join("\n\n") + "\n";
}
// ─── Request Routing State ───────────────────────────────────────────────────

let agentStates: Map<string, AgentState> = new Map();
const agentMessageCounts = new Map<string, number>();
const activeRequests = new Map<string, InputRequest>();
const processedRequestIds = new Map<string, number>();
const inFlightTargets = new Map<string, string>();
let watcherRunning = false;
let activeTeamDir: string = "";

function writeDeclinedResponse(responsesDir: string, requestId: string, fromAgent: string, reason: string): void {
  const response: InputResponse = {
    request_id: requestId,
    timestamp: new Date().toISOString(),
    from_agent: fromAgent,
    content: reason,
    status: "declined",
  };
  writeFileSync(join(responsesDir, `${requestId}.json`), JSON.stringify(response, null, 2), "utf-8");
}
function watcherLog(commsDir: string, msg: string): void {
  if (!COMMS_DEBUG) return;
  try {
    const logFile = join(commsDir, "watcher.log");
    appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`, "utf-8");
  } catch {}
}

function startRequestWatcher(cwd: string, ctx: any): void {
  if (watcherRunning) return;
  watcherRunning = true;
  const commsDir = getCommsDir(cwd);
  const requestsDir = join(commsDir, COMMS_REQUESTS_DIR);
  const responsesDir = join(commsDir, COMMS_RESPONSES_DIR);
  watcherLog(commsDir, `watcher started for path: ${requestsDir} | agentStates size: ${agentStates.size}`);

  async function tick() {
    if (!watcherRunning) return;
    watcherLog(commsDir, `watcher tick at ${new Date().toISOString()}`);

    const now = Date.now();
    for (const [id, ts] of processedRequestIds) {
      if (now - ts > 5 * 60 * 1000) processedRequestIds.delete(id);
    }

    const messages = readChannelMessages(cwd);
    agentMessageCounts.clear();
    for (const msg of messages) {
      agentMessageCounts.set(msg.from_agent, (agentMessageCounts.get(msg.from_agent) || 0) + 1);
    }

    ensureCommsDirs(commsDir);
    const dirExists = existsSync(requestsDir);
    watcherLog(commsDir, `requestsDir exists: ${dirExists}`);
    if (dirExists) {
      try {
        const files = readdirSync(requestsDir).filter((f: string) => f.endsWith(".json"));
        watcherLog(commsDir, `found ${files.length} files: [${files.join(", ")}]`);
        for (const file of files) {
          const requestId = file.replace(".json", "");
          watcherLog(commsDir, `checking requestId=${requestId} inMap=${processedRequestIds.has(requestId)} mapSize=${processedRequestIds.size}`);
          if (processedRequestIds.has(requestId)) continue;
          watcherLog(commsDir, `processing request ${requestId}`);
          const requestFile = join(requestsDir, file);
          try {
            const raw = readFileSync(requestFile, "utf-8");
            const request: InputRequest = JSON.parse(raw);
            activeRequests.set(requestId, request);
            await handleInputRequest(request, cwd, responsesDir, ctx);
            watcherLog(commsDir, `handled request ${requestId}`);
            processedRequestIds.set(requestId, Date.now());
            try { unlinkSync(join(requestsDir, file)); } catch {}
          } catch (err) {
            watcherLog(commsDir, `error parsing request ${requestId}: ${err}`);
            processedRequestIds.set(requestId, Date.now());
            writeDeclinedResponse(responsesDir, requestId, "system", "Malformed request");
          }
        }
      } catch (err) {
        watcherLog(commsDir, `error in watcher outer try: ${err}`);
      }
    }

    if (watcherRunning) setTimeout(tick, REQUEST_WATCHER_INTERVAL_MS);
  }

  setTimeout(tick, REQUEST_WATCHER_INTERVAL_MS);
}

function stopRequestWatcher(): void {
  watcherRunning = false;
  processedRequestIds.clear();
  activeRequests.clear();
  agentMessageCounts.clear();
  inFlightTargets.clear();
}
async function handleInputRequest(request: InputRequest, cwd: string, responsesDir: string, ctx: any): Promise<void> {
  const commsDir = getCommsDir(cwd);
  const targetKey = request.to_agent.toLowerCase().replace(/\s+/g, "-");
  const targetState = agentStates.get(targetKey);
  watcherLog(commsDir, `handleInputRequest: to_agent="${request.to_agent}" targetKey="${targetKey}" found=${!!targetState} agentStates.size=${agentStates.size} keys=[${Array.from(agentStates.keys()).join(", ")}]`);
  if (!targetState) {
    writeDeclinedResponse(responsesDir, request.id, "system",
      `Agent "${request.to_agent}" is not on this team. Available: ${Array.from(agentStates.keys()).join(", ")}`);
    activeRequests.delete(request.id);
    return;
  }
  if (targetState.status === "running") {
    writeDeclinedResponse(responsesDir, request.id, request.to_agent,
      `${request.to_agent} is currently busy. Try again later or ask a different teammate.`);
    activeRequests.delete(request.id);
    return;
  }
  if (inFlightTargets.has(targetKey)) {
    writeDeclinedResponse(responsesDir, request.id, request.to_agent,
      `${request.to_agent} is handling another request. Try again shortly.`);
    activeRequests.delete(request.id);
    return;
  }
  inFlightTargets.set(targetKey, request.id);
  const formattedTask = `A teammate (${request.from_agent}) is asking for your input:\n\n**Question:** ${request.question}${request.context ? `\n\n**Context:** ${request.context}` : ""}\n\nPlease provide a helpful, focused response.`;
  try {
    const agentSessionFile = join(cwd, ".pi", "agent-sessions", `${targetKey}.json`);
    const commsDir = getCommsDir(cwd);

    // Build full context prompt (same as dispatchAgent)
    const teamRoster = Array.from(agentStates.values())
      .map(s => `- ${s.def.name}: ${s.def.description}`)
      .join("\n");
    const hTeamRosterBlock = `## Your Team\nYou are ${targetState.def.name} on a team with:\n${teamRoster}\n\n## Team Communication\nYou have two tools for team communication:\n- post_to_channel: Share discoveries, decisions, warnings, or disagreements with the team\n- request_input: Ask a specific teammate a question and wait for their response`;
    const hAllMessages = readChannelMessages(cwd);
    const hCurated = curateMessagesForAgent(hAllMessages, targetKey);
    const hCuratedMessagesBlock = formatCuratedMessages(hCurated);
    const hContextContent = readContextFile(activeTeamDir);
    const hContextBlock = formatContextBlock(hContextContent);
    const hExpertiseContent = readExpertiseFile(activeTeamDir, targetKey);
    const hExpertiseBlock = formatExpertiseBlock(hExpertiseContent);
    const hSessionNotes = readSessionNotes(activeTeamDir, targetKey);
    const hSessionNotesBlock = formatSessionNotesBlock(hSessionNotes);

    const hCombinedPrompt = `${hContextBlock}${hTeamRosterBlock}${hCuratedMessagesBlock}${hExpertiseBlock}\n\n${targetState.def.systemPrompt}${hSessionNotesBlock}`;
    const reqPromptFile = join(tmpdir(), `pi-team-req-prompt-${targetKey}-${randomUUID()}.txt`);
    writeFileSync(reqPromptFile, hCombinedPrompt, "utf-8");

    const args = [
      "--mode", "json", "-p",
      "--no-extensions", "-e", resolve(homedir(), ".pi/agent/extensions/team-comms.ts"),
      "--model", targetState.def.model || "anthropic/claude-sonnet-4-20250514",
      "--tools", targetState.def.tools,
      "--thinking", "off",
      "--append-system-prompt", reqPromptFile,
      "--session", agentSessionFile,
    ];
    if (existsSync(agentSessionFile)) args.push("-c");
    args.push(formattedTask);
    const proc = spawn("pi", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PI_AGENT_NAME: targetKey, PI_TEAM_COMMS_DIR: commsDir, PI_TEAM_DIR: activeTeamDir, PI_COMMS_DEPTH: "1" },
    });
    let output = "";
    let hBuffer = "";
    proc.stdout!.setEncoding("utf-8");
    proc.stdout!.on("data", (chunk: string) => {
      hBuffer += chunk;
      const hLines = hBuffer.split("\n");
      hBuffer = hLines.pop() || "";
      for (const line of hLines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "message_update") {
            const delta = event.assistantMessageEvent;
            if (delta?.type === "text_delta") {
              output += delta.delta || "";
            }
          }
        } catch {}
      }
    });
    await new Promise<void>((res) => {
      proc.on("close", (code) => {
        inFlightTargets.delete(targetKey);
        try { unlinkSync(reqPromptFile); } catch {}
        const failed = code !== 0 || !output.trim();
        const response: InputResponse = {
          request_id: request.id, timestamp: new Date().toISOString(),
          from_agent: targetKey,
          content: failed ? `Agent error (exit code ${code ?? "unknown"})` : output,
          status: failed ? "declined" : "answered",
        };
        writeFileSync(join(responsesDir, `${request.id}.json`), JSON.stringify(response, null, 2), "utf-8");
        activeRequests.delete(request.id);
        res();
      });
      proc.on("error", () => {
        inFlightTargets.delete(targetKey);
      });
    });
  } catch (err) {
    inFlightTargets.delete(targetKey);
    writeDeclinedResponse(responsesDir, request.id, request.to_agent, `Error dispatching ${request.to_agent}: ${err}`);
    activeRequests.delete(request.id);
  }
}
// ── Preference Persistence ────────────────────────

interface TeamPrefs {
	viewMode?: ViewMode;
	gridCols?: number;
}

const PREFS_DIR = join(homedir(), ".pi", "agent", "preferences");
const PREFS_FILE = join(PREFS_DIR, "agent-team.json");

function loadPreferences(): TeamPrefs {
	try {
		const raw = readFileSync(PREFS_FILE, "utf-8");
		const data = JSON.parse(raw);
		const prefs: TeamPrefs = {};
		if (data.viewMode === "cards" || data.viewMode === "compact") {
			prefs.viewMode = data.viewMode;
		}
		const cols = typeof data.gridCols === "number" ? data.gridCols : NaN;
		if (Number.isInteger(cols) && cols >= 1 && cols <= 6) {
			prefs.gridCols = cols;
		}
		return prefs;
	} catch {}
	return {};
}

function savePreferences(prefs: Partial<TeamPrefs>, deleteKeys?: (keyof TeamPrefs)[]): void {
	try {
		// Merge with existing prefs so we don't clobber the other field
		const existing = loadPreferences();
		const merged = { ...existing, ...prefs };
		if (deleteKeys) {
			for (const k of deleteKeys) delete merged[k];
		}
		if (!existsSync(PREFS_DIR)) {
			mkdirSync(PREFS_DIR, { recursive: true });
		}
		writeFileSync(PREFS_FILE, JSON.stringify(merged, null, 2) + "\n", "utf-8");
	} catch {}
}

// ── Display Name Helper ──────────────────────────

function displayName(name: string): string {
	return name.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── Teams YAML Parser ────────────────────────────

function parseTeamsYaml(raw: string): Record<string, string[]> {
	const teams: Record<string, string[]> = {};
	let current: string | null = null;
	for (const line of raw.split("\n")) {
		const teamMatch = line.match(/^(\S[^:]*):$/);
		if (teamMatch) {
			current = teamMatch[1].trim();
			teams[current] = [];
			continue;
		}
		const itemMatch = line.match(/^\s+-\s+(.+)$/);
		if (itemMatch && current) {
			teams[current].push(itemMatch[1].trim());
		}
	}
	return teams;
}

function parseTeamYaml(teamDir: string): TeamMeta | null {
	try {
		const teamYamlPath = join(teamDir, "team.yaml");
		if (!existsSync(teamYamlPath)) return null;

		const raw = readFileSync(teamYamlPath, "utf-8");
		let name = basename(teamDir);
		let agents: string[] = [];
		let inAgentsBlock = false;

		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (trimmed.startsWith("#") || trimmed.length === 0) continue;
			if (trimmed.startsWith("name:")) {
				name = trimmed.slice(5).trim();
				inAgentsBlock = false;
				continue;
			}
			if (trimmed.startsWith("agents:")) {
				const agentStr = trimmed.slice(7).trim();
				if (agentStr.startsWith("[")) {
					agents = agentStr
						.replace(/[\[\]]/g, "")
						.split(",")
						.map((a) => a.trim())
						.filter(Boolean);
					inAgentsBlock = false;
				} else {
					inAgentsBlock = true;
				}
				continue;
			}
			if (inAgentsBlock) {
				const itemMatch = line.match(/^\s+-\s+(.+)$/);
				if (itemMatch) {
					agents.push(itemMatch[1].trim());
					continue;
				}
				if (!line.startsWith(" ")) {
					inAgentsBlock = false;
				}
			}
		}

		if (!name || agents.length === 0) return null;

		let dispatcher = "";
		const dispatcherPath = join(teamDir, "dispatcher.md");
		if (existsSync(dispatcherPath)) {
			dispatcher = readFileSync(dispatcherPath, "utf-8");
			if (dispatcher.startsWith("---")) {
				const endIdx = dispatcher.indexOf("---", 3);
				if (endIdx !== -1) {
					dispatcher = dispatcher.slice(endIdx + 3).trim();
				}
			}
		}

		let brief = "";
		const briefPath = join(teamDir, "brief.md");
		if (existsSync(briefPath)) {
			brief = readFileSync(briefPath, "utf-8");
		}

		return { name, agents, dispatcher, brief, source: "folder", dir: teamDir };
	} catch {
		return null;
	}
}

function scanTeamFolders(searchPaths: string[]): Record<string, TeamMeta> {
	const discovered: Record<string, TeamMeta> = {};

	for (const basePath of searchPaths) {
		const teamsDir = join(basePath, "teams");
		if (!existsSync(teamsDir)) continue;

		let entries: ReturnType<typeof readdirSync> = [];
		try {
			entries = readdirSync(teamsDir, { withFileTypes: true });
		} catch {
			continue;
		}

		const sorted = entries
			.filter((entry: any) => entry.isDirectory())
			.sort((a: any, b: any) => a.name.localeCompare(b.name));

		for (const entry of sorted as any[]) {
			const teamDir = join(teamsDir, entry.name);
			const meta = parseTeamYaml(teamDir);
			if (meta && !discovered[meta.name]) {
				discovered[meta.name] = meta;
			}
		}
	}

	return discovered;
}

// ── Frontmatter Parser ───────────────────────────

function parseAgentFile(filePath: string): AgentDef | null {
	try {
		const raw = readFileSync(filePath, "utf-8");
		const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
		if (!match) return null;

		const frontmatter: Record<string, string> = {};
		for (const line of match[1].split("\n")) {
			const idx = line.indexOf(":");
			if (idx > 0) {
				frontmatter[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
			}
		}

		if (!frontmatter.name) return null;

		return {
			name: frontmatter.name,
			description: frontmatter.description || "",
			model: frontmatter.model || undefined,
			tools: frontmatter.tools || "read,grep,find,ls",
			systemPrompt: match[2].trim(),
			file: filePath,
		};
	} catch {
		return null;
	}
}

function scanAgentDirs(cwd: string): AgentDef[] {
	const dirs = [
		join(cwd, "agents"),
		join(cwd, ".claude", "agents"),
		join(cwd, ".pi", "agents"),
		join(homedir(), ".pi", "agent", "agents"),  // global Pi agent dir
	];

	// Expand base dirs to include one level of subdirectories
	const expandedDirs: string[] = [];
	for (const base of dirs) {
		expandedDirs.push(base);
		if (!existsSync(base)) continue;
		try {
			for (const entry of readdirSync(base, { withFileTypes: true })) {
				if (entry.isDirectory()) {
					expandedDirs.push(join(base, entry.name));
				}
			}
		} catch {}
	}

	const agents: AgentDef[] = [];
	const seen = new Set<string>();

	for (const dir of expandedDirs) {
		if (!existsSync(dir)) continue;
		try {
			for (const file of readdirSync(dir)) {
				if (!file.endsWith(".md")) continue;
				const fullPath = resolve(dir, file);
				const def = parseAgentFile(fullPath);
				if (def && !seen.has(def.name.toLowerCase())) {
					seen.add(def.name.toLowerCase());
					agents.push(def);
				}
			}
		} catch {}
	}

	return agents;
}

// ── Dispatcher Guide Loader ──────────────────────

function loadDispatcherGuide(cwd: string): string {
	const paths = [
		join(cwd, ".pi", "agents", "dispatcher.md"),
		join(homedir(), ".pi", "agent", "agents", "dispatcher.md"),
	];
	for (const p of paths) {
		if (!existsSync(p)) continue;
		try {
			const raw = readFileSync(p, "utf-8");
			// Strip YAML frontmatter if present
			const match = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
			return match ? match[1].trim() : raw.trim();
		} catch {}
	}
	return "";
}

// ── Extension ────────────────────────────────────

export default function (pi: ExtensionAPI) {
	agentStates.clear();
	let allAgentDefs: AgentDef[] = [];
	let teams: Record<string, string[]> = {};
	let teamMeta: Record<string, TeamMeta> = {};
	let activeTeamName = "";
	const _savedPrefs = loadPreferences();
	let gridCols = 2;
	let savedGridCols: number | undefined = _savedPrefs.gridCols;
	let viewMode: ViewMode = _savedPrefs.viewMode ?? "cards";
	let widgetCtx: any;
	let sessionDir = "";
	let contextWindow = 0;
	let dispatcherGuide = "";

	function loadAgents(cwd: string) {
		// Create session storage dir
		sessionDir = join(cwd, ".pi", "agent-sessions");
		if (!existsSync(sessionDir)) {
			mkdirSync(sessionDir, { recursive: true });
		}

		// Load all agent definitions
		allAgentDefs = scanAgentDirs(cwd);

		// Discover folder-based teams first (same path basis pattern as scanAgentDirs)
		const folderSearchPaths = [
			join(cwd, "agents"),
			join(cwd, "agent", "agents"),
			join(cwd, ".claude", "agents"),
			join(cwd, ".pi", "agents"),
			join(homedir(), ".pi", "agent", "agents"),
		];
		teamMeta = scanTeamFolders(folderSearchPaths);
		teams = {};
		for (const name of Object.keys(teamMeta)) {
			teams[name] = teamMeta[name].agents;
		}

		// Fall back to teams.yaml for unmigrated teams
		const teamsPath = existsSync(join(cwd, ".pi", "agents", "teams.yaml"))
			? join(cwd, ".pi", "agents", "teams.yaml")
			: join(homedir(), ".pi", "agent", "agents", "teams.yaml");
		if (existsSync(teamsPath)) {
			try {
				const yamlTeams = parseTeamsYaml(readFileSync(teamsPath, "utf-8"));
				for (const [name, members] of Object.entries(yamlTeams)) {
					if (!teams[name]) {
						teams[name] = members;
						teamMeta[name] = {
							name,
							agents: members,
							dispatcher: "",
							brief: "",
							source: "yaml",
							dir: "",
						};
					}
				}
			} catch {}
		}

		// If no teams defined, create a default "all" team
		if (Object.keys(teams).length === 0) {
			teams = { all: allAgentDefs.map(d => d.name) };
		}

		// Load dispatcher guide
		dispatcherGuide = loadDispatcherGuide(cwd);
	}

	function activateTeam(teamName: string) {
		activeTeamName = teamName;
		activeTeamDir = teamMeta[teamName]?.dir || "";
		const members = teams[teamName] || [];
		const defsByName = new Map(allAgentDefs.map(d => [d.name.toLowerCase(), d]));

		agentStates.clear();
		for (const member of members) {
			const def = defsByName.get(member.toLowerCase());
			if (!def) continue;
			const key = def.name.toLowerCase().replace(/\s+/g, "-");
			const sessionFile = join(sessionDir, `${key}.json`);
			agentStates.set(key, {
				def,
				status: "idle",
				task: "",
				toolCount: 0,
				elapsed: 0,
				lastWork: "",
				contextPct: 0,
				sessionFile: existsSync(sessionFile) ? sessionFile : null,
				runCount: 0,
			});
		}

		// Use saved grid preference if available; otherwise auto-size
		if (savedGridCols !== undefined) {
			gridCols = savedGridCols;
		} else {
			autoSizeGrid();
		}
	}

	function autoSizeGrid() {
		const size = agentStates.size;
		gridCols = size <= 3 ? size : size === 4 ? 2 : 3;
	}

	// ── Card Rendering (original bordered grid) ──

	function renderCard(state: AgentState, colWidth: number, theme: any): string[] {
		const w = colWidth - 2;
		const truncate = (s: string, max: number) => s.length > max ? s.slice(0, max - 3) + "..." : s;

		const statusColor = state.status === "idle" ? "dim"
			: state.status === "running" ? "accent"
			: state.status === "done" ? "success" : "error";
		const statusIcon = state.status === "idle" ? "○"
			: state.status === "running" ? "●"
			: state.status === "done" ? "✓" : "✗";

		const name = displayName(state.def.name);
		const nameStr = theme.fg("accent", theme.bold(truncate(name, w)));
		const nameVisible = Math.min(name.length, w);

		const statusStr = `${statusIcon} ${state.status}`;
		const timeStr = state.status !== "idle" ? ` ${Math.round(state.elapsed / 1000)}s` : "";
		const agentKey = state.def.name.toLowerCase().replace(/\s+/g, "-");
		const msgCount = agentMessageCounts.get(agentKey) || 0;
		const hasPending = Array.from(activeRequests.values()).some(r => r.from_agent === agentKey);
		const commsParts: string[] = [];
		if (msgCount > 0) commsParts.push(`💬${msgCount}`);
		if (hasPending) commsParts.push("⏳");
		if (activeTeamDir) {
			const slug = state.def.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
			if (existsSync(join(activeTeamDir, "expertise", `${slug}.md`))) commsParts.push("📚");
			const notesPath = join(activeTeamDir, "session-notes", `${slug}.jsonl`);
			if (existsSync(notesPath)) {
				try {
					const noteCount = readFileSync(notesPath, "utf-8").split("\n").filter(l => l.trim()).length;
					if (noteCount > 0) commsParts.push(`📝${noteCount}`);
				} catch {}
			}
		}
		const commsStr = commsParts.length > 0 ? `  ${commsParts.join(" ")}` : "";
		const statusLine = theme.fg(statusColor, statusStr + timeStr + commsStr);
		const statusVisible = statusStr.length + timeStr.length + commsStr.length;

		// Context bar: 5 blocks + percent
		const filled = Math.ceil(state.contextPct / 20);
		const bar = "#".repeat(filled) + "-".repeat(5 - filled);
		const ctxStr = `[${bar}] ${Math.ceil(state.contextPct)}%`;
		const ctxLine = theme.fg("dim", ctxStr);
		const ctxVisible = ctxStr.length;

		const workRaw = state.task
			? (state.lastWork || state.task)
			: state.def.description;
		const workText = truncate(workRaw, Math.min(50, w - 1));
		const workLine = theme.fg("muted", workText);
		const workVisible = workText.length;

		const top = "┌" + "─".repeat(w) + "┐";
		const bot = "└" + "─".repeat(w) + "┘";
		const border = (content: string, visLen: number) =>
			theme.fg("dim", "│") + content + " ".repeat(Math.max(0, w - visLen)) + theme.fg("dim", "│");

		return [
			theme.fg("dim", top),
			border(" " + nameStr, 1 + nameVisible),
			border(" " + statusLine, 1 + statusVisible),
			border(" " + ctxLine, 1 + ctxVisible),
			border(" " + workLine, 1 + workVisible),
			theme.fg("dim", bot),
		];
	}

	// ── Compact Rendering (grid of 1-line tiles) ──

	function renderCompactTile(state: AgentState, colWidth: number, theme: any): string {
		// Status icon & theme color by state
		const statusColor = state.status === "idle" ? "dim"
			: state.status === "running" ? "accent"
			: state.status === "done" ? "success" : "error";
		const statusIcon = state.status === "idle" ? "○"
			: state.status === "running" ? "●"
			: state.status === "done" ? "✓" : "✗";

		// Background tint based on status (theme-native tokens)
		const bgToken = state.status === "running" ? "selectedBg"
			: state.status === "done" ? "toolSuccessBg"
			: state.status === "error" ? "toolErrorBg"
			: "toolPendingBg";

		const name = displayName(state.def.name);

		// ── Right-side stats (built plain first to measure) ──
		const parts: string[] = [];
		const agentKey = state.def.name.toLowerCase().replace(/\s+/g, "-");
		const msgCount = agentMessageCounts.get(agentKey) || 0;
		const hasPending = Array.from(activeRequests.values()).some(r => r.from_agent === agentKey);

		if (msgCount > 0) parts.push(`💬${msgCount}`);
		if (hasPending) parts.push("⏳");
		if (activeTeamDir) {
			const slug = state.def.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
			if (existsSync(join(activeTeamDir, "expertise", `${slug}.md`))) parts.push("📚");
			const notesPath = join(activeTeamDir, "session-notes", `${slug}.jsonl`);
			if (existsSync(notesPath)) {
				try {
					const noteCount = readFileSync(notesPath, "utf-8").split("\n").filter(l => l.trim()).length;
					if (noteCount > 0) parts.push(`📝${noteCount}`);
				} catch {}
			}
		}

		// Runs (only if agent has been dispatched)
		if (state.runCount > 0) parts.push(`#${state.runCount}`);

		// Elapsed time (non-idle only)
		if (state.status !== "idle") {
			const secs = Math.round(state.elapsed / 1000);
			if (secs >= 60) {
				parts.push(`${Math.floor(secs / 60)}m${(secs % 60).toString().padStart(2, "0")}s`);
			} else {
				parts.push(`${secs}s`);
			}
		}

		// Tool calls (non-idle with work done)
		if (state.toolCount > 0) parts.push(`⚙${state.toolCount}`);

		// Context usage (non-idle or if context is populated)
		if (state.contextPct > 0) {
			if (contextWindow > 0) {
				const tokensK = Math.round(state.contextPct / 100 * contextWindow / 1000);
				parts.push(`${tokensK}k`);
			} else {
				parts.push(`${Math.ceil(state.contextPct)}%`);
			}
		}

		const statsPlain = parts.length > 0 ? parts.join(" ") : "";

		// ── Measure & layout ──
		// Target:  " ● Name·····stats "  (padded to colWidth)
		const iconW = 2;     // "● " or "○ "
		const padL = 1;      // leading space
		const padR = 1;      // trailing space
		const statsW = visibleWidth(statsPlain);
		const gapMin = 1;    // minimum gap between name and stats
		const chrome = padL + iconW + gapMin + statsW + padR;
		const nameMax = Math.max(4, colWidth - chrome);
		const truncName = truncateToWidth(name, nameMax, "…");
		const truncNameW = visibleWidth(truncName);
		const innerUsed = padL + iconW + truncNameW + statsW + padR;
		const fill = Math.max(gapMin, colWidth - innerUsed);

		// ── Assemble styled content ──
		const content =
			" " +
			theme.fg(statusColor, statusIcon) + " " +
			theme.fg(state.status === "idle" ? "muted" : "accent", state.status === "idle" ? truncName : theme.bold(truncName)) +
			" ".repeat(fill) +
			theme.fg("dim", statsPlain) +
			" ";

		// Apply background tint across the full tile width, then truncate to be safe
		const padded = truncateToWidth(content, colWidth);
		// Pad to exact colWidth so the bg spans the full tile
		const currentW = visibleWidth(padded);
		const rightPad = Math.max(0, colWidth - currentW);
		return theme.bg(bgToken, padded + " ".repeat(rightPad));
	}

	function renderCompact(width: number, theme: any): string[] {
		const agents = Array.from(agentStates.values());
		if (agents.length === 0) {
			return [theme.fg("dim", "No agents found. Add .md files to agents/")];
		}

		const cols = Math.min(gridCols, agents.length);
		const gap = 1;
		const colWidth = Math.floor((width - gap * (cols - 1)) / cols);
		const lines: string[] = [];

		for (let i = 0; i < agents.length; i += cols) {
			const row = agents.slice(i, i + cols);
			const tiles = row.map(a => renderCompactTile(a, colWidth, theme));

			// Pad last row if fewer agents than columns
			while (tiles.length < cols) {
				tiles.push(" ".repeat(colWidth));
			}

			lines.push(tiles.join(" ".repeat(gap)));
		}

		return lines;
	}

	// ── Widget Update (dispatches to view mode) ──

	function updateWidget() {
		if (!widgetCtx) return;

		widgetCtx.ui.setWidget("agent-team", (_tui: any, theme: any) => {
			// Cards mode uses paddingY 1 (original behavior); compact uses 0
			const text = new Text("", 0, viewMode === "cards" ? 1 : 0);

			return {
				render(width: number): string[] {
					if (viewMode === "compact") {
						const compactLines = renderCompact(width, theme);
						text.setText(compactLines.join("\n"));
						return text.render(width);
					}

					// ── Cards mode (original grid) ──
					if (agentStates.size === 0) {
						text.setText(theme.fg("dim", "No agents found. Add .md files to agents/"));
						return text.render(width);
					}

					const cols = Math.min(gridCols, agentStates.size);
					const gap = 1;
					const colWidth = Math.floor((width - gap * (cols - 1)) / cols);
					const agents = Array.from(agentStates.values());
					const rows: string[][] = [];

					for (let i = 0; i < agents.length; i += cols) {
						const rowAgents = agents.slice(i, i + cols);
						const cards = rowAgents.map(a => renderCard(a, colWidth, theme));

						while (cards.length < cols) {
							cards.push(Array(6).fill(" ".repeat(colWidth)));
						}

						const cardHeight = cards[0].length;
						for (let line = 0; line < cardHeight; line++) {
							rows.push(cards.map(card => card[line] || ""));
						}
					}

					const output = rows.map(cols => cols.join(" ".repeat(gap)));
					text.setText(output.join("\n"));
					return text.render(width);
				},
				invalidate() {
					text.invalidate();
				},
			};
		});
	}

	// ── Dispatch Agent (returns Promise) ─────────

	function dispatchAgent(
		agentName: string,
		task: string,
		ctx: any,
	): Promise<{ output: string; exitCode: number; elapsed: number }> {
		const key = agentName.toLowerCase().replace(/\s+/g, "-");
		const state = agentStates.get(key);
		if (!state) {
			return Promise.resolve({
				output: `Agent "${agentName}" not found. Available: ${Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`,
				exitCode: 1,
				elapsed: 0,
			});
		}

		if (state.status === "running") {
			return Promise.resolve({
				output: `Agent "${displayName(state.def.name)}" is already running. Wait for it to finish.`,
				exitCode: 1,
				elapsed: 0,
			});
		}

		state.status = "running";
		state.task = task;
		state.toolCount = 0;
		state.elapsed = 0;
		state.lastWork = "";
		state.runCount++;
		updateWidget();

		const startTime = Date.now();
		state.timer = setInterval(() => {
			state.elapsed = Date.now() - startTime;
			updateWidget();
		}, 1000);

		const model = state.def.model
			|| (ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : "openrouter/google/gemini-3-flash-preview");

		// Session file for this agent
		const agentKey = state.def.name.toLowerCase().replace(/\s+/g, "-");
		const agentSessionFile = join(sessionDir, `${agentKey}.json`);

		// Build args — first run creates session, subsequent runs resume
		const teamRoster = Array.from(agentStates.values())
			.map(s => `- ${s.def.name}: ${s.def.description}`)
			.join("\n");
		const teamRosterBlock = `## Your Team\nYou are ${state.def.name} on a team with:\n${teamRoster}\n\n## Team Communication\nYou have two tools for team communication:\n- post_to_channel: Share discoveries, decisions, warnings, or disagreements with the team\n- request_input: Ask a specific teammate a question and wait for their response`;
		const allMessages = readChannelMessages(ctx.cwd);
		const curated = curateMessagesForAgent(allMessages, agentKey);
		const curatedMessagesBlock = formatCuratedMessages(curated);
		const contextContent = readContextFile(activeTeamDir);
		const contextBlock = formatContextBlock(contextContent);
		const expertiseContent = readExpertiseFile(activeTeamDir, agentKey);
		const expertiseBlock = formatExpertiseBlock(expertiseContent);
		const sessionNotes = readSessionNotes(activeTeamDir, agentKey);
		const sessionNotesBlock = formatSessionNotesBlock(sessionNotes);

		const combinedPrompt = `${contextBlock}${teamRosterBlock}${curatedMessagesBlock}${expertiseBlock}\n\n${state.def.systemPrompt}${sessionNotesBlock}`;
		const promptFile = join(tmpdir(), `pi-team-comms-prompt-${agentKey}-${randomUUID()}.txt`);
		writeFileSync(promptFile, combinedPrompt, "utf-8");

		const args = [
			"--mode", "json",
			"-p",
			"--no-extensions", "-e", resolve(homedir(), ".pi/agent/extensions/team-comms.ts"),
			"--model", model,
			"--tools", state.def.tools,
			"--thinking", "off",
			"--append-system-prompt", promptFile,
			"--session", agentSessionFile,
		];

		// Continue existing session if we have one
		if (state.sessionFile) {
			args.push("-c");
		}

		args.push(task);

		const textChunks: string[] = [];

		return new Promise((resolvePromise) => {
			const proc = spawn("pi", args, {
				stdio: ["ignore", "pipe", "pipe"],
				env: {
					...process.env,
					PI_AGENT_NAME: agentKey,
					PI_TEAM_COMMS_DIR: resolve(ctx.cwd, COMMS_DIR_NAME),
					PI_TEAM_DIR: activeTeamDir,
				},
			});

			let buffer = "";

			proc.stdout!.setEncoding("utf-8");
			proc.stdout!.on("data", (chunk: string) => {
				buffer += chunk;
				const lines = buffer.split("\n");
				buffer = lines.pop() || "";
				for (const line of lines) {
					if (!line.trim()) continue;
					try {
						const event = JSON.parse(line);
						if (event.type === "message_update") {
							const delta = event.assistantMessageEvent;
							if (delta?.type === "text_delta") {
								textChunks.push(delta.delta || "");
								const full = textChunks.join("");
								const last = full.split("\n").filter((l: string) => l.trim()).pop() || "";
								state.lastWork = last;
								updateWidget();
							}
						} else if (event.type === "tool_execution_start") {
							state.toolCount++;
							updateWidget();
						} else if (event.type === "message_end") {
							const msg = event.message;
							if (msg?.usage && contextWindow > 0) {
								state.contextPct = ((msg.usage.input || 0) / contextWindow) * 100;
								updateWidget();
							}
						} else if (event.type === "agent_end") {
							const msgs = event.messages || [];
							const last = [...msgs].reverse().find((m: any) => m.role === "assistant");
							if (last?.usage && contextWindow > 0) {
								state.contextPct = ((last.usage.input || 0) / contextWindow) * 100;
								updateWidget();
							}
						}
					} catch {}
				}
			});

			proc.stderr!.setEncoding("utf-8");
			proc.stderr!.on("data", () => {});

			proc.on("close", (code) => {
				try { unlinkSync(promptFile); } catch {}
				if (buffer.trim()) {
					try {
						const event = JSON.parse(buffer);
						if (event.type === "message_update") {
							const delta = event.assistantMessageEvent;
							if (delta?.type === "text_delta") textChunks.push(delta.delta || "");
						}
					} catch {}
				}

				clearInterval(state.timer);
				state.elapsed = Date.now() - startTime;
				state.status = code === 0 ? "done" : "error";

				// Mark session file as available for resume
				if (code === 0) {
					state.sessionFile = agentSessionFile;
				}

				const full = textChunks.join("");
				state.lastWork = full.split("\n").filter((l: string) => l.trim()).pop() || "";
				updateWidget();

				ctx.ui.notify(
					`${displayName(state.def.name)} ${state.status} in ${Math.round(state.elapsed / 1000)}s`,
					state.status === "done" ? "success" : "error"
				);

				resolvePromise({
					output: full,
					exitCode: code ?? 1,
					elapsed: state.elapsed,
				});
			});

			proc.on("error", (err) => {
				clearInterval(state.timer);
				state.status = "error";
				state.lastWork = `Error: ${err.message}`;
				updateWidget();
				resolvePromise({
					output: `Error spawning agent: ${err.message}`,
					exitCode: 1,
					elapsed: Date.now() - startTime,
				});
			});
		});
	}

	// ── dispatch_agent Tool (registered at top level) ──

	pi.registerTool({
		name: "dispatch_agent",
		label: "Dispatch Agent",
		description: "Dispatch a task to a specialist agent. The agent will execute the task and return the result. Use the system prompt to see available agent names.",
		parameters: Type.Object({
			agent: Type.String({ description: "Agent name (case-insensitive)" }),
			task: Type.String({ description: "Task description for the agent to execute" }),
		}),

		async execute(_toolCallId, params, _signal, onUpdate, ctx) {
			const { agent, task } = params as { agent: string; task: string };

			try {
				if (onUpdate) {
					onUpdate({
						content: [{ type: "text", text: `Dispatching to ${agent}...` }],
						details: { agent, task, status: "dispatching" },
					});
				}

				const result = await dispatchAgent(agent, task, ctx);

				const truncated = result.output.length > 8000
					? result.output.slice(0, 8000) + "\n\n... [truncated]"
					: result.output;

				const status = result.exitCode === 0 ? "done" : "error";
				const summary = `[${agent}] ${status} in ${Math.round(result.elapsed / 1000)}s`;

				return {
					content: [{ type: "text", text: `${summary}\n\n${truncated}` }],
					details: {
						agent,
						task,
						status,
						elapsed: result.elapsed,
						exitCode: result.exitCode,
						fullOutput: result.output,
					},
				};
			} catch (err: any) {
				return {
					content: [{ type: "text", text: `Error dispatching to ${agent}: ${err?.message || err}` }],
					details: { agent, task, status: "error", elapsed: 0, exitCode: 1, fullOutput: "" },
				};
			}
		},

		renderCall(args, theme) {
			const agentName = (args as any).agent || "?";
			const task = (args as any).task || "";
			const preview = task.length > 60 ? task.slice(0, 57) + "..." : task;
			return new Text(
				theme.fg("toolTitle", theme.bold("dispatch_agent ")) +
				theme.fg("accent", agentName) +
				theme.fg("dim", " — ") +
				theme.fg("muted", preview),
				0, 0,
			);
		},

		renderResult(result, options, theme) {
			const details = result.details as any;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			// Streaming/partial result while agent is still running
			if (options.isPartial || details.status === "dispatching") {
				return new Text(
					theme.fg("accent", `● ${details.agent || "?"}`) +
					theme.fg("dim", " working..."),
					0, 0,
				);
			}

			const icon = details.status === "done" ? "✓" : "✗";
			const color = details.status === "done" ? "success" : "error";
			const elapsed = typeof details.elapsed === "number" ? Math.round(details.elapsed / 1000) : 0;
			const header = theme.fg(color, `${icon} ${details.agent}`) +
				theme.fg("dim", ` ${elapsed}s`);

			if (options.expanded && details.fullOutput) {
				const output = details.fullOutput.length > 4000
					? details.fullOutput.slice(0, 4000) + "\n... [truncated]"
					: details.fullOutput;
				return new Text(header + "\n" + theme.fg("muted", output), 0, 0);
			}

			return new Text(header, 0, 0);
		},
	});

	// ── Commands ─────────────────────────────────

	pi.registerCommand("agents-team", {
		description: "Select a team to work with",
		handler: async (_args, ctx) => {
			widgetCtx = ctx;
			const teamNames = Object.keys(teams);
			if (teamNames.length === 0) {
				ctx.ui.notify("No teams defined — add team folders to agents/teams/ or define in teams.yaml", "warning");
				return;
			}

			const options = teamNames.map(name => {
				const members = teams[name].map(m => displayName(m));
				return `${name} — ${members.join(", ")}`;
			});

			const choice = await ctx.ui.select("Select Team", options);
			if (choice === undefined) return;

			const idx = options.indexOf(choice);
			const name = teamNames[idx];
			activateTeam(name);
			updateWidget();
			ctx.ui.setStatus("agent-team", `Team: ${name} (${agentStates.size})`);
			ctx.ui.notify(`Team: ${name} — ${Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ")}`, "info");
		},
	});

	pi.registerCommand("agents-list", {
		description: "List all loaded agents",
		handler: async (_args, _ctx) => {
			widgetCtx = _ctx;
			const names = Array.from(agentStates.values())
				.map(s => {
					const session = s.sessionFile ? "resumed" : "new";
					return `${displayName(s.def.name)} (${s.status}, ${session}, runs: ${s.runCount}): ${s.def.description}`;
				})
				.join("\n");
			_ctx.ui.notify(names || "No agents loaded", "info");
		},
	});

	pi.registerCommand("agents-grid", {
		description: "Set grid columns: /agents-grid <1-6|auto>",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items: AutocompleteItem[] = [
				...["1", "2", "3", "4", "5", "6"].map(n => ({
					value: n,
					label: `${n} columns`,
				})),
				{ value: "auto", label: "auto — size by team" },
			];
			const filtered = items.filter(i => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, _ctx) => {
			widgetCtx = _ctx;
			const arg = (args ?? "").trim().toLowerCase();

			if (arg === "auto") {
				savedGridCols = undefined;
				savePreferences({}, ["gridCols"]);
				autoSizeGrid();
				_ctx.ui.notify(`Grid set to auto (${gridCols} columns)`, "info");
				updateWidget();
				return;
			}

			const n = parseInt(arg, 10);
			if (n >= 1 && n <= 6) {
				gridCols = n;
				savedGridCols = n;
				savePreferences({ gridCols: n });
				_ctx.ui.notify(`Grid set to ${gridCols} columns`, "info");
				updateWidget();
			} else {
				_ctx.ui.notify("Usage: /agents-grid <1-6|auto>", "error");
			}
		},
	});

	pi.registerCommand("agents-view", {
		description: "Switch widget view: /agents-view <compact|cards|toggle>",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const items: AutocompleteItem[] = [
				{ value: "compact", label: "compact — one-line-per-agent, idle collapsed" },
				{ value: "cards",   label: "cards — bordered card grid (original)" },
				{ value: "toggle",  label: "toggle — switch between compact and cards" },
			];
			const filtered = items.filter(i => i.value.startsWith(prefix));
			return filtered.length > 0 ? filtered : items;
		},
		handler: async (args, _ctx) => {
			widgetCtx = _ctx;
			const arg = (args ?? "").trim().toLowerCase();

			if (arg === "compact") {
				viewMode = "compact";
			} else if (arg === "cards") {
				viewMode = "cards";
			} else if (arg === "toggle" || arg === "") {
				viewMode = viewMode === "cards" ? "compact" : "cards";
			} else {
				_ctx.ui.notify("Usage: /agents-view <compact|cards|toggle>", "error");
				return;
			}

			savePreferences({ viewMode });
			updateWidget();
			_ctx.ui.notify(`View: ${viewMode}`, "info");
		},
	});

	pi.registerCommand("agents-comms", {
		description: "Show team channel history and active requests",
		handler: async (_args, ctx) => {
			const messages = readChannelMessages(ctx.cwd);
			const recent = messages.slice(-20);
			const iconByType: Record<string, string> = {
				discovery: "🔍",
				decision: "✅",
				warning: "⚠️",
				question: "❓",
				disagreement: "🔴",
			};

			const lines: string[] = [];
			if (recent.length > 0) {
				lines.push("Recent channel messages:");
				for (const m of recent) {
					const icon = iconByType[m.message_type] || "💬";
					lines.push(`${icon} ${m.from_agent} (${m.message_type}): ${m.content}`);
				}
			}

			const pending = Array.from(activeRequests.values());
			if (pending.length > 0) {
				if (lines.length > 0) lines.push("");
				lines.push("Active requests:");
				for (const req of pending) {
					lines.push(`⏳ ${req.from_agent} → ${req.to_agent}: ${req.question}`);
				}
			}

			if (lines.length === 0) {
				ctx.ui.notify("No team comms activity yet", "info");
				return;
			}

			ctx.ui.notify(lines.join("\n"), "info");
		},
	});

	// ── System Prompt Override ───────────────────

	pi.on("before_agent_start", async (_event, _ctx) => {
		// Build dynamic agent catalog from active team only
		const agentCatalog = Array.from(agentStates.values())
			.map(s => {
				const slug = s.def.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
				const hasExpertise = activeTeamDir && existsSync(join(activeTeamDir, "expertise", `${slug}.md`));
				const expertiseNote = hasExpertise ? "\n**Has expertise file:** yes" : "";
				return `### ${displayName(s.def.name)}\n**Dispatch as:** \`${s.def.name}\`\n${s.def.description}\n**Tools:** ${s.def.tools}${expertiseNote}`;
			})
			.join("\n\n");

		const teamMembers = Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ");

		const activeMeta = teamMeta[activeTeamName];
		const activeDispatcher = activeMeta?.dispatcher?.trim() ? activeMeta.dispatcher : dispatcherGuide;
		const briefSection = activeMeta?.brief?.trim()
			? `\n## Team Brief\n\n${activeMeta.brief.trim()}\n`
			: "";
		const guideSection = activeDispatcher?.trim()
			? `\n## Dispatcher Guide\n\n${activeDispatcher.trim()}\n`
			: "";

		return {
			systemPrompt: `You are a dispatcher agent. You coordinate specialist agents to accomplish tasks.
You do NOT have direct access to the codebase. You MUST delegate all work through
agents using the dispatch_agent tool.

## Active Team: ${activeTeamName}
Members: ${teamMembers}
You can ONLY dispatch to agents listed below. Do not attempt to dispatch to agents outside this team.

## How to Work
- Analyze the user's request and break it into clear sub-tasks
- Choose the right agent(s) for each sub-task
- Dispatch tasks using the dispatch_agent tool
- Review results and dispatch follow-up agents if needed
- If a task fails, try a different agent or adjust the task description
- Summarize the outcome for the user

## Rules
- NEVER try to read, write, or execute code directly — you have no such tools
- ALWAYS use dispatch_agent to get work done
- You can chain agents: use scout to explore, then builder to implement
- You can dispatch the same agent multiple times with different tasks
- Keep tasks focused — one clear objective per dispatch
${briefSection}${guideSection}
## Agents

${agentCatalog}`,
		};
	});

	// ── Session Start ────────────────────────────

	pi.on("session_start", async (_event, _ctx) => {
		applyExtensionDefaults(import.meta.url, _ctx);
		// Clear widgets from previous session
		if (widgetCtx) {
			widgetCtx.ui.setWidget("agent-team", undefined);
		}
		widgetCtx = _ctx;
		contextWindow = _ctx.model?.contextWindow || 0;

		// Wipe old agent session files so subagents start fresh
		const sessDir = join(_ctx.cwd, ".pi", "agent-sessions");
		if (existsSync(sessDir)) {
			for (const f of readdirSync(sessDir)) {
				if (f.endsWith(".json")) {
					try { unlinkSync(join(sessDir, f)); } catch {}
				}
			}
		}

		stopRequestWatcher();

		const commsDir = resolve(_ctx.cwd, COMMS_DIR_NAME);
		const requestsDir = join(commsDir, COMMS_REQUESTS_DIR);
		const responsesDir = join(commsDir, COMMS_RESPONSES_DIR);
		mkdirSync(commsDir, { recursive: true });
		mkdirSync(requestsDir, { recursive: true });
		mkdirSync(responsesDir, { recursive: true });
		const channelFile = join(commsDir, COMMS_CHANNEL_FILE);
		if (existsSync(channelFile)) {
			try { unlinkSync(channelFile); } catch {}
		}
		for (const dir of [requestsDir, responsesDir]) {
			if (!existsSync(dir)) continue;
			for (const f of readdirSync(dir)) {
				if (f.endsWith(".json")) {
					try { unlinkSync(join(dir, f)); } catch {}
				}
			}
		}

		loadAgents(_ctx.cwd);

		// Default to first team — use /agents-team to switch
		const teamNames = Object.keys(teams);
		if (teamNames.length > 0) {
			activateTeam(teamNames[0]);
		}

		// Start request watcher for team communication
		startRequestWatcher(_ctx.cwd, _ctx);

		// Lock down to dispatcher-only (tool already registered at top level)
		pi.setActiveTools(["dispatch_agent"]);

		_ctx.ui.setStatus("agent-team", `Team: ${activeTeamName} (${agentStates.size})`);
		const members = Array.from(agentStates.values()).map(s => displayName(s.def.name)).join(", ");
		const folderTeams = Object.keys(teamMeta).filter((n) => teamMeta[n]?.source === "folder");
		const yamlTeams = Object.keys(teams).filter((n) => teamMeta[n]?.source === "yaml");
		const sourceInfo = [
			folderTeams.length > 0 ? `Folder teams: ${folderTeams.join(", ")}` : "",
			yamlTeams.length > 0 ? `YAML teams: ${yamlTeams.join(", ")}` : "",
		].filter(Boolean).join(" | ");
		_ctx.ui.notify(
			`Team: ${activeTeamName} (${members})\n` +
			`Team sets loaded from: ${sourceInfo || "none"}\n\n` +
			`/agents-team          Select a team\n` +
			`/agents-list          List active agents and status\n` +
			`/agents-grid <1-6|auto> Set grid column count\n` +
			`/agents-view <mode>   Switch view: compact|cards|toggle`,
			"info",
		);
		updateWidget();

		// Footer: model | team | context bar
		_ctx.ui.setFooter((_tui, theme, _footerData) => ({
			dispose: () => {},
			invalidate() {},
			render(width: number): string[] {
				const model = _ctx.model?.id || "no-model";
				const usage = _ctx.getContextUsage();
				const pct = usage?.percent ?? 0;
				const filled = Math.round(pct / 10);
				const bar = "#".repeat(filled) + "-".repeat(10 - filled);

				const left = theme.fg("dim", ` ${model}`) +
					theme.fg("muted", " · ") +
					theme.fg("accent", activeTeamName);
				const right = theme.fg("dim", `[${bar}] ${Math.round(pct)}% `);
				const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));

				return [truncateToWidth(left + pad + right, width)];
			},
		}));
	});

  // Clean up request watcher on process exit
  process.on("exit", () => { stopRequestWatcher(); });
}
